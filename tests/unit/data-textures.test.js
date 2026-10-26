import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { KINDS, regionRect } from '../../js/core/texgen.js';
import { LIMITS, computePose } from '../../js/core/pose.js';
import { TEXTURE_TEXTS } from '../../js/game/texts.js';
import { texturesJson, tokens, tokenCss } from './helpers/textures.js';

const { textures, budget } = texturesJson;
const walk = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(`${dir}/${e.name}`) : [`${dir}/${e.name}`]));
const atlases = textures.filter((t) => t.kind === 'atlas');
const fr = JSON.parse(readFileSync('data/i18n/fr.json', 'utf8'));
const allColors = () => textures.flatMap((t) => [t.colors, ...(t.params.regions ?? []).map((r) => r.colors)]);

describe('data/game/textures.json : budget', () => {
  it('au plus 14 textures, identifiants uniques', () => {
    expect(textures.length).toBeLessThanOrEqual(budget.maxTextures);
    expect(budget.maxTextures).toBe(14);
    expect(new Set(textures.map((t) => t.id)).size).toBe(textures.length);
  });

  it.each(textures.map((t) => [t.id, t]))('%s : carrée, puissance de deux, 1024 au plus', (_id, t) => {
    expect(Number.isInteger(t.size)).toBe(true);
    expect(t.size & (t.size - 1)).toBe(0);
    expect(t.size).toBeGreaterThanOrEqual(8);
    expect(t.size).toBeLessThanOrEqual(1024);
  });

  it('mémoire GPU estimée (octets × 4/3 pour les mipmaps) : au plus 20 Mo', () => {
    const bytes = textures.reduce((sum, t) => sum + t.size * t.size * 4 * (4 / 3), 0);
    expect(bytes).toBeLessThanOrEqual(20 * 1024 * 1024);
    expect(budget.maxBytes).toBe(20 * 1024 * 1024);
  });

  it('les textures répétées ont une taille de répétition, les atlas non', () => {
    for (const t of textures) {
      if (t.kind === 'atlas') expect(t.repeat).toBe(0);
      else expect(t.repeat).toBeGreaterThan(0);
    }
  });

  it('chaque genre cité existe dans texgen.js', () => {
    for (const t of textures) {
      expect(KINDS, t.id).toContain(t.kind);
      for (const r of t.params.regions ?? []) expect(KINDS.filter((k) => k !== 'atlas'), r.id).toContain(r.kind);
    }
  });
});

describe('data/game/textures.json : atlas', () => {
  it.each(atlases.map((t) => [t.id, t]))('%s : régions dans l\'atlas, marges de 8 px, sans chevauchement', (_id, atlas) => {
    const m = atlas.params.margin;
    expect(m).toBe(8);
    const rects = atlas.params.regions.map((r) => ({ id: r.id, x0: r.x - m, y0: r.y - m, x1: r.x + r.w + m, y1: r.y + r.h + m }));
    for (const r of rects) {
      expect(r.x0, r.id).toBeGreaterThanOrEqual(0);
      expect(r.y0, r.id).toBeGreaterThanOrEqual(0);
      expect(r.x1, r.id).toBeLessThanOrEqual(atlas.size);
      expect(r.y1, r.id).toBeLessThanOrEqual(atlas.size);
    }
    for (let i = 0; i < rects.length; i += 1) for (let j = i + 1; j < rects.length; j += 1) {
      const a = rects[i];
      const b = rects[j];
      expect(a.x1 <= b.x0 || b.x1 <= a.x0 || a.y1 <= b.y0 || b.y1 <= a.y0, `${a.id} / ${b.id}`).toBe(true);
    }
    expect(new Set(atlas.params.regions.map((r) => r.id)).size).toBe(atlas.params.regions.length);
  });

  it('regionRect donne des rectangles UV dans [0, 1]', () => {
    for (const a of atlases) for (const r of a.params.regions) {
      const u = regionRect(a.size, r);
      expect(u.u0).toBeGreaterThanOrEqual(0);
      expect(u.u1).toBeLessThanOrEqual(1);
      expect(u.u1).toBeGreaterThan(u.u0);
    }
  });
});

describe('data/game/textures.json : couleurs et textes', () => {
  it('chaque jeton --game-* cité existe dans tokens.css, en hexadécimal', () => {
    for (const map of allColors()) for (const token of Object.values(map)) {
      expect(token).toMatch(/^--game-[a-z0-9-]+$/);
      expect(tokens[token], token).toMatch(/^#[0-9a-fA-F]{6}$/);
    }
  });

  it('chaque variable --game-* de tokens.css a un commentaire de rôle', () => {
    for (const line of tokenCss.split('\n').filter((l) => /^\s*--game-/.test(l))) expect(line, line).toMatch(/\/\*.+\*\//);
  });

  it('les textes de chargement existent dans fr.json et ne sont pas orphelins', () => {
    for (const key of Object.values(TEXTURE_TEXTS)) expect(fr[key], key).toBeTruthy();
    const used = new Set(Object.values(TEXTURE_TEXTS));
    for (const key of Object.keys(fr).filter((k) => k.startsWith('game.loading') || k.startsWith('game.fps'))) expect(used.has(key), key).toBe(true);
  });
});

describe('hygiène du lot 1c', () => {
  const core = walk('js/core').filter((f) => f.endsWith('.js'));
  const all = walk('js').filter((f) => f.endsWith('.js'));

  it('aucune couleur écrite en dur dans js/', () => {
    for (const f of all) expect(readFileSync(f, 'utf8'), f).not.toMatch(/#[0-9a-fA-F]{3,8}\b|\b(?:rgb|rgba|hsl|hsla)\(/);
  });

  it('aucun Math.random, Date.now, document ni window dans js/core/', () => {
    for (const f of core) expect(readFileSync(f, 'utf8'), f).not.toMatch(/Math\.random|Date\.now|\bdocument\b|\bwindow\b/);
  });

  it('aucun Math.random dans js/', () => {
    for (const f of all) expect(readFileSync(f, 'utf8'), f).not.toMatch(/Math\.random/);
  });

  it('aucune image, police, modèle ou son nouveau : les textures sont calculées', () => {
    const files = walk('data').concat(walk('js'), walk('css'));
    expect(files.filter((f) => /\.(png|jpe?g|gif|webp|avif|svg|glb|gltf|obj|mp3|ogg|wav)$/i.test(f))).toEqual([]);
  });

  it('les noms d\'articulations de pose.js existent tous dans le squelette', () => {
    const sk = readFileSync('js/game/skeleton.js', 'utf8');
    const joints = new Set(Object.keys(computePose({ state: 'zombie' })).filter((k) => k !== 'bob' && k !== 'recoil'));
    expect([...joints].sort()).toEqual(Object.keys(LIMITS).filter((k) => k !== 'bob' && k !== 'recoil').sort());
    // Chaque articulation de pose a ses segments dans le squelette : hanche, genou, épaule, coude, tronc, tête.
    for (const name of ['THIGH', 'SHIN', 'UPPER', 'FORE', 'HIP_X', 'SHOULDER_X']) expect(sk).toContain(`export const ${name}`);
    const character = readFileSync('js/game/character.js', 'utf8');
    for (const j of ['hip', 'knee', 'shoulder', 'elbow']) expect(character).toContain(`${j}`);
  });
});
