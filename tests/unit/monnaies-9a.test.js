import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { jourLocal, makeEconomy } from '../../js/core/economy.js';
import { appliquerOps, decoder, encoder, lire, sanitize, serialiser, solde, soldeMedailles } from '../../js/core/progression.js';
import { createBank } from '../../js/game/bank.js';
import { createRepository } from '../../js/save/index.js';
import { createFakeStorage } from './helpers/fake-storage.js';
import { simulateV2 } from './helpers/onglets-v2-simulateur.js';
import { simulateMedailles } from './helpers/onglets-medailles-simulateur.js';
import { lireCaisses, lireCosmetiques, lirePitie } from '../../js/core/caisses.js';
import { lireCatalogue } from '../../js/core/equipement.js';

// Lot 9a (Docs/ref/economie.md, Docs/ref/debut-v09.md) : médailles et diamants intervertis À L'ÉCRAN, champs de la sauvegarde gardés et nommés par
// leur origine : « bleu » (manches, fin du monde) s'affiche « médailles » et paie améliorations, fusion, offres du jour ; « medailles » (portes,
// milliers de zombies, paliers, premier monde, partie du jour) s'affiche « diamants » et paie les caisses. Monnaie jaune : « Zollars ».
// « Quitter » et « Recommencer » ne créditent rien de plus ; la partie du jour se compte à la mort ou à la fin du monde.
const load = (name) => JSON.parse(readFileSync(`data/game/${name}.json`, 'utf8'));
const fr = JSON.parse(readFileSync('data/i18n/fr.json', 'utf8'));
const params = { save: load('save'), economy: load('economy'), stats: load('player-stats') };
const economy = makeEconomy(params.economy, load('enemies'));
const KEY = params.save.v2.storageKey;
const MIDI = new Date(2026, 10, 15, 12).getTime();
const stored = (storage) => JSON.parse(storage.data.get(KEY));

// Sauvegarde telle que la V0.8 l'écrit (format v2) : les deux soldes, leurs totaux, la pitié, les paliers, les mondes et le jour.
const AVANT = Object.freeze({
  v: 2, rev: 7, savedAt: 1, bleu: { gagne: 1234, depense: 200 }, medailles: { gagne: 567, depense: 100, jour: 20406 },
  records: { histoire: { batiment: 17 }, infini: {} }, mondes: ['batiment'], paliers: { histoire: { batiment: 15 }, infini: {} }, mondesFinis: ['batiment'],
  pitie: { equipement: { e: 3, l: 27 }, personnage: { e: 9, l: 61 }, cosmetique: { e: 0, l: 4 } },
});
// Ce que l'écran montre (noms de fr.json) : chaque champ avec son nom d'écran.
const ecran = (s) => ({ [fr['game.menu.solde'].split(' :')[0]]: solde(s), [fr['game.menu.medailles'].split(' :')[0]]: soldeMedailles(s) });
const intactes = (s) => ({ bleu: s.bleu, medailles: s.medailles, paliers: s.paliers, mondesFinis: s.mondesFinis, mondes: s.mondes, pitie: s.pitie });

let parties = 0;
function make({ initial, wall = MIDI, partie = {} } = {}) {
  const storage = createFakeStorage(initial === undefined ? {} : { [KEY]: JSON.stringify(initial) });
  const { repository, mode } = createRepository({ search: '', storage, params, format: 'v2' });
  const time = { ms: 0, wall };
  const bank = createBank({ repository, mode, economy, clock: () => time.ms, wall: () => time.wall, partie, runId: () => `q${(parties += 1)}` });
  return { bank, storage, time };
}
const manches = (bank, n) => {
  bank.waveStart(1);
  for (let w = 1; w <= n; w += 1) {
    bank.waveStart(w);
    bank.waveEnd(w, false);
  }
};
const soldes = (s) => [solde(s), soldeMedailles(s)];

describe('noms à l\'écran (data/i18n/fr.json)', () => {
  it('champ « bleu » = médailles, champ « medailles » = diamants, monnaie jaune = Zollars : en-tête, pause, fin, Profil, débogage, sauvegarde', () => {
    expect([fr['game.menu.solde'], fr['game.menu.medailles']]).toEqual(['Médailles : {n}', 'Diamants : {n}']);
    expect([fr['game.pause.balance.label'], fr['game.pause.medailles.label']]).toEqual(['Médailles :', 'Diamants :']);
    expect([fr['game.end.balance'], fr['game.end.medailles.solde']]).toEqual(['Solde médailles : {n}', 'Solde diamants : {n}']);
    expect([fr['game.menu.profil.stat.argent'], fr['game.menu.profil.stat.medailles']]).toEqual(['Médailles gagnées', 'Diamants gagnés']);
    expect([fr['game.menu.debogage.bleus'], fr['game.menu.debogage.medailles']]).toEqual(['Ajouter 10 000 médailles', 'Ajouter 1 000 diamants']);
    expect([fr['game.save.page.state.balance'], fr['game.save.page.state.earned'], fr['game.save.page.state.medailles']]).toEqual(['Médailles', 'Médailles gagnées (total)', 'Diamants']);
    expect([fr['game.save.page.import.row.money'], fr['game.save.page.import.row.medailles']]).toEqual(['Médailles', 'Diamants']);
    expect(fr['game.live.waveBonus']).toBe('Manche {n} terminée, +{bonus} médailles.');
    expect([fr['game.hud.moneyLabel'], fr['game.debug.money']]).toEqual(['Zollars : {n}', 'Zollars de départ']);
    expect(fr['game.pause.quitConfirm']).toContain('les Zollars de cette partie seront perdus');
  });

  it('prix : améliorations, fusion et offres en médailles ; caisses (et « Rouvrir ») en diamants', () => {
    expect([fr['game.menu.prix.manque'], fr['game.menu.prix.raison'], fr['game.menu.achat.refus.solde']]).toEqual(['Il manque {n} médailles', 'Médailles insuffisantes : prix {prix}, solde {solde}.', 'Achat annulé : les médailles ne suffisent pas. Rien n\'a été prélevé.']);
    expect(fr['game.menu.fusion.message.solde']).toContain('il manque {n} médailles');
    expect([fr['game.menu.prix.manqueMedailles'], fr['game.menu.prix.raisonMedailles'], fr['game.menu.achat.refus.medailles']]).toEqual(['Il manque {n} diamants', 'Diamants insuffisants : prix {prix}, solde {solde}.', 'Achat annulé : les diamants ne suffisent pas. Rien n\'a été prélevé.']);
    expect(fr['game.menu.boutique.prix.sep']).toBe('· prix en diamants :');
    const resultat = readFileSync('js/menu/resultat.js', 'utf8');
    expect(resultat).toContain("fmt(t('game.menu.prix.manqueMedailles')");
    expect(readFileSync('js/menu/boutique.js', 'utf8')).toContain('solde: () => eq.medailles()');
  });

  it('aucun texte du jeu ne parle encore de « monnaie jaune » ou de « monnaie bleue »', () => {
    const textes = Object.entries(fr).filter(([k]) => k.startsWith('game.')).map(([, v]) => v).join('\n');
    expect(textes).not.toMatch(/monnaie (jaune|bleue)/i);
  });
});

describe('gains de chaque monnaie (valeurs inchangées, monnaies à leur nouvelle place)', () => {
  it('médailles (champ bleu) : 20 par manche, 30 en manche renforcée, 500 par fin de monde ; diamants : rien aux manches hors paliers', () => {
    const { bank, storage } = make();
    bank.waveStart(1);
    bank.waveEnd(1, false);
    expect(soldes(stored(storage))).toEqual([20, 0]);
    bank.waveStart(2);
    bank.waveEnd(2, true);
    expect(soldes(stored(storage))).toEqual([50, 0]);
    expect(bank.worldEnd().bonus).toBe(500);
    bank.runEnd({ reason: 'world' });
    // Monde terminé : +500 médailles ; diamants : +300 (premier monde) et +100 (partie du jour).
    expect(soldes(stored(storage))).toEqual([550, 400]);
  });

  it('diamants (champ medailles) : +10 par porte, +10 au millième zombie tué, +50 au palier de 5 manches ; écrits au gain', () => {
    const { bank, storage } = make();
    bank.waveStart(1);
    expect(bank.door()).toBe(10);
    expect(soldes(stored(storage))).toEqual([0, 10]);
    for (let i = 0; i < 1000; i += 1) bank.kill('marcheur', 1);
    expect(soldes(stored(storage))).toEqual([0, 20]);
    for (let w = 1; w <= 5; w += 1) {
      bank.waveStart(w);
      bank.waveEnd(w, false);
    }
    expect(soldes(stored(storage))).toEqual([100, 70]);
  });

  it('dépenses : caisse en diamants (champ medailles), offre ou amélioration en médailles (champ bleu) ; achat refusé en entier si la monnaie manque', () => {
    let s = appliquerOps(AVANT, [{ id: 'c1', t: 'achat', prix: 100, monnaie: 'medailles', objets: [{ u: 'c1.0', i: 'casque-kevlar', r: 'commun' }] }], 2, params).save;
    expect(soldes(s)).toEqual([1034, 367]);
    s = appliquerOps(s, [{ id: 'o1', t: 'achat', prix: 34, monnaie: 'bleu', objets: [{ u: 'o1.0', i: 'casque-kevlar', r: 'commun' }] }], 3, params).save;
    expect(soldes(s)).toEqual([1000, 367]);
    const r = appliquerOps(s, [{ id: 'c2', t: 'achat', prix: 1000, monnaie: 'medailles', objets: [{ u: 'c2.0', i: 'casque-kevlar', r: 'commun' }] }], 4, params);
    expect(r.refused).toEqual([{ id: 'c2', raison: 'solde' }]);
    expect([soldes(r.save), r.save.objets.some((o) => o.u === 'c2.0')]).toEqual([[1000, 367], false]);
  });
});

describe('« Quitter » et « Recommencer » ne créditent rien (partie du jour : mort ou fin du monde seulement)', () => {
  for (const n of [1, 2, 5]) {
    it(`après ${n} manche(s) terminée(s), « Quitter » : soldes égaux à ceux d'avant (rien de plus que les manches et paliers déjà écrits)`, () => {
      const { bank, storage } = make();
      manches(bank, n);
      const avant = soldes(stored(storage));
      const fin = bank.runEnd({ reason: 'quit' });
      expect(soldes(stored(storage))).toEqual(avant);
      expect(fin.medailles.jour).toBe(0);
      expect(stored(storage).medailles.jour).toBe(0);
    });
  }

  it('« Recommencer » (pause) : aucun crédit non plus ; la partie suivante, finie par la mort, compte la partie du jour', () => {
    const { bank, storage } = make();
    manches(bank, 2);
    const avant = soldes(stored(storage));
    bank.runEnd({ reason: 'restart' });
    expect(soldes(stored(storage))).toEqual(avant);
    bank.restart();
    manches(bank, 1);
    expect(bank.runEnd({ reason: 'death' }).medailles.jour).toBe(100);
    expect(soldes(stored(storage))).toEqual([avant[0] + 20, avant[1] + 100]);
    expect(stored(storage).medailles.jour).toBe(jourLocal(new Date(MIDI)));
  });

  it('mort et fin du monde : partie du jour comptée (une fois par jour) ; manches, portes et paliers gardés après « Quitter »', () => {
    const { bank, storage } = make();
    bank.waveStart(1);
    bank.door();
    manches(bank, 5);
    bank.runEnd({ reason: 'quit' });
    expect(soldes(stored(storage))).toEqual([100, 60]); // 5 manches ; porte (10) et palier (50) gardés, pas de partie du jour
    bank.restart();
    manches(bank, 1);
    bank.runEnd({ reason: 'death' });
    expect(soldes(stored(storage))).toEqual([120, 160]);
    bank.restart();
    manches(bank, 1);
    bank.runEnd({ reason: 'death' });
    expect(soldes(stored(storage))).toEqual([140, 160]); // déjà comptée aujourd'hui
  });

  it('partie quittée sans manche terminée : rien du tout', () => {
    const { bank, storage } = make({ initial: AVANT });
    bank.waveStart(1);
    bank.runEnd({ reason: 'quit' });
    expect(intactes(stored(storage))).toEqual(intactes(sanitize(AVANT, params).save));
  });
});

describe('interversion : une seule fois, sans perte (aucune donnée déplacée)', () => {
  const avant = sanitize(AVANT, params).save;

  it('sauvegarde de la V0.8 : à l\'écran, le solde gagné aux manches devient les médailles, celui des portes et paliers les diamants ; totaux de même', () => {
    expect(ecran(avant)).toEqual({ Médailles: 1034, Diamants: 467 });
    expect([avant.bleu.gagne, avant.medailles.gagne]).toEqual([1234, 567]); // Profil : « Médailles gagnées » 1 234, « Diamants gagnés » 567
    expect([avant.pitie, avant.paliers, avant.mondesFinis, avant.medailles.jour]).toEqual([AVANT.pitie, AVANT.paliers, ['batiment'], 20406]);
  });

  it('rechargements répétés et réécritures : champs identiques, rien n\'est interverti une seconde fois', () => {
    let s = avant;
    for (let i = 0; i < 5; i += 1) s = lire(JSON.parse(JSON.stringify(serialiser(s))), params).save;
    expect(intactes(s)).toEqual(intactes(avant));
    const r = appliquerOps(s, [{ id: 'x1', t: 'gain', tues: 3 }], 9, params).save;
    expect(intactes(r)).toEqual(intactes(avant));
    expect(ecran(r)).toEqual({ Médailles: 1034, Diamants: 467 });
  });

  it('import d\'un code ZS2 d\'avant le lot, puis réimport d\'un code ZS2 de ce lot : mêmes soldes, totaux, pitié, paliers et jour', () => {
    const code8 = encoder(AVANT, params); // même format : un code de la V0.8
    const a = decoder(code8, params);
    expect(a.ok).toBe(true);
    expect(intactes(a.save)).toEqual(intactes(avant));
    const code9 = encoder(a.save, params);
    const b = decoder(code9, params);
    expect(intactes(b.save)).toEqual(intactes(avant));
    expect(ecran(b.save)).toEqual({ Médailles: 1034, Diamants: 467 });
  });

  for (const tabs of [2, 3, 4]) {
    it(`${tabs} onglets (simulateur du lot 8k étendu, départ : sauvegarde de la V0.8) : aucune perte, aucun double, diamants, pitié, paliers et jour inchangés`, () => {
      for (const seed of [1, 2, 3, 4, 5]) {
        const r = simulateV2({ seed: seed * 10 + tabs, tabs, ops: 10, params, departSave: AVANT });
        expect(r.ok, `graine ${seed}`).toBe(true);
        expect(r.negatif).toBe(false);
        expect({ medailles: r.fin.medailles, pitie: r.fin.pitie, paliers: r.fin.paliers, mondesFinis: r.fin.mondesFinis }).toEqual({ medailles: avant.medailles, pitie: avant.pitie, paliers: avant.paliers, mondesFinis: avant.mondesFinis });
        expect(r.fin.bleu.gagne).toBe(r.attendu);
      }
    });
  }

  const lireM = (p) => JSON.parse(readFileSync(p, 'utf8'));
  const { cat: base } = lireCatalogue({ raretes: lireM('data/menu/raretes.json'), objets: lireM('data/menu/objets.json'), personnages: lireM('data/menu/personnages.json') });
  const cat = { ...base, cosmetiques: lireCosmetiques(lireM('data/menu/cosmetiques.json'), base.raretes) };
  const { caisses } = lireCaisses(lireM('data/menu/caisses.json'), cat);
  const { regles } = lirePitie(lireM('data/menu/caisses.json'), cat);
  it('simulateur du lot 8k (portes, paliers, jour, caisses avec pitié) avec un solde de médailles de la V0.8 : diamants justes, médailles intactes, 2 à 4 onglets', () => {
    for (let seed = 1; seed <= 30; seed += 1) {
      const r = simulateMedailles({ seed, tabs: 2 + (seed % 3), params, caisse: caisses[0], cat, regles, initial: 1200, bleuDepart: 1034 });
      expect(r.ok, `graine ${seed}`).toBe(true);
      expect([r.fin.bleu.gagne, r.fin.bleu.depense], `graine ${seed}`).toEqual([1034, 0]);
    }
  });
});
