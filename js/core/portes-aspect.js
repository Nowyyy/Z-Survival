// Lot 3g (retours du propriétaire) : aspect des portes, des escaliers fermés et des grilles, en boîtes alignées sur les axes (le dessin seulement :
// les collisions, les balles et le laser gardent les rectangles de zones.json et world.json).
// - Porte dans un mur : une vraie porte de planches (montants, traverse haute, planches verticales, deux barres de renfort sur chaque face, poignée, gonds).
// - Bloc d'escalier fermé : un éboulis (blocs de pierre empilés, plus hauts au milieu, poutres et planches en travers) qui remplit l'emprise du bloc.
// - Grille : barreaux verticaux et deux traverses dans une ouverture du mur (là où le modèle n'a pas de mur : à côté de F8, à la place de F7).
// Déterministe (variations tirées de l'identifiant), aucune exception sur des entrées inattendues, aucune boîte au-dessus de la hauteur donnée.
import { isNum, num } from './vec.js';
import { REGIONS, unitHash } from './mobilier-aspect.js';

const r2 = (v) => Math.round(num(v) * 100) / 100;
const box = (x0, x1, z0, z1, y0, y1, region, faces = 'tout') => ({ x0: r2(x0), x1: r2(x1), y0: r2(y0), y1: r2(y1), z0: r2(z0), z1: r2(z1), region, faces });
const okRect = (r) => r !== null && typeof r === 'object' && [r.x, r.y, r.w, r.h].every(isNum) && r.w > 0 && r.h > 0;

// Repère d'un rectangle allongé : `along` le grand côté, `across` le petit ; place(a0, a1, c0, c1, y0, y1) rend une boîte du monde.
function frame(r) {
  const long = r.w >= r.h;
  const len = long ? r.w : r.h;
  const thick = long ? r.h : r.w;
  const place = (a0, a1, c0, c1, y0, y1, region, faces) => (long
    ? box(r.x + a0, r.x + a1, r.y + c0, r.y + c1, y0, y1, region, faces)
    : box(r.x + c0, r.x + c1, r.y + a0, r.y + a1, y0, y1, region, faces));
  return { len, thick, place };
}

// Porte de planches dans l'ouverture r (rectangle du dessin, épaisseur du mur), de hauteur h.
export function doorBoxes(r, h, id = '') {
  if (!okRect(r) || !isNum(h) || h <= 4) return [];
  const { len, thick, place } = frame(r);
  const out = [];
  const jamb = Math.min(6, len / 6);
  const head = Math.min(6, h / 8);
  // Encadrement : deux montants et une traverse haute, de toute l'épaisseur.
  out.push(place(0, jamb, 0, thick, 0, h, REGIONS.planche), place(len - jamb, len, 0, thick, 0, h, REGIONS.planche), place(jamb, len - jamb, 0, thick, h - head, h, REGIONS.planche));
  // Battant : planches verticales (un peu de jeu entre elles), au milieu de l'épaisseur.
  const leaf = { a0: jamb + 0.5, a1: len - jamb - 0.5, c0: thick / 2 - Math.min(4, thick / 4), c1: thick / 2 + Math.min(4, thick / 4), top: h - head - 0.5 };
  const n = Math.max(3, Math.round((leaf.a1 - leaf.a0) / 14));
  const step = (leaf.a1 - leaf.a0) / n;
  for (let k = 0; k < n; k += 1) {
    const sag = unitHash(id, k) * 3; // planches un peu inégales en haut (porte de ruine)
    out.push(place(leaf.a0 + k * step + 0.4, leaf.a0 + (k + 1) * step - 0.4, leaf.c0, leaf.c1, 0.5, leaf.top - sag, k % 2 === 0 ? REGIONS.bois : REGIONS.caisse));
  }
  // Barres de renfort (deux hauteurs), sur chaque face.
  for (const at of [0.22, 0.72]) {
    const y = leaf.top * at;
    out.push(place(leaf.a0, leaf.a1, leaf.c0 - 2, leaf.c0, y, y + 6, REGIONS.planche, 'cotes'), place(leaf.a0, leaf.a1, leaf.c1, leaf.c1 + 2, y, y + 6, REGIONS.planche, 'cotes'));
  }
  // Poignée (une par face) et gonds métalliques.
  const handle = leaf.a1 - Math.min(10, (leaf.a1 - leaf.a0) / 5);
  const hy = leaf.top * 0.48;
  out.push(place(handle - 1.5, handle + 1.5, leaf.c0 - 3.5, leaf.c0, hy, hy + 5, REGIONS.metal), place(handle - 1.5, handle + 1.5, leaf.c1, leaf.c1 + 3.5, hy, hy + 5, REGIONS.metal));
  for (const at of [0.2, 0.75]) {
    const y = leaf.top * at;
    out.push(place(leaf.a0, leaf.a0 + 9, leaf.c0 - 2.5, leaf.c1 + 2.5, y + 7, y + 10, REGIONS.metal, 'cotes'));
  }
  return out;
}

// Éboulis qui ferme un escalier : couvre le rectangle r, plus haut au milieu (jusqu'à top), sans trou par lequel passer à l'œil.
export function rubbleBoxes(r, top, id = '') {
  if (!okRect(r)) return [];
  const t = Math.max(8, Math.min(num(top, 60), 70));
  const out = [];
  const cell = 26;
  const nx = Math.max(2, Math.round(r.w / cell));
  const nz = Math.max(2, Math.round(r.h / cell));
  const cw = r.w / nx;
  const cd = r.h / nz;
  for (let i = 0; i < nx; i += 1) {
    for (let j = 0; j < nz; j += 1) {
      const k = i * 13 + j;
      const central = 1 - Math.min(1, Math.hypot((i + 0.5) / nx - 0.5, (j + 0.5) / nz - 0.5) * 1.6);
      // Couche de fond : blocs jointifs (débord de 15 % sur les voisins, toujours dans le rectangle).
      const x0 = Math.max(r.x, r.x + i * cw - cw * 0.15 * unitHash(id, k));
      const x1 = Math.min(r.x + r.w, r.x + (i + 1) * cw + cw * 0.15 * unitHash(id, k + 1));
      const z0 = Math.max(r.y, r.y + j * cd - cd * 0.15 * unitHash(id, k + 2));
      const z1 = Math.min(r.y + r.h, r.y + (j + 1) * cd + cd * 0.15 * unitHash(id, k + 3));
      const h0 = Math.min(t, 14 + central * t * 0.35 + unitHash(id, k + 4) * 8);
      out.push(box(x0, x1, z0, z1, 0, h0, REGIONS.pierre));
      // Deuxième couche : un bloc plus petit, décalé, posé dessus.
      const s = 0.45 + unitHash(id, k + 5) * 0.3;
      const ox = x0 + unitHash(id, k + 6) * (x1 - x0) * (1 - s);
      const oz = z0 + unitHash(id, k + 7) * (z1 - z0) * (1 - s);
      const h1 = Math.min(t, h0 + 8 + central * t * 0.45 + unitHash(id, k + 8) * 6);
      if (h1 > h0 + 2) out.push(box(ox, ox + (x1 - x0) * s, oz, oz + (z1 - z0) * s, h0, h1, unitHash(id, k + 9) > 0.8 ? REGIONS.rouille : REGIONS.pierre));
    }
  }
  // Poutres et planches en travers, à des hauteurs différentes ; une poutre dépasse vers le haut du tas.
  const { len, thick, place } = frame(r);
  for (let k = 0; k < 4; k += 1) {
    const c = thick * (0.15 + 0.7 * unitHash(id, 300 + k));
    const l = len * (0.45 + 0.5 * unitHash(id, 310 + k));
    const a = unitHash(id, 320 + k) * (len - l);
    const y = Math.min(t - 6, 12 + unitHash(id, 330 + k) * t * 0.6);
    const w = k === 0 ? 7 : 4;
    out.push(place(a, a + l, Math.max(0, c - w / 2), Math.min(thick, c + w / 2), y, y + (k === 0 ? 7 : 3), k === 0 ? REGIONS.planche : REGIONS.bois));
  }
  return out;
}

// Grille : ouverture r (épaisseur du mur) de hauteur h ; barreaux tous les `pitch` (10 par défaut), traverses en bas et en haut, au milieu de l'épaisseur.
export function grilleBoxes(r, h, pitch = 10) {
  if (!okRect(r) || !isNum(h) || h <= 6) return [];
  const { len, thick, place } = frame(r);
  const c0 = thick / 2 - 1.5;
  const c1 = thick / 2 + 1.5;
  const out = [place(0, len, c0 - 0.5, c1 + 0.5, 0, 3, REGIONS.metal), place(0, len, c0 - 0.5, c1 + 0.5, h - 4, h, REGIONS.metal)];
  const n = Math.max(1, Math.floor(len / Math.max(4, num(pitch, 10))));
  const step = len / (n + 1);
  for (let k = 1; k <= n; k += 1) out.push(place(k * step - 1.5, k * step + 1.5, c0, c1, 3, h - 4, REGIONS.metal, 'cotes'));
  return out;
}
