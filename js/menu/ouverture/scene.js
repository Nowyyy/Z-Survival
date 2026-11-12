// Lot 8f : scène 3D de l'ouverture de caisses (Docs/ref/menu-principal.md), à la première personne : hangar de nuit (béton, porte roulante à bande
// jaune et noire, piles de caisses, lampe suspendue dont le cône grésille), tapis roulant (bande qui défile, rouleaux), caisses en volume selon leur
// genre (quatre « ? » neutres : aucune couleur de rareté avant l'ouverture), fusil d'assaut et mains gantées, deux zombies du jeu. Le rendu suit la
// chronologie pure (js/core/ouverture.js : instant(chrono, reglages, t)) : il ne décide rien, le temps est en argument. Une seule lumière projette
// des ombres ; particules en tampons réutilisés ; géométries et matériaux créés une fois, libérés par liberer() (contexte WebGL perdu de force).
import * as THREE from 'three';
import { instant, progres, promenade } from '../../core/ouverture.js';
import { BOUT, CAISSE, TAPIS, caisseGeo, fusilGeo, lampeGeo, pilesGeo, tapisGeo } from './modeles.js';
import { TACHE_R, VIDANGE_BORD, creerTextures } from './textures.js';
import { creerZombies } from './zombies.js';

// Écart entre deux caisses sur le tapis ; demi-largeur de la promenade des zombies ; profondeur des zombies.
const ECART = 300;
const LARGEUR_ZOMBIES = 600;
const Z_ZOMBIES = -430;
// Retour du propriétaire (« la projection et la posture écrasée ne font pas naturel ») : le zombie vole à sa taille réelle (seule la perspective
// le grossit) et s'arrête contre l'écran à cette fraction de la largeur ; il retombe dans la surcouche (devant tout).
const LARGEUR_ECRASE = 0.72;
const NB_FEUX = 10;
// Gravité du vol du zombie projeté (unités par seconde²) : avec un vol de 1,3 s, il monte d'environ 330 au-dessus de sa place (juste hors de
// l'écran au sommet), assez lentement pour être vu monter.
const GRAVITE_VOL = 1150;
const NB_FUMEES = 8;
const NB_ECLATS = 10;
// Hachage déterministe dans [0, 1) (variété des volutes et des éclats ; jamais le hasard du navigateur).
const h01 = (k, j) => {
  const x = Math.sin(k * 12.9898 + j * 78.233) * 43758.5453;
  return x - Math.floor(x);
};
// Retour du propriétaire (« lever un peu la vue ») : point visé à 82 (avant 70) ; la caisse descend un peu à l'écran.
const OEIL = Object.freeze({ y: 124, cible: [0, 82, TAPIS.z], depart: 380 });
// Profondeur de la porte du fond (pivot de la caméra : le fond reste fixe à l'écran pendant les mouvements de tête).
const Z_PORTE = -678;
const MAX_PARTICULES = 14;
const MAX_ETINCELLES = 12;
const MAX_RAYONS = 7;
const TAU = Math.PI * 2;
// Multiplicateurs neutres (pas des couleurs de la scène) : blanc d'une matière texturée, reflets gris des métaux et des matières mates.
const NEUTRE = new THREE.Color(1, 1, 1);
const SPEC_METAL = new THREE.Color().setScalar(0.23);
const SPEC_MAT = new THREE.Color().setScalar(0.07);

const lisseLocal = (x) => x * x * (3 - 2 * x);
// Bruit lisse et déterministe (somme de sinus) : secousse, grésillement de la lampe.
const bruit = (t, k) => Math.sin(t * 37.1 + k * 1.7) * 0.5 + Math.sin(t * 23.3 + k * 4.1) * 0.35 + Math.sin(t * 61.7 + k) * 0.15;

export async function creerScene({ canvas, couleur, chrono, reglages, cartes, modele, teinte, police, caseCible }) {
  const col = (jeton) => new THREE.Color(couleur(jeton));
  // Contexte WebGL 2 demandé ici (Three.js 0.186 n'accepte que WebGL 2) : s'il n'y en a pas, l'ouverture s'arrête sans que Three.js n'écrive
  // d'erreur (résultat direct).
  const attributs = { antialias: (globalThis.devicePixelRatio || 1) < 2, powerPreference: 'high-performance', alpha: false, depth: true, stencil: false, premultipliedAlpha: true, preserveDrawingBuffer: false };
  const gl = canvas.getContext('webgl2', attributs);
  if (!gl) throw new Error('webgl-indisponible');
  const renderer = new THREE.WebGLRenderer({ canvas, context: gl, ...attributs });
  renderer.setPixelRatio(Math.min(globalThis.devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  // Deux passes par image (scène, puis surcouche du zombie écrasé) : effacement et compteurs gérés à la main.
  renderer.autoClear = false;
  renderer.info.autoReset = false;
  const T = creerTextures({ couleur, anisotropie: Math.min(4, renderer.capabilities.getMaxAnisotropy()) });
  const materiaux = new Set();
  const geos = new Set();
  const mat = (m) => {
    materiaux.add(m);
    return m;
  };
  const geo = (g) => {
    geos.add(g);
    return g;
  };
  const additif = (couleurJeton, map, opacite = 1) => mat(new THREE.MeshBasicMaterial({ color: col(couleurJeton), map, transparent: true, opacity: opacite, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));

  const scene = new THREE.Scene();
  scene.background = col('--ouv-nuit');
  scene.fog = new THREE.Fog(col('--ouv-nuit'), 700, 1600);
  const camera = new THREE.PerspectiveCamera(60, 2, 1, 2600);
  scene.add(camera);
  // Surcouche (légendaire) : le zombie écrasé sur l'écran et ses traînées de sang, dessinés après la scène, profondeur effacée : devant tout (fusil
  // et carte compris), il cache la carte jusqu'à sa glissade. Repère « devant » = celui de la caméra, recopié à chaque image.
  const surcouche = new THREE.Scene();
  const devant = new THREE.Group();
  devant.matrixAutoUpdate = false;
  surcouche.add(devant);

  // --- Lumières : ambiance de nuit, lampe suspendue (seule lumière à ombres), lumière de la rareté ---------------------------------------------
  // Retour du propriétaire (fluidité) : trois lumières seulement (chaque lumière ponctuelle coûte à chaque pixel) ; plus de lumière du canon ni
  // d'appoint du fusil (le fusil a une légère lueur propre) ; l'éclair du canon relève brièvement l'ambiance.
  const AMBIANCE = 2.5;
  const ambiance = new THREE.HemisphereLight(col('--ouv-ambiant'), col('--ouv-sol-ambiant'), AMBIANCE);
  scene.add(ambiance);
  // Lumière neutre : le zombie écrasé garde les couleurs de sa tenue (retour du propriétaire : zombies comme en partie).
  const ambianceSur = new THREE.HemisphereLight(col('--ouv-q'), col('--ouv-sol-ambiant'), 1.6);
  const soleilSur = new THREE.DirectionalLight(col('--ouv-q'), 1.8);
  soleilSur.position.set(-0.4, 1, 0.6);
  surcouche.add(ambianceSur, soleilSur);
  const LAMPE = new THREE.Vector3(0, 232, TAPIS.z - 18);
  const spot = new THREE.SpotLight(col('--ouv-lumiere'), 13, 0, 0.9, 0.6, 0);
  spot.position.copy(LAMPE);
  spot.target.position.set(0, 0, TAPIS.z - 30);
  spot.castShadow = true;
  spot.shadow.mapSize.set(768, 768);
  spot.shadow.camera.near = 40;
  spot.shadow.camera.far = 600;
  spot.shadow.bias = -0.0008;
  scene.add(spot, spot.target);
  const lumRarete = new THREE.PointLight(col('--ouv-lumiere'), 0, 340, 0);
  scene.add(lumRarete);

  // --- Hangar ---------------------------------------------------------------------------------------------------------------------------------
  const texSol = T.beton(3, true);
  texSol.repeat.set(14, 14);
  const sol = new THREE.Mesh(geo(new THREE.PlaneGeometry(2600, 2600)), mat(new THREE.MeshLambertMaterial({ map: texSol })));
  sol.rotation.x = -Math.PI / 2;
  sol.receiveShadow = true;
  const texMur = T.beton(9, false);
  texMur.repeat.set(8, 2);
  const murGeo = new THREE.BufferGeometry();
  {
    const fond = new THREE.PlaneGeometry(2000, 640).translate(0, 320, -680);
    const g = new THREE.PlaneGeometry(1200, 640).rotateY(Math.PI / 2).translate(-760, 320, -80);
    const d = new THREE.PlaneGeometry(1200, 640).rotateY(-Math.PI / 2).translate(760, 320, -80);
    const parts = [fond, g, d].map((p) => p.toNonIndexed());
    for (const name of ['position', 'normal', 'uv']) {
      const n = parts.reduce((s, p) => s + p.attributes[name].array.length, 0);
      const arr = new Float32Array(n);
      let o = 0;
      for (const p of parts) {
        arr.set(p.attributes[name].array, o);
        o += p.attributes[name].array.length;
      }
      murGeo.setAttribute(name, new THREE.BufferAttribute(arr, name === 'uv' ? 2 : 3));
    }
    for (const p of [fond, g, d, ...parts]) p.dispose();
  }
  const murs = new THREE.Mesh(geo(murGeo), mat(new THREE.MeshLambertMaterial({ map: texMur })));
  const texPorte = T.porte();
  texPorte.repeat.set(3, 1.6);
  const porte = new THREE.Mesh(geo(new THREE.PlaneGeometry(600, 340)), mat(new THREE.MeshLambertMaterial({ map: texPorte })));
  porte.position.set(0, 170, Z_PORTE);
  const texBande = T.bande();
  texBande.repeat.set(10, 1);
  const bande = new THREE.Mesh(geo(new THREE.PlaneGeometry(600, 26)), mat(new THREE.MeshLambertMaterial({ map: texBande })));
  bande.position.set(0, 13, -676);
  const cadre = new THREE.Mesh(geo(new THREE.BoxGeometry(640, 22, 14).translate(0, 351, -672)), mat(new THREE.MeshLambertMaterial({ color: col('--ouv-chassis') })));
  const texPiles = T.bois('--ouv-pile', 21, 3);
  const piles = new THREE.Mesh(geo(pilesGeo()), mat(new THREE.MeshLambertMaterial({ map: texPiles })));
  piles.receiveShadow = true;
  scene.add(sol, murs, porte, bande, cadre, piles);

  // Lampe suspendue : abat-jour, ampoule, cône de lumière visible qui grésille.
  const L = lampeGeo();
  const lampe = new THREE.Mesh(geo(L.lampe), mat(new THREE.MeshLambertMaterial({ color: col('--ouv-lampe'), side: THREE.DoubleSide })));
  lampe.position.copy(LAMPE);
  const ampoule = new THREE.Mesh(geo(L.ampoule), mat(new THREE.MeshBasicMaterial({ color: col('--ouv-cone') })));
  ampoule.position.copy(LAMPE).add(new THREE.Vector3(0, -14, 0));
  const cone = new THREE.Mesh(geo(L.cone), additif('--ouv-cone', null, 0.07));
  cone.position.copy(LAMPE).add(new THREE.Vector3(0, -165, 0));
  scene.add(lampe, ampoule, cone);

  // --- Tapis roulant --------------------------------------------------------------------------------------------------------------------------
  const TG = tapisGeo();
  const chassis = new THREE.Mesh(geo(TG.chassis), mat(new THREE.MeshLambertMaterial({ color: col('--ouv-chassis') })));
  chassis.position.z = TAPIS.z;
  chassis.castShadow = true;
  chassis.receiveShadow = true;
  const texTapis = T.tapis();
  texTapis.repeat.set(TAPIS.longueur / 64, TAPIS.largeur / 64);
  const tapis = new THREE.Mesh(geo(TG.bande), mat(new THREE.MeshLambertMaterial({ map: texTapis })));
  tapis.position.z = TAPIS.z;
  tapis.receiveShadow = true;
  const rouleaux = new THREE.InstancedMesh(geo(TG.rouleau), mat(new THREE.MeshLambertMaterial({ color: col('--ouv-rouleau') })), TAPIS.rouleaux);
  const mI = new THREE.Matrix4();
  const qI = new THREE.Quaternion();
  const eI = new THREE.Euler();
  const vI = new THREE.Vector3();
  const sI = new THREE.Vector3(1, 1, 1);
  function poserRouleaux(angle) {
    for (let k = 0; k < TAPIS.rouleaux; k += 1) {
      mI.compose(vI.set(-TAPIS.rouleaux * TAPIS.pas * 0.5 + k * TAPIS.pas, TAPIS.y - 4.5, TAPIS.z), qI.setFromEuler(eI.set(Math.PI / 2, angle, 0)), sI);
      rouleaux.setMatrixAt(k, mI);
    }
    rouleaux.instanceMatrix.needsUpdate = true;
  }
  poserRouleaux(0);
  scene.add(chassis, tapis, rouleaux);

  // --- Caisses (trois à la fois au plus : en attente, au centre, partie) ----------------------------------------------------------------------
  const CG = caisseGeo(modele);
  for (const g of [CG.corps.principal, CG.corps.garniture, CG.couvercle.principal, CG.couvercle.garniture, CG.interieur, CG.q]) geo(g);
  const forme = CG.forme;
  const texPrincipal = forme === 'bois' ? T.bois('--ouv-bois', 5, 4) : null;
  const corpsJeton = { bois: '--ouv-bois', militaire: '--ouv-militaire', elite: '--ouv-elite', malle: `--ouv-${['recrues', 'veterans', 'legendes'].includes(modele) ? modele : 'recrues'}`, valise: `--ouv-${['tenues', 'mode', 'couture'].includes(modele) ? modele : 'tenues'}` }[forme];
  const couvercleJeton = { bois: '--ouv-bois', militaire: '--ouv-militaire-couvercle', elite: '--ouv-elite-couvercle', malle: `${corpsJeton}-couvercle`, valise: corpsJeton }[forme];
  const texMetal = forme !== 'bois' ? T.metal(corpsJeton, 7) : null;
  const matCorps = mat(new THREE.MeshPhongMaterial({ color: NEUTRE, map: texPrincipal ?? texMetal, shininess: 48, specular: SPEC_METAL }));
  const matCouvercle = forme === 'bois' ? matCorps : mat(new THREE.MeshPhongMaterial({ color: NEUTRE, map: T.metal(couvercleJeton, 8), shininess: 48, specular: SPEC_METAL }));
  const garnitureTeinte = forme === 'elite' || modele === 'legendes' || modele === 'couture';
  const matGarniture = mat(new THREE.MeshPhongMaterial({ color: garnitureTeinte ? col(teinte) : col(forme === 'militaire' ? '--ouv-militaire-arete' : forme === 'valise' ? '--ouv-sangle' : '--ouv-clou'), shininess: 48, specular: SPEC_METAL }));
  const matInterieur = mat(new THREE.MeshBasicMaterial({ color: col('--ouv-noir') }));
  const texQ = T.question(police);
  const matQ = mat(new THREE.MeshBasicMaterial({ color: col('--ouv-q'), map: texQ, transparent: true, depthWrite: false }));
  const texLueur = T.lueur();
  const pool = [0, 1, 2].map(() => {
    const g = new THREE.Group();
    const corps = new THREE.Mesh(CG.corps.principal, matCorps);
    const garn = new THREE.Mesh(CG.corps.garniture, matGarniture);
    const interieur = new THREE.Mesh(CG.interieur, matInterieur);
    const q = new THREE.Mesh(CG.q, matQ);
    const couvercle = new THREE.Group();
    const cp = new THREE.Mesh(CG.couvercle.principal, matCouvercle);
    const cg = new THREE.Mesh(CG.couvercle.garniture, matGarniture);
    couvercle.add(cp, cg);
    for (const m of [corps, garn, cp, cg]) {
      m.castShadow = true;
      m.receiveShadow = true;
    }
    const lueur = new THREE.Mesh(geo(new THREE.PlaneGeometry(CAISSE.w * 1.5, CAISSE.d * 1.5).rotateX(-Math.PI / 2)), additif('--ouv-q', texLueur, 0));
    lueur.position.y = CG.haut + 1.5;
    g.add(corps, garn, interieur, q, couvercle, lueur);
    g.visible = false;
    scene.add(g);
    return { g, couvercle, lueur, i: -1 };
  });
  const eclats = new THREE.InstancedMesh(geo(new THREE.BoxGeometry(12, 3, 5)), matCorps, NB_ECLATS);
  eclats.visible = false;
  eclats.frustumCulled = false;
  scene.add(eclats);
  const jetonRarete = (rid) => `--rarete-${rid}`;
  const couleursR = new Map();
  const couleurRarete = (rid) => {
    if (!couleursR.has(rid)) couleursR.set(rid, col(jetonRarete(rid)));
    return couleursR.get(rid);
  };

  // --- Effets de l'ouverture (une caisse active à la fois) ------------------------------------------------------------------------------------
  const texDegrade = T.degrade();
  const rayonGeo = geo(new THREE.PlaneGeometry(1, 1).translate(0, 0.5, 0));
  const matRayons = additif('--ouv-q', texDegrade, 0);
  const rayons = new THREE.InstancedMesh(rayonGeo, matRayons, MAX_RAYONS);
  rayons.count = 0;
  rayons.frustumCulled = false;
  const ondeGeo = geo(new THREE.RingGeometry(0.86, 1, 48).rotateX(-Math.PI / 2));
  const ondes = [0, 1].map(() => {
    const m = new THREE.Mesh(ondeGeo, additif('--ouv-q', null, 0));
    m.visible = false;
    return m;
  });
  const texEtoile = T.etoile();
  const points = (n, jeton, taille) => {
    const g = geo(new THREE.BufferGeometry());
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    const p = new THREE.Points(g, mat(new THREE.PointsMaterial({ color: col(jeton), map: texLueur, size: taille, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })));
    p.frustumCulled = false;
    p.visible = false;
    return p;
  };
  const particules = points(MAX_PARTICULES, '--ouv-q', 16);
  const etincelles = points(MAX_ETINCELLES, '--ouv-etincelle', 9);
  etincelles.material.map = texEtoile;
  // Boule de feu : lueur ronde (toujours face à la caméra) et cœur plus clair.
  const boule = new THREE.Sprite(mat(new THREE.SpriteMaterial({ map: texLueur, color: col('--ouv-boule'), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0 })));
  boule.visible = false;
  const coeur = new THREE.Sprite(mat(new THREE.SpriteMaterial({ map: texLueur, color: col('--ouv-cone'), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0 })));
  boule.add(coeur);
  coeur.scale.setScalar(0.5);
  const eclat = new THREE.Sprite(mat(new THREE.SpriteMaterial({ map: texEtoile, color: col('--ouv-boule-bord'), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0 })));
  eclat.visible = false;
  scene.add(rayons, ...ondes, particules, etincelles, boule, eclat);
  // Explosion (retour du propriétaire : « ne fait pas naturel ») : volutes de feu qui gonflent, montent et virent du blanc à l'orange puis au rouge,
  // fumée sombre qui monte ensuite, éclats de la caisse projetés qui retombent au sol, flash bref (boule et éclat ci-dessus).
  const texBouffee = T.bouffee();
  const feux = Array.from({ length: NB_FEUX }, () => {
    const sp = new THREE.Sprite(mat(new THREE.SpriteMaterial({ map: texBouffee, color: new THREE.Color(), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0 })));
    sp.visible = false;
    scene.add(sp);
    return sp;
  });
  const fumees = Array.from({ length: NB_FUMEES }, () => {
    const sp = new THREE.Sprite(mat(new THREE.SpriteMaterial({ map: texBouffee, color: col('--ouv-fumee'), transparent: true, depthWrite: false, opacity: 0 })));
    sp.visible = false;
    scene.add(sp);
    return sp;
  });
  const cFeu = [col('--ouv-cone'), col('--ouv-boule'), col('--ouv-boule-bord'), col('--ouv-braise')];
  // Retour du propriétaire (après la PR #98) : seconde explosion sous un zombie, qui l'envoie hors de l'écran par le haut avant qu'il ne retombe sur
  // l'écran. Volutes propres (elle chevauche celle de la caisse) et flash au sol.
  const feux2 = Array.from({ length: 8 }, () => {
    const sp = new THREE.Sprite(mat(new THREE.SpriteMaterial({ map: texBouffee, color: new THREE.Color(), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0 })));
    sp.visible = false;
    scene.add(sp);
    return sp;
  });
  const fumees2 = Array.from({ length: 5 }, () => {
    const sp = new THREE.Sprite(mat(new THREE.SpriteMaterial({ map: texBouffee, color: col('--ouv-fumee'), transparent: true, depthWrite: false, opacity: 0 })));
    sp.visible = false;
    scene.add(sp);
    return sp;
  });
  const flash2 = new THREE.Sprite(mat(new THREE.SpriteMaterial({ map: texLueur, color: col('--ouv-boule'), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0 })));
  flash2.visible = false;
  scene.add(flash2);
  // Volutes de feu puis de fumée autour d'un centre (tau : secondes depuis le départ ; echelle : taille relative ; graine : variété).
  function volutes(feuxL, fumeesL, centre, tau, echelle, graine) {
    feuxL.forEach((sp, k) => {
      const u = (tau - 0.08 * h01(k + graine, 1)) / (0.5 + 0.35 * h01(k + graine, 2));
      sp.visible = u > 0 && u < 1;
      if (!sp.visible) return;
      const a2 = h01(k + graine, 3) * TAU;
      const dist = (25 + 90 * h01(k + graine, 4)) * echelle * (1 - (1 - u) ** 2);
      sp.position.set(centre.x + Math.cos(a2) * dist, centre.y + Math.abs(Math.sin(a2)) * dist * 0.7 + u * 80 * echelle, centre.z + (h01(k + graine, 5) - 0.5) * dist);
      sp.scale.setScalar((45 + 140 * Math.sqrt(u)) * echelle * (0.7 + 0.6 * h01(k + graine, 6)));
      const q = Math.min(2.999, u * 4.5);
      const i0 = Math.floor(q);
      sp.material.color.copy(cFeu[i0]).lerp(cFeu[i0 + 1], q - i0);
      sp.material.opacity = 0.75 * (1 - u) ** 1.3;
      sp.material.rotation = h01(k + graine, 7) * TAU + u * 1.2;
    });
    fumeesL.forEach((sp, k) => {
      const u = (tau - 0.1 - 0.2 * h01(k + graine, 8)) / (0.9 + 0.3 * h01(k + graine, 9));
      sp.visible = u > 0 && u < 1;
      if (!sp.visible) return;
      const a2 = h01(k + graine, 10) * TAU;
      sp.position.set(centre.x + Math.cos(a2) * 50 * echelle * Math.sqrt(u), centre.y + 25 + u * 170 * echelle, centre.z + Math.sin(a2) * 25 * u);
      sp.scale.setScalar((60 + 200 * u) * echelle);
      sp.material.opacity = 0.85 * Math.sin(Math.PI * Math.min(1, u * 1.4)) * (1 - u * 0.6);
      sp.material.rotation = h01(k + graine, 12) * TAU - u * 0.8;
    });
  }

  // --- Fusil à la première personne ---------------------------------------------------------------------------------------------------------
  const FG = fusilGeo();
  for (const g of Object.values(FG)) geo(g);
  // Retour du propriétaire (« des textures sur l'arme, la lunette ») : métal bruni aux arêtes usées, polymère grainé, cuir des gants à
  // coutures, tissu des manches, verre bleuté à reflet (textures sur canevas, couleurs --ouv-*).
  const fusil = new THREE.Group();
  const texFusil = [T.armeUsee(), T.polymere(), T.gantCuir(), T.tissu()];
  const meshesFusil = [
    new THREE.Mesh(FG.arme, mat(new THREE.MeshPhongMaterial({ color: NEUTRE, map: texFusil[0], shininess: 60, specular: SPEC_METAL }))),
    new THREE.Mesh(FG.polymere, mat(new THREE.MeshPhongMaterial({ color: NEUTRE, map: texFusil[1], shininess: 10, specular: SPEC_MAT }))),
    new THREE.Mesh(FG.gant, mat(new THREE.MeshPhongMaterial({ color: NEUTRE, map: texFusil[2], shininess: 10, specular: SPEC_MAT }))),
    new THREE.Mesh(FG.manche, mat(new THREE.MeshPhongMaterial({ color: NEUTRE, map: texFusil[3], shininess: 10, specular: SPEC_MAT }))),
    new THREE.Mesh(FG.lentille, mat(new THREE.MeshBasicMaterial({ color: NEUTRE, map: T.lentilleVerre() }))),
    new THREE.Mesh(FG.point, mat(new THREE.MeshBasicMaterial({ color: col('--ouv-point') }))),
  ];
  fusil.add(...meshesFusil);
  // Lueur propre du fusil, des gants et des manches (sans lumière d'appoint) : ils restent lisibles au premier plan (même texture en lueur).
  meshesFusil.slice(0, 4).forEach((m, k) => {
    m.material.emissiveMap = texFusil[k];
    m.material.emissive.setScalar(k === 0 ? 0.08 : 0.12);
  });
  const flamme = new THREE.Sprite(mat(new THREE.SpriteMaterial({ map: texEtoile, color: col('--ouv-flamme'), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0 })));
  flamme.position.set(...BOUT).add(new THREE.Vector3(0, 0, -3));
  fusil.add(flamme);
  geo(flamme.geometry); // géométrie partagée des sprites de Three.js : libérée aussi (recréée sur la carte à la prochaine ouverture)
  camera.add(fusil);
  const trainee = new THREE.Mesh(geo(new THREE.BoxGeometry(1, 1, 1).translate(0, 0, 0.5)), additif('--ouv-trainee', null, 0));
  trainee.visible = false;
  scene.add(trainee);

  // --- Carte de l'objet (devant la caméra) ----------------------------------------------------------------------------------------------------
  const texCarte = T.toileCarte();
  const carte = new THREE.Group();
  const matCarte = mat(new THREE.MeshBasicMaterial({ map: texCarte, transparent: true, depthWrite: false }));
  const plaqueCarte = new THREE.Mesh(geo(new THREE.PlaneGeometry(1, 0.5625)), matCarte);
  plaqueCarte.renderOrder = 4;
  const haloCarte = new THREE.Mesh(geo(new THREE.PlaneGeometry(1.9, 1.5)), additif('--ouv-q', texLueur, 0));
  haloCarte.position.z = -0.5;
  haloCarte.renderOrder = 3;
  carte.add(haloCarte, plaqueCarte);
  carte.visible = false;
  camera.add(carte);
  let carteDessinee = -1;

  // --- Projection du légendaire : assombrissement et traînées de sang (devant la caméra) -------------------------------------------------------
  const sombre = new THREE.Mesh(geo(new THREE.PlaneGeometry(1, 1)), mat(new THREE.MeshBasicMaterial({ color: col('--ouv-sombre'), transparent: true, opacity: 0, depthWrite: false })));
  sombre.position.z = -170;
  sombre.renderOrder = 2;
  sombre.visible = false;
  camera.add(sombre);
  // Retours du propriétaire (après les PR 101 et 102 : « pas de gros bloc rectangulaire : une tache qui s'écoule en plusieurs filets, comme le Z
  // du logo ») : tache de sang derrière le zombie écrasé (surcouche ; elle teste la profondeur : le zombie reste devant), assez grande pour
  // cacher la carte ; pendant la glissade, elle se vide du haut vers le bas (masque d'opacité décalé : bord ondulé, filets qui pendent) et
  // découvre la carte ; des filets coulent de son bas, chacun terminé par une goutte.
  const vidange = T.vidange();
  const tache = new THREE.Mesh(geo(new THREE.PlaneGeometry(1, 1)), mat(new THREE.MeshBasicMaterial({ map: T.tache(), alphaMap: vidange, transparent: true, opacity: 0, depthWrite: false })));
  tache.renderOrder = 10;
  tache.visible = false;
  devant.add(tache);
  const NB_FILETS = 7;
  const filets = new THREE.InstancedMesh(geo(new THREE.PlaneGeometry(1, 1).translate(0, -0.5, 0)), mat(new THREE.MeshBasicMaterial({ map: T.filet(), transparent: true, opacity: 0, depthWrite: false, depthTest: false })), NB_FILETS);
  const gouttes = new THREE.InstancedMesh(geo(new THREE.PlaneGeometry(1, 1)), mat(new THREE.MeshBasicMaterial({ map: T.goutte(), transparent: true, opacity: 0, depthWrite: false, depthTest: false })), NB_FILETS);
  // Haut irrégulier de chaque filet (retours du propriétaire) : une forme différente par filet (planche hautsFilets, une case chacun), retournée
  // pour un filet sur deux environ ; un seul maillage de NB_FILETS rectangles dont les coins sont recalculés à chaque image (géométrie gardée,
  // attribut de position mis à jour sur place) : un appel de dessin.
  const geoHauts = geo(new THREE.BufferGeometry());
  geoHauts.setAttribute('position', new THREE.BufferAttribute(new Float32Array(NB_FILETS * 4 * 3), 3).setUsage(THREE.DynamicDrawUsage));
  geoHauts.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(NB_FILETS * 4 * 2), 2));
  geoHauts.setIndex(Array.from({ length: NB_FILETS }, (_, k) => [0, 1, 2, 2, 1, 3].map((i) => k * 4 + i)).flat());
  const hauts = new THREE.Mesh(geoHauts, mat(new THREE.MeshBasicMaterial({ map: T.hautsFilets(NB_FILETS), transparent: true, opacity: 0, depthWrite: false, depthTest: false, side: THREE.DoubleSide })));
  for (const m of [filets, gouttes, hauts]) {
    m.frustumCulled = false;
    m.renderOrder = 12;
    m.visible = false;
    devant.add(m);
  }
  // Filets : place sous la tache (part du rayon horizontal), largeur et longueur finale (parts de la demi-hauteur), départ (s après l'impact).
  // Matrices des filets : objets à part (les autres instances supposent une échelle 1 dans sI).
  const mF = new THREE.Matrix4();
  const qF = new THREE.Quaternion();
  const sF = new THREE.Vector3();
  const pF = new THREE.Vector3();
  const gouttesForme = []; // allongement propre à la goutte de chaque filet
  const FILETS = Array.from({ length: NB_FILETS }, (_, k) => ({ x: -0.82 + (1.64 * (k + 0.2 + 0.6 * h01(k, 21))) / NB_FILETS, l: 0.055 + 0.04 * h01(k, 22), long: 0.8 + 0.7 * h01(k, 23), depart: 0.25 + 0.5 * h01(k, 24), retard: 0.04 + 0.3 * h01(k, 25), vitesse: 0.7 + 0.45 * h01(k, 26), haut: 1.6 + 1.6 * h01(k, 27), sens: h01(k, 28) < 0.5 ? -1 : 1 }));
  // Case de la planche de chaque filet (sens : case retournée) ; gouttes un peu différentes aussi (largeur et hauteur propres).
  {
    const uv = geoHauts.getAttribute('uv');
    FILETS.forEach((f, k) => {
      const [u0, u1] = f.sens > 0 ? [k / NB_FILETS, (k + 1) / NB_FILETS] : [(k + 1) / NB_FILETS, k / NB_FILETS];
      uv.setXY(k * 4, u0, 0);
      uv.setXY(k * 4 + 1, u1, 0);
      uv.setXY(k * 4 + 2, u0, 1);
      uv.setXY(k * 4 + 3, u1, 1);
      gouttesForme.push([0.85 + 0.3 * h01(k, 29), 0.85 + 0.35 * h01(k, 30)]);
    });
  }
  // Éclaboussure sur la « vitre » au point d'impact du zombie projeté (surcouche, devant lui).
  const texEclab = T.eclaboussure();
  const eclab = new THREE.Mesh(geo(new THREE.PlaneGeometry(1, 1)), mat(new THREE.MeshBasicMaterial({ map: texEclab, transparent: true, opacity: 0, depthWrite: false, depthTest: false })));
  eclab.renderOrder = 11;
  eclab.visible = false;
  devant.add(eclab);

  // --- Zombies du jeu et leurs marques ---------------------------------------------------------------------------------------------------------
  const zombies = await creerZombies({ graine: (Number(chrono.graine) >>> 0) || 7 });
  const marques = { '!': T.marque('!', '--ouv-marque-1', police), '!!': T.marque('!!', '--ouv-marque-2', police), '!!!': T.marque('!!!', '--ouv-marque-3', police) };
  const zs = zombies.liste.map((z) => {
    scene.add(z.c.root);
    // Poussière soulevée à l'impact de la chute (retour du propriétaire : chute plus vivante).
    const poussiere = new THREE.Sprite(mat(new THREE.SpriteMaterial({ map: texLueur, color: col('--ouv-poussiere'), transparent: true, depthWrite: false, opacity: 0 })));
    poussiere.visible = false;
    scene.add(poussiere);
    const sprite = new THREE.Sprite(mat(new THREE.SpriteMaterial({ map: marques['!'], transparent: true, depthWrite: false })));
    sprite.visible = false;
    sprite.renderOrder = 5;
    scene.add(sprite);
    const os = Object.fromEntries(['torso', 'head', 'shoulderL', 'shoulderR', 'elbowL', 'elbowR', 'hipL', 'hipR', 'kneeL', 'kneeR'].map((n) => [n, z.c.root.getObjectByName(n)]));
    return { ...z, sprite, poussiere, os, projete: false };
  });

  // --- Cadrage : champ selon le rapport largeur / hauteur ; fusil en bas à droite, canon vers le centre --------------------------------------
  let largeur = 932;
  let hauteur = 430;
  // Orientation de la caméra, une fois pour toutes : depuis sa place finale (devant le tapis), vers le tapis.
  const orientationCamera = new THREE.Quaternion();
  {
    const c = new THREE.PerspectiveCamera();
    c.position.set(0, OEIL.y, 0);
    c.lookAt(new THREE.Vector3(...OEIL.cible));
    orientationCamera.copy(c.quaternion);
  }
  camera.quaternion.copy(orientationCamera);
  camera.position.set(0, OEIL.y, OEIL.depart);
  // Point visé à la profondeur de la porte du fond, sur la ligne de visée de la place finale (même cadrage, pivot au fond).
  const regardFond = new THREE.Vector3(...OEIL.cible).sub(vI.set(0, OEIL.y, 0)).multiplyScalar(-Z_PORTE / -OEIL.cible[2]).add(vI.set(0, OEIL.y, 0));
  function cadrer() {
    const aspect = largeur / Math.max(1, hauteur);
    // Champ horizontal visé ≈ 96° (tapis entier, zombies sur les côtés), vertical borné à [48°, 64°].
    const v = THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(48)) / aspect));
    camera.fov = THREE.MathUtils.clamp(v, 48, 64);
    camera.aspect = aspect;
    camera.updateProjectionMatrix();
  }
  const demi = (d) => {
    const h = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * d;
    return { h, w: h * camera.aspect };
  };
  // Carte à sa place (fractions de la demi-hauteur de l'écran) : centre et demi-hauteur.
  const cadreCarte = (dix) => {
    const { h, w } = demi(100);
    return { y: dix ? 0.36 : 0.42, dh: ((dix ? 0.172 : 0.225) * 2 * w * 0.5625) / 2 / h };
  };
  // Tache du légendaire (fractions de la demi-hauteur de l'écran) : centre, rayons de la partie pleine (ellipse qui contient la carte : 1,45 fois
  // ses demi-côtés) et demi-taille de l'image.
  const cadreTache = (dix) => {
    const k = cadreCarte(dix);
    const { h, w } = demi(100);
    const rx = 1.45 * ((dix ? 0.172 : 0.225) * w) / h;
    const ry = 1.45 * k.dh;
    return { y: k.y, rx, ry, dx: rx / TACHE_R, dy: ry / TACHE_R };
  };

  fusil.rotation.order = 'YXZ';
  const vise = new THREE.Vector3();
  function poseFusil(x, y, rz, recul) {
    // Boîtier en bas à droite (cibles normalisées de l'écran, comme la maquette). Retour du propriétaire (« il vise un peu trop bas pour toucher
    // le coffre ») : canon vers la face de la caisse du centre (là où la balle la touche), et non plus vers un point fixe sous le centre de l'écran.
    const d = 24;
    const { h, w } = demi(d);
    const px = Math.min(w * 0.36, h * 0.9);
    const py = -h * 0.74;
    fusil.position.set(px + x, py + y, -d + recul * 4.5);
    vise.set(0, TAPIS.y + CG.haut * 0.55, TAPIS.z + CAISSE.d / 2);
    camera.worldToLocal(vise).sub(fusil.position);
    fusil.rotation.set(Math.atan2(vise.y, Math.hypot(vise.x, vise.z)) + recul * 0.14, Math.atan2(-vise.x, -vise.z), rz);
  }

  // --- Images ---------------------------------------------------------------------------------------------------------------------------------
  const v1 = new THREE.Vector3();
  const v2 = new THREE.Vector3();
  const v3 = new THREE.Vector3();
  const q1 = new THREE.Quaternion();
  const q2 = new THREE.Quaternion();
  const qRot = new THREE.Quaternion();
  const qVol = new THREE.Quaternion();
  const vTour = new THREE.Vector3();
  const AX = new THREE.Vector3(1, 0, 0);
  const AZ = new THREE.Vector3(0, 0, 1);
  const AY = new THREE.Vector3(0, 1, 0);
  const pic = { appels: 0, triangles: 0 };
  const dernier = { appels: 0, triangles: 0 };
  const ouvertureDe = (k, v) => v.set(-ECART * k.position, TAPIS.y + CG.haut, TAPIS.z);

  function rendre(t) {
    const s = instant(chrono, reglages, t);
    // Caméra : marche jusqu'au tapis (balancement à chaque pas), secousse selon la rareté.
    const avance = s.marche.avance;
    const pasPhase = s.marche.pas;
    // Amplitude du balancement : diminue avec la vitesse (il ralentit en arrivant au tapis).
    const ampl = s.marche.enMarche ? Math.sqrt(s.marche.vitesse) : 0;
    const balance = ampl * Math.abs(Math.sin(Math.PI * pasPhase));
    const sec = s.secousse * 0.45;
    camera.position.set(Math.sin(Math.PI * pasPhase) * 3 * ampl + sec * bruit(t, 1), OEIL.y + balance * 5 - 2.5 * ampl + sec * bruit(t, 2), OEIL.depart * (1 - avance));
    // Secousse à l'impact du zombie projeté sur l'écran (0,35 s).
    const impact = chrono.caisses.find((c) => c.projection && t >= c.projection.impact && t < c.projection.impact + 0.35);
    if (impact) {
      const k = 9 * (1 - (t - impact.projection.impact) / 0.35);
      camera.position.x += k * bruit(t, 5);
      camera.position.y += k * bruit(t, 6);
    }
    // Retours du propriétaire : « la porte de garage bouge au rythme des pas » puis « j'aimais bien les mouvements de tête, je ne veux pas que le
    // décor bouge » : la tête se balance à chaque pas et la caméra pivote autour d'un point à la profondeur de la porte du fond (au début : autour
    // du tapis, d'où le fond qui bougeait) : la porte et le mur restent fixes à l'écran, le tapis, les caisses et le fusil bougent avec la tête.
    // Même cadrage qu'avant à l'arrêt (le point est sur la même ligne de visée) ; la secousse ajoute un léger roulis.
    camera.lookAt(regardFond);
    camera.quaternion.multiply(qRot.setFromAxisAngle(AZ, sec * 0.004 * bruit(t, 3)));
    // Fusil : se balance en marchant, respire, recule au tir.
    const sw = ampl * Math.sin(Math.PI * pasPhase);
    camera.updateMatrixWorld(true);
    const respire = Math.sin((TAU * t) / 2.4) * 0.35;
    poseFusil(sw * 1.1, -Math.abs(sw) * 0.9 + respire * 0.6, sw * 0.035, s.tir.recul);
    flamme.material.opacity = s.tir.flamme;
    flamme.scale.setScalar(4 + 10 * s.tir.flamme);
    flamme.visible = s.tir.flamme > 0;
    ambiance.intensity = AMBIANCE * (1 + 0.5 * s.tir.flamme);
    camera.updateMatrixWorld(true);
    fusil.updateMatrixWorld(true);
    v1.set(...BOUT);
    fusil.localToWorld(v1);

    // Tapis : la bande défile, les rouleaux tournent.
    texTapis.offset.x = -(s.tapis * ECART) / 64;
    poserRouleaux(-(s.tapis * ECART) / 3.4);

    // Lampe : grésillement (brèves baisses, comme la maquette, et un léger tremblement).
    const cycle = (t % 7) / 7;
    const baisse = cycle > 0.48 && cycle < 0.52 ? 0.45 : 0;
    const gres = 1 - baisse - 0.05 * Math.max(0, bruit(t * 0.5, 9));
    spot.intensity = 13 * gres;
    cone.material.opacity = 0.075 * gres;

    // Caisses visibles : celles dont la position est entre −1,6 et 1,6 écarts.
    for (const p of pool) p.g.visible = false;
    let active = null;
    for (const k of s.caisses) {
      if (Math.abs(k.position) > 1.6) continue;
      const p = pool[k.i % 3];
      p.g.visible = true;
      p.g.position.set(-ECART * k.position, TAPIS.y, TAPIS.z);
      p.g.rotation.y = 0.02 * Math.sin(k.i * 2.3);
      // Couvercle : s'envole en tournant (vers le haut, à gauche, vers la caméra), puis disparaît.
      const c = k.couvercle;
      p.couvercle.visible = c < 1;
      p.couvercle.position.set(-c * 80, CG.haut + c * 190 + Math.sin(c * Math.PI) * 30, c * 70);
      p.couvercle.rotation.set(-c * 1.6, c * 0.6, c * 2.6);
      p.lueur.material.color.copy(couleurRarete(k.rarete));
      p.lueur.material.opacity = k.ouverte ? k.lumiere * 0.95 * Math.max(0, 1 - Math.abs(k.position) * 1.2) : 0;
      if (k.i === s.active || (active === null && k.ouverte && Math.abs(k.position) < 0.5)) active = k;
    }
    matQ.opacity = 0.6 + 0.4 * (0.5 + 0.5 * Math.sin((TAU * t) / 1.4));

    // Effets de la caisse active.
    rayons.count = 0;
    for (const o of ondes) o.visible = false;
    particules.visible = false;
    etincelles.visible = false;
    boule.visible = false;
    eclat.visible = false;
    for (const sp of [...feux, ...fumees, ...feux2, ...fumees2, flash2]) sp.visible = false;
    eclats.visible = false;
    lumRarete.intensity = 0;
    trainee.visible = false;
    if (active) {
      const c = chrono.caisses[active.i];
      const fx = c.effets;
      const couleurR = couleurRarete(active.rarete);
      ouvertureDe(active, v2);
      const depart = Math.max(0, 1 - Math.abs(active.position) * 1.6);
      if (active.ouverte && active.rayons > 0) {
        rayons.count = fx.rayons;
        matRayons.color.copy(couleurR);
        // Légendaire : les rayons montent après la boule de feu (elle reste visible).
        const apresFeu = c.explosion ? Math.min(1, Math.max(0, (t - c.explosion[0] - 0.35) / 0.45)) : 1;
        matRayons.opacity = (active.rayons < 1 ? active.rayons : 0.78) * depart * apresFeu;
        const ev = THREE.MathUtils.degToRad(fx.eventail);
        for (let r = 0; r < fx.rayons; r += 1) {
          const a = fx.rayons === 1 ? 0 : -ev / 2 + (ev * r) / (fx.rayons - 1);
          const longueur = (170 + 90 * (fx.rayons / MAX_RAYONS)) * (0.2 + 0.8 * Math.min(1, active.rayons));
          const larg = 20 * fx.largeur * (r % 2 ? 0.8 : 1);
          mI.compose(vI.copy(v2), qI.setFromAxisAngle(AZ, a), sI.set(larg, longueur, 1));
          rayons.setMatrixAt(r, mI);
        }
        rayons.instanceMatrix.needsUpdate = true;
        sI.set(1, 1, 1);
      }
      if (active.onde > 0 || active.onde2 > 0) {
        [active.onde, active.onde2].forEach((p, n) => {
          if (p <= 0) return;
          const o = ondes[n];
          o.visible = true;
          o.material.color.copy(couleurR);
          o.material.opacity = 0.9 * (1 - p);
          o.position.copy(v2).add(v3.set(0, 2, 0));
          o.scale.setScalar(20 + p * 32 * fx.onde * (n ? 1.25 : 1));
        });
      }
      if (active.particules > 0 && fx.etincelles > 0) {
        particules.visible = true;
        particules.material.color.copy(couleurR);
        particules.material.opacity = 1 - active.particules;
        const pos = particules.geometry.attributes.position;
        for (let k = 0; k < MAX_PARTICULES; k += 1) {
          const on = k < fx.etincelles;
          const u = (k * 0.618) % 1;
          const x = (u - 0.5) * CAISSE.w * 0.9;
          const z = ((k * 0.37) % 1 - 0.5) * CAISSE.d * 0.6;
          const y = active.particules * (90 + 110 * ((k * 0.29) % 1)) + Math.sin(t * 6 + k) * 3;
          pos.setXYZ(k, on ? v2.x + x + Math.sin(t * 2 + k) * 6 : 0, on ? v2.y + 6 + y : -9999, on ? v2.z + z : 0);
        }
        pos.needsUpdate = true;
        particules.geometry.setDrawRange(0, fx.etincelles);
      }
      if (active.etincelles > 0) {
        etincelles.visible = true;
        etincelles.material.size = 9;
        etincelles.material.opacity = 1 - active.etincelles;
        const pos = etincelles.geometry.attributes.position;
        const e = active.etincelles;
        for (let k = 0; k < MAX_ETINCELLES; k += 1) {
          const a = (k / MAX_ETINCELLES) * TAU + 0.4;
          const r = e * (24 + (k % 3) * 12);
          pos.setXYZ(k, v2.x + Math.cos(a) * r, TAPIS.y + CG.haut * 0.55 + Math.sin(a) * r * 0.8 - e * e * 20, TAPIS.z + CAISSE.d / 2 + 6 + e * 10);
        }
        pos.needsUpdate = true;
      }
      if (active.explosion > 0) {
        const p = active.explosion;
        const duree = c.explosion[1] - c.explosion[0];
        const tau = p * duree;
        v3.copy(v2).add(vI.set(0, 16, 0));
        // Flash bref : boule et éclat (0,3 s).
        boule.visible = tau < 0.3;
        boule.position.copy(v3);
        boule.scale.setScalar(50 + 520 * Math.min(1, tau / 0.12));
        boule.material.opacity = Math.max(0, 1 - tau / 0.3);
        coeur.material.opacity = Math.max(0, 1 - tau / 0.18);
        eclat.visible = tau < 0.16;
        eclat.position.copy(v3);
        eclat.scale.setScalar(120 + 1600 * tau);
        eclat.material.opacity = Math.max(0, 1 - tau / 0.16);
        // Volutes de feu.
        feux.forEach((sp, k) => {
          const u = (tau - 0.1 * h01(k, 1)) / (0.55 + 0.4 * h01(k, 2));
          sp.visible = u > 0 && u < 1;
          if (!sp.visible) return;
          const a2 = h01(k, 3) * TAU;
          const dist = (30 + 120 * h01(k, 4)) * (1 - (1 - u) ** 2);
          sp.position.set(v3.x + Math.cos(a2) * dist, v3.y + Math.abs(Math.sin(a2)) * dist * 0.6 + u * 70, v3.z + (h01(k, 5) - 0.5) * dist);
          sp.scale.setScalar((50 + 150 * Math.sqrt(u)) * (0.7 + 0.6 * h01(k, 6)));
          const q = Math.min(2.999, u * 4.5);
          const i0 = Math.floor(q);
          sp.material.color.copy(cFeu[i0]).lerp(cFeu[i0 + 1], q - i0);
          sp.material.opacity = 0.7 * (1 - u) ** 1.3;
          sp.material.rotation = h01(k, 7) * TAU + u * 1.2;
        });
        // Fumée sombre qui monte ensuite.
        fumees.forEach((sp, k) => {
          const u = (tau - 0.08 - 0.25 * h01(k, 8)) / (1.0 + 0.3 * h01(k, 9));
          sp.visible = u > 0 && u < 1;
          if (!sp.visible) return;
          const a2 = h01(k, 10) * TAU;
          sp.position.set(v3.x + Math.cos(a2) * (40 + 70 * h01(k, 11)) * Math.sqrt(u), v3.y + 30 + u * 190, v3.z + Math.sin(a2) * 30 * u);
          sp.scale.setScalar(70 + 230 * u);
          sp.material.opacity = 0.85 * Math.sin(Math.PI * Math.min(1, u * 1.4)) * (1 - u * 0.6);
          sp.material.rotation = h01(k, 12) * TAU - u * 0.8;
        });
        // Éclats de la caisse : projetés, ils tournent et retombent au sol.
        eclats.visible = true;
        for (let k = 0; k < NB_ECLATS; k += 1) {
          const a2 = (k / NB_ECLATS) * TAU + h01(k, 13);
          const vit = 230 + 200 * h01(k, 14);
          const vy = 180 + 220 * h01(k, 15);
          let y = v3.y + vy * tau - 0.5 * 900 * tau * tau;
          let tt = tau;
          if (y < 2) {
            const sol = (vy + Math.sqrt(vy * vy + 2 * 900 * (v3.y - 2))) / 900; // instant de l'arrivée au sol
            tt = Math.min(tau, sol);
            y = 2;
          }
          vI.set(v3.x + Math.cos(a2) * vit * tt, y, v3.z + Math.sin(a2) * vit * 0.6 * tt + 20 * tt);
          eI.set(tt * (7 + 6 * h01(k, 16)), tt * 5, tt * (9 + 4 * h01(k, 17)));
          mI.compose(vI, qI.setFromEuler(eI), sI.set(1, 1, 1));
          eclats.setMatrixAt(k, mI);
        }
        eclats.instanceMatrix.needsUpdate = true;
      }
      if (active.ouverte) {
        lumRarete.color.copy(couleurR);
        lumRarete.position.copy(v2).add(v3.set(0, 40, 30));
        lumRarete.intensity = active.lumiere * (2.2 + fx.eclair * 4) * depart + (active.explosion > 0 ? 12 * (1 - active.explosion) * (0.8 + 0.2 * Math.sin(t * 47)) : 0);
      }
      // Traînée de la balle : du canon à la face de la caisse.
      if (s.tir.trainee > 0) {
        v3.set(v2.x, TAPIS.y + CG.haut * 0.55, TAPIS.z + CAISSE.d / 2);
        trainee.visible = true;
        trainee.position.copy(v1);
        trainee.lookAt(v3);
        trainee.scale.set(0.35, 0.35, v1.distanceTo(v3));
        trainee.material.opacity = s.tir.trainee;
      }
    }

    // Seconde explosion (légendaire) : sous le zombie projeté, au départ de son vol.
    const souffle = chrono.caisses.find((c) => c.projection && t >= c.projection.souffle && t < c.projection.souffle + 1.3);
    if (souffle) {
      const P = souffle.projection;
      const tau = t - P.souffle;
      v3.set(promenade(reglages.promenade[P.zombie], P.depart).x * LARGEUR_ZOMBIES, 12, Z_ZOMBIES + P.zombie * 26);
      volutes(feux2, fumees2, v3, tau, 0.9, 31);
      flash2.visible = tau < 0.25;
      flash2.position.copy(v3);
      flash2.scale.setScalar(60 + 900 * Math.min(1, tau / 0.1));
      flash2.material.opacity = Math.max(0, 1 - tau / 0.25);
    }

    // Carte de l'objet : sort de la caisse jusqu'au haut de l'écran ; ×10 : file ensuite vers sa case.
    const kc = s.caisses.find((k) => k.objet);
    carte.visible = Boolean(kc);
    if (kc) {
      const c = cartes[kc.i];
      if (carteDessinee !== kc.i) {
        T.carte(texCarte, { nom: c.nom, ligne2: c.ligne2, ligne3: chrono.quantite === 1 ? c.ligne3 : '', bord: couleur(c.jeton), grand: chrono.quantite === 1 });
        haloCarte.material.color.set(couleur(c.jeton));
        carteDessinee = kc.i;
      }
      const D = 100;
      const { h, w } = demi(D);
      // Départ : l'ouverture de sa caisse (repère de la caméra).
      const depart = camera.worldToLocal(ouvertureDe(kc, v3));
      const dix = chrono.quantite === 10;
      const cible = { x: 0, y: (dix ? 0.36 : 0.42) * h, l: (dix ? 0.172 : 0.225) * 2 * w };
      const so = kc.objet.sortie;
      const echelle = so < 0.85 ? 0.25 + (so / 0.85) * 0.83 : 1.08 - ((so - 0.85) / 0.15) * 0.08;
      let x = depart.x * (D / -depart.z) * (1 - so) + cible.x * so;
      let y = depart.y * (D / -depart.z) * (1 - so) + cible.y * so + Math.sin(so * Math.PI) * h * 0.12;
      let l = cible.l * echelle;
      if (dix && kc.objet.vol > 0) {
        const cc = caseCible(kc.i);
        const vo = kc.objet.vol;
        x = x * (1 - vo) + cc.x * w * vo;
        y = y * (1 - vo) + cc.y * h * vo;
        l = l * (1 - vo) + cc.l * 2 * w * vo;
      }
      carte.position.set(x, y, -D);
      carte.scale.setScalar(l);
      const dv = kc.objet.devoile;
      haloCarte.material.opacity = c.halo ? 0.55 * (1 - kc.objet.vol) * dv : 0;
    }

    // Zombies : promenade, réactions, marques, projection du légendaire.
    const actifP = chrono.caisses.find((c) => c.projection && t >= c.projection.depart && t < c.projection.place) ?? null;
    zs.forEach((z, n) => {
      const e = s.zombies[n];
      const root = z.c.root;
      const P = e.projection;
      const proj = P && ['vol', 'colle', 'glisse'].includes(P.phase);
      z.poussiere.visible = false;
      root.visible = !(P && P.phase === 'absent');
      const xMonde = e.x * LARGEUR_ZOMBIES;
      if (proj) {
        const PP = actifP.projection;
        // Profondeur d'arrêt : le corps (≈ 62 unités × échelle) tient dans LARGEUR_ECRASE de la largeur ; à la hauteur de la carte (qu'il cache).
        const long = 62 * z.base;
        const D = Math.max(55, long / (2 * demi(1).w * LARGEUR_ECRASE));
        const { h } = demi(D);
        const yColle = h * 0.36;
        // Orientation finale : face à l'écran, presque à l'horizontale (tête à gauche, un peu relevée).
        q2.copy(camera.quaternion).multiply(qRot.setFromAxisAngle(AZ, 1.2));
        const glisse = P.phase === 'glisse' ? P.p * P.p : 0;
        v2.set(0, yColle - glisse * h * 2.5, -D);
        camera.localToWorld(v2);
        v2.sub(v3.set(0, 31 * z.base, 0).applyQuaternion(q2));
        let enX = 1;
        if (P.phase === 'vol') {
          // Retour du propriétaire (« la physique dans les airs est bizarre : il semble changer de direction » ; « s'il est à gauche, il revient de
          // la gauche ») : une seule parabole sous gravité, de sa place (soufflé par l'explosion) jusqu'à l'écran : il monte de son côté, sort
          // par le haut, redescend du même côté droit sur l'écran ; rotation autour d'un seul axe, qui ralentit jusqu'à la posture finale.
          const p = P.p;
          const T = PP.impact - PP.depart;
          const tau = p * T;
          v3.set(promenade(reglages.promenade[n], PP.depart).x * LARGEUR_ZOMBIES, 0, Z_ZOMBIES + n * 26);
          // Vitesse de départ telle que la parabole (gravité G) arrive au point d'impact (v2) au bout de T.
          vI.copy(v2).sub(v3).multiplyScalar(1 / T);
          vI.y += 0.5 * GRAVITE_VOL * T;
          root.position.copy(v3).addScaledVector(vI, tau);
          root.position.y -= 0.5 * GRAVITE_VOL * tau * tau;
          const depart = q1.setFromAxisAngle(AY, e.sens > 0 ? Math.PI / 2 : -Math.PI / 2);
          qRot.setFromAxisAngle(vTour.set(n === 0 ? -0.3 : 0.3, 0.2, 1).normalize(), (n === 0 ? -1 : 1) * (1 - p) ** 1.2 * 2.5 * Math.PI);
          qVol.copy(q2).multiply(qRot);
          root.quaternion.slerpQuaternions(depart, qVol, lisseLocal(Math.min(1, p / 0.15)));
          root.scale.setScalar(z.base);
          enX = lisseLocal(Math.max(0, (p - 0.75) / 0.25));
        } else {
          root.position.copy(v2);
          root.quaternion.copy(q2);
          // Impact : aplati contre l'écran (profondeur), un peu élargi, puis il se détend ; pendant la glissade, il tourne un peu.
          const u = t - PP.impact;
          const choc = Math.exp(-u * 9);
          const plat = 0.5 + 0.25 * (1 - choc);
          root.scale.set(z.base * (1 + 0.08 * choc), z.base * (1 + 0.05 * choc), z.base * plat);
          if (P.phase === 'glisse') root.quaternion.multiply(qRot.setFromAxisAngle(AZ, -0.25 * glisse));
        }
        // Surcouche (devant tout) seulement une fois devant la caisse : avant, la profondeur de la scène s'applique.
        const devantTout = P.phase !== 'vol' || P.etapeVol === 'retombe';
        if (z.projete !== devantTout) {
          z.projete = devantTout;
          (devantTout ? surcouche : scene).add(root);
          root.traverse((o) => {
            if (o.isMesh) o.frustumCulled = !devantTout;
          });
        }
        // Posture : membres qui battent l'air pendant le vol, puis bras et jambes écartés en X, plaqué contre l'écran.
        z.c.setAnim('attente', 0, {}, t);
        const bat = (1 - enX) * Math.sin(t * 17);
        const O = z.os;
        if (O.shoulderL) O.shoulderL.rotation.set(0.3 * bat, 0, 1.2 + 0.9 * bat + (2.35 - 1.2) * enX);
        if (O.shoulderR) O.shoulderR.rotation.set(-0.3 * bat, 0, -1.2 + 0.9 * bat - (2.35 - 1.2) * enX);
        if (O.elbowL) O.elbowL.rotation.set(0, 0, 0.5 * (1 - enX) + 0.25 * enX);
        if (O.elbowR) O.elbowR.rotation.set(0, 0, -0.5 * (1 - enX) - 0.25 * enX);
        if (O.hipL) O.hipL.rotation.set(0.6 * bat, 0, 0.55 * enX + 0.2 * (1 - enX));
        if (O.hipR) O.hipR.rotation.set(-0.6 * bat, 0, -0.55 * enX - 0.2 * (1 - enX));
        if (O.kneeL) O.kneeL.rotation.set(0.5 * (1 - enX) + 0.15 * enX, 0, 0);
        if (O.kneeR) O.kneeR.rotation.set(0.4 * (1 - enX) + 0.15 * enX, 0, 0);
        if (O.head) O.head.rotation.set(0, 0, 0.35 * enX);
      } else {
        if (z.projete) {
          z.projete = false;
          scene.add(root);
          root.traverse((o) => {
            if (o.isMesh) o.frustumCulled = true;
          });
        }
        root.scale.setScalar(z.base);
        // Retour du propriétaire (« la chute fait trop simple ») : face à la caisse pendant une réaction ; saut bras levés, chute en arrière
        // avec recul et rebond, soubresauts au sol, relevé en titubant.
        const face = e.geste ? Math.atan2(-xMonde, TAPIS.z - Z_ZOMBIES) * 0.6 : e.marche ? (e.sens > 0 ? Math.PI / 2 : -Math.PI / 2) : (e.sens > 0 ? 0.5 : -0.5);
        let y = e.hauteur;
        let tangage = 0;
        let roulis = 0;
        if (e.etape === 'chute' && e.pe > 0.7) y += Math.sin(((e.pe - 0.7) / 0.3) * Math.PI) * 7;
        if (e.etape === 'sol') {
          const spasme = Math.max(0, 1 - e.pe * 2.5);
          roulis = Math.sin(t * 31) * 0.06 * spasme;
          y += Math.abs(Math.sin(t * 23)) * 2.5 * spasme;
        }
        if (e.etape === 'releve') {
          tangage = Math.sin(e.pe * Math.PI) * 0.22;
          roulis = Math.sin(e.pe * Math.PI * 3) * 0.08 * (1 - e.pe);
        }
        root.position.set(xMonde, y, Z_ZOMBIES + n * 26 - e.recul * 14);
        // Poussière : de l'impact (fin de la chute) au début du temps au sol.
        const d = e.etape === 'chute' ? (e.pe - 0.7) / 0.3 : e.etape === 'sol' ? 1 + e.pe * 3 : -1;
        z.poussiere.visible = d >= 0 && d < 2;
        if (z.poussiere.visible) {
          z.poussiere.position.set(xMonde, 10 + d * 6, root.position.z - 30);
          z.poussiere.scale.set(70 + d * 60, 30 + d * 18, 1);
          z.poussiere.material.opacity = 0.75 * (1 - d / 2);
        }
        root.quaternion.setFromAxisAngle(AY, face).multiply(qRot.setFromAxisAngle(AX, tangage)).multiply(q1.setFromAxisAngle(AZ, roulis));
        if (e.etape === 'saut') z.c.setAnim('escalade', 0.15 + 0.35 * e.pe, {}, t);
        else if (e.etape === 'chute') z.c.setAnim('mortArriere', Math.min(1, e.pe * 1.15), {}, t);
        else if (e.etape === 'sol') z.c.setAnim('mortArriere', 1, {}, t);
        else if (e.etape === 'releve') z.c.setAnim('mortArriere', 1 - lisseLocal(e.pe), {}, t);
        else if (e.geste) z.c.setAnim('touche', Math.min(1, e.p * 3), {}, t);
        else if (e.marche) z.c.setAnim('marcheLente', ((t * 0.95 + n * 0.37) % 1 + 1) % 1, {}, t);
        else z.c.setAnim('attente', ((t / 2.6) % 1 + 1) % 1, {}, t);
      }
      // Marque au-dessus de la tête (suit la tête).
      z.sprite.visible = Boolean(e.marque) && !proj && root.visible;
      if (z.sprite.visible) {
        z.sprite.material.map = marques[e.marque];
        root.updateMatrixWorld(true);
        (z.tete ?? root).getWorldPosition(v3);
        z.sprite.position.copy(v3).add(v3.set(0, 0, 0)).add(vise.set(0, 62, 0));
        z.sprite.scale.set(150 * e.marqueEchelle, 75 * e.marqueEchelle, 1);
      }
    });
    // Assombrissement derrière le zombie écrasé, traînées de sang pendant la glissade.
    sombre.visible = s.sombre > 0;
    if (sombre.visible) {
      const { h, w } = demi(170);
      sombre.scale.set(w * 2.2, h * 2.2, 1);
      sombre.material.opacity = s.sombre;
    }
    eclab.visible = false;
    tache.visible = false;
    filets.visible = false;
    gouttes.visible = false;
    hauts.visible = false;
    if (actifP) {
      const P = actifP.projection;
      const c = actifP.trainees;
      // Repère de l'impact : même profondeur et même hauteur que le zombie collé.
      const zp = zs[P.zombie];
      const D = Math.max(55, (62 * zp.base) / (2 * demi(1).w * LARGEUR_ECRASE));
      const { h, w } = demi(D - 4);
      const yImpact = h * 0.36;
      const K = cadreTache(chrono.quantite === 10);
      const dv = progres(t, P.decolle, P.bas);
      const apres = progres(t, P.bas, c[1]);
      const fin = 1 - apres;
      if (t >= P.impact && t < c[1]) {
        const u = t - P.impact;
        // Tache (derrière le zombie) : elle s'étale à l'impact, glisse un peu, et se vide de haut en bas, de plus en plus vite (dv²) : le bord du
        // masque passe du haut de l'ellipse (toute la tache pleine) à sous son bas.
        const Dn = D + 40;
        const n = demi(Dn);
        const etale = Math.min(1, 0.55 + u * 4);
        tache.visible = true;
        tache.position.set(0, (K.y - 0.08 * dv) * n.h, -Dn);
        tache.scale.set(2 * K.dx * n.h * etale, 2 * K.dy * n.h * etale, 1);
        tache.material.opacity = Math.min(1, u / 0.1) * fin;
        const haut = 0.5 + TACHE_R / 2 + 0.06; // haut de l'ellipse (coordonnée v de l'image) et marge du bord ondulé
        const bas = 0.5 - TACHE_R / 2 - 0.35; // sous l'ellipse, filets compris
        const front = haut - (haut - bas) * dv * dv;
        vidange.offset.y = 1 - VIDANGE_BORD - front;
        // Bord de l'écoulement à l'écran (fraction de la demi-hauteur) ; après la glissade, il continue à la même vitesse.
        const vFront = apres > 0 ? bas - 2 * (haut - bas) * ((t - P.bas) / (P.bas - P.decolle)) : front;
        const yFront = K.y - 0.08 * dv + (vFront - 0.5) * 2 * K.dy * etale;
        eclab.visible = true;
        eclab.position.set(0, yImpact - 0.25 * dv * dv * h, -(D - 4));
        eclab.scale.set(w * 1.15 * Math.min(1, 0.6 + u * 6), w * 0.75 * Math.min(1, 0.6 + u * 6), 1);
        eclab.material.opacity = 0.9 * (1 - dv) * fin;
        // Filets : du bas de la tache vers le bas de l'écran, chacun à sa vitesse (lents puis plus rapides), goutte au bout.
        const r = demi(D - 4);
        filets.visible = true;
        gouttes.visible = true;
        hauts.visible = true;
        filets.material.opacity = fin;
        gouttes.material.opacity = fin;
        hauts.material.opacity = fin;
        FILETS.forEach((f, k) => {
          const x = f.x * K.rx;
          // Haut du filet : sous la tache, puis il descend quand le bord de l'écoulement le dépasse (le filet se vide aussi). Retour du
          // propriétaire (après la PR 103 : « elles ne doivent pas toutes descendre en même temps ») : chaque filet part avec son retard sur le
          // bord (hauteur) et descend à sa vitesse.
          const ySous = (K.y - 0.08 * dv) - K.ry * Math.sqrt(Math.max(0, 1 - f.x * f.x)) * 0.92;
          const y0 = ySous - Math.max(0, ySous - yFront - f.retard) * f.vitesse;
          const tau = Math.max(0, u - f.depart);
          const bout = ySous - (f.long * Math.min(2.2, (tau / (P.bas - P.impact - f.depart)) ** 1.6) + 0.01);
          const long = Math.max(0.01, y0 - bout);
          const lw = f.l * (1 - 0.25 * Math.min(1, tau));
          pF.set(x * r.h, y0 * r.h, -(D - 4));
          mF.compose(pF, qF, sF.set(lw * r.h, long * r.h, 1));
          filets.setMatrixAt(k, mF);
          // Haut irrégulier : posé sur le haut du corps (recouvrement de 15 %), forme, hauteur et sens propres à chaque filet.
          const hh = lw * f.haut;
          const pos = hauts.geometry.getAttribute('position');
          const [xg, xd] = [(x - lw / 2) * r.h, (x + lw / 2) * r.h];
          const [yb, yh] = [(y0 - hh * 0.15) * r.h, (y0 + hh * 0.85) * r.h];
          pos.setXYZ(k * 4, xg, yb, -(D - 4));
          pos.setXYZ(k * 4 + 1, xd, yb, -(D - 4));
          pos.setXYZ(k * 4 + 2, xg, yh, -(D - 4));
          pos.setXYZ(k * 4 + 3, xd, yh, -(D - 4));
          pF.y -= long * r.h + lw * r.h * 0.4;
          mF.compose(pF, qF, sF.set(lw * r.h * 2 * gouttesForme[k][0], lw * r.h * 2 * gouttesForme[k][1], 1));
          gouttes.setMatrixAt(k, mF);
        });
        filets.instanceMatrix.needsUpdate = true;
        gouttes.instanceMatrix.needsUpdate = true;
        hauts.geometry.getAttribute('position').needsUpdate = true;
      }
    }

    renderer.info.reset();
    renderer.clear();
    renderer.render(scene, camera);
    if (zs.some((z) => z.projete) || eclab.visible || tache.visible) {
      devant.matrix.copy(camera.matrixWorld);
      devant.matrixWorldNeedsUpdate = true;
      renderer.clearDepth();
      renderer.render(surcouche, camera);
    }
    dernier.appels = renderer.info.render.calls;
    dernier.triangles = renderer.info.render.triangles;
    pic.appels = Math.max(pic.appels, dernier.appels);
    pic.triangles = Math.max(pic.triangles, dernier.triangles);
    return s;
  }

  function redimensionner(w, h) {
    largeur = Math.max(1, Math.round(w));
    hauteur = Math.max(1, Math.round(h));
    renderer.setSize(largeur, hauteur, false);
    cadrer();
  }
  redimensionner(canvas.clientWidth || 932, canvas.clientHeight || 430);

  // Retour du propriétaire (saccades à la première apparition d'une rareté, et toujours au légendaire) : la première image d'un objet compilait
  // son programme et envoyait ses textures pendant l'ouverture. Tout est préparé ici, derrière le fondu noir : chaque effet rendu une fois (rayons,
  // ondes, particules, explosion, flamme, traînée, carte, assombrissement, sang, marques), un zombie dans la surcouche, toutes les textures.
  function prechauffer() {
    const caches = [rayons, ...ondes, particules, etincelles, boule, eclat, ...feux, ...fumees, ...feux2, ...fumees2, flash2, eclats, eclab, tache, filets, gouttes, hauts, trainee, flamme, carte, sombre, ...zs.flatMap((z) => [z.sprite, z.poussiere]), ...pool.map((p) => p.g)];
    const avant = caches.map((o) => o.visible);
    for (const o of caches) o.visible = true;
    rayons.count = MAX_RAYONS;
    T.carte(texCarte, { nom: cartes[0]?.nom ?? '', ligne2: cartes[0]?.ligne2 ?? '', ligne3: cartes[0]?.ligne3 ?? '', bord: couleur(cartes[0]?.jeton ?? '--rarete-commun'), grand: chrono.quantite === 1 });
    carteDessinee = 0;
    T.toutes().forEach((tx) => renderer.initTexture(tx));
    camera.updateMatrixWorld(true);
    renderer.compile(scene, camera);
    renderer.clear();
    renderer.render(scene, camera);
    for (const [k, z] of zs.entries()) {
      z.sprite.material.map = marques[['!', '!!', '!!!'][k % 3]];
      if (k === 0) {
        surcouche.add(z.c.root);
        devant.matrix.copy(camera.matrixWorld);
        renderer.compile(surcouche, camera);
        renderer.clearDepth();
        renderer.render(surcouche, camera);
        scene.add(z.c.root);
      }
    }
    renderer.render(scene, camera);
    caches.forEach((o, i) => {
      o.visible = avant[i];
    });
    rayons.count = 0;
    renderer.info.reset();
  }
  prechauffer();

  // Résolution adaptative (ouverture.js, d'après la durée réelle des images) : rapport de pixels entre 0,75 et le plafond (2, ou celui de l'écran).
  const PLAFOND = Math.min(globalThis.devicePixelRatio || 1, 2);
  function pixels(r) {
    const v = Math.max(0.75, Math.min(PLAFOND, r));
    if (Math.abs(v - renderer.getPixelRatio()) < 0.01) return v;
    renderer.setPixelRatio(v);
    renderer.setSize(largeur, hauteur, false);
    return v;
  }

  let libere = false;
  function liberer() {
    if (libere) return memoire();
    libere = true;
    zombies.liberer();
    for (const g of geos) g.dispose();
    for (const m of materiaux) m.dispose();
    rouleaux.dispose();
    rayons.dispose();
    eclats.dispose();
    filets.dispose();
    gouttes.dispose();
    T.liberer();
    // Carte d'ombre : ses textures (couleur et profondeur, Three.js 0.186) ne sont pas comptées libérées avec elle.
    const profondeur = spot.shadow.map?.depthTexture ?? null;
    spot.shadow.dispose();
    profondeur?.dispose();
    renderer.renderLists.dispose();
    const apres = memoire();
    renderer.dispose();
    renderer.forceContextLoss();
    return apres;
  }
  const memoire = () => ({ geometries: renderer.info.memory.geometries, textures: renderer.info.memory.textures });

  return {
    rendre,
    redimensionner,
    liberer,
    pixels,
    plafond: PLAFOND,
    // Mesures (tests) : dernière image et pire image (renderer.info), mémoire Three.js, triangles des zombies.
    info: () => ({ dernier: { ...dernier }, pic: { ...pic }, memoire: libere ? null : memoire(), pixels: renderer.getPixelRatio(), zombies: zombies.triangles() }),
    contexte: () => renderer.getContext(),
  };
}
