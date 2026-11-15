// Aspect du mobilier d'après le modèle 3D (lot 3g, retour du propriétaire : « les gros carrés, rectangles et chaises ne font pas crédible dans un bâtiment
// en ruine »). Pur : calcule, pour chaque pièce de la carte, des boîtes de dessin (unités du jeu) d'après les objets du modèle qui lui sont associés
// (étagères métalliques, classeurs, piles de caisses, bureau, tabouret, coffre) ou, pour une pièce provisoire, une pile de caisses ou un tas de gravats.
// Le dessin seulement : les collisions, les balles et le laser gardent le rectangle de la pièce. Aucune boîte au-dessus de la hauteur maximale (70).
// Aucune exception sur des entrées inattendues ; déterministe (aucun hasard : variations tirées de l'identifiant).
import { isNum, num } from './vec.js';

const isObject = (o) => o !== null && typeof o === 'object' && !Array.isArray(o);
const list = (a) => (Array.isArray(a) ? a : []);
const r2 = (v) => Math.round(num(v) * 100) / 100;
export const MAX_HEIGHT = 70;
export const UNITS_PER_METER = 60;
export const LOOKS = Object.freeze(['etagere', 'classeur', 'caisses', 'bureau', 'tabouret', 'coffre', 'comptoir', 'gravats', 'muret']);
// Régions de l'atlas de props (existantes) par usage.
export const REGIONS = Object.freeze({ metal: 'tole', planche: 'bois-sombre', caisse: 'caisse', bois: 'bois', pierre: 'colonne', rouille: 'barriere' });

// Hachage stable d'une chaîne et d'un entier vers [0, 1[.
export function unitHash(text, k = 0) {
  let h = 2166136261 ^ Math.imul(num(k) | 0, 16777619);
  for (const ch of String(text ?? '')) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  h = Math.imul(h ^ (h >>> 15), 2246822519);
  h = Math.imul(h ^ (h >>> 13), 3266489917);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

// Aspect proposé pour une pièce : d'après les composants du modèle associés, sinon d'après son genre (pièce provisoire ou sans objet du modèle).
export function lookOf(piece, components = []) {
  const c = list(components).map(String);
  if (c.includes('shelf')) return 'etagere';
  if (c.includes('Vertical_filing_short')) return 'classeur';
  if (c.includes('Computer_desk_30x36x27')) return 'bureau';
  if (c.includes('Bar_stool')) return 'tabouret';
  if (c.some((x) => /Mystery_Box/i.test(x))) return 'coffre';
  if (c.includes('Component_3')) return 'comptoir';
  if (c.some((x) => x === 'Component_1' || x === 'Component_2')) return 'caisses';
  const kind = piece?.kind;
  // Pièce relevée sur la coupe du bâti (cloison basse de l'étage, E1) : un muret de pierre.
  if (piece?.source === 'modele' && c.length === 0 && kind === 'comptoir') return 'muret';
  if (kind === 'etagere' || kind === 'armoire') return 'etagere';
  if (kind === 'comptoir') return 'gravats';
  return 'caisses';
}

const box = (x0, x1, z0, z1, y0, y1, region, faces = 'tout') => ({ x0: r2(x0), x1: r2(x1), y0: r2(y0), y1: r2(y1), z0: r2(z0), z1: r2(z1), region, faces });
// Rectangle (x, y, w, h : y du jeu) d'une pièce → bornes ; boîte d'une sous-partie entre deux fractions de chaque côté.
const bounds = (r) => ({ x0: r.x, x1: r.x + r.w, z0: r.y, z1: r.y + r.h });
const lerp = (a, b, t) => a + (b - a) * t;

// Boîtes d'une étagère métallique : quatre montants et des tablettes (planches), l'axe long suivant le plus grand côté.
function shelf(r, top, id) {
  const b = bounds(r);
  const long = r.w >= r.h;
  // Presque carrée vue de dessus : une étagère renversée (montants et planches à plat, à des hauteurs basses), pas un bloc plein.
  if (Math.max(r.w, r.h) / Math.min(r.w, r.h) < 2) {
    const out = [];
    const n = 4;
    for (let k = 0; k < n; k += 1) {
      const a = (k + 0.15) / n;
      const c = (k + 0.75) / n;
      const y = 2 + unitHash(id, 600 + k) * 8;
      out.push(long ? box(b.x0 + 2, b.x1 - 2, lerp(b.z0, b.z1, a), lerp(b.z0, b.z1, c), y, y + 2.5, REGIONS.planche) : box(lerp(b.x0, b.x1, a), lerp(b.x0, b.x1, c), b.z0 + 2, b.z1 - 2, y, y + 2.5, REGIONS.planche));
    }
    out.push(long ? box(b.x0, b.x1, b.z0, b.z0 + 4, 0, 4, REGIONS.metal) : box(b.x0, b.x0 + 4, b.z0, b.z1, 0, 4, REGIONS.metal));
    out.push(long ? box(b.x0, b.x1, b.z1 - 4, b.z1, 0, 4, REGIONS.metal) : box(b.x1 - 4, b.x1, b.z0, b.z1, 0, 4, REGIONS.metal));
    return out;
  }
  const t = 3; // section des montants
  const out = [];
  for (const [fx, fz] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
    const x = fx === 0 ? b.x0 : b.x1 - t;
    const z = fz === 0 ? b.z0 : b.z1 - t;
    out.push(box(x, x + t, z, z + t, 0, top, REGIONS.metal, 'cotes'));
  }
  const levels = Math.max(2, Math.min(5, Math.round(top / 16)));
  for (let k = 0; k < levels; k += 1) {
    const y = 4 + (k * (top - 6)) / Math.max(1, levels - 1);
    out.push(box(b.x0 + 1, b.x1 - 1, b.z0 + 1, b.z1 - 1, y - 2, y, REGIONS.planche));
  }
  // Une caisse posée sur une tablette, à un endroit tiré de l'identifiant (une étagère en ruine n'est pas vide).
  const u = unitHash(id, 7);
  if (u > 0.3) {
    const len = long ? r.w : r.h;
    const s = Math.min(14, (long ? r.h : r.w) - 4);
    const at = lerp(4, len - s - 4, unitHash(id, 8));
    const y = 4 + Math.floor(unitHash(id, 9) * (levels - 1)) * ((top - 6) / Math.max(1, levels - 1));
    if (s > 4) out.push(long ? box(b.x0 + at, b.x0 + at + s, b.z0 + 2, b.z0 + 2 + s, y, y + s, REGIONS.caisse) : box(b.x0 + 2, b.x0 + 2 + s, b.z0 + at, b.z0 + at + s, y, y + s, REGIONS.caisse));
  }
  return out;
}

// Classeur métallique : un corps et des tiroirs en léger relief sur la face la plus longue.
function cabinet(r, top) {
  const b = bounds(r);
  const long = r.w >= r.h;
  // Corps en retrait d'une unité côté façade : les tiroirs restent dans le rectangle de la pièce.
  const out = [box(b.x0, long ? b.x1 : b.x1 - 1, b.z0, long ? b.z1 - 1 : b.z1, 0, top, REGIONS.metal)];
  const drawers = Math.max(2, Math.min(4, Math.round(top / 15)));
  for (let k = 0; k < drawers; k += 1) {
    const y0 = 3 + (k * (top - 4)) / drawers;
    const y1 = y0 + (top - 4) / drawers - 2;
    out.push(long ? box(b.x0 + 2, b.x1 - 2, b.z1 - 1, b.z1, y0, y1, REGIONS.rouille, 'cotes') : box(b.x1 - 1, b.x1, b.z0 + 2, b.z1 - 2, y0, y1, REGIONS.rouille, 'cotes'));
  }
  return out;
}

// Pile de caisses dans un rectangle : une grille de caisses de 18 à 30 de côté, une ou deux rangées de haut (tirées de l'identifiant), quelques caisses
// de travers ; les objets du modèle, s'il y en a, donnent la place et la hauteur exactes de chaque caisse.
function crates(r, top, id, objects) {
  const b = bounds(r);
  if (objects.length > 0) {
    return objects.map((o, i) => box(Math.max(b.x0, o.x0), Math.min(b.x1, o.x1), Math.max(b.z0, o.z0), Math.min(b.z1, o.z1), Math.min(top - 4, o.y0), Math.min(top, o.y1), i % 3 === 2 ? REGIONS.bois : REGIONS.caisse))
      .filter((q) => q.x1 - q.x0 > 2 && q.z1 - q.z0 > 2 && q.y1 - q.y0 > 2);
  }
  const out = [];
  const nx = Math.max(1, Math.round(r.w / 26));
  const nz = Math.max(1, Math.round(r.h / 26));
  const cw = r.w / nx;
  const cd = r.h / nz;
  for (let i = 0; i < nx; i += 1) {
    for (let j = 0; j < nz; j += 1) {
      const k = i * 7 + j;
      const inset = 1 + unitHash(id, k) * 3;
      const h1 = Math.min(top, 18 + unitHash(id, k + 50) * 12);
      const x0 = b.x0 + i * cw + inset;
      const z0 = b.z0 + j * cd + inset;
      out.push(box(x0, b.x0 + (i + 1) * cw - inset, z0, b.z0 + (j + 1) * cd - inset, 0, h1, REGIONS.caisse));
      if (unitHash(id, k + 100) > 0.45 && h1 + 14 <= top) {
        const s = Math.min(cw, cd) * (0.55 + unitHash(id, k + 150) * 0.25);
        const ox = x0 + unitHash(id, k + 200) * Math.max(0, cw - s - 2 * inset);
        const oz = z0 + unitHash(id, k + 250) * Math.max(0, cd - s - 2 * inset);
        out.push(box(ox, ox + s, oz, oz + s, h1, Math.min(top, h1 + s * 0.8), unitHash(id, k + 300) > 0.5 ? REGIONS.caisse : REGIONS.bois));
      }
    }
  }
  return out;
}

// Bureau : plateau et deux joues pleines.
function desk(r, top) {
  const b = bounds(r);
  const long = r.w >= r.h;
  const t = 3;
  return [
    box(b.x0, b.x1, b.z0, b.z1, top - 3, top, REGIONS.bois),
    long ? box(b.x0, b.x0 + t, b.z0, b.z1, 0, top - 3, REGIONS.bois, 'cotes') : box(b.x0, b.x1, b.z0, b.z0 + t, 0, top - 3, REGIONS.bois, 'cotes'),
    long ? box(b.x1 - t, b.x1, b.z0, b.z1, 0, top - 3, REGIONS.bois, 'cotes') : box(b.x0, b.x1, b.z1 - t, b.z1, 0, top - 3, REGIONS.bois, 'cotes'),
  ];
}

// Tabouret : assise ronde (carrée, petite) sur un pied central.
function stool(r, top) {
  const cx = r.x + r.w / 2;
  const cz = r.y + r.h / 2;
  const s = Math.min(r.w, r.h) / 2;
  return [box(cx - 2, cx + 2, cz - 2, cz + 2, 0, top - 4, REGIONS.metal, 'cotes'), box(cx - s, cx + s, cz - s, cz + s, top - 4, top, REGIONS.bois)];
}

// Coffre : caisse basse avec un couvercle débordant.
function chest(r, top) {
  const b = bounds(r);
  return [box(b.x0 + 2, b.x1 - 2, b.z0 + 2, b.z1 - 2, 0, top - 5, REGIONS.caisse), box(b.x0, b.x1, b.z0, b.z1, top - 5, top, REGIONS.bois)];
}

// Comptoir de planches (gros meuble bas du modèle) : un plateau sur un coffre en retrait.
function counter(r, top) {
  const b = bounds(r);
  return [box(b.x0 + 3, b.x1 - 3, b.z0 + 3, b.z1 - 3, 0, top - 4, REGIONS.planche), box(b.x0, b.x1, b.z0, b.z1, top - 4, top, REGIONS.bois)];
}

// Tas de gravats : quelques gros blocs de pierre irréguliers (tailles, retraits et hauteurs tirés de l'identifiant, plus hauts au centre), des éclats plus
// petits sur le dessus et des planches tombées en travers.
function rubble(r, top, id) {
  const b = bounds(r);
  const out = [];
  const nx = Math.max(1, Math.round(r.w / 40));
  const nz = Math.max(1, Math.round(r.h / 40));
  const cw = r.w / nx;
  const cd = r.h / nz;
  for (let i = 0; i < nx; i += 1) {
    for (let j = 0; j < nz; j += 1) {
      const k = i * 11 + j;
      const central = 1 - Math.min(1, Math.hypot((i + 0.5) / nx - 0.5, (j + 0.5) / nz - 0.5) * 1.5);
      const sx = cw * (0.55 + unitHash(id, k) * 0.4);
      const sz = cd * (0.55 + unitHash(id, k + 20) * 0.4);
      const x0 = b.x0 + i * cw + unitHash(id, k + 40) * (cw - sx);
      const z0 = b.z0 + j * cd + unitHash(id, k + 60) * (cd - sz);
      const h = Math.min(top, 7 + central * 14 + unitHash(id, k + 80) * 9);
      out.push(box(x0, x0 + sx, z0, z0 + sz, 0, h, REGIONS.pierre));
      if (unitHash(id, k + 100) > 0.5) {
        const s2 = Math.min(sx, sz) * 0.45;
        const ox = x0 + unitHash(id, k + 120) * (sx - s2);
        const oz = z0 + unitHash(id, k + 140) * (sz - s2);
        out.push(box(ox, ox + s2, oz, oz + s2, h, Math.min(top, h + 3 + unitHash(id, k + 160) * 5), unitHash(id, k + 180) > 0.6 ? REGIONS.planche : REGIONS.pierre));
      }
    }
  }
  // Planches tombées en travers du tas, à des hauteurs différentes.
  const long = r.w >= r.h;
  for (let k = 0; k < 3; k += 1) {
    const at = lerp(0.15, 0.85, unitHash(id, 500 + k));
    const len = (long ? r.w : r.h) * (0.5 + unitHash(id, 520 + k) * 0.45);
    const from = unitHash(id, 540 + k) * ((long ? r.w : r.h) - len);
    const y = 6 + unitHash(id, 560 + k) * 14;
    if (long) {
      const z = b.z0 + at * r.h;
      out.push(box(b.x0 + from, b.x0 + from + len, z - 2.5, z + 2.5, y, y + 2.5, REGIONS.bois));
    } else {
      const x = b.x0 + at * r.w;
      out.push(box(x - 2.5, x + 2.5, b.z0 + from, b.z0 + from + len, y, y + 2.5, REGIONS.bois));
    }
  }
  return out;
}

// Boîtes d'une pièce. piece : { id, kind, x, y, w, h } (unités, rectangle de la pièce) ; objects : objets du modèle associés, en unités
// [{ x0, x1, z0, z1, y0, y1 }] (y = hauteur) ; opts : { look, maxHeight, height }. Renvoie [{ x0, x1, y0, y1, z0, z1, region, faces }].
export function pieceBoxes(piece, objects = [], opts = {}) {
  if (!isObject(piece) || ![piece.x, piece.y, piece.w, piece.h].every(isNum) || piece.w <= 0 || piece.h <= 0) return [];
  const o = isObject(opts) ? opts : {};
  const maxH = Math.min(MAX_HEIGHT, num(o.maxHeight, MAX_HEIGHT));
  const look = LOOKS.includes(o.look) ? o.look : lookOf(piece, []);
  const objs = list(objects).filter((q) => isObject(q) && [q.x0, q.x1, q.z0, q.z1, q.y0, q.y1].every(isNum));
  // Hauteur : celle du modèle (le plus haut objet), ramenée sous la hauteur maximale ; les piles gardent leurs proportions.
  const modelTop = objs.length ? Math.max(...objs.map((q) => q.y1)) : 0;
  const k = modelTop > maxH ? maxH / modelTop : 1;
  const scaled = objs.map((q) => ({ ...q, y0: q.y0 * k, y1: q.y1 * k }));
  const top = Math.min(maxH, modelTop > 0 ? modelTop * k : num(o.height, { etagere: 64, classeur: 44, caisses: 40, bureau: 46, tabouret: 40, coffre: 26, comptoir: 50, gravats: 36, muret: 48 }[look]));
  const id = String(piece.id ?? '');
  if (look === 'etagere') return shelf(piece, top, id);
  if (look === 'classeur') return cabinet(piece, top);
  if (look === 'bureau') return desk(piece, top);
  if (look === 'tabouret') return stool(piece, top);
  if (look === 'coffre') return chest(piece, top);
  if (look === 'comptoir') return counter(piece, top);
  if (look === 'gravats') return rubble(piece, top, id);
  if (look === 'muret') return [box(piece.x, piece.x + piece.w, piece.y, piece.y + piece.h, 0, top, REGIONS.pierre)];
  return crates(piece, top, id, scaled);
}

// Triangles d'une liste de boîtes (dessus et quatre côtés : 10 ; « cotes » : 8).
export const boxTriangles = (boxes) => list(boxes).reduce((s, b) => s + (b?.faces === 'cotes' ? 8 : 10), 0);
