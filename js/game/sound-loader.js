// Calcul des sons en code (js/core/synth.js) par blocs reprenables, sans bloquer l'écran : 8 ms par image pendant l'écran de
// préparation (sons « essentiel »), 4 ms par image pendant la partie (sons « fond »). Aucun fichier audio n'est chargé.
// Lot 3i : les sons de l'atelier intégrés au jeu (entrées « atelier » de data/game/sounds.json, js/core/synth2.js) sont calculés dans un
// calculateur d'arrière-plan (sound-worker.js) au même moment (essentiel avant la partie, fond pendant) : un rendu de synth2 n'est pas
// découpable en blocs, le fil principal ne fait donc que les recevoir. Sans Worker, repli sur le fil principal, un tampon par image.
// ?sons=ancien : les recettes remplacées (data/game/sounds-legacy.json) sont chargées par import dynamique et calculées à la place ;
// ?sons=A|B|C : la variante A, B ou C de l'atelier (data/game/sounds-atelier.json, import dynamique) pour chaque son de l'atelier.
import { finishRender, startRender, renderStep, variantCount } from '../core/synth.js';
import { isAtelier, parseSoundMode, renderChoice, renderSpec, seedCount } from '../core/sound-choice.js';

export const ESSENTIAL_SLICE_MS = 8;
export const BACKGROUND_SLICE_MS = 4;
const BLOCK = 2048; // échantillons par appel de renderStep : assez court pour tenir dans la tranche de temps

// Mode des sons (?sons=) : lu dans l'adresse, jamais mémorisé.
export const soundMode = () => parseSoundMode(typeof location === 'undefined' ? '' : location.search);

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
// Son de l'atelier : les `preload` premières versions (graines) ; les autres sont calculées au premier usage (js/game/audio.js).
export function planSounds(recipes, set) {
  const jobs = [];
  for (const recipe of Array.isArray(recipes) ? recipes : []) {
    if (set && recipe.set !== set) continue;
    const count = isAtelier(recipe) ? Math.min(seedCount(recipe), Math.max(1, Math.floor(recipe.preload ?? seedCount(recipe)))) : variantCount(recipe);
    for (let v = 0; v < count; v += 1) jobs.push({ name: `${recipe.id}-${v + 1}`, recipe, variant: v });
  }
  return jobs;
}

// ---------- pack ancien et variantes de l'atelier (import dynamique, jamais par défaut) ----------

let legacyPromise = null;
export function loadLegacy() {
  legacyPromise ??= import('./sound-legacy.js').then((m) => m.loadLegacySounds());
  return legacyPromise;
}
let slotsPromise = null;
export function loadAtelierSlots() {
  slotsPromise ??= import('./sound-atelier.js').then((m) => m.loadAtelierSlots());
  return slotsPromise;
}

// Tâches effectives selon le mode : ?sons=ancien remplace chaque son de l'atelier par toutes les variantes de sa recette d'avant (un son
// nouveau, sans recette d'avant, n'existe pas dans le pack ancien) ; les autres modes gardent les tâches.
export async function resolveJobs(jobs, mode = soundMode()) {
  if (mode !== 'ancien' || !jobs.some((j) => isAtelier(j.recipe))) return jobs;
  const legacy = new Map((await loadLegacy()).map((r) => [r.id, r]));
  const out = [];
  const done = new Set();
  for (const job of jobs) {
    if (!isAtelier(job.recipe)) {
      out.push(job);
      continue;
    }
    const old = legacy.get(job.recipe.id);
    if (!old || done.has(old.id)) continue;
    done.add(old.id);
    for (let v = 0; v < variantCount(old); v += 1) out.push({ name: `${old.id}-${v + 1}`, recipe: old, variant: v });
  }
  return out;
}

// ---------- calculateur d'arrière-plan ----------

let worker = null; // Worker, null (pas encore créé) ou false (indisponible : repli sur le fil principal)
let nextId = 0;
const pending = new Map();
function getWorker() {
  if (worker !== null) return worker || null;
  try {
    worker = new Worker(new URL('./sound-worker.js', import.meta.url), { type: 'module' });
    worker.onmessage = (event) => {
      const msg = event.data ?? {};
      const p = pending.get(msg.id);
      if (!p) return;
      pending.delete(msg.id);
      if (msg.ok) p.resolve(msg);
      else p.reject(new Error(msg.error));
    };
    worker.onerror = () => {
      // Calculateur en panne (module refusé) : les demandes en cours et suivantes passent par le fil principal.
      worker = false;
      for (const [, p] of pending) p.fallback();
      pending.clear();
    };
  } catch {
    worker = false;
  }
  return worker || null;
}

// Un tampon de l'atelier : { samples, sampleRate, ms } (ms : temps de calcul seul, dans le calculateur ou sur le fil principal).
// options : { version (graine, dès 1), durationSec, mode, now }.
export async function renderAtelier(recipe, { version = 1, durationSec = null, mode = soundMode(), now = () => performance.now(), inlineOnly = false } = {}) {
  const slots = mode === 'A' || mode === 'B' || mode === 'C' ? await loadAtelierSlots() : null;
  const spec = renderSpec(recipe, { mode, slots, seed: version, durationSec });
  const inline = () => {
    const t0 = now();
    const r = renderChoice(recipe, { mode, slots, seed: version, durationSec });
    return { samples: r.samples, sampleRate: r.sampleRate, ms: now() - t0 };
  };
  const w = spec && !inlineOnly ? getWorker() : null;
  if (!w) return inline();
  nextId += 1;
  const id = nextId;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject, fallback: () => resolve(inline()) });
    w.postMessage({ type: 'render', id, spec });
  });
}

// Calcule les tampons de `jobs`. onProgress(0..1) après chaque bloc ; onItem(item) quand un tampon est terminé.
// Renvoie { items: [{ name, id, variant, category, sampleRate, samples }], count, bytes, ms (temps de calcul seul) }.
export async function renderSounds(jobsIn, { sliceMs = ESSENTIAL_SLICE_MS, onProgress = () => {}, onItem = () => {}, now = () => performance.now(), wait = nextFrame, mode = soundMode() } = {}) {
  const jobs = await resolveJobs(jobsIn, mode);
  const weightOf = (j) => (j.recipe.duration ?? 0) * (j.recipe.sampleRate ?? 44100);
  const total = jobs.reduce((sum, j) => sum + weightOf(j), 0) || 1;
  let doneSamples = 0;
  let compute = 0;
  const items = [];
  let frameStart = now();
  const finish = (job, result) => {
    doneSamples += weightOf(job);
    const item = { name: job.name, id: job.recipe.id, variant: job.variant, category: job.recipe.category, loop: job.recipe.loop === true, sampleRate: result.sampleRate, samples: result.samples };
    items.push(item);
    onItem(item);
    onProgress(Math.min(1, doneSamples / total));
  };
  // Les sons de l'atelier partent tous au calculateur (dans l'ordre) pendant que le fil principal calcule les autres par tranches.
  // Sans calculateur, ils passent ensuite sur le fil principal, un tampon par image.
  const atelierJobs = jobs.filter((j) => isAtelier(j.recipe));
  const useWorker = atelierJobs.length > 0 && getWorker() !== null;
  const atelierResults = useWorker ? atelierJobs.map((job) => renderAtelier(job.recipe, { version: job.variant + 1, mode, now })) : [];
  for (const job of jobs) {
    if (isAtelier(job.recipe)) continue;
    const acc = startRender(job.recipe, job.variant);
    const weight = weightOf(job);
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
    finish(job, result);
    if (now() - frameStart >= sliceMs) {
      await wait();
      frameStart = now();
    }
  }
  for (let i = 0; i < atelierJobs.length; i += 1) {
    const result = useWorker ? await atelierResults[i] : await renderAtelier(atelierJobs[i].recipe, { version: atelierJobs[i].variant + 1, mode, now, inlineOnly: true });
    compute += result.ms;
    finish(atelierJobs[i], result);
    if (!useWorker || now() - frameStart >= sliceMs) {
      await wait();
      frameStart = now();
    }
  }
  onProgress(1);
  return { items, count: items.length, bytes: items.reduce((sum, i) => sum + i.samples.length * 4, 0), ms: compute };
}
