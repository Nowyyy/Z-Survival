// Source des niveaux des statistiques du joueur. Ordre de priorité (lot 4) : 1) ?lvl= de l'adresse (mode essai : source « url ») ; 2) les niveaux de la
// sauvegarde (source « save ») ; 3) des zéros (source « default »). Ce module ne touche à aucun stockage et ne copie jamais ?lvl= dans une sauvegarde.
// Renvoie { levels (normalisés), warnings, source }. `save` : la sauvegarde lue par le dépôt, ou null/absente quand rien n'est lisible.
import { normalizeLevels, parseLevelsParam } from '../core/player-stats.js';

export function readLevels(search, params, save = null) {
  const raw = new URLSearchParams(search).get('lvl');
  if (raw !== null && raw.trim() !== '') {
    const parsed = parseLevelsParam(raw, params);
    // Lot 3 : chutes et reparation (parsed.extra) rejoignent les sept autres niveaux.
    const normal = normalizeLevels({ ...parsed.levels, ...parsed.extra }, params);
    return { levels: normal.levels, warnings: [...parsed.warnings, ...normal.warnings], source: 'url' };
  }
  if (save !== null && typeof save === 'object' && save.stats !== null && typeof save.stats === 'object') {
    const normal = normalizeLevels(save.stats, params);
    return { levels: normal.levels, warnings: normal.warnings, source: 'save' };
  }
  const normal = normalizeLevels({}, params);
  return { levels: normal.levels, warnings: normal.warnings, source: 'default' };
}
