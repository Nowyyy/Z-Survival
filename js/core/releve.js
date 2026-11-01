// Relevé du modèle 3D du propriétaire (lot 3g) : conversions, calage, coupe en rectangles, classement des objets, comparaison avec la carte.
// Pur : aucune lecture de fichier, aucune horloge, aucun hasard ; renvoie de nouveaux objets et ne lève aucune exception sur des entrées inattendues.
// Repères : modèle en mètres (x est, y nord, z haut) ; plan en PIXELS (12 px par mètre, y vers le sud, même repère que plan.json) ; jeu en unités
// (5 unités par pixel, 60 par mètre). La sortie de scripts/modele/extraire.py est convertie ici par scripts/modele/releve.mjs.
import { isNum, num } from './vec.js';

const isObject = (o) => o !== null && typeof o === 'object' && !Array.isArray(o);
const list = (a) => (Array.isArray(a) ? a : []);
const round = (v, d = 1) => Math.round(num(v) * 10 ** d) / 10 ** d;

// Calage du lot 3e (Docs/ref/etage.md) : px = (x + 5,0833) × 12 ; py = (28,9167 − y) × 12.
export const DEFAULT_CALAGE = Object.freeze({ scale: 12, ox: 5.0833, oy: 28.9167 });
export const UNITS_PER_PX = 5;
export const UNITS_PER_METER = 60;
// Seuils des écarts (unités du jeu) : moins de 15 ignorés, de 15 à 60 corrigés, plus de 60 signalés (jamais appliqués sans accord).
export const LEVELS = Object.freeze(['moins-15', '15-60', 'plus-60']);

const cal = (c) => (isObject(c) && isNum(c.scale) && c.scale > 0 && isNum(c.ox) && isNum(c.oy) ? c : DEFAULT_CALAGE);

// Point du modèle (mètres) vers le plan (pixels).
export function modelToPlan(x, y, calage) {
  const c = cal(calage);
  return [(num(x) + c.ox) * c.scale, (c.oy - num(y)) * c.scale];
}

// Point du plan (pixels) vers le modèle (mètres).
export function planToModel(px, py, calage) {
  const c = cal(calage);
  return [num(px) / c.scale - c.ox, c.oy - num(py) / c.scale];
}

// Pixels du plan vers unités du jeu (world.json transform : { scale, margin, origin: { x, y } } ; repli : 5 unités par pixel, marge 800, origine 0).
export function planToUnits(px, py, transform) {
  const t = isObject(transform) ? transform : {};
  const s = num(t.scale, UNITS_PER_PX);
  const m = num(t.margin, 800);
  const o = isObject(t.origin) ? t.origin : {};
  return [(num(px) - num(o.x)) * s + m, (num(py) - num(o.y)) * s + m];
}

export const pxToUnits = (d) => num(d) * UNITS_PER_PX;
export const metersToUnits = (m) => num(m) * UNITS_PER_METER;
export const metersToPx = (m, calage) => num(m) * cal(calage).scale;

// Boîte du modèle [x0, y0, z0, x1, y1, z1] (mètres) vers un rectangle du plan { x0, y0, x1, y1 } (pixels, y0 < y1).
export function boxToPlan(bbox, calage) {
  const b = list(bbox);
  if (b.length < 6 || !b.every(isNum)) return null;
  const [ax, ay] = modelToPlan(b[0], b[4], calage);
  const [bx, by] = modelToPlan(b[3], b[1], calage);
  return { x0: round(Math.min(ax, bx)), y0: round(Math.min(ay, by)), x1: round(Math.max(ax, bx)), y1: round(Math.max(ay, by)) };
}

// Niveau d'un écart (unités du jeu).
export function deltaLevel(units) {
  const d = Math.abs(num(units));
  return d < 15 ? 'moins-15' : d <= 60 ? '15-60' : 'plus-60';
}

// ---------- Coupe : remplissage des sections et rectangles ----------

// Remplit une grille d'après les segments d'une coupe (pixels du plan). bounds { x0, y0, x1, y1 } ; cell (pixels, 0,5 par défaut).
// 1. Chaque segment marque les cellules qu'il traverse (le contour des sections). 2. Les poches vides fermées par ces traits et MINCES (aucune
// cellule à plus de `thick` pixels d'un trait : épaisseur de mur ou de pilier) sont remplies ; les pièces (larges) et ce qui touche le bord
// restent vides. Le remplissage pair-impair ne convient pas : les faces du modèle sont souvent découpées en double. Renvoie { x0, y0, cell, w, h, data }.
export function rasterizeCut(segments, bounds, cell = 0.5, thick = 4) {
  const b = isObject(bounds) ? bounds : { x0: 0, y0: 0, x1: 0, y1: 0 };
  const c = isNum(cell) && cell > 0 ? cell : 0.5;
  const w = Math.max(0, Math.ceil((num(b.x1) - num(b.x0)) / c));
  const h = Math.max(0, Math.ceil((num(b.y1) - num(b.y0)) / c));
  const data = new Uint8Array(w * h);
  const segs = list(segments).filter((s) => Array.isArray(s) && s.length >= 4 && s.slice(0, 4).every(isNum));
  for (const [x1, y1, x2, y2] of segs) {
    const n = Math.max(1, Math.ceil(Math.hypot(x2 - x1, y2 - y1) / (c / 2)));
    for (let k = 0; k <= n; k += 1) {
      const q = Math.floor((x1 + ((x2 - x1) * k) / n - num(b.x0)) / c);
      const r = Math.floor((y1 + ((y2 - y1) * k) / n - num(b.y0)) / c);
      if (q >= 0 && q < w && r >= 0 && r < h) data[r * w + q] = 1;
    }
  }
  // Distance (en cellules, 4-voisinage) de chaque cellule vide au trait le plus proche.
  const INF = 0x7fffffff;
  const dist = new Int32Array(w * h).fill(INF);
  let queue = [];
  for (let i = 0; i < w * h; i += 1) if (data[i]) { dist[i] = 0; queue.push(i); }
  while (queue.length) {
    const next = [];
    for (const k of queue) {
      const q = k % w;
      for (const nb of [q > 0 ? k - 1 : -1, q < w - 1 ? k + 1 : -1, k >= w ? k - w : -1, k + w < w * h ? k + w : -1]) {
        if (nb >= 0 && dist[nb] === INF) { dist[nb] = dist[k] + 1; next.push(nb); }
      }
    }
    queue = next;
  }
  const limit = Math.max(1, Math.round(num(thick, 4) / c));
  const seen = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i += 1) {
    if (data[i] || seen[i]) continue;
    const cells = [i];
    seen[i] = 1;
    let border = false;
    let deep = 0;
    for (let k = 0; k < cells.length; k += 1) {
      const cur = cells[k];
      const q = cur % w;
      const r = (cur - q) / w;
      if (q === 0 || r === 0 || q === w - 1 || r === h - 1) border = true;
      if (dist[cur] > deep) deep = dist[cur];
      for (const nb of [q > 0 ? cur - 1 : -1, q < w - 1 ? cur + 1 : -1, r > 0 ? cur - w : -1, r < h - 1 ? cur + w : -1]) {
        if (nb >= 0 && !data[nb] && !seen[nb]) { seen[nb] = 1; cells.push(nb); }
      }
    }
    if (!border && deep <= limit) for (const k of cells) data[k] = 2;
  }
  // 3. Fermeture (dilatation puis érosion de `thick / 2` pixels) : comble l'intérieur d'un mur dont la poche s'ouvre sur une fenêtre (montant
  // absent de la coupe) ; un passage plus large que `thick` (fenêtre, porte) reste ouvert.
  const half = Math.max(1, Math.round(num(thick, 4) / 2 / c));
  const out = new Int32Array(w * h).fill(INF);
  queue = [];
  for (let i = 0; i < w * h; i += 1) if (dist[i] > half) { out[i] = 0; queue.push(i); }
  while (queue.length) {
    const next = [];
    for (const k of queue) {
      const q = k % w;
      for (const nb of [q > 0 ? k - 1 : -1, q < w - 1 ? k + 1 : -1, k >= w ? k - w : -1, k + w < w * h ? k + w : -1]) {
        if (nb >= 0 && out[nb] === INF) { out[nb] = out[k] + 1; next.push(nb); }
      }
    }
    queue = next;
  }
  for (let i = 0; i < w * h; i += 1) if (data[i] || out[i] > half) data[i] = 1;
  return { x0: num(b.x0), y0: num(b.y0), cell: c, w, h, data };
}

// Composantes connexes (4-voisinage) d'une grille : liste de { cells, x0, y0, x1, y1 } en pixels du plan.
export function components(grid) {
  if (!isObject(grid) || !(grid.data instanceof Uint8Array)) return [];
  const { w, h, data, cell, x0, y0 } = grid;
  const seen = new Uint8Array(w * h);
  const out = [];
  const stack = [];
  for (let i = 0; i < w * h; i += 1) {
    if (!data[i] || seen[i]) continue;
    let minX = w; let minY = h; let maxX = 0; let maxY = 0; let count = 0;
    const cells = [];
    seen[i] = 1;
    stack.push(i);
    while (stack.length) {
      const k = stack.pop();
      cells.push(k);
      count += 1;
      const q = k % w;
      const r = (k - q) / w;
      if (q < minX) minX = q;
      if (q > maxX) maxX = q;
      if (r < minY) minY = r;
      if (r > maxY) maxY = r;
      for (const nb of [q > 0 ? k - 1 : -1, q < w - 1 ? k + 1 : -1, r > 0 ? k - w : -1, r < h - 1 ? k + w : -1]) {
        if (nb >= 0 && data[nb] && !seen[nb]) { seen[nb] = 1; stack.push(nb); }
      }
    }
    out.push({ cells, count, x0: x0 + minX * cell, y0: y0 + minY * cell, x1: x0 + (maxX + 1) * cell, y1: y0 + (maxY + 1) * cell });
  }
  return out;
}

// Rectangles disjoints couvrant les cellules pleines d'une grille (ou d'une liste de cellules) : passes gloutonnes, du plus grand au plus petit.
// minSide (cellules) : les rectangles plus minces sont ignorés (bruit d'une cellule). Renvoie des { x0, y0, x1, y1 } en pixels du plan.
export function rectCover(grid, cells = null, minSide = 2) {
  if (!isObject(grid) || !(grid.data instanceof Uint8Array)) return [];
  const { w, cell, x0, y0 } = grid;
  const own = new Uint8Array(grid.w * grid.h);
  const idx = Array.isArray(cells) ? cells : [...grid.data.keys()].filter((i) => grid.data[i]);
  for (const i of idx) own[i] = 1;
  const rects = [];
  // Chaque cellule restante de haut en bas : la plus grande bande (largeur × hauteur) qui part d'elle, en essayant les deux orientations.
  const sorted = [...idx].sort((a, b) => a - b);
  for (const start of sorted) {
    if (!own[start]) continue;
    const q0 = start % w;
    const r0 = (start - q0) / w;
    // largeur maximale sur la rangée
    let runW = 0;
    while (q0 + runW < w && own[r0 * w + q0 + runW]) runW += 1;
    let best = null;
    let width = runW;
    for (let r = r0; r < grid.h; r += 1) {
      let rw = 0;
      while (rw < width && own[r * w + q0 + rw]) rw += 1;
      if (rw === 0) break;
      width = rw;
      const area = width * (r - r0 + 1);
      if (!best || area > best.area) best = { area, qw: width, rh: r - r0 + 1 };
    }
    for (let r = r0; r < r0 + best.rh; r += 1) for (let q = q0; q < q0 + best.qw; q += 1) own[r * w + q] = 0;
    if (best.qw >= minSide && best.rh >= minSide) rects.push({ x0: round(x0 + q0 * cell, 2), y0: round(y0 + r0 * cell, 2), x1: round(x0 + (q0 + best.qw) * cell, 2), y1: round(y0 + (r0 + best.rh) * cell, 2) });
  }
  return rects;
}

// Sépare les sections d'une coupe : piliers (composante isolée de taille pillarMin..pillarMax pixels sur ses deux côtés, à peu près carrée) et murs
// (le reste, en rectangles). Renvoie { walls: [{ x0, y0, x1, y1, thickness, axis }], pillars: [{ x, y, size }] }.
export function cutSections(grid, opts = {}) {
  const o = isObject(opts) ? opts : {};
  const pillarMin = num(o.pillarMin, 4);
  const pillarMax = num(o.pillarMax, 10);
  const minArea = num(o.minArea, 1.5); // pixels² : les débris plus petits sont ignorés
  const walls = [];
  const pillars = [];
  for (const comp of components(grid)) {
    const cw = comp.x1 - comp.x0;
    const ch = comp.y1 - comp.y0;
    const area = comp.count * grid.cell * grid.cell;
    if (area < minArea) continue;
    if (cw >= pillarMin && ch >= pillarMin && cw <= pillarMax && ch <= pillarMax && area >= 0.6 * cw * ch) {
      pillars.push({ x: round((comp.x0 + comp.x1) / 2), y: round((comp.y0 + comp.y1) / 2), size: round(Math.max(cw, ch)) });
      continue;
    }
    for (const r of rectCover(grid, comp.cells)) {
      const rw = r.x1 - r.x0;
      const rh = r.y1 - r.y0;
      if (rw * rh < minArea) continue;
      walls.push({ ...r, thickness: round(Math.min(rw, rh)), axis: rw >= rh ? 'h' : 'v' });
    }
  }
  return { walls, pillars };
}

// ---------- Calage ----------

// Points d'un contour fermé (pixels) tous les `step` pixels.
export function contourPoints(contour, step = 1) {
  const pts = list(contour).filter((p) => Array.isArray(p) && isNum(p[0]) && isNum(p[1]));
  const out = [];
  const s = isNum(step) && step > 0 ? step : 1;
  for (let i = 0; i < pts.length; i += 1) {
    const [ax, ay] = pts[i];
    const [bx, by] = pts[(i + 1) % pts.length];
    const n = Math.max(1, Math.round(Math.hypot(bx - ax, by - ay) / s));
    for (let k = 0; k < n; k += 1) out.push([ax + ((bx - ax) * k) / n, ay + ((by - ay) * k) / n]);
  }
  return out;
}

// Part des points du contour du plan qui tombent à `tol` pixels au plus d'une cellule pleine de la coupe, décalés de (dx, dy) pixels.
export function calageScore(contour, grid, dx = 0, dy = 0, tol = 1) {
  const pts = contourPoints(contour, 1);
  if (!pts.length || !isObject(grid) || !(grid.data instanceof Uint8Array)) return 0;
  const { w, h, cell, x0, y0, data } = grid;
  const t = Math.ceil(num(tol, 1) / cell);
  let hit = 0;
  for (const [px, py] of pts) {
    const q = Math.floor((px - num(dx) - x0) / cell);
    const r = Math.floor((py - num(dy) - y0) / cell);
    let ok = false;
    for (let rr = r - t; rr <= r + t && !ok; rr += 1) {
      for (let qq = q - t; qq <= q + t && !ok; qq += 1) if (qq >= 0 && qq < w && rr >= 0 && rr < h && data[rr * w + qq]) ok = true;
    }
    if (ok) hit += 1;
  }
  return hit / pts.length;
}

// Cherche le décalage (pixels, pas de `step`, ± `range`) qui maximise calageScore ; renvoie { dx, dy, score, base } (base : score sans décalage).
export function searchCalage(contour, grid, range = 3, step = 0.5) {
  const base = calageScore(contour, grid, 0, 0);
  let best = { dx: 0, dy: 0, score: base };
  const r = Math.max(0, num(range, 3));
  const s = isNum(step) && step > 0 ? step : 0.5;
  for (let dy = -r; dy <= r + 1e-9; dy += s) {
    for (let dx = -r; dx <= r + 1e-9; dx += s) {
      const score = calageScore(contour, grid, dx, dy);
      if (score > best.score + 1e-9) best = { dx: round(dx, 2), dy: round(dy, 2), score };
    }
  }
  return { ...best, base };
}

// ---------- Objets du modèle ----------

// Règles de classement, dans l'ordre (la première qui convient l'emporte). Hauteurs relatives au sol de l'étage de l'objet (mètres).
export const CLASS_RULES = Object.freeze([
  Object.freeze({ id: 'fenetre', test: 'composant d\'ouvrage de fenêtre (planches, cadre) : relevé avec les fenêtres, hors inventaire' }),
  Object.freeze({ id: 'haut', test: 'bas à plus de 1,2 m du sol : luminaire, étagère haute, conduit (décor léger, listé à part)' }),
  Object.freeze({ id: 'mince', test: 'côté le plus court de moins de 0,12 m (planche, affiche) : décor léger' }),
  Object.freeze({ id: 'bas', test: 'sommet à 0,5 m au plus et aire de 0,6 m² au plus (sac de sable, objet posé) : décor léger' }),
  Object.freeze({ id: 'meuble', test: 'posé au sol (bas à 0,5 m au plus), sommet de 0,3 à 2,6 m, côté court d\'au moins 0,25 m : meuble' }),
  Object.freeze({ id: 'inconnu', test: 'aucune règle : inconnu' }),
]);
// Composants d'ouvrage de fenêtre (lot 3b et 3e : planches et cadres des fenêtres à barricader).
export const WINDOW_COMPONENTS = Object.freeze(['Component_5', 'Component_6', 'Component_7', 'Component_8']);

// Étage d'une hauteur (mètres) d'après les niveaux { rdc: { floor }, etage: { floor } } : le plus haut sol sous z + 0,2.
export function floorOf(z, levels) {
  const lv = isObject(levels) ? levels : { rdc: { floor: 0 }, etage: { floor: 3.05 } };
  let best = 'rdc';
  let bestFloor = -Infinity;
  for (const [id, l] of Object.entries(lv)) {
    const f = num(l?.floor, 0);
    if (num(z) + 0.2 >= f && f > bestFloor) { best = id; bestFloor = f; }
  }
  return best;
}

// Classe d'un objet { component, bbox: [x0, y0, z0, x1, y1, z1] (mètres) } ; floorZ : sol de son étage. Renvoie { klass, rule }.
// klass ∈ meuble, pilier, escalier, decor-leger, inconnu, fenetre (ce dernier n'entre pas dans l'inventaire).
export function classifyObject(obj, floorZ = 0) {
  const b = list(obj?.bbox);
  if (b.length < 6 || !b.every(isNum)) return { klass: 'inconnu', rule: 'inconnu' };
  if (WINDOW_COMPONENTS.includes(obj?.component)) return { klass: 'fenetre', rule: 'fenetre' };
  const bottom = b[2] - num(floorZ);
  const top = b[5] - num(floorZ);
  const sx = b[3] - b[0];
  const sy = b[4] - b[1];
  const short = Math.min(sx, sy);
  if (bottom > 1.2) return { klass: 'decor-leger', rule: 'haut' };
  if (short < 0.12) return { klass: 'decor-leger', rule: 'mince' };
  if (top <= 0.5 && sx * sy <= 0.6) return { klass: 'decor-leger', rule: 'bas' };
  if (bottom <= 0.5 && top >= 0.3 && top <= 2.6 && short >= 0.25) return { klass: 'meuble', rule: 'meuble' };
  return { klass: 'inconnu', rule: 'inconnu' };
}

const overlap1 = (a0, a1, b0, b1) => Math.max(0, Math.min(a1, b1) - Math.max(a0, b0));
const rectArea = (r) => Math.max(0, r.x1 - r.x0) * Math.max(0, r.y1 - r.y0);
export const rectOverlap = (a, b) => overlap1(a.x0, a.x1, b.x0, b.x1) * overlap1(a.y0, a.y1, b.y0, b.y1);
// Rapport recouvrement / union de deux rectangles { x0, y0, x1, y1 }.
export function iou(a, b) {
  if (!isObject(a) || !isObject(b)) return 0;
  const i = rectOverlap(a, b);
  const u = rectArea(a) + rectArea(b) - i;
  return u > 0 ? i / u : 0;
}

// Regroupe les objets empilés ou serrés d'un même étage (piles de caisses, deux tiroirs d'un classeur) : deux objets dont les emprises
// se recouvrent à 40 % de la plus petite au moins forment un même groupe. objects : [{ id, floor, plan: { x0, y0, x1, y1 }, ... }].
// Renvoie [{ ids: [...], floor, plan, top, bottom }] (plan = boîte englobante ; top/bottom : mètres au-dessus du sol de l'étage).
export function groupStacks(objects) {
  const items = list(objects).filter((o) => isObject(o) && isObject(o.plan));
  const parent = items.map((_, i) => i);
  const find = (i) => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  for (let i = 0; i < items.length; i += 1) {
    for (let j = i + 1; j < items.length; j += 1) {
      if (items[i].floor !== items[j].floor) continue;
      const small = Math.min(rectArea(items[i].plan), rectArea(items[j].plan));
      if (small > 0 && rectOverlap(items[i].plan, items[j].plan) >= 0.4 * small) parent[find(i)] = find(j);
    }
  }
  const groups = new Map();
  items.forEach((o, i) => {
    const k = find(i);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(o);
  });
  return [...groups.values()].map((g) => ({
    ids: g.map((o) => o.id),
    floor: g[0].floor,
    plan: { x0: Math.min(...g.map((o) => o.plan.x0)), y0: Math.min(...g.map((o) => o.plan.y0)), x1: Math.max(...g.map((o) => o.plan.x1)), y1: Math.max(...g.map((o) => o.plan.y1)) },
    bottom: Math.min(...g.map((o) => num(o.bottom))),
    top: Math.max(...g.map((o) => num(o.top))),
  }));
}

// ---------- Comparaison avec la carte ----------

const center = (r) => [(r.x0 + r.x1) / 2, (r.y0 + r.y1) / 2];

// Écart d'un rectangle de la carte (a) à un rectangle du modèle (b), en unités du jeu : déplacement du centre (dx, dy) et de la taille (dw, dh),
// et `max` = le plus grand écart d'un bord (c'est lui qui fixe le niveau).
export function rectDelta(a, b) {
  if (!isObject(a) || !isObject(b)) return null;
  const [ax, ay] = center(a);
  const [bx, by] = center(b);
  const edges = [b.x0 - a.x0, b.x1 - a.x1, b.y0 - a.y0, b.y1 - a.y1].map((d) => Math.abs(d));
  return {
    dx: round(pxToUnits(bx - ax)), dy: round(pxToUnits(by - ay)),
    dw: round(pxToUnits((b.x1 - b.x0) - (a.x1 - a.x0))), dh: round(pxToUnits((b.y1 - b.y0) - (a.y1 - a.y0))),
    max: round(pxToUnits(Math.max(...edges))),
  };
}

// Associe chaque pièce de mobilier de la carte ({ id, x0, y0, x1, y1 }, pixels) à un groupe d'objets du modèle ({ key, plan }) :
// le meilleur recouvrement (IoU ≥ minIou), sinon le plus proche dont les centres sont à maxDist pixels au plus et les tailles comparables (rapport ≤ 2).
// Un groupe ne sert qu'une fois (le meilleur IoU d'abord). Renvoie { matches: [{ id, key|null, iou, delta }], unmatched: [clés de groupes] }.
export function matchFurniture(pieces, groups, opts = {}) {
  const o = isObject(opts) ? opts : {};
  const minIou = num(o.minIou, 0.25);
  const maxDist = num(o.maxDist, 6);
  const P = list(pieces).filter((p) => isObject(p) && [p.x0, p.y0, p.x1, p.y1].every(isNum));
  const G = list(groups).filter((g) => isObject(g) && isObject(g.plan));
  const pairs = [];
  P.forEach((p, i) => G.forEach((g, j) => {
    const v = iou(p, g.plan);
    const [px, py] = center(p);
    const [gx, gy] = center(g.plan);
    const d = Math.hypot(px - gx, py - gy);
    const ratio = Math.max(rectArea(p), rectArea(g.plan)) / Math.max(1e-9, Math.min(rectArea(p), rectArea(g.plan)));
    if (v >= minIou || (d <= maxDist && ratio <= 2)) pairs.push({ i, j, score: v - d / 1000 });
  }));
  pairs.sort((a, b) => b.score - a.score || a.i - b.i || a.j - b.j);
  const usedP = new Set();
  const usedG = new Set();
  const byPiece = new Map();
  for (const pr of pairs) {
    if (usedP.has(pr.i) || usedG.has(pr.j)) continue;
    usedP.add(pr.i);
    usedG.add(pr.j);
    byPiece.set(pr.i, pr.j);
  }
  const matches = P.map((p, i) => {
    const j = byPiece.get(i);
    if (j === undefined) return { id: p.id, key: null, iou: 0, delta: null };
    return { id: p.id, key: G[j].key, iou: round(iou(p, G[j].plan), 2), delta: rectDelta(p, G[j].plan) };
  });
  return { matches, unmatched: G.filter((_, j) => !usedG.has(j)).map((g) => g.key) };
}

// Associe des points (piliers, fenêtres) : chaque point de la carte au point du modèle le plus proche à maxDist pixels au plus, sans réemploi.
// a, b : [{ id, x, y }] ; renvoie { matches: [{ id, other|null, dx, dy, dist }] (unités), unmatched: [ids de b] }.
export function matchPoints(a, b, maxDist = 12) {
  const A = list(a).filter((p) => isObject(p) && isNum(p.x) && isNum(p.y));
  const B = list(b).filter((p) => isObject(p) && isNum(p.x) && isNum(p.y));
  const pairs = [];
  A.forEach((p, i) => B.forEach((q, j) => {
    const d = Math.hypot(p.x - q.x, p.y - q.y);
    if (d <= maxDist) pairs.push({ i, j, d });
  }));
  pairs.sort((x, y) => x.d - y.d || x.i - y.i || x.j - y.j);
  const usedA = new Map();
  const usedB = new Set();
  for (const pr of pairs) if (!usedA.has(pr.i) && !usedB.has(pr.j)) { usedA.set(pr.i, pr.j); usedB.add(pr.j); }
  return {
    matches: A.map((p, i) => {
      const j = usedA.get(i);
      if (j === undefined) return { id: p.id, other: null, dx: 0, dy: 0, dist: null };
      const q = B[j];
      return { id: p.id, other: q.id, dx: round(pxToUnits(q.x - p.x)), dy: round(pxToUnits(q.y - p.y)), dist: round(pxToUnits(Math.hypot(q.x - p.x, q.y - p.y))) };
    }),
    unmatched: B.filter((_, j) => !usedB.has(j)).map((q) => q.id),
  };
}

// Segments de mur d'un plan (pixels) : arêtes du contour et murs intérieurs, chacun { id, x1, y1, x2, y2, axis }.
export function planSegments(plan) {
  const p = isObject(plan) ? plan : {};
  const c = list(p.contour).filter((q) => Array.isArray(q) && isNum(q[0]) && isNum(q[1]));
  const out = c.map((a, i) => {
    const b = c[(i + 1) % c.length];
    return { id: `contour-${i + 1}`, x1: a[0], y1: a[1], x2: b[0], y2: b[1] };
  });
  for (const w of list(p.walls)) if (isObject(w) && [w.x1, w.y1, w.x2, w.y2].every(isNum)) out.push({ id: String(w.id ?? ''), x1: w.x1, y1: w.y1, x2: w.x2, y2: w.y2 });
  return out.filter((s) => s.x1 === s.x2 || s.y1 === s.y2).map((s) => ({ ...s, axis: s.y1 === s.y2 ? 'h' : 'v' }));
}

// Compare un segment de mur de la carte aux rectangles de mur du modèle : parmi les rectangles parallèles qui le longent (axe perpendiculaire à
// `reach` pixels au plus de la ligne), la ligne médiane pondérée par la longueur recouverte. Renvoie { id, axis, offset (unités, signe : vers
// x ou y croissant), covered (part de la longueur), gaps: [{ a, b }] (pixels le long de l'axe, de plus de minGap) }.
export function compareWall(seg, rects, reach = 6, minGap = 6) {
  if (!isObject(seg)) return null;
  const h = seg.axis === 'h' || seg.y1 === seg.y2;
  const line = h ? seg.y1 : seg.x1;
  const a0 = Math.min(h ? seg.x1 : seg.y1, h ? seg.x2 : seg.y2);
  const a1 = Math.max(h ? seg.x1 : seg.y1, h ? seg.x2 : seg.y2);
  const along = [];
  let wsum = 0;
  let osum = 0;
  for (const r of list(rects)) {
    if (!isObject(r)) continue;
    const p0 = h ? r.y0 : r.x0;
    const p1 = h ? r.y1 : r.x1;
    const mid = (p0 + p1) / 2;
    if (Math.abs(mid - line) > reach) continue;
    const s0 = Math.max(a0, h ? r.x0 : r.y0);
    const s1 = Math.min(a1, h ? r.x1 : r.y1);
    if (s1 <= s0) continue;
    // Seules les parties « longues » (rectangle plus long que large dans l'axe du mur) donnent la ligne médiane ; tout rectangle couvre.
    const len = s1 - s0;
    if ((h ? r.x1 - r.x0 : r.y1 - r.y0) >= (p1 - p0)) { wsum += len; osum += len * (mid - line); }
    along.push([s0, s1]);
  }
  along.sort((x, y) => x[0] - y[0]);
  const merged = [];
  for (const [s0, s1] of along) {
    if (merged.length && s0 <= merged[merged.length - 1][1] + 0.01) merged[merged.length - 1][1] = Math.max(merged[merged.length - 1][1], s1);
    else merged.push([s0, s1]);
  }
  const covered = merged.reduce((s, [s0, s1]) => s + s1 - s0, 0);
  const gaps = [];
  let cur = a0;
  for (const [s0, s1] of merged) {
    if (s0 - cur >= minGap) gaps.push({ a: round(cur), b: round(s0) });
    cur = Math.max(cur, s1);
  }
  if (a1 - cur >= minGap) gaps.push({ a: round(cur), b: round(a1) });
  return { id: seg.id, axis: h ? 'h' : 'v', line, from: a0, to: a1, offset: wsum > 0 ? round(pxToUnits(osum / wsum)) : null, covered: a1 > a0 ? round(covered / (a1 - a0), 3) : 0, gaps };
}
