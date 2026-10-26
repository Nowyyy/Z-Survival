import { describe, it, expect } from 'vitest';
import { castRay, rayCircle } from '../../js/core/ray.js';

const B = { minX: 0, minY: 0, maxX: 1000, maxY: 600 };
const O = { x: 100, y: 300 };
const z = (id, x, y, r = 20) => ({ id, x, y, r });

describe('ray.js', () => {
  it('touche un ennemi sur la ligne de visée', () => {
    const r = castRay(O, 0, 700, [z(1, 400, 300)], B);
    expect(r.hit.id).toBe(1);
    expect(r.hit.distance).toBeCloseTo(280);
    expect(r.end.x).toBeCloseTo(380);
  });

  it('rate un ennemi hors de la ligne', () => {
    const r = castRay(O, 0, 700, [z(1, 400, 360)], B);
    expect(r.hit).toBeNull();
    expect(r.length).toBeCloseTo(700);
  });

  it('un rayon tangent touche', () => {
    expect(castRay(O, 0, 700, [z(1, 400, 320)], B).hit.id).toBe(1);
    expect(castRay(O, 0, 700, [z(1, 400, 320.01)], B).hit).toBeNull();
  });

  it('choisit le plus proche parmi des ennemis alignés, quel que soit l\'ordre', () => {
    const list = [z(1, 600, 300), z(2, 300, 300), z(3, 450, 300)];
    expect(castRay(O, 0, 700, list, B).hit.id).toBe(2);
    expect(castRay(O, 0, 700, [...list].reverse(), B).hit.id).toBe(2);
  });

  it('s\'arrête au mur et ne touche pas ce qui est derrière', () => {
    const r = castRay({ x: 900, y: 300 }, 0, 700, [z(1, 1200, 300)], B);
    expect(r.hit).toBeNull();
    expect(r.end.x).toBeCloseTo(1000);
    expect(r.stoppedByWall).toBe(true);
  });

  it('ignore un ennemi hors de portée', () => {
    expect(castRay(O, 0, 700, [z(1, 900, 300)], B).hit).toBeNull();
    expect(castRay(O, 0, 700, [z(1, 780, 300)], B).hit.id).toBe(1);
  });

  it('un rayon de longueur nulle ne touche qu\'un ennemi déjà recouvert', () => {
    expect(castRay(O, 0, 0, [z(1, 400, 300)], B).hit).toBeNull();
    expect(castRay(O, 0, 0, [z(1, 105, 300)], B).hit.id).toBe(1);
    expect(castRay(O, 0, 0, [], B).length).toBe(0);
  });

  it('fonctionne dans toutes les directions (angles sur une grille)', () => {
    for (let i = 0; i < 16; i += 1) {
      const a = (i / 16) * Math.PI * 2;
      const target = z(1, O.x + Math.cos(a) * 120, O.y + Math.sin(a) * 120);
      expect(castRay(O, a, 700, [target], { minX: -1e4, minY: -1e4, maxX: 1e4, maxY: 1e4 }).hit.id).toBe(1);
    }
  });

  it('ne lève pas d\'exception sur des entrées inattendues', () => {
    for (const bad of [null, undefined, {}, 'x', NaN]) {
      expect(() => castRay(bad, bad, bad, bad, bad)).not.toThrow();
      expect(() => castRay(O, 0, 700, [bad, z(2, 300, 300)], B)).not.toThrow();
      expect(rayCircle(bad, { x: 1, y: 0 }, bad)).toBeNull;
    }
  });

  it('ne modifie pas ses arguments gelés', () => {
    const enemies = Object.freeze([Object.freeze(z(1, 400, 300))]);
    expect(() => castRay(Object.freeze({ ...O }), 0, 700, enemies, Object.freeze({ ...B }))).not.toThrow();
  });
});
