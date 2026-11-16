import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { jourLocal, makeEconomy, diamantPorte, diamantsZombies, paliersNouveaux } from '../../js/core/economy.js';
import { appliquerOps, CHAMPS_STOCKES, decoder, defaultProgression, depuisStockage, encoder, lire, serialiser, soldeDiamants } from '../../js/core/progression.js';
import { createBank } from '../../js/game/bank.js';
import { createRepository } from '../../js/save/index.js';
import { createFakeStorage } from './helpers/fake-storage.js';

// Lot 8k (Docs/ref/economie.md) : diamants (lot 9a ; troisième monnaie, gardée, paie les caisses) et médailles à gain fixe. Partie B : portes, milliers de
// zombies, plafond, modes sans écriture, migration et import ; partie C : paliers, premier monde terminé, première partie du jour.
const load = (name) => JSON.parse(readFileSync(`data/game/${name}.json`, 'utf8'));
const params = { save: load('save'), economy: load('economy'), stats: load('player-stats') };
const economy = makeEconomy(params.economy, load('enemies'));
const KEY = params.save.v2.storageKey;
const stored = (storage) => depuisStockage(JSON.parse(storage.data.get(KEY)), params).save; // lot 9b : noms du code
// Lot 9b : champs stockés de zs.save.v2 retirés d'un objet écrit (sauvegarde d'avant le lot 8k).
const STOCKES_8K = [CHAMPS_STOCKES.diamants, 'paliers', 'mondesFinis', 'pitie'];

let parties = 0;
function make({ search = '', initial, wall = new Date(2026, 10, 14, 12).getTime(), partie = {} } = {}) {
  const storage = createFakeStorage(initial === undefined ? {} : { [KEY]: JSON.stringify(initial) });
  const { repository, mode } = createRepository({ search, storage, params, format: 'v2' });
  const time = { ms: 0, wall };
  // Identifiants de partie uniques entre toutes les banques d'un fichier (dans le jeu : tirés par crypto).
  const bank = createBank({ repository, mode, economy, clock: () => time.ms, wall: () => time.wall, partie, runId: () => `m${(parties += 1)}` });
  return { bank, storage, time, mode, repository };
}
// n zombies tués par balle.
const tuer = (bank, n) => {
  for (let i = 0; i < n; i += 1) bank.kill('marcheur', 1);
};

describe('données (data/game/economy.json)', () => {
  it('valeurs du lot 8k : médailles fixes (20, ×1,5, 500) ; diamants 10 par porte, 10 par 1 000 zombies, 50 par palier de 5, 300 le monde, 100 le jour, plafond 9 999 999', () => {
    expect(params.economy).toMatchObject({ waveBonusBase: 20, waveBonusPerWave: 0, reinforcedBonusMul: 1.5, worldBonus: 500, diamantPorte: 10, diamantZombies: 10, diamantZombiesPas: 1000, diamantPalier: 50, diamantPalierPas: 5, diamantMonde: 300, diamantJour: 100, maxDiamants: 9_999_999 });
    expect(params.economy._provisoire).toMatch(/Lot 8k/);
  });

  it('fonctions pures (js/core/economy.js) : porte, milliers franchis, paliers nouveaux ; réglages invalides : 0', () => {
    expect(diamantPorte(economy)).toBe(10);
    expect([diamantsZombies(998, 999, economy), diamantsZombies(999, 1000, economy), diamantsZombies(1000, 1001, economy), diamantsZombies(999, 2000, economy)]).toEqual([0, 10, 0, 20]);
    expect(diamantsZombies(0, 5000, { diamantZombies: 10 })).toBe(0); // pas absent : aucun gain
    expect(paliersNouveaux(0, 4, economy)).toEqual([]);
    expect(paliersNouveaux(0, 5, economy)).toEqual([5]);
    expect(paliersNouveaux(5, 17, economy)).toEqual([10, 15]);
    expect(paliersNouveaux(15, 15, economy)).toEqual([]);
    expect(paliersNouveaux(0, 40, {})).toEqual([]);
    expect(diamantPorte({ diamantPorte: -3 })).toBe(0);
  });
});

describe('banque : diamants des portes et des milliers de zombies (partie B)', () => {
  // Retour du propriétaire après le lot 9a : gains affichés aussitôt (solde de la banque), écrits seulement à la fin de la partie (mort, monde) ;
  // avant : écrits aussitôt. Les assertions d'écriture sont reprises à la fin de la partie.
  it('porte ouverte : +10 affiché aussitôt, écrit à la fin de la partie (mort), gardé ; affichage { n, gain }', () => {
    const { bank, storage } = make();
    bank.waveStart(10);
    expect(bank.door()).toBe(10);
    expect(bank.soldeDiamants()).toBe(10);
    expect(bank.gainDiamants()).toEqual({ n: 1, gain: 10 });
    expect(bank.door()).toBe(10); // une autre porte
    expect(storage.data.has(KEY) ? soldeDiamants(stored(storage)) : 0).toBe(0); // rien d'écrit pendant la partie
    expect(bank.soldeDiamants()).toBe(20);
    expect(bank.diamantsPartie()).toMatchObject({ portes: 20, total: 20 });
    bank.runEnd({ reason: 'death' });
    expect(soldeDiamants(stored(storage))).toBe(20);
  });

  it('millier EXACT de zombies tués par balle : +10 au 1 000e (pas au 999e), +10 au 2 000e ; écrit à la fin de la partie', () => {
    const { bank, storage } = make();
    bank.waveStart(1);
    tuer(bank, 999);
    expect(bank.soldeDiamants()).toBe(0);
    tuer(bank, 1);
    expect(bank.soldeDiamants()).toBe(10);
    tuer(bank, 1000);
    expect(bank.soldeDiamants()).toBe(20);
    expect(bank.diamantsPartie().zombies).toBe(20);
    bank.runEnd({ reason: 'death' });
    expect(soldeDiamants(stored(storage))).toBe(20);
  });

  it('compteur remis à 0 à chaque partie (Rejouer, Recommencer) : 600 + 600 tués sur deux parties = aucun millier', () => {
    const { bank, storage } = make();
    bank.waveStart(1);
    tuer(bank, 600);
    bank.runEnd({ reason: 'death' });
    bank.restart();
    bank.waveStart(1);
    tuer(bank, 600);
    bank.runEnd({ reason: 'death' });
    expect(soldeDiamants(stored(storage))).toBe(0);
    expect(stored(storage).profil.tues).toBe(1200);
  });

  it('plafond : solde de diamants jamais au-delà de 9 999 999 (le gain au-delà est perdu, jamais négatif)', () => {
    const initial = serialiser(appliquerOps(defaultProgression(), [{ id: 'p', t: 'gain', diamants: 9_999_995 }], 1, params).save);
    const { bank, storage } = make({ initial });
    bank.waveStart(10);
    bank.door();
    expect(bank.soldeDiamants()).toBe(9_999_999);
    bank.door();
    expect(bank.soldeDiamants()).toBe(9_999_999);
    bank.runEnd({ reason: 'death' });
    expect(soldeDiamants(stored(storage))).toBe(9_999_999);
  });

  it('mode essai (?wave=, ?endless=1…) : diamants affichés pour la session, RIEN n\'est écrit', () => {
    for (const search of ['?wave=11', '?endless=1', '?empty=1']) {
      const { bank, storage, mode } = make({ search });
      expect(mode.readOnly).toBe(true);
      bank.waveStart(11);
      expect(bank.door()).toBe(10);
      expect(bank.soldeDiamants()).toBe(10);
      bank.runEnd({ reason: 'death' });
      expect(storage.data.has(KEY), search).toBe(false);
    }
  });

  it('?test=1 : en mémoire, rien dans le stockage', () => {
    const { bank, storage } = make({ search: '?test=1' });
    bank.waveStart(10);
    bank.door();
    expect(storage.data.size).toBe(0);
  });

  it('médailles : gain fixe (20 ; 30 renforcée) ; la partie ne dépense jamais rien', () => {
    const { bank, storage } = make();
    bank.waveStart(1);
    expect(bank.waveEnd(1, false).bonus).toBe(20);
    expect(bank.waveEnd(2, true).bonus).toBe(30);
    bank.runEnd({ reason: 'death' }); // retour après le lot 9a : écrite à la fin de la partie
    expect(stored(storage).medailles).toEqual({ gagne: 50, depense: 0 });
    expect(stored(storage).diamants.depense).toBe(0);
  });
});

describe('format v2 : champs du lot 8k, migration, import (partie B)', () => {
  it('progression d\'avant le lot (sans les champs) : lue sans avertissement sur eux, diamants 0, paliers et mondes récompensés vides, pitié 0 — aucun crédit rétroactif', () => {
    const avant = { ...serialiser(defaultProgression()), records: { histoire: { batiment: 40 }, infini: { batiment: 63 } }, mondes: ['batiment'] };
    for (const k of STOCKES_8K) delete avant[k];
    const r = lire(avant, params);
    expect(r.ok).toBe(true);
    expect(r.warnings.filter((w) => new RegExp(`${CHAMPS_STOCKES.diamants}|paliers|mondesFinis|pitie`).test(w))).toEqual([]);
    expect(r.save.diamants).toEqual({ gagne: 0, depense: 0, jour: 0 });
    expect(r.save.paliers).toEqual({ histoire: {}, infini: {} });
    expect(r.save.mondesFinis).toEqual([]);
    expect(r.save.pitie).toEqual({ equipement: { e: 0, l: 0 }, personnage: { e: 0, l: 0 }, cosmetique: { e: 0, l: 0 } });
    expect(r.save.records.histoire.batiment).toBe(40); // les records sont gardés tels quels
    expect(Object.keys(r.extra)).toEqual([]);
  });

  it('champs invalides réparés un par un : dépensé > gagné, négatifs, types faux, pitié hors bornes', () => {
    const r = depuisStockage({ ...serialiser(defaultProgression()), [CHAMPS_STOCKES.diamants]: { gagne: 5, depense: 9, jour: -1 }, paliers: { histoire: { batiment: 'x', __proto__: 5 }, infini: [] }, mondesFinis: [3, 'batiment', 'batiment'], pitie: { equipement: { e: 4000, l: -2 }, cosmetique: 'x' } }, params);
    expect(r.save.diamants).toEqual({ gagne: 5, depense: 5, jour: 0 });
    expect(r.save.paliers).toEqual({ histoire: {}, infini: {} });
    expect(r.save.mondesFinis).toEqual(['batiment']);
    expect(r.save.pitie.equipement).toEqual({ e: 999, l: 0 });
    expect(r.save.pitie.cosmetique).toEqual({ e: 0, l: 0 });
    expect(r.warnings.length).toBeGreaterThan(0);
  });

  it('écriture : ordre fixe, champs du lot écrits après les records ; relu à l\'identique', () => {
    const s = appliquerOps(defaultProgression(), [{ id: 'a', t: 'gain', diamants: 30, palier: { mode: 'histoire', monde: 'batiment', manche: 10, pas: 5, gain: 50 } }], 7, params).save;
    const out = serialiser(s);
    expect(Object.keys(out)).toEqual(['v', 'rev', 'savedAt', CHAMPS_STOCKES.medailles, CHAMPS_STOCKES.diamants, 'objets', 'porte', 'persos', 'tenues', 'offres', 'niveaux', 'records', 'mondes', 'paliers', 'mondesFinis', 'pitie', 'profil', 'lues', 'dates', 'journal']);
    expect(out[CHAMPS_STOCKES.diamants]).toEqual({ gagne: 130, depense: 0, jour: 0 });
    expect(serialiser(lire(JSON.parse(JSON.stringify(out)), params).save)).toEqual(out);
  });

  it('code ZS2 d\'avant le lot (sans les champs) : importé, champs à leur défaut, aucun crédit ; un ZS2 du lot garde diamants, paliers et pitié', () => {
    const avant = { ...serialiser(defaultProgression()), [CHAMPS_STOCKES.medailles]: { gagne: 900, depense: 100 }, records: { histoire: { batiment: 35 }, infini: {} }, mondes: ['batiment'] };
    for (const k of STOCKES_8K) delete avant[k];
    const code = encoder(depuisStockage(avant, params).save, params);
    const r = decoder(code, params);
    expect(r.ok).toBe(true);
    expect(soldeDiamants(r.save)).toBe(0);
    expect(r.save.paliers).toEqual({ histoire: {}, infini: {} });
    expect(r.save.mondesFinis).toEqual([]);
    const apres = appliquerOps(r.save, [{ id: 'b', t: 'gain', diamants: 70, palier: { mode: 'histoire', monde: 'batiment', manche: 5, pas: 5, gain: 50 } }, { id: 'c', t: 'pitie', valeurs: { equipement: { e: 7, l: 41 } } }], 2, params).save;
    const r2 = decoder(encoder(apres, params), params);
    expect([soldeDiamants(r2.save), r2.save.paliers.histoire.batiment, r2.save.pitie.equipement]).toEqual([120, 5, { e: 7, l: 41 }]);
  });

  it('format toujours versionné « v: 2 » ; une version future reste refusée (verrouillée, jamais écrasée)', () => {
    expect(serialiser(defaultProgression()).v).toBe(2);
    expect(lire({ ...serialiser(defaultProgression()), v: 3 }, params)).toEqual({ ok: false, error: 'future-version' });
  });

  it('jour local (date de l\'appareil) : change à minuit local, pas à minuit UTC', () => {
    expect(jourLocal(new Date(2026, 10, 14, 23, 59))).toBe(jourLocal(new Date(2026, 10, 14, 0, 0)));
    expect(jourLocal(new Date(2026, 10, 15, 0, 0)) - jourLocal(new Date(2026, 10, 14, 23, 59))).toBe(1);
  });
});

describe('paliers, premier monde terminé, première partie du jour (partie C)', () => {
  const finir = (bank, n) => {
    bank.waveStart(1);
    for (let w = 1; w <= n; w += 1) bank.waveEnd(w, false);
  };
  // Retour du propriétaire après le lot 9a : compté à la fin de la manche, écrit à la fin de la partie (avant : écrit à la fin de la manche).
  it('palier toutes les 5 manches terminées : +50 à la 5e, +50 à la 10e, rien entre ; écrit à la fin de la partie', () => {
    const { bank, storage } = make();
    bank.waveStart(1);
    for (let w = 1; w <= 4; w += 1) bank.waveEnd(w, false);
    expect(bank.soldeDiamants()).toBe(0);
    bank.waveEnd(5, true);
    expect(bank.soldeDiamants()).toBe(50);
    for (let w = 6; w <= 9; w += 1) bank.waveEnd(w, false);
    expect(bank.soldeDiamants()).toBe(50);
    bank.waveEnd(10, true);
    expect(bank.soldeDiamants()).toBe(100);
    expect(soldeDiamants(stored(storage))).toBe(0);
    bank.runEnd({ reason: 'death' });
    expect(soldeDiamants(stored(storage))).toBe(100 + 100); // + la partie du jour
    expect(stored(storage).paliers).toEqual({ histoire: { batiment: 10 }, infini: {} });
    expect(bank.diamantsPartie().paliers).toBe(100);
  });

  it('jamais deux fois : une nouvelle partie qui refait les manches 1 à 10 ne rapporte aucun palier ; la 15e, oui', () => {
    const { bank, storage } = make();
    finir(bank, 10);
    bank.runEnd({ reason: 'death' });
    bank.restart();
    finir(bank, 10);
    expect(bank.diamantsPartie().paliers).toBe(0);
    const avant = soldeDiamants(stored(storage));
    for (let w = 11; w <= 15; w += 1) bank.waveEnd(w, false);
    bank.runEnd({ reason: 'death' }); // retour après le lot 9a : écrit à la fin de la partie (jour déjà compté)
    expect(soldeDiamants(stored(storage)) - avant).toBe(50);
  });

  it('saut de plusieurs paliers dans une même écriture (manche 17 d\'un coup) : 5, 10 et 15, une fois chacun ; rejouée sous un autre identifiant : rien de plus', () => {
    const op = (id) => ({ id, t: 'gain', palier: { mode: 'histoire', monde: 'batiment', manche: 17, pas: 5, gain: 50 } });
    const s1 = appliquerOps(defaultProgression(), [op('a')], 1, params).save;
    expect([soldeDiamants(s1), s1.paliers.histoire.batiment]).toEqual([150, 15]);
    const s2 = appliquerOps(s1, [op('b'), op('c')], 2, params).save;
    expect(soldeDiamants(s2)).toBe(150);
  });

  it('histoire par monde, infini par carte : paliers séparés (le même palier rapporte une fois en histoire et une fois en infini)', () => {
    const h = make({ partie: { mode: 'histoire', monde: 'batiment' } });
    finir(h.bank, 5);
    h.bank.runEnd({ reason: 'death' }); // retour après le lot 9a : écrit à la fin de la partie (+100 : partie du jour)
    const s = stored(h.storage);
    const i = make({ initial: serialiser(s), partie: { mode: 'infini', monde: 'batiment' } });
    finir(i.bank, 5);
    i.bank.runEnd({ reason: 'death' });
    expect(stored(i.storage).paliers).toEqual({ histoire: { batiment: 5 }, infini: { batiment: 5 } });
    expect(soldeDiamants(stored(i.storage))).toBe(100 + 100);
  });

  it('aucun crédit au chargement : progression d\'avant le lot avec records 40 et monde terminé → 0 diamant ; le palier 5 rapporte au premier franchissement suivant', () => {
    const avant = { ...serialiser(defaultProgression()), records: { histoire: { batiment: 40 }, infini: { batiment: 55 } }, mondes: ['batiment'], profil: { ...defaultProgression().profil, partiesHistoire: 30 } };
    for (const k of STOCKES_8K) delete avant[k];
    const { bank, storage, repository } = make({ initial: avant });
    expect(soldeDiamants(repository.load().save)).toBe(0);
    expect(bank.soldeDiamants()).toBe(0);
    bank.waveStart(1);
    bank.flush('pause');
    expect(soldeDiamants(stored(storage))).toBe(0);
    for (let w = 1; w <= 5; w += 1) bank.waveEnd(w, false);
    expect(bank.soldeDiamants()).toBe(50);
    bank.runEnd({ reason: 'death' }); // retour après le lot 9a : écrit à la fin de la partie (+100 : partie du jour)
    expect(soldeDiamants(stored(storage))).toBe(50 + 100);
  });

  it('premier monde terminé : +300 une seule fois pour toujours (prime de 500 médailles à chaque fois) ; jamais déduit de « mondes » d\'avant le lot', () => {
    const { bank, storage } = make({ initial: { ...serialiser(defaultProgression()), mondes: ['batiment'] } });
    finir(bank, 40);
    const avantMonde = bank.soldeDiamants(); // retour après le lot 9a : paliers de la partie comptés, pas encore écrits
    expect(bank.worldEnd().bonus).toBe(500);
    bank.runEnd({ reason: 'world' });
    expect(bank.diamantsPartie().monde).toBe(300);
    expect(stored(storage).mondesFinis).toEqual(['batiment']);
    const apres = soldeDiamants(stored(storage));
    expect(apres - avantMonde).toBe(300 + 100); // + la partie du jour
    bank.restart();
    finir(bank, 40);
    bank.worldEnd();
    bank.runEnd({ reason: 'world' });
    expect(bank.diamantsPartie().monde).toBe(0);
    expect(soldeDiamants(stored(storage)) - apres).toBe(0); // paliers déjà obtenus, monde déjà récompensé, jour déjà compté
  });

  it('première partie du jour : +100 à la fin d\'une partie qui a terminé au moins une manche ; pas pour une partie sans manche terminée ; une fois par jour', () => {
    const { bank, storage } = make();
    bank.waveStart(1);
    bank.runEnd({ reason: 'death' }); // aucune manche terminée
    expect(stored(storage).diamants).toEqual({ gagne: 0, depense: 0, jour: 0 });
    bank.restart();
    finir(bank, 1);
    const fin = bank.runEnd({ reason: 'death' });
    expect(fin.diamants).toMatchObject({ jour: 100, total: 100, solde: 100 });
    expect(stored(storage).diamants.jour).toBe(jourLocal(new Date(2026, 10, 14)));
    bank.restart();
    finir(bank, 1);
    expect(bank.runEnd({ reason: 'quit' }).diamants.jour).toBe(0);
    expect(soldeDiamants(stored(storage))).toBe(100);
  });

  it('minuit local : une partie finie à 23 h 59 puis une autre à 0 h 01 le lendemain → deux bonus du jour', () => {
    const { bank, storage, time } = make({ wall: new Date(2026, 10, 14, 23, 59).getTime() });
    finir(bank, 1);
    bank.runEnd({ reason: 'death' });
    time.wall = new Date(2026, 10, 15, 0, 1).getTime();
    bank.restart();
    finir(bank, 1);
    bank.runEnd({ reason: 'death' });
    expect(soldeDiamants(stored(storage))).toBe(200);
    expect(stored(storage).diamants.jour).toBe(jourLocal(new Date(2026, 10, 15)));
  });

  it('jour plus ancien rejoué (horloge d\'un autre onglet en retard) : jamais crédité après un jour plus récent', () => {
    const s1 = appliquerOps(defaultProgression(), [{ id: 'j2', t: 'gain', jour: { n: 20407, gain: 100 } }], 1, params).save;
    const s2 = appliquerOps(s1, [{ id: 'j1', t: 'gain', jour: { n: 20406, gain: 100 } }, { id: 'j3', t: 'gain', jour: { n: 20407, gain: 100 } }], 2, params).save;
    expect([soldeDiamants(s2), s2.diamants.jour]).toEqual([100, 20407]);
  });

  it('deux onglets le même jour (deux banques sur le même stockage) : la partie du jour et le palier comptés une fois', () => {
    const a = make();
    finir(a.bank, 5);
    const b = make({ initial: serialiser(stored(a.storage)) });
    finir(b.bank, 5);
    a.bank.runEnd({ reason: 'death' });
    b.storage.data.set(KEY, a.storage.data.get(KEY));
    b.bank.runEnd({ reason: 'death' });
    const s = stored(b.storage);
    expect([s.paliers.histoire.batiment, s.diamants.jour > 0, soldeDiamants(s)]).toEqual([5, true, 150]);
  });
});
