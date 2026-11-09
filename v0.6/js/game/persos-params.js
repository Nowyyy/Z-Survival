// Paramètres des personnages et du sang (lots 3j et 3m), lus dans l'adresse de jeu.html : ?perso=choix|A|B|C|riche (défaut choix :
// la table data/game/persos-choix.json, personnage par personnage ; A, B, C, riche : une variante pour tous ; lot 5e : « actuel » retiré),
// ?sang=0|reduit|1 (défaut : celui de la table, 0 sans table), ?usure=auto|0|1|2|3 (défaut : celui de la table, auto sans table).
// Valeurs inconnues : défaut, sans erreur. Jamais mémorisés ; ils ne changent aucun état du jeu (ils ne déclenchent pas le mode essai).
export const PERSO_VALUES = ['choix', 'A', 'B', 'C', 'riche'];
export const SANG_VALUES = ['0', 'reduit', '1'];
export const USURE_VALUES = ['auto', '0', '1', '2', '3'];
export const SLOTS = ['joueur', 'marcheur', 'petit', 'voute', 'grand'];
export const VARIANTES = ['A', 'B', 'C', 'riche'];
export const REPLI = 'A'; // lot 5e : variante d'un personnage quand la table manque ou nomme une variante inconnue
export const DEFAULTS = { perso: 'choix', sang: '0', usure: 'auto' };

const query = (search) => {
  try {
    return new URLSearchParams(typeof search === 'string' ? search.slice(0, 2000) : '');
  } catch {
    return new URLSearchParams('');
  }
};
const obj = (v) => (v !== null && typeof v === 'object' && !Array.isArray(v) ? v : {});

// La table des choix est-elle utile pour cette adresse ? (variante, sang et usure tous dans l'adresse : non.)
export function needsChoices(search) {
  const q = query(search);
  const perso = PERSO_VALUES.includes(q.get('perso')) ? q.get('perso') : DEFAULTS.perso;
  const sang = SANG_VALUES.includes(q.get('sang')) ? q.get('sang') : null;
  if (perso === 'choix' || sang === null) return true;
  return !USURE_VALUES.includes(q.get('usure'));
}

// Variante de chaque personnage : celle de la table (?perso=choix) ou celle de l'adresse pour tous ; inconnue ou absente : A (lot 5e).
export function slotVariants(perso, choices) {
  const table = obj(obj(choices).persos);
  return Object.fromEntries(SLOTS.map((s) => [s, perso === 'choix' ? (VARIANTES.includes(obj(table[s]).variante) ? table[s].variante : REPLI) : perso]));
}

export function readPersosParams(search, choices = null) {
  const q = query(search);
  const c = obj(choices);
  const pick = (key, values, fallback) => (values.includes(q.get(key)) ? q.get(key) : fallback);
  const perso = pick('perso', PERSO_VALUES, DEFAULTS.perso);
  const sang = pick('sang', SANG_VALUES, SANG_VALUES.includes(c.sang) ? c.sang : DEFAULTS.sang);
  const usure = pick('usure', USURE_VALUES, USURE_VALUES.includes(String(c.usure)) ? String(c.usure) : DEFAULTS.usure);
  const slots = slotVariants(perso, choices);
  // Lot 5e : tous les personnages sont des personnages v2 ; le chargeur est donc toujours actif.
  return { perso, sang, usure: usure === 'auto' ? 'auto' : Number(usure), slots, v2: true, active: true };
}
