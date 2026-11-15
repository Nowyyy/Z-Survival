// Lot 8i : relevé des sons du menu (data/menu/sons.json), rendus sous Node par js/menu/sons/synthese.js : pour chaque son et chaque variante,
// durée, crête et niveau moyen (dBFS), fréquence moyenne (spectre grossier), octets, temps de calcul et empreinte SHA-256 (graine 1).
// Usage : node scripts/menu/sons.mjs [--json] [--choisis (seulement les variantes de data/menu/sons-choix.json)]
//         node scripts/menu/sons.mjs --empreintes > tests/unit/helpers/sons-menu-empreintes.json  (référence des tests, à régénérer après
//         tout changement voulu d'une recette de data/menu/sons.json)
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { lireChoix, lireSons } from '../../js/core/sons-menu.js';
import { mesurerSon, rendreSon } from '../../js/menu/sons/synthese.js';

const lire = (f) => JSON.parse(readFileSync(new URL(`../../${f}`, import.meta.url), 'utf8'));
const { catalogue, erreurs } = lireSons(lire('data/menu/sons.json'));
if (!catalogue) {
  console.error(erreurs.join('\n'));
  process.exit(1);
}
const { choix, ecarts } = lireChoix(lire('data/menu/sons-choix.json'), catalogue);
const seulementChoisis = process.argv.includes('--choisis');
const lignes = [];
const octets = {};
for (const s of catalogue.sons) {
  for (const v of s.variantes) {
    const choisi = choix[s.id] === v.id;
    if (seulementChoisis && !choisi) continue;
    for (let g = 1; g <= s.versions; g += 1) {
      const t0 = performance.now();
      const r = rendreSon(s, v.id, g);
      const ms = performance.now() - t0;
      const m = mesurerSon(r.samples, r.sampleRate);
      const sha = createHash('sha256').update(Buffer.from(r.samples.buffer)).digest('hex');
      if (choisi) octets[s.groupe] = (octets[s.groupe] ?? 0) + m.octets;
      lignes.push({ son: s.id, groupe: s.groupe, variante: v.id, version: g, choisi, defaut: s.defaut === v.id, nom: v.nom, duree: Number(m.duree.toFixed(3)), creteDb: Number(m.creteDb.toFixed(2)), moyenDb: Number(m.moyenDb.toFixed(1)), aiguHz: m.aiguHz, octets: m.octets, ms: Number(ms.toFixed(1)), sha256: sha });
    }
  }
}
if (process.argv.includes('--empreintes')) console.log(JSON.stringify(Object.fromEntries(lignes.map((l) => [`${l.son}:${l.variante}:${l.version}`, l.sha256])), null, 1));
else if (process.argv.includes('--json')) console.log(JSON.stringify({ octets, ecarts, lignes }, null, 1));
else {
  for (const l of lignes) console.log(`${l.son.padEnd(20)} ${l.variante}${l.version > 1 ? l.version : ' '} ${l.choisi ? '*' : ' '} ${String(l.duree).padStart(5)} s  crête ${String(l.creteDb).padStart(6)}  moyen ${String(l.moyenDb).padStart(6)}  ~${String(l.aiguHz).padStart(5)} Hz  ${String(l.ms).padStart(6)} ms  ${l.sha256.slice(0, 12)}`);
  console.log('Octets des variantes retenues par groupe :', octets, '— écarts du fichier de choix :', ecarts.length ? ecarts : 'aucun');
}
