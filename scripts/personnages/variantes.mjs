// Tableau des variantes v2 (lot 3j) : pièces, triangles, appels (os rigides : corps + proxy d'ombre), ombres, contraste minimal sur les sols
// et les sols tachés (couleur moyenne vue, palier d'usure 0 et 3), écarts de silhouette entre types (même intention), violations. Imprime.
// Usage : node scripts/personnages/variantes.mjs
import { distinctness } from '../../js/core/character-parts.js';
import { ZOMBIES, characters, floorsWithStains, gameView, variantChecks, variantMetrics } from './lib.mjs';

const camera = gameView();
const floors = floorsWithStains();
const f2 = (v) => v.toFixed(2);
console.log('| Personnage | Variante | Pièces | Triangles | Appels | Ombre (appels / tri.) | Aire | Aspect | Lum. | Contraste min. (usure 0 / 3) | Sol le plus faible | Violations |');
console.log('|---|---|---|---|---|---|---|---|---|---|---|---|');
const all = {};
for (const slot of characters.slots) {
  for (const v of slot.variants.filter((x) => !x.flags?.test)) {
    const m = variantMetrics(slot, v, { camera, floors });
    const m3 = slot.id === 'joueur' ? null : variantMetrics(slot, v, { camera, floors, wear: 3 }); // le joueur ne s'use pas
    all[`${slot.id}:${v.id}`] = m;
    const min = Object.entries(m.contrasts).sort((a, b) => a[1] - b[1])[0];
    const min3 = m3 ? f2(Math.min(...Object.values(m3.contrasts))) : '–';
    const viol = variantChecks(slot, v).map((x) => `${x.code} (${x.detail})`).join(', ') || 'aucune';
    console.log(`| ${slot.id} | ${v.id}${v.flags?.outOfBudget ? ' (hors budget)' : ''} | ${m.stats.parts} | ${m.stats.triangles} | ${m.stats.calls + m.stats.shadowCalls} | ${m.stats.shadowCalls} / ${m.stats.shadowTriangles} | ${f2(m.area)} | ${m.aspect.toFixed(3)} | ${m.luminance.toFixed(3)} | ${f2(min[1])} / ${min3} | ${min[0]} | ${viol} |`);
  }
}
console.log('\nÉcarts de silhouette entre types de zombies, même intention (cible : 12 % ; C : 20 %) :');
for (const letter of ['A', 'B', 'C']) {
  const target = letter === 'C' ? 0.2 : 0.12;
  for (let i = 0; i < ZOMBIES.length; i += 1) {
    for (let j = i + 1; j < ZOMBIES.length; j += 1) {
      const d = distinctness(all[`${ZOMBIES[i]}:${letter}`], all[`${ZOMBIES[j]}:${letter}`]);
      console.log(`- ${letter} ${ZOMBIES[i]} / ${ZOMBIES[j]} : aire ${(100 * d.area).toFixed(1)} %, aspect ${(100 * d.aspect).toFixed(1)} %${d.max < target ? ' — HORS CIBLE' : ''}`);
    }
  }
}
