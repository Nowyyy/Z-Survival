import { describe, it, expect } from 'vitest';
import { computePose, DOWN_STATE, LIMITS, SIEGE_STATES, STATES, ZOMBIE_STATES } from '../../js/core/pose.js';
import { deepFreeze, WEIRD } from './helpers/monde.js';

const finite = (pose) => Object.values(pose).every(Number.isFinite);
const inLimits = (pose) => Object.entries(LIMITS).every(([k, [lo, hi]]) => pose[k] >= lo && pose[k] <= hi);

describe('pose.js (lot 3) : arracher, escalade, terre', () => {
  it('les listes d\'états des lots précédents sont inchangées', () => {
    expect(STATES).toEqual(['marche', 'arret', 'tir', 'zombie', 'lent', 'rampe', 'course']);
    expect(ZOMBIE_STATES).toEqual(['zombie', 'lent', 'rampe', 'course']);
    expect(SIEGE_STATES).toEqual(['arracher', 'escalade']);
    expect(DOWN_STATE).toBe('terre');
  });

  it.each(['arracher', 'escalade', 'terre'])('%s : valeurs finies et dans les bornes sur 200 phases et instants', (state) => {
    for (let i = 0; i < 200; i += 1) {
      const pose = computePose({ state, phase: i * 0.37, time: i * 0.11, seed: i, amount: 0.5 });
      expect(finite(pose)).toBe(true);
      expect(inLimits(pose)).toBe(true);
    }
  });

  it('arracher : périodique en 2π, bras qui tirent à tour de rôle', () => {
    const a = computePose({ state: 'arracher', phase: 0.9, time: 1, seed: 3 });
    const b = computePose({ state: 'arracher', phase: 0.9 + 2 * Math.PI, time: 1, seed: 3 });
    for (const k of Object.keys(a)) expect(b[k], k).toBeCloseTo(a[k], 9);
    const left = computePose({ state: 'arracher', phase: Math.PI / 2, time: 1, seed: 3 });
    const right = computePose({ state: 'arracher', phase: -Math.PI / 2, time: 1, seed: 3 });
    expect(left.elbowL).toBeGreaterThan(left.elbowR);
    expect(right.elbowR).toBeGreaterThan(right.elbowL);
    expect(left.shoulderL).toBeLessThan(left.shoulderR);
  });

  it('arracher : pieds immobiles (les jambes ne dépendent pas de la phase) et torse penché en avant', () => {
    const a = computePose({ state: 'arracher', phase: 0.3, time: 1 });
    const b = computePose({ state: 'arracher', phase: 2.5, time: 1 });
    for (const k of ['hipL', 'hipR', 'kneeL', 'kneeR']) expect(a[k]).toBe(b[k]);
    expect(a.torsoPitch).toBeGreaterThan(0.25);
  });

  it('escalade : torse penché de 0,35 rad, jambes écartées, bras en appui, indépendante de la phase', () => {
    const a = computePose({ state: 'escalade', phase: 0.3, time: 1 });
    expect(a.torsoPitch).toBeCloseTo(0.35, 12);
    expect(a.hipL - a.hipR).toBeGreaterThan(0.8);
    expect(a.shoulderL).toBeGreaterThan(0.5);
    expect(computePose({ state: 'escalade', phase: 2.7, time: 9 })).toEqual(computePose({ state: 'escalade', phase: 0.1, time: 2 }));
  });

  it('terre : plus bas que la rampe (bassin) et au moins aussi horizontal, sans mouvement', () => {
    const t = computePose({ state: 'terre', phase: 1, time: 1 });
    const r = computePose({ state: 'rampe', phase: 1, time: 1, seed: 2 });
    expect(t.pelvisHeight).toBeLessThanOrEqual(r.pelvisHeight);
    expect(t.torsoPitch).toBeGreaterThanOrEqual(r.torsoPitch);
    expect(computePose({ state: 'terre', phase: 5, time: 40, seed: 8 })).toEqual(computePose({ state: 'terre', phase: 0, time: 1, seed: 9 }));
  });

  // Valeurs de référence : sortie de computePose de main (avant le lot 3) pour {phase 1,3, aim 0,4, facing 0,1, time 2,5, seed 5, amount 0,6, recoil 0,2}.
  const REFERENCE = {"marche":{"hipL":0.317974,"hipR":-0.317974,"kneeL":0.208399,"kneeR":0.08,"shoulderL":1.174688,"shoulderR":1.264688,"elbowL":0.61,"elbowR":0.32,"inwardL":0.62,"inwardR":0.5,"torsoTwist":0.3,"headTilt":-0.038357,"bob":0.068743,"recoil":0.2,"pelvisHeight":0,"torsoPitch":0},"arret":{"hipL":0.317974,"hipR":-0.317974,"kneeL":0.208399,"kneeR":0.08,"shoulderL":1.174688,"shoulderR":1.264688,"elbowL":0.61,"elbowR":0.32,"inwardL":0.62,"inwardR":0.5,"torsoTwist":0.3,"headTilt":-0.038357,"bob":0.068743,"recoil":0.2,"pelvisHeight":0,"torsoPitch":0},"tir":{"hipL":0.317974,"hipR":-0.317974,"kneeL":0.208399,"kneeR":0.08,"shoulderL":1.294688,"shoulderR":1.384688,"elbowL":0.61,"elbowR":0.32,"inwardL":0.62,"inwardR":0.5,"torsoTwist":0.3,"headTilt":-0.038357,"bob":0.068743,"recoil":0.2,"pelvisHeight":0,"torsoPitch":0},"zombie":{"hipL":0.260161,"hipR":-0.13008,"kneeL":0.208399,"kneeR":0.1,"shoulderL":1.299034,"shoulderR":1.450966,"elbowL":0.309952,"elbowR":0.240048,"inwardL":0,"inwardR":0,"torsoTwist":0.21498,"headTilt":0.349034,"bob":0.08983,"recoil":0.2,"pelvisHeight":0,"torsoPitch":0},"lent":{"hipL":0.161878,"hipR":-0.064751,"kneeL":0.156175,"kneeR":0.08,"shoulderL":0.999739,"shoulderR":0.850261,"elbowL":0.282689,"elbowR":0.467311,"inwardL":0,"inwardR":0,"torsoTwist":0.086069,"headTilt":0.599739,"bob":0.056969,"recoil":0.2,"pelvisHeight":0,"torsoPitch":0.12},"rampe":{"hipL":-0.694534,"hipR":-0.405466,"kneeL":1.0642,"kneeR":1,"shoulderL":1.289067,"shoulderR":1,"elbowL":0.3,"elbowR":0.589067,"inwardL":0,"inwardR":0,"torsoTwist":0.08672,"headTilt":-0.417311,"bob":0.05642,"recoil":0.2,"pelvisHeight":-0.25,"torsoPitch":1.3},"course":{"hipL":0.462508,"hipR":-0.462508,"kneeL":0.326549,"kneeR":0.15,"shoulderL":1.439067,"shoulderR":0.860933,"elbowL":0.073793,"elbowR":0.326207,"inwardL":0,"inwardR":0,"torsoTwist":0.057813,"headTilt":0.182689,"bob":0.121541,"recoil":0.2,"pelvisHeight":0,"torsoPitch":0.4}};

  it.each(Object.keys(REFERENCE))("l'état existant « %s » donne les mêmes valeurs qu'avant le lot 3", (state) => {
    const pose = computePose({ state, phase: 1.3, aim: 0.4, facing: 0.1, time: 2.5, seed: 5, amount: 0.6, recoil: 0.2 });
    for (const [key, value] of Object.entries(REFERENCE[state])) expect(pose[key], key).toBeCloseTo(value, 5);
  });

  it('un état inconnu retombe sur « arret » ; la hiérarchie du squelette (les clés de pose) est inchangée', () => {
    expect(computePose({ state: 'danse' })).toEqual(computePose({ state: 'arret' }));
    expect(Object.keys(computePose({ state: 'terre' })).sort()).toEqual(Object.keys(computePose({ state: 'marche' })).sort());
  });

  it('entrées hostiles : aucune exception, valeurs finies', () => {
    for (const a of WEIRD) {
      for (const state of ['arracher', 'escalade', 'terre']) {
        expect(() => computePose({ state, phase: a, time: a, seed: a, amount: a })).not.toThrow();
        expect(finite(computePose({ state, phase: a, time: a, seed: a, amount: a }))).toBe(true);
      }
      expect(() => computePose(a)).not.toThrow();
    }
  });

  it('arguments gelés non modifiés, même entrée = même sortie', () => {
    const input = deepFreeze({ state: 'arracher', phase: 1, time: 2, seed: 3 });
    expect(computePose(input)).toEqual(computePose(input));
    expect(input.phase).toBe(1);
  });
});
