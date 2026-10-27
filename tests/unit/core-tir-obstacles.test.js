import { describe, it, expect } from 'vitest';
import { applyImpacts, createWeaponState, stepWeapon } from '../../js/core/combat.js';
import { createBullet, stepBullets } from '../../js/core/projectile.js';
import { castRay } from '../../js/core/ray.js';
import { effectiveWeapon } from '../../js/core/player-stats.js';
import { deepFreeze, load, WEIRD } from './helpers/monde.js';

// Lot 2b : l'arme du jeu au niveau 0 (portée de tir 700, balle jusqu'à 800) ; la distance maximale de la balle n'est plus dans weapons.json.
const pistol = effectiveWeapon(load('weapons').pistol, {}, load('player-stats'));
const bounds = { minX: 0, minY: 0, maxX: 3000, maxY: 2000 };
const table = { id: 'table-1', x: 800, y: 950, w: 100, h: 100, hauteur: 40, kind: 'table' };
const at = (x, y, r = 20, id = 1) => ({ id, x, y, r });
const origin = { x: 200, y: 1000 };

describe('ray.js : le laser et la ligne de tir s\'arrêtent aux meubles', () => {
  it('le laser s\'arrête sur la face du meuble', () => {
    const r = castRay(origin, 0, 1600, [], bounds, [table]);
    expect(r.end.x).toBeCloseTo(800, 6);
    expect(r.length).toBeCloseTo(600, 6);
    expect(r.stoppedBy).toEqual({ id: 'table-1', distance: 600 });
    expect(r.hit).toBeNull();
  });

  it('un ennemi derrière un meuble n\'est pas visé', () => {
    const r = castRay(origin, 0, 1600, [at(1200, 1000)], bounds, [table]);
    expect(r.hit).toBeNull();
    expect(r.stoppedBy.id).toBe('table-1');
  });

  it('un ennemi devant le meuble est visé, le meuble ne compte pas', () => {
    const r = castRay(origin, 0, 1600, [at(500, 1000)], bounds, [table]);
    expect(r.hit.id).toBe(1);
    expect(r.stoppedBy).toBeNull();
  });

  it('un ennemi qui dépasse du meuble sur le côté reste visible', () => {
    const r = castRay(origin, 0, 1600, [at(1200, 1000)], bounds, [{ ...table, y: 1100 }]);
    expect(r.hit.id).toBe(1);
  });

  it('sans obstacle, rien ne change par rapport au lot 1m', () => {
    const a = castRay(origin, 0, 600, [at(500, 1000)], bounds);
    const b = castRay(origin, 0, 600, [at(500, 1000)], bounds, []);
    expect(b).toEqual({ ...a, stoppedBy: null });
    expect(a.stoppedByWall).toBe(false);
  });

  it('un tir qui part du bord d\'un meuble est arrêté tout de suite', () => {
    expect(castRay({ x: 850, y: 1000 }, 0, 300, [at(1000, 1000)], bounds, [table]).length).toBe(0);
  });

  it('le laser de 300 n\'est pas arrêté par un meuble à 550, mais la ligne de tir de 700 l\'est : aucun tir sur un zombie caché', () => {
    const zombie = at(900, 1000);
    const laser = castRay(origin, 0, pistol.laserRange, [zombie], bounds, [table]);
    const fireLine = castRay(origin, 0, pistol.fireRange, [zombie], bounds, [table]);
    expect(laser.stoppedBy).toBeNull();
    expect(laser.length).toBe(300);
    expect(fireLine.hit).toBeNull();
    // Le tir part seulement si l'une des deux lignes touche un ennemi : ici aucune.
    const aimed = laser.hit !== null || fireLine.hit !== null;
    expect(stepWeapon(createWeaponState(), 0.05, aimed, pistol, 0).fire).toBe(false);
  });

  it('le tir part sur un zombie visible à 650 unités (au-delà du laser, dans la portée de 700)', () => {
    const zombie = at(850, 1000);
    const fireLine = castRay(origin, 0, pistol.fireRange, [zombie], bounds, [{ ...table, y: 1500 }]);
    expect(fireLine.hit.id).toBe(1);
    expect(stepWeapon(createWeaponState(), 0.05, true, pistol, 0).fire).toBe(true);
  });
});

describe('projectile.js : une balle qui touche un meuble disparaît sans dégâts', () => {
  const fly = (bullets, enemies, obstacles, steps = 40) => {
    let b = bullets;
    const impacts = [];
    const gone = [];
    for (let i = 0; i < steps; i += 1) {
      const r = stepBullets(b, enemies, 0.05, bounds, obstacles);
      b = r.bullets;
      impacts.push(...r.impacts);
      gone.push(...r.gone);
    }
    return { b, impacts, gone };
  };

  it('disparaît sur la face du meuble avec la raison « obstacle », sans impact ni dégât', () => {
    const { b, impacts, gone } = fly([createBullet(origin, 0, pistol, 1)], [], [table]);
    expect(b).toEqual([]);
    expect(impacts).toEqual([]);
    expect(gone).toHaveLength(1);
    expect(gone[0]).toMatchObject({ bulletId: 1, reason: 'obstacle', obstacleId: 'table-1' });
    expect(gone[0].x).toBeCloseTo(800, 6);
  });

  it('un zombie derrière le meuble n\'est jamais touché, aucun dégât', () => {
    const zombie = { ...at(1100, 1000), health: 50 };
    const { impacts } = fly([createBullet(origin, 0, pistol, 1)], [zombie], [table]);
    expect(impacts).toEqual([]);
    expect(applyImpacts([zombie], impacts).enemies[0].health).toBe(50);
  });

  it('un zombie devant le meuble est touché normalement', () => {
    const { impacts, gone } = fly([createBullet(origin, 0, pistol, 1)], [at(500, 1000)], [table]);
    expect(impacts).toHaveLength(1);
    expect(impacts[0].enemyId).toBe(1);
    expect(gone).toEqual([]);
  });

  it('même une paroi fine de 40 ne laisse pas passer une balle de 1100 par seconde (55 par pas)', () => {
    const thin = { id: 'etagere', x: 800, y: 900, w: 40, h: 200 };
    const { gone, b } = fly([createBullet(origin, 0, pistol, 1)], [], [thin]);
    expect(b).toEqual([]);
    expect(gone[0].reason).toBe('obstacle');
  });

  it('sans obstacle, la balle continue jusqu\'à sa portée comme au lot 1m', () => {
    const { gone } = fly([createBullet(origin, 0, pistol, 1)], [], [], 80);
    expect(gone).toHaveLength(1);
    expect(gone[0].reason).toBe('range');
  });

  it('arguments gelés non modifiés, entrées inattendues sans exception', () => {
    const bullets = deepFreeze([createBullet(origin, 0, pistol, 1)]);
    const obstacles = deepFreeze([table]);
    const a = stepBullets(bullets, [], 0.05, bounds, obstacles);
    expect(stepBullets(bullets, [], 0.05, bounds, obstacles)).toEqual(a);
    for (const w of WEIRD) {
      expect(() => stepBullets(bullets, w, 0.05, bounds, w)).not.toThrow();
      expect(() => castRay(w, w, w, w, w, w)).not.toThrow();
      expect(Number.isFinite(castRay(origin, 0, 100, [], bounds, w).length)).toBe(true);
    }
  });
});

describe('tir à travers les fenêtres', () => {
  const walls = [{ id: 'mur-1', x: 800, y: 0, w: 40, h: 960 }, { id: 'mur-2', x: 800, y: 1040, w: 40, h: 960 }]; // ouverture de 80 à y 960-1040
  it('le laser et la balle passent par l\'ouverture, pas à côté', () => {
    expect(castRay({ x: 400, y: 1000 }, 0, 1600, [at(1200, 1000)], bounds, walls).hit.id).toBe(1);
    expect(castRay({ x: 400, y: 500 }, 0, 1600, [at(1200, 500)], bounds, walls).hit).toBeNull();
    const r = stepBullets([createBullet({ x: 400, y: 1000 }, 0, pistol, 1)], [at(1200, 1000)], 0.05, bounds, walls);
    expect(r.gone).toEqual([]);
  });
});
