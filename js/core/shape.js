// Géométrie de rectangles (lot 3b) : union disjointe, soustraction, polygone rectiligne, segments de mur. Pur : n'utilise que ses arguments,
// renvoie de nouveaux objets, ne lève aucune exception sur des entrées inattendues. Rectangles { x, y, w, h } (coin nord-ouest).
import { isRect, rectGap, validRects } from './collision.js';
import { isNum, num } from './vec.js';

const EPS = 1e-9;
const uniqueSorted = (list) => [...new Set(list)].sort((a, b) => a - b);

// Aire d'intersection de deux rectangles (0 s'ils se touchent seulement).
export function overlapArea(a, b) {
  const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  return w > EPS && h > EPS ? w * h : 0;
}

// Rectangle englobant d'une liste de rectangles ; null s'il n'y en a aucun.
export function boundingRect(list) {
  const rects = validRects(list);
  if (rects.length === 0) return null;
  const x0 = Math.min(...rects.map((r) => r.x));
  const y0 = Math.min(...rects.map((r) => r.y));
  const x1 = Math.max(...rects.map((r) => r.x + r.w));
  const y1 = Math.max(...rects.map((r) => r.y + r.h));
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

// Cellules de la grille formée par toutes les arêtes des rectangles : { xs, ys, filled (fonction (col, row) -> booléen) }.
function compress(rects, holes = []) {
  const all = [...rects, ...holes];
  const xs = uniqueSorted(all.flatMap((r) => [r.x, r.x + r.w]));
  const ys = uniqueSorted(all.flatMap((r) => [r.y, r.y + r.h]));
  const cover = (list, cx, cy) => list.some((r) => cx > r.x && cx < r.x + r.w && cy > r.y && cy < r.y + r.h);
  const filled = (col, row) => {
    const cx = (xs[col] + xs[col + 1]) / 2;
    const cy = (ys[row] + ys[row + 1]) / 2;
    return cover(rects, cx, cy) && !cover(holes, cx, cy);
  };
  return { xs, ys, filled };
}

// Décomposition en rectangles disjoints d'une grille de cellules remplies : bandes horizontales, puis fusion des bandes superposées identiques.
function decompose(xs, ys, filled) {
  const runs = [];
  for (let row = 0; row < ys.length - 1; row += 1) {
    let col = 0;
    while (col < xs.length - 1) {
      if (!filled(col, row)) {
        col += 1;
        continue;
      }
      let end = col;
      while (end + 1 < xs.length - 1 && filled(end + 1, row)) end += 1;
      runs.push({ x0: xs[col], x1: xs[end + 1], y0: ys[row], y1: ys[row + 1] });
      col = end + 1;
    }
  }
  const out = [];
  for (const run of runs) {
    const above = out.find((o) => o.x === run.x0 && o.x + o.w === run.x1 && Math.abs(o.y + o.h - run.y0) < EPS);
    if (above) above.h = run.y1 - above.y;
    else out.push({ x: run.x0, y: run.y0, w: run.x1 - run.x0, h: run.y1 - run.y0 });
  }
  return out;
}

// Union de rectangles en rectangles disjoints (mêmes points couverts) ; holes : rectangles à retirer de l'union. Ordre : du nord au sud, puis de l'ouest à l'est.
export function unionRects(list, holes = []) {
  const rects = validRects(list);
  if (rects.length === 0) return [];
  const { xs, ys, filled } = compress(rects, validRects(holes));
  return decompose(xs, ys, filled);
}

// Point dans un polygone (règle pair-impair) ; les points exactement sur le contour comptent comme dedans.
export function pointInPolygon(x, y, polygon) {
  const pts = Array.isArray(polygon) ? polygon.filter((p) => Array.isArray(p) && isNum(p[0]) && isNum(p[1])) : [];
  if (pts.length < 3 || !isNum(x) || !isNum(y)) return false;
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i, i += 1) {
    const [xi, yi] = pts[i];
    const [xj, yj] = pts[j];
    const cross = (x - xi) * (yj - yi) - (y - yi) * (xj - xi);
    if (Math.abs(cross) < EPS && x >= Math.min(xi, xj) - EPS && x <= Math.max(xi, xj) + EPS && y >= Math.min(yi, yj) - EPS && y <= Math.max(yi, yj) + EPS) return true;
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

// Rectangles disjoints qui couvrent l'intérieur d'un polygone rectiligne (arêtes horizontales ou verticales) ; [] pour une entrée invalide.
export function polygonRects(polygon) {
  const pts = Array.isArray(polygon) ? polygon.filter((p) => Array.isArray(p) && isNum(p[0]) && isNum(p[1])) : [];
  if (pts.length < 4) return [];
  const xs = uniqueSorted(pts.map((p) => p[0]));
  const ys = uniqueSorted(pts.map((p) => p[1]));
  return decompose(xs, ys, (col, row) => pointInPolygon((xs[col] + xs[col + 1]) / 2, (ys[row] + ys[row + 1]) / 2, pts));
}

// Vrai si le rectangle est entièrement couvert par l'union de rects.
export function coveredBy(rect, rects) {
  if (!isRect(rect)) return false;
  const list = validRects(rects);
  const xs = uniqueSorted([rect.x, rect.x + rect.w, ...list.flatMap((r) => [r.x, r.x + r.w]).filter((x) => x > rect.x && x < rect.x + rect.w)]);
  const ys = uniqueSorted([rect.y, rect.y + rect.h, ...list.flatMap((r) => [r.y, r.y + r.h]).filter((y) => y > rect.y && y < rect.y + rect.h)]);
  for (let c = 0; c < xs.length - 1; c += 1) {
    for (let r = 0; r < ys.length - 1; r += 1) {
      const cx = (xs[c] + xs[c + 1]) / 2;
      const cy = (ys[r] + ys[r + 1]) / 2;
      if (!list.some((q) => cx >= q.x && cx <= q.x + q.w && cy >= q.y && cy <= q.y + q.h)) return false;
    }
  }
  return true;
}

// Distance du rectangle à l'ensemble de rectangles (0 s'il en touche un) ; Infinity si l'ensemble est vide.
export function gapToAll(rect, list) {
  let best = Infinity;
  for (const o of validRects(list)) best = Math.min(best, rectGap(rect, o));
  return best;
}

// Segments de mur { x1, y1, x2, y2 } (horizontaux ou verticaux) -> rectangles d'épaisseur `thickness` centrés sur les lignes. Une extrémité est
// prolongée d'une demi-épaisseur seulement si elle touche un autre segment (angle ou jonction) : une extrémité libre (bord d'une ouverture) reste nette.
export function segmentRects(segments, thickness) {
  const t = isNum(thickness) && thickness > 0 ? thickness : 40;
  const h = t / 2;
  const list = (Array.isArray(segments) ? segments : []).filter((s) => s && [s.x1, s.y1, s.x2, s.y2].every(isNum) && (s.x1 === s.x2 || s.y1 === s.y2) && (s.x1 !== s.x2 || s.y1 !== s.y2));
  const onSegment = (p, s, skip) => s !== skip && p.x >= Math.min(s.x1, s.x2) - EPS && p.x <= Math.max(s.x1, s.x2) + EPS && p.y >= Math.min(s.y1, s.y2) - EPS && p.y <= Math.max(s.y1, s.y2) + EPS;
  return list.map((s) => {
    const horizontal = s.y1 === s.y2;
    const a = horizontal ? { x: Math.min(s.x1, s.x2), y: s.y1 } : { x: s.x1, y: Math.min(s.y1, s.y2) };
    const b = horizontal ? { x: Math.max(s.x1, s.x2), y: s.y1 } : { x: s.x1, y: Math.max(s.y1, s.y2) };
    const capA = list.some((o) => onSegment(a, o, s)) ? h : 0;
    const capB = list.some((o) => onSegment(b, o, s)) ? h : 0;
    const rect = horizontal ? { x: a.x - capA, y: a.y - h, w: b.x - a.x + capA + capB, h: t } : { x: a.x - h, y: a.y - capA, w: t, h: b.y - a.y + capA + capB };
    return { ...(typeof s.id === 'string' ? { id: s.id } : {}), ...rect };
  });
}

// Aire d'une liste de rectangles disjoints.
export const totalArea = (list) => validRects(list).reduce((sum, r) => sum + r.w * r.h, 0);

// Aire d'un polygone (formule du lacet, valeur positive).
export function polygonArea(polygon) {
  const pts = Array.isArray(polygon) ? polygon.filter((p) => Array.isArray(p) && isNum(p[0]) && isNum(p[1])) : [];
  let sum = 0;
  for (let i = 0; i < pts.length; i += 1) {
    const [x1, y1] = pts[i];
    const [x2, y2] = pts[(i + 1) % pts.length];
    sum += x1 * y2 - x2 * y1;
  }
  return Math.abs(sum) / 2;
}

export const rectOf = (r) => ({ x: num(r?.x), y: num(r?.y), w: num(r?.w), h: num(r?.h) });
