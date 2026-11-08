// Lot 4c-C : assembleur du site, accueil (js/accueil/home.js), workflow, scripts et hygiène.
// Lot 5g : nouvelle organisation (racine « en construction », Recette/ = main, dev/ = dev, redirections next/ et lots/, archives v0.N/ inchangées),
// site-info.json (scripts/site/site-info.mjs) ; le journal /dev (dev/index.html, dev/dev.js) et ses tests sont supprimés.
import { describe, it, expect, afterAll } from 'vitest';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  AssembleError, CANAUX_PUBLIES, CANAL_META_RE, SITE_TEXT_DEFAULTS, assembleSite, buildInfo, constructionPage, dirStats, ecrireCanal, ecrireCanalFichier, messagePage, parseOptions, redirectPage, siteIcon,
  siteTexts, utcDate,
} from '../../scripts/assemble.mjs';
import { MAX_EVOLUTIONS, MAX_VERSION_TITLE, buildSiteInfo, cleanText, readEvolutions, readPrevious, validLabel, validateSiteInfo } from '../../scripts/site/site-info.mjs';
import {
  DEV_HREF, MAX_DESCRIPTION, MAX_PLAY_LABEL, MAX_PREVIOUS, fill, formatDate, homeModel, playLabel, previousHref, readPrevious as readPreviousHome, safePath, text as textHome, validLabel as validLabelHome,
} from '../../js/accueil/home.js';
import { MAX_DESCRIPTION as MAX_DESCRIPTION_NOMS, NOMS_FICHIER, parseNoms } from '../../scripts/site/noms.mjs';
import { DESCRIPTION_RECETTE_TEST, NOMS_TEST, fakeArchive, manyVersions, testVersions } from '../../scripts/site/e2e-site.mjs';
import { findNonRelative } from '../../scripts/versions/links.mjs';

const ROOT = mkdtempSync(join(tmpdir(), 'zs-test-publication-'));
afterAll(() => rmSync(ROOT, { recursive: true, force: true }));
// Lot 5f : V0.6 publiée (actuelle), V0.5 archivée. Les tests de l'assembleur et de l'accueil gardent la situation qu'ils décrivent depuis le lot 5g
// (Recette V0.5, journal de dev fictif en v0.6 non publiée) : « real » = versions.json du dépôt sans V0.6, V0.5 actuelle et latest (avant : le
// fichier tel quel, qui était dans cet état). Le fichier réel (« actuel », V0.6 Recette) est vérifié par « site-info.json de la publication de V0.6 ».
const actuel = JSON.parse(readFileSync('versions.json', 'utf8'));
const real = { ...actuel, latest: 'v0.5', versions: actuel.versions.filter((v) => v.id !== 'v0.6').map((v) => (v.id === 'v0.5' ? { ...v, status: 'actuelle' } : v)) };
let n = 0;
const GENERE = '2026-11-06T12:00:00Z';

// Journal de dev fictif : lots anciens sans version, lots en v0.6 (non publiée), un lot en v0.5 (déjà publiée).
const CHANGELOG = {
  _note: 'test',
  lots: [
    { name: 'lot-4b', titre: 'Version publiée V0.5', points: ['Entrée sans version, ignorée.'] },
    { name: 'lot-4c', version: 'v0.5', titre: 'Lot d\'une version déjà publiée', points: ['Exclu : v0.5 est dans versions.json.'] },
    { name: 'lot-5a', version: 'v0.6', date: '2026-11-04', titre: 'Premier lot de la V0.6', points: ['Premier point du lot 5a.', 'Second point, jamais affiché.'] },
    { name: 'lot-5b', version: 'v0.6', date: '2026-11-05', titre: 'Deuxième lot de la V0.6', points: ['Premier point du lot 5b.'] },
  ],
};

// Build fictif : index.html (avec l'icône de index.html si icon), jeu.html, data/i18n/fr.json, data/changelog.json, css/.
function build({ entry = true, index = true, fr = {}, changelog = CHANGELOG, extra = {}, icon = false } = {}) {
  n += 1;
  const dir = join(ROOT, `build-${n}`);
  mkdirSync(join(dir, 'data/i18n'), { recursive: true });
  mkdirSync(join(dir, 'css'), { recursive: true });
  if (index) writeFileSync(join(dir, 'index.html'), icon ? readFileSync('index.html', 'utf8') : '<!doctype html><title>accueil</title><link rel="stylesheet" href="css/a.css">');
  if (entry) writeFileSync(join(dir, 'jeu.html'), `<!doctype html><title>jeu ${n}</title>`);
  writeFileSync(join(dir, 'css/a.css'), 'body{}');
  writeFileSync(join(dir, 'data/i18n/fr.json'), JSON.stringify(fr));
  if (changelog) writeFileSync(join(dir, 'data/changelog.json'), JSON.stringify(changelog));
  for (const [path, content] of Object.entries(extra)) {
    mkdirSync(join(dir, path, '..'), { recursive: true });
    writeFileSync(join(dir, path), content);
  }
  return dir;
}
function archiveDir(ids = ['v0.1', 'v0.2', 'v0.3', 'v0.4'], versions = real) {
  n += 1;
  const dir = join(ROOT, `archive-${n}`);
  for (const v of versions.versions.filter((x) => ids.includes(x.id))) fakeArchive(dir, v);
  return dir;
}
const out = () => join(ROOT, `out-${(n += 1)}`);
const MAIN = { branch: 'main', sha: 'a'.repeat(40), date: '2026-11-02T18:25:19+01:00' };
const DEV = { sha: 'b'.repeat(40), date: '2026-11-03T08:00:00Z' };
const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'));
const read = (path) => readFileSync(path, 'utf8');
const walk = (dir) => readdirSync(dir).flatMap((name) => (statSync(join(dir, name)).isDirectory() ? walk(join(dir, name)).map((p) => `${name}/${p}`) : [name]));
const assemble = (options) => assembleSite({ versions: real, out: out(), main: MAIN, genere: GENERE, ...options });
// Adresse de redirection d'une page produite (meta refresh) et ses liens.
const refresh = (html) => /<meta http-equiv="refresh" content="0; url=([^"]+)">/.exec(html)?.[1] ?? null;
const hrefs = (html) => [...html.matchAll(/<a [^>]*href="([^"]*)"/g)].map((m) => m[1]);

describe('assembleur : organisation complète (main, dev, archives)', () => {
  const main = build();
  const dev = build({ extra: { 'jeu.html': 'jeu de dev', 'dev/index.html': 'vieux journal' } });
  const result = assemble({ mainDir: main, devDir: dev, archiveDir: archiveDir(), dev: DEV });
  const dir = result.out;

  it('premier niveau : index.html, 404.html, Recette/, dev/, next/, lots/ et les archives v0.1 à v0.4, rien d\'autre', () => {
    // Lot 5h : 404.html ajouté (avant : Recette, dev, index.html, lots, next, v0.1 à v0.4).
    expect(readdirSync(dir).sort()).toEqual(['404.html', 'Recette', 'dev', 'index.html', 'lots', 'next', 'v0.1', 'v0.2', 'v0.3', 'v0.4']);
    expect(existsSync(join(dir, 'jeu.html'))).toBe(false);
    expect(existsSync(join(dir, 'versions.json'))).toBe(false);
    expect(existsSync(join(dir, 'icone.png'))).toBe(false);
  });

  it('racine : page « en construction » autonome (titre, une phrase, aucun lien, aucune ressource, noindex, police du système, 18 px)', () => {
    const html = read(join(dir, 'index.html'));
    expect(html).toContain('<h1>Z-Survival</h1>');
    expect(html).toContain('<p>Z-Survival est en construction.</p>');
    expect(html).toContain('<meta name="robots" content="noindex">');
    expect(html).not.toMatch(/<a\b|<script|<link rel="stylesheet"|<img|url\(|http-equiv/);
    expect(html).toMatch(/<link rel="icon" href="data:[^"]*">/);
    expect(html).toContain('font:400 1.125rem/1.5 system-ui');
    expect(html).not.toMatch(/#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(/);
  });

  it('Recette/ : build de main, build-info release (V0.5, hash court, date UTC), versions.json valide, site-info.json valide', async () => {
    expect(read(join(dir, 'Recette/index.html'))).toContain('accueil');
    expect(read(join(dir, 'Recette/jeu.html'))).toBe(read(join(main, 'jeu.html')));
    expect(readJson(join(dir, 'Recette/build-info.json'))).toEqual({ channel: 'release', version: 'V0.5', branch: 'main', sha: 'aaaaaaa', date: '2026-11-02T17:25:19Z' });
    const { validateVersions } = await import('../../scripts/versions/schema.mjs');
    expect(validateVersions(readJson(join(dir, 'Recette/versions.json'))).ok).toBe(true);
    expect(validateSiteInfo(readJson(join(dir, 'Recette/site-info.json')))).toEqual({ ok: true, errors: [] });
  });

  it('site-info.json : Recette V0.5, dev présent (hash court, date), évolutions v0.6 du journal de dev, versions précédentes V0.4 → V0.1', () => {
    const info = readJson(join(dir, 'Recette/site-info.json'));
    expect(info).toMatchObject({ schema: 1, genere: GENERE, recette: { id: 'v0.5', label: 'V0.5', ref: real.versions[4].ref, entry: 'jeu.html', date: '2026-11-02' } });
    expect(info.dev).toEqual({ present: true, sha: 'bbbbbbb', date: '2026-11-03T08:00:00Z', entry: '../dev/jeu.html' });
    expect(info.evolutions).toEqual([
      { id: 'lot-5b', title: 'Deuxième lot de la V0.6', text: 'Premier point du lot 5b.', date: '2026-11-05', version: 'v0.6' },
      { id: 'lot-5a', title: 'Premier lot de la V0.6', text: 'Premier point du lot 5a.', date: '2026-11-04', version: 'v0.6' },
    ]);
    expect(info.precedentes.map((p) => [p.label, p.entry, p.status])).toEqual([['V0.4', '../v0.4/jeu.html', 'archive'], ['V0.3', '../v0.3/jeu.html', 'archive'], ['V0.2', '../v0.2/jeu.html', 'archive'], ['V0.1', '../v0.1/jeu.html', 'archive']]);
    expect(result.siteInfo).toEqual(info);
  });

  it('dev/ : build de dev (jeu.html de dev), index.html remplacé par une redirection vers ../Recette/, build-info dev ; son ancien dev/ retiré', () => {
    expect(read(join(dir, 'dev/jeu.html'))).toBe('jeu de dev');
    expect(refresh(read(join(dir, 'dev/index.html')))).toBe('../Recette/');
    expect(hrefs(read(join(dir, 'dev/index.html')))).toEqual(['../Recette/']);
    expect(readJson(join(dir, 'dev/build-info.json'))).toEqual({ channel: 'dev', version: 'V0.5', branch: 'dev', sha: 'bbbbbbb', date: '2026-11-03T08:00:00Z' });
    expect(existsSync(join(dir, 'dev/dev'))).toBe(false);
    expect(result.dev).toMatchObject({ built: true, missing: [] });
  });

  it('next/ → ../dev/jeu.html et lots/ → ../Recette/ : redirection immédiate, lien visible, noindex ; un seul fichier chacun', () => {
    for (const [page, target] of [['next', '../dev/jeu.html'], ['lots', '../Recette/']]) {
      expect(readdirSync(join(dir, page)), page).toEqual(['index.html']);
      const html = read(join(dir, page, 'index.html'));
      expect(refresh(html), page).toBe(target);
      expect(hrefs(html), page).toEqual([target]);
      expect(html, page).toContain('<meta name="robots" content="noindex">');
      expect(existsSync(join(dir, page, target)), page).toBe(true);
    }
  });

  it('archives v0.N/ copiées telles quelles (octet pour octet), statut « archive » ; fichiers hors v0.N/ de la branche archive non publiés', () => {
    const arch = archiveDir();
    const again = assemble({ mainDir: main, archiveDir: arch });
    for (const id of ['v0.1', 'v0.2', 'v0.3', 'v0.4']) {
      expect(walk(join(again.out, id)), id).toEqual(walk(join(arch, id)));
      for (const f of walk(join(arch, id))) expect(readFileSync(join(again.out, id, f)).equals(readFileSync(join(arch, id, f))), `${id}/${f}`).toBe(true);
    }
    expect(result.versions.map((v) => [v.id, v.status, v.path])).toEqual([['v0.1', 'archive', 'v0.1/'], ['v0.2', 'archive', 'v0.2/'], ['v0.3', 'archive', 'v0.3/'], ['v0.4', 'archive', 'v0.4/'], ['v0.5', 'actuelle', 'Recette/']]);
  });

  it('aucun dossier lots/lot-*, aucun lots.json ; Recette/ n\'a ni dev/, ni next/, ni lots/, ni v0.N/', () => {
    const files = walk(dir);
    expect(files.filter((f) => /^lots\/lot-|(^|\/)lots\.json$/.test(f))).toEqual([]);
    for (const name of ['dev', 'next', 'lots', 'v0.1', 'Recette']) expect(existsSync(join(dir, 'Recette', name)), name).toBe(false);
  });

  it('pages produites : chemins relatifs seulement, aucune adresse externe, contenu échappé', () => {
    for (const file of ['index.html', 'next/index.html', 'lots/index.html', 'dev/index.html', 'v0.2/jeu.html']) {
      const html = read(join(dir, file));
      expect(findNonRelative(html, 'html'), file).toEqual([]);
      expect(html, file).not.toMatch(/(?:href|src|url)=["']?(?:https?:)?\/\//);
    }
  });

  it('rapport : taille, nombre de fichiers', () => {
    expect(result.files).toBe(walk(dir).length);
    expect(result.bytes).toBe(dirStats(dir).bytes);
  });
});

describe('assembleur : build de dev absent ou incomplet', () => {
  it('sans dev : dev/index.html « Aucun build de développement pour l\'instant » (lien ../Recette/), next/ → ../dev/, site-info sans dev ni évolutions', () => {
    const { out: dir, siteInfo } = assemble({ mainDir: build() });
    expect(readdirSync(join(dir, 'dev'))).toEqual(['index.html']);
    const html = read(join(dir, 'dev/index.html'));
    expect(html).toContain('Aucun build de développement pour l\'instant');
    expect(hrefs(html)).toEqual(['../Recette/']);
    expect(refresh(html)).toBeNull();
    expect(refresh(read(join(dir, 'next/index.html')))).toBe('../dev/');
    expect(siteInfo.dev).toEqual({ present: false, sha: '', date: '', entry: '../dev/jeu.html' });
    expect(siteInfo.evolutions).toEqual([]);
  });

  it('build de dev sans jeu.html ou sans index.html : traité comme absent (raison dans le rapport), jamais copié', () => {
    for (const [options, missing] of [[{ entry: false }, ['jeu.html']], [{ index: false }, ['index.html']], [{ entry: false, index: false }, ['index.html', 'jeu.html']]]) {
      const result = assemble({ mainDir: build(), devDir: build({ ...options, extra: { 'x.html': 'x' } }), dev: DEV });
      expect(result.dev, missing.join()).toMatchObject({ built: false, missing, sha: '' });
      expect(existsSync(join(result.out, 'dev/x.html'))).toBe(false);
      expect(result.siteInfo.dev.present).toBe(false);
    }
  });

  it('journal de dev absent ou illisible : aucune évolution, l\'assemblage réussit', () => {
    expect(assemble({ mainDir: build(), devDir: build({ changelog: null }), dev: DEV }).siteInfo.evolutions).toEqual([]);
    const broken = build();
    writeFileSync(join(broken, 'data/changelog.json'), '{ pas du json');
    expect(assemble({ mainDir: build(), devDir: broken, dev: DEV }).siteInfo.evolutions).toEqual([]);
  });
});

describe('assembleur : archives et versions', () => {
  it('sans archive : aucun dossier v0.N/, versions publiées « indisponibles » avec une raison, sans lien dans site-info', () => {
    const { out: dir, siteInfo } = assemble({ mainDir: build() });
    for (const id of ['v0.1', 'v0.2', 'v0.3', 'v0.4']) expect(existsSync(join(dir, id)), id).toBe(false);
    const published = readJson(join(dir, 'Recette/versions.json'));
    expect(published.versions.filter((v) => v.status === 'indisponible').map((v) => v.id)).toEqual(['v0.1', 'v0.2', 'v0.3', 'v0.4']);
    expect(siteInfo.precedentes.map((p) => [p.id, p.status, p.entry])).toEqual([['v0.4', 'indisponible', null], ['v0.3', 'indisponible', null], ['v0.2', 'indisponible', null], ['v0.1', 'indisponible', null]]);
    for (const p of siteInfo.precedentes) expect(p.note).toMatch(/Archive non construite/);
  });

  it('archive manquante pour une version : seule celle-ci devient indisponible', () => {
    const { out: dir } = assemble({ mainDir: build(), archiveDir: archiveDir(['v0.1', 'v0.2', 'v0.4']) });
    expect(readJson(join(dir, 'Recette/versions.json')).versions.map((v) => v.status)).toEqual(['archive', 'archive', 'indisponible', 'archive', 'actuelle']);
    expect(existsSync(join(dir, 'v0.3'))).toBe(false);
  });

  it('version déjà indisponible dans versions.json : jamais copiée, sa raison est gardée', () => {
    const { out: dir, siteInfo } = assemble({ mainDir: build(), archiveDir: archiveDir(), versions: testVersions(real) });
    expect(existsSync(join(dir, 'v0.1'))).toBe(false);
    expect(siteInfo.precedentes.at(-1)).toEqual({ id: 'v0.1', label: 'V0.1', title: real.versions[0].title, note: 'Version de test indisponible (jeu de versions fictif).', entry: null, status: 'indisponible' });
  });

  it('dossier d\'archive sans page d\'entrée : indisponible', () => {
    const arch = archiveDir(['v0.2']);
    rmSync(join(arch, 'v0.2/jeu.html'));
    expect(readJson(join(assemble({ mainDir: build(), archiveDir: arch }).out, 'Recette/versions.json')).versions[1].status).toBe('indisponible');
  });

  it('13 versions : 12 versions précédentes, de V0.12 à V0.1 (ordre numérique), la Recette V0.13 absente de la liste ; v0.6 publiée : aucune évolution', () => {
    const many = manyVersions();
    const { siteInfo } = assemble({ mainDir: build(), devDir: build(), archiveDir: archiveDir(many.versions.map((v) => v.id), many), versions: many, dev: DEV });
    expect(siteInfo.precedentes.map((p) => p.label)).toEqual(['V0.12', 'V0.11', 'V0.10', 'V0.9', 'V0.8', 'V0.7', 'V0.6', 'V0.5', 'V0.4', 'V0.3', 'V0.2', 'V0.1']);
    expect(siteInfo.recette.label).toBe('V0.13');
    expect(siteInfo.evolutions).toEqual([]);
  });

  it('un build qui apporterait lots/, lots.json, next/, dev/, Recette/, v0.N/, site-info.json ou icone.png est nettoyé (main comme dev)', () => {
    const extra = { 'lots/lot-1/index.html': 'x', 'lots.json': '{}', 'v0.2/x.html': 'x', 'next/old.html': 'x', 'dev/index.html': 'x', 'Recette/x.html': 'x', 'site-info.json': '{}', 'icone.png': 'x' };
    const { out: dir } = assemble({ mainDir: build({ extra }), devDir: build({ extra }), dev: DEV });
    expect(readdirSync(join(dir, 'lots'))).toEqual(['index.html']);
    for (const base of ['Recette', 'dev']) {
      for (const name of ['lots', 'lots.json', 'v0.2', 'next', 'dev', 'Recette', 'icone.png']) expect(existsSync(join(dir, base, name)), `${base}/${name}`).toBe(false);
    }
    expect(readJson(join(dir, 'Recette/site-info.json')).schema).toBe(1);
    expect(existsSync(join(dir, 'v0.2'))).toBe(false);
  });

  it('la sortie précédente est remplacée (aucun reste d\'un ancien site)', () => {
    const dir = out();
    mkdirSync(join(dir, 'lots/lot-4b'), { recursive: true });
    writeFileSync(join(dir, 'vieux.html'), 'x');
    assembleSite({ mainDir: build(), versions: real, out: dir, main: MAIN, genere: GENERE });
    expect(existsSync(join(dir, 'vieux.html'))).toBe(false);
    expect(existsSync(join(dir, 'lots/lot-4b'))).toBe(false);
  });
});

describe('assembleur : déterminisme, textes, icône', () => {
  it('déterministe : deux assemblages identiques donnent les mêmes fichiers, octet pour octet ; seule « genere » de site-info.json dépend de la date fournie', () => {
    const [main, dev, arch] = [build(), build(), archiveDir()];
    const a = assemble({ mainDir: main, devDir: dev, archiveDir: arch, dev: DEV }).out;
    const b = assemble({ mainDir: main, devDir: dev, archiveDir: arch, dev: DEV }).out;
    const c = assemble({ mainDir: main, devDir: dev, archiveDir: arch, dev: DEV, genere: '2027-01-01T00:00:00+01:00' }).out;
    expect(walk(a)).toEqual(walk(b));
    for (const file of walk(a)) {
      expect(readFileSync(join(a, file)).equals(readFileSync(join(b, file))), file).toBe(true);
      if (file !== 'Recette/site-info.json') expect(readFileSync(join(a, file)).equals(readFileSync(join(c, file))), file).toBe(true);
    }
    expect(readJson(join(c, 'Recette/site-info.json')).genere).toBe('2026-12-31T23:00:00Z');
  });

  it('textes des pages produites lus dans data/i18n/fr.json du build de main, sinon textes par défaut ; contenu échappé', () => {
    expect(siteTexts(build({ fr: { 'site.construction.text': 'Autre texte.' } }))['site.construction.text']).toBe('Autre texte.');
    expect(siteTexts(build({ fr: { 'site.dev.none': '   ' } }))['site.dev.none']).toBe('Aucun build de développement pour l\'instant');
    expect(siteTexts(join(ROOT, 'absent'))).toEqual(SITE_TEXT_DEFAULTS);
    const fr = JSON.parse(read('data/i18n/fr.json'));
    for (const [key, value] of Object.entries(SITE_TEXT_DEFAULTS)) expect(fr[key], key).toBe(value);
    expect(constructionPage({ texts: { ...SITE_TEXT_DEFAULTS, 'site.construction.title': '<x>' } })).toContain('<title>&lt;x&gt;</title>');
    const hostile = redirectPage({ target: '../a"><script>', label: '<b>' });
    expect(hostile).not.toContain('<script>');
    expect(hostile).toContain('&lt;b&gt;');
    expect(messagePage({ title: 't', message: '<i>m</i>', back: '../', backLabel: 'b' })).toContain('&lt;i&gt;m&lt;/i&gt;');
  });

  it('icône : le PNG 48 × 48 de index.html recopié en ligne (data:) dans les pages produites, aucun fichier icone.png ; sans icône : data:,', () => {
    const png = siteIcon(read('index.html'));
    expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([48, 48]);
    expect(siteIcon('<link rel="icon" href="data:,">')).toBeNull();
    expect(siteIcon('<link rel="icon" href="data:image/png;base64,AAAA">')).toBeNull();
    expect(siteIcon(undefined)).toBeNull();
    const { out: dir } = assemble({ mainDir: build({ icon: true }) });
    for (const page of ['index.html', 'dev/index.html', 'next/index.html', 'lots/index.html']) {
      const icons = [...read(join(dir, page)).matchAll(/<link rel="icon" href="([^"]*)">/g)].map((m) => m[1]);
      expect(icons, page).toEqual([`data:image/png;base64,${png.toString('base64')}`]);
    }
    expect(walk(dir).filter((f) => f.endsWith('icone.png'))).toEqual([]);
    expect(read(join(assemble({ mainDir: build() }).out, 'index.html'))).toContain('<link rel="icon" href="data:,">');
  });

  it('buildInfo et utcDate : date normalisée en UTC, hash court seulement s\'il est valide', () => {
    expect(utcDate('2026-11-02T19:25:19+01:00')).toBe('2026-11-02T18:25:19Z');
    expect(utcDate('pas une date')).toBe('');
    expect(buildInfo({ channel: 'dev', version: 'V0.5', branch: 'dev', sha: 'not-a-sha', date: '' })).toEqual({ channel: 'dev', version: 'V0.5', branch: 'dev', sha: '', date: '' });
  });
});

describe('assembleur : erreurs claires', () => {
  it('build de main sans index.html ou sans jeu.html', () => {
    expect(() => assemble({ mainDir: build({ index: false }) })).toThrow(/Le build de main n'a pas de index.html/);
    expect(() => assemble({ mainDir: build({ entry: false }) })).toThrow(/Le build de main n'a pas de jeu.html/);
    expect(() => assemble({ mainDir: null })).toThrow(AssembleError);
  });

  it('version actuelle introuvable (sans version actuelle, ou page d\'entrée absente du build de main)', () => {
    const none = structuredClone(real);
    none.versions[4].status = 'archive';
    expect(() => assemble({ mainDir: build(), versions: none })).toThrow(AssembleError);
    const other = structuredClone(real);
    other.versions[4].entry = 'autre.html';
    expect(() => assemble({ mainDir: build(), versions: other })).toThrow(/Version actuelle introuvable : autre.html/);
  });

  it('versions.json invalide', () => {
    expect(() => assemble({ mainDir: build(), versions: { schema: 1 } })).toThrow(/versions.json invalide/);
  });

  it('site-info.json invalide (date de génération absente ou illisible) : échec, aucun site publié à moitié', () => {
    expect(() => assemble({ mainDir: build(), genere: undefined })).toThrow(/site-info.json invalide : genere/);
    expect(() => assemble({ mainDir: build(), genere: 'hier' })).toThrow(/site-info.json invalide/);
  });

  it('plafond de taille injectable (900 Mo par défaut) : au-delà, échec avec la taille et le plafond', () => {
    expect(() => assemble({ mainDir: build(), maxBytes: 100 })).toThrow(/Site trop gros : .* plafond de 0 Mo/);
    expect(() => assemble({ mainDir: build(), maxBytes: 10_000_000 })).not.toThrow();
    expect(parseOptions([], {}).maxBytes).toBe(900 * 1024 * 1024);
  });

  it('options : arguments, variables d\'environnement, valeurs refusées', () => {
    expect(parseOptions(['--main', 'm', '--dev', 'd', '--max-mb', '5', '--genere', GENERE], {})).toMatchObject({ main: 'm', dev: 'd', genere: GENERE, maxBytes: 5 * 1024 * 1024 });
    expect(parseOptions([], { SITE_MAIN: 'x', SITE_ARCHIVE: 'y', SITE_GENERE: GENERE })).toMatchObject({ main: 'x', archive: 'y', genere: GENERE, maxBytes: 900 * 1024 * 1024 });
    expect(() => parseOptions(['--force'], {})).toThrow(/Argument inconnu/);
    expect(() => parseOptions(['--main'], {})).toThrow(/valeur manquante/);
    expect(() => parseOptions(['--max-mb', '-1'], {})).toThrow(/nombre positif/);
    expect(() => parseOptions(['--dev-sha', 'zz'], {})).toThrow(/hash invalide/);
    expect(() => parseOptions(['--genere', 'hier'], {})).toThrow(/--genere/);
  });
});

describe('site-info.json (scripts/site/site-info.mjs)', () => {
  const ids = real.versions.map((v) => v.id);

  it('évolutions : lots non publiés seulement (version absente de versions.json), du plus récent au plus ancien ; v0.5 publiée exclue ; sans version : ignorés', () => {
    expect(readEvolutions(CHANGELOG, ids).map((e) => e.id)).toEqual(['lot-5b', 'lot-5a']);
    expect(readEvolutions(CHANGELOG, [...ids, 'v0.6'])).toEqual([]);
    expect(readEvolutions(CHANGELOG, []).map((e) => e.id)).toEqual(['lot-5b', 'lot-5a', 'lot-4c']);
  });

  it('évolutions : entrées hostiles ignorées ou bornées, jamais interprétées (HTML gardé comme texte) ; 20 au plus, les plus récentes', () => {
    const lots = [
      null, 'x', { name: 'lot-6a', version: 'v0.7', titre: '', points: ['vide'] }, { name: 'lot-6b', version: 'v0.7', points: ['sans titre'] },
      { name: 'lot-6c', version: 'V0.7', titre: 'Version mal formée', points: ['x'] }, { name: 'lot-6d', version: 7, titre: 'Version numérique', points: ['x'] },
      { name: '../evil', version: 'v0.7', titre: 'Nom invalide', points: ['x'] }, { name: 'lot-6e', version: 'v0.7', titre: 'Sans point', points: [] },
      { name: 'lot-6f', version: 'v0.7', titre: '<img src=x onerror=alert(1)>', points: ['<script>alert(1)</script>\u0000\nfin'], date: '2026-13-40' },
      { name: 'lot-6g', version: 'v0.7', titre: 'T'.repeat(500), points: ['p'.repeat(5000)] },
    ];
    const list = readEvolutions({ lots }, ids);
    expect(list.map((e) => e.id)).toEqual(['lot-6g', 'lot-6f']);
    expect(list[1]).toEqual({ id: 'lot-6f', title: '<img src=x onerror=alert(1)>', text: '<script>alert(1)</script> fin', date: '', version: 'v0.7' });
    expect([...list[0].title]).toHaveLength(120);
    expect([...list[0].text]).toHaveLength(300);
    expect(list[0].text.endsWith('…')).toBe(true);
    const many = { lots: Array.from({ length: 30 }, (_, i) => ({ name: `lot-${i + 10}`, version: 'v0.9', titre: `Lot ${i + 10}`, points: ['point'] })) };
    const kept = readEvolutions(many, ids);
    expect(kept).toHaveLength(MAX_EVOLUTIONS);
    expect(kept[0].id).toBe('lot-39');
    expect(kept.at(-1).id).toBe('lot-20');
    expect(readEvolutions(null, ids)).toEqual([]);
    expect(readEvolutions({ lots: 'x' }, ids)).toEqual([]);
  });

  it('versions précédentes : toutes sauf la Recette, la plus récente en haut ; indisponible marquée (sans lien, avec raison) ; chemins hostiles refusés', () => {
    const data = testVersions(real);
    expect(readPrevious(data, 'v0.5').map((p) => [p.id, p.status, p.entry])).toEqual([['v0.4', 'archive', '../v0.4/jeu.html'], ['v0.3', 'archive', '../v0.3/jeu.html'], ['v0.2', 'archive', '../v0.2/jeu.html'], ['v0.1', 'indisponible', null]]);
    const hostile = structuredClone(real);
    hostile.versions[3].entry = '../../x.html';
    hostile.versions[2].entry = 'javascript:alert(1)';
    hostile.versions.push(null, { id: '../v9', status: 'archive', entry: 'x.html' });
    const list = readPrevious(hostile, 'v0.5');
    expect(list.map((p) => [p.id, p.status, p.entry])).toEqual([['v0.4', 'indisponible', null], ['v0.3', 'indisponible', null], ['v0.2', 'archive', '../v0.2/jeu.html'], ['v0.1', 'archive', '../v0.1/jeu.html']]);
    expect(list[0].note).toBe('Version non construite.');
  });

  it('buildSiteInfo : déterministe ; dev absent → ni sha ni évolutions ; recette = latest ; validateSiteInfo accepte le résultat et refuse les écarts', () => {
    const input = { versions: real, dev: { present: true, sha: 'abcdef1', date: '2026-11-03T08:00:00Z' }, changelog: CHANGELOG, genere: GENERE };
    const info = buildSiteInfo(input);
    expect(buildSiteInfo(structuredClone(input))).toEqual(info);
    expect(validateSiteInfo(info)).toEqual({ ok: true, errors: [] });
    expect(buildSiteInfo({ ...input, dev: { present: false, sha: 'abcdef1' } }).dev).toEqual({ present: false, sha: '', date: '', entry: '../dev/jeu.html' });
    expect(buildSiteInfo({ ...input, dev: {} }).evolutions).toEqual([]);
    expect(validateSiteInfo(buildSiteInfo({ ...input, dev: { present: true } }))).toEqual({ ok: true, errors: [] }); // build de dev sans hash connu : sans hash ni date
    expect(validateSiteInfo({ ...info, dev: { present: false, sha: 'abcdef1', date: '', entry: '../dev/jeu.html' } }).ok).toBe(false);
    for (const broken of [null, { ...info, schema: 2 }, { ...info, genere: '' }, { ...info, recette: null }, { ...info, dev: { ...info.dev, entry: 'https://x/' } },
      { ...info, evolutions: [{ ...info.evolutions[0], version: 'x' }] }, { ...info, precedentes: [{ ...info.precedentes[0], entry: '//evil/x' }] },
      { ...info, precedentes: [{ ...info.precedentes[0], status: 'publiée' }] }, { ...info, evolutions: Array(21).fill(info.evolutions[0]) }]) {
      expect(validateSiteInfo(broken).ok).toBe(false);
    }
    expect(cleanText('  a\u0007 b\n\nc  ')).toBe('a b c');
    expect(cleanText(42)).toBe('');
  });

  it('site-info.json de l\'arbre source : canal source, sans version ni évolution (remplacé dans le site publié), absent du build', () => {
    const source = readJson('site-info.json');
    expect(source).toMatchObject({ schema: 1, source: true, recette: null, evolutions: [], precedentes: [], dev: { present: false } });
    expect(read('scripts/build.mjs')).not.toContain('site-info.json');
  });
});

describe('accueil (js/accueil/home.js) : modèle d\'après site-info.json', () => {
  const info = buildSiteInfo({ versions: testVersions(real), dev: { present: true, sha: 'abcdef1', date: '2026-11-02T12:00:00Z' }, changelog: CHANGELOG, genere: GENERE });

  it('normal : « V0.5 », Jouer vers jeu.html, dernier build vers ../dev/jeu.html (hash, date), évolutions (récente en haut), versions précédentes V0.4 → V0.1', () => {
    const model = homeModel(info);
    expect(model).toMatchObject({ state: 'ok', version: 'V0.5', play: 'jeu.html', dev: { present: true, href: '../dev/jeu.html', sha: 'abcdef1', date: '2026-11-02T12:00:00Z' } });
    expect(model.evolutions.map((e) => e.title)).toEqual(['Deuxième lot de la V0.6', 'Premier lot de la V0.6']);
    expect(model.evolutions[0]).toEqual({ title: 'Deuxième lot de la V0.6', text: 'Premier point du lot 5b.', version: 'v0.6' });
    expect(model.previous.map((v) => [v.label, v.href])).toEqual([['V0.4', '../v0.4/jeu.html'], ['V0.3', '../v0.3/jeu.html'], ['V0.2', '../v0.2/jeu.html'], ['V0.1', null]]);
    expect(DEV_HREF).toBe('../dev/jeu.html');
  });

  it('version indisponible : aucun lien, sa raison', () => {
    expect(homeModel(info).previous.at(-1)).toEqual({ id: 'v0.1', label: 'V0.1', title: real.versions[0].title, href: null, note: 'Version de test indisponible (jeu de versions fictif).' });
  });

  it('dev absent : lien remplacé par « Aucun build… » (present false), aucune évolution même si le fichier en contient', () => {
    const model = homeModel({ ...info, dev: { present: false, sha: '', date: '', entry: '../dev/jeu.html' } });
    expect(model.dev).toEqual({ present: false, href: '../dev/jeu.html', sha: '', date: '' });
    expect(model.evolutions).toEqual([]);
  });

  it('sans évolutions : liste vide (la page dit « Aucune évolution depuis la version Recette. »)', () => {
    expect(homeModel({ ...info, evolutions: [] }).evolutions).toEqual([]);
  });

  it('une centaine de versions : toutes listées (de la plus récente à la plus ancienne), aucune perdue ; au-delà de 200, bornées', () => {
    const hundred = manyVersions(101);
    const model = homeModel(buildSiteInfo({ versions: hundred, dev: {}, genere: GENERE }));
    expect(model.version).toBe('V0.101');
    expect(model.previous).toHaveLength(100);
    expect(model.previous[0].label).toBe('V0.100');
    expect(model.previous.at(-1).label).toBe('V0.1');
    expect(readPreviousHome(Array(300).fill({ id: 'v0.1', status: 'indisponible' }))).toHaveLength(MAX_PREVIOUS);
  });

  it('titres et textes hostiles : gardés comme texte (jamais du HTML), nettoyés et bornés ; liens hostiles refusés ; entrées invalides ignorées', () => {
    const hostile = structuredClone(info);
    hostile.evolutions = [
      { title: '<img src=x onerror=alert(1)>', text: '<script>alert(1)</script>\u0000x', version: 'v0.6' }, { title: '', text: 'sans titre', version: 'v0.6' },
      { title: 'Sans version', text: 'x', version: '6' }, null, 'x', { title: 'T'.repeat(400), text: 'p'.repeat(4000), version: 'v0.6' },
    ];
    hostile.precedentes = [
      { id: 'v0.4', label: 'V0.4', title: '<b>gras</b>', status: 'archive', entry: 'javascript:alert(1)', note: '' },
      { id: 'v0.3', label: 'V0.3', title: 'x', status: 'archive', entry: '../v0.2/jeu.html', note: '' },
      { id: 'v0.2', label: 'V0.2', title: 'x', status: 'archive', entry: '../v0.2/../../evil.html', note: '' },
      { id: 'v0.1', label: 'V0.1', title: 'x', status: 'archive', entry: '//evil.example/x', note: '' },
      { id: '../evil', status: 'archive', entry: '../evil/x.html' }, null,
    ];
    hostile.recette = { ...hostile.recette, entry: 'https://evil.example/' };
    hostile.dev = { ...hostile.dev, sha: '<b>', entry: 'https://evil.example/' };
    const model = homeModel(hostile);
    expect(model.play).toBe('jeu.html');
    expect(model.dev).toMatchObject({ href: '../dev/jeu.html', sha: '' });
    expect(model.evolutions.map((e) => e.title)).toEqual(['<img src=x onerror=alert(1)>', 'T'.repeat(120)]);
    expect(model.evolutions[0].text).toBe('<script>alert(1)</script> x');
    expect([...model.evolutions[1].text]).toHaveLength(300);
    expect(model.previous.map((v) => [v.label, v.title, v.href])).toEqual([['V0.4', '<b>gras</b>', null], ['V0.3', 'x', null], ['V0.2', 'x', null], ['V0.1', 'x', null]]);
    for (const link of [model.play, model.dev.href, ...model.previous.map((v) => v.href)].filter(Boolean)) expect(link, link).not.toMatch(/^\/|^[a-z]+:|\/\//i);
  });

  it('fichier absent ou invalide : état « error », liens statiques (jeu.html, ../dev/jeu.html), aucune liste ; arbre source : état « source »', () => {
    for (const bad of [null, undefined, 'x', 42, [], {}, { schema: 2, recette: info.recette }, { schema: 1, recette: null }, { schema: 1, recette: { id: '../x' } }]) {
      // Lot 5i : + playLabel '' (le bouton dit « Jouer » seul) et current null (pas de carte).
      expect(homeModel(bad), JSON.stringify(bad)).toEqual({ state: 'error', version: '', play: 'jeu.html', dev: { present: true, href: '../dev/jeu.html', sha: '', date: '' }, evolutions: [], previous: [], playLabel: '', current: null });
    }
    expect(homeModel(readJson('site-info.json')).state).toBe('source');
  });

  it('text, safePath, previousHref, fill, formatDate', () => {
    expect(textHome('  a\u0007 b\n c ', 3)).toBe('a b');
    expect(safePath('jeu.html')).toBe('jeu.html');
    for (const bad of ['/x', '../x', 'a//b', 'a\\b', 'x?y', '.hidden', 'dir/', '', null]) expect(safePath(bad), String(bad)).toBeNull();
    expect(previousHref('v0.2', '../v0.2/jeu.html')).toBe('../v0.2/jeu.html');
    expect(previousHref('v0.2', '../v0.3/jeu.html')).toBeNull();
    expect(fill('Version {version} {x}', { version: 'V0.5' })).toBe('Version V0.5 {x}');
    expect(formatDate('2026-11-02T23:30:00Z')).toBe('2 nov. 2026');
    expect(formatDate('')).toBe('');
  });
});

describe('accueil : page, rendu et textes', () => {
  const html = read('index.html');
  const main = read('js/accueil/main.js');
  const fr = readJson('data/i18n/fr.json');
  const en = readJson('data/i18n/en.json');

  it('index.html charge l\'accueil, précharge site-info.json (une seule donnée), garde noindex, icône et polices, aucune adresse absolue', () => {
    expect(html).toContain('<script type="module" src="js/accueil/main.js"></script>');
    expect(html).toContain('<link rel="stylesheet" href="css/accueil.css">');
    expect(html).toContain('<link rel="preload" href="site-info.json" as="fetch" crossorigin>');
    expect(html).not.toMatch(/build-info\.json|versions\.json/);
    expect(html).toContain('name="robots" content="noindex"');
    expect(html).toMatch(/<link rel="icon" type="image\/png" sizes="48x48" href="data:image\/png;base64,/);
    expect(findNonRelative(html, 'html')).toEqual([]);
  });

  it('main.js : une seule lecture (site-info.json), contenu inséré par textContent, jamais innerHTML ni insertAdjacentHTML ; aucun stockage', () => {
    expect([...main.matchAll(/fetchJson\('([^']+)'\)/g)].map((m) => m[1])).toEqual(['site-info.json']);
    for (const file of ['js/accueil/main.js', 'js/accueil/home.js', 'index.html']) {
      expect(read(file), file).not.toMatch(/innerHTML|outerHTML|insertAdjacentHTML|document\.write|localStorage|sessionStorage|document\.cookie/);
    }
    expect(main).toContain('textContent');
  });

  it('structure : « Jouer », « Dernier build de développement » vers ../dev/jeu.html, évolutions (gauche) et versions précédentes (droite) dans des régions focusables nommées ; aucun journal', () => {
    expect(html).toMatch(/<a class="button play" id="play" href="jeu.html"/);
    expect(html).toMatch(/<a class="item home-dev" id="dev-link" href="\.\.\/dev\/jeu\.html">/);
    // Lot 5i : région « Toutes les versions » (versions-region, avant : previous-region « Versions précédentes ») ; colonnes home-col-main et home-col-versions.
    for (const [id, title] of [['evolutions-region', 'evolutions-title'], ['versions-region', 'versions-title']]) {
      expect(html).toMatch(new RegExp(`id="${id}" role="region" tabindex="0" aria-labelledby="${title}"`));
    }
    const columns = html.split(/<div class="home-col home-col-(?:main|versions)">/);
    expect(columns).toHaveLength(3);
    expect(columns[1]).toContain('evolutions-region');
    expect(columns[2]).toContain('versions-region');
    expect(html).not.toMatch(/journal|dev\/"|next\//i);
  });

  it('<noscript> : message bilingue et liens statiques vers jeu.html et ../dev/jeu.html (avant le lot 5g : jeu.html, next/, dev/)', () => {
    const noscript = html.slice(html.indexOf('<noscript>'), html.indexOf('</noscript>'));
    expect(noscript).toContain('Ce jeu a besoin de JavaScript. / This game needs JavaScript.');
    expect([...noscript.matchAll(/href="([^"]+)"/g)].map((m) => m[1])).toEqual(['jeu.html', '../dev/jeu.html']);
  });

  it('textes de l\'accueil et des pages produites dans fr.json (et en.json) ; plus de clé du journal ni du bandeau de next/', () => {
    // Lot 5i : bandeau « Recette » seul (avant : home.version « {channel} · Version {version} » et home.channel.recette « Recette ») ; la version est dans le bouton.
    expect(fr['home.playVersion']).toBe('Jouer - {version}');
    expect(fr['home.badge']).toBe('Recette'); // main = Recette (demande du propriétaire)
    expect(fr['home.play']).toBe('Jouer');
    expect(fr['home.next']).toBe('Dernier build de développement');
    expect(fr['home.nextNone']).toBe('Aucun build de développement pour l\'instant');
    expect(fr['home.evolutionsTitle']).toBe('Évolutions en cours de développement');
    expect(fr['home.evolutionsNone']).toBe('Aucune évolution depuis la version Recette.');
    expect(fr['home.previousTitle']).toBe('Versions précédentes');
    for (const gone of ['home.journal', 'home.devBanner', 'home.channel.dev', 'site.lots.retired', 'site.next.none', 'home.version', 'home.channel.recette', 'home.versionUnknown', 'home.versionSource']) expect([fr[gone], en[gone]], gone).toEqual([undefined, undefined]);
    expect(fr['site.construction.text']).toBe('Z-Survival est en construction.'); // lot 5g (avant : site.lots.retired, page de renvoi des aperçus)
    const homeKeys = (dict) => Object.keys(dict).filter((k) => /^(home|site)\./.test(k)).sort();
    expect(homeKeys(en)).toEqual(homeKeys(fr));
    for (const key of homeKeys(fr)) expect(main.includes(`'${key}'`) || html.includes(`"${key}"`) || read('scripts/assemble.mjs').includes(`'${key}'`), key).toBe(true);
  });

  it('css/accueil.css : variables de tokens.css seulement, cibles de 44 px, deux colonnes dès 640 px, zones qui défilent de hauteur limitée', () => {
    const css = read('css/accueil.css');
    expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(/);
    expect(css).toMatch(/min-height: var\(--touch-target\)/);
    expect(css).toMatch(/@media \(min-width: 640px\) \{\n {2}\.home-grid \{\n {4}grid-template-columns: minmax\(0, 1fr\) minmax\(0, 1fr\);/);
    expect(css).toMatch(/\.home-scroll \{\n {2}overflow-y: auto;/);
    expect(css).toMatch(/\.home-scroll-versions \{\n {2}max-height: /); // lot 5i : avant .home-scroll-previous
  });

  it('build-info.json et site-info.json du dépôt : canal « source » (remplacés dans le site publié)', () => {
    expect(readJson('build-info.json').channel).toBe('source');
    expect(readJson('site-info.json').source).toBe(true);
  });
});

describe('workflow (lot 4c)', () => {
  const wf = readFileSync('.github/workflows/pages.yml', 'utf8');
  const triggers = wf.slice(wf.indexOf('\non:'), wf.indexOf('\npermissions:'));

  it('déclencheurs exacts : push sur main et dev, workflow_dispatch, rien d\'autre', () => {
    expect(triggers).toBe('\non:\n  push:\n    branches: [main, dev]\n  workflow_dispatch:\n');
    expect(wf).not.toMatch(/pull_request|schedule:|lot-\*|archive\]/);
  });

  // Lot 4g : actions/upload-artifact ne servait qu'au job e2e retiré (rapport en cas d'échec) ; avant : six actions.
  it('aucune action nouvelle : exactement les actions et versions de l\'ancien workflow, moins upload-artifact (job e2e retiré au lot 4g)', () => {
    const uses = new Set([...wf.matchAll(/uses:\s*(\S+)/g)].map((m) => m[1]));
    expect([...uses].sort()).toEqual([
      'actions/checkout@11bd71901bbe5b1630ceea73d27597364c9af683',
      'actions/configure-pages@983d7736d9b0ae728b81ab479565c72886d7745b',
      'actions/deploy-pages@d6db90164ac5ed86f2b6aed7e0febac5b3c0c03e',
      'actions/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020',
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

  // Lot 4g : job e2e (4 tranches, 15 min, sur dev) retiré, doublon du palier standard de tests.yml ; quick reste la barrière avant deploy.
  it('jobs : quick (lint + Vitest, 10 min) avant deploy ; plus de job e2e (lot 4g)', () => {
    const quick = wf.slice(wf.indexOf('  quick:'), wf.indexOf('  deploy:'));
    expect(quick).toContain('timeout-minutes: 10');
    for (const c of ['npm run lint', 'npm test']) expect(quick).toContain(c);
    expect(wf).not.toMatch(/^ {2}e2e:$/m);
    expect(wf).not.toMatch(/test:e2e|matrix\.shard/);
    const deploy = wf.slice(wf.indexOf('  deploy:'));
    expect(deploy).toContain('needs: quick');
    expect(deploy).toContain("if: github.ref == 'refs/heads/main' || github.ref == 'refs/heads/dev'");
  });

  // Lot 5g : assembleur de la branche qui déclenche (avant : assembleur de main).
  it('deploy : checkouts de main, dev et archive (facultatifs), npm ci + build, assembleur de la branche qui déclenche, envoi de _site', () => {
    const deploy = wf.slice(wf.indexOf('  deploy:'));
    for (const s of ['path: main', 'path: dev', 'path: archive', "steps.refs.outputs.dev == 'true'", "steps.refs.outputs.archive == 'true'", 'git ls-remote --heads origin dev archive', 'npm ci && npm run build', "node ${{ github.ref == 'refs/heads/dev' && 'dev' || 'main' }}/scripts/assemble.mjs --main main/_site --versions main/versions.json --out _site", '--dev dev/_site', '--archive archive', 'path: _site', 'name: github-pages']) {
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

// Garde-fous du lot 5g (comparaison à la base origin/dev 775f1d1) : actifs seulement tant que tous les commits depuis la base sont ceux du lot 5g.
const BASE_5G = '775f1d15a6a092bc73aab982d55431447240db53';
const subjects5g = git('log', '--format=%s', `${BASE_5G}..HEAD`);
const ON_5G = subjects5g.status === 0 && subjects5g.stdout.trim().split('\n').filter(Boolean).every((s) => s.startsWith('Lot 5g'));
const changedSince5g = (...paths) => {
  const committed = git('diff', '--name-only', BASE_5G, '--', ...paths).stdout.trim().split('\n').filter(Boolean);
  const untracked = git('ls-files', '--others', '--exclude-standard', '--', ...paths).stdout.trim().split('\n').filter(Boolean);
  return [...committed, ...untracked];
};

describe.skipIf(!ON_5G)('hygiène du lot 5g (comparaison à la base 775f1d1)', () => {
  it('jeu inchangé : jeu.html, js/game, js/core, data/game, css/game*.css', () => {
    expect(changedSince5g('jeu.html', 'js/game', 'js/core', 'data/game', 'css/game.css', 'css/game-ui.css')).toEqual([]);
  });

  it('seed, CLAUDE.md, conventions.md, versions.json, dernier-complet.json, scripts/versions/ et bilans existants inchangés ; seul pages.yml change dans .github', () => {
    const bilans = readdirSync('Docs/lots').filter((f) => f.endsWith('.md') && f !== 'lot-5g.md').map((f) => `Docs/lots/${f}`);
    expect(changedSince5g('Docs/seed.md', 'CLAUDE.md', 'Docs/ref/conventions.md', 'versions.json', 'tests/dernier-complet.json', 'scripts/versions', ...bilans)).toEqual([]);
    expect(changedSince5g('.github')).toEqual(['.github/workflows/pages.yml']);
  });

  it('aucune dépendance : package.json et package-lock.json inchangés', () => {
    expect(changedSince5g('package.json', 'package-lock.json')).toEqual([]);
  });

  it('aucun fichier de plus de 5 Mo ajouté ou modifié', () => {
    for (const file of changedSince5g('.')) if (existsSync(file)) expect(statSync(file).size, file).toBeLessThanOrEqual(5 * 1024 * 1024);
  });

  it('journal supprimé : dev/, tests/e2e/dev.spec.js ; aucun lien absolu ni adresse externe dans les fichiers du site modifiés', () => {
    expect(existsSync('dev')).toBe(false);
    expect(existsSync('tests/e2e/dev.spec.js')).toBe(false);
    for (const file of changedSince5g('index.html', 'js/accueil', 'css/accueil.css', 'scripts/assemble.mjs', 'scripts/site').filter(existsSync)) {
      expect(read(file), file).not.toMatch(/(?:href|src)=["'](?:https?:)?\/\//);
      if (file.endsWith('.html')) expect(findNonRelative(read(file), 'html'), file).toEqual([]);
    }
  });
});

// Lot 5h : étiquettes des versions (nom du fichier des noms, sinon label de versions.json) et fichier des noms appliqué par l'assembleur.
describe('étiquettes des versions (lot 5h) : même règle dans site-info.mjs et home.js, repli sur V<id>', () => {
  const NOM60 = 'é'.repeat(60);
  const cas = [['V0.5 bêta', 'V0.5 bêta'], ['  V0.5  ', 'V0.5'], [NOM60, NOM60], ['<b>V0.5</b>', '<b>V0.5</b>'], ['', null], ['   ', null], [`${NOM60}a`, null],
    ['a\u0007b', null], ['a\u0085b', null], ['a\nb', null], [undefined, null], [42, null], [null, null]];
  it.each(cas)('validLabel(%j) → %j (site-info.mjs et home.js)', (value, expected) => {
    expect(validLabel(value)).toBe(expected);
    expect(validLabelHome(value)).toBe(expected);
  });
  const withLabels = (recette, previous) => {
    const v = structuredClone(real);
    for (const x of v.versions) {
      if (x.id === 'v0.5') x.label = recette;
      if (x.id === 'v0.4') x.label = previous;
      if (recette === undefined && x.id === 'v0.5') delete x.label;
      if (previous === undefined && x.id === 'v0.4') delete x.label;
    }
    return buildSiteInfo({ versions: v, dev: { present: false }, genere: GENERE });
  };
  it('buildSiteInfo : étiquette valide gardée (sans espaces aux extrémités), sinon V<id> ; absence de label : V<id> ; validateSiteInfo accepte le résultat', () => {
    for (const [value, expected] of cas) {
      const info = withLabels(value, value);
      expect(info.recette.label, String(value)).toBe(expected ?? 'V0.5');
      expect(info.precedentes[0].label, String(value)).toBe(expected ?? 'V0.4');
      expect(validateSiteInfo(info), String(value)).toEqual({ ok: true, errors: [] });
    }
    const sans = withLabels(undefined, undefined);
    expect([sans.recette.label, sans.precedentes[0].label]).toEqual(['V0.5', 'V0.4']);
  });
  it('validateSiteInfo : toute étiquette qui respecte la règle (HTML compris, comme texte) ; refuse vide, espaces seules, 61 caractères, contrôle, absence', () => {
    const info = withLabels('V0.5', 'V0.4');
    for (const ok of ['V0.5 bêta', NOM60, '<img src=x onerror=alert(1)>']) {
      expect(validateSiteInfo({ ...info, recette: { ...info.recette, label: ok } }).ok, ok).toBe(true);
      expect(validateSiteInfo({ ...info, precedentes: [{ ...info.precedentes[0], label: ok }] }).ok, ok).toBe(true);
    }
    for (const bad of ['', '   ', `${NOM60}a`, 'a\u0007b', 'a\u009fb', undefined, 7]) {
      expect(validateSiteInfo({ ...info, recette: { ...info.recette, label: bad } }).errors, String(bad)).toContain('recette : id ou label invalide');
      expect(validateSiteInfo({ ...info, precedentes: [{ ...info.precedentes[0], label: bad }] }).errors, String(bad)).toContain('precedentes[0] invalide');
    }
  });
  it('homeModel : étiquette de la Recette et des versions précédentes lue dans site-info.json si valide, sinon V<id> (défaut inchangé)', () => {
    const info = buildSiteInfo({ versions: real, dev: { present: false }, genere: GENERE });
    expect(homeModel(info).version).toBe('V0.5');
    expect(homeModel(info).previous.map((p) => p.label)).toEqual(['V0.4', 'V0.3', 'V0.2', 'V0.1']);
    for (const [value, expected] of cas) {
      const model = homeModel({ ...info, recette: { ...info.recette, label: value }, precedentes: [{ ...info.precedentes[0], label: value }] });
      expect(model.version, String(value)).toBe(expected ?? 'V0.5');
      expect(model.previous[0].label, String(value)).toBe(expected ?? 'V0.4');
    }
    const sansLabel = { ...info.recette };
    delete sansLabel.label;
    expect(homeModel({ ...info, recette: sansLabel }).version).toBe('V0.5');
  });
  // Lot 5i : l'étiquette est dans le bouton (fill de home.playVersion) ; avant : bandeau (fill de home.version).
  it('main.js insère l\'étiquette par textContent (fill de home.playVersion), jamais par innerHTML', () => {
    const main = read('js/accueil/main.js');
    expect(main).toContain("$('play').textContent = model.state === 'ok' ? fill(t('home.playVersion'), { version: model.playLabel }) : t('home.play');");
    expect(main).not.toMatch(/innerHTML|insertAdjacentHTML|outerHTML/);
  });
});

describe('assembleur : fichier des noms (lot 5h)', () => {
  const FICHIER = [
    '# Fichier de test (fictif)',
    '[v0.5]', 'nom: V0.5 Recette de test', 'description: Description de test de la Recette',
    '[v0.4]', 'nom: Quatrième (test)', 'description: Fenêtres : texte de test, avec deux-points',
    '[lot-5a]', 'nom: Voiture en flammes (test)', 'description: Description de test du lot 5a.',
    '[lot-5b]', 'afficher: non',
  ].join('\n');
  const withNoms = (text, options = {}) => build({ ...options, extra: { ...(options.extra ?? {}), [NOMS_FICHIER]: text } });
  const main = build();
  const devNoms = withNoms(FICHIER);
  const archive = archiveDir();
  const result = assemble({ mainDir: main, devDir: devNoms, archiveDir: archive, dev: DEV });
  const info = readJson(join(result.out, 'Recette/site-info.json'));
  const plain = assemble({ mainDir: main, devDir: build(), archiveDir: archive, dev: DEV });

  it('le fichier l\'emporte : étiquette et titre de la Recette, d\'une version précédente, titre et texte d\'un lot ; afficher: non retire le lot', () => {
    expect(info.recette).toMatchObject({ id: 'v0.5', label: 'V0.5 Recette de test', title: 'Description de test de la Recette', ref: real.versions[4].ref, entry: 'jeu.html', date: '2026-11-02' });
    expect(info.precedentes[0]).toEqual({ id: 'v0.4', label: 'Quatrième (test)', title: 'Fenêtres : texte de test, avec deux-points', note: '', entry: '../v0.4/jeu.html', status: 'archive' });
    expect(info.precedentes.slice(1)).toEqual(plain.siteInfo.precedentes.slice(1));
    expect(info.evolutions).toEqual([{ id: 'lot-5a', title: 'Voiture en flammes (test)', text: 'Description de test du lot 5a.', date: '2026-11-04', version: 'v0.6' }]);
    expect(validateSiteInfo(info)).toEqual({ ok: true, errors: [] });
    expect(result.noms).toEqual({ source: 'dev', blocs: 4, erreurs: [], inconnus: [], applique: true });
  });
  it('dates, ref, status, entry et ordre inchangés ; Recette/versions.json identique à celui d\'un site sans fichier des noms', () => {
    expect(read(join(result.out, 'Recette/versions.json'))).toBe(read(join(plain.out, 'Recette/versions.json')));
    expect(info.precedentes.map((p) => [p.id, p.entry, p.status])).toEqual(plain.siteInfo.precedentes.map((p) => [p.id, p.entry, p.status]));
    expect(existsSync(join(result.out, 'Recette', NOMS_FICHIER))).toBe(false); // build de main sans fichier
    expect(read(join(result.out, 'dev', NOMS_FICHIER))).toBe(FICHIER); // publié avec le build de dev (textes publics)
  });
  it('« version » : un lot rattaché à une version publiée sort des évolutions, un lot rattaché à une version non publiée y entre', () => {
    const dev = withNoms('[lot-5a]\nversion: v0.5\n[lot-4c]\nversion: v0.7\n[lot-4b]\nversion: v0.6\n');
    const r = assemble({ mainDir: main, devDir: dev, dev: DEV });
    expect(r.siteInfo.evolutions.map((e) => [e.id, e.version])).toEqual([['lot-5b', 'v0.6'], ['lot-4c', 'v0.7'], ['lot-4b', 'v0.6']]);
    expect(plain.siteInfo.evolutions.map((e) => e.id)).toEqual(['lot-5b', 'lot-5a']);
  });
  it('identifiant inconnu : ignoré, signalé ; version cible d\'un lot (v0.6) connue', () => {
    const r = assemble({ mainDir: main, devDir: withNoms('[v0.9]\nnom: V0.9\n[lot-9z]\nnom: Inconnu\n[v0.6]\nnom: V0.6\n'), dev: DEV });
    expect(r.noms.inconnus).toEqual(['v0.9', 'lot-9z']);
    expect(r.siteInfo).toEqual({ ...plain.siteInfo, precedentes: r.siteInfo.precedentes });
    expect(r.siteInfo.precedentes.map((p) => p.label)).toEqual(['V0.4', 'V0.3', 'V0.2', 'V0.1']);
  });
  it('fichier absent partout : textes d\'origine, source null ; fichier invalide en partie : lignes fautives ignorées (numéro de ligne), le reste appliqué', () => {
    expect(plain.noms).toEqual({ source: null, blocs: 0, erreurs: [], inconnus: [], applique: true });
    const r = assemble({ mainDir: main, devDir: withNoms('[lot-5a]\nnom: Bon titre\ntitre: clé inconnue\nafficher: bof\n[lot 5b]\nnom: ignoré\n'), dev: DEV });
    expect(r.noms.erreurs).toHaveLength(3);
    expect(r.noms.erreurs[0]).toMatch(new RegExp(`^${NOMS_FICHIER.replace(/\./g, '\\.')}, ligne 3 : Clé inconnue`));
    expect(r.noms.erreurs[1]).toMatch(/ligne 4 : « afficher » vaut « bof »/);
    expect(r.noms.erreurs[2]).toMatch(/ligne 5 : Identifiant de bloc invalide/);
    expect(r.siteInfo.evolutions.map((e) => [e.id, e.title])).toEqual([['lot-5b', 'Deuxième lot de la V0.6'], ['lot-5a', 'Bon titre']]);
  });
  it('dev absent ou sans fichier : fichier du build de main ; ni l\'un ni l\'autre : aucun changement', () => {
    const mainNoms = withNoms('[v0.5]\nnom: V0.5 (de main)\n[lot-5a]\nnom: Ignoré sans journal de dev\n');
    const sansDev = assemble({ mainDir: mainNoms });
    expect(sansDev.noms).toEqual({ source: 'main', blocs: 2, erreurs: [], inconnus: [], applique: true });
    expect(sansDev.siteInfo.recette.label).toBe('V0.5 (de main)');
    expect(sansDev.siteInfo.evolutions).toEqual([]);
    const devSansFichier = assemble({ mainDir: mainNoms, devDir: build(), dev: DEV });
    expect(devSansFichier.noms.source).toBe('main');
    expect(devSansFichier.siteInfo.evolutions[1]).toMatchObject({ id: 'lot-5a', title: 'Ignoré sans journal de dev' });
    const devAvecFichier = assemble({ mainDir: mainNoms, devDir: devNoms, dev: DEV });
    expect(devAvecFichier.siteInfo.recette.label).toBe('V0.5 Recette de test');
  });
  it('jamais bloqué par le fichier : octets hostiles, UTF-8 invalide, HTML et __proto__ ; aucun HTML interprété (texte gardé tel quel dans le JSON)', () => {
    let seed = 3;
    const noise = Buffer.from(Array.from({ length: 4000 }, () => (seed = (seed * 1103515245 + 12345) % 2 ** 31) & 0xff));
    const hostile = Buffer.concat([Buffer.from('[lot-5a]\nnom: <script>alert(1)</script>\ndescription: <img src=x onerror=alert(1)>\n[__proto__]\nnom: x\n'), noise]);
    const r = assemble({ mainDir: main, devDir: build({ extra: { [NOMS_FICHIER]: hostile } }), dev: DEV });
    expect(r.noms.erreurs.length).toBeGreaterThan(0);
    expect(validateSiteInfo(r.siteInfo)).toEqual({ ok: true, errors: [] });
    const lot = r.siteInfo.evolutions.find((e) => e.id === 'lot-5a');
    expect(lot).toMatchObject({ title: '<script>alert(1)</script>', text: '<img src=x onerror=alert(1)>' });
    expect(read(join(r.out, 'Recette/site-info.json'))).toContain('"title": "<script>alert(1)</script>"');
    expect({}.nom).toBeUndefined();
  });
  it('déterministe : deux assemblages avec le même fichier donnent les mêmes octets', () => {
    const again = assemble({ mainDir: main, devDir: devNoms, archiveDir: archive, dev: DEV });
    const files = walk(result.out).sort();
    expect(walk(again.out).sort()).toEqual(files);
    for (const f of files) expect(readFileSync(join(again.out, f)).equals(readFileSync(join(result.out, f))), f).toBe(true);
  });
  it('npm run build copie le fichier des noms dans la sortie (ENTRIES)', () => {
    expect(read('scripts/build.mjs')).toContain("ENTRIES.push('noms-versions-et-lots.txt');");
  });
});

// Lot 5f : publication de V0.6. Jeu de données : versions.json réel (V0.6 actuelle, V0.5 à V0.1 archivées) dans main, journal réel
// (data/changelog.json : lots 5a à 5h et 5f en v0.6) dans le build de dev, archives fictives v0.1 à v0.5, sans fichier des noms (textes d'origine).
describe('site-info.json de la publication de V0.6 (lot 5f)', () => {
  const journal = JSON.parse(readFileSync('data/changelog.json', 'utf8'));
  const siteDe = (changelog) => assemble({ versions: actuel, mainDir: build(), devDir: build({ changelog }), archiveDir: archiveDir(['v0.1', 'v0.2', 'v0.3', 'v0.4', 'v0.5'], actuel), dev: DEV });

  // Lot 5l : lot-5l, lot-5k puis lot-5j ; lot 5k : lot-5k puis lot-5j (v0.7, non publiée) ; lot 5j : lot-5j seul (avant : évolutions vides).
  it('recette = V0.6, versions précédentes V0.5 → V0.1 (archives), les lots en v0.6 disparaissent des évolutions (lot-5l, lot-5k et lot-5j, v0.7) ; site-info.json valide', () => {
    expect(journal.lots.filter((l) => l.version === 'v0.6').map((l) => l.name)).toEqual(['lot-5a', 'lot-5b', 'lot-5c', 'lot-5d', 'lot-5e', 'lot-5g', 'lot-5h', 'lot-5f', 'lot-5i']); // lot 5i ajouté
    const { out: dir, siteInfo } = siteDe(journal);
    const v06 = actuel.versions.find((v) => v.id === 'v0.6');
    expect(siteInfo.recette).toEqual({ id: 'v0.6', label: 'V0.6', title: v06.title, date: '2026-11-06', ref: v06.ref, entry: 'jeu.html' });
    expect(siteInfo.precedentes.map((p) => [p.label, p.entry, p.status])).toEqual([
      ['V0.5', '../v0.5/jeu.html', 'archive'], ['V0.4', '../v0.4/jeu.html', 'archive'], ['V0.3', '../v0.3/jeu.html', 'archive'], ['V0.2', '../v0.2/jeu.html', 'archive'], ['V0.1', '../v0.1/jeu.html', 'archive'],
    ]);
    expect(siteInfo.evolutions.map((e) => [e.id, e.version])).toEqual([['lot-5l', 'v0.7'], ['lot-5k', 'v0.7'], ['lot-5j', 'v0.7']]);
    expect(siteInfo.evolutions.filter((e) => e.version === 'v0.6')).toEqual([]);
    expect(siteInfo.dev).toEqual({ present: true, sha: 'bbbbbbb', date: '2026-11-03T08:00:00Z', entry: '../dev/jeu.html' });
    expect(readJson(join(dir, 'Recette/site-info.json'))).toEqual(siteInfo);
    expect(validateSiteInfo(siteInfo)).toEqual({ ok: true, errors: [] });
    expect(readJson(join(dir, 'Recette/build-info.json'))).toMatchObject({ channel: 'release', version: 'V0.6', branch: 'main' });
    expect(readJson(join(dir, 'Recette/versions.json'))).toEqual(actuel);
    expect(readdirSync(dir).filter((name) => /^v0\.\d+$/.test(name)).sort()).toEqual(['v0.1', 'v0.2', 'v0.3', 'v0.4', 'v0.5']);
  });

  // Lot 5l : avant lot-5l, lot-5k et lot-5j ; lot 5k : le lot fictif apparaît en tête, avant lot-5k et lot-5j (v0.7 aussi) ; lot 5j : avant lot-5j ; avant : seul.
  it('le même jeu avec un lot ajouté de version v0.7 (non publiée) : il apparaît en tête des évolutions, avant lot-5l, lot-5k et lot-5j', () => {
    const lot = { name: 'lot-6a', version: 'v0.7', date: '2026-11-07', titre: 'Premier lot de la V0.7 (fictif)', points: ['Premier point du lot de test.', 'Second point, jamais affiché.'] };
    const { siteInfo } = siteDe({ ...journal, lots: [...journal.lots, lot] });
    expect(siteInfo.evolutions[0]).toEqual({ id: 'lot-6a', title: 'Premier lot de la V0.7 (fictif)', text: 'Premier point du lot de test.', date: '2026-11-07', version: 'v0.7' });
    expect(siteInfo.evolutions.map((e) => e.id)).toEqual(['lot-6a', 'lot-5l', 'lot-5k', 'lot-5j']);
    expect(siteInfo.recette.id).toBe('v0.6');
    expect(siteInfo.precedentes.map((p) => p.id)).toEqual(['v0.5', 'v0.4', 'v0.3', 'v0.2', 'v0.1']);
    expect(validateSiteInfo(siteInfo)).toEqual({ ok: true, errors: [] });
  });
});

// Lot 5i : accueil retouché (option B) : bandeau « Recette », bouton « Jouer - <étiquette> », colonne « Toutes les versions » (carte de la version
// actuelle avec sa description complète, sans lien, puis versions précédentes), pleine hauteur. Le rendu dans le navigateur (textContent, tailles,
// hauteur) est vérifié par tests/e2e/publication.spec.js ; ici : modèle (home.js), site-info.json (assembleur), page, textes et styles.
describe('accueil retouché (lot 5i) : carte de la version actuelle, « Jouer - <étiquette> », description complète', () => {
  const D200 = 'd'.repeat(199) + 'é';
  const html = read('index.html');
  const main = read('js/accueil/main.js');
  const fr = readJson('data/i18n/fr.json');
  const en = readJson('data/i18n/en.json');
  const info = buildSiteInfo({ versions: real, dev: { present: false }, genere: GENERE });

  it('bornes : description de version 200 caractères (comme le fichier des noms), étiquette du bouton 20 caractères', () => {
    expect([MAX_DESCRIPTION, MAX_VERSION_TITLE, MAX_DESCRIPTION_NOMS]).toEqual([200, 200, 200]);
    expect(MAX_PLAY_LABEL).toBe(20);
  });

  const etiquettes = [['V0.6', 'V0.6'], ['  V0.6 bêta  ', 'V0.6 bêta'], ['é'.repeat(20), 'é'.repeat(20)], ['é'.repeat(21), 'V0.6'], ['', 'V0.6'], ['   ', 'V0.6'],
    ['a\u0007b', 'V0.6'], ['a\nb', 'V0.6'], ['a\u0085b', 'V0.6'], [undefined, 'V0.6'], [42, 'V0.6'], ['<b>V0.6</b>', '<b>V0.6</b>'], ['<img src=x onerror=alert(1)>', 'V0.6']];
  it.each(etiquettes)('playLabel(%j, "v0.6") → %j (20 caractères au plus, sinon V<id> ; HTML gardé comme texte)', (value, expected) => {
    expect(playLabel(value, 'v0.6')).toBe(expected);
  });

  it('homeModel : étiquette du bouton (≤ 20 caractères, sinon V<id>) ; la carte garde l\'étiquette complète (jusqu\'à 60)', () => {
    expect(homeModel(info)).toMatchObject({ playLabel: 'V0.5', current: { label: 'V0.5', title: real.versions.find((v) => v.id === 'v0.5').title } });
    const long = homeModel({ ...info, recette: { ...info.recette, label: 'V0.5 — un nom de 21 c' } });
    expect([...'V0.5 — un nom de 21 c']).toHaveLength(21);
    expect([long.playLabel, long.current.label, long.version]).toEqual(['V0.5', 'V0.5 — un nom de 21 c', 'V0.5 — un nom de 21 c']);
    const vingt = homeModel({ ...info, recette: { ...info.recette, label: 'V0.5 — nom de 20 car' } });
    expect([...'V0.5 — nom de 20 car']).toHaveLength(20);
    expect(vingt.playLabel).toBe('V0.5 — nom de 20 car');
    for (const bad of ['', '   ', 'a\u0007b', null]) expect(homeModel({ ...info, recette: { ...info.recette, label: bad } }).playLabel, String(bad)).toBe('V0.5');
    expect(fill(fr['home.playVersion'], { version: 'V0.6' })).toBe('Jouer - V0.6');
  });

  it('carte : description complète de 200 caractères (jamais tronquée), vide ou absente → \'\' (badge et nom seulement), HTML gardé comme texte, contrôles retirés', () => {
    expect(homeModel({ ...info, recette: { ...info.recette, title: D200 } }).current.title).toBe(D200);
    expect([...homeModel({ ...info, recette: { ...info.recette, title: `${D200}xyz` } }).current.title]).toHaveLength(200);
    expect(homeModel({ ...info, recette: { ...info.recette, title: '' } }).current).toEqual({ label: 'V0.5', title: '' });
    const sans = { ...info.recette };
    delete sans.title;
    expect(homeModel({ ...info, recette: sans }).current).toEqual({ label: 'V0.5', title: '' });
    expect(homeModel({ ...info, recette: { ...info.recette, title: 42 } }).current.title).toBe('');
    expect(homeModel({ ...info, recette: { ...info.recette, title: '<img src=x onerror=alert(1)>\u0000<b>x</b>' } }).current.title).toBe('<img src=x onerror=alert(1)> <b>x</b>');
    expect(homeModel({ ...info, recette: { ...info.recette, title: D200 } }).state).toBe('ok');
  });

  it('versions précédentes : ordre (la plus récente en haut), indisponible sans lien avec sa raison, description de 200 caractères gardée, cent versions', () => {
    const model = homeModel(buildSiteInfo({ versions: testVersions(real), dev: {}, genere: GENERE }));
    expect(model.previous.map((v) => [v.label, v.href])).toEqual([['V0.4', '../v0.4/jeu.html'], ['V0.3', '../v0.3/jeu.html'], ['V0.2', '../v0.2/jeu.html'], ['V0.1', null]]);
    expect(model.previous.at(-1).note).toBe('Version de test indisponible (jeu de versions fictif).');
    const longue = structuredClone(real);
    longue.versions.find((v) => v.id === 'v0.4').title = D200;
    const siteInfo = buildSiteInfo({ versions: longue, dev: {}, genere: GENERE });
    expect(siteInfo.precedentes[0].title).toBe(D200);
    expect(homeModel(siteInfo).previous[0].title).toBe(D200);
    expect(validateSiteInfo(siteInfo)).toEqual({ ok: true, errors: [] });
    const hundred = homeModel(buildSiteInfo({ versions: manyVersions(101), dev: {}, genere: GENERE }));
    expect(hundred.previous.map((v) => v.label)).toEqual(Array.from({ length: 100 }, (_, i) => `V0.${100 - i}`));
    expect(hundred.current.label).toBe('V0.101');
  });

  it('la version Recette change (publication suivante, sans modification de code) : la carte suit recette, l\'ancienne rejoint les versions précédentes en tête', () => {
    const v07 = { ...actuel.versions.find((v) => v.id === 'v0.6'), id: 'v0.7', label: 'V0.7', title: 'Version suivante (fictive).', ref: 'c'.repeat(40) };
    const suivante = { ...actuel, latest: 'v0.7', versions: [...actuel.versions.map((v) => (v.id === 'v0.6' ? { ...v, status: 'archive' } : v)), v07] };
    const avant = homeModel(buildSiteInfo({ versions: actuel, dev: {}, genere: GENERE }));
    const apres = homeModel(buildSiteInfo({ versions: suivante, dev: {}, genere: GENERE }));
    expect([avant.current.label, avant.playLabel, avant.previous[0].label]).toEqual(['V0.6', 'V0.6', 'V0.5']);
    expect([apres.current, apres.playLabel]).toEqual([{ label: 'V0.7', title: 'Version suivante (fictive).' }, 'V0.7']);
    expect(apres.previous.map((v) => v.label)).toEqual(['V0.6', 'V0.5', 'V0.4', 'V0.3', 'V0.2', 'V0.1']);
    expect(apres.previous[0]).toMatchObject({ title: actuel.versions.find((v) => v.id === 'v0.6').title, href: '../v0.6/jeu.html' });
  });

  it('site-info.json : recette.title = description complète du fichier des noms (200 caractères, avant : tronquée à 120) ; validateSiteInfo l\'accepte, refuse 201', () => {
    const fichier = ['[v0.5]', `description: ${D200}`, '[v0.4]', `description: ${D200}`].join('\n');
    const result = assemble({ mainDir: build(), devDir: build({ extra: { [NOMS_FICHIER]: fichier } }), archiveDir: archiveDir(), dev: DEV });
    const siteInfo = readJson(join(result.out, 'Recette/site-info.json'));
    expect(siteInfo.recette.title).toBe(D200);
    expect(siteInfo.precedentes[0].title).toBe(D200);
    expect(result.noms.applique).toBe(true);
    expect(validateSiteInfo(siteInfo)).toEqual({ ok: true, errors: [] });
    expect(validateSiteInfo({ ...siteInfo, recette: { ...siteInfo.recette, title: `${D200}x` } }).errors).toContain('recette : title invalide');
    expect(validateSiteInfo({ ...siteInfo, precedentes: [{ ...siteInfo.precedentes[0], title: `${D200}x` }] }).errors).toContain('precedentes[0] invalide');
    expect(Object.keys(siteInfo).sort()).toEqual(['dev', 'evolutions', 'genere', 'precedentes', 'recette', 'schema']); // structure inchangée
    expect(Object.keys(siteInfo.recette).sort()).toEqual(['date', 'entry', 'id', 'label', 'ref', 'title']);
  });

  it('fichier des noms du dépôt : recette.title de V0.6 = sa description complète (bloc [v0.6]), quelle que soit sa longueur (≤ 200)', () => {
    const texte = readFileSync(NOMS_FICHIER, 'utf8');
    const bloc = parseNoms(texte).blocs.find((b) => b.id === actuel.latest);
    const result = assemble({ versions: actuel, mainDir: build(), devDir: build({ extra: { [NOMS_FICHIER]: texte } }), archiveDir: archiveDir(['v0.1', 'v0.2', 'v0.3', 'v0.4', 'v0.5'], actuel), dev: DEV });
    const attendu = typeof bloc?.description === 'string' ? cleanText(bloc.description, MAX_VERSION_TITLE) : cleanText(actuel.versions.find((v) => v.id === actuel.latest).title, MAX_VERSION_TITLE);
    expect(result.siteInfo.recette.title).toBe(attendu);
    expect(result.siteInfo.recette.title.endsWith('…')).toBe(false);
    expect(validateSiteInfo(result.siteInfo)).toEqual({ ok: true, errors: [] });
  });

  it('site de test noms/ : description fictive de 200 caractères pour la Recette (V0.6), sans changer son nom', () => {
    expect([...DESCRIPTION_RECETTE_TEST]).toHaveLength(200);
    const bloc = parseNoms(NOMS_TEST).blocs.find((b) => b.id === 'v0.6');
    expect(bloc).toMatchObject({ description: DESCRIPTION_RECETTE_TEST });
    expect(bloc.nom).toBeUndefined();
  });

  it('page : bandeau « Recette » (home.badge), « Toutes les versions », carte sans lien (badge, nom, description), « Versions précédentes » en sous-titre dans la même région', () => {
    expect(html).toContain('<p class="crumb zone corner" id="version" data-i18n="home.badge"></p>');
    const region = html.slice(html.indexOf('id="versions-region"'), html.indexOf('</section>', html.indexOf('id="versions-region"')));
    const card = region.slice(region.indexOf('id="current-card"'), region.indexOf('</div>', region.indexOf('id="current-card"')));
    expect(card).toContain('data-i18n="home.currentBadge"');
    expect(card).toContain('id="current-name"');
    expect(card).toContain('id="current-text"');
    expect(card).not.toMatch(/<a\b|href=/);
    expect(region.indexOf('id="current-card"')).toBeLessThan(region.indexOf('id="previous-title"'));
    expect(region.indexOf('id="previous-title"')).toBeLessThan(region.indexOf('id="previous-list"'));
    expect(main).toContain("$('current-text').hidden = !model.current?.title;");
    expect(main).not.toMatch(/innerHTML|outerHTML|insertAdjacentHTML|\$\('version'\)/);
  });

  it('textes : home.badge, home.playVersion, home.versionsTitle, home.currentBadge (français et anglais), aucune clé orpheline', () => {
    expect([fr['home.badge'], fr['home.playVersion'], fr['home.versionsTitle'], fr['home.currentBadge'], fr['home.previousTitle']]).toEqual(['Recette', 'Jouer - {version}', 'Toutes les versions', 'Version actuelle', 'Versions précédentes']);
    for (const key of ['home.badge', 'home.playVersion', 'home.versionsTitle', 'home.currentBadge']) expect(typeof en[key], key).toBe('string');
    const keys = Object.keys(fr).filter((k) => k.startsWith('home.'));
    expect(keys.filter((k) => !main.includes(`'${k}'`) && !html.includes(`"${k}"`))).toEqual([]);
  });

  // Lot 5j-F (retours du propriétaire) : pleine hauteur dès 640 px de large, quelle que soit la hauteur (avant : dès 640 × 520) ; en paysage bas, plus de
  // hauteurs fixes pour les zones qui défilent ; plus de pied « contenu provisoire » sur l'accueil (la clé reste lue par l'atelier de l'interface).
  it('styles : pleine hauteur dès 640 px de large (zones étirées, paysage compris), carte aux jetons de l\'accueil (tokens.css, bloc isolé), description de 19 px, bouton qui passe à la ligne', () => {
    const css = read('css/accueil.css');
    const tokens = read('css/tokens.css');
    expect(css).toMatch(/@media \(min-width: 640px\) \{\n {2}\.home-grid \{\n {4}grid-template-rows: minmax\(0, 1fr\);/);
    expect(css).not.toContain('(min-height: 520px)');
    const low = css.slice(css.indexOf('@media (min-width: 640px) and (max-height: 500px)'));
    expect(low.slice(0, low.indexOf('\n}\n'))).not.toMatch(/max-height: (6|15)rem/);
    expect(read('index.html')).not.toMatch(/app\.provisional|class="foot"/);
    expect(css).toMatch(/\.home-scroll-versions \{\n {4}flex: 1 1 0;\n {4}min-height: 6rem;\n {4}max-height: none;/);
    expect(css).toMatch(/\.home-current \{[^}]*border: 2px solid var\(--home-current-border\);[^}]*background: var\(--home-current-surface\);/);
    expect(css).toMatch(/\.home-current-text \{[^}]*font-size: 1\.1875rem;/);
    expect(css).toMatch(/\.button\.play \{[^}]*max-width: 100%;/);
    expect(css).toContain('@media (min-width: 640px) and (max-height: 500px)'); // comportement d'avant gardé sous 520 px de haut
    expect(tokens).toMatch(/\/\* Accueil de la Recette \(lot 5i\)[^\n]*\*\/\n {2}--home-current-border: #[0-9a-f]{6};[^\n]*\n {2}--home-current-surface: #[0-9a-f]{6};/);
    expect(read('css/base.css')).toMatch(/min-height: calc\(100vh - 2 \* var\(--space-3\)\);\n {2}min-height: calc\(100dvh - 2 \* var\(--space-3\)\);/);
  });
});

// Lot 5l : balise de canal de jeu.html (<meta name="zs-canal" content="source">) réécrite par l'assembleur dans les copies publiées : release (Recette/),
// dev (dev/), archive (v0.N/, seulement si elle existe) ; jamais d'échec si elle manque (versions déjà archivées).
describe('assembleur : balise de canal de jeu.html (lot 5l)', () => {
  const META = (canal) => `<meta name="zs-canal" content="${canal}">`;
  const page = (canal, title = 'jeu') => `<!doctype html><html lang="fr"><head><meta charset="utf-8">\n  ${META(canal)}\n<title>${title}</title></head><body></body></html>`;
  // Archive « réelle » : une version archivée après ce lot (sa page porte la balise du dépôt : source).
  const archiveWithMeta = (ids) => {
    const dir = archiveDir(ids);
    for (const id of ids) writeFileSync(join(dir, id, 'jeu.html'), page('source', `archive ${id}`));
    return dir;
  };
  const canalOf = (html) => [...html.matchAll(/<meta name="zs-canal" content="([^"]*)">/g)].map((m) => m[1]);

  it('jeu.html du dépôt : une seule balise, de la forme exacte reconnue par l\'assembleur, canal « source »', () => {
    const html = read('jeu.html');
    expect(html.match(CANAL_META_RE)).toEqual([META('source')]);
    expect(canalOf(html)).toEqual(['source']);
  });

  it('chaque dossier publié a son canal : Recette/ release, dev/ dev, v0.N/ archive ; le reste de la page est identique octet pour octet', () => {
    const main = build({ extra: { 'jeu.html': page('source', 'main') } });
    const dev = build({ extra: { 'jeu.html': page('source', 'dev') } });
    const arch = archiveWithMeta(['v0.3', 'v0.4']);
    const result = assemble({ mainDir: main, devDir: dev, archiveDir: arch, dev: DEV });
    const dir = result.out;
    expect(read(join(dir, 'Recette/jeu.html'))).toBe(page('release', 'main'));
    expect(read(join(dir, 'dev/jeu.html'))).toBe(page('dev', 'dev'));
    expect(read(join(dir, 'v0.4/jeu.html'))).toBe(page('archive', 'archive v0.4'));
    expect(read(join(dir, 'v0.3/jeu.html'))).toBe(page('archive', 'archive v0.3'));
    expect(result.canaux).toEqual({ 'Recette/': true, 'dev/': true, 'v0.3/': true, 'v0.4/': true });
    // Sources jamais modifiées.
    expect(read(join(main, 'jeu.html'))).toBe(page('source', 'main'));
    expect(read(join(arch, 'v0.4/jeu.html'))).toBe(page('source', 'archive v0.4'));
  });

  it('version déjà archivée, sans balise : v0.N/ identique octet pour octet (aucune écriture, aucune erreur) ; idem pour une Recette sans balise', () => {
    const arch = archiveDir(['v0.1', 'v0.2']);
    const result = assemble({ mainDir: build(), archiveDir: arch });
    for (const id of ['v0.1', 'v0.2']) {
      expect(walk(join(result.out, id)).sort()).toEqual(walk(join(arch, id)).sort());
      for (const f of walk(join(arch, id))) expect(readFileSync(join(result.out, id, f)).equals(readFileSync(join(arch, id, f))), `${id}/${f}`).toBe(true);
    }
    expect(read(join(result.out, 'Recette/jeu.html'))).not.toContain('zs-canal');
    expect(result.canaux).toEqual({ 'Recette/': false, 'v0.1/': false, 'v0.2/': false });
  });

  it('v0.N/ : seule la balise change (autres fichiers et autres octets de la page identiques)', () => {
    const arch = archiveWithMeta(['v0.2']);
    const { out: dir } = assemble({ mainDir: build(), archiveDir: arch });
    for (const f of walk(join(arch, 'v0.2')).filter((x) => x !== 'jeu.html')) expect(readFileSync(join(dir, 'v0.2', f)).equals(readFileSync(join(arch, 'v0.2', f))), f).toBe(true);
    expect(read(join(dir, 'v0.2/jeu.html')).replace(META('archive'), META('source'))).toBe(read(join(arch, 'v0.2/jeu.html')));
  });

  it('ecrireCanal : toutes les occurrences, canaux connus seulement ; entrées hostiles inchangées', () => {
    expect(CANAUX_PUBLIES).toEqual(['release', 'dev', 'archive', 'prod']);
    expect(ecrireCanal(`${META('source')}x${META('dev')}`, 'prod')).toBe(`${META('prod')}x${META('prod')}`);
    for (const bad of ['source', 'Release', '', 'dev"><script>', null, 3]) expect(ecrireCanal(page('source'), bad), String(bad)).toBe(page('source'));
    for (const html of [null, undefined, 42, {}]) expect(ecrireCanal(html, 'dev')).toBe(html);
    // Formes non reconnues (attributs dans un autre ordre, guillemets simples, valeur hors [a-z]) : inchangées.
    for (const other of ['<meta content="source" name="zs-canal">', "<meta name='zs-canal' content='source'>", '<meta name="zs-canal" content="sou rce">', '<meta name="zs-canal" content="x"/>']) {
      expect(ecrireCanal(other, 'release')).toBe(other);
    }
  });

  it('fichiers hostiles : absent, dossier, lien symbolique, binaire, trop gros, sans balise : jamais d\'exception ; rien d\'écrit sauf la balise', () => {
    n += 1;
    const dir = join(ROOT, `hostile-${n}`);
    mkdirSync(join(dir, 'dossier.html'), { recursive: true });
    expect(ecrireCanalFichier(join(dir, 'absent.html'), 'dev')).toBe(false);
    expect(ecrireCanalFichier(join(dir, 'dossier.html'), 'dev')).toBe(false);
    const outside = join(dir, 'hors-du-site.html');
    writeFileSync(outside, page('source'));
    symlinkSync(outside, join(dir, 'lien.html'));
    expect(ecrireCanalFichier(join(dir, 'lien.html'), 'dev')).toBe(false);
    expect(read(outside)).toBe(page('source'));
    // Octets qui ne sont pas de l'UTF-8 valide autour de la balise : seuls les octets de la valeur changent.
    const bytes = Buffer.concat([Buffer.from([0xff, 0xfe, 0x00, 0xc3]), Buffer.from(META('source')), Buffer.from([0x80, 0x00, 0xe9])]);
    writeFileSync(join(dir, 'binaire.html'), bytes);
    expect(ecrireCanalFichier(join(dir, 'binaire.html'), 'release')).toBe(true);
    expect(readFileSync(join(dir, 'binaire.html')).equals(Buffer.concat([Buffer.from([0xff, 0xfe, 0x00, 0xc3]), Buffer.from(META('release')), Buffer.from([0x80, 0x00, 0xe9])]))).toBe(true);
    const big = `${META('source')}${'x'.repeat(4 * 1024 * 1024)}`;
    writeFileSync(join(dir, 'gros.html'), big);
    expect(ecrireCanalFichier(join(dir, 'gros.html'), 'dev')).toBe(false);
    expect(read(join(dir, 'gros.html')).startsWith(META('source'))).toBe(true);
    writeFileSync(join(dir, 'sans.html'), '<!doctype html><title>x</title>');
    expect(ecrireCanalFichier(join(dir, 'sans.html'), 'dev')).toBe(false);
    expect(ecrireCanalFichier(join(dir, 'sans.html'), 'inconnu')).toBe(false);
  });

  it('dev/ sans build : aucune page de jeu, aucun canal écrit ; l\'assemblage n\'échoue jamais pour une balise', () => {
    const result = assemble({ mainDir: build({ extra: { 'jeu.html': page('source') } }) });
    expect(result.canaux).toEqual({ 'Recette/': true });
    expect(existsSync(join(result.out, 'dev/jeu.html'))).toBe(false);
  });
});
