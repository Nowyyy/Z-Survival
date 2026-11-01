// Atelier de l'interface (lot 3k) : une vue d'aperçu = une scène à la taille réelle du préréglage (mise à l'échelle par transform), avec en fond le vrai
// jeu dans un cadre de même origine (ou un sol généré) et, pour A, B, C, l'interface de la direction par-dessus. « Actuel » = le jeu avec sa propre
// interface, piloté par les hooks existants. Aucune donnée n'est stockée ; rien n'est modifié dans les fichiers du jeu.
import { evaluate, compareBoxes } from '../core/ui-measure.js';
import { mockState } from '../core/ui-mock.js';
import { actuelItems, actuelUrl, ACTUEL_HUD_NAMES, driveActuel, freeze, hideGameInterface, injectSafeArea } from './actuel.js';
import { animationsUnder, boxesOf, collect, domCount } from './measure-dom.js';
import { renderGameScreen } from './render.js';

const BG_URL = 'jeu.html?test=1&nospawn=1&seed=1';
const READY_MS = 60_000;
export const MODAL_SCREENS = ['pause', 'fin-mort', 'fin-monde'];
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// Paramètres d'état adaptés à l'écran : fin de partie, à terre, pause.
export function paramsForScreen(screen, params) {
  const p = { ...params };
  if (screen === 'fin-mort') p.end = 'death';
  if (screen === 'fin-monde') p.end = 'world';
  if (screen === 'a-terre' && (p.down === undefined || p.down === 'none')) {
    p.down = 'down';
    p.downSeconds = p.downSeconds ?? 5;
  }
  if (screen === 'pause') p.paused = true;
  return p;
}

// Attend que le jeu du cadre tourne (temps de jeu > 0,05 s) ; sinon raison de l'échec (WebGL absent, délai dépassé).
async function gameReady(frame, token, isCurrent) {
  const start = performance.now();
  while (performance.now() - start < READY_MS) {
    if (!isCurrent(token)) return { ok: false, reason: 'remplacé' };
    try {
      const win = frame.contentWindow;
      const doc = frame.contentDocument;
      if (doc?.getElementById('game-error') && !doc.getElementById('game-error').hidden) return { ok: false, reason: doc.getElementById('game-error').textContent || 'WebGL' };
      if ((win?.__zs?.getState()?.time ?? 0) > 0.05) return { ok: true };
    } catch {
      return { ok: false, reason: 'cadre inaccessible' };
    }
    await wait(120);
  }
  return { ok: false, reason: 'délai dépassé' };
}

export function createView(els, ctx) {
  const { stage, frame, floor, overlay, guide, viewport } = els;
  let opts = null;
  let frameKey = '';
  let token = 0;
  let frameState = { status: 'none', notes: [], available: true };
  const listeners = new Set();
  const notify = () => listeners.forEach((fn) => fn(frameState));

  function setVars(o) {
    const s = o.safe;
    const mv = ctx.cfg.macroValues;
    const vars = {
      '--ui3k-safe-top': `${s.top}px`, '--ui3k-safe-right': `${s.right}px`, '--ui3k-safe-bottom': `${s.bottom}px`, '--ui3k-safe-left': `${s.left}px`,
      '--ui3k-sys': String(o.textScale / 100),
      '--ui3k-scale': String(mv.texte[o.macros.texte] ?? 1.125),
      '--ui3k-alpha': String(mv.fondAlpha[o.macros.fond] ?? 0.78),
      '--ui3k-o': String(mv.contourPx[o.macros.contour] ?? 0),
      '--ui3k-gap': o.macros.densite === 'aeree' ? '10px' : '4px',
    };
    for (const [k, v] of Object.entries(vars)) stage.style.setProperty(k, v);
    stage.style.width = `${o.size.width}px`;
    stage.style.height = `${o.size.height}px`;
    stage.style.transform = `scale(${o.scale})`;
    viewport.style.width = `${Math.round(o.size.width * o.scale)}px`;
    viewport.style.height = `${Math.round(o.size.height * o.scale)}px`;
    viewport.dataset.cvd = o.cvd ?? 'aucun';
    guide.hidden = !o.guide;
  }

  function renderOverlay(o, state) {
    overlay.className = o.direction === 'actuel' ? 'ui3k-screen is-empty' : `ui3k-screen ui3k-dir-${o.direction.toLowerCase()}`;
    overlay.dataset.direction = o.direction;
    overlay.dataset.screen = o.screen;
    if (o.direction === 'actuel') {
      overlay.replaceChildren();
      return;
    }
    const html = ctx.renderScreen ? ctx.renderScreen(o, state) : null;
    overlay.innerHTML = html ?? renderGameScreen(o.screen, state, o.direction, o.macros, ctx.t, { worldBonusText: ctx.worldBonusText, help: o.help });
  }

  // Charge (ou garde) le cadre du jeu ; « Actuel » le recharge à chaque changement d'état (les hooks ne vont que dans un sens).
  async function syncFrame(o, state) {
    const offGame = !ctx.cfg.gameScreens.includes(o.screen);
    const wantGame = o.background === 'jeu' && !(offGame && o.direction !== 'actuel');
    if (o.direction === 'actuel' && offGame) {
      frame.hidden = true;
      floor.hidden = false;
      frameKey = '';
      frameState = { status: 'unavailable', notes: [ctx.t('atelier.frame.offGame')], available: false };
      return;
    }
    if (!wantGame && o.direction !== 'actuel') {
      frame.hidden = true;
      floor.hidden = false;
      frameKey = '';
      frameState = { status: 'floor', notes: [], available: true };
      return;
    }
    const key = o.direction === 'actuel'
      ? `actuel|${o.size.id}|${o.screen}|${JSON.stringify(o.params)}|${JSON.stringify(o.safe)}|${o.textScale}`
      : `fond|${o.size.id}`;
    if (key === frameKey && frameState.status !== 'error') {
      if (o.direction !== 'actuel') hideGameInterface(frame.contentDocument);
      return;
    }
    frameKey = key;
    const mine = ++token;
    frameState = { status: 'loading', notes: [], available: true };
    notify();
    floor.hidden = true;
    frame.hidden = false;
    const url = o.direction === 'actuel' ? actuelUrl(state) : BG_URL;
    await new Promise((resolve) => {
      frame.addEventListener('load', resolve, { once: true });
      frame.src = url;
    });
    const ready = await gameReady(frame, mine, (t) => t === token);
    if (mine !== token) return;
    if (!ready.ok) {
      frame.hidden = true;
      floor.hidden = false;
      frameState = { status: 'error', notes: [ctx.t('atelier.frame.fallback', { reason: ready.reason })], available: o.direction !== 'actuel' };
      return;
    }
    const doc = frame.contentDocument;
    const win = frame.contentWindow;
    if (o.direction === 'actuel') {
      injectSafeArea(doc, o.safe);
      if (o.textScale !== 100) {
        const style = doc.createElement('style');
        style.id = 'ui3k-text';
        style.textContent = `html { font-size: ${o.textScale}% !important; }`;
        doc.head.append(style);
      }
      const drive = driveActuel(win, o.screen, state);
      await wait(60);
      frameState = { status: drive.available ? 'ready' : 'unavailable', notes: drive.notes, available: drive.available };
    } else {
      hideGameInterface(doc);
      await wait(400); // quelques images rendues, puis la boucle est figée (le fond ne coûte plus rien)
      freeze(win);
      frameState = { status: 'ready', notes: [], available: true };
    }
  }

  const view = {
    get options() {
      return opts;
    },
    get frameState() {
      return frameState;
    },
    onFrame(fn) {
      listeners.add(fn);
    },
    // o = { size, safe, screen, direction, params, macros, background, textScale, cvd, guide, scale }
    async update(o) {
      opts = o;
      const state = mockState(paramsForScreen(o.screen, o.params), ctx.cfg);
      setVars(o);
      renderOverlay(o, state);
      await syncFrame(o, state);
      notify();
      return state;
    },
    // Relevé et verdict de la vue courante.
    measure() {
      const o = opts;
      const viewportSize = { width: o.size.width, height: o.size.height };
      const modal = MODAL_SCREENS.includes(o.screen) || ['menu', 'boutique', 'reglages', 'classement'].includes(o.screen);
      if (o.direction === 'actuel') {
        if (!frameState.available || frame.hidden) return { available: false, notes: frameState.notes, verdict: null };
        const doc = frame.contentDocument;
        const m = collect(doc, { root: doc.body, viewport: viewportSize, safe: o.safe, modal, hudNames: ACTUEL_HUD_NAMES, items: actuelItems(o.screen) });
        return { available: true, notes: frameState.notes, measure: m, verdict: evaluate(m, ctx.backgrounds, ctx.cfg.rules), dom: domCount(doc.getElementById('game-root')) };
      }
      const scope = overlay.querySelector('.p-modal, .p-page') ?? overlay;
      const items = [...scope.querySelectorAll('[data-ui]')].map((el) => ({
        name: el.dataset.ui, element: el, role: el.dataset.role, target: el.dataset.role === 'button', parent: el.dataset.parent ?? null,
        noText: 'notext' in el.dataset, checkOverflow: el.dataset.role === 'hud' || el.dataset.role === 'panel',
      }));
      const hudNames = items.filter((i) => i.role === 'hud' || (i.role === 'button' && !modal)).map((i) => i.name);
      const m = collect(document, { root: overlay, origin: stage, scale: o.scale, viewport: viewportSize, safe: o.safe, modal, hudNames, items });
      m.animations = animationsUnder(overlay);
      m.reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
      const lines = m.elements.reduce((n, e) => n + e.texts.reduce((k, t) => k + t.lines, 0), 0);
      return { available: true, notes: [], measure: m, verdict: evaluate(m, ctx.backgrounds, ctx.cfg.rules), dom: domCount(overlay) - 1, lines };
    },
    // Stabilité : parcourt les valeurs (vie, argent, vague…) et compare toutes les boîtes [data-ui] au premier relevé (0 px attendu).
    stability(sweeps) {
      const o = opts;
      if (o.direction === 'actuel') return null;
      const snap = () => boxesOf(document, [...overlay.querySelectorAll('[data-ui]')].map((el) => ({ name: el.dataset.ui, element: el })), stage, o.scale);
      const base = mockState(paramsForScreen(o.screen, o.params), ctx.cfg);
      renderOverlay(o, base);
      const first = snap();
      let max = 0;
      const moved = new Set();
      for (const [field, values] of Object.entries(sweeps)) {
        for (const v of values) {
          renderOverlay(o, mockState(paramsForScreen(o.screen, { ...o.params, [field]: v }), ctx.cfg));
          const d = compareBoxes(first, snap(), 0.5);
          max = Math.max(max, d.max);
          d.moved.forEach((x) => moved.add(`${x.name} (${field}=${v})`));
        }
      }
      renderOverlay(o, base);
      return { max, moved: [...moved] };
    },
  };
  return view;
}
