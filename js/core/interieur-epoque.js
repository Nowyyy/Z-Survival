// Lot 9i : décor intérieur d'époque (1942) — atelier et plan de placement (rien n'est branché sur la partie avant le « GO 9i » du propriétaire).
// Pur : ni Three.js, ni DOM, ni hasard du navigateur, ni horloge ; mêmes entrées, même sortie. Docs/ref/decor-epoque.md (« Intérieur et menu »).
// - Modèles : radio et téléphone de campagne, machine à écrire, cartes punaisées, brancard, caisse médicale, casques, ampoules nues ; chaque objet est une
//   liste de pièces convexes (boîtes, troncs, cylindres) ou de plaques, triangulées (faces du dessous retirées : la caméra du jeu ne les voit jamais).
//   Chaque triangle porte sa matière (région de l'atlas intérieur + teinte), son groupe (collision) et, pour le verre des ampoules, une lueur propre.
// - Atlas intérieur : une texture générée de 256 px (métal, bois, toile, cuir, bakélite, couverture, verre, cadran, clavier, papier, caisse médicale,
//   cartes), couleurs passées en argument (jetons --game-* mélangés : data/game/interieur-epoque.json) ; aucune image.
// - Placement : objets de data/game/maps/<carte>/interieur-epoque.json (unités du jeu, étage, meuble porteur ou mur) ; contrôles : pièce, fenêtres,
//   portes, escaliers, lampes, interstices, meuble porteur ; chemins des zombies (champs de flux depuis chaque fenêtre, avant / après).
// Repère d'un modèle : x vers l'est, y vers le haut, z vers le sud (haut de l'écran = nord) ; dans le monde : x du jeu → x, y du jeu → z, hauteur y.
// Caisse médicale : croix blanche sur fond vert et « MEDICAL » ; jamais de croix rouge (emblème protégé par les conventions de Genève).
import { rectGap } from './collision.js';
import { couleursEpoque } from './decor-epoque.js';
import { buildFlow, createGrid, INF } from './nav.js';
import { pointInPolygon } from './shape.js';
import { isNum, num } from './vec.js';

const DEG = Math.PI / 180;
export const ECHELLE = 28; // unités du jeu par mètre (comme le décor extérieur et les armes)
export const HAUTEUR_ARME = 43; // ce qui est dessiné plus bas laisse passer balles, laser et cône (règle du lot 8j)
export const HAUTEUR_MAX = 70; // plafond des meubles (CLAUDE.md : meubles ≤ 70)
export { couleursEpoque };

// --- Atlas intérieur ---------------------------------------------------------------------------------------------------------------------------------
export const ATLAS_TAILLE = 256;
export const REGIONS = Object.freeze({
  metal: { x: 0, y: 0, w: 64, h: 64 }, bois: { x: 64, y: 0, w: 64, h: 64 }, toile: { x: 128, y: 0, w: 64, h: 64 }, cuir: { x: 192, y: 0, w: 64, h: 64 },
  bakelite: { x: 0, y: 64, w: 64, h: 64 }, couverture: { x: 64, y: 64, w: 64, h: 64 }, verre: { x: 128, y: 64, w: 64, h: 64 }, uni: { x: 192, y: 64, w: 64, h: 64 },
  cadran: { x: 0, y: 128, w: 64, h: 64 }, clavier: { x: 64, y: 128, w: 64, h: 64 }, papier: { x: 128, y: 128, w: 64, h: 64 }, medical: { x: 192, y: 128, w: 64, h: 64 },
  carte: { x: 0, y: 192, w: 128, h: 64 }, feuilles: { x: 128, y: 192, w: 128, h: 64 },
});
export function regionUv(id, taille = ATLAS_TAILLE) {
  const r = REGIONS[id] ?? REGIONS.uni;
  return { u0: (r.x + 1) / taille, v0: (r.y + 1) / taille, u1: (r.x + r.w - 1) / taille, v1: (r.y + r.h - 1) / taille };
}

// Matières : région, échelle (unités du monde par largeur de région), ajustée (région entière sur la face), teinte (clé de couleurs ; « neutre » :
// la texture seule), lueur (verre des ampoules : couleur propre, sans lumière nouvelle).
export const MATIERES = Object.freeze({
  olive: { region: 'metal', echelle: 20, teinte: 'olive' }, acier: { region: 'metal', echelle: 20, teinte: 'acier' },
  bois: { region: 'bois', echelle: 30, teinte: 'bois' }, toile: { region: 'toile', echelle: 24, teinte: 'toile' }, cuir: { region: 'cuir', echelle: 14, teinte: 'cuir' },
  bakelite: { region: 'bakelite', echelle: 12, teinte: 'bakelite' }, couverture: { region: 'couverture', echelle: 16, teinte: 'neutre' },
  ficelle: { region: 'uni', echelle: 10, teinte: 'ficelle' }, punaise: { region: 'uni', echelle: 10, teinte: 'punaise' }, pansement: { region: 'uni', echelle: 10, teinte: 'pansement' },
  cadran: { region: 'cadran', ajuste: true, teinte: 'neutre' }, clavier: { region: 'clavier', ajuste: true, teinte: 'neutre' }, papier: { region: 'papier', ajuste: true, teinte: 'neutre' },
  medical: { region: 'medical', ajuste: true, teinte: 'neutre' }, carte: { region: 'carte', ajuste: true, teinte: 'neutre' }, feuille: { region: 'feuilles', ajuste: true, teinte: 'neutre' },
  verre: { region: 'verre', echelle: 6, teinte: 'neutre', lueur: true },
  // Retour du propriétaire : étui du téléphone en toile kaki claire (en cuir, il avait la couleur de la table et ne se voyait pas).
  etoffe: { region: 'toile', echelle: 24, teinte: 'etoffe' },
});

function hash(x, y, s) {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(s | 0, 1274126177)) | 0;
  h = Math.imul(h ^ (h >>> 15), 2246822519);
  h = Math.imul(h ^ (h >>> 13), 3266489917);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

// Police de pochoir 3 × 5 (rangées du haut vers le bas, bits de gauche à droite) : lettres de « MEDICAL » et quelques chiffres (cartes : carroyage).
const GLYPHES = {
  M: [5, 7, 7, 5, 5], E: [7, 4, 6, 4, 7], D: [6, 5, 5, 5, 6], I: [7, 2, 2, 2, 7], C: [7, 4, 4, 4, 7], A: [2, 5, 7, 5, 5], L: [4, 4, 4, 4, 7],
  1: [2, 6, 2, 2, 7], 2: [7, 1, 7, 4, 7], 3: [7, 1, 3, 1, 7], 4: [5, 5, 7, 1, 1], ' ': [0, 0, 0, 0, 0],
};
// Textes de l'atlas (génériques : aucune unité réelle, aucune marque, aucun emblème).
export const TEXTES = Object.freeze({ medical: 'MEDICAL' });

// Atlas intérieur (carré de `taille` px, RGBA) ; couleurs : sortie de couleursEpoque (clés de data/game/interieur-epoque.json) ; absentes : gris neutre.
// Régions en niveaux de gris (multipliées par la teinte de la matière) sauf cadran, clavier, papier, caisse médicale, cartes, couverture et verre
// (couleurs propres). → { width, height, data: Uint8ClampedArray, octets }.
export function atlasInterieur({ taille = ATLAS_TAILLE, couleurs = {} } = {}) {
  const N = taille === 128 || taille === 256 || taille === 512 ? taille : ATLAS_TAILLE;
  const k = N / ATLAS_TAILLE;
  const data = new Uint8ClampedArray(N * N * 4);
  const c = (cle, d = [128, 128, 128]) => (Array.isArray(couleurs[cle]) ? couleurs[cle] : d);
  const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
  const set = (x, y, rgb) => {
    if (x < 0 || y < 0 || x >= N || y >= N) return;
    const i = (y * N + x) * 4;
    data[i] = rgb[0];
    data[i + 1] = rgb[1];
    data[i + 2] = rgb[2];
    data[i + 3] = 255;
  };
  const gris = (g) => [g, g, g];
  // Remplit une région : f(u, v, x, y) → [r, g, b] (u, v dans [0, 1[ ; v = 0 en bas du dessin, comme les coordonnées de texture).
  const region = (id, f) => {
    const r = REGIONS[id];
    const x0 = Math.round(r.x * k);
    const y0 = Math.round(r.y * k);
    const w = Math.round(r.w * k);
    const h = Math.round(r.h * k);
    for (let y = 0; y < h; y += 1) for (let x = 0; x < w; x += 1) set(x0 + x, y0 + y, f(x / w, y / h, x, y, w, h));
  };
  region('metal', (u, v, x, y) => gris(150 + 30 * hash(x, y >> 1, 1) - 18 * (hash(x >> 3, y >> 3, 2) > 0.85 ? 1 : 0)));
  region('bois', (u, v, x, y) => gris(130 + 40 * Math.sin(u * 40 + 3 * Math.sin(v * 9) + hash(0, y >> 2, 3) * 2) * 0.5 + 20 * hash(x, y, 4) - (y % 16 === 0 ? 40 : 0)));
  region('toile', (u, v, x, y) => gris(140 + ((x + y) % 2 ? 18 : -10) + 14 * hash(x >> 1, y >> 1, 5)));
  region('cuir', (u, v, x, y) => gris(135 + 35 * (hash(x >> 1, y >> 1, 6) - 0.5) + 15 * Math.sin(u * 12 + v * 7)));
  region('bakelite', (u, v, x, y) => gris(120 + 20 * hash(x >> 2, y >> 2, 7) + (Math.abs(u - 0.3) < 0.04 ? 40 : 0)));
  region('couverture', (u, v, x, y) => mix(c('couverture'), c('couverture-bande'), Math.abs(v - 0.5) < 0.06 || Math.abs(v - 0.3) < 0.02 ? 1 : 0).map((q) => q * (0.9 + 0.2 * hash(x, y, 8))));
  region('verre', (u, v) => mix(c('verre'), c('verre-coeur'), Math.max(0, 1 - Math.hypot(u - 0.5, v - 0.5) * 2.2)));
  region('uni', (u, v, x, y) => gris(200 + 20 * hash(x, y, 9)));
  // Cadran de la radio : façade olive, deux boutons, une fenêtre de fréquences claire à graduations, une prise.
  region('cadran', (u, v, x, y) => {
    const fond = c('olive').map((q) => q * (0.85 + 0.15 * hash(x >> 1, y >> 1, 10)));
    if (u > 0.15 && u < 0.62 && v > 0.55 && v < 0.82) return (x % 4 === 0 && v < 0.64) ? c('encre') : c('cadran-vitre');
    for (const [bu, bv, br] of [[0.78, 0.68, 0.12], [0.3, 0.27, 0.1], [0.62, 0.27, 0.1]]) if (Math.hypot(u - bu, v - bv) < br) return c('bakelite');
    if (u > 0.04 && u < 0.96 && (v < 0.06 || v > 0.94)) return c('olive').map((q) => q * 0.6);
    return fond;
  });
  // Clavier de la machine à écrire : quatre rangées de touches rondes claires sur fond noir.
  region('clavier', (u, v) => {
    const rang = Math.floor(v * 4);
    const du = ((u * 10 + rang * 0.25) % 1) - 0.5;
    const dv = ((v * 4) % 1) - 0.5;
    return Math.hypot(du, dv) < 0.33 ? c('touche') : c('bakelite').map((q) => q * 0.8);
  });
  // Feuille de papier tapée : fond pâle, lignes de texte (traits gris), marge.
  region('papier', (u, v, x, y) => (u > 0.12 && u < 0.88 && v < 0.85 && (y % 5 === 0) && hash(x >> 2, y, 11) > 0.25 ? c('encre') : c('papier').map((q) => q * (0.95 + 0.05 * hash(x, y, 12)))));
  // Caisse médicale : bois peint en vert, croix blanche (bras égaux), « MEDICAL » au pochoir blanc dessous, liseré sombre.
  region('medical', (u, v, x, y) => {
    const vert = c('medical-vert').map((q) => q * (0.88 + 0.12 * hash(x >> 1, y >> 2, 13)));
    if (u < 0.04 || u > 0.96 || v < 0.04 || v > 0.96) return vert.map((q) => q * 0.6);
    const cu = u - 0.5;
    const cv = v - 0.62;
    if ((Math.abs(cu) < 0.07 && Math.abs(cv) < 0.21) || (Math.abs(cv) < 0.07 && Math.abs(cu) < 0.21)) return c('medical-blanc');
    // « MEDICAL » : 7 glyphes de 3 × 5 (pas de 4) centrés vers le bas de la face (y de données croissant = v croissant).
    const txt = TEXTES.medical;
    const cols = txt.length * 4 - 1;
    const px = Math.floor(((u - 0.12) / 0.76) * cols);
    const py = 4 - Math.floor(((v - 0.12) / 0.16) * 5);
    if (px >= 0 && px < cols && py >= 0 && py < 5 && px % 4 !== 3) {
      const g = GLYPHES[txt[Math.floor(px / 4)]] ?? GLYPHES[' '];
      if ((g[py] >> (2 - (px % 4))) & 1) return c('medical-blanc');
    }
    return vert;
  });
  // Carte d'état-major inventée : papier, courbes de niveau, rivière, routes, carroyage, quelques punaises (sombres : rien de vif).
  const carte = (graine, decale) => (u, v, x, y) => {
    let col = c('papier').map((q) => q * (0.93 + 0.07 * hash(x >> 1, y >> 1, graine)));
    const relief = Math.sin(u * 9 + graine) * 0.5 + Math.cos(v * 7 + u * 3) * 0.5;
    if (Math.abs(((relief * 6 + 10) % 1) - 0.5) < 0.05) col = mix(col, c('relief'), 0.7);
    if (Math.abs(v - (0.35 + 0.15 * Math.sin(u * 6 + graine))) < 0.02) col = c('riviere');
    if (Math.abs(u - (0.55 + 0.1 * Math.sin(v * 5 + graine))) < 0.012 || Math.abs(v - 0.7 + 0.2 * u) < 0.01) col = c('route');
    if (x % 16 === 0 || y % 16 === 0) col = mix(col, c('encre'), 0.35);
    if (decale && (Math.floor(u * 3) !== Math.floor((u + 0.006) * 3))) col = c('encre');
    for (const [pu, pv] of [[0.3, 0.6], [0.62, 0.42], [0.78, 0.78]]) if (Math.hypot((u - pu) * 2, v - pv) < 0.035) col = c('punaise');
    if (u < 0.01 || u > 0.99 || v < 0.02 || v > 0.98) col = col.map((q) => q * 0.7);
    return col;
  };
  region('carte', carte(14, false));
  region('feuilles', carte(15, true));
  return { width: N, height: N, data, octets: Math.round(N * N * 4 * 4 / 3) };
}

// --- Construction des modèles ------------------------------------------------------------------------------------------------------------------------
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const unit = (v) => {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
};
const rotX = (p, a) => [p[0], p[1] * Math.cos(a) - p[2] * Math.sin(a), p[1] * Math.sin(a) + p[2] * Math.cos(a)];
const rotY = (p, a) => [p[0] * Math.cos(a) + p[2] * Math.sin(a), p[1], -p[0] * Math.sin(a) + p[2] * Math.cos(a)];
const rotZ = (p, a) => [p[0] * Math.cos(a) - p[1] * Math.sin(a), p[0] * Math.sin(a) + p[1] * Math.cos(a), p[2]];
const r3 = (v) => Math.round(v * 1000) / 1000;
const transform = (p, { rx = 0, rz = 0, ry = 0, t = [0, 0, 0] } = {}) => {
  const q = rotY(rotZ(rotX(p, rx * DEG), rz * DEG), ry * DEG);
  return [q[0] + t[0], q[1] + t[1], q[2] + t[2]];
};
const HEXA = [[0, 3, 2, 1], [4, 5, 6, 7], [0, 1, 5, 4], [1, 2, 6, 5], [2, 3, 7, 6], [3, 0, 4, 7]];

function modele() {
  const pieces = [];
  const m = {
    pieces,
    hexa(id, mat, group, pts, tr) {
      pieces.push({ id, mat, group, pts: pts.map((p) => transform(p, tr)), faces: HEXA });
      return m;
    },
    boite(id, mat, group, [x0, x1], [y0, y1], [z0, z1], tr) {
      return m.hexa(id, mat, group, [[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [x1, y0, z0], [x1, y0, z1], [x1, y1, z1], [x1, y1, z0]], tr);
    },
    // Barre fine d'un point à un autre (section carrée e) : antennes, fils, ficelles, montants.
    barre(id, mat, group, a, b, e = 0.4) {
      const d = sub(b, a);
      const n = unit(Math.abs(d[1]) > 0.9 * Math.hypot(...d) ? cross(d, [1, 0, 0]) : cross(d, [0, 1, 0]));
      const o = unit(cross(d, n));
      const c4 = (p) => [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([s, t]) => [p[0] + (n[0] * s + o[0] * t) * e / 2, p[1] + (n[1] * s + o[1] * t) * e / 2, p[2] + (n[2] * s + o[2] * t) * e / 2]);
      pieces.push({ id, mat, group, pts: [...c4(a), ...c4(b)], faces: HEXA });
      return m;
    },
    // Cylindre (ou tronc de cône) le long de x, de 0 à len, rayons r0 → r1, `cotes` pans.
    cylindre(id, mat, group, { r0, r1 = r0, len, cotes = 6, phase = 0 }, tr) {
      const pts = [];
      for (const [x, r] of [[0, r0], [len, r1]]) for (let i = 0; i < cotes; i += 1) {
        const a = phase + (i / cotes) * Math.PI * 2;
        pts.push(transform([x, Math.sin(a) * r, Math.cos(a) * r], tr));
      }
      const faces = [];
      for (let i = 0; i < cotes; i += 1) faces.push([i, (i + 1) % cotes, cotes + ((i + 1) % cotes), cotes + i]);
      if (r0 > 0.01) faces.push([...Array(cotes).keys()].reverse());
      if (r1 > 0.01) faces.push([...Array(cotes).keys()].map((i) => cotes + i));
      pieces.push({ id, mat, group, pts, faces });
      return m;
    },
    // Plaque (une face, normale imposée n) : cartes, feuilles, toile tendue.
    plaque(id, mat, group, pts, n, tr) {
      const tp = pts.map((p) => transform(p, tr));
      const tn = unit(sub(transform(n, { ...tr, t: [0, 0, 0] }), [0, 0, 0]));
      pieces.push({ id, mat, group, pts: tp, faces: [[...Array(tp.length).keys()]], plaque: tn });
      return m;
    },
  };
  return m;
}

// Coordonnées de texture d'une face (projection sur le plan le plus proche de la normale ; région entière ou fenêtre décalée par pièce).
function uvFace(poly, n, mat, id) {
  const M = MATIERES[mat] ?? MATIERES.bois;
  const r = regionUv(M.region);
  const [ax, ay, az] = n.map(Math.abs);
  let A;
  let B;
  if (ay >= ax && ay >= az) {
    A = (p) => p[0];
    B = (p) => -p[2] * Math.sign(n[1] || 1);
  } else if (ax >= az) {
    A = (p) => -p[2] * Math.sign(n[0]);
    B = (p) => p[1];
  } else {
    A = (p) => p[0] * Math.sign(n[2]);
    B = (p) => p[1];
  }
  const as = poly.map(A);
  const bs = poly.map(B);
  const a0 = Math.min(...as);
  const b0 = Math.min(...bs);
  const sa = Math.max(1e-6, Math.max(...as) - a0);
  const sb = Math.max(1e-6, Math.max(...bs) - b0);
  if (M.ajuste) return poly.map((p, i) => [r.u0 + ((as[i] - a0) / sa) * (r.u1 - r.u0), r.v0 + ((bs[i] - b0) / sb) * (r.v1 - r.v0)]);
  let h = 2166136261;
  for (const ch of String(id)) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  const e = Math.max(1, M.echelle ?? 20);
  const wu = Math.min(1, sa / e);
  const wv = Math.min(1, sb / e);
  const ou = (((h >>> 0) % 997) / 997) * (1 - wu);
  const ov = (((h >>> 10) % 991) / 991) * (1 - wv);
  return poly.map((p, i) => [r.u0 + (ou + ((as[i] - a0) / sa) * wu) * (r.u1 - r.u0), r.v0 + (ov + ((bs[i] - b0) / sb) * wv) * (r.v1 - r.v0)]);
}

// Triangulation : faces orientées vers l'extérieur (centre de la pièce) ; faces tournées vers le bas retirées (jamais vues d'en haut), sauf plaques.
// → [{ part, mat, group, p: [[x, y, z] × 3], n, uv: [[u, v] × 3], lueur }].
function trianguler(m) {
  const tris = [];
  for (const piece of m.pieces) {
    const centre = piece.pts.reduce((s, p) => [s[0] + p[0], s[1] + p[1], s[2] + p[2]], [0, 0, 0]).map((v) => v / piece.pts.length);
    for (const f of piece.faces) {
      let poly = f.map((i) => piece.pts[i]);
      let n = unit(cross(sub(poly[1], poly[0]), sub(poly[2], poly[0])));
      if (piece.plaque) {
        if (dot3(n, piece.plaque) < 0) {
          poly = [...poly].reverse();
          n = n.map((v) => -v);
        }
      } else {
        const mid = poly.reduce((s, p) => [s[0] + p[0], s[1] + p[1], s[2] + p[2]], [0, 0, 0]).map((v) => v / poly.length);
        if (dot3(n, sub(mid, centre)) < 0) {
          poly = [...poly].reverse();
          n = n.map((v) => -v);
        }
        if (n[1] < -0.7) continue; // dessous : jamais vu par la caméra du jeu (75° vers le bas)
      }
      if (!poly.every((p) => p.every(isNum)) || Math.hypot(...n) < 0.5) continue;
      const uv = uvFace(poly, n, piece.mat, piece.id);
      for (let i = 1; i + 1 < poly.length; i += 1) {
        const p = [poly[0], poly[i], poly[i + 1]];
        if (Math.hypot(...cross(sub(p[1], p[0]), sub(p[2], p[0]))) < 1e-6) continue;
        tris.push({ part: piece.id, mat: piece.mat, group: piece.group, p: p.map((v) => v.map(r3)), n: n.map((v) => Math.round(v * 10000) / 10000), uv: [uv[0], uv[i], uv[i + 1]].map((q) => q.map((v) => Math.round(v * 100000) / 100000)), lueur: MATIERES[piece.mat]?.lueur === true });
      }
    }
  }
  return tris;
}

function bornes(tris) {
  const b = { x0: Infinity, x1: -Infinity, y0: Infinity, y1: -Infinity, z0: Infinity, z1: -Infinity };
  for (const t of tris) for (const p of t.p) {
    b.x0 = Math.min(b.x0, p[0]);
    b.x1 = Math.max(b.x1, p[0]);
    b.y0 = Math.min(b.y0, p[1]);
    b.y1 = Math.max(b.y1, p[1]);
    b.z0 = Math.min(b.z0, p[2]);
    b.z1 = Math.max(b.z1, p[2]);
  }
  return b;
}
const rectDe = (tris) => {
  if (tris.length === 0) return null;
  const b = bornes(tris);
  const x = Math.floor(b.x0);
  const y = Math.floor(b.z0);
  return { x, y, w: Math.ceil(b.x1) - x, h: Math.ceil(b.z1) - y };
};

// --- Modèles (origine : centre du bas, posé à y = 0 ; le placement ajoute la hauteur du meuble porteur) ---------------------------------------------
// Radio de campagne (≈ 0,48 × 0,3 × 0,32 m) : caisse olive à façade (cadran), combiné posé dessus, antenne fouet courte ; poste dorsal debout à longue
// antenne ; poste et générateur à manivelle. hMax : hauteur disponible au-dessus du porteur (antenne raccourcie pour rester sous 70).
export function modeleRadio(variante, { hMax = 30 } = {}) {
  const v = ['caisse', 'dorsal', 'generateur'].includes(variante) ? variante : 'caisse';
  const m = modele();
  const antenne = (x, y, z, h) => m.barre('antenne', 'acier', 'deco', [x, y, z], [x + 1, Math.min(hMax - 0.5, y + h), z - 1], 0.45);
  if (v === 'dorsal') {
    m.boite('corps', 'olive', 'deco', [-4, 4], [0, 12], [-2.5, 2.5]);
    m.plaque('facade', 'cadran', 'deco', [[-3.4, 6, 2.55], [3.4, 6, 2.55], [3.4, 11.4, 2.55], [-3.4, 11.4, 2.55]], [0, 0, 1]);
    m.boite('sangle-g', 'toile', 'deco', [-3.4, -2.4], [1, 11], [-3.2, -2.5]);
    m.boite('sangle-d', 'toile', 'deco', [2.4, 3.4], [1, 11], [-3.2, -2.5]);
    m.boite('combine', 'bakelite', 'deco', [4, 5.6], [1, 7], [-1, 1.4], { rz: -8 });
    antenne(-2.6, 12, -1, 30);
  } else {
    m.boite('corps', 'olive', 'deco', [-6.5, 6.5], [0, 8.5], [-4, 4]);
    m.plaque('facade', 'cadran', 'deco', [[-6, 0.6, 4.05], [6, 0.6, 4.05], [6, 8, 4.05], [-6, 8, 4.05]], [0, 0, 1]);
    m.boite('couvercle', 'olive', 'deco', [-6.5, 6.5], [0, 0.8], [-4, 4], { rx: -70, t: [0, 8.5, -4] });
    m.boite('combine', 'bakelite', 'deco', [-4, 3], [8.5, 9.8], [0.5, 2.5]);
    m.boite('combine-oreille', 'bakelite', 'deco', [-5, -3], [8.5, 10.6], [0, 3]);
    antenne(5, 8.5, -2.5, 16);
    if (v === 'generateur') {
      m.boite('generateur', 'olive', 'deco', [8, 14], [0, 6], [-3, 3]);
      m.cylindre('moyeu', 'acier', 'deco', { r0: 0.8, len: 1.5, cotes: 6 }, { ry: 90, t: [11, 5, -3] });
      m.barre('manivelle-1', 'acier', 'deco', [11, 5.5, -4.5], [11, 9.5, -4.5], 0.6);
      m.barre('manivelle-2', 'acier', 'deco', [11, 5.5, 3.5], [11, 1.5, 3.5], 0.6);
      m.boite('poignee', 'bakelite', 'deco', [10.4, 11.6], [9, 10.4], [-6, -4.5]);
    }
  }
  return { modele: m };
}

// Téléphone de campagne (étui ≈ 0,25 × 0,1 × 0,2 m, en toile kaki claire : retour du propriétaire, en cuir il se confondait avec la table) : étui fermé à sangle ; étui ouvert, combiné posé à côté ; avec bobine de câble.
export function modeleTelephone(variante) {
  const v = ['etui', 'ouvert', 'bobine'].includes(variante) ? variante : 'etui';
  const m = modele();
  m.boite('etui', 'etoffe', 'deco', [-3.5, 3.5], [0, 3], [-2.8, 2.8]);
  m.boite('sangle', 'cuir', 'deco', [-0.6, 0.6], [0, 3.4], [-3, 3]);
  if (v === 'etui') m.boite('boucle', 'acier', 'deco', [-0.8, 0.8], [2.6, 3.5], [2.6, 3.1]);
  else {
    m.boite('rabat', 'etoffe', 'deco', [-3.5, 3.5], [0, 0.5], [-2.8, 2.8], { rx: 60, t: [0, 3, -2.8] });
    m.boite('combine', 'bakelite', 'deco', [-3, 3], [3, 3.8], [-0.6, 0.6], v === 'ouvert' ? { ry: 25, t: [5, -3, 3] } : { t: [0, 0, 0.5] });
    m.boite('combine-bout', 'bakelite', 'deco', [-1, 1], [3, 4.3], [-1, 1], v === 'ouvert' ? { ry: 25, t: [7.5, -3, 1.8] } : { t: [-2.6, 0, 0.5] });
    if (v === 'bobine') {
      m.cylindre('bobine', 'acier', 'deco', { r0: 2.4, len: 3, cotes: 8 }, { t: [4.5, 2.4, -1.5], ry: 90 });
      m.cylindre('cable', 'bakelite', 'deco', { r0: 2, len: 2.4, cotes: 8 }, { t: [4.5, 2.4, -1.2], ry: 90 });
      m.barre('fil', 'bakelite', 'deco', [4.5, 1, 0.5], [3.5, 3, 0], 0.3);
    }
  }
  return { modele: m };
}

// Machine à écrire de campagne (≈ 0,32 × 0,32 × 0,15 m) : noire ; portable fermée dans son étui ; avec une feuille engagée.
export function modeleMachine(variante) {
  const v = ['noire', 'portable', 'papier'].includes(variante) ? variante : 'noire';
  const m = modele();
  if (v === 'portable') {
    m.boite('etui', 'toile', 'deco', [-5, 5], [0, 4.2], [-4.5, 4.5]);
    m.boite('couvercle', 'cuir', 'deco', [-5.2, 5.2], [3.6, 4.6], [-4.7, 4.7]);
    m.boite('poignee', 'cuir', 'deco', [-1.5, 1.5], [4.6, 5.4], [-0.4, 0.4]);
    return { modele: m };
  }
  m.boite('socle', 'bakelite', 'deco', [-4.5, 4.5], [0, 1.6], [-4.5, 4.5]);
  m.hexa('corps', 'bakelite', 'deco', [[-4.2, 1.6, 4.4], [-4.2, 1.6, -2], [-4.2, 4.2, -2], [-4.2, 2.4, 4.4], [4.2, 1.6, 4.4], [4.2, 1.6, -2], [4.2, 4.2, -2], [4.2, 2.4, 4.4]]);
  m.plaque('clavier', 'clavier', 'deco', [[-3.8, 2.45, 4.2], [3.8, 2.45, 4.2], [3.8, 3.9, 0.2], [-3.8, 3.9, 0.2]], [0, 1, 0.4]);
  m.cylindre('rouleau', 'bakelite', 'deco', { r0: 0.9, len: 11, cotes: 6 }, { t: [-5.5, 4.6, -2.6] });
  m.boite('levier', 'acier', 'deco', [-6.6, -5.4], [4.2, 4.8], [-3.6, -1.4]);
  if (v === 'papier') m.plaque('feuille', 'papier', 'deco', [[-3, 4.8, -2.6], [3, 4.8, -2.6], [3, 11.5, -4.4], [-3, 11.5, -4.4]], [0, 0.26, 1]);
  return { modele: m };
}

// Cartes punaisées au mur (plaques à 0,6 du mur, face vers le sud dans le repère du modèle ; tournées au placement) : grande carte ; trois feuilles ;
// carte et ficelles tendues entre des punaises.
export function modeleCarte(variante) {
  const v = ['grande', 'trois', 'ficelles'].includes(variante) ? variante : 'grande';
  const m = modele();
  const plaque = (id, mat, x0, x1, y0, y1, z = 0.6, tr = {}) => m.plaque(id, mat, 'deco', [[x0, y0, z], [x1, y0, z], [x1, y1, z], [x0, y1, z]], [0, 0, 1], tr);
  if (v === 'trois') {
    plaque('f1', 'feuille', -20, -7, 24, 42, 0.6, { rz: 3 });
    plaque('f2', 'feuille', -6, 7, 26, 46, 0.7, { rz: -2 });
    plaque('f3', 'feuille', 8, 21, 22, 40, 0.8, { rz: 4 });
  } else {
    plaque('carte', 'carte', -17, 17, 22, 46);
    if (v === 'ficelles') {
      const pts = [[-10, 37], [4, 32], [12, 40], [-4, 27]];
      for (let i = 0; i + 1 < pts.length; i += 1) m.barre(`ficelle-${i}`, 'ficelle', 'deco', [pts[i][0], pts[i][1], 0.9], [pts[i + 1][0], pts[i + 1][1], 0.9], 0.35);
      pts.forEach(([x, y], i) => m.boite(`punaise-${i}`, 'punaise', 'deco', [x - 0.6, x + 0.6], [y - 0.6, y + 0.6], [0.6, 1.4]));
    }
  }
  return { modele: m };
}

// Brancard (2,3 × 0,58 m) : toile au sol sur ses étriers ; sur deux tréteaux ; avec une couverture pliée.
export function modeleBrancard(variante) {
  const v = ['toile', 'treteaux', 'couverture'].includes(variante) ? variante : 'toile';
  const m = modele();
  const y = v === 'treteaux' ? 18.5 : 2.2;
  for (const z of [-7.4, 7.4]) m.boite(`hampe${z > 0 ? 'S' : 'N'}`, 'bois', 'brancard', [-32, 32], [y, y + 1.4], [z - 0.7, z + 0.7]);
  m.plaque('toile', 'toile', 'brancard', [[-25, y + 1.2, -7], [25, y + 1.2, -7], [25, y + 0.7, 7], [-25, y + 0.7, 7]], [0, 1, 0]);
  for (const x of [-22, 22]) {
    if (v === 'treteaux') {
      for (const s of [-1, 1]) m.barre(`pied-${x}-${s}`, 'bois', 'brancard', [x + s * 5, 0, -7.4], [x, y, -7.4], 1.2).barre(`pied-${x}-${s}-s`, 'bois', 'brancard', [x + s * 5, 0, 7.4], [x, y, 7.4], 1.2);
      m.boite(`traverse-${x}`, 'bois', 'brancard', [x - 0.8, x + 0.8], [y - 1.2, y], [-7.8, 7.8]);
    } else for (const z of [-7.4, 7.4]) m.boite(`etrier-${x}-${z}`, 'acier', 'brancard', [x - 0.5, x + 0.5], [0, y], [z - 0.5, z + 0.5]);
  }
  if (v === 'couverture') m.boite('couverture', 'couverture', 'brancard', [6, 22], [y + 1.2, y + 4.4], [-6.2, 6.2], { ry: 6 });
  return { modele: m };
}

// Caisse médicale (≈ 0,6 × 0,36 × 0,4 m, bois peint en vert, croix blanche, « MEDICAL ») : une ; deux empilées ; ouverte avec pansements.
export function modeleCaisseMedicale(variante) {
  const v = ['une', 'pile', 'ouverte'].includes(variante) ? variante : 'une';
  const m = modele();
  const caisse = (id, y, h, ry = 0, t = [0, 0]) => {
    const tr = { ry, t: [t[0], 0, t[1]] };
    m.boite(id, 'medical', 'caisse', [-8.5, 8.5], [y, y + h], [-5.5, 5.5], tr);
    m.boite(`${id}-corde-e`, 'ficelle', 'caisse', [8.5, 9.3], [y + h * 0.55, y + h * 0.7], [-1.5, 1.5], tr);
    m.boite(`${id}-corde-o`, 'ficelle', 'caisse', [-9.3, -8.5], [y + h * 0.55, y + h * 0.7], [-1.5, 1.5], tr);
  };
  if (v === 'pile') {
    caisse('c0', 0, 10);
    caisse('c1', 10, 9, 0, [1.2, 0]); // décalée vers l'est seulement : même profondeur que la caisse du dessous (contacts exacts)
  } else if (v === 'ouverte') {
    caisse('corps', 0, 8);
    m.boite('fond', 'pansement', 'caisse', [-7.6, 7.6], [0, 6.5], [-4.6, 4.6]);
    for (let i = 0; i < 4; i += 1) m.cylindre(`rouleau-${i}`, 'pansement', 'caisse', { r0: 1.6, len: 3, cotes: 6 }, { ry: 90, t: [-5.5 + i * 3.6, 7.6, -1.5] });
    m.boite('couvercle', 'medical', 'caisse', [-8.5, 8.5], [0, 1.2], [-5.5, 5.5], { t: [19.5, 0, 0] }); // couvercle posé à l'est de la caisse
  } else caisse('c0', 0, 10);
  return { modele: m };
}

// Casques M1 au sol (calotte de 0,28 m, 6 à 8 pans) : un ; deux ; un renversé (jugulaire pendante).
export function modeleCasques(variante) {
  const v = ['un', 'deux', 'renverse'].includes(variante) ? variante : 'un';
  const m = modele();
  const casque = (id, x, z, ry = 0, renverse = false) => {
    const tr = (t) => ({ rz: 90, ry, t: [x, t, z] });
    if (renverse) {
      m.cylindre(`${id}-calotte`, 'olive', 'deco', { r0: 1.4, r1: 4, len: 3.2, cotes: 7 }, tr(0));
      m.barre(`${id}-jugulaire`, 'cuir', 'deco', [x - 3.8, 3, z], [x - 6, 0.2, z + 2], 0.4);
    } else {
      m.cylindre(`${id}-bord`, 'olive', 'deco', { r0: 4.1, r1: 3.7, len: 0.6, cotes: 7 }, tr(0));
      m.cylindre(`${id}-calotte`, 'olive', 'deco', { r0: 3.6, r1: 1.4, len: 3.6, cotes: 7 }, tr(0.6));
    }
  };
  if (v === 'deux') {
    casque('k0', -4, 0, 0);
    casque('k1', 5, 3, 30);
  } else casque('k0', 0, 0, 0, v === 'renverse');
  return { modele: m };
}

// Ampoules nues au plafond (décor, aucune lumière nouvelle ; lueur propre du verre) : au bout d'un fil ; deux sur un fil tendu ; dans une cage.
export function modeleAmpoules(variante) {
  const v = ['fil', 'deux', 'cage'].includes(variante) ? variante : 'fil';
  const m = modele();
  const ampoule = (id, x, z, haut = HAUTEUR_MAX - 0.5, bas = 64) => {
    m.barre(`${id}-fil`, 'bakelite', 'deco', [x, haut, z], [x, bas + 1.6, z], 0.3);
    m.cylindre(`${id}-douille`, 'bakelite', 'deco', { r0: 0.8, len: 1.2, cotes: 6 }, { rz: 90, t: [x, bas + 0.6, z] });
    m.cylindre(`${id}-verre`, 'verre', 'deco', { r0: 0.6, r1: 1.4, len: 1.6, cotes: 6 }, { rz: -90, t: [x, bas + 0.6, z] });
    m.cylindre(`${id}-bulbe`, 'verre', 'deco', { r0: 1.4, r1: 0.4, len: 1.4, cotes: 6 }, { rz: -90, t: [x, bas - 1, z] });
    return bas;
  };
  if (v === 'deux') {
    m.barre('cordon-1', 'bakelite', 'deco', [-15, HAUTEUR_MAX - 0.5, 0], [-6, 67, 0], 0.3).barre('cordon-2', 'bakelite', 'deco', [-6, 67, 0], [6, 67, 0], 0.3).barre('cordon-3', 'bakelite', 'deco', [6, 67, 0], [15, HAUTEUR_MAX - 0.5, 0], 0.3);
    ampoule('a0', -6, 0, 67, 63);
    ampoule('a1', 6, 0, 67, 63);
  } else {
    const bas = ampoule('a0', 0, 0);
    if (v === 'cage') {
      for (const [dx, dz] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) m.barre(`cage-${dx}-${dz}`, 'acier', 'deco', [dx * 1.2, bas + 1.8, dz * 1.2], [dx * 2.2, bas - 2.6, dz * 2.2], 0.25);
      m.boite('cage-bas', 'acier', 'deco', [-2.3, 2.3], [bas - 2.8, bas - 2.5], [-2.3, 2.3]);
    }
  }
  return { modele: m };
}

// Table de 1942 (retour du propriétaire : « une vraie table ») : dessinée à la place d'un meuble existant (même rectangle, même hauteur : sa collision
// et ses tirs ne changent pas) ; plateau de planches, quatre pieds et traverses (bois) ou pieds en X repliables (pliante). w, d : emprise ; h : hauteur.
export function modeleTable(variante, { w = 100, d = 60, h = 40 } = {}) {
  const v = ['bois', 'pliante'].includes(variante) ? variante : 'bois';
  const m = modele();
  const [x0, x1, z0, z1] = [-w / 2, w / 2, -d / 2, d / 2];
  const n = Math.max(2, Math.round(d / 18));
  for (let i = 0; i < n; i += 1) m.boite(`planche-${i}`, 'bois', 'deco', [x0, x1], [h - 3, h], [z0 + (i * d) / n + 0.3, z0 + ((i + 1) * d) / n - 0.3]);
  m.boite('ceinture-n', 'bois', 'deco', [x0 + 3, x1 - 3], [h - 8, h - 3], [z0 + 3, z0 + 5]);
  m.boite('ceinture-s', 'bois', 'deco', [x0 + 3, x1 - 3], [h - 8, h - 3], [z1 - 5, z1 - 3]);
  if (v === 'pliante') {
    for (const x of [x0 + 5, x1 - 7]) {
      m.barre(`x-${x}-a`, 'bois', 'deco', [x, 0, z0 + 4], [x, h - 3, z1 - 4], 2.2);
      m.barre(`x-${x}-b`, 'bois', 'deco', [x, 0, z1 - 4], [x, h - 3, z0 + 4], 2.2);
    }
    m.boite('entretoise', 'bois', 'deco', [x0 + 5, x1 - 5], [h * 0.45, h * 0.45 + 2], [-1, 1]);
  } else {
    for (const [x, z] of [[x0 + 3, z0 + 3], [x1 - 7, z0 + 3], [x0 + 3, z1 - 7], [x1 - 7, z1 - 7]]) m.boite(`pied-${x}-${z}`, 'bois', 'deco', [x, x + 4], [0, h - 3], [z, z + 4]);
    m.boite('traverse-n', 'bois', 'deco', [x0 + 7, x1 - 7], [9, 12], [z0 + 4, z0 + 6]);
    m.boite('traverse-s', 'bois', 'deco', [x0 + 7, x1 - 7], [9, 12], [z1 - 6, z1 - 4]);
  }
  return { modele: m };
}

// --- Catalogue ------------------------------------------------------------------------------------------------------------------------------------
// type : { variantes, defaut, pose ('meuble' : sur le dessus d'un meuble ; 'mur' : contre un mur ; 'sol' ; 'plafond'), collision (groupes solides :
// rectangle dessiné de chaque groupe), budget (triangles d'une variante), clair (couleur claire : à plus de 150 d'une fenêtre) }. Noms affichés :
// data/i18n/atelier-interieur.json (dev.interieur.objet.<type>, dev.interieur.variante.<type>.<id>).
export const CATALOGUE = Object.freeze({
  radio: { variantes: ['caisse', 'dorsal', 'generateur'], defaut: 'caisse', pose: 'meuble', collision: [], budget: 120 },
  telephone: { variantes: ['etui', 'ouvert', 'bobine'], defaut: 'ouvert', pose: 'meuble', collision: [], budget: 110 },
  machine: { variantes: ['noire', 'portable', 'papier'], defaut: 'papier', pose: 'meuble', collision: [], budget: 90, clair: true },
  carte: { variantes: ['grande', 'trois', 'ficelles'], defaut: 'grande', pose: 'mur', collision: [], budget: 80, clair: true },
  brancard: { variantes: ['toile', 'treteaux', 'couverture'], defaut: 'couverture', pose: 'sol', collision: ['brancard'], budget: 130 },
  caisseMedicale: { variantes: ['une', 'pile', 'ouverte'], defaut: 'une', pose: 'sol', collision: ['caisse'], budget: 130 },
  casques: { variantes: ['un', 'deux', 'renverse'], defaut: 'deux', pose: 'sol', collision: [], budget: 100 },
  ampoules: { variantes: ['fil', 'deux', 'cage'], defaut: 'fil', pose: 'plafond', collision: [], budget: 150, clair: true },
  // Lot 9i (retours) : table dessinée à la place d'un meuble (« remplace » : id de l'obstacle) ; ni collision ni tirs nouveaux, jamais agrandie.
  table: { variantes: ['bois', 'pliante'], defaut: 'bois', pose: 'remplace', collision: [], budget: 140 },
});
export const TYPES = Object.freeze(Object.keys(CATALOGUE));

// Fichier de choix (data/game/interieur-epoque-choix.json) : { variantes: { type: id }, gardes: { type: bool } } ; toute entrée invalide = défaut.
export function lireChoix(json) {
  const variantes = {};
  const gardes = {};
  for (const type of TYPES) {
    const v = json?.variantes?.[type];
    variantes[type] = CATALOGUE[type].variantes.includes(v) ? v : CATALOGUE[type].defaut;
    gardes[type] = typeof json?.gardes?.[type] === 'boolean' ? json.gardes[type] : true;
  }
  const t = json?.taille;
  return { variantes, gardes, taille: isNum(t) && t >= 1 && t <= 3 ? t : TAILLE_DEFAUT };
}

// Facteur de taille des objets (1 : dimensions réelles à 28 unités par mètre ; borné de 1 à 3) ; TAILLE_DEFAUT : retour du propriétaire (× 2).
export const TAILLE_DEFAUT = 2;
export const taille = (v) => (isNum(v) && v >= 1 && v <= 3 ? v : 1);
const FACES = Object.freeze({ s: 0, e: 90, n: 180, o: -90 }); // face visible d'une carte (repère du modèle : vers le sud)
function construire(type, v, { base = 0, k = 1, spec = {} } = {}) {
  if (type === 'table') return modeleTable(v, { w: num(spec.w, 100), d: num(spec.l, 60), h: num(spec.hauteur, 40) });
  if (type === 'radio') return modeleRadio(v, { hMax: Math.max(4, (HAUTEUR_MAX - base) / k) });
  if (type === 'telephone') return modeleTelephone(v);
  if (type === 'machine') return modeleMachine(v);
  if (type === 'carte') return modeleCarte(v);
  if (type === 'brancard') return modeleBrancard(v);
  if (type === 'caisseMedicale') return modeleCaisseMedicale(v);
  if (type === 'casques') return modeleCasques(v);
  return modeleAmpoules(v);
}

// Objet posé : spec { id, x, y (centre, unités du jeu ; carte : point du mur), cap (degrés ; carte : face 's' | 'e' | 'n' | 'o'), base (hauteur du
// porteur), floor }. → { id, type, variante, triangles, compte, hauteur, emprise, rects, collision, base, lueur (triangles lumineux) }.
export function objet(type, variante, spec = {}) {
  const cat = CATALOGUE[type];
  if (!cat) return null;
  const v = cat.variantes.includes(variante) ? variante : cat.defaut;
  const base = cat.pose === 'meuble' ? Math.max(0, num(spec.base)) : 0;
  const k = cat.pose === 'remplace' ? 1 : taille(spec.taille);
  const res = construire(type, v, { base, k, spec });
  const a = (type === 'carte' ? (FACES[spec.face] ?? 0) : num(spec.cap)) * DEG;
  const x = num(spec.x);
  const y = num(spec.y);
  // Taille (retour du propriétaire : objets × 2) : homothétie du modèle ; les ampoules pendent toujours du plafond (70), les cartes restent centrées
  // à mi-hauteur du mur (34) ; les objets posés grandissent depuis leur support.
  const ancre = cat.pose === 'plafond' ? HAUTEUR_MAX : cat.pose === 'mur' ? 34 : 0;
  const move = (p0) => {
    const q = rotY([p0[0] * k, ancre + (p0[1] - ancre) * k, p0[2] * k], a);
    return [r3(q[0] + x), r3(q[1] + base), r3(q[2] + y)];
  };
  const tris = trianguler(res.modele).map((t) => ({ ...t, p: t.p.map(move), n: rotY(t.n, a).map((c) => Math.round(c * 10000) / 10000) }));
  const id = typeof spec.id === 'string' ? spec.id : type;
  const rects = cat.collision.map((g) => {
    const sel = tris.filter((t) => t.group === g);
    const r = rectDe(sel);
    if (!r) return null;
    const hauteur = Math.ceil(bornes(sel).y1);
    return { id: `${id}-${g}`, ...r, hauteur, tirs: hauteur < HAUTEUR_ARME ? 'passent' : 'arretes' };
  }).filter(Boolean);
  const b = tris.length ? bornes(tris) : null;
  return {
    id, type, variante: v, floor: spec.floor === 'etage' ? 'etage' : 'rdc', base, triangles: tris, compte: tris.length, hauteur: b ? Math.ceil(b.y1) : 0,
    emprise: rectDe(tris), rects, collision: rects.length > 0, lueur: tris.filter((t) => t.lueur).length,
  };
}

// Objets du plan (data/game/maps/<carte>/interieur-epoque.json → objets) avec les variantes choisies ; « sur » : meuble porteur (id d'obstacle de la couche
// de l'étage, sa hauteur devient la base) ; obstacles : { rdc: [...], etage: [...] }. Objets non gardés : absents.
export function objetsPlaces(doc, { choix, obstacles = {} } = {}) {
  const ch = choix ?? lireChoix(null);
  const out = [];
  for (const it of Array.isArray(doc?.objets) ? doc.objets : []) {
    if (!it || !CATALOGUE[it.type] || ch.gardes[it.type] === false) continue;
    if (CATALOGUE[it.type].pose !== 'remplace' && (!isNum(it.x) || !isNum(it.y))) continue;
    const floor = it.floor === 'etage' ? 'etage' : 'rdc';
    const porteur = it.sur ? (obstacles[floor] ?? []).find((o) => o.id === it.sur) ?? null : null;
    if (CATALOGUE[it.type].pose === 'remplace') {
      // Table : à la place exacte du meuble (centre, emprise, hauteur) ; sans meuble connu, rien.
      const o = (obstacles[floor] ?? []).find((q) => q.id === it.remplace);
      if (!o) continue;
      const spec = { id: String(it.id ?? it.type), x: o.x + o.w / 2, y: o.y + o.h / 2, w: o.w, l: o.h, hauteur: num(o.hauteur, 40), floor, remplace: o.id };
      const v = CATALOGUE[it.type].variantes.includes(it.variante) ? it.variante : ch.variantes[it.type];
      out.push({ ...objet(it.type, v, spec), spec, sur: null, porteur: null, remplace: o.id });
      continue;
    }
    const spec = { id: String(it.id ?? it.type), x: it.x, y: it.y, cap: num(it.cap), ...(typeof it.face === 'string' ? { face: it.face } : {}), floor, base: porteur ? num(porteur.hauteur) : 0, taille: ch.taille ?? TAILLE_DEFAUT };
    const v = CATALOGUE[it.type].variantes.includes(it.variante) ? it.variante : ch.variantes[it.type];
    out.push({ ...objet(it.type, v, spec), spec, sur: it.sur ?? null, porteur });
  }
  return out;
}

// Contrôles du placement (liste de textes, vide si tout va bien). couches : { rdc: { contour, obstacles, windows, openings, lamps, stairs }, etage: … } ;
// regles : { fenetre 150, porte 100 (règle des pièces de l'étage), escalier 40, lampe 40, interstice 50, mur 3 } ; murs pleins (coins compris) : contact ou 50.
export function problemesPlacement(objets, couches = {}, regles = {}) {
  const r = { fenetre: 150, porte: 100, escalier: 40, lampe: 40, interstice: 50, mur: 3, ...regles };
  const out = [];
  const pt = (p) => ({ x: p.x, y: p.y, w: 0.01, h: 0.01 });
  for (const o of objets) {
    const c = couches[o.floor] ?? {};
    const zone = o.emprise;
    if (!zone) continue;
    const cat = CATALOGUE[o.type];
    if (cat.pose === 'remplace') continue; // table dessinée à la place d'un meuble : rien ne change (collision, tirs, place)
    if (o.hauteur > HAUTEUR_MAX + 0.5) out.push(`${o.id} dépasse ${HAUTEUR_MAX} (${o.hauteur})`);
    // Dans la pièce : les quatre coins de l'emprise dans le contour (les cartes : leur point du mur, dans le contour à 25 près).
    const contour = Array.isArray(c.contour) ? c.contour : [];
    const dedans = (x, y) => contour.length < 3 || pointInPolygon(x, y, contour);
    const coins = cat.pose === 'mur' ? [[o.spec.x, o.spec.y]] : [[zone.x, zone.y], [zone.x + zone.w, zone.y], [zone.x, zone.y + zone.h], [zone.x + zone.w, zone.y + zone.h]];
    if (!coins.every(([x, y]) => dedans(x, y))) out.push(`${o.id} sort du bâtiment`);
    const proche = (liste, d, quoi) => {
      for (const q of liste ?? []) if (rectGap(zone, q.w !== undefined ? q : pt(q)) < d) out.push(`${o.id} trop près ${quoi} ${q.id ?? ''}`.trim());
    };
    proche(c.windows, r.fenetre, 'de la fenêtre');
    proche(c.openings, r.porte, 'de la porte');
    proche(c.lamps, r.lampe, 'de la lampe');
    if (cat.pose !== 'mur' && cat.pose !== 'plafond') proche(c.stairs, r.escalier, "de l'escalier");
    if (cat.pose === 'meuble') {
      const p = o.porteur;
      if (!p) out.push(`${o.id} : meuble porteur absent (${o.sur ?? '—'})`);
      else if (!(zone.x >= p.x - 0.5 && zone.y >= p.y - 0.5 && zone.x + zone.w <= p.x + p.w + 0.5 && zone.y + zone.h <= p.y + p.h + 0.5)) out.push(`${o.id} déborde de ${p.id}`);
    }
    if (cat.pose === 'mur') {
      const d = Math.min(...(c.wallFaces ?? []).map((f) => rectGap(zone, f)));
      if (!(d <= r.mur)) out.push(`${o.id} n'est pas contre un mur`);
    }
    // Objets solides : ni dans un meuble ni dans un mur ; écart à chaque meuble ou mur nul (contact) ou d'au moins 50 (pas de passage étroit).
    // Un écart comblé par un troisième solide qui touche les deux (brancard entre un meuble et la caisse médicale) n'est pas un passage.
    const autres = objets.filter((o2) => o2 !== o && o2.floor === o.floor).flatMap((o2) => o2.rects.map((q2) => ({ ...q2, objet: o2 })));
    const solides = [...(c.obstacles ?? []), ...(c.wallFaces ?? []), ...(c.murs ?? [])];
    for (const q of o.rects) {
      const comble = (s) => [...solides, ...autres].some((t) => t !== s && t.id !== q.id && rectGap(t, q) <= 1 && rectGap(t, s) <= 1);
      const recouvre = (s) => Math.min(q.x + q.w, s.x + s.w) - Math.max(q.x, s.x) > 0.01 && Math.min(q.y + q.h, s.y + s.h) - Math.max(q.y, s.y) > 0.01;
      for (const s of [...solides, ...autres]) if (recouvre(s)) out.push(`${o.id} recouvre ${s.objet?.id ?? s.id ?? 'un mur'}`);
      for (const s of solides) {
        const g = rectGap(q, s);
        if (g < -0.01 || (g > 1 && g < r.interstice && !comble(s))) out.push(`${o.id} : interstice de ${Math.round(g)} avec ${s.id ?? 'un mur'}`);
      }
      for (const q2 of autres) {
        const g = rectGap(q, q2);
        if (o.id < q2.objet.id && (g < -0.01 || (g > 1 && g < r.interstice && !comble(q2)))) out.push(`${o.id} : interstice de ${Math.round(g)} avec ${q2.objet.id}`);
      }
    }
  }
  return [...new Set(out)];
}

// Faces intérieures des murs d'une couche (rectangles minces le long du contour, à 20 de la ligne du contour vers l'intérieur) : cartes et interstices.
export function facesMurs(contour, epaisseur = 40) {
  const pts = Array.isArray(contour) ? contour : [];
  const e = epaisseur / 2;
  const out = [];
  let aire = 0;
  for (let i = 0; i < pts.length; i += 1) aire += pts[i][0] * pts[(i + 1) % pts.length][1] - pts[(i + 1) % pts.length][0] * pts[i][1];
  const sens = aire > 0 ? -1 : 1; // intérieur à droite (sens horaire à l'écran) ou à gauche
  for (let i = 0; i < pts.length; i += 1) {
    const [x1, y1] = pts[i];
    const [x2, y2] = pts[(i + 1) % pts.length];
    const nx = (-(y2 - y1) / (Math.hypot(x2 - x1, y2 - y1) || 1)) * -sens;
    const ny = ((x2 - x1) / (Math.hypot(x2 - x1, y2 - y1) || 1)) * -sens;
    const ax = x1 + nx * e;
    const ay = y1 + ny * e;
    const bx = x2 + nx * e;
    const by = y2 + ny * e;
    out.push({ id: `mur-${i + 1}`, x: Math.min(ax, bx) - (nx > 0 ? 1 : 0), y: Math.min(ay, by) - (ny > 0 ? 1 : 0), w: Math.max(1, Math.abs(bx - ax)), h: Math.max(1, Math.abs(by - ay)) });
  }
  return out;
}

// Chemins des zombies dans le bâtiment : pour chaque fenêtre de la couche, champ de flux depuis son point intérieur (à 60 du mur) sur la grille du jeu
// (nav.json : cellule, rayon du zombie, marge), avant (obstacles du jeu) et après (avec les rectangles solides ajoutés) ; échantillons : toutes les
// cellules libres du contour. → [{ fenetre, coupees (cellules atteintes avant, plus après, hors emprises ajoutées), allongementMax, allongementMoyen }].
export function cheminsInterieurs({ size, contour, solides = [], ajoutes = [], windows = [], grille = {} } = {}) {
  const opts = { cell: num(grille.cell, 20), radius: num(grille.radius, 20), inflate: num(grille.inflate, 4) };
  const gA = createGrid(size, solides, opts);
  const gB = createGrid(size, [...solides, ...ajoutes], opts);
  const cellules = [];
  for (let row = 0; row < gA.rows; row += 1) for (let col = 0; col < gA.cols; col += 1) {
    const i = row * gA.cols + col;
    const cx = (col + 0.5) * gA.cell;
    const cy = (row + 0.5) * gA.cell;
    if (!gA.blocked[i] && !gB.blocked[i] && pointInPolygon(cx, cy, contour)) cellules.push(i);
  }
  const k = gA.cell / 10;
  return windows.map((w) => {
    const n = w.normal ?? { x: 0, y: 0 };
    const cible = { x: w.x - num(n.x) * 60, y: w.y - num(n.y) * 60 };
    const fa = buildFlow(gA, cible);
    const fb = buildFlow(gB, cible);
    let coupees = 0;
    let max = 0;
    let somme = 0;
    let nb = 0;
    for (const i of cellules) {
      const a = fa.dist[i];
      const b = fb.dist[i];
      if (a === INF) continue;
      if (b === INF) {
        coupees += 1;
        continue;
      }
      const d = (b - a) * k;
      max = Math.max(max, d);
      somme += d;
      nb += 1;
    }
    return { fenetre: w.id, cellules: nb, coupees, allongementMax: Math.round(max), allongementMoyen: nb ? Math.round((somme / nb) * 100) / 100 : 0 };
  });
}

// Normale extérieure d'une fenêtre (côté du mur).
export const NORMALES = Object.freeze({ nord: { x: 0, y: -1 }, sud: { x: 0, y: 1 }, est: { x: 1, y: 0 }, ouest: { x: -1, y: 0 } });

// Couche de contrôle d'un étage d'après son monde (world.json ou etage.world.json), ses lampes et les zones (escaliers, portes) :
// { contour, obstacles (meubles, piliers, escaliers), windows (avec normale), openings, lamps, stairs, wallFaces }.
export function coucheDe(world, { lamps = [], floor = 'rdc' } = {}) {
  // Obstacles d'avant le lot : ceux de kind « epoque » (écrits par npm run carte d'après ce plan) sont ceux du plan lui-même.
  const obstacles = (world?.obstacles ?? []).filter((o) => o.kind !== 'epoque').map((o) => ({ id: o.id, x: o.x, y: o.y, w: o.w, h: o.h, hauteur: o.hauteur, kind: o.kind }));
  return {
    floor,
    size: world?.size,
    contour: world?.contour ?? [],
    obstacles,
    windows: (world?.windows ?? []).map((w) => ({ id: w.id, x: w.x, y: w.y, normal: NORMALES[w.side] ?? { x: 0, y: 0 } })),
    openings: (world?.openings ?? []).map((o) => ({ id: o.id, x: Math.min(o.x1, o.x2), y: Math.min(o.y1, o.y2), w: Math.max(1, Math.abs(o.x2 - o.x1)), h: Math.max(1, Math.abs(o.y2 - o.y1)) })),
    lamps: lamps.filter((l) => (l.floor ?? 'rdc') === floor).map((l) => ({ id: l.id, x: l.x, y: l.y })),
    stairs: obstacles.filter((o) => o.kind === 'escalier'),
    murs: mursPleins(world),
    wallFaces: [...facesMurs(world?.contour, num(world?.wallThickness, 40)), ...(world?.walls ?? []).filter((w) => String(w.id).startsWith('mur-interieur')).map((w) => ({ id: w.id, x: Math.min(w.x1, w.x2) - 20, y: Math.min(w.y1, w.y2) - 20, w: Math.abs(w.x2 - w.x1) + 40, h: Math.abs(w.y2 - w.y1) + 40 }))],
  };
}

// Murs d'une couche en rectangles pleins (épaisseur du monde, fenêtres et ouvertures comprises : les zombies entrent par le point intérieur).
function mursPleins(world) {
  const e = num(world?.wallThickness, 40) / 2;
  return (world?.walls ?? []).map((w) => ({ id: w.id, x: Math.min(w.x1, w.x2) - e, y: Math.min(w.y1, w.y2) - e, w: Math.abs(w.x2 - w.x1) + 2 * e, h: Math.abs(w.y2 - w.y1) + 2 * e }));
}

// Budget : triangles et lueurs par étage et par type. → { total, parEtage: { rdc, etage }, parType, lueur }.
export function budgetPlan(objets) {
  const parType = {};
  const parEtage = { rdc: 0, etage: 0 };
  for (const o of objets) {
    parType[o.type] = (parType[o.type] ?? 0) + o.compte;
    parEtage[o.floor] += o.compte;
  }
  return { total: parEtage.rdc + parEtage.etage, parEtage, parType, lueur: objets.reduce((s, o) => s + o.lueur, 0) };
}

// Contrôle complet du plan (atelier, tests, puis npm run carte après le GO) : objets avec les variantes choisies, problèmes de placement (et, si
// toutesVariantes, ceux de chaque variante de chaque type), chemins des zombies par étage, budget.
// entree : { mondes: { rdc: world.json, etage: etage.world.json }, lampes (lampes.world.json → lampes), doc (interieur-epoque.json de la carte),
// choixJson, navCfg (nav.json), rayon (zombie), toutesVariantes }.
export function controlePlan({ mondes = {}, lampes = [], doc, choixJson = null, navCfg = null, rayon = 20, toutesVariantes = true } = {}) {
  const couches = {};
  for (const floor of ['rdc', 'etage']) if (mondes[floor]) couches[floor] = coucheDe(mondes[floor], { lamps: lampes, floor });
  const obstacles = Object.fromEntries(Object.entries(couches).map(([f, c]) => [f, c.obstacles]));
  const choix = lireChoix(choixJson);
  const verifier = (ch) => {
    const objets = objetsPlaces(doc, { choix: ch, obstacles });
    return { objets, problemes: problemesPlacement(objets, couches) };
  };
  const res = verifier(choix);
  const problemes = [...res.problemes];
  if (toutesVariantes) for (const type of TYPES) for (const v of CATALOGUE[type].variantes) {
    if (v === choix.variantes[type]) continue;
    for (const pb of verifier({ ...choix, variantes: { ...choix.variantes, [type]: v } }).problemes) problemes.push(`variante ${type}/${v} : ${pb}`);
  }
  const chemins = {};
  for (const [floor, c] of Object.entries(couches)) {
    const monde = mondes[floor];
    const solides = [...c.obstacles, ...mursPleins(monde)];
    const ajoutes = res.objets.filter((o) => o.floor === floor).flatMap((o) => o.rects);
    chemins[floor] = cheminsInterieurs({ size: monde.size, contour: c.contour, solides, ajoutes, windows: c.windows, grille: { ...(navCfg ?? {}), radius: rayon } });
    for (const ch of chemins[floor]) if (ch.coupees > 0) problemes.push(`chemin coupé : ${ch.coupees} cellule(s) depuis ${ch.fenetre}`);
  }
  return { couches, objets: res.objets, problemes: [...new Set(problemes)], chemins, budget: budgetPlan(res.objets), choix };
}

// Lot 9i-C : section « interieur » de decor.json (npm run carte, jamais éditée à la main) : taille, couleurs (mélanges de jetons), objets retenus (type,
// variante, étage, spec, rectangles solides, hauteur, triangles). ctl : sortie de controlePlan.
export function sectionInterieur(ctl, { couleurs = {} } = {}) {
  const objets = ctl.objets.map((o) => ({
    id: o.id, type: o.type, variante: o.variante, floor: o.floor, spec: { ...o.spec }, ...(o.sur ? { sur: o.sur } : {}), ...(o.remplace ? { remplace: o.remplace } : {}),
    hauteur: o.hauteur, emprise: { ...o.emprise }, collision: o.collision, triangles: o.compte, rects: o.rects.map((r) => ({ ...r })),
  }));
  return { taille: ctl.choix?.taille ?? TAILLE_DEFAUT, couleurs: JSON.parse(JSON.stringify(couleurs)), objets, triangles: objets.reduce((s, o) => s + o.triangles, 0) };
}

// Obstacles du monde d'un étage pour les objets solides de la section (kind « epoque » : bloquent le joueur et les zombies ; les tirs suivent
// tirs-traversables.json) ; mêmes rectangles que le dessin.
export function obstaclesInterieur(section, floor) {
  return (Array.isArray(section?.objets) ? section.objets : []).filter((o) => o?.floor === floor).flatMap((o) => (o.rects ?? []).map((r) => ({ id: r.id, x: r.x, y: r.y, w: r.w, h: r.h, hauteur: r.hauteur, kind: 'epoque' })));
}

// Objets de la section reconstruits (triangles compris) pour le dessin ; mêmes rectangles que ceux écrits par npm run carte (objet() est déterministe).
export function objetsDeSection(section) {
  return (Array.isArray(section?.objets) ? section.objets : []).filter((o) => o && CATALOGUE[o.type]).map((o) => ({ ...objet(o.type, o.variante, { ...o.spec, id: o.id }), spec: o.spec }));
}
