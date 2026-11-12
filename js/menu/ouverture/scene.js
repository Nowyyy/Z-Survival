// Lot 8f : scène 3D de l'ouverture de caisses (Docs/ref/menu-principal.md), à la première personne : hangar de nuit (béton, porte roulante à bande
// jaune et noire, piles de caisses, lampe suspendue dont le cône grésille), tapis roulant (bande qui défile, rouleaux), caisses en volume selon leur
// genre (quatre « ? » neutres : aucune couleur de rareté avant l'ouverture), fusil d'assaut et mains gantées, deux zombies du jeu. Le rendu suit la
// chronologie pure (js/core/ouverture.js : instant(chrono, reglages, t)) : il ne décide rien, le temps est en argument. Une seule lumière projette
// des ombres ; particules en tampons réutilisés ; géométries et matériaux créés une fois, libérés par liberer() (contexte WebGL perdu de force).
import * as THREE from 'three';
import { instant, progres } from '../../core/ouverture.js';
import { BOUT, CAISSE, TAPIS, caisseGeo, fusilGeo, lampeGeo, pilesGeo, tapisGeo } from './modeles.js';
import { creerTextures } from './textures.js';
import { creerZombies } from './zombies.js';

// Écart entre deux caisses sur le tapis ; demi-largeur de la promenade des zombies ; profondeur des zombies.
const ECART = 300;
const LARGEUR_ZOMBIES = 600;
const Z_ZOMBIES = -430;
const PROFONDEUR_ECRASE = 90;
const OEIL = Object.freeze({ y: 124, cible: [0, 70, TAPIS.z], depart: 380 });
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
  porte.position.set(0, 170, -678);
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

  // --- Fusil à la première personne ---------------------------------------------------------------------------------------------------------
  const FG = fusilGeo();
  for (const g of Object.values(FG)) geo(g);
  const texArme = T.metal('--ouv-arme', 31);
  const fusil = new THREE.Group();
  const meshesFusil = [
    new THREE.Mesh(FG.arme, mat(new THREE.MeshPhongMaterial({ color: NEUTRE, map: texArme, shininess: 48, specular: SPEC_METAL }))),
    new THREE.Mesh(FG.polymere, mat(new THREE.MeshPhongMaterial({ color: col('--ouv-polymere'), shininess: 10, specular: SPEC_MAT }))),
    new THREE.Mesh(FG.gant, mat(new THREE.MeshPhongMaterial({ color: col('--ouv-gant'), shininess: 10, specular: SPEC_MAT }))),
    new THREE.Mesh(FG.manche, mat(new THREE.MeshPhongMaterial({ color: col('--ouv-manche'), shininess: 10, specular: SPEC_MAT }))),
    new THREE.Mesh(FG.lentille, mat(new THREE.MeshBasicMaterial({ color: col('--ouv-lentille') }))),
    new THREE.Mesh(FG.point, mat(new THREE.MeshBasicMaterial({ color: col('--ouv-point') }))),
  ];
  fusil.add(...meshesFusil);
  // Lueur propre du fusil, des gants et des manches (sans lumière d'appoint) : ils restent lisibles au premier plan.
  for (const m of meshesFusil.slice(1, 4)) m.material.emissive.copy(m.material.color).multiplyScalar(0.12);
  meshesFusil[0].material.emissive.setScalar(0.025);
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
  const texSang = T.sang();
  const sang = new THREE.Mesh(geo(new THREE.PlaneGeometry(1, 1).translate(0, -0.5, 0)), mat(new THREE.MeshBasicMaterial({ map: texSang, transparent: true, opacity: 0, depthWrite: false, depthTest: false })));
  sang.position.z = -34;
  sang.renderOrder = 12;
  sang.visible = false;
  camera.add(sombre);
  devant.add(sang);

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
    return { ...z, sprite, poussiere, projete: false };
  });

  // --- Cadrage : champ selon le rapport largeur / hauteur ; fusil en bas à droite, canon vers le centre --------------------------------------
  let largeur = 932;
  let hauteur = 430;
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
  fusil.rotation.order = 'YXZ';
  const vise = new THREE.Vector3();
  function poseFusil(x, y, rz, recul) {
    // Boîtier en bas à droite (cibles normalisées de l'écran, comme la maquette), canon vers un point juste sous le centre (la caisse).
    const d = 24;
    const { h, w } = demi(d);
    const px = Math.min(w * 0.36, h * 0.9);
    const py = -h * 0.74;
    fusil.position.set(px + x, py + y, -d + recul * 4.5);
    const loin = demi(300);
    vise.set(-px * 0.2, -loin.h * 0.1, -300).sub(fusil.position);
    fusil.rotation.set(Math.atan2(vise.y, Math.hypot(vise.x, vise.z)) + recul * 0.14, Math.atan2(-vise.x, -vise.z), rz);
  }

  // --- Images ---------------------------------------------------------------------------------------------------------------------------------
  const v1 = new THREE.Vector3();
  const v2 = new THREE.Vector3();
  const v3 = new THREE.Vector3();
  const q1 = new THREE.Quaternion();
  const q2 = new THREE.Quaternion();
  const qRot = new THREE.Quaternion();
  const AX = new THREE.Vector3(1, 0, 0);
  const AZ = new THREE.Vector3(0, 0, 1);
  const AY = new THREE.Vector3(0, 1, 0);
  const regard = new THREE.Vector3(...OEIL.cible);
  const pic = { appels: 0, triangles: 0 };
  const dernier = { appels: 0, triangles: 0 };
  const ouvertureDe = (k, v) => v.set(-ECART * k.position, TAPIS.y + CG.haut, TAPIS.z);

  function rendre(t) {
    const s = instant(chrono, reglages, t);
    // Caméra : marche jusqu'au tapis (balancement à chaque pas), secousse selon la rareté.
    const avance = s.marche.avance;
    const pasPhase = s.marche.pas;
    const balance = s.marche.enMarche ? Math.abs(Math.sin(Math.PI * pasPhase)) : 0;
    const sec = s.secousse * 0.45;
    camera.position.set(Math.sin(Math.PI * pasPhase) * 1.4 * (s.marche.enMarche ? 1 : 0) + sec * bruit(t, 1), OEIL.y + balance * 3.2 - 1.6 * (s.marche.enMarche ? 1 : 0) + sec * bruit(t, 2), OEIL.depart * (1 - avance));
    camera.lookAt(regard);
    camera.rotation.z += sec * 0.004 * bruit(t, 3);
    // Fusil : se balance en marchant, respire, recule au tir.
    const sw = s.marche.enMarche ? Math.sin(Math.PI * pasPhase) : 0;
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
        matRayons.opacity = (active.rayons < 1 ? active.rayons : 0.78) * depart;
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
        boule.visible = true;
        boule.position.copy(v2).add(v3.set(0, 18 + p * 30, 0));
        // Retour du propriétaire (« on ne voit pas l'explosion ») : boule qui gonfle vite puis reste visible après l'éclair d'écran, cœur clair,
        // éclat bref, gerbe d'éclats projetés.
        boule.scale.setScalar(40 + 260 * Math.min(1, p * 2.2) + 60 * p);
        boule.material.opacity = Math.min(1, 1.25 * (1 - p));
        coeur.material.opacity = Math.min(1, 1.4 * (1 - p) ** 1.5);
        eclat.visible = p < 0.35;
        eclat.position.copy(boule.position);
        eclat.scale.setScalar(80 + 900 * p);
        eclat.material.opacity = 1 - p / 0.35;
        etincelles.visible = true;
        etincelles.material.opacity = Math.min(1, 1.6 * (1 - p));
        etincelles.material.size = 22;
        const pos = etincelles.geometry.attributes.position;
        for (let k = 0; k < MAX_ETINCELLES; k += 1) {
          const a = (k / MAX_ETINCELLES) * TAU + 0.3;
          const r = (60 + (k % 4) * 30) * Math.sqrt(p) * 2.2;
          pos.setXYZ(k, boule.position.x + Math.cos(a) * r, boule.position.y + Math.sin(a) * r * 0.8 - p * p * 140, boule.position.z + ((k % 3) - 1) * 30 * p);
        }
        pos.needsUpdate = true;
      }
      if (active.ouverte) {
        lumRarete.color.copy(couleurR);
        lumRarete.position.copy(v2).add(v3.set(0, 40, 30));
        lumRarete.intensity = active.lumiere * (2.2 + fx.eclair * 4) * depart + active.explosion * 10 * (1 - active.explosion);
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
      haloCarte.material.opacity = c.halo ? 0.55 * (1 - kc.objet.vol) : 0;
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
      if (z.projete !== Boolean(proj)) {
        z.projete = Boolean(proj);
        // Projeté : dans la surcouche (dessinée après la scène, devant tout) ; à sa place : dans la scène.
        (proj ? surcouche : scene).add(root);
        root.traverse((o) => {
          if (o.isMesh) o.frustumCulled = !proj;
        });
      }
      const xMonde = e.x * LARGEUR_ZOMBIES;
      if (proj) {
        // Assez loin pour que la perspective ne grossisse pas les membres proches ; aplati dans la profondeur ; à la hauteur de la carte (qu'il
        // cache jusqu'à sa glissade).
        const { h, w } = demi(PROFONDEUR_ECRASE);
        // Échelle d'écrasement : le corps (≈ 62 unités) prend presque toute la largeur de l'écran.
        const ecrase = (2 * w * 0.94) / 62;
        const yColle = h * 0.3;
        // Orientation finale : face à la caméra, couché en travers de l'écran (tête à gauche), légèrement penché ; centré sur le milieu du corps.
        q2.copy(camera.quaternion).multiply(qRot.setFromAxisAngle(AZ, Math.PI / 2 - 0.1)).multiply(q1.setFromAxisAngle(AY, Math.PI));
        v2.set(0, P.phase === 'glisse' ? yColle - P.p * (h * 2.4) : yColle, -PROFONDEUR_ECRASE);
        camera.localToWorld(v2);
        v2.sub(v3.set(0, 30 * ecrase, 0).applyQuaternion(q2));
        if (P.phase === 'vol') {
          const p = P.p;
          v3.set(xMonde, 0, Z_ZOMBIES);
          root.position.lerpVectors(v3, v2, p);
          root.position.y += Math.sin(p * Math.PI) * 140;
          q1.setFromAxisAngle(AY, e.sens > 0 ? Math.PI / 2 : -Math.PI / 2);
          root.quaternion.slerpQuaternions(q1, q2, p).multiply(qRot.setFromAxisAngle(AX, TAU * 2 * p));
          root.scale.setScalar(z.base + (ecrase - z.base) * p);
        } else {
          root.position.copy(v2);
          root.quaternion.copy(q2);
          const ecrasement = P.phase === 'colle' ? 1 - 0.12 * Math.sin(Math.min(1, P.p * 4) * Math.PI) : 1;
          root.scale.set(ecrase * ecrasement, ecrase, ecrase * 0.3);
        }
        z.c.setAnim('mortAvant', 0.22, {}, t);
      } else {
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
    sang.visible = false;
    if (actifP) {
      const P = actifP.projection;
      const c = actifP.trainees;
      if (t >= c[0] && t < c[1]) {
        const { h, w } = demi(34);
        const p = progres(t, P.decolle, P.bas);
        sang.visible = true;
        sang.position.set(0, h * 0.2, -34);
        sang.scale.set(w * 1.6, Math.max(0.01, p * h * 2.2), 1);
        sang.material.opacity = 0.92 * (1 - progres(t, P.bas, c[1]));
      }
    }

    renderer.info.reset();
    renderer.clear();
    renderer.render(scene, camera);
    if (zs.some((z) => z.projete) || sang.visible) {
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
    const caches = [rayons, ...ondes, particules, etincelles, boule, eclat, trainee, flamme, carte, sombre, sang, ...zs.flatMap((z) => [z.sprite, z.poussiere]), ...pool.map((p) => p.g)];
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
