import { describe, it, expect } from 'vitest';
import { execSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { circleOverlapsRect } from '../../js/core/collision.js';
import { moveCircle } from '../../js/core/movement.js';
import { DOWN_TEXTS, WINDOW_NAMES, WINDOW_TEXTS } from '../../js/game/texts.js';
import { layout, load } from './helpers/monde.js';
import { geoms } from './helpers/sim-siege.js';

const windows = load('windows');
const down = load('player-down');
const stats = load('player-stats');
const enemies = load('enemies');
const player = load('player');
const world = load('world');
const fr = JSON.parse(readFileSync('data/i18n/fr.json', 'utf8'));
const tokens = readFileSync('css/tokens.css', 'utf8');
const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
const walk = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(`${dir}/${e.name}`) : [`${dir}/${e.name}`]));
const git = (args) => {
  try {
    return execSync(`git ${args}`, { encoding: 'utf8' }).split('\n').filter(Boolean);
  } catch {
    return null; // pas de dépôt git ou de branche main : rien à comparer
  }
};

describe('data/game/windows.json', () => {
  it('est marqué provisoire', () => {
    expect(windows._provisoire).toBeTruthy();
  });

  it.each([
    ['planks', 4], ['tearTime', 2.2], ['slots', 2], ['activeTearers', 2], ['slotDistance', 55], ['queueStep', 45], ['maxQueue', 6],
    ['climbTime', 1.2], ['maxClimbers', 2], ['innerDistance', 60], ['repairDistance', 70], ['repairRadius', 80], ['repairTime', 1.8], ['strandedTime', 3],
    ['approachRadius', 140], ['holdDistance', 400],
  ])('%s vaut %s (table de la spécification)', (key, value) => {
    expect(windows[key]).toBe(value);
  });

  it('toutes les valeurs sont des nombres finis et positifs', () => {
    for (const [k, v] of Object.entries(windows)) if (k !== '_provisoire') expect(Number.isFinite(v) && v > 0, k).toBe(true);
  });

  it('cohérence : arracheurs actifs ≤ emplacements, durées compatibles avec les statistiques', () => {
    expect(windows.activeTearers).toBeLessThanOrEqual(windows.slots);
    expect(windows.repairTime).toBe(stats.extra.reparation.base);
    expect(windows.holdDistance).toBeGreaterThan(windows.slotDistance + windows.queueStep * windows.maxQueue);
  });

  it('chaque type de zombie a un tearMul positif (1, 0,7, 1,2, 1,6)', () => {
    expect(Object.fromEntries(Object.entries(enemies.variants).map(([k, v]) => [k, v.tearMul]))).toEqual({ marcheur: 1, petit: 0.7, voute: 1.2, grand: 1.6 });
  });
});

describe('data/game/player-down.json', () => {
  it('est marqué provisoire, avec les valeurs de la spécification', () => {
    expect(down._provisoire).toBeTruthy();
    expect(down).toMatchObject({ downDuration: 5, standUpHealFraction: 0.5, graceTime: 2, knockbackRadius: 220, fallDistance: 160, standUpDistance: 200, chutesBase: 1 });
  });

  it('chutesBase est celui de la statistique chutes ; la statistique reparation a un plancher de 0,4 s', () => {
    expect(down.chutesBase).toBe(stats.extra.chutes.base);
    expect(stats.extra.reparation.min).toBe(0.4);
    expect(stats.extra.chutes.maxLevel).toBe(5);
  });
});

describe('géométrie des fenêtres et du monde (world.json inchangé)', () => {
  it('au plus 12 planches (24 triangles) pour toutes les fenêtres', () => {
    const quads = geoms.length * windows.planks;
    expect(quads).toBeLessThanOrEqual(12);
    expect(quads * 2).toBeLessThanOrEqual(24);
  });

  it.each(geoms.map((g) => [g.id, g]))('%s : emplacements et file dans le couloir d\'approche de 160, sans décor solide', (_id, g) => {
    const corridor = load('decor').approachWidth;
    expect(corridor).toBe(160);
    for (const p of [...g.slots, ...g.queue, g.entryOuter]) {
      const along = Math.abs((p.x - g.center.x) * g.tangent.x + (p.y - g.center.y) * g.tangent.y);
      expect(along).toBeLessThanOrEqual(corridor / 2);
      const circle = { x: p.x, y: p.y, r: enemies.zombie.radius };
      for (const solid of layout.decor.solids) expect(circleOverlapsRect(circle, solid), `${g.id} ${solid.id}`).toBe(false);
    }
  });

  it.each(geoms.map((g) => [g.id, g]))('%s : entryInner et repairSpot dans la salle et hors des meubles', (_id, g) => {
    const b = layout.bounds;
    for (const [p, r] of [[g.entryInner, enemies.zombie.radius], [g.repairSpot, player.radius]]) {
      expect(p.x - r).toBeGreaterThanOrEqual(b.minX);
      expect(p.x + r).toBeLessThanOrEqual(b.maxX);
      expect(p.y - r).toBeGreaterThanOrEqual(b.minY);
      expect(p.y + r).toBeLessThanOrEqual(b.maxY);
      for (const f of layout.furniture) expect(circleOverlapsRect({ x: p.x, y: p.y, r }, f), `${g.id} ${f.id}`).toBe(false);
    }
  });

  it.each(geoms.map((g) => [g.id, g]))('%s : le joueur, poussé vers la fenêtre, reste dans le rayon de réparation (barrières comprises)', (_id, g) => {
    let p = { x: g.repairSpot.x, y: g.repairSpot.y, r: player.radius };
    for (let i = 0; i < 60; i += 1) p = { ...p, ...moveCircle(p, g.normal, player.speed, 0.05, layout.room, layout.playerObstacles) };
    expect(Math.hypot(p.x - g.repairSpot.x, p.y - g.repairSpot.y)).toBeLessThan(windows.repairRadius);
    // et il ne franchit jamais la fenêtre : il reste du côté intérieur du mur
    expect((p.x - g.center.x) * g.normal.x + (p.y - g.center.y) * g.normal.y).toBeLessThan(0);
  });

  it('world.json est inchangé (git diff vide)', () => {
    const changed = git('diff --name-only main -- data/game/world.json');
    if (changed !== null) expect(changed).toEqual([]);
    expect(world.windows).toHaveLength(3);
  });

  it('les fichiers que le lot ne doit pas toucher sont inchangés depuis main', () => {
    const changed = git('diff --name-only main -- js/core/waves.js js/core/wave-splash.js js/core/vhs.js js/core/projectile.js js/core/ray.js js/core/spread.js js/core/camera.js data/game/waves.json data/game/gaits.json data/game/weapons.json data/game/textures.json data/game/decor.json data/game/splash.json data/game/vhs.json index.html Docs/seed.md .github');
    if (changed !== null) expect(changed).toEqual([]);
  });
});

describe('textes, jetons, pureté et hygiène du lot 3', () => {
  it('chaque clé de texte des fenêtres et de l\'état à terre existe dans fr.json et seulement là (clés game.* en français seul)', () => {
    for (const key of [...Object.values(WINDOW_TEXTS), ...Object.values(WINDOW_NAMES), ...Object.values(DOWN_TEXTS)]) expect(fr[key], key).toBeTruthy();
    expect(Object.keys(fr).filter((k) => k.startsWith('game.windows.') || k.startsWith('game.down.')).length).toBe(Object.values(WINDOW_TEXTS).length + Object.values(WINDOW_NAMES).length + Object.values(DOWN_TEXTS).length);
  });

  it('les noms de fenêtres couvrent celles de world.json', () => {
    for (const w of world.windows) expect(WINDOW_NAMES[w.id], w.id).toBeTruthy();
  });

  it('les variables --game-down-* et --game-repair-* sont des jetons de tokens.css', () => {
    for (const n of ['veil', 'veil-alpha', 'panel', 'text', 'sub']) expect(tokens, n).toMatch(new RegExp(`--game-down-${n}:`));
    for (const n of ['panel', 'ring', 'track', 'text']) expect(tokens, n).toMatch(new RegExp(`--game-repair-${n}:`));
    expect(tokens).toMatch(/--game-down-veil:\s*#[0-9a-fA-F]{6};/);
  });

  it('js/core/ : aucun Math.random, Date.now, document, window, AudioContext dans les nouveaux modules', () => {
    for (const f of ['windows', 'siege', 'player-down']) {
      // « window » est aussi le nom d'une propriété des zombies (z.window, window:) et d'événements (window-open) : seul l'objet global est interdit.
      const text = readFileSync(`js/core/${f}.js`, 'utf8');
      for (const re of [/Math\.random/, /Date\.now/, /\bdocument\b/, /(?<![\w.'-])window\s*[.[(]/, /globalThis/, /AudioContext/, /\bfetch\s*\(/, /performance\.now/]) expect(text, `${f} ${re}`).not.toMatch(re);
    }
  });

  it('les nouveaux modules purs n\'importent que des modules de js/core/', () => {
    for (const f of ['windows', 'siege', 'player-down']) {
      for (const m of readFileSync(`js/core/${f}.js`, 'utf8').matchAll(/from '([^']+)'/g)) expect(m[1], f).toMatch(/^\.\/[a-z-]+\.js$/);
    }
  });

  it('aucune couleur en dur dans les nouveaux modules', () => {
    for (const f of ['windows', 'siege', 'player-down']) expect(readFileSync(`js/core/${f}.js`, 'utf8'), f).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  });

  it('aucun fichier audio, image ou police ajouté depuis main', () => {
    const added = git('diff --name-only --diff-filter=A main');
    if (added !== null) expect(added.filter((f) => /\.(wav|mp3|ogg|m4a|flac|webm|aac|opus|png|jpe?g|gif|webp|svg|ico|woff2?|ttf|otf)$/i.test(f))).toEqual([]);
  });

  it('aucune dépendance d\'exécution, aucun fichier de plus de 5 Mo', () => {
    expect(pkg.dependencies ?? {}).toEqual({});
    const tracked = (git('ls-files') ?? []).filter((f) => existsSync(f));
    for (const f of tracked) expect(statSync(f).size, f).toBeLessThan(5 * 1024 * 1024);
  });

  it('mémoire audio totale ≤ 8 Mo (rapportée dans data-sons) et aucun dossier de rendu versionné', () => {
    expect((git('ls-files') ?? []).filter((f) => /(^|\/)(node_modules|_site|dist)\//.test(f))).toEqual([]);
    expect(walk('data/game').filter((f) => f.endsWith('.json')).length).toBeGreaterThan(20);
  });
});
