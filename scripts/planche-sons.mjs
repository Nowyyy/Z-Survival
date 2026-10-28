// Outil de contrôle (non publié) : rend tous les sons de data/game/sounds.json en Node, mesure le temps de calcul et le niveau de
// chaque variante, et écrit une planche PNG (forme d'onde en haut, spectrogramme en bas, un cadre par son et par variante).
// Sans dépendance : PNG écrit avec node:zlib, étiquettes en police point 5×7 intégrée. Usage : node scripts/planche-sons.mjs <sortie.png>  (ONLY=<expression> pour un sous-ensemble ; lot 3 : ONLY='planche|joueur-(chute|releve)' pour les sons des fenêtres et de la chute)
import { readFileSync, writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { renderSound, soundBytes, variantCount } from '../js/core/synth.js';
import { centroid, magnitudes, attackTime, mean, medianPitch, toDb } from '../tests/unit/helpers/dsp.js';

const { sounds } = JSON.parse(readFileSync('data/game/sounds.json', 'utf8'));
const fr = JSON.parse(readFileSync('data/i18n/fr.json', 'utf8'));
const out = process.argv[2] ?? 'planche-sons.png';

const rows = [];
let total = 0;
let totalEssential = 0;
let bytes = 0;
for (const recipe of sounds) {
  for (let v = 0; v < variantCount(recipe); v += 1) {
    const t0 = performance.now();
    const r = renderSound(recipe, v);
    const ms = performance.now() - t0;
    total += ms;
    if (recipe.set === 'essentiel') totalEssential += ms;
    bytes += soundBytes(r);
    const attackWin = Math.round(r.sampleRate * 0.012);
    rows.push({ recipe, v, r, ms, label: fr[`dev.sons.etiquette.${recipe.id}`] ?? '', cg: centroid(r.samples, r.sampleRate, 0, 512), cgAll: centroid(r.samples, r.sampleRate, 0, 2 ** Math.floor(Math.log2(r.samples.length))), attackWin });
  }
}
console.log('id-variante          cat       jeu        taux  durée   pic   eff(dB)  CG-att  CG-tout  f0     att90%   ms    Ko   avert.');
for (const { recipe, v, r, ms, cg, cgAll } of rows) {
  const f0 = recipe.category === 'voix' || recipe.category === 'joueur' ? medianPitch(r.samples, r.sampleRate).f0.toFixed(0) : '-';
  console.log(`${`${recipe.id}-${v + 1}`.padEnd(20)} ${recipe.category.padEnd(9)} ${recipe.set.padEnd(9)} ${String(r.sampleRate).padEnd(5)} ${r.duration.toFixed(2).padStart(5)} ${r.peak.toFixed(2)} ${toDb(r.rms).toFixed(1).padStart(7)} ${cg.toFixed(0).padStart(7)} ${cgAll.toFixed(0).padStart(8)} ${String(f0).padStart(4)} ${(attackTime(r.samples, r.sampleRate) * 1000).toFixed(1).padStart(8)} ${ms.toFixed(1).padStart(5)} ${(soundBytes(r) / 1024).toFixed(0).padStart(5)}  ${r.warnings.join(';')} dc=${mean(r.samples).toExponential(1)}`);
}
console.log(`total ${total.toFixed(0)} ms (essentiel ${totalEssential.toFixed(0)} ms) ; ${rows.length} tampons ; ${(bytes / 1048576).toFixed(2)} Mo`);

// --- planche ---
// ONLY=<expression> : ne dessine que les sons dont l'identifiant correspond (ex. ONLY=vague pour les annonces du lot 2c).
if (process.env.ONLY) {
  const keep = new RegExp(process.env.ONLY);
  for (let i = rows.length - 1; i >= 0; i -= 1) if (!keep.test(rows[i].recipe.id)) rows.splice(i, 1);
}
const CW = 360;
const CH = 150;
const cols = 4;
const rowsN = Math.ceil(rows.length / cols);
const W = cols * CW;
const H = rowsN * CH;
const px = new Uint8Array(W * H * 4);
for (let i = 0; i < W * H; i += 1) { px[i * 4] = 18; px[i * 4 + 1] = 18; px[i * 4 + 2] = 22; px[i * 4 + 3] = 255; }
const set = (x, y, r, g, b) => { if (x >= 0 && x < W && y >= 0 && y < H) { const o = (y * W + x) * 4; px[o] = r; px[o + 1] = g; px[o + 2] = b; } };
const FONT = { '0': '01110100011001110101110011000101110', '1': '00100011000010000100001000010001110', '2': '01110100010000100010001000100011111', '3': '11110000010000101110000010000111110', '4': '00010001100101010010111110001000010', '5': '11111100001111000001000011000101110', '6': '00110010001000011110100011000101110', '7': '11111000010001000100010000100001000', '8': '01110100011000101110100011000101110', '9': '01110100011000101111000010001001100', '-': '00000000000000011111000000000000000' };
function text(str, x, y, color) {
  let cx = x;
  for (const ch of str.toLowerCase()) {
    const glyph = FONT[ch];
    if (glyph) for (let i = 0; i < 35; i += 1) if (glyph[i] === '1') set(cx + (i % 5), y + Math.floor(i / 5), ...color);
    else if (/[a-z]/.test(ch)) for (let k = 0; k < 7; k += 1) set(cx + (k % 4), y + 1 + Math.floor(k / 4) * 2, ...color); // lettre : motif simple (l'identifiant complet est dans la sortie texte)
    cx += 6;
  }
}
rows.forEach(({ recipe, v, r }, idx) => {
  const ox = (idx % cols) * CW;
  const oy = Math.floor(idx / cols) * CH;
  for (let x = 0; x < CW; x += 1) { set(ox + x, oy, 60, 60, 70); set(ox + x, oy + CH - 1, 60, 60, 70); }
  for (let y = 0; y < CH; y += 1) { set(ox, oy + y, 60, 60, 70); set(ox + CW - 1, oy + y, 60, 60, 70); }
  text(String(idx + 1), ox + 4, oy + 4, [220, 220, 220]);
  const wave = { x: ox + 4, y: oy + 14, w: CW - 8, h: 64 };
  const n = r.samples.length;
  for (let x = 0; x < wave.w; x += 1) {
    let lo = 0; let hi = 0;
    const a = Math.floor((x / wave.w) * n); const b = Math.floor(((x + 1) / wave.w) * n);
    for (let i = a; i < Math.max(b, a + 1) && i < n; i += 1) { lo = Math.min(lo, r.samples[i]); hi = Math.max(hi, r.samples[i]); }
    const y0 = Math.round(wave.y + wave.h / 2 - hi * (wave.h / 2));
    const y1 = Math.round(wave.y + wave.h / 2 - lo * (wave.h / 2));
    for (let y = y0; y <= y1; y += 1) set(wave.x + x, y, 230, 230, 230);
  }
  for (let x = 0; x < wave.w; x += 1) set(wave.x + x, wave.y + wave.h / 2, 70, 70, 90);
  const spec = { x: ox + 4, y: oy + 84, w: CW - 8, h: 62 };
  const size = 256;
  for (let x = 0; x < spec.w; x += 1) {
    const start = Math.floor((x / spec.w) * Math.max(1, n - size));
    const mag = magnitudes(r.samples, start, size);
    for (let y = 0; y < spec.h; y += 1) {
      const bin = Math.min(mag.length - 1, Math.floor(((spec.h - 1 - y) / spec.h) * mag.length));
      const level = Math.min(1, Math.max(0, (toDb(mag[bin] / size) + 70) / 55));
      set(spec.x + x, spec.y + y, Math.round(255 * level), Math.round(60 * level * level), Math.round(40 * (1 - level) * level * 4));
    }
  }
  void recipe; void v;
});
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
console.log(`planche écrite : ${out} (${W}×${H}) ; ordre = ordre de la liste ci-dessus, ${cols} colonnes`);
void mean;
