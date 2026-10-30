// Escaliers (lot 3e) : quels escaliers sont utilisables, leurs zones de déclenchement à chaque étage, détection du joueur dans une zone, point d'arrivée,
// points de passage des zombies, délai de 0,8 s et absence de rebond. Pur : n'utilise que ses arguments (les escaliers de zonesToWorld, en unités du jeu), renvoie
// de nouveaux objets, ne modifie pas ses arguments (gelés acceptés), ne lève aucune exception sur des entrées inattendues, déterministe, aucune horloge.
import { DEFAULT_FLOOR, FLOOR_IDS, isFloorId, otherFloor } from './floors.js';
import { clampDt, isNum, num } from './vec.js';

// Valeurs de repli de data/game/stairs.json (les vraies valeurs vivent dans les données ; un test vérifie qu'elles sont identiques).
export const STAIR_DEFAULTS = Object.freeze({
  stairTime: 1.5,
  stairMaxAtOnce: 4,
  stairCooldownPlayer: 0.8,
  stairGraceAfter: 1.0,
  arrivalPush: 80,
  arrivalPushRadius: 60,
  triggerMin: 64,
  triggerReach: 60,
  arrivalWait: 2,
  fadeOut: 0.25,
  fadeIn: 0.25,
  fadeLockReduced: 0.2,
});

const isObject = (o) => o !== null && typeof o === 'object' && !Array.isArray(o);
const posNum = (n, fallback) => (isNum(n) && n > 0 ? n : fallback);
const nonNeg = (n, fallback) => (isNum(n) && n >= 0 ? n : fallback);
const validRect = (r) => isObject(r) && [r.x, r.y, r.w, r.h].every(isNum) && r.w > 0 && r.h > 0;

// Paramètres nettoyés d'après data/game/stairs.json : toute valeur absente ou invalide prend la valeur de repli.
export function stairParams(raw) {
  const r = isObject(raw) ? raw : {};
  const d = STAIR_DEFAULTS;
  return {
    stairTime: posNum(r.stairTime, d.stairTime),
    stairMaxAtOnce: isNum(r.stairMaxAtOnce) && r.stairMaxAtOnce >= 1 ? Math.floor(r.stairMaxAtOnce) : d.stairMaxAtOnce,
    stairCooldownPlayer: nonNeg(r.stairCooldownPlayer, d.stairCooldownPlayer),
    stairGraceAfter: nonNeg(r.stairGraceAfter, d.stairGraceAfter),
    arrivalPush: nonNeg(r.arrivalPush, d.arrivalPush),
    arrivalPushRadius: nonNeg(r.arrivalPushRadius, d.arrivalPushRadius),
    triggerMin: posNum(r.triggerMin, d.triggerMin),
    triggerReach: posNum(r.triggerReach, d.triggerReach),
    arrivalWait: nonNeg(r.arrivalWait, d.arrivalWait),
    fadeOut: posNum(r.fadeOut, d.fadeOut),
    fadeIn: posNum(r.fadeIn, d.fadeIn),
    fadeLockReduced: nonNeg(r.fadeLockReduced, d.fadeLockReduced),
  };
}

const idSet = (ids) => new Set(Array.isArray(ids) ? ids.filter((id) => typeof id === 'string') : ids instanceof Set ? [...ids].filter((id) => typeof id === 'string') : []);
const stairList = (stairs) => (Array.isArray(stairs) ? stairs.filter((s) => isObject(s) && typeof s.id === 'string' && isObject(s.floors)) : []);

// État de chaque escalier : [{ id, door, planned, usable }]. Un escalier est utilisable si sa porte est ouverte (openDoors) et n'est pas « planned » ;
// un escalier fermé n'est jamais déclenchable.
export function stairState(stairs, openDoors) {
  const open = idSet(openDoors);
  return stairList(stairs).map((s) => {
    const planned = s.planned === true;
    const door = typeof s.door === 'string' ? s.door : null;
    return { id: s.id, door, planned, usable: !planned && door !== null && open.has(door) };
  });
}

// Zones de déclenchement des escaliers utilisables de l'étage `floor` : [{ stair, door, floor, x, y, w, h, cx, cy }] (rectangle libre au pied de l'emprise).
export function stairTriggers(stairs, floor, openDoors) {
  const f = isFloorId(floor) ? floor : DEFAULT_FLOOR;
  const usable = new Set(stairState(stairs, openDoors).filter((s) => s.usable).map((s) => s.id));
  const out = [];
  for (const s of stairList(stairs)) {
    if (!usable.has(s.id)) continue;
    const t = s.floors[f]?.trigger;
    if (!validRect(t)) continue;
    out.push({ stair: s.id, door: s.door, floor: f, x: t.x, y: t.y, w: t.w, h: t.h, cx: t.x + t.w / 2, cy: t.y + t.h / 2 });
  }
  return out;
}

// Le centre du joueur est-il dans une zone de déclenchement ? Renvoie la zone (la plus proche de son centre s'il y en a plusieurs), sinon null.
export function stairHit(player, triggers) {
  if (!isObject(player) || !isNum(player.x) || !isNum(player.y)) return null;
  let best = null;
  let bestD = Infinity;
  for (const t of Array.isArray(triggers) ? triggers : []) {
    if (!isObject(t) || ![t.x, t.y, t.w, t.h].every(isNum)) continue;
    if (player.x < t.x || player.x > t.x + t.w || player.y < t.y || player.y > t.y + t.h) continue;
    const d = Math.hypot(player.x - (t.x + t.w / 2), player.y - (t.y + t.h / 2));
    if (d < bestD) {
      bestD = d;
      best = t;
    }
  }
  return best;
}

// Point d'arrivée de l'escalier à l'étage `toFloor` : { x, y }, ou null si l'escalier ou l'étage est inconnu.
export function stairArrival(stair, toFloor) {
  const a = isObject(stair) && isObject(stair.floors) && isFloorId(toFloor) ? stair.floors[toFloor]?.arrival : null;
  return isObject(a) && isNum(a.x) && isNum(a.y) ? { x: a.x, y: a.y } : null;
}

// Rectangle plein (emprise) de l'escalier à l'étage `floor`, { x, y, w, h }, ou null.
export function stairSolid(stair, floor) {
  const r = isObject(stair) && isObject(stair.floors) && isFloorId(floor) ? stair.floors[floor]?.solid : null;
  return validRect(r) ? { x: r.x, y: r.y, w: r.w, h: r.h } : null;
}

// Points de passage des zombies de l'étage `fromFloor` : [{ stair, door, from, to, x, y, rect, arrival }] pour les escaliers utilisables ; (x, y) est le centre de
// la zone de déclenchement de l'étage de départ, arrival le point où l'on arrive à l'autre étage.
export function portalsFor(stairs, fromFloor, openDoors) {
  const from = isFloorId(fromFloor) ? fromFloor : DEFAULT_FLOOR;
  const to = otherFloor(from);
  const byId = new Map(stairList(stairs).map((s) => [s.id, s]));
  return stairTriggers(stairs, from, openDoors).map((t) => {
    const arrival = stairArrival(byId.get(t.stair), to);
    return { stair: t.stair, door: t.door, from, to, x: t.cx, y: t.cy, rect: { x: t.x, y: t.y, w: t.w, h: t.h }, arrival };
  }).filter((p) => p.arrival !== null);
}

// Délai et verrou anti-rebond du joueur : cooldown (secondes restantes) et lock (escalier dont le joueur doit d'abord sortir de la zone).
export const createStairWatch = () => ({ cooldown: 0, lock: null });

const safeWatch = (w) => ({ cooldown: Math.max(0, num(w?.cooldown)), lock: typeof w?.lock === 'string' ? w.lock : null });

// Avance le délai (dt borné à 0,05 s ; 0 en pause) et cherche un déclenchement. triggers : stairTriggers de l'étage du joueur. Renvoie { watch, trigger } ;
// trigger est la zone à franchir (jamais pendant le délai, jamais tant que le joueur n'est pas sorti de la zone du dernier escalier pris).
export function stepStairWatch(watch, dt, player, triggers) {
  const w = safeWatch(watch);
  const cooldown = Math.max(0, w.cooldown - clampDt(dt));
  const hit = stairHit(player, triggers);
  let lock = w.lock;
  if (lock !== null && (hit === null || hit.stair !== lock)) lock = null; // sorti de la zone : de nouveau armé
  if (hit !== null && cooldown <= 1e-9 && lock === null) return { watch: { cooldown, lock: hit.stair }, trigger: hit };
  return { watch: { cooldown, lock }, trigger: null };
}

// Démarre le délai de 0,8 s après un changement d'étage, en gardant le verrou sur l'escalier pris : le joueur ne le reprend qu'après être sorti de sa zone.
export function startStairCooldown(watch, stairId, params) {
  const w = safeWatch(watch);
  return { cooldown: nonNeg(params?.stairCooldownPlayer, STAIR_DEFAULTS.stairCooldownPlayer), lock: typeof stairId === 'string' ? stairId : w.lock };
}

// Zombies à repousser autour du point d'arrivée du joueur : { x, y, radius, distance } (même routine que le repoussement de la chute, voir player-down.js).
export const arrivalKnockback = (point, params) => ({ center: { x: num(point?.x), y: num(point?.y) }, radius: nonNeg(params?.arrivalPushRadius, STAIR_DEFAULTS.arrivalPushRadius), distance: nonNeg(params?.arrivalPush, STAIR_DEFAULTS.arrivalPush) });

export { FLOOR_IDS };
