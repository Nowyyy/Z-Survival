// Laser : rayon contre des cercles. Sert à tracer le laser et à décider qu'un tir part ; ne produit JAMAIS de dégâts.
import { firstOnSegment } from './collision.js';
import { fromAngle, isNum, num } from './vec.js';

// Plus petit t >= 0 où le rayon (origine o, direction unitaire d) touche le cercle ; null sinon. Tangent = touché.
export function rayCircle(o, d, circle) {
  const fx = num(o?.x) - num(circle?.x);
  const fy = num(o?.y) - num(circle?.y);
  const r = isNum(circle?.r) && circle.r > 0 ? circle.r : 0;
  const b = fx * d.x + fy * d.y;
  const c = fx * fx + fy * fy - r * r;
  if (c <= 0) return 0;
  const disc = b * b - c;
  if (disc < -1e-9 * (b * b + Math.abs(c))) return null;
  const t = -b - Math.sqrt(Math.max(0, disc));
  return t >= 0 ? t : null;
}

// Distance jusqu'au bord de la zone libre le long du rayon (origine supposée dedans).
export function rayToBounds(o, d, bounds) {
  const ox = num(o?.x);
  const oy = num(o?.y);
  const ts = [];
  if (d.x > 1e-12) ts.push((num(bounds?.maxX) - ox) / d.x);
  else if (d.x < -1e-12) ts.push((num(bounds?.minX) - ox) / d.x);
  if (d.y > 1e-12) ts.push((num(bounds?.maxY) - oy) / d.y);
  else if (d.y < -1e-12) ts.push((num(bounds?.minY) - oy) / d.y);
  return ts.length ? Math.max(0, Math.min(...ts)) : Infinity;
}

// enemies : [{ id, x, y, r }] ; obstacles : rectangles pleins { id, x, y, w, h } qui arrêtent le rayon (aucun par défaut).
// Renvoie { end, length, hit, stoppedByWall, stoppedBy } ; hit = { id, distance } de l'ennemi le plus proche visible, ou null ;
// stoppedBy = { id, distance } de l'obstacle qui arrête le rayon, ou null. Un ennemi caché derrière un obstacle n'est jamais touché.
export function castRay(origin, angle, maxLength, enemies, bounds, obstacles = []) {
  const o = { x: num(origin?.x), y: num(origin?.y) };
  const d = fromAngle(angle);
  const range = isNum(maxLength) && maxLength > 0 ? maxLength : 0;
  const wall = bounds ? rayToBounds(o, d, bounds) : Infinity;
  let limit = Math.min(range, wall);
  let blocker = null;
  const first = firstOnSegment(o.x, o.y, o.x + d.x * limit, o.y + d.y * limit, obstacles);
  if (first) {
    blocker = { id: first.obstacle.id, distance: first.t * limit };
    limit = blocker.distance;
  }
  let hit = null;
  for (const enemy of Array.isArray(enemies) ? enemies : []) {
    if (!enemy || !isNum(enemy.x) || !isNum(enemy.y)) continue;
    const t = rayCircle(o, d, enemy);
    // Un ennemi pile au bord d'un obstacle est derrière lui : l'obstacle passe d'abord.
    if (t !== null && (blocker ? t < limit : t <= limit) && (hit === null || t < hit.distance)) hit = { id: enemy?.id, distance: t };
  }
  const len = hit ? hit.distance : limit;
  return { end: { x: o.x + d.x * len, y: o.y + d.y * len }, length: len, hit, stoppedByWall: !hit && !blocker && wall < range, stoppedBy: hit ? null : blocker };
}
