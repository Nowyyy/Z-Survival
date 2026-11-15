// Lot 8a : démarrage de jeu.html (Docs/ref/menu-principal.md). Balise de jeu.html avant boot.js : décide « menu » ou « partie directe » d'après
// l'adresse autorisée (choixDemarrage de js/core/graphics.js, sur pageSearch()).
// - Partie directe (?test=1 sans menu=1, ou un paramètre de « Partie ») : js/game/main.js est importé tout de suite (avant le lot 8a, c'était une
//   balise de jeu.html) ; le jeu démarre exactement comme avant.
// - Menu : seul le menu se charge (feuille css/menu.css, écran de chargement E7 « menu », puis menu E8) ; au clic sur « JOUER », l'écran de
//   chargement revient (phase « jeu », chute du Z rejouée) et main.js est importé : Three.js, données, textures, sons et création du jeu se chargent à ce moment-là,
//   avec leur progression réelle (menuProgres, appelé par main.js ; sans effet en partie directe).
import { choixDemarrage, introAuDemarrage, REPERE_RETOUR } from '../core/graphics.js';
import { graphicsReboot, pageCanal, pageSearch } from '../game/graphics-boot.js';
import { browserStorage, createDeviceSettings } from '../save/device-settings.js';

export const modeMenu = choixDemarrage(pageCanal(), pageSearch()) === 'menu';

// Lot 8g : introduction du studio au vrai lancement seulement (introAuDemarrage, js/core/graphics.js) ; le repère #retour posé par menuRetour la fait
// sauter, puis il est retiré aussitôt de l'adresse affichée (#plein-ecran, lui, est lu et retiré par le menu). Aucun stockage.
const fragment = globalThis.location?.hash ?? '';
export const avecIntro = introAuDemarrage(pageCanal(), pageSearch(), fragment);
if (fragment === REPERE_RETOUR) globalThis.history?.replaceState(null, '', `${location.pathname}${location.search}`);

// Lot 8b : option de démarrage de la partie, posée par le menu (« JOUER » : histoire ; « Jouer » de l'onglet Infini : infini), lue par main.js
// (optionPartie) ; sans paramètre d'adresse, donc sans lecture seule de la sauvegarde. Partie directe : histoire, le bâtiment, sans stats.
let partie = Object.freeze({ mode: 'histoire', monde: 'batiment' });
export const optionPartie = () => partie;

// Lot 8c : son et volume choisis dans les Options du menu ; main.js les applique à l'audio de la partie (« JOUER » ne recharge pas la page).
// volume : null = défaut de data/game/audio.json. Lot 8i : volume = volume du jeu (effets) ; musique = volume de la musique (musique des menus,
// mélodie d'annonce de vague), null = même défaut. Lot 8h : gardés dans l'appareil (zs.device.v1, champ son { coupe, jeu, musique } :
// js/save/device-settings.js ; mémoire sous ?test=1 sans store=local) : relus au chargement de la page (menu et partie directe), écrits à chaque
// changement (Options du menu et de la pause : main.js appelle poserSon).
const appareil = (() => {
  try {
    return createDeviceSettings({ search: pageSearch(), storage: browserStorage() });
  } catch {
    return null;
  }
})();
const garde = (() => {
  try {
    return appareil?.read()?.son ?? null;
  } catch {
    return null;
  }
})();
let son = Object.freeze({ coupe: garde?.coupe === true, volume: garde?.jeu ?? null, musique: garde?.musique ?? null });
export const reglagesSon = () => son;
export function poserSon({ coupe = son.coupe, volume = son.volume, musique = son.musique } = {}) {
  const borner = (n, avant) => (n === null || !Number.isFinite(Number(n)) ? avant : Math.min(100, Math.max(0, Math.round(Number(n)))));
  const avant = son;
  son = Object.freeze({ coupe: coupe === true, volume: borner(volume, son.volume), musique: borner(musique, son.musique) });
  if (son.coupe !== avant.coupe || son.volume !== avant.volume || son.musique !== avant.musique) {
    try {
      appareil?.writeSon({ coupe: son.coupe, jeu: son.volume, musique: son.musique });
    } catch {
      // stockage bloqué : le réglage vaut pour la page
    }
  }
  return son;
}

// Avancées arrivées avant l'écran de chargement (import en cours) : gardées puis rejouées dans l'ordre.
const attente = [];
let ecran = null;

export function menuProgres(etape, fraction) {
  if (!modeMenu) return;
  if (ecran) ecran.progres(etape, fraction);
  else attente.push([etape, fraction]);
}

// Fin de la chute du Z de l'écran de chargement en cours (main.js, mode menu : la partie n'est créée qu'ensuite, pour ne pas tourner cachée).
export function menuChute() {
  return ecran?.chute ?? Promise.resolve();
}

// Retour au menu (« Quitter » confirmé, « Revenir au menu principal ») : rechargement de jeu.html sans les paramètres de « Partie » (menu=1 sous
// ?test=1). La partie ne peut pas être libérée sans rechargement (écouteurs, WebGL, audio) ; l'argent a déjà été écrit (bank.runEnd).
// Retour du propriétaire (« au retour au menu, le jeu sort du plein écran ») : un rechargement fait toujours quitter le plein écran (règle des
// navigateurs) ; en plein écran, l'adresse porte le repère #plein-ecran, et le menu le reprend au premier toucher (creerMenu, menu.js).
// Lot 8g (précision du propriétaire) : sinon, le repère #retour : l'introduction du studio ne se rejoue pas au retour (les deux repères valent retour).
export const REPERE_PLEIN_ECRAN = '#plein-ecran';
export async function menuRetour(loc = globalThis.location, doc = globalThis.document, hist = globalThis.history) {
  const { adresseRetour } = await import('../core/menu-etat.js');
  const search = adresseRetour(loc.search);
  const hash = doc?.fullscreenElement ? REPERE_PLEIN_ECRAN : REPERE_RETOUR;
  const adresse = `${loc.pathname}${search}${hash}`;
  if (search === loc.search) {
    if (hash !== loc.hash) hist?.replaceState(null, '', adresse);
    loc.reload();
  } else loc.replace(adresse);
}

// Feuille des écrans du menu (css/menu.css), une seule fois par page : chargée au démarrage en mode menu ; lot 8c : aussi par les Options de la
// partie (composant partagé avec le menu, js/game/options-menu.js), à leur première ouverture en partie directe (main.js la donne à ui.js).
let feuille = null;
export function feuilleMenu(doc = globalThis.document) {
  feuille ??= new Promise((resolve) => {
    if (doc.querySelector('link[rel="stylesheet"][href="css/menu.css"]')) {
      resolve();
      return;
    }
    const css = doc.createElement('link');
    css.rel = 'stylesheet';
    css.href = 'css/menu.css';
    css.addEventListener('load', resolve, { once: true });
    css.addEventListener('error', resolve, { once: true });
    doc.head.append(css);
  });
  return feuille;
}

// Chargement du jeu : Three.js préchargé (avant le lot 8a : balises modulepreload de jeu.html), puis le graphe de main.js.
function lancerJeu() {
  for (const href of ['vendor/three/three.module.js', 'vendor/three/three.core.js']) {
    const link = document.createElement('link');
    link.rel = 'modulepreload';
    link.href = href;
    document.head.append(link);
  }
  return import('../game/main.js');
}

if (!modeMenu) {
  document.documentElement.classList.remove('zs-attente'); // lot 8g : écran de préparation (jeu.html) montré en partie directe seulement
  lancerJeu();
} else {
  document.documentElement.classList.add('zs-mode-menu');
  // Tests (?test=1&menu=1) : état de l'écran de chargement en cours et du menu (phase, pourcentages affichés, onglet…), lecture seule.
  // Lot 8g : intro() : état de l'introduction du studio (null quand elle ne se joue pas).
  let introEcran = null;
  if (new URLSearchParams(pageSearch()).get('test') === '1') window.__zsMenu = { etat: () => ecran?.etat() ?? null, intro: () => introEcran?.etat() ?? null };
  // Police du titre préchargée (fichier hébergé existant) : la chute du Z part dès l'apparition de l'écran de chargement.
  const police = document.createElement('link');
  police.rel = 'preload';
  police.as = 'font';
  police.type = 'font/woff2';
  police.crossOrigin = 'anonymous';
  police.href = 'fonts/rubik-wet-paint-latin-400-normal.woff2';
  document.head.append(police);
  const styles = feuilleMenu();
  // Lot 8g : introduction (js/menu/intro.js, chargé seulement quand elle se joue). Retour du propriétaire (léger freeze à l'apparition du logo, écran
  // de chargement sauté) : le logo se joue seul, rien du menu ne se charge pendant ; à sa fin (début du fondu), l'écran de chargement complet (chute du
  // Z, barre réelle, astuce) apparaît dessous et charge le menu. Introduction indisponible : l'écran de chargement démarre aussitôt.
  const intro = avecIntro
    ? import('./intro.js').then(async (i) => {
      await styles;
      introEcran = i.jouerIntro({ coupe: son.coupe }); // lot 8h : « Son coupé » gardé : logo sans son
      return introEcran.fin;
    }).catch(() => {})
    : Promise.resolve();
  intro.then(() => import('./chargement.js')).then(async (m) => {
    await styles;
    // « JOUER » : écran de chargement du jeu (Z posé), réglages graphiques relus (l'écran Options du menu a pu les changer), puis le jeu.
    // Option déjà validée par le menu (lireOptionDemarrage, js/core/menu-etat.js) : seuls ses champs connus sont gardés. Lot 8d : stats (niveaux
    // effectifs de l'équipement et du personnage, pour cette partie seulement ; main.js les met à la place de ceux de la sauvegarde, sauf ?lvl=).
    const jouer = (option) => {
      if (option?.mode === 'infini' && typeof option.monde === 'string') partie = Object.freeze({ mode: 'infini', monde: option.monde });
      if (option?.stats && typeof option.stats === 'object') partie = Object.freeze({ ...partie, stats: Object.freeze({ ...option.stats }) });
      ecran = m.creerChargement({ phase: 'jeu' });
      for (const [e, f] of attente.splice(0)) ecran.progres(e, f);
      graphicsReboot();
      lancerJeu();
    };
    // Lot 8i : contexte audio de l'introduction (créé dans le geste), donné aux sons du menu.
    ecran = m.creerChargement({ phase: 'menu', jouer, son: { lire: reglagesSon, poser: poserSon }, contexteAudio: introEcran?.contexte?.() ?? null });
  }).catch(() => {
    // Écran de chargement indisponible : la partie démarre comme avant le menu (écran de préparation #loading).
    document.documentElement.classList.remove('zs-mode-menu', 'zs-attente');
    lancerJeu();
  });
}
