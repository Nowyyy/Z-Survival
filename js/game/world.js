// Salle du lot 1 en 3D : sol, murs avec ouvertures, sol extérieur, lumières et ombres, caméra fixe qui montre toute la salle.
// Une unité du jeu = une unité de la scène : x du jeu -> X, y du jeu -> Z, la hauteur est Y (le sol est le plan y = 0).
import * as THREE from 'three';
import { cameraPosition, fitDistance } from '../core/viewport.js';
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
    m.castShadow = true;
    m.receiveShadow = true;
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
  Object.assign(sun.shadow.camera, { left: -half, right: half, top: half, bottom: -half, near: 50, far: 1800 });
  sun.shadow.bias = -0.0006;
  sun.shadow.normalBias = 0.6;
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
    // La lumière suit la cible : la carte d'ombres de 1024 ne couvre que la zone utile autour du joueur.
    followSun(x, z) {
      const o = render.light.sunOffset;
      sun.position.set(x + o.x, o.y, z + o.z);
      sun.target.position.set(x, 0, z);
    },
  };
}

// Caméra fixe centrée sur la salle, au sud de la cible, orientée au nord ; la distance fait tenir toute la salle.
export function createCamera(cfg, room, tilt) {
  const camera = new THREE.PerspectiveCamera(cfg.fov, 1, cfg.near, cfg.far);
  camera.up.set(0, 0, -1);
  const target = { x: room.width / 2, y: room.height / 2 };
  const view = { tilt, distance: 0 };
  return {
    camera,
    view,
    // À appeler à chaque redimensionnement.
    resize(width, height) {
      const aspect = Math.max(1, width) / Math.max(1, height);
      camera.aspect = aspect;
      camera.fov = cfg.fov;
      view.distance = fitDistance(aspect, room, tilt, cfg.fov, cfg.margin);
      const p = cameraPosition(target, view.distance, tilt);
      camera.position.set(p.x, p.y, p.z);
      camera.lookAt(target.x, 0, target.y);
      camera.updateProjectionMatrix();
      camera.updateMatrixWorld(true);
    },
  };
}
