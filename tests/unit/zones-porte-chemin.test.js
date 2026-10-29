import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { rectGap, validRects } from '../../js/core/collision.js';
import { applyImpacts } from '../../js/core/combat.js';
import { buildLayout, closedDoors, playerSolids, shotBlockers, zombieSolidsOf } from '../../js/core/layout.js';
import { moveCircle } from '../../js/core/movement.js';
import { cellCenter, cellIndex, createGrid, hasPath } from '../../js/core/nav.js';
import { createBullet, stepBullets } from '../../js/core/projectile.js';
import { castRay } from '../../js/core/ray.js';
import { pointInPolygon, polygonRects, segmentRects } from '../../js/core/shape.js';
import { doorRect } from '../../js/core/zones.js';
import { gridFor, loadMap, reachable, simulate, simulateEachSpawn, zombieSolids } from '../../scripts/lib/carte-zones.mjs';

const map = loadMap();
const { world, plan, zones, layout: base, geoms, decor } = map;
const layout = buildLayout(world, decor, { zones });
const door = layout.doors[0];
const weapon = { bulletSpeed: 900, bulletRadius: 3, damage: 25, bulletMaxDistance: 700 };
const bounds = layout.worldBounds;
const aile = zones.zones.find((z) => z.id === 'aile').region;
const wingEntries = geoms.filter((g) => map.assignment[g.id] === 'aile');
const hallEntries = geoms.filter((g) => map.assignment[g.id] === 'depart');
const midY = door.rect.y + door.rect.h / 2;

describe('porte 1 : obstacle plein dans l\'ouverture', () => {
  it('layout.doors ne contient que la porte active (les portes planned n\'existent pas)', () => {
    expect(layout.doors.map((d) => d.id)).toEqual(['porte-1']);
    expect(layout.doors[0]).toMatchObject({ opens: ['aile'], openAfterWave: 10 });
  });

  it('l\'ouverture de zones.json est celle de plan.json (clé openings, « ouverture-aile »)', () => {
    const opening = plan.openings.find((o) => o.id === 'ouverture-aile');
    expect(map.zonesPx.doors[0].opening).toEqual({ x1: opening.x1, y1: opening.y1, x2: opening.x2, y2: opening.y2 });
  });

  it('le rectangle de la porte coïncide avec l\'ouverture de world.json (même axe, même étendue, débord de 4)', () => {
    const op = world.openings.find((o) => o.id === 'ouverture-aile');
    expect(door.opening).toEqual({ x1: op.x1, y1: op.y1, x2: op.x2, y2: op.y2 });
    const [lo, hi] = [Math.min(op.y1, op.y2), Math.max(op.y1, op.y2)];
    expect(door.rect.y).toBe(lo - 4);
    expect(door.rect.y + door.rect.h).toBe(hi + 4);
    expect(door.rect.x + door.rect.w / 2).toBe(op.x1);
    expect(door.rect.w).toBe(world.wallThickness + 8);
  });

  it('hauteur 60 (celle du mur), genre « porte » dans la couche des collisions', () => {
    expect(door.rect).toMatchObject({ kind: 'porte', hauteur: 60 });
    expect(closedDoors(layout)[0]).toMatchObject({ id: 'porte-1', kind: 'porte' });
  });

  it('fermée, la porte bloque le joueur, les zombies, les balles et le laser ; ouverte, elle n\'est plus nulle part', () => {
    for (const list of [playerSolids(layout), zombieSolidsOf(layout), shotBlockers(layout)]) expect(list.some((r) => r.id === 'porte-1')).toBe(true);
    for (const list of [playerSolids(layout, ['porte-1']), zombieSolidsOf(layout, ['porte-1']), shotBlockers(layout, ['porte-1'])]) expect(list.some((r) => r.id === 'porte-1')).toBe(false);
  });

  it('sans zones (ancienne salle, ?empty=1, carte sans zones.json) : aucune porte', () => {
    const salle = JSON.parse(readFileSync('data/game/world.json', 'utf8'));
    const salleDecor = JSON.parse(readFileSync('data/game/decor.json', 'utf8'));
    expect(buildLayout(salle, salleDecor).doors).toEqual([]);
    expect(buildLayout(salle, salleDecor, { empty: true }).doors).toEqual([]);
    expect(buildLayout(world, decor).doors).toEqual([]);
    expect(closedDoors(buildLayout(salle, salleDecor))).toEqual([]);
  });

  it('les murs et les meubles restent identiques avec ou sans zones (la porte s\'y ajoute seulement)', () => {
    expect(layout.playerObstacles).toEqual(base.playerObstacles);
    expect(layout.zombieObstacles).toEqual(base.zombieObstacles);
    expect(playerSolids(layout)).toHaveLength(base.playerObstacles.length + 1);
  });
});

describe('porte 1 : chemin dans la grille des zombies', () => {
  const closed = gridFor(map, []);
  const open = gridFor(map, ['porte-1']);

  it.each(['F1', 'F2', 'F3'])('porte fermée : aucun chemin du départ à l\'entryInner de %s', (id) => {
    const g = geoms.find((q) => q.id === id);
    expect(hasPath(closed, g.entryInner, layout.start)).toBe(false);
    expect(reachable(closed, g.entryInner, layout.start)).toBe(false);
  });

  it.each(['F1', 'F2', 'F3'])('porte ouverte : un chemin existe du départ à l\'entryInner de %s', (id) => {
    const g = geoms.find((q) => q.id === id);
    expect(hasPath(open, g.entryInner, layout.start)).toBe(true);
    expect(hasPath(open, layout.start, g.entryInner)).toBe(true);
  });

  it.each(['F4', 'F5', 'F6', 'F7', 'F8'])('%s est reliée au départ, porte fermée comme ouverte', (id) => {
    const g = geoms.find((q) => q.id === id);
    expect(hasPath(closed, g.entryInner, layout.start)).toBe(true);
    expect(hasPath(open, g.entryInner, layout.start)).toBe(true);
  });

  it('les cellules de la porte sont bloquées fermée, libres ouverte', () => {
    const c = { x: door.opening.x1, y: midY };
    expect(closed.blocked[cellIndex(closed, c)]).toBe(1);
    expect(open.blocked[cellIndex(open, c)]).toBe(0);
    const near = cellCenter(open, cellIndex(open, c));
    expect(Math.abs(near.x - c.x)).toBeLessThanOrEqual(open.cell);
  });

  it('hasPath : entrées hostiles sans exception', () => {
    for (const bad of [null, undefined, {}, 'x', 42, NaN]) expect(() => hasPath(bad, bad, bad)).not.toThrow();
    expect(hasPath(null, { x: 0, y: 0 }, { x: 1, y: 1 })).toBe(false);
  });

  it('zombieSolids du script = couche des collisions de layout.js', () => {
    expect(zombieSolids(map, [])).toEqual(zombieSolidsOf(layout));
    expect(zombieSolids(map, ['porte-1'])).toEqual(zombieSolidsOf(layout, ['porte-1']));
  });
});

describe('porte 1 : balles, laser et déplacements', () => {
  const east = { x: door.rect.x + door.rect.w + 120, y: midY };
  const west = { x: door.rect.x - 120, y: midY };

  it('une balle tirée vers l\'ouest s\'arrête sur la porte fermée, sans impact ni dégât', () => {
    const victim = { id: 9, x: west.x - 60, y: midY, r: 20, health: 50 };
    let bullets = [createBullet(east, Math.PI, weapon, 1)];
    const gone = [];
    const impacts = [];
    for (let i = 0; i < 40 && bullets.length > 0; i += 1) {
      const out = stepBullets(bullets, [victim], 0.05, bounds, shotBlockers(layout));
      bullets = out.bullets;
      gone.push(...out.gone);
      impacts.push(...out.impacts);
    }
    expect(impacts).toEqual([]);
    expect(gone).toHaveLength(1);
    expect(gone[0]).toMatchObject({ reason: 'obstacle', obstacleId: 'porte-1' });
    expect(applyImpacts([victim], impacts).killed).toEqual([]);
    expect(victim.health).toBe(50);
  });

  it('porte ouverte, la même balle atteint le zombie derrière', () => {
    const victim = { id: 9, x: west.x - 60, y: midY, r: 20, health: 50 };
    let bullets = [createBullet(east, Math.PI, weapon, 1)];
    const impacts = [];
    for (let i = 0; i < 40 && bullets.length > 0; i += 1) {
      const out = stepBullets(bullets, [victim], 0.05, bounds, shotBlockers(layout, ['porte-1']));
      bullets = out.bullets;
      impacts.push(...out.impacts);
    }
    expect(impacts).toHaveLength(1);
  });

  it('le laser s\'arrête sur la porte fermée et ne voit pas le zombie derrière ; ouverte, il le voit', () => {
    const victim = [{ id: 9, x: west.x - 60, y: midY, r: 20 }];
    const closedRay = castRay(east, Math.PI, 420, victim, bounds, shotBlockers(layout));
    expect(closedRay.hit).toBeNull();
    expect(closedRay.stoppedBy).toMatchObject({ id: 'porte-1' });
    const openRay = castRay(east, Math.PI, 420, victim, bounds, shotBlockers(layout, ['porte-1']));
    expect(openRay.hit).toMatchObject({ id: 9 });
  });

  it('le joueur ne traverse pas la porte fermée, il la traverse ouverte', () => {
    let p = { ...east, r: 18 };
    for (let i = 0; i < 80; i += 1) p = { ...p, ...moveCircle(p, { x: -1, y: 0 }, 200, 0.05, layout.moveRoom, playerSolids(layout)) };
    expect(p.x).toBeGreaterThanOrEqual(door.rect.x + door.rect.w + 18 - 1e-6);
    let q = { ...east, r: 18 };
    for (let i = 0; i < 80; i += 1) q = { ...q, ...moveCircle(q, { x: -1, y: 0 }, 200, 0.05, layout.moveRoom, playerSolids(layout, ['porte-1'])) };
    expect(q.x).toBeLessThan(door.rect.x - 50);
  });

  it('ouverte, le passage libre fait au moins 85 de large (largeur de l\'ouverture)', () => {
    const op = world.openings.find((o) => o.id === 'ouverture-aile');
    const walls = segmentRects(world.walls, world.wallThickness).filter((w) => w.x < op.x1 + 21 && w.x + w.w > op.x1 - 21);
    // Intervalles bloqués le long de la ligne x = op.x1 (murs et meubles), puis plus grand intervalle libre entre eux.
    const blocks = [...walls, ...validRects(world.obstacles)].filter((r) => op.x1 >= r.x && op.x1 <= r.x + r.w).map((r) => [r.y, r.y + r.h]).sort((a, b) => a[0] - b[0]);
    const lo = Math.min(op.y1, op.y2) - 60;
    const hi = Math.max(op.y1, op.y2) + 60;
    const spans = [];
    let cursor = lo;
    for (const [a, b] of blocks) {
      if (b < lo || a > hi) continue;
      spans.push(Math.max(0, a - cursor));
      cursor = Math.max(cursor, b);
    }
    spans.push(Math.max(0, hi - cursor));
    expect(Math.max(...spans)).toBeGreaterThanOrEqual(85);
  });

  it('le disque du joueur (rayon 18) passe réellement de la grande salle à l\'aile par l\'ouverture', () => {
    let p = { x: east.x + 60, y: midY, r: 18 };
    for (let i = 0; i < 200; i += 1) p = { ...p, ...moveCircle(p, { x: -1, y: 0 }, 160, 0.05, layout.moveRoom, playerSolids(layout, ['porte-1'])) };
    expect(pointInPolygon(p.x, p.y, aile)).toBe(true);
  });
});

describe('zones : zombies, couloirs et simulation pure', () => {
  it('chaque intervalle non nul entre une pièce ajoutée et un voisin ou un mur est franchissable : sa cellule centrale est libre dans la grille', () => {
    const open = gridFor(map, ['porte-1']);
    const walls = segmentRects(world.walls, world.wallThickness);
    const items = base.furniture.filter((o) => o.outside !== true);
    const added = items.filter((o) => o.provisional);
    expect(added.length).toBeGreaterThanOrEqual(8);
    for (const a of added) {
      for (const b of [...items.filter((o) => o !== a), ...walls]) {
        const g = rectGap(a, b);
        if (g === 0 || g >= 80) continue;
        const dx = Math.max(b.x - (a.x + a.w), 0, a.x - (b.x + b.w));
        const dy = Math.max(b.y - (a.y + a.h), 0, a.y - (b.y + b.h));
        const mid = dx >= dy
          ? { x: b.x >= a.x + a.w ? a.x + a.w + dx / 2 : a.x - dx / 2, y: Math.max(a.y, b.y) + Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y)) / 2 }
          : { y: b.y >= a.y + a.h ? a.y + a.h + dy / 2 : a.y - dy / 2, x: Math.max(a.x, b.x) + Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) / 2 };
        if (dx > 0 && dy > 0) continue; // coins en diagonale : pas un couloir
        const overlap = dx >= dy ? Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y) : Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
        if (overlap < 40) continue; // une fente de moins de 40 de long (contre un mur) n'est pas un couloir
        expect(open.blocked[cellIndex(open, mid)], `${a.id} / ${b.id} : intervalle ${g}`).toBe(0);
      }
    }
  });

  it('aucun zombie bloqué plus de 2 s en 60 s depuis chacun des 10 points d\'apparition actifs, porte fermée', () => {
    const points = decor.spawnPoints.filter((p) => map.assignment[p.window] === 'depart');
    expect(points).toHaveLength(10);
    const out = simulateEachSpawn(map, points, { seconds: 60, openIds: [] });
    for (const r of out) {
      expect(r.maxStill, `${r.id} ${JSON.stringify(r.stillWhere)}`).toBeLessThanOrEqual(2);
      expect(r.entered, r.id).toBe(true);
    }
  });

  it('aucun zombie bloqué plus de 2 s en 60 s depuis chacun des 16 points, porte ouverte', () => {
    expect(decor.spawnPoints).toHaveLength(16);
    const out = simulateEachSpawn(map, decor.spawnPoints, { seconds: 60, openIds: ['porte-1'] });
    for (const r of out) expect(r.maxStill, `${r.id} ${JSON.stringify(r.stillWhere)}`).toBeLessThanOrEqual(2);
    expect(out.every((r) => r.entered)).toBe(true);
  });

  it('aucun zombie ne peut entrer dans l\'aile porte fermée, même avec le joueur au fond de l\'aile', () => {
    const player = { x: 1200, y: 1500, r: 18 };
    const specs = decor.spawnPoints.filter((p) => map.assignment[p.window] === 'depart').map((p, i) => ({ id: i + 1, x: p.x, y: p.y, window: p.window }));
    let inside = 0;
    const out = simulate(map, specs, { seconds: 60, player, openIds: [], onStep: (zs) => { inside += zs.filter((z) => pointInPolygon(z.x, z.y, aile)).length; } });
    expect(inside).toBe(0);
    expect(out.positions).toHaveLength(10);
  });

  it('porte ouverte, les mêmes zombies atteignent le joueur dans l\'aile', () => {
    const player = { x: 1200, y: 1500, r: 18 };
    const specs = [{ id: 1, x: 1735, y: 3010, window: 'F7' }];
    let reached = false;
    simulate(map, specs, { seconds: 90, player, openIds: ['porte-1'], onStep: (zs) => { if (zs.some((z) => Math.hypot(z.x - player.x, z.y - player.y) < 60)) reached = true; } });
    expect(reached).toBe(true);
  });

  it('les fenêtres de l\'aile ne reçoivent aucun siège quand elles sont inactives (stepSiege avec active)', async () => {
    const { stepSiege } = await import('../../js/core/siege.js');
    const { createWindowsState } = await import('../../js/core/windows.js');
    const { windowsCfg, layout: lay } = map;
    const zs = [{ id: 1, x: 1175, y: 900 - 55, r: 20, mode: 'approche', window: 'F1' }, { id: 2, x: 2430, y: 1940 - 55, r: 20, mode: 'approche', window: 'F4' }];
    const state = createWindowsState(geoms, windowsCfg);
    const active = ['F4', 'F5', 'F6', 'F7', 'F8'];
    const out = stepSiege(zs, state, geoms, 0.05, { ...windowsCfg, bounds: lay.bounds, inside: lay.inside, active });
    expect(out.zombies[0]).toMatchObject({ mode: 'approche', target: null });
    expect(out.zombies[1].target).not.toBeNull();
    expect(Object.keys(out.tearing).sort()).toEqual(active);
    expect(out.tearing.F1).toBeUndefined();
    const all = stepSiege(zs, state, geoms, 0.05, { ...windowsCfg, bounds: lay.bounds, inside: lay.inside });
    expect(Object.keys(all.tearing)).toHaveLength(8);
  });

  it('les fenêtres F1 à F3 restent des ouvertures du mur fermées par leurs planches : closedRects les compte toujours', async () => {
    const { closedRects, createWindowsState } = await import('../../js/core/windows.js');
    const rects = closedRects(createWindowsState(geoms, map.windowsCfg), geoms);
    expect(rects.map((r) => r.id).sort()).toEqual(geoms.map((g) => `planches-${g.id}`).sort());
  });

  it('la grille extérieure des fenêtres est la même avec ou sans porte (la porte est à l\'intérieur)', () => {
    const solids = [...base.zombieObstacles, ...base.gaps];
    const a = createGrid(base.size, solids, map.gridOpts);
    const b = createGrid(base.size, [...solids, door.rect], map.gridOpts);
    let diff = 0;
    for (let i = 0; i < a.blocked.length; i += 1) if (a.blocked[i] !== b.blocked[i]) diff += 1;
    expect(diff).toBeGreaterThan(0);
    const cell = (c) => cellIndex(a, c);
    for (const g of hallEntries) expect(a.blocked[cell(g.entryOuter)]).toBe(b.blocked[cell(g.entryOuter)]);
    for (const g of wingEntries) expect(a.blocked[cell(g.entryOuter)]).toBe(b.blocked[cell(g.entryOuter)]);
  });

  it('doorRect de layout = doorRect de zones.js', () => {
    expect(door.rect).toEqual(doorRect(door, { wallThickness: world.wallThickness, wallHeight: world.wallHeight }));
    expect(polygonRects(aile).length).toBeGreaterThan(0);
  });
});
