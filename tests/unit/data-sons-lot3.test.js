import { describe, it, expect } from 'vitest';
import { renderSound, soundBytes, variantCount } from '../../js/core/synth.js';
import { centroid, maxCorrelation, mean, peakOf, rmsOf, toDb } from './helpers/dsp.js';
import { synthRecipes } from './helpers/sons-synth.js';
import { attackTime, onsets, spectralCentroid } from '../../js/core/audio-analysis.js';
import { renderChoice } from '../../js/core/sound-render.js';
import { readFileSync } from 'node:fs';

// Lot 3i : recettes de synth.js ; lot 5e : celles du pack par défaut seulement (le pack d'avant, sounds-legacy.json, est retiré). Les planches
// (planche-arrachee, planche-posee) sont des sons de l'atelier depuis le lot 3i : leurs anciennes recettes sortent de ces mesures, et leurs
// propriétés sont vérifiées sur les sons livrés (dernière section, bornes de tests/unit/helpers/references-sons.json).
const sounds = synthRecipes();
const NEW_IDS = ['joueur-chute', 'joueur-releve'];
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

describe('sons du lot 3 : présence et recettes', () => {
  it('les recettes de synth.js du lot 3 existent, avec les variantes, ensembles et catégories de la spécification', () => {
    const spec = { 'joueur-chute': ['joueur', 'essentiel', 2], 'joueur-releve': ['joueur', 'fond', 2] }; // lot 5e : planches = sons de l'atelier
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
  // Lot 5e (décision du propriétaire) : retirés avec l'ancien pack, propres aux anciennes recettes synth.js des planches (8 assertions) :
  // planche arrachée « attaque en moins de 6 ms » et « centre de gravité 300 à 3 000 Hz » ; planche posée « 2 à 3 coups séparés d'au moins
  // 80 ms » et « coups espacés de 110 à 150 ms ». Remplacés par les mesures des planches livrées (section suivante).
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

// Lot 5e (condition du propriétaire) : planches du pack par défaut (moteur de l'atelier, toutes les graines), bornes mesurées par
// js/core/audio-analysis.js et élargies de 15 % de la largeur de la plage au plus (tests/unit/helpers/references-sons.json). Le nombre de coups
// de la planche posée est déjà vérifié par sons-integres-ambiances.test.js (« réparation à durée variable ») : non dupliqué.
describe('planches livrées (atelier) : attaque, coups et centre de gravité', () => {
  const table = JSON.parse(readFileSync('data/game/sounds.json', 'utf8')).sounds;
  const seeds = (id) => Array.from({ length: table.find((s) => s.id === id).variants }, (_, k) => [`${id}-${k + 1}`, renderChoice(table.find((s) => s.id === id), { seed: k + 1 })]);
  const P = JSON.parse(readFileSync('tests/unit/helpers/references-sons.json', 'utf8')).planches;
  it.each(seeds('planche-arrachee'))('%s : attaque (90 % du pic) et centre de gravité dans les bornes mesurées', (_n, r) => {
    const a = attackTime(r.samples, r.sampleRate) * 1000;
    expect(a).toBeGreaterThanOrEqual(P['planche-arrachee'].attaqueMs.bornes[0]);
    expect(a).toBeLessThanOrEqual(P['planche-arrachee'].attaqueMs.bornes[1]);
    const c = spectralCentroid(r.samples, r.sampleRate);
    expect(c).toBeGreaterThanOrEqual(P['planche-arrachee'].centreDeGraviteHz.bornes[0]);
    expect(c).toBeLessThanOrEqual(P['planche-arrachee'].centreDeGraviteHz.bornes[1]);
  });
  it.each(seeds('planche-posee'))('%s : espacement des coups de marteau et centre de gravité dans les bornes mesurées', (_n, r) => {
    const o = onsets(r.samples, r.sampleRate, { threshold: 0.3, minGap: 0.15 });
    for (let i = 1; i < o.length; i += 1) {
      expect((o[i] - o[i - 1]) * 1000).toBeGreaterThanOrEqual(P['planche-posee'].ecartEntreCoupsMs.bornes[0]);
      expect((o[i] - o[i - 1]) * 1000).toBeLessThanOrEqual(P['planche-posee'].ecartEntreCoupsMs.bornes[1]);
    }
    const c = spectralCentroid(r.samples, r.sampleRate);
    expect(c).toBeGreaterThanOrEqual(P['planche-posee'].centreDeGraviteHz.bornes[0]);
    expect(c).toBeLessThanOrEqual(P['planche-posee'].centreDeGraviteHz.bornes[1]);
  });
});
