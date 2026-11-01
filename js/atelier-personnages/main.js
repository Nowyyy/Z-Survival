// Atelier des personnages (lot 3j) : page technique. Compare les personnages actuels du jeu (js/game/character.js et js/core/pose.js,
// inchangés) et les variantes v2 (js/game/character-v2.js, js/core/pose-v2.js) dans le rendu du jeu (lumière, brume, ombres de render.json),
// à l'échelle du jeu à 667 × 375, ×2 et ×4 ; mesures, curseurs et « Mes choix » (texte à copier, rien n'est enregistré).
// ?test=1 expose window.__zsPersos (état, réglages, pas de temps simulé) ; sans ?test=1, rien n'est exposé.
import * as THREE from 'three';
import { translate } from '../i18n.js';
import { createCharacter, createKit } from '../game/character.js';
import { createV2Kit } from '../game/character-v2.js';
import { createTokenLookup, readPalette } from '../game/palette.js';
import { createThreeTextures, generateTextureData } from '../game/textures.js';
import { computePose } from '../core/pose.js';
import { PLAYER_ANIMS, ZOMBIE_ANIMS, cycleSeconds, rigOf } from '../core/pose-v2.js';
import { ANIM_MACROS, MACRO_IDS, formatChoices, wearTier } from '../core/persos-variants.js';
import { buildSpec, createTextureData, meanColor, regionRect } from '../core/texgen.js';
import { createMeasures, gameView } from './measures.js';
import { VIEWS, createStage, viewCamera } from './scene.js';

const TAU = Math.PI * 2;
const query = new URLSearchParams(location.search);
const testMode = query.get('test') === '1';
const $ = (id) => document.getElementById(id);
const fmt = (text, params) => String(text).replace(/\{(\w+)\}/g, (_, k) => String(params?.[k] ?? ''));
const n2 = (v) => (Number.isFinite(v) ? v.toFixed(2).replace('.', ',') : '–');
const loadJson = async (path) => {
  const r = await fetch(path);
  if (!r.ok) throw new Error(`${path} : ${r.status}`);
  return r.json();
};
const [dict, characters, poses, render, cameraJson, texturesJson, variantsJson, enemies, gaits, player, world, windows] = await Promise.all([
  'data/i18n/atelier-personnages.json', 'data/game/characters-v2.json', 'data/game/poses-v2.json', 'data/game/render.json', 'data/game/camera.json', 'data/game/textures.json',
  'data/game/zombie-variants.json', 'data/game/enemies.json', 'data/game/gaits.json', 'data/game/player.json', 'data/game/maps/rez-de-chaussee/world.json', 'data/game/windows.json',
].map(loadJson));
const t = (key, params) => fmt(translate(dict, key), params);
for (const node of document.querySelectorAll('[data-i18n]')) node.textContent = t(node.dataset.i18n);
const status = $('status');
status.textContent = t('dev.persos.loading');

const lookup = createTokenLookup();
const palette = readPalette();
const SLOTS = characters.slots.map((s) => s.id);
const VARIANTS = ['actuel', 'A', 'B', 'C', 'riche'];
const FLOOR_IDS = { carrelage: 'sol-salle', herbe: 'herbe', route: 'route', escalier: 'mur', tache: 'sol-tache' };
const GAIT_OF = { marcheLente: 'lent', marche: 'marche', rampe: 'rampe', course: 'course', escalier: 'marche', attente: 'marche' };
const V1_STATE = { attente: 'zombie', marcheLente: 'lent', marche: 'zombie', rampe: 'rampe', course: 'course', arracher: 'arracher', escalade: 'escalade', attaque: 'zombie', touche: 'zombie', mortAvant: 'zombie', mortArriere: 'zombie', effondrement: 'zombie', escalier: 'zombie', repos: 'arret', tir: 'tir', terre: 'terre', relevage: 'arret', reparation: 'arret' };
const V1_EXACT = new Set(['marcheLente', 'marche', 'rampe', 'course', 'arracher', 'escalade', 'repos', 'tir', 'terre', 'attente']);
const SPEEDS = [0.25, 0.5, 1, 2];

// --- Textures : sols du jeu, sol taché (taches générées), atlas des personnages actuels -------------------------------------------------
const entries = texturesJson.textures.filter((e) => ['sol-salle', 'herbe', 'route', 'mur', 'atlas-persos', 'sol-exterieur', 'trottoir'].includes(e.id));
const generated = await generateTextureData(entries, { lookup, wait: () => Promise.resolve(), sliceMs: 1e9 });
const salle = generated.items.find((i) => i.entry.id === 'sol-salle');
const blood = lookup('--sang-frais');
const stainedData = new Uint8ClampedArray(salle.data);
for (let y = 0; y < salle.height; y += 1) {
  for (let x = 0; x < salle.width; x += 1) {
    const u = x / salle.width;
    const v = y / salle.height;
    const d = Math.min(...[[0.3, 0.35, 0.16], [0.7, 0.6, 0.2], [0.45, 0.8, 0.1]].map(([cx, cy, r]) => Math.hypot(u - cx, v - cy) / r));
    if (d < 1) {
      const i = (y * salle.width + x) * 4;
      for (let c = 0; c < 3; c += 1) stainedData[i + c] = stainedData[i + c] + (blood[c] - stainedData[i + c]) * 0.6;
    }
  }
}
generated.items.push({ entry: { ...salle.entry, id: 'sol-tache' }, width: salle.width, height: salle.height, data: stainedData });
const floorMean = (id) => meanColor(createTextureData(buildSpec(texturesJson.textures.find((e) => e.id === id), lookup)));
const floorMeans = { carrelage: floorMean('sol-salle'), herbe: floorMean('herbe'), terre: floorMean('sol-exterieur'), route: floorMean('route'), trottoir: floorMean('trottoir'), escalier: floorMean('mur') };
const atlasItem = generated.items.find((i) => i.entry.id === 'atlas-persos');
const atlasMeans = {};
for (const r of atlasItem.entry.params.regions) {
  const rect = regionRect(atlasItem.width, r);
  const sum = [0, 0, 0];
  let k = 0;
  for (let y = Math.round(rect.v0 * atlasItem.height); y < Math.round(rect.v1 * atlasItem.height); y += 1) {
    for (let x = Math.round(rect.u0 * atlasItem.width); x < Math.round(rect.u1 * atlasItem.width); x += 1) {
      const i = (y * atlasItem.width + x) * 4;
      sum[0] += atlasItem.data[i];
      sum[1] += atlasItem.data[i + 1];
      sum[2] += atlasItem.data[i + 2];
      k += 1;
    }
  }
  atlasMeans[r.id] = sum.map((s) => s / Math.max(1, k));
}
const camera = gameView(world, render, cameraJson);

// --- État des réglages -------------------------------------------------------------------------------------------------------------------
const state = {
  // Mouvement réduit : rien ne s'anime tout seul (bouton Lecture) ; ?test=1 : le temps n'avance que par step().
  perso: 'marcheur', variante: 'A', tenue: 0, usure: 'auto', manche: 1, anim: 'marche', sol: 'carrelage', vue: 'jeu', orbite: 0, vitesse: 1, playing: !testMode && !matchMedia('(prefers-reduced-motion: reduce)').matches, time: 0,
  macros: Object.fromEntries(SLOTS.map((s) => [s, Object.fromEntries([...MACRO_IDS, ...ANIM_MACROS].map((m) => [m, 0]))])),
  picks: new Map(),
};
const wear = () => (state.usure === 'auto' ? wearTier(state.manche, characters.wearByWave) : Number(state.usure));
const animsOf = (slot) => (slot === 'joueur' ? PLAYER_ANIMS : ZOMBIE_ANIMS);

// --- Rendu (deux contextes : vue principale et grille de comparaison) ------------------------------------------------------------------
let webgl = true;
const makeRenderer = (canvas) => {
  try {
    const r = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: testMode });
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFShadowMap;
    return r;
  } catch {
    webgl = false;
    return null;
  }
};
const mainRenderer = makeRenderer($('canvas-main'));
const gridRenderer = webgl ? makeRenderer($('canvas-grid')) : null;
if (!webgl) $('webgl-error').hidden = false;
const threeTextures = createThreeTextures(generated, mainRenderer);
const floorTextures = Object.fromEntries(Object.entries(FLOOR_IDS).map(([k, id]) => [k, { texture: threeTextures.texture(id), repeat: threeTextures.repeat(id) }]));

// Kits : actuel (character.js) et v2, un par variante (styles et macros de l'atelier).
const v1Kit = createKit({ textures: threeTextures, variants: variantsJson, hit: palette.hit });
const v2Opts = { characters, poses, lookup, hit: palette.hit, zombieIds: variantsJson.zombie.variants.map((v) => v.id), seed: 7, wear, macros: state.macros, animMacros: state.macros };
let v2Kit = createV2Kit(v2Opts);
const zombieIndex = (slot) => variantsJson.zombie.variants.findIndex((v) => v.id === slot);
const measures = createMeasures({ characters, poses, enemies, player, lookup, floors: floorMeans, blood, atlasMeans, factors: (slot) => v2Kit.slotKit(slot, 'A').factors, camera });

function makeChar(slot, variant) {
  const kind = slot === 'joueur' ? 'player' : 'zombie';
  if (variant === 'actuel') return { c: createCharacter(v1Kit, kind, Math.max(0, zombieIndex(slot))), v1: true };
  return { c: v2Kit.create(kind, Math.max(0, zombieIndex(slot)), { choice: variant, outfit: Math.min(state.tenue, (measures.slotOf(slot).variants.find((x) => x.id === variant)?.outfits.length ?? 1) - 1), wear: wear() }), v1: false };
}

const mainStage = createStage({ render, palette, floors: floorTextures });
const gridStage = createStage({ render, palette, floors: floorTextures });
const mainCam = new THREE.PerspectiveCamera();
const gridCam = new THREE.PerspectiveCamera();
let mainChar = null;
let gridChars = [];
const COLUMNS = ['actuel', 'A', 'B', 'C'];
const SCALES = [1, 2, 4];

function rebuild() {
  if (mainChar) mainStage.scene.remove(mainChar.c.root);
  for (const g of gridChars) gridStage.scene.remove(g.c.root);
  mainChar = makeChar(state.perso, state.variante);
  mainStage.scene.add(mainChar.c.root);
  gridChars = COLUMNS.map((v) => makeChar(state.perso, v));
  for (const g of gridChars) gridStage.scene.add(g.c.root);
  for (const ch of [mainChar, ...gridChars]) ch.c.root.rotation.y = 0.55;
  mainStage.ground.set(state.sol);
  gridStage.ground.set(state.sol);
}

// Phase de l'animation au temps t : marches à la vitesse de l'allure (vitesse du type comprise), animations au temps selon leur cycle.
function phaseOf(slot, anim, time, variant) {
  if (slot === 'joueur' && anim === 'marche') return (time * player.speed) / poses.strides.joueur;
  const g = GAIT_OF[anim];
  if (g && anim !== 'attente') return (time * gaits.gaits[g].speed * (enemies.variants[slot]?.speedMul ?? 1)) / poses.strides[anim === 'escalier' ? 'marche' : anim];
  if (['mortAvant', 'mortArriere', 'effondrement'].includes(anim)) return Math.min(1, (time % (poses.durations.mort + 1)) / poses.durations.mort);
  if (anim === 'relevage') return Math.min(1, (time % (poses.durations.relevage + 0.8)) / poses.durations.relevage);
  if (anim === 'touche') return (time % 0.75) / 0.25;
  if (anim === 'arracher') return (time * (enemies.variants[slot]?.tearMul ?? 1) * 4) / windows.tearTime;
  const rig = variant ? rigOf(variant, poses.skeletons) : null;
  return time / (cycleSeconds(rig ?? { style: 'A' }, anim, { ...state.macros[slot], repairTime: windows.repairTime }, poses) ?? 1);
}

function animate(ch, slot, variant) {
  const anim = state.anim;
  if (ch.v1) {
    const kind = slot === 'joueur' ? 'player' : 'zombie';
    const st = V1_STATE[anim] ?? 'arret';
    const ph = anim === 'attente' ? 0 : phaseOf(slot, V1_EXACT.has(anim) ? anim : 'marche', state.time) * TAU;
    ch.c.setPose(computePose({ phase: ph, state: kind === 'player' && st === 'zombie' ? 'arret' : st, time: state.time, seed: 1, amount: anim === 'attente' || anim === 'repos' ? 0.15 : kind === 'player' && anim === 'marche' ? 1 : 0.7, recoil: anim === 'tir' ? 1 - (state.time % 0.3) / 0.3 : 0 }));
    ch.c.setFlash(anim === 'touche' && state.time % 0.75 < 0.1);
    return;
  }
  const res = v2Kit.resolved(slot, variant, ch.c.outfit, ch.c.wear);
  const extra = slot === 'joueur' ? { twist: 0, repairTime: windows.repairTime } : {};
  ch.c.setAnim(anim, phaseOf(slot, anim, state.time, res), extra, state.time);
}

let lastInfo = { main: { calls: 0, triangles: 0 }, grid: { calls: 0, triangles: 0 } };
let gridInfo = [];
function draw() {
  if (!webgl) return;
  animate(mainChar, state.perso, state.variante);
  gridChars.forEach((g, i) => animate(g, state.perso, COLUMNS[i]));
  // Vue principale.
  const mc = $('canvas-main');
  const mw = Math.max(1, mc.clientWidth);
  const mh = Math.max(1, mc.clientHeight);
  mainRenderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  mainRenderer.setSize(mw, mh, false);
  const view = viewCamera(mainCam, { view: state.vue, width: mw, height: mh, zoom: 1, yaw: (state.orbite * Math.PI) / 180, gameDistance: camera.distance, fov: render.camera.fov, tilt: render.camera.tilt });
  mainStage.setFog(view.distance);
  mainRenderer.render(mainStage.scene, mainCam);
  lastInfo.main = { calls: mainRenderer.info.render.calls, triangles: mainRenderer.info.render.triangles };
  lastInfo.view = view;
  // Grille : Actuel | A | B | C sur trois rangées (×1, ×2, ×4), découpage par ciseaux ; un seul personnage visible par case.
  const gc = $('canvas-grid');
  const gw = Math.max(1, gc.clientWidth);
  const gh = Math.max(1, gc.clientHeight);
  gridRenderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  gridRenderer.setSize(gw, gh, false);
  gridRenderer.setScissorTest(true);
  gridRenderer.autoClear = true;
  const rowH = [gh * (1 / 7), gh * (2 / 7), gh * (4 / 7)];
  let y = 0;
  gridInfo = [];
  let calls = 0;
  let triangles = 0;
  SCALES.forEach((k, r) => {
    const h = rowH[r];
    COLUMNS.forEach((_, c) => {
      const w = gw / COLUMNS.length;
      gridChars.forEach((g, i) => { g.c.root.visible = i === c; });
      const v = viewCamera(gridCam, { view: 'jeu', width: w, height: h, zoom: k, gameDistance: camera.distance, fov: render.camera.fov, tilt: render.camera.tilt });
      gridStage.setFog(camera.distance);
      gridRenderer.setViewport(c * w, gh - y - h, w, h);
      gridRenderer.setScissor(c * w, gh - y - h, w, h);
      gridRenderer.render(gridStage.scene, gridCam);
      calls += gridRenderer.info.render.calls;
      triangles += gridRenderer.info.render.triangles;
      gridInfo.push({ column: COLUMNS[c], scale: k, unitsPerPixel: v.unitsPerPixel });
    });
    y += h;
  });
  gridRenderer.setScissorTest(false);
  lastInfo.grid = { calls, triangles };
}

// --- Mesures ------------------------------------------------------------------------------------------------------------------------------
let current = null;
function updateMeasures() {
  const slot = state.perso;
  const m = state.variante === 'actuel' ? measures.current(slot) : measures.v2(slot, state.variante, { outfit: state.tenue, wear: wear(), macros: state.macros[slot], animMacros: state.macros[slot] });
  m.gap = measures.gap(slot, state.variante, m);
  current = m;
  const list = $('measures');
  list.textContent = '';
  const add = (text, out = false) => {
    const li = document.createElement('li');
    li.textContent = text;
    if (out) {
      const span = document.createElement('span');
      span.className = 'persos-out';
      span.textContent = ` — ${t('dev.persos.m.out')}`;
      li.append(span);
    }
    list.append(li);
    return li;
  };
  add(t('dev.persos.m.architecture', { arch: t(`dev.persos.m.arch.${m.architecture}`) }));
  add(t('dev.persos.m.pieces', { n: m.stats.pieces }));
  add(t('dev.persos.m.triangles', { n: m.stats.triangles, max: m.budget }), m.stats.triangles > m.budget);
  add(t('dev.persos.m.calls', { n: m.calls, body: m.architecture === 'rigid' ? m.stats.calls : m.stats.pieces, shadow: m.architecture === 'rigid' ? m.stats.shadowCalls : m.stats.casters }), m.calls > 4);
  if (m.architecture === 'rigid') add(t('dev.persos.m.shadow', { calls: m.stats.shadowCalls, tri: m.stats.shadowTriangles }), m.stats.shadowTriangles > 64);
  add(t('dev.persos.m.height', { h: n2(m.height), lo: n2(m.heightRange[0]), hi: n2(m.heightRange[1]) }));
  add(t('dev.persos.m.reach', { r: n2(m.reach), max: n2(1.3 * m.radius), radius: n2(m.radius) }), m.reach > 1.3 * m.radius + 1e-9);
  const floorKey = state.sol === 'tache' ? 'carrelage-tache' : state.sol;
  add(t('dev.persos.m.contrast', { c: n2(m.contrasts[floorKey]), min: n2(m.minContrast), floor: m.minFloor }), m.minContrast < 3);
  const target = state.variante === 'C' ? 20 : 12;
  if (m.gap !== null) add(t('dev.persos.m.silhouette', { area: n2(m.sil.area), aspect: n2(m.sil.aspect), gap: n2(100 * m.gap), target }), 100 * m.gap < target);
  else add(t('dev.persos.m.silhouette', { area: n2(m.sil.area), aspect: n2(m.sil.aspect), gap: '–', target }));
  if (state.variante === 'actuel' && !V1_EXACT.has(state.anim)) add(t('dev.persos.m.none'));
  if (m.violations.length === 0) add(t('dev.persos.m.ok'));
  for (const v of m.violations) add(t('dev.persos.m.violation', { code: v.code, detail: v.detail }), true);
}

// --- Contrôles ------------------------------------------------------------------------------------------------------------------------------
const fill = (select, options, value) => {
  select.textContent = '';
  for (const [v, label] of options) {
    const o = document.createElement('option');
    o.value = String(v);
    o.textContent = label;
    select.append(o);
  }
  select.value = String(value);
};
function syncControls() {
  fill($('ctl-perso'), SLOTS.map((s) => [s, t(`dev.persos.slot.${s}`)]), state.perso);
  fill($('ctl-variante'), VARIANTS.map((v) => [v, t(`dev.persos.variant.${v}`)]), state.variante);
  const variant = measures.slotOf(state.perso).variants.find((v) => v.id === state.variante);
  const outfits = state.variante === 'actuel' ? [{ label: t('dev.persos.variant.actuel') }] : variant.outfits;
  state.tenue = Math.min(state.tenue, outfits.length - 1);
  fill($('ctl-tenue'), outfits.map((o, i) => [i, t('dev.persos.tenue.n', { n: i + 1, label: o.label })]), state.tenue);
  fill($('ctl-usure'), [['auto', t('dev.persos.usure.auto')], ...[0, 1, 2, 3].map((i) => [i, t('dev.persos.usure.palier', { n: i })])], state.usure);
  if (!animsOf(state.perso).includes(state.anim)) state.anim = state.perso === 'joueur' ? 'marche' : 'marche';
  fill($('ctl-anim'), animsOf(state.perso).map((a) => [a, t(`dev.persos.anim.${a}`)]), state.anim);
  fill($('ctl-sol'), Object.keys(FLOOR_IDS).map((k) => [k, t(`dev.persos.sol.${k}`)]), state.sol);
  fill($('ctl-vue'), VIEWS.map((v) => [v, t(`dev.persos.vue.${v}`)]), state.vue);
  fill($('ctl-vitesse'), SPEEDS.map((k) => [k, t('dev.persos.speed.n', { k: String(k).replace('.', ',') })]), state.vitesse);
  $('ctl-manche').value = String(state.manche);
  $('out-manche').textContent = String(state.manche);
  $('ctl-orbite').value = String(state.orbite);
  $('out-orbite').textContent = `${state.orbite}°`;
  $('btn-play').textContent = t(state.playing ? 'dev.persos.pause' : 'dev.persos.play');
  $('btn-play').setAttribute('aria-pressed', String(state.playing));
  buildMacros();
}
function buildMacros() {
  const box = $('macros');
  box.textContent = '';
  const ids = state.variante === 'actuel' ? [] : [...MACRO_IDS, ...ANIM_MACROS];
  for (const id of ids) {
    const field = document.createElement('div');
    field.className = 'persos-field persos-field-range';
    const label = document.createElement('label');
    label.htmlFor = `macro-${id}`;
    label.textContent = t(`dev.persos.macro.${id}`);
    const input = document.createElement('input');
    Object.assign(input, { id: `macro-${id}`, type: 'range', min: '-2', max: '2', step: '1', className: 'persos-range', value: String(state.macros[state.perso][id]) });
    const out = document.createElement('output');
    out.className = 'persos-value';
    out.htmlFor = input.id;
    out.textContent = signed(state.macros[state.perso][id]);
    input.addEventListener('input', () => {
      state.macros[state.perso][id] = Number(input.value);
      out.textContent = signed(Number(input.value));
      changed(true);
    });
    field.append(label, input, out);
    box.append(field);
  }
}
const signed = (v) => (v > 0 ? `+${v}` : String(v));
function updateChoices() {
  const lines = [...state.picks.values()];
  $('choices-text').value = formatChoices(lines, { sang: state.sang ?? '0' });
}
function changed(rebuildChars = false) {
  if (rebuildChars) {
    const old = v2Kit;
    v2Kit = createV2Kit(v2Opts);
    rebuild();
    old.dispose();
  }
  updateMeasures();
  draw();
}
const bind = (id, key, cast = (v) => v, rebuildChars = true, sync = false) => {
  $(id).addEventListener(id.startsWith('ctl-manche') || id.startsWith('ctl-orbite') ? 'input' : 'change', () => {
    state[key] = cast($(id).value);
    if (sync) syncControls();
    if (key === 'manche') $('out-manche').textContent = String(state.manche);
    if (key === 'orbite') $('out-orbite').textContent = `${state.orbite}°`;
    changed(rebuildChars);
  });
};
bind('ctl-perso', 'perso', String, true, true);
bind('ctl-variante', 'variante', String, true, true);
bind('ctl-tenue', 'tenue', Number);
bind('ctl-usure', 'usure', (v) => (v === 'auto' ? 'auto' : Number(v)));
bind('ctl-manche', 'manche', Number);
bind('ctl-anim', 'anim', String, false);
bind('ctl-sol', 'sol', String, true);
bind('ctl-vue', 'vue', String, false);
bind('ctl-orbite', 'orbite', Number, false);
bind('ctl-vitesse', 'vitesse', Number, false);
$('btn-play').addEventListener('click', () => {
  state.playing = !state.playing;
  $('btn-play').textContent = t(state.playing ? 'dev.persos.pause' : 'dev.persos.play');
  $('btn-play').setAttribute('aria-pressed', String(state.playing));
});
$('btn-pick').addEventListener('click', () => {
  const m = state.macros[state.perso];
  state.picks.set(state.perso, { perso: state.perso, variante: state.variante, ...(state.variante === 'actuel' ? {} : { taille: m.taille, carrure: m.carrure, usure: m.usure, teinte: m.teinte, posture: m.posture, tenue: state.tenue + 1, style: state.variante === 'riche' ? 'A' : state.variante, amplitude: m.amplitude, rythme: m.rythme, lourdeur: m.lourdeur }) });
  updateChoices();
});
$('btn-copy').addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText($('choices-text').value);
    $('copy-status').textContent = t('dev.persos.copied');
  } catch {
    $('choices-text').select();
    $('copy-status').textContent = t('dev.persos.copy.failed');
  }
});

rebuild();
syncControls();
$('grid-legend').textContent = `${COLUMNS.map((c) => t(`dev.persos.variant.${c}`)).join(' | ')} — ${SCALES.map((k) => (k === 1 ? t('dev.persos.scale.jeu') : t('dev.persos.scale', { k }))).join(', ')}`;
updateMeasures();
updateChoices();
$('app').hidden = false;
draw();
status.textContent = t('dev.persos.ready');

// Lecture : le temps avance avec l'horloge réelle (sauf ?test=1, où seul step() le fait avancer).
let last = null;
const loop = (now) => {
  requestAnimationFrame(loop);
  const dt = last === null ? 0 : Math.min(0.1, (now - last) / 1000);
  last = now;
  if (testMode || !state.playing || document.hidden) return;
  state.time += dt * state.vitesse;
  draw();
};
requestAnimationFrame(loop);
window.addEventListener('resize', () => draw());

if (testMode) {
  window.__zsPersos = {
    getState: () => ({
      ready: true, webgl, perso: state.perso, variante: state.variante, tenue: state.tenue, usure: state.usure, wear: wear(), manche: state.manche, anim: state.anim, sol: state.sol, vue: state.vue,
      orbite: state.orbite, vitesse: state.vitesse, playing: state.playing, time: state.time, macros: structuredClone(state.macros[state.perso]),
      measures: current ? { triangles: current.stats.triangles, pieces: current.stats.pieces, calls: current.calls, architecture: current.architecture, minContrast: current.minContrast, area: current.sil.area, aspect: current.sil.aspect, reach: current.reach, gap: current.gap, violations: current.violations.map((v) => v.code) } : null,
      main: mainChar ? { ...mainChar.c.readPose?.(), v1: mainChar.v1 } : null,
      grid: { columns: COLUMNS, scales: SCALES, cells: gridInfo.map((g) => ({ ...g })) },
      camera: lastInfo.view ? { ...lastInfo.view, gameDistance: camera.distance, gameUnitsPerPixel: (2 * camera.distance * Math.tan((camera.fov * Math.PI) / 360)) / camera.height } : null,
      render: { main: { ...lastInfo.main }, grid: { ...lastInfo.grid } },
      textures: { count: v2Kit.textureCount(), bytes: v2Kit.textureBytes() },
      choices: $('choices-text').value,
    }),
    // Change un réglage comme le ferait l'utilisateur (id d'un contrôle : ctl-perso, ctl-variante, …, macro-taille).
    set(id, value) {
      const node = $(id);
      if (!node) return false;
      node.value = String(value);
      node.dispatchEvent(new Event(node.type === 'range' ? 'input' : 'change'));
      return true;
    },
    step(seconds) {
      state.time += Math.max(0, Number(seconds) || 0) * state.vitesse;
      draw();
      return state.time;
    },
    render: () => draw(),
  };
}
