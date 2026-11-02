// Lot 3g (retour du propriétaire) : brouillard retravaillé. Nappes horizontales translucides au-dessus du sol extérieur : leur opacité vient de la distance au bâtiment
// (masque de js/core/fog.js : nulle dans le bâtiment et près des murs, pleine au loin) et d'un bruit qui dérive avec le vent (temps de jeu ; immobile en mouvement
// réduit). Un appel de dessin par nappe ; couleur --game-fog. Aucun post-traitement.
import * as THREE from 'three';

const VERTEX = `
varying vec2 vUv;
varying vec2 vWorld;
void main() {
  vUv = uv;
  vec4 w = modelMatrix * vec4(position, 1.0);
  vWorld = w.xz;
  gl_Position = projectionMatrix * viewMatrix * w;
}`;
const FRAGMENT = `
uniform sampler2D uMask;
uniform vec3 uColor;
uniform float uTime;
uniform float uStrength;
uniform float uScale;
uniform vec2 uWind;
uniform float uFloor;
uniform float uContrast;
varying vec2 vUv;
varying vec2 vWorld;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}
float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  for (int k = 0; k < 4; k++) { v += a * noise(p); p = p * 2.03 + vec2(17.0, 9.0); a *= 0.5; }
  return v;
}
void main() {
  float m = texture2D(uMask, vUv).a;
  vec2 p = vWorld / uScale + uWind * uTime;
  float n = fbm(p + 0.35 * vec2(fbm(p * 0.7 + uTime * 0.03), fbm(p * 0.7 - uTime * 0.02)));
  float wisps = smoothstep(0.5 - uContrast, 0.5 + uContrast, n);
  float a = uStrength * m * mix(uFloor, 1.0, wisps);
  if (a < 0.004) discard;
  gl_FragColor = vec4(uColor, a);
}`;

// area : rectangle du monde couvert ; mask : texture (alpha = opacité selon la distance au bâtiment) ; layer : { y, strength, scale, wind: [x, z], floor, contrast }.
export function createMistLayer({ area, mask, color, layer, name }) {
  const geometry = new THREE.BufferGeometry();
  const y = layer.y;
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([area.x, y, area.y, area.x + area.w, y, area.y, area.x + area.w, y, area.y + area.h, area.x, y, area.y + area.h], 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2));
  geometry.setIndex([0, 2, 1, 0, 3, 2]);
  geometry.computeBoundingSphere();
  const material = new THREE.ShaderMaterial({
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
    uniforms: {
      uMask: { value: mask },
      uColor: { value: new THREE.Color(color) },
      uTime: { value: 0 },
      uStrength: { value: layer.strength },
      uScale: { value: layer.scale },
      uWind: { value: new THREE.Vector2(layer.wind[0], layer.wind[1]) },
      uFloor: { value: layer.floor },
      uContrast: { value: layer.contrast },
    },
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = name;
  return mesh;
}

// Réglages de render.json (fog.layers), avec des valeurs sûres.
export function mistLayers(cfg) {
  const list = Array.isArray(cfg) ? cfg : [];
  const n = (v, d) => (Number.isFinite(v) ? v : d);
  return list.map((l) => ({
    y: n(l?.y, 20), strength: Math.min(1, Math.max(0, n(l?.strength, 0.5))), scale: Math.max(10, n(l?.scale, 240)),
    wind: Array.isArray(l?.wind) ? [n(l.wind[0], 0), n(l.wind[1], 0)] : [0.02, 0.01], floor: Math.min(1, Math.max(0, n(l?.floor, 0.3))), contrast: Math.min(0.5, Math.max(0.02, n(l?.contrast, 0.25))),
  }));
}
