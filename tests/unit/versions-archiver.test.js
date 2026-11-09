// Lot 4c-B : archiveur, vérificateur, détection des liens et serveur local, sur des dépôts fictifs créés en dossier temporaire.
// Aucun test ne dépend du réseau ni des vraies versions (le dépôt « distant » est un dépôt nu local).
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  ArchiveError, archiveTip, archiveVersion, buildInfo, buildSource, extractSource, markUnavailable, parseArgs, readBuildScript, versionsToArchive,
} from '../../scripts/versions/archiver.mjs';
import { classifyUrl, extractUrls, findNonRelative, scanDir } from '../../scripts/versions/links.mjs';
import { checkVersionDir, markdownTable, selectVersions } from '../../scripts/versions/verifier.mjs';
import { normalizeBase, parseArgs as serveArgs, resolveRequest, startServer } from '../../scripts/site/serve.mjs';

const ROOT = mkdtempSync(join(tmpdir(), 'zs-test-archiver-'));
const env = { ...process.env, GIT_AUTHOR_NAME: 'Test', GIT_AUTHOR_EMAIL: 't@example.invalid', GIT_COMMITTER_NAME: 'Test', GIT_COMMITTER_EMAIL: 't@example.invalid' };
const git = (cwd, ...args) => execFileSync('git', ['-C', cwd, ...args], { encoding: 'utf8', env, stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const real = JSON.parse(readFileSync('versions.json', 'utf8'));
let counter = 0;

// Build factice : copie index.html, jeu.html et css/ dans _site/.
const BUILD = `import { cpSync, mkdirSync, rmSync } from 'node:fs';\nrmSync('_site', { recursive: true, force: true });\nmkdirSync('_site');\nfor (const e of ['index.html', 'jeu.html', 'css']) cpSync(e, '_site/' + e, { recursive: true });\n`;
const page = (title, extra = '') => `<!doctype html><html><head><title>${title}</title><link rel="stylesheet" href="css/a.css">${extra}</head><body>${title}</body></html>`;

// Dépôt fictif : deux commits (contenus différents), un dépôt nu « origin ». Renvoie { repo, remote, c1, c2 }.
function makeRepo({ build = BUILD, script = 'node build.mjs', jeu = page('jeu v1'), jeu2 = page('jeu v2') } = {}) {
  counter += 1;
  const repo = join(ROOT, `repo-${counter}`);
  const remote = join(ROOT, `remote-${counter}.git`);
  mkdirSync(join(repo, 'css'), { recursive: true });
  execFileSync('git', ['init', '-q', '--bare', remote], { stdio: 'pipe' });
  git(repo, 'init', '-q', '-b', 'main');
  git(repo, 'remote', 'add', 'origin', remote);
  writeFileSync(join(repo, 'package.json'), JSON.stringify({ name: 'fictif', version: '0.0.0', private: true, scripts: { build: script } }));
  writeFileSync(join(repo, 'package-lock.json'), JSON.stringify({ name: 'fictif', version: '0.0.0', lockfileVersion: 3, requires: true, packages: { '': { name: 'fictif', version: '0.0.0' } } }));
  writeFileSync(join(repo, 'build.mjs'), build);
  writeFileSync(join(repo, 'index.html'), page('accueil'));
  writeFileSync(join(repo, 'jeu.html'), jeu);
  writeFileSync(join(repo, 'css/a.css'), 'body{margin:0}');
  mkdirSync(join(repo, '.github/workflows'), { recursive: true });
  writeFileSync(join(repo, '.github/workflows/pages.yml'), 'on: push\n');
  git(repo, 'add', '-A');
  git(repo, 'commit', '-q', '-m', 'v1');
  const c1 = git(repo, 'rev-parse', 'HEAD');
  writeFileSync(join(repo, 'jeu.html'), jeu2);
  git(repo, 'commit', '-q', '-am', 'v2');
  const c2 = git(repo, 'rev-parse', 'HEAD');
  git(repo, 'push', '-q', 'origin', 'main');
  return { repo, remote, c1, c2 };
}

const opts = (repo, extra = {}) => ({ repo, install: false, tmpRoot: ROOT, ...extra });
const has = (repo, ref) => spawnSync('git', ['-C', repo, 'rev-parse', '--verify', '--quiet', ref]).status === 0;

beforeAll(() => {
  for (const key of ['GIT_AUTHOR_NAME', 'GIT_AUTHOR_EMAIL', 'GIT_COMMITTER_NAME', 'GIT_COMMITTER_EMAIL']) process.env[key] = env[key];
});
afterAll(() => rmSync(ROOT, { recursive: true, force: true }));

describe('archiver : arguments', () => {
  const ref = 'a'.repeat(40);
  it('--id et --ref', () => {
    expect(parseArgs(['--id', 'v0.1', '--ref', ref])).toMatchObject({ id: 'v0.1', ref, all: false, push: true, replace: false, dryRun: false });
  });
  it('--all', () => expect(parseArgs(['--all']).all).toBe(true));
  it('--dry-run coupe le push', () => expect(parseArgs(['--all', '--dry-run'])).toMatchObject({ dryRun: true, push: false }));
  it('--all exclut --id', () => expect(() => parseArgs(['--all', '--id', 'v0.1'])).toThrow(ArchiveError));
  it('sans --id ni --all : refus', () => expect(() => parseArgs([])).toThrow(/--all attendu/));
  it('identifiant hostile refusé', () => {
    for (const id of ['../v0.1', 'v0.1;rm', 'V0.1', '-rf']) expect(() => parseArgs(['--id', id]), id).toThrow(ArchiveError);
  });
  it('hash hostile ou court refusé', () => {
    for (const r of ['abc', 'HEAD', '--upload-pack=x', `${ref};x`]) expect(() => parseArgs(['--id', 'v0.1', '--ref', r]), r).toThrow(ArchiveError);
  });
  it('argument inconnu ou valeur manquante refusés', () => {
    expect(() => parseArgs(['--all', '--force'])).toThrow(/Argument inconnu/);
    expect(() => parseArgs(['--id'])).toThrow(/valeur manquante/);
  });
  it('branche ou remote hostiles refusés', () => {
    expect(() => parseArgs(['--all', '--branch', '../main'])).toThrow(/Branche invalide/);
    expect(() => parseArgs(['--all', '--remote', 'a b'])).toThrow(/Remote invalide/);
  });
});

describe('archiver : extraction et build', () => {
  let fx;
  beforeAll(() => {
    fx = makeRepo();
  });

  it('extrait le commit demandé (et non la tête) dans un dossier temporaire', () => {
    const dest = join(ROOT, 'extract-1');
    extractSource(fx.repo, fx.c1, dest);
    expect(readFileSync(join(dest, 'jeu.html'), 'utf8')).toContain('jeu v1');
    expect(existsSync(join(dest, '.git'))).toBe(false);
  });

  it('ne touche jamais l\'arbre de travail du dépôt', () => {
    extractSource(fx.repo, fx.c1, join(ROOT, 'extract-2'));
    expect(git(fx.repo, 'status', '--porcelain')).toBe('');
    expect(readFileSync(join(fx.repo, 'jeu.html'), 'utf8')).toContain('jeu v2');
  });

  it('refuse un commit inexistant ou un hash invalide', () => {
    expect(() => extractSource(fx.repo, 'f'.repeat(40), join(ROOT, 'x1'))).toThrow(/Commit introuvable/);
    expect(() => extractSource(fx.repo, 'main', join(ROOT, 'x2'))).toThrow(/Hash invalide/);
  });

  it('lit le script build propre à la version', () => {
    const dest = join(ROOT, 'extract-3');
    extractSource(fx.repo, fx.c1, dest);
    expect(readBuildScript(dest)).toBe('node build.mjs');
  });

  it('package.json absent, illisible ou sans build : erreur claire', () => {
    const dir = join(ROOT, 'pkg');
    mkdirSync(dir, { recursive: true });
    expect(() => readBuildScript(dir)).toThrow(/package.json absent/);
    writeFileSync(join(dir, 'package.json'), '{');
    expect(() => readBuildScript(dir)).toThrow(/illisible/);
    writeFileSync(join(dir, 'package.json'), '{"scripts":{"test":"x"}}');
    expect(() => readBuildScript(dir)).toThrow(/aucun script build/);
  });

  it('npm ci puis build : la sortie _site/ est produite (sans réseau : aucune dépendance)', () => {
    const dest = join(ROOT, 'extract-4');
    extractSource(fx.repo, fx.c1, dest);
    const built = buildSource(dest, { install: true });
    expect(existsSync(join(built.out, 'jeu.html'))).toBe(true);
    expect(built.script).toBe('node build.mjs');
  });

  it('un build sans _site/ est refusé', () => {
    const bad = makeRepo({ build: 'console.log("rien")\n' });
    const dest = join(ROOT, 'extract-5');
    extractSource(bad.repo, bad.c1, dest);
    expect(() => buildSource(dest, { install: false })).toThrow(/ne produit pas _site/);
  });

  it('build-info.json : channel archive, version, branche, hash court et complet, date', () => {
    expect(buildInfo({ label: 'V0.1', branch: 'lot-1', ref: 'a'.repeat(40), date: '2026-10-26T06:26:55Z' }))
      .toEqual({ channel: 'archive', version: 'V0.1', branch: 'lot-1', sha: 'aaaaaaa', ref: 'a'.repeat(40), date: '2026-10-26T06:26:55Z' });
  });
});

describe('archiver : branche archive', () => {
  it('--dry-run construit et vérifie sans commit, sans branche, sans push', () => {
    const fx = makeRepo();
    const report = archiveVersion({ id: 'v0.1', ref: fx.c1, branch: 'lot-1' }, opts(fx.repo, { dryRun: true }));
    expect(report).toMatchObject({ status: 'archive', commit: null, pushed: null, dryRun: true });
    expect(report.files).toBeGreaterThan(0);
    expect(has(fx.repo, 'refs/heads/archive')).toBe(false);
    expect(git(fx.remote, 'branch', '--list', 'archive')).toBe('');
    expect(existsSync(report.tmp)).toBe(false);
  });

  it('crée la branche orpheline archive avec v0.1/, build-info.json, LISEZMOI.md et aucun workflow, puis la pousse', () => {
    const fx = makeRepo();
    const report = archiveVersion({ id: 'v0.1', ref: fx.c1, branch: 'lot-1' }, opts(fx.repo));
    expect(report.changed).toBe(true);
    const files = git(fx.repo, 'ls-tree', '-r', '--name-only', 'archive').split('\n');
    expect(files).toEqual(expect.arrayContaining(['LISEZMOI.md', 'v0.1/build-info.json', 'v0.1/index.html', 'v0.1/jeu.html', 'v0.1/css/a.css']));
    expect(files.some((f) => f.startsWith('.github'))).toBe(false);
    expect(git(fx.repo, 'rev-list', '--max-parents=0', 'archive')).toBe(report.commit); // orpheline : un seul commit racine
    const info = JSON.parse(git(fx.repo, 'show', 'archive:v0.1/build-info.json'));
    expect(info).toMatchObject({ channel: 'archive', version: 'V0.1', branch: 'lot-1', ref: fx.c1 });
    expect(git(fx.repo, 'show', 'archive:v0.1/jeu.html')).toContain('jeu v1');
    expect(git(fx.remote, 'rev-parse', 'archive')).toBe(report.commit);
    expect(report.pushed).toBe(report.commit);
  });

  it('l\'arbre de travail et la branche courante ne changent pas', () => {
    const fx = makeRepo();
    archiveVersion({ id: 'v0.1', ref: fx.c1 }, opts(fx.repo));
    expect(git(fx.repo, 'status', '--porcelain')).toBe('');
    expect(git(fx.repo, 'branch', '--show-current')).toBe('main');
    expect(existsSync(join(fx.repo, 'v0.1'))).toBe(false);
  });

  it('idempotent : relancer la même version ne crée aucun commit', () => {
    const fx = makeRepo();
    const first = archiveVersion({ id: 'v0.1', ref: fx.c1 }, opts(fx.repo));
    const second = archiveVersion({ id: 'v0.1', ref: fx.c1 }, opts(fx.repo));
    expect(second).toMatchObject({ changed: false, commit: first.commit });
    expect(git(fx.repo, 'rev-list', '--count', 'archive')).toBe('1');
  });

  it('refuse de remplacer une version présente au contenu différent sans --replace', () => {
    const fx = makeRepo();
    archiveVersion({ id: 'v0.1', ref: fx.c1 }, opts(fx.repo));
    expect(() => archiveVersion({ id: 'v0.1', ref: fx.c2 }, opts(fx.repo))).toThrow(/--replace/);
    expect(git(fx.repo, 'rev-list', '--count', 'archive')).toBe('1');
  });

  it('--replace remplace par un nouveau commit (l\'ancien reste dans l\'historique, jamais de --force)', () => {
    const fx = makeRepo();
    const first = archiveVersion({ id: 'v0.1', ref: fx.c1 }, opts(fx.repo));
    const second = archiveVersion({ id: 'v0.1', ref: fx.c2 }, opts(fx.repo, { replace: true }));
    expect(second.changed).toBe(true);
    expect(git(fx.repo, 'rev-parse', `${second.commit}^`)).toBe(first.commit);
    expect(git(fx.repo, 'show', 'archive:v0.1/jeu.html')).toContain('jeu v2');
    expect(git(fx.remote, 'rev-parse', 'archive')).toBe(second.commit);
  });

  it('une deuxième version s\'ajoute sans retirer la première', () => {
    const fx = makeRepo();
    archiveVersion({ id: 'v0.1', ref: fx.c1 }, opts(fx.repo));
    archiveVersion({ id: 'v0.2', ref: fx.c2 }, opts(fx.repo));
    expect(git(fx.repo, 'ls-tree', '--name-only', 'archive').split('\n')).toEqual(['LISEZMOI.md', 'v0.1', 'v0.2']);
  });

  it('sans --push (push: false) : commit local seulement', () => {
    const fx = makeRepo();
    const report = archiveVersion({ id: 'v0.1', ref: fx.c1 }, opts(fx.repo, { push: false }));
    expect(report.pushed).toBeNull();
    expect(has(fx.repo, 'refs/heads/archive')).toBe(true);
    expect(git(fx.remote, 'branch', '--list', 'archive')).toBe('');
  });

  it('repart de origin/archive quand la branche distante est en avance', () => {
    const fx = makeRepo();
    archiveVersion({ id: 'v0.1', ref: fx.c1 }, opts(fx.repo));
    const clone = join(ROOT, `clone-${counter}`);
    execFileSync('git', ['clone', '-q', fx.remote, clone], { stdio: 'pipe' });
    archiveVersion({ id: 'v0.2', ref: fx.c2 }, opts(clone)); // le clone n'a pas de branche archive locale : il part du distant
    expect(git(fx.remote, 'ls-tree', '--name-only', 'archive').split('\n')).toEqual(['LISEZMOI.md', 'v0.1', 'v0.2']);
    expect(archiveTip(fx.repo, { remote: 'origin' })).toBe(git(fx.remote, 'rev-parse', 'archive'));
  });

  it('archive locale et distante divergentes : rien n\'est écrit', () => {
    const fx = makeRepo();
    archiveVersion({ id: 'v0.1', ref: fx.c1 }, opts(fx.repo, { push: false }));
    const clone = join(ROOT, `clone-div-${counter}`);
    execFileSync('git', ['clone', '-q', fx.remote, clone], { stdio: 'pipe' });
    archiveVersion({ id: 'v0.2', ref: fx.c2 }, opts(clone));
    expect(() => archiveVersion({ id: 'v0.3', ref: fx.c2 }, opts(fx.repo))).toThrow(/divergent/);
  });

  it('refuse d\'écrire si la branche archive est extraite dans l\'arbre de travail', () => {
    const fx = makeRepo();
    archiveVersion({ id: 'v0.1', ref: fx.c1 }, opts(fx.repo, { push: false }));
    git(fx.repo, 'checkout', '-q', 'archive');
    expect(() => archiveVersion({ id: 'v0.2', ref: fx.c2 }, opts(fx.repo, { push: false }))).toThrow(/extraite/);
  });

  it('un build qui échoue donne une version indisponible avec sa raison, sans rien écrire', () => {
    const fx = makeRepo({ build: 'process.exit(3)\n' });
    const report = archiveVersion({ id: 'v0.1', ref: fx.c1 }, opts(fx.repo));
    expect(report.status).toBe('indisponible');
    expect(report.note).toMatch(/^Build impossible/);
    expect(has(fx.repo, 'refs/heads/archive')).toBe(false);
  });

  it('un package.json sans build donne aussi une version indisponible', () => {
    const fx = makeRepo({ script: '' });
    expect(archiveVersion({ id: 'v0.1', ref: fx.c1 }, opts(fx.repo)).note).toMatch(/aucun script build/);
  });

  it('les liens absolus de la version sont rapportés (sans bloquer : le code d\'une version n\'est jamais corrigé)', () => {
    const fx = makeRepo({ jeu: page('jeu', '<script type="module" src="/js/main.js"></script><link rel="icon" href="//cdn.example/x.png">') });
    const report = archiveVersion({ id: 'v0.1', ref: fx.c1 }, opts(fx.repo, { dryRun: true }));
    expect(report.links).toEqual(expect.arrayContaining([
      { file: 'jeu.html', url: '/js/main.js', type: 'absolute' },
      { file: 'jeu.html', url: '//cdn.example/x.png', type: 'protocol-relative' },
    ]));
  });

  it('identifiant ou hash hostiles refusés avant tout travail', () => {
    const fx = makeRepo();
    expect(() => archiveVersion({ id: '../x', ref: fx.c1 }, opts(fx.repo))).toThrow(/Identifiant invalide/);
    expect(() => archiveVersion({ id: 'v0.1', ref: 'HEAD' }, opts(fx.repo))).toThrow(/Hash invalide/);
  });
});

describe('archiver : versions.json', () => {
  it('markUnavailable marque la version, garde la raison, ne modifie pas l\'original', () => {
    const marked = markUnavailable(real, 'v0.1', 'Build impossible : paquet introuvable');
    expect(marked.versions[0]).toMatchObject({ status: 'indisponible', note: 'Build impossible : paquet introuvable' });
    expect(real.versions[0].status).toBe('archive');
  });

  it('markUnavailable nettoie les caractères de contrôle et refuse la version actuelle ou inconnue', () => {
    expect(markUnavailable(real, 'v0.2', 'a\nb').versions[1].note).toBe('a b');
    expect(() => markUnavailable(real, 'v0.7', 'x')).toThrow(/actuelle/); // lot 5p : avant v0.6, aujourd'hui archivée (V0.7 actuelle) ; lot 5f : avant v0.5
    expect(markUnavailable(real, 'v0.5', 'x').versions[4].status).toBe('indisponible');
    expect(markUnavailable(real, 'v0.6', 'x').versions[5].status).toBe('indisponible'); // lot 5p : V0.6 archivée, donc marquable
    expect(() => markUnavailable(real, 'v9.9', 'x')).toThrow(/inconnue/);
  });

  it('versionsToArchive : seulement les versions « archive » (l\'actuelle est à la racine)', () => {
    // Lot 5p : V0.6 archivée (avant : v0.1 à v0.5) ; l'actuelle (V0.7) reste exclue. Lot 5f : V0.5 archivée (avant : v0.1 à v0.4).
    expect(versionsToArchive(real).map((v) => v.id)).toEqual(['v0.1', 'v0.2', 'v0.3', 'v0.4', 'v0.5', 'v0.6']);
    expect(versionsToArchive(markUnavailable(real, 'v0.3', 'x')).map((v) => v.id)).toEqual(['v0.1', 'v0.2', 'v0.4', 'v0.5', 'v0.6']);
    expect(() => versionsToArchive({ schema: 1 })).toThrow(/invalide/);
  });
});

describe('liens non relatifs', () => {
  it('classe les adresses', () => {
    expect(['jeu.html', '../css/a.css', './x.js', 'three'].map(classifyUrl)).toEqual(['relative', 'relative', 'relative', 'relative']);
    expect(classifyUrl('/Z-Survival/jeu.html')).toBe('absolute');
    expect(classifyUrl('/')).toBe('absolute');
    expect(classifyUrl('//evil.example/x')).toBe('protocol-relative');
    expect(classifyUrl('https://evil.example/')).toBe('external');
    expect(['#a', 'data:,', 'mailto:x@y', 'javascript:void(0)', ''].map(classifyUrl)).toEqual(['other', 'other', 'other', 'other', 'other']);
  });

  it('trouve les adresses des pages, styles et modules', () => {
    expect(extractUrls('<a href="a.html"><img src="/b.png" srcset="c.png 1x, /d.png 2x">', 'html')).toEqual(expect.arrayContaining(['a.html', '/b.png', 'c.png', '/d.png']));
    expect(extractUrls('@import "/x.css"; a{background:url(/y.png)}', 'css')).toEqual(['/y.png', '/x.css']);
    expect(extractUrls('import a from "/m.js"; import("./n.js"); fetch("/data.json"); new Worker("/w.js")', 'js')).toEqual(['/m.js', './n.js', '/data.json', '/w.js']);
  });

  it('importmap et modules en ligne d\'une page sont contrôlés', () => {
    const html = '<script type="importmap">{"imports":{"three":"/vendor/three.js"}}</script><script type="module">import x from "/a.js";</script>';
    expect(findNonRelative(html, 'html').map((i) => i.url)).toEqual(expect.arrayContaining(['/vendor/three.js', '/a.js']));
  });

  it('les adresses externes sont signalées, sauf les espaces de noms du W3C', () => {
    expect(findNonRelative('<a href="https://evil.example/">', 'html')).toEqual([{ url: 'https://evil.example/', type: 'external' }]);
    expect(findNonRelative('<svg xmlns="http://www.w3.org/2000/svg"><use href="#a"/></svg>', 'html')).toEqual([]);
    expect(findNonRelative('<a href="https://x.example/">', 'html', { external: false })).toEqual([]);
  });

  it('scanDir : fichiers, taille, plus gros fichier, fichiers trop gros, liens ; vendor/ ignoré', () => {
    const dir = join(ROOT, 'scan');
    mkdirSync(join(dir, 'vendor'), { recursive: true });
    writeFileSync(join(dir, 'index.html'), '<a href="/x">x</a>');
    writeFileSync(join(dir, 'vendor/lib.js'), 'import a from "/abs.js";');
    writeFileSync(join(dir, 'big.bin'), Buffer.alloc(2048));
    const scan = scanDir(dir, { maxFileBytes: 1024 });
    expect(scan.files).toBe(3);
    expect(scan.totalBytes).toBe(2048 + 18 + 24);
    expect(scan.largest.path).toBe('big.bin');
    expect(scan.tooLarge.map((f) => f.path)).toEqual(['big.bin']);
    expect(scan.links).toEqual([{ file: 'index.html', url: '/x', type: 'absolute' }]);
  });
});

describe('vérificateur', () => {
  const version = { id: 'v0.1', entry: 'jeu.html', ref: 'a'.repeat(40) };
  const makeDir = (name, { info = { channel: 'archive', version: 'V0.1', ref: 'a'.repeat(40) }, entry = true, html = '<link href="css/a.css">' } = {}) => {
    const root = join(ROOT, name);
    mkdirSync(join(root, 'v0.1'), { recursive: true });
    if (entry) writeFileSync(join(root, 'v0.1/jeu.html'), html);
    if (info) writeFileSync(join(root, 'v0.1/build-info.json'), JSON.stringify(info));
    return root;
  };

  it('une archive correcte est OK', () => {
    const result = checkVersionDir(makeDir('verif-ok'), version);
    expect(result).toMatchObject({ ok: true, problems: [], label: 'V0.1' });
    expect(result.bytes).toBeGreaterThan(0);
  });

  it('dossier absent', () => {
    expect(checkVersionDir(join(ROOT, 'nulle-part'), version).problems).toEqual(['dossier v0.1/ absent']);
  });

  it('page d\'entrée absente', () => {
    expect(checkVersionDir(makeDir('verif-entry', { entry: false }), version).problems).toContain('page d\'entrée jeu.html absente');
  });

  it('build-info.json absent ou incohérent', () => {
    expect(checkVersionDir(makeDir('verif-info', { info: null }), version).problems).toContain('build-info.json absent ou illisible');
    const wrong = checkVersionDir(makeDir('verif-info2', { info: { channel: 'dev', version: 'V0.2', ref: 'b'.repeat(40) } }), version).problems;
    expect(wrong).toEqual(expect.arrayContaining(['build-info.json : channel « archive » attendu', 'build-info.json : version V0.2 ≠ V0.1', 'build-info.json : ref différente de versions.json']));
  });

  it('lien absolu signalé ; fichier trop gros signalé', () => {
    const root = makeDir('verif-abs', { html: '<script src="/Z-Survival/x.js"></script>' });
    expect(checkVersionDir(root, version).problems).toContain('lien non relatif : jeu.html → /Z-Survival/x.js');
    expect(checkVersionDir(root, version, { maxFileBytes: 4 }).problems.some((p) => p.startsWith('fichier de plus de 50 Mo'))).toBe(true);
  });

  it('selectVersions : versions « archive » de versions.json, éventuellement filtrées', () => {
    expect(selectVersions(real).map((v) => v.id)).toEqual(['v0.1', 'v0.2', 'v0.3', 'v0.4', 'v0.5', 'v0.6']); // lot 5p : V0.6 archivée (avant : v0.1 à v0.5) ; lot 5f : V0.5 archivée (avant : v0.1 à v0.4)
    expect(selectVersions(real, ['v0.2']).map((v) => v.id)).toEqual(['v0.2']);
    expect(() => selectVersions({})).toThrow(/invalide/);
  });

  it('tableau Markdown pour le propriétaire', () => {
    const table = markdownTable([{ ...checkVersionDir(makeDir('verif-table'), version), loads: [{ missing: ['404 x'], consoleErrors: [] }] }]);
    expect(table.split('\n')).toHaveLength(3);
    expect(table).toContain('| V0.1 | `v0.1/jeu.html` |');
    expect(table).toContain('| 1 | 0 | 0 | OK |');
  });
});

describe('serveur local (scripts/site/serve.mjs)', () => {
  it('préfixe normalisé', () => {
    expect(['', '/', 'Z-Survival', '/Z-Survival', '/Z-Survival/'].map(normalizeBase)).toEqual(['/', '/', '/Z-Survival/', '/Z-Survival/', '/Z-Survival/']);
  });

  it('aucune remontée hors de la racine, hors préfixe = 404', () => {
    expect(resolveRequest('/srv', '/', '/../etc/passwd').file).toBe('/srv/etc/passwd');
    expect(resolveRequest('/srv', '/', '/%2e%2e/%2e%2e/etc/passwd').file).toBe('/srv/etc/passwd');
    expect(resolveRequest('/srv', '/', '/a%00b')).toBeNull();
    expect(resolveRequest('/srv', '/Z-Survival/', '/jeu.html')).toBeNull();
    expect(resolveRequest('/srv', '/Z-Survival/', '/Z-Survival')).toEqual({ redirect: '/Z-Survival/' });
    expect(resolveRequest('/srv', '/Z-Survival/', '/Z-Survival/v0.1/')).toMatchObject({ file: '/srv/v0.1', dir: true });
  });

  it('arguments : racine, port, préfixe ; port invalide refusé', () => {
    expect(serveArgs(['--root', 'x', '--port', '1234', '--base', '/b/'])).toEqual({ root: 'x', port: 1234, base: '/b/' });
    expect(() => serveArgs(['--port', 'abc'])).toThrow(RangeError);
  });

  it('sert un sous-dossier sous le préfixe, redirige un dossier sans « / », 404 ailleurs', async () => {
    const root = join(ROOT, 'served');
    mkdirSync(join(root, 'v0.1'), { recursive: true });
    writeFileSync(join(root, 'v0.1/index.html'), '<p>ok</p>');
    const server = await startServer({ root, port: 0, base: '/Z-Survival/', quiet: true });
    const base = `http://127.0.0.1:${server.address().port}`;
    try {
      const ok = await fetch(`${base}/Z-Survival/v0.1/`);
      expect(ok.status).toBe(200);
      expect(ok.headers.get('content-type')).toContain('text/html');
      expect(await ok.text()).toBe('<p>ok</p>');
      const redirect = await fetch(`${base}/Z-Survival/v0.1`, { redirect: 'manual' });
      expect(redirect.status).toBe(301);
      expect(redirect.headers.get('location')).toBe('/Z-Survival/v0.1/');
      expect((await fetch(`${base}/v0.1/`)).status).toBe(404);
      expect((await fetch(`${base}/Z-Survival/absent.html`)).status).toBe(404);
    } finally {
      server.close();
    }
  });
});
