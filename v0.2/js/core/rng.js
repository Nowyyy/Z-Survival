// Générateur pseudo-aléatoire à graine (mulberry32), sans état caché : chaque tirage renvoie un nouvel état.
import { isNum } from './vec.js';

export function createRng(seed = 1) {
  return { state: isNum(seed) ? Math.trunc(seed) >>> 0 : 1 };
}

// Renvoie { value in [0, 1), rng } sans modifier l'argument.
export function nextFloat(rng) {
  const base = isNum(rng?.state) ? rng.state >>> 0 : 1;
  const state = (base + 0x6d2b79f5) >>> 0;
  let t = state;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return { value: ((t ^ (t >>> 14)) >>> 0) / 4294967296, rng: { state } };
}

// Entier dans [0, max) ; max invalide ou inférieur à 1 donne 0.
export function nextInt(rng, max) {
  const { value, rng: next } = nextFloat(rng);
  const n = isNum(max) && max >= 1 ? Math.floor(max) : 1;
  return { value: Math.min(n - 1, Math.floor(value * n)), rng: next };
}
