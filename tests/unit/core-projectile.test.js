import { describe, it, expect } from 'vitest';
import { createBullet, stepBullets } from '../../js/core/projectile.js';

const W = { damage: 25, bulletSpeed: 1100, bulletRadius: 4, bulletMaxDistance: 700 };
const B = { minX: 0, minY: 0, maxX: 1600, maxY: 900 };
const z = (id, x, y, r = 20) => ({ id, x, y, r });
const bullet = (x, y, angle = 0, weapon = W) => createBullet({ x, y }, angle, weapon, 99);

// Fait voler une balle jusqu'à sa fin ; renvoie l'issue.
function fly(b, enemies, dt = 1 / 60, moveEnemies = (e) => e) {
  let bullets = [b];
  let list = enemies;
  for (let i = 0; i < 2000 && bullets.length; i += 1) {
    const r = stepBullets(bullets, list, dt, B);
    if (r.impacts.length || r.gone.length) return { ...r, steps: i + 1 };
    bullets = r.bullets;
    list = moveEnemies(list, i);
  }
  return null;
}

describe('projectile.js', () => {
  it('1. impacte un zombie immobile et lui transmet les dégâts de l\'arme', () => {
    const r = fly(bullet(100, 300), [z(1, 400, 300)]);
    expect(r.impacts).toHaveLength(1);
    expect(r.impacts[0]).toMatchObject({ enemyId: 1, damage: 25, bulletId: 99 });
    expect(r.impacts[0].x).toBeCloseTo(376);
  });

  it('2. rate un zombie qui s\'est déplacé', () => {
    const r = fly(bullet(100, 300), [z(1, 400, 300)], 1 / 60, (list) => list.map((e) => ({ ...e, y: e.y + 6 })));
    expect(r.impacts).toHaveLength(0);
    expect(r.gone[0].reason).toBe('range');
  });

  it('3. ne traverse jamais un zombie à dt 0,05 et vitesse 3000', () => {
    const fast = { ...W, bulletSpeed: 3000, bulletMaxDistance: 5000 };
    for (const x of [400, 433, 457, 480, 501, 777]) {
      const r = fly(bullet(100, 300, 0, fast), [z(1, x, 300)], 0.05);
      expect(r.impacts[0]?.enemyId, `x=${x}`).toBe(1);
    }
  });

  it('4. touche en tangence', () => {
    expect(fly(bullet(100, 300), [z(1, 400, 324)]).impacts).toHaveLength(1);
    expect(fly(bullet(100, 300), [z(1, 400, 324.1)]).impacts).toHaveLength(0);
  });

  it('5. deux zombies alignés : le plus proche reçoit l\'impact, même dans un seul grand pas', () => {
    const fast = { ...W, bulletSpeed: 3000, bulletMaxDistance: 5000 };
    const r = stepBullets([bullet(100, 300, 0, fast)], [z(2, 300, 300), z(1, 200, 300)], 0.05, B);
    expect(r.impacts).toHaveLength(1);
    expect(r.impacts[0].enemyId).toBe(1);
  });

  it('6. s\'arrête au mur', () => {
    const r = fly(bullet(1500, 300), [], 1 / 60);
    expect(r.gone[0].reason).toBe('wall');
    expect(r.gone[0].x).toBeCloseTo(1600);
  });

  it('6b. un zombie derrière le mur n\'est pas touché', () => {
    const r = fly(bullet(1500, 300), [z(1, 1640, 300)]);
    expect(r.impacts).toHaveLength(0);
  });

  it('7. disparaît à la distance maximale', () => {
    const r = fly(bullet(100, 300), []);
    expect(r.gone[0].reason).toBe('range');
    expect(r.gone[0].x).toBeCloseTo(800, 3);
  });

  it('8. dt à 0, négatif ou énorme', () => {
    const b = bullet(100, 300);
    for (const dt of [0, -1, NaN]) {
      const r = stepBullets([b], [], dt, B);
      expect(r.bullets[0].x).toBe(100);
    }
    const huge = stepBullets([b], [], 1e9, B);
    expect(huge.bullets[0].x).toBeCloseTo(100 + 1100 * 0.05);
  });

  it('9. entrées null, NaN, objet vide', () => {
    for (const bad of [null, undefined, {}, 'x', NaN, [null, {}, NaN]]) {
      expect(() => stepBullets(bad, bad, bad, bad)).not.toThrow();
      expect(() => stepBullets([bullet(0, 0)], bad, 0.01, bad)).not.toThrow();
      expect(() => createBullet(bad, bad, bad, bad)).not.toThrow();
    }
    expect(stepBullets(null, null, 1, null)).toEqual({ bullets: [], impacts: [], gone: [] });
  });

  it('10. ne modifie pas ses arguments gelés', () => {
    const b = bullet(100, 300);
    const frozen = Object.freeze({ ...b, trail: Object.freeze([...b.trail]) });
    const enemies = Object.freeze([Object.freeze(z(1, 300, 300))]);
    const r = stepBullets(Object.freeze([frozen]), enemies, 0.05, Object.freeze({ ...B }));
    expect(frozen.x).toBe(100);
    expect(r.bullets[0]).not.toBe(frozen);
  });

  it('11. une balle fait au plus un impact, même avec des zombies superposés', () => {
    const r = stepBullets([bullet(100, 300)], [z(1, 140, 300), z(2, 140, 300), z(3, 142, 300)], 0.05, B);
    expect(r.impacts).toHaveLength(1);
    expect(r.bullets).toHaveLength(0);
  });

  it('12. propriétés sur une grille de positions et d\'angles : jamais de traversée, jamais deux impacts', () => {
    const fast = { ...W, bulletSpeed: 3000, bulletMaxDistance: 3000 };
    const open = { minX: -1e5, minY: -1e5, maxX: 1e5, maxY: 1e5 };
    for (let a = 0; a < 16; a += 1) {
      const angle = (a / 16) * Math.PI * 2;
      for (const dist of [60, 150, 333, 600]) {
        const target = z(1, 800 + Math.cos(angle) * dist, 450 + Math.sin(angle) * dist);
        let bullets = [createBullet({ x: 800, y: 450 }, angle, fast, 7)];
        let impacts = 0;
        for (let i = 0; i < 100 && bullets.length; i += 1) {
          const r = stepBullets(bullets, [target], 0.05, open);
          impacts += r.impacts.length;
          bullets = r.bullets;
        }
        expect(impacts, `angle ${a} dist ${dist}`).toBe(1);
      }
    }
  });

  it('garde une traînée de trois positions précédentes', () => {
    let bullets = [bullet(100, 300)];
    for (let i = 0; i < 5; i += 1) bullets = stepBullets(bullets, [], 0.01, B).bullets;
    expect(bullets[0].trail).toHaveLength(3);
    expect(bullets[0].trail[0].x).toBeLessThan(bullets[0].x);
  });
});
