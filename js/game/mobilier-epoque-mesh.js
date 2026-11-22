// Lot 9j : maillages du mobilier de 1942 (js/core/mobilier-epoque.js) — atelier-mobilier.html, puis la partie après le « GO 9j ».
// Corps : triangles ramenés dans les régions de l'atlas des meubles (atlas-props), pour le maillage des meubles d'aujourd'hui (ombre portée comprise).
// Détails : une géométrie par étage (position, normale, uv, couleur de sommet = teinte de la matière), atlas du mobilier généré (256 px, aucune image).
import * as THREE from 'three';
import { MATIERES } from '../core/mobilier-epoque.js';
import { atlasMobilier } from '../core/mobilier-epoque-atlas.js';

// Couleur linéaire d'une clé de couleurs (sRVB 0-255) ; « neutre » ou absente : blanc (la texture seule).
export function teintes(couleurs) {
  const cache = new Map();
  return (mat) => {
    if (cache.has(mat)) return cache.get(mat);
    const cle = MATIERES[mat]?.teinte;
    const rgb = cle && cle !== 'neutre' ? couleurs?.[cle] : null;
    let out = [1, 1, 1];
    if (Array.isArray(rgb)) {
      const c = new THREE.Color().setRGB(rgb[0] / 255, rgb[1] / 255, rgb[2] / 255, THREE.SRGBColorSpace);
      out = [c.r, c.g, c.b];
    }
    cache.set(mat, out);
    return out;
  };
}

// Corps → triangles { p, n, uv } dans l'atlas des meubles (regionOf(id) → { u0, v0, u1, v1 }, comme textures.region de js/game/textures.js).
export function trianglesCorps(corps, regionOf) {
  const out = [];
  for (const t of Array.isArray(corps) ? corps : []) {
    const r = regionOf(t.region);
    if (!r) continue;
    out.push({ p: t.p, n: t.n, uv: t.uv.map(([s, q]) => [r.u0 + s * (r.u1 - r.u0), r.v0 + q * (r.v1 - r.v0)]) });
  }
  return out;
}

// Détails → géométrie (null s'il n'y a rien).
export function geometrieDetails(details, teinteDe) {
  const tris = Array.isArray(details) ? details : [];
  if (tris.length === 0) return null;
  const n = tris.length * 3;
  const pos = new Float32Array(n * 3);
  const nor = new Float32Array(n * 3);
  const uv = new Float32Array(n * 2);
  const col = new Float32Array(n * 3);
  tris.forEach((q, i) => {
    const c = teinteDe(q.mat);
    for (let k = 0; k < 3; k += 1) {
      const j = i * 3 + k;
      pos.set(q.p[k], j * 3);
      nor.set(q.n, j * 3);
      uv.set(q.uv[k], j * 2);
      col.set(c, j * 3);
    }
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.computeBoundingSphere();
  return g;
}

// Texture de l'atlas du mobilier (générée une fois ; mipmaps, filtrage linéaire).
export function textureMobilier(couleurs) {
  const img = atlasMobilier({ couleurs });
  const tex = new THREE.DataTexture(new Uint8Array(img.data.buffer), img.width, img.height, THREE.RGBAFormat);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  return { texture: tex, taille: img.width };
}
