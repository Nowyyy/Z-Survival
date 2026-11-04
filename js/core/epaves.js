// Lot 5a : épaves du décor extérieur (voiture en flammes, hélicoptère écrasé). Pur : ni Three.js, ni DOM, ni hasard, ni horloge ; mêmes entrées, même sortie.
// - concaveCorners / lCorner : sommets rentrants du contour du bâtiment et choix de « l'angle du L » (le plus au nord dont l'extérieur est dégagé).
// - helicopterModel : maillage de l'hélicoptère (triangles à plat, coupé au plan du sol y = 0), régions d'atlas et jetons de couleur par pièce.
// - helicopterRects : rectangles de collision (fuselage, poutre de queue, queue arrachée) dans les unités du monde.
// - burntCarParts / carFireSpots : boîtes de la voiture calcinée (mêmes boîtes que les voitures abandonnées, plus sombres) et foyers (capot, habitacle).
// Repère du modèle : x vers le nez, y vers le haut, z à droite ; dans le monde, x du jeu -> X, y du jeu -> Z, hauteur Y.
import { rectGap } from './collision.js';
import { isNum, num } from './vec.js';

const DEG = Math.PI / 180;
const r1 = (v) => Math.round(v * 10) / 10;

// Sommets rentrants (angle intérieur de 270°) d'un contour fermé [[x, y], ...]. Renvoie [{ index, x, y, out: { x, y } }] : out = direction (unitaire) du
// quart extérieur, entre les deux murs prolongés.
export function concaveCorners(contour) {
  const pts = Array.isArray(contour) ? contour.filter((p) => Array.isArray(p) && isNum(p[0]) && isNum(p[1])) : [];
  const n = pts.length;
  if (n < 4) return [];
  let area = 0;
  for (let i = 0; i < n; i += 1) area += pts[i][0] * pts[(i + 1) % n][1] - pts[(i + 1) % n][0] * pts[i][1];
  const sign = Math.sign(area) || 1;
  const out = [];
  for (let i = 0; i < n; i += 1) {
    const a = pts[(i + n - 1) % n];
    const b = pts[i];
    const c = pts[(i + 1) % n];
    const cross = (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]);
    if (cross * sign >= 0) continue; // convexe ou aligné
    const ua = norm(a[0] - b[0], a[1] - b[1]);
    const uc = norm(c[0] - b[0], c[1] - b[1]);
    const dir = norm(ua.x + uc.x, ua.y + uc.y);
    out.push({ index: i, x: b[0], y: b[1], out: { x: r1(dir.x * 1000) / 1000, y: r1(dir.y * 1000) / 1000 } });
  }
  return out;
}

function norm(x, y) {
  const l = Math.hypot(x, y) || 1;
  return { x: x / l, y: y / l };
}

// Plus grand rectangle libre (pas de `step`) dans le quart extérieur d'un coin rentrant : il part à `clearance` des deux murs et s'étend vers l'extérieur
// jusqu'au premier obstacle (couloir élargi de `margin`, emprise du bâtiment élargie de `clearance`, bord du monde moins `edge`).
// blockers : couloirs [{ x, y, w, h }] ; footprint : rectangles du bâtiment ; size : { width, height }. Renvoie { x, y, w, h } (w ou h nuls : rien de libre).
export function cornerFreeRect(corner, { blockers = [], footprint = [], size, clearance = 160, margin = 20, edge = 40, step = 5, max = 1200 } = {}) {
  const sx = Math.sign(corner?.out?.x) || 1;
  const sy = Math.sign(corner?.out?.y) || 1;
  const ax = corner.x + sx * clearance;
  const ay = corner.y + sy * clearance;
  const W = num(size?.width);
  const H = num(size?.height);
  const rectOf = (w, h) => ({ x: sx > 0 ? ax : ax - w, y: sy > 0 ? ay : ay - h, w, h });
  const free = (r) => r.x >= edge && r.y >= edge && r.x + r.w <= W - edge && r.y + r.h <= H - edge
    && !blockers.some((b) => rectGap(r, b) < margin) && !footprint.some((f) => rectGap(r, f) < clearance);
  let best = { ...rectOf(0, 0), w: 0, h: 0 };
  for (let w = step; w <= max; w += step) {
    if (!free(rectOf(w, step))) break;
    let h = step;
    while (h + step <= max && free(rectOf(w, h + step))) h += step;
    if (w * h > best.w * best.h) best = rectOf(w, h);
  }
  return best;
}

// Choix de l'angle du L : le sommet rentrant le plus au nord (y le plus petit) dont le quart extérieur est dégagé (rectangle libre d'au moins minSide de côté).
// Égalité de y : le plus grand rectangle libre. Renvoie { chosen, candidates: [{ ...corner, free, clear }] } (chosen null si aucun).
export function lCorner(contour, opts = {}) {
  const minSide = num(opts.minSide, 100);
  const candidates = concaveCorners(contour).map((c) => {
    const free = cornerFreeRect(c, opts);
    return { ...c, free, clear: free.w >= minSide && free.h >= minSide };
  });
  const clear = candidates.filter((c) => c.clear).sort((a, b) => a.y - b.y || b.free.w * b.free.h - a.free.w * a.free.h);
  return { chosen: clear[0] ?? null, candidates };
}

// --- Géométrie ---------------------------------------------------------------------------------------------------------------------------------------

const rotX = (p, a) => [p[0], p[1] * Math.cos(a) - p[2] * Math.sin(a), p[1] * Math.sin(a) + p[2] * Math.cos(a)];
const rotZ = (p, a) => [p[0] * Math.cos(a) - p[1] * Math.sin(a), p[0] * Math.sin(a) + p[1] * Math.cos(a), p[2]];
// Lacet dans le plan du sol : x vers z (de l'est vers le sud dans le monde, sens des aiguilles d'une montre vu de dessus).
const rotY = (p, a) => [p[0] * Math.cos(a) - p[2] * Math.sin(a), p[1], p[0] * Math.sin(a) + p[2] * Math.cos(a)];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const crossV = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const unitV = (v) => {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
};

// Tronc de pyramide le long de x : section s0 en x0, s1 en x1 ({ y: [bas, haut], z: [gauche, droite] }). 8 coins : 0-3 en x0, 4-7 en x1.
function frustum(x0, x1, s0, s1 = s0) {
  const sec = (x, s) => [[x, s.y[0], s.z[0]], [x, s.y[0], s.z[1]], [x, s.y[1], s.z[1]], [x, s.y[1], s.z[0]]];
  return [...sec(x0, s0), ...sec(x1, s1)];
}
const FACES = [[0, 3, 2, 1], [4, 5, 6, 7], [0, 1, 5, 4], [1, 2, 6, 5], [2, 3, 7, 6], [3, 0, 4, 7]];

// Pièce : coins transformés (roulis rx, tangage rz, lacet ry, puis translation t), puis la même transformation pour toute l'épave.
function piece(corners, { rx = 0, rz = 0, ry = 0, t = [0, 0, 0] } = {}) {
  return corners.map((p) => {
    const q = rotY(rotZ(rotX(p, rx * DEG), rz * DEG), ry * DEG);
    return [q[0] + t[0], q[1] + t[1], q[2] + t[2]];
  });
}

// Coupe d'un polygone par le demi-espace y >= 0 (Sutherland-Hodgman).
function clipGround(poly) {
  const out = [];
  for (let i = 0; i < poly.length; i += 1) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    const ina = a[1] >= 0;
    const inb = b[1] >= 0;
    if (ina) out.push(a);
    if (ina !== inb) {
      const k = a[1] / (a[1] - b[1]);
      out.push([a[0] + (b[0] - a[0]) * k, 0, a[2] + (b[2] - a[2]) * k]);
    }
  }
  return out;
}

// Pièces de l'hélicoptère (repère du modèle, avant la chute). region : région de l'atlas de props ; tint : jeton --game-* (couleur de sommet) ;
// group : fuselage, poutre ou queue (rectangles de collision), pales et details (non solides).
function parts() {
  const P = [];
  // loose : pièce arrachée, déjà posée au sol (ni tangage, ni roulis, ni enfoncement de la chute).
  const add = (id, region, tint, group, corners, tr, loose = false) => P.push({ id, region, tint, group, loose, corners: piece(corners, tr) });
  add('coque', 'tole', 'wreck-hull', 'fuselage', frustum(-50, 52, { y: [8, 50], z: [-26, 26] }, { y: [8, 52], z: [-25, 25] }));
  add('nez', 'tole', 'wreck-soot', 'fuselage', frustum(52, 90, { y: [8, 52], z: [-25, 25] }, { y: [12, 32], z: [-13, 13] }));
  add('verriere', 'vitre', 'wreck-glass', 'fuselage', frustum(36, 78, { y: [40, 58], z: [-21, 21] }, { y: [32, 42], z: [-12, 12] }));
  add('moteur', 'tole', 'wreck-soot', 'fuselage', frustum(-34, 26, { y: [50, 62], z: [-15, 15] }, { y: [50, 60], z: [-11, 11] }));
  add('mat', 'tole', 'wreck-metal', 'fuselage', frustum(-4, 4, { y: [60, 72], z: [-4, 4] }));
  // Poutre de queue encore attachée, cassée net à x = -118 ; la queue arrachée (et sa dérive) est couchée à côté, tournée de 38°.
  add('poutre', 'tole', 'wreck-hull', 'poutre', frustum(-118, -48, { y: [32, 41], z: [-6, 6] }, { y: [26, 46], z: [-11, 11] }), { rz: -4 });
  const tail = { ry: 38, rx: 24, t: [-122, 2, 26] };
  add('queue', 'tole', 'wreck-hull', 'queue', frustum(-64, 0, { y: [0, 8], z: [-5, 5] }, { y: [0, 10], z: [-6, 6] }), tail);
  add('derive', 'tole', 'wreck-soot', 'queue', frustum(-70, -50, { y: [6, 36], z: [-2, 2] }, { y: [6, 16], z: [-2, 2] }), tail);
  add('rotor-queue-1', 'tole', 'wreck-metal', 'queue', frustum(-64, -60, { y: [14, 40], z: [3, 5] }), tail);
  add('rotor-queue-2', 'tole', 'wreck-metal', 'queue', frustum(-74, -50, { y: [26, 30], z: [3, 5] }), tail);
  // Patins : le gauche sous la coque (à moitié enfoui par le roulis), le droit arraché et couché à côté ; deux jambes à gauche, deux moignons à droite.
  add('patin-1', 'tole', 'wreck-metal', 'fuselage', frustum(-44, 62, { y: [0, 4], z: [-36, -32] }));
  for (const [j, x] of [[1, -26], [2, 36]]) add(`jambe-1-${j}`, 'tole', 'wreck-metal', 'fuselage', frustum(x - 2, x + 2, { y: [2, 14], z: [-34, -24] }));
  add('patin-2', 'tole', 'wreck-metal', 'fuselage', frustum(-40, 50, { y: [0, 4], z: [-2, 2] }), { ry: 10, t: [6, 0, 46] }, true);
  for (const [j, x] of [[1, -22], [2, 30]]) add(`jambe-2-${j}`, 'tole', 'wreck-metal', 'fuselage', frustum(x - 2, x + 2, { y: [0, 10], z: [-2, 2] }), { rx: 50, ry: 10, t: [6, 0, 46] }, true);
  // Quatre pales tordues (deux tronçons chacune) depuis le moyeu ; la première plonge dans le sol (coupée au plan du sol).
  const hub = [0, 71, 0];
  const blades = [
    { yaw: -32, d1: 14, d2: 62, l1: 46, l2: 56 },
    { yaw: 58, d1: 8, d2: 34, l1: 50, l2: 50 },
    { yaw: 148, d1: 4, d2: 20, l1: 48, l2: 52 },
    { yaw: 238, d1: 10, d2: 44, l1: 46, l2: 48 },
  ];
  blades.forEach((b, k) => {
    const seg1 = frustum(0, b.l1, { y: [-0.8, 0.8], z: [-4.5, 4.5] }, { y: [-0.8, 0.8], z: [-4, 4] });
    add(`pale-${k + 1}a`, 'tole', 'wreck-metal', 'pales', seg1, { rz: -b.d1, ry: b.yaw, t: hub });
    const end = rotY(rotZ([b.l1, 0, 0], -b.d1 * DEG), b.yaw * DEG);
    const seg2 = frustum(0, b.l2, { y: [-0.8, 0.8], z: [-4, 4] }, { y: [-0.6, 0.6], z: [-3, 3] });
    add(`pale-${k + 1}b`, 'tole', 'wreck-metal', 'pales', seg2, { rx: 18, rz: -b.d2, ry: b.yaw + 12, t: [hub[0] + end[0], hub[1] + end[1], hub[2] + end[2]] });
  });
  // Débris à plat (tôles arrachées).
  add('debris-1', 'tole', 'wreck-soot', 'details', frustum(0, 26, { y: [0, 2], z: [0, 14] }), { ry: 20, t: [70, 0, -52] }, true);
  add('debris-2', 'tole', 'wreck-hull', 'details', frustum(0, 18, { y: [0, 2], z: [0, 10] }), { ry: -50, rx: 6, t: [-30, 0, 52] }, true);
  return P;
}

// Chute : tangage nez en bas, roulis sur la droite, enfoncement ; ensuite coupé au plan du sol.
export const CRASH = Object.freeze({ pitch: -9, roll: 12, sink: 12 });

// Maillage de l'hélicoptère, posé au sol, dans le repère du modèle (avant le lacet et la translation de placement). Renvoie
// { triangles: [{ part, region, tint, group, p: [[x, y, z] × 3], n: [x, y, z] }], count, bounds: { x0, x1, y0, y1, z0, z1 } }.
export function helicopterModel(crash = CRASH) {
  const tris = [];
  for (const part of parts()) {
    const pts = part.loose ? part.corners : part.corners.map((p) => {
      const q = rotZ(rotX(p, crash.roll * DEG), crash.pitch * DEG);
      return [q[0], q[1] - crash.sink, q[2]];
    });
    const centre = pts.reduce((s, p) => [s[0] + p[0] / 8, s[1] + p[1] / 8, s[2] + p[2] / 8], [0, 0, 0]);
    for (const f of FACES) {
      const quad = f.map((i) => pts[i]);
      let n = unitV(crossV(sub(quad[1], quad[0]), sub(quad[2], quad[0])));
      const mid = quad.reduce((s, p) => [s[0] + p[0] / 4, s[1] + p[1] / 4, s[2] + p[2] / 4], [0, 0, 0]);
      if (dot(n, sub(mid, centre)) < 0) {
        quad.reverse();
        n = n.map((v) => -v);
      }
      if (Math.abs(n[0]) + Math.abs(n[1]) + Math.abs(n[2]) === 0) continue;
      const poly = clipGround(quad);
      for (let i = 1; i + 1 < poly.length; i += 1) {
        const p = [poly[0], poly[i], poly[i + 1]];
        const area = Math.hypot(...crossV(sub(p[1], p[0]), sub(p[2], p[0])));
        if (area < 1e-6) continue;
        tris.push({ part: part.id, region: part.region, tint: part.tint, group: part.group, p: p.map((v) => v.map((c) => Math.round(c * 1000) / 1000)), n: n.map((c) => Math.round(c * 10000) / 10000) });
      }
    }
  }
  return { triangles: tris, count: tris.length, bounds: boundsOf(tris) };
}

function boundsOf(tris) {
  const b = { x0: Infinity, x1: -Infinity, y0: Infinity, y1: -Infinity, z0: Infinity, z1: -Infinity };
  for (const t of tris) {
    for (const p of t.p) {
      b.x0 = Math.min(b.x0, p[0]);
      b.x1 = Math.max(b.x1, p[0]);
      b.y0 = Math.min(b.y0, p[1]);
      b.y1 = Math.max(b.y1, p[1]);
      b.z0 = Math.min(b.z0, p[2]);
      b.z1 = Math.max(b.z1, p[2]);
    }
  }
  return b;
}

// Place le modèle dans le monde : spec { x, y (centre, unités du jeu), heading (degrés, cap du nez : 0 = est, 90 = sud) }. Renvoie les triangles en coordonnées
// de scène (X = x du jeu, Y = hauteur, Z = y du jeu), même forme que helicopterModel.
export function placeHelicopter(spec, model = helicopterModel()) {
  const a = num(spec?.heading) * DEG;
  const x = num(spec?.x);
  const y = num(spec?.y);
  const move = (p) => {
    const q = rotY(p, a);
    return [Math.round((q[0] + x) * 1000) / 1000, q[1], Math.round((q[2] + y) * 1000) / 1000];
  };
  const tris = model.triangles.map((t) => ({ ...t, p: t.p.map(move), n: rotY(t.n, a).map((c) => Math.round(c * 10000) / 10000) }));
  return { triangles: tris, count: tris.length, bounds: boundsOf(tris) };
}

// Emprise au sol (unités du jeu, arrondie vers l'extérieur) des triangles d'un groupe de pièces.
function footprintOf(tris, groups) {
  const sel = tris.filter((t) => groups.includes(t.group));
  if (sel.length === 0) return null;
  const b = boundsOf(sel);
  const x0 = Math.floor(b.x0);
  const y0 = Math.floor(b.z0);
  return { x: x0, y: y0, w: Math.ceil(b.x1) - x0, h: Math.ceil(b.z1) - y0 };
}

// Rectangles de collision (3) : fuselage (patins et verrière compris), poutre de queue, queue arrachée. Les pales et les débris ne bloquent rien.
// Renvoie aussi l'emprise visuelle de tout l'hélicoptère (pales comprises) : { rects: [{ id, x, y, w, h }], visual: { x, y, w, h }, height, triangles }.
export function helicopterFootprint(spec) {
  const placed = placeHelicopter(spec);
  const id = typeof spec?.id === 'string' ? spec.id : 'helicoptere';
  const rects = [['fuselage'], ['poutre'], ['queue']].map((g, i) => {
    const r = footprintOf(placed.triangles, g);
    return r ? { id: `${id}-${i + 1}`, ...r } : null;
  }).filter(Boolean);
  const all = footprintOf(placed.triangles, ['fuselage', 'poutre', 'queue', 'pales', 'details']);
  return { rects, visual: all, height: Math.ceil(placed.bounds.y1), triangles: placed.count };
}

// --- Voiture en flammes -----------------------------------------------------------------------------------------------------------------------------

// Boîtes de la voiture calcinée (même découpe que les voitures abandonnées de js/game/world.js : caisse, habitacle, toit ; roues dessinées à part) :
// la caisse repose sur ses jantes (plus basse), l'habitacle n'a plus de vitres, le toit est affaissé. car : { x, y, w, h, hauteur }.
// Renvoie { boxes: [{ id, region, tint, x0, x1, y0, y1, z0, z1 }], wheels: [{ x, y, z, r, w }], tint } ; aucun hasard.
export function burntCarParts(car) {
  const c = { x: num(car?.x), y: num(car?.y), w: num(car?.w, 92), h: num(car?.h, 46), hauteur: num(car?.hauteur, 55) };
  const bodyTop = 31;
  const roof = c.hauteur - 9;
  const cabin = { x0: c.x + c.w * 0.2, x1: c.x + c.w * 0.7, z0: c.y + c.h * 0.075, z1: c.y + c.h * 0.925 };
  const boxes = [
    { id: 'caisse', region: 'tole', tint: 'car-burnt', x0: c.x, x1: c.x + c.w, y0: 4, y1: bodyTop, z0: c.y, z1: c.y + c.h },
    { id: 'habitacle', region: 'pneu', tint: 'car-soot', ...cabin, y0: bodyTop, y1: roof - 3 },
    { id: 'toit', region: 'tole', tint: 'car-soot', ...cabin, y0: roof - 3, y1: roof },
  ];
  const wheels = [];
  for (const fx of [0.2, 0.8]) for (const fz of [0, 1]) wheels.push({ x: c.x + c.w * fx, y: 6, z: c.y + (fz === 0 ? 0 : c.h), r: 6, w: 6 });
  return { boxes, wheels, height: roof };
}

// Un seul feu groupé, deux foyers : le capot (avant de la voiture, côté x croissant) et l'habitacle. Renvoie [{ x, z, y, w, d }] (scène : z = y du jeu).
export function carFireSpots(car) {
  const parts2 = burntCarParts(car);
  const body = parts2.boxes[0];
  const cab = parts2.boxes[1];
  const cx = (body.z0 + body.z1) / 2;
  return [
    { id: 'capot', x: r1(body.x0 + (body.x1 - body.x0) * 0.86), z: r1(cx), y: body.y1, w: r1((body.x1 - body.x0) * 0.24), d: r1((body.z1 - body.z0) * 0.7) },
    { id: 'habitacle', x: r1((cab.x0 + cab.x1) / 2), z: r1(cx), y: parts2.height, w: r1((cab.x1 - cab.x0) * 0.7), d: r1((cab.z1 - cab.z0) * 0.6) },
  ];
}

// --- Cratère et traînée (lot 5a-F, retour du propriétaire) ---------------------------------------------------------------------------------------

// Nombre pseudo-aléatoire stable dans [0, 1[ (aucun hasard natif).
function hash01(a, b) {
  let h = (Math.imul(Math.trunc(a) | 0, 374761393) + Math.imul(Math.trunc(b) | 0, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 15), 2246822519);
  h = Math.imul(h ^ (h >>> 13), 3266489917);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

const inBuilding = (x, z, footprint, margin) => footprint.some((f) => x > f.x - margin && x < f.x + f.w + margin && z > f.y - margin && z < f.y + f.h + margin);

// Triangle orienté vers le haut (normale calculée, retournée si elle pointe vers le bas) ; null s'il touche le bâtiment (centre à moins de margin).
function groundTri(p, tint, footprint, margin) {
  const cx = (p[0][0] + p[1][0] + p[2][0]) / 3;
  const cz = (p[0][2] + p[1][2] + p[2][2]) / 3;
  if (inBuilding(cx, cz, footprint, margin)) return null;
  let n = unitV(crossV(sub(p[1], p[0]), sub(p[2], p[0])));
  let q = p;
  if (n[1] < 0) {
    q = [p[0], p[2], p[1]];
    n = n.map((v) => -v);
  }
  return { tint, p: q.map((v) => v.map((c) => Math.round(c * 100) / 100)), n: n.map((c) => Math.round(c * 10000) / 10000) };
}

// Cratère de terre autour de l'hélicoptère (scène : X = x du jeu, Z = y du jeu, Y = hauteur ; au sol, aucun sommet sous y = 0) : fond brûlé à plat, bourrelet de
// terre rejetée irrégulier, bord qui retombe ; ellipse rx × ry orientée selon le cap ; les triangles qui touchent le bâtiment (contour + margin) sont retirés.
// spec : { x, y, heading, crater: { rx, ry } } ; footprint : rectangles du bâtiment. Renvoie [{ tint, p, n }].
export function craterTriangles(spec, footprint = [], { sectors = 28, margin = 24, floorY = 0.5 } = {}) {
  const rx = num(spec?.crater?.rx);
  const ry = num(spec?.crater?.ry);
  if (rx <= 0 || ry <= 0) return [];
  const a = num(spec?.heading) * DEG;
  // Anneaux : rayon relatif, hauteur, teinte (fond brûlé, terre retournée).
  const rings = [[0, floorY, 'crater-burnt'], [0.6, floorY, 'crater-burnt'], [0.82, 2.5, 'crater-earth'], [0.95, 6, 'crater-earth'], [1.12, floorY, 'crater-earth']];
  const at = (k, j) => {
    const [r, h] = rings[k];
    const t = (j / sectors) * Math.PI * 2;
    const wob = k === 0 ? 1 : 0.85 + 0.3 * hash01(j, k + 1);
    const lx = Math.cos(t) * rx * r * wob;
    const lz = Math.sin(t) * ry * r * wob;
    const y = k === 3 ? h * (0.55 + 0.9 * hash01(j, 7)) : h;
    return [num(spec.x) + lx * Math.cos(a) - lz * Math.sin(a), y, num(spec.y) + lx * Math.sin(a) + lz * Math.cos(a)];
  };
  const out = [];
  for (let j = 0; j < sectors; j += 1) {
    const j1 = (j + 1) % sectors;
    for (let k = 0; k < rings.length - 1; k += 1) {
      const tint = rings[k + 1][2];
      const quad = [at(k, j), at(k + 1, j), at(k + 1, j1), at(k, j1)];
      for (const tri of k === 0 ? [[quad[0], quad[1], quad[2]]] : [[quad[0], quad[1], quad[2]], [quad[0], quad[2], quad[3]]]) {
        const t = groundTri(tri, tint, footprint, margin);
        if (t) out.push(t);
      }
    }
  }
  return out;
}

// Traînée de glissade : sillon de terre labourée (à plat) bordé de deux bourrelets, de l'hélicoptère vers l'arrière de son cap (d'où il a glissé), qui s'élargit
// en approchant. spec : { x, y, heading, trail: { length, width } }. Renvoie [{ tint, p, n }].
export function trailTriangles(spec, footprint = [], { segments = 12, margin = 24, floorY = 0.6 } = {}) {
  const len = num(spec?.trail?.length);
  const wid = num(spec?.trail?.width);
  if (len <= 0 || wid <= 0) return [];
  const a = num(spec?.heading) * DEG;
  const back = [-Math.cos(a), -Math.sin(a)]; // vers l'arrière du cap
  const side = [-back[1], back[0]];
  const startOff = num(spec?.crater?.rx) * 0.7; // le sillon sort du cratère
  const pt = (u, s, y) => {
    const d = startOff + u * len;
    const w = wid * (1 - 0.55 * u) * (0.9 + 0.2 * hash01(Math.round(u * 100), 3));
    return [num(spec.x) + back[0] * d + side[0] * s * w / 2, y, num(spec.y) + back[1] * d + side[1] * s * w / 2];
  };
  const out = [];
  const add = (tri, tint) => {
    const t = groundTri(tri, tint, footprint, margin);
    if (t) out.push(t);
  };
  for (let i = 0; i < segments; i += 1) {
    const u0 = i / segments;
    const u1 = (i + 1) / segments;
    const rim = (u) => 4 * (1 - 0.7 * u);
    // Sillon (fond), puis bourrelets de chaque côté (pente intérieure et extérieure).
    add([pt(u0, -0.8, floorY), pt(u1, -0.8, floorY), pt(u1, 0.8, floorY)], 'crater-burnt');
    add([pt(u0, -0.8, floorY), pt(u1, 0.8, floorY), pt(u0, 0.8, floorY)], 'crater-burnt');
    for (const s of [-1, 1]) {
      const inner0 = pt(u0, 0.8 * s, floorY);
      const inner1 = pt(u1, 0.8 * s, floorY);
      const top0 = pt(u0, 1.05 * s, rim(u0));
      const top1 = pt(u1, 1.05 * s, rim(u1));
      const out0 = pt(u0, 1.4 * s, floorY);
      const out1 = pt(u1, 1.4 * s, floorY);
      add([inner0, inner1, top1], 'crater-earth');
      add([inner0, top1, top0], 'crater-earth');
      add([top0, top1, out1], 'crater-earth');
      add([top0, out1, out0], 'crater-earth');
    }
  }
  return out;
}

// Emprise au sol (unités du jeu) du cratère et de la traînée, en boîtes serrées (le cratère, puis la traînée par quarts : elle peut être en diagonale) : le petit
// décor posé dessus est retiré. Renvoie { boxes: [{ x, y, w, h }], triangles } ; boxes vide sans cratère ni traînée.
export function groundScarBoxes(spec, footprint = []) {
  const crater = craterTriangles(spec, footprint);
  const trail = trailTriangles(spec, footprint);
  const boxOf = (tris) => {
    const b = boundsOf(tris);
    const x0 = Math.floor(b.x0);
    const y0 = Math.floor(b.z0);
    return { x: x0, y: y0, w: Math.ceil(b.x1) - x0, h: Math.ceil(b.z1) - y0 };
  };
  const boxes = crater.length > 0 ? [boxOf(crater)] : [];
  const per = Math.ceil(trail.length / 4);
  for (let i = 0; i < trail.length; i += per) boxes.push(boxOf(trail.slice(i, i + per)));
  return { boxes, triangles: crater.length + trail.length };
}
