import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { makeEconomy } from '../../js/core/economy.js';
import { defaultSave } from '../../js/core/save.js';
import { createBank } from '../../js/game/bank.js';
import { createRepository } from '../../js/save/index.js';
import { createLocalRepository } from '../../js/save/local-repository.js';
import { createFakeStorage, quotaError } from './helpers/fake-storage.js';

const load = (name) => JSON.parse(readFileSync(`data/game/${name}.json`, 'utf8'));
const params = { save: load('save'), economy: load('economy'), stats: load('player-stats') };
const economy = makeEconomy(params.economy, load('enemies'));
const KEY = params.save.storageKey;

// Banque sur un faux stockage local, avec une horloge de jeu que le test avance.
function make({ search = '', initial, storage = createFakeStorage(initial === undefined ? {} : { [KEY]: JSON.stringify(initial) }) } = {}) {
  const { repository, mode } = createRepository({ search, storage, params });
  const time = { ms: 0, wall: 1_700_000_000_000 };
  const bank = createBank({ repository, mode, economy, save: params.save, clock: () => time.ms, wall: () => time.wall, reducedMotion: false });
  const advance = (ms) => {
    time.ms += ms;
    time.wall += ms;
    bank.tick();
  };
  return { bank, storage, repository, time, advance, mode };
}
const stored = (storage) => JSON.parse(storage.data.get(KEY));

describe('banque : gains', () => {
  it('un zombie tué rapporte sa prime (5, 6, 8, 12 à la manche 1) et gonfle le solde affiché', () => {
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

  it('le bonus de fin de manche est versé une seule fois par manche (12 à la manche 1, 30 à la 5 renforcée)', () => {
    const { bank } = make();
    expect(bank.waveEnd(1, false).bonus).toBe(12);
    expect(bank.waveEnd(1, false).bonus).toBe(0);
    expect(bank.waveEnd(5, true).bonus).toBe(30);
    expect(bank.snapshot().economy.byKind.wave).toBe(42);
  });

  it('le bonus de fin de monde (500) est versé une seule fois et compte un monde terminé', () => {
    const { bank, storage } = make();
    bank.waveStart(40);
    expect(bank.worldEnd().bonus).toBe(500);
    expect(bank.worldEnd().bonus).toBe(0);
    bank.runEnd({ kills: 100, reason: 'world' });
    expect(stored(storage).records.worldsCompleted).toBe(1);
    expect(stored(storage).money).toBe(500);
  });

  it('giveMoney ajoute un gain de type test', () => {
    const { bank } = make();
    bank.giveMoney(250);
    expect(bank.snapshot().economy.byKind.test).toBe(250);
    expect(bank.balance()).toBe(250);
  });

  it('après la fin de la partie, plus aucun gain', () => {
    const { bank } = make();
    bank.waveStart(1);
    bank.runEnd({ kills: 0, reason: 'death' });
    expect(bank.kill('marcheur', 1)).toBe(0);
    expect(bank.waveEnd(1, false).bonus).toBe(0);
    expect(bank.worldEnd().bonus).toBe(0);
  });

  it('le solde affiché ne dépasse jamais le plafond', () => {
    const { bank } = make({ initial: { ...defaultSave(), v: 1, money: 9_999_990 } });
    bank.giveMoney(100);
    expect(bank.balance()).toBe(9_999_999);
  });
});

describe('banque : écriture', () => {
  it('rien n\'est écrit tant qu\'aucun gain ni aucune manche n\'a eu lieu', () => {
    const { bank, storage, advance } = make();
    advance(10_000);
    bank.flush('pause');
    expect(storage.calls.setItem).toBe(0);
    expect(bank.snapshot().status).toBe('saved');
  });

  it('10 kills en 1 s produisent au plus 2 écritures (regroupées toutes les 2 s)', () => {
    const { bank, storage, advance } = make();
    bank.waveStart(1);
    for (let i = 0; i < 10; i += 1) {
      bank.kill('marcheur', 1);
      advance(100);
    }
    advance(3000);
    expect(storage.calls.setItem).toBeLessThanOrEqual(2);
    expect(stored(storage).money).toBe(50);
    expect(bank.snapshot().status).toBe('saved');
  });

  it('en attente jusqu\'au commit regroupé, puis enregistrée', () => {
    const { bank, advance } = make();
    bank.kill('marcheur', 1);
    expect(bank.snapshot().status).toBe('pending');
    advance(1999);
    expect(bank.snapshot().status).toBe('pending');
    advance(1);
    expect(bank.snapshot().status).toBe('saved');
  });

  it('écriture immédiate à la fin de manche', () => {
    const { bank, storage } = make();
    bank.waveStart(1);
    bank.kill('marcheur', 1);
    bank.waveEnd(1, false);
    expect(stored(storage)).toMatchObject({ money: 17, earned: 17, records: { bestWave: 1, runs: 1 } });
  });

  it('écriture immédiate à la mort : meilleure manche, meilleur nombre de tués, partie comptée', () => {
    const { bank, storage } = make();
    bank.waveStart(1);
    bank.waveStart(2);
    bank.kill('petit', 2);
    const summary = bank.runEnd({ kills: 7, reason: 'death' });
    expect(stored(storage).records).toEqual({ bestWave: 2, bestKills: 7, runs: 1, worldsCompleted: 0 });
    expect(summary).toMatchObject({ earned: 6, balance: 6, best: 2, record: true, ok: true });
  });

  it('« Nouveau record » seulement si la manche dépasse l\'ancien record (lu au début de la partie)', () => {
    const { bank } = make({ initial: { ...defaultSave(), v: 1, records: { bestWave: 5, bestKills: 0, runs: 3, worldsCompleted: 0 } } });
    bank.waveStart(1);
    for (let w = 2; w <= 5; w += 1) bank.waveStart(w);
    bank.flush('auto');
    expect(bank.runEnd({ kills: 1, reason: 'death' }).record).toBe(false);
    bank.restart();
    for (let w = 1; w <= 6; w += 1) bank.waveStart(w);
    expect(bank.runEnd({ kills: 1, reason: 'death' }).record).toBe(true);
  });

  it('la première manche de la partie ajoute une partie jouée (runs + 1), pas les suivantes', () => {
    const { bank, storage } = make();
    bank.waveStart(1);
    bank.waveStart(2);
    bank.flush('pause');
    expect(stored(storage).records.runs).toBe(1);
  });

  it('un commit échoué n\'efface pas le montant : repris au commit suivant, jamais perdu ni doublé', () => {
    const { bank, storage, advance } = make();
    bank.waveStart(1);
    bank.kill('marcheur', 1);
    storage.failSet = quotaError();
    expect(bank.flush('pause').ok).toBe(false);
    expect(bank.snapshot()).toMatchObject({ status: 'failed', pending: 5, balance: 5 });
    expect(bank.snapshot().lastCommit).toMatchObject({ ok: false, error: 'QuotaExceededError' });
    bank.kill('marcheur', 1);
    storage.failSet = null;
    advance(2000);
    expect(stored(storage).money).toBe(10);
    expect(stored(storage).earned).toBe(10);
    expect(stored(storage).records.runs).toBe(1);
    expect(bank.snapshot()).toMatchObject({ status: 'saved', pending: 0, balance: 10 });
    advance(10_000);
    expect(stored(storage).money).toBe(10);
  });

  it('un échec programme une nouvelle tentative (toutes les autosaveMs)', () => {
    const { bank, storage, advance } = make();
    storage.failSet = quotaError();
    bank.kill('marcheur', 1);
    advance(2000);
    const tries = storage.calls.setItem;
    expect(tries).toBe(1);
    advance(2000);
    expect(storage.calls.setItem).toBe(2);
  });

  it('deux onglets additionnent leurs gains (chacun écrit une différence)', () => {
    const storage = createFakeStorage();
    const a = make({ storage });
    const b = make({ storage });
    a.bank.kill('marcheur', 1);
    b.bank.kill('marcheur', 1);
    a.bank.flush('x');
    b.bank.flush('x');
    expect(stored(storage).money).toBe(10);
    expect(b.bank.balance()).toBe(10);
  });

  it('un signal de stockage d\'un autre onglet met à jour le solde affiché', () => {
    const storage = createFakeStorage();
    let handler = null;
    const repository = createLocalRepository(storage, params, { listen: (h) => { handler = h; return () => {}; } });
    const bank = createBank({ repository, mode: { kind: 'local', base: 'local', readOnly: false, reasons: [] }, economy, save: params.save, clock: () => 0, wall: () => 1 });
    expect(bank.balance()).toBe(0);
    storage.data.set(KEY, JSON.stringify({ ...defaultSave(), money: 77 }));
    handler({ key: KEY });
    expect(bank.balance()).toBe(77);
  });

  it('la persistance est demandée une seule fois, après la première écriture réussie', async () => {
    let asked = 0;
    const storage = createFakeStorage();
    const repository = createLocalRepository(storage, params, { persist: async () => { asked += 1; return true; } });
    const bank = createBank({ repository, mode: { kind: 'local', base: 'local', readOnly: false, reasons: [] }, economy, save: params.save, clock: () => 0, wall: () => 1 });
    bank.flush('x');
    expect(asked).toBe(0);
    bank.kill('marcheur', 1);
    bank.flush('x');
    bank.kill('marcheur', 1);
    bank.flush('x');
    await Promise.resolve();
    await Promise.resolve();
    expect(asked).toBe(1);
  });

  it('en mode essai, ni écriture ni demande de persistance ; le solde de session évolue', () => {
    const storage = createFakeStorage({ [KEY]: JSON.stringify({ ...defaultSave(), money: 300 }) });
    const { bank } = make({ storage, search: '?wave=5' });
    expect(bank.balance()).toBe(300);
    bank.waveStart(5);
    bank.kill('marcheur', 5);
    bank.flush('pause');
    bank.runEnd({ kills: 1, reason: 'death' });
    expect(storage.calls.setItem).toBe(0);
    expect(bank.snapshot()).toMatchObject({ status: 'readonly', readOnly: true });
    expect(bank.balance()).toBe(306);
  });

  it('?money=500 : solde de session de 500, sauvegarde réelle inchangée', () => {
    const storage = createFakeStorage({ [KEY]: JSON.stringify({ ...defaultSave(), money: 300 }) });
    const { bank } = make({ storage, search: '?money=500' });
    expect(bank.balance()).toBe(500);
    bank.kill('petit', 1);
    expect(bank.balance()).toBe(506);
    expect(storage.calls.setItem).toBe(0);
  });

  it('?test=1 (mémoire) : état « memory », jamais d\'accès au stockage', () => {
    const { bank, storage } = make({ search: '?test=1' });
    bank.kill('marcheur', 1);
    bank.flush('x');
    expect(bank.snapshot().status).toBe('memory');
    expect(storage.calls.setItem + storage.calls.getItem).toBe(0);
  });

  it('sauvegarde illisible : état « locked », aucune écriture, le solde reste en mémoire', () => {
    const storage = createFakeStorage({ [KEY]: '{bad' });
    const { bank, advance } = make({ storage });
    bank.waveStart(1);
    bank.kill('marcheur', 1);
    for (let i = 0; i < 20; i += 1) advance(2000);
    bank.flush('pause');
    expect(storage.calls.setItem).toBe(0);
    expect(bank.snapshot()).toMatchObject({ status: 'locked', locked: true, balance: 5 });
    expect(storage.data.get(KEY)).toBe('{bad');
  });

  it('stockage indisponible : état « unavailable », le jeu continue', () => {
    const { bank } = make({ storage: null });
    bank.kill('marcheur', 1);
    expect(() => bank.flush('x')).not.toThrow();
    expect(bank.snapshot()).toMatchObject({ status: 'unavailable', balance: 5 });
  });

  it('restart : écrit ce qui attend, remet à zéro les compteurs de la partie et autorise de nouveaux bonus', () => {
    const { bank, storage } = make();
    bank.waveStart(1);
    bank.kill('marcheur', 1);
    bank.waveEnd(1, false);
    bank.restart();
    expect(stored(storage).money).toBe(17);
    expect(bank.snapshot().economy).toMatchObject({ earnedRun: 0, killsRun: 0 });
    bank.waveStart(1);
    expect(bank.waveEnd(1, false).bonus).toBe(12);
    bank.flush('x');
    expect(stored(storage).money).toBe(29);
    expect(stored(storage).records.runs).toBe(2);
  });

  it('restart avec un échec en cours garde le montant en attente', () => {
    const { bank, storage } = make();
    bank.kill('marcheur', 1);
    storage.failSet = quotaError();
    bank.restart();
    expect(bank.balance()).toBe(5);
    expect(bank.snapshot().economy.earnedRun).toBe(0);
    storage.failSet = null;
    bank.flush('x');
    expect(stored(storage).money).toBe(5);
  });
});

describe('banque : « +N »', () => {
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
