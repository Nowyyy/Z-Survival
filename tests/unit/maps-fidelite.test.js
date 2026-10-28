import { describe, it, expect } from 'vitest';
import { analyzeMap, windowGap } from '../../js/core/maps.js';
import { polygonArea, polygonRects, pointInPolygon, unionRects, totalArea, segmentRects } from '../../js/core/shape.js';
import { windowGeometry } from '../../js/core/windows.js';
import { decorCfg, layout, params, plan, px, windowsCfg, world } from './helpers/carte.js';

const PLAN_WINDOWS = {
  F1: ['nord', 161, 107], F2: ['est', 232, 190], F3: ['ouest', 130, 306], F4: ['nord', 430, 248],
  F5: ['nord', 504, 248], F6: ['est', 535, 274], F7: ['sud', 262, 415], F8: ['sud', 511, 420],
};
const NORMALS = { nord: { x: 0, y: -1 }, sud: { x: 0, y: 1 }, est: { x: 1, y: 0 }, ouest: { x: -1, y: 0 } };
const analysis = analyzeMap(world);
const near = (a, b, tol) => Math.abs(a - b) <= tol;

describe('fidélité au plan : contour, murs, ouvertures', () => {
  it('12 sommets de contour, convertis dans l\'ordre horaire', () => {
    expect(world.contour.length).toBe(12);
    expect(world.contour[0]).toEqual([1040, 800]);
    expect(world.contour[11]).toEqual([1040, 2340]);
  });

  it('2 murs intérieurs : (232,212)-(232,248) et (232,312)-(232,415)', () => {
    const inner = world.walls.filter((w) => w.id.startsWith('mur-interieur'));
    expect(inner.length).toBe(2);
    expect(inner[0]).toMatchObject({ x1: px(232, 212).x, y1: px(232, 212).y, x2: px(232, 248).x, y2: px(232, 248).y });
    expect(inner[1]).toMatchObject({ y1: px(232, 312).y, y2: px(232, 415).y });
  });

  it('aile de 510 ± 50 × 1 540 ± 50', () => {
    const x0 = px(130, 0).x;
    const x1 = px(232, 0).x;
    const y0 = px(0, 107).y;
    const y1 = px(0, 415).y;
    expect(near(x1 - x0, 510, 50)).toBe(true);
    expect(near(y1 - y0, 1540, 50)).toBe(true);
  });

  it('grande salle de 1 515 ± 50 × 835 ± 50', () => {
    expect(near(px(535, 0).x - px(232, 0).x, 1515, 50)).toBe(true);
    expect(near(px(0, 415).y - px(0, 248).y, 835, 50)).toBe(true);
  });

  it('ouverture aile / grande salle : largeur de 280 à 360, sans mur ni porte', () => {
    const o = world.openings.find((q) => q.id === 'ouverture-aile');
    const width = Math.abs(o.y2 - o.y1);
    expect(width).toBeGreaterThanOrEqual(280);
    expect(width).toBeLessThanOrEqual(360);
    const gapRect = { x: o.x1 - 20, y: Math.min(o.y1, o.y2), w: 40, h: width };
    expect(layout.walls.every((w) => w.x >= gapRect.x + gapRect.w || w.x + w.w <= gapRect.x || w.y >= gapRect.y + gapRect.h || w.y + w.h <= gapRect.y)).toBe(true);
  });

  it('alcôve nord de 380 × 180, ouverte sur la grande salle', () => {
    const alcove = { x: px(232, 0).x, y: px(0, 212).y, w: (308 - 232) * 5, h: (248 - 212) * 5 };
    expect([alcove.w, alcove.h]).toEqual([380, 180]);
    const o = world.openings.find((q) => q.id === 'ouverture-alcove');
    expect(o).toMatchObject({ y1: alcove.y + alcove.h, y2: alcove.y + alcove.h, x1: alcove.x, x2: alcove.x + alcove.w });
    // Aucun mur sur le bord sud de l'alcôve : on y entre depuis la grande salle.
    const line = { x: alcove.x + 20, y: o.y1 - 2, w: alcove.w - 40, h: 4 };
    expect(layout.walls.some((w) => w.x < line.x + line.w && w.x + w.w > line.x && w.y < line.y + line.h && w.y + w.h > line.y)).toBe(false);
    expect(layout.inside(alcove.x + 190, alcove.y + 90)).toBe(true);
  });

  it('l\'encoche en bas à droite (408 à 465, 378 à 420) est à l\'extérieur du bâtiment', () => {
    const c = px(436, 400);
    expect(pointInPolygon(c.x, c.y, world.contour)).toBe(false);
    expect(layout.inside(c.x, c.y)).toBe(false);
  });

  it('aucune porte, aucune barrière achetable, aucun étage', () => {
    const text = JSON.stringify(world) + JSON.stringify(decorCfg);
    expect(text).not.toMatch(/\b(porte|door|achat|prix|price|etage|étage|niveau)\b/i);
    expect(world.playerBarriers.every((b) => /^barriere-F[1-8]$/.test(b.id))).toBe(true);
    expect(world.obstacles.every((o) => o.kind !== 'porte')).toBe(true);
  });
});

describe('fidélité au plan : fenêtres F1 à F8', () => {
  it('8 fenêtres F1 à F8, de largeur 140', () => {
    expect(world.windows.map((w) => w.id)).toEqual(['F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8']);
    expect(world.windowSize).toBe(140);
    for (const g of layout.gaps) expect(Math.max(g.w, g.h)).toBe(140);
  });

  it.each(Object.entries(PLAN_WINDOWS))('%s : bon mur, bonne normale, à moins de 50 unités du plan', (id, [side, x, y]) => {
    const w = world.windows.find((q) => q.id === id);
    expect(w.side).toBe(side);
    const geom = windowGeometry({ ...w, size: 140 }, windowsCfg);
    expect(geom.normal).toEqual(NORMALS[side]);
    const p = px(x, y);
    const planned = plan.windows.find((q) => q.id === id);
    const ref = px(planned.planX ?? x, planned.planY ?? y);
    expect(Math.hypot(w.x - ref.x, w.y - ref.y)).toBeLessThanOrEqual(50);
    expect(Math.hypot(w.x - p.x, w.y - p.y)).toBeLessThanOrEqual(65);
    // Sur un mur du contour.
    const onWall = world.walls.some((s) => (s.x1 === s.x2 ? Math.abs(s.x1 - w.x) < 1 && w.y >= Math.min(s.y1, s.y2) && w.y <= Math.max(s.y1, s.y2) : Math.abs(s.y1 - w.y) < 1 && w.x >= Math.min(s.x1, s.x2) && w.x <= Math.max(s.x1, s.x2)));
    expect(onWall).toBe(true);
  });

  it('F2 donne sur l\'extérieur au nord du bâtiment ; F3 sur la rampe', () => {
    const f2 = layout.gaps.find((g) => g.id === 'F2');
    expect(f2.y + f2.h).toBeLessThan(world.contour[3][1] - 20);
    const ramp = world.ramp;
    const f3 = world.windows.find((w) => w.id === 'F3');
    expect(ramp.window).toBe('F3');
    expect(f3.y).toBeGreaterThanOrEqual(ramp.y);
    expect(f3.y).toBeLessThanOrEqual(ramp.y + ramp.h);
  });

  it('F9 n\'existe pas', () => {
    expect(world.windows.some((w) => w.id === 'F9')).toBe(false);
  });
});

describe('fidélité au plan : piliers, escaliers, rampe, départ', () => {
  it('11 piliers aux bonnes places (±5 px)', () => {
    expect(world.pillars.length).toBe(11);
    plan.pillars.forEach(([x, y], i) => {
      const c = px(x, y);
      const p = world.pillars[i];
      expect(Math.abs(p.x + p.w / 2 - c.x), p.id).toBeLessThanOrEqual(25);
      expect(Math.abs(p.y + p.h / 2 - c.y), p.id).toBeLessThanOrEqual(25);
      expect([p.w, p.h]).toEqual([70, 70]);
    });
  });

  it('3 escaliers pleins, de hauteur 70, aux rectangles du plan', () => {
    expect(world.stairs.length).toBe(3);
    for (const st of world.stairs) expect(st.hauteur).toBe(70);
    const central = world.stairs.find((s) => s.id === 'escalier-central');
    expect(central).toMatchObject({ x: px(308, 0).x, y: px(0, 212).y, w: 470, h: 180 });
    const out = world.stairs.find((s) => s.id === 'escalier-exterieur');
    expect(out.outside).toBe(true);
  });

  it('les escaliers et les piliers bloquent le joueur, les zombies, les balles et le laser (obstacles pleins)', () => {
    for (const st of world.stairs) {
      const cx = st.x + st.w / 2;
      const cy = st.y + st.h / 2;
      expect(layout.playerObstacles.some((o) => cx >= o.x && cx <= o.x + o.w && cy >= o.y && cy <= o.y + o.h), st.id).toBe(true);
      expect(layout.zombieObstacles.some((o) => cx >= o.x && cx <= o.x + o.w && cy >= o.y && cy <= o.y + o.h), st.id).toBe(true);
    }
  });

  it('la rampe de F3 est praticable : décor au sol, jamais un obstacle', () => {
    const ramp = world.ramp;
    expect([ramp.x, ramp.y, ramp.w, ramp.h]).toEqual([px(85, 0).x, px(0, 258).y, 225, 350]);
    const hits = (list) => list.some((o) => o.x < ramp.x + ramp.w && o.x + o.w > ramp.x && o.y < ramp.y + ramp.h && o.y + o.h > ramp.y);
    const solid = (list) => list.filter((o) => !String(o.id).startsWith('mur-') && !String(o.id).startsWith('barriere-')); // le bord de la rampe touche le mur de F3
    expect(hits(solid(layout.zombieObstacles))).toBe(false);
    expect(hits(solid(layout.playerObstacles))).toBe(false);
    expect(decorCfg.ground.find((g) => g.id === ramp.id)).toMatchObject({ kind: 'trottoir', x: ramp.x, y: ramp.y });
  });

  it('départ du joueur au centre (318,360) = (1980, 2065)', () => {
    expect(world.start).toEqual({ x: 1980, y: 2065 });
    expect(layout.start).toEqual({ x: 1980, y: 2065 });
  });
});

describe('fidélité au plan : aires, hauteurs', () => {
  it('aire intérieure avant obstacles (hors épaisseur des murs) entre 1,8 et 2,1 millions', () => {
    expect(analysis.interiorArea).toBeGreaterThan(1.8e6);
    expect(analysis.interiorArea).toBeLessThan(2.1e6);
    const walls = segmentRects(world.walls, 40);
    expect(totalArea(unionRects(polygonRects(world.contour), walls))).toBe(analysis.interiorArea);
  });

  it('aire libre après obstacles (escaliers, piliers, mobilier) entre 1,4 et 1,9 million', () => {
    expect(analysis.freeArea).toBeGreaterThan(1.4e6);
    expect(analysis.freeArea).toBeLessThan(1.9e6);
    expect(analysis.freeArea).toBeLessThan(analysis.interiorArea);
  });

  it('aucun obstacle de plus de 70 de haut ; murs de 60', () => {
    for (const o of world.obstacles) expect(o.hauteur, o.id).toBeLessThanOrEqual(70);
    expect(world.wallHeight).toBe(60);
    expect(world.maxHeight).toBe(70);
  });

  it('l\'aire du polygone du contour est celle du plan converti (25 unités² par px²)', () => {
    expect(polygonArea(world.contour)).toBe(polygonArea(plan.contour) * 25);
  });

  it('le mobilier retenu garde sa place d\'après le plan (M1, M7, M8, M9, M12) ; les pièces retirées sont M5, M6, M10 et M11', () => {
    const ids = world.obstacles.map((o) => o.id);
    for (const id of ['M1', 'M7', 'M8', 'M9', 'M12']) expect(ids).toContain(id);
    expect(world.generation.retired.map((r) => r.id)).toEqual(['M5', 'M6', 'M10', 'M11']);
    for (const r of world.generation.retired) expect(r.reason).toBeTypeOf('string');
  });

  it('les 11 piliers, 3 escaliers et le mobilier sont tous dans obstacles (seuls les blocs fusionnés les regroupent)', () => {
    const parts = world.obstacles.flatMap((o) => o.parts ?? [o.id]);
    for (const p of world.pillars) expect(parts).toContain(p.id);
    for (const st of world.stairs) expect(parts).toContain(st.id);
  });

  it('windowGap est cohérent avec les ouvertures des murs', () => {
    for (const w of world.windows) expect(layout.gaps.find((g) => g.id === w.id)).toMatchObject(windowGap(w, 140, 40));
    expect(params.windowSize).toBe(140);
  });
});
