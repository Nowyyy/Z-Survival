// Lot 3g, retours du propriétaire : sortie de l'escalier par le côté au pied (stair-walk.js), emprise d'escalier qui suit les marches (maps.js, `free`),
// fenêtre retirée et emprise d'escalier par décision (decisions.js), aspect du mobilier d'après le modèle (mobilier-aspect.js), grille (décor léger),
// murs jusqu'au plafond (render.json).
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { startWalk, stepWalk } from '../../js/core/stair-walk.js';
import { STATUS, applyDecisions } from '../../js/core/decisions.js';
import { LOOKS, MAX_HEIGHT, boxTriangles, lookOf, pieceBoxes, unitHash } from '../../js/core/mobilier-aspect.js';
import { CATALOGUE, itemQuads } from '../../js/core/decor-interieur.js';
import { generateMapFiles } from '../../scripts/plan-vers-monde.mjs';

const DIR = 'data/game/maps/rez-de-chaussee';
const load = (f) => JSON.parse(readFileSync(f, 'utf8'));
const world = load(`${DIR}/world.json`);
const plan = load(`${DIR}/plan.json`);
const mobilier = load(`${DIR}/mobilier.world.json`);
// Escalier droit : 50 de palier plat (t = 0), puis 200 de marches vers le sud.
const PATH = [{ x: 0, y: 0, t: 0 }, { x: 0, y: 50, t: 0 }, { x: 0, y: 250, t: 1 }];

describe('escalier : sortie par le côté au pied', () => {
  it('sur le palier plat du pied, s\'écarter fait sortir de l\'escalier au rez-de-chaussée (sideExit)', () => {
    const w = startWalk('e', 'rdc');
    const r = stepWalk(w, PATH, { pos: { x: 40, y: 20 }, dir: { x: 1, y: 0 }, speed: 200, dt: 0.05, width: 120, radius: 18, sideExit: true });
    expect(r.done).toBe('rdc');
    expect(r.walk).toBeNull();
    expect(r.pos.x).toBeGreaterThan(42);
  });

  it('sans sideExit (zombies), la rambarde retient toujours sur le palier', () => {
    const r = stepWalk(startWalk('e', 'rdc'), PATH, { pos: { x: 40, y: 20 }, dir: { x: 1, y: 0 }, speed: 200, dt: 0.05, width: 120, radius: 18 });
    expect(r.done).toBeNull();
    expect(r.pos.x).toBeLessThanOrEqual(42 + 1e-6);
  });

  it('sur les marches (t > 0), la rambarde retient même avec sideExit', () => {
    const r = stepWalk(startWalk('e', 'rdc'), PATH, { pos: { x: 40, y: 150 }, dir: { x: 1, y: 0 }, speed: 200, dt: 0.05, width: 120, radius: 18, sideExit: true });
    expect(r.done).toBeNull();
    expect(r.pos.x).toBeLessThanOrEqual(42 + 1e-6);
  });

  it('dans la largeur du palier, on reste dans l\'escalier', () => {
    const r = stepWalk(startWalk('e', 'rdc'), PATH, { pos: { x: 10, y: 20 }, dir: { x: 1, y: 0 }, speed: 100, dt: 0.05, width: 120, radius: 18, sideExit: true });
    expect(r.done).toBeNull();
  });
});

describe('escalier courbe : l\'emprise suit les marches', () => {
  const parts = world.obstacles.filter((o) => o.kind === 'escalier' && /^escalier-courbe(\.\d+)?$/.test(o.id));
  const stair = world.stairs.find((s) => s.id === 'escalier-courbe');

  it('plusieurs morceaux, tous dans l\'emprise entière (world.stairs, inchangée)', () => {
    expect(parts.length).toBeGreaterThan(1);
    for (const p of parts) expect(p.x >= stair.x - 1e-6 && p.y >= stair.y - 1e-6 && p.x + p.w <= stair.x + stair.w + 1e-6 && p.y + p.h <= stair.y + stair.h + 1e-6, p.id).toBe(true);
  });

  it('le coin intérieur (près du pivot) est libre ; l\'arc des marches est couvert', () => {
    const at = (px, py) => parts.some((p) => { const x = px * 5 + 800; const y = py * 5 + 800; return x > p.x && x < p.x + p.w && y > p.y && y < p.y + p.h; });
    expect(at(258, 266)).toBe(false); // pivot (254,5 ; 270), rayon < 11
    expect(at(273, 262)).toBe(true); // rayon 19 : sur les marches
    expect(at(262, 250)).toBe(true);
  });

  it('les morceaux sont d\'un seul tenant (chacun en touche un autre)', () => {
    const touch = (a, b) => a.x <= b.x + b.w && b.x <= a.x + a.w && a.y <= b.y + b.h && b.y <= a.y + a.h;
    for (const p of parts) expect(parts.some((q) => q !== p && touch(p, q)), p.id).toBe(true);
  });

  it('npm run carte ne les refusionne pas en un rectangle et ne signale aucun problème', () => {
    const out = generateMapFiles('rez-de-chaussee');
    expect(out.report.valid).toBe(true);
    expect(out.problems).toEqual([]);
    expect(JSON.parse(out.world).obstacles.filter((o) => o.kind === 'escalier').length).toBe(parts.length + 1);
  });
});

describe('décisions : fenêtre retirée, emprise d\'escalier', () => {
  const base = { windows: [{ id: 'F7', side: 'sud', x: 10, y: 0 }, { id: 'F8', side: 'sud', x: 50, y: 0 }], stairs: [{ id: 's', x0: 0, y0: 0, x1: 10, y1: 10 }], furniture: [], pillars: [] };

  it('retirer une fenêtre exige l\'accord du propriétaire ; appliquée puis déjà appliquée', () => {
    const d = { id: 'F7', floor: 'rdc', action: 'retirer', level: 'plus-60' };
    expect(applyDecisions({ rdc: base }, [d]).report[0].status).toBe(STATUS.refused);
    const a = applyDecisions({ rdc: base }, [{ ...d, approved: true }]);
    expect(a.sources.rdc.windows.map((w) => w.id)).toEqual(['F8']);
    expect(applyDecisions(a.sources, [{ ...d, approved: true }]).report[0].status).toBe(STATUS.already);
  });

  it('emprise d\'escalier (`free`) : accord exigé, idempotente, la forme ne change pas', () => {
    const d = { id: 's', floor: 'rdc', action: 'corriger', to: { free: [{ x0: 0, y0: 0, x1: 3, y1: 3 }] }, level: '15-60' };
    expect(applyDecisions({ rdc: base }, [d]).report[0].status).toBe(STATUS.refused);
    const a = applyDecisions({ rdc: base }, [{ ...d, approved: true }]);
    expect(a.sources.rdc.stairs[0]).toEqual({ id: 's', x0: 0, y0: 0, x1: 10, y1: 10, free: [{ x0: 0, y0: 0, x1: 3, y1: 3 }] });
    expect(applyDecisions(a.sources, [{ ...d, approved: true }]).report[0].status).toBe(STATUS.already);
  });

  it('la carte n\'a plus de F7 ; F8 garde sa place (161 px, mur sud)', () => {
    expect(plan.windows.some((w) => w.id === 'F7')).toBe(false);
    expect(plan.windows.find((w) => w.id === 'F8')).toMatchObject({ x: 161, y: 352, side: 'sud' });
    expect(world.windows.map((w) => w.id)).not.toContain('F7');
  });
});

describe('aspect du mobilier d\'après le modèle', () => {
  const piece = { id: 'X', kind: 'table', x: 0, y: 0, w: 100, h: 40 };

  it('aspect d\'après les composants du modèle', () => {
    expect(lookOf(piece, ['shelf'])).toBe('etagere');
    expect(lookOf(piece, ['Vertical_filing_short'])).toBe('classeur');
    expect(lookOf(piece, ['Component_1', 'Component_2'])).toBe('caisses');
    expect(lookOf(piece, ['Computer_desk_30x36x27'])).toBe('bureau');
    expect(lookOf(piece, ['Bar_stool'])).toBe('tabouret');
    expect(lookOf(piece, ['Call_of_Duty__World_at_War_Nazi_Zombies__Mystery_Box_'])).toBe('coffre');
    expect(lookOf(piece, ['Component_3'])).toBe('comptoir');
  });

  it('pièce sans objet du modèle : caisses, gravats, étagère, ou muret pour une cloison relevée sur le bâti', () => {
    expect(lookOf({ kind: 'comptoir', provisional: true })).toBe('gravats');
    expect(lookOf({ kind: 'armoire', provisional: true })).toBe('etagere');
    expect(lookOf({ kind: 'caisse', provisional: true })).toBe('caisses');
    expect(lookOf({ kind: 'comptoir', source: 'modele' })).toBe('muret');
  });

  it.each(LOOKS)('%s : boîtes dans le rectangle de la pièce, hauteur 70 au plus, aucune chaise', (look) => {
    const boxes = pieceBoxes(piece, [], { look });
    expect(boxes.length).toBeGreaterThan(0);
    for (const b of boxes) {
      expect(b.y1).toBeLessThanOrEqual(MAX_HEIGHT);
      expect(b.x0).toBeGreaterThanOrEqual(-1e-6);
      expect(b.x1).toBeLessThanOrEqual(100 + 1e-6);
      expect(b.z0).toBeGreaterThanOrEqual(-1e-6);
      expect(b.z1).toBeLessThanOrEqual(40 + 1e-6);
      expect(b.x1).toBeGreaterThan(b.x0);
    }
  });

  it('les caisses du modèle gardent leur place et leurs proportions (hauteur ramenée sous 70)', () => {
    const objs = [{ x0: 0, x1: 30, z0: 0, z1: 30, y0: 0, y1: 36 }, { x0: 0, x1: 30, z0: 0, z1: 30, y0: 36, y1: 84 }];
    const boxes = pieceBoxes({ id: 'C', kind: 'table', x: 0, y: 0, w: 30, h: 30 }, objs, { look: 'caisses' });
    expect(boxes).toHaveLength(2);
    expect(boxes[1].y1).toBeCloseTo(70, 5);
    expect(boxes[0].y1 / boxes[1].y1).toBeCloseTo(36 / 84, 5);
  });

  it('déterministe ; entrées invalides : aucune boîte, aucune exception', () => {
    expect(pieceBoxes(piece, [], { look: 'gravats' })).toEqual(pieceBoxes(piece, [], { look: 'gravats' }));
    expect(pieceBoxes(null)).toEqual([]);
    expect(pieceBoxes({ x: 0, y: 0, w: -1, h: 3 })).toEqual([]);
    expect(unitHash('a', 1)).toBe(unitHash('a', 1));
    expect(boxTriangles(null)).toBe(0);
  });

  it('mobilier.world.json : sortie exacte de npm run carte, une entrée par pièce dessinée, boîtes sous 70', () => {
    expect(readFileSync(`${DIR}/mobilier.world.json`, 'utf8')).toBe(generateMapFiles('rez-de-chaussee').mobilier);
    const pieces = Object.entries(mobilier.pieces);
    expect(pieces.length).toBeGreaterThan(30);
    for (const [id, p] of pieces) {
      expect(LOOKS, id).toContain(p.look);
      for (const b of p.boxes) expect(b.y1, id).toBeLessThanOrEqual(MAX_HEIGHT);
    }
    expect(mobilier.triangles).toBe(pieces.reduce((s, [, p]) => s + boxTriangles(p.boxes), 0));
  });

  it('les boîtes restent dans le rectangle de collision de leur obstacle (le dessin ne déborde pas)', () => {
    const obstacles = [...world.obstacles, ...load(`${DIR}/etage.world.json`).obstacles];
    for (const [id, p] of Object.entries(mobilier.pieces)) {
      const o = obstacles.find((q) => q.id === p.obstacle);
      expect(o, id).toBeTruthy();
      for (const b of p.boxes) expect(b.x0 >= o.x - 1e-6 && b.x1 <= o.x + o.w + 1e-6 && b.z0 >= o.y - 1e-6 && b.z1 <= o.y + o.h + 1e-6, id).toBe(true);
    }
  });

  it('les pièces associées à des objets du modèle le disent (identifiants des objets)', () => {
    expect(mobilier.pieces.M12.look).toBe('classeur');
    expect(mobilier.pieces.M12.modele.length).toBeGreaterThan(0);
    expect(mobilier.pieces.P2.look).toBe('etagere');
  });
});

describe('grille et murs jusqu\'au plafond', () => {
  it('grille : 10 quadrilatères (8 barreaux, 2 traverses), 20 triangles, sous 70', () => {
    const it0 = { id: 'g', kind: 'grille', floor: 'rdc', a: { x: 0, y: 0 }, b: { x: 140, y: 0 }, n: { x: 0, y: 1 }, depth: 3 };
    const q = itemQuads(it0);
    expect(q).toHaveLength(10);
    expect(CATALOGUE.grille.tris).toBe(20);
    for (const quad of q) for (const p of quad.p) expect(p[1]).toBeLessThanOrEqual(70);
  });

  it('la grille est posée sur le mur sud, là où était F7 (relevée sur le modèle)', () => {
    const g = load(`${DIR}/decor-interieur.world.json`).items.find((d) => d.kind === 'grille');
    expect(g).toMatchObject({ on: 'contour-7', source: 'modele', floor: 'rdc' });
    expect(Math.abs((g.a.x + g.b.x) / 2 - (187 * 5 + 800))).toBeLessThan(20);
  });

  it('render.json : murs jusqu\'au plafond activés (essai), sous floorLift', () => {
    const r = load('data/game/render.json');
    expect(r.ceilingWalls).toBe(true);
    expect(r.floorLift).toBeGreaterThan(r.wallHeight);
  });
});
