import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { makeEconomy } from '../../js/core/economy.js';
import { appliquerOps, defaultProgression, serialiser, solde } from '../../js/core/progression.js';
import { createBank } from '../../js/game/bank.js';
import { createRepository } from '../../js/save/index.js';
import { createLocalRepository } from '../../js/save/local-repository.js';
import { codecV2 } from '../../js/save/codecs.js';
import { createFakeStorage, quotaError } from './helpers/fake-storage.js';

// Lot 4 ; lot 8h : deux monnaies. Jaune = gains des zombies et des planches, remise à 0 à chaque partie, jamais écrite ; bleue = bonus de fin de
// manche et prime de fin du monde, écrite dans la progression v2 (zs.save.v2) à chaque manche terminée, gardée pour toujours.
const load = (name) => JSON.parse(readFileSync(`data/game/${name}.json`, 'utf8'));
const params = { save: load('save'), economy: load('economy'), stats: load('player-stats') };
const realEconomy = makeEconomy(params.economy, load('enemies'));
// Les tests de mécanique utilisent des primes variées, indépendantes du réglage du jeu : 5 / 6 / 8 / 12 et hausse de 4 % par manche.
const economy = { ...realEconomy, killWaveGrowth: 0.04, killGrowthCap: 3, bounty: { marcheur: 5, petit: 6, voute: 8, grand: 12 } };
const KEY = params.save.v2.storageKey;
const avec = (bleu, extra = {}) => serialiser({ ...appliquerOps(defaultProgression(), [{ id: 'g0', t: 'gain', bleu }], 1, params).save, ...extra });

// Banque sur un faux stockage local, avec une horloge de jeu que le test avance. Identifiants de partie : banque b<k>, partie run<n> (uniques entre
// deux banques d'un même test, comme les identifiants tirés par crypto dans le jeu).
let banques = 0;
function make({ search = '', initial, storage = createFakeStorage(initial === undefined ? {} : { [KEY]: JSON.stringify(initial) }), partie = {} } = {}) {
  const { repository, mode } = createRepository({ search, storage, params, format: 'v2' });
  const time = { ms: 0, wall: 1_700_000_000_000 };
  let n = 0;
  const k = (banques += 1);
  const bank = createBank({ repository, mode, economy, save: params.save, clock: () => time.ms, wall: () => time.wall, reducedMotion: false, partie, runId: () => (k === 1 ? `run${(n += 1)}` : `b${k}run${(n += 1)}`) });
  const advance = (ms) => {
    time.ms += ms;
    time.wall += ms;
    bank.tick();
  };
  return { bank, storage, repository, time, advance, mode };
}
const stored = (storage) => JSON.parse(storage.data.get(KEY));

describe('banque : monnaie jaune (partie)', () => {
  it('un zombie tué rapporte sa prime (5, 6, 8, 12 à la manche 1) en jaune', () => {
    const { bank } = make();
    expect(['marcheur', 'petit', 'voute', 'grand'].map((t) => bank.kill(t, 1))).toEqual([5, 6, 8, 12]);
    expect(bank.balance()).toBe(31);
    expect(bank.snapshot().economy).toMatchObject({ earnedRun: 31, killsRun: 4, byKind: { kill: 31, wave: 0, world: 0, test: 0 } });
  });

  it('le gain suit la manche (manche 11 : × 1,4)', () => {
    const { bank } = make();
    expect(bank.kill('grand', 11)).toBe(17);
    expect(bank.kill('marcheur', 11)).toBe(7);
  });

  it('la jaune n\'est JAMAIS écrite : ni regroupée, ni à la pause, ni à la fin de partie', () => {
    const { bank, storage, advance } = make();
    bank.kill('marcheur', 1);
    bank.repair();
    advance(10_000);
    bank.flush('pause');
    bank.runEnd({ reason: 'death' });
    const s = storage.data.has(KEY) ? stored(storage) : null;
    expect(s === null ? 0 : solde(s)).toBe(0);
    expect(JSON.stringify(s ?? {})).not.toMatch(/jaune|money/);
  });

  it('remise à 0 à chaque partie (Rejouer, Recommencer)', () => {
    const { bank } = make();
    bank.kill('grand', 1);
    expect(bank.balance()).toBe(12);
    bank.restart();
    expect(bank.balance()).toBe(0);
    expect(bank.snapshot().economy).toMatchObject({ earnedRun: 0, killsRun: 0 });
  });

  it('giveMoney (tests) ajoute un gain jaune de type test', () => {
    const { bank } = make();
    bank.giveMoney(250);
    expect(bank.snapshot().economy.byKind.test).toBe(250);
    expect(bank.balance()).toBe(250);
  });

  it('après la fin de la partie, plus aucun gain (jaune ni bleu)', () => {
    const { bank } = make();
    bank.waveStart(1);
    bank.runEnd({ reason: 'death' });
    expect(bank.kill('marcheur', 1)).toBe(0);
    expect(bank.repair()).toBe(0);
    expect(bank.waveEnd(1, false).bonus).toBe(0);
    expect(bank.worldEnd().bonus).toBe(0);
  });

  it('?money=500 (mode essai) : la jaune de la partie part de 500 ; rien n\'est écrit', () => {
    const { bank, storage } = make({ search: '?money=500' });
    expect(bank.balance()).toBe(500);
    bank.kill('petit', 1);
    expect(bank.balance()).toBe(506);
    expect(storage.calls.setItem).toBe(0);
  });
});

describe('banque : monnaie bleue (gardée)', () => {
  it('fin de manche : bonus bleu (12 à la manche 1, 30 à la 5 renforcée), une seule fois par manche, écrit aussitôt', () => {
    const { bank, storage } = make();
    bank.waveStart(1);
    expect(bank.waveEnd(1, false).bonus).toBe(12);
    expect(solde(stored(storage))).toBe(12);
    expect(bank.waveEnd(1, false).bonus).toBe(0);
    expect(bank.waveEnd(5, true).bonus).toBe(30);
    expect(solde(stored(storage))).toBe(42);
    expect(bank.snapshot().economy.byKind.wave).toBe(0); // la jaune ne reçoit plus le bonus de manche
    expect(bank.snapshot().bleu).toMatchObject({ solde: 42, run: 42, pending: 0 });
  });

  it('fin du monde : prime bleue (500) une seule fois, monde terminé ; écrite à la fin de partie', () => {
    const { bank, storage } = make();
    bank.waveStart(40);
    expect(bank.worldEnd().bonus).toBe(500);
    expect(bank.worldEnd().bonus).toBe(0);
    const end = bank.runEnd({ reason: 'world' });
    expect(stored(storage).mondes).toEqual(['batiment']);
    expect(solde(stored(storage))).toBe(500);
    expect(end).toMatchObject({ bleu: 500, world: 500, soldeBleu: 500, earned: 0 });
  });

  it('plafond du solde bleu : 9 999 999', () => {
    const { bank, storage } = make({ initial: avec(9_999_990) });
    bank.waveStart(1);
    bank.waveEnd(1, false);
    expect(solde(stored(storage))).toBe(9_999_999);
    expect(bank.soldeBleu()).toBe(9_999_999);
  });

  it('mort ou « Quitter » : jaune perdue, bleue gagnée gardée (bilan de l\'écran de fin)', () => {
    const { bank, storage } = make({ initial: avec(100) });
    bank.waveStart(1);
    bank.kill('grand', 1);
    bank.waveEnd(1, false);
    bank.waveStart(2);
    bank.kill('petit', 2);
    const end = bank.runEnd({ reason: 'quit' });
    expect(end).toMatchObject({ earned: 18, balance: 18, bleu: 12, soldeBleu: 112, reached: 2, mode: 'histoire', ok: true });
    expect(solde(stored(storage))).toBe(112);
  });

  it('infini : bleu gagné par manche aussi ; record de l\'infini séparé, jamais celui de l\'histoire', () => {
    const { bank, storage } = make({ partie: { mode: 'infini', monde: 'batiment' } });
    for (let w = 1; w <= 3; w += 1) {
      bank.waveStart(w);
      bank.waveEnd(w, false);
    }
    const end = bank.runEnd({ reason: 'death' });
    const s = stored(storage);
    expect(solde(s)).toBe(12 + 14 + 16);
    expect(s.records).toEqual({ histoire: {}, infini: { batiment: 3 } });
    expect(s.profil.partiesInfini).toBe(1);
    expect(s.profil.partiesHistoire).toBe(0);
    expect(end).toMatchObject({ mode: 'infini', best: 3, record: true });
  });

  it('« +N » bleu à la fin d\'une manche qui rapporte, puis effacé', () => {
    const { bank, advance } = make();
    bank.waveStart(1);
    bank.waveEnd(1, false);
    advance(100);
    expect(bank.gainBleu()).toMatchObject({ visible: true, text: '+12' });
    expect(bank.snapshot().bleu.gainText).toBe('+12');
    advance(1500);
    expect(bank.gainBleu().visible).toBe(false);
  });
});

describe('banque : écriture de la progression', () => {
  it('rien n\'est écrit tant qu\'aucune manche n\'a commencé et que le temps de jeu est nul', () => {
    const { bank, storage } = make();
    bank.flush('pause');
    expect(storage.calls.setItem).toBe(0);
    expect(bank.snapshot().status).toBe('saved');
  });

  it('aucune écriture regroupée : les zombies tués attendent la fin de manche, la pause ou la fin de partie', () => {
    const { bank, storage, advance } = make();
    bank.waveStart(1);
    for (let i = 0; i < 10; i += 1) {
      bank.kill('marcheur', 1);
      advance(100);
    }
    advance(30_000);
    expect(storage.calls.setItem).toBe(0);
    expect(bank.snapshot().status).toBe('pending');
    bank.flush('pause');
    expect(stored(storage).profil).toMatchObject({ tues: 10, partiesHistoire: 1 });
    expect(bank.snapshot().status).toBe('saved');
  });

  it('statistiques du Profil : zombies tués, partie comptée une fois, temps de jeu (horloge de jeu seulement : pauses exclues)', () => {
    const { bank, storage, advance, time } = make();
    bank.waveStart(1);
    bank.kill('marcheur', 1);
    advance(5000);
    bank.flush('pause');
    time.wall += 60_000; // une minute de pause : l'horloge murale avance, pas l'horloge de jeu
    bank.waveStart(2);
    advance(2500);
    bank.waveEnd(2, false);
    const s = stored(storage);
    expect(s.profil).toMatchObject({ tues: 1, partiesHistoire: 1, tempsMs: 7500 });
    expect(s.records.histoire.batiment).toBe(2);
  });

  it('« Nouveau record » seulement si la manche dépasse le record du mode et du monde (lu au début de la partie)', () => {
    const { bank } = make({ initial: avec(0, { records: { histoire: { batiment: 5 }, infini: { batiment: 90 } } }) });
    for (let w = 1; w <= 5; w += 1) bank.waveStart(w);
    expect(bank.runEnd({ reason: 'death' })).toMatchObject({ record: false, best: 5 });
    bank.restart();
    for (let w = 1; w <= 6; w += 1) bank.waveStart(w);
    expect(bank.runEnd({ reason: 'death' })).toMatchObject({ record: true, best: 6 });
  });

  it('une écriture échouée n\'efface rien : reprise à la suivante, même identifiant (jamais perdue, jamais comptée deux fois)', () => {
    const { bank, storage } = make();
    bank.waveStart(1);
    storage.failSet = quotaError();
    bank.waveEnd(1, false);
    expect(bank.snapshot()).toMatchObject({ status: 'failed', pending: 12 });
    expect(bank.snapshot().lastCommit).toMatchObject({ ok: false, error: 'QuotaExceededError' });
    expect(bank.soldeBleu()).toBe(12);
    storage.failSet = null;
    bank.flush('pause');
    bank.flush('pause');
    expect(solde(stored(storage))).toBe(12);
    expect(stored(storage).profil.partiesHistoire).toBe(1);
    expect(bank.snapshot()).toMatchObject({ status: 'saved', pending: 0 });
  });

  it('deux onglets additionnent leurs bleus (opérations à identifiants différents)', () => {
    const storage = createFakeStorage();
    const a = make({ storage });
    const b = make({ storage });
    a.bank.waveStart(1);
    b.bank.waveStart(1);
    a.bank.waveEnd(1, false);
    b.bank.waveEnd(1, false);
    expect(solde(stored(storage))).toBe(24);
    expect(stored(storage).profil.partiesHistoire).toBe(2);
  });

  it('un signal de stockage d\'un autre onglet met à jour le solde bleu affiché', () => {
    const storage = createFakeStorage();
    let handler = null;
    const repository = createLocalRepository(storage, params, { codec: codecV2(params), listen: (h) => { handler = h; return () => {}; } });
    const bank = createBank({ repository, mode: { kind: 'local', base: 'local', readOnly: false, reasons: [] }, economy, clock: () => 0, wall: () => 1 });
    expect(bank.soldeBleu()).toBe(0);
    storage.data.set(KEY, JSON.stringify(avec(77)));
    handler({ key: KEY });
    expect(bank.soldeBleu()).toBe(77);
  });

  it('la persistance est demandée une seule fois, après la première écriture réussie', async () => {
    let asked = 0;
    const storage = createFakeStorage();
    const repository = createLocalRepository(storage, params, { codec: codecV2(params), persist: async () => { asked += 1; return true; } });
    let ms = 0;
    const bank = createBank({ repository, mode: { kind: 'local', base: 'local', readOnly: false, reasons: [] }, economy, clock: () => ms, wall: () => 1 });
    bank.flush('x');
    expect(asked).toBe(0);
    bank.waveStart(1);
    bank.waveEnd(1, false);
    bank.waveStart(2);
    bank.waveEnd(2, false);
    ms = 10;
    await Promise.resolve();
    await Promise.resolve();
    expect(asked).toBe(1);
  });

  it('en mode essai, ni écriture ni demande de persistance ; la vraie progression est lue (solde bleu affiché)', () => {
    const storage = createFakeStorage({ [KEY]: JSON.stringify(avec(300)) });
    const { bank } = make({ storage, search: '?wave=5' });
    expect(bank.soldeBleu()).toBe(300);
    bank.waveStart(5);
    bank.waveEnd(5, true);
    bank.runEnd({ reason: 'death' });
    expect(storage.calls.setItem).toBe(0);
    expect(bank.snapshot()).toMatchObject({ status: 'readonly', readOnly: true });
    expect(bank.runEnd({ reason: 'death' })).toBe(null);
  });

  it('?endless=1 (mode essai) : rien n\'est écrit', () => {
    const { bank, storage } = make({ search: '?endless=1', partie: { mode: 'infini' } });
    bank.waveStart(41);
    bank.waveEnd(41, false);
    expect(storage.calls.setItem).toBe(0);
  });

  it('?test=1 (mémoire) : état « memory », jamais d\'accès au stockage', () => {
    const { bank, storage } = make({ search: '?test=1' });
    bank.waveStart(1);
    bank.waveEnd(1, false);
    expect(bank.snapshot().status).toBe('memory');
    expect(storage.calls.setItem + storage.calls.getItem).toBe(0);
  });

  it('progression illisible : état « locked », aucune écriture, jamais écrasée', () => {
    const storage = createFakeStorage({ [KEY]: '{bad' });
    const { bank } = make({ storage });
    bank.waveStart(1);
    bank.waveEnd(1, false);
    bank.flush('pause');
    expect(storage.calls.setItem).toBe(0);
    expect(bank.snapshot()).toMatchObject({ status: 'locked', locked: true });
    expect(storage.data.get(KEY)).toBe('{bad');
  });

  it('stockage indisponible : état « unavailable », le jeu continue', () => {
    const { bank } = make({ storage: null });
    bank.kill('marcheur', 1);
    bank.waveStart(1);
    expect(() => bank.waveEnd(1, false)).not.toThrow();
    expect(bank.snapshot()).toMatchObject({ status: 'unavailable', balance: 5 });
  });

  it('restart : écrit ce qui attend, nouvelle partie (nouvel identifiant), nouveaux bonus permis', () => {
    const { bank, storage } = make();
    bank.waveStart(1);
    bank.waveEnd(1, false);
    bank.restart();
    bank.waveStart(1);
    expect(bank.waveEnd(1, false).bonus).toBe(12);
    expect(solde(stored(storage))).toBe(24);
    expect(stored(storage).profil.partiesHistoire).toBe(2);
    expect(stored(storage).journal).toHaveLength(2);
    expect(new Set(stored(storage).journal).size).toBe(2);
  });

  it('restart avec un échec en cours garde la bleue en attente (écrite plus tard)', () => {
    const { bank, storage } = make();
    bank.waveStart(1);
    storage.failSet = quotaError();
    bank.waveEnd(1, false);
    bank.restart();
    expect(bank.soldeBleu()).toBe(12);
    storage.failSet = null;
    bank.flush('x');
    expect(solde(stored(storage))).toBe(12);
  });
});

describe('banque : « +N » jaune', () => {
  it('agrège les gains récents en un seul texte et s\'efface ensuite', () => {
    const { bank, advance } = make();
    bank.kill('marcheur', 1);
    advance(100);
    bank.kill('petit', 1);
    advance(300);
    expect(bank.gain()).toMatchObject({ visible: true, text: '+11' });
    expect(bank.snapshot().economy.gainText).toBe('+11');
    advance(1300);
    expect(bank.gain().visible).toBe(false);
  });
});

describe('banque : montants du jeu (retour du propriétaire : montants fixes)', () => {
  function real() {
    const storage = createFakeStorage();
    const { repository, mode } = createRepository({ search: '', storage, params, format: 'v2' });
    const bank = createBank({ repository, mode, economy: realEconomy, clock: () => 0, wall: () => 1 });
    return { bank, storage };
  }

  it('un zombie tué rapporte 10 jaunes, quel que soit son type ou la manche', () => {
    const { bank } = real();
    expect(['marcheur', 'petit', 'voute', 'grand'].map((t) => bank.kill(t, 1))).toEqual([10, 10, 10, 10]);
    expect(bank.kill('grand', 30)).toBe(10);
    expect(bank.kill('petit', 200)).toBe(10);
  });

  it('une planche posée rapporte 1 jaune (type « repair »)', () => {
    const { bank } = real();
    expect(bank.repair()).toBe(1);
    expect(bank.repair()).toBe(1);
    expect(bank.balance()).toBe(2);
    expect(bank.snapshot().economy.byKind.repair).toBe(2);
    expect(bank.snapshot().economy.killsRun).toBe(0);
  });

  it('bleu de manche : 10 + 2 × manche (× 1,5 renforcée) ; prime du monde 500', () => {
    const { bank, storage } = real();
    bank.waveStart(1);
    expect(bank.waveEnd(1, false).bonus).toBe(12);
    expect(bank.waveEnd(10, true).bonus).toBe(45);
    expect(bank.worldEnd().bonus).toBe(500);
    bank.runEnd({ reason: 'world' });
    expect(solde(stored(storage))).toBe(557);
  });
});
