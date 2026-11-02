// Mini-arène de l'atelier des personnages (lot 3j) : le joueur au centre tire sur 10 zombies de types variés qui approchent aux vitesses du
// jeu (createEnemy : gaits.json et enemies.json, manche 1) ; tir au délai et aux dégâts du pistolet (weapons.json), balle instantanée, sans
// collision ni décor. Simulation pure et déterministe (graine) : mêmes pas, mêmes résultats, quelle que soit la vitesse d'affichage.
import { createEnemy } from './enemy-factory.js';
import { ringSpawn, approach, nearest } from './crowd.js';
import { isNum } from './vec.js';

const num = (v, d = 0) => (isNum(v) ? v : d);
export const ARENA_STEP = 1 / 60;

// cfg : { enemies, gaits, weapon (pistol), player (player.json), count (10), radius (360) }.
export function createArena(seed, cfg) {
  const spec = { hpMul: 1, speedMul: 1, damageMul: 1 };
  const zombies = ringSpawn(seed, num(cfg?.count, 10), num(cfg?.radius, 360)).map((z) => {
    const e = createEnemy(z.type, z.gait, spec, cfg?.enemies, cfg?.gaits);
    return { ...z, hp: e.hp, maxHp: e.hp, speed: e.speed, radius: e.radius, alive: true, attacking: false, facing: Math.atan2(-z.y, -z.x), distance: 0 };
  });
  return { seed: Math.trunc(num(seed, 1)), time: 0, steps: 0, cooldown: 0.6, aim: 0, kills: 0, shots: 0, hits: 0, done: zombies.length === 0, zombies };
}

// Un pas de simulation (dt borné à ARENA_STEP × 4). Renvoie { state, events } ; événements : shot, hit, kill (avec direction de la balle).
export function stepArena(state, dt, cfg) {
  if (!state || state.done) return { state, events: [] };
  const t = Math.min(ARENA_STEP * 4, Math.max(0, num(dt)));
  const weapon = cfg?.weapon ?? {};
  const playerR = num(cfg?.player?.radius, 18);
  const events = [];
  let zombies = state.zombies.map((z) => {
    if (!z.alive) return z;
    const m = approach(z, { x: 0, y: 0 }, z.speed, t, z.radius + playerR);
    return { ...z, x: m.x, y: m.y, attacking: m.arrived, distance: z.distance + m.moved, facing: Math.atan2(-m.y, -m.x) };
  });
  let { cooldown, kills, shots, hits, aim } = state;
  cooldown = Math.max(0, cooldown - t);
  const target = nearest(zombies, { x: 0, y: 0 });
  if (target) aim = Math.atan2(target.y, target.x);
  if (target && cooldown <= 0 && Math.hypot(target.x, target.y) <= num(weapon.fireRange, 700)) {
    cooldown = num(weapon.fireDelay, 0.4);
    shots += 1;
    hits += 1;
    const dir = { x: Math.cos(aim), y: Math.sin(aim) };
    events.push({ type: 'shot', aim });
    zombies = zombies.map((z) => {
      if (z.id !== target.id) return z;
      const hp = z.hp - num(weapon.damage, 25);
      if (hp <= 0) {
        kills += 1;
        events.push({ type: 'kill', id: z.id, zombie: z.type, x: z.x, y: z.y, dir, facing: z.facing });
        return { ...z, hp: 0, alive: false };
      }
      events.push({ type: 'hit', id: z.id, zombie: z.type, x: z.x, y: z.y, dir, hpFraction: hp / z.maxHp });
      return { ...z, hp };
    });
  }
  const done = zombies.every((z) => !z.alive);
  return { state: { ...state, time: state.time + t, steps: state.steps + 1, cooldown, kills, shots, hits, aim, done, zombies }, events };
}

// Avance de `seconds` par pas fixes de ARENA_STEP ; renvoie { state, events } (tous les événements, dans l'ordre).
export function runArena(state, seconds, cfg) {
  let s = state;
  const events = [];
  const n = Math.max(0, Math.round(num(seconds) / ARENA_STEP));
  for (let i = 0; i < n && !s.done; i += 1) {
    const r = stepArena(s, ARENA_STEP, cfg);
    s = r.state;
    events.push(...r.events.map((e) => ({ ...e, time: s.time })));
  }
  return { state: s, events };
}
