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
import { furnitureParts } from '../core/furniture-model.js';
import { plankSettings } from '../core/plank-layout.js';
import { plankSheet } from '../core/texgen.js';
import { createDebrisMeshes, createWindowMeshes } from './windows-mesh.js';

const FAR_GROUND = 40_000; // sol extérieur étendu bien au-delà du monde
const ROAD_Y = 0.4; // route, trottoir et sentiers : plaques plates au-dessus de l'herbe
const ATLAS = 'atlas-props';

// Région d'atlas par type de meuble (data/game/world.json : table, comptoir, caisse, armoire, colonne, etagere).
const FURNITURE_REGION = { table: 'bois', comptoir: 'tole', caisse: 'caisse', armoire: 'bois-sombre', colonne: 'colonne', etagere: 'etagere', pilier: 'colonne', escalier: 'tole' }; // lot 3b : pilier et escalier plein (texture du comptoir)
const CAR_PAINTS = ['peinture-1', 'peinture-2', 'peinture-3'];

const unitCylinder = new THREE.CylinderGeometry(1, 1, 1, 8);
const crown = new THREE.IcosahedronGeometry(1, 0);
const wheelAlongZ = new THREE.CylinderGeometry(1, 1, 1, 8).rotateX(Math.PI / 2);

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
    }
  }

  // Dessus d'une plaque : texture répétée (uv monde / repeat, origine (ox, oz)).
  slab(x0, z0, x1, z1, y, repeat, ox = 0, oz = 0) {
    const uv = (x, z) => [(x - ox) / repeat, (z - oz) / repeat];
    this.quad([[x0, y, z0], [x1, y, z0], [x1, y, z1], [x0, y, z1]], [0, 1, 0], [uv(x0, z0), uv(x1, z0), uv(x1, z1), uv(x0, z1)]);
  }

  // Boîte (sans dessous). faces : 'tout', 'cotes' (sans le dessus) ou 'dessus' (rien d'autre). Texture répétée { repeat } ou fenêtre d'atlas { rect, scale, seed }.
  box({ x0, y0, z0, x1, y1, z1 }, mapping, faces = 'tout') {
    const dims = { x: x1 - x0, y: y1 - y0, z: z1 - z0 };
    const list = [];
    if (faces !== 'cotes') list.push({ n: [0, 1, 0], c: [[x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1]], s: [0, 1, 1, 0], t: [0, 0, 1, 1], fw: dims.x, fh: dims.z, a: (p) => p[0], b: (p) => p[2] });
    if (faces !== 'dessus') {
      const along = (axis) => (p) => p[axis];
      list.push(
        { n: [0, 0, 1], c: [[x0, y1, z1], [x1, y1, z1], [x1, y0, z1], [x0, y0, z1]], s: [0, 1, 1, 0], t: [0, 0, 1, 1], fw: dims.x, fh: dims.y, a: along(0), b: (p) => -p[1] },
        { n: [0, 0, -1], c: [[x0, y1, z0], [x1, y1, z0], [x1, y0, z0], [x0, y0, z0]], s: [0, 1, 1, 0], t: [0, 0, 1, 1], fw: dims.x, fh: dims.y, a: along(0), b: (p) => -p[1] },
        { n: [1, 0, 0], c: [[x1, y1, z0], [x1, y1, z1], [x1, y0, z1], [x1, y0, z0]], s: [0, 1, 1, 0], t: [0, 0, 1, 1], fw: dims.z, fh: dims.y, a: along(2), b: (p) => -p[1] },
        { n: [-1, 0, 0], c: [[x0, y1, z0], [x0, y1, z1], [x0, y0, z1], [x0, y0, z0]], s: [0, 1, 1, 0], t: [0, 0, 1, 1], fw: dims.z, fh: dims.y, a: along(2), b: (p) => -p[1] },
      );
    }
    list.forEach((f, k) => {
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
      g.applyMatrix4(this.matrix.compose(this.position.set(it.x, it.y, it.z), this.quaternion.setFromEuler(this.euler.set(0, it.rot ?? 0, 0)), this.scale.set(it.sx, it.sy, it.sz)));
      this.positions.push(...g.attributes.position.array);
      this.normals.push(...g.attributes.normal.array);
      const uv = g.attributes.uv.array;
      const { rect } = it;
      for (let i = 0; i < uv.length; i += 2) this.uvs.push(rect.u0 + uv[i] * (rect.u1 - rect.u0), rect.v0 + uv[i + 1] * (rect.v1 - rect.v0));
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

// Décor extérieur (graine fixe, voir js/core/decor.js) : `b` = constructeurs par matière, `region(id, scale?)` = fenêtre d'atlas.
// Voitures : les seuls éléments du décor qui projettent une ombre (comme les meubles), donc dans b.props.
function addDecor(b, region, decor, outdoorSoil) {
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

// layout : couche du rez-de-chaussée (js/core/layout.js) ; layouts : sortie de buildLayouts (lot 3e : une couche par étage, facultatif) ; textures : sortie de
// createThreeTextures (js/game/textures.js). Renvoie { scene, groups, showFloor, ... }.
// Escalier physique (lot 3e, mise à jour) : rectangle de la rampe (partie du chemin où la hauteur monte), axe du chemin et sens de la montée. Le chemin est rectiligne sur la
// montée (les sommets de t = 0 puis de t = 1 qui l'encadrent) ; la largeur vient de zones.json (walk.width).
export function riseOf(walk) {
  const path = Array.isArray(walk?.path) ? walk.path : [];
  if (path.length < 2) return null;
  const hi = path.findIndex((q) => q.t >= 1);
  if (hi < 1) return null;
  const lo = path.findLastIndex((q, i) => i < hi && q.t <= 0);
  if (lo < 0) return null;
  const a = path[lo];
  const b = path[hi];
  const vertical = Math.abs(b.y - a.y) >= Math.abs(b.x - a.x);
  const w = num(walk.width, 100) / 2;
  const rect = vertical ? { x0: a.x - w, x1: a.x + w, y0: Math.min(a.y, b.y), y1: Math.max(a.y, b.y) } : { x0: Math.min(a.x, b.x), x1: Math.max(a.x, b.x), y0: a.y - w, y1: a.y + w };
  return { a, b, vertical, rect };
}

// Rectangles { x, y, w, h } privés d'un trou { x0, y0, x1, y1 } : au plus quatre morceaux par rectangle.
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
  // Groupes : exterieur (sol, décor, brume), rdc (meubles, détails, fenêtres, portes, marques : seulement quand le joueur est au rez-de-chaussée), rdcShell (sol, murs et
  // rampes du rez-de-chaussée : toujours dessinés, on les voit sous l'étage), etage (tout l'étage : seulement quand le joueur est monté). Ils sont décalés en hauteur
  // par setElevation : le joueur reste à y = 0, c'est le monde qui descend quand il monte (et dynamic porte les zombies et les effets de l'étage du joueur).
  const groups = { exterieur: new THREE.Group(), rdc: new THREE.Group(), rdcShell: new THREE.Group(), etage: new THREE.Group() };
  for (const [name, g] of Object.entries(groups)) {
    g.name = name;
    g.userData.floor = name === 'rdcShell' ? 'rdc' : name;
    scene.add(g);
  }
  groups.etage.visible = false;
  const dynamic = new THREE.Group();
  dynamic.name = 'dynamique';
  scene.add(dynamic);
  const lift = num(render.floorLift, 0);
  const shellOf = (f) => (f === 'rdc' ? groups.rdcShell : groups[f]);
  // Trous du sol de l'étage : la rampe de chaque escalier (on voit l'escalier et le rez-de-chaussée en dessous).
  const STEPS = 8;
  const holes = stairs.map((st) => ({ id: st.id, rise: riseOf(st.walk) })).filter((h) => h.rise !== null);

  scene.add(new THREE.AmbientLight(palette.ambient, render.light.ambient));
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
  const atlasMaterial = mat(ATLAS);
  const region = (id) => textures.region(ATLAS, id);
  const ex = {
    road: new Builder(), sidewalk: new Builder(), grass: new Builder(), soil: new Builder(), scenery: new Builder(), props: new Builder(),
    repeat: { road: textures.repeat('route'), sidewalk: textures.repeat('trottoir') },
  };
  const outdoorSoil = textures.repeat('sol-exterieur');
  const onFloor = Object.fromEntries(floors.map((f) => [f, { floor: new Builder(), wall: new Builder(), detail: new Builder(), props: new Builder() }]));

  // Sol extérieur de terre étendu bien au-delà du monde ; dans le monde, l'herbe (salle du lot 1m : marge plate de terre, comme avant).
  ex.soil.slab(size.width / 2 - FAR_GROUND / 2, size.height / 2 - FAR_GROUND / 2, size.width / 2 + FAR_GROUND / 2, size.height / 2 + FAR_GROUND / 2, -1.5, outdoorSoil);
  if (layout.empty) {
    const m = layout.margin;
    ex.soil.slab(room.x - m, room.y - m, room.x + room.width + m, room.y + room.height + m, -1, outdoorSoil);
  } else {
    ex.grass.slab(0, 0, size.width, size.height, -1, textures.repeat('herbe'));
  }

  const wallRepeat = textures.repeat('mur');
  for (const f of floors) {
    const l = layoutOf(f);
    const fb = onFloor[f];
    // Sol de la salle : carrelage (la dalle commence au coin de la salle, les carreaux sont alignés dessus). Chaque étage est dessiné à y = 0 quand il est affiché.
    const floorRects = f === 'etage' ? holes.reduce((rects, h) => subtractHole(rects, h.rise.rect), l.floor) : l.floor;
    for (const fl of floorRects) fb.floor.slab(fl.x, fl.y, fl.x + fl.w, fl.y + fl.h, 0, textures.repeat('sol-salle'), l.room.x, l.room.y);
    // Murs (allège, linteau et barreaux des fenêtres compris) : enduit sur les côtés, dessus de la couleur --game-wall sans texture.
    const { walls, bars } = l.segmented ? segmentedWallBoxes(l, render) : wallBoxes(l.room, l.windows, l.windowSize, render);
    for (const w of walls) {
      fb.wall.box(extents(w), { repeat: wallRepeat }, 'cotes');
      fb.wall.box(extents(w), { fixed: [0.31, 0.62] }, 'dessus'); // dessus : un seul texel du mur, donc sans texture
    }
    // Escaliers physiques (lot 3e, mise à jour) : marches de béton (huit boîtes qui montent jusqu'à floorLift) dans le maillage des murs du rez-de-chaussée : aucun appel de
    // dessin de plus, visibles de l'étage à travers le trou de chaque escalier.
    if (f === 'rdc') {
      holes.forEach(({ rise }) => {
        const { a, b, vertical, rect } = rise;
        for (let i = 0; i < STEPS; i += 1) {
          const along = (k) => (vertical ? a.y + (b.y - a.y) * k : a.x + (b.x - a.x) * k);
          const lo = Math.min(along(i / STEPS), along((i + 1) / STEPS));
          const hi = Math.max(along(i / STEPS), along((i + 1) / STEPS));
          const h = (lift * (i + 1)) / STEPS;
          fb.wall.box(vertical ? { x0: rect.x0, x1: rect.x1, z0: lo, z1: hi, y0: 0, y1: h } : { x0: lo, x1: hi, z0: rect.y0, z1: rect.y1, y0: 0, y1: h }, { repeat: wallRepeat });
        }
      });
    }
    bars.forEach((bar, i) => fb.detail.box(extents(bar), { rect: region('tole'), scale: region('tole').scale, seed: 500 + i }));
    // Meubles : boîtes aux hauteurs de world.json, une région d'atlas par type. Lot 3c : tables, chaises et armoires modélisées (js/core/furniture-model.js) ; les corps
    // projettent une ombre, les pieds, dossiers et socles forment un maillage sans ombre portée. Les collisions gardent le rectangle d'origine.
    l.furniture.forEach((fu, i) => {
      if (fu.kind === 'escalier') return; // dessiné par la rampe (escalier physique)
      const parts = furnitureParts(fu, FURNITURE_REGION, l.walls);
      const draw = (builder, p, k) => {
        const r = region(p.region);
        builder.box({ x0: p.x0, x1: p.x1, y0: p.y0, y1: p.y1, z0: p.z0, z1: p.z1 }, { rect: r, scale: r.scale, seed: i * 8 + k + 1 }, p.faces);
      };
      parts.body.forEach((p, k) => draw(fb.props, p, k));
      parts.detail.forEach((p, k) => draw(fb.detail, p, k + 4));
    });
  }

  if (layout.decor) addDecor(ex, region, layout.decor, outdoorSoil);

  const tag = (mesh, name) => {
    if (mesh) mesh.userData.floor = name;
    return mesh;
  };
  const sceneryMaterials = [['soil', 'sol-exterieur'], ['grass', 'herbe'], ['road', 'route'], ['sidewalk', 'trottoir']];
  for (const [name, id] of sceneryMaterials) tag(ex[name].mesh(groups.exterieur, mat(id), { receive: true }), 'exterieur');
  tag(ex.scenery.mesh(groups.exterieur, atlasMaterial, { receive: true }), 'exterieur');
  tag(ex.props.mesh(groups.exterieur, atlasMaterial, { cast: true, receive: true }), 'exterieur');
  const floorMat = mat('sol-salle');
  const wallMat = mat('mur');
  for (const f of floors) {
    const fb = onFloor[f];
    tag(fb.floor.mesh(shellOf(f), floorMat, { receive: true }), f);
    tag(fb.wall.mesh(shellOf(f), wallMat, { receive: true }), f);
    tag(fb.detail.mesh(groups[f], atlasMaterial, { cast: false, receive: true }), f);
    tag(fb.props.mesh(groups[f], atlasMaterial, { cast: true, receive: true }), f);
  }

  // Jupe sombre (lot 3e, mise à jour : l'étage est au-dessus) : sous chaque morceau du sol de l'étage, quatre faces opaques (--game-void) jusqu'au sol du rez-de-chaussée, que
  // l'on voit en dessous ; elles forment aussi les parois du trou de chaque escalier. 8 triangles par morceau.
  let slab = null;
  if (floors.includes('etage')) {
    const l = layoutOf('etage');
    const rects = holes.reduce((r, h) => subtractHole(r, h.rise.rect), l.floor);
    const pos = [];
    const idx = [];
    const top = -0.5;
    const lo = -lift;
    for (const r of rects) {
      const x1 = r.x + r.w;
      const y1 = r.y + r.h;
      const corners = [[r.x, r.y], [x1, r.y], [x1, y1], [r.x, y1]];
      for (let k = 0; k < 4; k += 1) {
        const [ax, az] = corners[k];
        const [bx, bz] = corners[(k + 1) % 4];
        const base = pos.length / 3;
        pos.push(ax, top, az, bx, top, bz, bx, lo, bz, ax, lo, az);
        idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
      }
    }
    if (pos.length > 0) {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      geometry.setIndex(idx);
      geometry.computeBoundingSphere();
      slab = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ color: palette.void, fog: false, side: THREE.DoubleSide }));
      slab.name = 'jupe-sombre';
      slab.userData.floor = 'etage';
      groups.etage.add(slab);
    }
  }

  // Couvercles de sol (lot 3e, mise à jour) : quand l'escalier est fermé (porte pas encore ouverte), un couvercle de sol ferme son trou à l'étage.
  const covers = new Map();
  holes.forEach(({ id, rise }) => {
    const { rect } = rise;
    const cover = new Builder();
    cover.slab(rect.x0, rect.y0, rect.x1, rect.y1, 0.05, textures.repeat('sol-salle'), layoutOf('etage').room.x, layoutOf('etage').room.y);
    const coverMesh = cover.mesh(groups.etage, floorMat, { receive: true });
    if (coverMesh) {
      coverMesh.name = `couvercle-${id}`;
      coverMesh.userData.floor = 'etage';
      covers.set(id, coverMesh);
    }
  });

  // Zones de déclenchement des escaliers (lot 3e) : un quadrilatère plat de 2 triangles par zone, à y = 0,3, couleur --game-stairs-mark, visible seulement à l'étage où
  // il se trouve et seulement si l'escalier est utilisable (setStairUsable) ; aucune nouvelle texture.
  const marks = new Map();
  const markMaterial = new THREE.MeshBasicMaterial({ color: palette.stairsMark, fog: false });
  for (const st of stairs) {
    for (const f of floors) {
      const t = st.floors?.[f]?.trigger;
      if (!t) continue;
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute([t.x, 0.3, t.y, t.x + t.w, 0.3, t.y, t.x + t.w, 0.3, t.y + t.h, t.x, 0.3, t.y + t.h], 3));
      geometry.setIndex([0, 2, 1, 0, 3, 2]);
      geometry.computeBoundingSphere();
      const mesh = new THREE.Mesh(geometry, markMaterial);
      mesh.name = `zone-${st.id}-${f}`;
      mesh.userData.floor = f;
      mesh.visible = false;
      groups[f].add(mesh);
      marks.set(`${st.id}:${f}`, mesh);
    }
  }

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
    const y = f.wallHeight;
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute([area.x, y, area.y, area.x + area.w, y, area.y, area.x + area.w, y, area.y + area.h, area.x, y, area.y + area.h], 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2));
    geometry.setIndex([0, 2, 1, 0, 3, 2]);
    geometry.computeBoundingSphere();
    const mist = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ map: tex, color: palette.fog, transparent: true, depthWrite: false, fog: false, side: THREE.DoubleSide }));
    mist.renderOrder = 10;
    mist.frustumCulled = false;
    mist.userData.floor = 'exterieur';
    groups.exterieur.add(mist);
  }

  // Fenêtres (lots 3 et 3a) : un maillage par fenêtre (planches en relief, cadre, trou sombre, pastilles au sol) et un maillage de débris par fenêtre, tous dans
  // la matière « planche » (texture de 128 px, hors atlas), sans ombre ; un maillage n'est dessiné que s'il est dans le champ de la caméra. Lot 3e : ceux d'un étage vivent
  // dans le groupe de cet étage.
  let windowMeshes = null;
  let debris = null;
  if (windowGeoms.length > 0 && windowsCfg) {
    const settings = plankSettings(windowsCfg, render);
    const sheet = plankSheet(textures.size('planche'), textures.params('planche'));
    const material = new THREE.MeshLambertMaterial({ map: textures.texture('planche') });
    const geoms = windowGeoms.map((g) => ({ ...g, inner: layoutOf(g.floor ?? 'rdc').faceInner(g) }));
    const parts = floors.map((f) => ({ f, geoms: geoms.filter((g) => (g.floor ?? 'rdc') === f) })).filter((q) => q.geoms.length > 0);
    const wm = parts.map(({ f, geoms: gs }) => createWindowMeshes({ scene: groups[f], material, geoms: gs, settings, sheet, seed }));
    const dm = parts.map(({ f, geoms: gs }) => createDebrisMeshes({ scene: groups[f], material, settings, sheet, ids: gs.map((g) => g.id) }));
    windowMeshes = {
      meshes: wm.flatMap((w) => w.meshes),
      sync: (state) => wm.forEach((w) => w.sync(state)),
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
  const doorRegion = region('tole');
  const doorList = Array.isArray(layouts?.doors) ? layouts.doors.map((d) => ({ id: d.id, blocks: floors.flatMap((f) => (d.blocks?.[f] ?? []).map((b) => ({ floor: f, ...b }))) })) : (Array.isArray(layout.doors) ? layout.doors : []).map((d) => ({ id: d.id, blocks: (d.blocks ?? [{ id: d.id, wall: true, rect: d.rect }]).map((b) => ({ floor: 'rdc', ...b })) }));
  const addDoor = (door) => {
    for (const bl of door.blocks) {
      const key = `${bl.floor}:${bl.id}`;
      if (doorMeshes.has(key)) continue;
      const builder = new Builder();
      // Le dessin est un peu plus petit que l'obstacle (débord de 4 des collisions) : 1 de moins de chaque côté, 0,5 de jeu aux bouts, 1 de moins en hauteur,
      // pour qu'aucune face ne coïncide avec celles des murs voisins (clipping).
      const r = bl.rect;
      let visual = { x: r.x + 1, y: r.y + 1, w: r.w - 2, h: r.h - 2 };
      if (bl.wall) {
        // Porte dans un mur : un peu plus mince que le mur (1 de moins de chaque côté), 0,5 de jeu aux bouts (le débord de 4 des collisions n'est pas dessiné).
        const t = layout.wallThickness - 2;
        const along = Math.max(r.w, r.h) - 2 * 4;
        visual = r.h > r.w ? { x: r.x + r.w / 2 - t / 2, y: r.y + 4 + 0.5, w: t, h: along - 1 } : { x: r.x + 4 + 0.5, y: r.y + r.h / 2 - t / 2, w: along - 1, h: t };
      }
      builder.box(rectBox(visual, 0, r.hauteur - 1), { rect: doorRegion, scale: doorRegion.scale, seed: 900 });
      const mesh = builder.mesh(groups[bl.floor], atlasMaterial, { cast: false, receive: true });
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
      groups.etage.position.y = lift - e;
      groups.etage.visible = floors.includes('etage') && e > 0.01;
      groups.rdc.visible = floor !== 'etage';
      dynamic.position.y = (floor === 'etage' ? lift : 0) - e;
      elevationNow = e;
    },
    dynamic,
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
      return { exteriorY: groups.exterieur.position.y, elevation: elevationNow, visible: Object.fromEntries(Object.entries(groups).map(([k, g]) => [k, visibleOf(g)])), slab: slab ? slab.visible && groups.etage.visible : false, marks: [...marks].filter(([, m]) => m.visible && m.parent?.visible).map(([k]) => k) };
    },
    setFog(distance) {
      scene.fog.near = distance * render.fog.near;
      scene.fog.far = distance * render.fog.far;
    },
    setShadows(on) {
      sun.castShadow = Boolean(on);
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
