// Lot 8h-D : menu gardé dans la progression v2 (js/menu/equipement-etat.js), armes retirées, catalogue militaire, caisses et offres sans arme, toutes
// les raretés tirables, tirage identique à graine égale, état dérivé de zs.save.v2, achats atomiques, outils de débogage limités aux canaux source et dev.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { lireCaisses, lireCosmetiques, lireOffres, objetsDeRarete, offresDuJour, tirer, tirer10, TIRAGES_X10 } from '../../js/core/caisses.js';
import { lireCatalogue, STATS_SURVIE, statistiquesEffectives, TYPES } from '../../js/core/equipement.js';
import { appliquerOps, defaultProgression, solde } from '../../js/core/progression.js';
import { etatDepuis } from '../../js/menu/equipement-etat.js';

const lire = (f) => JSON.parse(readFileSync(f, 'utf8'));
const read = (f) => readFileSync(f, 'utf8');
const { cat: catBase } = lireCatalogue({ raretes: lire('data/menu/raretes.json'), objets: lire('data/menu/objets.json'), personnages: lire('data/menu/personnages.json') });
const cat = { ...catBase, cosmetiques: lireCosmetiques(lire('data/menu/cosmetiques.json'), catBase.raretes) };
const { caisses, erreurs } = lireCaisses(lire('data/menu/caisses.json'), cat);
const PARAMS = lire('data/game/player-stats.json');
const ATTAQUE = ['degats', 'cadence', 'portee', 'precision', 'chutes'];
const params = { save: lire('data/game/save.json'), economy: lire('data/game/economy.json'), stats: PARAMS };

describe('armes retirées du menu', () => {
  it('aucune arme au catalogue (types de survie seulement) ni dans les données de départ ou de démonstration', () => {
    expect([...cat.objets.values()].filter((o) => !TYPES.includes(o.type))).toEqual([]);
    expect(read('data/menu/objets.json')).not.toMatch(/"type": "arme"|pistolet|revolver|couteau/);
    expect(read('data/menu/inventaire-depart.json')).not.toMatch(/pistolet|revolver|couteau|"arme"/);
    expect(TYPES).not.toContain('arme');
  });

  it('caisses d\'équipement valides ; chaque caisse garde toutes ses raretés tirables ; 10 000 tirages par caisse, jamais d\'arme ni de bonus d\'attaque', () => {
    expect(erreurs).toEqual([]);
    const equipement = caisses.filter((c) => c.type === 'equipement');
    expect(equipement.map((c) => c.id)).toEqual(['ravitaillement', 'militaire', 'elite']);
    for (const c of equipement) {
      for (const r of cat.raretes) expect(objetsDeRarete(cat, r.id).length, `${c.id} ${r.id}`).toBeGreaterThan(0);
      expect(c.chances.map((x) => x.rarete)).toEqual(cat.raretes.map((r) => r.id));
      const vus = new Set();
      for (let g = 1; g <= 10_000; g += 1) {
        const o = tirer(c, cat, g);
        vus.add(o.rarete);
        expect(TYPES).toContain(cat.objets.get(o.id).type);
      }
      expect([...vus].sort()).toEqual(cat.raretes.map((r) => r.id).sort());
    }
    for (const o of cat.objets.values()) for (const d of Object.values(o.raretes)) for (const k of ATTAQUE) expect(d.bonus[k] ?? d.bonusParNiveau[k], `${o.id} ${k}`).toBeUndefined();
  });

  it('offres du jour : 6 objets du catalogue de survie, chaque jour sur 3 000 jours', () => {
    const { regles } = lireOffres(lire('data/menu/caisses.json'), cat);
    for (let jour = 20_000; jour < 23_000; jour += 1) {
      const offres = offresDuJour(regles, cat, jour);
      expect(offres).toHaveLength(6);
      for (const o of offres) expect(TYPES).toContain(cat.objets.get(o.id).type);
    }
  });

  it('tirage identique à graine égale (×1 et ×10 ; le premier du ×10 est le ×1)', () => {
    for (const c of caisses) {
      for (const g of [1, 42, 4_294_967_295]) {
        expect(tirer(c, cat, g)).toEqual(tirer(c, cat, g));
        expect(tirer10(c, cat, g)).toEqual(tirer10(c, cat, g));
        expect(tirer10(c, cat, g)).toHaveLength(TIRAGES_X10);
        expect(tirer10(c, cat, g)[0]).toEqual(tirer(c, cat, g));
      }
    }
  });
});

describe('état du menu dérivé de la progression v2 (etatDepuis)', () => {
  it('nouveau joueur : inventaire vide, rien d\'équipé, Survivant choisi, personnages débloqués par les données gardés ; niveaux de base 0 → statistiques sans bonus', () => {
    const e = etatDepuis(defaultProgression(), cat);
    expect(e.objets).toEqual([]);
    expect(Object.values(e.porte).every((u) => u === null)).toBe(true);
    expect(e.choisi).toBe('survivant');
    const s = statistiquesEffectives(defaultProgression().niveaux, e, cat, PARAMS);
    expect(Object.values(s.niveaux).every((n) => n === 0)).toBe(true);
  });

  it('objets, équipement, personnages et niveaux relus de la v2 ; objet inconnu du catalogue (ancienne arme) écarté ; niveau borné à son maximum', () => {
    const save = appliquerOps(defaultProgression(), [
      { id: 'g', t: 'gain', bleu: 5000 },
      { id: 'a', t: 'achat', prix: 150, objets: [{ u: 'a.0', i: 'casque-kevlar', r: 'commun' }, { u: 'a.1', i: 'pistolet', r: 'rare' }] },
      { id: 'm1', t: 'ameliorer', u: 'a.0', de: 1, prix: 40 },
      { id: 'c', t: 'choix', champ: 'porte', valeur: { tete: 'a.0', gants: 'a.1' }, date: 1 },
      { id: 'p', t: 'achat', prix: 0, persos: [{ id: 'personnage-3', max: 10 }] },
      { id: 'c2', t: 'choix', champ: 'choisi', valeur: 'personnage-3', date: 2 },
    ], 1, params).save;
    const e = etatDepuis(save, cat);
    expect(e.objets.map((o) => [o.uid, o.id, o.niveau])).toEqual([['a.0', 'casque-kevlar', 2]]);
    expect(e.porte.tete).toBe('a.0');
    expect(e.porte.gants).toBeNull();
    expect(e.choisi).toBe('personnage-3');
    expect(solde(save)).toBe(5000 - 150 - 40);
  });

  it('statistiques affichées : celles de la survie seulement (vie, vitesse, réparation, régénération) ; chutes retirée', () => {
    expect(STATS_SURVIE).toEqual(['vie', 'vitesse', 'reparation', 'regen']);
    expect(read('js/menu/personnage.js')).toMatch(/export const STATS_AFFICHEES = \[\.\.\.STATS_SURVIE\];/);
  });
});

describe('prix prélevés dans la même écriture que ce qui est obtenu', () => {
  it('chaque achat du menu passe par une opération à prix (caisses, offres, améliorations, fusion, personnage) ; plus aucun « poser » d\'état en mémoire', () => {
    const eq = read('js/menu/equipement-etat.js');
    for (const t of ["t: 'achat', prix", "t: 'ameliorer'", "t: 'fusion'", "t: 'perso'"]) expect(eq, t).toContain(t);
    for (const f of ['js/menu/boutique.js', 'js/menu/inventaire.js', 'js/menu/fusion.js', 'js/menu/personnages.js']) expect(read(f), f).not.toMatch(/eq\.poser\(/);
    expect(read('js/menu/boutique.js')).not.toMatch(/ajouterObjets\(|obtenirPersonnages\(/);
  });

  it('inventaire plein (100) : l\'achat ×10 est refusé en entier, rien n\'est prélevé', () => {
    const objets = Array.from({ length: 95 }, (_, i) => ({ u: `x.${i}`, i: 'rangers', r: 'commun' }));
    const base = appliquerOps(defaultProgression(), [{ id: 'g', t: 'gain', bleu: 9000 }, { id: 'x', t: 'achat', prix: 0, place: cat.inventaireMax, objets }], 1, params).save;
    const r = appliquerOps(base, [{ id: 'y', t: 'achat', prix: 1350, place: cat.inventaireMax, objets: Array.from({ length: 10 }, (_, i) => ({ u: `y.${i}`, i: 'rangers', r: 'commun' })) }], 2, params);
    expect(r.refused).toEqual([{ id: 'y', raison: 'plein' }]);
    expect([r.save.objets.length, solde(r.save)]).toEqual([95, 9000]);
  });
});

describe('outils de débogage', () => {
  it('icône seulement sur les canaux « source » et « dev » (jamais la Recette « release », les archives ni la production) ; quatre outils avec confirmation ; jamais zs.save.v1', () => {
    const menu = read('js/menu/menu.js');
    expect(menu).toMatch(/const outils = \['source', 'dev'\]\.includes\(pageCanal\(\)\)/);
    const d = read('js/menu/debogage.js');
    expect(d).toMatch(/export const CANAUX_OUTILS = Object\.freeze\(\['source', 'dev'\]\);/);
    expect(d).toMatch(/export const OUTILS = Object\.freeze\(\['bleus', 'demo', 'persos', 'zero'\]\);/);
    expect(d).toMatch(/game\.menu\.debogage\.confirmer/);
    expect(d).not.toMatch(/localStorage|removeItem\(|getItem\(/); // aucun accès direct : la remise à zéro passe par le dépôt v2 (clear de zs.save.v2)
    expect(read('js/menu/equipement-etat.js')).toMatch(/remettreAZero: \(\) => prog\.effacer\(\)/);
  });
});
