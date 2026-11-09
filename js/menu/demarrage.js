// Lot 8a : démarrage de jeu.html (Docs/ref/menu-principal.md). Balise de jeu.html avant boot.js : décide « menu » ou « partie directe » d'après
// l'adresse autorisée (choixDemarrage de js/core/graphics.js, sur pageSearch()). Partie directe (?test=1 sans menu=1, ou un paramètre de « Partie ») :
// rien d'autre, le jeu démarre exactement comme avant. Menu : feuille css/menu.css, écran de chargement E7 (js/menu/chargement.js, importé ici),
// progression réelle relayée par main.js (menuProgres), puis menu E8 quand le jeu est prêt (menuPret). Seul fichier ajouté en partie directe.
import { choixDemarrage } from '../core/graphics.js';
import { pageCanal, pageSearch } from '../game/graphics-boot.js';

export const modeMenu = choixDemarrage(pageCanal(), pageSearch()) === 'menu';

// Avant l'arrivée de l'écran de chargement (import en cours), les avancées sont gardées puis rejouées dans l'ordre.
const attente = [];
let ecran = null;
let pret = null;
let echec = false;

export function menuProgres(etape, fraction) {
  if (!modeMenu) return;
  if (ecran) ecran.progres(etape, fraction);
  else attente.push([etape, fraction]);
}

// Jeu prêt (créé, boucle d'images arrêtée) : api = { dict, repository, graphics, vhs, jouer() } (main.js). L'écran de chargement termine sa chute,
// puis laisse la place au menu.
export function menuPret(api) {
  if (!modeMenu) return;
  pret = api;
  if (echec) api.jouer(); // écran de chargement indisponible : la partie démarre comme avant le menu
  else ecran?.pret(api);
}

// Retour au menu (« Quitter » confirmé, « Revenir au menu principal ») : rechargement de jeu.html sans les paramètres de « Partie » (menu=1 sous
// ?test=1). La partie ne peut pas être libérée sans rechargement (écouteurs, WebGL, audio) ; l'argent a déjà été écrit (bank.runEnd).
export async function menuRetour(loc = globalThis.location) {
  const { adresseRetour } = await import('../core/menu-etat.js');
  const search = adresseRetour(loc.search);
  if (search === loc.search) loc.reload();
  else loc.replace(`${loc.pathname}${search}${loc.hash}`);
}

if (modeMenu) {
  document.documentElement.classList.add('zs-mode-menu');
  // Tests (?test=1&menu=1) : état de l'écran de chargement et du menu (pourcentages affichés, onglet, menu à trois barres…), lecture seule.
  if (new URLSearchParams(pageSearch()).get('test') === '1') window.__zsMenu = { etat: () => ecran?.etat() ?? null };
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
    ecran = m.creerChargement();
    for (const [e, f] of attente.splice(0)) ecran.progres(e, f);
    if (pret) ecran.pret(pret);
  }).catch(() => {
    echec = true; // écran de chargement indisponible : l'écran de préparation d'avant reste visible, puis la partie démarre
    document.documentElement.classList.remove('zs-mode-menu');
    pret?.jouer();
  });
}
