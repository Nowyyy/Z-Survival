// Poses des personnages du lot 3j : angles d'Euler ('YXZ') de chaque articulation, purement visuels, sans horloge (le temps arrive en
// argument). fromV1 traduit une sortie de computePose (js/core/pose.js) en angles du squelette v1 exactement comme setPose de
// js/game/character.js (sans l'arme) ; les animations v2 sont ajoutées à ce module.
import { isNum } from './vec.js';

// Squelette actuel (js/game/skeleton.js) : longueurs utilisées par setPose.
export const V1 = { THIGH: 12, SHIN: 11.5, FOOT: 3.5, LEG: 27, HEAD_TILT: [-0.6, 0.8], SHOULDER: [-0.9, 1.7] };
const num = (v, d = 0) => (isNum(v) ? v : d);
const clamp = (v, [lo, hi]) => Math.min(hi, Math.max(lo, v));

// pose : sortie de computePose ; traits : { lean (inclinaison de base du tronc), headTilt, armLift } de la variante actuelle.
// Renvoie { angles: { joint: [x, y, z] }, offsets: { pelvis: [0, dy, 0] } } pour le squelette v1 (pelvis à 27 au repos).
export function fromV1(pose, traits = {}) {
  const p = pose !== null && typeof pose === 'object' ? pose : {};
  const t = traits !== null && typeof traits === 'object' ? traits : {};
  const angles = {};
  let lowest = 0;
  for (const s of ['L', 'R']) {
    const hip = num(p[`hip${s}`]);
    const knee = num(p[`knee${s}`]);
    angles[`hip${s}`] = [-hip, 0, 0];
    angles[`knee${s}`] = [knee, 0, 0];
    lowest = Math.max(lowest, V1.THIGH * Math.cos(hip) + V1.SHIN * Math.cos(hip - knee) + V1.FOOT);
  }
  const pelvisY = Math.max(0, lowest + num(p.bob) * 0.8 + num(p.pelvisHeight) * V1.LEG);
  angles.torso = [num(t.lean) + num(p.torsoPitch), -num(p.torsoTwist), 0];
  angles.head = [clamp(num(p.headTilt) + num(t.headTilt), V1.HEAD_TILT), 0, 0];
  for (const [s, side] of [['L', 1], ['R', -1]]) {
    angles[`shoulder${s}`] = [-clamp(num(p[`shoulder${s}`]) + num(t.armLift), V1.SHOULDER), -side * num(p[`inward${s}`]), 0];
    angles[`elbow${s}`] = [-num(p[`elbow${s}`]), 0, 0];
  }
  return { angles, offsets: { pelvis: [0, pelvisY - V1.LEG, 0] } };
}
