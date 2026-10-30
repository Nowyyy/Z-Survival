// Zombies sur deux étages (lot 3e) : franchissement des escaliers. Un zombie « dedans » qui n'est pas à l'étage du joueur suit le champ de flux vers l'escalier utilisable
// le plus proche (nav.js, buildPortalField ; enemy-ai.js l'exécute) ; arrivé à moins de triggerReach du centre de la zone de déclenchement, il passe en mode « escalier » :
// il marche dans l'escalier comme le joueur (stair-walk.js : libre dans la largeur, hauteur selon sa position, étage logique à mi-hauteur), vers le joueur s'il marche dedans,
// le même étage logique que lui, sinon vers le bout opposé ; on peut le toucher et il peut toucher. Il sort par un bout et reprend son comportement. stairMaxAtOnce zombies
// au plus à la fois par escalier (les autres attendent à la zone). Pur : le temps (dt borné à 0,05 s), les
// points de passage (stairs.js, portalsFor) et les paramètres (data/game/stairs.json) arrivent en argument ; aucun argument n'est modifié (gelés acceptés), aucune
// exception, aucun hasard (égalités départagées par l'identifiant), déterministe.
import { DEFAULT_FLOOR, floorOf, isFloorId } from './floors.js';
import { stairParams } from './stairs.js';
import { pathLength, pointAt, startWalk, stepWalk } from './stair-walk.js';
import { isNum, num } from './vec.js';

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

// enemies : tous les zombies, des deux étages. input : { playerFloor, follow (escalier où marche le joueur, facultatif), player ({ x, y }, le vrai joueur), portals: { rdc: [...],
// etage: [...] } (portalsFor de chaque étage), walks ({ idEscalier: { path, width } }), params (stairs.json) }.
// Renvoie { enemies (nouveaux objets, même ordre), events }. events : { type: 'stairStart' | 'stairArrive', id, stair, from, to }.
export function stepStairZombies(enemies, input, dt) {
  const list = Array.isArray(enemies) ? enemies : [];
  const p = stairParams(input?.params);
  const events = [];
  const playerFloor = isFloorId(input?.playerFloor) ? input.playerFloor : DEFAULT_FLOOR;
  const follow = typeof input?.follow === 'string' ? input.follow : null; // escalier où marche le joueur : les zombies de son étage arrivés à son bout le prennent aussi
  const out = list.map((e) => (isObject(e) ? { ...e } : e));
  const live = out.filter((e) => isObject(e) && isNum(e.x) && isNum(e.y));
  const walks = isObject(input?.walks) ? input.walks : {};
  const player = isObject(input?.player) && isNum(input.player.x) && isNum(input.player.y) ? input.player : null;
  // 1. Marche dans l'escalier : vers le joueur s'il marche dans le même escalier, sinon vers le bout qui donne sur l'étage du joueur ; sortie par un bout.
  for (const e of live.filter((q) => q.mode === STAIR_MODE).sort(byId)) {
    const def = walks[e.stair];
    const from = isFloorId(e.stairFrom) ? e.stairFrom : DEFAULT_FLOOR;
    const walk = isObject(e.walk) ? e.walk : startWalk(e.stair, from);
    if (!def || !walk || pathLength(def.path) <= 0) {
      Object.assign(e, { mode: 'dedans', stair: null, walk: null, stairT: 0, stairFrom: null, stairTo: null });
      continue;
    }
    // Le joueur marche dans cet escalier : droit sur lui. Sinon, vers le bout de l'escalier qui donne sur l'étage du joueur, puis dehors (il sort et le poursuit à son étage).
    let target;
    if (player && follow === e.stair) target = player;
    else {
      const last = playerFloor === 'etage';
      const end = pointAt(def.path, last ? 1 : 0);
      const sign = last ? 1 : -1;
      target = { x: end.x + end.tx * sign * 30, y: end.y + end.ty * sign * 30 };
    }
    const d = Math.hypot(target.x - e.x, target.y - e.y);
    const dir = d > 1e-9 ? { x: (target.x - e.x) / d, y: (target.y - e.y) / d } : { x: 0, y: 0 };
    const r = stepWalk(walk, def.path, { pos: { x: e.x, y: e.y }, dir, speed: num(e.speed), dt, width: def.width, radius: num(e.r, 18) });
    Object.assign(e, { x: r.pos.x, y: r.pos.y, stairT: r.point.t, fx: dir.x, fy: dir.y, floor: r.floor, walk: r.walk });
    if (r.done !== null) {
      events.push({ type: 'stairArrive', id: e.id, stair: e.stair, from: e.stairFrom, to: r.done });
      Object.assign(e, { mode: 'dedans', stair: null, walk: null, stairT: 0, stairFrom: null, stairTo: null, stuckT: 0, ax: e.x, ay: e.y, push: 0 });
    }
  }
  // 2. Départs : un zombie « dedans » d'un autre étage que le joueur, arrivé à la zone de déclenchement, entre dans l'escalier s'il reste de la place ; si le joueur marche
  // dans cet escalier, un zombie de son étage arrivé au bout de cet escalier y entre aussi.
  const load = stairLoad(out);
  const seekers = live.filter((e) => seeksStair(e, input?.playerFloor) || (follow !== null && e.mode === 'dedans' && floorOf(e) === playerFloor)).sort(byId);
  for (const e of seekers) {
    const portal = reachedPortal(e, input?.portals, p.triggerReach);
    if (portal && !seeksStair(e, input?.playerFloor) && portal.stair !== follow) continue;
    if (!portal || (load[portal.stair] ?? 0) >= p.stairMaxAtOnce || !walks[portal.stair]) continue;
    load[portal.stair] = (load[portal.stair] ?? 0) + 1;
    events.push({ type: 'stairStart', id: e.id, stair: portal.stair, from: portal.from, to: portal.to });
    Object.assign(e, { mode: STAIR_MODE, stair: portal.stair, stairT: portal.from === 'etage' ? 1 : 0, stairFrom: portal.from, stairTo: portal.to, walk: startWalk(portal.stair, portal.from), x: portal.x, y: portal.y, slot: null, window: e.window ?? null });
  }
  return { enemies: out, events };
}
