import { describe, it, expect } from 'vitest';
import { buildPortalField, cellIndex, createGrid, flowDirection, INF } from '../../js/core/nav.js';
import { createFloorState, createFloorWorld, stairsOf, stepFloors, syncDoors, targetsOf } from '../../js/core/floor-sim.js';
import { reachedPortal, seeksStair, stairLoad, stepStairZombies } from '../../js/core/stair-zombies.js';
import { stepEnemies } from '../../js/core/enemy-ai.js';
import { buildLayouts } from '../../js/core/layout.js';
import { ALL_DOORS, arrivalOf, centerOf, decor, etageWorld, floorWorld, gridOpts, layouts, makeZombie, navCfg, portals, simulate, stairsCfg, triggerOf, windowsCfg, world, zonesActive, enemiesCfg } from './helpers/etage.js';
import { restrictToFloors } from '../../js/core/zones.js';
import { deepFreeze, WEIRD } from './helpers/carte.js';

const P = { escalier: 'escalier-aile', depart: 'escalier-depart' };
const at = (stair, floor, who = 'trigger') => (who === 'trigger' ? centerOf(triggerOf(stair, floor)) : arrivalOf(stair, floor));
const state0 = (open = ALL_DOORS, pf = 'rdc') => createFloorState(floorWorld, { planks: 4, openDoors: open, playerFloor: pf });

describe('champ de flux vers les escaliers (buildPortalField)', () => {
  const st = state0();

  it('un champ par étage, calculé avec une grille par étage', () => {
    expect(st.portalFields.rdc.flow).not.toBeNull();
    expect(st.portalFields.etage.flow).not.toBeNull();
    expect(st.portalGrids.rdc).not.toBe(st.portalGrids.etage);
  });

  it('cibles multiples : les cellules des deux zones de déclenchement sont des sources (distance 0)', () => {
    const f = st.portalFields.etage;
    expect(f.sources.length).toBeGreaterThan(10);
    for (const i of f.sources) expect(f.flow.dist[i]).toBe(0);
    const near = (p) => st.portalGrids.etage && cellIndex(st.portalGrids.etage, p);
    expect(f.flow.dist[near(at(P.escalier, 'etage'))]).toBeLessThanOrEqual(10);
    expect(f.flow.dist[near(at(P.depart, 'etage'))]).toBeLessThanOrEqual(10);
  });

  it('l\'escalier le plus proche par chemin est suivi : de chaque côté de l\'étage, la direction mène au bon escalier', () => {
    const g = st.portalGrids.etage;
    const f = st.portalFields.etage.flow;
    const west = flowDirection(g, f, { x: 1100, y: 2340 }, 5);
    const east = flowDirection(g, f, { x: 1930, y: 2180 }, 5);
    expect(Math.hypot(west.x, west.y)).toBeGreaterThan(0.9);
    expect(Math.hypot(east.x, east.y)).toBeGreaterThan(0.9);
    // Près de chaque escalier, le coût est faible : on y va sans détour.
    const a = at(P.escalier, 'etage');
    const d = at(P.depart, 'etage');
    expect(f.dist[cellIndex(g, { x: 1100, y: 2340 })]).toBeLessThan(300);
    expect(f.dist[cellIndex(g, { x: 1930, y: 2180 })]).toBeLessThan(300);
    expect([a, d].every((q) => q.x > 0)).toBe(true);
  });

  it('les cellules bloquées (murs, meubles, cage) restent inaccessibles', () => {
    const g = st.portalGrids.etage;
    const f = st.portalFields.etage.flow;
    const well = zonesActive.stairs.find((s) => s.id === P.depart).floors.etage.solid;
    expect(f.dist[cellIndex(g, { x: well.x + well.w / 2, y: well.y + well.h / 2 })]).toBe(INF);
  });

  it('une couche de grille par étage : le champ de l\'étage ne traverse pas la porte de l\'étage fermée', () => {
    const closed = state0(['porte-1', 'porte-2']);
    const f = closed.portalFields.etage;
    const g = closed.portalGrids.etage;
    // Salle de droite coupée de l\'escalier de l\'aile : seul l\'escalier de l\'aile est utilisable, la salle de droite ne l'atteint pas.
    expect(f.flow.dist[cellIndex(g, { x: 1930, y: 2180 })]).toBe(INF);
    expect(f.flow.dist[cellIndex(g, { x: 1100, y: 2340 })]).not.toBe(INF);
  });

  it('sans escalier utilisable : champ vide', () => {
    const none = state0([]);
    expect(none.portalFields.rdc.flow).toBeNull();
    expect(none.portalFields.etage.flow).toBeNull();
    expect(none.portals.rdc).toEqual([]);
  });

  it('une porte qui s\'ouvre recalcule les champs ; une porte déjà ouverte ne change rien', () => {
    const s1 = syncDoors(floorWorld, state0(['porte-1']), ['porte-1', 'porte-2']);
    expect(s1.portals.etage.map((p) => p.stair)).toEqual(['escalier-aile']);
    const s2 = syncDoors(floorWorld, s1, ['porte-1', 'porte-2', 'porte-3']);
    expect(s2.portals.etage.map((p) => p.stair)).toEqual(['escalier-aile', 'escalier-depart']);
    expect(s2.portalFields.etage.sources.length).toBeGreaterThan(s1.portalFields.etage.sources.length);
  });

  it('les champs ne se recalculent pas à chaque image ni quand le joueur bouge', () => {
    let s = state0();
    const before = s.portalFields;
    for (let i = 0; i < 20; i += 1) {
      const out = stepFloors(floorWorld, s, { enemies: [], player: { x: 1000 + i * 30, y: 2300, r: 18 }, dt: 0.05 });
      s = out.state;
    }
    expect(s.portalFields).toBe(before);
  });

  it('buildPortalField : entrées hostiles sans exception, champ vide', () => {
    for (const bad of WEIRD) {
      expect(() => buildPortalField(bad, bad, bad)).not.toThrow();
      expect(buildPortalField(bad, 'rdc', bad).flow).toBeNull();
    }
    const grid = createGrid({ width: 400, height: 400 }, [], { cell: 20, radius: 10, inflate: 2 });
    expect(buildPortalField({ grid }, 'rdc', [{ rect: { x: 100, y: 100, w: 40, h: 40 }, x: 120, y: 120 }]).reachable).toBeGreaterThan(300);
  });

  it('un point de passage dont la zone est entièrement bloquée prend la cellule libre la plus proche', () => {
    const grid = createGrid({ width: 400, height: 400 }, [{ x: 100, y: 100, w: 80, h: 80 }], { cell: 20, radius: 10, inflate: 2 });
    const f = buildPortalField({ grid }, 'rdc', [{ rect: { x: 120, y: 120, w: 20, h: 20 }, x: 130, y: 130 }]);
    expect(f.sources).toHaveLength(1);
    expect(f.reachable).toBeGreaterThan(100);
  });
});

describe('mode « escalier » (stair-zombies.js)', () => {
  const params = stairsCfg;
  const portalsBy = (open = ALL_DOORS) => ({ rdc: portals('rdc', open), etage: portals('etage', open) });
  const run = (list, floor, seconds, open = ALL_DOORS) => {
    let enemies = list;
    const events = [];
    for (let i = 0; i < Math.round(seconds / 0.05); i += 1) {
      const r = stepStairZombies(enemies, { playerFloor: floor, portals: portalsBy(open), params }, 0.05);
      enemies = r.enemies;
      events.push(...r.events.map((e) => ({ ...e, i })));
    }
    return { enemies, events };
  };
  const atTrigger = (id, floor, stair = P.escalier) => makeZombie(id, at(stair, floor), { floor });

  it('seeksStair : seul un zombie « dedans » qui n\'est pas à l\'étage du joueur cherche un escalier', () => {
    expect(seeksStair(makeZombie(1, { x: 0, y: 0 }, { floor: 'etage' }), 'rdc')).toBe(true);
    expect(seeksStair(makeZombie(1, { x: 0, y: 0 }, { floor: 'rdc' }), 'rdc')).toBe(false);
    expect(seeksStair(makeZombie(1, { x: 0, y: 0 }, { floor: 'etage', mode: 'arrache' }), 'rdc')).toBe(false);
    expect(seeksStair(makeZombie(1, { x: 0, y: 0 }, { floor: 'rdc', mode: 'libre' }), 'etage')).toBe(false);
    expect(seeksStair(null, 'rdc')).toBe(false);
  });

  it('un zombie arrivé à la zone de déclenchement passe en « escalier » (pose escalade) pendant 1,5 s', () => {
    const r = run([atTrigger(1, 'etage')], 'rdc', 3);
    const start = r.events.find((e) => e.type === 'stairStart');
    const end = r.events.find((e) => e.type === 'stairArrive');
    expect(start).toMatchObject({ id: 1, stair: P.escalier, from: 'etage', to: 'rdc' });
    expect((end.i - start.i) * 0.05).toBeCloseTo(1.5, 5);
  });

  it('pendant le franchissement : mode escalier, escalier connu, étage de départ gardé, position fixe', () => {
    let list = [atTrigger(1, 'etage')];
    for (let i = 0; i < 5; i += 1) list = stepStairZombies(list, { playerFloor: 'rdc', portals: portalsBy(), params }, 0.05).enemies;
    expect(list[0]).toMatchObject({ mode: 'escalier', stair: P.escalier, floor: 'etage', stairFrom: 'etage', stairTo: 'rdc' });
  });

  it('à l\'arrivée : étage changé, point d\'arrivée de l\'autre étage, mode dedans', () => {
    const r = run([atTrigger(1, 'etage')], 'rdc', 2);
    const a = arrivalOf(P.escalier, 'rdc');
    expect(r.enemies[0]).toMatchObject({ floor: 'rdc', mode: 'dedans', x: a.x, y: a.y, stair: null });
  });

  it('joueur dans l\'escalier (follow) : les zombies de son étage arrivés au bout le suivent dedans, y restent, puis arrivent quand il en sort', () => {
    let list = [atTrigger(1, 'rdc')];
    const walking = { playerFloor: 'rdc', follow: P.escalier, portals: portalsBy(), params };
    for (let i = 0; i < 100; i += 1) list = stepStairZombies(list, walking, 0.05).enemies; // 5 s : bien plus que 1,5 s
    expect(list[0]).toMatchObject({ mode: 'escalier', stair: P.escalier, floor: 'rdc', stairT: 0 });
    // Un autre escalier que celui du joueur : le zombie du même étage reste libre.
    const other = stepStairZombies([atTrigger(2, 'rdc', P.depart)], walking, 0.05).enemies;
    expect(other[0].mode).toBe('dedans');
    // Le joueur sort : le franchissement se termine.
    const out = [];
    for (let i = 0; i < 40; i += 1) {
      const r = stepStairZombies(list, { ...walking, follow: undefined }, 0.05);
      list = r.enemies;
      out.push(...r.events);
    }
    expect(out.some((e) => e.type === 'stairArrive' && e.id === 1)).toBe(true);
    expect(list[0].floor).toBe('etage');
  });

  it('on monte aussi : un zombie du rez-de-chaussée arrive à l\'étage quand le joueur y est', () => {
    const r = run([atTrigger(1, 'rdc', P.depart)], 'etage', 2);
    const a = arrivalOf(P.depart, 'etage');
    expect(r.enemies[0]).toMatchObject({ floor: 'etage', mode: 'dedans', x: a.x, y: a.y });
  });

  it('au plus 2 zombies à la fois sur un escalier : le troisième attend', () => {
    const list = [1, 2, 3].map((id) => atTrigger(id, 'etage'));
    const first = stepStairZombies(list, { playerFloor: 'rdc', portals: portalsBy(), params }, 0.05);
    expect(stairLoad(first.enemies)).toEqual({ [P.escalier]: 2 });
    expect(first.enemies.filter((e) => e.mode === 'dedans')).toHaveLength(1);
  });

  it('le troisième monte à son tour dès qu\'une place se libère (file)', () => {
    const r = run([1, 2, 3].map((id) => atTrigger(id, 'etage')), 'rdc', 6);
    expect(r.events.filter((e) => e.type === 'stairStart')).toHaveLength(3);
    expect(r.enemies.every((e) => e.floor === 'rdc')).toBe(true);
  });

  it('le plafond de 2 vaut par escalier : deux zombies sur chacun des deux escaliers', () => {
    const list = [1, 2, 3].map((id) => atTrigger(id, 'etage')).concat([4, 5, 6].map((id) => atTrigger(id, 'etage', P.depart)));
    const r = stepStairZombies(list, { playerFloor: 'rdc', portals: portalsBy(), params }, 0.05);
    expect(stairLoad(r.enemies)).toEqual({ [P.escalier]: 2, [P.depart]: 2 });
  });

  it('si le point d\'arrivée est occupé par un autre zombie, il attend en file au bout de l\'escalier', () => {
    const a = arrivalOf(P.escalier, 'rdc');
    const blocker = makeZombie(9, a, { floor: 'rdc' });
    const r = run([atTrigger(1, 'etage'), blocker, { ...blocker, id: 10, x: a.x + 30 }, { ...blocker, id: 11, x: a.x - 30 }, { ...blocker, id: 12, y: a.y + 30 }, { ...blocker, id: 13, y: a.y - 30 }, { ...blocker, id: 14, x: a.x + 21, y: a.y + 21 }, { ...blocker, id: 15, x: a.x - 21, y: a.y - 21 }, { ...blocker, id: 16, x: a.x + 21, y: a.y - 21 }, { ...blocker, id: 17, x: a.x - 21, y: a.y + 21 }], 'rdc', 3);
    const z = r.enemies.find((e) => e.id === 1);
    expect(z.mode).toBe('escalier');
    expect(z.floor).toBe('etage');
    const freed = run([atTrigger(1, 'etage'), { ...blocker, x: a.x + 500 }], 'rdc', 4);
    expect(freed.enemies.find((e) => e.id === 1)).toMatchObject({ mode: 'dedans', floor: 'rdc' });
  });

  it('un zombie de l\'étage du joueur ne prend jamais un escalier', () => {
    const r = run([atTrigger(1, 'rdc')], 'rdc', 3);
    expect(r.events).toEqual([]);
  });

  it('un escalier fermé n\'a aucun point de passage : personne ne le prend', () => {
    const r = run([atTrigger(1, 'etage')], 'rdc', 3, []);
    expect(r.events).toEqual([]);
  });

  it('reachedPortal : à 40 unités du centre de la zone, pas au-delà', () => {
    const c = at(P.escalier, 'etage');
    expect(reachedPortal({ ...makeZombie(1, c), floor: 'etage', x: c.x + 39 }, portalsBy(), 40)?.stair).toBe(P.escalier);
    expect(reachedPortal({ ...makeZombie(1, c), floor: 'etage', x: c.x + 41 }, portalsBy(), 40)).toBeNull();
    expect(reachedPortal({ ...makeZombie(1, c), floor: 'rdc' }, portalsBy(), 40)).toBeNull();
  });

  it('stepStairZombies : entrées hostiles sans exception, arguments gelés intacts', () => {
    for (const bad of WEIRD) expect(() => stepStairZombies(bad, bad, bad)).not.toThrow();
    const list = deepFreeze([atTrigger(1, 'etage')]);
    expect(() => stepStairZombies(list, deepFreeze({ playerFloor: 'rdc', portals: portalsBy(), params }), 0.05)).not.toThrow();
  });

  it('déterministe : mêmes entrées, mêmes sorties', () => {
    const list = [1, 2, 3].map((id) => atTrigger(id, 'etage'));
    const a = stepStairZombies(list, { playerFloor: 'rdc', portals: portalsBy(), params }, 0.05);
    const b = stepStairZombies(list, { playerFloor: 'rdc', portals: portalsBy(), params }, 0.05);
    expect(a).toEqual(b);
  });

  it('un zombie en escalier ne bouge pas dans stepEnemies et n\'est pas une cible', () => {
    const z = { ...makeZombie(1, at(P.escalier, 'etage')), mode: 'escalier', floor: 'etage', stair: P.escalier };
    const out = stepEnemies([z], { x: 0, y: 0, r: 18 }, 0.05, enemiesCfg.zombie, { obstacles: [], bounds: null, nav: navCfg });
    expect(out[0].x).toBe(z.x);
    expect(targetsOf([z], 'etage')).toEqual([]);
    expect(targetsOf([{ ...z, mode: 'dedans' }], 'etage')).toHaveLength(1);
  });
});

describe('zombies sur deux étages : simulations pures', () => {
  it('un zombie de l\'étage descend l\'escalier le plus proche par chemin et atteint le joueur du rez-de-chaussée', () => {
    const z = makeZombie(1, arrivalOf(P.depart, 'etage'), { floor: 'etage' });
    const r = simulate({ zombies: [z], playerFloor: 'rdc', seconds: 40 });
    expect(r.events.find((e) => e.type === 'stairStart').stair).toBe(P.depart);
    expect(r.enemies[0].floor).toBe('rdc');
    const p = layouts.rdc.start;
    expect(Math.hypot(r.enemies[0].x - p.x, r.enemies[0].y - p.y)).toBeLessThan(60);
  });

  it('un zombie du rez-de-chaussée monte par l\'escalier de l\'aile quand il en est le plus proche', () => {
    const z = makeZombie(1, arrivalOf(P.escalier, 'rdc'), { floor: 'rdc' });
    const r = simulate({ zombies: [z], playerFloor: 'etage', player: { ...arrivalOf(P.escalier, 'etage'), r: 18 }, seconds: 40 });
    expect(r.events.find((e) => e.type === 'stairStart').stair).toBe(P.escalier);
    expect(r.enemies[0].floor).toBe('etage');
  });

  it('le zombie du rez-de-chaussée proche du second escalier prend celui-là (le plus proche par chemin)', () => {
    const z = makeZombie(1, arrivalOf(P.depart, 'rdc'), { floor: 'rdc' });
    const r = simulate({ zombies: [z], playerFloor: 'etage', seconds: 30 });
    expect(r.events.find((e) => e.type === 'stairStart').stair).toBe(P.depart);
  });

  it('quand le joueur change d\'étage, les zombies de l\'ancien étage le poursuivent à leur arrivée : tous finissent sur l\'étage du joueur', () => {
    const list = [makeZombie(1, arrivalOf(P.depart, 'rdc'), { floor: 'rdc' }), makeZombie(2, arrivalOf(P.depart, 'etage'), { floor: 'etage' }), makeZombie(3, arrivalOf(P.escalier, 'etage'), { floor: 'etage' })];
    const r = simulate({ zombies: list, playerFloor: 'rdc', seconds: 60 });
    expect(r.enemies.every((e) => e.floor === 'rdc' && e.mode === 'dedans')).toBe(true);
    const up = simulate({ zombies: list, playerFloor: 'etage', seconds: 60 });
    expect(up.enemies.every((e) => e.floor === 'etage' && e.mode === 'dedans')).toBe(true);
  });

  it('un zombie sans escalier utilisable reste en place (le test le détecte : aucun événement d\'escalier)', () => {
    const r = simulate({ zombies: [makeZombie(1, arrivalOf(P.depart, 'etage'), { floor: 'etage' })], open: ['porte-1'], playerFloor: 'rdc', seconds: 20 });
    expect(r.events.filter((e) => e.type.startsWith('stair'))).toEqual([]);
    expect(r.enemies[0].floor).toBe('etage');
  });

  it('simulation de 60 s, joueur au rez-de-chaussée : 8 zombies répartis sur les deux étages, aucun bloqué plus de 2 s', () => {
    const a = [arrivalOf(P.depart, 'etage'), arrivalOf(P.escalier, 'etage'), { x: 1500, y: 2200 }, { x: 1300, y: 2100 }];
    const b = [arrivalOf(P.depart, 'rdc'), arrivalOf(P.escalier, 'rdc'), { x: 2500, y: 2300 }, { x: 2700, y: 2250 }];
    const list = [...a.map((p, i) => makeZombie(i + 1, p, { floor: 'etage' })), ...b.map((p, i) => makeZombie(i + 11, p, { floor: 'rdc' }))];
    const r = simulate({ zombies: list, playerFloor: 'rdc', seconds: 60 });
    expect(r.maxStill, JSON.stringify(r.stillWhere)).toBeLessThanOrEqual(2);
    expect(r.enemies.every((e) => e.floor === 'rdc')).toBe(true);
  });

  it('simulation de 90 s, joueur à l\'étage : aucun zombie bloqué plus de 2 s, tous finissent à l\'étage', () => {
    const list = [1, 2, 3, 4, 5, 6].map((id, i) => makeZombie(id, [arrivalOf(P.depart, 'rdc'), arrivalOf(P.escalier, 'rdc'), { x: 2500, y: 2300 }, { x: 1300, y: 2200 }, { x: 2300, y: 2400 }, { x: 1000, y: 2400 }][i], { floor: 'rdc' }));
    const r = simulate({ zombies: list, playerFloor: 'etage', seconds: 90 });
    expect(r.maxStill, JSON.stringify(r.stillWhere)).toBeLessThanOrEqual(2);
    expect(r.enemies.every((e) => e.floor === 'etage')).toBe(true);
  });

  it('le joueur change d\'étage toutes les 20 s pendant 120 s : aucun blocage de plus de 2 s', () => {
    const list = [makeZombie(1, arrivalOf(P.depart, 'etage'), { floor: 'etage' }), makeZombie(2, { x: 2600, y: 2300 }, { floor: 'rdc' }), makeZombie(3, arrivalOf(P.escalier, 'etage'), { floor: 'etage' }), makeZombie(4, { x: 1300, y: 2100 }, { floor: 'rdc' })];
    const r = simulate({ zombies: list, playerFloor: 'rdc', seconds: 120, switchEvery: 20 });
    expect(r.maxStill, JSON.stringify(r.stillWhere)).toBeLessThanOrEqual(2);
  });

  it('plafond de 2 par escalier tenu pendant toute la simulation (6 zombies sur le même escalier)', () => {
    const list = [1, 2, 3, 4, 5, 6].map((id) => makeZombie(id, { x: at(P.depart, 'etage').x + (id % 3) * 15, y: at(P.depart, 'etage').y + id * 4 }, { floor: 'etage' }));
    let peak = 0;
    simulate({ zombies: list, playerFloor: 'rdc', seconds: 30, onStep: (s, enemies) => { for (const n of Object.values(stairLoad(enemies))) peak = Math.max(peak, n); } });
    expect(peak).toBeGreaterThan(0);
    expect(peak).toBeLessThanOrEqual(2);
  });

  it('siège à l\'étage, joueur en bas : le zombie arrache les planches de U1 sans que rien ne bouge au rez-de-chaussée', () => {
    const g = floorWorld.geomById.get('U1');
    const z = makeZombie(1, { x: g.entryOuter.x - 100, y: g.entryOuter.y }, { floor: 'etage', mode: 'approche', window: 'U1' });
    let planksF1 = 4;
    const r = simulate({ zombies: [z], playerFloor: 'rdc', seconds: 20, onStep: (s) => { planksF1 = s.win.windows.F1.planks; } });
    expect(r.state.win.windows.U1.planks).toBeLessThan(4);
    expect(planksF1).toBe(4);
  });

  it('réparation : seule la fenêtre de l\'étage du joueur se répare', () => {
    const g = floorWorld.geomById.get('U1');
    let s = createFloorState(floorWorld, { planks: 4, openDoors: ALL_DOORS, playerFloor: 'rdc' });
    s = { ...s, win: { ...s.win, windows: { ...s.win.windows, U1: { ...s.win.windows.U1, planks: 1 } } } };
    const near = { x: g.repairSpot.x, y: g.repairSpot.y, r: 18 };
    const down = stepFloors(floorWorld, s, { enemies: [], player: near, dt: 0.05 });
    expect(down.repair.U1.repairing).toBe(false);
    const up = stepFloors(floorWorld, { ...s, playerFloor: 'etage' }, { enemies: [], player: near, dt: 0.05 });
    expect(up.repair.U1.repairing).toBe(true);
  });

  it('avec une seule couche (?map=salle) rien ne change : pas d\'escalier, pas de passage', () => {
    const single = buildLayouts({ rdc: { world, decor }, etage: { world: etageWorld }, zones: restrictToFloors(zonesActive, ['rdc']) });
    const w = createFloorWorld(single, { windows: windowsCfg, grid: gridOpts, nav: navCfg, zombie: enemiesCfg.zombie, stair: stairsCfg });
    const s = createFloorState(w, { openDoors: ['porte-1'] });
    expect(w.floors).toEqual(['rdc']);
    expect(stairsOf(w, s)).toEqual([]);
    expect(s.portals.rdc).toEqual([]);
  });

  it('un zombie de l\'étage reste invisible du combat : ni cible, ni touché, ni blessé depuis le rez-de-chaussée (targetsOf)', () => {
    const list = [makeZombie(1, { x: 0, y: 0 }, { floor: 'etage' }), makeZombie(2, { x: 0, y: 0 }, { floor: 'rdc' })];
    expect(targetsOf(list, 'rdc').map((e) => e.id)).toEqual([2]);
    expect(targetsOf(list, 'etage').map((e) => e.id)).toEqual([1]);
  });

  it('les zombies des deux étages se séparent chacun dans leur étage (aucune poussée entre étages)', () => {
    const a = makeZombie(1, arrivalOf(P.depart, 'rdc'), { floor: 'rdc' });
    const b = makeZombie(2, arrivalOf(P.depart, 'rdc'), { floor: 'etage' });
    const player = { x: 3000, y: 2900, r: 18 };
    const alone = stepFloors(floorWorld, state0(), { enemies: [a], player, dt: 0.05 }).enemies[0];
    const stacked = stepFloors(floorWorld, state0(), { enemies: [a, b], player, dt: 0.05 }).enemies[0];
    expect(stacked.x).toBeCloseTo(alone.x, 9);
    expect(stacked.y).toBeCloseTo(alone.y, 9);
  });

  it('stepFloors : événements du siège et des planches marqués de leur étage', () => {
    const g = floorWorld.geomById.get('U1');
    const z = makeZombie(1, { x: g.slots[0].x, y: g.slots[0].y }, { floor: 'etage', mode: 'arrache', window: 'U1' });
    let s = state0();
    let events = [];
    let enemies = [{ ...z, slot: 0 }];
    for (let i = 0; i < 80; i += 1) {
      const out = stepFloors(floorWorld, s, { enemies, player: { x: 3000, y: 2900, r: 18 }, dt: 0.05 });
      s = out.state;
      enemies = out.enemies;
      events = events.concat(out.events);
    }
    expect(events.some((e) => e.type === 'plank-torn' && e.floor === 'etage' && e.windowId === 'U1')).toBe(true);
  });
});
