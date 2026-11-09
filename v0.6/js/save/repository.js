// Interface SaveRepository (lot 4) : le seul endroit où le jeu et la page sauvegarde.html lisent et écrivent la sauvegarde. Les adaptateurs
// (memory-repository.js, local-repository.js, readonly-repository.js) respectent tous la même interface ; la suite de contrat de
// tests/unit/helpers/save-contract.js la vérifie sur chacun. AUCUNE méthode ne lève d'exception.
//
// @typedef {'ok'|'empty'|'corrupt'|'future'|'unavailable'} LoadStatus
// @typedef {{ status: LoadStatus, save: object, warnings: string[], raw?: string }} LoadResult
//   load() : lit la sauvegarde. `save` est toujours une sauvegarde v1 valide (la sauvegarde par défaut quand rien n'est lisible) ; `raw` (texte brut)
//   n'est présent que pour `corrupt` et `future`.
// @typedef {{ ok: boolean, applied: boolean, save?: object, error?: string }} WriteResult
//   commit(delta, now) : applique une différence (voir commitDelta de js/core/save.js) à la valeur la plus récente ; `save` est la sauvegarde fusionnée.
//   replace(save, now) : remplace tout (import d'un code). clear() : efface. `applied` est faux en lecture seule (rien n'a été écrit).
//   Échec : { ok: false, applied: false, error }, l'appelant garde ses gains en attente.
// @typedef {{ kind: 'local'|'memory', readOnly: boolean, locked: boolean, key: string|null, status: LoadStatus }} RepositoryInfo
//   info() : description de l'adaptateur et état de la dernière lecture.
//   subscribe(fn) : fn(save) est appelée quand une AUTRE page modifie la sauvegarde ; renvoie la fonction de désabonnement.
export const STATUSES = ['ok', 'empty', 'corrupt', 'future', 'unavailable'];
export const REPOSITORY_METHODS = ['load', 'commit', 'replace', 'clear', 'info', 'subscribe'];

// Nom d'erreur lisible et court d'une exception (QuotaExceededError, SecurityError…) : jamais le message complet.
export function errorName(error) {
  const name = typeof error?.name === 'string' && error.name !== '' ? error.name : 'error';
  return name.slice(0, 40).replace(/[^\w.-]/g, '?');
}

export const failure = (error) => ({ ok: false, applied: false, error });

// Exécute fn ; en cas d'exception, renvoie le repli. Garantit qu'une méthode d'un adaptateur ne lève jamais.
export function safely(fn, fallback) {
  try {
    return fn();
  } catch (error) {
    return typeof fallback === 'function' ? fallback(error) : fallback;
  }
}

// Vérifie qu'un objet a toutes les méthodes de l'interface.
export const isRepository = (r) => r !== null && typeof r === 'object' && REPOSITORY_METHODS.every((m) => typeof r[m] === 'function');
