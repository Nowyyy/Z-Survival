import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { furnitureParts, modelKind } from '../../js/core/furniture-model.js';
import { deepFreeze, WEIRD } from './helpers/carte.js';

const world = JSON.parse(readFileSync('data/game/maps/rez-de-chaussee/world.json', 'utf8'));
const REG = { table: 'bois', comptoir: 'tole', caisse: 'caisse', armoire: 'bois-sombre', etagere: 'etagere' };
const furniture = world.obstacles.filter((o) => !['pilier', 'escalier'].includes(o.kind));
const tris = (p) => [...p.body, ...p.detail].reduce((n, b) => n + (b.faces === 'cotes' ? 8 : 10), 0);

describe('modèles de meubles : tables, chaises, armoires', () => {
  it('étagères et armoires, caisses et petits carrés, grands carrés, longs cubes : le bon modèle', () => {
    expect(modelKind({ x: 0, y: 0, w: 40, h: 160, hauteur: 65, kind: 'armoire' })).toBe('armoire');
    expect(modelKind({ x: 0, y: 0, w: 20, h: 25, hauteur: 70, kind: 'etagere' })).toBe('armoire');
    expect(modelKind({ x: 0, y: 0, w: 70, h: 90, hauteur: 45, kind: 'caisse' })).toBe('chaise');
    expect(modelKind({ x: 0, y: 0, w: 40, h: 40, hauteur: 55, kind: 'comptoir' })).toBe('chaise');
    expect(modelKind({ x: 0, y: 0, w: 120, h: 90, hauteur: 40, kind: 'table' })).toBe('table');
    expect(modelKind({ x: 0, y: 0, w: 140, h: 150, hauteur: 55, kind: 'comptoir' })).toBe('table');
    expect(modelKind({ x: 0, y: 0, w: 370, h: 80, hauteur: 55, kind: 'comptoir' })).toBe('armoire');
    for (const k of ['pilier', 'escalier', 'colonne']) expect(modelKind({ x: 0, y: 0, w: 130, h: 95, hauteur: 70, kind: k })).toBe('boite');
  });

  it('toutes les boîtes restent dans le rectangle du meuble et sous sa hauteur, régions d\'atlas existantes', () => {
    const regions = new Set(['bois', 'bois-sombre', 'tole', 'caisse', 'etagere']);
    for (const f of furniture) {
      const p = furnitureParts(f, REG);
      expect(p.body.length + p.detail.length, f.id).toBeGreaterThan(0);
      for (const b of [...p.body, ...p.detail]) {
        expect(b.x0, f.id).toBeGreaterThanOrEqual(f.x - 1e-6);
        expect(b.x1, f.id).toBeLessThanOrEqual(f.x + f.w + 1e-6);
        expect(b.z0, f.id).toBeGreaterThanOrEqual(f.y - 1e-6);
        expect(b.z1, f.id).toBeLessThanOrEqual(f.y + f.h + 1e-6);
        expect(b.y0, f.id).toBeGreaterThanOrEqual(0);
        expect(b.y1, f.id).toBeLessThanOrEqual(Math.max(f.hauteur, 26 + 22) + 1e-6);
        expect(b.x1 - b.x0).toBeGreaterThan(0);
        expect(regions.has(b.region), `${f.id} ${b.region}`).toBe(true);
      }
    }
  });

  it('budget : les modèles de la carte ajoutent peu de triangles (moins de 1 000 en tout) et les ombres ne portent que sur les corps', () => {
    const total = furniture.reduce((n, f) => n + tris(furnitureParts(f, REG)), 0);
    expect(total).toBeLessThan(1000);
    expect(furniture.every((f) => furnitureParts(f, REG).detail.every((b) => b.region))).toBe(true);
  });

  it('table : un plateau de 8 au plus et quatre pieds sous lui ; armoire : un module par tranche de 120, au plus 4', () => {
    const t = furnitureParts({ x: 0, y: 0, w: 120, h: 90, hauteur: 40, kind: 'table' }, REG);
    expect(t.body).toHaveLength(1);
    expect(t.body[0].y1 - t.body[0].y0).toBeLessThanOrEqual(8);
    expect(t.detail).toHaveLength(4);
    const a = furnitureParts({ x: 0, y: 0, w: 370, h: 80, hauteur: 55, kind: 'comptoir' }, REG);
    expect(a.body).toHaveLength(3);
    expect(furnitureParts({ x: 0, y: 0, w: 900, h: 40, hauteur: 60, kind: 'armoire' }, REG).body).toHaveLength(4);
  });

  it('déterministe, arguments gelés, entrées hostiles sans exception', () => {
    const f = deepFreeze({ x: 5, y: 7, w: 100, h: 60, hauteur: 40, kind: 'table' });
    expect(furnitureParts(f, REG)).toEqual(furnitureParts({ ...f }, REG));
    for (const bad of WEIRD) expect(() => { modelKind(bad); furnitureParts(bad, bad); }).not.toThrow();
    expect(furnitureParts(null).body).toEqual([]);
  });
});
