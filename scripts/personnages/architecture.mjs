// Évaluation des deux architectures de rendu des personnages (lot 3j), en Node avec Three.js (devDependency), sans rendu :
// 1. pièces articulées (js/game/character.js : un maillage par pièce) ; 2. os rigides (js/game/character-v2.js : un SkinnedMesh par
// matière et un proxy d'ombre). Mesures pour 10 zombies (types variés) et le joueur : appels de dessin (passe principale et passe
// d'ombre), triangles, mémoire des géométries, temps de mise à jour d'une pose pour 11 personnages. Imprime, n'écrit rien.
// Usage : node scripts/personnages/architecture.mjs
import * as THREE from 'three';
import { performance } from 'node:perf_hooks';
import { computePose } from '../../js/core/pose.js';
import { boundsOf, characterStats, expandParts, fkPose } from '../../js/core/character-parts.js';
import { fromV1 } from '../../js/core/pose-v2.js';
import { createCharacter, createKit } from '../../js/game/character.js';
import { createRigidCharacter, rigidShared } from '../../js/game/character-v2.js';
import { characters, load, skeletons, ZOMBIES } from './lib.mjs';

const FRAMES = 300;
const variants = load('zombie-variants');
const stub = { region: () => ({ u0: 0.1, v0: 0.1, u1: 0.2, v1: 0.2 }), texture: () => new THREE.Texture() };
const kit = createKit({ textures: stub, variants, hit: '#ffffff' });
const crowd = [['joueur', -1], ...Array.from({ length: 10 }, (_, i) => [ZOMBIES[i % 4], variants.zombie.variants.findIndex((v) => v.id === ZOMBIES[i % 4])])];
const bytesOf = (g) => Object.values(g.attributes).reduce((s, a) => s + a.array.byteLength, 0) + (g.index ? g.index.array.byteLength : 0);

// Proxy d'ombre minimal de la description actuelle : une boîte par pièce qui projette une ombre (bassin, tronc, tête, cuisses).
function shadowProxy(slot) {
  const { boxes } = fkPose(slot.current, {}, { skeletons, scale: 1 });
  const casters = expandParts(slot.current).filter((p) => p.casts && p.id !== 'hair');
  return casters.map((p) => {
    const b = boxes.find((x) => x.id === p.id);
    const restJoint = fkPose({ ...slot.current, parts: [{ ...p, kind: 'box', dims: { w: 0.02, h: 0.02, d: 0.02 }, offset: [0, 0, 0], rotation: [0, 0, 0] }] }, {}, { skeletons, scale: 1 }).boxes[0];
    const c = [0, 1, 2].map((k) => (b.min[k] + b.max[k]) / 2 - (restJoint.min[k] + restJoint.max[k]) / 2);
    return { id: `ombre-${p.id}`, joint: p.joint, kind: 'box', dims: { w: b.max[0] - b.min[0], h: b.max[1] - b.min[1], d: b.max[2] - b.min[2] }, offset: c, casts: true };
  });
}

// --- Architecture 1 -------------------------------------------------------------------------------------------------------------------
const a1 = crowd.map(([id, i]) => createCharacter(kit, id === 'joueur' ? 'player' : 'zombie', Math.max(0, i)));
const a1Scene = new THREE.Group();
for (const c of a1) a1Scene.add(c.root);
let a1Calls = 0;
let a1Shadow = 0;
let a1Tri = 0;
let a1ShadowTri = 0;
a1Scene.traverse((o) => {
  if (!o.isMesh) return;
  a1Calls += 1;
  a1Tri += o.geometry.attributes.position.count / 3;
  if (o.castShadow) {
    a1Shadow += 1;
    a1ShadowTri += o.geometry.attributes.position.count / 3;
  }
});
const a1Geoms = new Set();
a1Scene.traverse((o) => o.isMesh && a1Geoms.add(o.geometry));
const a1Bytes = [...a1Geoms].reduce((s, g) => s + bytesOf(g), 0);
const inputs = (f) => crowd.map(([id], k) => ({ phase: f * 0.2 + k, state: id === 'joueur' ? 'marche' : 'zombie', time: f / 60, seed: k, amount: 0.7 }));
let t0 = performance.now();
for (let f = 0; f < FRAMES; f += 1) {
  const inp = inputs(f);
  a1.forEach((c, k) => c.setPose(computePose(inp[k])));
  a1Scene.updateMatrixWorld(true);
}
const a1Ms = (performance.now() - t0) / FRAMES;

// --- Architecture 2 -------------------------------------------------------------------------------------------------------------------
const material = new THREE.MeshLambertMaterial({ vertexColors: true });
const shadowMaterial = new THREE.MeshBasicMaterial();
const shared = new Map();
for (const slot of characters.slots) {
  shared.set(slot.id, rigidShared({ ...slot.current, shadow: shadowProxy(slot) }, { skeletons, rect: () => ({ u0: 0.1, v0: 0.1, u1: 0.2, v1: 0.2 }), color: () => [1, 1, 1], materials: [material], shadowMaterial }));
}
const a2 = crowd.map(([id]) => ({ id, char: createRigidCharacter(shared.get(id)) }));
const a2Scene = new THREE.Group();
for (const c of a2) a2Scene.add(c.char.root);
let a2Calls = 0;
let a2Shadow = 0;
let a2Tri = 0;
let a2ShadowTri = 0;
for (const { char } of a2) {
  a2Calls += char.body.geometry.groups.length;
  a2Tri += char.body.geometry.attributes.position.count / 3;
  if (char.shadow) {
    a2Shadow += 1;
    a2ShadowTri += char.shadow.geometry.attributes.position.count / 3;
  }
}
const a2Bytes = [...shared.values()].reduce((s, sh) => s + bytesOf(sh.geometry) + (sh.shadowGeometry ? bytesOf(sh.shadowGeometry) : 0), 0);
const boneTexture = (bones) => {
  let size = Math.sqrt(bones * 4);
  size = Math.max(4, 2 ** Math.ceil(Math.log2(size)));
  return size * size * 16;
};
const a2BoneBytes = a2.reduce((s, { char }) => s + boneTexture(char.skeleton.bones.length), 0);
t0 = performance.now();
for (let f = 0; f < FRAMES; f += 1) {
  const inp = inputs(f);
  a2.forEach(({ id, char }, k) => {
    const slot = characters.slots.find((s) => s.id === id);
    char.setAngles(fromV1(computePose(inp[k]), slot.current));
  });
  a2Scene.updateMatrixWorld(true);
  for (const { char } of a2) char.skeleton.update();
}
const a2Ms = (performance.now() - t0) / FRAMES;

const rows = [
  ['appels (passe principale)', a1Calls, a2Calls],
  ['appels (passe d\'ombre)', a1Shadow, a2Shadow],
  ['appels au total (11 personnages)', a1Calls + a1Shadow, a2Calls + a2Shadow],
  ['appels par personnage (zombie)', characterStats(characters.slots[1].current, { architecture: 'articulated', skeletons }).calls + 5, 1 + 1],
  ['triangles (passe principale)', a1Tri, a2Tri],
  ['triangles (passe d\'ombre)', a1ShadowTri, a2ShadowTri],
  ['mémoire des géométries partagées (octets)', a1Bytes, a2Bytes],
  ['mémoire par personnage : texture d\'os (octets, 11 personnages)', 0, a2BoneBytes],
  ['mise à jour d\'une pose, 11 personnages (ms par image, Node)', a1Ms.toFixed(3), a2Ms.toFixed(3)],
];
console.log('| Mesure | Pièces articulées | Os rigides |');
console.log('|---|---|---|');
for (const [k, a, b] of rows) console.log(`| ${k} | ${a} | ${b} |`);
const rest = boundsOf(fkPose(characters.slots[1].current, {}, { skeletons }).boxes);
console.log(`\nMarcheur actuel au repos : hauteur ${rest.height.toFixed(2)}, emprise ${rest.reach.toFixed(2)}.`);
