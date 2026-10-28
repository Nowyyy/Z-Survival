import { describe, it, expect } from 'vitest';
import {
  addDebris, cleanParams, createDebris, debrisPose, debrisScale, faceDistance, plankCorners, plankPoses, plankSettings, removeDebris, stepDebris, wallGap, windowTriangles,
} from '../../js/core/plank-layout.js';
import { windowGeometry } from '../../js/core/windows.js';
import { deepFreeze, layout, load, WEIRD, world } from './helpers/monde.js';

const windowsCfg = load('windows');
const render = load('render');
const P = plankSettings(windowsCfg, render);
const room = world.room;

// Fenêtres de world.json (nord, ouest, est) et une fenêtre sud synthétique (le monde n'en a pas) : les quatre orientations.
const sides = [
  ...world.windows.map((w) => [w.id, w]),
  ['fenetre-sud', { id: 'fenetre-sud', side: 'sud', x: 1800, y: room.y + room.height - 12 }],
];
const geomOf = (win) => {
  const g = windowGeometry({ ...win, size: world.windowSize }, windowsCfg);
  return { ...g, inner: faceDistance(room, g) };
};
const SEEDS = Array.from({ length: 200 }, (_, i) => i + 1);
const EPS = 1e-9;
const L25 = { ...P, debrisLife: 25 }; // la mécanique de durée de vie, indépendamment du réglage des données
const lateral = (g, c) => (c[0] - g.center.x) * g.tangent.x + (c[2] - g.center.y) * g.tangent.y;
const debrisLayout = (extra = {}) => ({ params: P, obstacles: layout.furniture, bounds: layout.bounds, ...extra });

describe('plank-layout.js : réglages (windows.json planks3d, render.json)', () => {
  it('les valeurs de départ de la spécification', () => {
    expect(P).toMatchObject({ count: 4, thickness: 14, visible: 16, overhang: 16, wallGap: 2, rollMax: 0.12, sill: 16, lintel: 44, debrisMax: 12, debrisFade: 1 });
  });

  it('cleanParams : tout paramètre absent, négatif ou non numérique prend son repli', () => {
    for (const bad of WEIRD) {
      const p = cleanParams(bad);
      expect(p.thickness).toBe(14);
      expect(p.count).toBe(4);
    }
    expect(cleanParams({ thickness: -3, height: 'x', count: 99, rollMax: 9, spacing: 0.2 })).toMatchObject({ thickness: 14, height: 6, count: 8, rollMax: 0.5, spacing: 1.5 });
  });

  it('windowTriangles : 4 poutres × 4, cadre 8, trou 2, 4 pastilles × 4 = 42', () => {
    expect(windowTriangles(4)).toBe(42);
    expect(windowTriangles(undefined)).toBe(42);
    expect(windowTriangles(2)).toBe(2 * 4 + 8 + 2 + 2 * 4);
  });

  it('faceDistance : 12 pour chaque fenêtre de world.json, 12 par repli', () => {
    for (const [, win] of sides) expect(faceDistance(room, windowGeometry({ ...win, size: 140 }, windowsCfg))).toBe(12);
    for (const bad of WEIRD) expect(faceDistance(bad, bad)).toBe(12);
  });
});

describe.each(sides)('plank-layout.js : planches de %s (200 graines)', (_id, win) => {
  const g = geomOf(win);
  const all = SEEDS.map((seed) => {
    const poses = plankPoses(g, P, seed);
    return { seed, poses, corners: poses.map((pose) => plankCorners(pose, g)) };
  });

  it('quatre planches, huit coins chacune', () => {
    for (const { poses, corners } of all) {
      expect(poses).toHaveLength(4);
      for (const c of corners) expect(c).toHaveLength(8);
    }
  });

  it('aucun coin sous l\'allège + 0,5 ni au-dessus du linteau + hauteur visible', () => {
    for (const { corners } of all) for (const c of corners) for (const p of c) {
      expect(p[1]).toBeGreaterThanOrEqual(P.sill + 0.5 - EPS);
      expect(p[1]).toBeLessThanOrEqual(P.lintel + P.visible + EPS);
    }
  });

  it('aucun coin dans le mur : écart à la face intérieure entre l\'écart au mur et écart + épaisseur + 6', () => {
    for (const { corners } of all) for (const c of corners) for (const p of c) {
      expect(wallGap(p, g)).toBeGreaterThanOrEqual(P.wallGap - EPS);
      expect(wallGap(p, g)).toBeLessThanOrEqual(P.wallGap + P.thickness + 6);
    }
  });

  it('chaque planche déborde de l\'ouverture de 16 au plus de chaque côté et couvre l\'ouverture', () => {
    for (const { corners } of all) for (const c of corners) {
      const xs = c.map((p) => lateral(g, p));
      expect(Math.max(...xs)).toBeLessThanOrEqual(g.width / 2 + P.overhang + EPS);
      expect(Math.min(...xs)).toBeGreaterThanOrEqual(-g.width / 2 - P.overhang - EPS);
      expect(Math.max(...xs)).toBeGreaterThan(g.width / 2);
      expect(Math.min(...xs)).toBeLessThan(-g.width / 2);
    }
  });

  it('deux planches voisines ne s\'interpénètrent pas : écart vertical d\'au moins 1 sur toute leur longueur commune', () => {
    for (const { corners } of all) {
      for (let i = 0; i + 1 < corners.length; i += 1) {
        const edge = (c, a, b) => {
          const xa = lateral(g, c[a]);
          const xb = lateral(g, c[b]);
          return (x) => c[a][1] + ((c[b][1] - c[a][1]) * (x - xa)) / (xb - xa);
        };
        const lowEdge = corners[i + 1];
        const top = edge(corners[i], 2, 6); // arête supérieure (côté mur) de la planche i
        const bottom = edge(lowEdge, 0, 4); // arête inférieure de la planche i + 1
        const x0 = Math.max(Math.min(lateral(g, corners[i][2]), lateral(g, corners[i][6])), Math.min(lateral(g, lowEdge[0]), lateral(g, lowEdge[4])));
        const x1 = Math.min(Math.max(lateral(g, corners[i][2]), lateral(g, corners[i][6])), Math.max(lateral(g, lowEdge[0]), lateral(g, lowEdge[4])));
        for (let k = 0; k <= 40; k += 1) {
          const x = x0 + ((x1 - x0) * k) / 40;
          expect(bottom(x) - top(x)).toBeGreaterThanOrEqual(1 - 1e-6);
        }
      }
    }
  });

  it('pivot au bas : le milieu du bord inférieur ne bouge pas quand l\'inclinaison change, et l\'inclinaison reste dans rollMax', () => {
    for (const { poses } of all) for (const pose of poses) {
      expect(Math.abs(pose.roll)).toBeLessThanOrEqual(P.rollMax + EPS);
      const flat = plankCorners({ ...pose, roll: 0 }, g);
      const rolled = plankCorners(pose, g);
      for (const d of [0, 1]) {
        const mid = (c) => [0, 1, 2].map((axis) => (c[d][axis] + c[4 + d][axis]) / 2);
        const a = mid(flat);
        const b = mid(rolled);
        for (let axis = 0; axis < 3; axis += 1) expect(b[axis]).toBeCloseTo(a[axis], 9);
      }
    }
  });

  it('les planches sont parallèles au mur : même distance au mur pour tous les coins de même profondeur', () => {
    const { corners } = all[0];
    for (const c of corners) {
      const gaps = c.map((p) => wallGap(p, g)).sort((a, b) => a - b);
      expect(gaps[0]).toBeCloseTo(P.wallGap, 9);
      expect(gaps[7]).toBeCloseTo(P.wallGap + P.thickness, 9);
    }
  });

  it('les graines donnent des dispositions différentes, la même graine la même disposition', () => {
    expect(plankPoses(g, P, 7)).toEqual(plankPoses(g, P, 7));
    expect(plankPoses(g, P, 7)).not.toEqual(plankPoses(g, P, 8));
  });
});

describe('plank-layout.js : planches, détails', () => {
  const g = geomOf(world.windows[0]);

  it('les fenêtres d\'une même graine diffèrent (identifiant dans la graine)', () => {
    expect(plankPoses(g, P, 5)).not.toEqual(plankPoses(geomOf(world.windows[1]), P, 5));
  });

  it('plankPoses ne modifie aucun argument (arguments gelés)', () => {
    expect(() => plankPoses(deepFreeze(structuredClone(g)), deepFreeze(structuredClone(P)), 3)).not.toThrow();
    expect(plankPoses(deepFreeze(structuredClone(g)), deepFreeze(structuredClone(P)), 3)).toEqual(plankPoses(g, P, 3));
  });

  it('le résultat ne dépend que des arguments (appels répétés, ordre inversé)', () => {
    const a = plankPoses(g, P, 11);
    plankPoses(geomOf(world.windows[2]), P, 99);
    expect(plankPoses(g, P, 11)).toEqual(a);
  });

  it('l\'amplitude est réduite pour que la pile tienne, sans dépasser rollMax', () => {
    const roll = Math.max(...SEEDS.flatMap((seed) => plankPoses(g, P, seed).map((p) => Math.abs(p.roll))));
    expect(roll).toBeLessThan(P.rollMax);
    expect(roll).toBeGreaterThan(0.02);
  });

  it('une inclinaison plus permise ou une pile plus basse ne sortent jamais des bornes', () => {
    for (const extra of [{ rollMax: 0.5 }, { height: 12 }, { spacing: 6 }, { count: 2 }, { count: 8, height: 3 }, { visible: 1 }]) {
      const q = cleanParams({ ...P, ...extra });
      for (const seed of [1, 2, 3, 4, 5]) for (const pose of plankPoses(g, q, seed)) for (const c of plankCorners(pose, g)) {
        expect(c[1]).toBeGreaterThanOrEqual(q.sill + 0.5 - EPS);
        expect(wallGap(c, g)).toBeGreaterThanOrEqual(q.wallGap - EPS);
      }
    }
  });

  it('entrées hostiles : [] pour une géométrie invalide, aucune exception', () => {
    for (const bad of WEIRD) {
      expect(() => plankPoses(bad, bad, bad)).not.toThrow();
      expect(plankPoses(bad, P, 1)).toEqual([]);
      expect(plankCorners(bad, bad)).toEqual([]);
      expect(plankCorners(plankPoses(g, P, 1)[0], bad)).toEqual([]);
      expect(Number.isNaN(wallGap(bad, g))).toBe(true);
      expect(Number.isNaN(wallGap([0, 0, 0], bad))).toBe(true);
    }
    expect(plankCorners({ center: [0, 0, NaN], size: [1, 1, 1], roll: 0 }, g)).toEqual([]);
    expect(plankPoses(g, 'x', NaN)).toHaveLength(4);
    expect(plankPoses({ ...g, width: NaN, inner: 'x' }, P, 'y')).toHaveLength(4);
  });
});

describe.each(sides)('plank-layout.js : débris de %s', (_id, win) => {
  const g = geomOf(win);
  const poses = SEEDS.flatMap((seed) => Array.from({ length: 12 }, (_, k) => ({ seed, k, d: debrisPose(g, k, seed, debrisLayout()) })));

  it('presque tous les débris trouvent une place, les autres donnent null', () => {
    expect(poses.filter((p) => p.d !== null).length).toBeGreaterThan(poses.length * 0.95);
    for (const p of poses) expect(p.d === null || typeof p.d.x === 'number').toBe(true);
  });

  it('à plat : y = demi-épaisseur + 0,3, le dessous du débris est à 0,3', () => {
    for (const { d } of poses) if (d) {
      expect(d.y).toBeCloseTo(P.debrisThickness / 2 + 0.3, 9);
      expect(d.y - d.size[1] / 2).toBeCloseTo(0.3, 9);
      expect(d.size).toEqual([P.debrisLength, P.debrisThickness, P.debrisWidth]);
    }
  });

  it('tourné autour de la verticale seulement, de ±35° au plus par rapport à l\'axe du mur', () => {
    const axis = Math.atan2(g.tangent.y, g.tangent.x);
    for (const { d } of poses) if (d) expect(Math.abs(Math.atan2(Math.sin(d.yaw - axis), Math.cos(d.yaw - axis)))).toBeLessThanOrEqual(0.61 + EPS);
  });

  it('à 40 à 110 de la face intérieure et à ± (largeur / 2 + 40) le long du mur', () => {
    for (const { d } of poses) if (d) {
      const depth = wallGap([d.x, 0, d.z], g);
      expect(depth).toBeGreaterThanOrEqual(P.debrisNear - EPS);
      expect(depth).toBeLessThanOrEqual(P.debrisFar + EPS);
      expect(Math.abs(lateral(g, [d.x, 0, d.z]))).toBeLessThanOrEqual(g.width / 2 + P.debrisSide + EPS);
    }
  });

  it('jamais dans un obstacle (élargi de 6) ni hors de la salle', () => {
    const b = layout.bounds;
    let bad = 0;
    for (const { d } of poses.filter((p, i) => i % 5 === 0)) if (d) {
      const ax = [Math.cos(d.yaw), Math.sin(d.yaw)];
      for (let i = 0; i <= 10; i += 1) for (let j = 0; j <= 4; j += 1) {
        const a = (i / 10 - 0.5) * d.size[0];
        const c = (j / 4 - 0.5) * d.size[2];
        const px = d.x + ax[0] * a - ax[1] * c;
        const pz = d.z + ax[1] * a + ax[0] * c;
        if (px < b.minX || px > b.maxX || pz < b.minY || pz > b.maxY) bad += 1;
        for (const o of layout.furniture) if (px > o.x - 6 && px < o.x + o.w + 6 && pz > o.y - 6 && pz < o.y + o.h + 6) bad += 1;
      }
    }
    expect(bad).toBe(0);
  });

  it('un autre débris à moins de 30 : refusé ou déplacé', () => {
    for (const seed of SEEDS.slice(0, 40)) {
      const first = debrisPose(g, 0, seed, debrisLayout());
      const second = debrisPose(g, 1, seed, debrisLayout({ others: [{ x: first.x, z: first.z }] }));
      if (second !== null) expect(Math.hypot(second.x - first.x, second.z - first.z)).toBeGreaterThanOrEqual(P.debrisApart);
    }
  });
});

describe('plank-layout.js : débris, cas limites', () => {
  const g = geomOf(world.windows[0]);

  it('aucune place : null (salle vide de place, ou obstacle partout)', () => {
    expect(debrisPose(g, 0, 1, debrisLayout({ bounds: { minX: 0, minY: 0, maxX: 10, maxY: 10 } }))).toBeNull();
    expect(debrisPose(g, 0, 1, debrisLayout({ obstacles: [{ x: -1e5, y: -1e5, w: 2e5, h: 2e5 }] }))).toBeNull();
  });

  it('douze tentatives au plus : un obstacle sur toute la zone épuise les tentatives', () => {
    const tries = cleanParams({ ...P, debrisTries: 1 });
    const forced = debrisLayout({ params: tries, obstacles: [{ x: g.center.x - 300, y: g.center.y, w: 600, h: 300 }] });
    expect(debrisPose(g, 3, 9, forced)).toBeNull();
  });

  it('déterministe : mêmes arguments, même pose ; graines et numéros différents, poses différentes', () => {
    expect(debrisPose(g, 2, 7, debrisLayout())).toEqual(debrisPose(g, 2, 7, debrisLayout()));
    expect(debrisPose(g, 2, 7, debrisLayout())).not.toEqual(debrisPose(g, 3, 7, debrisLayout()));
    expect(debrisPose(g, 2, 7, debrisLayout())).not.toEqual(debrisPose(g, 2, 8, debrisLayout()));
  });

  it('arguments gelés : aucune modification, aucune exception', () => {
    const frozen = deepFreeze(structuredClone({ g, layout: debrisLayout({ others: [{ x: 0, z: 0 }] }) }));
    expect(() => debrisPose(frozen.g, 1, 3, frozen.layout)).not.toThrow();
    const state = deepFreeze(addDebris(createDebris(), g, 1, debrisLayout()));
    expect(() => addDebris(state, g, 1, deepFreeze(debrisLayout()))).not.toThrow();
    expect(() => stepDebris(state, 0.05, P)).not.toThrow();
    expect(() => removeDebris(state, g.id, 1)).not.toThrow();
  });

  it('entrées hostiles : null, jamais d\'exception', () => {
    for (const bad of WEIRD) {
      expect(() => debrisPose(bad, bad, bad, bad)).not.toThrow();
      expect(debrisPose(bad, 0, 1, debrisLayout())).toBeNull();
      expect(() => addDebris(bad, bad, bad, bad)).not.toThrow();
      expect(() => stepDebris(bad, bad, bad)).not.toThrow();
      expect(() => removeDebris(bad, bad, bad)).not.toThrow();
      expect(() => debrisScale(bad, bad, bad)).not.toThrow();
      expect(stepDebris(bad, 0.05, P).items).toEqual([]);
    }
    expect(debrisPose(g, NaN, NaN, { obstacles: 'x', bounds: 'y', others: 5 })).not.toBeUndefined();
  });
});

describe('plank-layout.js : durée de vie et plafond des débris', () => {
  const g = geomOf(world.windows[0]);
  const fill = (n) => {
    let s = createDebris();
    for (let i = 0; i < n; i += 1) s = addDebris(s, i % 3 === 0 ? g : geomOf(world.windows[i % 3]), 4, debrisLayout());
    return s;
  };

  it('au plus 12 débris : le plus ancien disparaît le premier', () => {
    const s = fill(30);
    expect(s.items.length).toBeLessThanOrEqual(12);
    expect(s.items.length).toBeGreaterThan(0);
    const ids = s.items.map((d) => d.id);
    expect(ids).toEqual([...ids].sort((a, b) => a - b));
    expect(Math.max(...ids)).toBeGreaterThanOrEqual(20);
    expect(Math.min(...ids)).toBeGreaterThan(5);
  });

  it('un débris vit 25 s de temps de jeu : présent à 24,9 s, disparu à 25 s', () => {
    let s = fill(3);
    const n = s.items.length;
    for (let t = 0; t < 498; t += 1) s = stepDebris(s, 0.05, L25);
    expect(s.items).toHaveLength(n);
    expect(s.items[0].age).toBeCloseTo(24.9, 6);
    for (let t = 0; t < 4; t += 1) s = stepDebris(s, 0.05, L25);
    expect(s.items).toHaveLength(0);
  });

  it('dt est borné à 0,05 s et un dt négatif ou invalide ne fait pas vieillir', () => {
    const s = fill(1);
    expect(stepDebris(s, 5, P).items[0].age).toBeCloseTo(0.05, 12);
    expect(stepDebris(s, -1, P).items[0].age).toBe(0);
    expect(stepDebris(s, NaN, P).items[0].age).toBe(0);
  });

  it('disparition en 1 s par mise à l\'échelle ; immédiate sous mouvement réduit', () => {
    expect(debrisScale({ age: 0 }, P)).toBe(1);
    expect(debrisScale({ age: 24 }, L25)).toBe(1);
    expect(debrisScale({ age: 24.5 }, L25)).toBeCloseTo(0.5, 9);
    expect(debrisScale({ age: 25 }, L25)).toBe(0);
    expect(debrisScale({ age: 24.5 }, L25, true)).toBe(1);
    expect(debrisScale({ age: 25 }, L25, true)).toBe(0);
  });

  it('removeDebris retire les plus récents de la fenêtre et laisse les autres', () => {
    const other = geomOf(world.windows[1]);
    let s = createDebris();
    for (let i = 0; i < 3; i += 1) s = addDebris(s, g, 4, debrisLayout());
    s = addDebris(s, other, 4, debrisLayout());
    const before = s.items.length;
    const mine = s.items.filter((d) => d.window === g.id);
    const out = removeDebris(s, g.id, 2);
    expect(out.items.length).toBe(before - 2);
    expect(out.items.filter((d) => d.window === other.id)).toHaveLength(1);
    expect(out.items.filter((d) => d.window === g.id).map((d) => d.id)).toEqual(mine.slice(0, mine.length - 2).map((d) => d.id));
    expect(removeDebris(s, g.id, 0).items).toHaveLength(before);
    expect(removeDebris(s, 'inconnue', 5).items).toHaveLength(before);
  });

  it('deux débris ne se recouvrent jamais (même 12 d\'affilée)', () => {
    const s = fill(12);
    for (let i = 0; i < s.items.length; i += 1) for (let j = i + 1; j < s.items.length; j += 1) {
      expect(Math.hypot(s.items[i].x - s.items[j].x, s.items[i].z - s.items[j].z)).toBeGreaterThanOrEqual(P.debrisApart);
    }
  });
});
