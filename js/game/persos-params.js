// Paramètres des personnages et du sang (lot 3j), lus dans l'adresse de jeu.html : ?perso=actuel|A|B|C|riche (défaut riche : choix du
// propriétaire), ?sang=0|reduit|1 (défaut 1, complet ; 0 et réduit restent pour le futur menu d'options), ?usure=auto|0|1|2|3 (défaut auto :
// palier de la manche en cours). Valeurs inconnues : défaut, sans erreur.
// Jamais mémorisés ; ils ne changent aucun état du jeu (ils ne déclenchent pas le mode essai de la sauvegarde).
export const PERSO_VALUES = ['actuel', 'A', 'B', 'C', 'riche'];
export const SANG_VALUES = ['0', 'reduit', '1'];
export const DEFAULTS = { perso: 'riche', sang: '1', usure: 'auto' };
export const USURE_VALUES = ['auto', '0', '1', '2', '3'];

export function readPersosParams(search) {
  let q;
  try {
    q = new URLSearchParams(typeof search === 'string' ? search.slice(0, 2000) : '');
  } catch {
    q = new URLSearchParams('');
  }
  const pick = (key, values, fallback) => (values.includes(q.get(key)) ? q.get(key) : fallback);
  const perso = pick('perso', PERSO_VALUES, DEFAULTS.perso);
  const sang = pick('sang', SANG_VALUES, DEFAULTS.sang);
  const usure = pick('usure', USURE_VALUES, DEFAULTS.usure);
  // Actif dès qu'il y a quelque chose à faire : personnages v2 ou sang (?perso=actuel&sang=0 : le jeu d'avant le lot 3j, rien n'est chargé).
  return { perso, sang, usure: usure === 'auto' ? 'auto' : Number(usure), active: perso !== 'actuel' || sang !== '0' };
}
