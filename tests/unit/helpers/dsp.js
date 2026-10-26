// Outils de mesure pour les tests et le script planche-sons (jamais dans js/) : FFT, centre de gravité spectral, fondamentale par
// autocorrélation, corrélation, niveaux.

// FFT itérative (taille puissance de deux). Renvoie { re, im }.
export function fft(input) {
  const n = input.length;
  const re = Float64Array.from(input);
  const im = new Float64Array(n);
  for (let i = 1, j = 0; i < n; i += 1) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) [re[i], re[j]] = [re[j], re[i]];
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wr = Math.cos(ang);
    const wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1;
      let ci = 0;
      for (let k = 0; k < len / 2; k += 1) {
        const a = i + k;
        const b = a + len / 2;
        const tr = re[b] * cr - im[b] * ci;
        const ti = re[b] * ci + im[b] * cr;
        re[b] = re[a] - tr;
        im[b] = im[a] - ti;
        re[a] += tr;
        im[a] += ti;
        [cr, ci] = [cr * wr - ci * wi, cr * wi + ci * wr];
      }
    }
  }
  return { re, im };
}

// Spectre d'amplitude (moitié utile) d'une fenêtre de Hann de `size` échantillons (puissance de deux) à partir de `start`.
export function magnitudes(samples, start, size) {
  const win = new Float64Array(size);
  for (let i = 0; i < size; i += 1) {
    const s = start + i < samples.length ? samples[start + i] : 0;
    win[i] = s * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (size - 1)));
  }
  const { re, im } = fft(win);
  const out = new Float64Array(size / 2);
  for (let i = 0; i < out.length; i += 1) out[i] = Math.hypot(re[i], im[i]);
  return out;
}

// Centre de gravité spectral (Hz) de la fenêtre [start, start + size).
export function centroid(samples, rate, start = 0, size = 2048) {
  const mag = magnitudes(samples, start, size);
  let num = 0;
  let den = 0;
  for (let i = 1; i < mag.length; i += 1) {
    const p = mag[i] * mag[i];
    num += p * ((i * rate) / size);
    den += p;
  }
  return den > 0 ? num / den : 0;
}

// Fondamentale (Hz) par autocorrélation normalisée dans [lo, hi] Hz sur une fenêtre ; { f0, strength } (strength 0..1).
// Choisit le plus petit décalage dont la corrélation atteint 90 % du maximum (évite l'erreur d'octave).
export function pitch(samples, rate, start, size, lo = 60, hi = 240) {
  const minLag = Math.floor(rate / hi);
  const maxLag = Math.min(size - 1, Math.ceil(rate / lo));
  let energy = 0;
  for (let i = 0; i < size; i += 1) energy += (samples[start + i] ?? 0) ** 2;
  if (energy < 1e-9) return { f0: 0, strength: 0 };
  const ac = new Float64Array(maxLag + 1);
  let best = 0;
  for (let lag = minLag; lag <= maxLag; lag += 1) {
    let sum = 0;
    for (let i = 0; i + lag < size; i += 1) sum += (samples[start + i] ?? 0) * (samples[start + i + lag] ?? 0);
    ac[lag] = sum / energy;
    best = Math.max(best, ac[lag]);
  }
  for (let lag = minLag; lag <= maxLag; lag += 1) {
    if (ac[lag] >= 0.9 * best && ac[lag] >= ac[lag - 1] && ac[lag] >= (ac[lag + 1] ?? 0)) return { f0: rate / lag, strength: best };
  }
  return { f0: 0, strength: 0 };
}

// Médiane des fondamentales mesurées sur des fenêtres de 40 ms où la voix est assez forte.
export function medianPitch(samples, rate, lo = 60, hi = 240) {
  const size = 2 ** Math.round(Math.log2(rate * 0.04));
  const found = [];
  for (let start = 0; start + size <= samples.length; start += size >> 1) {
    const { f0, strength } = pitch(samples, rate, start, size, lo, hi);
    if (f0 > 0 && strength > 0.25) found.push(f0);
  }
  found.sort((a, b) => a - b);
  return { f0: found.length ? found[found.length >> 1] : 0, windows: found.length };
}

export const rmsOf = (samples, from = 0, to = samples.length) => {
  let sum = 0;
  for (let i = from; i < to; i += 1) sum += samples[i] * samples[i];
  return to > from ? Math.sqrt(sum / (to - from)) : 0;
};
export const toDb = (x) => 20 * Math.log10(Math.max(x, 1e-12));
export const peakOf = (samples) => samples.reduce((m, v) => Math.max(m, Math.abs(v)), 0);
export const mean = (samples) => samples.reduce((s, v) => s + v, 0) / Math.max(1, samples.length);

// Corrélation normalisée maximale (en valeur absolue) entre deux signaux pour des décalages de -maxLag à +maxLag échantillons.
export function maxCorrelation(a, b, maxLag = 64) {
  const n = Math.min(a.length, b.length);
  let ea = 0;
  let eb = 0;
  for (let i = 0; i < n; i += 1) {
    ea += a[i] * a[i];
    eb += b[i] * b[i];
  }
  const norm = Math.sqrt(ea * eb);
  if (norm === 0) return 0;
  let best = 0;
  for (let lag = -maxLag; lag <= maxLag; lag += 1) {
    let sum = 0;
    for (let i = Math.max(0, -lag); i < Math.min(n, n - lag); i += 1) sum += a[i] * b[i + lag];
    best = Math.max(best, Math.abs(sum) / norm);
  }
  return best;
}

// Temps d'attaque (s) : premier échantillon dont la valeur absolue atteint `fraction` (90 % par défaut) du pic.
// (Le pic absolu d'un son saturé tombe n'importe où dans une zone plate : le seuil à 90 % mesure l'attaque réelle.)
export function attackTime(samples, rate, fraction = 0.9) {
  const limit = peakOf(samples) * fraction;
  for (let i = 0; i < samples.length; i += 1) if (Math.abs(samples[i]) >= limit) return i / rate;
  return 0;
}
