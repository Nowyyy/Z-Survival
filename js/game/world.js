// Salle du lot 1 en 3D : sol, murs avec ouvertures, sol extérieur, lumières et ombres, caméra fixe qui montre toute la salle.
// Une unité du jeu = une unité de la scène : x du jeu -> X, y du jeu -> Z, la hauteur est Y (le sol est le plan y = 0).
import * as THREE from 'three';
import { cameraPosition, clampCamera, fitDistance, groundView } from '../core/viewport.js';
import { drawFloor } from './floor.js';

const TEXTURE_SCALE = 0.64; // pixels de texture par unité

// Murs : quatre côtés dont la face intérieure est la limite de déplacement (room.wall) ; l'épaisseur déborde vers l'extérieur.
// Une ouverture est découpée là où une fenêtre de room.windows touche le mur.
function addWalls(scene, palette, room, render) {
  const wallMat = new THREE.MeshLambertMaterial({ color: palette.wall });
  const barMat = new THREE.MeshLambertMaterial({ color: palette.gun });
  const { wallHeight: top, wallThickness: thick, sillHeight: sill, lintelBottom: lintel } = render;
  const inner = room.wall;
  const outer = inner - thick;
  const barGeo = new THREE.BoxGeometry(3, lintel - sill, 3);
  const mesh = (geometry, material, x, y, z) => {
    const m = new THREE.Mesh(geometry, material);
    m.position.set(x, y, z);
    m.receiveShadow = true; // les murs ne projettent pas d'ombre : seules celles des personnages comptent
    scene.add(m);
    return m;
  };
  // axis 'x' : mur le long de X (nord, sud, coins compris) ; 'z' : le long de Z (ouest, est, entre les deux autres). center : milieu de l'épaisseur.
  const sides = [
    { axis: 'x', center: (inner + outer) / 2, from: outer, end: room.width - outer, test: (w) => w.y < inner },
    { axis: 'x', center: room.height - (inner + outer) / 2, from: outer, end: room.width - outer, test: (w) => w.y > room.height - inner },
    { axis: 'z', center: (inner + outer) / 2, from: inner, end: room.height - inner, test: (w) => w.x < inner },
    { axis: 'z', center: room.width - (inner + outer) / 2, from: inner, end: room.height - inner, test: (w) => w.x > room.width - inner },
  ];
  const half = room.windowSize / 2;
  for (const side of sides) {
    const along = (w) => (side.axis === 'x' ? w.x : w.y);
    const openings = room.windows.filter(side.test).map((w) => [along(w) - half, along(w) + half]).sort((a, b) => a[0] - b[0]);
    // Place une boîte [a, b] le long du mur, de la hauteur y0 à y1, sur toute l'épaisseur.
    const span = (a, b, y0, y1, material = wallMat) => {
      const len = b - a;
      const geometry = side.axis === 'x' ? new THREE.BoxGeometry(len, y1 - y0, thick) : new THREE.BoxGeometry(thick, y1 - y0, len);
      const mid = (a + b) / 2;
      return side.axis === 'x' ? mesh(geometry, material, mid, (y0 + y1) / 2, side.center) : mesh(geometry, material, side.center, (y0 + y1) / 2, mid);
    };
    let cursor = side.from;
    const { end } = side;
    for (const [a, b] of openings) {
      if (a > cursor) span(cursor, a, 0, top);
      span(a, b, 0, sill);
      span(a, b, lintel, top);
      for (const k of [1, 2]) {
        const at = a + ((b - a) * k) / 3;
        if (side.axis === 'x') mesh(barGeo, barMat, at, (sill + lintel) / 2, side.center);
        else mesh(barGeo, barMat, side.center, (sill + lintel) / 2, at);
      }
      cursor = b;
    }
    if (end > cursor) span(cursor, end, 0, top);
  }
}

export function buildWorld({ palette, room, render, maxAnisotropy = 4 }) {
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
  // Lumière fixe, loin au sud-ouest de la salle : la carte d'ombres couvre toute la salle, quel que soit l'endroit où se trouve le joueur.
  const o = render.light.sunOffset;
  sun.position.set(room.width / 2 + o.x, o.y, room.height / 2 + o.z);
  sun.target.position.set(room.width / 2, 0, room.height / 2);
  scene.add(sun, sun.target);

  // Sol : une texture générée au canvas pour toute la salle (aucune image).
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(room.width * TEXTURE_SCALE);
  canvas.height = Math.round(room.height * TEXTURE_SCALE);
  drawFloor(canvas, palette, room, { pixelsPerUnit: TEXTURE_SCALE });
  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = maxAnisotropy;
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(room.width, room.height), new THREE.MeshLambertMaterial({ map }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(room.width / 2, 0, room.height / 2);
  floor.receiveShadow = true;
  scene.add(floor);

  // Sol extérieur plat sur la marge du lot 1, juste sous le sol de la salle.
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(room.width + 2 * room.margin, room.height + 2 * room.margin), new THREE.MeshLambertMaterial({ color: palette.ground }));
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(room.width / 2, -0.5, room.height / 2);
  ground.receiveShadow = true;
  scene.add(ground);

  addWalls(scene, palette, room, render);

  return {
    scene,
    setShadows(on) {
      sun.castShadow = Boolean(on);
    },
    // La lumière suit la cible de la caméra et sa carte d'ombres (1024) couvre la zone visible : plus la vue est proche, plus l'ombre est fine.
    followSun(x, z, half) {
      const o = render.light.sunOffset;
      sun.position.set(x + o.x, o.y, z + o.z);
      sun.target.position.set(x, 0, z);
      const h = Math.min(Math.max(half, 250), render.light.shadowHalfSize);
      if (sun.shadow.camera.right !== h) {
        Object.assign(sun.shadow.camera, { left: -h, right: h, top: h, bottom: -h });
        sun.shadow.camera.updateProjectionMatrix();
      }
    },
  };
}

// Caméra au sud de la cible, orientée au nord, qui suit le joueur en douceur. À zoom 1 la distance fait tenir toute la zone de jeu
// (face intérieure des murs, plus une petite marge) ; la distance est divisée par le zoom. La vue ne s'écarte pas de la salle de plus
// de cfg.slack unités (elle reste centrée si elle est plus grande que la salle).
export function createCamera(cfg, room, tilt, zoom) {
  const camera = new THREE.PerspectiveCamera(cfg.fov, 1, cfg.near, cfg.far);
  camera.up.set(0, 0, -1);
  const play = { width: room.width - 2 * room.wall, height: room.height - 2 * room.wall };
  const view = { tilt, zoom, distance: 0, aspect: 1, ground: { width: 1, north: 0, south: 0 }, target: { x: room.width / 2, y: room.height / 2 } };
  let want = { ...view.target };

  const place = () => {
    const p = cameraPosition(view.target, view.distance, tilt);
    camera.position.set(p.x, p.y, p.z);
    camera.lookAt(view.target.x, 0, view.target.y);
    camera.updateMatrixWorld(true);
  };
  const aim = (x, y) => clampCamera({ x, y }, room, view.ground, cfg.slack);

  return {
    camera,
    view,
    // À appeler à chaque redimensionnement.
    resize(width, height) {
      view.aspect = Math.max(1, width) / Math.max(1, height);
      camera.aspect = view.aspect;
      camera.fov = cfg.fov;
      view.distance = fitDistance(view.aspect, play, tilt, cfg.fov, cfg.margin) / zoom;
      view.ground = groundView(view.aspect, view.distance, tilt, cfg.fov);
      camera.updateProjectionMatrix();
      view.target = aim(want.x, want.y);
      place();
    },
    // Place la caméra d'un coup sur (x, y), sans lissage (début de partie).
    snap(x, y) {
      want = { x, y };
      view.target = aim(x, y);
      place();
    },
    // Suit (x, y) avec un lissage exponentiel de constante cfg.smoothing (secondes).
    follow(dt, x, y) {
      want = { x, y };
      const goal = aim(x, y);
      const k = 1 - Math.exp(-Math.max(0, dt) / cfg.smoothing);
      view.target = { x: view.target.x + (goal.x - view.target.x) * k, y: view.target.y + (goal.y - view.target.y) * k };
      place();
    },
  };
}
