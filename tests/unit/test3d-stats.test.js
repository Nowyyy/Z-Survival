import { describe, it, expect } from 'vitest';
import { clean, fps, longFrames, low1, mean, median, percentile, summarize } from '../../js/test3d/stats.js';

describe('stats.js : calculs', () => {
  const frames = [10, 20, 30, 40, 100];

  it('moyenne et médiane', () => {
    expect(mean(frames)).toBe(40);
    expect(median(frames)).toBe(30);
    expect(median([10, 20])).toBe(15);
  });

  it('centiles avec interpolation, bornés à 0 et 100', () => {
    expect(percentile(frames, 0)).toBe(10);
    expect(percentile(frames, 100)).toBe(100);
    expect(percentile(frames, 25)).toBe(20);
    expect(percentile(frames, 95)).toBeCloseTo(88, 9);
    expect(percentile(frames, -5)).toBe(10);
    expect(percentile(frames, 500)).toBe(100);
  });

  it('images par seconde moyennes', () => {
    expect(fps([20, 20, 20])).toBe(50);
  });

  it('« 1 % bas » : moyenne des images les plus lentes (au moins une)', () => {
    expect(low1([10, 10, 10, 50])).toBe(20);
    const many = [...Array(200).fill(10), 100, 100];
    expect(low1(many)).toBeCloseTo(1000 / 70, 9);
    expect(low1(Array(100).fill(10).concat([200]))).toBeCloseTo(1000 / ((200 + 10) / 2), 9);
  });

  it('images de plus de 50 ms', () => {
    expect(longFrames([49, 50, 51, 400])).toBe(2);
    expect(longFrames([20, 80], 10)).toBe(2);
  });

  it('résumé complet', () => {
    const s = summarize([16, 16, 16, 16, 80]);
    expect(s.frames).toBe(5);
    expect(s.long).toBe(1);
    expect(s.median).toBe(16);
    expect(s.fps).toBeCloseTo(1000 / 28.8, 9);
    expect(Object.values(s).every(Number.isFinite)).toBe(true);
  });
});

describe('stats.js : entrées hostiles', () => {
  it.each([[[]], [null], [undefined], ['abc'], [{}], [[NaN, Infinity, -4, 0, 'x', null]]])('%j : zéros finis, aucune exception', (input) => {
    const s = summarize(input);
    expect(s).toEqual({ frames: 0, fps: 0, median: 0, p95: 0, low1: 0, long: 0 });
  });

  it('ignore NaN et valeurs négatives dans une liste mêlée', () => {
    expect(clean([NaN, -1, 0, 5, Infinity, 3, '7'])).toEqual([3, 5]);
    expect(mean([NaN, -1, 4, 6])).toBe(5);
  });

  it('ne modifie pas un tableau gelé et ne renvoie pas le même', () => {
    const frozen = Object.freeze([30, 10, 20]);
    expect(() => summarize(frozen)).not.toThrow();
    expect(frozen).toEqual([30, 10, 20]);
    expect(clean(frozen)).not.toBe(frozen);
  });
});
