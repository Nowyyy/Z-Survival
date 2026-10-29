// Plan d'une carte en texte (1 caractère = 100 unités) : node scripts/plan-carte.mjs [id]. Murs #, fenêtres 1 à 8 (F1 à F8), piliers P, escaliers S,
// rampe r, mobilier m (n : pièce de complément du lot 3c), départ o, apparitions *, porte D (lot 3c) ; un point pour la zone de départ, deux points
// superposés ':' pour la zone d'une porte (aile). Ne modifie rien ; sert à regarder la carte sans navigateur.
import { readFileSync } from 'node:fs';
import { existsSync } from 'node:fs';
import { buildLayout } from '../js/core/layout.js';
import { parseZones, zonesToWorld } from '../js/core/zones.js';
import { pointInPolygon } from '../js/core/shape.js';

const id = process.argv[2] ?? 'rez-de-chaussee';
const load = (n) => JSON.parse(readFileSync(new URL(`../data/game/maps/${id}/${n}.json`, import.meta.url), 'utf8'));
const world = load('world');
const decor = load('decor');
const zonesFile = new URL(`../data/game/maps/${id}/zones.json`, import.meta.url);
const zones = existsSync(zonesFile) ? zonesToWorld(parseZones(JSON.parse(readFileSync(zonesFile, 'utf8'))), world.transform) : null;
const L = buildLayout(world, decor, { zones });
const closedZone = (x, y) => zones !== null && zones.zones.some((z) => !z.openAtStart && pointInPolygon(x, y, z.region));
const inR = (x, y, r) => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h;
const step = 100;
const rows = [];
for (let y = 0; y < L.size.height; y += step) {
  let row = '';
  for (let x = 0; x < L.size.width; x += step) {
    const cx = x + step / 2;
    const cy = y + step / 2;
    const win = L.gaps.find((g) => cx >= g.x - 40 && cx <= g.x + g.w + 40 && cy >= g.y - 55 && cy <= g.y + g.h + 55);
    const o = L.furniture.find((q) => inR(cx, cy, q));
    if (win) row += win.id.slice(1);
    else if (L.doors.some((d) => x < d.rect.x + d.rect.w && x + step > d.rect.x && y < d.rect.y + d.rect.h && y + step > d.rect.y)) row += 'D';
    else if (decor.spawnPoints.some((p) => Math.abs(p.x - cx) < 50 && Math.abs(p.y - cy) < 50)) row += '*';
    else if (Math.hypot(cx - L.start.x, cy - L.start.y) < 60) row += 'o';
    else if (L.walls.some((w) => inR(cx, cy, w))) row += '#';
    else if (o) row += o.kind === 'pilier' ? 'P' : o.kind === 'escalier' || (o.parts ?? []).some((p) => /pilier|escalier/.test(p)) ? 'S' : o.provisional ? 'n' : 'm';
    else if (L.ramp && inR(cx, cy, L.ramp)) row += 'r';
    else if (L.inside(cx, cy)) row += closedZone(cx, cy) ? ':' : '.';
    else row += ' ';
  }
  rows.push(row.replace(/\s+$/, ''));
}
console.log(`${id} ${L.size.width} × ${L.size.height} (1 caractère = ${step})`);
console.log(rows.slice(8, 26).join('\n'));
