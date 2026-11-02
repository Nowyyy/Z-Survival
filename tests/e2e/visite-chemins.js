// Lot 3g : chemins à pied pour les tests de la visite libre, calculés côté Node d'après les données de la carte (aucun hook ajouté au jeu).
// Grille de 10 unités, cellule libre si son centre est à plus de 18 (rayon du joueur) + 3 de tout solide du joueur (murs, mobilier,
// barrières des fenêtres, blocs de portes fermées ; en visite toutes les portes sont ouvertes). Recherche en largeur, 8 directions sans couper les coins.
import { readFileSync } from 'node:fs';
import { buildLayouts, playerSolids } from '../../js/core/layout.js';
import { parseZones, zonesToWorld } from '../../js/core/zones.js';
import { pointInPolygon } from '../../js/core/shape.js';

const DIR = 'data/game/maps/rez-de-chaussee';
const load = (f) => JSON.parse(readFileSync(f, 'utf8'));

export function loadMap() {
  const world = load(`${DIR}/world.json`);
  const decor = load(`${DIR}/decor.json`);
  const upper = load(`${DIR}/etage.world.json`);
  const zones = zonesToWorld(parseZones(load(`${DIR}/zones.json`)), world.transform);
  const layouts = buildLayouts({ rdc: { world, decor }, etage: { world: upper }, zones }, {});
  return { world, upper, zones, layouts, openIds: zones.doors.map((d) => d.id) };
}

const CELL = 10;
// extra : rectangles { x, y, w, h } à éviter en plus (zones de déclenchement des escaliers : on ne les traverse que pour monter).
export function makeGrid(map, floor, radius = 21, extra = []) {
  const layout = map.layouts[floor];
  const size = map.world.size;
  const cols = Math.ceil(size.width / CELL);
  const rows = Math.ceil(size.height / CELL);
  const blocked = new Uint8Array(cols * rows);
  const solids = [...(layout.walls ?? []), ...playerSolids(layout, map.openIds), ...extra];
  for (const s of solids) {
    const c0 = Math.max(0, Math.floor((s.x - radius) / CELL));
    const c1 = Math.min(cols - 1, Math.floor((s.x + s.w + radius) / CELL));
    const r0 = Math.max(0, Math.floor((s.y - radius) / CELL));
    const r1 = Math.min(rows - 1, Math.floor((s.y + s.h + radius) / CELL));
    for (let r = r0; r <= r1; r += 1) {
      for (let c = c0; c <= c1; c += 1) {
        const cx = (c + 0.5) * CELL;
        const cy = (r + 0.5) * CELL;
        if (cx > s.x - radius && cx < s.x + s.w + radius && cy > s.y - radius && cy < s.y + s.h + radius) blocked[r * cols + c] = 1;
      }
    }
  }
  // Hors du bâtiment (fenêtres fermées au joueur) : seules les cellules du contour de l'étage comptent.
  const contour = (floor === 'etage' ? map.upper : map.world).contour;
  const poly = Array.isArray(contour) ? contour.map((p) => (Array.isArray(p) ? p : [p.x, p.y])) : null;
  if (poly) for (let i = 0; i < cols * rows; i += 1) if (!blocked[i] && !pointInPolygon(((i % cols) + 0.5) * CELL, (Math.floor(i / cols) + 0.5) * CELL, poly)) blocked[i] = 1;
  return { cols, rows, blocked };
}

const idx = (g, p) => Math.min(g.rows - 1, Math.max(0, Math.floor(p.y / CELL))) * g.cols + Math.min(g.cols - 1, Math.max(0, Math.floor(p.x / CELL)));
const ctr = (g, i) => ({ x: ((i % g.cols) + 0.5) * CELL, y: (Math.floor(i / g.cols) + 0.5) * CELL });

// Cellule libre la plus proche d'un point (recherche en spirale bornée).
export function nearestFree(g, p) {
  const i0 = idx(g, p);
  if (!g.blocked[i0]) return ctr(g, i0);
  const c0 = i0 % g.cols;
  const r0 = Math.floor(i0 / g.cols);
  for (let d = 1; d < 60; d += 1) {
    for (let dr = -d; dr <= d; dr += 1) for (let dc = -d; dc <= d; dc += 1) {
      if (Math.max(Math.abs(dr), Math.abs(dc)) !== d) continue;
      const r = r0 + dr;
      const c = c0 + dc;
      if (r >= 0 && c >= 0 && r < g.rows && c < g.cols && !g.blocked[r * g.cols + c]) return ctr(g, r * g.cols + c);
    }
  }
  return null;
}

// Chemin (liste de points en unités) d'une cellule libre à une autre (ou à la cellule atteignable la plus proche, à 80 au plus), ou null. Simplifié : un point toutes les 4 cellules et aux virages.
export function findPath(g, from, to) {
  const a = idx(g, nearestFree(g, from) ?? from);
  let b = idx(g, nearestFree(g, to) ?? to);
  const prev = new Int32Array(g.cols * g.rows).fill(-1);
  prev[a] = a;
  const queue = [a];
  for (let k = 0; k < queue.length && prev[b] < 0; k += 1) {
    const cur = queue[k];
    const c = cur % g.cols;
    const r = Math.floor(cur / g.cols);
    for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      const nc = c + dc;
      const nr = r + dr;
      if (nc < 0 || nr < 0 || nc >= g.cols || nr >= g.rows) continue;
      const n = nr * g.cols + nc;
      if (g.blocked[n] || prev[n] >= 0) continue;
      if (dc && dr && (g.blocked[r * g.cols + nc] || g.blocked[nr * g.cols + c])) continue;
      prev[n] = cur;
      queue.push(n);
    }
  }
  if (prev[b] < 0) {
    // Cible dans une poche isolée : la cellule atteinte la plus proche de la cible (si elle est à 80 unités au plus).
    let best = -1;
    let bestD = Infinity;
    const t = ctr(g, b);
    for (const k of queue) {
      const p = ctr(g, k);
      const d = Math.hypot(p.x - t.x, p.y - t.y);
      if (d < bestD) { bestD = d; best = k; }
    }
    if (best < 0 || bestD > 80) return null;
    b = best;
  }
  const cells = [];
  for (let cur = b; cur !== a; cur = prev[cur]) cells.push(cur);
  cells.push(a);
  cells.reverse();
  const pts = cells.map((i) => ctr(g, i));
  return pts.filter((p, i) => i === 0 || i === pts.length - 1 || i % 4 === 0 || (pts[i + 1] && (pts[i + 1].x - p.x !== p.x - pts[i - 1].x || pts[i + 1].y - p.y !== p.y - pts[i - 1].y)));
}

// Point libre d'une zone : la cellule libre la plus proche du centre de sa région, à l'intérieur de la région.
export function zonePoint(map, g, zone) {
  const reg = zone.region.map((p) => (Array.isArray(p) ? p : [p.x, p.y]));
  const xs = reg.map((p) => p[0]);
  const ys = reg.map((p) => p[1]);
  const c = { x: (Math.min(...xs) + Math.max(...xs)) / 2, y: (Math.min(...ys) + Math.max(...ys)) / 2 };
  const p = nearestFree(g, c);
  return p && pointInPolygon(p.x, p.y, reg) ? p : null;
}
