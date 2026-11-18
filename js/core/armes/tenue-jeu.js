// Lot 9e — Tenue des armes sur le personnage de la partie (pur : sans Three.js, DOM, horloge ni hasard). Les poses du lot 9c
// (data/armes/poses.json) placent l'arme dans le repère du personnage, sur une instance au corps long en pose « repos » (phase 0,25) ; ici la
// même pose est recalculée par la cinématique directe pure (character-parts.js, pose-v2.js, gabarit.js) pour exprimer l'arme dans le repère de
// l'os chest : en partie, l'arme est accrochée à cet os et suit le buste (marche, recul), bras aux angles de la pose de tenue.
import { applyAffine, jointMatrices, jointsOf } from '../character-parts.js';
import { echellesCorps, rigCorps, varianteCorps } from '../gabarit.js';
import { poseAt, rigOf } from '../pose-v2.js';
import { resolveVariant } from '../persos-variants.js';
import { isNum, num } from '../vec.js';
import { matriceRotation } from './geometrie.js';

// Os dont la pose de tenue impose les angles (tronc et bras ; jambes et bassin restent ceux de l'animation).
export const OS_TENUE = Object.freeze(['spine', 'chest', 'neck', 'head', 'shoulderL', 'elbowL', 'wristL', 'shoulderR', 'elbowR', 'wristR']);
const obj = (v) => (v !== null && typeof v === 'object' && !Array.isArray(v) ? v : {});

const transpose = (m) => [m[0], m[3], m[6], m[1], m[4], m[7], m[2], m[5], m[8]];
const mul = (a, b) => [0, 1, 2].flatMap((r) => [0, 1, 2].map((c) => a[r * 3] * b[c] + a[r * 3 + 1] * b[3 + c] + a[r * 3 + 2] * b[6 + c]));

// Tenue d'une arme : { angles (os de OS_TENUE), local: { m (3 × 3, lignes), t } (arme dans le repère de l'os chest), position (repère du
// personnage), pivot (épaule droite dans le repère de l'os chest : l'arme s'abaisse autour d'elle) } ou null (arme ou mode absents). variant : variante du joueur (characters-v2.json, avant résolution) ; corps : corps long.
export function tenueArme({ variant, skeletons, posesV2, posesArmes, id, mode = 'deux-mains', corps }) {
  const m = obj(obj(obj(obj(posesArmes).armes)[id]).modes)[mode];
  if (!m || !obj(m.arme).position) return null;
  const res = varianteCorps(resolveVariant(variant, {}), corps);
  const joints = jointsOf(res, skeletons);
  const pose = poseAt(rigCorps(rigOf(res, skeletons), corps), 'repos', 0.25, {}, posesV2);
  const angles = {};
  for (const os of OS_TENUE) if (Array.isArray(obj(m.angles)[os])) angles[os] = m.angles[os].map((a) => num(a));
  const posee = { angles: { ...pose.angles, ...angles }, offsets: pose.offsets, scales: { ...pose.scales, ...echellesCorps(corps) } };
  const scale = isNum(res.scale) && res.scale > 0 ? res.scale : 1;
  const chest = jointMatrices(joints, posee, scale).chest;
  const P = m.arme.position.map((v) => num(v));
  const R = matriceRotation(Array.isArray(m.arme.rotation) ? m.arme.rotation : [0, 0, 0]); // degrés, comme les pièces des armes (lot 9c)
  const inv = transpose(chest.m); // rotation pure (aucune échelle sur le tronc)
  const d = [P[0] - chest.t[0], P[1] - chest.t[1], P[2] - chest.t[2]];
  const t = applyAffine({ m: inv, t: [0, 0, 0] }, d);
  const epaule = joints.find((j) => j.id === 'shoulderR')?.offset ?? [0, 0, 0];
  return { angles, local: { m: mul(inv, R), t }, position: P, rotation: R, pivot: [...epaule] };
}

// Bouche du canon devant le centre du joueur (logique : distance le long de la visée) : avant de la pose (z) + point le plus avancé du canon.
export const boucheDevant = (tenue, pointe) => num(tenue?.position?.[2]) + num(pointe?.[2]);

// Retour du propriétaire après le lot 9e (« les balles ne partent pas du canon ») : bout du canon dans le repère du personnage (position de
// la pose + rotation de l'arme × pointe) → { avant (z, le long de la visée), cote (x du repère du personnage), hauteur }.
// La logique fait partir balle et laser de ce point (muzzlePoint de js/core/combat.js), comme le bout du canon dessiné.
export function boucheCanon(tenue, pointe) {
  const P = Array.isArray(tenue?.position) ? tenue.position : [0, 0, 0];
  const R = Array.isArray(tenue?.rotation) && tenue.rotation.length === 9 ? tenue.rotation : [1, 0, 0, 0, 1, 0, 0, 0, 1];
  const q = [num(pointe?.[0]), num(pointe?.[1]), num(pointe?.[2])];
  const tip = [0, 1, 2].map((r) => num(P[r]) + R[r * 3] * q[0] + R[r * 3 + 1] * q[1] + R[r * 3 + 2] * q[2]);
  return { avant: tip[2], cote: tip[0], hauteur: tip[1] };
}

// Pointe du canon d'un maillage d'arme (positions à plat, repère de l'arme) : le point le plus avancé (z) parmi ceux proches de l'axe du canon
// (|y| ≤ 4, |x| ≤ 4 : le bipied du BAR, plus long, est écarté).
export function pointeCanon(positions) {
  let best = null;
  for (let i = 0; i + 2 < (positions?.length ?? 0); i += 3) {
    const x = positions[i];
    const y = positions[i + 1];
    const z = positions[i + 2];
    if (Math.abs(y) > 4 || Math.abs(x) > 4) continue;
    if (best === null || z > best[2]) best = [x, y, z];
  }
  return best ?? [0, 0, 0];
}
