// Zombies sur deux étages (lot 3e) : un seul endroit pour ce qui se passe par étage. Pur : n'utilise que ses arguments (couches de layout.js, données du jeu), renvoie de
// nouveaux objets, ne modifie pas ses arguments (gelés acceptés), aucune exception sur des entrées inattendues, aucun hasard, aucune horloge (temps en dt borné à 0,05 s).
// Le jeu (js/game/game.js) et les simulations des tests appellent les mêmes fonctions.
//   createFloorWorld : ce qui ne change pas (couches, géométries des fenêtres, champs de flux des fenêtres, escaliers).
//   createFloorState : l'état (planches de toutes les fenêtres, grilles de chemin par étage, escaliers utilisables, champs de flux vers les escaliers, champ de flux du joueur).
//   syncDoors        : une porte s'ouvre ou se ferme : blocs retirés des collisions et des grilles, escaliers utilisables, champs de flux recalculés (jamais par image).
//   stepFloors       : un pas : siège et planches de chaque étage, déplacement des zombies de chaque étage (poursuite du joueur à son étage, champ de flux vers l'escalier
//                      le plus proche par chemin à l'autre), franchissement des escaliers.
// Un zombie sans champ floor est au rez-de-chaussée ; avec une seule couche (?map=salle) tout se passe comme avant le lot 3e.
import { stepEnemies } from './enemy-ai.js';
import { DEFAULT_FLOOR, floorOf, isFloorId, onFloor, withFloor } from './floors.js';
import { closedDoors, windowsWithGaps } from './layout.js';
import { buildPortalField, buildWindowField, createFlowState, createGrid, stepFlow } from './nav.js';
import { stepSiege } from './siege.js';
import { portalsFor, stairState } from './stairs.js';
import { stepStairZombies } from './stair-zombies.js';
import { clampDt, num } from './vec.js';
import { closedRects, createWindowsState, stepWindows, windowGeometries } from './windows.js';

const isObject = (o) => o !== null && typeof o === 'object' && !Array.isArray(o);

// layouts : buildLayouts (layout.js) ; cfg : { windows (windows.json), grid ({ cell, radius, inflate }), nav (nav.json), zombie (enemies.zombie), stair (stairs.json) }.
// Renvoie { floors, layouts, geoms: { rdc, etage }, geomById, fields (champ de flux de chaque fenêtre), cfg, stairs, closedGrids }.
export function createFloorWorld(layouts, cfg) {
  const floors = Array.isArray(layouts?.floors) && layouts.floors.length > 0 ? layouts.floors.filter(isFloorId) : [DEFAULT_FLOOR];
  const geoms = {};
  const closedGrids = {};
  const fields = {};
  for (const f of floors) {
    const layout = layouts[f];
    geoms[f] = windowGeometries(windowsWithGaps(layout), cfg?.windows).map((g) => ({ ...g, floor: f }));
    // Champ de flux de chaque fenêtre : grille EXTÉRIEURE (ouvertures des fenêtres bloquées), calculé une seule fois au chargement.
    closedGrids[f] = createGrid(layout.size, [...layout.zombieObstacles, ...layout.gaps], cfg?.grid);
    for (const g of geoms[f]) fields[g.id] = buildWindowField({ grid: closedGrids[f] }, g);
  }
  const all = floors.flatMap((f) => geoms[f]);
  return { floors, layouts, geoms, all, geomById: new Map(all.map((g) => [g.id, g])), fields, closedGrids, cfg: cfg ?? {}, stairs: Array.isArray(layouts?.stairs) ? layouts.stairs : [] };
}

const layoutOf = (world, f) => world.layouts[isFloorId(f) && world.floors.includes(f) ? f : DEFAULT_FLOOR];

// Obstacles des zombies d'un étage : décor, murs et meubles, blocs des portes fermées, planches des fenêtres fermées.
function solidsFor(world, state, f) {
  const layout = layoutOf(world, f);
  return [...layout.zombieObstacles, ...closedDoors(layout, state.openDoors), ...closedRects(state.win, world.geoms[f] ?? [])];
}

// Recalcule ce qui dépend des portes : grilles, escaliers utilisables et leurs champs de flux. Les champs de flux vers les escaliers se calculent sur une grille où les
// ouvertures des fenêtres restent fermées (un zombie qui est dedans ne repart jamais par une fenêtre ouverte pour rejoindre un escalier).
function rebuild(world, state) {
  const grids = {};
  const portals = {};
  const portalFields = {};
  const portalGrids = {};
  for (const f of world.floors) {
    const layout = layoutOf(world, f);
    grids[f] = createGrid(layout.size, solidsFor(world, state, f), world.cfg.grid);
    portals[f] = world.floors.length > 1 ? portalsFor(world.stairs, f, state.openDoors) : [];
    portalGrids[f] = createGrid(layout.size, [...layout.zombieObstacles, ...closedDoors(layout, state.openDoors), ...layout.gaps], world.cfg.grid);
    portalFields[f] = buildPortalField({ grid: portalGrids[f] }, f, portals[f]);
  }
  return { ...state, grids, portals, portalFields, portalGrids, flow: createFlowState() };
}

// État initial. options : { planks (nombre initial de planches), openDoors (identifiants), playerFloor }.
export function createFloorState(world, options = {}) {
  const win = createWindowsState(world.all, world.cfg.windows, { planks: options.planks });
  const playerFloor = isFloorId(options.playerFloor) && world.floors.includes(options.playerFloor) ? options.playerFloor : DEFAULT_FLOOR;
  const state = { win, openDoors: Array.isArray(options.openDoors) ? [...options.openDoors] : [], playerFloor, flow: createFlowState(), grids: {}, portals: {}, portalFields: {}, portalGrids: {} };
  return rebuild(world, state);
}

// Porte ouverte ou fermée : renvoie un nouvel état (grilles et champs de flux recalculés).
export function syncDoors(world, state, openDoors) {
  return rebuild(world, { ...state, openDoors: Array.isArray(openDoors) ? [...openDoors] : [] });
}

// Les planches d'un étage ont changé (une fenêtre s'ouvre ou se ferme) : seule la grille de cet étage est refaite, le champ de flux du joueur repart de zéro s'il y est.
export function syncWindowGrid(world, state, floor) {
  const f = world.floors.includes(floor) ? floor : DEFAULT_FLOOR;
  const layout = layoutOf(world, f);
  return { ...state, grids: { ...state.grids, [f]: createGrid(layout.size, solidsFor(world, state, f), world.cfg.grid) }, flow: f === state.playerFloor ? createFlowState() : state.flow };
}

// Le joueur change d'étage : le champ de flux du joueur repart de zéro.
export const setPlayerFloor = (world, state, floor) => ({ ...state, playerFloor: world.floors.includes(floor) ? floor : state.playerFloor, flow: createFlowState() });

// Obstacles des zombies d'un étage (pour les tests et le jeu : déplacements, tirs, laser en prennent d'autres).
export const zombieSolidsOn = (world, state, floor) => solidsFor(world, state, world.floors.includes(floor) ? floor : DEFAULT_FLOOR);

// input : { enemies (tous étages), player ({ x, y, r }), dt, active (identifiants des fenêtres actives), canRepair (le joueur peut réparer), repairTime, repairRadius }.
// Renvoie { state, enemies, events, tearing, repairBlocked, repair } ; events : { type, floor, ... } (plank-torn, plank-repaired, window-open, window-closed, climb, enter,
// stranded, stairStart, stairArrive) ; repair : { idFenêtre: { repairing, blocked, attacked } }.
export function stepFloors(world, state, input) {
  const dt = clampDt(input?.dt);
  const cfg = world.cfg;
  const list = Array.isArray(input?.enemies) ? input.enemies : [];
  const player = isObject(input?.player) ? input.player : { x: 0, y: 0, r: 0 };
  const active = Array.isArray(input?.active) ? input.active : world.all.map((g) => g.id);
  const pf = state.playerFloor;
  const events = [];
  let enemies = list;
  const tearing = {};
  const repairBlocked = {};

  // 1. Siège de chaque étage : modes et intentions des zombies de l'étage, planches arrachées par eux.
  for (const f of world.floors) {
    const layout = layoutOf(world, f);
    enemies = withFloor(enemies, f, (mine) => {
      const sg = stepSiege(mine, state.win, world.geoms[f], dt, { ...cfg.windows, bounds: layout.bounds, inside: layout.inside, active, floor: f });
      Object.assign(tearing, sg.tearing);
      Object.assign(repairBlocked, sg.repairBlocked);
      for (const e of sg.events) events.push({ ...e, floor: f });
      return sg.zombies;
    });
  }

  // 2. Planches : arrachage par les zombies de chaque étage, réparation par le joueur à son étage seulement.
  const repairing = {};
  for (const g of world.all) {
    const w = state.win.windows[g.id];
    repairing[g.id] = g.floor === pf && input?.canRepair !== false && active.includes(g.id) && Math.hypot(num(player.x) - g.repairSpot.x, num(player.y) - g.repairSpot.y) <= num(input?.repairRadius, cfg.windows?.repairRadius) && w !== undefined && w.planks < w.maxPlanks;
  }
  const wr = stepWindows(state.win, { tearing, repairing, repairBlocked, repairTime: input?.repairTime }, dt, cfg.windows);
  let next = { ...state, win: wr.state };
  const repair = Object.fromEntries(world.all.map((g) => [g.id, { repairing: repairing[g.id] === true && repairBlocked[g.id] !== true, blocked: repairBlocked[g.id] === true, attacked: (tearing[g.id] ?? []).length > 0 }]));
  const changed = new Set();
  for (const ev of wr.events) {
    const g = world.geomById.get(ev.windowId);
    events.push({ ...ev, floor: g?.floor ?? DEFAULT_FLOOR });
    if ((ev.type === 'window-open' || ev.type === 'window-closed') && g) changed.add(g.floor);
  }
  for (const f of changed) next = syncWindowGrid(world, next, f);

  // 3. Déplacement : à l'étage du joueur, poursuite du joueur ; à l'autre, champ de flux vers l'escalier utilisable le plus proche par chemin.
  const flow = stepFlow(next.flow, dt, next.grids[pf], player, cfg.nav?.recompute);
  next = { ...next, flow };
  for (const f of world.floors) {
    const layout = layoutOf(world, f);
    const here = f === pf;
    const wd = { obstacles: solidsFor(world, next, f), bounds: layout.worldBounds, grid: here ? next.grids[f] : next.portalGrids[f], nav: cfg.nav, windows: { fields: world.fields } };
    const wld = here ? { ...wd, flow: flow.flow } : { ...wd, offFloor: true, portalFlow: next.portalFields[f]?.flow ?? null, portalTargets: next.portals[f] };
    enemies = withFloor(enemies, f, (mine) => stepEnemies(mine, player, dt, cfg.zombie, wld));
  }

  // 4. Escaliers : les zombies arrivés à une zone de déclenchement montent ou descendent (1,5 s, 2 à la fois), ceux qui arrivent changent d'étage.
  if (world.floors.length > 1) {
    const st = stepStairZombies(enemies, { playerFloor: pf, portals: next.portals, params: cfg.stair }, dt);
    enemies = st.enemies;
    for (const ev of st.events) events.push({ ...ev, floor: ev.type === 'stairArrive' ? ev.to : ev.from });
  }
  return { state: next, enemies, events, tearing, repairBlocked, repair };
}

// Escaliers : état de chacun ({ id, door, planned, usable }) d'après les portes ouvertes de l'état.
export const stairsOf = (world, state) => stairState(world.stairs, state.openDoors);

// Zombies du joueur : ceux de son étage qui ne franchissent pas un escalier (cibles du laser, des balles, du contact).
export const targetsOf = (list, floor) => onFloor(list, floor).filter((e) => e.mode !== 'escalier');

// Étage d'un zombie (rez-de-chaussée par défaut).
export const floorOfEnemy = (e) => floorOf(e);
