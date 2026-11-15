// Lot 8k : simulateur déterministe de plusieurs onglets (même modèle du stockage que onglets-v2-simulateur.js du lot 8h : copie locale périmée
// pendant un retard tiré au hasard, écritures appliquées dans l'ordre d'arrivée, événement `storage` et canal avec leurs propres retards), étendu aux
// médailles : portes (montant, identifiant unique), paliers (même palier tenté par plusieurs onglets avec des identifiants différents), partie du
// jour (même jour tenté par plusieurs onglets), achats de caisse en médailles avec pitié (tirage fait avec les compteurs lus par l'onglet). Le VRAI
// dépôt local, le format v2 et la fusion. Aucun navigateur, aucune horloge réelle, aucun Math.random.
import { createLocalRepository } from '../../../js/save/local-repository.js';
import { codecV2 } from '../../../js/save/codecs.js';
import * as merge from '../../../js/core/save-merge.js';
import { appliquerOps, defaultProgression, serialiser, soldeMedailles } from '../../../js/core/progression.js';
import { tirerPitie } from '../../../js/core/caisses.js';
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

const PALIER = 50;
const JOUR = 100;
const PORTE = 10;
const PRIX = 100;

// options : { seed, tabs, ops, retard, params, caisse, cat, regles, initial (médailles de départ) }.
export function simulateMedailles({ seed, tabs: nTabs = 2, ops = 10, retard = 10, params, caisse, cat, regles, initial = 0 } = {}) {
  const r = rng(seed);
  const pick = (max) => Math.floor(r() * (max + 1));
  const s = scheduler();
  const codec = codecV2(params);
  const KEY = codec.key;
  let now = 0;
  let writes = 0;
  // Départ : médailles et compteurs de pitié tirés (près d'une garantie parfois).
  const depart = appliquerOps(defaultProgression(), [{ id: 'depart', t: 'gain', medailles: initial }, { id: 'pit', t: 'pitie', valeurs: { equipement: { e: pick(9), l: 60 + pick(9) } } }], 1, params).save;
  let auth = JSON.stringify(serialiser(depart));
  const tabs = [];
  let opSeq = 0;
  const portes = []; // gains de porte écrits : { id }
  const paliersTentes = new Set(); // paliers écrits (au moins une fois)
  let jourTente = false;
  const achats = new Map(); // id → { de, a, objets, u, prix }

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
    tab.repo = createLocalRepository(tab.storage, params, {
      codec,
      channel: () => ({ postMessage: (d) => tab.post(d), addEventListener: (_t, fn) => { tab.onMessage = fn; } }),
      merge,
      now: () => Math.floor(now / 4),
      tabId: `t${i}`,
      listen: () => () => {},
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
    const id = `m${seed}x${opSeq}`;
    const x = r();
    if (x < 0.25) {
      const res = tab.repo.commit([{ id, t: 'gain', medailles: PORTE }], Math.floor(now / 4));
      if (res.ok) portes.push(id);
      return;
    }
    if (x < 0.4) {
      const manche = 5 * (1 + pick(3)); // 5, 10, 15 ou 20 : plusieurs onglets franchissent les mêmes paliers
      const res = tab.repo.commit([{ id, t: 'gain', palier: { mode: 'histoire', monde: 'batiment', manche, pas: 5, gain: PALIER } }], Math.floor(now / 4));
      if (res.ok) for (let p = 5; p <= manche; p += 5) paliersTentes.add(p);
      return;
    }
    if (x < 0.5) {
      const res = tab.repo.commit([{ id, t: 'gain', jour: { n: 20406, gain: JOUR } }], Math.floor(now / 4));
      if (res.ok) jourTente = true;
      return;
    }
    // Achat ×1 ou ×10 : relecture, tirage avec les compteurs lus, prix + objets + compteurs dans la même opération.
    const lu = tab.repo.load();
    if (lu.status !== 'ok' && lu.status !== 'empty') return;
    const n = r() < 0.3 ? 10 : 1;
    const prix = PRIX * n;
    if (soldeMedailles(lu.save) < prix) return;
    const de = { ...lu.save.pitie.equipement };
    const t = tirerPitie(caisse, cat, regles, de, (seed * 7919 + opSeq) >>> 0, n);
    const u = t.objets.map((_, k) => `${id}.${k}`);
    const res = tab.repo.commit([{ id, t: 'achat', monnaie: 'medailles', prix, place: 1000, objets: t.objets.map((o, k) => ({ u: u[k], i: o.id, r: o.rarete })), pitie: { r: 'equipement', de, a: { ...t.compteurs } } }], Math.floor(now / 4));
    if (res.ok) achats.set(id, { de, a: { ...t.compteurs }, objets: t.objets, u, prix });
  }

  for (let i = 0; i < nTabs; i += 1) s.at(i === 0 ? 0 : pick(20), () => tabs.push(makeTab(i)));
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

  const fin = codec.parse(JSON.parse(auth)).save;
  // Médailles attendues : départ + portes écrites + paliers distincts (une fois chacun) + jour (une fois).
  const paliersFin = fin.paliers.histoire.batiment ?? 0;
  const attendu = initial + portes.length * PORTE + paliersTentes.size * PALIER + (jourTente ? JOUR : 0);
  // Achats présents (objets) : entiers ou absents (jamais coupés) ; prix payés une fois.
  const presents = new Map();
  for (const o of fin.objets) {
    const aid = o.u.slice(0, o.u.lastIndexOf('.'));
    presents.set(aid, (presents.get(aid) ?? 0) + 1);
  }
  let payes = 0;
  let coupe = false;
  const acceptes = [];
  for (const [aid, a] of achats) {
    const n = presents.get(aid) ?? 0;
    if (n === a.u.length) {
      payes += a.prix;
      acceptes.push(a);
    } else if (n !== 0) coupe = true;
  }
  let doubleDepense = fin.medailles.depense !== payes;
  for (const [aid, n] of presents) if (!achats.has(aid) || n > achats.get(aid).u.length) doubleDepense = true;
  // Pitié : les achats acceptés forment UNE chaîne depuis les compteurs de départ (chacun part exactement des compteurs laissés par le précédent)
  // jusqu'aux compteurs finaux : aucune garantie perdue ni dupliquée ; et sur cette chaîne, jamais 10 tirages sans épique ni 70 sans légendaire.
  const cle = (c) => `${c.e}:${c.l}`;
  const RANG = Object.fromEntries(cat.raretes.map((x, i) => [x.id, i]));
  const essayer = (cpt, restants, sansE, sansL) => {
    if (restants.length === 0) return cle(cpt) === cle(fin.pitie.equipement);
    for (let k = 0; k < restants.length; k += 1) {
      const a = restants[k];
      if (cle(a.de) !== cle(cpt)) continue;
      let e = sansE;
      let l = sansL;
      let ok = true;
      for (const o of a.objets) {
        e = RANG[o.rarete] >= RANG.epique ? 0 : e + 1;
        l = o.rarete === 'legendaire' ? 0 : l + 1;
        if (e > 9 || l > 69) ok = false;
      }
      if (ok && essayer(a.a, [...restants.slice(0, k), ...restants.slice(k + 1)], e, l)) return true;
    }
    return false;
  };
  const chaineOk = essayer(depart.pitie.equipement, acceptes, depart.pitie.equipement.e, depart.pitie.equipement.l);
  const res = {
    gagne: fin.medailles.gagne, attendu, depense: fin.medailles.depense, payes,
    pertes: fin.medailles.gagne < attendu, doubles: fin.medailles.gagne > attendu,
    doublesDepenses: doubleDepense, negatif: fin.medailles.depense > fin.medailles.gagne, coupe,
    pitie: !chaineOk,
    paliers: paliersFin !== (paliersTentes.size ? Math.max(...paliersTentes) : 0),
    jours: fin.medailles.jour !== (jourTente ? 20406 : 0),
    achats: acceptes.length, annules: achats.size - acceptes.length, calme: s.size === 0, ecritures: writes,
  };
  res.ok = !res.pertes && !res.doubles && !res.doublesDepenses && !res.negatif && !res.coupe && !res.pitie && !res.paliers && !res.jours && res.calme;
  return res;
}

export function campagneMedailles({ n, params, caisse, cat, regles, first = 1, ops = 10, retard = 10 }) {
  const out = { n, echecs: 0, pertes: 0, doubles: 0, doublesDepenses: 0, negatifs: 0, coupes: 0, pitie: 0, paliers: 0, jours: 0, achats: 0, annules: 0, ecritures: 0, exemple: null };
  for (let k = 0; k < n; k += 1) {
    const seed = first + k;
    const res = simulateMedailles({ seed, tabs: 2 + (seed % 3), ops, retard, params, caisse, cat, regles, initial: seed % 4 === 0 ? 3000 : 1200 });
    out.ecritures += res.ecritures;
    out.achats += res.achats;
    out.annules += res.annules;
    for (const k2 of ['pertes', 'doubles', 'doublesDepenses', 'pitie', 'paliers', 'jours']) if (res[k2]) out[k2] += 1;
    if (res.negatif) out.negatifs += 1;
    if (res.coupe) out.coupes += 1;
    if (!res.ok) {
      out.echecs += 1;
      out.exemple ??= { seed, ...res };
    }
  }
  return out;
}
