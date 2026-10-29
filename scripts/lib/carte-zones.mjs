// Outils communs aux scripts et aux tests des zones (lot 3c) : chargement d'une carte et de ses zones, grilles de chemin avec ou sans porte,
// statistiques par zone, simulation pure avec la vraie IA de déplacement. Lecture seule : n'écrit rien.
import { readFileSync } from 'node:fs';
import { rectGap } from '../../js/core/collision.js';
import { stepEnemies } from '../../js/core/enemy-ai.js';
import { createEnemy } from '../../js/core/enemy-factory.js';
import { buildLayout, windowsWithGaps } from '../../js/core/layout.js';
import { analyzeMap } from '../../js/core/maps.js';
import { buildFlow, buildWindowField, cellIndex, createGrid, INF } from '../../js/core/nav.js';
import { polygonRects, segmentRects, totalArea, unionRects } from '../../js/core/shape.js';
import { stepSiege } from '../../js/core/siege.js';
import { waveSpec } from '../../js/core/waves.js';
import { closedRects, createWindowsState, stepWindows, windowGeometries } from '../../js/core/windows.js';
import { assignWindowsDetailed, doorRect, parseZones, zonesToWorld } from '../../js/core/zones.js';

const load = (path) => JSON.parse(readFileSync(path, 'utf8'));

// Carte et zones d'un dossier data/game/maps/<id>/ : fichiers versionnés, zones en pixels et en unités du jeu, présentation du jeu.
export function loadMap(id = 'rez-de-chaussee', root = 'data/game/maps') {
  const dir = `${root}/${id}`;
  const plan = load(`${dir}/plan.json`);
  const params = load(`${root}/params.json`);
  const world = load(`${dir}/world.json`);
  const decor = load(`${dir}/decor.json`);
  const zonesPx = parseZones(load(`${dir}/zones.json`));
  const zones = zonesToWorld(zonesPx, world.transform);
  const windowsCfg = load('data/game/windows.json');
  const wavesCfg = load('data/game/waves.json');
  const gaitsCfg = load('data/game/gaits.json');
  const enemiesCfg = load('data/game/enemies.json');
  const navCfg = load('data/game/nav.json');
  const layout = buildLayout(world, decor);
  const geoms = windowGeometries(windowsWithGaps(layout), windowsCfg);
  const assignment = assignWindowsDetailed(zones, geoms.map((g) => ({ id: g.id, entryInner: g.entryInner }))).map;
  const doors = zones.doors.filter((d) => !d.planned).map((d) => ({ ...d, rect: doorRect(d, { wallThickness: world.wallThickness, wallHeight: world.wallHeight }) }));
  const gridOpts = { cell: navCfg.cell, radius: enemiesCfg.zombie.radius, inflate: navCfg.inflate };
  return { id, plan, params, world, decor, zonesPx, zones, windowsCfg, wavesCfg, gaitsCfg, enemiesCfg, navCfg, layout, geoms, assignment, doors, gridOpts };
}

// Solides des zombies : le décor, les murs et les meubles, plus les portes fermées (openIds : portes ouvertes).
export const zombieSolids = (map, openIds = []) => [...map.layout.zombieObstacles, ...map.doors.filter((d) => d.rect && !openIds.includes(d.id)).map((d) => d.rect)];
export const playerSolids = (map, openIds = []) => [...map.layout.playerObstacles, ...map.doors.filter((d) => d.rect && !openIds.includes(d.id)).map((d) => d.rect)];

// Grille de chemin des zombies avec les portes données ouvertes (les autres fermées) et, par défaut, les fenêtres fermées par leurs planches : c'est la grille
// du jeu quand aucune planche n'est arrachée. planksUp faux : les ouvertures des fenêtres restent libres.
export function gridFor(map, openIds = [], planksUp = true) {
  const planks = planksUp ? closedRects(createWindowsState(map.geoms, map.windowsCfg), map.geoms) : [];
  return createGrid(map.layout.size, [...zombieSolids(map, openIds), ...planks], map.gridOpts);
}

// Vrai si un chemin existe de a à b dans la grille.
export function reachable(grid, from, to) {
  const flow = buildFlow(grid, to);
  return flow.dist[cellIndex(grid, from)] !== INF;
}

// Aire d'une zone : { interior (aire de son polygone), free (moins les obstacles), ratio, windows, spawnPoints }.
export function zoneStats(map, zoneId) {
  const zone = map.zones.zones.find((z) => z.id === zoneId);
  const inside = unionRects(polygonRects(zone.region), map.layout.walls); // même convention que analyzeMap : les murs ne comptent pas
  const interior = totalArea(inside);
  const free = totalArea(unionRects(inside, map.layout.furniture.filter((o) => o.outside !== true)));
  const wins = Object.entries(map.assignment).filter(([, z]) => z === zoneId).map(([id]) => id);
  return { id: zoneId, interior, free, ratio: interior > 0 ? free / interior : 0, windows: wins, spawnPoints: map.decor.spawnPoints.filter((p) => wins.includes(p.window ?? p.fenetre)).map((p) => p.id) };
}

// Aire intérieure et aire libre de tout le bâtiment (même convention que planToWorld : murs compris dans l'intérieur).
export const globalStats = (map) => {
  const a = analyzeMap(map.world);
  return { interior: Math.round(a.interiorArea), free: Math.round(a.freeArea), ratio: a.freeArea / a.interiorArea, components: a.components, unreachable: a.unreachable, neck: a.neck };
};

// Plus petit intervalle non nul entre deux obstacles, ou entre un obstacle et un mur, dans une zone (null s'il n'y en a pas).
export function smallestCorridor(map, zoneId) {
  const zone = map.zones.zones.find((z) => z.id === zoneId);
  const rects = polygonRects(zone.region);
  const inZone = (o) => rects.some((r) => o.x + o.w / 2 > r.x && o.x + o.w / 2 < r.x + r.w && o.y + o.h / 2 > r.y && o.y + o.h / 2 < r.y + r.h);
  const items = [...map.layout.furniture, ...map.layout.pillars, ...map.layout.stairs].filter((o) => o.outside !== true && inZone(o));
  const fullWalls = segmentRects(map.world.walls, map.world.wallThickness); // lignes de mur complètes : le bord d'une ouverture de fenêtre n'est pas un couloir
  let best = Infinity;
  for (let i = 0; i < items.length; i += 1) {
    for (let j = i + 1; j < items.length; j += 1) {
      const g = rectGap(items[i], items[j]);
      if (g > 0) best = Math.min(best, g);
    }
    for (const w of fullWalls) {
      const g = rectGap(items[i], w);
      if (g > 0) best = Math.min(best, g);
    }
  }
  return Number.isFinite(best) ? best : null;
}

// Simulation pure : siège, planches, IA de déplacement (champs de fenêtre, champ de flux du joueur). zombies : [{ id, x, y, window }] créés en
// approche. options : { seconds, player, openIds (portes ouvertes), planks, type, onStep (appelé à chaque pas avec les zombies) }. Renvoie { maxStill, stillWhere, entered, positions, time }.
export function simulate(map, zombieSpecs, { seconds = 60, player = null, openIds = [], planks = 4, type = 'marcheur', gait = 'marche', wave = 1, onStep = null } = {}) {
  const { layout, geoms, windowsCfg, navCfg, gridOpts } = map;
  const p = player ?? { x: layout.start.x, y: layout.start.y, r: 18 };
  const siegeParams = { ...windowsCfg, bounds: layout.bounds, inside: layout.inside };
  const closedGrid = createGrid(layout.size, [...layout.zombieObstacles, ...layout.gaps], gridOpts);
  const fields = Object.fromEntries(geoms.map((g) => [g.id, buildWindowField({ grid: closedGrid }, g)]));
  const made = (s) => {
    const c = createEnemy(type, gait, waveSpec(wave, map.wavesCfg), map.enemiesCfg, map.gaitsCfg);
    return { id: s.id, x: s.x, y: s.y, r: c.radius, speed: c.speed, tearMul: c.tearMul, type, gait, mode: 'approche', window: s.window };
  };
  let zombies = zombieSpecs.map(made);
  let windows = createWindowsState(geoms, windowsCfg, { planks });
  const solids = (w) => [...zombieSolids(map, openIds), ...closedRects(w, geoms)];
  let grid = createGrid(layout.size, solids(windows), gridOpts);
  let flow = buildFlow(grid, p);
  const still = new Map();
  const entered = new Set();
  const dt = 0.05;
  let maxStill = 0;
  let stillWhere = null;
  for (let i = 0; i < Math.round(seconds / dt); i += 1) {
    const s = stepSiege(zombies, windows, geoms, dt, siegeParams);
    const w = stepWindows(windows, { tearing: s.tearing, repairing: {}, repairBlocked: s.repairBlocked }, dt, windowsCfg);
    if (w.events.some((e) => e.type === 'window-open' || e.type === 'window-closed')) {
      grid = createGrid(layout.size, solids(w.state), gridOpts);
      flow = buildFlow(grid, p);
    }
    for (const e of s.events) if (e.type === 'enter') entered.add(e.id);
    const world3 = { obstacles: solids(w.state), bounds: layout.worldBounds, grid, flow, nav: navCfg, windows: { fields } };
    zombies = stepEnemies(s.zombies, p, dt, { speed: 70 }, world3);
    windows = w.state;
    onStep?.(zombies, i);
    for (const z of zombies) {
      const gap = Math.hypot(z.x - p.x, z.y - p.y) - (z.r + p.r);
      const wait = z.mode === 'attente' || z.mode === 'arrache' || (z.mode === 'approche' && z.hold) || (z.mode === 'dedans' && gap <= 2);
      const prev = still.get(z.id);
      const changed = !prev || Math.hypot(prev.x - z.x, prev.y - z.y) > 0.02;
      if (wait || changed) still.set(z.id, { x: z.x, y: z.y, t: 0 });
      else {
        const t = prev.t + dt;
        still.set(z.id, { x: z.x, y: z.y, t });
        if (t > maxStill) {
          maxStill = t;
          stillWhere = { id: z.id, mode: z.mode, window: z.window, x: z.x, y: z.y };
        }
      }
    }
  }
  return { maxStill, stillWhere, entered: [...entered], positions: zombies.map((z) => ({ id: z.id, x: z.x, y: z.y, mode: z.mode })), time: seconds };
}

// Un zombie par point d'apparition donné, simulé séparément : [{ id, maxStill, stillWhere, entered }].
export function simulateEachSpawn(map, points, options = {}) {
  return points.map((pt, i) => {
    const r = simulate(map, [{ id: i + 1, x: pt.x, y: pt.y, window: pt.window ?? pt.fenetre }], options);
    return { id: pt.id, maxStill: r.maxStill, stillWhere: r.stillWhere, entered: r.entered.length > 0 };
  });
}
