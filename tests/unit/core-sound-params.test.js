import { describe, it, expect } from 'vitest';
import { SOUND_NAMES, soundParams } from '../../js/core/sound-params.js';

describe('sound-params.js', () => {
  it('décrit les quatre sons du jeu', () => {
    expect([...SOUND_NAMES].sort()).toEqual(['hit', 'hurt', 'kill', 'shoot']);
  });

  it.each(SOUND_NAMES)('%s : valeurs finies et positives', (name) => {
    const p = soundParams(name);
    for (const key of ['freqStart', 'freqEnd', 'duration', 'attack', 'gain']) {
      expect(Number.isFinite(p[key]), key).toBe(true);
      expect(p[key], key).toBeGreaterThan(0);
    }
    expect(['square', 'sawtooth', 'triangle', 'sine', 'noise']).toContain(p.type);
  });

  it.each(SOUND_NAMES)('%s : durée bornée (moins d\'une seconde), attaque plus courte que la durée, gain raisonnable', (name) => {
    const p = soundParams(name);
    expect(p.duration).toBeLessThanOrEqual(1);
    expect(p.attack).toBeLessThan(p.duration);
    expect(p.gain).toBeLessThanOrEqual(0.5);
  });

  it('ne donne aucun son pour un nom inconnu ou absurde', () => {
    for (const bad of ['', 'boom', null, undefined, 42, {}, '__proto__', 'constructor', 'toString']) expect(soundParams(bad)).toBeNull();
  });

  it('renvoie une copie : modifier le résultat ne change pas le son', () => {
    const p = soundParams('shoot');
    p.gain = 99;
    expect(soundParams('shoot').gain).toBeLessThan(1);
  });

  it('les sons sont distincts et déterministes', () => {
    expect(soundParams('shoot')).toEqual(soundParams('shoot'));
    expect(soundParams('shoot')).not.toEqual(soundParams('kill'));
  });
});
