// Lot 8a : menu principal E8 (Docs/ref/menu-principal.md), affiché quand le chargement (E7) est fini. En-tête E8-1 : « Connexion » (écran
// provisoire), solde (lecture seule de la sauvegarde existante), bouton à trois barres (Options, Information et son point jaune, Discord,
// Déconnexion grisée) ; contenu de l'onglet ; barre d'onglets E8-2 (Boutique · Personnage · JOUER · Infini · Event verrouillé). « JOUER » fait
// charger le jeu sans recharger la page (jouer() : écran de chargement du jeu, puis main.js). État en mémoire seulement (js/core/menu-etat.js) : rien
// n'est écrit dans le stockage jusqu'au lot 8h. preparerMenu() lit ce que le menu affiche (textes, nouveautés, liens, solde), sans rien du jeu.
// Écrans à la demande : js/menu/ecrans.js (Information, Connexion, onglets « Bientôt »), js/menu/infini.js (lot 8b : onglet Infini), js/game/options-menu.js
// (lot 8c : page Options E5, écran plein, avec les réglages résolus sans Three.js par graphicsReglages() et le son gardé en mémoire par demarrage.js).
// Lot 8b : onglet Jouer (js/menu/jouer.js, chargé avec le menu) ; option de démarrage (histoire ou infini) passée à jouer().
import { formatMoney } from '../core/economy.js';
import { basculerMenu, choisirOnglet, creerEtatMenu, fermerEcran, fermerMenu, lienExterne, lireMondes, lireOptionDemarrage, lireRecord, nouveauteNonLue, ONGLETS, ouvrirEcran, premierJouable } from '../core/menu-etat.js';
import { ecranJouer } from './jouer.js';
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
    // Lot 8c : page Options (écran plein) : la barre d'onglets et l'écran de l'onglet sont masqués ; « ‹ Menu » revient à l'onglet d'où l'on venait.
    const pageOptions = etat.ecran === 'options';
    box.dataset.ecran = pageOptions ? 'options' : '';
    nav.hidden = pageOptions;
    for (const [id, s] of ecransOnglets) s.hidden = id !== etat.onglet || pageOptions;
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
  async function changerOnglet(id) {
    etat = choisirOnglet(etat, id);
    if (!ecransOnglets.has(etat.onglet)) {
      const onglet = etat.onglet;
      let s;
      if (onglet === 'infini') {
        const m = await import('./infini.js');
        infini = await m.ecranInfini({ t, mondes, bandeau, jouer: lancer });
        s = infini.section;
        scenes.set('infini', infini.scene);
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

  // Échap : Options (confirmation d'abord), puis l'écran ouvert, puis le menu à trois barres. Un appui ailleurs ferme le menu à trois barres.
  function clavier(e) {
    if (e.code !== 'Escape') return;
    if (dialogue) dialogue.close();
    else if (etat.ecran === 'options') fermerOptions();
    else if (etat.menuOuvert) fermerListe(true);
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
    etat: () => ({ pleinEcran: { disponible: peutPleinEcran, actif: Boolean(document.fullscreenElement) }, onglet: etat.onglet, menuOuvert: etat.menuOuvert, ecran: etat.ecran, nonLue: nouveauteNonLue(infos, etat.lues), solde: montant, discord: lien.actif, record, monde: monde.id, infini: infini?.etat() ?? null, niveaux, statsLancees }),
  };
}
