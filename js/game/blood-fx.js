// Sang du lot 3j (?sang=reduit ou 1), purement visuel : un InstancedMesh de quadrilatères pour les particules (1 appel), un pour les taches
// au sol (1 appel, atlas de 4 formes générées en code, forme et opacité par instance), cadavres visuels (personnages v2 en pose de mort,
// au plus 6, enfoncés dans le sol à la fin de leur durée ; ils ne sont ni ciblés ni solides : le jeu ne les connaît pas). Le sang suit
// l'étage de son événement : à l'étage du joueur et au rez-de-chaussée, caché à l'étage quand le joueur est en bas.
import * as THREE from 'three';
import { burst, capParticles, corpseSink, corpsesAdd, corpsesStep, deathFor, decalAlpha, decalAtlas, decalsAdd, decalsStep, impactDecals, settings, stepParticles } from '../core/blood.js';

const UP = new THREE.Vector3(0, 1, 0);
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _c = new THREE.Color();

// options : { parent (groupe qui porte le sang : world.dynamic du jeu), cfg (blood.json), level, lookup (jeton -> [r, g, b]), seed,
// lift (étage -> hauteur, défaut 0), corpse(kind, type, facing) -> personnage (création d'un cadavre ; null : aucun), corpseRelease(char) }.
export function createBloodFx(options) {
  const cfg = options.cfg;
  let level = options.level;
  let s = settings(cfg, level);
  const lift = options.lift ?? (() => 0);
  const tokenColor = (token) => {
    const c = options.lookup(token) ?? [122, 10, 10];
    return new THREE.Color().setRGB(c[0] / 255, c[1] / 255, c[2] / 255, THREE.SRGBColorSpace);
  };
  const capP = Math.max(1, settings(cfg, '1').maxParticles);
  const capD = Math.max(1, settings(cfg, '1').maxDecals);
  // Particules : quadrilatères horizontaux, teinte par instance (frais à sec).
  const quad = new THREE.PlaneGeometry(1, 1);
  quad.rotateX(-Math.PI / 2);
  const pMat = new THREE.MeshBasicMaterial({ color: 0xffffff, fog: true });
  const particlesMesh = new THREE.InstancedMesh(quad, pMat, capP);
  particlesMesh.count = 0;
  particlesMesh.frustumCulled = false;
  particlesMesh.name = 'sang-particules';
  // Taches : atlas de formes (alpha), forme et opacité par instance (attributs aShape, aAlpha) ; transparentes, sans écriture de profondeur.
  // L'atlas (quelques dizaines de ms sur téléphone) est calculé hors du démarrage, à la première tache (lot 3m, levier de chargement 1 ;
  // avant : au premier moment libre).
  const atlasSize = [64, 128, 256].includes(cfg.texture?.size) ? cfg.texture.size : 256;
  const tex = new THREE.DataTexture(new Uint8Array(atlasSize * atlasSize * 4), atlasSize, atlasSize, THREE.RGBAFormat);
  let atlasReady = false;
  const ensureAtlas = () => {
    if (atlasReady) return;
    atlasReady = true;
    tex.image.data.set(decalAtlas(atlasSize, cfg.texture?.seed ?? 31).data);
    tex.needsUpdate = true;
  };
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  const dGeo = new THREE.PlaneGeometry(1, 1);
  dGeo.rotateX(-Math.PI / 2);
  const shapeAttr = new THREE.InstancedBufferAttribute(new Float32Array(capD), 1);
  const alphaAttr = new THREE.InstancedBufferAttribute(new Float32Array(capD), 1);
  dGeo.setAttribute('aShape', shapeAttr);
  dGeo.setAttribute('aAlpha', alphaAttr);
  const dMat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  dMat.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aShape;\nattribute float aAlpha;\nvarying float vDecalAlpha;')
      .replace('#include <uv_vertex>', '#include <uv_vertex>\n#ifdef USE_MAP\nvMapUv = vMapUv * 0.5 + vec2(mod(aShape, 2.0), floor(aShape / 2.0)) * 0.5;\n#endif\nvDecalAlpha = aAlpha;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vDecalAlpha;')
      .replace('#include <opaque_fragment>', 'diffuseColor.a *= vDecalAlpha;\n#include <opaque_fragment>');
  };
  const decalsMesh = new THREE.InstancedMesh(dGeo, dMat, capD);
  decalsMesh.count = 0;
  decalsMesh.frustumCulled = false;
  decalsMesh.renderOrder = -1;
  decalsMesh.name = 'sang-taches';
  particlesMesh.visible = false;
  decalsMesh.visible = false;
  options.parent.add(decalsMesh, particlesMesh);

  let time = 0;
  let seed = Math.trunc(Number(options.seed) || 1) * 7919;
  let particles = [];
  let decals = Object.freeze([]);
  let corpses = Object.freeze([]);
  const corpseChars = new Map(); // id -> { char, corpse }
  let nextCorpse = 1;
  const colors = () => {
    pMat.color.copy(tokenColor(s.tint));
    dMat.color.copy(tokenColor(s.tint));
  };
  colors();

  function addParticles(list) {
    particles = capParticles([...particles, ...list], s.maxParticles);
  }
  function addDecals(list) {
    ensureAtlas();
    decals = decalsAdd(decals, list, level, cfg, time, (seed += 1));
  }
  const api = {
    get level() {
      return level;
    },
    setLevel(l) {
      level = l;
      s = settings(cfg, level);
      colors();
      api.reset();
    },
    // Tir non mortel sur un zombie : gerbe dans le sens de la balle et une goutte au sol.
    hit({ x, y, floor = 'rdc', dir = { x: 1, y: 0 } }) {
      if (s.hit <= 0) return;
      addParticles(burst((seed += 1), 'hit', dir, level, cfg, { x, y, floor }));
      addDecals(impactDecals(seed, 'hit', { x, y, floor }, dir, cfg));
    },
    // Mort d'un zombie : gerbe, flaque sous le corps et cadavre visuel (pose de mort jusqu'au bout, puis enfoncement) ; facing : orientation du
    // zombie à sa mort (le cadavre la garde), dir : sens de la balle.
    kill({ x, y, floor = 'rdc', dir = { x: 1, y: 0 }, type = 'marcheur', variant = 0, facing = 0 }) {
      if (s.kill <= 0) return;
      addParticles(burst((seed += 1), 'kill', dir, level, cfg, { x, y, floor }));
      addDecals(impactDecals(seed, 'kill', { x, y, floor }, dir, cfg));
      const anim = deathFor(facing, dir, seed, cfg.corpses?.deaths); // tombe à l'opposé du tireur (en arrière s'il est touché de face)
      const before = new Set(corpses.map((c) => c.id));
      corpses = corpsesAdd(corpses, { id: nextCorpse, x, y, floor, type, variant, anim, born: time, facing }, level, cfg);
      nextCorpse += 1;
      for (const id of before) if (!corpses.some((c) => c.id === id)) release(id);
    },
    // Joueur touché : 4 particules au plus, aucune tache.
    playerHit({ x, y, floor = 'rdc' }) {
      if (s.player <= 0) return;
      addParticles(burst((seed += 1), 'player', { x: 0, y: 0 }, level, cfg, { x, y, floor }));
    },
    // Avance le sang (pas de simulation) : particules, conversion en gouttes, taches expirées, cadavres finis.
    update(dt) {
      time += Math.max(0, Number(dt) || 0);
      const r = stepParticles(particles, dt, cfg);
      particles = r.particles;
      if (r.landed.length) {
        const dr = cfg.decals?.dropSize ?? [1.5, 3.5];
        addDecals(r.landed.map((q) => ({ ...q, size: dr[0] + (dr[1] - dr[0]) * q.shade, kind: 'goutte' })));
      }
      decals = decalsStep(decals, time, level, cfg);
      const before = corpses;
      corpses = corpsesStep(corpses, time, level, cfg);
      for (const c of before) if (!corpses.includes(c)) release(c.id);
    },
    // Écrit les instances et les cadavres (image) ; floor : étage du joueur.
    sync(floor = 'rdc') {
      const shown = (f) => f === floor || f === 'rdc';
      const base = (f) => lift(f) - lift(floor);
      let n = 0;
      for (const q of particles) {
        if (!shown(q.floor)) continue;
        _p.set(q.x, base(q.floor) + q.z, q.y);
        _s.setScalar(q.size);
        _m.compose(_p, _q.identity(), _s);
        particlesMesh.setMatrixAt(n, _m);
        particlesMesh.setColorAt(n, _c.setScalar(0.7 + 0.3 * q.shade));
        n += 1;
      }
      particlesMesh.count = n;
      particlesMesh.visible = n > 0; // vide : ni appel de dessin ni shader compilé (compilé au premier sang)
      particlesMesh.instanceMatrix.needsUpdate = true;
      if (particlesMesh.instanceColor) particlesMesh.instanceColor.needsUpdate = true;
      let k = 0;
      for (const d of decals) {
        if (!shown(d.floor)) continue;
        _p.set(d.x, base(d.floor) + (cfg.decals?.y ?? 0.2), d.y);
        _q.setFromAxisAngle(UP, d.angle);
        _s.set(d.size, 1, d.size);
        _m.compose(_p, _q, _s);
        decalsMesh.setMatrixAt(k, _m);
        shapeAttr.setX(k, d.shape);
        alphaAttr.setX(k, decalAlpha(d, time, level, cfg));
        k += 1;
      }
      decalsMesh.count = k;
      decalsMesh.visible = k > 0;
      decalsMesh.instanceMatrix.needsUpdate = true;
      shapeAttr.needsUpdate = true;
      alphaAttr.needsUpdate = true;
      _q.identity();
      for (const c of corpses) {
        let entry = corpseChars.get(c.id);
        if (!entry && options.corpse) {
          const char = options.corpse(c.type, c.variant);
          if (char) {
            options.parent.add(char.root);
            entry = { char };
            corpseChars.set(c.id, entry);
          }
        }
        if (!entry) continue;
        const sink = corpseSink(c, time, level, cfg);
        const fall = Math.min(1, (time - c.born) / 1.2);
        entry.char.setAnim?.(c.anim, fall, {}, time);
        entry.char.root.position.set(c.x, base(c.floor) - sink * (cfg.corpses?.depth ?? 16), c.y);
        entry.char.root.rotation.y = Math.PI / 2 - c.facing;
        entry.char.root.visible = shown(c.floor);
      }
    },
    stats() {
      const calls = (particlesMesh.count > 0 ? 1 : 0) + (decalsMesh.count > 0 ? 1 : 0);
      return { level, particles: particles.length, decals: decals.length, corpses: corpses.length, corpseMeshes: corpseChars.size, drawnParticles: particlesMesh.count, drawnDecals: decalsMesh.count, calls, triangles: particlesMesh.count * 2 + decalsMesh.count * 2, time };
    },
    // État pur pour les tests (positions et âges).
    snapshot: () => ({ particles: particles.map((p) => ({ ...p })), decals: decals.map((d) => ({ ...d })), corpses: corpses.map((c) => ({ ...c })) }),
    reset() {
      particles = [];
      decals = Object.freeze([]);
      for (const id of [...corpseChars.keys()]) release(id);
      corpses = Object.freeze([]);
      particlesMesh.count = 0;
      decalsMesh.count = 0;
      particlesMesh.visible = false;
      decalsMesh.visible = false;
    },
    dispose() {
      api.reset();
      options.parent.remove(decalsMesh, particlesMesh);
      quad.dispose();
      dGeo.dispose();
      pMat.dispose();
      dMat.dispose();
      tex.dispose();
    },
  };
  function release(id) {
    const entry = corpseChars.get(id);
    if (!entry) return;
    options.parent.remove(entry.char.root);
    options.corpseRelease?.(entry.char);
    corpseChars.delete(id);
  }
  return api;
}
