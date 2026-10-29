import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { activeSpawnPoints, activeWindows, activeZones, assignWindows, assignWindowsDetailed, doorRect, doorsOpenAtStart, nextDoor, parseZones, zonesToWorld } from '../../js/core/zones.js';
import { deepFreeze, WEIRD } from './helpers/carte.js';

const MAP = 'data/game/maps/rez-de-chaussee';
const raw = JSON.parse(readFileSync(`${MAP}/zones.json`, 'utf8'));
const plan = JSON.parse(readFileSync(`${MAP}/plan.json`, 'utf8'));
const decor = JSON.parse(readFileSync(`${MAP}/decor.json`, 'utf8'));
const world = JSON.parse(readFileSync(`${MAP}/world.json`, 'utf8'));
// Lot 3e : porte-2 est active ; ces tests du lot 3c décrivent l'état d'avant (porte-2 planned), la porte 2 est testée dans etage-directeur.test.js.
const raw3c = { ...raw, doors: raw.doors.map((d) => (d.id === 'porte-2' ? { ...d, planned: true } : d)) };
const zones = parseZones(raw3c);
const PX = 12; // distance « entrée intérieure » en pixels du plan (60 unités / 5)
const assignment = assignWindows(zones, plan.windows, PX);
const ALL = ['F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8'];

describe('zones : parseZones', () => {
  it('lit zones.json de la carte sans avertissement', () => {
    expect(zones.warnings).toEqual([]);
    expect(zones.wavesPerWorld).toBe(40);
    expect(zones.zones.map((z) => [z.id, z.openAtStart])).toEqual([['depart', true], ['aile', false], ['etage-gauche', false], ['etage-droite', false]]);
    expect(zones.doors.map((d) => [d.id, d.kind, d.openAfterWave, d.planned])).toEqual([['porte-1', 'porte', 10, false], ['porte-2', 'escalier', 20, true], ['porte-3', 'escalier', 30, true]]);
  });

  it('chaque région est un polygone d\'au moins trois sommets', () => {
    for (const z of zones.zones) expect(z.region.length).toBeGreaterThanOrEqual(3);
  });

  it('les données sont marquées provisoires', () => {
    expect(raw._provisoire).toMatch(/provisoire/i);
  });

  it.each(WEIRD)('une entrée hostile (%s) ne lève aucune exception et donne des valeurs neutres', (bad) => {
    const out = parseZones(bad);
    expect(out.zones).toEqual([]);
    expect(out.doors).toEqual([]);
    expect(out.wavesPerWorld).toBe(40);
    expect(Array.isArray(out.warnings)).toBe(true);
  });

  it('wavesPerWorld invalide : 40 et un avertissement', () => {
    for (const v of [0, -3, 2.5, '40', NaN, null]) {
      const out = parseZones({ ...raw, wavesPerWorld: v });
      expect(out.wavesPerWorld).toBe(40);
      expect(out.warnings.join(' ')).toMatch(/wavesPerWorld/);
    }
    expect(parseZones({ ...raw, wavesPerWorld: 12 }).wavesPerWorld).toBe(12);
  });

  it('une zone sans identifiant, en double ou sans région valide est signalée', () => {
    const out = parseZones({ zones: [{ id: 'a', openAtStart: true, region: [[0, 0], [1, 0], [1, 1]] }, { id: 'a', region: [] }, { region: [] }, { id: 'b', openAtStart: false, region: [[0, 0]] }], doors: [] });
    expect(out.zones.map((z) => z.id)).toEqual(['a', 'b']);
    expect(out.zones[1].region).toEqual([]);
    expect(out.warnings.length).toBeGreaterThanOrEqual(3);
  });

  it('une porte sans openAfterWave valide est ignorée avec un avertissement', () => {
    for (const v of [0, -1, 1.5, 'x', undefined]) {
      const out = parseZones({ ...raw, doors: [{ id: 'p', openAfterWave: v, opens: ['aile'], opening: raw.doors[0].opening }] });
      expect(out.doors).toEqual([]);
      expect(out.warnings.join(' ')).toMatch(/openAfterWave/);
    }
  });

  it('un genre de porte inconnu devient « porte » ; opens est filtré', () => {
    const out = parseZones({ zones: raw.zones, doors: [{ id: 'p', kind: 'trappe', openAfterWave: 3, opens: ['aile', 4, null], opening: raw.doors[0].opening }] });
    expect(out.doors[0]).toMatchObject({ kind: 'porte', opens: ['aile'], planned: false });
  });

  it('une ouverture en diagonale ou absente est signalée pour une porte non planned', () => {
    const out = parseZones({ zones: raw.zones, doors: [{ id: 'p', openAfterWave: 3, opens: ['aile'], opening: { x1: 0, y1: 0, x2: 5, y2: 5 } }] });
    expect(out.doors[0].opening).toBeNull();
    expect(out.warnings.join(' ')).toMatch(/ouverture invalide/);
  });

  it('aucune zone ouverte au départ : avertissement', () => {
    const out = parseZones({ zones: [{ id: 'a', openAtStart: false, region: [[0, 0], [1, 0], [1, 1]] }], doors: [] });
    expect(out.warnings.join(' ')).toMatch(/aucune zone ouverte/);
  });
});

describe('zones : régions et répartition des fenêtres', () => {
  it('F4 à F8 sont dans « depart », F1 à F3 dans « aile »', () => {
    expect(assignment).toEqual({ F1: 'aile', F2: 'aile', F3: 'aile', F4: 'depart', F5: 'depart', F6: 'depart', F7: 'depart', F8: 'depart' });
  });

  it('la même répartition se retrouve en unités du jeu, avec les entrées intérieures des fenêtres de world.json', () => {
    const worldZones = zonesToWorld(zones, world.transform);
    expect(assignWindows(worldZones, world.windows, 60)).toEqual(assignment);
  });

  it('une fenêtre hors de toute région est signalée et rattachée à « depart »', () => {
    const out = assignWindowsDetailed(zones, [{ id: 'X', side: 'nord', x: 9000, y: 9000 }, plan.windows[0]], PX);
    expect(out.map).toEqual({ X: 'depart', F1: 'aile' });
    expect(out.warnings).toHaveLength(1);
    expect(out.warnings[0]).toMatch(/X/);
  });

  it('une fenêtre avec sa propre entryInner l\'emploie (aucun calcul de côté)', () => {
    expect(assignWindows(zones, [{ id: 'W', entryInner: { x: 60, y: 100 } }, { id: 'V', entryInner: { x: 300, y: 300 } }])).toEqual({ W: 'aile', V: 'depart' });
  });

  it('les deux régions ne se recouvrent pas et recouvrent tout l\'intérieur du bâtiment', async () => {
    const { pointInPolygon } = await import('../../js/core/shape.js');
    const [a, b] = zones.zones;
    const xs = plan.contour.map((p) => p[0]);
    const ys = plan.contour.map((p) => p[1]);
    let both = 0;
    let neither = 0;
    for (let x = Math.min(...xs) + 0.5; x < Math.max(...xs); x += 1) {
      for (let y = Math.min(...ys) + 0.5; y < Math.max(...ys); y += 1) {
        if (!pointInPolygon(x, y, plan.contour)) continue;
        const ia = pointInPolygon(x, y, a.region);
        const ib = pointInPolygon(x, y, b.region);
        if (ia && ib) both += 1;
        if (!ia && !ib) neither += 1;
      }
    }
    expect([both, neither]).toEqual([0, 0]);
  });

  it('chaque point d\'apparition du décor est relié à une fenêtre répartie dans une zone', () => {
    for (const p of decor.spawnPoints) expect(assignment[p.window], p.id).toBeTypeOf('string');
  });
});

describe('zones : portes ouvertes au départ, zones et fenêtres actives', () => {
  it.each([[1, []], [5, []], [10, []], [11, ['porte-1']], [25, ['porte-1']], [40, ['porte-1']], [200, ['porte-1']]])('doorsOpenAtStart(manche %i) = %j (jamais les portes planned)', (wave, expected) => {
    expect(doorsOpenAtStart(zones, wave)).toEqual(expected);
  });

  it('doorsOpenAtStart ramène une manche invalide à 1', () => {
    for (const w of [0, -2, 2.5, NaN, 'x', null, undefined]) expect(doorsOpenAtStart(zones, w)).toEqual([]);
  });

  it('activeZones : « depart » seule, puis « depart » et « aile » une fois la porte 1 ouverte', () => {
    expect(activeZones(zones, [])).toEqual(['depart']);
    expect(activeZones(zones, ['porte-1'])).toEqual(['depart', 'aile']);
  });

  it('une porte planned ouverte n\'active rien ; une porte inconnue non plus', () => {
    expect(activeZones(zones, ['porte-2', 'porte-3', 'inconnue'])).toEqual(['depart']);
  });

  it('activeWindows : F4 à F8, puis les huit fenêtres', () => {
    expect(activeWindows(zones, assignment, [])).toEqual(['F4', 'F5', 'F6', 'F7', 'F8']);
    expect(activeWindows(zones, assignment, ['porte-1']).sort()).toEqual(ALL);
  });

  it('activeSpawnPoints : 10 points avant l\'ouverture, 16 après (deux par fenêtre)', () => {
    const before = activeSpawnPoints(zones, assignment, decor.spawnPoints, []);
    const after = activeSpawnPoints(zones, assignment, decor.spawnPoints, ['porte-1']);
    expect(before).toHaveLength(10);
    expect(after).toHaveLength(16);
    expect(before.every((p) => ['F4', 'F5', 'F6', 'F7', 'F8'].includes(p.window))).toBe(true);
    expect(before.some((p) => ['F1', 'F2', 'F3'].includes(p.window))).toBe(false);
  });

  it('un point sans fenêtre connue est écarté ; les points rendus sont des copies', () => {
    const pts = [{ id: 'a', window: 'F4', x: 1, y: 2 }, { id: 'b', fenetre: 'F5', x: 3, y: 4 }, { id: 'c', window: 'ZZ' }, { id: 'd' }, null];
    const out = activeSpawnPoints(zones, assignment, pts, []);
    expect(out.map((p) => p.id)).toEqual(['a', 'b']);
    out[0].x = 99;
    expect(pts[0].x).toBe(1);
  });
});

describe('zones : nextDoor', () => {
  it('manche 1 à 10 : la porte 1, qui s\'ouvre pour la manche 11', () => {
    for (const w of [1, 2, 9, 10]) expect(nextDoor(zones, w, [])).toEqual({ id: 'porte-1', wave: 11 });
  });

  it('porte 1 ouverte, ou manche 11 et suivantes : null (portes planned ignorées)', () => {
    expect(nextDoor(zones, 5, ['porte-1'])).toBeNull();
    expect(nextDoor(zones, 11, [])).toBeNull();
    expect(nextDoor(zones, 25, ['porte-1'])).toBeNull();
  });

  it('entrées hostiles : manche invalide = 1, jamais d\'exception', () => {
    expect(nextDoor(zones, 'x', [])).toEqual({ id: 'porte-1', wave: 11 });
    for (const bad of WEIRD) expect(() => nextDoor(bad, bad, bad)).not.toThrow();
    expect(nextDoor(null, 1, [])).toBeNull();
  });

  it('la plus proche des portes fermées passe d\'abord', () => {
    const z = parseZones({ zones: raw.zones, doors: [{ id: 'b', openAfterWave: 20, opens: ['aile'], opening: raw.doors[0].opening }, { id: 'a', openAfterWave: 5, opens: ['aile'], opening: raw.doors[0].opening }] });
    expect(nextDoor(z, 1, [])).toEqual({ id: 'a', wave: 6 });
    expect(nextDoor(z, 6, ['a'])).toEqual({ id: 'b', wave: 21 });
  });
});

describe('zones : doorRect', () => {
  const t = 40;
  it('porte 1 en unités du jeu : le segment de l\'ouverture, épaisseur du mur, débord de 4, hauteur 60', () => {
    const door = zonesToWorld(zones, world.transform).doors[0];
    expect(door.opening).toEqual({ x1: 1490, y1: 2050, x2: 1490, y2: 1965 });
    expect(doorRect(door, { wallThickness: t, wallHeight: 60 })).toEqual({ id: 'porte-1', kind: 'porte', x: 1466, y: 1961, w: 48, h: 93, hauteur: 60 });
  });

  it('ouverture horizontale : même débord', () => {
    expect(doorRect({ id: 'h', opening: { x1: 100, y1: 50, x2: 200, y2: 50 } }, { wallThickness: 20, wallHeight: 55 })).toEqual({ id: 'h', kind: 'porte', x: 96, y: 36, w: 108, h: 28, hauteur: 55 });
  });

  it('l\'ordre des extrémités ne change rien', () => {
    const a = doorRect({ id: 'p', opening: { x1: 10, y1: 80, x2: 10, y2: 20 } }, { wallThickness: t });
    const b = doorRect({ id: 'p', opening: { x1: 10, y1: 20, x2: 10, y2: 80 } }, { wallThickness: t });
    expect(a).toEqual(b);
  });

  it('sans paramètres : épaisseur 40 et hauteur 60 ; ouverture invalide : null', () => {
    expect(doorRect({ id: 'p', opening: { x1: 0, y1: 0, x2: 0, y2: 10 } })).toMatchObject({ w: 48, hauteur: 60 });
    for (const bad of [{ opening: null }, { opening: { x1: 0, y1: 0, x2: 4, y2: 4 } }, {}, null, 'x', 5]) expect(doorRect(bad, {})).toBeNull();
  });

  it('la porte recouvre toute l\'ouverture de plan.json, convertie en unités du jeu', () => {
    const open = world.openings.find((o) => o.id === 'ouverture-aile');
    const rect = doorRect(zonesToWorld(zones, world.transform).doors[0], { wallThickness: world.wallThickness, wallHeight: world.wallHeight });
    const [lo, hi] = [Math.min(open.y1, open.y2), Math.max(open.y1, open.y2)];
    expect(rect.y).toBeLessThanOrEqual(lo);
    expect(rect.y + rect.h).toBeGreaterThanOrEqual(hi);
    expect(rect.x).toBeLessThan(open.x1 - world.wallThickness / 2 + 1);
    expect(rect.x + rect.w).toBeGreaterThan(open.x1 + world.wallThickness / 2 - 1);
    expect(rect.hauteur).toBe(world.wallHeight);
  });
});

describe('zones : pureté, déterminisme, arguments gelés', () => {
  it('toutes les fonctions sont déterministes', () => {
    const run = () => [parseZones(raw), assignWindows(zones, plan.windows, PX), doorsOpenAtStart(zones, 11), activeZones(zones, ['porte-1']), activeWindows(zones, assignment, ['porte-1']), activeSpawnPoints(zones, assignment, decor.spawnPoints, ['porte-1']), nextDoor(zones, 3, []), doorRect(zonesToWorld(zones, world.transform).doors[0], { wallThickness: 40 })];
    expect(run()).toEqual(run());
  });

  it('les arguments gelés ne sont pas modifiés et rien ne lève', () => {
    const frozenRaw = deepFreeze(JSON.parse(JSON.stringify(raw)));
    const z = deepFreeze(parseZones(frozenRaw));
    const w = deepFreeze(JSON.parse(JSON.stringify(plan.windows)));
    const pts = deepFreeze(JSON.parse(JSON.stringify(decor.spawnPoints)));
    const a = deepFreeze(assignWindows(z, w, PX));
    const open = deepFreeze(['porte-1']);
    expect(() => {
      zonesToWorld(z, world.transform);
      doorsOpenAtStart(z, 11);
      activeZones(z, open);
      activeWindows(z, a, open);
      activeSpawnPoints(z, a, pts, open);
      nextDoor(z, 4, open);
      doorRect(z.doors[0], { wallThickness: 40 });
    }).not.toThrow();
    expect(frozenRaw).toEqual(raw);
  });

  it('les sorties sont de nouveaux objets (modifier une sortie ne change pas l\'entrée)', () => {
    const out = parseZones(raw);
    out.zones[0].region[0][0] = -1;
    out.doors[0].opens.push('x');
    expect(parseZones(raw).zones[0].region[0][0]).toBe(raw.zones[0].region[0][0]);
    expect(raw.doors[0].opens).toEqual(['aile']);
  });

  it.each(WEIRD)('entrées hostiles (%s) : aucune exception, résultats neutres', (bad) => {
    expect(() => {
      assignWindows(bad, bad, bad);
      assignWindowsDetailed(bad, [bad], bad);
      doorsOpenAtStart(bad, bad);
      activeZones(bad, bad);
      activeWindows(bad, bad, bad);
      activeSpawnPoints(bad, bad, bad, bad);
      zonesToWorld(bad, bad);
    }).not.toThrow();
    expect(activeZones(bad, bad)).toEqual([]);
    expect(activeWindows(bad, bad, bad)).toEqual([]);
    expect(doorsOpenAtStart(bad, 11)).toEqual([]);
  });

  it('zonesToWorld : conversion pixels -> unités (5 par pixel, marge 800) et transformation invalide sans exception', () => {
    const w = zonesToWorld(zones, world.transform);
    expect(w.zones[0].region[0]).toEqual([138 * 5 + 800, 208 * 5 + 800]);
    expect(w.doors[1].opening).toBeNull();
    expect(() => zonesToWorld(zones, null)).not.toThrow();
  });
});
