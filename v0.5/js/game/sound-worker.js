// Calculateur d'arrière-plan des sons de l'atelier intégrés au jeu (lot 3i) : un rendu de js/core/synth2.js ne se découpe pas en blocs ;
// ici il ne bloque jamais l'affichage. Message { type: 'render', id, spec: { slot, variant, macros, seed } } -> { id, ok, samples, sampleRate, ms }
// (tampon transféré, sans copie).
import { renderVariant } from '../core/synth2.js';

self.onmessage = (event) => {
  const msg = event.data ?? {};
  if (msg.type !== 'render') return;
  try {
    const t0 = performance.now();
    const s = msg.spec ?? {};
    const r = renderVariant(s.slot, s.variant, s.macros ?? {}, s.seed ?? 1);
    const ms = performance.now() - t0;
    self.postMessage({ id: msg.id, ok: true, samples: r.samples, sampleRate: r.sampleRate, ms }, [r.samples.buffer]);
  } catch (error) {
    self.postMessage({ id: msg.id, ok: false, error: String(error?.message ?? error) });
  }
};
