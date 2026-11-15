// Monde en 3D : sol de la salle, murs percés de fenêtres, meubles, décor extérieur, lumières et ombres, caméra qui suit le joueur.
// Une unité du jeu = une unité de la scène : x du jeu -> X, y du jeu -> Z, la hauteur est Y (le sol est le plan y = 0).
// Tout est créé une seule fois au chargement. Les éléments sont fusionnés par matière (un maillage, donc un appel de dessin, par
// texture) ; les coordonnées de texture sont calculées ici : proportionnelles aux dimensions réelles pour les textures répétées
// (1 répétition = `repeat` unités du monde), fenêtre dans une région de l'atlas de props pour le reste.
import * as THREE from 'three';
import { num } from '../core/vec.js';
import { boundTarget, overview, snapCamera, stepCamera } from '../core/camera.js';
import { cameraPosition, fitDistance, groundView } from '../core/viewport.js';
import { fogGrid } from '../core/fog.js';
import { itemQuads, CATALOGUE as DECOR_CATALOGUE } from '../core/decor-interieur.js';
import { furnitureParts } from '../core/furniture-model.js';
import { doorBoxes, grilleBoxes, rubbleBoxes } from '../core/portes-aspect.js';
import { generateLivelyDecor } from '../core/decor-vivant.js';
import { burntCarParts, carFireSpots, craterTriangles, placeHelicopter, trailTriangles } from '../core/epaves.js';
import { plankSettings } from '../core/plank-layout.js';
import { plankSheet } from '../core/texgen.js';
import { createDebrisMeshes, createWindowMeshes } from './windows-mesh.js';
import { createSeeThrough } from './see-through.js';
import { createFire } from './fire.js';
import { createMistLayer, mistLayers } from './mist.js';
import { seeThroughSettings } from '../core/see-through.js';

const FAR_GROUND = 40_000; // sol extérieur étendu bien au-delà du monde
const ROAD_Y = 0.4; // route, trottoir et sentiers : plaques plates au-dessus de l'herbe
const ATLAS = 'atlas-props';
const DOOR_THICKNESS = 24; // épaisseur dessinée d'une porte d'escalier (le bloc de collision garde toute son emprise)
// Lot 3g (retours du propriétaire) : avec les murs jusqu'au plafond, hauteur d'une porte ; au-dessus, un linteau de béton jusqu'au plafond (cinquième passe).
const DOOR_TALL = 120;
const FENCE_HEIGHT = 36; // garde-corps du trou des escaliers : une répétition de la texture « garde-corps »

// Région d'atlas par type de meuble (data/game/world.json : table, comptoir, caisse, armoire, colonne, etagere).
const FURNITURE_REGION = { table: 'bois', comptoir: 'tole', caisse: 'caisse', armoire: 'bois-sombre', colonne: 'colonne', etagere: 'etagere', pilier: 'colonne', escalier: 'tole' }; // lot 3b : pilier et escalier plein (texture du comptoir)
const CAR_PAINTS = ['peinture-1', 'peinture-2', 'peinture-3'];

const unitCylinder = new THREE.CylinderGeometry(1, 1, 1, 8);
const crown = new THREE.IcosahedronGeometry(1, 0);
const wheelAlongZ = new THREE.CylinderGeometry(1, 1, 1, 8).rotateX(Math.PI / 2);
// Lot 3g (extérieur plus vivant) : tronc et branche (cylindres à 5 pans sans bouchons, la branche part de son pied), brin d'herbe.
const thinTrunk = new THREE.CylinderGeometry(0.7, 1, 1, 5, 1, true);
const branchGeom = new THREE.CylinderGeometry(0.45, 1, 1, 5, 1, true).translate(0, 0.5, 0);
const bladeGeom = new THREE.CylinderGeometry(0.5, 0.5, 1, 3, 1, true).translate(0, 0.5, 0); // prisme ouvert à 3 pans (6 triangles)
const postGeom = new THREE.CylinderGeometry(0.5, 0.6, 1, 4, 1, true).translate(0, 0.5, 0); // poteau ouvert à 4 pans (8 triangles)

// Nombre pseudo-aléatoire stable dans [0, 1[ à partir de deux entiers (décalage de fenêtre de texture : sans hasard).
function unit(seed, k) {
  let h = (Math.imul(Math.trunc(seed) | 0, 374761393) + Math.imul(k, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 15), 2246822519);
  h = Math.imul(h ^ (h >>> 13), 3266489917);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

// Fusion de géométries d'une même matière : positions, normales et coordonnées de texture, un seul maillage à la fin.
class Builder {
  constructor() {
    this.positions = [];
    this.normals = [];
    this.uvs = [];
    // Lot 5a : couleur de sommet (blanc = texture inchangée) ; l'attribut n'est ajouté au maillage que si une teinte a servi (colored).
    this.colors = [];
    this.tint = [1, 1, 1];
    this.colored = false;
    this.matrix = new THREE.Matrix4();
    this.quaternion = new THREE.Quaternion();
    this.euler = new THREE.Euler();
    this.position = new THREE.Vector3();
    this.scale = new THREE.Vector3();
    this.edge1 = new THREE.Vector3();
    this.edge2 = new THREE.Vector3();
  }

  // Quadrilatère de coins p (cycliques) de normale voulue n ; l'ordre est inversé si besoin pour que la face regarde vers n.
  quad(p, n, uv) {
    this.edge1.set(p[1][0] - p[0][0], p[1][1] - p[0][1], p[1][2] - p[0][2]);
    this.edge2.set(p[2][0] - p[0][0], p[2][1] - p[0][1], p[2][2] - p[0][2]);
    const flip = this.edge1.cross(this.edge2).dot(this.position.set(n[0], n[1], n[2])) < 0;
    const order = flip ? [0, 3, 2, 1] : [0, 1, 2, 3];
    for (const i of [order[0], order[1], order[2], order[0], order[2], order[3]]) {
      this.positions.push(...p[i]);
      this.normals.push(...n);
      this.uvs.push(...uv[i]);
      this.colors.push(...this.tint);
    }
  }

  // Lot 5a : dessine fn() avec la teinte rgb ([r, g, b] linéaires, multipliés à la texture), puis revient au blanc.
  tinted(rgb, fn) {
    this.tint = rgb;
    this.colored = true;
    fn();
    this.tint = [1, 1, 1];
  }

  // Lot 5a : triangles déjà placés { p: [[x, y, z] × 3], n, uv: [[u, v] × 3] } (épaves : sommets de js/core/epaves.js).
  triangles(list) {
    for (const t of list) {
      for (let i = 0; i < 3; i += 1) {
        this.positions.push(...t.p[i]);
        this.normals.push(...t.n);
        this.uvs.push(...t.uv[i]);
        this.colors.push(...this.tint);
      }
    }
  }

  // Dessus d'une plaque : texture répétée (uv monde / repeat, origine (ox, oz)).
  slab(x0, z0, x1, z1, y, repeat, ox = 0, oz = 0) {
    const uv = (x, z) => [(x - ox) / repeat, (z - oz) / repeat];
    this.quad([[x0, y, z0], [x1, y, z0], [x1, y, z1], [x0, y, z1]], [0, 1, 0], [uv(x0, z0), uv(x1, z0), uv(x1, z1), uv(x0, z1)]);
  }

  // Boîte (sans dessous). faces : 'tout', 'cotes' (sans le dessus), 'longs' (les deux grandes faces verticales), 'plan' (une seule) ou 'dessus' (rien d'autre). Texture répétée { repeat } ou fenêtre d'atlas { rect, scale, seed }.
  box({ x0, y0, z0, x1, y1, z1 }, mapping, faces = 'tout') {
    const dims = { x: x1 - x0, y: y1 - y0, z: z1 - z0 };
    const list = [];
    if (faces !== 'cotes') list.push({ n: [0, 1, 0], c: [[x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1]], s: [0, 1, 1, 0], t: [0, 0, 1, 1], fw: dims.x, fh: dims.z, a: (p) => p[0], b: (p) => p[2] });
    if (faces !== 'dessus') {
      const long = faces === 'longs' || faces === 'plan' ? (dims.x >= dims.z ? 'x' : 'z') : null; // 'longs' : les deux grandes faces verticales ; 'plan' : une seule (matière à deux faces)
      const along = (axis) => (p) => p[axis];
      list.push(
        { n: [0, 0, 1], skip: long === 'z', c: [[x0, y1, z1], [x1, y1, z1], [x1, y0, z1], [x0, y0, z1]], s: [0, 1, 1, 0], t: [0, 0, 1, 1], fw: dims.x, fh: dims.y, a: along(0), b: (p) => -p[1] },
        { n: [0, 0, -1], skip: long === 'z' || (faces === 'plan' && long === 'x'), c: [[x0, y1, z0], [x1, y1, z0], [x1, y0, z0], [x0, y0, z0]], s: [0, 1, 1, 0], t: [0, 0, 1, 1], fw: dims.x, fh: dims.y, a: along(0), b: (p) => -p[1] },
        { n: [1, 0, 0], skip: long === 'x', c: [[x1, y1, z0], [x1, y1, z1], [x1, y0, z1], [x1, y0, z0]], s: [0, 1, 1, 0], t: [0, 0, 1, 1], fw: dims.z, fh: dims.y, a: along(2), b: (p) => -p[1] },
        { n: [-1, 0, 0], skip: long === 'x' || (faces === 'plan' && long === 'z'), c: [[x0, y1, z0], [x0, y1, z1], [x0, y0, z1], [x0, y0, z0]], s: [0, 1, 1, 0], t: [0, 0, 1, 1], fw: dims.z, fh: dims.y, a: along(2), b: (p) => -p[1] },
      );
    }
    list.forEach((f, k) => {
      if (f.skip) return;
      let uv;
      if (mapping?.rect) {
        const { rect, scale, seed } = mapping;
        const wu = Math.min(1, f.fw / scale);
        const wv = Math.min(1, f.fh / scale);
        const ou = unit(seed, k * 2) * (1 - wu);
        const ov = unit(seed, k * 2 + 1) * (1 - wv);
        uv = f.c.map((_, i) => [rect.u0 + (ou + f.s[i] * wu) * (rect.u1 - rect.u0), rect.v0 + (ov + f.t[i] * wv) * (rect.v1 - rect.v0)]);
      } else if (mapping?.fixed) {
        uv = f.c.map(() => mapping.fixed);
      } else if (mapping?.repeat) {
        uv = f.c.map((p) => [f.a(p) / mapping.repeat, f.b(p) / mapping.repeat]);
      } else {
        uv = f.c.map(() => [0, 0]);
      }
      this.quad(f.c, f.n, uv);
    });
  }

  // Copies transformées d'une géométrie unitaire ; l'UV d'origine (0 à 1) est ramenée dans la région d'atlas de chaque élément.
  geometry(geometry, items) {
    const source = geometry.index ? geometry.toNonIndexed() : geometry;
    for (const it of items) {
      const g = source.clone();
      g.applyMatrix4(this.matrix.compose(this.position.set(it.x, it.y, it.z), this.quaternion.setFromEuler(this.euler.set(it.tilt ?? 0, it.rot ?? 0, 0, 'YXZ')), this.scale.set(it.sx, it.sy, it.sz))); // tilt : inclinaison (lot 3g, branches)
      this.positions.push(...g.attributes.position.array);
      this.normals.push(...g.attributes.normal.array);
      const uv = g.attributes.uv.array;
      const { rect } = it;
      for (let i = 0; i < uv.length; i += 2) this.uvs.push(rect.u0 + uv[i] * (rect.u1 - rect.u0), rect.v0 + uv[i + 1] * (rect.v1 - rect.v0));
      for (let i = 0; i < uv.length; i += 2) this.colors.push(...this.tint);
      g.dispose();
    }
    if (source !== geometry) source.dispose();
  }

  // Un seul maillage Lambert, ou null s'il n'y a rien.
  mesh(scene, material, { cast = false, receive = false } = {}) {
    if (this.positions.length === 0) return null;
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(this.positions, 3));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(this.normals, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(this.uvs, 2));
    if (this.colored) geometry.setAttribute('color', new THREE.Float32BufferAttribute(this.colors, 3));
    geometry.computeBoundingSphere();
    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = cast;
    mesh.receiveShadow = receive;
    scene.add(mesh);
    return mesh;
  }
}

const extents = (b) => ({ x0: b.x - b.sx / 2, x1: b.x + b.sx / 2, y0: b.y - b.sy / 2, y1: b.y + b.sy / 2, z0: b.z - b.sz / 2, z1: b.z + b.sz / 2 });
const rectBox = (r, y0, y1) => ({ x0: r.x, x1: r.x + r.w, y0, y1, z0: r.y, z1: r.y + r.h });

// Boîtes des murs : quatre côtés dont la face intérieure est la limite de déplacement (room.wall) ; l'épaisseur déborde vers l'extérieur.
// Une ouverture (allège, linteau, deux barreaux) est découpée là où une fenêtre touche le mur.
function wallBoxes(room, windows, windowSize, render) {
  const { wallHeight: top, wallThickness: thick, sillHeight: sill, lintelBottom: lintel } = render;
  const inner = room.wall;
  const outer = inner - thick;
  const walls = [];
  const bars = [];
  const box = (list, axis, center, a, b, y0, y1) => {
    const len = b - a;
    const mid = (a + b) / 2;
    if (len <= 0) return;
    list.push(axis === 'x'
      ? { x: mid, y: (y0 + y1) / 2, z: center, sx: len, sy: y1 - y0, sz: thick }
      : { x: center, y: (y0 + y1) / 2, z: mid, sx: thick, sy: y1 - y0, sz: len });
  };
  // Positions relatives à la salle : les fenêtres du lot 1m n'ont pas de côté, il se déduit de leur place.
  const rel = (w) => ({ x: w.x - room.x, y: w.y - room.y });
  const sides = [
    { axis: 'x', center: room.y + (inner + outer) / 2, from: room.x + outer, end: room.x + room.width - outer, test: (w) => rel(w).y < inner },
    { axis: 'x', center: room.y + room.height - (inner + outer) / 2, from: room.x + outer, end: room.x + room.width - outer, test: (w) => rel(w).y > room.height - inner },
    { axis: 'z', center: room.x + (inner + outer) / 2, from: room.y + inner, end: room.y + room.height - inner, test: (w) => rel(w).x < inner },
    { axis: 'z', center: room.x + room.width - (inner + outer) / 2, from: room.y + inner, end: room.y + room.height - inner, test: (w) => rel(w).x > room.width - inner },
  ];
  const half = windowSize / 2;
  for (const side of sides) {
    const along = (w) => (side.axis === 'x' ? w.x : w.y);
    const openings = windows.filter(side.test).map((w) => [along(w) - half, along(w) + half]).sort((a, b) => a[0] - b[0]);
    let cursor = side.from;
    for (const [a, b] of openings) {
      box(walls, side.axis, side.center, cursor, a, 0, top);
      box(walls, side.axis, side.center, a, b, 0, sill);
      box(walls, side.axis, side.center, a, b, lintel, top);
      for (const k of [1, 2]) {
        const at = a + ((b - a) * k) / 3;
        bars.push(side.axis === 'x'
          ? { x: at, y: (sill + lintel) / 2, z: side.center, sx: 3, sy: lintel - sill, sz: 3 }
          : { x: side.center, y: (sill + lintel) / 2, z: at, sx: 3, sy: lintel - sill, sz: 3 });
      }
      cursor = b;
    }
    box(walls, side.axis, side.center, cursor, side.end, 0, top);
  }
  return { walls, bars };
}

// Murs d'une carte à segments (lot 3b) : les rectangles de layout.walls (déjà percés), plus allège, linteau et un barreau central par ouverture de fenêtre
// (layout.gaps). Un seul barreau par fenêtre : le budget de triangles de la carte est serré.
function segmentedWallBoxes(layout, render) {
  const { wallHeight: top, sillHeight: sill, lintelBottom: lintel } = render;
  const walls = layout.walls.map((r) => ({ x: r.x + r.w / 2, y: top / 2, z: r.y + r.h / 2, sx: r.w, sy: top, sz: r.h }));
  const bars = [];
  for (const g of layout.gaps) {
    const cx = g.x + g.w / 2;
    const cz = g.y + g.h / 2;
    walls.push({ x: cx, y: sill / 2, z: cz, sx: g.w, sy: sill, sz: g.h }, { x: cx, y: (lintel + top) / 2, z: cz, sx: g.w, sy: top - lintel, sz: g.h });
    bars.push({ x: cx, y: (sill + lintel) / 2, z: cz, sx: 3, sy: lintel - sill, sz: 3 });
  }
  return { walls, bars };
}

// Lot 3g (retours du propriétaire) : ouverture grillagée dans un mur (décor léger « grille » : a, b sur la face intérieure, n vers la salle). Les boîtes de mur qui
// contiennent le milieu de l'ouverture sont coupées sur la longueur [a, b] ; le mur reste au-dessus de `open` (linteau). Le dessin seulement : la collision du mur reste.
// Rend les boîtes de mur coupées et les rectangles des ouvertures (épaisseur de la boîte coupée, 1 de moins de chaque côté).
export function cutGrilles(walls, grilles, thick, open) {
  let out = walls;
  const holes = [];
  for (const g of grilles) {
    const mx = (g.a.x + g.b.x) / 2 - g.n.x * (thick / 2);
    const mz = (g.a.y + g.b.y) / 2 - g.n.y * (thick / 2);
    const alongX = Math.abs(g.n.y) >= Math.abs(g.n.x); // mur est-ouest : l'ouverture court le long de x
    const lo = alongX ? Math.min(g.a.x, g.b.x) : Math.min(g.a.y, g.b.y);
    const hi = alongX ? Math.max(g.a.x, g.b.x) : Math.max(g.a.y, g.b.y);
    const next = [];
    for (const w of out) {
      const inside = Math.abs(mx - w.x) <= w.sx / 2 && Math.abs(mz - w.z) <= w.sz / 2 && w.y - w.sy / 2 < open;
      if (!inside) {
        next.push(w);
        continue;
      }
      const c = alongX ? w.x : w.z;
      const len = alongX ? w.sx : w.sz;
      const w0 = c - len / 2;
      const w1 = c + len / 2;
      const a0 = Math.max(w0, lo);
      const a1 = Math.min(w1, hi);
      const piece = (p0, p1, y0, y1) => {
        if (p1 - p0 <= 0.01 || y1 - y0 <= 0.01) return;
        next.push(alongX ? { ...w, x: (p0 + p1) / 2, sx: p1 - p0, y: (y0 + y1) / 2, sy: y1 - y0 } : { ...w, z: (p0 + p1) / 2, sz: p1 - p0, y: (y0 + y1) / 2, sy: y1 - y0 });
      };
      const y0 = w.y - w.sy / 2;
      const y1 = w.y + w.sy / 2;
      piece(w0, a0, y0, y1);
      piece(a1, w1, y0, y1);
      piece(a0, a1, Math.max(y0, open), y1);
      const across = alongX ? { z0: w.z - w.sz / 2 + 1, z1: w.z + w.sz / 2 - 1 } : { x0: w.x - w.sx / 2 + 1, x1: w.x + w.sx / 2 - 1 };
      holes.push(alongX ? { x: a0, y: across.z0, w: a1 - a0, h: across.z1 - across.z0, top: Math.min(open, y1) - 0.5, alongX } : { x: across.x0, y: a0, w: across.x1 - across.x0, h: a1 - a0, top: Math.min(open, y1) - 0.5, alongX });
    }
    out = next;
  }
  return { walls: out, holes };
}

// Décor extérieur (graine fixe, voir js/core/decor.js) : `b` = constructeurs par matière, `region(id, scale?)` = fenêtre d'atlas.
// Voitures : les seuls éléments du décor qui projettent une ombre (comme les meubles), donc dans b.props. Lot 5a : tint(jeton) = couleur de sommet (épaves).
function addDecor(b, region, decor, outdoorSoil, tint) {
  // Bandes de sol : route (lignes centrées sur la bande), trottoir (dalles alignées sur la bande), sentiers de terre.
  for (const g of decor.ground) {
    if (g.kind === 'route') b.road.slab(g.x, g.y, g.x + g.w, g.y + g.h, ROAD_Y, b.repeat.road, 0, g.y);
    else if (g.kind === 'trottoir') b.sidewalk.slab(g.x, g.y, g.x + g.w, g.y + g.h, ROAD_Y, b.repeat.sidewalk, g.x, g.y);
    else b.soil.slab(g.x, g.y, g.x + g.w, g.y + g.h, ROAD_Y, outdoorSoil);
  }

  // Voitures abandonnées : caisse (peinture), habitacle (vitres), toit (peinture) et quatre roues (pneus).
  const bodyTop = 36;
  const roofTop = 3;
  const wheelR = 8;
  const wheelW = 7;
  decor.cars.forEach((c, i) => {
    if (c.burning === true) {
      addBurntCar(b.scenery, region, c, tint, i);
      return;
    }
    const paint = CAR_PAINTS[i % CAR_PAINTS.length];
    const map = (id, seed) => ({ rect: region(id), scale: region(id).scale, seed });
    b.props.box(rectBox({ x: c.x, y: c.y, w: c.w, h: c.h }, 8, bodyTop), map(paint, i * 7 + 1));
    const cabin = { x0: c.x + c.w * 0.2, x1: c.x + c.w * 0.7, y0: bodyTop, y1: c.hauteur - roofTop, z0: c.y + c.h * 0.075, z1: c.y + c.h * 0.925 };
    b.props.box(cabin, map('vitre', i * 7 + 2));
    b.props.box({ ...cabin, y0: c.hauteur - roofTop, y1: c.hauteur }, map(paint, i * 7 + 3));
    const wheels = [];
    for (const fx of [0.2, 0.8]) for (const fz of [0, 1]) wheels.push({ x: c.x + c.w * fx, y: wheelR, z: c.y + (fz === 0 ? 0 : c.h), sx: wheelR, sy: wheelR, sz: wheelW, rect: region('pneu') });
    b.props.geometry(wheelAlongZ, wheels);
  });

  // Arbres : tronc (écorce) et couronne (feuillage) ; buissons.
  b.scenery.geometry(unitCylinder, decor.trees.map((t) => ({ x: t.x + t.w / 2, y: t.hauteur / 2, z: t.y + t.h / 2, sx: t.w / 4, sy: t.hauteur, sz: t.w / 4, rect: region('ecorce') })));
  b.scenery.geometry(crown, decor.trees.map((t) => ({ x: t.x + t.w / 2, y: t.hauteur + t.couronne * 0.55, z: t.y + t.h / 2, sx: t.couronne, sy: t.couronne * 0.8, sz: t.couronne, rot: t.x, rect: region('feuillage') })));
  b.scenery.geometry(crown, decor.bushes.map((bush) => ({ x: bush.x, y: bush.hauteur / 2, z: bush.y, sx: bush.r, sy: bush.hauteur / 2, sz: bush.r, rot: bush.y, rect: region('buisson') })));

  // Lampadaires (décoratifs) et barrières (décoratives, basses).
  b.scenery.geometry(unitCylinder, decor.lamps.map((l) => ({ x: l.x, y: l.hauteur / 2, z: l.y, sx: 2.5, sy: l.hauteur, sz: 2.5, rect: region('tole') })));
  b.scenery.geometry(crown, decor.lamps.map((l) => ({ x: l.x, y: l.hauteur + 4, z: l.y, sx: 8, sy: 6, sz: 8, rect: region('lampe') })));
  decor.fences.forEach((f, i) => b.scenery.box(rectBox(f, 0, f.hauteur), { rect: region('barriere'), scale: region('barriere').scale, seed: i + 300 }));
}

// Lot 5a : voiture calcinée (js/core/epaves.js : mêmes boîtes que les autres voitures, plus basses, teintes --game-car-burnt et --game-car-soot) et
// jantes nues ; dans le maillage du décor de l'atlas (sans ombre portée, étendu à tout le monde) : aucun appel de dessin de plus, et la sphère englobante
// des voitures (avec ombre) ne change pas quand la voiture est posée loin de la route (retour du propriétaire).
function addBurntCar(props, region, car, tint, i) {
  const parts = burntCarParts(car);
  for (const [k, q] of parts.boxes.entries()) props.tinted(tint(q.tint), () => props.box(q, { rect: region(q.region), scale: region(q.region).scale, seed: i * 7 + k + 1 }));
  props.tinted(tint('car-soot'), () => props.geometry(wheelAlongZ, parts.wheels.map((w) => ({ x: w.x, y: w.y, z: w.z, sx: w.r, sy: w.r, sz: w.w, rect: region('pneu') }))));
}

// Lot 5a : hélicoptère écrasé (js/core/epaves.js : triangles coupés au plan du sol), dans le maillage du décor de l'atlas (arbres, lampadaires : sans ombre portée,
// étendu à tout le monde, donc dessiné partout comme avant) : aucun appel de dessin de plus, et la sphère englobante des voitures ne change pas.
// Coordonnées de texture : projection sur le plan le plus proche de la face, ramenée dans la région d'atlas de la pièce (aucune texture nouvelle).
function addHelicopter(props, region, heli, tint) {
  const placed = placeHelicopter(heli);
  const byPart = new Map();
  for (const t of placed.triangles) {
    if (!byPart.has(t.part)) byPart.set(t.part, []);
    byPart.get(t.part).push(t);
  }
  for (const list of byPart.values()) {
    const r = region(list[0].region);
    const lo = [Infinity, Infinity, Infinity];
    for (const t of list) for (const p of t.p) for (let k = 0; k < 3; k += 1) lo[k] = Math.min(lo[k], p[k]);
    const span = Math.max(1, r.scale);
    const uv = (p, n) => {
      const ax = Math.abs(n[0]) >= Math.abs(n[1]) && Math.abs(n[0]) >= Math.abs(n[2]) ? [2, 1] : Math.abs(n[1]) >= Math.abs(n[2]) ? [0, 2] : [0, 1];
      const a = Math.min(1, (p[ax[0]] - lo[ax[0]]) / span);
      const c = Math.min(1, (p[ax[1]] - lo[ax[1]]) / span);
      return [r.u0 + a * (r.u1 - r.u0), r.v0 + c * (r.v1 - r.v0)];
    };
    props.tinted(tint(list[0].tint), () => props.triangles(list.map((t) => ({ p: t.p, n: t.n, uv: t.p.map((p) => uv(p, t.n)) }))));
  }
  return placed.count;
}

// Lot 3g (retour du propriétaire) : décor extérieur non solide de js/core/decor-vivant.js. Arbres morts (écorce), barbelés (poteaux de bois sombre, fils de tôle),
// poteaux électriques et câbles, flaques (région « vitre », à plat), touffes d'herbes (brins inclinés), gravats (pierre), bidons (tôle rouillée).
function addLively(b, region, lv) {
  const bark = region('ecorce');
  b.scenery.geometry(thinTrunk, lv.deadTrees.map((t) => ({ x: t.x, y: t.hauteur / 2, z: t.y, sx: t.rayon, sy: t.hauteur, sz: t.rayon, rect: bark })));
  b.scenery.geometry(branchGeom, lv.deadTrees.flatMap((t) => t.branches.map((br) => ({ x: t.x, y: br.at, z: t.y, sx: br.r, sy: br.len, sz: br.r, tilt: br.tilt, rot: br.rot, rect: bark }))));
  const wood = region('bois-sombre');
  const metal = region('tole');
  b.scenery.geometry(postGeom, lv.fence.posts.map((p) => ({ x: p.x, y: 0, z: p.y, sx: 4, sy: p.hauteur, sz: 4, tilt: p.lean, rect: wood })));
  for (const w of lv.fence.wires) {
    for (const h of [12, 22, 32]) {
      const x0 = Math.min(w.x0, w.x1);
      const x1 = Math.max(w.x0, w.x1);
      const z0 = Math.min(w.y0, w.y1);
      const z1 = Math.max(w.y0, w.y1);
      b.scenery.box({ x0: x0 - 0.6, x1: x1 + 0.6, y0: h, y1: h + 1.2, z0: z0 - 0.6, z1: z1 + 0.6 }, { rect: metal, scale: metal.scale, seed: 11 }, 'cotes');
    }
  }
  b.scenery.geometry(postGeom, lv.poles.map((p) => ({ x: p.x, y: 0, z: p.y, sx: 7, sy: p.hauteur, sz: 7, rect: wood })));
  lv.poles.forEach((p, i) => b.scenery.box({ x0: p.x - 26, x1: p.x + 26, y0: p.hauteur - 14, y1: p.hauteur - 10, z0: p.y - 2.5, z1: p.y + 2.5 }, { rect: wood, scale: wood.scale, seed: 40 + i }));
  const tire = region('pneu');
  for (const c of lv.cables) for (const dz of [-20, 20]) b.scenery.box({ x0: c.x0 + dz, x1: c.x1 + dz, y0: c.h, y1: c.h + 1, z0: c.y - 0.5, z1: c.y + 0.5 }, { rect: tire, scale: tire.scale, seed: 3 }, 'cotes');
  const water = region('vitre');
  lv.puddles.forEach((p, i) => b.scenery.box({ x0: p.x, x1: p.x + p.w, y0: ROAD_Y, y1: ROAD_Y + 0.3, z0: p.y, z1: p.y + p.h }, { rect: water, scale: water.scale, seed: 60 + i }, 'dessus'));
  const grass = region('buisson');
  b.scenery.geometry(bladeGeom, lv.tufts.flatMap((t) => [0, 1, 2].map((k) => ({ x: t.x + Math.cos(t.rot + k * 2.1) * t.r * 0.4, y: 0, z: t.y + Math.sin(t.rot + k * 2.1) * t.r * 0.4, sx: 3, sy: t.hauteur * (0.75 + 0.15 * k), sz: 3, tilt: 0.25 + 0.12 * k, rot: t.rot + k * 2.1, rect: grass }))));
  for (const r of lv.rubble) rubbleBoxes(r, 22, r.id).forEach((q, j) => {
    const rg = region(q.region);
    b.scenery.box(q, { rect: rg, scale: rg.scale, seed: 80 + j }, q.faces);
  });
  const rust = region('barriere');
  b.scenery.geometry(unitCylinder, lv.barrels.map((br) => ({ x: br.x, y: br.hauteur / 2, z: br.y, sx: br.r, sy: br.hauteur, sz: br.r, rect: rust })));
}

// layout : couche du rez-de-chaussée (js/core/layout.js) ; layouts : sortie de buildLayouts (lot 3e : une couche par étage, facultatif) ; textures : sortie de
// createThreeTextures (js/game/textures.js). Renvoie { scene, groups, showFloor, ... }.
// Escalier physique (lot 3e, mise à jour) : la montée est la partie du chemin où la hauteur monte (du dernier point à t = 0 au premier point à t = 1), une ligne brisée
// (droite, ou courbe pour l'escalier de départ) ; la largeur vient de zones.json (walk.width).
export function riseOf(walk) {
  const path = Array.isArray(walk?.path) ? walk.path : [];
  const hi = path.findIndex((q) => q.t >= 1);
  if (path.length < 2 || hi < 1) return null;
  const lo = path.findLastIndex((q, i) => i < hi && q.t <= 0);
  if (lo < 0) return null;
  const points = path.slice(lo, hi + 1).map((q) => ({ x: q.x, y: q.y, t: q.t }));
  const lengths = points.slice(1).map((q, i) => Math.hypot(q.x - points[i].x, q.y - points[i].y));
  return { points, lengths, total: lengths.reduce((n, l) => n + l, 0), width: num(walk.width, 100) };
}

// Point de la montée à la fraction k (0 au pied, 1 en haut) : { x, y, t, tx, ty } (tangente unitaire).
export function riseAt(rise, k) {
  const at = Math.min(1, Math.max(0, k)) * rise.total;
  let walked = 0;
  for (let i = 0; i < rise.lengths.length; i += 1) {
    const len = rise.lengths[i];
    if (at <= walked + len || i === rise.lengths.length - 1) {
      const a = rise.points[i];
      const b = rise.points[i + 1];
      const f = len > 0 ? Math.min(1, Math.max(0, (at - walked) / len)) : 0;
      return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f, t: a.t + (b.t - a.t) * f, tx: len > 0 ? (b.x - a.x) / len : 1, ty: len > 0 ? (b.y - a.y) / len : 0 };
    }
    walked += len;
  }
  return { ...rise.points[0], tx: 1, ty: 0 };
}

// Distance d'un point à la montée, et de combien il dépasse un bout (le tube est coupé droit aux deux bouts).
function distanceToRise(rise, x, y) {
  let best = { d: Infinity, beyond: 0 };
  rise.points.slice(1).forEach((b, i) => {
    const a = rise.points[i];
    const len = rise.lengths[i];
    const raw = len > 0 ? ((x - a.x) * (b.x - a.x) + (y - a.y) * (b.y - a.y)) / len : 0;
    const k = Math.min(len, Math.max(0, raw));
    const d = Math.hypot(x - (a.x + ((b.x - a.x) / (len || 1)) * k), y - (a.y + ((b.y - a.y) / (len || 1)) * k));
    const beyond = (i === 0 ? Math.max(0, -raw) : 0) + (i === rise.lengths.length - 1 ? Math.max(0, raw - len) : 0);
    if (d < best.d - 1e-9) best = { d, beyond };
  });
  return best;
}

// Garde-corps (retour du propriétaire, lot 5k) : un côté { x0, x1, z0, z1 } du garde-corps, privé des parties qu'un mur plein de l'étage (walls : emprises
// { x0, x1, z0, z1 }) couvre sur toute son épaisseur ; l'escalier de l'aile longe le mur ouest : ses barreaux, dans le mur, scintillaient sur sa face.
// Renvoie les morceaux restants (plus de 0,5 unité de long et d'épaisseur).
export function fenceParts(side, walls) {
  const { x0, x1, z0, z1 } = side;
  if (x1 - x0 <= 0.5 || z1 - z0 <= 0.5) return [];
  const alongX = x1 - x0 >= z1 - z0;
  let parts = [alongX ? [x0, x1] : [z0, z1]];
  for (const w of walls) {
    const [c0, c1, w0, w1] = alongX ? [z0, z1, w.z0, w.z1] : [x0, x1, w.x0, w.x1];
    if (c0 < w0 - 0.5 || c1 > w1 + 0.5) continue;
    const [a0, a1] = alongX ? [w.x0, w.x1] : [w.z0, w.z1];
    parts = parts.flatMap(([u, v]) => [[u, Math.min(v, a0)], [Math.max(u, a1), v]].filter(([m, n]) => n - m > 0.5));
  }
  return parts.map(([u, v]) => (alongX ? { x0: u, x1: v, z0, z1 } : { x0, x1, z0: u, z1: v }));
}

// Trou dans le sol de l'étage : un seul rectangle pour une montée droite parallèle à un axe ; sinon des bandes horizontales de `strip` unités, toutes à l'intérieur de la
// largeur (le sol déborde un peu sur la rampe, jamais l'inverse). Rectangles { x0, y0, x1, y1 }.
export function holeRects(rise, strip = 15) {
  const hw = rise.width / 2;
  const [a, b] = [rise.points[0], rise.points.at(-1)];
  if (rise.points.length === 2) {
    if (Math.abs(b.x - a.x) < 1e-6) return [{ x0: a.x - hw, x1: a.x + hw, y0: Math.min(a.y, b.y), y1: Math.max(a.y, b.y) }];
    if (Math.abs(b.y - a.y) < 1e-6) return [{ x0: Math.min(a.x, b.x), x1: Math.max(a.x, b.x), y0: a.y - hw, y1: a.y + hw }];
  }
  const xs = rise.points.map((q) => q.x);
  const ys = rise.points.map((q) => q.y);
  const minX = Math.min(...xs) - hw;
  const maxX = Math.max(...xs) + hw;
  const minY = Math.min(...ys) - hw;
  const maxY = Math.max(...ys) + hw;
  const inside = (x, y) => {
    const m = distanceToRise(rise, x, y);
    return m.d <= hw - 2 && m.beyond <= 0;
  };
  const rects = [];
  for (let y0 = minY; y0 < maxY; y0 += strip) {
    const y1 = Math.min(maxY, y0 + strip);
    let runStart = null;
    for (let x = minX; x <= maxX + 4; x += 4) {
      const ok = x <= maxX && [y0, (y0 + y1) / 2, y1].every((y) => inside(x, y));
      if (ok && runStart === null) runStart = x;
      if (!ok && runStart !== null) {
        if (x - 4 - runStart >= 4) rects.push({ x0: runStart, x1: x - 4, y0, y1 });
        runStart = null;
      }
    }
  }
  return rects;
}

// Rectangles { x, y, w, h } privés des trous { x0, y0, x1, y1 } : au plus quatre morceaux par rectangle et par trou.
export function subtractHole(rects, hole) {
  const out = [];
  for (const r of rects) {
    const x1 = r.x + r.w;
    const y1 = r.y + r.h;
    if (hole.x1 <= r.x || hole.x0 >= x1 || hole.y1 <= r.y || hole.y0 >= y1) {
      out.push(r);
      continue;
    }
    const ix0 = Math.max(r.x, hole.x0);
    const ix1 = Math.min(x1, hole.x1);
    const iy0 = Math.max(r.y, hole.y0);
    const iy1 = Math.min(y1, hole.y1);
    if (iy0 > r.y) out.push({ x: r.x, y: r.y, w: r.w, h: iy0 - r.y });
    if (iy1 < y1) out.push({ x: r.x, y: iy1, w: r.w, h: y1 - iy1 });
    if (ix0 > r.x) out.push({ x: r.x, y: iy0, w: ix0 - r.x, h: iy1 - iy0 });
    if (ix1 < x1) out.push({ x: ix1, y: iy0, w: x1 - ix1, h: iy1 - iy0 });
  }
  return out;
}

// Boîte orientée (marche) : cinq faces (pas de dessous) autour du point (cx, cz), longueur le long de (dx, dz), largeur perpendiculaire, de y = 0 à y = h.
function orientedStep(builder, cx, cz, dx, dz, length, width, h, repeat) {
  const nx = -dz;
  const nz = dx;
  const corner = (a, b, y) => [cx + dx * (length / 2) * a + nx * (width / 2) * b, y, cz + dz * (length / 2) * a + nz * (width / 2) * b];
  const uvOf = (p) => [p[0] / repeat, p[2] / repeat];
  const top = [corner(-1, -1, h), corner(1, -1, h), corner(1, 1, h), corner(-1, 1, h)];
  builder.quad(top, [0, 1, 0], top.map(uvOf));
  const sides = [[[-1, -1], [1, -1], [0, -1]], [[1, -1], [1, 1], [1, 0]], [[1, 1], [-1, 1], [0, 1]], [[-1, 1], [-1, -1], [-1, 0]]];
  for (const [p, q, n] of sides) {
    const quad = [corner(p[0], p[1], h), corner(q[0], q[1], h), corner(q[0], q[1], 0), corner(p[0], p[1], 0)];
    const normal = [dx * n[0] + nx * n[1], 0, dz * n[0] + nz * n[1]];
    builder.quad(quad, normal, quad.map((c) => [(c[0] + c[2]) / repeat, -c[1] / repeat]));
  }
}

// Lot 3e : chaque maillage porte userData.floor (rdc, etage ou exterieur) et vit dans le groupe de son étage ; showFloor(floor) ne change que la visibilité des groupes
// (aucune reconstruction, aucun dispose) : un seul étage est dessiné à la fois, l'extérieur (sol, décor, brume) toujours.
export function buildWorld({ palette, layout, layouts = null, render, textures, windowGeoms = [], windowsCfg = null, seed = 1, closedDoors = null, stairs = [] }) {
  const { room, size } = layout;
  const floors = layouts?.floors ?? ['rdc'];
  const layoutOf = (f) => layouts?.[f] ?? layout;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(palette.fog);
  // Nuit et brume (lot 3b) : le brouillard est réglé par setFog d'après la distance de la caméra (render.json : fog.near et fog.far, en multiples de cette distance).
  scene.fog = new THREE.Fog(palette.fog, 1e6, 2e6);
  // Groupes : exterieur (sol, décor, brume), rdc (meubles, détails, fenêtres, portes recouverts par le sol de l'étage : seulement quand le joueur est au rez-de-chaussée),
  // rdcExposed (les mêmes, mais hors du sol de l'étage ou sous un trou d'escalier : toujours dessinés, rien ne disparaît vu d'en haut), rdcShell (sol, murs et
  // rampes du rez-de-chaussée : toujours dessinés, on les voit sous l'étage), etage (tout l'étage : seulement quand le joueur est monté). Ils sont décalés en hauteur
  // par setElevation : le joueur reste à y = 0, c'est le monde qui descend quand il monte (et dynamic porte les zombies et les effets de l'étage du joueur).
  const groups = { exterieur: new THREE.Group(), rdc: new THREE.Group(), rdcExposed: new THREE.Group(), rdcShell: new THREE.Group(), etage: new THREE.Group() };
  for (const [name, g] of Object.entries(groups)) {
    g.name = name;
    g.userData.floor = name === 'rdcShell' || name === 'rdcExposed' ? 'rdc' : name;
    scene.add(g);
  }
  groups.etage.visible = false;
  const dynamic = new THREE.Group();
  dynamic.name = 'dynamique';
  scene.add(dynamic);
  // Laser, balles et étincelles : à la hauteur du joueur (y = 0), jamais décalés avec l'étage ou l'élévation (sinon ils restent en bas ou en haut quand il monte).
  const effectsRoot = new THREE.Group();
  effectsRoot.name = 'effets';
  scene.add(effectsRoot);
  const lift = num(render.floorLift, 0);
  const shellOf = (f) => (f === 'rdc' ? groups.rdcShell : groups[f]);
  // Trous du sol de l'étage : la rampe de chaque escalier (on voit l'escalier et le rez-de-chaussée en dessous).
  const STEPS = 10;
  // Le trou de chaque escalier dans le sol de l'étage est son emprise pleine de l'étage (zones.json : la même zone est un obstacle pour les joueurs et les zombies, donc on ne
  // peut pas passer derrière l'escalier et on voit le rez-de-chaussée en dessous) ; sans emprise, des bandes qui suivent la montée.
  const holes = stairs.map((st) => ({ id: st.id, rise: riseOf(st.walk), solid: st.floors?.etage?.solid ?? null, end: st.walk?.path?.at(-1) ?? null })).filter((h) => h.rise !== null).map((h) => ({ ...h, rects: h.solid ? [{ x0: h.solid.x, y0: h.solid.y, x1: h.solid.x + h.solid.w, y1: h.solid.y + h.solid.h }] : holeRects(h.rise) }));
  // Un élément du rez-de-chaussée est « exposé » (dessiné aussi quand le joueur est à l'étage) s'il n'est pas sous le sol de l'étage, ou s'il est sous un trou d'escalier : le
  // sol de l'étage cache le reste, inutile de le dessiner (budget de triangles).
  const etageFloorRects = floors.includes('etage') ? layoutOf('etage').floor : null;
  const inRect = (r, x, z) => x >= r.x && x <= r.x + r.w && z >= r.y && z <= r.y + r.h;
  // Un rectangle (meuble, porte) qui touche un trou est dessiné en entier dans le groupe toujours visible : rien n'apparaît ni ne disparaît à moitié.
  const touchesHole = (r) => holes.some((h) => h.rects.some((q) => r.x < q.x1 && r.x + r.w > q.x0 && r.y < q.y1 && r.y + r.h > q.y0));
  // Un rectangle dont deux coins au moins dépassent du sol de l'étage (la moitié au plus est couverte) : il reste dessiné en entier.
  const partlyUncovered = (r) => etageFloorRects !== null && [[r.x, r.y], [r.x + r.w, r.y], [r.x, r.y + r.h], [r.x + r.w, r.y + r.h]].filter(([x, z]) => !etageFloorRects.some((q) => inRect(q, x, z))).length >= 2;
  const exposedAt = (x, z) => etageFloorRects !== null && (!etageFloorRects.some((r) => inRect(r, x, z)) || holes.some((h) => h.rects.some((r) => x >= r.x0 && x <= r.x1 && z >= r.y0 && z <= r.y1)));

  const ambientLight = new THREE.AmbientLight(palette.ambient, render.light.ambient);
  scene.add(ambientLight);
  const sun = new THREE.DirectionalLight(palette.sun, render.light.sun);
  const half = render.light.shadowHalfSize;
  sun.castShadow = true;
  sun.shadow.mapSize.set(render.light.shadowMap, render.light.shadowMap);
  Object.assign(sun.shadow.camera, { left: -half, right: half, top: half, bottom: -half, near: 50, far: render.light.shadowFar });
  sun.shadow.bias = -0.0006;
  sun.shadow.normalBias = 0.6;
  const o = render.light.sunOffset;
  sun.position.set(room.x + room.width / 2 + o.x, o.y, room.y + room.height / 2 + o.z);
  sun.target.position.set(room.x + room.width / 2, 0, room.y + room.height / 2);
  scene.add(sun, sun.target);

  // Une matière (donc un appel de dessin) par texture. Extérieur : sol de terre, herbe, route, trottoir, décor de l'atlas de props (arbres, buissons, lampadaires,
  // barrières) et voitures (avec ombre). Chaque étage : sol, murs, détails (barreaux, pieds, dossiers, socles : atlas sans ombre) et meubles (avec ombre).
  const mat = (id) => new THREE.MeshLambertMaterial({ map: textures.texture(id) });
  // Lot 3g (retours du propriétaire) : murs, meubles, portes et décor (atlas) percés autour du joueur caché (render.seeThrough ; ?percee=0 l'enlève).
  const seeThrough = createSeeThrough(seeThroughSettings(render.seeThrough));
  const atlasMaterial = seeThrough.apply(mat(ATLAS));
  const region = (id) => textures.region(ATLAS, id);
  const ex = {
    road: new Builder(), sidewalk: new Builder(), grass: new Builder(), soil: new Builder(), scenery: new Builder(), props: new Builder(),
    repeat: { road: textures.repeat('route'), sidewalk: textures.repeat('trottoir') },
  };
  const outdoorSoil = textures.repeat('sol-exterieur');
  const onFloor = Object.fromEntries(floors.map((f) => [f, { floor: new Builder(), wall: new Builder(), detail: new Builder(), props: new Builder(), detailUp: new Builder(), propsUp: new Builder() }]));

  // Sol extérieur de terre étendu bien au-delà du monde ; dans le monde, l'herbe (salle du lot 1m : marge plate de terre, comme avant).
  ex.soil.slab(size.width / 2 - FAR_GROUND / 2, size.height / 2 - FAR_GROUND / 2, size.width / 2 + FAR_GROUND / 2, size.height / 2 + FAR_GROUND / 2, -1.5, outdoorSoil);
  if (layout.empty) {
    const m = layout.margin;
    ex.soil.slab(room.x - m, room.y - m, room.x + room.width + m, room.y + room.height + m, -1, outdoorSoil);
  } else {
    ex.grass.slab(0, 0, size.width, size.height, -1, textures.repeat('herbe'));
  }

  // Portes et blocs (lots 3c et 3e) : liste de zones.json (voir plus bas).
  const doorList = Array.isArray(layouts?.doors) ? layouts.doors.map((d) => ({ id: d.id, blocks: floors.flatMap((f) => (d.blocks?.[f] ?? []).map((b) => ({ floor: f, ...b }))) })) : (Array.isArray(layout.doors) ? layout.doors : []).map((d) => ({ id: d.id, blocks: (d.blocks ?? [{ id: d.id, wall: true, rect: d.rect }]).map((b) => ({ floor: 'rdc', ...b })) }));
  // Lot 3g (retours du propriétaire) : murs et piliers jusqu'à floorLift - 1, au rez-de-chaussée et à l'étage (essai, render.ceilingWalls).
  const tallWalls = render.ceilingWalls === true && lift > num(render.wallHeight);
  // Dessin d'une porte dans un mur : un peu plus mince que le mur (1 de moins de chaque côté), 0,5 de jeu aux bouts (le débord de 4 des collisions n'est pas dessiné).
  const wallDoorRect = (r, thickness) => {
    const t = thickness - 2;
    const along = Math.max(r.w, r.h) - 2 * 4;
    return r.h > r.w ? { x: r.x + r.w / 2 - t / 2, y: r.y + 4 + 0.5, w: t, h: along - 1 } : { x: r.x + 4 + 0.5, y: r.y + r.h / 2 - t / 2, w: along - 1, h: t };
  };
  const grillesOf = (f) => (Array.isArray(render.decorInterieur) ? render.decorInterieur : []).filter((it) => it?.kind === 'grille' && it.floor === f && it.a && it.b && it.n);
  // Mur percé (lot 3g, retours) : boîtes qui peuvent cacher le joueur (murs, piliers, meubles), par étage, pour le test de la caméra à chaque image.
  const occluders = [];
  const etageWalls = []; // murs pleins de l'étage (emprises { x0, x1, z0, z1 }) : le garde-corps n'est pas dessiné contre eux
  const wallRepeat = textures.repeat('mur');
  for (const f of floors) {
    const l = layoutOf(f);
    const fb = onFloor[f];
    // Sol de la salle : carrelage (la dalle commence au coin de la salle, les carreaux sont alignés dessus). Chaque étage est dessiné à y = 0 quand il est affiché.
    const floorRects = f === 'etage' ? holes.reduce((rects, h) => h.rects.reduce(subtractHole, rects), l.floor) : l.floor;
    for (const fl of floorRects) fb.floor.slab(fl.x, fl.y, fl.x + fl.w, fl.y + fl.h, 0, textures.repeat('sol-salle'), l.room.x, l.room.y);
    // Murs (allège, linteau et barreaux des fenêtres compris) : enduit sur les côtés, dessus de la couleur --game-wall sans texture.
    // Lot 3g (essai demandé par le propriétaire) : render.ceilingWalls monte les murs et les piliers jusqu'à floorLift - 1 (rez-de-chaussée, puis l'étage aussi à la troisième passe des retours).
    // Le dessin seulement : collisions, tirs et fenêtres inchangés.
    const tall = tallWalls; // troisième passe des retours : l'étage aussi, pour que ce soit uniforme
    const wallRender = tall ? { ...render, wallHeight: lift - 1 } : render;
    const built = l.segmented ? segmentedWallBoxes(l, wallRender) : wallBoxes(l.room, l.windows, l.windowSize, wallRender);
    const { bars } = built;
    // Lot 3g (retours du propriétaire) : ouvertures grillagées (le modèle n'a pas de mur à côté de F8 ni à la place de F7) ; murs jusqu'au plafond : un linteau de
    // béton au-dessus de chaque porte dans un mur (de DOOR_TALL jusqu'au plafond, aux deux étages ; cinquième passe, à la demande du propriétaire), qui reste quand
    // la porte s'ouvre. Le dessin seulement : la collision de la porte ne change pas.
    const thickness = num(l.wallThickness, num(layout.wallThickness, 40));
    // Ouverture grillagée sur toute la hauteur (vue du dessus, on voit la traverse et les barreaux ; un linteau les cacherait).
    const cut = cutGrilles(built.walls, grillesOf(f), thickness, num(wallRender.wallHeight) + 1);
    const walls = cut.walls;
    if (tall) {
      for (const d of doorList) {
        for (const bl of d.blocks) {
          if (bl.floor !== f || !bl.wall || !bl.rect) continue;
          const v = wallDoorRect(bl.rect, thickness + 2); // toute l'épaisseur du mur, sur la longueur de l'ouverture
          walls.push({ x: v.x + v.w / 2, z: v.y + v.h / 2, sx: v.w, sz: v.h, y: (DOOR_TALL + lift - 1) / 2, sy: lift - 1 - DOOR_TALL });
        }
      }
    }
    cut.holes.forEach((h, k) => grilleBoxes(h, h.top, 10, h.alongX).forEach((b, j) => {
      const r = region(b.region);
      fb.detail.box(b, { rect: r, scale: r.scale, seed: 700 + k * 40 + j }, b.faces);
    }));
    for (const w of walls) {
      occluders.push({ ...extents(w), floor: f });
      if (f === 'etage') {
        const e = extents(w);
        if (e.y0 <= 0.5 && e.y1 >= FENCE_HEIGHT) etageWalls.push(e);
      }
      fb.wall.box(extents(w), { repeat: wallRepeat }, 'cotes');
      fb.wall.box(extents(w), { fixed: [0.31, 0.62] }, 'dessus'); // dessus : un seul texel du mur, donc sans texture
    }
    // Escaliers physiques (lot 3e, mise à jour) : marches de béton (dix boîtes qui suivent la montée, droite ou courbe, et montent jusqu'à floorLift) dans le maillage des murs
    // du rez-de-chaussée : aucun appel de dessin de plus, visibles de l'étage à travers le trou de chaque escalier.
    if (f === 'rdc') {
      for (const { rise } of holes) {
        for (let i = 0; i < STEPS; i += 1) {
          const p0 = riseAt(rise, i / STEPS);
          const p1 = riseAt(rise, (i + 1) / STEPS);
          const run = Math.hypot(p1.x - p0.x, p1.y - p0.y) || 1;
          // La dernière marche se prolonge de 26 unités sous le sol de l'étage : plus de vide entre l'escalier et le sol (un peu sous le niveau du sol, pour ne pas le doubler).
          const last = i === STEPS - 1;
          const ext = last ? 26 : 0;
          orientedStep(fb.wall, (p0.x + p1.x) / 2 + ((p1.x - p0.x) / run) * (ext / 2), (p0.y + p1.y) / 2 + ((p1.y - p0.y) / run) * (ext / 2), (p1.x - p0.x) / run, (p1.y - p0.y) / run, run + 1 + ext, rise.width, lift * p1.t - (last ? 0.2 : 0), wallRepeat);
        }
      }
    }
    bars.forEach((bar, i) => fb.detail.box(extents(bar), { rect: region('tole'), scale: region('tole').scale, seed: 500 + i }));
    // Meubles : boîtes aux hauteurs de world.json, une région d'atlas par type. Lot 3c : tables, chaises et armoires modélisées (js/core/furniture-model.js) ; les corps
    // projettent une ombre, les pieds, dossiers et socles forment un maillage sans ombre portée. Les collisions gardent le rectangle d'origine.
    l.furniture.forEach((fu, i) => {
      if (fu.kind === 'escalier') return; // dessiné par la rampe (escalier physique)
      const occH = fu.kind === 'pilier' && tall ? lift - 1 : Math.min(num(fu.hauteur, 60), fu.kind === 'pilier' ? num(render.wallHeight, 60) : 70);
      occluders.push({ ...rectBox(fu, 0, occH), floor: f });
      const up0 = f === 'rdc' && (exposedAt(fu.x + fu.w / 2, fu.y + fu.h / 2) || touchesHole(fu) || partlyUncovered(fu));
      // Lot 3g (retour du propriétaire) : aspect du mobilier d'après le modèle (render.mobilier : mobilier.world.json, absent avec ?detail=0) ; chaque pièce de
      // l'obstacle est dessinée par ses propres boîtes (étagères, classeurs, caisses…), les collisions gardent le rectangle de l'obstacle.
      const ids = Array.isArray(fu.parts) ? fu.parts : [fu.id];
      const looks = render.mobilier && fu.kind !== 'pilier' ? ids.map((id) => render.mobilier[id]).filter(Boolean) : [];
      if (looks.length > 0 && looks.length === ids.length) {
        looks.forEach((m, k) => m.boxes.forEach((b, j) => {
          const r = region(b.region);
          (up0 ? fb.propsUp : fb.props).box({ x0: b.x0, x1: b.x1, y0: b.y0, y1: b.y1, z0: b.z0, z1: b.z1 }, { rect: r, scale: r.scale, seed: i * 31 + k * 7 + j + 1 }, b.faces);
        }));
        return;
      }
      const parts = furnitureParts(tall && fu.kind === 'pilier' ? { ...fu, hauteur: lift - 1 } : fu, FURNITURE_REGION, l.walls);
      const draw = (builder, p, k) => {
        const r = region(p.region);
        builder.box({ x0: p.x0, x1: p.x1, y0: p.y0, y1: p.y1, z0: p.z0, z1: p.z1 }, { rect: r, scale: r.scale, seed: i * 8 + k + 1 }, p.faces);
      };
      const up = f === 'rdc' && (exposedAt(fu.x + fu.w / 2, fu.y + fu.h / 2) || touchesHole(fu) || partlyUncovered(fu));
      parts.body.forEach((p, k) => draw(up ? fb.propsUp : fb.props, p, k));
      parts.detail.forEach((p, k) => draw(up ? fb.detailUp : fb.detail, p, k + 4));
    });
  }

  // Lot 3g : décor léger intérieur, non solide (render.decorInterieur : decor-interieur.world.json, absent avec ?detail=0 et ?map=salle). Un maillage
  // par étage dans l'atlas de props (groupe rdc, toujours dessiné, ou etage), sans ombre portée, créé une fois : un appel de dessin par étage.
  const decorB = Object.fromEntries(floors.map((f) => [f, new Builder()]));
  const decorCount = Object.fromEntries(floors.map((f) => [f, 0]));
  for (const it of Array.isArray(render.decorInterieur) ? render.decorInterieur : []) {
    if (!floors.includes(it?.floor) || !DECOR_CATALOGUE[it.kind]) continue;
    if (it.kind === 'grille') continue; // ouverture grillagée : mur coupé et barreaux dessinés avec les murs (cutGrilles, grilleBoxes)
    const b = decorB[it.floor];
    const scale = DECOR_CATALOGUE[it.kind].scale;
    for (const q of itemQuads(it)) {
      const r = region(q.region);
      const su = Math.min(1, q.size[0] / scale);
      const sv = Math.min(1, q.size[1] / scale);
      b.quad(q.p, q.n, q.uv.map(([u, v]) => [r.u0 + u * su * (r.u1 - r.u0), r.v0 + v * sv * (r.v1 - r.v0)]));
    }
    decorCount[it.floor] += 1;
  }

  // Lot 3g (retour du propriétaire) : feux avec fumée sur des piles de caisses (render.feux : feux.json ; absent avec ?detail=0), posés au centre et sur le dessus
  // de la pièce (boîtes de mobilier.world.json). Trois appels de dessin par feu, dans le groupe de son étage.
  const fires = [];
  const viewFrustum = new THREE.Frustum(); // lot 5b-C : champ de la caméra (feux hors champ)
  const viewMatrix = new THREE.Matrix4();
  for (const fe of Array.isArray(render.feux) ? render.feux : []) {
    const boxes = render.mobilier?.[fe?.piece]?.boxes;
    if (!floors.includes(fe?.floor) || !Array.isArray(boxes) || boxes.length === 0) continue;
    const x0 = Math.min(...boxes.map((b) => b.x0));
    const x1 = Math.max(...boxes.map((b) => b.x1));
    const z0 = Math.min(...boxes.map((b) => b.z0));
    const z1 = Math.max(...boxes.map((b) => b.z1));
    const fire = createFire({ id: fe.id, x: (x0 + x1) / 2, z: (z0 + z1) / 2, y: Math.max(...boxes.map((b) => b.y1)), w: x1 - x0, d: z1 - z0 }, palette, { reduced: render.reducedMotion === true });
    fire.group.userData.floor = fe.floor;
    groups[fe.floor].add(fire.group);
    fire.kind = 'decor'; // lot 5b : « autres feux » des préréglages
    fires.push(fire);
  }

  // Lot 5a : teintes des épaves (jetons --game-* du bloc « Décor en flammes (lot 5a) » de tokens.css, lus par palette.js), en couleurs linéaires.
  const tintOf = (token) => {
    const value = palette[token.replace(/-(\w)/g, (_, ch) => ch.toUpperCase())];
    if (!value) return [1, 1, 1];
    const c = new THREE.Color(value);
    return [c.r, c.g, c.b];
  };
  if (layout.decor) addDecor(ex, region, layout.decor, outdoorSoil, tintOf);
  // Lot 5a : hélicoptère écrasé (maillage du décor de l'atlas) et feu groupé de la voiture en flammes (deux foyers, capot et habitacle ; flammes et fumée, sans
  // lueur au sol : deux appels de dessin, aucune lumière ; absent avec ?detail=0, comme les autres feux). Créés une fois, dans le groupe extérieur.
  const wrecks = { helicopter: null, burningCar: null };
  if (layout.decor?.helicopter) wrecks.helicopter = { id: layout.decor.helicopter.id, triangles: addHelicopter(ex.scenery, region, layout.decor.helicopter, tintOf), rects: layout.decor.helicopter.rects.map((r) => r.id) };
  // Lot 5a-F (retour du propriétaire) : cratère de terre et traînée de glissade (plats, non solides) dans le maillage du sol extérieur (texture de terre répétée,
  // teintée par couleurs de sommet : aucun appel de plus), et fumée légère sans flammes au-dessus de l'épave (un appel de dessin, seulement dans le champ).
  if (layout.decor?.helicopter) {
    const h = layout.decor.helicopter;
    const scars = [...craterTriangles(h, layout.floor ?? []), ...trailTriangles(h, layout.floor ?? [])];
    for (const t of scars) ex.soil.tinted(tintOf(t.tint), () => ex.soil.triangles([{ p: t.p, n: t.n, uv: t.p.map((q) => [q[0] / outdoorSoil, q[2] / outdoorSoil]) }]));
    wrecks.helicopter.scarTriangles = scars.length;
    if (h.smoke && render.detailDoors !== false) {
      const smoke = createFire({ id: 'fumee-helicoptere', x: h.x, z: h.y, y: 34, w: 90, d: 60 }, palette, { reduced: render.reducedMotion === true, glow: false, flames: false, smoke: { alpha: 0.16, color: palette.smokeLight, rise: 0.7 } });
      smoke.group.userData.floor = 'exterieur';
      groups.exterieur.add(smoke.group);
      smoke.kind = 'helico'; // lot 5b
      fires.push(smoke);
      wrecks.helicopter.smoke = smoke.group.name;
    }
  }
  const burning = layout.decor?.cars?.find((c) => c.burning === true);
  if (burning) wrecks.burningCar = { id: burning.id, fire: null, spots: [] };
  if (burning && render.detailDoors !== false) {
    const spots = carFireSpots(burning);
    const fire = createFire({ id: `feu-${burning.id}`, x: burning.x + burning.w / 2, z: burning.y + burning.h / 2, y: Math.max(...spots.map((q) => q.y)), w: burning.w, d: burning.h, spots }, palette, { reduced: render.reducedMotion === true, glow: false });
    fire.group.userData.floor = 'exterieur';
    groups.exterieur.add(fire.group);
    fire.kind = 'voiture'; // lot 5b
    fires.push(fire);
    wrecks.burningCar = { id: burning.id, fire: fire.group.name, spots: spots.map((q) => q.id) };
  }
  // Lot 3g (retour du propriétaire) : extérieur plus vivant (js/core/decor-vivant.js : non solide, provisoire) dans les maillages du décor extérieur (aucun appel de
  // plus), sauf les bidons en feu (feu de fire.js, plus petit). Absent avec ?detail=0.
  const lively = layout.decor && layout.segmented && render.detailDoors !== false ? generateLivelyDecor({ size, footprint: layout.floor, decor: layout.decor }) : null;
  if (lively) {
    addLively(ex, region, lively);
    for (const b of lively.barrels) {
      const fire = createFire({ id: b.id, x: b.x, z: b.y, y: b.hauteur, w: b.r * 2, d: b.r * 2 }, palette, { reduced: render.reducedMotion === true, scale: 0.55 });
      fire.group.userData.floor = 'exterieur';
      groups.exterieur.add(fire.group);
      fire.kind = 'decor'; // lot 5b
      fires.push(fire);
    }
  }

  const tag = (mesh, name) => {
    if (mesh) mesh.userData.floor = name;
    return mesh;
  };
  const sceneryMaterials = [['soil', 'sol-exterieur'], ['grass', 'herbe'], ['road', 'route'], ['sidewalk', 'trottoir']];
  // Lot 5a-F : le sol de terre lit les couleurs de sommet s'il porte le cratère (même texture, même maillage).
  for (const [name, id] of sceneryMaterials) tag(ex[name].mesh(groups.exterieur, ex[name].colored ? new THREE.MeshLambertMaterial({ map: textures.texture(id), vertexColors: true }) : mat(id), { receive: true }), 'exterieur');
  // Lot 5a : si des épaves teintées sont dans un maillage du décor, sa matière lit les couleurs de sommet (même texture, même mur percé : aucun appel de plus).
  const tinted = ex.props.colored || ex.scenery.colored ? seeThrough.apply(new THREE.MeshLambertMaterial({ map: textures.texture(ATLAS), vertexColors: true })) : null;
  const exScenery = tag(ex.scenery.mesh(groups.exterieur, ex.scenery.colored ? tinted : atlasMaterial, { receive: true }), 'exterieur');
  const exProps = tag(ex.props.mesh(groups.exterieur, ex.props.colored ? tinted : atlasMaterial, { cast: true, receive: true }), 'exterieur');
  const floorMat = mat('sol-salle');
  const wallMat = seeThrough.apply(mat('mur'));
  for (const f of floors) {
    const fb = onFloor[f];
    tag(fb.floor.mesh(shellOf(f), floorMat, { receive: true }), f);
    tag(fb.wall.mesh(shellOf(f), wallMat, { receive: true }), f);
    tag(fb.detail.mesh(groups[f], atlasMaterial, { cast: false, receive: true }), f);
    tag(fb.props.mesh(groups[f], atlasMaterial, { cast: true, receive: true }), f);
    if (f === 'rdc') {
      tag(fb.detailUp.mesh(groups.rdcExposed, atlasMaterial, { cast: false, receive: true }), f);
      tag(fb.propsUp.mesh(groups.rdcExposed, atlasMaterial, { cast: true, receive: true }), f);
    }
    const decorMesh = tag(decorB[f].mesh(groups[f], atlasMaterial, { cast: false, receive: true }), f);
    if (decorMesh) decorMesh.name = 'decor-leger';
  }

  // Jupe sombre (lot 3e, mise à jour : l'étage est au-dessus) : sous chaque rectangle du sol de l'étage, quatre faces opaques (--game-void) jusqu'au sol du rez-de-chaussée,
  // que l'on voit en dessous ; aucune paroi autour des trous d'escalier : on voit le rez-de-chaussée par le trou. 8 triangles par rectangle.
  let slab = null;
  if (floors.includes('etage')) {
    const l = layoutOf('etage');
    const pos = [];
    const idx = [];
    const top = -0.5;
    const lo = -lift;
    const wall = (ax, az, bx, bz) => {
      const base = pos.length / 3;
      pos.push(ax, top, az, bx, top, bz, bx, lo, bz, ax, lo, az);
      idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    };
    for (const r of l.floor) {
      const x1 = r.x + r.w;
      const y1 = r.y + r.h;
      const corners = [[r.x, r.y], [x1, r.y], [x1, y1], [r.x, y1]];
      for (let k = 0; k < 4; k += 1) wall(corners[k][0], corners[k][1], corners[(k + 1) % 4][0], corners[(k + 1) % 4][1]);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geometry.setIndex(idx);
    geometry.computeBoundingSphere();
    slab = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ color: palette.void, fog: false, side: THREE.DoubleSide }));
    slab.name = 'jupe-sombre';
    slab.userData.floor = 'etage';
    groups.etage.add(slab);
  }

  // Couvercles de sol (lot 3e, mise à jour) : quand l'escalier est fermé (porte pas encore ouverte), un couvercle de sol ferme son trou à l'étage.
  const covers = new Map();
  holes.forEach(({ id, rects }) => {
    const cover = new Builder();
    for (const r of rects) cover.slab(r.x0, r.y0, r.x1, r.y1, 0.05, textures.repeat('sol-salle'), layoutOf('etage').room.x, layoutOf('etage').room.y);
    const coverMesh = cover.mesh(groups.etage, floorMat, { receive: true });
    if (coverMesh) {
      coverMesh.name = `couvercle-${id}`;
      coverMesh.userData.floor = 'etage';
      covers.set(id, coverMesh);
    }
  });

  // Garde-corps (lot 3e, mise à jour du propriétaire) : une barrière basse (texture « garde-corps », générée) tout autour de chaque trou d'escalier de l'étage, sauf à
  // l'entrée de l'escalier (là où le palier du chemin franchit le bord du trou : largeur de la rampe + 8 de chaque côté).
  if (floors.includes('etage') && holes.length > 0) {
    const fence = new Builder();
    const repeat = textures.repeat('garde-corps');
    const T = 5; // épaisseur
    for (const { rise, rects, end: b } of holes) {
      const r = rects[0];
      const a = rise.points.at(-1);
      // Sortie de la droite A → B hors du rectangle : le bord franchi et le point.
      const d = { x: b.x - a.x, y: b.y - a.y };
      const exits = [];
      if (d.x > 0) exits.push({ t: (r.x1 - a.x) / d.x, side: 'x1' });
      if (d.x < 0) exits.push({ t: (r.x0 - a.x) / d.x, side: 'x0' });
      if (d.y > 0) exits.push({ t: (r.y1 - a.y) / d.y, side: 'y1' });
      if (d.y < 0) exits.push({ t: (r.y0 - a.y) / d.y, side: 'y0' });
      const exit = exits.filter((q) => q.t >= -1e-6).sort((m, n) => m.t - n.t)[0] ?? null;
      const gapAt = exit ? { side: exit.side, c: exit.side[0] === 'x' ? a.y + d.y * Math.max(0, exit.t) : a.x + d.x * Math.max(0, exit.t), half: rise.width / 2 + 8 } : null;
      // Retour du propriétaire (lot 5k) : pas de garde-corps contre un mur de l'étage (fenceParts).
      const box = (x0, x1, z0, z1) => {
        for (const q of fenceParts({ x0, x1, z0, z1 }, etageWalls)) fence.box({ ...q, y0: 0, y1: FENCE_HEIGHT }, { repeat }, 'plan');
      };
      const run = (side, from, to, put) => {
        const hole = gapAt?.side === side ? [gapAt.c - gapAt.half, gapAt.c + gapAt.half] : null;
        if (hole === null) put(from, to);
        else {
          put(from, Math.min(to, hole[0]));
          put(Math.max(from, hole[1]), to);
        }
      };
      run('y0', r.x0 - T, r.x1 + T, (u, v) => box(u, v, r.y0 - T, r.y0));
      run('y1', r.x0 - T, r.x1 + T, (u, v) => box(u, v, r.y1, r.y1 + T));
      run('x0', r.y0, r.y1, (u, v) => box(r.x0 - T, r.x0, u, v));
      run('x1', r.y0, r.y1, (u, v) => box(r.x1, r.x1 + T, u, v));
    }
    const fenceMat = mat('garde-corps');
    fenceMat.side = THREE.DoubleSide; // une seule face par barre (2 triangles) : visible des deux côtés
    const fenceMesh = fence.mesh(groups.etage, fenceMat, { cast: false, receive: true });
    if (fenceMesh) {
      fenceMesh.name = 'garde-corps';
      fenceMesh.userData.floor = 'etage';
    }
  }

  // Les zones de déclenchement des escaliers ne sont plus dessinées au sol (retour du propriétaire : on entre dans l'escalier en marchant vers lui).
  const marks = new Map();

  const mists = [];
  // Mur de brouillard (lot 3b, cartes à murs) : un plan horizontal translucide au-dessus du sol extérieur (plus haut que les zombies), dont l'opacité vient de la
  // distance au bâtiment (js/core/fog.js, texture générée) : clair près des murs, opaque loin ; les zombies surgissent de la brume.
  if (layout.segmented) {
    const f = render.fog;
    const area = { x: -f.wallPad, y: -f.wallPad, w: size.width + 2 * f.wallPad, h: size.height + 2 * f.wallPad };
    const grid = fogGrid(layout.floor, area, f.wallNear, f.wallFar, f.wallCell);
    const rgba = new Uint8Array(grid.cols * grid.rows * 4);
    for (let i = 0; i < grid.data.length; i += 1) rgba.set([255, 255, 255, grid.data[i]], i * 4);
    const tex = new THREE.DataTexture(rgba, grid.cols, grid.rows, THREE.RGBAFormat);
    tex.magFilter = THREE.LinearFilter;
    tex.minFilter = THREE.LinearFilter;
    tex.wrapS = THREE.ClampToEdgeWrapping;
    tex.wrapT = THREE.ClampToEdgeWrapping;
    tex.needsUpdate = true;
    // Lot 3g (retour du propriétaire) : brouillard retravaillé (js/game/mist.js) : le mur de brume garde sa place et son masque, avec des volutes qui dérivent ;
    // des nappes basses (render.fog.layers) roulent sur le sol extérieur, jamais dans le bâtiment. Temps de jeu ; immobiles en mouvement réduit.
    const main = { y: f.wallHeight, strength: 1, scale: 420, wind: [0.012, 0.004], floor: 0.62, contrast: 0.3 };
    const layers = [main, ...mistLayers(f.layers)];
    layers.forEach((layer, i) => {
      // Nappes basses : brume éclairée par la lune (mélange de --game-fog et de --game-sun), plus claire que le sol ; le mur de brume garde --game-fog.
      const color = i === 0 ? palette.fog : `#${new THREE.Color(palette.fog).lerp(new THREE.Color(palette.sun), num(f.layerLight, 0.35)).getHexString()}`;
      const mist = createMistLayer({ area, mask: tex, color, layer, name: i === 0 ? 'brume' : `brume-basse-${i}` });
      mist.renderOrder = 10 + i;
      mist.frustumCulled = false;
      mist.userData.floor = 'exterieur';
      groups.exterieur.add(mist);
      mists.push(mist);
    });
  }

  // Fenêtres (lots 3 et 3a) : un maillage par fenêtre (planches en relief, cadre, trou sombre, pastilles au sol) et un maillage de débris par fenêtre, tous dans
  // la matière « planche » (texture de 128 px, hors atlas), sans ombre ; un maillage n'est dessiné que s'il est dans le champ de la caméra. Lot 3e : ceux d'un étage vivent
  // dans le groupe de cet étage.
  let windowMeshes = null;
  let lastWindows = null; // lot 5k-C3 : dernier état des fenêtres reçu par le dessin des planches (lumière de lune)
  let debris = null;
  if (windowGeoms.length > 0 && windowsCfg) {
    const settings = plankSettings(windowsCfg, render);
    const sheet = plankSheet(textures.size('planche'), textures.params('planche'));
    const material = new THREE.MeshLambertMaterial({ map: textures.texture('planche') });
    const geoms = windowGeoms.map((g) => ({ ...g, inner: layoutOf(g.floor ?? 'rdc').faceInner(g) }));
    // Les fenêtres du rez-de-chaussée hors du sol de l'étage (ou sous un trou) vivent dans le groupe toujours dessiné, les autres dans celui du rez-de-chaussée.
    const parts = floors.flatMap((f) => {
      const mine = geoms.filter((g) => (g.floor ?? 'rdc') === f);
      if (f !== 'rdc' || etageFloorRects === null) return [{ scene: groups[f], geoms: mine }];
      const up = mine.filter((g) => exposedAt(g.center.x, g.center.y));
      return [{ scene: groups.rdc, geoms: mine.filter((g) => !up.includes(g)) }, { scene: groups.rdcExposed, geoms: up }];
    }).filter((q) => q.geoms.length > 0);
    // Lot 3g (retour du propriétaire) : murs jusqu'au plafond : pastilles incrustées dans le mur, juste au-dessus du cadre de la fenêtre (les deux étages).
    const pipOn = () => (tallWalls ? { ...settings, pipFace: true, pipCenter: settings.lintel + settings.frameWidth + 4 + settings.pip / 2 } : settings);
    const wm = parts.map(({ scene, geoms: gs }) => createWindowMeshes({ scene, material, geoms: gs, settings: pipOn(), sheet, seed }));
    const dm = parts.map(({ scene, geoms: gs }) => createDebrisMeshes({ scene, material, settings, sheet, ids: gs.map((g) => g.id) }));
    windowMeshes = {
      meshes: wm.flatMap((w) => w.meshes),
      // Lot 5k-C3 : le même état sert à la lumière de lune de chaque fenêtre (lights.js, lecture seule).
      sync: (state) => {
        lastWindows = state;
        wm.forEach((w) => w.sync(state));
        lampKit.lights?.syncPlanks(state);
      },
      nailed: () => wm.reduce((n, w) => n + w.nailed(), 0),
      stats: (camera) => wm.flatMap((w) => w.stats(camera)),
    };
    debris = {
      meshes: dm.flatMap((d) => d.meshes),
      count: () => dm.reduce((n, d) => n + d.count(), 0),
      sync: (items, reduced) => dm.forEach((d) => d.sync(items, reduced)),
      stats: (camera) => dm.flatMap((d) => d.stats(camera)),
    };
  }

  // Portes et blocs (lots 3c et 3e) : un maillage par bloc fermé, une boîte de la hauteur du mur (10 triangles) dans la région « tole » de l'atlas de props (matière
  // existante, plus claire que le mur : contraste de luminance d'au moins 1,5:1, mesuré par un test), sans ombre portée, dans le groupe de son étage. Une porte
  // ouverte au chargement (?wave=N) n'est même pas construite. L'enfoncement met l'échelle verticale (origine au sol) de 1 à 0,001 ; le maillage est ensuite retiré
  // et sa géométrie libérée. Clé d'un bloc : « étage:identifiant » (porte-3 a un bloc à chaque étage) ; les identifiants publics sont ceux des portes.
  const doorMeshes = new Map();
  const addDoor = (door) => {
    for (const bl of door.blocks) {
      const key = `${bl.floor}:${bl.id}`;
      if (doorMeshes.has(key)) continue;
      const builder = new Builder();
      // Le dessin est un peu plus petit que l'obstacle (débord de 4 des collisions) : 1 de moins de chaque côté, 0,5 de jeu aux bouts, 1 de moins en hauteur,
      // pour qu'aucune face ne coïncide avec celles des murs voisins (clipping).
      const r = bl.rect;
      let visual = { x: r.x + 1, y: r.y + 1, w: r.w - 2, h: r.h - 2 };
      if (bl.wall) visual = wallDoorRect(r, layout.wallThickness);
      // Lot 3g (retours du propriétaire) : une vraie porte de planches dans un mur ; un éboulis infranchissable sur un escalier fermé (js/core/portes-aspect.js).
      // Avec ?detail=0 : l'ancien dessin (une boîte de tôle ; bloc d'escalier : porte mince de DOOR_THICKNESS au centre de son emprise).
      const plain = render.detailDoors === false;
      if (plain && !bl.wall) {
        const thin = Math.min(DOOR_THICKNESS, Math.min(visual.w, visual.h));
        visual = visual.h <= visual.w ? { x: visual.x, y: visual.y + visual.h / 2 - thin / 2, w: visual.w, h: thin } : { x: visual.x + visual.w / 2 - thin / 2, y: visual.y, w: thin, h: visual.h };
      }
      const height = bl.wall && tallWalls ? DOOR_TALL : r.hauteur - 1;
      const boxes = plain ? [{ ...rectBox(visual, 0, height), region: 'tole', faces: 'tout' }] : (bl.wall ? doorBoxes(visual, height, bl.id) : rubbleBoxes(visual, Math.min(height, 66), bl.id));
      boxes.forEach((b, j) => {
        const rg = region(b.region);
        builder.box(b, { rect: rg, scale: rg.scale, seed: 900 + j }, b.faces);
      });
      const mesh = builder.mesh(bl.floor === 'rdc' && (exposedAt(r.x + r.w / 2, r.y + r.h / 2) || touchesHole(r)) ? groups.rdcExposed : groups[bl.floor], atlasMaterial, { cast: false, receive: true });
      if (mesh) {
        mesh.name = bl.id;
        mesh.userData.floor = bl.floor;
        mesh.userData.door = door.id;
        doorMeshes.set(key, mesh);
      }
    }
  };
  const dropDoor = (id) => {
    let any = false;
    for (const [key, mesh] of [...doorMeshes]) {
      if (mesh.userData.door !== id) continue;
      mesh.parent?.remove(mesh);
      mesh.geometry.dispose();
      doorMeshes.delete(key);
      any = true;
    }
    return any;
  };
  for (const door of doorList) if (closedDoors === null || closedDoors.includes(door.id)) addDoor(door);
  const meshesOf = (id) => [...doorMeshes.values()].filter((m) => m.userData.door === id);

  // Lot 5k : lampes à huile (décor) et lumières dynamiques, options « Lampes et lumières » et « Lumières simultanées » (à chaud). Modules importés
  // seulement hors de « off » (préchargés par graphics-boot.js au chargement, sinon au premier changement) : avec « off », rien n'est créé ni demandé.
  // Lot 5k-G : la lune ne projette pas d'ombre en éclairage dynamique (ses ombres contredisaient celles des lampes) ; rendue à la sortie.
  let sunShadow = sun.castShadow;
  // Les grands maillages fusionnés du décor (meubles, piliers, décor extérieur) ne projettent pas d'ombre pour les lampes : chacun coûterait six
  // passes de carte cubique (budget de triangles) ; les volumes d'ombre simplifiés de lights.js les remplacent. Rendus à la sortie de l'éclairage.
  const decorCasters = [];
  for (const g of Object.values(groups)) g.traverse((m) => { if (m.isMesh && m.castShadow) decorCasters.push(m); });
  const applySunShadow = () => {
    const want = sunShadow && !lampKit.lights;
    if (sun.castShadow !== want) sun.castShadow = want;
    for (const m of decorCasters) if (m.castShadow !== !lampKit.lights) m.castShadow = !lampKit.lights;
  };
  const lampKit = { mode: 'off', count: 4, shadows: 0, data: null, tried: false, lightsTried: false, decor: null, lights: null, compiles: 0, error: null, pending: 0 };
  let lampChain = Promise.resolve();
  let lastView = null;
  let floorNow = 'rdc';
  // Lot 5k-G : feux comme sources de lumière : intérieurs (lampes.world.json → feux, portée sûre de npm run carte, seulement s'ils sont dessinés) et
  // extérieurs avec flammes (voiture en flammes, bidons ; portée sous l'étage), jamais la fumée seule de l'hélicoptère.
  const fireSources = () => {
    const drawn = new Set(fires.map((f) => f.stats().id));
    const list = (lampKit.data?.fires ?? []).filter((f) => drawn.has(f.id));
    for (const f of fires) {
      if (f.group.userData.floor !== 'exterieur') continue;
      const st = f.stats();
      if (!st.flames) continue;
      const h = st.y + 14;
      list.push({ id: `feu:${st.id}`, floor: 'exterieur', kind: 'feu', light: { x: st.x, y: st.z, h }, portee: Math.floor(lift - h - 2) });
    }
    return list;
  };
  const applyLamps = (mode, count, shadows, renderer) => {
    lampKit.mode = mode;
    lampKit.count = count;
    lampKit.shadows = shadows;
    let created = false;
    if (mode !== 'off' && !lampKit.decor && lampKit.data) {
      lampKit.decor = lampKit.data.module.createLampMeshes({ groups, lamps: lampKit.data.lamps, palette, floors });
      created = true;
    }
    lampKit.decor?.setVisible(mode !== 'off');
    // Éclairage : lumières en nombre fixe (programmes recompilés une fois à chaque changement de mode ou de nombre, jamais en partie).
    if (mode === 'eclairage' && !lampKit.lights && lampKit.data?.lights) {
      lampKit.lights = lampKit.data.lights.createLights({ scene, ambient: ambientLight, sun, lamps: lampKit.data.lamps, fires: fireSources(), json: lampKit.data.lumieres, palette, count, shadows, lift, reduced: render.reducedMotion === true, occluders, groups, windows: floors.flatMap((f) => (layoutOf(f).windows ?? []).map((w) => ({ ...w, floor: f }))), moon: render.light.sunOffset, opening: { width: num(layout.windowSize, 72), sill: num(render.sillHeight, 16), lintel: num(render.lintelBottom, 44), thickness: num(layout.wallThickness, 40) }, planks: lastWindows });
      created = true;
    } else if (mode !== 'eclairage' && lampKit.lights) {
      lampKit.lights.dispose();
      lampKit.lights = null;
      created = true;
    } else if (lampKit.lights?.setCount(count, shadows)) created = true;
    applySunShadow();
    // Préchauffage (changement à chaud seulement : au chargement, game.js compile toute la scène avant la première image).
    if (created && renderer && lastView) {
      renderer.compile(scene, lastView);
      lampKit.compiles += 1;
    }
  };

  const lampStats = () => ({ mode: lampKit.mode, count: lampKit.count, shadows: lampKit.shadows, ready: lampKit.pending === 0, lamps: lampKit.data?.lamps.length ?? 0, meshes: lampKit.decor?.stats() ?? [], lights: lampKit.lights?.stats() ?? null, compiles: lampKit.compiles, error: lampKit.error });

  let elevationNow = 0;
  return {
    scene,
    groups,
    windowMeshes,
    debris,
    floors,
    doors: {
      ids: () => [...new Set([...doorMeshes.values()].map((m) => m.userData.door))],
      meshNames: () => [...doorMeshes.keys()],
      add: (id) => { const d = doorList.find((q) => q.id === id); if (d) addDoor(d); },
      remove: dropDoor,
      // progress de 0 (fermée) à 1 (disparue) : sortie ralentie, échelle verticale de 1 à 0,001 ; tous les blocs de la porte ensemble.
      sink(id, progress) {
        for (const mesh of meshesOf(id)) mesh.scale.y = Math.max(0.001, (1 - Math.min(1, Math.max(0, progress))) ** 2);
      },
      scaleY: (id) => meshesOf(id)[0]?.scale.y ?? null,
      // Remet exactement les portes données (Rejouer).
      reset(ids) {
        for (const id of [...new Set([...doorMeshes.values()].map((m) => m.userData.door))]) dropDoor(id);
        for (const id of ids) {
          const d = doorList.find((q) => q.id === id);
          if (d) addDoor(d);
        }
      },
      stats: () => ({ meshes: doorMeshes.size, triangles: [...doorMeshes.values()].reduce((n, m) => n + m.geometry.attributes.position.count / 3, 0) }),
    },
    // Étage affiché : les groupes de l'autre étage sont cachés (maillages, planches, débris, blocs, zones marquées) ; l'extérieur reste dessiné ; la dalle sombre
    // n'est dessinée qu'à l'étage. Aucune reconstruction, aucun dispose.
    // Lot 3g : position du joueur pour le mur percé (à chaque image, avec la caméra) ; état pour les tests.
    // À chaque image (temps de jeu dt) : feux, et mur percé (position du joueur, caméra).
    frame(dt, x, y, camera, view = null) {
      // Lot 5b : un feu caché par le préréglage n'est pas mis à jour ; 5b-C : hors du champ, ses tampons de particules ne sont pas réécrits.
      if (view) {
        lastView = view;
        view.updateMatrixWorld();
        viewFrustum.setFromProjectionMatrix(viewMatrix.multiplyMatrices(view.projectionMatrix, view.matrixWorldInverse));
      }
      for (const fire of fires) if (fire.group.visible) fire.update(dt, view ? fire.inView(viewFrustum) : true);
      const still = render.reducedMotion === true;
      for (const m of mists) if (!still && m.visible) m.material.uniforms.uTime.value += Math.min(0.1, Math.max(0, Number(dt) || 0));
      seeThrough.update(x, y, camera, occluders, (b) => (b.floor === 'etage' ? lift : 0) - elevationNow);
      lampKit.decor?.cull(view ? viewFrustum : null, groups.etage.visible); // lot 5k : seules les lampes dans le champ sont dessinées
      lampKit.lights?.frame(dt, x, y, floorNow, elevationNow, view ? viewFrustum : null, groups.etage.visible); // lot 5k : lumières des lampes (Éclairage)
    },
    fireStats: () => fires.map((f) => f.stats()),
    // Lot 5b (préréglages graphiques, à chaud) : feux et fumées, brume, ombres. Valeurs de l'Élevé : rien ne change.
    setFires(opts = {}) {
      for (const f of fires) {
        if (f.kind === 'voiture') f.setOptions({ spots: opts.voitureFoyers });
        else if (f.kind === 'helico') f.setOptions({ particles: opts.fumeeHelico > 0 ? opts.fumeeHelico : 1, visible: opts.fumeeHelico !== 0 });
        else f.setOptions({ particles: opts.particules, glow: opts.lueur });
      }
    },
    // simple : seulement scene.fog (aucun plan de brume) ; reduit : le mur de brume sans les nappes basses ; complet : tout.
    setMist(mode = 'complet') {
      mists.forEach((m, i) => {
        const on = mode === 'complet' || (mode === 'reduit' && i === 0);
        if (m.visible !== on) m.visible = on;
      });
    },
    setShadowMap(enabled, size) {
      sunShadow = enabled !== false;
      applySunShadow();
      const n = Number.isInteger(size) && size >= 64 ? size : sun.shadow.mapSize.x;
      if (sun.shadow.mapSize.x !== n) {
        sun.shadow.mapSize.set(n, n);
        sun.shadow.map?.dispose();
        sun.shadow.map = null;
      }
    },
    moonState: () => lampKit.lights?.moonState() ?? [], // lot 5k-C3 (tests) : getState().graphics.lune
    moonPatches: () => lampKit.lights?.moonPatches() ?? [],
    graphicsStats: () => ({ mists: mists.map((m) => m.visible), shadowMap: sun.shadow.mapSize.x, castShadow: sun.castShadow, fires: fires.map((f) => ({ kind: f.kind ?? 'decor', ...f.stats().drawn })), lamps: lampStats() }),
    // Lot 5k : état des lampes (mode appliqué, prêt, maillages, préchauffages, erreur).
    lampStats,
    // Lot 5k : mode off | decor | eclairage, nombre de lumières ; preload : sortie de preloadLamps (graphics-boot.js). Synchrone si rien n'est à
    // charger, sinon dans l'ordre des appels. Renvoie une promesse résolue une fois appliqué.
    setLamps(mode, count, { renderer = null, preload = null, shadows = null } = {}) {
      const m = ['off', 'decor', 'eclairage'].includes(mode) ? mode : 'off';
      const n = [2, 4, 6].includes(count) ? count : lampKit.count;
      const sh = [0, 1, 2].includes(shadows) ? shadows : lampKit.shadows;
      if (preload && !lampKit.data) {
        lampKit.data = preload;
        lampKit.tried = true;
      }
      const load = (m !== 'off' && !lampKit.tried) || (m === 'eclairage' && lampKit.data !== null && !lampKit.data.lights && !lampKit.lightsTried);
      if (!load && lampKit.pending === 0) {
        applyLamps(m, n, sh, renderer);
        return Promise.resolve();
      }
      lampKit.pending += 1;
      lampChain = lampChain.then(async () => {
        if (m !== 'off' && !lampKit.tried) {
          lampKit.tried = true;
          lampKit.data = await import('./lamps.js').then((mod) => mod.preloadLamps(m, layout.id));
        }
        if (m === 'eclairage' && lampKit.data && !lampKit.data.lights && !lampKit.lightsTried) {
          lampKit.lightsTried = true;
          Object.assign(lampKit.data, await import('./lamps.js').then((mod) => mod.preloadLights()));
        }
        applyLamps(m, n, sh, renderer);
      }).catch((e) => {
        lampKit.error = String(e?.message ?? e);
      }).finally(() => {
        lampKit.pending -= 1;
      });
      return lampChain;
    },
    // Lot 5a : épaves dessinées (hélicoptère : triangles, rectangles de collision ; voiture en flammes : feu et foyers) ; feu actif = dans la liste des feux mis à jour.
    wreckStats: () => ({ ...wrecks, fires: fires.filter((f) => f.group.name === wrecks.burningCar?.fire).map((f) => f.stats()), heliSmoke: fires.filter((f) => f.group.name === wrecks.helicopter?.smoke).map((f) => f.stats()), propsTriangles: exProps ? exProps.geometry.attributes.position.count / 3 : 0, sceneryTriangles: exScenery ? exScenery.geometry.attributes.position.count / 3 : 0, exteriorVisible: groups.exterieur.visible }),
    seeThroughState: () => seeThrough.state(),
    showFloor(floor) {
      this.setElevation(floor === 'etage' ? lift : 0, floor);
    },
    // Hauteur du joueur (0 au rez-de-chaussée, floorLift à l'étage, entre les deux dans l'escalier) et étage logique : le monde descend de elevation (le joueur et la caméra
    // restent à y = 0). L'étage n'est dessiné que s'il y a de la hauteur ; le rez-de-chaussée complet que si le joueur y est, sa coque (sol, murs, rampes) toujours.
    setElevation(elevation, floor) {
      const e = Math.min(lift, Math.max(0, num(elevation)));
      groups.exterieur.position.y = 0 - e;
      groups.rdc.position.y = 0 - e;
      groups.rdcShell.position.y = 0 - e;
      groups.rdcExposed.position.y = 0 - e;
      groups.etage.position.y = lift - e;
      groups.etage.visible = floors.includes('etage') && e > 0.01;
      groups.rdc.visible = true; // rien du rez-de-chaussée ne disparaît à l'étage (le sol de l'étage, opaque, cache seulement ce qui est dessous)
      dynamic.position.y = (floor === 'etage' ? lift : 0) - e;
      elevationNow = e;
      floorNow = floor === 'etage' ? 'etage' : 'rdc';
    },
    dynamic,
    effectsRoot,
    get elevation() { return elevationNow; },
    // Zone de déclenchement d'un escalier : dessinée (à l'étage où elle se trouve) seulement quand l'escalier est utilisable.
    setStairUsable(id, usable) {
      for (const f of floors) {
        const m = marks.get(`${id}:${f}`);
        if (m) m.visible = usable === true;
      }
      const cover = covers.get(id);
      if (cover) cover.visible = usable !== true;
    },
    // Mesures pour les tests : maillages visibles par étage (la visibilité tient compte du groupe) et nombre de marques dessinées.
    floorStats() {
      const visibleOf = (g) => {
        let n = 0;
        g.traverse((m) => {
          if (m.isMesh && m.visible) n += 1;
        });
        return g.visible ? n : 0;
      };
      // Lot 3g : décor léger (maillages « decor-leger ») : nombre, étage (userData.floor), dessinés ou non, triangles, éléments par étage.
      const decorMeshes = [];
      scene.traverse((m) => {
        if (m.isMesh && m.name === 'decor-leger') decorMeshes.push({ floor: m.userData.floor, group: m.parent?.name, drawn: m.visible && m.parent?.visible === true, triangles: m.geometry.attributes.position.count / 3 });
      });
      return { wrecks: this.wreckStats(), exteriorY: groups.exterieur.position.y, elevation: elevationNow, visible: Object.fromEntries(Object.entries(groups).map(([k, g]) => [k, visibleOf(g)])), slab: slab ? slab.visible && groups.etage.visible : false, fence: groups.etage.children.filter((m) => m.name === 'garde-corps').length, marks: [...marks].filter(([, m]) => m.visible && m.parent?.visible).map(([k]) => k), decor: { meshes: decorMeshes, items: decorCount } };
    },
    setFog(distance) {
      scene.fog.near = distance * render.fog.near;
      scene.fog.far = distance * render.fog.far;
    },
    setShadows(on) {
      sunShadow = Boolean(on);
      applySunShadow();
    },
    // La lumière suit la cible de la caméra et sa carte d'ombres (1024) couvre la zone visible : plus la vue est proche, plus l'ombre est fine.
    followSun(x, z, halfSize) {
      sun.position.set(x + o.x, o.y, z + o.z);
      sun.target.position.set(x, 0, z);
      const h = Math.min(Math.max(halfSize, 250), render.light.shadowHalfSize);
      if (sun.shadow.camera.right !== h) {
        Object.assign(sun.shadow.camera, { left: -h, right: h, top: h, bottom: -h });
        sun.shadow.camera.updateProjectionMatrix();
      }
    },
  };
}

// Caméra au sud de la cible, orientée au nord, qui suit le joueur (js/core/camera.js : lissage, zone morte, bornes du monde). À zoom 1
// la distance fait tenir toute la zone de jeu (face intérieure des murs, plus une petite marge) ; la distance est divisée par le zoom.
export function createCamera(cfg, follow, layout, tilt, zoom) {
  const camera = new THREE.PerspectiveCamera(cfg.fov, 1, cfg.near, cfg.far);
  camera.up.set(0, 0, -1);
  const { room } = layout;
  const play = layout.viewPlay;
  const center = { x: room.x + room.width / 2, y: room.y + room.height / 2 };
  const view = { tilt, zoom, distance: 0, aspect: 1, ground: { width: 1, north: 0, south: 0 }, target: { ...center }, overview: false };
  // Vue d'ensemble (?zoom=1) d'une carte à murs : la caméra reste au centre du bâtiment, pour qu'il tienne en entier (lot 3b).
  const lock = layout.segmented && zoom <= 1;
  let want = { ...center };
  const opts = () => ({ smoothing: follow.smoothing, deadZone: follow.deadZone, bounds: layout.cameraBounds, view: view.ground });

  const place = () => {
    const p = cameraPosition(view.target, view.distance, tilt);
    camera.position.set(p.x, p.y, p.z);
    camera.lookAt(view.target.x, 0, view.target.y);
    camera.updateMatrixWorld(true);
  };
  const layoutView = () => {
    if (view.overview) {
      const o = overview(layout.cameraBounds, view.aspect, tilt, cfg.fov, cfg.margin);
      view.distance = o.distance;
      view.ground = groundView(view.aspect, view.distance, tilt, cfg.fov);
      view.target = o.target;
    } else {
      view.distance = fitDistance(view.aspect, play, tilt, cfg.fov, lock ? Math.max(cfg.margin, 0.08) : cfg.margin) / zoom;
      view.ground = groundView(view.aspect, view.distance, tilt, cfg.fov);
      view.target = boundTarget(want, layout.cameraBounds, view.ground);
    }
    place();
  };

  return {
    camera,
    view,
    // À appeler à chaque redimensionnement.
    resize(width, height) {
      view.aspect = Math.max(1, width) / Math.max(1, height);
      camera.aspect = view.aspect;
      camera.fov = cfg.fov;
      camera.updateProjectionMatrix();
      layoutView();
    },
    // Place la caméra d'un coup sur (x, y), sans lissage (début de partie).
    snap(x, y) {
      want = lock ? { ...center } : { x, y };
      if (!view.overview) view.target = snapCamera(want, opts());
      place();
    },
    // Suit (x, y) avec le lissage de camera.json, indépendant du nombre d'images par seconde.
    follow(dt, x, y) {
      want = lock ? { ...center } : { x, y };
      if (!view.overview) view.target = stepCamera(view.target, want, dt, opts());
      place();
    },
    // Test : vue d'ensemble de tout le monde (vrai), ou retour au suivi du joueur (faux).
    setOverview(on) {
      view.overview = Boolean(on);
      layoutView();
    },
  };
}
