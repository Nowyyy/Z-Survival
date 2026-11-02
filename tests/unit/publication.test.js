// Lot 4c-C : assembleur du site (racine, next/, v0.N/, lots/), accueil (js/accueil/home.js), journal de /dev, workflow, scripts et hygiène.
import { describe, it, expect, afterAll } from 'vitest';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AssembleError, assembleSite, buildInfo, dirStats, parseOptions, siteTexts, simplePage, utcDate } from '../../scripts/assemble.mjs';
import { buildStamp, channelOf, fill, formatDate, homeModel, readVersions, safePath, siteRoot } from '../../js/accueil/home.js';
import { fakeArchive, testVersions } from '../../scripts/site/e2e-site.mjs';
import { findNonRelative } from '../../scripts/versions/links.mjs';

const ROOT = mkdtempSync(join(tmpdir(), 'zs-test-publication-'));
afterAll(() => rmSync(ROOT, { recursive: true, force: true }));
const real = JSON.parse(readFileSync('versions.json', 'utf8'));
let n = 0;

// Build de main fictif : index.html, jeu.html, data/i18n/fr.json, css/.
function mainBuild({ entry = true, fr = { 'site.lots.retired': 'Les aperçus par lot ont été retirés.' }, extra = {} } = {}) {
  n += 1;
  const dir = join(ROOT, `main-${n}`);
  mkdirSync(join(dir, 'data/i18n'), { recursive: true });
  mkdirSync(join(dir, 'css'), { recursive: true });
  writeFileSync(join(dir, 'index.html'), '<!doctype html><title>accueil</title><link rel="stylesheet" href="css/a.css">');
  if (entry) writeFileSync(join(dir, 'jeu.html'), '<!doctype html><title>jeu</title>');
  writeFileSync(join(dir, 'css/a.css'), 'body{}');
  writeFileSync(join(dir, 'data/i18n/fr.json'), JSON.stringify(fr));
  for (const [path, content] of Object.entries(extra)) {
    mkdirSync(join(dir, path, '..'), { recursive: true });
    writeFileSync(join(dir, path), content);
  }
  return dir;
}
function archiveDir(ids = ['v0.1', 'v0.2', 'v0.3', 'v0.4']) {
  n += 1;
  const dir = join(ROOT, `archive-${n}`);
  for (const v of real.versions.filter((x) => ids.includes(x.id))) fakeArchive(dir, v);
  return dir;
}
const out = () => join(ROOT, `out-${(n += 1)}`);
const MAIN = { branch: 'main', sha: 'a'.repeat(40), date: '2026-11-02T18:25:19+01:00' };
const DEV = { sha: 'b'.repeat(40), date: '2026-11-03T08:00:00Z' };
const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'));
const walk = (dir) => readdirSync(dir).flatMap((name) => (statSync(join(dir, name)).isDirectory() ? walk(join(dir, name)).map((p) => `${name}/${p}`) : [name]));

describe('assembleur : racine seule', () => {
  const dir = out();
  const result = assembleSite({ mainDir: mainBuild(), versions: real, out: dir, main: MAIN });

  it('la racine est le build de main', () => {
    expect(readFileSync(join(dir, 'index.html'), 'utf8')).toContain('accueil');
    expect(existsSync(join(dir, 'jeu.html'))).toBe(true);
  });

  it('build-info.json de la racine : release, V0.5, main, hash court, date UTC', () => {
    expect(readJson(join(dir, 'build-info.json'))).toEqual({ channel: 'release', version: 'V0.5', branch: 'main', sha: 'aaaaaaa', date: '2026-11-02T17:25:19Z' });
  });

  it('sans dev : next/ affiche « Aucun build de développement pour l\'instant », build-info sans hash', () => {
    expect(readFileSync(join(dir, 'next/index.html'), 'utf8')).toContain('Aucun build de développement pour l\'instant');
    expect(readJson(join(dir, 'next/build-info.json'))).toMatchObject({ channel: 'dev', sha: '', date: '' });
    expect(result.next.sha).toBe('');
  });

  it('sans archive : aucun dossier v0.N/, les archives sont publiées « indisponibles » avec une raison', () => {
    for (const id of ['v0.1', 'v0.2', 'v0.3', 'v0.4']) expect(existsSync(join(dir, id)), id).toBe(false);
    const published = readJson(join(dir, 'versions.json'));
    expect(published.versions.filter((v) => v.status === 'indisponible').map((v) => v.id)).toEqual(['v0.1', 'v0.2', 'v0.3', 'v0.4']);
    for (const v of published.versions.filter((x) => x.status === 'indisponible')) expect(v.note).toMatch(/Archive non construite/);
    expect(published.versions[4].status).toBe('actuelle');
  });

  it('versions.json publié à la racine (et copié dans next/ pour l\'accueil du build de développement), valide', async () => {
    const { validateVersions } = await import('../../scripts/versions/schema.mjs');
    expect(validateVersions(readJson(join(dir, 'versions.json'))).ok).toBe(true);
    expect(readFileSync(join(dir, 'next/versions.json'), 'utf8')).toBe(readFileSync(join(dir, 'versions.json'), 'utf8'));
  });

  it('lots/index.html : page de renvoi vers ../, aucun dossier lots/lot-*, aucun lots.json', () => {
    expect(readdirSync(join(dir, 'lots'))).toEqual(['index.html']);
    const html = readFileSync(join(dir, 'lots/index.html'), 'utf8');
    expect(html).toContain('Les aperçus par lot ont été retirés.');
    expect(html).toContain('href="../"');
    expect(html).toContain('name="robots" content="noindex"');
    expect(existsSync(join(dir, 'lots.json'))).toBe(false);
  });

  it('rapport : taille, nombre de fichiers, statut de chaque version', () => {
    expect(result.files).toBe(walk(dir).length);
    expect(result.bytes).toBe(dirStats(dir).bytes);
    expect(result.versions.map((v) => v.status)).toEqual(['indisponible', 'indisponible', 'indisponible', 'indisponible', 'actuelle']);
  });
});

describe('assembleur : racine + next + archives', () => {
  const dir = out();
  const main = mainBuild();
  const result = assembleSite({ mainDir: main, devDir: mainBuild({ extra: { 'jeu.html': 'dev' } }), archiveDir: archiveDir(), versions: real, out: dir, main: MAIN, dev: DEV });

  it('next/ est le build de dev, build-info dev avec hash court et date', () => {
    expect(readFileSync(join(dir, 'next/jeu.html'), 'utf8')).toBe('dev');
    expect(readJson(join(dir, 'next/build-info.json'))).toEqual({ channel: 'dev', version: 'V0.5', branch: 'dev', sha: 'bbbbbbb', date: '2026-11-03T08:00:00Z' });
  });

  it('chaque archive présente est copiée dans v0.N/ et reste « archive »', () => {
    for (const id of ['v0.1', 'v0.2', 'v0.3', 'v0.4']) expect(readJson(join(dir, id, 'build-info.json')).channel, id).toBe('archive');
    expect(readJson(join(dir, 'versions.json')).versions.map((v) => v.status)).toEqual(['archive', 'archive', 'archive', 'archive', 'actuelle']);
    expect(result.versions.map((v) => v.path)).toEqual(['v0.1/', 'v0.2/', 'v0.3/', 'v0.4/', '']);
  });

  it('les fichiers du dépôt archive autres que v0.N/ (LISEZMOI, .git) ne sont pas publiés', () => {
    expect(existsSync(join(dir, 'LISEZMOI.md'))).toBe(false);
    expect(existsSync(join(dir, '.git'))).toBe(false);
  });

  it('les pages produites n\'ont que des chemins relatifs', () => {
    for (const file of ['lots/index.html', 'v0.2/jeu.html']) expect(findNonRelative(readFileSync(join(dir, file), 'utf8'), 'html'), file).toEqual([]);
  });
});

describe('assembleur : cas particuliers', () => {
  it('archive manquante pour une version : seule celle-ci devient indisponible', () => {
    const dir = out();
    assembleSite({ mainDir: mainBuild(), archiveDir: archiveDir(['v0.1', 'v0.2', 'v0.4']), versions: real, out: dir, main: MAIN });
    const published = readJson(join(dir, 'versions.json')).versions;
    expect(published.map((v) => v.status)).toEqual(['archive', 'archive', 'indisponible', 'archive', 'actuelle']);
    expect(existsSync(join(dir, 'v0.3'))).toBe(false);
  });

  it('version déjà indisponible dans versions.json : jamais copiée, sa raison est gardée', () => {
    const dir = out();
    assembleSite({ mainDir: mainBuild(), archiveDir: archiveDir(), versions: testVersions(real), out: dir, main: MAIN });
    expect(existsSync(join(dir, 'v0.1'))).toBe(false);
    expect(readJson(join(dir, 'versions.json')).versions[0]).toMatchObject({ status: 'indisponible', note: 'Version de test indisponible (jeu de versions fictif).' });
  });

  it('dossier d\'archive sans page d\'entrée : indisponible', () => {
    const arch = archiveDir(['v0.2']);
    rmSync(join(arch, 'v0.2/jeu.html'));
    const dir = out();
    assembleSite({ mainDir: mainBuild(), archiveDir: arch, versions: real, out: dir, main: MAIN });
    expect(readJson(join(dir, 'versions.json')).versions[1].status).toBe('indisponible');
  });

  it('un build qui apporterait lots/, lots.json, next/ ou v0.N/ est nettoyé', () => {
    const dir = out();
    assembleSite({ mainDir: mainBuild({ extra: { 'lots/lot-1/index.html': 'x', 'lots.json': '{}', 'v0.2/x.html': 'x', 'next/old.html': 'x' } }), versions: real, out: dir, main: MAIN });
    expect(readdirSync(join(dir, 'lots'))).toEqual(['index.html']);
    expect(existsSync(join(dir, 'lots.json'))).toBe(false);
    expect(existsSync(join(dir, 'v0.2'))).toBe(false);
    expect(existsSync(join(dir, 'next/old.html'))).toBe(false);
  });

  it('la sortie précédente est remplacée (aucun reste d\'un ancien site)', () => {
    const dir = out();
    mkdirSync(join(dir, 'lots/lot-4b'), { recursive: true });
    writeFileSync(join(dir, 'vieux.html'), 'x');
    assembleSite({ mainDir: mainBuild(), versions: real, out: dir, main: MAIN });
    expect(existsSync(join(dir, 'vieux.html'))).toBe(false);
    expect(existsSync(join(dir, 'lots/lot-4b'))).toBe(false);
  });

  it('déterministe : deux assemblages identiques donnent les mêmes fichiers, octet pour octet', () => {
    const main = mainBuild();
    const arch = archiveDir();
    const a = out();
    const b = out();
    assembleSite({ mainDir: main, devDir: main, archiveDir: arch, versions: real, out: a, main: MAIN, dev: DEV });
    assembleSite({ mainDir: main, devDir: main, archiveDir: arch, versions: real, out: b, main: MAIN, dev: DEV });
    expect(walk(a)).toEqual(walk(b));
    for (const file of walk(a)) expect(readFileSync(join(a, file)).equals(readFileSync(join(b, file))), file).toBe(true);
  });

  it('textes des pages produites lus dans data/i18n/fr.json du build de main, sinon textes par défaut', () => {
    expect(siteTexts(mainBuild({ fr: { 'site.lots.retired': 'Autre texte.' } }))['site.lots.retired']).toBe('Autre texte.');
    expect(siteTexts(join(ROOT, 'absent'))['site.next.none']).toBe('Aucun build de développement pour l\'instant');
    expect(simplePage({ title: '<x>', message: '"m"', back: '../', backLabel: 'b', cssRoot: '../' })).toContain('<title>&lt;x&gt;</title>');
  });

  it('buildInfo et utcDate : date normalisée en UTC, hash court seulement s\'il est valide', () => {
    expect(utcDate('2026-11-02T19:25:19+01:00')).toBe('2026-11-02T18:25:19Z');
    expect(utcDate('pas une date')).toBe('');
    expect(buildInfo({ channel: 'dev', version: 'V0.5', branch: 'dev', sha: 'not-a-sha', date: '' })).toEqual({ channel: 'dev', version: 'V0.5', branch: 'dev', sha: '', date: '' });
  });
});

describe('assembleur : erreurs claires', () => {
  it('racine sans index.html', () => {
    const main = mainBuild();
    rmSync(join(main, 'index.html'));
    expect(() => assembleSite({ mainDir: main, versions: real, out: out() })).toThrow(/La racine n'a pas de index.html/);
    expect(() => assembleSite({ mainDir: null, versions: real, out: out() })).toThrow(AssembleError);
  });

  it('version actuelle introuvable (page d\'entrée absente du build de main)', () => {
    expect(() => assembleSite({ mainDir: mainBuild({ entry: false }), versions: real, out: out() })).toThrow(/Version actuelle introuvable : jeu.html/);
  });

  it('versions.json invalide ou sans version actuelle', () => {
    expect(() => assembleSite({ mainDir: mainBuild(), versions: { schema: 1 }, out: out() })).toThrow(/versions.json invalide/);
    const none = structuredClone(real);
    none.versions[4].status = 'archive';
    expect(() => assembleSite({ mainDir: mainBuild(), versions: none, out: out() })).toThrow(AssembleError);
  });

  it('build de dev sans index.html', () => {
    expect(() => assembleSite({ mainDir: mainBuild(), devDir: join(ROOT, 'vide'), versions: real, out: out() })).toThrow(/build de dev/);
  });

  it('plafond de taille injectable : au-delà, échec avec la taille et le plafond', () => {
    expect(() => assembleSite({ mainDir: mainBuild(), versions: real, out: out(), maxBytes: 100 })).toThrow(/Site trop gros : .* plafond de 0 Mo/);
    expect(() => assembleSite({ mainDir: mainBuild(), versions: real, out: out(), maxBytes: 10_000_000 })).not.toThrow();
  });

  it('options : arguments, variables d\'environnement, valeurs refusées', () => {
    expect(parseOptions(['--main', 'm', '--dev', 'd', '--max-mb', '5'], {})).toMatchObject({ main: 'm', dev: 'd', maxBytes: 5 * 1024 * 1024 });
    expect(parseOptions([], { SITE_MAIN: 'x', SITE_ARCHIVE: 'y' })).toMatchObject({ main: 'x', archive: 'y', maxBytes: 900 * 1024 * 1024 });
    expect(() => parseOptions(['--force'], {})).toThrow(/Argument inconnu/);
    expect(() => parseOptions(['--main'], {})).toThrow(/valeur manquante/);
    expect(() => parseOptions(['--max-mb', '-1'], {})).toThrow(/nombre positif/);
    expect(() => parseOptions(['--dev-sha', 'zz'], {})).toThrow(/hash invalide/);
  });
});

describe('accueil (js/accueil/home.js)', () => {
  const release = { channel: 'release', sha: 'fedcba9', date: '2026-11-02T10:00:00Z' };
  const nextInfo = { channel: 'dev', sha: 'abcdef1', date: '2026-11-02T12:00:00Z' };

  it('racine publiée : « V0.5 », Jouer vers jeu.html, build de développement et journal, versions précédentes de V0.4 à V0.1', () => {
    const model = homeModel({ versions: real, info: release, nextInfo });
    expect(model).toMatchObject({ channel: 'release', channelKey: 'recette', root: '', version: 'V0.5', play: 'jeu.html', banner: null });
    expect(model.devSection).toEqual({ next: { sha: 'abcdef1', date: '2026-11-02T12:00:00.000Z' }, nextHref: 'next/', journal: 'dev/' });
    expect(model.previous.map((v) => [v.label, v.href])).toEqual([['V0.4', 'v0.4/jeu.html'], ['V0.3', 'v0.3/jeu.html'], ['V0.2', 'v0.2/jeu.html'], ['V0.1', 'v0.1/jeu.html']]);
  });

  it('version indisponible : aucun lien, sa raison', () => {
    const model = homeModel({ versions: testVersions(real), info: release, nextInfo });
    expect(model.previous.at(-1)).toMatchObject({ label: 'V0.1', status: 'indisponible', href: null, note: 'Version de test indisponible (jeu de versions fictif).' });
  });

  it('pas de build de développement (next/build-info.json sans hash ou absent) : next = null', () => {
    expect(homeModel({ versions: real, info: release, nextInfo: { channel: 'dev', sha: '', date: '' } }).devSection.next).toBeNull();
    expect(homeModel({ versions: real, info: release, nextInfo: null }).devSection.next).toBeNull();
  });

  it('dans next/ (channel dev) : bandeau avec hash et date, section Développement masquée, liens remontés à la racine', () => {
    const model = homeModel({ versions: real, info: nextInfo });
    expect(model).toMatchObject({ channel: 'dev', channelKey: 'dev', root: '../', devSection: null, banner: { sha: 'abcdef1' } });
    expect(model.previous[0].href).toBe('../v0.4/jeu.html');
    expect(model.play).toBe('jeu.html');
  });

  it('arbre source (build-info « source » ou absent) : comme la racine, sans build de développement sondé', () => {
    for (const info of [null, { channel: 'source' }, { channel: 'x' }]) {
      const model = homeModel({ versions: real, info, nextInfo });
      expect(model.channel).toBe('source');
      expect(model.devSection.next).toBeNull();
      expect(siteRoot(info)).toBe('');
    }
    expect(channelOf({ channel: 'archive' })).toBe('archive');
  });

  it('versions.json absent : pas de version affichée, aucune version précédente, Jouer reste jeu.html', () => {
    expect(homeModel({ versions: null, info: release })).toMatchObject({ version: '', previous: [], play: 'jeu.html' });
  });

  it('entrées hostiles : rien d\'absolu ni de schéma dans les liens, textes nettoyés, entrées invalides ignorées', () => {
    const hostile = structuredClone(real);
    hostile.versions[3].entry = 'javascript:alert(1)';
    hostile.versions[2].entry = '//evil.example/x';
    hostile.versions[1].entry = '../../x.html';
    hostile.versions[0].id = '../../evil';
    hostile.versions.push({ id: 'v9.9', status: 'archive', entry: '/abs.html', title: 'x\u0000y' }, null, 'x', { id: 'v0.9', status: 'publiée' });
    hostile.dev = { path: 'https://evil.example/' };
    const model = homeModel({ versions: hostile, info: release, nextInfo });
    const links = [model.play, model.devSection.nextHref, model.devSection.journal, ...model.previous.map((v) => v.href)].filter(Boolean);
    for (const link of links) {
      expect(link, link).not.toMatch(/^\/|^[a-z]+:|\/\/|\.\./i);
    }
    expect(model.previous.map((v) => v.label)).toEqual(['V9.9', 'V0.4', 'V0.3', 'V0.2']);
    expect(model.previous.every((v) => v.href === null)).toBe(true);
    expect(readVersions(hostile).find((v) => v.id === 'v9.9').title).toBe('x y');
    expect(model.devSection.nextHref).toBe('next/');
  });

  it('safePath, buildStamp, fill, formatDate', () => {
    expect(safePath('jeu.html')).toBe('jeu.html');
    expect(safePath('next/', { dir: true })).toBe('next/');
    for (const bad of ['/x', '../x', 'a//b', 'a\\b', 'x?y', '.hidden', '', null]) expect(safePath(bad), String(bad)).toBeNull();
    expect(buildStamp({ sha: 'ABCDEF1' })).toBeNull();
    expect(buildStamp({ sha: 'abcdef1234', date: 'x' })).toEqual({ sha: 'abcdef1', date: '' });
    expect(fill('Version {version} {x}', { version: 'V0.5' })).toBe('Version V0.5 {x}');
    expect(formatDate('2026-11-02T23:30:00Z')).toBe('2 nov. 2026');
    expect(formatDate('')).toBe('');
  });
});

describe('accueil : page et textes', () => {
  const html = readFileSync('index.html', 'utf8');
  const fr = readJson('data/i18n/fr.json');

  it('index.html charge l\'accueil, garde noindex, icône et polices, aucune adresse absolue', () => {
    expect(html).toContain('<script type="module" src="js/accueil/main.js"></script>');
    expect(html).toContain('<link rel="stylesheet" href="css/accueil.css">');
    expect(html).toContain('name="robots" content="noindex"');
    expect(html).toMatch(/<link rel="icon" type="image\/png" sizes="48x48" href="data:image\/png;base64,/);
    expect(html).toContain('<link rel="apple-touch-icon"');
    expect(findNonRelative(html, 'html')).toEqual([]);
  });

  it('<noscript> : message bilingue et liens statiques vers le jeu, next/ et dev/', () => {
    const noscript = html.slice(html.indexOf('<noscript>'), html.indexOf('</noscript>'));
    expect(noscript).toContain('Ce jeu a besoin de JavaScript. / This game needs JavaScript.');
    for (const href of ['jeu.html', 'next/', 'dev/']) expect(noscript).toContain(`href="${href}"`);
  });

  it('textes de l\'accueil et des pages produites dans fr.json', () => {
    expect(fr['home.version']).toBe('{channel} · Version {version}');
    expect([fr['home.channel.recette'], fr['home.channel.dev']]).toEqual(['Recette', 'Développement']); // main = Recette, dev = Développement (demande du propriétaire)
    expect(fr['home.play']).toBe('Jouer');
    expect(fr['home.next']).toBe('Dernier build de développement');
    expect(fr['home.nextNone']).toBe('Aucun build de développement pour l\'instant');
    expect(fr['home.journal']).toBe('Journal des versions');
    expect(fr['home.previousTitle']).toBe('Versions précédentes');
    expect(fr['home.devBanner']).toBe('Build de développement — {sha} — {date}');
    expect(fr['site.lots.retired']).toBe('Les aperçus par lot ont été retirés.');
  });

  it('css/accueil.css : variables de tokens.css seulement, cibles de 44 px', () => {
    const css = readFileSync('css/accueil.css', 'utf8');
    expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(/);
    expect(css).toMatch(/min-height: var\(--touch-target\)/);
  });

  it('build-info.json du dépôt : canal « source » (remplacé dans le site publié)', () => {
    expect(readJson('build-info.json').channel).toBe('source');
  });
});

describe('journal /dev', () => {
  const js = readFileSync('dev/dev.js', 'utf8');
  const html = readFileSync('dev/index.html', 'utf8');

  it('ne lit plus lots.json ; les liens viennent de versions.json', () => {
    expect(js).not.toMatch(/fetch\([^)]*lots\.json|\}lots\.json/);
    expect(js).not.toMatch(/lots\/\$\{/);
    expect(js).toContain('versions.json');
  });

  it('« Ouvrir cette version » : racine pour l\'actuelle, v0.N/<entrée> pour une archive, rien pour une indisponible', () => {
    expect(js).toContain("v.status === 'actuelle' ? ROOT : v.status === 'archive' && entry ? `${ROOT}${v.id}/${entry}` : null");
  });

  it('aucun identifiant de lot affiché (plus de lien « Dernier lot », plus de libellé « Lot N »)', () => {
    expect(html).not.toContain('id="latest"');
    expect(js).not.toMatch(/lotLabel|Dernier lot/);
  });
});

describe('workflow (lot 4c)', () => {
  const wf = readFileSync('.github/workflows/pages.yml', 'utf8');
  const triggers = wf.slice(wf.indexOf('\non:'), wf.indexOf('\npermissions:'));

  it('déclencheurs exacts : push sur main et dev, workflow_dispatch, rien d\'autre', () => {
    expect(triggers).toBe('\non:\n  push:\n    branches: [main, dev]\n  workflow_dispatch:\n');
    expect(wf).not.toMatch(/pull_request|schedule:|lot-\*|archive\]/);
  });

  it('aucune action nouvelle : exactement les actions et versions de l\'ancien workflow', () => {
    const uses = new Set([...wf.matchAll(/uses:\s*(\S+)/g)].map((m) => m[1]));
    expect([...uses].sort()).toEqual([
      'actions/checkout@11bd71901bbe5b1630ceea73d27597364c9af683',
      'actions/configure-pages@983d7736d9b0ae728b81ab479565c72886d7745b',
      'actions/deploy-pages@d6db90164ac5ed86f2b6aed7e0febac5b3c0c03e',
      'actions/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020',
      'actions/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02',
      'actions/upload-pages-artifact@56afc609e74202658d3ffba0e8f6dda462b719fa',
    ]);
  });

  it('permissions : lecture par défaut ; pages et id-token pour le seul déploiement ; plus aucun actions: write', () => {
    expect(wf).toMatch(/^permissions:\n {2}contents: read$/m);
    expect(wf.match(/pages: write/g)).toHaveLength(1);
    expect(wf.match(/id-token: write/g)).toHaveLength(1);
    expect(wf).not.toContain('actions: write');
    expect(wf).not.toMatch(/secrets\./);
  });

  it('un seul groupe de concurrence, sans annulation', () => {
    expect(wf).toMatch(/concurrency:\n {2}group: pages\n {2}cancel-in-progress: false\n/);
  });

  it('jobs : quick (lint + Vitest, 10 min) avant deploy ; e2e (4 tranches, 15 min) sur dev', () => {
    const quick = wf.slice(wf.indexOf('  quick:'), wf.indexOf('  e2e:'));
    expect(quick).toContain('timeout-minutes: 10');
    for (const c of ['npm run lint', 'npm test']) expect(quick).toContain(c);
    const e2e = wf.slice(wf.indexOf('  e2e:'), wf.indexOf('  deploy:'));
    expect(e2e).toContain("if: github.ref == 'refs/heads/dev'");
    expect(e2e).toContain('timeout-minutes: 15');
    expect(e2e).toContain('npm run test:e2e -- --shard=${{ matrix.shard }}');
    const deploy = wf.slice(wf.indexOf('  deploy:'));
    expect(deploy).toContain('needs: quick');
    expect(deploy).toContain("if: github.ref == 'refs/heads/main' || github.ref == 'refs/heads/dev'");
  });

  it('deploy : checkouts de main, dev et archive (facultatifs), npm ci + build, assembleur de main, envoi de _site', () => {
    const deploy = wf.slice(wf.indexOf('  deploy:'));
    for (const s of ['path: main', 'path: dev', 'path: archive', "steps.refs.outputs.dev == 'true'", "steps.refs.outputs.archive == 'true'", 'git ls-remote --heads origin dev archive', 'npm ci && npm run build', 'node main/scripts/assemble.mjs --main main/_site --versions main/versions.json --out _site', '--dev dev/_site', '--archive archive', 'path: _site', 'name: github-pages']) {
      expect(deploy, s).toContain(s);
    }
    expect(deploy).not.toContain('fetch-depth: 0');
  });
});

describe('package.json et Playwright', () => {
  const pkg = readJson('package.json');

  it('scripts : build inchangé, assemble, site, archive, serve:site', () => {
    expect(pkg.scripts).toMatchObject({
      build: 'node scripts/build.mjs', assemble: 'node scripts/assemble.mjs', site: 'node scripts/site/local.mjs', archive: 'node scripts/versions/archiver.mjs',
      'serve:site': 'node scripts/site/serve.mjs --root _site --base /Z-Survival/',
    });
    for (const script of ['scripts/site/local.mjs', 'scripts/versions/archiver.mjs', 'scripts/site/serve.mjs']) expect(existsSync(script), script).toBe(true);
  });

  it('aucune dépendance ajoutée', () => {
    expect(pkg.dependencies).toBeUndefined();
    expect(Object.keys(pkg.devDependencies)).toEqual(['@axe-core/playwright', '@eslint/js', '@playwright/test', 'eslint', 'globals', 'lighthouse', 'three', 'vitest']);
  });

  it('publication.spec est dans la suite rapide (ESSENTIAL) ; le site de test est servi par scripts/site/e2e-site.mjs', () => {
    const config = readFileSync('playwright.config.js', 'utf8');
    expect(config).toMatch(/const ESSENTIAL = \[[^\]]*'publication'/);
    expect(config).toContain('node scripts/site/e2e-site.mjs');
  });
});

// Garde-fous du lot (comparaison à la base de lot-4c, e6cf00e) : actifs seulement tant que tous les commits depuis la base sont ceux du lot 4c
// (sur main après la fusion, ou dans un clone superficiel, ils n'ont plus de sens et sont sautés).
const BASE = 'e6cf00e0392250d1125e4c14c11a91837fca29db';
const git = (...args) => spawnSync('git', args, { encoding: 'utf8' });
const subjects = git('log', '--format=%s', `${BASE}..HEAD`);
const ON_LOT = subjects.status === 0 && subjects.stdout.trim().split('\n').filter(Boolean).every((s) => s.startsWith('Lot 4c'));
const changedSinceBase = (...paths) => {
  const committed = git('diff', '--name-only', BASE, '--', ...paths).stdout.trim().split('\n').filter(Boolean);
  const untracked = git('ls-files', '--others', '--exclude-standard', '--', ...paths).stdout.trim().split('\n').filter(Boolean);
  return [...committed, ...untracked];
};

describe.skipIf(!ON_LOT)('hygiène du lot 4c (comparaison à la base e6cf00e)', () => {
  it('fichiers du jeu inchangés : jeu.html, js/game, js/core, data/game, css/game.css, css/game-ui.css, pages techniques', () => {
    expect(changedSinceBase('jeu.html', 'js/game', 'js/core', 'data/game', 'css/game.css', 'css/game-ui.css', 'sauvegarde.html', 'sons.html', 'carte.html', 'visite.html', 'atelier-sons.html', 'atelier-choix.html', 'atelier-interface.html', 'atelier-personnages.html', 'ecarts.html', 'interface-retenue.html')).toEqual([]);
  });

  it('CLAUDE.md, conventions.md, seed, bilans existants inchangés ; seul pages.yml change dans .github', () => {
    const bilans = readdirSync('Docs/lots').filter((f) => f.endsWith('.md') && f !== 'lot-4c.md').map((f) => `Docs/lots/${f}`);
    expect(changedSinceBase('CLAUDE.md', 'Docs/ref/conventions.md', 'Docs/seed.md', ...bilans)).toEqual([]);
    expect(changedSinceBase('.github')).toEqual(['.github/workflows/pages.yml']);
  });

  it('apercu.txt inchangé (première ligne comprise) ; package-lock.json inchangé', () => {
    expect(changedSinceBase('apercu.txt', 'package-lock.json')).toEqual([]);
  });

  it('aucun fichier de plus de 5 Mo ajouté', () => {
    const added = git('diff', '--name-only', '--diff-filter=A', BASE).stdout.trim().split('\n').filter(Boolean);
    for (const file of [...added, ...changedSinceBase('.')]) if (existsSync(file)) expect(statSync(file).size, file).toBeLessThanOrEqual(5 * 1024 * 1024);
  });
});
