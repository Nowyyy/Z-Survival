import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { innerBounds, moveCircle } from '../../js/core/movement.js';

// Lot 1b : l'ancien room.json est la section « legacy » de world.json (salle du lot 1m).
const room = JSON.parse(readFileSync('data/game/world.json', 'utf8')).legacy;
const start = { x: room.width / 2, y: room.height / 2, r: 18 };
const run = (dir, steps = 200, dt = 0.05) => {
  let c = start;
  for (let i = 0; i < steps; i += 1) c = { ...c, ...moveCircle(c, dir, 220, dt, room) };
  return c;
};

describe('movement.js', () => {
  it('avance à la même vitesse en diagonale qu\'en ligne droite', () => {
    const straight = moveCircle(start, { x: 1, y: 0 }, 220, 0.05, room);
    const diagonal = moveCircle(start, { x: 1, y: 1 }, 220, 0.05, room);
    const d1 = Math.hypot(straight.x - start.x, straight.y - start.y);
    const d2 = Math.hypot(diagonal.x - start.x, diagonal.y - start.y);
    expect(d1).toBeCloseTo(11);
    expect(d2).toBeCloseTo(d1);
  });

  it.each([
    ['gauche', { x: -1, y: 0 }, 'x', (b, r) => b.minX + r],
    ['droite', { x: 1, y: 0 }, 'x', (b, r) => b.maxX - r],
    ['haut', { x: 0, y: -1 }, 'y', (b, r) => b.minY + r],
    ['bas', { x: 0, y: 1 }, 'y', (b, r) => b.maxY - r],
  ])('est bloqué par le mur %s', (_name, dir, axis, limit) => {
    const end = run(dir);
    expect(end[axis]).toBeCloseTo(limit(innerBounds(room), 18));
  });

  it('ne bouge pas avec un dt nul, négatif ou invalide', () => {
    for (const dt of [0, -1, NaN, 'x', null]) expect(moveCircle(start, { x: 1, y: 0 }, 220, dt, room)).toEqual({ x: start.x, y: start.y });
  });

  it('borne un dt énorme à 0,05 s', () => {
    const p = moveCircle(start, { x: 1, y: 0 }, 220, 1e9, room);
    expect(p.x - start.x).toBeCloseTo(11);
  });

  it('n\'a pas de mouvement sans direction (vecteur nul, NaN, objet vide)', () => {
    for (const dir of [{ x: 0, y: 0 }, { x: NaN, y: NaN }, {}, null, 'a']) {
      expect(moveCircle(start, dir, 220, 0.05, room)).toEqual({ x: start.x, y: start.y });
    }
  });

  it('un stick incliné à moitié avance à moitié vitesse', () => {
    const p = moveCircle(start, { x: 0.5, y: 0 }, 220, 0.05, room);
    expect(p.x - start.x).toBeCloseTo(5.5);
  });

  it('ne modifie pas ses arguments gelés', () => {
    const c = Object.freeze({ ...start });
    const d = Object.freeze({ x: 1, y: 1 });
    const r = Object.freeze({ ...room, windows: Object.freeze(room.windows) });
    expect(() => moveCircle(c, d, 220, 0.05, r)).not.toThrow();
    expect(c).toEqual(start);
  });

  it('ne sort jamais de la salle, même avec des entrées absurdes', () => {
    const b = innerBounds(room);
    for (const c of [{ x: -5000, y: 9000, r: 18 }, { x: NaN, y: NaN, r: 18 }, {}, null]) {
      const p = moveCircle(c, { x: 1, y: -1 }, 1e9, 1e9, room);
      expect(p.x).toBeGreaterThanOrEqual(b.minX);
      expect(p.x).toBeLessThanOrEqual(b.maxX);
      expect(p.y).toBeGreaterThanOrEqual(b.minY);
      expect(p.y).toBeLessThanOrEqual(b.maxY);
    }
  });
});
