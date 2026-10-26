// Plan du monde en texte (salle au pas de 40, monde au pas de 100) : node scripts/plan-monde.mjs
import { readFileSync } from 'node:fs';
import { buildLayout } from '../js/core/layout.js';

const load = (n) => JSON.parse(readFileSync(new URL(`../data/game/${n}.json`, import.meta.url), 'utf8'));
const world = load('world');
const L = buildLayout(world, load('decor'));
const { room } = L;
const LETTER = { table: 'T', comptoir: 'C', caisse: 'B', armoire: 'A', colonne: 'K', etagere: 'E' };
const inRect = (x, y, r) => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h;

const lines = [];
const step = 40;
lines.push(`Salle ${room.width} × ${room.height} (1 caractère = ${step}) ; # mur, N O E fenêtres, o départ du joueur (rayon 150), lettres : T table, C comptoir, B caisse, A armoire, K colonne, E étagère`);
for (let y = room.y; y < room.y + room.height; y += step) {
  let row = '';
  for (let x = room.x; x < room.x + room.width; x += step) {
    const cx = x + step / 2;
    const cy = y + step / 2;
    const f = L.furniture.find((o) => inRect(cx, cy, o));
    const win = L.windows.find((w) => Math.hypot(cx - w.x, cy - w.y) < 50);
    if (win) row += win.side === 'nord' ? 'N' : win.side === 'ouest' ? 'O' : 'E';
    else if (f) row += LETTER[f.kind];
    else if (Math.hypot(cx - L.start.x, cy - L.start.y) <= 150) row += 'o';
    else if (cx < L.bounds.minX + step || cx > L.bounds.maxX - step || cy < L.bounds.minY + step || cy > L.bounds.maxY - step) row += '#';
    else row += '.';
  }
  lines.push(row);
}
lines.push('');
lines.push(`Monde ${L.size.width} × ${L.size.height} (1 caractère = 100) ; = route, - trottoir, : sentier, V voiture, t arbre, b buisson, l lampadaire, f barrière, S point d'apparition, # salle, fenêtres N O E`);
const d = L.decor;
for (let y = 0; y < L.size.height; y += 100) {
  let row = '';
  for (let x = 0; x < L.size.width; x += 100) {
    const probe = { x, y, w: 100, h: 100 };
    const hit = (o) => o.x < x + 100 && o.x + o.w > x && o.y < y + 100 && o.y + o.h > y;
    const near = (o, r) => o.x + r > x && o.x - r < x + 100 && o.y + r > y && o.y - r < y + 100;
    const win = L.windows.find((w) => near(w, 10));
    const spawn = d.spawnPoints.find((p) => inRect(p.x, p.y, probe));
    if (spawn) row += 'S';
    else if (win) row += win.side === 'nord' ? 'N' : win.side === 'ouest' ? 'O' : 'E';
    else if (inRect(x + 50, y + 50, { x: room.x, y: room.y, w: room.width, h: room.height })) row += '#';
    else if (d.cars.some(hit)) row += 'V';
    else if (d.trees.some(hit)) row += 't';
    else if (d.lamps.some((l) => near(l, 8))) row += 'l';
    else if (d.fences.some(hit)) row += 'f';
    else if (d.bushes.some((b) => near(b, b.r))) row += 'b';
    else {
      const g = d.ground.find((k) => inRect(x + 50, y + 50, k));
      row += g ? { route: '=', trottoir: '-', sentier: ':' }[g.kind] : '.';
    }
  }
  lines.push(row);
}
console.log(lines.join('\n'));
