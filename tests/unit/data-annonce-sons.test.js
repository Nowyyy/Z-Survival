import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { renderSound, soundBytes, variantCount } from '../../js/core/synth.js';
import { centroid, maxCorrelation, mean, peakOf, rmsOf, toDb } from './helpers/dsp.js';

// Sons d'annonce du lot 2c : vague-annonce, vague-renforcee, vague-fin (catégorie « annonce »). Mesures comme au lot 1d, plus celles du repère.
const { sounds } = JSON.parse(readFileSync('data/game/sounds.json', 'utf8'));
const IDS = ['vague-annonce', 'vague-renforcee', 'vague-fin'];
const recipes = IDS.map((id) => sounds.find((s) => s.id === id));
const rendered = recipes.flatMap((recipe) => Array.from({ length: variantCount(recipe) }, (_, v) => ({ name: `${recipe.id}-${v + 1}`, recipe, result: renderSound(recipe, v) })));
const each = (filter = () => true) => rendered.filter(filter).map((r) => [r.name, r]);
const withSting = (r) => typeof r.recipe.markers?.sting === 'number';

// Fenêtres de mesure (justifiées) :
// - niveau efficace -30 à -12 dBFS : sons longs à montée progressive et impact bref, normalisés à un pic de 0,5 à 0,8 ; la crête d'un impact
//   est 12 à 18 dB au-dessus du corps du son ; la fenêtre refuse un son quasi muet (< -30) comme un son écrasé par la saturation (> -12) ;
// - durée : celle de la recette (3,8 ; 4,2 ; 1,4 s) ;
// - centre de gravité : sur la première puissance de deux d'échantillons du son (2^16 à 22 050 Hz, soit 2,97 s pour les annonces ; 2^14, soit
//   0,74 s, pour la fin), de 150 à 2 500 Hz : le bourdon grave (55 Hz) et les cloches (de 220 Hz à 2 kHz) y pèsent ensemble, un « boum » seul
//   serait sous 150 Hz et un sifflement seul au-dessus de 2 500 Hz ;
// - repère « sting » à 3,0 s : le maximum absolu est à ±150 ms du repère (l'impact est le point culminant), le niveau des 300 ms de fin est
//   inférieur à 40 % de celui des 300 ms qui suivent le repère (la fin s'éteint), les 100 premières ms sont à moins de 0,25 (montée progressive).
const RMS = [-30, -12];
const CENTROID = [150, 2500];
const DURATION = { 'vague-annonce': 3.8, 'vague-renforcee': 4.2, 'vague-fin': 1.4 };
const at = (r, sec) => Math.round(sec * r.result.sampleRate);

describe('sons d\'annonce : mesures de chaque variante', () => {
  it('trois recettes, catégorie annonce, 3 + 2 + 2 variantes, 22 050 Hz, ensembles essentiel / fond / fond', () => {
    expect(recipes.every(Boolean)).toBe(true);
    expect(recipes.map((r) => r.category)).toEqual(['annonce', 'annonce', 'annonce']);
    expect(recipes.map(variantCount)).toEqual([3, 2, 2]);
    expect(recipes.map((r) => r.sampleRate)).toEqual([22050, 22050, 22050]);
    expect(recipes.map((r) => r.set)).toEqual(['essentiel', 'fond', 'fond']);
    expect(rendered).toHaveLength(7);
  });

  it('repères : sting à 3,0 s pour l\'annonce et l\'annonce renforcée, aucun pour la fin', () => {
    expect(recipes.map((r) => r.markers?.sting)).toEqual([3, 3, undefined]);
  });

  it.each(each())('%s : aucun avertissement, échantillons finis, pic ≤ 0,98', (_n, { result }) => {
    expect(result.warnings).toEqual([]);
    expect(result.samples.every(Number.isFinite)).toBe(true);
    expect(peakOf(result.samples)).toBeLessThanOrEqual(0.98);
    expect(result.peak).toBeGreaterThan(0.3);
  });

  it.each(each())('%s : décalage continu moyen inférieur à 0,01', (_n, { result }) => {
    expect(Math.abs(mean(result.samples))).toBeLessThan(0.01);
  });

  it.each(each())('%s : début et fin à moins de 0,005', (_n, { result }) => {
    expect(Math.abs(result.samples[0])).toBeLessThan(0.005);
    expect(Math.abs(result.samples.at(-1))).toBeLessThan(0.005);
  });

  it.each(each())('%s : durée égale à celle de la recette (3,8 ; 4,2 ; 1,4 s)', (_n, { recipe, result }) => {
    expect(result.samples.length / result.sampleRate).toBeCloseTo(DURATION[recipe.id], 3);
    expect(result.samples.length).toBe(Math.round(recipe.duration * recipe.sampleRate));
  });

  it.each(each())('%s : niveau efficace entre -30 et -12 dBFS', (_n, { result }) => {
    const level = toDb(rmsOf(result.samples));
    expect(level).toBeGreaterThanOrEqual(RMS[0]);
    expect(level).toBeLessThanOrEqual(RMS[1]);
  });

  it.each(each())('%s : centre de gravité spectral entre 150 et 2 500 Hz', (_n, { result }) => {
    const size = 2 ** Math.floor(Math.log2(result.samples.length));
    const c = centroid(result.samples, result.sampleRate, 0, size);
    expect(c).toBeGreaterThanOrEqual(CENTROID[0]);
    expect(c).toBeLessThanOrEqual(CENTROID[1]);
  });

  it.each(IDS.filter((id) => variantCount(sounds.find((s) => s.id === id)) > 1))('%s : variantes distinctes (corrélation maximale < 0,9)', (id) => {
    const list = rendered.filter((r) => r.recipe.id === id);
    for (let a = 0; a < list.length; a += 1) for (let b = a + 1; b < list.length; b += 1) expect(maxCorrelation(list[a].result.samples, list[b].result.samples), `${a}-${b}`).toBeLessThan(0.9);
  });

  it.each(IDS)('%s : les variantes ont des niveaux proches (écart ≤ 3 dB)', (id) => {
    const levels = rendered.filter((r) => r.recipe.id === id).map((r) => toDb(rmsOf(r.result.samples)));
    expect(Math.max(...levels) - Math.min(...levels)).toBeLessThanOrEqual(3);
  });
});

describe('sons d\'annonce : montée, repère et extinction (annonce et annonce renforcée)', () => {
  it.each(each(withSting))('%s : montée progressive, pic des 100 premières ms ≤ 0,25', (_n, r) => {
    expect(peakOf(r.result.samples.subarray(0, at(r, 0.1)))).toBeLessThanOrEqual(0.25);
  });

  it.each(each(withSting))('%s : la plus grande valeur absolue tombe à ±150 ms du repère sting', (_n, r) => {
    let imax = 0;
    for (let i = 0; i < r.result.samples.length; i += 1) if (Math.abs(r.result.samples[i]) > Math.abs(r.result.samples[imax])) imax = i;
    const t = imax / r.result.sampleRate;
    expect(Math.abs(t - r.recipe.markers.sting)).toBeLessThanOrEqual(0.15);
  });

  it.each(each(withSting))('%s : le niveau des 300 ms de fin est inférieur à 40 % de celui des 300 ms suivant le repère', (_n, r) => {
    const s = r.result.samples;
    const after = rmsOf(s, at(r, r.recipe.markers.sting), at(r, r.recipe.markers.sting + 0.3));
    const tail = rmsOf(s, s.length - at(r, 0.3), s.length);
    expect(tail).toBeLessThan(0.4 * after);
  });

  it.each(each(withSting))('%s : le souffle et le bourdon montent avant le repère (les 300 ms avant sting plus fortes que les 300 premières ms)', (_n, r) => {
    const s = r.result.samples;
    const early = rmsOf(s, 0, at(r, 0.3));
    const before = rmsOf(s, at(r, r.recipe.markers.sting - 0.3), at(r, r.recipe.markers.sting));
    expect(before).toBeGreaterThan(3 * early);
  });

  it.each(each(withSting))('%s : l\'impact domine : pic du repère au moins 1,2 fois le pic des 2,5 premières secondes', (_n, r) => {
    const s = r.result.samples;
    const sting = peakOf(s.subarray(at(r, r.recipe.markers.sting - 0.05), at(r, r.recipe.markers.sting + 0.15)));
    expect(sting).toBeGreaterThan(1.2 * peakOf(s.subarray(0, at(r, 2.5))));
  });

  it('vague-renforcee : battement de cœur (deux coups sourds toutes les 0,9 s avant le repère), puis impact doublé à 3,0 et 3,25 s', () => {
    const osc = recipes[1].layers.filter((l) => l.type === 'osc' && l.wave === 'sine');
    const beats = osc.filter((l) => l.start < 3).map((l) => l.start);
    expect(beats).toEqual([0.3, 0.58, 1.2, 1.48, 2.1, 2.38]);
    expect(beats[2] - beats[0]).toBeCloseTo(0.9, 9);
    expect(beats[4] - beats[2]).toBeCloseTo(0.9, 9);
    for (const l of osc.filter((x) => x.start < 3)) expect(l.gain).toBeLessThan(osc.find((x) => x.start === 3).gain);
    expect(osc.filter((l) => l.start >= 3).map((l) => l.start)).toEqual([3, 3.25]);
  });

  it('vague-renforcee : bourdon plus grave que celui de l\'annonce (41 Hz contre 55 Hz)', () => {
    const drone = (i) => recipes[i].layers.find((l) => l.type === 'osc' && l.wave === 'saw').freq;
    expect([drone(0), drone(1)]).toEqual([55, 41]);
  });

  it('vague-annonce : deux scies à 55 et 55,8 Hz (battement de 0,8 Hz), passe-bas de 180 à 420 Hz, souffle de 200 à 2 500 Hz entre 0 et 3 s', () => {
    const saws = recipes[0].layers.filter((l) => l.type === 'osc' && l.wave === 'saw');
    expect(saws.map((l) => l.freq)).toEqual([55, 55.8]);
    expect(saws[1].freq - saws[0].freq).toBeCloseTo(0.8, 9);
    expect(saws[0].filter.freq).toEqual([180, 420]);
    const breath = recipes[0].layers.find((l) => l.type === 'noise');
    expect(breath).toMatchObject({ color: 'pink', start: 0, dur: 3, attack: 3, filter: { type: 'bandpass', freq: [200, 2500], sweep: 3 } });
  });

  it('vague-annonce : motif de 4 notes de cloche aux partiels inharmoniques (1 ; 2,76 ; 5,4 ; 8,9), désaccordées de ±15 centièmes', () => {
    const bells = recipes[0].layers.filter((l) => l.type === 'ring');
    expect(bells).toHaveLength(4);
    for (const b of bells) {
      const base = b.partials[0].freq;
      expect(b.partials.map((p) => Math.round((p.freq / base) * 100) / 100)).toEqual([1, 2.76, 5.4, 8.9]);
      expect(b.detune).toBeLessThanOrEqual(0.0087 + 1e-9); // 15 centièmes de ton
      expect(b.start).toBeLessThan(2.5);
    }
  });
});

describe('vague-fin : un bref soulagement', () => {
  const fin = each((r) => r.recipe.id === 'vague-fin');

  it.each(fin)('%s : pic dans les 250 premières ms', (_n, r) => {
    let imax = 0;
    for (let i = 0; i < r.result.samples.length; i += 1) if (Math.abs(r.result.samples[i]) > Math.abs(r.result.samples[imax])) imax = i;
    expect(imax / r.result.sampleRate).toBeLessThan(0.25);
  });

  it.each(fin)('%s : longue décroissance (les 300 dernières ms sous 15 % du niveau des 300 premières)', (_n, r) => {
    const s = r.result.samples;
    expect(rmsOf(s, s.length - at(r, 0.3), s.length)).toBeLessThan(0.15 * rmsOf(s, 0, at(r, 0.3)));
  });

  it('attaque de 30 ms, sans bourdon : aucune couche oscillateur ou bruit', () => {
    const recipe = recipes[2];
    expect(recipe.layers.every((l) => l.type === 'ring')).toBe(true);
    expect(recipe.layers.filter((l) => l.attack === 0.03).length).toBe(recipe.layers.length);
  });
});

describe('sons d\'annonce : mémoire', () => {
  it('mémoire audio des trois sons : environ 2 Mo (moins de 2,5 Mo)', () => {
    const bytes = rendered.reduce((sum, r) => sum + soundBytes(r.result), 0);
    console.info(`mémoire des sons d'annonce : ${(bytes / 1048576).toFixed(2)} Mo pour ${rendered.length} tampons`);
    expect(bytes).toBeLessThan(2.5 * 1048576);
  });
});
