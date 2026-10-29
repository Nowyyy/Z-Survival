// Assemble les données du monde (world.json, decor.json) en ensembles de collision : ce qui bloque le joueur, ce qui bloque les
// zombies, les murs percés de leurs fenêtres, les barrières invisibles. Pur : n'utilise que les données reçues.
import { validRects } from './collision.js';
import { generateDecor } from './decor.js';
import { windowGap } from './maps.js';
import { innerBounds } from './movement.js';
import { faceDistance } from './plank-layout.js';
import { doorRect } from './zones.js';
import { furnitureHitbox } from './furniture-model.js';
import { polygonRects, segmentRects, unionRects } from './shape.js';
import { isNum, num } from './vec.js';

// Murs de la salle sous forme de rectangles, percés d'une ouverture de `size` de large à chaque fenêtre. La face intérieure est à
// room.wall du bord de la salle, l'épaisseur déborde vers l'extérieur. Renvoie [{ id, x, y, w, h }].
export function wallRects(room, windows, size, thickness) {
  const x = num(room?.x);
  const y = num(room?.y);
  const w = num(room?.width);
  const h = num(room?.height);
  const inner = num(room?.wall);
  const outer = inner - num(thickness, 40);
  const half = Math.max(0, num(size)) / 2;
  const list = Array.isArray(windows) ? windows.filter((win) => win && isNum(win.x) && isNum(win.y)) : [];
  const bands = [
    { side: 'nord', axis: 'x', from: x + outer, to: x + w - outer, at: y + outer, depth: inner - outer },
    { side: 'sud', axis: 'x', from: x + outer, to: x + w - outer, at: y + h - inner, depth: inner - outer },
    { side: 'ouest', axis: 'y', from: y + inner, to: y + h - inner, at: x + outer, depth: inner - outer },
    { side: 'est', axis: 'y', from: y + inner, to: y + h - inner, at: x + w - inner, depth: inner - outer },
  ];
  const out = [];
  for (const band of bands) {
    const gaps = list.filter((win) => win.side === band.side).map((win) => (band.axis === 'x' ? win.x : win.y)).sort((a, b) => a - b);
    let cursor = band.from;
    const piece = (a, b, n) => {
      if (b - a <= 0) return;
      out.push(band.axis === 'x' ? { id: `mur-${band.side}-${n}`, x: a, y: band.at, w: b - a, h: band.depth } : { id: `mur-${band.side}-${n}`, x: band.at, y: a, w: band.depth, h: b - a });
    };
    gaps.forEach((g, n) => {
      piece(cursor, g - half, n + 1);
      cursor = g + half;
    });
    piece(cursor, band.to, gaps.length + 1);
  }
  return out;
}

// Ouvertures des fenêtres dans les murs (les rectangles qui ont été retirés par wallRects), pour les planches : [{ id, x, y, w, h }].
// Une ouverture couvre toute l'épaisseur du mur et la largeur `size` de la fenêtre.
export function windowGaps(room, windows, size, thickness) {
  const x = num(room?.x);
  const y = num(room?.y);
  const w = num(room?.width);
  const h = num(room?.height);
  const inner = num(room?.wall);
  const outer = inner - num(thickness, 40);
  const half = Math.max(0, num(size)) / 2;
  const depth = inner - outer;
  const out = [];
  for (const win of Array.isArray(windows) ? windows : []) {
    if (!win || !isNum(win.x) || !isNum(win.y)) continue;
    const item = { id: win.id };
    if (win.side === 'nord') Object.assign(item, { x: win.x - half, y: y + outer, w: half * 2, h: depth });
    else if (win.side === 'sud') Object.assign(item, { x: win.x - half, y: y + h - inner, w: half * 2, h: depth });
    else if (win.side === 'ouest') Object.assign(item, { x: x + outer, y: win.y - half, w: depth, h: half * 2 });
    else if (win.side === 'est') Object.assign(item, { x: x + w - inner, y: win.y - half, w: depth, h: half * 2 });
    else continue;
    if (item.w > 0 && item.h > 0) out.push(item);
  }
  return out;
}

// Fenêtres de la salle avec leur ouverture (win.gap), prêtes pour windowGeometry (windows.js).
export const windowsWithGaps = (layout) => (layout?.windows ?? []).map((win) => ({ ...win, gap: (layout?.gaps ?? []).find((g) => g.id === win.id) }));

const insideRects = (rects) => (x, y) => rects.some((r) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h);

// Champs communs de lot 3b : sol, intérieur libre de murs, test « dans le bâtiment », zone de déplacement, bouche de l'arme, distance à la face
// intérieure du mur, zone de vue. Salle rectangulaire (world.json d'origine, ?empty=1) : tout se déduit de room et de ses bornes.
function roomExtras(room, bounds) {
  const r = { x: bounds.minX, y: bounds.minY, w: bounds.maxX - bounds.minX, h: bounds.maxY - bounds.minY };
  return {
    id: 'salle',
    segmented: false,
    floor: [{ x: num(room.x), y: num(room.y), w: num(room.width), h: num(room.height) }],
    interior: [r],
    inside: (x, y) => x >= bounds.minX && x <= bounds.maxX && y >= bounds.minY && y <= bounds.maxY,
    moveRoom: room,
    muzzleBounds: bounds,
    faceInner: (g) => faceDistance(room, g),
    viewPlay: { width: Math.max(1, num(room.width) - 2 * num(room.wall)), height: Math.max(1, num(room.height) - 2 * num(room.wall)) },
    zoom: null,
    pillars: [],
    stairs: [],
    ramp: null,
    wallHeight: null,
  };
}

// Carte à segments de mur (lot 3b) : contour, murs { x1, y1, x2, y2 } d'épaisseur wallThickness, fenêtres posées sur un mur (centre, côté), obstacles
// (piliers, escaliers, mobilier, dont certains hors du bâtiment), barrières du joueur. Mêmes sorties que la salle.
function segmentedLayout(world, decorCfg, opts = {}) {
  const t = num(world.wallThickness, 40);
  const size = { width: num(world.size?.width), height: num(world.size?.height) };
  const windowSize = num(world.windowSize, 140);
  const windows = (Array.isArray(world.windows) ? world.windows : []).map((win) => ({ ...win, size: windowSize }));
  const floor = polygonRects(world.contour);
  const raw = segmentRects(world.walls, t);
  const gaps = windows.map((win) => ({ id: win.id, ...windowGap(win, windowSize, t) })).filter((g) => isNum(g.w));
  const walls = unionRects(raw, gaps).map((r, i) => ({ id: `mur-${i + 1}`, ...r }));
  const interior = unionRects(floor, raw);
  // Lot 3c : une chaise ne bloque que son assise (furnitureHitbox) ; le rectangle du plan reste dans `plan` pour le dessin.
  const furniture = validRects(world.obstacles).map((o) => furnitureHitbox(o));
  const barriers = validRects(world.playerBarriers).map((b) => ({ ...b }));
  const decor = generateDecor(decorCfg, world);
  const room = { ...world.room };
  const start = { x: num(world.start?.x), y: num(world.start?.y) };
  // Lot 3c : portes pleines de la carte (zones.json en unités du jeu, opts.zones) ; les portes planned n'existent pas encore.
  const zones = opts?.zones && Array.isArray(opts.zones.zones) ? opts.zones : null;
  const doors = (zones && Array.isArray(zones.doors) ? zones.doors : [])
    .filter((d) => d && d.planned !== true && typeof d.id === 'string')
    .map((d) => ({ id: d.id, opens: Array.isArray(d.opens) ? [...d.opens] : [], openAfterWave: d.openAfterWave, opening: d.opening ? { ...d.opening } : null, rect: doorRect(d, { wallThickness: t, wallHeight: num(world.wallHeight, 60) }) }))
    .filter((d) => d.rect !== null);
  return {
    empty: false,
    id: typeof world.id === 'string' ? world.id : 'carte',
    zones,
    doors,
    segmented: true,
    size,
    margin: num(world.margin),
    room,
    bounds: innerBounds(room),
    windows,
    windowSize,
    wallThickness: t,
    furniture,
    barriers,
    walls,
    gaps,
    decor,
    floor,
    interior,
    inside: insideRects(interior),
    // Le joueur est borné par le monde ; ce sont les murs et les barrières des fenêtres qui l'enferment.
    moveRoom: { x: 0, y: 0, width: size.width, height: size.height, wall: 0 },
    muzzleBounds: { minX: 0, minY: 0, maxX: size.width, maxY: size.height },
    faceInner: () => t / 2,
    viewPlay: { width: num(room.width, 1), height: num(room.height, 1) },
    zoom: isNum(world.zoom) ? world.zoom : null,
    pillars: Array.isArray(world.pillars) ? world.pillars.map((o) => ({ ...o })) : [],
    stairs: Array.isArray(world.stairs) ? world.stairs.map((o) => ({ ...o })) : [],
    ramp: world.ramp ? { ...world.ramp } : null,
    wallHeight: num(world.wallHeight, 60),
    playerObstacles: [...furniture, ...barriers, ...walls],
    zombieObstacles: [...furniture, ...walls, ...decor.solids],
    spawnPoints: decor.spawnPoints,
    worldBounds: { minX: 0, minY: 0, maxX: size.width, maxY: size.height },
    cameraBounds: { minX: 0, minY: 0, maxX: size.width, maxY: size.height },
    start,
  };
}

// world : world.json : decor.json ; opts.empty : salle du lot 1m seule (world.legacy), sans meuble ni décor, sans murs
// pleins (les zombies y apparaissent aux fenêtres comme au lot 1m), mêmes coordonnées qu'au lot 1m ; opts.slack : dépassement de vue permis.
export function buildLayout(world, decorCfg, opts = {}) {
  if (opts.empty) {
    const l = world?.legacy ?? {};
    const slack = Math.max(0, num(opts.slack, 60)); // la vue peut dépasser la salle de slack unités (réglage du lot 1m)
    const room = { x: 0, y: 0, width: num(l.width), height: num(l.height), wall: num(l.wall) };
    const windows = (Array.isArray(l.windows) ? l.windows : []).map((win) => ({ ...win }));
    return {
      ...roomExtras(room, innerBounds(room)),
      zones: null,
      doors: [],
      empty: true,
      size: { width: room.width, height: room.height },
      margin: num(l.margin),
      room,
      bounds: innerBounds(room),
      windows,
      windowSize: num(l.windowSize),
      wallThickness: num(world?.wallThickness, 40),
      furniture: [],
      barriers: [],
      walls: [],
      gaps: [],
      decor: null,
      playerObstacles: [],
      zombieObstacles: [],
      spawnPoints: null,
      worldBounds: null,
      cameraBounds: { minX: -slack, minY: -slack, maxX: room.width + slack, maxY: room.height + slack },
      start: { x: room.width / 2, y: room.height / 2 },
    };
  }
  if (Array.isArray(world?.walls) && Array.isArray(world?.contour)) return segmentedLayout(world, decorCfg, opts);
  const room = { ...world?.room };
  const windows = (Array.isArray(world?.windows) ? world.windows : []).map((win) => ({ ...win, size: num(world?.windowSize) }));
  const furniture = validRects(world?.obstacles).map((o) => ({ ...o }));
  const barriers = validRects(world?.playerBarriers).map((b) => ({ ...b }));
  const decor = generateDecor(decorCfg, world);
  const walls = wallRects(room, windows, num(world?.windowSize), num(world?.wallThickness, 40));
  const size = { width: num(world?.size?.width), height: num(world?.size?.height) };
  return {
    ...roomExtras(room, innerBounds(room)),
    zones: null,
    doors: [],
    empty: false,
    size,
    margin: num(world?.margin),
    room,
    bounds: innerBounds(room),
    windows,
    windowSize: num(world?.windowSize),
    wallThickness: num(world?.wallThickness, 40),
    furniture,
    barriers,
    walls,
    gaps: windowGaps(room, windows, num(world?.windowSize), num(world?.wallThickness, 40)),
    decor,
    // Le joueur est enfermé par les barrières des fenêtres ; les zombies passent par les ouvertures des murs.
    playerObstacles: [...furniture, ...barriers],
    zombieObstacles: [...furniture, ...walls, ...decor.solids],
    spawnPoints: decor.spawnPoints,
    worldBounds: { minX: 0, minY: 0, maxX: size.width, maxY: size.height },
    cameraBounds: { minX: 0, minY: 0, maxX: size.width, maxY: size.height },
    start: { x: room.x + room.width / 2, y: room.y + room.height / 2 },
  };
}

// Identifiant de la fenêtre la plus proche d'une position (par où un zombie vient d'entrer) ; null s'il n'y en a pas.
export function entryWindow(p, windows) {
  let best = null;
  let bestD = Infinity;
  for (const w of Array.isArray(windows) ? windows : []) {
    if (!w || !isNum(w.x) || !isNum(w.y)) continue;
    const d = Math.hypot(num(p?.x) - w.x, num(p?.y) - w.y);
    if (d < bestD) {
      bestD = d;
      best = w.id ?? null;
    }
  }
  return best;
}

// Lot 3c : rectangles pleins des portes encore fermées (openIds : portes ouvertes), { id, kind: 'porte', x, y, w, h, hauteur }.
export const closedDoors = (layout, openIds = []) => (Array.isArray(layout?.doors) ? layout.doors : []).filter((d) => d.rect && !openIds.includes(d.id)).map((d) => ({ ...d.rect }));

// Ce qui bloque le joueur, les zombies, les balles et le laser, portes fermées comprises. Les portes arrêtent aussi les balles et le laser (sans dégâts).
export const playerSolids = (layout, openIds) => [...(layout?.playerObstacles ?? []), ...closedDoors(layout, openIds)];
export const zombieSolidsOf = (layout, openIds) => [...(layout?.zombieObstacles ?? []), ...closedDoors(layout, openIds)];
export const shotBlockers = (layout, openIds) => (layout?.empty ? [] : [...(layout?.furniture ?? []), ...(layout?.walls ?? []), ...(layout?.decor?.solids ?? []), ...closedDoors(layout, openIds)]);
