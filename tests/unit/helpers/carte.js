// Carte du rez-de-chaussée (lot 3b) : données versionnées, plan, mises en place communes et simulation pure avec la vraie IA de déplacement.
import { readFileSync } from 'node:fs';
import { stepEnemies } from '../../../js/core/enemy-ai.js';
import { createEnemy } from '../../../js/core/enemy-factory.js';
import { buildLayout, windowsWithGaps } from '../../../js/core/layout.js';
import { buildFlow, buildWindowField, createGrid, stepFlow } from '../../../js/core/nav.js';
import { stepSiege } from '../../../js/core/siege.js';
import { closedRects, createWindowsState, stepWindows, windowGeometries } from '../../../js/core/windows.js';
import { waveSpec } from '../../../js/core/waves.js';

const load = (path) => JSON.parse(readFileSync(path, 'utf8'));
export const MAP = 'data/game/maps/rez-de-chaussee';
export const plan = load(`${MAP}/plan.json`);
export const params = load('data/game/maps/params.json');
export const world = load(`${MAP}/world.json`);
export const decorCfg = load(`${MAP}/decor.json`);
export const windowsCfg = load('data/game/windows.json');
export const wavesCfg = load('data/game/waves.json');
export const gaitsCfg = load('data/game/gaits.json');
export const enemiesCfg = load('data/game/enemies.json');
export const navCfg = load('data/game/nav.json');
export const zombieR = enemiesCfg.zombie.radius;
export const layout = buildLayout(world, decorCfg);
export const geoms = windowGeometries(windowsWithGaps(layout), windowsCfg);
export const siegeParams = { ...windowsCfg, bounds: layout.bounds, inside: layout.inside };
export const gridOpts = { cell: navCfg.cell, radius: zombieR, inflate: navCfg.inflate };

// Pixels du plan -> unités du monde (formule du lot : 5 unités par pixel, origine (82, 107), marge de 800).
export const px = (x, y) => ({ x: (x - 82) * 5 + 800, y: (y - 107) * 5 + 800 });

export const closedGrid = createGrid(layout.size, [...layout.zombieObstacles, ...layout.gaps], gridOpts);
export const fields = Object.fromEntries(geoms.map((g) => [g.id, buildWindowField({ grid: closedGrid }, g)]));
export const openGrid = createGrid(layout.size, layout.zombieObstacles, gridOpts);

export function makeZombie(id, windowId, at = null, type = 'marcheur', gait = 'marche') {
  const created = createEnemy(type, gait, waveSpec(1, wavesCfg), enemiesCfg, gaitsCfg);
  const g = geoms.find((w) => w.id === windowId);
  const start = at ?? { x: g.center.x + g.normal.x * 500, y: g.center.y + g.normal.y * 500 };
  return { id, x: start.x, y: start.y, r: created.radius, speed: created.speed, tearMul: created.tearMul, type, gait, mode: 'approche', window: windowId };
}

// Simulation pure : siège, planches, IA de déplacement avec champs de fenêtre et champ de flux du joueur (immobile).
// Renvoie { zombies, windows, time, events, maxStill, stillWhere, log }. onStep(state, i) est appelé à chaque pas.
export function run({ zombies, planks = 4, seconds, player = { x: layout.start.x, y: layout.start.y, r: 18 }, onStep = null, only = null }) {
  let state = { zombies, windows: createWindowsState(geoms, windowsCfg, { planks }), time: 0 };
  const flow = buildFlow(openGrid, player);
  const events = [];
  const still = new Map();
  let maxStill = 0;
  let stillWhere = null;
  const dt = 0.05;
  const gridFor = (windows) => (only ? createGrid(layout.size, [...layout.zombieObstacles, ...closedRects(windows, geoms)], gridOpts) : openGrid);
  let grid = gridFor(state.windows);
  let flowNow = flow;
  for (let i = 0; i < Math.round(seconds / dt); i += 1) {
    const s = stepSiege(state.zombies, state.windows, geoms, dt, siegeParams);
    const w = stepWindows(state.windows, { tearing: s.tearing, repairing: {}, repairBlocked: s.repairBlocked }, dt, windowsCfg);
    if (w.events.some((e) => e.type === 'window-open' || e.type === 'window-closed')) {
      grid = gridFor(w.state);
      flowNow = stepFlow({ flow: null }, dt, grid, player).flow;
    }
    const world3 = { obstacles: [...layout.zombieObstacles, ...closedRects(w.state, geoms)], bounds: layout.worldBounds, grid, flow: flowNow, nav: navCfg, windows: { fields } };
    const moved = stepEnemies(s.zombies, player, dt, { speed: 70 }, world3);
    events.push(...s.events, ...w.events);
    for (const z of moved) {
      const gap = Math.hypot(z.x - player.x, z.y - player.y) - (z.r + player.r);
      const wait = z.mode === 'attente' || z.mode === 'arrache' || (z.mode === 'approche' && z.hold) || (z.mode === 'dedans' && gap <= 2);
      const prev = still.get(z.id);
      const changed = !prev || Math.hypot(prev.x - z.x, prev.y - z.y) > 0.02;
      if (wait || changed) still.set(z.id, { x: z.x, y: z.y, t: 0 });
      else {
        const t = prev.t + dt;
        still.set(z.id, { x: z.x, y: z.y, t });
        if (t > maxStill) {
          maxStill = t;
          stillWhere = { id: z.id, mode: z.mode, x: z.x, y: z.y };
        }
      }
    }
    state = { zombies: moved, windows: w.state, time: state.time + dt };
    onStep?.(state, i);
  }
  return { ...state, events, maxStill, stillWhere };
}

export function deepFreeze(value) {
  if (value && typeof value === 'object' && !ArrayBuffer.isView(value) && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const v of Object.values(value)) deepFreeze(v);
  }
  return value;
}

export const WEIRD = [undefined, null, NaN, Infinity, 'x', 42, {}, [], [null], true];
