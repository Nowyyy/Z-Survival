import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { renderSound, soundBytes, variantCount } from '../../js/core/synth.js';
import { attackTime, centroid, maxCorrelation, mean, peakOf, rmsOf, toDb } from './helpers/dsp.js';

const { sounds } = JSON.parse(readFileSync('data/game/sounds.json', 'utf8'));
const NEW_IDS = ['planche-arrachee', 'planche-posee', 'joueur-chute', 'joueur-releve'];
const recipe = (id) => sounds.find((s) => s.id === id);
const rendered = [];
const timing = {};
for (const id of NEW_IDS) {
  for (let v = 0; v < variantCount(recipe(id)); v += 1) {
    const t0 = performance.now();
    const result = renderSound(recipe(id), v);
    timing[id] = (timing[id] ?? 0) + performance.now() - t0;
    rendered.push({ id, v, name: `${id}-${v + 1}`, result });
  }
}
const of = (id) => rendered.filter((r) => r.id === id);
const each = (ids = NEW_IDS) => rendered.filter((r) => ids.includes(r.id)).map((r) => [r.name, r]);

// Fenêtres de mesure (justifiées).
// Niveau efficace après normalisation du pic à 0,8-0,85 (-1,9 à -1,4 dBFS) : un son de planche est impulsif (facteur de crête de 12 à 22 dB)
// avec une traîne de pièce : -30 à -10 dBFS laisse de la marge sans accepter un son quasi muet ni un son plat. Même fenêtre pour la chute et
// le relevage (sons plus tenus, facteur de crête de 12 à 18 dB), à l'intérieur de celle de la catégorie « joueur » (-22 à -8).
const RMS_WINDOW = [-30, -10];
const DURATION = { 'planche-arrachee': [0.4, 0.6], 'planche-posee': [0.35, 0.55], 'joueur-chute': [1.0, 1.5], 'joueur-releve': [0.6, 1.0] };

// Pics de l'enveloppe (fenêtres de 5 ms) au-dessus de ratio × le maximum, deux pics à moins de minGap secondes étant fondus en un seul.
function separatedPeaks(samples, rate, minGap = 0.08, ratio = 0.4) {
  const w = Math.round(rate * 0.005);
  const env = [];
  for (let i = 0; i + w <= samples.length; i += w) env.push(rmsOf(samples, i, i + w));
  const top = Math.max(...env);
  const found = [];
  for (let i = 0; i < env.length; i += 1) {
    if (env[i] < ratio * top || (i > 0 && env[i] < env[i - 1]) || (i < env.length - 1 && env[i] <= env[i + 1])) continue;
    const t = (i * w) / rate;
    const last = found.at(-1);
    if (last && t - last.t < minGap) {
      if (env[i] > last.e) found[found.length - 1] = { t, e: env[i] };
    } else found.push({ t, e: env[i] });
  }
  return found.map((p) => p.t);
}

describe('sons du lot 3 : présence et recettes', () => {
  it('les quatre recettes existent, avec les variantes, ensembles et catégories de la spécification', () => {
    const spec = { 'planche-arrachee': ['fenetre', 'essentiel', 3], 'planche-posee': ['fenetre', 'essentiel', 3], 'joueur-chute': ['joueur', 'essentiel', 2], 'joueur-releve': ['joueur', 'fond', 2] };
    for (const [id, [category, set, variants]] of Object.entries(spec)) {
      expect([recipe(id).category, recipe(id).set, variantCount(recipe(id))], id).toEqual([category, set, variants]);
    }
  });

  it('tampons à 22 050 Hz, jamais de fichier : tout est calculé par synth.js', () => {
    for (const id of NEW_IDS) expect(recipe(id).sampleRate, id).toBe(22050);
  });

  it('fenetre-escalade n\'existe pas : l\'escalade n\'a pas de son propre', () => {
    expect(sounds.some((s) => s.id.includes('escalade'))).toBe(false);
  });

  it('mémoire des nouveaux sons et temps de rendu en Node (rapportés)', () => {
    const bytes = rendered.reduce((sum, r) => sum + soundBytes(r.result), 0);
    console.info(`sons du lot 3 : ${(bytes / 1048576).toFixed(2)} Mo, rendu ${Object.entries(timing).map(([id, ms]) => `${id} ${ms.toFixed(0)} ms`).join(', ')}`);
    expect(bytes).toBeLessThan(1.5 * 1048576);
  });
});

describe('sons du lot 3 : mesures de chaque variante', () => {
  it.each(each())('%s : aucun avertissement, échantillons finis, pic ≤ 0,98', (_n, { result }) => {
    expect(result.warnings).toEqual([]);
    expect(result.samples.every(Number.isFinite)).toBe(true);
    expect(peakOf(result.samples)).toBeLessThanOrEqual(0.98);
    expect(result.peak).toBeGreaterThan(0.1);
  });

  it.each(each())('%s : décalage continu moyen inférieur à 0,01', (_n, { result }) => {
    expect(Math.abs(mean(result.samples))).toBeLessThan(0.01);
  });

  it.each(each())('%s : début et fin à moins de 0,005', (_n, { result }) => {
    expect(Math.abs(result.samples[0])).toBeLessThan(0.005);
    expect(Math.abs(result.samples.at(-1))).toBeLessThan(0.005);
  });

  it.each(each())('%s : durée dans les bornes du son', (_n, { id, result }) => {
    const seconds = result.samples.length / result.sampleRate;
    expect(seconds).toBeGreaterThanOrEqual(DURATION[id][0]);
    expect(seconds).toBeLessThanOrEqual(DURATION[id][1]);
  });

  it.each(each())('%s : niveau efficace entre -30 et -10 dBFS', (_n, { result }) => {
    const level = toDb(rmsOf(result.samples));
    expect(level).toBeGreaterThanOrEqual(RMS_WINDOW[0]);
    expect(level).toBeLessThanOrEqual(RMS_WINDOW[1]);
  });

  it.each(NEW_IDS)('%s : les variantes ont des niveaux proches (≤ 3 dB) et sont distinctes (corrélation < 0,9)', (id) => {
    const list = of(id);
    const levels = list.map((r) => toDb(rmsOf(r.result.samples)));
    expect(Math.max(...levels) - Math.min(...levels)).toBeLessThanOrEqual(3);
    for (let a = 0; a < list.length; a += 1) for (let b = a + 1; b < list.length; b += 1) expect(maxCorrelation(list[a].result.samples, list[b].result.samples)).toBeLessThan(0.9);
  });
});

describe('sons du lot 3 : mesures propres à chaque son', () => {
  it.each(each(['planche-arrachee']))('%s : attaque (90 % du pic) en moins de 6 ms', (_n, { result }) => {
    expect(attackTime(result.samples, result.sampleRate)).toBeLessThan(0.006);
  });

  it.each(each(['planche-arrachee']))('%s : centre de gravité entre 300 et 3 000 Hz', (_n, { result }) => {
    const size = 2 ** Math.floor(Math.log2(result.samples.length));
    const c = centroid(result.samples, result.sampleRate, 0, Math.min(size, 16384));
    expect(c).toBeGreaterThanOrEqual(300);
    expect(c).toBeLessThanOrEqual(3000);
  });

  it.each(each(['planche-posee']))('%s : 2 à 3 coups de marteau séparés d\'au moins 80 ms', (_n, { result }) => {
    const peaks = separatedPeaks(result.samples, result.sampleRate);
    expect(peaks.length).toBeGreaterThanOrEqual(2);
    expect(peaks.length).toBeLessThanOrEqual(3);
    for (let i = 1; i < peaks.length; i += 1) expect(peaks[i] - peaks[i - 1]).toBeGreaterThanOrEqual(0.08);
  });

  it.each(each(['planche-posee']))('%s : les coups sont espacés de 110 à 150 ms (tolérance de la gigue)', (_n, { result }) => {
    const peaks = separatedPeaks(result.samples, result.sampleRate);
    for (let i = 1; i < peaks.length; i += 1) {
      expect(peaks[i] - peaks[i - 1]).toBeGreaterThanOrEqual(0.1);
      expect(peaks[i] - peaks[i - 1]).toBeLessThanOrEqual(0.18);
    }
  });

  it.each(each(['joueur-chute']))('%s : pic dans les 80 premières millisecondes, durée de 1,0 à 1,5 s', (_n, { result }) => {
    const first = peakOf(result.samples.subarray(0, Math.round(result.sampleRate * 0.08)));
    expect(first).toBeGreaterThanOrEqual(0.95 * result.peak);
    expect(result.samples.length / result.sampleRate).toBeGreaterThanOrEqual(1.0);
    expect(result.samples.length / result.sampleRate).toBeLessThanOrEqual(1.5);
  });

  it.each(each(['joueur-chute']))('%s : sourd (centre de gravité sous 400 Hz, dominé par le coup au sol)', (_n, { result }) => {
    expect(centroid(result.samples, result.sampleRate, 0, 8192)).toBeLessThan(400);
  });

  it.each(each(['joueur-releve']))('%s : durée de 0,6 à 1,0 s, inspiration qui monte puis un pas lourd en fin de son', (_n, { result }) => {
    const rate = result.sampleRate;
    expect(result.samples.length / rate).toBeGreaterThanOrEqual(0.6);
    expect(result.samples.length / rate).toBeLessThanOrEqual(1.0);
    const early = rmsOf(result.samples, 0, Math.round(rate * 0.15));
    const late = rmsOf(result.samples, Math.round(rate * 0.3), Math.round(rate * 0.5));
    expect(late).toBeGreaterThan(early * 2); // « bruit rose montant »
    expect(peakOf(result.samples.subarray(Math.round(rate * 0.52)))).toBeGreaterThan(0.5 * result.peak); // le pas lourd
  });
});
