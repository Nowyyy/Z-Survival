// Lot 3g (retour du propriétaire) : feu avec fumée sur une pile de caisses (data/game/maps/<carte>/feux.json). Trois appels de dessin par feu dans le champ (aucun hors du champ) : flammes (points,
// mélange additif), fumée (points) et lueur au sol (disque). Couleurs : jetons --game-fire, --game-fire-edge, --game-smoke (palette.js). Particules à capacité
// fixe, réécrites à chaque image par update(dt) (temps de jeu : la pause les fige) ; aucun hasard (suite pseudo-aléatoire tirée de l'identifiant), aucune horloge.
// Mouvement réduit : le feu est dessiné, immobile. Pas d'ombre, pas de lumière ajoutée (aucun shader des autres matières ne change).
import * as THREE from 'three';

const FLAMES = 40;
const SMOKE = 26;

// Suite pseudo-aléatoire déterministe (entier 32 bits) : chaque appel donne un nombre de [0, 1[.
function sequence(text) {
  let h = 2166136261;
  for (const ch of String(text)) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822519);
    h = Math.imul(h ^ (h >>> 13), 3266489917);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  };
}

const POINT_VERTEX = `
attribute float aSize;
attribute vec4 aColor;
uniform float uScale;
varying vec4 vColor;
void main() {
  vColor = aColor;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = aSize * uScale / max(-mv.z, 1.0);
  gl_Position = projectionMatrix * mv;
}`;
const POINT_FRAGMENT = `
varying vec4 vColor;
void main() {
  float d = length(gl_PointCoord - 0.5) * 2.0;
  float a = vColor.a * smoothstep(1.0, 0.15, d);
  if (a < 0.01) discard;
  gl_FragColor = vec4(vColor.rgb * a, a);
}`;
const GLOW_VERTEX = `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;
const GLOW_FRAGMENT = `
uniform vec3 uColor;
uniform float uStrength;
varying vec2 vUv;
void main() {
  float d = length(vUv - 0.5) * 2.0;
  float a = uStrength * smoothstep(1.0, 0.0, d);
  gl_FragColor = vec4(uColor * a, a);
}`;

// spec : { id, x, z (centre), y (dessus de la pile), w, d (emprise) } ; palette : chaînes « #rrggbb » (fire, fireEdge, smoke).
export function createFire(spec, palette, { reduced = false } = {}) {
  const group = new THREE.Group();
  group.name = `feu-${spec.id}`;
  const rnd = sequence(spec.id);
  const core = new THREE.Color(palette.fire);
  const edge = new THREE.Color(palette.fireEdge);
  const smokeColor = new THREE.Color(palette.smoke);
  const spread = { x: Math.max(8, spec.w * 0.32), z: Math.max(8, spec.d * 0.32) };

  const makePoints = (n, blending) => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    geometry.setAttribute('aSize', new THREE.BufferAttribute(new Float32Array(n), 1));
    geometry.setAttribute('aColor', new THREE.BufferAttribute(new Float32Array(n * 4), 4));
    const material = new THREE.ShaderMaterial({ vertexShader: POINT_VERTEX, fragmentShader: POINT_FRAGMENT, uniforms: { uScale: { value: 400 } }, transparent: true, depthWrite: false, blending, premultipliedAlpha: true });
    // Sphère englobante fixe (toutes les positions possibles) : le feu hors du champ n'est pas dessiné (aucun appel), sans la recalculer à chaque image.
    geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(spec.x, spec.y + 120, spec.z), 240);
    const points = new THREE.Points(geometry, material);
    points.onBeforeRender = (renderer, scene, camera) => {
      const h = renderer.getDrawingBufferSize(new THREE.Vector2()).y;
      material.uniforms.uScale.value = h / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov ?? 75) / 2));
    };
    group.add(points);
    return points;
  };
  const flames = makePoints(FLAMES, THREE.AdditiveBlending);
  flames.name = 'flammes';
  const smoke = makePoints(SMOKE, THREE.CustomBlending);
  smoke.material.blendSrc = THREE.OneFactor;
  smoke.material.blendDst = THREE.OneMinusSrcAlphaFactor;
  smoke.name = 'fumee';
  smoke.renderOrder = 1;

  const glowMaterial = new THREE.ShaderMaterial({ vertexShader: GLOW_VERTEX, fragmentShader: GLOW_FRAGMENT, uniforms: { uColor: { value: edge.clone() }, uStrength: { value: 0.35 } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  const glowSize = Math.max(spec.w, spec.d) * 2.6;
  const glow = new THREE.Mesh(new THREE.PlaneGeometry(glowSize, glowSize).rotateX(-Math.PI / 2), glowMaterial);
  glow.position.set(spec.x, 0.8, spec.z);
  glow.name = 'lueur';
  group.add(glow);

  // Particules : âge, durée, départ, vitesse et dérive ; une particule qui finit renaît (même suite, donc même feu à chaque partie).
  const born = (p, life) => {
    p.age = 0;
    p.life = life;
    p.x = spec.x + (rnd() * 2 - 1) * spread.x;
    p.z = spec.z + (rnd() * 2 - 1) * spread.z;
    p.vx = (rnd() * 2 - 1) * 6;
    p.vz = (rnd() * 2 - 1) * 6;
    p.phase = rnd() * Math.PI * 2;
  };
  const flameParts = Array.from({ length: FLAMES }, () => ({}));
  const smokeParts = Array.from({ length: SMOKE }, () => ({}));
  flameParts.forEach((p) => { born(p, 0.45 + rnd() * 0.45); p.age = rnd() * p.life; p.rise = 45 + rnd() * 35; });
  smokeParts.forEach((p) => { born(p, 2.4 + rnd() * 1.4); p.age = rnd() * p.life; p.rise = 22 + rnd() * 16; });
  const tmp = new THREE.Color();
  let glowTime = 0;

  const write = () => {
    const fp = flames.geometry.attributes.position.array;
    const fs = flames.geometry.attributes.aSize.array;
    const fc = flames.geometry.attributes.aColor.array;
    flameParts.forEach((p, i) => {
      const k = p.age / p.life;
      fp[i * 3] = p.x + p.vx * p.age + Math.sin(p.phase + p.age * 9) * 2.5 * k;
      fp[i * 3 + 1] = spec.y + 2 + p.rise * p.age;
      fp[i * 3 + 2] = p.z + p.vz * p.age;
      fs[i] = 26 * (1 - k * 0.75);
      tmp.copy(core).lerp(edge, Math.min(1, k * 1.4));
      fc.set([tmp.r, tmp.g, tmp.b, (1 - k) * 0.85], i * 4);
    });
    const sp = smoke.geometry.attributes.position.array;
    const ss = smoke.geometry.attributes.aSize.array;
    const sc = smoke.geometry.attributes.aColor.array;
    smokeParts.forEach((p, i) => {
      const k = p.age / p.life;
      sp[i * 3] = p.x + p.vx * p.age * 1.6 + Math.sin(p.phase + p.age * 1.3) * 6;
      sp[i * 3 + 1] = spec.y + 24 + p.rise * p.age;
      sp[i * 3 + 2] = p.z + p.vz * p.age * 1.6;
      ss[i] = 28 + 70 * k;
      sc.set([smokeColor.r, smokeColor.g, smokeColor.b, Math.sin(Math.PI * Math.min(1, k * 1.15)) * 0.42], i * 4);
    });
    for (const pts of [flames, smoke]) for (const name of ['position', 'aSize', 'aColor']) pts.geometry.attributes[name].needsUpdate = true;
    glowMaterial.uniforms.uStrength.value = 0.3 + 0.06 * Math.sin(glowTime * 11) + 0.04 * Math.sin(glowTime * 23);
  };

  const step = (dt) => {
    for (const p of flameParts) {
      p.age += dt;
      if (p.age >= p.life) born(p, 0.45 + rnd() * 0.45);
    }
    for (const p of smokeParts) {
      p.age += dt;
      if (p.age >= p.life) born(p, 2.4 + rnd() * 1.4);
    }
    glowTime += dt;
  };
  write();

  return {
    group,
    // Avance de dt secondes de jeu (0 : rien ne bouge) ; mouvement réduit : immobile.
    update(dt) {
      const d = reduced ? 0 : Math.min(0.1, Math.max(0, Number(dt) || 0));
      if (d === 0) return;
      step(d);
      write();
    },
    stats: () => ({ id: spec.id, flames: FLAMES, smoke: SMOKE, x: spec.x, z: spec.z, y: spec.y, time: glowTime }),
    dispose() {
      for (const o of [flames, smoke, glow]) {
        o.geometry.dispose();
        o.material.dispose();
      }
    },
  };
}
