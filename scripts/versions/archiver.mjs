// Archiveur des versions (lot 4c), Node natif, sans dépendance.
// node scripts/versions/archiver.mjs --id v0.N --ref <hash> [--replace] [--dry-run] [--no-push]
// node scripts/versions/archiver.mjs --all [--dry-run] [--no-push]          (toutes les versions « archive » de versions.json, à leur ref gelée)
// Pour chaque version : (a) extraction de la source du commit dans un dossier temporaire (git archive, jamais dans l'arbre de travail) ;
// (b) npm ci puis le script build de CETTE version (son package.json) ; (c) copie de sa sortie (_site/) dans <temporaire>/v0.N/ ;
// (d) build-info.json (channel « archive ») ; (e) contrôle des liens non relatifs (rapportés) ; (f) commit sur la branche orpheline « archive »
// par un index temporaire (aucun fichier de workflow, jamais de --force ; une version déjà présente et différente n'est remplacée qu'avec --replace,
// par un nouveau commit) ; (g) push de « archive » seulement (avance rapide). Idempotent : une version identique ne crée aucun commit.
// --dry-run : construit et vérifie dans un dossier temporaire, sans commit ni push.
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { ID_RE, REF_RE, isValidBranch, labelOf, validateVersions } from './schema.mjs';
import { scanDir } from './links.mjs';

export const ARCHIVE_BRANCH = 'archive';
export const BUILD_OUT = '_site';
const MAX_FILE_BYTES = 50 * 1024 * 1024;
const BUFFER = 2 * 1024 * 1024 * 1024;

export class ArchiveError extends Error {}

const run = (cmd, args, options = {}) => {
  const result = spawnSync(cmd, args, { encoding: 'utf8', maxBuffer: BUFFER, ...options });
  if (result.error) throw new ArchiveError(`${cmd} ${args[0] ?? ''} : ${result.error.message}`);
  if (result.status !== 0) throw new ArchiveError(`${cmd} ${args.join(' ')} a échoué (${result.status}) : ${String(result.stderr || result.stdout || '').trim().split('\n').slice(-3).join(' | ')}`);
  return typeof result.stdout === 'string' ? result.stdout.trim() : result.stdout;
};
const git = (repo, args, options = {}) => run('git', ['-C', repo, ...args], options);
const configValue = (repo, key, fallback) => spawnSync('git', ['-C', repo, 'config', key], { encoding: 'utf8' }).stdout?.trim() || fallback;
const gitOk = (repo, args) => spawnSync('git', ['-C', repo, ...args], { stdio: 'ignore' }).status === 0;

// Lecture et contrôle des arguments de la ligne de commande.
export function parseArgs(argv) {
  const options = { all: false, dryRun: false, replace: false, push: true, id: null, ref: null, versions: 'versions.json', remote: 'origin', branch: ARCHIVE_BRANCH, keep: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--all') options.all = true;
    else if (arg === '--dry-run') options.dryRun = true;
    else if (arg === '--replace') options.replace = true;
    else if (arg === '--no-push') options.push = false;
    else if (arg === '--keep') options.keep = true;
    else if (['--id', '--ref', '--versions', '--remote', '--branch'].includes(arg)) {
      const value = argv[i + 1];
      if (value === undefined || value.startsWith('--')) throw new ArchiveError(`${arg} : valeur manquante`);
      options[arg.slice(2)] = value;
      i += 1;
    } else throw new ArchiveError(`Argument inconnu : ${arg}`);
  }
  if (options.all && (options.id || options.ref)) throw new ArchiveError('--all exclut --id et --ref');
  if (!options.all && !options.id) throw new ArchiveError('--id v0.N (avec --ref <hash>) ou --all attendu');
  if (options.id && !ID_RE.test(options.id)) throw new ArchiveError(`Identifiant invalide : ${options.id} (attendu v0.N)`);
  if (options.ref && !REF_RE.test(options.ref)) throw new ArchiveError(`Hash invalide : ${options.ref} (hash complet de 40 caractères attendu)`);
  if (!isValidBranch(options.branch)) throw new ArchiveError(`Branche invalide : ${options.branch}`);
  if (!/^[A-Za-z0-9._-]+$/.test(options.remote)) throw new ArchiveError(`Remote invalide : ${options.remote}`);
  if (options.dryRun) options.push = false;
  return options;
}

// Extraction de la source d'un commit (git archive | tar), jamais dans l'arbre de travail.
export function extractSource(repo, ref, dest) {
  if (!REF_RE.test(ref)) throw new ArchiveError(`Hash invalide : ${ref}`);
  if (!gitOk(repo, ['cat-file', '-e', `${ref}^{commit}`])) throw new ArchiveError(`Commit introuvable : ${ref}`);
  mkdirSync(dest, { recursive: true });
  const tar = spawnSync('git', ['-C', repo, 'archive', '--format=tar', ref], { maxBuffer: BUFFER });
  if (tar.status !== 0) throw new ArchiveError(`git archive ${ref} : ${String(tar.stderr).trim()}`);
  run('tar', ['-x', '-C', dest], { input: tar.stdout, encoding: 'buffer' });
}

// Script build propre à la version (son package.json) : obligatoire.
export function readBuildScript(srcDir) {
  const file = join(srcDir, 'package.json');
  if (!existsSync(file)) throw new ArchiveError('package.json absent');
  let pkg;
  try {
    pkg = JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    throw new ArchiveError('package.json illisible');
  }
  const build = pkg?.scripts?.build;
  if (typeof build !== 'string' || build.trim() === '') throw new ArchiveError('aucun script build dans package.json');
  return build;
}

// npm ci (si un verrou existe, sinon npm install sans écrire le verrou) puis npm run build ; sortie attendue dans _site/.
export function buildSource(srcDir, { install = true, log = () => {} } = {}) {
  const script = readBuildScript(srcDir);
  const started = Date.now();
  if (install) {
    const lock = existsSync(join(srcDir, 'package-lock.json'));
    run('npm', lock ? ['ci', '--no-audit', '--no-fund', '--ignore-scripts'] : ['install', '--no-audit', '--no-fund', '--ignore-scripts', '--no-package-lock'], { cwd: srcDir });
  }
  const installMs = Date.now() - started;
  log(`build : ${script}`);
  run('npm', ['run', 'build', '--silent'], { cwd: srcDir });
  const out = join(srcDir, BUILD_OUT);
  if (!existsSync(out)) throw new ArchiveError(`le build ne produit pas ${BUILD_OUT}/`);
  return { out, script, installMs, buildMs: Date.now() - started - installMs };
}

export function buildInfo({ label, branch, ref, date }) {
  return { channel: 'archive', version: label, branch, sha: ref.slice(0, 7), ref, date };
}

// Arbre d'un dossier (hash) dans un commit, ou null.
function subtreeOf(repo, commit, path) {
  if (!commit) return null;
  const line = spawnSync('git', ['-C', repo, 'ls-tree', '-d', commit, path], { encoding: 'utf8' }).stdout?.trim();
  return line ? line.split(/\s+/)[2] : null;
}

// Tête de la branche archive : origin/archive si le dépôt distant la porte, sinon la branche locale, sinon null (branche orpheline à créer).
export function archiveTip(repo, { remote = 'origin', branch = ARCHIVE_BRANCH, fetch = true } = {}) {
  const hasRemote = gitOk(repo, ['remote', 'get-url', remote]);
  if (hasRemote && fetch) spawnSync('git', ['-C', repo, 'fetch', '--quiet', remote, `+refs/heads/${branch}:refs/remotes/${remote}/${branch}`], { stdio: 'ignore' });
  const remoteTip = hasRemote && gitOk(repo, ['rev-parse', '--verify', '--quiet', `refs/remotes/${remote}/${branch}`]) ? git(repo, ['rev-parse', `refs/remotes/${remote}/${branch}`]) : null;
  const localTip = gitOk(repo, ['rev-parse', '--verify', '--quiet', `refs/heads/${branch}`]) ? git(repo, ['rev-parse', `refs/heads/${branch}`]) : null;
  if (remoteTip && localTip && remoteTip !== localTip && !gitOk(repo, ['merge-base', '--is-ancestor', localTip, remoteTip])) {
    if (gitOk(repo, ['merge-base', '--is-ancestor', remoteTip, localTip])) return localTip; // commit local pas encore poussé
    throw new ArchiveError(`${branch} locale et ${remote}/${branch} divergent : rien n'est écrit (jamais de --force)`);
  }
  return remoteTip ?? localTip;
}

const ARCHIVE_README = `# Branche archive (Z-Survival)\n\nBranche orpheline écrite par \`scripts/versions/archiver.mjs\` (lot 4c) : un dossier \`v0.N/\` par version figée, construit une fois depuis son commit gelé (\`versions.json\`).\nAucun fichier de workflow. Jamais de --force : une version n'est remplacée que par \`--replace\`, dans un nouveau commit.\n`;

// Commit du dossier <stage>/<id>/ sur la branche archive, par un index temporaire (l'arbre de travail courant n'est jamais touché).
// Renvoie { commit, changed, parent }.
export function commitArchive(repo, { stage, id, label, ref, replace = false, branch = ARCHIVE_BRANCH, parent = null, tmp }) {
  const index = join(tmp, 'archive.index');
  const env = { ...process.env, GIT_INDEX_FILE: index };
  rmSync(index, { force: true });
  if (parent) git(repo, ['read-tree', parent], { env });
  else git(repo, ['read-tree', '--empty'], { env });
  const before = subtreeOf(repo, parent, id);
  if (before) git(repo, ['rm', '-r', '--cached', '--quiet', '--', id], { env });
  if (!existsSync(join(stage, 'LISEZMOI.md'))) writeFileSync(join(stage, 'LISEZMOI.md'), ARCHIVE_README);
  git(repo, [`--work-tree=${stage}`, 'add', '--force', '--', id, 'LISEZMOI.md'], { env });
  const listed = git(repo, ['ls-files'], { env }).split('\n').filter(Boolean);
  if (listed.some((p) => p.startsWith('.github/'))) throw new ArchiveError('la branche archive ne doit contenir aucun fichier de workflow (.github/)');
  const tree = git(repo, ['write-tree'], { env });
  const after = git(repo, ['rev-parse', `${tree}:${id}`]);
  if (before && before === after && parent && git(repo, ['rev-parse', `${parent}^{tree}`]) === tree) return { commit: parent, changed: false, parent };
  if (before && before !== after && !replace) throw new ArchiveError(`${id} existe déjà dans ${branch} avec un autre contenu : --replace pour le remplacer (nouveau commit)`);
  const message = `${before ? 'Archive remplacée' : 'Archive'} ${label} (${ref.slice(0, 7)})`;
  const commit = git(repo, ['commit-tree', tree, ...(parent ? ['-p', parent] : []), '-m', message], {
    env: { ...process.env, GIT_AUTHOR_NAME: process.env.GIT_AUTHOR_NAME || configValue(repo, 'user.name', 'Archiveur Z-Survival'), GIT_AUTHOR_EMAIL: process.env.GIT_AUTHOR_EMAIL || configValue(repo, 'user.email', 'archiveur@localhost'),
      GIT_COMMITTER_NAME: process.env.GIT_COMMITTER_NAME || configValue(repo, 'user.name', 'Archiveur Z-Survival'), GIT_COMMITTER_EMAIL: process.env.GIT_COMMITTER_EMAIL || configValue(repo, 'user.email', 'archiveur@localhost') },
  });
  // Mise à jour de la branche locale (jamais la branche courante : refus si archive est extraite ici).
  const current = spawnSync('git', ['-C', repo, 'symbolic-ref', '--quiet', '--short', 'HEAD'], { encoding: 'utf8' }).stdout?.trim();
  if (current === branch) throw new ArchiveError(`la branche ${branch} est extraite dans l'arbre de travail : rien n'est écrit`);
  const old = gitOk(repo, ['rev-parse', '--verify', '--quiet', `refs/heads/${branch}`]) ? git(repo, ['rev-parse', `refs/heads/${branch}`]) : '';
  git(repo, ['update-ref', `refs/heads/${branch}`, commit, ...(old ? [old] : [])]);
  return { commit, changed: true, parent };
}

// Push de la branche archive seulement, en avance rapide (jamais de --force).
export function pushArchive(repo, { remote = 'origin', branch = ARCHIVE_BRANCH } = {}) {
  git(repo, ['push', remote, `refs/heads/${branch}:refs/heads/${branch}`]);
  return git(repo, ['ls-remote', '--heads', remote, branch]).split(/\s+/)[0] ?? '';
}

// Archive une version. Renvoie un rapport ; en cas d'échec de build, { status: 'indisponible', note } sans rien écrire.
export function archiveVersion(version, {
  repo = process.cwd(), dryRun = false, replace = false, push = true, remote = 'origin', branch = ARCHIVE_BRANCH, install = true, keep = false,
  tmpRoot = tmpdir(), log = () => {},
} = {}) {
  const { id, ref } = version;
  if (!ID_RE.test(id ?? '')) throw new ArchiveError(`Identifiant invalide : ${id}`);
  if (!REF_RE.test(ref ?? '')) throw new ArchiveError(`Hash invalide : ${ref}`);
  const label = labelOf(id);
  const tmp = mkdtempSync(join(tmpRoot, `zs-archive-${id}-`));
  const report = { id, label, ref, branch: version.branch ?? '', dryRun, tmp, status: 'archive', note: '', bytes: 0, files: 0, links: [], tooLarge: [], commit: null, changed: false, pushed: null, installMs: 0, buildMs: 0 };
  try {
    const src = join(tmp, 'src');
    extractSource(repo, ref, src);
    let built;
    try {
      built = buildSource(src, { install, log });
    } catch (error) {
      return { ...report, status: 'indisponible', note: `Build impossible : ${error.message}`.slice(0, 300) };
    }
    report.installMs = built.installMs;
    report.buildMs = built.buildMs;
    const stage = join(tmp, 'stage');
    const dir = join(stage, id);
    mkdirSync(stage, { recursive: true });
    cpSync(built.out, dir, { recursive: true });
    const date = git(repo, ['log', '-1', '--format=%cI', ref]);
    writeFileSync(join(dir, 'build-info.json'), `${JSON.stringify(buildInfo({ label, branch: report.branch, ref, date }), null, 2)}\n`);
    const scan = scanDir(dir, { maxFileBytes: MAX_FILE_BYTES });
    Object.assign(report, { bytes: scan.totalBytes, files: scan.files, links: scan.links, tooLarge: scan.tooLarge, stage });
    if (scan.tooLarge.length > 0) return { ...report, status: 'indisponible', note: `Fichier de plus de 50 Mo : ${scan.tooLarge[0].path}` };
    if (dryRun) return report;
    const parent = archiveTip(repo, { remote, branch });
    const result = commitArchive(repo, { stage, id, label, ref, replace, branch, parent, tmp });
    Object.assign(report, { commit: result.commit, changed: result.changed });
    if (push && gitOk(repo, ['remote', 'get-url', remote])) report.pushed = pushArchive(repo, { remote, branch });
    return report;
  } finally {
    if (!keep) rmSync(tmp, { recursive: true, force: true });
  }
}

// Marque une version indisponible dans un objet versions.json (copie), avec sa raison.
export function markUnavailable(data, id, reason) {
  const copy = structuredClone(data);
  const version = copy.versions?.find((v) => v.id === id);
  if (!version) throw new ArchiveError(`Version inconnue : ${id}`);
  if (version.status === 'actuelle') throw new ArchiveError(`${id} est la version actuelle : elle n'est pas archivée`);
  version.status = 'indisponible';
  version.note = [...String(reason ?? '')].map((c) => (c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127 ? ' ' : c)).join('').slice(0, 300) || 'Build impossible.';
  return copy;
}

// Versions à archiver pour --all : celles de statut « archive » (l'actuelle est servie à la racine ; une indisponible n'est pas retentée).
export function versionsToArchive(data) {
  const check = validateVersions(data);
  if (!check.ok) throw new ArchiveError(`versions.json invalide : ${check.errors.join(' ; ')}`);
  return data.versions.filter((v) => v.status === 'archive');
}

const format = (bytes) => `${(bytes / 1024 / 1024).toFixed(1)} Mo`;

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const repo = git(process.cwd(), ['rev-parse', '--show-toplevel']);
  const data = JSON.parse(readFileSync(resolve(options.versions), 'utf8'));
  let targets;
  if (options.all) targets = versionsToArchive(data);
  else {
    const known = data.versions?.find((v) => v.id === options.id);
    const ref = options.ref ?? known?.ref;
    if (!ref) throw new ArchiveError(`--ref attendu pour ${options.id} (absente de versions.json)`);
    targets = [{ ...(known ?? {}), id: options.id, ref, branch: known?.branch ?? '' }];
  }
  const reports = [];
  for (const version of targets) {
    console.log(`\n== ${version.id} (${version.ref.slice(0, 7)}, ${version.branch || 'branche inconnue'})${options.dryRun ? ' — à blanc' : ''}`);
    const report = archiveVersion(version, { repo, ...options, log: (m) => console.log(`   ${m}`) });
    reports.push(report);
    console.log(`   statut : ${report.status}${report.note ? ` — ${report.note}` : ''}`);
    if (report.status !== 'indisponible') {
      console.log(`   ${report.files} fichiers, ${format(report.bytes)} ; npm ci ${(report.installMs / 1000).toFixed(1)} s, build ${(report.buildMs / 1000).toFixed(1)} s`);
      console.log(`   liens non relatifs : ${report.links.length}${report.links.slice(0, 10).map((l) => `\n     ${l.file} : ${l.url} (${l.type})`).join('')}`);
      if (report.commit) console.log(`   archive : ${report.commit.slice(0, 7)}${report.changed ? '' : ' (inchangée)'}${report.pushed ? `, poussée (${report.pushed.slice(0, 7)})` : ''}`);
    }
  }
  const failed = reports.filter((r) => r.status === 'indisponible');
  if (failed.length > 0) console.log(`\nIndisponibles (à marquer dans versions.json) : ${failed.map((r) => `${r.id} — ${r.note}`).join(' ; ')}`);
  return reports;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  try {
    await main();
  } catch (error) {
    console.error(`Erreur : ${error.message}`);
    process.exit(1);
  }
}
