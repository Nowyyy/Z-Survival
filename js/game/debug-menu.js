// Menu de débogage de la pause (lot 5l, bloc E2-13) : chargé par import dynamique au premier clic sur l'icône « Débogage » (aucun fichier de plus au
// démarrage). L'icône n'existe que sur les canaux de débogage (source, dev, release ; Docs/ref/debug.md). Panneau du style de l'écran Options : en tête
// le titre et la croix de fermeture ; une région qui défile (sections Mesure, la plus utile, puis Partie ; retours du propriétaire, lot 5l-E) ; en pied l'adresse obtenue, « Appliquer et recharger » et
// « Revenir au jeu normal », chacun après confirmation (« Cette partie sera perdue »). Les valeurs sont lues dans l'adresse actuelle ; l'adresse construite
// (jeu.html?…) ne garde que les valeurs non standard et conserve les paramètres que le panneau ne gère pas (v=, test=, gfx=…). Les réglages de Partie
// sont tous dans readOnlyParams (data/game/save.json) : la partie rechargée est en mode essai, la sauvegarde n'est pas modifiée ; perf et cap n'y sont
// pas. Focus piégé, Échap ferme (d'abord la confirmation), focus rendu à l'icône. Les fonctions de lecture et de construction de l'adresse sont pures.

// Paramètres gérés par le panneau (retirés puis réécrits par « Appliquer », retirés par « Revenir au jeu normal »).
export const GERES = Object.freeze(['wave', 'money', 'lvl', 'planks', 'floor', 'map', 'nospawn', 'endless', 'fin', 'perf', 'cap']);
export const WAVE = Object.freeze({ min: 1, max: 200 });
export const MONEY = Object.freeze({ min: 0, max: 9999999, step: 100 });
export const NIVEAU_MAX = 10;
// Statistiques dans l'ordre du panneau : identifiant (celui de ?lvl=), clé du libellé, niveau maximal (chutes : 5).
export const STATS = Object.freeze([
  ['degats', 'game.debug.stat.degats', 10], ['portee', 'game.debug.stat.portee', 10], ['precision', 'game.debug.stat.precision', 10],
  ['cadence', 'game.debug.stat.cadence', 10], ['vitesse', 'game.debug.stat.vitesse', 10], ['vie', 'game.debug.stat.vie', 10],
  ['regen', 'game.debug.stat.regen', 10], ['chutes', 'game.debug.stat.chutes', 5], ['reparation', 'game.debug.stat.reparation', 10],
].map((s) => Object.freeze(s)));
export const CAPS = Object.freeze(['30', '45', '60']);
export const PLANKS_MAX = 4;

const INT_RE = /^\d{1,9}$/;
const int = (v, min, max, fallback) => {
  const n = typeof v === 'number' ? v : typeof v === 'string' && INT_RE.test(v.trim()) ? Number(v.trim()) : NaN;
  return Number.isInteger(n) ? Math.min(max, Math.max(min, n)) : fallback;
};
const query = (search) => {
  try {
    return new URLSearchParams(typeof search === 'string' ? search : '');
  } catch {
    return new URLSearchParams('');
  }
};
const maxOf = (id) => STATS.find((s) => s[0] === id)?.[2] ?? 0;

// Valeurs standard (aucun paramètre écrit) : manche 1, solde de la sauvegarde, niveaux de la sauvegarde, toutes les planches, rez-de-chaussée, bâtiment.
export function defaults(planksMax = PLANKS_MAX) {
  return { wave: 1, money: null, all: 0, levels: Object.fromEntries(STATS.map(([id]) => [id, 0])), planks: planksMax, floor: 'rdc', map: 'batiment', nospawn: false, endless: false, fin: false, perf: false, cap: null };
}

// ?lvl= lu comme le jeu (js/core/player-stats.js) : « all:N » d'abord (borné par statistique), puis chaque « stat:N » ; entrée inconnue ignorée.
export function lireNiveaux(text) {
  const levels = Object.fromEntries(STATS.map(([id]) => [id, 0]));
  let all = 0;
  const entries = [];
  for (const part of String(typeof text === 'string' ? text : '').slice(0, 200).split(',')) {
    const m = /^([a-z]+):(\d{1,3})$/.exec(part.trim());
    if (m && (m[1] === 'all' || maxOf(m[1]) > 0)) entries.push([m[1], Number(m[2])]);
  }
  for (const [k, v] of entries) {
    if (k !== 'all') continue;
    all = Math.min(NIVEAU_MAX, v);
    for (const [id, , max] of STATS) levels[id] = Math.min(max, v);
  }
  for (const [k, v] of entries) if (k !== 'all') levels[k] = Math.min(maxOf(k), v);
  return { all, levels };
}

// Texte de ?lvl= : « all:N » suivi des statistiques qui en diffèrent, ou la liste des statistiques non nulles ; '' quand tout vaut 0.
export function niveauxTexte(all, levels) {
  const a = int(all, 0, NIVEAU_MAX, 0);
  const lv = levels !== null && typeof levels === 'object' ? levels : {};
  const value = (id, max) => int(lv[id], 0, max, a > 0 ? Math.min(a, max) : 0);
  if (a > 0) return [`all:${a}`, ...STATS.filter(([id, , max]) => value(id, max) !== Math.min(a, max)).map(([id, , max]) => `${id}:${value(id, max)}`)].join(',');
  return STATS.filter(([id, , max]) => value(id, max) > 0).map(([id, , max]) => `${id}:${value(id, max)}`).join(',');
}

// Valeurs du panneau d'après une adresse (préremplissage), avec les règles de lecture du jeu ; une valeur invalide donne la valeur standard.
export function lireDebug(search, { planksMax = PLANKS_MAX } = {}) {
  const q = query(search);
  const d = defaults(planksMax);
  const get = (k) => (q.has(k) ? q.get(k) : null);
  const { all, levels } = lireNiveaux(get('lvl'));
  const money = get('money');
  return {
    wave: get('wave') !== null && INT_RE.test(get('wave')) && Number(get('wave')) >= WAVE.min && Number(get('wave')) <= WAVE.max ? Number(get('wave')) : d.wave,
    money: money !== null && INT_RE.test(money) && Number(money) <= MONEY.max ? Number(money) : null,
    all,
    levels,
    planks: get('planks') !== null && INT_RE.test(get('planks')) && Number(get('planks')) <= planksMax ? Number(get('planks')) : planksMax,
    floor: get('floor') === '1' ? 'etage' : 'rdc',
    map: get('map') === 'salle' ? 'salle' : 'batiment',
    nospawn: get('nospawn') === '1',
    endless: get('endless') === '1',
    fin: get('fin') === 'monde',
    perf: get('perf') === '1',
    cap: CAPS.includes(get('cap')) ? get('cap') : null,
  };
}

// Paramètres non standard des valeurs (bornées), dans l'ordre du panneau.
export function paramsDebug(values, { planksMax = PLANKS_MAX } = {}) {
  const v = values !== null && typeof values === 'object' ? values : {};
  const out = [];
  const wave = int(v.wave, WAVE.min, WAVE.max, 1);
  if (wave !== 1) out.push(['wave', String(wave)]);
  if (v.money !== null && v.money !== undefined && v.money !== '') {
    const money = int(v.money, MONEY.min, MONEY.max, null);
    if (money !== null) out.push(['money', String(money)]);
  }
  const lvl = niveauxTexte(v.all, v.levels);
  if (lvl) out.push(['lvl', lvl]);
  const planks = int(v.planks, 0, planksMax, planksMax);
  if (planks !== planksMax) out.push(['planks', String(planks)]);
  if (v.floor === 'etage') out.push(['floor', '1']);
  if (v.map === 'salle') out.push(['map', 'salle']);
  if (v.nospawn === true) out.push(['nospawn', '1']);
  if (v.endless === true) out.push(['endless', '1']);
  if (v.fin === true) out.push(['fin', 'monde']);
  if (v.perf === true) out.push(['perf', '1']);
  if (CAPS.includes(v.cap)) out.push(['cap', v.cap]);
  return out;
}

// Adresse relative « jeu.html?… » : paramètres non gérés conservés (dans leur ordre), puis les valeurs non standard du panneau. values null : jeu normal.
export function adresseDebug(search, values, options = {}) {
  const q = query(search);
  for (const k of GERES) q.delete(k);
  for (const [k, val] of values === null ? [] : paramsDebug(values, options)) q.append(k, val);
  const s = q.toString().replace(/%3A/gi, ':').replace(/%2C/gi, ',');
  return s ? `jeu.html?${s}` : 'jeu.html';
}

// ---------------------------------------------------------------------------------------------------------------------------------------------
// Panneau (DOM).
function el(tag, classes = [], attrs = {}) {
  const n = document.createElement(tag);
  if (classes.length) n.classList.add(...classes);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  return n;
}
function icon(d) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 16 16');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', d);
  svg.append(path);
  return svg;
}

// dict : textes (fr.json) ; search : adresse actuelle (location.search) ; planksMax : planches d'une fenêtre (windows.json) ; navigate(url) : rechargement
// réel (location.assign) ; onClose() : retour à la pause.
export function createDebugMenu({ dict, search = '', planksMax = PLANKS_MAX, navigate = (url) => globalThis.location.assign(url), onClose = () => {}, root = document.body }) {
  const t = (k) => dict[k] ?? k;
  const opts = { planksMax };
  let values = lireDebug(search, opts);
  const wrap = el('div', ['panel-wrap', 'options-wrap', 'debug-wrap'], { 'data-block': 'E2-13', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'debug-title' });
  wrap.id = 'debug-panel';
  wrap.hidden = true;
  const panel = el('div', ['panel', 'panel-options', 'panel-debug']);
  wrap.append(panel);

  const head = el('div', ['options-head']);
  const top = el('div', ['panel-head']);
  const title = el('h2', ['panel-title'], { id: 'debug-title' });
  title.textContent = t('game.debug.title');
  const close = el('button', ['button', 'button-quiet', 'panel-icon'], { type: 'button', id: 'debug-close', 'aria-label': t('game.debug.close') });
  close.append(icon('M3.5 3.5l9 9M12.5 3.5l-9 9'));
  top.append(title, close);
  head.append(top);

  const scroll = el('div', ['options-scroll'], { role: 'region', tabindex: '0', 'aria-label': t('game.debug.scroll'), id: 'debug-scroll' });
  const sections = {};
  // Retours du propriétaire (lot 5l-E) : Mesure en premier (le plus utile) ; l'encadré du mode essai sur la ligne du titre « Partie » (une ligne de gagnée).
  for (const [id, key] of [['mesure', 'game.debug.section.mesure'], ['partie', 'game.debug.section.partie']]) {
    const sec = el('section', ['options-section'], { 'aria-labelledby': `debug-section-${id}` });
    const headLine = el('div', ['debug-section-head']);
    const h = el('h3', ['options-section-title'], { id: `debug-section-${id}` });
    h.textContent = t(key);
    headLine.append(h);
    sec.append(headLine);
    scroll.append(sec);
    sections[id] = sec;
  }
  const note = el('p', ['debug-note'], { id: 'debug-note' });
  note.textContent = t('game.debug.trial');
  sections.partie.querySelector('.debug-section-head').append(note);
  sections.partie.setAttribute('aria-describedby', note.id);

  const syncers = [];
  const row = (section, id, labelKey, control, hintKey = null) => {
    const r = el('div', ['options-row'], { role: 'group', 'aria-labelledby': `debug-label-${id}`, 'data-debug': id });
    const label = el('p', ['options-label']);
    const name = el('span', [], { id: `debug-label-${id}` });
    name.textContent = t(labelKey);
    label.append(name);
    if (hintKey) {
      const hint = el('span', ['options-mark'], { id: `debug-hint-${id}` });
      hint.textContent = t(hintKey);
      label.append(hint);
      r.setAttribute('aria-describedby', hint.id);
    }
    r.append(label, control);
    section.append(r);
    return r;
  };
  // Compteur −/+ avec saisie numérique ; get() et set(n) lisent et écrivent la valeur ; empty : champ vide permis (valeur null).
  const counter = (id, { min, max, step = 1, get, set, empty = false }) => {
    const box = el('div', ['debug-counter'], { 'data-counter': id });
    const minus = el('button', ['button', 'button-quiet', 'debug-step'], { type: 'button', id: `debug-${id}-moins`, 'aria-label': `${t('game.debug.minus')} : ${t(`game.debug.${id.startsWith('stat-') ? `stat.${id.slice(5)}` : id}`)}` });
    minus.textContent = '−';
    const input = el('input', ['debug-input'], { type: 'number', id: `debug-${id}`, inputmode: 'numeric', min: String(min), max: String(max), step: '1', 'aria-labelledby': `debug-label-${id}` });
    const plus = el('button', ['button', 'button-quiet', 'debug-step'], { type: 'button', id: `debug-${id}-plus`, 'aria-label': `${t('game.debug.plus')} : ${t(`game.debug.${id.startsWith('stat-') ? `stat.${id.slice(5)}` : id}`)}` });
    plus.textContent = '+';
    box.append(minus, input, plus);
    const sync = () => {
      const v = get();
      input.value = v === null ? '' : String(v);
      minus.disabled = v === null ? true : v <= min;
      plus.disabled = v !== null && v >= max;
    };
    const apply = (n) => {
      set(n);
      refresh();
    };
    minus.addEventListener('click', () => apply(Math.max(min, (get() ?? min) - step)));
    plus.addEventListener('click', () => apply(Math.min(max, (get() ?? (empty ? min - step : min)) + step)));
    input.addEventListener('change', () => {
      const raw = input.value.trim();
      apply(raw === '' && empty ? null : int(raw, min, max, get() ?? (empty ? null : min)));
    });
    syncers.push(sync);
    return box;
  };
  // Boutons exclusifs (aria-pressed) ; choices : [valeur, clé du libellé].
  const choice = (id, choices, get, set) => {
    const box = el('div', ['options-values']);
    const buttons = choices.map(([value, key]) => {
      const b = el('button', ['button', 'button-quiet', 'options-value'], { type: 'button', 'aria-pressed': 'false', 'data-value': String(value), id: `debug-${id}-${value}` });
      b.textContent = t(key);
      b.addEventListener('click', () => {
        set(value);
        refresh();
      });
      box.append(b);
      return b;
    });
    syncers.push(() => {
      for (const b of buttons) b.setAttribute('aria-pressed', String(b.dataset.value === String(get())));
    });
    return box;
  };
  const yesNo = [[false, 'game.debug.non'], [true, 'game.debug.oui']];

  row(sections.partie, 'wave', 'game.debug.wave', counter('wave', { min: WAVE.min, max: WAVE.max, get: () => values.wave, set: (n) => { values.wave = n; } }));
  row(sections.partie, 'money', 'game.debug.money', counter('money', { min: MONEY.min, max: MONEY.max, step: MONEY.step, empty: true, get: () => values.money, set: (n) => { values.money = n; } }), 'game.debug.money.hint');
  row(sections.partie, 'all', 'game.debug.all', counter('all', { min: 0, max: NIVEAU_MAX, get: () => values.all, set: (n) => {
    values.all = n;
    for (const [id, , max] of STATS) values.levels[id] = Math.min(max, n);
  } }));
  for (const [id, key, max] of STATS) {
    row(sections.partie, `stat-${id}`, key, counter(`stat-${id}`, { min: 0, max, get: () => values.levels[id], set: (n) => { values.levels[id] = n; } }));
  }
  row(sections.partie, 'planks', 'game.debug.planks', counter('planks', { min: 0, max: planksMax, get: () => values.planks, set: (n) => { values.planks = n; } }));
  row(sections.partie, 'floor', 'game.debug.floor', choice('floor', [['rdc', 'game.debug.floor.rdc'], ['etage', 'game.debug.floor.etage']], () => values.floor, (v) => { values.floor = v; }));
  row(sections.partie, 'map', 'game.debug.map', choice('map', [['batiment', 'game.debug.map.batiment'], ['salle', 'game.debug.map.salle']], () => values.map, (v) => { values.map = v; }));
  row(sections.partie, 'nospawn', 'game.debug.nospawn', choice('nospawn', yesNo, () => values.nospawn, (v) => { values.nospawn = v; }));
  row(sections.partie, 'endless', 'game.debug.endless', choice('endless', yesNo, () => values.endless, (v) => { values.endless = v; }));
  row(sections.partie, 'fin', 'game.debug.fin', choice('fin', yesNo, () => values.fin, (v) => { values.fin = v; }), 'game.debug.fin.hint');
  row(sections.mesure, 'perf', 'game.debug.perf', choice('perf', [[false, 'game.debug.coupe'], [true, 'game.debug.active']], () => values.perf, (v) => { values.perf = v; }));
  row(sections.mesure, 'cap', 'game.debug.cap', choice('cap', [[null, 'game.debug.cap.aucun'], ['30', 'game.debug.cap.30'], ['45', 'game.debug.cap.45'], ['60', 'game.debug.cap.60']], () => values.cap, (v) => { values.cap = v; }));
  // Lot 8i : lien vers la page d'écoute des sons du menu (page technique ; quitter la partie : la page est rechargée au retour).
  const lienSons = el('div', ['options-values']);
  const aSons = el('a', ['button', 'button-quiet', 'options-value'], { href: 'atelier-sons-menu.html', id: 'debug-sons-menu' });
  aSons.textContent = t('game.debug.sonsMenu.lien');
  lienSons.append(aSons);
  row(sections.mesure, 'sons-menu', 'game.debug.sonsMenu', lienSons);

  // Pied : adresse obtenue, actions et confirmation.
  const foot = el('div', ['options-foot']);
  const preview = el('p', ['panel-note', 'debug-url'], { id: 'debug-url' });
  const actions = el('div', ['options-reload'], { id: 'debug-actions' });
  const applyBtn = el('button', ['button', 'button-main'], { type: 'button', id: 'debug-apply' });
  applyBtn.textContent = t('game.debug.apply');
  const normalBtn = el('button', ['button', 'button-quiet'], { type: 'button', id: 'debug-normal' });
  normalBtn.textContent = t('game.debug.normal');
  actions.append(applyBtn, normalBtn);
  const confirm = el('div', ['options-reload'], { role: 'alertdialog', 'aria-labelledby': 'debug-confirm-text', id: 'debug-confirm' });
  const confirmText = el('p', ['options-reload-text'], { id: 'debug-confirm-text' });
  confirmText.textContent = t('game.debug.confirm');
  const okBtn = el('button', ['button', 'button-main'], { type: 'button', id: 'debug-confirm-ok' });
  okBtn.textContent = t('game.debug.confirm.ok');
  const cancelBtn = el('button', ['button', 'button-quiet'], { type: 'button', id: 'debug-confirm-cancel' });
  cancelBtn.textContent = t('game.debug.confirm.cancel');
  confirm.append(confirmText, okBtn, cancelBtn);
  confirm.hidden = true;
  foot.append(preview, actions, confirm);
  panel.append(head, scroll, foot);
  root.append(wrap);

  let pending = null; // adresse à charger après confirmation
  let returnTo = applyBtn;
  function refresh() {
    for (const s of syncers) s();
    preview.textContent = `${t('game.debug.url')} ${adresseDebug(search, values, opts)}`;
  }
  const ask = (url, from) => {
    pending = url;
    returnTo = from;
    actions.hidden = true;
    confirm.hidden = false;
    cancelBtn.focus();
  };
  const cancel = () => {
    pending = null;
    confirm.hidden = true;
    actions.hidden = false;
    returnTo.focus();
  };
  applyBtn.addEventListener('click', () => ask(adresseDebug(search, values, opts), applyBtn));
  normalBtn.addEventListener('click', () => ask(adresseDebug(search, null, opts), normalBtn));
  cancelBtn.addEventListener('click', cancel);
  okBtn.addEventListener('click', () => {
    if (pending !== null) navigate(pending);
  });
  close.addEventListener('click', () => onClose());

  wrap.addEventListener('keydown', (event) => {
    // Saisie : P, F et M ne commandent pas la partie (pause, plein écran, son) depuis un champ ; Échap passe (fermeture).
    if (event.target instanceof HTMLInputElement && event.code !== 'Escape' && event.code !== 'Tab') event.stopPropagation();
    if (event.code !== 'Tab') return;
    const list = [...wrap.querySelectorAll('button, input, [tabindex="0"]')].filter((n) => !n.disabled && !n.closest('[hidden]'));
    if (!list.length) return;
    const i = list.indexOf(document.activeElement);
    const next = event.shiftKey ? (i <= 0 ? list.length - 1 : i - 1) : i === list.length - 1 ? 0 : i + 1;
    if (i === -1 || (event.shiftKey ? i === 0 : i === list.length - 1)) {
      event.preventDefault();
      list[next].focus();
    }
  });

  return {
    element: wrap,
    get isOpen() {
      return !wrap.hidden;
    },
    open() {
      values = lireDebug(search, opts);
      pending = null;
      confirm.hidden = true;
      actions.hidden = false;
      refresh();
      wrap.hidden = false;
      scroll.scrollTop = 0;
      close.focus();
    },
    close() {
      wrap.hidden = true;
    },
    // Échap : ferme d'abord la confirmation ; renvoie vrai si elle l'a consommé.
    escape() {
      if (confirm.hidden) return false;
      cancel();
      return true;
    },
    values: () => structuredClone(values),
  };
}
