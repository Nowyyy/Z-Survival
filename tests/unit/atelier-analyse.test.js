import { describe, it, expect } from 'vitest';
import * as A from '../../js/core/audio-analysis.js';

// Lot 3h-A : analyse de sons pure (js/core/audio-analysis.js). Signaux de test connus, entrées hostiles, déterminisme.
const SR = 22050;
const sine = (f, dur = 1, amp = 0.5, sr = SR) => Float32Array.from({ length: Math.round(sr * dur) }, (_, i) => amp * Math.sin((2 * Math.PI * f * i) / sr));
// Bruit blanc déterministe (générateur congruentiel local : jamais Math.random).
const white = (n, seed = 12345, amp = 1) => {
  let s = seed >>> 0;
  return Float32Array.from({ length: n }, () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return amp * ((s / 4294967296) * 2 - 1);
  });
};
const harmonic = (f0, dur = 1, n = 8, sr = SR) => Float32Array.from({ length: Math.round(sr * dur) }, (_, i) => {
  let v = 0;
  for (let h = 1; h <= n; h += 1) v += Math.sin((2 * Math.PI * f0 * h * i) / sr) / h;
  return 0.2 * v;
});
const near = (v, target, rel) => Math.abs(v - target) <= Math.abs(target) * rel;

describe('signaux de test connus', () => {
  it.each([100, 440, 1000])('sinus à %i Hz : centroïde à ±2 %', (f) => {
    expect(near(A.spectralCentroid(sine(f), SR), f, 0.02)).toBe(true);
  });

  it.each([100, 440, 1000])('sinus à %i Hz : fondamentale à ±2 %', (f) => {
    expect(near(A.estimateF0(sine(f), SR, 50, 1200), f, 0.02)).toBe(true);
  });

  it('bruit blanc : centroïde ≈ 25 % de la fréquence d\'échantillonnage (±3 points)', () => {
    const c = A.spectralCentroid(white(SR), SR) / SR;
    expect(c).toBeGreaterThan(0.22);
    expect(c).toBeLessThan(0.28);
  });

  it('bruit blanc : rolloff à 85 % proche de 85 % de Nyquist', () => {
    expect(near(A.rolloff(white(SR), SR, 0.85), 0.85 * (SR / 2), 0.05)).toBe(true);
  });

  it('impulsion : crête 1, RMS 1/√n, spectre plat (centroïde ≈ quart de la fréquence d\'échantillonnage)', () => {
    const x = new Float32Array(2048);
    x[1024] = 1;
    expect(A.peak(x)).toBe(1);
    expect(A.rms(x)).toBeCloseTo(1 / Math.sqrt(2048), 10);
    expect(A.spectralCentroid(x, SR) / SR).toBeGreaterThan(0.2);
  });

  it('silence : mesures nulles, −200 dBFS, aucune fondamentale', () => {
    const d = A.describe(new Float32Array(4096), SR);
    expect([d.peak, d.rms, d.centroid, d.f0, d.hnr, d.hf4k]).toEqual([0, 0, 0, 0, 0, 0]);
    expect(d.peakDb).toBe(A.SILENCE_DB);
  });

  it('sinus : facteur de crête √2, passages par zéro 2f / sr', () => {
    const x = sine(441, 1);
    expect(A.crestFactor(x)).toBeCloseTo(Math.SQRT2, 2);
    expect(A.zeroCrossingRate(x)).toBeCloseTo((2 * 441) / SR, 3);
  });

  it('décalage continu mesuré', () => {
    expect(A.dcOffset(Float32Array.from(sine(200), (v) => v + 0.1))).toBeCloseTo(0.1, 3);
  });

  it('pic spectral d\'un sinus à 300 Hz à ±1 %', () => {
    expect(near(A.spectralPeak(sine(300), SR), 300, 0.01)).toBe(true);
  });

  it('dbfs : 1 -> 0, 0,5 -> −6,02, 0 et NaN -> −200', () => {
    expect(A.dbfs(1)).toBe(0);
    expect(A.dbfs(0.5)).toBeCloseTo(-6.02, 2);
    expect(A.dbfs(0)).toBe(A.SILENCE_DB);
    expect(A.dbfs(Number.NaN)).toBe(A.SILENCE_DB);
  });
});

describe('FFT', () => {
  it('énergie conservée sans fenêtre (Parseval)', () => {
    const x = white(1024, 7);
    const { re, im, size } = A.fft(x, 1024, { window: 'none' });
    let ef = 0;
    for (let k = 0; k < size; k += 1) ef += re[k] * re[k] + im[k] * im[k];
    let et = 0;
    for (const v of x) et += v * v;
    expect(ef / size).toBeCloseTo(et, 6);
  });

  it('énergie conservée avec la fenêtre de Hann (signal fenêtré)', () => {
    const x = white(512, 9);
    const { re, im } = A.fft(x, 512);
    let ef = 0;
    for (let k = 0; k < 512; k += 1) ef += re[k] * re[k] + im[k] * im[k];
    let et = 0;
    for (let i = 0; i < 512; i += 1) et += (x[i] * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / 512))) ** 2;
    expect(ef / 512).toBeCloseTo(et, 6);
  });

  it('le maximum d\'un sinus tombe dans la bonne case', () => {
    const { re, im } = A.fft(sine(SR / 32, 0.2), 1024);
    let best = 0;
    let at = 0;
    for (let k = 0; k < 512; k += 1) {
      const m = Math.hypot(re[k], im[k]);
      if (m > best) {
        best = m;
        at = k;
      }
    }
    expect(at).toBe(32);
  });

  it.each([[2048, 2048], [3, 4], [1000, 1024], [0, 2048], [-5, 2048], [Number.NaN, 2048], ['abc', 2048], [1e9, 65536]])('taille %s -> puissance de deux %i, sans exception', (size, expected) => {
    expect(A.fftSize(size)).toBe(expected);
    expect(A.fft(sine(100, 0.05), size).re.length).toBe(expected);
  });
});

describe('fondamentale, harmonique-bruit, bandes', () => {
  it('signal à harmoniques (90 Hz) : fondamentale à ±2 %', () => {
    expect(near(A.estimateF0(harmonic(90), SR), 90, 0.02)).toBe(true);
  });

  it('signal à harmoniques bruité (≈ 10 dB) : fondamentale à ±3 %', () => {
    const h = harmonic(120);
    const n = white(h.length, 3, 0.1);
    expect(near(A.estimateF0(Float32Array.from(h, (v, i) => v + n[i]), SR), 120, 0.03)).toBe(true);
  });

  it('bruit : aucune fondamentale fiable (0 ou peu de trames voisées)', () => {
    const t = A.pitchTrack(white(SR, 5), SR);
    expect(t.voiced).toBeLessThan(0.5);
  });

  it('un sinus pur a un rapport harmonique-bruit très élevé (≥ 30 dB)', () => {
    expect(A.harmonicToNoise(sine(150), SR)).toBeGreaterThanOrEqual(30);
  });

  it('un bruit blanc a un rapport harmonique-bruit négatif', () => {
    expect(A.harmonicToNoise(white(SR, 11), SR)).toBeLessThan(0);
  });

  it.each([6, 10, 14])('harmonique-bruit suit le rapport signal sur bruit (%i dB, ±3 dB)', (snr) => {
    const h = harmonic(100);
    const n = white(h.length, 21, 1);
    const k = Math.sqrt((A.rms(h) ** 2 / A.rms(n) ** 2) / 10 ** (snr / 10));
    const hnr = A.harmonicToNoise(Float32Array.from(h, (v, i) => v + k * n[i]), SR);
    expect(Math.abs(hnr - snr)).toBeLessThanOrEqual(3);
  });

  it.each([[0, 500], [500, 4000], [4000, Infinity]])('les parts d\'énergie complémentaires somment à 1 (coupure %i Hz)', (lo, hi) => {
    const x = white(8192, 2);
    const inside = A.bandEnergyRatio(x, SR, lo, hi);
    const outside = A.bandEnergyRatio(x, SR, 0, lo) + A.bandEnergyRatio(x, SR, hi, Infinity);
    expect(inside + outside).toBeCloseTo(1, 9);
  });

  it('un sinus à 440 Hz a plus de 95 % de son énergie entre 400 et 500 Hz', () => {
    expect(A.bandEnergyRatio(sine(440), SR, 400, 500)).toBeGreaterThan(0.95);
  });
});

describe('bords, niveaux, distances', () => {
  it('edgeClicks détecte une coupure brutale', () => {
    const x = sine(440, 0.1);
    expect(A.edgeClicks(x.subarray(0, 1000 + 5)).click).toBe(true);
  });

  it('edgeClicks accepte un son fondu aux deux bouts', () => {
    const x = sine(440, 0.1);
    const n = x.length;
    const y = Float32Array.from(x, (v, i) => v * Math.sin((Math.PI * i) / (n - 1)) ** 2);
    expect(A.edgeClicks(y).click).toBe(false);
  });

  it('niveau court : RMS de la fenêtre de 100 ms la plus forte (rafale de 200 ms dans le silence)', () => {
    const burst = sine(500, 0.2, 0.4);
    const x = new Float32Array(SR);
    x.set(burst, 5000);
    expect(A.shortLevel(x, SR)).toBeCloseTo(A.rms(burst), 3);
  });

  it('durée active d\'une rafale de 0,3 s dans 1 s de silence', () => {
    const x = new Float32Array(SR);
    x.set(sine(300, 0.3), 4000);
    expect(A.activeDuration(x, SR)).toBeGreaterThan(0.28);
    expect(A.activeDuration(x, SR)).toBeLessThan(0.32);
  });

  it('attaque : rampe linéaire de 20 ms -> environ 16 ms de 10 à 90 %', () => {
    const x = Float32Array.from({ length: 4410 }, (_, i) => Math.min(1, i / 441) * Math.sin(i));
    const a = A.attackTime(x, SR) * 1000;
    expect(a).toBeGreaterThan(12);
    expect(a).toBeLessThan(20);
  });

  it('coups : trois clics à 0,1, 0,5 et 0,9 s sont retrouvés', () => {
    const x = new Float32Array(SR);
    for (const t of [0.1, 0.5, 0.9]) x[Math.round(t * SR)] = 1;
    const o = A.onsets(x, SR);
    expect(o.length).toBe(3);
    o.forEach((t, k) => expect(Math.abs(t - [0.1, 0.5, 0.9][k])).toBeLessThan(0.006));
  });

  it('pointe aiguë précoce : la bande 2-5 kHz d\'un clic suivi d\'un son grave est dans les 40 premières ms', () => {
    const x = new Float32Array(SR / 2);
    x.set(sine(3000, 0.02, 0.8), 0);
    x.set(sine(150, 0.4, 0.5), 400);
    expect(A.earlyBand(x, SR).early).toBeGreaterThan(0.8);
  });

  it('jonction de boucle : un sinus à nombre entier de périodes enchaîne sans saut', () => {
    const s = A.loopSeam(sine(100, 1), SR);
    expect(s.jump).toBeLessThan(0.02);
    expect(Math.abs(s.energyRatio - 1)).toBeLessThan(0.1);
  });

  it('distance spectrale nulle entre deux copies', () => {
    const x = harmonic(110);
    expect(A.spectralDistance(x, Float32Array.from(x), SR)).toBe(0);
  });

  it('distance spectrale grande entre un sinus grave et un bruit blanc', () => {
    expect(A.spectralDistance(sine(120), white(SR), SR)).toBeGreaterThan(0.3);
  });

  it('distance spectrale symétrique ; silence/silence = 0, silence/son = 1', () => {
    const a = sine(200);
    const b = white(SR, 4);
    expect(A.spectralDistance(a, b, SR)).toBeCloseTo(A.spectralDistance(b, a, SR), 12);
    expect(A.spectralDistance(new Float32Array(100), new Float32Array(100), SR)).toBe(0);
    expect(A.spectralDistance(new Float32Array(100), a, SR)).toBe(1);
  });
});

describe('robustesse', () => {
  const fns = ['rms', 'peak', 'dcOffset', 'crestFactor', 'shortLevel', 'spectralCentroid', 'rolloff', 'bandEnergyRatio', 'spectralPeak', 'estimateF0', 'pitchTrack', 'harmonicToNoise', 'zeroCrossingRate', 'edgeClicks', 'loopSeam', 'bandProfile', 'activeDuration', 'attackTime', 'onsets', 'earlyBand', 'describe', 'toSamples'];
  const hostile = [null, undefined, {}, 'abc', 42, [], [Number.NaN, Infinity, -Infinity, 'x', null], { length: -3 }, new Float32Array(1)];

  // Tous les nombres d'un résultat (récursivement, tableaux typés compris).
  const numbers = (r) => {
    if (typeof r === 'number') return [r];
    if (ArrayBuffer.isView(r)) return Array.from(r);
    if (Array.isArray(r)) return r.flatMap(numbers);
    if (r && typeof r === 'object') return Object.values(r).flatMap(numbers);
    return [];
  };

  it.each(fns)('%s ne lève jamais d\'exception sur des entrées hostiles et rend des nombres finis', (name) => {
    for (const h of hostile) {
      const r = A[name](h, Number.NaN);
      for (const v of numbers(r)) expect(Number.isFinite(v), `${name}(${JSON.stringify(h)})`).toBe(true);
    }
  });

  it('spectralDistance et fft acceptent des entrées hostiles', () => {
    expect(() => A.spectralDistance(null, 'x', -1)).not.toThrow();
    expect(() => A.fft(undefined, 'z')).not.toThrow();
    expect(A.spectralDistance(null, undefined)).toBe(0);
  });

  it('accepte un tableau gelé et ne modifie jamais son argument', () => {
    const frozen = Object.freeze(Array.from(sine(220, 0.2)));
    expect(() => A.describe(frozen, SR)).not.toThrow();
    const x = sine(220, 0.2);
    const copy = Float32Array.from(x);
    A.describe(x, SR);
    A.fft(x, 512);
    A.spectralDistance(x, x, SR);
    expect(Buffer.from(x.buffer).equals(Buffer.from(copy.buffer))).toBe(true);
  });

  it('déterministe : deux descriptions du même son sont identiques', () => {
    const x = harmonic(95, 0.5);
    expect(A.describe(x, SR)).toEqual(A.describe(x, SR));
  });

  it('describe rend toutes ses mesures sous forme de nombres finis', () => {
    const d = A.describe(Float32Array.from(harmonic(100, 0.6), (v, i) => v + 0.02 * Math.sin(i * 7.1)), SR);
    for (const [k, v] of Object.entries(d)) if (typeof v === 'number') expect(Number.isFinite(v), k).toBe(true);
    expect(d.bytes).toBe(d.samples * 4);
  });

  it('une fréquence d\'échantillonnage invalide prend 22 050 Hz', () => {
    expect(A.describe(sine(440, 0.1), 'x').sampleRate).toBe(22050);
  });
});
