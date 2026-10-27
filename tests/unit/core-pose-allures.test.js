import { describe, it, expect } from 'vitest';
import { LIMITS, STATES, ZOMBIE_STATES, computePose } from '../../js/core/pose.js';
import { createDirector as createSound, direct } from '../../js/core/sound-director.js';
import { readFileSync } from 'node:fs';

const TAU = Math.PI * 2;
const NEW = ['lent', 'rampe', 'course'];
const base = { phase: 0.7, time: 3.1, seed: 5 };
const finite = (pose) => Object.values(pose).every(Number.isFinite);
const inLimits = (pose) => Object.entries(LIMITS).every(([k, [lo, hi]]) => pose[k] >= lo && pose[k] <= hi);
const amplitude = (state, key = 'hipL', amount) => {
  let min = Infinity;
  let max = -Infinity;
  for (let p = 0; p < TAU; p += 0.05) {
    const v = computePose({ ...base, state, phase: p, amount })[key];
    min = Math.min(min, v);
    max = Math.max(max, v);
  }
  return max - min;
};

describe('pose.js : allures lent, rampe, course', () => {
  it('les trois états sont connus et zombie reste l\'équivalent de marche', () => {
    for (const s of NEW) expect(STATES).toContain(s);
    expect(ZOMBIE_STATES).toEqual(['zombie', ...NEW]);
  });

  it.each(NEW)('état %s : valeurs finies et dans les bornes pour toute phase', (state) => {
    for (let phase = -20; phase <= 20; phase += 0.31) {
      const pose = computePose({ ...base, state, phase });
      expect(finite(pose)).toBe(true);
      expect(inLimits(pose)).toBe(true);
    }
  });

  it.each(NEW)('état %s : périodique (2π)', (state) => {
    const a = computePose({ ...base, state, phase: 1.3 });
    const b = computePose({ ...base, state, phase: 1.3 + TAU * 4 });
    for (const k of Object.keys(a)) expect(b[k]).toBeCloseTo(a[k], 6);
  });

  it.each(NEW)('état %s : jambes en opposition de phase', (state) => {
    for (const phase of [0.4, 1.9, -2.2]) {
      const a = computePose({ ...base, state, phase });
      const b = computePose({ ...base, state, phase: phase + Math.PI });
      expect(b.hipL - b.hipR).toBeCloseTo(-(a.hipL - a.hipR), 6);
    }
  });

  it.each(NEW)('état %s : phase nulle, négative, énorme ou hostile donne une pose valide', (state) => {
    for (const phase of [0, -5, 1e12, -1e12, NaN, Infinity, 'x', null]) {
      const pose = computePose({ ...base, state, phase });
      expect(finite(pose) && inLimits(pose)).toBe(true);
    }
  });

  it('rampe : bassin plus bas et tronc plus horizontal que la marche', () => {
    const walk = computePose({ ...base, state: 'zombie' });
    const crawl = computePose({ ...base, state: 'rampe' });
    expect(crawl.pelvisHeight).toBeLessThan(walk.pelvisHeight);
    expect(crawl.torsoPitch).toBeGreaterThan(walk.torsoPitch);
    expect(crawl.torsoPitch).toBeGreaterThan(computePose({ ...base, state: 'course' }).torsoPitch);
  });

  it('course : amplitude des jambes supérieure à la marche ; lent : inférieure', () => {
    expect(amplitude('course')).toBeGreaterThan(amplitude('zombie'));
    expect(amplitude('lent')).toBeLessThan(amplitude('zombie'));
    expect(amplitude('course', 'hipL', 1)).toBeGreaterThan(amplitude('zombie', 'hipL', 1));
    expect(amplitude('lent', 'hipL', 1)).toBeLessThan(amplitude('zombie', 'hipL', 1));
  });

  it('les poses des trois allures sont distinctes entre elles et de la marche', () => {
    const poses = ['zombie', ...NEW].map((state) => JSON.stringify(computePose({ ...base, state })));
    expect(new Set(poses).size).toBe(4);
  });

  it('états existants inchangés : hauteur de bassin et inclinaison nulles', () => {
    for (const state of ['marche', 'arret', 'tir', 'zombie']) {
      const pose = computePose({ ...base, state });
      expect([pose.pelvisHeight, pose.torsoPitch]).toEqual([0, 0]);
    }
  });

  it('états existants inchangés : valeurs de référence calculées par pose.js de main (lot 1m)', () => {
    const ref = {
      zombie: { input: { phase: 0.7, aim: 0.4, facing: -0.2, time: 3.1, seed: 5, state: 'zombie' }, hipL: 0.20292857147987267, kneeL: 0.5083116248793135, shoulderL: 1.3134904453875254, torsoTwist: 0.1976861283966564, headTilt: 0.3634904453875255, bob: 0.21622285408885783 },
      tir: { input: { phase: 0.7, aim: 0.4, facing: -0.2, time: 3.1, seed: 5, state: 'tir', recoil: 0.3 }, hipL: 0.3543197279807301, kneeL: 0.6918737498275908, shoulderL: 1.2786530612342615, torsoTwist: 0.6000000000000001, headTilt: -0.003323576112699856, bob: 0.38242109364224425 },
      marche: { input: { phase: 0.7, time: 3.1, state: 'marche' }, hipL: 0.3543197279807301, kneeL: 0.6918737498275908, shoulderL: 1.2186530612342614, torsoTwist: 0, headTilt: -0.003323576112699856, bob: 0.38242109364224425 },
    };
    for (const { input, ...expected } of Object.values(ref)) {
      const pose = computePose(input);
      for (const [k, v] of Object.entries(expected)) expect(pose[k], `${input.state}.${k}`).toBeCloseTo(v, 12);
    }
  });

  it('chaque état a les mêmes clés que LIMITS', () => {
    for (const state of STATES) expect(Object.keys(computePose({ state })).sort()).toEqual(Object.keys(LIMITS).sort());
  });

  it('ne modifie pas un argument gelé et supporte les entrées hostiles', () => {
    const frozen = Object.freeze({ ...base, state: 'rampe' });
    expect(() => computePose(frozen)).not.toThrow();
    expect(frozen).toEqual({ ...base, state: 'rampe' });
    for (const bad of [null, undefined, 'x', 3, NaN, []]) expect(finite(computePose(bad))).toBe(true);
  });
});

describe('sound-director : pas de zombie et allure rampe', () => {
  const audio = JSON.parse(readFileSync('data/game/audio.json', 'utf8'));
  const sounds = JSON.parse(readFileSync('data/game/sounds.json', 'utf8')).sounds;
  const table = Object.fromEntries(sounds.map((s) => [s.id, { category: s.category, variants: Math.max(1, s.variants ?? 1), duration: s.duration ?? 0.5 }]));
  const cfg = { audio, sounds: table, voice: JSON.parse(readFileSync('data/game/zombie-voice.json', 'utf8')), materials: {} };

  // Fait marcher des zombies de l'allure donnée pendant 20 s, renvoie le nombre de demandes « pas-zombie ».
  const stepsFor = (gait) => {
    let state = createSound(3);
    let count = 0;
    for (let i = 0; i < 400; i += 1) {
      const time = i * 0.05;
      const zombies = [{ id: 1, x: 150 + i * 2.5, y: 0, variant: 'marcheur', gait }, { id: 2, x: -200 - i * 2.5, y: 40, variant: 'petit', gait }];
      const out = direct(state, { time, paused: false, listener: { x: 0, y: 0 }, walls: [], events: [], zombies }, cfg);
      state = out.state;
      count += out.requests.filter((r) => r.sound === 'pas-zombie').length;
    }
    return count;
  };

  it.each(['lent', 'marche', 'course'])('allure %s : des pas de zombie sont joués', (gait) => {
    expect(stepsFor(gait)).toBeGreaterThan(0);
  });

  it('allure rampe : aucun pas de zombie', () => {
    expect(stepsFor('rampe')).toBe(0);
  });

  it('un zombie qui rampe ne prend pas la place d\'un autre zombie dans les pas audibles', () => {
    let state = createSound(3);
    let count = 0;
    for (let i = 0; i < 400; i += 1) {
      const zombies = [1, 2, 3].map((n) => ({ id: n, x: 40 * n + i * 2, y: 0, variant: 'marcheur', gait: 'rampe' })).concat([{ id: 9, x: 400 + i * 2, y: 0, variant: 'marcheur', gait: 'marche' }]);
      const out = direct(state, { time: i * 0.05, paused: false, listener: { x: 0, y: 0 }, walls: [], events: [], zombies }, cfg);
      state = out.state;
      count += out.requests.filter((r) => r.sound === 'pas-zombie').length;
    }
    expect(count).toBeGreaterThan(0);
  });

  it('la liste des allures muettes est dans audio.json', () => {
    expect(audio.zombieSteps.silentGaits).toEqual(['rampe']);
  });
});
