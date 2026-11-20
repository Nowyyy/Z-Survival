// Lot 8j-D : tirs par-dessus les objets bas et à travers les grilles (js/core/tir-traverse.js) ; liste du propriétaire
// data/game/tirs-traversables.json → tirs.world.json (npm run carte). Balles (stepBullets), laser (castRay), joueur et zombies (collisions).
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { buildLayouts, closedDoors, playerSolids, zombieSolidsOf } from '../../js/core/layout.js';
import { parseZones, zonesToWorld } from '../../js/core/zones.js';
import { createBullet, stepBullets } from '../../js/core/projectile.js';
import { castRay } from '../../js/core/ray.js';
import { moveWithCollision } from '../../js/core/collision.js';
import { createRng, nextFloat } from '../../js/core/rng.js';
import { generateMapFiles } from '../../scripts/plan-vers-monde.mjs';
import { lireTirs, longueursCone, obstaclesTirs, preparerTirs, tirsMonde, trousGrilles } from '../../js/core/tir-traverse.js';

const json = (p) => JSON.parse(readFileSync(p, 'utf8'));
const D = 'data/game/maps/rez-de-chaussee/';
const world = json(`${D}world.json`);
const L = buildLayouts({ rdc: { world, decor: json(`${D}decor.json`) }, etage: { world: json(`${D}etage.world.json`) }, zones: zonesToWorld(parseZones(json(`${D}zones.json`)), world.transform) });
const TIRS = json(`${D}tirs.world.json`);
const PREP = preparerTirs(TIRS, L);
const rdc = L.rdc;
const portes = closedDoors(rdc, []);
const AVEC = obstaclesTirs(rdc, portes, PREP);
const SANS = obstaclesTirs(rdc, portes, null);
const PISTOLET = json('data/game/weapons.json').pistol;
const ARME = { ...PISTOLET, bulletMaxDistance: PISTOLET.fireRange }; // portée de 700 (arme effective du jeu)
const BORNES = rdc.worldBounds;
const meuble = (id, l = rdc) => l.furniture.find((f) => f.id === id);
// Vol d'une balle de (x0, y0) vers angle, jusqu'à un impact ou sa disparition (pas de 0,05 s) : { impact, gone }.
function vol(x0, y0, angle, ennemis, obstacles) {
  let bullets = [createBullet({ x: x0, y: y0 }, angle, ARME, 1)];
  for (let i = 0; i < 40 && bullets.length > 0; i += 1) {
    const out = stepBullets(bullets, ennemis, 0.05, BORNES, obstacles);
    if (out.impacts.length) return { impact: out.impacts[0], gone: null };
    if (out.gone.length) return { impact: null, gone: out.gone[0] };
    bullets = out.bullets;
  }
  return { impact: null, gone: null };
}

describe('données : liste du propriétaire et fichier dérivé', () => {
  it('tirs.world.json est à jour (npm run carte) et suit la liste ; règle (retour du propriétaire) : meubles dessinés plus bas que l\'arme (13 au rez-de-chaussée dont les deux piles de sacs de sable du lot 9a-I, 5 à l\'étage) et les deux grilles', () => {
    const gen = generateMapFiles('rez-de-chaussee');
    expect(gen.tirs).toBe(readFileSync(`${D}tirs.world.json`, 'utf8'));
    expect(gen.tirsReport.problems).toEqual([]);
    const liste = json('data/game/tirs-traversables.json').cartes['rez-de-chaussee'];
    expect([...TIRS.rdc.ids, ...TIRS.rdc.grilles.map((g) => g.id)].sort()).toEqual([...liste.rdc].sort());
    expect(TIRS.rdc.ids).toHaveLength(28); // lot 9h (retours) : + bidon-salle, bidon-poche (28 de haut) ; lot 9a-I : + sacs-1, sacs-2 (18 de haut) ; lot 9h : + 13 objets d'époque dessinés sous l'arme (véhicules aux places des voitures, voiture en flammes, ailes et débris de l'avion, hérissons, barbelés, jerrycans, caisses)
    expect(TIRS.rdc.grilles.map((g) => g.id)).toEqual(['grille-F7', 'grille-F8']);
    expect(TIRS.etage.ids).toHaveLength(6); // lot 9h (retours) : + bidon-etage
    // Chaque meuble listé est DESSINÉ plus bas que l'arme (mobilier.world.json, render.json → gunHeight 43) ; aucun pilier ni escalier.
    const arme = json('data/game/render.json').gunHeight;
    expect(arme).toBe(43);
    const pieces = Object.values(json(`${D}mobilier.world.json`).pieces);
    const dessin = (id, f) => Math.max(...pieces.filter((p) => p.obstacle === id && p.floor === f).flatMap((p) => p.boxes.map((b) => b.y1)));
    for (const [f, l, ids] of [['rdc', L.rdc, TIRS.rdc.ids], ['etage', L.etage, TIRS.etage.ids]]) {
      for (const id of ids) {
        const m = meuble(id, l) ?? l.decor?.solids?.find((q) => q.id === id); // lot 9h : objets du décor extérieur (hauteur dessinée dans decor.json → epoque)
        expect(m, id).toBeTruthy();
        expect(m.kind === 'sacs' || l.decor?.solids?.includes(m) ? m.hauteur : dessin(id, f), id).toBeLessThan(arme); // sacs de sable : dessinés à leur hauteur (sacsBoxes), sans pièce de mobilier
        expect(['pilier', 'escalier'], id).not.toContain(m.kind);
      }
    }
  });
  it('vérification : identifiant inconnu, en double, pilier, escalier, objet de 100 ou plus et grille hors mur refusés', () => {
    const couche = { obstacles: [...rdc.furniture, { id: 'haut', kind: 'armoire', hauteur: 120 }], solids: rdc.decor.solids, grilles: [{ id: 'g-hors', a: { x: 0, y: 0 }, b: { x: 10, y: 0 }, n: { x: 0, y: 1 } }], walls: rdc.walls, thick: 40 };
    const { doc, problems } = tirsMonde({ rdc: ['M4', 'M4', 'X1', 'pilier-1', 'escalier-aile', 'haut', 'g-hors', 'voiture-1'] }, { rdc: couche });
    // Avec la hauteur de l'arme (43) et les hauteurs dessinées : une étagère (70) et un comptoir dessiné à 48 sont refusés, un comptoir dessiné à 9 passe.
    const arme = tirsMonde({ rdc: ['M26+M28+M29+M31', 'M4', 'M22'] }, { rdc: { ...couche, hauteurs: new Map([['M4', 48], ['M22', 9.3]]) } }, { hauteurMax: 43 });
    expect(arme.doc.rdc.ids).toEqual(['M22']);
    expect(arme.problems).toEqual(['rdc : M26+M28+M29+M31 (70 de haut, arme à 43) arrête toujours les tirs', 'rdc : M4 (48 de haut, arme à 43) arrête toujours les tirs']);
    expect(doc.rdc.ids).toEqual(['M4', 'voiture-1']);
    expect(problems).toEqual(['rdc : M4 en double', 'rdc : identifiant inconnu X1', 'rdc : pilier-1 (pilier) arrête toujours les tirs', 'rdc : escalier-aile (escalier) arrête toujours les tirs', 'rdc : haut (120 de haut, arme à 100) arrête toujours les tirs', 'rdc : grille g-hors hors de tout mur']);
    expect(tirsMonde({ etage: ['E1'] }, { rdc: couche }).problems).toEqual(['etage : étage absent de la carte']);
    expect(lireTirs(null)).toBeNull();
    expect(lireTirs({ rdc: { ids: ['a', 3, ''], grilles: [{ id: 'g' }] } }).rdc).toEqual({ ids: new Set(['a']), grilles: [] });
  });
  it('grilles : le mur logique est percé sur [a, b], sur toute son épaisseur, pour les tirs seulement (même découpe que le dessin)', () => {
    const trous = trousGrilles(rdc.walls, TIRS.rdc.grilles, rdc.wallThickness);
    expect([...trous.keys()].sort()).toEqual(['mur-19', 'mur-20']);
    const m20 = trous.get('mur-20');
    expect(m20.map((r) => [r.x, r.w])).toEqual([[1641, expect.closeTo(33.99, 2)], [expect.closeTo(1789.96, 2), expect.closeTo(529.04, 2)]]);
    for (const r of m20) expect([r.id, r.y, r.h]).toEqual(['mur-20', 2540, 40]);
    // Les murs de la couche ne sont pas modifiés.
    expect(rdc.walls.find((w) => w.id === 'mur-20')).toMatchObject({ x: 1641, w: 678 });
  });
});

describe('balles et laser', () => {
  it('une balle passe par-dessus une table basse (M10, 40) et touche le zombie derrière ; sans la liste, la table l\'arrête', () => {
    const t = meuble('M10');
    const y = t.y + t.h / 2;
    const z = [{ id: 7, x: t.x + t.w + 60, y, r: 20 }];
    expect(vol(t.x - 80, y, 0, z, AVEC).impact).toMatchObject({ enemyId: 7 });
    expect(vol(t.x - 80, y, 0, z, SANS).gone).toMatchObject({ reason: 'obstacle', obstacleId: 'M10' });
    // Un comptoir dessiné bas (P8, 29) aussi ; une étagère (M26…, 70 : plus haute que l'arme) arrête la balle (retour du propriétaire).
    const c = meuble('P8');
    const xc = c.x + c.w / 2;
    const zc = [{ id: 8, x: xc, y: c.y + c.h + 60, r: 20 }];
    expect(vol(xc, c.y - 50, Math.PI / 2, zc, AVEC).impact).toMatchObject({ enemyId: 8 });
    const e = meuble('M26+M28+M29+M31');
    const xe = e.x + e.w / 2;
    const ze = [{ id: 9, x: xe, y: e.y + e.h + 60, r: 20 }];
    expect(vol(xe, e.y - 50, Math.PI / 2, ze, AVEC).gone).toMatchObject({ obstacleId: 'M26+M28+M29+M31' });
  });

  it('s\'arrête toujours sur un objet haut, un mur, un pilier, une porte fermée ; une fenêtre (planches comprises) se traverse comme avant le lot', () => {
    // Objet haut (hors liste) : arrête la balle.
    const haut = { ...rdc, furniture: [{ id: 'haut', kind: 'armoire', x: 2000, y: 1000, w: 40, h: 40, hauteur: 150 }], walls: [], decor: { solids: [] } };
    expect(vol(1900, 1020, 0, [{ id: 1, x: 2100, y: 1020, r: 20 }], obstaclesTirs(haut, [], PREP)).gone).toMatchObject({ obstacleId: 'haut' });
    // Pilier.
    const p = meuble('pilier-7');
    expect(vol(p.x - 100, p.y + p.h / 2, 0, [{ id: 2, x: p.x + p.w + 80, y: p.y + p.h / 2, r: 20 }], AVEC).gone).toMatchObject({ obstacleId: 'pilier-7' });
    // Mur plein (sans grille) : le mur nord, mur-1.
    const m = rdc.walls[0];
    const xm = m.x + m.w / 2;
    expect(vol(xm, m.y + m.h + 60, -Math.PI / 2, [{ id: 3, x: xm, y: m.y - 80, r: 20 }], AVEC).gone).toMatchObject({ reason: 'obstacle', obstacleId: m.id });
    // Porte fermée.
    const d = portes.find((r) => r.id === 'porte-1');
    expect(vol(d.x - 100, d.y + d.h / 2, 0, [{ id: 4, x: d.x + d.w + 80, y: d.y + d.h / 2, r: 20 }], AVEC).gone).toMatchObject({ obstacleId: 'porte-1' });
    // Fenêtre F8 : ouverture du mur, sans obstacle de tir avant comme après le lot (les planches ne bloquent que les zombies).
    const f8 = rdc.windows.find((w) => w.id === 'F8');
    for (const obs of [AVEC, SANS]) expect(vol(f8.x, f8.y - 150, Math.PI / 2, [{ id: 5, x: f8.x, y: f8.y + 150, r: 20 }], obs).impact).toMatchObject({ enemyId: 5 });
  });
  it('traverse les grilles de part et d\'autre de la fenêtre du bas (F7, F8) ; sans la liste, le mur l\'arrête ; le laser montre exactement la même trajectoire', () => {
    for (const g of TIRS.rdc.grilles) {
      const x = (g.a.x + g.b.x) / 2;
      const z = [{ id: 9, x, y: 2700, r: 20 }];
      const avec = vol(x, 2450, Math.PI / 2, z, AVEC);
      expect(avec.impact, g.id).toMatchObject({ enemyId: 9 });
      const sans = vol(x, 2450, Math.PI / 2, z, SANS);
      expect(sans.gone, g.id).toMatchObject({ reason: 'obstacle' });
      // Laser (même liste d'obstacles) : il touche le même zombie, à l'endroit où la balle le touche ; sans la liste, il s'arrête au mur, là où la balle disparaît.
      const ray = castRay({ x, y: 2450 }, Math.PI / 2, 700, z, BORNES, AVEC, 'rdc');
      expect(ray.hit?.id, g.id).toBe(9);
      expect(ray.end.y).toBeCloseTo(avec.impact.y + ARME.bulletRadius, 6); // la balle (rayon 4) touche 4 plus tôt que le rayon du laser
      const raySans = castRay({ x, y: 2450 }, Math.PI / 2, 700, z, BORNES, SANS, 'rdc');
      expect(raySans.hit).toBeNull();
      expect(raySans.end.y).toBeCloseTo(sans.gone.y, 6);
      expect(raySans.stoppedBy.id).toBe(sans.gone.obstacleId);
    }
  });
  it('cône de visée (retour du propriétaire) : chaque bord s\'arrête sur les obstacles des tirs comme le laser ; à travers une grille, il passe', () => {
    const m = rdc.walls[0];
    const o = { x: m.x + m.w / 2, y: m.y + m.h + 100 };
    const [g, d] = longueursCone(o, -Math.PI / 2, 0.1, 300, BORNES, AVEC);
    for (const [len, a] of [[g, -Math.PI / 2 - 0.1], [d, -Math.PI / 2 + 0.1]]) {
      expect(len).toBeLessThan(110);
      expect(len).toBeCloseTo(castRay(o, a, 300, [], BORNES, AVEC).length, 9);
    }
    const gr = TIRS.rdc.grilles.find((q) => q.id === 'grille-F7');
    const og = { x: (gr.a.x + gr.b.x) / 2, y: 2450 };
    expect(longueursCone(og, Math.PI / 2, 0.05, 300, BORNES, AVEC)).toEqual([300, 300]);
    for (const len of longueursCone(og, Math.PI / 2, 0.05, 300, BORNES, SANS)) expect(len).toBeLessThan(100);
  });
  it('liste vide : obstacles et résultats identiques à ceux d\'avant le lot (même liste, mêmes impacts sur 300 tirs tirés au hasard)', () => {
    for (const f of ['rdc', 'etage']) {
      const l = L[f];
      const d = closedDoors(l, []);
      const avant = [...l.furniture.filter((o) => o.kind !== 'escalier'), ...l.walls, ...(l.decor?.solids ?? []), ...d];
      const sans = obstaclesTirs(l, d, null);
      expect(sans).toEqual(avant);
      sans.forEach((o, i) => expect(o).toBe(avant[i]));
      expect(obstaclesTirs({ ...l, floorId: f }, d, null)).toEqual(avant);
    }
    expect(obstaclesTirs({ empty: true }, [], PREP)).toEqual([]);
    const avant = [...rdc.furniture.filter((o) => o.kind !== 'escalier'), ...rdc.walls, ...rdc.decor.solids, ...portes];
    let rng = createRng(8);
    const tire = () => {
      const r = nextFloat(rng);
      rng = r.rng;
      return r.value;
    };
    let differents = 0;
    for (let i = 0; i < 300; i += 1) {
      const x = 1000 + tire() * 2100;
      const y = 950 + tire() * 1600;
      const a = tire() * Math.PI * 2;
      const z = [{ id: 1, x: x + Math.cos(a) * 400, y: y + Math.sin(a) * 400, r: 20 }];
      expect(vol(x, y, a, z, SANS)).toEqual(vol(x, y, a, z, avant));
      if (JSON.stringify(vol(x, y, a, z, AVEC)) !== JSON.stringify(vol(x, y, a, z, SANS))) differents += 1;
    }
    expect(differents).toBeGreaterThan(0); // la liste par défaut change bien des tirs
  });
});

describe('joueur et zombies : toujours bloqués', () => {
  it('retour du propriétaire : chaque meuble de la carte bloque tout son rectangle dessiné (plus de petite boîte de « chaise » : M21, M10, P10…)', () => {
    for (const [l, ids] of [[L.rdc, ['M4', 'M10', 'M21', 'M32', 'P5', 'P10']], [L.etage, ['E2', 'Q5', 'Q6']]]) {
      for (const id of ids) {
        const m = meuble(id, l);
        const plan = (l === L.rdc ? world : json(`${D}etage.world.json`)).obstacles.find((o) => o.id === id);
        expect([m.x, m.y, m.w, m.h], id).toEqual([plan.x, plan.y, plan.w, plan.h]);
        expect(m.plan, id).toBeUndefined();
      }
    }
    // La caisse M21 (85 × 30, contre le mur est) : le joueur venu de l'ouest s'arrête à son bord (avant : il entrait de 32).
    const c = meuble('M21');
    let p = { x: c.x - 40, y: c.y + c.h / 2, r: 18 };
    for (let i = 0; i < 12; i += 1) p = { ...p, ...moveWithCollision(p, { x: 11, y: 0 }, playerSolids(rdc, []), rdc.moveRoom) };
    expect(p.x).toBeCloseTo(c.x - 18, 6);
  });
  it('le joueur et les zombies ne traversent ni la table basse ni la grille ; leurs obstacles ne lisent jamais la liste des tirs', () => {
    const t = meuble('M10');
    const y = t.y + t.h / 2;
    const joueur = playerSolids(rdc, []);
    const zombies = zombieSolidsOf(rdc, []);
    expect(joueur).toContain(t);
    for (const solides of [joueur, zombies.length ? zombies : joueur]) {
      const apres = moveWithCollision({ x: t.x - 40, y, r: 18 }, { x: 120, y: 0 }, solides, rdc.bounds);
      expect(apres.x).toBeLessThanOrEqual(t.x - 18 + 0.01);
    }
    // Grille F7 : le mur logique reste entier pour les déplacements.
    const g = TIRS.rdc.grilles.find((q) => q.id === 'grille-F7');
    const x = (g.a.x + g.b.x) / 2;
    const apres = moveWithCollision({ x, y: 2500, r: 18 }, { x: 0, y: 200 }, joueur, rdc.moveRoom ?? rdc.worldBounds);
    expect(apres.y).toBeLessThanOrEqual(2540 - 18 + 0.01);
    expect(rdc.walls.find((w) => w.id === 'mur-20').w).toBe(678);
    expect(rdc.playerObstacles.some((o) => o.id === 'mur-20' && o.w === 678)).toBe(true);
  });
});
