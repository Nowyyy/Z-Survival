// Lot 4f-A — Bilan de durée d'une exécution de tests en CI (tâche « bilan-duree » de .github/workflows/tests.yml, non bloquante).
//
// Usage :
//   node scripts/tests/bilan-duree.mjs --dossier <artefacts duree-*> [--execution <run.json>] [--taches <jobs.json>] [--json <sortie>]
//       PALIER et PROJECTION (sortie « projection » de planifier, JSON) dans l'environnement.
//       run.json : `gh api repos/<dépôt>/actions/runs/<id>` (created_at = déclenchement) ; jobs.json : `…/runs/<id>/jobs` (fins réelles, attente en file).
//   node scripts/tests/bilan-duree.mjs --unitaires <fichier>   (tâche « unitaires » : DEBUT_TACHE, FIN_NPM_CI, FIN_LINT, FIN_VITEST, CODE en ms)
// Écrit le bilan (lib/duree.mjs) dans le résumé du travail et sur la sortie standard, avec « OBJECTIF TENU » ou « OBJECTIF NON TENU (x s pour y s) ».
// Objectif : completCibleSecondes (publication, complet) ou standardMaxSecondes (standard) de tests/budget.json.
import { appendFileSync, existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { bilanDuree, bilanTexte } from './lib/duree.mjs';

const ROOT = resolve(import.meta.dirname, '..', '..');
const args = process.argv.slice(2);
const val = (n) => {
  const i = args.indexOf(n);
  return i < 0 ? undefined : args[i + 1];
};
const num = (n) => (process.env[n] && Number.isFinite(Number(process.env[n])) ? Number(process.env[n]) : null);
const lire = (p) => {
  try {
    return JSON.parse(readFileSync(p, 'utf8'));
  } catch {
    return null;
  }
};

if (val('--unitaires')) {
  const d = { debutTache: num('DEBUT_TACHE'), finNpmCi: num('FIN_NPM_CI'), finLint: num('FIN_LINT'), finVitest: num('FIN_VITEST'), code: num('CODE') };
  writeFileSync(val('--unitaires'), `${JSON.stringify(d)}\n`);
  console.log(`Unitaires : ${JSON.stringify(d)}`);
  process.exit(0);
}

const fichiers = (dir) => (existsSync(dir) ? readdirSync(dir).flatMap((n) => {
  const p = join(dir, n);
  return statSync(p).isDirectory() ? fichiers(p) : [p];
}) : []);
const dossier = val('--dossier') ?? 'durees';
const tous = fichiers(dossier).filter((p) => /duree-.*\.json$/.test(p));
const tranches = tous.filter((p) => /duree-tranche-/.test(p)).map(lire).filter(Boolean);
const unitaires = tous.filter((p) => /duree-unitaires/.test(p)).map(lire).find(Boolean) ?? null;
const budget = JSON.parse(readFileSync(resolve(ROOT, 'tests/budget.json'), 'utf8'));
const palier = process.env.PALIER || tranches[0]?.palier || 'standard';
const projection = (() => {
  try {
    return process.env.PROJECTION ? JSON.parse(process.env.PROJECTION) : null;
  } catch {
    return null;
  }
})();
const execution = val('--execution') ? lire(val('--execution')) : null;
const taches = val('--taches') ? lire(val('--taches'))?.jobs ?? [] : [];
const mesurees = taches.filter((j) => /^(unitaires|tranches)\b/.test(j.name) && j.completed_at);
const t = (x) => (x ? Date.parse(x) : NaN);
const fin = mesurees.length ? Math.max(...mesurees.map((j) => t(j.completed_at))) : undefined;
const declenchement = execution?.created_at ? t(execution.created_at) : undefined;
const objectifSecondes = palier === 'standard' ? budget.standardMaxSecondes : budget.completCibleSecondes;
const b = bilanDuree({ tranches, unitaires, projection, declenchement, fin, objectifSecondes, palier });
let txt = bilanTexte(b);
const attentes = taches.filter((j) => j.started_at && j.created_at && j.name !== 'bilan-duree').map((j) => ({ nom: j.name, s: Math.round((t(j.started_at) - t(j.created_at)) / 1000) }));
if (attentes.length) {
  const m = attentes.sort((x, y) => y.s - x.s)[0];
  txt += `\n\nAttente en file la plus longue (création → début d'une tâche) : ${m.s} s (${m.nom}) ; ${taches.length} tâches dans l'exécution.`;
}
if (palier === 'standard') txt += `\nCible du standard : ${budget.standardCibleSecondes} s ; maximum : ${budget.standardMaxSecondes} s.`;
if (!execution) txt += '\n(Déclenchement inconnu : durée comptée depuis le début de la première tâche mesurée.)';
console.log(txt);
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${txt}\n`);
if (val('--json')) writeFileSync(val('--json'), `${JSON.stringify({ ...b, attentes }, null, 1)}\n`);
