// Lot 5e-C1 — Empreinte SHA-256 de chaque tampon du pack de sons par défaut (?sons=choix), sans navigateur : moteurs purs js/core/synth.js
// (recettes « synth », toutes les variantes) et js/core/sound-render.js → synth2.js (entrées « atelier », graines 1 à variants, durée par
// défaut), exactement comme sound-loader.js et sound-worker.js les calculent. N'écrit rien dans le dépôt : JSON sur la sortie standard,
// ou dans --out <fichier hors dépôt>. Comparaison : node scripts/nettoyage/empreintes-sons.mjs --compare a.json b.json (code 1 au premier écart).
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const argv = process.argv.slice(2);
const opt = (n, d) => (argv.includes(n) ? argv[argv.indexOf(n) + 1] : d);
if (argv.includes('--compare')) {
  const i = argv.indexOf('--compare');
  const [a, b] = [argv[i + 1], argv[i + 2]].map((f) => JSON.parse(readFileSync(f, 'utf8')));
  const keys = [...new Set([...Object.keys(a.tampons), ...Object.keys(b.tampons)])].sort();
  const diff = keys.filter((k) => a.tampons[k] !== b.tampons[k]);
  console.log(`${keys.length} tampons ; sounds.json ${a.soundsJson === b.soundsJson ? 'identique' : 'DIFFÉRENT'} ; ${diff.length ? `ÉCARTS : ${diff.join(', ')}` : 'empreintes identiques'}`);
  process.exit(diff.length || a.soundsJson !== b.soundsJson ? 1 : 0);
}
const ROOT = resolve(opt('--racine', resolve(import.meta.dirname, '..', '..')));
const OUT = opt('--out', null);
if (OUT && !relative(ROOT, resolve(OUT)).startsWith('..')) {
  console.error('Refusé : --out est dans le dépôt.');
  process.exit(2);
}
const mod = (p) => import(pathToFileURL(join(ROOT, p)).href);
const { startRender, renderStep, finishRender, variantCount } = await mod('js/core/synth.js');
const { isAtelier, seedCount } = await mod('js/core/sound-choice.js');
const { renderChoice } = await mod('js/core/sound-render.js');
const raw = readFileSync(join(ROOT, 'data/game/sounds.json'));
const { sounds } = JSON.parse(raw);
const sha = (samples, rate) => createHash('sha256').update(Buffer.from(samples.buffer, samples.byteOffset, samples.byteLength)).update(String(rate)).digest('hex');
const tampons = {};
for (const recipe of sounds) {
  if (isAtelier(recipe)) {
    for (let seed = 1; seed <= seedCount(recipe); seed += 1) {
      const r = renderChoice(recipe, { mode: 'choix', seed });
      tampons[`${recipe.id}-${seed}`] = sha(r.samples, r.sampleRate);
    }
  } else {
    for (let v = 0; v < variantCount(recipe); v += 1) {
      const acc = startRender(recipe, v);
      while (!renderStep(acc, 2048).done);
      const r = finishRender(acc);
      tampons[`${recipe.id}-${v + 1}`] = sha(r.samples, r.sampleRate);
    }
  }
}
const out = { soundsJson: createHash('sha256').update(raw).digest('hex'), nombre: Object.keys(tampons).length, empreinteGlobale: createHash('sha256').update(JSON.stringify(tampons)).digest('hex'), tampons };
const text = `${JSON.stringify(out, null, 1)}\n`;
if (OUT) writeFileSync(OUT, text);
else process.stdout.write(text);
console.error(`${out.nombre} tampons ; sounds.json ${out.soundsJson.slice(0, 16)} ; empreinte globale ${out.empreinteGlobale.slice(0, 16)}`);
