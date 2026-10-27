// Effet VHS : calcul pur des valeurs de la surcouche (lignes de balayage, bords teintés, vignette, grain, scintillement, bande de suivi).
// Le temps t est l'horloge d'effet (secondes réelles, fournie par js/game, qui continue pendant la pause), distincte de l'horloge de jeu.
// Rien n'est lu ni écrit ailleurs : le temps, la graine et les réglages (data/game/vhs.json) arrivent en argument ; le hasard vient de
// rng.js. Jamais d'exception : une entrée absurde donne un effet éteint. Plafonds d'opacité : params.caps, jamais dépassés.
import { createRng, nextFloat } from './rng.js';
import { isNum } from './vec.js';

const clamp = (n, lo, hi) => Math.min(Math.max(n, lo), hi);
const isObject = (o) => o !== null && typeof o === 'object' && !Array.isArray(o);
const hash = (...parts) => parts.reduce((h, p) => (Math.imul(h ^ (p | 0), 0x9e3779b1) + 0x7f4a7c15) >>> 0, 0x811c9dc5);
const MAX_EVENTS = 20000; // garde-fou : au plus ~2 jours d'effet continu

export const OFF = Object.freeze({
  on: false, scanOpacity: 0, edgeOpacity: 0, vignetteOpacity: 0, grain: Object.freeze({ step: 0, x: 0, y: 0, opacity: 0 }), flicker: 0,
  track: Object.freeze({ active: false, y: 0, height: 0, opacity: 0, shiftPx: 0 }),
});

const seedOf = (seed, params) => (Number.isInteger(seed) ? seed : Number.isInteger(params?.seed) ? params.seed : 1);

// Passages de la bande de suivi qui touchent [from, to] : [{ index, start, end, duration, shiftPx }]. Suite déterministe d'après la graine
// (un passage toutes les minGap à maxGap secondes, durée de minDuration à maxDuration), indépendante de from et de to.
export function trackingEvents(seed, from, to, params) {
  const track = isObject(params?.track) ? params.track : {};
  const minGap = isNum(track.minGap) && track.minGap > 0 ? track.minGap : 6;
  const maxGap = isNum(track.maxGap) && track.maxGap >= minGap ? track.maxGap : Math.max(14, minGap);
  const minDur = isNum(track.minDuration) && track.minDuration > 0 ? track.minDuration : 0.15;
  const maxDur = isNum(track.maxDuration) && track.maxDuration >= minDur ? track.maxDuration : Math.max(0.4, minDur);
  const shift = isNum(track.shiftPx) ? track.shiftPx : 4;
  const a = isNum(from) ? from : 0;
  const b = isNum(to) ? to : 0;
  if (b < a || b < 0) return [];
  const out = [];
  let rng = createRng(hash(seedOf(seed, params), 0x5a17));
  let start = 0;
  for (let index = 0; index < MAX_EVENTS; index += 1) {
    const g = nextFloat(rng);
    const d = nextFloat(g.rng);
    const s = nextFloat(d.rng);
    rng = s.rng;
    start += minGap + g.value * (maxGap - minGap);
    if (start > b) break;
    const duration = minDur + d.value * (maxDur - minDur);
    if (start + duration >= a) out.push({ index, start, end: start + duration, duration, shiftPx: (s.value * 2 - 1) * shift });
  }
  return out;
}

// Valeurs de l'effet à l'instant t. options : { enabled, reducedMotion, intensity (0 à 1), params (vhs.json) }.
// Renvoie { on, scanOpacity, edgeOpacity, vignetteOpacity, grain: { step, x, y, opacity }, flicker, track: { active, y, height, opacity, shiftPx } }.
export function vhsFrame(t, seed, options) {
  const params = options?.params;
  if (!isObject(params) || !isObject(params.opacity) || !isObject(params.caps) || options?.enabled === false || options?.reducedMotion === true) return OFF;
  const k = clamp(isNum(options?.intensity) ? options.intensity : isNum(params.intensity) ? params.intensity : 1, 0, 1);
  const time = isNum(t) && t > 0 ? t : 0;
  const caps = isObject(params.caps) ? params.caps : {};
  const opa = isObject(params.opacity) ? params.opacity : {};
  const level = (name) => k * clamp(isNum(opa[name]) ? opa[name] : 0, 0, isNum(caps[name]) ? caps[name] : 0);
  const sd = seedOf(seed, params);
  const grainSize = Math.max(1, Math.floor(isNum(params.grain?.size) ? params.grain.size : 128));
  const grainRate = Math.max(1, isNum(params.grain?.rate) ? params.grain.rate : 10);
  const gStep = Math.floor(time * grainRate);
  const g = createRng(hash(sd, 0x6a1, gStep));
  const gx = nextFloat(g);
  const gy = nextFloat(gx.rng);
  const fRate = Math.max(1, isNum(params.flicker?.rate) ? params.flicker.rate : 8);
  const fCap = isNum(caps.flicker) ? caps.flicker : 0;
  const fAmp = clamp(isNum(params.flicker?.amplitude) ? params.flicker.amplitude : 0, 0, fCap);
  const f = nextFloat(createRng(hash(sd, 0xf11c, Math.floor(time * fRate))));
  const flicker = (f.value * 2 - 1) * fAmp * k + 0; // + 0 : jamais -0

  const track = isObject(params.track) ? params.track : {};
  const duration = isNum(track.maxDuration) ? track.maxDuration : 0.4;
  const event = trackingEvents(sd, time - duration, time, params).find((e) => time >= e.start && time < e.end);
  let tr = OFF.track;
  if (event) {
    const u = (time - event.start) / event.duration;
    tr = { active: true, y: clamp(u, 0, 1), height: clamp(isNum(track.height) ? track.height : 0.07, 0, 1), opacity: level('track') * Math.sin(Math.PI * clamp(u, 0, 1)), shiftPx: event.shiftPx };
  }
  return {
    on: true,
    scanOpacity: level('scan'),
    edgeOpacity: level('edge'),
    vignetteOpacity: level('vignette'),
    grain: { step: gStep, x: Math.floor(gx.value * grainSize), y: Math.floor(gy.value * grainSize), opacity: level('grain') },
    flicker,
    track: tr,
  };
}
