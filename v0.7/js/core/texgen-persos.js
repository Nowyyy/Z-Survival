// Textures des personnages du lot 3j, générées en code (aucune image) : un atlas de détail par type (tissu, jean, peau, cuir, métal,
// toile, plastique, lampe, sombre) en gris neutre, multiplié dans le jeu par la couleur des sommets (palette de la variante, tenue, usure).
// Atlas des zombies : 2 × 2 tuiles (paliers de blessure 0 à 3 : propre, touché, ensanglanté, ensanglanté fort), taches de sang aux couleurs
// des jetons --sang-* ; joueur : une seule tuile. Pur et déterministe (graine) ; lookup : jeton -> [r, g, b].
import { isNum } from './vec.js';

export const REGION_KINDS = ['tissu', 'denim', 'peau', 'cuir', 'metal', 'toile', 'plastique', 'lampe', 'sombre'];
// Clé de palette d'une pièce -> type de région.
export const PALETTE_REGION = { peau: 'peau', tenue: 'tissu', pantalon: 'denim', botte: 'cuir', accent: 'tissu', sombre: 'sombre', metal: 'metal', cuir: 'cuir', sac: 'toile', casque: 'plastique', lampe: 'lampe', yeux: 'lampe' };
const GRID = 4; // régions par côté d'une tuile
const num = (v, d = 0) => (isNum(v) ? v : d);

// Bruit de valeur à graine (hachage entier), de 0 à 1.
function hash(x, y, seed) {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(seed | 0, 2147483647);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function noise(x, y, seed) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const sx = smooth(x - xi);
  const sy = smooth(y - yi);
  const a = hash(xi, yi, seed);
  const b = hash(xi + 1, yi, seed);
  const c = hash(xi, yi + 1, seed);
  const d = hash(xi + 1, yi + 1, seed);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}
function smooth(t) {
  return t * t * (3 - 2 * t);
}

// Facteur de détail (0 à 1) d'un pixel (u, v de 0 à 1 dans la région) selon le type de région.
function detail(kind, u, v, seed) {
  const n = noise(u * 8, v * 8, seed);
  const f = noise(u * 24, v * 24, seed + 7);
  switch (kind) {
    case 'tissu': return 0.9 + 0.03 * Math.sin((u + v) * 60) + 0.07 * n - 0.03 * f;
    case 'denim': return 0.88 + 0.04 * Math.sin((u - v) * 80) + 0.07 * n;
    case 'peau': return 0.91 + 0.07 * n - 0.05 * Math.max(0, f - 0.7) * 3;
    case 'cuir': return 0.86 + 0.09 * n + 0.03 * f;
    case 'metal': return 0.9 + 0.06 * Math.sin(v * 40) + 0.04 * n;
    case 'toile': return 0.89 + 0.04 * Math.sin(u * 70) * Math.sin(v * 70) + 0.07 * n;
    case 'plastique': return 0.94 + 0.04 * n;
    case 'lampe': return 1;
    default: return 0.9 + 0.06 * n;
  }
}

// Spécification : { size (256 zombies, 128 joueur), tiles (2 : quatre paliers ; 1 : une tuile), seed, blood: [frais, sec] (couleurs),
// coverage: [0, c1, c2, c3] (part de la surface tachée par palier) }.
export function persoSpec({ size = 256, tiles = 2, seed = 1, blood = null, coverage = [0, 0.12, 0.28, 0.45] } = {}) {
  const s = [64, 128, 256, 512].includes(size) ? size : 256;
  return { size: s, tiles: tiles === 1 ? 1 : 2, seed: Math.trunc(num(seed, 1)), blood: Array.isArray(blood) ? blood : null, coverage: Array.isArray(coverage) ? coverage.map((c) => Math.min(1, Math.max(0, num(c)))) : [0, 0, 0, 0] };
}

// Rectangle UV (0 à 1) d'une région dans la tuile 0 (les autres tuiles s'obtiennent par décalage de texture), rentré d'un texel.
export function persoRegionRect(spec, kind) {
  const i = Math.max(0, REGION_KINDS.indexOf(kind));
  const tile = spec.size / spec.tiles;
  const cell = tile / GRID;
  const x = (i % GRID) * cell;
  const y = Math.floor(i / GRID) * cell;
  const inset = 1.5 / spec.size;
  return { u0: x / spec.size + inset, v0: y / spec.size + inset, u1: (x + cell) / spec.size - inset, v1: (y + cell) / spec.size - inset };
}

// Pixels RGBA (Uint8ClampedArray, ligne 0 = v 0). Renvoie { width, height, data, bytes (mémoire GPU estimée avec mipmaps) }.
export function createPersoTexture(spec) {
  const sp = spec && isNum(spec.size) ? spec : persoSpec();
  const size = sp.size;
  const data = new Uint8ClampedArray(size * size * 4);
  const tile = size / sp.tiles;
  const cell = tile / GRID;
  // Le détail ne dépend que de la position dans la tuile : calculé une fois et repris par les quatre tuiles (seul le sang diffère).
  const detailOf = new Float64Array(tile * tile).fill(-1);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const tx = Math.floor(x / tile);
      const ty = Math.floor(y / tile);
      const tier = sp.tiles === 1 ? 0 : tx + ty * 2;
      const lx = x - tx * tile;
      const ly = y - ty * tile;
      const ri = Math.floor(lx / cell) + Math.floor(ly / cell) * GRID;
      const kind = REGION_KINDS[ri] ?? 'sombre';
      const u = (lx % cell) / cell;
      const v = (ly % cell) / cell;
      const di = ly * tile + lx;
      if (detailOf[di] < 0) detailOf[di] = Math.min(1, Math.max(0, detail(kind, u, v, sp.seed + ri * 31)));
      const g = detailOf[di];
      const i = (y * size + x) * 4;
      data[i] = g * 255;
      data[i + 1] = g * 255;
      data[i + 2] = g * 255;
      data[i + 3] = 255;
      const cover = sp.coverage[tier] ?? 0;
      if (cover > 0 && sp.blood && kind !== 'lampe' && kind !== 'metal') {
        const b = noise(u * 5 + tier * 3.1, v * 5, sp.seed + 99 + ri);
        if (b < cover) {
          // Calcul par canal sans tableau intermédiaire (même arithmétique, même ordre : pixels identiques).
          const fresh = sp.blood[0] ?? [122, 10, 10];
          const dry = sp.blood[1] ?? fresh;
          const k = Math.min(1, (cover - b) / Math.max(1e-6, cover) * 2);
          for (let ch = 0; ch < 3; ch += 1) data[i + ch] = (fresh[ch] + (dry[ch] - fresh[ch]) * (1 - k)) * (0.7 + 0.3 * g) * 1.6;
        }
      }
    }
  }
  return { width: size, height: size, data, bytes: Math.round((size * size * 4 * 4) / 3) };
}

// Facteur moyen (0 à 1) d'une région dans la tuile 0 (couleur vue = palette × facteur).
export function regionFactor(tex, spec, kind) {
  const r = persoRegionRect(spec, kind);
  const x0 = Math.ceil(r.u0 * spec.size);
  const x1 = Math.floor(r.u1 * spec.size);
  const y0 = Math.ceil(r.v0 * spec.size);
  const y1 = Math.floor(r.v1 * spec.size);
  let sum = 0;
  let k = 0;
  for (let y = y0; y < y1; y += 1) {
    for (let x = x0; x < x1; x += 1) {
      sum += tex.data[(y * spec.size + x) * 4];
      k += 1;
    }
  }
  return k ? sum / k / 255 : 1;
}
