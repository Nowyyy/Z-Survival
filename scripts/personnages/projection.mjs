// Projection du budget de dessin (lot 3j) : 10 zombies variés (3 marcheurs, 3 petits, 2 voûtés, 2 grands, comme les mesures du jeu) et
// le joueur, plus le sang à pleine charge et 6 cadavres, pour une variante (A, B, C, riche) ou pour un fichier « Mes choix » ; comparés à la référence
// mesurée sur main (R1, R2, U1, U4), aux limites actuelles (30 000 triangles, 300 appels) et aux limites de refonte (45 000, 400).
// Imprime, n'écrit rien. Usage : node scripts/personnages/projection.mjs [mes-choix.txt | data/game/persos-choix.json]
import { readFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { characterStats } from '../../js/core/character-parts.js';
import { bloodBudget, settings } from '../../js/core/blood.js';
import { parseChoices } from '../../js/core/persos-variants.js';
import { createPersoTexture, persoSpec } from '../../js/core/texgen-persos.js';
import { characters, load, resolve, skeletons, slotOf } from './lib.mjs';

// Références mesurées sur main (c166e53) par scripts/personnages/mesure-rendu.mjs (667 × 375, 10 zombies, planches, ombres, cône).
export const REFERENCE = { R1: { calls: 203, triangles: 14370 }, R2: { calls: 194, triangles: 14988 }, U1: { calls: 210, triangles: 15208 }, U4: { calls: 216, triangles: 16092 } };
export const LIMITS = { current: { calls: 300, triangles: 30000 }, refonte: { calls: 400, triangles: 45000 } };
export const CROWD = ['joueur', 'marcheur', 'marcheur', 'marcheur', 'petit', 'petit', 'petit', 'voute', 'voute', 'grand', 'grand'];

// Coût d'un personnage : appels et triangles (passe principale + passe d'ombre).
export function characterCost(slotId, variantId) {
  const slot = slotOf(slotId);
  if (variantId === 'actuel') {
    const s = characterStats(slot.current, { architecture: 'articulated', skeletons });
    const casters = slot.current.parts.filter((p) => p.casts).reduce((n, p) => n + (p.mirror ? 2 : 1) * characterStats({ ...slot.current, parts: [{ ...p, mirror: false }] }, { architecture: 'articulated', skeletons }).triangles, 0);
    return { calls: s.pieces + s.casters, triangles: s.triangles + casters };
  }
  const v = slot.variants.find((x) => x.id === variantId) ?? slot.variants[0];
  const s = characterStats(resolve(v), { skeletons });
  return { calls: s.calls + s.shadowCalls, triangles: s.triangles + 2 * s.shadowTriangles };
}
export function crowdCost(choiceOf) {
  return CROWD.reduce((acc, id) => {
    const c = characterCost(id, choiceOf(id));
    return { calls: acc.calls + c.calls, triangles: acc.triangles + c.triangles };
  }, { calls: 0, triangles: 0 });
}
// Projection d'un jeu de choix : décor de la référence (référence − personnages actuels) + personnages choisis + sang à pleine charge
// + cadavres (au plus 6, comptés comme des marcheurs de la variante choisie ; aucun au niveau 0).
export function project(choiceOf, level = '1') {
  const actual = crowdCost(() => 'actuel');
  const chosen = crowdCost(choiceOf);
  const blood = bloodBudget(load('blood'), level);
  const nCorpses = settings(load('blood'), level).corpses; // lot 3m : cadavres du niveau (complet et réduit : 2), plus le plafond absolu
  const corpse = characterCost('marcheur', choiceOf('marcheur') === 'actuel' ? 'actuel' : choiceOf('marcheur'));
  return Object.fromEntries(Object.entries(REFERENCE).map(([k, r]) => [k, { calls: r.calls - actual.calls + chosen.calls + blood.calls + nCorpses * corpse.calls, triangles: r.triangles - actual.triangles + chosen.triangles + blood.triangles + nCorpses * corpse.triangles }]));
}

// Lot 3m : variante de chaque personnage d'après la table des choix (variante absente ou inconnue : actuel, comme en jeu).
export function choicesOf(table) {
  const persos = table?.persos ?? {};
  return (id) => (['A', 'B', 'C', 'riche', 'actuel'].includes(persos[id]?.variante) ? persos[id].variante : 'actuel');
}

const main = () => {
  const file = process.argv[2];
  const rows = [];
  if (file?.endsWith('.json')) {
    // Lot 3m : table des choix du jeu (data/game/persos-choix.json) : variante de chaque personnage et sang par défaut.
    const table = JSON.parse(readFileSync(file, 'utf8'));
    rows.push([`choix (${file})`, choicesOf(table), String(table.sang ?? '0')]);
  } else if (file) {
    const parsed = parseChoices(readFileSync(file, 'utf8'));
    const by = Object.fromEntries(parsed.persos.map((p) => [p.perso, String(p.variante ?? 'A')]));
    rows.push([`choix (${file})`, (id) => by[id] ?? 'actuel', String(parsed.extra.sang ?? '1')]);
  } else {
    for (const v of ['actuel', 'A', 'B', 'C', 'riche']) rows.push([v, () => v, v === 'actuel' ? '0' : '1']);
  }
  console.log('| Personnages | Sang | Personnages (appels / triangles) | R1 | R2 | U1 | U4 | Marge pire cas / limites actuelles | Marge pire cas / refonte |');
  console.log('|---|---|---|---|---|---|---|---|---|');
  for (const [label, choiceOf, level] of rows) {
    const p = project(choiceOf, level);
    const c = crowdCost(choiceOf);
    const worst = Object.values(p).reduce((a, b) => ({ calls: Math.max(a.calls, b.calls), triangles: Math.max(a.triangles, b.triangles) }));
    const cell = (x) => `${x.calls} / ${x.triangles}`;
    console.log(`| ${label} | ${level} | ${cell(c)} | ${cell(p.R1)} | ${cell(p.R2)} | ${cell(p.U1)} | ${cell(p.U4)} | ${LIMITS.current.calls - worst.calls} appels, ${LIMITS.current.triangles - worst.triangles} triangles | ${LIMITS.refonte.calls - worst.calls} appels, ${LIMITS.refonte.triangles - worst.triangles} triangles |`);
  }
  const t0 = performance.now();
  for (let i = 0; i < 4; i += 1) createPersoTexture(persoSpec({ size: 256, tiles: 2, seed: i }));
  const zMs = performance.now() - t0;
  const t1 = performance.now();
  createPersoTexture(persoSpec({ size: 128, tiles: 1 }));
  const pMs = performance.now() - t1;
  const bytes = 4 * createPersoTexture(persoSpec({ size: 256 })).bytes + createPersoTexture(persoSpec({ size: 128, tiles: 1 })).bytes + Math.round((256 * 256 * 4 * 4) / 3);
  console.log(`\nTextures (Node, non représentatif d'un téléphone) : 4 atlas de zombies ${zMs.toFixed(1)} ms, joueur ${pMs.toFixed(1)} ms ; mémoire estimée avec le sang : ${bytes} octets (limite ${characters.budget.textureBytes}).`);
};
if (process.argv[1]?.endsWith('projection.mjs')) main();
