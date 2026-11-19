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
const NUANCE = { douille: 'laiton' }; // douille : laiton (jaune) ; les chargeurs ont la géométrie et la matière de leur arme

// palette : paletteArmes() ({ nom: [r, g, b] }) ; reduit : mouvement réduit (la pièce est posée au sol tout de suite) ; max, auSol : taille de
// la réserve et secondes au sol ; nom : nom du maillage ; geometrie, materiau : ceux du chargeur de l'arme (js/armes/en-main.js, gardés par le
// kit des armes : jamais libérés ici) ; sans eux, une boîte unité étirée aux dimensions de chaque objet (douilles), couleur de la palette.
export function creerArmesTombes({ parent, palette = {}, reduit = false, max = MAX, auSol = AU_SOL, nom = 'armes-tombes', geometrie = null, materiau = null }) {
  const propre = !geometrie;
  const geo = geometrie ?? new THREE.BoxGeometry(1, 1, 1);
  const mat = materiau ?? new THREE.MeshLambertMaterial({ color: 0xffffff });
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
  // echelle (partie J) : chargeur grossi au sol pour se voir de dessus (echellePieces de la table).
  function lacher({ depart, dims, vitesse = { x: 0, y: 0, z: 0 }, sorte = 'chargeur', lacet = 0, t, echelle = 1 }) {
    const sol = (dims[0] / 2) * echelle; // couchée sur le flanc (quart de tour autour de sa profondeur) : sa largeur devient sa hauteur, sa grande face se voit de dessus
    const p = { x: depart.x, h: depart.z, y: depart.y, vx: vitesse.x, vh: vitesse.z, vy: vitesse.y, dims, sol, t0: t, pose: null, lacet, sorte, n: suivant, echelle };
    suivant += 1;
    if (reduit) p.pose = t;
    pieces = [...pieces, p].slice(-max);
    if (propre) {
      const c = palette[NUANCE[sorte]] ?? palette['bruni-reflet'] ?? [60, 60, 64];
      couleur.setRGB(c[0] / 255, c[1] / 255, c[2] / 255, THREE.SRGBColorSpace);
      p.couleur = couleur.clone();
    }
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
      e.set(0, p.lacet + p.n * (propre ? 1.9 : 0.35), (Math.PI / 2) * couche); // ordre XYZ : couchée d'abord, puis tournée
      q.setFromEuler(e);
      if (propre) sc.set(p.dims[0] * reste, p.dims[1] * reste, p.dims[2] * reste);
      else sc.setScalar(reste * p.echelle); // géométrie du chargeur (grossie au sol)
      m.compose(v.set(x, h, y), q, sc);
      mesh.setMatrixAt(i, m);
      if (propre) mesh.setColorAt(i, p.couleur);
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
      if (propre) {
        geo.dispose();
        mat.dispose();
      }
      mesh.dispose();
    },
  };
}

// Cartouche tenue par la main gauche pendant un rechargement balle par balle (boîte en laiton, partagée, créée une fois). dims : [x, y, z].
export function creerCartoucheMain(palette = {}, dims = [1.4, 1.4, 3.6]) {
  const c = palette.laiton ?? [201, 162, 74];
  const mat = new THREE.MeshLambertMaterial({ color: new THREE.Color().setRGB(c[0] / 255, c[1] / 255, c[2] / 255, THREE.SRGBColorSpace) });
  const geo = new THREE.BoxGeometry(dims[0], dims[1], dims[2]);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'cartouche-main';
  mesh.castShadow = false;
  return {
    mesh,
    dispose() {
      mesh.removeFromParent();
      geo.dispose();
      mat.dispose();
    },
  };
}

