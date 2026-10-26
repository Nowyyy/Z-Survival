import { describe, it, expect } from 'vitest';
import { LIMITS, STATES, computePose, zombieTraits } from '../../js/core/pose.js';

const TAU = Math.PI * 2;
const base = { phase: 0.7, aim: 0.4, facing: -0.2, time: 3.1, seed: 5 };
const allFinite = (pose) => Object.values(pose).every((v) => Number.isFinite(v));
const inLimits = (pose) => Object.entries(LIMITS).every(([k, [lo, hi]]) => pose[k] >= lo && pose[k] <= hi);

describe('pose.js : valeurs et bornes', () => {
  it.each(STATES)('état %s : toutes les valeurs sont finies et dans les bornes', (state) => {
    for (let phase = -10; phase <= 10; phase += 0.37) {
      const pose = computePose({ ...base, state, phase });
      expect(allFinite(pose)).toBe(true);
      expect(inLimits(pose)).toBe(true);
    }
  });

  it('un état inconnu se comporte comme l\'arrêt, sans exception', () => {
    expect(computePose({ ...base, state: 'danse' })).toEqual(computePose({ ...base, state: 'arret' }));
  });

  it.each([null, undefined, 'texte', 42, [], {}, NaN, () => 1])('entrée hostile %s : pose finie dans les bornes', (input) => {
    const pose = computePose(input);
    expect(allFinite(pose)).toBe(true);
    expect(inLimits(pose)).toBe(true);
  });

  it('des champs hostiles (NaN, Infinity, chaînes) donnent une pose valide', () => {
    const pose = computePose({ phase: NaN, aim: 'x', facing: Infinity, state: 'tir', time: -Infinity, seed: 'a', amount: 'b', recoil: NaN });
    expect(allFinite(pose)).toBe(true);
    expect(inLimits(pose)).toBe(true);
  });

  it('ne modifie pas un argument gelé', () => {
    const frozen = Object.freeze({ ...base, state: 'tir' });
    expect(() => computePose(frozen)).not.toThrow();
    expect(frozen).toEqual({ ...base, state: 'tir' });
  });
});

describe('pose.js : phase de marche', () => {
  it('est périodique (2π)', () => {
    const a = computePose({ ...base, state: 'marche', phase: 1.1 });
    const b = computePose({ ...base, state: 'marche', phase: 1.1 + TAU * 3 });
    for (const k of Object.keys(a)) expect(b[k]).toBeCloseTo(a[k], 6);
  });

  it('jambe gauche et jambe droite sont en opposition de phase', () => {
    for (const phase of [0.3, 1.2, 2.5, -1.7]) {
      const a = computePose({ ...base, state: 'marche', phase });
      const b = computePose({ ...base, state: 'marche', phase: phase + Math.PI });
      expect(a.hipL).toBeCloseTo(-a.hipR, 9);
      expect(a.hipL).toBeCloseTo(b.hipR, 9);
      expect(a.kneeL).toBeCloseTo(b.kneeR, 9);
    }
  });

  it('phase nulle, négative et énorme restent valides', () => {
    for (const phase of [0, -3, -1e9, 1e12, Number.MAX_VALUE]) {
      const pose = computePose({ ...base, state: 'marche', phase });
      expect(allFinite(pose)).toBe(true);
      expect(inLimits(pose)).toBe(true);
    }
  });

  it('à l\'arrêt, les jambes ne balancent pas', () => {
    const pose = computePose({ ...base, state: 'arret', phase: 1.3 });
    expect(Math.abs(pose.hipL)).toBe(0);
    expect(Math.abs(pose.hipR)).toBe(0);
  });
});

describe('pose.js : joueur et zombie', () => {
  it('le tronc du joueur se tourne vers la visée par rapport aux jambes', () => {
    const pose = computePose({ ...base, state: 'marche', aim: 1, facing: 0.25 });
    expect(pose.torsoTwist).toBeCloseTo(0.75, 9);
    const wrapped = computePose({ ...base, state: 'marche', aim: 3.0, facing: -3.0 });
    expect(Math.abs(wrapped.torsoTwist)).toBeLessThan(0.3);
  });

  it('au tir, le recul replie les bras', () => {
    const calm = computePose({ ...base, state: 'tir', recoil: 0 });
    const kick = computePose({ ...base, state: 'tir', recoil: 1 });
    expect(kick.shoulderR).toBeLessThan(calm.shoulderR);
    expect(kick.elbowR).toBeGreaterThan(calm.elbowR);
  });

  it('le zombie a les bras tendus vers l\'avant et la tête penchée, pas le joueur', () => {
    const z = computePose({ ...base, state: 'zombie' });
    const p = computePose({ ...base, state: 'marche' });
    expect(z.shoulderL).toBeGreaterThan(1.1);
    expect(z.headTilt).toBeGreaterThan(0.25);
    expect(p.headTilt).toBeLessThan(0.1);
    expect(z.torsoTwist).not.toBe(p.torsoTwist);
    expect(z.inwardL).toBe(0);
  });

  it('le déphasage et le balancement d\'un zombie dépendent de sa graine', () => {
    const a = zombieTraits(1);
    const b = zombieTraits(2);
    expect(a.offset).not.toBe(b.offset);
    expect(zombieTraits(1)).toEqual(a);
    const pa = computePose({ ...base, state: 'zombie', seed: 1, time: 4 });
    const pb = computePose({ ...base, state: 'zombie', seed: 2, time: 4 });
    expect(pa.torsoTwist).not.toBe(pb.torsoTwist);
  });

  it('une graine invalide donne des traits finis', () => {
    for (const seed of [undefined, NaN, 'x', null]) {
      const t = zombieTraits(seed);
      expect(Number.isFinite(t.freq) && Number.isFinite(t.offset)).toBe(true);
    }
  });
});

describe('pose.js : cas limites supplémentaires', () => {
  it('chaque état renvoie exactement les mêmes clés', () => {
    const keys = Object.keys(computePose({ state: 'arret' })).sort();
    for (const state of STATES) expect(Object.keys(computePose({ state })).sort()).toEqual(keys);
    expect(keys).toEqual(Object.keys(LIMITS).sort());
  });

  it('une même entrée donne toujours la même pose (aucun état caché)', () => {
    const input = { ...base, state: 'zombie', phase: 2.2, time: 9 };
    expect(computePose(input)).toEqual(computePose(input));
  });

  it('un zombie a une jambe presque tendue qui traîne, selon sa graine', () => {
    const sides = new Set();
    for (let seed = 1; seed <= 12; seed += 1) {
      const pose = computePose({ ...base, state: 'zombie', seed, phase: 0.2 });
      sides.add(pose.kneeL === 0.1 ? 'L' : pose.kneeR === 0.1 ? 'R' : '?');
    }
    expect(sides.has('?')).toBe(false);
    expect(sides.size).toBe(2);
  });

  it('le recul est borné entre 0 et 1', () => {
    expect(computePose({ state: 'tir', recoil: 5 }).recoil).toBe(1);
    expect(computePose({ state: 'tir', recoil: -5 }).recoil).toBe(0);
  });

  it('la marche rapide balance plus que la marche lente', () => {
    const slow = computePose({ ...base, state: 'marche', amount: 0.2, phase: Math.PI / 2 });
    const fast = computePose({ ...base, state: 'marche', amount: 1, phase: Math.PI / 2 });
    expect(Math.abs(fast.hipL)).toBeGreaterThan(Math.abs(slow.hipL));
  });
});
