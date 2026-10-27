import { describe, it, expect } from 'vitest';
import { deflateSync } from 'node:zlib';
import { COLOR_NAMES, KINDS, MAIN_COLOR, TILEABLE, createTextureData, fillRows } from '../../js/core/texgen.js';
import { deepFreeze, WEIRD } from './helpers/monde.js';

// Genre « grain » (lot 2c) : grain de 128 × 128 px de l'effet VHS, tuilable, deux teintes grises, transparence quantifiée.
const LIGHT = [244, 241, 236];
const DARK = [5, 5, 5];
const spec = (extra = {}) => ({ id: 'grain', kind: 'grain', width: 128, height: 128, seed: 5, colors: { light: LIGHT, dark: DARK }, params: {}, ...extra });
const lum = (d, i) => 0.3 * d[i] + 0.59 * d[i + 1] + 0.11 * d[i + 2];

describe('texgen : genre grain', () => {
  it('est déclaré : couleurs light et dark, tuilable dans les deux sens, couleur principale light', () => {
    expect(KINDS).toContain('grain');
    expect([...COLOR_NAMES.grain]).toEqual(['light', 'dark']);
    expect(TILEABLE.grain).toBe('xy');
    expect(MAIN_COLOR.grain).toBe('light');
  });

  it('taille 128 × 128, 4 octets par pixel, aucun avertissement', () => {
    const t = createTextureData(spec());
    expect([t.width, t.height, t.data.length]).toEqual([128, 128, 128 * 128 * 4]);
    expect(t.data).toBeInstanceOf(Uint8ClampedArray);
    expect(t.warnings).toEqual([]);
  });

  it('chaque pixel est une des deux teintes passées en argument, avec un alpha quantifié (4 niveaux par défaut)', () => {
    const { data } = createTextureData(spec());
    const alphas = new Set();
    let light = 0;
    for (let i = 0; i < data.length; i += 4) {
      const rgb = [data[i], data[i + 1], data[i + 2]];
      const isLight = rgb.every((v, k) => v === LIGHT[k]);
      expect(isLight || rgb.every((v, k) => v === DARK[k])).toBe(true);
      if (isLight) light += 1;
      alphas.add(data[i + 3]);
    }
    expect([...alphas].sort((a, b) => a - b)).toEqual([64, 128, 191, 255]);
    expect(light / (data.length / 4)).toBeGreaterThan(0.45);
    expect(light / (data.length / 4)).toBeLessThan(0.55);
  });

  it('le grain est transparent en moyenne (alpha moyen autour de 160) : ce n\'est pas une image opaque', () => {
    const { data } = createTextureData(spec());
    let sum = 0;
    for (let i = 3; i < data.length; i += 4) sum += data[i];
    expect(sum / (data.length / 4)).toBeGreaterThan(145);
    expect(sum / (data.length / 4)).toBeLessThan(175);
  });

  it('écart-type de la luminance élevé (bruit franc, pas un aplat)', () => {
    const { data } = createTextureData(spec());
    const n = data.length / 4;
    let sum = 0;
    let sq = 0;
    for (let i = 0; i < data.length; i += 4) {
      const l = lum(data, i);
      sum += l;
      sq += l * l;
    }
    expect(Math.sqrt(sq / n - (sum / n) ** 2)).toBeGreaterThan(90);
  });

  it('tuilable : la première et la dernière colonne (et ligne) se raccordent comme deux voisines (règle du lot 1c)', () => {
    const { data, width, height } = createTextureData(spec());
    const diff = (a, b, axis) => {
      let sum = 0;
      const n = axis === 'x' ? height : width;
      for (let k = 0; k < n; k += 1) {
        const ia = (axis === 'x' ? k * width + a : a * width + k) * 4;
        const ib = (axis === 'x' ? k * width + b : b * width + k) * 4;
        sum += (Math.abs(data[ia] - data[ib]) + Math.abs(data[ia + 1] - data[ib + 1]) + Math.abs(data[ia + 2] - data[ib + 2]) + Math.abs(data[ia + 3] - data[ib + 3])) / 4;
      }
      return sum / n;
    };
    const neighbours = (axis) => {
      const len = axis === 'x' ? width : height;
      let sum = 0;
      for (let i = 0; i < len - 1; i += 1) sum += diff(i, i + 1, axis);
      return sum / (len - 1);
    };
    expect(diff(0, width - 1, 'x')).toBeLessThanOrEqual(1.5 * neighbours('x') + 2);
    expect(diff(0, height - 1, 'y')).toBeLessThanOrEqual(1.5 * neighbours('y') + 2);
  });

  it('déterministe : mêmes octets pour la même spécification ; autres octets pour une autre graine', () => {
    const a = createTextureData(spec());
    expect(Buffer.from(a.data).equals(Buffer.from(createTextureData(spec()).data))).toBe(true);
    expect(Buffer.from(a.data).equals(Buffer.from(createTextureData(spec({ seed: 6 })).data))).toBe(false);
  });

  it('par tranches : identique au résultat complet', () => {
    const full = createTextureData(spec());
    const data = new Uint8ClampedArray(128 * 128 * 4);
    for (let y = 0; y < 128; y += 9) fillRows(spec(), data, y, Math.min(128, y + 9));
    expect(Buffer.from(data).equals(Buffer.from(full.data))).toBe(true);
  });

  it('params.levels : 2 à 8 niveaux d\'alpha, borné', () => {
    const levels = (n) => new Set(Array.from(createTextureData(spec({ params: { levels: n } })).data).filter((_, i) => i % 4 === 3)).size;
    expect(levels(2)).toBe(2);
    expect(levels(8)).toBe(8);
    expect(levels(1)).toBe(2);
    expect(levels(100)).toBe(8);
  });

  it('adresse data: ≤ 80 ko : les octets bruts (65 536) tiennent, et même compressés sans filtre ils pèsent bien moins (≤ 20 ko)', () => {
    const { data } = createTextureData(spec());
    expect(data.length).toBeLessThanOrEqual(80 * 1024);
    const compressed = deflateSync(Buffer.from(data)).length;
    expect(compressed).toBeLessThanOrEqual(20 * 1024);
    // base64 d'un PNG de cette taille : 4/3 des octets compressés, loin des 80 ko.
    expect(Math.ceil((compressed * 4) / 3)).toBeLessThanOrEqual(80 * 1024);
  });

  it('entrées hostiles : couleurs absentes (gris neutre + avertissement), paramètres, tailles refusées', () => {
    const t = createTextureData(spec({ colors: {} }));
    expect(t.data.length).toBe(128 * 128 * 4);
    expect(t.warnings.length).toBe(2);
    for (const w of WEIRD) {
      expect(() => createTextureData(spec({ params: w })), `params ${String(w)}`).not.toThrow();
      expect(() => createTextureData(spec({ colors: w })), `colors ${String(w)}`).not.toThrow();
      expect(() => createTextureData(spec({ seed: w })), `graine ${String(w)}`).not.toThrow();
    }
    expect(createTextureData(spec({ width: 100 })).data.length).toBe(0);
  });

  it('arguments gelés : acceptés, jamais modifiés', () => {
    const frozen = deepFreeze(spec());
    const before = JSON.stringify(frozen);
    expect(() => createTextureData(frozen)).not.toThrow();
    expect(JSON.stringify(frozen)).toBe(before);
  });

  it('les autres genres restent opaques : alpha 255 partout (le grain n\'a pas laissé son alpha dans un atlas)', () => {
    const atlas = createTextureData({
      kind: 'atlas', width: 64, height: 64, seed: 1, colors: {},
      params: { regions: [{ x: 8, y: 8, w: 16, h: 16, kind: 'grain', colors: { light: LIGHT, dark: DARK } }, { x: 32, y: 8, w: 16, h: 16, kind: 'grass', colors: { a: [30, 42, 27], b: [44, 58, 38] } }] },
    });
    const x = 36;
    const y = 12;
    expect(atlas.data[(y * 64 + x) * 4 + 3]).toBe(255);
  });
});
