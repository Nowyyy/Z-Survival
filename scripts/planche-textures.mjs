// Outil de contrôle (non publié) : génère toutes les textures de data/game/textures.json en Node, mesure le temps de chaque
// texture et écrit une planche PNG (sans dépendance : node:zlib). Usage : node scripts/planche-textures.mjs <sortie.png>
import { readFileSync, writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { parseColor } from '../js/core/color.js';
import { buildSpec, createTextureData, meanColor } from '../js/core/texgen.js';

const tokens = Object.fromEntries([...readFileSync('css/tokens.css', 'utf8').matchAll(/(--[a-z0-9-]+):\s*(#[0-9a-fA-F]{3,6})\s*;/g)].map((m) => [m[1], m[2]]));
const lookup = (token) => parseColor(tokens[token]);
const { textures } = JSON.parse(readFileSync('data/game/textures.json', 'utf8'));
const out = process.argv[2] ?? 'planche.png';

let total = 0;
const made = textures.map((entry) => {
  const spec = buildSpec(entry, lookup);
  const t0 = performance.now();
  const tex = createTextureData(spec);
  const ms = performance.now() - t0;
  total += ms;
  const mean = meanColor(tex).map(Math.round);
  console.log(`${entry.id.padEnd(16)} ${entry.kind.padEnd(9)} ${tex.width}x${tex.height}  ${ms.toFixed(0).padStart(5)} ms  ${(tex.data.length * 4 / 3 / 1048576).toFixed(2)} Mo  moyenne ${mean}${tex.warnings.length ? `  AVERTISSEMENTS ${tex.warnings}` : ''}`);
  return tex;
});
console.log(`total ${total.toFixed(0)} ms`);

// Planche : textures côte à côte, deux fois répétées en x et y pour les textures répétées (contrôle des raccords).
const tiles = made.map((tex, i) => ({ tex, rep: textures[i].repeat > 0 ? 2 : 1 }));
const sizes = tiles.map(({ tex, rep }) => tex.width * rep);
const cols = 4;
const rows = Math.ceil(tiles.length / cols);
const cell = 540;
const W = cols * cell;
const H = rows * cell;
const px = new Uint8Array(W * H * 4).fill(20);
tiles.forEach(({ tex, rep }, i) => {
  const ox = (i % cols) * cell + 4;
  const oy = Math.floor(i / cols) * cell + 4;
  const s = Math.min(1, (cell - 8) / (tex.width * rep));
  const size = Math.floor(tex.width * rep * s);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const sx = Math.floor((x / s) % tex.width);
      const sy = Math.floor((y / s) % tex.height);
      const a = (sy * tex.width + sx) * 4;
      const b = ((oy + y) * W + ox + x) * 4;
      px[b] = tex.data[a]; px[b + 1] = tex.data[a + 1]; px[b + 2] = tex.data[a + 2]; px[b + 3] = 255;
    }
  }
});
void sizes;

const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc = (buf) => { let c = 0xffffffff; for (const b of buf) c = crcTable[(c ^ b) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const chunk = (type, body) => {
  const head = Buffer.alloc(8); head.writeUInt32BE(body.length, 0); head.write(type, 4, 'ascii');
  const tail = Buffer.alloc(4); tail.writeUInt32BE(crc(Buffer.concat([head.subarray(4), body])), 0);
  return Buffer.concat([head, body, tail]);
};
const raw = Buffer.alloc((W * 4 + 1) * H);
for (let y = 0; y < H; y += 1) { raw[y * (W * 4 + 1)] = 0; Buffer.from(px.buffer, y * W * 4, W * 4).copy(raw, y * (W * 4 + 1) + 1); }
const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4); ihdr[8] = 8; ihdr[9] = 6;
writeFileSync(out, Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]));
console.log(`planche écrite : ${out} (${W}×${H})`);
