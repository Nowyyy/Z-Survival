// Lot 9f (Docs/ref/cache.md) : adresses à l'empreinte du déploiement dans le site construit (scripts/site/empreinte.mjs, scripts/build.mjs) :
// réécriture de chaque forme d'adresse, contrôle bloquant (adresse oubliée, forme dynamique, déclaration inutile), version du build.
import { describe, it, expect, afterAll } from 'vitest';
import { execFileSync, spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  adressesSansEmpreinte, appliquerEmpreintes, cibleExiste, controlerEmpreintes, DECLARATIONS, ecrireVersionMeta, reecrire, versionDuBuild,
} from '../../scripts/site/empreinte.mjs';

const TMP = mkdtempSync(join(tmpdir(), 'zs-test-empreinte-'));
afterAll(() => rmSync(TMP, { recursive: true, force: true }));

const FICHIERS = new Set(['js/a.js', 'js/b.js', 'js/menu/c.js', 'data/x.json', 'data/t.txt', 'css/s.css', 'fonts/f.woff2', 'assets/l.svg', 'vendor/three/three.module.js', 'vendor/three/three.core.js']);
const existe = (p) => FICHIERS.has(p);
const V = 'abc1234';

describe('réécriture des adresses (empreinte)', () => {
  it('imports statiques et dynamiques, relatifs au module', () => {
    const src = "import { x } from './b.js';\nexport * from \"./menu/c.js\";\nconst m = await import('./menu/c.js');\nimport('../vendor/three/three.core.js');";
    const out = reecrire(src, 'js/a.js', V, existe);
    expect(out).toContain("from './b.js?v=abc1234'");
    expect(out).toContain('from "./menu/c.js?v=abc1234"');
    expect(out).toContain("import('./menu/c.js?v=abc1234')");
    expect(out).toContain("import('../vendor/three/three.core.js?v=abc1234')");
  });

  it('fetch, préchargements et sélecteurs relatifs à la page ; gabarits ; requête existante complétée par &v=', () => {
    const src = "fetch('data/x.json'); l.href = 'css/s.css'; q('link[href=\"css/s.css\"]'); fetch(`${dir}/x.json`); fetch(`build-info.json?r=${Date.now()}`); const a = 'assets/l.svg';";
    const out = reecrire(src, 'js/menu/c.js', V, existe);
    expect(out).toContain("fetch('data/x.json?v=abc1234')");
    expect(out).toContain("l.href = 'css/s.css?v=abc1234'");
    expect(out).toContain('link[href="css/s.css?v=abc1234"]');
    expect(out).toContain('fetch(`${dir}/x.json?v=abc1234`)');
    expect(out).toContain('fetch(`build-info.json?r=${Date.now()}&v=abc1234`)');
    expect(out).toContain("'assets/l.svg?v=abc1234'");
  });

  it('calculateurs : new URL(…, import.meta.url)', () => {
    expect(reecrire("new Worker(new URL('./b.js', import.meta.url), { type: 'module' })", 'js/a.js', V, existe)).toContain("new URL('./b.js?v=abc1234', import.meta.url)");
  });

  it('pages : src, href, carte d\'imports, url() des styles en ligne ; pages .html, fragments, data:, adresses absolues intactes', () => {
    const html = '<script type="importmap">{"imports":{"three":"./vendor/three/three.module.js"}}</script><link rel="stylesheet" href="css/s.css">'
      + '<script type="module" src="js/a.js"></script><a href="jeu.html">J</a><a href="../dev/jeu.html">D</a><a href="#x">X</a><link rel="icon" href="data:image/png;base64,AA">'
      + '<a href="https://example.invalid/data/x.json">E</a><link href="/data/x.json"><style>.a{background:url("assets/l.svg")}</style><link rel="preload" href="site-info.json">';
    const out = reecrire(html, 'index.html', V, existe);
    expect(out).toContain('"./vendor/three/three.module.js?v=abc1234"');
    expect(out).toContain('href="css/s.css?v=abc1234"');
    expect(out).toContain('src="js/a.js?v=abc1234"');
    expect(out).toContain('href="jeu.html"');
    expect(out).toContain('href="../dev/jeu.html"');
    expect(out).toContain('href="#x"');
    expect(out).toContain('href="data:image/png;base64,AA"');
    expect(out).toContain('href="https://example.invalid/data/x.json"');
    expect(out).toContain('href="/data/x.json"');
    expect(out).toContain('url("assets/l.svg?v=abc1234")');
    expect(out).toContain('href="site-info.json?v=abc1234"'); // fichier écrit par l'assembleur
  });

  it('feuilles de styles : url() relatives au fichier ; fragments SVG intacts', () => {
    const css = '@font-face{src:url("../fonts/f.woff2") format("woff2")}.a{filter:url("#torn")}.b{mask:url(#m)}.c{background:url(../assets/l.svg)}';
    const out = reecrire(css, 'css/s.css', V, existe);
    expect(out).toContain('url("../fonts/f.woff2?v=abc1234")');
    expect(out).toContain('url("#torn")');
    expect(out).toContain('url(#m)');
    expect(out).toContain('url(../assets/l.svg?v=abc1234)');
  });

  it('idempotente ; une chaîne qui ne vise aucun fichier du site reste telle quelle', () => {
    const src = "import './b.js'; t('game.wave.hudOf'); const n = 'material_8.jpg'; fetch('data/absent.json');";
    const once = reecrire(src, 'js/a.js', V, existe);
    expect(reecrire(once, 'js/a.js', V, existe)).toBe(once);
    expect(once).toContain("'game.wave.hudOf'");
    expect(once).toContain("'material_8.jpg'");
    expect(once).toContain("fetch('data/absent.json')");
  });

  it('cible : depuis le fichier, depuis la racine, fichiers générés ; jamais hors du site', () => {
    expect(cibleExiste('./b.js', 'js/a.js', existe)).toBe(true);
    expect(cibleExiste('data/x.json', 'js/menu/c.js', existe)).toBe(true);
    expect(cibleExiste('build-info.json', 'js/menu/c.js', existe)).toBe(true);
    expect(cibleExiste('../../data/x.json', 'index.html', existe)).toBe(false);
    expect(cibleExiste('data/absent.json', 'js/a.js', existe)).toBe(false);
  });

  it('balise de version de jeu.html', () => {
    expect(ecrireVersionMeta('<meta name="zs-version" content="">', V)).toBe('<meta name="zs-version" content="abc1234">');
  });
});

describe('contrôle bloquant (adresses sans empreinte)', () => {
  it('adresse oubliée, fichier absent, suffixe, préfixe de dossier, url() : chacune signalée', () => {
    const src = "fetch('data/x.json'); fetch('data/absent.json'); fetch('data/' + n + '.json'); const D = 'data/game/';";
    const formes = adressesSansEmpreinte(src, 'js/a.js', existe).map((r) => r.forme).sort();
    expect(formes).toEqual(['adresse', 'inconnue', 'prefixe', 'prefixe', 'suffixe'].sort());
    expect(adressesSansEmpreinte('.a{background:url(../assets/l.svg)}', 'css/s.css', existe).map((r) => r.forme)).toEqual(['css']);
  });

  it('une adresse à l\'empreinte et un lien de page ne sont pas signalés', () => {
    expect(adressesSansEmpreinte("fetch('data/x.json?v=abc1234'); a.href = 'jeu.html'; b.href = 'jeu.html?test=1'", 'js/a.js', existe)).toEqual([]);
  });

  it('déclarations : une forme déclarée passe, une déclaration inutile est signalée', () => {
    const entrees = [{ fichier: 'js/a.js', texte: "'data/game'", forme: 'prefixe' }, { fichier: 'js/b.js', texte: "'data/x.json'", forme: 'adresse' }];
    const decl = [{ fichier: 'js/a.js', texte: "'data/game'", raison: 'test' }, { fichier: 'js/z.js', formes: ['inconnue'], raison: 'test' }];
    const { restes, inutiles } = controlerEmpreintes(entrees, decl);
    expect(restes).toEqual([entrees[1]]);
    expect(inutiles).toEqual([decl[1]]);
    expect(controlerEmpreintes(entrees, decl, ['js/a.js', 'js/b.js']).inutiles).toEqual([]); // fichier absent du site : déclaration sans objet
  });

  it('chaque déclaration du site a sa raison', () => {
    for (const d of DECLARATIONS) {
      expect(d.raison.length, d.fichier).toBeGreaterThan(10);
      expect(Boolean(d.texte) !== Boolean(d.formes), d.fichier).toBe(true);
    }
  });

  it('npm run build échoue sur une forme non reconnue (site minimal)', () => {
    const dir = join(TMP, 'refus');
    mkdirSync(join(dir, 'scripts/site'), { recursive: true });
    mkdirSync(join(dir, 'js'), { recursive: true });
    cpSync('scripts/build.mjs', join(dir, 'scripts/build.mjs'));
    cpSync('scripts/site/empreinte.mjs', join(dir, 'scripts/site/empreinte.mjs'));
    writeFileSync(join(dir, 'jeu.html'), '<!doctype html><meta name="zs-version" content=""><script type="module" src="js/main.js"></script>');
    writeFileSync(join(dir, 'js/main.js'), "const n = 'x';\nfetch('data/menu/' + n + '.json');\n");
    const env = { ...process.env, ZS_BUILD_SHA: '1234567' };
    const refus = spawnSync('node', ['scripts/build.mjs'], { cwd: dir, encoding: 'utf8', env });
    expect(refus.status).toBe(1);
    expect(refus.stderr).toMatch(/Adresse sans empreinte \(suffixe\) : js\/main\.js/);
    expect(refus.stderr).toMatch(/Adresse sans empreinte \(prefixe\) : js\/main\.js/);
    writeFileSync(join(dir, 'js/main.js'), "export const n = 'x';\n");
    const ok = spawnSync('node', ['scripts/build.mjs'], { cwd: dir, encoding: 'utf8', env });
    expect(ok.status, ok.stderr).toBe(0);
    expect(readFileSync(join(dir, '_site/jeu.html'), 'utf8')).toContain('<meta name="zs-version" content="1234567"><script type="module" src="js/main.js?v=1234567">');
    expect(readFileSync(join(dir, 'jeu.html'), 'utf8')).toContain('src="js/main.js"'); // source intacte
  });
});

describe('version du build', () => {
  it('ZS_BUILD_SHA (archiveur, sites de test) : 7 premiers caractères', () => {
    expect(versionDuBuild({ env: { ZS_BUILD_SHA: 'ABCDEF1234567890abcdef1234567890abcdef12' }, cwd: TMP })).toEqual({ version: 'abcdef1', source: 'ZS_BUILD_SHA' });
  });

  it('dépôt git : commit de l\'arbre construit', () => {
    const head = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
    expect(versionDuBuild({ env: {}, cwd: process.cwd() })).toEqual({ version: head.slice(0, 7), source: 'git' });
  });

  it('sans git ni variable : empreinte du contenu (stable, change avec le contenu)', () => {
    const a = versionDuBuild({ env: {}, cwd: TMP, contenu: [['a.js', Buffer.from('1')]] });
    expect(a.source).toBe('contenu');
    expect(a.version).toMatch(/^[0-9a-f]{7}$/);
    expect(versionDuBuild({ env: {}, cwd: TMP, contenu: [['a.js', Buffer.from('1')]] }).version).toBe(a.version);
    expect(versionDuBuild({ env: {}, cwd: TMP, contenu: [['a.js', Buffer.from('2')]] }).version).not.toBe(a.version);
  });
});

describe('site construit complet (npm run build)', () => {
  const dir = join(TMP, 'site');
  it('aucune adresse relative sans empreinte ; la réécriture appliquée deux fois ne change rien', () => {
    execFileSync('node', ['scripts/build.mjs'], { stdio: 'pipe' });
    cpSync('_site', dir, { recursive: true });
    rmSync('_site', { recursive: true, force: true });
    const head = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim().slice(0, 7);
    const jeu = readFileSync(join(dir, 'jeu.html'), 'utf8');
    expect(jeu).toContain(`<meta name="zs-version" content="${head}">`);
    expect(jeu).toContain(`{"imports":{"three":"./vendor/three/three.module.js?v=${head}"}}`);
    expect(jeu).toContain(`<script type="module" src="js/menu/demarrage.js?v=${head}"></script>`);
    expect(readFileSync(join(dir, 'vendor/three/three.module.js'), 'utf8')).toContain(`'./three.core.js?v=${head}'`);
    expect(readFileSync(join(dir, 'css/base.css'), 'utf8')).toContain(`url("../fonts/barlow-latin-400-normal.woff2?v=${head}")`);
    const again = appliquerEmpreintes(dir, { env: { ZS_BUILD_SHA: head } });
    expect(again.restes).toEqual([]);
    expect(again.inutiles).toEqual([]);
    expect(again.reecrits).toBe(0);
  });
});
