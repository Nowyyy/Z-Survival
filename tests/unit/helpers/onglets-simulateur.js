// Lot 5o : simulateur déterministe du défaut des deux onglets (banc d'essai du correctif). Aucun navigateur, aucune horloge réelle, aucun Math.random :
// un générateur à graine fixe tire les délais. Modèle du stockage du navigateur, d'après le code de Chromium (cached_storage_area.cc, lu au lot 5o) :
//   - chaque onglet lit une COPIE locale du stockage (cache) ; son écriture modifie sa copie tout de suite et part vers le navigateur (file d'attente) ;
//   - le navigateur applique les écritures dans l'ordre d'arrivée (valeur de référence) et renvoie chaque changement à tous les onglets, dans l'ordre,
//     avec un retard propre à chaque onglet (0 à `retard` « ticks ») : pendant ce retard, la copie de l'onglet est PÉRIMÉE ;
//   - un onglet qui attend l'accusé de sa propre écriture ne recopie pas le changement d'un autre (son écriture passera après) ;
//   - l'événement `storage` est remis à tous les autres onglets, après la mise à jour de la copie, sauf si la valeur ne change pas (écriture identique) ;
//   - le canal entre onglets (BroadcastChannel) a ses propres retards : aucun ordre garanti entre lui et le stockage.
// Algorithmes : « avant » (le dépôt local sans canal = code d'avant le lot), « verrou » (piste a : verrou du navigateur autour de lecture-écriture),
// « memoire » (piste c : gains des autres appliqués en mémoire par le canal), « identifiants » (piste b : identifiants des gains stockés dans la valeur,
// réécriture idempotente), « releves » (correctif retenu : le vrai dépôt local avec save-merge.js).
import { createLocalRepository } from '../../../js/save/local-repository.js';
import * as merge from '../../../js/core/save-merge.js';
import { commitDelta, defaultSave, sanitize } from '../../../js/core/save.js';

export const ALGOS = ['avant', 'verrou', 'memoire', 'identifiants', 'releves'];

// Générateur congruentiel 32 bits (mulberry32), graine fixe.
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const KEY = 'zs.save.v1';
const short = (t) => (t === null || t === undefined ? String(t) : (() => { const o = JSON.parse(t); return `r${o.rev}/m${o.money}/s${o.savedAt}`; })());

// File d'événements datés ; à date égale, l'ordre d'insertion. Les « tuyaux » gardent l'ordre de leurs messages (FIFO), comme les canaux du navigateur.
function scheduler() {
  const items = [];
  let n = 0;
  const pipes = new Map();
  return {
    at(time, fn) {
      items.push({ time, n: (n += 1), fn });
    },
    pipe(name, time, fn) {
      const t = Math.max(time, pipes.get(name) ?? 0);
      pipes.set(name, t);
      items.push({ time: t, n: (n += 1), fn });
    },
    next() {
      if (items.length === 0) return null;
      let best = 0;
      for (let i = 1; i < items.length; i += 1) if (items[i].time < items[best].time || (items[i].time === items[best].time && items[i].n < items[best].n)) best = i;
      return items.splice(best, 1)[0];
    },
    get size() {
      return items.length;
    },
  };
}

// options : { seed, tabs (2 à 4), commits, retard (ticks, 10), algo, params, gain (10), initial (texte de départ ; tiré au hasard sinon) }
// Renvoie { attendu, final, perte, double, ecritures, entrelacement }.
// journal : tableau facultatif qui reçoit le déroulé lisible (débogage d'une graine).
export function simulate({ seed, tabs: nTabs = 2, commits = 6, retard = 10, algo = 'releves', params, gain = 10, initial = undefined, journal = null } = {}) {
  const r = rng(seed);
  const pick = (max) => Math.floor(r() * (max + 1));
  const s = scheduler();
  let now = 0;
  let writes = 0;
  const start = initial !== undefined ? initial : r() < 0.5 ? null : JSON.stringify(commitDelta(defaultSave(), { money: 50, earned: 50 }, 1, params));
  let auth = start;
  const tabs = [];
  const lock = { holder: null, queue: [] };

  // Lecture d'un texte de sauvegarde (argent), null pour la clé absente.
  const moneyOf = (text) => (text === null ? 0 : sanitize(JSON.parse(text), params).save.money);
  const base = moneyOf(start);

  function makeTab(i) {
    const tab = { i, cache: auth, pending: 0, repo: null, onMessage: null, mem: null, ops: null };
    tab.storage = {
      getItem: (k) => (k === KEY ? tab.cache : null),
      setItem: (k, v) => {
        if (k !== KEY || v === tab.cache) return;
        tab.cache = v;
        tab.pending += 1;
        writes += 1;
        journal?.push(`${now} T${i} write ${short(v)}`);
        s.pipe(`up${i}`, now + pick(3), () => browserPut(i, v));
      },
      removeItem: (k) => {
        if (k !== KEY || tab.cache === null) return;
        tab.cache = null;
        tab.pending += 1;
        s.pipe(`up${i}`, now + pick(3), () => browserPut(i, null));
      },
    };
    tab.post = (data) => {
      for (const other of tabs) if (other !== tab) s.pipe(`bc${i}-${other.i}`, now + pick(retard), () => { journal?.push(`${now} T${other.i} recv from T${i}`); other.onMessage?.({ data: structuredClone(data) }); });
    };
    return tab;
  }

  function browserPut(source, value) {
    journal?.push(`${now} BROWSER put from T${source} ${short(value)}`);
    const old = auth;
    auth = value;
    for (const tab of tabs) {
      s.pipe(`down${tab.i}`, now + pick(retard), () => {
        if (tab.i === source) {
          tab.pending -= 1;
          return;
        }
        if (tab.pending === 0) tab.cache = value;
        if (value !== old) s.pipe(`ev${tab.i}`, now + pick(2), () => onEvent(tab, value));
      });
    }
  }

  function onEvent(tab, value) {
    journal?.push(`${now} T${tab.i} event ${short(value)} cache=${short(tab.cache)}`);
    if (tab.repo) tab.repo.handleStorageEvent({ key: KEY, newValue: value, storageArea: tab.storage });
    if (tab.onEvent) tab.onEvent(value);
  }

  // --- Algorithmes ---------------------------------------------------------------------------------------------------------------------------------
  function setup(tab) {
    if (algo === 'avant' || algo === 'verrou') tab.repo = createLocalRepository(tab.storage, params, {});
    else if (algo === 'releves') {
      tab.repo = createLocalRepository(tab.storage, params, { channel: () => ({ postMessage: (d) => { journal?.push(`${now} T${tab.i} post ${short(d.base)} -> ${short(d.value)}`); tab.post(d); }, addEventListener: (_t, fn) => { tab.onMessage = fn; } }), merge, now: () => Math.floor(now / 4), tabId: `t${tab.i}` });
      tab.repo.load();
    } else if (algo === 'memoire') {
      // Piste c : valeur en mémoire = lue au chargement + gains reçus des autres (par identifiant) + gains de l'onglet ; écrite telle quelle.
      tab.mem = { save: tab.cache === null ? defaultSave() : sanitize(JSON.parse(tab.cache), params).save, seen: new Set() };
      tab.onMessage = ({ data }) => {
        if (tab.mem.seen.has(data.id)) return;
        tab.mem.seen.add(data.id);
        tab.mem.save = commitDelta(tab.mem.save, { money: data.money, earned: data.money }, tab.mem.save.savedAt, params);
      };
    } else if (algo === 'identifiants') {
      // Piste b : la valeur stockée porte la liste des identifiants de gains appliqués (champ « ops », changement de format) ; chaque onglet relit
      // la valeur à chaque événement et réapplique ses gains absents (idempotent : un identifiant présent n'est jamais réappliqué).
      tab.ops = new Map();
      tab.onEvent = () => idApply(tab);
    }
  }

  function idApply(tab, extra = null) {
    const text = tab.cache;
    const raw = text === null ? { ...defaultSave(), ops: [] } : JSON.parse(text);
    const have = new Set(raw.ops ?? []);
    if (extra) tab.ops.set(extra.id, extra.money);
    let add = 0;
    const ops = [...have];
    for (const [id, money] of tab.ops) if (!have.has(id)) {
      add += money;
      ops.push(id);
    }
    if (add === 0) return true;
    const next = commitDelta(sanitize(raw, params).save, { money: add, earned: add }, Math.floor(now / 4), params);
    tab.storage.setItem(KEY, JSON.stringify({ ...next, ops }));
    return true;
  }

  let expected = base;
  let opId = 0;
  function commit(tab) {
    if (algo === 'avant' || algo === 'releves') {
      if (tab.repo.commit({ money: gain, earned: gain }, Math.floor(now / 4)).ok) expected += gain;
    } else if (algo === 'verrou') {
      // Le verrou est demandé, accordé par le navigateur (retard), puis rendu (retard) : lecture-écriture sous verrou.
      s.pipe(`lk${tab.i}`, now + pick(retard), () => lockRequest(tab));
    } else if (algo === 'memoire') {
      opId += 1;
      tab.mem.save = commitDelta(tab.mem.save, { money: gain, earned: gain }, Math.floor(now / 4), params);
      tab.storage.setItem(KEY, JSON.stringify(tab.mem.save));
      tab.post({ id: `${tab.i}-${opId}`, money: gain });
      expected += gain;
    } else if (algo === 'identifiants') {
      opId += 1;
      idApply(tab, { id: `${tab.i}-${opId}`, money: gain });
      expected += gain;
    }
  }

  function lockRequest(tab) {
    lock.queue.push(tab);
    grantNext();
  }
  function grantNext() {
    if (lock.holder !== null || lock.queue.length === 0) return;
    const tab = lock.queue.shift();
    lock.holder = tab;
    s.pipe(`lkd${tab.i}`, now + pick(retard), () => {
      if (tab.repo.commit({ money: gain, earned: gain }, Math.floor(now / 4)).ok) expected += gain;
      s.pipe(`lk${tab.i}`, now + pick(retard), () => {
        lock.holder = null;
        grantNext();
      });
    });
  }

  // --- Déroulé : onglets ouverts entre 0 et 20 ticks, gains à des instants tirés au hasard, puis attente du calme ---------------------------------
  for (let i = 0; i < nTabs; i += 1) {
    const at = i === 0 ? 0 : pick(20);
    s.at(at, () => {
      const tab = makeTab(i);
      tab.cache = auth;
      tabs.push(tab);
      setup(tab);
    });
  }
  const trace = [];
  for (let k = 0; k < commits; k += 1) {
    const at = 21 + pick(commits * 6);
    const who = pick(nTabs - 1);
    s.at(at, () => {
      trace.push(`${now}:${who}`);
      commit(tabs[who]);
    });
  }
  let steps = 0;
  for (let item = s.next(); item !== null; item = s.next()) {
    now = item.time;
    item.fn();
    steps += 1;
    if (steps > 200_000) break;
  }
  const final = moneyOf(auth);
  return { attendu: expected, final, perte: final < expected, double: final > expected, ecritures: writes, calme: s.size === 0, entrelacement: trace.join(' ') };
}

// N entrelacements (graines first..first+n-1) : { n, pertes, doubles, ecritures, exemplePerte, exempleDouble }.
export function campaign({ n, tabs, algo, params, first = 1, commits = 6, retard = 10 }) {
  const out = { n, pertes: 0, doubles: 0, ecritures: 0, exemplePerte: null, exempleDouble: null, calmes: 0 };
  for (let k = 0; k < n; k += 1) {
    const res = simulate({ seed: first + k, tabs, algo, params, commits, retard });
    out.ecritures += res.ecritures;
    if (res.calme) out.calmes += 1;
    if (res.perte) {
      out.pertes += 1;
      out.exemplePerte ??= { seed: first + k, ...res };
    }
    if (res.double) {
      out.doubles += 1;
      out.exempleDouble ??= { seed: first + k, ...res };
    }
  }
  return out;
}
