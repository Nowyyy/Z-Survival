// Page technique atelier-interface.html (lot 3k) : choix (taille, écran, direction, état, fond, macros, zone de sécurité, daltonisme, échelle du texte),
// aperçu (vrai jeu de même origine dans un cadre, interface d'origine pour « Actuel », masquée de l'extérieur pour A, B, C), mesures en texte et
// « Mes choix » à copier. Rien n'est enregistré (ni stockage, ni cookie) ; aucune requête hors de l'origine. ?test=1 expose window.__zsUi.
import { translate } from '../i18n.js';
import { formatMoney, worldBonus } from '../core/economy.js';
import { states, sweepValues } from '../core/ui-mock.js';
import { backgroundsFrom, tokensFromCss } from '../core/ui-measure.js';
import { parseChoices, serializeChoices, MACRO_KEYS } from './choices.js';
import { createView } from './view.js';

const $ = (id) => document.getElementById(id);
const fmt = (text, p) => String(text).replace(/\{(\w+)\}/g, (_, k) => String(p?.[k] ?? ''));
const loadJson = async (path) => {
  const response = await fetch(path);
  if (!response.ok) throw new Error(`${path} : ${response.status}`);
  return response.json();
};
const loadText = async (path) => (await fetch(path)).text();
const TEST = new URLSearchParams(location.search).get('test') === '1';
const query = new URLSearchParams(location.search);

const [fr, own, cfg, economy, tokensCss] = await Promise.all([
  loadJson('data/i18n/fr.json'), loadJson('data/i18n/atelier-interface.json'), loadJson('data/game/ui-atelier.json'), loadJson('data/game/economy.json'), loadText('css/tokens.css'),
]);
const dict = { ...fr, ...own };
const t = (key, p) => fmt(translate(dict, key), p);
for (const el of document.querySelectorAll('[data-i18n]')) el.textContent = t(el.dataset.i18n);
for (const el of document.querySelectorAll('[data-i18n-title]')) el.title = t(el.dataset.i18nTitle);
document.title = `Z-Survival · ${t('atelier.title')}`;

const backgrounds = backgroundsFrom(tokensFromCss(tokensCss), cfg.worstBackgrounds);
const namedStates = states(cfg);
const SCREENS = cfg.screens;
const ctx = { cfg, t, backgrounds, worldBonusText: formatMoney(worldBonus(economy)), renderScreen: null };

// État de la page (en mémoire seulement).
const ui = {
  size: cfg.sizes[0].id,
  screen: 'hud',
  direction: 'A',
  stateId: 'combat',
  params: { ...namedStates.find((s) => s.id === 'combat').params },
  background: query.get('fond') === 'sol' ? 'sol' : 'jeu',
  safe: 'preset',
  cvd: 'aucun',
  textScale: 100,
  guide: false,
  macros: structuredClone(cfg.macroDefaults),
  choices: { screens: {}, priority2: {} },
};

// ---------- Contrôles ----------
const option = (value, label) => {
  const o = document.createElement('option');
  o.value = value;
  o.textContent = label;
  return o;
};
const fill = (id, entries) => $(id).replaceChildren(...entries.map(([v, l]) => option(v, l)));
fill('f-size', cfg.sizes.map((s) => [s.id, t('atelier.size', { w: s.width, h: s.height, kind: t(`atelier.kind.${s.kind}`) })]));
fill('f-screen', SCREENS.map((s) => [s, t(`atelier.screen.${s}`)]));
fill('f-state', [...namedStates.map((s) => [s.id, t(`atelier.state.${s.id}`)]), ['custom', t('atelier.state.custom')]]);
fill('f-background', [['jeu', t('atelier.background.jeu')], ['sol', t('atelier.background.sol')]]);
fill('f-floor', cfg.floors.map((f) => [f, t(`game.hud.floor.${f}`)]));
fill('f-save', cfg.saveStatuses.map((s) => [s, t(`atelier.save.${s}`)]));
for (const k of MACRO_KEYS) fill(`f-${k}`, cfg.macros[k].map((v) => [v, t(`atelier.macro.${k}.${v}`)]));
fill('f-safe', cfg.safePresets.map((p) => [p.id, t(`atelier.safe.${p.id}`)]));
fill('f-cvd', ['aucun', 'protanopie', 'deuteranopie', 'tritanopie', 'gris'].map((c) => [c, t(`atelier.cvd.${c}`)]));
fill('f-textscale', [100, 150, 200].map((n) => [String(n), t('atelier.textScale', { n })]));
$('directions').replaceChildren(...cfg.directions.map((d) => {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'button';
  b.dataset.direction = d;
  b.textContent = t(`atelier.direction.${d}`);
  b.addEventListener('click', () => set({ direction: d }));
  return b;
}));

const sizeOf = (id) => cfg.sizes.find((s) => s.id === id) ?? cfg.sizes[0];
const safeOf = () => {
  const preset = cfg.safePresets.find((p) => p.id === ui.safe);
  return preset?.safe ?? sizeOf(ui.size).safe;
};

function syncControls() {
  $('f-size').value = ui.size;
  $('f-screen').value = ui.screen;
  $('f-state').value = ui.stateId;
  $('f-background').value = ui.background;
  $('f-safe').value = ui.safe;
  $('f-cvd').value = ui.cvd;
  $('f-textscale').value = String(ui.textScale);
  $('f-guide').checked = ui.guide;
  const p = { ...cfg.defaults, ...ui.params };
  $('f-hp').max = String(p.maxHp);
  $('f-hp').value = String(Math.min(p.hp, p.maxHp));
  $('o-hp').textContent = `${Math.min(p.hp, p.maxHp)} / ${p.maxHp}`;
  $('f-chutes').value = String(p.chutes);
  $('o-chutes').textContent = String(p.chutes);
  $('f-money').value = String(p.money);
  $('f-wave').value = String(p.wave);
  $('o-wave').textContent = `${p.wave} / ${cfg.maxWave}`;
  $('f-floor').value = p.floor;
  $('f-save').value = p.save;
  $('f-reinforced').checked = Boolean(p.reinforced);
  $('f-trial').checked = Boolean(p.trial);
  const macroOff = ui.direction === 'actuel';
  for (const k of MACRO_KEYS) {
    $(`f-${k}`).disabled = macroOff;
    $(`f-${k}`).value = (ui.macros[ui.direction] ?? cfg.macroDefaults.A)[k];
  }
  for (const b of $('directions').children) b.setAttribute('aria-pressed', String(b.dataset.direction === ui.direction));
  $('direction-desc').textContent = t(`atelier.direction.desc.${ui.direction}`);
}

// ---------- Aperçu principal ----------
const view = createView({ viewport: $('viewport'), stage: $('stage'), frame: $('frame'), floor: $('floor'), overlay: $('overlay'), guide: $('guide') }, ctx);
const fitScale = (size) => {
  const avail = Math.max(240, $('app').clientWidth - 4);
  return Math.min(1, avail / size.width, Math.max(0.3, (window.innerHeight * 0.8) / size.height));
};

function viewOptions() {
  const size = sizeOf(ui.size);
  return {
    size, safe: safeOf(), screen: ui.screen, direction: ui.direction, params: ui.params, macros: ui.macros[ui.direction] ?? cfg.macroDefaults.A,
    background: ui.background, textScale: ui.textScale, cvd: ui.cvd, guide: ui.guide, scale: fitScale(size),
  };
}

function showStatus(fs) {
  const parts = [];
  if (fs.status === 'loading') parts.push(t('atelier.frame.loading'));
  else if (ui.direction === 'actuel') {
    if (!fs.available) parts.push(t('atelier.frame.unavailable', { reason: fs.notes.join(' ; ') }));
    else {
      parts.push(t('atelier.frame.actuel'));
      if (fs.notes.length) parts.push(t('atelier.frame.notes', { notes: fs.notes.join(' ; ') }));
    }
  } else {
    parts.push(t(fs.status === 'floor' ? 'atelier.frame.floor' : 'atelier.frame.proto', { d: t(`atelier.direction.${ui.direction}`) }));
    if (fs.status === 'error') parts.push(...fs.notes);
  }
  $('status').textContent = parts.join(' ');
}
view.onFrame(showStatus);

function showDims(o) {
  const s = o.safe;
  $('dims').textContent = t('atelier.dims', { w: o.size.width, h: o.size.height, t: s.top, r: s.right, b: s.bottom, l: s.left, k: o.scale.toFixed(2).replace('.', ',') });
}

// Tableau des mesures de la vue courante (texte ; « hors cible » écrit en toutes lettres).
let lastReport = null;
function showMeasure(report) {
  lastReport = report;
  const rows = $('measure-rows');
  if (!report?.available) {
    $('measure-summary').textContent = t('atelier.measure.unavailable');
    rows.replaceChildren();
    return;
  }
  const v = report.verdict;
  $('measure-summary').textContent = t('atelier.measure.summary', {
    c: (v.coverage * 100).toFixed(1).replace('.', ','), t: v.minTextPx ?? '—', g: v.minTargetPx ?? '—', k: v.minContrast === null ? '—' : String(v.minContrast).replace('.', ','),
    n: report.dom ?? '—', l: report.lines ?? v.textCount, s: v.outOfTarget.length === 0 ? t('atelier.measure.ok') : t('atelier.measure.out', { n: v.outOfTarget.length }),
  });
  const tr = (cells, out) => {
    const row = document.createElement('tr');
    for (const c of cells) {
      const td = document.createElement('td');
      td.textContent = c;
      if (out) td.className = 'is-out';
      row.append(td);
    }
    return row;
  };
  rows.replaceChildren(...(v.outOfTarget.length
    ? v.outOfTarget.map((o) => tr([`${t('atelier.measure.outWord')} : ${o.rule}`, o.element, o.measure ?? '—', String(o.limit), o.reason], true))
    : [tr([t('atelier.measure.none'), '', '', '', ''], false)]));
}

let pending = Promise.resolve();
async function render() {
  syncControls();
  const o = viewOptions();
  showDims(o);
  await view.update(o);
  showStatus(view.frameState);
  showMeasure(view.measure());
}

// Applique des changements (toujours dans l'ordre) ; renvoie une promesse résolue quand l'aperçu est prêt.
function set(partial) {
  Object.assign(ui, partial);
  if (partial.stateId && partial.stateId !== 'custom') {
    const s = namedStates.find((x) => x.id === partial.stateId);
    ui.params = { ...(s?.params ?? {}) };
  }
  pending = pending.then(render, render);
  return pending;
}
const setParam = (k, v) => set({ stateId: 'custom', params: { ...ui.params, [k]: v } });

$('f-size').addEventListener('change', (e) => set({ size: e.target.value }));
$('f-screen').addEventListener('change', (e) => set({ screen: e.target.value }));
$('f-state').addEventListener('change', (e) => set({ stateId: e.target.value }));
$('f-background').addEventListener('change', (e) => set({ background: e.target.value }));
$('f-safe').addEventListener('change', (e) => set({ safe: e.target.value }));
$('f-cvd').addEventListener('change', (e) => set({ cvd: e.target.value }));
$('f-textscale').addEventListener('change', (e) => set({ textScale: Number(e.target.value) }));
$('f-guide').addEventListener('change', (e) => set({ guide: e.target.checked }));
$('f-hp').addEventListener('change', (e) => setParam('hp', Number(e.target.value)));
$('f-chutes').addEventListener('change', (e) => setParam('chutes', Number(e.target.value)));
$('f-money').addEventListener('change', (e) => setParam('money', Number(e.target.value)));
$('f-wave').addEventListener('change', (e) => setParam('wave', Number(e.target.value)));
$('f-floor').addEventListener('change', (e) => setParam('floor', e.target.value));
$('f-save').addEventListener('change', (e) => setParam('save', e.target.value));
$('f-reinforced').addEventListener('change', (e) => setParam('reinforced', e.target.checked));
$('f-trial').addEventListener('change', (e) => setParam('trial', e.target.checked));
for (const k of MACRO_KEYS) {
  $(`f-${k}`).addEventListener('change', (e) => {
    if (ui.direction === 'actuel') return;
    set({ macros: { ...ui.macros, [ui.direction]: { ...ui.macros[ui.direction], [k]: e.target.value } } });
  });
}
let resizeTimer = 0;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => set({}), 150);
});

// ---------- Mes choix (texte copiable, jamais enregistré) ----------
const showChoices = () => {
  $('choices').value = serializeChoices(ui.choices, cfg);
};
function keepChoice() {
  const m = ui.macros[ui.direction] ?? {};
  ui.choices.screens[ui.screen] = ui.direction === 'actuel' ? { direction: 'actuel' } : { direction: ui.direction, ...m };
  showChoices();
  $('choices-status').textContent = t('atelier.choices.kept', { screen: t(`atelier.screen.${ui.screen}`) });
}
async function copyChoices() {
  const text = $('choices').value;
  try {
    await navigator.clipboard.writeText(text);
    $('choices-status').textContent = t('atelier.choices.copied');
  } catch {
    $('choices').focus();
    $('choices').select();
    $('choices-status').textContent = t('atelier.choices.selected');
  }
}
$('btn-keep').addEventListener('click', keepChoice);
$('btn-copy').addEventListener('click', copyChoices);
$('btn-clear').addEventListener('click', () => {
  ui.choices = { screens: {}, priority2: {} };
  showChoices();
  $('choices-status').textContent = t('atelier.choices.cleared');
});

$('app').hidden = false;
const ready = set({});
showChoices();

// ---------- Accès pour les tests (?test=1 seulement) ----------
if (TEST) {
  window.__zsUi = {
    ready,
    getState: () => ({ ...structuredClone({ size: ui.size, screen: ui.screen, direction: ui.direction, stateId: ui.stateId, params: ui.params, background: ui.background, safe: safeOf(), cvd: ui.cvd, textScale: ui.textScale, macros: ui.macros, choices: ui.choices }), frame: { ...view.frameState } }),
    set: (partial) => set(partial),
    setParam: (k, v) => setParam(k, v),
    measure: () => view.measure(),
    lastReport: () => lastReport,
    stability: (fields = ['hp', 'money', 'wave', 'chutes', 'remaining', 'kills', 'chrono']) => view.stability(Object.fromEntries(fields.map((f) => [f, sweepValues(f, cfg)]))),
    keepChoice,
    choicesText: () => $('choices').value,
    parseChoices: (text) => parseChoices(text, cfg),
    config: () => structuredClone(cfg),
  };
}
