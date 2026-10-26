import { describe, it, expect } from 'vitest';
import { existsSync, readdirSync, statSync } from 'node:fs';

const PATHS = [
  'index.html', 'css', 'css/tokens.css', 'css/base.css', 'js/main.js', 'js/i18n.js', 'js/page.js', 'js/lots.js', 'js/splat.js', 'dev/index.html', 'dev/dev.js', 'scripts/assemble.mjs', 'data/i18n/fr.json', 'data/i18n/en.json', 'js', 'js/core', 'js/game', 'js/save', 'data/i18n', 'fonts', 'vendor',
  'tests/unit', 'tests/e2e', 'Docs/seed.md', 'Docs/ref/environnement.md', 'Docs/ref/conventions.md',
  'Docs/lots', 'CLAUDE.md', 'package.json', 'package-lock.json', 'eslint.config.js',
  'vitest.config.js', 'playwright.config.js',
];
describe('structure du dépôt', () => {
  it.each(PATHS)('%s existe', (p) => {
    expect(existsSync(p)).toBe(true);
  });

  // Le propriétaire a rempli le seed après le lot 0-A : on exige seulement qu'il existe.
  it('Docs/seed.md existe et est un fichier', () => {
    expect(statSync('Docs/seed.md').isFile()).toBe(true);
  });

  it('les dossiers sans contenu portent un .gitkeep', () => {
    for (const d of ['js/core', 'js/game', 'js/save', 'fonts', 'vendor', 'tests/e2e', 'Docs/lots']) {
      expect(existsSync(`${d}/.gitkeep`) || readdirSync(d).length > 0, d).toBe(true);
    }
  });
});
