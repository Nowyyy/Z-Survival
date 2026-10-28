// Simulation pure du siège (lot 3) : vagues du directeur, planches, modes des zombies, avec un modèle de déplacement et de mort simple
// (aucune collision, aucun rendu). Le joueur est immobile au centre de la salle ; il répare une fenêtre à tour de rôle quand elle n'est
// pas bloquée, pour que les fenêtres s'ouvrent et se referment.
import { readFileSync } from 'node:fs';
import { createEnemy } from '../../../js/core/enemy-factory.js';
import { windowGeometries, createWindowsState, stepWindows } from '../../../js/core/windows.js';
import { stepSiege } from '../../../js/core/siege.js';
import { createDirector, info, stepDirector } from '../../../js/core/wave-director.js';
import { waveSpec } from '../../../js/core/waves.js';
import { layout, enemies } from './monde.js';
import { windowsWithGaps } from '../../../js/core/layout.js';

const load = (name) => JSON.parse(readFileSync(`data/game/${name}.json`, 'utf8'));
export const windowsCfg = load('windows');
export const wavesCfg = load('waves');
export const gaitsCfg = load('gaits');
export const geoms = windowGeometries(windowsWithGaps(layout), windowsCfg);
export const siegeParams = { ...windowsCfg, bounds: layout.bounds };

export function makeZombie(id, window, type = 'marcheur', gait = 'marche', at = null, wave = 1) {
  const created = createEnemy(type, gait, waveSpec(wave, wavesCfg), enemies, gaitsCfg);
  const g = geoms.find((w) => w.id === window);
  const start = at ?? { x: g.center.x + g.normal.x * 500, y: g.center.y + g.normal.y * 500 };
  return { id, x: start.x, y: start.y, r: created.radius, speed: created.speed, tearMul: created.tearMul, type, gait, mode: 'approche', window };
}

// Déplacement du modèle : droit vers la cible à la vitesse du zombie (jamais au-delà), traversée en ligne droite pendant l'escalade.
export function moveModel(z, dt) {
  if (z.mode === 'escalade' && z.climb && z.climb.t > 0) {
    const t = Math.min(1, z.climb.t);
    return { ...z, x: z.climb.from.x + (z.climb.to.x - z.climb.from.x) * t, y: z.climb.from.y + (z.climb.to.y - z.climb.from.y) * t };
  }
  if (!z.target || z.hold) return z;
  const dx = z.target.x - z.x;
  const dy = z.target.y - z.y;
  const d = Math.hypot(dx, dy);
  const reach = z.speed * dt;
  if (d <= reach) return { ...z, x: z.target.x, y: z.target.y };
  return { ...z, x: z.x + (dx / d) * reach, y: z.y + (dy / d) * reach };
}

// Avance un état { zombies, windows, time } d'un pas ; repairing : { id: boolean } décidé par l'appelant. Renvoie le nouvel état et les événements.
export function stepWorld(state, dt, repairing = {}) {
  const out = stepSiege(state.zombies, state.windows, geoms, dt, siegeParams);
  const w = stepWindows(state.windows, { tearing: out.tearing, repairing, repairBlocked: out.repairBlocked }, dt, windowsCfg);
  return { zombies: out.zombies.map((z) => moveModel(z, dt)), windows: w.state, time: state.time + dt, events: [...out.events, ...w.events], blocked: out.repairBlocked, tearing: out.tearing };
}

// Simulation de n vagues. options : { seed, waves, dt, maxWaveSeconds, insideLife (s avant la mort d'un zombie dedans), repairCycle (s), planks }.
export function simulateWaves({ seed = 1, waves = 40, dt = 0.05, maxWaveSeconds = 900, insideLife = 3, repairCycle = 12, planks } = {}) {
  let director = createDirector(wavesCfg, { seed });
  let state = { zombies: [], windows: createWindowsState(geoms, windowsCfg, { planks }), time: 0 };
  let nextId = 1;
  const result = { waveDurations: [], completed: 0, maxStill: 0, stillWhere: null, maxTearers: 0, maxClimbers: 0, entries: 0, badEntries: 0, opened: 0, closed: 0, maxQueue: 0, maxAlive: 0, spawned: 0, timeouts: 0, duplicateSlots: 0 };
  const climbOpen = new Map();
  const entered = new Map();
  const still = new Map();
  let waveStart = 0;
  while (result.completed < waves) {
    const out = stepDirector(director, { dt, alive: state.zombies.length, view: null, points: layout.spawnPoints });
    director = out.state;
    const added = out.requests.map((r) => {
      const z = makeZombie(nextId, r.window, r.type, r.gait, { x: r.x, y: r.y }, info(director).wave);
      nextId += 1;
      return z;
    });
    result.spawned += added.length;
    state = { ...state, zombies: [...state.zombies, ...added] };
    for (const e of out.events) {
      if (e.type === 'waveEnd') {
        result.completed += 1;
        result.waveDurations.push(state.time - waveStart);
        waveStart = state.time;
      }
    }
    // Le joueur répare une fenêtre à la fois, à tour de rôle (si elle n'est pas bloquée).
    const repairing = { [geoms[Math.floor(state.time / repairCycle) % geoms.length].id]: true };
    const step = stepWorld(state, dt, repairing);
    for (const e of step.events) {
      if (e.type === 'window-open') result.opened += 1;
      else if (e.type === 'window-closed') result.closed += 1;
      else if (e.type === 'climb') climbOpen.set(e.id, state.windows.windows[e.windowId].planks === 0);
      else if (e.type === 'enter') {
        result.entries += 1;
        entered.set(e.id, step.time);
        if (climbOpen.get(e.id) !== true) result.badEntries += 1;
      }
    }
    state = { zombies: step.zombies, windows: step.windows, time: step.time };
    for (const g of geoms) {
      const mine = state.zombies.filter((z) => z.window === g.id);
      const slots = mine.filter((z) => z.mode === 'arrache').map((z) => z.slot);
      if (new Set(slots).size !== slots.length) result.duplicateSlots += 1;
      result.maxTearers = Math.max(result.maxTearers, slots.length);
      result.maxClimbers = Math.max(result.maxClimbers, mine.filter((z) => z.mode === 'escalade').length);
      result.maxQueue = Math.max(result.maxQueue, mine.filter((z) => z.mode === 'attente').length);
    }
    result.maxAlive = Math.max(result.maxAlive, state.zombies.length);
    // Immobilité : un zombie qui ne bouge pas alors qu'il ne devrait pas attendre (file, emplacement, arrêt voulu, dedans).
    const keep = new Set();
    for (const z of state.zombies) {
      keep.add(z.id);
      const wait = z.mode === 'attente' || z.mode === 'arrache' || (z.mode === 'approche' && z.hold) || z.mode === 'dedans';
      const s = still.get(z.id);
      const moved = !s || Math.hypot(s.x - z.x, s.y - z.y) > 0.01;
      if (wait || moved) still.set(z.id, { x: z.x, y: z.y, t: 0 });
      else {
        const t = s.t + dt;
        still.set(z.id, { x: z.x, y: z.y, t });
        if (t > result.maxStill) {
          result.maxStill = t;
          result.stillWhere = { mode: z.mode, window: z.window, x: z.x, y: z.y };
        }
      }
    }
    for (const k of [...still.keys()]) if (!keep.has(k)) still.delete(k);
    // Modèle de mort : un zombie meurt insideLife secondes après être entré.
    state = { ...state, zombies: state.zombies.filter((z) => !(z.mode === 'dedans' && state.time - (entered.get(z.id) ?? state.time) >= insideLife)) };
    if (state.time - waveStart > maxWaveSeconds) {
      result.timeouts += 1;
      break;
    }
  }
  return result;
}
