import { describe, it, expect } from 'vitest';
import { castRay } from '../../js/core/ray.js';
import { stepContact } from '../../js/core/combat.js';
import { countByFloor, DEFAULT_FLOOR, FLOOR_IDS, floorOf, layoutFor, onFloor, otherFloor, parseFloors, sameFloor, withFloor } from '../../js/core/floors.js';
import { buildLayout, buildLayouts, closedDoors, playerSolids } from '../../js/core/layout.js';
import { knockbackZombies } from '../../js/core/player-down.js';
import { createBullet, stepBullets } from '../../js/core/projectile.js';
import { stepSiege } from '../../js/core/siege.js';
import { stepSpawner } from '../../js/core/spawner.js';
import { createRng } from '../../js/core/rng.js';
import { createDirector, stepDirector } from '../../js/core/wave-director.js';
import { parseZones, restrictToFloors, zonesToWorld } from '../../js/core/zones.js';
import { createWindowsState, windowGeometries } from '../../js/core/windows.js';
import { decor, etageWorld, layouts, wavesCfg, windowsCfg, world, zones, zonesActive, zonesJson } from './helpers/etage.js';
import { deepFreeze, WEIRD } from './helpers/carte.js';

const inRect = (r, x, y) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;

describe('floors.js : liste des étages (parseFloors)', () => {
  it('un champ absent donne le seul étage rdc', () => {
    expect(parseFloors({})).toEqual({ floors: ['rdc'], multi: false, warnings: [] });
  });

  it('rdc et etage : deux étages, multi vrai', () => {
    expect(parseFloors({ floors: ['rdc', 'etage'] })).toMatchObject({ floors: ['rdc', 'etage'], multi: true, warnings: [] });
  });

  it('l\'ordre canonique est rdc puis etage', () => {
    expect(parseFloors({ floors: ['etage', 'rdc'] }).floors).toEqual(['rdc', 'etage']);
  });

  it('un étage inconnu ou en double est ignoré avec un avertissement', () => {
    const r = parseFloors({ floors: ['rdc', 'sous-sol', 'etage', 'etage', 3] });
    expect(r.floors).toEqual(['rdc', 'etage']);
    expect(r.warnings.length).toBe(3);
  });

  it('un étage sans rdc : rdc est ajouté, avec un avertissement', () => {
    const r = parseFloors({ floors: ['etage'] });
    expect(r.floors).toEqual(['rdc', 'etage']);
    expect(r.warnings.join(' ')).toMatch(/rdc/);
  });

  it('floors qui n\'est pas une liste : un seul étage et un avertissement', () => {
    const r = parseFloors({ floors: 'etage' });
    expect(r.floors).toEqual(['rdc']);
    expect(r.warnings).toHaveLength(1);
  });

  it.each(WEIRD)('entrée hostile %p : jamais d\'exception, toujours rdc au moins', (bad) => {
    expect(() => parseFloors(bad)).not.toThrow();
    expect(parseFloors(bad).floors).toContain('rdc');
    expect(() => parseFloors({ floors: bad })).not.toThrow();
    expect(parseFloors({ floors: [bad, bad] }).floors).toContain('rdc');
  });

  it('déterministe, et n\'altère pas un argument gelé', () => {
    const input = deepFreeze({ floors: ['rdc', 'etage'] });
    expect(parseFloors(input)).toEqual(parseFloors(input));
  });

  it('zones.json de la carte : deux étages ; l\'ancien fichier sans floors se lit comme un seul étage rdc', () => {
    expect(parseFloors(zonesJson).floors).toEqual(['rdc', 'etage']);
    const old = parseZones({ wavesPerWorld: 40, zones: [{ id: 'depart', openAtStart: true, region: [[0, 0], [10, 0], [10, 10]] }], doors: [] });
    expect(old.floors).toEqual(['rdc']);
    expect(old.multiFloor).toBe(false);
    expect(old.zones[0].floor).toBe('rdc');
    expect(old.stairs).toEqual([]);
  });
});

describe('floors.js : étage d\'une entité', () => {
  it('une entité sans étage est au rez-de-chaussée ; un étage inconnu aussi', () => {
    expect(floorOf({ id: 1 })).toBe('rdc');
    expect(floorOf({ floor: 'etage' })).toBe('etage');
    expect(floorOf({ floor: 'cave' })).toBe('rdc');
    for (const bad of WEIRD) expect(floorOf(bad)).toBe('rdc');
  });

  it('sameFloor compare des entités ou des identifiants', () => {
    expect(sameFloor({}, { floor: 'rdc' })).toBe(true);
    expect(sameFloor({ floor: 'etage' }, {})).toBe(false);
    expect(sameFloor('etage', { floor: 'etage' })).toBe(true);
    expect(sameFloor('etage', 'rdc')).toBe(false);
    expect(sameFloor(undefined, null)).toBe(true);
  });

  it('otherFloor et countByFloor', () => {
    expect(otherFloor('rdc')).toBe('etage');
    expect(otherFloor('etage')).toBe('rdc');
    expect(countByFloor([{}, { floor: 'etage' }, { floor: 'etage' }, null])).toEqual({ rdc: 1, etage: 2 });
    expect(FLOOR_IDS).toEqual(['rdc', 'etage']);
    expect(DEFAULT_FLOOR).toBe('rdc');
  });

  it('onFloor garde les éléments de l\'étage demandé, dans l\'ordre et sans les copier', () => {
    const a = { id: 1 };
    const b = { id: 2, floor: 'etage' };
    const c = { id: 3, floor: 'rdc' };
    expect(onFloor([a, b, c, null], 'rdc')).toEqual([a, c]);
    expect(onFloor([a, b, c], 'etage')[0]).toBe(b);
    expect(onFloor('x', 'rdc')).toEqual([]);
  });

  it('withFloor applique la fonction aux seuls éléments de l\'étage et remet les résultats à leur place', () => {
    const list = [{ id: 1 }, { id: 2, floor: 'etage' }, { id: 3 }];
    const out = withFloor(list, 'rdc', (mine) => mine.map((e) => ({ ...e, moved: true })));
    expect(out.map((e) => e.moved === true)).toEqual([true, false, true]);
    expect(out[1]).toBe(list[1]);
  });

  it('withFloor : une fonction qui change la longueur laisse la liste intacte', () => {
    const list = [{ id: 1 }, { id: 2, floor: 'etage' }];
    expect(withFloor(list, 'rdc', () => [])).toEqual(list);
  });

  it('layoutFor : la couche de l\'étage, sinon celle du rez-de-chaussée, sinon null', () => {
    expect(layoutFor(layouts, 'etage')).toBe(layouts.etage);
    expect(layoutFor(layouts, 'rdc')).toBe(layouts.rdc);
    expect(layoutFor(layouts, 'cave')).toBe(layouts.rdc);
    expect(layoutFor({ rdc: 'a' }, 'etage')).toBe('a');
    expect(layoutFor(null, 'rdc')).toBeNull();
    for (const bad of WEIRD) expect(() => layoutFor(bad, bad)).not.toThrow();
  });
});

describe('couches de collisions par étage (layout.js)', () => {
  it('buildLayouts : deux couches, chacune connaît son étage', () => {
    expect(layouts.floors).toEqual(['rdc', 'etage']);
    expect(layouts.multi).toBe(true);
    expect(layouts.rdc.floorId).toBe('rdc');
    expect(layouts.etage.floorId).toBe('etage');
  });

  it('la couche du rez-de-chaussée ne porte aucun champ floor (rétrocompatibilité : tout est « rdc » par défaut) ; celle de l\'étage marque chaque donnée', () => {
    for (const list of [layouts.rdc.windows, layouts.rdc.furniture, layouts.rdc.walls, layouts.rdc.spawnPoints]) for (const o of list) expect(o.floor).toBeUndefined();
    for (const list of [layouts.etage.windows, layouts.etage.furniture, layouts.etage.walls, layouts.etage.spawnPoints]) for (const o of list) expect(o.floor).toBe('etage');
  });

  it('sans zones à deux étages (ou avec restrictToFloors) : une seule couche, identique à buildLayout', () => {
    const single = buildLayouts({ rdc: { world, decor }, etage: { world: etageWorld }, zones: restrictToFloors(zonesActive, ['rdc']) });
    expect(single.floors).toEqual(['rdc']);
    expect(single.multi).toBe(false);
    expect(single.etage).toBeUndefined();
    const alone = buildLayout(world, decor, { zones: restrictToFloors(zonesActive, ['rdc']) });
    const plain = (l) => JSON.stringify(l, (k, v) => (typeof v === 'function' ? undefined : v));
    expect(plain(single.rdc)).toBe(plain(alone));
    expect(buildLayouts({ rdc: { world, decor }, zones: null }).floors).toEqual(['rdc']);
  });

  it('les deux couches ne partagent ni murs, ni obstacles, ni fenêtres', () => {
    expect(layouts.rdc.windows.map((w) => w.id)).toEqual(['F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8']);
    expect(layouts.etage.windows.map((w) => w.id)).toEqual(['U1', 'U2', 'U3', 'U4', 'U5', 'U6', 'U7']);
    expect(layouts.etage.walls.some((w) => layouts.rdc.walls.some((r) => r.id === w.id && r.x === w.x && r.y === w.y && r.w === w.w && r.h === w.h))).toBe(false);
    expect(layouts.etage.furniture.length).toBeGreaterThan(0);
  });

  it('l\'extérieur de l\'étage n\'a aucun obstacle solide (ni voiture, ni arbre) : ses solides sont ses murs et son mobilier', () => {
    expect(layouts.etage.decor.solids).toEqual([]);
    expect(layouts.etage.zombieObstacles.length).toBe(layouts.etage.furniture.length + layouts.etage.walls.length);
    expect(layouts.rdc.decor.solids.length).toBeGreaterThan(0);
  });

  it('la cage d\'escalier de l\'étage bloque à l\'étage et pas au rez-de-chaussée (au moins un point de la cage est libre en bas) ; l\'emprise du rez-de-chaussée bloque en bas', () => {
    const well = zonesActive.stairs.find((s) => s.id === 'escalier-depart').floors.etage.solid;
    const up = playerSolids(layouts.etage, []);
    const down = playerSolids(layouts.rdc, []);
    let onlyUp = 0;
    for (let x = well.x + 5; x < well.x + well.w; x += 10) {
      for (let y = well.y + 5; y < well.y + well.h; y += 10) if (up.some((o) => inRect(o, x, y)) && !down.some((o) => inRect(o, x, y))) onlyUp += 1;
    }
    expect(onlyUp).toBeGreaterThan(10);
    const stair = zonesActive.stairs.find((s) => s.id === 'escalier-aile').floors.rdc.solid;
    expect(down.some((o) => inRect(o, stair.x + stair.w / 2, stair.y + stair.h / 2))).toBe(true);
    expect(up.some((o) => inRect(o, stair.x + stair.w / 2, stair.y + stair.h / 2))).toBe(true);
  });

  it('les blocs d\'une porte sont par étage : porte-3 en a un à chaque étage, porte-2 un au rez-de-chaussée seulement', () => {
    expect(layouts.doors.map((d) => [d.id, d.blocks.rdc.length, d.blocks.etage.length])).toEqual([['porte-1', 1, 0], ['porte-2', 1, 0], ['porte-3', 1, 1]]);
    expect(closedDoors(layouts.etage, []).map((r) => r.id)).toEqual(['porte-3']);
    expect(closedDoors(layouts.rdc, []).map((r) => r.id)).toEqual(['porte-1', 'porte-2', 'porte-3']);
  });

  it('une porte ouverte n\'a plus aucun bloc, à aucun étage', () => {
    expect(closedDoors(layouts.etage, ['porte-3'])).toEqual([]);
    expect(closedDoors(layouts.rdc, ['porte-1', 'porte-2', 'porte-3'])).toEqual([]);
    expect(closedDoors(layouts.rdc, ['porte-2']).map((r) => r.id)).toEqual(['porte-1', 'porte-3']);
  });

  it('les portes planned (zones.json avant les parties B et C) n\'ont aucun bloc dans les couches', () => {
    const planned = buildLayouts({ rdc: { world, decor }, etage: { world: etageWorld }, zones });
    expect(planned.doors.map((d) => d.id)).toEqual(['porte-1']);
    expect(closedDoors(planned.etage, [])).toEqual([]);
  });

  it('les blocs de l\'étage et du rez-de-chaussée sont dans le bâtiment de leur étage', () => {
    for (const f of ['rdc', 'etage']) for (const b of closedDoors(layouts[f], [])) expect(layouts[f].inside(b.x + b.w / 2, b.y + b.h / 2), `${f} ${b.id}`).toBe(true);
  });
});

describe('aucune entité d\'un étage n\'interagit avec une entité de l\'autre', () => {
  const zombie = (id, floor, x = 100, y = 0, extra = {}) => ({ id, x, y, r: 20, health: 10, mode: 'dedans', ...(floor ? { floor } : {}), ...extra });

  it('le laser ne voit pas un zombie de l\'autre étage ; il voit celui du même étage', () => {
    const list = [zombie(1, 'etage'), zombie(2)];
    expect(castRay({ x: 0, y: 0 }, 0, 500, list, null, [], 'rdc').hit.id).toBe(2);
    expect(castRay({ x: 0, y: 0 }, 0, 500, [zombie(1, 'etage')], null, [], 'rdc').hit).toBeNull();
    expect(castRay({ x: 0, y: 0 }, 0, 500, [zombie(1, 'etage')], null, [], 'etage').hit.id).toBe(1);
  });

  it('le laser ignore un zombie en train de franchir un escalier', () => {
    expect(castRay({ x: 0, y: 0 }, 0, 500, [zombie(1, undefined, 100, 0, { mode: 'escalier' })], null, [], 'rdc').hit).toBeNull();
  });

  it('sans étage donné, le laser voit tout le monde (comportement d\'avant)', () => {
    expect(castRay({ x: 0, y: 0 }, 0, 500, [zombie(1, 'etage')], null).hit.id).toBe(1);
  });

  it('une balle ne touche que les zombies de son étage', () => {
    const shot = (floor) => ({ ...createBullet({ x: 0, y: 0 }, 0, { damage: 5, bulletSpeed: 2000, bulletRadius: 3, bulletMaxDistance: 500 }, 1), ...(floor ? { floor } : {}) });
    expect(stepBullets([shot('etage')], [zombie(1)], 0.05, null).impacts).toHaveLength(0);
    expect(stepBullets([shot()], [zombie(1, 'etage')], 0.05, null).impacts).toHaveLength(0);
    expect(stepBullets([shot('etage')], [zombie(1, 'etage')], 0.05, null).impacts).toHaveLength(1);
    expect(stepBullets([shot()], [zombie(1)], 0.05, null).impacts).toHaveLength(1);
    expect(stepBullets([shot()], [zombie(1, undefined, 100, 0, { mode: 'escalier' })], 0.05, null).impacts).toHaveLength(0);
  });

  it('le contact d\'un zombie de l\'autre étage ne blesse pas le joueur', () => {
    const def = { contactDelay: 1, contactDamage: 10 };
    const player = { x: 100, y: 0, r: 18, health: 100 };
    expect(stepContact(player, [zombie(1, 'etage')], 0.05, def).damage).toBe(0);
    expect(stepContact({ ...player, floor: 'etage' }, [zombie(1, 'etage')], 0.05, def).damage).toBe(10);
    expect(stepContact(player, [zombie(1)], 0.05, def).damage).toBe(10);
    expect(stepContact(player, [zombie(1, undefined, 100, 0, { mode: 'escalier' })], 0.05, def).damage).toBe(0);
  });

  it('le repoussement ne déplace pas les zombies de l\'autre étage', () => {
    const list = [zombie(1, 'etage', 10, 0), zombie(2, undefined, 10, 0)];
    const out = knockbackZombies(list, { x: 0, y: 0 }, { radius: 200, distance: 80 }, { bounds: { minX: -1000, minY: -1000, maxX: 1000, maxY: 1000 }, furniture: [], walls: [], gaps: [] });
    expect(out[0]).toBe(list[0]);
    expect(out[1].x).toBeGreaterThan(10);
    const up = knockbackZombies(list, { x: 0, y: 0, floor: 'etage' }, { radius: 200, distance: 80 }, { bounds: { minX: -1000, minY: -1000, maxX: 1000, maxY: 1000 }, furniture: [], walls: [], gaps: [] });
    expect(up[0].x).toBeGreaterThan(10);
    expect(up[1]).toBe(list[1]);
  });

  it('le siège ne touche que les zombies de l\'étage donné (params.floor)', () => {
    const geoms = windowGeometries(layouts.rdc.windows.map((w) => ({ ...w, gap: layouts.rdc.gaps.find((g) => g.id === w.id) })), windowsCfg);
    const g = geoms.find((q) => q.id === 'F5');
    const state = createWindowsState(geoms, windowsCfg);
    const at = { x: g.entryOuter.x, y: g.entryOuter.y };
    const mine = { id: 1, ...at, r: 20, mode: 'approche', window: 'F5' };
    const other = { id: 2, ...at, r: 20, mode: 'approche', window: 'F5', floor: 'etage' };
    const out = stepSiege([mine, other], state, geoms, 0.05, { ...windowsCfg, floor: 'rdc' });
    expect(out.zombies[0].mode).not.toBe('approche');
    expect(out.zombies[1]).toEqual(other);
  });

  it('l\'apparition : un point d\'un autre étage n\'est jamais « dans la vue » ; un point du même étage l\'est', () => {
    const view = { minX: 0, minY: 0, maxX: 1000, maxY: 1000 };
    const def = { spawnInterval: 1, maxPresent: 10 };
    const inView = { id: 'a', x: 500, y: 500, floor: 'rdc' };
    const upstairs = { id: 'b', x: 500, y: 500, floor: 'etage' };
    expect(stepSpawner({ timer: 1 }, 0, 0, def, [inView], createRng(1), view, 'rdc').spawn).toBeNull();
    expect(stepSpawner({ timer: 1 }, 0, 0, def, [upstairs], createRng(1), view, 'rdc').spawn).toMatchObject({ id: 'b', floor: 'etage' });
    expect(stepSpawner({ timer: 1 }, 0, 0, def, [inView], createRng(1), view, 'etage').spawn).toMatchObject({ id: 'a', floor: 'rdc' });
    expect(stepSpawner({ timer: 1 }, 0, 0, def, [upstairs], createRng(1), view, 'etage').spawn).toBeNull();
    expect(stepSpawner({ timer: 1 }, 0, 0, def, [{ id: 'c', x: 500, y: 500 }], createRng(1), view).spawn).toBeNull();
  });

  it('le directeur transmet l\'étage du point choisi dans sa demande d\'apparition', () => {
    let d = createDirector(wavesCfg, { seed: 1, wave: 21 });
    const points = [{ id: 'U1-a', x: 5000, y: 5000, fenetre: 'U1', floor: 'etage' }];
    let found = null;
    for (let i = 0; i < 2000 && !found; i += 1) {
      const out = stepDirector(d, { dt: 0.05, alive: 0, view: { minX: 0, minY: 0, maxX: 100, maxY: 100 }, points, playerFloor: 'rdc' });
      d = out.state;
      found = out.requests[0] ?? null;
    }
    expect(found).toMatchObject({ pointId: 'U1-a', floor: 'etage', window: 'U1' });
  });
});

describe('zones converties : étage de chaque zone et de chaque bloc', () => {
  it('zonesToWorld garde l\'étage des zones, des portes et des blocs', () => {
    expect(zones.zones.map((z) => [z.id, z.floor])).toEqual([['depart', 'rdc'], ['aile', 'rdc'], ['etage-gauche', 'etage'], ['etage-droite', 'etage']]);
    expect(zones.doors[2].blocks.map((b) => b.floor)).toEqual(['rdc', 'etage']);
    expect(zones.floors).toEqual(['rdc', 'etage']);
    expect(zones.multiFloor).toBe(true);
  });

  it('restrictToFloors(rdc) : un seul étage, aucun escalier, les portes de l\'ancienne carte restent', () => {
    const r = restrictToFloors(zones, ['rdc']);
    expect(r.zones.map((z) => z.id)).toEqual(['depart', 'aile']);
    expect(r.stairs).toEqual([]);
    expect(r.multiFloor).toBe(false);
    expect(r.doors.map((d) => d.id)).toEqual(['porte-1', 'porte-2', 'porte-3']);
    expect(r.doors[2].blocks.map((b) => b.floor)).toEqual(['rdc']);
  });

  it('zonesToWorld(parseZones(…)) ne modifie pas ses entrées gelées', () => {
    const parsed = deepFreeze(parseZones(zonesJson));
    expect(() => zonesToWorld(parsed, world.transform)).not.toThrow();
    expect(() => restrictToFloors(deepFreeze(zones), ['rdc'])).not.toThrow();
  });
});
