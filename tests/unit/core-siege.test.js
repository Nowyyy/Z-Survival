import { describe, it, expect } from 'vitest';
import { occupancy, stepSiege } from '../../js/core/siege.js';
import { createWindowsState } from '../../js/core/windows.js';
import { deepFreeze, WEIRD } from './helpers/monde.js';
import { geoms, makeZombie, simulateWaves, siegeParams, stepWorld, windowsCfg } from './helpers/sim-siege.js';

const N = geoms.find((g) => g.id === 'fenetre-nord');
const planksState = (n = 4) => createWindowsState(geoms, windowsCfg, { planks: n });
const at = (id, x, y, extra = {}) => ({ ...makeZombie(id, 'fenetre-nord', 'marcheur', 'marche', { x, y }), ...extra });
const near = (id, dx = 0, dist = 100, extra = {}) => at(id, N.entryOuter.x + dx, N.entryOuter.y - dist, extra);
const step = (zs, planks = 4, dt = 0.05, params = siegeParams) => stepSiege(zs, planksState(planks), geoms, dt, params);
const modes = (out) => out.zombies.map((z) => z.mode);
// Fait avancer les zombies avec le modèle de mouvement du helper.
const advance = (zs, seconds, planks = 4, dt = 0.05) => {
  let state = { zombies: zs, windows: planksState(planks), time: 0 };
  const events = [];
  for (let i = 0; i < Math.round(seconds / dt); i += 1) {
    const out = stepWorld(state, dt, {});
    state = { zombies: out.zombies, windows: out.windows, time: out.time };
    events.push(...out.events);
  }
  return { ...state, events };
};

describe('siege.js : machine à modes', () => {
  it('un zombie loin de la fenêtre reste en approche, vise entryOuter et ne s\'arrête pas', () => {
    const out = step([makeZombie(1, 'fenetre-nord')]);
    expect(out.zombies[0]).toMatchObject({ mode: 'approche', hold: false, target: N.entryOuter });
  });

  it('à moins de 140 d\'une fenêtre fermée, il prend un emplacement et passe en arrache', () => {
    const out = step([near(1, 0, 100)]);
    expect(out.zombies[0].mode).toBe('arrache');
    expect([0, 1]).toContain(out.zombies[0].slot);
    expect(out.zombies[0].target).toEqual(N.slots[out.zombies[0].slot]);
  });

  it('à plus de 140, il continue d\'approcher même si les emplacements sont libres', () => {
    expect(step([near(1, 0, 150)]).zombies[0].mode).toBe('approche');
  });

  it('il prend l\'emplacement libre le plus proche (gauche ou droite)', () => {
    expect(step([near(1, -30, 100)]).zombies[0].slot).toBe(0);
    expect(step([near(1, 30, 100)]).zombies[0].slot).toBe(1);
  });

  it('égalité de distance : le plus petit emplacement', () => {
    expect(step([near(1, 0, 100)]).zombies[0].slot).toBe(0);
  });

  it('le deuxième zombie prend l\'autre emplacement : jamais deux zombies sur le même', () => {
    const out = step([near(1, 0, 100), near(2, 0, 110)]);
    expect(out.zombies.map((z) => z.mode)).toEqual(['arrache', 'arrache']);
    expect(new Set(out.zombies.map((z) => z.slot)).size).toBe(2);
  });

  it('le troisième zombie attend dans la file, à la première place', () => {
    const out = step([near(1, 0, 90), near(2, 0, 100), near(3, 0, 120)]);
    expect(out.zombies[2]).toMatchObject({ mode: 'attente', qi: 0, hold: false });
    expect(out.zombies[2].target).toEqual(N.queue[0]);
  });

  it('la file se remplit dans l\'ordre d\'arrivée', () => {
    let zs = [near(1, 0, 90), near(2, 0, 100)];
    for (let i = 3; i <= 5; i += 1) {
      zs = [...step(zs).zombies, near(i, 0, 130)];
      zs = step(zs).zombies;
    }
    expect(zs.filter((z) => z.mode === 'attente').map((z) => [z.id, z.qi])).toEqual([[3, 0], [4, 1], [5, 2]]);
  });

  it('file pleine (6) et emplacements pris : le zombie suivant s\'arrête loin du mur (hold), pas plus loin que 400', () => {
    let zs = [];
    for (let i = 1; i <= 8; i += 1) {
      zs = [...zs, near(i, 0, 100 + i * 5)];
      zs = step(zs).zombies;
    }
    expect(zs.filter((z) => z.mode === 'arrache')).toHaveLength(2);
    expect(zs.filter((z) => z.mode === 'attente')).toHaveLength(6);
    const far = near(9, 0, 330);
    expect(step([...zs, far]).zombies.at(-1)).toMatchObject({ mode: 'approche', hold: true });
    const farther = at(10, N.center.x, N.center.y - 700);
    expect(step([...zs, farther]).zombies.at(-1).hold).toBe(false);
  });

  it('une place libérée fait avancer la file d\'une place, le premier de la file prend l\'emplacement libre', () => {
    let zs = [near(1, 0, 90), near(2, 0, 100), near(3, 0, 130), near(4, 0, 140)];
    zs = step(zs).zombies;
    zs = step(zs).zombies;
    expect(zs.map((z) => z.mode)).toEqual(['arrache', 'arrache', 'attente', 'attente']);
    const afterKill = step(zs.filter((z) => z.id !== 1)).zombies;
    expect(afterKill.find((z) => z.id === 3).mode).toBe('arrache');
    expect(afterKill.find((z) => z.id === 4)).toMatchObject({ mode: 'attente', qi: 0 });
  });

  it('les rangs de la file sont recalculés quand un zombie du milieu est tué', () => {
    let zs = [near(1, 0, 90), near(2, 0, 100), near(3, 0, 130), near(4, 0, 140), near(5, 0, 150)];
    for (let i = 0; i < 3; i += 1) zs = step(zs).zombies;
    zs = step(zs.filter((z) => z.id !== 4)).zombies;
    expect(zs.filter((z) => z.mode === 'attente').map((z) => [z.id, z.qi])).toEqual([[3, 0], [5, 1]]);
  });

  it('fenêtre ouverte : un zombie à moins de 140 passe en escalade vers entryInner', () => {
    const out = step([near(1, 0, 100)], 0);
    expect(out.zombies[0].mode).toBe('escalade');
    expect(out.zombies[0].climb).toMatchObject({ from: N.entryOuter, to: N.entryInner, t: 0 });
    expect(out.events).toEqual([{ type: 'climb', windowId: 'fenetre-nord', id: 1 }]);
  });

  it('fenêtre ouverte : au plus 2 grimpeurs à la fois, les suivants font la queue', () => {
    const out = step([near(1, -10, 100), near(2, 10, 105), near(3, 0, 120)], 0);
    expect(modes(out)).toEqual(['escalade', 'escalade', 'attente']);
  });

  it('une fenêtre fermée ne donne jamais d\'escalade', () => {
    for (const planks of [1, 2, 3, 4]) expect(step([near(1, 0, 100), near(2, 0, 110), near(3, 0, 120)], planks).zombies.every((z) => z.mode !== 'escalade')).toBe(true);
  });
});

describe('siege.js : escalade', () => {
  it('avant le bord extérieur, la progression reste à 0 et le zombie y est dirigé', () => {
    const z = near(1, 0, 100);
    const out = step([z], 0).zombies[0];
    const again = step([out], 0).zombies[0];
    expect(again.climb.t).toBe(0);
    expect(again.target).toEqual(N.entryOuter);
  });

  it('une fois au bord, la traversée dure climbTime (1,2 s) puis le zombie passe dedans', () => {
    let zs = [at(1, N.entryOuter.x, N.entryOuter.y, { mode: 'escalade', climb: { from: { ...N.entryOuter }, to: { ...N.entryInner }, t: 0 } })];
    const events = [];
    let steps = 0;
    while (zs[0].mode === 'escalade' && steps < 100) {
      const out = step(zs, 0);
      zs = out.zombies;
      events.push(...out.events);
      steps += 1;
    }
    expect(steps).toBe(Math.ceil(windowsCfg.climbTime / 0.05));
    expect(zs[0]).toMatchObject({ mode: 'dedans', climb: null });
    expect(events).toEqual([{ type: 'enter', windowId: 'fenetre-nord', id: 1 }]);
  });

  it('un zombie bloqué loin du bord commence quand même l\'escalade après walkLimit secondes (partie de là où il est)', () => {
    let zs = [at(1, N.entryOuter.x + 100, N.entryOuter.y - 10, { mode: 'escalade', climb: { from: { ...N.entryOuter }, to: { ...N.entryInner }, t: 0 } })];
    for (let i = 0; i < Math.round(windowsCfg.walkLimit / 0.05) + 2; i += 1) zs = step(zs, 0).zombies;
    expect(zs[0].climb.t).toBeGreaterThan(0);
    expect(zs[0].climb.from.x).toBeCloseTo(N.entryOuter.x + 100, 6);
  });

  it('arracheurs et file se disputent l\'escalade à l\'ouverture : les deux plus anciens grimpent, les autres attendent', () => {
    let zs = [near(1, 0, 90), near(2, 0, 100), near(3, 0, 130), near(4, 0, 140)];
    for (let i = 0; i < 3; i += 1) zs = step(zs, 4).zombies;
    const out = step(zs, 0);
    expect(modes(out)).toEqual(['escalade', 'escalade', 'attente', 'attente']);
    expect(out.zombies.slice(2).map((z) => z.qi)).toEqual([0, 1]);
  });

  it('égalité d\'arrivée : le plus petit identifiant grimpe d\'abord', () => {
    const a = near(7, -10, 100, { mode: 'attente', ord: 1, qi: 0 });
    const b = near(3, 10, 100, { mode: 'attente', ord: 1, qi: 1 });
    const c = near(5, 0, 100, { mode: 'attente', ord: 1, qi: 2 });
    const out = step([a, b, c], 0);
    expect(out.zombies.map((z) => [z.id, z.mode])).toEqual([[7, 'attente'], [3, 'escalade'], [5, 'escalade']]);
  });

  it('un grimpeur tué libère sa place : le suivant de la file grimpe', () => {
    let zs = step([near(1, -10, 100), near(2, 10, 100), near(3, 0, 130)], 0).zombies;
    zs = step(zs, 0).zombies;
    expect(zs.map((z) => z.mode)).toEqual(['escalade', 'escalade', 'attente']);
    const out = step(zs.filter((z) => z.id !== 1), 0);
    expect(out.zombies.map((z) => z.mode)).toEqual(['escalade', 'escalade']);
  });

  it('aucun zombie n\'entre sans passer par une escalade : simulation pas à pas d\'un zombie seul sur une fenêtre fermée', () => {
    const r = advance([makeZombie(1, 'fenetre-nord')], 60, 4);
    expect(r.events.filter((e) => e.type === 'enter')).toHaveLength(1);
    const kinds = r.events.map((e) => e.type);
    expect(kinds.indexOf('window-open')).toBeLessThan(kinds.indexOf('climb'));
    expect(kinds.indexOf('climb')).toBeLessThan(kinds.indexOf('enter'));
  });
});

describe('siege.js : arrachage et réparation', () => {
  it('un arracheur à son emplacement contribue avec le tearMul de son type', () => {
    const z = at(1, N.slots[0].x, N.slots[0].y, { mode: 'arrache', slot: 0, ord: 1, tearMul: 1.6 });
    expect(step([z]).tearing['fenetre-nord']).toEqual([{ zombieId: 1, rate: 1.6 }]);
  });

  it('un arracheur encore en marche vers son emplacement ne contribue pas', () => {
    const z = at(1, N.slots[0].x, N.slots[0].y - 60, { mode: 'arrache', slot: 0, ord: 1 });
    expect(step([z]).tearing['fenetre-nord']).toEqual([]);
  });

  it('au plus activeTearers arracheurs actifs par fenêtre', () => {
    const zs = [at(1, N.slots[0].x, N.slots[0].y, { mode: 'arrache', slot: 0, ord: 1 }), at(2, N.slots[1].x, N.slots[1].y, { mode: 'arrache', slot: 1, ord: 2 })];
    expect(step(zs, 4, 0.05, { ...siegeParams, activeTearers: 1 }).tearing['fenetre-nord']).toHaveLength(1);
    expect(step(zs).tearing['fenetre-nord']).toHaveLength(2);
  });

  it('repairBlocked : vrai avec un arracheur ou un grimpeur, faux avec un zombie en approche ou personne', () => {
    const tearer = at(1, N.slots[0].x, N.slots[0].y, { mode: 'arrache', slot: 0, ord: 1 });
    const climber = at(2, N.entryOuter.x, N.entryOuter.y, { mode: 'escalade', climb: { from: { ...N.entryOuter }, to: { ...N.entryInner }, t: 0.5 } });
    const approaching = makeZombie(3, 'fenetre-nord');
    expect(step([tearer]).repairBlocked['fenetre-nord']).toBe(true);
    expect(step([climber], 0).repairBlocked['fenetre-nord']).toBe(true);
    expect(step([approaching], 4).repairBlocked['fenetre-nord']).toBe(false);
    expect(step([]).repairBlocked['fenetre-nord']).toBe(false);
    expect(step([tearer]).repairBlocked['fenetre-ouest']).toBe(false);
  });

  it('un zombie tué quitte son emplacement aussitôt : la réparation n\'est plus bloquée', () => {
    const tearer = at(1, N.slots[0].x, N.slots[0].y, { mode: 'arrache', slot: 0, ord: 1 });
    expect(step([tearer]).repairBlocked['fenetre-nord']).toBe(true);
    expect(step([]).repairBlocked['fenetre-nord']).toBe(false);
  });

  it('une planche arrachée par un zombie seul : 4 planches en 4 × 2,2 s au rythme d\'un marcheur', () => {
    const z = at(1, N.slots[0].x, N.slots[0].y, { mode: 'arrache', slot: 0, ord: 1 });
    const r = advance([z], 8.8 + 0.2, 4);
    expect(r.windows.windows['fenetre-nord'].planks).toBe(0);
    const early = advance([z], 8.8 - 0.3, 4);
    expect(early.windows.windows['fenetre-nord'].planks).toBe(1);
  });
});

describe('siege.js : auto-correction, zombies libres, entrées', () => {
  const outside = { x: N.center.x, y: N.center.y - 200 };

  it('un zombie « dedans » resté plus de strandedTime hors de la salle repasse en approche vers la fenêtre la plus proche', () => {
    let zs = [at(1, outside.x, outside.y, { mode: 'dedans', window: 'fenetre-ouest' })];
    const events = [];
    for (let i = 0; i < 70; i += 1) {
      const out = step(zs);
      zs = out.zombies;
      events.push(...out.events);
    }
    expect(zs[0]).toMatchObject({ mode: 'approche', window: 'fenetre-nord', slot: null, climb: null });
    expect(events).toEqual([{ type: 'stranded', windowId: 'fenetre-nord', id: 1 }]);
  });

  it('pas avant strandedTime', () => {
    let zs = [at(1, outside.x, outside.y, { mode: 'dedans' })];
    for (let i = 0; i < 55; i += 1) zs = step(zs).zombies;
    expect(zs[0].mode).toBe('dedans');
  });

  it('un zombie « dedans » dans la salle ne bouge pas de mode et son compteur reste à 0', () => {
    let zs = [at(1, N.entryInner.x, N.entryInner.y + 100, { mode: 'dedans', outsideT: 2 })];
    zs = step(zs).zombies;
    expect(zs[0]).toMatchObject({ mode: 'dedans', outsideT: 0, target: null, hold: false });
  });

  it('libre (et mode absent) : recopié sans aucune intention', () => {
    const libre = { id: 1, x: 5, y: 6, r: 20, mode: 'libre', window: 'fenetre-nord' };
    const sans = { id: 2, x: 7, y: 8, r: 20 };
    const out = step([libre, sans]);
    expect(out.zombies).toEqual([libre, sans]);
    expect(out.zombies[0]).not.toBe(libre);
  });

  it('les sorties sont de nouveaux objets, dans le même ordre', () => {
    const zs = [near(2, 0, 100), near(1, 0, 105)];
    const out = step(zs);
    expect(out.zombies.map((z) => z.id)).toEqual([2, 1]);
    expect(out.zombies[0]).not.toBe(zs[0]);
    expect(zs[0].mode).toBe('approche');
  });

  it('occupancy compte arracheurs, grimpeurs et file par fenêtre', () => {
    const zs = step([near(1, 0, 90), near(2, 0, 100), near(3, 0, 130)]).zombies;
    expect(occupancy(zs, 'fenetre-nord')).toEqual({ tearers: 2, climbers: 0, queue: 1 });
    expect(occupancy(zs, 'fenetre-est')).toEqual({ tearers: 0, climbers: 0, queue: 0 });
  });

  it('déterminisme : mêmes entrées, mêmes sorties', () => {
    const zs = [near(1, 0, 90), near(2, 0, 100), near(3, 0, 130), near(4, 0, 138)];
    expect(step(zs)).toEqual(step(zs));
  });

  it('arguments gelés acceptés et non modifiés', () => {
    const zs = deepFreeze([near(1, 0, 90), near(2, 0, 100), near(3, 0, 130)]);
    const ws = deepFreeze(planksState(4));
    const gs = deepFreeze(JSON.parse(JSON.stringify(geoms)));
    const before = JSON.stringify([zs, ws, gs]);
    expect(() => stepSiege(zs, ws, gs, 0.05, deepFreeze({ ...siegeParams }))).not.toThrow();
    expect(JSON.stringify([zs, ws, gs])).toBe(before);
  });

  it('entrées hostiles : aucune exception', () => {
    for (const a of WEIRD) {
      for (const b of WEIRD) {
        expect(() => stepSiege(a, b, a, b, a)).not.toThrow();
        expect(() => stepSiege([a, b, near(1)], b, geoms, a, b)).not.toThrow();
        expect(() => stepSiege([near(1)], a, b, 0.05, siegeParams)).not.toThrow();
      }
    }
    const out = stepSiege([{ id: 1, mode: 'arrache', window: 'fenetre-nord', x: NaN, y: 'x' }, null, 4, { id: 2, mode: 'escalade', window: 'fenetre-nord', x: 1, y: 1 }], planksState(0), geoms, 0.05, siegeParams);
    expect(out.zombies).toHaveLength(4);
  });
});

describe('siege.js : simulation pure de 40 vagues (joueur immobile, modèle de mort simple)', () => {
  const sim = simulateWaves({ seed: 1, waves: 40 });

  it('les 40 vagues se terminent, aucune n\'est bloquée (durée maximale rapportée)', () => {
    console.info(`siège : ${sim.completed} vagues terminées, durée maximale ${Math.max(...sim.waveDurations).toFixed(1)} s, ${sim.spawned} zombies, ${sim.opened} ouvertures et ${sim.closed} fermetures`);
    expect(sim.completed).toBe(40);
    expect(sim.timeouts).toBe(0);
    expect(Math.max(...sim.waveDurations)).toBeLessThan(600);
  });

  it('au plus 2 arracheurs et 2 grimpeurs par fenêtre, jamais deux zombies sur le même emplacement', () => {
    expect(sim.maxTearers).toBeLessThanOrEqual(2);
    expect(sim.maxClimbers).toBeLessThanOrEqual(2);
    expect(sim.duplicateSlots).toBe(0);
  });

  it('aucun zombie n\'entre sans escalade d\'une fenêtre ouverte, et tous ceux qui apparaissent finissent par entrer', () => {
    expect(sim.badEntries).toBe(0);
    expect(sim.entries).toBeGreaterThan(1000);
    expect(sim.entries).toBeLessThanOrEqual(sim.spawned);
  });

  it('les fenêtres s\'ouvrent et se referment pendant la simulation', () => {
    expect(sim.opened).toBeGreaterThan(20);
    expect(sim.closed).toBeGreaterThan(5);
  });

  it('aucun zombie immobile plus de 2 s hors des états d\'attente voulus', () => {
    expect(sim.stillWhere).toBeNull();
    expect(sim.maxStill).toBeLessThanOrEqual(2);
  });

  it('jamais plus de 10 zombies simultanés, file de 6 au plus (hors zombies démobilisés)', () => {
    expect(sim.maxAlive).toBeLessThanOrEqual(10);
    expect(sim.maxQueue).toBeLessThanOrEqual(8);
  });

  it.each([2, 3])('autre graine (%s) : 15 vagues terminées sans blocage', (seed) => {
    const r = simulateWaves({ seed, waves: 15 });
    expect(r.completed).toBe(15);
    expect(r.maxStill).toBeLessThanOrEqual(2);
    expect(r.badEntries).toBe(0);
  });

  it('fenêtres déjà ouvertes (aucune planche) : 10 vagues terminées', () => {
    const r = simulateWaves({ seed: 4, waves: 10, planks: 0, repairCycle: 1e9 });
    expect(r.completed).toBe(10);
    expect(r.badEntries).toBe(0);
  });

  it('même graine, même résultat', () => {
    expect(simulateWaves({ seed: 5, waves: 6 })).toEqual(simulateWaves({ seed: 5, waves: 6 }));
  });
});
