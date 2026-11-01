// Inventaire mesuré des sons actuels du jeu (lot 3h) : rend chaque recette de data/game/sounds.json avec js/core/synth.js (lecture
// seule) et imprime, pour chaque son (moyenne de ses variantes), les mesures de js/core/audio-analysis.js. N'écrit que sur la sortie
// standard, sans dépendance. Usage : node scripts/sons/inventaire.mjs [--md] [--variants]
//   --md : tableau Markdown ; --variants : une ligne par variante.
// Niveau « relatif au tir » : niveau court (RMS de la fenêtre de 100 ms la plus forte) + gain de la catégorie du jeu (audio.json),
// moins celui du tir (gain 1) : c'est l'écart tel que le joueur l'entend, avant distance et étouffement.
import { readFileSync } from 'node:fs';
import { renderSound, variantCount, soundBytes } from '../../js/core/synth.js';
import { describe, dbfs } from '../../js/core/audio-analysis.js';

const { sounds } = JSON.parse(readFileSync('data/game/sounds.json', 'utf8'));
const audio = JSON.parse(readFileSync('data/game/audio.json', 'utf8'));
const md = process.argv.includes('--md');
const perVariant = process.argv.includes('--variants');

const rows = [];
let totalMs = 0;
let essentialMs = 0;
let bytes = 0;
let buffers = 0;
for (const recipe of sounds) {
  const list = [];
  for (let v = 0; v < variantCount(recipe); v += 1) {
    const t0 = performance.now();
    const r = renderSound(recipe, v);
    const ms = performance.now() - t0;
    totalMs += ms;
    if (recipe.set === 'essentiel') essentialMs += ms;
    bytes += soundBytes(r);
    buffers += 1;
    const voice = recipe.category === 'voix' || recipe.category === 'joueur';
    list.push({ v, ms, d: describe(r.samples, r.sampleRate, voice ? { minHz: 50, maxHz: 400 } : {}) });
  }
  rows.push({ recipe, list });
}
const mean = (xs) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);
const tir = rows.find((r) => r.recipe.id === 'tir');
const tirLevelDb = mean(tir.list.map((x) => x.d.levelDb));
const gainDb = (cat) => dbfs(audio.categoryGain?.[cat] ?? 1);

const fmt = (n, d = 0) => (Number.isFinite(n) ? n.toFixed(d) : '-');
const header = ['id', 'catégorie', 'ens.', 'Hz', 'var.', 'durée s', 'Ko', 'crête dBFS', 'RMS dBFS', 'niveau rel. tir dB', 'centroïde Hz', 'pic Hz', 'f0 Hz', '>4 kHz %', '<200 Hz %', 'HNR dB', 'rendu ms'];
const lines = [];
const line = (recipe, ds, ms, label) => [label, recipe.category, recipe.set, recipe.sampleRate, variantCount(recipe), fmt(mean(ds.map((d) => d.duration)), 2), fmt(mean(ds.map((d) => d.bytes)) * ds.length / 1024),
  fmt(Math.max(...ds.map((d) => d.peakDb)), 1), fmt(mean(ds.map((d) => d.rmsDb)), 1), fmt(mean(ds.map((d) => d.levelDb)) + gainDb(recipe.category) - tirLevelDb, 1), fmt(mean(ds.map((d) => d.centroid))),
  fmt(mean(ds.map((d) => d.peakHz))), (recipe.category === 'voix' || recipe.category === 'joueur') ? fmt(mean(ds.map((d) => d.f0))) : '-', fmt(100 * mean(ds.map((d) => d.hf4k)), 1), fmt(100 * mean(ds.map((d) => d.low200)), 1),
  (recipe.category === 'voix' || recipe.category === 'joueur') ? fmt(mean(ds.map((d) => d.hnr)), 1) : '-', fmt(ms, 0)];
for (const { recipe, list } of rows) {
  if (perVariant) for (const x of list) lines.push(line(recipe, [x.d], x.ms, `${recipe.id}-${x.v + 1}`));
  else lines.push(line(recipe, list.map((x) => x.d), list.reduce((s, x) => s + x.ms, 0), recipe.id));
}
if (md) {
  console.log(`| ${header.join(' | ')} |`);
  console.log(`|${header.map(() => '---').join('|')}|`);
  for (const l of lines) console.log(`| ${l.join(' | ')} |`);
} else {
  console.log(header.join('\t'));
  for (const l of lines) console.log(l.join('\t'));
}
console.log(`\nTampons : ${buffers} ; poids : ${bytes} octets (${(bytes / 1048576).toFixed(2)} Mo, Float32 mono, 4 octets par échantillon) ; rendu en Node : ${totalMs.toFixed(0)} ms (essentiel ${essentialMs.toFixed(0)} ms) ; niveau court du tir : ${tirLevelDb.toFixed(2)} dBFS.`);
