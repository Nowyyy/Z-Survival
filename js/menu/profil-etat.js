// Lot 8g : état pur de la page Profil E10 (Docs/ref/menu-principal.md, « Lot 8g ») : pseudo (2 à 20 caractères, texte libre filtré), avatars générés en
// code, six statistiques lues dans la sauvegarde existante (« — » quand la donnée n'existe pas encore : lot 8h). Pur : ni rendu, ni stockage, ni réseau,
// ni horloge. Jusqu'au lot 8h, avatar et pseudo restent en mémoire (js/menu/compte.js) : rien n'est écrit.
import { describeSave } from '../core/save.js';

export const PSEUDO_MIN = 2;
export const PSEUDO_MAX = 20;
// Caractères refusés : contrôle (Cc : retours à la ligne, tabulations…) et format (Cf : caractères invisibles, inversions de sens d'écriture).
const INTERDITS = /[\p{Cc}\p{Cf}]/u;

// Pseudo saisi → { ok: true, pseudo } (espaces des bords retirés, suites d'espaces réduites à une) ou { ok: false, erreur } avec erreur parmi
// « controle » (caractère de contrôle ou invisible), « court » (moins de 2 caractères, vide compris), « long » (plus de 20). Longueur en caractères
// Unicode (un emoji compte pour un).
export function validerPseudo(saisie) {
  if (typeof saisie !== 'string') return { ok: false, erreur: 'court' };
  if (INTERDITS.test(saisie)) return { ok: false, erreur: 'controle' };
  const pseudo = saisie.trim().replace(/\s+/gu, ' ');
  const n = Array.from(pseudo).length;
  if (n < PSEUDO_MIN) return { ok: false, erreur: 'court' };
  if (n > PSEUDO_MAX) return { ok: false, erreur: 'long' };
  return { ok: true, pseudo };
}
export const ERREURS_PSEUDO = Object.freeze({
  controle: 'game.menu.profil.pseudo.erreur.controle',
  court: 'game.menu.profil.pseudo.erreur.court',
  long: 'game.menu.profil.pseudo.erreur.long',
});

// Avatars (retour du propriétaire : d'après le personnage du jeu et les zombies ; d'autres viendront) : portrait dessiné en code (js/menu/compte.js),
// couleurs des personnages du jeu (jetons --perso-* de css/tokens.css, posés par css/menu.css) ; type joueur ou zombie, tenue (détails du dessin).
// « Changer d'avatar » passe au suivant.
export const AVATARS = Object.freeze([
  Object.freeze({ id: 'survivant', type: 'joueur', tenue: 'bandana' }), // joueur A : veste tactique sable, bandana rouge
  Object.freeze({ id: 'eclaireur', type: 'joueur', tenue: 'capuche' }), // joueur B : sweat à capuche gris, lampe frontale
  Object.freeze({ id: 'tireur', type: 'joueur', tenue: 'veste' }), // joueur C : veste turquoise
  Object.freeze({ id: 'rodeur', type: 'zombie', tenue: 'chemise' }), // zombie à la peau cendre, chemise déchirée
  Object.freeze({ id: 'ouvrier', type: 'zombie', tenue: 'chantier' }), // zombie de chantier : casque jaune, gilet orange
  Object.freeze({ id: 'affame', type: 'zombie', tenue: 'sweat' }), // zombie à la peau jaunie, sweat gris
]);
export function avatarSuivant(id) {
  const i = AVATARS.findIndex((a) => a.id === id);
  return AVATARS[(i + 1) % AVATARS.length];
}

// Six statistiques du Profil : { id, valeur (nombre ou null : « — »), max (meilleure manche : dernière manche du monde) }. Retour du propriétaire : plus
// de record infini (il dépend de la carte : il est dans l'onglet Infini) ; parties jouées séparées en histoire et en infini. Existent dans la
// sauvegarde v1 : meilleure manche (records.bestWave, 0 = aucune), argent gagné (earned). Attendent le lot 8h : zombies tués au total
// (records.bestKills n'est que la meilleure partie), parties en histoire et en infini (records.runs les compte ensemble), temps de jeu.
// Sauvegarde illisible, verrouillée ou indisponible : tout à « — ».
export const STATS_PROFIL = Object.freeze(['meilleureManche', 'tues', 'partiesHistoire', 'partiesInfini', 'temps', 'argent']);
export const STATS_EN_ATTENTE = Object.freeze(['tues', 'partiesHistoire', 'partiesInfini', 'temps']);
export function statsProfil(lu, manches = 40) {
  const lisible = lu && (lu.status === 'ok' || lu.status === 'empty') && lu.save && typeof lu.save === 'object';
  const d = lisible ? describeSave(lu.save) : null;
  const valeurs = {
    meilleureManche: d && d.records.bestWave >= 1 ? d.records.bestWave : null,
    tues: null,
    partiesHistoire: null,
    partiesInfini: null,
    temps: null,
    argent: d ? d.earned : null,
  };
  return STATS_PROFIL.map((id) => (id === 'meilleureManche' ? { id, valeur: valeurs[id], max: Number.isInteger(manches) && manches > 0 ? manches : null } : { id, valeur: valeurs[id] }));
}
