import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { addDebris, createDebris, plankSettings, plankPoses } from '../../js/core/plank-layout.js';
import { plankSheet } from '../../js/core/texgen.js';
import { createDebrisMeshes, createWindowMeshes } from '../../js/game/windows-mesh.js';
import { geoms as rawGeoms, layout, windowsCfg, world } from './helpers/carte.js';
import { readFileSync } from 'node:fs';

const render = JSON.parse(readFileSync('data/game/render.json', 'utf8'));
const settings = plankSettings(windowsCfg, render);
const sheet = plankSheet(128, { band: 0.125, strips: 4 });
const geoms = rawGeoms.map((g) => ({ ...g, inner: layout.faceInner(g) }));
const mk = () => {
  const scene = new THREE.Scene();
  return { scene, material: new THREE.MeshBasicMaterial() };
};
const layoutArg = { params: settings, obstacles: layout.furniture, bounds: layout.bounds, inside: layout.inside };

describe('rendu de la carte (lot 3b) : maillages des 8 fenêtres', () => {
  it('huit maillages de fenêtre à capacité fixe de 42 triangles', () => {
    const { scene, material } = mk();
    const set = createWindowMeshes({ scene, material, geoms, settings, sheet, seed: 1 });
    expect(set.meshes.length).toBe(8);
    set.sync({ windows: Object.fromEntries(geoms.map((g) => [g.id, { planks: 4, maxPlanks: 4 }])) });
    for (const m of set.meshes) expect(m.geometry.attributes.position.count / 3).toBe(42);
    expect(set.nailed()).toBe(32);
  });

  it('les quatre carrés de chaque fenêtre sont sur le dessus du mur (y = 60,3) et dans la surface du mur', () => {
    const t = world.wallThickness;
    for (const g of geoms) {
      const poses = plankPoses(g, settings, 1);
      expect(poses.length).toBe(4);
      const spot = { x: g.center.x + g.normal.x * settings.pipShift, y: g.center.y + g.normal.y * settings.pipShift };
      for (let i = 0; i < 4; i += 1) {
        const along = (i - 1.5) * settings.pipStep;
        for (const [sa, sb] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
          const h = settings.pip / 2;
          const x = spot.x + g.tangent.x * (along + sa * h) + g.normal.x * sb * h;
          const y = spot.y + g.tangent.y * (along + sa * h) + g.normal.y * sb * h;
          const onWall = [...layout.walls, ...layout.gaps].some((r) => x >= r.x - 1e-6 && x <= r.x + r.w + 1e-6 && y >= r.y - 1e-6 && y <= r.y + r.h + 1e-6);
          expect(onWall, `${g.id} carré ${i}`).toBe(true);
        }
      }
      expect(t).toBe(40);
    }
    expect(settings.wall + settings.pipLift).toBeCloseTo(60.3, 6);
  });

  it('débris : un maillage par fenêtre, invisible sans débris, 4 triangles par débris, 4 débris au plus par fenêtre (32 au total)', () => {
    const { scene, material } = mk();
    const meshes = createDebrisMeshes({ scene, material, settings, sheet, ids: geoms.map((g) => g.id) });
    expect(meshes.meshes.length).toBe(8);
    for (const m of meshes.meshes) expect(m.visible).toBe(false);
    let state = createDebris();
    for (const g of geoms) for (let k = 0; k < 4; k += 1) state = addDebris(state, g, 3, layoutArg);
    expect(state.items.length).toBeLessThanOrEqual(32);
    meshes.sync(state.items);
    for (const g of geoms) {
      const mine = state.items.filter((d) => d.window === g.id);
      expect(mine.length).toBeLessThanOrEqual(4);
      const m = meshes.meshes.find((x) => x.name === `debris-${g.id}`);
      expect(m.visible).toBe(mine.length > 0);
      expect(m.geometry.drawRange.count).toBe(mine.length * 12);
    }
    expect(meshes.count()).toBe(state.items.length);
  });

  it('chaque maillage de débris a son volume englobant : hors du champ de la caméra, il n\'est pas dessiné', () => {
    const { scene, material } = mk();
    const meshes = createDebrisMeshes({ scene, material, settings, sheet, ids: geoms.map((g) => g.id) });
    let state = createDebris();
    for (const g of geoms) state = addDebris(state, g, 5, layoutArg);
    meshes.sync(state.items);
    const camera = new THREE.PerspectiveCamera(40, 1.6, 20, 9000);
    camera.position.set(1980, 700, 2500);
    camera.lookAt(1980, 0, 2065);
    const stats = meshes.stats(camera);
    expect(stats.length).toBe(8);
    expect(stats.find((s) => s.id === 'F1').inFrustum).toBe(false);
    expect(stats.some((s) => s.inFrustum)).toBe(true);
  });

  it('createDebrisMeshes sans identifiants ou avec des entrées hostiles : aucun maillage, aucune exception', () => {
    const { scene, material } = mk();
    const empty = createDebrisMeshes({ scene, material, settings, sheet, ids: null });
    expect(empty.meshes).toEqual([]);
    expect(() => empty.sync(null)).not.toThrow();
    expect(empty.count()).toBe(0);
  });
});
