// Lot 8a : démarrage de jeu.html (Docs/ref/menu-principal.md). Balise de jeu.html avant boot.js : décide « menu » ou « partie directe » d'après
// l'adresse autorisée (choixDemarrage de js/core/graphics.js, sur pageSearch()).
// - Partie directe (?test=1 sans menu=1, ou un paramètre de « Partie ») : js/game/main.js est importé tout de suite (avant le lot 8a, c'était une
//   balise de jeu.html) ; le jeu démarre exactement comme avant.
// - Menu : seul le menu se charge (feuille css/menu.css, écran de chargement E7 « menu », puis menu E8) ; au clic sur « JOUER », l'écran de
//   chargement revient (phase « jeu ») et main.js est importé : Three.js, données, textures, sons et création du jeu se chargent à ce moment-là,
//   avec leur progression réelle (menuProgres, appelé par main.js ; sans effet en partie directe).
import { choixDemarrage } from '../core/graphics.js';
import { graphicsReboot, pageCanal, pageSearch } from '../game/graphics-boot.js';

export const modeMenu = choixDemarrage(pageCanal(), pageSearch()) === 'menu';

// Avancées arrivées avant l'écran de chargement (import en cours) : gardées puis rejouées dans l'ordre.
const attente = [];
let ecran = null;

export function menuProgres(etape, fraction) {
  if (!modeMenu) return;
  if (ecran) ecran.progres(etape, fraction);
  else attente.push([etape, fraction]);
}

// Retour au menu (« Quitter » confirmé, « Revenir au menu principal ») : rechargement de jeu.html sans les paramètres de « Partie » (menu=1 sous
// ?test=1). La partie ne peut pas être libérée sans rechargement (écouteurs, WebGL, audio) ; l'argent a déjà été écrit (bank.runEnd).
export async function menuRetour(loc = globalThis.location) {
  const { adresseRetour } = await import('../core/menu-etat.js');
  const search = adresseRetour(loc.search);
  if (search === loc.search) loc.reload();
  else loc.replace(`${loc.pathname}${search}${loc.hash}`);
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
  lancerJeu();
} else {
  document.documentElement.classList.add('zs-mode-menu');
  // Tests (?test=1&menu=1) : état de l'écran de chargement en cours et du menu (phase, pourcentages affichés, onglet…), lecture seule.
  if (new URLSearchParams(pageSearch()).get('test') === '1') window.__zsMenu = { etat: () => ecran?.etat() ?? null };
  // Police du titre préchargée (fichier hébergé existant) : la chute du Z part dès l'apparition de l'écran de chargement.
  const police = document.createElement('link');
  police.rel = 'preload';
  police.as = 'font';
  police.type = 'font/woff2';
  police.crossOrigin = 'anonymous';
  police.href = 'fonts/rubik-wet-paint-latin-400-normal.woff2';
  document.head.append(police);
  const css = document.createElement('link');
  css.rel = 'stylesheet';
  css.href = 'css/menu.css';
  const feuille = new Promise((resolve) => {
    css.addEventListener('load', resolve, { once: true });
    css.addEventListener('error', resolve, { once: true });
  });
  document.head.append(css);
  import('./chargement.js').then(async (m) => {
    await feuille;
    // « JOUER » : écran de chargement du jeu (Z posé), réglages graphiques relus (l'écran Options du menu a pu les changer), puis le jeu.
    const jouer = () => {
      ecran = m.creerChargement({ phase: 'jeu' });
      for (const [e, f] of attente.splice(0)) ecran.progres(e, f);
      graphicsReboot();
      lancerJeu();
    };
    ecran = m.creerChargement({ phase: 'menu', jouer });
  }).catch(() => {
    // Écran de chargement indisponible : la partie démarre comme avant le menu (écran de préparation #loading).
    document.documentElement.classList.remove('zs-mode-menu');
    lancerJeu();
  });
}
