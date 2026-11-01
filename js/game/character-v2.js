// Personnages du lot 3j, architecture « os rigides » : toutes les pièces d'une variante sont fusionnées en une géométrie par matière
// (js/core/character-parts.js, mergeParts), chaque sommet lié à un seul os (poids 1) ; un SkinnedMesh par matière, plus un maillage-proxy
// d'ombre (≤ 64 triangles) qui ne se dessine que dans la passe d'ombre (couche SHADOW_LAYER, activée sur la caméra d'ombre du soleil).
// Géométries et matériaux partagés entre tous les personnages d'une variante, jamais recréés à l'image ; chaque personnage a ses os.
import * as THREE from 'three';
import { expandParts, jointMatrices, jointsOf, mergeParts } from '../core/character-parts.js';

export const SHADOW_LAYER = 1;
// Sphère englobante fixe (repère du personnage) : couvre toutes les poses, chute au sol comprise ; sert au culling hors champ.
const BOUNDS = new THREE.Sphere(new THREE.Vector3(0, 28, 0), 62);

// Géométrie fusionnée d'une liste de pièces : attributs position, normal, uv, color, skinIndex, skinWeight ; un groupe par matière.
// options : { joints (articulations effectives), rect(part), color(part), materials (ordre des matières) }.
export function rigidGeometry(parts, { joints, rect = null, color = null, materials = null } = {}) {
  const rest = jointMatrices(joints, {}, 1);
  const groups = mergeParts(parts, { joints, matrices: rest, rect, color });
  const order = materials ?? groups.map((g) => g.material);
  const sorted = order.map((m) => groups.find((g) => g.material === m)).filter(Boolean);
  const pos = [];
  const nor = [];
  const uv = [];
  const col = [];
  const idx = [];
  const geometry = new THREE.BufferGeometry();
  let start = 0;
  sorted.forEach((g) => {
    pos.push(...g.positions);
    nor.push(...g.normals);
    uv.push(...g.uvs);
    col.push(...g.colors);
    for (const b of g.bones) idx.push(b, 0, 0, 0);
    const count = g.positions.length / 3;
    geometry.addGroup(start, count, order.indexOf(g.material));
    start += count;
  });
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(idx, 4));
  const weights = new Float32Array(idx.length);
  for (let i = 0; i < weights.length; i += 4) weights[i] = 1;
  geometry.setAttribute('skinWeight', new THREE.BufferAttribute(weights, 4));
  geometry.boundingSphere = BOUNDS.clone();
  return geometry;
}

// Inverses des matrices de repos des os (partagées par tous les personnages d'une variante).
export function boneInverses(joints) {
  const rest = jointMatrices(joints, {}, 1);
  return joints.map((j) => {
    const { m, t } = rest[j.id];
    return new THREE.Matrix4().set(m[0], m[1], m[2], t[0], m[3], m[4], m[5], t[1], m[6], m[7], m[8], t[2], 0, 0, 0, 1).invert();
  });
}

// Un personnage : groupe racine (échelle), os (Bone), SkinnedMesh du corps et proxy d'ombre (même squelette).
// shared : { geometry, shadowGeometry, materials, shadowMaterial, joints, inverses }.
export function createRigidCharacter(shared) {
  const root = new THREE.Group();
  const bones = new Map();
  for (const j of shared.joints) {
    const bone = new THREE.Bone();
    bone.name = j.id;
    bone.position.set(j.offset[0], j.offset[1], j.offset[2]);
    bone.rotation.order = 'YXZ';
    (j.parent ? bones.get(j.parent) : root).add(bone);
    bones.set(j.id, bone);
  }
  const list = shared.joints.map((j) => bones.get(j.id));
  const skeleton = new THREE.Skeleton(list, shared.inverses);
  const body = new THREE.SkinnedMesh(shared.geometry, shared.materials.length === 1 ? shared.materials[0] : shared.materials);
  body.castShadow = false;
  body.boundingSphere = BOUNDS.clone();
  root.add(body);
  body.bind(skeleton, new THREE.Matrix4());
  let shadow = null;
  if (shared.shadowGeometry) {
    shadow = new THREE.SkinnedMesh(shared.shadowGeometry, shared.shadowMaterial);
    shadow.castShadow = true;
    shadow.layers.set(SHADOW_LAYER);
    shadow.boundingSphere = BOUNDS.clone();
    root.add(shadow);
    shadow.bind(skeleton, new THREE.Matrix4());
  }
  const offsets = new Map(shared.joints.map((j) => [j.id, j.offset]));
  return {
    root,
    body,
    shadow,
    skeleton,
    bones,
    // pose : { angles: { joint: [x, y, z] }, offsets: { joint: [dx, dy, dz] } } ; les articulations absentes reviennent au repos.
    setAngles(pose) {
      const angles = pose?.angles ?? {};
      const extra = pose?.offsets ?? {};
      for (const [id, bone] of bones) {
        const a = angles[id];
        if (a) bone.rotation.set(a[0], a[1], a[2]);
        else bone.rotation.set(0, 0, 0);
        const o = offsets.get(id);
        const e = extra[id];
        bone.position.set(o[0] + (e ? e[0] : 0), o[1] + (e ? e[1] : 0), o[2] + (e ? e[2] : 0));
      }
    },
  };
}

// Données partagées d'une variante : géométrie du corps (une par jeu de couleurs `color`), proxy d'ombre, inverses des os.
export function rigidShared(variant, { skeletons, rect, color, materials, shadowMaterial, materialOrder = null }) {
  const joints = jointsOf(variant, skeletons);
  const parts = expandParts(variant);
  const shadowParts = Array.isArray(variant.shadow) ? expandParts({ parts: variant.shadow }) : parts.filter((p) => p.casts === true);
  return {
    joints,
    inverses: boneInverses(joints),
    geometry: rigidGeometry(parts, { joints, rect, color, materials: materialOrder }),
    shadowGeometry: shadowParts.length > 0 ? rigidGeometry(shadowParts.map((p) => ({ ...p, material: 'body' })), { joints }) : null,
    materials,
    shadowMaterial,
  };
}
