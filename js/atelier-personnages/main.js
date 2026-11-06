// Atelier des personnages (lot 3j) : page technique. Compare les variantes v2 (js/game/character-v2.js, js/core/pose-v2.js ; lot 5e :
// l'ancien modèle « actuel » est retiré du jeu et de la page) dans le rendu du jeu (lumière, brume, ombres de render.json),
// à l'échelle du jeu à 667 × 375, ×2 et ×4 ; mesures, curseurs et « Mes choix » (texte à copier, rien n'est enregistré).
// ?test=1 expose window.__zsPersos (état, réglages, pas de temps simulé) ; sans ?test=1, rien n'est exposé.
import * as THREE from 'three';
import { translate } from '../i18n.js';
import { createV2Kit } from '../game/character-v2.js';
import { createTokenLookup, readPalette } from '../game/palette.js';
import { createThreeTextures, generateTextureData } from '../game/textures.js';
import { PLAYER_ANIMS, ZOMBIE_ANIMS, cycleSeconds, rigOf } from '../core/pose-v2.js';
import { ANIM_MACROS, MACRO_IDS, formatChoices, wearTier } from '../core/persos-variants.js';
import { buildSpec, createTextureData, meanColor } from '../core/texgen.js';
import { ARENA_STEP, createArena, stepArena } from '../core/arena.js';
import { LEVELS, woundTier } from '../core/blood.js';
import { createBloodFx } from '../game/blood-fx.js';
import { createMeasures, gameView } from './measures.js';
import { VIEWS, createStage, viewCamera } from './scene.js';

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
const [dict, characters, poses, render, cameraJson, texturesJson, variantsJson, enemies, gaits, player, world, windows, bloodCfg, weapons] = await Promise.all([
  'data/i18n/atelier-personnages.json', 'data/game/characters-v2.json', 'data/game/poses-v2.json', 'data/game/render.json', 'data/game/camera.json', 'data/game/textures.json',
  'data/game/zombie-variants.json', 'data/game/enemies.json', 'data/game/gaits.json', 'data/game/player.json', 'data/game/maps/rez-de-chaussee/world.json', 'data/game/windows.json',
  'data/game/blood.json', 'data/game/weapons.json',
].map(loadJson));
const t = (key, params) => fmt(translate(dict, key), params);
for (const node of document.querySelectorAll('[data-i18n]')) node.textContent = t(node.dataset.i18n);
const status = $('status');
status.textContent = t('dev.persos.loading');

const lookup = createTokenLookup();
const palette = readPalette();
const SLOTS = characters.slots.map((s) => s.id);
const VARIANTS = ['A', 'B', 'C', 'riche'];
const FLOOR_IDS = { carrelage: 'sol-salle', herbe: 'herbe', route: 'route', escalier: 'mur', tache: 'sol-tache' };
const GAIT_OF = { marcheLente: 'lent', marche: 'marche', rampe: 'rampe', course: 'course', escalier: 'marche', attente: 'marche' };
const SPEEDS = [0.25, 0.5, 1, 2];

// --- Textures : sols du jeu, sol taché (taches générées) --------------------------------------------------------------------------------
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
const camera = gameView(world, render, cameraJson);

// --- État des réglages -------------------------------------------------------------------------------------------------------------------
const state = {
  // Mouvement réduit : rien ne s'anime tout seul (bouton Lecture) ; ?test=1 : le temps n'avance que par step().
  perso: 'marcheur', variante: 'riche', tenue: 0, usure: 'auto', manche: 1, anim: 'marche', sol: 'carrelage', vue: 'jeu', orbite: 0, vitesse: 1, playing: !testMode && !matchMedia('(prefers-reduced-motion: reduce)').matches, time: 0,
  sang: '1',
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

// Kit v2, un par variante (styles et macros de l'atelier).
const v2Opts = { characters, poses, lookup, hit: palette.hit, zombieIds: variantsJson.zombie.variants.map((v) => v.id), seed: 7, wear, macros: state.macros, animMacros: state.macros };
let v2Kit = createV2Kit(v2Opts);
const zombieIndex = (slot) => variantsJson.zombie.variants.findIndex((v) => v.id === slot);
const measures = createMeasures({ characters, poses, enemies, player, lookup, floors: floorMeans, blood, factors: (slot) => v2Kit.slotKit(slot, 'A').factors, camera });

function makeChar(slot, variant) {
  const kind = slot === 'joueur' ? 'player' : 'zombie';
  return { c: v2Kit.create(kind, Math.max(0, zombieIndex(slot)), { choice: variant, outfit: Math.min(state.tenue, (measures.slotOf(slot).variants.find((x) => x.id === variant)?.outfits.length ?? 1) - 1), wear: wear() }) };
}

const mainStage = createStage({ render, palette, floors: floorTextures });
const gridStage = createStage({ render, palette, floors: floorTextures });
const mainCam = new THREE.PerspectiveCamera();
const gridCam = new THREE.PerspectiveCamera();
let mainChar = null;
let gridChars = [];
const COLUMNS = ['A', 'B', 'C'];
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
  mainBlood.sync('rdc');
  mainRenderer.render(mainStage.scene, mainCam);
  $('blood-stats').textContent = `${bloodText(mainBlood, mainRenderer)}${$('blood-stats').dataset.note ? ` — ${$('blood-stats').dataset.note}` : ''}`;
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
  const m = measures.v2(slot, state.variante, { outfit: state.tenue, wear: wear(), macros: state.macros[slot], animMacros: state.macros[slot] });
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
  const outfits = variant.outfits;
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
  const ids = [...MACRO_IDS, ...ANIM_MACROS];
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
    mainBlood.reset();
    rebuild();
    arenaReset(arena.seed);
    arenaDraw();
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
  state.picks.set(state.perso, { perso: state.perso, variante: state.variante, taille: m.taille, carrure: m.carrure, usure: m.usure, teinte: m.teinte, posture: m.posture, tenue: state.tenue + 1, style: state.variante === 'riche' ? 'A' : state.variante, amplitude: m.amplitude, rythme: m.rythme, lourdeur: m.lourdeur });
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

// --- Sang (section 5) : sur le personnage de la vue principale --------------------------------------------------------------------------
// Cadavre : le personnage choisi, en pose de mort jusqu'au bout.
function corpseOf(slot, variant) {
  return makeChar(slot, variant).c;
}
const makeBlood = (scene, seed, slot = () => state.perso) => createBloodFx({ parent: scene, cfg: bloodCfg, level: state.sang, lookup, seed, corpse: (type) => corpseOf(SLOTS.includes(type) ? type : slot(), state.variante) });
let mainBlood = makeBlood(mainStage.scene, 3);
let mainHp = 1;
let shotSeed = 1;
const mainDir = () => {
  shotSeed += 1;
  const a = -Math.PI / 2 + 0.6 * Math.sin(shotSeed * 1.7);
  return { x: Math.cos(a), y: Math.sin(a) };
};
function shootMain(mortal) {
  if (state.perso === 'joueur') {
    mainBlood.playerHit({ x: 0, y: 0 });
    $('blood-stats').dataset.note = t('dev.persos.blood.player');
    return;
  }
  if (!mainChar.c.root.visible) return;
  if (mortal) {
    mainBlood.kill({ x: 0, y: 0, dir: mainDir(), type: state.perso, facing: Math.PI / 2 - mainChar.c.root.rotation.y });
    mainChar.c.root.visible = false;
    mainHp = 1;
  } else {
    mainBlood.hit({ x: 0, y: 0, dir: mainDir() });
    mainHp = Math.max(0.05, mainHp - 0.25);
  }
  mainChar.c.setWound(settingsBodyStains() ? woundTier(mainHp, bloodCfg.wounds) : 0);
}
const settingsBodyStains = () => bloodCfg.levels[state.sang]?.bodyStains === true;
function bloodText(fx, renderer) {
  const st = fx.stats();
  return t('dev.persos.blood.stats', { p: st.particles, d: st.decals, c: st.corpses, calls: st.calls, tri: st.triangles, rcalls: renderer?.info.render.calls ?? 0, rtri: renderer?.info.render.triangles ?? 0 });
}

// --- Mini-arène (section 6) : simulation pure (js/core/arena.js), rendu à l'échelle du jeu ---------------------------------------------------
const arenaRenderer = webgl ? makeRenderer($('canvas-arena')) : null;
const arenaStage = createStage({ render, palette, floors: floorTextures });
const arenaCam = new THREE.PerspectiveCamera();
const arenaCfg = { enemies, gaits, weapon: weapons.pistol, player, count: 10, radius: 300 };
const arena = { seed: 1, state: null, chars: new Map(), player: null, blood: null, acc: 0, speed: 1, playing: false, lastShot: -1, kills: [] };
function arenaReset(seed) {
  for (const ch of arena.chars.values()) arenaStage.scene.remove(ch.c.root);
  arena.chars.clear();
  if (arena.player) arenaStage.scene.remove(arena.player.c.root);
  arena.blood?.dispose();
  arena.seed = seed;
  arena.state = createArena(seed, arenaCfg);
  arena.acc = 0;
  arena.lastShot = -1;
  arena.player = makeChar('joueur', state.variante);
  arenaStage.scene.add(arena.player.c.root);
  for (const z of arena.state.zombies) {
    const ch = makeChar(z.type, state.variante);
    arena.chars.set(z.id, ch);
    arenaStage.scene.add(ch.c.root);
  }
  arena.blood = makeBlood(arenaStage.scene, seed * 13);
  arenaStage.ground.set(state.sol);
}
// Avance l'arène de `seconds` (temps d'arène, pas fixes) : mêmes résultats quelle que soit la vitesse d'affichage.
function arenaRun(seconds) {
  arena.acc += Math.max(0, seconds);
  while (arena.acc >= ARENA_STEP - 1e-9) {
    arena.acc -= ARENA_STEP;
    if (arena.state.done) {
      arena.blood.update(ARENA_STEP);
      continue;
    }
    const r = stepArena(arena.state, ARENA_STEP, arenaCfg);
    arena.state = r.state;
    for (const e of r.events) {
      if (e.type === 'shot') arena.lastShot = arena.state.time;
      if (e.type === 'hit') {
        arena.blood.hit({ x: e.x, y: e.y, dir: e.dir });
        const ch = arena.chars.get(e.id);
        if (ch) ch.c.setWound(settingsBodyStains() ? woundTier(e.hpFraction, bloodCfg.wounds) : 0);
      }
      if (e.type === 'kill') {
        arena.blood.kill({ x: e.x, y: e.y, dir: e.dir, type: e.zombie, facing: e.facing });
        const ch = arena.chars.get(e.id);
        if (ch) arenaStage.scene.remove(ch.c.root);
        arena.chars.delete(e.id);
      }
    }
    arena.blood.update(ARENA_STEP);
  }
}
function arenaDraw() {
  if (!webgl || !arena.state) return;
  const tm = arena.state.time;
  for (const z of arena.state.zombies) {
    const ch = arena.chars.get(z.id);
    if (!ch) continue;
    ch.c.root.position.set(z.x, 0, z.y);
    ch.c.root.rotation.y = Math.PI / 2 - z.facing;
    const anim = z.attacking ? 'attaque' : { lent: 'marcheLente', marche: 'marche', rampe: 'rampe', course: 'course' }[z.gait];
    ch.c.setAnim(anim, z.attacking ? tm % 1 : z.distance / gaits.gaits[z.gait].stride, {}, tm);
  }
  const pl = arena.player;
  pl.c.root.rotation.y = Math.PI / 2 - arena.state.aim;
  const recoil = Math.max(0, 1 - (tm - arena.lastShot) / 0.12);
  pl.c.setAnim('repos', tm / 3, { twist: 0, recoil }, tm);
  arena.blood.sync('rdc');
  const c = $('canvas-arena');
  const w = Math.max(1, c.clientWidth);
  const h = Math.max(1, c.clientHeight);
  arenaRenderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  arenaRenderer.setSize(w, h, false);
  const v = viewCamera(arenaCam, { view: 'jeu', width: w, height: h, zoom: 1, gameDistance: camera.distance, fov: render.camera.fov, tilt: render.camera.tilt });
  arenaStage.setFog(v.distance);
  arenaStage.sun.position.set(render.light.sunOffset.x, render.light.sunOffset.y, render.light.sunOffset.z);
  Object.assign(arenaStage.sun.shadow.camera, { left: -500, right: 500, top: 500, bottom: -500 });
  arenaStage.sun.shadow.camera.updateProjectionMatrix();
  arenaRenderer.render(arenaStage.scene, arenaCam);
  const st = arena.blood.stats();
  $('arena-stats').textContent = t('dev.persos.arena.stats', { seed: arena.seed, t: arena.state.time.toFixed(1).replace('.', ','), alive: arena.state.zombies.filter((z) => z.alive).length, kills: arena.state.kills, shots: arena.state.shots, p: st.particles, d: st.decals, c: st.corpses, calls: arenaRenderer.info.render.calls, tri: arenaRenderer.info.render.triangles });
}
fill($('ctl-arena-speed'), [0.5, 1, 2].map((k) => [k, t('dev.persos.speed.n', { k: String(k).replace('.', ',') })]), 1);
$('ctl-arena-speed').addEventListener('change', () => { arena.speed = Number($('ctl-arena-speed').value); });
$('btn-arena-restart').addEventListener('click', () => { arenaReset(arena.seed); arenaDraw(); });
$('btn-arena-next').addEventListener('click', () => { arenaReset(arena.seed + 1); arenaDraw(); });
$('btn-arena-play').addEventListener('click', () => {
  arena.playing = !arena.playing;
  $('btn-arena-play').textContent = t(arena.playing ? 'dev.persos.pause' : 'dev.persos.play');
  $('btn-arena-play').setAttribute('aria-pressed', String(arena.playing));
});
fill($('ctl-sang'), LEVELS.map((l) => [l, t({ 0: 'dev.persos.blood.l0', reduit: 'dev.persos.blood.lreduit', 1: 'dev.persos.blood.l1' }[l])]), state.sang);
$('ctl-sang').addEventListener('change', () => {
  state.sang = $('ctl-sang').value;
  mainBlood.setLevel(state.sang);
  arena.blood?.setLevel(state.sang);
  mainHp = 1;
  if (mainChar) mainChar.c.setWound(0);
  mainChar.c.root.visible = true;
  updateChoices();
  draw();
});
$('btn-hit').addEventListener('click', () => { shootMain(false); draw(); });
$('btn-kill').addEventListener('click', () => { shootMain(true); draw(); });
$('btn-burst').addEventListener('click', () => {
  for (let i = 0; i < 5; i += 1) shootMain(false);
  draw();
});
// Pas de temps commun : animations de la page, sang de la vue principale, arène.
function tick(dt) {
  state.time += dt * state.vitesse;
  mainBlood.update(dt * state.vitesse);
  if (!mainChar.c.root.visible && mainBlood.stats().corpses === 0) {
    mainChar.c.root.visible = true;
    mainChar.c.setWound(0);
  }
}

rebuild();
syncControls();
$('grid-legend').textContent = `${COLUMNS.map((c) => t(`dev.persos.variant.${c}`)).join(' | ')} — ${SCALES.map((k) => (k === 1 ? t('dev.persos.scale.jeu') : t('dev.persos.scale', { k }))).join(', ')}`;
updateMeasures();
updateChoices();
$('app').hidden = false;
arenaReset(1);
draw();
arenaDraw();
status.textContent = t('dev.persos.ready');

// Lecture : le temps avance avec l'horloge réelle (sauf ?test=1, où seul step() le fait avancer).
let last = null;
const loop = (now) => {
  requestAnimationFrame(loop);
  const dt = last === null ? 0 : Math.min(0.1, (now - last) / 1000);
  last = now;
  if (testMode || document.hidden) return;
  if (arena.playing && !arena.state.done) {
    arenaRun(dt * arena.speed);
    arenaDraw();
  }
  if (!state.playing) return;
  tick(dt);
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
      main: mainChar ? { ...mainChar.c.readPose?.() } : null,
      grid: { columns: COLUMNS, scales: SCALES, cells: gridInfo.map((g) => ({ ...g })) },
      camera: lastInfo.view ? { ...lastInfo.view, gameDistance: camera.distance, gameUnitsPerPixel: (2 * camera.distance * Math.tan((camera.fov * Math.PI) / 360)) / camera.height } : null,
      render: { main: { ...lastInfo.main }, grid: { ...lastInfo.grid } },
      textures: { count: v2Kit.textureCount(), bytes: v2Kit.textureBytes() },
      sang: state.sang,
      blood: mainBlood.stats(),
      mainVisible: mainChar ? mainChar.c.root.visible : null,
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
      const k = Math.max(0, Number(seconds) || 0);
      for (let i = 0; i < Math.ceil(k / 0.05); i += 1) tick(Math.min(0.05, k - i * 0.05));
      draw();
      return state.time;
    },
    blood: () => mainBlood.stats(),
    arena: {
      // Avance l'arène de `seconds` secondes d'affichage à sa vitesse (×0,5, ×1, ×2) ; les résultats logiques ne dépendent que du temps d'arène.
      step(seconds) {
        arenaRun(Math.max(0, Number(seconds) || 0) * arena.speed);
        arenaDraw();
        return arena.state.time;
      },
      run(seconds) {
        arenaRun(Math.max(0, Number(seconds) || 0));
        arenaDraw();
        return arena.state.time;
      },
      debug: () => arenaStage.scene.children.filter((o) => o.isGroup || o.type === 'Group').map((o) => ({ x: +o.position.x.toFixed(1), y: +o.position.y.toFixed(1), z: +o.position.z.toFixed(1), visible: o.visible, v2: o.userData.v2 === true, isPlayer: o === arena.player.c.root })),
      state: () => ({ seed: arena.seed, time: arena.state.time, steps: arena.state.steps, done: arena.state.done, kills: arena.state.kills, shots: arena.state.shots, alive: arena.state.zombies.filter((z) => z.alive).length, zombies: arena.state.zombies.map((z) => ({ id: z.id, type: z.type, gait: z.gait, x: z.x, y: z.y, hp: z.hp, alive: z.alive })), blood: arena.blood.stats(), meshes: arena.chars.size, render: arenaRenderer ? { calls: arenaRenderer.info.render.calls, triangles: arenaRenderer.info.render.triangles } : null }),
    },
    render: () => draw(),
  };
}
