// Lot 3g, partie C : décor léger intérieur (js/core/decor-interieur.js, decor-interieur.json et son dérivé) — catalogue, triangles, hauteurs,
// conversion, coupe autour des fenêtres, zones de dégagement, budget, identité du fichier dérivé.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  BUDGET, CATALOGUE, KINDS, MAX_FREE_HEIGHT, MAX_HEIGHT, clearanceZones, cutWallItem, decorToWorld, forbiddenFor, itemQuads, itemTriangles, placeDecor, totalTriangles,
} from '../../js/core/decor-interieur.js';
import { parseZones, zonesToWorld } from '../../js/core/zones.js';
import { generateMapFiles } from '../../scripts/plan-vers-monde.mjs';

const DIR = 'data/game/maps/rez-de-chaussee';
const load = (f) => JSON.parse(readFileSync(f, 'utf8'));
const source = load(`${DIR}/decor-interieur.json`);
const derived = load(`${DIR}/decor-interieur.world.json`);
const world = load(`${DIR}/world.json`);
const etageWorld = load(`${DIR}/etage.world.json`);
const params = load('data/game/maps/params.json');
const zones = zonesToWorld(parseZones(load(`${DIR}/zones.json`)), world.transform);
const atlas = load('data/game/textures.json').textures.find((t) => t.id === 'atlas-props').params.regions.map((r) => r.id);
const overlap = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

describe('catalogue du décor léger', () => {
  it('fermé : 8 types au plus', () => {
    expect(KINDS.length).toBeLessThanOrEqual(8);
    expect(KINDS).toEqual(['plinthe', 'tuyau', 'applique', 'affiche', 'tapis', 'tache', 'sacs', 'bidon']);
  });

  it.each(KINDS)('%s : 24 triangles au plus, hauteur 70 au plus, région d\'atlas existante', (k) => {
    const c = CATALOGUE[k];
    expect(c.tris).toBeLessThanOrEqual(24);
    expect(c.z1).toBeLessThanOrEqual(MAX_HEIGHT);
    expect(atlas).toContain(c.region);
    if (!c.wall) expect(c.z1).toBeLessThanOrEqual(MAX_FREE_HEIGHT);
  });

  it.each(KINDS)('%s : la géométrie a exactement le nombre de triangles annoncé', (k) => {
    const it = CATALOGUE[k].wall
      ? { id: 'x', kind: k, floor: 'rdc', a: { x: 0, y: 0 }, b: { x: 100, y: 0 }, n: { x: 0, y: 1 }, depth: CATALOGUE[k].depth }
      : { id: 'x', kind: k, floor: 'rdc', x: 0, y: 0, w: 40, h: 30, rot: 10 };
    expect(itemTriangles(it)).toBe(CATALOGUE[k].tris);
  });

  it('budget : 1 500 triangles et 6 appels au plus', () => {
    expect(BUDGET).toEqual({ triangles: 1500, calls: 6 });
  });

  it('géométrie : normales unitaires, hauteurs dans [0, 70], quatre coins par quadrilatère', () => {
    for (const it of derived.items) {
      for (const q of itemQuads(it)) {
        expect(q.p).toHaveLength(4);
        expect(Math.hypot(...q.n)).toBeCloseTo(1, 5);
        for (const p of q.p) {
          expect(p[1]).toBeGreaterThanOrEqual(0);
          expect(p[1]).toBeLessThanOrEqual(MAX_HEIGHT);
        }
      }
    }
  });

  it('genre inconnu : aucune géométrie, aucune exception', () => {
    expect(itemQuads({ kind: 'piano' })).toEqual([]);
    expect(itemQuads(null)).toEqual([]);
    expect(totalTriangles(null)).toBe(0);
  });
});

describe('conversion pixels → unités', () => {
  const plan = { contour: [[0, 0], [100, 0], [100, 60], [0, 60]], walls: [{ id: 'w', x1: 50, y1: 0, x2: 50, y2: 60 }] };
  const T = { scale: 5, margin: 800, origin: { x: 0, y: 0 } };

  it('un élément au sol : x, y, w, h × 5 + marge', () => {
    const r = decorToWorld({ items: [{ id: 't', floor: 'rdc', kind: 'tapis', x: 10, y: 20, w: 4, h: 6, provisional: true }] }, { rdc: plan }, T);
    expect(r.items[0]).toMatchObject({ x: 850, y: 900, w: 20, h: 30, floor: 'rdc', provisional: true });
  });

  it('un élément mural est posé sur la face intérieure du mur (demi-épaisseur), normale vers l\'intérieur', () => {
    const r = decorToWorld({ items: [{ id: 'p', floor: 'rdc', kind: 'plinthe', on: 'contour-1', from: 0, to: 1 }] }, { rdc: plan }, T, { wallThickness: 40 });
    expect(r.items[0].a).toEqual({ x: 800, y: 820 });
    expect(r.items[0].b).toEqual({ x: 1300, y: 820 });
    expect(r.items[0].n).toEqual({ x: 0, y: 1 });
    const s = decorToWorld({ items: [{ id: 'q', floor: 'rdc', kind: 'plinthe', on: 'contour-3', from: 0, to: 1 }] }, { rdc: plan }, T);
    expect(s.items[0].n.y).toBe(-1);
  });

  it('mur intérieur : side choisit la face', () => {
    const r = decorToWorld({ items: [{ id: 'e', floor: 'rdc', kind: 'plinthe', on: 'w', side: 1 }, { id: 'o', floor: 'rdc', kind: 'plinthe', on: 'w', side: -1 }] }, { rdc: plan }, T);
    expect(Math.sign(r.items[0].n.x)).toBe(-Math.sign(r.items[1].n.x));
    expect(Math.abs(r.items[0].a.x - r.items[1].a.x)).toBe(40);
  });

  it('from / to : fractions du segment', () => {
    const r = decorToWorld({ items: [{ id: 'p', floor: 'rdc', kind: 'tuyau', on: 'contour-1', from: 0.2, to: 0.6 }] }, { rdc: plan }, T);
    expect(r.items[0].b.x - r.items[0].a.x).toBeCloseTo(200, 5);
  });

  it('genre inconnu, mur introuvable, rectangle invalide : avertissement, aucune exception', () => {
    const r = decorToWorld({ items: [{ id: 'a', kind: 'piano' }, { id: 'b', kind: 'plinthe', on: 'nulle-part' }, { id: 'c', kind: 'tapis', x: 1 }, null] }, { rdc: plan }, T);
    expect(r.items).toEqual([]);
    expect(r.warnings.length).toBe(4);
    expect(decorToWorld(null, null, null)).toEqual({ items: [], warnings: [] });
  });

  it('source « modele » ou provisoire : l\'origine suit l\'élément', () => {
    const r = decorToWorld({ items: [{ id: 'a', floor: 'rdc', kind: 'sacs', x: 1, y: 1, w: 2, h: 2, source: 'modele' }, { id: 'b', floor: 'rdc', kind: 'sacs', x: 1, y: 1, w: 2, h: 2 }] }, { rdc: plan }, T);
    expect(r.items[0].source).toBe('modele');
    expect(r.items[1].provisional).toBe(true);
  });
});

describe('coupe et zones de dégagement', () => {
  const wallItem = { id: 'p', kind: 'plinthe', floor: 'rdc', a: { x: 0, y: 20 }, b: { x: 500, y: 20 }, n: { x: 0, y: 1 }, depth: 2.5 };

  it('une fenêtre coupe un élément mural en deux morceaux', () => {
    const parts = cutWallItem(wallItem, [{ x: 250, y: 0, half: 48, reach: 40 }]);
    expect(parts.map((p) => [p.id, p.a.x, p.b.x])).toEqual([['p.1', 0, 202], ['p.2', 298, 500]]);
  });

  it('une fenêtre loin du mur ne coupe rien ; un morceau de moins de 12 est abandonné', () => {
    expect(cutWallItem(wallItem, [{ x: 250, y: 200, half: 48, reach: 40 }])).toHaveLength(1);
    expect(cutWallItem(wallItem, [{ x: 50, y: 0, half: 45, reach: 40 }]).map((p) => p.a.x)).toEqual([95]);
    expect(cutWallItem(null, [])).toEqual([]);
  });

  it('forbiddenFor : un élément au sol dans une zone est refusé ; un élément mural seulement si la zone l\'exclut aussi', () => {
    const z = [{ id: 'fen', floor: 'rdc', x: 0, y: 0, w: 100, h: 100, walls: false }, { id: 'esc', floor: 'rdc', x: 200, y: 0, w: 50, h: 50, walls: true }];
    expect(forbiddenFor({ kind: 'tapis', floor: 'rdc', x: 10, y: 10, w: 5, h: 5 }, z)).toEqual(['fen']);
    expect(forbiddenFor({ kind: 'plinthe', floor: 'rdc', x: 10, y: 10, w: 5, h: 5 }, z)).toEqual([]);
    expect(forbiddenFor({ kind: 'plinthe', floor: 'rdc', x: 210, y: 10, w: 5, h: 5 }, z)).toEqual(['esc']);
    expect(forbiddenFor({ kind: 'tapis', floor: 'etage', x: 10, y: 10, w: 5, h: 5 }, z)).toEqual([]);
  });

  it('zones : fenêtres, points de réparation, ouvertures et escaliers des deux étages', () => {
    const r = clearanceZones(world, zones, params, 'rdc');
    for (const id of ['fenetre-F1', 'reparation-F8', 'ouverture-ouverture-aile', 'escalier-escalier-aile-solid', 'escalier-escalier-depart-trigger', 'escalier-escalier-aile-marche']) expect(r.map((z) => z.id), id).toContain(id);
    const u = clearanceZones(etageWorld, zones, params, 'etage');
    expect(u.map((z) => z.id)).toContain('fenetre-U5');
    expect(clearanceZones(null, null, null)).toEqual([]);
  });

  it('placeDecor : un tapis dans une zone de fenêtre est retiré, une plinthe y est coupée', () => {
    const zs = { rdc: [{ id: 'fenetre-X', floor: 'rdc', x: 200, y: 20, w: 100, h: 150, walls: false }] };
    const r = placeDecor([{ id: 't', kind: 'tapis', floor: 'rdc', x: 220, y: 40, w: 20, h: 20 }, wallItem], zs, { rdc: [{ x: 250, y: 0 }] });
    expect(r.removed.map((x) => x.id)).toEqual(['t']);
    expect(r.items.map((x) => x.id)).toEqual(['p.1', 'p.2']);
  });
});

describe('données du dépôt', () => {
  const zonesBy = { rdc: clearanceZones(world, zones, params, 'rdc'), etage: clearanceZones(etageWorld, zones, params, 'etage') };

  it('decor-interieur.world.json est la sortie exacte de npm run carte (jamais édité à la main)', () => {
    expect(readFileSync(`${DIR}/decor-interieur.world.json`, 'utf8')).toBe(generateMapFiles('rez-de-chaussee').decorInterieur);
  });

  it('aucun élément au sol dans une zone de dégagement ; aucun élément mural dans un escalier', () => {
    for (const it of derived.items) expect(forbiddenFor(it, zonesBy[it.floor]), it.id).toEqual([]);
  });

  it('aucun élément mural devant une fenêtre (sur la largeur de la fenêtre)', () => {
    for (const it of derived.items.filter((x) => CATALOGUE[x.kind].wall)) {
      for (const w of (it.floor === 'etage' ? etageWorld : world).windows) {
        const gap = w.side === 'nord' || w.side === 'sud' ? { x: w.x - 36, y: w.y - 40, w: 72, h: 80 } : { x: w.x - 40, y: w.y - 36, w: 80, h: 72 };
        expect(overlap(it, gap), `${it.id} / ${w.id}`).toBe(false);
      }
    }
  });

  it('au plus 1 500 triangles en tout (les deux étages), compte du fichier exact', () => {
    expect(derived.triangles).toBe(totalTriangles(derived.items));
    expect(derived.triangles).toBeLessThanOrEqual(BUDGET.triangles);
  });

  it('chaque élément a une origine (modele ou provisoire) et un genre du catalogue', () => {
    for (const it of [...source.items, ...derived.items]) {
      expect(KINDS, it.id).toContain(it.kind);
      expect(it.source === 'modele' || it.provisional === true, it.id).toBe(true);
    }
  });

  it('les sacs de sable viennent du modèle (relevé, objets G44 à G48)', () => {
    expect(source.items.filter((x) => x.kind === 'sacs').every((x) => x.source === 'modele')).toBe(true);
  });

  it('les deux étages ont du décor ; chaque élément porte son étage', () => {
    expect(new Set(derived.items.map((x) => x.floor))).toEqual(new Set(['rdc', 'etage']));
  });

  it('non solide : aucun élément du décor léger dans les obstacles du monde', () => {
    const ids = new Set(derived.items.map((x) => x.id));
    for (const o of [...world.obstacles, ...etageWorld.obstacles]) expect(ids.has(o.id), o.id).toBe(false);
  });

  it('identifiants uniques', () => {
    expect(new Set(derived.items.map((x) => x.id)).size).toBe(derived.items.length);
  });
});
