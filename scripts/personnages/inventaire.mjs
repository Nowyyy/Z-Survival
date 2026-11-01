// État des lieux des personnages actuels (lot 3j) : pour le joueur et les 4 types de zombies, pièces, triangles, appels de dessin
// (pièces + ombres), articulations, pièces qui projettent une ombre, emprise et hauteur, silhouette à l'échelle du jeu (667 × 375),
// contraste de la couleur moyenne vue avec chaque sol, mémoire et durée de génération de l'atlas des personnages. Imprime, n'écrit rien.
// Usage : node scripts/personnages/inventaire.mjs
import { performance } from 'node:perf_hooks';
import { boundsOf, characterStats, distinctness, fkPose, unitsPerPixel } from '../../js/core/character-parts.js';
import { buildSpec, createTextureData } from '../../js/core/texgen.js';
import { atlasRegionMeans, characters, currentMetrics, currentPose, floorMeans, gameView, lookup, radiusOf, skeletons, texturesJson } from './lib.mjs';

const camera = gameView();
const means = atlasRegionMeans();
const floors = floorMeans();
const f2 = (v) => v.toFixed(2);
console.log(`Caméra du jeu à 667 × 375 : distance ${f2(camera.distance)}, inclinaison ${camera.tilt}°, champ ${camera.fov}°, ${f2(unitsPerPixel(camera))} unités par pixel au sol.\n`);
console.log('| Personnage | Pièces | Triangles | Appels (pièces + ombres) | Articulations | Ombres | Emprise / 1,3 r | Hauteur | Aire (px) | Aspect | Lum. vue | Contrastes (carrelage, herbe, terre, route, trottoir, escalier) |');
console.log('|---|---|---|---|---|---|---|---|---|---|---|---|');
const metrics = {};
for (const slot of characters.slots) {
  const st = characterStats(slot.current, { architecture: 'articulated', skeletons });
  const walk = slot.current.kind === 'player' ? { state: 'marche', amount: 1, phase: 1.2 } : { state: 'zombie', phase: 1.2 };
  const reach = boundsOf(fkPose(slot.current, currentPose(slot, walk), { skeletons }).boxes).reach;
  const m = currentMetrics(slot, walk, { camera, means, floors });
  metrics[slot.id] = m;
  const c = Object.values(m.contrasts).map(f2).join(' ; ');
  console.log(`| ${slot.id} | ${st.pieces} | ${st.triangles} | ${st.pieces + st.casters} (${st.pieces} + ${st.casters}) | ${st.joints.length} | ${st.casters} | ${f2(reach)} / ${f2(1.3 * radiusOf(slot.id))} | ${f2(st.rest.height)} | ${f2(m.area)} | ${m.aspect.toFixed(3)} | ${m.luminance.toFixed(3)} | ${c} |`);
}
console.log('\nÉcarts de silhouette entre types de zombies (aire, aspect ; cible : 12 % au moins sur l\'un des deux) :');
const ids = ['marcheur', 'petit', 'voute', 'grand'];
for (let i = 0; i < ids.length; i += 1) {
  for (let j = i + 1; j < ids.length; j += 1) {
    const d = distinctness(metrics[ids[i]], metrics[ids[j]]);
    console.log(`- ${ids[i]} / ${ids[j]} : aire ${(100 * d.area).toFixed(1)} %, aspect ${(100 * d.aspect).toFixed(1)} %${d.max < 0.12 ? ' — confondus' : ''}`);
  }
}
const entry = texturesJson.textures.find((t) => t.id === 'atlas-persos');
const t0 = performance.now();
createTextureData(buildSpec(entry, lookup));
const ms = performance.now() - t0;
console.log(`\nAtlas des personnages : ${entry.size} × ${entry.size}, ${Math.round((entry.size * entry.size * 4 * 4) / 3)} octets (mipmaps compris), généré en ${ms.toFixed(1)} ms (Node).`);
