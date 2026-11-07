// Lot 5k : lampes à huile (décor non solide). Module importé seulement si l'option « Lampes et lumières » n'est pas « off » (graphics-boot.js au
// chargement, world.js à chaud) : avec « off », aucun fichier de plus n'est demandé. Un maillage par étage (rez-de-chaussée dans le groupe rdc, étage
// dans le groupe etage), une seule matière Lambert à couleurs de sommet (jetons --game-lamp-*) dont la flamme est émissive (attribut aGlow) :
// +1 appel de dessin au rez-de-chaussée, +2 à l'étage ; sans ombre portée ; créés une fois, cachés avec « off ». Aucune texture nouvelle.
import * as THREE from 'three';
import { LAMP_COLORS, lampTriangles } from '../core/lamps.js';

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
  return { mapId, lamps: Array.isArray(doc?.lampes) ? doc.lampes : [], module: { createLampMeshes }, lights: null, lumieres: null };
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

// Maillages des lampes : { meshes, setVisible(on), stats(), dispose() }. groups : groupes du monde (rdc, etage) ; palette : readPalette().
export function createLampMeshes({ groups, lamps, palette, floors = ['rdc'] }) {
  const material = lampMaterial();
  const colorOf = new Map(Object.values(LAMP_COLORS).map((token) => {
    const value = palette[camel(token)];
    if (!value) return [token, [1, 1, 1]];
    const c = new THREE.Color(value);
    return [token, [c.r, c.g, c.b]];
  }));
  const meshes = [];
  for (const floor of floors) {
    const tris = lamps.filter((l) => l.floor === floor).flatMap((l) => lampTriangles(l));
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
    geometry.computeBoundingSphere();
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = `lampes-${floor}`;
    mesh.userData.floor = floor;
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    groups[floor].add(mesh);
    meshes.push(mesh);
  }
  return {
    meshes,
    setVisible(on) {
      for (const m of meshes) if (m.visible !== on) m.visible = on;
    },
    stats: () => meshes.map((m) => ({ floor: m.userData.floor, triangles: m.geometry.attributes.position.count / 3, visible: m.visible, drawn: m.visible && m.parent?.visible === true })),
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
