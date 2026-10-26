import { describe, it, expect } from 'vitest';
import { buildFlow, cellCenter, cellIndex, createFlowState, createGrid, flowDirection, flowPath, INF, lineOfSight, pathLength, stepFlow } from '../../js/core/nav.js';
import { deepFreeze, WEIRD } from './helpers/monde.js';

const opts = { cell: 20, radius: 20, inflate: 4 };
const world = { width: 1000, height: 600 };
const wallV = { x: 480, y: 0, w: 40, h: 480 }; // mur vertical : ouverture en bas (de y 480 à 600)

describe('nav.js : grille', () => {
  it('couvre un monde de 3600 × 2800 en cellules de 20 (180 × 140)', () => {
    const g = createGrid({ width: 3600, height: 2800 }, [], opts);
    expect([g.cell, g.cols, g.rows]).toEqual([20, 180, 140]);
    expect(g.blocked.length).toBe(180 * 140);
  });

  it('gonfle les obstacles du rayon du zombie plus 4 (centre de cellule à moins de 24 : bloquée)', () => {
    const g = createGrid(world, [{ x: 200, y: 200, w: 100, h: 100 }], opts);
    const blocked = (x, y) => g.blocked[cellIndex(g, { x, y })] === 1;
    expect(blocked(250, 250)).toBe(true);
    expect(blocked(190, 250)).toBe(true); // centre à 10 de la face
    expect(blocked(170, 250)).toBe(false); // centre à 30 de la face
    expect(blocked(310, 250)).toBe(true);
    expect(blocked(330, 250)).toBe(false);
  });

  it('cellCenter et cellIndex sont réciproques', () => {
    const g = createGrid(world, [], opts);
    expect(cellCenter(g, cellIndex(g, { x: 333, y: 111 }))).toEqual({ x: 330, y: 110 });
    expect(cellIndex(g, { x: -50, y: 9999 })).toBe((g.rows - 1) * g.cols);
  });
});

describe('nav.js : champ de flux', () => {
  it('coûte 0 à la cible, 10 en ligne droite, 14 en diagonale', () => {
    const g = createGrid(world, [], opts);
    const f = buildFlow(g, { x: 110, y: 110 });
    expect(f.dist[cellIndex(g, { x: 110, y: 110 })]).toBe(0);
    expect(f.dist[cellIndex(g, { x: 130, y: 110 })]).toBe(10);
    expect(f.dist[cellIndex(g, { x: 130, y: 130 })]).toBe(14);
    expect(f.dist[cellIndex(g, { x: 330, y: 190 })]).toBe(4 * 14 + 7 * 10); // 4 diagonales puis 7 droites
  });

  it('contourne un meuble : le chemin est plus long que la ligne droite et reste dans les cellules libres', () => {
    const g = createGrid(world, [wallV], opts);
    const from = { x: 100, y: 100 };
    const to = { x: 900, y: 100 };
    const f = buildFlow(g, to);
    const length = pathLength(g, f, from);
    expect(length).toBeGreaterThan(800 * 1.5);
    expect(Number.isFinite(length)).toBe(true);
    for (const p of flowPath(g, f, from)) expect(g.blocked[cellIndex(g, p)]).toBe(0);
    expect(flowPath(g, f, from).at(-1)).toEqual(cellCenter(g, f.source));
  });

  it('franchit un couloir de 90 entre deux meubles avec des cellules de 20', () => {
    const rects = [{ x: 480, y: 0, w: 40, h: 255 }, { x: 480, y: 345, w: 40, h: 255 }]; // trou de 90 : y 255 à 345
    const g = createGrid(world, rects, opts);
    const f = buildFlow(g, { x: 900, y: 300 });
    expect(Number.isFinite(pathLength(g, f, { x: 100, y: 300 }))).toBe(true);
  });

  it('un couloir de 40 est infranchissable (le zombie de rayon 20 n\'y tient pas)', () => {
    const rects = [{ x: 480, y: 0, w: 40, h: 280 }, { x: 480, y: 320, w: 40, h: 280 }];
    const g = createGrid(world, rects, opts);
    const f = buildFlow(g, { x: 900, y: 300 });
    expect(pathLength(g, f, { x: 100, y: 300 })).toBe(Infinity);
  });

  it('ne coupe jamais un coin : deux cellules bloquées en diagonale ne se traversent pas', () => {
    const g = createGrid({ width: 400, height: 400 }, [{ x: 100, y: 100, w: 20, h: 20 }, { x: 120, y: 120, w: 20, h: 20 }], { cell: 20, radius: 0, inflate: 0 });
    const f = buildFlow(g, { x: 110, y: 130 }); // cellule (5, 6)
    // (6, 5) est voisine en diagonale de (5, 6), mais (5, 5) et (6, 6) sont bloquées : il faut contourner (coût > 14).
    expect(f.dist[cellIndex(g, { x: 130, y: 110 })]).toBeGreaterThan(14);
    expect(f.dist[cellIndex(g, { x: 130, y: 110 })]).toBeLessThan(INF);
  });

  it('cible inatteignable (enfermée) : aucune exception, tout est inaccessible', () => {
    const ring = [{ x: 400, y: 200, w: 200, h: 20 }, { x: 400, y: 380, w: 200, h: 20 }, { x: 400, y: 200, w: 20, h: 200 }, { x: 580, y: 200, w: 20, h: 200 }];
    const g = createGrid(world, ring, { cell: 20, radius: 0, inflate: 0 });
    const f = buildFlow(g, { x: 500, y: 300 });
    expect(pathLength(g, f, { x: 50, y: 50 })).toBe(Infinity);
    expect(flowDirection(g, f, { x: 50, y: 50 })).toEqual({ x: 0, y: 0 });
    expect(flowPath(g, f, { x: 50, y: 50 })).toEqual([]);
  });

  it('une cible dans une cellule bloquée utilise la cellule libre la plus proche', () => {
    const g = createGrid(world, [{ x: 200, y: 200, w: 100, h: 100 }], opts);
    const f = buildFlow(g, { x: 250, y: 250 });
    expect(f.source).toBeGreaterThanOrEqual(0);
    expect(g.blocked[f.source]).toBe(0);
    expect(f.reachable).toBeGreaterThan(1000);
  });

  it('flowDirection : vecteur unitaire vers la cible, nul sur la cible', () => {
    const g = createGrid(world, [], opts);
    const f = buildFlow(g, { x: 510, y: 310 });
    const d = flowDirection(g, f, { x: 110, y: 310 });
    expect(Math.hypot(d.x, d.y)).toBeCloseTo(1, 9);
    expect(d.x).toBeGreaterThan(0.99);
    expect(flowDirection(g, f, { x: 510, y: 310 })).toEqual({ x: 0, y: 0 });
  });

  it('flowDirection coupe les marches d\'escalier tant que la ligne de vue est libre', () => {
    const g = createGrid(world, [], opts);
    const f = buildFlow(g, { x: 910, y: 510 });
    const d = flowDirection(g, f, { x: 110, y: 110 }, 5);
    expect(d.x).toBeGreaterThan(0.7);
    expect(d.y).toBeGreaterThan(0.4);
  });

  it('un zombie dans une cellule bloquée (collé à un meuble) trouve quand même une direction', () => {
    const g = createGrid(world, [{ x: 200, y: 200, w: 100, h: 100 }], opts);
    const f = buildFlow(g, { x: 700, y: 250 });
    const d = flowDirection(g, f, { x: 190, y: 250 }); // dans la zone gonflée
    expect(Math.hypot(d.x, d.y)).toBeCloseTo(1, 9);
  });
});

describe('nav.js : ligne de vue et recalcul', () => {
  const solids = [{ x: 200, y: 200, w: 100, h: 100 }];
  it('ligne de vue libre ou coupée, avec ou sans rayon', () => {
    expect(lineOfSight({ x: 0, y: 250 }, { x: 600, y: 250 }, solids)).toBe(false);
    expect(lineOfSight({ x: 0, y: 100 }, { x: 600, y: 100 }, solids)).toBe(true);
    expect(lineOfSight({ x: 0, y: 190 }, { x: 600, y: 190 }, solids, 0)).toBe(true);
    expect(lineOfSight({ x: 0, y: 190 }, { x: 600, y: 190 }, solids, 20)).toBe(false);
  });

  it('le champ n\'est recalculé que si le joueur change de cellule, et au plus toutes les 0,25 s', () => {
    const g = createGrid(world, [], opts);
    let s = stepFlow(createFlowState(), 0.05, g, { x: 110, y: 110 });
    expect(s.recomputed).toBe(true); // premier calcul : immédiat
    const first = s.flow;
    for (let i = 0; i < 10; i += 1) s = stepFlow(s, 0.05, g, { x: 112, y: 112 }); // 0,5 s dans la même cellule
    expect(s.recomputed).toBe(false);
    expect(s.flow).toBe(first);
    const moved = { x: 150, y: 110 }; // autre cellule : recalcul dès que 0,25 s se sont écoulées depuis le dernier calcul
    expect(s.timer).toBeGreaterThanOrEqual(0.25);
    s = stepFlow(s, 0.05, g, moved);
    expect(s.recomputed).toBe(true);
    const second = s.flow;
    expect(second).not.toBe(first);
    for (let i = 0; i < 4; i += 1) {
      s = stepFlow(s, 0.05, g, { x: 190, y: 110 }); // encore une autre cellule, mais moins de 0,25 s
      expect(s.recomputed).toBe(false);
      expect(s.flow).toBe(second);
    }
    s = stepFlow(s, 0.05, g, { x: 190, y: 110 });
    s = stepFlow(s, 0.05, g, { x: 190, y: 110 });
    expect(s.flow).not.toBe(second);
  });
});

describe('nav.js : arguments et entrées inattendues', () => {
  it('ne modifie pas ses arguments, renvoie du neuf et reste déterministe', () => {
    const solids = deepFreeze([{ x: 200, y: 200, w: 100, h: 100 }]);
    const g = createGrid(deepFreeze({ ...world }), solids, deepFreeze({ ...opts }));
    const target = deepFreeze({ x: 700, y: 250 });
    const a = buildFlow(g, target);
    const b = buildFlow(g, target);
    expect(Array.from(a.dist)).toEqual(Array.from(b.dist));
    expect(a.dist).not.toBe(b.dist);
    expect(flowDirection(g, a, { x: 100, y: 100 })).toEqual(flowDirection(g, b, { x: 100, y: 100 }));
  });

  it('ne lève jamais d\'exception sur des types inattendus', () => {
    for (const w of WEIRD) {
      const g = createGrid(w, w, w);
      expect(g.cols).toBeGreaterThanOrEqual(1);
      const f = buildFlow(g, w);
      expect(Number.isFinite(pathLength(g, f, w)) || pathLength(g, f, w) === Infinity).toBe(true);
      const d = flowDirection(g, f, w, w);
      expect(Number.isFinite(d.x) && Number.isFinite(d.y)).toBe(true);
      expect(typeof lineOfSight(w, w, w, w)).toBe('boolean');
      expect(stepFlow(w, w, g, w, w).flow).toBeTruthy();
    }
  });
});
