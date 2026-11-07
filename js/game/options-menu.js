// Écran Options de la pause (lot 5j, bloc E2-12) : chargé par import dynamique à la première ouverture (aucun coût tant qu'il reste fermé). Panneau du
// même style que la pause (direction B) : en tête, le titre, « Retour » et les préréglages (Auto, Faible, Moyen, Élevé, Perso ; en Auto : « Auto (Moyen) ») ;
// puis une région qui défile à l'intérieur du panneau (sections Image, Carte, Personnages : une ligne par option, ses valeurs en boutons exclusifs,
// marque d'état dans la ligne du libellé : « recharge » pour les options appliquées au chargement, « au rechargement » quand une valeur attend le
// rechargement, « imposé par l'adresse », « coupé (mouvement réduit) » ; lot 5j-D : jamais de ligne ajoutée, la mise en page ne bouge pas) ; en pied, la barre « Recharger maintenant » (confirmation « Cette partie sera
// perdue ») tant qu'une option « load » diffère du jeu en cours. Une option imposée par l'adresse est grisée (« Imposé par l'adresse ») ; ?gfx= verrouille
// tout. Choix marqué par aria-pressed, un soulignement et une bordure (jamais la couleur seule). Focus piégé dans le panneau ; Échap (input.js →
// ui.togglePause) et « Retour » reviennent à la pause. Le DOM est construit une fois ; les changements ne mettent à jour que des attributs et des textes.
import { fmt } from './texts.js';

const PRESETS = ['auto', 'faible', 'moyen', 'eleve', 'perso'];
const PRESET_TEXTS = { auto: 'game.gfx.auto', faible: 'game.gfx.faible', moyen: 'game.gfx.moyen', eleve: 'game.gfx.eleve', perso: 'game.gfx.perso' };
const ERRORS = { verrouille: 'game.gfx.error.verrouille', echec: 'game.gfx.error.echec', indisponible: 'game.gfx.error.indisponible' };

// Élément avec ses classes (une chaîne par classe : la feuille game-ui.css ne vise que des classes posées ici ou dans jeu.html).
function el(tag, classes = [], attrs = {}) {
  const n = document.createElement(tag);
  if (classes.length) n.classList.add(...classes);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  return n;
}

// graphics : contrôleur de graphics-apply.js ; vhs : couche VHS (mouvement réduit) ; onClose() : retour à la pause.
export function createOptionsMenu({ dict, graphics, vhs = null, onClose = () => {}, root = document.body }) {
  const t = (k) => dict[k] ?? k;
  const data = graphics.options();
  const wrap = el('div', ['panel-wrap', 'options-wrap'], { 'data-block': 'E2-12', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'options-title' });
  wrap.id = 'options-panel';
  wrap.hidden = true;
  const panel = el('div', ['panel', 'panel-options']);
  wrap.append(panel);

  // En-tête (toujours visible) : titre, préréglage en cours, « Retour » ; boutons des préréglages.
  const head = el('div', ['options-head']);
  const top = el('div', ['panel-head']);
  const title = el('h2', ['panel-title'], { id: 'options-title' });
  title.textContent = t('game.options.title');
  // Lot 5j-D (retour du propriétaire) : « Retour » avec une flèche (décorative) et un contour clair.
  const back = el('button', ['button', 'button-quiet', 'options-back'], { type: 'button', id: 'options-back' });
  const arrow = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  arrow.setAttribute('viewBox', '0 0 16 16');
  arrow.setAttribute('aria-hidden', 'true');
  arrow.setAttribute('focusable', 'false');
  arrow.classList.add('options-back-icon');
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', 'M10 3 5 8l5 5');
  arrow.append(path);
  const backText = el('span');
  backText.textContent = t('game.options.back');
  back.append(arrow, backText);
  top.append(title, back);
  const presetGroup = el('div', ['options-presets'], { role: 'group', 'aria-labelledby': 'options-presets-label' });
  const presetLine = el('p', ['panel-line', 'options-presets-line']);
  const presetLabel = el('span', [], { id: 'options-presets-label' });
  presetLabel.textContent = t('game.options.presets');
  const presetCurrent = el('span', ['options-current'], { id: 'options-current' });
  presetLine.append(presetLabel, presetCurrent);
  const presetButtons = el('div', ['options-choices']);
  const presetEls = PRESETS.map((id) => {
    const b = el('button', ['button', 'button-quiet', 'options-choice'], { type: 'button', 'aria-pressed': 'false', 'data-preset': id, id: `options-preset-${id}` });
    b.textContent = t(PRESET_TEXTS[id]);
    b.addEventListener('click', () => act(graphics.choosePreset(id)));
    presetButtons.append(b);
    return b;
  });
  presetGroup.append(presetLine, presetButtons);
  head.append(top, presetGroup);

  // Région qui défile : sections et lignes.
  const scroll = el('div', ['options-scroll'], { role: 'region', tabindex: '0', 'aria-label': t('game.options.scroll'), id: 'options-scroll' });
  const rows = new Map();
  for (const section of data.sections) {
    const sec = el('section', ['options-section'], { 'aria-labelledby': `options-section-${section}` });
    const h = el('h3', ['options-section-title'], { id: `options-section-${section}` });
    h.textContent = t(data.sectionTexts[section]);
    sec.append(h);
    for (const o of data.options.filter((x) => x.section === section)) {
      const row = el('div', ['options-row'], { role: 'group', 'aria-labelledby': `options-label-${o.id}`, 'data-option': o.id, 'data-group': o.group });
      const label = el('p', ['options-label']);
      const name = el('span', [], { id: `options-label-${o.id}` });
      name.textContent = t(o.texte);
      const mark = el('span', ['options-mark'], { id: `options-mark-${o.id}` });
      mark.hidden = true;
      label.append(name, mark);
      const values = el('div', ['options-values']);
      const buttons = o.valeurs.map((v) => {
        const b = el('button', ['button', 'button-quiet', 'options-value'], { type: 'button', 'aria-pressed': 'false', 'data-value': v.id });
        b.textContent = t(v.texte);
        b.addEventListener('click', () => act(graphics.setOption(o.id, v.id)));
        values.append(b);
        return b;
      });
      row.append(label, values);
      sec.append(row);
      rows.set(o.id, { row, buttons, mark, option: o });
    }
    scroll.append(sec);
  }

  // Pied : état de l'enregistrement, barre de rechargement et sa confirmation.
  const foot = el('div', ['options-foot']);
  const status = el('p', ['panel-note', 'options-status'], { role: 'status', id: 'options-status' });
  const bar = el('div', ['options-reload'], { id: 'options-reload' });
  const barText = el('p', ['options-reload-text']);
  barText.textContent = t('game.options.reload.bar');
  const reloadBtn = el('button', ['button', 'button-main'], { type: 'button', id: 'options-reload-now' });
  reloadBtn.textContent = t('game.options.reload.now');
  bar.append(barText, reloadBtn);
  const confirm = el('div', ['options-reload'], { role: 'alertdialog', 'aria-labelledby': 'options-confirm-text', id: 'options-confirm' });
  const confirmText = el('p', ['options-reload-text'], { id: 'options-confirm-text' });
  confirmText.textContent = t('game.options.reload.confirm');
  const okBtn = el('button', ['button', 'button-main'], { type: 'button', id: 'options-confirm-ok' });
  okBtn.textContent = t('game.options.reload.ok');
  const cancelBtn = el('button', ['button', 'button-quiet'], { type: 'button', id: 'options-confirm-cancel' });
  cancelBtn.textContent = t('game.options.reload.cancel');
  confirm.append(confirmText, okBtn, cancelBtn);
  bar.hidden = true;
  confirm.hidden = true;
  foot.append(status, bar, confirm);
  panel.append(head, scroll, foot);
  root.append(wrap);

  reloadBtn.addEventListener('click', () => {
    bar.hidden = true;
    confirm.hidden = false;
    cancelBtn.focus();
  });
  cancelBtn.addEventListener('click', () => {
    confirm.hidden = true;
    sync();
    reloadBtn.focus();
  });
  okBtn.addEventListener('click', () => {
    graphics.reloadNow();
    confirm.hidden = true;
    sync();
  });
  back.addEventListener('click', () => onClose());

  // Focus piégé : Tab et Maj+Tab tournent dans le panneau.
  wrap.addEventListener('keydown', (event) => {
    if (event.code !== 'Tab') return;
    const list = [...wrap.querySelectorAll('button, [tabindex="0"]')].filter((n) => !n.disabled && !n.closest('[hidden]'));
    if (!list.length) return;
    const i = list.indexOf(document.activeElement);
    const next = event.shiftKey ? (i <= 0 ? list.length - 1 : i - 1) : i === list.length - 1 ? 0 : i + 1;
    if (i === -1 || (event.shiftKey ? i === 0 : i === list.length - 1)) {
      event.preventDefault();
      list[next].focus();
    }
  });

  let message = '';
  function act(result) {
    const error = result && result.ok ? ERRORS[result.status] ?? null : null;
    message = error ? t(error) : '';
    sync();
  }

  function sync() {
    const s = graphics.state();
    const name = (id) => t(PRESET_TEXTS[id] ?? id);
    const key = s.auto ? (s.downgraded ? 'game.gfx.current.lowered' : 'game.gfx.current.auto') : s.locked ? 'game.gfx.current.url' : null;
    presetCurrent.textContent = key ? fmt(t(key), { preset: name(s.preset) }) : '';
    for (const b of presetEls) {
      b.setAttribute('aria-pressed', String(b.dataset.preset === s.choice));
      b.disabled = s.locked;
    }
    const reduced = Boolean(vhs?.reducedMotion);
    for (const [id, r] of rows) {
      const imposed = s.origins[id] === 'adresse';
      const motion = id === 'vhs' && reduced && !imposed;
      const value = s.vector[id];
      for (const b of r.buttons) {
        b.setAttribute('aria-pressed', String(b.dataset.value === value));
        b.disabled = s.locked || imposed || motion;
      }
      const pending = s.pending.includes(id);
      const state = imposed ? 'imposed' : motion ? 'motion' : pending ? 'pending' : r.option.group === 'load' ? 'load' : '';
      const text = { imposed: value === null ? `${t('game.options.imposed')} (${t('game.options.value.adresse')})` : t('game.options.imposed'), motion: t('game.options.reduced'), pending: t('game.options.reload.pending'), load: t('game.options.reload.mark'), '': '' }[state];
      r.mark.textContent = text;
      r.mark.hidden = text === '';
      r.mark.dataset.state = state;
      r.row.classList.toggle('is-imposed', imposed || motion || s.locked);
      r.row.classList.toggle('is-pending', pending);
      if (text) r.row.setAttribute('aria-describedby', r.mark.id);
      else r.row.removeAttribute('aria-describedby');
    }
    status.textContent = s.locked ? t('game.options.locked') : message;
    status.hidden = status.textContent === '';
    bar.hidden = !confirm.hidden || s.pending.length === 0;
    if (s.pending.length === 0) confirm.hidden = true;
  }

  return {
    element: wrap,
    get isOpen() {
      return !wrap.hidden;
    },
    open() {
      message = '';
      confirm.hidden = true;
      sync();
      wrap.hidden = false;
      scroll.scrollTop = 0;
      (presetEls.find((b) => b.getAttribute('aria-pressed') === 'true' && !b.disabled) ?? back).focus();
    },
    close() {
      wrap.hidden = true;
    },
    // Échap : ferme d'abord la confirmation du rechargement ; renvoie vrai si elle l'a consommé.
    escape() {
      if (confirm.hidden) return false;
      confirm.hidden = true;
      sync();
      reloadBtn.focus();
      return true;
    },
    sync,
  };
}
