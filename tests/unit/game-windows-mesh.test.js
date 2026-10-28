import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { addDebris, createDebris, faceDistance, plankSettings } from '../../js/core/plank-layout.js';
import { plankSheet } from '../../js/core/texgen.js';
import { windowGeometries } from '../../js/core/windows.js';
import { windowsWithGaps } from '../../js/core/layout.js';
import { createDebrisMesh, createWindowMeshes } from '../../js/game/windows-mesh.js';
import { layout, load, world } from './helpers/monde.js';

const windowsCfg = load('windows');
const render = load('render');
const settings = plankSettings(windowsCfg, render);
const sheet = plankSheet(128, { band: 0.125, strips: 4 });
const geoms = windowGeometries(windowsWithGaps(layout), windowsCfg).map((g) => ({ ...g, inner: faceDistance(world.room, g) }));
const state = (planks) => ({ windows: Object.fromEntries(geoms.map((g) => [g.id, { planks, maxPlanks: 4 }])) });
const make = () => {
  const scene = new THREE.Scene();
  const material = new THREE.MeshBasicMaterial();
  const set = createWindowMeshes({ scene, material, geoms, settings, sheet, seed: 1 });
  return { scene, material, set };
};
const positions = (mesh) => mesh.geometry.attributes.position.array;

describe('windows-mesh.js : un maillage par fenêtre', () => {
  it('trois maillages dans la scène, sans ombre, partageant la même matière', () => {
    const { scene, set, material } = make();
    expect(set.meshes).toHaveLength(3);
    for (const m of set.meshes) {
      expect(scene.children).toContain(m);
      expect(m.castShadow).toBe(false);
      expect(m.receiveShadow).toBe(false);
      expect(m.frustumCulled).toBe(true);
      expect(m.material).toBe(material);
    }
  });

  it('capacité fixe de 42 triangles (126 sommets) par fenêtre', () => {
    const { set } = make();
    for (const m of set.meshes) {
      expect(positions(m).length / 9).toBe(42);
      expect(m.geometry.attributes.normal.count).toBe(126);
      expect(m.geometry.attributes.uv.count).toBe(126);
      expect(m.geometry.index).toBeNull();
    }
  });

  it.each([[4, 40], [3, 38], [2, 34], [1, 30], [0, 26]])('%i planches : %i triangles non dégénérés (le trou sombre n\'apparaît que s\'il manque une planche)', (planks, triangles) => {
    const { set } = make();
    set.sync(state(planks));
    const [first] = set.meshes;
    expect(set.nailed()).toBe(planks * 3);
    const stats = set.stats(new THREE.PerspectiveCamera());
    for (const s of stats) expect(s.triangles).toBe(triangles);
    expect(first.geometry.attributes.position.array.length).toBe(42 * 9);
  });

  it.each([4, 3, 2, 1, 0])('%i planches : aucun sommet de poutre sous l\'allège + 0,5, écart au mur d\'au moins 2 (sommets réels du maillage)', (planks) => {
    const { set } = make();
    set.sync(state(planks));
    for (const s of set.stats(new THREE.PerspectiveCamera())) {
      if (planks === 0) {
        expect(s.minY).toBeNull();
        expect(s.minWallGap).toBeNull();
      } else {
        expect(s.minY).toBeGreaterThanOrEqual(16.5 - 1e-6);
        expect(s.minWallGap).toBeGreaterThanOrEqual(2 - 1e-6);
      }
    }
  });

  it.each([[4, 4, false], [3, 3, true], [2, 2, true], [1, 1, true], [0, 0, true]])('%i planches : %i pastilles pleines, trou sombre visible : %s (lu sur les sommets et les UV réels)', (planks, pips, hole) => {
    const { set } = make();
    set.sync(state(planks));
    for (const s of set.stats(new THREE.PerspectiveCamera())) expect([s.pipsOn, s.voidVisible, s.beams]).toEqual([pips, hole, planks]);
  });

  it('un élément absent est écrasé en un point : aucun sommet visible à l\'origine du monde hors des triangles dégénérés', () => {
    const { set } = make();
    set.sync(state(0));
    const pos = positions(set.meshes[0]);
    let zeroTriangles = 0;
    for (let t = 0; t < 42; t += 1) if (pos.slice(t * 9, t * 9 + 9).every((v) => v === 0)) zeroTriangles += 1;
    expect(zeroTriangles).toBe(16);
  });

  it('ne réécrit rien quand l\'état ne change pas (aucune mise à jour par image)', () => {
    const { set } = make();
    set.sync(state(2));
    const versions = set.meshes.map((m) => [m.geometry.attributes.position.version, m.geometry.attributes.uv.version]);
    for (let i = 0; i < 20; i += 1) set.sync(state(2));
    expect(set.meshes.map((m) => [m.geometry.attributes.position.version, m.geometry.attributes.uv.version])).toEqual(versions);
    set.sync(state(3));
    expect(set.meshes[0].geometry.attributes.position.version).toBeGreaterThan(versions[0][0]);
  });

  it('ne réécrit que la fenêtre dont l\'état change', () => {
    const { set } = make();
    set.sync(state(4));
    const v = set.meshes.map((m) => m.geometry.attributes.position.version);
    const next = state(4);
    next.windows['fenetre-ouest'].planks = 1;
    set.sync(next);
    const after = set.meshes.map((m) => m.geometry.attributes.position.version);
    expect(after[0]).toBe(v[0]);
    expect(after[1]).toBeGreaterThan(v[1]);
    expect(after[2]).toBe(v[2]);
  });

  it('pastilles : le carré intérieur est « plein » (teinte pip-on) pour chaque planche présente et sombre (trou) sinon', () => {
    const { set } = make();
    set.sync(state(2));
    const uv = set.meshes[0].geometry.attributes.uv.array;
    const cell = (name) => sheet.cells.find((c) => c.name === name);
    // 12 sommets par poutre (4), cadre 24, trou 6 : les pastilles commencent au sommet 78, 12 sommets chacune, le carré intérieur à la moitié.
    const inner = (i) => [uv[(78 + i * 12 + 6) * 2], uv[(78 + i * 12 + 6) * 2 + 1]];
    const near = (got, name) => {
      expect(got[0]).toBeCloseTo(cell(name).u, 6);
      expect(got[1]).toBeCloseTo(cell(name).v, 6);
    };
    near(inner(0), 'on');
    near(inner(1), 'on');
    near(inner(2), 'void');
    near(inner(3), 'void');
    const outer = (i) => [uv[(78 + i * 12) * 2], uv[(78 + i * 12) * 2 + 1]];
    for (let i = 0; i < 4; i += 1) near(outer(i), 'off');
    expect(set.stats(new THREE.PerspectiveCamera()).map((s) => s.pipsOn)).toEqual([2, 2, 2]);
  });

  it('réparation : le carré de la pastille en cours se remplit avec la progression (côté 8 × progression), sans réécriture si elle ne change pas', () => {
    const { set } = make();
    const side = (progress) => {
      const st = state(2);
      st.windows['fenetre-nord'].repairProgress = progress;
      set.sync(st);
      const pos = positions(set.meshes[0]);
      const base = (78 + 2 * 12 + 6) * 3; // pastille 2 (la troisième), carré intérieur
      const xs = Array.from({ length: 6 }, (_, k) => [pos[base + k * 3], pos[base + k * 3 + 2]]);
      return Math.max(...xs.map((a) => Math.max(...xs.map((b) => Math.hypot(a[0] - b[0], a[1] - b[1])))));
    };
    expect(side(0)).toBeCloseTo(Math.hypot(8, 8), 4);
    expect(side(0.5)).toBeCloseTo(Math.hypot(4, 4), 4);
    expect(side(1)).toBeCloseTo(Math.hypot(8, 8), 4);
    expect(set.stats(new THREE.PerspectiveCamera())[0].pipsOn).toBe(3);
    const v = set.meshes[0].geometry.attributes.position.version;
    set.sync((() => { const st = state(2); st.windows['fenetre-nord'].repairProgress = 1; return st; })());
    expect(set.meshes[0].geometry.attributes.position.version).toBe(v);
  });

  it('pastilles : carrés de 16 sur le dessus du mur (60,3), alignés le long du mur et centrés sur la fenêtre', () => {
    const { set } = make();
    for (const [w, g] of geoms.entries()) {
      const pos = positions(set.meshes[w]);
      const xs = [];
      for (let i = 0; i < 4; i += 1) {
        const pts = Array.from({ length: 6 }, (_, k) => pos.slice((78 + i * 12 + k) * 3, (78 + i * 12 + k) * 3 + 3));
        for (const p of pts) expect(p[1]).toBeCloseTo(60.3, 4);
        const lat = pts.map((p) => (p[0] - g.center.x) * g.tangent.x + (p[2] - g.center.y) * g.tangent.y);
        expect(Math.max(...lat) - Math.min(...lat)).toBeCloseTo(16, 6);
        xs.push((Math.max(...lat) + Math.min(...lat)) / 2);
        const depth = pts.map((p) => (p[0] - g.center.x) * g.normal.x + (p[2] - g.center.y) * g.normal.y);
        expect((Math.max(...depth) + Math.min(...depth)) / 2).toBeCloseTo(8, 6);
      }
      expect(xs.reduce((a, b) => a + b, 0)).toBeCloseTo(0, 6);
      expect(xs[1] - xs[0]).toBeCloseTo(18, 6);
    }
  });

  it('cadre et trou collés à la face intérieure du mur, dans l\'ouverture', () => {
    const { set } = make();
    for (const [w, g] of geoms.entries()) {
      const pos = positions(set.meshes[w]);
      const voidStart = 48 + 24;
      for (let v = voidStart; v < voidStart + 6; v += 1) {
        const gap = -((pos[v * 3] - g.center.x) * g.normal.x + (pos[v * 3 + 2] - g.center.y) * g.normal.y) - g.inner;
        expect(gap).toBeGreaterThan(0);
        expect(gap).toBeLessThan(1);
        expect(pos[v * 3 + 1]).toBeGreaterThanOrEqual(16 - 1e-6);
        expect(pos[v * 3 + 1]).toBeLessThanOrEqual(44 + 1e-6);
      }
      for (let v = 48; v < 72; v += 1) {
        const gap = -((pos[v * 3] - g.center.x) * g.normal.x + (pos[v * 3 + 2] - g.center.y) * g.normal.y) - g.inner;
        expect(gap).toBeGreaterThan(0);
        expect(gap).toBeLessThan(1);
      }
    }
  });

  it('normales unitaires ; faces avant des poutres et du cadre tournées vers la salle, pastilles vers le haut', () => {
    const { set } = make();
    for (const [w, g] of geoms.entries()) {
      const nor = set.meshes[w].geometry.attributes.normal.array;
      for (let v = 0; v < 126; v += 1) expect(Math.hypot(nor[v * 3], nor[v * 3 + 1], nor[v * 3 + 2])).toBeCloseTo(1, 5);
      expect(nor[0] * -g.normal.x + nor[2] * -g.normal.y).toBeGreaterThan(0.99); // face avant de la première poutre
      expect(nor[6 * 3 + 1]).toBeGreaterThan(0.9); // dessus
      expect(nor[48 * 3] * -g.normal.x + nor[48 * 3 + 2] * -g.normal.y).toBeGreaterThan(0.99); // cadre
      expect(nor[78 * 3 + 1]).toBeCloseTo(1, 6); // pastille
    }
  });

  it('volume englobant calculé une fois : il contient tous les sommets et ne change pas avec l\'état', () => {
    const { set } = make();
    const spheres = set.meshes.map((m) => m.geometry.boundingSphere.clone());
    for (const [w, m] of set.meshes.entries()) {
      const pos = positions(m);
      for (let v = 0; v < 126; v += 1) expect(spheres[w].distanceToPoint(new THREE.Vector3(pos[v * 3], pos[v * 3 + 1], pos[v * 3 + 2]))).toBeLessThanOrEqual(1e-6);
    }
    set.sync(state(0));
    set.sync(state(4));
    expect(set.meshes.map((m) => m.geometry.boundingSphere.radius)).toEqual(spheres.map((s) => s.radius));
    expect(Math.max(...spheres.map((s) => s.radius))).toBeLessThan(200);
  });

  it('champ de la caméra : une fenêtre loin de la vue n\'est pas dans le champ, celle qu\'on regarde l\'est', () => {
    const { set } = make();
    set.sync(state(4));
    const camera = new THREE.PerspectiveCamera(40, 16 / 9, 20, 9000);
    const g = geoms[0];
    camera.position.set(g.center.x, 400, g.center.y + 400);
    camera.lookAt(g.center.x, 0, g.center.y + 60);
    const near = set.stats(camera);
    expect(near.find((s) => s.id === 'fenetre-nord').inFrustum).toBe(true);
    expect(near.find((s) => s.id === 'fenetre-est').inFrustum).toBe(false);
    camera.position.set(0, 400, 0);
    camera.lookAt(-500, 0, -500);
    for (const s of set.stats(camera)) expect(s.inFrustum).toBe(false);
  });

  it('état invalide : jamais d\'exception, planches ramenées entre 0 et 4', () => {
    const { set } = make();
    for (const bad of [undefined, null, NaN, 'x', {}, { windows: null }, { windows: { 'fenetre-nord': { planks: 99 } } }, { windows: { 'fenetre-nord': { planks: -3 } } }]) expect(() => set.sync(bad)).not.toThrow();
    set.sync({ windows: { 'fenetre-nord': { planks: 99 } } });
    expect(set.stats(new THREE.PerspectiveCamera())[0].triangles).toBe(40);
  });
});

describe('windows-mesh.js : débris', () => {
  const layoutArg = { params: settings, obstacles: layout.furniture, bounds: layout.bounds };
  const items = (n) => {
    let s = createDebris();
    for (let i = 0; i < n; i += 1) s = addDebris(s, geoms[i % 3], 2, layoutArg);
    return s.items;
  };
  const make2 = () => {
    const scene = new THREE.Scene();
    const material = new THREE.MeshBasicMaterial();
    return { scene, mesh: createDebrisMesh({ scene, material, settings: { ...settings, debrisLife: 25 }, sheet }), material };
  };

  it('un maillage, invisible sans débris (aucun appel de dessin), sans ombre, partageant la matière', () => {
    const { scene, mesh, material } = make2();
    expect(scene.children).toContain(mesh.mesh);
    expect(mesh.mesh.visible).toBe(false);
    expect(mesh.mesh.material).toBe(material);
    expect(mesh.mesh.castShadow).toBe(false);
    expect(mesh.count()).toBe(0);
  });

  it.each([1, 5, 12])('%i débris : 4 triangles chacun, une seule plage de dessin', (n) => {
    const { mesh } = make2();
    mesh.sync(items(n));
    expect(mesh.mesh.visible).toBe(true);
    expect(mesh.mesh.geometry.drawRange).toEqual({ start: 0, count: n * 12 });
    expect(mesh.count()).toBe(n);
  });

  it('plafonné à 12 débris même si la liste est plus longue', () => {
    const { mesh } = make2();
    mesh.sync(Array.from({ length: 30 }, (_, i) => ({ ...items(1)[0], id: i })));
    expect(mesh.count()).toBe(12);
  });

  it('tous les sommets à 0,3 du sol ou plus ; retour à l\'invisible quand la liste se vide', () => {
    const { mesh } = make2();
    const list = items(12);
    mesh.sync(list);
    const pos = mesh.mesh.geometry.attributes.position.array;
    for (let v = 0; v < list.length * 12; v += 1) expect(pos[v * 3 + 1]).toBeGreaterThanOrEqual(0.3 - 1e-6);
    mesh.sync([]);
    expect(mesh.mesh.visible).toBe(false);
    expect(mesh.count()).toBe(0);
  });

  it('disparition en 1 s : à l\'échelle 0,5 le débris est moitié moins long ; sous mouvement réduit il garde sa taille', () => {
    const { mesh } = make2();
    const [d] = items(1);
    const length = (reduced, age) => {
      mesh.sync([{ ...d, age }], reduced);
      const pos = mesh.mesh.geometry.attributes.position.array;
      const xs = Array.from({ length: 6 }, (_, k) => [pos[k * 3], pos[k * 3 + 2]]);
      return Math.max(...xs.map((a) => Math.max(...xs.map((b) => Math.hypot(a[0] - b[0], a[1] - b[1])))));
    };
    const full = length(false, 0);
    expect(length(false, 24.5)).toBeLessThan(full * 0.6);
    expect(length(true, 24.5)).toBeCloseTo(full, 6);
  });

  it('ne réécrit pas le maillage quand la liste ne change pas', () => {
    const { mesh } = make2();
    const list = items(4);
    mesh.sync(list);
    const version = mesh.mesh.geometry.attributes.position.version;
    for (let i = 0; i < 10; i += 1) mesh.sync(list);
    expect(mesh.mesh.geometry.attributes.position.version).toBe(version);
  });

  it('volume englobant : contient chaque débris', () => {
    const { mesh } = make2();
    const list = items(12);
    mesh.sync(list);
    for (const d of list) expect(mesh.mesh.geometry.boundingSphere.distanceToPoint(new THREE.Vector3(d.x, d.y, d.z))).toBeLessThanOrEqual(0);
  });

  it('entrées hostiles : aucune exception', () => {
    const { mesh } = make2();
    for (const bad of [undefined, null, NaN, 'x', {}, 5]) expect(() => mesh.sync(bad)).not.toThrow();
  });
});
