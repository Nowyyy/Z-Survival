import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { contrast, parseColor } from '../../js/core/color.js';
import { createTextureData, meanColor, buildSpec } from '../../js/core/texgen.js';
import { variantFor } from '../../js/core/variants.js';
import { createCharacter, createKit } from '../../js/game/character.js';
import { lookup, specs, texturesJson, tokens } from './helpers/textures.js';
import { load } from './helpers/monde.js';

const variants = load('zombie-variants');
const stubTextures = { region: () => ({ u0: 0.1, v0: 0.1, u1: 0.2, v1: 0.2 }), texture: () => new THREE.Texture() };
const kit = createKit({ textures: stubTextures, variants, hit: parseColor(tokens['--game-hit']) && tokens['--game-hit'] });
const GROUNDS = ['sol-salle', 'herbe', 'sol-exterieur', 'route', 'trottoir'];
const ground = Object.fromEntries(GROUNDS.map((id) => [id, meanColor(createTextureData(specs.find((s) => s.id === id)))]));
const characters = [['joueur', variants.player.dominant], ...variants.zombie.variants.map((v) => [v.id, v.dominant])];

const stats = (root) => {
  let pieces = 0;
  let triangles = 0;
  root.traverse((o) => {
    if (o.isMesh) {
      pieces += 1;
      triangles += o.geometry.attributes.position.count / 3;
    }
  });
  return { pieces, triangles };
};

describe('lisibilité : contraste d\'au moins 3:1 entre la couleur dominante et la couleur moyenne du sol', () => {
  const pairs = characters.flatMap(([name, token]) => GROUNDS.map((g) => [name, token, g]));
  it.each(pairs)('%s (%s) sur %s', (_name, token, g) => {
    expect(contrast(lookup(token), ground[g])).toBeGreaterThanOrEqual(3);
  });

  it.each(['--game-laser', '--game-bullet'])('%s : au moins 4,5:1 sur chaque sol', (token) => {
    for (const g of GROUNDS) expect(contrast(lookup(token), ground[g]), `${token} sur ${g}`).toBeGreaterThanOrEqual(4.5);
  });
});

describe('personnages : pièces et triangles', () => {
  it('le joueur : 12 pièces au plus, 700 triangles au plus', () => {
    const s = stats(createCharacter(kit, 'player').root);
    expect(s.pieces).toBeLessThanOrEqual(12);
    expect(s.triangles).toBeLessThanOrEqual(700);
  });

  it.each(variants.zombie.variants.map((v, i) => [v.id, i]))('zombie %s : 12 pièces au plus, 700 triangles au plus', (_id, i) => {
    const s = stats(createCharacter(kit, 'zombie', i).root);
    expect(s.pieces).toBeLessThanOrEqual(12);
    expect(s.triangles).toBeLessThanOrEqual(700);
  });

  it('formes arrondies : aucune boîte sauf l\'arme (les autres pièces ont des normales variées)', () => {
    const c = createCharacter(kit, 'zombie', 0);
    c.root.traverse((o) => {
      if (!o.isMesh) return;
      const n = o.geometry.attributes.normal.array;
      const distinct = new Set();
      for (let i = 0; i < n.length; i += 3) distinct.add(`${n[i].toFixed(2)},${n[i + 1].toFixed(2)},${n[i + 2].toFixed(2)}`);
      expect(distinct.size).toBeGreaterThan(6);
    });
  });

  it('géométries et matériaux partagés entre les zombies d\'une même variante', () => {
    const a = createCharacter(kit, 'zombie', 1);
    const b = createCharacter(kit, 'zombie', 1);
    const meshesOf = (c) => { const out = []; c.root.traverse((o) => o.isMesh && out.push(o)); return out; };
    meshesOf(a).forEach((m, i) => {
      expect(m.geometry).toBe(meshesOf(b)[i].geometry);
      expect(m.material).toBe(meshesOf(b)[i].material);
    });
  });

  it('seules les pièces principales projettent une ombre (5 au plus)', () => {
    let casters = 0;
    createCharacter(kit, 'zombie', 0).root.traverse((o) => o.isMesh && o.castShadow && (casters += 1));
    expect(casters).toBe(5);
  });
});

describe('variantes de zombies', () => {
  it('quatre variantes, échelle dans [0,92 ; 1,08], régions existantes dans l\'atlas de personnages', () => {
    expect(variants.zombie.variants).toHaveLength(4);
    const regions = texturesJson.textures.find((t) => t.id === 'atlas-persos').params.regions.map((r) => r.id);
    for (const v of variants.zombie.variants) {
      expect(v.scale).toBeGreaterThanOrEqual(0.92);
      expect(v.scale).toBeLessThanOrEqual(1.08);
      for (const key of ['outfit', 'trousers', 'skin']) expect(regions, `${v.id} ${key}`).toContain(v[key]);
      expect(tokens[v.dominant]).toBeDefined();
    }
    expect(new Set(variants.zombie.variants.map((v) => v.outfit)).size).toBe(4);
    expect(new Set(variants.zombie.variants.map((v) => v.scale)).size).toBeGreaterThanOrEqual(3);
  });

  it('les identifiants de zombies se répartissent à parts égales entre les quatre variantes', () => {
    const c = [0, 0, 0, 0];
    for (let id = 0; id < 1000; id += 1) c[variantFor(id, 12345, variants.zombie.variants.length)] += 1;
    expect(Math.max(...c) - Math.min(...c)).toBeLessThanOrEqual(1);
  });

  it('le personnage applique l\'échelle de sa variante', () => {
    variants.zombie.variants.forEach((v, i) => expect(createCharacter(kit, 'zombie', i).root.scale.y).toBeCloseTo(v.scale, 6));
  });
});

describe('aucune trace de sang (lot 8)', () => {
  it('la peau des zombies et leurs veines ne sont jamais rouges (les tenues sont des vêtements, pas du sang)', () => {
    const atlas = texturesJson.textures.find((t) => t.id === 'atlas-persos');
    for (const r of atlas.params.regions.filter((x) => /^peau-/.test(x.id))) {
      for (const token of Object.values(r.colors)) {
        const [red, green, blue] = lookup(token);
        expect(red, `${r.id} ${token}`).toBeLessThanOrEqual(Math.max(green, blue) + 12);
      }
    }
  });

  it('les textures de personnages se génèrent sans avertissement', () => {
    expect(createTextureData(buildSpec(texturesJson.textures.find((t) => t.id === 'atlas-persos'), lookup)).warnings).toEqual([]);
    expect(specs.length).toBe(texturesJson.textures.length);
  });
});
