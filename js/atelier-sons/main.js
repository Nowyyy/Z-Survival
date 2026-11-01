// Atelier des sons (lot 3h) : page technique d'écoute. Compare les sons actuels du jeu (js/core/synth.js, recettes inchangées) et les
// variantes de js/core/synth2.js, règle leurs macros, montre les mesures et compose « Mes choix » (texte à copier, rien n'est stocké).
// Les sons sont calculés à la demande par un calculateur d'arrière-plan (worker.js ; repli sur place s'il est indisponible) et gardés
// dans un cache de 24 Mo au plus. Aucun son avant un geste. ?test=1 expose window.__zsSons (journal, état, choix, graphe audio).
import { macroSpec, macroValues, nextVersion, resolveAtelier } from '../core/synth2.js';
import { serializeChoices } from '../core/atelier-choices.js';
import { cacheBytes, cacheGet, cachePut, cacheKeys, createCache } from '../core/sound-cache.js';
import { waveToSvg } from '../core/wave-svg.js';
import { variantCount } from '../core/synth.js';
import { translate } from '../i18n.js';
import { createPlayer } from './player.js';

const fmt = (text, params) => String(text).replace(/\{(\w+)\}/g, (_, k) => String(params?.[k] ?? ''));
const loadJson = async (path) => {
  const response = await fetch(path);
  if (!response.ok) throw new Error(`${path} : ${response.status}`);
  return response.json();
};
const $ = (id) => document.getElementById(id);
const el = (tag, props = {}, children = []) => {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'text') node.textContent = v;
    else if (k === 'class') node.className = v;
    else if (k.startsWith('data-') || k.startsWith('aria-') || k === 'for' || k === 'role') node.setAttribute(k, v);
    else node[k] = v;
  }
  for (const c of children) node.append(c);
  return node;
};
const MACROS = ['hauteur', 'matiere', 'grain', 'duree', 'ampleur'];
const dbToGain = (db) => 10 ** ((Number(db) || 0) / 20);
const num = (x, d = 0) => (Number.isFinite(x) ? x.toFixed(d).replace('.', ',') : '–');

const query = new URLSearchParams(location.search);
const testMode = query.get('test') === '1';
const [dict, atelierRaw, soundsCfg, audioCfg] = await Promise.all([
  loadJson('data/i18n/atelier-sons.json'), loadJson('data/game/sounds-atelier.json'), loadJson('data/game/sounds.json'), loadJson('data/game/audio.json'),
]);
const t = (key, params) => fmt(translate(dict, key), params);
for (const node of document.querySelectorAll('[data-i18n]')) node.textContent = t(node.dataset.i18n);

const data = resolveAtelier(atelierRaw);
const page = atelierRaw.page;
const recipes = new Map(soundsCfg.sounds.map((s) => [s.id, s]));
const player = createPlayer({ volume: page.volumeDefault, limiter: page.limiter });
const status = $('status');
const log = [];
let cache = createCache(page.cacheMb * 1024 * 1024);
let versions = { rng: 7, last: {} };

// ---------- calcul (arrière-plan, repli sur place) ----------
let worker = null;
let fallback = null;
let nextJob = 0;
const pending = new Map();
function startWorker() {
  try {
    worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
  } catch {
    worker = null;
    return;
  }
  worker.onmessage = (event) => {
    const msg = event.data ?? {};
    if (msg.type !== 'done' || !pending.has(msg.id)) return;
    const { resolve, reject } = pending.get(msg.id);
    pending.delete(msg.id);
    if (msg.ok) resolve(msg.result);
    else reject(new Error(msg.error));
  };
  worker.onerror = (event) => {
    event.preventDefault?.();
    worker?.terminate();
    worker = null;
    for (const [id, p] of pending) {
      pending.delete(id);
      computeInline(p.job).then(p.resolve, p.reject);
    }
  };
  worker.postMessage({ type: 'init', atelier: atelierRaw, sounds: soundsCfg.sounds });
}
async function computeInline(job) {
  if (!fallback) {
    const { createRenderer } = await import('./render.js');
    fallback = createRenderer({ atelier: atelierRaw, sounds: soundsCfg.sounds });
  }
  return fallback(job);
}
async function compute(job) {
  const key = JSON.stringify(job);
  const hit = cacheGet(cache, key);
  cache = hit.cache;
  if (hit.value) return { ...hit.value, cached: true };
  const result = worker
    ? await new Promise((resolve, reject) => {
      nextJob += 1;
      pending.set(nextJob, { resolve, reject, job });
      worker.postMessage({ type: 'render', id: nextJob, job });
    })
    : await computeInline(job);
  cache = cachePut(cache, key, result, result.samples.length * 4).cache;
  return { ...result, cached: false };
}
startWorker();

// ---------- textes de mesure ----------
function measuresText(name, r, target) {
  const m = r.measures;
  const level = target && Number.isFinite(target.level) ? t('dev.atelier.measures.target', { target: target.level, gap: num(m.levelRel - target.level, 1) }) : '';
  return t('dev.atelier.measures', {
    name, duration: num(m.duration, 2), centroid: num(m.centroid), f0: m.f0 > 0 ? `${num(m.f0)} Hz` : t('dev.atelier.measures.f0none'), hf: num(100 * m.hf4k, 1),
    peak: num(m.peakDb, 1), rms: num(m.rmsDb, 1), level: num(m.levelRel, 1), target: level,
  });
}
function verdict(r) {
  if (!r.check) return { text: t('dev.atelier.measures.reference'), out: [] };
  const out = r.check.items.filter((i) => !i.ok).map((i) => i.key);
  return { text: out.length === 0 ? t('dev.atelier.measures.ok') : t('dev.atelier.measures.out', { list: out.map((k) => t(`dev.atelier.crit.${k}`)).join(', ') }), out };
}
function drawWave(svg, samples) {
  const w = waveToSvg(samples, { width: 200, height: 48 });
  svg.replaceChildren();
  svg.setAttribute('viewBox', `0 0 ${w.width} ${w.height}`);
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', w.d);
  svg.append(path);
}
function note(entry) {
  log.push(entry);
  if (log.length > 300) log.shift();
}
const summary = (m) => ({ duration: m.duration, centroid: m.centroid, f0: m.f0, hf4k: m.hf4k, peakDb: m.peakDb, rmsDb: m.rmsDb, levelRel: m.levelRel, hnr: m.hnr, attackMs: m.attackMs });

// ---------- lecture ----------
// Doit être appelée dans le gestionnaire du geste, avant toute attente (déblocage de l'audio sur iPhone).
function gesture() {
  if (!player.supported) {
    status.textContent = t('dev.atelier.status.noaudio');
    return false;
  }
  player.unlock();
  return true;
}
async function playJob(job, { name, gain, target = null, ui = null, loud = false }) {
  status.textContent = t('dev.atelier.status.generating', { name });
  let r;
  try {
    r = await compute(job);
  } catch (error) {
    status.textContent = t('dev.atelier.status.error', { msg: error.message });
    return null;
  }
  const voice = player.play(r.samples, r.sampleRate, { gain, rate: job.rate ?? 1 });
  const v = verdict(r);
  if (ui) {
    ui.measures.replaceChildren(el('span', { text: `${measuresText(name, r, target)} · ` }), el('span', { class: v.out.length > 0 ? 'slot-out' : '', text: v.text }));
    if (ui.wave) drawWave(ui.wave, r.samples);
  }
  status.textContent = loud ? t('dev.atelier.status.loud', { name }) : t('dev.atelier.status.playing', { name, seed: job.seed ?? 1 });
  note({ kind: job.kind, slot: job.slot ?? null, variant: job.variant ?? null, source: job.source ?? null, seed: job.seed ?? 1, macros: job.macros ? { ...job.macros } : null, rate: job.rate ?? 1, gain, played: voice > 0, cached: r.cached, renderMs: r.renderMs, bytes: r.samples.length * 4, sampleRate: r.sampleRate, measures: summary(r.measures), ok: r.check ? r.check.ok : null, out: v.out });
  return r;
}

// ---------- en-tête ----------
const volume = $('volume');
volume.step = String(page.volumeStep);
const syncVolume = () => {
  volume.value = String(player.volume);
  $('volume-value').textContent = t('dev.atelier.volume.value', { n: player.volume });
  volume.setAttribute('aria-valuetext', $('volume-value').textContent);
};
volume.addEventListener('input', () => {
  player.setVolume(Number(volume.value));
  syncVolume();
});
syncVolume();
$('btn-unlock').addEventListener('click', () => {
  if (!gesture()) return;
  const report = () => {
    status.textContent = player.running ? t('dev.atelier.status.unlocked') : t('dev.atelier.status.blocked');
    $('btn-unlock').textContent = player.running ? t('dev.atelier.unlock.done') : t('dev.atelier.unlock');
  };
  report();
  player.onChange(report);
});
for (const type of ['pointerup', 'click', 'touchend', 'keydown']) window.addEventListener(type, () => player.supported && player.unlock(), { capture: true });

// ---------- références ----------
const refUi = { measures: $('refs-measures'), wave: null };
for (const ref of atelierRaw.references) {
  const recipe = recipes.get(ref.source);
  const label = t(ref.label);
  const button = el('button', { type: 'button', class: 'atelier-play', 'data-ref': ref.id }, [label]);
  if (ref.loud) button.append(el('span', { class: 'atelier-loud', text: `· ${t('dev.atelier.loud')}` }));
  let seed = 0;
  button.addEventListener('click', () => {
    if (!gesture()) return;
    seed = (seed % variantCount(recipe)) + 1;
    const gain = audioCfg.categoryGain[recipe.category] ?? 1;
    playJob({ kind: 'reference', source: ref.source, seed, gainDb: 20 * Math.log10(gain) }, { name: label, gain, ui: refUi, loud: ref.loud });
  });
  $('refs-list').append(button);
}

// ---------- emplacements ----------
const states = new Map();
const nav = $('nav-list');
nav.append(el('li', {}, [el('a', { href: '#refs', text: t('dev.atelier.refs') })]));
function stepOf(spec, id) {
  if (id === 'duree' && spec.unit === 's') return page.steps.dureeSeconds;
  return page.steps[id] ?? 0.1;
}
function macroText(id, value, spec) {
  return t(`dev.atelier.unit.${spec.unit}`, { n: num(value, id === 'hauteur' ? 0 : 2) });
}

function buildSlot(slot) {
  const st = { active: slot.variants[0]?.id ?? 'A', seeds: {}, macros: {}, favorite: null, currentSeed: 0 };
  for (const v of slot.variants) {
    st.seeds[v.id] = 1;
    st.macros[v.id] = macroValues(v, {});
  }
  states.set(slot.id, st);
  const titleId = `t-${slot.id}`;
  const card = el('li', { class: 'slot', 'data-slot': slot.id, id: `slot-${slot.id}` });
  card.append(el('h3', { class: 'slot-title', id: titleId }, [t(slot.label), el('code', { class: 'slot-id', text: slot.id })]));
  if (slot.currentNote) card.append(el('p', { class: 'atelier-note', text: t(slot.currentNote) }));
  const ui = { measures: el('p', { class: 'slot-measures', text: t('dev.atelier.measures.none') }), wave: document.createElementNS('http://www.w3.org/2000/svg', 'svg') };
  ui.wave.setAttribute('class', 'slot-wave');
  ui.wave.setAttribute('role', 'img');
  ui.wave.setAttribute('aria-label', t('dev.atelier.wave', { name: t(slot.label) }));
  ui.wave.setAttribute('preserveAspectRatio', 'none');
  drawWave(ui.wave, new Float32Array(0));

  const row = el('div', { class: 'slot-play' });
  const current = el('button', { type: 'button', class: 'atelier-play', 'data-action': 'current', 'aria-describedby': titleId, disabled: !slot.current }, [t(slot.current ? 'dev.atelier.current' : 'dev.atelier.current.none')]);
  current.addEventListener('click', () => {
    if (!gesture()) return;
    const recipe = recipes.get(slot.current);
    st.currentSeed = (st.currentSeed % variantCount(recipe)) + 1;
    playJob({ kind: 'current', source: slot.current, seed: st.currentSeed, rate: slot.currentRate ?? 1, slot: slot.id, gainDb: 20 * Math.log10(audioCfg.categoryGain[recipe.category] ?? 1) },
      { name: `${slot.current} (${t('dev.atelier.current')})`, gain: audioCfg.categoryGain[recipe.category] ?? 1, target: slot.target, ui });
  });
  row.append(current);
  const variantButtons = new Map();
  for (const v of slot.variants) {
    const b = el('button', { type: 'button', class: 'atelier-play', 'data-variant': v.id, 'aria-describedby': titleId, 'aria-pressed': String(v.id === st.active), title: t(v.label) }, [v.id]);
    b.addEventListener('click', () => {
      if (!gesture()) return;
      setActive(v.id);
      playVariant();
    });
    variantButtons.set(v.id, b);
    row.append(b);
  }
  const next = el('button', { type: 'button', class: 'atelier-play', 'data-action': 'next', 'aria-describedby': titleId }, [t('dev.atelier.next')]);
  next.addEventListener('click', () => {
    if (!gesture()) return;
    const r = nextVersion(versions, `${slot.id}:${st.active}`, page.versions);
    versions = r.state;
    st.seeds[st.active] = r.version;
    playVariant();
  });
  row.append(next);
  card.append(row, el('p', { class: 'atelier-note', text: t('dev.atelier.variants.legend') }));

  // Favori : un seul par emplacement.
  const fav = el('fieldset', { class: 'slot-fav' }, [el('legend', { text: t('dev.atelier.favorite') })]);
  for (const id of ['', ...slot.variants.map((v) => v.id)]) {
    const input = el('input', { type: 'radio', name: `fav-${slot.id}`, value: id, checked: id === '', id: `fav-${slot.id}-${id || 'aucun'}` });
    input.addEventListener('change', () => {
      st.favorite = id || null;
      updateChoices();
    });
    fav.append(el('label', { for: input.id }, [input, id ? id : t('dev.atelier.favorite.none')]));
  }
  card.append(fav);

  // Curseurs : réglages de la variante active.
  const macros = el('div', { class: 'slot-macros' });
  const macroTitle = el('p', { class: 'slot-macros-title' });
  macros.append(macroTitle);
  const sliders = {};
  for (const id of MACROS) {
    const inputId = `m-${slot.id}-${id}`;
    const input = el('input', { type: 'range', class: 'atelier-range', id: inputId, 'data-macro': id });
    const output = el('output', { class: 'atelier-value', for: inputId });
    input.addEventListener('input', () => {
      st.macros[st.active] = macroValues(slot.variants.find((v) => v.id === st.active), { ...st.macros[st.active], [id]: Number(input.value) });
      syncSliders();
      updateChoices();
    });
    input.addEventListener('change', () => {
      if (!gesture()) return;
      playVariant();
    });
    sliders[id] = { input, output };
    macros.append(el('label', { for: inputId, text: t(`dev.atelier.macro.${id}`) }), input, output);
  }
  card.append(macros, ui.measures, ui.wave);

  function syncSliders() {
    const v = slot.variants.find((x) => x.id === st.active);
    macroTitle.textContent = t('dev.atelier.macros', { v: st.active });
    for (const id of MACROS) {
      const spec = macroSpec(v, id);
      const { input, output } = sliders[id];
      input.min = String(spec.min);
      input.max = String(spec.max);
      input.step = String(stepOf(spec, id));
      input.value = String(st.macros[st.active][id]);
      output.textContent = macroText(id, st.macros[st.active][id], spec);
      input.setAttribute('aria-valuetext', output.textContent);
    }
  }
  function setActive(id) {
    st.active = id;
    for (const [vid, b] of variantButtons) b.setAttribute('aria-pressed', String(vid === id));
    syncSliders();
  }
  function playVariant() {
    const v = slot.variants.find((x) => x.id === st.active);
    playJob({ kind: 'variant', slot: slot.id, variant: v.id, macros: { ...st.macros[v.id] }, seed: st.seeds[v.id] }, { name: `${slot.id} ${v.id}`, gain: dbToGain(slot.gainDb), target: slot.target, ui });
  }
  syncSliders();
  return card;
}

const groupsRoot = $('groups');
for (const g of atelierRaw.groups) {
  const list = data.slots.filter((s) => s.group === g.id);
  if (list.length === 0) continue;
  const id = `groupe-${g.id}`;
  const section = el('section', { class: 'atelier-section atelier-group', id, 'aria-labelledby': `${id}-titre` }, [el('h2', { class: 'atelier-heading', id: `${id}-titre`, text: t(g.label) })]);
  const ul = el('ul', { class: 'slot-list' });
  for (const slot of list) ul.append(buildSlot(slot));
  section.append(ul);
  groupsRoot.append(section);
  nav.append(el('li', {}, [el('a', { href: `#${id}`, text: t(g.label) })]));
}
nav.append(el('li', {}, [el('a', { href: '#choices', text: t('dev.atelier.choices') })]));

// ---------- mes choix ----------
function choicesObject() {
  const out = {};
  for (const [id, st] of states) if (st.favorite) out[id] = { variant: st.favorite, macros: { ...st.macros[st.favorite] } };
  return out;
}
function updateChoices() {
  const text = serializeChoices(choicesObject(), data.slots);
  $('choices-text').value = text;
  $('choices-empty').hidden = text !== '';
}
updateChoices();
$('btn-copy').addEventListener('click', async () => {
  const text = $('choices-text').value;
  try {
    if (!navigator.clipboard?.writeText) throw new Error('presse-papiers absent');
    await navigator.clipboard.writeText(text);
    status.textContent = t('dev.atelier.status.copied');
  } catch {
    const area = $('choices-text');
    area.focus();
    area.select();
    status.textContent = t('dev.atelier.status.selected');
  }
});

// ---------- tout arrêter ----------
$('btn-stop').addEventListener('click', () => {
  player.stopAll();
  status.textContent = t('dev.atelier.status.stopped');
});

if (!player.supported) {
  status.textContent = t('dev.atelier.status.noaudio');
  for (const b of document.querySelectorAll('.atelier-play, #btn-unlock')) b.disabled = true;
} else status.textContent = t('dev.atelier.status.ready', { slots: data.slots.length, variants: data.slots.reduce((n, s) => n + s.variants.length, 0) });

if (testMode) {
  window.__zsSons = {
    log: () => log.map((e) => ({ ...e })),
    state: () => ({ supported: player.supported, unlocked: player.unlocked, contextState: player.state, volume: player.volume, cacheBytes: cacheBytes(cache), cacheEntries: cacheKeys(cache).length, cacheLimit: cache.limit, activeVoices: player.activeVoices, worker: worker !== null, slots: data.slots.length }),
    choices: () => $('choices-text').value,
    graph: () => player.graph(),
  };
}
// La page n'apparaît qu'une fois entièrement construite (aucun décalage de mise en page pendant la construction).
$('app').hidden = false;
document.body.dataset.ready = '1';
