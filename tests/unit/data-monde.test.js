import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { circleOverlapsRect, distanceToRect, rectGap } from '../../js/core/collision.js';
import { approachCorridors, decorProblems, generateDecor } from '../../js/core/decor.js';
import { buildLayout, entryWindow, wallRects } from '../../js/core/layout.js';
import { moveCircle } from '../../js/core/movement.js';
import { buildFlow, createGrid, flowPath, pathLength } from '../../js/core/nav.js';
import { decorCfg, deepFreeze, gridOf, layout, load, navCfg, world, WEIRD } from './helpers/monde.js';

const room = world.room;
const bounds = layout.bounds;
const furniture = world.obstacles;
const KINDS = ['table', 'comptoir', 'caisse', 'armoire', 'colonne', 'etagere'];
const HEIGHTS = { table: 40, comptoir: 55, caisse: 45, armoire: 70, colonne: 70, etagere: 70 };
const wallRectsOf = [
  { x: bounds.minX - 1000, y: bounds.minY - 1000, w: 1000, h: 5000 }, { x: bounds.maxX, y: bounds.minY - 1000, w: 1000, h: 5000 },
  { x: bounds.minX - 1000, y: bounds.minY - 1000, w: 5000, h: 1000 }, { x: bounds.minX - 1000, y: bounds.maxY, w: 5000, h: 1000 },
];

describe('world.json : cohérence', () => {
  it('est marqué provisoire, 3600 × 2800 = salle 2000 × 1200 + marge de 800, murs de 40 sur 60 (render.json)', () => {
    expect(world._provisoire).toBeTruthy();
    expect(world.size).toEqual({ width: 3600, height: 2800 });
    expect(world.size.width).toBe(room.width + 2 * world.margin);
    expect(world.size.height).toBe(room.height + 2 * world.margin);
    expect(room.wall).toBe(24);
    const render = load('render');
    expect([world.wallThickness, world.wallHeight]).toEqual([render.wallThickness, render.wallHeight]);
  });

  it('a trois fenêtres de 140 aux identifiants stables, mêmes emplacements qu\'au lot 1m (nord au milieu, ouest et est à mi-hauteur)', () => {
    expect(world.windows.map((w) => w.id)).toEqual(['fenetre-nord', 'fenetre-ouest', 'fenetre-est']);
    expect(world.windowSize).toBe(140);
    const [n, o, e] = world.windows;
    expect([n.x - room.x, n.y - room.y]).toEqual([1000, 12]);
    expect([o.x - room.x, o.y - room.y]).toEqual([12, 600]);
    expect([e.x - room.x, e.y - room.y]).toEqual([1988, 600]);
  });

  it('a au moins 10 meubles, sans chevauchement, de types connus, de 70 de haut au plus et aux hauteurs prévues', () => {
    expect(furniture.length).toBeGreaterThanOrEqual(10);
    expect(new Set(furniture.map((o) => o.id)).size).toBe(furniture.length);
    for (const o of furniture) {
      expect(KINDS, o.id).toContain(o.kind);
      expect(o.hauteur, o.id).toBeLessThanOrEqual(world.maxHeight);
      expect(o.hauteur, o.id).toBe(HEIGHTS[o.kind]);
    }
    for (let i = 0; i < furniture.length; i += 1) {
      for (let j = i + 1; j < furniture.length; j += 1) expect(rectGap(furniture[i], furniture[j]), `${furniture[i].id} / ${furniture[j].id}`).toBeGreaterThan(0);
    }
  });

  it('laisse des couloirs d\'au moins 90 entre meubles et entre meubles et murs', () => {
    for (let i = 0; i < furniture.length; i += 1) {
      for (let j = i + 1; j < furniture.length; j += 1) expect(rectGap(furniture[i], furniture[j]), `${furniture[i].id} / ${furniture[j].id}`).toBeGreaterThanOrEqual(world.minCorridor);
      for (const wall of wallRectsOf) expect(rectGap(furniture[i], wall), `${furniture[i].id} / mur`).toBeGreaterThanOrEqual(world.minCorridor);
    }
  });

  it('garde la zone de départ du joueur libre sur 150 de rayon', () => {
    for (const o of furniture) expect(distanceToRect(layout.start.x, layout.start.y, o), o.id).toBeGreaterThanOrEqual(world.startZone);
    expect(layout.start).toEqual({ x: 1800, y: 1400 });
  });

  it('garde 150 de profondeur libre derrière chaque fenêtre, côté intérieur', () => {
    const half = world.windowSize / 2;
    const zones = [
      { x: world.windows[0].x - half, y: bounds.minY, w: world.windowSize, h: world.windowDepth },
      { x: bounds.minX, y: world.windows[1].y - half, w: world.windowDepth, h: world.windowSize },
      { x: bounds.maxX - world.windowDepth, y: world.windows[2].y - half, w: world.windowDepth, h: world.windowSize },
    ];
    for (const z of zones) for (const o of furniture) expect(rectGap(o, z), o.id).toBeGreaterThan(0);
  });

  it('forme un espace libre connexe : toute cellule libre de la salle est atteignable depuis le départ', () => {
    const g = createGrid(layout.size, [...furniture, ...wallRectsOf.map((w) => ({ ...w }))], { cell: 20, radius: 18, inflate: 0 });
    const f = buildFlow(g, layout.start);
    let free = 0;
    let reached = 0;
    for (let row = 0; row < g.rows; row += 1) {
      for (let col = 0; col < g.cols; col += 1) {
        const i = row * g.cols + col;
        const x = (col + 0.5) * 20;
        const y = (row + 0.5) * 20;
        if (x < bounds.minX || x > bounds.maxX || y < bounds.minY || y > bounds.maxY || g.blocked[i]) continue;
        free += 1;
        if (f.dist[i] !== 0x7fffffff) reached += 1;
      }
    }
    expect(free).toBeGreaterThan(4000);
    expect(reached).toBe(free);
  });

  it('offre au moins deux itinéraires différents de chaque fenêtre au centre : le milieu du plus court est bouché, un autre existe', () => {
    const g = gridOf();
    const f = buildFlow(g, layout.start);
    for (const w of layout.windows) {
      const inside = { x: w.side === 'nord' ? w.x : w.side === 'ouest' ? bounds.minX + 40 : bounds.maxX - 40, y: w.side === 'nord' ? bounds.minY + 40 : w.y };
      const path = flowPath(g, f, inside);
      expect(path.length, w.id).toBeGreaterThan(10);
      const mid = path[Math.floor(path.length / 2)];
      const plug = { id: 'bouchon', x: mid.x - 50, y: mid.y - 50, w: 100, h: 100 };
      const g2 = gridOf([...layout.zombieObstacles, plug]);
      const second = flowPath(g2, buildFlow(g2, layout.start), inside);
      expect(second.length, `${w.id} : second itinéraire`).toBeGreaterThan(10);
      expect(second.some((p) => Math.hypot(p.x - mid.x, p.y - mid.y) < 60), `${w.id} : évite le bouchon`).toBe(false);
    }
  });

  it('les barrières ferment les fenêtres au joueur seulement : il ne passe pas, un zombie oui', () => {
    expect(world.playerBarriers.map((b) => b.fenetre)).toEqual(world.windows.map((w) => w.id));
    for (const w of layout.windows) {
      const dir = { nord: { x: 0, y: -1 }, ouest: { x: -1, y: 0 }, est: { x: 1, y: 0 } }[w.side];
      let c = { x: w.side === 'nord' ? w.x : w.side === 'ouest' ? bounds.minX + 200 : bounds.maxX - 200, y: w.side === 'nord' ? bounds.minY + 200 : w.y, r: 18 };
      for (let i = 0; i < 100; i += 1) c = { ...c, ...moveCircle(c, dir, 220, 0.05, room, layout.playerObstacles) };
      const out = w.side === 'nord' ? c.y < bounds.minY : w.side === 'ouest' ? c.x < bounds.minX : c.x > bounds.maxX;
      expect(out, `${w.id} : le joueur est resté dedans`).toBe(false);
    }
    // Un zombie dehors atteint le joueur par les ouvertures : le chemin existe depuis chaque point d'apparition.
    const g = gridOf();
    const f = buildFlow(g, layout.start);
    for (const p of layout.spawnPoints) expect(Number.isFinite(pathLength(g, f, p)), p.id).toBe(true);
  });

  it('les murs ont une ouverture de 140 à chaque fenêtre, que les zombies franchissent', () => {
    const walls = wallRects(room, layout.windows, 140, 40);
    for (const w of layout.windows) {
      const probe = { x: w.x - 1, y: w.y - 1, w: 2, h: 2 };
      expect(walls.some((r) => rectGap(r, probe) === 0), w.id).toBe(false);
    }
    expect(walls.length).toBe(7);
    const g = gridOf();
    const f = buildFlow(g, { x: layout.windows[0].x, y: layout.windows[0].y + 100 });
    expect(Number.isFinite(pathLength(g, f, { x: layout.windows[0].x, y: layout.windows[0].y - 200 }))).toBe(true);
  });

  it('?empty=1 : la salle du lot 1m seule (mêmes coordonnées), sans meuble, sans mur plein ni décor', () => {
    const e = buildLayout(world, decorCfg, { empty: true });
    expect([e.room.width, e.room.height, e.room.wall]).toEqual([1600, 900, 24]);
    expect(e.windows.map((w) => [w.x, w.y])).toEqual([[12, 450], [800, 12], [1588, 450]]);
    expect(e.windowSize).toBe(120);
    expect([e.furniture, e.walls, e.zombieObstacles, e.playerObstacles]).toEqual([[], [], [], []]);
    expect(e.decor).toBeNull();
    expect(e.start).toEqual({ x: 800, y: 450 });
  });

  it('arguments gelés non modifiés, entrées inattendues sans exception', () => {
    const w = deepFreeze(JSON.parse(JSON.stringify(world)));
    const d = deepFreeze(JSON.parse(JSON.stringify(decorCfg)));
    expect(buildLayout(w, d).size).toEqual({ width: 3600, height: 2800 });
    for (const v of WEIRD) {
      expect(() => buildLayout(v, v)).not.toThrow();
      expect(() => buildLayout(v, v, { empty: true })).not.toThrow();
      expect(() => generateDecor(v, v)).not.toThrow();
      expect(() => approachCorridors(v, v)).not.toThrow();
      expect(() => decorProblems(v, v)).not.toThrow();
      expect(() => wallRects(v, v, v, v)).not.toThrow();
    }
  });
});

describe('decor.json : cohérence', () => {
  const decor = layout.decor;
  it('est marqué provisoire et déterministe : même graine, même décor ; autre graine, autre décor', () => {
    expect(decorCfg._provisoire).toBeTruthy();
    expect(generateDecor(decorCfg, world)).toEqual(generateDecor(decorCfg, world));
    expect(generateDecor({ ...decorCfg, seed: decorCfg.seed + 1 }, world).trees).not.toEqual(decor.trees);
  });

  it('a le contenu prévu : voitures de 55 de haut, arbres, buissons, lampadaires, barrières', () => {
    expect(decor.cars.length).toBeGreaterThanOrEqual(4);
    for (const c of decor.cars) expect(c.hauteur).toBe(55);
    expect(decor.trees.length).toBeGreaterThanOrEqual(20);
    expect(decor.bushes.length).toBeGreaterThanOrEqual(10);
    expect(decor.lamps.length).toBeGreaterThanOrEqual(4);
    expect(decor.fences.length).toBeGreaterThanOrEqual(4);
    expect(decor.solids.length).toBe(decor.cars.length + decor.trees.length);
    expect(decor.ground.map((g) => g.kind)).toEqual(expect.arrayContaining(['route', 'trottoir', 'sentier']));
  });

  it('laisse les couloirs d\'approche de 160 de large sans aucun décor (sol seulement)', () => {
    expect(decor.corridors).toHaveLength(3);
    for (const c of decor.corridors) expect(c.w === 160 || c.h === 160, c.id).toBe(true);
    expect(decorProblems(decor, world)).toEqual([]);
    for (const c of decor.corridors) {
      for (const o of [...decor.solids, ...decor.fences]) expect(rectGap(o, c), `${o.id} / ${c.id}`).toBeGreaterThan(0);
      for (const b of decor.bushes) expect(rectGap({ x: b.x - b.r, y: b.y - b.r, w: 2 * b.r, h: 2 * b.r }, c), `${b.id} / ${c.id}`).toBeGreaterThan(0);
    }
  });

  it('a 12 points d\'apparition, 4 par fenêtre, hors de la salle, à 350 à 800 des murs', () => {
    expect(decor.spawnPoints).toHaveLength(12);
    for (const w of world.windows) expect(decor.spawnPoints.filter((p) => p.fenetre === w.id)).toHaveLength(4);
    for (const p of decor.spawnPoints) {
      const d = rectGap({ x: p.x, y: p.y, w: 0.001, h: 0.001 }, { x: room.x, y: room.y, w: room.width, h: room.height });
      expect(d, p.id).toBeGreaterThanOrEqual(350);
      expect(d, p.id).toBeLessThanOrEqual(800);
    }
    expect(new Set(decor.spawnPoints.map((p) => p.id)).size).toBe(12);
  });

  it('chaque point d\'apparition atteint sa fenêtre en 900 unités au plus (chemin de nav.js)', () => {
    const g = gridOf();
    for (const w of layout.windows) {
      const f = buildFlow(g, { x: w.x, y: w.y });
      for (const p of decor.spawnPoints.filter((s) => s.fenetre === w.id)) expect(pathLength(g, f, p), p.id).toBeLessThanOrEqual(900);
    }
  });

  it('place les points dans le couloir d\'approche ou tout près (à 100 au plus)', () => {
    for (const p of decor.spawnPoints) {
      const c = decor.corridors.find((k) => k.id === p.fenetre);
      expect(rectGap({ x: p.x, y: p.y, w: 0.001, h: 0.001 }, c), p.id).toBeLessThanOrEqual(100);
    }
  });

  it('aucun obstacle plein sur un point d\'apparition, dans la salle ou hors du monde', () => {
    for (const o of decor.solids) {
      expect(rectGap(o, { x: room.x, y: room.y, w: room.width, h: room.height }), o.id).toBeGreaterThan(0);
      for (const p of decor.spawnPoints) expect(circleOverlapsRect({ x: p.x, y: p.y, r: 20 }, o), `${o.id} / ${p.id}`).toBe(false);
    }
  });

  it('nav.json et enemies.json portent les valeurs prévues', () => {
    expect(navCfg).toMatchObject({ cell: 20, inflate: 4, recompute: 0.25, stuckDistance: 5, stuckTime: 2 });
    expect(JSON.parse(readFileSync('data/game/camera.json', 'utf8'))).toMatchObject({ smoothing: 0.12, deadZone: 0, zoom: 2 });
    expect(load('enemies').zombie).toMatchObject({ viewMargin: 150, viewRatio: 0.25 });
  });
});

describe('layout.js : fenêtre d\'entrée', () => {
  it('donne la fenêtre la plus proche de la position où le zombie franchit la limite de la salle', () => {
    expect(entryWindow({ x: 1800, y: 840 }, layout.windows)).toBe('fenetre-nord');
    expect(entryWindow({ x: 830, y: 1380 }, layout.windows)).toBe('fenetre-ouest');
    expect(entryWindow({ x: 2770, y: 1420 }, layout.windows)).toBe('fenetre-est');
  });

  it('renvoie null sans fenêtre et ne lève pas d\'exception sur des types inattendus', () => {
    expect(entryWindow({ x: 1, y: 1 }, [])).toBeNull();
    for (const v of WEIRD) expect(() => entryWindow(v, v)).not.toThrow();
  });
});
