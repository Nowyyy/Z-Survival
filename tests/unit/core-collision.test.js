import { describe, it, expect } from 'vitest';
import { circleOverlapsRect, clearSegment, distanceToRect, firstOnSegment, inflateRect, moveWithCollision, rectGap, segmentRect } from '../../js/core/collision.js';
import { innerBounds, moveCircle } from '../../js/core/movement.js';
import { createRng, nextFloat } from '../../js/core/rng.js';
import { deepFreeze, WEIRD } from './helpers/monde.js';

const box = { id: 'b', x: 200, y: 100, w: 100, h: 100 };
const R = 18;

describe('collision.js : cercle contre rectangles', () => {
  it('sans obstacle, avance simplement et reste dans les bornes', () => {
    expect(moveWithCollision({ x: 0, y: 0, r: R }, { x: 10, y: 5 })).toEqual({ x: 10, y: 5 });
    expect(moveWithCollision({ x: 90, y: 50, r: R }, { x: 50, y: 0 }, [], { minX: 0, minY: 0, maxX: 100, maxY: 100 })).toEqual({ x: 82, y: 50 });
  });

  it('glisse le long d\'un mur : le mouvement parallèle continue', () => {
    const bounds = { minX: 0, minY: 0, maxX: 1000, maxY: 1000 };
    const p = moveWithCollision({ x: 982, y: 500, r: R }, { x: 20, y: 20 }, [], bounds);
    expect(p).toEqual({ x: 982, y: 520 });
  });

  it('glisse le long d\'un meuble : bloqué sur x, libre sur y', () => {
    const p = moveWithCollision({ x: 175, y: 120, r: R }, { x: 20, y: 20 }, [box]);
    expect(p.x).toBeCloseTo(200 - R, 6);
    expect(p.y).toBeCloseTo(140, 6);
  });

  it('un coin arrête le cercle à son rayon sans le traverser', () => {
    let c = { x: 150, y: 50, r: R };
    for (let i = 0; i < 60; i += 1) c = { ...c, ...moveWithCollision(c, { x: 8, y: 8 }, [box]) };
    expect(distanceToRect(c.x, c.y, box)).toBeGreaterThanOrEqual(R - 1e-6);
  });

  it('passe un couloir de 90 entre deux meubles', () => {
    const walls = [{ x: 200, y: 0, w: 100, h: 100 }, { x: 200, y: 190, w: 100, h: 100 }];
    let c = { x: 100, y: 145, r: R };
    for (let i = 0; i < 80; i += 1) c = { ...c, ...moveWithCollision(c, { x: 11, y: 0 }, walls) };
    expect(c.x).toBeCloseTo(100 + 80 * 11, 6);
  });

  it('ne passe pas un couloir plus étroit que son diamètre', () => {
    const walls = [{ x: 200, y: 0, w: 100, h: 100 }, { x: 200, y: 130, w: 100, h: 100 }];
    let c = { x: 100, y: 115, r: R };
    for (let i = 0; i < 80; i += 1) c = { ...c, ...moveWithCollision(c, { x: 11, y: 0 }, walls) };
    expect(c.x).toBeLessThan(200);
  });

  it('ne traverse jamais un obstacle de 40 aux pas bornés du jeu (220 × 0,05), dans toutes les directions', () => {
    const slab = { x: 400, y: 400, w: 40, h: 40 };
    let rng = createRng(11);
    for (let t = 0; t < 40; t += 1) {
      const a = nextFloat(rng);
      rng = a.rng;
      const angle = a.value * Math.PI * 2;
      let c = { x: 420 - Math.cos(angle) * 150, y: 420 - Math.sin(angle) * 150, r: R };
      for (let i = 0; i < 60; i += 1) {
        c = { ...c, ...moveWithCollision(c, { x: Math.cos(angle) * 11, y: Math.sin(angle) * 11 }, [slab]) };
        expect(distanceToRect(c.x, c.y, slab), `essai ${t} pas ${i}`).toBeGreaterThanOrEqual(R - 1e-6);
      }
    }
  });

  it('un très grand déplacement en une fois ne traverse pas non plus', () => {
    const p = moveWithCollision({ x: 100, y: 150, r: R }, { x: 900, y: 0 }, [box]);
    expect(p.x).toBeCloseTo(200 - R, 6);
  });

  it('sort un cercle déjà enfoncé dans un obstacle', () => {
    const p = moveWithCollision({ x: 250, y: 150, r: R }, { x: 0, y: 0 }, [box]);
    expect(distanceToRect(p.x, p.y, box)).toBeGreaterThanOrEqual(R - 1e-6);
  });

  it('circleOverlapsRect : un simple contact n\'est pas un recouvrement', () => {
    expect(circleOverlapsRect({ x: 182, y: 150, r: R }, box)).toBe(false);
    expect(circleOverlapsRect({ x: 190, y: 150, r: R }, box)).toBe(true);
  });

  it('rectGap et inflateRect', () => {
    expect(rectGap({ x: 0, y: 0, w: 10, h: 10 }, { x: 100, y: 0, w: 10, h: 10 })).toBe(90);
    expect(rectGap({ x: 0, y: 0, w: 10, h: 10 }, { x: 5, y: 5, w: 10, h: 10 })).toBe(0);
    expect(rectGap({ x: 0, y: 0, w: 10, h: 10 }, { x: 13, y: 14, w: 10, h: 10 })).toBe(5);
    expect(inflateRect(box, 5)).toEqual({ id: 'b', x: 195, y: 95, w: 110, h: 110 });
  });
});

describe('collision.js : segment contre rectangles', () => {
  it('touche : renvoie la fraction d\'entrée', () => {
    expect(segmentRect(100, 150, 400, 150, box)).toBeCloseTo(1 / 3, 9);
  });

  it('rate : au-dessus, trop court, ou dans l\'autre sens', () => {
    expect(segmentRect(100, 50, 400, 50, box)).toBeNull();
    expect(segmentRect(100, 150, 150, 150, box)).toBeNull();
    expect(segmentRect(100, 150, 0, 150, box)).toBeNull();
  });

  it('tangent : effleurer une arête ou un coin compte comme toucher', () => {
    expect(segmentRect(100, 100, 400, 100, box)).toBeCloseTo(1 / 3, 9);
    expect(segmentRect(100, 0, 300, 200, { x: 300, y: 200, w: 10, h: 10 })).toBe(1);
  });

  it('départ dans le rectangle : 0', () => {
    expect(segmentRect(250, 150, 400, 150, box)).toBe(0);
  });

  it('firstOnSegment renvoie le plus proche, clearSegment tient compte de la marge', () => {
    const near = { id: 'n', x: 120, y: 140, w: 10, h: 20 };
    expect(firstOnSegment(0, 150, 500, 150, [box, near]).obstacle.id).toBe('n');
    expect(clearSegment({ x: 0, y: 80 }, { x: 500, y: 80 }, [box])).toBe(true);
    expect(clearSegment({ x: 0, y: 80 }, { x: 500, y: 80 }, [box], 30)).toBe(false);
  });
});

describe('movement.js : salle, meubles, glissement', () => {
  const room = { x: 800, y: 800, width: 2000, height: 1200, wall: 24 };

  it('innerBounds suit le décalage de la salle (0 par défaut, comme au lot 1m)', () => {
    expect(innerBounds({ width: 1600, height: 900, wall: 24 })).toEqual({ minX: 24, minY: 24, maxX: 1576, maxY: 876 });
    expect(innerBounds(room)).toEqual({ minX: 824, minY: 824, maxX: 2776, maxY: 1976 });
  });

  it('sans obstacle, donne exactement le résultat du lot 1m', () => {
    const lot1m = (c, dir, speed, dt, r) => {
      const b = { minX: 24, minY: 24, maxX: 1576, maxY: 876 };
      const len = Math.hypot(dir.x, dir.y);
      const d = len > 1 ? { x: dir.x / len, y: dir.y / len } : dir;
      const step = Math.min(dt, 0.05) * speed;
      return { x: Math.min(Math.max(c.x + d.x * step, b.minX + r), Math.max(b.minX + r, b.maxX - r)), y: Math.min(Math.max(c.y + d.y * step, b.minY + r), Math.max(b.minY + r, b.maxY - r)) };
    };
    let rng = createRng(3);
    for (let i = 0; i < 200; i += 1) {
      const v = [0, 0, 0, 0, 0].map(() => {
        const n = nextFloat(rng);
        rng = n.rng;
        return n.value;
      });
      const c = { x: v[0] * 1600, y: v[1] * 900, r: 18 };
      const dir = { x: v[2] * 2 - 1, y: v[3] * 2 - 1 };
      expect(moveCircle(c, dir, 220, 0.02 + v[4] * 0.05, { width: 1600, height: 900, wall: 24 })).toEqual(lot1m(c, dir, 220, 0.02 + v[4] * 0.05, 18));
    }
  });

  it('un meuble bloque le joueur', () => {
    const table = { id: 't', x: 1000, y: 1300, w: 200, h: 100 };
    let c = { x: 900, y: 1350, r: 18 };
    for (let i = 0; i < 100; i += 1) c = { ...c, ...moveCircle(c, { x: 1, y: 0 }, 220, 0.05, room, [table]) };
    expect(c.x).toBeCloseTo(1000 - 18, 6);
  });

  it('le joueur longe un meuble en diagonale sans perdre sa vitesse le long de la face', () => {
    const table = { id: 't', x: 1000, y: 1300, w: 200, h: 100 };
    const c = moveCircle({ x: 982, y: 1350, r: 18 }, { x: 1, y: 1 }, 220, 0.05, room, [table]);
    expect(c.x).toBeCloseTo(982, 6);
    expect(c.y).toBeCloseTo(1350 + 11 / Math.SQRT2, 6); // la diagonale est normalisée
  });

  it('le joueur ne sort pas par une fenêtre fermée par sa barrière', () => {
    const barrier = { id: 'b', x: 1730, y: 808, w: 140, h: 16 };
    let c = { x: 1800, y: 1000, r: 18 };
    for (let i = 0; i < 200; i += 1) c = { ...c, ...moveCircle(c, { x: 0, y: -1 }, 220, 0.05, room, [barrier]) };
    expect(c.y).toBeGreaterThanOrEqual(824 + 18 - 1e-9);
  });

  it('arguments gelés non modifiés, entrées inattendues sans exception, résultat déterministe', () => {
    const circle = deepFreeze({ x: 1000, y: 1000, r: 18 });
    const obstacles = deepFreeze([{ id: 't', x: 1100, y: 950, w: 100, h: 100 }]);
    const a = moveCircle(circle, { x: 1, y: 0 }, 220, 0.05, deepFreeze({ ...room }), obstacles);
    expect(moveCircle(circle, { x: 1, y: 0 }, 220, 0.05, room, obstacles)).toEqual(a);
    for (const w of WEIRD) {
      for (const v of [moveCircle(w, w, w, w, w, w), moveCircle(circle, { x: 1, y: 0 }, 220, 0.05, room, w), moveWithCollision(w, w, w, w)]) {
        expect(Number.isFinite(v.x) && Number.isFinite(v.y)).toBe(true);
      }
      expect(segmentRect(w, w, w, w, w)).toBeNull();
      expect(typeof clearSegment(w, w, w, w)).toBe('boolean');
      expect(firstOnSegment(w, w, w, w, w)).toBeNull();
    }
  });
});
