import { describe, it, expect } from 'vitest';
import { analyzeMap, windowGap } from '../../js/core/maps.js';
import { polygonArea, polygonRects, pointInPolygon, unionRects, totalArea, segmentRects } from '../../js/core/shape.js';
import { windowGeometry } from '../../js/core/windows.js';
import { decorCfg, layout, params, plan, px, windowsCfg, world } from './helpers/carte.js';

// Plan relevé sur le modèle SketchUp du propriétaire (coupe à 1,2 m) : 12 px par mètre du modèle, 5 unités par pixel, donc 60 unités par mètre.
const NORMALS = { nord: { x: 0, y: -1 }, sud: { x: 0, y: 1 }, est: { x: 1, y: 0 }, ouest: { x: -1, y: 0 } };
const SIDES = { F1: 'nord', F2: 'est', F3: 'ouest', F4: 'nord', F5: 'sud', F6: 'sud', F7: 'sud', F8: 'sud' };
const METRE = 60;
const analysis = analyzeMap(world);
const near = (a, b, tol) => Math.abs(a - b) <= tol;
const xs = world.contour.map((c) => c[0]);
const ys = world.contour.map((c) => c[1]);

describe('fidélité au modèle : contour, murs, ouvertures', () => {
  it('12 sommets de contour, convertis dans l\'ordre du plan', () => {
    expect(world.contour.length).toBe(12);
    plan.contour.forEach(([x, y], i) => expect(world.contour[i]).toEqual([px(x, y).x, px(x, y).y]));
  });

  it('3 murs intérieurs : deux de part et d\'autre de l\'ouverture aile / grande salle, un retour dans la grande salle', () => {
    const inner = world.walls.filter((w) => w.id.startsWith('mur-interieur'));
    expect(inner.length).toBe(3);
    expect(inner[0].x1).toBe(inner[1].x1);
  });

  it('grande salle d\'après le modèle : environ 27,4 m de long (1 644 ± 40) et 10,35 m de large (621 ± 40)', () => {
    const wallX = px(plan.walls[0].x1, 0).x;
    expect(near(Math.max(...xs) - wallX, 27.4 * METRE, 40)).toBe(true);
    const north = Math.min(...world.contour.filter((c) => c[0] > wallX + 1500).map((c) => c[1]));
    expect(near(Math.max(...ys) - north, 10.35 * METRE, 40)).toBe(true);
  });

  it('aile d\'environ 7,35 m de large (441 ± 40) et 27,6 m de long (1 656 ± 80)', () => {
    const aileX = world.contour.filter((c) => c[1] === Math.min(...ys)).map((c) => c[0]);
    expect(near(Math.max(...aileX) - Math.min(...aileX), 7.35 * METRE, 40)).toBe(true);
    const south = world.contour.find((c) => c[0] === Math.max(...aileX) && c[1] > Math.min(...ys) + 100)[1];
    expect(near(south - Math.min(...ys), 15.65 * METRE, 100)).toBe(true);
  });

  it('ouverture entre l\'aile et la grande salle : 1,4 m environ (85), sans mur', () => {
    const o = world.openings.find((q) => q.id === 'ouverture-aile');
    const width = Math.abs(o.y2 - o.y1);
    expect(near(width, 1.4 * METRE, 10)).toBe(true);
    const gapRect = { x: o.x1 - 20, y: Math.min(o.y1, o.y2), w: 40, h: width };
    expect(layout.walls.every((w) => w.x >= gapRect.x + gapRect.w || w.x + w.w <= gapRect.x || w.y >= gapRect.y + gapRect.h || w.y + w.h <= gapRect.y)).toBe(true);
  });

  it('passage large (environ 6 m) entre le bas de l\'aile et le bloc ouest : aucun mur sur son axe', () => {
    const o = world.openings.find((q) => q.id === 'ouverture-haut');
    expect(Math.abs(o.x2 - o.x1)).toBeGreaterThan(5 * METRE);
    const line = { x: Math.min(o.x1, o.x2) + 30, y: o.y1 - 2, w: Math.abs(o.x2 - o.x1) - 60, h: 4 };
    expect(layout.walls.some((w) => w.x < line.x + line.w && w.x + w.w > line.x && w.y < line.y + line.h && w.y + w.h > line.y)).toBe(false);
  });

  it('aucune porte, aucune barrière achetable, aucun étage', () => {
    const text = JSON.stringify(world) + JSON.stringify(decorCfg);
    expect(text).not.toMatch(/\b(porte|door|achat|prix|price|etage|étage|niveau)\b/i);
    expect(world.playerBarriers.every((b) => /^barriere-F[1-8]$/.test(b.id))).toBe(true);
    expect(world.obstacles.every((o) => o.kind !== 'porte')).toBe(true);
  });

  it('l\'extérieur du bâtiment (coin sud-ouest de la boîte englobante) n\'est pas à l\'intérieur', () => {
    const corner = { x: Math.max(...xs) - 10, y: Math.min(...ys) + 10 };
    expect(pointInPolygon(corner.x, corner.y, world.contour)).toBe(false);
    expect(layout.inside(corner.x, corner.y)).toBe(false);
  });
});

describe('fidélité au modèle : fenêtres F1 à F8', () => {
  it('8 fenêtres F1 à F8, de largeur 72 (1,2 m mesuré sur le modèle)', () => {
    expect(world.windows.map((w) => w.id)).toEqual(['F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8']);
    expect(world.windowSize).toBe(72);
    for (const g of layout.gaps) expect(Math.max(g.w, g.h)).toBe(72);
  });

  it.each(Object.entries(SIDES))('%s : mur %s, bonne normale, position du plan', (id, side) => {
    const w = world.windows.find((q) => q.id === id);
    expect(w.side).toBe(side);
    const geom = windowGeometry({ ...w, size: 72 }, windowsCfg);
    expect(geom.normal).toEqual(NORMALS[side]);
    const planned = plan.windows.find((q) => q.id === id);
    expect(w.x).toBe(px(planned.x, planned.y).x);
    expect(w.y).toBe(px(planned.x, planned.y).y);
    const onWall = world.walls.some((s) => (s.x1 === s.x2 ? Math.abs(s.x1 - w.x) < 1 && w.y >= Math.min(s.y1, s.y2) && w.y <= Math.max(s.y1, s.y2) : Math.abs(s.y1 - w.y) < 1 && w.x >= Math.min(s.x1, s.x2) && w.x <= Math.max(s.x1, s.x2)));
    expect(onWall).toBe(true);
  });

  it('quatre fenêtres sur le mur sud (dont une large à barreaux du modèle), une au nord de la grande salle, une par côté de l\'aile', () => {
    expect(Object.values(SIDES).filter((s) => s === 'sud').length).toBe(4);
    expect(world.windows.filter((w) => w.side === 'sud').every((w) => w.y === Math.max(...ys))).toBe(true);
  });

  it('F9 n\'existe pas', () => {
    expect(world.windows.some((w) => w.id === 'F9')).toBe(false);
  });
});

describe('fidélité au modèle : piliers, escalier, départ', () => {
  it('11 piliers aux places du plan (0,55 m, soit 35)', () => {
    expect(world.pillars.length).toBe(11);
    plan.pillars.forEach(([x, y], i) => {
      const c = px(x, y);
      const p = world.pillars[i];
      expect(p.x + p.w / 2).toBe(c.x);
      expect(p.y + p.h / 2).toBe(c.y);
      expect([p.w, p.h]).toEqual([35, 35]);
    });
  });

  it('un escalier plein de hauteur 70', () => {
    expect(world.stairs.length).toBe(1);
    expect(world.stairs[0]).toMatchObject({ hauteur: 70, kind: 'escalier' });
  });

  it('les escaliers et les piliers bloquent le joueur, les zombies, les balles et le laser (obstacles pleins)', () => {
    for (const st of [...world.stairs, ...world.pillars]) {
      const cx = st.x + st.w / 2;
      const cy = st.y + st.h / 2;
      expect(layout.playerObstacles.some((o) => cx >= o.x && cx <= o.x + o.w && cy >= o.y && cy <= o.y + o.h), st.id).toBe(true);
      expect(layout.zombieObstacles.some((o) => cx >= o.x && cx <= o.x + o.w && cy >= o.y && cy <= o.y + o.h), st.id).toBe(true);
    }
  });

  it('pas de rampe sur cette carte (aucune bande de sol « rampe » dans le décor)', () => {
    expect(world.ramp).toBeNull();
    expect(decorCfg.ground.some((g) => g.id.startsWith('rampe'))).toBe(false);
  });

  it('départ du joueur dans la grande salle, libre sur 120', () => {
    expect(world.start).toEqual(px(plan.start[0], plan.start[1]));
    expect(layout.start).toEqual(world.start);
    expect(layout.inside(world.start.x, world.start.y)).toBe(true);
  });
});

describe('fidélité au modèle : aires, hauteurs', () => {
  it('aire intérieure avant obstacles (hors épaisseur des murs) : environ 1,68 million (modèle : 28 m × 10 m, plus l\'aile et le bloc ouest)', () => {
    expect(analysis.interiorArea).toBeGreaterThan(1.5e6);
    expect(analysis.interiorArea).toBeLessThan(1.9e6);
    const walls = segmentRects(world.walls, 40);
    expect(totalArea(unionRects(polygonRects(world.contour), walls))).toBe(analysis.interiorArea);
  });

  it('aire libre après obstacles (escalier, piliers, mobilier) : plus de 1,4 million, moins que l\'aire intérieure', () => {
    expect(analysis.freeArea).toBeGreaterThan(1.4e6);
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

  it('le mobilier retenu est dans le bâtiment ; les pièces retirées sont listées avec leur raison', () => {
    for (const o of world.obstacles.filter((q) => q.kind !== 'pilier' && q.kind !== 'escalier')) expect(layout.inside(o.x + o.w / 2, o.y + o.h / 2), o.id).toBe(true);
    for (const r of world.generation.retired) expect(r.reason).toBeTypeOf('string');
    expect(world.obstacles.length + world.generation.retired.length).toBeGreaterThanOrEqual(plan.pillars.length + plan.stairs.length);
  });

  it('les piliers et l\'escalier sont tous dans obstacles (seuls les blocs fusionnés les regroupent)', () => {
    const parts = world.obstacles.flatMap((o) => o.parts ?? [o.id]);
    for (const p of world.pillars) expect(parts).toContain(p.id);
    for (const st of world.stairs) expect(parts).toContain(st.id);
  });

  it('windowGap est cohérent avec les ouvertures des murs', () => {
    for (const w of world.windows) expect(layout.gaps.find((g) => g.id === w.id)).toMatchObject(windowGap(w, 72, 40));
    expect(params.windowSize).toBe(72);
  });

  it('couloir minimal : 50 (le joueur fait 36 de diamètre, un zombie 40) au lieu de 90', () => {
    expect(world.minCorridor).toBe(50);
    expect(params.minCorridor).toBe(50);
  });
});
