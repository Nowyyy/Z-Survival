// Sauvegarde locale (lot 4) : le SEUL module qui lit et écrit le stockage du navigateur, et seulement sa clé save.json `storageKey` (zs.save.v1).
// `storage` est l'objet localStorage injecté (testable avec un faux) ou null quand le navigateur le refuse. Aucune méthode ne lève d'exception.
//
// Règles : clé absente = `empty` (la sauvegarde par défaut, RIEN n'est écrit) ; contenu trop gros, JSON invalide ou racine qui n'est pas un objet = `corrupt` ;
// version supérieure = `future` ; les deux sont VERROUILLÉES : le dépôt n'écrit plus rien (le texte brut est gardé pour la page sauvegarde.html)
// tant que le joueur n'a pas importé un code (replace) ou choisi « Repartir de zéro » (clear). Un schéma réparable (valeurs hors bornes, clés
// inconnues) est `ok` avec des avertissements et n'est corrigé qu'à la prochaine écriture. commit relit la clé juste avant d'écrire : deux onglets
// additionnent leurs gains au lieu de s'écraser.
//
// Lot 5o (défaut des deux onglets) : cette relecture peut être périmée (l'écriture d'un autre onglet n'y est pas encore visible) et un gain était alors
// effacé. Avec un canal entre onglets (options.channel, BroadcastChannel), chaque écriture est annoncée par un relevé (base lue, texte écrit) et chaque
// onglet réécrit ses propres gains CERTAINEMENT absents de la valeur stockée (js/core/save-merge.js, chargé seulement quand un autre onglet se manifeste).
// Le texte stocké garde exactement son format : seul, un onglet écrit les mêmes octets qu'avant. Sans canal : comportement d'avant, sans erreur.
import { makeRecord } from '../core/save.js';
import { codecV1 } from './codecs.js';
import { errorName, failure, safely } from './repository.js';

const RAW_KEEP = 65_536; // texte brut gardé (pour l'afficher et le copier), en caractères
const byteLength = (text) => new TextEncoder().encode(text).length;
const KEEP = 256; // relevés, écritures et valeurs vues retenus par onglet (les plus récents)
const KEEP_OPS = 1024; // gains écrits retenus par onglet (au-delà : jamais réécrits)
const HELLO = 'zs-onglet'; // annonce d'un onglet sur le canal
const keep = (map, k, v, max) => {
  map.delete(k);
  map.set(k, v);
  if (map.size > max) map.delete(map.keys().next().value);
};

// Identifiant d'onglet : 12 octets aléatoires (crypto), sinon l'heure et un compteur (aucun générateur pseudo-aléatoire).
let tabCounter = 0;
function newTabId() {
  try {
    const bytes = globalThis.crypto.getRandomValues(new Uint8Array(12));
    return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  } catch {
    tabCounter += 1;
    return `t${Date.now().toString(36)}-${tabCounter}`;
  }
}

// options : { listen(handler) -> stop (écoute de l'événement `storage`), persist() -> Promise<boolean> (navigator.storage.persist),
//             lot 5o : channel(nom) -> canal entre onglets ou null, merge (module save-merge.js ou fonction qui le charge), now() -> ms (date des
//             réparations), tabId (tests) ; lot 8h : codec (format, js/save/codecs.js : v1 par défaut, v2 pour zs.save.v2) }
export function createLocalRepository(storage, params, options = {}) {
  const codec = options.codec ?? codecV1(params);
  const { key, maxBytes } = codec;
  const defaultSave = codec.empty;
  let last = { status: 'empty', locked: false };
  let wrote = false;
  let persistence = null; // résultat de requestPersistence : jamais redemandé
  let lastText = null; // texte de la dernière écriture réussie
  const listeners = new Set();
  const tabs = openTabs(options);

  // Lit et analyse la clé : { status, save, warnings, raw?, locked, text }.
  function read() {
    let text;
    try {
      if (storage === null || storage === undefined) throw new Error('no storage');
      text = storage.getItem(key);
    } catch {
      return { status: 'unavailable', save: defaultSave(), warnings: [], locked: true, text: null };
    }
    return parse(text);
  }

  // Analyse un texte de la clé : { status, save, warnings, raw?, locked, text }.
  function parse(text) {
    if (text === null || text === undefined) return { status: 'empty', save: defaultSave(), warnings: [], locked: false, text: null };
    const bad = (status) => ({ status, save: defaultSave(), warnings: [], raw: String(text).slice(0, RAW_KEEP), locked: true, text });
    if (typeof text !== 'string' || text.length > maxBytes || byteLength(text) > maxBytes) return bad('corrupt');
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      return bad('corrupt');
    }
    const result = codec.parse(parsed);
    if (!result.ok) return bad(result.error === 'future-version' ? 'future' : 'corrupt');
    return { status: 'ok', save: result.save, warnings: result.warnings, extra: result.extra, locked: false, text };
  }

  // clean : sauvegarde nettoyée rendue à l'appelant (v2 : sans champs inconnus ni identifiant d'écriture) ; refused : opérations refusées (v2).
  function write(next, clean = next, refused = undefined) {
    try {
      lastText = JSON.stringify(next);
      storage.setItem(key, lastText);
      wrote = true;
      last = { status: 'ok', locked: false };
      return { ok: true, applied: true, save: structuredClone(clean), ...(refused ? { refused } : {}) };
    } catch (error) {
      return failure(errorName(error));
    }
  }

  const remember = (r) => {
    last = { status: r.status, locked: r.locked };
    return r;
  };
  // refused (v2) : opérations de cet onglet refusées en les réécrivant (achat annulé après coup : la monnaie a été dépensée dans un autre onglet).
  const notify = (r, refused) => {
    for (const fn of [...listeners]) safely(() => fn(structuredClone(r.save), r.status, refused?.length ? refused : undefined), null);
  };
  let stopListening = null;
  const onStorage = (event) => {
    if (event && event.key !== null && event.key !== key) return;
    if (event && event.storageArea && storage && event.storageArea !== storage) return;
    if (tabs && event) tabs.saw(event.key === null ? null : event.newValue);
    notify(remember(read()));
    if (tabs) tabs.wake();
  };

  // Lot 5o : écriture d'un onglet suivie (commit ou réparation) : différence des gains `adds` en plus de `delta`, relevé annoncé aux autres onglets.
  function trackedWrite(stored, delta, now, own) {
    // Un relevé déjà reçu annonce une écriture plus récente que la copie locale du stockage : on bâtit dessus (écriture juste tout de suite).
    const newer = tabs?.merge?.newerBase ? tabs.merge.newerBase(tabs.view, stored.text) : null;
    const candidate = newer === null ? null : parse(newer);
    const r = candidate && candidate.status === 'ok' ? candidate : stored;
    const extra = tabs?.merge ? tabs.merge.missingOps(tabs.view, r.text) ?? [] : [];
    const sum = extra.length ? codec.sum(delta, extra.map((s) => tabs.view.ops.get(s)), tabs.merge) : delta;
    const c = codec.commit(r.save, sum, now, r.extra);
    const next = c.next;
    // Plusieurs onglets connus : identifiant d'écriture facultatif `w` (deux écritures n'ont jamais le même texte) ; seul, aucun champ de plus.
    const result = write(tabs.multi ? { ...next, w: `${tabs.view.id}.${(tabs.writes += 1)}` } : next, c.save, codec.version === 2 ? c.refused : undefined);
    if (result.ok) tabs.wrote(r.text, lastText, own, extra);
    return result;
  }

  // Lot 5o : réécrit les gains de cet onglet certainement absents de la valeur stockée (après un événement du stockage ou un relevé).
  function reconcile() {
    if (!tabs?.merge) return;
    const r = remember(read());
    if (r.locked) return;
    const missing = tabs.merge.missingOps(tabs.view, r.text);
    if (!missing || missing.length === 0) return;
    const now = typeof options.now === 'function' ? safely(options.now, r.save.savedAt) : r.save.savedAt;
    const done = trackedWrite(r, codec.version === 2 ? [] : {}, now, null);
    if (done.ok) notify(remember(read()), done.refused);
  }
  if (tabs) tabs.reconcile = reconcile;

  return {
    load() {
      return safely(() => {
        const r = remember(read());
        if (tabs) tabs.loaded(r.text);
        return { status: r.status, save: r.save, warnings: r.warnings, ...(r.raw !== undefined ? { raw: r.raw } : {}) };
      }, () => ({ status: 'unavailable', save: defaultSave(), warnings: [] }));
    },
    commit(delta, now) {
      return safely(() => {
        const r = remember(read());
        if (r.locked) return failure('locked');
        if (tabs) return trackedWrite(r, delta, now, delta);
        const c = codec.commit(r.save, delta, now, r.extra);
        return write(c.next, c.save, codec.version === 2 ? c.refused : undefined);
      }, () => failure('error'));
    },
    // Import d'un code : permis même quand la sauvegarde est verrouillée (c'est la façon de la déverrouiller), jamais quand le stockage est indisponible.
    replace(save, now) {
      return safely(() => {
        const r = remember(read());
        if (r.status === 'unavailable') return failure('locked');
        const next = codec.replace(save, now, Math.min(Number.MAX_SAFE_INTEGER, r.save.rev + 1));
        const result = write(next, codec.clean(next));
        if (result.ok && tabs) tabs.reset(r.text, lastText); // import voulu : les gains d'avant ne sont jamais réécrits
        return result;
      }, () => failure('error'));
    },
    // « Repartir de zéro » : efface la clé, aussi quand la sauvegarde est verrouillée.
    clear() {
      return safely(() => {
        const r = remember(read());
        if (r.status === 'unavailable') return failure('locked');
        try {
          storage.removeItem(key);
        } catch (error) {
          return failure(errorName(error));
        }
        last = { status: 'empty', locked: false };
        if (tabs) tabs.reset(r.text, null);
        return { ok: true, applied: true, save: defaultSave() };
      }, () => failure('error'));
    },
    info: () => ({ kind: 'local', readOnly: false, locked: last.locked, key, status: last.status }),
    subscribe(fn) {
      if (typeof fn !== 'function') return () => {};
      listeners.add(fn);
      if (stopListening === null && typeof options.listen === 'function') stopListening = safely(() => options.listen(onStorage), null);
      return () => {
        listeners.delete(fn);
        if (listeners.size === 0 && typeof stopListening === 'function') {
          safely(stopListening, null);
          stopListening = null;
        }
      };
    },
    // Demande un stockage persistant : au plus une fois par chargement, seulement après une première écriture réussie. true, false ou null (non pris en charge).
    async requestPersistence() {
      if (persistence !== null) return persistence.value;
      if (!wrote) return null;
      let value;
      try {
        const answer = typeof options.persist === 'function' ? await options.persist() : undefined;
        value = typeof answer === 'boolean' ? answer : null;
      } catch {
        value = null;
      }
      persistence = { value };
      return value;
    },
    // Test : événement `storage` simulé (voir onStorage).
    handleStorageEvent: onStorage,
    // Lot 5o (tests) : état du suivi entre onglets ({ id, seq, settled, merge } ou null sans canal).
    tabsInfo: () => (tabs ? { id: tabs.view.id, seq: tabs.seq, settled: tabs.view.settled, merge: tabs.merge !== null } : null),
  };
}

// Lot 5o : suivi entre onglets. null sans canal (navigateur sans BroadcastChannel, page Sauvegarde, tests) : le dépôt se comporte comme avant.
function openTabs(options) {
  const channel = typeof options.channel === 'function' ? safely(() => options.channel(), null) : null;
  if (!channel || typeof channel.postMessage !== 'function') return null;
  const view = { id: typeof options.tabId === 'string' ? options.tabId : newTabId(), settled: 0, ops: new Map(), own: new Map(), records: new Map(), seen: new Map() };
  const queue = []; // relevés reçus avant le chargement de save-merge.js
  let loading = false;
  const peers = new Set(); // onglets annoncés
  const tabs = {
    view,
    seq: 0,
    writes: 0,
    multi: false, // un autre onglet s'est manifesté (annonce, relevé ou événement du stockage)
    merge: null,
    reconcile: () => {},
    // Valeur lue au chargement, avant tout gain : aucun gain de cet onglet n'y figure.
    loaded(text) {
      if (tabs.seq === 0 && text !== null && !view.seen.has(text)) keep(view.seen, text, 0, KEEP);
    },
    // Valeur reçue par l'événement du stockage (dans l'ordre du navigateur). Clé effacée (« Repartir de zéro ») : les gains déjà écrits sont abandonnés.
    saw(text) {
      if (text === null || text === undefined) view.settled = tabs.seq;
      else if (typeof text === 'string' && !view.seen.has(text)) keep(view.seen, text, tabs.seq, KEEP);
    },
    // Écriture réussie : own = différence du nouveau gain (null pour une réparation), extra = gains réécrits.
    wrote(base, text, own, extra) {
      const adds = [...extra];
      if (own !== null) {
        tabs.seq += 1;
        keep(view.ops, tabs.seq, Array.isArray(own) ? [...own] : { ...own }, KEEP_OPS); // lot 8h : v2, liste d'opérations
        adds.push(tabs.seq);
      }
      keep(view.own, text, { base, adds }, KEEP);
      safely(() => channel.postMessage(makeRecord(view.id, base, text)), null);
    },
    reset(base, text) {
      view.settled = tabs.seq;
      if (text !== null) {
        keep(view.own, text, { base, adds: [] }, KEEP);
        safely(() => channel.postMessage(makeRecord(view.id, base, text)), null);
      }
    },
    // Un autre onglet s'est manifesté : charge save-merge.js (une fois), applique les relevés reçus, puis répare si besoin.
    wake() {
      tabs.multi = true;
      if (tabs.merge) {
        tabs.drain();
        tabs.reconcile();
        return;
      }
      if (loading || options.merge === undefined || options.merge === null) return;
      loading = true;
      const ready = (mod) => {
        if (!mod || typeof mod.missingOps !== 'function') return;
        tabs.merge = mod;
        tabs.wake();
      };
      if (typeof options.merge === 'function') Promise.resolve().then(options.merge).then(ready, () => {});
      else ready(options.merge);
    },
    drain() {
      while (queue.length > 0) {
        const r = tabs.merge.parseRecord(queue.shift(), 1 << 20);
        if (r === null || r.by === view.id) continue;
        const list = (view.records.get(r.value) ?? []).filter((x) => x.by !== r.by);
        keep(view.records, r.value, [...list, { by: r.by, base: r.base }], KEEP);
      }
    },
  };
  const hello = () => safely(() => channel.postMessage({ kind: HELLO, v: 1, by: view.id }), null);
  const onMessage = (event) => {
    const data = event?.data;
    // Annonce d'un onglet (à l'ouverture) : réponse une fois par onglet, pour que le nouveau venu sache aussi qu'il n'est pas seul.
    if (data?.kind === HELLO) {
      if (typeof data.by !== 'string' || data.by === view.id || data.by.length > 64) return;
      if (!peers.has(data.by)) {
        peers.add(data.by);
        hello();
      }
      tabs.wake();
      return;
    }
    if (queue.length >= KEEP) queue.shift();
    queue.push(data);
    tabs.wake();
  };
  if (typeof channel.addEventListener === 'function') safely(() => channel.addEventListener('message', onMessage), null);
  else channel.onmessage = onMessage;
  hello();
  return tabs;
}
