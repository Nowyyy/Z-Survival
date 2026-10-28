// Monde en 3D : sol de la salle, murs percés de fenêtres, meubles, décor extérieur, lumières et ombres, caméra qui suit le joueur.
// Une unité du jeu = une unité de la scène : x du jeu -> X, y du jeu -> Z, la hauteur est Y (le sol est le plan y = 0).
// Tout est créé une seule fois au chargement. Les éléments sont fusionnés par matière (un maillage, donc un appel de dessin, par
// texture) ; les coordonnées de texture sont calculées ici : proportionnelles aux dimensions réelles pour les textures répétées
// (1 répétition = `repeat` unités du monde), fenêtre dans une région de l'atlas de props pour le reste.
import * as THREE from 'three';
import { boundTarget, overview, snapCamera, stepCamera } from '../core/camera.js';
import { cameraPosition, fitDistance, groundView } from '../core/viewport.js';

const FAR_GROUND = 40_000; // sol extérieur étendu bien au-delà du monde
const ROAD_Y = 0.4; // route, trottoir et sentiers : plaques plates au-dessus de l'herbe
const ATLAS = 'atlas-props';

// Région d'atlas par type de meuble (data/game/world.json : table, comptoir, caisse, armoire, colonne, etagere).
const FURNITURE_REGION = { table: 'bois', comptoir: 'tole', caisse: 'caisse', armoire: 'bois-sombre', colonne: 'colonne', etagere: 'etagere' };
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

// layout : sortie de js/core/layout.js ; textures : sortie de createThreeTextures (js/game/textures.js).
// Renvoie { scene, setShadows, followSun }.
export function buildWorld({ palette, layout, render, textures, windowGeoms = [], windowsCfg = null, seed = 1 }) {
  const { room, size } = layout;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(palette.ground);

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

  // Une matière (donc un appel de dessin) par texture : sol de salle, murs (dessus compris), route, trottoir, herbe, terre et décor de l'atlas
  // de props (arbres, buissons, lampadaires, barrières, barreaux) = 7 maillages qui ne projettent pas d'ombre ; meubles et voitures
  // (atlas de props) forment le huitième, qui projette une ombre (+1 appel pour la passe d'ombres).
  const mat = (id) => new THREE.MeshLambertMaterial({ map: textures.texture(id) });
  const atlasMaterial = mat(ATLAS);
  const region = (id) => textures.region(ATLAS, id);
  const b = {
    floor: new Builder(), wall: new Builder(), road: new Builder(), sidewalk: new Builder(), grass: new Builder(), soil: new Builder(),
    scenery: new Builder(), props: new Builder(),
    repeat: { road: textures.repeat('route'), sidewalk: textures.repeat('trottoir') },
  };
  const outdoorSoil = textures.repeat('sol-exterieur');

  // Sol de la salle : carrelage (la dalle commence au coin de la salle, les carreaux sont alignés dessus).
  b.floor.slab(room.x, room.y, room.x + room.width, room.y + room.height, 0, textures.repeat('sol-salle'), room.x, room.y);

  // Sol extérieur de terre étendu bien au-delà du monde ; dans le monde, l'herbe (salle du lot 1m : marge plate de terre, comme avant).
  b.soil.slab(size.width / 2 - FAR_GROUND / 2, size.height / 2 - FAR_GROUND / 2, size.width / 2 + FAR_GROUND / 2, size.height / 2 + FAR_GROUND / 2, -1.5, outdoorSoil);
  if (layout.empty) {
    const m = layout.margin;
    b.soil.slab(room.x - m, room.y - m, room.x + room.width + m, room.y + room.height + m, -1, outdoorSoil);
  } else {
    b.grass.slab(0, 0, size.width, size.height, -1, textures.repeat('herbe'));
  }

  // Murs (allège, linteau et barreaux des fenêtres compris) : enduit sur les côtés, dessus de la couleur --game-wall sans texture.
  const { walls, bars } = wallBoxes(room, layout.windows, layout.windowSize, render);
  const wallRepeat = textures.repeat('mur');
  for (const w of walls) {
    b.wall.box(extents(w), { repeat: wallRepeat }, 'cotes');
    b.wall.box(extents(w), { fixed: [0.31, 0.62] }, 'dessus'); // dessus : un seul texel du mur, donc sans texture
  }
  bars.forEach((bar, i) => b.scenery.box(extents(bar), { rect: region('tole'), scale: region('tole').scale, seed: 500 + i }));

  // Meubles : boîtes aux hauteurs de world.json, une région d'atlas par type.
  layout.furniture.forEach((f, i) => {
    const id = FURNITURE_REGION[f.kind] ?? FURNITURE_REGION.table;
    b.props.box(rectBox(f, 0, f.hauteur), { rect: region(id), scale: region(id).scale, seed: i + 1 });
  });

  if (layout.decor) addDecor(b, region, layout.decor, outdoorSoil);

  const sceneryMaterials = [['floor', mat('sol-salle')], ['wall', mat('mur')], ['road', mat('route')], ['sidewalk', mat('trottoir')], ['grass', mat('herbe')], ['soil', mat('sol-exterieur')]];
  for (const [name, material] of sceneryMaterials) b[name].mesh(scene, material, { receive: true });
  b.scenery.mesh(scene, atlasMaterial, { receive: true });
  b.props.mesh(scene, atlasMaterial, { cast: true, receive: true });

  // Planches des fenêtres (lot 3) : un seul maillage dynamique, 2 triangles par planche (quadrilatère vertical dans l'ouverture, légèrement
  // incliné d'un angle propre à chaque planche, graine du jeu), texture de bois de l'atlas de props (région existante), double face, sans ombre.
  // Une planche arrachée est écrasée en un point (triangles dégénérés), une planche posée reprend sa place : aucun objet recréé.
  const planks = windowGeoms.length > 0 && windowsCfg ? createPlanks({ scene, material: atlasMaterial, rect: region('bois'), geoms: windowGeoms, count: windowsCfg.planks, render, seed }) : null;

  return {
    scene,
    planks,
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

// Style des planches (choisi par le propriétaire sur comparaison, variante « I ») : poutres de 14 d'épaisseur, inclinées jusqu'à 13° dans le plan du mur,
// décalées de 2,5 en hauteur, débordant de 16 autour de l'ouverture.
const PLANK_STYLE = { box: 14, tilt: 13, jitter: 2.5, over: 16 };

const PLANK_INSET = 12.2; // face arrière des poutres : contre la face intérieure du mur (à 12 du centre de la fenêtre)
const DEBRIS_LENGTH = 62; // planche arrachée tombée au sol : longueur et largeur
const DEBRIS_WIDTH = 8;

// Planches des fenêtres : un seul maillage dynamique. Chaque planche est une poutre en relief de 4 quadrilatères (face avant, dessus et deux bouts), posée
// contre la face intérieure du mur, inclinée dans le plan du mur et décalée au hasard (PLANK_STYLE). Chaque planche arrachée apparaît en débris à plat sur le sol devant la fenêtre (graine du jeu). Un élément absent est écrasé en
// un point (triangles dégénérés) : rien n'est recréé.
function createPlanks({ scene, material, rect, geoms, count, render, seed }) {
  const style = PLANK_STYLE;
  const total = geoms.length * count;
  const Q = 4; // quadrilatères par planche clouée
  const base = new Float32Array(total * (Q + 1) * 18);
  const uvs = new Float32Array(total * (Q + 1) * 12);
  const over = style.over;
  const sill = render.sillHeight - over;
  const open = render.lintelBottom - render.sillHeight + 2 * over;
  const h = open / count;
  const index = new Map(); // fenêtre -> premier numéro de planche
  const put = (slot, corners, v0, v1) => {
    const quadUv = [[rect.u0, v0], [rect.u1, v0], [rect.u1, v1], [rect.u0, v1]];
    [0, 1, 2, 0, 2, 3].forEach((c, k) => {
      base.set(corners[c], slot * 18 + k * 3);
      uvs.set(quadUv[c], slot * 12 + k * 2);
    });
  };
  const tiltMax = (style.tilt * Math.PI) / 180;
  geoms.forEach((g, w) => {
    index.set(g.id, w * count);
    const cx = g.center.x - g.normal.x * PLANK_INSET;
    const cz = g.center.y - g.normal.y * PLANK_INSET;
    for (let i = 0; i < count; i += 1) {
      const n = w * count + i;
      const v0 = rect.v0 + ((rect.v1 - rect.v0) * i) / count;
      const v1 = rect.v0 + ((rect.v1 - rect.v0) * (i + 1)) / count;
      const tilt = (unit(seed + 7, n) * 2 - 1) * tiltMax;
      const jit = style.jitter;
      const half = g.width / 2 + over + (unit(seed + 11, n) * 2 - 1) * 8;
      const shift = (unit(seed + 13, n) * 2 - 1) * 7; // décalage le long du mur
      const hh = h / 2 - 1.5;
      const cy = sill + h * (i + 0.5) + (unit(seed + 17, n) * 2 - 1) * jit;
      // Coins [haut gauche, haut droit, bas droit, bas gauche] du plan du mur, tournés autour du centre de la planche ; push : avancée dans la salle.
      const quad = (push) => [[-half, hh], [half, hh], [half, -hh], [-half, -hh]].map(([a, b]) => {
        const ra = a * Math.cos(tilt) - b * Math.sin(tilt) + shift;
        const rb = a * Math.sin(tilt) + b * Math.cos(tilt);
        return [cx + g.tangent.x * ra - g.normal.x * push, cy + rb, cz + g.tangent.y * ra - g.normal.y * push];
      });
      const back = quad(0);
      const front = quad(style.box);
      put(n * Q, front, v0, v1); // face avant (côté salle)
      put(n * Q + 1, [front[0], front[1], back[1], back[0]], v0, v1); // dessus
      put(n * Q + 2, [front[0], back[0], back[3], front[3]], v0, v1); // bout gauche
      put(n * Q + 3, [front[1], back[1], back[2], front[2]], v0, v1); // bout droit
      // Débris : à plat sur le sol, entre 35 et 120 devant le mur et jusqu'à ±(largeur/2 + 30) le long du mur, orienté au hasard.
      const along = (unit(seed + 21, n) * 2 - 1) * (g.width / 2 + 30);
      const depth = 35 + unit(seed + 35, n) * 85;
      const angle = unit(seed + 49, n) * Math.PI;
      const dx = Math.cos(angle) * (DEBRIS_LENGTH / 2);
      const dz = Math.sin(angle) * (DEBRIS_LENGTH / 2);
      const wx = -Math.sin(angle) * (DEBRIS_WIDTH / 2);
      const wz = Math.cos(angle) * (DEBRIS_WIDTH / 2);
      const mx = g.center.x - g.normal.x * depth + g.tangent.x * along;
      const mz = g.center.y - g.normal.y * depth + g.tangent.y * along;
      const y = 0.6 + i * 0.15;
      put(total * Q + n, [[mx - dx - wx, y, mz - dz - wz], [mx + dx - wx, y, mz + dz - wz], [mx + dx + wx, y, mz + dz + wz], [mx - dx + wx, y, mz - dz + wz]], v0, v1);
    }
  });
  const positions = new Float32Array(base);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geometry.computeVertexNormals();
  geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), 1e5); // jamais écarté par la caméra
  const plankMaterial = material.clone();
  plankMaterial.side = THREE.DoubleSide;
  const mesh = new THREE.Mesh(geometry, plankMaterial);
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.frustumCulled = false;
  scene.add(mesh);
  const nailed = new Int8Array(total).fill(-1); // dernier état écrit par planche (1 visible, 0 écrasée)
  const debris = new Int8Array(total).fill(-1);
  const write = (flags, n, quadStart, quads, on) => {
    if (flags[n] === on) return false;
    flags[n] = on;
    const from = quadStart * 18;
    const to = (quadStart + quads) * 18;
    if (on) positions.set(base.subarray(from, to), from);
    else positions.fill(0, from, to);
    return true;
  };
  const sum = (a) => a.reduce((n, v) => n + (v === 1 ? 1 : 0), 0);
  return {
    mesh,
    triangles: total * (Q + 1) * 2,
    // Nombre de planches clouées et de débris actuellement visibles (tests).
    counts: () => ({ nailed: sum(nailed), debris: sum(debris) }),
    // state : sortie de createWindowsState / stepWindows ; ne réécrit que ce qui a changé (planche posée ou arrachée).
    sync(state) {
      let changed = false;
      for (const [id, first] of index) {
        const have = state?.windows?.[id]?.planks ?? 0;
        for (let i = 0; i < count; i += 1) {
          const n = first + i;
          if (write(nailed, n, n * Q, Q, i < have ? 1 : 0)) changed = true;
          if (write(debris, n, total * Q + n, 1, i < have ? 0 : 1)) changed = true;
        }
      }
      if (changed) geometry.attributes.position.needsUpdate = true;
    },
  };
}

// Caméra au sud de la cible, orientée au nord, qui suit le joueur (js/core/camera.js : lissage, zone morte, bornes du monde). À zoom 1
// la distance fait tenir toute la zone de jeu (face intérieure des murs, plus une petite marge) ; la distance est divisée par le zoom.
export function createCamera(cfg, follow, layout, tilt, zoom) {
  const camera = new THREE.PerspectiveCamera(cfg.fov, 1, cfg.near, cfg.far);
  camera.up.set(0, 0, -1);
  const { room } = layout;
  const play = { width: room.width - 2 * room.wall, height: room.height - 2 * room.wall };
  const center = { x: room.x + room.width / 2, y: room.y + room.height / 2 };
  const view = { tilt, zoom, distance: 0, aspect: 1, ground: { width: 1, north: 0, south: 0 }, target: { ...center }, overview: false };
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
      view.distance = fitDistance(view.aspect, play, tilt, cfg.fov, cfg.margin) / zoom;
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
      want = { x, y };
      if (!view.overview) view.target = snapCamera(want, opts());
      place();
    },
    // Suit (x, y) avec le lissage de camera.json, indépendant du nombre d'images par seconde.
    follow(dt, x, y) {
      want = { x, y };
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
