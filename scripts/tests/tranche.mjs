// Lot 4e-B — Exécute une tranche du plan de budget.mjs (paliers standard, publication ou complet, en CI ou en local).
// Usage : node scripts/tests/tranche.mjs --plan <plan.json> --index <i> [--empreinte <attendue>] [--duree <dossier>] [-- <arguments Playwright>]
// Lance les tests de la tranche par --test-list (répartition par test, équilibrée par durée), puis ses tests @instable avec retriesInstables rejeux.
// Rejeux : retriesComplet aux paliers publication et complet ; au palier standard, ceux de playwright.config.js (1 en CI), comme avant le lot 4f.
// Lot 4f-A : --empreinte vérifie que le plan recalculé est celui de la tâche « planifier » ; la tranche écrit ses horodatages
// (début de la tâche, fin de npm ci, fin du navigateur : variables DEBUT_TACHE, FIN_NPM_CI, FIN_NAVIGATEUR en millisecondes ;
// début et fin des tests), le nombre de tests, les workers réellement utilisés, réussis, échoués, instables et ignorés
// dans <dossier>/duree-tranche-<palier>-<i>.json (lu par bilan-duree.mjs) et dans le résumé du travail.
import { spawnSync } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { playwrightTests } from './lib/rapports.mjs';

const ROOT = resolve(import.meta.dirname, '..', '..');
const argv = process.argv.slice(2);
const sep = argv.indexOf('--');
const args = sep < 0 ? argv : argv.slice(0, sep);
const extraBrut = sep < 0 ? [] : argv.slice(sep + 1);
const val = (n) => {
  const i = args.indexOf(n);
  return i < 0 ? undefined : args[i + 1];
};
const plan = JSON.parse(readFileSync(val('--plan'), 'utf8'));
const budget = JSON.parse(readFileSync(resolve(ROOT, 'tests/budget.json'), 'utf8'));
const index = Number(val('--index'));
const tranche = plan.tranches.find((t) => t.index === index);
if (val('--empreinte') && val('--empreinte') !== plan.empreinte) {
  console.error(`Plan recalculé différent de celui de « planifier » (empreinte ${plan.empreinte} au lieu de ${val('--empreinte')}) : la répartition ne serait plus exacte.`);
  process.exit(1);
}
if (!tranche) {
  console.error(`Tranche ${index} absente du plan (${plan.tranches.length} tranches).`);
  process.exit(1);
}
// Rapport JSON ajouté aux rapporteurs demandés (décompte des tests et workers réellement utilisés).
const avecJson = (extra) => {
  const i = extra.findIndex((a) => a.startsWith('--reporter='));
  if (i < 0) return [...extra, '--reporter=dot,json'];
  const r = extra[i].slice('--reporter='.length).split(',');
  return r.includes('json') ? extra : extra.map((a, j) => (j === i ? `--reporter=${[...r, 'json'].join(',')}` : a));
};
const extra = avecJson(extraBrut);
const dir = mkdtempSync(join(tmpdir(), 'zs-tranche-'));
const standard = plan.palier === 'standard';
const debutTests = Date.now();
let code = 0;
const rapports = [];
for (const [nom, lignes, retries] of [['tests', tranche.lignes, standard ? null : budget.retriesComplet], ['instables', tranche.instables, budget.retriesInstables]]) {
  if (!lignes.length) continue;
  const liste = join(dir, `${nom}.txt`);
  writeFileSync(liste, `${lignes.join('\n')}\n`);
  console.log(`▶ tranche ${index}/${plan.tranches.length} (${plan.palier}) — ${nom} : ${lignes.length} exécutions, ${retries === null ? 'rejeux de la configuration' : `${retries} rejeu(x)`}`);
  // Un fichier blob par passage (sinon le second écraserait le premier) : PLAYWRIGHT_BLOB_OUTPUT_FILE dans le dossier demandé.
  const blob = process.env.PLAYWRIGHT_BLOB_OUTPUT_DIR ? { PLAYWRIGHT_BLOB_OUTPUT_FILE: join(resolve(ROOT, process.env.PLAYWRIGHT_BLOB_OUTPUT_DIR), `tranche-${index}-${nom}.zip`) } : {};
  const json = join(dir, `rapport-${nom}.json`);
  const r = spawnSync('npx', ['playwright', 'test', '--test-list', liste, ...(retries === null ? [] : [`--retries=${retries}`]), ...extra], {
    cwd: ROOT, stdio: 'inherit', env: { ...process.env, E2E_FULL: '1', PLAYWRIGHT_JSON_OUTPUT_FILE: json, ...blob },
  });
  code ||= r.status ?? 1;
  if (existsSync(json)) rapports.push(JSON.parse(readFileSync(json, 'utf8')));
}
const finTests = Date.now();
const somme = (k) => rapports.reduce((x, r) => x + (r.stats?.[k] ?? 0), 0);
const num = (n) => (process.env[n] && Number.isFinite(Number(process.env[n])) ? Number(process.env[n]) : null);
const duree = {
  palier: plan.palier,
  index,
  tranches: plan.tranches.length,
  debutTache: num('DEBUT_TACHE'),
  finNpmCi: num('FIN_NPM_CI'),
  finNavigateur: num('FIN_NAVIGATEUR'),
  debutTests,
  finTests,
  tests: tranche.lignes.length + tranche.instables.length,
  workers: rapports.length ? Math.max(...rapports.map((r) => r.config?.metadata?.actualWorkers ?? r.config?.workers ?? 0)) : null,
  reussis: somme('expected'),
  echoues: somme('unexpected'),
  instables: somme('flaky'),
  ignores: somme('skipped'),
  sommeTestsMs: rapports.flatMap((r) => playwrightTests(r)).reduce((x, t) => x + t.ms, 0),
  projeteesSecondes: tranche.secondesProjetees,
  code,
};
const s = Math.round((finTests - debutTests) / 1000);
const par = s > 0 ? (duree.sommeTestsMs / 1000 / s).toFixed(2) : '—';
const inst = duree.debutTache ? `, installation ${Math.round((debutTests - duree.debutTache) / 1000)} s` : '';
const ligne = `Tranche ${index}/${plan.tranches.length} (${plan.palier}) : tests ${s} s réels pour ${tranche.secondesProjetees} s projetés${inst}, ${duree.tests} exécutions (réussies ${duree.reussis}, échouées ${duree.echoues}, instables ${duree.instables}, ignorées ${duree.ignores}), workers ${duree.workers ?? '—'}, parallélisme réel ${par}${code ? ' — ÉCHEC' : ''}`;
console.log(ligne);
// Durée de la tranche : dans --duree (artefact téléversé par la CI), sinon dans le dossier temporaire ; jamais dans le dépôt.
const dossierDuree = val('--duree') ? resolve(ROOT, val('--duree')) : dir;
mkdirSync(dossierDuree, { recursive: true });
const fichier = join(dossierDuree, `duree-tranche-${plan.palier}-${index}.json`);
writeFileSync(fichier, `${JSON.stringify(duree, null, 1)}\n`);
console.log(`Horodatages : ${fichier}`);
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${ligne}\n\n\`\`\`json\n${JSON.stringify(duree)}\n\`\`\`\n`);
process.exit(code ? 1 : 0);
