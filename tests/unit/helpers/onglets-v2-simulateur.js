// Lot 8h : simulateur déterministe de plusieurs onglets de la V0.8 sur la progression v2 (zs.save.v2), même modèle du stockage du navigateur que le
// lot 5o (onglets-simulateur.js, d'après le cache de Chromium) : chaque onglet lit une COPIE locale périmée pendant un retard tiré au hasard ; le
// navigateur applique les écritures dans l'ordre d'arrivée ; l'événement `storage` et le canal entre onglets ont leurs propres retards, sans ordre
// garanti entre eux. Les onglets utilisent le VRAI dépôt local (js/save/local-repository.js) avec le format v2 (js/save/codecs.js) et la fusion
// (js/core/save-merge.js) ; chaque onglet fait des gains de manche (bleu) et des achats (prix prélevé, objets ajoutés), à des instants tirés au hasard.
// Aucun navigateur, aucune horloge réelle, aucun Math.random (générateur à graine fixe).
import { createLocalRepository } from '../../../js/save/local-repository.js';
import { codecV2 } from '../../../js/save/codecs.js';
import * as merge from '../../../js/core/save-merge.js';
import { appliquerOps, defaultProgression, serialiser, solde } from '../../../js/core/progression.js';
import { rng } from './onglets-simulateur.js';

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

// options : { seed, tabs (2 à 4), ops (nombre d'opérations), retard (ticks), params, initial (solde bleu de départ) }.
// Renvoie { ok, pertes, doubles, doublesDepenses, negatif, nonPaye, achatsConfirmesAbsents, gagne, attendu, depense, payes, calme, ecritures }.
// sansFusion : banc du témoin (dépôt sans canal ni fusion, comme avant le lot 5o) : le simulateur doit y trouver des pertes.
export function simulateV2({ seed, tabs: nTabs = 2, ops = 8, retard = 10, params, initial = 0, prixMax = 60, gain = 20, sansFusion = false } = {}) {
  const r = rng(seed);
  const pick = (max) => Math.floor(r() * (max + 1));
  const s = scheduler();
  const codec = codecV2(params);
  const KEY = codec.key;
  let now = 0;
  let writes = 0;
  const depart = initial > 0 ? JSON.stringify(serialiser(appliquerOps(defaultProgression(), [{ id: 'depart', t: 'gain', bleu: initial }], 1, params).save)) : r() < 0.5 ? null : JSON.stringify(serialiser(defaultProgression()));
  let auth = depart;
  const tabs = [];
  let opSeq = 0;
  const gains = []; // gains écrits (commit réussi) : { id, bleu }
  const achats = new Map(); // id → { prix, u: [uids], confirme (commit réussi sans refus, jamais refusé ensuite) }

  function makeTab(i) {
    const tab = { i, cache: auth, pending: 0, repo: null, onMessage: null };
    tab.storage = {
      getItem: (k) => (k === KEY ? tab.cache : null),
      setItem: (k, v) => {
        if (k !== KEY || v === tab.cache) return;
        tab.cache = v;
        tab.pending += 1;
        writes += 1;
        s.pipe(`up${i}`, now + pick(3), () => browserPut(i, v));
      },
      removeItem: () => {},
    };
    tab.post = (data) => {
      for (const other of tabs) if (other !== tab) s.pipe(`bc${i}-${other.i}`, now + pick(retard), () => other.onMessage?.({ data: structuredClone(data) }));
    };
    tab.repo = createLocalRepository(tab.storage, params, sansFusion ? { codec, listen: () => () => {} } : {
      codec,
      channel: () => ({ postMessage: (d) => tab.post(d), addEventListener: (_t, fn) => { tab.onMessage = fn; } }),
      merge,
      now: () => Math.floor(now / 4),
      tabId: `t${i}`,
      listen: () => () => {},
    });
    // Achats annulés après coup (relecture d'un autre onglet) : l'onglet en est prévenu.
    tab.repo.subscribe((_save, _status, refused) => {
      for (const x of refused ?? []) if (achats.has(x.id)) achats.get(x.id).confirme = false;
    });
    tab.repo.load();
    return tab;
  }

  function browserPut(source, value) {
    const old = auth;
    auth = value;
    for (const tab of tabs) {
      s.pipe(`down${tab.i}`, now + pick(retard), () => {
        if (tab.i === source) {
          tab.pending -= 1;
          return;
        }
        if (tab.pending === 0) tab.cache = value;
        if (value !== old) s.pipe(`ev${tab.i}`, now + pick(2), () => tab.repo.handleStorageEvent({ key: KEY, newValue: value, storageArea: tab.storage }));
      });
    }
  }

  function act(tab) {
    opSeq += 1;
    const id = `o${seed}x${opSeq}`;
    if (r() < 0.55) {
      const bleu = gain;
      const res = tab.repo.commit([{ id, t: 'gain', bleu, tues: 1 }], Math.floor(now / 4));
      if (res.ok) gains.push({ id, bleu });
      return;
    }
    // Relecture avant dépense : l'achat n'est tenté que si le solde relu suffit (bouton « Il manque N » sinon).
    const prix = 1 + pick(prixMax - 1);
    const lu = tab.repo.load();
    if (lu.status !== 'ok' && lu.status !== 'empty') return;
    if (solde(lu.save) < prix) return;
    const u = [`${id}.0`, `${id}.1`];
    const res = tab.repo.commit([{ id, t: 'achat', prix, place: 1000, objets: u.map((x) => ({ u: x, i: 'casque-kevlar', r: 'commun' })) }], Math.floor(now / 4));
    if (res.ok) achats.set(id, { prix, u, confirme: !(res.refused ?? []).some((x) => x.id === id) });
  }

  for (let i = 0; i < nTabs; i += 1) {
    s.at(i === 0 ? 0 : pick(20), () => {
      const tab = makeTab(i);
      tabs.push(tab);
    });
  }
  for (let k = 0; k < ops; k += 1) {
    const who = pick(nTabs - 1);
    s.at(21 + pick(ops * 6), () => act(tabs[who]));
  }
  let steps = 0;
  for (let item = s.next(); item !== null; item = s.next()) {
    now = item.time;
    item.fn();
    steps += 1;
    if (steps > 200_000) break;
  }

  const fin = auth === null ? defaultProgression() : codec.parse(JSON.parse(auth)).save;
  const attendu = (initial > 0 ? initial : 0) + gains.reduce((n, g) => n + g.bleu, 0);
  const presents = new Map();
  for (const o of fin.objets) {
    const id = o.u.slice(0, o.u.lastIndexOf('.'));
    presents.set(id, (presents.get(id) ?? 0) + 1);
  }
  let payes = 0;
  let nonPaye = false;
  let doublesDepenses = false;
  for (const [id, a] of achats) {
    const n = presents.get(id) ?? 0;
    if (n === a.u.length) payes += a.prix;
    else if (n !== 0) nonPaye = true; // achat coupé en deux : jamais permis
    if (a.confirme && n === 0) a.absent = true;
  }
  for (const [id, n] of presents) if (!achats.has(id) || n > achats.get(id).u.length) doublesDepenses = true;
  const res = {
    gagne: fin.bleu.gagne, attendu, depense: fin.bleu.depense, payes,
    pertes: fin.bleu.gagne < attendu, doubles: fin.bleu.gagne > attendu,
    doublesDepenses: doublesDepenses || fin.bleu.depense !== payes,
    negatif: fin.bleu.depense > fin.bleu.gagne,
    nonPaye,
    achatsConfirmesAbsents: [...achats.values()].filter((a) => a.absent).length,
    achatsAnnules: [...achats.values()].filter((a) => !a.confirme).length,
    calme: s.size === 0, ecritures: writes,
  };
  res.ok = !res.pertes && !res.doubles && !res.doublesDepenses && !res.negatif && !res.nonPaye && res.achatsConfirmesAbsents === 0 && res.calme;
  return res;
}

// N suites (graines first..first+n-1), 2 à 4 onglets tirés par la graine : totaux et premier exemple d'échec.
export function campagneV2({ n, params, first = 1, ops = 8, retard = 10, sansFusion = false }) {
  const out = { n, echecs: 0, pertes: 0, doubles: 0, doublesDepenses: 0, negatifs: 0, coupes: 0, confirmesAbsents: 0, achatsAnnules: 0, ecritures: 0, exemple: null };
  for (let k = 0; k < n; k += 1) {
    const seed = first + k;
    const res = simulateV2({ seed, tabs: 2 + (seed % 3), ops, retard, params, initial: seed % 4 === 0 ? 100 : 0, sansFusion });
    out.ecritures += res.ecritures;
    if (res.pertes) out.pertes += 1;
    if (res.doubles) out.doubles += 1;
    if (res.doublesDepenses) out.doublesDepenses += 1;
    if (res.negatif) out.negatifs += 1;
    if (res.nonPaye) out.coupes += 1;
    out.confirmesAbsents += res.achatsConfirmesAbsents;
    out.achatsAnnules += res.achatsAnnules;
    if (!res.ok) {
      out.echecs += 1;
      out.exemple ??= { seed, ...res };
    }
  }
  return out;
}
