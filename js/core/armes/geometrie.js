// Lot 9c — Géométrie pure des armes et de la caisse d'armes (aucun Three.js, aucun DOM) : une liste de pièces → triangles non indexés
// (positions, normales, coordonnées de texture dans l'atlas, couleurs de sommet). Déterministe : même entrée, mêmes nombres.
// Repère d'une pièce (millimètres pour les armes) : x à gauche de l'arme (la droite du tireur = −x), y vers le haut, z vers la bouche.
// Formes : boite { w, h, l } ; tube { r, r2?, l, seg, axe ('z' | 'x' | 'y'), lisse, bouts } ; profil { pts [[z, y]…], e } (polygone de côté
// extrudé en x, concave permis) ; loft { sections [{ z, w, h, y?, x? }], seg (4 ou 8), bouts } ; chaque pièce : pos [x, y, z], rot [rx, ry, rz]
// en degrés (ordre X puis Y puis Z), mat (rôle de matière), teinte [r, g, b] facultative (multiplie la texture).

const DEG = Math.PI / 180;
const num = (v, d = 0) => (Number.isFinite(v) ? v : d);

// Matrice de rotation (ordre X, Y, Z appliqués dans cet ordre) d'angles en degrés.
export function matriceRotation(rot = [0, 0, 0]) {
  const [ax, ay, az] = [num(rot[0]) * DEG, num(rot[1]) * DEG, num(rot[2]) * DEG];
  const [cx, sx, cy, sy, cz, sz] = [Math.cos(ax), Math.sin(ax), Math.cos(ay), Math.sin(ay), Math.cos(az), Math.sin(az)];
  // R = Rz · Ry · Rx
  return [
    cz * cy, cz * sy * sx - sz * cx, cz * sy * cx + sz * sx,
    sz * cy, sz * sy * sx + cz * cx, sz * sy * cx - cz * sx,
    -sy, cy * sx, cy * cx,
  ];
}
const mul = (m, v) => [m[0] * v[0] + m[1] * v[1] + m[2] * v[2], m[3] * v[0] + m[4] * v[1] + m[5] * v[2], m[6] * v[0] + m[7] * v[1] + m[8] * v[2]];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (v) => {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
};

// Triangulation d'un polygone simple (oreilles) ; pts [[a, b]…] ; renvoie des triplets d'indices dans le sens trigonométrique.
export function trianguler(pts) {
  const n = pts.length;
  if (n < 3) return [];
  let aire = 0;
  for (let i = 0; i < n; i += 1) {
    const [a, b] = pts[i];
    const [c, d] = pts[(i + 1) % n];
    aire += a * d - c * b;
  }
  const idx = [...Array(n).keys()];
  if (aire < 0) idx.reverse();
  const out = [];
  const signe = (p, q, r) => (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
  const dedans = (p, a, b, c) => signe(a, b, p) >= 0 && signe(b, c, p) >= 0 && signe(c, a, p) >= 0;
  let garde = 0;
  while (idx.length > 3 && garde < 4 * n * n) {
    garde += 1;
    let trouve = false;
    for (let i = 0; i < idx.length; i += 1) {
      const [ia, ib, ic] = [idx[(i + idx.length - 1) % idx.length], idx[i], idx[(i + 1) % idx.length]];
      const [a, b, c] = [pts[ia], pts[ib], pts[ic]];
      if (signe(a, b, c) <= 1e-9) continue;
      if (idx.some((j) => j !== ia && j !== ib && j !== ic && dedans(pts[j], a, b, c))) continue;
      out.push([ia, ib, ic]);
      idx.splice(i, 1);
      trouve = true;
      break;
    }
    if (!trouve) break; // polygone dégénéré : on garde ce qui est triangulé
  }
  if (idx.length === 3) out.push([idx[0], idx[1], idx[2]]);
  return out;
}

// --- Construction des triangles d'une pièce (repère local, avant pose) --------------------------------------------------------------
// Chaque triangle : { p: [a, b, c], n: [na, nb, nc] | null (normale plate) }.

function boite(piece) {
  const w = num(piece.w, 1) / 2;
  const h = num(piece.h, 1) / 2;
  const l = num(piece.l, 1) / 2;
  const v = (x, y, z) => [x * w, y * h, z * l];
  const faces = [
    [v(1, -1, -1), v(1, 1, -1), v(1, 1, 1), v(1, -1, 1)], // +x
    [v(-1, -1, 1), v(-1, 1, 1), v(-1, 1, -1), v(-1, -1, -1)], // −x
    [v(-1, 1, -1), v(-1, 1, 1), v(1, 1, 1), v(1, 1, -1)], // +y
    [v(-1, -1, 1), v(-1, -1, -1), v(1, -1, -1), v(1, -1, 1)], // −y
    [v(-1, -1, 1), v(1, -1, 1), v(1, 1, 1), v(-1, 1, 1)], // +z
    [v(1, -1, -1), v(-1, -1, -1), v(-1, 1, -1), v(1, 1, -1)], // −z
  ];
  return faces.flatMap(([a, b, c, d]) => [{ p: [a, b, c], n: null }, { p: [a, c, d], n: null }]);
}

// Tube le long de z (puis tourné selon l'axe) : rayon r à l'arrière, r2 à l'avant ; bouts : 'deux' | 'avant' | 'arriere' | 'aucun'.
function tube(piece) {
  const seg = Math.max(3, Math.min(24, Math.floor(num(piece.seg, 8))));
  const r1 = num(piece.r, 1);
  const r2 = num(piece.r2, r1);
  const l = num(piece.l, 1) / 2;
  const lisse = piece.lisse !== false;
  const bouts = piece.bouts ?? 'deux';
  const phase = num(piece.phase, seg % 2 ? 0 : 0.5) * ((2 * Math.PI) / seg);
  const ring = (r, z) => [...Array(seg).keys()].map((i) => {
    const a = phase + (i * 2 * Math.PI) / seg;
    return [Math.cos(a) * r, Math.sin(a) * r, z];
  });
  const A = ring(r1, -l);
  const B = ring(r2, l);
  const tris = [];
  const pente = (r1 - r2) / (2 * l || 1);
  const nrm = (p) => norm([p[0], p[1], Math.hypot(p[0], p[1]) * pente]);
  for (let i = 0; i < seg; i += 1) {
    const j = (i + 1) % seg;
    const n = lisse ? [nrm(A[i]), nrm(A[j]), nrm(B[j])] : null;
    const m = lisse ? [nrm(A[i]), nrm(B[j]), nrm(B[i])] : null;
    tris.push({ p: [A[i], A[j], B[j]], n }, { p: [A[i], B[j], B[i]], n: m });
  }
  if (bouts === 'deux' || bouts === 'avant') for (let i = 1; i < seg - 1; i += 1) tris.push({ p: [B[0], B[i], B[i + 1]], n: null });
  if (bouts === 'deux' || bouts === 'arriere') for (let i = 1; i < seg - 1; i += 1) tris.push({ p: [A[0], A[i + 1], A[i]], n: null });
  const axe = piece.axe ?? 'z';
  if (axe === 'z') return tris;
  const m = axe === 'y' ? matriceRotation([-90, 0, 0]) : matriceRotation([0, 90, 0]);
  return tris.map((t) => ({ p: t.p.map((p) => mul(m, p)), n: t.n ? t.n.map((q) => mul(m, q)) : null }));
}

// Polygone de côté (z, y) extrudé sur l'épaisseur e (x de −e/2 à e/2).
function profil(piece) {
  const pts = (piece.pts ?? []).map(([z, y]) => [num(z), num(y)]);
  const e = num(piece.e, 1) / 2;
  if (pts.length < 3) return [];
  const tris = [];
  const caps = trianguler(pts);
  for (const [a, b, c] of caps) {
    // face +x : sens tel que la normale pointe vers +x (z, y) → (x = e, y, z)
    tris.push({ p: [[e, pts[a][1], pts[a][0]], [e, pts[c][1], pts[c][0]], [e, pts[b][1], pts[b][0]]], n: null });
    tris.push({ p: [[-e, pts[a][1], pts[a][0]], [-e, pts[b][1], pts[b][0]], [-e, pts[c][1], pts[c][0]]], n: null });
  }
  let aire = 0;
  for (let i = 0; i < pts.length; i += 1) aire += pts[i][0] * pts[(i + 1) % pts.length][1] - pts[(i + 1) % pts.length][0] * pts[i][1];
  for (let i = 0; i < pts.length; i += 1) {
    const [z0, y0] = pts[i];
    const [z1, y1] = pts[(i + 1) % pts.length];
    const a = [e, y0, z0];
    const b = [e, y1, z1];
    const c = [-e, y1, z1];
    const d = [-e, y0, z0];
    if (aire > 0) tris.push({ p: [a, b, c], n: null }, { p: [a, c, d], n: null });
    else tris.push({ p: [a, d, c], n: null }, { p: [a, c, b], n: null });
  }
  return tris;
}

// Sections successives le long de z : rectangle (seg 4) ou octogone aplati (seg 8) de largeur w, hauteur h, centré en (x, y).
function loft(piece) {
  const seg = num(piece.seg, 4) === 8 ? 8 : 4;
  const S = (piece.sections ?? []).map((s) => ({ z: num(s.z), w: num(s.w, 1) / 2, h: num(s.h, 1) / 2, y: num(s.y), x: num(s.x) }));
  if (S.length < 2) return [];
  const coins = seg === 4 ? [[1, -1], [1, 1], [-1, 1], [-1, -1]] : [[1, -0.45], [1, 0.45], [0.55, 1], [-0.55, 1], [-1, 0.45], [-1, -0.45], [-0.55, -1], [0.55, -1]];
  const ring = (s) => coins.map(([cx, cy]) => [s.x + cx * s.w, s.y + cy * s.h, s.z]);
  const R = S.map(ring);
  const tris = [];
  for (let k = 0; k < R.length - 1; k += 1) {
    const [A, B] = [R[k], R[k + 1]];
    for (let i = 0; i < seg; i += 1) {
      const j = (i + 1) % seg;
      tris.push({ p: [A[i], A[j], B[j]], n: null }, { p: [A[i], B[j], B[i]], n: null });
    }
  }
  const bouts = piece.bouts ?? 'deux';
  const [F, L] = [R[0], R[R.length - 1]];
  if (bouts === 'deux' || bouts === 'arriere') for (let i = 1; i < seg - 1; i += 1) tris.push({ p: [F[0], F[i + 1], F[i]], n: null });
  if (bouts === 'deux' || bouts === 'avant') for (let i = 1; i < seg - 1; i += 1) tris.push({ p: [L[0], L[i], L[i + 1]], n: null });
  return tris;
}

const FORMES = { boite, tube, profil, loft };

// Triangles d'une pièce dans le repère de l'objet (pose appliquée), avec ses bornes locales (pour les coordonnées de texture).
export function trianglesPiece(piece) {
  const f = FORMES[piece?.forme];
  if (!f) return [];
  const local = f(piece);
  const m = matriceRotation(piece.rot);
  const pos = piece.pos ?? [0, 0, 0];
  return local.map((t) => {
    const p = t.p.map((q) => {
      const r = mul(m, q);
      return [r[0] + num(pos[0]), r[1] + num(pos[1]), r[2] + num(pos[2])];
    });
    return { p, local: t.p, n: t.n ? t.n.map((q) => norm(mul(m, q))) : null };
  });
}

// Nombre de triangles d'une pièce sans la construire (budgets).
export function compterPiece(piece) {
  return trianglesPiece(piece).length;
}

// Pièces → maillage. options : { echelle (multiplie les positions), tuile(mat) → [u0, v0, u1, v1] (rectangle de l'atlas),
// teinte(mat) → [r, g, b] (couleur de sommet du rôle), etirer(pièce) → facteur en x de la pièce (lot 9c-G : largeur vue de dessus ;
// 1 par défaut) }. Renvoie { positions, normals, uvs, colors, triangles, bornes, parMatiere }.
export function maillage(pieces, { echelle = 1, tuile = () => [0, 0, 1, 1], teinte = () => [1, 1, 1], etirer = () => 1 } = {}) {
  const tris = [];
  for (const piece of pieces ?? []) {
    const t = trianglesPiece(piece);
    if (!t.length) continue;
    // Bornes locales de la pièce : coordonnées de texture rapportées à sa taille (le grain suit z).
    const mn = [Infinity, Infinity, Infinity];
    const mx = [-Infinity, -Infinity, -Infinity];
    for (const tr of t) for (const q of tr.local) for (let k = 0; k < 3; k += 1) { mn[k] = Math.min(mn[k], q[k]); mx[k] = Math.max(mx[k], q[k]); }
    const ext = mx.map((v, k) => Math.max(1e-6, v - mn[k]));
    for (const tr of t) tris.push({ ...tr, piece, mn, ext });
  }
  const n = tris.length;
  const positions = new Float32Array(n * 9);
  const normals = new Float32Array(n * 9);
  const uvs = new Float32Array(n * 6);
  const colors = new Float32Array(n * 9);
  const bmin = [Infinity, Infinity, Infinity];
  const bmax = [-Infinity, -Infinity, -Infinity];
  const parMatiere = {};
  tris.forEach((tr, i) => {
    const sx = num(etirer(tr.piece), 1) || 1;
    const flat = norm(cross(sub(tr.p[1], tr.p[0]), sub(tr.p[2], tr.p[0])));
    const lflat = norm(cross(sub(tr.local[1], tr.local[0]), sub(tr.local[2], tr.local[0])));
    const ax = Math.abs(lflat[0]) >= Math.abs(lflat[1]) && Math.abs(lflat[0]) >= Math.abs(lflat[2]) ? 0 : Math.abs(lflat[1]) >= Math.abs(lflat[2]) ? 1 : 2;
    const [u0, v0, u1, v1] = tuile(tr.piece.mat);
    const base = teinte(tr.piece.mat);
    const tt = tr.piece.teinte ?? [1, 1, 1];
    const col = [base[0] * num(tt[0], 1), base[1] * num(tt[1], 1), base[2] * num(tt[2], 1)];
    parMatiere[tr.piece.mat ?? '?'] = (parMatiere[tr.piece.mat ?? '?'] ?? 0) + 1;
    for (let k = 0; k < 3; k += 1) {
      const p = tr.p[k];
      const q = tr.local[k];
      const f = q.map((v, c) => (v - tr.mn[c]) / tr.ext[c]);
      // Projection par l'axe dominant : côté (x) → (z, y) ; dessus (y) → (z, x) ; bout (z) → (x, y).
      const [a, b] = ax === 0 ? [f[2], f[1]] : ax === 1 ? [f[2], f[0]] : [f[0], f[1]];
      for (let c = 0; c < 3; c += 1) {
        const v = p[c] * echelle * (c === 0 ? sx : 1);
        positions[i * 9 + k * 3 + c] = v;
        bmin[c] = Math.min(bmin[c], v);
        bmax[c] = Math.max(bmax[c], v);
      }
      const nn = tr.n ? tr.n[k] : flat;
      normals.set(sx === 1 ? nn : norm([nn[0] / sx, nn[1], nn[2]]), i * 9 + k * 3);
      uvs[i * 6 + k * 2] = u0 + (u1 - u0) * a;
      uvs[i * 6 + k * 2 + 1] = v0 + (v1 - v0) * b;
      colors.set(col, i * 9 + k * 3);
    }
  });
  return { positions, normals, uvs, colors, triangles: n, bornes: { min: n ? bmin : [0, 0, 0], max: n ? bmax : [0, 0, 0] }, parMatiere };
}

// Empreinte (somme simple) d'un maillage : contrôle de déterminisme.
export function empreinte(m) {
  let h = 2166136261;
  for (const arr of [m.positions, m.normals, m.uvs, m.colors]) {
    const u = new Uint32Array(arr.buffer, arr.byteOffset, arr.length);
    for (let i = 0; i < u.length; i += 1) h = Math.imul(h ^ u[i], 16777619);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}
