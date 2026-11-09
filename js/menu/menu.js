// Lot 8a : menu principal E8 (Docs/ref/menu-principal.md), affiché quand le chargement (E7) est fini. En-tête E8-1 : « Connexion » (écran
// provisoire), solde (lecture seule de la sauvegarde existante), bouton à trois barres (Options, Information et son point jaune, Discord,
// Déconnexion grisée) ; contenu de l'onglet ; barre d'onglets E8-2 (Boutique · Personnage · JOUER · Infini · Event verrouillé). « JOUER » lance la
// partie sans recharger la page (api.jouer). État en mémoire seulement (js/core/menu-etat.js) : rien n'est écrit dans le stockage jusqu'au lot 8h.
// Écrans à la demande : js/menu/ecrans.js (Information, Connexion, onglets « Bientôt »), js/game/options-menu.js (Options, E2-12).
import { formatMoney } from '../core/economy.js';
import { basculerMenu, choisirOnglet, creerEtatMenu, fermerEcran, fermerMenu, lienExterne, nouveauteNonLue, ONGLETS, ouvrirEcran } from '../core/menu-etat.js';
import { decorNuit } from './chargement.js';
import { fmt } from '../game/texts.js';

const SVG = 'http://www.w3.org/2000/svg';
// Icônes au trait (16 × 16), décoratives.
const ICONES = {
  connexion: 'M8 2.2a2.8 2.8 0 1 1 0 5.6 2.8 2.8 0 0 1 0-5.6ZM2.8 14c0-2.9 2.3-4.8 5.2-4.8s5.2 1.9 5.2 4.8',
  barres: 'M2 4h12M2 8h12M2 12h12',
  piece: 'M8 4.2v7.6M5.6 6.2h3.7a1.2 1.2 0 0 1 0 2.4H6.7a1.2 1.2 0 0 0 0 2.4h3.7',
  boutique: 'M3 5.5h10l-1 8.5H4zM5.5 5.5V4a2.5 2.5 0 0 1 5 0v1.5',
  personnage: 'M8 1.8a2.4 2.4 0 1 1 0 4.8 2.4 2.4 0 0 1 0-4.8ZM4 14.2V10c0-1.5 1.2-2.6 2.6-2.6h2.8C10.8 7.4 12 8.5 12 10v4.2',
  infini: 'M8 8c-1.4-1.9-2.6-3-4-3a3 3 0 0 0 0 6c1.4 0 2.6-1.1 4-3Zm0 0c1.4 1.9 2.6 3 4 3a3 3 0 0 0 0-6c-1.4 0-2.6 1.1-4 3Z',
  cadenas: 'M4 7.5h8v6.5H4zM5.6 7.5V5.4a2.4 2.4 0 0 1 4.8 0v2.1M8 10.2v1.6',
  externe: 'M9.5 2.5h4v4M13.5 2.5 7.5 8.5M12 9.5v4H2.5V4h4',
};
const ONGLET_TEXTES = { boutique: 'game.menu.onglet.boutique', personnage: 'game.menu.onglet.personnage', jouer: 'game.menu.onglet.jouer', infini: 'game.menu.onglet.infini' };

export function el(tag, classes = [], attrs = {}) {
  const n = document.createElement(tag);
  if (classes.length) n.classList.add(...classes);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  return n;
}

export function icone(nom, classe = 'e8-icone') {
  const svg = document.createElementNS(SVG, 'svg');
  svg.setAttribute('viewBox', '0 0 16 16');
  svg.setAttribute('class', classe);
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  if (nom === 'piece') {
    const c = document.createElementNS(SVG, 'circle');
    for (const [k, v] of Object.entries({ cx: '8', cy: '8', r: '6.5' })) c.setAttribute(k, v);
    svg.append(c);
  }
  const p = document.createElementNS(SVG, 'path');
  p.setAttribute('d', ICONES[nom]);
  svg.append(p);
  return svg;
}

// Bandeau de titre rouge à coulures (même place sur tous les écrans : bord gauche du contenu, sous l'en-tête) : petit libellé, titre.
export function bandeau(libelle, titre, id) {
  const b = el('div', ['menu-bandeau']);
  const l = el('p', ['menu-bandeau-libelle']);
  l.textContent = libelle;
  const h = el('h2', ['menu-bandeau-titre'], { id });
  h.textContent = titre;
  const coulures = el('span', ['menu-bandeau-coulures'], { 'aria-hidden': 'true' });
  for (const n of [1, 2, 3]) coulures.append(el('span', ['menu-bandeau-coulure', `menu-bandeau-coulure-${n}`]));
  b.append(l, h, coulures);
  return b;
}

export function creerMenu({ dict, repository, graphics, vhs = null, jouer, root = document.body, donnees = null }) {
  const t = (k) => dict[k] ?? '';
  let etat = creerEtatMenu();
  let infos = [];
  let lien = lienExterne('');
  let options = null; // écran Options (créé à la première ouverture)
  let dialogue = null; // écran Information ou Connexion ouvert : { close, escape, element }
  let retourFocus = null;
  const ecransOnglets = new Map(); // id → section (créée au premier affichage)

  const box = el('div', ['e8'], { id: 'e8', 'data-block': 'E8' });

  // --- En-tête E8-1 -------------------------------------------------------------------------------------------------------------------------
  const entete = el('header', ['e8-entete'], { 'data-block': 'E8-1' });
  const connexion = el('button', ['e8-connexion'], { type: 'button', id: 'menu-connexion' });
  const connexionTexte = el('span');
  connexionTexte.textContent = t('game.menu.connexion');
  connexion.append(icone('connexion'), connexionTexte);
  const droite = el('div', ['e8-droite']);
  const solde = el('p', ['e8-solde'], { id: 'menu-solde' });
  const soldeTexte = el('span', ['e8-solde-texte'], { id: 'menu-solde-texte', 'aria-hidden': 'true' });
  const lu = repository?.load?.();
  const montant = lu && lu.save && Number.isFinite(lu.save.money) ? lu.save.money : 0;
  soldeTexte.textContent = formatMoney(montant);
  const soldeNom = el('span', ['sr-only']);
  soldeNom.textContent = fmt(t('game.menu.solde'), { n: formatMoney(montant) });
  solde.append(icone('piece', 'e8-icone e8-piece'), soldeTexte, soldeNom);
  const barres = el('button', ['e8-barres'], { type: 'button', id: 'menu-trois-barres', 'aria-expanded': 'false', 'aria-controls': 'menu-liste', 'aria-label': t('game.menu.ouvrir') });
  const pointBarres = el('span', ['menu-point', 'e8-point-barres'], { 'aria-hidden': 'true' });
  barres.append(icone('barres'), pointBarres);
  droite.append(solde, barres);

  // Menu à trois barres : juste sous le bouton, aligné à droite.
  const liste = el('div', ['e8-liste'], { id: 'menu-liste' });
  liste.hidden = true;
  const entree = (id, cle, extra = []) => {
    const b = el('button', ['e8-entree'], { type: 'button', id });
    const s = el('span');
    s.textContent = t(cle);
    b.append(s, ...extra);
    return b;
  };
  const note = (cle) => Object.assign(el('span', ['e8-note']), { textContent: t(cle) });
  const btOptions = entree('menu-options', 'game.menu.options');
  const pointInfo = el('span', ['menu-point', 'e8-point-info'], { id: 'menu-point-info' });
  pointInfo.append(Object.assign(el('span', ['sr-only']), { textContent: t('game.menu.nouveau') }));
  const btInfo = entree('menu-information', 'game.menu.information', [pointInfo]);
  const discordPlace = el('li');
  const btDeconnexion = entree('menu-deconnexion', 'game.menu.deconnexion', [note('game.menu.nonConnecte')]);
  btDeconnexion.disabled = true;
  const li = (n) => {
    const item = el('li');
    item.append(n);
    return item;
  };
  const haut = el('ul', ['e8-liste-groupe']);
  haut.append(li(btOptions), li(btInfo), discordPlace);
  const bas = el('ul', ['e8-liste-groupe']);
  bas.append(li(btDeconnexion));
  liste.append(haut, el('hr', ['e8-separateur']), bas);
  entete.append(connexion, droite, liste);

  function poserDiscord() {
    let n;
    if (lien.actif) {
      n = el('a', ['e8-entree'], { id: 'menu-discord', href: lien.adresse, target: '_blank', rel: 'noopener noreferrer' });
      const s = el('span');
      s.textContent = t('game.menu.discord');
      n.append(s, icone('externe', 'e8-icone e8-externe'), Object.assign(el('span', ['sr-only']), { textContent: ` (${t('game.menu.nouvelOnglet')})` }));
    } else {
      n = entree('menu-discord', 'game.menu.discord', [note('game.menu.bientot')]);
      n.disabled = true;
    }
    discordPlace.replaceChildren(n);
  }
  poserDiscord();

  // --- Contenu et onglets E8-2 ----------------------------------------------------------------------------------------------------------------
  const contenu = el('main', ['e8-contenu'], { id: 'menu-contenu', 'aria-label': t('game.menu.aria') });
  const jouerSection = el('section', ['e8-ecran', 'e8-jouer'], { id: 'menu-ecran-jouer', 'aria-labelledby': 'menu-titre-jouer' });
  const decor = el('div', ['e8-jouer-decor'], { 'aria-hidden': 'true' });
  decor.append(decorNuit('e8-decor'));
  const btJouer = el('button', ['menu-peint', 'e8-jouer-bouton'], { type: 'button', id: 'menu-jouer' });
  btJouer.textContent = t('game.menu.jouer.bouton');
  jouerSection.append(decor, bandeau(t('game.menu.jouer.libelle'), t('game.menu.jouer.titre'), 'menu-titre-jouer'), btJouer);
  ecransOnglets.set('jouer', jouerSection);
  contenu.append(jouerSection);

  const nav = el('nav', ['e8-onglets'], { 'data-block': 'E8-2', 'aria-label': t('game.menu.onglets') });
  const boutonsOnglets = new Map();
  for (const o of ONGLETS) {
    const b = el('button', ['e8-onglet', `e8-onglet-${o.id}`], { type: 'button', id: `menu-onglet-${o.id}`, 'data-onglet': o.id });
    if (o.verrouille) {
      b.disabled = true;
      b.classList.add('menu-ruban');
      b.setAttribute('aria-label', t('game.menu.verrouille'));
      b.append(icone('cadenas', 'e8-icone e8-cadenas'));
    } else {
      if (!o.central) b.append(icone(o.id, 'e8-icone e8-icone-onglet'));
      const s = el('span', ['e8-onglet-nom']);
      s.textContent = t(ONGLET_TEXTES[o.id]);
      b.append(s);
      b.addEventListener('click', () => changerOnglet(o.id));
    }
    boutonsOnglets.set(o.id, b);
    nav.append(b);
  }

  box.append(entete, contenu, nav, el('div', ['menu-grain'], { 'aria-hidden': 'true' }));
  root.append(box);

  // --- Comportements --------------------------------------------------------------------------------------------------------------------------
  function synchroniser() {
    for (const [id, b] of boutonsOnglets) {
      if (b.disabled) continue;
      if (id === etat.onglet) b.setAttribute('aria-current', 'page');
      else b.removeAttribute('aria-current');
    }
    for (const [id, s] of ecransOnglets) s.hidden = id !== etat.onglet;
    liste.hidden = !etat.menuOuvert;
    barres.setAttribute('aria-expanded', String(etat.menuOuvert));
    const nonLue = nouveauteNonLue(infos, etat.lues);
    pointInfo.hidden = !nonLue;
    pointBarres.hidden = !nonLue;
    barres.setAttribute('aria-label', t(nonLue ? 'game.menu.ouvrir.nouveau' : 'game.menu.ouvrir'));
  }

  const ecrans = () => import('./ecrans.js');

  async function changerOnglet(id) {
    etat = choisirOnglet(etat, id);
    if (!ecransOnglets.has(etat.onglet)) {
      const m = await ecrans();
      const s = m.ecranBientot({ dict, id: etat.onglet, titre: t(ONGLET_TEXTES[etat.onglet]) });
      ecransOnglets.set(etat.onglet, s);
      contenu.append(s);
    }
    synchroniser();
  }

  function fermerListe(focus) {
    if (!etat.menuOuvert) return;
    etat = fermerMenu(etat);
    synchroniser();
    if (focus) barres.focus();
  }

  barres.addEventListener('click', () => {
    etat = basculerMenu(etat);
    synchroniser();
    if (etat.menuOuvert) btOptions.focus();
  });

  async function ouvrirDialogue(nom, opener) {
    etat = ouvrirEcran(etat, nom, infos);
    synchroniser();
    retourFocus = opener;
    const m = await ecrans();
    const fermer = () => {
      dialogue?.element.remove();
      dialogue = null;
      etat = fermerEcran(etat);
      synchroniser();
      retourFocus?.focus();
    };
    dialogue = nom === 'information' ? m.ecranInformation({ dict, infos, onClose: fermer, root: box }) : m.ecranConnexion({ dict, onClose: fermer, root: box });
  }

  connexion.addEventListener('click', () => ouvrirDialogue('connexion', connexion));
  btInfo.addEventListener('click', () => ouvrirDialogue('information', barres));
  btOptions.addEventListener('click', async () => {
    etat = ouvrirEcran(etat, 'options');
    synchroniser();
    try {
      options ??= (await import('../game/options-menu.js')).createOptionsMenu({ dict, graphics, vhs, onClose: () => fermerOptions() });
      options.open();
    } catch {
      fermerOptions();
    }
  });
  function fermerOptions() {
    options?.close();
    etat = fermerEcran(etat);
    synchroniser();
    barres.focus();
  }

  btJouer.addEventListener('click', () => {
    document.removeEventListener('keydown', clavier, true);
    document.removeEventListener('pointerdown', dehors, true);
    box.remove();
    jouer();
  });

  // Échap : Options (confirmation d'abord), puis l'écran ouvert, puis le menu à trois barres. Un appui ailleurs ferme le menu à trois barres.
  function clavier(e) {
    if (e.code !== 'Escape') return;
    if (etat.ecran === 'options') {
      if (!options?.escape()) fermerOptions();
    } else if (dialogue) dialogue.close();
    else if (etat.menuOuvert) fermerListe(true);
    else return;
    e.preventDefault();
  }
  function dehors(e) {
    if (etat.menuOuvert && !liste.contains(e.target) && !barres.contains(e.target)) fermerListe(false);
  }
  document.addEventListener('keydown', clavier, true);
  document.addEventListener('pointerdown', dehors, true);

  // Données du menu (nouveautés et liens) : lues une fois ; le point jaune paraît dès qu'elles sont là.
  const json = (path) => fetch(path).then((r) => (r.ok ? r.json() : null)).catch(() => null);
  const pretes = Promise.all([donnees?.infos ?? json('data/menu/infos.json'), donnees?.liens ?? json('data/menu/liens.json')]).then(([i, l]) => {
    infos = Array.isArray(i?.infos) ? i.infos : [];
    lien = lienExterne(l?.discord);
    poserDiscord();
    synchroniser();
  });

  synchroniser();
  return {
    element: box,
    pretes,
    etat: () => ({ onglet: etat.onglet, menuOuvert: etat.menuOuvert, ecran: etat.ecran, nonLue: nouveauteNonLue(infos, etat.lues), solde: montant, discord: lien.actif }),
  };
}
