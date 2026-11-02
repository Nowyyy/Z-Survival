// Paramètres des personnages et du sang (lots 3j et 3m), lus dans l'adresse de jeu.html : ?perso=choix|actuel|A|B|C|riche (défaut choix :
// la table data/game/persos-choix.json, personnage par personnage ; actuel : tout l'ancien modèle ; A, B, C, riche : une variante pour tous),
// ?sang=0|reduit|1 (défaut : celui de la table, 0 sans table), ?usure=auto|0|1|2|3 (défaut : celui de la table, auto sans table).
// Valeurs inconnues : défaut, sans erreur. Jamais mémorisés ; ils ne changent aucun état du jeu (ils ne déclenchent pas le mode essai).
export const PERSO_VALUES = ['choix', 'actuel', 'A', 'B', 'C', 'riche'];
export const SANG_VALUES = ['0', 'reduit', '1'];
export const USURE_VALUES = ['auto', '0', '1', '2', '3'];
export const SLOTS = ['joueur', 'marcheur', 'petit', 'voute', 'grand'];
export const VARIANTES = ['actuel', 'A', 'B', 'C', 'riche'];
export const DEFAULTS = { perso: 'choix', sang: '0', usure: 'auto' };

const query = (search) => {
  try {
    return new URLSearchParams(typeof search === 'string' ? search.slice(0, 2000) : '');
  } catch {
    return new URLSearchParams('');
  }
};
const obj = (v) => (v !== null && typeof v === 'object' && !Array.isArray(v) ? v : {});

// La table des choix est-elle utile pour cette adresse ? (?perso=actuel&sang=0 : le jeu d'avant le lot 3j, rien n'est chargé.)
export function needsChoices(search) {
  const q = query(search);
  const perso = PERSO_VALUES.includes(q.get('perso')) ? q.get('perso') : DEFAULTS.perso;
  const sang = SANG_VALUES.includes(q.get('sang')) ? q.get('sang') : null;
  if (perso === 'choix' || sang === null) return true;
  if (perso === 'actuel' && sang === '0') return false;
  return !USURE_VALUES.includes(q.get('usure'));
}

// Variante de chaque personnage : celle de la table (?perso=choix) ou celle de l'adresse pour tous ; inconnue ou absente : actuel.
export function slotVariants(perso, choices) {
  const table = obj(obj(choices).persos);
  return Object.fromEntries(SLOTS.map((s) => [s, perso === 'choix' ? (VARIANTES.includes(obj(table[s]).variante) ? table[s].variante : 'actuel') : perso]));
}

export function readPersosParams(search, choices = null) {
  const q = query(search);
  const c = obj(choices);
  const pick = (key, values, fallback) => (values.includes(q.get(key)) ? q.get(key) : fallback);
  const perso = pick('perso', PERSO_VALUES, DEFAULTS.perso);
  const sang = pick('sang', SANG_VALUES, SANG_VALUES.includes(c.sang) ? c.sang : DEFAULTS.sang);
  const usure = pick('usure', USURE_VALUES, USURE_VALUES.includes(String(c.usure)) ? String(c.usure) : DEFAULTS.usure);
  const slots = slotVariants(perso, choices);
  const v2 = Object.values(slots).some((v) => v !== 'actuel');
  const actuel = Object.values(slots).some((v) => v === 'actuel');
  // Actif dès qu'il y a quelque chose à faire : personnages v2 ou sang (?perso=actuel&sang=0 : rien de plus n'est chargé).
  return { perso, sang, usure: usure === 'auto' ? 'auto' : Number(usure), slots, v2, actuel, active: v2 || sang !== '0' };
}
