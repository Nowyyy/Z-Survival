// Lot 9i (atelier, avant le « GO 9i ») : M1 Garand des ouvertures, à la place du fusil d'assaut à lunette. Pièces du modèle du lot 9c (js/core/armes/,
// variante retenue dans data/armes/armes-choix.json), sans l'épaississement de lisibilité du jeu (vue à la première personne), converties au repère
// du fusil de l'ouverture (js/menu/ouverture/modeles.js : centimètres, canon vers −z, x à droite) : détente sous la main droite (z +8), garde-main
// arrière sous la main gauche. Un atlas des armes (js/core/armes/atlas.js) aux couleurs --ouv-arm-* (css/ouvertures.css), une matière, un appel.
// Mains gantées et manches : celles du fusil actuel (fusilGeo), inchangées. Chargé à la demande (import dynamique) : jamais au démarrage du menu.
import * as THREE from 'three';
import { JETONS, genererAtlas } from '../../core/armes/atlas.js';
import { armeParId, lireArmes, lireChoix, maillageArme, varianteDe } from '../../core/armes/armes.js';
import { parseColor } from '../../core/color.js';

// Repère : x_ouverture = −x_arme ; y_ouverture = y_arme − DECALAGE_Y ; z_ouverture = Z_DETENTE − (z_arme − z_main_droite) ; 1 mm = 0,1 cm.
const CM_PAR_MM = 0.1;
const Z_DETENTE = 8; // main droite du fusil actuel (fusilGeo : poing à z +8,4)
const DECALAGE_Y = 2.4; // axe du canon du Garand (30 mm) au niveau de celui du fusil actuel (y 0,6)

const json = (chemin) => fetch(chemin).then((r) => (r.ok ? r.json() : Promise.reject(new Error(`${chemin} : ${r.status}`))));
let charge = null;
export const prechargerGarand = () => (charge ??= Promise.all([json('data/armes/armes.json'), json('data/armes/armes-choix.json').catch(() => null)]));

// Palette des armes (nom du jeton sans --arm- → [r, g, b]) lue dans les jetons --ouv-arm-* ; un jeton absent : gris neutre au calcul.
export function paletteGarand(couleur) {
  const out = {};
  for (const n of JETONS) {
    const c = parseColor(couleur(`--ouv-arm-${n}`) ?? '');
    if (c) out[n] = c;
  }
  return out;
}

// Géométrie pure du Garand dans le repère de l'ouverture : { positions, normals, uvs, colors (Float32Array), triangles, bout ([x, y, z] du bout du
// canon), mainDroite, mainGauche, crosse }. donnees : lireArmes(armes.json) ; varianteId : variante retenue.
export function garandOuverture(donnees, varianteId) {
  const arme = armeParId(donnees, 'garand');
  if (!arme) return null;
  const v = varianteDe(arme, varianteId);
  const d1 = { ...donnees, echelle: { ...donnees.echelle, epaisseur: 1 } };
  // Retour du propriétaire : sans la bretelle (à la première personne, elle pendait sans être attachée à l'arme).
  const m = maillageArme(d1, arme, v, { pose: 'main', echelle: CM_PAR_MM, sansBretelle: true });
  const zMain = num(arme.prises?.droite?.[2], -90) * CM_PAR_MM;
  const conv = ([x, y, z]) => [-x, y - DECALAGE_Y, Z_DETENTE - (z - zMain)];
  const positions = new Float32Array(m.positions.length);
  const normals = new Float32Array(m.normals.length);
  for (let i = 0; i < m.positions.length; i += 3) {
    positions.set(conv([m.positions[i], m.positions[i + 1], m.positions[i + 2]]), i);
    normals.set([-m.normals[i], m.normals[i + 1], -m.normals[i + 2]], i);
  }
  const prise = (p) => conv((p ?? [0, 0, 0]).map((q) => num(q) * CM_PAR_MM));
  // Bout du canon : le point le plus avancé (z minimal) de l'arme, sur l'axe du canon (y du canon, 30 mm).
  let zMin = Infinity;
  for (let i = 2; i < positions.length; i += 3) zMin = Math.min(zMin, positions[i]);
  return {
    positions, normals, uvs: m.uvs, colors: m.colors, triangles: m.triangles,
    bout: [0, 30 * CM_PAR_MM - DECALAGE_Y, Math.round(zMin * 100) / 100],
    mainDroite: prise(arme.prises?.droite), mainGauche: prise(arme.prises?.gauche), crosse: prise(arme.prises?.crosse),
  };
}
const num = (v, d = 0) => (Number.isFinite(v) ? v : d);

// Maillage Three.js du Garand (une matière Phong à couleurs de sommet et atlas, légère lueur propre comme le fusil actuel) : { mesh, bout, textures,
// geometries, materiaux, triangles }. couleur : jeton → « #rrggbb » (témoin de l'ouverture).
export async function creerGarand({ couleur, anisotropie = 1 }) {
  const [brut, choixBrut] = await prechargerGarand();
  const donnees = lireArmes(brut);
  const choix = lireChoix(donnees, choixBrut);
  const g = garandOuverture(donnees, choix.variantes.garand);
  if (!g) throw new Error('garand-absent');
  const atlasImg = genererAtlas(paletteGarand(couleur));
  const atlas = new THREE.DataTexture(atlasImg.data, atlasImg.width, atlasImg.height, THREE.RGBAFormat);
  atlas.colorSpace = THREE.SRGBColorSpace;
  atlas.generateMipmaps = true;
  atlas.minFilter = THREE.LinearMipmapLinearFilter;
  atlas.magFilter = THREE.LinearFilter;
  atlas.anisotropy = anisotropie;
  atlas.needsUpdate = true;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(g.positions, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(g.normals, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(g.uvs, 2));
  geo.setAttribute('color', new THREE.BufferAttribute(g.colors, 3));
  geo.computeBoundingSphere();
  const materiau = new THREE.MeshPhongMaterial({ map: atlas, vertexColors: true, shininess: 30, specular: new THREE.Color().setScalar(0.15), emissiveMap: atlas });
  materiau.emissive.setScalar(0.1);
  const mesh = new THREE.Mesh(geo, materiau);
  mesh.name = 'garand';
  return { mesh, bout: g.bout, triangles: g.triangles, textures: [atlas], geometries: [geo], materiaux: [materiau], prises: { droite: g.mainDroite, gauche: g.mainGauche, crosse: g.crosse } };
}
