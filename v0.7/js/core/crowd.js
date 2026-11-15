// Foule de la mini-arène (lot 3j) : apparition en couronne, types et allures variés, approche en ligne droite vers une cible, plus proche
// vivant. Pur : graine (rng.js), aucune collision, aucune horloge ; arguments jamais modifiés.
import { createRng, nextFloat, nextInt } from './rng.js';
import { isNum } from './vec.js';

export const TYPES = ['marcheur', 'petit', 'voute', 'grand'];
export const GAITS = ['lent', 'marche', 'rampe', 'course'];
const num = (v, d = 0) => (isNum(v) ? v : d);

// n zombies répartis sur un cercle de rayon `radius` autour de (0, 0), angles réguliers décalés au hasard ; types : chaque bloc de 4
// contient les 4 types dans un ordre tiré ; allures tirées. Renvoie [{ id, type, gait, x, y }].
export function ringSpawn(seed, n, radius) {
  let rng = createRng(Math.trunc(num(seed, 1)));
  const count = Math.max(0, Math.min(64, Math.floor(num(n))));
  const r0 = Math.max(1, num(radius, 300));
  const f = nextFloat(rng);
  rng = f.rng;
  const start = f.value * Math.PI * 2;
  const out = [];
  let order = [];
  for (let i = 0; i < count; i += 1) {
    if (order.length === 0) {
      order = [...TYPES];
      for (let k = order.length - 1; k > 0; k -= 1) {
        const r = nextInt(rng, k + 1);
        rng = r.rng;
        [order[k], order[r.value]] = [order[r.value], order[k]];
      }
    }
    const g = nextInt(rng, GAITS.length);
    rng = g.rng;
    const j = nextFloat(rng);
    rng = j.rng;
    const a = start + (i / Math.max(1, count)) * Math.PI * 2 + (j.value - 0.5) * 0.3;
    const d = r0 * (0.85 + 0.3 * j.value);
    out.push({ id: i + 1, type: order.shift(), gait: GAITS[g.value], x: Math.cos(a) * d, y: Math.sin(a) * d });
  }
  return out;
}

// Avance vers la cible à `speed` pendant dt sans la dépasser ni approcher à moins de `stop` ; renvoie { x, y, moved, arrived }.
export function approach(from, target, speed, dt, stop = 0) {
  const dx = num(target?.x) - num(from?.x);
  const dy = num(target?.y) - num(from?.y);
  const d = Math.hypot(dx, dy);
  const room = Math.max(0, d - Math.max(0, num(stop)));
  const step = Math.min(room, Math.max(0, num(speed)) * Math.max(0, num(dt)));
  if (d < 1e-9 || step <= 0) return { x: num(from?.x), y: num(from?.y), moved: 0, arrived: room <= 1e-9 };
  return { x: num(from?.x) + (dx / d) * step, y: num(from?.y) + (dy / d) * step, moved: step, arrived: room - step <= 1e-9 };
}

// Le plus proche des vivants (alive !== false) d'un point ; null s'il n'y en a aucun.
export function nearest(list, point) {
  let best = null;
  let bd = Infinity;
  for (const z of Array.isArray(list) ? list : []) {
    if (z?.alive === false) continue;
    const d = Math.hypot(num(z.x) - num(point?.x), num(z.y) - num(point?.y));
    if (d < bd) {
      bd = d;
      best = z;
    }
  }
  return best;
}
