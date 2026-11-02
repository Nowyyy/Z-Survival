// Assemble le site publié dans _site/ (lot 4c : publication par versions).
//  - racine = build de main (channel « release ») ;
//  - next/ = build de dev (channel « dev ») ; sans dev : une page « Aucun build de développement pour l'instant » ;
//  - v0.N/ = dossiers de la branche archive, copiés seulement s'ils existent (sinon la version est publiée « indisponible ») ;
//  - versions.json copié à la racine (et dans next/) ; build-info.json à la racine et dans next/ ;
//  - lots/index.html = page de renvoi vers la racine (les aperçus par lot sont retirés : aucun dossier lots/lot-*).
// Pur et déterministe (aucun réseau, aucune horloge : les dates viennent des entrées) ; échoue avec un message clair si la racine n'a pas
// d'index.html, si la version actuelle est introuvable ou si le site dépasse le plafond (900 Mo par défaut, la limite publiée étant 1 Go).
//
// Ligne de commande (arguments ou variables d'environnement) :
//   node scripts/assemble.mjs --main <build de main> [--dev <build de dev>] [--archive <dossier de la branche archive>]
//        [--versions versions.json] [--out _site] [--max-mb 900] [--main-sha <hash>] [--main-date <ISO>] [--dev-sha <hash>] [--dev-date <ISO>]
//   Variables : SITE_MAIN, SITE_DEV, SITE_ARCHIVE, SITE_VERSIONS, SITE_OUT, SITE_MAX_MB, MAIN_SHA, MAIN_DATE, DEV_SHA, DEV_DATE.
//   Sans --main : le build de l'arbre courant (npm run build) sert de racine ; le hash et la date viennent alors de git.
import { execFileSync, spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { labelOf, validateVersions } from './versions/schema.mjs';

export const DEFAULT_MAX_BYTES = 900 * 1024 * 1024;
export class AssembleError extends Error {}

const SHA_RE = /^[0-9a-f]{7,40}$/;

// Date ISO normalisée en UTC (seconde près), ou '' si invalide.
export function utcDate(value) {
  const time = typeof value === 'string' && value ? Date.parse(value) : NaN;
  return Number.isFinite(time) ? new Date(time).toISOString().replace(/\.\d{3}Z$/, 'Z') : '';
}

export function buildInfo({ channel, version, branch, sha, date }) {
  return { channel, version, branch, sha: SHA_RE.test(sha ?? '') ? sha.slice(0, 7) : '', date: utcDate(date) };
}

// Taille totale d'un dossier (octets) et nombre de fichiers.
export function dirStats(dir) {
  let bytes = 0;
  let files = 0;
  const walk = (current) => {
    for (const name of readdirSync(current)) {
      const path = join(current, name);
      const info = statSync(path);
      if (info.isDirectory()) walk(path);
      else {
        bytes += info.size;
        files += 1;
      }
    }
  };
  if (existsSync(dir)) walk(dir);
  return { bytes, files };
}

const escapeText = (text) => String(text).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]);
const escapeHtml = (text) => String(text).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

// Textes des pages produites : data/i18n/fr.json du build de main (clés site.*), sinon textes par défaut.
export function siteTexts(mainDir) {
  const defaults = {
    'site.lots.title': 'Z-Survival · aperçus retirés',
    'site.lots.retired': 'Les aperçus par lot ont été retirés.',
    'site.lots.back': 'Revenir à l\'accueil',
    'site.next.title': 'Z-Survival · build de développement',
    'site.next.none': 'Aucun build de développement pour l\'instant',
    'site.next.back': 'Revenir à l\'accueil',
  };
  try {
    const dict = JSON.parse(readFileSync(join(mainDir, 'data/i18n/fr.json'), 'utf8'));
    return Object.fromEntries(Object.entries(defaults).map(([key, value]) => [key, typeof dict[key] === 'string' && dict[key] ? dict[key] : value]));
  } catch {
    return defaults;
  }
}

// Petite page statique (sans JavaScript) : message et lien de renvoi vers back (pas de rafraîchissement automatique : axe le refuse), styles du site (chemins relatifs).
export function simplePage({ title, message, back, backLabel, cssRoot }) {
  return `<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex">
  <meta name="color-scheme" content="dark">
  <title>${escapeText(title)}</title>
  <link rel="stylesheet" href="${escapeHtml(cssRoot)}css/tokens.css">
  <link rel="stylesheet" href="${escapeHtml(cssRoot)}css/base.css">
  <link rel="stylesheet" href="${escapeHtml(cssRoot)}css/accueil.css">
</head>
<body>
  <main class="screen simple-page">
    <div class="center">
      <h1 class="title">Z-Survival</h1>
      <p class="status">${escapeText(message)}</p>
      <p><a class="button play" href="${escapeHtml(back)}">${escapeText(backLabel)}</a></p>
    </div>
  </main>
</body>
</html>
`;
}

// Assemble le site. Entrées : dossiers (build de main, build de dev facultatif, contenu de la branche archive facultatif), objet versions.json.
// Renvoie un rapport { out, bytes, files, versions: [...], next, published } ; lève AssembleError en cas de problème.
export function assembleSite({ mainDir, devDir = null, archiveDir = null, versions, out = '_site', maxBytes = DEFAULT_MAX_BYTES, main = {}, dev = {} }) {
  if (!mainDir || !existsSync(join(mainDir, 'index.html'))) throw new AssembleError(`La racine n'a pas de index.html (build de main attendu dans ${mainDir ?? '?'})`);
  const check = validateVersions(versions);
  if (!check.ok) throw new AssembleError(`versions.json invalide : ${check.errors.join(' ; ')}`);
  const current = versions.versions.find((v) => v.status === 'actuelle');
  if (!current || current.id !== versions.latest) throw new AssembleError('Version actuelle introuvable dans versions.json');
  if (!existsSync(join(mainDir, current.entry))) throw new AssembleError(`Version actuelle introuvable : ${current.entry} absent du build de main`);
  if (devDir && !existsSync(join(devDir, 'index.html'))) throw new AssembleError(`Le build de dev n'a pas de index.html (${devDir})`);
  const devPath = versions.dev.path;

  rmSync(out, { recursive: true, force: true });
  mkdirSync(out, { recursive: true });
  cpSync(mainDir, out, { recursive: true });
  // Les anciens aperçus ne sont jamais publiés, même si un build en apportait.
  rmSync(join(out, 'lots'), { recursive: true, force: true });
  rmSync(join(out, 'lots.json'), { force: true });
  for (const v of versions.versions) rmSync(join(out, v.id), { recursive: true, force: true });
  rmSync(join(out, devPath), { recursive: true, force: true });

  const texts = siteTexts(mainDir);
  const label = labelOf(versions.latest);
  writeFileSync(join(out, 'build-info.json'), `${JSON.stringify(buildInfo({ channel: 'release', version: label, branch: main.branch ?? 'main', sha: main.sha, date: main.date }), null, 2)}\n`);

  // next/ : build de dev, sinon page d'attente (et un build-info sans hash : l'accueil affiche « Aucun build de développement pour l'instant »).
  const nextDir = join(out, devPath);
  let next;
  if (devDir) {
    cpSync(devDir, nextDir, { recursive: true });
    for (const name of ['lots', 'lots.json', ...versions.versions.map((v) => v.id)]) rmSync(join(nextDir, name), { recursive: true, force: true });
    next = buildInfo({ channel: 'dev', version: label, branch: versions.dev.branch, sha: dev.sha, date: dev.date });
  } else {
    mkdirSync(nextDir, { recursive: true });
    writeFileSync(join(nextDir, 'index.html'), simplePage({ title: texts['site.next.title'], message: texts['site.next.none'], back: '../', backLabel: texts['site.next.back'], cssRoot: '../' }));
    next = { channel: 'dev', version: label, branch: versions.dev.branch, sha: '', date: '' };
  }
  writeFileSync(join(nextDir, 'build-info.json'), `${JSON.stringify(next, null, 2)}\n`);

  // Archives : copiées seulement si elles existent ; sinon la version publiée devient « indisponible ».
  const published = structuredClone(versions);
  const report = [];
  for (const v of published.versions) {
    if (v.status === 'actuelle') {
      report.push({ id: v.id, status: 'actuelle', path: '' });
      continue;
    }
    if (v.status !== 'archive') {
      report.push({ id: v.id, status: v.status, path: null });
      continue;
    }
    const source = archiveDir ? join(archiveDir, v.id) : null;
    if (source && existsSync(join(source, v.entry))) {
      cpSync(source, join(out, v.id), { recursive: true });
      report.push({ id: v.id, status: 'archive', path: `${v.id}/` });
    } else {
      v.status = 'indisponible';
      v.note = v.note || 'Archive non construite : dossier absent de la branche archive.';
      report.push({ id: v.id, status: 'indisponible', path: null, missing: true });
    }
  }
  // versions.json à la racine, et une copie dans next/ : l'accueil lit toujours versions.json dans son propre dossier (une requête de moins avant l'affichage).
  for (const dir of [out, nextDir]) writeFileSync(join(dir, 'versions.json'), `${JSON.stringify(published, null, 2)}\n`);

  mkdirSync(join(out, 'lots'), { recursive: true });
  writeFileSync(join(out, 'lots', 'index.html'), simplePage({ title: texts['site.lots.title'], message: texts['site.lots.retired'], back: '../', backLabel: texts['site.lots.back'], cssRoot: '../' }));

  const stats = dirStats(out);
  if (stats.bytes > maxBytes) throw new AssembleError(`Site trop gros : ${(stats.bytes / 1024 / 1024).toFixed(1)} Mo pour un plafond de ${(maxBytes / 1024 / 1024).toFixed(0)} Mo (limite publiée : 1 Go)`);
  return { out, ...stats, versions: report, next, published };
}

// Lecture des options (arguments, puis variables d'environnement).
export function parseOptions(argv, env = {}) {
  const map = {
    '--main': 'SITE_MAIN', '--dev': 'SITE_DEV', '--archive': 'SITE_ARCHIVE', '--versions': 'SITE_VERSIONS', '--out': 'SITE_OUT', '--max-mb': 'SITE_MAX_MB',
    '--main-sha': 'MAIN_SHA', '--main-date': 'MAIN_DATE', '--dev-sha': 'DEV_SHA', '--dev-date': 'DEV_DATE',
  };
  const options = {};
  for (const [flag, name] of Object.entries(map)) if (env[name]) options[flag.slice(2)] = env[name];
  for (let i = 0; i < argv.length; i += 1) {
    if (!(argv[i] in map)) throw new AssembleError(`Argument inconnu : ${argv[i]}`);
    const value = argv[i + 1];
    if (value === undefined || value.startsWith('--')) throw new AssembleError(`${argv[i]} : valeur manquante`);
    options[argv[i].slice(2)] = value;
    i += 1;
  }
  const maxMb = options['max-mb'] === undefined ? 900 : Number(options['max-mb']);
  if (!Number.isFinite(maxMb) || maxMb <= 0) throw new AssembleError('--max-mb : nombre positif attendu');
  for (const key of ['main-sha', 'dev-sha']) if (options[key] !== undefined && !SHA_RE.test(options[key])) throw new AssembleError(`--${key} : hash invalide`);
  return { ...options, maxBytes: maxMb * 1024 * 1024 };
}

const gitInfo = (dir) => {
  const run = (args) => spawnSync('git', ['-C', dir, ...args], { encoding: 'utf8' });
  const sha = run(['rev-parse', 'HEAD']);
  const date = run(['log', '-1', '--format=%cI', 'HEAD']);
  return sha.status === 0 ? { sha: sha.stdout.trim(), date: date.stdout.trim() } : {};
};

async function main() {
  const options = parseOptions(process.argv.slice(2), process.env);
  let mainDir = options.main;
  let tmp = null;
  if (!mainDir) {
    // Sans --main : build de l'arbre courant, déplacé hors de _site/ (qui sera la sortie).
    execFileSync('node', ['scripts/build.mjs'], { stdio: 'inherit' });
    tmp = mkdtempSync(join(tmpdir(), 'zs-assemble-'));
    mainDir = join(tmp, 'main');
    cpSync('_site', mainDir, { recursive: true });
  }
  const parent = (dir) => resolve(dir, '..');
  const mainMeta = { branch: 'main', sha: options['main-sha'], date: options['main-date'] };
  if (!mainMeta.sha) Object.assign(mainMeta, gitInfo(options.main ? parent(options.main) : '.'));
  const devMeta = { sha: options['dev-sha'], date: options['dev-date'] };
  if (options.dev && !devMeta.sha) Object.assign(devMeta, gitInfo(parent(options.dev)));
  const versions = JSON.parse(readFileSync(options.versions ?? (options.main ? join(parent(options.main), 'versions.json') : 'versions.json'), 'utf8'));
  const started = Date.now();
  try {
    const result = assembleSite({ mainDir, devDir: options.dev ?? null, archiveDir: options.archive ?? null, versions, out: options.out ?? '_site', maxBytes: options.maxBytes, main: mainMeta, dev: devMeta });
    const lines = result.versions.map((v) => `${v.id} ${v.status}${v.path === null ? '' : ` (${v.path || 'racine'})`}`);
    console.log(`Site assemblé : ${result.out}/ — ${result.files} fichiers, ${(result.bytes / 1024 / 1024).toFixed(1)} Mo, ${Date.now() - started} ms`);
    console.log(`  next/ : ${result.next.sha ? `dev ${result.next.sha} (${result.next.date})` : 'aucun build de développement'}`);
    console.log(`  versions : ${lines.join(' · ')}`);
  } finally {
    if (tmp) rmSync(tmp, { recursive: true, force: true });
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  try {
    await main();
  } catch (error) {
    console.error(`Erreur d'assemblage : ${error.message}`);
    process.exit(1);
  }
}
