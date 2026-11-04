// Lot 3g (retour du propriétaire) : feu avec fumée sur une pile de caisses (data/game/maps/<carte>/feux.json). Trois appels de dessin par feu dans le champ (aucun hors du champ) : flammes (points,
// mélange additif), fumée (points) et lueur au sol (disque). Couleurs : jetons --game-fire, --game-fire-edge, --game-smoke (palette.js). Particules à capacité
// fixe, réécrites à chaque image par update(dt) (temps de jeu : la pause les fige) ; aucun hasard (suite pseudo-aléatoire tirée de l'identifiant), aucune horloge.
// Mouvement réduit : le feu est dessiné, immobile. Pas d'ombre, pas de lumière ajoutée (aucun shader des autres matières ne change). Aucun son (lot du son à part).
import * as THREE from 'three';

const FLAMES = 64;
const SMOKE = 64;
// Vent (unités par seconde) : la fumée part vers l'est (la droite de l'écran), de plus en plus vite en montant (retour du propriétaire).
const WIND = 34;

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

// spec : { id, x, z (centre), y (dessus de la pile), w, d (emprise), spots? } ; palette : chaînes « #rrggbb » (fire, fireEdge, smoke).
// Lot 5a : spots = foyers d'un feu groupé ([{ x, z, y, w, d }], voiture en flammes : capot et habitacle) : les mêmes particules (64 flammes, 64 fumées) naissent
// tour à tour sur chaque foyer ; glow: false retire la lueur au sol (un appel de dessin de moins). Sans spots, le feu est identique à celui du lot 3g.
// Lot 5a-F : flames: false = fumée seule (un appel de dessin), smoke: { alpha, color, rise } = fumée plus légère et plus lente (épave refroidie).
export function createFire(spec, palette, { reduced = false, scale = 1, glow: withGlow = true, flames: withFlames = true, smoke: smokeOpts = null } = {}) {
  const k0 = Math.max(0.2, Math.min(2, Number(scale) || 1)); // taille du feu (bidon : plus petit)
  const group = new THREE.Group();
  group.name = `feu-${spec.id}`;
  const rnd = sequence(spec.id);
  const core = new THREE.Color(palette.fire);
  const edge = new THREE.Color(palette.fireEdge);
  const smokeColor = new THREE.Color(smokeOpts?.color ?? palette.smoke);
  const smokeAlpha = Number.isFinite(smokeOpts?.alpha) ? smokeOpts.alpha : 0.38;
  const smokeRise = Number.isFinite(smokeOpts?.rise) ? smokeOpts.rise : 1;
  const spread = { x: Math.max(8, spec.w * 0.38), z: Math.max(8, spec.d * 0.38) };
  const spots = Array.isArray(spec.spots) && spec.spots.length > 0 ? spec.spots.map((q) => ({ x: q.x, z: q.z, y: q.y, sx: Math.max(6, q.w * 0.38), sz: Math.max(6, q.d * 0.38) })) : null;
  let turn = 0;
  let spotLimit = spots ? spots.length : 1; // lot 5b : foyers utilisés (préréglage Faible : un seul foyer pour la voiture)

  const makePoints = (n, blending) => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    geometry.setAttribute('aSize', new THREE.BufferAttribute(new Float32Array(n), 1));
    geometry.setAttribute('aColor', new THREE.BufferAttribute(new Float32Array(n * 4), 4));
    const material = new THREE.ShaderMaterial({ vertexShader: POINT_VERTEX, fragmentShader: POINT_FRAGMENT, uniforms: { uScale: { value: 400 } }, transparent: true, depthWrite: false, blending, premultipliedAlpha: true });
    // Sphère englobante fixe (toutes les positions possibles) : le feu hors du champ n'est pas dessiné (aucun appel), sans la recalculer à chaque image.
    geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(spec.x + 180, spec.y + 160, spec.z), 420);
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
  if (!withFlames) group.remove(flames);
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
  if (withGlow) group.add(glow);

  // Particules : âge, durée, départ, vitesse et dérive ; une particule qui finit renaît (même suite, donc même feu à chaque partie).
  const born = (p, life) => {
    p.age = 0;
    p.life = life;
    if (spots) {
      const q = spots[turn % Math.min(spots.length, spotLimit)];
      turn += 1;
      p.base = q.y;
      p.x = q.x + (rnd() * 2 - 1) * q.sx;
      p.z = q.z + (rnd() * 2 - 1) * q.sz;
    } else {
      p.base = spec.y;
      p.x = spec.x + (rnd() * 2 - 1) * spread.x;
      p.z = spec.z + (rnd() * 2 - 1) * spread.z;
    }
    p.vx = (rnd() * 2 - 1) * 6;
    p.vz = (rnd() * 2 - 1) * 6;
    p.phase = rnd() * Math.PI * 2;
  };
  const flameParts = Array.from({ length: FLAMES }, () => ({}));
  const smokeParts = Array.from({ length: SMOKE }, () => ({}));
  flameParts.forEach((p) => { born(p, 0.55 + rnd() * 0.5); p.age = rnd() * p.life; p.rise = (70 + rnd() * 50) * k0; });
  smokeParts.forEach((p) => { born(p, 4 + rnd() * 2.5); p.age = rnd() * p.life; p.rise = (24 + rnd() * 18) * k0 * smokeRise; });
  const tmp = new THREE.Color();
  let glowTime = 0;

  const write = () => {
    const fp = flames.geometry.attributes.position.array;
    const fs = flames.geometry.attributes.aSize.array;
    const fc = flames.geometry.attributes.aColor.array;
    flameParts.forEach((p, i) => {
      const k = p.age / p.life;
      fp[i * 3] = p.x + p.vx * p.age + Math.sin(p.phase + p.age * 9) * 4 * k + WIND * 0.25 * p.age * k;
      fp[i * 3 + 1] = p.base + 2 + p.rise * p.age;
      fp[i * 3 + 2] = p.z + p.vz * p.age;
      fs[i] = 52 * k0 * (1 - k * 0.7);
      tmp.copy(core).lerp(edge, Math.min(1, k * 1.4));
      fc.set([tmp.r, tmp.g, tmp.b, (1 - k) * 0.85], i * 4);
    });
    const sp = smoke.geometry.attributes.position.array;
    const ss = smoke.geometry.attributes.aSize.array;
    const sc = smoke.geometry.attributes.aColor.array;
    smokeParts.forEach((p, i) => {
      const k = p.age / p.life;
      sp[i * 3] = p.x + p.vx * p.age * 1.6 + Math.sin(p.phase + p.age * 1.3) * 8 + WIND * p.age * (0.4 + k);
      sp[i * 3 + 1] = p.base + 24 + p.rise * p.age;
      sp[i * 3 + 2] = p.z + p.vz * p.age * 1.6;
      ss[i] = (34 + 120 * k) * k0;
      sc.set([smokeColor.r, smokeColor.g, smokeColor.b, Math.sin(Math.PI * Math.min(1, k * 1.15)) * smokeAlpha], i * 4);
    });
    for (const pts of [flames, smoke]) for (const name of ['position', 'aSize', 'aColor']) pts.geometry.attributes[name].needsUpdate = true;
    glowMaterial.uniforms.uStrength.value = 0.3 + 0.06 * Math.sin(glowTime * 11) + 0.04 * Math.sin(glowTime * 23);
  };

  const step = (dt) => {
    for (const p of flameParts) {
      p.age += dt;
      if (p.age >= p.life) born(p, 0.55 + rnd() * 0.5);
    }
    for (const p of smokeParts) {
      p.age += dt;
      if (p.age >= p.life) born(p, 4 + rnd() * 2.5);
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
    stats: () => ({ id: spec.id, flames: withFlames ? FLAMES : 0, smoke: SMOKE, x: spec.x, z: spec.z, y: spec.y, time: glowTime, spots: spots ? spots.length : 1, glow: withGlow, drawn: { flames: withFlames ? Math.min(FLAMES, flames.geometry.drawRange.count) : 0, smoke: Math.min(SMOKE, smoke.geometry.drawRange.count), spots: spots ? Math.min(spots.length, spotLimit) : 1, glow: withGlow && glow.visible, visible: group.visible } }),
    // Lot 5b (préréglages) : part des particules dessinées (0,1 à 1 : plage de dessin, aucune recréation), foyers utilisés, lueur, feu affiché ou non.
    // Valeurs par défaut (1, tous les foyers, lueur, affiché) : rien ne change. Modifiable à chaud ; un feu caché n'est plus mis à jour (world.js).
    setOptions({ particles = 1, spots: n = null, glow: g = true, visible = true } = {}) {
      const k = Math.max(0.1, Math.min(1, Number(particles) || 1));
      const nf = Math.round(FLAMES * k);
      const ns = Math.round(SMOKE * k);
      if (flames.geometry.drawRange.count !== (k === 1 ? Infinity : nf)) flames.geometry.setDrawRange(0, k === 1 ? Infinity : nf);
      if (smoke.geometry.drawRange.count !== (k === 1 ? Infinity : ns)) smoke.geometry.setDrawRange(0, k === 1 ? Infinity : ns);
      if (spots) spotLimit = Number.isInteger(n) && n >= 1 ? Math.min(spots.length, n) : spots.length;
      if (glow.visible !== (g !== false)) glow.visible = g !== false;
      if (group.visible !== (visible !== false)) group.visible = visible !== false;
    },
    dispose() {
      for (const o of [flames, smoke, glow]) {
        o.geometry.dispose();
        o.material.dispose();
      }
    },
  };
}
