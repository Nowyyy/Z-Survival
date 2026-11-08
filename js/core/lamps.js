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

// Portée sûre d'une lumière (floor, x, y en unités, h : hauteur de la lumière) : la plus grande distance qui n'atteint jamais l'autre étage.
// Rez-de-chaussée : sous le sol de l'étage (floorLift − h − 2). Étage : trous des escaliers (les marches montent jusqu'au sol de l'étage), parties du
// rez-de-chaussée visibles d'en haut (sommets des murs à floorLift − 1), sol du rez-de-chaussée. Extérieur (lot 5k-G : feux de la voiture et des
// bidons) : comme le rez-de-chaussée (l'étage est au-dessus). Lot 5k-G : partagée par les lampes et les feux.
export function reachCalculator(worlds, opts = {}) {
  const t = isNum(opts.wallThickness) ? opts.wallThickness : 40;
  const lift = isNum(opts.floorLift) ? opts.floorLift : 180;
  const exposed = worlds?.etage ? exposedPoints(worlds.rdc?.contour, worlds.etage.contour, t / 2) : [];
  const holes = (worlds?.etage?.stairs ?? []).map((s) => ({ x: s.x - 10, y: s.y - 10, w: s.w + 20, h: s.h + 20 }));
  return (floor, lx, ly, lh) => {
    if (floor !== 'etage') return lift - lh - 2;
    let portee = Infinity;
    for (const r of holes) portee = Math.min(portee, Math.hypot(rectDistance(r, lx, ly), lh));
    for (const [px, py] of exposed) portee = Math.min(portee, Math.hypot(px - lx, py - ly, lh + 1));
    return Math.min(portee, lift + lh - 2);
  };
}

// Lot 5k-G : feux intérieurs (feux.json, posés sur une pièce de mobilier.world.json) comme sources de lumière : centre et dessus de la pièce,
// lumière à `flamme` au-dessus, portée sûre. pieces : { [id]: { boxes } } ; renvoie [{ id, floor, kind: 'feu', light, portee }].
export function firesToWorld(feux, pieces, worlds, opts = {}) {
  const reach = reachCalculator(worlds, opts);
  const flame = isNum(opts.flammeFeu) ? opts.flammeFeu : 14;
  const out = [];
  for (const fe of Array.isArray(feux) ? feux : []) {
    const boxes = pieces?.[fe?.piece]?.boxes;
    if (!FLOORS.includes(fe?.floor) || !Array.isArray(boxes) || boxes.length === 0) continue;
    const x = (Math.min(...boxes.map((b) => b.x0)) + Math.max(...boxes.map((b) => b.x1))) / 2;
    const y = (Math.min(...boxes.map((b) => b.z0)) + Math.max(...boxes.map((b) => b.z1))) / 2;
    const h = Math.max(...boxes.map((b) => b.y1)) + flame;
    const portee = Math.floor(reach(fe.floor, x, y, h));
    if (portee > 0) out.push({ id: String(fe.id), floor: fe.floor, kind: 'feu', light: { x: r2(x), y: r2(y), h: r2(h) }, portee });
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
  const win = isNum(opts.windowSize) ? opts.windowSize : 72;
  const dec = isNum(opts.decalage) ? opts.decalage : 16;
  const flame = isNum(opts.flamme) ? opts.flamme : 10;
  const tr = worlds?.rdc?.transform ?? { scale: 5, margin: 800, x0: 0, y0: 0 };
  const X = (px) => (px - (tr.x0 ?? 0)) * tr.scale + tr.margin;
  const Y = (py) => (py - (tr.y0 ?? 0)) * tr.scale + tr.margin;
  const lamps = [];
  const problems = [];
  const holes = (worlds?.etage?.stairs ?? []).map((s) => ({ x: s.x - 10, y: s.y - 10, w: s.w + 20, h: s.h + 20 }));
  const reach = reachCalculator(worlds, opts);
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
    const portee = reach(it.floor, lx, ly, lh);
    if (!(portee > 0)) { problems.push(`${it.id} : portée nulle (trop près de l'autre étage)`); continue; }
    const out = { id: it.id, floor: it.floor, support: it.support, on: face.on, orientation: it.orientation, x: r2(face.x), y: r2(face.y), n: { x: nx, y: ny }, hauteur: it.hauteur,
      light: { x: r2(lx), y: r2(ly), h: lh }, portee: Math.floor(portee), ...(face.pillar ? { pillar: face.pillar } : {}), source: { x: it.x, y: it.y } };
    // Lampe du rez-de-chaussée entièrement sous le sol (ou les murs) de l'étage, loin des trous : cachée par l'étage, jamais dessinée quand il est affiché.
    if (it.floor === 'rdc' && worlds?.etage) {
      const sp = lampSphere(out);
      const pts = [[sp.x - sp.r, sp.z], [sp.x + sp.r, sp.z], [sp.x, sp.z - sp.r], [sp.x, sp.z + sp.r]];
      const under = (x, y) => [[0, 0], [t / 2, 0], [-t / 2, 0], [0, t / 2], [0, -t / 2]].some(([dx, dy]) => pointInPolygon(x + dx, y + dy, worlds.etage.contour));
      out.couverte = pts.every(([x, y]) => under(x, y)) && holes.every((h) => rectDistance(h, sp.x, sp.z) > sp.r);
    }
    lamps.push(out);
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

// Sphère englobante d'une lampe (centre en unités du monde, y au-dessus du sol de son étage ; rayon) : choix des lampes à dessiner (champ de la caméra).
export function lampSphere(lamp) {
  const r = lamp.pillar ? Math.hypot(lamp.pillar.w, lamp.pillar.h) / 2 + 4 : 0;
  return { x: lamp.x + lamp.n.x * 10, y: lamp.hauteur + 2, z: lamp.y + lamp.n.y * 10, r: Math.max(r + 10, 24) };
}

// Triangles d'une lampe du monde (sortie de lampsToWorld). L'ordre des sommets est fixe : même lampe, mêmes triangles. Sphère englobante : lampSphere.
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
    box(out, frame, { f0: PLATE.f0, f1: PLATE.f1, s0: -PLATE.s, s1: PLATE.s, y0: PLATE.y0, y1: PLATE.y1 }, ['y1', 'f1', 's0', 's1'], LAMP_COLORS.metal);
  }
  // Dessous des pièces omis : la caméra est toujours au-dessus des lampes (budget de triangles).
  box(out, frame, { f0: ARM.f0, f1: ARM.f1, s0: -ARM.s, s1: ARM.s, y0: ARM.y0, y1: ARM.y1 }, ['y1', 'f1', 's0', 's1'], LAMP_COLORS.metal);
  box(out, frame, { f0: RES.f0, f1: RES.f1, s0: -RES.s, s1: RES.s, y0: RES.y0, y1: RES.y1 }, ['y1', 'f0', 'f1', 's0', 's1'], LAMP_COLORS.reservoir);
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

// ---- Lumières dynamiques (option « Éclairage », partie C) ----
// data/game/lumieres.json : valeurs vérifiées ; toute valeur invalide prend le défaut (provisoire). Vacillement borné : amplitude ≤ 0,15 (part de
// l'intensité), fréquences ≤ 1,4 Hz (moins de 3 changements de sens par seconde) ; fondu en secondes (entrée et sortie d'une lampe).
export const LIGHT_DEFAULTS = Object.freeze({ ambiance: 0.45, plancherAmbiance: 0.3, lune: 0.45, intensite: 180, distance: 120, decroissance: 1, fondu: 0.6, max: 4, distanceActivation: 700,
  // Lot 5k-I (retour du propriétaire : la lumière ne doit pas rester éteinte longtemps ; la durée allumée varie) : léger bruit lent, et de brèves
  // baisses (coupures) : allumée de allumee[0] à allumee[1] secondes (tiré par source et par coupure), baisse de duree[0] à duree[1] secondes,
  // profondeur (part de l'intensité retirée au plus bas, 60 à 100 % de profondeur selon la coupure), jamais d'un coup (descente et remontée douces).
  vacillement: Object.freeze({ amplitude: 0.04, periode: Object.freeze([1.2, 3.5]), coupures: Object.freeze({ allumee: Object.freeze([2, 7]), duree: Object.freeze([0.12, 0.35]), profondeur: 0.7 }) }),
  // Lot 5k-G : ombres des lumières (carte d'ombres cubique, côté en pixels ; biais) et feux comme sources (intensité, portée, vacillement).
  ombres: Object.freeze({ taille: 256, biais: -0.004 }),
  feux: Object.freeze({ intensite: 600, distance: 110, vacillement: Object.freeze({ amplitude: 0.15, periode: Object.freeze([0.6, 1.6]) }) }),
  // Lot 5k-H : rayons de lune par les fenêtres du côté de la lune (taches de lumière au sol, en Éclairage) ; selection : préférence pour les
  // sources déjà allumées (une source éclairée n'est remplacée que par une source nettement plus proche : moins d'allumages et d'extinctions).
  fenetres: Object.freeze({ intensite: 0.35, etirement: 2.2 }),
  selection: Object.freeze({ maintien: 0.75 }) });
export const SHADOW_SIZES = [128, 256, 512];
// Lot 5k-H : vacillement en bruit lent (valeur tirée à chaque période, transition douce) : un changement de sens par période au plus ; période
// d'au moins 0,5 s (2 changements par seconde au plus, sous la limite de 3), amplitude de 15 % au plus.
// Lot 5k-I : coupures (décision du propriétaire) : profondeur de 0,9 au plus (jamais le noir complet), durée d'au moins 0,1 s (descente et
// remontée d'au moins 0,05 s chacune), au moins 1 s allumée entre deux coupures : 3 changements par seconde au plus restent tenus.
export const FLICKER_MAX = Object.freeze({ amplitude: 0.15, periodeMin: 0.5, periodeMax: 10, profondeurMax: 0.9, dureeMin: 0.1, dureeMax: 1.5, allumeeMin: 1 });
const rangeOf = (raw, lo, hi, d) => (Array.isArray(raw) && raw.length === 2 && raw.every(isNum) && raw[0] >= lo && raw[1] >= raw[0] && raw[1] <= hi ? [raw[0], raw[1]] : [...d]);
const cutsOf = (raw, d) => {
  if (!d) return null;
  const r = raw !== null && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  return { allumee: rangeOf(r.allumee, FLICKER_MAX.allumeeMin, 120, d.allumee), duree: rangeOf(r.duree, FLICKER_MAX.dureeMin, FLICKER_MAX.dureeMax, d.duree), profondeur: inRange(r.profondeur, 0, FLICKER_MAX.profondeurMax, d.profondeur) };
};
const periodOf = (raw, d) => {
  const p = Array.isArray(raw) && raw.length === 2 && raw.every(isNum) ? raw : null;
  return p && p[0] >= FLICKER_MAX.periodeMin && p[1] >= p[0] && p[1] <= FLICKER_MAX.periodeMax ? [p[0], p[1]] : [...d];
};
const inRange = (v, lo, hi, d) => (isNum(v) && v >= lo && v <= hi ? v : d);

export function parseLightConfig(json) {
  const j = json !== null && typeof json === 'object' && !Array.isArray(json) ? json : {};
  const d = LIGHT_DEFAULTS;
  const v = j.vacillement !== null && typeof j.vacillement === 'object' ? j.vacillement : {};
  const o = j.ombres !== null && typeof j.ombres === 'object' ? j.ombres : {};
  const fx = j.feux !== null && typeof j.feux === 'object' ? j.feux : {};
  const fv = fx.vacillement !== null && typeof fx.vacillement === 'object' ? fx.vacillement : {};
  return {
    lune: inRange(j.lune, 0, 1, d.lune),
    ombres: { taille: SHADOW_SIZES.includes(o.taille) ? o.taille : d.ombres.taille, biais: inRange(o.biais, -0.05, 0.05, d.ombres.biais) },
    feux: {
      intensite: inRange(fx.intensite, 0, 100000, d.feux.intensite),
      distance: inRange(fx.distance, 10, 1000, d.feux.distance),
      vacillement: { amplitude: inRange(fv.amplitude, 0, FLICKER_MAX.amplitude, d.feux.vacillement.amplitude), periode: periodOf(fv.periode, d.feux.vacillement.periode) },
    },
    ambiance: inRange(j.ambiance, 0, 1, d.ambiance),
    plancherAmbiance: inRange(j.plancherAmbiance, 0.05, 1, d.plancherAmbiance),
    intensite: inRange(j.intensite, 0, 100000, d.intensite),
    distance: inRange(j.distance, 10, 1000, d.distance),
    decroissance: inRange(j.decroissance, 0, 4, d.decroissance),
    fondu: inRange(j.fondu, 0.05, 5, d.fondu),
    max: [2, 4, 6].includes(j.max) ? j.max : d.max,
    distanceActivation: inRange(j.distanceActivation, 50, 5000, d.distanceActivation),
    vacillement: { amplitude: inRange(v.amplitude, 0, FLICKER_MAX.amplitude, d.vacillement.amplitude), periode: periodOf(v.periode, d.vacillement.periode), coupures: cutsOf(v.coupures, d.vacillement.coupures) },
    fenetres: { intensite: inRange(j.fenetres?.intensite, 0, 4, d.fenetres.intensite), etirement: inRange(j.fenetres?.etirement, 0.5, 6, d.fenetres.etirement) },
    selection: { maintien: inRange(j.selection?.maintien, 0.3, 1, d.selection.maintien) },
  };
}

// Facteurs des lumières existantes en « Éclairage » : ambiante × max(ambiance, plancher) (jamais le noir complet), lune (lumière directionnelle et ses
// ombres) × lune (lot 5k-G : séparé, pour que les ombres de la lune ne contredisent pas celles des lampes).
export function baseFactors(cfg) {
  const c = cfg ?? LIGHT_DEFAULTS;
  return { ambient: Math.max(c.ambiance, c.plancherAmbiance), sun: isNum(c.lune) ? c.lune : c.ambiance };
}

// Vacillement (lot 5k-H, retour du propriétaire : moins régulier, jamais toutes les lampes ensemble) : facteur d'intensité dans [1 − amplitude, 1].
// Bruit lent propre à chaque source : une valeur tirée (sans hasard : d'après la phase de la source) à chaque période, transition douce entre deux
// valeurs (aucun saut) ; la période (dans `periode`) et l'amplitude (60 à 100 % de `amplitude`) dépendent aussi de la source. Un seul changement de
// sens par période au plus. Temps de jeu t en secondes ; mouvement réduit : 1 (lumière constante).
const frac = (x) => x - Math.floor(x);
const noise = (phase, n) => frac(Math.sin(n * 127.1 + phase * 311.7) * 43758.5453);
export function flicker(t, phase, cfg, reduced = false) {
  const v = (cfg ?? LIGHT_DEFAULTS).vacillement;
  if (reduced) return 1;
  let level = 1;
  if (v.amplitude > 0) {
    const [p0, p1] = v.periode;
    const period = p0 + (p1 - p0) * noise(phase, 0.5);
    const amp = v.amplitude * (0.6 + 0.4 * noise(phase, 1.5));
    const x = t / period + phase;
    const k = Math.floor(x);
    const f = x - k;
    const s = f * f * (3 - 2 * f);
    const a = noise(phase, k);
    level = 1 - amp * (a + (noise(phase, k + 1) - a) * s);
  }
  // Coupures (lot 5k-I) : une par tranche de durée fixe propre à la source ; dans chaque tranche, une coupure de durée et de profondeur tirées,
  // placée au hasard dans la tranche, à 0,5 s au moins de ses bords : la durée allumée entre deux coupures varie ; la coupure suit sin² (douce).
  const c = v.coupures;
  if (c && c.profondeur > 0) {
    const span = c.allumee[0] + (c.allumee[1] - c.allumee[0]) * noise(phase, 2.5) + c.duree[1];
    const x = t + phase * span;
    const k = Math.floor(x / span);
    const u = x - k * span;
    const d = c.duree[0] + (c.duree[1] - c.duree[0]) * noise(phase, k + 0.25);
    const lead = FLICKER_MAX.allumeeMin / 2; // au moins 1 s de lumière entre deux coupures, la place de la coupure varie dans le reste
    const start = lead + (span - d - 2 * lead) * noise(phase, k + 0.75);
    if (u >= start && u <= start + d) {
      const g = Math.sin((Math.PI * (u - start)) / d) ** 2;
      level *= 1 - c.profondeur * (0.6 + 0.4 * noise(phase, k + 0.5)) * g;
    }
  }
  return level;
}

// Phase d'une lampe (stable, d'après son identifiant).
export function lampPhase(id) {
  let h = 2166136261;
  for (const ch of String(id)) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return ((h >>> 0) % 6283) / 1000;
}

// Lampes à éclairer : celles de la liste (étage affiché) visibles (visible[i] : sa lumière touche le champ de la caméra), à moins de
// distanceActivation du joueur, les `count` plus proches ; à distance égale, l'identifiant. Lot 5k-H : current (identifiants déjà éclairés) et
// maintien (0,3 à 1) : la distance d'une source déjà éclairée compte pour maintien × sa distance (elle n'est remplacée que par une source nettement
// plus proche). Écrit les identifiants dans out (tableau réutilisé).
export function selectLamps(out, lamps, visible, px, py, count, maxDistance, current = null, maintien = 1) {
  out.length = 0;
  for (let i = 0; i < lamps.length; i += 1) {
    if (!visible[i]) continue;
    const raw = Math.hypot(lamps[i].light.x - px, lamps[i].light.y - py);
    if (raw > maxDistance) continue;
    const d = current && current.includes(lamps[i].id) ? raw * maintien : raw;
    let k = out.length;
    out.push(null);
    while (k > 0) {
      const o = out[k - 1];
      if (o.d < d || (o.d === d && o.id < lamps[i].id)) break;
      out[k] = o;
      k -= 1;
    }
    out[k] = { id: lamps[i].id, d };
  }
  if (out.length > count) out.length = count;
  for (let i = 0; i < out.length; i += 1) out[i] = out[i].id;
  return out;
}

// Lot 5k-H : rayons de lune par une fenêtre. win : { x, y (centre sur l'axe du mur), side : nord | sud | est | ouest } ; moon : position de la lune
// relative à sa cible (render.json → light.sunOffset ; la lumière va dans le sens opposé) ; opening : { width, sill, lintel, thickness }. Renvoie
// null si la lune n'entre pas par ce côté, sinon les quatre coins au sol { x, y } (projection de l'ouverture le long des rayons, depuis la face
// intérieure du mur) : bas de l'ouverture d'abord (bord le plus clair), puis le haut.
const INWARD = { nord: [0, 1], sud: [0, -1], ouest: [1, 0], est: [-1, 0] };
export function moonPatch(win, moon, opening) {
  const n = INWARD[win?.side];
  if (!n || !isNum(moon?.y) || moon.y <= 0) return null;
  const tx = -moon.x / moon.y; // déplacement au sol par unité de hauteur (sens des rayons)
  const tz = -moon.z / moon.y;
  if (n[0] * tx + n[1] * tz <= 0.05) return null; // la lune n'éclaire pas ce côté
  const half = opening.width / 2;
  const cx = win.x + n[0] * (opening.thickness / 2);
  const cy = win.y + n[1] * (opening.thickness / 2);
  const sx = -n[1];
  const sy = n[0];
  const at = (s, h) => ({ x: r2(cx + sx * s + tx * h), y: r2(cy + sy * s + tz * h) });
  return [at(-half, opening.sill), at(half, opening.sill), at(half, opening.lintel), at(-half, opening.lintel)];
}

// Lot 5k-I (retour du propriétaire : « on dirait un bloc blanc », « le rayon ne part pas de la fenêtre ») : rayon de lune doux, en grille : du
// pied du mur (face intérieure, sous la fenêtre) jusqu'à la projection du haut de l'ouverture ; poids 0 sur les bords et au bout, plus fort à la
// projection du bas de l'ouverture. Renvoie null (côté sans lune) ou { points: [{ x, y, w }], triangles: [[i, j, k]] } (grille de cols × rows).
export function moonBeam(win, moon, opening, cols = 5) {
  const q = moonPatch(win, moon, opening);
  if (!q) return null;
  const n = INWARD[win.side];
  const half = opening.width / 2;
  const cx = win.x + n[0] * (opening.thickness / 2);
  const cy = win.y + n[1] * (opening.thickness / 2);
  const sx = -n[1];
  const sy = n[0];
  const tx = -moon.x / moon.y;
  const tz = -moon.z / moon.y;
  const rows = [[0, 0.35], [opening.sill, 1], [(opening.sill + opening.lintel) / 2, 0.6], [opening.lintel, 0]];
  const colW = Array.from({ length: cols }, (_, i) => Math.sin((Math.PI * i) / (cols - 1)) ** 1.5);
  const points = [];
  for (const [h, rw] of rows) {
    for (let i = 0; i < cols; i += 1) {
      const sv = -half + (2 * half * i) / (cols - 1);
      points.push({ x: r2(cx + sx * sv + tx * h), y: r2(cy + sy * sv + tz * h), w: Math.round(rw * colW[i] * 1000) / 1000 });
    }
  }
  const triangles = [];
  for (let r = 0; r < rows.length - 1; r += 1) {
    for (let i = 0; i < cols - 1; i += 1) {
      const a = r * cols + i;
      triangles.push([a, a + 1, a + cols + 1], [a, a + cols + 1, a + cols]);
    }
  }
  return { points, triangles };
}

// Emplacements des lumières (tableau fixe { id, w }, w de 0 à 1) : une lampe choisie garde son emplacement ; une lampe qui n'est plus choisie
// s'éteint en `fondu` secondes, puis libère l'emplacement ; une nouvelle lampe prend un emplacement libre et s'allume en `fondu` secondes. Aucun
// saut : w change d'au plus dt / fondu par appel. Modifie et renvoie slots.
export function stepSlots(slots, wanted, dt, fondu) {
  const rate = Math.max(0, Number(dt) || 0) / Math.max(1e-6, fondu);
  for (const s of slots) {
    const on = s.id !== null && wanted.includes(s.id);
    s.w = on ? Math.min(1, s.w + rate) : Math.max(0, s.w - rate);
    if (!on && s.w === 0) s.id = null;
  }
  for (const id of wanted) {
    if (slots.some((s) => s.id === id)) continue;
    const free = slots.find((s) => s.id === null);
    if (free) {
      free.id = id;
      free.w = Math.min(1, rate);
    }
  }
  return slots;
}
