import { readFileSync } from 'node:fs';
import { contrast, parseColor } from '../js/core/color.js';
import { buildSpec, createTextureData, meanColor } from '../js/core/texgen.js';
const tokens = Object.fromEntries([...readFileSync('css/tokens.css', 'utf8').matchAll(/(--[a-z0-9-]+):\s*(#[0-9a-fA-F]{3,6})\s*;/g)].map((m) => [m[1], m[2]]));
const lookup = (t) => parseColor(tokens[t]);
const { textures } = JSON.parse(readFileSync('data/game/textures.json', 'utf8'));
const v = JSON.parse(readFileSync('data/game/zombie-variants.json', 'utf8'));
const grounds = {};
for (const id of ['sol-salle', 'herbe', 'sol-exterieur', 'route', 'trottoir']) grounds[id] = meanColor(createTextureData(buildSpec(textures.find((t) => t.id === id), lookup)));
const doms = [v.player.dominant, ...v.zombie.variants.map((z) => z.dominant)];
for (const [id, m] of Object.entries(grounds)) {
  console.log(id.padEnd(14), m.map(Math.round).join(','), 'perso:', doms.map((d) => contrast(lookup(d), m).toFixed(1)).join(' '), ' laser', contrast(lookup('--game-laser'), m).toFixed(2), ' balle', contrast(lookup('--game-bullet'), m).toFixed(2));
}
