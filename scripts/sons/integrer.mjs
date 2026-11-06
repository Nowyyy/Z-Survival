// Intégration des sons de l'atelier au jeu (lot 3i) : d'après data/game/sounds-choix.json (table des choix, source : Docs/ref/sons-a-integrer.md)
// et data/game/sounds-atelier.json (recettes), écrit dans data/game/sounds.json une entrée « atelier » par son intégré (recette résolue de la
// variante retenue, réglages, nombre de graines, durée) sous l'identifiant du jeu, à la place de la recette remplacée (lot 5e : le pack d'avant,
// data/game/sounds-legacy.json, est retiré et n'est plus écrit). Idempotent : à relancer après une modification de la table des choix.
// Usage : node scripts/sons/integrer.mjs [--verifier] (--verifier : n'écrit rien, échoue si les fichiers ne sont pas à jour).
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolveAtelier, renderVariant } from '../../js/core/synth2.js';
import { ATELIER_ENGINE, checkChoices } from '../../js/core/sound-choice.js';

const read = (f) => JSON.parse(readFileSync(f, 'utf8'));

// Entrée de sounds.json pour un choix : recette résolue de la seule variante retenue (renderVariant n'a besoin que d'elle).
export function entryFor(choice, slot, preload) {
  const variant = slot.variants.find((v) => v.id === choice.variant);
  const first = renderVariant(slot, choice.variant, choice.macros, 1);
  return {
    id: choice.id,
    category: choice.category,
    set: choice.set,
    engine: ATELIER_ENGINE,
    sampleRate: first.sampleRate,
    duration: Math.round(first.duration * 1e6) / 1e6,
    variants: choice.seeds,
    preload: Math.min(choice.seeds, preload ?? choice.seeds),
    loop: slot.loop === true,
    ...(choice.gainDb ? { gainDb: choice.gainDb } : {}),
    ...(choice.category === 'voix' ? { fixedRate: true } : {}),
    ...(choice.trigger ? { trigger: choice.trigger } : {}),
    atelier: {
      slot: { id: slot.id, sampleRate: slot.sampleRate, ...(slot.bufferLevelDb === undefined ? {} : { bufferLevelDb: slot.bufferLevelDb }), variants: [{ id: variant.id, recipe: variant.recipe, macros: variant.macros }] },
      variant: choice.variant,
      macros: choice.macros,
    },
  };
}

export function integrate({ sounds, choix, atelierRaw }) {
  const data = resolveAtelier(atelierRaw);
  const slots = new Map(data.slots.map((s) => [s.id, s]));
  const problems = checkChoices(choix, slots);
  if (problems.length > 0) throw new Error(problems.join('\n'));
  let list = [...sounds.sounds];
  // Chaque choix prend la place de la recette remplacée, sinon se range après l'identifiant de base (zombie-mort-petit après zombie-mort).
  for (const c of choix.choix) {
    const entry = entryFor({ ...c, trigger: c.id === 'planche-posee' ? 'repairStart' : c.trigger }, slots.get(c.slot), c.preload ?? choix.preload);
    const at = list.findIndex((s) => s.id === c.id);
    if (at >= 0) {
      list[at] = entry;
      continue;
    }
    const base = c.id.replace(/-(petit|voute|grand)$/, '');
    let after = -1;
    list.forEach((s, i) => {
      if (s.id === base || s.id.startsWith(`${base}-`)) after = i;
    });
    if (after < 0) list.push(entry);
    else list = [...list.slice(0, after + 1), entry, ...list.slice(after + 1)];
  }
  return { sounds: { ...sounds, sounds: list } };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const sounds = read('data/game/sounds.json');
  const out = integrate({ sounds, choix: read('data/game/sounds-choix.json'), atelierRaw: read('data/game/sounds-atelier.json') });
  const files = [['data/game/sounds.json', out.sounds]];
  if (process.argv.includes('--verifier')) {
    const stale = files.filter(([f, v]) => !existsSync(f) || readFileSync(f, 'utf8') !== `${JSON.stringify(v, null, 2)}\n`).map(([f]) => f);
    if (stale.length > 0) {
      console.log(`À régénérer : ${stale.join(', ')}`);
      process.exit(1);
    }
    console.log('Pack à jour.');
  } else {
    for (const [f, v] of files) writeFileSync(f, `${JSON.stringify(v, null, 2)}\n`);
    console.log(`${out.sounds.sounds.length} sons dans sounds.json (${out.sounds.sounds.filter((s) => s.engine === ATELIER_ENGINE).length} de l'atelier).`);
  }
}
