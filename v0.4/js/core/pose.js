// Poses d'animation : angles des articulations en radians, calculés sans rendu, sans DOM ni horloge (le temps arrive en argument).
// Convention : un angle positif porte le membre vers l'avant (hanche, épaule) ou le plie (genou, coude).
import { createRng, nextFloat } from './rng.js';
import { isNum } from './vec.js';

export const STATES = ['marche', 'arret', 'tir', 'zombie', 'lent', 'rampe', 'course'];
// Allures de zombie : « zombie » reste l'équivalent de « marche » ; les trois autres sont purement visuelles (lot 2).
export const ZOMBIE_STATES = ['zombie', 'lent', 'rampe', 'course'];
// Lot 3 : poses du siège (arracher une planche, escalader une fenêtre) et du joueur à terre. Purement visuelles ; STATES et ZOMBIE_STATES
// restent ceux des lots précédents.
export const SIEGE_STATES = ['arracher', 'escalade'];
export const DOWN_STATE = 'terre';
const KNOWN_STATES = [...STATES, ...SIEGE_STATES, DOWN_STATE];
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
  // Lot 2 : hauteur du bassin (en longueurs de jambe, 0 = debout, négatif = abaissé) et inclinaison du tronc vers l'avant (radians, en plus
  // de celle du personnage). Nulles pour les états du lot 1.
  pelvisHeight: [-1, 0.2],
  torsoPitch: [-0.3, 1.5],
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
  const state = KNOWN_STATES.includes(src.state) ? src.state : 'arret';
  const phase = wrap(num(src.phase));
  const time = num(src.time);
  const recoil = clamp(num(src.recoil), LIMITS.recoil);
  const defaultAmount = state === 'marche' || state === 'tir' ? 1 : ZOMBIE_STATES.includes(state) ? 0.7 : 0;
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
    pelvisHeight: 0,
    torsoPitch: 0,
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
  } else if (state === 'lent') {
    // Marche lente : petite amplitude, pas traînés, tête penchée, bras mollement tendus.
    const t = zombieTraits(src.seed);
    const sway = Math.sin(time * t.freq * 1.4 + t.offset);
    pose.hipL = 0.28 * amount * swing;
    pose.hipR = -0.28 * amount * swing;
    pose.kneeL = 0.1 + 0.35 * amount * Math.max(0, lift);
    pose.kneeR = 0.1 + 0.35 * amount * Math.max(0, -lift);
    const dragged = t.drag > 0 ? 'R' : 'L';
    pose[`knee${dragged}`] = 0.08;
    pose[`hip${dragged}`] *= 0.4;
    pose.shoulderL = 0.95 + 0.08 * sway;
    pose.shoulderR = 0.9 - 0.08 * sway;
    pose.elbowL = 0.35 + 0.08 * Math.sin(time * t.freq * 2 + t.offset);
    pose.elbowR = 0.4 - 0.08 * Math.sin(time * t.freq * 2 + t.offset);
    pose.torsoTwist = 0.12 * Math.sin(time * t.freq * 0.8 + t.offset);
    pose.headTilt = 0.55 + 0.08 * sway;
    pose.bob = 0.2 * amount * Math.abs(lift) + 0.04 * Math.abs(sway);
    pose.torsoPitch = 0.12;
  } else if (state === 'course') {
    // Course : grande amplitude, tronc penché en avant, bras tendus qui balancent.
    const t = zombieTraits(src.seed);
    const sway = Math.sin(time * t.freq * 2 + t.offset);
    pose.hipL = 0.8 * amount * swing;
    pose.hipR = -0.8 * amount * swing;
    pose.kneeL = 0.15 + 1.1 * amount * Math.max(0, lift);
    pose.kneeR = 0.15 + 1.1 * amount * Math.max(0, -lift);
    pose.shoulderL = 1.15 + 0.5 * amount * swing;
    pose.shoulderR = 1.15 - 0.5 * amount * swing;
    pose.elbowL = 0.2 + 0.15 * sway;
    pose.elbowR = 0.2 - 0.15 * sway;
    pose.torsoTwist = 0.1 * swing * amount;
    pose.headTilt = 0.25 + 0.08 * sway;
    pose.bob = 0.6 * amount * Math.abs(lift) + 0.03 * Math.abs(sway);
    pose.torsoPitch = 0.4;
  } else if (state === 'rampe') {
    // Rampe : corps abaissé, tronc presque horizontal, bras qui tirent à tour de rôle, jambes qui traînent derrière.
    const t = zombieTraits(src.seed);
    const sway = Math.sin(time * t.freq * 2 + t.offset);
    pose.hipL = -0.55 - 0.25 * amount * swing;
    pose.hipR = -0.55 + 0.25 * amount * swing;
    pose.kneeL = 1.0 + 0.4 * amount * Math.max(0, lift);
    pose.kneeR = 1.0 + 0.4 * amount * Math.max(0, -lift);
    pose.shoulderL = 1.15 + 0.5 * amount * Math.max(0, swing) - 0.15;
    pose.shoulderR = 1.15 + 0.5 * amount * Math.max(0, -swing) - 0.15;
    pose.elbowL = 0.3 + 0.5 * amount * Math.max(0, -swing);
    pose.elbowR = 0.3 + 0.5 * amount * Math.max(0, swing);
    pose.torsoTwist = 0.15 * amount * swing;
    pose.headTilt = -0.35 + 0.08 * sway;
    pose.bob = 0.05 + 0.04 * amount * Math.abs(lift);
    pose.pelvisHeight = -0.25;
    pose.torsoPitch = 1.3;
  } else if (state === 'arracher') {
    // Arrachage : pieds immobiles, tronc penché, bras tendus qui tirent à tour de rôle au rythme de la phase (avancée par le jeu avec
    // la progression de l'arrachage).
    const t = zombieTraits(src.seed);
    const pull = Math.sin(phase);
    const pullL = Math.max(0, pull);
    const pullR = Math.max(0, -pull);
    pose.hipL = 0.12;
    pose.hipR = -0.12;
    pose.kneeL = 0.12;
    pose.kneeR = 0.12;
    pose.shoulderL = 1.5 - 0.55 * pullL;
    pose.shoulderR = 1.5 - 0.55 * pullR;
    pose.elbowL = 0.15 + 1.0 * pullL;
    pose.elbowR = 0.15 + 1.0 * pullR;
    pose.torsoTwist = 0.1 * pull;
    pose.headTilt = 0.4 + 0.05 * Math.sin(time * t.freq + t.offset);
    pose.bob = 0.04 + 0.03 * Math.abs(pull);
    pose.torsoPitch = 0.3 + 0.1 * Math.abs(pull);
  } else if (state === 'escalade') {
    // Escalade : tronc penché de 0,35 rad, jambes écartées, bras en appui sur le rebord.
    pose.hipL = 0.6;
    pose.hipR = -0.4;
    pose.kneeL = 0.5;
    pose.kneeR = 0.25;
    pose.shoulderL = 1.0;
    pose.shoulderR = 1.0;
    pose.elbowL = 0.6;
    pose.elbowR = 0.6;
    pose.torsoTwist = 0;
    pose.headTilt = 0.3;
    pose.bob = 0.1;
    pose.pelvisHeight = -0.08;
    pose.torsoPitch = 0.35;
  } else if (state === 'terre') {
    // Joueur à terre : corps abaissé et presque horizontal (plus bas que la rampe), bras mous, sans mouvement.
    pose.hipL = -0.5;
    pose.hipR = -0.4;
    pose.kneeL = 1.1;
    pose.kneeR = 0.9;
    pose.shoulderL = -0.3;
    pose.shoulderR = -0.5;
    pose.elbowL = 0.3;
    pose.elbowR = 0.2;
    pose.torsoTwist = 0;
    pose.headTilt = 0.3;
    pose.bob = 0.02;
    pose.pelvisHeight = -0.5;
    pose.torsoPitch = 1.5;
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
