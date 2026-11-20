// Lot 9h — Atelier du décor extérieur d'époque (atelier-decor.html, page technique ; Docs/ref/decor-epoque.md). Un seul contexte WebGL : chaque vue est
// rendue puis copiée dans son canevas 2D. Rien n'est écrit dans le stockage ; aucune requête externe ; la partie et le menu ne chargent aucun de ces
// modules. ?test=1 : window.__zsDecor (état, toutes les variantes, mesures, plan).
import * as THREE from 'three';
import { translate } from '../i18n.js';
import { createTokenLookup, readPalette } from '../game/palette.js';
import { createFire } from '../game/fire.js';
import { buildSpec, createTextureData } from '../core/texgen.js';
import { cameraPosition, fitDistance } from '../core/viewport.js';
import { mapToSvg } from '../core/map-svg.js';
import { craterTriangles, trailTriangles } from '../core/epaves.js';
import { windowsWithGaps } from '../core/layout.js';
import { windowGeometries } from '../core/windows.js';
import { CATALOGUE, MATIERES, TEXTES, TYPES, atlasEpoque, budgetPlan, controlePlan, couleursEpoque, filsTelegraphe, lireChoix, objet, trianglesFils } from '../core/decor-epoque.js';

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
const [dict, donnees, choixJson, placement, world, decorCfg, render, texturesJson, windowsCfg, navCfg, lumieres] = await Promise.all([
  'data/i18n/atelier-decor.json', 'data/game/decor-epoque.json', 'data/game/decor-epoque-choix.json', 'data/game/maps/rez-de-chaussee/decor-epoque.json',
  'data/game/maps/rez-de-chaussee/world.json', 'data/game/maps/rez-de-chaussee/decor.json',
  'data/game/render.json', 'data/game/textures.json', 'data/game/windows.json', 'data/game/nav.json', 'data/game/lumieres.json',
].map(charger));
const t = (key, params) => fmt(translate(dict, key), params);
for (const node of document.querySelectorAll('[data-i18n]')) node.textContent = t(node.dataset.i18n);
for (const node of document.querySelectorAll('[data-i18n-label]')) node.setAttribute('aria-label', t(node.dataset.i18nLabel));
$('app').hidden = false;
const status = $('status');
status.textContent = t('dev.decor.chargement');

const palette = readPalette();
const lookup = createTokenLookup();
const couleurs = couleursEpoque(donnees.couleurs, lookup);
const choix0 = lireChoix(choixJson);
const etat = { type: TYPES[0], variantes: { ...choix0.variantes }, gardes: { ...choix0.gardes }, lumiere: 'lune', rotation: !reduit, yaw: 0.7, temps: 0 };
const nomType = (type) => t(`dev.decor.objet.${type}`);
const nomVariante = (type, v) => t(`dev.decor.variante.${type}.${v}`);

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

// Textures : atlas d'époque (js/core/decor-epoque.js) et sols du jeu (textures.json, texgen.js) ; aucune image.
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
const atlas = atlasEpoque({ couleurs });
const atlasMs = Math.round(performance.now() - t0);
const atlasTex = dataTexture(atlas, false);
const entree = (id) => texturesJson.textures.find((e) => e.id === id);
const herbeTex = dataTexture(createTextureData(buildSpec(entree('herbe'), lookup)), true);
const terreTex = dataTexture(createTextureData(buildSpec(entree('sol-exterieur'), lookup)), true);
const repHerbe = entree('herbe').repeat;
const repTerre = entree('sol-exterieur').repeat;
const matAtlas = new THREE.MeshLambertMaterial({ map: atlasTex, vertexColors: true });
const matSol = new THREE.MeshLambertMaterial({ map: terreTex, vertexColors: true });
const lin = (rgb) => {
  const c = new THREE.Color().setRGB(rgb[0] / 255, rgb[1] / 255, rgb[2] / 255, THREE.SRGBColorSpace);
  return [c.r, c.g, c.b];
};
const teinte = (mat) => {
  const cle = MATIERES[mat]?.teinte;
  return cle && cle !== 'neutre' && couleurs[cle] ? lin(couleurs[cle]) : [1, 1, 1];
};

// Maillages d'une liste de triangles : un maillage atlas (une matière), un maillage de sol (trous d'obus, cratère). → { meshes, appels, triangles }.
function maillages(tris, { ombre = false } = {}) {
  const atlasT = tris.filter((q) => !MATIERES[q.mat]?.sol);
  const solT = tris.filter((q) => MATIERES[q.mat]?.sol);
  const meshes = [];
  const geo = (liste, uvOf, colOf) => {
    const pos = [];
    const nor = [];
    const uv = [];
    const col = [];
    for (const q of liste) for (let i = 0; i < 3; i += 1) {
      pos.push(...q.p[i]);
      nor.push(...q.n);
      uv.push(...uvOf(q, i));
      col.push(...colOf(q));
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.computeBoundingSphere();
    return g;
  };
  if (atlasT.length) {
    const m = new THREE.Mesh(geo(atlasT, (q, i) => q.uv[i], (q) => teinte(q.mat)), matAtlas);
    m.castShadow = ombre;
    m.receiveShadow = true;
    meshes.push(m);
  }
  if (solT.length) {
    const m = new THREE.Mesh(geo(solT, (q, i) => [q.p[i][0] / repTerre, q.p[i][2] / repTerre], (q) => teinte(q.mat)), matSol);
    m.receiveShadow = true;
    meshes.push(m);
  }
  return { meshes, appels: meshes.length, triangles: tris.length };
}

// Scène : sol d'herbe, lune (comme la partie : ambiante et soleil de render.json, couleurs --game-ambient et --game-sun), brouillard, feu facultatif.
const scene = new THREE.Scene();
scene.background = new THREE.Color(palette.void);
const solGeo = new THREE.PlaneGeometry(8000, 8000).rotateX(-Math.PI / 2);
{
  const uv = solGeo.attributes.uv;
  for (let i = 0; i < uv.count; i += 1) uv.setXY(i, (uv.getX(i) * 8000) / repHerbe, (uv.getY(i) * 8000) / repHerbe);
}
const sol = new THREE.Mesh(solGeo, new THREE.MeshLambertMaterial({ map: herbeTex }));
sol.position.y = -1;
sol.receiveShadow = true;
scene.add(sol);
scene.add(new THREE.AmbientLight(palette.ambient, render.light.ambient));
const lune = new THREE.DirectionalLight(palette.sun, render.light.sun);
const o = render.light.sunOffset;
lune.position.set(o.x, o.y, o.z);
lune.castShadow = true;
lune.shadow.mapSize.set(1024, 1024);
Object.assign(lune.shadow.camera, { left: -400, right: 400, top: 400, bottom: -400, near: 50, far: 4000 });
lune.shadow.bias = -0.0006;
scene.add(lune, lune.target);
const feuxCfg = lumieres?.feux ?? {};
const lumiereFeu = new THREE.PointLight(palette.fireEdge, Number(feuxCfg.intensite) || 900, Number(feuxCfg.distance) || 280, Number(lumieres?.decroissance) || 1);
lumiereFeu.position.set(-120, 45, 90);
scene.add(lumiereFeu);
// Repère de taille : un zombie (61 de haut, rayon 12, couleur --game-zombie).
const repere = new THREE.Mesh(new THREE.CylinderGeometry(12, 12, 61, 10), new THREE.MeshLambertMaterial({ color: palette.zombie }));
repere.castShadow = true;
scene.add(repere);
const groupe = new THREE.Group();
scene.add(groupe);
let feuxActifs = [];

// Objet affiché : modèle, maillages, feux (véhicule en flammes : flammes et fumée de fire.js ; avion : fumée légère, cratère et traînée).
function poser(type, variante) {
  for (const m of [...groupe.children]) {
    groupe.remove(m);
    m.traverse((q) => q.geometry?.dispose());
  }
  feuxActifs = [];
  let tris;
  let info;
  if (type === 'poteau') {
    const a = objet(type, variante, { x: -110, y: 0, rang: 0 });
    const b = objet(type, variante, { x: 110, y: 0, rang: 1 });
    tris = [...a.triangles, ...b.triangles, ...trianglesFils(filsTelegraphe([a, b]))];
    info = { ...b, compte: a.compte, emprise: b.emprise };
  } else {
    info = objet(type, variante, { x: 0, y: 0, cap: type === 'avion' ? 165 : 0 });
    tris = info.triangles;
  }
  if (type === 'avion') {
    const spec = { x: 0, y: 0, heading: 165, crater: { rx: 170, ry: 120 }, trail: { length: 380, width: 60 } };
    tris = [...tris, ...[...craterTriangles(spec), ...trailTriangles(spec)].map((q) => ({ ...q, mat: q.tint === 'crater-burnt' ? 'sol-brule' : 'sol-terre', uv: q.p.map((p) => [p[0], p[2]]) }))];
    const fumee = createFire({ id: 'fumee-avion', x: 0, z: 0, y: 34, w: 90, d: 60 }, palette, { reduced: reduit, glow: false, flames: false, smoke: { alpha: 0.16, color: palette.smokeLight, rise: 0.7 } });
    groupe.add(fumee.group);
    feuxActifs.push(fumee);
  }
  if (type === 'vehiculeFeu' && info.feux?.length) {
    const fire = createFire({ id: 'feu-vehicule', x: 0, z: 0, y: Math.max(...info.feux.map((f) => f.y)), w: info.emprise.w, d: info.emprise.h, spots: info.feux.map((f) => ({ id: f.id, x: f.x, z: f.z, y: f.y, w: f.w, d: f.d })) }, palette, { reduced: reduit, glow: false });
    groupe.add(fire.group);
    feuxActifs.push(fire);
  }
  for (const f of feuxActifs) for (let i = 0; i < 40; i += 1) f.update(0.05, true);
  const res = maillages(tris, { ombre: type === 'vehicule' });
  for (const m of res.meshes) groupe.add(m);
  const e = info.emprise ?? { x: -20, y: -20, w: 40, h: 40 };
  repere.position.set(e.x + e.w + 34, 30.5, 0);
  lumiereFeu.visible = etat.lumiere === 'feu' || type === 'vehiculeFeu';
  return { info, appels: res.appels, triangles: res.triangles };
}

// --- Vues ----------------------------------------------------------------------------------------------------------------------------------------
const cam = new THREE.PerspectiveCamera(render.camera.fov, 667 / 375, render.camera.near, render.camera.far);
cam.up.set(0, 0, -1);
const layoutJeu = controlePlan({ world, decorCfg, doc: { objets: [] }, toutesVariantes: false }).layout;
const mesures = {};
function vueJeu(canvas) {
  repere.visible = true;
  const aspect = canvas.width / canvas.height;
  const d = fitDistance(aspect, layoutJeu.viewPlay, render.camera.tilt, render.camera.fov, render.camera.margin) / render.camera.zoom;
  const p = cameraPosition({ x: 0, y: 0 }, d, render.camera.tilt);
  cam.aspect = aspect;
  cam.position.set(p.x, p.y, p.z);
  cam.lookAt(0, 0, 0);
  cam.updateProjectionMatrix();
  scene.fog = new THREE.Fog(palette.fog, d * render.fog.near, d * render.fog.far);
  lune.target.position.set(0, 0, 0);
  return rendre(scene, cam, canvas);
}
const camProche = new THREE.PerspectiveCamera(40, 720 / 440, 5, 6000);
function vueProche(canvas, yaw, info, pitch = 0.62) {
  repere.visible = false; // le repère de taille n'est montré que dans la vue du jeu
  const e = info?.emprise ?? { x: -40, y: -40, w: 80, h: 80 };
  const cx = e.x + e.w / 2;
  const cz = e.y + e.h / 2;
  const haut = info?.hauteur ?? 40;
  const r = Math.max(e.w, e.h, haut * (haut > 100 ? 1.1 : 1)) * 1.25 + 70;
  camProche.aspect = canvas.width / canvas.height;
  camProche.up.set(0, 1, 0);
  camProche.position.set(cx + Math.cos(yaw) * Math.cos(pitch) * r, Math.sin(pitch) * r, cz + Math.sin(yaw) * Math.cos(pitch) * r);
  camProche.lookAt(cx, haut * (haut > 100 ? 0.55 : 0.35), cz);
  camProche.updateProjectionMatrix();
  scene.fog = null;
  return rendre(scene, camProche, canvas);
}

// --- Tableaux, fiche, choix ---------------------------------------------------------------------------------------------------------------------
const tirsDe = (o) => {
  if (!o.rects.length) return t('dev.decor.tirs.aucun');
  const s = new Set(o.rects.map((r) => r.tirs));
  if (s.size > 1) return `${t('dev.decor.tirs.mixte')} (${o.rects.map((r) => `${r.id.split('-').pop()} ${r.hauteur} : ${t(`dev.decor.tirs.${r.tirs}`)}`).join(', ')})`;
  return t(`dev.decor.tirs.${[...s][0]}`);
};
const reelDe = (type, v) => {
  const r = donnees.reel?.[type]?.[v];
  return Array.isArray(r) ? r.map(n1).join(' × ') : '–';
};
const toutes = [];
for (const type of TYPES) for (const v of CATALOGUE[type].variantes) {
  const ob = objet(type, v, { x: 0, y: 0 });
  toutes.push({ type, variante: v, triangles: ob.compte, budget: CATALOGUE[type].budget, hauteur: ob.hauteur, emprise: ob.emprise, rects: ob.rects.map((r) => ({ id: r.id, w: r.w, h: r.h, hauteur: r.hauteur, tirs: r.tirs })), collision: ob.collision, tirs: tirsDe(ob) });
}
{
  const corps = $('table-budget').querySelector('tbody');
  for (const r of toutes) {
    const tr = document.createElement('tr');
    for (const v of [nomType(r.type), nomVariante(r.type, r.variante), `${r.triangles} / ${r.budget}`, reelDe(r.type, r.variante), r.emprise ? `${r.emprise.w} × ${r.emprise.h}` : '–', String(r.hauteur), r.tirs, t(r.collision ? 'dev.decor.collision.oui' : 'dev.decor.collision.non')]) {
      const td = document.createElement('td');
      td.textContent = v;
      tr.append(td);
    }
    corps.append(tr);
  }
}
function fiche(info) {
  const r = toutes.find((q) => q.type === etat.type && q.variante === etat.variantes[etat.type]);
  $('variante-description').textContent = t('dev.decor.retenue', { v: nomVariante(etat.type, etat.variantes[etat.type]) });
  $('variante-fiche').textContent = t('dev.decor.fiche', { reel: reelDe(etat.type, etat.variantes[etat.type]), jeu: info.emprise ? `${info.emprise.w} × ${info.emprise.h}` : '–', h: info.hauteur, tris: r?.triangles ?? info.compte, budget: CATALOGUE[etat.type].budget, tirs: r?.tirs ?? '–', collision: t(info.collision ? 'dev.decor.collision.oui' : 'dev.decor.collision.non') });
}
function proposition() {
  return { variantes: { ...etat.variantes }, gardes: { ...etat.gardes } };
}
function majChoix() {
  $('choix-json').textContent = JSON.stringify(proposition(), null, 2);
}

// --- Plan de placement ---------------------------------------------------------------------------------------------------------------------------
const NS = 'http://www.w3.org/2000/svg';
const el = (name, attrs, texte) => {
  const e = document.createElementNS(NS, name);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  if (texte !== undefined) e.textContent = texte;
  return e;
};
let plan = null;
function majPlan(toutesVariantes = false) {
  plan = controlePlan({ world, decorCfg, doc: placement, choixJson: proposition(), geometries: (l) => windowGeometries(windowsWithGaps(l), windowsCfg), navCfg, toutesVariantes });
  const fig = $('plan-figure');
  fig.innerHTML = mapToSvg(world, decorCfg, { labels: { title: t('dev.decor.plan.svg.titre'), desc: t('dev.decor.plan.svg.desc'), scale: '', frame: '', start: '' } });
  const svg = fig.querySelector('svg');
  const gC = el('g', { class: 'chemins' });
  const ligne = (pts, x, y, cls) => gC.append(el('polyline', { class: cls, points: [[x, y], ...pts.map((p) => [p.x, p.y])].map((q) => q.join(',')).join(' ') }));
  for (const c of plan.chemins) {
    if (c.avant) ligne(c.avant.points, c.x, c.y, 'ch-avant');
    if (c.apres) ligne(c.apres.points, c.x, c.y, 'ch-apres');
  }
  const gA = el('g', { class: 'decor-garde' }); // arbres gardés du décor actuel (troncs solides)
  for (const a of plan.decor?.trees ?? []) gA.append(el('circle', { class: 'ep-arbre', cx: a.x + a.w / 2, cy: a.y + a.h / 2, r: Math.max(a.w, a.couronne ?? a.w) / 2 }));
  const gO = el('g', { class: 'objets-epoque' });
  const rect = (r, cls, id) => gO.append(el('rect', { class: cls, x: r.x, y: r.y, width: r.w, height: r.h, 'data-id': id }));
  for (const ob of plan.objets) {
    if (!ob.emprise) continue;
    rect(ob.emprise, 'ep-emprise', ob.id);
    if (ob.collision) for (const r of ob.rects) rect(r, r.tirs === 'passent' ? 'ep-passe' : 'ep-arrete', r.id);
    else rect(ob.emprise, 'ep-libre', ob.id);
    gO.append(el('text', { class: 'ep-etiquette', x: ob.emprise.x, y: ob.emprise.y - 8, 'font-size': 34 }, `${ob.id} · ${ob.hauteur}`));
  }
  svg?.append(gA, gC, gO);
  const coupes = plan.chemins.filter((c) => c.coupe).length;
  const allonges = plan.chemins.filter((c) => c.avant && c.apres && c.apres.longueur > c.avant.longueur).length;
  $('plan-resume').textContent = t('dev.decor.plan.resume', { objets: plan.objets.length, solides: plan.objets.filter((q) => q.collision).length, chemins: plan.chemins.length, coupes, allonges, problemes: plan.problemes.length }) + (plan.problemes.length ? ` ${plan.problemes.join(' ; ')}` : '');
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
  const placeDe = (ob) => {
    const p = placement.objets.find((q) => ob.id === q.id || ob.id.startsWith(`${q.id}-`));
    return p && Number.isFinite(p.x) ? `${p.x}, ${p.y}, ${p.cap ?? 0}°` : `${ob.emprise.x + ob.emprise.w / 2}, ${ob.emprise.y + ob.emprise.h / 2}`;
  };
  remplir('table-objets', plan.objets.map((ob) => [ob.id, `${nomType(ob.type)} — ${nomVariante(ob.type, ob.variante)}`, placeDe(ob), `${ob.emprise.w} × ${ob.emprise.h}`, String(ob.hauteur), tirsDe(ob), t(ob.collision ? 'dev.decor.collision.oui' : 'dev.decor.collision.non'), ob.remplace ?? '–']));
  remplir('table-chemins', plan.chemins.map((c) => [c.id, c.fenetre, String(c.avant?.longueur ?? '–'), String(c.apres?.longueur ?? '–'), t(c.coupe ? 'dev.decor.chemin.coupe' : c.apres.longueur > c.avant.longueur ? 'dev.decor.chemin.allonge' : 'dev.decor.chemin.ok')]));
  const b = budgetPlan(plan.objets, plan.fils, Object.values(donnees.retires ?? {}).reduce((s, v) => s + v, 0));
  $('budget-plan').textContent = t('dev.decor.budget.plan', b);
  return plan;
}

// Revue du contenu (textes au pochoir de l'atlas : TEXTES de decor-epoque.js).
{
  const ul = $('contenu-liste');
  for (const [cle, p] of [['dev.decor.contenu.etoile'], ['dev.decor.contenu.textes', { textes: Object.values(TEXTES).flat().map((s) => `« ${s} »`).join(', ') }], ['dev.decor.contenu.allemand'], ['dev.decor.contenu.interdits'], ['dev.decor.contenu.images']]) {
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
  courant = poser(etat.type, etat.variantes[etat.type]);
  const a = vueJeu($('cv-jeu'));
  vueJeu($('cv-jeu-grand'));
  mesures.jeu = { ...a, objet: { appels: courant.appels, triangles: courant.triangles } };
  $('jeu-mesures').textContent = t('dev.decor.jeu.mesures', { tris: courant.triangles, appels: courant.appels, L: courant.info.emprise?.w ?? 0, l: courant.info.emprise?.h ?? 0, h: courant.info.hauteur });
  mesures.grosPlan = vueProche($('cv-gros-plan'), etat.yaw, courant.info);
  fiche(courant.info);
  majChoix();
}
function majVariantes() {
  remplirSelect($('ctl-variante'), CATALOGUE[etat.type].variantes.map((v) => [v, nomVariante(etat.type, v)]), etat.variantes[etat.type]);
  remplirSelect($('ctl-garde'), [['oui', t('dev.decor.garde.oui')], ['non', t('dev.decor.garde.non')]], etat.gardes[etat.type] ? 'oui' : 'non');
}
remplirSelect($('ctl-objet'), TYPES.map((ty) => [ty, nomType(ty)]), etat.type);
remplirSelect($('ctl-lumiere'), [['lune', t('dev.decor.lumiere.lune')], ['feu', t('dev.decor.lumiere.feu')]], etat.lumiere);
remplirSelect($('ctl-rotation'), reduit ? [['non', t('dev.decor.rotation.reduit')]] : [['oui', t('dev.decor.rotation.oui')], ['non', t('dev.decor.rotation.non')]], etat.rotation ? 'oui' : 'non');
if (reduit) $('ctl-rotation').disabled = true;
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
      vueProche(cv, 0.75, p.info, 0.55);
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
    etat.temps += dt;
    for (const f of feuxActifs) f.update(dt, true);
    if (courant) vueProche($('cv-gros-plan'), etat.yaw, courant.info);
    requestAnimationFrame(pas);
  };
  requestAnimationFrame(pas);
}

try {
  majPlanche();
  dessiner();
  majPlan(true);
  status.textContent = t('dev.decor.pret', { n: toutes.length, objets: plan.objets.length, problemes: plan.problemes.length });
  boucle();
} catch (err) {
  status.textContent = t('dev.decor.erreur', { message: err?.message ?? String(err) });
  throw err;
}

if (testMode) {
  window.__zsDecor = {
    pret: true,
    webgl: renderer !== null,
    reduit,
    atlasMs,
    etat: () => ({ ...etat, variantes: { ...etat.variantes }, gardes: { ...etat.gardes } }),
    toutes: () => toutes.map((r) => ({ ...r })),
    mesures: () => JSON.parse(JSON.stringify(mesures)),
    rendus: () => rendus,
    plan: () => ({ problemes: [...plan.problemes], objets: plan.objets.map((q) => ({ id: q.id, type: q.type, variante: q.variante, rects: q.rects.length, collision: q.collision })), chemins: plan.chemins.map((c) => ({ id: c.id, fenetre: c.fenetre, avant: c.avant?.longueur ?? null, apres: c.apres?.longueur ?? null, coupe: c.coupe })) }),
    proposition,
    // Change d'objet et de variante comme les listes (vue redessinée, plan recalculé).
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
    yaw: () => etat.yaw,
  };
}
