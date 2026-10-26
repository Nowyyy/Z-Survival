// Statistiques de temps d'image (millisecondes) : pures, sans exception, sans modifier l'argument.
import { isNum } from '../core/vec.js';

export const LONG_FRAME_MS = 50;

// Copie triée des durées valides (nombres finis strictement positifs).
export const clean = (durations) => (Array.isArray(durations) ? durations.filter((d) => isNum(d) && d > 0).sort((a, b) => a - b) : []);

const sum = (list) => list.reduce((acc, d) => acc + d, 0);

export function mean(durations) {
  const list = clean(durations);
  return list.length ? sum(list) / list.length : 0;
}

// Centile p (0 à 100), interpolation linéaire entre deux valeurs voisines.
export function percentile(durations, p) {
  const list = clean(durations);
  if (list.length === 0) return 0;
  const q = Math.min(Math.max(isNum(p) ? p : 0, 0), 100) / 100;
  const pos = q * (list.length - 1);
  const lo = Math.floor(pos);
  const hi = Math.min(list.length - 1, lo + 1);
  return list[lo] + (list[hi] - list[lo]) * (pos - lo);
}

export const median = (durations) => percentile(durations, 50);

// Images par seconde moyennes d'une liste de durées.
export function fps(durations) {
  const m = mean(durations);
  return m > 0 ? 1000 / m : 0;
}

// « 1 % bas » : images par seconde de la moyenne des 1 % d'images les plus lentes (au moins une image).
export function low1(durations) {
  const list = clean(durations);
  if (list.length === 0) return 0;
  const n = Math.max(1, Math.ceil(list.length / 100));
  const worst = list.slice(-n);
  return 1000 / (sum(worst) / worst.length);
}

export const longFrames = (durations, limit = LONG_FRAME_MS) => clean(durations).filter((d) => d > (isNum(limit) ? limit : LONG_FRAME_MS)).length;

export function summarize(durations) {
  const list = clean(durations);
  return {
    frames: list.length,
    fps: fps(list),
    median: median(list),
    p95: percentile(list, 95),
    low1: low1(list),
    long: longFrames(list),
  };
}
