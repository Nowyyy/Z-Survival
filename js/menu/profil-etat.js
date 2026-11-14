// Lot 8g : état pur de la page Profil E10 (Docs/ref/menu-principal.md, « Lot 8g ») : pseudo (2 à 20 caractères, texte libre filtré), avatars générés en
// code, six statistiques lues dans la sauvegarde existante (« — » quand la donnée n'existe pas encore : lot 8h). Pur : ni rendu, ni stockage, ni réseau,
// ni horloge. Jusqu'au lot 8h, avatar et pseudo restent en mémoire (js/menu/compte.js) : rien n'est écrit.

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

// Avatars : js/menu/avatar.js (communs au Profil et à l'en-tête) ; réexportés ici pour les lecteurs de l'état du Profil.
export { AVATARS, avatarSuivant } from './avatar.js';

// Six statistiques du Profil : { id, valeur (nombre ou null : « — »), max (meilleure manche : dernière manche du monde) }. Retour du propriétaire : plus
// de record infini (il dépend de la carte : il est dans l'onglet Infini) ; parties jouées séparées en histoire et en infini. Lot 8h : lues dans la
// progression v2 (zs.save.v2) : meilleure manche de l'histoire du monde (records.histoire[monde], 0 = aucune), zombies tués au total, parties en
// histoire et en infini, temps de jeu hors pauses (millisecondes), monnaie bleue gagnée au total. Progression illisible, verrouillée ou
// indisponible : tout à « — ».
export const STATS_PROFIL = Object.freeze(['meilleureManche', 'tues', 'partiesHistoire', 'partiesInfini', 'temps', 'argent']);
export const STATS_EN_ATTENTE = Object.freeze([]);
const entier = (n) => (Number.isInteger(n) && n >= 0 ? n : 0);
export function statsProfil(lu, manches = 40, monde = 'batiment') {
  const lisible = lu && (lu.status === 'ok' || lu.status === 'empty') && lu.save && typeof lu.save === 'object';
  const s = lisible ? lu.save : null;
  const best = s ? entier(s.records?.histoire?.[monde]) : 0;
  const valeurs = {
    meilleureManche: s && best >= 1 ? best : null,
    tues: s ? entier(s.profil?.tues) : null,
    partiesHistoire: s ? entier(s.profil?.partiesHistoire) : null,
    partiesInfini: s ? entier(s.profil?.partiesInfini) : null,
    temps: s ? entier(s.profil?.tempsMs) : null,
    argent: s ? entier(s.bleu?.gagne) : null,
  };
  return STATS_PROFIL.map((id) => (id === 'meilleureManche' ? { id, valeur: valeurs[id], max: Number.isInteger(manches) && manches > 0 ? manches : null } : { id, valeur: valeurs[id] }));
}

// Temps de jeu (millisecondes) → { h, m } (minutes entières, arrondi inférieur).
export function tempsJeu(ms) {
  const minutes = Math.floor(entier(ms) / 60_000);
  return { h: Math.floor(minutes / 60), m: minutes % 60 };
}
