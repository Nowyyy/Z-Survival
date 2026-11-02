// Page interface-retenue.html : seulement les choix du propriétaire (data/game/ui-atelier.json, « retenue ») : HUD, pause, fins et à terre en B
// (caméscope), sticks en A (sobre) sous le HUD B. Un écran à la fois ou les six écrans de jeu d'un coup, à la même taille et dans le même état, sur le
// vrai jeu (même origine) ou un sol généré, avec les mesures en texte. Rien n'est enregistré ; aucune requête hors de l'origine ; ?test=1 expose
// window.__zsUi. Maquette : rien n'est intégré au jeu.
import { translate } from '../i18n.js';
import { formatMoney, worldBonus } from '../core/economy.js';
import { states, sweepValues } from '../core/ui-mock.js';
import { backgroundsFrom, tokensFromCss } from '../core/ui-measure.js';
import { createView } from './view.js';
import { renderHud, renderSticks } from './render.js';

const $ = (id) => document.getElementById(id);
const fmt = (text, p) => String(text).replace(/\{(\w+)\}/g, (_, k) => String(p?.[k] ?? ''));
const loadJson = async (path) => {
  const response = await fetch(path);
  if (!response.ok) throw new Error(`${path} : ${response.status}`);
  return response.json();
};
const query = new URLSearchParams(location.search);
const TEST = query.get('test') === '1';

const [fr, own, cfg, economy, tokensCss] = await Promise.all([
  loadJson('data/i18n/fr.json'), loadJson('data/i18n/atelier-interface.json'), loadJson('data/game/ui-atelier.json'), loadJson('data/game/economy.json'), fetch('css/tokens.css').then((r) => r.text()),
]);
const dict = { ...fr, ...own };
const t = (key, p) => fmt(translate(dict, key), p);
for (const el of document.querySelectorAll('[data-i18n]')) el.textContent = t(el.dataset.i18n);
for (const el of document.querySelectorAll('[data-i18n-title]')) el.title = t(el.dataset.i18nTitle);
document.title = `Z-Survival · ${t('atelier.retenue.title')}`;

const CHOICE = cfg.retenue;
const SCREENS = cfg.gameScreens.filter((s) => typeof CHOICE[s] === 'string');
const HUD_DIR = CHOICE.hud;
const backgrounds = backgroundsFrom(tokensFromCss(tokensCss), cfg.worstBackgrounds);
const namedStates = states(cfg).filter((s) => !['pause', 'mort', 'monde-termine'].includes(s.id));
// Direction d'un écran ; l'écran des sticks garde le HUD retenu et pose les sticks de leur direction dans une couche à part.
const dirOf = (screen) => (screen === 'sticks' ? HUD_DIR : CHOICE[screen]);
const ctx = {
  cfg, t, backgrounds, worldBonusText: formatMoney(worldBonus(economy)),
  renderScreen: (o, state) => (o.screen === 'sticks' && CHOICE.sticks !== HUD_DIR
    ? `${renderHud(state, HUD_DIR, o.macros, t)}<div class="ui3k-screen ui3k-dir-${CHOICE.sticks.toLowerCase()}">${renderSticks(CHOICE.sticks, t)}</div>`
    : null),
};

const ui = {
  screen: 'hud', size: cfg.sizes[0].id, stateId: 'combat', params: { ...namedStates.find((s) => s.id === 'combat').params },
  background: query.get('fond') === 'sol' ? 'sol' : 'jeu', safe: 'preset', guide: false,
};

const option = (value, label) => {
  const o = document.createElement('option');
  o.value = value;
  o.textContent = label;
  return o;
};
const fill = (id, entries) => $(id).replaceChildren(...entries.map(([v, l]) => option(v, l)));
fill('f-screen', [...SCREENS.map((s) => [s, t('atelier.retenue.screenDir', { screen: t(`atelier.screen.${s}`), d: t(`atelier.direction.${CHOICE[s]}`) })]), ['tous', t('atelier.retenue.all')]]);
fill('f-size', cfg.sizes.map((s) => [s.id, t('atelier.size', { w: s.width, h: s.height, kind: t(`atelier.kind.${s.kind}`) })]));
fill('f-state', [...namedStates.map((s) => [s.id, t(`atelier.state.${s.id}`)]), ['custom', t('atelier.state.custom')]]);
fill('f-background', [['jeu', t('atelier.background.jeu')], ['sol', t('atelier.background.sol')]]);
fill('f-safe', cfg.safePresets.map((p) => [p.id, t(`atelier.safe.${p.id}`)]));
fill('f-floor', cfg.floors.map((f) => [f, t(`game.hud.floor.${f}`)]));

const sizeOf = (id) => cfg.sizes.find((s) => s.id === id) ?? cfg.sizes[0];
const safeOf = () => cfg.safePresets.find((p) => p.id === ui.safe)?.safe ?? sizeOf(ui.size).safe;

function syncControls() {
  $('f-screen').value = ui.screen;
  $('f-size').value = ui.size;
  $('f-state').value = ui.stateId;
  $('f-background').value = ui.background;
  $('f-safe').value = ui.safe;
  $('f-guide').checked = ui.guide;
  const p = { ...cfg.defaults, ...ui.params };
  $('f-hp').max = String(p.maxHp);
  $('f-hp').value = String(Math.min(p.hp, p.maxHp));
  $('o-hp').textContent = `${Math.min(p.hp, p.maxHp)} / ${p.maxHp}`;
  $('f-chutes').value = String(p.chutes);
  $('o-chutes').textContent = String(p.chutes);
  $('f-money').value = String(p.money);
  $('f-kills').value = String(p.kills);
  $('f-wave').value = String(p.wave);
  $('o-wave').textContent = `${p.wave} / ${cfg.maxWave}`;
  $('f-floor').value = p.floor;
  $('f-reinforced').checked = Boolean(p.reinforced);
  $('f-trial').checked = Boolean(p.trial);
}

const single = createView({ viewport: $('viewport'), stage: $('stage'), frame: $('frame'), floor: $('floor'), overlay: $('overlay'), guide: $('guide') }, ctx);
let grid = null;
function makeGrid() {
  const make = (tag, cls) => {
    const el = document.createElement(tag);
    if (cls) el.className = cls;
    return el;
  };
  grid = SCREENS.map((screen) => {
    const fig = make('figure');
    const cap = make('figcaption');
    cap.textContent = t('atelier.retenue.screenDir', { screen: t(`atelier.screen.${screen}`), d: t(`atelier.direction.${CHOICE[screen]}`) });
    const viewport = make('div', 'ui3k-viewport');
    const stage = make('div', 'ui3k-stage');
    const frame = make('iframe', 'ui3k-frame');
    frame.title = t('atelier.frame.title');
    frame.tabIndex = -1;
    frame.hidden = true;
    const floor = make('div', 'ui3k-floor');
    floor.hidden = true;
    const overlay = make('div', 'ui3k-screen');
    overlay.inert = true;
    const guide = make('div', 'ui3k-safe-guide');
    guide.hidden = true;
    stage.append(frame, floor, overlay, guide);
    viewport.append(stage);
    fig.append(cap, viewport);
    $('all').append(fig);
    return { screen, fig, view: createView({ viewport, stage, frame, floor, overlay, guide }, ctx) };
  });
}

function options(screen, scale) {
  const size = sizeOf(ui.size);
  const direction = dirOf(screen);
  return {
    size, safe: safeOf(), screen, direction, params: ui.params, macros: cfg.macroDefaults[direction], background: ui.background,
    textScale: 100, cvd: 'aucun', guide: ui.guide, scale, sub: {}, p2: '',
  };
}

let lastRows = [];
function showRows(rows) {
  lastRows = rows;
  const tr = ({ screen, report }) => {
    const row = document.createElement('tr');
    const v = report.verdict;
    const out = v.outOfTarget.length > 0;
    const cells = [t('atelier.retenue.screenDir', { screen: t(`atelier.screen.${screen}`), d: t(`atelier.direction.${CHOICE[screen]}`) }),
      `${(v.coverage * 100).toFixed(1).replace('.', ',')} %`, `${v.minTextPx ?? '—'} px`, `${v.minTargetPx ?? '—'} px`, `${String(v.minContrast ?? '—').replace('.', ',')}:1`,
      out ? `${t('atelier.measure.outWord')} : ${v.outOfTarget.map((o) => `${o.rule} (${o.element}) : ${o.reason}`).join(' ; ')}` : t('atelier.measure.ok')];
    cells.forEach((c, i) => {
      const cell = document.createElement(i === 0 ? 'th' : 'td');
      if (i === 0) cell.scope = 'row';
      cell.textContent = c;
      if (out && i === cells.length - 1) cell.className = 'is-out';
      row.append(cell);
    });
    return row;
  };
  $('measure-rows').replaceChildren(...rows.map(tr));
}

async function render() {
  syncControls();
  const size = sizeOf(ui.size);
  const s = safeOf();
  const all = ui.screen === 'tous';
  $('single').hidden = all;
  $('all').hidden = !all;
  if (all) {
    if (!grid) makeGrid();
    const scale = Math.min(1, Math.max(200, grid[0].fig.clientWidth - 4) / size.width);
    $('dims').textContent = t('atelier.dims', { w: size.width, h: size.height, t: s.top, r: s.right, b: s.bottom, l: s.left, k: scale.toFixed(2).replace('.', ',') });
    await Promise.all(grid.map((g) => g.view.update(options(g.screen, scale))));
    showRows(grid.map((g) => ({ screen: g.screen, report: g.view.measure() })));
    return;
  }
  const avail = Math.max(240, $('app').clientWidth - 4);
  const scale = Math.min(1, avail / size.width, Math.max(0.3, (window.innerHeight * 0.8) / size.height));
  $('dims').textContent = t('atelier.dims', { w: size.width, h: size.height, t: s.top, r: s.right, b: s.bottom, l: s.left, k: scale.toFixed(2).replace('.', ',') });
  await single.update(options(ui.screen, scale));
  const fs = single.frameState;
  $('status').textContent = fs.status === 'error' ? fs.notes.join(' ') : t(fs.status === 'floor' ? 'atelier.retenue.statusFloor' : 'atelier.retenue.statusGame');
  showRows([{ screen: ui.screen, report: single.measure() }]);
}

let pending = Promise.resolve();
function set(partial) {
  Object.assign(ui, partial);
  if (partial.stateId && partial.stateId !== 'custom') ui.params = { ...(namedStates.find((x) => x.id === partial.stateId)?.params ?? {}) };
  pending = pending.then(render, render);
  return pending;
}
const setParam = (k, v) => set({ stateId: 'custom', params: { ...ui.params, [k]: v } });

$('f-screen').addEventListener('change', (e) => set({ screen: e.target.value }));
$('f-size').addEventListener('change', (e) => set({ size: e.target.value }));
$('f-state').addEventListener('change', (e) => set({ stateId: e.target.value }));
$('f-background').addEventListener('change', (e) => set({ background: e.target.value }));
$('f-safe').addEventListener('change', (e) => set({ safe: e.target.value }));
$('f-guide').addEventListener('change', (e) => set({ guide: e.target.checked }));
for (const [id, key, num] of [['f-hp', 'hp', true], ['f-chutes', 'chutes', true], ['f-money', 'money', true], ['f-kills', 'kills', true], ['f-wave', 'wave', true], ['f-floor', 'floor', false]]) {
  $(id).addEventListener('change', (e) => setParam(key, num ? Number(e.target.value) : e.target.value));
}
$('f-reinforced').addEventListener('change', (e) => setParam('reinforced', e.target.checked));
$('f-trial').addEventListener('change', (e) => setParam('trial', e.target.checked));
let resizeTimer = 0;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => set({}), 150);
});

$('app').hidden = false;
const ready = set({});

if (TEST) {
  window.__zsUi = {
    ready,
    set: (partial) => set(partial),
    setParam: (k, v) => setParam(k, v),
    getState: () => structuredClone({ screen: ui.screen, size: ui.size, stateId: ui.stateId, params: ui.params, background: ui.background, choice: CHOICE }),
    measure: () => single.measure(),
    rows: () => lastRows.map((r) => ({ screen: r.screen, verdict: r.report.verdict })),
    stability: (fields = ['hp', 'money', 'wave', 'chutes', 'remaining', 'kills', 'chrono', 'floor', 'reinforced']) => single.stability(Object.fromEntries(fields.map((f) => [f, f === 'floor' ? cfg.floors : f === 'reinforced' ? [false, true] : sweepValues(f, cfg)]))),
  };
}
