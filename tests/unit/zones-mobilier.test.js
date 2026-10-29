import { describe, it, expect } from 'vitest';
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { distanceToRect, rectGap, validRects } from '../../js/core/collision.js';
import { analyzeMap, cleanParams, planToWorld, windowZone } from '../../js/core/maps.js';
import { coveredBy, overlapArea, polygonRects, segmentRects } from '../../js/core/shape.js';
import { windowGeometry } from '../../js/core/windows.js';
import { generateMapFiles } from '../../scripts/plan-vers-monde.mjs';
import { metrics } from '../../scripts/zones-metriques.mjs';
import { globalStats, loadMap, zoneStats } from '../../scripts/lib/carte-zones.mjs';

const map = loadMap();
const { plan, world, params, zones, geoms, decor } = map;
const p = cleanParams(params);
// Commit de `main` juste avant le lot 3c (« Update seed.md ») : après la fusion, `main` contient déjà le lot, la comparaison doit rester valable.
const BASE = '5669eb1';
const ORIGINAL = Array.from({ length: 36 }, (_, i) => `M${i + 1}`);
const added = plan.furniture.filter((f) => !ORIGINAL.includes(f.id));
// Règles de la carte : rectangles du plan (world.obstacles), pas les boîtes de collision ajustées des chaises.
const items = world.obstacles.filter((o) => o.outside !== true);
const addedWorld = items.filter((o) => (o.parts ?? [o.id]).some((id) => added.some((a) => a.id === id)));
const walls = segmentRects(world.walls, world.wallThickness);
const doorRectWorld = (() => {
  const op = world.openings.find((o) => o.id === 'ouverture-aile');
  return { x: op.x1 - world.wallThickness / 2, y: Math.min(op.y1, op.y2), w: world.wallThickness, h: Math.abs(op.y2 - op.y1) };
})();

describe('mobilier de complément : plan.json, source unique', () => {
  it('8 à 16 pièces ajoutées après les 36 pièces relevées sur le modèle', () => {
    expect(added.length).toBeGreaterThanOrEqual(8);
    expect(added.length).toBeLessThanOrEqual(16);
    expect(new Set(plan.furniture.map((f) => f.id)).size).toBe(plan.furniture.length);
  });

  it('chaque pièce ajoutée porte son origine : provisional (sans modèle 3D) ou source « modele » ; les pièces d\'origine n\'en portent aucune', () => {
    for (const a of added) expect(a.provisional === true || a.source === 'modele', a.id).toBe(true);
    for (const o of plan.furniture.filter((f) => ORIGINAL.includes(f.id))) expect(o.provisional === undefined && o.source === undefined, o.id).toBe(true);
  });

  it('le modèle 3D du propriétaire est absent du dépôt : toutes les pièces ajoutées sont provisoires', () => {
    const files = execSync('git ls-files', { encoding: 'utf8' }).split('\n');
    expect(files.some((f) => f.startsWith('Docs/ref/modele-rdc/'))).toBe(false);
    for (const a of added) expect(a.provisional, a.id).toBe(true);
  });

  it('les 36 pièces d\'origine de plan.json sont inchangées depuis le commit précédant le lot', () => {
    let before;
    try {
      before = JSON.parse(execSync(`git show ${BASE}:data/game/maps/rez-de-chaussee/plan.json`, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }));
    } catch {
      return;
    }
    expect(plan.furniture.filter((f) => ORIGINAL.includes(f.id))).toEqual(before.furniture);
    expect({ ...plan, furniture: undefined }).toEqual({ ...before, furniture: undefined });
  });

  it('genres existants seulement ; hauteurs de params.json (au plus 70)', () => {
    const kinds = new Set(['table', 'comptoir', 'caisse', 'etagere', 'armoire', 'colonne']);
    for (const a of added) {
      expect(kinds.has(a.kind), a.id).toBe(true);
      expect(p.kindHeights[a.kind], a.id).toBeLessThanOrEqual(p.maxHeight);
    }
    for (const o of addedWorld) expect(o.hauteur).toBeLessThanOrEqual(70);
  });

  it('world.json et decor.json sont identiques à la sortie de npm run carte (plan.json est la source unique)', () => {
    const out = generateMapFiles('rez-de-chaussee');
    expect(readFileSync('data/game/maps/rez-de-chaussee/world.json', 'utf8')).toBe(out.world);
    expect(readFileSync('data/game/maps/rez-de-chaussee/decor.json', 'utf8')).toBe(out.decor);
    expect(out.report.valid).toBe(true);
  });

  it('chaque pièce ajoutée est dans world.json, marquée provisoire, sans avoir été retirée', () => {
    expect(addedWorld.length).toBeGreaterThanOrEqual(added.length - 2);
    for (const o of addedWorld) expect(o.provisional, o.id).toBe(true);
    const retired = world.generation.retired.map((r) => r.id);
    for (const a of added) expect(retired.includes(a.id), a.id).toBe(false);
    for (const a of added) expect(addedWorld.some((o) => (o.parts ?? [o.id]).includes(a.id)), a.id).toBe(true);
  });

  it('les fusions, rognages et retraits sont exposés dans world.generation', () => {
    for (const key of ['merged', 'retired', 'clipped', 'snapped', 'shifts']) expect(Array.isArray(world.generation[key]), key).toBe(true);
    expect(world.generation.retired.length).toBeGreaterThan(0);
    expect(world.generation.merged.every((m) => m.parts.length > 1)).toBe(true);
  });
});

describe('mobilier de complément : aire libre', () => {
  const g = globalStats(map);

  it('aire libre de tout le rez-de-chaussée entre 76 % et 83 % de l\'aire intérieure', () => {
    expect(g.ratio).toBeGreaterThanOrEqual(0.76);
    expect(g.ratio).toBeLessThanOrEqual(0.83);
  });

  it('jamais sous 70 % dans une zone (calcul avec les régions de zones.json)', () => {
    for (const z of zones.zones) {
      const s = zoneStats(map, z.id);
      expect(s.ratio, z.id).toBeGreaterThanOrEqual(0.7);
      expect(s.ratio, z.id).toBeLessThan(0.9);
    }
  });

  it('l\'aire libre a baissé par rapport à l\'état précédant le lot (le mobilier ajouté occupe de la place)', () => {
    let before;
    try {
      before = JSON.parse(execSync(`git show ${BASE}:data/game/maps/rez-de-chaussee/world.json`, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }));
    } catch {
      return;
    }
    expect(analyzeMap(before).freeArea).toBeGreaterThan(analyzeMap(world).freeArea);
  });
});

describe('mobilier de complément : règles de la carte, zone par zone, porte fermée et ouverte', () => {
  it('deux pièces sont au contact ou séparées d\'au moins le couloir minimal (50), sans recouvrement', () => {
    const pairs = items.flatMap((a, i) => items.slice(i + 1).map((b) => [a, b]));
    for (const [a, b] of pairs) {
      const gap = rectGap(a, b);
      expect(gap === 0 || gap >= world.minCorridor, `${a.id} / ${b.id} : ${gap}`).toBe(true);
      expect(overlapArea(a, b), `${a.id} / ${b.id}`).toBe(0);
    }
  });

  it('toute pièce ajoutée est au contact d\'un autre élément ou à 70 au moins : intervalles franchissables par un zombie (rayon 20 + marge 4)', () => {
    for (const a of addedWorld) {
      for (const b of [...items.filter((o) => o !== a), ...walls]) {
        const gap = rectGap(a, b);
        if (gap === 0) continue;
        const dx = Math.max(b.x - (a.x + a.w), 0, a.x - (b.x + b.w));
        const dy = Math.max(b.y - (a.y + a.h), 0, a.y - (b.y + b.h));
        if (dx > 0 && dy > 0) continue;
        const overlap = dx >= dy ? Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y) : Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
        if (overlap < 40) continue;
        expect(gap, `${a.id} / ${b.id}`).toBeGreaterThanOrEqual(70);
      }
    }
  });

  it('aucune pièce ne recouvre l\'épaisseur d\'un mur', () => {
    for (const o of items) for (const w of walls) expect(overlapArea(o, w), `${o.id} / ${w.id}`).toBe(0);
  });

  it('chaque pièce ajoutée est entièrement dans le bâtiment', () => {
    const floor = polygonRects(world.contour);
    for (const o of addedWorld) expect(coveredBy(o, floor), o.id).toBe(true);
  });

  it('aucune pièce dans la zone de départ libre de 120', () => {
    for (const o of items) expect(distanceToRect(world.start.x, world.start.y, o), o.id).toBeGreaterThanOrEqual(120);
  });

  it.each(['F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8'])('aucune pièce dans les 150 de profondeur libre derrière %s ni à moins de 80 de son point de réparation', (id) => {
    const w = world.windows.find((q) => q.id === id);
    const zone = windowZone(w, world.windowSize, 150, world.wallThickness);
    const g = geoms.find((q) => q.id === id);
    for (const o of items) {
      expect(overlapArea(zone, o), `${id} / ${o.id}`).toBe(0);
      expect(distanceToRect(g.repairSpot.x, g.repairSpot.y, o), `${id} réparation / ${o.id}`).toBeGreaterThanOrEqual(map.windowsCfg.repairRadius);
    }
    expect(windowGeometry(w, map.windowsCfg).repairSpot).toEqual(g.repairSpot);
  });

  it('aucune pièce ajoutée dans l\'ouverture de la porte ni à moins de 100 de part et d\'autre', () => {
    for (const o of addedWorld) expect(rectGap(o, doorRectWorld), o.id).toBeGreaterThanOrEqual(p.doorClearance);
    for (const o of items) expect(overlapArea(o, doorRectWorld), o.id).toBe(0);
  });

  it('la porte ouverte laisse un passage libre d\'au moins 85 (largeur de l\'ouverture)', () => {
    const a = analyzeMap(world);
    expect(a.neck.free).toBeGreaterThanOrEqual(85);
    expect(a.neck.clearance).toBeGreaterThanOrEqual(85);
  });

  it('espace libre connexe, départ et fenêtres reliés par des largeurs d\'au moins 50 (porte ouverte)', () => {
    const a = analyzeMap(world);
    expect(a.components).toBe(1);
    expect(a.startReachable).toBe(true);
    expect(a.unreachable).toEqual([]);
  });

  it('plus petit couloir de chaque zone : 50 au moins', () => {
    for (const row of metrics(map, { simulation: false }).zones) expect(row.corridor === null || row.corridor >= 50, row.id).toBe(true);
  });

  it('chaque zone a des pièces : la grande salle et l\'aile sont habillées', () => {
    const zoneOf = (o) => zones.zones.find((z) => polygonRects(z.region).some((r) => o.x + o.w / 2 >= r.x && o.x + o.w / 2 <= r.x + r.w && o.y + o.h / 2 >= r.y && o.y + o.h / 2 <= r.y + r.h))?.id;
    const byZone = Object.groupBy(addedWorld, zoneOf);
    expect(byZone.depart?.length).toBeGreaterThanOrEqual(4);
    expect(byZone.aile?.length).toBeGreaterThanOrEqual(4);
  });

  it('aucun point d\'apparition ni emplacement d\'attaque n\'est recouvert par une pièce', () => {
    for (const sp of decor.spawnPoints) for (const o of items) expect(distanceToRect(sp.x, sp.y, o), `${sp.id} / ${o.id}`).toBeGreaterThan(20);
    for (const g of geoms) for (const s of g.slots) for (const o of items) expect(distanceToRect(s.x, s.y, o), `${g.id} / ${o.id}`).toBeGreaterThan(20);
  });
});

describe('mobilier de complément : la chaîne de conversion applique les règles', () => {
  const run = (piece, extras = { doors: [{ id: 'porte-1', opening: { x1: 138, y1: 250, x2: 138, y2: 233 } }] }) => planToWorld({ ...plan, furniture: [...plan.furniture.filter((f) => ORIGINAL.includes(f.id)), piece] }, params, extras);

  it('une pièce de complément à moins de 100 de la porte est retirée (motif donné)', () => {
    const out = run({ id: 'T1', x0: 160, y0: 252, x1: 170, y1: 262, kind: 'caisse', provisional: true });
    expect(out.report.retired.find((r) => r.id === 'T1')?.reason).toMatch(/porte porte-1/);
  });

  it('la même pièce sans marque de complément n\'est pas soumise à cette règle (le mobilier relevé reste intact)', () => {
    const out = run({ id: 'T1', x0: 160, y0: 252, x1: 170, y1: 262, kind: 'caisse' });
    expect(out.report.retired.find((r) => r.id === 'T1')?.reason ?? '').not.toMatch(/porte porte-1/);
  });

  it('une pièce de complément à moins de 80 d\'un point de réparation est retirée', () => {
    const out = run({ id: 'T2', x0: 320, y0: 326, x1: 330, y1: 334, kind: 'caisse', provisional: true });
    expect(out.report.retired.find((r) => r.id === 'T2')?.reason).toMatch(/point de réparation/);
  });

  it('une pièce dans la zone de départ libre est retirée ; une pièce trop haute aussi', () => {
    expect(run({ id: 'T3', x0: 395, y0: 275, x1: 410, y1: 290, kind: 'caisse', provisional: true }).report.retired.find((r) => r.id === 'T3')?.reason).toMatch(/zone de départ/);
    const tall = planToWorld({ ...plan, furniture: [{ id: 'T4', x0: 250, y0: 300, x1: 262, y1: 310, kind: 'colonne', provisional: true }] }, { ...params, maxHeight: 60 });
    expect(tall.report.retired.find((r) => r.id === 'T4')?.reason).toMatch(/trop haute/);
  });

  it('sans extras, planToWorld se comporte comme avant (la règle de la porte ne s\'applique pas)', () => {
    const out = planToWorld({ ...plan, furniture: [...plan.furniture, { id: 'T1', x0: 160, y0: 252, x1: 170, y1: 262, kind: 'caisse', provisional: true }] }, params);
    expect(out.report.retired.find((r) => r.id === 'T1')?.reason ?? '').not.toMatch(/porte/);
  });

  it('planToWorld ne modifie ni le plan ni les paramètres', () => {
    const frozen = JSON.parse(JSON.stringify(plan));
    run({ id: 'T5', x0: 300, y0: 300, x1: 310, y1: 310, kind: 'caisse', provisional: true });
    expect(plan).toEqual(frozen);
  });

  it('les rectangles de validRects du monde sont tous valides', () => {
    expect(validRects(world.obstacles)).toHaveLength(world.obstacles.length);
  });
});
