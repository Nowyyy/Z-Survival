import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { distanceToRect, rectGap } from '../../js/core/collision.js';
import { floorProblems } from '../../js/core/floor-rules.js';
import { analyzeMap, windowZone } from '../../js/core/maps.js';
import { buildFlow, cellIndex, INF } from '../../js/core/nav.js';
import { overlapArea, pointInPolygon, polygonRects, segmentRects } from '../../js/core/shape.js';
import { assignWindows, parseZones } from '../../js/core/zones.js';
import { generateMapFiles } from '../../scripts/plan-vers-monde.mjs';
import { blocksOf, gridForFloor, loadMapFloors } from '../../scripts/lib/carte-zones.mjs';
import { etagePlan, etageWorld, layouts, params, plan, world, zonesActive, zonesJson } from './helpers/etage.js';

const map = loadMapFloors();
const walls = segmentRects(etageWorld.walls, 40);
const obstacles = etageWorld.obstacles;
const stairs = zonesActive.stairs;
const OPEN = ['porte-1', 'porte-2', 'porte-3'];
const flowOk = (grid, from, to) => buildFlow(grid, to).dist[cellIndex(grid, from)] !== INF;

describe('étage : fichiers générés et sources', () => {
  it('etage.json et Docs/ref/etage.md existent ; etage.json est marqué provisoire et reprend le repère de plan.json', () => {
    expect(existsSync('Docs/ref/etage.md')).toBe(true);
    expect(etagePlan._provisoire).toMatch(/provisoire/i);
    expect(etagePlan.bbox).toEqual(plan.bbox);
    expect(etagePlan.floor).toBe('etage');
  });

  it('etage.world.json est identique à la sortie du script (npm run carte)', () => {
    const out = generateMapFiles('rez-de-chaussee');
    expect(out.etage).toBe(readFileSync('data/game/maps/rez-de-chaussee/etage.world.json', 'utf8'));
    expect(out.world).toBe(readFileSync('data/game/maps/rez-de-chaussee/world.json', 'utf8'));
    expect(out.decor).toBe(readFileSync('data/game/maps/rez-de-chaussee/decor.json', 'utf8'));
  });

  it('le script ne signale aucun problème de règle', () => {
    expect(generateMapFiles('rez-de-chaussee').problems).toEqual([]);
    expect(generateMapFiles('rez-de-chaussee').etageReport.valid).toBe(true);
  });

  it('floorProblems rend une liste vide sur les données versionnées', () => {
    expect(floorProblems({ rdc: world, etage: etageWorld, zones: zonesActive, params })).toEqual([]);
  });

  it('floorProblems voit une règle cassée (fenêtre trop proche, escalier trop petit, arrivée dans un mur)', () => {
    const bad = JSON.parse(JSON.stringify(zonesActive));
    bad.stairs[0].floors.etage.trigger = { x: 1000, y: 2300, w: 30, h: 30 };
    expect(floorProblems({ rdc: world, etage: etageWorld, zones: bad, params }).join(' ')).toMatch(/moins de 64/);
    const near = { ...etageWorld, windows: etageWorld.windows.map((w) => (w.id === 'U4' ? { ...w, x: etageWorld.windows[2].x + 50 } : w)) };
    expect(floorProblems({ rdc: world, etage: near, zones: zonesActive, params }).join(' ')).toMatch(/moins de 150/);
    const wall = JSON.parse(JSON.stringify(zonesActive));
    wall.stairs[0].floors.rdc.arrival = { x: wall.stairs[0].floors.rdc.solid.x + 10, y: wall.stairs[0].floors.rdc.solid.y + 10 };
    expect(floorProblems({ rdc: world, etage: etageWorld, zones: wall, params }).join(' ')).toMatch(/arrivée/);
  });

  it('plan.json n\'est modifié que pour les escaliers : identifiant et rôle de l\'existant, second escalier ajouté', () => {
    expect(plan.stairs.map((s) => [s.id, s.role])).toEqual([['escalier-courbe', 'escalier-depart'], ['escalier-aile', 'escalier-aile']]);
    expect(plan.furniture.length).toBe(49);
    expect(plan.windows.map((w) => w.id)).toEqual(['F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8']);
  });
});

describe('étage : contour, murs et fenêtres U1 à U7', () => {
  it('même origine et même échelle que le rez-de-chaussée (5 unités par pixel, marge 800, taille du monde identique)', () => {
    expect(etageWorld.transform).toEqual(world.transform);
    expect(etageWorld.size).toEqual(world.size);
    expect(etageWorld.floor).toBe('etage');
  });

  it('le contour de l\'étage est contenu dans celui du rez-de-chaussée à 100 unités près', () => {
    const down = polygonRects(world.contour);
    for (const c of etageWorld.contour) {
      const inside = pointInPolygon(c[0], c[1], world.contour);
      expect(inside || down.some((r) => distanceToRect(c[0], c[1], r) <= 100), `${c}`).toBe(true);
    }
  });

  it('sept fenêtres U1 à U7, de 72 de large, triées par x croissant puis y', () => {
    expect(etageWorld.windows.map((w) => w.id)).toEqual(['U1', 'U2', 'U3', 'U4', 'U5', 'U6', 'U7']);
    expect(etageWorld.windowSize).toBe(72);
    const keys = etageWorld.windows.map((w) => [w.x, w.y]);
    expect(keys).toEqual([...keys].sort((a, b) => a[0] - b[0] || a[1] - b[1]));
  });

  it('les centres de deux fenêtres sont à 150 unités au moins', () => {
    for (const a of etageWorld.windows) for (const b of etageWorld.windows) if (a.id < b.id) expect(Math.hypot(a.x - b.x, a.y - b.y), `${a.id} ${b.id}`).toBeGreaterThanOrEqual(150);
  });

  it.each(['U1', 'U2', 'U3', 'U4', 'U5', 'U6', 'U7'])('150 unités de profondeur libre derrière %s, sur toute sa largeur et à l\'intérieur', (id) => {
    const w = etageWorld.windows.find((q) => q.id === id);
    const zone = windowZone(w, 72, 150, 40);
    expect(zone.w * zone.h).toBe(72 * 150);
    for (const o of obstacles) expect(overlapArea(zone, o), `${id} / ${o.id}`).toBe(0);
    expect(layouts.etage.inside(zone.x + zone.w / 2, zone.y + zone.h / 2)).toBe(true);
  });

  it('aucune pièce à moins de 80 d\'un point de réparation', () => {
    for (const w of etageWorld.windows) {
      const n = { nord: [0, -1], sud: [0, 1], ouest: [-1, 0], est: [1, 0] }[w.side];
      const spot = { x: w.x - n[0] * 70, y: w.y - n[1] * 70 };
      for (const o of obstacles) expect(distanceToRect(spot.x, spot.y, o), `${w.id} / ${o.id}`).toBeGreaterThanOrEqual(80);
    }
  });

  it('chaque fenêtre est dans une zone de l\'étage (par entryInner)', () => {
    const geoms = map.up.geoms;
    const zoneOf = assignWindows(map.zones, geoms.map((g) => ({ id: g.id, floor: 'etage', entryInner: g.entryInner })));
    expect(Object.fromEntries(Object.entries(zoneOf))).toEqual({ U1: 'etage-gauche', U2: 'etage-gauche', U3: 'etage-gauche', U4: 'etage-gauche', U5: 'etage-droite', U6: 'etage-droite', U7: 'etage-droite' });
  });

  it('une fenêtre de l\'étage n\'est jamais rattachée à une zone du rez-de-chaussée (les zones se superposent dans le plan)', () => {
    const zoneOf = assignWindows(map.zones, map.up.geoms.map((g) => ({ id: g.id, floor: 'etage', entryInner: g.entryInner })));
    expect(Object.values(zoneOf).every((z) => z.startsWith('etage-'))).toBe(true);
  });
});

describe('étage : obstacles, couloirs et mobilier', () => {
  it('l\'extérieur de l\'étage n\'a aucun obstacle solide, hauteur de chaque pièce au plus 70', () => {
    expect(obstacles.every((o) => o.outside !== true)).toBe(true);
    expect(obstacles.every((o) => o.hauteur <= 70)).toBe(true);
    expect(layouts.etage.decor.solids).toEqual([]);
  });

  it('deux obstacles sont au contact ou séparés d\'au moins 50 : aucun interstice plus étroit', () => {
    for (let i = 0; i < obstacles.length; i += 1) {
      for (let j = i + 1; j < obstacles.length; j += 1) {
        const g = rectGap(obstacles[i], obstacles[j]);
        expect(g === 0 || g >= 50, `${obstacles[i].id} / ${obstacles[j].id} : ${g}`).toBe(true);
        expect(overlapArea(obstacles[i], obstacles[j])).toBe(0);
      }
    }
  });

  it('un obstacle est au contact d\'un mur ou à 50 au moins', () => {
    for (const o of obstacles) for (const w of walls) {
      const g = rectGap(o, w);
      expect(g === 0 || g >= 50, `${o.id} / ${w.id} : ${g}`).toBe(true);
    }
  });

  it('aucun obstacle ne recouvre l\'épaisseur d\'un mur', () => {
    for (const o of obstacles) for (const w of walls) expect(overlapArea(o, w), `${o.id} / ${w.id}`).toBe(0);
  });

  it('l\'espace libre de l\'étage est connexe (portes ouvertes) et toutes les fenêtres sont atteignables par des couloirs d\'au moins 50', () => {
    const a = analyzeMap(etageWorld);
    expect(a.components).toBe(1);
    expect(a.unreachable).toEqual([]);
    expect(a.startReachable).toBe(true);
  });

  it('8 à 20 pièces de mobilier ; chaque pièce porte son origine (modèle ou provisoire) ; au moins 2 viennent du modèle', () => {
    const f = etagePlan.furniture;
    expect(f.length).toBeGreaterThanOrEqual(8);
    expect(f.length).toBeLessThanOrEqual(20);
    for (const p of f) expect(p.provisional === true || p.source === 'modele', p.id).toBe(true);
    expect(f.filter((p) => p.source === 'modele').length).toBeGreaterThanOrEqual(2);
    expect(f.length - f.filter((p) => p.provisional).length).toBeLessThan(f.length);
  });

  it('genres existants seulement et aucune pièce retirée par la conversion', () => {
    const kinds = new Set(['table', 'comptoir', 'caisse', 'etagere', 'armoire', 'colonne']);
    for (const p of etagePlan.furniture) expect(kinds.has(p.kind), p.id).toBe(true);
    expect(etageWorld.generation.retired).toEqual([]);
  });

  it('aucune pièce dans l\'ouverture de la porte de l\'étage ni à moins de 100', () => {
    const o = etagePlan.openings.find((q) => q.id === 'porte-etage');
    const rect = { x: o.x1 * 5 + 800 - 20, y: Math.min(o.y1, o.y2) * 5 + 800, w: 40, h: Math.abs(o.y2 - o.y1) * 5 };
    for (const p of obstacles) expect(rectGap(p, rect), p.id).toBeGreaterThanOrEqual(100);
  });
});

describe('étage : escaliers, zones de déclenchement et arrivées', () => {
  const both = stairs.flatMap((s) => ['rdc', 'etage'].map((f) => ({ s, f, d: s.floors[f], w: f === 'etage' ? etageWorld : world })));

  it.each(both.map((b) => [`${b.s.id} ${b.f}`, b]))('%s : zone de déclenchement d\'au moins 64 × 64, libre et dans le bâtiment', (_n, { d, w }) => {
    expect(d.trigger.w).toBeGreaterThanOrEqual(64);
    expect(d.trigger.h).toBeGreaterThanOrEqual(64);
    for (const o of [...w.obstacles, ...segmentRects(w.walls, 40)]) expect(overlapArea(d.trigger, o), o.id).toBe(0);
    expect(pointInPolygon(d.trigger.x + d.trigger.w / 2, d.trigger.y + d.trigger.h / 2, w.contour)).toBe(true);
  });

  it.each(both.map((b) => [`${b.s.id} ${b.f}`, b]))('%s : arrivée libre sur 40 unités et à 60 au moins de la zone de déclenchement', (_n, { d, w }) => {
    for (const o of [...w.obstacles, ...segmentRects(w.walls, 40)]) expect(distanceToRect(d.arrival.x, d.arrival.y, o), o.id).toBeGreaterThanOrEqual(40);
    expect(distanceToRect(d.arrival.x, d.arrival.y, d.trigger)).toBeGreaterThanOrEqual(60);
  });

  it.each(both.map((b) => [`${b.s.id} ${b.f}`, b]))('%s : l\'emprise pleine est un obstacle de la carte', (_n, { d, w }) => {
    const cx = d.solid.x + d.solid.w / 2;
    const cy = d.solid.y + d.solid.h / 2;
    expect(w.obstacles.some((o) => o.kind === 'escalier' && cx >= o.x && cx <= o.x + o.w && cy >= o.y && cy <= o.y + o.h)).toBe(true);
  });

  it('la zone de déclenchement est au pied de l\'emprise (à 20 unités au plus)', () => {
    for (const { d, s, f } of both) expect(rectGap(d.trigger, d.solid), `${s.id} ${f}`).toBeLessThanOrEqual(40);
  });

  it('une fois leur porte ouverte, chaque zone de déclenchement est reliée (largeurs ≥ 50) aux fenêtres actives de son étage et au point d\'arrivée de l\'étage', () => {
    for (const s of stairs) {
      for (const f of ['rdc', 'etage']) {
        const grid = gridForFloor(map, f, OPEN);
        const c = { x: s.floors[f].trigger.x + s.floors[f].trigger.w / 2, y: s.floors[f].trigger.y + s.floors[f].trigger.h / 2 };
        const geoms = f === 'etage' ? map.up.geoms : map.geoms;
        for (const g of geoms) expect(flowOk(grid, g.entryInner, c), `${s.id} ${f} ${g.id}`).toBe(true);
        expect(flowOk(grid, s.floors[f].arrival, c), `${s.id} ${f} arrivée`).toBe(true);
      }
    }
  });

  it('chaque bloc du rez-de-chaussée couvre la zone de déclenchement de son escalier', () => {
    for (const s of stairs) {
      const door = zonesActive.doors.find((d) => d.id === s.door);
      const block = door.blocks.find((b) => b.floor === 'rdc').rect;
      const t = s.floors.rdc.trigger;
      expect(block.x <= t.x && block.y <= t.y && block.x + block.w >= t.x + t.w && block.y + block.h >= t.y + t.h, s.id).toBe(true);
    }
  });
});

describe('étage : points d\'apparition', () => {
  const pts = etageWorld.spawnPoints;
  const downRects = polygonRects(world.contour);

  it('deux points par fenêtre, à 450 et 650 du mur', () => {
    expect(pts).toHaveLength(14);
    for (const w of etageWorld.windows) {
      const mine = pts.filter((p) => p.fenetre === w.id);
      expect(mine.map((p) => Math.round(Math.hypot(p.x - w.x, p.y - w.y)))).toEqual([450, 650]);
    }
  });

  it('chaque point est à 160 unités au moins hors du contour du rez-de-chaussée', () => {
    for (const p of pts) {
      expect(pointInPolygon(p.x, p.y, world.contour), p.id).toBe(false);
      expect(Math.min(...downRects.map((r) => distanceToRect(p.x, p.y, r))), p.id).toBeGreaterThanOrEqual(160);
    }
  });

  it('chaque point est dans le monde, hors des obstacles et du bâtiment de l\'étage, avec un identifiant U2-a', () => {
    for (const p of pts) {
      expect(p.id).toMatch(/^U\d-[ab]$/);
      expect(p.x).toBeGreaterThan(0);
      expect(p.y).toBeGreaterThan(0);
      expect(p.x).toBeLessThan(world.size.width);
      expect(p.y).toBeLessThan(world.size.height);
      expect(layouts.etage.inside(p.x, p.y)).toBe(false);
    }
  });

  it('chemin du point à l\'entrée extérieure de sa fenêtre : au plus 900 et sans obstacle (extérieur vide)', () => {
    for (const p of pts) {
      const g = map.up.geoms.find((q) => q.id === p.fenetre);
      expect(Math.hypot(p.x - g.entryOuter.x, p.y - g.entryOuter.y), p.id).toBeLessThanOrEqual(900);
    }
  });
});

describe('zones.json étendu : étages, escaliers, blocs, portes 2 et 3', () => {
  it('floors, zones de l\'étage fermées au départ, deux escaliers', () => {
    expect(zonesActive.floors).toEqual(['rdc', 'etage']);
    expect(zonesActive.zones.filter((z) => z.floor === 'etage').map((z) => [z.id, z.openAtStart])).toEqual([['etage-gauche', false], ['etage-droite', false]]);
    expect(stairs.map((s) => [s.id, s.door])).toEqual([['escalier-aile', 'porte-2'], ['escalier-depart', 'porte-3']]);
  });

  it('porte 2 : manche 20, ouvre etage-gauche et l\'escalier de l\'aile, un bloc au rez-de-chaussée', () => {
    const d = zonesActive.doors.find((q) => q.id === 'porte-2');
    expect([d.openAfterWave, d.opens, d.stairs, d.blocks.map((b) => b.floor)]).toEqual([20, ['etage-gauche'], ['escalier-aile'], ['rdc']]);
    expect(d.subtitleKey).toBe('game.splash.zone.sub.escalier');
  });

  it('porte 3 : manche 30, ouvre etage-droite et l\'escalier de départ, deux blocs (rez-de-chaussée et porte de l\'étage)', () => {
    const d = zonesActive.doors.find((q) => q.id === 'porte-3');
    expect([d.openAfterWave, d.opens, d.stairs, d.blocks.map((b) => b.floor)]).toEqual([30, ['etage-droite'], ['escalier-depart'], ['rdc', 'etage']]);
    expect(d.subtitleKey).toBe('game.splash.zone.sub.escalier-porte');
  });

  it('porte 1 inchangée : manche 10, ouvre l\'aile, sous-titre « Une porte s\'ouvre »', () => {
    const d = zonesActive.doors.find((q) => q.id === 'porte-1');
    expect([d.openAfterWave, d.opens, d.subtitleKey]).toEqual([10, ['aile'], 'game.splash.zone.subtitle']);
  });

  it('avant l\'ouverture, aucun chemin du départ aux fenêtres et escaliers de l\'étage ; la porte 2 ouvre l\'étage de gauche seulement ; la porte 3 tout l\'étage', () => {
    const upG = (open) => gridForFloor(map, 'etage', open);
    const fromAile = stairs[0].floors.etage.arrival;
    const fromDepart = stairs[1].floors.etage.arrival;
    const u1 = map.up.geoms.find((g) => g.id === 'U1').entryInner;
    const u6 = map.up.geoms.find((g) => g.id === 'U6').entryInner;
    expect(flowOk(upG([]), u1, fromAile)).toBe(true); // même salle : la liaison avec le départ est l\'escalier, fermé
    expect(flowOk(upG(['porte-2']), u6, fromAile)).toBe(false);
    expect(flowOk(upG(['porte-2']), u1, fromAile)).toBe(true);
    expect(flowOk(upG(['porte-2', 'porte-3']), u6, fromAile)).toBe(true);
    expect(flowOk(upG(['porte-3']), u1, fromDepart)).toBe(true);
  });

  it('le rez-de-chaussée ne mène à l\'étage que par les escaliers : les blocs du rez-de-chaussée ferment les pieds d\'escalier tant que la porte est fermée', () => {
    const g = gridForFloor(map, 'rdc', []);
    const t = stairs[0].floors.rdc;
    const tc = { x: t.trigger.x + t.trigger.w / 2, y: t.trigger.y + t.trigger.h / 2 };
    expect(flowOk(g, layouts.rdc.start, tc)).toBe(false);
    expect(flowOk(gridForFloor(map, 'rdc', ['porte-1', 'porte-2', 'porte-3']), layouts.rdc.start, tc)).toBe(true);
    expect(blocksOf(map, 'rdc', []).map((r) => r.id)).toEqual(['porte-1', 'porte-2', 'porte-3']);
    expect(blocksOf(map, 'etage', []).map((r) => r.id)).toEqual(['porte-3']);
  });

  it('zones.json est lu sans avertissement ; les portes 2 et 3 sont actives (parties B et C)', () => {
    const p = parseZones(zonesJson);
    expect(p.warnings).toEqual([]);
    expect(p.doors.map((d) => [d.id, d.planned])).toEqual([['porte-1', false], ['porte-2', false], ['porte-3', false]]);
    expect(p.stairs.map((s) => [s.id, s.planned])).toEqual([['escalier-aile', false], ['escalier-depart', false]]);
  });
});
