// Assemble les données du monde (world.json, decor.json) en ensembles de collision : ce qui bloque le joueur, ce qui bloque les
// zombies, les murs percés de leurs fenêtres, les barrières invisibles. Pur : n'utilise que les données reçues.
import { validRects } from './collision.js';
import { generateDecor } from './decor.js';
import { innerBounds } from './movement.js';
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

// world : world.json ; decorCfg : decor.json ; opts.empty : salle du lot 1m seule (world.legacy), sans meuble ni décor, sans murs
// pleins (les zombies y apparaissent aux fenêtres comme au lot 1m), mêmes coordonnées qu'au lot 1m ; opts.slack : dépassement de vue permis.
export function buildLayout(world, decorCfg, opts = {}) {
  if (opts.empty) {
    const l = world?.legacy ?? {};
    const slack = Math.max(0, num(opts.slack, 60)); // la vue peut dépasser la salle de slack unités (réglage du lot 1m)
    const room = { x: 0, y: 0, width: num(l.width), height: num(l.height), wall: num(l.wall) };
    const windows = (Array.isArray(l.windows) ? l.windows : []).map((win) => ({ ...win }));
    return {
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
      decor: null,
      playerObstacles: [],
      zombieObstacles: [],
      spawnPoints: null,
      worldBounds: null,
      cameraBounds: { minX: -slack, minY: -slack, maxX: room.width + slack, maxY: room.height + slack },
      start: { x: room.width / 2, y: room.height / 2 },
    };
  }
  const room = { ...world?.room };
  const windows = (Array.isArray(world?.windows) ? world.windows : []).map((win) => ({ ...win, size: num(world?.windowSize) }));
  const furniture = validRects(world?.obstacles).map((o) => ({ ...o }));
  const barriers = validRects(world?.playerBarriers).map((b) => ({ ...b }));
  const decor = generateDecor(decorCfg, world);
  const walls = wallRects(room, windows, num(world?.windowSize), num(world?.wallThickness, 40));
  const size = { width: num(world?.size?.width), height: num(world?.size?.height) };
  return {
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
