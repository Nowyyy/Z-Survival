// Analyse de sons (lot 3h) : mesures chiffrées d'un tampon mono, sans dépendance, sans Web Audio, sans horloge ni hasard.
// Toutes les fonctions acceptent un Float32Array, un Float64Array ou un tableau de nombres (gelé ou non) ; une valeur non finie compte
// comme 0 ; une entrée absente ou vide donne des mesures nulles, jamais d'exception. Les arguments ne sont jamais modifiés.
//
// Conventions : spectre de puissance moyen (fenêtres de Hann de 2048 échantillons, recouvrement de moitié) ; centroïde et rolloff
// pondérés par l'amplitude (racine de la puissance moyenne, comme librosa ; un bruit blanc donne le quart de la fréquence
// d'échantillonnage) ; parts d'énergie (bandEnergyRatio) pondérées par la puissance ; fondamentale par une méthode de type YIN (différence
// cumulée normalisée, seuil absolu, interpolation parabolique) ; harmonique-bruit par l'autocorrélation normalisée (Boersma) :
// HNR = 10·log10(r / (1 − r)) ; niveau « court » = RMS de la fenêtre de 100 ms la plus forte (comparaisons de niveau entre sons de
// durées différentes).
import { isNum } from './vec.js';

const TAU = Math.PI * 2;
export const SILENCE_DB = -200;
export const DEFAULT_RATE = 22050;
const MAX_FFT = 65536;
const clamp = (n, lo, hi) => Math.min(Math.max(n, lo), hi);
const rateOf = (sr) => (isNum(sr) && sr >= 1000 && sr <= 384000 ? sr : DEFAULT_RATE);

// Copie propre (Float64Array) : NaN, Infinity et non-nombres deviennent 0.
export function toSamples(buf) {
  if (buf === null || buf === undefined || typeof buf !== 'object' || !isNum(buf.length) || buf.length <= 0) return new Float64Array(0);
  const n = Math.min(Math.floor(buf.length), 1 << 24);
  const out = new Float64Array(n);
  for (let i = 0; i < n; i += 1) {
    const v = buf[i];
    out[i] = isNum(v) ? v : 0;
  }
  return out;
}

export function rms(buf) {
  const x = toSamples(buf);
  if (x.length === 0) return 0;
  let e = 0;
  for (let i = 0; i < x.length; i += 1) e += x[i] * x[i];
  return Math.sqrt(e / x.length);
}

export function peak(buf) {
  const x = toSamples(buf);
  let p = 0;
  for (let i = 0; i < x.length; i += 1) p = Math.max(p, Math.abs(x[i]));
  return p;
}

// Décibels pleine échelle d'une amplitude linéaire ; 0, négatif ou invalide : SILENCE_DB.
export function dbfs(x) {
  if (!isNum(x)) return SILENCE_DB;
  const a = Math.abs(x);
  if (a <= 1e-10) return SILENCE_DB;
  return 20 * Math.log10(a);
}

export function dcOffset(buf) {
  const x = toSamples(buf);
  if (x.length === 0) return 0;
  let s = 0;
  for (let i = 0; i < x.length; i += 1) s += x[i];
  return s / x.length;
}

export function crestFactor(buf) {
  const r = rms(buf);
  return r > 1e-12 ? peak(buf) / r : 0;
}

// RMS de la fenêtre (windowSec) la plus forte, pas de 10 ms.
export function shortLevel(buf, sampleRate, windowSec = 0.1) {
  const x = toSamples(buf);
  if (x.length === 0) return 0;
  const sr = rateOf(sampleRate);
  const w = Math.max(1, Math.min(x.length, Math.round(clamp(isNum(windowSec) ? windowSec : 0.1, 0.001, 10) * sr)));
  const hop = Math.max(1, Math.round(0.01 * sr));
  const sq = new Float64Array(x.length + 1);
  for (let i = 0; i < x.length; i += 1) sq[i + 1] = sq[i] + x[i] * x[i];
  let best = 0;
  for (let a = 0; a + w <= x.length; a += hop) best = Math.max(best, sq[a + w] - sq[a]);
  best = Math.max(best, sq[x.length] - sq[x.length - w]);
  return Math.sqrt(best / w);
}

const isPow2 = (n) => isNum(n) && n >= 2 && n <= MAX_FFT && Math.floor(n) === n && (n & (n - 1)) === 0;
// Taille valide : puissance de deux entre 2 et 65 536 ; sinon la puissance de deux supérieure (bornée) ; non-nombre : 2048.
export function fftSize(size) {
  if (isPow2(size)) return size;
  if (!isNum(size) || size <= 0) return 2048;
  let n = 2;
  while (n < size && n < MAX_FFT) n *= 2;
  return n;
}

// Transformée de Fourier rapide (itérative, en place sur des copies) d'une fenêtre de `size` échantillons à partir de `start`
// (remplissage par des zéros), fenêtrée par Hann sauf { window: 'none' }. Renvoie { re, im, size }.
export function fft(buf, size = 2048, { start = 0, window = 'hann' } = {}) {
  const x = toSamples(buf);
  const n = fftSize(size);
  const from = isNum(start) && start > 0 ? Math.floor(start) : 0;
  const re = new Float64Array(n);
  const im = new Float64Array(n);
  const hann = window !== 'none';
  for (let i = 0; i < n; i += 1) {
    const s = from + i < x.length ? x[from + i] : 0;
    re[i] = hann ? s * (0.5 - 0.5 * Math.cos((TAU * i) / n)) : s;
  }
  for (let i = 1, j = 0; i < n; i += 1) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      const t = re[i];
      re[i] = re[j];
      re[j] = t;
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = -TAU / len;
    const wr = Math.cos(ang);
    const wi = Math.sin(ang);
    const half = len >> 1;
    for (let i = 0; i < n; i += len) {
      let cr = 1;
      let ci = 0;
      for (let k = 0; k < half; k += 1) {
        const a = i + k;
        const b = a + half;
        const tr = re[b] * cr - im[b] * ci;
        const ti = re[b] * ci + im[b] * cr;
        re[b] = re[a] - tr;
        im[b] = im[a] - ti;
        re[a] += tr;
        im[a] += ti;
        const c2 = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = c2;
      }
    }
  }
  return { re, im, size: n };
}

// Spectre de puissance moyen : { power (size/2 + 1 cases), binHz, size, frames }.
export function spectrum(buf, sampleRate, { size = 2048 } = {}) {
  const x = toSamples(buf);
  const sr = rateOf(sampleRate);
  const n = fftSize(size);
  const power = new Float64Array(n / 2 + 1);
  if (x.length === 0) return { power, binHz: sr / n, size: n, frames: 0 };
  const hop = n / 2;
  let frames = 0;
  for (let start = 0; start === 0 || start + hop < x.length; start += hop) {
    const { re, im } = fft(x, n, { start });
    for (let k = 0; k <= n / 2; k += 1) power[k] += re[k] * re[k] + im[k] * im[k];
    frames += 1;
    if (frames >= 4096) break;
  }
  for (let k = 0; k <= n / 2; k += 1) power[k] /= frames;
  return { power, binHz: sr / n, size: n, frames };
}

const totalPower = (power, from = 1) => {
  let s = 0;
  for (let k = from; k < power.length; k += 1) s += power[k];
  return s;
};

// Centroïde spectral (Hz) : moyenne des fréquences pondérée par l'amplitude du spectre moyen.
export function spectralCentroid(buf, sampleRate) {
  const { power, binHz } = spectrum(buf, sampleRate);
  return centroidOf(power, binHz);
}
// Amplitudes du spectre moyen ; les cases à plus de 60 dB sous la plus forte sont ignorées (lobes secondaires de la fenêtre, bruit de
// quantification), sinon le centroïde d'un sinus grave serait tiré vers l'aigu.
function amplitudes(power) {
  let max = 0;
  for (let k = 1; k < power.length; k += 1) max = Math.max(max, power[k]);
  const floor = max * 1e-6;
  const out = new Float64Array(power.length);
  for (let k = 1; k < power.length; k += 1) out[k] = power[k] >= floor ? Math.sqrt(power[k]) : 0;
  return out;
}
function centroidOf(power, binHz) {
  const amp = amplitudes(power);
  let num = 0;
  let den = 0;
  for (let k = 1; k < amp.length; k += 1) {
    const a = amp[k];
    num += a * k * binHz;
    den += a;
  }
  return den > 1e-12 ? num / den : 0;
}

// Fréquence sous laquelle se trouve la part `ratio` de l'amplitude spectrale (rolloff, comme librosa).
export function rolloff(buf, sampleRate, ratio = 0.85) {
  const { power, binHz } = spectrum(buf, sampleRate);
  return rolloffOf(power, binHz, ratio);
}
function rolloffOf(power, binHz, ratio) {
  const amp = amplitudes(power);
  let total = 0;
  for (let k = 1; k < amp.length; k += 1) total += amp[k];
  if (total <= 1e-12) return 0;
  const goal = clamp(isNum(ratio) ? ratio : 0.85, 0, 1) * total;
  let acc = 0;
  for (let k = 1; k < amp.length; k += 1) {
    acc += amp[k];
    if (acc >= goal) return k * binHz;
  }
  return (power.length - 1) * binHz;
}

// Part de la puissance dans [lowHz, highHz) (0 à 1). Les bandes complémentaires somment à 1.
export function bandEnergyRatio(buf, sampleRate, lowHz = 0, highHz = Infinity) {
  const { power, binHz } = spectrum(buf, sampleRate);
  return bandShare(power, binHz, lowHz, highHz);
}
function bandShare(power, binHz, lowHz, highHz) {
  const total = totalPower(power);
  if (total <= 1e-20) return 0;
  const lo = lowHz === Infinity ? Infinity : (isNum(lowHz) ? lowHz : 0);
  const hi = isNum(highHz) || highHz === Infinity ? highHz : Infinity;
  let s = 0;
  for (let k = 1; k < power.length; k += 1) {
    const f = k * binHz;
    if (f >= lo && f < hi) s += power[k];
  }
  return s / total;
}

// Fréquence du maximum du spectre moyen entre lowHz et highHz (pic spectral, interpolé), 0 si silence.
export function spectralPeak(buf, sampleRate, lowHz = 20, highHz = Infinity) {
  const { power, binHz } = spectrum(buf, sampleRate, { size: 4096 });
  let best = -1;
  let at = 0;
  for (let k = 1; k < power.length - 1; k += 1) {
    const f = k * binHz;
    if (f < (isNum(lowHz) ? lowHz : 0) || f >= (isNum(highHz) ? highHz : Infinity)) continue;
    if (power[k] > best) {
      best = power[k];
      at = k;
    }
  }
  if (best <= 1e-20 || at === 0) return 0;
  const a = power[at - 1];
  const b = power[at];
  const c = power[at + 1];
  const den = a - 2 * b + c;
  const shift = Math.abs(den) > 1e-30 ? clamp((0.5 * (a - c)) / den, -0.5, 0.5) : 0;
  return (at + shift) * binHz;
}

// Trames d'analyse de hauteur : débuts des trames assez fortes (au moins 10 % du RMS de la trame la plus forte), 32 au plus.
function pitchFrames(x, frame, maxFrames = 32) {
  const starts = [];
  if (x.length < frame) return starts;
  const hop = Math.max(1, Math.floor((x.length - frame) / Math.max(1, maxFrames * 2)));
  const all = [];
  for (let a = 0; a + frame <= x.length; a += hop) {
    let e = 0;
    for (let i = a; i < a + frame; i += 1) e += x[i] * x[i];
    all.push({ a, e });
  }
  const max = all.reduce((m, f) => Math.max(m, f.e), 0);
  if (max <= 1e-18) return starts;
  const loud = all.filter((f) => f.e >= max * 0.01);
  const step = Math.max(1, Math.floor(loud.length / maxFrames));
  for (let k = 0; k < loud.length && starts.length < maxFrames; k += step) starts.push(loud[k].a);
  return starts;
}

const median = (list) => {
  if (list.length === 0) return 0;
  const s = [...list].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

// Hauteur d'une trame par différence cumulée normalisée (YIN). Renvoie { f0, aperiodicity } ou null.
function yinFrame(x, a, w, minLag, maxLag, sr, threshold) {
  const d = new Float64Array(maxLag + 2);
  for (let tau = 1; tau <= maxLag + 1; tau += 1) {
    let s = 0;
    for (let i = a; i < a + w; i += 1) {
      const diff = x[i] - x[i + tau];
      s += diff * diff;
    }
    d[tau] = s;
  }
  const cmnd = new Float64Array(maxLag + 2);
  cmnd[0] = 1;
  let run = 0;
  for (let tau = 1; tau <= maxLag + 1; tau += 1) {
    run += d[tau];
    cmnd[tau] = run > 0 ? (d[tau] * tau) / run : 1;
  }
  let tau = -1;
  for (let t = minLag; t <= maxLag; t += 1) {
    if (cmnd[t] < threshold) {
      while (t + 1 <= maxLag && cmnd[t + 1] < cmnd[t]) t += 1;
      tau = t;
      break;
    }
  }
  if (tau < 0) {
    let best = Infinity;
    for (let t = minLag; t <= maxLag; t += 1) {
      if (cmnd[t] < best) {
        best = cmnd[t];
        tau = t;
      }
    }
  }
  if (tau < 1) return null;
  // Contrôle d'octave : si la trame se répète nettement mieux au double de la période trouvée (creux plus profond d'au moins 0,1),
  // la période trouvée était une demi-période (harmonique 2 dominant) : on garde le double.
  for (let guard = 0; guard < 2; guard += 1) {
    const c = tau * 2;
    if (c + 2 > maxLag) break;
    let best = c;
    for (let t = c - 2; t <= c + 2; t += 1) if (cmnd[t] < cmnd[best]) best = t;
    if (cmnd[best] < cmnd[tau] - 0.1) tau = best;
    else break;
  }
  const y0 = cmnd[tau - 1];
  const y1 = cmnd[tau];
  const y2 = cmnd[tau + 1];
  const den = y0 - 2 * y1 + y2;
  const shift = Math.abs(den) > 1e-12 ? clamp((0.5 * (y0 - y2)) / den, -0.5, 0.5) : 0;
  return { f0: sr / (tau + shift), aperiodicity: y1 };
}

// Fondamentale (Hz) : médiane des trames voisées (apériodicité < 0,45), méthode de type YIN ; 0 si aucune trame voisée.
export function estimateF0(buf, sampleRate, minHz = 50, maxHz = 400) {
  return pitchTrack(buf, sampleRate, minHz, maxHz).f0;
}

// Détail de l'estimation : { f0, voiced (part des trames voisées), frames, values }.
export function pitchTrack(buf, sampleRate, minHz = 50, maxHz = 400) {
  const x = toSamples(buf);
  const sr = rateOf(sampleRate);
  const lo = clamp(isNum(minHz) ? minHz : 50, 20, sr / 4);
  const hi = clamp(isNum(maxHz) ? maxHz : 400, lo * 1.01, sr / 4);
  const minLag = Math.max(2, Math.floor(sr / hi));
  const maxLag = Math.max(minLag + 1, Math.ceil(sr / lo));
  const w = maxLag;
  const starts = pitchFrames(x, w + maxLag + 2);
  const values = [];
  for (const a of starts) {
    const r = yinFrame(x, a, w, minLag, maxLag, sr, 0.2);
    if (r && r.aperiodicity < 0.45 && r.f0 >= lo * 0.97 && r.f0 <= hi * 1.03) values.push(r.f0);
  }
  return { f0: median(values), voiced: starts.length > 0 ? values.length / starts.length : 0, frames: starts.length, values };
}

// Rapport harmonique-bruit (dB) : médiane, sur les trames fortes, de 10·log10(r / (1 − r)), r = maximum de l'autocorrélation
// normalisée entre les périodes de maxHz et de minHz. Borné à [−20, 40] dB ; 0 pour un silence.
export function harmonicToNoise(buf, sampleRate, minHz = 50, maxHz = 400) {
  const x = toSamples(buf);
  const sr = rateOf(sampleRate);
  const lo = clamp(isNum(minHz) ? minHz : 50, 20, sr / 4);
  const hi = clamp(isNum(maxHz) ? maxHz : 400, lo * 1.01, sr / 4);
  const minLag = Math.max(2, Math.floor(sr / hi));
  const maxLag = Math.max(minLag + 1, Math.ceil(sr / lo));
  const w = Math.round(maxLag * 1.5);
  const starts = pitchFrames(x, w + maxLag + 1, 24);
  const values = [];
  for (const a of starts) {
    let e0 = 0;
    for (let i = a; i < a + w; i += 1) e0 += x[i] * x[i];
    if (e0 <= 1e-18) continue;
    let best = 0;
    for (let tau = minLag; tau <= maxLag; tau += 1) {
      let c = 0;
      let e1 = 0;
      for (let i = a; i < a + w; i += 1) {
        c += x[i] * x[i + tau];
        e1 += x[i + tau] * x[i + tau];
      }
      const r = e1 > 1e-18 ? c / Math.sqrt(e0 * e1) : 0;
      if (r > best) best = r;
    }
    const r = clamp(best, 1e-4, 0.9999);
    values.push(clamp(10 * Math.log10(r / (1 - r)), -20, 40));
  }
  return values.length > 0 ? median(values) : 0;
}

// Passages par zéro : part des paires d'échantillons consécutifs de signes opposés (un sinus de f Hz donne 2f / sr).
export function zeroCrossingRate(buf) {
  const x = toSamples(buf);
  if (x.length < 2) return 0;
  let c = 0;
  for (let i = 1; i < x.length; i += 1) if ((x[i - 1] < 0 && x[i] >= 0) || (x[i - 1] >= 0 && x[i] < 0)) c += 1;
  return c / (x.length - 1);
}

// Discontinuités aux bouts : premier et dernier échantillon, plus grand saut sur les 4 premiers et les 4 derniers échantillons.
// click : un bout dépasse `threshold` (0,002 par défaut) : coupure brutale probable.
export function edgeClicks(buf, threshold = 0.002) {
  const x = toSamples(buf);
  const thr = isNum(threshold) && threshold > 0 ? threshold : 0.002;
  if (x.length === 0) return { first: 0, last: 0, jumpStart: 0, jumpEnd: 0, click: false };
  const first = Math.abs(x[0]);
  const last = Math.abs(x[x.length - 1]);
  let jumpStart = first;
  let jumpEnd = last;
  for (let i = 1; i < Math.min(5, x.length); i += 1) jumpStart = Math.max(jumpStart, Math.abs(x[i] - x[i - 1]));
  for (let i = Math.max(1, x.length - 4); i < x.length; i += 1) jumpEnd = Math.max(jumpEnd, Math.abs(x[i] - x[i - 1]));
  return { first, last, jumpStart, jumpEnd, click: first > thr || last > thr };
}

// Jonction d'une boucle (fin -> début) : saut entre le dernier et le premier échantillon, et rapport des RMS des 50 ms de chaque côté.
export function loopSeam(buf, sampleRate, windowSec = 0.05) {
  const x = toSamples(buf);
  if (x.length < 4) return { jump: 0, energyRatio: 1 };
  const sr = rateOf(sampleRate);
  const w = Math.max(1, Math.min(Math.floor(x.length / 2), Math.round((isNum(windowSec) ? windowSec : 0.05) * sr)));
  const head = rms(x.subarray(0, w));
  const tail = rms(x.subarray(x.length - w));
  const slope = Math.abs(x[x.length - 1] - x[x.length - 2]);
  return { jump: Math.abs(x[x.length - 1] - x[0]), slope, energyRatio: head > 1e-12 ? tail / head : (tail > 1e-12 ? Infinity : 1) };
}

// Bandes logarithmiques (40 Hz -> Nyquist, 32 bandes) du spectre moyen, normalisées à une somme de 1.
export function bandProfile(buf, sampleRate, bands = 32) {
  const sr = rateOf(sampleRate);
  const nb = clamp(isNum(bands) ? Math.floor(bands) : 32, 4, 128);
  const { power, binHz } = spectrum(buf, sr);
  const lo = 40;
  const hi = sr / 2;
  const out = new Float64Array(nb);
  for (let k = 1; k < power.length; k += 1) {
    const f = k * binHz;
    if (f < lo) continue;
    const b = Math.min(nb - 1, Math.floor((Math.log(f / lo) / Math.log(hi / lo)) * nb));
    out[b] += power[k];
  }
  const total = out.reduce((s, v) => s + v, 0);
  if (total > 1e-20) for (let b = 0; b < nb; b += 1) out[b] /= total;
  return out;
}

// Distance entre spectres moyens (0 : identiques ; 1 : enveloppes opposées) : profils en 24 bandes logarithmiques (40 Hz -> Nyquist,
// environ un tiers d'octave), convertis en dB sous la bande la plus forte et bornés à −60 dB, puis écart absolu moyen divisé par 60.
// Compare la couleur (enveloppe spectrale) de deux sons, sans être dominée par la seule bande la plus forte.
export const DISTANCE_FLOOR_DB = 60;
export function spectralDistance(a, b, sampleRate = DEFAULT_RATE) {
  const pa = bandProfile(a, sampleRate, 24);
  const pb = bandProfile(b, sampleRate, 24);
  const ea = pa.reduce((s, v) => s + v, 0);
  const eb = pb.reduce((s, v) => s + v, 0);
  if (ea === 0 && eb === 0) return 0;
  if (ea === 0 || eb === 0) return 1;
  const toDb = (p) => {
    const max = p.reduce((m, v) => Math.max(m, v), 0);
    return Array.from(p, (v) => Math.max(-DISTANCE_FLOOR_DB, 10 * Math.log10(Math.max(v, 1e-30) / max)));
  };
  const da = toDb(pa);
  const db = toDb(pb);
  let d = 0;
  for (let i = 0; i < da.length; i += 1) d += Math.abs(da[i] - db[i]);
  return d / da.length / DISTANCE_FLOOR_DB;
}

// Durée « active » : du premier au dernier échantillon au-dessus de −40 dB sous la crête (enveloppe de 5 ms).
export function activeDuration(buf, sampleRate, floorDb = -40) {
  const x = toSamples(buf);
  if (x.length === 0) return 0;
  const sr = rateOf(sampleRate);
  const p = peak(x);
  if (p <= 1e-10) return 0;
  const thr = p * 10 ** ((isNum(floorDb) ? floorDb : -40) / 20);
  const w = Math.max(1, Math.round(0.005 * sr));
  let first = -1;
  let last = -1;
  for (let a = 0; a < x.length; a += w) {
    let m = 0;
    for (let i = a; i < Math.min(x.length, a + w); i += 1) m = Math.max(m, Math.abs(x[i]));
    if (m >= thr) {
      if (first < 0) first = a;
      last = Math.min(x.length, a + w);
    }
  }
  return first < 0 ? 0 : (last - first) / sr;
}

// Temps d'attaque (s) : de 10 % à 90 % du maximum de l'enveloppe (maximum sur 1 ms), premiers passages (convention des tests de
// sons du lot 1d : « attaque à 90 % du pic »).
export function attackTime(buf, sampleRate) {
  const x = toSamples(buf);
  if (x.length === 0) return 0;
  const sr = rateOf(sampleRate);
  const w = Math.max(1, Math.round(0.001 * sr));
  const env = [];
  for (let a = 0; a < x.length; a += w) {
    let m = 0;
    for (let i = a; i < Math.min(x.length, a + w); i += 1) m = Math.max(m, Math.abs(x[i]));
    env.push(m);
  }
  const top = env.reduce((m, v) => Math.max(m, v), 0);
  if (top <= 1e-10) return 0;
  let start = 0;
  while (start < env.length && env[start] < 0.1 * top) start += 1;
  let end = start;
  while (end < env.length && env[end] < 0.9 * top) end += 1;
  return ((end - start) * w) / sr;
}

// Part de l'énergie de la bande [lowHz, highHz) située dans les `windowSec` premières secondes après l'attaque (début : premier
// échantillon au-dessus de 10 % de la crête), et part de cette bande dans l'énergie de cette fenêtre. Pointe métallique d'un coup.
export function earlyBand(buf, sampleRate, lowHz = 2000, highHz = 5000, windowSec = 0.04) {
  const x = toSamples(buf);
  const sr = rateOf(sampleRate);
  if (x.length === 0) return { early: 0, share: 0 };
  const p = peak(x);
  let onset = 0;
  while (onset < x.length && Math.abs(x[onset]) < 0.1 * p) onset += 1;
  const w = Math.max(16, Math.round((isNum(windowSec) ? windowSec : 0.04) * sr));
  const head = x.subarray(Math.min(onset, x.length), Math.min(x.length, onset + w));
  const tail = x.subarray(Math.min(x.length, onset + w));
  const eBand = (seg) => {
    if (seg.length === 0) return { band: 0, total: 0 };
    const { power, binHz } = spectrum(seg, sr, { size: 1024 });
    let band = 0;
    let total = 0;
    for (let k = 1; k < power.length; k += 1) {
      total += power[k];
      const f = k * binHz;
      if (f >= lowHz && f < highHz) band += power[k];
    }
    // Énergie moyenne par trame × nombre d'échantillons : comparable entre segments de longueurs différentes.
    return { band: band * seg.length, total: total * seg.length };
  };
  const h = eBand(head);
  const t = eBand(tail);
  return { early: h.band + t.band > 0 ? h.band / (h.band + t.band) : 0, share: h.total > 0 ? h.band / h.total : 0 };
}

// Instants (s) des coups : maxima locaux de l'enveloppe (maximum sur 5 ms) au-dessus de `threshold` × maximum, séparés d'au moins
// `minGap` s (le plus fort l'emporte dans une même fenêtre).
export function onsets(buf, sampleRate, { threshold = 0.3, minGap = 0.08 } = {}) {
  const x = toSamples(buf);
  const sr = rateOf(sampleRate);
  if (x.length === 0) return [];
  const w = Math.max(1, Math.round(0.005 * sr));
  const env = [];
  for (let a = 0; a < x.length; a += w) {
    let m = 0;
    for (let i = a; i < Math.min(x.length, a + w); i += 1) m = Math.max(m, Math.abs(x[i]));
    env.push(m);
  }
  const top = env.reduce((m, v) => Math.max(m, v), 0);
  if (top <= 1e-10) return [];
  const thr = (isNum(threshold) ? clamp(threshold, 0.01, 1) : 0.3) * top;
  const gap = Math.max(1, Math.round(((isNum(minGap) ? Math.max(0, minGap) : 0.08) * sr) / w));
  const peaks = [];
  for (let k = 0; k < env.length; k += 1) {
    if (env[k] < thr) continue;
    if ((k > 0 && env[k - 1] > env[k]) || (k + 1 < env.length && env[k + 1] > env[k])) continue;
    const last = peaks[peaks.length - 1];
    if (last && k - last.k < gap) {
      if (env[k] > last.v) peaks[peaks.length - 1] = { k, v: env[k] };
    } else peaks.push({ k, v: env[k] });
  }
  return peaks.map((p) => (p.k * w) / sr);
}

// Toutes les mesures d'un son (nombres finis). bytes : poids du tampon au format du jeu (Float32, 4 octets par échantillon).
export function describe(buf, sampleRate, { minHz = 50, maxHz = 400 } = {}) {
  const x = toSamples(buf);
  const sr = rateOf(sampleRate);
  const pk = peak(x);
  const r = rms(x);
  const level = shortLevel(x, sr);
  const { power, binHz } = spectrum(x, sr);
  const track = pitchTrack(x, sr, minHz, maxHz);
  return {
    samples: x.length,
    sampleRate: sr,
    duration: x.length / sr,
    activeDuration: activeDuration(x, sr),
    bytes: x.length * 4,
    peak: pk,
    peakDb: dbfs(pk),
    rms: r,
    rmsDb: dbfs(r),
    level,
    levelDb: dbfs(level),
    dc: dcOffset(x),
    crest: r > 1e-12 ? pk / r : 0,
    centroid: centroidOf(power, binHz),
    rolloff85: rolloffOf(power, binHz, 0.85),
    hf4k: bandShare(power, binHz, 4000, Infinity),
    low200: bandShare(power, binHz, 0, 200),
    peakHz: spectralPeak(x, sr),
    f0: track.f0,
    voiced: track.voiced,
    hnr: harmonicToNoise(x, sr, minHz, maxHz),
    zcr: zeroCrossingRate(x),
    attack: attackTime(x, sr),
    edges: edgeClicks(x),
  };
}

// Lot 5a : partiels résonants (« cling » métallique). Spectres courts (fenêtre de Hann de `frame` échantillons, pas de `hop`) ; dans chaque trame, un pic
// étroit au-dessus de minHz est retenu s'il domine la médiane des cases voisines (± 12) d'au moins prominenceDb et reste à moins de floorDb du maximum
// de tout le son ; un pic suivi d'une trame à l'autre (à une case près) forme un partiel. Queue = durée pendant laquelle il est suivi, moins la
// longueur de la fenêtre (un éclat de bruit très bref ne donne pas de queue). Renvoie [{ freq (Hz), tailMs, levelDb (sous le maximum) }], les plus
// longues d'abord (au plus 8).
export function ringingPartials(buf, sampleRate, { minHz = 2000, frame = 512, hop = 64, prominenceDb = 10, floorDb = 40 } = {}) {
  const x = toSamples(buf);
  const sr = rateOf(sampleRate);
  const n = fftSize(frame);
  if (x.length < n) return [];
  const binHz = sr / n;
  const lo = Math.max(2, Math.ceil((isNum(minHz) ? minHz : 2000) / binHz));
  const hi = n / 2 - 13;
  const frames = [];
  let top = -Infinity;
  for (let start = 0; start + n <= x.length && frames.length < 4096; start += hop) {
    const { re, im } = fft(x, n, { start });
    const db = new Float64Array(n / 2 + 1);
    for (let k = 0; k <= n / 2; k += 1) {
      db[k] = 10 * Math.log10(re[k] * re[k] + im[k] * im[k] + 1e-30);
      if (k >= lo && db[k] > top) top = db[k];
    }
    frames.push(db);
  }
  const tracks = [];
  let open = new Map();
  frames.forEach((db, f) => {
    const next = new Map();
    for (let k = lo; k <= hi; k += 1) {
      if (db[k] < top - floorDb || db[k] < db[k - 1] || db[k] < db[k + 1]) continue;
      const around = [];
      for (let j = k - 12; j <= k + 12; j += 1) if (Math.abs(j - k) > 1) around.push(db[j]);
      around.sort((a, b) => a - b);
      if (db[k] - around[Math.floor(around.length / 2)] < prominenceDb) continue;
      const prev = open.get(k) ?? open.get(k - 1) ?? open.get(k + 1);
      const t = prev ?? { bins: [], first: f, last: f, best: -Infinity };
      if (prev) for (const j of [k - 1, k, k + 1]) open.delete(j);
      else tracks.push(t);
      t.bins.push(k);
      t.last = f;
      t.best = Math.max(t.best, db[k]);
      next.set(k, t);
    }
    open = next;
  });
  return tracks
    .map((t) => ({ freq: Math.round((t.bins.reduce((s, b) => s + b, 0) / t.bins.length) * binHz), tailMs: Math.max(0, ((t.last - t.first) * hop - n / 2) / sr) * 1000, levelDb: Math.round((t.best - top) * 10) / 10 }))
    .filter((t) => t.tailMs > 0)
    .sort((a, b) => b.tailMs - a.tailMs)
    .slice(0, 8)
    .map((t) => ({ ...t, tailMs: Math.round(t.tailMs * 10) / 10 }));
}
