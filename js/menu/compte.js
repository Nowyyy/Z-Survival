// Lot 8g : page Profil E10 (Docs/ref/menu-principal.md, « Lot 8g » ; maquette Docs/maquettes-v0.8/Profil.html), chargée à la demande (roue de
// chargement de menu.js), écran plein comme les Options (en-tête gardé, barre d'onglets masquée, « ‹ Menu »). Retour du propriétaire : plus d'écran
// Connexion : le bouton « Connexion » de l'en-tête ouvre directement le Profil ; « Se connecter avec Google · bientôt » est sur le Profil et dans le
// menu à trois barres (raison lue).
// - Profil : carte (avatar dessiné en code d'après le joueur et les zombies du jeu, pseudo modifiable, compte non connecté), six statistiques lues
//   dans la sauvegarde existante (« — » sinon : js/menu/profil-etat.js), Sauvegarde : « Exporter mon code » et « Importer un code », par la logique de
//   sauvegarde.html (code ZS1.…, vérification, aperçu, confirmation, message) : js/core/save.js (encodeSave, decodeSave) et js/sauvegarde/logic.js ;
//   l'import remplace la sauvegarde par repository.replace (seule écriture, déjà existante, après confirmation), puis le menu se recharge (repère
//   #retour, comme le retour au menu : sans introduction ; tout le menu relit la sauvegarde importée).
// Avatar et pseudo restent en mémoire jusqu'au lot 8h (le retour au menu les remet par défaut).
import { el } from './menu.js';
import { ERREURS_PSEUDO, statsProfil, validerPseudo, PSEUDO_MAX, PSEUDO_MIN } from './profil-etat.js';
import { AVATARS, NOMS_AVATARS, avatarDe, avatarSuivant, lireProfil, poserProfil, portrait, suivreProfil } from './avatar.js';
import { decodeSave, encodeSave } from '../core/save.js';
import { canReplace, errorKey, levelRows, previewRows, recordKey, rowKey, statKey } from '../sauvegarde/logic.js';
import { formatMoney } from '../core/economy.js';
import { REPERE_RETOUR } from '../core/graphics.js';
import { adresseRetour } from '../core/menu-etat.js';
import { fmt } from '../game/texts.js';
import { pageSearch } from '../game/graphics-boot.js';
import { createRepository } from '../save/index.js';

const SVG = 'http://www.w3.org/2000/svg';
const json = (path) => fetch(path).then((r) => (r.ok ? r.json() : null)).catch(() => null);
let donnees = null;
// Paramètres de la sauvegarde (mêmes fichiers que preparerMenu et sauvegarde.html), demandés une seule fois.
export const precharger = () => {
  donnees ??= Promise.all([json('data/game/save.json'), json('data/game/economy.json'), json('data/game/player-stats.json')]);
  return donnees;
};


function svgEl(tag, attrs = {}, classe = null) {
  const n = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, String(v));
  if (classe) n.setAttribute('class', classe);
  return n;
}
function icone(d, classe) {
  const svg = svgEl('svg', { viewBox: '0 0 24 24', 'aria-hidden': 'true', focusable: 'false' }, classe);
  svg.append(svgEl('path', { d }));
  return svg;
}
const CHEVRON = 'M15 6l-6 6 6 6';
const STAT_TEXTES = {
  meilleureManche: 'game.menu.profil.stat.meilleureManche', tues: 'game.menu.profil.stat.tues', partiesHistoire: 'game.menu.profil.stat.partiesHistoire',
  partiesInfini: 'game.menu.profil.stat.partiesInfini', temps: 'game.menu.profil.stat.temps', argent: 'game.menu.profil.stat.argent',
};
const CRAYON = 'M4 20h4L20 8l-4-4L4 16z';


// En-tête d'un écran : bandeau, « ‹ Menu » (planche, comme les Options).
function tete({ t, bandeau, libelle, titre, id, onClose }) {
  const b = el('div', ['e5-tete', 'e10-tete']);
  const retour = el('button', ['menu-planche', 'e5-retour'], { type: 'button', id: `${id}-retour`, 'aria-label': t('game.options.retour.menu.aria') });
  retour.append(icone(CHEVRON, 'e5-chevron'), Object.assign(el('span'), { textContent: t('game.options.retour.menu') }));
  retour.addEventListener('click', () => onClose());
  b.append(bandeau(libelle, titre, `${id}-titre`), retour);
  return { tete: b, retour };
}

// Bouton désactivé lisible : atteignable au clavier, raison lue (aria-describedby), action ignorée.
function boutonIndisponible(id, texte, raison, classes = ['e10-bouton', 'e10-indisponible']) {
  const b = el('button', classes, { type: 'button', id, 'aria-disabled': 'true', 'aria-describedby': `${id}-raison` });
  b.textContent = texte;
  const r = el('span', ['sr-only'], { id: `${id}-raison` });
  r.textContent = raison;
  return { bouton: b, raison: r };
}

// Fenêtre superposée du Profil (export, import) : voile, panneau, titre, croix ; focus piégé ; Échap géré par echap().
function fenetre({ t, id, titre, corps, root, onClose }) {
  const voile = el('div', ['e8-voile', 'e10-voile'], { id, 'data-block': 'E10-3' });
  const panneau = el('div', ['e8-panneau', 'e10-panneau'], { role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': `${id}-titre` });
  const haut = el('div', ['e8-panneau-tete', 'e10-panneau-tete']);
  const h = el('h3', ['e10-panneau-titre'], { id: `${id}-titre` });
  h.textContent = titre;
  const croix = el('button', ['e8-croix'], { type: 'button', id: `${id}-fermer`, 'aria-label': t('game.menu.fermer') });
  croix.append(icone('M5 5l14 14M19 5L5 19', 'e10-croix'));
  croix.addEventListener('click', () => onClose());
  haut.append(h, croix);
  const zone = el('div', ['e8-panneau-corps', 'e10-panneau-corps']);
  zone.append(...corps);
  panneau.append(haut, zone);
  voile.append(panneau);
  voile.addEventListener('pointerdown', (e) => {
    if (e.target === voile) onClose();
  });
  panneau.addEventListener('keydown', (e) => {
    if (e.code !== 'Tab') return;
    const liste = [...panneau.querySelectorAll('button, textarea, input, [tabindex="0"]')].filter((n) => !n.disabled && n.offsetParent !== null);
    const i = liste.indexOf(document.activeElement);
    if (e.shiftKey && i <= 0) {
      e.preventDefault();
      liste.at(-1)?.focus();
    } else if (!e.shiftKey && i === liste.length - 1) {
      e.preventDefault();
      liste[0]?.focus();
    }
  });
  root.append(voile);
  return { element: voile, croix };
}

// t : textes ; bandeau : bandeau() du menu ; root : contenu du menu (écrans) ; rootDialogue : racine du menu (fenêtres) ; monde : premier monde
// jouable (manches, nom) ; poserEcran(nom | null) : menu.js place l'écran (etatMenu.ecran) et resynchronise.
// Rechargement du menu après un import (comme le retour au menu, menuRetour de demarrage.js) : adresse du retour (adresseRetour), repère #retour
// (#plein-ecran en plein écran : le menu le reprend au premier geste) posé avant un vrai rechargement : pas d'introduction.
function rechargerMenu() {
  const search = adresseRetour(location.search);
  const repere = document.fullscreenElement ? '#plein-ecran' : REPERE_RETOUR;
  history.replaceState(null, '', `${location.pathname}${search}${repere}`);
  location.reload();
}

export async function ecransCompte({ t, bandeau, root, rootDialogue, monde, poserEcran, recharger = rechargerMenu }) {
  const [saveCfg, economyCfg, statsCfg] = await precharger();
  const params = { save: saveCfg, economy: economyCfg, stats: statsCfg };
  const storage = (() => {
    try {
      return window.localStorage;
    } catch {
      return null;
    }
  })();
  // Même dépôt que la partie (mémoire sous ?test=1 sauf store=local, lecture seule en mode essai) ; lu à chaque affichage du Profil.
  const { repository, mode } = createRepository({ search: pageSearch(), storage, params });
  const lire = () => {
    try {
      return repository.load();
    } catch {
      return { status: 'unavailable', save: null };
    }
  };

  // --- Profil (E10-2) -------------------------------------------------------------------------------------------------------------------------
  const profil = el('section', ['e8-ecran', 'e10', 'e10-profil'], { id: 'menu-ecran-profil', 'aria-labelledby': 'menu-ecran-profil-titre', 'data-block': 'E10-2' });
  profil.hidden = true;
  const tp = tete({ t, bandeau, libelle: t('game.menu.profil.libelle'), titre: t('game.menu.profil.titre'), id: 'menu-ecran-profil', onClose: () => poserEcran(null) });
  const annonce = el('p', ['sr-only'], { id: 'menu-profil-annonce', 'aria-live': 'polite', role: 'status' });
  const dire = (texte) => {
    annonce.textContent = '';
    annonce.textContent = texte;
  };
  const grille = el('div', ['e10-grille']);

  // Carte : avatar, pseudo, compte.
  const carte = el('section', ['e10-carte'], { id: 'menu-profil-carte', 'aria-label': t('game.menu.profil.carte') });
  const avatar = el('div', ['e10-avatar'], { id: 'menu-profil-avatar', role: 'img' });
  const avatarSvg = svgEl('svg', { viewBox: '0 0 64 64', 'aria-hidden': 'true', focusable: 'false' }, 'e10-avatar-svg');
  avatar.append(avatarSvg);
  const changer = el('button', ['e10-bouton'], { type: 'button', id: 'menu-profil-changer' });
  changer.textContent = t('game.menu.profil.avatar.changer');
  const poserAvatar = () => {
    const a = avatarDe(lireProfil().avatar);
    avatar.dataset.avatar = a.id;
    avatar.className = `e10-avatar e10-avatar-${a.id}`;
    avatarSvg.replaceChildren(portrait(a));
    avatar.setAttribute('aria-label', fmt(t('game.menu.profil.avatar.nom'), { n: AVATARS.indexOf(a) + 1, total: AVATARS.length, nom: t(NOMS_AVATARS[a.id]) }));
  };
  changer.addEventListener('click', () => {
    poserProfil({ avatar: avatarSuivant(lireProfil().avatar).id }); // en-tête et Profil suivent (suivreProfil)
    dire(avatar.getAttribute('aria-label'));
  });
  // Pseudo : affichage et crayon ; édition : champ étiqueté, consigne, erreur (role alert), Valider et Annuler.
  const ligne = el('div', ['e10-pseudo']);
  const pseudo = el('p', ['e10-pseudo-texte'], { id: 'menu-profil-pseudo' });
  const crayon = el('button', ['e10-crayon'], { type: 'button', id: 'menu-profil-pseudo-modifier', 'aria-label': t('game.menu.profil.pseudo.modifier') });
  crayon.append(icone(CRAYON, 'e10-crayon-icone'));
  ligne.append(pseudo, crayon);
  const form = el('form', ['e10-pseudo-form'], { id: 'menu-profil-pseudo-form', novalidate: '' });
  form.hidden = true;
  const label = el('label', ['e10-label'], { for: 'menu-profil-pseudo-champ' });
  label.textContent = t('game.menu.profil.pseudo.label');
  const champ = el('input', ['e10-champ'], { id: 'menu-profil-pseudo-champ', type: 'text', autocomplete: 'nickname', spellcheck: 'false', maxlength: '64', 'aria-describedby': 'menu-profil-pseudo-consigne menu-profil-pseudo-erreur', 'data-sans-glisser': '' });
  const consigne = el('p', ['e10-consigne'], { id: 'menu-profil-pseudo-consigne' });
  consigne.textContent = fmt(t('game.menu.profil.pseudo.consigne'), { min: PSEUDO_MIN, max: PSEUDO_MAX });
  const erreur = el('p', ['e10-erreur'], { id: 'menu-profil-pseudo-erreur', role: 'alert' });
  const actions = el('div', ['e10-actions']);
  const valider = el('button', ['menu-planche', 'e10-valider'], { type: 'submit', id: 'menu-profil-pseudo-valider' });
  valider.textContent = t('game.menu.profil.pseudo.valider');
  const annuler = el('button', ['e10-bouton'], { type: 'button', id: 'menu-profil-pseudo-annuler' });
  annuler.textContent = t('game.save.page.cancel');
  actions.append(valider, annuler);
  form.append(label, champ, consigne, erreur, actions);
  const poserPseudo = () => {
    pseudo.textContent = lireProfil().pseudo ?? t('game.menu.profil.pseudo.defaut');
  };
  const editer = (oui) => {
    form.hidden = !oui;
    ligne.hidden = oui;
    erreur.textContent = '';
    champ.removeAttribute('aria-invalid');
    if (oui) {
      champ.value = lireProfil().pseudo ?? '';
      champ.focus();
    } else crayon.focus();
  };
  crayon.addEventListener('click', () => editer(true));
  annuler.addEventListener('click', () => editer(false));
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const v = validerPseudo(champ.value);
    if (!v.ok) {
      erreur.textContent = fmt(t(ERREURS_PSEUDO[v.erreur]), { min: PSEUDO_MIN, max: PSEUDO_MAX });
      champ.setAttribute('aria-invalid', 'true');
      champ.focus();
      return;
    }
    poserProfil({ pseudo: v.pseudo });
    editer(false);
    dire(fmt(t('game.menu.profil.pseudo.fait'), { pseudo: v.pseudo }));
  });
  const compte = el('div', ['e10-compte']);
  const etatCompte = el('p', ['e10-compte-texte'], { id: 'menu-profil-compte' });
  etatCompte.textContent = t('game.menu.profil.compte');
  const googleProfil = boutonIndisponible('menu-profil-google', t('game.menu.compte.google'), t('game.menu.compte.google.raison'), ['e10-bouton', 'e10-indisponible', 'e10-large']);
  compte.append(etatCompte, googleProfil.bouton, googleProfil.raison);
  carte.append(avatar, changer, ligne, form, compte);

  // Statistiques : six cartes.
  const droite = el('div', ['e10-droite']);
  const titreStats = el('h3', ['e10-titre'], { id: 'menu-profil-stats-titre' });
  titreStats.textContent = t('game.menu.profil.stats');
  const stats = el('ul', ['e10-stats'], { id: 'menu-profil-stats', 'aria-labelledby': 'menu-profil-stats-titre' });
  const DETAILS = {
    meilleureManche: fmt(t('game.menu.profil.stat.meilleureManche.detail'), { monde: monde?.nom || '' }),
    tues: t('game.menu.profil.stat.tues.detail'),
    partiesHistoire: t('game.menu.profil.stat.partiesHistoire.detail'),
    partiesInfini: t('game.menu.profil.stat.partiesInfini.detail'),
    temps: t('game.menu.profil.stat.temps.detail'),
    argent: t('game.menu.profil.stat.argent.detail'),
  };
  const poserStats = () => {
    const lu = lire();
    stats.replaceChildren(...statsProfil(lu, monde?.manches).map((s) => {
      const li = el('li', ['e10-stat'], { 'data-stat': s.id });
      const nom = el('span', ['e10-stat-nom']);
      nom.textContent = t(STAT_TEXTES[s.id]);
      const valeur = el('span', ['e10-stat-valeur'], { 'data-valeur': s.valeur === null ? '' : String(s.valeur) });
      if (s.valeur === null) {
        valeur.textContent = '—';
        valeur.append(Object.assign(el('span', ['sr-only']), { textContent: ` (${t('game.menu.profil.stat.absente')})` }));
      } else if (s.id === 'meilleureManche') valeur.textContent = s.max ? `${s.valeur} / ${s.max}` : String(s.valeur);
      else if (s.id === 'argent') valeur.textContent = formatMoney(s.valeur);
      else valeur.textContent = String(s.valeur);
      const detail = el('span', ['e10-stat-detail']);
      detail.textContent = DETAILS[s.id];
      li.append(nom, valeur, detail);
      return li;
    }));
    return lu;
  };

  // Sauvegarde : export et import.
  const sauvegarde = el('section', ['e10-sauvegarde'], { id: 'menu-profil-sauvegarde', 'aria-labelledby': 'menu-profil-sauvegarde-titre' });
  const sTexte = el('div', ['e10-sauvegarde-texte']);
  const sTitre = el('h3', ['e10-titre'], { id: 'menu-profil-sauvegarde-titre' });
  sTitre.textContent = t('game.save.page.title');
  const sSous = el('p', ['e10-sous']);
  sSous.textContent = t(mode.base === 'memory' ? 'game.menu.profil.sauvegarde.memoire' : 'game.menu.profil.sauvegarde.appareil');
  sTexte.append(sTitre, sSous);
  const sBoutons = el('div', ['e10-sauvegarde-boutons']);
  const exporter = el('button', ['menu-planche', 'e10-planche'], { type: 'button', id: 'menu-profil-exporter' });
  exporter.textContent = t('game.menu.profil.exporter');
  const importer = el('button', ['e10-bouton', 'e10-importer'], { type: 'button', id: 'menu-profil-importer' });
  importer.textContent = t('game.menu.profil.importer');
  sBoutons.append(exporter, importer);
  sauvegarde.append(sTexte, sBoutons);
  droite.append(titreStats, stats, sauvegarde);
  grille.append(carte, droite);
  profil.append(tp.tete, grille, annonce);

  // Fenêtres d'export et d'import (une à la fois).
  let ouverte = null; // { element, fermer() }
  const fermerFenetre = () => {
    if (!ouverte) return;
    const { element, retour } = ouverte;
    ouverte = null;
    element.remove();
    retour.focus();
  };
  function ouvrirExport() {
    const lu = lire();
    const lisible = lu.status === 'ok' || lu.status === 'empty';
    const code = lisible ? encodeSave(lu.save, params) : '';
    const message = el('p', ['e10-message'], { id: 'menu-export-message', role: 'status' });
    const corps = [];
    if (lisible) {
      const l = el('label', ['e10-label'], { for: 'menu-export-code' });
      l.textContent = t('game.save.page.export.label');
      const zone = el('textarea', ['e10-code'], { id: 'menu-export-code', readonly: '', rows: '3', spellcheck: 'false', 'data-sans-glisser': '' });
      zone.value = code;
      const longueur = el('p', ['e10-consigne'], { id: 'menu-export-longueur' });
      longueur.textContent = fmt(t('game.save.page.export.length'), { n: code.length });
      const copier = el('button', ['menu-planche', 'e10-planche'], { type: 'button', id: 'menu-export-copier' });
      copier.textContent = t('game.save.page.export.copy');
      copier.addEventListener('click', async () => {
        try {
          await navigator.clipboard.writeText(zone.value);
          message.textContent = t('game.save.page.export.copied');
        } catch {
          zone.focus();
          zone.select();
          message.textContent = t('game.save.page.export.manual');
        }
      });
      corps.push(l, zone, longueur, copier, message);
    } else {
      message.textContent = t('game.save.page.write.locked');
      corps.push(message);
    }
    const f = fenetre({ t, id: 'menu-export', titre: t('game.menu.profil.exporter'), corps, root: rootDialogue, onClose: fermerFenetre });
    ouverte = { element: f.element, retour: exporter };
    f.croix.focus();
  }

  function ouvrirImport() {
    let verifie = null; // sauvegarde du code vérifié
    const l = el('label', ['e10-label'], { for: 'menu-import-code' });
    l.textContent = t('game.save.page.import.label');
    const zone = el('textarea', ['e10-code'], { id: 'menu-import-code', rows: '3', spellcheck: 'false', autocomplete: 'off', 'aria-describedby': 'menu-import-erreur', 'data-sans-glisser': '' });
    const verifier = el('button', ['menu-planche', 'e10-planche'], { type: 'button', id: 'menu-import-verifier' });
    verifier.textContent = t('game.save.page.import.verify');
    const err = el('p', ['e10-erreur'], { id: 'menu-import-erreur', role: 'alert' });
    const apercu = el('div', ['e10-apercu'], { id: 'menu-import-apercu' });
    apercu.hidden = true;
    const titreApercu = el('h4', ['e10-sous-titre']);
    titreApercu.textContent = t('game.save.page.import.preview');
    const table = el('table', ['e10-table'], { id: 'menu-import-table' });
    const teteTable = el('thead');
    const ligneTete = el('tr');
    for (const k of ['game.save.page.import.col.what', 'game.save.page.import.col.current', 'game.save.page.import.col.incoming']) ligneTete.append(Object.assign(el('th', [], { scope: 'col' }), { textContent: t(k) }));
    teteTable.append(ligneTete);
    const lignes = el('tbody');
    table.append(teteTable, lignes);
    const avert = el('p', ['e10-consigne'], { id: 'menu-import-avertissement' });
    const ack = el('label', ['e10-case']);
    const caseAck = el('input', [], { type: 'checkbox', id: 'menu-import-ack' });
    ack.append(caseAck, Object.assign(el('span'), { textContent: t('game.save.page.import.ack') }));
    const remplacer = el('button', ['menu-peint', 'e10-remplacer'], { type: 'button', id: 'menu-import-remplacer' });
    remplacer.textContent = t('game.save.page.import.replace');
    remplacer.disabled = true;
    apercu.append(titreApercu, table, avert, ack, remplacer);
    const message = el('p', ['e10-message'], { id: 'menu-import-message', role: 'status' });
    const rechargerBt = el('button', ['menu-planche', 'e10-planche'], { type: 'button', id: 'menu-import-recharger' });
    rechargerBt.textContent = t('game.menu.profil.import.recharger');
    rechargerBt.hidden = true;
    rechargerBt.addEventListener('click', () => recharger());
    const remettre = () => {
      verifie = null;
      apercu.hidden = true;
      err.textContent = '';
      caseAck.checked = false;
      remplacer.disabled = true;
      zone.removeAttribute('aria-invalid');
    };
    zone.addEventListener('input', remettre);
    caseAck.addEventListener('change', () => {
      remplacer.disabled = !canReplace(verifie !== null, caseAck.checked);
    });
    verifier.addEventListener('click', () => {
      remettre();
      message.textContent = '';
      const r = decodeSave(zone.value, params);
      if (!r.ok) {
        err.textContent = t(errorKey(r.error));
        zone.setAttribute('aria-invalid', 'true');
        return;
      }
      verifie = r.save;
      const actuelle = lire().save;
      lignes.replaceChildren();
      const ajouter = (nom, row) => {
        const tr = el('tr', [], { 'data-changed': String(row.changed) });
        tr.append(Object.assign(el('th', [], { scope: 'row' }), { textContent: nom }), Object.assign(el('td'), { textContent: String(row.current) }), Object.assign(el('td', row.changed ? ['e10-change'] : []), { textContent: row.changed ? `→ ${row.incoming}` : String(row.incoming) }));
        lignes.append(tr);
      };
      const rows = previewRows(actuelle, verifie);
      for (const row of rows.filter((x) => x.group !== 'records')) ajouter(t(rowKey(row.id)), row);
      for (const row of levelRows(actuelle, verifie)) ajouter(t(statKey(row.id)), row);
      for (const row of rows.filter((x) => x.group === 'records')) ajouter(t(recordKey(row.id)), row);
      avert.textContent = r.warnings.length ? fmt(t('game.save.page.import.warnings'), { n: r.warnings.length }) : '';
      avert.hidden = r.warnings.length === 0;
      apercu.hidden = false;
      message.textContent = t('game.save.page.import.ok');
    });
    remplacer.addEventListener('click', () => {
      if (!canReplace(verifie !== null, caseAck.checked)) return;
      // Le texte est décodé de nouveau : on importe exactement ce qui est dans le champ (comme sauvegarde.html).
      const encore = decodeSave(zone.value, params);
      if (!encore.ok) {
        remettre();
        return;
      }
      const r = repository.replace(encore.save, Date.now());
      if (!r.ok) {
        const indisponible = repository.info?.().status === 'unavailable';
        message.textContent = indisponible ? t('game.save.page.write.unavailable') : r.error === 'locked' ? t('game.save.page.write.locked') : fmt(t('game.save.page.write.failed'), { error: r.error });
        return;
      }
      zone.value = '';
      remettre();
      zone.disabled = true;
      verifier.disabled = true;
      message.textContent = `${t('game.save.page.import.done')} ${t('game.menu.profil.import.suite')}`;
      poserStats();
      rechargerBt.hidden = false;
      rechargerBt.focus();
    });
    const f = fenetre({ t, id: 'menu-import', titre: t('game.menu.profil.importer'), corps: [l, zone, verifier, err, apercu, message, rechargerBt], root: rootDialogue, onClose: fermerFenetre });
    ouverte = { element: f.element, retour: importer };
    zone.focus();
  }
  exporter.addEventListener('click', ouvrirExport);
  importer.addEventListener('click', ouvrirImport);

  root.append(profil);
  poserAvatar();
  poserPseudo();
  suivreProfil(() => {
    poserAvatar();
    poserPseudo();
  });

  return {
    // Écran affiché (profil ou autre) ; le Profil relit la sauvegarde à chaque affichage.
    synchroniser(ecran) {
      const avant = !profil.hidden;
      profil.hidden = ecran !== 'profil';
      if (ecran !== 'profil') {
        fermerFenetre();
        if (!form.hidden) editer(false);
      } else if (!avant) poserStats();
    },
    focus() {
      tp.retour.focus();
    },
    // Échap : fenêtre d'export ou d'import, puis édition du pseudo (true : traité) ; sinon l'écran se ferme (menu.js).
    echap() {
      if (ouverte) {
        fermerFenetre();
        return true;
      }
      if (!form.hidden) {
        editer(false);
        return true;
      }
      return false;
    },
    etat: () => ({ avatar: lireProfil().avatar, pseudo: lireProfil().pseudo, fenetre: ouverte ? ouverte.element.id : null, depot: mode.base, stats: [...stats.querySelectorAll('.e10-stat')].map((n) => [n.dataset.stat, n.querySelector('.e10-stat-valeur').dataset.valeur]) }),
  };
}
