#!/usr/bin/env node
// Lot 5o : preuve du correctif des deux onglets dans le navigateur de la CI (Chrome, canal « chrome »), JAMAIS lancée par la CI (répétitions lourdes).
// Rejoue les tests « multi-onglets » de tests/e2e/argent.spec.js (deux onglets, ligne 340 ; trois onglets) N fois chacun et compte les échecs (valeurs).
//   node scripts/tests/preuve-onglets.mjs [--repetitions 100] [--workers 1] [--charge] [--test deux|trois|tous] [--canal chrome|chromium] [--ancien <ref>]
// --charge : 4 workers et 2 boucles de calcul en plus (machine chargée) ; --ancien <ref> : le même banc (configuration et tests de ce lot) sur le code du
// jeu de <ref> (par exemple origin/dev avant le lot), dans une copie `git worktree` jetable (supprimée à la fin), jamais dans l'arbre de travail.
// Sortie : une ligne JSON par test { test, repetitions, reussis, echecs, valeurs } puis un résumé ; code 1 s'il y a un échec.
import { spawnSync, spawn } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const ANSI = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, 'g');
const ROOT = resolve(new URL('../../', import.meta.url).pathname);
const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : fallback;
};
const flag = (name) => args.includes(`--${name}`);
const repetitions = Number(opt('repetitions', '100'));
const charge = flag('charge');
const workers = Number(opt('workers', charge ? '4' : '1'));
const canal = opt('canal', 'chrome');
const which = opt('test', 'tous');
const ancien = opt('ancien', null);
const TITLES = { deux: 'deux pages additionnent leurs gains', trois: 'trois onglets valident en même temps' };
const grep = which === 'tous' ? 'multi-onglets' : TITLES[which];
if (!grep || !Number.isInteger(repetitions) || repetitions < 1 || !Number.isInteger(workers) || workers < 1) {
  console.error('usage : preuve-onglets.mjs [--repetitions N] [--workers N] [--charge] [--test deux|trois|tous] [--canal chrome|chromium] [--ancien <ref>]');
  process.exit(2);
}

// Copie jetable du code de <ref>, avec la configuration et les tests de ce lot (le banc est le même ; seul le jeu change).
let root = ROOT;
let worktree = null;
if (ancien) {
  worktree = mkdtempSync(join(tmpdir(), 'zs-onglets-'));
  const add = spawnSync('git', ['worktree', 'add', '--detach', worktree, ancien], { cwd: ROOT, encoding: 'utf8' });
  if (add.status !== 0) {
    console.error(add.stderr);
    process.exit(2);
  }
  for (const f of ['scripts/tests/onglets.config.mjs', 'tests/e2e/argent.spec.js', 'tests/e2e/helpers.js']) cpSync(join(ROOT, f), join(worktree, f));
  symlinkSync(join(ROOT, 'node_modules'), join(worktree, 'node_modules'));
  root = worktree;
}

const burners = [];
if (charge) for (let k = 0; k < 2; k += 1) burners.push(spawn(process.execPath, ['-e', 'for(;;){}'], { stdio: 'ignore' }));

let code = 0;
try {
  const run = spawnSync('npx', ['playwright', 'test', '-c', 'scripts/tests/onglets.config.mjs', '-g', grep, `--repeat-each=${repetitions}`, `--workers=${workers}`, '--reporter=json'], {
    cwd: root, encoding: 'utf8', maxBuffer: 1 << 28, env: { ...process.env, ONGLETS_CANAL: canal, CI: '' },
  });
  let report;
  try {
    report = JSON.parse(run.stdout);
  } catch {
    console.error(run.stdout.slice(-2000), run.stderr.slice(-2000));
    throw new Error('rapport Playwright illisible');
  }
  const byTitle = new Map();
  const visit = (suite) => {
    for (const spec of suite.specs ?? []) {
      for (const t of spec.tests ?? []) {
        const row = byTitle.get(spec.title) ?? { test: spec.title, repetitions: 0, reussis: 0, echecs: 0, sautes: 0, valeurs: {} };
        for (const r of t.results ?? []) {
          row.repetitions += 1;
          if (r.status === 'passed') row.reussis += 1;
          else if (r.status === 'skipped') row.sautes += 1;
          else {
            row.echecs += 1;
            const text = (r.error?.message ?? r.status).replace(ANSI, '');
            const exp = text.match(/Expected: (.*)/)?.[1]?.trim();
            const rec = text.match(/Received: (.*)/)?.[1]?.trim();
            const key = exp !== undefined ? `attendu ${exp}, reçu ${rec}` : text.split('\n')[0].slice(0, 120);
            row.valeurs[key] = (row.valeurs[key] ?? 0) + 1;
          }
        }
        byTitle.set(spec.title, row);
      }
    }
    for (const child of suite.suites ?? []) visit(child);
  };
  for (const suite of report.suites ?? []) visit(suite);
  const rows = [...byTitle.values()];
  for (const row of rows) console.log(JSON.stringify(row));
  const echecs = rows.reduce((n, r) => n + r.echecs, 0);
  const total = rows.reduce((n, r) => n + r.repetitions, 0);
  console.log(`résumé : ${ancien ? `code de ${ancien}` : 'code de ce lot'}, canal ${canal}, ${workers} worker(s)${charge ? ' sous charge' : ''}, ${total} exécutions, ${echecs} échec(s)`);
  if (echecs > 0 || total === 0) code = 1;
} finally {
  for (const b of burners) b.kill();
  if (worktree) {
    spawnSync('git', ['worktree', 'remove', '--force', worktree], { cwd: ROOT });
    if (existsSync(worktree)) rmSync(worktree, { recursive: true, force: true });
  }
}
process.exit(code);
