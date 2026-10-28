// Simulation du siège avec la vraie IA de déplacement (champs de flux des fenêtres, collisions, séparation) : sert aux tests du lot 3.
import { stepEnemies } from '../../../js/core/enemy-ai.js';
import { closedRects, createWindowsState, stepWindows } from '../../../js/core/windows.js';
import { buildWindowField, createGrid } from '../../../js/core/nav.js';
import { stepSiege } from '../../../js/core/siege.js';
import { gridOf, layout, navCfg, zombieR } from './monde.js';
import { geoms, siegeParams, windowsCfg } from './sim-siege.js';

export const closedGrid = createGrid(layout.size, [...layout.zombieObstacles, ...layout.gaps], { cell: navCfg.cell, radius: zombieR, inflate: navCfg.inflate });
export const fields = Object.fromEntries(geoms.map((g) => [g.id, buildWindowField({ grid: closedGrid }, g)]));
export const openGrid = gridOf();

export function realWorld(state) {
  return { obstacles: [...layout.zombieObstacles, ...closedRects(state.windows, geoms)], bounds: layout.worldBounds, grid: openGrid, flow: null, nav: navCfg, windows: { fields } };
}

// Avance de `seconds` secondes (pas 0,05) ; player : position du joueur (immobile). Renvoie { zombies, windows, time, events, maxStill, stillWhere, log }.
export function runReal({ zombies, planks = 4, seconds, player = { x: layout.start.x, y: layout.start.y, r: 18 }, repairing = {}, onStep = null }) {
  let state = { zombies, windows: createWindowsState(geoms, windowsCfg, { planks }), time: 0 };
  const events = [];
  const still = new Map();
  let maxStill = 0;
  let stillWhere = null;
  const dt = 0.05;
  for (let i = 0; i < Math.round(seconds / dt); i += 1) {
    const s = stepSiege(state.zombies, state.windows, geoms, dt, siegeParams);
    const w = stepWindows(state.windows, { tearing: s.tearing, repairing, repairBlocked: s.repairBlocked }, dt, windowsCfg);
    const moved = stepEnemies(s.zombies, player, dt, { speed: 70 }, realWorld({ windows: w.state }));
    events.push(...s.events, ...w.events);
    for (const z of moved) {
      const wait = z.mode === 'attente' || z.mode === 'arrache' || (z.mode === 'approche' && z.hold) || z.mode === 'dedans';
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
