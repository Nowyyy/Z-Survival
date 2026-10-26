import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';

const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
const installed = JSON.parse(readFileSync('node_modules/three/package.json', 'utf8'));

describe('Three.js vendoré', () => {
  it('est une devDependency à version exacte, jamais une dépendance d\'exécution', () => {
    expect(pkg.devDependencies.three).toMatch(/^\d+\.\d+\.\d+$/);
    expect(pkg.dependencies ?? {}).toEqual({});
  });

  it('la version installée, celle de vendor/three/version.json et celle de package.json sont la même (0.186.1)', () => {
    expect(installed.version).toBe(pkg.devDependencies.three);
    const meta = JSON.parse(readFileSync('vendor/three/version.json', 'utf8'));
    expect(meta).toEqual({ version: '0.186.1', license: 'MIT' });
    expect(pkg.devDependencies.three).toBe('0.186.1');
  });

  it('les fichiers copiés sont identiques à ceux du paquet et la licence est à côté', () => {
    for (const file of ['three.module.js', 'three.core.js']) {
      expect(readFileSync(`vendor/three/${file}`).equals(readFileSync(`node_modules/three/build/${file}`)), file).toBe(true);
    }
    expect(readFileSync('vendor/three/LICENSE-three.txt', 'utf8')).toMatch(/MIT|Permission is hereby granted/);
    expect(pkg.scripts['vendor:three']).toBeTruthy();
  });

  it('vendor/ ne contient que Three.js (aucun fichier de plus de 5 Mo)', () => {
    const entries = readdirSync('vendor').filter((e) => e !== '.gitkeep');
    expect(entries).toEqual(['three']);
    for (const f of readdirSync('vendor/three')) expect(statSync(`vendor/three/${f}`).size, f).toBeLessThan(5 * 1024 * 1024);
  });

  it('jeu.html charge Three.js par une importmap locale, sans CDN', () => {
    const html = readFileSync('jeu.html', 'utf8');
    expect(html).toMatch(/<script type="importmap">\s*\{"imports":\{"three":"\.\/vendor\/three\/three\.module\.js"\}\}\s*<\/script>/);
    expect(html).not.toMatch(/https?:\/\//);
    expect(existsSync('vendor/three/three.module.js')).toBe(true);
  });

  it('l\'importmap précède tous les scripts modules de jeu.html', () => {
    const html = readFileSync('jeu.html', 'utf8');
    expect(html.indexOf('type="importmap"')).toBeLessThan(html.indexOf('type="module"'));
  });
});
