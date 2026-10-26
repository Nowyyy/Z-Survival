import { describe, it, expect } from 'vitest';
import { admitVoice, createVoiceState, distanceGain, isMuffled, panFor, pickVariant } from '../../js/core/audio-mix.js';
import { createRng } from '../../js/core/rng.js';

describe('audio-mix.js : distance et balance', () => {
  it('le gain est plein sous la distance de référence et nul à la distance maximale', () => {
    expect(distanceGain(0)).toBe(1);
    expect(distanceGain(150)).toBe(1);
    expect(distanceGain(1100)).toBe(0);
    expect(distanceGain(5000)).toBe(0);
  });
  it('le gain décroît avec la distance, sans saut', () => {
    let last = 1;
    for (let d = 150; d <= 1100; d += 25) {
      const g = distanceGain(d);
      expect(g).toBeLessThanOrEqual(last + 1e-12);
      expect(g).toBeGreaterThanOrEqual(0);
      last = g;
    }
    expect(distanceGain(300)).toBeCloseTo(0.5, 5);
    expect(Math.abs(distanceGain(1099) - distanceGain(1050))).toBeLessThan(0.1);
  });
  it('entrées hostiles : jamais d\'exception, résultat entre 0 et 1', () => {
    for (const bad of [NaN, null, undefined, 'x', {}, -5, Infinity]) {
      const g = distanceGain(bad);
      expect(g).toBeGreaterThanOrEqual(0);
      expect(g).toBeLessThanOrEqual(1);
    }
    expect(distanceGain(200, NaN, NaN)).toBeGreaterThan(0);
  });
  it('la balance suit le décalage horizontal et reste dans les bornes', () => {
    expect(panFor(0)).toBe(0);
    expect(panFor(-10000)).toBeCloseTo(-0.9, 6);
    expect(panFor(10000)).toBeCloseTo(0.9, 6);
    expect(panFor(250, 500, 1)).toBeCloseTo(0.5, 6);
    expect(panFor(-250)).toBeLessThan(0);
    for (const bad of [NaN, null, 'a', undefined]) expect(panFor(bad)).toBe(0);
  });
});

describe('audio-mix.js : étouffement selon la ligne de vue', () => {
  const wall = { id: 'mur', x: 100, y: 0, w: 40, h: 500 };
  it('un mur entre la source et l\'écouteur étouffe', () => {
    expect(isMuffled({ x: 0, y: 200 }, { x: 300, y: 200 }, [wall])).toBe(true);
  });
  it('sans mur sur le trajet, pas d\'étouffement ; une ouverture laisse passer', () => {
    expect(isMuffled({ x: 200, y: 200 }, { x: 300, y: 200 }, [wall])).toBe(false);
    const withGap = [{ x: 100, y: 0, w: 40, h: 180 }, { x: 100, y: 260, w: 40, h: 240 }];
    expect(isMuffled({ x: 0, y: 220 }, { x: 300, y: 220 }, withGap)).toBe(false);
    expect(isMuffled({ x: 0, y: 100 }, { x: 300, y: 100 }, withGap)).toBe(true);
  });
  it('sans mur ou avec des entrées hostiles : faux, sans exception', () => {
    expect(isMuffled({ x: 0, y: 0 }, { x: 10, y: 10 }, [])).toBe(false);
    for (const bad of [null, undefined, 'x', [null], [{}], 5]) expect(() => isMuffled(null, undefined, bad)).not.toThrow();
  });
});

describe('audio-mix.js : choix de variante', () => {
  it('ne répète jamais deux fois la même variante d\'affilée', () => {
    let rng = createRng(3);
    let last = null;
    for (let i = 0; i < 500; i += 1) {
      const r = pickVariant(3, last, rng);
      expect(r.variant).toBeGreaterThanOrEqual(0);
      expect(r.variant).toBeLessThan(3);
      expect(r.variant).not.toBe(last);
      rng = r.rng;
      last = r.variant;
    }
  });
  it('utilise toutes les variantes, de façon reproductible', () => {
    const run = () => {
      let rng = createRng(9);
      let last = null;
      const seen = [];
      for (let i = 0; i < 60; i += 1) {
        const r = pickVariant(4, last, rng);
        seen.push(r.variant);
        rng = r.rng;
        last = r.variant;
      }
      return seen;
    };
    expect(new Set(run()).size).toBe(4);
    expect(run()).toEqual(run());
  });
  it('une seule variante : toujours 0 ; entrées hostiles : 0', () => {
    expect(pickVariant(1, 0, createRng(1)).variant).toBe(0);
    for (const bad of [0, -1, NaN, null, 'x']) expect(pickVariant(bad, 5, null).variant).toBe(0);
  });
});

describe('audio-mix.js : limite de voix et délais minimaux', () => {
  const cfg = { maxVoices: 3, minDelay: { 'zombie-blessure': 0.06 } };
  const ask = (state, sound, priority, now, duration = 1) => admitVoice(state, { sound, priority, duration }, now, cfg);

  it('admet les voix jusqu\'à la limite, puis refuse une voix de priorité égale ou plus basse', () => {
    let s = createVoiceState();
    for (let i = 0; i < 3; i += 1) {
      const r = ask(s, `s${i}`, 2, 0);
      expect(r.play).toBe(true);
      s = r.state;
    }
    const refused = ask(s, 'autre', 2, 0.1);
    expect(refused.play).toBe(false);
    expect(refused.reason).toBe('limite');
    expect(ask(s, 'autre', 1, 0.1).play).toBe(false);
  });
  it('une voix plus prioritaire coupe la moins prioritaire, la plus ancienne en premier', () => {
    let s = createVoiceState();
    s = ask(s, 'pas', 1, 0).state;
    s = ask(s, 'voix', 2, 0.1).state;
    s = ask(s, 'pas-bis', 1, 0.2).state;
    const r = ask(s, 'tir', 3, 0.3);
    expect(r.play).toBe(true);
    expect(r.stolen).toBe(1); // la voix « pas », plus ancienne que « pas-bis »
    expect(r.state.voices.map((v) => v.sound).sort()).toEqual(['pas-bis', 'tir', 'voix']);
  });
  it('les voix terminées libèrent leur place', () => {
    let s = createVoiceState();
    for (let i = 0; i < 3; i += 1) s = ask(s, `s${i}`, 2, 0, 0.5).state;
    expect(ask(s, 'neuf', 2, 0.6).play).toBe(true);
  });
  it('jamais plus de voix que la limite, même sous 200 demandes', () => {
    let s = createVoiceState();
    for (let i = 0; i < 200; i += 1) {
      s = ask(s, `s${i % 7}`, i % 4, i * 0.01, 2).state;
      expect(s.voices.length).toBeLessThanOrEqual(3);
    }
  });
  it('délai minimal par son : la blessure de zombie attend 60 ms', () => {
    let s = createVoiceState();
    s = ask(s, 'zombie-blessure', 2, 1).state;
    const early = ask(s, 'zombie-blessure', 2, 1.03);
    expect(early.play).toBe(false);
    expect(early.reason).toBe('delai');
    expect(ask(s, 'zombie-blessure', 2, 1.07).play).toBe(true);
    expect(ask(s, 'tir', 3, 1.03).play).toBe(true); // un autre son n'est pas concerné
  });
  it('ne modifie pas ses arguments (état gelé) et renvoie de nouveaux objets', () => {
    const state = Object.freeze({ voices: Object.freeze([Object.freeze({ id: 1, sound: 'a', priority: 1, start: 0, end: 5 })]), last: Object.freeze({ a: 0 }), nextId: 2 });
    const req = Object.freeze({ sound: 'b', priority: 2, duration: 1 });
    const r = admitVoice(state, req, 1, Object.freeze({ maxVoices: 4, minDelay: Object.freeze({}) }));
    expect(r.state).not.toBe(state);
    expect(state.voices).toHaveLength(1);
    expect(r.state.voices).toHaveLength(2);
  });
  it('entrées hostiles : aucune exception', () => {
    for (const bad of [null, undefined, NaN, 'x', {}, [], { voices: 'a' }]) {
      expect(() => admitVoice(bad, bad, bad, bad)).not.toThrow();
      expect(admitVoice(bad, bad, bad, bad).state.voices).toBeInstanceOf(Array);
    }
  });
});
