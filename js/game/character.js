// Personnage articulé : bassin, tronc, tête, bras (épaule, coude), jambes (hanche, genou), arme tenue en main droite.
// Géométries et matériaux partagés par tous les personnages (jamais recréés à chaque image). Le personnage regarde vers +Z local.
import * as THREE from 'three';
import { FOOT, FORE, HAND, HIP_X, SHIN, SHOULDER_X, THIGH, UPPER } from './skeleton.js';

const LEG = THIGH + SHIN + FOOT;

// Boîte dont l'origine est en haut (pivot) ou au bas, décalée par (ox, oy, oz).
function box(w, h, d, ox = 0, oy = 0, oz = 0) {
  const g = new THREE.BoxGeometry(w, h, d);
  g.translate(ox, oy, oz);
  return g;
}

export function createKit(palette) {
  const mat = (color) => new THREE.MeshLambertMaterial({ color });
  return {
    geo: {
      pelvis: box(15, 7, 9, 0, 1),
      chest: box(19, 19, 10, 0, 9.5),
      head: box(9.5, 10.5, 10, 0, 5.5),
      hair: box(10.2, 3.2, 10.4, 0, 10.4),
      nose: box(2.2, 2.2, 2.2, 0, 4.5, 5.6),
      thigh: box(6.4, THIGH, 7, 0, -THIGH / 2),
      shin: box(5.6, SHIN, 6, 0, -SHIN / 2),
      foot: box(6, FOOT, 11, 0, -FOOT / 2, 2.6),
      upper: box(5, UPPER, 5, 0, -UPPER / 2),
      fore: box(4.4, FORE, 4.4, 0, -FORE / 2),
      hand: box(4.6, HAND, 4.6, 0, -HAND / 2),
      slide: box(2.8, 8.5, 3.4, 0, -5.4, 1.4),
      grip: box(2.8, 3, 4.2, 0, -2.4, -1.6),
    },
    mat: {
      player: { skin: mat(palette.skin), outfit: mat(palette.player), trousers: mat(palette.trousers), boot: mat(palette.boot), gun: mat(palette.gun), hair: mat(palette.trousers) },
      zombie: { skin: mat(palette.zombie), outfit: mat(palette.zombieClothes), trousers: mat(palette.zombieTrousers), boot: mat(palette.zombieTrousers), gun: mat(palette.gun), hair: mat(palette.zombieTrousers) },
      // Flash d'un ennemi touché : tout le corps passe à cette couleur (emissive, insensible à la lumière).
      hit: new THREE.MeshBasicMaterial({ color: palette.hit }),
    },
  };
}

const rotXYZ = new THREE.Quaternion();
const gunBase = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0));
const qHand = new THREE.Quaternion();
const qTorso = new THREE.Quaternion();

// kind : 'player' (arme tenue en main) ou 'zombie' (bras tendus, tête penchée, pas d'arme).
export function createCharacter(kit, kind) {
  const m = kit.mat[kind];
  const g = kit.geo;
  const meshes = [];
  // Seules les pièces principales (bassin, tronc, tête, cuisses) projettent une ombre : le reste ne coûte pas d'appel d'ombre.
  const casters = new Set([g.pelvis, g.chest, g.head, g.thigh]);
  const part = (geometry, material, parent, pos) => {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = casters.has(geometry);
    if (pos) mesh.position.set(...pos);
    mesh.userData.base = material;
    parent.add(mesh);
    meshes.push(mesh);
    return mesh;
  };
  const group = (parent, x = 0, y = 0, z = 0) => {
    const o = new THREE.Group();
    o.position.set(x, y, z);
    o.rotation.order = 'YXZ';
    parent.add(o);
    return o;
  };

  const root = new THREE.Group();
  const pelvis = group(root, 0, LEG, 0);
  part(g.pelvis, m.trousers, pelvis);
  const torso = group(pelvis, 0, 4, 0);
  if (kind === 'zombie') torso.rotation.x = 0.14;
  part(g.chest, m.outfit, torso);
  const head = group(torso, 0, 19, 0);
  part(g.head, m.skin, head);
  if (kind === 'player') part(g.hair, m.hair, head);
  part(g.nose, m.skin, head);

  const legs = {};
  const arms = {};
  for (const [name, side] of [['L', 1], ['R', -1]]) {
    const hip = group(pelvis, side * HIP_X, 0, 0);
    part(g.thigh, m.trousers, hip);
    const knee = group(hip, 0, -THIGH, 0);
    part(g.shin, m.trousers, knee);
    const ankle = group(knee, 0, -SHIN, 0);
    part(g.foot, m.boot, ankle);
    legs[name] = { hip, knee };

    const shoulder = group(torso, side * SHOULDER_X, 17, 0);
    part(g.upper, m.outfit, shoulder);
    const elbow = group(shoulder, 0, -UPPER, 0);
    part(g.fore, m.skin, elbow);
    const wrist = group(elbow, 0, -FORE, 0);
    part(g.hand, m.skin, wrist);
    arms[name] = { shoulder, elbow, wrist, side };
  }

  // Pistolet : tenu par la main droite, porté dans l'axe du tronc (soutenu par la main gauche qui le rejoint).
  let gun = null;
  if (kind === 'player') {
    gun = new THREE.Group();
    part(g.slide, m.gun, gun);
    part(g.grip, m.gun, gun);
    arms.R.wrist.add(gun);
    gun.position.set(0, -1, 0);
  }

  return {
    root,
    kind,
    gun,
    // Angles réellement posés sur les articulations (même convention que computePose) : sert aux tests.
    readPose() {
      const out = {};
      for (const name of ['L', 'R']) {
        out[`hip${name}`] = -legs[name].hip.rotation.x;
        out[`knee${name}`] = legs[name].knee.rotation.x;
        out[`shoulder${name}`] = -arms[name].shoulder.rotation.x;
        out[`elbow${name}`] = -arms[name].elbow.rotation.x;
      }
      out.torsoTwist = -torso.rotation.y;
      return out;
    },
    // Flash de l'ennemi touché : les matériaux partagés sont échangés, rien n'est créé.
    setFlash(on) {
      for (const mesh of meshes) mesh.material = on ? kit.mat.hit : mesh.userData.base;
    },
    // pose : sortie de computePose(). Pose les angles, puis pose le bassin sur le pied le plus bas.
    setPose(pose) {
      let lowest = 0;
      for (const name of ['L', 'R']) {
        const hipAngle = pose[`hip${name}`];
        const kneeAngle = pose[`knee${name}`];
        legs[name].hip.rotation.x = -hipAngle;
        legs[name].knee.rotation.x = kneeAngle;
        lowest = Math.max(lowest, THIGH * Math.cos(hipAngle) + SHIN * Math.cos(hipAngle - kneeAngle) + FOOT);
      }
      pelvis.position.y = lowest + pose.bob * 0.8;
      torso.rotation.y = -pose.torsoTwist;
      head.rotation.x = pose.headTilt;
      for (const name of ['L', 'R']) {
        const arm = arms[name];
        arm.shoulder.rotation.y = -arm.side * pose[`inward${name}`];
        arm.shoulder.rotation.x = -pose[`shoulder${name}`];
        arm.elbow.rotation.x = -pose[`elbow${name}`];
      }
      if (gun) {
        // Le pistolet garde l'orientation du tronc quelle que soit la pose du bras ; le recul le recule.
        root.updateMatrixWorld(true);
        arms.R.wrist.getWorldQuaternion(qHand);
        torso.getWorldQuaternion(qTorso);
        rotXYZ.copy(qHand).invert().multiply(qTorso).multiply(gunBase);
        gun.quaternion.copy(rotXYZ);
      }
    },
  };
}
