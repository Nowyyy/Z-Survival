import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const read = (p) => JSON.parse(readFileSync(p, 'utf8'));
const bench = read('data/test3d/bench.json');
const scene = read('data/test3d/scene.json');
const room = read('data/game/room.json');

describe('bench.json', () => {
  it('a 6 configurations de durées positives', () => {
    expect(bench.configs).toHaveLength(6);
    for (const v of [bench.duration, bench.warmup, bench.quickDuration, bench.quickWarmup]) expect(v).toBeGreaterThan(0);
    expect(bench.warmup).toBeLessThan(bench.duration);
    expect(bench.quickWarmup).toBeLessThan(bench.quickDuration);
    expect(bench.duration).toBe(6);
    expect(bench.quickDuration).toBe(1);
  });

  it('a 5, 8 ou 20 zombies, des ombres booléennes et un ratio de 1 ou 2', () => {
    for (const c of bench.configs) {
      expect([5, 8, 20]).toContain(c.zombies);
      expect(typeof c.shadows).toBe('boolean');
      expect([1, 2]).toContain(c.maxPixelRatio);
    }
  });

  it('reprend exactement les six configurations du cahier des charges', () => {
    expect(bench.configs.map((c) => [c.zombies, c.shadows, c.maxPixelRatio])).toEqual([
      [5, false, 1], [5, false, 2], [8, true, 1], [8, true, 2], [20, false, 1], [20, true, 2],
    ]);
    expect(Number.isInteger(bench.seed)).toBe(true);
  });
});

describe('scene.json', () => {
  const wall = room.wall;
  it('a huit meubles dans la salle, à l\'intérieur des murs', () => {
    expect(scene.furniture).toHaveLength(8);
    for (const f of scene.furniture) {
      expect(f.x - f.w / 2).toBeGreaterThanOrEqual(wall);
      expect(f.y - f.d / 2).toBeGreaterThanOrEqual(wall);
      expect(f.x + f.w / 2).toBeLessThanOrEqual(room.width - wall);
      expect(f.y + f.d / 2).toBeLessThanOrEqual(room.height - wall);
      expect([0, 1, 2]).toContain(f.tone);
      expect(f.h).toBeGreaterThan(0);
    }
  });

  it('les meubles ne se chevauchent pas', () => {
    const list = scene.furniture;
    for (let i = 0; i < list.length; i += 1) {
      for (let j = i + 1; j < list.length; j += 1) {
        const a = list[i];
        const b = list[j];
        const overlap = Math.abs(a.x - b.x) < (a.w + b.w) / 2 && Math.abs(a.y - b.y) < (a.d + b.d) / 2;
        expect(overlap, `${i} et ${j}`).toBe(false);
      }
    }
  });

  it('a trois préréglages de caméra dont un strictement vertical, 75° par défaut', () => {
    const { presets } = scene.camera;
    expect(Object.keys(presets).sort()).toEqual(['60', '75', 'dessus']);
    expect(presets.dessus.angle).toBe(90);
    expect(presets['75'].angle).toBe(75);
    expect(presets['60'].angle).toBe(60);
    expect(scene.camera.default).toBe('75');
    expect(scene.camera.smoothing).toBe(0.12);
    expect(scene.light.shadowMap).toBe(1024);
  });
});
