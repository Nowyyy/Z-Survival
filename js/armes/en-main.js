// Lot 9e — Armes en main dans la partie (Three.js) : modèle du lot 9c (variante de data/armes/armes-choix.json, vue de la caméra du jeu :
// épaisseur et largeur du lot 9c), une géométrie fusionnée par arme et une matière Lambert partagée (atlas commun généré) : un appel par arme.
// Géométries créées au premier usage (jamais à l'image), libérées par dispose() (retour au menu du lot 9d). Chargé avec la partie seulement.
import * as THREE from 'three';
import { genererAtlas } from '../core/armes/atlas.js';
import { armeParId, maillageArme, varianteDe } from '../core/armes/armes.js';
import { pointeCanon } from '../core/armes/tenue-jeu.js';

function texture(img) {
  const t = new THREE.DataTexture(img.data, img.width, img.height, THREE.RGBAFormat);
  t.colorSpace = THREE.SRGBColorSpace;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.magFilter = THREE.LinearFilter;
  t.needsUpdate = true;
  return t;
}

// donnees : lireArmes(data/armes/armes.json) ; choix : lireChoix() ({ variantes: { id: 'a' } }) ; palette : paletteArmes() ; poses : data/armes/poses.json
// (bretelle déviée contre le bras, comme dans l'atelier).
// Renvoie { mesh(id) (un maillage par arme, réutilisé), pointe(id) (bout du canon, repère de l'arme), triangles(id), dispose() }.
export function creerArmesEnMain({ donnees, choix, palette, poses = null }) {
  const atlas = texture(genererAtlas(palette ?? {}));
  const materiau = new THREE.MeshLambertMaterial({ map: atlas, vertexColors: true });
  const cache = new Map();
  function entree(id) {
    if (cache.has(id)) return cache.get(id);
    const arme = armeParId(donnees, id);
    if (!arme) return null;
    const bretelle = poses?.armes?.[id]?.modes?.['deux-mains']?.arme?.bretelle;
    const m = maillageArme(donnees, arme, varianteDe(arme, choix?.variantes?.[id]), { pose: 'main', enJeu: true, ...(Array.isArray(bretelle) ? { bretelle } : {}) });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(m.positions, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(m.normals, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(m.uvs, 2));
    g.setAttribute('color', new THREE.BufferAttribute(m.colors, 3));
    g.computeBoundingSphere();
    const mesh = new THREE.Mesh(g, materiau);
    mesh.name = `arme-${id}`;
    mesh.castShadow = false;
    mesh.matrixAutoUpdate = false;
    const e = { mesh, pointe: pointeCanon(m.positions), triangles: m.positions.length / 9 };
    cache.set(id, e);
    return e;
  }
  return {
    mesh: (id) => entree(id)?.mesh ?? null,
    pointe: (id) => entree(id)?.pointe ?? null,
    triangles: (id) => entree(id)?.triangles ?? 0,
    dispose() {
      for (const e of cache.values()) {
        e.mesh.removeFromParent();
        e.mesh.geometry.dispose();
      }
      cache.clear();
      materiau.dispose();
      atlas.dispose();
    },
  };
}
