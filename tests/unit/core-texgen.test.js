import { describe, it, expect } from 'vitest';
import { COLOR_NAMES, KINDS, MAIN_COLOR, TILEABLE, buildSpec, createTextureData, fbm, fillRows, meanColor, regionRect, textureSize, valueNoise } from '../../js/core/texgen.js';
import { deepFreeze, WEIRD } from './helpers/monde.js';
import { specs } from './helpers/textures.js';

const PLAIN = KINDS.filter((k) => k !== 'atlas');
const SAMPLE = (kind) => Object.fromEntries(COLOR_NAMES[kind].map((name, i) => [name, i === 0 ? [110, 100, 90] : [90, 100, 110]]));
const spec = (kind, extra = {}) => ({ id: kind, kind, width: 64, height: 64, seed: 5, colors: SAMPLE(kind), params: {}, ...extra });
const lum = (d, i) => 0.3 * d[i] + 0.59 * d[i + 1] + 0.11 * d[i + 2];

describe('texgen : forme du résultat', () => {
  it('liste tous les genres demandés', () => {
    for (const k of ['tiles', 'planks', 'plaster', 'metal', 'asphalt', 'markings', 'sidewalk', 'grass', 'soil', 'cloth', 'denim', 'leather', 'skin', 'paint', 'glass', 'leaves', 'bark', 'crate', 'atlas']) expect(KINDS).toContain(k);
  });

  it.each(PLAIN)('%s : taille correcte, octets dans [0, 255], alpha 255', (kind) => {
    const t = createTextureData(spec(kind));
    expect([t.width, t.height, t.data.length]).toEqual([64, 64, 64 * 64 * 4]);
    expect(t.data).toBeInstanceOf(Uint8ClampedArray);
    for (let i = 3; i < t.data.length; i += 4) if (t.data[i] !== 255) throw new Error(`alpha ${t.data[i]} à ${i}`);
    expect(t.warnings).toEqual([]);
  });

  it.each(PLAIN)('%s : pas d\'image unie', (kind) => {
    const { data } = createTextureData(spec(kind));
    const n = data.length / 4;
    let sum = 0;
    let sq = 0;
    for (let i = 0; i < data.length; i += 4) {
      const l = lum(data, i);
      sum += l;
      sq += l * l;
    }
    expect(Math.sqrt(sq / n - (sum / n) ** 2)).toBeGreaterThan(3);
  });

  it('une texture non carrée est acceptée', () => {
    const t = createTextureData(spec('grass', { width: 128, height: 32 }));
    expect([t.width, t.height, t.data.length]).toEqual([128, 32, 128 * 32 * 4]);
  });
});

describe('texgen : déterminisme et couleurs', () => {
  it.each(PLAIN)('%s : mêmes octets pour la même spécification, autres octets pour une autre graine', (kind) => {
    const a = createTextureData(spec(kind));
    const b = createTextureData(spec(kind));
    const c = createTextureData(spec(kind, { seed: 6 }));
    expect(Buffer.from(a.data).equals(Buffer.from(b.data))).toBe(true);
    expect(Buffer.from(a.data).equals(Buffer.from(c.data))).toBe(false);
  });

  it.each(PLAIN)('%s : la moyenne reste proche de la couleur principale', (kind) => {
    const mean = meanColor(createTextureData(spec(kind)));
    const main = SAMPLE(kind)[MAIN_COLOR[kind]];
    for (let i = 0; i < 3; i += 1) expect(Math.abs(mean[i] - main[i])).toBeLessThan(60);
  });

  it('les couleurs d\'entrée changent le résultat', () => {
    const a = meanColor(createTextureData(spec('tiles', { params: { cells: 2 } })));
    const b = meanColor(createTextureData(spec('tiles', { colors: { a: [200, 40, 40], b: [180, 40, 40], grout: [20, 20, 20] }, params: { cells: 2 } })));
    expect(b[0]).toBeGreaterThan(a[0] + 30);
  });
});

describe('texgen : par tranches', () => {
  it.each([1, 7, 64])('tranches de %i lignes : identique au résultat complet (tous les genres)', (step) => {
    for (const kind of PLAIN) {
      const s = spec(kind);
      const full = createTextureData(s);
      const data = new Uint8ClampedArray(64 * 64 * 4);
      for (let y = 0; y < 64; y += step) expect(fillRows(s, data, y, Math.min(64, y + step)).rows).toBe(Math.min(step, 64 - y));
      expect(Buffer.from(data).equals(Buffer.from(full.data)), kind).toBe(true);
    }
  });

  it('un atlas par tranches est identique à l\'atlas complet', () => {
    const atlas = specs.find((s) => s.id === 'atlas-persos');
    const full = createTextureData(atlas);
    const data = new Uint8ClampedArray(full.data.length);
    for (let y = 0; y < atlas.height; y += 7) fillRows(atlas, data, y, y + 7);
    expect(Buffer.from(data).equals(Buffer.from(full.data))).toBe(true);
  });

  it('les tranches dans le désordre donnent le même résultat', () => {
    const s = spec('tiles');
    const data = new Uint8ClampedArray(64 * 64 * 4);
    for (const y of [40, 0, 24, 8, 56, 16, 32, 48]) fillRows(s, data, y, y + 8);
    expect(Buffer.from(data).equals(Buffer.from(createTextureData(s).data))).toBe(true);
  });

  it('refuse un tampon de mauvaise taille ou des lignes invalides sans exception', () => {
    expect(fillRows(spec('tiles'), new Uint8ClampedArray(10), 0, 4).rows).toBe(0);
    expect(fillRows(spec('tiles'), new Uint8ClampedArray(64 * 64 * 4), NaN, 4).rows).toBe(0);
    expect(fillRows(spec('tiles'), new Uint8ClampedArray(64 * 64 * 4), -5, 1000).rows).toBe(64);
  });
});

describe('texgen : pas de raccord visible (textures répétées)', () => {
  const diff = (d, w, h, a, b, axis) => {
    let sum = 0;
    const n = axis === 'x' ? h : w;
    for (let k = 0; k < n; k += 1) {
      const ia = (axis === 'x' ? k * w + a : a * w + k) * 4;
      const ib = (axis === 'x' ? k * w + b : b * w + k) * 4;
      sum += (Math.abs(d[ia] - d[ib]) + Math.abs(d[ia + 1] - d[ib + 1]) + Math.abs(d[ia + 2] - d[ib + 2])) / 3;
    }
    return sum / n;
  };
  const neighbours = (d, w, h, axis) => {
    const len = axis === 'x' ? w : h;
    let sum = 0;
    for (let i = 0; i < len - 1; i += 1) sum += diff(d, w, h, i, i + 1, axis);
    return sum / (len - 1);
  };

  it.each(PLAIN.filter((k) => TILEABLE[k] !== ''))('%s : la première et la dernière colonne (et ligne) se raccordent', (kind) => {
    const { data, width, height } = createTextureData(spec(kind, { width: 128, height: 128 }));
    expect(diff(data, width, height, 0, width - 1, 'x')).toBeLessThanOrEqual(1.5 * neighbours(data, width, height, 'x') + 2);
    if (TILEABLE[kind] === 'xy') expect(diff(data, width, height, 0, height - 1, 'y')).toBeLessThanOrEqual(1.5 * neighbours(data, width, height, 'y') + 2);
  });

  it('les genres sans répétition sont déclarés', () => {
    expect(TILEABLE.glass).toBe('');
    expect(TILEABLE.atlas).toBe('');
    expect(TILEABLE.markings).toBe('x');
  });
});

describe('texgen : bruit', () => {
  it('valueNoise et fbm sont dans [0, 1], déterministes et périodiques', () => {
    for (let i = 0; i < 50; i += 1) {
      const u = i / 50;
      const v = (i * 7) % 50 / 50;
      const a = valueNoise(u, v, 8, 3);
      expect(a).toBeGreaterThanOrEqual(0);
      expect(a).toBeLessThanOrEqual(1);
      expect(valueNoise(u, v, 8, 3)).toBe(a);
      expect(valueNoise(u + 1, v - 1, 8, 3)).toBeCloseTo(a, 9);
      expect(fbm(u + 1, v, [4, 6], 9, 3)).toBeCloseTo(fbm(u, v, [4, 6], 9, 3), 9);
    }
  });

  it('une autre graine ou une autre période change le bruit', () => {
    expect(valueNoise(0.37, 0.61, 8, 1)).not.toBe(valueNoise(0.37, 0.61, 8, 2));
    expect(fbm(0.37, 0.61, 8, 1)).not.toBe(fbm(0.37, 0.61, 16, 1));
  });

  it('ne lève pas d\'exception sur des entrées inattendues', () => {
    for (const w of WEIRD) {
      expect(Number.isFinite(valueNoise(w, w, w, w))).toBe(true);
      expect(Number.isFinite(fbm(w, w, w, w, w, w))).toBe(true);
    }
  });
});

describe('texgen : entrées hostiles et arguments gelés', () => {
  it.each(WEIRD)('spécification %j : pas d\'exception, avertissement, résultat vide', (w) => {
    const t = createTextureData(w);
    expect(t.data.length).toBe(0);
    expect(t.warnings.length).toBeGreaterThan(0);
  });

  it.each([0, -4, 3, 2000, 1.5, NaN, '64', 2048])('taille %j refusée avec avertissement', (size) => {
    const t = createTextureData(spec('tiles', { width: size, height: size }));
    expect(t.data.length).toBe(0);
    expect([t.width, t.height]).toEqual([0, 0]);
    expect(t.warnings.length).toBeGreaterThan(0);
    expect(textureSize(spec('tiles', { width: size, height: size })).width).toBe(0);
  });

  it('1024 est accepté', () => {
    expect(createTextureData(spec('glass', { width: 1024, height: 8 })).data.length).toBe(1024 * 8 * 4);
  });

  it('couleurs invalides, genre inconnu, graine invalide, paramètres hostiles : valeurs neutres et avertissements', () => {
    for (const colors of [null, {}, { a: 'rouge', b: NaN, grout: [1, 2] }, 'x']) {
      const t = createTextureData(spec('tiles', { colors }));
      expect(t.data.length).toBe(64 * 64 * 4);
      expect(t.warnings.length).toBeGreaterThan(0);
    }
    const unknown = createTextureData(spec('tiles', { kind: 'inconnu' }));
    expect(unknown.data[0]).toBe(128);
    expect(unknown.warnings.length).toBeGreaterThan(0);
    expect(createTextureData(spec('tiles', { seed: NaN })).warnings.length).toBeGreaterThan(0);
    for (const params of [null, 'x', { cells: NaN }, { cells: -3, joint: 1e9 }, { regions: 5 }]) {
      expect(() => createTextureData(spec('tiles', { params }))).not.toThrow();
    }
  });

  it('une région d\'atlas invalide est ignorée avec avertissement', () => {
    const t = createTextureData({ kind: 'atlas', width: 64, height: 64, seed: 1, colors: {}, params: { regions: [null, { x: 0, y: 0, w: 100, h: 5, kind: 'tiles' }, { x: 0, y: 0, w: 8, h: 8, kind: 'atlas' }] } });
    expect(t.data.length).toBe(64 * 64 * 4);
    expect(t.warnings.length).toBe(3);
  });

  it('les arguments gelés ne sont pas modifiés (et ne font pas échouer)', () => {
    for (const kind of KINDS) {
      const frozen = deepFreeze(spec(kind, { params: kind === 'atlas' ? { regions: [{ x: 8, y: 8, w: 16, h: 16, kind: 'grass', colors: SAMPLE('grass') }] } : {} }));
      const before = JSON.stringify(frozen);
      expect(() => createTextureData(frozen), kind).not.toThrow();
      expect(JSON.stringify(frozen)).toBe(before);
    }
    const entry = deepFreeze({ id: 'x', kind: 'tiles', size: 64, seed: 1, colors: { a: '--a' }, params: {} });
    expect(() => buildSpec(entry, () => [1, 2, 3])).not.toThrow();
  });

  it('buildSpec et regionRect : entrées hostiles', () => {
    for (const w of WEIRD) {
      expect(() => buildSpec(w, w)).not.toThrow();
      expect(regionRect(w, w)).toBeTypeOf('object');
    }
    expect(regionRect(512, { x: 8, y: 8, w: 112, h: 112 })).toEqual({ u0: 8 / 512, v0: 8 / 512, u1: 120 / 512, v1: 120 / 512 });
  });
});

describe('texgen : textures du jeu', () => {
  it('toutes les textures de data/game/textures.json sont générées sans avertissement', () => {
    for (const s of specs) {
      const t = createTextureData(s);
      expect(t.warnings, s.id).toEqual([]);
      expect(t.data.length, s.id).toBe(s.width * s.height * 4);
    }
  });

  it('la génération de toutes les textures tient dans le budget (objectif 1 500 ms, seuil 4 000 ms)', () => {
    const t0 = performance.now();
    for (const s of specs) createTextureData(s);
    const ms = performance.now() - t0;
    console.log(`texgen : ${specs.length} textures en ${ms.toFixed(0)} ms`);
    expect(ms).toBeLessThan(4000);
  });
});
