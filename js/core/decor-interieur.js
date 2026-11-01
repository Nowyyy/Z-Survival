// Décor léger intérieur (lot 3g, partie C) : objets NON solides (aucun effet sur les collisions, le chemin, les tirs, les règles ni la visite),
// d'après data/game/maps/rez-de-chaussee/decor-interieur.json (pixels du plan). Pur : conversion en unités du jeu, contrôle des zones
// interdites et géométrie en quadrilatères (le rendu les fusionne par étage dans l'atlas de props). Aucune exception sur des entrées inattendues.
import { pointInPolygon } from './shape.js';
import { isNum, num } from './vec.js';

const isObject = (o) => o !== null && typeof o === 'object' && !Array.isArray(o);
const list = (a) => (Array.isArray(a) ? a : []);
const r2 = (v) => Math.round(num(v) * 100) / 100;

// Catalogue fermé (9 types : les 8 du lot et la grille demandée par le propriétaire). wall : posé contre un mur (désigné par l'identifiant du segment) ; z0 / z1 : hauteurs (unités) ; tris : triangles
// au plus par élément ; region : région de l'atlas de props ; scale : unités du monde par largeur de région (fenêtre de texture).
export const CATALOGUE = Object.freeze({
  plinthe: Object.freeze({ wall: true, z0: 0, z1: 8, depth: 2.5, tris: 4, region: 'bois-sombre', scale: 100 }),
  tuyau: Object.freeze({ wall: true, z0: 40, z1: 47, depth: 7, tris: 12, region: 'tole', scale: 60 }),
  applique: Object.freeze({ wall: true, z0: 44, z1: 54, depth: 6, tris: 10, region: 'lampe', scale: 30 }),
  affiche: Object.freeze({ wall: true, z0: 20, z1: 46, depth: 0.6, tris: 2, region: 'peinture-2', scale: 60 }),
  tapis: Object.freeze({ wall: false, z0: 0.6, z1: 0.6, tris: 2, region: 'peinture-1', scale: 120 }),
  tache: Object.freeze({ wall: false, z0: 0.4, z1: 0.4, tris: 8, region: 'ecorce', scale: 80 }),
  sacs: Object.freeze({ wall: false, z0: 0, z1: 18, tris: 10, region: 'bois', scale: 40 }),
  bidon: Object.freeze({ wall: false, z0: 0, z1: 28, tris: 10, region: 'barriere', scale: 40 }),
  // Lot 3g (retour du propriétaire) : grille à barreaux devant un mur plein (ouverture à barreaux du modèle, ancienne fenêtre F7) : 8 barreaux et 2 traverses.
  grille: Object.freeze({ wall: true, z0: 0, z1: 58, depth: 3, tris: 20, region: 'tole', scale: 40 }),
});
export const KINDS = Object.freeze(Object.keys(CATALOGUE));
export const MAX_HEIGHT = 70; // aucun élément au-dessus
export const MAX_FREE_HEIGHT = 40; // hors des murs : ne cache pas un zombie à 75°
export const BUDGET = Object.freeze({ triangles: 1500, calls: 6 });

// Segments de mur d'une source (contour et murs intérieurs) en pixels : { id, x1, y1, x2, y2 }.
function segmentsOf(plan) {
  const c = list(plan?.contour).filter((p) => Array.isArray(p) && isNum(p[0]) && isNum(p[1]));
  const out = c.map((a, i) => ({ id: `contour-${i + 1}`, x1: a[0], y1: a[1], x2: c[(i + 1) % c.length][0], y2: c[(i + 1) % c.length][1] }));
  for (const w of list(plan?.walls)) if (isObject(w) && [w.x1, w.y1, w.x2, w.y2].every(isNum)) out.push({ id: String(w.id), x1: w.x1, y1: w.y1, x2: w.x2, y2: w.y2 });
  return out;
}

// Convertit la source (pixels) en éléments du monde (unités). sources : { rdc: plan.json, etage: etage.json } ; transform : world.json transform ;
// opts : { wallThickness (40) }. Un élément mural `on` = identifiant d'un segment, `from` / `to` (fractions 0 à 1 le long du segment) ; il est posé
// sur la face intérieure du mur (demi-épaisseur), du côté de l'intérieur du contour. Renvoie { items, warnings }.
export function decorToWorld(source, sources, transform, opts = {}) {
  const t = isObject(transform) ? transform : {};
  const s = num(t.scale, 5);
  const m = num(t.margin, 800);
  const o = isObject(t.origin) ? t.origin : { x: num(t.x0), y: num(t.y0) }; // world.json : x0, y0
  const X = (px) => r2((num(px) - num(o.x)) * s + m);
  const Y = (py) => r2((num(py) - num(o.y)) * s + m);
  const half = num(opts.wallThickness, 40) / 2;
  const items = [];
  const warnings = [];
  for (const it of list(source?.items)) {
    if (!isObject(it) || !CATALOGUE[it.kind]) { warnings.push(`élément ignoré (genre inconnu) : ${it?.id ?? '?'}`); continue; }
    const floor = it.floor === 'etage' ? 'etage' : 'rdc';
    const plan = sources?.[floor];
    const cat = CATALOGUE[it.kind];
    const base = { id: String(it.id ?? ''), floor, kind: it.kind, z0: cat.z0, z1: cat.z1, ...(it.source === 'modele' ? { source: 'modele' } : { provisional: true }) };
    if (cat.wall) {
      const seg = segmentsOf(plan).find((q) => q.id === it.on);
      if (!seg) { warnings.push(`${it.id} : mur ${it.on} introuvable`); continue; }
      const a = Math.max(0, Math.min(1, num(it.from, 0)));
      const b = Math.max(a, Math.min(1, num(it.to, 1)));
      const ax = seg.x1 + (seg.x2 - seg.x1) * a;
      const ay = seg.y1 + (seg.y2 - seg.y1) * a;
      const bx = seg.x1 + (seg.x2 - seg.x1) * b;
      const by = seg.y1 + (seg.y2 - seg.y1) * b;
      const len = Math.hypot(bx - ax, by - ay);
      if (len <= 0) { warnings.push(`${it.id} : longueur nulle`); continue; }
      // Normale vers l'intérieur : celle dont le point voisin du milieu est dans le contour.
      let nx = -(by - ay) / len || 0; // jamais -0
      let ny = (bx - ax) / len || 0;
      const mx = (ax + bx) / 2;
      const my = (ay + by) / 2;
      const contour = list(plan?.contour);
      if (seg.id.startsWith('contour') && !pointInPolygon(mx + nx * 2, my + ny * 2, contour)) { nx = -nx || 0; ny = -ny || 0; }
      if (!seg.id.startsWith('contour') && isNum(it.side) && it.side < 0) { nx = -nx || 0; ny = -ny || 0; }
      const off = half;
      const p0 = { x: X(ax) + nx * off, y: Y(ay) + ny * off };
      const p1 = { x: X(bx) + nx * off, y: Y(by) + ny * off };
      items.push({ ...base, on: seg.id, a: { x: r2(p0.x), y: r2(p0.y) }, b: { x: r2(p1.x), y: r2(p1.y) }, n: { x: nx, y: ny }, depth: cat.depth,
        x: r2(Math.min(p0.x, p1.x, p0.x + nx * cat.depth, p1.x + nx * cat.depth)), y: r2(Math.min(p0.y, p1.y, p0.y + ny * cat.depth, p1.y + ny * cat.depth)),
        w: r2(Math.abs(p1.x - p0.x) + Math.abs(nx) * cat.depth), h: r2(Math.abs(p1.y - p0.y) + Math.abs(ny) * cat.depth) });
      continue;
    }
    if (![it.x, it.y, it.w, it.h].every(isNum) || it.w <= 0 || it.h <= 0) { warnings.push(`${it.id} : rectangle invalide`); continue; }
    items.push({ ...base, x: X(it.x), y: Y(it.y), w: r2(it.w * s), h: r2(it.h * s), rot: num(it.rot, 0) });
  }
  return { items, warnings };
}

// Coupe un élément mural autour d'intervalles interdits le long de son mur (fenêtres, ouvertures) : renvoie des morceaux (mêmes champs, a/b réduits).
export function cutWallItem(item, gaps, min = 12) {
  if (!isObject(item) || !item.a || !item.b) return [];
  const len = Math.hypot(item.b.x - item.a.x, item.b.y - item.a.y);
  if (len <= 0) return [];
  const ux = (item.b.x - item.a.x) / len;
  const uy = (item.b.y - item.a.y) / len;
  // Intervalles [s0, s1] (abscisses le long de l'élément) couverts par un trou dont le centre est à moins de (largeur / 2) du segment.
  const holes = [];
  for (const g of list(gaps)) {
    if (!isObject(g) || !isNum(g.x) || !isNum(g.y) || !isNum(g.half)) continue;
    const s = (g.x - item.a.x) * ux + (g.y - item.a.y) * uy;
    const d = Math.abs((g.x - item.a.x) * -uy + (g.y - item.a.y) * ux);
    if (d <= num(g.reach, 30)) holes.push([s - g.half, s + g.half]);
  }
  holes.sort((p, q) => p[0] - q[0]);
  const parts = [];
  let cur = 0;
  for (const [h0, h1] of holes) {
    if (cur >= len) break;
    const end = Math.min(h0, len);
    if (end - cur >= min) parts.push([cur, end]);
    cur = Math.max(cur, h1);
  }
  if (len - cur >= min) parts.push([cur, len]);
  return parts.map(([s0, s1], k) => {
    const a = { x: r2(item.a.x + ux * s0), y: r2(item.a.y + uy * s0) };
    const b = { x: r2(item.a.x + ux * s1), y: r2(item.a.y + uy * s1) };
    return { ...item, id: parts.length > 1 ? `${item.id}.${k + 1}` : item.id, a, b,
      x: r2(Math.min(a.x, b.x, a.x + item.n.x * item.depth, b.x + item.n.x * item.depth)), y: r2(Math.min(a.y, b.y, a.y + item.n.y * item.depth, b.y + item.n.y * item.depth)),
      w: r2(Math.abs(b.x - a.x) + Math.abs(item.n.x) * item.depth), h: r2(Math.abs(b.y - a.y) + Math.abs(item.n.y) * item.depth) };
  });
}

const overlaps = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

// Zones interdites d'un élément (unités) : renvoie la liste des raisons (vide = permis). zones : [{ id, floor, x, y, w, h, walls }] — `walls: true`
// si les éléments muraux y sont aussi interdits (sinon seuls les éléments au sol le sont, par exemple la profondeur libre devant une fenêtre).
export function forbiddenFor(item, zones) {
  const out = [];
  for (const z of list(zones)) {
    if (!isObject(z) || (z.floor && z.floor !== item.floor)) continue;
    if (CATALOGUE[item.kind]?.wall && z.walls !== true) continue;
    if (overlaps(item, z)) out.push(z.id);
  }
  return out;
}

// Géométrie : quadrilatères { p: [[x, y, z] × 4] (x, hauteur, y du jeu), n: [x, y, z], uv: [[u, v] × 4] (0 à 1), region, size: [largeur, hauteur] }.
export function itemQuads(item) {
  const cat = CATALOGUE[item?.kind];
  if (!cat) return [];
  const q = (p, n, size) => ({ p, n, uv: [[0, 0], [1, 0], [1, 1], [0, 1]], region: item.region ?? cat.region, size });
  const z0 = num(item.z0, cat.z0);
  const z1 = num(item.z1, cat.z1);
  if (cat.wall) {
    const { a, b, n } = item;
    if (!a || !b || !n) return [];
    const L = Math.hypot(b.x - a.x, b.y - a.y);
    const d = num(item.depth, cat.depth);
    const fa = [a.x + n.x * d, a.y + n.y * d];
    const fb = [b.x + n.x * d, b.y + n.y * d];
    const front = (h0, h1) => q([[fa[0], h1, fa[1]], [fb[0], h1, fb[1]], [fb[0], h0, fb[1]], [fa[0], h0, fa[1]]], [n.x, 0, n.y], [L, h1 - h0]);
    const top = (h) => q([[a.x, h, a.y], [b.x, h, b.y], [fb[0], h, fb[1]], [fa[0], h, fa[1]]], [0, 1, 0], [L, d]);
    if (item.kind === 'plinthe') return [front(z0, z1), top(z1)];
    if (item.kind === 'grille') {
      const ux = (b.x - a.x) / L;
      const uy = (b.y - a.y) / L;
      const bar = (s0, s1, h0, h1) => {
        const p0 = [a.x + ux * s0 + n.x * d, a.y + uy * s0 + n.y * d];
        const p1 = [a.x + ux * s1 + n.x * d, a.y + uy * s1 + n.y * d];
        return q([[p0[0], h1, p0[1]], [p1[0], h1, p1[1]], [p1[0], h0, p1[1]], [p0[0], h0, p0[1]]], [n.x, 0, n.y], [s1 - s0, h1 - h0]);
      };
      const quads = [];
      for (let k = 0; k < 8; k += 1) {
        const c = ((k + 0.5) / 8) * L;
        quads.push(bar(c - 1.5, c + 1.5, z0, z1));
      }
      quads.push(bar(0, L, z1 - 4, z1), bar(0, L, z0 + 6, z0 + 10));
      return quads;
    }
    if (item.kind === 'affiche') return [front(z0, z1)];
    if (item.kind === 'applique') {
      const side = (p, sgn) => q([[p[0], z1, p[1]], [p[0] + n.x * d, z1, p[1] + n.y * d], [p[0] + n.x * d, z0, p[1] + n.y * d], [p[0], z0, p[1]]], [((b.x - a.x) / L) * sgn, 0, ((b.y - a.y) / L) * sgn], [d, z1 - z0]);
      const bottom = q([[a.x, z0, a.y], [b.x, z0, b.y], [fb[0], z0, fb[1]], [fa[0], z0, fa[1]]], [0, -1, 0], [L, d]);
      return [front(z0, z1), top(z1), bottom, side([a.x, a.y], -1), side([b.x, b.y], 1)];
    }
    // tuyau : prisme hexagonal le long du mur, centré à d/2 de la face, sans bouts (6 faces).
    const r = (z1 - z0) / 2;
    const cz = (z0 + z1) / 2;
    const cOff = d / 2;
    const quads = [];
    for (let k = 0; k < 6; k += 1) {
      const t0 = (k / 6) * Math.PI * 2;
      const t1 = ((k + 1) / 6) * Math.PI * 2;
      const pt = (p, t) => [p.x + n.x * (cOff + Math.cos(t) * r), cz + Math.sin(t) * r, p.y + n.y * (cOff + Math.cos(t) * r)];
      const tm = (t0 + t1) / 2;
      quads.push(q([pt(a, t0), pt(b, t0), pt(b, t1), pt(a, t1)], [n.x * Math.cos(tm), Math.sin(tm), n.y * Math.cos(tm)], [L, r]));
    }
    return quads;
  }
  const { x, y, w, h } = item;
  const rot = (num(item.rot, 0) * Math.PI) / 180;
  const cx = x + w / 2;
  const cy = y + h / 2;
  const R = (px, py) => [cx + (px - cx) * Math.cos(rot) - (py - cy) * Math.sin(rot), cy + (px - cx) * Math.sin(rot) + (py - cy) * Math.cos(rot)];
  if (item.kind === 'tapis') {
    const c = [R(x, y), R(x + w, y), R(x + w, y + h), R(x, y + h)];
    return [q(c.map(([u, v]) => [u, z0, v]), [0, 1, 0], [w, h])];
  }
  if (item.kind === 'tache') {
    // Octogone irrégulier (4 quadrilatères en éventail) : rayons variés d'après l'identifiant, sans hasard.
    let hsh = 7;
    for (const ch of String(item.id)) hsh = (hsh * 31 + ch.charCodeAt(0)) % 9973;
    const pts = [];
    for (let k = 0; k < 8; k += 1) {
      const t = (k / 8) * Math.PI * 2;
      const f = 0.75 + (((hsh * (k + 3)) % 17) / 17) * 0.25;
      pts.push(R(cx + Math.cos(t) * (w / 2) * f, cy + Math.sin(t) * (h / 2) * f));
    }
    const quads = [];
    for (let k = 0; k < 8; k += 2) quads.push(q([[cx, z0, cy], [pts[k][0], z0, pts[k][1]], [pts[(k + 1) % 8][0], z0, pts[(k + 1) % 8][1]], [pts[(k + 2) % 8][0], z0, pts[(k + 2) % 8][1]]], [0, 1, 0], [w / 2, h / 2]));
    return quads;
  }
  // sacs, bidon : boîte tournée (dessus et 4 côtés, sans dessous).
  const c = [R(x, y), R(x + w, y), R(x + w, y + h), R(x, y + h)];
  const quads = [q(c.map(([u, v]) => [u, z1, v]), [0, 1, 0], [w, h])];
  for (let k = 0; k < 4; k += 1) {
    const p0 = c[k];
    const p1 = c[(k + 1) % 4];
    const ex = p1[0] - p0[0];
    const ey = p1[1] - p0[1];
    const L = Math.hypot(ex, ey) || 1;
    quads.push(q([[p0[0], z1, p0[1]], [p1[0], z1, p1[1]], [p1[0], z0, p1[1]], [p0[0], z0, p0[1]]], [ey / L, 0, -ex / L], [L, z1 - z0]));
  }
  return quads;
}

// Triangles d'un élément et d'une liste.
export const itemTriangles = (item) => itemQuads(item).length * 2;
export const totalTriangles = (items) => list(items).reduce((s, it) => s + itemTriangles(it), 0);

// Zones de dégagement d'un étage (unités) : fenêtres (toute la largeur, profondeur libre), points de réparation, portes (ouverture + dégagement),
// escaliers (emprise, zone de déclenchement, tube de marche). world : world.json ou etage.world.json ; zones : zonesToWorld(...) ; params : params.json.
// Renvoie [{ id, floor, x, y, w, h, walls }] (walls : vrai si les éléments muraux y sont aussi interdits).
export function clearanceZones(world, zones, params, floor = 'rdc') {
  const p = isObject(params) ? params : {};
  const size = num(p.windowSize, 72);
  const depth = num(p.windowDepth, 150);
  const thick = num(p.wallThickness, 40);
  const repair = num(p.repairDistance, 70);
  const repairClear = num(p.repairClearance, 80);
  const doorClear = num(p.doorClearance, 100);
  const out = [];
  const NORMAL = { nord: [0, 1], sud: [0, -1], ouest: [1, 0], est: [-1, 0] };
  for (const w of list(world?.windows)) {
    const n = NORMAL[w?.side];
    if (!n || !isNum(w.x) || !isNum(w.y)) continue;
    const half = size / 2 + 10;
    const face = thick / 2;
    const zone = w.side === 'nord' ? { x: w.x - half, y: w.y + face, w: 2 * half, h: depth } : w.side === 'sud' ? { x: w.x - half, y: w.y - face - depth, w: 2 * half, h: depth }
      : w.side === 'ouest' ? { x: w.x + face, y: w.y - half, w: depth, h: 2 * half } : { x: w.x - face - depth, y: w.y - half, w: depth, h: 2 * half };
    out.push({ id: `fenetre-${w.id}`, floor, ...zone, walls: false });
    const rs = { x: w.x + n[0] * repair, y: w.y + n[1] * repair };
    out.push({ id: `reparation-${w.id}`, floor, x: rs.x - repairClear / 2, y: rs.y - repairClear / 2, w: repairClear, h: repairClear, walls: false });
  }
  for (const o of list(world?.openings)) {
    if (!isObject(o) || ![o.x1, o.y1, o.x2, o.y2].every(isNum)) continue;
    out.push({ id: `ouverture-${o.id}`, floor, x: Math.min(o.x1, o.x2) - doorClear, y: Math.min(o.y1, o.y2) - doorClear, w: Math.abs(o.x2 - o.x1) + 2 * doorClear, h: Math.abs(o.y2 - o.y1) + 2 * doorClear, walls: false });
  }
  for (const st of list(zones?.stairs)) {
    const f = st?.floors?.[floor];
    if (!f) continue;
    for (const key of ['solid', 'trigger']) if (isObject(f[key])) out.push({ id: `escalier-${st.id}-${key}`, floor, x: f[key].x - 20, y: f[key].y - 20, w: f[key].w + 40, h: f[key].h + 40, walls: true });
    const path = list(st.walk?.path);
    if (path.length > 1) {
      const xs = path.map((q) => q.x);
      const ys = path.map((q) => q.y);
      const m = num(st.walk.width, 0) / 2 + 20;
      out.push({ id: `escalier-${st.id}-marche`, floor, x: Math.min(...xs) - m, y: Math.min(...ys) - m, w: Math.max(...xs) - Math.min(...xs) + 2 * m, h: Math.max(...ys) - Math.min(...ys) + 2 * m, walls: true });
    }
  }
  return out;
}

// Pose le décor : chaque élément mural est coupé autour des fenêtres (largeur + 2 × 12) et des zones interdites aux éléments muraux ; un élément au sol
// dans une zone de dégagement est retiré. Renvoie { items, removed: [{ id, reasons }] }.
export function placeDecor(items, zonesByFloor, windowsByFloor, opts = {}) {
  const size = num(opts.windowSize, 72);
  const placed = [];
  const removed = [];
  for (const it of list(items)) {
    if (!isObject(it)) continue;
    const zones = list(zonesByFloor?.[it.floor]);
    if (CATALOGUE[it.kind]?.wall) {
      const gaps = [];
      for (const w of list(windowsByFloor?.[it.floor])) if (isNum(w?.x) && isNum(w?.y)) gaps.push({ x: w.x, y: w.y, half: size / 2 + 12, reach: 40 });
      for (const z of zones.filter((q) => q.walls === true)) {
        const horiz = Math.abs(it.b.y - it.a.y) < Math.abs(it.b.x - it.a.x);
        gaps.push({ x: z.x + z.w / 2, y: z.y + z.h / 2, half: (horiz ? z.w : z.h) / 2, reach: (horiz ? z.h : z.w) / 2 + 30 });
      }
      const parts = cutWallItem(it, gaps);
      if (parts.length === 0) removed.push({ id: it.id, reasons: ['entièrement dans une ouverture ou une zone interdite'] });
      placed.push(...parts);
      continue;
    }
    const reasons = forbiddenFor(it, zones);
    if (reasons.length > 0) removed.push({ id: it.id, reasons });
    else placed.push(it);
  }
  return { items: placed, removed };
}
