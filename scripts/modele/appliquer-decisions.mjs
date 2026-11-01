// Applique data/game/maps/rez-de-chaussee/ecarts-decisions.json aux SOURCES de la carte (plan.json, etage.json) — lot 3g.
// Idempotent et déterministe ; n'écrit que les sources (jamais world.json, decor.json ni etage.world.json : lancer ensuite `npm run carte`).
// Usage : node scripts/modele/appliquer-decisions.mjs [--essai]   (--essai : rapport seulement, rien n'est écrit)
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { STATUS, applyDecisions, formatSource } from '../../js/core/decisions.js';

const DIR = process.env.CARTE_DIR ?? 'data/game/maps/rez-de-chaussee';
const files = { rdc: `${DIR}/plan.json`, etage: `${DIR}/etage.json` };
const sources = Object.fromEntries(Object.entries(files).map(([k, f]) => [k, existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : null]));
const { decisions = [] } = JSON.parse(readFileSync(`${DIR}/ecarts-decisions.json`, 'utf8'));
const { sources: next, report } = applyDecisions(sources, decisions);
for (const r of report) console.log(`${r.floor.padEnd(5)} ${String(r.id).padEnd(16)} ${String(r.action).padEnd(9)} ${r.status} — ${r.details}`);
const count = (s) => report.filter((r) => r.status === s).length;
console.log(`Bilan : ${count(STATUS.done)} appliquée(s), ${count(STATUS.already)} déjà appliquée(s), ${count(STATUS.refused)} ignorée(s) (non approuvées), ${count(STATUS.missing)} introuvable(s).`);
if (count(STATUS.missing)) console.warn('Avertissement : des identifiants n\'existent plus dans la base (voir « introuvable ») ; rien d\'autre n\'est changé pour eux.');
if (!process.argv.includes('--essai')) {
  for (const [k, f] of Object.entries(files)) {
    if (!next[k]) continue;
    const text = formatSource(next[k]);
    if (text !== readFileSync(f, 'utf8')) writeFileSync(f, text);
  }
  console.log('Sources écrites (si changées). Ensuite : npm run carte, node scripts/zones-metriques.mjs --etages, npm test.');
}
