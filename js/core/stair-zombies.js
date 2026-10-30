// Zombies sur deux étages (lot 3e) : franchissement des escaliers. Un zombie « dedans » qui n'est pas à l'étage du joueur suit le champ de flux vers l'escalier utilisable
// le plus proche (nav.js, buildPortalField ; enemy-ai.js l'exécute) ; arrivé à moins de triggerReach du centre de la zone de déclenchement, il passe en mode « escalier »
// pendant stairTime secondes (pose escalade), puis arrive au point d'arrivée de l'autre étage (floor change) et reprend son comportement. stairMaxAtOnce zombies au plus
// à la fois par escalier (les autres attendent à la zone) ; si le point d'arrivée est occupé par un autre zombie, il attend en file. Pur : le temps (dt borné à 0,05 s), les
// points de passage (stairs.js, portalsFor) et les paramètres (data/game/stairs.json) arrivent en argument ; aucun argument n'est modifié (gelés acceptés), aucune
// exception, aucun hasard (égalités départagées par l'identifiant), déterministe.
import { DEFAULT_FLOOR, floorOf, isFloorId } from './floors.js';
import { stairParams } from './stairs.js';
import { clampDt, isNum, num } from './vec.js';

export const STAIR_MODE = 'escalier';
const isObject = (o) => o !== null && typeof o === 'object' && !Array.isArray(o);
const byId = (a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
const listOf = (portals, floor) => (isObject(portals) && Array.isArray(portals[floor]) ? portals[floor].filter((p) => isObject(p) && isNum(p.x) && isNum(p.y) && isObject(p.arrival) && isNum(p.arrival.x) && isNum(p.arrival.y) && isFloorId(p.to)) : []);

// Vrai si un zombie cherche un escalier : « dedans » et pas à l'étage du joueur.
export const seeksStair = (enemy, playerFloor) => isObject(enemy) && enemy.mode === 'dedans' && floorOf(enemy) !== (isFloorId(playerFloor) ? playerFloor : DEFAULT_FLOOR);

// Nombre de zombies en cours de franchissement de chaque escalier : { idEscalier: n }.
export function stairLoad(enemies) {
  const load = {};
  for (const e of Array.isArray(enemies) ? enemies : []) if (isObject(e) && e.mode === STAIR_MODE && typeof e.stair === 'string') load[e.stair] = (load[e.stair] ?? 0) + 1;
  return load;
}

// Point de passage le plus proche (en ligne droite) du zombie dans la portée triggerReach, ou null.
export function reachedPortal(enemy, portals, reach) {
  if (!isObject(enemy) || !isNum(enemy.x) || !isNum(enemy.y)) return null;
  let best = null;
  let bestD = Infinity;
  for (const p of listOf(portals, floorOf(enemy))) {
    const d = Math.hypot(enemy.x - p.x, enemy.y - p.y);
    if (d <= reach && d < bestD) {
      bestD = d;
      best = p;
    }
  }
  return best;
}

// enemies : tous les zombies, des deux étages. input : { playerFloor, follow (escalier où marche le joueur, facultatif), portals: { rdc: [...], etage: [...] } (portalsFor de chaque étage), params (stairs.json) }.
// Renvoie { enemies (nouveaux objets, même ordre), events }. events : { type: 'stairStart' | 'stairArrive', id, stair, from, to }.
export function stepStairZombies(enemies, input, dt) {
  const list = Array.isArray(enemies) ? enemies : [];
  const p = stairParams(input?.params);
  const step = clampDt(dt);
  const events = [];
  const playerFloor = isFloorId(input?.playerFloor) ? input.playerFloor : DEFAULT_FLOOR;
  const follow = typeof input?.follow === 'string' ? input.follow : null; // escalier où marche le joueur : les zombies de son étage arrivés à son bout le prennent aussi
  const out = list.map((e) => (isObject(e) ? { ...e } : e));
  const live = out.filter((e) => isObject(e) && isNum(e.x) && isNum(e.y));
  // 1. Franchissements en cours : le temps avance ; à la fin, arrivée si le point est libre (aucun autre zombie du même étage à moins de la somme des rayons).
  const arrivals = live.filter((e) => e.mode === STAIR_MODE).sort(byId);
  for (const e of arrivals) {
    e.stairT = num(e.stairT) + step;
    if (e.stairT + 1e-9 < p.stairTime) continue;
    const to = isFloorId(e.stairTo) ? e.stairTo : DEFAULT_FLOOR;
    const at = isObject(e.arrival) && isNum(e.arrival.x) && isNum(e.arrival.y) ? { x: e.arrival.x, y: e.arrival.y } : null;
    if (!at) continue;
    // Le point d'arrivée, sinon un des 8 points à 30 autour de lui (au plus 30 : la zone de 40 autour de l'arrivée est libre) ; tous occupés : il attend en file.
    const spots = [{ x: at.x, y: at.y }, ...Array.from({ length: 8 }, (_, k) => ({ x: at.x + Math.cos((k * Math.PI) / 4) * 30, y: at.y + Math.sin((k * Math.PI) / 4) * 30 }))];
    const taken = (q) => live.some((o) => o !== e && o.mode !== STAIR_MODE && floorOf(o) === to && Math.hypot(num(o.x) - q.x, num(o.y) - q.y) < num(o.r) + num(e.r));
    // Tous occupés (une meute autour de l'arrivée) : il attend en file au plus arrivalWait s, puis arrive quand même (la séparation des zombies les écarte).
    const spot = spots.find((q) => !taken(q)) ?? (e.stairT >= p.stairTime + p.arrivalWait - 1e-9 ? spots[0] : null);
    if (!spot) continue;
    at.x = spot.x;
    at.y = spot.y;
    events.push({ type: 'stairArrive', id: e.id, stair: e.stair, from: e.stairFrom, to });
    Object.assign(e, { floor: to, x: at.x, y: at.y, mode: 'dedans', stair: null, stairT: 0, stairFrom: null, stairTo: null, arrival: null, stuckT: 0, ax: at.x, ay: at.y, push: 0 });
  }
  // 2. Départs : un zombie « dedans » d'un autre étage que le joueur, arrivé à la zone de déclenchement, monte ou descend s'il reste de la place sur l'escalier.
  const load = stairLoad(out);
  const seekers = live.filter((e) => seeksStair(e, input?.playerFloor) || (follow !== null && e.mode === 'dedans' && floorOf(e) === playerFloor)).sort(byId);
  for (const e of seekers) {
    const portal = reachedPortal(e, input?.portals, p.triggerReach);
    if (portal && !seeksStair(e, input?.playerFloor) && portal.stair !== follow) continue;
    if (!portal || (load[portal.stair] ?? 0) >= p.stairMaxAtOnce) continue;
    load[portal.stair] = (load[portal.stair] ?? 0) + 1;
    events.push({ type: 'stairStart', id: e.id, stair: portal.stair, from: portal.from, to: portal.to });
    Object.assign(e, { mode: STAIR_MODE, stair: portal.stair, stairT: 0, stairFrom: portal.from, stairTo: portal.to, arrival: { x: portal.arrival.x, y: portal.arrival.y }, x: portal.x, y: portal.y, slot: null, window: e.window ?? null });
  }
  return { enemies: out, events };
}
