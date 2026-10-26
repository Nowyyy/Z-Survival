import { describe, it, expect } from 'vitest';
import { applyImpacts, createWeaponState, displayHealth, muzzlePoint, stepContact, stepWeapon } from '../../js/core/combat.js';
import { stepEnemies } from '../../js/core/enemy-ai.js';
import { createRng } from '../../js/core/rng.js';
import { createSpawner, stepSpawner } from '../../js/core/spawner.js';

const W = { fireDelay: 0.4, maxBullets: 30 };
const ZOMBIE = { speed: 70, contactDamage: 10, contactDelay: 1, maxPresent: 5, spawnInterval: 3 };
const WINDOWS = [{ x: 12, y: 450 }, { x: 800, y: 12 }, { x: 1588, y: 450 }];

// Tire en continu pendant `seconds` avec des dt donnés ; renvoie les instants de tir.
function shootFor(seconds, dts) {
  let state = createWeaponState();
  let t = 0;
  const shots = [];
  for (let i = 0; t < seconds; i += 1) {
    const dt = dts[i % dts.length];
    t += dt;
    const r = stepWeapon(state, dt, true, W, 0);
    state = r.state;
    if (r.fire) shots.push(t);
  }
  return shots;
}

describe('combat.js : cadence', () => {
  it('tire dès que possible puis une seule fois par délai', () => {
    const shots = shootFor(2.05, [0.01]);
    expect(shots).toHaveLength(6);
    expect(shots[1] - shots[0]).toBeCloseTo(0.4, 1);
  });

  it('garde une cadence exacte sur des dt variés', () => {
    for (const dts of [[0.016], [0.05], [0.013, 0.021, 0.05, 0.004], [0.033]]) {
      const shots = shootFor(10, dts);
      expect(Math.abs(shots.length - 25), JSON.stringify(dts)).toBeLessThanOrEqual(1);
      // Les tirs partent à la première image après l'échéance : l'intervalle varie d'au plus un pas de temps.
      for (let i = 1; i < shots.length; i += 1) expect(shots[i] - shots[i - 1]).toBeGreaterThanOrEqual(0.4 - 0.05 - 1e-9);
    }
  });

  it('ne tire pas sans cible et ne stocke pas de tir en attente', () => {
    let state = createWeaponState();
    for (let i = 0; i < 100; i += 1) {
      const r = stepWeapon(state, 0.05, false, W, 0);
      expect(r.fire).toBe(false);
      state = r.state;
    }
    expect(stepWeapon(state, 0.05, true, W, 0).fire).toBe(true);
    expect(stepWeapon(stepWeapon(state, 0.05, true, W, 0).state, 0.05, true, W, 0).fire).toBe(false);
  });

  it('ne dépasse jamais 30 balles actives', () => {
    expect(stepWeapon(createWeaponState(), 0.05, true, W, 30).fire).toBe(false);
    expect(stepWeapon(createWeaponState(), 0.05, true, W, 29).fire).toBe(true);
  });

  it('calcule le point de départ dans la zone libre', () => {
    const b = { minX: 24, minY: 24, maxX: 1576, maxY: 876 };
    expect(muzzlePoint({ x: 100, y: 100 }, 0, 26, b)).toEqual({ x: 126, y: 100 });
    expect(muzzlePoint({ x: 30, y: 100 }, Math.PI, 26, b).x).toBe(24);
  });
});

describe('combat.js : dégâts et mort', () => {
  const enemies = [{ id: 1, x: 0, y: 0, r: 20, health: 50 }, { id: 2, x: 9, y: 9, r: 20, health: 50 }];

  it('aucune vie perdue tant qu\'aucun impact n\'est transmis', () => {
    for (const none of [[], null, undefined, [{}], [{ enemyId: 1, damage: 0 }], [{ enemyId: 1, damage: -5 }], [{ enemyId: 1, damage: NaN }]]) {
      expect(applyImpacts(enemies, none).enemies.map((e) => e.health)).toEqual([50, 50]);
    }
  });

  it('applique les dégâts d\'un impact à la bonne cible', () => {
    const r = applyImpacts(enemies, [{ enemyId: 2, damage: 25 }]);
    expect(r.enemies.find((e) => e.id === 2).health).toBe(25);
    expect(r.enemies.find((e) => e.id === 1).health).toBe(50);
  });

  it('meurt à 0 sans vie négative', () => {
    const r = applyImpacts(enemies, [{ enemyId: 1, damage: 25 }, { enemyId: 1, damage: 25 }, { enemyId: 1, damage: 25 }]);
    expect(r.killed.map((k) => k.id)).toEqual([1]);
    expect(r.enemies.map((e) => e.id)).toEqual([2]);
    expect(r.hits[0].health).toBe(0);
    expect(displayHealth(-30)).toBe(0);
    expect(displayHealth(33.2)).toBe(34);
    expect(displayHealth(NaN)).toBe(0);
  });

  it('deux balles tuent un zombie de 50 de vie avec 25 de dégâts', () => {
    let list = enemies;
    list = applyImpacts(list, [{ enemyId: 1, damage: 25 }]).enemies;
    expect(list.find((e) => e.id === 1)).toBeTruthy();
    list = applyImpacts(list, [{ enemyId: 1, damage: 25 }]).enemies;
    expect(list.find((e) => e.id === 1)).toBeUndefined();
  });

  it('ne modifie pas ses arguments gelés', () => {
    const frozen = Object.freeze(enemies.map((e) => Object.freeze({ ...e })));
    expect(() => applyImpacts(frozen, Object.freeze([Object.freeze({ enemyId: 1, damage: 25 })]))).not.toThrow();
    expect(frozen[0].health).toBe(50);
    expect(() => stepContact(Object.freeze({ x: 0, y: 0, r: 18, health: 100 }), frozen, 0.05, ZOMBIE)).not.toThrow();
  });
});

describe('combat.js : contact', () => {
  const player = { x: 0, y: 0, r: 18, health: 100 };

  it('inflige 10 de dégâts au contact puis attend 1 s', () => {
    let p = player;
    let list = [{ id: 1, x: 30, y: 0, r: 20, hitCooldown: 0 }];
    let total = 0;
    for (let t = 0; t < 3.05; t += 0.05) {
      const r = stepContact(p, list, 0.05, ZOMBIE);
      p = r.player;
      list = r.enemies;
      total += r.damage;
    }
    expect(total).toBeGreaterThanOrEqual(30);
    expect(total).toBeLessThanOrEqual(40);
    expect(p.health).toBe(100 - total);
  });

  it('pas de dégâts à distance', () => {
    const r = stepContact(player, [{ id: 1, x: 200, y: 0, r: 20 }], 0.05, ZOMBIE);
    expect(r.damage).toBe(0);
  });

  it('la vie ne devient jamais négative', () => {
    const many = Array.from({ length: 20 }, (_, i) => ({ id: i, x: 5, y: 0, r: 20, hitCooldown: 0 }));
    const r = stepContact({ ...player, health: 15 }, many, 0.05, ZOMBIE);
    expect(r.player.health).toBeGreaterThanOrEqual(0);
  });

  it('ne lève pas d\'exception sur des entrées inattendues', () => {
    for (const bad of [null, undefined, {}, 'x', NaN]) {
      expect(() => stepContact(bad, [bad], bad, bad)).not.toThrow();
      expect(() => stepWeapon(bad, bad, bad, bad, bad)).not.toThrow();
      expect(() => applyImpacts(bad, bad)).not.toThrow();
    }
  });
});

describe('enemy-ai.js', () => {
  const player = { x: 500, y: 500, r: 18 };

  it('poursuit le joueur en ligne droite à la vitesse du zombie', () => {
    const [e] = stepEnemies([{ id: 1, x: 100, y: 500, r: 20 }], player, 0.05, ZOMBIE);
    expect(e.x).toBeCloseTo(103.5);
    expect(e.y).toBeCloseTo(500);
  });

  it('sépare deux zombies qui se chevauchent', () => {
    const list = stepEnemies([{ id: 1, x: 100, y: 100, r: 20 }, { id: 2, x: 110, y: 100, r: 20 }], { x: 900, y: 100, r: 18 }, 0.05, ZOMBIE);
    expect(list[1].x - list[0].x).toBeGreaterThan(10);
  });

  it('deux zombies exactement superposés se séparent sans NaN', () => {
    const list = stepEnemies([{ id: 1, x: 100, y: 100, r: 20 }, { id: 2, x: 100, y: 100, r: 20 }], player, 0.05, ZOMBIE);
    expect(list.every((e) => Number.isFinite(e.x) && Number.isFinite(e.y))).toBe(true);
    expect(list[0].x !== list[1].x || list[0].y !== list[1].y).toBe(true);
  });

  it('un zombie sur le joueur reste sans erreur ; au contact il s\'arrête', () => {
    expect(stepEnemies([{ id: 1, x: 500, y: 500, r: 20 }], player, 0.05, ZOMBIE)[0]).toMatchObject({ x: 500, y: 500 });
    expect(stepEnemies([{ id: 1, x: 530, y: 500, r: 20 }], player, 0.05, ZOMBIE)[0].x).toBe(530);
  });

  it('ne modifie pas ses arguments et résiste aux entrées absurdes', () => {
    const frozen = Object.freeze([Object.freeze({ id: 1, x: 0, y: 0, r: 20 })]);
    expect(() => stepEnemies(frozen, Object.freeze(player), 0.05, Object.freeze(ZOMBIE))).not.toThrow();
    expect(frozen[0].x).toBe(0);
    for (const bad of [null, undefined, {}, 'x', NaN, [null]]) expect(() => stepEnemies(bad, bad, bad, bad)).not.toThrow();
  });
});

describe('spawner.js', () => {
  function run(seconds, present, seed = 5) {
    let state = createSpawner();
    let rng = createRng(seed);
    const spawns = [];
    for (let t = 0; t < seconds; t += 0.05) {
      const r = stepSpawner(state, 0.05, present(spawns.length), ZOMBIE, WINDOWS, rng);
      state = r.state;
      rng = r.rng;
      if (r.spawn) spawns.push(r.spawn);
    }
    return spawns;
  }

  it('fait apparaître un zombie toutes les 3 secondes', () => {
    expect(run(9.5, () => 0)).toHaveLength(3);
  });

  it('place les zombies à l\'une des trois ouvertures', () => {
    for (const s of run(60, () => 0)) expect(WINDOWS).toContainEqual(s);
  });

  it('n\'en fait jamais apparaître au-delà de 5 présents', () => {
    expect(run(30, () => 5)).toHaveLength(0);
    expect(run(30, (n) => n)).toHaveLength(5);
  });

  it('est reproductible avec la même graine', () => {
    expect(run(60, () => 0, 11)).toEqual(run(60, () => 0, 11));
    expect(run(60, () => 0, 11)).not.toEqual(run(60, () => 0, 12));
  });

  it('ne lève pas d\'exception sur des entrées inattendues', () => {
    for (const bad of [null, undefined, {}, 'x', NaN]) expect(() => stepSpawner(bad, bad, bad, bad, bad, bad)).not.toThrow();
    expect(stepSpawner(createSpawner(), 5, 0, ZOMBIE, [], createRng(1)).spawn).toBeNull();
    const frozen = Object.freeze({ timer: 1 });
    stepSpawner(frozen, 0.05, 0, ZOMBIE, WINDOWS, createRng(1));
    expect(frozen.timer).toBe(1);
  });
});
