// Calcul des sons en code (js/core/synth.js) par blocs reprenables, sans bloquer l'écran : 8 ms par image pendant l'écran de
// préparation (sons « essentiel »), 4 ms par image pendant la partie (sons « fond »). Aucun fichier audio n'est chargé.
import { finishRender, startRender, renderStep, variantCount } from '../core/synth.js';

export const ESSENTIAL_SLICE_MS = 8;
export const BACKGROUND_SLICE_MS = 4;
const BLOCK = 2048; // échantillons par appel de renderStep : assez court pour tenir dans la tranche de temps

// Reprend à l'image suivante ; un minuteur prend le relais si le navigateur n'en donne pas (onglet en arrière-plan).
const FALLBACK_MS = 100;
const nextFrame = () => new Promise((resolve) => {
  let done = false;
  const go = () => {
    if (done) return;
    done = true;
    resolve();
  };
  requestAnimationFrame(go);
  setTimeout(go, FALLBACK_MS);
});

// Version pour la partie : tant que l'onglet est caché, le calcul s'arrête (aucune boucle d'images) et reprend au retour.
export async function nextVisibleFrame() {
  while (document.hidden) await new Promise((resolve) => document.addEventListener('visibilitychange', resolve, { once: true }));
  await nextFrame();
}

// Liste des tampons à calculer pour un ensemble (« essentiel » ou « fond ») : [{ name, recipe, variant }], name = « id-n » (n dès 1).
export function planSounds(recipes, set) {
  const jobs = [];
  for (const recipe of Array.isArray(recipes) ? recipes : []) {
    if (set && recipe.set !== set) continue;
    for (let v = 0; v < variantCount(recipe); v += 1) jobs.push({ name: `${recipe.id}-${v + 1}`, recipe, variant: v });
  }
  return jobs;
}

// Calcule les tampons de `jobs`. onProgress(0..1) après chaque bloc ; onItem(item) quand un tampon est terminé.
// Renvoie { items: [{ name, id, variant, category, sampleRate, samples }], count, bytes, ms (temps de calcul seul) }.
export async function renderSounds(jobs, { sliceMs = ESSENTIAL_SLICE_MS, onProgress = () => {}, onItem = () => {}, now = () => performance.now(), wait = nextFrame } = {}) {
  const total = jobs.reduce((sum, j) => sum + (j.recipe.duration ?? 0) * (j.recipe.sampleRate ?? 44100), 0) || 1;
  let doneSamples = 0;
  let compute = 0;
  const items = [];
  let frameStart = now();
  for (const job of jobs) {
    const acc = startRender(job.recipe, job.variant);
    const weight = (job.recipe.duration ?? 0) * (job.recipe.sampleRate ?? 44100);
    for (;;) {
      const t0 = now();
      const step = renderStep(acc, BLOCK);
      compute += now() - t0;
      onProgress(Math.min(1, (doneSamples + weight * step.progress) / total));
      if (step.done) break;
      if (now() - frameStart >= sliceMs) {
        await wait();
        frameStart = now();
      }
    }
    const t1 = now();
    const result = finishRender(acc);
    compute += now() - t1;
    doneSamples += weight;
    const item = { name: job.name, id: job.recipe.id, variant: job.variant, category: job.recipe.category, loop: job.recipe.loop === true, sampleRate: result.sampleRate, samples: result.samples };
    items.push(item);
    onItem(item);
    if (now() - frameStart >= sliceMs) {
      await wait();
      frameStart = now();
    }
  }
  onProgress(1);
  return { items, count: items.length, bytes: items.reduce((sum, i) => sum + i.samples.length * 4, 0), ms: compute };
}
