// Mixage : gain selon la distance, balance gauche-droite, étouffement selon la ligne de vue, choix de variante sans répétition,
// limite de voix par priorité, délais minimaux par son. Pur : aucune dépendance à Web Audio ; le temps arrive en argument.
import { firstOnSegment, validRects } from './collision.js';
import { createRng, nextInt } from './rng.js';
import { isNum, num } from './vec.js';

const clamp = (n, lo, hi) => Math.min(Math.max(n, lo), hi);

// Gain de 0 à 1 : plein sous la distance de référence, ref / d au-delà, puis fondu vers 0 sur le dernier quart avant la distance maximale.
export function distanceGain(distance, reference = 150, maximum = 1100) {
  const ref = Math.max(1, num(reference, 150));
  const max = Math.max(ref + 1, num(maximum, 1100));
  const d = Math.max(0, num(distance, max));
  if (d <= ref) return 1;
  if (d >= max) return 0;
  return (ref / d) * clamp((max - d) / (0.25 * max), 0, 1);
}

// Balance de -1 (gauche) à 1 (droite) selon le décalage horizontal source - joueur ; `range` : décalage qui donne la balance maximale.
export function panFor(dx, range = 500, maxPan = 0.9) {
  const r = Math.max(1, num(range, 500));
  return clamp(num(dx) / r, -1, 1) * clamp(num(maxPan, 0.9), 0, 1);
}

// Étouffé si un mur se trouve entre la source et l'écouteur. walls : rectangles { x, y, w, h } (les ouvertures des fenêtres sont libres).
export function isMuffled(from, to, walls) {
  const list = validRects(walls);
  if (list.length === 0) return false;
  return firstOnSegment(num(from?.x), num(from?.y), num(to?.x), num(to?.y), list) !== null;
}

// Choisit une variante dans [0, count) différente de la précédente (si count > 1). Renvoie { variant, rng }.
export function pickVariant(count, last, rng) {
  const n = isNum(count) && count >= 1 ? Math.floor(count) : 1;
  if (n <= 1) return { variant: 0, rng: rng ?? createRng(1) };
  const hasLast = isNum(last) && last >= 0 && last < n;
  const r = nextInt(rng ?? createRng(1), hasLast ? n - 1 : n);
  const variant = hasLast && r.value >= last ? r.value + 1 : r.value;
  return { variant, rng: r.rng };
}

export const createVoiceState = () => ({ voices: [], last: {}, nextId: 1 });

// Demande d'une voix : req = { sound, priority (nombre), duration (s) }. cfg = { maxVoices, minDelay: { son: s } }.
// Retourne { state, play, reason, stolen } : reason vaut 'delai' (trop tôt après la précédente lecture du même son), 'limite' (plus de place
// et priorité insuffisante) ou null ; stolen : voix coupée pour faire de la place (la moins prioritaire, la plus ancienne).
export function admitVoice(state, req, now, cfg) {
  const t = num(now);
  const sound = typeof req?.sound === 'string' ? req.sound : '';
  const priority = num(req?.priority);
  const max = isNum(cfg?.maxVoices) && cfg.maxVoices >= 1 ? Math.floor(cfg.maxVoices) : 16;
  const voices = (Array.isArray(state?.voices) ? state.voices : []).filter((v) => num(v.end) > t);
  const last = { ...(state?.last ?? {}) };
  const nextId = num(state?.nextId, 1);
  const minDelay = num(cfg?.minDelay?.[sound]);
  if (Object.hasOwn(last, sound) && t - last[sound] < minDelay) return { state: { voices, last, nextId }, play: false, reason: 'delai', stolen: null };
  let stolen = null;
  let kept = voices;
  if (voices.length >= max) {
    let low = voices[0];
    for (const v of voices) if (v.priority < low.priority || (v.priority === low.priority && v.start < low.start)) low = v;
    if (low.priority >= priority) return { state: { voices, last, nextId }, play: false, reason: 'limite', stolen: null };
    stolen = low.id;
    kept = voices.filter((v) => v !== low);
  }
  const voice = { id: nextId, sound, priority, start: t, end: t + Math.max(0.01, num(req?.duration, 0.5)) };
  last[sound] = t;
  return { state: { voices: [...kept, voice], last, nextId: nextId + 1 }, play: true, reason: null, stolen };
}
