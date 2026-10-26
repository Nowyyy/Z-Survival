// Collisions d'un cercle contre des rectangles { x, y, w, h } (coin nord-ouest) : glissement le long des obstacles, sans traversée
// aux pas bornés, et segment contre rectangles (laser, balles, ligne de vue). Tout renvoie de nouveaux objets, sans exception.
import { isNum, num } from './vec.js';

export const isRect = (r) => r != null && isNum(r.x) && isNum(r.y) && isNum(r.w) && isNum(r.h) && r.w > 0 && r.h > 0;
export const validRects = (list) => (Array.isArray(list) ? list.filter(isRect) : []);
export const inflateRect = (r, m) => ({ ...r, x: r.x - m, y: r.y - m, w: r.w + 2 * m, h: r.h + 2 * m });

// Distance du point (x, y) au rectangle (0 s'il est dedans).
export function distanceToRect(x, y, r) {
  const dx = Math.max(r.x - x, 0, x - (r.x + r.w));
  const dy = Math.max(r.y - y, 0, y - (r.y + r.h));
  return Math.hypot(dx, dy);
}

// Vrai si le cercle { x, y, r } recouvre le rectangle (un simple contact n'est pas un recouvrement).
export function circleOverlapsRect(c, r) {
  return isRect(r) && distanceToRect(num(c?.x), num(c?.y), r) < Math.max(0, num(c?.r)) - 1e-9;
}

// Distance la plus courte entre deux rectangles (0 s'ils se touchent ou se recouvrent).
export function rectGap(a, b) {
  const dx = Math.max(b.x - (a.x + a.w), 0, a.x - (b.x + b.w));
  const dy = Math.max(b.y - (a.y + a.h), 0, a.y - (b.y + b.h));
  return Math.hypot(dx, dy);
}

// Plus petit t dans [0, 1] où le segment (x0, y0) -> (x1, y1) touche le rectangle ; null sinon. Départ dedans : 0. Tangent : touché.
export function segmentRect(x0, y0, x1, y1, r) {
  if (!isRect(r) || ![x0, y0, x1, y1].every(isNum)) return null;
  const dx = x1 - x0;
  const dy = y1 - y0;
  const p = [-dx, dx, -dy, dy];
  const q = [x0 - r.x, r.x + r.w - x0, y0 - r.y, r.y + r.h - y0];
  let t0 = 0;
  let t1 = 1;
  for (let i = 0; i < 4; i += 1) {
    if (p[i] === 0) {
      if (q[i] < 0) return null;
    } else {
      const t = q[i] / p[i];
      if (p[i] < 0) t0 = Math.max(t0, t);
      else t1 = Math.min(t1, t);
      if (t0 > t1) return null;
    }
  }
  return t0;
}

// Premier obstacle touché par le segment : { t, obstacle } ou null.
export function firstOnSegment(x0, y0, x1, y1, obstacles) {
  let best = null;
  for (const o of validRects(obstacles)) {
    const t = segmentRect(x0, y0, x1, y1, o);
    if (t !== null && (best === null || t < best.t)) best = { t, obstacle: o };
  }
  return best;
}

// Vrai si aucun obstacle (gonflé de margin, pour un cercle de ce rayon) ne coupe le segment.
export function clearSegment(a, b, obstacles, margin = 0) {
  const m = Math.max(0, num(margin));
  return firstOnSegment(num(a?.x), num(a?.y), num(b?.x), num(b?.y), validRects(obstacles).map((o) => inflateRect(o, m))) === null;
}

const clampAxis = (v, lo, hi) => Math.min(Math.max(v, lo), Math.max(lo, hi));

// Position x (ou y) la plus avancée dans le sens du mouvement sans entrer dans un rectangle. other : l'autre coordonnée du cercle.
// Un cercle déjà entré dans un rectangle n'est pas touché ici (pushOut s'en charge).
function slide(axis, from, to, other, r, list) {
  const lo = axis === 'x' ? 'x' : 'y';
  const span = axis === 'x' ? 'w' : 'h';
  const oLo = axis === 'x' ? 'y' : 'x';
  const oSpan = axis === 'x' ? 'h' : 'w';
  let v = to;
  for (let pass = 0; pass <= list.length; pass += 1) {
    let moved = false;
    for (const rect of list) {
      const gap = Math.max(rect[oLo] - other, 0, other - (rect[oLo] + rect[oSpan]));
      if (gap >= r) continue;
      const reach = Math.sqrt(Math.max(0, r * r - gap * gap));
      const before = rect[lo] - reach;
      const after = rect[lo] + rect[span] + reach;
      if (to > from && from <= before + 1e-9 && v > before) {
        v = before;
        moved = true;
      } else if (to < from && from >= after - 1e-9 && v < after) {
        v = after;
        moved = true;
      }
    }
    if (!moved) break;
  }
  return v;
}

// Sort le cercle des rectangles qui le recouvrent encore (départ dans un obstacle) par la plus courte poussée.
function pushOut(c, list) {
  let { x, y } = c;
  for (let i = 0; i < 4; i += 1) {
    let any = false;
    for (const rect of list) {
      if (distanceToRect(x, y, rect) >= c.r - 1e-9) continue;
      any = true;
      const cx = Math.min(Math.max(x, rect.x), rect.x + rect.w);
      const cy = Math.min(Math.max(y, rect.y), rect.y + rect.h);
      const d = Math.hypot(x - cx, y - cy);
      if (d > 1e-9) {
        x = cx + ((x - cx) / d) * c.r;
        y = cy + ((y - cy) / d) * c.r;
      } else {
        const left = x - rect.x;
        const right = rect.x + rect.w - x;
        const top = y - rect.y;
        const bottom = rect.y + rect.h - y;
        const m = Math.min(left, right, top, bottom);
        if (m === left) x = rect.x - c.r;
        else if (m === right) x = rect.x + rect.w + c.r;
        else if (m === top) y = rect.y - c.r;
        else y = rect.y + rect.h + c.r;
      }
    }
    if (!any) break;
  }
  return { x, y };
}

// Déplace le cercle { x, y, r } de delta { x, y } : bloqué par les bornes ({ minX, minY, maxX, maxY }, facultatives) et glissant
// le long des obstacles. Sans obstacle ni borne, renvoie simplement la position visée. Renvoie { x, y }.
export function moveWithCollision(circle, delta, obstacles, bounds) {
  const r = Math.max(0, num(circle?.r));
  const list = validRects(obstacles);
  const b = {
    minX: num(bounds?.minX, -Infinity),
    minY: num(bounds?.minY, -Infinity),
    maxX: num(bounds?.maxX, Infinity),
    maxY: num(bounds?.maxY, Infinity),
  };
  const dx = num(delta?.x);
  const dy = num(delta?.y);
  let x = num(circle?.x);
  let y = num(circle?.y);
  // Pas bornés : jamais plus d'un demi-rayon par sous-pas, donc aucune traversée d'un obstacle plus épais que le rayon.
  const n = list.length ? Math.min(200, Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) / Math.max(1, r / 2)))) : 1;
  for (let i = 0; i < n; i += 1) {
    const tx = clampAxis(x + dx / n, b.minX + r, b.maxX - r);
    x = list.length ? slide('x', x, tx, y, r, list) : tx;
    const ty = clampAxis(y + dy / n, b.minY + r, b.maxY - r);
    y = list.length ? slide('y', y, ty, x, r, list) : ty;
  }
  if (list.length) {
    const out = pushOut({ x, y, r }, list);
    x = clampAxis(out.x, b.minX + r, b.maxX - r);
    y = clampAxis(out.y, b.minY + r, b.maxY - r);
  }
  return { x, y };
}
