// Lot 5k : lampes à huile (décor non solide). Module importé seulement si l'option « Lampes et lumières » n'est pas « off » (graphics-boot.js au
// chargement, world.js à chaud) : avec « off », aucun fichier de plus n'est demandé. Un maillage par étage (rez-de-chaussée dans le groupe rdc, étage
// dans le groupe etage), une seule matière Lambert à couleurs de sommet (jetons --game-lamp-*) dont la flamme est émissive (attribut aGlow) :
// +1 appel de dessin au rez-de-chaussée, +2 à l'étage ; sans ombre portée ; créés une fois, cachés avec « off ». Aucune texture nouvelle.
import * as THREE from 'three';
import { LAMP_COLORS, lampSphere, lampTriangles } from '../core/lamps.js';

const camel = (token) => token.replace(/^--game-/, '').replace(/-(\w)/g, (_, c) => c.toUpperCase());

async function json(path) {
  const r = await fetch(path);
  if (!r.ok) throw new Error(`${path} : ${r.status}`);
  return r.json();
}

// Données du chargement : lampes de la carte, et, en « eclairage », le module des lumières et data/game/lumieres.json. null pour l'ancienne salle.
export async function preloadLamps(mode, mapId) {
  if (mode === 'off' || !mapId || mapId === 'salle') return null;
  const doc = await json(`data/game/maps/${mapId}/lampes.world.json`).catch(() => null);
  const out = { mapId, lamps: Array.isArray(doc?.lampes) ? doc.lampes : [], module: { createLampMeshes }, lights: null, lumieres: null };
  if (mode === 'eclairage') Object.assign(out, await preloadLights());
  return out;
}

// Module des lumières et ses données (import dynamique : demandé seulement en « eclairage »).
export async function preloadLights() {
  const [lights, lumieres] = await Promise.all([import('./lights.js'), json('data/game/lumieres.json').catch(() => null)]);
  return { lights, lumieres };
}

// Matière des lampes : Lambert à couleurs de sommet ; la couleur des sommets dont aGlow vaut 1 s'ajoute telle quelle (flamme émissive).
function lampMaterial() {
  const material = new THREE.MeshLambertMaterial({ vertexColors: true });
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aGlow;\nvarying float vGlow;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvGlow = aGlow;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vGlow;')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += vColor.rgb * vGlow;');
  };
  material.customProgramCacheKey = () => 'lampe-huile';
  return material;
}

// Maillages des lampes : { meshes, setVisible(on), cull(frustum), stats(), dispose() }. groups : groupes du monde (rdc, etage) ; palette : readPalette().
// Seules les lampes dans le champ de la caméra sont dessinées (tampon d'indices réécrit quand la liste change ; maillage caché si aucune) : le pire
// cas du budget (U4, sang à pleine charge, à 159 triangles de la limite de 45 000 avant ce lot) n'en paie que les lampes visibles.
export function createLampMeshes({ groups, lamps, palette, floors = ['rdc'] }) {
  const material = lampMaterial();
  const colorOf = new Map(Object.values(LAMP_COLORS).map((token) => {
    const value = palette[camel(token)];
    if (!value) return [token, [1, 1, 1]];
    const c = new THREE.Color(value);
    return [token, [c.r, c.g, c.b]];
  }));
  const meshes = [];
  const parts = [];
  const sphere = new THREE.Sphere();
  for (const floor of floors) {
    const mine = lamps.filter((l) => l.floor === floor);
    const each = mine.map((l) => lampTriangles(l));
    const tris = each.flat();
    if (tris.length === 0 || !groups[floor]) continue;
    const pos = new Float32Array(tris.length * 9);
    const nor = new Float32Array(tris.length * 9);
    const col = new Float32Array(tris.length * 9);
    const glow = new Float32Array(tris.length * 3);
    tris.forEach((t, i) => {
      const c = colorOf.get(t.color) ?? [1, 1, 1];
      const len = Math.hypot(...t.n) || 1;
      for (let k = 0; k < 3; k += 1) {
        pos.set(t.p[k], i * 9 + k * 3);
        nor.set([t.n[0] / len, t.n[1] / len, t.n[2] / len], i * 9 + k * 3);
        col.set(c, i * 9 + k * 3);
        glow[i * 3 + k] = t.glow;
      }
    });
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geometry.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geometry.setAttribute('aGlow', new THREE.BufferAttribute(glow, 1));
    const index = new THREE.BufferAttribute(new Uint16Array(tris.length * 3), 1);
    index.setUsage(THREE.DynamicDrawUsage);
    geometry.setIndex(index);
    geometry.computeBoundingSphere();
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = `lampes-${floor}`;
    mesh.userData.floor = floor;
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    mesh.frustumCulled = false; // tri par lampe (cull)
    groups[floor].add(mesh);
    meshes.push(mesh);
    let start = 0;
    const ranges = each.map((t) => {
      const r = { start, count: t.length * 3 };
      start += r.count;
      return r;
    });
    parts.push({ mesh, index, lamps: mine, spheres: mine.map(lampSphere), ranges, shown: mine.map(() => true), drawn: -1, on: true });
  }
  // Lampes dans le champ (frustum : THREE.Frustum, ou null : toutes) : indices des lampes visibles en tête, plage de dessin réduite. upper : l'étage
  // est dessiné (les lampes « couvertes » du rez-de-chaussée, sous son sol, sont alors omises).
  const cull = (frustum, upper = false) => {
    for (const p of parts) {
      let changed = p.drawn < 0;
      const y = p.mesh.parent?.position.y ?? 0;
      for (let i = 0; i < p.lamps.length; i += 1) {
        const s = p.spheres[i];
        sphere.center.set(s.x, y + s.y, s.z);
        sphere.radius = s.r;
        const v = !(upper && p.lamps[i].couverte === true) && (frustum ? frustum.intersectsSphere(sphere) : true);
        if (v !== p.shown[i]) {
          p.shown[i] = v;
          changed = true;
        }
      }
      if (changed) {
        let n = 0;
        for (let i = 0; i < p.lamps.length; i += 1) {
          if (!p.shown[i]) continue;
          const r = p.ranges[i];
          for (let k = 0; k < r.count; k += 1) p.index.array[n + k] = r.start + k;
          n += r.count;
        }
        p.index.needsUpdate = true;
        p.mesh.geometry.setDrawRange(0, n);
        p.drawn = n;
      }
      const vis = p.on && p.drawn > 0;
      if (p.mesh.visible !== vis) p.mesh.visible = vis;
    }
  };
  cull(null);
  return {
    meshes,
    setVisible(on) {
      for (const p of parts) {
        p.on = on;
        const vis = on && p.drawn > 0;
        if (p.mesh.visible !== vis) p.mesh.visible = vis;
      }
    },
    cull,
    stats: () => parts.map((p) => ({ floor: p.mesh.userData.floor, triangles: p.mesh.geometry.attributes.position.count / 3, on: p.on, visible: p.mesh.visible, drawn: p.mesh.visible && p.mesh.parent?.visible === true, shown: p.lamps.filter((_, i) => p.shown[i]).map((l) => l.id), drawnTriangles: p.drawn / 3 })),
    dispose() {
      for (const m of meshes) {
        m.parent?.remove(m);
        m.geometry.dispose();
      }
      material.dispose();
      meshes.length = 0;
    },
  };
}
