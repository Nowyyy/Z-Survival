// Lot 9c — Atlas commun des armes (256 × 256, 16 tuiles de 64 px), généré en code : fonctions pures et déterministes, aucune image.
// Les couleurs arrivent en argument (palette : nom du jeton sans « --arm- » → [r, g, b], lue dans css/armes.css par le rendu).
// Le grain (bois, métal brossé) suit l'axe u, qui suit la longueur de chaque pièce (js/core/armes/geometrie.js) ; les bords de tuile
// correspondent aux arêtes des pièces : l'usure s'y concentre.

export const TAILLE = 256;
export const TUILE = 64;
export const TUILES = Object.freeze(['bruni', 'bruni-use', 'phosphate', 'phosphate-use', 'noyer', 'hetre', 'bakelite', 'cuir',
  'toile', 'laiton', 'olive', 'olive-ecaille', 'feldgrau', 'sable', 'perfore', 'caoutchouc']);
// Jetons lus par le rendu (css/armes.css : --arm-<nom>).
export const JETONS = Object.freeze(['bruni', 'bruni-reflet', 'acier-nu', 'phosphate', 'phosphate-clair', 'noyer', 'noyer-veine', 'hetre', 'hetre-veine',
  'bakelite', 'bakelite-veine', 'cuir', 'cuir-sombre', 'toile', 'toile-trame', 'laiton', 'laiton-sombre', 'olive', 'olive-sombre', 'rouille',
  'feldgrau', 'feldgrau-sombre', 'sable', 'sable-sombre', 'trou', 'caoutchouc', 'caoutchouc-reflet']);
const MARGE = 2; // pixels laissés au bord de chaque tuile (filtrage)

// Rectangle [u0, v0, u1, v1] d'une tuile (nom inconnu : première tuile).
export function rectTuile(nom) {
  const i = Math.max(0, TUILES.indexOf(nom));
  const col = i % 4;
  const row = Math.floor(i / 4);
  return [(col * TUILE + MARGE) / TAILLE, (row * TUILE + MARGE) / TAILLE, ((col + 1) * TUILE - MARGE) / TAILLE, ((row + 1) * TUILE - MARGE) / TAILLE];
}

// Hachage entier → [0, 1[ ; bruit de valeur lissé et périodique sur la tuile.
export function hash(x, y, s = 0) {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(s | 0, 2246822519);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
const lisse = (t) => t * t * (3 - 2 * t);
function bruit(x, y, px, py, s) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const fx = lisse(x - xi);
  const fy = lisse(y - yi);
  const m = (a, p) => ((a % p) + p) % p;
  const v = (i, j) => hash(m(xi + i, px), m(yi + j, py), s);
  return (v(0, 0) * (1 - fx) + v(1, 0) * fx) * (1 - fy) + (v(0, 1) * (1 - fx) + v(1, 1) * fx) * fy;
}
// Bruit fractal périodique sur une tuile de 64 px (cellules de c pixels en x, d en y).
function fbm(x, y, c, d, s, oct = 3) {
  let a = 0.5;
  let t = 0;
  let w = 0;
  for (let o = 0; o < oct; o += 1) {
    const k = 2 ** o;
    t += a * bruit((x * k) / c, (y * k) / d, Math.max(1, Math.round((TUILE * k) / c)), Math.max(1, Math.round((TUILE * k) / d)), s + o * 31);
    w += a;
    a *= 0.5;
  }
  return t / w;
}
const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const mulc = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const clamp01 = (t) => Math.max(0, Math.min(1, t));
// Distance au bord de la tuile (0 au bord, 1 au centre) : les arêtes des pièces.
const bord = (x, y) => Math.min(x, y, TUILE - 1 - x, TUILE - 1 - y) / (TUILE / 2);

const GRIS = [128, 128, 128];
const col = (p, nom) => (Array.isArray(p?.[nom]) && p[nom].length >= 3 ? p[nom] : GRIS);

// Un pixel (x, y) de la tuile `nom` (0 à 63 chacun) → [r, g, b].
function pixel(nom, x, y, p) {
  switch (nom) {
    case 'bruni':
    case 'bruni-use':
    case 'phosphate':
    case 'phosphate-use': {
      const phos = nom.startsWith('phosphate');
      const base = col(p, phos ? 'phosphate' : 'bruni');
      const reflet = col(p, phos ? 'phosphate-clair' : 'bruni-reflet');
      const brosse = fbm(x, y, 40, 2, phos ? 7 : 3);
      const grain = phos ? hash(x, y, 9) * 0.35 : 0;
      let c = mix(base, reflet, clamp01(brosse * 0.7 + grain - 0.15 + 0.25 * Math.exp(-(((y - 22) / 7) ** 2))));
      if (nom.endsWith('-use')) {
        const e = bord(x, y);
        const u = fbm(x, y, 9, 5, 11);
        const nu = clamp01((0.22 - e) * 5 + (u - 0.62) * 2);
        c = mix(c, col(p, 'acier-nu'), nu * 0.65);
      }
      return c;
    }
    case 'noyer':
    case 'hetre': {
      const base = col(p, nom);
      const veine = col(p, `${nom}-veine`);
      const d = fbm(x, y, 32, 16, nom === 'noyer' ? 5 : 6) * 7;
      const g = 0.5 + 0.5 * Math.sin(y * 0.9 + d * 2.2);
      const noeud = fbm(x, y, 16, 16, 21);
      return mix(base, veine, clamp01(g ** 3 * 0.75 + (noeud > 0.72 ? 0.35 : 0) + hash(x, y, 4) * 0.08));
    }
    case 'bakelite': {
      const t = fbm(x, y, 12, 12, 13);
      let c = mix(col(p, 'bakelite'), col(p, 'bakelite-veine'), clamp01(t * 1.3 - 0.2));
      if (((x + y) % 6 === 0) || (((x - y) % 6) + 6) % 6 === 0) c = mulc(c, 0.72); // quadrillage
      return c;
    }
    case 'cuir': {
      const t = fbm(x, y, 10, 10, 15);
      const e = bord(x, y);
      return mix(col(p, 'cuir'), col(p, 'cuir-sombre'), clamp01(t * 0.6 + (e < 0.12 ? 0.4 : 0)));
    }
    case 'toile': {
      const t = (x + (y % 2)) % 2 ? 0.25 : 0;
      return mix(col(p, 'toile'), col(p, 'toile-trame'), clamp01(t + fbm(x, y, 16, 16, 17) * 0.4));
    }
    case 'laiton': {
      const sep = x % 8 < 1 ? 0.75 : 0; // séparation des cartouches le long de la bande
      const reflet = Math.exp(-(((y - 24) / 9) ** 2));
      return mix(mix(col(p, 'laiton-sombre'), col(p, 'laiton'), clamp01(0.45 + reflet * 0.6 + hash(x, y, 2) * 0.1)), col(p, 'laiton-sombre'), sep);
    }
    case 'olive':
    case 'olive-ecaille':
    case 'feldgrau':
    case 'sable': {
      const peinte = nom === 'olive-ecaille' ? 'olive' : nom;
      const sombre = col(p, `${peinte}-sombre`);
      let c = mix(col(p, peinte), sombre, clamp01(fbm(x, y, 24, 8, 19) * 0.55 + hash(x, y, 3) * 0.12 - 0.05));
      if (nom === 'olive-ecaille') {
        const e = bord(x, y);
        const u = fbm(x, y, 7, 7, 23);
        const eclat = clamp01((u - 0.62 + (0.3 - e) * 0.8) * 6);
        c = mix(c, hash(x >> 2, y >> 2, 5) > 0.5 ? col(p, 'acier-nu') : col(p, 'rouille'), eclat);
      }
      return c;
    }
    case 'perfore': {
      const base = mix(col(p, 'bruni'), col(p, 'bruni-reflet'), fbm(x, y, 40, 2, 3) * 0.6);
      const cx = (x % 8) - 3.5;
      const cy = (y % 8) - 3.5;
      return cx * cx + cy * cy < 7.5 ? col(p, 'trou') : base;
    }
    case 'caoutchouc': {
      const nervure = 0.5 + 0.5 * Math.sin((x * Math.PI) / 3);
      return mix(col(p, 'caoutchouc'), col(p, 'caoutchouc-reflet'), clamp01(nervure * 0.35 + hash(x, y, 8) * 0.1));
    }
    default:
      return GRIS;
  }
}

// Atlas complet : { width, height, data (Uint8Array RGBA), octets }. Déterministe.
export function genererAtlas(palette) {
  const data = new Uint8Array(TAILLE * TAILLE * 4);
  TUILES.forEach((nom, i) => {
    const ox = (i % 4) * TUILE;
    const oy = Math.floor(i / 4) * TUILE;
    for (let y = 0; y < TUILE; y += 1) {
      for (let x = 0; x < TUILE; x += 1) {
        const c = pixel(nom, x, y, palette);
        const k = ((oy + y) * TAILLE + ox + x) * 4;
        data[k] = Math.max(0, Math.min(255, Math.round(c[0])));
        data[k + 1] = Math.max(0, Math.min(255, Math.round(c[1])));
        data[k + 2] = Math.max(0, Math.min(255, Math.round(c[2])));
        data[k + 3] = 255;
      }
    }
  });
  return { width: TAILLE, height: TAILLE, data, octets: data.length };
}

// Couleur moyenne d'une tuile (visuels 2D et contrôles de contraste).
export function moyenneTuile(atlas, nom) {
  const i = Math.max(0, TUILES.indexOf(nom));
  const ox = (i % 4) * TUILE;
  const oy = Math.floor(i / 4) * TUILE;
  const s = [0, 0, 0];
  for (let y = 0; y < TUILE; y += 1) for (let x = 0; x < TUILE; x += 1) for (let c = 0; c < 3; c += 1) s[c] += atlas.data[((oy + y) * TAILLE + ox + x) * 4 + c];
  return s.map((v) => Math.round(v / (TUILE * TUILE)));
}
