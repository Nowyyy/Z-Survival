// Chemin des zombies : grille de cellules, champ de flux depuis le joueur (coûts 10 et 14, 8 directions sans couper les coins),
// ligne de vue. Rien ici ne connaît le rendu : tout est calculé sur des rectangles { x, y, w, h } et des positions { x, y }.
import { clearSegment, validRects } from './collision.js';
import { clampDt, isNum, normalize, num } from './vec.js';

export const INF = 0x7fffffff;
const STRAIGHT = 10;
const DIAGONAL = 14;
const MOVES = [
  [1, 0, STRAIGHT], [-1, 0, STRAIGHT], [0, 1, STRAIGHT], [0, -1, STRAIGHT],
  [1, 1, DIAGONAL], [1, -1, DIAGONAL], [-1, 1, DIAGONAL], [-1, -1, DIAGONAL],
];
const MAX_CELLS = 400_000;

// Grille couvrant le monde { width, height } à partir de (0, 0). solids : rectangles pleins. Une cellule est bloquée si son centre
// est à moins de radius + inflate d'un solide (le zombie de rayon radius tient donc dans les cellules libres).
// opts : { cell = 20, radius = 20, inflate = 4 }. Renvoie { cell, cols, rows, width, height, radius, blocked, solids }.
export function createGrid(world, solids, opts) {
  const cell = isNum(opts?.cell) && opts.cell > 0 ? opts.cell : 20;
  const radius = isNum(opts?.radius) && opts.radius >= 0 ? opts.radius : 20;
  const margin = isNum(opts?.inflate) && opts.inflate >= 0 ? opts.inflate : 4;
  const width = isNum(world?.width) && world.width > 0 ? world.width : cell;
  const height = isNum(world?.height) && world.height > 0 ? world.height : cell;
  const cols = Math.max(1, Math.ceil(width / cell));
  const rows = Math.max(1, Math.min(Math.ceil(height / cell), Math.floor(MAX_CELLS / cols)));
  const blocked = new Uint8Array(cols * rows);
  const list = validRects(solids);
  const reach = radius + margin;
  for (const s of list) {
    const c0 = Math.max(0, Math.floor((s.x - reach) / cell));
    const c1 = Math.min(cols - 1, Math.floor((s.x + s.w + reach) / cell));
    const r0 = Math.max(0, Math.floor((s.y - reach) / cell));
    const r1 = Math.min(rows - 1, Math.floor((s.y + s.h + reach) / cell));
    for (let row = r0; row <= r1; row += 1) {
      for (let col = c0; col <= c1; col += 1) {
        const cx = (col + 0.5) * cell;
        const cy = (row + 0.5) * cell;
        if (cx > s.x - reach && cx < s.x + s.w + reach && cy > s.y - reach && cy < s.y + s.h + reach) blocked[row * cols + col] = 1;
      }
    }
  }
  return { cell, cols, rows, width, height, radius, blocked, solids: list };
}

export function cellIndex(grid, p) {
  const col = Math.min(grid.cols - 1, Math.max(0, Math.floor(num(p?.x) / grid.cell)));
  const row = Math.min(grid.rows - 1, Math.max(0, Math.floor(num(p?.y) / grid.cell)));
  return row * grid.cols + col;
}

export function cellCenter(grid, index) {
  return { x: ((index % grid.cols) + 0.5) * grid.cell, y: (Math.floor(index / grid.cols) + 0.5) * grid.cell };
}

const free = (grid, col, row) => col >= 0 && row >= 0 && col < grid.cols && row < grid.rows && grid.blocked[row * grid.cols + col] === 0;

// La cellule libre la plus proche de index (anneaux de plus en plus larges) ; -1 s'il n'y en a pas dans les 8 anneaux.
function nearestFree(grid, index) {
  if (grid.blocked[index] === 0) return index;
  const col0 = index % grid.cols;
  const row0 = Math.floor(index / grid.cols);
  for (let ring = 1; ring <= 8; ring += 1) {
    let best = -1;
    let bestD = Infinity;
    for (let row = row0 - ring; row <= row0 + ring; row += 1) {
      for (let col = col0 - ring; col <= col0 + ring; col += 1) {
        if (Math.max(Math.abs(col - col0), Math.abs(row - row0)) !== ring || !free(grid, col, row)) continue;
        const d = (col - col0) ** 2 + (row - row0) ** 2;
        if (d < bestD) {
          bestD = d;
          best = row * grid.cols + col;
        }
      }
    }
    if (best >= 0) return best;
  }
  return -1;
}

// Champ de flux : coût du chemin le plus court de chaque cellule libre jusqu'à la cellule de target (ou, si elle est bloquée,
// la plus proche libre). Parcours par seaux (Dial) : un parcours en largeur dont les diagonales coûtent 14 et les droites 10.
// Renvoie { dist (Int32Array, INF = inaccessible), source (index ou -1), reachable (cellules atteintes) }.
export function buildFlow(grid, target) {
  const dist = new Int32Array(grid.cols * grid.rows).fill(INF);
  const source = nearestFree(grid, cellIndex(grid, target));
  if (source < 0) return { dist, source, reachable: 0 };
  const buckets = [[source]];
  dist[source] = 0;
  let reachable = 0;
  let pending = 1;
  for (let d = 0; pending > 0; d += 1) {
    const bucket = buckets[d];
    if (!bucket) continue;
    for (let k = 0; k < bucket.length; k += 1) {
      const index = bucket[k];
      pending -= 1;
      if (dist[index] !== d) continue;
      reachable += 1;
      const col = index % grid.cols;
      const row = Math.floor(index / grid.cols);
      for (const [dx, dy, cost] of MOVES) {
        const nc = col + dx;
        const nr = row + dy;
        if (!free(grid, nc, nr)) continue;
        // Jamais de coin coupé : une diagonale exige les deux cases voisines libres.
        if (dx !== 0 && dy !== 0 && (!free(grid, col + dx, row) || !free(grid, col, row + dy))) continue;
        const ni = nr * grid.cols + nc;
        const nd = d + cost;
        if (nd < dist[ni]) {
          dist[ni] = nd;
          (buckets[nd] ??= []).push(ni);
          pending += 1;
        }
      }
    }
  }
  return { dist, source, reachable };
}

// Cellule voisine de index qui rapproche le plus de la cible, ou -1. Hors cellule libre : le voisin le moins coûteux, coins ignorés.
function bestNeighbor(grid, flow, index) {
  const col = index % grid.cols;
  const row = Math.floor(index / grid.cols);
  const here = flow.dist[index];
  let best = -1;
  let bestCost = here === INF ? INF : here;
  for (const [dx, dy] of MOVES) {
    const nc = col + dx;
    const nr = row + dy;
    if (nc < 0 || nr < 0 || nc >= grid.cols || nr >= grid.rows) continue;
    const ni = nr * grid.cols + nc;
    if (flow.dist[ni] === INF) continue;
    if (here !== INF && dx !== 0 && dy !== 0 && (!free(grid, col + dx, row) || !free(grid, col, row + dy))) continue;
    if (flow.dist[ni] < bestCost) {
      bestCost = flow.dist[ni];
      best = ni;
    }
  }
  return best;
}

// Chemin (liste de centres de cellules) suivi depuis from jusqu'à la cible ; vide si from est inaccessible. maxSteps borne la longueur.
export function flowPath(grid, flow, from, maxSteps = 100_000) {
  const path = [];
  let index = cellIndex(grid, from);
  for (let i = 0; i < maxSteps; i += 1) {
    const next = bestNeighbor(grid, flow, index);
    if (next < 0) break;
    path.push(cellCenter(grid, next));
    index = next;
  }
  return path;
}

// Longueur du chemin depuis from jusqu'à la cible ; Infinity si inaccessible.
export function pathLength(grid, flow, from) {
  const start = cellIndex(grid, from);
  if (flow.dist[start] === INF && bestNeighbor(grid, flow, start) < 0) return Infinity;
  let at = { x: num(from?.x), y: num(from?.y) };
  let total = 0;
  for (const p of flowPath(grid, flow, from)) {
    total += Math.hypot(p.x - at.x, p.y - at.y);
    at = p;
  }
  return total;
}

// Ligne de vue libre entre a et b pour un cercle de rayon radius (0 : un point) ; solids : rectangles pleins.
export function lineOfSight(a, b, solids, radius = 0) {
  return clearSegment(a, b, solids, radius);
}

// Direction unitaire à suivre depuis pos : vers la cellule la plus lointaine du chemin (au plus lookahead cellules) qui reste visible
// en ligne droite, ce qui évite les marches d'escalier de la grille. { x: 0, y: 0 } si pos est sur la cible ou inaccessible.
export function flowDirection(grid, flow, pos, lookahead = 5) {
  const from = { x: num(pos?.x), y: num(pos?.y) };
  let index = cellIndex(grid, from);
  let next = bestNeighbor(grid, flow, index);
  if (next < 0) return { x: 0, y: 0 };
  let goal = cellCenter(grid, next);
  const margin = grid.radius + 1;
  const steps = Math.max(1, Math.min(20, Math.floor(num(lookahead, 5))));
  for (let i = 1; i < steps; i += 1) {
    index = next;
    next = bestNeighbor(grid, flow, index);
    if (next < 0) break;
    const candidate = cellCenter(grid, next);
    if (!lineOfSight(from, candidate, grid.solids, margin)) break;
    goal = candidate;
  }
  return normalize({ x: goal.x - from.x, y: goal.y - from.y });
}

export const createFlowState = () => ({ flow: null, cell: -1, timer: 0 });

// Recalcule le champ de flux seulement si le joueur a changé de cellule et qu'au moins interval secondes de jeu se sont écoulées
// depuis le dernier calcul ; le premier calcul est immédiat. Renvoie un nouvel état { flow, cell, timer, recomputed }.
export function stepFlow(state, dt, grid, target, interval = 0.25) {
  const cell = cellIndex(grid, target);
  const wait = isNum(interval) && interval >= 0 ? interval : 0.25;
  if (!state?.flow) return { flow: buildFlow(grid, target), cell, timer: 0, recomputed: true };
  const timer = num(state.timer) + clampDt(dt);
  if (cell !== state.cell && timer >= wait) return { flow: buildFlow(grid, target), cell, timer: 0, recomputed: true };
  return { flow: state.flow, cell: state.cell, timer, recomputed: false };
}

// Lot 3 : champ de flux d'une fenêtre. nav : { grid } où grid est la grille EXTÉRIEURE (obstacles du décor gonflés, murs fermés, ouvertures
// des fenêtres bloquées) ; geom : windowGeometry (windows.js). Le champ part de entryOuter et couvre la zone extérieure : un zombie qui le
// suit arrive devant sa fenêtre sans jamais passer par une ouverture. Calculé une seule fois au chargement du niveau.
// Renvoie { id, grid, flow, source, reachable }.
export function buildWindowField(nav, geom) {
  const grid = nav?.grid;
  if (!grid || !geom?.entryOuter) return { id: geom?.id ?? null, grid: null, flow: null, source: -1, reachable: 0 };
  const flow = buildFlow(grid, geom.entryOuter);
  return { id: geom.id ?? null, grid, flow, source: flow.source, reachable: flow.reachable };
}

// Lot 3c : vrai si un chemin existe de from à to dans la grille (cases libres, diagonales sans coin coupé). Un point dans une case bloquée part de la case
// libre la plus proche, comme buildFlow.
export function hasPath(grid, from, to) {
  if (!grid || !Number.isInteger(grid.cols)) return false;
  const flow = buildFlow(grid, to);
  if (flow.source < 0) return false;
  const start = nearestFree(grid, cellIndex(grid, from));
  return start >= 0 && flow.dist[start] !== INF;
}
