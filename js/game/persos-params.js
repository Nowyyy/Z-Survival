// Paramètres d'essai des personnages et du sang (lot 3j), lus dans l'adresse de jeu.html : ?perso=actuel|A|B|C|riche (défaut actuel),
// ?sang=0|reduit|1 (défaut 0), ?usure=auto|0|1|2|3 (défaut auto : palier de la manche en cours). Valeurs inconnues : défaut, sans erreur.
// Jamais mémorisés ; ils ne changent aucun état du jeu (ils ne déclenchent pas le mode essai de la sauvegarde).
export const PERSO_VALUES = ['actuel', 'A', 'B', 'C', 'riche'];
export const SANG_VALUES = ['0', 'reduit', '1'];
export const USURE_VALUES = ['auto', '0', '1', '2', '3'];

export function readPersosParams(search) {
  let q;
  try {
    q = new URLSearchParams(typeof search === 'string' ? search.slice(0, 2000) : '');
  } catch {
    q = new URLSearchParams('');
  }
  const pick = (key, values, fallback) => (values.includes(q.get(key)) ? q.get(key) : fallback);
  const perso = pick('perso', PERSO_VALUES, 'actuel');
  const sang = pick('sang', SANG_VALUES, '0');
  const usure = pick('usure', USURE_VALUES, 'auto');
  return { perso, sang, usure: usure === 'auto' ? 'auto' : Number(usure), active: perso !== 'actuel' || sang !== '0' };
}
