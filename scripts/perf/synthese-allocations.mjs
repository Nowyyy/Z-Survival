// Lot 5d — Synthèse des mesures de scripts/perf/mesurer.mjs (fichiers JSON) en tableaux Markdown : sites d'allocation (moyenne des
// configurations scénario × préréglage), séparés en « fichiers autorisés du lot 5d » et « autres » ; allocations par groupe (collision.js,
// poses, autres) ; avec deux fichiers (avant, après) : comparaison par configuration. Rendu logiciel : valeurs relatives seulement.
//
// Usage : node scripts/perf/synthese-allocations.mjs avant.json [après.json] [--top 15]
import { readFileSync } from 'node:fs';

const args = process.argv.slice(2);
const top = (() => {
  const i = args.indexOf('--top');
  return i >= 0 ? Number(args[i + 1]) || 15 : 15;
})();
const files = args.filter((a, i) => !a.startsWith('--') && args[i - 1] !== '--top');
const load = (f) => JSON.parse(readFileSync(f, 'utf8')).results;
const ALLOWED = ['js/core/collision.js', 'js/core/pose-v2.js', 'js/core/character-parts.js'];
const POSES = ['js/core/pose-v2.js', 'js/core/character-parts.js', 'js/game/character-v2.js'];
const r1 = (v) => (Number.isFinite(v) ? Math.round(v * 10) / 10 : '—');
const pct = (a, b) => (Number.isFinite(a) && Number.isFinite(b) && b ? `${Math.round((a / b - 1) * 100)} %` : '—');

// Groupes par configuration : total, collision.js, poses (pose-v2, character-parts, character-v2), autres.
function groups(m) {
  const f = m.files ?? {};
  const collision = f['js/core/collision.js'] ?? 0;
  const poses = POSES.reduce((s, k) => s + (f[k] ?? 0), 0);
  return { total: m.allocKB, collision, poses, autres: m.allocKB - collision - poses, tas: m.heapGrowthKB };
}

const before = load(files[0]);
const keys = Object.keys(before);
// Sites : moyenne sur les configurations (un site absent du relevé d'une configuration y compte pour 0).
const sites = new Map();
for (const k of keys) for (const [site, kb] of before[k].topSites ?? []) sites.set(site, (sites.get(site) ?? 0) + kb / keys.length);
const total = keys.reduce((s, k) => s + before[k].allocKB / keys.length, 0);
const ranked = [...sites.entries()].sort((a, b) => b[1] - a[1]).slice(0, top);
const isAllowed = (site) => ALLOWED.some((f) => site.includes(f));
console.log(`Allocations moyennes : ${r1(total)} Ko par image (${keys.length} configurations : ${keys.map((k) => k.replace(/^[^/]+\//, '')).join(', ')})\n`);
for (const [title, pick] of [['Fichiers autorisés du lot 5d', true], ['Autres (non modifiés : Idées)', false]]) {
  console.log(`**${title}**\n\n| Rang | Site (fonction, fichier:ligne) | Ko par image | Part |\n|---|---|---|---|`);
  ranked.forEach(([site, kb], i) => {
    if (isAllowed(site) === pick) console.log(`| ${i + 1} | ${site} | ${r1(kb)} | ${r1((kb / total) * 100)} % |`);
  });
  console.log('');
}
console.log('| Configuration | Total | collision.js | Poses | Autres | Tas (Ko/image) |\n|---|---|---|---|---|---|');
const after = files[1] ? load(files[1]) : null;
for (const k of keys) {
  const a = groups(before[k]);
  const b = after?.[k] ? groups(after[k]) : null;
  const cell = (n) => (b ? `${r1(a[n])} → ${r1(b[n])} (${pct(b[n], a[n])})` : r1(a[n]));
  console.log(`| ${k.replace(/^[^/]+\//, '')} | ${cell('total')} | ${cell('collision')} | ${cell('poses')} | ${cell('autres')} | ${cell('tas')} |`);
}
if (after) {
  const sum = (res, n) => keys.reduce((s, k) => s + (res[k] ? groups(res[k])[n] : 0), 0);
  console.log(`\nMoyenne : total ${pct(sum(after, 'total'), sum(before, 'total'))}, collision.js ${pct(sum(after, 'collision'), sum(before, 'collision'))}, poses ${pct(sum(after, 'poses'), sum(before, 'poses'))}, autres ${pct(sum(after, 'autres'), sum(before, 'autres'))}`);
}
