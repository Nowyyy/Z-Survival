import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { activeCount, admitVoice, createVoiceState, dropCategory } from '../../js/core/audio-mix.js';
import { createDirector, direct, soundTable } from '../../js/core/sound-director.js';
import { renderSound } from '../../js/core/synth.js';
import { peakOf } from './helpers/dsp.js';
import { deepFreeze, WEIRD } from './helpers/monde.js';

const read = (f) => JSON.parse(readFileSync(`data/game/${f}.json`, 'utf8'));
const audio = read('audio');
const cfg = { audio, materials: read('sound-materials'), voice: read('zombie-voice'), sounds: soundTable(read('sounds').sounds) };
const frame = (events, extra = {}) => ({ time: 10, listener: { x: 800, y: 600 }, walls: [], paused: false, events, ...extra });
const run = (events, extra, state = createDirector(1)) => direct(state, frame(events, extra), cfg);

describe('synth.js : réglage par variante (byVariant, lot 2c)', () => {
  const layer = (extra = {}) => ({ type: 'ring', start: 0.05, dur: 0.4, attack: 0.002, freqVar: 0, detune: 0, gain: 1, partials: [{ freq: 400, gain: 1, decay: 0.2 }], ...extra });
  const recipe = (l) => ({ id: 't', category: 'annonce', sampleRate: 22050, duration: 0.6, variants: 3, seed: 1, layers: [l], post: { targetPeak: 0.5 } });
  const zeroCrossings = (s, from, to) => {
    let n = 0;
    for (let i = from + 1; i < to; i += 1) if ((s[i - 1] < 0) !== (s[i] < 0)) n += 1;
    return n;
  };

  it('freqMul multiplie la hauteur de la variante (octave : deux fois plus de passages par zéro)', () => {
    const l = layer({ byVariant: [{ freqMul: 1 }, { freqMul: 2 }] });
    const a = renderSound(recipe(l), 0).samples;
    const b = renderSound(recipe(l), 1).samples;
    const zc = (s) => zeroCrossings(s, Math.round(0.06 * 22050), Math.round(0.2 * 22050));
    expect(zc(b) / zc(a)).toBeGreaterThan(1.8);
    expect(zc(b) / zc(a)).toBeLessThan(2.2);
  });

  it('startAdd décale le départ de la variante (s)', () => {
    const l = layer({ byVariant: [{ startAdd: 0 }, { startAdd: 0.2 }] });
    const firstSound = (s) => s.findIndex((v) => Math.abs(v) > 0.02) / 22050;
    expect(firstSound(renderSound(recipe(l), 1).samples) - firstSound(renderSound(recipe(l), 0).samples)).toBeGreaterThan(0.17);
  });

  it('la liste est cyclique : la variante 2 d\'une liste de deux réglages reprend le premier', () => {
    const l = layer({ byVariant: [{ freqMul: 1 }, { freqMul: 2 }] });
    const r = recipe(l);
    const a = renderSound({ ...r, seed: 1 }, 0);
    const c = renderSound({ ...r, seed: 1 }, 2);
    expect(c.samples.length).toBe(a.samples.length);
    expect(peakOf(c.samples)).toBeGreaterThan(0.3);
  });

  it('une couche sans byVariant est inchangée (mêmes échantillons qu\'avec byVariant vide)', () => {
    const plain = renderSound(recipe(layer()), 1).samples;
    expect(Buffer.from(renderSound(recipe(layer({ byVariant: [] })), 1).samples.buffer).equals(Buffer.from(plain.buffer))).toBe(true);
  });

  it('valeurs absurdes ignorées sans exception (freqMul négatif, NaN, chaîne ; byVariant non liste)', () => {
    for (const w of WEIRD) {
      for (const byVariant of [[w], [{ freqMul: w, startAdd: w }], w]) {
        const r = renderSound(recipe(layer({ byVariant })), 1);
        expect(r.samples.every(Number.isFinite), JSON.stringify(byVariant)).toBe(true);
      }
    }
  });

  it('les recettes du lot 2c utilisent byVariant pour la hauteur et le départ des cloches', () => {
    const { sounds } = read('sounds');
    for (const id of ['vague-annonce', 'vague-renforcee', 'vague-fin']) {
      const rings = sounds.find((s) => s.id === id).layers.filter((l) => l.type === 'ring');
      expect(rings.length, id).toBeGreaterThan(0);
      for (const l of rings) expect(Array.isArray(l.byVariant) && l.byVariant.length >= 2, id).toBe(true);
    }
  });
});

describe('audio-mix.js : voix par catégorie (lot 2c)', () => {
  const ask = (state, sound, category, now, duration = 4) => admitVoice(state, { sound, category, priority: audio.priority[category], duration }, now, { maxVoices: 16, minDelay: {} }).state;

  it('activeCount compte les voix d\'une catégorie encore en cours', () => {
    let s = createVoiceState();
    s = ask(s, 'vague-annonce', 'annonce', 0, 3.8);
    s = ask(s, 'tir', 'tir', 1, 0.7);
    expect(activeCount(s, 'annonce', 2)).toBe(1);
    expect(activeCount(s, 'annonce', 4)).toBe(0);
    expect(activeCount(s, 'tir', 1.5)).toBe(1);
    expect(activeCount(s, 'voix', 1.5)).toBe(0);
  });

  it('dropCategory retire seulement les voix de la catégorie et garde les délais minimaux', () => {
    let s = createVoiceState();
    s = ask(s, 'vague-annonce', 'annonce', 0);
    s = ask(s, 'tir', 'tir', 0.5);
    const d = dropCategory(s, 'annonce');
    expect(d.voices.map((v) => v.sound)).toEqual(['tir']);
    expect(d.last['vague-annonce']).toBe(0);
    expect(d.nextId).toBe(s.nextId);
  });

  it('priorité de l\'annonce : après joueur, tir et impact, avant voix, pas et ambiance', () => {
    const p = audio.priority;
    expect(p.annonce).toBeLessThan(Math.min(p.joueur, p.tir, p.impact));
    expect(p.annonce).toBeGreaterThan(Math.max(p.voix, p.pas, p.ambiance));
  });

  it('voix pleines (16) : un tir vole la place de l\'annonce, une voix de zombie n\'en vole pas', () => {
    const cfgFull = { maxVoices: 2, minDelay: {} };
    let s = createVoiceState();
    s = admitVoice(s, { sound: 'vague-annonce', category: 'annonce', priority: audio.priority.annonce, duration: 4 }, 0, cfgFull).state;
    s = admitVoice(s, { sound: 'pas', category: 'pas', priority: audio.priority.pas, duration: 4 }, 0.1, cfgFull).state;
    const voice = admitVoice(s, { sound: 'zombie-gemissement', category: 'voix', priority: audio.priority.voix, duration: 1 }, 0.2, cfgFull);
    expect(voice.play).toBe(true); // le pas (priorité 1) cède
    const shot = admitVoice(voice.state, { sound: 'tir', category: 'tir', priority: audio.priority.tir, duration: 1 }, 0.3, cfgFull);
    expect(shot.play).toBe(true);
    expect(shot.state.voices.some((v) => v.sound === 'vague-annonce')).toBe(true); // la voix de zombie (priorité 2) a cédé, pas l'annonce
  });

  it('entrées absurdes sans exception', () => {
    for (const w of WEIRD) {
      expect(() => activeCount(w, w, w)).not.toThrow();
      expect(() => dropCategory(w, w)).not.toThrow();
    }
    expect(activeCount(undefined, 'annonce', 0)).toBe(0);
  });

  it('arguments gelés non modifiés', () => {
    const s = deepFreeze(ask(createVoiceState(), 'vague-annonce', 'annonce', 0));
    const before = JSON.stringify(s);
    dropCategory(s, 'annonce');
    activeCount(s, 'annonce', 1);
    expect(JSON.stringify(s)).toBe(before);
  });
});

describe('sound-director.js : événements waveSplash et waveEnd (lot 2c)', () => {
  it('waveSplash demande la mélodie d\'annonce avec la variante donnée, sans spatialisation', () => {
    const r = run([{ type: 'waveSplash', sound: 'vague-annonce', variant: 2 }]);
    expect(r.requests).toHaveLength(1);
    expect(r.requests[0]).toMatchObject({ sound: 'vague-annonce', category: 'annonce', variant: 2, gain: 1, pan: 0, delay: 0, lowpass: false, rate: 1 });
    expect(r.requests[0].duration).toBeCloseTo(3.8, 6);
  });

  it('vague renforcée : vague-renforcee (2 variantes)', () => {
    const r = run([{ type: 'waveSplash', sound: 'vague-renforcee', variant: 1 }]);
    expect(r.requests[0]).toMatchObject({ sound: 'vague-renforcee', variant: 1 });
    expect(r.requests[0].duration).toBeCloseTo(4.2, 6);
  });

  it('waveEnd demande vague-fin', () => {
    const r = run([{ type: 'waveEnd', variant: 0 }]);
    expect(r.requests[0]).toMatchObject({ sound: 'vague-fin', category: 'annonce', variant: 0 });
  });

  it('seuls les deux sons d\'annonce sont permis pour waveSplash (un autre nom est ignoré)', () => {
    for (const sound of ['tir', 'vague-fin', 'x', undefined, null, 5]) expect(run([{ type: 'waveSplash', sound, variant: 0 }]).requests, String(sound)).toEqual([]);
  });

  it('la variante n\'est jamais la même deux fois d\'affilée (la suivante est prise)', () => {
    const first = run([{ type: 'waveSplash', sound: 'vague-annonce', variant: 1 }]);
    const second = direct(first.state, frame([{ type: 'waveSplash', sound: 'vague-annonce', variant: 1 }], { time: 30 }), cfg);
    expect(second.requests[0].variant).toBe(2);
    const third = direct(second.state, frame([{ type: 'waveSplash', sound: 'vague-annonce', variant: 2 }], { time: 60 }), cfg);
    expect(third.requests[0].variant).toBe(0);
  });

  it('variante absente ou hors bornes : choix par la règle existante (jamais deux fois la même, toujours valide)', () => {
    let state = createDirector(3);
    let last = -1;
    for (let i = 0; i < 12; i += 1) {
      const r = direct(state, frame([{ type: 'waveSplash', sound: 'vague-annonce', variant: [undefined, 9, -1, 1.5, NaN][i % 5] }], { time: 10 + i * 10 }), cfg);
      state = r.state;
      const v = r.requests[0].variant;
      expect(v >= 0 && v < 3 && v !== last).toBe(true);
      last = v;
    }
  });

  it('en pause, l\'annonce ne sonne pas', () => {
    expect(run([{ type: 'waveSplash', sound: 'vague-annonce', variant: 0 }], { paused: true }).requests).toEqual([]);
    expect(run([{ type: 'waveEnd', variant: 0 }], { paused: true }).requests).toEqual([]);
  });

  it('une seule demande par événement ; deux animations successives, deux demandes (limite de voix non atteinte)', () => {
    const a = run([{ type: 'waveSplash', sound: 'vague-annonce', variant: 0 }]);
    const b = direct(a.state, frame([{ type: 'waveEnd', variant: 1 }], { time: 12 }), cfg);
    expect(a.requests).toHaveLength(1);
    expect(b.requests).toHaveLength(1);
    expect(activeCount(b.state.voices, 'annonce', 12.1)).toBe(2);
  });

  it('le gain de la catégorie annonce vaut 0,6 (provisoire) ; la durée de la demande est celle du son', () => {
    expect(audio.categoryGain.annonce).toBe(0.6);
    expect(cfg.sounds['vague-fin']).toMatchObject({ category: 'annonce', variants: 2 });
    expect(cfg.sounds['vague-annonce'].variants).toBe(3);
  });

  it('entrées absurdes : jamais d\'exception', () => {
    for (const w of WEIRD) {
      expect(() => run([{ type: 'waveSplash', sound: w, variant: w }])).not.toThrow();
      expect(() => run([{ type: 'waveEnd', variant: w }])).not.toThrow();
    }
  });
});
