// Primitives de synthèse du lot 3h (atelier des sons) : fonctions pures sur des tableaux de nombres, sans Web Audio, sans horloge et
// sans hasard natif (générateur à graine). Chaque fonction renvoie un nouveau tableau (Float64Array) et ne modifie jamais ses
// arguments ; une entrée absurde (vide, NaN, null) donne un tableau vide ou neutre, jamais une exception.
// Briques : générateur à graine, bruits blanc / rose / brun, enveloppes (AD, ADSR, exponentielles), filtres du premier et du second
// ordre (biquads RBJ), source glottale de Rosenberg (jitter, shimmer, sous-harmonique, modulation d'amplitude), banc de formants à
// glissement, résonateurs modaux (bois, métal), saturation douce, réverbération courte de Schroeder (20 à 120 ms), changement de
// durée et de hauteur, mixage de couches, normalisation, retrait du décalage continu, fondus aux deux bouts.
import { isNum } from './vec.js';

const TAU = Math.PI * 2;
export const clamp = (n, lo, hi) => Math.min(Math.max(n, lo), hi);
export const num = (n, fallback = 0) => (isNum(n) ? n : fallback);
export const dbToGain = (db) => 10 ** (num(db) / 20);
const rateOf = (sr) => (isNum(sr) && sr >= 8000 && sr <= 96000 ? Math.round(sr) : 22050);
const lengthOf = (n) => (isNum(n) && n > 0 ? Math.min(Math.floor(n), 96000 * 30) : 0);

// Copie en Float64Array (valeurs non finies -> 0).
export function arr(buf) {
  if (buf === null || buf === undefined || typeof buf !== 'object' || !isNum(buf.length) || buf.length <= 0) return new Float64Array(0);
  const n = Math.min(Math.floor(buf.length), 96000 * 30);
  const out = new Float64Array(n);
  for (let i = 0; i < n; i += 1) out[i] = isNum(buf[i]) ? buf[i] : 0;
  return out;
}

// ---------- hasard à graine ----------

// Graine entière dérivée de plusieurs parties (nombres ou textes), stable d'une exécution à l'autre.
export function hashSeed(...parts) {
  let h = 0x811c9dc5;
  for (const p of parts) {
    const s = typeof p === 'string' ? p : String(isNum(p) ? p : 0);
    for (let i = 0; i < s.length; i += 1) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    h ^= 0x2f;
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

// Générateur mulberry32 (même suite que rng.js) ; l'état est local à l'objet renvoyé.
export function createRandom(seed = 1) {
  let s = (isNum(seed) ? Math.trunc(seed) : 1) >>> 0;
  let spare = null;
  const next = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    signed: () => next() * 2 - 1,
    range: (a, b) => num(a) + (num(b) - num(a)) * next(),
    // Loi normale (Box-Muller), écart type 1.
    gauss: () => {
      if (spare !== null) {
        const v = spare;
        spare = null;
        return v;
      }
      const u = Math.max(1e-12, next());
      const v = next();
      const r = Math.sqrt(-2 * Math.log(u));
      spare = r * Math.sin(TAU * v);
      return r * Math.cos(TAU * v);
    },
  };
}

// ---------- bruits ----------

// Bruit de n échantillons : 'white' (uniforme), 'pink' (−3 dB par octave, filtre de Kellet), 'brown' (−6 dB par octave au-dessus de
// ~70 Hz à 22 050 Hz). Écart type proche de 0,3 à 0,6 selon la couleur.
export function noise(n, color = 'white', seed = 1) {
  const len = lengthOf(n);
  const out = new Float64Array(len);
  const rnd = createRandom(seed);
  let b0 = 0;
  let b1 = 0;
  let b2 = 0;
  let b3 = 0;
  let b4 = 0;
  let b5 = 0;
  let b6 = 0;
  let brown = 0;
  for (let i = 0; i < len; i += 1) {
    const w = rnd.signed();
    if (color === 'pink') {
      b0 = 0.99886 * b0 + w * 0.0555179;
      b1 = 0.99332 * b1 + w * 0.0750759;
      b2 = 0.969 * b2 + w * 0.153852;
      b3 = 0.8665 * b3 + w * 0.3104856;
      b4 = 0.55 * b4 + w * 0.5329522;
      b5 = -0.7616 * b5 - w * 0.016898;
      out[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
      b6 = w * 0.115926;
    } else if (color === 'brown') {
      brown = (brown + 0.02 * w) / 1.02;
      out[i] = brown * 3.5;
    } else out[i] = w;
  }
  return out;
}

// ---------- enveloppes ----------

// Attaque (montée en cosinus surélevé) puis décroissance exponentielle de constante `decay` (s) ; n échantillons.
export function envAD(n, sampleRate, attack = 0.005, decay = 0.1) {
  const len = lengthOf(n);
  const sr = rateOf(sampleRate);
  const a = Math.max(0, num(attack)) * sr;
  const d = Math.max(1e-5, num(decay, 0.1)) * sr;
  const out = new Float64Array(len);
  for (let i = 0; i < len; i += 1) {
    if (i < a) out[i] = 0.5 - 0.5 * Math.cos((Math.PI * i) / a);
    else out[i] = Math.exp(-(i - a) / d);
  }
  return out;
}

// ADSR linéaire : { attack, decay, sustain (0 à 1), release } en secondes ; le relâchement finit au dernier échantillon.
export function envADSR(n, sampleRate, { attack = 0.01, decay = 0.1, sustain = 0.7, release = 0.1 } = {}) {
  const len = lengthOf(n);
  const sr = rateOf(sampleRate);
  const a = Math.max(0, num(attack)) * sr;
  const d = Math.max(0, num(decay)) * sr;
  const s = clamp(num(sustain, 0.7), 0, 1);
  const r = Math.min(len, Math.max(0, num(release)) * sr);
  const out = new Float64Array(len);
  for (let i = 0; i < len; i += 1) {
    let e;
    if (i < a) e = i / a;
    else if (i < a + d) e = 1 - ((1 - s) * (i - a)) / d;
    else e = s;
    if (r > 0 && i >= len - r) e *= (len - 1 - i) / r;
    out[i] = Math.max(0, e);
  }
  return out;
}

// Courbe par points [[u, valeur], …] (u de 0 à 1), interpolée linéairement, lue en u.
export function curveAt(points, u, fallback = 1) {
  if (!Array.isArray(points)) return fallback;
  const pts = points.filter((p) => Array.isArray(p) && isNum(p[0]) && isNum(p[1]));
  if (pts.length === 0) return fallback;
  if (u <= pts[0][0]) return pts[0][1];
  for (let k = 1; k < pts.length; k += 1) {
    if (u <= pts[k][0]) {
      const span = pts[k][0] - pts[k - 1][0];
      return span > 0 ? pts[k - 1][1] + ((pts[k][1] - pts[k - 1][1]) * (u - pts[k - 1][0])) / span : pts[k][1];
    }
  }
  return pts[pts.length - 1][1];
}

// Enveloppe par points (u de 0 à 1 sur n échantillons).
export function envCurve(n, points) {
  const len = lengthOf(n);
  const out = new Float64Array(len);
  for (let i = 0; i < len; i += 1) out[i] = Math.max(0, curveAt(points, len > 1 ? i / (len - 1) : 0, 0));
  return out;
}

export function multiply(a, b) {
  const x = arr(a);
  const y = arr(b);
  const out = new Float64Array(x.length);
  for (let i = 0; i < x.length; i += 1) out[i] = x[i] * (i < y.length ? y[i] : 0);
  return out;
}

export function scale(buf, k) {
  const x = arr(buf);
  const g = num(k);
  for (let i = 0; i < x.length; i += 1) x[i] *= g;
  return x;
}

// ---------- filtres ----------

// Coefficients RBJ d'un biquad : type lowpass | highpass | bandpass (gain de crête 0 dB) | peak | notch.
export function biquadCoefs(type, freq, q, gainDb, sampleRate) {
  const sr = rateOf(sampleRate);
  const w0 = (TAU * clamp(num(freq, 1000), 5, sr * 0.49)) / sr;
  const cos = Math.cos(w0);
  const alpha = Math.sin(w0) / (2 * Math.max(0.05, num(q, 0.707)));
  let b0;
  let b1;
  let b2;
  let a0 = 1 + alpha;
  const a1 = -2 * cos;
  let a2 = 1 - alpha;
  if (type === 'highpass') {
    b0 = (1 + cos) / 2;
    b1 = -(1 + cos);
    b2 = b0;
  } else if (type === 'bandpass') {
    b0 = alpha;
    b1 = 0;
    b2 = -alpha;
  } else if (type === 'notch') {
    b0 = 1;
    b1 = -2 * cos;
    b2 = 1;
  } else if (type === 'peak') {
    const A = 10 ** (num(gainDb) / 40);
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
  return { b0: b0 / a0, b1: b1 / a0, b2: b2 / a0, a1: a1 / a0, a2: a2 / a0 };
}

// Biquad fixe (second ordre) : { type, freq, q, gain }.
export function biquad(buf, { type = 'lowpass', freq = 1000, q = 0.707, gain = 0 } = {}, sampleRate = 22050) {
  const x = arr(buf);
  const c = biquadCoefs(type, freq, q, gain, sampleRate);
  const out = new Float64Array(x.length);
  let x1 = 0;
  let x2 = 0;
  let y1 = 0;
  let y2 = 0;
  for (let i = 0; i < x.length; i += 1) {
    const y = c.b0 * x[i] + c.b1 * x1 + c.b2 * x2 - c.a1 * y1 - c.a2 * y2;
    x2 = x1;
    x1 = x[i];
    y2 = y1;
    y1 = y;
    out[i] = y;
  }
  return out;
}

// Biquad à fréquence variable : freqAt(u) (u de 0 à 1) recalculée tous les 32 échantillons.
export function biquadSweep(buf, type, freqPoints, q, sampleRate) {
  const x = arr(buf);
  const out = new Float64Array(x.length);
  let c = null;
  let x1 = 0;
  let x2 = 0;
  let y1 = 0;
  let y2 = 0;
  for (let i = 0; i < x.length; i += 1) {
    if (i % 32 === 0) c = biquadCoefs(type, Array.isArray(freqPoints) ? curveAt(freqPoints, x.length > 1 ? i / (x.length - 1) : 0, 1000) : num(freqPoints, 1000), q, 0, sampleRate);
    const y = c.b0 * x[i] + c.b1 * x1 + c.b2 * x2 - c.a1 * y1 - c.a2 * y2;
    x2 = x1;
    x1 = x[i];
    y2 = y1;
    y1 = y;
    out[i] = y;
  }
  return out;
}

// Passe-bas du premier ordre (transformation bilinéaire : −3 dB exactement à freq, puis −6 dB par octave).
export function lowpass1(buf, freq, sampleRate) {
  const x = arr(buf);
  const sr = rateOf(sampleRate);
  const K = Math.tan((Math.PI * clamp(num(freq, 1000), 1, sr * 0.49)) / sr);
  const b0 = K / (1 + K);
  const a1 = (K - 1) / (K + 1);
  let x1 = 0;
  let y1 = 0;
  for (let i = 0; i < x.length; i += 1) {
    const y = b0 * (x[i] + x1) - a1 * y1;
    x1 = x[i];
    y1 = y;
    x[i] = y;
  }
  return x;
}

// Passe-haut du premier ordre (transformation bilinéaire : −3 dB exactement à freq).
export function highpass1(buf, freq, sampleRate) {
  const x = arr(buf);
  const sr = rateOf(sampleRate);
  const K = Math.tan((Math.PI * clamp(num(freq, 20), 1, sr * 0.49)) / sr);
  const b0 = 1 / (1 + K);
  const a1 = (K - 1) / (K + 1);
  let x1 = 0;
  let y1 = 0;
  for (let i = 0; i < x.length; i += 1) {
    const y = b0 * (x[i] - x1) - a1 * y1;
    x1 = x[i];
    y1 = y;
    x[i] = y;
  }
  return x;
}

// Passe-bas raide : deux biquads de Butterworth en cascade (−24 dB par octave) ; garde-fou contre l'aigu (pas, planches).
export function lowpassSteep(buf, freq, sampleRate) {
  return biquad(biquad(buf, { type: 'lowpass', freq, q: 0.541 }, sampleRate), { type: 'lowpass', freq, q: 1.307 }, sampleRate);
}

// ---------- résonateurs ----------

// Réponse impulsionnelle d'un banc de modes : somme de sinus amortis { f, gain, decay (constante de temps, s) } ; n échantillons.
export function modal(n, sampleRate, modes = []) {
  const len = lengthOf(n);
  const sr = rateOf(sampleRate);
  const out = new Float64Array(len);
  for (const m of Array.isArray(modes) ? modes : []) {
    if (!m || !isNum(m.f) || m.f <= 0 || m.f >= sr / 2) continue;
    const g = num(m.gain, 1);
    const k = Math.exp(-1 / (Math.max(1e-4, num(m.decay, 0.05)) * sr));
    const w = (TAU * m.f) / sr;
    const ph = num(m.phase);
    let a = g;
    for (let i = 0; i < len; i += 1) {
      out[i] += a * Math.sin(w * i + ph);
      a *= k;
      if (a < 1e-7 * Math.abs(g)) break;
    }
  }
  return out;
}

// Banc de résonateurs à deux pôles excité par `excitation` : chaque mode { f, gain, decay } sonne à sa fréquence avec sa constante de
// temps (le bois amortit vite, le métal tient). Gain normalisé : une impulsion unité donne une crête proche de `gain`.
export function resonate(excitation, sampleRate, modes = [], { pitch = 1, decayScale = 1 } = {}) {
  const x = arr(excitation);
  const sr = rateOf(sampleRate);
  const out = new Float64Array(x.length);
  for (const m of Array.isArray(modes) ? modes : []) {
    if (!m || !isNum(m.f) || m.f <= 0) continue;
    const f = m.f * num(pitch, 1);
    if (f >= sr * 0.48) continue;
    const r = Math.exp(-1 / (Math.max(1e-4, num(m.decay, 0.05) * num(decayScale, 1)) * sr));
    const w = (TAU * f) / sr;
    const c1 = 2 * r * Math.cos(w);
    const c2 = -r * r;
    const g = num(m.gain, 1) * Math.sin(w);
    let y1 = 0;
    let y2 = 0;
    for (let i = 0; i < x.length; i += 1) {
      const y = c1 * y1 + c2 * y2 + g * x[i];
      y2 = y1;
      y1 = y;
      out[i] += y;
    }
  }
  return out;
}

// ---------- source glottale et formants ----------

// Impulsion de Rosenberg sur une phase φ de 0 à 1 : ouverture (oq de la période), montée sur sq/(1+sq) de l'ouverture.
function rosenberg(phi, oq, sq) {
  const to = oq;
  const tp = (to * sq) / (1 + sq);
  if (phi < tp) return 0.5 - 0.5 * Math.cos((Math.PI * phi) / tp);
  if (phi < to) return Math.cos((Math.PI * (phi - tp)) / (2 * (to - tp)));
  return 0;
}

// Source glottale : train d'impulsions de Rosenberg dérivées (rayonnement des lèvres), hauteur f0 × contour(u), jitter (écart relatif
// de période d'un cycle à l'autre), shimmer (écart relatif d'amplitude), sous-harmonique (un cycle sur deux atténué de `sub` :
// composante à f0 / 2), dérive lente (wander), modulation d'amplitude rugueuse { rate, depth }. Renvoie { signal, flow } normalisés
// (crête 1). Avec jitter, shimmer, sub, wander et rough nuls, la fondamentale est exactement f0.
export function glottalSource(n, sampleRate, { f0 = 100, contour = null, jitter = 0, shimmer = 0, oq = 0.6, sq = 2.5, sub = 0, wander = 0, rough = null, seed = 1 } = {}) {
  const len = lengthOf(n);
  const sr = rateOf(sampleRate);
  const flow = new Float64Array(len);
  const rnd = createRandom(seed);
  const base = clamp(num(f0, 100), 20, sr / 8);
  const jit = clamp(num(jitter), 0, 0.3);
  const shim = clamp(num(shimmer), 0, 0.8);
  const subDepth = clamp(num(sub), 0, 1);
  const wand = clamp(num(wander), 0, 0.3);
  const open = clamp(num(oq, 0.6), 0.2, 0.95);
  const speed = clamp(num(sq, 2.5), 0.5, 6);
  const rr = rough && isNum(rough.rate) ? clamp(rough.rate, 1, 200) : 0;
  const rd = rough && isNum(rough.depth) ? clamp(rough.depth, 0, 1) : 0;
  let phi = 0;
  let cycle = 0;
  let periodMul = 1;
  let amp = 1;
  let drift = 0;
  let driftTarget = 0;
  let rPhase = 0;
  let rRate = rr;
  for (let i = 0; i < len; i += 1) {
    const u = len > 1 ? i / (len - 1) : 0;
    if (i % 256 === 0 && wand > 0) driftTarget = rnd.signed() * wand;
    drift += (driftTarget - drift) * 0.002;
    const f = base * curveAt(contour, u, 1) * (1 + drift) * periodMul;
    phi += f / sr;
    if (phi >= 1) {
      phi -= Math.floor(phi);
      cycle += 1;
      periodMul = jit > 0 ? clamp(1 + jit * rnd.gauss(), 0.5, 1.5) : 1;
      amp = shim > 0 ? clamp(1 + shim * rnd.gauss(), 0.1, 2) : 1;
      if (subDepth > 0 && cycle % 2 === 1) amp *= 1 - subDepth;
      if (rr > 0) rRate = rr * (1 + 0.15 * rnd.signed());
    }
    let g = rosenberg(phi, open, speed) * amp;
    if (rd > 0) {
      rPhase += rRate / sr;
      const m = 0.5 + 0.5 * Math.sin(TAU * rPhase);
      g *= 1 - rd + rd * m * m;
    }
    flow[i] = g;
  }
  const signal = new Float64Array(len);
  for (let i = 1; i < len; i += 1) signal[i] = flow[i] - 0.97 * flow[i - 1];
  return { signal: normalize(signal, 1), flow: normalize(flow, 1) };
}

// Voyelles (formants F1 à F4, Hz) : moyennes usuelles d'une voix d'homme adulte (Peterson et Barney, 1952 ; « eu » ≈ schwa).
export const VOWELS2 = Object.freeze({
  a: [730, 1090, 2440, 3400],
  o: [570, 840, 2410, 3300],
  u: [300, 870, 2240, 3200],
  eu: [500, 1500, 2500, 3500],
  ae: [660, 1720, 2410, 3400],
  i: [270, 2290, 3010, 3600],
  oe: [450, 1300, 2300, 3300],
  h: [600, 1400, 2500, 3500],
});
const BANDWIDTHS = [80, 100, 150, 220];
const FORMANT_GAINS = [1, 0.7, 0.35, 0.18];

// Banc de formants (modèle source-filtre) : par défaut une cascade de résonateurs de Klatt (gain unité aux basses fréquences : le
// fondamental de la voix passe, chaque formant fait une bosse), mode 'parallel' : passe-bande en parallèle pondérés par `gains` (bruits
// d'inspiration). Les fréquences glissent d'une voyelle à l'autre (vowels, points de passage répartis sur la durée), avec une dérive
// lente (drift, relative) ; scale : longueur du conduit (0,8 = grand corps, formants plus bas) ; bw : multiplicateur de largeur de bande.
export function formantBank(src, sampleRate, { vowels = ['a'], scale: fscale = 1, bw = 1, gains = FORMANT_GAINS, drift = 0, driftRate = 0.5, seed = 1, mode = 'cascade' } = {}) {
  const x = arr(src);
  const sr = rateOf(sampleRate);
  const list = (Array.isArray(vowels) && vowels.length > 0 ? vowels : ['a']).map((v) => (Array.isArray(v) ? v : (VOWELS2[v] ?? VOWELS2.a)));
  const k = clamp(num(fscale, 1), 0.4, 2);
  const bwk = clamp(num(bw, 1), 0.3, 4);
  const g = Array.isArray(gains) ? gains.map((v) => num(v)) : FORMANT_GAINS;
  const rnd = createRandom(seed);
  const phases = [0, 1, 2, 3].map(() => rnd.next() * TAU);
  const dr = clamp(num(drift), 0, 0.3);
  const rate = clamp(num(driftRate, 0.5), 0.05, 5);
  const parallel = mode === 'parallel';
  const states = [0, 1, 2, 3].map(() => ({ x1: 0, x2: 0, y1: 0, y2: 0, c: null }));
  const out = new Float64Array(x.length);
  for (let i = 0; i < x.length; i += 1) {
    if (i % 32 === 0) {
      const u = x.length > 1 ? i / (x.length - 1) : 0;
      const pos = u * (list.length - 1);
      const a = Math.min(list.length - 1, Math.floor(pos));
      const b = Math.min(list.length - 1, a + 1);
      const w0 = pos - a;
      const w = w0 * w0 * (3 - 2 * w0);
      for (let f = 0; f < 4; f += 1) {
        const fa = num(list[a][f], VOWELS2.a[f]);
        const fb = num(list[b][f], VOWELS2.a[f]);
        const wob = dr > 0 ? 1 + dr * Math.sin(TAU * rate * (i / sr) * (1 + 0.37 * f) + phases[f]) : 1;
        const freq = clamp((fa + (fb - fa) * w) * k * wob, 50, sr * 0.45);
        const band = BANDWIDTHS[f] * bwk;
        if (parallel) states[f].c = biquadCoefs('bandpass', freq, freq / band, 0, sr);
        else {
          const C = -Math.exp((-TAU * band) / sr);
          const B = 2 * Math.exp((-Math.PI * band) / sr) * Math.cos((TAU * freq) / sr);
          states[f].c = { A: 1 - B - C, B, C };
        }
      }
    }
    if (parallel) {
      let y = 0;
      for (let f = 0; f < 4; f += 1) {
        const s = states[f];
        const c = s.c;
        const v = c.b0 * x[i] + c.b1 * s.x1 + c.b2 * s.x2 - c.a1 * s.y1 - c.a2 * s.y2;
        s.x2 = s.x1;
        s.x1 = x[i];
        s.y2 = s.y1;
        s.y1 = v;
        y += num(g[f], 0) * v;
      }
      out[i] = y;
    } else {
      let y = x[i];
      for (let f = 0; f < 4; f += 1) {
        const s = states[f];
        const v = s.c.A * y + s.c.B * s.y1 + s.c.C * s.y2;
        s.y2 = s.y1;
        s.y1 = v;
        y = v;
      }
      out[i] = y;
    }
  }
  return out;
}

// ---------- traitements ----------

// Saturation douce (tangente hyperbolique normalisée : ±1 -> ±1), sortie bornée à ±1.
export function softClip(buf, drive = 1) {
  const x = arr(buf);
  const d = clamp(num(drive, 1), 0, 20);
  if (d <= 0) return x;
  const k = Math.tanh(d);
  for (let i = 0; i < x.length; i += 1) x[i] = clamp(Math.tanh(d * x[i]) / k, -1, 1);
  return x;
}

const COMB_MS = [4.3, 5.6, 6.9, 8.3];
const ALLPASS_MS = [1.7, 0.63];

// Réverbération courte de Schroeder (quatre peignes amortis en parallèle, deux passe-tout en série) : `time` = temps de
// décroissance de 60 dB (0,02 à 0,12 s conseillés, 0,3 s au plus), mix = part du son réverbéré, damping = amortissement des aigus.
// Même longueur que l'entrée (la queue est prévue dans la durée de la recette).
export function shortReverb(buf, sampleRate, { time = 0.06, mix = 0.2, damping = 0.4 } = {}) {
  const x = arr(buf);
  const sr = rateOf(sampleRate);
  const t60 = clamp(num(time, 0.06), 0.01, 0.3);
  const m = clamp(num(mix, 0.2), 0, 1);
  if (m <= 0 || x.length === 0) return x;
  const damp = clamp(num(damping, 0.4), 0, 0.95);
  const combs = COMB_MS.map((ms) => {
    const len = Math.max(2, Math.round((ms / 1000) * sr));
    return { buf: new Float64Array(len), idx: 0, filt: 0, fb: 10 ** ((-3 * len) / sr / t60) };
  });
  const aps = ALLPASS_MS.map((ms) => ({ buf: new Float64Array(Math.max(2, Math.round((ms / 1000) * sr))), idx: 0 }));
  const out = new Float64Array(x.length);
  for (let i = 0; i < x.length; i += 1) {
    let wet = 0;
    for (const c of combs) {
      const o = c.buf[c.idx];
      c.filt = o * (1 - damp) + c.filt * damp;
      c.buf[c.idx] = x[i] + c.filt * c.fb;
      c.idx = (c.idx + 1) % c.buf.length;
      wet += o;
    }
    wet *= 0.25;
    for (const a of aps) {
      const o = a.buf[a.idx];
      const y = -0.5 * wet + o;
      a.buf[a.idx] = wet + 0.5 * y;
      a.idx = (a.idx + 1) % a.buf.length;
      wet = y;
    }
    out[i] = x[i] * (1 - 0.5 * m) + m * wet;
  }
  return out;
}

// Rééchantillonnage linéaire : longueur × factor (factor > 1 : plus long et plus grave à la lecture).
export function stretch(buf, factor) {
  const x = arr(buf);
  const f = clamp(num(factor, 1), 0.1, 10);
  const n = Math.max(0, Math.round(x.length * f));
  const out = new Float64Array(n);
  for (let i = 0; i < n; i += 1) {
    const p = i / f;
    const a = Math.floor(p);
    const t = p - a;
    out[i] = a + 1 < x.length ? x[a] * (1 - t) + x[a + 1] * t : (a < x.length ? x[a] : 0);
  }
  return out;
}

// Changement de hauteur par rééchantillonnage, longueur conservée (n échantillons) : ratio > 1 = plus aigu.
export function pitchShift(buf, ratio) {
  const x = arr(buf);
  const r = clamp(num(ratio, 1), 0.1, 10);
  const out = new Float64Array(x.length);
  for (let i = 0; i < x.length; i += 1) {
    const p = i * r;
    const a = Math.floor(p);
    const t = p - a;
    out[i] = a + 1 < x.length ? x[a] * (1 - t) + x[a + 1] * t : 0;
  }
  return out;
}

// Mixage : n échantillons, couches { buf, gain, offset (échantillons) }.
export function mixLayers(n, layers = []) {
  const len = lengthOf(n);
  const out = new Float64Array(len);
  for (const l of Array.isArray(layers) ? layers : []) {
    if (!l || !l.buf) continue;
    const x = l.buf;
    const g = num(l.gain, 1);
    const off = Math.round(num(l.offset));
    for (let i = Math.max(0, -off); i < x.length; i += 1) {
      const j = i + off;
      if (j >= len) break;
      const v = x[i];
      if (isNum(v)) out[j] += g * v;
    }
  }
  return out;
}

export function normalize(buf, target = 0.7) {
  const x = arr(buf);
  let p = 0;
  for (let i = 0; i < x.length; i += 1) p = Math.max(p, Math.abs(x[i]));
  if (p <= 1e-12) return x;
  const k = clamp(num(target, 0.7), 0, 1) / p;
  for (let i = 0; i < x.length; i += 1) x[i] *= k;
  return x;
}

// Retrait du décalage continu : passe-haut du premier ordre à `freq` (20 Hz) puis soustraction de la moyenne résiduelle.
export function removeDc(buf, sampleRate, freq = 20) {
  const x = highpass1(buf, freq, sampleRate);
  if (x.length === 0) return x;
  let s = 0;
  for (let i = 0; i < x.length; i += 1) s += x[i];
  const m = s / x.length;
  for (let i = 0; i < x.length; i += 1) x[i] -= m;
  return x;
}

// Fondus en cosinus surélevé aux deux bouts : le premier et le dernier échantillon valent exactement 0.
export function fadeEdges(buf, sampleRate, fadeIn = 0.001, fadeOut = 0.01) {
  const x = arr(buf);
  const sr = rateOf(sampleRate);
  const n = x.length;
  if (n === 0) return x;
  const a = Math.min(n, Math.max(1, Math.round(clamp(num(fadeIn, 0.001), 0, 1) * sr)));
  const b = Math.min(n, Math.max(1, Math.round(clamp(num(fadeOut, 0.01), 0, 2) * sr)));
  for (let i = 0; i < a; i += 1) x[i] *= 0.5 - 0.5 * Math.cos((Math.PI * i) / a);
  for (let i = 0; i < b; i += 1) x[n - 1 - i] *= 0.5 - 0.5 * Math.cos((Math.PI * i) / b);
  x[0] = 0;
  x[n - 1] = 0;
  return x;
}

// Bouclage : n échantillons, la queue (au-delà de n) enchaînée en fondu à puissance constante sur le début ; overlap en échantillons.
export function loopCrossfade(buf, n, overlap) {
  const x = arr(buf);
  const len = Math.min(lengthOf(n), x.length);
  const m = Math.min(Math.max(0, Math.floor(num(overlap))), len, x.length - len);
  const out = x.slice(0, len);
  for (let i = 0; i < m; i += 1) {
    const w = (i + 0.5) / m;
    out[i] = x[len + i] * Math.cos((w * Math.PI) / 2) + out[i] * Math.sin((w * Math.PI) / 2);
  }
  return out;
}

// Copie Float32 bornée à ±limit, sans NaN.
export function toFloat32(buf, limit = 0.98) {
  const x = arr(buf);
  const out = new Float32Array(x.length);
  const l = clamp(num(limit, 0.98), 0, 1);
  for (let i = 0; i < x.length; i += 1) out[i] = clamp(x[i], -l, l);
  return out;
}
