// Lot 9h : décor extérieur d'époque (1942) — atelier et plan de placement (rien n'est branché sur la partie avant le « GO 9h » du propriétaire).
// Pur : ni Three.js, ni DOM, ni hasard du navigateur, ni horloge ; mêmes entrées, même sortie. Docs/ref/decor-epoque.md.
// - Modèles : chaque objet (véhicules, avion, parachute, barbelés, hérissons, jerrycans, caisses, trous d'obus, poteaux, panneaux, artillerie) est une liste
//   de pièces convexes (boîtes, troncs, cylindres) ou de plaques, transformées, coupées au plan du sol puis triangulées (comme js/core/epaves.js).
//   Chaque triangle porte sa matière (région de l'atlas d'époque + teinte), son groupe (collision) et ses coordonnées de texture.
// - Atlas d'époque : une texture générée de 256 px (tôle, toile, acier, bois de caisse au pochoir, panneau fléché, étoile, pneu, bois, verre, numéros,
//   soie, suie), couleurs passées en argument (jetons --game-* mélangés, data/game/decor-epoque.json) ; aucune image.
// - Placement : objets de data/game/maps/<carte>/decor-epoque.json (unités du jeu), remplacements (voitures, voiture en flammes, hélicoptère, poteaux
//   électriques), rectangles de collision (tout le rectangle dessiné de chaque groupe solide), tirs (dessiné sous l'arme, 43 : traversable).
// - Contrôles : couloirs d'approche, points d'apparition, bâtiment, fenêtres ; chemins des zombies de chaque point d'apparition à sa fenêtre (nav.js).
// Repère du modèle : x vers l'avant, y vers le haut, z à droite ; dans le monde, x du jeu -> X, y du jeu -> Z, hauteur Y ; cap 0 = est, 90 = sud.
import { rectGap } from './collision.js';
import { generateLivelyDecor } from './decor-vivant.js';
import { buildLayout } from './layout.js';
import { buildFlow, createGrid, flowPath, pathLength } from './nav.js';
import { isNum, num } from './vec.js';

const DEG = Math.PI / 180;
export const ECHELLE = 28; // unités du jeu par mètre (35 × 0,8, comme les armes)
export const HAUTEUR_ARME = 43; // render.json → gunHeight : ce qui est dessiné plus bas laisse passer balles, laser et cône (règle du lot 8j)
export const PLAFONDS = Object.freeze({ vehicule: 55, avion: 63, meuble: 70 });

// --- Atlas d'époque ---------------------------------------------------------------------------------------------------------------------------------
export const ATLAS_TAILLE = 256;
const NEUTRE = [128, 128, 128];
// Régions (pixels de la texture ; y = rangée de données, v croissant vers le haut du dessin). Les régions « ajuste » sont posées entières sur une face.
export const REGIONS = Object.freeze({
  tole: { x: 0, y: 0, w: 128, h: 64 }, toile: { x: 128, y: 0, w: 64, h: 64 }, acier: { x: 192, y: 0, w: 64, h: 64 },
  caisse: { x: 0, y: 64, w: 128, h: 64 }, panneau: { x: 128, y: 64, w: 128, h: 64 },
  etoile: { x: 0, y: 128, w: 64, h: 64 }, pneu: { x: 64, y: 128, w: 64, h: 64 }, bois: { x: 128, y: 128, w: 64, h: 64 }, verre: { x: 192, y: 128, w: 64, h: 64 },
  numero: { x: 0, y: 192, w: 128, h: 64 }, soie: { x: 128, y: 192, w: 64, h: 64 }, suie: { x: 192, y: 192, w: 64, h: 64 },
});
export function regionUv(id, taille = ATLAS_TAILLE) {
  const r = REGIONS[id] ?? REGIONS.tole;
  return { u0: (r.x + 1) / taille, v0: (r.y + 1) / taille, u1: (r.x + r.w - 1) / taille, v1: (r.y + r.h - 1) / taille };
}

// Matières : région, échelle (unités du monde par largeur de région), ajustée (région entière sur la face) et teinte (clé de couleurs de decor-epoque.json ;
// « neutre » : la texture seule). sol : triangle du sol extérieur (trous d'obus, cratère : maillage du sol, texture de terre teintée).
export const MATIERES = Object.freeze({
  olive: { region: 'tole', echelle: 70, teinte: 'olive' }, feldgrau: { region: 'tole', echelle: 70, teinte: 'feldgrau' },
  avion: { region: 'tole', echelle: 90, teinte: 'avion' }, jerrycan: { region: 'tole', echelle: 30, teinte: 'jerrycan' },
  toile: { region: 'toile', echelle: 50, teinte: 'toile' }, pneu: { region: 'pneu', echelle: 24, teinte: 'pneu' }, verre: { region: 'verre', echelle: 40, teinte: 'verre' },
  acier: { region: 'acier', echelle: 40, teinte: 'acier' }, rouille: { region: 'acier', echelle: 40, teinte: 'rouille' }, bois: { region: 'bois', echelle: 60, teinte: 'bois' },
  caisse: { region: 'caisse', ajuste: true, teinte: 'neutre' }, panneau: { region: 'panneau', ajuste: true, teinte: 'neutre' },
  etoile: { region: 'etoile', ajuste: true, teinte: 'neutre' }, numero: { region: 'numero', ajuste: true, teinte: 'neutre' },
  soie: { region: 'soie', echelle: 60, teinte: 'soie' }, suie: { region: 'suie', echelle: 40, teinte: 'suie' }, brule: { region: 'tole', echelle: 70, teinte: 'brule' },
  'sol-brule': { sol: true, teinte: 'cratere-brule' }, 'sol-terre': { sol: true, teinte: 'cratere-terre' },
});

// Couleurs : { clé: { jeton, vers, part } } de decor-epoque.json → [r, g, b] (0-255) avec une fonction lookup(jeton) → '#rrggbb' (palette.js) ou [r, g, b].
export function couleursEpoque(defs, lookup) {
  const versRvb = (v) => {
    if (Array.isArray(v) && v.length >= 3 && v.every(isNum)) return v.slice(0, 3);
    const m = typeof v === 'string' ? /^#?([0-9a-f]{6})$/i.exec(v.trim()) : null;
    return m ? [0, 2, 4].map((k) => parseInt(m[1].slice(k, k + 2), 16)) : null;
  };
  const out = {};
  for (const [cle, d] of Object.entries(defs && typeof defs === 'object' ? defs : {})) {
    if (!d || typeof d !== 'object' || cle.startsWith('_')) continue;
    const a = versRvb(typeof lookup === 'function' ? lookup(d.jeton) : null);
    if (!a) continue;
    const b = versRvb(typeof lookup === 'function' && d.vers ? lookup(d.vers) : null) ?? a;
    const p = isNum(d.part) ? Math.min(1, Math.max(0, d.part)) : 0;
    out[cle] = a.map((c, i) => Math.round(c * (1 - p) + b[i] * p));
  }
  return out;
}

function hash(x, y, s) {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(s | 0, 1274126177)) | 0;
  h = Math.imul(h ^ (h >>> 15), 2246822519);
  h = Math.imul(h ^ (h >>> 13), 3266489917);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
// Bruit de valeur lisse (réseau de `n` cases sur la région) : (x, y) en pixels de la région → [0, 1].
function bruit(n, s) {
  return (x, y, w, h) => {
    const fx = (x / w) * n;
    const fy = (y / h) * n;
    const x0 = Math.floor(fx);
    const y0 = Math.floor(fy);
    let tx = fx - x0;
    let ty = fy - y0;
    tx *= tx * (3 - 2 * tx);
    ty *= ty * (3 - 2 * ty);
    const g = (i, j) => hash(((i % n) + n) % n, ((j % n) + n) % n, s);
    const a = g(x0, y0);
    const b = g(x0 + 1, y0);
    const c = g(x0, y0 + 1);
    const d = g(x0 + 1, y0 + 1);
    return a + (b - a) * tx + (c - a) * ty + (a - b - c + d) * tx * ty;
  };
}

// Police de pochoir 3 × 5 (rangées du haut vers le bas, bits de gauche à droite) : chiffres et quelques lettres, textes génériques inventés.
const GLYPHES = {
  0: [7, 5, 5, 5, 7], 1: [2, 6, 2, 2, 7], 2: [7, 1, 7, 4, 7], 3: [7, 1, 3, 1, 7], 4: [5, 5, 7, 1, 1], 5: [7, 4, 7, 1, 7], 6: [7, 4, 7, 5, 7], 7: [7, 1, 1, 2, 2], 8: [7, 5, 7, 5, 7], 9: [7, 5, 7, 1, 7],
  A: [2, 5, 7, 5, 5], B: [6, 5, 6, 5, 6], C: [7, 4, 4, 4, 7], D: [6, 5, 5, 5, 6], E: [7, 4, 6, 4, 7], K: [5, 5, 6, 5, 5], L: [4, 4, 4, 4, 7], M: [5, 7, 7, 5, 5], O: [7, 5, 5, 5, 7],
  P: [7, 5, 7, 4, 4], R: [6, 5, 6, 5, 5], S: [7, 4, 7, 1, 7], T: [7, 2, 2, 2, 2], U: [5, 5, 5, 5, 7], '.': [0, 0, 0, 0, 2], '-': [0, 0, 7, 0, 0], ' ': [0, 0, 0, 0, 0],
};
// Textes au pochoir (inventés, génériques : ni unité réelle, ni marque).
export const TEXTES = Object.freeze({ caisse: ['CAL .30', 'M2 - 250'], panneau: ['PC 2 KM'], numero: ['42-7'] });

// Atlas d'époque (carré de `taille` px, RGBA) ; couleurs : sortie de couleursEpoque (clés « bois-caisse », « pochoir », « panneau-bois », « panneau-texte »,
// « etoile-fond », « etoile », « olive ») ; absentes : gris neutre. Régions en niveaux de gris (multipliées par la teinte de la matière) sauf caisse, panneau,
// étoile et numéro (couleurs propres). → { width, height, data: Uint8ClampedArray, regions }.
export function atlasEpoque({ taille = ATLAS_TAILLE, couleurs = {} } = {}) {
  const N = taille === 256 || taille === 128 || taille === 512 ? taille : ATLAS_TAILLE;
  const k = N / ATLAS_TAILLE;
  const data = new Uint8ClampedArray(N * N * 4);
  const c = (cle) => (Array.isArray(couleurs?.[cle]) && couleurs[cle].length >= 3 ? couleurs[cle] : NEUTRE); // absente : gris neutre (comme texgen.js)
  const put = (x, y, rgb) => {
    if (x < 0 || y < 0 || x >= N || y >= N) return;
    const i = (y * N + x) * 4;
    data[i] = rgb[0];
    data[i + 1] = rgb[1];
    data[i + 2] = rgb[2];
    data[i + 3] = 255;
  };
  const gris = (v) => [v, v, v].map((q) => Math.max(0, Math.min(255, Math.round(q))));
  const fois = (rgb, f) => rgb.map((q) => Math.max(0, Math.min(255, Math.round(q * f))));
  // Peint une région : f(px, py, w, h) → [r, g, b] ; py = 0 en haut du dessin (rangée de données la plus haute de la région).
  const peindre = (id, f) => {
    const r = REGIONS[id];
    const x0 = Math.round(r.x * k);
    const y0 = Math.round(r.y * k);
    const w = Math.round(r.w * k);
    const h = Math.round(r.h * k);
    for (let py = 0; py < h; py += 1) for (let px = 0; px < w; px += 1) put(x0 + px, y0 + (h - 1 - py), f(px, py, w, h));
    return { x0, y0, w, h };
  };
  const ecrire = (id, lignes, couleur, { taillePx = 3, marge = 0.12, haut = null } = {}) => {
    const r = REGIONS[id];
    const x0 = Math.round(r.x * k);
    const y0 = Math.round(r.y * k);
    const w = Math.round(r.w * k);
    const h = Math.round(r.h * k);
    const s = Math.max(1, Math.round(taillePx * k));
    const hl = lignes.length * 6 * s;
    lignes.forEach((txt, li) => {
      const lw = txt.length * 4 * s;
      const ox = Math.round((w - lw) / 2);
      const oy = Math.round((haut === null ? (h - hl) / 2 : haut * h) + li * 6 * s + marge);
      [...txt].forEach((ch, ci) => {
        const g = GLYPHES[ch] ?? GLYPHES[' '];
        for (let row = 0; row < 5; row += 1) for (let col = 0; col < 3; col += 1) {
          if (!((g[row] >> (2 - col)) & 1)) continue;
          for (let dy = 0; dy < s; dy += 1) for (let dx = 0; dx < s; dx += 1) {
            const px = ox + ci * 4 * s + col * s + dx;
            const py = oy + row * s + dy;
            if (hash(px, py, 77) < 0.12) continue; // pochoir usé
            put(x0 + px, y0 + (h - 1 - py), couleur);
          }
        }
      });
    });
  };
  const n1 = bruit(4, 11);
  const n2 = bruit(13, 12);
  // Tôle : panneaux rivetés, écaillures, coulures (niveaux de gris autour de 215).
  peindre('tole', (x, y, w, h) => {
    let f = 0.86 + (n1(x, y, w, h) - 0.5) * 0.18 + (hash(x, y, 1) - 0.5) * 0.06;
    if (x % Math.round(w / 3) === 0 || y % Math.round(h / 2) === 0) f *= 0.62;
    if ((x % Math.round(w / 3) === 3 || y % Math.round(h / 2) === 3) && (x + y) % 6 === 0) f *= 0.7; // rivets
    if (n2(x, y, w, h) > 0.82) f *= 1.12;
    return gris(255 * f);
  });
  peindre('toile', (x, y, w, h) => gris(255 * (0.8 + ((x + y) % 2) * 0.05 + (n1(x, y, w, h) - 0.5) * 0.2 + (y % 16 === 0 ? -0.15 : 0))));
  peindre('acier', (x, y, w, h) => gris(255 * (0.78 + (n2(x, y, w, h) - 0.5) * 0.22 + (hash(x >> 2, y, 3) > 0.93 ? 0.15 : 0))));
  const boisC = c('bois-caisse');
  peindre('caisse', (x, y, w, h) => {
    const planche = Math.floor(y / (h / 4));
    let f = 0.92 + (hash(planche, 0, 5) - 0.5) * 0.14 + (n2(x * 0.3, y * 2, w, h) - 0.5) * 0.12;
    if (y % Math.round(h / 4) === 0) f *= 0.55;
    if (x < 3 || x > w - 4) f *= 0.7; // tasseaux
    return fois(boisC, f);
  });
  ecrire('caisse', TEXTES.caisse, c('pochoir'));
  const boisP = c('panneau-bois');
  const bandeP = c('panneau-texte');
  peindre('panneau', (x, y, w, h) => {
    const f = 0.9 + (n2(x * 0.4, y * 1.5, w, h) - 0.5) * 0.16 + (y % Math.round(h / 3) === 0 ? -0.3 : 0);
    // Flèche peinte vers la droite (pointe à 85 % de la largeur), fond de planche.
    const cy = h * 0.72;
    const fleche = (x > w * 0.08 && x < w * 0.7 && Math.abs(y - cy) < h * 0.07) || (x >= w * 0.7 && x < w * 0.88 && Math.abs(y - cy) < (w * 0.88 - x) * 0.5);
    return fleche ? fois(bandeP, 0.85) : fois(boisP, f);
  });
  ecrire('panneau', TEXTES.panneau, bandeP, { taillePx: 4, haut: 0.12 });
  const fondE = c('etoile-fond');
  const blanc = c('etoile');
  const vert = c('olive');
  peindre('etoile', (x, y, w, h) => {
    const dx = (x + 0.5 - w / 2) / (w / 2);
    const dy = (h / 2 - y - 0.5) / (h / 2);
    const r = Math.hypot(dx, dy);
    if (r > 0.96) return vert;
    // Étoile à cinq branches (pointe en haut) : rayon polaire entre 0,38 et 0,92.
    const a = Math.atan2(dx, dy);
    const sect = (((a / (2 * Math.PI)) * 5) % 1 + 1) % 1;
    const lim = 0.38 + (0.92 - 0.38) * Math.abs(1 - 2 * sect) ** 1.6;
    return r < lim ? blanc : fondE;
  });
  peindre('pneu', (x, y) => gris(255 * (0.55 + ((y >> 2) % 2) * 0.08 + (hash(x, y, 9) - 0.5) * 0.06)));
  peindre('bois', (x, y, w, h) => gris(255 * (0.82 + (n2(x * 3, y * 0.25, w, h) - 0.5) * 0.3)));
  peindre('verre', (x, y, w) => gris(255 * (0.5 + (x + y < w * 0.4 ? 0.2 : 0) + (hash(x, y, 4) - 0.5) * 0.05)));
  peindre('numero', () => vert);
  ecrire('numero', TEXTES.numero, blanc, { taillePx: 5 });
  peindre('soie', (x, y, w, h) => gris(255 * (0.9 + (x % Math.round(w / 4) === 0 ? -0.18 : 0) + (n1(x, y, w, h) - 0.5) * 0.1)));
  peindre('suie', (x, y, w, h) => gris(255 * (0.55 + (n1(x, y, w, h) - 0.5) * 0.3 + (n2(x, y, w, h) > 0.75 ? 0.15 : 0))));
  return { width: N, height: N, data, regions: Object.fromEntries(Object.keys(REGIONS).map((id) => [id, regionUv(id, N)])) };
}

// --- Géométrie --------------------------------------------------------------------------------------------------------------------------------------
const rotX = (p, a) => [p[0], p[1] * Math.cos(a) - p[2] * Math.sin(a), p[1] * Math.sin(a) + p[2] * Math.cos(a)];
const rotZ = (p, a) => [p[0] * Math.cos(a) - p[1] * Math.sin(a), p[0] * Math.sin(a) + p[1] * Math.cos(a), p[2]];
const rotY = (p, a) => [p[0] * Math.cos(a) - p[2] * Math.sin(a), p[1], p[0] * Math.sin(a) + p[2] * Math.cos(a)];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const unit = (v) => {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
};
const r3 = (v) => Math.round(v * 1000) / 1000;
const transform = (p, { rx = 0, rz = 0, ry = 0, t = [0, 0, 0] } = {}) => {
  const q = rotY(rotZ(rotX(p, rx * DEG), rz * DEG), ry * DEG);
  return [q[0] + t[0], q[1] + t[1], q[2] + t[2]];
};
const HEXA = [[0, 3, 2, 1], [4, 5, 6, 7], [0, 1, 5, 4], [1, 2, 6, 5], [2, 3, 7, 6], [3, 0, 4, 7]];

// Modèle en construction : pièces { id, mat, group, pts, faces, plaque (normale imposée) }. Transformations : roulis rx, tangage rz, lacet ry, translation t.
function modele() {
  const pieces = [];
  const m = {
    pieces,
    // Hexaèdre convexe : 4 coins d'un bout puis les 4 de l'autre, dans le même ordre.
    hexa(id, mat, group, pts, tr) {
      pieces.push({ id, mat, group, pts: pts.map((p) => transform(p, tr)), faces: HEXA });
      return m;
    },
    boite(id, mat, group, [x0, x1], [y0, y1], [z0, z1], tr) {
      return m.hexa(id, mat, group, [[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [x1, y0, z0], [x1, y0, z1], [x1, y1, z1], [x1, y1, z0]], tr);
    },
    // Tronc le long de x : section s0 ({ y: [bas, haut], z: [gauche, droite] }) en x0, s1 en x1.
    tronc(id, mat, group, x0, x1, s0, s1, tr) {
      const sec = (x, s) => [[x, s.y[0], s.z[0]], [x, s.y[0], s.z[1]], [x, s.y[1], s.z[1]], [x, s.y[1], s.z[0]]];
      return m.hexa(id, mat, group, [...sec(x0, s0), ...sec(x1, s1 ?? s0)], tr);
    },
    // Cylindre (ou cône tronqué) le long de x, de 0 à len, rayons r0 → r1, `cotes` pans, bouchons facultatifs.
    cylindre(id, mat, group, { r0, r1 = r0, len, cotes = 6, bouchons = true, phase = 0 }, tr) {
      const pts = [];
      for (const [x, r] of [[0, r0], [len, r1]]) for (let i = 0; i < cotes; i += 1) {
        const a = phase + (i / cotes) * Math.PI * 2;
        pts.push(transform([x, Math.sin(a) * r, Math.cos(a) * r], tr));
      }
      const faces = [];
      for (let i = 0; i < cotes; i += 1) faces.push([i, (i + 1) % cotes, cotes + ((i + 1) % cotes), cotes + i]);
      if (bouchons) {
        faces.push([...Array(cotes).keys()].reverse());
        faces.push([...Array(cotes).keys()].map((i) => cotes + i));
      }
      pieces.push({ id, mat, group, pts, faces });
      return m;
    },
    // Plaque (une seule face, normale imposée n après transformation) : étoiles, numéros, voilure.
    plaque(id, mat, group, pts, n, tr) {
      const tp = pts.map((p) => transform(p, tr));
      const tn = unit(sub(transform(n, { ...tr, t: [0, 0, 0] }), [0, 0, 0]));
      pieces.push({ id, mat, group, pts: tp, faces: [[...Array(tp.length).keys()]], plaque: tn });
      return m;
    },
  };
  return m;
}

// Coupe d'un polygone par le demi-espace y >= 0 (Sutherland-Hodgman).
function coupeSol(poly) {
  const out = [];
  for (let i = 0; i < poly.length; i += 1) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    if (a[1] >= 0) out.push(a);
    if ((a[1] >= 0) !== (b[1] >= 0)) {
      const t = a[1] / (a[1] - b[1]);
      out.push([a[0] + (b[0] - a[0]) * t, 0, a[2] + (b[2] - a[2]) * t]);
    }
  }
  return out;
}

// Coordonnées de texture d'un polygone de face : projection sur le plan le plus proche de sa normale ; région entière (ajustée, texte lisible de face)
// ou fenêtre de taille face / échelle (bornée à la région), décalée par pièce.
function uvFace(poly, n, mat, id) {
  const M = MATIERES[mat] ?? MATIERES.olive;
  if (M.sol) return poly.map((p) => [p[0], p[2]]); // le sol extérieur reprend la texture de terre répétée (coordonnées du monde, divisées au dessin)
  const r = regionUv(M.region);
  const ax = Math.abs(n[0]);
  const ay = Math.abs(n[1]);
  const az = Math.abs(n[2]);
  // Axes (a horizontal de lecture, b vertical) selon la face.
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
  const e = Math.max(1, M.echelle ?? 60);
  const wu = Math.min(1, sa / e);
  const wv = Math.min(1, sb / e);
  const ou = (((h >>> 0) % 997) / 997) * (1 - wu);
  const ov = (((h >>> 10) % 991) / 991) * (1 - wv);
  return poly.map((p, i) => [r.u0 + (ou + ((as[i] - a0) / sa) * wu) * (r.u1 - r.u0), r.v0 + (ov + ((bs[i] - b0) / sb) * wv) * (r.v1 - r.v0)]);
}

// Triangulation d'un modèle : faces orientées vers l'extérieur (centre de la pièce convexe), coupées au sol, dessous posé au sol retiré.
// → [{ part, mat, group, p: [[x, y, z] × 3], n, uv: [[u, v] × 3] }].
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
      }
      if (!poly.every((p) => p.every(isNum)) || Math.hypot(...n) < 0.5) continue;
      if (n[1] < -0.7 && Math.max(...poly.map((p) => p[1])) < 1) continue; // dessous posé au sol : invisible
      const uvAll = uvFace(poly, n, piece.mat, piece.id);
      const clipped = coupeSol(poly);
      if (clipped.length < 3) continue;
      // UV des sommets coupés : interpolation barycentrique dans le polygone d'origine (projection planaire : même formule).
      const intact = clipped.length === poly.length && clipped.every((p, i) => p === poly[i]);
      const useUv = intact ? uvAll : rescaleUv(poly, clipped, uvAll, uvFace(clipped, n, piece.mat, piece.id), piece.mat);
      for (let i = 1; i + 1 < clipped.length; i += 1) {
        const p = [clipped[0], clipped[i], clipped[i + 1]];
        if (Math.hypot(...cross(sub(p[1], p[0]), sub(p[2], p[0]))) < 1e-6) continue;
        tris.push({ part: piece.id, mat: piece.mat, group: piece.group, p: p.map((v) => v.map(r3)), n: n.map((v) => Math.round(v * 10000) / 10000), uv: [useUv[0], useUv[i], useUv[i + 1]].map((q) => q.map((v) => Math.round(v * 100000) / 100000)) });
      }
    }
  }
  return tris;
}
// Après la coupe au sol, les coordonnées de texture suivent la même projection que la face entière (pas de déformation de la région ajustée).
function rescaleUv(poly, clipped, uvAll, uvClip, mat) {
  const M = MATIERES[mat] ?? MATIERES.olive;
  if (M.sol) return uvClip;
  // Correspondance affine : on cherche les deux axes de projection d'après la face d'origine (trois premiers sommets non alignés).
  const [p0, p1, p2] = poly;
  const [t0, t1, t2] = uvAll;
  const e1 = sub(p1, p0);
  const e2 = sub(p2, p0);
  const n = cross(e1, e2);
  const nn = dot3(n, n) || 1;
  return clipped.map((q) => {
    const d = sub(q, p0);
    const b1 = dot3(cross(d, e2), n) / nn;
    const b2 = dot3(cross(e1, d), n) / nn;
    return [t0[0] + b1 * (t1[0] - t0[0]) + b2 * (t2[0] - t0[0]), t0[1] + b1 * (t1[1] - t0[1]) + b2 * (t2[1] - t0[1])];
  });
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

// --- Modèles (unités du jeu ; s = unités par mètre) ------------------------------------------------------------------------------------------------
const M_ = (v, s) => v * s;

// Roues : cylindres le long de z (axe de la roue), 6 pans.
function roues(m, positions, r, w, mat = 'pneu', groupe = 'caisse') {
  positions.forEach(([x, z], i) => m.cylindre(`roue-${i + 1}`, mat, groupe, { r0: r, len: w, cotes: 6, phase: Math.PI / 6 }, { ry: 90, t: [x, r, z - w / 2] }));
}

// Véhicule à la taille d'un rectangle (L × l, cap 0 : avant vers +x) ; variante jeep, kubel, dodge, blitz ; brule : calciné (sans pneus ni vitres, teintes
// brûlées, posé sur les jantes). Hauteur plafonnée à 55. Renvoie le modèle et les foyers (capot, habitacle) pour le feu.
export function modeleVehicule(variante, { L = 92, l = 46, brule = false } = {}) {
  const v = ['jeep', 'kubel', 'dodge', 'blitz'].includes(variante) ? variante : 'jeep';
  const reel = { jeep: [3.36, 1.58], kubel: [3.74, 1.6], dodge: [4.24, 2.1], blitz: [6.02, 2.27] }[v];
  // Échelle : tout le dessin (roue de secours, pneus) tient dans le rectangle L × l.
  const hors = { jeep: [3.6, 1.62], kubel: [3.84, 1.62], dodge: [4.26, 2.14], blitz: [6.04, 2.31] }[v];
  const sx = (L - 0.6) / hors[0];
  const sz = (l - 0.6) / hors[1];
  const sy = Math.min((sx + sz) / 2, PLAFONDS.vehicule / ({ jeep: 1.38, kubel: 1.45, dodge: 2.1, blitz: 2.3 }[v]));
  const m = modele();
  const peinture = brule ? 'brule' : v === 'kubel' || v === 'blitz' ? 'feldgrau' : 'olive';
  const sombre = brule ? 'suie' : 'pneu';
  const enfonce = brule ? -0.12 : 0;
  const X = (a) => a * sx;
  const Y = (a) => (a + enfonce) * sy;
  const Z = (a) => a * sz;
  const box = (id, mat, x, y, z, tr) => m.boite(id, mat, 'caisse', [X(x[0]), X(x[1])], [Y(y[0]), Y(y[1])], [Z(z[0]), Z(z[1])], tr);
  const hl = reel[0] / 2;
  const hw = reel[1] / 2;
  const rr = { jeep: 0.36, kubel: 0.36, dodge: 0.45, blitz: 0.48 }[v];
  const rues = (xs) => {
    if (brule) roues(m, xs.flatMap((x) => [[X(x), Z(-hw + 0.08)], [X(x), Z(hw - 0.08)]]), rr * 0.7 * sy, Z(0.16), 'suie');
    else roues(m, xs.flatMap((x) => [[X(x), Z(-hw + 0.1)], [X(x), Z(hw - 0.1)]]), rr * sy, Z(0.22), 'pneu');
  };
  let feux;
  if (v === 'jeep') {
    box('caisse', peinture, [-hl, hl - 0.75], [0.38, 0.95], [-hw + 0.08, hw - 0.08]);
    m.tronc('capot', peinture, 'caisse', X(hl - 0.95), X(hl - 0.05), { y: [Y(0.5), Y(0.98)], z: [Z(-0.5), Z(0.5)] }, { y: [Y(0.5), Y(0.92)], z: [Z(-0.46), Z(0.46)] });
    box('calandre', brule ? 'suie' : 'acier', [hl - 0.08, hl], [0.42, 0.9], [-0.42, 0.42]);
    box('aile-g', peinture, [hl - 1.0, hl - 0.04], [0.62, 0.7], [-hw, -0.5]);
    box('aile-d', peinture, [hl - 1.0, hl - 0.04], [0.62, 0.7], [0.5, hw]);
    box('sieges', sombre, [-0.5, 0.25], [0.95, 1.15], [-0.62, 0.62]);
    if (!brule) {
      box('pare-brise', 'verre', [hl - 1.02, hl - 0.96], [0.98, 1.38], [-0.66, 0.66]);
      m.cylindre('secours', 'pneu', 'caisse', { r0: rr * sy, len: X(0.2), cotes: 6, phase: Math.PI / 6 }, { t: [X(-hl - 0.2), Y(0.75), 0] });
      m.plaque('etoile', 'etoile', 'caisse', [[X(hl - 0.85), Y(0.985), Z(-0.36)], [X(hl - 0.15), Y(0.94), Z(-0.36)], [X(hl - 0.15), Y(0.94), Z(0.36)], [X(hl - 0.85), Y(0.985), Z(0.36)]], [0, 1, 0]);
      m.plaque('numero', 'numero', 'caisse', [[X(-hl + 0.3), Y(0.45), Z(hw - 0.07)], [X(-hl + 1.2), Y(0.45), Z(hw - 0.07)], [X(-hl + 1.2), Y(0.85), Z(hw - 0.07)], [X(-hl + 0.3), Y(0.85), Z(hw - 0.07)]], [0, 0, 1]);
    }
    rues([-hl + 0.65, hl - 0.6]);
    feux = [{ id: 'capot', x: X(hl - 0.5), z: 0, y: Y(0.98), w: X(0.8), d: Z(1.0) }, { id: 'habitacle', x: X(-0.2), z: 0, y: Y(1.15), w: X(1.2), d: Z(1.1) }];
  } else if (v === 'kubel') {
    box('caisse', peinture, [-hl, hl - 0.6], [0.36, 1.0], [-hw + 0.05, hw - 0.05]);
    m.tronc('nez', peinture, 'caisse', X(hl - 0.6), X(hl), { y: [Y(0.36), Y(1.0)], z: [Z(-hw + 0.05), Z(hw - 0.05)] }, { y: [Y(0.36), Y(0.62)], z: [Z(-hw + 0.15), Z(hw - 0.15)] });
    box('nervure-g', peinture, [-hl + 0.3, hl - 0.8], [0.6, 0.66], [-hw, -hw + 0.06]);
    box('nervure-d', peinture, [-hl + 0.3, hl - 0.8], [0.6, 0.66], [hw - 0.06, hw]);
    box('capote', brule ? 'suie' : 'toile', [-hl + 0.1, -hl + 0.7], [1.0, 1.22], [-hw + 0.1, hw - 0.1]);
    box('sieges', sombre, [-0.6, 0.4], [1.0, 1.12], [-0.65, 0.65]);
    box('grille', 'acier', [-hl - 0.03, -hl], [0.55, 0.9], [-0.5, 0.5]);
    if (!brule) {
      box('pare-brise', 'verre', [hl - 1.15, hl - 1.1], [1.0, 1.42], [-0.7, 0.7]);
      m.cylindre('secours', 'pneu', 'caisse', { r0: rr * sy * 0.95, len: Y(0.18), cotes: 6 }, { rz: 90 - 26, t: [X(hl - 0.3), Y(0.6), 0] });
    }
    rues([-hl + 0.7, hl - 0.75]);
    feux = [{ id: 'capot', x: X(hl - 0.3), z: 0, y: Y(0.9), w: X(0.6), d: Z(1.1) }, { id: 'habitacle', x: X(-0.1), z: 0, y: Y(1.12), w: X(1.2), d: Z(1.1) }];
  } else if (v === 'dodge') {
    m.tronc('capot', peinture, 'caisse', X(hl - 1.25), X(hl - 0.05), { y: [Y(0.8), Y(1.35)], z: [Z(-0.55), Z(0.55)] }, { y: [Y(0.8), Y(1.3)], z: [Z(-0.5), Z(0.5)] });
    box('calandre', brule ? 'suie' : 'acier', [hl - 0.08, hl], [0.7, 1.3], [-0.5, 0.5]);
    box('aile-g', peinture, [hl - 1.4, hl - 0.04], [0.85, 1.0], [-hw, -0.55]);
    box('aile-d', peinture, [hl - 1.4, hl - 0.04], [0.85, 1.0], [0.55, hw]);
    box('cabine', peinture, [hl - 2.2, hl - 1.25], [0.75, 1.4], [-hw + 0.05, hw - 0.05]);
    box('plateau', peinture, [-hl, hl - 2.25], [0.78, 1.3], [-hw, hw]);
    if (!brule) {
      box('pare-brise', 'verre', [hl - 1.32, hl - 1.26], [1.4, 1.95], [-0.9, 0.9]);
      box('bache', 'toile', [-hl + 0.05, hl - 2.3], [1.3, 2.0], [-hw + 0.05, hw - 0.05]);
      m.plaque('etoile', 'etoile', 'caisse', [[X(hl - 1.05), Y(1.352), Z(-0.4)], [X(hl - 0.25), Y(1.318), Z(-0.4)], [X(hl - 0.25), Y(1.318), Z(0.4)], [X(hl - 1.05), Y(1.352), Z(0.4)]], [0, 1, 0]);
    } else box('arceaux', 'suie', [-hl + 0.1, hl - 2.4], [1.3, 1.36], [-hw + 0.1, hw - 0.1]);
    rues([-hl + 0.9, hl - 0.8]);
    feux = [{ id: 'capot', x: X(hl - 0.6), z: 0, y: Y(1.35), w: X(1.0), d: Z(1.0) }, { id: 'habitacle', x: X(hl - 1.7), z: 0, y: Y(1.4), w: X(0.9), d: Z(1.6) }];
  } else {
    m.tronc('capot', peinture, 'caisse', X(hl - 1.5), X(hl - 0.05), { y: [Y(0.85), Y(1.45)], z: [Z(-0.55), Z(0.55)] }, { y: [Y(0.85), Y(1.35)], z: [Z(-0.5), Z(0.5)] });
    box('calandre', brule ? 'suie' : 'acier', [hl - 0.08, hl], [0.75, 1.35], [-0.5, 0.5]);
    box('aile-g', peinture, [hl - 1.6, hl - 0.04], [0.85, 1.0], [-hw + 0.05, -0.55]);
    box('aile-d', peinture, [hl - 1.6, hl - 0.04], [0.85, 1.0], [0.55, hw - 0.05]);
    box('cabine', peinture, [hl - 2.6, hl - 1.5], [0.8, 2.15], [-hw + 0.1, hw - 0.1]);
    box('plateau', peinture, [-hl, hl - 2.65], [0.85, 1.35], [-hw, hw]);
    if (!brule) {
      box('vitre', 'verre', [hl - 1.56, hl - 1.5], [1.5, 2.0], [-0.95, 0.95]);
      box('bache', 'toile', [-hl + 0.05, hl - 2.7], [1.35, 2.25], [-hw + 0.05, hw - 0.05]);
    } else box('arceaux', 'suie', [-hl + 0.1, hl - 2.8], [1.35, 1.42], [-hw + 0.1, hw - 0.1]);
    rues([-hl + 1.1, -hl + 2.2, hl - 0.95]);
    feux = [{ id: 'capot', x: X(hl - 0.75), z: 0, y: Y(1.45), w: X(1.2), d: Z(1.0) }, { id: 'habitacle', x: X(hl - 2.05), z: 0, y: Y(2.15), w: X(0.9), d: Z(1.6) }];
  }
  return { modele: m, centrer: true, feux: feux.map((f) => ({ ...f, x: r3(f.x), y: r3(f.y), w: r3(f.w), d: r3(f.d) })) };
}

// Avion de chasse écrasé sur le ventre (repère du modèle, nez vers +x, centre du fuselage à l'origine) ; variantes : p51 (P-51A Mustang, aile gauche
// arrachée et couchée à côté), p47 (P-47 Thunderbolt à dos rond, bout d'aile droite replié), p40 (P-40 Warhawk, queue cassée et couchée). Hélice tordue
// (immobile). Marquages : étoile (permise), numéro inventé. Groupes : fuselage, aile, queue, debris (collision), pales (sans collision).
export function modeleAvion(variante) {
  const v = ['p51', 'p47', 'p40'].includes(variante) ? variante : 'p51';
  const s = { p51: 22, p47: 20, p40: 20 }[v];
  const m = modele();
  const X = (a) => M_(a, s);
  const P = (pts) => pts.map(([x, y, z]) => [X(x), X(y), X(z)]);
  const mat = 'avion';
  // Fuselage : sections (x, y bas, y haut, demi-largeur).
  const secs = {
    p51: [[4.4, 0.45, 1.15, 0.36], [3.2, 0.2, 1.45, 0.46], [1.4, 0.05, 1.55, 0.48], [-0.8, 0.05, 1.5, 0.46], [-4.6, 0.55, 1.15, 0.16]],
    p47: [[4.2, 0.2, 1.75, 0.72], [3.0, 0.05, 2.0, 0.78], [1.0, 0.05, 2.05, 0.7], [-1.0, 0.1, 1.95, 0.6], [-4.4, 0.6, 1.3, 0.2]],
    p40: [[4.3, 0.1, 1.2, 0.4], [3.0, 0.0, 1.45, 0.5], [1.2, 0.05, 1.55, 0.48], [-0.8, 0.1, 1.5, 0.44], [-4.4, 0.6, 1.15, 0.15]],
  }[v];
  const cassure = v === 'p40' ? 2 : 99; // le P-40 casse derrière le poste (section 3)
  const queueTr = v === 'p40' ? { ry: 24, rx: -16, t: [X(-1.2), 0, X(-1.0)] } : null;
  for (let i = 0; i + 1 < secs.length; i += 1) {
    const [x0, b0, h0, w0] = secs[i];
    const [x1, b1, h1, w1] = secs[i + 1];
    const queue = i >= cassure + 1;
    const tr = queue ? queueTr : undefined;
    const groupe = i >= secs.length - 2 ? 'queue' : 'fuselage';
    m.tronc(`fuselage-${i + 1}`, mat, queue ? 'debris' : groupe, X(x1), X(x0), { y: [X(b1), X(h1)], z: [X(-w1), X(w1)] }, { y: [X(b0), X(h0)], z: [X(-w0), X(w0)] }, tr);
  }
  // Capot moteur (nez) et casserole d'hélice.
  const nez = secs[0];
  m.cylindre('casserole', 'acier', 'fuselage', { r0: X(0.3), r1: X(0.06), len: X(0.6), cotes: 6 }, { t: [X(nez[0]), X((nez[1] + nez[2]) / 2), 0] });
  if (v === 'p40') m.boite('radiateur', mat, 'fuselage', [X(2.6), X(4.0)], [X(-0.15), X(0.45)], [X(-0.42), X(0.42)]);
  if (v === 'p51') m.boite('ecope', mat, 'fuselage', [X(-1.6), X(0.2)], [X(-0.2), X(0.3)], [X(-0.34), X(0.34)]);
  // Verrière.
  const vc = { p51: [-0.7, 1.0, 1.45, 2.0, 0.32], p47: [-0.8, 1.0, 1.95, 2.55, 0.42], p40: [-0.6, 1.1, 1.45, 2.0, 0.32] }[v];
  m.tronc('verriere', 'verre', 'fuselage', X(vc[0]), X(vc[1]), { y: [X(vc[2]), X(vc[3] - 0.15)], z: [X(-vc[4] * 0.7), X(vc[4] * 0.7)] }, { y: [X(vc[2]), X(vc[3])], z: [X(-vc[4]), X(vc[4])] });
  // Ailes : emplanture (bord d'attaque, de fuite) → saumon.
  const aile = { p51: [2.0, -0.4, 5.64, 1.0, 0.25], p47: [1.8, -0.9, 6.2, 0.6, -0.4], p40: [1.9, -0.5, 5.69, 1.0, 0.2] }[v];
  const ailePts = (cote, envergure = aile[2]) => {
    const z0 = cote * (secs[2][3]);
    const z1 = cote * envergure;
    const k = (envergure - Math.abs(z0)) / (aile[2] - Math.abs(z0));
    const xa = aile[0] + (aile[3] - aile[0]) * k;
    const xf = aile[1] + (aile[4] - aile[1]) * k;
    return P([[aile[0], 0.08, z0], [aile[1], 0.08, z0], [aile[1], 0.4, z0], [aile[0], 0.4, z0], [xa, 0.25 + 0.04 * k, z1], [xf, 0.25 + 0.04 * k, z1], [xf, 0.4, z1], [xa, 0.42, z1]]);
  };
  m.hexa('aile-d', mat, 'aile', ailePts(1, v === 'p47' ? 4.6 : aile[2]));
  if (v === 'p47') {
    // Bout d'aile droite replié vers le haut.
    const z = 4.6;
    m.hexa('saumon-d', mat, 'aile', P([[1.15, 0.25, z], [-0.55, 0.25, z], [-0.55, 0.42, z], [1.15, 0.42, z], [0.7, 1.4, z + 1.0], [-0.4, 1.4, z + 1.0], [-0.4, 1.5, z + 0.92], [0.7, 1.5, z + 0.92]]));
  }
  if (v === 'p51') {
    m.hexa('moignon-g', mat, 'aile', ailePts(-1, 1.3));
    // Aile gauche arrachée, couchée plus loin (debris), à l'envers sur le sol.
    m.hexa('aile-g', mat, 'debris', P([[2.0, 0, -0.4], [-0.4, 0, -0.4], [-0.4, 0.32, -0.4], [2.0, 0.32, -0.4], [1.0, 0, -4.8], [0.3, 0, -4.8], [0.3, 0.22, -4.8], [1.0, 0.24, -4.8]]), { ry: 52, t: [X(-3.6), 0, X(-3.4)] });
  } else m.hexa('aile-g', mat, 'aile', ailePts(-1));
  // Empennage : stabilisateurs et dérive (sur la queue, cassée chez le P-40).
  const qx = secs[secs.length - 1][0];
  const qy = secs[secs.length - 1][2];
  const qtr = v === 'p40' ? queueTr : undefined;
  const qg = v === 'p40' ? 'debris' : 'queue';
  for (const cote of [-1, 1]) m.hexa(`stab-${cote > 0 ? 'd' : 'g'}`, mat, qg, P([[qx + 1.3, 0.85, cote * 0.15], [qx + 0.1, 0.85, cote * 0.15], [qx + 0.1, 0.97, cote * 0.15], [qx + 1.3, 0.97, cote * 0.15], [qx + 0.8, 0.88, cote * 2.1], [qx + 0.25, 0.88, cote * 2.1], [qx + 0.25, 0.94, cote * 2.1], [qx + 0.8, 0.94, cote * 2.1]]), qtr);
  const fin = Math.min(PLAFONDS.avion - 2, X(v === 'p47' ? 2.9 : 2.65)) / s;
  m.hexa('derive', mat, qg, P([[qx + 1.4, qy - 0.1, -0.06], [qx - 0.1, qy - 0.1, -0.06], [qx - 0.1, qy - 0.1, 0.06], [qx + 1.4, qy - 0.1, 0.06], [qx + 0.4, fin, -0.05], [qx - 0.1, fin, -0.05], [qx - 0.1, fin, 0.05], [qx + 0.4, fin, 0.05]]), qtr);
  // Marquages : étoile sur l'aile droite et sur le flanc, numéro inventé sur le flanc gauche.
  m.plaque('etoile-aile', 'etoile', 'aile', P([[1.25, 0.43, 3.4], [0.05, 0.43, 3.4], [0.05, 0.43, 4.5], [1.25, 0.43, 4.5]]), [0, 1, 0]);
  const flanc = secs[3];
  m.plaque('etoile-flanc', 'etoile', v === 'p40' ? 'debris' : 'queue', P([[-2.3, 0.45, flanc[3] * 0.62], [-3.2, 0.45, flanc[3] * 0.55], [-3.2, 1.25, flanc[3] * 0.55], [-2.3, 1.25, flanc[3] * 0.62]]), [0, 0, 1], v === 'p40' ? queueTr : undefined);
  m.plaque('numero', 'numero', 'fuselage', P([[0.4, 0.55, -flanc[3] - 0.01], [2.0, 0.55, -flanc[3] - 0.03], [2.0, 1.1, -flanc[3] - 0.03], [0.4, 1.1, -flanc[3] - 0.01]]), [0, 0, -1]);
  // Hélice tordue : pales depuis le moyeu, recourbées vers l'arrière (celles qui ont touché le sol plus fort).
  const pales = { p51: [[20, 8, 70], [110, 30, 55], [200, 12, 80], [290, 40, 40]], p47: [[30, 10, 60], [120, 35, 50], [210, 15, 75], [300, 42, 45]], p40: [[0, 10, 65], [120, 35, 60], [240, 20, 75]] }[v];
  const moyeu = [X(nez[0] + 0.3), X((nez[1] + nez[2]) / 2), 0];
  const lp = { p51: 1.7, p47: 1.85, p40: 1.65 }[v];
  pales.forEach(([angle, plie, coude], i) => {
    const a = angle * DEG;
    const dir = [0, Math.cos(a), Math.sin(a)];
    const l1 = X(lp * 0.45);
    const l2 = X(lp * 0.55);
    // Premier tronçon : droit ; second : plié vers l'arrière (-x) d'un angle `coude`.
    const largeur = X(0.12);
    const perp = [0, -Math.sin(a), Math.cos(a)];
    const pt = (base, along, back, w, e) => [base[0] - back + e * 0.02, base[1] + dir[1] * along + perp[1] * w, base[2] + dir[2] * along + perp[2] * w];
    const b1 = [moyeu[0] - X(0.02) * plie / 10, moyeu[1], moyeu[2]];
    const p1 = [pt(b1, 0, 0, -largeur, 0), pt(b1, 0, 0, largeur, 0), pt(b1, 0, X(0.05), largeur, 1), pt(b1, 0, X(0.05), -largeur, 1)];
    const p2 = [pt(b1, l1, 0, -largeur, 0), pt(b1, l1, 0, largeur, 0), pt(b1, l1, X(0.05), largeur, 1), pt(b1, l1, X(0.05), -largeur, 1)];
    m.hexa(`pale-${i + 1}a`, 'acier', 'pales', [...p1, ...p2]);
    const c = coude * DEG;
    const b2 = pt(b1, l1, 0, 0, 0);
    const q = (along, w, e) => [b2[0] - Math.sin(c) * along - e * X(0.05), b2[1] + dir[1] * Math.cos(c) * along + perp[1] * w, b2[2] + dir[2] * Math.cos(c) * along + perp[2] * w];
    m.hexa(`pale-${i + 1}b`, 'acier', 'pales', [q(0, -largeur, 0), q(0, largeur, 0), q(0, largeur, 1), q(0, -largeur, 1), q(l2, -largeur * 0.7, 0), q(l2, largeur * 0.7, 0), q(l2, largeur * 0.7, 1), q(l2, -largeur * 0.7, 1)]);
  });
  return { modele: m, echelle: s };
}

// Arbre mort (tronc et trois branches nues, comme le décor vivant) et parachute ; variantes : deploye (voilure étalée sur les branches, suspentes vers un
// harnais pendu), pendu (voilure affaissée en rideau sous une branche), sol (voilure à moitié au sol, suspentes tendues vers l'arbre). Aucune collision.
export function modeleParachute(variante) {
  const v = ['deploye', 'pendu', 'sol'].includes(variante) ? variante : 'deploye';
  const m = modele();
  const h = 78;
  m.cylindre('tronc', 'bois', 'decor', { r0: 5, r1: 3, len: h, cotes: 5 }, { rz: 90 });
  [[0.55, 30, 35, 40], [0.7, 160, 30, 34], [0.82, 260, 40, 26]].forEach(([at, rot, tilt, len], i) => m.cylindre(`branche-${i + 1}`, 'bois', 'decor', { r0: 2.4, r1: 1, len, cotes: 4, bouchons: false }, { rz: 90 - tilt, ry: rot, t: [0, h * at, 0] }));
  const anneau = (cx, cy, cz, r, y, n, ondule, k) => [...Array(n).keys()].map((i) => {
    const a = (i / n) * Math.PI * 2;
    const o = 1 + ondule * (hash(i, k, 3) - 0.5);
    return [cx + Math.cos(a) * r * o, cy + y + (hash(i, k, 5) - 0.5) * ondule * 10, cz + Math.sin(a) * r * o];
  });
  // Voilure : dôme de 10 pans en deux couronnes (plaques orientées vers le haut), creusé et déformé.
  const voile = (cx, cy, cz, R, haut, n = 10, bas = 0) => {
    const sommet = [cx, cy + haut, cz];
    const c1 = anneau(cx, cy, cz, R * 0.55, haut * 0.7, n, 0.25, 1);
    const c2 = anneau(cx, cy, cz, R, bas, n, 0.35, 2);
    for (let i = 0; i < n; i += 1) {
      const j = (i + 1) % n;
      m.plaque(`voile-h-${i}`, 'soie', 'decor', [sommet, c1[i], c1[j]], [0, 1, 0]);
      m.plaque(`voile-b-${i}`, 'soie', 'decor', [c1[i], c2[i], c2[j], c1[j]], [0, 1, 0]);
    }
    return c2;
  };
  const suspente = (a, b, i) => {
    const d = 0.6;
    m.hexa(`suspente-${i}`, 'toile', 'decor', [[a[0] - d, a[1], a[2]], [a[0] + d, a[1], a[2]], [a[0] + d, a[1], a[2] + d], [a[0] - d, a[1], a[2] + d], [b[0] - d, b[1], b[2]], [b[0] + d, b[1], b[2]], [b[0] + d, b[1], b[2] + d], [b[0] - d, b[1], b[2] + d]]);
  };
  if (v === 'deploye') {
    const bord = voile(6, h - 14, 4, 44, 8, 10, -10);
    const harnais = [16, 26, 22];
    [0, 3, 5, 8].forEach((k, i) => suspente(bord[k], harnais, i));
    m.boite('harnais', 'toile', 'decor', [harnais[0] - 3, harnais[0] + 3], [harnais[1] - 7, harnais[1]], [harnais[2] - 2, harnais[2] + 2]);
  } else if (v === 'pendu') {
    const att = [18, h - 10, 10];
    const bas = anneau(att[0] + 6, 4, att[2] + 4, 18, 0, 8, 0.4, 4);
    const haut = anneau(att[0], att[1] - 6, att[2], 6, 0, 8, 0.2, 5);
    for (let i = 0; i < 8; i += 1) {
      const j = (i + 1) % 8;
      m.plaque(`voile-${i}`, 'soie', 'decor', [haut[i], bas[i], bas[j], haut[j]], [Math.cos(((i + 0.5) / 8) * Math.PI * 2), 0.2, Math.sin(((i + 0.5) / 8) * Math.PI * 2)]);
    }
    suspente(att, haut[0], 0);
    suspente(att, haut[4], 1);
  } else {
    const bord = voile(48, 0, 14, 38, 10, 10, 0.5);
    const att = [8, h - 14, 2];
    [2, 5, 7].forEach((k, i) => suspente([bord[k][0], bord[k][1] + 2, bord[k][2]], att, i));
  }
  return { modele: m };
}

// Barbelés : rouleaux (concertina : deux rouleaux au sol, un dessus), piquets (piquets à vis et fils croisés), rouleau simple. Long de 120 (le long de x).
export function modeleBarbeles(variante) {
  const v = ['rouleaux', 'piquets', 'simple'].includes(variante) ? variante : 'rouleaux';
  const m = modele();
  const L = 120;
  const fil = (id, a, b, e = 0.9) => m.hexa(id, 'acier', 'barbeles', [[a[0], a[1] - e, a[2] - e], [a[0], a[1] - e, a[2] + e], [a[0], a[1] + e, a[2] + e], [a[0], a[1] + e, a[2] - e], [b[0], b[1] - e, b[2] - e], [b[0], b[1] - e, b[2] + e], [b[0], b[1] + e, b[2] + e], [b[0], b[1] + e, b[2] - e]]);
  // Rouleau : spirale continue (concertina) de `n` spires à 6 côtés le long de x ; rubans tournés vers l'extérieur (la moitié haute se voit de dessus).
  const rouleau = (id, cy, cz, r, n = 6) => {
    const pas = L / n;
    const pt = (k, i) => {
      const a = (i / 6) * Math.PI * 2 + (cz | 0) * 0.3;
      const w = 1 + 0.12 * (hash(k * 6 + i, cz | 0, 8) - 0.5);
      return [-L / 2 + (k + i / 6) * pas, cy + Math.sin(a) * r * w, cz + Math.cos(a) * r * w];
    };
    for (let k = 0; k < n; k += 1) for (let i = 0; i < 6; i += 1) {
      const a = pt(k, i);
      const b = pt(k, i + 1);
      const mid = [(a[1] + b[1]) / 2 - cy, (a[2] + b[2]) / 2 - cz];
      m.plaque(`${id}-${k}-${i}`, 'acier', 'barbeles', [a, b, [b[0] + 2.2, b[1], b[2]], [a[0] + 2.2, a[1], a[2]]], [0, mid[0], mid[1]]);
    }
  };
  const piquet = (id, x, z, h = 28) => m.tronc(id, 'rouille', 'barbeles', x - 1.2, x + 1.2, { y: [0, h], z: [z - 1.2, z + 1.2] });
  if (v === 'rouleaux') {
    rouleau('r1', 8, -9, 8);
    rouleau('r2', 8, 9, 8);
    rouleau('r3', 21, 0, 8);
    [-56, 0, 56].forEach((x, i) => piquet(`piquet-${i}`, x, 0, 26));
  } else if (v === 'piquets') {
    const xs = [-56, -28, 0, 28, 56];
    xs.forEach((x, i) => piquet(`piquet-${i}`, x, 0, 30));
    for (const h of [8, 18, 28]) fil(`fil-${h}`, [-56, h, 0], [56, h, 0]);
    for (let i = 0; i + 1 < xs.length; i += 1) {
      fil(`croix-a-${i}`, [xs[i], 6, 0], [xs[i + 1], 28, 0]);
      fil(`croix-b-${i}`, [xs[i], 28, 0], [xs[i + 1], 6, 0]);
    }
  } else {
    rouleau('r1', 9, 0, 9, 7);
    [-56, 56].forEach((x, i) => piquet(`piquet-${i}`, x, 0, 22));
  }
  return { modele: m };
}

// Hérissons tchèques : trois poutrelles croisées (acier ; rouille pour la variante penchée) ; seul, rangée de 3 (espacés de 60), rouillé penché.
export function modeleHerissons(variante) {
  const v = ['seul', 'rangee', 'rouille'].includes(variante) ? variante : 'seul';
  const m = modele();
  const herisson = (id, x, z, rot, mat = 'acier', pente = 0) => {
    const l = 52;
    const e = 3;
    const t = [x, 19, z];
    m.boite(`${id}-a`, mat, 'herisson', [-l / 2, l / 2], [-e, e], [-e, e], { rz: 45, rx: pente, ry: rot, t });
    m.boite(`${id}-b`, mat, 'herisson', [-l / 2, l / 2], [-e, e], [-e, e], { rz: -45, rx: pente, ry: rot + 90, t });
    m.boite(`${id}-c`, mat, 'herisson', [-e, e], [-l / 2, l / 2], [-e, e], { rx: 45 + pente, ry: rot + 45, t });
  };
  if (v === 'rangee') [-60, 0, 60].forEach((x, i) => herisson(`h${i}`, x, (i % 2) * 6, i * 25));
  else if (v === 'rouille') herisson('h0', 0, 0, 20, 'rouille', 14);
  else herisson('h0', 0, 0, 0);
  return { modele: m };
}

// Jerrycans (35 × 16,5 × 47 cm → 10 × 5 × 13) : pile (3 dessous, 2 dessus), rangée de 5, renversés (2 debout, 2 couchés).
export function modeleJerrycans(variante) {
  const v = ['pile', 'rangee', 'renverses'].includes(variante) ? variante : 'pile';
  const m = modele();
  const bidon = (id, x, y, z, tr = {}) => {
    m.boite(`${id}`, 'jerrycan', 'bidons', [-5, 5], [0, 13], [-2.5, 2.5], { ...tr, t: [x, y, z] });
    m.boite(`${id}-poignee`, 'jerrycan', 'bidons', [-3.5, 3.5], [13, 14.6], [-1, 1], { ...tr, t: [x, y, z] });
  };
  if (v === 'pile') {
    let k = 0;
    for (const [x, y] of [[-11, 0], [0, 0], [11, 0], [-5.5, 14.6], [5.5, 14.6]]) bidon(`j${k++}`, x, y, y ? 0 : 3, { ry: 90 });
  } else if (v === 'rangee') [-24, -12, 0, 12, 24].forEach((x, i) => bidon(`j${i}`, x, 0, (i % 2) * 2, { ry: 90 + (i - 2) * 4 }));
  else {
    bidon('j0', -12, 0, -4, { ry: 80 });
    bidon('j1', 0, 0, -6, { ry: 100 });
    bidon('j2', 14, 2.5, 6, { rx: 90, ry: 35 });
    bidon('j3', -4, 2.5, 10, { rx: 90, ry: -60 });
  }
  return { modele: m };
}

// Caisses de munitions au pochoir (1,0 × 0,5 × 0,35 m → 28 × 14 × 10) : pile (deux dessous, une dessus en travers), rangée de 4, ouverte (couvercle posé).
export function modeleCaisses(variante) {
  const v = ['pile', 'rangee', 'ouverte'].includes(variante) ? variante : 'pile';
  const m = modele();
  const caisse = (id, x, y, z, ry = 0, h = 10) => m.boite(id, 'caisse', 'caisses', [-14, 14], [y, y + h], [-7, 7], { ry, t: [x, 0, z] });
  if (v === 'pile') {
    caisse('c0', 0, 0, -8);
    caisse('c1', 0, 0, 8);
    caisse('c2', 2, 10, 0, 12);
  } else if (v === 'rangee') [-45, -15, 15, 45].forEach((x, i) => caisse(`c${i}`, x, 0, (i % 2) * 3, (i - 1.5) * 3));
  else {
    caisse('c0', -10, 0, -6, 4);
    m.boite('c1', 'caisse', 'caisses', [-14, 14], [0, 7], [-7, 7], { ry: -8, t: [16, 0, 6] });
    m.boite('obus', 'acier', 'caisses', [-12, 12], [7, 9], [-5, 5], { ry: -8, t: [16, 0, 6] });
    m.boite('couvercle', 'caisse', 'caisses', [-14, 14], [0, 1.5], [-7, 7], { ry: 30, rx: 6, t: [24, 0, -14] });
  }
  return { modele: m };
}

// Trou d'obus (sol, aucune collision) : fond brûlé à plat, bourrelet de terre, bord qui retombe ; petit (rayon 30), moyen (48), double (deux petits).
export function trouObus(variante, { x = 0, y = 0 } = {}) {
  const v = ['petit', 'moyen', 'double'].includes(variante) ? variante : 'petit';
  const out = [];
  const trou = (cx, cz, R, n, seed) => {
    const rings = [[0, 0.5], [0.55, 0.5], [0.85, 3], [1.15, 0.5]];
    const at = (k, j) => {
      const a = (j / n) * Math.PI * 2;
      const w = k === 0 ? 1 : 0.85 + 0.3 * hash(j, k + seed, 2);
      return [cx + Math.cos(a) * R * rings[k][0] * w, rings[k][1] * (k === 2 ? 0.6 + 0.8 * hash(j, seed, 6) : 1), cz + Math.sin(a) * R * rings[k][0] * w];
    };
    for (let j = 0; j < n; j += 1) {
      const j1 = (j + 1) % n;
      for (let k = 0; k < rings.length - 1; k += 1) {
        const mat = k === 0 ? 'sol-brule' : 'sol-terre';
        const q = [at(k, j), at(k + 1, j), at(k + 1, j1), at(k, j1)];
        const tris = k === 0 ? [[q[0], q[1], q[2]]] : [[q[0], q[1], q[2]], [q[0], q[2], q[3]]];
        for (let p of tris) {
          let n3 = unit(cross(sub(p[1], p[0]), sub(p[2], p[0])));
          if (n3[1] < 0) {
            p = [p[0], p[2], p[1]];
            n3 = n3.map((c) => -c);
          }
          out.push({ part: `trou-${seed}`, mat, group: 'sol', p: p.map((q3) => q3.map(r3)), n: n3.map((c) => Math.round(c * 10000) / 10000), uv: p.map((q3) => [q3[0], q3[2]]) });
        }
      }
    }
  };
  if (v === 'moyen') trou(x, y, 48, 12, 1);
  else if (v === 'double') {
    trou(x - 22, y - 6, 28, 9, 2);
    trou(x + 26, y + 10, 24, 9, 3);
  } else trou(x, y, 30, 10, 4);
  return out;
}

// Poteau télégraphique (150 de haut, comme les poteaux électriques du décor vivant) : simple (une traverse, 4 isolateurs), double (deux traverses), penche
// (un poteau sur deux, rang impair, penché de 8° vers l'ouest, fils cassés).
export function modelePoteau(variante, rang = 0) {
  const v = ['simple', 'double', 'penche'].includes(variante) ? variante : 'simple';
  const m = modele();
  const h = 150;
  const pente = v === 'penche' && rang % 2 === 1 ? -8 : 0; // penché vers l'ouest (-x, rotation autour de z)
  const tr = { rz: -pente };
  m.cylindre('poteau', 'bois', 'poteau', { r0: 4.5, r1: 3.2, len: h, cotes: 5, bouchons: false }, { rz: 90 - pente });
  const traverse = (id, y) => {
    m.boite(id, 'bois', 'traverse', [-2, 2], [y - 3, y], [-26, 26], tr); // traverse en hauteur (140) : comme les pales de l'hélicoptère, sans collision
    m.boite(`${id}-iso`, 'verre', 'traverse', [-1.6, 1.6], [y, y + 4], [-22, 22], tr);
  };
  traverse('traverse-1', h - 10);
  if (v === 'double') traverse('traverse-2', h - 26);
  const a = -pente * DEG;
  const attaches = (v === 'double' ? [h - 10, h - 26] : [h - 10]).flatMap((y) => [-20, -7, 7, 20].map((z) => [r3(-Math.sin(a) * (y + 4)), r3(Math.cos(a) * (y + 4)), z]));
  return { modele: m, attaches, penche: pente !== 0 };
}

// Panneau militaire fléché : poteau et deux ou trois planches fléchées au pochoir (textes inventés), ou panneau tombé à plat (sans collision).
export function modelePanneau(variante) {
  const v = ['deux', 'trois', 'tombe'].includes(variante) ? variante : 'deux';
  const m = modele();
  const planche = (id, y, rot, tr = {}) => m.boite(id, 'panneau', 'panneau', [0, 34], [y, y + 9], [-1, 1], { ...tr, ry: rot });
  if (v === 'tombe') {
    m.boite('poteau', 'bois', 'decor', [-2, 2], [0, 14], [-2, 2]);
    m.boite('poteau-couche', 'bois', 'decor', [0, 50], [0, 4], [-2, 2], { ry: 70, t: [3, 0, 2] });
    m.boite('planche-1', 'panneau', 'decor', [0, 34], [0, 2], [-4.5, 4.5], { ry: 40, t: [10, 0, 14] });
    m.boite('planche-2', 'panneau', 'decor', [0, 34], [0, 2], [-4.5, 4.5], { ry: -30, t: [-8, 0, 20] });
  } else {
    m.tronc('poteau', 'bois', 'panneau', -2, 2, { y: [0, 56], z: [-2, 2] });
    planche('planche-1', 44, 20);
    planche('planche-2', 33, 160);
    if (v === 'trois') planche('planche-3', 22, -60);
  }
  return { modele: m };
}

// Projecteur de DCA éteint sur sa remorque, obusier de 105 abandonné (flèches ouvertes), canon antichar de 57 avec bouclier.
export function modeleArtillerie(variante) {
  const v = ['projecteur', 'obusier', 'antichar'].includes(variante) ? variante : 'projecteur';
  const m = modele();
  if (v === 'projecteur') {
    m.boite('remorque', 'olive', 'piece', [-40, 40], [10, 18], [-22, 22]);
    roues(m, [[-28, -22], [-28, 22], [28, -22], [28, 22]], 9, 6, 'pneu', 'piece');
    m.boite('fourche-g', 'olive', 'piece', [-6, 6], [18, 40], [-24, -20]);
    m.boite('fourche-d', 'olive', 'piece', [-6, 6], [18, 40], [20, 24]);
    m.cylindre('tambour', 'olive', 'piece', { r0: 19, len: 26, cotes: 8 }, { rz: 20, t: [-12, 33, 0] });
    m.cylindre('lentille', 'verre', 'piece', { r0: 17, len: 1, cotes: 8 }, { rz: 20, t: [12.4, 41.9, 0] });
    m.boite('timon', 'acier', 'piece', [40, 64], [11, 14], [-2, 2]);
  } else if (v === 'obusier') {
    m.cylindre('tube', 'olive', 'piece', { r0: 3.5, r1: 3, len: 70, cotes: 6 }, { rz: 14, t: [-5, 30, 0] });
    m.boite('berceau', 'olive', 'piece', [-24, 14], [22, 32], [-6, 6], { rz: 14 });
    m.boite('bouclier', 'olive', 'piece', [0, 2], [14, 46], [-22, 22]);
    m.boite('affut', 'olive', 'piece', [-12, 8], [12, 22], [-10, 10]);
    roues(m, [[0, -26], [0, 26]], 15, 7, 'pneu', 'piece');
    m.boite('fleche-g', 'olive', 'piece', [-80, -6], [3, 10], [-3, 3], { ry: -16 });
    m.boite('fleche-d', 'olive', 'piece', [-80, -6], [3, 10], [-3, 3], { ry: 16 });
  } else {
    m.cylindre('tube', 'olive', 'piece', { r0: 2.2, r1: 1.8, len: 76, cotes: 6 }, { rz: 4, t: [-6, 22, 0] });
    m.boite('bouclier-g', 'olive', 'piece', [0, 2], [10, 36], [-24, -2], { ry: -12 });
    m.boite('bouclier-d', 'olive', 'piece', [0, 2], [10, 36], [2, 24], { ry: 12 });
    m.boite('culasse', 'olive', 'piece', [-18, 4], [16, 26], [-5, 5]);
    roues(m, [[-4, -24], [-4, 24]], 12, 6, 'pneu', 'piece');
    m.boite('fleche-g', 'olive', 'piece', [-70, -8], [2, 8], [-2.5, 2.5], { ry: -14 });
    m.boite('fleche-d', 'olive', 'piece', [-70, -8], [2, 8], [-2.5, 2.5], { ry: 14 });
  }
  return { modele: m };
}

// --- Catalogue ------------------------------------------------------------------------------------------------------------------------------------
// type : { variantes, defaut, collision (groupes solides : rectangle dessiné de chaque groupe), budget (triangles d'une variante), clair (couleur claire ou
// vive : loin des fenêtres) }. Les noms affichés sont dans data/i18n/atelier-decor.json (dev.decor.objet.<type>, dev.decor.variante.<type>.<id>).
export const CATALOGUE = Object.freeze({
  vehicule: { variantes: ['jeep', 'kubel', 'melange'], defaut: 'melange', collision: ['caisse'], budget: 200 },
  camion: { variantes: ['dodge', 'blitz'], defaut: 'dodge', collision: ['caisse'], budget: 300 },
  vehiculeFeu: { variantes: ['jeep', 'kubel', 'dodge'], defaut: 'jeep', collision: ['caisse'], budget: 200 },
  avion: { variantes: ['p51', 'p47', 'p40'], defaut: 'p51', collision: ['fuselage', 'aile', 'queue', 'debris'], budget: 700 },
  parachute: { variantes: ['deploye', 'pendu', 'sol'], defaut: 'deploye', collision: [], budget: 200, clair: true },
  barbeles: { variantes: ['rouleaux', 'piquets', 'simple'], defaut: 'rouleaux', collision: ['barbeles'], budget: 300 },
  herissons: { variantes: ['seul', 'rangee', 'rouille'], defaut: 'rangee', collision: ['herisson'], budget: 130 },
  jerrycans: { variantes: ['pile', 'rangee', 'renverses'], defaut: 'pile', collision: ['bidons'], budget: 120 },
  caisses: { variantes: ['pile', 'rangee', 'ouverte'], defaut: 'pile', collision: ['caisses'], budget: 80 },
  trouObus: { variantes: ['petit', 'moyen', 'double'], defaut: 'moyen', collision: [], budget: 120 },
  poteau: { variantes: ['simple', 'double', 'penche'], defaut: 'simple', collision: ['poteau'], budget: 60 },
  panneau: { variantes: ['deux', 'trois', 'tombe'], defaut: 'deux', collision: ['panneau'], budget: 60, clair: true },
  artillerie: { variantes: ['projecteur', 'obusier', 'antichar'], defaut: 'projecteur', collision: ['piece'], budget: 300 },
});
export const TYPES = Object.freeze(Object.keys(CATALOGUE));

// Fichier de choix (data/game/decor-epoque-choix.json) : { variantes: { type: id }, gardes: { type: bool } } ; toute entrée invalide = défaut.
export function lireChoix(json) {
  const variantes = {};
  const gardes = {};
  for (const type of TYPES) {
    const v = json?.variantes?.[type];
    variantes[type] = CATALOGUE[type].variantes.includes(v) ? v : CATALOGUE[type].defaut;
    gardes[type] = typeof json?.gardes?.[type] === 'boolean' ? json.gardes[type] : true;
  }
  return { variantes, gardes };
}

// Modèle d'une variante, posé dans le monde : spec { x, y (centre, unités du jeu), cap (degrés), L, l (véhicules) }. → { triangles, ... } (voir objet()).
function construire(type, variante, spec = {}) {
  const v = CATALOGUE[type]?.variantes.includes(variante) ? variante : CATALOGUE[type]?.defaut;
  if (type === 'trouObus') return { triangles: trouObus(v, { x: num(spec.x), y: num(spec.y) }), feux: [] };
  let res;
  if (type === 'vehicule') res = modeleVehicule(v === 'melange' ? (num(spec.rang) % 2 ? 'kubel' : 'jeep') : v, { L: num(spec.L, 92), l: num(spec.l, 46) });
  else if (type === 'vehiculeFeu') res = modeleVehicule(v, { L: num(spec.L, v === 'dodge' ? 120 : 92), l: num(spec.l, v === 'dodge' ? 56 : 46), brule: true });
  else if (type === 'camion') res = modeleVehicule(v, { L: v === 'blitz' ? 150 : 120, l: v === 'blitz' ? 58 : 56 });
  else if (type === 'avion') res = modeleAvion(v);
  else if (type === 'parachute') res = modeleParachute(v);
  else if (type === 'barbeles') res = modeleBarbeles(v);
  else if (type === 'herissons') res = modeleHerissons(v);
  else if (type === 'jerrycans') res = modeleJerrycans(v);
  else if (type === 'caisses') res = modeleCaisses(v);
  else if (type === 'poteau') res = modelePoteau(v, num(spec.rang));
  else if (type === 'panneau') res = modelePanneau(v);
  else res = modeleArtillerie(v);
  const a = num(spec.cap) * DEG;
  const x = num(spec.x);
  const y = num(spec.y);
  const move = (p) => {
    const q = rotY(p, a);
    return [r3(q[0] + x), q[1], r3(q[2] + y)];
  };
  let local = trianguler(res.modele);
  // Véhicules : le dessin entier est centré sur le rectangle (roue de secours comprise), feux décalés de même.
  let dx = 0;
  let dz = 0;
  if (res.centrer && local.length) {
    const b = bornes(local);
    dx = -(b.x0 + b.x1) / 2;
    dz = -(b.z0 + b.z1) / 2;
    local = local.map((t) => ({ ...t, p: t.p.map((p) => [r3(p[0] + dx), p[1], r3(p[2] + dz)]) }));
  }
  const tris = local.map((t) => ({ ...t, p: t.p.map(move), n: rotY(t.n, a).map((c) => Math.round(c * 10000) / 10000) }));
  const feux = (res.feux ?? []).map((f) => {
    const q = move([f.x + dx, f.y, f.z + dz]);
    return { ...f, x: q[0], y: q[1], z: q[2] };
  });
  return { triangles: tris, feux, attaches: res.attaches ? res.attaches.map(move) : null, penche: res.penche === true };
}

// Objet posé : { type, variante, triangles, compte, hauteur, emprise, rects: [{ id, x, y, w, h, hauteur, tirs: 'passent' | 'arretes' }], collision, feux }.
// Chaque groupe solide bloque tout son rectangle dessiné ; ses tirs passent s'il est dessiné plus bas que l'arme (43).
export function objet(type, variante, spec = {}) {
  const cat = CATALOGUE[type];
  if (!cat) return null;
  const v = cat.variantes.includes(variante) ? variante : cat.defaut;
  const res = construire(type, v, spec);
  const id = typeof spec.id === 'string' ? spec.id : type;
  const rects = cat.collision.map((g) => {
    const sel = res.triangles.filter((t) => t.group === g);
    const r = rectDe(sel);
    if (!r) return null;
    const hauteur = Math.ceil(bornes(sel).y1);
    return { id: `${id}-${g}`, ...r, hauteur, tirs: hauteur < HAUTEUR_ARME ? 'passent' : 'arretes' };
  }).filter(Boolean);
  const b = res.triangles.length ? bornes(res.triangles) : null;
  return {
    id, type, variante: v, triangles: res.triangles, compte: res.triangles.length, hauteur: b ? Math.ceil(b.y1) : 0, emprise: rectDe(res.triangles), rects,
    collision: rects.length > 0, sol: type === 'trouObus', feux: res.feux, attaches: res.attaches, penche: res.penche,
  };
}

// --- Placement sur la carte -----------------------------------------------------------------------------------------------------------------------
// placements : data/game/maps/<carte>/decor-epoque.json → objets ; decor : sortie de generateDecor (voitures, épaves) ; lively : sortie de
// generateLivelyDecor (poteaux électriques) ; choix : lireChoix. Remplacements : « voitures » (les voitures abandonnées, mêmes rectangles),
// « voiture-en-flammes » (même centre), « poteaux-electriques » (mêmes pieds, fils entre poteaux voisins). Objets non gardés : absents.
export function objetsPlaces(doc, { decor, lively, choix } = {}) {
  const ch = choix ?? lireChoix(null);
  const out = [];
  // Chaque objet garde sa spec (x, y, cap, L, l, rang, id) : la partie le reconstruit à l'identique (objet() est déterministe).
  const poser = (type, v, spec, extra = {}) => out.push({ ...objet(type, v, spec), spec, ...extra });
  const liste = Array.isArray(doc?.objets) ? doc.objets : [];
  for (const it of liste) {
    if (!it || !CATALOGUE[it.type] || ch.gardes[it.type] === false) continue;
    const v = CATALOGUE[it.type].variantes.includes(it.variante) ? it.variante : ch.variantes[it.type];
    if (it.remplace === 'voitures') {
      (decor?.cars ?? []).filter((c) => c.burning !== true).forEach((c, i) => poser(it.type, v, { id: `${it.id}-${i + 1}`, x: c.x + c.w / 2, y: c.y + c.h / 2, L: c.w, l: c.h, rang: i }, { remplace: c.id }));
    } else if (it.remplace === 'voiture-en-flammes') {
      const c = (decor?.cars ?? []).find((q) => q.burning === true);
      if (c) poser(it.type, v, { id: it.id, x: c.x + c.w / 2, y: c.y + c.h / 2 }, { remplace: c.id, flammes: true });
    } else if (it.remplace === 'poteaux-electriques') {
      const poles = Array.isArray(lively?.poles) ? lively.poles : [];
      poles.forEach((p, i) => poser(it.type, v, { id: `${it.id}-${i + 1}`, x: p.x, y: p.y, cap: num(it.cap), rang: i }, { remplace: p.id ?? `poteau-${i + 1}` }));
    } else if (isNum(it.x) && isNum(it.y)) {
      poser(it.type, v, { id: String(it.id ?? it.type), x: it.x, y: it.y, cap: num(it.cap) }, { ...(it.remplace ? { remplace: it.remplace } : {}), ...(it.fumee ? { fumee: true } : {}), ...(it.cratere ? { cratere: { ...it.cratere } } : {}), ...(it.trainee ? { trainee: { ...it.trainee } } : {}) });
    }
  }
  return out;
}

// Fils télégraphiques entre poteaux voisins (même ligne) : segments [{ a: [x, y, z], b: [x, y, z] }] des attaches d'un poteau à celles du suivant.
export function filsTelegraphe(objets) {
  const poteaux = objets.filter((o) => o.type === 'poteau' && Array.isArray(o.attaches)).sort((a, b) => a.emprise.x - b.emprise.x);
  const fils = [];
  for (let i = 0; i + 1 < poteaux.length; i += 1) {
    const a = poteaux[i].attaches;
    const b = poteaux[i + 1].attaches;
    const n = Math.min(a.length, b.length, 4);
    for (let k = 0; k < n; k += 1) fils.push({ a: a[k], b: b[k], casse: (poteaux[i].penche || poteaux[i + 1].penche) && k % 2 === 1 });
  }
  return fils;
}

// Triangles des fils (rubans fins, tournés vers le haut et sur le côté ; un fil cassé pend vers le sol).
export function trianglesFils(fils) {
  const m = modele();
  fils.forEach((f, i) => {
    const b = f.casse ? [f.a[0] + (f.b[0] - f.a[0]) * 0.3, 4, f.a[2] + (f.b[2] - f.a[2]) * 0.3] : f.b;
    const e = 0.5;
    m.hexa(`fil-${i}`, 'pneu', 'fils', [[f.a[0], f.a[1] - e, f.a[2] - e], [f.a[0], f.a[1] - e, f.a[2] + e], [f.a[0], f.a[1] + e, f.a[2] + e], [f.a[0], f.a[1] + e, f.a[2] - e], [b[0], b[1] - e, b[2] - e], [b[0], b[1] - e, b[2] + e], [b[0], b[1] + e, b[2] + e], [b[0], b[1] + e, b[2] - e]]);
  });
  return trianguler(m).filter((t) => Math.abs(t.n[0]) < 0.9);
}

// Contrôles du plan (liste de textes, vide si tout va bien) : ctx { size, footprint (bâtiment), corridors, spawnPoints, windows, solides (décor gardé :
// arbres, voitures non remplacées), regles: { couloir 20, apparition 70, batiment 160, bord 40, clair 300 } }. Les objets remplaçants gardent la place
// de ce qu'ils remplacent (pas de règle de distance au bâtiment) ; l'avion suit la règle du bord (40) comme l'hélicoptère.
export function problemesPlacement(objets, ctx = {}) {
  const r = { couloir: 20, apparition: 70, batiment: 160, bord: 40, clair: 300, ...(ctx.regles ?? {}) };
  const W = num(ctx.size?.width);
  const H = num(ctx.size?.height);
  const fp = Array.isArray(ctx.footprint) ? ctx.footprint : [];
  const out = [];
  const solides = Array.isArray(ctx.solides) ? ctx.solides : [];
  const tous = objets.flatMap((o) => o.rects.map((q) => ({ ...q, objet: o })));
  for (const o of objets) {
    const zone = o.emprise;
    if (!zone) continue;
    const cibles = o.collision ? o.rects : o.sol ? [zone] : [];
    for (const q of cibles) {
      if (!(q.x >= 0 && q.y >= 0 && q.x + q.w <= W && q.y + q.h <= H)) out.push(`${q.id ?? o.id} sort du monde`);
      for (const c of ctx.corridors ?? []) if (rectGap(q, c) < (o.sol ? 0.001 : r.couloir)) out.push(`${o.id} entre dans le couloir de ${c.id}`);
      for (const p of ctx.spawnPoints ?? []) if (rectGap(q, { x: p.x, y: p.y, w: 1, h: 1 }) < r.apparition) out.push(`${o.id} trop près de ${p.id}`);
      const gap = fp.length ? Math.min(...fp.map((f) => rectGap(q, f))) : Infinity;
      if (o.type === 'avion' ? gap < r.bord : !o.remplace && !o.sol && gap < r.batiment) out.push(`${o.id} trop près du bâtiment (${Math.round(gap)})`);
      for (const s of solides) if (rectGap(q, s) < 10) out.push(`${o.id} touche ${s.id}`);
      for (const t of tous) if (t.objet !== o && rectGap(q, t) < 10 && o.id < t.objet.id) out.push(`${o.id} touche ${t.objet.id}`);
    }
    if (CATALOGUE[o.type]?.clair) for (const w of ctx.windows ?? []) if (rectGap(zone, { x: w.x, y: w.y, w: 1, h: 1 }) < r.clair) out.push(`${o.id} (clair) trop près de la fenêtre ${w.id}`);
  }
  return [...new Set(out)];
}

// Chemins des zombies : pour chaque point d'apparition, chemin du champ de flux de sa fenêtre (nav.js : grille extérieure, ouvertures fermées) avant
// (obstacles du jeu) et après (sans les rectangles remplacés, avec ceux des objets d'époque). layout : buildLayout ; geoms : windowGeometries ;
// retires : ids des solides remplacés ; ajoutes : rectangles ajoutés ; grille : nav.json (cell, inflate) et rayon du zombie.
export function cheminsZombies({ layout, geoms, retires = [], ajoutes = [], grille = {} } = {}) {
  const opts = { cell: num(grille.cell, 20), radius: num(grille.radius, 20), inflate: num(grille.inflate, 4) };
  const base = [...(layout?.zombieObstacles ?? []), ...(layout?.gaps ?? [])];
  const apres = [...base.filter((s) => !retires.includes(s.id)), ...ajoutes];
  const gAvant = createGrid(layout?.size, base, opts);
  const gApres = createGrid(layout?.size, apres, opts);
  const champs = new Map();
  for (const g of geoms ?? []) if (g?.entryOuter) champs.set(g.id, { avant: buildFlow(gAvant, g.entryOuter), apres: buildFlow(gApres, g.entryOuter) });
  const r0 = (v) => (Number.isFinite(v) ? Math.round(v) : null);
  return (layout?.spawnPoints ?? []).map((p) => {
    const f = champs.get(p.window ?? p.fenetre);
    if (!f) return { id: p.id, fenetre: p.window ?? p.fenetre, avant: null, apres: null, coupe: true };
    const la = pathLength(gAvant, f.avant, p);
    const lb = pathLength(gApres, f.apres, p);
    return {
      id: p.id, fenetre: p.window ?? p.fenetre, x: p.x, y: p.y,
      avant: { longueur: r0(la), points: flowPath(gAvant, f.avant, p) }, apres: { longueur: r0(lb), points: flowPath(gApres, f.apres, p) },
      coupe: !Number.isFinite(lb),
    };
  });
}

// Budget du plan : triangles ajoutés (objets et fils), retirés (hélicoptère, voitures, poteaux électriques : valeurs mesurées sur origin/dev passées en
// argument) et solde. → { ajoutes, retires, solde, parType }.
export function budgetPlan(objets, fils = [], retires = 0) {
  const parType = {};
  for (const o of objets) parType[o.type] = (parType[o.type] ?? 0) + o.compte;
  const ajoutes = objets.reduce((s, o) => s + o.compte, 0) + trianglesFils(fils).length;
  return { ajoutes, retires, solde: ajoutes - retires, parType };
}

// Contrôle complet du plan (npm run carte, tests, atelier) : décor du jeu (buildLayout), décor vivant, objets d'époque avec les variantes choisies, problèmes
// de placement (et, si toutesVariantes, ceux de chaque variante de chaque objet, pour que tout choix du propriétaire soit valable), chemins des zombies.
// entree : { world, decorCfg (decor.json de la carte), doc (decor-epoque.json de la carte), choixJson, geometries (layout → windowGeometries de windows.js,
// passée par l'appelant : ce module ne dépend pas du siège), navCfg (nav.json), rayon (zombie), toutesVariantes }. → { layout, decor, lively, objets, fils, remplaces, problemes, chemins, retires, ajoutes }.
export function controlePlan({ world, decorCfg, doc, choixJson = null, geometries = () => [], navCfg = null, rayon = 20, toutesVariantes = true } = {}) {
  // Plan comparé au décor d'avant : la clé epoque de decor.json (écrite par npm run carte) est ignorée ici.
  const base = { ...(decorCfg ?? {}) };
  delete base.epoque;
  const layout = buildLayout(world, base);
  const decor = layout.decor;
  const lively = generateLivelyDecor({ size: world?.size, footprint: layout.floor, decor });
  const verifier = (choix) => {
    const objets = objetsPlaces(doc, { decor, lively, choix });
    const remplaces = new Set(objets.map((o) => o.remplace).filter(Boolean));
    const solides = (decor?.solids ?? []).filter((q) => !remplaces.has(q.id) && q.kind !== 'helicoptere');
    const problemes = problemesPlacement(objets, { size: world?.size, footprint: layout.floor, corridors: decor?.corridors, spawnPoints: decor?.spawnPoints, windows: world?.windows, solides });
    return { objets, remplaces, problemes };
  };
  const choix = lireChoix(choixJson);
  const res = verifier(choix);
  const problemes = [...res.problemes];
  if (toutesVariantes) for (const type of TYPES) for (const v of CATALOGUE[type].variantes) {
    if (v === choix.variantes[type]) continue;
    for (const pb of verifier({ ...choix, variantes: { ...choix.variantes, [type]: v } }).problemes) problemes.push(`variante ${type}/${v} : ${pb}`);
  }
  const retires = (decor?.solids ?? []).filter((q) => q.kind === 'helicoptere' || res.remplaces.has(q.id)).map((q) => q.id);
  const ajoutes = res.objets.flatMap((o) => o.rects);
  const geoms = typeof geometries === 'function' ? geometries(layout) : [];
  const chemins = cheminsZombies({ layout, geoms, retires, ajoutes, grille: { ...(navCfg ?? {}), radius: rayon } });
  for (const c of chemins) if (c.coupe) problemes.push(`chemin coupé : ${c.id} → ${c.fenetre}`);
  return { layout, decor, lively, objets: res.objets, fils: filsTelegraphe(res.objets), remplaces: [...res.remplaces], problemes: [...new Set(problemes)], chemins, retires, ajoutes };
}

// Lot 9h-C : section « epoque » de decor.json (npm run carte, jamais éditée à la main) : objets retenus (type, variante, spec, rectangles, emprise, hauteur,
// triangles), ce qu'ils remplacent, couleurs (mélanges de jetons, data/game/decor-epoque.json), cicatrices au sol de l'avion (boîtes plates).
// ctl : sortie de controlePlan ; footprint : rectangles du bâtiment ; scars : fonction (spec) → { boxes } (groundScarBoxes de epaves.js).
export function sectionEpoque(ctl, { couleurs = {}, footprint = [], scars = null } = {}) {
  const objets = ctl.objets.map((o) => ({
    id: o.id, type: o.type, variante: o.variante, spec: { ...o.spec }, ...(o.remplace ? { remplace: o.remplace } : {}), ...(o.fumee ? { fumee: true } : {}),
    ...(o.cratere ? { cratere: { ...o.cratere } } : {}), ...(o.trainee ? { trainee: { ...o.trainee } } : {}), ...(o.flammes ? { flammes: true } : {}),
    hauteur: o.hauteur, emprise: { ...o.emprise }, collision: o.collision, sol: o.sol, triangles: o.compte, rects: o.rects.map((r) => ({ ...r })),
  }));
  const avion = objets.find((o) => o.type === 'avion' && o.cratere);
  const cicatrices = avion && typeof scars === 'function' ? scars(specCratere(avion), footprint).boxes : [];
  return { couleurs: JSON.parse(JSON.stringify(couleurs)), objets, remplaces: [...ctl.remplaces], cicatrices, triangles: objets.reduce((s, o) => s + o.triangles, 0) + trianglesFils(ctl.fils).length };
}

// Spec du cratère et de la traînée de l'avion (même forme que l'hélicoptère de epaves.js : unités du jeu, cap = heading).
export function specCratere(o) {
  return { x: num(o?.spec?.x), y: num(o?.spec?.y), heading: num(o?.spec?.cap), crater: { rx: num(o?.cratere?.rx), ry: num(o?.cratere?.ry) }, trail: { length: num(o?.trainee?.longueur), width: num(o?.trainee?.largeur) } };
}

// Objets de la section epoque reconstruits (triangles compris) pour le dessin ; mêmes rectangles que ceux écrits par npm run carte.
export function objetsDeSection(epoque) {
  return (Array.isArray(epoque?.objets) ? epoque.objets : []).filter((o) => o && CATALOGUE[o.type]).map((o) => ({ ...objet(o.type, o.variante, { ...o.spec, id: o.id }), spec: o.spec, remplace: o.remplace ?? null, fumee: o.fumee === true, cratere: o.cratere ?? null, trainee: o.trainee ?? null, flammes: o.flammes === true }));
}
