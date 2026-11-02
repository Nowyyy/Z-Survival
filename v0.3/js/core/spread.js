// Cône de tir : la balle part dans un cône autour de l'axe de visée. Le demi-angle dépend du mouvement du joueur (rapport de vitesse lissé)
// et de la statistique de précision. Pur : le temps arrive en argument, le hasard vient de rng.js (état passé et retourné).
import { nextFloat } from './rng.js';
import { clampDt, isNum, num } from './vec.js';

const DEG = Math.PI / 180;

// Vitesse actuelle / vitesse maximale effective, bornée à [0, 1] ; valeurs invalides = 0.
export function speedRatio(speed, maxSpeed) {
  if (!isNum(speed) || !isNum(maxSpeed) || maxSpeed <= 0) return 0;
  return Math.min(1, Math.max(0, speed / maxSpeed));
}

// Lissage exponentiel indépendant de la cadence d'images : s'ouvre en widenTime quand la cible monte, se referme en narrowTime quand elle
// baisse (constante de temps : 63 % du chemin parcouru en ce temps). dt est borné comme partout (0 à 0,05 s).
export function stepSpreadRatio(previous, target, dt, widenTime, narrowTime) {
  const from = Math.min(1, Math.max(0, num(previous)));
  const to = Math.min(1, Math.max(0, num(target)));
  const step = clampDt(dt);
  if (step === 0) return from;
  const tau = Math.max(1e-6, num(to > from ? widenTime : narrowTime));
  return Math.min(1, Math.max(0, to + (from - to) * Math.exp(-step / tau)));
}

// Demi-angle du cône en degrés : max(plancher, base + ratio × surcroît), d'après statValues (stillAngle, moveAngle, minAngle).
export function spreadHalfAngle(ratio, values) {
  const r = Math.min(1, Math.max(0, num(ratio)));
  return Math.max(num(values?.minAngle), num(values?.stillAngle) + r * num(values?.moveAngle));
}

// Angle réel de la balle : décalage = demi-angle × (u1 + u2 − 1), loi triangulaire dans [−demi-angle, +demi-angle] centrée sur l'axe.
// halfAngleRadians nul, négatif ou invalide : angle exact (les deux tirages sont quand même consommés pour garder la suite stable).
// Renvoie { angle, rng, offset }.
export function shotAngle(aimAngle, halfAngleRadians, rngState) {
  const a = nextFloat(rngState);
  const b = nextFloat(a.rng);
  const half = isNum(halfAngleRadians) && halfAngleRadians > 0 ? halfAngleRadians : 0;
  const offset = half * (a.value + b.value - 1);
  return { angle: num(aimAngle) + offset, rng: b.rng, offset };
}

export const toRadians = (degrees) => num(degrees) * DEG;
