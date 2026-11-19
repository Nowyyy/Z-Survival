// Retour du propriétaire après le lot 9e : pièces lâchées pendant un rechargement (chargeur vide, clip du Garand, tambour de la MG42) et
// douilles éjectées au tir, qui tombent au sol, y restent quelques secondes, puis disparaissent. Décor seul (aucun effet de jeu). Un seul appel
// par réserve : un InstancedMesh (boîte unité, matière Lambert partagée), au plus `max` objets (le plus ancien cède sa place). Temps : secondes
// de jeu (figées par la pause).
// Couleurs : palette des armes (--arm-* de css/armes.css, déjà lue pour les armes en main).
import * as THREE from 'three';

export const MAX = 6; // pièces lâchées
export const AU_SOL = 4; // secondes posée au sol (pièces)
export const MAX_DOUILLES = 24;
export const AU_SOL_DOUILLE = 1.2;
const DISPARITION = 0.3; // secondes : la pièce rapetisse puis disparaît
const GRAVITE = 700; // unités par seconde²
const NUANCE = { chargeur: 'acier-nu', clip: 'acier-nu', tambour: 'acier-nu', douille: 'laiton' }; // acier clair : lisible sur le sol sombre (le bruni s'y perd) ; douille : laiton (jaune)

// palette : paletteArmes() ({ nom: [r, g, b] }) ; reduit : mouvement réduit (la pièce est posée au sol tout de suite) ; max, auSol : taille de
// la réserve et secondes au sol ; nom : nom du maillage.
export function creerArmesTombes({ parent, palette = {}, reduit = false, max = MAX, auSol = AU_SOL, nom = 'armes-tombes' }) {
  const geo = new THREE.BoxGeometry(1, 1, 1);
  const mat = new THREE.MeshLambertMaterial({ color: 0xffffff });
  const mesh = new THREE.InstancedMesh(geo, mat, max);
  mesh.name = nom;
  mesh.count = 0;
  mesh.visible = false;
  mesh.frustumCulled = false;
  mesh.castShadow = false;
  parent.add(mesh);
  const couleur = new THREE.Color();
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const v = new THREE.Vector3();
  const sc = new THREE.Vector3();
  let pieces = [];
  let suivant = 0;

  // depart : { x, y, z } (monde, z = hauteur Three.js y) ; dims : [largeur, hauteur, profondeur] ; vitesse : { x, y, z } (unités/s) ; t : temps de jeu.
  function lacher({ depart, dims, vitesse = { x: 0, y: 0, z: 0 }, sorte = 'chargeur', lacet = 0, t }) {
    const sol = dims[0] / 2; // couchée sur le flanc (quart de tour autour de sa profondeur) : sa largeur devient sa hauteur, sa grande face se voit de dessus
    const p = { x: depart.x, h: depart.z, y: depart.y, vx: vitesse.x, vh: vitesse.z, vy: vitesse.y, dims, sol, t0: t, pose: null, lacet, sorte, n: suivant };
    suivant += 1;
    if (reduit) p.pose = t;
    pieces = [...pieces, p].slice(-max);
    const c = palette[NUANCE[sorte]] ?? palette['bruni-reflet'] ?? [60, 60, 64];
    couleur.setRGB(c[0] / 255, c[1] / 255, c[2] / 255, THREE.SRGBColorSpace);
    p.couleur = couleur.clone();
  }

  // Avance les chutes jusqu'au temps t et met à jour les instances.
  function update(t) {
    pieces = pieces.filter((p) => p.pose === null || t - p.pose < auSol + DISPARITION);
    for (let i = 0; i < pieces.length; i += 1) {
      const p = pieces[i];
      let x;
      let y;
      let h;
      let couche;
      if (p.pose === null) {
        const dt = Math.max(0, t - p.t0);
        h = p.h + p.vh * dt - 0.5 * GRAVITE * dt * dt;
        x = p.x + p.vx * dt;
        y = p.y + p.vy * dt;
        if (h <= p.sol) {
          p.pose = t;
          p.x = x;
          p.y = y;
          h = p.sol;
          couche = 1;
        } else couche = Math.min(1, dt * 3); // elle bascule en tombant
      }
      if (p.pose !== null) {
        x = p.x;
        y = p.y;
        h = p.sol;
        couche = 1;
      }
      const reste = p.pose === null ? 1 : Math.max(0, Math.min(1, (auSol + DISPARITION - (t - p.pose)) / DISPARITION));
      e.set(0, p.lacet + p.n * 1.9, (Math.PI / 2) * couche); // ordre XYZ : couchée d'abord, puis tournée
      q.setFromEuler(e);
      m.compose(v.set(x, h, y), q, sc.set(p.dims[0] * reste, p.dims[1] * reste, p.dims[2] * reste));
      mesh.setMatrixAt(i, m);
      mesh.setColorAt(i, p.couleur);
    }
    mesh.count = pieces.length;
    mesh.visible = pieces.length > 0; // aucun appel sans pièce
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }

  return {
    lacher,
    update,
    vider() {
      pieces = [];
      mesh.count = 0;
      mesh.visible = false;
    },
    get nombre() {
      return pieces.length;
    },
    dispose() {
      mesh.removeFromParent();
      geo.dispose();
      mat.dispose();
      mesh.dispose();
    },
  };
}
