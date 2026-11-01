import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import {
  PART_KINDS, boundsOf, buildPartGeometry, characterStats, checkVariant, distinctness, eulerMatrix, expandParts, fkPose, gameCamera,
  groundContact, jointMatrices, jointsOf, mergeParts, partDims, partTriangles, projectPoint, silhouetteMetrics, unitsPerPixel,
} from '../../js/core/character-parts.js';

// Lot 3j-A : kit de construction pur des personnages.
const SKEL = { s: { joints: [{ id: 'pelvis', parent: null, offset: [0, 20, 0] }, { id: 'spine', parent: 'pelvis', offset: [0, 4, 0] }, { id: 'head', parent: 'spine', offset: [0, 18, 0] }, { id: 'hipL', parent: 'pelvis', offset: [5, 0, 0] }, { id: 'hipR', parent: 'pelvis', offset: [-5, 0, 0] }] } };
const box = (id, joint, dims, offset = [0, 0, 0], extra = {}) => ({ id, joint, kind: 'box', dims, offset, ...extra });
const BODY = {
  id: 'essai',
  skeleton: 's',
  scale: 1,
  parts: [
    box('pelvis', 'pelvis', { w: 12, h: 6, d: 8 }, [0, 0, 0], { casts: true }),
    box('torso', 'spine', { w: 16, h: 18, d: 9 }, [0, 8.5, 0], { casts: true }),
    box('head', 'head', { w: 8, h: 9, d: 8 }, [0, 4.5, 0], { casts: true }),
    box('legL', 'hipL', { w: 5, h: 20, d: 5 }, [0, -10, 0], { mirror: true }),
  ],
};
const SAMPLES = [
  { kind: 'box', dims: { w: 2, h: 3, d: 4 } },
  { kind: 'taper', dims: { r0: 2, r1: 1, h: 5, sides: 4 } },
  { kind: 'taper', dims: { r0: 2, r1: 1.5, h: 5, sides: 6 } },
  { kind: 'taper', dims: { r0: 3, r1: 1, h: 5, sides: 8 } },
  { kind: 'capsule', dims: { r: 2, h: 10, caps: 1, radial: 6 } },
  { kind: 'capsule', dims: { r: 5, h: 19, caps: 2, radial: 8, sx: 1.85 } },
  { kind: 'sphere', dims: { rx: 4, ry: 5, rz: 4, w: 8, h: 5 } },
  { kind: 'sphere', dims: { rx: 2, ry: 2, rz: 2, w: 6, h: 4 } },
  { kind: 'wedge', dims: { w: 4, h: 2, d: 6 } },
  { kind: 'quad', dims: { w: 3, h: 8 } },
];
const EXPECTED = [12, 12, 20, 28, 36, 80, 64, 36, 8, 4];

describe('types de pièces : coût exact', () => {
  it('six types, ceux des géométries du jeu plus le prisme et la bande de tissu', () => {
    expect(PART_KINDS).toEqual(['box', 'taper', 'capsule', 'sphere', 'wedge', 'quad']);
  });
  it.each(SAMPLES.map((p, i) => [`${p.kind} ${JSON.stringify(p.dims)}`, p, EXPECTED[i]]))('%s : %i triangles', (_n, part, tri) => {
    expect(partTriangles(part)).toBe(tri);
    expect(buildPartGeometry(part).indices.length / 3).toBe(tri);
  });
  it('type inconnu : 0 triangle, géométrie vide, dimensions nulles', () => {
    expect(partTriangles({ kind: 'cone' })).toBe(0);
    expect(buildPartGeometry({ kind: 'cone' }).positions).toEqual([]);
    expect(partDims({ kind: 'cone' })).toBeNull();
    expect(partTriangles(null)).toBe(0);
  });
  it('dimensions bornées : côtés du tronc de pyramide entre 4 et 8', () => {
    expect(partDims({ kind: 'taper', dims: { sides: 2 } }).sides).toBe(4);
    expect(partDims({ kind: 'taper', dims: { sides: 30 } }).sides).toBe(8);
    expect(partDims({ kind: 'box', dims: { w: -3 } }).w).toBeGreaterThan(0);
  });
});

describe('buildPartGeometry : tableaux purs valides', () => {
  it.each(SAMPLES.map((p) => [p.kind, p]))('%s : normales unitaires, indices valides, aucun NaN', (_k, part) => {
    const g = buildPartGeometry({ ...part, offset: [1, 2, 3], rotation: [0.3, -0.2, 0.5] });
    const verts = g.positions.length / 3;
    expect(g.normals.length).toBe(g.positions.length);
    expect(g.uvs.length / 2).toBe(verts);
    for (const v of [...g.positions, ...g.normals, ...g.uvs]) expect(Number.isFinite(v)).toBe(true);
    for (let i = 0; i < g.normals.length; i += 3) expect(Math.hypot(g.normals[i], g.normals[i + 1], g.normals[i + 2])).toBeCloseTo(1, 6);
    for (const i of g.indices) {
      expect(Number.isInteger(i)).toBe(true);
      expect(i).toBeGreaterThanOrEqual(0);
      expect(i).toBeLessThan(verts);
    }
  });
  it.each([[3.6, 15, 1, 8, 1, 0.62], [5, 19, 2, 8, 1.85, 1], [2.5, 10, 1, 6, 1, 1], [2.1, 10, 1, 6, 1, 1]])('capsule r %f h %f : mêmes sommets et normales que CapsuleGeometry de Three.js', (r, h, caps, radial, sx, sz) => {
    const three = new THREE.CapsuleGeometry(r, Math.max(0.01, h - 2 * r), caps, radial).scale(sx, 1, sz).translate(0, 1.5, 0).rotateZ(Math.PI / 2);
    const mine = buildPartGeometry({ kind: 'capsule', dims: { r, h, caps, radial, sx, sz }, offset: [-1.5, 0, 0], rotation: [0, 0, Math.PI / 2] });
    const p = three.attributes.position.array;
    const nn = three.attributes.normal.array;
    expect(mine.positions.length).toBe(p.length);
    for (let i = 0; i < p.length; i += 1) {
      expect(Math.abs(mine.positions[i] - p[i])).toBeLessThan(1e-5);
      expect(Math.abs(mine.normals[i] - nn[i])).toBeLessThan(1e-5);
    }
    expect(mine.indices).toEqual([...three.index.array]);
  });
  it.each([[4.7, 5.2, 4.9, 8, 5], [5, 3, 5.2, 8, 3], [2.3, 2.3, 2.3, 6, 4], [3.3, 2.15, 5.6, 6, 4]])('sphère %f×%f×%f (%i, %i) : mêmes sommets que SphereGeometry de Three.js', (rx, ry, rz, w, h) => {
    const three = new THREE.SphereGeometry(1, w, h).scale(rx, ry, rz).translate(0, 2, 1);
    const mine = buildPartGeometry({ kind: 'sphere', dims: { rx, ry, rz, w, h }, offset: [0, 2, 1] });
    const p = three.attributes.position.array;
    for (let i = 0; i < p.length; i += 1) expect(Math.abs(mine.positions[i] - p[i])).toBeLessThan(1e-5);
    expect(mine.indices).toEqual([...three.index.array]);
  });
  it('boîte : mêmes bornes que BoxGeometry de Three.js', () => {
    const g = buildPartGeometry({ kind: 'box', dims: { w: 2.8, h: 8.5, d: 3.4 }, offset: [0, -5.4, 1.4] });
    const three = new THREE.BoxGeometry(2.8, 8.5, 3.4).translate(0, -5.4, 1.4);
    three.computeBoundingBox();
    const xs = (k) => g.positions.filter((_, i) => i % 3 === k);
    expect(Math.min(...xs(1))).toBeCloseTo(three.boundingBox.min.y, 6);
    expect(Math.max(...xs(2))).toBeCloseTo(three.boundingBox.max.z, 6);
  });
  it('rotation d\'Euler : mêmes matrices que Three.js (ordres XYZ et YXZ)', () => {
    for (const order of ['XYZ', 'YXZ']) {
      const m = eulerMatrix([0.3, -0.7, 1.1], order);
      const t = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(0.3, -0.7, 1.1, order)).elements;
      const rows = [[t[0], t[4], t[8]], [t[1], t[5], t[9]], [t[2], t[6], t[10]]].flat();
      rows.forEach((v, i) => expect(m[i]).toBeCloseTo(v, 12));
    }
  });
  it('la bande de tissu a deux faces de normales opposées', () => {
    const g = buildPartGeometry({ kind: 'quad', dims: { w: 2, h: 5 } });
    expect(g.normals[2]).toBeCloseTo(-g.normals[14], 9);
  });
  it('les arguments ne sont pas modifiés (pièce gelée acceptée)', () => {
    const part = Object.freeze({ kind: 'capsule', dims: Object.freeze({ r: 2, h: 8 }), offset: Object.freeze([1, 2, 3]) });
    expect(() => buildPartGeometry(part)).not.toThrow();
    expect(part.offset).toEqual([1, 2, 3]);
  });
});

describe('expandParts, jointsOf, jointMatrices', () => {
  it('une pièce symétrique crée sa jumelle côté R (x opposé)', () => {
    const parts = expandParts(BODY);
    expect(parts.map((p) => p.id)).toEqual(['pelvis', 'torso', 'head', 'legL', 'legR']);
    const r = parts.find((p) => p.id === 'legR');
    expect(r.joint).toBe('hipR');
    expect(r.offset[0]).toBeCloseTo(-0, 9);
  });
  it('jointsOf remplace les décalages donnés par la variante', () => {
    const j = jointsOf({ ...BODY, joints: { head: [0, 20, 0] } }, SKEL);
    expect(j.find((x) => x.id === 'head').offset).toEqual([0, 20, 0]);
    expect(j.find((x) => x.id === 'spine').offset).toEqual([0, 4, 0]);
    expect(jointsOf({ skeleton: 'absent' }, SKEL)).toEqual([]);
  });
  it('jointMatrices : chaîne de décalages et échelle de la racine', () => {
    const m = jointMatrices(jointsOf(BODY, SKEL), {}, 2);
    expect(m.head.t).toEqual([0, 84, 0]);
    const bent = jointMatrices(jointsOf(BODY, SKEL), { angles: { spine: [Math.PI / 2, 0, 0] } }, 1);
    expect(bent.head.t[1]).toBeCloseTo(24, 6);
    expect(bent.head.t[2]).toBeCloseTo(18, 6);
  });
});

describe('mergeParts : fusion par matière, os de chaque sommet', () => {
  const parts = expandParts({ ...BODY, parts: [...BODY.parts, box('lamp', 'head', { w: 1, h: 1, d: 1 }, [0, 6, 4], { material: 'glow' })] });
  const joints = jointsOf(BODY, SKEL);
  const groups = mergeParts(parts, { joints });
  it('un groupe par matière, triangles conservés', () => {
    expect(groups.map((g) => g.material)).toEqual(['body', 'glow']);
    expect(groups.reduce((s, g) => s + g.triangles, 0)).toBe(parts.reduce((s, p) => s + partTriangles(p), 0));
    for (const g of groups) expect(g.positions.length / 9).toBe(g.triangles);
  });
  it('l\'indice d\'os de chaque sommet est celui de l\'articulation de sa pièce', () => {
    const body = groups[0];
    expect(body.bones.length).toBe(body.positions.length / 3);
    const ids = joints.map((j) => j.id);
    expect(new Set(body.bones.map((b) => ids[b]))).toEqual(new Set(['pelvis', 'spine', 'head', 'hipL', 'hipR']));
    expect(new Set(groups[1].bones)).toEqual(new Set([ids.indexOf('head')]));
  });
  it('région d\'atlas et couleur appliquées à chaque sommet', () => {
    const g = mergeParts(parts.slice(0, 1), { joints, rect: () => ({ u0: 0.5, v0: 0.25, u1: 0.75, v1: 0.5 }), color: () => [0.2, 0.4, 0.6] })[0];
    for (let i = 0; i < g.uvs.length; i += 2) {
      expect(g.uvs[i]).toBeGreaterThanOrEqual(0.5);
      expect(g.uvs[i]).toBeLessThanOrEqual(0.75);
    }
    expect(g.colors.slice(0, 3)).toEqual([0.2, 0.4, 0.6]);
  });
  it('pièces d\'une articulation inconnue ignorées ; entrée invalide : liste vide', () => {
    expect(mergeParts([box('x', 'nulle', { w: 1, h: 1, d: 1 })], { joints })).toEqual([]);
    expect(mergeParts(null)).toEqual([]);
  });
});

describe('characterStats', () => {
  it('pièces articulées : un appel par pièce, ombres des pièces « casts »', () => {
    const s = characterStats(BODY, { architecture: 'articulated', skeletons: SKEL });
    expect([s.parts, s.pieces, s.triangles, s.calls, s.shadowCalls]).toEqual([5, 5, 60, 5, 3]);
  });
  it('os rigides : un appel par matière, un proxy d\'ombre', () => {
    const s = characterStats({ ...BODY, shadow: [box('o', 'spine', { w: 10, h: 20, d: 6 })] }, { architecture: 'rigid', skeletons: SKEL });
    expect([s.calls, s.shadowCalls, s.shadowTriangles]).toEqual([1, 1, 12]);
  });
  it('boîte au repos : hauteur du sol au sommet de la tête', () => {
    const s = characterStats(BODY, { skeletons: SKEL });
    expect(s.rest.min[1]).toBeCloseTo(0, 6);
    expect(s.rest.max[1]).toBeCloseTo(51, 6);
    expect(s.joints).toEqual(['pelvis', 'spine', 'head', 'hipL', 'hipR']);
  });
  it('pièces regroupées : « piece » compte une seule fois', () => {
    const s = characterStats({ ...BODY, parts: [...BODY.parts, box('nose', 'head', { w: 1, h: 1, d: 1 }, [0, 4, 4], { piece: 'head' })] }, { architecture: 'articulated', skeletons: SKEL });
    expect(s.pieces).toBe(5);
    expect(s.parts).toBe(6);
  });
});

describe('checkVariant : chaque violation', () => {
  const base = { skeletons: SKEL };
  const codes = (v, p = {}) => checkVariant(v, { ...base, ...p }).map((x) => x.code);
  it('variante correcte : aucune violation', () => expect(codes(BODY, { budget: { triangles: 100, calls: 4, pieces: 16, shadowCalls: 2 }, radius: 20, heightRange: [45, 55] })).toEqual([]));
  it('sans pièce', () => expect(codes({ skeleton: 's', parts: [] })).toEqual(['aucune-piece']));
  it('type inconnu', () => expect(codes({ ...BODY, parts: [...BODY.parts, { id: 'x', joint: 'head', kind: 'cone' }] })).toContain('type-inconnu'));
  it('articulation inconnue', () => expect(codes({ ...BODY, parts: [...BODY.parts, box('x', 'aile', { w: 1, h: 1, d: 1 })] })).toContain('articulation-inconnue'));
  it('budget de triangles', () => {
    expect(codes(BODY, { budget: { triangles: 59 } })).toContain('budget-triangles');
    expect(codes(BODY, { budget: { triangles: 60 } })).not.toContain('budget-triangles');
  });
  it('budget d\'appels (os rigides : une matière de trop)', () => {
    const v = { ...BODY, parts: BODY.parts.map((p, i) => ({ ...p, material: `m${i}` })) };
    expect(codes(v, { budget: { calls: 3 } })).toContain('budget-appels');
    expect(codes(v, { budget: { calls: 4 } })).not.toContain('budget-appels');
  });
  it('budget de pièces (pièces articulées)', () => expect(codes(BODY, { architecture: 'articulated', budget: { pieces: 4 } })).toContain('budget-pieces'));
  it('ombres : appels et triangles du proxy', () => {
    const v = { ...BODY, shadow: Array.from({ length: 6 }, (_, i) => box(`o${i}`, 'spine', { w: 1, h: 1, d: 1 })) };
    expect(codes(v, { budget: { shadowTriangles: 64 } })).toContain('ombres-triangles');
    expect(codes(BODY, { architecture: 'articulated', budget: { shadowCalls: 2 } })).toContain('ombres-appels');
  });
  it('pièce flottante (à plus de 0,5 de sa pièce parente)', () => {
    const v = { ...BODY, parts: [...BODY.parts, box('halo', 'head', { w: 4, h: 1, d: 4 }, [0, 12, 0])] };
    expect(codes(v)).toContain('piece-flottante');
    const ok = { ...BODY, parts: [...BODY.parts, box('chapeau', 'head', { w: 4, h: 1, d: 4 }, [0, 9.4, 0])] };
    expect(codes(ok)).not.toContain('piece-flottante');
  });
  it('emprise au-delà de 1,3 × le rayon', () => {
    expect(codes(BODY, { radius: 6 })).toContain('emprise');
    expect(codes(BODY, { radius: 20 })).not.toContain('emprise');
  });
  it('hauteur hors plage', () => expect(codes(BODY, { heightRange: [55, 60] })).toContain('hauteur'));
  it('proportions de « petit » : tête trop grande (enfant) refusée, tête adulte acceptée', () => {
    const big = { ...BODY, parts: BODY.parts.map((p) => (p.id === 'head' ? { ...p, dims: { w: 10, h: 12, d: 10 }, offset: [0, 6, 0] } : p)) };
    expect(codes(big, { kind: 'petit' })).toContain('proportions-petit');
    const adult = { ...BODY, parts: BODY.parts.map((p) => (p.id === 'head' ? { ...p, dims: { w: 6, h: 7, d: 6 }, offset: [0, 3.5, 0] } : p)) };
    expect(codes(adult, { kind: 'petit' })).not.toContain('proportions-petit');
  });
  it('taille de texture', () => expect(codes(BODY, { textureSize: 1024, budget: { textureSize: 512 } })).toContain('texture'));
  it('entrées inattendues : aucune exception', () => {
    for (const v of [null, undefined, 3, 'x', [], { parts: 'non' }]) expect(() => checkVariant(v, null)).not.toThrow();
  });
});

describe('fkPose, groundContact, boundsOf', () => {
  it('au repos : pieds au sol, tête en haut', () => {
    const { boxes } = fkPose(BODY, {}, { skeletons: SKEL });
    const g = groundContact(boxes);
    expect(g.minY).toBeCloseTo(0, 6);
    expect(['legL', 'legR']).toContain(g.lowest);
  });
  it('une jambe levée vers l\'avant (hanche à -90°) n\'est plus la plus basse', () => {
    const { boxes } = fkPose(BODY, { angles: { hipL: [-Math.PI / 2, 0, 0] } }, { skeletons: SKEL });
    const leg = boxes.find((b) => b.id === 'legL');
    expect(leg.max[2]).toBeGreaterThan(15);
    expect(groundContact(boxes).lowest).toBe('legR');
  });
  it('bassin abaissé : décalage vertical qui reposerait sur le sol', () => {
    const { boxes } = fkPose(BODY, { offsets: { pelvis: [0, -5, 0] } }, { skeletons: SKEL });
    expect(groundContact(boxes).offset).toBeCloseTo(5, 6);
  });
  it('échelle de la variante appliquée', () => {
    const big = boundsOf(fkPose({ ...BODY, scale: 1.1 }, {}, { skeletons: SKEL }).boxes);
    expect(big.height).toBeCloseTo(51 * 1.1, 6);
  });
  it('groundContact et boundsOf sur des entrées vides', () => {
    expect(groundContact(null)).toEqual({ minY: 0, lowest: null, offset: 0 });
    expect(boundsOf([]).height).toBe(0);
  });
});

describe('silhouette avec la caméra du jeu', () => {
  const cam = gameCamera({ fov: 40, tilt: 75, distance: 700, width: 667, height: 375 });
  it('la cible se projette au centre de l\'écran ; le nord monte à l\'écran', () => {
    const c = projectPoint([0, 0, 0], cam);
    expect(c.x).toBeCloseTo(333.5, 6);
    expect(c.y).toBeCloseTo(187.5, 6);
    expect(projectPoint([0, 0, -50], cam).y).toBeLessThan(c.y);
    expect(projectPoint([50, 0, 0], cam).x).toBeGreaterThan(c.x);
  });
  it('unités par pixel : 2 d tan(fov/2) / hauteur', () => expect(unitsPerPixel(cam)).toBeCloseTo((2 * 700 * Math.tan((20 * Math.PI) / 180)) / 375, 9));
  it('aire positive et finie, aspect positif ; plus grand = plus d\'aire', () => {
    const a = silhouetteMetrics(BODY, {}, cam, { skeletons: SKEL });
    const b = silhouetteMetrics({ ...BODY, scale: 1.2 }, {}, cam, { skeletons: SKEL });
    expect(a.area).toBeGreaterThan(20);
    expect(a.aspect).toBeGreaterThan(0);
    expect(b.area / a.area).toBeGreaterThan(1.3);
  });
  it('couleur moyenne vue : celle des pièces visibles (z-buffer)', () => {
    const s = silhouetteMetrics(BODY, {}, cam, { skeletons: SKEL, color: (p) => (p.id === 'head' ? [1, 0, 0] : [0, 0, 1]) });
    expect(s.color[0]).toBeGreaterThan(0.05);
    expect(s.color[2]).toBeGreaterThan(0.3);
  });
  it('distinctness : écarts relatifs d\'aire et d\'aspect, symétrique', () => {
    const d = distinctness({ area: 100, aspect: 1 }, { area: 80, aspect: 1.5 });
    expect(d.area).toBeCloseTo(0.2, 9);
    expect(d.aspect).toBeCloseTo(1 / 3, 9);
    expect(d.max).toBeCloseTo(1 / 3, 9);
    expect(distinctness({ area: 80, aspect: 1.5 }, { area: 100, aspect: 1 })).toEqual(d);
    expect(distinctness(null, undefined).max).toBe(0);
  });
  it('déterministe : deux appels, mêmes mesures', () => {
    expect(silhouetteMetrics(BODY, {}, cam, { skeletons: SKEL })).toEqual(silhouetteMetrics(BODY, {}, cam, { skeletons: SKEL }));
  });
});
