// Collisions d'un cercle contre des rectangles { x, y, w, h } (coin nord-ouest) : glissement le long des obstacles, sans traversée
// aux pas bornés, et segment contre rectangles (laser, balles, ligne de vue). Sans `out`, tout renvoie de nouveaux objets, sans exception.
// Lot 5d : variantes « Into » sans allocation (firstOnSegmentInto, moveWithCollisionInto) : l'appelant fournit l'objet de sortie `out`, qui lui
// appartient (un tampon par site d'appel, jamais partagé) ; le résultat n'est valable que jusqu'au prochain appel avec le même `out`. Les corps
// des fonctions chaudes n'allouent rien (ni objet, ni tableau, ni fermeture) et font les mêmes opérations, dans le même ordre, que l'ancien
// code (résultats identiques au bit près : tests/unit/collision-identite.test.js contre tests/unit/helpers/oracle/collision.oracle.js).
// Aucun état dans le module.
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

// Lot 5d : dans les boucles, chaque obstacle est lu une seule fois (x, y, w, h dans des variables) puis validé comme isRect (r != null,
// quatre nombres finis, w > 0 et h > 0) : V8 crée une boîte pour chaque lecture d'un champ flottant d'objets de formes variées, d'où
// des lectures aussi rares que possible.

// Découpage de Liang-Barsky du segment par le rectangle (rx, ry, rw, rh), déjà validé : plus petit t dans [0, 1], ou null. Les quatre bords
// sont déroulés dans l'ordre de l'ancien code (p = [-dx, dx, -dy, dy], q = [x0 - rx, rx + rw - x0, y0 - ry, ry + rh - y0]), sans tableau.
function clipSegment(x0, y0, x1, y1, rx, ry, rw, rh) {
  const dx = x1 - x0;
  const dy = y1 - y0;
  let t0 = 0;
  let t1 = 1;
  let p = -dx;
  let q = x0 - rx;
  if (p === 0) {
    if (q < 0) return null;
  } else {
    const t = q / p;
    if (p < 0) t0 = Math.max(t0, t);
    else t1 = Math.min(t1, t);
    if (t0 > t1) return null;
  }
  p = dx;
  q = rx + rw - x0;
  if (p === 0) {
    if (q < 0) return null;
  } else {
    const t = q / p;
    if (p < 0) t0 = Math.max(t0, t);
    else t1 = Math.min(t1, t);
    if (t0 > t1) return null;
  }
  p = -dy;
  q = y0 - ry;
  if (p === 0) {
    if (q < 0) return null;
  } else {
    const t = q / p;
    if (p < 0) t0 = Math.max(t0, t);
    else t1 = Math.min(t1, t);
    if (t0 > t1) return null;
  }
  p = dy;
  q = ry + rh - y0;
  if (p === 0) {
    if (q < 0) return null;
  } else {
    const t = q / p;
    if (p < 0) t0 = Math.max(t0, t);
    else t1 = Math.min(t1, t);
    if (t0 > t1) return null;
  }
  return t0;
}

// Plus petit t dans [0, 1] où le segment (x0, y0) -> (x1, y1) touche le rectangle ; null sinon. Départ dedans : 0. Tangent : touché.
export function segmentRect(x0, y0, x1, y1, r) {
  if (!isRect(r) || !(isNum(x0) && isNum(y0) && isNum(x1) && isNum(y1))) return null;
  return clipSegment(x0, y0, x1, y1, r.x, r.y, r.w, r.h);
}

// Indice du premier obstacle touché par le segment (plus petit t ; égalité : le premier gagne), ou -1. Sans allocation.
function firstIndex(x0, y0, x1, y1, obstacles) {
  if (!Array.isArray(obstacles) || !(isNum(x0) && isNum(y0) && isNum(x1) && isNum(y1))) return -1;
  let best = -1;
  let bestT = 0;
  for (let i = 0; i < obstacles.length; i += 1) {
    const o = obstacles[i];
    if (o == null) continue;
    const ox = o.x;
    const oy = o.y;
    const ow = o.w;
    const oh = o.h;
    if (!(isNum(ox) && isNum(oy) && isNum(ow) && isNum(oh) && ow > 0 && oh > 0)) continue;
    const t = clipSegment(x0, y0, x1, y1, ox, oy, ow, oh);
    if (t !== null && (best === -1 || t < bestT)) {
      best = i;
      bestT = t;
    }
  }
  return best;
}

// Premier obstacle touché par le segment, écrit dans out : { t, obstacle } (out lui-même) ou null (out.t et out.obstacle remis à null).
// Sans allocation. Le résultat n'est valable que jusqu'au prochain appel avec le même out (tampon de l'appelant). Égalité : le premier gagne.
// t est recalculé pour l'obstacle retenu (même calcul, même nombre).
export function firstOnSegmentInto(out, x0, y0, x1, y1, obstacles) {
  const i = firstIndex(x0, y0, x1, y1, obstacles);
  if (i < 0) {
    out.t = null;
    out.obstacle = null;
    return null;
  }
  const o = obstacles[i];
  out.t = clipSegment(x0, y0, x1, y1, o.x, o.y, o.w, o.h);
  out.obstacle = o;
  return out;
}

// Premier obstacle touché par le segment : { t, obstacle } (objet neuf) ou null ; aucune allocation quand rien n'est touché.
export function firstOnSegment(x0, y0, x1, y1, obstacles) {
  const i = firstIndex(x0, y0, x1, y1, obstacles);
  if (i < 0) return null;
  const o = obstacles[i];
  return { t: clipSegment(x0, y0, x1, y1, o.x, o.y, o.w, o.h), obstacle: o };
}

// Vrai si aucun obstacle (gonflé de margin, pour un cercle de ce rayon) ne coupe le segment. Sans allocation : chaque obstacle valide est gonflé
// dans des variables (mêmes calculs que inflateRect, puis même contrôle que isRect sur le rectangle gonflé).
export function clearSegment(a, b, obstacles, margin = 0) {
  const m = Math.max(0, num(margin));
  const x0 = num(a?.x);
  const y0 = num(a?.y);
  const x1 = num(b?.x);
  const y1 = num(b?.y);
  if (!Array.isArray(obstacles)) return true;
  for (let i = 0; i < obstacles.length; i += 1) {
    const o = obstacles[i];
    if (o == null) continue;
    const ox = o.x;
    const oy = o.y;
    const ow = o.w;
    const oh = o.h;
    if (!(isNum(ox) && isNum(oy) && isNum(ow) && isNum(oh) && ow > 0 && oh > 0)) continue;
    const rx = ox - m;
    const ry = oy - m;
    const rw = ow + 2 * m;
    const rh = oh + 2 * m;
    if (!(isNum(rx) && isNum(ry) && isNum(rw) && isNum(rh) && rw > 0 && rh > 0)) continue;
    if (clipSegment(x0, y0, x1, y1, rx, ry, rw, rh) !== null) return false;
  }
  return true;
}

const clampAxis = (v, lo, hi) => Math.min(Math.max(v, lo), Math.max(lo, hi));

// Nombre d'obstacles valides (isRect) de la liste, en s'arrêtant à max (Infinity : tous). Chaque champ lu une fois.
function countValid(obstacles, max) {
  let count = 0;
  for (let i = 0; i < obstacles.length && count < max; i += 1) {
    const o = obstacles[i];
    if (o == null) continue;
    const ox = o.x;
    const oy = o.y;
    const ow = o.w;
    const oh = o.h;
    if (isNum(ox) && isNum(oy) && isNum(ow) && isNum(oh) && ow > 0 && oh > 0) count += 1;
  }
  return count;
}
const FEW = 8;

// Position x (isX) ou y la plus avancée dans le sens du mouvement sans entrer dans un rectangle. other : l'autre coordonnée du cercle.
// Au plus « nombre d'obstacles valides + 1 » passes, comme l'ancien code ; bound : ce nombre s'il est exact (exact), sinon une borne
// inférieure (le compte complet n'est fait que si une passe la dépasse). Un cercle déjà entré dans un rectangle n'est pas touché ici.
function slide(isX, from, to, other, r, obstacles, bound, exact) {
  let v = to;
  let count = bound;
  let known = exact;
  for (let pass = 0; ; pass += 1) {
    if (pass > count) {
      if (known) break;
      count = countValid(obstacles, Infinity);
      known = true;
      if (pass > count) break;
    }
    let moved = false;
    for (let i = 0; i < obstacles.length; i += 1) {
      const rect = obstacles[i];
      if (rect == null) continue;
      // Écart sur l'axe transverse lu d'abord : un obstacle trop loin est ignoré qu'il soit valide ou non (l'ancien code ignorait aussi les
      // invalides) ; gap = max(oLo - other, 0, …) ≥ oLo - other. Les autres champs ne sont lus que pour un obstacle proche, puis la
      // validité complète (isRect) est vérifiée avant tout calcul de position.
      const oLo = isX ? rect.y : rect.x;
      if (typeof oLo !== 'number') continue;
      if (oLo - other >= r) continue;
      const oSpan = isX ? rect.h : rect.w;
      if (typeof oSpan !== 'number') continue;
      const gap = Math.max(oLo - other, 0, other - (oLo + oSpan));
      if (gap >= r) continue;
      const lo = isX ? rect.x : rect.y;
      const span = isX ? rect.w : rect.h;
      if (!(isNum(lo) && isNum(oLo) && isNum(span) && isNum(oSpan) && span > 0 && oSpan > 0)) continue;
      const reach = Math.sqrt(Math.max(0, r * r - gap * gap));
      const before = lo - reach;
      const after = lo + span + reach;
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

// Sort le cercle (x, y, r) des rectangles qui le recouvrent encore (départ dans un obstacle) par la plus courte poussée ; écrit out.x, out.y.
function pushOutInto(out, x0, y0, r, obstacles) {
  let x = x0;
  let y = y0;
  for (let k = 0; k < 4; k += 1) {
    let any = false;
    for (let i = 0; i < obstacles.length; i += 1) {
      const rect = obstacles[i];
      if (rect == null) continue;
      // distanceToRect(x, y, rect) ≥ max(rx - x, 0, x - (rx + rw)) ≥ rx - x (Math.hypot ne donne jamais moins que le plus grand de ses
      // termes) : un obstacle trop loin sur x est ignoré, valide ou non ; sinon tous ses champs sont lus et validés (isRect).
      const rx = rect.x;
      if (typeof rx !== 'number') continue;
      if (rx - x >= r - 1e-9) continue;
      const rw = rect.w;
      if (typeof rw !== 'number') continue;
      if (Math.max(rx - x, 0, x - (rx + rw)) >= r - 1e-9) continue;
      const ry = rect.y;
      const rh = rect.h;
      if (!(isNum(rx) && isNum(ry) && isNum(rw) && isNum(rh) && rw > 0 && rh > 0)) continue;
      // distanceToRect(x, y, rect), mêmes opérations.
      if (Math.hypot(Math.max(rx - x, 0, x - (rx + rw)), Math.max(ry - y, 0, y - (ry + rh))) >= r - 1e-9) continue;
      any = true;
      const cx = Math.min(Math.max(x, rx), rx + rw);
      const cy = Math.min(Math.max(y, ry), ry + rh);
      const d = Math.hypot(x - cx, y - cy);
      if (d > 1e-9) {
        x = cx + ((x - cx) / d) * r;
        y = cy + ((y - cy) / d) * r;
      } else {
        const left = x - rx;
        const right = rx + rw - x;
        const top = y - ry;
        const bottom = ry + rh - y;
        const m = Math.min(left, right, top, bottom);
        if (m === left) x = rx - r;
        else if (m === right) x = rx + rw + r;
        else if (m === top) y = ry - r;
        else y = ry + rh + r;
      }
    }
    if (!any) break;
  }
  out.x = x;
  out.y = y;
  return out;
}

// Déplace le cercle { x, y, r } de delta { x, y } : bloqué par les bornes ({ minX, minY, maxX, maxY }, facultatives) et glissant le long des
// obstacles ; écrit la position dans out ({ x, y }, out lui-même). Sans allocation ; résultat valable jusqu'au prochain appel avec le même out.
export function moveWithCollisionInto(out, circle, delta, obstacles, bounds) {
  const r = Math.max(0, num(circle?.r));
  const list = Array.isArray(obstacles) ? obstacles : null;
  // Nombre d'obstacles valides : seulement « aucun », « au moins un » et, au besoin, le compte exact (passes de slide) servent.
  const few = list ? countValid(list, FEW) : 0;
  const exact = few < FEW;
  const minX = num(bounds?.minX, -Infinity);
  const minY = num(bounds?.minY, -Infinity);
  const maxX = num(bounds?.maxX, Infinity);
  const maxY = num(bounds?.maxY, Infinity);
  const dx = num(delta?.x);
  const dy = num(delta?.y);
  let x = num(circle?.x);
  let y = num(circle?.y);
  // Pas bornés : jamais plus d'un demi-rayon par sous-pas, donc aucune traversée d'un obstacle plus épais que le rayon.
  const n = few ? Math.min(200, Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) / Math.max(1, r / 2)))) : 1;
  for (let i = 0; i < n; i += 1) {
    const tx = clampAxis(x + dx / n, minX + r, maxX - r);
    x = few ? slide(true, x, tx, y, r, list, few, exact) : tx;
    const ty = clampAxis(y + dy / n, minY + r, maxY - r);
    y = few ? slide(false, y, ty, x, r, list, few, exact) : ty;
  }
  if (few) {
    pushOutInto(out, x, y, r, list);
    x = clampAxis(out.x, minX + r, maxX - r);
    y = clampAxis(out.y, minY + r, maxY - r);
  }
  out.x = x;
  out.y = y;
  return out;
}

// Même déplacement, renvoyé dans un objet neuf { x, y }.
export function moveWithCollision(circle, delta, obstacles, bounds) {
  return moveWithCollisionInto({ x: 0, y: 0 }, circle, delta, obstacles, bounds);
}
