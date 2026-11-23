// Lot 9k — Achat d'armes sur la carte (js/core/armes/achat.js) : caisses, caisse proche, état du message, achat, rachat, refus ; données de la carte.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { acheter, caisseActive, caisseProche, distanceCaisse, etatAchat, lireCaisses, prixArme } from '../../js/core/armes/achat.js';
import { lireTable } from '../../js/core/armes/partie.js';
import { creerInventaire, recharger, tirer } from '../../js/core/armes/inventaire.js';

const json = (f) => JSON.parse(readFileSync(f, 'utf8'));
const table = lireTable(json('data/game/armes-partie.json'));
const fichier = json('data/game/maps/rez-de-chaussee/caisses-armes.json');
const caisses = lireCaisses(fichier);
const pompe = caisses.find((c) => c.arme === 'winchester1897');
const devant = { x: pompe.x - 40, y: pompe.y + pompe.h / 2 };

describe('caisses de la carte 1 (caisses-armes.json)', () => {
  it('trois caisses, une par pièce qui s\'ouvre, chacune pour une arme utilisable de la table, 70 × 30 contre un mur', () => {
    expect(caisses.map((c) => [c.piece, c.arme])).toEqual([['aile', 'winchester1897'], ['etage-gauche', 'kar98k'], ['etage-droite', 'thompson']]);
    for (const c of caisses) {
      expect(table.actives).toContain(c.arme);
      expect([c.w, c.h].sort((a, b) => a - b)).toEqual([30, 70]);
    }
    const rdc = json('data/game/maps/rez-de-chaussee/world.json').obstacles;
    const etage = json('data/game/maps/rez-de-chaussee/etage.world.json').obstacles;
    for (const c of caisses) {
      const o = (c.floor === 'etage' ? etage : rdc).find((q) => q.id === c.id);
      expect(o, c.id).toMatchObject({ kind: 'caisse-arme', x: c.x, y: c.y, w: c.w, h: c.h, hauteur: 22 });
    }
  });
  it('entrées invalides ignorées ; données jamais modifiées', () => {
    const avant = JSON.stringify(fichier);
    expect(lireCaisses({ caisses: [{ id: 'x' }, null, { id: 'y', arme: 'kar98k', x: 0, y: 0, w: 0, h: 10 }] })).toEqual([]);
    expect(lireCaisses(null)).toEqual([]);
    lireCaisses(fichier);
    expect(JSON.stringify(fichier)).toBe(avant);
  });
});

describe('caisse proche et active', () => {
  it('active seulement quand sa pièce est ouverte (ou débogage « armes ouvertes »)', () => {
    expect(caisseActive(pompe, ['depart'])).toBe(false);
    expect(caisseActive(pompe, ['depart', 'aile'])).toBe(true);
    expect(caisseActive(pompe, ['depart'], true)).toBe(true);
  });
  it('à deux cases (120) du rectangle, à l\'étage du joueur, la plus proche', () => {
    expect(distanceCaisse(pompe, pompe.x + 5, pompe.y + 5)).toBe(0);
    expect(caisseProche(caisses, devant, 'rdc', ['aile'])?.id).toBe(pompe.id);
    expect(caisseProche(caisses, devant, 'etage', ['aile'])).toBeNull();
    expect(caisseProche(caisses, devant, 'rdc', ['depart'])).toBeNull();
    expect(caisseProche(caisses, { x: pompe.x - 121, y: pompe.y + 10 }, 'rdc', ['aile'])).toBeNull();
    expect(caisseProche(caisses, { x: pompe.x - 119, y: pompe.y + 10 }, 'rdc', ['aile'])?.id).toBe(pompe.id);
  });
});

describe('achat, rachat, refus', () => {
  const inv0 = creerInventaire(table);
  const { prix, rachat } = prixArme(table, 'winchester1897');
  it('prix et rachat de la table (rachat absent : 35 % du prix, arrondi à 10)', () => {
    expect(prix).toBe(table.armes.winchester1897.prix);
    expect(rachat).toBe(table.armes.winchester1897.rachat ?? Math.round((prix * 0.35) / 10) * 10);
    expect(prixArme({ armes: { a: { prix: 1000 } } }, 'a')).toEqual({ prix: 1000, rachat: 350 });
  });
  it('acheter : l\'arme va dans l\'emplacement acheté, passe en main, pleine ; le Colt ne bouge pas ; données intactes', () => {
    const avant = JSON.stringify(inv0);
    expect(etatAchat({ caisse: pompe, inv: inv0, table, zollars: prix })).toMatchObject({ action: 'acheter', prix, possible: true, manque: 0, refus: null });
    const r = acheter({ caisse: pompe, inv: inv0, table, zollars: prix });
    expect(JSON.stringify(inv0)).toBe(avant);
    expect(r).toMatchObject({ ok: true, cout: prix });
    expect(r.inv.emplacements.map((e) => e.id)).toEqual(['m1911', 'winchester1897']);
    expect(r.inv.emplacements[1]).toMatchObject({ chargeur: table.armes.winchester1897.chargeur, reserve: table.armes.winchester1897.reserve });
    expect(r.inv.actif).toBe(1);
  });
  it('une autre arme achetée remplace la précédente, jamais le Colt', () => {
    const avec = acheter({ caisse: pompe, inv: inv0, table, zollars: 1e6 }).inv;
    const kar = caisses.find((c) => c.arme === 'kar98k');
    const r = acheter({ caisse: kar, inv: { ...avec, sortie: null }, table, zollars: 1e6 });
    expect(r.inv.emplacements.map((e) => e.id)).toEqual(['m1911', 'kar98k']);
  });
  it('pas assez de Zollars : refus avec le manque ; inventaire inchangé', () => {
    const r = acheter({ caisse: pompe, inv: inv0, table, zollars: prix - 300 });
    expect(r).toMatchObject({ ok: false, cout: 0, etat: { refus: 'zollars', manque: 300, possible: false } });
    expect(r.inv).toBe(inv0);
  });
  it('à terre, pendant un rechargement ou un changement d\'arme : refus expliqué', () => {
    expect(etatAchat({ caisse: pompe, inv: inv0, table, zollars: 1e6, debout: false }).refus).toBe('terre');
    let inv = inv0;
    for (let i = 0; i < 3; i += 1) inv = tirer(inv);
    inv = recharger(inv, table).state;
    expect(etatAchat({ caisse: pompe, inv, table, zollars: 1e6 }).refus).toBe('recharge');
    const enSortie = acheter({ caisse: pompe, inv: inv0, table, zollars: 1e6 }).inv;
    expect(etatAchat({ caisse: caisses[1], inv: enSortie, table, zollars: 1e6 }).refus).toBe('changement');
  });
  it('rachat à la même caisse : munitions pleines au prix du rachat ; refusé si déjà pleines', () => {
    let inv = { ...acheter({ caisse: pompe, inv: inv0, table, zollars: 1e6 }).inv, sortie: null };
    expect(etatAchat({ caisse: pompe, inv, table, zollars: 1e6 })).toMatchObject({ action: 'munitions', prix: rachat, refus: 'plein' });
    inv = { ...inv, emplacements: inv.emplacements.map((e) => (e.id === 'winchester1897' ? { ...e, chargeur: 1, reserve: 0 } : e)) };
    const r = acheter({ caisse: pompe, inv, table, zollars: rachat });
    expect(r).toMatchObject({ ok: true, cout: rachat, etat: { action: 'munitions' } });
    expect(r.inv.emplacements[1]).toMatchObject({ chargeur: table.armes.winchester1897.chargeur, reserve: table.armes.winchester1897.reserve });
  });
  it('sans caisse ou arme inconnue : aucun état', () => {
    expect(etatAchat({ caisse: null, inv: inv0, table, zollars: 0 })).toBeNull();
    expect(etatAchat({ caisse: { ...pompe, arme: 'inconnue' }, inv: inv0, table, zollars: 0 })).toBeNull();
  });
});
