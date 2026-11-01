import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { defaultSave, encodeSave } from '../../js/core/save.js';
import { createLocalRepository } from '../../js/save/local-repository.js';
import { createMemoryRepository } from '../../js/save/memory-repository.js';
import { createReadOnlyRepository } from '../../js/save/readonly-repository.js';
import { createRepository } from '../../js/save/index.js';
import { runContract } from './helpers/save-contract.js';
import { createFakeStorage, quotaError, securityError } from './helpers/fake-storage.js';

const load = (name) => JSON.parse(readFileSync(`data/game/${name}.json`, 'utf8'));
const params = { save: load('save'), economy: load('economy'), stats: load('player-stats') };
const KEY = params.save.storageKey;
const stored = (storage) => JSON.parse(storage.data.get(KEY));
const validSave = (extra = {}) => ({ ...defaultSave(), rev: 4, savedAt: 1000, money: 250, earned: 400, ...extra });

// --- Suite de contrat sur les adaptateurs mémoire, local et lecture seule -----------------------------------------------------------------------
runContract('mémoire', () => {
  const repo = createMemoryRepository(undefined, params);
  return { repo, external: (save) => repo.externalChange(save) };
});

runContract('local (faux stockage)', () => {
  const storage = createFakeStorage();
  let handler = null;
  const repo = createLocalRepository(storage, params, {
    listen: (h) => {
      handler = h;
      return () => {
        handler = null;
      };
    },
  });
  return {
    repo,
    external: (save) => {
      storage.data.set(KEY, JSON.stringify(save));
      handler?.({ key: KEY, storageArea: storage });
    },
  };
});

runContract('lecture seule (au-dessus de la mémoire)', () => {
  const inner = createMemoryRepository(undefined, params);
  const repo = createReadOnlyRepository(inner, {}, params);
  return { repo, external: (save) => inner.externalChange(save) };
}, { writes: false });

// --- Dépôt local ------------------------------------------------------------------------------------------------------------------------------
describe('local-repository : lecture', () => {
  it('clé absente : empty, sauvegarde par défaut, aucune écriture', () => {
    const storage = createFakeStorage();
    const repo = createLocalRepository(storage, params);
    const r = repo.load();
    expect(r.status).toBe('empty');
    expect(r.save).toEqual(defaultSave());
    expect(storage.calls.setItem + storage.calls.removeItem + storage.calls.clear).toBe(0);
    expect(repo.info()).toEqual({ kind: 'local', readOnly: false, locked: false, key: KEY, status: 'empty' });
  });

  it('sauvegarde valide : ok, sans avertissement', () => {
    const storage = createFakeStorage({ [KEY]: JSON.stringify(validSave()) });
    const r = createLocalRepository(storage, params).load();
    expect(r.status).toBe('ok');
    expect(r.save.money).toBe(250);
    expect(r.warnings).toEqual([]);
  });

  it.each([['JSON invalide', '{bad'], ['tableau', '[1,2,3]'], ['nombre', '42'], ['texte', '"abc"'], ['null', 'null'], ['vide', ''], ['gros contenu (20 000 octets)', JSON.stringify({ v: 1, junk: 'x'.repeat(20_000) })], ['sans version', '{"money":5}'], ['version non entière', '{"v":1.5}']])('%s : corrupt, verrouillée, texte brut gardé', (_name, text) => {
    const storage = createFakeStorage({ [KEY]: text });
    const repo = createLocalRepository(storage, params);
    const r = repo.load();
    expect(r.status).toBe('corrupt');
    expect(r.raw).toBe(text);
    expect(r.save).toEqual(defaultSave());
    expect(repo.info().locked).toBe(true);
  });

  it('corrupt : aucune écriture ensuite, malgré des centaines de commit', () => {
    const storage = createFakeStorage({ [KEY]: '{bad' });
    const repo = createLocalRepository(storage, params);
    repo.load();
    for (let i = 0; i < 300; i += 1) expect(repo.commit({ money: 1, earned: 1 }, i)).toEqual({ ok: false, applied: false, error: 'locked' });
    expect(storage.calls.setItem).toBe(0);
    expect(storage.calls.removeItem).toBe(0);
    expect(storage.data.get(KEY)).toBe('{bad');
  });

  it('{"v":99} : future, verrouillée, jamais écrasée', () => {
    const storage = createFakeStorage({ [KEY]: '{"v":99,"money":5}' });
    const repo = createLocalRepository(storage, params);
    expect(repo.load().status).toBe('future');
    expect(repo.info().locked).toBe(true);
    expect(repo.commit({ money: 1 }, 1).ok).toBe(false);
    expect(storage.calls.setItem).toBe(0);
    expect(storage.data.get(KEY)).toBe('{"v":99,"money":5}');
  });

  it('{"v":1} avec des valeurs hors bornes : ok avec avertissements, corrigé seulement à la première écriture', () => {
    const storage = createFakeStorage({ [KEY]: JSON.stringify({ v: 1, money: 1e12, stats: { degats: 99 }, extra: 1 }) });
    const repo = createLocalRepository(storage, params);
    const r = repo.load();
    expect(r.status).toBe('ok');
    expect(r.save.money).toBe(9_999_999);
    expect(r.warnings.length).toBeGreaterThan(0);
    expect(storage.calls.setItem).toBe(0);
    expect(JSON.parse(storage.data.get(KEY)).money).toBe(1e12);
    repo.commit({ money: 0 }, 5);
    expect(stored(storage).money).toBe(9_999_999);
    expect(stored(storage).stats.degats).toBe(10);
    expect(Object.keys(stored(storage)).sort()).toEqual(['earned', 'money', 'records', 'rev', 'savedAt', 'stats', 'v']);
  });

  it('getItem qui lève : unavailable, verrouillé, commit refusé', () => {
    const storage = createFakeStorage();
    storage.failGet = securityError();
    const repo = createLocalRepository(storage, params);
    expect(repo.load().status).toBe('unavailable');
    expect(repo.info()).toMatchObject({ locked: true, status: 'unavailable' });
    expect(repo.commit({ money: 1 }, 1)).toEqual({ ok: false, applied: false, error: 'locked' });
  });

  it('stockage absent (null) : unavailable, sans exception', () => {
    const repo = createLocalRepository(null, params);
    expect(repo.load().status).toBe('unavailable');
    expect(repo.commit({ money: 1 }, 1).ok).toBe(false);
    expect(repo.clear().ok).toBe(false);
    expect(repo.replace(defaultSave(), 1).ok).toBe(false);
  });

  it('une valeur qui n\'est pas une chaîne est corrompue', () => {
    const storage = createFakeStorage();
    storage.getItem = () => 42;
    expect(createLocalRepository(storage, params).load().status).toBe('corrupt');
  });

  it('la clé est toujours celle de save.json', () => {
    const storage = createFakeStorage();
    createLocalRepository(storage, params).commit({ money: 1 }, 1);
    expect([...storage.data.keys()]).toEqual(['zs.save.v1']);
  });
});

describe('local-repository : écriture', () => {
  it('commit écrit la sauvegarde fusionnée (JSON compact du schéma, moins de 1 Ko)', () => {
    const storage = createFakeStorage();
    const repo = createLocalRepository(storage, params);
    const r = repo.commit({ money: 10, earned: 10, runs: 1, bestWave: 3 }, 777);
    expect(r).toMatchObject({ ok: true, applied: true });
    expect(stored(storage)).toEqual({ ...defaultSave(), rev: 1, savedAt: 777, money: 10, earned: 10, records: { bestWave: 3, bestKills: 0, runs: 1, worldsCompleted: 0 } });
    expect(storage.data.get(KEY).length).toBeLessThan(1024);
  });

  it('relit la clé juste avant d\'écrire : deux dépôts sur le même stockage additionnent leurs gains', () => {
    const storage = createFakeStorage();
    const a = createLocalRepository(storage, params);
    const b = createLocalRepository(storage, params);
    a.load();
    b.load();
    a.commit({ money: 5, earned: 5 }, 1);
    const rb = b.commit({ money: 5, earned: 5 }, 2);
    expect(rb.save.money).toBe(10);
    expect(stored(storage).money).toBe(10);
    expect(stored(storage).earned).toBe(10);
    expect(stored(storage).rev).toBe(2);
  });

  it('setItem qui lève QuotaExceededError : {ok:false}, aucune exception, état relisible', () => {
    const storage = createFakeStorage({ [KEY]: JSON.stringify(validSave()) });
    const repo = createLocalRepository(storage, params);
    storage.failSet = quotaError();
    const r = repo.commit({ money: 5 }, 1);
    expect(r).toEqual({ ok: false, applied: false, error: 'QuotaExceededError' });
    expect(repo.load().status).toBe('ok');
    expect(repo.load().save.money).toBe(250);
    storage.failSet = null;
    expect(repo.commit({ money: 5 }, 2).save.money).toBe(255);
  });

  it.each([securityError(), new Error('autre'), 'texte', 42])('setItem qui lève %j : {ok:false} sans exception', (thrown) => {
    const storage = createFakeStorage();
    storage.failSet = thrown;
    const r = createLocalRepository(storage, params).commit({ money: 1 }, 1);
    expect(r.ok).toBe(false);
    expect(typeof r.error).toBe('string');
  });

  it('un commit échoué puis réussi n\'écrit le montant qu\'une fois (jamais doublé)', () => {
    const storage = createFakeStorage();
    const repo = createLocalRepository(storage, params);
    storage.failSet = quotaError();
    expect(repo.commit({ money: 10, earned: 10 }, 1).ok).toBe(false);
    storage.failSet = null;
    expect(repo.commit({ money: 10, earned: 10 }, 2).ok).toBe(true);
    expect(stored(storage).money).toBe(10);
  });

  it('replace écrit la sauvegarde importée et fait croître rev', () => {
    const storage = createFakeStorage({ [KEY]: JSON.stringify(validSave()) });
    const repo = createLocalRepository(storage, params);
    const r = repo.replace({ ...defaultSave(), money: 1234, earned: 1234 }, 99);
    expect(r.ok).toBe(true);
    expect(stored(storage).money).toBe(1234);
    expect(stored(storage).rev).toBe(5);
    expect(stored(storage).savedAt).toBe(99);
  });

  it('replace déverrouille une sauvegarde illisible ; commit fonctionne ensuite', () => {
    const storage = createFakeStorage({ [KEY]: '{bad' });
    const repo = createLocalRepository(storage, params);
    expect(repo.load().status).toBe('corrupt');
    expect(repo.replace({ ...defaultSave(), money: 7 }, 1).ok).toBe(true);
    expect(repo.info().locked).toBe(false);
    expect(repo.commit({ money: 3 }, 2).save.money).toBe(10);
  });

  it('clear efface la clé, y compris quand la sauvegarde est verrouillée, puis commit refonctionne', () => {
    const storage = createFakeStorage({ [KEY]: '{"v":99}' });
    const repo = createLocalRepository(storage, params);
    repo.load();
    expect(repo.clear().ok).toBe(true);
    expect(storage.data.has(KEY)).toBe(false);
    expect(repo.info().locked).toBe(false);
    expect(repo.commit({ money: 2 }, 1).ok).toBe(true);
  });

  it('clear : removeItem qui lève donne {ok:false}', () => {
    const storage = createFakeStorage({ [KEY]: JSON.stringify(validSave()) });
    storage.failRemove = securityError();
    expect(createLocalRepository(storage, params).clear().ok).toBe(false);
  });

  it('un dépôt dont la clé a été corrompue par un autre onglet refuse d\'écrire (relecture avant écriture)', () => {
    const storage = createFakeStorage();
    const repo = createLocalRepository(storage, params);
    repo.load();
    storage.data.set(KEY, 'n\'importe quoi');
    expect(repo.commit({ money: 1 }, 1).error).toBe('locked');
    expect(storage.calls.setItem).toBe(0);
  });

  it('un dépôt verrouillé se déverrouille tout seul si un autre onglet a réparé la clé', () => {
    const storage = createFakeStorage({ [KEY]: '{bad' });
    const repo = createLocalRepository(storage, params);
    repo.load();
    storage.data.set(KEY, JSON.stringify(validSave()));
    expect(repo.commit({ money: 1 }, 1).save.money).toBe(251);
  });
});

describe('local-repository : abonnement et persistance', () => {
  it('subscribe écoute l\'événement storage de la clé seulement, via la fonction injectée', () => {
    const storage = createFakeStorage();
    let handler = null;
    let stops = 0;
    const repo = createLocalRepository(storage, params, { listen: (h) => { handler = h; return () => { stops += 1; }; } });
    const seen = [];
    const stop = repo.subscribe((save) => seen.push(save.money));
    storage.data.set(KEY, JSON.stringify(validSave({ money: 9 })));
    handler({ key: 'autre-cle' });
    expect(seen).toEqual([]);
    handler({ key: KEY, storageArea: storage });
    expect(seen).toEqual([9]);
    handler({ key: null });
    expect(seen).toEqual([9, 9]);
    handler({ key: KEY, storageArea: {} });
    expect(seen).toHaveLength(2);
    stop();
    expect(stops).toBe(1);
  });

  it('sans fonction d\'écoute, subscribe ne lève pas', () => {
    expect(() => createLocalRepository(createFakeStorage(), params).subscribe(() => {})()).not.toThrow();
  });

  it('requestPersistence : null avant la première écriture, sans appeler persist', async () => {
    let calls = 0;
    const repo = createLocalRepository(createFakeStorage(), params, { persist: async () => { calls += 1; return true; } });
    expect(await repo.requestPersistence()).toBeNull();
    expect(calls).toBe(0);
  });

  it.each([[async () => true, true], [async () => false, false], [async () => undefined, null], [() => { throw new Error('x'); }, null], [async () => { throw new Error('x'); }, null], [undefined, null]])('requestPersistence après une écriture (réponse %#)', async (persist, expected) => {
    const repo = createLocalRepository(createFakeStorage(), params, { persist });
    repo.commit({ money: 1 }, 1);
    expect(await repo.requestPersistence()).toBe(expected);
  });

  it('requestPersistence ne demande qu\'une fois par chargement', async () => {
    let calls = 0;
    const repo = createLocalRepository(createFakeStorage(), params, { persist: async () => { calls += 1; return true; } });
    repo.commit({ money: 1 }, 1);
    await repo.requestPersistence();
    await repo.requestPersistence();
    repo.commit({ money: 1 }, 2);
    await repo.requestPersistence();
    expect(calls).toBe(1);
  });

  it('une écriture échouée ne déclenche pas la demande de persistance', async () => {
    let calls = 0;
    const storage = createFakeStorage();
    storage.failSet = quotaError();
    const repo = createLocalRepository(storage, params, { persist: async () => { calls += 1; return true; } });
    repo.commit({ money: 1 }, 1);
    expect(await repo.requestPersistence()).toBeNull();
    expect(calls).toBe(0);
  });
});

// --- Dépôt en lecture seule ---------------------------------------------------------------------------------------------------------------------
describe('readonly-repository', () => {
  it('lit la VRAIE sauvegarde (solde et niveaux réels)', () => {
    const storage = createFakeStorage({ [KEY]: JSON.stringify(validSave({ stats: { ...defaultSave().stats, degats: 3 } })) });
    const repo = createReadOnlyRepository(createLocalRepository(storage, params), {}, params);
    const r = repo.load();
    expect(r.status).toBe('ok');
    expect(r.save.money).toBe(250);
    expect(r.save.stats.degats).toBe(3);
  });

  it('la session surcharge le solde (?money=) et les niveaux (?lvl=)', () => {
    const storage = createFakeStorage({ [KEY]: JSON.stringify(validSave()) });
    const repo = createReadOnlyRepository(createLocalRepository(storage, params), { money: 500, levels: { degats: 5, chutes: 2 } }, params);
    const r = repo.load();
    expect(r.save.money).toBe(500);
    expect(r.save.stats.degats).toBe(5);
    expect(r.save.stats.chutes).toBe(2);
    expect(r.save.stats.portee).toBe(0);
    expect(r.save.earned).toBe(400);
  });

  it('zéro appel à setItem, removeItem et clear après 1 000 commit, replace et clear', () => {
    const storage = createFakeStorage({ [KEY]: JSON.stringify(validSave()) });
    const before = storage.data.get(KEY);
    const repo = createReadOnlyRepository(createLocalRepository(storage, params), {}, params);
    repo.load();
    for (let i = 0; i < 1000; i += 1) {
      expect(repo.commit({ money: 1, earned: 1, runs: 1 }, i).applied).toBe(false);
      repo.replace(defaultSave(), i);
      repo.clear();
    }
    expect(storage.calls.setItem).toBe(0);
    expect(storage.calls.removeItem).toBe(0);
    expect(storage.calls.clear).toBe(0);
    expect(storage.data.get(KEY)).toBe(before);
  });

  it('commit applique la différence à la copie de session : ok, applied faux', () => {
    const storage = createFakeStorage({ [KEY]: JSON.stringify(validSave()) });
    const repo = createReadOnlyRepository(createLocalRepository(storage, params), {}, params);
    repo.load();
    const r = repo.commit({ money: 10, earned: 10 }, 5);
    expect(r.ok).toBe(true);
    expect(r.applied).toBe(false);
    expect(r.save.money).toBe(260);
    expect(repo.load().save.money).toBe(260);
    expect(JSON.parse(storage.data.get(KEY)).money).toBe(250);
  });

  it('la copie de session ne change pas quand on recharge', () => {
    const repo = createReadOnlyRepository(createMemoryRepository(validSave(), params), { money: 100 }, params);
    repo.commit({ money: 5 }, 1);
    expect(repo.load().save.money).toBe(105);
  });

  it('info().readOnly est vrai et le reste vient du dépôt de dessous', () => {
    const local = createReadOnlyRepository(createLocalRepository(createFakeStorage(), params), {}, params);
    expect(local.info()).toEqual({ kind: 'local', readOnly: true, locked: false, key: KEY, status: 'empty' });
    expect(createReadOnlyRepository(createMemoryRepository(undefined, params), {}, params).info()).toMatchObject({ kind: 'memory', readOnly: true });
  });

  it('sauvegarde illisible dessous : status corrupt, texte brut, session utilisable, rien d\'écrit', () => {
    const storage = createFakeStorage({ [KEY]: '{bad' });
    const repo = createReadOnlyRepository(createLocalRepository(storage, params), { money: 20 }, params);
    const r = repo.load();
    expect(r.status).toBe('corrupt');
    expect(r.raw).toBe('{bad');
    expect(r.save.money).toBe(20);
    expect(repo.commit({ money: 1 }, 1).ok).toBe(true);
    expect(storage.calls.setItem).toBe(0);
  });

  it('stockage indisponible dessous : unavailable, session utilisable', () => {
    const repo = createReadOnlyRepository(createLocalRepository(null, params), {}, params);
    expect(repo.load().status).toBe('unavailable');
    expect(repo.commit({ money: 3 }, 1).save.money).toBe(3);
  });

  it('requestPersistence ne demande rien', async () => {
    let calls = 0;
    const inner = createLocalRepository(createFakeStorage(), params, { persist: async () => { calls += 1; return true; } });
    expect(await createReadOnlyRepository(inner, {}, params).requestPersistence()).toBeNull();
    expect(calls).toBe(0);
  });

  it('un solde de session invalide est ignoré', () => {
    const repo = createReadOnlyRepository(createMemoryRepository(validSave(), params), { money: -5 }, params);
    expect(repo.load().save.money).toBe(250);
  });
});

// --- createRepository -------------------------------------------------------------------------------------------------------------------------
describe('createRepository', () => {
  const make = (search, extra = {}) => createRepository({ search, storage: createFakeStorage(), params, ...extra });

  it('sans paramètre : stockage local, pas de lecture seule', () => {
    const { repository, mode } = make('');
    expect(mode).toMatchObject({ kind: 'local', base: 'local', readOnly: false, reasons: [], money: null });
    expect(repository.info().kind).toBe('local');
    expect(repository.info().readOnly).toBe(false);
  });

  it('?test=1 : mémoire', () => {
    const { repository, mode } = make('?test=1');
    expect(mode.kind).toBe('memory');
    expect(repository.info().kind).toBe('memory');
  });

  it('?test=1&store=local : local', () => {
    expect(make('?test=1&store=local').mode.kind).toBe('local');
  });

  it('?test=1 n\'écrit jamais dans le stockage fourni', () => {
    const storage = createFakeStorage();
    const { repository } = createRepository({ search: '?test=1', storage, params });
    repository.commit({ money: 5 }, 1);
    expect(storage.calls.setItem + storage.calls.getItem).toBe(0);
  });

  it.each(['?wave=5', '?map=salle', '?lvl=degats:3', '?planks=2', '?empty=1', '?nospawn=1', '?endless=1', '?floor=1', '?money=500'])('%s : lecture seule', (search) => {
    const { repository, mode } = make(search);
    expect(mode.kind).toBe('readonly');
    expect(mode.readOnly).toBe(true);
    expect(repository.info().readOnly).toBe(true);
    expect(mode.reasons).toHaveLength(1);
  });

  it('?tilt=60&vhs=0&labels=1&fps=1 : pas de lecture seule', () => {
    const { mode } = make('?tilt=60&vhs=0&labels=1&fps=1');
    expect(mode.readOnly).toBe(false);
    expect(mode.kind).toBe('local');
  });

  it('?test=1&wave=5&store=local : lecture seule posée sur le stockage local', () => {
    const storage = createFakeStorage({ [KEY]: JSON.stringify(validSave()) });
    const { repository, mode } = createRepository({ search: '?test=1&wave=5&store=local', storage, params });
    expect(mode).toMatchObject({ kind: 'readonly', base: 'local' });
    expect(repository.info().kind).toBe('local');
    expect(repository.load().save.money).toBe(250);
    repository.commit({ money: 99 }, 1);
    expect(storage.calls.setItem).toBe(0);
  });

  it('?test=1&wave=5 : lecture seule posée sur la mémoire', () => {
    expect(make('?test=1&wave=5').mode).toMatchObject({ kind: 'readonly', base: 'memory' });
  });

  it('?money=500 : lecture seule avec solde de session de 500, sans rien écrire', () => {
    const storage = createFakeStorage({ [KEY]: JSON.stringify(validSave()) });
    const { repository, mode } = createRepository({ search: '?money=500', storage, params });
    expect(mode.money).toBe(500);
    expect(repository.load().save.money).toBe(500);
    repository.commit({ money: 5, earned: 5 }, 1);
    expect(repository.load().save.money).toBe(505);
    expect(storage.calls.setItem).toBe(0);
  });

  it.each(['?money=abc', '?money=-5', '?money=10000000', '?money='])('%s : pas de solde de session', (search) => {
    expect(make(search).mode.money).toBeNull();
  });

  it('page : toujours le stockage local, jamais la lecture seule, même avec ?test=1 ou ?wave=5', () => {
    expect(make('?test=1&wave=5', { page: true }).mode).toMatchObject({ kind: 'local', readOnly: false });
  });

  it('page : ?store=memory force la mémoire', () => {
    expect(make('?store=memory', { page: true }).mode.kind).toBe('memory');
  });

  it('entrées hostiles : pas d\'exception', () => {
    for (const bad of [{}, { search: null }, { search: 42 }, { search: '?%E0%A4%A' }, undefined]) expect(() => createRepository(bad)).not.toThrow();
  });

  it('sans stockage (null) : unavailable', () => {
    expect(createRepository({ search: '', storage: null, params }).repository.load().status).toBe('unavailable');
  });

  it('un code d\'export décode vers la sauvegarde que le dépôt stocke (cohérence codec et dépôt)', () => {
    const { repository } = make('');
    const saved = repository.commit({ money: 33, earned: 33 }, 5).save;
    expect(encodeSave(saved, params)).toMatch(/^ZS1\./);
  });
});
