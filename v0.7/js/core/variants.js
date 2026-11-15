// Variantes de personnages : un identifiant donne toujours la même variante pour une graine donnée, et les variantes sont réparties
// à parts égales (chaque bloc de `count` identifiants consécutifs contient chaque variante une fois, dans un ordre tiré de la graine).
import { createRng, nextInt } from './rng.js';
import { isNum } from './vec.js';

// Permutation de 0..count-1 propre au bloc (Fisher-Yates avec rng.js).
function permutation(seed, block, count) {
  let rng = createRng((Math.imul(seed | 0, 0x9e3779b1) ^ Math.imul(block | 0, 0x85ebca6b)) >>> 0);
  const order = Array.from({ length: count }, (_, i) => i);
  for (let i = count - 1; i > 0; i -= 1) {
    const r = nextInt(rng, i + 1);
    rng = r.rng;
    [order[i], order[r.value]] = [order[r.value], order[i]];
  }
  return order;
}

// Indice de variante dans [0, count) ; count < 1 ou invalide donne 0.
export function variantFor(id, seed, count) {
  const n = isNum(count) ? Math.floor(count) : 0;
  if (n < 2) return 0;
  const k = isNum(id) ? Math.abs(Math.trunc(id)) : 0;
  const s = isNum(seed) ? Math.trunc(seed) : 0;
  return permutation(s, Math.floor(k / n), n)[k % n];
}
