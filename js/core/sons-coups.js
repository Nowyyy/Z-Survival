// Lot 8j : moins de bruits de zombies. Coups reçus (balle qui touche sans tuer : zombieHit non mortel) et coups portés (contact avec le joueur :
// zombieAttack ; planche arrachée : plankTorn) ne font un son qu'avec une probabilité (0,25 par défaut : environ un sur quatre). La mort
// (zombieHit mortel) sonne toujours ; tous les autres événements passent tels quels. Tirage avec un générateur PROPRE AU SON (son état est
// rendu, jamais celui de la logique du jeu) : la partie ne change pas. Pur : aucun son ici, seulement le tri des événements.
import { createRng, nextFloat } from './rng.js';

export const COUPS_DEFAUT = Object.freeze({ probabilite: 0.25, types: Object.freeze(['zombieHit', 'zombieAttack', 'plankTorn']) });
const TYPES_PERMIS = new Set(COUPS_DEFAUT.types);
// Graine du générateur des coups : dérivée de celle de l'audio, décalée pour ne jamais suivre la suite du directeur des sons.
export const GRAINE_COUPS = 0x5c0b;

// Réglages lus dans data/game/reglages-partie.json (sonsZombies) : probabilité dans [0, 1] (sinon le défaut), types parmi les trois permis
// (liste absente ou invalide : les trois).
export function reglagesCoups(json) {
  const p = json?.probabilite;
  const probabilite = typeof p === 'number' && Number.isFinite(p) && p >= 0 && p <= 1 ? p : COUPS_DEFAUT.probabilite;
  const t = Array.isArray(json?.types) ? json.types.filter((x) => TYPES_PERMIS.has(x)) : null;
  return { probabilite, types: t && t.length > 0 ? [...new Set(t)] : [...COUPS_DEFAUT.types] };
}

export function rngCoups(seed = 1) {
  return createRng(((Number.isFinite(Number(seed)) ? Number(seed) : 1) ^ GRAINE_COUPS) >>> 0 || 1);
}

// Un événement est-il un coup soumis au tirage ? (la mort ne l'est jamais)
export function estCoup(e, types = COUPS_DEFAUT.types) {
  if (!e || !types.includes(e.type)) return false;
  return !(e.type === 'zombieHit' && e.killed === true);
}

// Trie les événements d'une image : renvoie { events, rng } (rng : nouvel état du générateur des coups ; un tirage par coup seulement).
export function filtrerCoups(events, rng, reglages = COUPS_DEFAUT) {
  const list = Array.isArray(events) ? events : [];
  if (!list.some((e) => estCoup(e, reglages.types))) return { events: list, rng };
  let r = rng;
  const out = [];
  for (const e of list) {
    if (!estCoup(e, reglages.types)) {
      out.push(e);
      continue;
    }
    const t = nextFloat(r);
    r = t.rng;
    if (t.value < reglages.probabilite) out.push(e);
  }
  return { events: out, rng: r };
}
