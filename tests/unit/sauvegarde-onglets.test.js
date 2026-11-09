import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { defaultSave, encodeSave, decodeSave, makeRecord, migrate, RECORD_KIND, RECORD_VERSION, sanitize, commitDelta } from '../../js/core/save.js';
import * as merge from '../../js/core/save-merge.js';
import { createLocalRepository } from '../../js/save/local-repository.js';
import { createRepository } from '../../js/save/index.js';
import { createFakeStorage, quotaError } from './helpers/fake-storage.js';
import { campaign, simulate } from './helpers/onglets-simulateur.js';

// Lot 5o : défaut des deux onglets (une lecture périmée du stockage effaçait le gain d'un autre onglet) et son correctif (relevés par le canal entre
// onglets, réécriture des gains certainement absents : js/core/save-merge.js). Le banc d'essai est le simulateur de tests/unit/helpers/onglets-simulateur.js.
// La campagne complète (10 000 entrelacements par nombre d'onglets) : ONGLETS_N=10000 npx vitest run tests/unit/sauvegarde-onglets.test.js.
const load = (name) => JSON.parse(readFileSync(`data/game/${name}.json`, 'utf8'));
const params = { save: load('save'), economy: load('economy'), stats: load('player-stats') };
const KEY = params.save.storageKey;
const N = Number(process.env.ONGLETS_N ?? 1000);

// Faux canal : garde les messages envoyés ; deliver() remet un message au dépôt comme le ferait BroadcastChannel.
function fakeChannel() {
  const ch = { sent: [], listener: null, postMessage: (m) => ch.sent.push(structuredClone(m)), addEventListener: (_t, fn) => { ch.listener = fn; } };
  ch.deliver = (data) => ch.listener?.({ data });
  return ch;
}
const textOf = (save) => JSON.stringify(save);

describe('simulateur (banc d\'essai, graine fixe)', () => {
  it('déterministe : même graine, même déroulé', () => {
    const a = simulate({ seed: 42, tabs: 3, algo: 'releves', params });
    const b = simulate({ seed: 42, tabs: 3, algo: 'releves', params });
    expect(a).toEqual(b);
  });

  it.each([2, 3, 4])('algorithme d\'avant (dépôt sans canal), %i onglets : la perte est retrouvée, jamais de double comptage', (tabs) => {
    const c = campaign({ n: 200, tabs, algo: 'avant', params });
    expect(c.pertes).toBeGreaterThan(0);
    expect(c.doubles).toBe(0);
    expect(c.exemplePerte.final).toBeLessThan(c.exemplePerte.attendu);
  });

  it.each([2, 3, 4])(`correctif, %i onglets, ${N} entrelacements : aucun gain perdu, aucun compté deux fois, toujours au calme`, (tabs) => {
    const c = campaign({ n: N, tabs, algo: 'releves', params });
    expect({ pertes: c.pertes, doubles: c.doubles, calmes: c.calmes }).toEqual({ pertes: 0, doubles: 0, calmes: N });
  }, 120_000);

  it('correctif, conditions plus dures (12 gains, retards de 30) : aucune perte ni double comptage', () => {
    const c = campaign({ n: 200, tabs: 3, algo: 'releves', params, commits: 12, retard: 30, first: 7001 });
    expect([c.pertes, c.doubles]).toEqual([0, 0]);
  }, 60_000);

  it('pistes écartées, mesurées sur le même banc : verrou (a) et mémoire (c) perdent encore des gains', () => {
    expect(campaign({ n: 200, tabs: 2, algo: 'verrou', params }).pertes).toBeGreaterThan(0);
    expect(campaign({ n: 200, tabs: 2, algo: 'memoire', params }).pertes).toBeGreaterThan(0);
  });
});

describe('save-merge.js (pur)', () => {
  const view = (extra = {}) => ({ id: 'a', settled: 0, ops: new Map([[1, { money: 10 }], [2, { money: 5 }]]), own: new Map(), records: new Map(), seen: new Map(), ...extra });

  it('parseRecord : relevé valide ; entrées hostiles refusées sans exception', () => {
    expect(merge.parseRecord(makeRecord('b', null, '{"v":1}'), 100)).toEqual({ by: 'b', base: null, value: '{"v":1}' });
    for (const bad of [null, 1, 'x', [], {}, { kind: RECORD_KIND }, { kind: RECORD_KIND, v: 2, by: 'b', base: null, value: 'x' }, { kind: 'autre', v: RECORD_VERSION, by: 'b', base: null, value: 'x' },
      { kind: RECORD_KIND, v: RECORD_VERSION, by: '', base: null, value: 'x' }, { kind: RECORD_KIND, v: RECORD_VERSION, by: 'b', base: 3, value: 'x' }, { kind: RECORD_KIND, v: RECORD_VERSION, by: 'b', base: null, value: '' },
      { kind: RECORD_KIND, v: RECORD_VERSION, by: 'x'.repeat(65), base: null, value: 'x' }, { kind: RECORD_KIND, v: RECORD_VERSION, by: 'b', base: null, value: 'x'.repeat(101) }, { kind: RECORD_KIND, v: RECORD_VERSION, by: { toString: () => 'b' }, base: null, value: 'x' }]) {
      expect(merge.parseRecord(bad, 100)).toBeNull();
    }
  });

  it('sumDeltas : sommes et maxima ; valeurs invalides ignorées', () => {
    expect(merge.sumDeltas([{ money: 10, earned: 10, bestWave: 3 }, { money: -4, runs: 1, bestWave: 7, bestKills: 2 }, null, { money: 1.5, worlds: 'x' }])).toEqual({ money: 6, earned: 10, runs: 1, worlds: 0, bestWave: 7, bestKills: 2 });
    expect(merge.sumDeltas('x')).toEqual({ money: 0, earned: 0, runs: 0, worlds: 0, bestWave: 0, bestKills: 0 });
  });

  it('missingOps : valeur d\'un autre onglet bâtie sur la valeur du chargement → les deux gains manquent', () => {
    const v = view({ own: new Map([['A1', { base: 'P', adds: [1] }], ['A2', { base: 'A1', adds: [2] }]]), records: new Map([['B1', [{ by: 'b', base: 'P' }]]]), seen: new Map([['P', 0], ['B1', 2]]) });
    expect(merge.missingOps(v, 'B1')).toEqual([1, 2]);
    expect(merge.missingOps(v, 'A2')).toEqual([]);
  });

  it('missingOps : attend l\'événement d\'une valeur d\'un autre onglet, puis son relevé ; valeur inconnue → rien (dans le doute, aucune réécriture)', () => {
    const v = view({ own: new Map([['A1', { base: 'P', adds: [1, 2] }]]), seen: new Map([['P', 0]]) });
    expect(merge.missingOps(v, 'B1')).toBeNull(); // ni événement ni écriture de l'onglet
    v.records.set('B1', [{ by: 'b', base: 'P' }]);
    expect(merge.missingOps(v, 'B1')).toBeNull(); // relevé arrivé, événement pas encore
    v.seen.set('B1', 2);
    expect(merge.missingOps(v, 'B1')).toEqual([1, 2]);
    v.seen.set('C1', 2);
    expect(merge.missingOps(v, 'C1')).toEqual([]); // vue au compte 2, sans relevé : les gains 1 et 2 sont peut-être inclus
    v.records.set('D1', [{ by: 'd', base: 'X' }]);
    v.seen.set('D1', 2);
    expect(merge.missingOps(v, 'D1')).toBeNull(); // base inconnue (ancienne version, page Sauvegarde)
  });

  it('missingOps : base absente (clé vide) → tout manque, sauf les gains abandonnés (« Repartir de zéro » vu par l\'événement)', () => {
    const v = view({ records: new Map([['B1', [{ by: 'b', base: null }]]]), seen: new Map([['B1', 2]]) });
    expect(merge.missingOps(v, 'B1')).toEqual([1, 2]);
    expect(merge.missingOps({ ...v, settled: 2 }, 'B1')).toEqual([]);
    expect(merge.missingOps(v, null)).toEqual([]);
  });

  it('missingOps : texte écrit à l\'identique par deux onglets → attribué au plus petit identifiant, le même pour tous', () => {
    const own = new Map([['X', { base: 'P', adds: [1] }]]);
    const seen = new Map([['P', 0], ['X', 1]]);
    const mine = view({ id: 'a', ops: new Map([[1, { money: 10 }]]), own, records: new Map([['X', [{ by: 'b', base: 'P' }]]]), seen });
    expect(merge.missingOps(mine, 'X')).toEqual([]);
    const other = view({ id: 'b', ops: new Map([[1, { money: 10 }]]), own, records: new Map([['X', [{ by: 'a', base: 'P' }]]]), seen });
    expect(merge.missingOps(other, 'X')).toEqual([1]);
  });

  it('newerBase : écriture annoncée plus récente que la copie locale (chaîne unique) ; conflit ou rien → null', () => {
    const records = new Map([['B1', [{ by: 'b', base: 'P' }]], ['B2', [{ by: 'b', base: 'B1' }]]]);
    expect(merge.newerBase(view({ records }), 'P')).toBe('B2');
    expect(merge.newerBase(view({ records }), 'B2')).toBeNull();
    records.set('C1', [{ by: 'c', base: 'P' }]);
    expect(merge.newerBase(view({ records }), 'P')).toBeNull(); // deux descendants : conflit
    expect(merge.newerBase(view({ records }), null)).toBeNull();
    const loop = new Map([['X', [{ by: 'b', base: 'Y' }]], ['Y', [{ by: 'b', base: 'X' }]]]);
    expect(() => merge.newerBase(view({ records: loop }), 'X')).not.toThrow();
  });

  it('missingOps : chaîne trop longue ou en boucle → null, sans exception', () => {
    const records = new Map([['X', [{ by: 'b', base: 'Y' }]], ['Y', [{ by: 'b', base: 'X' }]]]);
    expect(merge.missingOps(view({ records, seen: new Map([['X', 1], ['Y', 1]]) }), 'X')).toBeNull();
  });
});

describe('local-repository : suivi entre onglets', () => {
  // Session scriptée : gains, échec d'écriture, records, import et effacement ; renvoie les textes écrits successivement.
  function session(options) {
    const storage = createFakeStorage();
    const texts = [];
    const set = storage.setItem;
    storage.setItem = (k, v) => {
      set(k, v);
      texts.push(v);
    };
    const repo = createLocalRepository(storage, params, options);
    repo.load();
    repo.commit({ money: 10, earned: 10, runs: 1, bestWave: 1 }, 1000);
    repo.commit({ money: 25, earned: 25, bestWave: 4, bestKills: 7 }, 3000);
    storage.failSet = quotaError();
    expect(repo.commit({ money: 5, earned: 5 }, 4000).ok).toBe(false);
    storage.failSet = null;
    repo.commit({ money: 5, earned: 5, worlds: 1 }, 5000);
    repo.commit({ money: -3 }, 5000);
    repo.replace({ ...defaultSave(), money: 99, earned: 120 }, 6000);
    repo.commit({ money: 1, earned: 1 }, 7000);
    repo.clear();
    repo.commit({ money: 2, earned: 2 }, 8000);
    return texts;
  }

  it('un seul onglet : les textes écrits sont identiques, octet pour octet, avec et sans canal (sans canal = code d\'avant le lot)', () => {
    const before = session({});
    const channel = fakeChannel();
    const after = session({ channel: () => channel, merge, now: () => 1 });
    expect(after).toEqual(before);
    expect(after.some((t) => t.includes('"w"'))).toBe(false);
    expect(channel.sent[0]).toMatchObject({ kind: 'zs-onglet', v: 1 }); // annonce à l'ouverture
    expect(channel.sent.filter((m) => m.kind === RECORD_KIND).length).toBe(7); // un relevé par écriture réussie (6 commits + 1 import ; l'effacement n'écrit rien)
  });

  it('sans canal (navigateur sans BroadcastChannel, fabrique qui lève ou renvoie null) : aucun suivi, aucune erreur', () => {
    for (const channel of [undefined, () => null, () => { throw new Error('non'); }, () => ({})]) {
      const storage = createFakeStorage();
      const repo = createLocalRepository(storage, params, { channel, merge });
      expect(repo.tabsInfo()).toBeNull();
      expect(repo.commit({ money: 10, earned: 10 }, 1).ok).toBe(true);
      repo.handleStorageEvent({ key: KEY, newValue: null, storageArea: storage });
    }
  });

  it('un autre onglet s\'annonce : réponse unique, save-merge.js chargé, identifiant d\'écriture `w` ajouté ensuite (et seulement ensuite)', async () => {
    const storage = createFakeStorage();
    const channel = fakeChannel();
    const loader = vi.fn(async () => merge);
    const repo = createLocalRepository(storage, params, { channel: () => channel, merge: loader, tabId: 'a' });
    repo.load();
    repo.commit({ money: 10, earned: 10 }, 1);
    expect(JSON.parse(storage.data.get(KEY)).w).toBeUndefined();
    expect(loader).not.toHaveBeenCalled();
    channel.deliver({ kind: 'zs-onglet', v: 1, by: 'b' });
    channel.deliver({ kind: 'zs-onglet', v: 1, by: 'b' });
    expect(channel.sent.filter((m) => m.kind === 'zs-onglet').length).toBe(2); // annonce + une seule réponse
    await vi.waitFor(() => expect(repo.tabsInfo().merge).toBe(true));
    expect(loader).toHaveBeenCalledTimes(1);
    repo.commit({ money: 10, earned: 10 }, 2);
    const stored = JSON.parse(storage.data.get(KEY));
    expect(stored).toMatchObject({ money: 20, earned: 20, w: 'a.1' });
    // L'extension est facultative : la lecture (V0.5, V0.6 et ce lot ont le même save.js de lecture) garde toutes les données.
    const read = migrate(stored, params);
    expect(read.ok).toBe(true);
    expect(read.save).toMatchObject({ money: 20, earned: 20, rev: 2 });
    expect(Object.keys(read.save)).not.toContain('w');
    expect(encodeSave(stored, params)).toBe(encodeSave(read.save, params)); // export ZS1 inchangé
    expect(decodeSave(encodeSave(stored, params), params).save).toEqual(read.save);
  });

  it('chargement de save-merge.js refusé : aucune exception, les gains continuent d\'être écrits comme avant', async () => {
    const storage = createFakeStorage();
    const channel = fakeChannel();
    const repo = createLocalRepository(storage, params, { channel: () => channel, merge: () => Promise.reject(new Error('hors ligne')) });
    channel.deliver({ kind: 'zs-onglet', v: 1, by: 'b' });
    await new Promise((r) => setTimeout(r, 0));
    expect(repo.tabsInfo().merge).toBe(false);
    expect(repo.commit({ money: 10, earned: 10 }, 1).ok).toBe(true);
    expect(JSON.parse(storage.data.get(KEY)).money).toBe(10);
  });

  it('messages hostiles sur le canal : ignorés, aucune exception, aucune écriture', () => {
    const storage = createFakeStorage();
    const channel = fakeChannel();
    const repo = createLocalRepository(storage, params, { channel: () => channel, merge, tabId: 'a' });
    repo.load();
    const writes = storage.calls.setItem;
    for (const data of [null, undefined, 3, 'x', [], { kind: 'zs-onglet', by: 7 }, { kind: 'zs-onglet', by: 'a' }, { kind: RECORD_KIND, v: 1, by: 'b', base: null, value: '{bad' }, makeRecord('b', 'inconnu', '{"v":1,"money":1e9}'), { __proto__: { kind: RECORD_KIND } }]) {
      expect(() => channel.deliver(data)).not.toThrow();
    }
    expect(storage.calls.setItem).toBe(writes);
  });

  it('deux dépôts, lecture périmée : le gain effacé est réécrit une fois, ni perdu ni compté deux fois', () => {
    // Deux onglets, deux copies du stockage (la copie de B est périmée) et un « navigateur » qui garde la valeur de référence.
    const P = textOf(commitDelta(defaultSave(), { money: 50, earned: 50 }, 1, params));
    const a = { storage: createFakeStorage({ [KEY]: P }), channel: fakeChannel() };
    const b = { storage: createFakeStorage({ [KEY]: P }), channel: fakeChannel() };
    a.repo = createLocalRepository(a.storage, params, { channel: () => a.channel, merge, tabId: 'a', now: () => 9 });
    b.repo = createLocalRepository(b.storage, params, { channel: () => b.channel, merge, tabId: 'b', now: () => 9 });
    a.repo.load();
    b.repo.load();
    const hello = (from, to) => to.channel.deliver(from.channel.sent.shift());
    hello(a, b);
    hello(b, a);
    b.channel.sent.length = 0;
    a.channel.sent.length = 0;
    a.repo.commit({ money: 10, earned: 10 }, 2); // A écrit 60 ; son relevé n'est pas encore arrivé chez B
    b.repo.commit({ money: 10, earned: 10 }, 3); // B relit 50 (périmé) et écrit 60 : le gain de A est effacé
    const auth = b.storage.data.get(KEY);
    expect(JSON.parse(auth).money).toBe(60);
    // A reçoit l'écriture de B (copie mise à jour, puis événement) et son relevé, dans n'importe quel ordre.
    a.storage.data.set(KEY, auth);
    a.channel.deliver(b.channel.sent.shift());
    expect(a.storage.calls.setItem).toBe(1); // l'événement n'est pas encore arrivé : A attend
    a.repo.handleStorageEvent({ key: KEY, newValue: auth, storageArea: a.storage });
    const repaired = JSON.parse(a.storage.data.get(KEY));
    expect(repaired).toMatchObject({ money: 70, earned: 70, rev: 3, w: 'a.2' });
    // B reçoit la réparation : elle contient son gain, rien à faire.
    b.storage.data.set(KEY, a.storage.data.get(KEY));
    b.channel.deliver(a.channel.sent.at(-1));
    b.repo.handleStorageEvent({ key: KEY, newValue: a.storage.data.get(KEY), storageArea: b.storage });
    expect(JSON.parse(b.storage.data.get(KEY)).money).toBe(70);
    expect(b.storage.calls.setItem).toBe(1);
  });

  it('relevé arrivé avant la mise à jour du stockage : l\'écriture est bâtie dessus et juste tout de suite (aucune réparation)', () => {
    const P = textOf(commitDelta(defaultSave(), { money: 50, earned: 50 }, 1, params));
    const a = { storage: createFakeStorage({ [KEY]: P }), channel: fakeChannel() };
    const b = { storage: createFakeStorage({ [KEY]: P }), channel: fakeChannel() };
    a.repo = createLocalRepository(a.storage, params, { channel: () => a.channel, merge, tabId: 'a' });
    b.repo = createLocalRepository(b.storage, params, { channel: () => b.channel, merge, tabId: 'b' });
    a.repo.load();
    b.repo.load();
    b.channel.deliver(a.channel.sent.shift());
    a.channel.deliver(b.channel.sent.shift());
    b.channel.sent.length = 0;
    a.repo.commit({ money: 10, earned: 10 }, 2);
    b.channel.deliver(a.channel.sent.at(-1)); // le relevé de A arrive, pas encore son écriture
    expect(b.repo.commit({ money: 10, earned: 10 }, 3).save.money).toBe(70);
    expect(JSON.parse(b.storage.data.get(KEY))).toMatchObject({ money: 70, rev: 3 });
    expect(b.channel.sent.at(-1)).toMatchObject({ base: a.storage.data.get(KEY) });
  });

  it('« Repartir de zéro » dans un autre onglet (événement : clé effacée) : les gains d\'avant ne sont jamais réécrits', () => {
    const storage = createFakeStorage();
    const channel = fakeChannel();
    const repo = createLocalRepository(storage, params, { channel: () => channel, merge, tabId: 'a' });
    repo.load();
    channel.deliver({ kind: 'zs-onglet', v: 1, by: 'b' });
    repo.commit({ money: 10, earned: 10 }, 1);
    storage.data.delete(KEY);
    repo.handleStorageEvent({ key: KEY, newValue: null, storageArea: storage });
    expect(repo.tabsInfo().settled).toBe(1);
    const W = textOf(commitDelta(defaultSave(), { money: 3, earned: 3 }, 2, params));
    storage.data.set(KEY, W);
    channel.deliver(makeRecord('b', null, W));
    repo.handleStorageEvent({ key: KEY, newValue: W, storageArea: storage });
    expect(JSON.parse(storage.data.get(KEY)).money).toBe(3);
  });

  it('createRepository : le canal n\'est ouvert ni en lecture seule (mode essai), ni sous ?test=1 (mémoire), ni par la page Sauvegarde sans canal', () => {
    for (const search of ['?wave=3', '?test=1', '?money=5&store=local']) {
      const channel = vi.fn(() => fakeChannel());
      createRepository({ search, storage: createFakeStorage(), params, channel, merge });
      expect(channel, search).not.toHaveBeenCalled();
    }
    const channel = vi.fn(() => fakeChannel());
    const { repository } = createRepository({ search: '?test=1&store=local', storage: createFakeStorage(), params, channel, merge });
    expect(channel).toHaveBeenCalledTimes(1);
    expect(repository.tabsInfo()).not.toBeNull();
  });

  it('save.js : sanitize ignore `w` (clé facultative), comme les versions V0.5 et V0.6 (même code de lecture)', () => {
    const r = sanitize({ ...defaultSave(), money: 7, w: 'a.1' }, params);
    expect(r.save.money).toBe(7);
    expect(r.save).not.toHaveProperty('w');
  });
});
