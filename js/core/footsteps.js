// Pas du joueur : à partir de la phase de marche (celle de pose.js : la hanche gauche est la plus avancée à π/2, la droite à 3π/2),
// dit si un pied se pose entre deux images. Jamais de pas à l'arrêt, jamais deux pas à moins de minInterval.
import { isNum, num } from './vec.js';

const HALF_PI = Math.PI / 2;

export const createFootsteps = () => ({ lastTime: -Infinity });

// prev, next : phases avant et après (radians, non bornées) ; speed : vitesse réelle (unités/s) ; maxSpeed : vitesse de course ;
// cfg : { minSpeed, minInterval, minVolume }. Retourne { state, step } avec step = null ou { foot: 'gauche' | 'droit', volume }.
export function stepFootsteps(state, prev, next, speed, time, maxSpeed, cfg) {
  const last = isNum(state?.lastTime) ? state.lastTime : -Infinity;
  const none = { state: { lastTime: last }, step: null };
  if (!isNum(prev) || !isNum(next) || !isNum(time)) return none;
  const v = Math.abs(num(speed));
  if (v < num(cfg?.minSpeed, 20)) return none;
  const a = Math.floor((prev - HALF_PI) / Math.PI);
  const b = Math.floor((next - HALF_PI) / Math.PI);
  if (a === b) return none;
  if (time - last < num(cfg?.minInterval, 0.15) - 1e-6) return none; // tolérance : des images de 1/60 s tombent exactement à 0,15 s
  const top = Math.max(1, num(maxSpeed, 220));
  const minVolume = num(cfg?.minVolume, 0.35);
  const volume = minVolume + (1 - minVolume) * Math.min(1, v / top);
  // L'indice du dernier seuil franchi donne le pied : pair = gauche, impair = droit (dans les deux sens de marche).
  const index = b > a ? b : a;
  return { state: { lastTime: time }, step: { foot: index % 2 === 0 ? 'gauche' : 'droit', volume } };
}
