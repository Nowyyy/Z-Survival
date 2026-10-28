import { describe, it, expect } from 'vitest';
import { edgeIndicator } from '../../js/core/edge-arrow.js';
import { deepFreeze, WEIRD } from './helpers/monde.js';

const VIEW = { width: 667, height: 375 };
const M = 16;
const at = (x, y, behind = false) => edgeIndicator({ x, y, behind }, VIEW, M);
const near = (a, b, d = 1e-6) => Math.abs(a - b) <= d;

describe('edge-arrow.js : point à l\'écran', () => {
  it.each([[0.5, 0.5], [0.1, 0.2], [0.9, 0.8], [0.3, 0.7]])('(%f, %f) : à l\'écran, aucune flèche', (x, y) => {
    expect(at(x, y).visible).toBe(false);
  });

  it('exactement sur le bord du rectangle réduit : encore à l\'écran', () => {
    expect(at(M / 667, 0.5).visible).toBe(false);
    expect(at(1 - M / 667, 0.5).visible).toBe(false);
    expect(at(0.5, M / 375).visible).toBe(false);
    expect(at(0.5, 1 - M / 375).visible).toBe(false);
  });

  it('juste au-delà du bord réduit (dans la marge de 16) : flèche', () => {
    expect(at(M / 667 - 0.001, 0.5).visible).toBe(true);
    expect(at(0.5, 1 - M / 375 + 0.001).visible).toBe(true);
  });
});

describe('edge-arrow.js : point hors de l\'écran', () => {
  it('à gauche : sur le bord gauche réduit de 16, flèche vers la gauche', () => {
    const r = at(-0.5, 0.5);
    expect(r.visible).toBe(true);
    expect(near(r.x, M)).toBe(true);
    expect(near(r.y, 187.5)).toBe(true);
    expect(near(Math.abs(r.angle), Math.PI)).toBe(true);
  });

  it('à droite : bord droit réduit, flèche vers la droite (angle 0)', () => {
    const r = at(1.5, 0.5);
    expect(near(r.x, 667 - M)).toBe(true);
    expect(near(r.angle, 0)).toBe(true);
  });

  it('en haut : bord haut réduit, flèche vers le haut (angle -π/2)', () => {
    const r = at(0.5, -1);
    expect(near(r.y, M)).toBe(true);
    expect(near(r.x, 333.5)).toBe(true);
    expect(near(r.angle, -Math.PI / 2)).toBe(true);
  });

  it('en bas : bord bas réduit, flèche vers le bas (angle π/2)', () => {
    const r = at(0.5, 2);
    expect(near(r.y, 375 - M)).toBe(true);
    expect(near(r.angle, Math.PI / 2)).toBe(true);
  });

  it.each([[-1, -1, M, M], [2, -1, 667 - M, M], [-1, 2, M, 375 - M], [2, 2, 667 - M, 375 - M]])('coin (%f, %f) : le point du bord est dans le rectangle réduit', (x, y) => {
    const r = at(x, y);
    expect(r.visible).toBe(true);
    expect(r.x).toBeGreaterThanOrEqual(M - 1e-6);
    expect(r.x).toBeLessThanOrEqual(667 - M + 1e-6);
    expect(r.y).toBeGreaterThanOrEqual(M - 1e-6);
    expect(r.y).toBeLessThanOrEqual(375 - M + 1e-6);
    expect(near(r.x, M) || near(r.x, 667 - M) || near(r.y, M) || near(r.y, 375 - M)).toBe(true);
  });

  it('la flèche est sur la demi-droite qui part du centre vers le point', () => {
    for (const [x, y] of [[-0.4, 0.2], [1.7, 0.9], [0.3, -2], [0.8, 3], [-3, -3]]) {
      const r = at(x, y);
      const dx = x * 667 - 333.5;
      const dy = y * 375 - 187.5;
      const cross = (r.x - 333.5) * dy - (r.y - 187.5) * dx;
      expect(Math.abs(cross) / Math.hypot(dx, dy)).toBeLessThan(1e-6);
      expect((r.x - 333.5) * dx + (r.y - 187.5) * dy).toBeGreaterThan(0);
      expect(near(r.angle, Math.atan2(dy, dx))).toBe(true);
    }
  });

  it('une marge plus grande décale le bord', () => {
    expect(near(edgeIndicator({ x: -1, y: 0.5 }, VIEW, 50).x, 50)).toBe(true);
    expect(near(edgeIndicator({ x: -1, y: 0.5 }, VIEW, 0).x, 0)).toBe(true);
  });

  it('marge négative ou invalide : 0 ; marge trop grande : ramenée à la moitié de la plus petite dimension', () => {
    expect(near(edgeIndicator({ x: -1, y: 0.5 }, VIEW, -9).x, 0)).toBe(true);
    expect(near(edgeIndicator({ x: -1, y: 0.5 }, VIEW, 'x').x, 0)).toBe(true);
    const huge = edgeIndicator({ x: -1, y: 0.5 }, VIEW, 9999);
    expect(huge.visible).toBe(true);
    expect(near(huge.x, 187.5)).toBe(true);
    expect(near(huge.y, 187.5)).toBe(true);
  });
});

describe('edge-arrow.js : point derrière la caméra', () => {
  it('la direction est inversée : un point projeté à gauche derrière la caméra donne une flèche vers la droite', () => {
    const r = at(0.2, 0.5, true);
    expect(r.visible).toBe(true);
    expect(near(r.x, 667 - M)).toBe(true);
    expect(near(r.angle, 0)).toBe(true);
  });

  it('même un point projeté au milieu de l\'écran donne une flèche quand il est derrière', () => {
    expect(at(0.5, 0.3, true).visible).toBe(true);
    expect(near(at(0.5, 0.3, true).angle, Math.PI / 2)).toBe(true); // projeté au-dessus du centre, derrière : vers le bas
  });

  it('pile au centre et derrière : vers le bas, jamais NaN', () => {
    const r = at(0.5, 0.5, true);
    expect(r.visible).toBe(true);
    expect(near(r.angle, Math.PI / 2)).toBe(true);
    expect(Number.isFinite(r.x) && Number.isFinite(r.y)).toBe(true);
  });
});

describe('edge-arrow.js : entrées invalides', () => {
  it.each([[NaN, 0.5], [0.5, NaN], [Infinity, 0.5], [0.5, -Infinity], ['x', 0.5], [null, null], [undefined, undefined]])('point (%s, %s) : masqué', (x, y) => {
    expect(edgeIndicator({ x, y }, VIEW, M)).toEqual({ visible: false, x: 0, y: 0, angle: 0 });
  });

  it.each([[{ width: 0, height: 375 }], [{ width: 667, height: 0 }], [{ width: -5, height: 375 }], [{ width: NaN, height: 375 }], [{}], [null], [undefined]])('vue %j : masquée', (view) => {
    expect(edgeIndicator({ x: -1, y: 0.5 }, view, M)).toEqual({ visible: false, x: 0, y: 0, angle: 0 });
  });

  it('entrées hostiles : jamais d\'exception', () => {
    for (const bad of WEIRD) {
      expect(() => edgeIndicator(bad, bad, bad)).not.toThrow();
      expect(edgeIndicator(bad, VIEW, M).visible).toBe(false);
      expect(() => edgeIndicator({ x: 0.5, y: 0.5 }, VIEW, bad)).not.toThrow();
    }
  });

  it('déterministe, résultat neuf, arguments gelés non modifiés', () => {
    const point = deepFreeze({ x: -0.3, y: 0.4, behind: false });
    const view = deepFreeze({ ...VIEW });
    expect(edgeIndicator(point, view, M)).toEqual(edgeIndicator(point, view, M));
    expect(edgeIndicator(point, view, M)).not.toBe(edgeIndicator(point, view, M));
    expect(Object.isFrozen(edgeIndicator(null, view, M))).toBe(false);
  });

  it('une vue minuscule (1 × 1) reste finie', () => {
    const r = edgeIndicator({ x: 5, y: -5 }, { width: 1, height: 1 }, M);
    expect(r.visible).toBe(true);
    expect(Number.isFinite(r.x) && Number.isFinite(r.y) && Number.isFinite(r.angle)).toBe(true);
  });
});
