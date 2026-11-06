// Sauvegarde locale (lot 4) : le SEUL module qui lit et écrit le stockage du navigateur, et seulement sa clé save.json `storageKey` (zs.save.v1).
// `storage` est l'objet localStorage injecté (testable avec un faux) ou null quand le navigateur le refuse. Aucune méthode ne lève d'exception.
//
// Règles : clé absente = `empty` (la sauvegarde par défaut, RIEN n'est écrit) ; contenu trop gros, JSON invalide ou racine qui n'est pas un objet = `corrupt` ;
// version supérieure = `future` ; les deux sont VERROUILLÉES : le dépôt n'écrit plus rien (le texte brut est gardé pour la page sauvegarde.html)
// tant que le joueur n'a pas importé un code (replace) ou choisi « Repartir de zéro » (clear). Un schéma réparable (valeurs hors bornes, clés
// inconnues) est `ok` avec des avertissements et n'est corrigé qu'à la prochaine écriture. commit relit la clé juste avant d'écrire : deux onglets
// additionnent leurs gains au lieu de s'écraser.
import { commitDelta, defaultSave, migrate, sanitize } from '../core/save.js';
import { errorName, failure, safely } from './repository.js';

const RAW_KEEP = 65_536; // texte brut gardé (pour l'afficher et le copier), en caractères
const byteLength = (text) => new TextEncoder().encode(text).length;

// options : { listen(handler) -> stop (écoute de l'événement `storage`), persist() -> Promise<boolean> (navigator.storage.persist) }
export function createLocalRepository(storage, params, options = {}) {
  const key = typeof params?.save?.storageKey === 'string' ? params.save.storageKey : 'zs.save.v1';
  const maxBytes = Number.isInteger(params?.save?.maxStoredBytes) ? params.save.maxStoredBytes : 0;
  let last = { status: 'empty', locked: false };
  let wrote = false;
  let persistence = null; // résultat de requestPersistence : jamais redemandé

  // Lit et analyse la clé : { status, save, warnings, raw?, locked, text }.
  function read() {
    let text;
    try {
      if (storage === null || storage === undefined) throw new Error('no storage');
      text = storage.getItem(key);
    } catch {
      return { status: 'unavailable', save: defaultSave(), warnings: [], locked: true, text: null };
    }
    if (text === null || text === undefined) return { status: 'empty', save: defaultSave(), warnings: [], locked: false, text: null };
    const bad = (status) => ({ status, save: defaultSave(), warnings: [], raw: String(text).slice(0, RAW_KEEP), locked: true, text });
    if (typeof text !== 'string' || text.length > maxBytes || byteLength(text) > maxBytes) return bad('corrupt');
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      return bad('corrupt');
    }
    const result = migrate(parsed, params);
    if (!result.ok) return bad(result.error === 'future-version' ? 'future' : 'corrupt');
    return { status: 'ok', save: result.save, warnings: result.warnings, locked: false, text };
  }

  function write(next) {
    try {
      storage.setItem(key, JSON.stringify(next));
      wrote = true;
      last = { status: 'ok', locked: false };
      return { ok: true, applied: true, save: structuredClone(next) };
    } catch (error) {
      return failure(errorName(error));
    }
  }

  const remember = (r) => {
    last = { status: r.status, locked: r.locked };
    return r;
  };
  const listeners = new Set();
  let stopListening = null;
  const onStorage = (event) => {
    if (event && event.key !== null && event.key !== key) return;
    if (event && event.storageArea && storage && event.storageArea !== storage) return;
    const r = remember(read());
    for (const fn of [...listeners]) safely(() => fn(structuredClone(r.save), r.status), null);
  };

  return {
    load() {
      return safely(() => {
        const r = remember(read());
        return { status: r.status, save: r.save, warnings: r.warnings, ...(r.raw !== undefined ? { raw: r.raw } : {}) };
      }, () => ({ status: 'unavailable', save: defaultSave(), warnings: [] }));
    },
    commit(delta, now) {
      return safely(() => {
        const r = remember(read());
        if (r.locked) return failure('locked');
        return write(commitDelta(r.save, delta, now, params));
      }, () => failure('error'));
    },
    // Import d'un code : permis même quand la sauvegarde est verrouillée (c'est la façon de la déverrouiller), jamais quand le stockage est indisponible.
    replace(save, now) {
      return safely(() => {
        const r = remember(read());
        if (r.status === 'unavailable') return failure('locked');
        const incoming = sanitize(save, params).save;
        return write({ ...commitDelta(incoming, {}, now, params), rev: Math.min(Number.MAX_SAFE_INTEGER, r.save.rev + 1) });
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
  };
}
