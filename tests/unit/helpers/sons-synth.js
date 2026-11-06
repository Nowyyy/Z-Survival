// Lot 5e : recettes du moteur js/core/synth.js du pack de sons par défaut (entrées de data/game/sounds.json sans « engine: atelier »).
// Avant (lot 3i, tests/unit/helpers/sons-anciens.js) : les recettes remplacées par l'atelier venaient de data/game/sounds-legacy.json (?sons=ancien),
// pack d'avant retiré au lot 5e ; les sons de l'atelier sont vérifiés par tests/unit/sons-integres*.test.js et impact-chair.test.js.
import { readFileSync } from 'node:fs';

export function synthRecipes() {
  return JSON.parse(readFileSync('data/game/sounds.json', 'utf8')).sounds.filter((r) => r.engine !== 'atelier');
}
