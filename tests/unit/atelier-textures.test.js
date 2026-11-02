// Lot 3g, partie C : textures plus fines (option `fine` des genres de js/core/texgen.js, réglée par l'entrée `fine` de textures.json et par ?detail).
// Mêmes contrôles que le lot 1c : taille, raccord, écart-type, déterminisme, tranches identiques ; en plus : luminance moyenne à ±6 % de l'ancienne,
// ancien rendu identique à l'octet avec detail: false, budgets (14 textures, 12 Mo estimés, 1 024 px).
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseColor } from '../../js/core/color.js';
import { buildSpec, createTextureData, fillRows, meanColor, regionRect } from '../../js/core/texgen.js';

const tokens = Object.fromEntries([...readFileSync('css/tokens.css', 'utf8').matchAll(/(--[a-z0-9-]+):\s*(#[0-9a-fA-F]{3,6})\s*;/g)].map((m) => [m[1], m[2]]));
const lookup = (t) => parseColor(tokens[t]);
const cfg = JSON.parse(readFileSync('data/game/textures.json', 'utf8'));
const FINE = cfg.textures.filter((e) => e.fine);
const make = (e, detail = true) => createTextureData(buildSpec(e, lookup, { detail }));
const cache = new Map();
const pair = (e) => {
  if (!cache.has(e.id)) cache.set(e.id, { old: make(e, false), neu: make(e, true) });
  return cache.get(e.id);
};
// Luminance moyenne comme sampleScreen (game.js) : 0,2126 R + 0,7152 G + 0,0722 B des valeurs sRGB.
const lum = (tex) => { const [r, g, b] = meanColor(tex); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
const stdev = (tex) => {
  const n = tex.data.length / 4;
  let s = 0;
  let s2 = 0;
  for (let i = 0; i < n; i += 1) {
    const l = (tex.data[i * 4] + tex.data[i * 4 + 1] + tex.data[i * 4 + 2]) / 3;
    s += l;
    s2 += l * l;
  }
  return Math.sqrt(s2 / n - (s / n) ** 2);
};
// Écart moyen entre le bord gauche et le bord droit (et haut / bas), comparé à l'écart moyen entre deux colonnes voisines : un raccord invisible
// n'est pas plus marqué que l'intérieur.
const seam = (tex, axis) => {
  const { width: w, height: h, data } = tex;
  const px = (x, y) => (data[(y * w + x) * 4] + data[(y * w + x) * 4 + 1] + data[(y * w + x) * 4 + 2]) / 3;
  let edge = 0;
  let inner = 0;
  const n = axis === 'x' ? h : w;
  for (let k = 0; k < n; k += 1) {
    if (axis === 'x') {
      edge += Math.abs(px(w - 1, k) - px(0, k));
      inner += Math.abs(px(w / 2, k) - px(w / 2 - 1, k));
    } else {
      edge += Math.abs(px(k, h - 1) - px(k, 0));
      inner += Math.abs(px(k, h / 2) - px(k, h / 2 - 1));
    }
  }
  return edge / Math.max(1, inner);
};

describe('textures fines : six genres affinés', () => {
  it('six entrées ont des réglages fins (sol, mur, route, trottoir, herbe, terre)', () => {
    expect(FINE.map((e) => e.id)).toEqual(['sol-salle', 'mur', 'route', 'trottoir', 'herbe', 'sol-exterieur']);
  });

  it.each(FINE.map((e) => [e.id, e]))('%s : même taille qu\'avant (aucune texture agrandie), 1 024 px au plus', (_id, e) => {
    const { old, neu } = pair(e);
    expect([neu.width, neu.height]).toEqual([old.width, old.height]);
    expect(neu.width).toBeLessThanOrEqual(1024);
    expect(neu.warnings).toEqual([]);
  });

  it.each(FINE.map((e) => [e.id, e]))('%s : la texture fine diffère de l\'ancienne', (_id, e) => {
    const { old, neu } = pair(e);
    expect(neu.data.some((v, i) => v !== old.data[i])).toBe(true);
  });

  it.each(FINE.map((e) => [e.id, e]))('%s : luminance moyenne à ±6 % de l\'ancienne', (_id, e) => {
    const { old, neu } = pair(e);
    expect(Math.abs(lum(neu) / lum(old) - 1)).toBeLessThanOrEqual(0.06);
  });

  it.each(FINE.map((e) => [e.id, e]))('%s : écart-type au moins égal à l\'ancien (plus de détails, pas un aplat)', (_id, e) => {
    const { old, neu } = pair(e);
    expect(stdev(neu)).toBeGreaterThanOrEqual(stdev(old) * 0.98);
    expect(stdev(neu)).toBeGreaterThan(3);
  });

  it.each(FINE.map((e) => [e.id, e]))('%s : déterministe (deux calculs identiques)', (_id, e) => {
    const again = make(e, true);
    expect(again.data.every((v, i) => v === pair(e).neu.data[i])).toBe(true);
  });

  it.each(FINE.map((e) => [e.id, e]))('%s : calcul par tranches identique au calcul complet', (_id, e) => {
    const { neu } = pair(e);
    const spec = buildSpec(e, lookup, { detail: true });
    const d = new Uint8ClampedArray(neu.data.length);
    for (let y = 0; y < neu.height; y += 13) fillRows(spec, d, y, Math.min(neu.height, y + 13));
    expect(d.every((v, i) => v === neu.data[i])).toBe(true);
  });

  it.each(FINE.filter((e) => e.repeat > 0).map((e) => [e.id, e]))('%s : raccord invisible en x (répétée)', (_id, e) => {
    expect(seam(pair(e).neu, 'x')).toBeLessThan(2.5);
  });

  it.each(FINE.filter((e) => e.repeat > 0 && e.kind !== 'markings').map((e) => [e.id, e]))('%s : raccord invisible en y (répétée)', (_id, e) => {
    expect(seam(pair(e).neu, 'y')).toBeLessThan(2.5);
  });
});

describe('?detail=0 : textures d\'avant le lot, à l\'identique', () => {
  it.each(cfg.textures.map((e) => [e.id, e]))('%s : detail: false = l\'entrée sans réglages fins', (_id, e) => {
    const plain = { ...e };
    delete plain.fine;
    const a = make(e, false);
    const b = createTextureData(buildSpec(plain, lookup));
    expect(a.data.length).toBe(b.data.length);
    expect(a.data.every((v, i) => v === b.data[i])).toBe(true);
  });

  it('sans entrée « fine », detail ne change rien', () => {
    for (const e of cfg.textures.filter((x) => !x.fine)) {
      const a = make(e, false);
      const b = make(e, true);
      expect(a.data.every((v, i) => v === b.data[i]), e.id).toBe(true);
    }
  });

  it('buildSpec : fine.params s\'ajoute aux params, fine.size remplace la taille ; detail par défaut vrai', () => {
    const e = { id: 'x', kind: 'tiles', size: 64, params: { cells: 4 }, fine: { size: 128, params: { fine: 1 } } };
    expect(buildSpec(e, lookup)).toMatchObject({ width: 128, params: { cells: 4, fine: 1 } });
    expect(buildSpec(e, lookup, { detail: false })).toMatchObject({ width: 64, params: { cells: 4 } });
    expect(buildSpec(e, lookup, { detail: false }).params.fine).toBeUndefined();
  });
});

describe('budgets des textures', () => {
  const sizes = cfg.textures.map((e) => buildSpec(e, lookup));

  it('14 textures au plus', () => {
    expect(cfg.textures.length).toBeLessThanOrEqual(14);
  });

  it('12 Mo au plus de mémoire estimée (octets × 4/3), avec et sans détail', () => {
    const bytes = (list) => list.reduce((s, sp) => s + (sp.width * sp.height * 4 * 4) / 3, 0);
    expect(bytes(sizes)).toBeLessThanOrEqual(12 * 1024 * 1024);
    expect(bytes(cfg.textures.map((e) => buildSpec(e, lookup, { detail: false })))).toBeLessThanOrEqual(12 * 1024 * 1024);
  });

  it('1 024 px au plus par côté', () => {
    for (const sp of sizes) expect(Math.max(sp.width, sp.height), sp.id).toBeLessThanOrEqual(1024);
  });

  it('mêmes régions d\'atlas qu\'avant le lot (aucun identifiant ne disparaît)', () => {
    const atlas = cfg.textures.find((t) => t.id === 'atlas-props');
    for (const id of ['bois', 'bois-sombre', 'caisse', 'tole', 'etagere', 'colonne', 'peinture-1', 'peinture-2', 'peinture-3', 'vitre', 'pneu', 'ecorce', 'feuillage', 'buisson', 'barriere', 'lampe']) {
      expect(atlas.params.regions.map((r) => r.id)).toContain(id);
    }
    expect(regionRect(512, atlas.params.regions[0]).u1).toBeLessThanOrEqual(1);
  });

  it('aucune couleur en dur dans les réglages fins : uniquement des nombres', () => {
    for (const e of FINE) expect(JSON.stringify(e.fine)).not.toMatch(/#|rgb|--game/);
  });
});
