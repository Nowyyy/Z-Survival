// Poses d'animation (test 3D jetable) : angles des articulations en radians, sans Three ni DOM.
// Convention : un angle positif porte le membre vers l'avant (hanche, épaule) ou le plie (genou, coude).
import { createRng, nextFloat } from '../core/rng.js';
import { isNum } from '../core/vec.js';

export const STATES = ['marche', 'arret', 'tir', 'zombie'];
const TAU = Math.PI * 2;

// Bornes plausibles de chaque angle (min, max).
export const LIMITS = {
  hipL: [-0.9, 0.9], hipR: [-0.9, 0.9],
  kneeL: [0, 1.6], kneeR: [0, 1.6],
  shoulderL: [-0.9, 1.7], shoulderR: [-0.9, 1.7],
  elbowL: [0, 2.2], elbowR: [0, 2.2],
  inwardL: [0, 0.8], inwardR: [0, 0.8],
  torsoTwist: [-1.75, 1.75],
  headTilt: [-0.6, 0.8],
  bob: [0, 1],
  recoil: [0, 1],
};

const num = (n, fallback = 0) => (isNum(n) ? n : fallback);
const clamp = (n, [lo, hi]) => Math.min(Math.max(n, lo), hi);
const wrap = (a) => {
  const r = a % TAU;
  return r > Math.PI ? r - TAU : r < -Math.PI ? r + TAU : r;
};

// Balancement et déphasage propres à un zombie, tirés de sa graine (deux tirages de rng.js).
export function zombieTraits(seed) {
  const a = nextFloat(createRng(isNum(seed) ? seed : 1));
  const b = nextFloat(a.rng);
  return { freq: 0.7 + a.value * 0.6, offset: b.value * TAU, drag: a.value > 0.5 ? 1 : -1 };
}

// input : { phase, aim, facing, state, time, seed, amount, recoil }. Ne lève jamais d'exception, ne modifie pas input.
// phase : phase de marche (radians, avance avec la distance) ; aim, facing : angles de visée et de jambes ;
// amount : 0 à 1, vitesse de marche relative ; recoil : 0 à 1, recul du tir.
export function computePose(input) {
  const src = input !== null && typeof input === 'object' ? input : {};
  const state = STATES.includes(src.state) ? src.state : 'arret';
  const phase = wrap(num(src.phase));
  const time = num(src.time);
  const recoil = clamp(num(src.recoil), LIMITS.recoil);
  const defaultAmount = state === 'marche' || state === 'tir' ? 1 : state === 'zombie' ? 0.7 : 0;
  const amount = Math.min(Math.max(num(src.amount, defaultAmount), 0), 1);
  const swing = Math.sin(phase);
  const lift = Math.cos(phase);
  const breath = Math.sin(time * 2);

  const pose = {
    hipL: 0.55 * amount * swing,
    hipR: -0.55 * amount * swing,
    kneeL: 0.08 + 0.8 * amount * Math.max(0, lift),
    kneeR: 0.08 + 0.8 * amount * Math.max(0, -lift),
    shoulderL: 0,
    shoulderR: 0,
    elbowL: 0,
    elbowR: 0,
    inwardL: 0,
    inwardR: 0,
    torsoTwist: 0,
    headTilt: 0.04 * breath,
    bob: 0.5 * amount * Math.abs(lift) + 0.03 * breath * (1 - amount),
    recoil,
  };

  if (state === 'zombie') {
    const t = zombieTraits(src.seed);
    const sway = Math.sin(time * t.freq * 2 + t.offset);
    pose.hipL = 0.45 * amount * swing;
    pose.hipR = -0.45 * amount * swing;
    // Jambe traînante : un genou presque tendu, la hanche qui balance moins.
    const dragged = t.drag > 0 ? 'R' : 'L';
    pose[`knee${dragged}`] = 0.1;
    pose[`hip${dragged}`] *= 0.5;
    pose.shoulderL = 1.4 + 0.12 * sway;
    pose.shoulderR = 1.35 - 0.12 * sway;
    pose.elbowL = 0.25 + 0.1 * Math.sin(time * t.freq * 3 + t.offset);
    pose.elbowR = 0.3 - 0.1 * Math.sin(time * t.freq * 3 + t.offset);
    pose.torsoTwist = 0.22 * Math.sin(time * t.freq + t.offset);
    pose.headTilt = 0.45 + 0.12 * sway;
    pose.bob = 0.35 * amount * Math.abs(lift) + 0.04 * Math.abs(sway);
  } else {
    // Joueur : arme tenue à deux mains, bras de devant qui balancent à peine pendant la marche.
    const aimed = state === 'tir';
    pose.shoulderR = (aimed ? 1.42 : 1.3) - 0.35 * recoil + 0.06 * amount * swing;
    pose.shoulderL = (aimed ? 1.3 : 1.18) - 0.2 * recoil + 0.06 * amount * swing;
    pose.elbowR = 0.22 + 0.5 * recoil;
    pose.elbowL = 0.55 + 0.3 * recoil;
    pose.inwardR = 0.5;
    pose.inwardL = 0.62;
    // Le tronc se tourne vers la visée, les jambes suivent le déplacement.
    pose.torsoTwist = isNum(src.aim) && isNum(src.facing) ? wrap(src.aim - src.facing) : 0;
  }

  for (const key of Object.keys(LIMITS)) pose[key] = clamp(num(pose[key]), LIMITS[key]);
  return pose;
}
