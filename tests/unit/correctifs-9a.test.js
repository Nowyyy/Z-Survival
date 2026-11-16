import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { porteProche, reglagesPorte, PORTE_DEFAUT } from '../../js/core/porte-message.js';
import { buildSpec, createTextureData, TILEABLE } from '../../js/core/texgen.js';
import { CATALOGUE, sacsBoxes, solidesDecor } from '../../js/core/decor-interieur.js';
import { buildLayouts, shotBlockers } from '../../js/core/layout.js';
import { parseZones, zonesToWorld } from '../../js/core/zones.js';
import { analyzeMap } from '../../js/core/maps.js';
import { rectGap } from '../../js/core/collision.js';
import { angleRotor, decalageTole, helicopterFootprint, helicopterModel, helicopterRotor, reglagesRotor, ROTOR_DEFAUT, ROTOR_PIECES, teinteAcier, TOLE_TUILE, toleHelicoptere, tournerAutour, uvTole } from '../../js/core/epaves.js';

// Lot 9a : message des portes à deux cases ; hélicoptère en tôle de métal (texture calculée, aucune image) et rotor de queue qui tourne en temps de
// jeu (décor seulement) (Docs/ref/debut-v09.md).
const lire = (p) => JSON.parse(readFileSync(p, 'utf8'));
const reglages = lire('data/game/reglages-partie.json');
const textures = lire('data/game/textures.json');
const decor = lire('data/game/maps/rez-de-chaussee/decor.json');
const heli = decor.wrecks.helicopter;

describe('message des portes : deux cases du dallage', () => {
  const sol = textures.textures.find((t) => t.id === 'sol-salle');
  const CASE = sol.repeat / sol.params.cells;
  it('une case du sol = 60 unités (sol-salle : répétition 600, 10 carreaux) ; distance réglée à deux cases (120), défaut identique', () => {
    expect(CASE).toBe(60);
    expect(reglages.porte.distance).toBe(2 * CASE);
    expect(reglagesPorte(reglages.porte)).toEqual({ distance: 120 });
    expect(PORTE_DEFAUT.distance).toBe(120);
    expect(reglagesPorte({ distance: 'x' })).toEqual({ distance: 120 });
  });
  it('porteProche : message à 120 du bloc (et en deçà), plus au-delà ; porte ouverte ou prévue : jamais', () => {
    const portes = [{ id: 'p', openAfterWave: 10, blocks: { rdc: [{ rect: { x: 1000, y: 1000, w: 40, h: 100 } }] } }];
    const d = reglagesPorte(reglages.porte).distance;
    expect(porteProche(portes, {}, { x: 1040 + 120, y: 1050 }, 'rdc', d)).toEqual({ id: 'p', manche: 11, distance: 120 });
    expect(porteProche(portes, {}, { x: 1040 + 60, y: 1050 }, 'rdc', d)?.distance).toBe(60);
    expect(porteProche(portes, {}, { x: 1040 + 120.5, y: 1050 }, 'rdc', d)).toBe(null);
    expect(porteProche(portes, { p: { open: true } }, { x: 1050, y: 1050 }, 'rdc', d)).toBe(null);
    expect(porteProche([{ ...portes[0], planned: true }], {}, { x: 1050, y: 1050 }, 'rdc', d)).toBe(null);
  });
});

describe('hélicoptère : rotor de queue (pur)', () => {
  it('vitesse lue dans reglages-partie.json (degrés par seconde de jeu), bornée ; défaut 72 (un tour en 5 s)', () => {
    expect(reglagesRotor(reglages.helicoptere)).toEqual({ degParSeconde: reglages.helicoptere.rotorDegParSeconde });
    expect(reglages.helicoptere.rotorDegParSeconde).toBeGreaterThan(0);
    expect(reglages.helicoptere.rotorDegParSeconde).toBeLessThanOrEqual(180);
    for (const bad of [undefined, null, {}, { rotorDegParSeconde: -1 }, { rotorDegParSeconde: 721 }, { rotorDegParSeconde: 'x' }]) expect(reglagesRotor(bad)).toEqual(ROTOR_DEFAUT);
  });
  it('angle en temps de jeu : 0 au départ, proportionnel au temps, modulo un tour ; même temps (pause) = même angle ; mouvement réduit : 0', () => {
    expect(angleRotor(0, 72)).toBe(0);
    expect(angleRotor(1, 72)).toBeCloseTo((72 * Math.PI) / 180, 12);
    expect(angleRotor(5, 72)).toBeCloseTo(0, 9);
    expect(angleRotor(6, 72)).toBeCloseTo(angleRotor(1, 72), 9);
    expect(angleRotor(2.5, 72)).toBe(angleRotor(2.5, 72)); // temps figé (pause) : angle figé
    expect(angleRotor(3, 72, true)).toBe(0);
    for (const [t, v] of [[NaN, 72], [-1, 72], [3, 0], [3, NaN]]) expect(angleRotor(t, v)).toBe(0);
  });
  it('rotor = les deux pales de queue du modèle (24 triangles), moyeu dans l\'emprise visuelle, au-dessus du sol à tout angle ; aucune collision nouvelle', () => {
    const rot = helicopterRotor(heli);
    expect(rot.triangles.length).toBe(24);
    expect(new Set(rot.triangles.map((t) => t.part))).toEqual(new Set(ROTOR_PIECES));
    expect(rot.triangles.every((t) => t.group === 'queue')).toBe(true);
    const v = heli.visual;
    expect(rot.hub[0]).toBeGreaterThan(v.x);
    expect(rot.hub[0]).toBeLessThan(v.x + v.w);
    expect(rot.hub[2]).toBeGreaterThan(v.y);
    expect(rot.hub[2]).toBeLessThan(v.y + v.h);
    expect(Math.hypot(...rot.axis)).toBeCloseTo(1, 9);
    let bas = Infinity;
    for (let a = 0; a < 360; a += 5) for (const t of rot.triangles) for (const p of t.p) bas = Math.min(bas, tournerAutour(p, rot.axis, (a * Math.PI) / 180)[1] + rot.hub[1]);
    expect(bas).toBeGreaterThan(5);
    // Collisions : mêmes rectangles qu'au lot 5a (decor.json), même nombre de triangles du modèle.
    expect(helicopterFootprint(heli).rects.map(({ x, y, w, h }) => ({ x, y, w, h }))).toEqual(heli.rects.map(({ x, y, w, h }) => ({ x, y, w, h })));
    expect(helicopterModel().count).toBe(heli.triangles);
  });
});

describe('hélicoptère : tôle de métal peinte (texture calculée, aucune image)', () => {
  const base = [125, 129, 135];
  const tex = toleHelicoptere({ size: 128, couleur: base });
  it('déterministe, taille demandée, opaque, couleur moyenne proche de la couleur de base (même clarté que l\'ancienne tôle)', () => {
    expect(toleHelicoptere({ size: 128, couleur: base }).data).toEqual(tex.data);
    expect([tex.width, tex.height, tex.data.length]).toEqual([128, 128, 128 * 128 * 4]);
    let r = 0;
    let opaque = true;
    for (let i = 0; i < tex.data.length; i += 4) {
      r += tex.data[i];
      if (tex.data[i + 3] !== 255) opaque = false;
    }
    expect(opaque).toBe(true);
    expect(r / (128 * 128)).toBeGreaterThan(base[0] * 0.85);
    expect(r / (128 * 128)).toBeLessThan(base[0] * 1.1);
    expect(readFileSync('js/core/epaves.js', 'utf8')).not.toMatch(/Math\.random|new Image|\.png|\.jpg/);
  });
  it('joints et rivets : des pixels nettement plus sombres et plus clairs que la peinture ; aucune strie horizontale continue (pas de veinage)', () => {
    const lum = (i) => tex.data[i * 4];
    let sombres = 0;
    let clairs = 0;
    for (let i = 0; i < 128 * 128; i += 1) {
      if (lum(i) < base[0] * 0.7) sombres += 1;
      if (lum(i) > base[0] * 1.2) clairs += 1;
    }
    expect(sombres).toBeGreaterThan(200);
    expect(clairs).toBeGreaterThan(100);
    // Veinage : écart moyen entre deux lignes voisines comparable à l'écart entre deux colonnes voisines (motif isotrope, hors joints).
    let dx = 0;
    let dy = 0;
    for (let y = 1; y < 128; y += 1) for (let x = 1; x < 128; x += 1) {
      dx += Math.abs(lum(y * 128 + x) - lum(y * 128 + x - 1));
      dy += Math.abs(lum(y * 128 + x) - lum((y - 1) * 128 + x));
    }
    expect(dy / dx).toBeGreaterThan(0.6);
    expect(dy / dx).toBeLessThan(1.6);
  });
  it('teinte acier : olive ou gris sombre (jamais plus rouge que verte), luminance gardée ; entrée invalide : blanc', () => {
    const olive = [0.26, 0.26, 0.18];
    const a = teinteAcier(olive);
    const l = (c) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
    expect(Math.abs(l(a) - l(olive))).toBeLessThan(0.01);
    expect(a[0]).toBeLessThanOrEqual(a[1]);
    expect(teinteAcier(null)).toEqual([1, 1, 1]);
  });
  it('coordonnées de texture : une répétition tous les TOLE_TUILE unités, décalées par pièce', () => {
    expect(TOLE_TUILE).toBe(120);
    expect(decalageTole('coque')).not.toEqual(decalageTole('nez'));
    const t = { part: 'coque', n: [0, 1, 0], p: [[0, 0, 0], [120, 0, 0], [0, 0, 120]] };
    const uv = uvTole(t);
    expect(uv[1][0] - uv[0][0]).toBeCloseTo(1, 9);
    expect(uv[2][1] - uv[0][1]).toBeCloseTo(1, 9);
  });
});

// Lot 9a-I (décision du propriétaire) : sacs de sable en toile de jute, solides (obstacles de world.json, à tous les réglages graphiques).
describe('sacs de sable : toile de jute et collision', () => {
  const D = 'data/game/maps/rez-de-chaussee/';
  const world = lire(`${D}world.json`);
  const legers = lire(`${D}decor-interieur.world.json`).items;
  const SACS = world.obstacles.filter((o) => o.kind === 'sacs');
  const jute = textures.textures.find((t) => t.id === 'toile-jute');
  const gris = (t) => ({ '--game-cloth-3': [194, 169, 138], '--game-wood-dark': [88, 67, 45] }[t] ?? [128, 128, 128]);

  it('texture « toile-jute » : genre burlap, répétée, jetons existants, déterministe, raccord sans couture, 128 px', () => {
    expect(jute).toMatchObject({ kind: 'burlap', size: 128, colors: { fiber: '--game-cloth-3', dark: '--game-wood-dark' } });
    expect(jute.repeat).toBeGreaterThan(0);
    expect(TILEABLE.burlap).toBe('xy');
    const a = createTextureData(buildSpec(jute, gris));
    const b = createTextureData(buildSpec(jute, gris));
    expect(a.warnings).toEqual([]);
    expect(Buffer.from(a.data).equals(Buffer.from(b.data))).toBe(true);
    // Fils : la texture alterne clair (fil) et sombre (jour) ; moyenne proche de la couleur du fil, assombrie.
    let clair = 0;
    let sombre = 0;
    for (let i = 0; i < a.data.length; i += 4) {
      const l = (a.data[i] + a.data[i + 1] + a.data[i + 2]) / 3;
      if (l > 140) clair += 1;
      if (l < 60) sombre += 1;
    }
    expect(clair).toBeGreaterThan(a.data.length / 4 / 5);
    expect(sombre).toBeGreaterThan(a.data.length / 4 / 50);
    // Raccord : le bord droit ressemble au bord gauche autant que deux colonnes voisines (fils entiers : 16 par côté, 8 px chacun).
    const col = (x) => Array.from({ length: 128 }, (_, y) => a.data[(y * 128 + x) * 4]);
    const ecart = (p, q) => p.reduce((s2, v, i) => s2 + Math.abs(v - q[i]), 0) / p.length;
    expect(ecart(col(127), col(0))).toBeLessThan(ecart(col(1), col(0)) * 2 + 20);
  });

  it('les sacs ne sont plus dans le décor léger ; deux obstacles de world.json, genre « sacs », 18 de haut, au catalogue « solide »', () => {
    expect(CATALOGUE.sacs.solide).toBe(true);
    expect(legers.filter((i) => i.kind === 'sacs')).toEqual([]);
    expect(SACS.map((o) => [o.id, o.hauteur, o.source])).toEqual([['sacs-1', 18, 'modele'], ['sacs-2', 18, 'modele']]);
  });

  it('règles de la carte : au contact du mur nord et l\'un de l\'autre, jamais un interstice de moins de 50 ; le chemin relie toujours le départ aux fenêtres', () => {
    const [a, b] = SACS;
    expect(rectGap(a, b)).toBe(0);
    for (const o of world.obstacles.filter((x) => x.kind !== 'sacs' && !x.outside)) {
      for (const s of SACS) {
        const g = rectGap(s, o);
        expect(g === 0 || g >= world.minCorridor, `${s.id} / ${o.id} : ${g}`).toBe(true);
      }
    }
    const an = analyzeMap(world);
    expect([an.startReachable, an.unreachable, an.components]).toEqual([true, [], 1]);
  });

  it('collision : les sacs bloquent le joueur et les zombies ; les tirs passent par-dessus (liste du propriétaire, 18 < arme 43)', () => {
    const L = buildLayouts({ rdc: { world, decor: lire(`${D}decor.json`) }, etage: { world: lire(`${D}etage.world.json`) }, zones: zonesToWorld(parseZones(lire(`${D}zones.json`)), world.transform) });
    const ids = (list) => list.filter((o) => o.kind === 'sacs').map((o) => o.id);
    expect(ids(L.rdc.playerObstacles)).toEqual(['sacs-1', 'sacs-2']);
    expect(ids(L.rdc.zombieObstacles)).toEqual(['sacs-1', 'sacs-2']);
    expect(ids(shotBlockers(L.rdc, []))).toEqual(['sacs-1', 'sacs-2']); // bloqueurs bruts ; la traversée vient de tirs.world.json
    const tirs = lire(`${D}tirs.world.json`);
    expect(tirs.rdc.ids).toEqual(expect.arrayContaining(['sacs-1', 'sacs-2']));
    expect(lire('data/game/tirs-traversables.json').cartes['rez-de-chaussee'].rdc).toEqual(expect.arrayContaining(['sacs-1', 'sacs-2']));
  });

  it('solidesDecor : seuls les genres solides au sol deviennent des obstacles (rectangle englobant si tourné) ; le reste reste léger', () => {
    const r = solidesDecor([{ id: 's', floor: 'rdc', kind: 'sacs', z1: 18, x: 0, y: 0, w: 40, h: 20, rot: 90, source: 'modele' }, { id: 't', kind: 'tapis' }, null]);
    expect(r.solides).toEqual([{ floor: 'rdc', obstacle: { id: 's', x: 10, y: -10, w: 20, h: 40, hauteur: 18, kind: 'sacs', source: 'modele' } }]);
    expect(r.legers).toEqual([{ id: 't', kind: 'tapis' }, null]);
    expect(solidesDecor(undefined)).toEqual({ solides: [], legers: [] });
  });

  it('sacsBoxes : sacs dans le rectangle, sous la hauteur, rangées en quinconce le long du mur, chaque sac bombé, teintes voisines différentes ; pur', () => {
    for (const o of SACS) {
      const b = sacsBoxes(o, { alongX: true });
      expect(b).toEqual(sacsBoxes(o, { alongX: true }));
      expect(b.length % 2).toBe(0); // corps + dessus bombé
      for (const q of b) {
        expect(q.x0).toBeGreaterThanOrEqual(o.x - 1e-9);
        expect(q.x1).toBeLessThanOrEqual(o.x + o.w + 1e-9);
        expect(q.z0).toBeGreaterThanOrEqual(o.y - 1e-9);
        expect(q.z1).toBeLessThanOrEqual(o.y + o.h + 1e-9);
        expect(q.y0).toBeGreaterThanOrEqual(0);
        expect(q.y1).toBeLessThanOrEqual(o.hauteur);
        expect(q.teinte).toBeGreaterThanOrEqual(0.7);
        expect(q.teinte).toBeLessThanOrEqual(1.04);
      }
      expect(Math.max(...b.map((q) => q.y1))).toBe(o.hauteur);
      const corps = b.filter((_, i) => i % 2 === 0);
      // quinconce : les joints de deux rangées voisines ne tombent pas au même endroit
      const rangees = [...new Set(corps.map((q) => q.z0))].sort((p, q) => p - q);
      expect(rangees.length).toBeGreaterThanOrEqual(3);
      const joints = (z) => corps.filter((q) => q.z0 === z).map((q) => q.x1).filter((x) => x < o.x + o.w - 1).sort((p, q) => p - q);
      expect(joints(rangees[0])).not.toEqual(joints(rangees[1]));
      for (let i = 1; i < corps.length; i += 1) if (corps[i].z0 === corps[i - 1].z0) expect(corps[i].teinte).not.toBe(corps[i - 1].teinte);
    }
    expect(sacsBoxes(null)).toEqual([]);
    expect(sacsBoxes({ x: 0, y: 0, w: 0, h: 5 })).toEqual([]);
  });
});
