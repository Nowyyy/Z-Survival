// Lot 3g, retours du propriétaire (deux passes) : sortie de l'escalier par le côté au pied (stair-walk.js), emprise d'escalier qui suit les marches (maps.js, `free`),
// fenêtre retirée et emprise d'escalier par décision (decisions.js), aspect du mobilier d'après le modèle (mobilier-aspect.js), grille (décor léger),
// murs jusqu'au plafond (render.json).
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { startWalk, stepWalk } from '../../js/core/stair-walk.js';
import { STATUS, applyDecisions } from '../../js/core/decisions.js';
import { LOOKS, MAX_HEIGHT, boxTriangles, lookOf, pieceBoxes, unitHash } from '../../js/core/mobilier-aspect.js';
import { CATALOGUE, itemQuads } from '../../js/core/decor-interieur.js';
import { generateMapFiles } from '../../scripts/plan-vers-monde.mjs';
import * as THREE from 'three';
import { REGIONS } from '../../js/core/mobilier-aspect.js';
import { doorBoxes, grilleBoxes, rubbleBoxes } from '../../js/core/portes-aspect.js';
import { DEFAULTS, hiddenFrom, segmentHitsBox, seeThroughLevel, seeThroughSettings } from '../../js/core/see-through.js';
import { plankSettings } from '../../js/core/plank-layout.js';
import { plankSheet } from '../../js/core/texgen.js';
import { cutGrilles } from '../../js/game/world.js';
import { createWindowMeshes } from '../../js/game/windows-mesh.js';

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

// Retours du propriétaire (deuxième passe) : vraies portes, éboulis aux escaliers fermés, ouvertures grillagées, mur percé autour du joueur, pastilles incrustées.
describe('portes, éboulis et grilles (portes-aspect.js)', () => {
  const inside = (b, r, h) => b.x0 >= r.x - 1e-6 && b.x1 <= r.x + r.w + 1e-6 && b.z0 >= r.y - 1e-6 && b.z1 <= r.y + r.h + 1e-6 && b.y0 >= -1e-6 && b.y1 <= h + 1e-6;

  it('porte : montants, traverse, planches, renforts, poignée et gonds ; dans le rectangle à 4 près (renforts et poignées dépassent du battant, pas du mur)', () => {
    const r = { x: 0, y: 0, w: 80, h: 38 };
    const boxes = doorBoxes(r, 120, 'porte-1');
    expect(boxes.length).toBeGreaterThanOrEqual(12);
    for (const b of boxes) expect(inside(b, { x: -4, y: -4, w: 88, h: 46 }, 120), JSON.stringify(b)).toBe(true);
    expect(boxes.filter((b) => b.region === REGIONS.metal).length).toBeGreaterThanOrEqual(4);
    // Vertical : même porte, axe z.
    for (const b of doorBoxes({ x: 0, y: 0, w: 38, h: 80 }, 59, 'x')) expect(b.y1).toBeLessThanOrEqual(59);
  });

  it('éboulis : couvre l\'emprise du bloc vue du dessus (aucun passage à l\'œil), 70 au plus, plus haut au milieu', () => {
    const r = { x: 100, y: 200, w: 138, h: 93 };
    const boxes = rubbleBoxes(r, 66, 'porte-2');
    for (const b of boxes) expect(inside(b, r, 70), JSON.stringify(b)).toBe(true);
    let covered = 0;
    let n = 0;
    for (let x = r.x + 1; x < r.x + r.w; x += 4) {
      for (let z = r.y + 1; z < r.y + r.h; z += 4) {
        n += 1;
        if (boxes.some((b) => x >= b.x0 && x <= b.x1 && z >= b.z0 && z <= b.z1 && b.y0 === 0)) covered += 1;
      }
    }
    expect(covered / n).toBeGreaterThanOrEqual(0.97);
    const topAt = (x, z) => Math.max(0, ...boxes.filter((b) => x >= b.x0 && x <= b.x1 && z >= b.z0 && z <= b.z1).map((b) => b.y1));
    expect(topAt(r.x + r.w / 2, r.y + r.h / 2)).toBeGreaterThan(topAt(r.x + 2, r.y + 2));
  });

  it('grille : barreaux tous les 10 environ et deux traverses, au milieu de l\'épaisseur', () => {
    const r = { x: 0, y: 0, w: 115, h: 38 };
    const boxes = grilleBoxes(r, 179);
    expect(boxes).toHaveLength(2 + 11);
    for (const b of boxes) expect(inside(b, r, 179)).toBe(true);
    for (const b of boxes.slice(2)) expect((b.z0 + b.z1) / 2).toBeCloseTo(19, 5);
  });

  it('grille plus étroite que le mur n\'est épais (30 sur 38) : les barreaux suivent le mur (axe imposé), pas l\'épaisseur', () => {
    const r = { x: 0, y: 0, w: 30, h: 38 };
    const boxes = grilleBoxes(r, 179, 10, true);
    for (const b of boxes) expect((b.z0 + b.z1) / 2).toBeCloseTo(19, 5);
    expect(boxes[0].x1 - boxes[0].x0).toBeCloseTo(30, 5);
  });

  it('entrées invalides : aucune boîte ; déterministe', () => {
    expect(doorBoxes(null, 10)).toEqual([]);
    expect(rubbleBoxes({ x: 0, y: 0, w: 0, h: 3 })).toEqual([]);
    expect(grilleBoxes({ x: 0, y: 0, w: 10, h: 3 }, 2)).toEqual([]);
    expect(rubbleBoxes({ x: 0, y: 0, w: 50, h: 40 }, 60, 'a')).toEqual(rubbleBoxes({ x: 0, y: 0, w: 50, h: 40 }, 60, 'a'));
  });

  it('cutGrilles : le mur est ouvert sur [a, b] (toute sa hauteur), le reste du mur est gardé', () => {
    const wall = { x: 500, y: 90, z: 1000, sx: 1000, sy: 180, sz: 40 };
    const g = { a: { x: 600, y: 980 }, b: { x: 500, y: 980 }, n: { x: 0, y: -1 } };
    const { walls, holes } = cutGrilles([wall], [g], 40, 181);
    expect(holes).toEqual([{ x: 500, y: 981, w: 100, h: 38, top: 179.5, alongX: true }]);
    expect(walls.map((w) => [w.x - w.sx / 2, w.x + w.sx / 2]).sort((p, q) => p[0] - q[0])).toEqual([[0, 500], [600, 1000]]);
    // Un mur qui ne contient pas l'ouverture n'est pas touché.
    expect(cutGrilles([{ ...wall, z: 2000 }], [g], 40, 181).walls).toEqual([{ ...wall, z: 2000 }]);
  });

  it('deux ouvertures grillagées au sud, d\'après le modèle (aucun mur entre 175 et 198 px, ni entre 145 et 151 px)', () => {
    const items = load(`${DIR}/decor-interieur.world.json`).items.filter((d) => d.kind === 'grille');
    const span = (d) => [Math.min(d.a.x, d.b.x), Math.max(d.a.x, d.b.x)].map((v) => Math.round((v - 800) / 5));
    expect(items.map(span).sort((p, q) => p[0] - q[0])).toEqual([[145, 151], [175, 198]]);
  });
});

describe('mur percé autour du joueur caché (see-through.js)', () => {
  const cam = { x: 0, y: 300, z: 300 };
  const player = { x: 0, y: 26, z: 0 };

  it('un point du mur entre la caméra et le joueur, sur la ligne de visée : tramé (une moitié des pixels)', () => {
    expect(seeThroughLevel({ x: 0, y: 26 + 274 * 0.2, z: 300 * 0.2 }, cam, player)).toBe(0.5);
  });

  it('au bord du cône : un pixel sur quatre ; hors du cône, derrière le joueur ou au sol : dessiné', () => {
    const t = 0.8; // part du chemin de la caméra au joueur : le rayon du cône y vaut 0,8 × radius
    const on = { x: 0, y: 300 - 274 * t, z: 300 - 300 * t };
    expect(seeThroughLevel({ ...on, x: DEFAULTS.radius * t * 0.85 }, cam, player)).toBe(0.25);
    expect(seeThroughLevel({ ...on, x: DEFAULTS.radius * t * 1.1 }, cam, player)).toBe(0);
    expect(seeThroughLevel({ x: 0, y: 10, z: -20 }, cam, player)).toBe(0);
    expect(seeThroughLevel({ x: 0, y: 0.5, z: 5 }, cam, player)).toBe(0);
  });

  it('réglages : render.json ; null si désactivé ; valeurs invalides remplacées', () => {
    expect(seeThroughSettings(load('data/game/render.json').seeThrough)).toMatchObject({ radius: 80, chest: 26, ahead: 12 });
    expect(seeThroughSettings(null)).toBeNull();
    expect(seeThroughSettings({ on: false })).toBeNull();
    expect(seeThroughSettings({ radius: -3 }).radius).toBe(DEFAULTS.radius);
  });

  it('le shader fait le même calcul (aucun matériau transparent : discard tramé)', () => {
    const src = readFileSync('js/game/see-through.js', 'utf8');
    expect(src).toMatch(/discard/);
    expect(src).not.toMatch(/transparent\s*[:=]\s*true|opacity/);
    expect(readFileSync('js/game/world.js', 'utf8')).toMatch(/seeThrough\.apply\(mat\('mur'\)\)/);
  });
});

describe('pastilles incrustées dans le mur (murs jusqu\'au plafond)', () => {
  const settings = { ...plankSettings(load('data/game/windows.json'), load('data/game/render.json')), pipFace: true, pipCenter: 61 };
  const sheet = plankSheet(128, { band: 0.125, strips: 4 });
  const geom = (id, normal) => ({ id, center: { x: 1000, y: 1000 }, normal, tangent: { x: -normal.y, y: normal.x }, width: 72, inner: 20 });

  it('mur sud : face extérieure (celle que voit la caméra) ; mur nord : face intérieure ; à 61 de haut', () => {
    const set = createWindowMeshes({ scene: new THREE.Scene(), material: new THREE.MeshBasicMaterial(), geoms: [geom('S', { x: 0, y: 1 }), geom('N', { x: 0, y: -1 })], settings, sheet, seed: 1 });
    set.sync({ windows: { S: { planks: 4, maxPlanks: 4 }, N: { planks: 4, maxPlanks: 4 } } });
    const [s, n] = set.stats(new THREE.PerspectiveCamera());
    expect([s.pipSide, n.pipSide]).toEqual(['exterieur', 'interieur']);
    expect([s.pipY, n.pipY]).toEqual([61, 61]);
    expect([s.pipsOn, n.pipsOn]).toEqual([4, 4]);
    expect(s.triangles).toBeLessThanOrEqual(42);
  });
});

// Retours du propriétaire (troisième passe) : sortie d'escalier en haut, mur percé seulement si le joueur est caché, feu, murs hauts à l'étage.
describe('escalier : sortie par le côté sur le palier du haut (vers l\'étage)', () => {
  const TOP = [{ x: 0, y: 0, t: 0 }, { x: 0, y: 200, t: 1 }, { x: 0, y: 260, t: 1 }];

  it('sur le palier plat du haut (t = 1), s\'écarter fait sortir à l\'étage', () => {
    const r = stepWalk(startWalk('e', 'rdc'), TOP, { pos: { x: 40, y: 230 }, dir: { x: 1, y: 0 }, speed: 200, dt: 0.05, width: 120, radius: 18, sideExit: true });
    expect(r.done).toBe('etage');
    expect(r.floor).toBe('etage');
  });

  it('place occupée sur l\'étage (free faux : au-dessus du trou) : la rambarde retient', () => {
    const r = stepWalk(startWalk('e', 'rdc'), TOP, { pos: { x: 40, y: 230 }, dir: { x: 1, y: 0 }, speed: 200, dt: 0.05, width: 120, radius: 18, sideExit: { free: () => false } });
    expect(r.done).toBeNull();
    expect(r.pos.x).toBeLessThanOrEqual(42 + 1e-6);
  });

  it('place libre (free vrai) : sortie ; au pied aussi', () => {
    expect(stepWalk(startWalk('e', 'rdc'), TOP, { pos: { x: 40, y: 230 }, dir: { x: 1, y: 0 }, speed: 200, dt: 0.05, width: 120, radius: 18, sideExit: { free: () => true } }).done).toBe('etage');
    expect(stepWalk(startWalk('e', 'rdc'), PATH, { pos: { x: 40, y: 20 }, dir: { x: 1, y: 0 }, speed: 200, dt: 0.05, width: 120, radius: 18, sideExit: { free: () => true } }).done).toBe('rdc');
  });
});

describe('mur percé : seulement quand le joueur est caché, jamais derrière lui', () => {
  const cam = { x: 0, y: 300, z: 300 };
  const wall = { x0: -500, x1: 500, y0: 0, y1: 179, z0: 30, z1: 70 }; // mur entre la caméra (sud) et le joueur

  it('segmentHitsBox : traversée, à côté, au-dessus', () => {
    expect(segmentHitsBox({ x: 0, y: 300, z: 300 }, { x: 0, y: 26, z: 0 }, wall)).toBe(true);
    expect(segmentHitsBox({ x: 0, y: 300, z: 300 }, { x: 0, y: 26, z: 0 }, { ...wall, x0: 100, x1: 200 })).toBe(false);
    expect(segmentHitsBox({ x: 0, y: 300, z: 300 }, { x: 0, y: 26, z: 0 }, { ...wall, y1: 20 })).toBe(false);
  });

  it('hiddenFrom : caché derrière un mur haut ; visible derrière un mur bas loin de lui ; un mur derrière lui ne le cache pas', () => {
    expect(hiddenFrom(cam, { x: 0, y: 0, z: 0 }, [wall])).toBe(true);
    expect(hiddenFrom(cam, { x: 0, y: 0, z: -200 }, [{ ...wall, y1: 10 }])).toBe(false);
    expect(hiddenFrom(cam, { x: 0, y: 0, z: 0 }, [{ ...wall, z0: -70, z1: -30 }])).toBe(false);
    // Décalage vertical (étage, élévation) : le même mur descendu sous le sol ne cache plus.
    expect(hiddenFrom(cam, { x: 0, y: 0, z: 0 }, [wall], DEFAULTS, () => -180)).toBe(false);
  });

  it('un point au-dessus du joueur mais derrière lui à l\'horizontale n\'est jamais tramé (pilier au nord du joueur)', () => {
    expect(seeThroughLevel({ x: 0, y: 150, z: -20 }, cam, { x: 0, y: 26, z: 0 })).toBe(0);
  });
});

describe('feu et murs hauts à l\'étage', () => {
  it('feux.json : un feu sur la pile de caisses P9 (une pièce de mobilier.world.json, aspect caisses)', () => {
    const feux = load(`${DIR}/feux.json`).feux;
    expect(feux).toEqual([{ id: 'feu-P9', floor: 'rdc', piece: 'P9' }]);
    expect(mobilier.pieces.P9.look).toBe('caisses');
  });

  it('createFire : trois maillages (flammes, fumée, lueur), aucune ombre, immobile en mouvement réduit, mêmes particules d\'une partie à l\'autre', async () => {
    const { createFire } = await import('../../js/game/fire.js');
    const palette = { fire: '#000001', fireEdge: '#000002', smoke: '#000003' };
    const spec = { id: 'feu-P9', x: 100, z: 100, y: 37, w: 120, d: 90 };
    const a = createFire(spec, palette);
    const b = createFire(spec, palette);
    expect(a.group.children.map((c) => c.name)).toEqual(['flammes', 'fumee', 'lueur']);
    for (const c of a.group.children) expect(c.castShadow).toBe(false);
    a.update(0.5);
    b.update(0.5);
    expect([...a.group.children[0].geometry.attributes.position.array]).toEqual([...b.group.children[0].geometry.attributes.position.array]);
    const still = createFire(spec, palette, { reduced: true });
    const before = [...still.group.children[0].geometry.attributes.position.array];
    still.update(0.5);
    expect([...still.group.children[0].geometry.attributes.position.array]).toEqual(before);
    // Flammes au-dessus de la pile, dans son emprise (à la dérive près).
    const pos = a.group.children[0].geometry.attributes.position.array;
    for (let i = 0; i < pos.length; i += 3) {
      expect(pos[i + 1]).toBeGreaterThanOrEqual(37);
      expect(Math.abs(pos[i] - 100)).toBeLessThan(80);
    }
  });

  it('aucune couleur en dur dans le feu ; jetons --game-fire, --game-fire-edge, --game-smoke lus par palette.js', () => {
    expect(readFileSync('js/game/fire.js', 'utf8')).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgba?\(/);
    const tokens = readFileSync('css/tokens.css', 'utf8');
    for (const t of ['--game-fire:', '--game-fire-edge:', '--game-smoke:']) expect(tokens).toContain(t);
    expect(readFileSync('js/game/palette.js', 'utf8')).toMatch(/'fire', 'fire-edge', 'smoke'/);
  });

  it('murs hauts aux deux étages (troisième passe) : plus de condition « rdc » sur la hauteur des murs', () => {
    const w = readFileSync('js/game/world.js', 'utf8');
    expect(w).toMatch(/const tall = tallWalls;/);
    expect(w).not.toMatch(/f === 'rdc' && render\.ceilingWalls/);
  });
});
