import { describe, it, expect, afterAll } from 'vitest';
import { execSync } from 'node:child_process';
import { existsSync, readdirSync, rmSync } from 'node:fs';

describe('npm run build', () => {
  execSync('npm run build', { stdio: 'pipe' });
  afterAll(() => rmSync('_site', { recursive: true, force: true }));

  it('produit _site avec les dossiers du site', () => {
    for (const p of ['index.html', 'dev/index.html', 'dev/dev.js', 'css/tokens.css', 'js/main.js', 'data/i18n/fr.json', 'fonts', 'jeu.html', 'apercu.txt', 'vendor/phaser.min.js', 'js/game/main.js', 'js/core/vec.js', 'data/game/room.json']) {
      expect(existsSync(`_site/${p}`), p).toBe(true);
    }
  });

  it('n\'y met ni Docs, ni tests, ni node_modules, ni fichiers de configuration', () => {
    const top = readdirSync('_site');
    for (const bad of ['Docs', 'tests', 'node_modules', 'package.json', 'CLAUDE.md', '.github', 'scripts']) {
      expect(top).not.toContain(bad);
    }
  });
});
