import { describe, it, expect } from 'vitest';
import { createRng, nextFloat, nextInt } from '../../js/core/rng.js';

const draw = (seed, n) => {
  let rng = createRng(seed);
  const out = [];
  for (let i = 0; i < n; i += 1) {
    const r = nextFloat(rng);
    out.push(r.value);
    rng = r.rng;
  }
  return out;
};

describe('rng.js', () => {
  it('donne la même suite pour la même graine', () => {
    expect(draw(42, 20)).toEqual(draw(42, 20));
  });

  it('donne des suites différentes pour des graines différentes', () => {
    expect(draw(1, 10)).not.toEqual(draw(2, 10));
  });

  it('reste dans [0, 1) et ne modifie pas l\'état reçu', () => {
    const rng = Object.freeze(createRng(7));
    for (const v of draw(7, 500)) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
    nextFloat(rng);
    expect(rng.state).toBe(7);
  });

  it('tire des entiers bornés et se comporte sur des entrées absurdes', () => {
    let rng = createRng(3);
    for (let i = 0; i < 200; i += 1) {
      const r = nextInt(rng, 3);
      expect([0, 1, 2]).toContain(r.value);
      rng = r.rng;
    }
    for (const bad of [null, undefined, {}, 'x', NaN, -2, 0]) expect(nextInt(createRng(bad), bad).value).toBe(0);
    expect(() => nextFloat(null)).not.toThrow();
  });
});
