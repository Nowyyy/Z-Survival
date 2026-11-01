// Kit de construction pur des personnages (lot 3j) : pièces, géométrie en tableaux, fusion par matière avec l'os de chaque sommet,
// cinématique directe, contact au sol, silhouette projetée avec la caméra du jeu et contrôle d'une variante. Aucun Three.js, aucun DOM.
// Les géométries « capsule » et « sphere » reprennent l'algorithme de CapsuleGeometry et SphereGeometry de Three.js 0.186.1 (mêmes sommets,
// mêmes triangles, triangles dégénérés des pôles compris) pour décrire à l'identique les personnages actuels (js/game/character.js).
// Toutes les fonctions renvoient des objets neufs, ne modifient pas leurs arguments et ne lèvent pas d'exception.
import { isNum } from './vec.js';

export const PART_KINDS = ['box', 'taper', 'capsule', 'sphere', 'wedge', 'quad'];
const TAU = Math.PI * 2;
const n = (v, d = 0) => (isNum(v) ? v : d);
const int = (v, d, lo, hi) => Math.min(hi, Math.max(lo, Math.floor(n(v, d))));
const vec3 = (v, d = [0, 0, 0]) => (Array.isArray(v) && v.length >= 3 && v.slice(0, 3).every(isNum) ? [v[0], v[1], v[2]] : [...d]);
const obj = (v) => (v !== null && typeof v === 'object' && !Array.isArray(v) ? v : {});

// --- Transformations affines : { m: matrice 3 × 3 par lignes, t: translation } ---------------------------------------------------------
export const IDENTITY = Object.freeze({ m: Object.freeze([1, 0, 0, 0, 1, 0, 0, 0, 1]), t: Object.freeze([0, 0, 0]) });
const mul3 = (a, b) => {
  const o = new Array(9);
  for (let r = 0; r < 3; r += 1) for (let c = 0; c < 3; c += 1) o[r * 3 + c] = a[r * 3] * b[c] + a[r * 3 + 1] * b[3 + c] + a[r * 3 + 2] * b[6 + c];
  return o;
};
const apply3 = (m, v) => [m[0] * v[0] + m[1] * v[1] + m[2] * v[2], m[3] * v[0] + m[4] * v[1] + m[5] * v[2], m[6] * v[0] + m[7] * v[1] + m[8] * v[2]];
export const applyAffine = (a, v) => {
  const r = apply3(a.m, v);
  return [r[0] + a.t[0], r[1] + a.t[1], r[2] + a.t[2]];
};
// a puis b : composée b ∘ a (un point passe d'abord par a).
export const compose = (outer, inner) => ({ m: mul3(outer.m, inner.m), t: applyAffine(outer, inner.t) });
const rx = (x) => [1, 0, 0, 0, Math.cos(x), -Math.sin(x), 0, Math.sin(x), Math.cos(x)];
const ry = (y) => [Math.cos(y), 0, Math.sin(y), 0, 1, 0, -Math.sin(y), 0, Math.cos(y)];
const rz = (z) => [Math.cos(z), -Math.sin(z), 0, Math.sin(z), Math.cos(z), 0, 0, 0, 1];
// Rotation d'Euler (ordre de Three.js : 'XYZ' = Rx·Ry·Rz, 'YXZ' = Ry·Rx·Rz), mêmes formules que Matrix4.makeRotationFromEuler.
export function eulerMatrix(angles, order = 'XYZ') {
  const [x, y, z] = vec3(angles);
  if (order === 'YXZ') return mul3(mul3(ry(y), rx(x)), rz(z));
  return mul3(mul3(rx(x), ry(y)), rz(z));
}
export const affine = (m, t = [0, 0, 0]) => ({ m: [...m], t: vec3(t) });
const scaleM = (s) => [s[0], 0, 0, 0, s[1], 0, 0, 0, s[2]];
function invert3(m) {
  const [a, b, c, d, e, f, g, h, i] = m;
  const A = e * i - f * h;
  const B = -(d * i - f * g);
  const C = d * h - e * g;
  const det = a * A + b * B + c * C;
  if (!Number.isFinite(det) || Math.abs(det) < 1e-12) return [1, 0, 0, 0, 1, 0, 0, 0, 1];
  const k = 1 / det;
  return [A * k, -(b * i - c * h) * k, (b * f - c * e) * k, B * k, (a * i - c * g) * k, -(a * f - c * d) * k, C * k, -(a * h - b * g) * k, (a * e - b * d) * k];
}
const transpose3 = (m) => [m[0], m[3], m[6], m[1], m[4], m[7], m[2], m[5], m[8]];
const normalize = (v) => {
  const l = Math.hypot(v[0], v[1], v[2]);
  return l > 0 ? [v[0] / l, v[1] / l, v[2] / l] : [0, 1, 0];
};

// --- Pièces ---------------------------------------------------------------------------------------------------------------------------
// Dimensions lues par type (valeurs par défaut sûres) :
// box { w, h, d } ; taper { r0 (bas), r1 (haut), h, sides 4..8, sx, sz } ; capsule { r, h (hauteur totale), caps, radial, sx, sz } ;
// sphere { rx, ry, rz, w, h } ; wedge { w, h, d } (prisme triangulaire, arête en haut) ; quad { w, h } (bande de tissu, deux faces).
export function partDims(part) {
  const p = obj(part);
  const d = obj(p.dims);
  switch (p.kind) {
    case 'box': return { w: Math.max(0.01, n(d.w, 1)), h: Math.max(0.01, n(d.h, 1)), d: Math.max(0.01, n(d.d, 1)) };
    case 'taper': return { r0: Math.max(0.01, n(d.r0, 1)), r1: Math.max(0.01, n(d.r1, 1)), h: Math.max(0.01, n(d.h, 1)), sides: int(d.sides, 6, 4, 8), sx: n(d.sx, 1), sz: n(d.sz, 1) };
    case 'capsule': return { r: Math.max(0.01, n(d.r, 1)), h: Math.max(0.01, n(d.h, 2)), caps: int(d.caps, 1, 1, 8), radial: int(d.radial, 8, 3, 32), sx: n(d.sx, 1), sz: n(d.sz, 1) };
    case 'sphere': return { rx: Math.max(0.01, n(d.rx, 1)), ry: Math.max(0.01, n(d.ry, 1)), rz: Math.max(0.01, n(d.rz, 1)), w: int(d.w, 8, 3, 32), h: int(d.h, 6, 2, 32) };
    case 'wedge': return { w: Math.max(0.01, n(d.w, 1)), h: Math.max(0.01, n(d.h, 1)), d: Math.max(0.01, n(d.d, 1)) };
    case 'quad': return { w: Math.max(0.01, n(d.w, 1)), h: Math.max(0.01, n(d.h, 1)) };
    default: return null;
  }
}

// Coût exact en triangles (type inconnu : 0).
export function partTriangles(part) {
  const d = partDims(part);
  if (!d) return 0;
  switch (part.kind) {
    case 'box': return 12;
    case 'taper': return 4 * d.sides - 4;
    case 'capsule': return 2 * d.radial * (2 * d.caps + 1);
    case 'sphere': return 2 * d.w * (d.h - 1);
    case 'wedge': return 8;
    case 'quad': return 4;
    default: return 0;
  }
}

function capsuleRaw({ r, h, caps, radial }) {
  const height = Math.max(0.01, h - 2 * r);
  const half = height / 2;
  const capArc = (Math.PI / 2) * r;
  const total = 2 * capArc + height;
  const rows = caps * 2 + 1;
  const per = radial + 1;
  const positions = [];
  const normals = [];
  const uvs = [];
  const indices = [];
  for (let iy = 0; iy <= rows; iy += 1) {
    let arc;
    let py;
    let pr;
    let ny;
    if (iy <= caps) {
      const a = ((iy / caps) * Math.PI) / 2;
      py = -half - r * Math.cos(a);
      pr = r * Math.sin(a);
      ny = -r * Math.cos(a);
      arc = (iy / caps) * capArc;
    } else if (iy <= caps + 1) {
      py = -half + (iy - caps) * height;
      pr = r;
      ny = 0;
      arc = capArc + (iy - caps) * height;
    } else {
      const s = (iy - caps - 1) / caps;
      const a = (s * Math.PI) / 2;
      py = half + r * Math.sin(a);
      pr = r * Math.cos(a);
      ny = r * Math.sin(a);
      arc = capArc + height + s * capArc;
    }
    const v = Math.max(0, Math.min(1, arc / total));
    const uOff = iy === 0 ? 0.5 / radial : iy === rows ? -0.5 / radial : 0;
    for (let ix = 0; ix <= radial; ix += 1) {
      const u = ix / radial;
      const th = u * TAU;
      positions.push(-pr * Math.cos(th), py, pr * Math.sin(th));
      normals.push(...normalize([-pr * Math.cos(th), ny, pr * Math.sin(th)]));
      uvs.push(u + uOff, v);
    }
    if (iy > 0) {
      const prev = (iy - 1) * per;
      for (let ix = 0; ix < radial; ix += 1) {
        const i1 = prev + ix;
        const i2 = prev + ix + 1;
        const i3 = iy * per + ix;
        const i4 = iy * per + ix + 1;
        indices.push(i1, i2, i3, i2, i4, i3);
      }
    }
  }
  return { positions, normals, uvs, indices };
}

function sphereRaw({ w, h }) {
  const positions = [];
  const normals = [];
  const uvs = [];
  const indices = [];
  const grid = [];
  let index = 0;
  for (let iy = 0; iy <= h; iy += 1) {
    const row = [];
    const v = iy / h;
    const theta = v * Math.PI;
    const y = Math.cos(theta);
    const ring = Math.sqrt(Math.max(0, 1 - y * y));
    const uOff = iy === 0 ? 0.5 / w : iy === h ? -0.5 / w : 0;
    for (let ix = 0; ix <= w; ix += 1) {
      const u = ix / w;
      const phi = u * TAU;
      const p = [-ring * Math.cos(phi), y, ring * Math.sin(phi)];
      positions.push(...p);
      normals.push(...normalize(p));
      uvs.push(u + uOff, 1 - v);
      row.push(index);
      index += 1;
    }
    grid.push(row);
  }
  for (let iy = 0; iy < h; iy += 1) {
    for (let ix = 0; ix < w; ix += 1) {
      const a = grid[iy][ix + 1];
      const b = grid[iy][ix];
      const c = grid[iy + 1][ix];
      const d = grid[iy + 1][ix + 1];
      if (iy !== 0) indices.push(a, b, d);
      if (iy !== h - 1) indices.push(b, c, d);
    }
  }
  return { positions, normals, uvs, indices };
}

// Faces planes : chaque face a ses propres sommets (normale de face) ; quads donnés en sens antihoraire vu de l'extérieur.
function faces(list) {
  const positions = [];
  const normals = [];
  const uvs = [];
  const indices = [];
  for (const poly of list) {
    const base = positions.length / 3;
    const [a, b, c] = poly;
    const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const nn = normalize([u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]]);
    const uvSet = poly.length === 3 ? [[0, 0], [1, 0], [0.5, 1]] : poly.length === 4 ? [[0, 0], [1, 0], [1, 1], [0, 1]] : poly.map((_, i) => [0.5 + 0.5 * Math.cos((i / poly.length) * TAU), 0.5 + 0.5 * Math.sin((i / poly.length) * TAU)]);
    poly.forEach((p, i) => {
      positions.push(...p);
      normals.push(...nn);
      uvs.push(...uvSet[i]);
    });
    for (let i = 1; i < poly.length - 1; i += 1) indices.push(base, base + i, base + i + 1);
  }
  return { positions, normals, uvs, indices };
}

function boxRaw({ w, h, d }) {
  const [x, y, z] = [w / 2, h / 2, d / 2];
  const P = (sx, sy, sz) => [sx * x, sy * y, sz * z];
  return faces([
    [P(1, -1, 1), P(1, -1, -1), P(1, 1, -1), P(1, 1, 1)],
    [P(-1, -1, -1), P(-1, -1, 1), P(-1, 1, 1), P(-1, 1, -1)],
    [P(-1, 1, 1), P(1, 1, 1), P(1, 1, -1), P(-1, 1, -1)],
    [P(-1, -1, -1), P(1, -1, -1), P(1, -1, 1), P(-1, -1, 1)],
    [P(-1, -1, 1), P(1, -1, 1), P(1, 1, 1), P(-1, 1, 1)],
    [P(1, -1, -1), P(-1, -1, -1), P(-1, 1, -1), P(1, 1, -1)],
  ]);
}

// Tronc de pyramide à `sides` côtés, de y = -h/2 (rayon r0) à y = h/2 (rayon r1), étiré en (sx, sz) ; faces planes.
function taperRaw({ r0, r1, h, sides, sx, sz }) {
  const ring = (r, y) => Array.from({ length: sides }, (_, i) => {
    const a = (i / sides) * TAU + Math.PI / sides;
    return [Math.cos(a) * r * sx, y, Math.sin(a) * r * sz];
  });
  const lo = ring(r0, -h / 2);
  const hi = ring(r1, h / 2);
  const list = [];
  for (let i = 0; i < sides; i += 1) {
    const j = (i + 1) % sides;
    list.push([lo[j], lo[i], hi[i], hi[j]]);
  }
  list.push([...hi].reverse());
  list.push([...lo]);
  return faces(list);
}

// Prisme triangulaire : arête du haut le long de z, base de largeur w en x, profondeur d en z.
function wedgeRaw({ w, h, d }) {
  const [x, y, z] = [w / 2, h / 2, d / 2];
  const A = (sz) => [-x, -y, sz];
  const B = (sz) => [x, -y, sz];
  const C = (sz) => [0, y, sz];
  return faces([
    [A(z), B(z), C(z)],
    [B(-z), A(-z), C(-z)],
    [B(z), B(-z), C(-z), C(z)],
    [A(-z), A(z), C(z), C(-z)],
    [A(-z), B(-z), B(z), A(z)],
  ]);
}

// Bande de tissu verticale (plan xy), pendante sous son pivot : deux faces (avant et arrière).
function quadRaw({ w, h }) {
  const x = w / 2;
  return faces([
    [[-x, -h, 0], [x, -h, 0], [x, 0, 0], [-x, 0, 0]],
    [[x, -h, 0], [-x, -h, 0], [-x, 0, 0], [x, 0, 0]],
  ]);
}

// Transformation locale d'une pièce : échelle (sphère, capsule), puis rotation (Euler XYZ), puis translation `offset`.
export function partTransform(part) {
  const p = obj(part);
  const d = partDims(p) ?? {};
  const s = p.kind === 'sphere' ? [d.rx, d.ry, d.rz] : p.kind === 'capsule' ? [d.sx, 1, d.sz] : [1, 1, 1];
  return { m: mul3(eulerMatrix(p.rotation, 'XYZ'), scaleM(s)), t: vec3(p.offset) };
}

// Géométrie d'une pièce en tableaux purs { positions, normals, uvs, indices } (coordonnées de son articulation) ; type inconnu : vide.
export function buildPartGeometry(part) {
  const d = partDims(part);
  if (!d) return { positions: [], normals: [], uvs: [], indices: [] };
  const raw = { box: boxRaw, taper: taperRaw, capsule: capsuleRaw, sphere: sphereRaw, wedge: wedgeRaw, quad: quadRaw }[part.kind](d);
  const tr = partTransform(part);
  const nm = transpose3(invert3(tr.m));
  const positions = [];
  const normals = [];
  for (let i = 0; i < raw.positions.length; i += 3) {
    positions.push(...applyAffine(tr, raw.positions.slice(i, i + 3)));
    normals.push(...normalize(apply3(nm, raw.normals.slice(i, i + 3))));
  }
  return { positions, normals, uvs: [...raw.uvs], indices: [...raw.indices] };
}

// --- Squelettes et variantes ----------------------------------------------------------------------------------------------------------
// skeleton : { joints: [{ id, parent, offset: [x, y, z] }] } (parents avant leurs enfants). Variante : { skeleton (id), joints (décalages
// remplacés), parts, scale, ... }. Pièces symétriques : `mirror: true` sur une pièce d'une articulation …L crée la même pièce sur …R
// (x, rotations y et z opposés).
export const mirrorJoint = (id) => (typeof id === 'string' && /L$/.test(id) ? `${id.slice(0, -1)}R` : id);
export function expandParts(variant) {
  const parts = Array.isArray(obj(variant).parts) ? variant.parts : [];
  const out = [];
  for (const part of parts) {
    const p = obj(part);
    out.push({ ...p, offset: vec3(p.offset), rotation: vec3(p.rotation) });
    if (p.mirror === true && mirrorJoint(p.joint) !== p.joint) {
      const o = vec3(p.offset);
      const r = vec3(p.rotation);
      out.push({ ...p, id: `${mirrorJoint(p.id)}`, joint: mirrorJoint(p.joint), piece: p.piece ? mirrorJoint(p.piece) : undefined, offset: [-o[0], o[1], o[2]], rotation: [r[0], -r[1], -r[2]], mirror: false, mirrored: true });
    }
  }
  return out;
}

// Articulations effectives d'une variante : squelette de base (skeletons[variant.skeleton]) et décalages remplacés par variant.joints.
export function jointsOf(variant, skeletons) {
  const v = obj(variant);
  const base = obj(obj(skeletons)[v.skeleton]);
  const list = Array.isArray(base.joints) ? base.joints : [];
  const over = obj(v.joints);
  return list.map((j) => ({ id: j.id, parent: j.parent ?? null, offset: vec3(Array.isArray(over[j.id]) ? over[j.id] : j.offset), range: j.range ?? null }));
}

// Matrices monde (repère du personnage, échelle comprise) de chaque articulation pour des angles { joint: [x, y, z] } (Euler 'YXZ',
// comme les groupes de js/game/character.js), des translations en plus { joint: [dx, dy, dz] } et des échelles { joint: s } (0 : la
// pièce et ses enfants disparaissent, comme l'arme pendant la réparation).
export function jointMatrices(joints, pose = {}, scale = 1) {
  const angles = obj(obj(pose).angles);
  const offsets = obj(obj(pose).offsets);
  const scales = obj(obj(pose).scales);
  const k = isNum(scale) && scale > 0 ? scale : 1;
  const out = {};
  for (const j of joints) {
    const parent = j.parent && out[j.parent] ? out[j.parent] : { m: scaleM([k, k, k]), t: [0, 0, 0] };
    const extra = vec3(offsets[j.id]);
    const s = isNum(scales[j.id]) && scales[j.id] >= 0 ? scales[j.id] : 1;
    const local = { m: mul3(eulerMatrix(angles[j.id], 'YXZ'), scaleM([s, s, s])), t: [j.offset[0] + extra[0], j.offset[1] + extra[1], j.offset[2] + extra[2]] };
    out[j.id] = compose(parent, local);
  }
  return out;
}

// Cinématique directe : boîtes (min, max) de chaque pièce posée et matrices des articulations. pose : { angles, offsets } ; options :
// { skeletons, scale }. Les pièces d'une articulation inconnue sont ignorées (signalées par checkVariant).
export function fkPose(variant, pose = {}, { skeletons = {}, scale } = {}) {
  const joints = jointsOf(variant, skeletons);
  const mats = jointMatrices(joints, pose, isNum(scale) ? scale : n(obj(variant).scale, 1));
  const boxes = [];
  for (const part of expandParts(variant)) {
    const m = mats[part.joint];
    if (!m) continue;
    const g = buildPartGeometry(part);
    const min = [Infinity, Infinity, Infinity];
    const max = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < g.positions.length; i += 3) {
      const p = applyAffine(m, g.positions.slice(i, i + 3));
      for (let a = 0; a < 3; a += 1) {
        min[a] = Math.min(min[a], p[a]);
        max[a] = Math.max(max[a], p[a]);
      }
    }
    if (Number.isFinite(min[0])) boxes.push({ id: part.id, joint: part.joint, piece: part.piece ?? part.id, min, max });
  }
  return { joints: mats, boxes };
}

// Contact au sol : point le plus bas des boîtes, pièce la plus basse, décalage vertical qui pose le personnage sur y = 0.
export function groundContact(boxes) {
  const list = Array.isArray(boxes) ? boxes.filter((b) => Array.isArray(b?.min) && isNum(b.min[1])) : [];
  if (list.length === 0) return { minY: 0, lowest: null, offset: 0 };
  const low = list.reduce((a, b) => (b.min[1] < a.min[1] ? b : a));
  return { minY: low.min[1], lowest: low.id, offset: -low.min[1] };
}

// Boîte englobante d'une liste de boîtes, emprise horizontale (distance maximale à l'axe vertical) et hauteur.
export function boundsOf(boxes) {
  const list = Array.isArray(boxes) ? boxes : [];
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  let reach = 0;
  for (const b of list) {
    for (let a = 0; a < 3; a += 1) {
      min[a] = Math.min(min[a], b.min[a]);
      max[a] = Math.max(max[a], b.max[a]);
    }
    for (const x of [b.min[0], b.max[0]]) for (const z of [b.min[2], b.max[2]]) reach = Math.max(reach, Math.hypot(x, z));
  }
  return Number.isFinite(min[0]) ? { min, max, height: max[1] - min[1], reach } : { min: [0, 0, 0], max: [0, 0, 0], height: 0, reach: 0 };
}

// --- Fusion par matière (architecture « os rigides ») ----------------------------------------------------------------------------------
// parts : pièces développées ; options : { joints (articulations, ordre = indice d'os), matrices (repos, par articulation), rect(part) (région
// d'atlas { u0, v0, u1, v1 }), color(part) ([r, g, b] 0 à 1) }. Renvoie [{ material, positions, normals, uvs, colors, bones, parts (indice de
// la pièce de chaque triangle), triangles }] non indexés (une couleur par sommet), un groupe par matière (part.material, défaut 'body').
export function mergeParts(parts, { joints = null, matrices = null, rect = null, color = null } = {}) {
  const list = Array.isArray(parts) ? parts : [];
  const order = Array.isArray(joints) ? joints.map((j) => (typeof j === 'string' ? j : j.id)) : [...new Set(list.map((p) => p?.joint))];
  const groups = new Map();
  for (const part of list) {
    const bone = order.indexOf(part?.joint);
    if (bone < 0 || !partDims(part)) continue;
    const mat = typeof part.material === 'string' ? part.material : 'body';
    if (!groups.has(mat)) groups.set(mat, { material: mat, positions: [], normals: [], uvs: [], colors: [], bones: [], parts: [], triangles: 0 });
    const g = groups.get(mat);
    const geo = buildPartGeometry(part);
    const m = matrices?.[part.joint] ?? IDENTITY;
    const nm = transpose3(invert3(m.m));
    const r = typeof rect === 'function' ? rect(part) : null;
    const c = typeof color === 'function' ? color(part) : null;
    for (const i of geo.indices) {
      g.positions.push(...applyAffine(m, geo.positions.slice(i * 3, i * 3 + 3)));
      g.normals.push(...normalize(apply3(nm, geo.normals.slice(i * 3, i * 3 + 3))));
      const [u, v] = [geo.uvs[i * 2], geo.uvs[i * 2 + 1]];
      g.uvs.push(...(r ? [r.u0 + u * (r.u1 - r.u0), r.v0 + v * (r.v1 - r.v0)] : [u, v]));
      g.colors.push(...(Array.isArray(c) ? c.slice(0, 3) : [1, 1, 1]));
      g.bones.push(bone);
    }
    for (let t = 0; t < geo.indices.length / 3; t += 1) g.parts.push(list.indexOf(part));
    g.triangles += geo.indices.length / 3;
  }
  return [...groups.values()];
}

// --- Statistiques et contrôle ----------------------------------------------------------------------------------------------------------
// Architecture : 'articulated' (un maillage par pièce, piece = regroupement) ou 'rigid' (un maillage par matière, plus le maillage-proxy
// d'ombre). Renvoie { parts, pieces, triangles, calls, shadowCalls, shadowTriangles, casters, joints, rest (boîte au repos), materials }.
export function characterStats(variant, { architecture = 'rigid', skeletons = {} } = {}) {
  const parts = expandParts(variant);
  const valid = parts.filter((p) => partDims(p));
  const pieces = [...new Set(valid.map((p) => p.piece ?? p.id))];
  const triangles = valid.reduce((s, p) => s + partTriangles(p), 0);
  const materials = [...new Set(valid.map((p) => (typeof p.material === 'string' ? p.material : 'body')))];
  const casters = valid.filter((p) => p.casts === true);
  const shadow = Array.isArray(obj(variant).shadow) ? expandParts({ parts: variant.shadow }) : [];
  const shadowTriangles = architecture === 'rigid' && shadow.length > 0 ? shadow.reduce((s, p) => s + partTriangles(p), 0) : casters.reduce((s, p) => s + partTriangles(p), 0);
  const casterPieces = [...new Set(casters.map((p) => p.piece ?? p.id))];
  // Os rigides : un appel par matière, plus le proxy d'ombre dans la passe principale (matière sans couleur ni profondeur).
  const proxy = architecture === 'rigid' && (shadow.length > 0 || casters.length > 0) ? 1 : 0;
  const calls = architecture === 'rigid' ? materials.length + proxy : pieces.length;
  const shadowCalls = architecture === 'rigid' ? (shadow.length > 0 || casters.length > 0 ? 1 : 0) : casterPieces.length;
  const rest = boundsOf(fkPose(variant, {}, { skeletons }).boxes);
  return { parts: valid.length, pieces: pieces.length, triangles, calls, shadowCalls, shadowTriangles, casters: architecture === 'rigid' ? shadowCalls : casterPieces.length, joints: [...new Set(valid.map((p) => p.joint))], rest, materials };
}

const touches = (a, b, tol) => [0, 1, 2].every((k) => a.min[k] <= b.max[k] + tol && b.min[k] <= a.max[k] + tol);

// Liste des violations { code, detail } d'une variante. params : { skeletons, budget: { triangles, calls, pieces, shadowCalls,
// shadowTriangles, textureSize }, radius (rayon de collision), heightRange: [min, max], kind ('petit' : tête entre 1/8,5 et 1/6,5 de la
// hauteur), architecture, poses: [{ id, angles, offsets }] (poses debout pour l'emprise), textureSize }.
export function checkVariant(variant, params = {}) {
  const out = [];
  const v = obj(variant);
  const p = obj(params);
  const skeletons = obj(p.skeletons);
  if (!Array.isArray(v.parts) || v.parts.length === 0) return [{ code: 'aucune-piece', detail: 'variante sans pièce' }];
  const joints = jointsOf(v, skeletons);
  const ids = new Set(joints.map((j) => j.id));
  const parts = expandParts(v);
  for (const part of parts) {
    if (!PART_KINDS.includes(part.kind)) out.push({ code: 'type-inconnu', detail: `${part.id} : ${part.kind}` });
    if (!ids.has(part.joint)) out.push({ code: 'articulation-inconnue', detail: `${part.id} : ${part.joint}` });
  }
  const stats = characterStats(v, { architecture: p.architecture ?? 'rigid', skeletons });
  const b = obj(p.budget);
  if (isNum(b.triangles) && stats.triangles > b.triangles) out.push({ code: 'budget-triangles', detail: `${stats.triangles} > ${b.triangles}` });
  if (isNum(b.calls) && stats.calls > b.calls) out.push({ code: 'budget-appels', detail: `${stats.calls} > ${b.calls}` });
  if (isNum(b.pieces) && stats.pieces > b.pieces) out.push({ code: 'budget-pieces', detail: `${stats.pieces} > ${b.pieces}` });
  if (isNum(b.shadowCalls) && stats.shadowCalls > b.shadowCalls) out.push({ code: 'ombres-appels', detail: `${stats.shadowCalls} > ${b.shadowCalls}` });
  if (isNum(b.shadowTriangles) && stats.shadowTriangles > b.shadowTriangles) out.push({ code: 'ombres-triangles', detail: `${stats.shadowTriangles} > ${b.shadowTriangles}` });
  if (isNum(b.textureSize) && isNum(p.textureSize) && p.textureSize > b.textureSize) out.push({ code: 'texture', detail: `${p.textureSize} > ${b.textureSize}` });
  // Pièce flottante : sa boîte au repos doit toucher (à 0,5 près) celle d'une pièce de son articulation ou d'une articulation parente.
  const { boxes } = fkPose(v, {}, { skeletons, scale: 1 });
  const byJoint = new Map();
  for (const box of boxes) byJoint.set(box.joint, [...(byJoint.get(box.joint) ?? []), box]);
  const parentOf = new Map(joints.map((j) => [j.id, j.parent]));
  for (const box of boxes) {
    const near = [...(byJoint.get(box.joint) ?? []).filter((o) => o !== box)];
    for (let j = parentOf.get(box.joint); j; j = parentOf.get(j)) near.push(...(byJoint.get(j) ?? []));
    if (!parentOf.get(box.joint)) near.push(...boxes.filter((o) => o !== box)); // articulation racine : il suffit de toucher une autre pièce
    if (boxes.length > 1 && !near.some((o) => touches(box, o, 0.5))) out.push({ code: 'piece-flottante', detail: box.id });
  }
  // Emprise debout et hauteur.
  const standing = Array.isArray(p.poses) && p.poses.length > 0 ? p.poses : [{ id: 'repos' }];
  if (isNum(p.radius)) {
    for (const pose of standing) {
      const reach = boundsOf(fkPose(v, pose, { skeletons }).boxes).reach;
      if (reach > 1.3 * p.radius + 1e-9) out.push({ code: 'emprise', detail: `${pose.id ?? 'pose'} : ${reach.toFixed(2)} > ${(1.3 * p.radius).toFixed(2)}` });
    }
  }
  const rest = boundsOf(fkPose(v, {}, { skeletons }).boxes);
  if (Array.isArray(p.heightRange) && (rest.height < p.heightRange[0] - 1e-9 || rest.height > p.heightRange[1] + 1e-9)) out.push({ code: 'hauteur', detail: `${rest.height.toFixed(2)} hors de [${p.heightRange[0].toFixed(2)} ; ${p.heightRange[1].toFixed(2)}]` });
  if (p.kind === 'petit') {
    const heads = boxes.filter((x) => x.joint === 'head');
    if (heads.length > 0) {
      const hb = boundsOf(heads);
      const ratio = (hb.height * n(v.scale, 1)) / Math.max(1e-6, rest.height);
      if (ratio < 1 / 8.5 || ratio > 1 / 6.5) out.push({ code: 'proportions-petit', detail: `tête = 1/${(1 / ratio).toFixed(2)} de la hauteur` });
    }
  }
  return out;
}

// --- Caméra du jeu et silhouette ------------------------------------------------------------------------------------------------------
// Caméra du jeu : perspective (fov vertical en degrés), inclinaison tilt (degrés depuis l'horizontale), distance à la cible, fenêtre en
// pixels. render : render.json (camera.fov, camera.tilt) ; distance : déjà divisée par le zoom.
export function gameCamera({ fov = 40, tilt = 75, distance = 600, width = 667, height = 375 } = {}) {
  return { fov: n(fov, 40), tilt: n(tilt, 75), distance: Math.max(1, n(distance, 600)), width: Math.max(1, n(width, 667)), height: Math.max(1, n(height, 375)) };
}

// Projette un point (repère du monde, cible en 0) en pixels de l'écran ; la caméra est au sud (+z), au-dessus, et regarde la cible.
export function projectPoint(p, cam) {
  const a = (cam.tilt * Math.PI) / 180;
  const cy = cam.distance * Math.sin(a);
  const cz = cam.distance * Math.cos(a);
  // Repère caméra : avant = vers la cible, droite = +x, haut = produit vectoriel.
  const f = normalize([0, -cy, -cz]);
  const r = [1, 0, 0];
  const u = [r[1] * f[2] - r[2] * f[1], r[2] * f[0] - r[0] * f[2], r[0] * f[1] - r[1] * f[0]];
  const d = [p[0], p[1] - cy, p[2] - cz];
  const depth = d[0] * f[0] + d[1] * f[1] + d[2] * f[2];
  const x = d[0] * r[0] + d[1] * r[1] + d[2] * r[2];
  const y = d[0] * u[0] + d[1] * u[1] + d[2] * u[2];
  const t = Math.tan((cam.fov * Math.PI) / 360);
  const aspect = cam.width / cam.height;
  return { x: (x / (depth * t * aspect) + 1) * cam.width * 0.5, y: (1 - y / (depth * t)) * cam.height * 0.5, depth };
}

// Unités du monde par pixel au niveau du sol, au centre de l'écran.
export const unitsPerPixel = (cam) => (2 * cam.distance * Math.tan((cam.fov * Math.PI) / 360)) / cam.height;

// Triangles posés d'une variante (repère du monde, personnage tourné de yaw autour de y) avec la couleur de chaque pièce.
export function posedTriangles(variant, pose = {}, { skeletons = {}, yaw = 0, color = null, scale } = {}) {
  const joints = jointsOf(variant, skeletons);
  const mats = jointMatrices(joints, pose, isNum(scale) ? scale : n(obj(variant).scale, 1));
  const root = { m: eulerMatrix([0, n(yaw), 0], 'YXZ'), t: [0, 0, 0] };
  const tris = [];
  for (const part of expandParts(variant)) {
    const m = mats[part.joint];
    if (!m) continue;
    const g = buildPartGeometry(part);
    const full = compose(root, m);
    const c = typeof color === 'function' ? color(part) : [0.5, 0.5, 0.5];
    for (let i = 0; i < g.indices.length; i += 3) {
      const pts = [0, 1, 2].map((k) => applyAffine(full, g.positions.slice(g.indices[i + k] * 3, g.indices[i + k] * 3 + 3)));
      tris.push({ pts, color: c, part: part.id });
    }
  }
  return tris;
}

// Silhouette projetée (caméra du jeu, personnage au centre de la vue) : aire en pixels, rapport d'aspect (largeur / hauteur de la boîte),
// couleur moyenne vue (z-buffer, sans éclairage) ; moyenne sur les orientations `yaws`. supersample : sous-pixels par côté.
export function silhouetteMetrics(variant, pose = {}, camera = gameCamera(), { skeletons = {}, color = null, yaws = [0, Math.PI / 2, Math.PI, -Math.PI / 2], supersample = 4, scale } = {}) {
  const cam = gameCamera(camera);
  const ss = int(supersample, 4, 1, 8);
  const per = [];
  for (const yaw of Array.isArray(yaws) && yaws.length ? yaws : [0]) {
    const tris = posedTriangles(variant, pose, { skeletons, yaw, color, scale });
    const proj = tris.map((t) => ({ p: t.pts.map((q) => projectPoint(q, cam)), color: t.color }));
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const t of proj) for (const q of t.p) {
      minX = Math.min(minX, q.x);
      minY = Math.min(minY, q.y);
      maxX = Math.max(maxX, q.x);
      maxY = Math.max(maxY, q.y);
    }
    if (!Number.isFinite(minX)) {
      per.push({ area: 0, aspect: 0, width: 0, height: 0, color: [0, 0, 0] });
      continue;
    }
    const x0 = Math.floor(minX) - 1;
    const y0 = Math.floor(minY) - 1;
    const W = (Math.ceil(maxX) - x0 + 2) * ss;
    const H = (Math.ceil(maxY) - y0 + 2) * ss;
    const depth = new Float64Array(W * H).fill(Infinity);
    const col = new Array(W * H).fill(null);
    for (const t of proj) {
      const P = t.p.map((q) => [(q.x - x0) * ss, (q.y - y0) * ss, q.depth]);
      const area2 = (P[1][0] - P[0][0]) * (P[2][1] - P[0][1]) - (P[2][0] - P[0][0]) * (P[1][1] - P[0][1]);
      if (Math.abs(area2) < 1e-9) continue;
      const bx0 = Math.max(0, Math.floor(Math.min(P[0][0], P[1][0], P[2][0])));
      const bx1 = Math.min(W - 1, Math.ceil(Math.max(P[0][0], P[1][0], P[2][0])));
      const by0 = Math.max(0, Math.floor(Math.min(P[0][1], P[1][1], P[2][1])));
      const by1 = Math.min(H - 1, Math.ceil(Math.max(P[0][1], P[1][1], P[2][1])));
      for (let y = by0; y <= by1; y += 1) {
        for (let x = bx0; x <= bx1; x += 1) {
          const px = x + 0.5;
          const py = y + 0.5;
          const w0 = ((P[1][0] - px) * (P[2][1] - py) - (P[2][0] - px) * (P[1][1] - py)) / area2;
          const w1 = ((P[2][0] - px) * (P[0][1] - py) - (P[0][0] - px) * (P[2][1] - py)) / area2;
          const w2 = 1 - w0 - w1;
          if (w0 < 0 || w1 < 0 || w2 < 0) continue;
          const z = w0 * P[0][2] + w1 * P[1][2] + w2 * P[2][2];
          const k = y * W + x;
          if (z < depth[k]) {
            depth[k] = z;
            col[k] = t.color;
          }
        }
      }
    }
    let count = 0;
    let sx0 = Infinity;
    let sy0 = Infinity;
    let sx1 = -Infinity;
    let sy1 = -Infinity;
    const sum = [0, 0, 0];
    for (let y = 0; y < H; y += 1) {
      for (let x = 0; x < W; x += 1) {
        const c = col[y * W + x];
        if (!c) continue;
        count += 1;
        sum[0] += c[0];
        sum[1] += c[1];
        sum[2] += c[2];
        sx0 = Math.min(sx0, x);
        sy0 = Math.min(sy0, y);
        sx1 = Math.max(sx1, x);
        sy1 = Math.max(sy1, y);
      }
    }
    const width = count ? (sx1 - sx0 + 1) / ss : 0;
    const height = count ? (sy1 - sy0 + 1) / ss : 0;
    per.push({ area: count / (ss * ss), width, height, aspect: height > 0 ? width / height : 0, color: count ? sum.map((s) => s / count) : [0, 0, 0] });
  }
  const avg = (key) => per.reduce((s, q) => s + q[key], 0) / per.length;
  return { area: avg('area'), aspect: avg('aspect'), width: avg('width'), height: avg('height'), color: [0, 1, 2].map((i) => per.reduce((s, q) => s + q.color[i], 0) / per.length), perYaw: per };
}

// Écart de silhouette entre deux mesures (sorties de silhouetteMetrics) : écarts relatifs d'aire et d'aspect, et le plus grand des deux.
export function distinctness(a, b) {
  const rel = (x, y) => (Math.max(Math.abs(n(x)), Math.abs(n(y))) > 0 ? Math.abs(n(x) - n(y)) / Math.max(Math.abs(n(x)), Math.abs(n(y))) : 0);
  const area = rel(a?.area, b?.area);
  const aspect = rel(a?.aspect, b?.aspect);
  return { area, aspect, max: Math.max(area, aspect) };
}
