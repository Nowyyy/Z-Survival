#!/usr/bin/env node
// Lot 5o — Contrôle de publication, en LECTURE SEULE : avant la fusion dev → main (« --avant », par défaut : l'état est-il prêt ?) et après
// (« --apres » : bien publié ?). Node natif, sans dépendance. Lit le dépôt (origin/* tels que récupérés par le dernier `git fetch`, jamais de fetch
// ici), l'API REST de GitHub par `gh api --method GET` et, après publication, le site par `curl` ; chaque commande passe par la liste blanche de
// scripts/publication/acces.mjs. Les décisions sont dans scripts/publication/controles.mjs (fonctions pures, testées sans réseau).
//   npm run publication:controle [-- --avant | --apres] [--json <chemin hors dépôt>] [--sans-build]
// Sortie : tableau « contrôle | résultat | détail », puis le résumé (ATTENTION et NON VÉRIFIABLE en tête). Code 0 sans KO, 1 avec au moins un KO,
// 2 pour une option invalide. Seule écriture : le fichier --json (hors du dépôt) ; l'assemblage du contrôle 11 se fait dans un dossier temporaire.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { autorise, depotGitHub, lireArguments, SITE_PUBLIE } from './acces.mjs';
import * as C from './controles.mjs';

const RACINE = resolve(new URL('../../', import.meta.url).pathname);

// Seule fonction qui lance une commande : refuse tout ce que la liste blanche n'autorise pas.
function executer(cmd, args, { timeout = 120_000 } = {}) {
  const ok = autorise(cmd, args, { racine: RACINE });
  if (!ok.ok) return { erreur: `refusé par la liste blanche : ${ok.raison}` };
  const r = spawnSync(cmd, args, { cwd: RACINE, encoding: 'utf8', timeout, maxBuffer: 1 << 27 });
  if (r.error) return { erreur: r.error.code === 'ENOENT' ? `${cmd} absent` : r.error.message };
  return { code: r.status, stdout: r.stdout ?? '', stderr: r.stderr ?? '' };
}
const lecture = (r, transforme = (s) => s) => {
  if (r.erreur) return { erreur: r.erreur };
  if (r.code !== 0) return { erreur: (r.stderr || r.stdout || `code ${r.code}`).trim().split('\n').slice(-1)[0].slice(0, 160) };
  try {
    return transforme(r.stdout);
  } catch (error) {
    return { erreur: `réponse illisible (${error.name})` };
  }
};
const git = (...args) => lecture(executer('git', args), (s) => s.trimEnd());
const gitOk = (...args) => {
  const r = executer('git', args);
  if (r.erreur) return { erreur: r.erreur };
  return r.code === 0 ? true : r.code === 1 ? false : { erreur: (r.stderr || `code ${r.code}`).trim().slice(0, 160) };
};
const gitFichier = (ref, chemin) => {
  const r = executer('git', ['show', `${ref}:${chemin}`]);
  if (r.erreur) return { erreur: r.erreur };
  if (r.code !== 0) return /does not exist|exists on disk, but not in|bad revision|invalid object/.test(r.stderr) ? null : { erreur: r.stderr.trim().slice(0, 160) };
  return r.stdout;
};
const json = (texte) => (texte === null || texte?.erreur ? texte : (() => {
  try {
    return JSON.parse(texte);
  } catch {
    return { erreur: 'JSON invalide' };
  }
})());
const avecDepot = (owner, repo) => (chemin) => lecture(executer('gh', ['api', '--method', 'GET', `repos/${owner}/${repo}${chemin}`]), JSON.parse);

function references() {
  const distantes = lecture(executer('git', ['ls-remote', '--heads', 'origin']), (s) => Object.fromEntries(s.split('\n').filter(Boolean).map((l) => {
    const [sha, ref] = l.split('\t');
    return [ref.replace('refs/heads/', ''), sha];
  })));
  const locales = lecture(executer('git', ['for-each-ref', '--format=%(refname)\t%(objectname)', 'refs/remotes/origin']), (s) => Object.fromEntries(s.split('\n').filter(Boolean).map((l) => {
    const [ref, sha] = l.split('\t');
    return [ref.replace('refs/remotes/origin/', ''), sha];
  })));
  return { locales: locales.erreur ? {} : locales, distantes };
}

function branchesOrigin() {
  const toutes = git('for-each-ref', '--format=%(refname:short)\t%(objectname)', 'refs/remotes/origin');
  if (toutes.erreur) return toutes;
  return toutes.split('\n').filter(Boolean).map((l) => {
    const [nom, sha] = l.split('\t');
    return { nom: nom.replace(/^origin\//, ''), sha };
  }).filter((b) => b.nom !== 'HEAD' && b.nom !== 'origin');
}

function construireSite(sansBuild) {
  if (sansBuild) return { sansBuild: true };
  const tmp = mkdtempSync(join(tmpdir(), 'zs-controle-'));
  const out = join(tmp, 'site');
  try {
    const r = executer('node', ['scripts/site/local.mjs', '--main', 'origin/dev', '--dev', 'origin/dev', '--archive', 'origin/archive', '--out', out], { timeout: 900_000 });
    if (r.erreur || r.code !== 0) return { erreur: (r.erreur ?? (r.stderr || r.stdout).trim().split('\n').slice(-1)[0]).slice(0, 200) };
    const canal = (f) => (existsSync(f) ? readFileSync(f, 'utf8').match(/<meta name="zs-canal" content="([a-z]*)">/)?.[1] ?? null : null);
    return { racine: readdirSync(out), canalRecette: canal(join(out, 'Recette/jeu.html')), canalDev: canal(join(out, 'dev/jeu.html')) };
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

function lireAdresse(chemin) {
  const r = executer('curl', ['-sS', '-m', '20', '-w', '\n%{http_code}', `${SITE_PUBLIE}${chemin}`], { timeout: 30_000 });
  if (r.erreur) return { erreur: r.erreur };
  if (r.code !== 0) return { erreur: (r.stderr || `curl ${r.code}`).trim().slice(0, 120) };
  const i = r.stdout.lastIndexOf('\n');
  const status = Number(r.stdout.slice(i + 1));
  if (!Number.isInteger(status) || status === 0) return { erreur: 'réponse sans code HTTP' };
  return { status, body: r.stdout.slice(0, i) };
}

function avant(args, api) {
  const devSha = git('rev-parse', 'origin/dev');
  const devVersions = json(gitFichier('origin/dev', 'versions.json'));
  const mainVersions = json(gitFichier('origin/main', 'versions.json'));
  const latest = devVersions?.versions?.find?.((v) => v.id === devVersions.latest);
  const remplacee = mainVersions?.latest;
  const texteNoms = gitFichier('origin/dev', 'noms-versions-et-lots.txt');
  const seedLog = git('log', '-1', '--format=%H', 'origin/dev', '--', 'Docs/seed.md');
  const proprietaire = api('');
  const commitSeed = seedLog.erreur || !seedLog ? { erreur: seedLog.erreur ?? 'aucun commit' } : api(`/commits/${seedLog}`);
  const fichierProprietaires = existsSync(join(RACINE, 'scripts/publication/proprietaires.json')) ? json(readFileSync(join(RACINE, 'scripts/publication/proprietaires.json'), 'utf8')) : [];
  const proprietaires = [...(proprietaire.erreur ? [] : [proprietaire.owner?.login]), ...(Array.isArray(fichierProprietaires) ? fichierProprietaires : [])];
  const runsComplet = api('/actions/runs?status=success&per_page=100');
  const runComplet = runsComplet.erreur ? runsComplet : (runsComplet.workflow_runs ?? []).find((r) => r.name === 'Tests' && /^essai\/complet-/.test(r.head_branch ?? '')) ?? null;
  const present = runComplet && !runComplet.erreur ? gitOk('cat-file', '-e', `${runComplet.head_sha}^{commit}`) : null;
  const identique = runComplet && !runComplet.erreur
    ? present === true ? gitOk('diff', '--quiet', `${runComplet.head_sha}..origin/dev`, '--', '.', ':!Docs', ':!noms-versions-et-lots.txt', ':!versions.json', ':!data/changelog.json') : { erreur: 'hash du palier complet absent en local (git fetch)' }
    : null;
  const branches = branchesOrigin();
  const lots = branches.erreur ? branches : branches.filter((b) => /^lot-/.test(b.nom));
  const lotsNonFusionnes = lots.erreur ? lots : lots.filter((b) => gitOk('merge-base', '--is-ancestor', b.sha, 'origin/dev') === false);
  const diffWorkflows = git('diff', '--name-only', 'origin/main..origin/dev', '--', '.github');
  const runsDev = devSha.erreur ? devSha : api(`/actions/runs?head_sha=${devSha}&per_page=100`);
  return [
    C.fraicheur(references()),
    C.dev({ devSha, bilans: lecture(executer('git', ['ls-tree', '--name-only', 'origin/dev', 'Docs/lots/']), (s) => s.split('\n').filter(Boolean).map((p) => p.replace('Docs/lots/', ''))) }),
    C.ciDev({ devSha, runs: runsDev.erreur ? runsDev : runsDev.workflow_runs }),
    C.mainAncetre({ ancetre: gitOk('merge-base', '--is-ancestor', 'origin/main', 'origin/dev') }),
    C.pullRequests({ prs: api('/pulls?state=open&per_page=100') }),
    C.versions({
      devVersions,
      mainVersions,
      refAncetre: latest?.ref ? gitOk('merge-base', '--is-ancestor', latest.ref, 'origin/dev') : { erreur: 'ref absent' },
      archiveInfo: typeof remplacee === 'string' ? json(gitFichier('origin/archive', `${remplacee}/build-info.json`)) : { erreur: 'version remplacée inconnue' },
    }),
    C.noms({ texte: texteNoms, devVersions }),
    C.evolutions({ devVersions, changelog: json(gitFichier('origin/dev', 'data/changelog.json')), texteNoms }),
    C.seed({ texte: gitFichier('origin/dev', 'Docs/seed.md'), devVersions, dernierCommit: commitSeed.erreur ? commitSeed : { sha: commitSeed.sha, auteur: commitSeed.author?.login, committer: commitSeed.committer?.login }, proprietaires }),
    C.claude({ texte: gitFichier('origin/dev', 'CLAUDE.md') }),
    C.complet({ run: runComplet, identique, dernierComplet: json(gitFichier('origin/dev', 'tests/dernier-complet.json')) }),
    C.site(construireSite(args.sansBuild)),
    C.workflows({ fichiers: diffWorkflows.erreur ? diffWorkflows : diffWorkflows.split('\n').filter(Boolean) }),
    C.branches({ lotsNonFusionnes, essais: branches.erreur ? null : branches.filter((b) => /^essai\//.test(b.nom)).length }),
    C.dependances({ packageJson: gitFichier('origin/dev', 'package.json') }),
  ];
}

function apres(_args, api) {
  const mainSha = git('rev-parse', 'origin/main');
  const mainVersions = json(gitFichier('origin/main', 'versions.json'));
  const archives = Array.isArray(mainVersions?.versions) ? mainVersions.versions.filter((v) => v.status === 'archive').map((v) => v.id) : [];
  const remplacee = archives.at(-1);
  const reponses = {};
  for (const a of C.attentesAdresses(mainVersions?.latest, remplacee)) reponses[a.chemin] = lireAdresse(a.chemin);
  const runs = mainSha.erreur ? mainSha : api(`/actions/runs?head_sha=${mainSha}&per_page=100`);
  const branches = branchesOrigin();
  const fusionnees = (re) => (branches.erreur ? branches : branches.filter((b) => re.test(b.nom) && gitOk('merge-base', '--is-ancestor', b.sha, 'origin/dev') === true).map((b) => b.nom));
  const diff = executer('git', ['diff', '--stat', 'origin/dev', 'origin/main']);
  return [
    C.fraicheur(references()),
    C.mainEgalDev({ resume: diff.erreur ? diff : diff.code === 0 ? diff.stdout : { erreur: diff.stderr.trim().slice(0, 160) } }),
    C.pagesMain({ mainSha, runs: runs.erreur ? runs : runs.workflow_runs }),
    C.adresses({ reponses, latest: mainVersions?.latest, remplacee }),
    C.mainAncetreApres({ ancetre: gitOk('merge-base', '--is-ancestor', 'origin/main', 'origin/dev') }),
    C.dernierComplet({ valeur: json(gitFichier('origin/main', 'tests/dernier-complet.json')) }),
    C.aSupprimer({ essais: branches.erreur ? branches : branches.filter((b) => /^essai\//.test(b.nom)).map((b) => b.nom), lotsFusionnes: fusionnees(/^lot-/) }),
  ];
}

const args = lireArguments(process.argv.slice(2), RACINE);
if (args.erreur) {
  console.error(`publication:controle : ${args.erreur}\nusage : npm run publication:controle [-- --avant | --apres] [--json <chemin hors dépôt>] [--sans-build]`);
  process.exit(2);
}
const depot = depotGitHub(git('remote', 'get-url', 'origin'));
const api = depot ? avecDepot(depot.owner, depot.repo) : () => ({ erreur: 'dépôt GitHub inconnu (origin)' });
const resultats = (args.mode === 'apres' ? apres(args, api) : avant(args, api)).map(({ id, controle, resultat, detail }) => ({ id, controle, resultat, detail }));
console.log(`Contrôle de publication (${args.mode === 'apres' ? 'après' : 'avant'} la fusion dev → main), ${depot ? `${depot.owner}/${depot.repo}` : 'dépôt inconnu'}\n`);
console.log(C.tableau(resultats));
console.log(`\n${C.resume(resultats, args.mode).join('\n')}`);
if (args.json) writeFileSync(resolve(args.json), `${JSON.stringify({ mode: args.mode, resultats, resume: C.resume(resultats, args.mode), code: C.codeSortie(resultats) }, null, 2)}\n`);
process.exit(C.codeSortie(resultats));
