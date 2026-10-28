import { describe, it, expect } from 'vitest';
import { COLOR_NAMES, KINDS, MAIN_COLOR, TILEABLE, createTextureData, fillRows, meanColor, plankSheet } from '../../js/core/texgen.js';
import { deepFreeze, WEIRD } from './helpers/monde.js';
import { specs } from './helpers/textures.js';

const COLORS = { plank: [214, 190, 140], dark: [138, 112, 72], nail: [42, 36, 32], frame: [61, 47, 34], void: [10, 10, 11], on: [233, 217, 168], off: [146, 130, 112] };
const spec = (extra = {}) => ({ id: 'planche', kind: 'planche-brute', width: 128, height: 128, seed: 19, colors: COLORS, params: {}, ...extra });
const at = (t, x, y) => [...t.data.subarray((y * t.width + x) * 4, (y * t.width + x) * 4 + 3)];
const same = (a, b) => a.every((v, i) => v === b[i]);
const BODY = 112; // 128 lignes, bandeau de 12,5 % = 16 lignes

describe('texgen.js : genre planche-brute (lot 3a)', () => {
  it('est déclaré : genre, couleurs d\'entrée, couleur principale, tuilable le long de x', () => {
    expect(KINDS).toContain('planche-brute');
    expect(COLOR_NAMES['planche-brute']).toEqual(['plank', 'dark', 'nail', 'frame', 'void', 'on', 'off']);
    expect(MAIN_COLOR['planche-brute']).toBe('plank');
    expect(TILEABLE['planche-brute']).toBe('x');
  });

  it('128 × 128, 65 536 octets, opaque, sans avertissement', () => {
    const t = createTextureData(spec());
    expect([t.width, t.height, t.data.length]).toEqual([128, 128, 128 * 128 * 4]);
    expect(t.warnings).toEqual([]);
    for (let i = 3; i < t.data.length; i += 4) if (t.data[i] !== 255) throw new Error(`alpha ${t.data[i]}`);
  });

  it('le corps du bois n\'est pas uni : écart-type de luminance d\'au moins 6', () => {
    const t = createTextureData(spec());
    let sum = 0;
    let sq = 0;
    const n = 128 * BODY;
    for (let i = 0; i < n * 4; i += 4) {
      const l = 0.3 * t.data[i] + 0.59 * t.data[i + 1] + 0.11 * t.data[i + 2];
      sum += l;
      sq += l * l;
    }
    const mean = sum / n;
    expect(Math.sqrt(sq / n - mean * mean)).toBeGreaterThan(6);
  });

  it('raccord en x : la première et la dernière colonne du corps se raccordent comme deux colonnes voisines', () => {
    const t = createTextureData(spec());
    const diff = (a, b) => {
      let s = 0;
      for (let y = 0; y < BODY; y += 1) for (let c = 0; c < 3; c += 1) s += Math.abs(t.data[(y * 128 + a) * 4 + c] - t.data[(y * 128 + b) * 4 + c]);
      return s / BODY;
    };
    let near = 0;
    for (let x = 0; x < 127; x += 1) near += diff(x, x + 1);
    expect(diff(0, 127)).toBeLessThanOrEqual((1.5 * near) / 127 + 2);
  });

  it('déterministe : même spécification, mêmes pixels ; graines différentes, textures différentes', () => {
    const a = createTextureData(spec());
    expect(createTextureData(spec()).data).toEqual(a.data);
    const b = createTextureData(spec({ seed: 20 }));
    let different = 0;
    for (let i = 0; i < a.data.length; i += 4) if (a.data[i] !== b.data[i]) different += 1;
    expect(different).toBeGreaterThan(2000);
  });

  it('couleurs d\'entrée respectées : la moyenne suit la teinte du bois, le bandeau reprend les teintes exactes', () => {
    const base = meanColor(createTextureData(spec()));
    const red = meanColor(createTextureData(spec({ colors: { ...COLORS, plank: [200, 40, 40], dark: [120, 20, 20] } })));
    expect(red[0]).toBeGreaterThan(base[0] * 0.8);
    expect(red[1]).toBeLessThan(base[1] * 0.5);
    expect(base[0]).toBeGreaterThan(base[2]);
  });

  it('bandeau de teintes unies à la bonne place : cadre, trou, pastille pleine, pastille vide (quarts de la largeur, 16 dernières lignes)', () => {
    const t = createTextureData(spec());
    const order = [COLORS.frame, COLORS.void, COLORS.on, COLORS.off];
    for (let y = BODY; y < 128; y += 5) for (let x = 0; x < 128; x += 7) expect(at(t, x, y), `${x},${y}`).toEqual(order[Math.floor(x / 32)]);
    let solid = 0;
    for (let x = 0; x < 128; x += 1) if (same(at(t, x, BODY - 1), order[Math.floor(x / 32)])) solid += 1;
    expect(solid).toBeLessThan(10); // la dernière ligne du corps n'est pas le bandeau
  });

  it('le bandeau suit params.band (0 : plus de bandeau, 0,25 : 32 lignes)', () => {
    const none = createTextureData(spec({ params: { band: 0 } }));
    expect(same(at(none, 100, 127), COLORS.off) && same(at(none, 10, 127), COLORS.frame)).toBe(false);
    const wide = createTextureData(spec({ params: { band: 0.25 } }));
    expect(at(wide, 5, 96)).toEqual(COLORS.frame);
    expect(at(wide, 5, 95)).not.toEqual(COLORS.frame);
  });

  it('quatre têtes de clou : la couleur de clou exacte apparaît près de chaque bout, sur chacune des 4 planches', () => {
    const t = createTextureData(spec());
    const nails = (x0, x1, y0, y1) => {
      let n = 0;
      for (let y = y0; y < y1; y += 1) for (let x = x0; x < x1; x += 1) if (same(at(t, x, y), COLORS.nail)) n += 1;
      return n;
    };
    for (let strip = 0; strip < 4; strip += 1) {
      const y0 = strip * 28;
      expect(nails(2, 20, y0, y0 + 28), `gauche ${strip}`).toBeGreaterThan(4);
      expect(nails(108, 126, y0, y0 + 28), `droite ${strip}`).toBeGreaterThan(4);
      expect(nails(40, 88, y0, y0 + 28), `milieu ${strip}`).toBe(0);
    }
  });

  it('chaque planche (bande) a son propre bois : les 4 bandes ne sont pas identiques', () => {
    const t = createTextureData(spec());
    let equal = 0;
    for (let y = 0; y < 28; y += 1) for (let x = 40; x < 90; x += 1) if (same(at(t, x, y), at(t, x, y + 28))) equal += 1;
    expect(equal).toBeLessThan(28 * 50 * 0.2);
    const one = createTextureData(spec({ params: { strips: 1 } }));
    expect(one.data).not.toEqual(t.data);
  });

  it('tranches : fillRows par morceaux donne exactement createTextureData', () => {
    const whole = createTextureData(spec());
    const data = new Uint8ClampedArray(128 * 128 * 4);
    for (const [a, b] of [[0, 9], [9, 40], [40, 111], [111, 128]]) expect(fillRows(spec(), data, a, b).rows).toBe(b - a);
    expect(data).toEqual(whole.data);
  });

  it('entrées hostiles : couleurs absentes ou invalides, paramètres et tailles hostiles : valeurs neutres, jamais d\'exception', () => {
    const miss = createTextureData(spec({ colors: {} }));
    expect(miss.warnings.length).toBeGreaterThanOrEqual(7);
    for (const bad of WEIRD) {
      expect(() => createTextureData(spec({ params: bad, colors: bad }))).not.toThrow();
      expect(() => createTextureData(spec({ seed: bad }))).not.toThrow();
    }
    expect(() => createTextureData(spec({ params: { band: 5, strips: 99 } }))).not.toThrow();
    expect(() => createTextureData(spec({ params: { band: -1, strips: -3 } }))).not.toThrow();
    expect(createTextureData(spec({ width: 100 })).data.length).toBe(0);
    expect(createTextureData(spec({ width: 8, height: 8 })).data.length).toBe(8 * 8 * 4);
  });

  it('la spécification gelée n\'est pas modifiée', () => {
    expect(() => createTextureData(deepFreeze(spec()))).not.toThrow();
  });

  it('la texture « planche » de textures.json produit le genre sans avertissement', () => {
    const entry = specs.find((s) => s.id === 'planche');
    expect(entry.kind).toBe('planche-brute');
    expect(createTextureData(entry).warnings).toEqual([]);
  });
});

describe('texgen.js : plankSheet (disposition de la texture « planche »)', () => {
  const sheet = plankSheet(128, { band: 0.125, strips: 4 });

  it('quatre bandes de 28 lignes, rentrées de 0,75 texel, dans le corps', () => {
    expect(sheet.strips).toHaveLength(4);
    sheet.strips.forEach((s, i) => {
      expect(s.v0).toBeCloseTo((i * 28 + 0.75) / 128, 9);
      expect(s.v1).toBeCloseTo(((i + 1) * 28 - 0.75) / 128, 9);
      expect(s.v1).toBeGreaterThan(s.v0);
      expect(s.v1).toBeLessThanOrEqual(112 / 128);
    });
  });

  it('centres des quatre teintes du bandeau : quarts de la largeur, milieu des 16 dernières lignes', () => {
    expect(sheet.cells.map((c) => c.name)).toEqual(['frame', 'void', 'on', 'off']);
    sheet.cells.forEach((c, i) => {
      expect(c.u).toBeCloseTo((i + 0.5) / 4, 9);
      expect(c.v).toBeCloseTo(120 / 128, 9);
    });
  });

  it('les UV des cellules pointent bien sur les teintes de la texture générée', () => {
    const t = createTextureData(spec());
    const names = { frame: COLORS.frame, void: COLORS.void, on: COLORS.on, off: COLORS.off };
    for (const c of sheet.cells) expect(at(t, Math.floor(c.u * 128), Math.floor(c.v * 128))).toEqual(names[c.name]);
  });

  it('entrées hostiles : repli sur 128 px, 4 bandes', () => {
    for (const bad of WEIRD) {
      expect(() => plankSheet(bad, bad)).not.toThrow();
      expect(plankSheet(bad, bad).strips).toHaveLength(4);
    }
  });
});
