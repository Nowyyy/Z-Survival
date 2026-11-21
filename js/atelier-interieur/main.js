// Lot 9i — Atelier de l'intérieur et du menu de 1942 (atelier-interieur.html, page technique ; Docs/ref/decor-epoque.md, « Intérieur et menu »).
// Un contexte WebGL pour les objets et la lampe (chaque vue est rendue puis copiée dans son canevas 2D) ; les ouvertures sont créées l'une après
// l'autre par la scène du menu (js/menu/ouverture/scene.js, option epoque) puis libérées. Rien n'est écrit dans le stockage ; aucune requête externe ;
// la partie et le menu ne chargent aucun de ces modules. ?test=1 : window.__zsInterieur (état, variantes, plan, mesures, ouvertures).
import * as THREE from 'three';
import { translate } from '../i18n.js';
import { createTokenLookup, readPalette } from '../game/palette.js';
import { buildSpec, createTextureData } from '../core/texgen.js';
import { cameraPosition, fitDistance } from '../core/viewport.js';
import { buildLayout } from '../core/layout.js';
import { parseColor, toHex } from '../core/color.js';
import { createV2Kit } from '../game/character-v2.js';
import { slotsWithEpoch } from '../core/persos-variants.js';
import { avecLampeCoudee, PIECES_TL122 } from '../core/lampe-coudee.js';
import { chronologie, lireOuvertures } from '../core/ouverture.js';
import { CATALOGUE, HAUTEUR_ARME, MATIERES, TEXTES, TYPES, atlasInterieur, controlePlan, couleursEpoque, lireChoix, objet } from '../core/interieur-epoque.js';
import { VARIANTES_CHARGEMENT, VARIANTES_HISTOIRE, caisseSvg, caisseSvgEpoque } from './menu-epoque.js';
import { sceneJouer } from '../menu/jouer.js';
import { decorNuit } from '../menu/chargement.js';

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
const [dict, donnees, choixJson, placement, world, etageWorld, lampesWorld, decorCfg, render, texturesJson, navCfg, lumieres, characters, poses, epoqueJson, variantsJson, ouvJson, raretesJson, choixMenuJson] = await Promise.all([
  'data/i18n/atelier-interieur.json', 'data/game/interieur-epoque.json', 'data/game/interieur-epoque-choix.json', 'data/game/maps/rez-de-chaussee/interieur-epoque.json',
  'data/game/maps/rez-de-chaussee/world.json', 'data/game/maps/rez-de-chaussee/etage.world.json', 'data/game/maps/rez-de-chaussee/lampes.world.json', 'data/game/maps/rez-de-chaussee/decor.json', 'data/game/render.json', 'data/game/textures.json', 'data/game/nav.json',
  'data/game/lumieres.json', 'data/game/characters-v2.json', 'data/game/poses-v2.json', 'data/game/persos-epoque.json', 'data/game/zombie-variants.json',
  'data/menu/ouvertures.json', 'data/menu/raretes.json', 'data/menu/caisses-epoque-choix.json',
].map(charger));
const t = (key, params) => fmt(translate(dict, key), params);
for (const node of document.querySelectorAll('[data-i18n]')) node.textContent = t(node.dataset.i18n);
for (const node of document.querySelectorAll('[data-i18n-label]')) node.setAttribute('aria-label', t(node.dataset.i18nLabel));
$('app').hidden = false;
const status = $('status');
status.textContent = t('dev.interieur.chargement');

const palette = readPalette();
const lookup = createTokenLookup();
const couleurs = couleursEpoque(donnees.couleurs, lookup);
const choix0 = lireChoix(choixJson);
const etat = { type: TYPES[0], variantes: { ...choix0.variantes }, gardes: { ...choix0.gardes }, taille: choix0.taille, lumiere: 'lampe', rotation: !reduit, yaw: 0.7 };
// Choix du menu (data/menu/caisses-epoque-choix.json ; invalide = défaut).
function lireChoixMenu(j) {
  const ok = (v, liste, d) => (liste.includes(v) ? v : d);
  return { caisses: ok(j?.caisses, ['epoque', 'actuelles'], 'epoque'), arme: ok(j?.arme, ['garand', 'fusil'], 'garand'), histoire: ok(j?.histoire, VARIANTES_HISTOIRE, 'A'), chargement: ok(j?.chargement, VARIANTES_CHARGEMENT, 'C') };
}
const menu = lireChoixMenu(choixMenuJson);
const nomType = (type) => t(`dev.interieur.objet.${type}`);
const nomVariante = (type, v) => t(`dev.interieur.variante.${type}.${v}`);

// --- Rendu : un seul contexte WebGL ----------------------------------------------------------------------------------------------------------------
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
  const w = canvas.width;
  const h = canvas.height;
  renderer.setSize(w, h, false);
  renderer.render(scene, camera);
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, w, h);
  ctx.drawImage(renderer.domElement, 0, 0, w, h, 0, 0, w, h);
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
const t0 = performance.now();
const atlas = atlasInterieur({ couleurs });
const atlasMs = Math.round(performance.now() - t0);
const atlasTex = dataTexture(atlas, false);
const entree = (id) => texturesJson.textures.find((e) => e.id === id);
const solTex = dataTexture(createTextureData(buildSpec(entree('sol-salle'), lookup)), true);
const repSol = entree('sol-salle').repeat;
// Matière unique des objets : Lambert, atlas, couleurs de sommet ; le verre des ampoules (attribut aLueur = 1) ajoute sa couleur telle quelle
// (lueur propre, comme la flamme des lampes à huile : aucune lumière nouvelle, un seul appel).
function matiereInterieur() {
  const m = new THREE.MeshLambertMaterial({ map: atlasTex, vertexColors: true });
  m.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nattribute float aLueur;\nvarying float vLueur;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvLueur = aLueur;');
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vLueur;').replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += diffuseColor.rgb * vLueur;');
  };
  m.customProgramCacheKey = () => 'interieur-epoque';
  return m;
}
const matObjets = matiereInterieur();
const lin = (rgb) => {
  const c = new THREE.Color().setRGB(rgb[0] / 255, rgb[1] / 255, rgb[2] / 255, THREE.SRGBColorSpace);
  return [c.r, c.g, c.b];
};
const teinte = (mat) => {
  const cle = MATIERES[mat]?.teinte;
  return cle && cle !== 'neutre' && couleurs[cle] ? lin(couleurs[cle]) : [1, 1, 1];
};
// Maillage d'une liste de triangles : un maillage, une matière. → { mesh, appels, triangles }.
function maillage(tris) {
  const n = tris.length * 3;
  const pos = new Float32Array(n * 3);
  const nor = new Float32Array(n * 3);
  const uv = new Float32Array(n * 2);
  const col = new Float32Array(n * 3);
  const lueur = new Float32Array(n);
  tris.forEach((q, i) => {
    const c = teinte(q.mat);
    for (let k = 0; k < 3; k += 1) {
      const j = i * 3 + k;
      pos.set(q.p[k], j * 3);
      nor.set(q.n, j * 3);
      uv.set(q.uv[k], j * 2);
      col.set(c, j * 3);
      lueur[j] = q.lueur ? 1 : 0;
    }
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setAttribute('aLueur', new THREE.BufferAttribute(lueur, 1));
  g.computeBoundingSphere();
  const mesh = new THREE.Mesh(g, matObjets);
  mesh.receiveShadow = true; // aucune ombre portée (budget : « aucune ombre de plus »)
  return { mesh, appels: tris.length ? 1 : 0, triangles: tris.length };
}

// Scène : sol de la salle (sol-salle), ambiante et lune (render.json), lampe à huile (lumieres.json, couleur --game-lamp-light), repère zombie.
const scene = new THREE.Scene();
scene.background = new THREE.Color(palette.void);
const solGeo = new THREE.PlaneGeometry(3000, 3000).rotateX(-Math.PI / 2);
{
  const u = solGeo.attributes.uv;
  for (let i = 0; i < u.count; i += 1) u.setXY(i, (u.getX(i) * 3000) / repSol, (u.getY(i) * 3000) / repSol);
}
const sol = new THREE.Mesh(solGeo, new THREE.MeshLambertMaterial({ map: solTex }));
sol.position.y = -0.5;
sol.receiveShadow = true;
scene.add(sol);
const ambiante = new THREE.AmbientLight(palette.ambient, render.light.ambient);
scene.add(ambiante);
const lune = new THREE.DirectionalLight(palette.sun, render.light.sun);
const o = render.light.sunOffset;
lune.position.set(o.x, o.y, o.z);
scene.add(lune, lune.target);
const lampe = new THREE.PointLight(palette.lampLight, Number(lumieres?.intensite) || 650, Number(lumieres?.distance) || 240, Number(lumieres?.decroissance) || 1);
lampe.position.set(-70, 58, 40);
scene.add(lampe);
const repere = new THREE.Mesh(new THREE.CylinderGeometry(12, 12, 61, 10), new THREE.MeshLambertMaterial({ color: palette.zombie }));
scene.add(repere);
// Supports : table (meuble porteur, 40 de haut, couleur --game-furniture), pan de mur (cartes : 60 de haut).
const table = new THREE.Mesh(new THREE.BoxGeometry(110, 40, 70).translate(0, 20, 0), new THREE.MeshLambertMaterial({ color: palette.furniture }));
const mur = new THREE.Mesh(new THREE.BoxGeometry(160, 60, 40).translate(0, 30, -20), new THREE.MeshLambertMaterial({ color: palette.wall }));
scene.add(table, mur);
const groupe = new THREE.Group();
scene.add(groupe);
function eclairage() {
  const l = etat.lumiere === 'lampe';
  lampe.visible = l;
  ambiante.intensity = render.light.ambient * (l ? Number(lumieres?.ambiance ?? 0.3) : 1);
  lune.intensity = render.light.sun * (l ? Number(lumieres?.lune?.intensite ?? 0.15) : 1);
}

function vider(g) {
  for (const m of [...g.children]) {
    g.remove(m);
    m.traverse((q) => q.geometry?.dispose());
  }
}
// Objet affiché (centré à l'origine ; meuble : sur la table ; carte : contre le mur, face au sud ; plafond : au-dessus du sol).
function poser(type, variante) {
  vider(groupe);
  const pose = CATALOGUE[type].pose;
  const info = objet(type, variante, { x: 0, y: 0, base: pose === 'meuble' ? 40 : 0, face: 's', taille: etat.taille });
  const res = maillage(info.triangles);
  groupe.add(res.mesh);
  table.visible = pose === 'meuble';
  mur.visible = pose === 'mur';
  const e = info.emprise ?? { x: -20, y: -20, w: 40, h: 40 };
  repere.position.set(Math.max(e.x + e.w, pose === 'meuble' ? 55 : 0) + 34, 30.5, 0);
  return { info, appels: res.appels, triangles: res.triangles };
}

// --- Vues ----------------------------------------------------------------------------------------------------------------------------------------
const cam = new THREE.PerspectiveCamera(render.camera.fov, 667 / 375, render.camera.near, render.camera.far);
cam.up.set(0, 0, -1);
const layoutJeu = buildLayout(world, decorCfg);
const mesures = {};
function vueJeu(canvas, centre = { x: 0, y: 0 }) {
  repere.visible = true;
  const aspect = canvas.width / canvas.height;
  const d = fitDistance(aspect, layoutJeu.viewPlay, render.camera.tilt, render.camera.fov, render.camera.margin) / render.camera.zoom;
  const p = cameraPosition(centre, d, render.camera.tilt);
  cam.aspect = aspect;
  cam.position.set(p.x, p.y, p.z);
  cam.lookAt(centre.x, 0, centre.y);
  cam.updateProjectionMatrix();
  scene.fog = null;
  lune.target.position.set(centre.x, 0, centre.y);
  return rendre(scene, cam, canvas);
}
const camProche = new THREE.PerspectiveCamera(36, 720 / 440, 2, 4000);
function vueProche(canvas, yaw, info, pitch = 0.55) {
  repere.visible = false;
  const e = info?.emprise ?? { x: -20, y: -20, w: 40, h: 40 };
  const cx = e.x + e.w / 2;
  const cz = e.y + e.h / 2;
  const bas = CATALOGUE[info?.type]?.pose === 'plafond' ? 58 : info?.base ?? 0;
  const haut = Math.max(bas + 4, info?.hauteur ?? 20);
  const r = Math.max(e.w, e.h, haut - bas) * 2.1 + 26;
  const cy = CATALOGUE[info?.type]?.pose === 'plafond' ? 66 : CATALOGUE[info?.type]?.pose === 'mur' ? 34 : (bas + haut) / 2;
  camProche.aspect = canvas.width / canvas.height;
  camProche.up.set(0, 1, 0);
  const yawV = CATALOGUE[info?.type]?.pose === 'mur' ? Math.PI / 2 + Math.sin(yaw) * 0.6 : yaw;
  camProche.position.set(cx + Math.cos(yawV) * Math.cos(pitch) * r, cy + Math.sin(pitch) * r, cz + Math.sin(yawV) * Math.cos(pitch) * r);
  camProche.lookAt(cx, cy, cz);
  camProche.updateProjectionMatrix();
  return rendre(scene, camProche, canvas);
}

// --- Fiche, budget, choix --------------------------------------------------------------------------------------------------------------------------
const tirsDe = (o2) => {
  if (!o2.rects.length) return t(CATALOGUE[o2.type].pose === 'meuble' ? 'dev.interieur.tirs.meuble' : 'dev.interieur.tirs.aucun');
  return o2.rects.map((r) => t(`dev.interieur.tirs.${r.tirs}`)).join(', ');
};
const reelDe = (type, v) => {
  const r = donnees.reel?.[type]?.[v];
  return Array.isArray(r) ? r.map(n1).join(' × ') : '–';
};
const toutes = [];
for (const type of TYPES) for (const v of CATALOGUE[type].variantes) {
  const ob = objet(type, v, { x: 0, y: 0, base: 0, taille: etat.taille });
  toutes.push({ type, variante: v, triangles: ob.compte, budget: CATALOGUE[type].budget, hauteur: ob.hauteur, emprise: ob.emprise, collision: ob.collision, tirs: tirsDe(ob), lueur: ob.lueur, rects: ob.rects.map((r) => ({ w: r.w, h: r.h, hauteur: r.hauteur, tirs: r.tirs })) });
}
const remplir = (id, lignes) => {
  const corps = $(id).querySelector('tbody');
  corps.replaceChildren();
  for (const l of lignes) {
    const tr = document.createElement('tr');
    for (const v of l) {
      const td = document.createElement('td');
      td.textContent = v;
      tr.append(td);
    }
    corps.append(tr);
  }
};
const hauteurAffichee = (r) => (CATALOGUE[r.type].pose === 'meuble' ? t('dev.interieur.hauteur.meuble', { h: r.hauteur }) : String(r.hauteur));
remplir('table-budget', toutes.map((r) => [nomType(r.type), nomVariante(r.type, r.variante), `${r.triangles} / ${r.budget}`, reelDe(r.type, r.variante), r.emprise ? `${r.emprise.w} × ${r.emprise.h}` : '–', hauteurAffichee(r), r.tirs, t(r.collision ? 'dev.interieur.collision.oui' : 'dev.interieur.collision.non')]));
function fiche(info) {
  $('variante-fiche').textContent = t('dev.interieur.fiche', { v: nomVariante(etat.type, etat.variantes[etat.type]), reel: reelDe(etat.type, etat.variantes[etat.type]), jeu: info.emprise ? `${info.emprise.w} × ${info.emprise.h}` : '–', h: info.hauteur - info.base, tris: info.compte, budget: CATALOGUE[etat.type].budget, tirs: tirsDe(info), collision: t(info.collision ? 'dev.interieur.collision.oui' : 'dev.interieur.collision.non'), pose: t(`dev.interieur.pose.${CATALOGUE[etat.type].pose}`) });
}
const propositionInterieur = () => ({ taille: etat.taille, variantes: { ...etat.variantes }, gardes: { ...etat.gardes } });
const propositionMenu = () => ({ ...menu });
function majChoix() {
  $('choix-interieur').textContent = JSON.stringify(propositionInterieur(), null, 2);
  $('choix-menu').textContent = JSON.stringify(propositionMenu(), null, 2);
}

// --- Plan de placement ---------------------------------------------------------------------------------------------------------------------------
const NS = 'http://www.w3.org/2000/svg';
const sv = (name, attrs, texte) => {
  const e = document.createElementNS(NS, name);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  if (texte !== undefined) e.textContent = texte;
  return e;
};
let plan = null;
function majPlan(toutesVariantes = false) {
  plan = controlePlan({ mondes: { rdc: world, etage: etageWorld }, lampes: lampesWorld.lampes, doc: placement, choixJson: propositionInterieur(), navCfg, toutesVariantes });
  for (const [floor, monde] of [['rdc', world], ['etage', etageWorld]]) {
    const c = plan.couches[floor];
    const xs = c.contour.map((p) => p[0]);
    const ys = c.contour.map((p) => p[1]);
    const box = [Math.min(...xs) - 60, Math.min(...ys) - 60, Math.max(...xs) - Math.min(...xs) + 120, Math.max(...ys) - Math.min(...ys) + 120];
    const svg = sv('svg', { viewBox: box.join(' '), role: 'img', 'aria-label': t(`dev.interieur.plan.svg.${floor}`) });
    svg.append(sv('polygon', { class: 'i9-contour', points: c.contour.map((p) => p.join(',')).join(' ') }));
    for (const q of monde.obstacles) svg.append(sv('rect', { class: q.kind === 'escalier' ? 'i9-escalier' : 'i9-meuble', x: q.x, y: q.y, width: q.w, height: q.h }));
    for (const w of c.windows) svg.append(sv('circle', { class: 'i9-zone-fenetre', cx: w.x, cy: w.y, r: 150 }), sv('rect', { class: 'i9-fenetre', x: w.x - 36, y: w.y - 20, width: 72, height: 40 }), sv('text', { class: 'i9-etiquette', x: w.x + 40, y: w.y + 8 }, w.id));
    for (const l of c.lamps) svg.append(sv('circle', { class: 'i9-lampe', cx: l.x, cy: l.y, r: 12 }));
    for (const ob of plan.objets.filter((q) => q.floor === floor)) {
      const e = ob.emprise;
      if (ob.collision) for (const r of ob.rects) svg.append(sv('rect', { class: 'i9-passe', x: r.x, y: r.y, width: Math.max(4, r.w), height: Math.max(4, r.h), 'data-id': ob.id }));
      else svg.append(sv('rect', { class: 'i9-libre', x: e.x - 3, y: e.y - 3, width: Math.max(8, e.w + 6), height: Math.max(8, e.h + 6), 'data-id': ob.id }));
      svg.append(sv('text', { class: 'i9-etiquette', x: e.x, y: e.y - 8 }, ob.id));
    }
    $(`plan-${floor}`).replaceChildren(svg);
  }
  const chemins = Object.entries(plan.chemins).flatMap(([f, l]) => l.map((c) => ({ ...c, floor: f })));
  $('plan-resume').textContent = t('dev.interieur.plan.resume', { objets: plan.objets.length, solides: plan.objets.filter((q) => q.collision).length, coupes: chemins.filter((c) => c.coupees > 0).length, max: Math.max(0, ...chemins.map((c) => c.allongementMax)), problemes: plan.problemes.length }) + (plan.problemes.length ? ` ${plan.problemes.join(' ; ')}` : '');
  const placeDe = (ob) => `${t(`dev.interieur.etage.${ob.floor}`)} · ${ob.spec.x}, ${ob.spec.y}${ob.sur ? ` · ${t('dev.interieur.sur', { id: ob.sur, h: ob.base })}` : ''}${CATALOGUE[ob.type].pose === 'mur' ? ` · ${t('dev.interieur.mur')}` : ''}`;
  remplir('table-objets', plan.objets.map((ob) => [ob.id, `${nomType(ob.type)} — ${nomVariante(ob.type, ob.variante)}`, placeDe(ob), `${ob.emprise.w} × ${ob.emprise.h}`, String(ob.hauteur), tirsDe(ob), t(ob.collision ? 'dev.interieur.collision.oui' : 'dev.interieur.collision.non'), String(ob.compte)]));
  remplir('table-chemins', chemins.map((c) => [t(`dev.interieur.etage.${c.floor}`), c.fenetre, String(c.cellules), String(c.coupees), `${c.allongementMax} (${n1(c.allongementMoyen)})`]));
  const b = plan.budget;
  $('budget-plan').textContent = t('dev.interieur.budget.plan', { total: b.total, rdc: b.parEtage.rdc, etage: b.parEtage.etage, lueur: b.lueur });
  return plan;
}

// --- Lampe coudée sur le joueur (comparée à la frontale de l'ancienne variante B) ------------------------------------------------------------------
const lampeMesures = {};
function preparerLampe() {
  const slots = slotsWithEpoch(characters.slots, epoqueJson).map((s) => {
    if (s.id !== 'joueur') return s;
    const base = s.variants.find((v) => v.id === 'epoque-A');
    return base ? { ...s, variants: [...s.variants, { ...avecLampeCoudee(base), id: 'epoque-A-tl122', label: 'Survivant A, lampe coudée' }] } : s;
  });
  const kit = createV2Kit({ characters: { ...characters, slots }, poses, lookup, hit: palette.hit, zombieIds: variantsJson.zombie.variants.map((v) => v.id), seed: 9 });
  const faire = (choice) => {
    const c = kit.create('player', 0, { choice });
    c.setPose(null, { time: 0, amount: 0, phase: 0, aim: 0, facing: 0, recoil: 0, avant: 1, lateral: 0 }, { down: null, repairing: false, hurt: false });
    return c;
  };
  return { avant: faire('B'), apres: faire('epoque-A-tl122'), sans: faire('epoque-A') };
}
let persos = null;
function dessinerLampe() {
  if (!persos) persos = preparerLampe();
  vider(groupe);
  table.visible = false;
  mur.visible = false;
  const g = new THREE.Group();
  groupe.add(g);
  const compte = (c) => {
    g.clear();
    g.add(c.root);
    c.root.position.set(0, 0, 0);
    c.root.rotation.set(0, 0, 0);
    const vue = new THREE.Scene();
    vue.add(c.root);
    renderer?.render(vue, cam);
    const r = { calls: renderer?.info.render.calls ?? 0, triangles: renderer?.info.render.triangles ?? 0 };
    g.add(c.root);
    return r;
  };
  if (renderer) {
    lampeMesures.avant = compte(persos.avant);
    lampeMesures.apres = compte(persos.apres);
    lampeMesures.sans = compte(persos.sans);
  }
  // Gros plans de trois quarts face, à hauteur de poitrine (la lampe est à gauche du personnage : à droite de l'image).
  const proche = new THREE.PerspectiveCamera(30, 480 / 360, 2, 2000);
  for (const [cle, cv] of [['avant', 'cv-lampe-avant'], ['apres', 'cv-lampe-apres']]) {
    g.clear();
    const c = persos[cle];
    g.add(c.root);
    c.root.position.set(0, 0, 0);
    c.root.rotation.set(0, 0.35, 0);
    proche.position.set(26, 60, 72);
    proche.up.set(0, 1, 0);
    proche.lookAt(0, 47, 0);
    proche.updateProjectionMatrix();
    repere.visible = false;
    rendre(scene, proche, $(cv));
  }
  // Vue du jeu : les deux joueurs côte à côte sous la lampe à huile (ancienne frontale à gauche, lampe coudée à droite).
  g.clear();
  persos.avant.root.position.set(-45, 0, 0);
  persos.apres.root.position.set(45, 0, 0);
  for (const c of [persos.avant, persos.apres]) {
    c.root.rotation.set(0, Math.PI, 0); // de face, regard vers le sud (vers la caméra du jeu)
    g.add(c.root);
  }
  repere.visible = false;
  lampeMesures.jeu = vueJeu($('cv-lampe-jeu'));
  repere.visible = true;
  $('lampe-mesures').textContent = t('dev.interieur.lampe.mesures', { a: lampeMesures.avant?.calls ?? 0, ta: lampeMesures.avant?.triangles ?? 0, b: lampeMesures.apres?.calls ?? 0, tb: lampeMesures.apres?.triangles ?? 0, s: lampeMesures.sans?.calls ?? 0, ts: lampeMesures.sans?.triangles ?? 0, pieces: PIECES_TL122.length });
}

// --- Ouvertures (scène du menu, option epoque) -------------------------------------------------------------------------------------------------------
const temoinHote = document.createElement('div');
temoinHote.className = 'e3-ouverture';
temoinHote.style.display = 'none';
const temoin = document.createElement('span');
temoinHote.append(temoin);
document.body.append(temoinHote);
const cacheCouleurs = new Map();
const couleur = (jeton) => {
  if (!cacheCouleurs.has(jeton)) {
    temoin.style.color = `var(${jeton})`;
    const c = parseColor(getComputedStyle(temoin).color);
    cacheCouleurs.set(jeton, c ? toHex(c) : toHex([255, 255, 255]));
  }
  return cacheCouleurs.get(jeton);
};
const ouvMesures = [];
async function dessinerOuvertures() {
  const raretes = raretesJson.raretes.map((x) => x.id);
  const { reglages } = lireOuvertures(ouvJson, raretes);
  const { creerScene } = await import('../menu/ouverture/scene.js');
  const police = getComputedStyle(document.documentElement).getPropertyValue('--font-display').trim() || 'sans-serif';
  const hote = $('ouv-planche');
  const vignette = (legende) => {
    const fig = document.createElement('figure');
    fig.className = 'decor-vignette';
    const cv = document.createElement('canvas');
    cv.width = 932;
    cv.height = 430;
    cv.setAttribute('aria-hidden', 'true');
    const cap = document.createElement('figcaption');
    cap.textContent = legende;
    fig.append(cv, cap);
    hote.append(fig);
    return cv;
  };
  const carte = (r) => ({ objet: { id: 'exemple' }, nom: t('dev.interieur.ouv.carte'), ligne2: raretesJson.raretes.find((x) => x.id === r)?.nom ?? r, ligne3: '', jeton: `--rarete-${r}`, halo: true });
  // Une scène par cas (créée, rendue aux instants voulus, recopiée, libérée) : actuelle / époque × trois caisses, puis un ×10 d'époque avec un légendaire.
  const cas = [];
  for (const modele of ['militaire', 'veterans', 'tenues']) for (const ep of [false, true]) cas.push({ modele, ep, raretes: [modele === 'militaire' ? 'epique' : 'rare'] });
  cas.push({ modele: 'militaire', ep: true, raretes: ['commun', 'rare', 'peu-commun', 'legendaire', 'commun', 'epique', 'commun', 'rare', 'peu-commun', 'commun'], dix: true });
  for (const k of cas) {
    const chrono = chronologie(reglages, k.raretes, { graine: 3 });
    const canvas = document.createElement('canvas');
    canvas.width = 932;
    canvas.height = 430;
    let sc;
    try {
      sc = await creerScene({ canvas, couleur, chrono, reglages, cartes: k.raretes.map(carte), modele: k.modele, police, caseCible: () => ({ x: 0, y: 0.9, l: 0.04 }), epoque: k.ep ? { arme: menu.arme === 'garand' ? 'garand' : null, caisses: true } : null });
    } catch (err) {
      ouvMesures.push({ ...k, erreur: err?.message ?? String(err) });
      continue;
    }
    sc.redimensionner(932, 430);
    const c0 = chrono.caisses[k.dix ? 3 : 0];
    const instants = k.dix ? [['dev.interieur.ouv.t.dix', c0.tir + 0.9]] : [['dev.interieur.ouv.t.tapis', c0.tir - 0.25], ['dev.interieur.ouv.t.tir', c0.tir + 0.03], ['dev.interieur.ouv.t.douille', c0.tir + 0.22], ['dev.interieur.ouv.t.ouverte', c0.tir + 1.2]];
    for (const [cle, tps] of instants) {
      sc.rendre(tps);
      const cv = vignette(t('dev.interieur.ouv.vignette', { caisse: t(`dev.interieur.caisse.${k.modele}`), version: t(k.ep ? 'dev.interieur.apres' : 'dev.interieur.avant'), instant: t(cle) }));
      cv.getContext('2d').drawImage(canvas, 0, 0, cv.width, cv.height);
      cv.dataset.cas = `${k.modele}-${k.ep ? 'epoque' : 'actuelle'}${k.dix ? '-x10' : ''}`;
    }
    const info = sc.info();
    const apres = sc.liberer();
    ouvMesures.push({ modele: k.modele, epoque: k.ep, dix: k.dix === true, pic: info.pic, apres });
  }
  const ep = ouvMesures.filter((m) => m.epoque && m.pic);
  const av = ouvMesures.filter((m) => !m.epoque && m.pic);
  $('ouv-mesures').textContent = t('dev.interieur.ouv.mesures', {
    appels: Math.max(0, ...ep.map((m) => m.pic.appels)), triangles: Math.max(0, ...ep.map((m) => m.pic.triangles)),
    appelsAvant: Math.max(0, ...av.map((m) => m.pic.appels)), trianglesAvant: Math.max(0, ...av.map((m) => m.pic.triangles)),
    libere: ouvMesures.every((m) => !m.apres || (m.apres.geometries === 0 && m.apres.textures === 0)) ? t('dev.interieur.oui') : t('dev.interieur.non'),
  });
}

// --- Caisses du menu et scènes ---------------------------------------------------------------------------------------------------------------------
function dessinerMenu() {
  const hote = $('caisses-planche');
  for (const [modele, teinte] of [['militaire', '--rarete-rare'], ['veterans', '--rarete-epique'], ['tenues', '--rarete-peu-commun']]) {
    for (const ep of [false, true]) {
      const fig = document.createElement('figure');
      fig.className = 'decor-vignette';
      const box = document.createElement('div');
      box.className = 'i9-caisse-hote';
      box.style.setProperty('--e3-teinte', `var(${teinte})`);
      box.dataset.cas = `${modele}-${ep ? 'epoque' : 'actuelle'}`;
      box.append(ep ? caisseSvgEpoque(modele) : caisseSvg(modele));
      const cap = document.createElement('figcaption');
      cap.textContent = t('dev.interieur.caisses.vignette', { caisse: t(`dev.interieur.caisse.${modele}`), version: t(ep ? 'dev.interieur.apres' : 'dev.interieur.avant') });
      fig.append(box, cap);
      hote.append(fig);
    }
  }
  const scenes = $('scenes-planche');
  const etatJouer = { panneaux: [1, 10, 20, 30, 40].map((m, i) => ({ manche: m, atteint: i < 2 })), repere: 1.4 };
  const ajouter = (svg, legende, chargement, cas) => {
    const fig = document.createElement('figure');
    fig.className = 'decor-vignette';
    const box = document.createElement('div');
    box.className = `i9-scene-hote ${chargement ? 'i9-chargement' : 'e8-jouer-scene'}`;
    if (!chargement) box.dataset.anim = reduit ? 'off' : 'on';
    box.dataset.cas = cas;
    box.append(svg);
    const cap = document.createElement('figcaption');
    cap.textContent = legende;
    fig.append(box, cap);
    scenes.append(fig);
  };
  // Après le « GO 9i » : scènes intégrées au menu (onglet Histoire « B », chargement « C »), dessinées par les modules du menu.
  ajouter(sceneJouer(etatJouer), t('dev.interieur.scenes.histoire', { version: t('dev.interieur.scenes.histoire.B') }), false, 'histoire-B');
  ajouter(decorNuit(), t('dev.interieur.scenes.chargement', { version: t('dev.interieur.scenes.chargement.C') }), true, 'chargement-C');
}

// Revue du contenu.
{
  const ul = $('contenu-liste');
  const textes = [TEXTES.medical].map((s) => `« ${s.replace(/\s+/g, ' ')} »`).join(', ');
  for (const [cle, p] of [['dev.interieur.contenu.medical'], ['dev.interieur.contenu.textes', { textes }], ['dev.interieur.contenu.cartes'], ['dev.interieur.contenu.interdits'], ['dev.interieur.contenu.images'], ['dev.interieur.contenu.lumiere']]) {
    const li = document.createElement('li');
    li.textContent = t(cle, p);
    ul.append(li);
  }
}

// --- Réglages ------------------------------------------------------------------------------------------------------------------------------------
const remplirSelect = (sel, options, valeur) => {
  sel.replaceChildren(...options.map(([v, texte]) => {
    const op = document.createElement('option');
    op.value = v;
    op.textContent = texte;
    return op;
  }));
  sel.value = valeur;
};
let courant = null;
function dessiner() {
  eclairage();
  courant = poser(etat.type, etat.variantes[etat.type]);
  const a = vueJeu($('cv-jeu'));
  vueJeu($('cv-jeu-grand'));
  mesures.jeu = { ...a, objet: { appels: courant.appels, triangles: courant.triangles } };
  $('jeu-mesures').textContent = t('dev.interieur.jeu.mesures', { tris: courant.triangles, appels: courant.appels, L: courant.info.emprise?.w ?? 0, l: courant.info.emprise?.h ?? 0, h: courant.info.hauteur });
  mesures.grosPlan = vueProche($('cv-gros-plan'), etat.yaw, courant.info);
  fiche(courant.info);
  majChoix();
}
function majVariantes() {
  remplirSelect($('ctl-variante'), CATALOGUE[etat.type].variantes.map((v) => [v, nomVariante(etat.type, v)]), etat.variantes[etat.type]);
  remplirSelect($('ctl-garde'), [['oui', t('dev.interieur.garde.oui')], ['non', t('dev.interieur.garde.non')]], etat.gardes[etat.type] ? 'oui' : 'non');
}
remplirSelect($('ctl-objet'), TYPES.map((ty) => [ty, nomType(ty)]), etat.type);
remplirSelect($('ctl-lumiere'), [['lampe', t('dev.interieur.lumiere.lampe')], ['lune', t('dev.interieur.lumiere.lune')]], etat.lumiere);
remplirSelect($('ctl-rotation'), reduit ? [['non', t('dev.interieur.rotation.reduit')]] : [['oui', t('dev.interieur.rotation.oui')], ['non', t('dev.interieur.rotation.non')]], etat.rotation ? 'oui' : 'non');
if (reduit) $('ctl-rotation').disabled = true;
remplirSelect($('ctl-caisses'), [['epoque', t('dev.interieur.choix.caisses.epoque')], ['actuelles', t('dev.interieur.choix.caisses.actuelles')]], menu.caisses);
remplirSelect($('ctl-arme'), [['garand', t('dev.interieur.choix.arme.garand')], ['fusil', t('dev.interieur.choix.arme.fusil')]], menu.arme);
remplirSelect($('ctl-histoire'), VARIANTES_HISTOIRE.map((v) => [v, t(`dev.interieur.scenes.histoire.${v}`)]), menu.histoire);
remplirSelect($('ctl-chargement'), VARIANTES_CHARGEMENT.map((v) => [v, t(`dev.interieur.scenes.chargement.${v}`)]), menu.chargement);
for (const [id, cle] of [['ctl-caisses', 'caisses'], ['ctl-arme', 'arme'], ['ctl-histoire', 'histoire'], ['ctl-chargement', 'chargement']]) {
  $(id).addEventListener('change', (e) => {
    menu[cle] = e.target.value;
    majChoix();
  });
}
majVariantes();
$('ctl-objet').addEventListener('change', (e) => {
  etat.type = e.target.value;
  majVariantes();
  dessiner();
});
$('ctl-variante').addEventListener('change', (e) => {
  etat.variantes[etat.type] = e.target.value;
  dessiner();
  majPlan();
  majPlanche();
});
$('ctl-garde').addEventListener('change', (e) => {
  etat.gardes[etat.type] = e.target.value === 'oui';
  majChoix();
  majPlan();
});
$('ctl-lumiere').addEventListener('change', (e) => {
  etat.lumiere = e.target.value;
  dessiner();
});
$('ctl-rotation').addEventListener('change', (e) => {
  etat.rotation = e.target.value === 'oui' && !reduit;
  if (etat.rotation) boucle();
});

// Planche : chaque variante de chaque objet, de trois quarts (la proposée encadrée).
function majPlanche() {
  const hote = $('planche');
  if (!hote.childElementCount) {
    for (const r of toutes) {
      const fig = document.createElement('figure');
      fig.className = 'decor-vignette';
      fig.dataset.type = r.type;
      fig.dataset.variante = r.variante;
      const cv = document.createElement('canvas');
      cv.width = 320;
      cv.height = 200;
      cv.setAttribute('aria-hidden', 'true');
      const cap = document.createElement('figcaption');
      cap.textContent = `${nomType(r.type)} — ${nomVariante(r.type, r.variante)} · ${r.triangles} triangles · h ${r.hauteur}`;
      fig.append(cv, cap);
      hote.append(fig);
      const p = poser(r.type, r.variante);
      vueProche(cv, 0.75, p.info, 0.5);
    }
  }
  for (const fig of hote.children) fig.dataset.retenue = etat.variantes[fig.dataset.type] === fig.dataset.variante ? 'oui' : 'non';
}

// Gros plan qui tourne (temps réel de la page ; jamais sous mouvement réduit).
let enBoucle = false;
let avant = 0;
function boucle() {
  if (enBoucle || !etat.rotation || reduit || !renderer) return;
  enBoucle = true;
  avant = performance.now();
  const pas = (now) => {
    if (!etat.rotation) {
      enBoucle = false;
      return;
    }
    const dt = Math.min(0.1, (now - avant) / 1000);
    avant = now;
    etat.yaw += dt * 0.35;
    if (courant && !persoAffiche) vueProche($('cv-gros-plan'), etat.yaw, courant.info);
    requestAnimationFrame(pas);
  };
  requestAnimationFrame(pas);
}
let persoAffiche = false;

let ouverturesPretes = false;
try {
  eclairage();
  majPlanche();
  persoAffiche = true;
  if (renderer) dessinerLampe();
  persoAffiche = false;
  dessiner();
  majPlan(true);
  dessinerMenu();
  status.textContent = t('dev.interieur.pret', { n: toutes.length, objets: plan.objets.length, problemes: plan.problemes.length });
  boucle();
  if (renderer) {
    dessinerOuvertures().catch((err) => {
      $('ouv-mesures').textContent = t('dev.interieur.erreur', { message: err?.message ?? String(err) });
    }).finally(() => {
      ouverturesPretes = true;
    });
  } else ouverturesPretes = true;
} catch (err) {
  status.textContent = t('dev.interieur.erreur', { message: err?.message ?? String(err) });
  throw err;
}

if (testMode) {
  window.__zsInterieur = {
    pret: true,
    webgl: renderer !== null,
    reduit,
    atlasMs,
    hauteurArme: HAUTEUR_ARME,
    etat: () => ({ ...etat, variantes: { ...etat.variantes }, gardes: { ...etat.gardes } }),
    toutes: () => toutes.map((r) => ({ ...r })),
    mesures: () => JSON.parse(JSON.stringify({ ...mesures, lampe: lampeMesures })),
    rendus: () => rendus,
    plan: () => ({ problemes: [...plan.problemes], budget: { ...plan.budget }, objets: plan.objets.map((q) => ({ id: q.id, type: q.type, variante: q.variante, floor: q.floor, rects: q.rects.length, collision: q.collision })), chemins: JSON.parse(JSON.stringify(plan.chemins)) }),
    ouvertures: () => ({ pretes: ouverturesPretes, mesures: JSON.parse(JSON.stringify(ouvMesures)) }),
    propositionInterieur,
    propositionMenu,
    yaw: () => etat.yaw,
    choisir(type, variante) {
      if (!CATALOGUE[type]) return false;
      etat.type = type;
      if (CATALOGUE[type].variantes.includes(variante)) etat.variantes[type] = variante;
      majVariantes();
      $('ctl-objet').value = type;
      dessiner();
      majPlan();
      majPlanche();
      return true;
    },
  };
}
