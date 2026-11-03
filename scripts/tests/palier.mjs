// Lot 4e-B — Lance un palier de tests : avant-commit, standard, publication, complet, fumee, selection.
//
// Usage : node scripts/tests/palier.mjs <palier> [--base <ref>] [--files a,b] [--tout] [--a-blanc] [--json <durées.json>] [-- <arguments Playwright>]
//   avant-commit : lint + Vitest des zones touchées + garde-fous unitaires rapides (aucun Playwright)
//   standard     : lint + Vitest (tous si leur durée mesurée < vitestToutSousSecondes, sinon les concernés) + fumée + Playwright des zones touchées
//   publication  : comme standard, mais depuis la version publiée (--depuis-version), Playwright des zones sélectionnées aux paliers standard
//                  et complet ; complet périodique (tests/dernier-complet.json) ; liste « rejouées / sautées » en tête
//   complet      : lint + tout Vitest + tout Playwright (E2E_FULL=1), @instable rejoués à part (retriesInstables)
//   fumee        : 10 à 20 tests Playwright du démarrage (tests/e2e/fumee.spec.js), projet bureau
//   selection    : affiche la sélection
// Les tests étiquetés @instable ou @lent ne tournent qu'au palier complet. Vitest et Playwright tournent l'un après l'autre.
import { spawnSync } from 'node:child_process';
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { calculer, resumeTexte } from './selectionner.mjs';

const ROOT = resolve(import.meta.dirname, '..', '..');
const argv = process.argv.slice(2);
const sep = argv.indexOf('--');
const args = sep < 0 ? argv : argv.slice(0, sep);
const pwExtra = sep < 0 ? [] : argv.slice(sep + 1);
const palier = args[0];
const val = (n) => {
  const i = args.indexOf(n);
  return i < 0 ? undefined : args[i + 1];
};
const has = (n) => args.includes(n);
const readJson = (p) => JSON.parse(readFileSync(resolve(ROOT, p), 'utf8'));
const budget = readJson('tests/budget.json');
const mesure = readJson('tests/budget-mesure.json');
const table = readJson('tests/selection.json');
const EXCLUS = '@instable|@lent';
const aBlanc = has('--a-blanc');
const etapes = [];

function lancer(nom, cmd, cmdArgs, env = {}) {
  const t0 = Date.now();
  console.log(`\n▶ ${nom} : ${cmd} ${cmdArgs.join(' ')}`);
  let code = 0;
  if (!aBlanc) code = spawnSync(cmd, cmdArgs, { cwd: ROOT, stdio: 'inherit', env: { ...process.env, ...env } }).status ?? 1;
  etapes.push({ nom, secondes: Math.round((Date.now() - t0) / 100) / 10, code });
  return code;
}

const lint = () => lancer('lint', 'npx', ['eslint', '.', '--max-warnings=0']);
const vitest = (fichiers) => (fichiers === null ? lancer('vitest (tout)', 'npx', ['vitest', 'run']) : fichiers.length ? lancer(`vitest (${fichiers.length} fichiers)`, 'npx', ['vitest', 'run', ...fichiers]) : 0);
const playwright = (nom, fichiers, extra = []) => (fichiers === null || fichiers.length
  ? lancer(nom, 'npx', ['playwright', 'test', ...extra, ...pwExtra, ...(fichiers ?? [])], { E2E_FULL: '1' })
  : 0);
const vitestTout = () => (mesure.vitest?.reelSecondes ?? Infinity) < budget.vitestToutSousSecondes;
const gardesUnitairesRapides = () => {
  const ms = new Map((mesure.vitest?.fichiers ?? []).map((f) => [f.fichier, f.ms]));
  return [...new Set(table['garde-fous'].map((g) => g.fichier).filter((f) => f.startsWith('tests/unit/') && (ms.get(f) ?? Infinity) <= 1500))];
};

// Documentation seule (au moins un fichier, tous de documentation) : rien à rejouer.
const docSeule = (s) => s.mode === 'zones' && s.fichiers.length > 0 && s.fichiers.length === s.documentation.length;

function selection(options) {
  const s = calculer({ base: val('--base'), files: val('--files')?.split(/[\s,]+/).filter(Boolean), tout: has('--tout'), ...options });
  const texte = resumeTexte(s);
  console.log(texte);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `### Tests : ${palier}\n\n\`\`\`\n${texte}\n\`\`\`\n\n`);
  return s;
}

let code = 0;
const t0 = Date.now();
if (palier === 'selection') {
  const s = selection({ depuisVersion: has('--depuis-version'), publication: has('--publication') });
  if (has('--json-complet')) console.log(JSON.stringify(s, null, 2));
} else if (palier === 'avant-commit') {
  const s = selection({});
  code ||= lint();
  // Documentation seule : rien à rejouer (lint seulement).
  if (!docSeule(s)) code ||= vitest([...new Set([...s.vitest, ...gardesUnitairesRapides()])].sort());
} else if (palier === 'standard' || palier === 'publication') {
  const pub = palier === 'publication';
  const s = selection(pub ? { depuisVersion: true, publication: true } : {});
  code ||= lint();
  const doc = docSeule(s);
  if (!doc) code ||= vitest(vitestTout() || s.mode === 'tout' ? null : s.vitest);
  if (!doc) {
    const e2e = s.mode === 'tout' ? (pub ? null : [...new Set([...table.fumee, ...table.zones.flatMap((z) => z.e2e)])]) : [...new Set([...s.fumee, ...s.e2e, ...(pub ? s.complet : [])])];
    code ||= playwright(`playwright (${e2e === null ? 'tout' : `${e2e.length} fichiers`})`, e2e, ['--grep-invert', EXCLUS]);
  }
} else if (palier === 'complet') {
  code ||= lint();
  code ||= vitest(null);
  const a = playwright('playwright (tout, hors @instable)', null, ['--grep-invert', '@instable', `--retries=${budget.retriesComplet}`]);
  const b = playwright('playwright (@instable)', null, ['--grep', '@instable', `--retries=${budget.retriesInstables}`, '--pass-with-no-tests']);
  code ||= a || b;
} else if (palier === 'fumee') {
  code ||= playwright('fumée', table.fumee, ['--project=bureau']);
} else {
  console.error('Palier inconnu. Paliers : avant-commit, standard, publication, complet, fumee, selection.');
  process.exit(2);
}
const total = Math.round((Date.now() - t0) / 1000);
const objectif = { 'avant-commit': budget.avantCommitSecondes, standard: budget.standardSecondes, fumee: 180 }[palier];
if (etapes.length) {
  console.log(`\nPalier ${palier} : ${total} s${objectif ? ` (objectif ${objectif} s)` : ''} — ${etapes.map((e) => `${e.nom} ${e.secondes} s${e.code ? ' ÉCHEC' : ''}`).join(' ; ')}`);
}
if (val('--json')) writeFileSync(val('--json'), `${JSON.stringify({ palier, secondes: total, objectif, etapes, code }, null, 2)}\n`);
process.exit(code ? 1 : 0);
