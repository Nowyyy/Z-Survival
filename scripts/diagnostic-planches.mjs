// Diagnostic des planches (lot 3a) : outil de contrôle, rien n'est écrit dans le dépôt.
// Construit le monde avec js/game/world.js (la géométrie réellement utilisée par le jeu, sans WebGL), lit les sommets des maillages de
// planches et de débris, et affiche pour chaque fenêtre et chacune de ses planches : l'ordonnée minimale des coins, la distance signée
// minimale et maximale des coins à la face intérieure du mur (négatif = dans le mur), puis pour chaque débris : l'ordonnée minimale et
// la collision avec les meubles. Usage : node scripts/diagnostic-planches.mjs [graine] (graine 1 par défaut, comme ?seed=1).
import { readFileSync } from 'node:fs';
import { buildLayout, windowsWithGaps } from '../js/core/layout.js';
import { addDebris, createDebris, faceDistance, plankSettings } from '../js/core/plank-layout.js';
import { windowGeometries, createWindowsState } from '../js/core/windows.js';
import { Texture } from 'three';
import { buildWorld } from '../js/game/world.js';

const read = (path) => JSON.parse(readFileSync(new URL(`../${path}`, import.meta.url), 'utf8'));
const world = read('data/game/world.json');
const decor = read('data/game/decor.json');
const render = read('data/game/render.json');
const windowsCfg = read('data/game/windows.json');
const seed = Number.parseInt(process.argv[2] ?? '1', 10) || 1;

const layout = buildLayout(world, decor);
const geoms = windowGeometries(windowsWithGaps(layout), windowsCfg);
const palette = Object.fromEntries(['floor', 'wall', 'ground', 'sun', 'ambient'].map((k) => [k, '#808080']));
const stub = { texture: () => new Texture(), repeat: () => 100, size: () => 128, params: () => ({ band: 0.125, strips: 4 }), region: () => ({ u0: 0, v0: 0, u1: 1, v1: 1, scale: 100 }) };
const built = buildWorld({ palette, layout, render, textures: stub, windowGeoms: geoms, windowsCfg, seed });

// Distance signée d'un point (x, z) à la face intérieure du mur de la fenêtre, positive côté salle (négative dans le mur).
const { room } = layout;
const wallGap = (g, x, z) => {
  if (g.side === 'nord') return z - (room.y + room.wall);
  if (g.side === 'sud') return room.y + room.height - room.wall - z;
  if (g.side === 'ouest') return x - (room.x + room.wall);
  return room.x + room.width - room.wall - x;
};
const f = (n) => (Math.abs(n) < 1e-9 ? 0 : n).toFixed(2).padStart(7);

function corners(positions, from, count) {
  const out = [];
  for (let i = from; i < from + count; i += 1) out.push([positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2]]);
  return out;
}

const state = (n) => createWindowsState(geoms, windowsCfg, { planks: n });
const lines = [];
const row = (...cells) => lines.push(cells.join(' | '));

// Adaptateur : avant le lot 3a, `world.planks` (un maillage pour toutes les fenêtres : 4 quadrilatères de 6 sommets par planche, puis les débris) ;
// depuis le lot 3a, `world.windowMeshes` (un maillage par fenêtre : 12 sommets par poutre) et `world.debris` (un maillage, 12 sommets par débris).
const after = Boolean(built.windowMeshes);
const count = windowsCfg.planks;
const sync = (planks) => (after ? built.windowMeshes.sync(state(planks)) : built.planks.sync(state(planks)));

function beamPoints(w, i) {
  if (after) {
    const pos = built.windowMeshes.meshes[w].geometry.attributes.position.array;
    return corners(pos, i * 12, 12);
  }
  return corners(built.planks.mesh.geometry.attributes.position.array, (w * count + i) * 24, 24);
}

function debrisPoints(items, w, i) {
  if (after) {
    // sommets du maillage de débris : 12 par débris, dans l'ordre de la liste
    const pos = built.debris.mesh.geometry.attributes.position.array;
    return corners(pos, items.findIndex((d) => d.window === geoms[w].id && d.k === i) * 12, 12);
  }
  const total = geoms.length * count;
  return corners(built.planks.mesh.geometry.attributes.position.array, total * 4 * 6 + (w * count + i) * 6, 6);
}

row('fenêtre', 'planche', 'y min', 'y max', 'écart mur min', 'écart mur max', 'sous l\'allège', 'dans le mur');
const sill = render.sillHeight;
let bad = 0;
sync(4);
geoms.forEach((g, w) => {
  for (let i = 0; i < count; i += 1) {
    const pts = beamPoints(w, i);
    const ys = pts.map((p) => p[1]);
    const gaps = pts.map((p) => wallGap(g, p[0], p[2]));
    const min = Math.min(...gaps);
    const max = Math.max(...gaps);
    const under = Math.min(...ys) < sill + 0.5 || Math.max(...ys) > render.lintelBottom + 16;
    const inside = min < 0;
    if (under || inside) bad += 1;
    row(g.id, i, f(Math.min(...ys)), f(Math.max(...ys)), f(min), f(max), under ? 'OUI' : 'non', inside ? 'OUI' : 'non');
  }
});
lines.push('', `planches hors critère (sous l'allège + 0,5, au-dessus du linteau + 16, ou dans le mur) : ${bad} sur ${geoms.length * count}`);

// Débris : 12 (3 fenêtres × 4 planches arrachées), y min et collision avec les meubles.
sync(0);
let items = [];
if (after) {
  // Comme le jeu au départ avec ?planks=0 : 4 débris par fenêtre, dans l'ordre des fenêtres.
  const settings = plankSettings(windowsCfg, render);
  const layoutForDebris = { params: settings, obstacles: layout.furniture, bounds: layout.bounds };
  let st = createDebris();
  for (const g of geoms) for (let i = 0; i < count; i += 1) st = addDebris(st, { ...g, inner: faceDistance(layout.room, g) }, seed, layoutForDebris);
  const rank = {};
  items = st.items.map((d) => ({ ...d, k: (rank[d.window] = (rank[d.window] ?? -1) + 1) }));
  built.debris.sync(st.items);
}
lines.push('', ['fenêtre', 'débris', 'y min', 'dans un meuble'].join(' | '));
let low = 0;
let hit = 0;
let shown = 0;
geoms.forEach((g, w) => {
  for (let i = 0; i < count; i += 1) {
    if (after && !items.some((d) => d.window === g.id && d.k === i)) continue;
    const pts = debrisPoints(items, w, i);
    const minY = Math.min(...pts.map((p) => p[1]));
    const furniture = layout.furniture.find((o) => pts.some((p) => p[0] >= o.x && p[0] <= o.x + o.w && p[2] >= o.y && p[2] <= o.y + o.h));
    if (minY < 0.3) low += 1;
    if (furniture) hit += 1;
    shown += 1;
    row(g.id, i, f(minY), furniture ? furniture.id : 'non');
  }
});
lines.push('', `débris : ${shown} ; à moins de 0,3 du sol : ${low} ; dans un meuble : ${hit}`);
console.log(`graine ${seed}, ${geoms.length} fenêtres, ${count} planches chacune, ${after ? 'après' : 'avant'} le lot 3a`);
console.log(lines.join('\n'));
