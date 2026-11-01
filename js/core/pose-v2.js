// Poses des personnages du lot 3j : angles d'Euler ('YXZ' de Three.js) de chaque articulation du squelette v2, purement visuels, sans
// horloge (la phase arrive en argument). Conventions (data/game/poses-v2.json) : x positif = jambe ou bras vers l'arrière, colonne et tête
// vers l'avant, genou plié ; coude : x négatif = avant-bras plié vers l'avant ; z positif = bras gauche écarté.
// La marche et la course placent le pied d'appui par cinématique inverse : il ne glisse pas (sa vitesse au sol est nulle tant que la
// foulée est atteignable). fromV1 traduit une sortie de computePose (js/core/pose.js) en angles du squelette v1, comme setPose de
// js/game/character.js (sans l'arme). Aucune fonction ne lève d'exception ni ne modifie ses arguments.
import { isNum } from './vec.js';
import { applyAffine, jointMatrices, jointsOf } from './character-parts.js';

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
export const ZOMBIE_ANIMS = ['attente', 'marcheLente', 'marche', 'rampe', 'course', 'arracher', 'escalade', 'attaque', 'touche', 'mortAvant', 'mortArriere', 'effondrement', 'escalier'];
export const PLAYER_ANIMS = ['repos', 'marche', 'tir', 'touche', 'terre', 'relevage', 'reparation'];
export const DEATHS = ['mortAvant', 'mortArriere', 'effondrement'];
// Animations cycliques (phase 0 = phase 1) ; les autres (morts, relevage) vont de 0 à 1 une seule fois ; touché est additif.
export const CYCLIC = ['attente', 'marcheLente', 'marche', 'rampe', 'course', 'arracher', 'escalade', 'attaque', 'escalier', 'repos', 'tir', 'terre', 'reparation'];
// Marches à pied d'appui (glissement mesuré).
export const LOCOMOTION = ['marcheLente', 'marche', 'course', 'escalier'];
const SIDES = [['L', 1, 0], ['R', -1, 0.5]];

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

// Paramètres : { amplitude, rythme, lourdeur } (pas des macros, −2 à 2), stride (foulée en unités du monde), twist (torsion du tronc vers
// la visée, joueur), recoil (0 à 1), repairTime (secondes par planche), seed. data : poses-v2.json.
const macro = (params, data, id) => num(obj(params)[id]) * num(obj(obj(data.macros)[id]).step, 0);
const styleOf = (rig, data, key) => obj(obj(obj(data.styles)[rig.style])[key]);
const ease = (t) => 0.5 - 0.5 * Math.cos(Math.PI * clamp(t, [0, 1]));

// Cinématique inverse plane d'une jambe : cible de la cheville (dy vers le bas négatif, dz vers l'avant) depuis la hanche.
// Renvoie [hanche, genou, cheville] (x) avec le pied à plat.
function legIK(rig, dy, dz) {
  const T = rig.thigh;
  const S = rig.shin;
  const d = clamp(Math.hypot(dy, dz), [Math.abs(T - S) + 1e-6, (T + S) * 0.9999]);
  const dir = Math.atan2(-dz, -dy);
  const alpha = Math.acos(clamp((T * T + d * d - S * S) / (2 * T * d), [-1, 1]));
  const gamma = Math.acos(clamp((T * T + S * S - d * d) / (2 * T * S), [-1, 1]));
  const hip = dir - alpha;
  const knee = Math.PI - gamma;
  return [hip, knee, clamp(-(hip + knee), [-1.15, 1.15])];
}

// Cinématique inverse d'un bras (épaule à l'origine, repère de la poitrine) vers une cible t : [épaule [x, y, z], coude [x, 0, 0]].
export function armIK(upper, fore, t) {
  const d = clamp(Math.hypot(t[0], t[1], t[2]), [Math.abs(upper - fore) + 1e-6, (upper + fore) * 0.9999]);
  const e = Math.PI - Math.acos(clamp((upper * upper + fore * fore - d * d) / (2 * upper * fore), [-1, 1]));
  const A = upper + fore * Math.cos(e);
  const B = fore * Math.sin(e);
  const delta = Math.atan2(B, A);
  const c = clamp(-t[1] / d, [-1, 1]);
  const phi = delta - Math.acos(c);
  const zz = -A * Math.sin(phi) + B * Math.cos(phi);
  const psi = zz >= 0 ? Math.atan2(t[0], t[2]) : Math.atan2(-t[0], -t[2]);
  return [[phi, psi, 0], [-e, 0, 0]];
}

// Pose vide : chaque articulation à zéro.
const blank = () => ({ angles: {}, offsets: {}, scales: {} });
const set = (pose, id, x = 0, y = 0, z = 0) => {
  pose.angles[id] = [x, y, z];
};
const sideSet = (pose, id, s, side, x, y, z) => set(pose, `${id}${s}`, x, side * y, side * z);

// Posture de base de la variante (voûté, tête enfoncée...) ajoutée au tronc et à la tête.
// Les bras restent pendants : l'inclinaison ajoutée au tronc est compensée aux épaules (aux 3/10 ; x négatif = bras vers l'avant ; posture à moitié pendant l'attaque).
function applyPosture(rig, pose, k = 1) {
  let pitch = 0;
  for (const [id, a] of Object.entries(rig.posture)) {
    if (!Array.isArray(a)) continue;
    const cur = pose.angles[id] ?? [0, 0, 0];
    pose.angles[id] = [cur[0] + num(a[0]) * k, cur[1] + num(a[1]) * k, cur[2] + num(a[2]) * k];
    if (id === 'spine' || id === 'chest') pitch += num(a[0]) * k;
  }
  for (const s of ['L', 'R']) {
    const cur = pose.angles[`shoulder${s}`];
    if (cur) pose.angles[`shoulder${s}`] = [cur[0] - 0.3 * pitch, cur[1], cur[2]];
  }
}

// Bras pendants ou tendus selon le style : [avant, balancement, coude] ; p : phase du balancement.
function zombieArms(rig, pose, st, p, amp) {
  for (const [s, side, off] of SIDES) {
    const a = st[`arm${s}`] ?? [0.6, 0.2, 0.3];
    const swing = num(a[1]) * amp * Math.sin(TAU * (p + off));
    sideSet(pose, 'shoulder', s, side, -(num(a[0]) + swing), -num(st.inward) * 0.6, num(st.out));
    sideSet(pose, 'elbow', s, side, -(num(a[2]) + 0.1 * amp * Math.max(0, Math.sin(TAU * (p + off)))), 0, 0);
  }
}

// Marche, course, escalier : foulée en unités du monde, phase en cycles (distance / foulée).
function locomote(rig, phase, params, data, key) {
  const st = { ...styleOf(rig, data, key === 'player' || key === 'escalier' ? 'walk' : key) };
  const pl = key === 'player' ? styleOf(rig, data, 'player') : null;
  const heavy = macro(params, data, 'lourdeur');
  const amp = 1 + macro(params, data, 'amplitude');
  const duty = clamp(num(pl?.duty ?? st.duty, 0.55), [0.3, 0.8]);
  const lift = Math.max(0.5, num(pl?.lift ?? st.lift, 3) * (1 - 0.12 * heavy) * (key === 'escalier' ? 1.6 : 1));
  const crouch = Math.max(0, num(pl?.crouch ?? st.crouch, 0.5) + 1.2 * heavy);
  const stride = Math.max(1, num(obj(params).stride, num(obj(data.strides)[key === 'player' ? 'joueur' : key === 'run' ? 'course' : 'marche'], 52))) / rig.scale;
  const S = duty * stride;
  const reach = (rig.thigh + rig.shin) * 0.985;
  const feet = SIDES.map(([s, side, off]) => {
    const pf = frac(phase + off);
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
    return { s, side, z, y };
  });
  let h = rig.standing;
  for (const f of feet) h = Math.min(h, f.y + rig.sole + Math.sqrt(Math.max(0, reach * reach - f.z * f.z)));
  h -= crouch;
  const pose = blank();
  for (const f of feet) {
    const [hip, knee, ankle] = legIK(rig, f.y + rig.sole - h, f.z);
    sideSet(pose, 'hip', f.s, f.side, hip, 0, 0);
    sideSet(pose, 'knee', f.s, f.side, knee, 0, 0);
    sideSet(pose, 'ankle', f.s, f.side, ankle, 0, 0);
  }
  pose.offsets.pelvis = [0, h - rig.pelvisY, 0];
  const jerk = num(st.jerk);
  const pu = phase + (jerk / (2 * TAU)) * Math.sin(2 * TAU * phase);
  const bob = Math.sin(2 * TAU * pu);
  const pitch = num(pl?.pitch ?? st.pitch) + 0.04 * heavy;
  set(pose, 'spine', pitch * 0.6 + 0.02 * amp * bob, -num(obj(params).twist) * 0.6 + num(st.twist) * amp * Math.sin(TAU * pu) * (key === 'player' ? 0.3 : 1), 0);
  set(pose, 'chest', pitch * 0.4, -num(obj(params).twist) * 0.4, 0);
  set(pose, 'neck', num(st.head) * 0.4, 0, 0);
  set(pose, 'head', num(st.head) * 0.6 + 0.03 * amp * bob, 0, 0.03 * amp * Math.sin(TAU * pu));
  if (key === 'player') playerArms(rig, pose, num(obj(params).recoil));
  else zombieArms(rig, pose, st, pu, amp);
  if (key === 'escalier') {
    const sp = pose.angles.spine;
    pose.angles.spine = [sp[0] + 0.15, sp[1], sp[2]];
  }
  return pose;
}

// Pistolet tenu à deux mains, bras tendus, centré sur l'axe de visée à hauteur de poitrine (articulation « prop ») : main droite sur la
// poignée, main gauche en soutien ; recul : l'arme recule et remonte. HOLD : position de l'arme dans le repère de la poitrine.
export const HOLD = [-1, -1, 14];
function playerArms(rig, pose, recoil) {
  const prop = rig.joints.find((j) => j.id === 'prop')?.offset ?? [-1.5, -4, 13];
  const r = clamp(num(recoil), [0, 1]);
  const at = [HOLD[0], HOLD[1] + 1.2 * r, HOLD[2] - 3 * r];
  pose.offsets.prop = [at[0] - prop[0], at[1] - prop[1], at[2] - prop[2]];
  set(pose, 'prop', -0.25 * r, 0, 0);
  const grip = { R: [at[0], at[1] - 2, at[2] - 3], L: [at[0] + 1.5, at[1] - 1, at[2] - 0.5] };
  for (const [s, side] of SIDES) {
    const sh = [side * Math.abs(rig.shoulder[0]), rig.shoulder[1], rig.shoulder[2]];
    const t = [grip[s][0] - sh[0], grip[s][1] - sh[1], grip[s][2] - sh[2]];
    const [a, b] = armIK(rig.upper, rig.fore, t);
    set(pose, `shoulder${s}`, ...a);
    set(pose, `elbow${s}`, ...b);
  }
  pose.scales.prop = 1;
  pose.scales.tool = 0;
}

// Debout, pieds au sol : genoux un peu pliés ; le bassin est posé par groundLift.
function stand(rig, pose, knee = 0.1, spread = 0) {
  for (const [s, side] of SIDES) {
    sideSet(pose, 'hip', s, side, -knee * 0.5, 0, spread);
    sideSet(pose, 'knee', s, side, knee, 0, 0);
    sideSet(pose, 'ankle', s, side, -knee * 0.5, 0, -spread);
  }
}

// Interpolation de clés { t, pose } (fondu en cosinus) ; clés triées, t de 0 à 1.
function keyed(keys, t) {
  const k = clamp(t, [0, 1]);
  let i = 0;
  while (i < keys.length - 2 && k > keys[i + 1].t) i += 1;
  const a = keys[i];
  const b = keys[Math.min(keys.length - 1, i + 1)];
  const u = b.t > a.t ? ease((k - a.t) / (b.t - a.t)) : 0;
  return blendPoses(a.pose, b.pose, u);
}

// Contact au sol (points et rayons de poses-v2.json, plus ceux des accessoires de la variante) : décale le bassin pour que le point le
// plus bas touche y = 0.
export function groundLift(rig, pose, data) {
  const contacts = [...(Array.isArray(data.contacts) ? data.contacts : []), ...(Array.isArray(rig.contacts) ? rig.contacts : [])];
  const base = { ...pose, offsets: { ...pose.offsets, pelvis: [num(pose.offsets?.pelvis?.[0]), 0, num(pose.offsets?.pelvis?.[2])] } };
  const m = jointMatrices(rig.joints, base, 1);
  let low = Infinity;
  for (const c of contacts) if (m[c?.joint]) low = Math.min(low, applyAffine(m[c.joint], Array.isArray(c.offset) ? c.offset : [0, 0, 0])[1] - num(c.radius));
  if (!Number.isFinite(low)) return pose;
  return { ...pose, offsets: { ...pose.offsets, pelvis: [base.offsets.pelvis[0], -low, base.offsets.pelvis[2]] } };
}

function attente(rig, phase, params, data) {
  const st = styleOf(rig, data, 'idle');
  const amp = 1 + macro(params, data, 'amplitude');
  const sw = Math.sin(TAU * phase);
  const pose = blank();
  stand(rig, pose, num(st.knee, 0.12) + 0.03 * amp * Math.sin(TAU * phase * 2), 0.06);
  set(pose, 'spine', 0.1 + 0.04 * amp * sw, num(st.sway) * amp * sw, 0.03 * amp * sw);
  set(pose, 'chest', 0.05, 0.5 * num(st.sway) * amp * sw, 0);
  set(pose, 'neck', num(st.head) * 0.5, 0.15 * amp * Math.sin(TAU * phase + 1), 0);
  set(pose, 'head', num(st.head) * 0.5 + 0.05 * amp * Math.sin(TAU * phase * 2), 0, 0);
  const arms = st.arms ?? [0.6, 0.4];
  for (const [s, side, off] of SIDES) {
    sideSet(pose, 'shoulder', s, side, -(num(arms[0]) + 0.1 * amp * Math.sin(TAU * (phase + off))), -0.15, 0.1);
    sideSet(pose, 'elbow', s, side, -(num(arms[1]) + 0.1 * amp * Math.sin(TAU * (phase + off) + 1)), 0, 0);
  }
  return pose;
}

function rampe(rig, phase, params, data) {
  const st = styleOf(rig, data, 'crawl');
  const amp = 1 + macro(params, data, 'amplitude');
  const sw = Math.sin(TAU * phase);
  const lift = Math.cos(TAU * phase);
  const pose = blank();
  set(pose, 'pelvis', 0.55, 0, 0);
  for (const [s, side, off] of SIDES) {
    const q = side * sw;
    sideSet(pose, 'hip', s, side, 0.7 * num(st.legs, 1) - 0.2 * q * amp, 0, 0.1);
    sideSet(pose, 'knee', s, side, 0.75 + 0.45 * amp * ((1 + side * lift) / 2) ** 2, 0, 0);
    sideSet(pose, 'ankle', s, side, 0.6, 0, 0);
    const pull = ((1 + Math.sin(TAU * (phase + off))) / 2) ** 2;
    sideSet(pose, 'shoulder', s, side, -(1.35 + 0.45 * amp * pull) * num(st.reach, 1), -0.2, 0.2);
    sideSet(pose, 'elbow', s, side, -(0.35 + 0.6 * amp * (1 - pull)), 0, 0);
  }
  set(pose, 'spine', 0.6, 0.15 * amp * sw, 0);
  set(pose, 'chest', 0.3, 0.08 * amp * sw, 0);
  set(pose, 'neck', num(st.head, -0.3), 0, 0);
  set(pose, 'head', -0.15, 0.06 * Math.sin(TAU * phase * 2), 0);
  return pose;
}

function arracher(rig, phase, params, data) {
  const st = styleOf(rig, data, 'tear');
  const amp = 1 + macro(params, data, 'amplitude');
  const pull = Math.sin(TAU * phase);
  const pose = blank();
  stand(rig, pose, 0.18, 0.08);
  set(pose, 'spine', num(st.pitch, 0.3) * 0.7 + 0.06 * amp * Math.abs(pull), 0.08 * amp * pull, 0);
  set(pose, 'chest', num(st.pitch, 0.3) * 0.3, 0.06 * amp * pull, 0);
  set(pose, 'neck', 0.1, 0, 0);
  set(pose, 'head', 0.25, 0, 0);
  for (const [s, side] of SIDES) {
    const k = Math.max(0, side * pull);
    const p2 = (k * k) * num(st.pull, 0.55) * amp;
    sideSet(pose, 'shoulder', s, side, -(1.45 - p2), -0.35, 0.05);
    sideSet(pose, 'elbow', s, side, -(0.2 + 1.6 * p2), 0, 0);
  }
  return pose;
}

function escalade(rig, phase, params, data) {
  const st = styleOf(rig, data, 'climb');
  const amp = 1 + macro(params, data, 'amplitude');
  const step = num(st.step, 1);
  const pose = blank();
  for (const [s, side, off] of SIDES) {
    const up = ((1 + Math.sin(TAU * (phase + off))) / 2) ** 2 * step * amp;
    sideSet(pose, 'hip', s, side, -0.2 - 1.0 * up, 0, 0.12);
    sideSet(pose, 'knee', s, side, 0.25 + 1.4 * up, 0, 0);
    sideSet(pose, 'ankle', s, side, 0.2 - 0.3 * up, 0, 0);
    const reach = ((1 + Math.sin(TAU * (phase + off + 0.25))) / 2) * amp;
    sideSet(pose, 'shoulder', s, side, -(1.2 + 0.45 * reach), -0.3, 0.1);
    sideSet(pose, 'elbow', s, side, -(0.9 - 0.5 * reach), 0, 0);
  }
  set(pose, 'pelvis', 0.2, 0, 0);
  set(pose, 'spine', 0.25, 0.06 * Math.sin(TAU * phase), 0);
  set(pose, 'chest', 0.1, 0, 0);
  set(pose, 'head', 0.1, 0, 0);
  return pose;
}

function attaque(rig, phase, params, data) {
  const st = styleOf(rig, data, 'attack');
  const amp = 1 + macro(params, data, 'amplitude');
  const guard = blank();
  stand(rig, guard, 0.18, 0.08);
  set(guard, 'spine', 0.15, 0, 0);
  for (const [s, side] of SIDES) {
    sideSet(guard, 'shoulder', s, side, -0.7, -0.35, 0.1);
    sideSet(guard, 'elbow', s, side, -0.7, 0, 0);
  }
  const wind = blank();
  stand(rig, wind, 0.25, 0.08);
  set(wind, 'spine', -0.08, 0.15, 0);
  set(wind, 'head', -0.1, 0, 0);
  for (const [s, side] of SIDES) {
    sideSet(wind, 'shoulder', s, side, -num(st.windup, 1.5) * amp, -0.45, 0.1);
    sideSet(wind, 'elbow', s, side, -1.7, 0, 0);
  }
  const strike = blank();
  stand(rig, strike, 0.3, 0.08);
  set(strike, 'spine', 0.2 * amp, -0.1, 0);
  set(strike, 'chest', 0.08, 0, 0);
  set(strike, 'head', 0.25, 0, 0);
  strike.offsets.pelvis = [0, 0, num(st.lunge, 1) * amp];
  for (const [s, side] of SIDES) {
    sideSet(strike, 'shoulder', s, side, -num(st.strike, 0.6), -0.55, 0.05);
    sideSet(strike, 'elbow', s, side, -0.15, 0, 0);
  }
  return keyed([{ t: 0, pose: guard }, { t: 0.35, pose: wind }, { t: 0.5, pose: strike }, { t: 0.62, pose: strike }, { t: 1, pose: guard }], phase);
}

// Touché : pose additive (recul du tronc et de la tête, bras rejetés), enveloppe nulle aux deux bouts (0,25 s).
export function touche(rig, phase, params = {}, data = {}) {
  const st = styleOf(rig, data, 'hurt');
  const e = Math.sin(Math.PI * clamp(num(phase), [0, 1])) * num(st.amount, 1) * (1 + macro(params, data, 'amplitude'));
  const pose = blank();
  set(pose, 'spine', -0.22 * e, 0.08 * e, 0);
  set(pose, 'chest', -0.12 * e, 0, 0);
  set(pose, 'neck', -0.15 * e, 0, 0);
  set(pose, 'head', -0.2 * e, 0, 0.1 * e);
  for (const [s, side] of SIDES) sideSet(pose, 'shoulder', s, side, 0.35 * e, 0, 0.15 * e);
  pose.offsets.pelvis = [0, 0, -2 * e];
  return pose;
}

function mort(rig, anim, phase) {
  const start = blank();
  stand(rig, start, 0.12, 0.05);
  const stagger = blank();
  stand(rig, stagger, 0.5, 0.05);
  set(stagger, 'spine', anim === 'mortArriere' ? -0.25 : 0.35, 0.2, 0);
  set(stagger, 'head', anim === 'mortArriere' ? -0.4 : 0.3, 0, 0);
  for (const [s, side] of SIDES) {
    sideSet(stagger, 'shoulder', s, side, anim === 'mortArriere' ? 0.3 : -0.6, 0, 0.35);
    sideSet(stagger, 'elbow', s, side, -0.4, 0, 0);
  }
  const end = blank();
  if (anim === 'mortAvant') {
    set(end, 'pelvis', 1.52, 0, 0);
    set(end, 'spine', 0.02, 0, 0);
    set(end, 'neck', -0.1, 0.8, 0);
    set(end, 'head', 0, 0.8, 0);
    for (const [s, side] of SIDES) {
      sideSet(end, 'hip', s, side, 0, 0, 0.12);
      sideSet(end, 'knee', s, side, 0.12, 0, 0);
      sideSet(end, 'ankle', s, side, 0.88, 0, 0);
      sideSet(end, 'shoulder', s, side, -0.3, 0, 1.15);
      sideSet(end, 'elbow', s, side, -0.1, 0, 0);
    }
  } else if (anim === 'mortArriere') {
    set(end, 'pelvis', -1.52, 0, 0);
    set(end, 'spine', -0.02, 0, 0);
    set(end, 'neck', 0.15, -0.5, 0);
    set(end, 'head', 0.1, -0.5, 0);
    for (const [s, side] of SIDES) {
      sideSet(end, 'hip', s, side, -0.05, 0, 0.18);
      sideSet(end, 'knee', s, side, 0.02, 0, 0);
      sideSet(end, 'ankle', s, side, -0.3, 0, 0);
      sideSet(end, 'shoulder', s, side, -0.1, 0, 1.25);
      sideSet(end, 'elbow', s, side, -0.1, 0, 0);
    }
  } else {
    const kneel = blank();
    for (const [s, side] of SIDES) {
      sideSet(kneel, 'hip', s, side, -1.4, 0, 0.1);
      sideSet(kneel, 'knee', s, side, 2.2, 0, 0);
      sideSet(kneel, 'ankle', s, side, 0.5, 0, 0);
      sideSet(kneel, 'shoulder', s, side, 0.1, 0, 0.2);
      sideSet(kneel, 'elbow', s, side, -0.3, 0, 0);
    }
    set(kneel, 'spine', 0.6, 0, 0);
    set(kneel, 'head', 0.5, 0, 0);
    set(end, 'pelvis', 1.5, 0, 0);
    set(end, 'spine', 0.04, 0.1, 0);
    set(end, 'neck', -0.3, -0.6, 0);
    set(end, 'head', -0.2, -0.6, 0);
    for (const [s, side] of SIDES) {
      sideSet(end, 'hip', s, side, 0, 0, 0.1);
      sideSet(end, 'knee', s, side, 0.65, 0, 0);
      sideSet(end, 'ankle', s, side, 0.5, 0, 0);
      sideSet(end, 'shoulder', s, side, -0.2, 0, 0.75);
      sideSet(end, 'elbow', s, side, -0.15, 0, 0);
    }
    return keyed([{ t: 0, pose: start }, { t: 0.4, pose: kneel }, { t: 0.85, pose: end }, { t: 1, pose: end }], phase);
  }
  return keyed([{ t: 0, pose: start }, { t: 0.25, pose: stagger }, { t: 0.8, pose: end }, { t: 1, pose: end }], phase);
}

function repos(rig, phase, params, data, recoil = 0) {
  const amp = 1 + macro(params, data, 'amplitude');
  const pose = blank();
  stand(rig, pose, 0.08, 0.04);
  const br = Math.sin(TAU * phase);
  set(pose, 'spine', 0.02 * amp * br, -num(obj(params).twist) * 0.6, 0);
  set(pose, 'chest', 0.015 * amp * br - 0.12 * recoil, -num(obj(params).twist) * 0.4, 0);
  set(pose, 'head', 0.06, 0, 0);
  playerArms(rig, pose, recoil);
  return pose;
}

function terre(rig, phase, params, data) {
  const amp = 1 + macro(params, data, 'amplitude');
  const br = Math.sin(TAU * phase);
  const pose = blank();
  set(pose, 'pelvis', 1.45, 0, 0);
  set(pose, 'spine', -0.1 + 0.02 * amp * br, 0, 0);
  set(pose, 'chest', -0.15, 0, 0);
  set(pose, 'neck', -0.45, 0, 0);
  set(pose, 'head', -0.3, 0.2 * Math.sin(TAU * phase + 1) * amp, 0);
  for (const [s, side] of SIDES) {
    sideSet(pose, 'hip', s, side, side > 0 ? -0.5 : 0.1, 0, 0.1);
    sideSet(pose, 'knee', s, side, side > 0 ? 1.1 : 0.3, 0, 0);
    sideSet(pose, 'ankle', s, side, 0.4, 0, 0);
    sideSet(pose, 'shoulder', s, side, side > 0 ? -1.6 : -0.6, -0.2, 0.5);
    sideSet(pose, 'elbow', s, side, -1.2, 0, 0);
  }
  pose.scales.prop = 1;
  pose.scales.tool = 0;
  return pose;
}

// Réparation : coups de marteau ; un cycle = un coup, n coups par planche (repairTime / repair.strike arrondi, au moins 1).
export function strikesPerPlank(repairTime, data) {
  const r = obj(data.repair);
  const t = clamp(num(repairTime, 1.8), [num(r.min, 0.4), num(r.max, 1.8)]);
  return Math.max(1, Math.round(t / num(r.strike, 0.45)));
}
function reparation(rig, phase, params, data) {
  const amp = 1 + macro(params, data, 'amplitude');
  const up = blank();
  stand(rig, up, 0.35, 0.12);
  set(up, 'spine', 0.3, -0.1, 0);
  set(up, 'chest', 0.1, 0, 0);
  set(up, 'head', 0.35, 0, 0);
  sideSet(up, 'shoulder', 'L', 1, -1.3, -0.3, 0.05);
  sideSet(up, 'elbow', 'L', 1, -0.5, 0, 0);
  sideSet(up, 'shoulder', 'R', -1, -(1.6 + 0.6 * amp), -0.2, 0.15);
  sideSet(up, 'elbow', 'R', -1, -1.7, 0, 0);
  set(up, 'wristR', -0.6, 0, 0);
  const hit = blank();
  stand(rig, hit, 0.4, 0.12);
  set(hit, 'spine', 0.38, -0.1, 0);
  set(hit, 'chest', 0.12, 0, 0);
  set(hit, 'head', 0.4, 0, 0);
  sideSet(hit, 'shoulder', 'L', 1, -1.3, -0.3, 0.05);
  sideSet(hit, 'elbow', 'L', 1, -0.5, 0, 0);
  sideSet(hit, 'shoulder', 'R', -1, -1.15, -0.25, 0.1);
  sideSet(hit, 'elbow', 'R', -1, -0.25, 0, 0);
  set(hit, 'wristR', 0.3, 0, 0);
  for (const p of [up, hit]) {
    p.scales.prop = 0;
    p.scales.tool = 1;
  }
  return keyed([{ t: 0, pose: up }, { t: 0.55, pose: hit }, { t: 0.7, pose: hit }, { t: 1, pose: up }], phase);
}

// Pose d'une animation à une phase (cycles : 0 à 1 ; les animations cycliques se répètent). anim inconnue : attente (zombie) ou repos.
export function poseAt(rig, anim, phase, params = {}, data = {}) {
  const r = rig && Array.isArray(rig.joints) ? rig : rigOf({}, {});
  const d = obj(data);
  const known = r.kind === 'player' ? PLAYER_ANIMS : ZOMBIE_ANIMS;
  const a = known.includes(anim) ? anim : r.kind === 'player' ? 'repos' : 'attente';
  const raw = num(phase);
  const p = CYCLIC.includes(a) ? frac(raw) : clamp(raw, [0, 1]);
  let pose;
  if (a === 'marche' && r.kind === 'player') pose = locomote(r, p, params, d, 'player');
  else if (a === 'marche' || a === 'marcheLente' || a === 'escalier') pose = locomote(r, p, { stride: num(obj(d.strides)[a], 52), ...params }, d, a === 'escalier' ? 'escalier' : 'walk');
  else if (a === 'course') pose = locomote(r, p, { stride: num(obj(d.strides).course, 78), ...params }, d, 'run');
  else if (a === 'rampe') pose = groundLift(r, rampe(r, p, params, d), d);
  else if (a === 'arracher') pose = groundLift(r, arracher(r, p, params, d), d);
  else if (a === 'escalade') pose = groundLift(r, escalade(r, p, params, d), d);
  else if (a === 'attaque') pose = groundLift(r, attaque(r, p, params, d), d);
  else if (a === 'touche') return touche(r, p, params, d);
  else if (DEATHS.includes(a)) pose = groundLift(r, mort(r, a, p), d);
  else if (a === 'repos') pose = groundLift(r, repos(r, p, params, d), d);
  else if (a === 'tir') pose = groundLift(r, repos(r, 0, params, d, Math.sin(Math.PI * p) ** 2 * (1 - p) * 2.6), d);
  else if (a === 'terre') pose = groundLift(r, terre(r, p, params, d), d);
  else if (a === 'relevage') pose = groundLift(r, keyed([{ t: 0, pose: terre(r, 0, params, d) }, { t: 0.45, pose: kneelPose(r) }, { t: 1, pose: repos(r, 0, params, d) }], p), d);
  else if (a === 'reparation') pose = groundLift(r, reparation(r, p, params, d), d);
  else pose = groundLift(r, attente(r, p, params, d), d);
  if (r.kind !== 'player' && a !== 'rampe' && !DEATHS.includes(a)) applyPosture(r, pose, a === 'attaque' ? 0.5 : 1);
  if (r.kind === 'player' && pose.scales.prop === undefined) {
    pose.scales.prop = 1;
    pose.scales.tool = 0;
  }
  return pose;
}

function kneelPose(rig) {
  const pose = blank();
  sideSet(pose, 'hip', 'L', 1, -1.5, 0, 0.1);
  sideSet(pose, 'knee', 'L', 1, 1.6, 0, 0);
  sideSet(pose, 'ankle', 'L', 1, 0, 0, 0);
  sideSet(pose, 'hip', 'R', -1, 0.1, 0, 0.1);
  sideSet(pose, 'knee', 'R', -1, 1.9, 0, 0);
  sideSet(pose, 'ankle', 'R', -1, 0.3, 0, 0);
  set(pose, 'spine', 0.35, 0, 0);
  playerArms(rig, pose, 0);
  return pose;
}

// Fondu linéaire de deux poses (t borné à [0, 1]) ; une articulation absente d'un côté vaut zéro (échelle : 1).
export function blendPoses(a, b, t) {
  const k = clamp(num(t), [0, 1]);
  const A = obj(a);
  const B = obj(b);
  const out = blank();
  for (const key of ['angles', 'offsets']) {
    const ids = new Set([...Object.keys(obj(A[key])), ...Object.keys(obj(B[key]))]);
    for (const id of ids) {
      const x = Array.isArray(obj(A[key])[id]) ? A[key][id] : [0, 0, 0];
      const y = Array.isArray(obj(B[key])[id]) ? B[key][id] : [0, 0, 0];
      out[key][id] = [0, 1, 2].map((i) => num(x[i]) + (num(y[i]) - num(x[i])) * k);
    }
  }
  const sids = new Set([...Object.keys(obj(A.scales)), ...Object.keys(obj(B.scales))]);
  for (const id of sids) {
    const x = num(obj(A.scales)[id], 1);
    const y = num(obj(B.scales)[id], 1);
    out.scales[id] = k < 0.5 ? x : y;
  }
  return out;
}

// Ajoute une pose additive (touché) pondérée par w.
export function addPose(base, add, w = 1) {
  const out = blendPoses(base, base, 0);
  const k = num(w);
  for (const key of ['angles', 'offsets']) {
    for (const [id, v] of Object.entries(obj(obj(add)[key]))) {
      const cur = out[key][id] ?? [0, 0, 0];
      out[key][id] = [0, 1, 2].map((i) => cur[i] + num(v[i]) * k);
    }
  }
  return out;
}

// Durée d'un cycle en secondes pour les animations au temps (attente, escalade, attaque, réparation, terre, repos), selon le rythme.
export function cycleSeconds(rig, anim, params = {}, data = {}) {
  const d = obj(data);
  const speed = 1 + macro(params, d, 'rythme');
  const idle = num(styleOf(rig, d, 'idle').freq, 0.55);
  const climb = num(styleOf(rig, d, 'climb').freq, 0.8);
  const base = {
    attente: 1 / idle, escalade: 1 / climb, attaque: num(obj(d.durations).attaque, 1), repos: 3, terre: 2.5, tir: num(obj(d.durations).tir, 0.3),
    reparation: clamp(num(obj(params).repairTime, 1.8), [0.4, 1.8]) / strikesPerPlank(obj(params).repairTime, d),
  }[anim];
  if (!isNum(base)) return null;
  return anim === 'reparation' || anim === 'attaque' || anim === 'tir' ? base : base / Math.max(0.2, speed);
}
