// Écran Options de la pause (lot 5j, bloc E2-12) : chargé par import dynamique à la première ouverture (aucun coût tant qu'il reste fermé). Panneau du
// même style que la pause (direction B) : en tête, le titre, la croix de fermeture en haut à droite (lot 5j-E, à la place de « Retour ») et les préréglages (Auto, Faible, Moyen, Élevé, Perso ; en Auto : « Auto (Moyen) ») ;
// puis une région qui défile à l'intérieur du panneau (sections Image, Carte, Personnages : une ligne par option, ses valeurs en boutons exclusifs,
// marque d'état dans la ligne du libellé : « recharge » pour les options appliquées au chargement, « au rechargement » quand une valeur attend le
// rechargement, « imposé par l'adresse », « coupé (mouvement réduit) » ; lot 5j-D : jamais de ligne ajoutée, la mise en page ne bouge pas) ; en pied, la barre « Recharger maintenant » (confirmation « Cette partie sera
// perdue ») tant qu'une option « load » diffère du jeu en cours. Une option imposée par l'adresse est grisée (« Imposé par l'adresse ») ; ?gfx= verrouille
// tout. Choix marqué par aria-pressed, un soulignement et une bordure (jamais la couleur seule). Focus piégé dans le panneau ; Échap (input.js →
// ui.togglePause) et la croix reviennent à la pause. Le DOM est construit une fois ; les changements ne mettent à jour que des attributs et des textes.
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
  // Lot 5j-E (retour du propriétaire) : croix de fermeture en haut à droite (icône décorative, nom accessible « Fermer les options »), même forme que l'icône de son de la pause.
  const back = el('button', ['button', 'button-quiet', 'panel-icon'], { type: 'button', id: 'options-close', 'aria-label': t('game.options.close') });
  const cross = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  cross.setAttribute('viewBox', '0 0 16 16');
  cross.setAttribute('aria-hidden', 'true');
  cross.setAttribute('focusable', 'false');
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', 'M3.5 3.5l9 9M12.5 3.5l-9 9');
  cross.append(path);
  back.append(cross);
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

// ---------------------------------------------------------------------------------------------------------------------------------------------
// Lot 8c : composant d'Options partagé (Docs/ref/options-graphiques.md, Docs/ref/menu-principal.md ; maquettes Options.html et OptionsJeu.html).
// contexte « menu » : page Options du menu principal (E5, écran plein dans #e8, bandeau « Réglages / Options », « ‹ Menu ») : tout est modifiable.
// contexte « partie » : Options de la pause (E2-12, panneau au-dessus de la partie, « ‹ Pause », titre) : mêmes sections, lignes et notes ; les
// réglages appliqués au lancement (groupe « load » de graphics.json) sont verrouillés (grisés, cadenas, « Modifiable depuis le menu principal »,
// boutons désactivés, raison dans la description du groupe) ; les préréglages restent modifiables et une valeur en attente du prochain chargement
// s'affiche en texte. Section « Son » en tête (son, volume) : son = { etat() → { disponible, coupe, volume, pas }, couper(bool), regler(n) }.
// Aucune couleur ici (feuille des écrans du menu, jetons --menu-* de tokens.css ; en partie, chargée par demarrage.js) ; choix, verrou et attente jamais portés par la couleur seule (aria-pressed et
// soulignement, cadenas et texte, texte). Le DOM est construit une fois ; sync() ne met à jour que des attributs et des textes.
const SVG_NS = 'http://www.w3.org/2000/svg';
const ICONES = { chevron: 'M10 3.5 5.5 8l4.5 4.5', cadenas: 'M4 7.5h8v6.5H4zM5.6 7.5V5.4a2.4 2.4 0 0 1 4.8 0v2.1' };

function icone(nom, classe) {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 16 16');
  svg.setAttribute('class', classe);
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  const p = document.createElementNS(SVG_NS, 'path');
  p.setAttribute('d', ICONES[nom]);
  svg.append(p);
  return svg;
}

// bandeau : fonction bandeau(libellé, titre, id) du menu (js/menu/menu.js), donnée par le menu (le jeu n'importe rien du menu).
export function creerOptions({ contexte = 'menu', dict, graphics, son = null, vhs = null, onClose = () => {}, root = document.body, bandeau = null }) {
  const t = (k) => dict[k] ?? k;
  const partie = contexte !== 'menu';
  const data = graphics.options();
  const wrap = partie
    ? el('div', ['panel-wrap', 'e5-voile'], { 'data-block': 'E2-12', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'options-title', id: 'options-panel' })
    : el('section', ['e8-ecran', 'e5', 'e5-page'], { 'data-block': 'E5', 'aria-labelledby': 'options-title', id: 'menu-ecran-options' });
  const boite = partie ? el('div', ['e5', 'e5-panneau']) : wrap;
  if (partie) wrap.append(boite);
  wrap.hidden = true;
  wrap.dataset.contexte = partie ? 'partie' : 'menu';

  // En-tête : bandeau et « ‹ Menu » (menu) ; « ‹ Pause » et titre (partie).
  const tete = el('div', ['e5-tete']);
  const retour = el('button', ['menu-planche', 'e5-retour'], { type: 'button', id: 'options-retour', 'aria-label': t(partie ? 'game.options.retour.pause.aria' : 'game.options.retour.menu.aria') });
  const retourTexte = el('span');
  retourTexte.textContent = t(partie ? 'game.options.retour.pause' : 'game.options.retour.menu');
  retour.append(icone('chevron', 'e5-chevron'), retourTexte);
  if (partie || !bandeau) {
    const titre = el('h2', ['e5-titre'], { id: 'options-title' });
    titre.textContent = t('game.options.title');
    tete.append(retour, titre);
  } else tete.append(bandeau(t('game.options.libelle'), t('game.options.title'), 'options-title'), retour);
  retour.addEventListener('click', () => onClose());

  // Préréglages : Auto · <détecté>, Faible, Moyen, Élevé, Perso ; à droite, « Modifier un réglage passe sur Perso ».
  const rangee = el('div', ['e5-presets']);
  const groupe = el('div', ['e5-presets-boutons'], { role: 'group', 'aria-label': t('game.options.presets'), 'aria-describedby': 'options-presets-note', id: 'options-presets' });
  const presetEls = PRESETS.map((id) => {
    const b = el('button', ['e5-bouton', 'e5-preset'], { type: 'button', 'aria-pressed': 'false', 'data-preset': id, id: `options-preset-${id}` });
    b.textContent = t(PRESET_TEXTS[id]);
    b.addEventListener('click', () => act(graphics.choosePreset(id)));
    groupe.append(b);
    return b;
  });
  const notePerso = el('p', ['e5-petit', 'e5-presets-note'], { id: 'options-presets-note' });
  notePerso.textContent = t('game.options.perso.note');
  rangee.append(groupe, notePerso);

  // Liste qui défile : section Son, puis les sections des données (une ligne par réglage).
  const liste = el('div', ['e5-liste'], { role: 'region', tabindex: '0', 'aria-label': t('game.options.liste'), id: 'options-scroll' });
  const section = (id, cle) => {
    const sec = el('section', ['e5-section'], { 'aria-labelledby': `options-section-${id}`, 'data-section': id });
    const h = el('h3', ['e5-section-titre'], { id: `options-section-${id}` });
    h.textContent = t(cle);
    sec.append(h);
    liste.append(sec);
    return sec;
  };
  // Ligne : à gauche le nom (gras), sa note (cadenas éventuel) et la valeur en attente ; à droite les valeurs.
  const ligne = (sec, id, cle, groupeId) => {
    const row = el('div', ['e5-ligne'], { role: 'group', 'aria-labelledby': `options-label-${id}`, 'aria-describedby': `options-note-${id}`, 'data-option': id, 'data-group': groupeId });
    const gauche = el('div', ['e5-gauche']);
    const nom = el('span', ['e5-nom'], { id: `options-label-${id}` });
    nom.textContent = t(cle);
    const note = el('span', ['e5-note'], { id: `options-note-${id}` });
    const cadenas = icone('cadenas', 'e5-cadenas');
    const noteTexte = el('span');
    note.append(cadenas, noteTexte);
    const attente = el('span', ['e5-note', 'e5-attente'], { id: `options-attente-${id}` });
    attente.hidden = true;
    gauche.append(nom, note, attente);
    const valeurs = el('div', ['e5-valeurs']);
    row.append(gauche, valeurs);
    sec.append(row);
    return { row, note, cadenas, noteTexte, attente, valeurs };
  };

  let sonEls = null;
  if (son) {
    const sec = section('son', 'game.options.section.son');
    const l1 = ligne(sec, 'son', 'game.options.son', 'son');
    const boutons = [['active', false, 'game.options.v.active'], ['coupe', true, 'game.options.v.coupe']].map(([id, coupe, cle]) => {
      const b = el('button', ['e5-bouton', 'e5-valeur'], { type: 'button', 'aria-pressed': 'false', 'data-value': id, id: `options-son-${id}` });
      b.textContent = t(cle);
      b.addEventListener('click', () => {
        son.couper(coupe);
        sync();
      });
      l1.valeurs.append(b);
      return { b, coupe };
    });
    const l2 = ligne(sec, 'son-niveau', 'game.options.volume', 'son');
    const curseur = el('input', ['e5-curseur'], { type: 'range', min: '0', max: '100', step: '10', id: 'options-volume', 'aria-labelledby': 'options-label-son-niveau', 'aria-describedby': 'options-note-son-niveau' });
    const valeur = el('output', ['e5-volume-valeur'], { for: 'options-volume', id: 'options-volume-valeur', 'aria-hidden': 'true' });
    curseur.addEventListener('input', () => {
      son.regler(Number(curseur.value));
      sync();
    });
    l2.valeurs.append(curseur, valeur);
    sonEls = { sec, l1, l2, boutons, curseur, valeur };
  }

  const rows = new Map();
  for (const sectionId of data.sections) {
    const sec = section(sectionId, data.sectionTexts[sectionId]);
    for (const o of data.options.filter((x) => x.section === sectionId)) {
      const r = ligne(sec, o.id, o.texte, o.group);
      const buttons = o.valeurs.map((v) => {
        const b = el('button', ['e5-bouton', 'e5-valeur'], { type: 'button', 'aria-pressed': 'false', 'data-value': v.id });
        b.textContent = t(v.texte);
        b.addEventListener('click', () => act(graphics.setOption(o.id, v.id)));
        r.valeurs.append(b);
        return b;
      });
      rows.set(o.id, { ...r, buttons, option: o });
    }
  }

  const statut = el('p', ['e5-petit', 'e5-statut'], { role: 'status', id: 'options-status' });
  boite.append(tete, rangee, liste, statut);
  if (!partie) {
    const pied = el('p', ['e5-petit', 'e5-pied'], { id: 'options-pied' });
    pied.textContent = t('game.options.pied');
    boite.append(pied);
  }
  root.append(wrap);

  // Partie : boîte de dialogue modale, focus piégé (Tab et Maj+Tab tournent dans le panneau).
  if (partie) {
    wrap.addEventListener('keydown', (event) => {
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
  }

  let message = '';
  function act(result) {
    const error = result && result.ok ? ERRORS[result.status] ?? null : null;
    message = error ? t(error) : '';
    sync();
  }

  const libelle = (o, v) => t(o.valeurs.find((x) => x.id === v)?.texte ?? 'game.options.value.adresse');

  function sync() {
    const s = graphics.state();
    for (const b of presetEls) {
      b.setAttribute('aria-pressed', String(b.dataset.preset === s.choice));
      b.disabled = s.locked;
    }
    presetEls[0].textContent = fmt(t('game.options.auto'), { preset: t(PRESET_TEXTS[s.detected] ?? s.detected) });
    const reduced = Boolean(vhs?.reducedMotion);
    const attentes = new Map((s.waiting ?? []).map((w) => [w.id, w]));
    const verrous = s.lockedOptions ?? [];
    for (const [id, r] of rows) {
      const imposed = s.origins[id] === 'adresse';
      const motion = id === 'vhs' && reduced && !imposed;
      const verrou = verrous.includes(id);
      const w = verrou ? attentes.get(id) ?? null : null;
      const value = verrou ? s.running[id] : s.vector[id];
      for (const b of r.buttons) {
        b.setAttribute('aria-pressed', String(b.dataset.value === value));
        b.classList.toggle('is-attente', Boolean(w) && b.dataset.value === w.retour);
        b.disabled = s.locked || imposed || motion || verrou;
        if (verrou) b.setAttribute('aria-describedby', w ? `options-note-${id} options-attente-${id}` : `options-note-${id}`);
        else b.removeAttribute('aria-describedby');
      }
      const etat = imposed ? 'impose' : motion ? 'mouvement' : verrou ? 'verrou' : r.option.group === 'load' ? 'lancement' : 'direct';
      r.noteTexte.textContent = {
        impose: value === null ? `${t('game.options.imposed')} (${t('game.options.value.adresse')})` : t('game.options.imposed'),
        mouvement: t('game.options.reduced'), verrou: t('game.options.note.verrou'), lancement: t('game.options.note.lancement'), direct: t('game.options.note.direct'),
      }[etat];
      r.note.dataset.etat = etat;
      r.cadenas.style.display = verrou ? '' : 'none';
      r.attente.hidden = !w;
      r.attente.textContent = w ? fmt(t('game.options.note.attente'), { enCours: libelle(r.option, w.enCours), retour: libelle(r.option, w.retour) }) : '';
      r.row.setAttribute('aria-describedby', w ? `options-note-${id} options-attente-${id}` : `options-note-${id}`);
      r.row.classList.toggle('is-verrou', verrou);
      r.row.classList.toggle('is-impose', imposed || motion || s.locked);
      r.row.classList.toggle('is-attente', Boolean(w));
    }
    if (sonEls) {
      const e = son.etat();
      sonEls.sec.hidden = !e.disponible;
      for (const { b, coupe } of sonEls.boutons) b.setAttribute('aria-pressed', String(coupe === e.coupe));
      const pas = Number.isFinite(e.pas) && e.pas > 0 ? e.pas : 10;
      sonEls.curseur.step = String(pas);
      sonEls.curseur.value = String(e.volume);
      const texte = fmt(t('game.options.volume.valeur'), { n: e.volume });
      sonEls.curseur.setAttribute('aria-valuetext', texte);
      sonEls.valeur.textContent = texte;
      for (const l of [sonEls.l1, sonEls.l2]) {
        l.noteTexte.textContent = t('game.options.note.direct');
        l.note.dataset.etat = 'direct';
        l.cadenas.style.display = 'none';
      }
    }
    statut.textContent = s.locked ? t('game.options.locked') : message;
    statut.hidden = statut.textContent === '';
  }

  return {
    element: wrap,
    get isOpen() {
      return !wrap.hidden;
    },
    open() {
      message = '';
      sync();
      wrap.hidden = false;
      liste.scrollTop = 0;
      (presetEls.find((b) => b.getAttribute('aria-pressed') === 'true' && !b.disabled) ?? retour).focus();
    },
    close() {
      wrap.hidden = true;
    },
    sync,
  };
}
