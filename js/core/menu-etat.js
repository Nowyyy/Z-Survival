// Lot 8a : état du menu principal (Docs/ref/menu-principal.md). Pur : ni rendu, ni stockage, ni réseau, ni horloge, ni hasard (graine donnée).
// Progression du chargement (E7), astuce, texte de version, onglets et menu à trois barres (E8), nouveautés lues, adresse du retour au menu.
// Jusqu'au lot 8h, tout cet état reste en mémoire : rien n'est écrit dans le stockage.
import { PARAMS_PARTIE } from './graphics.js';

// Étapes du chargement réel et leur part du pourcentage (somme 1) : modules (Three.js compris), données JSON, textures, sons « essentiel ».
// La création du jeu (compilation des programmes, premier rendu) se fait à « JOUER » (Docs/ref/menu-principal.md : seuil Lighthouse).
export const ETAPES = Object.freeze(['modules', 'donnees', 'textures', 'sons']);
export const POIDS = Object.freeze({ modules: 0.3, donnees: 0.05, textures: 0.45, sons: 0.2 });
// Nombre de fichiers JavaScript du graphe de démarrage du jeu (?test=1&lum=off, tests/e2e/graphismes.spec.js) : la part « modules » avance d'un
// fichier reçu à la fois ; au-delà, elle attend la fin réelle (début de main.js). Une valeur fausse ne rend la barre que moins régulière.
export const MODULES_ATTENDUS = 114;

const clamp01 = (n) => (Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0);

export function creerProgression() {
  return { fractions: Object.fromEntries(ETAPES.map((e) => [e, 0])), valeur: 0, pret: false };
}

// Nouvel état (l'ancien n'est pas modifié) : la fraction d'une étape ne recule jamais ; la valeur ne recule jamais et reste sous 1 tant qu'une étape
// n'est pas finie (100 % = jeu prêt). Étape inconnue : état inchangé.
export function avancer(etat, etape, fraction) {
  if (!ETAPES.includes(etape)) return etat;
  const fractions = { ...etat.fractions, [etape]: Math.max(etat.fractions[etape], clamp01(fraction)) };
  const pret = ETAPES.every((e) => fractions[e] >= 1);
  const somme = ETAPES.reduce((s, e) => s + POIDS[e] * fractions[e], 0);
  const valeur = pret ? 1 : Math.min(0.99, Math.max(etat.valeur, somme));
  return { fractions, valeur, pret };
}

export const pourcentage = (etat) => (etat.pret ? 100 : Math.min(99, Math.floor(etat.valeur * 100)));

// Astuce affichée : déterministe pour une graine (entier) ; liste vide ou invalide : null.
export function choisirAstuce(liste, graine) {
  const items = Array.isArray(liste) ? liste.filter((a) => typeof a === 'string' && a.trim() !== '') : [];
  if (items.length === 0) return null;
  const g = Number.isFinite(graine) ? Math.trunc(Math.abs(graine)) : 0;
  const h = Math.imul(g ^ 0x9e3779b9, 2654435761) >>> 0; // mélange entier (Knuth) : graines voisines, astuces différentes
  return items[h % items.length];
}

// Texte de version (coin bas droit de E7) d'après build-info.json : { cle, params } (clé de fr.json), ou null (fichier absent ou illisible).
export function texteVersion(info) {
  if (!info || typeof info !== 'object') return null;
  const version = typeof info.version === 'string' ? info.version : '';
  const sha = typeof info.sha === 'string' ? info.sha : '';
  if (info.channel === 'source') return { cle: 'game.menu.version.source', params: {} };
  if (info.channel === 'dev') return { cle: 'game.menu.version.dev', params: { sha: sha || '—' } };
  if (version) return { cle: 'game.menu.version', params: { v: version } };
  return null;
}

// Onglets de la barre E8-2, de gauche à droite (Jouer au centre) ; Event est verrouillé (aucune action).
export const ONGLETS = Object.freeze([
  Object.freeze({ id: 'boutique' }),
  Object.freeze({ id: 'personnage' }),
  Object.freeze({ id: 'jouer', central: true }),
  Object.freeze({ id: 'infini' }),
  Object.freeze({ id: 'event', verrouille: true }),
]);
export const ECRANS = Object.freeze(['information', 'connexion', 'options']);

export function creerEtatMenu() {
  return { onglet: 'jouer', menuOuvert: false, ecran: null, lues: [] };
}

// Onglet choisi : inconnu ou verrouillé, état inchangé ; le menu à trois barres se ferme.
export function choisirOnglet(etat, id) {
  const o = ONGLETS.find((x) => x.id === id);
  if (!o || o.verrouille) return etat;
  return { ...etat, onglet: id, menuOuvert: false };
}

export const basculerMenu = (etat) => ({ ...etat, menuOuvert: !etat.menuOuvert });
export const fermerMenu = (etat) => (etat.menuOuvert ? { ...etat, menuOuvert: false } : etat);

// Écran par-dessus le menu (Information, Connexion, Options) : le menu à trois barres se ferme ; Information marque les nouveautés comme lues.
export function ouvrirEcran(etat, ecran, infos = []) {
  if (!ECRANS.includes(ecran)) return etat;
  const lues = ecran === 'information' ? [...new Set([...etat.lues, ...idsInfos(infos)])] : etat.lues;
  return { ...etat, ecran, menuOuvert: false, lues };
}
export const fermerEcran = (etat) => ({ ...etat, ecran: null });

const idsInfos = (infos) => (Array.isArray(infos) ? infos.map((i) => i?.id).filter((id) => typeof id === 'string' && id !== '') : []);

// Point jaune (Information et icône à trois barres) : une nouveauté au moins n'est pas lue.
export const nouveauteNonLue = (infos, lues) => idsInfos(infos).some((id) => !lues.includes(id));

// Lien Discord de data/menu/liens.json : adresse https seulement ; vide ou invalide : inactif (« bientôt »).
export function lienExterne(adresse) {
  if (typeof adresse !== 'string' || adresse.trim() === '') return { actif: false, adresse: '' };
  try {
    const u = new URL(adresse.trim());
    return u.protocol === 'https:' && u.hostname !== '' ? { actif: true, adresse: u.href } : { actif: false, adresse: '' };
  } catch {
    return { actif: false, adresse: '' };
  }
}

// Adresse du retour au menu (Quitter, Revenir au menu principal) : sans les paramètres de « Partie » (le menu s'ouvrirait sinon sur une partie
// directe), les autres gardés dans leur ordre ; sous ?test=1, menu=1 ajouté. Renvoie la chaîne de requête (« ?… » ou vide).
export function adresseRetour(search) {
  let q;
  try {
    q = new URLSearchParams(typeof search === 'string' ? search : '');
  } catch {
    q = new URLSearchParams('');
  }
  for (const n of PARAMS_PARTIE) q.delete(n);
  if (q.get('test') === '1') q.set('menu', '1');
  const out = q.toString();
  return out ? `?${out}` : '';
}
