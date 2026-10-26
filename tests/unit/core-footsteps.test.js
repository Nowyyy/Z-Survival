import { describe, it, expect } from 'vitest';
import { createFootsteps, stepFootsteps } from '../../js/core/footsteps.js';

const CFG = { minSpeed: 20, minInterval: 0.15, minVolume: 0.35 };
const STRIDE = 0.09;
// Marche en ligne droite à la vitesse v pendant `seconds`, avec des images de dt secondes ; renvoie les pas { time, foot, volume }.
function walk(v, seconds, dt = 1 / 60, direction = 1, state = createFootsteps()) {
  const steps = [];
  let phase = 0;
  let s = state;
  for (let t = dt; t <= seconds + 1e-9; t += dt) {
    const next = phase + direction * v * dt * STRIDE;
    const r = stepFootsteps(s, phase, next, v, t, 220, CFG);
    s = r.state;
    if (r.step) steps.push({ time: t, ...r.step });
    phase = next;
  }
  return steps;
}

describe('footsteps.js', () => {
  it('aucun pas à l\'arrêt ni à très faible vitesse', () => {
    expect(walk(0, 5)).toEqual([]);
    expect(walk(19, 5)).toEqual([]);
  });
  it('un pas est posé à chaque demi-tour de phase : cadence cohérente avec la vitesse', () => {
    const steps = walk(220, 3);
    // 220 unités/s × 0,09 = 19,8 rad/s : un pas toutes les π / 19,8 = 0,159 s
    expect(steps.length).toBeGreaterThan(17);
    expect(steps.length).toBeLessThan(21);
  });
  it('les pieds alternent : gauche, droit, gauche…', () => {
    const feet = walk(150, 4).map((s) => s.foot);
    expect(feet.length).toBeGreaterThan(8);
    for (let i = 1; i < feet.length; i += 1) expect(feet[i]).not.toBe(feet[i - 1]);
    expect(new Set(feet)).toEqual(new Set(['gauche', 'droit']));
  });
  it('l\'alternance est la même en marche arrière', () => {
    const feet = walk(150, 4, 1 / 60, -1).map((s) => s.foot);
    expect(feet.length).toBeGreaterThan(8);
    for (let i = 1; i < feet.length; i += 1) expect(feet[i]).not.toBe(feet[i - 1]);
  });
  it('jamais deux pas à moins de 150 ms, même à très grande vitesse ou à faible cadence d\'images', () => {
    for (const [v, dt] of [[220, 1 / 60], [600, 1 / 60], [2000, 0.05], [220, 0.05]]) {
      const steps = walk(v, 3, dt);
      for (let i = 1; i < steps.length; i += 1) expect(steps[i].time - steps[i - 1].time).toBeGreaterThanOrEqual(0.15 - 1e-6);
    }
  });
  it('le volume croît avec la vitesse et reste entre le minimum et 1', () => {
    const vol = (v) => walk(v, 3)[2].volume;
    expect(vol(30)).toBeLessThan(vol(120));
    expect(vol(120)).toBeLessThan(vol(220));
    expect(vol(30)).toBeGreaterThanOrEqual(0.35);
    expect(vol(5000)).toBeLessThanOrEqual(1);
  });
  it('la phase peut boucler (valeurs bornées entre 0 et 2π) sans perdre de pas', () => {
    const TAU = Math.PI * 2;
    let s = createFootsteps();
    let count = 0;
    let phase = 0;
    for (let i = 1; i <= 600; i += 1) {
      const next = phase + 0.25;
      const r = stepFootsteps(s, phase % TAU, next % TAU > phase % TAU ? next % TAU : (next % TAU) + TAU, 100, i * 0.05, 220, CFG);
      s = r.state;
      if (r.step) count += 1;
      phase = next;
    }
    expect(count).toBeGreaterThan(40);
  });
  it('ne modifie pas son état (gelé) et est déterministe', () => {
    const state = Object.freeze({ lastTime: -Infinity });
    const a = stepFootsteps(state, 1.5, 1.7, 100, 1, 220, Object.freeze({ ...CFG }));
    const b = stepFootsteps(state, 1.5, 1.7, 100, 1, 220, CFG);
    expect(a).toEqual(b);
    expect(state.lastTime).toBe(-Infinity);
    expect(a.step).not.toBeNull();
  });
  it('entrées hostiles : aucun pas, aucune exception', () => {
    for (const bad of [null, undefined, NaN, 'x', {}, []]) {
      expect(() => stepFootsteps(bad, bad, bad, bad, bad, bad, bad)).not.toThrow();
      expect(stepFootsteps(bad, bad, bad, bad, bad, bad, bad).step).toBeNull();
    }
  });
});
