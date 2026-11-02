// Lot 3i : recettes du moteur js/core/synth.js, telles que le jeu les avait avant l'intégration des sons de l'atelier. Les recettes remplacées
// sont dans data/game/sounds-legacy.json (?sons=ancien), à leur place d'origine ; les sons de l'atelier (entrées « engine: atelier » de
// sounds.json) sont vérifiés par tests/unit/sons-integres.test.js. Les tests de sons d'avant gardent ainsi toutes leurs vérifications.
import { readFileSync } from 'node:fs';

export function synthRecipes() {
  const { sounds } = JSON.parse(readFileSync('data/game/sounds.json', 'utf8'));
  const legacy = new Map(JSON.parse(readFileSync('data/game/sounds-legacy.json', 'utf8')).sounds.map((r) => [r.id, r]));
  return sounds.flatMap((r) => (r.engine === 'atelier' ? (legacy.has(r.id) ? [legacy.get(r.id)] : []) : [r]));
}
