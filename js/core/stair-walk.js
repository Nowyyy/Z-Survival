// Escaliers physiques (lot 3e, mise à jour du propriétaire : on marche dans l'escalier, plus de téléportation). Un escalier a un chemin (walk.path : points
// { x, y, t } du pied au haut, t = fraction de la hauteur d'un étage, 0 au pied et 1 en haut). Le joueur qui entre dans la zone de déclenchement en marchant vers
// l'escalier le prend : sa position suit le chemin, avancée par la composante de son mouvement le long du chemin (il peut faire demi-tour), sa hauteur est t × floorLift,
// et son étage logique change à mi-hauteur. Pur : n'utilise que ses arguments, renvoie de nouveaux objets, aucune horloge, aucun hasard, aucune exception sur des
// entrées inattendues.
import { isFloorId } from './floors.js';
import { clampDt, isNum, num } from './vec.js';

const isObject = (o) => o !== null && typeof o === 'object' && !Array.isArray(o);
const validPoint = (q) => isObject(q) && isNum(q.x) && isNum(q.y) && isNum(q.t);

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

// Début d'une montée ou d'une descente : { stair, s, floor (étage logique), from (étage de départ), auto }. Depuis le rez-de-chaussée on part du premier point, depuis
// l'étage du dernier. `auto` : le chemin est suivi sans que le joueur marche (hook de test useStair).
export function startWalk(stairId, from, auto = false) {
  if (typeof stairId !== 'string' || !isFloorId(from)) return null;
  return { stair: stairId, s: from === 'etage' ? 1 : 0, floor: from, from, auto: auto === true, sign: from === 'etage' ? -1 : 1 };
}

// Avance d'un pas. dir : mouvement du joueur (norme 0 à 1) ; speed : vitesse du joueur (unités par seconde) ; dt est borné à 0,05 s (0 en pause).
// Renvoie { walk, point: { x, y, t }, floor (étage logique, change à mi-hauteur), done } ; done vaut l'étage du bout atteint ('rdc' au premier point, 'etage' au dernier)
// quand le joueur sort de l'escalier, sinon null. Un chemin invalide termine tout de suite.
export function stepWalk(walk, path, { dir = { x: 0, y: 0 }, speed = 0, dt = 0 } = {}) {
  const p = cleanPath(path);
  if (!isObject(walk) || !isNum(walk.s) || !p) return { walk: null, point: { x: 0, y: 0, t: 0 }, floor: 'rdc', done: walk?.from ?? 'rdc' };
  const total = pathLength(p);
  const sign = walk.sign === -1 ? -1 : 1;
  const here = pointAt(p, walk.s);
  const wanted = isObject(dir) && isNum(dir.x) && isNum(dir.y) ? dir : { x: 0, y: 0 };
  const mag = Math.min(1, Math.hypot(wanted.x, wanted.y));
  let along;
  if (walk.auto) along = walk.from === 'etage' ? -1 : 1;
  else {
    const seg = segmentAt(p, walk.s, sign);
    const a = p[seg - 1];
    const b = p[seg];
    const last = seg === p.length - 1 && a.t >= 1 && b.t >= 1;
    const first = seg === 1 && a.t <= 0 && b.t <= 0;
    if ((last || first) && mag > 1e-6) {
      // Palier (tronçon plat du premier ou du dernier point) : tout mouvement qui ne fait pas demi-tour mène vers la sortie ; un mouvement vers l'escalier y entre.
      const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
      const out = last ? { x: (b.x - a.x) / len, y: (b.y - a.y) / len } : { x: (a.x - b.x) / len, y: (a.y - b.y) / len };
      const inward = (-(wanted.x * out.x + wanted.y * out.y)) / mag;
      along = (inward >= 0.5 ? -1 : 1) * (last ? 1 : -1) * mag;
    } else along = wanted.x * here.tx + wanted.y * here.ty;
  }
  const s = total > 0 ? Math.min(1, Math.max(0, walk.s + (along * Math.max(0, num(speed)) * clampDt(dt)) / total)) : walk.s;
  const point = pointAt(p, s);
  let floor = isFloorId(walk.floor) ? walk.floor : walk.from;
  if (floor === 'rdc' && point.t >= SWAP_UP) floor = 'etage';
  else if (floor === 'etage' && point.t < SWAP_DOWN) floor = 'rdc';
  // Sortie : au premier point en allant vers lui, au dernier en allant vers lui (rester sur place au départ n'est pas sortir).
  const delta = s - walk.s;
  const done = s <= 0 && (delta < 0 || along < 0) ? 'rdc' : s >= 1 && (delta > 0 || along > 0) ? 'etage' : null;
  return { walk: done === null ? { ...walk, s, floor, sign: s > walk.s ? 1 : s < walk.s ? -1 : sign } : null, point: { x: point.x, y: point.y, t: point.t }, floor: done === null ? floor : done, done };
}

// Tronçon (1 à n - 1) qui contient la fraction s ; à un sommet, le suivant si le dernier mouvement allait vers l'avant (sign 1), le précédent sinon.
function segmentAt(p, s, sign) {
  const total = pathLength(p);
  const at = Math.min(1, Math.max(0, s)) * total;
  let walked = 0;
  for (let i = 1; i < p.length; i += 1) {
    const end = walked + Math.hypot(p[i].x - p[i - 1].x, p[i].y - p[i - 1].y);
    if (at < end - 1e-9 || (sign < 0 && at <= end + 1e-9) || i === p.length - 1) return i;
    walked = end;
  }
  return p.length - 1;
}

// Hauteur (unités du jeu) d'après t et la hauteur d'un étage.
export const heightOf = (t, lift) => Math.min(1, Math.max(0, num(t))) * Math.max(0, num(lift));
