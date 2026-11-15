// Lot 8i : empreintes SHA-256 des tampons de la partie (data/game/sounds.json), rendus sous Node par les moteurs du jeu (js/core/synth.js et,
// pour les sons de l'atelier, js/core/sound-render.js), dans le mode « choix » du jeu : toutes les versions de chaque son. Preuve que le lot ne
// change aucun tampon de la partie : la sortie est comparée à tests/unit/helpers/sons-partie-empreintes.json (relevée sur la base du lot).
// Usage : node scripts/menu/empreintes-partie.mjs [--racine <dossier du dépôt>] > empreintes.json
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const i = process.argv.indexOf('--racine');
const racine = resolve(i < 0 ? resolve(import.meta.dirname, '..', '..') : process.argv[i + 1]);
const module = (f) => import(pathToFileURL(resolve(racine, f)).href);
const { renderSound, variantCount } = await module('js/core/synth.js');
const { isAtelier, seedCount } = await module('js/core/sound-choice.js');
const { renderChoice } = await module('js/core/sound-render.js');
const { sounds } = JSON.parse(readFileSync(resolve(racine, 'data/game/sounds.json'), 'utf8'));

export const empreintes = {};
let octets = 0;
for (const recette of sounds) {
  const n = isAtelier(recette) ? seedCount(recette) : variantCount(recette);
  for (let v = 0; v < n; v += 1) {
    const r = isAtelier(recette) ? renderChoice(recette, { mode: 'choix', seed: v + 1 }) : renderSound(recette, v);
    octets += r.samples.length * 4;
    empreintes[`${recette.id}-${v + 1}`] = createHash('sha256').update(Buffer.from(r.samples.buffer, r.samples.byteOffset, r.samples.byteLength)).digest('hex');
  }
}
if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) {
  console.log(JSON.stringify(empreintes, null, 1));
  console.error(`${Object.keys(empreintes).length} tampons, ${octets} octets`);
}
