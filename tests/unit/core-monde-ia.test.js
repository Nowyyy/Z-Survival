import { describe, it, expect } from 'vitest';
import { distanceToRect } from '../../js/core/collision.js';
import { stepEnemies } from '../../js/core/enemy-ai.js';
import { moveCircle } from '../../js/core/movement.js';
import { buildFlow, createFlowState, stepFlow } from '../../js/core/nav.js';
import { createRng, nextFloat } from '../../js/core/rng.js';
import { createSpawner, inflateView, isHidden, stepSpawner } from '../../js/core/spawner.js';
import { deepFreeze, enemies as enemiesCfg, gridOf, layout, navCfg, WEIRD, zombieR } from './helpers/monde.js';

const def = { ...enemiesCfg.zombie, maxPresent: 8, spawnInterval: 2.5 };
const points = layout.spawnPoints;
const view = { minX: 1500, minY: 1200, maxX: 2100, maxY: 1600 };

describe('spawner.js : apparitions hors de la vue', () => {
  it('ne dépasse jamais 8 zombies présents, avec un zombie toutes les 2,5 s', () => {
    let state = createSpawner();
    let rng = createRng(5);
    let present = 0;
    let max = 0;
    const times = [];
    for (let i = 1; i <= 2400; i += 1) {
      const r = stepSpawner(state, 0.05, present, def, points, rng, view);
      state = r.state;
      rng = r.rng;
      if (r.spawn) {
        present += 1;
        times.push(i * 0.05);
      }
      max = Math.max(max, present);
    }
    expect(max).toBe(8);
    expect(Math.abs(times[0] - 2.5)).toBeLessThanOrEqual(0.051); // 50 pas de 0,05 s : l'arrondi flottant peut décaler d'un pas
    expect(Math.abs(times[1] - times[0] - 2.5)).toBeLessThanOrEqual(0.051);
    expect(times).toHaveLength(8);
  });

  it('ne fait apparaître un zombie qu\'à un point hors de la vue agrandie', () => {
    const big = { minX: 1200, minY: 0, maxX: 1800, maxY: 300 }; // vue au nord : cache les points ouest et est
    let state = createSpawner();
    let rng = createRng(9);
    const seen = new Set();
    for (let i = 0; i < 3000; i += 1) {
      const r = stepSpawner(state, 0.05, 0, def, points, rng, big);
      state = r.state;
      rng = r.rng;
      if (r.spawn) {
        expect(isHidden(r.spawn, big, def.viewMargin, def.viewRatio), r.spawn.id).toBe(true);
        seen.add(r.spawn.id);
      }
    }
    expect(seen.size).toBeGreaterThan(1);
    expect(seen.size).toBeLessThan(points.length);
  });

  it('attend si tous les points sont en vue, puis apparaît dès qu\'un point sort de la vue', () => {
    const all = { minX: -5000, minY: -5000, maxX: 9000, maxY: 9000 };
    let state = createSpawner();
    let rng = createRng(1);
    for (let i = 0; i < 200; i += 1) {
      const r = stepSpawner(state, 0.05, 0, def, points, rng, all);
      expect(r.spawn).toBeNull();
      state = r.state;
    }
    expect(state.timer).toBeLessThanOrEqual(def.spawnInterval);
    const r = stepSpawner(state, 0.05, 0, def, points, rng, view);
    expect(r.spawn).not.toBeNull();
  });

  it('agrandit la vue de 150 puis de 25 %', () => {
    expect(inflateView({ minX: 0, minY: 0, maxX: 100, maxY: 100 }, 150, 0.25)).toEqual({ minX: -200, minY: -200, maxX: 300, maxY: 300 });
    expect(isHidden({ x: 290, y: 50 }, { minX: 0, minY: 0, maxX: 100, maxY: 100 }, 150, 0.25)).toBe(false);
    expect(isHidden({ x: 310, y: 50 }, { minX: 0, minY: 0, maxX: 100, maxY: 100 }, 150, 0.25)).toBe(true);
  });

  it('sans vue (lot 1m) : un point au hasard parmi les fenêtres, { x, y } seulement, 5 zombies au plus avec les valeurs du lot 1m', () => {
    const windows = [{ x: 12, y: 450 }, { x: 800, y: 12 }];
    let state = createSpawner();
    let r = { state, spawn: null, rng: createRng(2) };
    for (let i = 0; i < 100 && !r.spawn; i += 1) r = stepSpawner(r.state, 0.05, 0, { spawnInterval: 3, maxPresent: 5 }, windows, r.rng);
    expect(Object.keys(r.spawn).sort()).toEqual(['x', 'y']);
    expect(stepSpawner({ timer: 99 }, 0.05, 5, { spawnInterval: 3, maxPresent: 5 }, windows, r.rng).spawn).toBeNull();
  });

  it('renvoie l\'identifiant du point et sa fenêtre', () => {
    let r = { state: createSpawner(), spawn: null, rng: createRng(4) };
    for (let i = 0; i < 100 && !r.spawn; i += 1) r = stepSpawner(r.state, 0.05, 0, def, points, r.rng, view);
    expect(r.spawn.id).toMatch(/^pa-/);
    expect(r.spawn.fenetre).toMatch(/^fenetre-/);
  });

  it('arguments gelés non modifiés, entrées inattendues sans exception, déterminisme', () => {
    const args = deepFreeze([{ timer: 3 }, 0.05, 0, { ...def }, [...points], createRng(3), { ...view }]);
    expect(stepSpawner(...args)).toEqual(stepSpawner(...args));
    for (const w of WEIRD) {
      expect(() => stepSpawner(w, w, w, w, w, w, w)).not.toThrow();
      expect(typeof isHidden(w, w, w, w)).toBe('boolean');
      expect(() => inflateView(w, w, w)).not.toThrow();
    }
  });
});

describe('enemy-ai.js : zombies qui contournent les meubles', () => {
  const grid = gridOf();
  const walkSim = (zombie, playerAt, seconds, moving = false) => {
    let enemies = [{ id: 1, ...zombie, r: zombieR, health: 50 }];
    let flow = createFlowState();
    let player = { ...playerAt, r: 18 };
    let t = 0;
    const log = [];
    for (let i = 0; i < seconds * 20; i += 1) {
      t += 0.05;
      if (moving) player = { ...player, ...moveCircle(player, { x: Math.cos(t * 0.4), y: Math.sin(t * 0.7) }, 220, 0.05, layout.room, layout.playerObstacles) };
      flow = stepFlow(flow, 0.05, grid, player, navCfg.recompute);
      enemies = stepEnemies(enemies, player, 0.05, def, { obstacles: layout.zombieObstacles, bounds: layout.worldBounds, grid, flow: flow.flow, nav: navCfg });
      const e = enemies[0];
      log.push({ t, x: e.x, y: e.y, touching: Math.hypot(e.x - player.x, e.y - player.y) <= e.r + player.r + 2 });
    }
    return { enemy: enemies[0], player, log };
  };

  it('contourne un meuble placé entre lui et le joueur et finit au contact', () => {
    const { enemy, player } = walkSim({ x: 1800 - 5, y: 1010 }, layout.start, 25);
    expect(Math.hypot(enemy.x - player.x, enemy.y - player.y)).toBeLessThan(enemy.r + player.r + 3);
  });

  it('n\'entre jamais dans un meuble ni dans un mur', () => {
    const { log } = walkSim({ x: 1815, y: 60 }, layout.start, 40);
    for (const p of log) for (const o of layout.zombieObstacles) expect(distanceToRect(p.x, p.y, o), `${o.id} à ${p.t}`).toBeGreaterThanOrEqual(zombieR - 1e-6);
  });

  it('entre par la fenêtre nord : il passe par l\'ouverture, jamais à travers le mur', () => {
    const { log } = walkSim({ x: 1815, y: 60 }, layout.start, 40);
    const crossing = log.filter((p) => p.y > 790 && p.y < 830);
    expect(crossing.length).toBeGreaterThan(0);
    for (const p of crossing) expect(Math.abs(p.x - 1800)).toBeLessThanOrEqual(70);
  });

  it('un zombie qui n\'avance plus (moins de 5 en 2 s) est poussé vers le champ de flux', () => {
    const flow = buildFlow(grid, layout.start);
    const stuck = { id: 1, x: 1800, y: 1000, r: zombieR, stuckT: 1.99, ax: 1800, ay: 1000, push: 0 };
    const [after] = stepEnemies([stuck], { x: 1800, y: 1400, r: 18 }, 0.05, def, { obstacles: layout.zombieObstacles, bounds: layout.worldBounds, grid, flow, nav: navCfg });
    expect(after.push).toBe(navCfg.pushTime);
    expect(after.stuckT).toBe(0);
    const [moving] = stepEnemies([{ ...stuck, ax: 1700 }], { x: 1800, y: 1400, r: 18 }, 0.05, def, { obstacles: layout.zombieObstacles, bounds: layout.worldBounds, grid, flow, nav: navCfg });
    expect(moving.push).toBe(0);
  });

  it('sans monde, le comportement du lot 1m est inchangé (aucun champ ajouté, poursuite en ligne droite)', () => {
    const [e] = stepEnemies([{ id: 1, x: 0, y: 0, r: 20 }], { x: 100, y: 0, r: 18 }, 0.05, { speed: 70 });
    expect(e).toEqual({ id: 1, x: 3.5, y: 0, r: 20 });
  });

  it('aucun zombie bloqué plus de 2 s en 60 s de simulation, depuis chacun des 12 points d\'apparition (graines fixes, joueur immobile)', () => {
    points.forEach((p, k) => {
      let rng = createRng(100 + k);
      const pick = () => {
        for (;;) {
          const a = nextFloat(rng);
          const b = nextFloat(a.rng);
          rng = b.rng;
          const pos = { x: layout.bounds.minX + 60 + a.value * (layout.bounds.maxX - layout.bounds.minX - 120), y: layout.bounds.minY + 60 + b.value * (layout.bounds.maxY - layout.bounds.minY - 120) };
          if (layout.furniture.every((o) => distanceToRect(pos.x, pos.y, o) > 60)) return pos;
        }
      };
      const { log } = walkSim({ x: p.x, y: p.y }, pick(), 60);
      for (let i = 40; i < log.length; i += 1) {
        const free = log.slice(i - 40, i + 1).every((q) => !q.touching);
        if (free) expect(Math.hypot(log[i].x - log[i - 40].x, log[i].y - log[i - 40].y), `${p.id} à ${log[i].t.toFixed(1)} s`).toBeGreaterThanOrEqual(5);
      }
      expect(log.at(-1).touching, `${p.id} atteint le joueur`).toBe(true);
    });
  });

  it('même chose face à un joueur qui se déplace', () => {
    for (const p of [points[0], points[5], points[10]]) {
      const { log } = walkSim({ x: p.x, y: p.y }, layout.start, 60, true);
      for (let i = 40; i < log.length; i += 1) {
        if (log.slice(i - 40, i + 1).every((q) => !q.touching)) expect(Math.hypot(log[i].x - log[i - 40].x, log[i].y - log[i - 40].y), `${p.id} à ${log[i].t.toFixed(1)} s`).toBeGreaterThanOrEqual(5);
      }
    }
  });

  it('arguments gelés non modifiés, entrées inattendues sans exception, déterminisme', () => {
    const list = deepFreeze([{ id: 1, x: 1800, y: 1000, r: 20 }]);
    const flow = buildFlow(grid, layout.start);
    const w = deepFreeze({ obstacles: layout.zombieObstacles, bounds: layout.worldBounds, grid, flow, nav: navCfg });
    expect(stepEnemies(list, { x: 1800, y: 1400, r: 18 }, 0.05, def, w)).toEqual(stepEnemies(list, { x: 1800, y: 1400, r: 18 }, 0.05, def, w));
    for (const v of WEIRD) expect(() => stepEnemies(v, v, v, v, v)).not.toThrow();
    for (const v of WEIRD) expect(() => stepEnemies([{ id: 1, x: 5, y: 5, r: 20 }], { x: 9, y: 9 }, 0.05, def, { obstacles: v, bounds: v, grid: v, flow: v, nav: v })).not.toThrow();
  });
});
