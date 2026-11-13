// Lot 8i : sons du menu, module léger chargé avec l'écran de chargement (Docs/ref/sons-menu.md) : le seul fichier de plus au démarrage du menu.
// Il ne contient ni synthèse ni recette : il retient les faits (geste donné, menu prêt, ouverture en cours, page cachée, son coupé, « JOUER »),
// les volumes, le contexte audio, et transmet les demandes au moteur (js/menu/sons/moteur.js : catalogue, tampons, musique), chargé seulement
// quand un geste a eu lieu ET que des sons sont demandés (chute du Z après l'introduction, menu prêt). Avant, toute demande est sans effet :
// aucun son avant un geste, jamais d'information portée par le son seul.
// - Contexte audio : celui de l'introduction (adopter, lot 8g : créé dans « Toucher pour commencer »), sinon créé au premier geste.
// - son(nom) : joue un son du catalogue s'il est prêt ; clic délégué : un seul son pour toute commande du menu (ecouterClics).
const faits = { pret: false, geste: false, ouverture: false, cachee: false, coupe: false, partie: false };
const FAITS = { pret: ['pret', true], geste: ['geste', true], ouverture: ['ouverture', true], 'fin-ouverture': ['ouverture', false], jouer: ['partie', true], cachee: ['cachee', true], visible: ['cachee', false], coupe: ['coupe', true], retabli: ['coupe', false] };
let volumes = { coupe: false, jeu: 100, musique: 100 };
let ctx = null;
let moteur = null;
let chargement = null;
let voulu = false; // des sons sont demandés (chute, menu prêt)
let ferme = false;
let ecoute = false;
let specifique = false; // un son précis a été demandé pendant le clic en cours : pas de clic en plus

function charger() {
  if (chargement || !ctx || !voulu || ferme) return chargement;
  // Le moteur lit les faits et les volumes à la fin de sa création (ils ont pu changer pendant son chargement).
  chargement = import('./moteur.js').then((m) => m.creerMoteur({ ctx, faits: () => ({ ...faits }), volumes: () => ({ ...volumes }) })).then((m) => {
    if (ferme) {
      m.fermer();
      return null;
    }
    moteur = m;
    return m;
  }).catch(() => null);
  return chargement;
}

// Contexte audio de l'introduction (créé dans le geste « Toucher pour commencer ») : gardé pour les sons du menu.
export function adopter(contexte) {
  if (!contexte || ctx || ferme || contexte.state === 'closed') return;
  ctx = contexte;
  signaler('geste');
}

// Geste du joueur : contexte créé (ou repris) dans le geste même, puis le moteur si des sons sont demandés.
function geste() {
  if (ferme) return;
  if (!ctx) {
    const AC = globalThis.AudioContext ?? globalThis.webkitAudioContext;
    if (!AC) return;
    try {
      ctx = new AC();
    } catch {
      ctx = null;
      return;
    }
  }
  if (ctx.state !== 'running' && !faits.cachee) ctx.resume?.().catch(() => {});
  if (!faits.geste) signaler('geste');
  charger();
}

// Fait nouveau : pret (menu affiché), ouverture / fin-ouverture, jouer (« JOUER »), cachee / visible, coupe / retabli, geste.
export function signaler(evenement) {
  const f = FAITS[evenement];
  if (!f || ferme) return;
  faits[f[0]] = f[1];
  if (evenement === 'pret') voulu = true;
  moteur?.evenement(evenement);
  if (voulu) charger();
}

// Écoute des gestes et de la visibilité de la page (une fois) ; à appeler à la création de l'écran de chargement.
export function ecouterGestes() {
  if (ecoute || typeof window === 'undefined') return;
  ecoute = true;
  for (const type of ['pointerdown', 'pointerup', 'touchend', 'keydown', 'click']) window.addEventListener(type, geste, { capture: true, passive: true });
  document.addEventListener('visibilitychange', () => signaler(document.hidden ? 'cachee' : 'visible'));
  if (document.hidden) signaler('cachee');
  if (globalThis.__zsMenu) globalThis.__zsMenu.sons = etatSons; // tests (?test=1&menu=1)
}

// Clic unique du menu : toute commande touchée sous `racine` (boutons, onglets, liens, cases) ; jamais au défilement (aucun événement « click »),
// ni sur une commande désactivée, ni quand l'appui a été annulé (glissement à la souris), ni sur data-son="aucun", ni en plus d'un son précis.
const COMMANDES = 'button, a[href], [role="tab"], [role="button"], [role="option"], input[type="checkbox"], input[type="radio"], summary';
export function ecouterClics(racine) {
  racine.addEventListener('click', () => {
    specifique = false;
  }, true);
  racine.addEventListener('click', (e) => {
    const cible = e.target instanceof Element ? e.target.closest(COMMANDES) : null;
    if (!cible || !racine.contains(cible) || e.defaultPrevented || cible.disabled || cible.getAttribute('aria-disabled') === 'true' || cible.closest('[data-son="aucun"]')) return;
    if (specifique) return;
    moteur?.clic();
  });
}

// Joue un son du catalogue (prêt, geste donné, son non coupé) : { arreter(fondu) } ou null. options : { gain, delai (s), version, fin (s) }.
export function son(nom, options) {
  specifique = true;
  return moteur?.jouer(nom, options) ?? null;
}

// Clic demandé hors d'un toucher de commande (retour sonore du curseur « Volume du jeu ») : mêmes règles (un seul à la fois, dégressif).
export function clic() {
  moteur?.clic();
}

// Volumes des Options : { coupe, jeu (0 à 100), musique (0 à 100) }.
export function regler(v) {
  const avant = volumes.coupe;
  volumes = { ...volumes, ...v };
  moteur?.volumes(volumes);
  if (volumes.coupe !== avant) signaler(volumes.coupe ? 'coupe' : 'retabli');
}

// Prépare les tampons d'un groupe (chute, menu, raretes, ouverture) ; promesse résolue quand ils sont prêts (null sans geste ni moteur).
export function preparer(groupe) {
  voulu = true;
  return charger()?.then((m) => m?.preparer(groupe) ?? null) ?? Promise.resolve(null);
}

// Libère les tampons d'un groupe (ouverture) et arrête ses sons en cours.
export function liberer(groupe) {
  moteur?.liberer(groupe);
}

// Chute du Z (écran de chargement) : les sons sont programmés sur l'horloge audio aux instants de l'animation (s depuis `debut`, horloge de
// performance.now()). Un son pas encore prêt à son instant n'est pas joué (jamais en retard).
export function chute(instants, debut = performance.now()) {
  if (!faits.geste) return;
  preparer('chute').then(() => {
    const ecoule = (performance.now() - debut) / 1000;
    for (const [nom, t] of instants) if (t - ecoule > 0.02) moteur?.jouer(nom, { delai: t - ecoule, origine: 'chute' });
  });
}

// Suivi des sons d'une ouverture de caisses (js/menu/sons/moteur.js) : null tant que le moteur n'est pas là.
export function ouvertureSons(chrono, reglages) {
  return moteur?.ouverture(chrono, reglages) ?? null;
}

// « JOUER » : la musique s'éteint en fondu ; le contexte du menu est fermé après la chute du Z de l'écran de chargement (la partie a le sien).
export function partir(delaiMs = 6000) {
  signaler('jouer');
  setTimeout(() => {
    ferme = true;
    moteur?.fermer();
    moteur = null;
    ctx?.close?.().catch(() => {});
    ctx = null;
  }, delaiMs);
}

export function etatSons() {
  return { faits: { ...faits }, volumes: { ...volumes }, contexte: ctx?.state ?? 'aucun', charge: moteur !== null, ferme, ...(moteur?.etat() ?? { pretes: [], octets: {}, actifs: {}, musique: { mode: faits.pret && !faits.partie ? 'attente' : 'silence', lecteur: null }, journal: [] }) };
}
