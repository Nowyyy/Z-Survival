// Lot 3g, partie A : fonctions pures du relevé du modèle (js/core/releve.js). Aucun test ne lit le modèle (il n'est pas dans le dépôt).
import { describe, it, expect } from 'vitest';
import {
  DEFAULT_CALAGE, LEVELS, CLASS_RULES, WINDOW_COMPONENTS, boxToPlan, calageScore, classifyObject, compareWall, components, contourPoints, cutSections,
  deltaLevel, floorOf, groupStacks, iou, matchFurniture, matchPoints, metersToPx, metersToUnits, modelToPlan, planSegments, planToModel, planToUnits,
  pxToUnits, rasterizeCut, rectCover, rectDelta, searchCalage,
} from '../../js/core/releve.js';

// Carré fermé de côté s (pixels) en segments, coin (x, y).
const square = (x, y, s) => [[x, y, x + s, y], [x + s, y, x + s, y + s], [x + s, y + s, x, y + s], [x, y + s, x, y]];
const BOUNDS = { x0: 0, y0: 0, x1: 60, y1: 60 };

describe('conversions d\'unités', () => {
  it('le calage du lot 3e : (0 m, 0 m) → (61, 347) px environ', () => {
    const [px, py] = modelToPlan(0, 0);
    expect(px).toBeCloseTo(5.0833 * 12, 3);
    expect(py).toBeCloseTo(28.9167 * 12, 3);
  });

  it('modèle → plan → modèle redonne le point', () => {
    const [px, py] = modelToPlan(3.2, -7.5);
    const [x, y] = planToModel(px, py);
    expect(x).toBeCloseTo(3.2, 9);
    expect(y).toBeCloseTo(-7.5, 9);
  });

  it('y du modèle vers le nord, y du plan vers le sud', () => {
    expect(modelToPlan(0, 1)[1]).toBeLessThan(modelToPlan(0, 0)[1]);
    expect(modelToPlan(1, 0)[0]).toBeGreaterThan(modelToPlan(0, 0)[0]);
  });

  it('un calage invalide retombe sur celui du lot 3e', () => {
    expect(modelToPlan(1, 1, { scale: -2 })).toEqual(modelToPlan(1, 1, DEFAULT_CALAGE));
    expect(modelToPlan(1, 1, null)).toEqual(modelToPlan(1, 1));
  });

  it('pixels → unités : 5 unités par pixel, marge 800, origine du plan', () => {
    expect(planToUnits(0, 0)).toEqual([800, 800]);
    expect(planToUnits(318, 360)).toEqual([2390, 2600]);
    expect(planToUnits(10, 10, { scale: 5, margin: 800, origin: { x: 10, y: 10 } })).toEqual([800, 800]);
  });

  it('mètres → unités (60) et → pixels (12), pixels → unités (5)', () => {
    expect(metersToUnits(1)).toBe(60);
    expect(metersToPx(1)).toBe(12);
    expect(pxToUnits(3)).toBe(15);
    expect(metersToUnits('x')).toBe(0);
  });

  it('boîte du modèle → rectangle du plan ordonné', () => {
    const r = boxToPlan([0, 0, 0, 1, 2, 3]);
    expect(r.x0).toBeLessThan(r.x1);
    expect(r.y0).toBeLessThan(r.y1);
    expect(r.x1 - r.x0).toBeCloseTo(12, 1);
    expect(r.y1 - r.y0).toBeCloseTo(24, 1);
    expect(boxToPlan([1, 2])).toBeNull();
    expect(boxToPlan(null)).toBeNull();
  });
});

describe('niveaux d\'écart', () => {
  it.each([[0, 'moins-15'], [14.9, 'moins-15'], [15, '15-60'], [60, '15-60'], [60.1, 'plus-60'], [-80, 'plus-60'], ['x', 'moins-15']])('%s unités → %s', (d, lv) => {
    expect(deltaLevel(d)).toBe(lv);
  });

  it('trois niveaux, dans l\'ordre', () => {
    expect(LEVELS).toEqual(['moins-15', '15-60', 'plus-60']);
  });
});

describe('coupe : remplissage et rectangles', () => {
  it('un carré fermé de 6 px est rempli (poche mince), une pièce de 40 px ne l\'est pas', () => {
    const small = rasterizeCut(square(10, 10, 6), BOUNDS, 0.5);
    const big = rasterizeCut(square(10, 10, 40), BOUNDS, 0.5);
    const at = (g, x, y) => g.data[Math.floor((y - g.y0) / g.cell) * g.w + Math.floor((x - g.x0) / g.cell)];
    expect(at(small, 13, 13)).toBe(1);
    expect(at(big, 30, 30)).toBe(0);
    expect(at(big, 10.2, 30)).toBe(1);
  });

  it('un mur double ouvert à un bout (montant absent) est comblé par la fermeture', () => {
    const segs = [[5, 20, 50, 20], [5, 23, 50, 23], [50, 20, 50, 23]];
    const g = rasterizeCut(segs, BOUNDS, 0.5, 4);
    const at = (x, y) => g.data[Math.floor(y / 0.5) * g.w + Math.floor(x / 0.5)];
    expect(at(30, 21.5)).toBe(1);
  });

  it('entrées invalides : grille vide, aucune exception', () => {
    const g = rasterizeCut(null, null);
    expect(g.w * g.h).toBe(0);
    expect(rasterizeCut([[1, 2, 'a', 4]], BOUNDS).data.some((v) => v)).toBe(false);
  });

  it('composantes connexes : deux carrés séparés → deux composantes', () => {
    const g = rasterizeCut([...square(5, 5, 5), ...square(30, 30, 5)], BOUNDS, 0.5);
    expect(components(g)).toHaveLength(2);
    expect(components(null)).toEqual([]);
  });

  it('rectCover couvre toutes les cellules sans recouvrement', () => {
    const g = rasterizeCut(square(10, 10, 6), BOUNDS, 0.5);
    const rects = rectCover(g, null, 1);
    const area = rects.reduce((s, r) => s + (r.x1 - r.x0) * (r.y1 - r.y0), 0);
    const filled = g.data.reduce((s, v) => s + v, 0) * 0.25;
    expect(area).toBeCloseTo(filled, 5);
    for (let i = 0; i < rects.length; i += 1) for (let j = i + 1; j < rects.length; j += 1) {
      const a = rects[i];
      const b = rects[j];
      expect(Math.max(0, Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0)) * Math.max(0, Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0))).toBe(0);
    }
  });

  it('cutSections : un carré isolé de 6 px est un pilier, un long mur double est un mur', () => {
    const segs = [...square(20, 40, 6), [2, 5, 55, 5], [55, 5, 55, 9], [55, 9, 2, 9], [2, 9, 2, 5]];
    const { walls, pillars } = cutSections(rasterizeCut(segs, BOUNDS, 0.5));
    expect(pillars).toHaveLength(1);
    expect(pillars[0].x).toBeCloseTo(23, 0);
    expect(walls.some((w) => w.axis === 'h' && w.x1 - w.x0 > 40)).toBe(true);
  });
});

describe('calage', () => {
  const contour = [[10, 10], [50, 10], [50, 50], [10, 50]];
  const ring = [[9, 9, 51, 9], [9, 11, 51, 11], [49, 9, 49, 51], [51, 9, 51, 51], [9, 49, 51, 49], [9, 51, 51, 51], [9, 9, 9, 51], [11, 9, 11, 51]];

  it('points du contour : un point par pixel de périmètre', () => {
    expect(contourPoints(contour, 1)).toHaveLength(160);
    expect(contourPoints(null)).toEqual([]);
  });

  it('un mur centré sur le contour donne un score de 100 %', () => {
    const g = rasterizeCut(ring, { x0: 0, y0: 0, x1: 60, y1: 60 }, 0.5);
    expect(calageScore(contour, g)).toBeCloseTo(1, 5);
  });

  it('un décalage de 4 px fait tomber le score ; la recherche retrouve le décalage', () => {
    const g = rasterizeCut(ring, { x0: 0, y0: 0, x1: 60, y1: 60 }, 0.5);
    const moved = contour.map(([x, y]) => [x + 4, y - 3]);
    expect(calageScore(moved, g)).toBeLessThan(0.9);
    const best = searchCalage(moved, g, 5, 0.5);
    expect(best.score).toBeGreaterThan(0.99);
    expect(best.base).toBeLessThan(0.9);
    expect(Math.abs(best.dx - 4)).toBeLessThanOrEqual(2); // mur de 2 px et tolérance de 1 px : un plateau de décalages équivalents
    expect(Math.abs(best.dy + 3)).toBeLessThanOrEqual(2);
  });

  it('entrées invalides : score nul', () => {
    expect(calageScore([], null)).toBe(0);
  });
});

describe('classement des objets', () => {
  const obj = (component, bbox) => ({ component, bbox });

  it('les règles sont ordonnées et finissent par « inconnu »', () => {
    expect(CLASS_RULES.map((r) => r.id)).toEqual(['fenetre', 'haut', 'mince', 'bas', 'meuble', 'inconnu']);
  });

  it('ouvrage de fenêtre : composants 5 à 8', () => {
    for (const c of WINDOW_COMPONENTS) expect(classifyObject(obj(c, [0, 0, 0, 1, 1, 2])).klass).toBe('fenetre');
  });

  it('étagère de 2,13 m posée au sol : meuble', () => {
    expect(classifyObject(obj('shelf', [0, 0, 0, 0.6, 1.8, 2.13]))).toEqual({ klass: 'meuble', rule: 'meuble' });
  });

  it('luminaire à 1,6 m : décor léger (haut)', () => {
    expect(classifyObject(obj('Component_9', [0, 0, 1.62, 0.3, 0.4, 2.01]))).toEqual({ klass: 'decor-leger', rule: 'haut' });
  });

  it('sac de sable de 0,14 m : décor léger (bas)', () => {
    expect(classifyObject(obj('sandbag', [0, 0, 0, 0.5, 0.4, 0.14]))).toEqual({ klass: 'decor-leger', rule: 'bas' });
  });

  it('planche mince : décor léger (mince)', () => {
    expect(classifyObject(obj('board', [0, 0, 0, 1.5, 0.05, 2]))).toEqual({ klass: 'decor-leger', rule: 'mince' });
  });

  it('à l\'étage, les hauteurs sont relatives à son sol', () => {
    expect(classifyObject(obj('Component_2', [0, 0, 3.05, 0.8, 0.9, 3.66]), 3.05).klass).toBe('meuble');
    expect(classifyObject(obj('Component_2', [0, 0, 3.05, 0.8, 0.9, 3.66]), 0).rule).toBe('haut');
  });

  it('boîte invalide : inconnu', () => {
    expect(classifyObject({ component: 'x', bbox: [1] })).toEqual({ klass: 'inconnu', rule: 'inconnu' });
    expect(classifyObject(null).klass).toBe('inconnu');
  });

  it('étage d\'une hauteur : rdc sous 2,85 m, étage au-dessus', () => {
    const levels = { rdc: { floor: 0 }, etage: { floor: 3.05 } };
    expect(floorOf(0, levels)).toBe('rdc');
    expect(floorOf(2.9, levels)).toBe('etage');
    expect(floorOf(3.05, levels)).toBe('etage');
    expect(floorOf(-1, levels)).toBe('rdc');
  });

  it('piles : deux caisses empilées forment un groupe, une caisse voisine non', () => {
    const items = [
      { id: 'a', floor: 'rdc', plan: { x0: 0, y0: 0, x1: 10, y1: 10 }, bottom: 0, top: 0.6 },
      { id: 'b', floor: 'rdc', plan: { x0: 1, y0: 1, x1: 9, y1: 9 }, bottom: 0.6, top: 1.2 },
      { id: 'c', floor: 'rdc', plan: { x0: 20, y0: 0, x1: 30, y1: 10 }, bottom: 0, top: 0.6 },
      { id: 'd', floor: 'etage', plan: { x0: 0, y0: 0, x1: 10, y1: 10 }, bottom: 0, top: 0.6 },
    ];
    const g = groupStacks(items);
    expect(g.map((x) => x.ids.sort())).toEqual([['a', 'b'], ['c'], ['d']]);
    expect(g[0].top).toBe(1.2);
    expect(groupStacks(null)).toEqual([]);
  });
});

describe('comparaison de géométries', () => {
  it('IoU : identique 1, disjoint 0, moitié 1/3', () => {
    const a = { x0: 0, y0: 0, x1: 10, y1: 10 };
    expect(iou(a, a)).toBe(1);
    expect(iou(a, { x0: 20, y0: 0, x1: 30, y1: 10 })).toBe(0);
    expect(iou(a, { x0: 5, y0: 0, x1: 15, y1: 10 })).toBeCloseTo(1 / 3, 5);
    expect(iou(null, a)).toBe(0);
  });

  it('rectDelta : décalage de 3 px = 15 unités', () => {
    const d = rectDelta({ x0: 0, y0: 0, x1: 10, y1: 10 }, { x0: 3, y0: 0, x1: 13, y1: 10 });
    expect(d).toEqual({ dx: 15, dy: 0, dw: 0, dh: 0, max: 15 });
    expect(rectDelta(null, {})).toBeNull();
  });

  it('matchFurniture : chaque pièce prend le meilleur objet, un objet ne sert qu\'une fois', () => {
    const pieces = [{ id: 'M1', x0: 0, y0: 0, x1: 10, y1: 10 }, { id: 'M2', x0: 1, y0: 1, x1: 11, y1: 11 }, { id: 'P1', x0: 100, y0: 100, x1: 110, y1: 110 }];
    const groups = [{ key: 'G1', plan: { x0: 0, y0: 0, x1: 10, y1: 10 } }, { key: 'G2', plan: { x0: 50, y0: 50, x1: 60, y1: 60 } }];
    const r = matchFurniture(pieces, groups);
    expect(r.matches.find((m) => m.id === 'M1').key).toBe('G1');
    expect(r.matches.find((m) => m.id === 'M2').key).toBeNull();
    expect(r.matches.find((m) => m.id === 'P1').key).toBeNull();
    expect(r.unmatched).toEqual(['G2']);
  });

  it('matchPoints : le plus proche à 12 px au plus, sans réemploi', () => {
    const r = matchPoints([{ id: 'a', x: 0, y: 0 }, { id: 'b', x: 30, y: 0 }], [{ id: 'p', x: 2, y: 0 }, { id: 'q', x: 100, y: 0 }]);
    expect(r.matches[0]).toMatchObject({ id: 'a', other: 'p', dx: 10, dist: 10 });
    expect(r.matches[1].other).toBeNull();
    expect(r.unmatched).toEqual(['q']);
  });

  it('planSegments : arêtes du contour et murs intérieurs, axe de chacun', () => {
    const segs = planSegments({ contour: [[0, 0], [10, 0], [10, 10], [0, 10]], walls: [{ id: 'w', x1: 5, y1: 0, x2: 5, y2: 10 }] });
    expect(segs.map((s) => [s.id, s.axis])).toEqual([['contour-1', 'h'], ['contour-2', 'v'], ['contour-3', 'h'], ['contour-4', 'v'], ['w', 'v']]);
    expect(planSegments(null)).toEqual([]);
  });

  it('compareWall : ligne médiane du modèle 4 px plus bas = +20 unités, trous du mur listés', () => {
    const seg = { id: 's', x1: 0, y1: 10, x2: 100, y2: 10, axis: 'h' };
    const rects = [{ x0: 0, y0: 12, x1: 40, y1: 16 }, { x0: 60, y0: 12, x1: 100, y1: 16 }];
    const r = compareWall(seg, rects);
    expect(r.offset).toBe(20);
    expect(r.covered).toBeCloseTo(0.8, 5);
    expect(r.gaps).toEqual([{ a: 40, b: 60 }]);
  });

  it('compareWall : aucun mur parallèle à portée → offset nul', () => {
    const r = compareWall({ id: 's', x1: 0, y1: 10, x2: 100, y2: 10, axis: 'h' }, [{ x0: 0, y0: 40, x1: 100, y1: 44 }]);
    expect(r.offset).toBeNull();
    expect(r.covered).toBe(0);
    expect(compareWall(null, [])).toBeNull();
  });
});
