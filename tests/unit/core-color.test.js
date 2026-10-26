import { describe, it, expect } from 'vitest';
import { contrast, isColor, luminance, mix, parseColor, shade, toHex, toRgb } from '../../js/core/color.js';
import { deepFreeze, WEIRD } from './helpers/monde.js';

describe('color : lecture', () => {
  it.each([['#fff', [255, 255, 255]], ['#000', [0, 0, 0]], ['#1a2B3c', [26, 43, 60]], ['  #f4f1ec ', [244, 241, 236]], ['rgb(10, 20, 30)', [10, 20, 30]], ['rgb(10 20 30)', [10, 20, 30]], ['rgba(1, 2, 3, 0.5)', [1, 2, 3]]])('%j est lu', (text, rgb) => {
    expect(parseColor(text)).toEqual(rgb);
  });

  it.each(['', '#12', '#12345', '#gggggg', 'rouge', 'rgb(300, 0, 0)', 'rgb(1, 2)', 'hsl(0, 0%, 0%)', '#1234567', null, undefined, 42, {}, []])('%j est refusé', (text) => {
    expect(parseColor(text)).toBeNull();
  });

  it('toHex et toRgb font l\'aller-retour', () => {
    expect(toHex([244, 241, 236])).toBe('#f4f1ec');
    expect(toRgb('#f4f1ec')).toEqual([244, 241, 236]);
    expect(toRgb([300, -5, 12.6])).toEqual([255, 0, 13]);
  });
});

describe('color : luminance et contraste', () => {
  it('luminance : noir 0, blanc 1, vert plus lumineux que bleu', () => {
    expect(luminance([0, 0, 0])).toBe(0);
    expect(luminance([255, 255, 255])).toBeCloseTo(1, 10);
    expect(luminance([0, 255, 0])).toBeGreaterThan(luminance([0, 0, 255]));
  });

  it('contraste : valeurs connues (noir sur blanc 21, identiques 1, gris moyen sur blanc ≈ 3,95)', () => {
    expect(contrast([0, 0, 0], [255, 255, 255])).toBeCloseTo(21, 6);
    expect(contrast([10, 20, 30], [10, 20, 30])).toBe(1);
    expect(contrast([119, 119, 119], [255, 255, 255])).toBeCloseTo(4.48, 1);
  });

  it('contraste symétrique, accepte les chaînes, toujours entre 1 et 21', () => {
    expect(contrast('#336699', '#ffeecc')).toBe(contrast('#ffeecc', '#336699'));
    for (const a of [[0, 0, 0], [50, 90, 130], [255, 255, 255]]) for (const b of [[10, 10, 10], [200, 180, 20]]) {
      const c = contrast(a, b);
      expect(c).toBeGreaterThanOrEqual(1);
      expect(c).toBeLessThanOrEqual(21);
    }
  });
});

describe('color : mélange et assombrissement', () => {
  it('mix : extrémités, milieu, t borné', () => {
    expect(mix([0, 0, 0], [200, 100, 50], 0)).toEqual([0, 0, 0]);
    expect(mix([0, 0, 0], [200, 100, 50], 1)).toEqual([200, 100, 50]);
    expect(mix([0, 0, 0], [200, 100, 50], 0.5)).toEqual([100, 50, 25]);
    expect(mix([0, 0, 0], [200, 100, 50], 9)).toEqual([200, 100, 50]);
    expect(mix([0, 0, 0], [200, 100, 50], -9)).toEqual([0, 0, 0]);
  });

  it('shade : négatif assombrit, positif éclaircit, 0 ne change rien', () => {
    const c = [100, 120, 140];
    expect(shade(c, 0)).toEqual(c);
    expect(luminance(shade(c, -0.4))).toBeLessThan(luminance(c));
    expect(luminance(shade(c, 0.4))).toBeGreaterThan(luminance(c));
    expect(shade(c, -1)).toEqual([0, 0, 0]);
    expect(shade(c, 1)).toEqual([255, 255, 255]);
  });

  it('ne modifie pas ses arguments, même gelés, et renvoie de nouveaux tableaux', () => {
    const a = deepFreeze([10, 20, 30]);
    const out = mix(a, [0, 0, 0], 0.5);
    expect(out).not.toBe(a);
    expect(shade(a, 0.2)).not.toBe(a);
    expect(a).toEqual([10, 20, 30]);
  });
});

describe('color : entrées hostiles', () => {
  it.each(WEIRD)('%j : aucune exception, résultats finis', (w) => {
    expect(Number.isFinite(luminance(w))).toBe(true);
    expect(Number.isFinite(contrast(w, w))).toBe(true);
    expect(mix(w, w, w)).toHaveLength(3);
    expect(shade(w, w)).toHaveLength(3);
    expect(toHex(w)).toMatch(/^#[0-9a-f]{6}$/);
    expect(isColor(w)).toBe(false);
  });
});
