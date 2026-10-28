import { describe, it, expect } from 'vitest';
import { rectGap } from '../../js/core/collision.js';
import { buildFlow, buildWindowField, createGrid, INF, pathLength, stepFlow } from '../../js/core/nav.js';
import { analyzeMap, windowZone } from '../../js/core/maps.js';
import { plankCorners, plankPoses, plankSettings, wallGap } from '../../js/core/plank-layout.js';
import { decorProblems } from '../../js/core/decor.js';
import { overlapArea, segmentRects } from '../../js/core/shape.js';
import { windowGeometry } from '../../js/core/windows.js';
import { closedGrid, decorCfg, fields, geoms, gridOpts, layout, makeZombie, openGrid, run, windowsCfg, world } from './helpers/carte.js';
import { readFileSync } from 'node:fs';

const render = JSON.parse(readFileSync('data/game/render.json', 'utf8'));
const analysis = analyzeMap(world);
const inside = world.obstacles.filter((o) => !o.outside);
const pairs = inside.flatMap((a, i) => inside.slice(i + 1).map((b) => [a, b]));
const cellOf = (grid, p) => Math.floor(p.y / grid.cell) * grid.cols + Math.floor(p.x / grid.cell);
const wallsCut = segmentRects(world.walls, 40); // lignes de mur complètes : le bord d'une ouverture de fenêtre n'est pas un couloir

describe('règles de la carte : couloirs et interstices', () => {
  it('deux obstacles sont au contact ou séparés d\'au moins 90 (aucun interstice de 1 à 89)', () => {
    for (const [a, b] of pairs) {
      const g = rectGap(a, b);
      expect(g === 0 || g >= 90, `${a.id} / ${b.id} : ${g}`).toBe(true);
      expect(overlapArea(a, b), `${a.id} / ${b.id}`).toBe(0);
    }
    expect(pairs.length).toBeGreaterThan(100);
  });

  it('un obstacle est au contact d\'un mur ou à 90 au moins (hors fenêtres)', () => {
    for (const o of inside) for (const w of wallsCut) {
      const g = rectGap(o, w);
      expect(g === 0 || g >= 90, `${o.id} / ${w.id} : ${g}`).toBe(true);
    }
  });

  it('les largeurs libres du chemin (grille de 20, cellules à 45 de tout obstacle) relient le départ à chaque fenêtre', () => {
    expect(analysis.startReachable).toBe(true);
    expect(analysis.unreachable).toEqual([]);
  });

  it('espace libre intérieur connexe : un seul morceau', () => {
    expect(analysis.components).toBe(1);
    expect(analysis.freeCells).toBeGreaterThan(3000);
  });

  it('l\'ouverture aile / grande salle est le seul goulot : libre sur au moins 280 (largeur au centre : 280 au moins)', () => {
    expect(analysis.neck.free).toBeGreaterThanOrEqual(280);
    expect(analysis.neck.clearance).toBeGreaterThanOrEqual(280);
  });

  it('un obstacle ajouté au milieu de l\'ouverture couperait le chemin : analyzeMap le voit', () => {
    const blocked = { ...world, obstacles: [...world.obstacles, { id: 'x', x: 1520, y: 1500, w: 60, h: 330, hauteur: 50, kind: 'caisse' }] };
    const a = analyzeMap(blocked);
    expect(a.unreachable.length).toBeGreaterThan(0);
  });

  it('la règle « deux itinéraires » du lot 1b ne s\'applique pas : une seule ouverture relie l\'aile à la grande salle', () => {
    expect(world.openings.filter((o) => o.id === 'ouverture-aile').length).toBe(1);
  });
});

describe('règles de la carte : départ et fenêtres', () => {
  it('zone de départ libre sur 120 unités de rayon', () => {
    const s = world.start;
    for (const o of [...world.obstacles, ...wallsCut]) {
      const dx = Math.max(o.x - s.x, 0, s.x - (o.x + o.w));
      const dy = Math.max(o.y - s.y, 0, s.y - (o.y + o.h));
      expect(Math.hypot(dx, dy), o.id).toBeGreaterThanOrEqual(120);
    }
  });

  it('les quatre piliers de la grande salle laissent environ 141 autour du départ (plus que les 120 exigés)', () => {
    const near = world.pillars.filter((p) => Math.hypot(p.x + 35 - world.start.x, p.y + 35 - world.start.y) < 200);
    expect(near.length).toBe(4);
    const d = Math.min(...near.map((p) => Math.hypot(Math.max(p.x - world.start.x, 0, world.start.x - (p.x + p.w)), Math.max(p.y - world.start.y, 0, world.start.y - (p.y + p.h)))));
    expect(Math.round(d)).toBeGreaterThanOrEqual(140);
    expect(Math.round(d)).toBeLessThanOrEqual(145);
  });

  it.each(['F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8'])('150 unités de profondeur libre derrière %s, sur toute sa largeur', (id) => {
    const w = world.windows.find((q) => q.id === id);
    const zone = windowZone(w, 80, 150, 40);
    expect(zone.w * zone.h).toBe(80 * 150);
    for (const o of world.obstacles.filter((q) => !q.outside)) expect(overlapArea(zone, o), `${id} / ${o.id}`).toBe(0);
    expect(layout.inside(zone.x + zone.w / 2, zone.y + zone.h / 2)).toBe(true);
  });

  it('deux fenêtres ont leurs centres à 150 unités au moins l\'une de l\'autre', () => {
    for (let i = 0; i < world.windows.length; i += 1) for (let j = i + 1; j < world.windows.length; j += 1) {
      expect(Math.hypot(world.windows[i].x - world.windows[j].x, world.windows[i].y - world.windows[j].y), `${world.windows[i].id}-${world.windows[j].id}`).toBeGreaterThanOrEqual(150);
    }
  });

  it.each(['F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8'])('%s : entryInner est dans le bâtiment et relié au départ (largeur ≥ 90)', (id) => {
    const g = geoms.find((q) => q.id === id);
    expect(layout.inside(g.entryInner.x, g.entryInner.y)).toBe(true);
    expect(analysis.unreachable).not.toContain(id);
  });

  it('les barrières du joueur ferment les 8 fenêtres au joueur seulement', () => {
    expect(layout.barriers.length).toBe(8);
    for (const g of layout.gaps) {
      const b = layout.barriers.find((q) => q.fenetre === g.id);
      expect(b).toMatchObject({ x: g.x, y: g.y, w: g.w, h: g.h });
      expect(layout.playerObstacles).toContain(b);
      expect(layout.zombieObstacles).not.toContain(b);
    }
  });

  it('les murs sont percés exactement des 8 ouvertures : continus une fois les planches posées', () => {
    expect(layout.gaps.length).toBe(8);
    for (const g of layout.gaps) {
      const touching = layout.walls.filter((w) => w.x <= g.x + g.w + 1e-9 && w.x + w.w >= g.x - 1e-9 && w.y <= g.y + g.h + 1e-9 && w.y + w.h >= g.y - 1e-9);
      expect(touching.length, g.id).toBeGreaterThanOrEqual(2);
      expect(layout.walls.every((w) => overlapArea(w, g) === 0), g.id).toBe(true);
    }
  });
});

describe('règles de la carte : extérieur et apparitions', () => {
  it('couloirs d\'approche de 160 de large devant chaque fenêtre, sans décor solide ni obstacle', () => {
    expect(layout.decor.corridors.length).toBe(8);
    for (const c of layout.decor.corridors) {
      expect(Math.min(c.w, c.h)).toBe(160);
      for (const o of [...layout.decor.solids, ...layout.decor.fences, ...world.obstacles.filter((q) => q.outside)]) expect(rectGap(o, c), `${c.id} / ${o.id}`).toBeGreaterThan(0);
    }
    expect(decorProblems(layout.decor, world)).toEqual([]);
  });

  it('au plus autant de décors solides que l\'ancien decor.json (36), aucun à moins de 160 du bâtiment', () => {
    expect(layout.decor.solids.length).toBeLessThanOrEqual(36);
    for (const s of layout.decor.solids) {
      for (const f of layout.floor) expect(rectGap(s, f), s.id).toBeGreaterThanOrEqual(160);
    }
  });

  it('aucun type de décor nouveau : les mêmes que le lot 1b', () => {
    const kinds = new Set([...layout.decor.solids, ...layout.decor.bushes, ...layout.decor.lamps, ...layout.decor.fences].map((o) => o.kind));
    for (const k of kinds) expect(['voiture', 'arbre', 'buisson', 'lampadaire', 'barriere']).toContain(k);
    expect(decorCfg.ground.some((g) => g.kind === 'route')).toBe(true);
  });

  it('16 points d\'apparition, 2 par fenêtre, identifiants stables, à 450 et 650 du mur', () => {
    expect(layout.spawnPoints.length).toBe(16);
    expect(layout.spawnPoints.map((p) => p.id)).toEqual(['F1-a', 'F1-b', 'F2-a', 'F2-b', 'F3-a', 'F3-b', 'F4-a', 'F4-b', 'F5-a', 'F5-b', 'F6-a', 'F6-b', 'F7-a', 'F7-b', 'F8-a', 'F8-b']);
    for (const g of geoms) {
      const mine = layout.spawnPoints.filter((p) => p.window === g.id && p.fenetre === g.id);
      expect(mine.length).toBe(2);
      expect(mine.map((p) => Math.round(Math.hypot(p.x - g.center.x, p.y - g.center.y)))).toEqual([450, 650]);
      for (const p of mine) {
        expect(p.x).toBeGreaterThan(0);
        expect(p.x).toBeLessThan(world.size.width);
        expect(p.y).toBeGreaterThan(0);
        expect(p.y).toBeLessThan(world.size.height);
      }
    }
  });

  it.each(layout.spawnPoints.map((p) => [p.id, p]))('point %s : chemin jusqu\'à l\'entryOuter de sa fenêtre d\'au plus 900', (_id, p) => {
    const len = pathLength(closedGrid, fields[p.fenetre].flow, p);
    expect(len).toBeGreaterThan(0);
    expect(len).toBeLessThanOrEqual(900);
  });

  it('les huit champs de fenêtre couvrent l\'extérieur et n\'atteignent jamais l\'intérieur', () => {
    for (const g of geoms) {
      expect(fields[g.id].reachable, g.id).toBeGreaterThan(10000);
      expect(fields[g.id].flow.dist[cellOf(closedGrid, g.entryOuter)]).toBe(0);
      expect(fields[g.id].flow.dist[cellOf(closedGrid, world.start)], g.id).toBe(INF);
      expect(fields[g.id].flow.dist[cellOf(closedGrid, g.entryInner)], g.id).toBe(INF);
    }
  });

  it('F3 : la rampe n\'est pas un obstacle, le zombie y arrive (chemin libre)', () => {
    const g = geoms.find((q) => q.id === 'F3');
    const ramp = world.ramp;
    expect(g.entryOuter.x).toBeGreaterThanOrEqual(ramp.x - 10);
    expect(closedGrid.blocked[cellOf(closedGrid, { x: ramp.x + ramp.w / 2, y: g.center.y })]).toBe(0);
    expect(analysis.unreachable).toEqual([]);
  });

  it('rampe : zone libre de 160 de large devant F3 (entre le mur et le bord du monde)', () => {
    const c = layout.decor.corridors.find((q) => q.id === 'F3');
    expect(c.h).toBe(160);
    for (const o of layout.zombieObstacles.filter((q) => !String(q.id).startsWith('mur-') && !String(q.id).startsWith('barriere'))) expect(rectGap(o, c)).toBeGreaterThan(0);
  });
});

describe('règles de la carte : temps de calcul, planches, simulation', () => {
  it('temps des huit champs de fenêtre et d\'un recalcul du champ du joueur en Node (rapporté ; seuils larges)', () => {
    const t0 = performance.now();
    const grid = createGrid(layout.size, [...layout.zombieObstacles, ...layout.gaps], gridOpts);
    for (const g of geoms) buildWindowField({ grid }, g);
    const windowsMs = performance.now() - t0;
    buildFlow(openGrid, world.start);
    const times = [];
    for (let i = 0; i < 20; i += 1) {
      const t1 = performance.now();
      stepFlow({ flow: null }, 0.05, openGrid, { x: 1900 + i * 7, y: 2000 });
      times.push(performance.now() - t1);
    }
    const mean = times.reduce((a, b) => a + b, 0) / times.length;
    console.info(`Node : grille + 8 champs de fenêtre ${windowsMs.toFixed(1)} ms ; recalcul du champ du joueur ${mean.toFixed(2)} ms en moyenne (max ${Math.max(...times).toFixed(2)})`);
    expect(windowsMs).toBeLessThan(2000);
    expect(mean).toBeLessThan(8);
  });

  describe.each(geoms.map((g) => [g.id, g]))('plank-layout.js sur la vraie fenêtre %s (200 graines)', (_id, g0) => {
    const P = plankSettings(windowsCfg, render);
    const g = { ...g0, inner: layout.faceInner(g0) };
    const seeds = Array.from({ length: 200 }, (_, i) => i + 1);
    it('aucun coin sous l\'allège ni au-dessus du linteau + visible, aucun coin dans le mur, débord et séparation', () => {
      for (const seed of seeds) {
        const poses = plankPoses(g, P, seed);
        expect(poses.length).toBe(4);
        const all = poses.map((p) => plankCorners(p, g));
        for (const corners of all) for (const c of corners) {
          expect(c[1]).toBeGreaterThanOrEqual(P.sill + 0.5 - 1e-9);
          expect(c[1]).toBeLessThanOrEqual(P.lintel + P.visible + 1e-9);
          const gap = wallGap(c, g);
          expect(gap).toBeGreaterThanOrEqual(P.wallGap - 1e-9);
          expect(gap).toBeLessThanOrEqual(P.wallGap + P.thickness + 6 + 1e-9);
          const along = (c[0] - g.center.x) * g.tangent.x + (c[2] - g.center.y) * g.tangent.y;
          expect(Math.abs(along)).toBeLessThanOrEqual(g.width / 2 + P.overhang + 1e-9);
        }
        for (let i = 1; i < poses.length; i += 1) expect(poses[i].center[1]).toBeGreaterThan(poses[i - 1].center[1]);
      }
    });
  });

  it('les quatre orientations sont couvertes par les vraies fenêtres', () => {
    expect([...new Set(geoms.map((g) => g.side))].sort()).toEqual(['est', 'nord', 'ouest', 'sud']);
    expect(windowGeometry({ ...world.windows[0], size: 80 }, windowsCfg).normal).toEqual({ x: 0, y: -1 });
  });

  it('simulation pure de 60 s depuis chacun des 16 points : aucun zombie bloqué plus de 2 s, tous atteignent l\'intérieur fenêtre ouverte', () => {
    for (const p of layout.spawnPoints) {
      const r = run({ zombies: [makeZombie(1, p.fenetre, { x: p.x, y: p.y })], planks: 0, seconds: 60 });
      expect(r.maxStill, `${p.id} : ${JSON.stringify(r.stillWhere)}`).toBeLessThanOrEqual(2);
      expect(r.zombies[0].mode, p.id).toBe('dedans');
      expect(layout.inside(r.zombies[0].x, r.zombies[0].y), p.id).toBe(true);
      expect(r.events.some((e) => e.type === 'enter' && e.windowId === p.fenetre), p.id).toBe(true);
    }
  });

  it('fenêtre fermée : aucun zombie n\'entre avant l\'ouverture, puis les quatre planches tombent', () => {
    const g = geoms.find((q) => q.id === 'F7');
    const zs = [1, 2].map((i) => makeZombie(i, 'F7', { x: g.entryOuter.x + i * 12, y: g.entryOuter.y + 300 + i * 30 }));
    let early = 0;
    let opened = false;
    const r = run({ zombies: zs, planks: 4, seconds: 40, onStep: (s) => { opened ||= s.windows.windows.F7.planks === 0; if (!opened && s.zombies.some((z) => layout.inside(z.x, z.y))) early += 1; } });
    expect(early).toBe(0);
    expect(r.events.some((e) => e.type === 'window-open' && e.windowId === 'F7')).toBe(true);
  });

  it('?map=salle n\'est pas touchée : les anciens fichiers de data/game/ n\'ont ni contour ni murs', () => {
    const old = JSON.parse(readFileSync('data/game/world.json', 'utf8'));
    expect(old.contour).toBeUndefined();
    expect(old.walls).toBeUndefined();
  });
});
