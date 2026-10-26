import { describe, it, expect } from 'vitest';
import { variantFor } from '../../js/core/variants.js';
import { WEIRD } from './helpers/monde.js';

const counts = (n, seed, count, from = 1) => {
  const c = Array(count).fill(0);
  for (let id = from; id < from + n; id += 1) c[variantFor(id, seed, count)] += 1;
  return c;
};

describe('variants : variantFor(id, graine, nombre)', () => {
  it('est déterministe', () => {
    for (let id = 0; id < 100; id += 1) expect(variantFor(id, 42, 4)).toBe(variantFor(id, 42, 4));
  });

  it('renvoie toujours un indice entier dans [0, count)', () => {
    for (const count of [1, 2, 3, 4, 7]) for (let id = 0; id < 200; id += 1) {
      const v = variantFor(id, 7, count);
      expect(Number.isInteger(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(count);
    }
  });

  it('répartit 1 000 identifiants à parts égales (écart d\'au plus 1 avec 4 variantes)', () => {
    const c = counts(1000, 3, 4, 0);
    expect(Math.max(...c) - Math.min(...c)).toBeLessThanOrEqual(1);
    expect(c.reduce((a, b) => a + b)).toBe(1000);
  });

  it('chaque bloc de `count` identifiants consécutifs contient chaque variante une fois', () => {
    for (let block = 0; block < 25; block += 1) {
      const seen = new Set();
      for (let k = 0; k < 4; k += 1) seen.add(variantFor(block * 4 + k, 11, 4));
      expect(seen.size).toBe(4);
    }
  });

  it('l\'équilibre tient aussi sur une grille d\'identifiants décalée et avec d\'autres nombres', () => {
    for (const [seed, count, from] of [[1, 3, 17], [99, 5, 1000], [0, 2, 5]]) {
      const c = counts(600, seed, count, from);
      expect(Math.max(...c) - Math.min(...c)).toBeLessThanOrEqual(2);
    }
  });

  it('deux graines donnent deux ordres différents', () => {
    const a = Array.from({ length: 40 }, (_, i) => variantFor(i, 1, 4));
    const b = Array.from({ length: 40 }, (_, i) => variantFor(i, 2, 4));
    expect(a).not.toEqual(b);
  });

  it('un zombie qui apparaît ne change pas de variante quand d\'autres apparaissent', () => {
    const first = [1, 2, 3, 4, 5].map((id) => variantFor(id, 5, 4));
    expect([1, 2, 3, 4, 5, 6, 7].map((id) => variantFor(id, 5, 4)).slice(0, 5)).toEqual(first);
  });

  it.each([0, -1, -10, NaN, 0.5, undefined, null, 'x'])('count %j : indice 0, sans exception', (count) => {
    expect(variantFor(5, 1, count)).toBe(0);
  });

  it.each(WEIRD)('identifiant et graine %j : sans exception, indice valide', (w) => {
    const v = variantFor(w, w, 4);
    expect(v).toBeGreaterThanOrEqual(0);
    expect(v).toBeLessThan(4);
  });
});
