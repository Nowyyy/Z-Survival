import { describe, it, expect, afterAll } from 'vitest';
import { execSync } from 'node:child_process';
import { existsSync, readdirSync, rmSync } from 'node:fs';

describe('npm run build', () => {
  execSync('npm run build', { stdio: 'pipe' });
  afterAll(() => rmSync('_site', { recursive: true, force: true }));

  it('produit _site avec les dossiers du site', () => {
    for (const p of ['index.html', 'css/tokens.css', 'js/main.js', 'data/i18n/fr.json', 'fonts', 'jeu.html', 'sons.html', 'sauvegarde.html', 'css/sauvegarde.css', 'js/sauvegarde/main.js', 'js/save/local-repository.js', 'css/sons.css', 'js/sons/main.js', 'apercu.txt', 'vendor/three/three.module.js', 'vendor/three/three.core.js', 'vendor/three/LICENSE-three.txt', 'vendor/three/version.json', 'data/game/render.json', 'js/game/world.js', 'js/game/main.js', 'js/core/vec.js', 'data/game/world.json', 'assets/studio/no-way-studio-logo-anime.svg', 'assets/studio/no-way-studio-logo-fixe.svg']) {
      expect(existsSync(`_site/${p}`), p).toBe(true);
    }
  });

  it('n\'y met ni Docs, ni tests, ni node_modules, ni fichiers de configuration', () => {
    const top = readdirSync('_site');
    // Lot 5g : ni dev/ (journal supprimé ; dans le site assemblé, dev/ est le build de la branche dev), ni site-info.json ou build-info.json (écrits par l'assembleur).
    for (const bad of ['Docs', 'tests', 'node_modules', 'package.json', 'CLAUDE.md', '.github', 'scripts', 'dev', 'site-info.json', 'build-info.json']) {
      expect(top).not.toContain(bad);
    }
  });
});
