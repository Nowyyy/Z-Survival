// Lot 8h : formats des dépôts de sauvegarde. Le même dépôt (local, mémoire, lecture seule) sert la sauvegarde v1 (zs.save.v1, différences d'argent,
// js/core/save.js : V0.7 et avant, gardée pour ses tests et le code ZS1) et la progression v2 (zs.save.v2, opérations, js/core/progression.js : V0.8).
// Un format = { key, maxBytes, empty(), tidy(save) → { save, warnings }, parse(json) → { ok, save, warnings, extra?, error? }, clean(save), commit(save, delta, now, extra) →
// { next (objet écrit), save (nettoyée), refused }, replace(save, now, rev) → objet écrit, sum(delta, extras, merge) → delta }.
import { commitDelta, defaultSave, migrate, sanitize } from '../core/save.js';
import * as v2 from '../core/progression.js';

export function codecV1(params) {
  return {
    version: 1,
    key: typeof params?.save?.storageKey === 'string' ? params.save.storageKey : 'zs.save.v1',
    maxBytes: Number.isInteger(params?.save?.maxStoredBytes) ? params.save.maxStoredBytes : 0,
    empty: defaultSave,
    parse: (json) => migrate(json, params),
    clean: (save) => sanitize(save, params).save,
    tidy: (save) => sanitize(save, params),
    commit: (save, delta, now) => {
      const next = commitDelta(save, delta, now, params);
      return { next, save: next, refused: [] };
    },
    replace: (save, now, rev) => ({ ...commitDelta(sanitize(save, params).save, {}, now, params), rev }),
    sum: (delta, extras, merge) => merge.sumDeltas([delta, ...extras]),
  };
}

export function codecV2(params) {
  const cfg = params?.save?.v2 ?? {};
  return {
    version: 2,
    key: typeof cfg.storageKey === 'string' ? cfg.storageKey : 'zs.save.v2',
    maxBytes: Number.isInteger(cfg.maxStoredBytes) ? cfg.maxStoredBytes : 0,
    empty: v2.defaultProgression,
    parse: (json) => v2.lire(json, params),
    clean: (save) => v2.sanitize(save, params).save,
    tidy: (save) => v2.sanitize(save, params),
    commit: (save, ops, now, extra) => {
      const r = v2.appliquerOps(save, ops, now, params);
      return { next: v2.serialiser(r.save, extra), save: r.save, refused: r.refused };
    },
    replace: (save, now, rev) => {
      const s = v2.sanitize(save, params).save;
      s.rev = rev;
      if (Number.isInteger(now) && now >= 0) s.savedAt = now;
      return v2.serialiser(s);
    },
    sum: (delta, extras) => v2.enchainer(delta, extras),
  };
}
