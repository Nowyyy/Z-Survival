// Écran Options (lot 5j, bloc E2-12 ; lot 8c : composant partagé avec la page Options du menu principal, E5). Importé à la première ouverture
// (aucun coût tant qu'il reste fermé : en partie, depuis la pause ; dans le menu, depuis le menu à trois barres) ; il n'importe que texts.js (la
// logique des réglages est dans js/core/graphics.js, l'état dans le contrôleur de graphics-apply.js). Lot 8c : la barre « Recharger maintenant »
// et sa confirmation sont retirées ; en partie, les réglages appliqués au lancement sont verrouillés (voir creerOptions ci-dessous).
import { fmt } from './texts.js';

const PRESETS = ['auto', 'faible', 'moyen', 'eleve', 'perso'];
const PRESET_TEXTS = { auto: 'game.gfx.auto', faible: 'game.gfx.faible', moyen: 'game.gfx.moyen', eleve: 'game.gfx.eleve', perso: 'game.gfx.perso' };
const ERRORS = { verrouille: 'game.gfx.error.verrouille', echec: 'game.gfx.error.echec', indisponible: 'game.gfx.error.indisponible' };

// Élément avec ses classes (styles : classes e5-* de la feuille des écrans du menu, et panel-wrap de game-ui.css pour la couche de la partie).
function el(tag, classes = [], attrs = {}) {
  const n = document.createElement(tag);
  if (classes.length) n.classList.add(...classes);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  return n;
}

// ---------------------------------------------------------------------------------------------------------------------------------------------
// Lot 8c : composant d'Options partagé (Docs/ref/options-graphiques.md, Docs/ref/menu-principal.md ; maquettes Options.html et OptionsJeu.html).
// contexte « menu » : page Options du menu principal (E5, écran plein dans #e8, bandeau « Réglages / Options », « ‹ Menu ») : tout est modifiable.
// contexte « partie » : Options de la pause (E2-12, panneau au-dessus de la partie, « ‹ Pause », titre) : mêmes sections, lignes et notes ; les
// réglages appliqués au lancement (groupe « load » de graphics.json) sont verrouillés (grisés, cadenas, « Modifiable depuis le menu principal »,
// boutons désactivés, raison dans la description du groupe) ; les préréglages restent modifiables (leurs valeurs verrouillées valent au prochain
// chargement de la partie ; retour du propriétaire : aucune ligne « En cours · au retour au menu » affichée). Section « Son » en tête (son, volume du jeu, volume de la musique : lot 8i) : son = { etat() → { disponible, coupe, volume, musique, pas }, couper(bool), regler(n), reglerMusique(n) }.
// Aucune couleur ici (feuille des écrans du menu, jetons --menu-* de tokens.css ; en partie, chargée par demarrage.js) ; choix et verrou jamais portés par la couleur seule (aria-pressed et
// soulignement, cadenas et texte). Le DOM est construit une fois ; sync() ne met à jour que des attributs et des textes.
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
  // Ligne : à gauche le nom (gras) et sa note (cadenas éventuel) ; à droite les valeurs.
  // pour : identifiant d'un champ (curseur du volume) dont le nom est l'étiquette (<label for>), visible.
  const ligne = (sec, id, cle, groupeId, pour = null) => {
    const row = el('div', ['e5-ligne'], { role: 'group', 'aria-labelledby': `options-label-${id}`, 'aria-describedby': `options-note-${id}`, 'data-option': id, 'data-group': groupeId });
    const gauche = el('div', ['e5-gauche']);
    const nom = pour ? el('label', ['e5-nom'], { id: `options-label-${id}`, for: pour }) : el('span', ['e5-nom'], { id: `options-label-${id}` });
    nom.textContent = t(cle);
    const note = el('span', ['e5-note'], { id: `options-note-${id}` });
    const cadenas = icone('cadenas', 'e5-cadenas');
    const noteTexte = el('span');
    note.append(cadenas, noteTexte);
    gauche.append(nom, note);
    const valeurs = el('div', ['e5-valeurs']);
    row.append(gauche, valeurs);
    sec.append(row);
    return { row, note, cadenas, noteTexte, valeurs };
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
    // Lot 8i : deux curseurs, « Volume du jeu » (sons de la partie, effets du menu) et « Volume de la musique » (musique des menus, mélodie
    // d'annonce de vague ; affiché quand le contexte sait le régler : son.reglerMusique). 0 à 100 % par pas de 10, réglables au clavier.
    const curseurDe = (id, cle, champ, regler) => {
      const l = ligne(sec, id, cle, 'son', champ);
      const c = el('input', ['e5-curseur'], { type: 'range', min: '0', max: '100', step: '10', id: champ, 'aria-describedby': `options-note-${id}` });
      const v = el('output', ['e5-volume-valeur'], { for: champ, id: `${champ}-valeur`, 'aria-hidden': 'true' });
      c.addEventListener('input', () => {
        regler(Number(c.value));
        sync();
      });
      l.valeurs.append(c, v);
      return { l, c, v };
    };
    const jeu = curseurDe('son-niveau', 'game.options.volume', 'options-volume', (n) => son.regler(n));
    const musique = typeof son.reglerMusique === 'function' ? curseurDe('son-musique', 'game.options.volume.musique', 'options-volume-musique', (n) => son.reglerMusique(n)) : null;
    sonEls = { sec, l1, boutons, jeu, musique };
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

  function sync() {
    const s = graphics.state();
    for (const b of presetEls) {
      b.setAttribute('aria-pressed', String(b.dataset.preset === s.choice));
      b.disabled = s.locked;
    }
    presetEls[0].textContent = fmt(t('game.options.auto'), { preset: t(PRESET_TEXTS[s.detected] ?? s.detected) });
    const reduced = Boolean(vhs?.reducedMotion);
    const verrous = s.lockedOptions ?? [];
    for (const [id, r] of rows) {
      const imposed = s.origins[id] === 'adresse';
      const motion = id === 'vhs' && reduced && !imposed;
      const verrou = verrous.includes(id);
      const value = verrou ? s.running[id] : s.vector[id];
      for (const b of r.buttons) {
        b.setAttribute('aria-pressed', String(b.dataset.value === value));
        b.disabled = s.locked || imposed || motion || verrou;
        if (verrou) b.setAttribute('aria-describedby', `options-note-${id}`);
        else b.removeAttribute('aria-describedby');
      }
      const etat = imposed ? 'impose' : motion ? 'mouvement' : verrou ? 'verrou' : r.option.group === 'load' ? 'lancement' : 'direct';
      r.noteTexte.textContent = {
        impose: value === null ? `${t('game.options.imposed')} (${t('game.options.value.adresse')})` : t('game.options.imposed'),
        mouvement: t('game.options.reduced'), verrou: t('game.options.note.verrou'), lancement: t('game.options.note.lancement'), direct: t('game.options.note.direct'),
      }[etat];
      r.note.dataset.etat = etat;
      r.cadenas.style.display = verrou ? '' : 'none';
      r.row.classList.toggle('is-verrou', verrou);
      r.row.classList.toggle('is-impose', imposed || motion || s.locked);
    }
    if (sonEls) {
      const e = son.etat();
      sonEls.sec.hidden = !e.disponible;
      for (const { b, coupe } of sonEls.boutons) b.setAttribute('aria-pressed', String(coupe === e.coupe));
      const pas = Number.isFinite(e.pas) && e.pas > 0 ? e.pas : 10;
      for (const [x, n] of [[sonEls.jeu, e.volume], [sonEls.musique, e.musique]]) {
        if (!x) continue;
        x.c.step = String(pas);
        x.c.value = String(n);
        const texte = fmt(t('game.options.volume.valeur'), { n });
        x.c.setAttribute('aria-valuetext', texte);
        x.v.textContent = texte;
      }
      for (const l of [sonEls.l1, sonEls.jeu.l, sonEls.musique?.l]) {
        if (!l) continue;
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
