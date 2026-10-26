import { describe, it, expect } from 'vitest';
import { boundTarget, overview, snapCamera, stepCamera } from '../../js/core/camera.js';
import { groundView, projectGround } from '../../js/core/viewport.js';
import { deepFreeze, WEIRD } from './helpers/monde.js';

const bounds = { minX: 0, minY: 0, maxX: 3600, maxY: 2800 };
const view = { width: 900, north: 300, south: 150 };
const opts = { smoothing: 0.12, deadZone: 0, bounds, view };
const run = (fps, seconds, goal, start = { x: 1800, y: 1400 }, o = opts) => {
  let cam = start;
  for (let i = 0; i < Math.round(fps * seconds); i += 1) cam = stepCamera(cam, goal, 1 / fps, o);
  return cam;
};

describe('camera.js : suivi', () => {
  it('rejoint peu à peu le joueur', () => {
    const cam = run(60, 3, { x: 2200, y: 1600 });
    expect(cam.x).toBeCloseTo(2200, 1);
    expect(cam.y).toBeCloseTo(1600, 1);
    const early = run(60, 0.1, { x: 2200, y: 1600 });
    expect(early.x).toBeGreaterThan(1800);
    expect(early.x).toBeLessThan(2200);
  });

  it('a la constante de lissage demandée : 63,2 % du chemin après 0,12 s', () => {
    const cam = run(100, 0.12, { x: 2800, y: 1400 }, { x: 1800, y: 1400 });
    expect((cam.x - 1800) / 1000).toBeCloseTo(1 - Math.exp(-1), 2);
  });

  it('se lisse de la même façon à 30 et à 144 images par seconde', () => {
    const a = run(30, 1, { x: 2600, y: 1900 });
    const b = run(144, 1, { x: 2600, y: 1900 });
    expect(a.x).toBeCloseTo(b.x, 6);
    expect(a.y).toBeCloseTo(b.y, 6);
  });

  it('snapCamera place la caméra d\'un coup sur le joueur', () => {
    expect(snapCamera({ x: 1234, y: 1500 }, opts)).toEqual({ x: 1234, y: 1500 });
  });
});

describe('camera.js : bornes du monde', () => {
  it('ne laisse jamais la vue sortir du monde', () => {
    for (const goal of [{ x: -500, y: -500 }, { x: 9000, y: 9000 }, { x: 0, y: 2800 }, { x: 3600, y: 0 }]) {
      const cam = run(60, 4, goal);
      expect(cam.x - view.width / 2).toBeGreaterThanOrEqual(-1e-9);
      expect(cam.x + view.width / 2).toBeLessThanOrEqual(3600 + 1e-9);
      expect(cam.y - view.north).toBeGreaterThanOrEqual(-1e-9);
      expect(cam.y + view.south).toBeLessThanOrEqual(2800 + 1e-9);
    }
  });

  it('boundTarget ramène la cible au plus près du bord', () => {
    expect(boundTarget({ x: 0, y: 0 }, bounds, view)).toEqual({ x: 450, y: 300 });
    expect(boundTarget({ x: 9999, y: 9999 }, bounds, view)).toEqual({ x: 3150, y: 2650 });
    expect(boundTarget({ x: 1800, y: 1400 }, bounds, view)).toEqual({ x: 1800, y: 1400 });
  });

  it('centre la caméra sur un axe où le monde est plus petit que la vue', () => {
    const small = { minX: 0, minY: 0, maxX: 600, maxY: 2800 };
    expect(boundTarget({ x: 10, y: 1400 }, small, view)).toEqual({ x: 300, y: 1400 });
    const tiny = { minX: 100, minY: 200, maxX: 300, maxY: 400 };
    expect(boundTarget({ x: 0, y: 0 }, tiny, view)).toEqual({ x: 200, y: 300 });
  });

  it('une vue infinie au nord (inclinaison très faible) centre l\'axe y sans erreur', () => {
    expect(boundTarget({ x: 1800, y: 5 }, bounds, { width: 900, north: Infinity, south: 100 }).y).toBe(1400);
  });

  it('overview montre tout le monde', () => {
    const o = overview(bounds, 667 / 375, 75, 40);
    expect(o.target).toEqual({ x: 1800, y: 1400 });
    for (const [x, y] of [[-1800, -1400], [1800, -1400], [-1800, 1400], [1800, 1400]]) {
      const p = projectGround(x, y, o.distance, 75, 40, 667 / 375);
      expect(p).not.toBeNull();
      expect(Math.abs(p.x)).toBeLessThanOrEqual(1.0001);
      expect(Math.abs(p.y)).toBeLessThanOrEqual(1.0001);
    }
    expect(groundView(667 / 375, o.distance, 75, 40).width).toBeGreaterThan(3600 * 0.9);
  });
});

describe('camera.js : zone morte', () => {
  const near = { x: 1800, y: 1400 };
  it('à 0 la caméra suit le moindre déplacement', () => {
    expect(stepCamera(near, { x: 1810, y: 1400 }, 0.05, opts).x).toBeGreaterThan(1800);
  });

  it('à 0,5 la caméra ne bouge pas tant que le joueur reste dans la moitié de la demi-vue', () => {
    const o = { ...opts, deadZone: 0.5 }; // demi-largeur 450 : zone morte de 225
    expect(stepCamera(near, { x: 1800 + 200, y: 1400 }, 0.05, o)).toEqual(near);
    const out = stepCamera(near, { x: 1800 + 400, y: 1400 }, 10, o);
    expect(out.x).toBeCloseTo(1800 + 400 - 225, 6);
  });
});

describe('camera.js : pas de temps et entrées inattendues', () => {
  it('dt nul, négatif ou invalide : la caméra ne bouge pas', () => {
    for (const dt of [0, -1, NaN, Infinity, 'a', null, undefined]) {
      expect(stepCamera({ x: 1800, y: 1400 }, { x: 2600, y: 1900 }, dt, opts)).toEqual({ x: 1800, y: 1400 });
    }
  });

  it('dt énorme : la caméra arrive sur le joueur (sans le dépasser)', () => {
    expect(stepCamera({ x: 1800, y: 1400 }, { x: 2600, y: 1900 }, 1e9, opts)).toEqual({ x: 2600, y: 1900 });
  });

  it('ne modifie pas ses arguments, est déterministe et renvoie de nouveaux objets', () => {
    const state = deepFreeze({ x: 1800, y: 1400 });
    const goal = deepFreeze({ x: 2600, y: 1900 });
    const o = deepFreeze({ ...opts, bounds: { ...bounds }, view: { ...view } });
    const a = stepCamera(state, goal, 0.016, o);
    expect(stepCamera(state, goal, 0.016, o)).toEqual(a);
    expect(a).not.toBe(state);
  });

  it('ne lève jamais d\'exception sur des types inattendus et renvoie des nombres finis', () => {
    for (const a of WEIRD) {
      for (const b of WEIRD) {
        for (const r of [stepCamera(a, b, 0.05, a), stepCamera(a, a, b, { smoothing: b, deadZone: b, bounds: a, view: a }), boundTarget(a, b, a), snapCamera(a, b), overview(a, b, a, b).target]) {
          expect(Number.isFinite(r.x) && Number.isFinite(r.y)).toBe(true);
        }
        expect(Number.isFinite(overview(a, b, a, b).distance)).toBe(true);
      }
    }
  });
});
