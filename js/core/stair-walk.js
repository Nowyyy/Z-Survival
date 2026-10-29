// Escaliers physiques (lot 3e, mise à jour du propriétaire : on marche librement dans l'escalier, plus de téléportation ni de rails). Un escalier a un chemin
// (walk.path : points { x, y, t } du pied au haut, t = fraction de la hauteur d'un étage, 0 au pied et 1 en haut) et une largeur. Le joueur qui entre dans la zone de
// déclenchement en marchant vers l'escalier marche dans un « tube » autour du chemin : il se déplace librement (devant, derrière, de côté dans la largeur), ses côtés
// sont des rambardes, ses deux bouts sont ouverts. Sa hauteur ne dépend que de sa position le long du chemin (t × floorLift) ; son étage logique change à mi-hauteur ;
// il sort de l'escalier en franchissant un bout. Pur : n'utilise que ses arguments, renvoie de nouveaux objets, aucune horloge, aucun hasard, aucune exception sur des
// entrées inattendues.
import { isFloorId } from './floors.js';
import { clampDt, isNum, num } from './vec.js';

const isObject = (o) => o !== null && typeof o === 'object' && !Array.isArray(o);
const validPoint = (q) => isObject(q) && isNum(q.x) && isNum(q.y) && isNum(q.t);
const EPS = 1e-9;
const BEYOND = 2; // unités au-delà d'un bout du chemin pour en sortir

// Bascule de l'étage logique : vers l'étage à t ≥ UP, vers le rez-de-chaussée à t < DOWN (hystérésis : pas d'aller-retour en restant à mi-hauteur).
export const SWAP_UP = 0.52;
export const SWAP_DOWN = 0.48;

// Chemin nettoyé : tableau de { x, y, t } (au moins 2 points valides) ou null.
export function cleanPath(path) {
  if (!Array.isArray(path)) return null;
  const out = path.filter(validPoint).map((q) => ({ x: q.x, y: q.y, t: Math.min(1, Math.max(0, q.t)) }));
  return out.length >= 2 && out.length === path.length ? out : null;
}

// Longueur du chemin.
export function pathLength(path) {
  const p = cleanPath(path);
  if (!p) return 0;
  let n = 0;
  for (let i = 1; i < p.length; i += 1) n += Math.hypot(p[i].x - p[i - 1].x, p[i].y - p[i - 1].y);
  return n;
}

// Point du chemin à la fraction s (0 au premier point, 1 au dernier, selon la longueur parcourue) : { x, y, t, tx, ty } (tangente unitaire du tronçon, la dernière si s = 1).
export function pointAt(path, s) {
  const p = cleanPath(path);
  if (!p) return { x: 0, y: 0, t: 0, tx: 0, ty: 0 };
  const total = pathLength(p);
  const at = Math.min(1, Math.max(0, num(s))) * total;
  let walked = 0;
  for (let i = 1; i < p.length; i += 1) {
    const len = Math.hypot(p[i].x - p[i - 1].x, p[i].y - p[i - 1].y);
    if (at <= walked + len || i === p.length - 1) {
      const k = len > 0 ? Math.min(1, Math.max(0, (at - walked) / len)) : 0;
      return { x: p[i - 1].x + (p[i].x - p[i - 1].x) * k, y: p[i - 1].y + (p[i].y - p[i - 1].y) * k, t: p[i - 1].t + (p[i].t - p[i - 1].t) * k, tx: len > 0 ? (p[i].x - p[i - 1].x) / len : 0, ty: len > 0 ? (p[i].y - p[i - 1].y) / len : 0 };
    }
    walked += len;
  }
  return { x: p[p.length - 1].x, y: p[p.length - 1].y, t: p[p.length - 1].t, tx: 0, ty: 0 };
}

// Projection d'un point sur le chemin : le point du chemin le plus proche { x, y, t, tx, ty }, sa fraction s, la distance au chemin, et de combien le point dépasse le premier
// bout (beforeStart, en unités, 0 sinon) ou le dernier (pastEnd). Un point qui dépasse un bout est au-delà de l'escalier, pas à côté.
export function project(path, point) {
  const p = cleanPath(path);
  if (!p || !isObject(point) || !isNum(point.x) || !isNum(point.y)) return { x: 0, y: 0, t: 0, tx: 0, ty: 0, s: 0, dist: Infinity, beforeStart: 0, pastEnd: 0 };
  const total = pathLength(p);
  let best = null;
  let walked = 0;
  for (let i = 1; i < p.length; i += 1) {
    const ax = p[i - 1].x;
    const ay = p[i - 1].y;
    const dx = p[i].x - ax;
    const dy = p[i].y - ay;
    const len = Math.hypot(dx, dy);
    const raw = len > 0 ? ((point.x - ax) * dx + (point.y - ay) * dy) / len : 0; // distance signée le long du tronçon
    const k = len > 0 ? Math.min(len, Math.max(0, raw)) : 0;
    const qx = ax + (len > 0 ? (dx / len) * k : 0);
    const qy = ay + (len > 0 ? (dy / len) * k : 0);
    const dist = Math.hypot(point.x - qx, point.y - qy);
    if (best === null || dist < best.dist - EPS) {
      best = { x: qx, y: qy, t: p[i - 1].t + (p[i].t - p[i - 1].t) * (len > 0 ? k / len : 0), tx: len > 0 ? dx / len : 0, ty: len > 0 ? dy / len : 0, s: total > 0 ? (walked + k) / total : 0, dist, beforeStart: i === 1 ? Math.max(0, -raw) : 0, pastEnd: i === p.length - 1 ? Math.max(0, raw - len) : 0 };
    }
    walked += len;
  }
  return best;
}

// Direction unitaire dans laquelle il faut marcher pour entrer dans l'escalier depuis l'étage `floor` (du bout du chemin vers l'intérieur) : { x, y }, ou null.
export function entryDirection(path, floor) {
  const p = cleanPath(path);
  if (!p || !isFloorId(floor)) return null;
  const a = floor === 'etage' ? p[p.length - 1] : p[0];
  const b = floor === 'etage' ? p[p.length - 2] : p[1];
  const d = Math.hypot(b.x - a.x, b.y - a.y);
  return d > 0 ? { x: (b.x - a.x) / d, y: (b.y - a.y) / d } : null;
}

// Le joueur veut-il entrer ? Son mouvement (dir, norme 0 à 1) a une composante d'au moins `min` (0,3) vers l'escalier.
export function wantsStairs(dir, entry, min = 0.3) {
  if (!isObject(dir) || !isObject(entry) || !isNum(dir.x) || !isNum(dir.y)) return false;
  return dir.x * entry.x + dir.y * entry.y >= min;
}

// Début d'une montée ou d'une descente : { stair, floor (étage logique), from (étage de départ), auto, armed }. `auto` : le chemin est suivi sans que le joueur marche
// (hook de test useStair). `armed` : le joueur a rejoint le chemin ; avant cela, dépasser un bout ne fait pas sortir (il entre dans l'escalier).
export function startWalk(stairId, from, auto = false) {
  if (typeof stairId !== 'string' || !isFloorId(from)) return null;
  return { stair: stairId, floor: from, from, auto: auto === true, armed: false };
}

// Avance d'un pas. pos : position du joueur ; dir : son mouvement (norme 0 à 1) ; speed : sa vitesse (unités par seconde) ; width : largeur de l'escalier ; radius : rayon
// du joueur ; dt est borné à 0,05 s (0 en pause). Le joueur va où il veut mais reste dans le tube (distance au chemin ≤ width / 2 - radius), sauf au-delà des deux bouts.
// Renvoie { walk, pos: { x, y }, point: { t, s }, floor (étage logique, change à mi-hauteur), done } ; done vaut l'étage du bout franchi ('rdc' au premier point, 'etage'
// au dernier) quand le joueur sort de l'escalier, sinon null. Un chemin invalide termine tout de suite.
export function stepWalk(walk, path, { pos = { x: 0, y: 0 }, dir = { x: 0, y: 0 }, speed = 0, dt = 0, width = 100, radius = 18 } = {}) {
  const p = cleanPath(path);
  const at = isObject(pos) && isNum(pos.x) && isNum(pos.y) ? { x: pos.x, y: pos.y } : null;
  if (!isObject(walk) || !p || at === null) return { walk: null, pos: at ?? { x: 0, y: 0 }, point: { t: 0, s: 0 }, floor: 'rdc', done: walk?.from ?? 'rdc' };
  let want = isObject(dir) && isNum(dir.x) && isNum(dir.y) ? { x: dir.x, y: dir.y } : { x: 0, y: 0 };
  const here = project(p, at);
  if (walk.auto) {
    // Suit le chemin tout seul : dans le sens de la montée depuis le rez-de-chaussée, de la descente depuis l'étage ; il vise un point 40 unités plus loin (il tourne
    // aux virages) et, près du bout, un point 30 unités au-delà pour en sortir.
    const sign = walk.from === 'etage' ? -1 : 1;
    const total = pathLength(p);
    const ahead = here.s + (sign * 40) / Math.max(total, 1);
    let target;
    if (ahead >= 1 || ahead <= 0) {
      const end = pointAt(p, sign > 0 ? 1 : 0);
      target = { x: end.x + end.tx * sign * 30, y: end.y + end.ty * sign * 30 };
    } else target = pointAt(p, ahead);
    const d = Math.hypot(target.x - at.x, target.y - at.y);
    want = d > 1e-9 ? { x: (target.x - at.x) / d, y: (target.y - at.y) / d } : { x: 0, y: 0 };
  }
  const mag = Math.hypot(want.x, want.y);
  if (mag > 1) want = { x: want.x / mag, y: want.y / mag };
  const step = Math.max(0, num(speed)) * clampDt(dt);
  let x = at.x + want.x * step;
  let y = at.y + want.y * step;
  let q = project(p, { x, y });
  // Rambardes : au-delà d'un bout, le tube est ouvert ; ailleurs le joueur est ramené dans la largeur (glisse le long de la rambarde).
  const allowed = Math.max(0, num(width, 100) / 2 - Math.max(0, num(radius, 18)));
  const open = q.beforeStart > 0 || q.pastEnd > 0;
  if (!open && q.dist > allowed && q.dist > 0) {
    const k = allowed / q.dist;
    x = q.x + (x - q.x) * k;
    y = q.y + (y - q.y) * k;
    q = project(p, { x, y });
  }
  const armed = walk.armed === true || (q.beforeStart <= 0 && q.pastEnd <= 0);
  let floor = isFloorId(walk.floor) ? walk.floor : walk.from;
  if (floor === 'rdc' && q.t >= SWAP_UP) floor = 'etage';
  else if (floor === 'etage' && q.t < SWAP_DOWN) floor = 'rdc';
  const done = armed && q.beforeStart > BEYOND ? 'rdc' : armed && q.pastEnd > BEYOND ? 'etage' : null;
  return { walk: done === null ? { ...walk, floor, armed } : null, pos: { x, y }, point: { t: q.t, s: q.s }, floor: done === null ? floor : done, done };
}

// Hauteur (unités du jeu) d'après t et la hauteur d'un étage.
export const heightOf = (t, lift) => Math.min(1, Math.max(0, num(t))) * Math.max(0, num(lift));
