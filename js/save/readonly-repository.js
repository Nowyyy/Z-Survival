// Sauvegarde en lecture seule (lot 4, « mode essai ») : lit la VRAIE sauvegarde (le joueur voit son vrai solde et ses vrais niveaux) mais n'écrit, n'efface
// et ne remplace rien dans l'adaptateur de dessous. Les différences s'appliquent à une copie de session en mémoire.
// session : { money (solde de session, ?money=N), levels (niveaux de session, partiels) } ; tout est facultatif.
// Lot 8h : codec (format) ; en v2, ?money=N ne touche pas la progression (il fixe la monnaie jaune de la partie, js/game/bank.js).
import { codecV1 } from './codecs.js';
import { failure, safely } from './repository.js';

export function createReadOnlyRepository(inner, session = {}, params, codec = codecV1(params)) {
  let current = null; // copie de session (créée à la première lecture)
  const field = codec.version === 2 ? 'niveaux' : 'stats';
  const base = () => {
    const loaded = safely(() => inner.load(), () => ({ status: 'unavailable', save: codec.empty(), warnings: [] }));
    let save = codec.clean(loaded.save);
    if (codec.version === 1 && Number.isInteger(session?.money) && session.money >= 0) save = { ...save, money: session.money };
    if (session?.levels && typeof session.levels === 'object') save = codec.clean({ ...save, [field]: { ...save[field], ...session.levels } });
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
      const c = codec.commit(current ?? base().save, delta, now);
      current = c.save;
      return { ok: true, applied: false, save: structuredClone(current), ...(codec.version === 2 ? { refused: c.refused } : {}) };
    }, () => failure('error')),
    replace: (save, now) => safely(() => {
      current = codec.clean(codec.replace(save, now, Math.min(Number.MAX_SAFE_INTEGER, codec.clean(save).rev + 1)));
      return { ok: true, applied: false, save: structuredClone(current) };
    }, () => failure('error')),
    clear: () => safely(() => {
      current = codec.empty();
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
