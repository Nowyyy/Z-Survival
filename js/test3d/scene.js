// Salle Three.js : sol au canvas, murs, meubles décoratifs (sans collision), lumières, ombres, brouillard, caméra qui suit.
// Une unité du jeu = une unité de la scène : x du jeu -> X, y du jeu -> Z, la hauteur est Y.
import * as THREE from '../../vendor/three/three.module.js';
import { drawFloor } from './floor.js';

const GROUND_SIZE = 8000;
const TEXTURE_SCALE = 0.64; // pixels de texture par unité

export function buildWorld({ palette, sceneCfg, room, maxAnisotropy = 4 }) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(palette.bg);
  scene.fog = new THREE.Fog(palette.fog, sceneCfg.light.fogNear, sceneCfg.light.fogFar);

  const ambient = new THREE.AmbientLight(palette.ambient, sceneCfg.light.ambient);
  scene.add(ambient);
  const sun = new THREE.DirectionalLight(palette.sun, sceneCfg.light.sun);
  const half = sceneCfg.light.shadowHalfSize;
  sun.castShadow = true;
  sun.shadow.mapSize.set(sceneCfg.light.shadowMap, sceneCfg.light.shadowMap);
  sun.shadow.camera.left = -half;
  sun.shadow.camera.right = half;
  sun.shadow.camera.top = half;
  sun.shadow.camera.bottom = -half;
  sun.shadow.camera.near = 50;
  sun.shadow.camera.far = 1800;
  sun.shadow.bias = -0.0006;
  sun.shadow.normalBias = 0.6;
  scene.add(sun, sun.target);

  // Sol : une texture générée au canvas pour toute la salle.
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(room.width * TEXTURE_SCALE);
  canvas.height = Math.round(room.height * TEXTURE_SCALE);
  drawFloor(canvas, palette);
  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = maxAnisotropy;
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(room.width, room.height), new THREE.MeshLambertMaterial({ map }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(room.width / 2, 0, room.height / 2);
  floor.receiveShadow = true;
  scene.add(floor);

  const ground = new THREE.Mesh(new THREE.PlaneGeometry(GROUND_SIZE, GROUND_SIZE), new THREE.MeshLambertMaterial({ color: palette.bg }));
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(room.width / 2, -0.5, room.height / 2);
  ground.receiveShadow = true;
  scene.add(ground);

  // Murs : quatre boîtes sur le pourtour (épaisseur room.wall).
  const wallMat = new THREE.MeshLambertMaterial({ color: palette.wall });
  const t = room.wall;
  const wh = sceneCfg.wallHeight;
  const walls = [
    [room.width, t, room.width / 2, t / 2],
    [room.width, t, room.width / 2, room.height - t / 2],
    [t, room.height - 2 * t, t / 2, room.height / 2],
    [t, room.height - 2 * t, room.width - t / 2, room.height / 2],
  ];
  for (const [w, d, x, z] of walls) {
    const wall = new THREE.Mesh(new THREE.BoxGeometry(w, wh, d), wallMat);
    wall.position.set(x, wh / 2, z);
    wall.castShadow = true;
    wall.receiveShadow = true;
    scene.add(wall);
  }

  // Huit meubles décoratifs, trois tons.
  const tones = [palette.furnitureA, palette.furnitureB, palette.furnitureC].map((color) => new THREE.MeshLambertMaterial({ color }));
  for (const f of sceneCfg.furniture) {
    const box = new THREE.Mesh(new THREE.BoxGeometry(f.w, f.h, f.d), tones[f.tone % tones.length]);
    box.position.set(f.x, f.h / 2, f.y);
    box.castShadow = true;
    box.receiveShadow = true;
    scene.add(box);
  }

  return {
    scene,
    sun,
    setShadows(on) {
      sun.castShadow = Boolean(on);
    },
    // La lumière suit la cible : la carte d'ombres de 1024 ne couvre que la zone visible.
    followSun(x, z) {
      const o = sceneCfg.light.sunOffset;
      sun.position.set(x + o.x, o.y, z + o.z);
      sun.target.position.set(x, 0, z);
    },
  };
}

// Caméra qui suit la cible avec lissage exponentiel (constante de temps en secondes). Angle 90 = strictement vertical, nord en haut.
export function createCameraRig(cfg, aspect) {
  const camera = new THREE.PerspectiveCamera(cfg.fov, aspect, cfg.near, cfg.far);
  camera.up.set(0, 0, -1);
  let preset = cfg.default;
  const pos = { x: 0, z: 0 };

  const place = () => {
    const { angle, distance } = cfg.presets[preset];
    const a = (angle * Math.PI) / 180;
    camera.position.set(pos.x, distance * Math.sin(a), pos.z + distance * Math.cos(a));
    camera.lookAt(pos.x, 0, pos.z);
  };

  return {
    camera,
    get preset() {
      return preset;
    },
    get angle() {
      return cfg.presets[preset].angle;
    },
    get target() {
      return { ...pos };
    },
    setPreset(name) {
      if (!cfg.presets[name]) return false;
      preset = name;
      place();
      return true;
    },
    setAspect(value) {
      camera.aspect = value;
      camera.updateProjectionMatrix();
    },
    snap(x, z) {
      pos.x = x;
      pos.z = z;
      place();
    },
    update(dt, x, z) {
      const k = 1 - Math.exp(-Math.max(0, dt) / cfg.smoothing);
      pos.x += (x - pos.x) * k;
      pos.z += (z - pos.z) * k;
      place();
    },
  };
}

export { THREE };
