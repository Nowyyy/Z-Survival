import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { furnitureHitbox, furnitureParts, modelKind, wallSide } from '../../js/core/furniture-model.js';
import { deepFreeze, WEIRD } from './helpers/carte.js';

const world = JSON.parse(readFileSync('data/game/maps/rez-de-chaussee/world.json', 'utf8'));
const REG = { table: 'bois', comptoir: 'tole', caisse: 'caisse', armoire: 'bois-sombre', etagere: 'etagere' };
const furniture = world.obstacles.filter((o) => !['pilier', 'escalier'].includes(o.kind));
const tris = (p) => [...p.body, ...p.detail].reduce((n, b) => n + (b.faces === 'cotes' ? 8 : 10), 0);

describe('modèles de meubles : blocs, chaises, armoires', () => {
  it('étagères, armoires et longs cubes : armoires ; petit meuble seul : chaise ; tables et grands meubles : blocs', () => {
    expect(modelKind({ x: 0, y: 0, w: 40, h: 160, hauteur: 65, kind: 'armoire' })).toBe('armoire');
    expect(modelKind({ x: 0, y: 0, w: 20, h: 25, hauteur: 70, kind: 'etagere' })).toBe('armoire');
    expect(modelKind({ x: 0, y: 0, w: 370, h: 80, hauteur: 55, kind: 'comptoir' })).toBe('armoire');
    expect(modelKind({ x: 0, y: 0, w: 70, h: 90, hauteur: 45, kind: 'caisse' })).toBe('chaise');
    expect(modelKind({ x: 0, y: 0, w: 40, h: 40, hauteur: 55, kind: 'comptoir' })).toBe('chaise');
    expect(modelKind({ x: 0, y: 0, w: 140, h: 100, hauteur: 45, kind: 'caisse' })).toBe('boite');
    expect(modelKind({ x: 0, y: 0, w: 120, h: 90, hauteur: 40, kind: 'table' })).toBe('boite');
    expect(modelKind({ x: 0, y: 0, w: 140, h: 150, hauteur: 55, kind: 'comptoir' })).toBe('boite');
    for (const k of ['pilier', 'escalier', 'colonne']) expect(modelKind({ x: 0, y: 0, w: 30, h: 30, hauteur: 70, kind: k })).toBe('boite');
  });

  it('une table est un bloc plein de la hauteur du meuble', () => {
    const t = { x: 10, y: 20, w: 120, h: 90, hauteur: 40, kind: 'table' };
    expect(furnitureParts(t, REG)).toEqual({ kind: 'boite', body: [{ x0: 10, x1: 130, y0: 0, y1: 40, z0: 20, z1: 110, region: 'bois', faces: 'tout' }], detail: [] });
  });

  it('les boîtes restent dans le rectangle du plan du meuble ; régions d\'atlas existantes ; moins de 600 triangles en tout', () => {
    const regions = new Set(['bois', 'bois-sombre', 'tole', 'caisse', 'etagere']);
    let total = 0;
    for (const f of furniture) {
      const p = furnitureParts(furnitureHitbox(f), REG, []);
      total += tris(p);
      for (const b of [...p.body, ...p.detail]) {
        expect(b.x0, f.id).toBeGreaterThanOrEqual(f.x - 1e-6);
        expect(b.x1, f.id).toBeLessThanOrEqual(f.x + f.w + 1e-6);
        expect(b.z0, f.id).toBeGreaterThanOrEqual(f.y - 1e-6);
        expect(b.z1, f.id).toBeLessThanOrEqual(f.y + f.h + 1e-6);
        expect(b.y0, f.id).toBeGreaterThanOrEqual(0);
        expect(b.y1, f.id).toBeLessThanOrEqual(Math.max(f.hauteur, 48) + 1e-6);
        expect(regions.has(b.region), `${f.id} ${b.region}`).toBe(true);
      }
    }
    expect(total).toBeLessThan(600);
  });

  it('au plus quelques chaises sur la carte (le reste est en blocs)', () => {
    expect(furniture.filter((f) => modelKind(f) === 'chaise').length).toBeLessThanOrEqual(6);
  });

  it('boîte de collision d\'une chaise : son assise, centrée ; les autres meubles gardent leur rectangle ; le plan d\'origine est conservé', () => {
    const c = { id: 'c', x: 100, y: 200, w: 80, h: 25, hauteur: 45, kind: 'caisse' };
    const h = furnitureHitbox(c);
    expect(h).toMatchObject({ w: 17, h: 17, plan: { x: 100, y: 200, w: 80, h: 25 } });
    expect(h.x + h.w / 2).toBe(140);
    expect(h.y + h.h / 2).toBe(212.5);
    expect(modelKind(h)).toBe('chaise');
    expect(furnitureHitbox(h)).toEqual(h);
    const t = { id: 't', x: 0, y: 0, w: 120, h: 90, hauteur: 40, kind: 'table' };
    expect(furnitureHitbox(t)).toEqual(t);
  });

  it('une chaise tourne le dos au mur le plus proche : dossier du côté du mur', () => {
    const c = { x: 100, y: 100, w: 40, h: 40, hauteur: 45, kind: 'caisse' };
    const N = [{ x: 90, y: 60, w: 100, h: 20 }];
    const W = [{ x: 60, y: 90, w: 20, h: 100 }];
    const dims = (walls) => { const d = furnitureParts(c, REG, walls).detail[1]; return [d.x1 - d.x0, d.z1 - d.z0]; };
    expect(wallSide(c, N)).toBe('n');
    expect(wallSide(c, [{ x: 90, y: 150, w: 100, h: 20 }])).toBe('s');
    expect(wallSide(c, W)).toBe('w');
    expect(wallSide(c, [{ x: 150, y: 90, w: 20, h: 100 }])).toBe('e');
    expect(dims(N)[0]).toBeGreaterThan(dims(N)[1]);
    expect(dims(W)[0]).toBeLessThan(dims(W)[1]);
    const south = furnitureParts(c, REG, [{ x: 90, y: 150, w: 100, h: 20 }]).detail;
    expect(south[1].z1).toBe(south[0].z1);
    expect(wallSide(c, [])).toBe('n');
  });

  it('armoire : un module par tranche de 170, au plus 4', () => {
    expect(furnitureParts({ x: 0, y: 0, w: 370, h: 80, hauteur: 55, kind: 'comptoir' }, REG).body).toHaveLength(2);
    expect(furnitureParts({ x: 0, y: 0, w: 900, h: 40, hauteur: 60, kind: 'armoire' }, REG).body).toHaveLength(4);
  });

  it('déterministe, arguments gelés, entrées hostiles sans exception', () => {
    const f = deepFreeze({ x: 5, y: 7, w: 100, h: 60, hauteur: 40, kind: 'table' });
    expect(furnitureParts(f, REG)).toEqual(furnitureParts({ ...f }, REG));
    expect(() => furnitureHitbox(f)).not.toThrow();
    for (const bad of WEIRD) expect(() => { modelKind(bad); furnitureParts(bad, bad, bad); furnitureHitbox(bad); wallSide(bad, bad); }).not.toThrow();
    expect(furnitureParts(null).body).toEqual([]);
  });
});
