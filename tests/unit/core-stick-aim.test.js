import { describe, it, expect } from 'vitest';
import { aimFromPoint, aimFromStick, createAim } from '../../js/core/aim.js';
import { stickKnob, stickVector } from '../../js/core/stick.js';

const O = { x: 100, y: 100 };

describe('stick.js', () => {
  it('donne un vecteur nul dans la zone morte', () => {
    expect(stickVector(O, { x: 103, y: 100 }, 56, 0.15)).toEqual({ x: 0, y: 0, magnitude: 0 });
  });

  it('atteint 1 au rayon maximal et ne le dépasse pas', () => {
    expect(stickVector(O, { x: 156, y: 100 }, 56).magnitude).toBeCloseTo(1);
    const far = stickVector(O, { x: 100000, y: 100 }, 56);
    expect(far.magnitude).toBe(1);
    expect(far.x).toBeCloseTo(1);
  });

  it('un doigt exactement sur l\'origine ne produit rien', () => {
    expect(stickVector(O, O)).toEqual({ x: 0, y: 0, magnitude: 0 });
  });

  it('gère les valeurs négatives (vers le haut et la gauche)', () => {
    const v = stickVector(O, { x: 44, y: 44 }, 56, 0);
    expect(v.x).toBeCloseTo(-0.707, 2);
    expect(v.y).toBeCloseTo(-0.707, 2);
  });

  it('progresse sans saut après la zone morte', () => {
    const a = stickVector(O, { x: 100 + 56 * 0.1501, y: 100 }, 56, 0.15).magnitude;
    expect(a).toBeLessThan(0.01);
  });

  it('retient le pouce dans le disque', () => {
    const k = stickKnob(O, { x: 1000, y: 100 }, 56);
    expect(k.x).toBeCloseTo(156);
    expect(stickKnob(O, { x: 110, y: 100 }, 56)).toEqual({ x: 110, y: 100 });
  });

  it('ne lève pas d\'exception sur des entrées inattendues et ne modifie pas les arguments', () => {
    for (const bad of [null, undefined, {}, 'a', NaN, { x: NaN, y: NaN }]) {
      expect(() => stickVector(bad, bad, bad, bad)).not.toThrow();
      expect(Number.isFinite(stickVector(bad, bad, bad, bad).x)).toBe(true);
      expect(() => stickKnob(bad, bad, bad)).not.toThrow();
    }
    const o = Object.freeze({ x: 1, y: 1 });
    expect(() => stickVector(o, Object.freeze({ x: 9, y: 9 }))).not.toThrow();
  });
});

describe('aim.js', () => {
  it('vise vers le pointeur', () => {
    expect(aimFromPoint(createAim(0), { x: 0, y: 0 }, { x: 0, y: 10 }).angle).toBeCloseTo(Math.PI / 2);
    expect(aimFromPoint(createAim(0), { x: 0, y: 0 }, { x: -10, y: 0 }).angle).toBeCloseTo(Math.PI);
  });

  it('pointeur sur le joueur : pas d\'exception, angle conservé', () => {
    expect(aimFromPoint(createAim(1.25), { x: 5, y: 5 }, { x: 5, y: 5 }).angle).toBe(1.25);
  });

  it('le stick au repos garde la dernière direction', () => {
    const first = aimFromStick(createAim(0), { x: 0, y: -1 });
    expect(first.angle).toBeCloseTo(-Math.PI / 2);
    expect(aimFromStick(first, { x: 0, y: 0 }).angle).toBe(first.angle);
  });

  it('ne lève pas d\'exception et ne modifie pas ses arguments', () => {
    for (const bad of [null, undefined, {}, 'x', NaN]) {
      expect(Number.isFinite(aimFromPoint(bad, bad, bad).angle)).toBe(true);
      expect(Number.isFinite(aimFromStick(bad, bad).angle)).toBe(true);
    }
    const prev = Object.freeze({ angle: 2 });
    expect(aimFromStick(prev, { x: 1, y: 0 })).not.toBe(prev);
    expect(prev.angle).toBe(2);
  });
});
