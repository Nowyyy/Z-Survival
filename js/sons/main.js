// Page d'écoute des sons (lot 1d) : page technique. Calcule tous les sons avec les mêmes fonctions que le jeu (js/core/synth.js, via
// sound-loader.js), les joue avec le même lecteur (js/game/audio.js) et permet de juger chaque variante, une rafale, une horde et l'ambiance.
// ?test=1 expose window.__zs.getState().audio (journal des lectures) et accélère « Horde » et « Rafale » (temps simulé, sans attente).
import { variantCount } from '../core/synth.js';
import { createAudio } from '../game/audio.js';
import { planSounds, renderSounds } from '../game/sound-loader.js';
import { translate } from '../i18n.js';

const fmt = (text, params) => String(text).replace(/\{(\w+)\}/g, (_, k) => String(params?.[k] ?? ''));
const loadJson = async (path) => {
  const response = await fetch(path);
  if (!response.ok) throw new Error(`${path} : ${response.status}`);
  return response.json();
};
const $ = (id) => document.getElementById(id);
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const BURST_SHOTS = 8;
const HORDE_SECONDS = 60;
const HORDE_ZOMBIES = 8;
const HORDE_STEP = 0.05;
const HORDE_RINGS = [180, 260, 340, 450, 560, 700, 850, 1000]; // distances des 8 zombies simulés au joueur (immobiles : pas de bruit de pas)
const LISTENER = { x: 1000, y: 1000 };

const query = new URLSearchParams(location.search);
const testMode = query.get('test') === '1';
const [dict, soundsCfg, audioCfg, materialsCfg, voiceCfg, weapons, variantsCfg] = await Promise.all([
  loadJson('data/i18n/fr.json'), loadJson('data/game/sounds.json'), loadJson('data/game/audio.json'), loadJson('data/game/sound-materials.json'),
  loadJson('data/game/zombie-voice.json'), loadJson('data/game/weapons.json'), loadJson('data/game/zombie-variants.json'),
]);
const BURST_GAP = weapons.pistol.fireDelay; // cadence du pistolet (data/game/weapons.json)
const t = (key, params) => fmt(translate(dict, key), params);
for (const el of document.querySelectorAll('[data-i18n]')) el.textContent = translate(dict, el.dataset.i18n);
$('app').hidden = false;

const audio = createAudio({ config: { audio: audioCfg, materials: materialsCfg, voice: voiceCfg, sounds: soundsCfg.sounds }, test: testMode, seed: 7, autoAmbience: false });
if (testMode) window.__zs = { getState: () => ({ audio: audio.state() }) };
// Le son ne démarre qu'après un geste : tout clic ou toute touche déverrouille l'audio.
for (const type of ['pointerdown', 'pointerup', 'click', 'touchend', 'keydown']) window.addEventListener(type, () => audio.unlock(), { capture: true });

const status = $('status');
const live = $('live');
const controls = ['btn-all', 'btn-burst', 'btn-horde', 'btn-ambience'].map($);
let running = null; // séquence, rafale ou horde en cours : { stop }

// Volume (en mémoire seulement).
const volume = $('volume');
const syncVolume = () => {
  volume.value = String(audio.volume);
  $('volume-value').textContent = t('dev.sons.volume.value', { n: audio.volume });
  volume.setAttribute('aria-valuetext', $('volume-value').textContent);
};
volume.addEventListener('input', () => {
  audio.setVolume(Number(volume.value));
  syncVolume();
});
syncVolume();

if (!audio.supported) {
  status.textContent = t('dev.sons.noaudio');
}

// Couleurs du canvas : lues dans les jetons CSS (aucune valeur en dur).
const css = getComputedStyle(document.documentElement);
const colors = { wave: css.getPropertyValue('--color-text').trim(), mid: css.getPropertyValue('--color-border').trim(), mark: css.getPropertyValue('--color-action-text').trim() };

function drawWave(canvas, samples) {
  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  const width = Math.max(120, Math.round(canvas.clientWidth * ratio));
  const height = Math.round(56 * ratio);
  canvas.width = width;
  canvas.height = height;
  const c = canvas.getContext('2d');
  c.clearRect(0, 0, width, height);
  c.strokeStyle = colors.mid;
  c.beginPath();
  c.moveTo(0, height / 2);
  c.lineTo(width, height / 2);
  c.stroke();
  c.strokeStyle = colors.wave;
  c.beginPath();
  const n = samples.length;
  for (let x = 0; x < width; x += 1) {
    let lo = 0;
    let hi = 0;
    const a = Math.floor((x / width) * n);
    const b = Math.max(a + 1, Math.floor(((x + 1) / width) * n));
    for (let i = a; i < b && i < n; i += 1) {
      if (samples[i] < lo) lo = samples[i];
      if (samples[i] > hi) hi = samples[i];
    }
    c.moveTo(x + 0.5, height / 2 - hi * (height / 2 - 2));
    c.lineTo(x + 0.5, height / 2 - lo * (height / 2 - 2));
  }
  c.stroke();
}

// Tous les tampons, par blocs, avec le pourcentage affiché.
const jobs = planSounds(soundsCfg.sounds);
const rendered = await renderSounds(jobs, { onProgress: (p) => { status.textContent = t('dev.sons.loading', { n: Math.round(p * 100) }); } });
audio.addSounds(rendered.items);
const byName = new Map(rendered.items.map((i) => [i.name, i]));
status.textContent = audio.supported ? t('dev.sons.ready', { count: rendered.count, mb: (rendered.bytes / 1048576).toFixed(1) }) : t('dev.sons.noaudio');

const db = (x) => (20 * Math.log10(Math.max(x, 1e-9))).toFixed(1);
const list = $('list');
const buttons = [];
for (const recipe of soundsCfg.sounds) {
  const items = Array.from({ length: variantCount(recipe) }, (_, v) => byName.get(`${recipe.id}-${v + 1}`));
  const peak = Math.max(...items.map((i) => i.samples.reduce((m, s) => Math.max(m, Math.abs(s)), 0)));
  const rms = items.reduce((sum, i) => sum + Math.sqrt(i.samples.reduce((e, s) => e + s * s, 0) / i.samples.length), 0) / items.length;
  const li = document.createElement('li');
  li.className = 'sound';
  li.dataset.sound = recipe.id;
  const title = document.createElement('h3');
  title.className = 'sound-title';
  const id = document.createElement('code');
  id.className = 'sound-id';
  id.textContent = recipe.id;
  title.append(id, ` · ${translate(dict, `dev.sons.etiquette.${recipe.id}`)}`);
  const meta = document.createElement('p');
  meta.className = 'sound-meta';
  meta.textContent = t('dev.sons.meta', { category: recipe.category, duration: recipe.duration.toFixed(2), peak: peak.toFixed(2), rms: db(rms) });
  const canvas = document.createElement('canvas');
  canvas.className = 'sound-wave';
  canvas.setAttribute('role', 'img');
  canvas.setAttribute('aria-label', t('dev.sons.wave', { id: recipe.id }));
  const row = document.createElement('div');
  row.className = 'variants';
  items.forEach((item, v) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'variant';
    button.textContent = item.name;
    button.dataset.sound = recipe.id;
    button.dataset.variant = String(v);
    button.disabled = !audio.supported;
    button.addEventListener('click', () => {
      audio.unlock();
      drawWave(canvas, item.samples);
      audio.preview(recipe.id, v);
    });
    buttons.push({ button, recipe, v, canvas, item });
    row.append(button);
  });
  li.append(title, meta, canvas, row);
  list.append(li);
  drawWave(canvas, items[0].samples);
}
window.addEventListener('resize', () => {
  for (const { canvas, item, v } of buttons) if (v === 0) drawWave(canvas, item.samples);
});

// ----- commandes -----
function setRunning(next, activeId) {
  running = next;
  for (const [id, label, stop] of [['btn-all', 'dev.sons.all', 'dev.sons.all.stop'], ['btn-horde', 'dev.sons.horde', 'dev.sons.horde.stop']]) {
    $(id).textContent = t(running !== null && activeId === id ? stop : label);
  }
  for (const c of controls) c.disabled = !audio.supported || (running !== null && c.id !== activeId);
}

// Pour un rythme réel, on attend ; en mode test (?test=1) le temps est simulé, sans attente.
const pause = (ms, token) => (testMode || token.stopped ? Promise.resolve() : wait(ms));

$('btn-all').addEventListener('click', async () => {
  audio.unlock();
  if (running) {
    running.stopped = true;
    return;
  }
  const token = { stopped: false };
  setRunning(token, 'btn-all');
  for (const { recipe, v, canvas, item } of buttons) {
    if (token.stopped) break;
    drawWave(canvas, item.samples);
    audio.preview(recipe.id, v);
    live.textContent = item.name;
    await pause((recipe.duration + 0.3) * 1000, token);
  }
  live.textContent = '';
  setRunning(null);
});

$('btn-burst').addEventListener('click', async () => {
  audio.unlock();
  const token = { stopped: false };
  setRunning(token, 'btn-burst');
  let shots = 0;
  for (let i = 0; i < BURST_SHOTS; i += 1) {
    const out = audio.handle({ time: i * BURST_GAP, listener: LISTENER, walls: [], paused: false, events: [{ type: 'shot', x: LISTENER.x + 26, y: LISTENER.y }] });
    if (out.requests.some((r) => r.sound === 'tir')) shots += 1;
    live.textContent = t('dev.sons.burst.count', { n: shots });
    await pause(BURST_GAP * 1000, token);
  }
  setRunning(null);
});

// Horde : 60 s du planificateur de voix de zombies (js/core/zombie-voice.js) avec 8 zombies simulés autour du joueur, à vitesse réelle.
$('btn-horde').addEventListener('click', async () => {
  audio.unlock();
  if (running) {
    running.stopped = true;
    return;
  }
  const token = { stopped: false };
  setRunning(token, 'btn-horde');
  const names = variantsCfg.zombie.variants.map((v) => v.id);
  const zombies = Array.from({ length: HORDE_ZOMBIES }, (_, i) => {
    const angle = (i / HORDE_ZOMBIES) * Math.PI * 2;
    return { id: i + 1, x: LISTENER.x + Math.cos(angle) * HORDE_RINGS[i], y: LISTENER.y + Math.sin(angle) * HORDE_RINGS[i], variant: names[i % names.length] };
  });
  let voices = 0;
  const started = performance.now();
  for (let time = 0; time <= HORDE_SECONDS && !token.stopped; time += HORDE_STEP) {
    const out = audio.handle({ time, listener: LISTENER, walls: [], paused: false, events: [], zombies });
    voices += out.requests.filter((r) => r.category === 'voix').length;
    const seconds = testMode ? time : (performance.now() - started) / 1000;
    live.textContent = t('dev.sons.horde.count', { n: voices, s: Math.round(seconds) });
    if (!testMode) await wait(HORDE_STEP * 1000);
  }
  setRunning(null);
});

let ambient = false;
$('btn-ambience').addEventListener('click', () => {
  audio.unlock();
  ambient = audio.ambience(!ambient);
  $('btn-ambience').textContent = t(ambient ? 'dev.sons.ambience.stop' : 'dev.sons.ambience');
});

for (const c of controls) c.disabled = !audio.supported;
