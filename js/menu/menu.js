// Lot 8a : menu principal E8 (Docs/ref/menu-principal.md), affiché quand le chargement (E7) est fini. En-tête E8-1 : « Connexion » (écran
// provisoire), solde (lecture seule de la sauvegarde existante), bouton à trois barres (Options, Information et son point jaune, Discord,
// Déconnexion grisée) ; contenu de l'onglet ; barre d'onglets E8-2 (Boutique · Personnage · JOUER · Infini · Event verrouillé). « JOUER » fait
// charger le jeu sans recharger la page (jouer() : écran de chargement du jeu, puis main.js). État en mémoire seulement (js/core/menu-etat.js) : rien
// n'est écrit dans le stockage jusqu'au lot 8h. preparerMenu() lit ce que le menu affiche (textes, nouveautés, liens, solde), sans rien du jeu.
// Écrans à la demande : js/menu/ecrans.js (Information, Connexion, onglets « Bientôt »), js/menu/infini.js (lot 8b : onglet Infini), js/game/options-menu.js
// (lot 8c : page Options E5, écran plein, avec les réglages résolus sans Three.js par graphicsReglages() et le son gardé en mémoire par demarrage.js).
// Lot 8b : onglet Jouer (js/menu/jouer.js, chargé avec le menu) ; option de démarrage (histoire ou infini) passée à jouer().
import { formatMoney } from '../core/economy.js';
import { basculerMenu, choisirOnglet, creerEtatMenu, ECRANS_PLEINS, SOUS_MENUS, fermerEcran, fermerMenu, lienExterne, lireMondes, lireOptionDemarrage, lireRecord, nouveauteNonLue, ONGLETS, ouvrirEcran, premierJouable } from '../core/menu-etat.js';
import { ecranJouer } from './jouer.js';
import { gouttePath } from '../logo.js';
import { fmt, loadDict } from '../game/texts.js';
import { graphicsReglages, pageSearch } from '../game/graphics-boot.js';
import { createRepository } from '../save/index.js';

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
  // Lot 8d : entrées du menu à trois barres (maquette MenuOuvert.html, ramenées à 16 × 16).
  options: 'M10 8a2 2 0 1 1-4 0 2 2 0 0 1 4 0ZM8 1.3v2M8 12.7v2M1.3 8h2M12.7 8h2M3.3 3.3l1.4 1.4M11.3 11.3l1.4 1.4M3.3 12.7l1.4-1.4M11.3 4.7l1.4-1.4',
  information: 'M14 8A6 6 0 1 1 2 8a6 6 0 0 1 12 0ZM8 7.3v4M8 5v.3',
  deconnexion: 'M9.3 2.7h3.4v10.6H9.3M6.7 5.3 4 8l2.7 2.7M4 8h6.7',
};
// Logo de Discord (retour du propriétaire : à la place de la bulle), forme pleine en 24 × 24 (tracé du jeu d'icônes libre Simple Icons, CC0).
const LOGO_DISCORD = 'M20.317 4.3698a19.7913 19.7913 0 00-4.8851-1.5152.0741.0741 0 00-.0785.0371c-.211.3753-.4447.8648-.6083 1.2495-1.8447-.2762-3.68-.2762-5.4868 0-.1636-.3933-.4058-.8742-.6177-1.2495a.077.077 0 00-.0785-.037 19.7363 19.7363 0 00-4.8852 1.515.0699.0699 0 00-.0321.0277C.5334 9.0458-.319 13.5799.0992 18.0578a.0824.0824 0 00.0312.0561c2.0528 1.5076 4.0413 2.4228 5.9929 3.0294a.0777.0777 0 00.0842-.0276c.4616-.6304.8731-1.2952 1.226-1.9942a.076.076 0 00-.0416-.1057c-.6528-.2476-1.2743-.5495-1.8722-.8923a.077.077 0 01-.0076-.1277c.1258-.0943.2517-.1923.3718-.2914a.0743.0743 0 01.0776-.0105c3.9278 1.7933 8.18 1.7933 12.0614 0a.0739.0739 0 01.0785.0095c.1202.099.246.1981.3728.2924a.077.077 0 01-.0066.1276 12.2986 12.2986 0 01-1.873.8914.0766.0766 0 00-.0407.1067c.3604.698.7719 1.3628 1.225 1.9932a.076.076 0 00.0842.0286c1.961-.6067 3.9495-1.5219 6.0023-3.0294a.077.077 0 00.0313-.0552c.5004-5.177-.8382-9.6739-3.5485-13.6604a.061.061 0 00-.0312-.0286zM8.02 15.3312c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9555-2.4189 2.157-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.9555 2.4189-2.1569 2.4189zm7.9748 0c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9554-2.4189 2.1569-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.946 2.4189-2.1568 2.4189Z';
const ONGLET_TEXTES = { boutique: 'game.menu.onglet.boutique', personnage: 'game.menu.onglet.personnage', jouer: 'game.menu.onglet.jouer', infini: 'game.menu.onglet.infini' };

export function el(tag, classes = [], attrs = {}) {
  const n = document.createElement(tag);
  if (classes.length) n.classList.add(...classes);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  return n;
}

export function icone(nom, classe = 'e8-icone') {
  const svg = document.createElementNS(SVG, 'svg');
  const logo = nom === 'discord';
  svg.setAttribute('viewBox', logo ? '0 0 24 24' : '0 0 16 16');
  svg.setAttribute('class', logo ? `${classe} e8-icone-logo` : classe);
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  if (nom === 'piece') {
    const c = document.createElementNS(SVG, 'circle');
    for (const [k, v] of Object.entries({ cx: '8', cy: '8', r: '6.5' })) c.setAttribute(k, v);
    svg.append(c);
  }
  const p = document.createElementNS(SVG, 'path');
  p.setAttribute('d', logo ? LOGO_DISCORD : ICONES[nom]);
  svg.append(p);
  return svg;
}

// Coulures du bandeau (lot 8d, retours du propriétaire : « comme celles du chargement », « à chaque ouverture d'un onglet ») : trois gouttes dessinées
// comme celles du logo (js/logo.js, gouttePath : col qui s'affine, renflement arrondi, bord dans l'ombre, reflet), qui s'allongent à chaque affichage
// de l'écran (e8-coulure : l'animation repart quand la section réapparaît) ; une petite goutte se forme au bout de la plus longue et tombe un peu
// (e8-goutte), sans atteindre le bloc suivant. Chaque goutte : vue 12 × h (unités = var(--u)), haut = bas du bandeau ; couleurs en jetons (css/menu.css).
export const COULURES_BANDEAU = Object.freeze([
  Object.freeze({ x: 14, w: 5, l: 10, b: 2.6, h: 13 }),
  Object.freeze({ x: 47, w: 6.5, l: 14.5, b: 3.2, h: 18 }),
  Object.freeze({ x: 82, w: 4, l: 6, b: 2.2, h: 8.5 }),
]);
const svgEl = (tag, attrs, classe) => {
  const n = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, String(v));
  if (classe) n.setAttribute('class', classe);
  return n;
};
function goutteBandeau(c, i) {
  const svg = svgEl('svg', { viewBox: `0 0 12 ${c.h}`, 'aria-hidden': 'true', focusable: 'false' }, `menu-coulure menu-coulure-${i + 1}`);
  svg.style.setProperty('--e8-x', `${c.x}%`);
  svg.style.setProperty('--e8-h', String(c.h));
  const flux = svgEl('g', {}, 'menu-coulure-flux');
  flux.style.setProperty('--e8-l', String(c.h));
  flux.append(
    svgEl('path', { d: gouttePath({ cx: 6, w: c.w, l: c.l, b: c.b }) }, 'menu-coulure-corps'),
    svgEl('path', { d: `M${6 + c.w * 0.4} 0L${6 + c.w * 0.38} ${c.l * 0.45}C${6 + c.w * 0.3} ${c.l * 0.7} ${6 + c.b * 0.95} ${c.l - c.b} ${6 + c.b * 0.8} ${c.l + c.b * 0.4}` }, 'menu-coulure-ombre'),
    svgEl('path', { d: `M${6 - c.w * 0.18} 1L${6 - c.w * 0.16} ${c.l * 0.5}` }, 'menu-coulure-reflet'),
    svgEl('ellipse', { cx: 6 - c.b * 0.38, cy: c.l - c.b * 0.25, rx: c.b * 0.3, ry: c.b * 0.48 }, 'menu-coulure-brillant'));
  svg.append(flux);
  if (i === 1) svg.append(svgEl('circle', { cx: 6, cy: c.l + c.b * 0.6, r: 1.1 }, 'menu-goutte'));
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
  coulures.append(...COULURES_BANDEAU.map(goutteBandeau));
  b.append(l, h, coulures);
  return b;
}

const json = (path) => fetch(path).then((r) => (r.ok ? r.json() : null)).catch(() => null);

// Chargement du menu (phase « menu » de l'écran de chargement) : textes, nouveautés, liens, mondes (lot 8b), et le solde et le record (lot 8b :
// records.bestWave, champ existant) lus dans la sauvegarde existante par son API (createRepository, lecture seule : load(), sans canal entre onglets
// ni écriture). onProgress(f) : part des fichiers reçus (0 à 1).
export async function preparerMenu({ search = pageSearch(), onProgress = () => {} } = {}) {
  let recus = 0;
  const suivre = (p) => p.then((v) => {
    recus += 1;
    onProgress(recus / 7);
    return v;
  });
  const [dict, infos, liens, save, economy, stats, mondes] = await Promise.all([
    suivre(loadDict()), suivre(json('data/menu/infos.json')), suivre(json('data/menu/liens.json')),
    suivre(json('data/game/save.json')), suivre(json('data/game/economy.json')), suivre(json('data/game/player-stats.json')), suivre(json('data/menu/mondes.json')),
  ]);
  let solde = 0;
  let record = null;
  let niveaux = null; // lot 8d : niveaux de statistiques de la sauvegarde (base des statistiques effectives), si elle est lue « ok » (comme la partie)
  try {
    const storage = (() => {
      try {
        return window.localStorage;
      } catch {
        return null;
      }
    })();
    const { repository } = createRepository({ search, storage, params: { save, economy, stats } });
    const lu = repository.load();
    if (lu && lu.save && Number.isFinite(lu.save.money)) solde = lu.save.money;
    record = lireRecord(lu?.save?.records?.bestWave);
    if (lu?.status === 'ok' && lu.save?.stats && typeof lu.save.stats === 'object') niveaux = { ...lu.save.stats };
  } catch {
    // sauvegarde illisible ou stockage bloqué : solde 0 et record « — » affichés, rien n'est écrit
  }
  return { dict, infos: Array.isArray(infos?.infos) ? infos.infos : [], liens: liens ?? {}, solde, record, mondes: lireMondes(mondes), niveaux, statsCfg: stats };
}

// son : { lire() → { coupe, volume }, poser(réglages) } (lot 8c, donné par demarrage.js : mémoire de la page, appliquée par main.js à « JOUER »).
// niveaux, statsCfg (lot 8d) : niveaux de la sauvegarde et data/game/player-stats.json, pour les statistiques effectives (Personnage, « JOUER »).
export function creerMenu({ dict, infos = [], liens = {}, solde: montant = 0, record = null, mondes = lireMondes(null), niveaux = null, statsCfg = null, jouer, son: memoireSon = null, root = document.body }) {
  const t = (k) => dict[k] ?? '';
  let etat = creerEtatMenu();
  const lien = lienExterne(liens?.discord);
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
  soldeTexte.textContent = formatMoney(montant);
  const soldeNom = el('span', ['sr-only']);
  soldeNom.textContent = fmt(t('game.menu.solde'), { n: formatMoney(montant) });
  solde.append(icone('piece', 'e8-icone e8-piece'), soldeTexte, soldeNom);
  const barres = el('button', ['e8-barres'], { type: 'button', id: 'menu-trois-barres', 'aria-expanded': 'false', 'aria-controls': 'menu-liste', 'aria-label': t('game.menu.ouvrir') });
  const pointBarres = el('span', ['menu-point', 'e8-point-barres'], { 'aria-hidden': 'true' });
  barres.append(icone('barres'), pointBarres);
  // Plein écran (retour du propriétaire après le lot 8c, comme l'icône de la pause : lot 5j-G) : coins vers l'extérieur, vers l'intérieur une fois en
  // plein écran (« Quitter le plein écran ») ; masqué sans l'API (ex. iPhone). « JOUER » ne recharge pas la page : la partie reste en plein écran.
  const peutPleinEcran = Boolean(document.fullscreenEnabled && document.documentElement.requestFullscreen);
  const pleinEcran = el('button', ['e8-plein-ecran'], { type: 'button', id: 'menu-plein-ecran', 'data-active': 'false' });
  pleinEcran.hidden = !peutPleinEcran;
  const svgPlein = document.createElementNS(SVG, 'svg');
  for (const [k, v] of Object.entries({ viewBox: '0 0 16 16', class: 'e8-icone', 'aria-hidden': 'true', focusable: 'false' })) svgPlein.setAttribute(k, v);
  for (const [classe, d] of [['e8-fs-entrer', 'M2.5 6V2.5H6M10 2.5h3.5V6M13.5 10v3.5H10M6 13.5H2.5V10'], ['e8-fs-sortir', 'M6 2.5V6H2.5M10 2.5V6h3.5M13.5 10H10v3.5M6 13.5V10H2.5']]) {
    const p = document.createElementNS(SVG, 'path');
    p.setAttribute('class', classe);
    p.setAttribute('d', d);
    svgPlein.append(p);
  }
  pleinEcran.append(svgPlein);
  droite.append(solde, pleinEcran, barres);

  // Menu à trois barres : juste sous le bouton, aligné à droite.
  const liste = el('div', ['e8-liste'], { id: 'menu-liste' });
  liste.hidden = true;
  // Lot 8d (retour du propriétaire : menu trop allongé, peu distinct) : icône de chaque entrée (maquette MenuOuvert.html).
  const entree = (id, cle, extra = [], ico = null) => {
    const b = el('button', ['e8-entree'], { type: 'button', id });
    const s = el('span');
    s.textContent = t(cle);
    if (ico) b.append(icone(ico, 'e8-icone e8-icone-entree'));
    b.append(s, ...extra);
    return b;
  };
  const note = (cle) => Object.assign(el('span', ['e8-note']), { textContent: t(cle) });
  const btOptions = entree('menu-options', 'game.menu.options', [], 'options');
  const pointInfo = el('span', ['menu-point', 'e8-point-info'], { id: 'menu-point-info' });
  pointInfo.append(Object.assign(el('span', ['sr-only']), { textContent: t('game.menu.nouveau') }));
  const btInfo = entree('menu-information', 'game.menu.information', [pointInfo], 'information');
  const discordPlace = el('li');
  const btDeconnexion = entree('menu-deconnexion', 'game.menu.deconnexion', [note('game.menu.nonConnecte')], 'deconnexion');
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
      n.append(icone('discord', 'e8-icone e8-icone-entree'), s, icone('externe', 'e8-icone e8-externe'), Object.assign(el('span', ['sr-only']), { textContent: ` (${t('game.menu.nouvelOnglet')})` }));
    } else {
      n = entree('menu-discord', 'game.menu.discord', [note('game.menu.bientot')], 'discord');
      n.disabled = true;
    }
    discordPlace.replaceChildren(n);
  }
  poserDiscord();

  // --- Contenu et onglets E8-2 ----------------------------------------------------------------------------------------------------------------
  const contenu = el('main', ['e8-contenu'], { id: 'menu-contenu', 'aria-label': t('game.menu.aria') });
  // Lot 8b : onglet Jouer (js/menu/jouer.js) : scène animée du monde choisi (le premier jouable), record et portes (lecture seule), « JOUER ».
  const monde = premierJouable(mondes);
  const { section: jouerSection, scene: jouerScene, bouton: btJouer } = ecranJouer({ t, monde, mondes, record, bandeau });
  const scenes = new Map([['jouer', jouerScene]]); // onglet → scène animée (en pause hors de l'écran)
  ecransOnglets.set('jouer', jouerSection);
  contenu.append(jouerSection);

  const nav = el('nav', ['e8-onglets'], { 'data-block': 'E8-2', 'aria-label': t('game.menu.onglets') });
  const boutonsOnglets = new Map();
  for (const o of ONGLETS) {
    const b = el('button', ['e8-onglet', `e8-onglet-${o.id}`], { type: 'button', id: `menu-onglet-${o.id}`, 'data-onglet': o.id });
    if (o.verrouille) {
      b.disabled = true;
      b.classList.add('menu-ruban');
      // Lot 8d (retour du propriétaire) : « Prochainement » écrit sous le cadenas ; nom accessible : « Prochainement : contenu verrouillé ».
      b.setAttribute('aria-label', `${t('game.menu.prochainement')} : ${t('game.menu.verrouille').toLocaleLowerCase('fr')}`);
      const nom = el('span', ['e8-onglet-nom']);
      nom.textContent = t('game.menu.prochainement');
      b.append(icone('cadenas', 'e8-icone e8-cadenas'), nom);
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
    // Lot 8c : page Options (écran plein) : la barre d'onglets et l'écran de l'onglet sont masqués ; « ‹ Menu » revient à l'onglet d'où l'on venait.
    // Lot 8d : sous-menus du Personnage (Inventaire, Fusion, Personnages), écrans pleins eux aussi ; « ‹ Équipement » revient à l'écran Personnage.
    const plein = ECRANS_PLEINS.includes(etat.ecran);
    const sous = SOUS_MENUS.includes(etat.ecran); // sous-menu du Personnage : à la place de l'écran de l'onglet, barre d'onglets visible
    box.dataset.ecran = plein || sous ? etat.ecran : '';
    nav.hidden = plein;
    for (const [id, s] of ecransOnglets) s.hidden = id !== etat.onglet || plein || sous;
    perso?.synchroniser(etat.ecran);
    animer();
    liste.hidden = !etat.menuOuvert;
    barres.setAttribute('aria-expanded', String(etat.menuOuvert));
    const nonLue = nouveauteNonLue(infos, etat.lues);
    pointInfo.hidden = !nonLue;
    pointBarres.hidden = !nonLue;
    barres.setAttribute('aria-label', t(nonLue ? 'game.menu.ouvrir.nouveau' : 'game.menu.ouvrir'));
  }

  // Lot 8b : animations de la scène de l'onglet affiché seulement, et jamais quand la page est cachée (data-anim : off = en pause).
  function animer() {
    for (const [id, scene] of scenes) scene.dataset.anim = id === etat.onglet && etat.ecran !== 'options' && !document.hidden ? 'on' : 'off';
    box.classList.toggle('e8-pause', document.hidden || lance); // lot 8d : coulures des bandeaux en pause (page cachée, partie lancée)
    // Lot 8d : écran Personnage ou sous-menu affiché (animations e9-*), en pause ailleurs et quand la page est cachée.
    const actif = etat.onglet === 'personnage' && !document.hidden && !lance ? (etat.ecran === null ? 'personnage' : etat.ecran) : null;
    perso?.animer(actif);
  }
  document.addEventListener('visibilitychange', animer);

  function syncPleinEcran() {
    const actif = Boolean(document.fullscreenElement);
    pleinEcran.dataset.active = String(actif);
    pleinEcran.setAttribute('aria-label', t(actif ? 'game.pause.fullscreenExit' : 'game.pause.fullscreen'));
  }
  pleinEcran.addEventListener('click', () => {
    if (!peutPleinEcran) return;
    if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
    else document.documentElement.requestFullscreen({ navigationUI: 'hide' }).catch(() => {});
  });
  document.addEventListener('fullscreenchange', syncPleinEcran);
  syncPleinEcran();

  const ecrans = () => import('./ecrans.js');

  let infini = null; // lot 8b : écran Infini (js/menu/infini.js, chargé au premier affichage) : { section, scene, etat() }
  let perso = null; // lot 8d : écran Personnage (js/menu/personnage.js, chargé au premier affichage) et ses sous-menus
  async function changerOnglet(id) {
    if (SOUS_MENUS.includes(etat.ecran)) etat = fermerEcran(etat); // lot 8d : un onglet touché referme le sous-menu du Personnage
    etat = choisirOnglet(etat, id);
    if (!ecransOnglets.has(etat.onglet)) {
      const onglet = etat.onglet;
      let s;
      if (onglet === 'infini') {
        const m = await import('./infini.js');
        infini = await m.ecranInfini({ t, mondes, bandeau, jouer: lancer });
        s = infini.section;
        scenes.set('infini', infini.scene);
      } else if (onglet === 'personnage') {
        const m = await import('./personnage.js');
        const ecran = await m.ecranPersonnage({
          t, bandeau, niveaux, statsCfg, root: contenu,
          poserEcran: (nom) => {
            etat = nom ? ouvrirEcran(etat, nom) : fermerEcran(etat);
            synchroniser();
          },
        });
        perso ??= ecran;
        s = ecran.section;
      } else {
        const m = await ecrans();
        s = m.ecranBientot({ dict, id: onglet, titre: t(ONGLET_TEXTES[onglet]) });
      }
      if (!ecransOnglets.has(onglet)) {
        ecransOnglets.set(onglet, s);
        contenu.append(s);
      }
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
    options?.close(); // lot 8c : un seul écran à la fois (la page Options laisse la place à Information ou Connexion)
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
      // Lot 8c : page Options (E5, composant partagé avec la partie, contexte « menu » : tout est modifiable). Réglages graphiques résolus sans
      // précharger les lampes (graphicsReglages : ni Three.js ni données du jeu), écrits dans zs.device.v1 comme avant et relus par le jeu à « JOUER ».
      // Son et volume : mémoire de la page (demarrage.js, donnée par l'écran de chargement), appliquée par main.js à « JOUER » ; défaut et pas : audio.json.
      if (!options) {
        const [{ creerOptions }, { createGraphicsController }, gfx, audio] = await Promise.all([
          import('../game/options-menu.js'), import('../game/graphics-apply.js'), graphicsReglages(), json('data/game/audio.json'),
        ]);
        let local = { coupe: false, volume: null }; // sans mémoire donnée (créateur de test) : réglages de cet écran seulement
        const lire = () => memoireSon?.lire() ?? local;
        const poser = (r) => (memoireSon ? memoireSon.poser(r) : (local = { ...local, ...r }));
        const volume = audio?.volume ?? {};
        const defaut = Number.isFinite(volume.default) ? volume.default : 100;
        const pas = Number.isFinite(volume.step) ? volume.step : 10;
        const son = {
          etat: () => ({ disponible: true, coupe: lire().coupe, volume: lire().volume ?? defaut, pas }),
          couper: (coupe) => poser({ coupe }),
          regler: (n) => poser({ volume: n }),
        };
        const graphics = createGraphicsController(gfx, { dict, contexte: 'menu' });
        if (etat.ecran !== 'options') return; // fermée pendant le chargement
        options = creerOptions({ contexte: 'menu', dict, graphics, son, bandeau, onClose: () => fermerOptions(), root: contenu });
      }
      if (etat.ecran === 'options') options.open();
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

  // « JOUER » : le menu laisse la place à l'écran de chargement du jeu (chargement.js, demarrage.js). Lot 8b : option de démarrage (mode histoire
  // depuis l'onglet Jouer, mode infini depuis l'onglet Infini), validée (lireOptionDemarrage), sans paramètre d'adresse.
  // Lot 8d : les niveaux effectifs (équipement porté et capacité du personnage choisi, js/core/equipement.js) partent dans l'option (champ stats) ;
  // l'équipement de départ est chargé ici si l'onglet Personnage n'a jamais été ouvert ; données absentes : la partie lit la sauvegarde.
  let lance = false;
  async function lancer(option) {
    if (lance) return;
    lance = true;
    document.removeEventListener('keydown', clavier, true);
    document.removeEventListener('pointerdown', dehors, true);
    document.removeEventListener('visibilitychange', animer);
    document.removeEventListener('fullscreenchange', syncPleinEcran);
    for (const scene of scenes.values()) scene.dataset.anim = 'off';
    perso?.animer(null);
    box.classList.add('e8-pause');
    let stats;
    try {
      const equipement = await (await import('./equipement-etat.js')).chargerEquipement();
      stats = equipement.statistiques(niveaux, statsCfg).niveaux;
    } catch {
      stats = null; // données absentes : la partie lit la sauvegarde
    }
    statsLancees = stats;
    if (stats) option = { ...option, stats };
    jouer(lireOptionDemarrage(option, mondes));
  }
  let statsLancees = null;
  btJouer.addEventListener('click', () => lancer({ mode: 'histoire', monde: monde.id }));

  // Échap : Options (confirmation d'abord), puis l'écran ouvert, puis le menu à trois barres, puis (lot 8d) le sous-menu du Personnage. Un appui
  // ailleurs ferme le menu à trois barres.
  function clavier(e) {
    if (e.code !== 'Escape') return;
    if (dialogue) dialogue.close();
    else if (etat.ecran === 'options') fermerOptions();
    else if (etat.menuOuvert) fermerListe(true);
    else if (perso?.echap()) {
      // lot 8d : sous-menu du Personnage refermé (retour à l'écran Personnage)
    }
    else return;
    e.preventDefault();
  }
  function dehors(e) {
    if (etat.menuOuvert && !liste.contains(e.target) && !barres.contains(e.target)) fermerListe(false);
  }
  document.addEventListener('keydown', clavier, true);
  document.addEventListener('pointerdown', dehors, true);

  synchroniser();
  return {
    element: box,
    etat: () => ({ pleinEcran: { disponible: peutPleinEcran, actif: Boolean(document.fullscreenElement) }, onglet: etat.onglet, menuOuvert: etat.menuOuvert, ecran: etat.ecran, nonLue: nouveauteNonLue(infos, etat.lues), solde: montant, discord: lien.actif, record, monde: monde.id, infini: infini?.etat() ?? null, personnage: perso?.etat() ?? null, niveaux, statsLancees }),
  };
}
