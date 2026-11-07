// Lot 5k : lampes à huile (décor non solide) et choix des lumières dynamiques. Logique pure : ni Three.js, ni DOM, ni stockage, ni horloge.
// Sources en pixels du plan (data/game/maps/<carte>/lampes.json) → unités du jeu (lampes.world.json, écrit par npm run carte) ; modèle d'une
// lampe (support, réservoir, flamme ; 60 triangles au plus) ; choix des N lampes éclairées, fondu et vacillement (partie C).
// Une lampe n'est jamais un obstacle : rien ici n'entre dans les collisions, le chemin, les balles ni le laser.
import { pointInPolygon } from './shape.js';

export const MAX_TRIANGLES = 60;
export const SUPPORTS = ['pilier', 'mur'];
export const ORIENTATIONS = { n: [0, -1], s: [0, 1], e: [1, 0], o: [-1, 0] }; // direction vers laquelle la lampe regarde (haut de l'écran = nord)
export const FLOORS = ['rdc', 'etage'];
const SNAP = 40; // distance maximale (unités) entre la position donnée et la face du support
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const r2 = (v) => Math.round(v * 100) / 100 || 0; // jamais -0

// Source → liste vérifiée { id, floor, support, x, y (pixels), orientation, hauteur } et avertissements (éléments ignorés).
export function parseLampSource(json) {
  const items = [];
  const warnings = [];
  const seen = new Set();
  for (const it of Array.isArray(json?.lampes) ? json.lampes.slice(0, 64) : []) {
    const id = typeof it?.id === 'string' && /^[a-z0-9-]{1,40}$/.test(it.id) ? it.id : null;
    if (!id || seen.has(id)) { warnings.push(`lampe ignorée (identifiant) : ${it?.id ?? '?'}`); continue; }
    if (!FLOORS.includes(it.floor) || !SUPPORTS.includes(it.support) || !(it.orientation in ORIENTATIONS) || !isNum(it.x) || !isNum(it.y)) { warnings.push(`lampe ignorée (champ invalide) : ${id}`); continue; }
    const hauteur = isNum(it.hauteur) && it.hauteur >= 20 && it.hauteur <= 120 ? it.hauteur : null;
    if (hauteur === null) { warnings.push(`lampe ignorée (hauteur entre 20 et 120) : ${id}`); continue; }
    seen.add(id);
    items.push({ id, floor: it.floor, support: it.support, x: it.x, y: it.y, orientation: it.orientation, hauteur });
  }
  return { items, warnings };
}

// Rectangles { x, y, w, h } des murs (segments axe-alignés d'épaisseur t) d'un monde.
const wallBoxes = (world, t) => (Array.isArray(world?.walls) ? world.walls : []).map((s) => ({
  id: s.id, x: Math.min(s.x1, s.x2) - (s.x1 === s.x2 ? t / 2 : 0), y: Math.min(s.y1, s.y2) - (s.y1 === s.y2 ? t / 2 : 0),
  w: s.x1 === s.x2 ? t : Math.abs(s.x2 - s.x1), h: s.y1 === s.y2 ? t : Math.abs(s.y2 - s.y1), vertical: s.x1 === s.x2,
}));
const inRect = (r, x, y, m = 0) => x >= r.x - m && x <= r.x + r.w + m && y >= r.y - m && y <= r.y + r.h + m;
const rectDistance = (r, x, y) => Math.hypot(Math.max(r.x - x, 0, x - (r.x + r.w)), Math.max(r.y - y, 0, y - (r.y + r.h)));

// Face du support (unités) d'une lampe ; null si aucun support à moins de SNAP.
function snap(lamp, world, t) {
  const [nx, ny] = ORIENTATIONS[lamp.orientation];
  if (lamp.support === 'pilier') {
    const pillar = (world.obstacles ?? []).filter((o) => o.kind === 'pilier').find((o) => inRect(o, lamp.ux, lamp.uy, SNAP / 2));
    if (!pillar) return null;
    const cx = pillar.x + pillar.w / 2;
    const cy = pillar.y + pillar.h / 2;
    return { on: pillar.id, x: nx === 0 ? cx : nx > 0 ? pillar.x + pillar.w : pillar.x, y: ny === 0 ? cy : ny > 0 ? pillar.y + pillar.h : pillar.y, pillar: { x: pillar.x, y: pillar.y, w: pillar.w, h: pillar.h } };
  }
  // Mur : la face qui regarde dans le sens de l'orientation, dans la longueur du mur, la plus proche.
  let best = null;
  for (const b of wallBoxes(world, t)) {
    if (b.vertical !== (nx !== 0)) continue;
    const along = nx !== 0 ? lamp.uy : lamp.ux;
    if (along < (nx !== 0 ? b.y : b.x) + 6 || along > (nx !== 0 ? b.y + b.h : b.x + b.w) - 6) continue;
    const face = nx > 0 ? b.x + b.w : nx < 0 ? b.x : ny > 0 ? b.y + b.h : b.y;
    const d = Math.abs((nx !== 0 ? lamp.ux : lamp.uy) - face);
    if (d <= SNAP && (best === null || d < best.d)) best = { d, on: b.id, x: nx !== 0 ? face : lamp.ux, y: nx !== 0 ? lamp.uy : face };
  }
  return best;
}

// Points (pas de `step`) d'un polygone gonflé de m, hors d'un autre polygone gonflé de m (null : aucun).
function exposedPoints(poly, cover, m, step = 10) {
  if (!Array.isArray(poly) || poly.length < 3) return [];
  const xs = poly.map((p) => p[0]);
  const ys = poly.map((p) => p[1]);
  const inside = (pg, x, y) => [[0, 0], [m, 0], [-m, 0], [0, m], [0, -m], [m, m], [-m, -m], [m, -m], [-m, m]].some(([dx, dy]) => pointInPolygon(x + dx, y + dy, pg));
  const out = [];
  for (let x = Math.min(...xs) - m; x <= Math.max(...xs) + m; x += step) {
    for (let y = Math.min(...ys) - m; y <= Math.max(...ys) + m; y += step) {
      if (inside(poly, x, y) && !(Array.isArray(cover) && inside(cover, x, y))) out.push([x, y]);
    }
  }
  return out;
}

// Sources (pixels) → lampes du monde (unités). worlds : { rdc, etage } (world.json, etage.world.json) ; opts : { wallThickness, floorLift,
// windowSize, decalage (lumière décalée vers la pièce), flamme (hauteur de la lumière au-dessus de la lampe) }. Renvoie { lamps, problems, warnings } ;
// portee = distance de lumière la plus grande qui n'atteint jamais l'autre étage (rez-de-chaussée : sous le sol de l'étage ; étage : trous des
// escaliers et parties du rez-de-chaussée visibles d'en haut, sommets des murs à floorLift - 1).
export function lampsToWorld(source, worlds, opts = {}) {
  const { items, warnings } = parseLampSource(source);
  const t = isNum(opts.wallThickness) ? opts.wallThickness : 40;
  const lift = isNum(opts.floorLift) ? opts.floorLift : 180;
  const win = isNum(opts.windowSize) ? opts.windowSize : 72;
  const dec = isNum(opts.decalage) ? opts.decalage : 16;
  const flame = isNum(opts.flamme) ? opts.flamme : 10;
  const tr = worlds?.rdc?.transform ?? { scale: 5, margin: 800, x0: 0, y0: 0 };
  const X = (px) => (px - (tr.x0 ?? 0)) * tr.scale + tr.margin;
  const Y = (py) => (py - (tr.y0 ?? 0)) * tr.scale + tr.margin;
  const lamps = [];
  const problems = [];
  const exposed = worlds?.etage ? exposedPoints(worlds.rdc?.contour, worlds.etage.contour, t / 2) : [];
  const holes = (worlds?.etage?.stairs ?? []).map((s) => ({ x: s.x - 10, y: s.y - 10, w: s.w + 20, h: s.h + 20 }));
  for (const it of items) {
    const world = worlds?.[it.floor];
    if (!world) { problems.push(`${it.id} : étage ${it.floor} absent`); continue; }
    const lamp = { ...it, ux: X(it.x), uy: Y(it.y) };
    const face = snap(lamp, world, t);
    if (!face) { problems.push(`${it.id} : aucun ${it.support} à moins de ${SNAP} unités (orientation ${it.orientation})`); continue; }
    const [nx, ny] = ORIENTATIONS[it.orientation];
    if (!pointInPolygon(face.x + nx * 4, face.y + ny * 4, world.contour)) { problems.push(`${it.id} : hors du bâtiment`); continue; }
    const nearWindow = (world.windows ?? []).find((w) => Math.hypot(w.x - face.x, w.y - face.y) < win / 2 + 30);
    if (nearWindow) { problems.push(`${it.id} : sur la fenêtre ${nearWindow.id}`); continue; }
    const lx = face.x + nx * dec;
    const ly = face.y + ny * dec;
    const lh = it.hauteur + flame;
    let portee = it.floor === 'rdc' ? lift - lh - 2 : Infinity;
    if (it.floor === 'etage') {
      // Trou d'escalier : les marches du rez-de-chaussée montent jusqu'au niveau du sol de l'étage.
      for (const r of holes) portee = Math.min(portee, Math.hypot(rectDistance(r, lx, ly), lh));
      for (const [px, py] of exposed) portee = Math.min(portee, Math.hypot(px - lx, py - ly, lh + 1));
      portee = Math.min(portee, lift + lh - 2);
    }
    if (!(portee > 0)) { problems.push(`${it.id} : portée nulle (trop près de l'autre étage)`); continue; }
    lamps.push({ id: it.id, floor: it.floor, support: it.support, on: face.on, orientation: it.orientation, x: r2(face.x), y: r2(face.y), n: { x: nx, y: ny }, hauteur: it.hauteur,
      light: { x: r2(lx), y: r2(ly), h: lh }, portee: Math.floor(portee), ...(face.pillar ? { pillar: face.pillar } : {}), source: { x: it.x, y: it.y } });
  }
  return { lamps, problems, warnings };
}

// ---- Modèle d'une lampe (unités du monde ; y = hauteur) ----
// Repère : f = normale (sort du support), s = côté, y = haut. Pièces : patte (mur : plaque contre le mur ; pilier : collier autour du pilier),
// bras, réservoir et flamme (bipyramide à 4 pans, émissive). Chaque triangle : { p: [[x, y, z] × 3], n: [x, y, z], color (jeton), glow (0 ou 1) }.
export const LAMP_COLORS = { metal: '--game-lamp-metal', reservoir: '--game-lamp-reservoir', flame: '--game-lamp-flame', core: '--game-lamp-core' };
const PLATE = { f0: 0, f1: 2, s: 4.2, y0: -10, y1: 7 };
const ARM = { f0: 2, f1: 15.5, s: 1.3, y0: -5.6, y1: -3.4 };
const RES = { f0: 10.5, f1: 20.5, s: 5, y0: -3.4, y1: 5 };
const FLAME = { f: 15.5, r: 2.4, y0: 5, y1: 15.5 };
export const FLAME_TOP = FLAME.y1;

// Triangle orienté : sommets dans l'ordre direct vu du côté de la normale (face avant de Three.js).
function oriented(p, n) {
  const [a, b, c] = p;
  const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
  const cross = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
  return cross[0] * n[0] + cross[1] * n[1] + cross[2] * n[2] >= 0 ? p : [a, c, b];
}

// Boîte dans le repère (f, s, y) : faces données parmi f0, f1, s0, s1, y0, y1 ; deux triangles par face, normales sortantes.
function box(out, frame, b, faces, color) {
  const P = (f, s, y) => frame(f, s, y);
  const quad = (a, bb, c, d, n) => {
    out.push({ p: oriented([a, bb, c], n), n, color, glow: 0 }, { p: oriented([a, c, d], n), n, color, glow: 0 });
  };
  const { f0, f1, s0, s1, y0, y1 } = b;
  const N = (df, ds, dy) => frame.dir(df, ds, dy);
  if (faces.includes('y1')) quad(P(f0, s0, y1), P(f0, s1, y1), P(f1, s1, y1), P(f1, s0, y1), N(0, 0, 1));
  if (faces.includes('y0')) quad(P(f0, s0, y0), P(f1, s0, y0), P(f1, s1, y0), P(f0, s1, y0), N(0, 0, -1));
  if (faces.includes('f1')) quad(P(f1, s0, y0), P(f1, s0, y1), P(f1, s1, y1), P(f1, s1, y0), N(1, 0, 0));
  if (faces.includes('f0')) quad(P(f0, s0, y0), P(f0, s1, y0), P(f0, s1, y1), P(f0, s0, y1), N(-1, 0, 0));
  if (faces.includes('s1')) quad(P(f0, s1, y0), P(f1, s1, y0), P(f1, s1, y1), P(f0, s1, y1), N(0, 1, 0));
  if (faces.includes('s0')) quad(P(f0, s0, y0), P(f0, s0, y1), P(f1, s0, y1), P(f1, s0, y0), N(0, -1, 0));
}

// Triangles d'une lampe du monde (sortie de lampsToWorld). L'ordre des sommets est fixe : même lampe, mêmes triangles.
export function lampTriangles(lamp) {
  const nx = lamp.n.x;
  const ny = lamp.n.y;
  const sx = -ny; // côté : perpendiculaire horizontale
  const sy = nx;
  const h = lamp.hauteur;
  const frame = (f, s, y) => [r2(lamp.x + nx * f + sx * s), r2(h + y), r2(lamp.y + ny * f + sy * s)];
  frame.dir = (df, ds, dy) => [nx * df + sx * ds || 0, dy, ny * df + sy * ds || 0];
  const out = [];
  if (lamp.support === 'pilier' && lamp.pillar) {
    // Collier : boîte autour du pilier (1,5 de plus de chaque côté), quatre côtés et dessus ; repère du monde (f = x, s = z).
    const p = lamp.pillar;
    const world = (x, z, y) => [r2(x), r2(h + y), r2(z)];
    world.dir = (dx, dz, dy) => [dx, dy, dz];
    box(out, world, { f0: p.x - 1.5, f1: p.x + p.w + 1.5, s0: p.y - 1.5, s1: p.y + p.h + 1.5, y0: -2, y1: 2 }, ['y1', 'f0', 'f1', 's0', 's1'], LAMP_COLORS.metal);
  } else {
    box(out, frame, { f0: PLATE.f0, f1: PLATE.f1, s0: -PLATE.s, s1: PLATE.s, y0: PLATE.y0, y1: PLATE.y1 }, ['y1', 'y0', 'f1', 's0', 's1'], LAMP_COLORS.metal);
  }
  box(out, frame, { f0: ARM.f0, f1: ARM.f1, s0: -ARM.s, s1: ARM.s, y0: ARM.y0, y1: ARM.y1 }, ['y1', 'y0', 'f1', 's0', 's1'], LAMP_COLORS.metal);
  box(out, frame, { f0: RES.f0, f1: RES.f1, s0: -RES.s, s1: RES.s, y0: RES.y0, y1: RES.y1 }, ['y1', 'y0', 'f0', 'f1', 's0', 's1'], LAMP_COLORS.reservoir);
  // Flamme : quatre sommets de base (milieu), une pointe en haut, une en bas ; huit triangles émissifs ; normales vers l'extérieur (inutile pour
  // une matière émissive, gardées pour la cohérence).
  const mid = (FLAME.y0 + FLAME.y1) * 0.42;
  const ring = [[1, 0], [0, 1], [-1, 0], [0, -1]].map(([a, b]) => frame(FLAME.f + a * FLAME.r, b * FLAME.r, mid));
  const top = frame(FLAME.f, 0, FLAME.y1);
  const bottom = frame(FLAME.f, 0, FLAME.y0);
  for (let i = 0; i < 4; i += 1) {
    const a = ring[i];
    const b = ring[(i + 1) % 4];
    const [da, db] = [[1, 0], [0, 1], [-1, 0], [0, -1]][i];
    const [ea, eb] = [[1, 0], [0, 1], [-1, 0], [0, -1]][(i + 1) % 4];
    const side = frame.dir(da + ea, db + eb, 0);
    const up = [side[0], 0.5, side[2]];
    const down = [side[0], -0.5, side[2]];
    out.push({ p: oriented([a, top, b], up), n: up, color: LAMP_COLORS.core, glow: 1 });
    out.push({ p: oriented([b, bottom, a], down), n: down, color: LAMP_COLORS.flame, glow: 1 });
  }
  return out;
}
