import { describe, it, expect } from 'vitest';
import { finishRender, renderSound, renderStep, soundBytes, startRender, variantCount } from '../../js/core/synth.js';
import { attackTime, centroid, magnitudes, maxCorrelation, mean, medianPitch, peakOf, rmsOf } from './helpers/dsp.js';

const RATE = 22050;
// Recette minimale : une seule couche sans variation (freqVar et gainVar à 0), sans normalisation excessive.
const recipe = (layers, extra = {}, post = {}) => ({ id: 't', sampleRate: RATE, duration: 0.5, variants: 1, seed: 5, freqVar: 0, gainVar: 0, layers, post: { targetPeak: 0.8, ...post }, ...extra });
const render = (layers, extra, post) => renderSound(recipe(layers, extra, post), 0);
const deepFreeze = (o) => {
  if (o && typeof o === 'object') {
    Object.freeze(o);
    for (const v of Object.values(o)) deepFreeze(v);
  }
  return o;
};
// Fréquence du plus grand pic du spectre (Hz).
function dominant(samples, rate, start = 0, size = 8192) {
  const mag = magnitudes(samples, start, size);
  let best = 1;
  for (let i = 2; i < mag.length; i += 1) if (mag[i] > mag[best]) best = i;
  return (best * rate) / size;
}
// Énergie du spectre entre deux fréquences, en proportion du total.
function bandShare(samples, rate, lo, hi, start = 0, size = 8192) {
  const mag = magnitudes(samples, start, size);
  let band = 0;
  let all = 0;
  for (let i = 1; i < mag.length; i += 1) {
    const f = (i * rate) / size;
    all += mag[i] ** 2;
    if (f >= lo && f < hi) band += mag[i] ** 2;
  }
  return band / all;
}

describe('synth.js : oscillateurs', () => {
  it.each([['sine', 440], ['triangle', 440], ['saw', 440], ['square', 440]])('%s : la fondamentale est à %i Hz', (wave, freq) => {
    const r = render([{ type: 'osc', wave, freq }], { duration: 0.6 });
    expect(Math.abs(dominant(r.samples, RATE) - freq)).toBeLessThan(5);
  });

  it('le balayage de fréquence descend de la fréquence de départ à celle d\'arrivée', () => {
    const r = render([{ type: 'osc', wave: 'sine', freq: [2000, 500], sweepTime: 0.5 }], { duration: 0.5 });
    const early = dominant(r.samples, RATE, 0, 1024);
    const late = dominant(r.samples, RATE, r.samples.length - 1200, 1024);
    expect(early).toBeGreaterThan(1300);
    expect(late).toBeLessThan(900);
  });

  it('la scie et le carré ont des harmoniques ; le sinus n\'en a pas', () => {
    const sine = render([{ type: 'osc', wave: 'sine', freq: 500 }]);
    const saw = render([{ type: 'osc', wave: 'saw', freq: 500 }]);
    expect(bandShare(saw.samples, RATE, 900, 5000)).toBeGreaterThan(0.1);
    expect(bandShare(sine.samples, RATE, 900, 5000)).toBeLessThan(0.01);
  });

  it('pas d\'aliasing audible : une scie aiguë garde son énergie sur ses harmoniques', () => {
    // Scie à 3 000 Hz (taux 22 050) : l'harmonique 3 (9 000 Hz) existe, l'harmonique 4 (12 000 Hz) se replie sur 10 050 Hz sans bandelimitation.
    const r = render([{ type: 'osc', wave: 'saw', freq: 3000 }], { duration: 0.6 });
    const mag = magnitudes(r.samples, 0, 8192);
    const at = (f) => mag[Math.round((f * 8192) / RATE)] ?? 0;
    const peakAt = (f) => Math.max(...[-2, -1, 0, 1, 2].map((d) => mag[Math.round((f * 8192) / RATE) + d] ?? 0));
    expect(peakAt(9000)).toBeGreaterThan(0.05 * peakAt(3000));
    expect(at(5500)).toBeLessThan(0.1 * peakAt(3000)); // fréquence qui n'est pas une harmonique
  });

  it('le vibrato fait varier la fréquence autour de la fondamentale', () => {
    const r = render([{ type: 'osc', wave: 'sine', freq: 600, vibrato: { rate: 6, depth: 0.05 } }], { duration: 1 });
    const flat = render([{ type: 'osc', wave: 'sine', freq: 600 }], { duration: 1 });
    // Avec vibrato, le pic spectral est plus étalé (moins d'énergie dans les 3 Hz autour de 600 Hz).
    const share = (s) => bandShare(s.samples, RATE, 597, 603, 0, 16384);
    expect(share(r)).toBeLessThan(share(flat) * 0.8);
  });

  it('la modulation d\'amplitude creuse le signal au rythme demandé', () => {
    const r = render([{ type: 'osc', wave: 'sine', freq: 800, am: { rate: 4, depth: 1 } }], { duration: 1 });
    const win = Math.round(RATE / 40);
    const levels = [];
    for (let i = 0; i + win < r.samples.length; i += win) levels.push(rmsOf(r.samples, i, i + win));
    expect(Math.min(...levels)).toBeLessThan(0.1 * Math.max(...levels));
  });
});

describe('synth.js : bruits et filtres', () => {
  const spectrumSlope = (color) => {
    const r = render([{ type: 'noise', color }], { duration: 1 });
    return { low: bandShare(r.samples, RATE, 50, 500, 0, 16384), high: bandShare(r.samples, RATE, 5000, 11000, 0, 16384), r };
  };

  it('le bruit blanc est à peu près plat, centré et déterministe', () => {
    const { low, high, r } = spectrumSlope('white');
    expect(Math.abs(mean(r.samples))).toBeLessThan(0.01);
    expect(high / low).toBeGreaterThan(4);
  });

  it('le bruit rose est plus grave que le blanc, le brun plus encore', () => {
    const w = spectrumSlope('white');
    const p = spectrumSlope('pink');
    const b = spectrumSlope('brown');
    expect(p.low / p.high).toBeGreaterThan(w.low / w.high * 3);
    expect(b.low / b.high).toBeGreaterThan(p.low / p.high * 3);
  });

  const noise = (filter) => render([{ type: 'noise', color: 'white', filter }], { duration: 1 });
  it('passe-bas : coupe l\'aigu', () => {
    const r = noise({ type: 'lowpass', freq: 1000, q: 0.7 });
    expect(bandShare(r.samples, RATE, 3000, 11000, 0, 16384)).toBeLessThan(0.02);
  });
  it('passe-haut : coupe le grave', () => {
    const r = noise({ type: 'highpass', freq: 4000, q: 0.7 });
    expect(bandShare(r.samples, RATE, 20, 1500, 0, 16384)).toBeLessThan(0.02);
  });
  it('passe-bande : concentre l\'énergie autour de la fréquence centrale', () => {
    const r = noise({ type: 'bandpass', freq: 2000, q: 6 });
    expect(bandShare(r.samples, RATE, 1500, 2700, 0, 16384)).toBeGreaterThan(0.7);
  });
  it('crête : relève une bande de plus de 6 dB sans toucher le reste', () => {
    const flat = noise(undefined);
    const peaked = noise({ type: 'peak', freq: 2000, q: 2, gain: 12 });
    expect(bandShare(peaked.samples, RATE, 1500, 2700, 0, 16384)).toBeGreaterThan(2 * bandShare(flat.samples, RATE, 1500, 2700, 0, 16384));
  });
  it('un filtre dont la fréquence est balayée fait baisser le centre de gravité', () => {
    const r = render([{ type: 'noise', color: 'white', filter: { type: 'bandpass', freq: [5000, 500], q: 4 } }], { duration: 1 });
    expect(centroid(r.samples, RATE, 0, 2048)).toBeGreaterThan(2 * centroid(r.samples, RATE, RATE - 3000, 2048));
  });
});

describe('synth.js : enveloppes', () => {
  const env = (extra, dur = 1) => render([{ type: 'osc', wave: 'sine', freq: 440, ...extra }], { duration: dur }, { fadeOut: 0 });
  it('attaque : le signal démarre à zéro et monte', () => {
    const r = env({ attack: 0.2 });
    expect(rmsOf(r.samples, 0, 220)).toBeLessThan(0.3 * rmsOf(r.samples, 8000, 8220));
  });
  it('décroissance exponentielle : le niveau diminue du même rapport par constante de temps', () => {
    const r = env({ decay: 0.1 });
    const level = (t) => rmsOf(r.samples, Math.round(t * RATE), Math.round(t * RATE) + 441);
    const a = level(0.1) / level(0.2);
    const b = level(0.2) / level(0.3);
    expect(a / b).toBeGreaterThan(0.8);
    expect(a / b).toBeLessThan(1.25);
    expect(a).toBeGreaterThan(2);
  });
  it('tenue : le niveau ne baisse pas avant la fin de la tenue', () => {
    const r = env({ hold: 0.5, decay: 0.05 });
    expect(rmsOf(r.samples, 5000, 5441)).toBeGreaterThan(0.8 * rmsOf(r.samples, 2000, 2441));
    expect(rmsOf(r.samples, 20000, 20441)).toBeLessThan(0.2 * rmsOf(r.samples, 5000, 5441));
  });
  it('relâchement : le signal retombe à zéro à la fin de la couche', () => {
    const r = env({ dur: 0.5, release: 0.2 }, 0.8);
    expect(rmsOf(r.samples, Math.round(0.45 * RATE), Math.round(0.45 * RATE) + 200)).toBeLessThan(rmsOf(r.samples, Math.round(0.2 * RATE), Math.round(0.2 * RATE) + 200));
    expect(peakOf(r.samples.subarray(Math.round(0.55 * RATE)))).toBeLessThan(1e-6);
  });
  it('start retarde la couche et dur la coupe', () => {
    const r = env({ start: 0.3, dur: 0.2 });
    expect(peakOf(r.samples.subarray(0, Math.round(0.29 * RATE)))).toBeLessThan(1e-6);
    expect(peakOf(r.samples.subarray(Math.round(0.31 * RATE), Math.round(0.49 * RATE)))).toBeGreaterThan(0.1);
    expect(peakOf(r.samples.subarray(Math.round(0.52 * RATE)))).toBeLessThan(0.02); // coupure franche : seul le filtre anti-décalage résonne
  });
});

describe('synth.js : partiels résonants et voix à formants', () => {
  it('ring : les partiels demandés apparaissent au spectre, avec leur décroissance propre', () => {
    const r = render([{ type: 'ring', partials: [{ freq: 1000, gain: 1, decay: 0.3 }, { freq: 3000, gain: 1, decay: 0.02 }] }], { duration: 0.8 });
    const early = magnitudes(r.samples, 0, 2048);
    const late = magnitudes(r.samples, 8000, 2048);
    const bin = (f) => Math.round((f * 2048) / RATE);
    expect(early[bin(3000)]).toBeGreaterThan(early[bin(2000)] * 5);
    expect(late[bin(1000)]).toBeGreaterThan(late[bin(3000)] * 10);
  });

  const voice = (extra) => render([{ type: 'voice', f0: 120, vowels: ['a'], jitter: 0, breath: 0, attack: 0.02, ...extra }], { duration: 0.8 });
  it('voice : la fondamentale mesurée par autocorrélation est celle demandée', () => {
    const { f0, windows } = medianPitch(voice({}).samples, RATE);
    expect(windows).toBeGreaterThan(5);
    expect(Math.abs(f0 - 120)).toBeLessThan(10);
  });
  it('voice : le contour de hauteur fait monter puis descendre la voix', () => {
    const r = render([{ type: 'voice', f0: 100, contour: [[0, 1], [0.5, 1.6], [1, 1]], vowels: ['a'], jitter: 0, attack: 0.02 }], { duration: 1 });
    const pitchAt = (t) => medianPitch(r.samples.subarray(Math.round(t * RATE), Math.round((t + 0.15) * RATE)), RATE).f0;
    expect(pitchAt(0.45)).toBeGreaterThan(pitchAt(0.02) * 1.3);
  });
  it('voice : les voyelles ne se ressemblent pas (a plus clair que u)', () => {
    const a = voice({ vowels: ['a'] });
    const u = voice({ vowels: ['u'] });
    expect(centroid(a.samples, RATE, 4000, 2048)).toBeGreaterThan(1.3 * centroid(u.samples, RATE, 4000, 2048));
  });
  it('voice : la transition passe d\'une voyelle à l\'autre dans le temps', () => {
    const r = render([{ type: 'voice', f0: 120, vowels: ['u', 'a'], transition: [0.2, 0.7], jitter: 0, attack: 0.02 }], { duration: 1.2 });
    expect(centroid(r.samples, RATE, RATE, 2048)).toBeGreaterThan(1.3 * centroid(r.samples, RATE, 2500, 2048));
  });
  it('voice : le souffle ajoute du bruit (la périodicité baisse)', () => {
    const clean = pitchStrength(voice({ breath: 0 }).samples);
    const breathy = pitchStrength(voice({ breath: 1.5, voiced: 0.3 }).samples);
    expect(breathy).toBeLessThan(clean * 0.7);
  });
  it('voice : la rugosité (AM) crée des creux à la cadence demandée', () => {
    const r = voice({ roughness: { rate: 20, depth: 1 } });
    const win = Math.round(RATE / 80);
    const lv = [];
    for (let i = 4000; i < 4000 + win * 10; i += win) lv.push(rmsOf(r.samples, i, i + win));
    expect(Math.min(...lv)).toBeLessThan(0.4 * Math.max(...lv));
  });
});
function pitchStrength(samples) {
  let best = 0;
  const size = 1024;
  for (let s = 3000; s + size < samples.length - 3000; s += 1500) {
    const e = rmsOf(samples, s, s + size) ** 2 * size;
    let ac = 0;
    for (let lag = 90; lag <= 366; lag += 1) {
      let sum = 0;
      for (let i = 0; i + lag < size; i += 1) sum += samples[s + i] * samples[s + i + lag];
      ac = Math.max(ac, sum / e);
    }
    best = Math.max(best, ac);
  }
  return best;
}

describe('synth.js : post-traitement', () => {
  const click = [{ type: 'noise', color: 'white', dur: 0.01, decay: 0.002 }];
  it('réverbération : une queue apparaît après la fin des couches, plus longue avec une durée plus grande', () => {
    const dry = render(click, { duration: 1 }, { fadeOut: 0 });
    const short = render(click, { duration: 1 }, { fadeOut: 0, reverb: { decay: 0.2, mix: 0.6, damping: 0.3 } });
    const long = render(click, { duration: 1 }, { fadeOut: 0, reverb: { decay: 0.9, mix: 0.6, damping: 0.3 } });
    const tail = (r) => rmsOf(r.samples, Math.round(0.3 * RATE), Math.round(0.6 * RATE)) / peakOf(r.samples);
    expect(tail(dry)).toBeLessThan(1e-4);
    expect(tail(short)).toBeGreaterThan(tail(dry));
    expect(tail(long)).toBeGreaterThan(3 * tail(short));
  });
  it('réverbération : l\'amortissement assombrit la queue', () => {
    const bright = render(click, { duration: 1 }, { reverb: { decay: 0.8, mix: 0.8, damping: 0.05 } });
    const dark = render(click, { duration: 1 }, { reverb: { decay: 0.8, mix: 0.8, damping: 0.9 } });
    const c = (r) => centroid(r.samples, RATE, 4000, 4096);
    expect(c(dark)).toBeLessThan(c(bright));
  });
  it('réverbération : mix à 0 = aucun effet, l\'attaque sèche reste la même', () => {
    const a = render(click, { duration: 0.5 }, {});
    const b = render(click, { duration: 0.5 }, { reverb: { decay: 0.5, mix: 0 } });
    expect(Array.from(b.samples)).toEqual(Array.from(a.samples));
  });
  it('saturation : écrête doucement (le pic des signaux forts augmente moins que leur gain)', () => {
    const loud = [{ type: 'osc', wave: 'sine', freq: 300, gain: 4 }];
    const clean = render(loud, {}, { targetPeak: 0.9 });
    const sat = render(loud, {}, { targetPeak: 0.9, saturation: 3 });
    // Un sinus saturé devient presque carré : son niveau efficace se rapproche du pic.
    expect(rmsOf(sat.samples) / peakOf(sat.samples)).toBeGreaterThan(rmsOf(clean.samples) / peakOf(clean.samples) * 1.15);
  });
  it('normalisation : le pic atteint la cible (au gain de variante près) et reste sous 0,98', () => {
    for (const target of [0.3, 0.6, 0.85]) {
      const r = render([{ type: 'noise', color: 'pink' }], {}, { targetPeak: target });
      expect(r.peak).toBeGreaterThan(target * 0.95);
      expect(r.peak).toBeLessThan(Math.min(0.98, target * 1.02));
    }
    expect(render([{ type: 'noise' }], {}, { targetPeak: 5 }).peak).toBeLessThanOrEqual(0.98);
  });
  it('targetRms : plafonne le niveau efficace', () => {
    const loud = render([{ type: 'noise', color: 'white' }], {}, { targetPeak: 0.9, targetRms: 0.05 });
    expect(rmsOf(loud.samples)).toBeLessThanOrEqual(0.0505);
  });
  it('fondu de fin : le dernier échantillon est nul et la dernière milliseconde est silencieuse ; le premier est quasi nul', () => {
    const r = render([{ type: 'noise', color: 'white' }], { duration: 0.3 });
    expect(Math.abs(r.samples.at(-1))).toBeLessThan(1e-6);
    expect(Math.abs(r.samples[0])).toBeLessThan(1e-6);
    expect(peakOf(r.samples.subarray(-Math.round(0.001 * RATE)))).toBeLessThan(0.25 * r.peak);
  });
  it('décalage continu : un signal décentré est ramené à zéro', () => {
    const r = render([{ type: 'noise', color: 'brown', gain: 3 }], { duration: 1 });
    expect(Math.abs(mean(r.samples))).toBeLessThan(0.01);
  });
  it('bouclage : le dernier échantillon enchaîne sur le premier (écart de l\'ordre d\'un pas)', () => {
    const r = render([{ type: 'noise', color: 'brown' }, { type: 'osc', wave: 'sine', freq: 55, gain: 0.3 }], { duration: 2, loop: true, loopOverlap: 0.3 });
    let steps = 0;
    for (let i = 1; i < r.samples.length; i += 1) steps += Math.abs(r.samples[i] - r.samples[i - 1]);
    expect(Math.abs(r.samples.at(-1) - r.samples[0])).toBeLessThan(4 * (steps / (r.samples.length - 1)));
    expect(r.samples.length).toBe(2 * RATE);
  });
});

describe('synth.js : déterminisme, variantes, blocs', () => {
  const rich = recipe([
    { type: 'noise', color: 'pink', dur: 0.04, filter: { type: 'bandpass', freq: [3000, 800], q: 2 }, decay: 0.01 },
    { type: 'osc', wave: 'saw', freq: [200, 90], sweepTime: 0.05, dur: 0.1, decay: 0.03, startJitter: 0.005 },
    { type: 'ring', partials: [{ freq: 1500, gain: 0.3, decay: 0.03 }] },
    { type: 'voice', f0: 130, vowels: ['a', 'o'], breath: 0.2, roughness: { rate: 30, depth: 0.4 }, dur: 0.12, start: 0.02 },
  ], { duration: 0.15, variants: 3, freqVar: 0.08, gainVar: 1.5 }, { saturation: 1.3, reverb: { decay: 0.2, mix: 0.3, damping: 0.5 }, targetPeak: 0.8 });

  it('mêmes entrées = mêmes échantillons', () => {
    expect(Array.from(renderSound(rich, 1).samples)).toEqual(Array.from(renderSound(rich, 1).samples));
  });
  it('des graines différentes donnent des tampons différents', () => {
    const a = renderSound({ ...rich, seed: 5 }, 0);
    const b = renderSound({ ...rich, seed: 6 }, 0);
    expect(Array.from(a.samples)).not.toEqual(Array.from(b.samples));
  });
  it('les variantes diffèrent (corrélation maximale inférieure à 0,9)', () => {
    const [a, b, c] = [0, 1, 2].map((v) => renderSound(rich, v).samples);
    expect(maxCorrelation(a, b)).toBeLessThan(0.9);
    expect(maxCorrelation(a, c)).toBeLessThan(0.9);
    expect(maxCorrelation(b, c)).toBeLessThan(0.9);
  });
  it('la variante garde la fréquence à ±8 % de la recette', () => {
    const tone = { id: 'v', sampleRate: RATE, duration: 0.6, variants: 12, seed: 3, layers: [{ type: 'osc', wave: 'sine', freq: 1000 }], post: {} };
    for (let v = 0; v < 12; v += 1) {
      const f = dominant(renderSound(tone, v).samples, RATE, 0, 16384);
      expect(f).toBeGreaterThan(1000 * 0.92 - 4);
      expect(f).toBeLessThan(1000 * 1.08 + 4);
    }
  });
  it('le gain de variante reste dans ±1,5 dB (par couche) : le niveau d\'un son tonal varie peu', () => {
    const tone = { id: 'v', sampleRate: RATE, duration: 0.3, variants: 12, seed: 3, freqVar: 0, layers: [{ type: 'osc', wave: 'sine', freq: 800, gain: 0.5 }], post: { targetPeak: 0.5 } };
    const levels = Array.from({ length: 12 }, (_, v) => renderSound(tone, v).rms);
    expect(Math.max(...levels) / Math.min(...levels)).toBeLessThan(10 ** (3 / 20) + 0.01);
  });

  const blocks = (size) => {
    const acc = startRender(rich, 1);
    let steps = 0;
    while (!renderStep(acc, size).done) steps += 1;
    return { out: finishRender(acc), steps };
  };
  it.each([1, 4096, 100000])('rendu par blocs de %i échantillons = rendu complet', (size) => {
    const whole = renderSound(rich, 1);
    const { out, steps } = blocks(size);
    expect(Array.from(out.samples)).toEqual(Array.from(whole.samples));
    expect(out.peak).toBe(whole.peak);
    if (size === 1) expect(steps).toBeGreaterThan(1000);
    if (size === 100000) expect(steps).toBe(0);
  });
  it('renderStep : progression croissante, terminée à 1, sans effet une fois fini', () => {
    const acc = startRender(rich, 0);
    let last = 0;
    for (let i = 0; i < 100; i += 1) {
      const s = renderStep(acc, 500);
      expect(s.progress).toBeGreaterThanOrEqual(last);
      last = s.progress;
      if (s.done) break;
    }
    expect(last).toBe(1);
    expect(renderStep(acc, 500)).toEqual({ done: true, progress: 1 });
  });
  it('finishRender termine les blocs restants et renvoie le même objet à chaque appel', () => {
    const acc = startRender(rich, 0);
    renderStep(acc, 300);
    const a = finishRender(acc);
    expect(finishRender(acc)).toBe(a);
    expect(a.samples.length).toBe(Math.round(0.15 * RATE));
  });
  it('deux accumulateurs sont indépendants', () => {
    const a = startRender(rich, 0);
    const b = startRender(rich, 0);
    renderStep(a, 1000);
    expect(b.pos).toBe(0);
    expect(Array.from(finishRender(b).samples)).toEqual(Array.from(renderSound(rich, 0).samples));
  });
  it('la recette n\'est pas modifiée, même gelée', () => {
    const frozen = deepFreeze(structuredClone(rich));
    const before = JSON.stringify(frozen);
    expect(() => renderSound(frozen, 2)).not.toThrow();
    expect(JSON.stringify(frozen)).toBe(before);
    expect(Array.from(renderSound(frozen, 2).samples)).toEqual(Array.from(renderSound(rich, 2).samples));
  });
  it('le résultat porte l\'identifiant, la variante, le taux, le pic et le niveau efficace', () => {
    const r = renderSound({ ...rich, id: 'essai' }, 2);
    expect(r).toMatchObject({ id: 'essai', variant: 2, sampleRate: RATE });
    expect(r.samples).toBeInstanceOf(Float32Array);
    expect(r.peak).toBeCloseTo(peakOf(r.samples), 6);
    expect(r.rms).toBeCloseTo(rmsOf(r.samples), 6);
    expect(soundBytes(r)).toBe(r.samples.length * 4);
    expect(variantCount(rich)).toBe(3);
    expect(variantCount({})).toBe(1);
  });
  it('l\'attaque d\'un claquement est rapide', () => {
    const r = renderSound(recipe([{ type: 'noise', color: 'white', dur: 0.05, decay: 0.004, filter: { type: 'highpass', freq: 2500 } }]), 0);
    expect(attackTime(r.samples, RATE)).toBeLessThan(0.004);
  });
});

describe('synth.js : entrées hostiles', () => {
  const HOSTILE = [null, undefined, NaN, 'texte', 42, [], {}, () => 1, { duration: 'x', layers: 5 }, { id: 3, duration: 1, layers: [null, 'a', 3, {}] }];
  it.each(HOSTILE.map((h, i) => [i, h]))('recette hostile n°%i : aucune exception, résultat valide et avertissements', (_i, bad) => {
    let r;
    expect(() => {
      r = renderSound(bad, 0);
    }).not.toThrow();
    expect(r.samples).toBeInstanceOf(Float32Array);
    expect(Array.isArray(r.warnings)).toBe(true);
    expect(r.warnings.length).toBeGreaterThan(0);
    expect(Number.isFinite(r.peak)).toBe(true);
  });
  it.each([0, -1, NaN, Infinity, 'x', null])('durée %s : tampon vide et avertissement', (duration) => {
    const r = renderSound(recipe([{ type: 'osc' }], { duration }), 0);
    if (duration === Infinity) expect(r.samples.length).toBeLessThanOrEqual(10 * RATE);
    else expect(r.samples.length).toBe(0);
    expect(r.warnings.length).toBeGreaterThan(0);
  });
  it.each([0, -5, NaN, 'abc', 1, 1e9])('taux d\'échantillonnage %s : repli à 44 100 Hz avec avertissement', (sampleRate) => {
    const r = renderSound(recipe([{ type: 'osc' }], { sampleRate, duration: 0.05 }), 0);
    expect(r.sampleRate).toBe(44100);
    expect(r.warnings.some((w) => w.includes('taux'))).toBe(true);
    expect(r.samples.length).toBe(Math.round(0.05 * 44100));
  });
  it('couche inconnue ou absurde : ignorée avec avertissement, les autres sont rendues', () => {
    const r = renderSound(recipe([{ type: 'laser' }, null, { type: 'osc', wave: 'sine', freq: 440 }, { type: 'osc', wave: 'bizarre', freq: NaN, gain: 'x', start: -3, dur: NaN }]), 0);
    expect(r.warnings.some((w) => w.includes('inconnu'))).toBe(true);
    expect(r.peak).toBeGreaterThan(0.1);
    expect(r.samples.every(Number.isFinite)).toBe(true);
  });
  it('variante hostile : traitée comme 0', () => {
    const base = Array.from(renderSound(recipe([{ type: 'noise' }], { duration: 0.05 }), 0).samples);
    for (const v of [-1, NaN, 'a', null, undefined]) expect(Array.from(renderSound(recipe([{ type: 'noise' }], { duration: 0.05 }), v).samples)).toEqual(base);
  });
  it('accumulateurs invalides : renderStep et finishRender ne lèvent rien', () => {
    for (const bad of [null, undefined, 5, {}, 'x', { buf: [] }]) {
      expect(() => renderStep(bad, 10)).not.toThrow();
      expect(renderStep(bad, 10).done).toBe(true);
      expect(() => finishRender(bad)).not.toThrow();
      expect(finishRender(bad).warnings.length).toBeGreaterThan(0);
    }
  });
  it('maxSamples invalide : un bloc par défaut', () => {
    for (const n of [0, -3, NaN, 'a', null]) {
      const acc = startRender(recipe([{ type: 'osc' }], { duration: 0.5 }), 0);
      renderStep(acc, n);
      expect(acc.pos).toBeGreaterThan(0);
    }
  });
  it('une recette très longue est plafonnée à 10 s', () => {
    const r = renderSound(recipe([{ type: 'osc' }], { duration: 99, sampleRate: 8000 }), 0);
    expect(r.samples.length).toBe(80000);
    expect(r.warnings.some((w) => w.includes('limitée'))).toBe(true);
  });
});
