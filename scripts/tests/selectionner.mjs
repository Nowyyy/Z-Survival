// Lot 4e-B — Sélection des tests à rejouer d'après les fichiers modifiés (table tests/selection.json, fonctions de lib/selection.mjs).
//
// Usage : node scripts/tests/selectionner.mjs [--base <ref>] [--files a,b,c] [--depuis-version] [--publication] [--tout] [--sans-vitest] [--json <fichier>] [--court]
//   --base <ref>        référence de comparaison (défaut : base du lot = merge-base de HEAD avec origin/dev, sinon origin/main)
//   --files <liste>     fichiers modifiés donnés à la main (virgules ou espaces) au lieu de git (avec --base : table de la base lue à ce ref)
//   --depuis-version    la base devient le ref de la version « actuelle » de versions.json lu sur origin/main
//   --publication       applique la règle du complet périodique (tests/dernier-complet.json, completMaxVersions de tests/budget.json)
//   --tout              rejeu total
//   --sans-vitest       sans `vitest list --changed` (lot 4f : tranches de la CI, qui ne lancent que Playwright)
// Sortie : JSON (zones rejouées et sautées avec la raison, mode, fichiers Vitest et Playwright) sur la sortie standard ou dans --json.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { completPeriodique, refDeVersionActuelle, selectionner } from './lib/selection.mjs';

const ROOT = resolve(import.meta.dirname, '..', '..');
const args = process.argv.slice(2);
const has = (n) => args.includes(n);
const val = (n) => {
  const i = args.indexOf(n);
  return i < 0 ? undefined : args[i + 1];
};
const git = (...a) => {
  try {
    return execFileSync('git', a, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).replace(/\s+$/, '');
  } catch {
    return null;
  }
};
const readJson = (p, def = null) => (existsSync(resolve(ROOT, p)) ? JSON.parse(readFileSync(resolve(ROOT, p), 'utf8')) : def);

export function baseDuLot() {
  for (const ref of ['origin/dev', 'origin/main']) {
    const mb = git('merge-base', 'HEAD', ref);
    if (mb) return mb;
  }
  return null;
}

export function calculer(options = {}) {
  const table = readJson('tests/selection.json');
  const budget = readJson('tests/budget.json', {});
  let base = options.base ?? null;
  let forcerTout = options.tout ? 'option --tout' : null;
  let version = null;
  if (options.depuisVersion) {
    const brut = git('show', 'origin/main:versions.json');
    const r = brut ? refDeVersionActuelle(JSON.parse(brut)) : { erreur: 'versions.json introuvable sur origin/main' };
    if (r.erreur) forcerTout ??= `--depuis-version : ${r.erreur}`;
    else if (git('cat-file', '-e', `${r.ref}^{commit}`) === null) forcerTout ??= `--depuis-version : commit ${r.ref.slice(0, 12)} de ${r.id} introuvable (git fetch --tags, ou historique complet en CI)`;
    if (!r.erreur) {
      base = r.ref;
      version = r.id;
    }
  }
  if (options.publication) {
    const versions = JSON.parse(git('show', 'origin/main:versions.json') ?? 'null') ?? readJson('versions.json');
    const raison = completPeriodique(versions, readJson('tests/dernier-complet.json'), budget.completMaxVersions ?? 3);
    if (raison) forcerTout ??= raison;
  }
  base ??= baseDuLot() ?? 'HEAD';
  let fichiers = options.files;
  if (!fichiers) {
    const diff = git('diff', '--name-only', `${base}...HEAD`);
    if (diff === null) forcerTout ??= `différence avec ${base} impossible à calculer`;
    const statut = git('status', '--porcelain', '--untracked-files=all') ?? '';
    fichiers = [...(diff ?? '').split('\n'), ...statut.split('\n').map((l) => l.slice(3).split(' -> ').pop())].map((f) => f.trim().replace(/^"|"$/g, '')).filter(Boolean);
  }
  let vitestChanged = [];
  if (!forcerTout && !options.files && options.vitest !== false) {
    try {
      const out = execFileSync('npx', ['vitest', 'list', '--changed', base, '--filesOnly'], { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 120000 });
      vitestChanged = out.split('\n').map((l) => l.trim()).filter((l) => /^tests\/unit\/.+\.test\.js$/.test(l));
    } catch {
      vitestChanged = [];
    }
  }
  // Lot 5n (T5) : table de la base (merge-base, comme la différence « base...HEAD ») ; sans elle, un changement de la table rejoue tout.
  let tableAvant = null;
  if (fichiers.includes('tests/selection.json')) {
    const ref = options.files ? base : (git('merge-base', base, 'HEAD') ?? base);
    const brut = git('show', `${ref}:tests/selection.json`);
    try {
      tableAvant = brut ? JSON.parse(brut) : null;
    } catch {
      tableAvant = null;
    }
  }
  const short = /^[0-9a-f]{40}$/.test(base) ? base.slice(0, 12) : base;
  const res = selectionner({ fichiers, table, base: short, forcerTout, vitestChanged, tableAvant });
  res.version = version;
  res.vitestChanged = vitestChanged;
  return res;
}

export function resumeTexte(r) {
  const L = [];
  L.push(`Sélection des tests — mode ${r.mode}${r.version ? ` (depuis la version ${r.version})` : ''}, base ${r.base} : ${r.raison}`);
  L.push(`Fichiers modifiés : ${r.fichiers.length} (documentation ${r.documentation.length}, tests ${r.testsModifies.length}, hors zone ${r.inconnus.length}, rejeu total ${r.declencheurs.length})`);
  L.push(`Rejouées (${r.rejouees.length}) : ${r.rejouees.map((z) => `${z.id} [${z.raison}]`).join(' ; ') || 'aucune'}`);
  L.push(`Sautées (${r.sautees.length}) : ${r.sautees.map((z) => z.id).join(', ') || 'aucune'}${r.sautees.length ? ` — ${r.sautees[0].raison}` : ''}`);
  L.push(`Vitest : ${r.vitest.length} fichiers ; Playwright : ${r.e2e.length} fichiers du palier standard, ${r.complet.length} de plus au palier complet, fumée ${r.fumee.length}`);
  return L.join('\n');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const filesArg = val('--files');
  const r = calculer({
    base: val('--base'),
    files: filesArg !== undefined ? filesArg.split(/[\s,]+/).filter(Boolean) : undefined,
    depuisVersion: has('--depuis-version'),
    publication: has('--publication'),
    tout: has('--tout'),
    vitest: has('--sans-vitest') ? false : undefined,
  });
  const json = `${JSON.stringify(r, null, 2)}\n`;
  if (val('--json')) writeFileSync(val('--json'), json);
  if (has('--court') || val('--json')) console.log(resumeTexte(r));
  else process.stdout.write(json);
}
