// Plan -> monde (lot 3b) : lit data/game/maps/<id>/plan.json (pixels du plan) et data/game/maps/params.json, appelle planToWorld (js/core/maps.js)
// et écrit world.json et decor.json de la carte, dans le même dossier. Usage : npm run carte [-- <id>] ; avec --verifie, n'écrit rien et échoue si
// les fichiers versionnés diffèrent de la sortie. Les deux fichiers générés ne s'éditent jamais à la main.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { planToWorld } from '../js/core/maps.js';

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

// Textes de world.json et decor.json d'une carte, d'après ses sources. Renvoie { world, decor, report }.
export function generateMapFiles(id = 'rez-de-chaussee') {
  const plan = JSON.parse(readFileSync(new URL(`${id}/plan.json`, ROOT), 'utf8'));
  const params = JSON.parse(readFileSync(new URL('params.json', ROOT), 'utf8'));
  const out = planToWorld(plan, params);
  if (!out.world) throw new Error(`plan invalide : ${out.report.errors.join(' ; ')}`);
  return { world: `${formatJson(out.world)}\n`, decor: `${formatJson(out.decor)}\n`, report: out.report };
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const args = process.argv.slice(2);
  const check = args.includes('--verifie');
  const id = args.find((a) => !a.startsWith('--')) ?? 'rez-de-chaussee';
  const { world, decor, report } = generateMapFiles(id);
  const files = [['world.json', world], ['decor.json', decor]].map(([name, text]) => [name, text, new URL(`${id}/${name}`, ROOT)]);
  if (check) {
    const stale = files.filter(([, text, url]) => !existsSync(url) || readFileSync(url, 'utf8') !== text).map(([name]) => name);
    if (stale.length > 0) {
      console.error(`Fichiers périmés : ${stale.join(', ')} (lance npm run carte)`);
      process.exit(1);
    }
    console.log('Carte à jour.');
  } else {
    for (const [, text, url] of files) writeFileSync(url, text);
    console.log(`Carte ${id} : world.json et decor.json écrits.`);
  }
  console.log(`Monde ${report.size.width} × ${report.size.height} ; aire intérieure ${report.areas.interior}, libre ${report.areas.free}.`);
  for (const w of report.shifts) console.log(`Fenêtre ${w.id} décalée de ${w.units} unités${w.auto ? ' (automatique)' : ''}.`);
  for (const m of report.merged) console.log(`Fusion : ${m.id}`);
  for (const r of report.retired) console.log(`Retiré : ${r.id} (${r.reason})`);
  for (const v of report.violations) console.log(`PROBLÈME : ${v}`);
  if (!report.valid) process.exit(1);
}
