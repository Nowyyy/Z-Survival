// Plan -> monde (lot 3b) : lit data/game/maps/<id>/plan.json (pixels du plan) et data/game/maps/params.json, appelle planToWorld (js/core/maps.js)
// et écrit world.json et decor.json de la carte, dans le même dossier. Usage : npm run carte [-- <id>] ; avec --verifie, n'écrit rien et échoue si
// les fichiers versionnés diffèrent de la sortie. Les deux fichiers générés ne s'éditent jamais à la main.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { floorProblems } from '../js/core/floor-rules.js';
import { planToWorld } from '../js/core/maps.js';
import { parseZones, zonesToWorld } from '../js/core/zones.js';

const ROOT = new URL('../data/game/maps/', import.meta.url);
const isPrimitive = (v) => v === null || typeof v !== 'object';

// JSON lisible : un objet qui ne contient que des valeurs simples, et un tableau de nombres, tiennent sur une seule ligne.
export function formatJson(value, indent = '') {
  const next = `${indent}  `;
  if (isPrimitive(value)) return JSON.stringify(value);
  if (Array.isArray(value)) {
    if (value.length === 0) return '[]';
    const simple = value.every((v) => isPrimitive(v) || (Array.isArray(v) && v.every(isPrimitive)));
    const flat = simple ? `[${value.map((v) => formatJson(v, next)).join(', ')}]` : '';
    if (simple && flat.length + indent.length <= 140) return flat;
    return `[\n${value.map((v) => `${next}${formatJson(v, next)}`).join(',\n')}\n${indent}]`;
  }
  const entries = Object.entries(value);
  if (entries.length === 0) return '{}';
  if (entries.every(([, v]) => isPrimitive(v) || (Array.isArray(v) && v.every(isPrimitive)))) {
    const flat = `{ ${entries.map(([k, v]) => `${JSON.stringify(k)}: ${formatJson(v, next)}`).join(', ')} }`;
    if (flat.length + indent.length <= 140) return flat;
  }
  return `{\n${entries.map(([k, v]) => `${next}${JSON.stringify(k)}: ${formatJson(v, next)}`).join(',\n')}\n${indent}}`;
}

// Textes de world.json et decor.json d'une carte, d'après ses sources. Lot 3e : si la carte a un étage (etage.json), son monde etage.world.json est aussi généré
// (même conversion, mêmes règles, même origine ; ses points d'apparition sont dans la clé spawnPoints, sans décor) et les règles de l'étage (js/core/floor-rules.js)
// sont vérifiées. Renvoie { world, decor, etage (texte ou null), report, etageReport, problems }.
export function generateMapFiles(id = 'rez-de-chaussee') {
  const plan = JSON.parse(readFileSync(new URL(`${id}/plan.json`, ROOT), 'utf8'));
  const params = JSON.parse(readFileSync(new URL('params.json', ROOT), 'utf8'));
  const zones = parseZones(JSON.parse(readFileSync(new URL(`${id}/zones.json`, ROOT), 'utf8')));
  const out = planToWorld(plan, params, { doors: zones.doors.filter((d) => !d.planned) });
  if (!out.world) throw new Error(`plan invalide : ${out.report.errors.join(' ; ')}`);
  const result = { world: `${formatJson(out.world)}\n`, decor: `${formatJson(out.decor)}\n`, etage: null, report: out.report, etageReport: null, problems: [] };
  const etageUrl = new URL(`${id}/etage.json`, ROOT);
  if (existsSync(etageUrl)) {
    const etagePlan = JSON.parse(readFileSync(etageUrl, 'utf8'));
    // Les portes de l'étage (ouvertures de etage.json) servent à tenir les pièces à 100 de leur ouverture.
    const doors = zones.doors.flatMap((d) => d.blocks.filter((b) => b.floor === 'etage' && b.opening).map((b, i) => ({ id: `${d.id}-etage-${i + 1}`, opening: b.opening })));
    const up = planToWorld(etagePlan, params, { doors });
    if (!up.world) throw new Error(`etage.json invalide : ${up.report.errors.join(' ; ')}`);
    const etageWorld = { ...up.world, _provisoire: 'Étage généré par npm run carte (scripts/plan-vers-monde.mjs) d\'après etage.json : ne jamais éditer à la main, changer etage.json puis relancer la commande. Même repère et mêmes unités que world.json (rez-de-chaussée) ; pas de décor, aucun obstacle à l\'extérieur ; spawnPoints : 2 par fenêtre, à 450 et 650 du mur. Valeurs provisoires.', spawnPoints: up.decor.spawnPoints.map((p) => ({ ...p })) };
    result.etage = `${formatJson(etageWorld)}\n`;
    result.etageReport = up.report;
    const world = out.world;
    result.problems = floorProblems({ rdc: world, etage: etageWorld, zones: zonesToWorld(zones, world.transform), params, plan: { rdc: plan, etage: etagePlan } });
    if (!up.report.valid) result.problems.push(...up.report.violations.map((v) => `étage : ${v}`));
  }
  return result;
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const args = process.argv.slice(2);
  const check = args.includes('--verifie');
  const id = args.find((a) => !a.startsWith('--')) ?? 'rez-de-chaussee';
  const { world, decor, etage, report, etageReport, problems } = generateMapFiles(id);
  const files = [['world.json', world], ['decor.json', decor], ...(etage === null ? [] : [['etage.world.json', etage]])].map(([name, text]) => [name, text, new URL(`${id}/${name}`, ROOT)]);
  if (check) {
    const stale = files.filter(([, text, url]) => !existsSync(url) || readFileSync(url, 'utf8') !== text).map(([name]) => name);
    if (stale.length > 0) {
      console.error(`Fichiers périmés : ${stale.join(', ')} (lance npm run carte)`);
      process.exit(1);
    }
    console.log('Carte à jour.');
  } else {
    for (const [, text, url] of files) writeFileSync(url, text);
    console.log(`Carte ${id} : ${files.map(([name]) => name).join(', ')} écrits.`);
  }
  console.log(`Monde ${report.size.width} × ${report.size.height} ; aire intérieure ${report.areas.interior}, libre ${report.areas.free}.`);
  for (const w of report.shifts) console.log(`Fenêtre ${w.id} décalée de ${w.units} unités${w.auto ? ' (automatique)' : ''}.`);
  for (const m of report.merged) console.log(`Fusion : ${m.id}`);
  for (const r of report.retired) console.log(`Retiré : ${r.id} (${r.reason})`);
  for (const v of report.violations) console.log(`PROBLÈME : ${v}`);
  if (etageReport) {
    for (const w of etageReport.shifts) console.log(`Étage : fenêtre ${w.id} décalée de ${w.units} unités${w.auto ? ' (automatique)' : ''}.`);
    for (const r of etageReport.retired) console.log(`Étage : retiré ${r.id} (${r.reason})`);
  }
  for (const v of problems) console.log(`PROBLÈME (étage) : ${v}`);
  if (!report.valid || problems.length > 0) process.exit(1);
}
