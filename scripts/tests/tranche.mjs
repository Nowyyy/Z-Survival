// Lot 4e-B — Exécute une tranche du plan de budget.mjs (palier publication ou complet, en CI ou en local).
// Usage : node scripts/tests/tranche.mjs --plan <plan.json> --index <i> [-- <arguments Playwright>]
// Lance les tests de la tranche par --test-list (répartition par test, équilibrée par durée), sans rejeu (retriesComplet),
// puis ses tests @instable avec retriesInstables rejeux. Écrit la durée de la tranche dans le résumé du travail en CI.
import { spawnSync } from 'node:child_process';
import { appendFileSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..', '..');
const argv = process.argv.slice(2);
const sep = argv.indexOf('--');
const args = sep < 0 ? argv : argv.slice(0, sep);
const extra = sep < 0 ? [] : argv.slice(sep + 1);
const val = (n) => {
  const i = args.indexOf(n);
  return i < 0 ? undefined : args[i + 1];
};
const plan = JSON.parse(readFileSync(val('--plan'), 'utf8'));
const budget = JSON.parse(readFileSync(resolve(ROOT, 'tests/budget.json'), 'utf8'));
const index = Number(val('--index'));
const tranche = plan.tranches.find((t) => t.index === index);
if (!tranche) {
  console.error(`Tranche ${index} absente du plan (${plan.tranches.length} tranches).`);
  process.exit(1);
}
const dir = mkdtempSync(join(tmpdir(), 'zs-tranche-'));
const t0 = Date.now();
let code = 0;
for (const [nom, lignes, retries] of [['tests', tranche.lignes, budget.retriesComplet], ['instables', tranche.instables, budget.retriesInstables]]) {
  if (!lignes.length) continue;
  const liste = join(dir, `${nom}.txt`);
  writeFileSync(liste, `${lignes.join('\n')}\n`);
  console.log(`▶ tranche ${index}/${plan.tranches.length} — ${nom} : ${lignes.length} exécutions, ${retries} rejeu(x)`);
  // Un fichier blob par passage (sinon le second écraserait le premier) : PLAYWRIGHT_BLOB_OUTPUT_FILE dans le dossier demandé.
  const blob = process.env.PLAYWRIGHT_BLOB_OUTPUT_DIR ? { PLAYWRIGHT_BLOB_OUTPUT_FILE: join(resolve(ROOT, process.env.PLAYWRIGHT_BLOB_OUTPUT_DIR), `tranche-${index}-${nom}.zip`) } : {};
  const r = spawnSync('npx', ['playwright', 'test', '--test-list', liste, `--retries=${retries}`, ...extra], { cwd: ROOT, stdio: 'inherit', env: { ...process.env, E2E_FULL: '1', ...blob } });
  code ||= r.status ?? 1;
}
const s = Math.round((Date.now() - t0) / 1000);
const ligne = `Tranche ${index}/${plan.tranches.length} (${plan.palier}) : ${s} s réels pour ${tranche.secondesProjetees} s projetés, ${tranche.lignes.length + tranche.instables.length} exécutions${code ? ' — ÉCHEC' : ''}`;
console.log(ligne);
// Durée de la tranche : dans le dossier des rapports blob (téléversé avec eux), sinon dans le dossier temporaire ; jamais dans le dépôt.
const dossierDuree = process.env.PLAYWRIGHT_BLOB_OUTPUT_DIR ? resolve(ROOT, process.env.PLAYWRIGHT_BLOB_OUTPUT_DIR) : dir;
mkdirSync(dossierDuree, { recursive: true });
writeFileSync(join(dossierDuree, 'duree-tranche.json'), `${JSON.stringify({ index, secondes: s, projetees: tranche.secondesProjetees, code })}\n`);
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${ligne}\n`);
process.exit(code ? 1 : 0);
