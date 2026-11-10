// Lot 8a : état du menu principal (Docs/ref/menu-principal.md). Pur : ni rendu, ni stockage, ni réseau, ni horloge, ni hasard (graine donnée).
// Progression du chargement (E7), astuce, texte de version, onglets et menu à trois barres (E8), nouveautés lues, adresse du retour au menu.
// Jusqu'au lot 8h, tout cet état reste en mémoire : rien n'est écrit dans le stockage.
import { PARAMS_PARTIE } from './graphics.js';
import { ALL_STAT_IDS } from './player-stats.js';

// Deux chargements réels, chacun sous l'écran E7 : « menu » au démarrage (seul le menu se charge : ses modules, ses données et le solde, ses polices)
// puis « jeu » au clic sur « JOUER » (modules du jeu dont Three.js, données JSON, textures, sons « essentiel », création du jeu : compilation et
// premier rendu). Étapes et part du pourcentage (somme 1 par phase).
export const PHASES = Object.freeze({
  menu: Object.freeze({ modules: 0.4, donnees: 0.4, polices: 0.2 }),
  jeu: Object.freeze({ modules: 0.3, donnees: 0.05, textures: 0.4, sons: 0.15, compilation: 0.1 }),
});
// Fichiers JavaScript du jeu chargés à « JOUER » (graphe de js/game/main.js, ?test=1&lum=off : 114 au démarrage d'une partie directe, moins ceux du
// menu déjà chargés) : la part « modules » avance d'un fichier reçu à la fois ; au-delà, elle attend la fin réelle (début de main.js).
export const MODULES_ATTENDUS = 114;

const clamp01 = (n) => (Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0);
const etapesDe = (phase) => Object.keys(PHASES[phase] ?? PHASES.jeu);

export function creerProgression(phase = 'jeu') {
  const p = PHASES[phase] ? phase : 'jeu';
  return { phase: p, fractions: Object.fromEntries(etapesDe(p).map((e) => [e, 0])), valeur: 0, pret: false };
}

// Nouvel état (l'ancien n'est pas modifié) : la fraction d'une étape ne recule jamais ; la valeur ne recule jamais et reste sous 1 tant qu'une étape
// n'est pas finie (100 % = phase terminée). Étape inconnue de la phase : état inchangé.
export function avancer(etat, etape, fraction) {
  const etapes = etapesDe(etat.phase);
  if (!etapes.includes(etape)) return etat;
  const fractions = { ...etat.fractions, [etape]: Math.max(etat.fractions[etape], clamp01(fraction)) };
  const pret = etapes.every((e) => fractions[e] >= 1);
  const somme = etapes.reduce((s, e) => s + PHASES[etat.phase][e] * fractions[e], 0);
  const valeur = pret ? 1 : Math.min(0.99, Math.max(etat.valeur, somme));
  return { ...etat, fractions, valeur, pret };
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

// --- Lot 8b : mondes, record, carrousel du mode infini, option de démarrage (Docs/ref/menu-principal.md) ----------------------------------------
// Monde de repli (fichier absent ou sans monde jouable) : celui que le jeu sait lancer (le bâtiment, 40 manches, portes après 10, 20, 30).
export const MONDE_DEFAUT = Object.freeze({ id: 'batiment', numero: 1, nom: '', jouable: true, manches: 40, portes: Object.freeze([10, 20, 30]) });
const MAX_MONDES = 24;
const entier = (n, min, max) => (Number.isInteger(n) && n >= min && n <= max ? n : null);
const texteCourt = (s) => (typeof s === 'string' ? s.trim().slice(0, 40) : '');

// data/menu/mondes.json → liste de mondes valides, dans l'ordre des numéros. Entrée invalide ignorée (identifiant ou numéro absent, en double) ;
// un monde jouable sans manches ni portes valides prend celles du monde de repli. Aucun monde jouable : le monde de repli en tête.
export function lireMondes(json) {
  const brut = json && typeof json === 'object' && Array.isArray(json.mondes) ? json.mondes.slice(0, MAX_MONDES) : [];
  const ids = new Set();
  const numeros = new Set();
  const mondes = [];
  for (const m of brut) {
    if (!m || typeof m !== 'object') continue;
    const id = typeof m.id === 'string' && /^[a-z0-9-]{1,32}$/.test(m.id) ? m.id : null;
    const numero = entier(m.numero, 1, 99);
    if (!id || !numero || ids.has(id) || numeros.has(numero)) continue;
    ids.add(id);
    numeros.add(numero);
    const jouable = m.jouable === true;
    const manches = entier(m.manches, 1, 999) ?? MONDE_DEFAUT.manches;
    const portes = Array.isArray(m.portes) && m.portes.every((p) => entier(p, 1, manches - 1) !== null) ? [...new Set(m.portes)].sort((a, b) => a - b) : [...MONDE_DEFAUT.portes];
    mondes.push(jouable ? { id, numero, nom: texteCourt(m.nom), jouable, manches, portes } : { id, numero, nom: texteCourt(m.nom), jouable });
  }
  mondes.sort((a, b) => a.numero - b.numero);
  if (!mondes.some((m) => m.jouable)) return [{ ...MONDE_DEFAUT, portes: [...MONDE_DEFAUT.portes] }, ...mondes.filter((m) => m.id !== MONDE_DEFAUT.id && m.numero !== 1)];
  return mondes;
}

export const premierJouable = (mondes) => (Array.isArray(mondes) ? mondes.find((m) => m?.jouable) : null) ?? MONDE_DEFAUT;

// Meilleure manche de la sauvegarde (records.bestWave, lu sans écriture) : entier ≥ 1, sinon null (« — »).
export const lireRecord = (n) => (Number.isInteger(n) && n >= 1 ? n : null);

// Onglet Jouer : panneaux de la route (manche 1, chaque porte, dernière manche), atteints si record ≥ leur numéro ; portes ouvertes = portes dont la
// manche est atteinte ; record affiché borné à la dernière manche du monde (l'histoire finit là) ; repère : position sur la route, en indice de
// panneau (0 = premier, fraction entre deux), null sans record.
export function etatJouer(monde, record) {
  const m = monde?.jouable ? monde : MONDE_DEFAUT;
  const r = lireRecord(record);
  const paliers = [1, ...m.portes, m.manches];
  const panneaux = paliers.map((manche) => ({ manche, atteint: r !== null && r >= manche }));
  const portesOuvertes = r === null ? 0 : m.portes.filter((p) => r >= p).length;
  let repere = null;
  if (r !== null) {
    const v = Math.min(r, m.manches);
    const i = paliers.findIndex((p, k) => k === paliers.length - 1 || (v >= p && v < paliers[k + 1]));
    repere = i === paliers.length - 1 ? i : i + (v - paliers[i]) / (paliers[i + 1] - paliers[i]);
  }
  return { record: r === null ? null : Math.min(r, m.manches), manches: m.manches, panneaux, portesOuvertes, portesTotal: m.portes.length, repere };
}

// Monde suivant d'un monde (onglet Jouer : carte « Monde 2 · Verrouillé ») ; null s'il n'y en a pas.
export function mondeSuivant(mondes, id) {
  const liste = Array.isArray(mondes) ? mondes : [];
  const i = liste.findIndex((m) => m.id === id);
  return i >= 0 && i + 1 < liste.length ? liste[i + 1] : null;
}

// Carrousel de l'onglet Infini : carte choisie (en mémoire) ; un monde inconnu ou verrouillé ne se choisit pas (état inchangé).
export function creerCarrousel(mondes) {
  return { choisi: premierJouable(mondes).id };
}
export function choisirCarte(etat, mondes, id) {
  const m = Array.isArray(mondes) ? mondes.find((x) => x.id === id) : null;
  return m && m.jouable ? { ...etat, choisi: m.id } : etat;
}

// Option de démarrage de la partie, passée par le menu au chargement du jeu (sans paramètre d'adresse) : { mode: 'histoire' | 'infini', monde }.
// Mode inconnu, monde inconnu ou verrouillé, entrée hostile : histoire sur le premier monde jouable.
// Lot 8d : champ stats (niveaux effectifs calculés par le menu : équipement porté, capacité du personnage) gardé seulement s'il est valide
// (lireStatsOption) ; absent ou invalide : champ retiré, la partie lit les niveaux de la sauvegarde.
export const MODES = Object.freeze(['histoire', 'infini']);
export function lireOptionDemarrage(entree, mondes) {
  const defaut = { mode: 'histoire', monde: premierJouable(mondes).id };
  if (!entree || typeof entree !== 'object' || Array.isArray(entree)) return defaut;
  const stats = lireStatsOption(propre(entree, 'stats'));
  const avec = (o) => (stats ? { ...o, stats } : o);
  const mode = propre(entree, 'mode');
  const id = propre(entree, 'monde');
  if (typeof mode !== 'string' || !MODES.includes(mode) || typeof id !== 'string') return avec(defaut);
  const m = Array.isArray(mondes) ? mondes.find((x) => x.id === id) : null;
  return avec(m && m.jouable ? { mode, monde: m.id } : defaut);
}

// Valeur propre d'un champ (jamais un accesseur ni un champ hérité) ; sinon undefined.
function propre(o, cle) {
  const d = Object.getOwnPropertyDescriptor(o, cle);
  return d && 'value' in d ? d.value : undefined;
}

// Lot 8d : niveaux transmis à la partie : objet simple, au plus les statistiques de player-stats.js, valeurs entières de 0 à 99 (la partie les borne
// ensuite par normalizeLevels) ; une seule valeur invalide (clé inconnue, accesseur, nombre non entier, négatif, trop grand) : null.
export const NIVEAU_OPTION_MAX = 99;
export function lireStatsOption(stats) {
  if (!stats || typeof stats !== 'object' || Array.isArray(stats)) return null;
  const proto = Object.getPrototypeOf(stats);
  if (proto !== Object.prototype && proto !== null) return null;
  const cles = Reflect.ownKeys(stats);
  if (cles.length === 0 || cles.length > ALL_STAT_IDS.length) return null;
  const out = {};
  for (const k of cles) {
    const v = typeof k === 'string' && ALL_STAT_IDS.includes(k) ? propre(stats, k) : undefined;
    if (!Number.isInteger(v) || v < 0 || v > NIVEAU_OPTION_MAX) return null;
    out[k] = v;
  }
  return Object.freeze(out);
}

// Classement d'exemple de l'onglet Infini (data/menu/classement.json) : au plus 5 lignes valides { rang, pseudo, manche } ; absent ou invalide : [].
export function lireClassement(json) {
  const brut = json && typeof json === 'object' && Array.isArray(json.lignes) ? json.lignes : [];
  return brut
    .filter((l) => l && typeof l === 'object' && typeof l.pseudo === 'string' && l.pseudo.trim() !== '' && Number.isInteger(l.manche) && l.manche >= 1)
    .slice(0, 5)
    .map((l, i) => ({ rang: i + 1, pseudo: l.pseudo.trim().slice(0, 20), manche: l.manche }));
}
