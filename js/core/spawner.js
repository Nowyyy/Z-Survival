// Apparition de démonstration : toutes les N secondes, à l'une des ouvertures de fenêtre, jamais plus de maxPresent.
import { nextInt } from './rng.js';
import { clampDt, isNum, num } from './vec.js';

export const createSpawner = () => ({ timer: 0 });

// Renvoie { state, spawn: { x, y } | null, rng }. Le délai ne court que tant qu'il reste de la place.
export function stepSpawner(state, dt, present, def, windows, rng) {
  const interval = isNum(def?.spawnInterval) && def.spawnInterval > 0 ? def.spawnInterval : Infinity;
  const max = isNum(def?.maxPresent) ? def.maxPresent : 0;
  const spots = Array.isArray(windows) ? windows.filter((w) => isNum(w?.x) && isNum(w?.y)) : [];
  if (num(present) >= max || spots.length === 0) return { state: { timer: 0 }, spawn: null, rng };
  const timer = num(state?.timer) + clampDt(dt);
  if (timer < interval) return { state: { timer }, spawn: null, rng };
  const { value, rng: next } = nextInt(rng, spots.length);
  return { state: { timer: timer - interval }, spawn: { x: spots[value].x, y: spots[value].y }, rng: next };
}
