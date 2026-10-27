// Personnage articulé : bassin, tronc, tête, bras (haut ; avant-bras avec main), jambes (cuisse ; jambe avec botte), arme tenue en
// main droite (joueur). Une seule pièce par segment de membre (12 pièces au plus), formes arrondies (capsules, sphères simplifiées),
// géométries et matériaux partagés par tous les personnages et jamais recréés à chaque image. Le personnage regarde vers +Z local.
// Les textures viennent de l'atlas de personnages (régions de data/game/textures.json) : une géométrie par tenue et par variante.
import * as THREE from 'three';
import { LIMITS } from '../core/pose.js';
import { FOOT, FORE, HAND, HIP_X, SHIN, SHOULDER_X, THIGH, UPPER } from './skeleton.js';

const ATLAS = 'atlas-persos';
const LEG = THIGH + SHIN + FOOT;
const RADIAL = 8; // segments radiaux au plus (tronc, bassin, tête)
const LIMB = 6; // segments radiaux des membres

// Pièces qui projettent une ombre : seulement les principales (bassin, tronc, tête, cuisses).
const CASTERS = new Set(['pelvis', 'torso', 'head', 'thigh']);

const clampTo = (value, [lo, hi]) => Math.min(Math.max(value, lo), hi);

// Fusionne des morceaux { geometry (déjà placée), rect (région d'atlas) } en une seule géométrie non indexée.
function merge(parts) {
  const positions = [];
  const normals = [];
  const uvs = [];
  for (const { geometry, rect } of parts) {
    const g = geometry.index ? geometry.toNonIndexed() : geometry;
    positions.push(...g.attributes.position.array);
    normals.push(...g.attributes.normal.array);
    const uv = g.attributes.uv.array;
    for (let i = 0; i < uv.length; i += 2) uvs.push(rect.u0 + uv[i] * (rect.u1 - rect.u0), rect.v0 + uv[i + 1] * (rect.v1 - rect.v0));
    if (g !== geometry) g.dispose();
    geometry.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  out.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  out.computeBoundingSphere();
  return out;
}

// Capsule d'axe vertical, de hauteur totale `height` (pivot en haut : le centre est à -height / 2), rayon r, étirée en (sx, sz).
const capsule = (r, height, { y = -height / 2, sx = 1, sz = 1, caps = 1, radial = RADIAL } = {}) => new THREE.CapsuleGeometry(r, Math.max(0.01, height - 2 * r), caps, radial).scale(sx, 1, sz).translate(0, y, 0);
const sphere = (rx, ry, rz, x, y, z, w = 7, h = 5) => new THREE.SphereGeometry(1, w, h).scale(rx, ry, rz).translate(x, y, z);
const box = (w, h, d, x, y, z) => new THREE.BoxGeometry(w, h, d).translate(x, y, z);

// Jeu de géométries d'un personnage. style : { outfit, trousers, boot, hair?, skin, gun?, sleeves } (identifiants de régions).
function buildGeometries(style, rect) {
  const r = (id) => rect(id);
  const part = (geometry, id) => ({ geometry, rect: r(id) });
  const geo = {
    pelvis: merge([part(capsule(3.6, 15, { y: 1.5, sx: 1, sz: 0.62, caps: 1, radial: RADIAL }).rotateZ(Math.PI / 2), style.trousers)]),
    torso: merge([part(capsule(5, 19, { y: 9.5, sx: 1.85, sz: 1, caps: 2 }), style.outfit)]),
    head: merge([
      part(sphere(4.7, 5.2, 4.9, 0, 5.4, 0, 8, 5), style.skin),
      ...(style.hair ? [part(sphere(5, 3, 5.2, 0, 8.2, -0.3, 8, 3), style.hair)] : []),
    ]),
    upper: merge([part(capsule(2.5, UPPER, { caps: 1, radial: LIMB }), style.outfit)]),
    fore: merge([part(capsule(2.1, FORE + 1, { y: -(FORE + 1) / 2, caps: 1, radial: LIMB }), style.sleeves), part(sphere(2.3, HAND / 2 + 0.3, 2.3, 0, -FORE - HAND / 2 + 0.6, 0.3, 6, 4), style.skin)]),
    thigh: merge([part(capsule(3.2, THIGH + 1, { y: -(THIGH + 1) / 2 + 0.5, caps: 1, radial: LIMB }), style.trousers)]),
    shin: merge([part(capsule(2.6, SHIN + 1, { y: -(SHIN + 1) / 2 + 0.5, caps: 1, radial: LIMB }), style.trousers), part(sphere(3.3, FOOT / 2 + 0.4, 5.6, 0, -SHIN - FOOT / 2 + 0.3, 2.2, 6, 4), style.boot)]),
  };
  if (style.gun) geo.gun = merge([part(box(2.8, 8.5, 3.4, 0, -5.4, 1.4), style.gun), part(box(2.8, 3, 4.2, 0, -2.4, -1.6), style.gun)]);
  return geo;
}

// textures : sortie de createThreeTextures ; variants : data/game/zombie-variants.json.
export function createKit({ textures, variants, hit }) {
  const rect = (id) => textures.region(ATLAS, id);
  const bodyMaterial = new THREE.MeshLambertMaterial({ map: textures.texture(ATLAS) });
  const { player, zombie } = variants;
  return {
    geo: {
      player: buildGeometries({ outfit: player.outfit, trousers: player.trousers, boot: player.boot, hair: player.hair, skin: player.skin, gun: player.gun, sleeves: player.outfit }, rect),
      zombies: zombie.variants.map((v) => buildGeometries({ outfit: v.outfit, trousers: v.trousers, boot: zombie.boot, skin: v.skin, sleeves: v.skin }, rect)),
    },
    variants: zombie.variants,
    mat: {
      body: bodyMaterial,
      // Flash d'un ennemi touché : tout le corps passe à cette couleur (insensible à la lumière).
      hit: new THREE.MeshBasicMaterial({ color: hit }),
    },
  };
}

const rotXYZ = new THREE.Quaternion();
const gunBase = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0));
const qHand = new THREE.Quaternion();
const qTorso = new THREE.Quaternion();
const gunWorld = new THREE.Vector3();

// kind : 'player' (arme tenue en main) ou 'zombie' (bras tendus, tête penchée, pas d'arme) ; variant : indice dans zombie-variants.json.
export function createCharacter(kit, kind, variant = 0) {
  const traits = kind === 'zombie' ? kit.variants[variant % kit.variants.length] : { scale: 1, headTilt: 0, armLift: 0 };
  const g = kind === 'zombie' ? kit.geo.zombies[variant % kit.geo.zombies.length] : kit.geo.player;
  const base = kit.mat.body;
  const meshes = [];
  const part = (name, parent) => {
    const mesh = new THREE.Mesh(g[name], base);
    mesh.castShadow = CASTERS.has(name);
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
  root.scale.setScalar(traits.scale);
  const pelvis = group(root, 0, LEG, 0);
  part('pelvis', pelvis);
  const torso = group(pelvis, 0, 4, 0);
  const lean = kind === 'zombie' ? 0.14 : 0; // inclinaison de base des zombies ; pose.torsoPitch s'y ajoute
  torso.rotation.x = lean;
  let applied = { pelvisHeight: 0, torsoPitch: 0 };
  part('torso', torso);
  const head = group(torso, 0, 19, 0);
  part('head', head);

  const legs = {};
  const arms = {};
  for (const [name, side] of [['L', 1], ['R', -1]]) {
    const hip = group(pelvis, side * HIP_X, 0, 0);
    part('thigh', hip);
    const knee = group(hip, 0, -THIGH, 0);
    const ankle = group(knee, 0, 0, 0);
    part('shin', knee);
    legs[name] = { hip, knee, ankle };

    const shoulder = group(torso, side * SHOULDER_X, 17, 0);
    part('upper', shoulder);
    const elbow = group(shoulder, 0, -UPPER, 0);
    part('fore', elbow);
    const wrist = group(elbow, 0, -FORE, 0);
    arms[name] = { shoulder, elbow, wrist, side };
  }

  // Pistolet : tenu par la main droite, porté dans l'axe du tronc (soutenu par la main gauche qui le rejoint).
  let gun = null;
  if (kind === 'player') {
    gun = part('gun', arms.R.wrist);
    gun.castShadow = false;
    gun.position.set(0, -1, 0);
  }

  return {
    root,
    kind,
    variant,
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
      // Lot 2 : bassin (hauteur réelle et abaissement demandé) et inclinaison du tronc en plus de celle de base.
      out.pelvisY = pelvis.position.y;
      out.pelvisHeight = applied.pelvisHeight;
      out.torsoPitch = torso.rotation.x - lean;
      return out;
    },
    // Flash de l'ennemi touché : les matériaux partagés sont échangés, rien n'est créé.
    setFlash(on) {
      for (const mesh of meshes) mesh.material = on ? kit.mat.hit : base;
    },
    // pose : sortie de computePose(). Pose les angles (plus l'écart de posture de la variante), puis pose le bassin sur le pied le plus bas.
    setPose(pose) {
      let lowest = 0;
      for (const name of ['L', 'R']) {
        const hipAngle = pose[`hip${name}`];
        const kneeAngle = pose[`knee${name}`];
        legs[name].hip.rotation.x = -hipAngle;
        legs[name].knee.rotation.x = kneeAngle;
        lowest = Math.max(lowest, THIGH * Math.cos(hipAngle) + SHIN * Math.cos(hipAngle - kneeAngle) + FOOT);
      }
      // pelvisHeight : abaissement du bassin en longueurs de jambe (rampe) ; torsoPitch : tronc penché vers l'avant (radians).
      applied = { pelvisHeight: pose.pelvisHeight, torsoPitch: pose.torsoPitch };
      pelvis.position.y = Math.max(0, lowest + pose.bob * 0.8 + pose.pelvisHeight * LEG);
      torso.rotation.x = lean + pose.torsoPitch;
      torso.rotation.y = -pose.torsoTwist;
      head.rotation.x = clampTo(pose.headTilt + traits.headTilt, LIMITS.headTilt);
      for (const name of ['L', 'R']) {
        const arm = arms[name];
        arm.shoulder.rotation.y = -arm.side * pose[`inward${name}`];
        arm.shoulder.rotation.x = -clampTo(pose[`shoulder${name}`] + traits.armLift, LIMITS[`shoulder${name}`]);
        arm.elbow.rotation.x = -pose[`elbow${name}`];
      }
      if (gun) {
        // Le pistolet garde l'orientation du tronc quelle que soit la pose du bras ; le recul le recule.
        root.updateMatrixWorld(true);
        arms.R.wrist.getWorldQuaternion(qHand);
        torso.getWorldQuaternion(qTorso);
        rotXYZ.copy(qHand).invert().multiply(qTorso).multiply(gunBase);
        gun.quaternion.copy(rotXYZ);
        // Le laser et la balle partent de l'axe de visée (le milieu du tronc) : le pistolet, tenu à deux mains, est ramené sur cet axe.
        gun.position.set(0, -1, 0);
        root.updateMatrixWorld(true);
        gun.getWorldPosition(gunWorld);
        torso.worldToLocal(gunWorld);
        gunWorld.x = 0;
        torso.localToWorld(gunWorld);
        arms.R.wrist.worldToLocal(gunWorld);
        gun.position.copy(gunWorld);
      }
    },
  };
}
