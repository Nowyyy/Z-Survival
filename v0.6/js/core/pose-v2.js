// Poses des personnages du lot 3j : angles d'Euler ('YXZ' de Three.js) de chaque articulation du squelette v2, purement visuels, sans
// horloge (la phase arrive en argument). Conventions (data/game/poses-v2.json) : x positif = jambe ou bras vers l'arrière, colonne et tête
// vers l'avant, genou plié ; coude : x négatif = avant-bras plié vers l'avant ; z positif = bras gauche écarté.
// La marche et la course placent le pied d'appui par cinématique inverse : il ne glisse pas (sa vitesse au sol est nulle tant que la
// foulée est atteignable). fromV1 traduit une sortie de computePose (js/core/pose.js) en angles du squelette v1, comme setPose de
// js/game/character.js (sans l'arme). Aucune fonction ne lève d'exception ni ne modifie ses arguments.
import { isNum } from './vec.js';
import { jointMatricesOverInto, jointsOf } from './character-parts.js';

// --- Squelette actuel ------------------------------------------------------------------------------------------------------------------
export const V1 = { THIGH: 12, SHIN: 11.5, FOOT: 3.5, LEG: 27, HEAD_TILT: [-0.6, 0.8], SHOULDER: [-0.9, 1.7] };
const num = (v, d = 0) => (isNum(v) ? v : d);
const clamp = (v, [lo, hi]) => Math.min(hi, Math.max(lo, v));
const obj = (v) => (v !== null && typeof v === 'object' && !Array.isArray(v) ? v : {});
const TAU = Math.PI * 2;
const frac = (p) => p - Math.floor(p);

// pose : sortie de computePose ; traits : { lean (inclinaison de base du tronc), headTilt, armLift } de la variante actuelle.
// Renvoie { angles: { joint: [x, y, z] }, offsets: { pelvis: [0, dy, 0] } } pour le squelette v1 (pelvis à 27 au repos).
export function fromV1(pose, traits = {}) {
  const p = obj(pose);
  const t = obj(traits);
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

// --- Animations v2 ---------------------------------------------------------------------------------------------------------------------
export const ZOMBIE_ANIMS = ['attente', 'marcheLente', 'marche', 'rampe', 'course', 'arracher', 'escalade', 'enjamber', 'attaque', 'touche', 'mortAvant', 'mortArriere', 'effondrement', 'escalier'];
export const PLAYER_ANIMS = ['repos', 'marche', 'tir', 'touche', 'terre', 'relevage', 'reparation'];
export const DEATHS = ['mortAvant', 'mortArriere', 'effondrement'];
// Animations cycliques (phase 0 = phase 1) ; les autres (morts, relevage) vont de 0 à 1 une seule fois ; touché est additif.
export const CYCLIC = ['attente', 'marcheLente', 'marche', 'rampe', 'course', 'arracher', 'escalade', 'attaque', 'escalier', 'repos', 'tir', 'terre', 'reparation'];
// Marches à pied d'appui (glissement mesuré).
export const LOCOMOTION = ['marcheLente', 'marche', 'course', 'escalier'];

// Gabarit d'une variante : longueurs des segments, écart des hanches et des épaules, hauteur de la semelle, style, posture de base.
export function rigOf(variant, skeletons) {
  const v = obj(variant);
  const joints = jointsOf(v, skeletons);
  const off = (id) => joints.find((j) => j.id === id)?.offset ?? [0, 0, 0];
  const len = (o) => Math.hypot(o[0], o[1], o[2]);
  const thigh = len(off('kneeL')) || 12;
  const shin = len(off('ankleL')) || 11.5;
  const sole = num(v.sole, 3.5);
  return {
    joints,
    kind: v.kind === 'player' ? 'player' : 'zombie',
    style: ['A', 'B', 'C'].includes(v.style) ? v.style : 'A',
    scale: num(v.scale, 1) > 0 ? num(v.scale, 1) : 1,
    thigh,
    shin,
    sole,
    upper: len(off('elbowL')) || 10,
    fore: len(off('wristL')) || 9,
    shoulder: off('shoulderL'),
    standing: thigh + shin + sole,
    pelvisY: off('pelvis')[1] || thigh + shin + sole,
    posture: obj(v.posture),
    contacts: Array.isArray(v.contacts) ? v.contacts : [],
  };
}

// --- Lot 5d : poses sans allocation ----------------------------------------------------------------------------------------------------
// Une pose reste { angles: { joint: [x, y, z] }, offsets: { joint: [dx, dy, dz] }, scales: { joint: s } }. Les variantes « Into » (poseAtInto,
// blendPosesInto, addPoseInto, toucheInto, copyPoseInto) écrivent dans une pose de l'appelant créée par createPose() (tableaux réutilisés,
// gardés sous une clé symbole, invisible de Object.keys) et utilisent un espace de travail createPoseWork() (poses intermédiaires, matrices,
// cinématique inverse) : les deux appartiennent à l'appelant (un personnage), jamais partagés ; le résultat n'est valable que jusqu'au
// prochain appel avec les mêmes tampons. Dans une pose « Into », une articulation absente vaut undefined (la clé peut rester) : c'est ce que
// lisent character-v2.js (setAngles : rotation nulle, décalage nul, échelle 1) et les variantes Into (articulation absente = zéro, échelle 1),
// exactement comme une articulation absente de l'ancien résultat. Sans tampon, chaque fonction renvoie comme avant un objet neuf, identique
// (clés, ordre et nombres) à l'ancien. Mêmes opérations, dans le même ordre, que l'ancien code : tests/unit/poses-identite.test.js contre
// tests/unit/helpers/oracle/pose-v2.oracle.js. Aucun état dans le module (seulement des tables figées).
const POOL = Symbol('tableaux réutilisés');
const clamp2 = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const ZERO3 = Object.freeze([0, 0, 0]);
const DEF_ARM = Object.freeze([0.6, 0.2, 0.3]);
const DEF_ARMS = Object.freeze([0.6, 0.4]);
const DEF_PROP = Object.freeze([-1.5, -4, 13]);
const sided = (id) => Object.freeze({ L: `${id}L`, R: `${id}R` });
const NAME = Object.freeze({ hip: sided('hip'), knee: sided('knee'), ankle: sided('ankle'), shoulder: sided('shoulder'), elbow: sided('elbow'), arm: sided('arm') });

// Pose réutilisable (Into) et espace de travail d'un appelant.
export function createPose() {
  return { angles: {}, offsets: {}, scales: {}, [POOL]: { a: {}, o: {} } };
}
export function createPoseWork() {
  return { pool: true, p: [createPose(), createPose(), createPose()], ik: [0, 0, 0], arm: [0, 0, 0], mats: {}, matsJoints: null };
}
// Espace de travail d'un appel sans tampon : poses intermédiaires neuves (comme l'ancien code), matrices neuves.
const freshWork = () => ({ pool: false, p: null, ik: [0, 0, 0], arm: [0, 0, 0], mats: null, matsJoints: null });
const blankPose = () => ({ angles: {}, offsets: {}, scales: {} });
// Vide une pose réutilisable (toutes ses articulations deviennent absentes) ; une pose neuve est déjà vide.
function clearPose(pose) {
  if (pose[POOL] === undefined) return pose;
  for (const id in pose.angles) pose.angles[id] = undefined;
  for (const id in pose.offsets) pose.offsets[id] = undefined;
  for (const id in pose.scales) pose.scales[id] = undefined;
  return pose;
}
const temp = (work, i) => (work.pool ? clearPose(work.p[i]) : blankPose());
function setA(pose, id, x, y, z) {
  const pool = pose[POOL];
  if (pool === undefined) {
    pose.angles[id] = [x, y, z];
    return;
  }
  let a = pool.a[id];
  if (a === undefined) {
    a = [0, 0, 0];
    pool.a[id] = a;
  }
  a[0] = x;
  a[1] = y;
  a[2] = z;
  pose.angles[id] = a;
}
function setO(pose, id, x, y, z) {
  const pool = pose[POOL];
  if (pool === undefined) {
    pose.offsets[id] = [x, y, z];
    return;
  }
  let a = pool.o[id];
  if (a === undefined) {
    a = [0, 0, 0];
    pool.o[id] = a;
  }
  a[0] = x;
  a[1] = y;
  a[2] = z;
  pose.offsets[id] = a;
}
const sideSetA = (pose, id, s, side, x, y, z) => setA(pose, NAME[id][s], x, side * y, side * z);

// Paramètres : { amplitude, rythme, lourdeur } (pas des macros, −2 à 2), stride (foulée en unités du monde), twist (torsion du tronc vers
// la visée, joueur), recoil (0 à 1), repairTime (secondes par planche), seed. data : poses-v2.json.
const macro = (params, data, id) => num(obj(params)[id]) * num(obj(obj(data.macros)[id]).step, 0);
const styleOf = (rig, data, key) => obj(obj(obj(data.styles)[rig.style])[key]);
const ease = (t) => 0.5 - 0.5 * Math.cos(Math.PI * clamp2(t, 0, 1));

// Cinématique inverse plane d'une jambe : cible de la cheville (dy vers le bas négatif, dz vers l'avant) depuis la hanche.
// Écrit [hanche, genou, cheville] (x) dans o, pied à plat.
function legTo(o, rig, dy, dz) {
  const T = rig.thigh;
  const S = rig.shin;
  const d = clamp2(Math.hypot(dy, dz), Math.abs(T - S) + 1e-6, (T + S) * 0.9999);
  const dir = Math.atan2(-dz, -dy);
  const alpha = Math.acos(clamp2((T * T + d * d - S * S) / (2 * T * d), -1, 1));
  const gamma = Math.acos(clamp2((T * T + S * S - d * d) / (2 * T * S), -1, 1));
  const hip = dir - alpha;
  const knee = Math.PI - gamma;
  o[0] = hip;
  o[1] = knee;
  o[2] = clamp2(-(hip + knee), -1.15, 1.15);
  return o;
}

// Cinématique inverse d'un bras (épaule à l'origine, repère de la poitrine) vers une cible (t0, t1, t2) : écrit dans o [phi, psi, e]
// (épaule [phi, psi, 0], coude [-e, 0, 0]).
function armTo(o, upper, fore, t0, t1, t2) {
  const d = clamp2(Math.hypot(t0, t1, t2), Math.abs(upper - fore) + 1e-6, (upper + fore) * 0.9999);
  const e = Math.PI - Math.acos(clamp2((upper * upper + fore * fore - d * d) / (2 * upper * fore), -1, 1));
  const A = upper + fore * Math.cos(e);
  const B = fore * Math.sin(e);
  const delta = Math.atan2(B, A);
  const c = clamp2(-t1 / d, -1, 1);
  const phi = delta - Math.acos(c);
  const zz = -A * Math.sin(phi) + B * Math.cos(phi);
  const psi = zz >= 0 ? Math.atan2(t0, t2) : Math.atan2(-t0, -t2);
  o[0] = phi;
  o[1] = psi;
  o[2] = e;
  return o;
}
// Cinématique inverse d'un bras vers une cible t : [épaule [x, y, z], coude [x, 0, 0]] (tableaux neufs).
export function armIK(upper, fore, t) {
  const o = armTo([0, 0, 0], upper, fore, t[0], t[1], t[2]);
  return [[o[0], o[1], 0], [-o[2], 0, 0]];
}

// Posture de base de la variante (voûté, tête enfoncée...) ajoutée au tronc et à la tête.
// Les bras restent pendants : l'inclinaison ajoutée au tronc est compensée aux épaules (aux 3/10 ; x négatif = bras vers l'avant ; posture à moitié pendant l'attaque).
function applyPosture(rig, pose, k = 1) {
  let pitch = 0;
  const posture = rig.posture;
  for (const id in posture) {
    if (!has(posture, id)) continue;
    const a = posture[id];
    if (!Array.isArray(a)) continue;
    const cur = pose.angles[id];
    const live = cur !== undefined && cur !== null;
    setA(pose, id, (live ? cur[0] : 0) + num(a[0]) * k, (live ? cur[1] : 0) + num(a[1]) * k, (live ? cur[2] : 0) + num(a[2]) * k);
    if (id === 'spine' || id === 'chest') pitch += num(a[0]) * k;
  }
  for (let i = 0; i < 2; i += 1) {
    const id = i === 0 ? 'shoulderL' : 'shoulderR';
    const cur = pose.angles[id];
    if (cur) setA(pose, id, cur[0] - 0.3 * pitch, cur[1], cur[2]);
  }
}

// Bras pendants ou tendus selon le style : [avant, balancement, coude] ; p : phase du balancement.
function zombieArms(rig, pose, st, p, amp) {
  for (let i = 0; i < 2; i += 1) {
    const s = i === 0 ? 'L' : 'R';
    const side = i === 0 ? 1 : -1;
    const off = i === 0 ? 0 : 0.5;
    const a = st[NAME.arm[s]] ?? DEF_ARM;
    const swing = num(a[1]) * amp * Math.sin(TAU * (p + off));
    sideSetA(pose, 'shoulder', s, side, -(num(a[0]) + swing), -num(st.inward) * 0.6, num(st.out));
    sideSetA(pose, 'elbow', s, side, -(num(a[2]) + 0.1 * amp * Math.max(0, Math.sin(TAU * (p + off)))), 0, 0);
  }
}

// Foulée effective de poseAt pour les marches : celle de { stride: défaut, ...params } (params.stride s'il est une propriété propre énumérable).
const mergedStride = (params, fallback) => (params !== null && typeof params === 'object' && Object.prototype.propertyIsEnumerable.call(params, 'stride') ? params.stride : fallback);

// Marche, course, escalier : foulée en unités du monde, phase en cycles (distance / foulée). strideV : foulée demandée (params.stride).
function locomote(pose, work, rig, phase, params, data, key, strideV) {
  const st = styleOf(rig, data, key === 'player' || key === 'escalier' ? 'walk' : key);
  const pl = key === 'player' ? styleOf(rig, data, 'player') : null;
  const heavy = macro(params, data, 'lourdeur');
  const amp = 1 + macro(params, data, 'amplitude');
  const duty = clamp2(num(pl?.duty ?? st.duty, 0.55), 0.3, 0.8);
  const lift = Math.max(0.5, num(pl?.lift ?? st.lift, 3) * (1 - 0.12 * heavy) * (key === 'escalier' ? 1.6 : 1));
  const crouch = Math.max(0, num(pl?.crouch ?? st.crouch, 0.5) + 1.2 * heavy);
  const stride = Math.max(1, num(strideV, num(obj(data.strides)[key === 'player' ? 'joueur' : key === 'run' ? 'course' : 'marche'], 52))) / rig.scale;
  const S = duty * stride;
  const reach = (rig.thigh + rig.shin) * 0.985;
  // Pieds L (décalage 0) puis R (0,5) : position avant z et hauteur y.
  let zL = 0;
  let yL = 0;
  let zR = 0;
  let yR = 0;
  for (let i = 0; i < 2; i += 1) {
    const pf = frac(phase + (i === 0 ? 0 : 0.5));
    let z;
    let y;
    if (pf < duty) {
      z = S / 2 - (pf / duty) * S;
      y = 0;
    } else {
      const u = (pf - duty) / (1 - duty);
      z = -S / 2 + S * ease(u);
      y = lift * Math.sin(Math.PI * u);
    }
    if (i === 0) {
      zL = z;
      yL = y;
    } else {
      zR = z;
      yR = y;
    }
  }
  let h = rig.standing;
  h = Math.min(h, yL + rig.sole + Math.sqrt(Math.max(0, reach * reach - zL * zL)));
  h = Math.min(h, yR + rig.sole + Math.sqrt(Math.max(0, reach * reach - zR * zR)));
  h -= crouch;
  for (let i = 0; i < 2; i += 1) {
    const s = i === 0 ? 'L' : 'R';
    const side = i === 0 ? 1 : -1;
    const ik = legTo(work.ik, rig, (i === 0 ? yL : yR) + rig.sole - h, i === 0 ? zL : zR);
    const hip = ik[0];
    const knee = ik[1];
    const ankle = ik[2];
    sideSetA(pose, 'hip', s, side, hip, 0, 0);
    sideSetA(pose, 'knee', s, side, knee, 0, 0);
    sideSetA(pose, 'ankle', s, side, ankle, 0, 0);
  }
  setO(pose, 'pelvis', 0, h - rig.pelvisY, 0);
  const jerk = num(st.jerk);
  const pu = phase + (jerk / (2 * TAU)) * Math.sin(2 * TAU * phase);
  const bob = Math.sin(2 * TAU * pu);
  const pitch = num(pl?.pitch ?? st.pitch) + 0.04 * heavy;
  setA(pose, 'spine', pitch * 0.6 + 0.02 * amp * bob, -num(obj(params).twist) * 0.6 + num(st.twist) * amp * Math.sin(TAU * pu) * (key === 'player' ? 0.3 : 1), 0);
  setA(pose, 'chest', pitch * 0.4 - (key === 'player' ? KICK[3] * kickOf(obj(params).recoil) : 0), -num(obj(params).twist) * 0.4, 0);
  setA(pose, 'neck', num(st.head) * 0.4, 0, 0);
  setA(pose, 'head', num(st.head) * 0.6 + 0.03 * amp * bob, 0, 0.03 * amp * Math.sin(TAU * pu));
  if (key === 'player') playerArms(rig, pose, num(obj(params).recoil), work);
  else zombieArms(rig, pose, st, pu, amp);
  if (key === 'escalier') {
    const sp = pose.angles.spine;
    setA(pose, 'spine', sp[0] + 0.15, sp[1], sp[2]);
  }
  return pose;
}

// Pistolet tenu à deux mains, bras tendus, centré sur l'axe de visée à hauteur de poitrine (articulation « prop ») : main droite sur la
// poignée, main gauche en soutien. Recul (recoil 1 au coup de feu, puis 0) : l'arme recule, remonte et se cabre (le canon se relève), les
// bras suivent. HOLD : position de l'arme dans le repère de la poitrine ; KICK : recul [haut, arrière, cabrage en radians] au plus fort.
export const HOLD = [-1, -1, 14];
export const KICK = [2.2, 3, 0.5, 0.3]; // [haut, arrière, cabrage, buste rejeté en arrière (rad) : le recul qui se voit de dessus]
const kickOf = (recoil) => {
  const k = clamp2(num(recoil), 0, 1);
  return k * k * (3 - 2 * k); // coup sec puis retour adouci
};
function playerArms(rig, pose, recoil, work) {
  let prop = DEF_PROP;
  const joints = rig.joints;
  for (let i = 0; i < joints.length; i += 1) {
    if (joints[i].id === 'prop') {
      prop = joints[i].offset ?? DEF_PROP;
      break;
    }
  }
  const r = kickOf(recoil);
  const at0 = HOLD[0];
  const at1 = HOLD[1] + KICK[0] * r;
  const at2 = HOLD[2] - KICK[1] * r;
  setO(pose, 'prop', at0 - prop[0], at1 - prop[1], at2 - prop[2]);
  setA(pose, 'prop', -KICK[2] * r, 0, 0);
  // Prises : R [at0, at1 - 2, at2 - 3], L [at0 + 1.5, at1 - 1, at2 - 0.5].
  const gR1 = at1 - 2;
  const gR2 = at2 - 3;
  const gL0 = at0 + 1.5;
  const gL1 = at1 - 1;
  const gL2 = at2 - 0.5;
  for (let i = 0; i < 2; i += 1) {
    const side = i === 0 ? 1 : -1;
    const sh0 = side * Math.abs(rig.shoulder[0]);
    const sh1 = rig.shoulder[1];
    const sh2 = rig.shoulder[2];
    const o = i === 0 ? armTo(work.arm, rig.upper, rig.fore, gL0 - sh0, gL1 - sh1, gL2 - sh2) : armTo(work.arm, rig.upper, rig.fore, at0 - sh0, gR1 - sh1, gR2 - sh2);
    const e = o[2];
    setA(pose, i === 0 ? 'shoulderL' : 'shoulderR', o[0], o[1], 0);
    setA(pose, i === 0 ? 'elbowL' : 'elbowR', -e, 0, 0);
  }
  pose.scales.prop = 1;
  pose.scales.tool = 0;
}

// Debout, pieds au sol : genoux un peu pliés ; le bassin est posé par groundLift.
function stand(rig, pose, knee = 0.1, spread = 0) {
  for (let i = 0; i < 2; i += 1) {
    const s = i === 0 ? 'L' : 'R';
    const side = i === 0 ? 1 : -1;
    sideSetA(pose, 'hip', s, side, -knee * 0.5, 0, spread);
    sideSetA(pose, 'knee', s, side, knee, 0, 0);
    sideSetA(pose, 'ankle', s, side, -knee * 0.5, 0, -spread);
  }
}

// Fondu de deux poses A, B (déjà passées par obj) écrit dans out, k borné ; strict : ancien comportement (toute clé propre compte, même de
// valeur undefined) ; sinon (Into) une valeur undefined est une articulation absente. Ordre des clés : celles de A, puis celles de B.
function blendGroup(out, angles, ga, gb, k, strict) {
  for (const id in ga) {
    if (!has(ga, id) || (!strict && ga[id] === undefined)) continue;
    blendOne(out, angles, id, ga[id], gb[id], k);
  }
  for (const id in gb) {
    if (!has(gb, id) || (!strict && gb[id] === undefined)) continue;
    if (has(ga, id) && (strict || ga[id] !== undefined)) continue;
    blendOne(out, angles, id, ga[id], gb[id], k);
  }
}
function blendOne(out, angles, id, xa, ya, k) {
  const x = Array.isArray(xa) ? xa : ZERO3;
  const y = Array.isArray(ya) ? ya : ZERO3;
  const v0 = num(x[0]) + (num(y[0]) - num(x[0])) * k;
  const v1 = num(x[1]) + (num(y[1]) - num(x[1])) * k;
  const v2 = num(x[2]) + (num(y[2]) - num(x[2])) * k;
  if (angles) setA(out, id, v0, v1, v2);
  else setO(out, id, v0, v1, v2);
}
function blendTo(out, A, B, k, strict) {
  blendGroup(out, true, obj(A.angles), obj(B.angles), k, strict);
  blendGroup(out, false, obj(A.offsets), obj(B.offsets), k, strict);
  const sa = obj(A.scales);
  const sb = obj(B.scales);
  for (const id in sa) {
    if (!has(sa, id) || (!strict && sa[id] === undefined)) continue;
    out.scales[id] = k < 0.5 ? num(sa[id], 1) : num(sb[id], 1);
  }
  for (const id in sb) {
    if (!has(sb, id) || (!strict && sb[id] === undefined)) continue;
    if (has(sa, id) && (strict || sa[id] !== undefined)) continue;
    out.scales[id] = k < 0.5 ? num(sa[id], 1) : num(sb[id], 1);
  }
  return out;
}

// Interpolation de clés (t0, p0), (t1, p1)… (n clés, triées, t de 0 à 1 ; fondu en cosinus) écrite dans out.
const pick5 = (i, a, b, c, d, e) => (i === 0 ? a : i === 1 ? b : i === 2 ? c : i === 3 ? d : e);
function keyedTo(out, t, n, t0, p0, t1, p1, t2, p2, t3, p3, t4, p4) {
  const k = clamp2(t, 0, 1);
  let i = 0;
  while (i < n - 2 && k > pick5(i + 1, t0, t1, t2, t3, t4)) i += 1;
  const j = Math.min(n - 1, i + 1);
  const at = pick5(i, t0, t1, t2, t3, t4);
  const bt = pick5(j, t0, t1, t2, t3, t4);
  const u = bt > at ? ease((k - at) / (bt - at)) : 0;
  return blendTo(out, pick5(i, p0, p1, p2, p3, p4), pick5(j, p0, p1, p2, p3, p4), clamp2(num(u), 0, 1), false);
}

// Point le plus bas des contacts (points et rayons de poses-v2.json, plus ceux des accessoires de la variante) pour la pose au bassin
// ramené à hauteur 0 ; mats : matrices de l'appelant (réutilisées, ou neuves pour un appel sans tampon).
function lowOf(rig, pose, data, mats) {
  const dc = Array.isArray(data.contacts) ? data.contacts : ZERO3;
  const rc = Array.isArray(rig.contacts) ? rig.contacts : ZERO3;
  const nd = dc === ZERO3 ? 0 : dc.length;
  const nr = rc === ZERO3 ? 0 : rc.length;
  const ox = num(pose.offsets?.pelvis?.[0]);
  const oz = num(pose.offsets?.pelvis?.[2]);
  const m = jointMatricesOverInto(mats, rig.joints, pose, 1, 'pelvis', ox, 0, oz);
  let low = Infinity;
  for (let i = 0; i < nd + nr; i += 1) {
    const c = i < nd ? dc[i] : rc[i - nd];
    const e = m[c?.joint];
    if (!e) continue;
    const off = Array.isArray(c.offset) ? c.offset : ZERO3;
    low = Math.min(low, e.m[3] * off[0] + e.m[4] * off[1] + e.m[5] * off[2] + e.t[1] - num(c.radius));
  }
  return low;
}
// Matrices de travail d'un rig (recréées seulement quand le squelette change).
function matsOf(work, rig) {
  if (!work.pool) return {};
  if (work.matsJoints !== rig.joints) {
    work.mats = {};
    work.matsJoints = rig.joints;
  }
  return work.mats;
}
// Contact au sol : décale le bassin pour que le point le plus bas touche y = 0 (dans la pose elle-même).
function liftTo(rig, pose, data, work) {
  const low = lowOf(rig, pose, data, matsOf(work, rig));
  if (!Number.isFinite(low)) return pose;
  setO(pose, 'pelvis', num(pose.offsets?.pelvis?.[0]), -low, num(pose.offsets?.pelvis?.[2]));
  return pose;
}
// Contact au sol (points et rayons de poses-v2.json, plus ceux des accessoires de la variante) : décale le bassin pour que le point le
// plus bas touche y = 0. Renvoie la pose elle-même si aucun contact ne compte, sinon une pose neuve.
export function groundLift(rig, pose, data) {
  const low = lowOf(rig, pose, data, {});
  if (!Number.isFinite(low)) return pose;
  const ox = num(pose.offsets?.pelvis?.[0]);
  const oz = num(pose.offsets?.pelvis?.[2]);
  return { ...pose, offsets: { ...pose.offsets, pelvis: [ox, -low, oz] } };
}

function attente(pose, rig, phase, params, data) {
  const st = styleOf(rig, data, 'idle');
  const amp = 1 + macro(params, data, 'amplitude');
  const sw = Math.sin(TAU * phase);
  stand(rig, pose, num(st.knee, 0.12) + 0.03 * amp * Math.sin(TAU * phase * 2), 0.06);
  setA(pose, 'spine', 0.1 + 0.04 * amp * sw, num(st.sway) * amp * sw, 0.03 * amp * sw);
  setA(pose, 'chest', 0.05, 0.5 * num(st.sway) * amp * sw, 0);
  setA(pose, 'neck', num(st.head) * 0.5, 0.15 * amp * Math.sin(TAU * phase + 1), 0);
  setA(pose, 'head', num(st.head) * 0.5 + 0.05 * amp * Math.sin(TAU * phase * 2), 0, 0);
  const arms = st.arms ?? DEF_ARMS;
  for (let i = 0; i < 2; i += 1) {
    const s = i === 0 ? 'L' : 'R';
    const side = i === 0 ? 1 : -1;
    const off = i === 0 ? 0 : 0.5;
    sideSetA(pose, 'shoulder', s, side, -(num(arms[0]) + 0.1 * amp * Math.sin(TAU * (phase + off))), -0.15, 0.1);
    sideSetA(pose, 'elbow', s, side, -(num(arms[1]) + 0.1 * amp * Math.sin(TAU * (phase + off) + 1)), 0, 0);
  }
  return pose;
}

function rampe(pose, rig, phase, params, data) {
  const st = styleOf(rig, data, 'crawl');
  const amp = 1 + macro(params, data, 'amplitude');
  const sw = Math.sin(TAU * phase);
  const lift = Math.cos(TAU * phase);
  setA(pose, 'pelvis', 0.55, 0, 0);
  for (let i = 0; i < 2; i += 1) {
    const s = i === 0 ? 'L' : 'R';
    const side = i === 0 ? 1 : -1;
    const off = i === 0 ? 0 : 0.5;
    const q = side * sw;
    sideSetA(pose, 'hip', s, side, 0.7 * num(st.legs, 1) - 0.2 * q * amp, 0, 0.1);
    sideSetA(pose, 'knee', s, side, 0.75 + 0.45 * amp * ((1 + side * lift) / 2) ** 2, 0, 0);
    sideSetA(pose, 'ankle', s, side, 0.6, 0, 0);
    const pull = ((1 + Math.sin(TAU * (phase + off))) / 2) ** 2;
    sideSetA(pose, 'shoulder', s, side, -(1.35 + 0.45 * amp * pull) * num(st.reach, 1), -0.2, 0.2);
    sideSetA(pose, 'elbow', s, side, -(0.35 + 0.6 * amp * (1 - pull)), 0, 0);
  }
  setA(pose, 'spine', 0.6, 0.15 * amp * sw, 0);
  setA(pose, 'chest', 0.3, 0.08 * amp * sw, 0);
  setA(pose, 'neck', num(st.head, -0.3), 0, 0);
  setA(pose, 'head', -0.15, 0.06 * Math.sin(TAU * phase * 2), 0);
  return pose;
}

function arracher(pose, rig, phase, params, data) {
  const st = styleOf(rig, data, 'tear');
  const amp = 1 + macro(params, data, 'amplitude');
  const pull = Math.sin(TAU * phase);
  stand(rig, pose, 0.18, 0.08);
  setA(pose, 'spine', num(st.pitch, 0.3) * 0.7 + 0.06 * amp * Math.abs(pull), 0.08 * amp * pull, 0);
  setA(pose, 'chest', num(st.pitch, 0.3) * 0.3, 0.06 * amp * pull, 0);
  setA(pose, 'neck', 0.1, 0, 0);
  setA(pose, 'head', 0.25, 0, 0);
  for (let i = 0; i < 2; i += 1) {
    const s = i === 0 ? 'L' : 'R';
    const side = i === 0 ? 1 : -1;
    const k = Math.max(0, side * pull);
    const p2 = (k * k) * num(st.pull, 0.55) * amp;
    sideSetA(pose, 'shoulder', s, side, -(1.45 - p2), -0.35, 0.05);
    sideSetA(pose, 'elbow', s, side, -(0.2 + 1.6 * p2), 0, 0);
  }
  return pose;
}

function escalade(pose, rig, phase, params, data) {
  const st = styleOf(rig, data, 'climb');
  const amp = 1 + macro(params, data, 'amplitude');
  const step = num(st.step, 1);
  for (let i = 0; i < 2; i += 1) {
    const s = i === 0 ? 'L' : 'R';
    const side = i === 0 ? 1 : -1;
    const off = i === 0 ? 0 : 0.5;
    const up = ((1 + Math.sin(TAU * (phase + off))) / 2) ** 2 * step * amp;
    sideSetA(pose, 'hip', s, side, -0.2 - 1.0 * up, 0, 0.12);
    sideSetA(pose, 'knee', s, side, 0.25 + 1.4 * up, 0, 0);
    sideSetA(pose, 'ankle', s, side, 0.2 - 0.3 * up, 0, 0);
    const reach = ((1 + Math.sin(TAU * (phase + off + 0.25))) / 2) * amp;
    sideSetA(pose, 'shoulder', s, side, -(1.2 + 0.45 * reach), -0.3, 0.1);
    sideSetA(pose, 'elbow', s, side, -(0.9 - 0.5 * reach), 0, 0);
  }
  setA(pose, 'pelvis', 0.2, 0, 0);
  setA(pose, 'spine', 0.25, 0.06 * Math.sin(TAU * phase), 0);
  setA(pose, 'chest', 0.1, 0, 0);
  setA(pose, 'head', 0.1, 0, 0);
  return pose;
}

// Enjamber une fenêtre (siège, mode « escalade », lot 3j) : t de 0 (dehors, devant l'appui) à 1 (dedans, retombé), piloté par la
// progression du passage (climb.t), pas en boucle. Mains puis genou sur l'appui, corps couché pour passer entre l'appui et le linteau, jambes
// ramenées, retombée accroupie. VAULT : clés (bassin cabré vers l'avant, jambe d'attaque R, jambe d'appui L, bras) et lift = hauteur du point
// le plus bas du corps (× hauteur d'appui, params.sill, 16 par défaut) : à mi-passage, il repose sur l'appui.
export const VAULT = [
  { t: 0, pitch: 0.75, spine: 0.45, head: -0.35, lead: [-0.9, 1.2, -0.2], trail: [-0.6, 0.9, -0.2], arms: -1.1, elbows: -0.5, lift: 0 },
  { t: 0.2, pitch: 1.15, spine: 0.35, head: -0.35, lead: [-1.9, 2.3, 0.4], trail: [-0.2, 0.6, 0.2], arms: -0.9, elbows: -1, lift: 0.85 },
  { t: 0.42, pitch: 1.35, spine: 0.15, head: -0.35, lead: [-1.6, 2.3, 0.3], trail: [-1.3, 2.1, 0.3], arms: -0.7, elbows: -0.4, lift: 1 },
  { t: 0.62, pitch: 1.35, spine: 0.1, head: -0.35, lead: [-0.7, 0.7, 0], trail: [-1.5, 2.1, 0.3], arms: -0.6, elbows: -0.2, lift: 0.9 },
  { t: 0.8, pitch: 0.7, spine: 0.3, head: -0.25, lead: [-0.8, 0.9, -0.2], trail: [-1.3, 1.7, 0], arms: -0.8, elbows: -0.4, lift: 0.25 },
  { t: 1, pitch: 0.2, spine: 0.25, head: -0.1, lead: [-0.45, 0.75, -0.3], trail: [-0.35, 0.65, -0.3], arms: -0.9, elbows: -0.6, lift: 0 },
];
function vaultPose(pose, k) {
  setA(pose, 'pelvis', k.pitch, 0, 0);
  setA(pose, 'spine', k.spine, 0, 0);
  setA(pose, 'head', k.head, 0, 0);
  for (let i = 0; i < 2; i += 1) {
    const s = i === 0 ? 'L' : 'R';
    const side = i === 0 ? 1 : -1;
    const leg = s === 'R' ? k.lead : k.trail;
    sideSetA(pose, 'hip', s, side, leg[0], 0, 0.1);
    sideSetA(pose, 'knee', s, side, leg[1], 0, 0);
    sideSetA(pose, 'ankle', s, side, leg[2], 0, 0);
    sideSetA(pose, 'shoulder', s, side, k.arms, -0.2, 0.15);
    sideSetA(pose, 'elbow', s, side, k.elbows, 0, 0);
  }
  return pose;
}
function enjamber(pose, work, rig, t, params, data) {
  const k = clamp2(num(t), 0, 1);
  let i = 0;
  while (i < VAULT.length - 2 && k > VAULT[i + 1].t) i += 1;
  const a = VAULT[i];
  const b = VAULT[i + 1];
  const u = ease((k - a.t) / (b.t - a.t));
  blendTo(pose, vaultPose(temp(work, 0), a), vaultPose(temp(work, 1), b), clamp2(num(u), 0, 1), false);
  liftTo(rig, pose, data, work);
  const lift = (a.lift + (b.lift - a.lift) * u) * num(obj(params).sill, 16);
  const pv = pose.offsets.pelvis ?? ZERO3;
  setO(pose, 'pelvis', pv[0], pv[1] + lift, pv[2]);
  return pose;
}

function attaque(pose, work, rig, phase, params, data) {
  const st = styleOf(rig, data, 'attack');
  const amp = 1 + macro(params, data, 'amplitude');
  const guard = temp(work, 0);
  stand(rig, guard, 0.18, 0.08);
  setA(guard, 'spine', 0.15, 0, 0);
  for (let i = 0; i < 2; i += 1) {
    const s = i === 0 ? 'L' : 'R';
    const side = i === 0 ? 1 : -1;
    sideSetA(guard, 'shoulder', s, side, -0.7, -0.35, 0.1);
    sideSetA(guard, 'elbow', s, side, -0.7, 0, 0);
  }
  const wind = temp(work, 1);
  stand(rig, wind, 0.25, 0.08);
  setA(wind, 'spine', -0.08, 0.15, 0);
  setA(wind, 'head', -0.1, 0, 0);
  for (let i = 0; i < 2; i += 1) {
    const s = i === 0 ? 'L' : 'R';
    const side = i === 0 ? 1 : -1;
    sideSetA(wind, 'shoulder', s, side, -num(st.windup, 1.5) * amp, -0.45, 0.1);
    sideSetA(wind, 'elbow', s, side, -1.7, 0, 0);
  }
  const strike = temp(work, 2);
  stand(rig, strike, 0.3, 0.08);
  setA(strike, 'spine', 0.2 * amp, -0.1, 0);
  setA(strike, 'chest', 0.08, 0, 0);
  setA(strike, 'head', 0.25, 0, 0);
  setO(strike, 'pelvis', 0, 0, num(st.lunge, 1) * amp);
  for (let i = 0; i < 2; i += 1) {
    const s = i === 0 ? 'L' : 'R';
    const side = i === 0 ? 1 : -1;
    sideSetA(strike, 'shoulder', s, side, -num(st.strike, 0.6), -0.55, 0.05);
    sideSetA(strike, 'elbow', s, side, -0.15, 0, 0);
  }
  return keyedTo(pose, phase, 5, 0, guard, 0.35, wind, 0.5, strike, 0.62, strike, 1, guard);
}

// Touché : pose additive (recul du tronc et de la tête, bras rejetés), enveloppe nulle aux deux bouts (0,25 s).
function toucheTo(pose, rig, phase, params, data) {
  const st = styleOf(rig, data, 'hurt');
  const e = Math.sin(Math.PI * clamp2(num(phase), 0, 1)) * num(st.amount, 1) * (1 + macro(params, data, 'amplitude'));
  setA(pose, 'spine', -0.22 * e, 0.08 * e, 0);
  setA(pose, 'chest', -0.12 * e, 0, 0);
  setA(pose, 'neck', -0.15 * e, 0, 0);
  setA(pose, 'head', -0.2 * e, 0, 0.1 * e);
  for (let i = 0; i < 2; i += 1) sideSetA(pose, 'shoulder', i === 0 ? 'L' : 'R', i === 0 ? 1 : -1, 0.35 * e, 0, 0.15 * e);
  setO(pose, 'pelvis', 0, 0, -2 * e);
  return pose;
}
export function touche(rig, phase, params = {}, data = {}) {
  return toucheTo(blankPose(), rig, phase, params, data);
}
// Touché écrit dans out (pose de createPose(), vidée d'abord).
export function toucheInto(out, rig, phase, params = {}, data = {}) {
  return toucheTo(clearPose(out), rig, phase, params, data);
}

function mort(pose, work, rig, anim, phase) {
  const start = temp(work, 0);
  stand(rig, start, 0.12, 0.05);
  const stagger = temp(work, 1);
  stand(rig, stagger, 0.5, 0.05);
  setA(stagger, 'spine', anim === 'mortArriere' ? -0.25 : 0.35, 0.2, 0);
  setA(stagger, 'head', anim === 'mortArriere' ? -0.4 : 0.3, 0, 0);
  for (let i = 0; i < 2; i += 1) {
    const s = i === 0 ? 'L' : 'R';
    const side = i === 0 ? 1 : -1;
    sideSetA(stagger, 'shoulder', s, side, anim === 'mortArriere' ? 0.3 : -0.6, 0, 0.35);
    sideSetA(stagger, 'elbow', s, side, -0.4, 0, 0);
  }
  const end = temp(work, 2);
  if (anim === 'mortAvant') {
    setA(end, 'pelvis', 1.52, 0, 0);
    setA(end, 'spine', 0.02, 0, 0);
    setA(end, 'neck', -0.1, 0.8, 0);
    setA(end, 'head', 0, 0.8, 0);
    for (let i = 0; i < 2; i += 1) {
      const s = i === 0 ? 'L' : 'R';
      const side = i === 0 ? 1 : -1;
      sideSetA(end, 'hip', s, side, 0, 0, 0.12);
      sideSetA(end, 'knee', s, side, 0.12, 0, 0);
      sideSetA(end, 'ankle', s, side, 0.88, 0, 0);
      sideSetA(end, 'shoulder', s, side, -0.3, 0, 1.15);
      sideSetA(end, 'elbow', s, side, -0.1, 0, 0);
    }
  } else if (anim === 'mortArriere') {
    setA(end, 'pelvis', -1.52, 0, 0);
    setA(end, 'spine', -0.02, 0, 0);
    setA(end, 'neck', 0.15, -0.5, 0);
    setA(end, 'head', 0.1, -0.5, 0);
    for (let i = 0; i < 2; i += 1) {
      const s = i === 0 ? 'L' : 'R';
      const side = i === 0 ? 1 : -1;
      sideSetA(end, 'hip', s, side, -0.05, 0, 0.18);
      sideSetA(end, 'knee', s, side, 0.02, 0, 0);
      sideSetA(end, 'ankle', s, side, -0.3, 0, 0);
      sideSetA(end, 'shoulder', s, side, -0.1, 0, 1.25);
      sideSetA(end, 'elbow', s, side, -0.1, 0, 0);
    }
  } else {
    // L'effondrement remplace le chancellement par l'agenouillement (même tampon : le chancellement n'y sert pas).
    const kneel = temp(work, 1);
    for (let i = 0; i < 2; i += 1) {
      const s = i === 0 ? 'L' : 'R';
      const side = i === 0 ? 1 : -1;
      sideSetA(kneel, 'hip', s, side, -1.4, 0, 0.1);
      sideSetA(kneel, 'knee', s, side, 2.2, 0, 0);
      sideSetA(kneel, 'ankle', s, side, 0.5, 0, 0);
      sideSetA(kneel, 'shoulder', s, side, 0.1, 0, 0.2);
      sideSetA(kneel, 'elbow', s, side, -0.3, 0, 0);
    }
    setA(kneel, 'spine', 0.6, 0, 0);
    setA(kneel, 'head', 0.5, 0, 0);
    setA(end, 'pelvis', 1.5, 0, 0);
    setA(end, 'spine', 0.04, 0.1, 0);
    setA(end, 'neck', -0.3, -0.6, 0);
    setA(end, 'head', -0.2, -0.6, 0);
    for (let i = 0; i < 2; i += 1) {
      const s = i === 0 ? 'L' : 'R';
      const side = i === 0 ? 1 : -1;
      sideSetA(end, 'hip', s, side, 0, 0, 0.1);
      sideSetA(end, 'knee', s, side, 0.65, 0, 0);
      sideSetA(end, 'ankle', s, side, 0.5, 0, 0);
      sideSetA(end, 'shoulder', s, side, -0.2, 0, 0.75);
      sideSetA(end, 'elbow', s, side, -0.15, 0, 0);
    }
    return keyedTo(pose, phase, 4, 0, start, 0.4, kneel, 0.85, end, 1, end, 0, null);
  }
  return keyedTo(pose, phase, 4, 0, start, 0.25, stagger, 0.8, end, 1, end, 0, null);
}

function repos(pose, work, rig, phase, params, data, recoil = 0) {
  const amp = 1 + macro(params, data, 'amplitude');
  stand(rig, pose, 0.08, 0.04);
  const br = Math.sin(TAU * phase);
  setA(pose, 'spine', 0.02 * amp * br, -num(obj(params).twist) * 0.6, 0);
  setA(pose, 'chest', 0.015 * amp * br - KICK[3] * kickOf(recoil), -num(obj(params).twist) * 0.4, 0);
  setA(pose, 'head', 0.06, 0, 0);
  playerArms(rig, pose, recoil, work);
  return pose;
}

function terre(pose, rig, phase, params, data) {
  const amp = 1 + macro(params, data, 'amplitude');
  const br = Math.sin(TAU * phase);
  setA(pose, 'pelvis', 1.45, 0, 0);
  setA(pose, 'spine', -0.1 + 0.02 * amp * br, 0, 0);
  setA(pose, 'chest', -0.15, 0, 0);
  setA(pose, 'neck', -0.45, 0, 0);
  setA(pose, 'head', -0.3, 0.2 * Math.sin(TAU * phase + 1) * amp, 0);
  for (let i = 0; i < 2; i += 1) {
    const s = i === 0 ? 'L' : 'R';
    const side = i === 0 ? 1 : -1;
    sideSetA(pose, 'hip', s, side, side > 0 ? -0.5 : 0.1, 0, 0.1);
    sideSetA(pose, 'knee', s, side, side > 0 ? 1.1 : 0.3, 0, 0);
    sideSetA(pose, 'ankle', s, side, 0.4, 0, 0);
    sideSetA(pose, 'shoulder', s, side, side > 0 ? -1.6 : -0.6, -0.2, 0.5);
    sideSetA(pose, 'elbow', s, side, -1.2, 0, 0);
  }
  pose.scales.prop = 1;
  pose.scales.tool = 0;
  return pose;
}

// Réparation : coups de marteau ; un cycle = un coup, n coups par planche (repairTime / repair.strike arrondi, au moins 1).
export function strikesPerPlank(repairTime, data) {
  const r = obj(data.repair);
  const t = clamp2(num(repairTime, 1.8), num(r.min, 0.4), num(r.max, 1.8));
  return Math.max(1, Math.round(t / num(r.strike, 0.45)));
}
function reparation(pose, work, rig, phase, params, data) {
  const amp = 1 + macro(params, data, 'amplitude');
  const up = temp(work, 0);
  stand(rig, up, 0.35, 0.12);
  setA(up, 'spine', 0.3, -0.1, 0);
  setA(up, 'chest', 0.1, 0, 0);
  setA(up, 'head', 0.35, 0, 0);
  sideSetA(up, 'shoulder', 'L', 1, -1.3, -0.3, 0.05);
  sideSetA(up, 'elbow', 'L', 1, -0.5, 0, 0);
  sideSetA(up, 'shoulder', 'R', -1, -(1.6 + 0.6 * amp), -0.2, 0.15);
  sideSetA(up, 'elbow', 'R', -1, -1.7, 0, 0);
  setA(up, 'wristR', -0.6, 0, 0);
  const hit = temp(work, 1);
  stand(rig, hit, 0.4, 0.12);
  setA(hit, 'spine', 0.38, -0.1, 0);
  setA(hit, 'chest', 0.12, 0, 0);
  setA(hit, 'head', 0.4, 0, 0);
  sideSetA(hit, 'shoulder', 'L', 1, -1.3, -0.3, 0.05);
  sideSetA(hit, 'elbow', 'L', 1, -0.5, 0, 0);
  sideSetA(hit, 'shoulder', 'R', -1, -1.15, -0.25, 0.1);
  sideSetA(hit, 'elbow', 'R', -1, -0.25, 0, 0);
  setA(hit, 'wristR', 0.3, 0, 0);
  up.scales.prop = 0;
  up.scales.tool = 1;
  hit.scales.prop = 0;
  hit.scales.tool = 1;
  return keyedTo(pose, phase, 4, 0, up, 0.55, hit, 0.7, hit, 1, up, 0, null);
}

function kneelPose(pose, work, rig) {
  sideSetA(pose, 'hip', 'L', 1, -1.5, 0, 0.1);
  sideSetA(pose, 'knee', 'L', 1, 1.6, 0, 0);
  sideSetA(pose, 'ankle', 'L', 1, 0, 0, 0);
  sideSetA(pose, 'hip', 'R', -1, 0.1, 0, 0.1);
  sideSetA(pose, 'knee', 'R', -1, 1.9, 0, 0);
  sideSetA(pose, 'ankle', 'R', -1, 0.3, 0, 0);
  setA(pose, 'spine', 0.35, 0, 0);
  playerArms(rig, pose, 0, work);
  return pose;
}

// Pose d'une animation à une phase, écrite dans pose (vide) avec l'espace de travail work.
function poseTo(pose, work, rig, anim, phase, params, data) {
  const r = rig && Array.isArray(rig.joints) ? rig : rigOf({}, {});
  const d = obj(data);
  const known = r.kind === 'player' ? PLAYER_ANIMS : ZOMBIE_ANIMS;
  const a = known.includes(anim) ? anim : r.kind === 'player' ? 'repos' : 'attente';
  const raw = num(phase);
  const p = CYCLIC.includes(a) ? frac(raw) : clamp2(raw, 0, 1);
  if (a === 'marche' && r.kind === 'player') locomote(pose, work, r, p, params, d, 'player', obj(params).stride);
  else if (a === 'marche' || a === 'marcheLente' || a === 'escalier') locomote(pose, work, r, p, params, d, a === 'escalier' ? 'escalier' : 'walk', mergedStride(params, num(obj(d.strides)[a], 52)));
  else if (a === 'course') locomote(pose, work, r, p, params, d, 'run', mergedStride(params, num(obj(d.strides).course, 78)));
  else if (a === 'rampe') liftTo(r, rampe(pose, r, p, params, d), d, work);
  else if (a === 'arracher') liftTo(r, arracher(pose, r, p, params, d), d, work);
  else if (a === 'escalade') liftTo(r, escalade(pose, r, p, params, d), d, work);
  else if (a === 'enjamber') enjamber(pose, work, r, p, params, d);
  else if (a === 'attaque') liftTo(r, attaque(pose, work, r, p, params, d), d, work);
  else if (a === 'touche') return toucheTo(pose, r, p, params, d);
  else if (DEATHS.includes(a)) liftTo(r, mort(pose, work, r, a, p), d, work);
  else if (a === 'repos') liftTo(r, repos(pose, work, r, p, params, d, num(obj(params).recoil)), d, work);
  else if (a === 'tir') liftTo(r, repos(pose, work, r, 0, params, d, Math.sin(Math.PI * p) ** 2 * (1 - p) * 2.6), d, work);
  else if (a === 'terre') liftTo(r, terre(pose, r, p, params, d), d, work);
  else if (a === 'relevage') liftTo(r, keyedTo(pose, p, 3, 0, terre(temp(work, 0), r, 0, params, d), 0.45, kneelPose(temp(work, 1), work, r), 1, repos(temp(work, 2), work, r, 0, params, d), 0, null, 0, null), d, work);
  else if (a === 'reparation') liftTo(r, reparation(pose, work, r, p, params, d), d, work);
  else liftTo(r, attente(pose, r, p, params, d), d, work);
  if (r.kind !== 'player' && a !== 'rampe' && !DEATHS.includes(a)) applyPosture(r, pose, a === 'attaque' ? 0.5 : 1);
  if (r.kind === 'player' && pose.scales.prop === undefined) {
    pose.scales.prop = 1;
    pose.scales.tool = 0;
  }
  return pose;
}
// Pose d'une animation à une phase (cycles : 0 à 1 ; les animations cycliques se répètent). anim inconnue : attente (zombie) ou repos.
export function poseAt(rig, anim, phase, params = {}, data = {}) {
  return poseTo(blankPose(), freshWork(), rig, anim, phase, params, data);
}
// Même pose écrite dans out (createPose(), vidée d'abord) avec l'espace de travail work (createPoseWork()) ; renvoie out.
export function poseAtInto(out, work, rig, anim, phase, params = {}, data = {}) {
  return poseTo(clearPose(out), work, rig, anim, phase, params, data);
}

// Fondu linéaire de deux poses (t borné à [0, 1]) ; une articulation absente d'un côté vaut zéro (échelle : 1).
export function blendPoses(a, b, t) {
  const k = clamp2(num(t), 0, 1);
  return blendTo(blankPose(), obj(a), obj(b), k, true);
}
// Même fondu écrit dans out (createPose(), distincte de a et b, vidée d'abord) ; renvoie out.
export function blendPosesInto(out, a, b, t) {
  const k = clamp2(num(t), 0, 1);
  return blendTo(clearPose(out), obj(a), obj(b), k, false);
}

// Ajoute une pose additive (touché) pondérée par w.
function addTo(out, base, add, w, strict) {
  blendTo(out, obj(base), obj(base), 0, strict);
  const k = num(w);
  for (let g = 0; g < 2; g += 1) {
    const src = obj(obj(add)[g === 0 ? 'angles' : 'offsets']);
    const dst = g === 0 ? out.angles : out.offsets;
    for (const id in src) {
      if (!has(src, id)) continue;
      const v = src[id];
      if (!strict && v === undefined) continue;
      const cur = dst[id] ?? ZERO3;
      const x = cur[0] + num(v[0]) * k;
      const y = cur[1] + num(v[1]) * k;
      const z = cur[2] + num(v[2]) * k;
      if (g === 0) setA(out, id, x, y, z);
      else setO(out, id, x, y, z);
    }
  }
  return out;
}
export function addPose(base, add, w = 1) {
  return addTo(blankPose(), base, add, w, true);
}
// Même ajout écrit dans out (createPose(), distincte de base et add, vidée d'abord) ; renvoie out.
export function addPoseInto(out, base, add, w = 1) {
  return addTo(clearPose(out), base, add, w, false);
}
// Copie exacte d'une pose (articulations présentes seulement, valeurs recopiées sans calcul) dans out (createPose(), distincte de src, vidée
// d'abord) ; renvoie out. Sert à garder la pose précédente d'un personnage (fondu), comme l'ancien code gardait l'objet lui-même.
function copyGroup(out, angles, g) {
  for (const id in g) {
    if (!has(g, id)) continue;
    const v = g[id];
    if (v === undefined) continue;
    if (angles) setA(out, id, v[0], v[1], v[2]);
    else setO(out, id, v[0], v[1], v[2]);
  }
}
export function copyPoseInto(out, src) {
  clearPose(out);
  const s = obj(src);
  copyGroup(out, true, obj(s.angles));
  copyGroup(out, false, obj(s.offsets));
  const sc = obj(s.scales);
  for (const id in sc) if (has(sc, id) && sc[id] !== undefined) out.scales[id] = sc[id];
  return out;
}

// Durée d'un cycle en secondes pour les animations au temps (attente, escalade, attaque, réparation, terre, repos), selon le rythme.
export function cycleSeconds(rig, anim, params = {}, data = {}) {
  const d = obj(data);
  const speed = 1 + macro(params, d, 'rythme');
  const idle = num(styleOf(rig, d, 'idle').freq, 0.55);
  const climb = num(styleOf(rig, d, 'climb').freq, 0.8);
  let base;
  if (anim === 'attente') base = 1 / idle;
  else if (anim === 'escalade') base = 1 / climb;
  else if (anim === 'enjamber') base = num(obj(d.durations).enjamber, 1.2);
  else if (anim === 'attaque') base = num(obj(d.durations).attaque, 1);
  else if (anim === 'repos') base = 3;
  else if (anim === 'terre') base = 2.5;
  else if (anim === 'tir') base = num(obj(d.durations).tir, 0.3);
  else if (anim === 'reparation') base = clamp2(num(obj(params).repairTime, 1.8), 0.4, 1.8) / strikesPerPlank(obj(params).repairTime, d);
  if (!isNum(base)) return null;
  return anim === 'reparation' || anim === 'attaque' || anim === 'tir' || anim === 'enjamber' ? base : base / Math.max(0.2, speed);
}
