// Monde en 3D : sol de la salle, murs percés de fenêtres, meubles, décor extérieur, lumières et ombres, caméra qui suit le joueur.
// Une unité du jeu = une unité de la scène : x du jeu -> X, y du jeu -> Z, la hauteur est Y (le sol est le plan y = 0).
// Tout est créé une seule fois au chargement ; les objets nombreux (murs, meubles, arbres...) sont des instances (InstancedMesh)
// pour tenir le budget d'appels de dessin. Formes et couleurs provisoires (textures au lot 1c).
import * as THREE from 'three';
import { boundTarget, overview, snapCamera, stepCamera } from '../core/camera.js';
import { cameraPosition, fitDistance, groundView } from '../core/viewport.js';
import { floorItems } from './floor.js';

const FAR_GROUND = 40_000; // sol extérieur étendu bien au-delà du monde

// Variantes de teinte d'une couleur du jeu (aucune valeur de couleur en dur).
const tint = (hex, h = 0, s = 0, l = 0) => new THREE.Color(hex).offsetHSL(h, s, l);
const FURNITURE_TINT = { table: [0, 0, 0], comptoir: [0, 0, -0.05], caisse: [0, -0.1, 0.05], armoire: [0, 0, -0.1], colonne: [0, -0.25, 0.1], etagere: [0, 0, -0.03] };

const unitBox = new THREE.BoxGeometry(1, 1, 1);
const cylinder = new THREE.CylinderGeometry(1, 1, 1, 6);
const crown = new THREE.IcosahedronGeometry(1, 0);

// Fusion de géométries : chaque élément { x, y, z, sx, sy, sz, rot?, color } est une copie transformée d'une géométrie unitaire, avec sa
// couleur en sommet ; tout un groupe devient un seul maillage, donc un seul appel de dessin (plus un pour la carte d'ombres s'il en projette).
class Parts {
  constructor() {
    this.positions = [];
    this.normals = [];
    this.colors = [];
    this.matrix = new THREE.Matrix4();
    this.quaternion = new THREE.Quaternion();
    this.euler = new THREE.Euler();
    this.position = new THREE.Vector3();
    this.scale = new THREE.Vector3();
  }

  add(geometry, items) {
    const source = geometry.index ? geometry.toNonIndexed() : geometry;
    for (const it of items) {
      const g = source.clone();
      g.applyMatrix4(this.matrix.compose(this.position.set(it.x, it.y, it.z), this.quaternion.setFromEuler(this.euler.set(0, it.rot ?? 0, 0)), this.scale.set(it.sx, it.sy, it.sz)));
      const count = g.attributes.position.count;
      this.positions.push(...g.attributes.position.array);
      this.normals.push(...g.attributes.normal.array);
      for (let i = 0; i < count; i += 1) this.colors.push(it.color.r, it.color.g, it.color.b);
      g.dispose();
    }
    if (source !== geometry) source.dispose();
  }

  // Un seul maillage Lambert à couleurs de sommet, ou null s'il n'y a rien.
  mesh(scene, { cast = false, receive = false } = {}) {
    if (this.positions.length === 0) return null;
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(this.positions, 3));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(this.normals, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(this.colors, 3));
    geometry.computeBoundingSphere();
    const mesh = new THREE.Mesh(geometry, new THREE.MeshLambertMaterial({ vertexColors: true }));
    mesh.castShadow = cast;
    mesh.receiveShadow = receive;
    scene.add(mesh);
    return mesh;
  }
}

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

// Décor extérieur (graine fixe, voir js/core/decor.js), ajouté aux groupes fusionnés : scenery (sol, arbres, buissons, lampadaires,
// barrières : aucune ombre projetée) et props (voitures : elles projettent une ombre, comme les meubles).
function addDecor(scenery, props, palette, decor) {
  const lines = {
    route: new THREE.Color(palette.road),
    trottoir: tint(palette.road, 0, -0.02, 0.1),
    sentier: tint(palette.grass, 0.02, -0.1, 0.1),
  };
  // Bandes de sol : route, trottoir, sentier (boîtes plates, 0,4 d'épaisseur, au-dessus de l'herbe).
  scenery.add(unitBox, decor.ground.map((g) => ({ x: g.x + g.w / 2, y: 0.2, z: g.y + g.h / 2, sx: g.w, sy: 0.4, sz: g.h, color: lines[g.kind] ?? lines.route })));

  // Voitures abandonnées : caisse basse et habitacle.
  const carBody = new THREE.Color(palette.car);
  const carCabin = tint(palette.car, 0, -0.1, 0.04);
  const bodyTop = 36;
  props.add(unitBox, decor.cars.map((c) => ({ x: c.x + c.w / 2, y: (8 + bodyTop) / 2, z: c.y + c.h / 2, sx: c.w, sy: bodyTop - 8, sz: c.h, color: carBody })));
  props.add(unitBox, decor.cars.map((c) => ({ x: c.x + c.w / 2 - c.w * 0.05, y: (bodyTop + c.hauteur) / 2, z: c.y + c.h / 2, sx: c.w * 0.5, sy: c.hauteur - bodyTop, sz: c.h * 0.85, color: carCabin })));

  // Arbres : tronc et couronne ; buissons.
  const trunkColor = tint(palette.furniture, 0, -0.1, -0.2);
  const leaf = new THREE.Color(palette.tree);
  scenery.add(cylinder, decor.trees.map((t) => ({ x: t.x + t.w / 2, y: t.hauteur / 2, z: t.y + t.h / 2, sx: t.w / 4, sy: t.hauteur, sz: t.w / 4, color: trunkColor })));
  scenery.add(crown, decor.trees.map((t) => ({ x: t.x + t.w / 2, y: t.hauteur + t.couronne * 0.55, z: t.y + t.h / 2, sx: t.couronne, sy: t.couronne * 0.8, sz: t.couronne, rot: t.x, color: leaf })));
  scenery.add(crown, decor.bushes.map((b) => ({ x: b.x, y: b.hauteur / 2, z: b.y, sx: b.r, sy: b.hauteur / 2, sz: b.r, rot: b.y, color: tint(palette.tree, 0, 0, 0.04) })));

  // Lampadaires (décoratifs) et barrières (décoratives, basses).
  const metal = tint(palette.gun, 0, 0, -0.15);
  scenery.add(cylinder, decor.lamps.map((l) => ({ x: l.x, y: l.hauteur / 2, z: l.y, sx: 2.5, sy: l.hauteur, sz: 2.5, color: metal })));
  scenery.add(crown, decor.lamps.map((l) => ({ x: l.x, y: l.hauteur + 4, z: l.y, sx: 8, sy: 6, sz: 8, color: new THREE.Color(palette.hit) })));
  scenery.add(unitBox, decor.fences.map((f) => ({ x: f.x + f.w / 2, y: f.hauteur / 2, z: f.y + f.h / 2, sx: f.w, sy: f.hauteur, sz: f.h, color: metal })));
}

// layout : sortie de js/core/layout.js. Renvoie { scene, setShadows, followSun }.
export function buildWorld({ palette, layout, render }) {
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

  // Deux maillages fusionnés : scenery (sol de la salle et extérieur, murs, décor : ne projettent pas d'ombre) et props (meubles et
  // voitures : projettent une ombre). Le monde coûte deux appels de dessin, trois avec la carte d'ombres.
  const scenery = new Parts();
  const props = new Parts();

  // Sol de la salle : dalle et quadrillage léger (le trait mêle le sol et le fond, comme l'ancienne texture).
  const floorColor = new THREE.Color(palette.floor);
  scenery.add(unitBox, floorItems(room, floorColor, floorColor.clone().lerp(new THREE.Color(palette.ground), 0.55)));

  // Sol extérieur de --game-ground étendu bien au-delà du monde ; dans le monde, l'herbe (salle du lot 1m : marge plate, comme avant).
  const flat = (width, depth, y, color) => ({ x: room.x + room.width / 2, y, z: room.y + room.height / 2, sx: width, sy: 1, sz: depth, color: new THREE.Color(color) });
  scenery.add(unitBox, [{ ...flat(FAR_GROUND, FAR_GROUND, -1.5, palette.ground), x: size.width / 2, z: size.height / 2 }]);
  const lawn = layout.empty ? { w: room.width + 2 * layout.margin, h: room.height + 2 * layout.margin, color: palette.ground } : { w: size.width, h: size.height, color: palette.grass };
  scenery.add(unitBox, [flat(lawn.w, lawn.h, -1, lawn.color)]);

  // Murs (allège, linteau et barreaux des fenêtres compris).
  const { walls, bars } = wallBoxes(room, layout.windows, layout.windowSize, render);
  scenery.add(unitBox, walls.map((w) => ({ ...w, color: new THREE.Color(palette.wall) })));
  scenery.add(unitBox, bars.map((b) => ({ ...b, color: new THREE.Color(palette.gun) })));

  // Meubles : boîtes aux hauteurs de world.json, une teinte par type.
  const tints = Object.fromEntries(Object.entries(FURNITURE_TINT).map(([kind, t]) => [kind, tint(palette.furniture, ...t)]));
  props.add(unitBox, layout.furniture.map((f) => ({ x: f.x + f.w / 2, y: f.hauteur / 2, z: f.y + f.h / 2, sx: f.w, sy: f.hauteur, sz: f.h, color: tints[f.kind] ?? tints.table })));

  if (layout.decor) addDecor(scenery, props, palette, layout.decor);
  scenery.mesh(scene, { receive: true });
  props.mesh(scene, { cast: true, receive: true });

  return {
    scene,
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
