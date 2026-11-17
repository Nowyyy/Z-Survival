// Lot 9c — Caisse d'armes (achat sur la carte, aperçu seulement) : deux variantes, caisse militaire en bois ouverte (couvercle posé de
// travers à côté) et râtelier mural bas ; pièces en unités du jeu (repère : z = longueur, x = profondeur, le mur du râtelier en −x),
// texture propre 256 × 256 générée en code (planches peintes, marquage au pochoir inventé, intérieur, paille, ferrures, corde, craie).
// Pur : aucune image, aucun Three.js ; hauteur dessinée sous 43 (arme posée comprise : tirs par-dessus, lot 8j).
import { maillage } from './geometrie.js';
import { hash } from './atlas.js';

export const TAILLE = 256;
export const HAUTEUR_ARME_JOUEUR = 43;
export const TYPES = Object.freeze(['caisse', 'ratelier']);
// Pochoirs (lettres et chiffres inventés, aucune marque réelle).
export const POCHOIRS = Object.freeze({ couvercle: 'ARMES Z-7', cote: 'LOT 44-C 1/1', plaque: 'N 3' });

// Régions de la texture : nom → [x, y, w, h] en pixels.
const REGIONS = Object.freeze({
  couvercle: [0, 0, 256, 64], cote: [0, 64, 256, 64],
  planche: [0, 128, 64, 64], interieur: [64, 128, 64, 64], paille: [128, 128, 64, 64], ferrure: [192, 128, 64, 64],
  corde: [0, 192, 64, 64], craie: [64, 192, 64, 64], ratelier: [128, 192, 64, 64], plaque: [192, 192, 64, 64],
});
export const rectRegion = (nom) => {
  const [x, y, w, h] = REGIONS[nom] ?? REGIONS.planche;
  return [(x + 2) / TAILLE, (y + 2) / TAILLE, (x + w - 2) / TAILLE, (y + h - 2) / TAILLE];
};

// Police au pochoir 5 × 7 (lignes de bits, bit de poids fort à gauche) ; les pochoirs ont des ponts : quelques pixels retirés au rendu.
const GLYPHES = {
  A: [14, 17, 17, 31, 17, 17, 17], B: [30, 17, 17, 30, 17, 17, 30], C: [14, 17, 16, 16, 16, 17, 14], E: [31, 16, 16, 30, 16, 16, 31],
  L: [16, 16, 16, 16, 16, 16, 31], M: [17, 27, 21, 21, 17, 17, 17], N: [17, 25, 21, 19, 17, 17, 17], O: [14, 17, 17, 17, 17, 17, 14],
  R: [30, 17, 17, 30, 20, 18, 17], S: [15, 16, 16, 14, 1, 1, 30], T: [31, 4, 4, 4, 4, 4, 4], Z: [31, 1, 2, 4, 8, 16, 31],
  0: [14, 17, 19, 21, 25, 17, 14], 1: [4, 12, 4, 4, 4, 4, 14], 3: [30, 1, 1, 14, 1, 1, 30], 4: [2, 6, 10, 18, 31, 2, 2], 7: [31, 1, 2, 4, 8, 8, 8],
  '-': [0, 0, 0, 31, 0, 0, 0], '/': [1, 1, 2, 4, 8, 16, 16], ' ': [0, 0, 0, 0, 0, 0, 0],
};
// Pixel allumé du texte à la position (px, py) dans une boîte (largeur w, hauteur h), échelle k, centré.
function texteAllume(texte, px, py, w, h, k) {
  const largeur = texte.length * 6 * k - k;
  const x0 = Math.floor((w - largeur) / 2);
  const y0 = Math.floor((h - 7 * k) / 2);
  const gx = Math.floor((px - x0) / k);
  const gy = Math.floor((py - y0) / k);
  if (px < x0 || gy < 0 || gy > 6) return false;
  const c = Math.floor(gx / 6);
  const col = gx % 6;
  if (c >= texte.length || col === 5) return false;
  if (gy === 3 && col === 2 && texte[c] !== '-') return false; // pont du pochoir
  return Boolean(((GLYPHES[texte[c]] ?? GLYPHES[' '])[gy] >> (4 - col)) & 1);
}

const GRIS = [128, 128, 128];
const col = (p, n) => (Array.isArray(p?.[n]) ? p[n] : GRIS);
const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

// Planches peintes (joints tous les `pas` pixels en y, grain en x) ; région de taille w × h.
function planche(x, y, p, pas, clair = 'caisse', sombre = 'caisse-sombre') {
  const joint = y % pas < 1;
  const g = 0.5 + 0.5 * Math.sin(y * 1.3 + hash(Math.floor(x / 6), Math.floor(y / pas), 3) * 6);
  const ecaille = hash(x >> 1, y >> 1, 7) > 0.94 ? 0.5 : 0;
  return mix(col(p, clair), col(p, sombre), joint ? 0.85 : Math.min(1, g * 0.25 + hash(x, y, 1) * 0.12 + ecaille));
}

// Texture de la caisse : { width, height, data (RGBA), octets } ; la craie a une transparence (canal alpha), le reste est opaque.
export function genererTextureCaisse(palette) {
  const data = new Uint8Array(TAILLE * TAILLE * 4);
  const ecrire = (x, y, c, a = 255) => {
    const k = (y * TAILLE + x) * 4;
    for (let i = 0; i < 3; i += 1) data[k + i] = Math.max(0, Math.min(255, Math.round(c[i])));
    data[k + 3] = a;
  };
  for (const [nom, [rx, ry, rw, rh]] of Object.entries(REGIONS)) {
    for (let y = 0; y < rh; y += 1) {
      for (let x = 0; x < rw; x += 1) {
        let c;
        let a = 255;
        if (nom === 'couvercle' || nom === 'cote') {
          c = planche(x, y, palette, 21);
          const texte = nom === 'couvercle' ? POCHOIRS.couvercle : POCHOIRS.cote;
          // Sens de lecture une fois posée (caisse tournée de −90° : u vers l'ouest) : couvercle vu de dessus = miroir en x ; côté vu de face = demi-tour.
          const [tx, ty] = nom === 'couvercle' ? [rw - 1 - x, y] : [rw - 1 - x, rh - 1 - y];
          if (texteAllume(texte, tx, ty, rw, rh, nom === 'couvercle' ? 4 : 3) && hash(x, y, 11) > 0.12) c = mix(col(palette, 'pochoir'), c, 0.15);
        } else if (nom === 'planche') c = planche(x, y, palette, 21);
        else if (nom === 'interieur') c = mix(col(palette, 'interieur'), col(palette, 'caisse-sombre'), hash(x >> 1, y, 5) * 0.4);
        else if (nom === 'paille') {
          const brin = Math.abs(Math.sin(x * 0.7 + y * 2.3 + hash(x >> 2, y >> 3, 2) * 9));
          c = mix(col(palette, 'paille'), col(palette, 'interieur'), brin > 0.6 ? 0.1 : 0.6);
        } else if (nom === 'ferrure') {
          const rivet = ((x % 16) - 8) ** 2 + ((y % 16) - 8) ** 2 < 6;
          c = mix(col(palette, 'bruni'), col(palette, 'rouille'), rivet ? 0.1 : hash(x >> 1, y >> 1, 4) * 0.5);
        } else if (nom === 'corde') {
          const torsade = 0.5 + 0.5 * Math.sin((x + y) * 0.9);
          c = mix(col(palette, 'toile'), col(palette, 'toile-trame'), torsade * 0.6);
        } else if (nom === 'craie') {
          // Trait de craie irrégulier : poudre plus dense au milieu de la bande, trouée.
          const milieu = 1 - Math.abs(y - rh / 2) / (rh / 2);
          const grain = hash(x, y, 13);
          a = Math.round(255 * Math.max(0, Math.min(1, milieu * 1.6 - 0.35)) * (grain > 0.25 ? 1 : 0.2));
          c = col(palette, 'craie');
        } else if (nom === 'ratelier') c = planche(y, x, palette, 64, 'ratelier', 'ratelier-sombre');
        else {
          c = planche(x, y, palette, 64, 'ratelier', 'ratelier-sombre');
          if (texteAllume(POCHOIRS.plaque, rw - 1 - x, rh - 1 - y, rw, rh, 3)) c = mix(col(palette, 'pochoir'), c, 0.15);
        }
        ecrire(rx + x, ry + y, c, a);
      }
    }
  }
  return { width: TAILLE, height: TAILLE, data, octets: data.length };
}

const B = (w, h, l, pos, mat, extra = {}) => ({ forme: 'boite', w, h, l, pos, mat, ...extra });

// Dimensions (unités du jeu) d'une caisse, lues dans les données ({ id, dimensions: { l, p, h, appui } }) avec des défauts.
// longueurMin (lot 9c-G) : la caisse s'allonge pour l'arme la plus longue (plus 6 de marge) si l'échelle choisie la rend trop courte.
export function dimensionsCaisse(caisses, type, longueurMin = 0) {
  const c = (Array.isArray(caisses) ? caisses : []).find((x) => x?.id === type)?.dimensions ?? {};
  const d = type === 'ratelier' ? { l: 72, p: 16, h: 28, appui: 20 } : { l: 70, p: 30, h: 22, appui: 21 };
  for (const k of Object.keys(d)) if (Number.isFinite(c[k])) d[k] = c[k];
  if (Number.isFinite(longueurMin) && longueurMin + 6 > d.l) d.l = Math.ceil(longueurMin + 6);
  return d;
}

// Pièces d'une caisse (unités du jeu) ; appui = hauteur où l'arme se pose.
export function piecesCaisse(type, d) {
  const { l, p, h } = d;
  if (type === 'ratelier') {
    const z = l / 2 - 14;
    return [
      B(3, h, l, [-p / 2 + 1.5, h / 2, 0], 'ratelier'), // planche de fond, contre le mur
      B(p, 3, l, [0, 1.5, 0], 'ratelier'), // socle
      B(1.5, 6, 22, [p / 2 - 0.75, 3, 0], 'plaque'), // plaque au pochoir
      ...[-z, z].flatMap((zz) => [
        B(p - 3, 3, 4, [1.5, d.appui - 1.5, zz], 'ratelier'), // bras
        B(2, 5, 4, [p / 2 - 1, d.appui + 1, zz], 'ratelier'), // butée avant du bras
        B(3, d.appui, 4, [-p / 2 + 4, d.appui / 2, zz], 'ratelier'), // montant
      ]),
      B(2, 2, l - 4, [-p / 2 + 3.5, h - 3, 0], 'ferrure'), // barre de fixation
    ];
  }
  const t = 2;
  return [
    B(p, t, l, [0, t / 2, 0], 'planche'), // fond
    B(t, h - t, l, [p / 2 - t / 2, h / 2 + t / 2, 0], 'cote'), // côté avant (marqué)
    B(t, h - t, l, [-p / 2 + t / 2, h / 2 + t / 2, 0], 'planche'),
    B(p - 2 * t, h - t, t, [0, h / 2 + t / 2, l / 2 - t / 2], 'planche'),
    B(p - 2 * t, h - t, t, [0, h / 2 + t / 2, -l / 2 + t / 2], 'planche'),
    B(p - 2 * t, 2, l - 2 * t, [0, h * 0.62, 0], 'paille'), // calage de paille
    ...[-1, 1].map((s) => B(p - 2 * t, 3, 5, [0, d.appui - 1.5, s * (l / 2 - 14)], 'interieur')), // traverses d'appui
    ...[[-1, -1], [-1, 1], [1, -1], [1, 1]].map(([sx, sz]) => B(3, h + 0.5, 3, [sx * (p / 2 - 1), (h + 0.5) / 2, sz * (l / 2 - 1)], 'ferrure')), // cornières
    ...[-1, 1].map((s) => B(8, 2, 1.5, [0, h * 0.6, s * (l / 2 + 0.75)], 'corde')), // poignées de corde
    B(p, 2, l, [p + 4, 1, 4], 'couvercle', { rot: [0, 12, 0] }), // couvercle posé de travers, à côté
    ...[-1, 1].map((s) => B(p, 1, 5, [p + 4 + Math.sin(0.21) * s * (l / 2 - 6), 2.5, 4 + Math.cos(0.21) * s * (l / 2 - 6)], 'planche', { rot: [0, 12, 0] })), // tasseaux du couvercle
  ];
}

// Contour à la craie au sol autour de l'empreinte (marge m) : quatre bandes à plat, rôle « craie ».
export function piecesCraie(type, d, m = 8) {
  const pz = type === 'caisse' ? d.p * 2 + 8 : d.p; // la caisse ouverte occupe aussi la place du couvercle
  const cx = type === 'caisse' ? (d.p + 8) / 2 : 0;
  const L = d.l + 2 * m + (type === 'caisse' ? 10 : 0);
  const P = pz + 2 * m;
  const e = 4;
  return [
    B(P, 0.2, e, [cx, 0.4, L / 2], 'craie'), B(P, 0.2, e, [cx, 0.4, -L / 2], 'craie'),
    B(e, 0.2, L, [cx + P / 2, 0.4, 0], 'craie'), B(e, 0.2, L, [cx - P / 2, 0.4, 0], 'craie'),
  ];
}

// Maillage d'une caisse (ou de sa craie) : coordonnées de texture dans les régions ci-dessus.
export function maillageCaisse(type, d, { craie = false } = {}) {
  const pieces = craie ? piecesCraie(type, d) : piecesCaisse(type, d);
  return maillage(pieces, { echelle: 1, tuile: rectRegion, teinte: () => [1, 1, 1] });
}

// Point d'ancrage du texte d'achat (au-dessus du centre de la caisse) et hauteur d'appui de l'arme.
export const ancreTexte = (d) => [0, d.h + 24, 0];
