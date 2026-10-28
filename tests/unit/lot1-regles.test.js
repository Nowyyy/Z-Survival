import { describe, it, expect } from 'vitest';
import { execSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { simulate } from './helpers/sim-lot1.js';

// Valeurs de référence : sortie du code du lot 1 (js/core/ de main, avant ce lot) pour la même simulation de 30 s.
const REFERENCE = {
  42: { shots: 21, impacts: 18, kills: 9, health: 100, dead: false, enemies: 0, time: 30 },
  7: { shots: 26, impacts: 18, kills: 9, health: 100, dead: false, enemies: 0, time: 30 },
};
// Règle du lot 1m (retour du propriétaire) : le tir part aussi au-delà de la portée du laser ; mêmes tués, plus de tirs.
const EXTENDED = {
  42: { shots: 25, impacts: 18, kills: 9, health: 100, dead: false, enemies: 0, time: 30 },
  7: { shots: 29, impacts: 18, kills: 9, health: 100, dead: false, enemies: 0, time: 30 },
};

describe('mêmes règles qu\'au lot 1', () => {
  it.each(Object.keys(REFERENCE))('simulation pure de 30 s, graine %s : tirs, impacts, tués et vie identiques au lot 1', async (seed) => {
    expect(await simulate(process.cwd(), { seed: Number(seed), legacy: true })).toEqual(REFERENCE[seed]);
  });

  // Lot 2b : la portée de tir de base repasse à 700 (comme au lot 1) ; remettre 1600 dans weapons.json redonne les résultats du lot 1m.
  it.each(Object.keys(REFERENCE))('portée de tir de base 700 (lot 2b), graine %s : mêmes tirs que le lot 1', async (seed) => {
    expect(await simulate(process.cwd(), { seed: Number(seed) })).toEqual(REFERENCE[seed]);
  });

  it.each(Object.keys(EXTENDED))('portée de tir étendue à 1600 (valeur du lot 1m), graine %s : plus de tirs, mêmes tués', async (seed) => {
    const r = await simulate(process.cwd(), { seed: Number(seed), weaponPatch: { fireRange: 1600 } });
    expect(r).toEqual(EXTENDED[seed]);
    expect(r.shots).toBeGreaterThan(REFERENCE[seed].shots);
    expect(r.kills).toBe(REFERENCE[seed].kills);
  });

  it('la simulation est reproductible (même graine, même résultat) et dépend de la graine', async () => {
    const a = await simulate(process.cwd(), { seed: 5 });
    expect(await simulate(process.cwd(), { seed: 5 })).toEqual(a);
    expect((await simulate(process.cwd(), { seed: 5 })).shots).not.toBe((await simulate(process.cwd(), { seed: 7 })).shots);
  });

  it('chaque tir vient du laser : aucun tir sans ennemi, au plus un impact par balle', async () => {
    const r = await simulate(process.cwd(), { seed: 42 });
    expect(r.shots).toBeGreaterThan(0);
    expect(r.impacts).toBeLessThanOrEqual(r.shots);
    expect(r.kills).toBeLessThanOrEqual(Math.floor(r.impacts / 2));
  });

  // Lot 1b : les modules du monde sont nouveaux ou étendus (paramètres facultatifs, valeurs par défaut = lot 1m, prouvé par les simulations
  // « identiques au lot 1 » ci-dessus) ; tout autre fichier de js/core/ reste inchangé.
  it('js/core/ est inchangé depuis main, sauf pose.js, viewport.js, les modules du monde du lot 1b et les modules du lot 1c (color, texgen, variants) et du lot 1d (sons : synth, audio-mix, footsteps, sound-director, zombie-voice ; sound-params retiré) et du lot 2 (waves, wave-director, enemy-factory) et du lot 2b (player-stats, spread, combat, projectile) et du lot 2c (wave-splash, vhs ; synth, texgen, audio-mix, sound-director étendus) et du lot 3 (windows, siege, player-down ; nav, layout, enemy-ai, combat, pose, player-stats, audio-mix, sound-director, wave-director, enemy-factory étendus)', () => {
    let changed;
    try {
      changed = execSync('git diff --name-only main -- js/core', { encoding: 'utf8' }).split('\n').filter(Boolean);
    } catch {
      return; // pas de dépôt git ou de branche main (copie de travail) : rien à comparer
    }
    const allowed = ['pose', 'viewport', 'camera', 'collision', 'nav', 'decor', 'layout', 'movement', 'ray', 'projectile', 'enemy-ai', 'spawner', 'color', 'texgen', 'variants', 'synth', 'audio-mix', 'footsteps', 'sound-director', 'zombie-voice', 'sound-params', 'waves', 'wave-director', 'enemy-factory', 'combat', 'player-stats', 'spread', 'wave-splash', 'vhs', 'windows', 'siege', 'player-down'].map((n) => `js/core/${n}.js`);
    expect(changed.filter((f) => !allowed.includes(f))).toEqual([]);
  });
});

describe('retrait de Phaser', () => {
  const walk = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(`${dir}/${e.name}`) : [`${dir}/${e.name}`]));

  it('aucun fichier de js/, css/, data/, scripts/, jeu.html, index.html ni de la documentation de référence ne mentionne Phaser', () => {
    const files = [...walk('js'), ...walk('css'), ...walk('data'), ...walk('scripts'), ...walk('dev'), ...walk('Docs/ref'), 'jeu.html', 'index.html', 'CLAUDE.md', 'package.json', 'eslint.config.js', 'playwright.config.js', 'apercu.txt'];
    for (const f of files) expect(readFileSync(f, 'utf8'), f).not.toMatch(/phaser/i);
  });

  it('plus de dépendance, de fichier vendoré ni de script Phaser', () => {
    const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
    expect(Object.keys(pkg.devDependencies)).not.toContain('phaser');
    expect(pkg.scripts.vendor).toBeUndefined();
    for (const f of ['vendor/phaser.min.js', 'vendor/LICENSE-phaser.txt', 'scripts/vendor.mjs', 'js/game/scene.js']) expect(existsSync(f), f).toBe(false);
    expect(readFileSync('package-lock.json', 'utf8')).not.toMatch(/node_modules\/phaser/);
  });

  it('une seule devDependency de rendu : three, à version exacte', () => {
    const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
    expect(Object.keys(pkg.devDependencies).filter((n) => /three|phaser|pixi|babylon|playcanvas/.test(n))).toEqual(['three']);
    expect(pkg.dependencies ?? {}).toEqual({});
  });
});
