// Carte à deux étages pour les tests (lot 3e) : données versionnées, couches, monde de simulation pure et simulation avec la vraie IA.
import { readFileSync } from 'node:fs';
import { createEnemy } from '../../../js/core/enemy-factory.js';
import { createFloorState, createFloorWorld, setPlayerFloor, stepFloors, syncDoors } from '../../../js/core/floor-sim.js';
import { buildLayouts } from '../../../js/core/layout.js';
import { portalsFor, stairParams } from '../../../js/core/stairs.js';
import { waveSpec } from '../../../js/core/waves.js';
import { parseZones, zonesToWorld } from '../../../js/core/zones.js';

const load = (path) => JSON.parse(readFileSync(path, 'utf8'));
export const MAP = 'data/game/maps/rez-de-chaussee';
export const params = load('data/game/maps/params.json');
export const plan = load(`${MAP}/plan.json`);
export const etagePlan = load(`${MAP}/etage.json`);
export const world = load(`${MAP}/world.json`);
export const decor = load(`${MAP}/decor.json`);
export const etageWorld = load(`${MAP}/etage.world.json`);
export const zonesJson = load(`${MAP}/zones.json`);
export const windowsCfg = load('data/game/windows.json');
export const wavesCfg = load('data/game/waves.json');
export const gaitsCfg = load('data/game/gaits.json');
export const enemiesCfg = load('data/game/enemies.json');
export const navCfg = load('data/game/nav.json');
export const stairsCfg = load('data/game/stairs.json');
export const gridOpts = { cell: navCfg.cell, radius: enemiesCfg.zombie.radius, inflate: navCfg.inflate };

// zones.json lu avec les portes 2 et 3 actives (planned faux) : le jeu les active aux parties B et C ; les tests de simulation les utilisent dès maintenant.
export const zonesPx = parseZones(zonesJson);
export const zonesActive = zonesToWorld({ ...zonesPx, doors: zonesPx.doors.map((d) => ({ ...d, planned: false })), stairs: zonesPx.stairs.map((s) => ({ ...s, planned: false })) }, world.transform);
export const zones = zonesToWorld(zonesPx, world.transform);

export const layouts = buildLayouts({ rdc: { world, decor }, etage: { world: etageWorld }, zones: zonesActive });
export const ALL_DOORS = ['porte-1', 'porte-2', 'porte-3'];
export const floorWorld = createFloorWorld(layouts, { windows: windowsCfg, grid: gridOpts, nav: navCfg, zombie: enemiesCfg.zombie, stair: stairsCfg });

export function makeZombie(id, at, { floor = 'rdc', mode = 'dedans', type = 'marcheur', gait = 'marche', window: windowId = null } = {}) {
  const c = createEnemy(type, gait, waveSpec(1, wavesCfg), enemiesCfg, gaitsCfg);
  return { id, x: at.x, y: at.y, r: c.radius, speed: c.speed, tearMul: c.tearMul, type, gait, mode, window: windowId, floor, health: c.hp, maxHealth: c.maxHp };
}

export const arrivalOf = (stairId, floor) => zonesActive.stairs.find((s) => s.id === stairId).floors[floor].arrival;
export const triggerOf = (stairId, floor) => zonesActive.stairs.find((s) => s.id === stairId).floors[floor].trigger;
export const centerOf = (r) => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 });
export const portals = (floor, open = ALL_DOORS) => portalsFor(zonesActive.stairs, floor, open);

// Simulation pure de seconds secondes (pas de 0,05 s) : zombies des deux étages, joueur immobile à `player` de l'étage `playerFloor`.
// options : { zombies, playerFloor, player, open (portes ouvertes), planks, seconds, onStep(state, enemies, i, events) , switchEvery (change l'étage du joueur toutes les n s, à l'arrivée de l'escalier-aile) }.
export function simulate({ zombies, playerFloor = 'rdc', player = null, open = ALL_DOORS, planks = 4, seconds = 30, onStep = null, active = null, switchEvery = 0 } = {}) {
  let state = createFloorState(floorWorld, { planks, openDoors: open, playerFloor });
  let pf = playerFloor;
  const start = () => (pf === 'etage' ? layouts.etage.start : layouts.rdc.start);
  let p = player ?? { ...start(), r: 18 };
  let enemies = zombies;
  const events = [];
  const still = new Map();
  let maxStill = 0;
  let stillWhere = null;
  const dt = 0.05;
  const ids = active ?? floorWorld.all.map((g) => g.id);
  for (let i = 0; i < Math.round(seconds / dt); i += 1) {
    if (switchEvery > 0 && i > 0 && i % Math.round(switchEvery / dt) === 0) {
      pf = pf === 'rdc' ? 'etage' : 'rdc';
      const a = arrivalOf('escalier-aile', pf);
      p = { ...a, r: 18 };
      state = setPlayerFloor(floorWorld, state, pf);
    }
    const out = stepFloors(floorWorld, state, { enemies, player: p, dt, active: ids, canRepair: true });
    state = out.state;
    enemies = out.enemies;
    events.push(...out.events.map((e) => ({ ...e, i })));
    for (const z of enemies) {
      const gap = Math.hypot(z.x - p.x, z.y - p.y) - (z.r + p.r);
      const sameFloor = (z.floor ?? 'rdc') === pf;
      const waits = z.mode === 'attente' || z.mode === 'arrache' || z.mode === 'escalier' || (z.mode === 'approche' && z.hold) || (z.mode === 'dedans' && sameFloor && gap <= 2);
      const prev = still.get(z.id);
      const moved = !prev || Math.hypot(prev.x - z.x, prev.y - z.y) > 0.02 || prev.floor !== (z.floor ?? 'rdc');
      if (waits || moved) still.set(z.id, { x: z.x, y: z.y, t: 0, floor: z.floor ?? 'rdc' });
      else {
        const t = prev.t + dt;
        still.set(z.id, { x: z.x, y: z.y, t, floor: z.floor ?? 'rdc' });
        if (t > maxStill) {
          maxStill = t;
          stillWhere = { id: z.id, mode: z.mode, floor: z.floor ?? 'rdc', x: z.x, y: z.y };
        }
      }
    }
    onStep?.(state, enemies, i, out.events);
  }
  return { state, enemies, events, maxStill, stillWhere, playerFloor: pf };
}

export { setPlayerFloor, stairParams, syncDoors };
