// Lot 9c — Atelier des armes (atelier-armes.html, page technique à retirer au lot 13 ; Docs/ref/armes.md). Un seul contexte WebGL :
// chaque vue est rendue puis copiée dans son canevas 2D. Rien n'est écrit dans le stockage ; aucune requête externe ; la partie et le menu
// ne chargent aucun de ces modules. ?test=1 : window.__zsArmes (état, construction de toutes les variantes, mesures).
import * as THREE from 'three';
import { translate } from '../i18n.js';
import { createV2Kit } from '../game/character-v2.js';
import { createTokenLookup, readPalette } from '../game/palette.js';
import { buildSpec, createTextureData } from '../core/texgen.js';
import { fitDistance } from '../core/viewport.js';
import { armeParId, avecEchelle, budgetDe, echelleJeu, lireArmes, lireChoix, maillageArme, varianteDe } from '../core/armes/armes.js';
import { ancreTexte } from '../core/armes/caisse.js';
import { REGLES, echantillons, poserArme } from './tenue.js';
import { visuelArme } from '../core/armes/visuel.js';
import { creerKitArmes, lirePalette } from './rendu.js';

const query = new URLSearchParams(location.search);
const testMode = query.get('test') === '1';
const reduit = matchMedia('(prefers-reduced-motion: reduce)').matches;
const $ = (id) => document.getElementById(id);
const fmt = (text, params) => String(text).replace(/\{(\w+)\}/g, (_, k) => String(params?.[k] ?? ''));
const n1 = (v) => (Number.isFinite(v) ? (Math.round(v * 10) / 10).toString().replace('.', ',') : '–');
const n2 = (v) => (Number.isFinite(v) ? v.toFixed(2).replace('.', ',') : '–');
const charger = async (chemin) => {
  const r = await fetch(chemin);
  if (!r.ok) throw new Error(`${chemin} : ${r.status}`);
  return r.json();
};

const [dict, armesJson, characters, poses, render, texturesJson, world, lumieres] = await Promise.all([
  'data/i18n/atelier-armes.json', 'data/armes/armes.json', 'data/game/characters-v2.json', 'data/game/poses-v2.json', 'data/game/render.json',
  'data/game/textures.json', 'data/game/maps/rez-de-chaussee/world.json', 'data/game/lumieres.json',
].map(charger));
const choixJson = await charger('data/armes/armes-choix.json').catch(() => null);
const posesJson = await charger('data/armes/poses.json').catch(() => null); // poses de tenue enregistrées (règles et armes posées)
const t = (key, params) => fmt(translate(dict, key), params);
for (const node of document.querySelectorAll('[data-i18n]')) node.textContent = t(node.dataset.i18n);
$('app').hidden = false;
const status = $('status');
status.textContent = t('dev.armes.chargement');

const base = lireArmes(armesJson);
const choix = lireChoix(base, choixJson);
// Échelle (retours du propriétaire, lot 9c-G) : données, remplacées par le fichier de choix, puis par les curseurs de l'atelier (en mémoire).
let donnees = avecEchelle(base, choix.echelle);
const palette = lirePalette();
const lookup = createTokenLookup();
const jeu = readPalette();
const UPM = donnees.echelle.unitesParMetre;

// --- État -----------------------------------------------------------------------------------------------------------------------------
const etat = {
  arme: donnees.armes[0]?.id ?? null,
  variante: null,
  lumiere: 'jeu',
  pistolet: 'masque',
  caisse: 'caisse',
  craie: true,
  rotation: !reduit,
  tenue: 'adaptee',
  mode: 'deux-mains', // pistolet : à deux mains ou à une main
  yaw: 0.6,
  pitch: 0.35,
};
etat.variante = choix.variantes[etat.arme] ?? null;
const proposition = { variantes: { ...(choixJson?.variantes && typeof choixJson.variantes === 'object' ? choixJson.variantes : {}) }, armeSpeciale: choix.armeSpeciale };
const mesures = {};
let rendus = 0;

// --- Rendu : un seul contexte WebGL ----------------------------------------------------------------------------------------------------
let renderer = null;
try {
  renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1);
} catch {
  renderer = null;
  $('webgl-erreur').hidden = false;
}
let kit = creerKitArmes({ donnees, palette });
let tenueInfo = null;

// Rendu d'une scène dans un canevas 2D (taille du canevas) ; renvoie { calls, triangles } de ce rendu.
function rendre(scene, camera, canvas, { x = 0, y = 0, w = canvas.width, h = canvas.height, effacer = true } = {}) {
  if (!renderer) return { calls: 0, triangles: 0 };
  renderer.setSize(w, h, false);
  renderer.render(scene, camera);
  const ctx = canvas.getContext('2d');
  if (effacer) ctx.clearRect(x, y, w, h);
  ctx.drawImage(renderer.domElement, 0, 0, w, h, x, y, w, h);
  rendus += 1;
  return { calls: renderer.info.render.calls, triangles: renderer.info.render.triangles };
}

// --- Sol, lumières, personnage --------------------------------------------------------------------------------------------------------
const solImg = createTextureData(buildSpec(texturesJson.textures.find((e) => e.id === 'sol-salle'), lookup));
const solTex = new THREE.DataTexture(new Uint8Array(solImg.data.buffer), solImg.width, solImg.height, THREE.RGBAFormat);
solTex.colorSpace = THREE.SRGBColorSpace;
solTex.wrapS = THREE.RepeatWrapping;
solTex.wrapT = THREE.RepeatWrapping;
solTex.generateMipmaps = true;
solTex.minFilter = THREE.LinearMipmapLinearFilter;
solTex.needsUpdate = true;
const SOL = 3000;
const repeatSol = texturesJson.textures.find((e) => e.id === 'sol-salle')?.repeat ?? 600;
solTex.repeat.set(SOL / repeatSol, SOL / repeatSol);
const solGeo = new THREE.PlaneGeometry(SOL, SOL);
solGeo.rotateX(-Math.PI / 2);
const solMat = new THREE.MeshLambertMaterial({ map: solTex });
const murMat = new THREE.MeshLambertMaterial({ color: jeu.wall });

function scene3D({ sol = true } = {}) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(jeu.fog);
  const lumieresGroupe = new THREE.Group();
  scene.add(lumieresGroupe);
  let floor = null;
  if (sol) {
    floor = new THREE.Mesh(solGeo, solMat);
    scene.add(floor);
  }
  return { scene, lumieres: lumieresGroupe, floor };
}

// Lumières : 'jeu' (ambiante et soleil de render.json), 'lune' (nuit de lumieres.json : ambiante réduite et lune), 'lampe' (nuit + lampe à huile).
function eclairer(groupe, mode, lampeAt = [70, 50, 40]) {
  groupe.clear();
  const L = render.light;
  const nuit = mode !== 'jeu';
  groupe.add(new THREE.AmbientLight(jeu.ambient, L.ambient * (nuit ? Math.max(lumieres.ambiance ?? 0.3, lumieres.plancherAmbiance ?? 0.2) : 1)));
  const sun = new THREE.DirectionalLight(jeu.sun, L.sun * (nuit ? lumieres.lune?.intensite ?? 0.15 : 1));
  sun.position.set(L.sunOffset.x, L.sunOffset.y, L.sunOffset.z);
  groupe.add(sun, sun.target);
  if (mode === 'lampe') {
    const lampe = new THREE.PointLight(jeu.lampLight, lumieres.intensite ?? 650, lumieres.distance ?? 240, lumieres.decroissance ?? 1);
    lampe.position.set(...lampeAt);
    groupe.add(lampe);
  }
}

// Personnage du jeu (variante « riche », tenue « sable », comme persos-choix.json), avec ou sans le pistolet actuel ; lecture seule :
// le pistolet est retiré d'une copie en mémoire des données, rien n'est modifié.
const PIECES_PISTOLET = ['gunGrip', 'gunSlide'];
const sansPistolet = JSON.parse(JSON.stringify(characters));
for (const slot of sansPistolet.slots) for (const v of slot.variants) if (Array.isArray(v.parts)) v.parts = v.parts.filter((p) => !PIECES_PISTOLET.includes(p.id));
const kitOpts = { poses, lookup, hit: jeu.hit, choice: 'riche', styleAnim: { joueur: 'A' }, outfitsOf: { joueur: ['sable'] }, seed: 3 };
const kits = { visible: createV2Kit({ ...kitOpts, characters }), masque: createV2Kit({ ...kitOpts, characters: sansPistolet }) };
function personnage(avecPistolet) {
  const p = kits[avecPistolet ? 'visible' : 'masque'].create('player', 0, { choice: 'riche' });
  p.setAnim('repos', 0.25, {}, 0);
  p.root.updateMatrixWorld(true);
  return p;
}
// Main droite : le centre de la poignée du pistolet actuel (pièce gunGrip, repère de l'articulation « prop »).
const MAIN = (() => {
  const v = characters.slots.find((s) => s.id === 'joueur')?.variants.find((x) => x.id === 'riche');
  const g = v?.parts?.find((p) => p.id === 'gunGrip');
  return g ? [g.offset[0], g.offset[1] + 1.2, g.offset[2]] : [0, -2, -3.5];
})();

// --- Vue « en jeu » --------------------------------------------------------------------------------------------------------------------
const distanceJeu = fitDistance(667 / 375, { width: world.room.width, height: world.room.height }, render.camera.tilt, render.camera.fov, render.camera.margin) / (world.zoom ?? 2.5);
function cameraJeu(w, h, cible = [0, 0, 0]) {
  const cam = new THREE.PerspectiveCamera(render.camera.fov, w / h, render.camera.near ?? 20, render.camera.far ?? 9000);
  const a = (render.camera.tilt * Math.PI) / 180;
  cam.position.set(cible[0], distanceJeu * Math.sin(a), cible[2] + distanceJeu * Math.cos(a));
  cam.lookAt(cible[0], 0, cible[2]);
  cam.updateMatrixWorld(true);
  return cam;
}

const vueJeu = scene3D();
let joueur = null;
let armeEnMain = null;
function poserArmeEnMain() {
  if (joueur) {
    vueJeu.scene.remove(joueur.root);
    joueur.dispose();
  }
  joueur = personnage(etat.pistolet === 'visible');
  joueur.root.rotation.y = Math.PI * 0.12; // de trois quarts : l'arme se lit mieux qu'exactement vers le nord
  vueJeu.scene.add(joueur.root);
  if (etat.tenue === 'adaptee' && posesJson?.armes?.[etat.arme]) {
    // Pose de tenue (aperçu du lot d'intégration) : calculée sur cette instance avec les règles de data/armes/poses.json, à l'échelle commune
    // choisie (les poses du fichier valent pour le facteur du fichier).
    const support = new THREE.Group();
    const a = armeParId(donnees, etat.arme);
    tenueInfo = poserArme(joueur, a, echelleJeu(donnees), support, { points: pointsArme(etat.arme, etat.variante), regles: { ...REGLES, ...(posesJson.regles ?? {}) }, mode: etat.mode });
    // Réservoirs du lance-flammes : sur le dos, tournés avec le torse (décalage et rotation calculés par la pose).
    const dos = tenueInfo.arme.dos ? { dos: tenueInfo.arme.dos.decalage, lacet: tenueInfo.arme.dos.lacet } : {};
    armeEnMain = kit.mesh(etat.arme, etat.variante, 'main', { ...dos, enJeu: true });
    armeEnMain.userData.reelle = kit.mesh(etat.arme, etat.variante, 'main', dos).geometry;
    support.add(armeEnMain);
  } else {
    tenueInfo = null;
    const prop = joueur.root.getObjectByName('prop');
    armeEnMain = kit.mesh(etat.arme, etat.variante, 'main', { enJeu: true });
    armeEnMain.userData.reelle = kit.mesh(etat.arme, etat.variante, 'main').geometry;
    armeEnMain.position.set(...MAIN);
    prop?.add(armeEnMain);
  }
  joueur.root.updateMatrixWorld(true);
}

// Surface de l'arme (sans réservoirs ni tuyau, vraie largeur) pour éviter qu'elle traverse le corps ; en cache par arme, variante et échelle.
const cachePoints = new Map();
function pointsArme(armeId, varianteId) {
  const k = `${armeId}:${varianteId}:${donnees.echelle.lisibilite}`;
  if (!cachePoints.has(k)) {
    const a = armeParId(donnees, armeId);
    cachePoints.set(k, echantillons(maillageArme(donnees, a, varianteDe(a, varianteId), { pose: 'seule' }).positions));
  }
  return cachePoints.get(k);
}

// Vue rapprochée de la tenue : trois quarts avant droit et dessus, autour du personnage (même scène, même lumière).
// La largeur vue de dessus ne vaut qu'en jeu : la vue rapprochée montre la vraie largeur (géométrie échangée le temps du rendu).
// Vues de face, de côté et de dessus à la taille du jeu (pixels par unité de la caméra du jeu à 375 ou 1080 pixels de haut) : face et côté
// en vraie largeur, dessus avec la largeur « en jeu ».
const pxParUnite = (h) => h / (2 * distanceJeu * Math.tan((render.camera.fov * Math.PI) / 360));
const camVue = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 2000);
function dessinerPoses() {
  for (const [id, h] of [['cv-poses-petit', 375], ['cv-poses-grand', 1080]]) {
    const canvas = $(id);
    const w = canvas.width / 3;
    const k = pxParUnite(h);
    const demi = w / (2 * k);
    const racine = joueur.root;
    const angle = racine.rotation.y;
    racine.rotation.y = 0; // face au sud (vers la caméra de face), comme le personnage de référence
    racine.updateMatrixWorld(true);
    const centre = new THREE.Vector3(0, 32, 4).applyMatrix4(racine.matrixWorld);
    const enJeu = armeEnMain.geometry;
    for (const [i, vue] of ['face', 'cote', 'dessus'].entries()) {
      armeEnMain.geometry = vue === 'dessus' ? enJeu : armeEnMain.userData.reelle ?? enJeu;
      Object.assign(camVue, { left: -demi, right: demi, top: demi * (canvas.height / w), bottom: -demi * (canvas.height / w) });
      const dir = { face: new THREE.Vector3(0, 0, 1), cote: new THREE.Vector3(-1, 0, 0), dessus: new THREE.Vector3(0, 1, 0) }[vue];
      camVue.position.copy(centre).add(dir.multiplyScalar(300));
      camVue.up.set(0, vue === 'dessus' ? 0 : 1, vue === 'dessus' ? -1 : 0);
      camVue.lookAt(centre);
      camVue.updateProjectionMatrix();
      camVue.updateMatrixWorld(true);
      rendre(vueJeu.scene, camVue, canvas, { x: i * w, y: 0, w, h: canvas.height });
    }
    armeEnMain.geometry = enJeu;
    racine.rotation.y = angle;
    racine.updateMatrixWorld(true);
  }
}

function dessinerTenue() {
  dessinerPoses();
  const enJeu = armeEnMain.geometry;
  armeEnMain.geometry = armeEnMain.userData.reelle ?? enJeu;
  const canvas = $('cv-tenue');
  const w = canvas.width / 2;
  const h = canvas.height;
  const centre = new THREE.Vector3(0, 36, 6).applyMatrix4(joueur.root.matrixWorld);
  for (const [i, dir] of [[0, new THREE.Vector3(-0.75, 0.45, 0.9)], [1, new THREE.Vector3(0, 1, 0.02)]]) {
    const cam = new THREE.PerspectiveCamera(32, w / h, 1, 2000);
    cam.position.copy(centre).add(dir.normalize().multiplyScalar(i ? 150 : 120));
    cam.lookAt(centre);
    cam.updateMatrixWorld(true);
    rendre(vueJeu.scene, cam, canvas, { x: i * w, y: 0, w, h });
  }
  armeEnMain.geometry = enJeu;
  const c = tenueInfo?.controle;
  $('tenue-mesures').textContent = c
    ? t('dev.armes.tenue.mesures', { pose: t(`dev.armes.tenue.genre.${tenueInfo.pose}`), torse: tenueInfo.torse, ep: n1(tenueInfo.epaules), bras: n2(tenueInfo.bras), d: n2(c.droite), g: n2(c.gauche), t: c.traverse, v: n1(c.visee), av: n1(c.devant) })
    : t(etat.tenue === 'adaptee' ? 'dev.armes.tenue.avenir' : 'dev.armes.tenue.actuelle');
  $('ctl-mode').disabled = armeParId(donnees, etat.arme)?.prises?.tenue !== 'pistolet';
}

// Rectangle des pixels non noirs d'une image (mesure de taille à l'écran).
function boite(canvas) {
  const { width: w, height: h } = canvas;
  const d = canvas.getContext('2d').getImageData(0, 0, w, h).data;
  let x0 = w;
  let y0 = h;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const k = (y * w + x) * 4;
      if (d[k] + d[k + 1] + d[k + 2] > 9) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }
  return x1 < 0 ? { w: 0, h: 0 } : { w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

// Mesure à l'écran (fond noir, sans sol, lumière du jeu) : personnage entier, puis arme seule.
function mesurerJeu(w, h) {
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  const fond = vueJeu.scene.background;
  vueJeu.scene.background = new THREE.Color(0, 0, 0);
  vueJeu.floor.visible = false;
  eclairer(vueJeu.lumieres, 'jeu');
  const cam = cameraJeu(w, h);
  rendre(vueJeu.scene, cam, cv);
  const perso = boite(cv);
  joueur.body.visible = false;
  rendre(vueJeu.scene, cam, cv);
  const arme = boite(cv);
  joueur.body.visible = true;
  vueJeu.floor.visible = true;
  vueJeu.scene.background = fond;
  eclairer(vueJeu.lumieres, etat.lumiere);
  return { perso, arme };
}

function dessinerJeu() {
  poserArmeEnMain();
  eclairer(vueJeu.lumieres, etat.lumiere);
  const lignes = [];
  for (const [id, w, h] of [['cv-jeu', 667, 375], ['cv-jeu-grand', 1920, 1080]]) {
    const r = rendre(vueJeu.scene, cameraJeu(w, h), $(id));
    const m = mesurerJeu(w, h);
    const info = kit.infos(etat.arme, etat.variante);
    mesures[`${w}x${h}`] = { ...m, appels: r.calls };
    lignes.push(t('dev.armes.jeu.mesures', { taille: `${w} × ${h}`, pw: m.perso.w, ph: m.perso.h, aw: m.arme.w, ah: m.arme.h, l: n1(info.longueur), lr: n2(info.longueur / UPM / donnees.echelle.lisibilite) }));
  }
  $('jeu-mesures').textContent = lignes.join(' ');
  dessinerTenue();
}

// --- Vue « sur la caisse » -------------------------------------------------------------------------------------------------------------
const vueCaisse = scene3D();
const groupeCaisse = new THREE.Group();
groupeCaisse.rotation.y = -Math.PI / 2; // longueur de la caisse d'est en ouest, face marquée (et couvercle) vers la caméra
vueCaisse.scene.add(groupeCaisse);
const passant = personnage(true);
passant.root.rotation.y = Math.PI;
vueCaisse.scene.add(passant.root);

function dessinerCaisse() {
  groupeCaisse.clear();
  const d = kit.dimensions(etat.caisse);
  groupeCaisse.add(kit.caisse(etat.caisse));
  const arme = kit.mesh(etat.arme, etat.variante, 'caisse');
  arme.position.set(0, d.appui, 0);
  groupeCaisse.add(arme);
  if (etat.craie) groupeCaisse.add(kit.craie(etat.caisse));
  const mur = new THREE.Mesh(new THREE.BoxGeometry(40, 60, 240), murMat);
  mur.position.set(-d.p / 2 - 21, 30, 0);
  groupeCaisse.add(mur);
  passant.root.position.set(0, 0, d.p / 2 + (etat.caisse === 'caisse' ? d.p + 30 : 40));
  eclairer(vueCaisse.lumieres, etat.lumiere, [60, 55, 50]);
  const cam = cameraJeu(667, 375, [0, 0, 20]);
  const canvas = $('cv-caisse');
  const r = rendre(vueCaisse.scene, cam, canvas);
  mur.geometry.dispose();
  // Texte d'achat : ancre au-dessus de la caisse, projetée à l'écran.
  const etiquette = $('etiquette');
  etiquette.hidden = !etat.craie;
  const ancre = new THREE.Vector3(...ancreTexte(d)).applyMatrix4(groupeCaisse.matrixWorld).project(cam);
  etiquette.style.left = `${((ancre.x + 1) / 2) * canvas.width}px`;
  etiquette.style.top = `${((1 - ancre.y) / 2) * canvas.height}px`;
  const prix = donnees.approche?.exemple?.prix ?? 500;
  etiquette.textContent = t('dev.armes.caisse.prix', { nom: armeParId(donnees, etat.arme)?.nom ?? '', prix });
  const info = kit.infos(etat.arme, etat.variante);
  const max = d.appui + info.hauteurCouchee;
  mesures.caisse = { type: etat.caisse, hauteur: d.h, max, triangles: kit.trianglesCaisse(etat.caisse), appels: r.calls };
  $('caisse-mesures').textContent = t('dev.armes.caisse.mesures', { type: t(`dev.armes.caisse.${etat.caisse}`), l: d.l, p: d.p, h: d.h, max: n1(Math.max(d.h, max)), t: kit.trianglesCaisse(etat.caisse) });
}

// --- Gros plan qui tourne --------------------------------------------------------------------------------------------------------------
const vueGros = scene3D({ sol: false });
eclairer(vueGros.lumieres, 'jeu');
const pivot = new THREE.Group();
vueGros.scene.add(pivot);
const camGros = new THREE.PerspectiveCamera(30, 2, 1, 2000);
let longueurGros = 10;
function poserGros() {
  pivot.clear();
  const m = kit.mesh(etat.arme, etat.variante, 'main');
  const b = kit.maillage(etat.arme, etat.variante, 'main').bornes;
  m.position.set(-(b.min[0] + b.max[0]) / 2, -(b.min[1] + b.max[1]) / 2, -(b.min[2] + b.max[2]) / 2);
  pivot.add(m);
  longueurGros = Math.max(4, b.max[2] - b.min[2]);
}
function dessinerGros() {
  const dist = longueurGros * 2.1;
  camGros.position.set(Math.sin(etat.yaw) * Math.cos(etat.pitch) * dist, Math.sin(etat.pitch) * dist, Math.cos(etat.yaw) * Math.cos(etat.pitch) * dist);
  camGros.lookAt(0, 0, 0);
  camGros.updateMatrixWorld(true);
  rendre(vueGros.scene, camGros, $('cv-gros-plan'));
}
let dernier = null;
function boucle(temps) {
  if (etat.rotation && !reduit) {
    if (dernier !== null) etat.yaw += Math.min(0.1, (temps - dernier) / 1000) * 0.5;
    dernier = temps;
    dessinerGros();
    requestAnimationFrame(boucle);
  } else dernier = null;
}
const scene = $('cv-gros-plan').parentElement;
let glisse = null;
scene.addEventListener('pointerdown', (e) => {
  glisse = { x: e.clientX, y: e.clientY };
  scene.setPointerCapture?.(e.pointerId);
});
scene.addEventListener('pointermove', (e) => {
  if (!glisse) return;
  etat.yaw += (e.clientX - glisse.x) * 0.01;
  etat.pitch = Math.max(-1.2, Math.min(1.2, etat.pitch + (e.clientY - glisse.y) * 0.01));
  glisse = { x: e.clientX, y: e.clientY };
  dessinerGros();
});
for (const ev of ['pointerup', 'pointercancel']) scene.addEventListener(ev, () => { glisse = null; });
const btnRotation = $('btn-rotation');
btnRotation.setAttribute('aria-pressed', String(etat.rotation));
btnRotation.disabled = reduit;
btnRotation.addEventListener('click', () => {
  etat.rotation = !etat.rotation;
  btnRotation.setAttribute('aria-pressed', String(etat.rotation));
  if (etat.rotation) requestAnimationFrame(boucle);
});

// --- Vues orthographiques (comparaison, planche) ---------------------------------------------------------------------------------------
const vueOrtho = scene3D({ sol: false });
eclairer(vueOrtho.lumieres, 'jeu');
const camOrtho = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 1000);
// Rend un objet vu de dessus ('dessus' : bouche à droite, comme le profil) ou de profil droit ('profil') dans une case du canevas.
function caseOrtho(objet, centre, demiLargeur, vue, canvas, rect) {
  vueOrtho.scene.add(objet);
  const demiHauteur = (demiLargeur * rect.h) / rect.w;
  Object.assign(camOrtho, { left: -demiLargeur, right: demiLargeur, top: demiHauteur, bottom: -demiHauteur });
  if (vue === 'dessus') {
    camOrtho.position.set(centre[0], centre[1] + 200, centre[2]);
    camOrtho.up.set(1, 0, 0);
  } else {
    camOrtho.position.set(centre[0] - 200, centre[1], centre[2]);
    camOrtho.up.set(0, 1, 0);
  }
  camOrtho.lookAt(...centre);
  camOrtho.updateProjectionMatrix();
  camOrtho.updateMatrixWorld(true);
  const r = rendre(vueOrtho.scene, camOrtho, canvas, { ...rect, effacer: true });
  vueOrtho.scene.remove(objet);
  return r;
}
const centreDe = (b) => [(b.min[0] + b.max[0]) / 2, (b.min[1] + b.max[1]) / 2, (b.min[2] + b.max[2]) / 2];

function dessinerComparaison() {
  const arme = armeParId(donnees, etat.arme);
  const canvas = $('cv-comparaison');
  const n = arme.variantes.length;
  const w = Math.floor(canvas.width / n);
  const h = Math.floor(canvas.height / 2);
  const L = Math.max(...arme.variantes.map((v) => kit.infos(arme.id, v.id).longueur));
  arme.variantes.forEach((v, i) => {
    const b = kit.maillage(arme.id, v.id, 'main').bornes;
    for (const [j, vue] of [[0, 'dessus'], [1, 'profil']]) caseOrtho(kit.mesh(arme.id, v.id, 'main'), centreDe(b), L * 0.56, vue, canvas, { x: i * w, y: j * h, w, h });
  });
  const retenue = choix.variantes[arme.id];
  $('comparaison-legende').textContent = t('dev.armes.comparaison.legende', { arme: arme.nom, liste: arme.variantes.map((v) => `${v.id.toUpperCase()} ${v.nom}${v.id === retenue ? ` (${t('dev.armes.retenue')})` : ''}`).join(' · ') });
}

function dessinerPlanche() {
  const canvas = $('cv-planche');
  const k = 12; // pixels par unité
  const marge = 16;
  const colPerso = 300;
  const rangs = donnees.armes.map((a) => {
    const v = choix.variantes[a.id];
    const b = kit.maillage(a.id, v, 'main').bornes;
    return { a, v, b, h: Math.ceil((b.max[1] - b.min[1] + 3) * k) };
  });
  const hauteur = Math.max(70 * k, rangs.reduce((s, r) => s + r.h, 0)) + 2 * marge;
  if (canvas.height !== hauteur) canvas.height = hauteur;
  rendre(vueOrtho.scene, camOrtho, canvas); // fond de toute la planche
  // Personnage de profil (sans le pistolet), à l'échelle.
  const p = personnage(false);
  caseOrtho(p.root, [0, 30.5, 4], colPerso / (2 * k), 'profil', canvas, { x: 0, y: marge, w: colPerso, h: 70 * k });
  p.dispose();
  let y = marge;
  const largeur = canvas.width - colPerso - marge;
  for (const r of rangs) {
    const c = centreDe(r.b);
    caseOrtho(kit.mesh(r.a.id, r.v, 'main'), [c[0], c[1], r.b.min[2] + largeur / (2 * k) - 1], largeur / (2 * k), 'profil', canvas, { x: colPerso, y, w: largeur, h: r.h });
    y += r.h;
  }
  $('planche-legende').textContent = `${t('dev.armes.planche.legende', { k })} ${rangs.map((r) => `${r.a.nom} ${n1(r.b.max[2] - r.b.min[2])}`).join(' · ')}`;
}

// --- Visuels du menu (SVG de profil, sans Three.js) -----------------------------------------------------------------------------------
const visuels = {};
function dessinerVisuels() {
  const a = armeParId(donnees, etat.arme);
  const v = varianteDe(a, etat.variante);
  const grand = visuelArme(donnees, a, v, { id: 'visuel-grand', titre: `${a.nom} — ${v.nom}` });
  $('visuel').innerHTML = grand.svg;
  $('visuel-mesures').textContent = t('dev.armes.visuel.mesures', { octets: grand.octets });
}
function dessinerVisuelsTous() {
  const hote = $('visuels-tous');
  hote.replaceChildren();
  for (const a of donnees.armes) {
    const v = varianteDe(a, choix.variantes[a.id]);
    const r = visuelArme(donnees, a, v, { id: `visuel-${a.id}`, titre: a.nom });
    visuels[a.id] = r.octets;
    const fig = document.createElement('figure');
    fig.innerHTML = r.svg;
    const legende = document.createElement('figcaption');
    legende.textContent = `${a.nom} · ${t('dev.armes.visuel.mesures', { octets: r.octets })}`;
    fig.append(legende);
    hote.append(fig);
  }
}

// --- Budget : construction de toutes les variantes, appels mesurés (une arme seule dans la scène) -------------------------------------
const vueSeule = new THREE.Scene();
const camSeule = new THREE.PerspectiveCamera(40, 1, 1, 1000);
camSeule.position.set(0, 0, 120);
camSeule.lookAt(0, 0, 0);
const cvSeul = document.createElement('canvas');
cvSeul.width = 64;
cvSeul.height = 64;
function toutes() {
  const lignes = [];
  for (const a of donnees.armes) {
    for (const v of a.variantes) {
      const m = kit.mesh(a.id, v.id, 'main');
      vueSeule.add(m);
      const r = rendre(vueSeule, camSeule, cvSeul);
      vueSeule.remove(m);
      const info = kit.infos(a.id, v.id);
      lignes.push({ arme: a.id, variante: v.id, triangles: info.triangles, budget: budgetDe(donnees, a), appels: renderer ? r.calls : 1, longueur: info.longueur, hauteurCouchee: info.hauteurCouchee });
    }
  }
  return lignes;
}
function dessinerBudget() {
  const corps = $('budget-lignes');
  corps.replaceChildren();
  for (const l of toutes()) {
    const tr = document.createElement('tr');
    const a = armeParId(donnees, l.arme);
    for (const texte of [a.nom, `${l.variante.toUpperCase()} · ${varianteDe(a, l.variante).nom}`, t('dev.armes.budget.triangles.valeur', { t: l.triangles, b: l.budget }), String(l.appels), n1(l.longueur)]) {
      const td = document.createElement('td');
      td.textContent = texte;
      tr.append(td);
    }
    corps.append(tr);
  }
  $('budget-textures').textContent = t('dev.armes.budget.textures', { a: kit.tailleAtlas, ko: Math.round(kit.octetsTextures / 1024) });
}

// --- Réglages et choix -----------------------------------------------------------------------------------------------------------------
const option = (select, valeur, texte) => {
  const o = document.createElement('option');
  o.value = valeur;
  o.textContent = texte;
  select.append(o);
};
const ctlArme = $('ctl-arme');
const ctlVariante = $('ctl-variante');
for (const a of donnees.armes) option(ctlArme, a.id, a.nom);
for (const m of ['jeu', 'lampe', 'lune']) option($('ctl-lumiere'), m, t(`dev.armes.lumiere.${m}`));
for (const m of ['masque', 'visible']) option($('ctl-pistolet'), m, t(`dev.armes.pistolet.${m}`));
for (const m of ['adaptee', 'actuelle']) option($('ctl-tenue'), m, t(`dev.armes.tenue.${m}`));
for (const m of ['deux-mains', 'une-main']) option($('ctl-mode'), m, t(`dev.armes.tenue.mode.${m}`));
for (const c of ['caisse', 'ratelier']) option($('ctl-caisse'), c, t(`dev.armes.caisse.${c}`));
function remplirVariantes() {
  ctlVariante.replaceChildren();
  const a = armeParId(donnees, etat.arme);
  for (const v of a.variantes) option(ctlVariante, v.id, `${v.id.toUpperCase()} · ${v.nom}${v.id === choix.variantes[a.id] ? ` (${t('dev.armes.retenue')})` : ''}`);
  ctlVariante.value = etat.variante;
}
function texteChoix() {
  const out = { _note: choixJson?._note ?? '', variantes: proposition.variantes, armeSpeciale: proposition.armeSpeciale, echelle: { longueur: donnees.echelle.lisibilite } };
  $('choix-texte').value = `${JSON.stringify(out, null, 2)}\n`;
  const ecarts = choix.ecarts.length ? ` ${t('dev.armes.choix.ecarts', { liste: choix.ecarts.join(' ; ') })}` : '';
  $('choix-etat').textContent = choixJson
    ? `${t('dev.armes.choix.etat', { n: Object.keys(choixJson.variantes ?? {}).length, s: armeParId(donnees, choix.armeSpeciale)?.nom ?? '–' })}${ecarts} ${t('dev.armes.choix.specialeNote')}`
    : t('dev.armes.choix.absent');
}
function infosVariante() {
  const a = armeParId(donnees, etat.arme);
  const v = varianteDe(a, etat.variante);
  $('variante-description').textContent = `${a.genre} — ${v.description}`;
  $('variante-retenue').textContent = t('dev.armes.variante.retenue', { v: `${choix.variantes[a.id].toUpperCase()} · ${varianteDe(a, choix.variantes[a.id]).nom}` });
}
function toutDessiner() {
  infosVariante();
  dessinerJeu();
  dessinerCaisse();
  poserGros();
  dessinerGros();
  dessinerComparaison();
  dessinerVisuels();
}
ctlArme.value = etat.arme;
remplirVariantes();
ctlArme.addEventListener('change', () => {
  etat.arme = ctlArme.value;
  etat.variante = choix.variantes[etat.arme];
  remplirVariantes();
  toutDessiner();
});
ctlVariante.addEventListener('change', () => {
  etat.variante = ctlVariante.value;
  toutDessiner();
});
$('ctl-lumiere').addEventListener('change', (e) => {
  etat.lumiere = e.target.value;
  dessinerJeu();
  dessinerCaisse();
});
$('ctl-mode').addEventListener('change', (e) => {
  etat.mode = e.target.value;
  dessinerJeu();
});
$('ctl-tenue').addEventListener('change', (e) => {
  etat.tenue = e.target.value;
  dessinerJeu();
});
// Curseurs d'échelle : le kit est reconstruit (géométries et textures libérées), toutes les vues redessinées ; rien n'est enregistré.
// Un seul curseur (décision du propriétaire) : le facteur commun de taille de toutes les armes.
const VALEUR = { longueur: 'lisibilite' };
const SORTIE = { longueur: 'out-longueur' };
for (const [id, cle] of [['ctl-longueur', 'longueur']]) {
  const ctl = $(id);
  ctl.value = String(donnees.echelle[VALEUR[cle]]);
  $(SORTIE[cle]).textContent = `× ${n2(Number(ctl.value))}`;
  ctl.addEventListener('change', () => {
    donnees = avecEchelle(donnees, { [cle]: Number(ctl.value) });
    $(SORTIE[cle]).textContent = `× ${n2(Number(ctl.value))}`;
    kit.dispose();
    kit = creerKitArmes({ donnees, palette });
    toutDessiner();
    dessinerVisuelsTous();
    dessinerPlanche();
    dessinerBudget();
    texteChoix();
  });
  ctl.addEventListener('input', () => { $(SORTIE[cle]).textContent = `× ${n2(Number(ctl.value))}`; });
}
$('ctl-pistolet').addEventListener('change', (e) => {
  etat.pistolet = e.target.value;
  dessinerJeu();
});
$('ctl-caisse').addEventListener('change', (e) => {
  etat.caisse = e.target.value;
  dessinerCaisse();
});
const btnCraie = $('btn-craie');
btnCraie.addEventListener('click', () => {
  etat.craie = !etat.craie;
  btnCraie.setAttribute('aria-pressed', String(etat.craie));
  dessinerCaisse();
});
$('btn-retenir').addEventListener('click', () => {
  proposition.variantes[etat.arme] = etat.variante;
  if (['panzerschreck', 'm2lanceflammes'].includes(etat.arme)) proposition.armeSpeciale = etat.arme;
  texteChoix();
});

// Panneau de réglages flottant : sa hauteur décale l'arrivée des ancres (scroll-margin-top des sections).
const panneau = $('reglages');
const hauteurPanneau = () => document.documentElement.style.setProperty('--armes-reglages-h', `${Math.ceil(panneau.getBoundingClientRect().height)}px`);
new ResizeObserver(hauteurPanneau).observe(panneau);
hauteurPanneau();

toutDessiner();
dessinerVisuelsTous();
dessinerPlanche();
dessinerBudget();
texteChoix();
if (etat.rotation) requestAnimationFrame(boucle);
status.textContent = t('dev.armes.pret', { n: donnees.armes.length, v: donnees.armes.reduce((s, a) => s + a.variantes.length, 0) });

if (testMode) {
  window.__zsArmes = {
    pret: true,
    webgl: Boolean(renderer),
    etat: () => ({ ...etat }),
    choix: () => ({ ...choix, proposition: JSON.parse($('choix-texte').value) }),
    toutes,
    mesures: () => JSON.parse(JSON.stringify(mesures)),
    rendus: () => rendus,
    angle: () => etat.yaw,
    visuels: () => ({ ...visuels }),
    tenue: () => (tenueInfo ? JSON.parse(JSON.stringify(tenueInfo)) : null),
    posesFichier: () => posesJson,
    echelle: () => ({ ...donnees.echelle }),
    distanceJeu,
  };
}
