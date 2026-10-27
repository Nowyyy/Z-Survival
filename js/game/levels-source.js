// Source des niveaux des statistiques du joueur. Lot 2b : ?lvl= de l'adresse (paramètre de diagnostic, disponible sans ?test=1 car il
// n'expose ni ne stocke rien). Ce module est le SEUL point à remplacer quand la sauvegarde arrivera (lot 4) ; jamais de stockage ici,
// jamais de copie de ?lvl= dans une sauvegarde. Renvoie { levels (normalisés), warnings }.
import { normalizeLevels, parseLevelsParam } from '../core/player-stats.js';

export function readLevels(search, params) {
  const raw = new URLSearchParams(search).get('lvl');
  const parsed = parseLevelsParam(raw ?? '', params);
  const normal = normalizeLevels(parsed.levels, params);
  return { levels: normal.levels, warnings: [...parsed.warnings, ...normal.warnings] };
}
