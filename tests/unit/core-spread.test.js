import { describe, it, expect } from 'vitest';
import { createRng } from '../../js/core/rng.js';
import { effectiveWeapon, statValues } from '../../js/core/player-stats.js';
import { shotAngle, speedRatio, spreadHalfAngle, stepSpreadRatio, toRadians } from '../../js/core/spread.js';
import { deepFreeze, load, WEIRD } from './helpers/monde.js';

const params = load('player-stats');
const { widenTime, narrowTime } = params.spread;
const all = (n) => Object.fromEntries(['degats', 'portee', 'precision', 'cadence', 'vitesse', 'vie', 'regen'].map((id) => [id, n]));

// Simule `seconds` secondes à `fps` images par seconde vers la cible.
const run = (from, target, seconds, fps) => {
  let ratio = from;
  const n = Math.round(seconds * fps);
  for (let i = 0; i < n; i += 1) ratio = stepSpreadRatio(ratio, target, 1 / fps, widenTime, narrowTime);
  return ratio;
};

describe('spread.js : speedRatio', () => {
  it.each([[0, 220, 0], [110, 220, 0.5], [220, 220, 1], [308, 220, 1], [-50, 220, 0]])('vitesse %s sur maximum %s : %s', (s, m, r) => {
    expect(speedRatio(s, m)).toBeCloseTo(r, 9);
  });

  it.each([[NaN, 220], [100, NaN], [100, 0], [100, -5], ['x', 220], [100, Infinity], [Infinity, 220], [undefined, undefined]])('valeurs invalides (%s, %s) : 0', (s, m) => {
    expect(speedRatio(s, m)).toBe(0);
  });

  it('la vitesse maximale effective compte : 220 sur 308 vaut 0,714', () => {
    expect(speedRatio(220, 308)).toBeCloseTo(220 / 308, 9);
  });
});

describe('spread.js : stepSpreadRatio (lissage)', () => {
  it('ratio identique à 30 et à 144 images par seconde après 1 s simulée (ouverture et fermeture)', () => {
    expect(run(0, 1, 1, 30)).toBeCloseTo(run(0, 1, 1, 144), 9);
    expect(run(1, 0, 1, 30)).toBeCloseTo(run(1, 0, 1, 144), 9);
    expect(run(0, 1, 0.5, 20)).toBeCloseTo(run(0, 1, 0.5, 100), 9);
  });

  it('s\'ouvre vite (0,08 s) : constante de temps de 0,08 s, presque ouvert en 0,4 s', () => {
    expect(run(0, 1, 0.1, 200)).toBeCloseTo(1 - Math.exp(-0.1 / widenTime), 9);
    expect(run(0, 1, 0.4, 100)).toBeGreaterThan(0.99);
  });

  it('se referme lentement (0,25 s) : constante de temps de 0,25 s, encore ouvert à 0,1 s', () => {
    expect(run(1, 0, 0.25, 200)).toBeCloseTo(Math.exp(-0.25 / narrowTime), 9);
    expect(run(1, 0, 0.1, 100)).toBeGreaterThan(0.6);
  });

  it('l\'ouverture est plus rapide que la fermeture', () => {
    expect(run(0, 1, 0.1, 60)).toBeGreaterThan(1 - run(1, 0, 0.1, 60));
  });

  it('cible atteinte : le ratio ne bouge plus', () => {
    expect(stepSpreadRatio(1, 1, 0.05, widenTime, narrowTime)).toBe(1);
    expect(stepSpreadRatio(0, 0, 0.05, widenTime, narrowTime)).toBe(0);
  });

  it('le ratio reste dans [0, 1] et monotone vers la cible', () => {
    let r = 0;
    for (let i = 0; i < 100; i += 1) {
      const next = stepSpreadRatio(r, 1, 0.016, widenTime, narrowTime);
      expect(next).toBeGreaterThanOrEqual(r);
      expect(next).toBeLessThanOrEqual(1);
      r = next;
    }
  });

  it('dt à 0 : inchangé ; dt négatif : inchangé ; dt énorme : borné à 0,05 s, sans exception', () => {
    expect(stepSpreadRatio(0.3, 1, 0, widenTime, narrowTime)).toBe(0.3);
    expect(stepSpreadRatio(0.3, 1, -5, widenTime, narrowTime)).toBe(0.3);
    expect(stepSpreadRatio(0.3, 1, 1e9, widenTime, narrowTime)).toBe(stepSpreadRatio(0.3, 1, 0.05, widenTime, narrowTime));
    expect(stepSpreadRatio(0.3, 1, Infinity, widenTime, narrowTime)).toBeLessThanOrEqual(1);
  });

  it('constantes de temps nulles ou invalides : sans exception, valeur dans [0, 1]', () => {
    for (const t of [0, -1, NaN, undefined, 'x']) {
      const r = stepSpreadRatio(0, 1, 0.016, t, t);
      expect(r).toBeGreaterThanOrEqual(0);
      expect(r).toBeLessThanOrEqual(1);
    }
  });

  it('entrées hostiles : aucune exception', () => {
    for (const a of WEIRD) for (const b of WEIRD) expect(() => stepSpreadRatio(a, b, a, b, a)).not.toThrow();
  });
});

describe('spread.js : spreadHalfAngle', () => {
  const v0 = statValues({}, params);
  const v10 = statValues(all(10), params);

  it('niveau 0 : 4° à l\'arrêt, 12° à pleine vitesse, 8° à mi-vitesse', () => {
    expect(spreadHalfAngle(0, v0)).toBeCloseTo(4, 9);
    expect(spreadHalfAngle(1, v0)).toBeCloseTo(12, 9);
    expect(spreadHalfAngle(0.5, v0)).toBeCloseTo(8, 9);
  });

  it('niveau 10 de précision : ≈ 1,39° à l\'arrêt et ≈ 2,97° à pleine vitesse', () => {
    expect(spreadHalfAngle(0, v10)).toBeCloseTo(1.3947, 3);
    expect(spreadHalfAngle(1, v10)).toBeCloseTo(2.9695, 3);
  });

  it('plancher de 0,5° et ratio borné à [0, 1]', () => {
    expect(spreadHalfAngle(0, { stillAngle: 0.1, moveAngle: 0.1, minAngle: 0.5 })).toBe(0.5);
    expect(spreadHalfAngle(5, v0)).toBeCloseTo(12, 9);
    expect(spreadHalfAngle(-5, v0)).toBeCloseTo(4, 9);
  });

  it('la valeur de effectiveWeapon est la même', () => {
    const w = effectiveWeapon(load('weapons').pistol, all(7), params);
    const v = statValues(all(7), params);
    expect(spreadHalfAngle(0, v)).toBeCloseTo(w.coneStill, 9);
    expect(spreadHalfAngle(1, v)).toBeCloseTo(w.coneMove, 9);
  });

  it('entrées hostiles : aucune exception, résultat fini', () => {
    for (const a of WEIRD) for (const b of WEIRD) expect(Number.isFinite(spreadHalfAngle(a, b))).toBe(true);
  });

  it('toRadians', () => {
    expect(toRadians(180)).toBeCloseTo(Math.PI, 12);
    expect(toRadians(NaN)).toBe(0);
  });
});

describe('spread.js : shotAngle (tirage triangulaire)', () => {
  const half = toRadians(12);
  const draw = (n, aim = 0.7, seed = 42, h = half) => {
    let rng = createRng(seed);
    const out = [];
    for (let i = 0; i < n; i += 1) {
      const r = shotAngle(aim, h, rng);
      out.push(r.angle - aim);
      rng = r.rng;
    }
    return out;
  };

  it('10 000 tirs à graine fixe : tous les décalages dans [−demi-angle, +demi-angle]', () => {
    for (const d of draw(10000)) expect(Math.abs(d)).toBeLessThanOrEqual(half + 1e-12);
  });

  it('moyenne proche de 0', () => {
    const d = draw(10000);
    expect(Math.abs(d.reduce((a, b) => a + b, 0) / d.length)).toBeLessThan(half * 0.02);
  });

  it('distribution triangulaire : plus de la moitié des tirs dans la moitié centrale (75 % attendus)', () => {
    const d = draw(10000);
    const inner = d.filter((x) => Math.abs(x) <= half / 2).length / d.length;
    expect(inner).toBeGreaterThan(0.5);
    expect(inner).toBeCloseTo(0.75, 1);
  });

  it('les décalages ne sont pas tous égaux et couvrent les deux côtés', () => {
    const d = draw(200);
    expect(new Set(d).size).toBeGreaterThan(100);
    expect(d.some((x) => x < 0)).toBe(true);
    expect(d.some((x) => x > 0)).toBe(true);
  });

  it('même graine, mêmes tirs ; autre graine, autres tirs', () => {
    expect(draw(50, 0.7, 42)).toEqual(draw(50, 0.7, 42));
    expect(draw(50, 0.7, 42)).not.toEqual(draw(50, 0.7, 43));
  });

  it('demi-angle 0 : angle exact', () => {
    expect(shotAngle(1.234, 0, createRng(5)).angle).toBe(1.234);
  });

  it.each([[-0.3], [NaN], [Infinity], [undefined], [null], ['x']])('demi-angle %s : angle exact, sans exception', (h) => {
    expect(shotAngle(0.5, h, createRng(5)).angle).toBe(0.5);
  });

  it('l\'état du générateur est retourné, avance, et n\'est pas partagé avec l\'argument', () => {
    const rng = deepFreeze(createRng(9));
    const r = shotAngle(0, half, rng);
    expect(r.rng).not.toBe(rng);
    expect(r.rng.state).not.toBe(rng.state);
    expect(rng).toEqual({ state: 9 });
    const again = shotAngle(0, half, rng);
    expect(again.angle).toBe(r.angle);
    expect(again.rng).toEqual(r.rng);
    expect(again.rng).not.toBe(r.rng);
  });

  it('un demi-angle plus petit resserre les tirs : mêmes tirages, décalages proportionnels', () => {
    const wide = draw(100, 0, 3, toRadians(12));
    const narrow = draw(100, 0, 3, toRadians(3));
    wide.forEach((w, i) => expect(narrow[i]).toBeCloseTo(w / 4, 12));
  });

  it('entrées hostiles : aucune exception', () => {
    for (const a of WEIRD) for (const b of WEIRD) for (const c of WEIRD) expect(() => shotAngle(a, b, c)).not.toThrow();
  });

  it('angle de visée invalide : traité comme 0', () => {
    expect(shotAngle(NaN, 0, createRng(1)).angle).toBe(0);
  });
});
