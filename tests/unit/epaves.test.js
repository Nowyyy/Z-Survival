import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { burntCarParts, carFireSpots, concaveCorners, CRASH, helicopterFootprint, helicopterModel, lCorner, placeHelicopter } from '../../js/core/epaves.js';
import { approachCorridors, decorProblems, generateDecor } from '../../js/core/decor.js';
import { generateLivelyDecor } from '../../js/core/decor-vivant.js';
import { planToWorld } from '../../js/core/maps.js';
import { rectGap } from '../../js/core/collision.js';
import { polygonRects } from '../../js/core/shape.js';
import { decorCfg, layout, params, plan, world } from './helpers/carte.js';

// Lot 5a : voiture en flammes et hélicoptère écrasé (js/core/epaves.js, epaves.json -> decor.json par npm run carte).
const MAP = 'data/game/maps/rez-de-chaussee';
const epaves = JSON.parse(readFileSync(`${MAP}/epaves.json`, 'utf8'));
const etage = JSON.parse(readFileSync(`${MAP}/etage.world.json`, 'utf8'));
const footprint = polygonRects(world.contour);
const corridors = approachCorridors(world, 160);
const heli = decorCfg.wrecks.helicopter;
const gapToBuilding = (r) => Math.min(...footprint.map((f) => rectGap(r, f)));

describe('angle du L : sommets rentrants du contour', () => {
  it('quatre sommets rentrants au rez-de-chaussée, chacun avec la direction de son quart extérieur', () => {
    const c = concaveCorners(world.contour);
    expect(c.map((q) => [q.x, q.y])).toEqual([[1490, 1840], [2020, 1940], [1490, 2480], [1045, 1840]]);
    for (const q of c) expect(Math.hypot(q.out.x, q.out.y)).toBeCloseTo(1, 2);
    expect(concaveCorners([[0, 0], [10, 0], [10, 10], [0, 10]])).toEqual([]);
  });

  it('l\'angle du L est (1490, 1840) : à égalité de nord avec (1045, 1840), dont le quart extérieur est barré par le couloir de F3', () => {
    const { chosen, candidates } = lCorner(world.contour, { blockers: corridors, footprint, size: world.size });
    expect([chosen.x, chosen.y]).toEqual([1490, 1840]);
    expect(chosen.out.x).toBeGreaterThan(0);
    expect(chosen.out.y).toBeLessThan(0); // quart nord-est
    const west = candidates.find((q) => q.x === 1045);
    expect(west.clear).toBe(false);
    expect(heli.corner).toEqual({ x: chosen.x, y: chosen.y });
  });
});

describe('modèle de l\'hélicoptère (pur)', () => {
  const model = helicopterModel();

  it('700 triangles au plus, hauteur visuelle de 100 au plus, aucun NaN', () => {
    expect(model.count).toBeLessThanOrEqual(700);
    expect(model.count).toBeGreaterThan(100);
    expect(model.bounds.y1).toBeLessThanOrEqual(100);
    for (const t of model.triangles) for (const v of [...t.p.flat(), ...t.n]) expect(Number.isFinite(v)).toBe(true);
  });

  it('aucun sommet sous le sol ; en partie enfoui (des faces coupées au plan du sol, enfoncement et tangage non nuls)', () => {
    let atGround = 0;
    for (const t of model.triangles) for (const p of t.p) {
      expect(p[1]).toBeGreaterThanOrEqual(0);
      if (p[1] === 0) atGround += 1;
    }
    expect(atGround).toBeGreaterThan(20);
    expect(CRASH.sink).toBeGreaterThan(0);
    expect(CRASH.pitch).toBeLessThan(0);
    expect(model.bounds.y0).toBe(0);
  });

  it('toutes les pièces demandées : fuselage, cabine, poutre et queue brisée, patins, pales tordues', () => {
    const parts = new Set(model.triangles.map((t) => t.part));
    for (const p of ['coque', 'nez', 'verriere', 'poutre', 'queue', 'derive', 'patin-1', 'patin-2', 'pale-1a', 'pale-1b', 'pale-4b']) expect(parts.has(p), p).toBe(true);
    // La première pale plonge dans le sol : son second tronçon touche le plan du sol.
    expect(model.triangles.filter((t) => t.part === 'pale-1b').some((t) => t.p.some((p) => p[1] === 0))).toBe(true);
  });

  it('régions d\'atlas existantes et jetons de couleur du bloc du lot 5a', () => {
    const tokens = readFileSync('css/tokens.css', 'utf8');
    const block = tokens.slice(tokens.indexOf('/* Décor en flammes (lot 5a)'), tokens.indexOf('/* Interface intégrée (lot 3l) */'));
    const atlas = JSON.parse(readFileSync('data/game/textures.json', 'utf8'));
    const regions = JSON.stringify(atlas);
    for (const t of model.triangles) {
      expect(block, t.tint).toMatch(new RegExp(`--game-${t.tint}:\\s*#[0-9a-f]{6};`));
      expect(regions.includes(`"${t.region}"`), t.region).toBe(true);
    }
    for (const q of burntCarParts({ x: 0, y: 0, w: 92, h: 46, hauteur: 55 }).boxes) expect(block).toMatch(new RegExp(`--game-${q.tint}:`));
  });

  it('déterministe : deux appels donnent exactement les mêmes triangles ; le placement ne change que x et z', () => {
    expect(JSON.stringify(helicopterModel())).toBe(JSON.stringify(model));
    const placed = placeHelicopter({ x: 1000, y: 500, heading: 0 }, model);
    expect(placed.count).toBe(model.count);
    expect(placed.bounds.y1).toBe(model.bounds.y1);
    expect(placed.bounds.x0).toBeCloseTo(model.bounds.x0 + 1000, 2);
    expect(placed.bounds.z0).toBeCloseTo(model.bounds.z0 + 500, 2);
  });

  it('boîte englobante : 3 rectangles de collision (fuselage, poutre, queue) dans l\'emprise visuelle, identiques à decor.json', () => {
    const fp = helicopterFootprint({ id: 'helicoptere', x: heli.x, y: heli.y, heading: heli.heading });
    expect(fp.rects.length).toBeGreaterThanOrEqual(2);
    expect(fp.rects.length).toBeLessThanOrEqual(4);
    expect(fp.rects).toEqual(heli.rects);
    expect(fp.visual).toEqual(heli.visual);
    expect(fp.triangles).toBe(heli.triangles);
    for (const r of fp.rects) {
      expect(r.x).toBeGreaterThanOrEqual(fp.visual.x);
      expect(r.y).toBeGreaterThanOrEqual(fp.visual.y);
      expect(r.x + r.w).toBeLessThanOrEqual(fp.visual.x + fp.visual.w);
      expect(r.y + r.h).toBeLessThanOrEqual(fp.visual.y + fp.visual.h);
    }
    // Le fuselage est le plus grand rectangle ; la longueur totale dépasse deux fois une voiture.
    expect(fp.rects[0].w * fp.rects[0].h).toBe(Math.max(...fp.rects.map((r) => r.w * r.h)));
    expect(fp.visual.w).toBeGreaterThan(2 * 92);
  });
});

describe('emplacements : règles de la carte avec les deux épaves', () => {
  it('l\'hélicoptère est dans le quart extérieur de l\'angle du L, ses collisions à 160 au moins du bâtiment, hors des couloirs d\'approche', () => {
    expect(heli.x).toBeGreaterThan(heli.corner.x);
    expect(heli.y).toBeLessThan(heli.corner.y);
    const solids = layout.decor.solids.filter((s) => s.kind === 'helicoptere');
    expect(solids.map((s) => s.id)).toEqual(heli.rects.map((r) => r.id));
    for (const s of solids) {
      expect(gapToBuilding(s), s.id).toBeGreaterThanOrEqual(160);
      for (const c of corridors) expect(rectGap(s, c), `${s.id} / ${c.id}`).toBeGreaterThanOrEqual(20);
      for (const p of layout.spawnPoints) expect(rectGap(s, { x: p.x, y: p.y, w: 1, h: 1 }), `${s.id} / ${p.id}`).toBeGreaterThanOrEqual(70);
    }
  });

  it('emprise visuelle (pales comprises) hors des couloirs d\'approche du rez-de-chaussée et de l\'étage (U5 au-dessus de la grande salle)', () => {
    for (const c of [...corridors, ...approachCorridors(etage, 160)]) expect(rectGap(heli.visual, c), c.id).toBeGreaterThan(0);
    expect(gapToBuilding(heli.visual)).toBeGreaterThanOrEqual(60);
  });

  it('la voiture en flammes est une des voitures abandonnées, à la même place, au sud du mur du bas, hors des couloirs, à 160 au moins du bâtiment', () => {
    const plain = generateDecor({ ...decorCfg, wrecks: undefined }, world);
    const car = layout.decor.cars.find((c) => c.burning === true);
    expect(car.id).toBe(epaves.voitureEnFlammes);
    const before = plain.cars.find((c) => c.id === car.id);
    expect({ x: car.x, y: car.y, w: car.w, h: car.h, hauteur: car.hauteur }).toEqual({ x: before.x, y: before.y, w: before.w, h: before.h, hauteur: before.hauteur });
    expect(layout.decor.solids.some((s) => s.id === car.id)).toBe(true);
    const south = Math.max(...world.contour.map((q) => q[1]));
    const wall = world.contour.filter((q) => q[1] === south).map((q) => q[0]);
    expect(car.y).toBeGreaterThan(south);
    expect(car.x).toBeGreaterThanOrEqual(Math.min(...wall));
    expect(car.x + car.w).toBeLessThanOrEqual(Math.max(...wall));
    expect(gapToBuilding(car)).toBeGreaterThanOrEqual(160);
    for (const c of corridors) expect(rectGap(car, c), c.id).toBeGreaterThanOrEqual(20);
    expect(layout.decor.cars.filter((c) => c.burning === true).length).toBe(1);
  });

  it('un seul feu groupé : deux foyers (capot, habitacle) sur la voiture ; boîtes calcinées sous la hauteur d\'une voiture', () => {
    const car = layout.decor.cars.find((c) => c.burning === true);
    const spots = carFireSpots(car);
    expect(spots.map((q) => q.id)).toEqual(['capot', 'habitacle']);
    for (const q of spots) {
      expect(q.x).toBeGreaterThan(car.x);
      expect(q.x).toBeLessThan(car.x + car.w);
      expect(q.z).toBeGreaterThan(car.y);
      expect(q.z).toBeLessThan(car.y + car.h);
    }
    const parts = burntCarParts(car);
    expect(parts.boxes.length).toBe(3);
    expect(parts.wheels.length).toBe(4);
    for (const b of parts.boxes) expect(b.y1).toBeLessThanOrEqual(55);
  });

  it('decorProblems est vide ; aucun arbre, buisson ou décor vivant sur l\'emprise des épaves', () => {
    expect(decorProblems(layout.decor, world)).toEqual([]);
    for (const k of layout.decor.keepOut) {
      for (const t of layout.decor.trees) expect(rectGap(t, k), t.id).toBeGreaterThanOrEqual(40);
      for (const b of layout.decor.bushes) expect(rectGap({ x: b.x - b.r, y: b.y - b.r, w: 2 * b.r, h: 2 * b.r }, k), b.id).toBeGreaterThanOrEqual(20);
    }
    const lv = generateLivelyDecor({ size: layout.size, footprint: layout.floor, decor: layout.decor });
    const boxes = [...lv.deadTrees.map((t) => t.box), ...lv.tufts.map((t) => t.box), ...lv.puddles, ...lv.rubble, ...lv.barrels.map((b) => b.box), ...lv.fence.posts.map((p) => ({ x: p.x - 3, y: p.y - 3, w: 6, h: 6 }))];
    for (const k of layout.decor.keepOut) for (const b of boxes) expect(rectGap(b, k)).toBeGreaterThan(0);
  });

  it('npm run carte refuse un hélicoptère mal placé : dans un couloir, trop près du bâtiment, ou dans un autre coin', () => {
    const run = (h) => planToWorld(plan, params, { epaves: { ...epaves, helicoptere: { ...epaves.helicoptere, ...h } } }).report;
    expect(run({}).violations).toEqual([]);
    expect(run({ y: 145 }).violations.some((v) => v.includes('couloir'))).toBe(true); // vers le couloir de F2
    expect(run({ y: 190 }).violations.some((v) => v.includes('du bâtiment'))).toBe(true);
    expect(run({ coin: [49, 208] }).violations.some((v) => v.includes('angle du L'))).toBe(true);
    expect(run({ x: 120 }).violations.some((v) => v.includes('quart extérieur'))).toBe(true);
  });
});
