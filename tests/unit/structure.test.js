import { describe, it, expect } from 'vitest';
import { existsSync, readdirSync, statSync } from 'node:fs';

const PATHS = [
  'index.html', 'css', 'js', 'js/core', 'js/game', 'js/save', 'data/i18n', 'fonts', 'vendor',
  'tests/unit', 'tests/e2e', 'Docs/seed.md', 'Docs/ref/environnement.md', 'Docs/ref/conventions.md',
  'Docs/lots', 'CLAUDE.md', 'package.json', 'package-lock.json', 'eslint.config.js',
  'vitest.config.js', 'playwright.config.js',
];
describe('structure du dépôt', () => {
  it.each(PATHS)('%s existe', (p) => {
    expect(existsSync(p)).toBe(true);
  });

  it('Docs/seed.md est vide (zéro octet)', () => {
    expect(statSync('Docs/seed.md').size).toBe(0);
  });

  it('les dossiers sans contenu portent un .gitkeep', () => {
    for (const d of ['js/core', 'js/game', 'js/save', 'fonts', 'vendor', 'tests/e2e', 'Docs/lots']) {
      expect(existsSync(`${d}/.gitkeep`) || readdirSync(d).length > 0, d).toBe(true);
    }
  });
});
