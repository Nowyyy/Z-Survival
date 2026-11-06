// Lot 4c-C : assembleur du site, accueil (js/accueil/home.js), workflow, scripts et hygiène.
// Lot 5g : nouvelle organisation (racine « en construction », Recette/ = main, dev/ = dev, redirections next/ et lots/, archives v0.N/ inchangées),
// site-info.json (scripts/site/site-info.mjs) ; le journal /dev (dev/index.html, dev/dev.js) et ses tests sont supprimés.
import { describe, it, expect, afterAll } from 'vitest';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  AssembleError, SITE_TEXT_DEFAULTS, assembleSite, buildInfo, constructionPage, dirStats, messagePage, parseOptions, redirectPage, siteIcon, siteTexts, utcDate,
} from '../../scripts/assemble.mjs';
import { MAX_EVOLUTIONS, buildSiteInfo, cleanText, readEvolutions, readPrevious, validateSiteInfo } from '../../scripts/site/site-info.mjs';
import { DEV_HREF, MAX_PREVIOUS, fill, formatDate, homeModel, previousHref, readPrevious as readPreviousHome, safePath, text as textHome } from '../../js/accueil/home.js';
import { fakeArchive, manyVersions, testVersions } from '../../scripts/site/e2e-site.mjs';
import { findNonRelative } from '../../scripts/versions/links.mjs';

const ROOT = mkdtempSync(join(tmpdir(), 'zs-test-publication-'));
afterAll(() => rmSync(ROOT, { recursive: true, force: true }));
const real = JSON.parse(readFileSync('versions.json', 'utf8'));
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

  it('premier niveau : index.html, Recette/, dev/, next/, lots/ et les archives v0.1 à v0.4, rien d\'autre', () => {
    expect(readdirSync(dir).sort()).toEqual(['Recette', 'dev', 'index.html', 'lots', 'next', 'v0.1', 'v0.2', 'v0.3', 'v0.4']);
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
      expect(homeModel(bad), JSON.stringify(bad)).toEqual({ state: 'error', version: '', play: 'jeu.html', dev: { present: true, href: '../dev/jeu.html', sha: '', date: '' }, evolutions: [], previous: [] });
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
    for (const [id, title] of [['evolutions-region', 'evolutions-title'], ['previous-region', 'previous-title']]) {
      expect(html).toMatch(new RegExp(`id="${id}" role="region" tabindex="0" aria-labelledby="${title}"`));
    }
    const columns = html.split('<div class="home-col">');
    expect(columns).toHaveLength(3);
    expect(columns[1]).toContain('evolutions-region');
    expect(columns[2]).toContain('previous-region');
    expect(html).not.toMatch(/journal|dev\/"|next\//i);
  });

  it('<noscript> : message bilingue et liens statiques vers jeu.html et ../dev/jeu.html (avant le lot 5g : jeu.html, next/, dev/)', () => {
    const noscript = html.slice(html.indexOf('<noscript>'), html.indexOf('</noscript>'));
    expect(noscript).toContain('Ce jeu a besoin de JavaScript. / This game needs JavaScript.');
    expect([...noscript.matchAll(/href="([^"]+)"/g)].map((m) => m[1])).toEqual(['jeu.html', '../dev/jeu.html']);
  });

  it('textes de l\'accueil et des pages produites dans fr.json (et en.json) ; plus de clé du journal ni du bandeau de next/', () => {
    expect(fr['home.version']).toBe('{channel} · Version {version}');
    expect(fr['home.channel.recette']).toBe('Recette'); // main = Recette (demande du propriétaire)
    expect(fr['home.play']).toBe('Jouer');
    expect(fr['home.next']).toBe('Dernier build de développement');
    expect(fr['home.nextNone']).toBe('Aucun build de développement pour l\'instant');
    expect(fr['home.evolutionsTitle']).toBe('Évolutions en cours de développement');
    expect(fr['home.evolutionsNone']).toBe('Aucune évolution depuis la version Recette.');
    expect(fr['home.previousTitle']).toBe('Versions précédentes');
    for (const gone of ['home.journal', 'home.devBanner', 'home.channel.dev', 'site.lots.retired', 'site.next.none']) expect([fr[gone], en[gone]], gone).toEqual([undefined, undefined]);
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
    expect(css).toMatch(/\.home-scroll-previous \{\n {2}max-height: /);
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
