// Outils communs aux scripts et aux tests des zones (lot 3c) : chargement d'une carte et de ses zones, grilles de chemin avec ou sans porte,
// statistiques par zone, simulation pure avec la vraie IA de déplacement. Lecture seule : n'écrit rien.
import { existsSync, readFileSync } from 'node:fs';
import { rectGap } from '../../js/core/collision.js';
import { stepEnemies } from '../../js/core/enemy-ai.js';
import { createEnemy } from '../../js/core/enemy-factory.js';
import { buildLayout, buildLayouts, windowsWithGaps } from '../../js/core/layout.js';
import { portalsFor, stairTriggers } from '../../js/core/stairs.js';
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
  const free = totalArea(unionRects(inside, map.world.obstacles.filter((o) => o.outside !== true)));
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
  const items = [...map.world.obstacles, ...map.layout.pillars, ...map.layout.stairs].filter((o) => o.outside !== true && inZone(o));
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

// Lot 3e : carte à deux étages. Renvoie { ...loadMap(id), floors: ['rdc', 'etage'], up: { world, layout, geoms, assignment, decor } } (up est null sans etage.world.json). Les portes
// du lot 3e (porte-2, porte-3) peuvent être « planned » dans zones.json : les fonctions ci-dessous les prennent en compte quand même (état « ouvert » demandé).
export function loadMapFloors(id = 'rez-de-chaussee', root = 'data/game/maps') {
  const map = loadMap(id, root);
  const file = `${root}/${id}/etage.world.json`;
  if (!existsSync(file)) return { ...map, floors: ['rdc'], up: null };
  const world = load(file);
  const layouts = buildLayouts({ rdc: { world: map.world, decor: map.decor }, etage: { world }, zones: map.zones });
  const layout = layouts.etage;
  const geoms = windowGeometries(windowsWithGaps(layout), map.windowsCfg);
  const assignment = assignWindowsDetailed(map.zones, geoms.map((g) => ({ id: g.id, floor: 'etage', entryInner: g.entryInner }))).map;
  return { ...map, floors: ['rdc', 'etage'], up: { world, layout, geoms, assignment, decor: { spawnPoints: world.spawnPoints } }, layouts };
}

// Blocs (rectangles pleins) des portes fermées d'un étage, planned ou non : les autres portes (openIds) sont ouvertes. porte-1 garde son segment d'ouverture.
export function blocksOf(map, floor, openIds = []) {
  const t = { wallThickness: map.world.wallThickness, wallHeight: map.world.wallHeight };
  const out = [];
  for (const d of map.zones.doors) {
    if (openIds.includes(d.id)) continue;
    const defs = d.blocks.length > 0 ? d.blocks.filter((b) => b.floor === floor) : (d.floor ?? 'rdc') === floor ? [{ rect: null, opening: d.opening }] : [];
    for (const b of defs) {
      const r = b.rect ? { id: d.id, x: b.rect.x, y: b.rect.y, w: b.rect.w, h: b.rect.h } : doorRect({ id: d.id, opening: b.opening }, t);
      if (r) out.push(r);
    }
  }
  return out;
}

// Grille de chemin d'un étage, portes données ouvertes, fenêtres fermées par leurs planches (planksUp).
export function gridForFloor(map, floor, openIds = [], planksUp = true) {
  const layout = floor === 'etage' ? map.up.layout : map.layout;
  const geoms = floor === 'etage' ? map.up.geoms : map.geoms;
  const planks = planksUp ? closedRects(createWindowsState(geoms, map.windowsCfg), geoms) : [];
  return createGrid(layout.size, [...layout.zombieObstacles, ...blocksOf(map, floor, openIds), ...planks], map.gridOpts);
}

// Zones d'un étage actives quand les portes openIds sont ouvertes (planned ou non).
export const activeZonesFor = (map, floor, openIds) => map.zones.zones.filter((z) => (z.floor ?? 'rdc') === floor && (z.openAtStart || map.zones.doors.some((d) => openIds.includes(d.id) && d.opens.includes(z.id)))).map((z) => z.id);

// Statistiques d'une zone de l'étage : aire intérieure, aire libre, rapport, fenêtres, points d'apparition.
export function floorZoneStats(map, zoneId) {
  const zone = map.zones.zones.find((z) => z.id === zoneId);
  const floor = zone.floor ?? 'rdc';
  const world = floor === 'etage' ? map.up.world : map.world;
  const layout = floor === 'etage' ? map.up.layout : map.layout;
  const assignment = floor === 'etage' ? map.up.assignment : map.assignment;
  const spawn = floor === 'etage' ? map.up.world.spawnPoints : map.decor.spawnPoints;
  const inside = unionRects(polygonRects(zone.region), layout.walls);
  const interior = totalArea(inside);
  const free = totalArea(unionRects(inside, world.obstacles.filter((o) => o.outside !== true)));
  const wins = Object.entries(assignment).filter(([, z]) => z === zoneId).map(([id]) => id);
  return { id: zoneId, floor, interior, free, ratio: interior > 0 ? free / interior : 0, windows: wins, spawnPoints: spawn.filter((p) => wins.includes(p.window ?? p.fenetre)).map((p) => p.id) };
}

// Escaliers : à chaque étage, la zone de déclenchement et l'arrivée sont-elles reliées (chemin de la grille) aux fenêtres de leur zone, aux autres escaliers et à l'arrivée
// de l'autre étage, une fois les portes openIds ouvertes ? Renvoie [{ stair, floor, linked: { windows, arrival } }].
export function stairLinks(map, openIds) {
  const out = [];
  const stairs = map.zones.stairs;
  for (const st of stairs) {
    for (const floor of ['rdc', 'etage']) {
      const d = st.floors[floor];
      const grid = gridForFloor(map, floor, openIds);
      const geoms = floor === 'etage' ? map.up.geoms : map.geoms;
      const assignment = floor === 'etage' ? map.up.assignment : map.assignment;
      const active = activeZonesFor(map, floor, openIds);
      const target = { x: d.trigger.x + d.trigger.w / 2, y: d.trigger.y + d.trigger.h / 2 };
      const wins = geoms.filter((g) => active.includes(assignment[g.id]));
      out.push({ stair: st.id, floor, windows: wins.map((g) => ({ id: g.id, ok: reachable(grid, g.entryInner, target) })), arrival: reachable(grid, d.arrival, target) });
    }
  }
  return out;
}

export { portalsFor, stairTriggers };

// Vue d'une carte à deux étages sur UN étage, au format attendu par simulate, zombieSolids et gridFor (layout, geoms, world, decor, assignment, doors) : les blocs de toutes les
// portes de cet étage (planned ou non) servent de portes pleines, chacun sous l'identifiant de sa porte.
export function floorView(map, floor) {
  const doors = blocksOf(map, floor, []).map((r) => ({ id: r.id, rect: r }));
  if (floor !== 'etage') return { ...map, doors };
  return { ...map, layout: map.up.layout, geoms: map.up.geoms, world: map.up.world, decor: map.up.decor, assignment: map.up.assignment, doors };
}
