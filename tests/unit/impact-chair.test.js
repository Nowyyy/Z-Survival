import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { renderSound } from '../../js/core/synth.js';
import { renderVariant, resolveAtelier, nextVersion } from '../../js/core/synth2.js';
import { measureSound, checkTargets } from '../../js/core/atelier-check.js';
import { bandEnergyRatio, dbfs, edgeClicks, harmonicToNoise, peak, ringingPartials, shortLevel, spectralDistance } from '../../js/core/audio-analysis.js';
import { distanceGain } from '../../js/core/audio-mix.js';
import { createDirector, direct, soundTable } from '../../js/core/sound-director.js';
import { isAtelier, renderSpec } from '../../js/core/sound-choice.js';
import { renderChoice } from '../../js/core/sound-render.js';

// Lot 5a-B : l'impact d'une balle sur un zombie. L'ancien son (impact-zombie, moteur synth.js) est remplacé par l'impact sur la chair de l'atelier
// (emplacement impact-chair, variantes A, B, C), sous le même identifiant. Mesures seulement : aucun son n'est écouté par l'agent.
const read = (f) => JSON.parse(readFileSync(f, 'utf8'));
const raw = read('data/game/sounds-atelier.json');
const atelier = resolveAtelier(raw);
const slot = atelier.slots.find((s) => s.id === 'impact-chair');
const { sounds } = read('data/game/sounds.json');
// Lot 5e : le pack d'avant (sounds-legacy.json) est retiré ; les niveaux de l'ancien impact-zombie sont figés (mesure sur lot-5c 92e4556).
const REF_ANCIEN = read('tests/unit/helpers/references-sons.json').impactZombieAncien;
const audio = read('data/game/audio.json');
const voice = read('data/game/zombie-voice.json');
const materials = read('data/game/sound-materials.json');
const choix = read('data/game/sounds-choix.json').choix;
const entry = sounds.find((s) => s.id === 'impact-zombie');
const douilleEntry = sounds.find((s) => s.id === 'douille');
const VARIANTS = ['A', 'B', 'C'];
const SEEDS = [1, 2, 3, 4, 5];
const render = (v, seed) => renderVariant(slot, v, {}, seed);
const buffers = Object.fromEntries(VARIANTS.map((v) => [v, SEEDS.map((s) => render(v, s).samples)]));
const longestRing = (x, sr) => ringingPartials(x, sr, { minHz: 2000 })[0] ?? { tailMs: 0, freq: 0 };
const SHOT_REF = raw.levelRef.dbfs;
const levelRel = (x, sr) => dbfs(shortLevel(x, sr)) + 20 * Math.log10(audio.categoryGain.impact) - SHOT_REF;

describe('le son joué quand une balle touche un zombie', () => {
  it('le directeur de sons joue « impact-zombie » (et la voix du type) à l\'événement zombieHit', () => {
    const r = direct(createDirector(1), { time: 10, listener: { x: 0, y: 0 }, walls: [], paused: false, events: [{ type: 'zombieHit', x: 50, y: 0, killed: false, zombie: 'marcheur' }] }, { audio, voice, materials, sounds: soundTable(sounds) });
    expect(r.requests.map((q) => q.sound)).toContain('impact-zombie');
    expect(r.requests.filter((q) => q.sound.startsWith('impact-'))).toHaveLength(1);
  });

  // Lot 5e : « l'ancien son (pack d'avant) « scintille » » retiré avec le pack d'avant (3 assertions sur l'ancienne recette).
});

describe('impact sur la chair : trois variantes (A réaliste sourd, B horreur marquée, C sec et proche), cinq graines', () => {
  it('l\'emplacement existe dans l\'atelier, groupe « impacts », trois variantes, une cible « prompt » qui exige l\'absence de « cling »', () => {
    expect(slot.variants.map((v) => v.id)).toEqual(VARIANTS);
    expect(slot.group).toBe('impacts');
    expect(slot.current).toBe('impact-zombie');
    expect(slot.target).toMatchObject({ duration: [0.08, 0.22], centroid: [300, 1200], hf4k: 0.05, ringMs: 30, source: 'prompt' });
    expect(slot.gainDb).toBeCloseTo(20 * Math.log10(audio.categoryGain.impact), 2);
  });

  it.each(VARIANTS)('%s : déterministe octet pour octet, cinq versions toutes différentes', (v) => {
    for (const s of SEEDS) expect(Buffer.from(render(v, s).samples.buffer).equals(Buffer.from(buffers[v][s - 1].buffer))).toBe(true);
    const keys = new Set(buffers[v].map((x) => createHash('sha256').update(Buffer.from(x.buffer)).digest('hex')));
    expect(keys.size).toBe(5);
  });

  it.each(VARIANTS)('%s : crête ≤ −3 dBFS, aucun NaN, aucun clic aux bouts, 80 à 220 ms', (v) => {
    for (const x of buffers[v]) {
      expect(x.every(Number.isFinite)).toBe(true);
      expect(dbfs(peak(x))).toBeLessThanOrEqual(-3);
      expect(edgeClicks(x).click).toBe(false);
      expect(x.length / slot.sampleRate).toBeGreaterThanOrEqual(0.08);
      expect(x.length / slot.sampleRate).toBeLessThanOrEqual(0.22);
    }
  });

  it.each(VARIANTS)('%s : toutes les cibles tenues par les cinq versions, ou l\'écart déclaré (outOfTarget)', (v) => {
    const variant = slot.variants.find((q) => q.id === v);
    for (const x of buffers[v]) {
      const check = checkTargets(measureSound(x, slot.sampleRate, slot, atelier.levelRef), slot.target);
      if (!check.ok) expect(variant.outOfTarget, `${v} : ${check.items.filter((i) => !i.ok).map((i) => `${i.key}=${i.value}`).join(', ')}`).toBeDefined();
    }
  });

  it.each(VARIANTS)('%s : aucun partiel métallique (aucun pic étroit au-dessus de 2 kHz dont la queue dépasse 30 ms), moins de 5 % au-dessus de 4 kHz', (v) => {
    for (const x of buffers[v]) {
      expect(longestRing(x, slot.sampleRate).tailMs).toBeLessThanOrEqual(30);
      expect(measureSound(x, slot.sampleRate, slot, atelier.levelRef).hf4k).toBeLessThan(0.05);
    }
  });

  it('niveau relatif au tir calé sur l\'ancien impact à ±3 dB (version par version, variante par variante ; lot 5e : niveau de l\'ancien figé)', () => {
    const ref = REF_ANCIEN.niveauRelatifAuTirDb;
    expect(Math.abs(slot.target.level - ref)).toBeLessThan(0.5);
    for (const v of VARIANTS) for (const x of buffers[v]) expect(Math.abs(levelRel(x, slot.sampleRate) - ref), v).toBeLessThanOrEqual(3);
  });

  // Retour du propriétaire (lot 5a-D) : B « moins surface dure, on dirait un tambour ». Avant : sinus accordé qui descend (rapport harmonique-bruit 10,3 dB),
  // 95 % de l'énergie sous 200 Hz. Après : corps de bruit sans hauteur, perforation, squelch et éclaboussures.
  it('B : aucun choc accordé (rapport harmonique-bruit sous 0 dB, cinq versions), moins de 60 % de l\'énergie sous 200 Hz', () => {
    for (const x of buffers.B) {
      expect(harmonicToNoise(x, slot.sampleRate, 40, 400)).toBeLessThan(0);
      expect(bandEnergyRatio(x, slot.sampleRate, 0, 200)).toBeLessThan(0.6);
    }
  });

  it('les trois variantes se distinguent (distance spectrale ≥ 0,035 entre deux variantes)', () => {
    for (const [a, b] of [['A', 'B'], ['A', 'C'], ['B', 'C']]) expect(spectralDistance(buffers[a][0], buffers[b][0], slot.sampleRate), `${a}-${b}`).toBeGreaterThanOrEqual(raw.distinctness.threshold);
  });

  it('tirage des cinq graines sans répétition immédiate', () => {
    let state = { rng: 7, last: {} };
    let last = null;
    const seen = new Set();
    for (let i = 0; i < 300; i += 1) {
      const r = nextVersion(state, 'impact-zombie', entry.variants);
      expect(r.version).not.toBe(last);
      last = r.version;
      seen.add(r.version);
      state = r.state;
    }
    expect([...seen].sort()).toEqual(SEEDS);
  });
});

describe('intégration sous l\'identifiant de l\'ancien son', () => {
  // Retour du propriétaire (lot 5a-D) : B par défaut (refaite moins « tambour ») ; A et C restent comparables par ?sons=.
  it('sounds.json : impact-zombie = entrée de l\'atelier (impact-chair, variante B, 5 graines, 1 préchargée, ensemble essentiel ; lot 5e : l\'ancienne recette, pack d\'avant, est retirée)', () => {
    expect(isAtelier(entry)).toBe(true);
    expect(entry).toMatchObject({ id: 'impact-zombie', category: 'impact', set: 'essentiel', variants: 5, preload: 1, loop: false });
    expect(entry.atelier.slot.id).toBe('impact-chair');
    expect(entry.atelier.variant).toBe('B');
    expect(choix.find((c) => c.id === 'impact-zombie')).toMatchObject({ slot: 'impact-chair', variant: 'B', replaces: 'impact-zombie', seeds: 5 });
    expect(Buffer.from(renderChoice(entry, { seed: 2 }).samples.buffer).equals(Buffer.from(buffers.B[1].buffer))).toBe(true);
  });

  it.each(VARIANTS)('?sons=%s : la variante correspondante de l\'emplacement, réglages par défaut', (v) => {
    const spec = renderSpec(entry, { mode: v, slots: atelier.slots, seed: 1 });
    expect(spec.variant).toBe(v);
    expect(Buffer.from(renderChoice(entry, { mode: v, slots: atelier.slots, seed: 1 }).samples.buffer).equals(Buffer.from(buffers[v][0].buffer))).toBe(true);
  });

  // Lot 5a-E (retour du propriétaire) : la douille est refaite plus sourde et baissée de 24 dB en tout ; le tir et les autres impacts ne changent pas.
  it('coups de feu et impacts sur les autres matières : recettes identiques à origin/dev (empreinte SHA-256), sans gain propre', () => {
    const ids = ['tir', 'impact-bois', 'impact-metal', 'impact-pierre', 'impact-voiture'];
    expect(createHash('sha256').update(JSON.stringify(ids.map((id) => sounds.find((s) => s.id === id)))).digest('hex')).toBe('9846a153c4793dcd91547e808b9961057330bf5aad32f4e6500606e635df7f9a');
    for (const id of ids) expect(sounds.find((s) => s.id === id).gainDb, id).toBeUndefined();
    const r = direct(createDirector(1), { time: 10, listener: { x: 0, y: 0 }, walls: [], paused: false, events: [{ type: 'shot', x: 0, y: 0 }] }, { audio, voice, materials, sounds: soundTable(sounds) });
    const tir = r.requests.find((q) => q.sound === 'tir');
    const douille = r.requests.find((q) => q.sound === 'douille');
    expect(20 * Math.log10(douille.gain / tir.gain)).toBeCloseTo(douilleEntry.gainDb, 1);
  });

  it('douille plus sourde : aucun partiel résonant au-dessus de 2 kHz plus long que 30 ms, rien au-dessus de 4 kHz ; 24 dB sous l\'ancienne en tout (±0,5 dB)', () => {
    const OLD_DOUILLE_DB = -17.29; // niveau court moyen des deux variantes de l'ancienne recette (origin/dev avant le lot 5a-E)
    let level = 0;
    for (let v = 0; v < douilleEntry.variants; v += 1) {
      const o = renderSound(douilleEntry, v);
      expect(longestRing(o.samples, o.sampleRate).tailMs).toBeLessThanOrEqual(30);
      expect(measureSound(o.samples, o.sampleRate).hf4k).toBeLessThan(0.05);
      level += dbfs(shortLevel(o.samples, o.sampleRate)) / douilleEntry.variants;
    }
    expect(Math.abs(level + douilleEntry.gainDb - (OLD_DOUILLE_DB - 24))).toBeLessThanOrEqual(0.5);
    // Lot 5e : « l'ancien impact-zombie, intact dans le pack d'avant : même empreinte » retiré avec le pack d'avant (1 assertion).
    expect(materials.sounds).toEqual({ bois: 'impact-bois', metal: 'impact-metal', pierre: 'impact-pierre', voiture: 'impact-voiture' });
  });
});

describe('scène simulée : 8 zombies, 24 tirs (niveau moyen et écrêtage)', () => {
  // Mixage hors ligne à 44 100 Hz (le tir, la douille et l'ancien impact y sont rendus ; l'atelier à 22 050 Hz, suréchantillonné ×2 linéairement).
  // Tir au joueur (gain 1), impact sur le zombie touché (gain de distance d'audio-mix.js), douille 0,3 s après ; gains de catégorie et gain maître d'audio.json.
  const SR = 44100;
  const RINGS = [180, 260, 340, 450, 560, 700, 850, 1000];
  const up = (x, sr) => (sr === SR ? Float64Array.from(x) : Float64Array.from({ length: x.length * 2 }, (_, i) => (i % 2 === 0 ? x[i / 2] : (x[(i - 1) / 2] + (x[(i + 1) / 2] ?? 0)) / 2)));
  const tir = sounds.find((s) => s.id === 'tir');
  const douille = sounds.find((s) => s.id === 'douille');
  const shots = Array.from({ length: tir.variants }, (_, v) => renderSound(tir, v).samples);
  const casings = Array.from({ length: douille.variants }, (_, v) => renderSound(douille, v).samples);
  const scene = (impacts, withShots = true) => {
    const out = new Float64Array(Math.round(9 * SR));
    const mix = (x, t, g) => {
      const at = Math.round(t * SR);
      for (let i = 0; i < x.length && at + i < out.length; i += 1) out[at + i] += x[i] * g * audio.masterGain;
    };
    for (let k = 0; k < 24; k += 1) {
      const t = 0.2 + k * 0.35;
      if (withShots) mix(shots[k % shots.length], t, audio.categoryGain.tir);
      if (withShots) mix(casings[k % casings.length], t + 0.3, audio.categoryGain.tir * 10 ** ((douille.gainDb ?? 0) / 20)); // gain propre de la douille, comme en jeu
      mix(impacts[k % impacts.length], t + 0.08, audio.categoryGain.impact * distanceGain(RINGS[k % 8], audio.referenceDistance, audio.maxDistance));
    }
    let e = 0;
    let p = 0;
    for (const v of out) {
      e += v * v;
      p = Math.max(p, Math.abs(v));
    }
    return { db: 10 * Math.log10(e / out.length), peak: p };
  };
  // Lot 5e : scène avec l'ancien impact figée (énergie moyenne mesurée sur lot-5c 92e4556, tests/unit/helpers/references-sons.json).
  const before = { db: REF_ANCIEN.sceneDb };
  const after = Object.fromEntries(VARIANTS.map((v) => [v, scene(buffers[v].map((x) => up(x, slot.sampleRate)))]));
  const beforeHits = { db: REF_ANCIEN.sceneImpactsSeulsDb };
  const afterHits = Object.fromEntries(VARIANTS.map((v) => [v, scene(buffers[v].map((x) => up(x, slot.sampleRate)), false)]));

  // Crête du mélange brut, avant le compresseur du jeu (audio.json) : elle dépassait déjà 1 avec l'ancien impact (tir et impact proche presque en même temps).
  it.each(VARIANTS)('%s : niveau moyen de la scène (et des impacts seuls) à ±3 dB de la référence ; aucun écrêtage (crête du mélange sous 1 ; lot 5a-E : la référence a baissé avec la douille)', (v) => {
    console.log(`SCÈNE ${v} : ${after[v].db.toFixed(2)} dB (avant ${before.db.toFixed(2)}) ; impacts seuls ${afterHits[v].db.toFixed(2)} dB (avant ${beforeHits.db.toFixed(2)}) ; crête ${after[v].peak.toFixed(3)}`);
    expect(Math.abs(after[v].db - before.db)).toBeLessThanOrEqual(3);
    expect(Math.abs(afterHits[v].db - beforeHits.db)).toBeLessThanOrEqual(3);
    expect(after[v].peak).toBeLessThan(1);
    // Lot 5e : « crête du mélange avec l'ancien impact sous 1 » retirée avec le pack d'avant (1 assertion).
  });
});
