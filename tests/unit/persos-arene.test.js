import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { ARENA_STEP, createArena, runArena, stepArena } from '../../js/core/arena.js';
import { GAITS, TYPES, approach, nearest, ringSpawn } from '../../js/core/crowd.js';
import { createEnemy } from '../../js/core/enemy-factory.js';
import { createBloodFx } from '../../js/game/blood-fx.js';
import { load, lookup } from '../../scripts/personnages/lib.mjs';

// Lot 3j-C : mini-arène (simulation pure) et foule.
const cfg = { enemies: load('enemies'), gaits: load('gaits'), weapon: load('weapons').pistol, player: load('player'), count: 10, radius: 300 };
const spec = { hpMul: 1, speedMul: 1, damageMul: 1 };

describe('crowd.js', () => {
  it('ringSpawn : déterministe, 10 zombies, les 4 types présents, allures connues, sur la couronne', () => {
    const a = ringSpawn(7, 10, 300);
    expect(ringSpawn(7, 10, 300)).toEqual(a);
    expect(ringSpawn(8, 10, 300)).not.toEqual(a);
    expect(a).toHaveLength(10);
    expect(new Set(a.map((z) => z.type))).toEqual(new Set(TYPES));
    for (const z of a) {
      expect(GAITS).toContain(z.gait);
      const d = Math.hypot(z.x, z.y);
      expect(d).toBeGreaterThan(250);
      expect(d).toBeLessThan(350);
    }
  });
  it('ringSpawn : chaque bloc de 4 contient les 4 types', () => {
    const a = ringSpawn(3, 8, 100).map((z) => z.type);
    expect(new Set(a.slice(0, 4)).size).toBe(4);
    expect(new Set(a.slice(4, 8)).size).toBe(4);
  });
  it('approach : avance de vitesse × dt, jamais plus près que stop', () => {
    const r = approach({ x: 100, y: 0 }, { x: 0, y: 0 }, 50, 0.5, 20);
    expect(r.x).toBeCloseTo(75, 9);
    expect(r.arrived).toBe(false);
    const s = approach({ x: 25, y: 0 }, { x: 0, y: 0 }, 50, 1, 20);
    expect(s.x).toBeCloseTo(20, 9);
    expect(s.arrived).toBe(true);
    expect(approach(null, null, NaN, NaN).moved).toBe(0);
  });
  it('nearest : le plus proche des vivants ; aucun : null', () => {
    const list = [{ id: 1, x: 10, y: 0 }, { id: 2, x: 3, y: 0, alive: false }, { id: 3, x: 5, y: 0 }];
    expect(nearest(list, { x: 0, y: 0 }).id).toBe(3);
    expect(nearest([], { x: 0, y: 0 })).toBeNull();
  });
});

describe('arena.js : mini-arène', () => {
  it('10 zombies de types variés, vie et vitesse de createEnemy (gaits.json, enemies.json, manche 1)', () => {
    const a = createArena(1, cfg);
    expect(a.zombies).toHaveLength(10);
    for (const z of a.zombies) {
      const e = createEnemy(z.type, z.gait, spec, cfg.enemies, cfg.gaits);
      expect(z.speed).toBe(e.speed);
      expect(z.hp).toBe(e.hp);
      expect(z.speed).toBeLessThanOrEqual(cfg.gaits.maxSpeed);
    }
  });
  it('déterministe : même graine et mêmes pas, même état et mêmes événements', () => {
    const a = runArena(createArena(4, cfg), 8, cfg);
    const b = runArena(createArena(4, cfg), 8, cfg);
    expect(b.state).toEqual(a.state);
    expect(b.events).toEqual(a.events);
  });
  it('découper le temps autrement (affichage ×0,5, ×1, ×2) ne change pas les résultats : seuls les pas fixes comptent', () => {
    const one = runArena(createArena(9, cfg), 6, cfg).state;
    let s = createArena(9, cfg);
    for (let i = 0; i < 3; i += 1) s = runArena(s, 2, cfg).state;
    expect(s).toEqual(one);
  });
  it('les zombies avancent vers le joueur aux vitesses du jeu et s\'arrêtent au contact', () => {
    const a = createArena(2, cfg);
    const b = stepArena(a, ARENA_STEP, cfg).state;
    for (const z of b.zombies) {
      const z0 = a.zombies.find((q) => q.id === z.id);
      expect(Math.hypot(z.x, z.y)).toBeLessThan(Math.hypot(z0.x, z0.y));
      expect(Math.hypot(z.x - z0.x, z.y - z0.y)).toBeCloseTo(z.speed * ARENA_STEP, 6);
    }
    const late = runArena(createArena(2, cfg), 4, cfg).state;
    for (const z of late.zombies.filter((q) => q.alive)) expect(Math.hypot(z.x, z.y)).toBeGreaterThanOrEqual(z.radius + cfg.player.radius - 1e-6);
  });
  it('tir au délai et aux dégâts du pistolet : chaque tir touche le plus proche', () => {
    const r = runArena(createArena(3, cfg), 2, cfg);
    const shots = r.events.filter((e) => e.type === 'shot');
    expect(shots.length).toBeGreaterThan(0);
    for (let i = 1; i < shots.length; i += 1) expect(shots[i].time - shots[i - 1].time).toBeGreaterThanOrEqual(cfg.weapon.fireDelay - 1e-9);
    expect(r.events.filter((e) => e.type === 'hit' || e.type === 'kill')).toHaveLength(shots.length);
  });
  it.each([1, 2, 3, 7, 11])('graine %i : tous tués à la fin ; aucun zombie vivant au-delà de la fin ; plus rien ne bouge', (seed) => {
    const r = runArena(createArena(seed, cfg), 60, cfg);
    expect(r.state.done).toBe(true);
    expect(r.state.kills).toBe(10);
    expect(r.state.zombies.every((z) => !z.alive)).toBe(true);
    expect(stepArena(r.state, ARENA_STEP, cfg).state).toBe(r.state);
    expect(r.events.filter((e) => e.type === 'kill')).toHaveLength(10);
  });
  it('kill ⇒ sang et cadavre (blood-fx, niveau complet)', () => {
    const r = runArena(createArena(5, cfg), 60, cfg);
    const parent = new THREE.Group();
    let created = 0;
    const fx = createBloodFx({ parent, cfg: load('blood'), level: '1', lookup, seed: 1, corpse: () => {
      created += 1;
      return { root: new THREE.Group(), setAnim() {} };
    } });
    for (const e of r.events.filter((x) => x.type === 'kill').slice(0, 3)) fx.kill(e);
    fx.update(0.01);
    fx.sync('rdc');
    expect(fx.stats().corpses).toBe(3);
    expect(created).toBe(3);
    expect(fx.stats().particles).toBeGreaterThan(0);
  });
  it('entrées hostiles : graine non numérique, configuration vide, état nul : aucune exception', () => {
    expect(() => runArena(createArena('x', {}), 1, {})).not.toThrow();
    expect(stepArena(null, 1, cfg)).toEqual({ state: null, events: [] });
  });
});
