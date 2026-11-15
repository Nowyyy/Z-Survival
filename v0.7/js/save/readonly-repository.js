// Sauvegarde en lecture seule (lot 4, « mode essai ») : lit la VRAIE sauvegarde (le joueur voit son vrai solde et ses vrais niveaux) mais n'écrit, n'efface
// et ne remplace rien dans l'adaptateur de dessous. Les différences s'appliquent à une copie de session en mémoire.
// session : { money (solde de session, ?money=N), levels (niveaux de session, partiels) } ; tout est facultatif.
import { commitDelta, defaultSave, sanitize } from '../core/save.js';
import { failure, safely } from './repository.js';

export function createReadOnlyRepository(inner, session = {}, params) {
  let current = null; // copie de session (créée à la première lecture)
  const base = () => {
    const loaded = safely(() => inner.load(), () => ({ status: 'unavailable', save: defaultSave(), warnings: [] }));
    let save = sanitize(loaded.save, params).save;
    if (Number.isInteger(session?.money) && session.money >= 0) save = { ...save, money: session.money };
    if (session?.levels && typeof session.levels === 'object') save = sanitize({ ...save, stats: { ...save.stats, ...session.levels } }, params).save;
    return { loaded, save };
  };

  return {
    load() {
      const { loaded, save } = base();
      current ??= save;
      const { raw } = loaded;
      return { status: loaded.status, save: structuredClone(current), warnings: [...(loaded.warnings ?? [])], ...(raw !== undefined ? { raw } : {}) };
    },
    commit: (delta, now) => safely(() => {
      current = commitDelta(current ?? base().save, delta, now, params);
      return { ok: true, applied: false, save: structuredClone(current) };
    }, () => failure('error')),
    replace: (save, now) => safely(() => {
      current = commitDelta(sanitize(save, params).save, {}, now, params);
      return { ok: true, applied: false, save: structuredClone(current) };
    }, () => failure('error')),
    clear: () => safely(() => {
      current = defaultSave();
      return { ok: true, applied: false, save: structuredClone(current) };
    }, () => failure('error')),
    info: () => {
      const info = safely(() => inner.info(), () => ({ kind: 'memory', locked: false, key: null, status: 'unavailable' }));
      return { kind: info.kind, readOnly: true, locked: info.locked === true, key: info.key ?? null, status: info.status };
    },
    subscribe: (fn) => safely(() => inner.subscribe(fn), () => () => {}),
    requestPersistence: async () => null,
  };
}
