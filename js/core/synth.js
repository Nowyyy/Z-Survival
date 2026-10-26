// Synthèse sonore pure : une recette (data/game/sounds.json) devient un tampon mono de nombres flottants, sans Web Audio, sans horloge et
// sans hasard natif (le hasard vient de rng.js, graine = recette + variante). Mêmes entrées = mêmes échantillons.
//
// Rendu reprenable : startRender -> renderStep (autant de fois que voulu, par blocs) -> finishRender. Le résultat ne dépend pas de la
// taille des blocs, parce que chaque étape (couches, saturation, réverbération) traite les échantillons un par un dans l'ordre.
// Les accumulateurs sont les SEULS objets mutables du module ; la recette n'est jamais modifiée (une recette gelée est acceptée).
//
// Briques : oscillateurs (sinus, triangle, scie et carré bandelimités par polyBLEP), bruits blanc / rose / brun, filtres biquad à
// fréquence balayée, enveloppes, vibrato, modulation d'amplitude, partiels résonants, voix à formants, saturation douce, réverbération
// de Schroeder (peignes + passe-tout), normalisation au pic cible, fondu de fin, bouclage par fondu enchaîné.
import { createRng, nextFloat } from './rng.js';
import { isNum } from './vec.js';

export const MAX_DURATION = 10;
export const DEFAULT_RATE = 44100;
export const LAYER_TYPES = Object.freeze(['osc', 'noise', 'ring', 'voice']);
const CONTROL = 32; // les coefficients de filtre sont mis à jour tous les 32 échantillons (indice absolu : indépendant des blocs)
const TAU = Math.PI * 2;
const FADE_IN = 0.0003;
const DEFAULT_FADE_OUT = 0.005;
const DEFAULT_PEAK = 0.8;
const MAX_PEAK = 0.975; // marge sous 0,98 : l'arrondi en nombres flottants 32 bits ne doit jamais dépasser le plafond

const num = (n, fallback = 0) => (isNum(n) ? n : fallback);
const clamp = (n, lo, hi) => Math.min(Math.max(n, lo), hi);
const db = (x) => 10 ** (x / 20);
const isObject = (o) => o !== null && typeof o === 'object' && !Array.isArray(o);

// Voyelles : formants F1..F3 (Hz) et gains relatifs ; valeurs usuelles de la phonétique (voix masculine), « eu » pour les râles.
export const VOWELS = Object.freeze({
  a: [800, 1150, 2900],
  o: [450, 800, 2830],
  u: [325, 700, 2700],
  e: [400, 2000, 2550],
  i: [270, 2140, 2950],
  eu: [500, 1400, 2500],
});
const FORMANT_GAIN = [1, 0.6, 0.35];
const FORMANT_BW = [90, 110, 150];

// ---------- briques ----------

function polyBlep(t, dt) {
  if (t < dt) {
    const x = t / dt;
    return x + x - x * x - 1;
  }
  if (t > 1 - dt) {
    const x = (t - 1) / dt;
    return x * x + x + x + 1;
  }
  return 0;
}

// Forme d'onde de phase 0..1 ; dt = fréquence / taux d'échantillonnage (pour polyBLEP).
function wave(kind, ph, dt) {
  if (kind === 'sine') return Math.sin(TAU * ph);
  if (kind === 'triangle') return 4 * Math.abs(ph - Math.floor(ph + 0.5)) - 1;
  if (kind === 'saw') return 2 * ph - 1 - polyBlep(ph, dt);
  return (ph < 0.5 ? 1 : -1) + polyBlep(ph, dt) - polyBlep((ph + 0.5) % 1, dt); // carré
}

const WAVES = ['sine', 'triangle', 'saw', 'square'];

// Bruit d'un état { rng, color, ... } : renvoie une valeur dans [-1, 1] environ.
function createNoise(color, seed) {
  return { rng: createRng(seed), color, p: [0, 0, 0, 0, 0, 0, 0], brown: 0 };
}
function noiseTick(n) {
  const r = nextFloat(n.rng);
  n.rng = r.rng;
  const w = r.value * 2 - 1;
  if (n.color === 'pink') {
    const p = n.p;
    p[0] = 0.99886 * p[0] + w * 0.0555179;
    p[1] = 0.99332 * p[1] + w * 0.0750759;
    p[2] = 0.969 * p[2] + w * 0.153852;
    p[3] = 0.8665 * p[3] + w * 0.3104856;
    p[4] = 0.55 * p[4] + w * 0.5329522;
    p[5] = -0.7616 * p[5] - w * 0.016898;
    const out = (p[0] + p[1] + p[2] + p[3] + p[4] + p[5] + p[6] + w * 0.5362) * 0.11;
    p[6] = w * 0.115926;
    return out;
  }
  if (n.color === 'brown') {
    n.brown = (n.brown + 0.02 * w) / 1.02;
    return n.brown * 3.5;
  }
  return w;
}

// Biquad (RBJ). type : lowpass | highpass | bandpass | peak. Retourne un filtre à état.
function createBiquad() {
  return { b0: 1, b1: 0, b2: 0, a1: 0, a2: 0, x1: 0, x2: 0, y1: 0, y2: 0 };
}
function setBiquad(f, type, freq, q, gainDb, rate) {
  const w0 = (TAU * clamp(freq, 10, rate * 0.45)) / rate;
  const cos = Math.cos(w0);
  const alpha = Math.sin(w0) / (2 * Math.max(0.05, q));
  let b0;
  let b1;
  let b2;
  let a0 = 1 + alpha;
  let a1 = -2 * cos;
  let a2 = 1 - alpha;
  if (type === 'highpass') {
    b0 = (1 + cos) / 2;
    b1 = -(1 + cos);
    b2 = b0;
  } else if (type === 'bandpass') {
    b0 = alpha;
    b1 = 0;
    b2 = -alpha;
  } else if (type === 'peak') {
    const A = 10 ** (gainDb / 40);
    b0 = 1 + alpha * A;
    b1 = -2 * cos;
    b2 = 1 - alpha * A;
    a0 = 1 + alpha / A;
    a2 = 1 - alpha / A;
  } else {
    b0 = (1 - cos) / 2;
    b1 = 1 - cos;
    b2 = b0;
  }
  f.b0 = b0 / a0;
  f.b1 = b1 / a0;
  f.b2 = b2 / a0;
  f.a1 = a1 / a0;
  f.a2 = a2 / a0;
}
function biquad(f, x) {
  const y = f.b0 * x + f.b1 * f.x1 + f.b2 * f.x2 - f.a1 * f.y1 - f.a2 * f.y2;
  f.x2 = f.x1;
  f.x1 = x;
  f.y2 = f.y1;
  f.y1 = y;
  return y;
}

// Fréquence ou [départ, arrivée] -> valeur à l'instant t (balayage exponentiel sur `over` secondes).
function sweep(spec, t, over, scale) {
  if (Array.isArray(spec)) {
    const f0 = Math.max(1, num(spec[0], 1)) * scale;
    const f1 = Math.max(1, num(spec[1], spec[0])) * scale;
    const u = over > 0 ? clamp(t / over, 0, 1) : 1;
    return f0 * (f1 / f0) ** u;
  }
  return Math.max(1, num(spec, 1)) * scale;
}

// Enveloppe : attaque linéaire, tenue, décroissance exponentielle (constante de temps `decay`), relâchement linéaire avant la fin.
function envelope(spec, t, dur) {
  const attack = Math.max(0, num(spec.attack));
  const hold = Math.max(0, num(spec.hold));
  const decay = Math.max(0, num(spec.decay));
  const release = Math.max(0, num(spec.release));
  let e = attack > 0 ? Math.min(1, t / attack) : 1;
  if (decay > 0) e *= Math.exp(-Math.max(0, t - attack - hold) / decay);
  if (release > 0 && t > dur - release) e *= Math.max(0, (dur - t) / release);
  return e;
}

function modulation(spec, t) {
  const am = spec.am;
  if (!isObject(am)) return 1;
  const depth = clamp(num(am.depth), 0, 1);
  return 1 - depth + depth * (0.5 + 0.5 * Math.sin(TAU * num(am.rate, 5) * t));
}

function filterChain(spec, rate) {
  const list = Array.isArray(spec.filter) ? spec.filter : isObject(spec.filter) ? [spec.filter] : [];
  return list.filter(isObject).map((f) => ({ spec: f, state: createBiquad(), type: ['lowpass', 'highpass', 'bandpass', 'peak'].includes(f.type) ? f.type : 'lowpass', rate }));
}
function updateFilters(chain, t, over, scale) {
  for (const f of chain) setBiquad(f.state, f.type, sweep(f.spec.freq ?? 1000, t, num(f.spec.sweep, over), scale), num(f.spec.q, 0.707), num(f.spec.gain), f.rate);
}
function runFilters(chain, x) {
  let y = x;
  for (const f of chain) y = biquad(f.state, y);
  return y;
}

// ---------- couches ----------
// Chaque constructeur renvoie { start, end, tick(i) } : i = indice local (depuis start), valeur déjà multipliée par le gain.

function buildOsc(spec, ctx) {
  const kind = WAVES.includes(spec.wave) ? spec.wave : 'sine';
  const chain = filterChain(spec, ctx.rate);
  const over = num(spec.sweepTime, ctx.dur);
  let ph = 0;
  let freq = 0;
  const vib = isObject(spec.vibrato) ? spec.vibrato : null;
  return (i) => {
    const t = i / ctx.rate;
    if (i % CONTROL === 0) {
      freq = sweep(spec.freq ?? 440, t, over, ctx.fscale);
      updateFilters(chain, t, ctx.dur, ctx.fscale);
    }
    let f = freq;
    if (vib) f *= 1 + num(vib.depth, 0.01) * Math.sin(TAU * num(vib.rate, 5) * t);
    f = clamp(f, 1, ctx.rate * 0.45);
    ph += f / ctx.rate;
    ph -= Math.floor(ph);
    return runFilters(chain, wave(kind, ph, f / ctx.rate)) * envelope(spec, t, ctx.dur) * modulation(spec, t) * ctx.gain;
  };
}

function buildNoise(spec, ctx) {
  const color = ['white', 'pink', 'brown'].includes(spec.color) ? spec.color : 'white';
  const noise = createNoise(color, ctx.noiseSeed);
  const chain = filterChain(spec, ctx.rate);
  return (i) => {
    const t = i / ctx.rate;
    if (i % CONTROL === 0) updateFilters(chain, t, ctx.dur, ctx.fscale);
    return runFilters(chain, noiseTick(noise)) * envelope(spec, t, ctx.dur) * modulation(spec, t) * ctx.gain;
  };
}

// Partiels résonants : sinus à décroissance exponentielle propre (cloches, métal, tintements).
function buildRing(spec, ctx) {
  let r = createRng(ctx.noiseSeed);
  const parts = (Array.isArray(spec.partials) ? spec.partials : []).filter((p) => isObject(p) && isNum(p.freq) && p.freq > 0).slice(0, 16).map((p) => {
    const d = nextFloat(r);
    r = d.rng;
    return { f: clamp(p.freq * ctx.fscale * (1 + (d.value * 2 - 1) * num(spec.detune, 0.01)), 20, ctx.rate * 0.45), g: num(p.gain, 1), decay: Math.max(0.0005, num(p.decay, 0.05)) };
  });
  return (i) => {
    const t = i / ctx.rate;
    let sum = 0;
    for (const p of parts) sum += p.g * Math.sin(TAU * p.f * t) * Math.exp(-t / p.decay);
    return sum * Math.min(1, t / Math.max(1e-5, num(spec.attack, 0.0003))) * ctx.gain;
  };
}

function contourAt(points, u) {
  if (!Array.isArray(points) || points.length === 0) return 1;
  const pts = points.filter((p) => Array.isArray(p) && isNum(p[0]) && isNum(p[1]));
  if (pts.length === 0) return 1;
  if (u <= pts[0][0]) return pts[0][1];
  for (let k = 1; k < pts.length; k += 1) {
    if (u <= pts[k][0]) {
      const span = pts[k][0] - pts[k - 1][0];
      return span > 0 ? pts[k - 1][1] + ((pts[k][1] - pts[k - 1][1]) * (u - pts[k - 1][0])) / span : pts[k][1];
    }
  }
  return pts[pts.length - 1][1];
}

// Voix : source glottale (scie bandelimitée + pente + souffle) à hauteur contournée, tremblante et irrégulière, filtrée par un banc de
// formants dont les fréquences passent d'une voyelle à l'autre.
function buildVoice(spec, ctx) {
  const vowels = (Array.isArray(spec.vowels) ? spec.vowels : ['a']).map((v) => VOWELS[v] ?? VOWELS.a);
  const from = vowels[0];
  const to = vowels[1] ?? vowels[0];
  const trans = Array.isArray(spec.transition) ? spec.transition : [0, 1];
  const noise = createNoise('white', ctx.noiseSeed);
  const jitterNoise = createNoise('white', ctx.noiseSeed + 17);
  const bank = [0, 1, 2].map(() => createBiquad());
  const tilt = createBiquad();
  setBiquad(tilt, 'lowpass', num(spec.tilt, 2200), 0.6, 0, ctx.rate);
  const breath = clamp(num(spec.breath), 0, 2);
  const voiced = clamp(num(spec.voiced, 1), 0, 2);
  const trem = isObject(spec.tremor) ? spec.tremor : null;
  const rough = isObject(spec.roughness) ? spec.roughness : null;
  const bwScale = Math.max(0.2, num(spec.bandwidth, 1));
  let ph = 0;
  let jit = 0;
  let base = 0;
  return (i) => {
    const t = i / ctx.rate;
    const u = ctx.dur > 0 ? t / ctx.dur : 0;
    if (i % CONTROL === 0) {
      const w = clamp((u - num(trans[0])) / Math.max(1e-6, num(trans[1], 1) - num(trans[0])), 0, 1);
      const s = w * w * (3 - 2 * w);
      for (let k = 0; k < 3; k += 1) {
        const f = (from[k] + (to[k] - from[k]) * s) * ctx.fscale ** 0.5 * num(spec.formantScale, 1);
        setBiquad(bank[k], 'bandpass', f, f / (FORMANT_BW[k] * bwScale), 0, ctx.rate);
      }
      base = num(spec.f0, 110) * ctx.fscale * contourAt(spec.contour, u);
    }
    jit += (noiseTick(jitterNoise) - jit) * 0.002;
    let f = base * (1 + num(spec.jitter, 0.02) * (jit / 0.018));
    if (trem) f *= 1 + num(trem.depth, 0.02) * Math.sin(TAU * num(trem.rate, 5.5) * t);
    f = clamp(f, 20, ctx.rate * 0.3);
    ph += f / ctx.rate;
    ph -= Math.floor(ph);
    let src = voiced * biquad(tilt, wave('saw', ph, f / ctx.rate)) + breath * noiseTick(noise);
    if (rough) {
      const pulse = Math.max(0, Math.sin(TAU * num(rough.rate, 35) * t));
      src *= 1 - clamp(num(rough.depth, 0.5), 0, 1) + clamp(num(rough.depth, 0.5), 0, 1) * pulse * pulse;
    }
    let out = 0;
    for (let k = 0; k < 3; k += 1) out += FORMANT_GAIN[k] * biquad(bank[k], src);
    return out * envelope(spec, t, ctx.dur) * ctx.gain;
  };
}

const BUILDERS = { osc: buildOsc, noise: buildNoise, ring: buildRing, voice: buildVoice };

// ---------- post-traitement en flux ----------

const COMBS = [1116, 1188, 1277, 1356];
const ALLPASS = [556, 441];

function createReverb(cfg, rate) {
  const decay = clamp(num(cfg.decay, 0.35), 0.05, 4);
  const damp = clamp(num(cfg.damping, 0.4), 0, 0.95);
  const scale = rate / 44100;
  const combs = COMBS.map((n) => {
    const len = Math.max(8, Math.round(n * scale));
    return { buf: new Float64Array(len), idx: 0, filt: 0, fb: 10 ** ((-3 * len) / rate / decay) };
  });
  const aps = ALLPASS.map((n) => ({ buf: new Float64Array(Math.max(8, Math.round(n * scale))), idx: 0 }));
  return { combs, aps, damp, mix: clamp(num(cfg.mix, 0.3), 0, 1.5) };
}
function reverbTick(rv, x) {
  let wet = 0;
  for (const c of rv.combs) {
    const out = c.buf[c.idx];
    c.filt = out * (1 - rv.damp) + c.filt * rv.damp;
    c.buf[c.idx] = x + c.filt * c.fb;
    c.idx = (c.idx + 1) % c.buf.length;
    wet += out;
  }
  wet *= 0.25;
  for (const a of rv.aps) {
    const out = a.buf[a.idx];
    const y = -wet + out;
    a.buf[a.idx] = wet + out * 0.5;
    a.idx = (a.idx + 1) % a.buf.length;
    wet = y;
  }
  return x + rv.mix * wet;
}

// ---------- rendu reprenable ----------

const EMPTY = (id, variant, rate, warnings) => ({ id, variant, sampleRate: rate, samples: new Float32Array(0), peak: 0, rms: 0, duration: 0, warnings });

const hash = (a, b) => (Math.imul(a | 0, 0x9e3779b1) ^ Math.imul((b | 0) + 1, 0x85ebca6b)) >>> 0;

// Prépare un accumulateur. Une recette absurde donne un accumulateur déjà terminé et vide, avec des avertissements.
export function startRender(recipe, variantIndex = 0) {
  const warnings = [];
  const r = isObject(recipe) ? recipe : {};
  if (!isObject(recipe)) warnings.push('recette absente ou invalide');
  const id = typeof r.id === 'string' ? r.id : '';
  const variant = isNum(variantIndex) && variantIndex >= 0 ? Math.floor(variantIndex) : 0;
  let rate = DEFAULT_RATE;
  if (isNum(r.sampleRate) && r.sampleRate >= 8000 && r.sampleRate <= 96000) rate = Math.round(r.sampleRate);
  else if (r.sampleRate !== undefined) warnings.push(`taux d'échantillonnage invalide (${String(r.sampleRate)}) : ${DEFAULT_RATE}`);
  const seconds = num(r.duration, 0);
  if (!(seconds > 0)) warnings.push('durée absente, nulle ou négative');
  if (seconds > MAX_DURATION) warnings.push(`durée limitée à ${MAX_DURATION} s`);
  const duration = clamp(seconds, 0, MAX_DURATION);
  const loop = r.loop === true;
  const overlap = loop ? Math.min(duration * 0.5, Math.max(0.05, num(r.loopOverlap, 0.4))) : 0;
  const length = Math.round(duration * rate);
  const total = Math.round((duration + overlap) * rate);
  const post = isObject(r.post) ? r.post : {};
  const acc = {
    id, variant, rate, length, total, loop, overlap: Math.round(overlap * rate), pos: 0, warnings, post, result: null,
    buf: new Float32Array(length > 0 ? total : 0), layers: [], rv: null, saturation: Math.max(0, num(post.saturation)), dcX: 0, dcY: 0, dcR: 1 - (TAU * 15) / rate,
  };
  if (length <= 0) {
    acc.total = 0;
    return acc;
  }
  const seed = num(r.seed, 1) + variant;
  const freqVar = clamp(num(r.freqVar, 0.08), 0, 0.5);
  const gainVar = clamp(num(r.gainVar, 1.5), 0, 6);
  const layers = Array.isArray(r.layers) ? r.layers : [];
  if (layers.length === 0) warnings.push('aucune couche');
  layers.forEach((spec, index) => {
    if (!isObject(spec) || !Object.hasOwn(BUILDERS, spec.type)) {
      warnings.push(`couche ${index} : type inconnu (${String(isObject(spec) ? spec.type : spec)})`);
      return;
    }
    let lr = createRng(hash(seed, index));
    const draw = () => {
      const d = nextFloat(lr);
      lr = d.rng;
      return d.value * 2 - 1;
    };
    const fv = num(spec.freqVar, freqVar);
    const fscale = 1 + draw() * fv;
    const gain = num(spec.gain, 1) * db(draw() * gainVar);
    const jitter = draw() * Math.max(0, num(spec.startJitter));
    const start = Math.max(0, Math.round((num(spec.start) + jitter) * rate));
    const dur = Math.max(0, num(spec.dur, (duration + overlap) - num(spec.start)));
    const end = Math.min(acc.total, start + Math.round(dur * rate));
    if (end <= start) {
      warnings.push(`couche ${index} : vide`);
      return;
    }
    const ctx = { rate, dur: (end - start) / rate, fscale, gain, noiseSeed: hash(seed + 977, index) };
    acc.layers.push({ start, end, tick: BUILDERS[spec.type](spec, ctx) });
  });
  if (isObject(post.reverb) && num(post.reverb.mix, 0.3) > 0) acc.rv = createReverb(post.reverb, rate);
  acc.finalGain = db(clamp(num(r.finalGainVar, gainVar / 2), 0, 6) * (hash(seed, 4242) / 4294967296 * 2 - 1));
  return acc;
}

// Avance d'au plus maxSamples échantillons. Retourne { done, progress } ; sans effet sur un accumulateur invalide ou terminé.
export function renderStep(acc, maxSamples = 4096) {
  if (!isObject(acc) || !(acc.buf instanceof Float32Array)) return { done: true, progress: 1 };
  if (acc.total <= 0 || acc.pos >= acc.total) return { done: true, progress: 1 };
  const n = isNum(maxSamples) && maxSamples >= 1 ? Math.floor(maxSamples) : 4096;
  const from = acc.pos;
  const to = Math.min(acc.total, from + n);
  const buf = acc.buf;
  for (const layer of acc.layers) {
    const a = Math.max(from, layer.start);
    const b = Math.min(to, layer.end);
    for (let i = a; i < b; i += 1) buf[i] += layer.tick(i - layer.start);
  }
  const drive = acc.saturation;
  const norm = drive > 0 ? 1 / Math.tanh(drive) : 1;
  for (let i = from; i < to; i += 1) {
    let x = buf[i];
    if (drive > 0) x = Math.tanh(drive * x) * norm;
    if (acc.rv) x = reverbTick(acc.rv, x);
    // Filtre anti-décalage continu (coupure ~15 Hz) : les bruits bruns et les basses ne dérivent pas.
    const y = x - acc.dcX + acc.dcR * acc.dcY;
    acc.dcX = x;
    acc.dcY = y;
    buf[i] = y;
  }
  acc.pos = to;
  return { done: to >= acc.total, progress: to / acc.total };
}

// Termine le rendu (finit les blocs restants au besoin) : bouclage, normalisation au pic cible, fondus. Résultat mis en cache.
export function finishRender(acc) {
  if (!isObject(acc) || !(acc.buf instanceof Float32Array)) return EMPTY('', 0, DEFAULT_RATE, ['accumulateur invalide']);
  if (acc.result) return acc.result;
  if (acc.length <= 0) {
    acc.result = EMPTY(acc.id, acc.variant, acc.rate, acc.warnings);
    return acc.result;
  }
  while (renderStep(acc, 65536).done === false);
  const out = acc.buf.slice(0, acc.length);
  if (acc.loop && acc.overlap > 0) {
    // Fondu enchaîné entre la queue (au-delà de la durée) et la tête : le dernier échantillon enchaîne sur le premier.
    const m = Math.min(acc.overlap, acc.length);
    for (let i = 0; i < m; i += 1) {
      const w = (i + 1) / (m + 1);
      out[i] = acc.buf[acc.length + i] * Math.sqrt(1 - w) + out[i] * Math.sqrt(w);
    }
  }
  let peak = 0;
  for (let i = 0; i < out.length; i += 1) {
    const a = Math.abs(out[i]);
    if (!Number.isFinite(a)) {
      out[i] = 0;
      acc.warnings.push('échantillon non fini remplacé par 0');
    } else if (a > peak) peak = a;
  }
  const target = clamp(num(acc.post.targetPeak, DEFAULT_PEAK), 0.01, MAX_PEAK / acc.finalGain);
  // Pic cible ; si la recette fixe aussi un niveau efficace cible (targetRms, linéaire), le tampon n'est jamais plus fort que lui :
  // les variantes d'un son à transitoire aléatoire gardent ainsi le même niveau.
  let k = peak > 1e-9 ? (target * acc.finalGain) / peak : 0;
  if (isNum(acc.post.targetRms) && acc.post.targetRms > 0 && peak > 1e-9) {
    let e = 0;
    for (let i = 0; i < out.length; i += 1) e += out[i] * out[i];
    const rms = Math.sqrt(e / out.length);
    if (rms > 1e-9) k = Math.min(k, (acc.post.targetRms * acc.finalGain) / rms);
  }
  if (peak <= 1e-9) acc.warnings.push('son silencieux');
  const fadeIn = acc.loop ? 0 : Math.round(FADE_IN * acc.rate);
  const fadeOut = acc.loop ? 0 : Math.min(out.length, Math.round(clamp(num(acc.post.fadeOut, DEFAULT_FADE_OUT), 0, 1) * acc.rate));
  let sq = 0;
  let max = 0;
  for (let i = 0; i < out.length; i += 1) {
    let g = k;
    if (i < fadeIn) g *= i / fadeIn;
    if (fadeOut > 0 && i >= out.length - fadeOut) g *= (out.length - 1 - i) / fadeOut;
    out[i] *= g;
    sq += out[i] * out[i];
    max = Math.max(max, Math.abs(out[i]));
  }
  acc.result = { id: acc.id, variant: acc.variant, sampleRate: acc.rate, samples: out, peak: max, rms: Math.sqrt(sq / out.length), duration: out.length / acc.rate, warnings: acc.warnings };
  return acc.result;
}

// Rendu complet d'une variante.
export function renderSound(recipe, variantIndex = 0) {
  const acc = startRender(recipe, variantIndex);
  return finishRender(acc);
}

// Nombre de variantes d'une recette (au moins 1).
export const variantCount = (recipe) => (isObject(recipe) && isNum(recipe.variants) && recipe.variants >= 1 ? Math.floor(recipe.variants) : 1);

// Mémoire d'un tampon calculé (4 octets par échantillon).
export const soundBytes = (result) => (result?.samples?.length ?? 0) * 4;
