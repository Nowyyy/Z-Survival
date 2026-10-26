import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync, statSync } from 'node:fs';

const pkg = JSON.parse(readFileSync('package.json', 'utf8'));

describe('Phaser vendoré', () => {
  it('est la seule nouvelle devDependency, à version exacte, et pas une dépendance d\'exécution', () => {
    expect(pkg.devDependencies.phaser).toMatch(/^\d+\.\d+\.\d+$/);
    expect(pkg.dependencies ?? {}).toEqual({});
  });

  it('vendor/phaser.min.js existe et pèse moins de 5 Mo', () => {
    expect(existsSync('vendor/phaser.min.js')).toBe(true);
    expect(statSync('vendor/phaser.min.js').size).toBeLessThan(5 * 1024 * 1024);
  });

  it('correspond à la version épinglée', () => {
    const installed = JSON.parse(readFileSync('node_modules/phaser/package.json', 'utf8')).version;
    expect(installed).toBe(pkg.devDependencies.phaser);
    expect(readFileSync('vendor/phaser.min.js').equals(readFileSync('node_modules/phaser/dist/phaser.min.js'))).toBe(true);
    expect(readFileSync('vendor/phaser.min.js', 'utf8')).toContain(pkg.devDependencies.phaser);
  });

  it('a sa licence à côté et un script npm run vendor', () => {
    expect(readFileSync('vendor/LICENSE-phaser.txt', 'utf8')).toMatch(/MIT/);
    expect(pkg.scripts.vendor).toBeTruthy();
  });
});
