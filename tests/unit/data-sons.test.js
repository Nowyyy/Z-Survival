import { describe, it, expect } from 'vitest';
import { execSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { renderSound, soundBytes, variantCount } from '../../js/core/synth.js';
import { attackTime, centroid, maxCorrelation, mean, medianPitch, peakOf, rmsOf, toDb } from './helpers/dsp.js';

const { sounds } = JSON.parse(readFileSync('data/game/sounds.json', 'utf8'));
const audio = JSON.parse(readFileSync('data/game/audio.json', 'utf8'));
const materials = JSON.parse(readFileSync('data/game/sound-materials.json', 'utf8'));
const world = JSON.parse(readFileSync('data/game/world.json', 'utf8'));
const variants = JSON.parse(readFileSync('data/game/zombie-variants.json', 'utf8'));
const fr = JSON.parse(readFileSync('data/i18n/fr.json', 'utf8'));

// Rendu de tous les sons, avec le temps de calcul de chaque ensemble (mesuré une fois, rapporté en fin de fichier).
const timing = { essentiel: 0, fond: 0 };
const rendered = [];
for (const recipe of sounds) {
  for (let v = 0; v < variantCount(recipe); v += 1) {
    const t0 = performance.now();
    const result = renderSound(recipe, v);
    timing[recipe.set] += performance.now() - t0;
    rendered.push({ name: `${recipe.id}-${v + 1}`, recipe, v, result });
  }
}
const byId = (id) => rendered.filter((r) => r.recipe.id === id);
const each = (filter = () => true) => rendered.filter(filter).map((r) => [r.name, r]);

// ---------- fenêtres de mesure (justifiées) ----------
// Niveau efficace en dBFS après normalisation du pic à 0,4 à 0,85 (-8 à -1,4 dBFS) : un son impulsif a un facteur de crête de 10 à 25 dB,
// un son tenu (voix, ambiance) de 8 à 14 dB. Les bornes laissent de la marge aux deux extrêmes sans accepter un son quasi muet.
// Tir : fenêtre haute à -8 dB, le tir est dense depuis le retour du propriétaire (« pas assez percutant »).
// Annonce (lot 2c) : sons longs et graves à montée progressive, facteur de crête de 12 à 18 dB sous un impact : -30 à -12 dBFS.
const RMS_WINDOW = { tir: [-28, -8], impact: [-30, -12], voix: [-26, -10], pas: [-32, -14], joueur: [-22, -8], interface: [-26, -12], ambiance: [-26, -14], annonce: [-30, -12] };
// Centre de gravité spectral (Hz). Tir et impact : mesuré sur les 512 premiers échantillons (11,6 ms à 44,1 kHz), un claquement a un
// transitoire large bande : plutôt aigu, au moins 500 Hz (un simple « boum » grave serait sous 250 Hz). Voix et joueur : sur tout le son,
// dominé par le premier formant (300 à 800 Hz) et la pente de la source : entre 150 et 1 500 Hz. Pas : de la bosse grave du zombie au
// claquement du talon sur le carrelage (100 à 6 000 Hz). Interface : sons tonals de 250 à 450 Hz (200 à 2 000 Hz). Ambiance : bruit
// grave (60 à 1 500 Hz).
const ATTACK_CENTROID = [500, 9000];
const FULL_CENTROID = { voix: [150, 1500], joueur: [150, 1500], pas: [100, 6000], interface: [200, 2000], ambiance: [60, 1500] };
// Durées attendues par identifiant (s), d'après le cahier des charges ; les autres sons : 0,1 à 1 s (hors ambiance).
const DURATION = { 'zombie-gemissement': [1.2, 2], 'zombie-grognement': [0.4, 0.8], 'zombie-plainte': [1.8, 3], 'zombie-mort': [1, 2], 'joueur-mort': [1, 1.5], ambiance: [4, 4], tir: [0.3, 1], 'vague-annonce': [3.8, 3.8], 'vague-renforcee': [4.2, 4.2], 'vague-fin': [1.4, 1.4] };
const NO_PITCH = new Set(['zombie-souffle']); // souffle rauque : dominé par le bruit, pas de hauteur mesurable

describe('mesures de chaque son (tous les sons, toutes les variantes)', () => {
  it('chaque son a au moins une variante et les nombres de variantes de la spécification', () => {
    const n = (id) => variantCount(sounds.find((s) => s.id === id));
    expect([n('tir'), n('douille'), n('impact-zombie'), n('impact-bois'), n('impact-metal'), n('impact-pierre'), n('impact-voiture'), n('pas'), n('pas-zombie')]).toEqual([3, 2, 3, 2, 2, 2, 2, 4, 2]);
    expect(n('joueur-blesse')).toBe(3);
    for (const id of ['zombie-gemissement', 'zombie-grognement', 'zombie-plainte', 'zombie-souffle', 'zombie-blessure', 'zombie-mort', 'zombie-attaque']) expect(n(id), id).toBeGreaterThanOrEqual(2);
    expect(sounds.find((s) => s.id === 'ambiance').sampleRate).toBe(22050);
  });

  it.each(each())('%s : aucun avertissement, échantillons finis, pic ≤ 0,98 (aucun écrêtage)', (_n, { result }) => {
    expect(result.warnings).toEqual([]);
    expect(result.samples.every(Number.isFinite)).toBe(true);
    expect(peakOf(result.samples)).toBeLessThanOrEqual(0.98);
    expect(result.peak).toBeGreaterThan(0.1);
    expect(result.peak).toBeLessThanOrEqual(0.98);
  });

  it.each(each())('%s : décalage continu moyen inférieur à 0,01', (_n, { result }) => {
    expect(Math.abs(mean(result.samples))).toBeLessThan(0.01);
  });

  it.each(each((r) => !r.recipe.loop))('%s : début et fin à moins de 0,005, dernière milliseconde silencieuse', (_n, { result }) => {
    expect(Math.abs(result.samples[0])).toBeLessThan(0.005);
    expect(Math.abs(result.samples.at(-1))).toBeLessThan(0.005);
    expect(peakOf(result.samples.subarray(-Math.round(result.sampleRate * 0.001)))).toBeLessThan(0.005);
  });

  it.each(each())('%s : durée égale à celle de la recette et dans les bornes du son', (_n, { recipe, result }) => {
    expect(result.samples.length).toBe(Math.round(recipe.duration * recipe.sampleRate));
    const [lo, hi] = DURATION[recipe.id] ?? [0.1, 1];
    expect(result.samples.length / result.sampleRate).toBeGreaterThanOrEqual(lo);
    expect(result.samples.length / result.sampleRate).toBeLessThanOrEqual(hi);
  });

  it.each(each())('%s : niveau efficace dans la fenêtre de sa catégorie', (_n, { recipe, result }) => {
    const [lo, hi] = RMS_WINDOW[recipe.category];
    const level = toDb(rmsOf(result.samples));
    expect(level).toBeGreaterThanOrEqual(lo);
    expect(level).toBeLessThanOrEqual(hi);
  });

  it.each(sounds.filter((s) => variantCount(s) > 1).map((s) => [s.id, s]))('%s : les variantes ont des niveaux proches (écart ≤ 3 dB)', (id) => {
    const levels = byId(id).map((r) => toDb(rmsOf(r.result.samples)));
    expect(Math.max(...levels) - Math.min(...levels)).toBeLessThanOrEqual(3);
  });

  it.each(each((r) => r.recipe.category === 'tir' || r.recipe.category === 'impact'))('%s : attaque plutôt aiguë (centre de gravité des 512 premiers échantillons)', (_n, { result }) => {
    const c = centroid(result.samples, result.sampleRate, 0, 512);
    expect(c).toBeGreaterThanOrEqual(ATTACK_CENTROID[0]);
    expect(c).toBeLessThanOrEqual(ATTACK_CENTROID[1]);
  });

  it.each(each((r) => FULL_CENTROID[r.recipe.category]))('%s : centre de gravité spectral dans la fenêtre de sa catégorie', (_n, { recipe, result }) => {
    const size = 2 ** Math.floor(Math.log2(result.samples.length));
    const c = centroid(result.samples, result.sampleRate, 0, Math.min(size, 16384));
    const [lo, hi] = FULL_CENTROID[recipe.category];
    expect(c).toBeGreaterThanOrEqual(lo);
    expect(c).toBeLessThanOrEqual(hi);
  });

  it.each(each((r) => (r.recipe.category === 'voix' || r.recipe.category === 'joueur') && !NO_PITCH.has(r.recipe.id)))('%s : fondamentale (autocorrélation) entre 60 et 240 Hz', (_n, { result }) => {
    const { f0, windows } = medianPitch(result.samples, result.sampleRate, 60, 240);
    expect(windows).toBeGreaterThan(3);
    expect(f0).toBeGreaterThanOrEqual(60);
    expect(f0).toBeLessThanOrEqual(240);
  });

  it.each(each((r) => r.recipe.category === 'tir' || r.recipe.category === 'impact'))('%s : attaque (90 % du pic) en moins de 4 ms', (_n, { result }) => {
    expect(attackTime(result.samples, result.sampleRate)).toBeLessThan(0.004);
  });

  it.each(sounds.filter((s) => variantCount(s) > 1).map((s) => [s.id, s]))('%s : variantes distinctes (corrélation maximale < 0,9)', (id) => {
    const list = byId(id);
    for (let a = 0; a < list.length; a += 1) {
      for (let b = a + 1; b < list.length; b += 1) expect(maxCorrelation(list[a].result.samples, list[b].result.samples)).toBeLessThan(0.9);
    }
  });

  it('l\'ambiance boucle sans saut (écart entre dernier et premier échantillon ≤ 0,02)', () => {
    const { samples } = byId('ambiance')[0].result;
    expect(Math.abs(samples.at(-1) - samples[0])).toBeLessThanOrEqual(0.02);
  });

  it('l\'ambiance est très faible : pic cible ≤ 0,4', () => {
    expect(byId('ambiance')[0].result.peak).toBeLessThanOrEqual(0.4);
  });
});

describe('cohérence des données sonores', () => {
  const EVENT_SOUNDS = ['tir', 'douille', 'impact-zombie', 'impact-bois', 'impact-metal', 'impact-pierre', 'impact-voiture', 'pas', 'pas-zombie', 'zombie-gemissement', 'zombie-grognement', 'zombie-plainte', 'zombie-souffle', 'zombie-blessure', 'zombie-mort', 'zombie-attaque', 'joueur-blesse', 'joueur-mort', 'ui-pause', 'ui-reprise', 'ambiance', 'vague-annonce', 'vague-renforcee', 'vague-fin'];
  const CATEGORIES = ['tir', 'impact', 'voix', 'pas', 'joueur', 'interface', 'ambiance', 'annonce'];

  it('au moins 40 tampons, dont des sons essentiels et des sons de fond', () => {
    expect(rendered.length).toBeGreaterThanOrEqual(40);
    expect(new Set(sounds.map((s) => s.set))).toEqual(new Set(['essentiel', 'fond']));
  });

  it('mémoire audio estimée (4 octets par échantillon) : 8 Mo au plus', () => {
    const bytes = rendered.reduce((sum, r) => sum + soundBytes(r.result), 0);
    console.info(`mémoire audio : ${(bytes / 1048576).toFixed(2)} Mo pour ${rendered.length} tampons`);
    expect(bytes).toBeLessThanOrEqual(8 * 1048576);
  });

  it('temps de rendu en Node : ensemble essentiel et tout (seuils larges pour la CI ; objectifs 800 et 1 500 ms)', () => {
    const all = timing.essentiel + timing.fond;
    console.info(`rendu en Node : essentiel ${timing.essentiel.toFixed(0)} ms, fond ${timing.fond.toFixed(0)} ms, tout ${all.toFixed(0)} ms`);
    expect(timing.essentiel).toBeLessThanOrEqual(4000);
    expect(all).toBeLessThanOrEqual(4000);
  });

  it('chaque son attendu par le jeu existe, une seule fois', () => {
    const ids = sounds.map((s) => s.id);
    for (const id of EVENT_SOUNDS) expect(ids.filter((x) => x === id), id).toHaveLength(1);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('chaque recette est complète : catégorie, ensemble, taux, durée, variantes, graine, couches, pic cible', () => {
    for (const s of sounds) {
      expect(CATEGORIES, s.id).toContain(s.category);
      expect(['essentiel', 'fond'], s.id).toContain(s.set);
      expect([44100, 22050], s.id).toContain(s.sampleRate);
      expect(s.duration, s.id).toBeGreaterThan(0);
      expect(Number.isInteger(s.variants) && s.variants >= 1, s.id).toBe(true);
      expect(Number.isFinite(s.seed), s.id).toBe(true);
      expect(typeof s.loop, s.id).toBe('boolean');
      expect(s.layers.length, s.id).toBeGreaterThan(0);
      expect(s.post.targetPeak, s.id).toBeLessThanOrEqual(0.98);
      expect(fr[`dev.sons.etiquette.${s.id}`], s.id).toBeTruthy();
    }
  });

  it('les sons de fond sont les voix de zombies (sauf blessure et mort, jouées à l\'impact), l\'ambiance et deux sons d\'annonce (lot 2c)', () => {
    const fond = sounds.filter((s) => s.set === 'fond').map((s) => s.id).sort();
    expect(fond).toEqual(['ambiance', 'vague-fin', 'vague-renforcee', 'zombie-attaque', 'zombie-gemissement', 'zombie-grognement', 'zombie-plainte', 'zombie-souffle']);
  });

  it('les voix de zombies ont une fondamentale de base proche de 110 Hz', () => {
    for (const s of sounds.filter((x) => x.id.startsWith('zombie-') && x.id !== 'zombie-souffle')) {
      const f0 = s.layers.find((l) => l.type === 'voice').f0;
      expect(f0, s.id).toBeGreaterThanOrEqual(80);
      expect(f0, s.id).toBeLessThanOrEqual(160);
    }
  });

  it('les matières correspondent à des types d\'obstacle réels (salle et décor) et tous les types ont une matière', () => {
    const realKinds = new Set([...world.obstacles.map((o) => o.kind), 'voiture', 'arbre']);
    expect(new Set(Object.keys(materials.kinds))).toEqual(realKinds);
    for (const material of Object.values(materials.kinds)) expect(Object.keys(materials.sounds)).toContain(material);
    expect(Object.keys(materials.sounds)).toContain(materials.wallMaterial);
    for (const id of Object.values(materials.sounds)) expect(sounds.map((s) => s.id)).toContain(id);
    expect(materials.kinds.voiture).toBe('voiture');
    expect(materials.kinds.etagere).toBe('metal');
    expect(materials.kinds.table).toBe('bois');
  });

  it('chaque variante de zombie a une hauteur de lecture dans [0,8 ; 1,4], dans l\'ordre prévu', () => {
    const names = variants.zombie.variants.map((v) => v.id);
    for (const name of names) {
      expect(audio.zombieRate[name], name).toBeGreaterThanOrEqual(0.8);
      expect(audio.zombieRate[name], name).toBeLessThanOrEqual(1.4);
    }
    expect(Object.keys(audio.zombieRate).sort()).toEqual([...names].sort());
    expect(audio.zombieRate.grand).toBeLessThan(audio.zombieRate.marcheur);
    expect(audio.zombieRate.petit).toBeGreaterThan(audio.zombieRate.voute);
  });

  it('audio.json : un gain par catégorie, compresseur, distances et délais cohérents', () => {
    expect(Object.keys(audio.categoryGain).sort()).toEqual([...CATEGORIES].sort());
    for (const g of Object.values(audio.categoryGain)) expect(g).toBeGreaterThan(0);
    expect(audio.masterGain).toBeGreaterThan(0);
    expect(audio.masterGain).toBeLessThanOrEqual(1);
    expect(audio.referenceDistance).toBeLessThan(audio.maxDistance);
    expect(audio.maxVoices).toBe(16);
    expect(audio.compressor.ratio).toBeGreaterThan(1);
    expect(audio.muffle.lowpass).toBeGreaterThan(100);
    expect(audio.muffle.gain).toBeLessThan(1);
    for (const id of Object.keys(audio.minDelay)) expect(sounds.map((s) => s.id), id).toContain(id);
    expect(audio.minDelay['zombie-blessure']).toBe(0.06);
    expect(audio.casing.minDelay).toBeLessThan(audio.casing.maxDelay);
  });

  it('les données sonores sont marquées provisoires', () => {
    for (const file of ['sounds', 'audio', 'sound-materials']) expect(JSON.parse(readFileSync(`data/game/${file}.json`, 'utf8'))._provisoire, file).toBeTruthy();
  });

  it('aucun fichier audio dans le dépôt', () => {
    const tracked = execSync('git ls-files', { encoding: 'utf8' }).split('\n').filter((f) => f && existsSync(f));
    expect(tracked.filter((f) => /\.(wav|mp3|ogg|m4a|flac|webm|aac|opus|aiff?)$/i.test(f))).toEqual([]);
  });

  it('js/core/ n\'utilise ni Math.random, ni Date.now, ni DOM, ni Web Audio (synth.js compris)', () => {
    const src = readFileSync('js/core/synth.js', 'utf8');
    for (const re of [/Math\.random/, /Date\.now/, /\bdocument\b/, /\bwindow\b/, /AudioContext/, /\bfetch\s*\(/]) expect(src).not.toMatch(re);
  });
});
