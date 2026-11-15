// Panneau de ?perf=1 (lot 5b), importé seulement avec ce paramètre : en bas à gauche, sous la colonne gauche du HUD (jamais dessus), replié par
// défaut (une ligne : médiane et p95 des 5 dernières secondes). Déplié : le rapport en texte (14 px au moins), « Copier le rapport » (presse-papiers ;
// repli : le texte est sélectionné pour une copie à la main), « Remettre à zéro », « Replier ». Rafraîchi deux fois par seconde, sans filter ni
// backdrop-filter ; couleurs des jetons (css/tokens.css) ; aucun réseau, aucun stockage.
import { formatReport, fr } from '../core/perf-stats.js';

const REFRESH_MS = 500;
// Clés de fr.json écrites en entier (le test des clés orphelines les cherche telles quelles).
export const PANEL_TEXTS = { title: 'game.perf.title', short: 'game.perf.short', copy: 'game.perf.copy', reset: 'game.perf.reset', copied: 'game.perf.copied', selected: 'game.perf.selected', cleared: 'game.perf.cleared' };
export const REPORT_TEXTS = {
  title: 'game.perf.report.title',
  system: 'game.perf.report.system',
  screen: 'game.perf.report.screen',
  uaOs: 'game.perf.report.uaOs',
  ios60: 'game.perf.report.ios60',
  preset: 'game.perf.report.preset',
  params: 'game.perf.report.params',
  window: 'game.perf.report.window',
  session: 'game.perf.report.session',
  frames: 'game.perf.report.frames',
  fps: 'game.perf.report.fps',
  median: 'game.perf.report.median',
  work: 'game.perf.report.work',
  render: 'game.perf.report.render',
  calls: 'game.perf.report.calls',
  triangles: 'game.perf.report.triangles',
  programs: 'game.perf.report.programs',
  geometries: 'game.perf.report.geometries',
  textures: 'game.perf.report.textures',
  first: 'game.perf.report.first',
  workShort: 'game.perf.report.workShort',
  next: 'game.perf.report.next',
  longtasks: 'game.perf.report.longtasks',
  unsupported: 'game.perf.report.unsupported',
  hitches: 'game.perf.report.hitches',
  at: 'game.perf.report.at',
  none: 'game.perf.report.none',
  memory: 'game.perf.report.memory',
  unavailable: 'game.perf.report.unavailable',
  cap: 'game.perf.report.cap',
  every: 'game.perf.report.every',
  misaligned: 'game.perf.report.misaligned',
  nocap: 'game.perf.report.nocap',
};
export const EVENT_TEXTS = {
  tir: 'game.perf.event.tir', sang: 'game.perf.event.sang', feu: 'game.perf.event.feu', manche: 'game.perf.event.manche', pause: 'game.perf.event.pause',
  'zombie-marcheur': 'game.perf.event.zombie-marcheur', 'zombie-petit': 'game.perf.event.zombie-petit', 'zombie-voute': 'game.perf.event.zombie-voute', 'zombie-grand': 'game.perf.event.zombie-grand',
};
const BUTTON = 'min-height:44px;min-width:44px;padding:0 12px;border:2px solid var(--color-border);border-radius:0;background:var(--color-surface-raised);color:var(--color-text);font:700 14px/1.2 var(--font-sans)';

// read() : état du profileur (avec preset, params, cap) ; dict : textes (game.perf.*).
export function createPerfPanel({ read, reset, dict, root = document.body }) {
  const t = (k) => dict[PANEL_TEXTS[k]] ?? k;
  const labels = Object.fromEntries(Object.entries(REPORT_TEXTS).map(([k, key]) => [k, dict[key]]).filter(([, v]) => typeof v === 'string'));
  const eventLabel = (name) => dict[EVENT_TEXTS[name]] ?? name.replace(/^zombie-/, '');
  const box = document.createElement('section');
  box.id = 'perf-panel';
  box.setAttribute('aria-label', t('title'));
  // Retour du propriétaire (lot 5k) : sous les panneaux de la pause et de fin (.panel-wrap, z-index 10) et sous les Options (11), au-dessus du HUD ;
  // inerte (ni clic ni focus) tant que la pause est ouverte (setPaused).
  box.style.cssText = 'position:fixed;left:calc(var(--game-margin, 16px) + var(--safe-left, 0px));bottom:calc(var(--game-margin, 16px) + var(--safe-bottom, 0px));z-index:9;'
    + 'max-width:min(62vw, 34em);display:flex;flex-direction:column-reverse;gap:6px;align-items:flex-start;font:400 14px/1.3 var(--font-sans);color:var(--color-text)';
  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.id = 'perf-toggle';
  toggle.setAttribute('aria-expanded', 'false');
  toggle.setAttribute('aria-controls', 'perf-body');
  toggle.style.cssText = BUTTON;
  const body = document.createElement('div');
  body.id = 'perf-body';
  body.hidden = true;
  body.style.cssText = 'box-sizing:border-box;max-height:40vh;display:flex;flex-direction:column;overflow:hidden;padding:8px;border:2px solid var(--color-border);background:var(--color-bg)';
  const text = document.createElement('pre');
  text.id = 'perf-report';
  text.tabIndex = 0;
  text.style.cssText = 'flex:1 1 auto;min-height:2.7em;overflow:auto;margin:0 0 8px;white-space:pre-wrap;word-break:break-word;font:400 14px/1.35 var(--font-sans);color:var(--color-text);user-select:text;-webkit-user-select:text';
  const row = document.createElement('div');
  row.style.cssText = 'flex:none;display:flex;flex-wrap:wrap;gap:6px';
  const copy = document.createElement('button');
  copy.type = 'button';
  copy.id = 'perf-copy';
  copy.textContent = t('copy');
  copy.style.cssText = BUTTON;
  const clear = document.createElement('button');
  clear.type = 'button';
  clear.id = 'perf-reset';
  clear.textContent = t('reset');
  clear.style.cssText = BUTTON;
  const status = document.createElement('p');
  status.id = 'perf-status';
  status.setAttribute('role', 'status');
  status.style.cssText = 'flex:none;margin:6px 0 0;min-height:1.3em;font:400 14px/1.3 var(--font-sans);color:var(--color-text)';
  row.append(copy, clear);
  body.append(text, row, status);
  box.append(toggle, body);
  root.append(box);

  let report = '';
  // Le panneau déplié s'arrête sous le bas des colonnes du HUD (8 px d'écart) : il ne les chevauche jamais.
  const fit = () => {
    const bottom = Math.max(0, ...[...document.querySelectorAll('#hud .hud-col')].map((c) => c.getBoundingClientRect().bottom));
    const room = box.getBoundingClientRect().bottom - toggle.offsetHeight - 6 - bottom - 8;
    body.style.maxHeight = `${Math.max(44, Math.floor(room))}px`;
  };
  const render = () => {
    const s = read();
    const named = { ...s, hitches: (s.hitches ?? []).map((h) => ({ ...h, name: eventLabel(h.name) })) };
    report = formatReport(named, labels);
    const w = s.window ?? {};
    toggle.textContent = `${t('short')} ${fr(w.fps, 0)} i/s${s.refresh ? ` / ${s.refresh} Hz` : ''} · p95 ${fr(w.p95)} ms`; // lot 5b-F : images obtenues / cadence de la page
    // Texte sélectionné par le repli de la copie : il n'est pas réécrit tant que la sélection y reste.
    const sel = getSelection();
    const selected = sel && !sel.isCollapsed && sel.rangeCount > 0 && text.contains(sel.getRangeAt(0).commonAncestorContainer);
    if (!body.hidden && !selected) text.textContent = report;
    if (!body.hidden) fit();
  };
  const select = () => {
    const range = document.createRange();
    range.selectNodeContents(text);
    const sel = getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
  };
  toggle.addEventListener('click', () => {
    body.hidden = !body.hidden;
    toggle.setAttribute('aria-expanded', String(!body.hidden));
    render();
  });
  copy.addEventListener('click', async () => {
    render();
    text.textContent = report;
    try {
      await navigator.clipboard.writeText(report);
      status.textContent = t('copied');
    } catch {
      select();
      status.textContent = t('selected');
    }
  });
  clear.addEventListener('click', () => {
    reset();
    status.textContent = t('cleared');
    render();
  });
  // Les gestes sur le panneau ne doivent pas viser ni déplacer le joueur (les sticks écoutent la page).
  for (const type of ['pointerdown', 'touchstart']) box.addEventListener(type, (e) => e.stopPropagation(), { passive: true });
  render();
  const timer = setInterval(render, REFRESH_MS);
  return {
    // Pause ouverte : le panneau reste visible sous la pause mais ne reçoit ni clic ni focus.
    setPaused(paused) {
      box.inert = paused === true;
    },
    report: () => {
      render();
      return report;
    },
    dispose() {
      clearInterval(timer);
      box.remove();
    },
  };
}
