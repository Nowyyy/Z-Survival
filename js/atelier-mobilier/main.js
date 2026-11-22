// Lot 9j — Atelier du mobilier de 1942 (atelier-mobilier.html, page technique ; Docs/ref/decor-epoque.md, « Mobilier »).
// Un contexte WebGL : chaque vue est rendue puis copiée dans son canevas 2D. Le dessin actuel (boîtes du lot 3g, mobilier.world.json) et les variantes
// de 1942 (js/core/mobilier-epoque.js) de la pièce choisie, à sa place et à sa taille, avec un zombie à côté, sous la lampe ou sous la lune, caméra du
// jeu. Rien n'est écrit dans le stockage ; aucune requête externe ; la partie ne charge aucun de ces modules. ?test=1 : window.__zsMobilier.
import * as THREE from 'three';
import { translate } from '../i18n.js';
import { createTokenLookup, readPalette } from '../game/palette.js';
import { buildSpec, createTextureData, regionRect } from '../core/texgen.js';
import { cameraPosition, fitDistance } from '../core/viewport.js';
import { buildLayout } from '../core/layout.js';
import { segmentRects } from '../core/shape.js';
import { couleursEpoque } from '../core/decor-epoque.js';
import { createV2Kit } from '../game/character-v2.js';
import { slotsWithEpoch } from '../core/persos-variants.js';
import { ASPECTS, CORPS, VARIANTES, ecarts, lireChoix, modeleMeuble, specsMobilier, unitHash } from '../core/mobilier-epoque.js';
import { TEXTES } from '../core/mobilier-epoque-atlas.js';
import { geometrieDetails, teintes, textureMobilier, trianglesCorps } from '../game/mobilier-epoque-mesh.js';

const query = new URLSearchParams(location.search);
const testMode = query.get('test') === '1';
const reduit = matchMedia('(prefers-reduced-motion: reduce)').matches;
const $ = (id) => document.getElementById(id);
const fmt = (text, params) => String(text).replace(/\{(\w+)\}/g, (_, k) => String(params?.[k] ?? ''));
const n1 = (v) => (Number.isFinite(v) ? (Math.round(v * 10) / 10).toString().replace('.', ',') : '–');
const charger = async (chemin) => {
  const r = await fetch(chemin);
  if (!r.ok) throw new Error(`${chemin} : ${r.status}`);
  return r.json();
};
const [dict, donnees, choixJson, mobilier, world, etageWorld, tirs, feuxJson, decorCfg, render, texturesJson, lumieres, params, characters, poses, epoqueJson, variantsJson] = await Promise.all([
  'data/i18n/atelier-mobilier.json', 'data/game/mobilier-epoque.json', 'data/game/mobilier-epoque-choix.json', 'data/game/maps/rez-de-chaussee/mobilier.world.json', 'data/game/maps/rez-de-chaussee/world.json', 'data/game/maps/rez-de-chaussee/etage.world.json',
  'data/game/maps/rez-de-chaussee/tirs.world.json', 'data/game/maps/rez-de-chaussee/feux.json', 'data/game/maps/rez-de-chaussee/decor.json', 'data/game/render.json', 'data/game/textures.json', 'data/game/lumieres.json', 'data/game/maps/params.json',
  'data/game/characters-v2.json', 'data/game/poses-v2.json', 'data/game/persos-epoque.json', 'data/game/zombie-variants.json',
].map(charger));
const t = (key, p) => fmt(translate(dict, key), p);
for (const node of document.querySelectorAll('[data-i18n]')) node.textContent = t(node.dataset.i18n);
$('app').hidden = false;
const status = $('status');
status.textContent = t('dev.mobilier.chargement');

const palette = readPalette();
const lookup = createTokenLookup();
const couleurs = couleursEpoque(donnees.couleurs, lookup);
const choix0 = lireChoix(choixJson);
const etat = { variantes: { ...choix0.variantes }, pieces: { ...choix0.pieces }, lumiere: 'lampe', cadre: true, montree: {}, gp: { aspect: 'caisses', variante: 'A' }, yaw: 0.7 };

// --- Pièces (mêmes calculs que npm run carte) ------------------------------------------------------------------------------------------------------
const remplaces = new Set((decorCfg.interieur?.objets ?? []).filter((o) => o?.remplace).map((o) => `${o.floor}:${o.remplace}`));
const murs = { rdc: segmentRects(world.walls, params.wallThickness), etage: segmentRects(etageWorld.walls, params.wallThickness) };
const obstacles = { rdc: world.obstacles, etage: etageWorld.obstacles };
const specs = () => specsMobilier({ pieces: mobilier.pieces, obstacles, murs, tirs: { rdc: tirs.rdc.ids, etage: tirs.etage.ids }, feux: feuxJson.feux, remplaces, choix: { variantes: etat.variantes, pieces: etat.pieces } });
let pieces = specs();
const parAspect = (a) => pieces.filter((p) => p.aspect === a);
// Pièce montrée par aspect : la première du plan (M22 pour l'étagère renversée, P6 pour les gravats : demandées par le propriétaire).
const preferees = { gravats: 'P6', renversee: 'M22', caisses: 'P13' };
for (const a of ASPECTS) etat.montree[a] = parAspect(a).find((p) => p.id === preferees[a])?.id ?? parAspect(a)[0]?.id ?? null;

// --- Rendu -------------------------------------------------------------------------------------------------------------------------------------------
let renderer = null;
try {
  renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1);
  renderer.shadowMap.enabled = true;
} catch {
  renderer = null;
  $('webgl-erreur').hidden = false;
}
let rendus = 0;
function rendre(scene, camera, canvas) {
  if (!renderer) return { calls: 0, triangles: 0 };
  renderer.setSize(canvas.width, canvas.height, false);
  renderer.render(scene, camera);
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(renderer.domElement, 0, 0, canvas.width, canvas.height, 0, 0, canvas.width, canvas.height);
  rendus += 1;
  return { calls: renderer.info.render.calls, triangles: renderer.info.render.triangles };
}
const dataTexture = (img, repeat) => {
  const tex = new THREE.DataTexture(new Uint8Array(img.data.buffer), img.width, img.height, THREE.RGBAFormat);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.wrapS = repeat ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
  tex.wrapT = tex.wrapS;
  tex.needsUpdate = true;
  return tex;
};
const entree = (id) => texturesJson.textures.find((e) => e.id === id);
const solTex = dataTexture(createTextureData(buildSpec(entree('sol-salle'), lookup)), true);
const propsEntree = entree('atlas-props');
const propsTex = dataTexture(createTextureData(buildSpec(propsEntree, lookup)), false);
const propsRegions = new Map(propsEntree.params.regions.map((r) => [r.id, r]));
// Région de l'atlas des meubles, rentrée d'un demi-texel (comme textures.region de js/game/textures.js).
const regionProps = (id) => {
  const r = propsRegions.get(id);
  if (!r) return null;
  const q = regionRect(propsEntree.size, r);
  const h = 0.5 / propsEntree.size;
  return { u0: q.u0 + h, v0: q.v0 + h, u1: q.u1 - h, v1: q.v1 - h };
};
const mob = textureMobilier(couleurs);
const teinteDe = teintes(couleurs);
const matProps = new THREE.MeshLambertMaterial({ map: propsTex });
const matDetails = new THREE.MeshLambertMaterial({ map: mob.texture, vertexColors: true });

// Boîtes du lot 3g → triangles de corps (dessus et quatre côtés ; « cotes » : sans le dessus), fenêtre de région comme Builder.box.
function corpsDesBoites(boxes, graine) {
  const out = [];
  (boxes ?? []).forEach((b, k) => {
    const sc = CORPS[Object.keys(CORPS).find((c) => CORPS[c].region === b.region)]?.echelle ?? 100;
    const faces = [];
    if (b.faces !== 'cotes') faces.push({ n: [0, 1, 0], c: [[b.x0, b.y1, b.z0], [b.x1, b.y1, b.z0], [b.x1, b.y1, b.z1], [b.x0, b.y1, b.z1]], fw: b.x1 - b.x0, fh: b.z1 - b.z0 });
    faces.push(
      { n: [0, 0, 1], c: [[b.x0, b.y1, b.z1], [b.x1, b.y1, b.z1], [b.x1, b.y0, b.z1], [b.x0, b.y0, b.z1]], fw: b.x1 - b.x0, fh: b.y1 - b.y0 },
      { n: [0, 0, -1], c: [[b.x1, b.y1, b.z0], [b.x0, b.y1, b.z0], [b.x0, b.y0, b.z0], [b.x1, b.y0, b.z0]], fw: b.x1 - b.x0, fh: b.y1 - b.y0 },
      { n: [1, 0, 0], c: [[b.x1, b.y1, b.z1], [b.x1, b.y1, b.z0], [b.x1, b.y0, b.z0], [b.x1, b.y0, b.z1]], fw: b.z1 - b.z0, fh: b.y1 - b.y0 },
      { n: [-1, 0, 0], c: [[b.x0, b.y1, b.z0], [b.x0, b.y1, b.z1], [b.x0, b.y0, b.z1], [b.x0, b.y0, b.z0]], fw: b.z1 - b.z0, fh: b.y1 - b.y0 },
    );
    faces.forEach((f, j) => {
      const wu = Math.min(1, f.fw / sc);
      const wv = Math.min(1, f.fh / sc);
      const ou = unitHash(graine, k * 10 + j) * (1 - wu);
      const ov = unitHash(graine, k * 10 + j + 5) * (1 - wv);
      const uv = [[0, 0], [1, 0], [1, 1], [0, 1]].map(([s, q]) => [ou + s * wu, ov + q * wv]);
      for (const [a, c, d] of [[0, 1, 2], [0, 2, 3]]) out.push({ region: b.region, p: [f.c[a], f.c[c], f.c[d]], n: f.n, uv: [uv[a], uv[c], uv[d]] });
    });
  });
  return out;
}
// Groupe Three.js d'un dessin { corps, details } (corps : ombre portée, comme le maillage des meubles de la partie).
function groupeDessin(dessin) {
  const g = new THREE.Group();
  const tc = trianglesCorps(dessin.corps, regionProps);
  if (tc.length) {
    const n = tc.length * 3;
    const pos = new Float32Array(n * 3);
    const nor = new Float32Array(n * 3);
    const uv = new Float32Array(n * 2);
    tc.forEach((q, i) => {
      for (let k = 0; k < 3; k += 1) {
        pos.set(q.p[k], (i * 3 + k) * 3);
        nor.set(q.n, (i * 3 + k) * 3);
        uv.set(q.uv[k], (i * 3 + k) * 2);
      }
    });
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    geo.computeBoundingSphere();
    const m = new THREE.Mesh(geo, matProps);
    m.castShadow = true;
    m.receiveShadow = true;
    g.add(m);
  }
  const gd = geometrieDetails(dessin.details, teinteDe);
  if (gd) {
    const m = new THREE.Mesh(gd, matDetails);
    m.receiveShadow = true;
    g.add(m);
  }
  return g;
}
function vider(g) {
  for (const m of [...g.children]) {
    g.remove(m);
    m.traverse((q) => q.geometry?.dispose());
  }
}

// Scène : sol de la salle, ambiante et lune (render.json), lampe à huile (lumieres.json), un zombie de 1942, cadre de collision.
const scene = new THREE.Scene();
scene.background = new THREE.Color(palette.void);
const solGeo = new THREE.PlaneGeometry(6000, 6000).rotateX(-Math.PI / 2);
{
  const u = solGeo.attributes.uv;
  const rep = entree('sol-salle').repeat;
  for (let i = 0; i < u.count; i += 1) u.setXY(i, (u.getX(i) * 6000) / rep, (u.getY(i) * 6000) / rep);
}
const sol = new THREE.Mesh(solGeo, new THREE.MeshLambertMaterial({ map: solTex }));
sol.position.y = -0.5;
sol.receiveShadow = true;
scene.add(sol);
const ambiante = new THREE.AmbientLight(palette.ambient, render.light.ambient);
const lune = new THREE.DirectionalLight(palette.sun, render.light.sun);
lune.castShadow = true;
lune.shadow.mapSize.set(1024, 1024);
Object.assign(lune.shadow.camera, { left: -400, right: 400, top: 400, bottom: -400, near: 10, far: 4000 });
const lampe = new THREE.PointLight(palette.lampLight, Number(lumieres?.intensite) || 650, Number(lumieres?.distance) || 240, Number(lumieres?.decroissance) || 1);
scene.add(ambiante, lune, lune.target, lampe);
const groupe = new THREE.Group();
scene.add(groupe);
const cadreMat = new THREE.LineBasicMaterial({ color: palette.stairsMark });
const cadreLigne = new THREE.LineLoop(new THREE.BufferGeometry(), cadreMat);
scene.add(cadreLigne);
// Zombie de 1942 (variante d'époque de la partie, pose « zombie » au repos).
let zombie = null;
try {
  const slots = slotsWithEpoch(characters.slots, epoqueJson);
  const kit = createV2Kit({ characters: { ...characters, slots }, poses, lookup, hit: palette.hit, zombieIds: variantsJson.zombie.variants.map((v) => v.id), seed: 9 });
  zombie = kit.create('zombie', 0, { choice: 'epoque-A' });
  zombie.setPose(null, { time: 0, amount: 0.15, phase: 0, aim: 0, facing: 0, state: 'zombie', seed: 1 }, { down: null, repairing: false, hurt: false });
  scene.add(zombie.root);
} catch {
  zombie = null;
}
function eclairage(centre, rect) {
  const l = etat.lumiere === 'lampe';
  lampe.visible = l;
  lampe.position.set(rect.x - 50, 58, centre.y - Math.min(60, rect.h / 2 + 20));
  ambiante.intensity = render.light.ambient * (l ? Number(lumieres?.ambiance ?? 0.3) : 1);
  lune.intensity = render.light.sun * (l ? Number(lumieres?.lune?.intensite ?? 0.15) : 1);
  const o = render.light.sunOffset;
  lune.position.set(centre.x + o.x * 0.3, o.y * 0.3, centre.y + o.z * 0.3);
  lune.target.position.set(centre.x, 0, centre.y);
}

// --- Vues --------------------------------------------------------------------------------------------------------------------------------------------
const cam = new THREE.PerspectiveCamera(render.camera.fov, 667 / 375, render.camera.near, render.camera.far);
cam.up.set(0, 0, -1);
const layoutJeu = buildLayout(world, decorCfg);
function poserScene(p, dessin) {
  vider(groupe);
  groupe.add(groupeDessin(dessin));
  const o = (p.floor === 'rdc' ? world : etageWorld).obstacles.find((q) => q.id === p.obstacle) ?? p.rect;
  const pts = [[o.x, o.y], [o.x + o.w, o.y], [o.x + o.w, o.y + o.h], [o.x, o.y + o.h]].map(([x, z]) => new THREE.Vector3(x, 0.6, z));
  cadreLigne.geometry.dispose();
  cadreLigne.geometry = new THREE.BufferGeometry().setFromPoints(pts);
  cadreLigne.visible = etat.cadre;
  const r = p.rect;
  if (zombie) {
    // À côté de la pièce, au sud-est, tourné vers elle.
    zombie.root.position.set(r.x + r.w + 26, 0, r.y + Math.min(r.h, 60) / 2);
    zombie.root.rotation.set(0, -Math.PI / 2, 0);
  }
  const centre = { x: r.x + r.w / 2 + 14, y: r.y + r.h / 2 };
  sol.position.set(centre.x, -0.5, centre.y);
  eclairage(centre, r);
  return centre;
}
function vueJeu(canvas, centre) {
  const aspect = canvas.width / canvas.height;
  const d = fitDistance(aspect, layoutJeu.viewPlay, render.camera.tilt, render.camera.fov, render.camera.margin) / render.camera.zoom;
  const p = cameraPosition(centre, d, render.camera.tilt);
  cam.aspect = aspect;
  cam.position.set(p.x, p.y, p.z);
  cam.up.set(0, 0, -1);
  cam.lookAt(centre.x, 0, centre.y);
  cam.updateProjectionMatrix();
  return rendre(scene, cam, canvas);
}
const camProche = new THREE.PerspectiveCamera(36, 720 / 440, 2, 6000);
function vueProche(canvas, p, hauteur, yaw) {
  const r = p.rect;
  const cx = r.x + r.w / 2;
  const cz = r.y + r.h / 2;
  const R = Math.max(r.w, r.h, hauteur) * 1.5 + 40;
  camProche.aspect = canvas.width / canvas.height;
  camProche.position.set(cx + Math.cos(yaw) * R * 0.8, hauteur / 2 + R * 0.62, cz + Math.sin(yaw) * R * 0.8);
  camProche.up.set(0, 1, 0);
  camProche.lookAt(cx, hauteur / 3, cz);
  camProche.updateProjectionMatrix();
  const z = zombie?.root.visible;
  if (zombie) zombie.root.visible = false;
  const m = rendre(scene, camProche, canvas);
  if (zombie) zombie.root.visible = z;
  return m;
}

// Dessin d'une pièce : actuel (boîtes du lot 3g) ou variante de 1942.
const dessinActuel = (p) => ({ corps: corpsDesBoites(mobilier.pieces[p.id].boxes, p.id), details: [], hauteur: p.hauteur });
const dessinVariante = (p, v) => modeleMeuble({ ...p, aspect: p.aspect, variante: v, id: p.id });
const effectif = (d) => d.corps.length + d.details.length; // comme renderer.info dans la partie (mesure du lot : l'ombre ne double pas le compte)
const tirsDe = (p) => t(`dev.mobilier.tirs.${p.passe ? 'P' : 'B'}`);
const nomAspect = (a) => t(`dev.mobilier.aspect.${a}`);
const nomVariante = (v) => (v === 'actuel' ? t('dev.mobilier.choix.actuel') : t('dev.mobilier.variante', { v }));
const mesures = {};

// Sections par aspect : description, pièce montrée, vues (actuel puis variantes).
const hoteAspects = $('aspects');
const nav = $('nav-liste');
function creerSections() {
  for (const a of ASPECTS) {
    if (!parAspect(a).length) continue;
    const sec = document.createElement('section');
    sec.className = 'atelier-section';
    sec.id = `aspect-${a}`;
    sec.setAttribute('aria-labelledby', `aspect-${a}-titre`);
    const h2 = document.createElement('h2');
    h2.className = 'atelier-heading';
    h2.id = `aspect-${a}-titre`;
    h2.textContent = nomAspect(a);
    const desc = document.createElement('p');
    desc.className = 'atelier-note m9-aspect-desc';
    desc.textContent = t(`dev.mobilier.desc.${a}`);
    const champ = document.createElement('div');
    champ.className = 'armes-champ';
    const lab = document.createElement('label');
    lab.htmlFor = `ctl-piece-${a}`;
    lab.textContent = t('dev.mobilier.piece');
    const sel = document.createElement('select');
    sel.id = `ctl-piece-${a}`;
    sel.className = 'armes-select m9-select-piece';
    champ.append(lab, sel);
    const champs = document.createElement('div');
    champs.className = 'armes-champs';
    champs.append(champ);
    const vues = document.createElement('div');
    vues.className = 'm9-vues';
    vues.id = `vues-${a}`;
    sec.append(h2, desc, champs, vues);
    hoteAspects.append(sec);
    const li = document.createElement('li');
    const lien = document.createElement('a');
    lien.className = 'atelier-link';
    lien.href = `#aspect-${a}`;
    lien.textContent = nomAspect(a);
    li.append(lien);
    nav.insertBefore(li, nav.children[1]);
    sel.addEventListener('change', () => {
      etat.montree[a] = sel.value;
      dessinerAspect(a);
    });
  }
}
function remplirSelectPieces(a) {
  const sel = $(`ctl-piece-${a}`);
  if (!sel) return;
  sel.replaceChildren();
  for (const p of parAspect(a)) {
    const o = document.createElement('option');
    o.value = p.id;
    o.textContent = `${p.id} (${t(`dev.mobilier.etage.${p.floor}`)}, ${n1(p.rect.w)} × ${n1(p.rect.h)})`;
    sel.append(o);
  }
  if (!parAspect(a).some((p) => p.id === etat.montree[a])) etat.montree[a] = parAspect(a)[0]?.id ?? null;
  sel.value = etat.montree[a] ?? '';
}
function dessinerAspect(a) {
  const hote = $(`vues-${a}`);
  if (!hote) return;
  hote.replaceChildren();
  const p = pieces.find((q) => q.id === etat.montree[a]);
  if (!p) return;
  mesures[a] = {};
  for (const v of ['actuel', ...VARIANTES[a]]) {
    const dessin = v === 'actuel' ? dessinActuel(p) : dessinVariante(p, v);
    const fig = document.createElement('figure');
    fig.className = 'decor-vignette';
    fig.dataset.variante = v;
    if (etat.variantes[a] === v) fig.dataset.retenue = 'oui';
    const cv = document.createElement('canvas');
    cv.width = 667;
    cv.height = 375;
    cv.id = `cv-${a}-${v}`;
    cv.setAttribute('aria-hidden', 'true');
    const cap = document.createElement('figcaption');
    const ec = v === 'actuel' ? null : ecarts(dessin.emprise, p.rect);
    cap.textContent = v === 'actuel'
      ? t('dev.mobilier.legende.actuel', { nom: nomVariante(v), tris: dessin.corps.length, effectif: effectif(dessin), h: n1(p.hauteur), tirs: tirsDe(p) })
      : t('dev.mobilier.legende', { nom: nomVariante(v), corps: dessin.corps.length, details: dessin.details.length, effectif: effectif(dessin), h: n1(dessin.hauteur), tirs: tirsDe(p), o: n1(ec.o), e: n1(ec.e), n: n1(ec.n), s: n1(ec.s) });
    fig.append(cv, cap);
    hote.append(fig);
    const centre = poserScene(p, dessin);
    const m = vueJeu(cv, centre);
    mesures[a][v] = { piece: p.id, calls: m.calls, triangles: m.triangles, corps: dessin.corps.length, details: dessin.details.length, hauteur: dessin.hauteur, ecarts: ec };
  }
}

// --- Gros plan (tourne) et grande vue ----------------------------------------------------------------------------------------------------------------
let gp = null;
function preparerGrosPlan() {
  const p = pieces.find((q) => q.id === etat.montree[etat.gp.aspect]) ?? parAspect(etat.gp.aspect)[0];
  if (!p) return;
  const dessin = etat.gp.variante === 'actuel' ? dessinActuel(p) : dessinVariante(p, etat.gp.variante);
  // Gros plan qui tourne : dessin complet (la partie retire les faces nord des détails, jamais vues par sa caméra).
  const complet = etat.gp.variante === 'actuel' ? dessin : modeleMeuble({ ...p, variante: etat.gp.variante, id: p.id, complet: true });
  gp = { p, dessin: complet };
  const ec = etat.gp.variante === 'actuel' ? null : ecarts(dessin.emprise, p.rect);
  $('gp-fiche').textContent = ec
    ? t('dev.mobilier.legende', { nom: `${p.id} · ${nomAspect(etat.gp.aspect)} · ${nomVariante(etat.gp.variante)}`, corps: dessin.corps.length, details: dessin.details.length, effectif: effectif(dessin), h: n1(dessin.hauteur), tirs: tirsDe(p), o: n1(ec.o), e: n1(ec.e), n: n1(ec.n), s: n1(ec.s) })
    : t('dev.mobilier.legende.actuel', { nom: `${p.id} · ${nomVariante('actuel')}`, tris: dessin.corps.length, effectif: effectif(dessin), h: n1(p.hauteur), tirs: tirsDe(p) });
  const centre = poserScene(p, dessin);
  mesures.grand = vueJeu($('cv-grand'), centre);
  poserScene(p, complet);
  vueProche($('cv-gros-plan'), p, Math.max(20, dessin.hauteur ?? p.hauteur), etat.yaw);
}
function remplirGp() {
  const sa = $('ctl-gp-aspect');
  sa.replaceChildren();
  for (const a of ASPECTS.filter((x) => parAspect(x).length)) sa.append(new Option(nomAspect(a), a));
  sa.value = etat.gp.aspect;
  const sv = $('ctl-gp-variante');
  sv.replaceChildren();
  for (const v of ['actuel', ...VARIANTES[etat.gp.aspect]]) sv.append(new Option(nomVariante(v), v));
  if (!['actuel', ...VARIANTES[etat.gp.aspect]].includes(etat.gp.variante)) etat.gp.variante = VARIANTES[etat.gp.aspect][0];
  sv.value = etat.gp.variante;
}
let dernier = 0;
function tourner(now) {
  if (gp && now - dernier > 50 && !document.hidden) {
    dernier = now;
    etat.yaw += 0.03;
    poserScene(gp.p, gp.dessin);
    vueProche($('cv-gros-plan'), gp.p, Math.max(20, gp.dessin.hauteur ?? gp.p.hauteur), etat.yaw);
  }
  requestAnimationFrame(tourner);
}

// --- Plan, budget, choix -----------------------------------------------------------------------------------------------------------------------------
const NS = 'http://www.w3.org/2000/svg';
const sv = (name, attrs, texte) => {
  const e = document.createElementNS(NS, name);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  if (texte !== undefined) e.textContent = texte;
  return e;
};
function dessinerPlan() {
  const leg = $('plan-legende');
  leg.replaceChildren();
  for (const a of ASPECTS) {
    const li = document.createElement('li');
    const pa = document.createElement('span');
    pa.className = `i9-pastille m9-a-${a}`;
    pa.setAttribute('aria-hidden', 'true');
    const tx = document.createElement('span');
    tx.textContent = nomAspect(a);
    li.append(pa, tx);
    leg.append(li);
  }
  for (const [floor, monde] of [['rdc', world], ['etage', etageWorld]]) {
    const xs = monde.contour.map((q) => q[0] ?? q.x);
    const ys = monde.contour.map((q) => q[1] ?? q.y);
    const box = [Math.min(...xs) - 40, Math.min(...ys) - 40, Math.max(...xs) - Math.min(...xs) + 80, Math.max(...ys) - Math.min(...ys) + 80];
    const svg = sv('svg', { viewBox: box.join(' '), role: 'img', 'aria-label': t(`dev.mobilier.plan.svg.${floor}`) });
    svg.append(sv('polygon', { class: 'i9-contour', points: monde.contour.map((q) => `${q[0] ?? q.x},${q[1] ?? q.y}`).join(' ') }));
    for (const q of monde.obstacles) svg.append(sv('rect', { class: q.kind === 'escalier' ? 'i9-escalier' : 'i9-meuble', x: q.x, y: q.y, width: q.w, height: q.h }));
    for (const p of pieces.filter((q) => q.floor === floor)) {
      const r = p.rect;
      svg.append(sv('rect', { class: `m9-piece m9-a-${p.aspect}`, x: r.x, y: r.y, width: r.w, height: r.h, 'data-id': p.id }));
      if (p.feu) svg.append(sv('circle', { class: 'm9-feu', cx: p.feu.x, cy: p.feu.y, r: 9 }));
      svg.append(sv('text', { class: 'i9-etiquette', x: r.x, y: r.y - 6 }, p.id));
    }
    $(`plan-${floor}`).replaceChildren(svg);
  }
}
function remplirTablePieces() {
  const corps = $('table-pieces').querySelector('tbody');
  corps.replaceChildren();
  for (const p of pieces) {
    const tr = document.createElement('tr');
    const cell = (txt) => {
      const td = document.createElement('td');
      td.textContent = txt;
      tr.append(td);
      return td;
    };
    const th = document.createElement('th');
    th.scope = 'row';
    th.textContent = p.id + (p.feu ? ` (${t('dev.mobilier.plan.feu')})` : '');
    tr.append(th);
    cell(t(`dev.mobilier.etage.${p.floor}`));
    const td = cell('');
    const sel = document.createElement('select');
    sel.className = 'armes-select m9-select-piece';
    sel.setAttribute('aria-label', `${t('dev.mobilier.col.aspect')} ${p.id}`);
    sel.dataset.piece = p.id;
    for (const a of ASPECTS) sel.append(new Option(nomAspect(a) + (a === p.aspectPropose ? ' *' : ''), a));
    sel.value = p.aspect;
    sel.addEventListener('change', () => {
      if (sel.value === p.aspectPropose) delete etat.pieces[p.id];
      else etat.pieces[p.id] = sel.value;
      toutMettreAJour(true);
    });
    td.append(sel);
    const v = etat.variantes[p.aspect];
    cell(nomVariante(v));
    const d = v === 'actuel' ? dessinActuel(p) : dessinVariante(p, v);
    const ec = v === 'actuel' ? null : ecarts(d.emprise, p.rect);
    cell(`${n1(p.rect.w)} × ${n1(p.rect.h)}`);
    cell(d.emprise ? `${n1(d.emprise.w)} × ${n1(d.emprise.h)}` : '–');
    cell(ec ? `${n1(ec.o)}, ${n1(ec.e)}, ${n1(ec.n)}, ${n1(ec.s)} (${Math.round(ec.max * 100)} %)` : '–');
    cell(`${n1(p.hauteur)} → ${n1(v === 'actuel' ? p.hauteur : d.hauteur)}`);
    cell(p.passe ? 'P' : 'B');
    cell(p.ouverture);
    cell(v === 'actuel' ? String(d.corps.length) : `${d.corps.length} + ${d.details.length}`);
    corps.append(tr);
  }
}
// Triangles (corps + détails) de la sélection et d'aujourd'hui, par étage.
function budget() {
  const out = { rdc: 0, etage: 0, rdc0: 0, etage0: 0 };
  for (const p of pieces) {
    out[`${p.floor}0`] += effectif(dessinActuel(p));
    const v = etat.variantes[p.aspect];
    out[p.floor] += effectif(v === 'actuel' ? dessinActuel(p) : dessinVariante(p, v));
  }
  out.delta = out.rdc + out.etage - out.rdc0 - out.etage0;
  return out;
}
function remplirBudget() {
  const b = budget();
  $('budget-resume').textContent = t('dev.mobilier.budget.resume', { rdc: b.rdc, rdc0: b.rdc0, etage: b.etage, etage0: b.etage0, delta: b.delta >= 0 ? `+${b.delta}` : b.delta, taille: mob.taille, ko: Math.round((mob.taille * mob.taille * 4 * 4) / 3 / 1024) });
  const corps = $('table-budget').querySelector('tbody');
  corps.replaceChildren();
  for (const a of ASPECTS) {
    const liste = parAspect(a);
    if (!liste.length) continue;
    for (const v of ['actuel', ...VARIANTES[a]]) {
      let total = 0;
      let pire = 0;
      for (const p of liste) {
        const d = v === 'actuel' ? dessinActuel(p) : dessinVariante(p, v);
        total += effectif(d);
        if (v !== 'actuel') pire = Math.max(pire, ecarts(d.emprise, p.rect).max);
      }
      const tr = document.createElement('tr');
      for (const txt of [nomAspect(a), nomVariante(v), liste.map((p) => p.id).join(', '), String(total), v === 'actuel' ? '–' : `${Math.round(pire * 100)} %`]) {
        const td = document.createElement('td');
        td.textContent = txt;
        tr.append(td);
      }
      corps.append(tr);
    }
  }
  return b;
}
function remplirContenu() {
  const ul = $('contenu-liste');
  ul.replaceChildren();
  const textes = Object.values(TEXTES).flat().map((x) => `« ${x} »`).join(', ');
  for (const txt of [t('dev.mobilier.contenu.textes', { textes }), t('dev.mobilier.contenu.symboles'), t('dev.mobilier.contenu.code'), t('dev.mobilier.contenu.vif')]) {
    const li = document.createElement('li');
    li.textContent = txt;
    ul.append(li);
  }
}
const proposition = () => ({ variantes: { ...etat.variantes }, pieces: { ...etat.pieces } });
function remplirChoix() {
  const hote = $('choix-champs');
  hote.replaceChildren();
  for (const a of ASPECTS) {
    const champ = document.createElement('div');
    champ.className = 'armes-champ';
    const lab = document.createElement('label');
    lab.htmlFor = `ctl-choix-${a}`;
    lab.textContent = nomAspect(a);
    const sel = document.createElement('select');
    sel.id = `ctl-choix-${a}`;
    sel.className = 'armes-select';
    for (const v of ['actuel', ...VARIANTES[a]]) sel.append(new Option(nomVariante(v), v));
    sel.value = etat.variantes[a];
    sel.addEventListener('change', () => {
      etat.variantes[a] = sel.value;
      toutMettreAJour(false);
    });
    champ.append(lab, sel);
    hote.append(champ);
  }
  $('choix-fichier').textContent = JSON.stringify(proposition(), null, 2);
}

function toutMettreAJour(aspectsChanges) {
  pieces = specs();
  if (aspectsChanges) for (const a of ASPECTS) remplirSelectPieces(a);
  for (const a of ASPECTS) dessinerAspect(a);
  dessinerPlan();
  remplirTablePieces();
  const b = remplirBudget();
  $('choix-fichier').textContent = JSON.stringify(proposition(), null, 2);
  preparerGrosPlan();
  return b;
}

// --- Démarrage ---------------------------------------------------------------------------------------------------------------------------------------
try {
  const sl = $('ctl-lumiere');
  for (const v of ['lampe', 'lune']) sl.append(new Option(t(`dev.mobilier.lumiere.${v}`), v));
  sl.value = etat.lumiere;
  sl.addEventListener('change', () => {
    etat.lumiere = sl.value;
    for (const a of ASPECTS) dessinerAspect(a);
    preparerGrosPlan();
  });
  const sc = $('ctl-cadre');
  for (const v of ['oui', 'non']) sc.append(new Option(t(`dev.mobilier.cadre.${v}`), v));
  sc.value = etat.cadre ? 'oui' : 'non';
  sc.addEventListener('change', () => {
    etat.cadre = sc.value === 'oui';
    for (const a of ASPECTS) dessinerAspect(a);
    preparerGrosPlan();
  });
  creerSections();
  for (const a of ASPECTS) remplirSelectPieces(a);
  remplirGp();
  $('ctl-gp-aspect').addEventListener('change', () => {
    etat.gp.aspect = $('ctl-gp-aspect').value;
    remplirGp();
    preparerGrosPlan();
  });
  $('ctl-gp-variante').addEventListener('change', () => {
    etat.gp.variante = $('ctl-gp-variante').value;
    preparerGrosPlan();
  });
  remplirContenu();
  remplirChoix();
  const b = toutMettreAJour(false);
  status.textContent = t('dev.mobilier.pret', { pieces: pieces.length, vues: rendus, delta: b.delta >= 0 ? `+${b.delta}` : b.delta });
  if (!reduit && renderer && !testMode) requestAnimationFrame(tourner);
  if (testMode) {
    window.__zsMobilier = {
      pret: true,
      etat: () => JSON.parse(JSON.stringify(etat)),
      pieces: () => pieces.map((p) => ({ ...p })),
      mesures: () => JSON.parse(JSON.stringify(mesures)),
      budget: () => budget(),
      choix: () => proposition(),
      rendus: () => rendus,
      webgl: renderer !== null,
      montrer(a, id, lumiere) {
        if (lumiere) etat.lumiere = lumiere;
        if (id) etat.montree[a] = id;
        dessinerAspect(a);
        return mesures[a];
      },
      grosPlan(a, v, yaw = 0.7) {
        etat.gp = { aspect: a, variante: v };
        etat.yaw = yaw;
        remplirGp();
        preparerGrosPlan();
        return mesures.grand;
      },
    };
  }
} catch (e) {
  status.textContent = t('dev.mobilier.erreur', { message: e?.message ?? String(e) });
  if (testMode) window.__zsMobilier = { pret: false, erreur: String(e?.stack ?? e) };
}
