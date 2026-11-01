import { describe, it, expect } from 'vitest';
import * as D from '../../js/core/synth2-dsp.js';
import { KINDS, repairSequence } from '../../js/core/synth2-sources.js';
import { FORMAT, VERSIONS, deepMerge, macroParams, macroValues, nextVersion, render, renderDuration, renderVariant, resolveAtelier, resolveRecipe } from '../../js/core/synth2.js';
import { bandEnergyRatio, dcOffset, edgeClicks, estimateF0, peak, rms, shortLevel, spectralPeak, dbfs } from '../../js/core/audio-analysis.js';
import { readFileSync } from 'node:fs';

// Lot 3h-A : moteur de synthèse pur (js/core/synth2*.js). Primitives, rendu déterministe, garde-fous, séquence de réparation.
const SR = FORMAT.sampleRate;
const sine = (f, n, amp = 0.5) => Float64Array.from({ length: n }, (_, i) => amp * Math.sin((2 * Math.PI * f * i) / SR));
const bandDb = (x, lo, hi) => 10 * Math.log10(bandEnergyRatio(x, SR, lo, hi));
const atelier = resolveAtelier(JSON.parse(readFileSync('data/game/sounds-atelier.json', 'utf8')));
// Une recette d'essai par famille (valeurs courtes : tests rapides).
const RECIPES = {
  step: { kind: 'step', dur: 0.15, heel: { f: 100, decay: 0.015, attack: 0.012, gain: 0.5 }, modes: [{ f: 200, gain: 1, decay: 0.02 }], click: { f: 1000, q: 1, decay: 0.005, gain: 0.5 }, toe: { at: 0.06, gain: 0.4 }, scuff: { at: 0.03, f: 800, dur: 0.05, gain: 0.2 }, grit: { rate: 300, f: 1400, dur: 0.05, gain: 0.3 }, lp: 3000 },
  drag: { kind: 'drag', dur: 0.5, friction: { f: [400, 500], rate: 9 }, cloth: { f: 1500, gain: 0.2 }, knock: { at: 0.02, f: 85, gain: 0.5 } },
  voice: { kind: 'voice', dur: 0.6, f0: 100, contour: [[0, 1], [1, 0.9]], vowels: ['o', 'a'], breath: 0.1, sub: 0.2, rough: { rate: 30, depth: 0.2 }, double: { detune: 0.01, gain: 0.3 }, ingressive: { dur: 0.1, gain: 0.3 }, hiss: { f: 3000, gain: 0.1 }, rattle: { from: 0.5, gain: 0.1 }, drive: 2 },
  tear: { kind: 'tear', dur: 0.4, modes: [{ f: 190, decay: 0.1 }, { f: 500, decay: 0.06 }], squeal: { dur: 0.15, rate: [150, 400], gain: 0.3, modes: [{ f: 800, decay: 0.03 }] }, cracks: { at: 0.2, count: 3 }, splinter: { gain: 0.1 }, release: { at: 0.3, gain: 0.4 }, thump: { f: 90, gain: 0.3 } },
  creak: { kind: 'creak', dur: 0.5, modes: [{ f: 400, decay: 0.02 }], creak: { dur: 0.4 }, crack: { at: 0.42, gain: 0.8 }, splinter: { gain: 0.1 } },
  fall: { kind: 'fall', dur: 0.5, modes: [{ f: 230, decay: 0.08 }, { f: 635, decay: 0.05 }], bounces: { count: 3, secondEnd: 0.01 }, slap: { f: 85, gain: 0.4 }, slide: { dur: 0.1, gain: 0.1 } },
  hammer: { kind: 'hammer', dur: 0.2, hit: { body: { modes: [{ f: 160, decay: 0.07 }] }, nail: { gain: 2, partials: [{ f: 2700, decay: 0.015 }] }, click: { f: 1600, gain: 0.4 } } },
  repair: { kind: 'repair', dur: 1.2, hit: { body: { modes: [{ f: 160, decay: 0.07 }] }, nail: { gain: 2, partials: [{ f: 2700, decay: 0.015 }] } }, scrape: { gain: 0.3 } },
  climb: { kind: 'climb', dur: 1.0, modes: [{ f: 200, decay: 0.08 }], grabs: [{ at: 0.02, gain: 0.8 }], cloth: { at: 0.1, dur: 0.6, gain: 0.3 }, creak: { at: 0.3, dur: 0.3, gain: 0.2 }, grunt: { at: 0.4, dur: 0.3, f0: 90, gain: 0.4 }, land: { at: 0.85, f: 70, gain: 1 } },
  breath: { kind: 'breath', dur: 1.0, grunt: { dur: 0.3, f0: 120 }, cycles: [{ inhale: { at: 0.4, dur: 0.2 }, exhale: { at: 0.65, dur: 0.3, f0: 110, voiced: 0.3, breath: 0.9 } }] },
  getup: { kind: 'getup', dur: 0.7, rustle: { dur: 0.3 }, grunt: { at: 0.2, dur: 0.25, f0: 125 }, step: { at: 0.5, heel: { f: 100, gain: 0.5 }, modes: [{ f: 200, decay: 0.02 }] } },
  // Lot 3h-C : familles des propositions.
  wind: { kind: 'wind', dur: 1.5, gustStep: 0.4, whistles: [{ f: 700, q: 10, gain: 0.4, threshold: 0.4 }] },
  hum: { kind: 'hum', dur: 1, f0: 100, buzz: 0.1, flicker: { step: 0.1, depth: 0.4 }, crackle: { rate: 3, gain: 0.3 } },
  heart: { kind: 'heart', dur: 1.6, bpm: 80 },
  layers: { kind: 'layers', dur: 1.2, parts: [{ kind: 'creak', at: 0.1, dur: 0.6, modes: [{ f: 300, decay: 0.02 }] }, { kind: 'voice', at: 0.5, dur: 0.5, f0: 90, lp: 900 }] },
  sink: { kind: 'sink', dur: 1.2, modes: [{ f: 120, decay: 0.05 }], thud: { at: 1.05, f: 60, gain: 0.9 } },
  chime: { kind: 'chime', dur: 0.5, partials: [{ f: 2800, decay: 0.08 }], strikes: [{ at: 0.005, gain: 1 }, { at: 0.1, gain: 0.6 }], rattle: { at: 0.1, dur: 0.1, gain: 0.1 } },
};

describe('hasard à graine et bruits colorés', () => {
  it('createRandom : même graine, même suite, valeurs dans [0, 1)', () => {
    const a = D.createRandom(42);
    const b = D.createRandom(42);
    for (let i = 0; i < 1000; i += 1) {
      const v = a.next();
      expect(v).toBe(b.next());
      expect(v >= 0 && v < 1).toBe(true);
    }
  });

  it('hashSeed : stable et différent selon les parties', () => {
    expect(D.hashSeed('a', 1)).toBe(D.hashSeed('a', 1));
    expect(D.hashSeed('a', 1)).not.toBe(D.hashSeed('a', 2));
    expect(D.hashSeed('a', 1)).not.toBe(D.hashSeed('b', 1));
  });

  it.each([['white', 9], ['pink', 0], ['brown', -9]])('bruit %s : pente spectrale attendue (%i dB de 200-400 Hz à 1 600-3 200 Hz, ±2,5 dB)', (color, slope) => {
    const x = D.noise(SR * 4, color, 3);
    expect(Math.abs(bandDb(x, 1600, 3200) - bandDb(x, 200, 400) - slope)).toBeLessThanOrEqual(2.5);
  });

  it('bruit : même graine, mêmes échantillons ; graines différentes, échantillons différents', () => {
    expect(D.noise(100, 'pink', 5)).toEqual(D.noise(100, 'pink', 5));
    expect(D.noise(100, 'pink', 5)).not.toEqual(D.noise(100, 'pink', 6));
  });
});

describe('enveloppes et filtres', () => {
  it('envAD : 0 au départ, 1 au bout de l\'attaque, e^−1 une constante de temps plus tard', () => {
    const e = D.envAD(SR, SR, 0.01, 0.05);
    expect(e[0]).toBe(0);
    expect(e[Math.round(0.01 * SR)]).toBeCloseTo(1, 2);
    expect(e[Math.round(0.06 * SR)]).toBeCloseTo(Math.exp(-1), 2);
  });

  it('envADSR : palier au niveau de tenue, 0 au dernier échantillon', () => {
    const e = D.envADSR(SR, SR, { attack: 0.01, decay: 0.05, sustain: 0.6, release: 0.2 });
    expect(e[Math.round(0.3 * SR)]).toBeCloseTo(0.6, 5);
    expect(e[e.length - 1]).toBe(0);
  });

  it('curveAt : interpolation linéaire et bornes', () => {
    const pts = [[0, 1], [0.5, 2], [1, 0]];
    expect(D.curveAt(pts, 0.25)).toBeCloseTo(1.5, 10);
    expect(D.curveAt(pts, -1)).toBe(1);
    expect(D.curveAt(pts, 2)).toBe(0);
    expect(D.curveAt(null, 0.5, 7)).toBe(7);
  });

  it('biquad passe-bas à 500 Hz : un sinus à 4 kHz perd plus de 20 dB ; passe-haut : l\'inverse', () => {
    const hi = sine(4000, SR);
    const lo = sine(100, SR);
    expect(20 * Math.log10(rms(D.biquad(hi, { type: 'lowpass', freq: 500 }, SR)) / rms(hi))).toBeLessThan(-20);
    expect(20 * Math.log10(rms(D.biquad(lo, { type: 'highpass', freq: 2000 }, SR)) / rms(lo))).toBeLessThan(-20);
  });

  it('premier ordre : −3 dB à la coupure (±1 dB)', () => {
    const x = sine(1000, SR);
    expect(20 * Math.log10(rms(D.lowpass1(x, 1000, SR).subarray(2000)) / rms(x))).toBeCloseTo(-3, 0);
    expect(20 * Math.log10(rms(D.highpass1(x, 1000, SR).subarray(2000)) / rms(x))).toBeCloseTo(-3, 0);
  });

  it('passe-bas raide à 3 kHz : moins de 1 % de l\'énergie d\'un bruit blanc au-dessus de 4 kHz', () => {
    expect(bandEnergyRatio(D.lowpassSteep(D.noise(SR, 'white', 2), 3000, SR), SR, 4000, Infinity)).toBeLessThan(0.01);
  });
});

describe('source glottale, formants, résonateurs, réverbération', () => {
  it.each([66, 100, 140])('source glottale sans jitter : fondamentale demandée (%i Hz) à ±3 %', (f0) => {
    const g = D.glottalSource(SR, SR, { f0, jitter: 0, shimmer: 0, wander: 0 });
    expect(Math.abs(estimateF0(g.signal, SR, 40, 400) - f0) / f0).toBeLessThan(0.03);
  });

  it('source glottale : crête 1, débit positif, déterministe', () => {
    const a = D.glottalSource(4000, SR, { f0: 110, jitter: 0.03, seed: 4 });
    expect(peak(a.signal)).toBeCloseTo(1, 6);
    expect(Math.min(...a.flow)).toBeGreaterThanOrEqual(0);
    expect(a.signal).toEqual(D.glottalSource(4000, SR, { f0: 110, jitter: 0.03, seed: 4 }).signal);
  });

  it('sous-harmonique : un cycle sur deux atténué fait apparaître f0 / 2', () => {
    const plain = D.glottalSource(SR, SR, { f0: 120 }).signal;
    const sub = D.glottalSource(SR, SR, { f0: 120, sub: 0.5 }).signal;
    expect(bandEnergyRatio(sub, SR, 50, 70)).toBeGreaterThan(10 * bandEnergyRatio(plain, SR, 50, 70));
  });

  it('formants (cascade) : un bruit filtré par la voyelle « a » a son pic près de F1 (730 Hz ±15 %)', () => {
    const y = D.formantBank(D.noise(SR, 'white', 8), SR, { vowels: ['a'] });
    expect(Math.abs(spectralPeak(y, SR, 300, 1500) - 730) / 730).toBeLessThan(0.15);
  });

  it('formants (parallèle) : pic à la fréquence demandée', () => {
    const y = D.formantBank(D.noise(SR, 'white', 9), SR, { vowels: [[1200, 2500, 3200, 3800]], gains: [1, 0, 0, 0], mode: 'parallel' });
    expect(Math.abs(spectralPeak(y, SR, 300, 2000) - 1200) / 1200).toBeLessThan(0.05);
  });

  it('formants : le fondamental passe dans la cascade (gain unité au grave)', () => {
    const g = D.glottalSource(SR, SR, { f0: 70 }).signal;
    const y = D.formantBank(g, SR, { vowels: ['o'] });
    expect(Math.abs(spectralPeak(y, SR, 40, 1000) - 70)).toBeLessThan(5);
  });

  it('mode modal : amplitude divisée par e au bout de la constante de temps (±10 %)', () => {
    const x = D.modal(SR, SR, [{ f: 300, gain: 1, decay: 0.05 }]);
    const w = Math.round(SR / 300) * 4;
    const a0 = peak(x.subarray(0, w));
    const a1 = peak(x.subarray(Math.round(0.05 * SR), Math.round(0.05 * SR) + w));
    expect(a1 / a0).toBeGreaterThan(Math.exp(-1) * 0.85);
    expect(a1 / a0).toBeLessThan(Math.exp(-1) * 1.15);
  });

  it('résonateur : une impulsion fait sonner le mode à sa fréquence (±2 %)', () => {
    const ex = new Float64Array(SR);
    ex[0] = 1;
    expect(Math.abs(spectralPeak(D.resonate(ex, SR, [{ f: 523, decay: 0.2 }]), SR) - 523) / 523).toBeLessThan(0.02);
  });

  it('réverbération courte : queue présente au quart du temps, sous −40 dB au double du temps', () => {
    const x = new Float64Array(SR / 2);
    x[0] = 1;
    const y = D.shortReverb(x, SR, { time: 0.08, mix: 1 });
    const lvl = (t) => dbfs(rms(y.subarray(Math.round(t * SR), Math.round(t * SR) + 220)));
    const ref = dbfs(rms(y.subarray(1, 221)));
    expect(lvl(0.02) - ref).toBeGreaterThan(-40);
    expect(lvl(0.16) - ref).toBeLessThan(-40);
  });

  it('réverbération : mix nul, son inchangé', () => {
    const x = sine(300, 1000);
    expect(D.shortReverb(x, SR, { mix: 0 })).toEqual(x);
  });
});

describe('traitements', () => {
  it('fondus : premier et dernier échantillon nuls (< 0,002)', () => {
    const y = D.fadeEdges(sine(440, 4000, 0.9), SR);
    expect(Math.abs(y[0])).toBeLessThan(0.002);
    expect(Math.abs(y[y.length - 1])).toBeLessThan(0.002);
  });

  it('normalisation : crête cible', () => {
    expect(peak(D.normalize(sine(200, 3000, 0.1), 0.7))).toBeCloseTo(0.7, 9);
  });

  it('retrait du décalage continu : moyenne quasi nulle', () => {
    const x = Float64Array.from(sine(200, SR), (v) => v + 0.3);
    expect(Math.abs(dcOffset(D.removeDc(x, SR)))).toBeLessThan(1e-9);
  });

  it('saturation douce bornée à 1 (même au-delà de ±1 en entrée), ±1 -> ±1, monotone', () => {
    const y = D.softClip(Float64Array.from({ length: 101 }, (_, i) => (i - 50) / 10), 3);
    expect(D.softClip([1, -1], 3)[0]).toBeCloseTo(1, 12);
    expect(Math.max(...y.map(Math.abs))).toBeLessThanOrEqual(1);
    for (let i = 1; i < y.length; i += 1) expect(y[i]).toBeGreaterThanOrEqual(y[i - 1]);
  });

  it('étirement et changement de hauteur : longueurs attendues', () => {
    expect(D.stretch(sine(100, 1000), 1.5).length).toBe(1500);
    expect(D.pitchShift(sine(100, 1000), 2).length).toBe(1000);
  });

  it('mixage : couches décalées et pondérées', () => {
    const one = Float64Array.from([1, 1]);
    const m = D.mixLayers(5, [{ buf: one, gain: 2, offset: 1 }, { buf: one, gain: 1, offset: 4 }]);
    expect(Array.from(m)).toEqual([0, 2, 2, 0, 1]);
  });

  it('bouclage : longueur demandée, tête fondue avec la queue', () => {
    const x = sine(100, 3000);
    expect(D.loopCrossfade(x, 2000, 500).length).toBe(2000);
  });

  it('toFloat32 : bornes ±0,98, NaN -> 0', () => {
    expect(Array.from(D.toFloat32([2, -2, Number.NaN, 0.5]))).toEqual([0.98, -0.98, 0, 0.5].map((v) => Math.fround(v)));
  });
});

describe('rendu de chaque famille', () => {
  const kinds = Object.keys(KINDS);
  it('chaque famille du moteur a une recette d\'essai', () => {
    expect(kinds.sort()).toEqual(Object.keys(RECIPES).sort());
  });

  it.each(kinds)('%s : déterministe octet pour octet', (k) => {
    const a = render(RECIPES[k], {}, 3, SR);
    const b = render(RECIPES[k], {}, 3, SR);
    expect(Buffer.from(a.buffer).equals(Buffer.from(b.buffer))).toBe(true);
    expect(Buffer.from(render(RECIPES[k], {}, 4, SR).buffer).equals(Buffer.from(a.buffer))).toBe(false);
  });

  it.each(kinds)('%s : ni NaN, crête ≤ 0,98 (et ≤ −3 dBFS), décalage continu < 1 % de la crête, bouts < 0,002, durée exacte', (k) => {
    const x = render(RECIPES[k], {}, 1, SR);
    expect(x).toBeInstanceOf(Float32Array);
    expect(x.every(Number.isFinite)).toBe(true);
    const p = peak(x);
    expect(p).toBeGreaterThan(0);
    expect(p).toBeLessThanOrEqual(0.98);
    expect(dbfs(p)).toBeLessThanOrEqual(-3);
    expect(Math.abs(dcOffset(x))).toBeLessThan(0.01 * p);
    expect(edgeClicks(x).click).toBe(false);
    expect(Math.abs(x.length - RECIPES[k].dur * SR)).toBeLessThanOrEqual(1);
  });

  it('niveau court cible atteint quand la crête le permet (±0,5 dB)', () => {
    const x = render(RECIPES.voice, { levelDb: -20 }, 1, SR);
    expect(Math.abs(dbfs(shortLevel(x, SR)) + 20)).toBeLessThan(0.5);
  });

  it('hauteur plus basse (pitch 0,8) : fondamentale plus basse d\'une voix', () => {
    const base = estimateF0(render(RECIPES.voice, {}, 1, SR), SR, 40, 400);
    const low = estimateF0(render(RECIPES.voice, { pitch: 0.8 }, 1, SR), SR, 40, 400);
    expect(low).toBeLessThan(base * 0.9);
  });

  it('autre fréquence d\'échantillonnage (44 100 Hz) : durée respectée', () => {
    expect(render(RECIPES.step, {}, 1, 44100).length).toBe(Math.round(0.15 * 44100));
  });

  it('famille inconnue ou recette absente : silence de la bonne durée, sans exception', () => {
    expect(render({ kind: 'inconnu', dur: 0.1 }, {}, 1, SR).every((v) => v === 0)).toBe(true);
    expect(render({ kind: 'inconnu', dur: 0.1 }, {}, 1, SR).length).toBe(Math.round(0.1 * SR));
    expect(() => render(null, null, null, null)).not.toThrow();
    expect(() => render('x', 'y', 'z', 'w')).not.toThrow();
  });

  it('paramètres hostiles : bornés, jamais de NaN', () => {
    for (const p of [{ pitch: Number.NaN }, { pitch: 1e9, bright: -4 }, { durMul: 1e9 }, { durSec: -1 }, { room: 99, grain: -3 }, { levelDb: 50, peakDb: 10 }]) {
      const x = render(RECIPES.tear, p, 1, SR);
      expect(x.every(Number.isFinite)).toBe(true);
      expect(peak(x)).toBeLessThanOrEqual(0.98);
    }
  });

  it('la recette n\'est jamais modifiée (recette gelée acceptée)', () => {
    const deepFreeze = (o) => {
      Object.values(o).forEach((v) => v && typeof v === 'object' && deepFreeze(v));
      return Object.freeze(o);
    };
    const r = deepFreeze(JSON.parse(JSON.stringify(RECIPES.voice)));
    expect(() => render(r, { pitch: 0.9 }, 2, SR)).not.toThrow();
  });
});

describe('séquence de réparation', () => {
  it.each([[0.4, 2], [0.8, 3], [1.2, 4], [1.8, 5]])('%s s -> %i coups (nombre croissant avec la durée)', (d, n) => {
    expect(repairSequence(d, 1).count).toBe(n);
    expect(repairSequence(d, 1).hits.length).toBe(n);
  });

  it('espacements irréguliers bornés à ±15 % autour de l\'espacement de base, jamais tous égaux', () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const s = repairSequence(1.8, seed);
      const base = s.spacings.reduce((a, b) => a + b, 0) / s.spacings.length;
      for (const g of s.spacings) expect(Math.abs(g / base - 1)).toBeLessThanOrEqual(0.15 + 1e-9);
      expect(new Set(s.spacings.map((g) => g.toFixed(6))).size).toBeGreaterThan(1);
    }
  });

  it('durée totale respectée à ±5 % ; dernier coup plus sec ; amorce de raclement au début', () => {
    for (const d of [0.4, 0.8, 1.2, 1.8]) {
      const s = repairSequence(d, 7);
      expect(Math.abs(s.end - d) / d).toBeLessThanOrEqual(0.05);
      expect(s.hits[s.hits.length - 1].dry).toBe(true);
      expect(s.hits.slice(0, -1).every((h) => h.dry === false)).toBe(true);
      expect(s.scrape.t).toBe(0);
      expect(s.hits[0].t).toBeGreaterThan(0);
    }
  });

  it('déterministe et sans exception sur une durée hostile', () => {
    expect(repairSequence(1.2, 3)).toEqual(repairSequence(1.2, 3));
    for (const d of [Number.NaN, -1, 0, 1e9, 'x']) expect(() => repairSequence(d, 'y')).not.toThrow();
  });

  it('le rendu d\'une réparation dure exactement la durée demandée (±1 échantillon)', () => {
    for (const d of [0.4, 1.8]) expect(Math.abs(render(RECIPES.repair, { durSec: d }, 1, SR).length - d * SR)).toBeLessThanOrEqual(1);
  });
});

describe('macros, résolution, versions', () => {
  const slot = atelier.slots.find((s) => s.id === 'pas-joueur-dur');
  const variant = slot.variants[0];

  it('format du jeu : Float32, mono, 22 050 Hz, 4 octets par échantillon', () => {
    const r = renderVariant(slot, 'A', {}, 1);
    expect(r.samples).toBeInstanceOf(Float32Array);
    expect([r.sampleRate, FORMAT.channels, r.bytes]).toEqual([22050, 1, r.samples.length * 4]);
  });

  it('macroValues borne les valeurs et remplace l\'absent ou l\'invalide par la valeur par défaut', () => {
    const v = macroValues(variant, { hauteur: 99, matiere: Number.NaN, grain: -5 });
    expect(v.hauteur).toBe(variant.macros.hauteur.max);
    expect(v.matiere).toBe(variant.macros.matiere.default);
    expect(v.grain).toBe(variant.macros.grain.min);
    expect(v.duree).toBe(variant.macros.duree.default);
  });

  it('macroParams : demi-tons -> facteur de hauteur, octaves -> brillance, durée en secondes pour la réparation', () => {
    expect(macroParams(variant, { hauteur: 6, matiere: -1 })).toMatchObject({ pitch: Math.SQRT2, bright: 0.5 });
    expect(macroParams(variant, { hauteur: 12 }).pitch).toBe(Math.SQRT2); // bornée à +6 demi-tons
    const rep = atelier.slots.find((s) => s.id === 'reparation').variants[0];
    expect(macroParams(rep, { duree: 0.8 }).durSec).toBe(0.8);
    expect(renderDuration({ dur: 0.2 }, { durMul: 2 })).toBeCloseTo(0.4, 10);
  });

  it('resolveRecipe : préréglages (use) fusionnés, facteurs (scale) multipliés, sous-recettes résolues, préréglages intacts', () => {
    const presets = Object.freeze({ a: Object.freeze({ kind: 'voice', f0: 100, rough: Object.freeze({ depth: 0.2 }), scale: Object.freeze({ f0: 0.5 }) }), b: Object.freeze({ dur: 1 }) });
    const r = resolveRecipe({ use: ['a', 'b'], dur: 2, scale: { 'rough.depth': 2 }, sub: { use: ['b'] } }, presets);
    expect(r).toEqual({ kind: 'voice', f0: 50, rough: { depth: 0.4 }, dur: 2, sub: { dur: 1 } });
    expect(presets.a.f0).toBe(100);
  });

  it('deepMerge : objets fusionnés, tableaux remplacés', () => {
    expect(deepMerge({ a: { b: 1, c: [1, 2] } }, { a: { c: [3] } })).toEqual({ a: { b: 1, c: [3] } });
  });

  it('nextVersion : jamais deux fois la même version d\'affilée, les cinq versions sortent', () => {
    let state = {};
    let last = null;
    const seen = new Set();
    for (let i = 0; i < 500; i += 1) {
      const r = nextVersion(state, 'pas', VERSIONS);
      expect(r.version).not.toBe(last);
      expect(r.version >= 1 && r.version <= VERSIONS).toBe(true);
      seen.add(r.version);
      last = r.version;
      state = r.state;
    }
    expect(seen.size).toBe(5);
  });

  it('nextVersion : mémoire par clé, état d\'origine intact', () => {
    const s0 = Object.freeze({ rng: 3, last: Object.freeze({ voix: 2 }) });
    const r = nextVersion(s0, 'voix');
    expect(r.version).not.toBe(2);
    expect(s0.last.voix).toBe(2);
    expect(nextVersion(null, null, 'x').version).toBeGreaterThanOrEqual(1);
  });

  it('renderVariant : variante inconnue -> tampon vide, sans exception', () => {
    expect(renderVariant(slot, 'Z').samples.length).toBe(0);
    expect(() => renderVariant(null, null, null, null)).not.toThrow();
  });
});
