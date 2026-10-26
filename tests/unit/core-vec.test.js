import { describe, it, expect } from 'vitest';
import { add, angleOf, clampDt, distance, fromAngle, length, normalize, scale, sub, vec } from '../../js/core/vec.js';

describe('vec.js', () => {
  it('normalise un vecteur ordinaire', () => {
    const n = normalize({ x: 3, y: 4 });
    expect(n.x).toBeCloseTo(0.6);
    expect(n.y).toBeCloseTo(0.8);
  });

  it('laisse le vecteur nul nul, sans erreur', () => {
    expect(normalize({ x: 0, y: 0 })).toEqual({ x: 0, y: 0 });
  });

  it.each([[null], [undefined], [{}], ['abc'], [42], [{ x: NaN, y: NaN }], [{ x: Infinity, y: 1 }]])('ne lève pas d\'exception sur %j', (input) => {
    const n = normalize(input);
    expect(Number.isFinite(n.x) && Number.isFinite(n.y)).toBe(true);
    expect(() => [add(input, input), sub(input, input), scale(input, input), length(input), distance(input, input), angleOf(input)]).not.toThrow();
  });

  it('reste fini sur des valeurs extrêmes', () => {
    const n = normalize({ x: 1e308, y: 1e308 });
    expect(Math.hypot(n.x, n.y)).toBeCloseTo(1);
    expect(normalize({ x: 1e-320, y: 0 }).x).toBeCloseTo(1);
  });

  it('ne modifie pas ses arguments gelés', () => {
    const a = Object.freeze({ x: 1, y: 2 });
    const b = Object.freeze({ x: 3, y: 4 });
    expect(() => [add(a, b), sub(a, b), scale(a, 2), normalize(a)]).not.toThrow();
    expect(a).toEqual({ x: 1, y: 2 });
  });

  it('calcule angle, direction et distance', () => {
    expect(fromAngle(0)).toEqual({ x: 1, y: 0 });
    expect(angleOf({ x: 0, y: 1 })).toBeCloseTo(Math.PI / 2);
    expect(distance({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(5);
    expect(vec('a', NaN)).toEqual({ x: 0, y: 0 });
  });

  it('borne le pas de temps à 0,05 s, jamais négatif', () => {
    expect(clampDt(0.016)).toBe(0.016);
    expect(clampDt(10)).toBe(0.05);
    expect(clampDt(-1)).toBe(0);
    expect(clampDt(NaN)).toBe(0);
    expect(clampDt('1')).toBe(0);
  });
});
