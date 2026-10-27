import { describe, it, expect } from 'vitest';
import { applyImpacts, createWeaponState, healOnKill, muzzlePoint, stepWeapon } from '../../js/core/combat.js';
import { moveCircle } from '../../js/core/movement.js';
import { effectivePlayer, effectiveWeapon } from '../../js/core/player-stats.js';
import { createBullet, stepBullets } from '../../js/core/projectile.js';
import { castRay } from '../../js/core/ray.js';
import { createRng } from '../../js/core/rng.js';
import { shotAngle, toRadians } from '../../js/core/spread.js';
import { simulate } from './helpers/sim-lot1.js';
import { deepFreeze, load, WEIRD } from './helpers/monde.js';

const params = load('player-stats');
const pistol = load('weapons').pistol;
const player = load('player');
const room = load('world').legacy;
const W = (levels) => effectiveWeapon(pistol, levels, params);
const bounds = { minX: 0, minY: 0, maxX: 5000, maxY: 2000 };
const origin = { x: 100, y: 1000 };
const at = (x, y = 1000, r = 20, id = 1) => ({ id, x, y, r });
const fly = (bullets, enemies = [], steps = 200) => {
  let b = bullets;
  const impacts = [];
  const gone = [];
  for (let i = 0; i < steps; i += 1) {
    const r = stepBullets(b, enemies, 0.05, bounds);
    b = r.bullets;
    impacts.push(...r.impacts);
    gone.push(...r.gone);
  }
  return { b, impacts, gone };
};

describe('combat.js et projectile.js : dégâts figés, délai et portée effectifs', () => {
  it('les dégâts sont figés à la création : changer les niveaux ensuite ne touche pas la balle', () => {
    const bullet = createBullet(origin, 0, W({ degats: 10 }), 1);
    expect(bullet.damage).toBe(62.5);
    W({}); // d'autres niveaux plus tard
    const flight = fly([bullet], [at(400)], 20);
    expect(flight.impacts[0].damage).toBe(62.5);
    expect(createBullet(origin, 0, W({}), 2).damage).toBe(25);
  });

  it('niveau 0 et niveau 10 : une balle fait 25 et 62,5 points de dégâts à l\'impact', () => {
    for (const [lvl, dmg] of [[0, 25], [10, 62.5]]) {
      const hit = fly([createBullet(origin, 0, W({ degats: lvl }), 1)], [at(400)], 20).impacts;
      expect(hit).toHaveLength(1);
      const after = applyImpacts([{ id: 1, health: 100 }], hit).enemies[0];
      expect(after.health).toBe(100 - dmg);
    }
  });

  it('une balle porte son axe de visée (aimAngle), par défaut égal à son angle', () => {
    expect(createBullet(origin, 0.3, W({}), 1).aimAngle).toBe(0.3);
    const b = createBullet(origin, 0.3, W({}), 1, 0.25);
    expect(b.angle).toBe(0.3);
    expect(b.aimAngle).toBe(0.25);
    expect(b.dirX).toBeCloseTo(Math.cos(0.3), 12);
  });

  it('la balle part dans la direction réelle, pas sur l\'axe de visée', () => {
    const half = toRadians(12);
    const { angle } = shotAngle(0, half, createRng(11));
    expect(angle).not.toBe(0);
    const bullet = createBullet(origin, angle, W({}), 1, 0);
    const next = stepBullets([bullet], [], 0.05, bounds).bullets[0];
    expect(Math.atan2(next.y - origin.y, next.x - origin.x)).toBeCloseTo(angle, 9);
  });

  it('délai effectif : un tir toutes les 0,4 s au niveau 0 et 0,15 s au niveau 10', () => {
    const count = (lvl) => {
      const w = W({ cadence: lvl });
      let state = createWeaponState();
      let shots = 0;
      for (let i = 0; i < 1200; i += 1) {
        const r = stepWeapon(state, 0.05, true, w, 0);
        state = r.state;
        if (r.fire) shots += 1;
      }
      return shots;
    };
    expect(Math.abs(count(0) - 60 / 0.4)).toBeLessThanOrEqual(1);
    expect(Math.abs(count(10) - 60 / 0.15)).toBeLessThanOrEqual(1);
  });

  it('portée effective de base : le tir part à 650 et pas à 750 (ligne libre)', () => {
    const w = W({});
    const aimedAt = (distance) => castRay(origin, 0, w.fireRange, [at(origin.x + distance)], bounds).hit !== null;
    expect(aimedAt(650)).toBe(true);
    expect(aimedAt(750)).toBe(false);
    expect(stepWeapon(createWeaponState(), 0.05, aimedAt(650), w, 0).fire).toBe(true);
    expect(stepWeapon(createWeaponState(), 0.05, aimedAt(750), w, 0).fire).toBe(false);
  });

  it('portée niveau 10 : tir à 1 400 et pas à 1 600 ; laser de 660', () => {
    const w = W({ portee: 10 });
    expect(castRay(origin, 0, w.fireRange, [at(origin.x + 1400)], bounds).hit).not.toBeNull();
    expect(castRay(origin, 0, w.fireRange, [at(origin.x + 1600)], bounds).hit).toBeNull();
    expect(castRay(origin, 0, w.laserRange, [], bounds).length).toBeCloseTo(660, 9);
    expect(castRay(origin, 0, W({}).laserRange, [], bounds).length).toBe(300);
  });

  it('la balle disparaît à la distance maximale (portée de tir + 100)', () => {
    for (const lvl of [0, 5]) {
      const w = W({ portee: lvl });
      const { gone, b } = fly([createBullet(origin, 0, w, 1)], [], 400);
      expect(b).toHaveLength(0);
      expect(gone).toHaveLength(1);
      expect(gone[0].reason).toBe('range');
      expect(gone[0].x - origin.x).toBeCloseTo(w.fireRange + 100, 6);
    }
  });

  it('une balle ne touche pas un zombie au-delà de sa portée maximale', () => {
    expect(fly([createBullet(origin, 0, W({}), 1)], [at(origin.x + 900)]).impacts).toHaveLength(0);
    expect(fly([createBullet(origin, 0, W({}), 1)], [at(origin.x + 700)]).impacts).toHaveLength(1);
  });

  it('valeurs par défaut de ray.js et projectile.js : sans paramètre de portée, comportement du lot 2', () => {
    expect(castRay(origin, 0, undefined, [at(200)], bounds).length).toBe(0);
    expect(createBullet(origin, 0, undefined, 1).maxDistance).toBe(0);
    expect(createBullet(origin, 0, { damage: 25, bulletSpeed: 1100, bulletRadius: 4, bulletMaxDistance: 1600 }, 1)).toMatchObject({ damage: 25, maxDistance: 1600, aimAngle: 0 });
  });

  it('muzzlePoint et applyImpacts inchangés avec une arme effective', () => {
    expect(muzzlePoint({ x: 0, y: 0 }, 0, W({}).muzzleOffset, null)).toEqual({ x: 26, y: 0 });
  });

  it('arguments gelés non modifiés', () => {
    const weapon = deepFreeze(W({ degats: 3 }));
    const bullet = deepFreeze(createBullet(origin, 0, weapon, 1, 0));
    expect(() => stepBullets([bullet], [at(400)], 0.05, bounds)).not.toThrow();
    expect(bullet.traveled).toBe(0);
  });
});

describe('movement.js : vitesse effective', () => {
  const speedOf = (lvl) => {
    const p = effectivePlayer(player, { vitesse: lvl }, params);
    let c = { x: 200, y: 450, r: player.radius };
    for (let i = 0; i < 10; i += 1) c = { ...c, ...moveCircle(c, { x: 1, y: 0 }, p.speed, 0.05, room) };
    return (c.x - 200) / 0.5;
  };

  it('220 au niveau 0 et 308 au niveau 10 (mesure par moveCircle)', () => {
    expect(speedOf(0)).toBeCloseTo(220, 6);
    expect(speedOf(10)).toBeCloseTo(308, 6);
  });

  it('la vitesse effective ne dépasse jamais 308', () => {
    expect(speedOf(99)).toBeLessThanOrEqual(308 + 1e-6);
  });
});

describe('combat.js : healOnKill', () => {
  it.each([[1, 51], [2, 52], [6, 56], [11, 61]])('régénération de %s PV par kill : 50 devient %s', (regen, expected) => {
    expect(healOnKill(50, 100, regen, true)).toBe(expected);
  });

  it('plafonnée au maximum', () => {
    expect(healOnKill(99, 100, 11, true)).toBe(100);
    expect(healOnKill(100, 100, 11, true)).toBe(100);
    expect(healOnKill(158, 160, 7, true)).toBe(160);
  });

  it('aucun soin à vie 0 ou négative, ni si le joueur n\'est pas vivant', () => {
    expect(healOnKill(0, 100, 11, true)).toBe(0);
    expect(healOnKill(-5, 100, 11, true)).toBe(0);
    expect(healOnKill(50, 100, 11, false)).toBe(50);
    expect(healOnKill(50, 100, 11, undefined)).toBe(50);
    expect(healOnKill(50, 100, 11, 'true')).toBe(50);
  });

  it('régénération négative ou invalide : aucun soin, jamais de perte', () => {
    expect(healOnKill(50, 100, -10, true)).toBe(50);
    expect(healOnKill(50, 100, NaN, true)).toBe(50);
  });

  it('entrées hostiles : valeur finie et non négative, sans exception', () => {
    for (const a of WEIRD) for (const b of WEIRD) for (const c of WEIRD) for (const d of [true, false, ...WEIRD]) {
      const r = healOnKill(a, b, c, d);
      expect(Number.isFinite(r) && r >= 0).toBe(true);
    }
  });
});

describe('simulation pure du lot 1 (legacy)', () => {
  it.each([[42, { shots: 21, impacts: 18, kills: 9, health: 100, dead: false, enemies: 0, time: 30 }], [7, { shots: 26, impacts: 18, kills: 9, health: 100, dead: false, enemies: 0, time: 30 }]])('graine %s : résultats du lot 1 inchangés', async (seed, expected) => {
    expect(await simulate(process.cwd(), { seed, legacy: true })).toEqual(expected);
  });

  it('même sans cône, les modules de tir donnent la même simulation qu\'au lot 2 (portée de base 700)', async () => {
    const a = await simulate(process.cwd(), { seed: 42 });
    const b = await simulate(process.cwd(), { seed: 42, weaponPatch: { fireRange: 700 } });
    expect(a).toEqual(b);
  });
});
