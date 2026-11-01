// Rendu d'une entrée « atelier » de data/game/sounds.json (lot 3i), pur : renderVariant de js/core/synth2.js d'après renderSpec de
// sound-choice.js. Chargé par le calculateur d'arrière-plan (js/game/sound-worker.js), le repli sans Worker (import dynamique), la page d'écoute,
// les scripts et les tests ; jamais par le fil principal du jeu au chargement.
import { renderVariant } from './synth2.js';
import { renderSpec } from './sound-choice.js';

// { samples, sampleRate, duration, bytes } (Float32Array mono) ; options de renderSpec : { mode, slots, seed, durationSec }.
export function renderChoice(recipe, options = {}) {
  const spec = renderSpec(recipe, options);
  if (!spec) return { samples: new Float32Array(0), sampleRate: 22050, duration: 0, bytes: 0 };
  const r = renderVariant(spec.slot, spec.variant, spec.macros, spec.seed);
  return { samples: r.samples, sampleRate: r.sampleRate, duration: r.duration, bytes: r.bytes };
}
