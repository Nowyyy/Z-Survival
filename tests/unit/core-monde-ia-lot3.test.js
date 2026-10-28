import { describe, it, expect } from 'vitest';
import { stepEnemies } from '../../js/core/enemy-ai.js';
import { createEnemy } from '../../js/core/enemy-factory.js';
import { buildWindowField, createGrid, INF, pathLength } from '../../js/core/nav.js';
import { windowGaps, windowsWithGaps } from '../../js/core/layout.js';
import { stepDirector, createDirector } from '../../js/core/wave-director.js';
import { waveSpec } from '../../js/core/waves.js';
import { deepFreeze, enemies, layout, navCfg, WEIRD, zombieR } from './helpers/monde.js';
import { closedGrid, fields, openGrid, realWorld, runReal } from './helpers/sim-ia.js';
import { geoms, makeZombie, wavesCfg } from './helpers/sim-siege.js';

const N = geoms.find((g) => g.id === 'fenetre-nord');
const cellOf = (grid, p) => Math.floor(p.y / grid.cell) * grid.cols + Math.floor(p.x / grid.cell);

describe('layout.js (lot 3) : ouvertures des fenêtres', () => {
  it('trois ouvertures qui recouvrent exactement les trous des murs', () => {
    expect(layout.gaps.map((g) => g.id)).toEqual(['fenetre-nord', 'fenetre-ouest', 'fenetre-est']);
    expect(layout.gaps[0]).toEqual({ id: 'fenetre-nord', x: 1730, y: 784, w: 140, h: 40 });
  });

  it('chaque ouverture touche les deux morceaux de mur voisins (le mur est continu une fois les planches posées)', () => {
    for (const g of layout.gaps) {
      const touching = layout.walls.filter((w) => w.x <= g.x + g.w + 1e-9 && w.x + w.w >= g.x - 1e-9 && w.y <= g.y + g.h + 1e-9 && w.y + w.h >= g.y - 1e-9);
      expect(touching.length, g.id).toBeGreaterThanOrEqual(2);
    }
  });

  it('salle du lot 1m (?empty) : aucune ouverture ; windowsWithGaps associe chaque fenêtre à la sienne', () => {
    expect(layout.gaps.length).toBe(3);
    expect(windowsWithGaps(layout).every((w) => w.gap?.w > 0)).toBe(true);
    expect(windowGaps(null, null, 0, 0)).toEqual([]);
  });
});

describe('nav.js (lot 3) : champs de flux des fenêtres', () => {
  it.each(geoms.map((g) => [g.id, g]))('%s : le champ part de entryOuter et couvre toute la zone extérieure', (id, g) => {
    const f = fields[id];
    expect(f.reachable).toBeGreaterThan(10000);
    expect(f.flow.dist[cellOf(closedGrid, g.entryOuter)]).toBe(0);
  });

  it('la salle n\'est pas atteignable depuis l\'extérieur : murs fermés, ouvertures bloquées', () => {
    for (const g of geoms) {
      expect(fields[g.id].flow.dist[cellOf(closedGrid, layout.start)]).toBe(INF);
      expect(fields[g.id].flow.dist[cellOf(closedGrid, g.entryInner)]).toBe(INF);
    }
  });

  it('les cellules d\'une fenêtre fermée sont bloquées pour les zombies ; la grille du joueur (ouvertures libres) est inchangée', () => {
    for (const g of layout.gaps) {
      const c = { x: g.x + g.w / 2, y: g.y + g.h / 2 };
      expect(closedGrid.blocked[cellOf(closedGrid, c)], g.id).toBe(1);
      expect(openGrid.blocked[cellOf(openGrid, c)], g.id).toBe(0);
    }
  });

  it('les obstacles du décor (gonflés) sont contournés : aucune place d\'attaque ni de file dans une cellule bloquée', () => {
    for (const g of geoms) for (const p of [...g.slots, ...g.queue, g.entryOuter]) expect(closedGrid.blocked[cellOf(closedGrid, p)], g.id).toBe(0);
  });

  it.each(layout.spawnPoints.map((p) => [p.id, p]))('point d\'apparition %s : chemin jusqu\'à entryOuter de sa fenêtre d\'au plus 900', (_id, p) => {
    const len = pathLength(closedGrid, fields[p.fenetre].flow, p);
    expect(len).toBeGreaterThan(0);
    expect(len).toBeLessThanOrEqual(900);
  });

  it('temps de calcul des trois champs de fenêtre en Node (rapporté ; seuil large 400 ms)', () => {
    const t0 = performance.now();
    const grid = createGrid(layout.size, [...layout.zombieObstacles, ...layout.gaps], { cell: navCfg.cell, radius: zombieR, inflate: navCfg.inflate });
    for (const g of geoms) buildWindowField({ grid }, g);
    const ms = performance.now() - t0;
    console.info(`champs de fenêtre en Node : ${ms.toFixed(1)} ms (grille + 3 champs)`);
    expect(ms).toBeLessThan(400);
  });

  it('buildWindowField sans grille ou sans géométrie : champ vide, aucune exception', () => {
    for (const a of WEIRD) for (const b of WEIRD) expect(() => buildWindowField(a, b)).not.toThrow();
    expect(buildWindowField({}, N).flow).toBeNull();
  });
});

describe('enemy-ai.js (lot 3) : exécution des intentions du siège', () => {
  it('un zombie parti d\'un point d\'apparition arrive à son emplacement et y reste (aucun blocage)', () => {
    const p = layout.spawnPoints.find((x) => x.id === 'pa-nord-4');
    const z = makeZombie(1, 'fenetre-nord', 'marcheur', 'marche', { x: p.x, y: p.y });
    const r = runReal({ zombies: [z], seconds: 16 });
    const out = r.zombies[0];
    expect(out.mode).toBe('arrache');
    expect(Math.hypot(out.x - N.slots[out.slot].x, out.y - N.slots[out.slot].y)).toBeLessThan(4);
    expect(r.maxStill).toBeLessThanOrEqual(2);
  });

  it('un zombie en attente va à sa place de file puis s\'y arrête', () => {
    const zs = [1, 2, 3].map((i) => makeZombie(i, 'fenetre-nord', 'marcheur', 'marche', { x: N.entryOuter.x - 15 + i * 15, y: N.entryOuter.y - 200 - i * 10 }));
    const r = runReal({ zombies: zs, seconds: 5 });
    const waiting = r.zombies.find((z) => z.mode === 'attente');
    expect(waiting).toBeDefined();
    expect(Math.hypot(waiting.x - N.queue[0].x, waiting.y - N.queue[0].y)).toBeLessThan(4);
  });

  it('l\'escalade traverse la fenêtre en ligne droite, sans collision (même avec le mur), en climbTime', () => {
    const z = makeZombie(1, 'fenetre-nord', 'marcheur', 'marche', { x: N.entryOuter.x, y: N.entryOuter.y - 20 });
    let crossed = 0;
    const r = runReal({ zombies: [z], planks: 0, seconds: 8, onStep: (s) => { if (s.zombies[0].mode === 'escalade' && s.zombies[0].climb.t > 0) crossed += 1; } });
    expect(r.zombies[0].mode).toBe('dedans');
    expect(r.zombies[0].y).toBeGreaterThan(N.center.y);
    expect(crossed).toBeGreaterThanOrEqual(22);
    expect(crossed).toBeLessThanOrEqual(26);
  });

  it('hold : le zombie ne bouge pas', () => {
    const z = { ...makeZombie(1, 'fenetre-nord'), hold: true, target: N.entryOuter };
    const out = stepEnemies([z], { x: 0, y: 0, r: 18 }, 0.05, { speed: 70 }, realWorld({ windows: { windows: {} } }));
    expect(out[0].x).toBe(z.x);
    expect(out[0].y).toBe(z.y);
  });

  it('arrache : reste à son emplacement même poussé par la séparation de voisins superposés', () => {
    const a = { ...makeZombie(1, 'fenetre-nord', 'marcheur', 'marche', N.slots[0]), mode: 'arrache', slot: 0, target: N.slots[0] };
    const b = { ...makeZombie(2, 'fenetre-nord', 'marcheur', 'marche', { x: N.slots[0].x + 5, y: N.slots[0].y }), mode: 'arrache', slot: 1, target: N.slots[0] };
    const out = stepEnemies([a, b], { x: 0, y: 0, r: 18 }, 0.05, { speed: 70 }, realWorld({ windows: { windows: {} } }));
    expect(out[0].x).toBe(a.x);
    expect(out[0].y).toBe(a.y);
  });

  it('libre et dedans : même mouvement qu\'avant le lot 3 (poursuite directe)', () => {
    const base = { id: 1, x: 1500, y: 1500, r: 20, speed: 70 };
    const player = { x: 1600, y: 1500, r: 18 };
    const w = realWorld({ windows: { windows: {} } });
    const a = stepEnemies([base], player, 0.05, { speed: 70 }, w)[0];
    expect(stepEnemies([{ ...base, mode: 'libre' }], player, 0.05, { speed: 70 }, w)[0]).toMatchObject({ x: a.x, y: a.y });
    expect(stepEnemies([{ ...base, mode: 'dedans' }], player, 0.05, { speed: 70 }, w)[0]).toMatchObject({ x: a.x, y: a.y });
    expect(a.x).toBeCloseTo(1503.5, 6);
  });

  it('6 zombies sur une même fenêtre : 2 arrachent, la file reste ordonnée, aucun blocage de plus de 2 s', () => {
    const zs = Array.from({ length: 6 }, (_, i) => makeZombie(i + 1, 'fenetre-nord', 'marcheur', 'marche', { x: N.entryOuter.x + (i % 2 ? 25 : -25), y: N.entryOuter.y - 300 - i * 45 }));
    let queueOrderOk = true;
    const r = runReal({ zombies: zs, seconds: 30, onStep: (s) => {
      const q = s.zombies.filter((z) => z.mode === 'attente').sort((a, b) => a.qi - b.qi);
      for (let k = 1; k < q.length; k += 1) if (q[k].ord < q[k - 1].ord) queueOrderOk = false;
    } });
    expect(r.zombies.filter((z) => z.mode === 'arrache').length).toBeLessThanOrEqual(2);
    expect(queueOrderOk).toBe(true);
    expect(r.maxStill, JSON.stringify(r.stillWhere)).toBeLessThanOrEqual(2);
  });

  it('un zombie de chaque type entre par la fenêtre ouverte puis poursuit le joueur (aucun blocage)', () => {
    const zs = ['marcheur', 'petit', 'voute', 'grand'].map((t, i) => makeZombie(i + 1, 'fenetre-est', t, 'marche', { x: 3300 + i * 20, y: 1380 + i * 15 }));
    const r = runReal({ zombies: zs, planks: 0, seconds: 40 });
    expect(r.zombies.every((z) => z.mode === 'dedans')).toBe(true);
    expect(r.zombies.every((z) => z.x < 2800)).toBe(true);
    expect(r.maxStill).toBeLessThanOrEqual(2);
  });

  it('aucune entrée hostile ne fait lever d\'exception', () => {
    for (const a of WEIRD) for (const b of WEIRD) {
      expect(() => stepEnemies([{ id: 1, x: 1, y: 1, r: 20, mode: 'approche', window: a, target: b, climb: a }], b, a, b, { obstacles: [], windows: a })).not.toThrow();
      expect(() => stepEnemies([{ id: 1, x: 1, y: 1, r: 20, mode: 'escalade', climb: { from: a, to: b, t: a } }], b, 0.05, b, { obstacles: [] })).not.toThrow();
    }
  });
});

describe('wave-director.js et enemy-factory.js (lot 3)', () => {
  const ask = (siege) => {
    let d = createDirector(wavesCfg, { seed: 3 });
    const reqs = [];
    for (let i = 0; i < 400 && reqs.length < 4; i += 1) {
      const out = stepDirector(d, { dt: 0.05, alive: 0, view: null, points: layout.spawnPoints, siege });
      d = out.state;
      reqs.push(...out.requests);
    }
    return reqs;
  };

  it('chaque zombie créé reçoit la fenêtre du point d\'apparition et le mode approche', () => {
    const reqs = ask(true);
    expect(reqs.length).toBeGreaterThanOrEqual(3);
    for (const r of reqs) {
      expect(r.mode).toBe('approche');
      expect(r.window).toBe(layout.spawnPoints.find((p) => p.id === r.pointId).fenetre);
    }
  });

  it('siège désactivé (?empty=1) : mode libre', () => {
    expect(ask(false).every((r) => r.mode === 'libre')).toBe(true);
  });

  it('sans option siege, comme avant : approche', () => {
    expect(ask(undefined).every((r) => r.mode === 'approche')).toBe(true);
  });

  it.each(['marcheur', 'petit', 'voute', 'grand'])('createEnemy(%s) porte son tearMul', (type) => {
    expect(createEnemy(type, 'marche', waveSpec(1, wavesCfg), enemies, { gaits: { marche: { speed: 70 } } }).tearMul).toBe(enemies.variants[type].tearMul);
  });

  it('createEnemy : tearMul de repli à 1', () => {
    expect(createEnemy('marcheur', 'marche', {}, { zombie: {}, variants: {} }, {}).tearMul).toBe(1);
  });

  it('l\'état n\'est pas modifié par stepDirector (arguments gelés)', () => {
    const d = deepFreeze(createDirector(wavesCfg, { seed: 1 }));
    expect(() => stepDirector(d, { dt: 0.05, alive: 0, points: deepFreeze([...layout.spawnPoints]), siege: true })).not.toThrow();
  });
});
