// Sauvegarde en mémoire (lot 4) : mêmes règles que le dépôt local, sans stockage. Sert à ?test=1 (aucune écriture nulle part) et de base au mode essai.
// Lot 8h : codec (format, js/save/codecs.js : v1 par défaut, v2 pour la progression).
import { codecV1 } from './codecs.js';
import { failure, safely } from './repository.js';

// initial : sauvegarde de départ (facultative, nettoyée) ; params : { save, economy, stats }.
export function createMemoryRepository(initial, params, codec = codecV1(params)) {
  const clean = initial === undefined || initial === null ? null : codec.tidy(initial);
  let current = clean ? clean.save : codec.empty();
  let status = clean ? 'ok' : 'empty';
  const warnings = clean ? clean.warnings : [];
  const listeners = new Set();
  const copy = (save) => structuredClone(save);

  return {
    load: () => ({ status, save: copy(current), warnings: [...warnings] }),
    commit: (delta, now) => safely(() => {
      const c = codec.commit(current, delta, now);
      current = c.save;
      status = 'ok';
      return { ok: true, applied: true, save: copy(current), ...(codec.version === 2 ? { refused: c.refused } : {}) };
    }, () => failure('error')),
    replace: (save, now) => safely(() => {
      current = codec.clean(codec.replace(save, now, Math.min(Number.MAX_SAFE_INTEGER, current.rev + 1)));
      status = 'ok';
      return { ok: true, applied: true, save: copy(current) };
    }, () => failure('error')),
    clear: () => safely(() => {
      current = codec.empty();
      status = 'empty';
      return { ok: true, applied: true, save: copy(current) };
    }, () => failure('error')),
    info: () => ({ kind: 'memory', readOnly: false, locked: false, key: null, status }),
    subscribe: (fn) => {
      if (typeof fn !== 'function') return () => {};
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    requestPersistence: async () => null,
    // Test : simule la modification de la sauvegarde par une autre page.
    externalChange(save) {
      current = codec.clean(save);
      status = 'ok';
      for (const fn of [...listeners]) safely(() => fn(copy(current)), null);
    },
  };
}
