// Cartes (lot 3b) : choix de la carte (?map=) et conversion d'un plan en pixels (data/game/maps/<id>/plan.json) en monde du jeu (world.json et
// decor.json de la carte). Pur : n'utilise que ses arguments, renvoie de nouveaux objets, ne modifie pas ses arguments, ne lève aucune exception
// sur des entrées inattendues, déterministe (aucun hasard, aucune horloge).
// Conversion : x_monde = (x_px - x0) * scale + margin et y_monde = (y_px - y0) * scale + margin, (x0, y0) = coin haut gauche de la boîte
// englobante du plan. Les chiffres (échelle, marge, épaisseurs, règles de jeu) viennent de data/game/maps/params.json ; DEFAULT_PARAMS n'est
// que le repli (un test vérifie qu'il est identique au fichier).
import { distanceToRect, isRect, rectGap, validRects } from './collision.js';
import { boundingRect, coveredBy, overlapArea, pointInPolygon, polygonArea, polygonRects, segmentRects, totalArea, unionRects } from './shape.js';
import { isNum, num } from './vec.js';

export const MAP_IDS = ['rez-de-chaussee', 'salle'];
export const DEFAULT_MAP_ID = 'rez-de-chaussee';

// ?map=salle -> l'ancienne salle ; absent, vide ou inconnu -> la carte par défaut.
export function resolveMapId(search) {
  if (typeof search !== 'string' || search.length > 4000) return DEFAULT_MAP_ID;
  try {
    const value = new URLSearchParams(search).get('map');
    return MAP_IDS.includes(value) ? value : DEFAULT_MAP_ID;
  } catch {
    return DEFAULT_MAP_ID;
  }
}

export const DEFAULT_PARAMS = {
  scale: 5,
  margin: 800,
  round: 20,
  wallThickness: 40,
  wallHeight: 60,
  windowSize: 72,
  startZone: 120,
  windowDepth: 150,
  minCorridor: 50,
  maxHeight: 70,
  windowSpacing: 100,
  shiftMax: 50,
  shiftStep: 5,
  wallSnap: 40,
  approachWidth: 160,
  spawnDistances: [450, 650],
  pathMax: 900,
  stairsHeight: 70,
  pillarHeight: 70,
  kindHeights: { table: 40, comptoir: 55, caisse: 45, etagere: 70 },
  zoom: 3.5,
  decor: {
    seed: 30211,
    distanceSalle: 160,
    distanceApparition: 70,
    tarmac: { offset: 100, sidewalk: 90, road: 160 },
    paths: { length: 300, width: 100 },
    scatter: {
      voitures: { count: 4, long: 92, court: 46, hauteur: 55 },
      arbres: { count: 24, tronc: 32, hauteur: 50, couronne: 46 },
      buissons: { count: 18, rayonMin: 12, rayonMax: 22, hauteur: 18 },
      lampadaires: { count: 6, hauteur: 90 },
      barrieres: { count: 4, long: 120, epaisseur: 8, hauteur: 26 },
      espaceSolides: 80,
    },
  },
};

const isObject = (o) => o !== null && typeof o === 'object' && !Array.isArray(o);
const pos = (n, fallback) => (isNum(n) && n > 0 ? n : fallback);
const r6 = (n) => Math.round(n * 1e6) / 1e6;
const SIDES = {
  nord: { normal: { x: 0, y: -1 }, horizontal: true },
  sud: { normal: { x: 0, y: 1 }, horizontal: true },
  ouest: { normal: { x: -1, y: 0 }, horizontal: false },
  est: { normal: { x: 1, y: 0 }, horizontal: false },
};

// Paramètres nettoyés : toute valeur absente ou invalide prend la valeur de repli.
export function cleanParams(raw) {
  const r = isObject(raw) ? raw : {};
  const d = DEFAULT_PARAMS;
  const obj = (value, fallback) => (isObject(value) ? value : fallback);
  const dec = obj(r.decor, {});
  const sc = obj(dec.scatter, {});
  const group = (key) => ({ ...d.decor.scatter[key], ...Object.fromEntries(Object.entries(obj(sc[key], {})).filter(([k, v]) => isNum(v) && k in d.decor.scatter[key])) });
  const spawn = Array.isArray(r.spawnDistances) ? r.spawnDistances.filter((n) => isNum(n) && n > 0) : [];
  const kinds = { ...d.kindHeights, ...Object.fromEntries(Object.entries(obj(r.kindHeights, {})).filter(([, v]) => isNum(v) && v > 0)) };
  return {
    scale: pos(r.scale, d.scale),
    margin: isNum(r.margin) && r.margin >= 0 ? r.margin : d.margin,
    round: pos(r.round, d.round),
    wallThickness: pos(r.wallThickness, d.wallThickness),
    wallHeight: pos(r.wallHeight, d.wallHeight),
    windowSize: pos(r.windowSize, d.windowSize),
    startZone: pos(r.startZone, d.startZone),
    windowDepth: pos(r.windowDepth, d.windowDepth),
    minCorridor: pos(r.minCorridor, d.minCorridor),
    maxHeight: pos(r.maxHeight, d.maxHeight),
    windowSpacing: pos(r.windowSpacing, d.windowSpacing),
    shiftMax: isNum(r.shiftMax) && r.shiftMax >= 0 ? r.shiftMax : d.shiftMax,
    shiftStep: pos(r.shiftStep, d.shiftStep),
    wallSnap: isNum(r.wallSnap) && r.wallSnap >= 0 ? r.wallSnap : d.wallSnap,
    approachWidth: pos(r.approachWidth, d.approachWidth),
    spawnDistances: spawn.length > 0 ? spawn.slice(0, 4) : [...d.spawnDistances],
    pathMax: pos(r.pathMax, d.pathMax),
    stairsHeight: pos(r.stairsHeight, d.stairsHeight),
    pillarHeight: pos(r.pillarHeight, d.pillarHeight),
    kindHeights: kinds,
    zoom: pos(r.zoom, d.zoom),
    decor: {
      seed: isNum(dec.seed) ? Math.trunc(dec.seed) : d.decor.seed,
      distanceSalle: pos(dec.distanceSalle, d.decor.distanceSalle),
      distanceApparition: pos(dec.distanceApparition, d.decor.distanceApparition),
      tarmac: { ...d.decor.tarmac, ...Object.fromEntries(Object.entries(obj(dec.tarmac, {})).filter(([k, v]) => isNum(v) && k in d.decor.tarmac)) },
      paths: { ...d.decor.paths, ...Object.fromEntries(Object.entries(obj(dec.paths, {})).filter(([k, v]) => isNum(v) && k in d.decor.paths)) },
      scatter: { voitures: group('voitures'), arbres: group('arbres'), buissons: group('buissons'), lampadaires: group('lampadaires'), barrieres: group('barrieres'), espaceSolides: pos(sc.espaceSolides, d.decor.scatter.espaceSolides) },
    },
  };
}

const isPoint = (p) => Array.isArray(p) && isNum(p[0]) && isNum(p[1]);
const box = (r) => isObject(r) && [r.x0, r.y0, r.x1, r.y1].every(isNum) && r.x1 > r.x0 && r.y1 > r.y0;

// Plan nettoyé (pixels) ou null s'il manque l'essentiel : boîte englobante et contour rectiligne d'au moins 4 sommets.
export function cleanPlan(plan) {
  if (!isObject(plan) || !box(plan.bbox) || !Array.isArray(plan.contour)) return null;
  const contour = plan.contour.filter(isPoint).map((p) => [p[0], p[1]]);
  if (contour.length < 4) return null;
  const list = (value, ok) => (Array.isArray(value) ? value.filter(ok) : []);
  const segment = (s) => isObject(s) && [s.x1, s.y1, s.x2, s.y2].every(isNum);
  return {
    id: typeof plan.id === 'string' && plan.id !== '' ? plan.id : 'carte',
    title: typeof plan.title === 'string' ? plan.title : '',
    bbox: { x0: plan.bbox.x0, y0: plan.bbox.y0, x1: plan.bbox.x1, y1: plan.bbox.y1 },
    contour,
    walls: list(plan.walls, segment).map((s, i) => ({ id: typeof s.id === 'string' ? s.id : `mur-interieur-${i + 1}`, x1: s.x1, y1: s.y1, x2: s.x2, y2: s.y2 })),
    openings: list(plan.openings, segment).map((s, i) => ({ id: typeof s.id === 'string' ? s.id : `ouverture-${i + 1}`, x1: s.x1, y1: s.y1, x2: s.x2, y2: s.y2 })),
    windows: list(plan.windows, (w) => isObject(w) && typeof w.id === 'string' && Object.hasOwn(SIDES, w.side) && isNum(w.x) && isNum(w.y)).map((w) => ({ id: w.id, side: w.side, x: w.x, y: w.y, ...(isNum(w.planX) ? { planX: w.planX } : {}), ...(isNum(w.planY) ? { planY: w.planY } : {}) })),
    pillarSize: pos(plan.pillarSize, 14),
    pillars: list(plan.pillars, isPoint).map((p) => [p[0], p[1]]),
    stairs: list(plan.stairs, (s) => isObject(s) && box(s)).map((s, i) => ({ id: typeof s.id === 'string' ? s.id : `escalier-${i + 1}`, x0: s.x0, y0: s.y0, x1: s.x1, y1: s.y1 })),
    ramp: isObject(plan.ramp) && box(plan.ramp) ? { id: typeof plan.ramp.id === 'string' ? plan.ramp.id : 'rampe', window: typeof plan.ramp.window === 'string' ? plan.ramp.window : null, x0: plan.ramp.x0, y0: plan.ramp.y0, x1: plan.ramp.x1, y1: plan.ramp.y1 } : null,
    start: isPoint(plan.start) ? [plan.start[0], plan.start[1]] : null,
    furniture: list(plan.furniture, (f) => isObject(f) && box(f)).map((f, i) => ({ id: typeof f.id === 'string' ? f.id : `M${i + 1}`, x0: f.x0, y0: f.y0, x1: f.x1, y1: f.y1, kind: typeof f.kind === 'string' ? f.kind : 'caisse' })),
  };
}

// Zone libre derrière une fenêtre : toute sa largeur, windowDepth de profondeur à partir de la face intérieure du mur.
export function windowZone(win, size, depth, thickness) {
  const s = SIDES[win?.side];
  if (!s || !isNum(win?.x) || !isNum(win?.y)) return null;
  const half = size / 2;
  const face = thickness / 2;
  if (win.side === 'nord') return { x: win.x - half, y: win.y + face, w: size, h: depth };
  if (win.side === 'sud') return { x: win.x - half, y: win.y - face - depth, w: size, h: depth };
  if (win.side === 'ouest') return { x: win.x + face, y: win.y - half, w: depth, h: size };
  return { x: win.x - face - depth, y: win.y - half, w: depth, h: size };
}

// Ouverture de la fenêtre dans le mur : toute l'épaisseur, toute la largeur.
export function windowGap(win, size, thickness) {
  const s = SIDES[win?.side];
  if (!s || !isNum(win?.x) || !isNum(win?.y)) return null;
  return s.horizontal ? { x: win.x - size / 2, y: win.y - thickness / 2, w: size, h: thickness } : { x: win.x - thickness / 2, y: win.y - size / 2, w: thickness, h: size };
}

// Entrée intérieure d'une fenêtre (60 vers l'intérieur depuis son centre, comme data/game/windows.json innerDistance).
const inner = (win, d) => {
  const n = SIDES[win.side].normal;
  return { x: win.x - n.x * d, y: win.y - n.y * d };
};

const GRID = 20;

// Analyse d'une carte à segments (world.json de la carte) : aires, connexité, largeurs libres, ouverture entre l'aile et la grande salle.
// Grille de 20 (cellule = 20 × 20) sur la boîte du bâtiment : une cellule est bloquée si son centre est dans un mur ou un obstacle, hors du bâtiment
// elle ne compte pas ; une cellule est « large » si son centre est à au moins minCorridor / 2 de tout mur et de tout obstacle (un chemin de cellules
// larges voisines (4 voisins) a donc partout une largeur libre d'au moins minCorridor, les disques de rayon minCorridor / 2 de deux centres voisins se
// recouvrent). Les derniers `entryRelax` unités devant une fenêtre sont exemptés (le mur lui-même y borne le passage).
// Renvoie { interiorArea, freeArea, components, freeCells, unreachable: [id de fenêtre], entryClearance: { id: largeur }, startReachable, neck: { id, free, clearance } | null }.
export function analyzeMap(world, opts = {}) {
  const t = pos(world?.wallThickness, 40);
  const need = pos(opts.minCorridor ?? world?.minCorridor, 90) / 2;
  const relax = isNum(opts.entryRelax) && opts.entryRelax >= 0 ? opts.entryRelax : 80;
  const contour = Array.isArray(world?.contour) ? world.contour : [];
  const floor = polygonRects(contour);
  const walls = segmentRects(world?.walls, t);
  const obstacles = validRects(world?.obstacles).filter((o) => o.outside !== true && coveredBy({ x: o.x + o.w / 2 - 0.5, y: o.y + o.h / 2 - 0.5, w: 1, h: 1 }, floor));
  const interior = unionRects(floor, walls);
  const interiorArea = totalArea(interior);
  const freeArea = totalArea(unionRects(interior, obstacles));
  const empty = { interiorArea, freeArea, components: 0, freeCells: 0, unreachable: [], entryClearance: {}, startReachable: false, neck: null };
  const bb = boundingRect(floor);
  if (!bb) return empty;
  const cols = Math.ceil(bb.w / GRID);
  const rows = Math.ceil(bb.h / GRID);
  const solids = [...walls, ...obstacles];
  const cellOf = (p) => ({ c: Math.min(cols - 1, Math.max(0, Math.floor((p.x - bb.x) / GRID))), r: Math.min(rows - 1, Math.max(0, Math.floor((p.y - bb.y) / GRID))) });
  const center = (c, r) => ({ x: bb.x + (c + 0.5) * GRID, y: bb.y + (r + 0.5) * GRID });
  const clear = new Float64Array(cols * rows).fill(-1); // -1 : bloquée ou hors du bâtiment ; sinon distance au plus proche mur ou obstacle
  const dist = (p) => {
    let best = Infinity;
    for (const s of solids) best = Math.min(best, distanceToRect(p.x, p.y, s));
    return best;
  };
  let freeCells = 0;
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      const p = center(c, r);
      if (!pointInPolygon(p.x, p.y, contour)) continue;
      const d = dist(p);
      if (d <= 0) continue;
      clear[r * cols + c] = d;
      freeCells += 1;
    }
  }
  const flood = (seeds, passable) => {
    const seen = new Uint8Array(cols * rows);
    const queue = [];
    for (const s of seeds) {
      if (passable(s.c, s.r) && !seen[s.r * cols + s.c]) {
        seen[s.r * cols + s.c] = 1;
        queue.push(s);
      }
    }
    for (let i = 0; i < queue.length; i += 1) {
      const { c, r } = queue[i];
      for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nc = c + dc;
        const nr = r + dr;
        if (nc < 0 || nr < 0 || nc >= cols || nr >= rows || seen[nr * cols + nc] || !passable(nc, nr)) continue;
        seen[nr * cols + nc] = 1;
        queue.push({ c: nc, r: nr });
      }
    }
    return { seen, count: queue.length };
  };
  // Espace libre : un seul morceau ?
  let components = 0;
  const visited = new Uint8Array(cols * rows);
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      if (clear[r * cols + c] < 0 || visited[r * cols + c]) continue;
      components += 1;
      const f = flood([{ c, r }], (cc, rr) => clear[rr * cols + cc] >= 0);
      for (let i = 0; i < visited.length; i += 1) if (f.seen[i]) visited[i] = 1;
    }
  }
  const wins = Array.isArray(world?.windows) ? world.windows.filter((w) => w && SIDES[w.side] && isNum(w.x) && isNum(w.y)) : [];
  const entries = wins.map((w) => ({ id: w.id, p: inner(w, 60) }));
  const near = (c, r) => entries.some((e) => Math.hypot(center(c, r).x - e.p.x, center(c, r).y - e.p.y) <= relax);
  const wide = (c, r) => clear[r * cols + c] >= need || (clear[r * cols + c] >= 0 && near(c, r));
  const start = isObject(world?.start) && isNum(world.start.x) && isNum(world.start.y) ? world.start : null;
  const from = start ? cellOf(start) : null;
  const reach = from ? flood([from], wide) : { seen: new Uint8Array(cols * rows), count: 0 };
  const unreachable = entries.filter((e) => {
    const k = cellOf(e.p);
    return !reach.seen[k.r * cols + k.c];
  }).map((e) => e.id);
  const entryClearance = Object.fromEntries(entries.map((e) => [e.id, r6(clear[cellOf(e.p).r * cols + cellOf(e.p).c] * 2)]));
  // Goulot : l'ouverture « ouverture-aile » (ou la première ouverture donnée) : longueur libre le long de son axe.
  let neck = null;
  const op = Array.isArray(world?.openings) ? world.openings.find((o) => o && [o.x1, o.y1, o.x2, o.y2].every(isNum) && (o.x1 === o.x2 || o.y1 === o.y2) && o.id === 'ouverture-aile') : null;
  if (op) {
    const vertical = op.x1 === op.x2;
    const a = vertical ? Math.min(op.y1, op.y2) : Math.min(op.x1, op.x2);
    const b = vertical ? Math.max(op.y1, op.y2) : Math.max(op.x1, op.x2);
    let free = 0;
    let best = 0;
    for (let v = a + 2.5; v < b; v += 5) {
      const p = vertical ? { x: op.x1, y: v } : { x: v, y: op.y1 };
      const d = dist(p);
      if (d > 0) free += 5;
      best = Math.max(best, d);
    }
    neck = { id: op.id, free: r6(free), clearance: r6(best * 2) };
  }
  return { interiorArea, freeArea, components, freeCells, unreachable, entryClearance, startReachable: from ? reach.count > 0 : false, neck };
}

// Fusionne les rectangles dont l'interstice est inférieur à minGap (ou qui se recouvrent) : le rectangle englobant remplace les deux, jusqu'à
// stabilité. items : [{ id, rect, parts?, structure?, kind?, hauteur? }] ; canMerge(a, b) facultatif. Renvoie { items, merges: [{ id, parts }] }.
export function mergeInterstices(items, minGap, canMerge = () => true) {
  let list = (Array.isArray(items) ? items : []).filter((it) => isObject(it) && isRect(it.rect)).map((it) => ({ ...it, rect: { ...it.rect }, parts: Array.isArray(it.parts) ? [...it.parts] : [it.id] }));
  const gap = isNum(minGap) && minGap > 0 ? minGap : DEFAULT_PARAMS.minCorridor;
  for (let guard = 0; guard < 1000; guard += 1) {
    let pair = null;
    for (let i = 0; i < list.length && !pair; i += 1) {
      for (let j = i + 1; j < list.length && !pair; j += 1) {
        const g = rectGap(list[i].rect, list[j].rect);
        const touching = overlapArea(list[i].rect, list[j].rect) > 0 || (g > 0 && g < gap);
        if (touching && canMerge(list[i], list[j])) pair = [i, j];
      }
    }
    if (!pair) break;
    const [a, b] = [list[pair[0]], list[pair[1]]];
    const big = rectArea(a.rect) >= rectArea(b.rect) ? a : b;
    const parts = sortedParts([...a.parts, ...b.parts]);
    const merged = { ...big, id: parts.join('+'), rect: boundingRect([a.rect, b.rect]), parts, hauteur: Math.max(num(a.hauteur), num(b.hauteur)) };
    list = list.filter((_, k) => k !== pair[0] && k !== pair[1]);
    list.splice(pair[0], 0, merged);
  }
  return { items: list, merges: list.filter((it) => it.parts.length > 1).map((it) => ({ id: it.id, parts: [...it.parts] })) };
}
const rectArea = (r) => r.w * r.h;
const sortedParts = (list) => [...new Set(list)].sort((a, b) => a.localeCompare(b, 'fr', { numeric: true }));

const shape = (it) => ({ id: it.id, x: it.rect.x, y: it.rect.y, w: it.rect.w, h: it.rect.h, hauteur: it.hauteur, kind: it.kind, ...(it.parts.length > 1 ? { parts: [...it.parts] } : {}), ...(it.outside ? { outside: true } : {}) });

// Convertit un plan en monde. Renvoie { world, decor, report } ; world et decor sont null si le plan est invalide (report.valid faux).
// report : { valid, errors, shifts, merged, retired, snapped, violations, areas, size }.
export function planToWorld(plan, params) {
  const p = cleanParams(params);
  const pl = cleanPlan(plan);
  const report = { valid: false, errors: [], shifts: [], merged: [], retired: [], snapped: [], violations: [], areas: { interior: 0, free: 0 }, size: { width: 0, height: 0 } };
  if (!pl) {
    report.errors.push('plan invalide : boîte englobante et contour (4 sommets au moins) obligatoires');
    return { world: null, decor: null, report };
  }
  const s = p.scale;
  const t = p.wallThickness;
  const X = (px) => r6((px - pl.bbox.x0) * s + p.margin);
  const Y = (py) => r6((py - pl.bbox.y0) * s + p.margin);
  const up = (n) => Math.ceil(n / p.round - 1e-9) * p.round;
  const size = { width: up((pl.bbox.x1 - pl.bbox.x0) * s + 2 * p.margin), height: up((pl.bbox.y1 - pl.bbox.y0) * s + 2 * p.margin) };
  report.size = size;
  const rectPx = (x0, y0, x1, y1) => ({ x: X(Math.min(x0, x1)), y: Y(Math.min(y0, y1)), w: r6(Math.abs(x1 - x0) * s), h: r6(Math.abs(y1 - y0) * s) });

  // Contour, murs (segments), sol.
  const contour = pl.contour.map(([x, y]) => [X(x), Y(y)]);
  const edges = contour.map((a, i) => {
    const b = contour[(i + 1) % contour.length];
    return { id: `mur-${i + 1}`, x1: a[0], y1: a[1], x2: b[0], y2: b[1] };
  });
  const inner2 = pl.walls.map((w) => ({ id: w.id, x1: X(w.x1), y1: Y(w.y1), x2: X(w.x2), y2: Y(w.y2) }));
  const walls = [...edges, ...inner2];
  const openings = pl.openings.map((o) => ({ id: o.id, x1: X(o.x1), y1: Y(o.y1), x2: X(o.x2), y2: Y(o.y2) }));
  const floor = polygonRects(contour);
  const wallRects = segmentRects(walls, t);
  const bbox = boundingRect(floor) ?? { x: 0, y: 0, w: 0, h: 0 };
  const start = pl.start ? { x: X(pl.start[0]), y: Y(pl.start[1]) } : { x: bbox.x + bbox.w / 2, y: bbox.y + bbox.h / 2 };
  const isInside = (r) => pointInPolygon(r.x + r.w / 2, r.y + r.h / 2, contour);

  // Structure : piliers et escaliers pleins, interstices comblés par fusion (jamais avec du mobilier : voir plus bas).
  const half = (pl.pillarSize * s) / 2;
  const pillars = pl.pillars.map(([x, y], i) => ({ id: `pilier-${i + 1}`, x: r6(X(x) - half), y: r6(Y(y) - half), w: r6(half * 2), h: r6(half * 2), hauteur: p.pillarHeight, kind: 'pilier' }));
  const stairs = pl.stairs.map((st) => {
    const r = rectPx(st.x0, st.y0, st.x1, st.y1);
    return { id: st.id, ...r, hauteur: p.stairsHeight, kind: 'escalier', ...(isInside(r) ? {} : { outside: true }) };
  });
  const structure = [...pillars, ...stairs].map((o) => ({ id: o.id, rect: { x: o.x, y: o.y, w: o.w, h: o.h }, hauteur: o.hauteur, kind: o.kind, structure: true, outside: o.outside === true, parts: [o.id] }));
  const fixedMerge = mergeInterstices(structure, p.minCorridor);
  let fixed = fixedMerge.items;
  report.merged.push(...fixedMerge.merges);

  // Un obstacle à moins de minCorridor d'un mur (sans le toucher) est prolongé jusqu'au mur si l'écart ne dépasse pas wallSnap et se mesure sur un seul axe.
  const snapToWalls = (it) => {
    let rect = { ...it.rect };
    for (let guard = 0; guard < 6; guard += 1) {
      let worst = null;
      for (const w of wallRects) {
        const g = rectGap(rect, w);
        if (g > 0 && g < p.minCorridor && (worst === null || g < worst.g)) worst = { g, w };
      }
      if (!worst) return { rect, ok: true };
      const dx = Math.max(worst.w.x - (rect.x + rect.w), 0, rect.x - (worst.w.x + worst.w.w));
      const dy = Math.max(worst.w.y - (rect.y + rect.h), 0, rect.y - (worst.w.y + worst.w.h));
      if ((dx > 0 && dy > 0) || worst.g > p.wallSnap) return { rect, ok: false, gap: r6(worst.g) };
      if (dx > 0) rect = worst.w.x >= rect.x + rect.w ? { ...rect, w: rect.w + dx } : { ...rect, x: rect.x - dx, w: rect.w + dx };
      else rect = worst.w.y >= rect.y + rect.h ? { ...rect, h: rect.h + dy } : { ...rect, y: rect.y - dy, h: rect.h + dy };
    }
    return { rect, ok: false, gap: 0 };
  };
  fixed = fixed.map((it) => {
    if (it.outside) return it;
    const snapped = snapToWalls(it);
    if (!snapped.ok) report.violations.push(`${it.id} : à ${snapped.gap} d'un mur`);
    else if (snapped.rect.x !== it.rect.x || snapped.rect.y !== it.rect.y || snapped.rect.w !== it.rect.w || snapped.rect.h !== it.rect.h) report.snapped.push({ id: it.id });
    return { ...it, rect: snapped.rect };
  });

  // Fenêtres : positions du plan, décalées au plus de shiftMax (depuis la position relevée sur le plan) si leur zone libre touche la structure.
  const gapRectOf = (w) => windowGap(w, p.windowSize, t);
  const placed = [];
  const edgeOf = (w) => edges.find((e) => (SIDES[w.side].horizontal ? e.y1 === e.y2 && Math.abs(e.y1 - w.y) < 1e-6 : e.x1 === e.x2 && Math.abs(e.x1 - w.x) < 1e-6)
    && (SIDES[w.side].horizontal ? w.x >= Math.min(e.x1, e.x2) - 1e-6 && w.x <= Math.max(e.x1, e.x2) + 1e-6 : w.y >= Math.min(e.y1, e.y2) - 1e-6 && w.y <= Math.max(e.y1, e.y2) + 1e-6));
  const fixedRects = () => fixed.filter((f) => !f.outside).map((f) => f.rect);
  const windowOk = (w, edge, wallsOther) => {
    const g = gapRectOf(w);
    const zone = windowZone(w, p.windowSize, p.windowDepth, t);
    if (!edge || !g || !zone) return false;
    const [lo, hi] = SIDES[w.side].horizontal ? [Math.min(edge.x1, edge.x2), Math.max(edge.x1, edge.x2)] : [Math.min(edge.y1, edge.y2), Math.max(edge.y1, edge.y2)];
    const [a, b] = SIDES[w.side].horizontal ? [g.x, g.x + g.w] : [g.y, g.y + g.h];
    if (a < lo + 10 || b > hi - 10) return false;
    if (wallsOther.some((r) => overlapArea(g, r) > 0)) return false;
    if (fixedRects().some((r) => overlapArea(zone, r) > 0)) return false;
    return placed.every((o) => Math.hypot(o.x - w.x, o.y - w.y) >= p.windowSpacing);
  };
  const windows = [];
  for (const pw of pl.windows) {
    const base = { id: pw.id, side: pw.side, x: X(pw.x), y: Y(pw.y) };
    const edge = edgeOf(base);
    const ref = { x: X(pw.planX ?? pw.x), y: Y(pw.planY ?? pw.y) };
    const wallsOther = edge ? segmentRects(walls.filter((w) => w.id !== edge.id), t) : [];
    let chosen = base;
    if (!windowOk(base, edge, wallsOther)) {
      const horizontal = SIDES[pw.side].horizontal;
      let found = null;
      for (let k = 1; k * p.shiftStep <= p.shiftMax + 1e-9 && !found; k += 1) {
        for (const sign of [1, -1]) {
          const c = horizontal ? { ...base, x: r6(base.x + sign * k * p.shiftStep) } : { ...base, y: r6(base.y + sign * k * p.shiftStep) };
          const off = horizontal ? Math.abs(c.x - ref.x) : Math.abs(c.y - ref.y);
          if (off <= p.shiftMax + 1e-9 && windowOk(c, edge, wallsOther)) {
            found = c;
            break;
          }
        }
      }
      if (found) chosen = found;
      else report.violations.push(`${pw.id} : aucune position valable à ${p.shiftMax} unités du plan`);
    }
    placed.push(chosen);
    const units = Math.round(Math.hypot(chosen.x - ref.x, chosen.y - ref.y) * 100) / 100;
    if (units > 0) report.shifts.push({ id: pw.id, units, auto: chosen.x !== base.x || chosen.y !== base.y });
    windows.push(chosen);
  }
  const zones = windows.map((w) => ({ id: w.id, rect: windowZone(w, p.windowSize, p.windowDepth, t) }));

  // Mobilier bas : une pièce qui viole une règle de jeu est retirée (liste dans report.retired) ; deux pièces à moins de minCorridor sont fusionnées.
  const pieceRules = (cand, others) => {
    const reasons = [];
    const r = cand.rect;
    if (!coveredBy(r, floor)) reasons.push('hors du bâtiment');
    const walled = snapToWalls(cand);
    if (!walled.ok) reasons.push(`à ${walled.gap} d'un mur`);
    else {
      if (walled.rect.x !== cand.rect.x || walled.rect.y !== cand.rect.y || walled.rect.w !== cand.rect.w || walled.rect.h !== cand.rect.h) cand.snapped = true;
      cand.rect = walled.rect;
    }
    if (distanceToRect(start.x, start.y, cand.rect) < p.startZone) reasons.push('dans la zone de départ');
    for (const z of zones) if (overlapArea(cand.rect, z.rect) > 0) reasons.push(`devant la fenêtre ${z.id}`);
    if (cand.hauteur > p.maxHeight) reasons.push('trop haute');
    const merge = [];
    for (const o of others) {
      if (o.outside) continue; // de l'autre côté d'un mur : sans rapport avec le mobilier intérieur
      const g = rectGap(cand.rect, o.rect);
      if (overlapArea(cand.rect, o.rect) > 0 || (g > 0 && g < p.minCorridor)) {
        if (o.structure) reasons.push(`à ${Math.round(g)} de ${o.id}`);
        else merge.push(o);
      }
    }
    return { reasons, merge };
  };
  let accepted = [...fixed];
  const build = () => ({ contour, walls, openings, windows, obstacles: accepted.map(shape), start, wallThickness: t, minCorridor: p.minCorridor });
  for (const f of pl.furniture) {
    const r = rectPx(f.x0, f.y0, f.x1, f.y1);
    let cand = { id: f.id, rect: r, hauteur: Object.hasOwn(p.kindHeights, f.kind) ? p.kindHeights[f.kind] : 45, kind: f.kind, structure: false, parts: [f.id] };
    let rest = accepted;
    let failure = null;
    for (let guard = 0; guard < 20; guard += 1) {
      const check = pieceRules(cand, rest);
      if (check.reasons.length > 0) {
        failure = check.reasons[0];
        break;
      }
      if (check.merge.length === 0) break;
      const group = [cand, ...check.merge];
      const parts = sortedParts(group.flatMap((g) => g.parts));
      cand = { ...cand, id: parts.join('+'), rect: boundingRect(group.map((g) => g.rect)), parts, hauteur: Math.max(...group.map((g) => g.hauteur)) };
      rest = rest.filter((o) => !check.merge.includes(o));
    }
    if (failure === null) {
      const trial = [...rest, cand];
      const before = accepted;
      accepted = trial;
      const a = analyzeMap(build());
      if (a.components > 1 || a.unreachable.length > 0 || !a.startReachable) {
        accepted = before;
        failure = 'coupe un passage';
      } else {
        if (cand.parts.length > 1) {
          report.merged = report.merged.filter((m) => !m.parts.every((q) => cand.parts.includes(q)));
          report.merged.push({ id: cand.id, parts: [...cand.parts] });
        }
        if (cand.snapped) report.snapped.push({ id: cand.id });
      }
    }
    if (failure !== null) report.retired.push({ id: f.id, reason: failure });
  }

  // Résultat.
  const obstacles = accepted.map(shape);
  const barriers = windows.map((w) => ({ id: `barriere-${w.id}`, fenetre: w.id, ...gapRectOf(w) }));
  const ramp = pl.ramp ? { id: pl.ramp.id, window: pl.ramp.window, ...rectPx(pl.ramp.x0, pl.ramp.y0, pl.ramp.x1, pl.ramp.y1) } : null;
  const analysis = analyzeMap({ contour, walls, openings, windows, obstacles, start, wallThickness: t, minCorridor: p.minCorridor });
  report.areas = { interior: Math.round(analysis.interiorArea), free: Math.round(analysis.freeArea) };
  if (analysis.components !== 1) report.violations.push(`espace libre en ${analysis.components} morceaux`);
  if (analysis.unreachable.length > 0) report.violations.push(`fenêtres sans chemin large : ${analysis.unreachable.join(', ')}`);
  report.valid = report.violations.length === 0;

  const world = {
    _provisoire: 'Carte générée par npm run carte (scripts/plan-vers-monde.mjs) d\'après plan.json : ne jamais éditer à la main, changer plan.json puis relancer la commande. Valeurs provisoires. Coordonnées du monde : (0, 0) = coin nord-ouest, x vers l\'est, y vers le sud.',
    id: pl.id,
    title: pl.title,
    size,
    margin: p.margin,
    room: { x: bbox.x, y: bbox.y, width: bbox.w, height: bbox.h, wall: 0 },
    contour: contour.map((c) => [...c]),
    walls: walls.map((w) => ({ ...w })),
    openings: openings.map((o) => ({ ...o })),
    windowSize: p.windowSize,
    wallThickness: t,
    wallHeight: p.wallHeight,
    windows: windows.map((w) => ({ ...w })),
    playerBarriers: barriers,
    startZone: p.startZone,
    windowDepth: p.windowDepth,
    minCorridor: p.minCorridor,
    maxHeight: p.maxHeight,
    start,
    zoom: p.zoom,
    pillars: pillars.map((o) => ({ ...o })),
    stairs: stairs.map((o) => ({ ...o })),
    ramp,
    obstacles,
    generation: { shifts: report.shifts, merged: report.merged, retired: report.retired, snapped: report.snapped },
  };

  // Décor : sol (sentiers, trottoir et route au sud, rampe de la fenêtre qui la porte), 2 points d'apparition par fenêtre, objets du décor (graine).
  const ground = [];
  const southFace = Math.max(...contour.map((c) => c[1])) + t / 2;
  const tar = p.decor.tarmac;
  ground.push({ id: 'trottoir-sud', kind: 'trottoir', x: 0, y: southFace + tar.offset, w: size.width, h: tar.sidewalk });
  ground.push({ id: 'route-sud', kind: 'route', x: 0, y: southFace + tar.offset + tar.sidewalk, w: size.width, h: tar.road });
  const spawnPoints = [];
  windows.forEach((w) => {
    const n = SIDES[w.side].normal;
    const horizontal = SIDES[w.side].horizontal;
    if (w.id !== pl.ramp?.window && w.side !== 'sud') {
      const len = p.decor.paths.length;
      const wd = p.decor.paths.width;
      const face = t / 2;
      if (horizontal) ground.push({ id: `sentier-${w.id}`, kind: 'sentier', x: r6(w.x - wd / 2), y: r6(w.y + n.y * (face + len)), w: wd, h: len });
      else ground.push({ id: `sentier-${w.id}`, kind: 'sentier', x: r6(w.x + (n.x > 0 ? face : -(face + len))), y: r6(w.y - wd / 2), w: len, h: wd });
    }
    p.spawnDistances.slice(0, 2).forEach((d, i) => {
      spawnPoints.push({ id: `${w.id}-${'ab'[i]}`, fenetre: w.id, window: w.id, x: r6(w.x + n.x * d), y: r6(w.y + n.y * d) });
    });
  });
  if (ramp) ground.push({ id: ramp.id, kind: 'trottoir', x: ramp.x, y: ramp.y, w: ramp.w, h: ramp.h });
  const decor = {
    _provisoire: 'Décor extérieur généré par npm run carte (même schéma que data/game/decor.json) : sol, points d\'apparition (2 par fenêtre, à 450 et 650 du mur) et nombres d\'objets provisoires ; graine fixe. Ne jamais éditer à la main : changer plan.json ou params.json puis relancer la commande.',
    seed: p.decor.seed,
    approachWidth: p.approachWidth,
    ground,
    spawnPoints,
    scatter: { ...p.decor.scatter, distanceSalle: p.decor.distanceSalle, distanceApparition: p.decor.distanceApparition },
  };
  report.areas.polygon = Math.round(polygonArea(contour));
  return { world, decor, report };
}
