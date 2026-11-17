// Lot 9c — Rendu Three.js des armes et de la caisse d'armes (atelier des armes seulement ; jamais chargé par le menu ni par la partie).
// Une géométrie fusionnée et une matière Lambert (atlas commun + couleurs de sommet) par arme : un appel de dessin ; caisse : sa texture,
// une matière, un appel ; craie : matière transparente à part (aperçu). Géométries et matières en cache, jamais recréées à l'image.
import * as THREE from 'three';
import { parseColor } from '../core/color.js';
import { JETONS, genererAtlas } from '../core/armes/atlas.js';
import { armeParId, coucher, maillageArme, varianteDe } from '../core/armes/armes.js';
import { dimensionsCaisse, genererTextureCaisse, maillageCaisse } from '../core/armes/caisse.js';

export const JETONS_CAISSE = Object.freeze(['caisse', 'caisse-sombre', 'pochoir', 'interieur', 'paille', 'craie', 'ratelier', 'ratelier-sombre', 'bruni', 'rouille', 'toile', 'toile-trame']);

// Palette { nom: [r, g, b] } des jetons --arm-* (css/armes.css) ; un jeton illisible est simplement absent (gris neutre au calcul).
export function lirePalette(root = document.documentElement) {
  const style = getComputedStyle(root);
  const out = {};
  for (const n of new Set([...JETONS, ...JETONS_CAISSE, 'trait', 'lumiere'])) {
    const c = parseColor(style.getPropertyValue(`--arm-${n}`));
    if (c) out[n] = c;
  }
  return out;
}

function texture(img) {
  const t = new THREE.DataTexture(img.data, img.width, img.height, THREE.RGBAFormat);
  t.colorSpace = THREE.SRGBColorSpace;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.magFilter = THREE.LinearFilter;
  t.needsUpdate = true;
  return t;
}

export function geometrie(m) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(m.positions, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(m.normals, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(m.uvs, 2));
  g.setAttribute('color', new THREE.BufferAttribute(m.colors, 3));
  g.computeBoundingSphere();
  return g;
}

// Kit : { atlas, mesh(armeId, varianteId, pose), caisse(type), craie(type), infos(armeId, varianteId), dispose() }.
// pose : 'main' (tenue, repère de l'arme, en unités) ou 'caisse' (couchée sur le côté, bas à y = 0, centrée).
export function creerKitArmes({ donnees, palette }) {
  const atlasImg = genererAtlas(palette);
  const atlas = texture(atlasImg);
  const caisseImg = genererTextureCaisse(palette);
  const caisseTex = texture(caisseImg);
  const materiau = new THREE.MeshLambertMaterial({ map: atlas, vertexColors: true });
  const materiauCaisse = new THREE.MeshLambertMaterial({ map: caisseTex });
  const materiauCraie = new THREE.MeshBasicMaterial({ map: caisseTex, transparent: true, depthWrite: false });
  const geos = new Map();
  // Caisses à la longueur de l'arme la plus longue (posée), à l'échelle choisie.
  const longueurMax = Math.max(0, ...donnees.armes.flatMap((a) => a.variantes.map((v) => maillageArme(donnees, a, v, { pose: 'caisse' }).longueur)));
  const dims = (type) => dimensionsCaisse(donnees.caisses, type, longueurMax);
  const infosCache = new Map();
  const cle = (...k) => k.join(':');

  function donneesMaillage(armeId, varianteId, pose, dos, lacet, enJeu = false, bretelle = undefined) {
    const br = Array.isArray(bretelle) ? bretelle : undefined;
    const k = cle(armeId, varianteId, pose, Array.isArray(dos) ? dos.join(',') : '', Number.isFinite(lacet) ? Math.round(lacet) : '', enJeu ? 'jeu' : '', br ? br.flat().join(',') : '');
    if (!geos.has(k)) {
      const arme = armeParId(donnees, armeId);
      const v = varianteDe(arme, varianteId);
      let m = maillageArme(donnees, arme, v, { pose: pose === 'caisse' ? 'caisse' : 'main', dos: Array.isArray(dos) ? dos : undefined, lacet: Number.isFinite(lacet) ? Math.round(lacet) : 0, enJeu, bretelle: pose === 'caisse' ? undefined : br });
      if (pose === 'caisse') m = coucher(m);
      geos.set(k, { g: geometrie(m), m });
    }
    return geos.get(k);
  }
  return {
    atlas,
    octetsTextures: atlasImg.octets + caisseImg.octets,
    tailleAtlas: atlasImg.width,
    materiau,
    // dos : décalage des réservoirs (mm) calculé par la tenue de l'atelier (js/armes/tenue.js).
    // enJeu : largeur vue de dessus appliquée (vue de la caméra du jeu seulement) ; bretelle : sections déviées par la tenue (mm).
    mesh(armeId, varianteId, pose = 'main', { dos, lacet, enJeu = false, bretelle } = {}) {
      const { g } = donneesMaillage(armeId, varianteId, pose, dos, lacet, enJeu, bretelle);
      const mesh = new THREE.Mesh(g, materiau);
      mesh.name = `arme-${armeId}-${varianteId}`;
      return mesh;
    },
    maillage: (armeId, varianteId, pose = 'main') => donneesMaillage(armeId, varianteId, pose).m,
    caisse(type) {
      const k = cle('caisse', type);
      if (!geos.has(k)) geos.set(k, { g: geometrie(maillageCaisse(type, dims(type))) });
      return new THREE.Mesh(geos.get(k).g, materiauCaisse);
    },
    craie(type) {
      const k = cle('craie', type);
      if (!geos.has(k)) geos.set(k, { g: geometrie(maillageCaisse(type, dims(type), { craie: true })) });
      const mesh = new THREE.Mesh(geos.get(k).g, materiauCraie);
      mesh.renderOrder = 1;
      return mesh;
    },
    trianglesCaisse(type) {
      return maillageCaisse(type, dims(type)).triangles;
    },
    dimensions(type) {
      return dims(type);
    },
    infos(armeId, varianteId) {
      const k = cle(armeId, varianteId);
      if (!infosCache.has(k)) {
        const main = donneesMaillage(armeId, varianteId, 'main').m;
        const caisse = donneesMaillage(armeId, varianteId, 'caisse').m;
        infosCache.set(k, { triangles: Math.max(main.triangles, caisse.triangles), longueur: main.longueur, largeur: main.largeur, hauteur: main.hauteur, hauteurCouchee: caisse.bornes.max[1] });
      }
      return infosCache.get(k);
    },
    dispose() {
      for (const { g } of geos.values()) g.dispose();
      geos.clear();
      for (const x of [atlas, caisseTex, materiau, materiauCaisse, materiauCraie]) x.dispose();
    },
  };
}
