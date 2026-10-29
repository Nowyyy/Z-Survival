// Plan d'une carte en texte (1 caractère = 100 unités) : node scripts/plan-carte.mjs [id]. Murs #, fenêtres 1 à 8 (F1 à F8), piliers P, escaliers S,
// rampe r, mobilier m, départ o, apparitions *. Ne modifie rien ; sert à regarder la carte sans navigateur.
import { readFileSync } from 'node:fs';
import { buildLayout } from '../js/core/layout.js';

const id = process.argv[2] ?? 'rez-de-chaussee';
const load = (n) => JSON.parse(readFileSync(new URL(`../data/game/maps/${id}/${n}.json`, import.meta.url), 'utf8'));
const world = load('world');
const decor = load('decor');
const L = buildLayout(world, decor);
const inR = (x, y, r) => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h;
const step = 100;
const rows = [];
for (let y = 0; y < L.size.height; y += step) {
  let row = '';
  for (let x = 0; x < L.size.width; x += step) {
    const cx = x + step / 2;
    const cy = y + step / 2;
    const win = L.gaps.find((g) => cx >= g.x - 20 && cx <= g.x + g.w + 20 && cy >= g.y - 20 && cy <= g.y + g.h + 20);
    const o = L.furniture.find((q) => inR(cx, cy, q));
    if (win) row += win.id.slice(1);
    else if (decor.spawnPoints.some((p) => Math.abs(p.x - cx) < 50 && Math.abs(p.y - cy) < 50)) row += '*';
    else if (Math.hypot(cx - L.start.x, cy - L.start.y) < 60) row += 'o';
    else if (L.walls.some((w) => inR(cx, cy, w))) row += '#';
    else if (o) row += o.kind === 'pilier' ? 'P' : o.kind === 'escalier' || (o.parts ?? []).some((p) => /pilier|escalier/.test(p)) ? 'S' : 'm';
    else if (L.ramp && inR(cx, cy, L.ramp)) row += 'r';
    else if (L.inside(cx, cy)) row += '.';
    else row += ' ';
  }
  rows.push(row.replace(/\s+$/, ''));
}
console.log(`${id} ${L.size.width} × ${L.size.height} (1 caractère = ${step})`);
console.log(rows.slice(7, 26).join('\n'));
