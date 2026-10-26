import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';

const walk = (dir) => (existsSync(dir) ? readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(`${dir}/${e.name}`) : [`${dir}/${e.name}`])) : []);
const jsFiles = walk('js/test3d').filter((f) => f.endsWith('.js'));
const pageFiles = [...jsFiles, ...walk('test3d'), 'css/test3d.css'].filter(existsSync);
const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
const COLOR = /#[0-9a-fA-F]{3,8}\b|\b(?:rgb|rgba|hsl|hsla|hwb|lab|lch|oklab|oklch)\(/;

describe('hygiène du test 3D', () => {
  it('js/test3d/ contient les fichiers attendus', () => {
    for (const f of ['pose', 'stats', 'textes', 'palette', 'floor']) expect(jsFiles).toContain(`js/test3d/${f}.js`);
  });

  it('aucun Math.random', () => {
    for (const f of jsFiles) expect(readFileSync(f, 'utf8'), f).not.toMatch(/Math\.random/);
  });

  it('Date.now seulement dans report.js', () => {
    for (const f of jsFiles.filter((n) => !n.endsWith('/report.js'))) expect(readFileSync(f, 'utf8'), f).not.toMatch(/Date\.now|new Date\(\)/);
  });

  it('aucune couleur en dur dans js/test3d/, test3d/ ni css/test3d.css', () => {
    for (const f of pageFiles) expect(readFileSync(f, 'utf8'), f).not.toMatch(COLOR);
  });

  it('aucune URL externe dans js/test3d/ et test3d/', () => {
    for (const f of pageFiles) expect(readFileSync(f, 'utf8'), f).not.toMatch(/https?:\/\/|\/\/cdn|@import\s+url/i);
  });

  it('les jetons --t3d-* sont des couleurs hexadécimales dans tokens.css', () => {
    const tokens = readFileSync('css/tokens.css', 'utf8');
    const found = [...tokens.matchAll(/--t3d-([a-z-]+):\s*([^;]+);/g)];
    expect(found.length).toBeGreaterThanOrEqual(20);
    for (const [, name, value] of found) expect(value.trim(), name).toMatch(/^#[0-9a-fA-F]{6}$/);
  });

  it('chaque jeton lu par palette.js existe dans tokens.css', () => {
    const tokens = readFileSync('css/tokens.css', 'utf8');
    const names = [...readFileSync('js/test3d/palette.js', 'utf8').match(/const NAMES = \[([\s\S]*?)\];/)[1].matchAll(/'([a-z-]+)'/g)].map((m) => m[1]);
    for (const n of names) expect(tokens, n).toContain(`--t3d-${n}:`);
  });

  it('js/core/ n\'importe rien de js/test3d/ (sens unique)', () => {
    for (const f of walk('js/core')) expect(readFileSync(f, 'utf8'), f).not.toMatch(/test3d/);
  });
});

describe('Three.js vendoré', () => {
  it('est une devDependency à version exacte, sans dépendance d\'exécution', () => {
    expect(pkg.devDependencies.three).toMatch(/^\d+\.\d+\.\d+$/);
    expect(pkg.dependencies ?? {}).toEqual({});
    expect(pkg.scripts['vendor:three']).toBeTruthy();
    expect(pkg.scripts.vendor).toBe('node scripts/vendor.mjs');
  });

  it('vendor/three/ est présent, avec sa licence, et pèse moins de 5 Mo', () => {
    for (const f of ['three.module.js', 'three.core.js', 'LICENSE-three.txt', 'version.json']) expect(existsSync(`vendor/three/${f}`), f).toBe(true);
    const sizes = readdirSync('vendor/three').map((f) => statSync(`vendor/three/${f}`).size);
    expect(sizes.reduce((a, b) => a + b, 0)).toBeLessThan(5 * 1024 * 1024);
    for (const s of sizes) expect(s).toBeLessThan(5 * 1024 * 1024);
    expect(readFileSync('vendor/three/LICENSE-three.txt', 'utf8')).toMatch(/MIT/);
  });

  it('la version vendorée correspond à la version épinglée et au paquet installé', () => {
    const vendored = JSON.parse(readFileSync('vendor/three/version.json', 'utf8'));
    expect(vendored.version).toBe(pkg.devDependencies.three);
    expect(JSON.parse(readFileSync('node_modules/three/package.json', 'utf8')).version).toBe(pkg.devDependencies.three);
    expect(readFileSync('vendor/three/three.module.js').equals(readFileSync('node_modules/three/build/three.module.js'))).toBe(true);
    expect(readFileSync('vendor/three/three.core.js').equals(readFileSync('node_modules/three/build/three.core.js'))).toBe(true);
  });

  it('les deux fichiers de module s\'importent par chemin relatif', () => {
    expect(readFileSync('vendor/three/three.module.js', 'utf8')).toContain("from './three.core.js'");
  });
});
