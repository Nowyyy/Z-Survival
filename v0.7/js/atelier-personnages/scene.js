// Scène Three.js de l'atelier des personnages (lot 3j) : mêmes réglages de rendu que le jeu (render.json : lumière ambiante, soleil et
// carte d'ombres, brume proportionnelle à la distance de la caméra ; palette.js : couleurs), sol au choix (textures du jeu générées par
// js/game/textures.js), caméra du jeu (perspective 40°, inclinaison 75°, distance du jeu à 667 × 375) ou vues d'étude.
import * as THREE from 'three';

export const VIEWS = ['jeu', 'dessus', 'troisQuarts', 'orbite'];
const GAME_HEIGHT = 375; // hauteur de fenêtre de référence (667 × 375) : l'échelle du jeu y est exacte

// Plan de sol texturé ; floors : { id: { texture, repeat } } ; renvoie { mesh, set(id) }.
function createGround(floors) {
  const geometry = new THREE.PlaneGeometry(2400, 2400);
  geometry.rotateX(-Math.PI / 2);
  const material = new THREE.MeshLambertMaterial();
  const mesh = new THREE.Mesh(geometry, material);
  mesh.receiveShadow = true;
  return {
    mesh,
    set(id) {
      const f = floors[id] ?? Object.values(floors)[0];
      if (!f) return;
      material.map = f.texture;
      const k = 2400 / Math.max(1, f.repeat);
      f.texture.repeat.set(k, k);
      material.needsUpdate = true;
    },
  };
}

// render : render.json ; palette : readPalette() ; floors : textures de sol. Renvoie { scene, sun, ground, add(obj), setFog(distance) }.
export function createStage({ render, palette, floors }) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(palette.fog);
  scene.fog = new THREE.Fog(palette.fog, 1e6, 2e6);
  scene.add(new THREE.AmbientLight(palette.ambient, render.light.ambient));
  const sun = new THREE.DirectionalLight(palette.sun, render.light.sun);
  sun.castShadow = true;
  sun.shadow.mapSize.set(render.light.shadowMap, render.light.shadowMap);
  Object.assign(sun.shadow.camera, { left: -160, right: 160, top: 160, bottom: -160, near: 50, far: render.light.shadowFar });
  sun.shadow.bias = -0.0006;
  sun.shadow.normalBias = 0.6;
  const o = render.light.sunOffset;
  sun.position.set(o.x, o.y, o.z);
  sun.target.position.set(0, 0, 0);
  scene.add(sun, sun.target);
  const ground = createGround(floors);
  scene.add(ground.mesh);
  return {
    scene,
    sun,
    ground,
    // Brume du jeu : de fog.near à fog.far fois la distance de la caméra.
    setFog(distance) {
      scene.fog.near = distance * render.fog.near;
      scene.fog.far = distance * render.fog.far;
    },
  };
}

// Caméra d'une vue pour une fenêtre (largeur, hauteur en pixels CSS) : à l'échelle `zoom` (1 = jeu), l'échelle du jeu est conservée quelle que
// soit la hauteur de la fenêtre (le champ vertical est ajusté). view : 'jeu' | 'dessus' | 'troisQuarts' | 'orbite' ; yaw : orbite (radians).
export function viewCamera(camera, { view = 'jeu', width = 667, height = 375, zoom = 1, yaw = 0, gameDistance, fov = 40, tilt = 75, target = [0, 22, 0] }) {
  const tan = Math.tan((fov * Math.PI) / 360) * (height / GAME_HEIGHT);
  const vfov = (2 * Math.atan(tan) * 180) / Math.PI;
  const t = { jeu: tilt, dessus: 89.5, troisQuarts: 35, orbite: 50 }[view] ?? tilt;
  const near = { jeu: 1, dessus: 1, troisQuarts: 3, orbite: 2.5 }[view] ?? 1;
  const distance = gameDistance / Math.max(0.1, zoom) / near;
  const a = (t * Math.PI) / 180;
  const y = view === 'orbite' ? yaw : 0;
  const aimY = view === 'jeu' || view === 'dessus' ? 0 : target[1];
  camera.fov = vfov;
  camera.aspect = width / Math.max(1, height);
  camera.near = 5;
  camera.far = 9000;
  camera.up.set(0, view === 'dessus' || view === 'jeu' ? 0 : 1, view === 'dessus' || view === 'jeu' ? -1 : 0);
  camera.position.set(Math.sin(y) * distance * Math.cos(a), distance * Math.sin(a) + aimY, Math.cos(y) * distance * Math.cos(a));
  camera.lookAt(0, aimY, 0);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld(true);
  return { distance, fov: vfov, tilt: t, unitsPerPixel: (2 * distance * tan) / height };
}
