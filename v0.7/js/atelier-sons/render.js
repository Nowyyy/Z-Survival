// Calcul et mesure des sons de l'atelier (lot 3h), commun au calculateur d'arrière-plan (worker.js) et au repli sans Worker.
// Variantes : js/core/synth2.js ; sons actuels et références : js/core/synth.js (lecture seule, recettes inchangées).
import { renderSound } from '../core/synth.js';
import { renderVariant, resolveAtelier } from '../core/synth2.js';
import { checkTargets, measureSound } from '../core/atelier-check.js';

export function createRenderer({ atelier, sounds }) {
  const data = resolveAtelier(atelier);
  const slots = new Map(data.slots.map((s) => [s.id, s]));
  const recipes = new Map((sounds ?? []).map((s) => [s.id, s]));
  return function renderJob(job) {
    const t0 = performance.now();
    let samples;
    let sampleRate;
    let slot;
    if (job.kind === 'variant') {
      slot = slots.get(job.slot);
      const r = renderVariant(slot, job.variant, job.macros ?? {}, job.seed ?? 1);
      samples = r.samples;
      sampleRate = r.sampleRate;
    } else {
      const recipe = recipes.get(job.source);
      if (!recipe) throw new Error(`son inconnu : ${job.source}`);
      const r = renderSound(recipe, Math.max(0, (job.seed ?? 1) - 1));
      samples = r.samples;
      sampleRate = r.sampleRate;
      slot = job.slot ? slots.get(job.slot) : null;
    }
    const renderMs = performance.now() - t0;
    const m = measureSound(samples, sampleRate, job.kind === 'variant' ? slot : (slot ? { ...slot, gainDb: job.gainDb ?? slot.gainDb } : { gainDb: job.gainDb ?? 0 }), atelier.levelRef);
    // Le tampon actuel est lu à la hauteur du type de zombie (rate) : ses fréquences et sa durée sont rapportées à la lecture.
    const rate = job.rate ?? 1;
    const heard = rate === 1 ? m : { ...m, duration: m.duration / rate, centroid: m.centroid * rate, f0: m.f0 * rate, peakHz: m.peakHz * rate };
    const check = job.kind === 'variant' && slot?.target ? checkTargets(heard, slot.target, atelier.levelRef?.tolerance) : null;
    return { samples, sampleRate, measures: heard, check, renderMs, measureMs: performance.now() - t0 - renderMs };
  };
}
