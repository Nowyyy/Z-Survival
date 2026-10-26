import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { MAX_ZOOM, MIN_ZOOM, computeViewport } from '../../js/core/viewport.js';

const room = JSON.parse(readFileSync('data/game/room.json', 'utf8'));

describe('viewport.js', () => {
  it.each([
    [375, 667], [667, 375], [1440, 900], [1920, 1080], [2560, 1080], [800, 1200],
  ])('fenêtre %i×%i : la salle tient entière quand le zoom n\'est pas plafonné', (w, h) => {
    const vp = computeViewport({ width: w, height: h }, room);
    expect(vp.zoom).toBeGreaterThanOrEqual(MIN_ZOOM);
    expect(vp.zoom).toBeLessThanOrEqual(MAX_ZOOM);
    if (Math.min(w / room.width, h / room.height) >= MIN_ZOOM) {
      expect(vp.fits).toBe(true);
      expect(room.width * vp.zoom).toBeLessThanOrEqual(w + 1e-6);
      expect(room.height * vp.zoom).toBeLessThanOrEqual(h + 1e-6);
    }
  });

  it('prend le plus grand zoom qui fait tenir la salle (1440×900 → 0,9)', () => {
    expect(computeViewport({ width: 1440, height: 900 }, room).zoom).toBeCloseTo(0.9);
    expect(computeViewport({ width: 2560, height: 1080 }, room).zoom).toBeCloseTo(1.2);
  });

  it('plafonne le zoom entre 0,4 et 2', () => {
    const tiny = computeViewport({ width: 100, height: 100 }, room);
    expect(tiny.zoom).toBe(MIN_ZOOM);
    expect(tiny.fits).toBe(false);
    expect(computeViewport({ width: 9000, height: 9000 }, room).zoom).toBe(MAX_ZOOM);
  });

  it('centre la caméra sur la salle', () => {
    const vp = computeViewport({ width: 1920, height: 1080 }, room);
    expect(vp.centerX).toBe(room.width / 2);
    expect(vp.centerY).toBe(room.height / 2);
  });

  it('propriétés sur une grille de tailles : zoom borné, salle visible dès que possible', () => {
    for (let w = 200; w <= 3200; w += 150) {
      for (let h = 200; h <= 2000; h += 150) {
        const vp = computeViewport({ width: w, height: h }, room);
        expect(vp.zoom).toBeGreaterThanOrEqual(MIN_ZOOM);
        expect(vp.zoom).toBeLessThanOrEqual(MAX_ZOOM);
        const ideal = Math.min(w / room.width, h / room.height);
        if (ideal >= MIN_ZOOM && ideal <= MAX_ZOOM) expect(vp.zoom).toBeCloseTo(ideal, 9);
        if (vp.zoom > MIN_ZOOM) expect(vp.fits).toBe(true);
      }
    }
  });

  it('ne lève pas d\'exception sur des entrées inattendues', () => {
    for (const bad of [null, undefined, {}, 'x', { width: NaN, height: -3 }]) {
      const vp = computeViewport(bad, bad);
      expect(Number.isFinite(vp.zoom)).toBe(true);
    }
  });
});
