// Lot 5k : lumières dynamiques des lampes à huile (option « Lampes et lumières » : Éclairage). Module importé seulement en « eclairage ».
// Un nombre fixe de PointLight (option « Lumières simultanées »), toujours visibles (une lumière cachée sortirait de la liste et changerait les
// programmes), sans ombre portée, dans la scène (jamais dans un groupe d'étage) ; à chaque image : les lampes de l'étage affiché dont la lumière
// touche le champ de la caméra, les plus proches du joueur (js/core/lamps.js), avec fondu d'entrée et de sortie et vacillement lent (temps de jeu ;
// constant sous prefers-reduced-motion). La lumière de base (ambiante, lune) est réduite par ambiance ; les taches de sang (matière sans éclairage)
// suivent le même facteur. Tout est rendu tel quel à la sortie (dispose). Rien ici ne touche la logique du jeu.
import * as THREE from 'three';
import { baseFactors, flicker, lampPhase, parseLightConfig, selectLamps, stepSlots } from '../core/lamps.js';

const BLOOD = ['sang-particules', 'sang-taches'];
// Sous ?test=1 seulement : ?lampgain=0..1 multiplie l'intensité des lampes (mesure de l'étage superposé : avec et sans les lampes, base identique).
const testGain = () => {
  const q = new URLSearchParams(globalThis.location?.search ?? '');
  const g = Number(q.get('lampgain'));
  return q.get('test') === '1' && q.has('lampgain') && g >= 0 && g <= 1 ? g : 1;
};

// scene, ambient, sun : de world.js ; lamps : lampes.world.json ; json : lumieres.json ; palette : readPalette() ; lift : hauteur d'étage.
export function createLights({ scene, ambient, sun, lamps, json, palette, count = 4, lift = 180, reduced = false, gain = testGain() }) {
  const cfg = parseLightConfig(json);
  const color = new THREE.Color(palette.lampLight ?? palette.fire);
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
  const byFloor = { rdc: lamps.filter((l) => l.floor === 'rdc'), etage: lamps.filter((l) => l.floor === 'etage') };
  const byId = new Map(lamps.map((l) => [l.id, { lamp: l, reach: Math.min(cfg.distance, l.portee), phase: lampPhase(l.id) }]));
  const visible = [];
  const wanted = [];
  const sphere = new THREE.Sphere();
  let lights = [];
  let slots = [];
  let time = 0;
  let floorNow = null;
  const build = (n) => {
    for (const l of lights) group.remove(l);
    lights = Array.from({ length: n }, (_, i) => {
      const p = new THREE.PointLight(color, 0, cfg.distance, cfg.decroissance);
      p.castShadow = false;
      p.name = `lumiere-lampe-${i + 1}`;
      group.add(p);
      return p;
    });
    slots = lights.map(() => ({ id: null, w: 0 }));
  };
  build([2, 4, 6].includes(count) ? count : cfg.max);
  const groupY = (floor, elevation) => (floor === 'etage' ? lift : 0) - elevation;

  return {
    config: cfg,
    get count() {
      return lights.length;
    },
    // Nombre de lumières (2, 4 ou 6) : les programmes changent ; l'appelant précompile (renderer.compile).
    setCount(n) {
      if (![2, 4, 6].includes(n) || n === lights.length) return false;
      build(n);
      return true;
    },
    // À chaque image : dt (temps de jeu), joueur (x, y), étage affiché, hauteur du monde (setElevation), champ de la caméra (Frustum ou null).
    frame(dt, px, py, floor, elevation, frustum) {
      const step = Math.min(0.1, Math.max(0, Number(dt) || 0));
      time += step;
      // Changement d'étage : les lumières de l'autre étage s'éteignent aussitôt (jamais de lumière d'un étage sur l'autre).
      if (floor !== floorNow) {
        for (const s of slots) if (s.id !== null && byId.get(s.id)?.lamp.floor !== floor) { s.id = null; s.w = 0; }
        floorNow = floor;
      }
      const list = byFloor[floor] ?? [];
      const y = groupY(floor, elevation);
      visible.length = list.length;
      for (let i = 0; i < list.length; i += 1) {
        const l = list[i];
        sphere.center.set(l.light.x, y + l.light.h, l.light.y);
        sphere.radius = byId.get(l.id).reach;
        visible[i] = frustum ? frustum.intersectsSphere(sphere) : true;
      }
      selectLamps(wanted, list, visible, px, py, lights.length, cfg.distanceActivation);
      stepSlots(slots, wanted, step, cfg.fondu);
      for (let i = 0; i < lights.length; i += 1) {
        const s = slots[i];
        const p = lights[i];
        const e = s.id === null ? null : byId.get(s.id);
        if (!e) {
          if (p.intensity !== 0) p.intensity = 0;
          continue;
        }
        p.position.set(e.lamp.light.x, groupY(e.lamp.floor, elevation) + e.lamp.light.h, e.lamp.light.y);
        p.distance = e.reach;
        p.intensity = cfg.intensite * gain * s.w * flicker(time, e.phase, cfg, reduced);
      }
    },
    stats: () => ({ count: lights.length, slots: slots.map((s) => ({ id: s.id, w: Math.round(s.w * 1000) / 1000 })), intensities: lights.map((p) => Math.round(p.intensity * 1000) / 1000), positions: lights.map((p) => [p.position.x, p.position.y, p.position.z]), distances: lights.map((p) => p.distance), ambient: ambient.intensity, sun: sun.intensity, base: { ...base }, factors: { ...f }, time: Math.round(time * 1000) / 1000, reduced }),
    dispose() {
      scene.remove(group);
      for (const l of lights) l.dispose?.();
      lights = [];
      slots = [];
      ambient.intensity = base.ambient;
      sun.intensity = base.sun;
      for (const [m, c] of blood) m.color.copy(c);
    },
  };
}
