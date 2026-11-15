// Lot 5k : lumières dynamiques des lampes à huile (option « Lumière des lampes » : Dynamique). Module importé seulement en « eclairage ».
// Un nombre fixe de PointLight (option « Lumières simultanées »), toujours visibles (une lumière cachée sortirait de la liste et changerait les
// programmes), dans la scène (jamais dans un groupe d'étage) ; à chaque image : les sources de l'étage affiché (et de l'extérieur) dont la lumière
// touche le champ de la caméra, les plus proches du joueur (js/core/lamps.js), avec fondu d'entrée et de sortie et vacillement lent (temps de jeu ;
// constant sous prefers-reduced-motion). Lot 5k-G (retours du propriétaire) : les feux (caisses, voiture, bidons) sont aussi des sources (couleur
// --game-fire-edge) ; les « Ombres des lumières » premières lumières (les sources les plus proches) projettent des ombres (carte cubique, mise à jour
// seulement quand elles éclairent) ; la lune (et ses ombres) est réduite par `lune`, l'ambiante par max(ambiance, plancher). Les taches de sang
// (matière sans éclairage) suivent l'ambiante. Tout est rendu tel quel à la sortie (dispose). Rien ici ne touche la logique du jeu.
import * as THREE from 'three';
import { baseFactors, createMoonLevel, flicker, lampPhase, moonBeam, moonSettled, niveauLune, parseLightConfig, selectLamps, stepMoonLevel, stepSlots } from '../core/lamps.js';

const BLOOD = ['sang-particules', 'sang-taches'];
// Sous ?test=1 seulement : ?lampgain=0..1 multiplie l'intensité des sources (mesure de l'étage superposé : avec et sans elles, base identique).
// Lot 5l : ?test=1 n'est pris en compte que sur les canaux de débogage (balise zs-canal de jeu.html ; même liste que CANAUX_DEBUG de js/core/graphics.js,
// vérifié par tests/unit/debug-canal.test.js : ce module de la zone « rendu » n'importe pas graphics-boot.js, zone « graphismes », qui dépend de lui).
const DEBUG_CANAUX = ['source', 'dev', 'release'];
const debugCanal = () => {
  try {
    return DEBUG_CANAUX.includes(globalThis.document?.querySelector?.('meta[name="zs-canal"]')?.getAttribute('content'));
  } catch {
    return false;
  }
};
const testGain = () => {
  const q = new URLSearchParams(globalThis.location?.search ?? '');
  const g = Number(q.get('lampgain'));
  return q.get('test') === '1' && debugCanal() && q.has('lampgain') && g >= 0 && g <= 1 ? g : 1;
};

// scene, ambient, sun : de world.js ; lamps : lampes.world.json (lampes) ; fires : feux sources ({ id, floor : rdc | etage | exterieur, light, portee }) ;
// json : lumieres.json ; palette : readPalette() ; count : lumières (2, 4, 6) ; shadows : celles qui projettent des ombres (0, 1, 2) ; lift : hauteur d'étage.
// occluders : boîtes des murs, piliers et meubles par étage ({ x0, x1, y0, y1, z0, z1, floor }, repère de l'étage) ; groups : groupes du monde.
// Lot 5k-H : windows ({ x, y, side, floor }), moon (render.json → light.sunOffset), opening ({ width, sill, lintel, thickness }) : rayons de lune.
// Lot 5k-C3 : planks : dernier état des fenêtres reçu par le dessin des planches (windows-mesh.js, sync), lu seulement ; ensuite syncPlanks.
export function createLights({ scene, ambient, sun, lamps, fires = [], json, palette, count = 4, shadows = 0, lift = 180, reduced = false, gain = testGain(), occluders = [], groups = null, windows = [], moon = null, opening = null, planks = null }) {
  const cfg = parseLightConfig(json);
  const lampColor = new THREE.Color(palette.lampLight ?? palette.fire);
  const fireColor = new THREE.Color(palette.fireEdge ?? palette.fire);
  const fireCfg = { vacillement: cfg.feux.vacillement };
  const group = new THREE.Group();
  group.name = 'lumieres-lampes';
  scene.add(group);
  const base = { ambient: ambient.intensity, sun: sun.intensity };
  const f = baseFactors(cfg);
  ambient.intensity = base.ambient * f.ambient;
  sun.intensity = base.sun * f.sun;
  const blood = [];
  for (const name of BLOOD) {
    const m = scene.getObjectByName(name)?.material;
    if (m?.color) {
      blood.push([m, m.color.clone()]);
      m.color.multiplyScalar(f.ambient);
    }
  }
  const sources = [...lamps.map((l) => ({ ...l, kind: 'lampe' })), ...fires.map((s) => ({ ...s, kind: 'feu' }))];
  const candidates = {
    rdc: sources.filter((s) => s.floor === 'rdc' || s.floor === 'exterieur'),
    etage: sources.filter((s) => s.floor === 'etage' || s.floor === 'exterieur'),
  };
  const byId = new Map(sources.map((s) => {
    const fire = s.kind === 'feu';
    // Lot 5k-H (retour du propriétaire : rayon trop petit) : portée libre (`distance` des données) quand l'autre étage n'est pas dessiné ; portée
    // sûre (min avec `portee`) quand il l'est (à l'étage, ou dans l'escalier). Une source de l'étage garde toujours sa portée sûre (le
    // rez-de-chaussée se voit d'en haut par les trous et hors du sol de l'étage).
    const free = fire ? cfg.feux.distance : cfg.distance;
    const safe = Math.min(free, s.portee);
    return [s.id, { src: s, fire, safe, free: s.floor === 'etage' ? safe : free, reach: safe, phase: lampPhase(s.id), intensity: fire ? cfg.feux.intensite : cfg.intensite }];
  }));
  // Volumes d'ombre (lot 5k-G) : pour chaque source intérieure, les boîtes des murs, piliers et meubles à sa portée, fusionnées dans un maillage
  // invisible (ni couleur ni profondeur) qui ne projette que les ombres des lumières : montré seulement quand sa source a une lumière à ombre. Les
  // grands maillages du décor ne projettent rien pour les lampes (six faces de carte cubique chacun : budget de triangles) ; les murs arrêtent la lumière.
  const proxyMaterial = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false });
  const proxies = new Map();
  if (groups) {
    for (const [id, e] of byId) {
      const src = e.src;
      if (!groups[src.floor] || src.floor === 'exterieur') continue;
      const near = occluders.filter((b) => b.floor === src.floor && Math.hypot(Math.max(b.x0 - src.light.x, 0, src.light.x - b.x1), Math.max(b.z0 - src.light.y, 0, src.light.y - b.z1)) <= e.free);
      if (near.length === 0) continue;
      const pos = [];
      const quad = (a, b, c, d) => pos.push(...a, ...b, ...c, ...a, ...c, ...d);
      for (const b0 of near) {
        // Lot 5k-I (retour du propriétaire : le dessus des meubles bas restait sombre) : les meubles bas (moins de 100 de haut ; leur boîte de
        // collision dépasse souvent leur dessin) ne portent pas d'ombre de lampe ; murs et piliers : volume en retrait de 2 unités.
        if (b0.y1 - b0.y0 < 100) continue;
        const inset = Math.min(2, (b0.x1 - b0.x0) / 4, (b0.z1 - b0.z0) / 4);
        const b = { x0: b0.x0 + inset, x1: b0.x1 - inset, z0: b0.z0 + inset, z1: b0.z1 - inset, y0: b0.y0, y1: b0.y1 - 2 };
        const P = (x, y, z) => [x ? b.x1 : b.x0, y ? b.y1 : b.y0, z ? b.z1 : b.z0];
        quad(P(0, 1, 0), P(0, 1, 1), P(1, 1, 1), P(1, 1, 0)); // dessus
        quad(P(0, 0, 0), P(1, 0, 0), P(1, 1, 0), P(0, 1, 0));
        quad(P(0, 0, 1), P(0, 1, 1), P(1, 1, 1), P(1, 0, 1));
        quad(P(0, 0, 0), P(0, 1, 0), P(0, 1, 1), P(0, 0, 1));
        quad(P(1, 0, 0), P(1, 0, 1), P(1, 1, 1), P(1, 1, 0));
      }
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      geometry.computeBoundingSphere();
      const mesh = new THREE.Mesh(geometry, proxyMaterial);
      mesh.name = `ombre-${id}`;
      mesh.castShadow = true;
      mesh.receiveShadow = false;
      mesh.visible = false;
      mesh.userData.floor = src.floor;
      groups[src.floor].add(mesh);
      proxies.set(id, mesh);
    }
  }
  // Lot 5k-H (retour du propriétaire) : la lune continue d'éclairer par les fenêtres du côté où ses rayons tapent : taches de lumière lunaire au sol
  // (projection de chaque ouverture le long des rayons, allongée par fenetres.etirement), additives, plus claires près de la fenêtre ; un maillage
  // par étage, sans ombre, créé une fois ; la lune elle-même reste faible (`lune`) et ne projette pas d'ombre.
  // Lot 5k-C3 (complément du propriétaire) : la lumière de lune de chaque fenêtre baisse avec ses planches posées (niveauLune, js/core/lamps.js),
  // avec un fondu en temps de jeu (stepMoonLevel). Couleur de chaque sommet = couleur pleine × niveau de sa fenêtre : le mélange additif de
  // Three.js 0.186.1 (sans alpha prémultiplié) fait src.rgb × src.a + dst, donc multiplier la couleur équivaut à une opacité par sommet, sans
  // attribut à 4 composantes (USE_COLOR_ALPHA : un programme de plus) ; tampons créés une fois, réécrits seulement pendant un fondu. Seul le
  // maillage de l'étage affiché est dessiné (celui de l'autre étage est caché : rien de plus qu'avant ; Three.js dessine une matière transparente
  // double face en deux passes, comme avant ce lot).
  const patches = [];
  const moonEntries = [];
  const lp = cfg.lunePlanches;
  let moonMoving = false;
  if (groups && moon && opening && cfg.fenetres.intensite > 0) {
    const moonColor = new THREE.Color(palette.sun ?? palette.ambient);
    const stretch = cfg.fenetres.etirement;
    const scaled = { x: moon.x * stretch, y: moon.y, z: moon.z * stretch };
    for (const floor of ['rdc', 'etage']) {
      if (!groups[floor]) continue;
      const pos = [];
      const col = [];
      const mine = [];
      for (const w of windows.filter((q) => q.floor === floor)) {
        const entry = { id: w.id, floor, mesh: null, start: col.length, end: col.length, st: createMoonLevel(1), planks: -1, max: null, target: 1, base: null, colors: null, attr: null, cx: null, cy: null };
        mine.push(entry);
        const beam = moonBeam(w, scaled, opening);
        if (!beam) continue;
        // Centre de la tache (moyenne pondérée par la lumière) : mesures à l'écran des tests.
        const wsum = beam.points.reduce((n, q) => n + q.w, 0) || 1;
        entry.cx = beam.points.reduce((n, q) => n + q.x * q.w, 0) / wsum;
        entry.cy = beam.points.reduce((n, q) => n + q.y * q.w, 0) / wsum;
        for (const tri of beam.triangles) {
          for (const k of tri) {
            const p = beam.points[k];
            pos.push(p.x, 0.6, p.y);
            col.push(moonColor.r * cfg.fenetres.intensite * p.w, moonColor.g * cfg.fenetres.intensite * p.w, moonColor.b * cfg.fenetres.intensite * p.w);
          }
        }
        entry.end = col.length;
      }
      moonEntries.push(...mine);
      if (pos.length === 0) continue;
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      geometry.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
      geometry.computeBoundingSphere();
      const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }));
      mesh.name = `lune-fenetres-${floor}`;
      mesh.userData.floor = floor;
      mesh.renderOrder = -1;
      groups[floor].add(mesh);
      patches.push(mesh);
      const base = Float32Array.from(col);
      for (const e of mine) {
        e.mesh = mesh;
        e.base = base;
        e.attr = geometry.attributes.color;
        e.colors = e.attr.array;
      }
    }
  }
  // Couleurs d'une fenêtre au niveau courant (aucune allocation).
  const paintMoon = (e) => {
    if (e.end === e.start || !e.colors) return;
    const lv = e.st.niveau;
    for (let k = e.start; k < e.end; k += 1) e.colors[k] = e.base[k] * lv;
    e.attr.needsUpdate = true;
  };
  // État des fenêtres ({ windows: { id: { planks, maxPlanks } } }) : celui que reçoit le dessin des planches ; seules les planches posées comptent.
  // Première lecture d'une fenêtre : niveau pris d'un coup ; ensuite, fondu. Aucune allocation ; rien n'est écrit dans l'état.
  const syncPlanks = (state) => {
    const ws = state?.windows;
    if (!ws) return;
    for (let i = 0; i < moonEntries.length; i += 1) {
      const e = moonEntries[i];
      const w = ws[e.id];
      if (!w) continue;
      const n = Math.max(0, Math.floor(Number(w.planks) || 0));
      const max = Number(w.maxPlanks);
      if (n === e.planks && max === e.max) continue;
      const first = e.planks < 0;
      e.planks = n;
      e.max = max;
      e.target = niveauLune(n, max, lp.minimum);
      if (first) {
        e.st.niveau = e.target;
        e.st.depart = e.target;
        e.st.cible = e.target;
        e.st.t = 0;
        paintMoon(e);
      } else moonMoving = true;
    }
  };
  const visible = [];
  const wanted = [];
  const wantedShadow = [];
  const current = [];
  const wantedPlain = [];
  const sphere = new THREE.Sphere();
  let lights = [];
  let slots = [];
  let nShadow = 0;
  let time = 0;
  let floorNow = null;
  const build = (n, s) => {
    for (const l of lights) {
      group.remove(l);
      l.dispose?.();
    }
    nShadow = Math.min(n, Math.max(0, s));
    lights = Array.from({ length: n }, (_, i) => {
      const p = new THREE.PointLight(lampColor, 0, cfg.distance, cfg.decroissance);
      p.castShadow = i < nShadow;
      if (p.castShadow) {
        p.shadow.mapSize.set(cfg.ombres.taille, cfg.ombres.taille);
        p.shadow.bias = cfg.ombres.biais;
        p.shadow.camera.near = 2;
      }
      p.name = `lumiere-lampe-${i + 1}`;
      group.add(p);
      return p;
    });
    slots = lights.map(() => ({ id: null, w: 0 }));
  };
  build([2, 4, 6].includes(count) ? count : cfg.max, [0, 1, 2].includes(shadows) ? shadows : 0);
  syncPlanks(planks);
  const groupY = (floor, elevation) => (floor === 'etage' ? lift : 0) - elevation;
  const shadowSlots = () => slots.slice(0, nShadow);
  const plainSlots = () => slots.slice(nShadow);

  return {
    config: cfg,
    get count() {
      return lights.length;
    },
    get shadows() {
      return nShadow;
    },
    // Nombre de lumières (2, 4 ou 6) et de lumières à ombre (0, 1, 2) : les programmes changent ; l'appelant précompile (renderer.compile).
    setCount(n, s = nShadow) {
      const nn = [2, 4, 6].includes(n) ? n : lights.length;
      const ss = [0, 1, 2].includes(s) ? Math.min(nn, s) : nShadow;
      if (nn === lights.length && ss === nShadow) return false;
      build(nn, ss);
      return true;
    },
    // À chaque image : dt (temps de jeu), joueur (x, y), étage affiché, hauteur du monde (setElevation), champ de la caméra (Frustum ou null).
    // upper : l'étage est dessiné (world.js : groups.etage.visible) ; sinon les sources du rez-de-chaussée et de l'extérieur ont leur portée libre.
    frame(dt, px, py, floor, elevation, frustum, upper = true) {
      for (const e of byId.values()) e.reach = upper ? e.safe : e.free;
      const step = Math.min(0.1, Math.max(0, Number(dt) || 0));
      time += step;
      // Changement d'étage : les lumières de l'autre étage s'éteignent aussitôt (jamais de lumière d'un étage sur l'autre ; l'extérieur reste).
      if (floor !== floorNow) {
        for (const s of slots) {
          const fl = s.id === null ? null : byId.get(s.id)?.src.floor;
          if (fl !== null && fl !== floor && fl !== 'exterieur') {
            s.id = null;
            s.w = 0;
          }
        }
        floorNow = floor;
        for (let i = 0; i < patches.length; i += 1) patches[i].visible = patches[i].userData.floor === floor; // lot 5k-C3 : la lune de l'étage affiché seulement
      }
      // Lot 5k-C3 : fondu des niveaux de lune (seulement pendant un fondu ; à l'état stable, aucun travail).
      if (moonMoving) {
        let moving = false;
        for (let i = 0; i < moonEntries.length; i += 1) {
          const e = moonEntries[i];
          if (moonSettled(e.st, e.target)) continue;
          if (stepMoonLevel(e.st, e.target, step, lp.fondu)) paintMoon(e);
          if (!moonSettled(e.st, e.target)) moving = true;
        }
        moonMoving = moving;
      }
      const list = candidates[floor] ?? [];
      visible.length = list.length;
      for (let i = 0; i < list.length; i += 1) {
        const l = list[i];
        sphere.center.set(l.light.x, groupY(l.floor, elevation) + l.light.h, l.light.y);
        sphere.radius = byId.get(l.id).reach;
        visible[i] = frustum ? frustum.intersectsSphere(sphere) : true;
      }
      // Les plus proches d'abord : les premières vont aux lumières à ombre, les suivantes aux autres (chaque réserve garde ses emplacements et
      // son fondu ; une source qui change de réserve s'éteint dans l'une pendant qu'elle s'allume dans l'autre).
      current.length = 0;
      for (const sl of slots) if (sl.id !== null && sl.w > 0) current.push(sl.id);
      selectLamps(wanted, list, visible, px, py, lights.length, cfg.distanceActivation, current, cfg.selection.maintien);
      wantedShadow.length = 0;
      wantedPlain.length = 0;
      for (let i = 0; i < wanted.length; i += 1) (i < nShadow ? wantedShadow : wantedPlain).push(wanted[i]);
      if (nShadow > 0) stepSlots(shadowSlots(), wantedShadow, step, cfg.fondu);
      stepSlots(plainSlots(), wantedPlain, step, cfg.fondu);
      for (const m of proxies.values()) m.userData.on = false;
      for (let i = 0; i < nShadow; i += 1) {
        const m = slots[i].id === null ? null : proxies.get(slots[i].id);
        if (m) m.userData.on = true;
      }
      for (const m of proxies.values()) if (m.visible !== m.userData.on) m.visible = m.userData.on;
      for (let i = 0; i < lights.length; i += 1) {
        const s = slots[i];
        const p = lights[i];
        const e = s.id === null ? null : byId.get(s.id);
        if (!e) {
          if (p.intensity !== 0) p.intensity = 0;
          if (p.castShadow && p.shadow.autoUpdate) p.shadow.autoUpdate = false; // ombre inutile : carte gardée, pas redessinée
          continue;
        }
        if (p.castShadow && !p.shadow.autoUpdate) p.shadow.autoUpdate = true;
        p.position.set(e.src.light.x, groupY(e.src.floor, elevation) + e.src.light.h, e.src.light.y);
        p.distance = e.reach;
        p.color.copy(e.fire ? fireColor : lampColor);
        p.intensity = e.intensity * gain * s.w * flicker(time, e.phase, e.fire ? fireCfg : cfg, reduced);
      }
    },
    syncPlanks,
    // Lot 5k-C3 (tests) : taches de lune de l'étage affiché : fenêtre, centre au sol (repère du jeu).
    moonPatches: () => moonEntries.filter((e) => e.floor === floorNow && e.end > e.start).map((e) => ({ fenetre: e.id, x: e.cx, y: e.cy })),
    // Lot 5k-C3 (tests) : fenêtres de l'étage affiché : planches posées lues et niveau de lune (part de la pleine lumière).
    moonState: () => moonEntries.filter((e) => e.floor === floorNow).map((e) => ({ fenetre: e.id, plancheesPosees: e.planks < 0 ? null : e.planks, niveau: Math.round(e.st.niveau * 10000) / 10000 })),
    stats: () => ({ moon: patches.map((m) => [m.userData.floor, m.geometry.attributes.position.count / 3]), moonDrawn: patches.filter((m) => m.visible).map((m) => m.userData.floor), moonMoving, count: lights.length, shadows: nShadow, slots: slots.map((s) => ({ id: s.id, w: Math.round(s.w * 1000) / 1000 })), intensities: lights.map((p) => Math.round(p.intensity * 1000) / 1000), positions: lights.map((p) => [p.position.x, p.position.y, p.position.z]), distances: lights.map((p) => p.distance), castShadow: lights.map((p) => p.castShadow), proxies: [...proxies].filter(([, m]) => m.visible).map(([id, m]) => [id, m.geometry.attributes.position.count / 3]), sources: { lampes: lamps.length, feux: fires.map((s) => s.id) }, ambient: ambient.intensity, sun: sun.intensity, base: { ...base }, factors: { ...f }, time: Math.round(time * 1000) / 1000, reduced }),
    dispose() {
      scene.remove(group);
      for (const m of proxies.values()) {
        m.parent?.remove(m);
        m.geometry.dispose();
      }
      proxies.clear();
      for (const m of patches) {
        m.parent?.remove(m);
        m.geometry.dispose();
        m.material.dispose();
      }
      patches.length = 0;
      proxyMaterial.dispose();
      for (const l of lights) l.dispose?.();
      lights = [];
      slots = [];
      ambient.intensity = base.ambient;
      sun.intensity = base.sun;
      for (const [m, c] of blood) m.color.copy(c);
    },
  };
}
