// Sauvegarde en mémoire (lot 4) : mêmes règles que le dépôt local, sans stockage. Sert à ?test=1 (aucune écriture nulle part) et de base au mode essai.
import { commitDelta, defaultSave, sanitize } from '../core/save.js';
import { failure, safely } from './repository.js';

// initial : sauvegarde de départ (facultative, nettoyée) ; params : { save, economy, stats }.
export function createMemoryRepository(initial, params) {
  const clean = initial === undefined || initial === null ? null : sanitize(initial, params);
  let current = clean ? clean.save : defaultSave();
  let status = clean ? 'ok' : 'empty';
  const warnings = clean ? clean.warnings : [];
  const listeners = new Set();
  const copy = (save) => structuredClone(save);

  return {
    load: () => ({ status, save: copy(current), warnings: [...warnings] }),
    commit: (delta, now) => safely(() => {
      current = commitDelta(current, delta, now, params);
      status = 'ok';
      return { ok: true, applied: true, save: copy(current) };
    }, () => failure('error')),
    replace: (save, now) => safely(() => {
      const next = commitDelta(sanitize(save, params).save, {}, now, params);
      current = { ...next, rev: Math.min(Number.MAX_SAFE_INTEGER, current.rev + 1) };
      status = 'ok';
      return { ok: true, applied: true, save: copy(current) };
    }, () => failure('error')),
    clear: () => safely(() => {
      current = defaultSave();
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
      current = sanitize(save, params).save;
      status = 'ok';
      for (const fn of [...listeners]) safely(() => fn(copy(current)), null);
    },
  };
}
