// Lot 9j : mobilier de 1942 (piles de caisses, gravats, étagères, classeurs, bureaux, tabouret, comptoirs, muret) à la place des « aspects » du lot 3g.
// Pur : ni Three.js, ni DOM, ni hasard du navigateur, ni horloge ; mêmes entrées, même sortie. Docs/ref/decor-epoque.md (« Mobilier »).
// LE DESSIN SEULEMENT : collisions, tirs, laser et chemins gardent les boîtes du lot 3g (mobilier.world.json → boxes, js/core/mobilier-aspect.js).
// - Chaque pièce est dessinée dans son rectangle cible (rectangle de sa collision, partagé avec les pièces qui le recouvrent : ciblesMobilier), sans
//   jamais en sortir (sommets ramenés dans le rectangle) et en le remplissant au sol (écart ≤ 10 % de chaque côté, vérifié par les tests).
// - Deux listes de triangles : « corps » (volumes : caisses, montants, plateaux, poutres) dans l'atlas des meubles existant (atlas-props, régions et
//   échelles de data/game/textures.json), avec l'ombre portée des meubles d'aujourd'hui ; « détails » (couvercles au pochoir, tiroirs, conserves,
//   papiers, briques, jute, outils) dans l'atlas du mobilier de 1942 (js/core/mobilier-epoque-atlas.js, 256 px), sans ombre portée.
// - Classe de tirs gardée : pièce dont les tirs passent (dessin du lot 3g sous 43) → dessin sous 43 ; sinon → au-dessus de 43, au plus 70.
// - Feu posé (feux.json : P9, Q2) : une caisse sous le centre du feu, dessus à la hauteur du lot 3g.
// Repère : x du jeu → x, hauteur → y, y du jeu → z (haut de l'écran = nord). Aucun symbole politique, aucune marque, aucun emblème ; textes inventés.
import { regionUv } from './mobilier-epoque-atlas.js';
import { isNum, num } from './vec.js';

export const HAUTEUR_ARME = 43; // ce qui est dessiné plus bas laisse passer balles et laser (règle du lot 8j)
export const HAUTEUR_MAX = 70; // plafond des meubles
export const PLAFOND_PASSE = 42; // plus haut dessin d'une pièce dont les tirs passent
export const PLANCHER_BLOQUE = 44; // plus bas sommet d'une pièce dont les tirs sont arrêtés
export const ECART_MAX = 0.1; // écart visible au sol, par côté, en part du côté du rectangle

export const ASPECTS = Object.freeze(['caisses', 'gravats', 'etagere', 'renversee', 'classeur', 'bureau', 'tabouret', 'comptoir', 'muret']);
// Variantes de 1942 par aspect (« actuel » : boîtes du lot 3g, gardées pour comparer et pour le fichier de choix).
export const VARIANTES = Object.freeze({
  caisses: ['A', 'B', 'C'], gravats: ['A', 'B', 'C'], etagere: ['A', 'B', 'C'], renversee: ['A', 'B'], classeur: ['A', 'B'],
  bureau: ['A', 'B'], tabouret: ['A', 'B'], comptoir: ['A', 'B'], muret: ['A', 'B'],
});
export const DEFAUTS = Object.freeze({ caisses: 'A', gravats: 'A', etagere: 'A', renversee: 'A', classeur: 'A', bureau: 'A', tabouret: 'A', comptoir: 'A', muret: 'A' });

// Corps : régions de l'atlas des meubles (atlas-props de data/game/textures.json) et leur échelle (unités du monde par largeur de région).
export const CORPS = Object.freeze({
  bois: { region: 'bois', echelle: 100 }, 'bois-sombre': { region: 'bois-sombre', echelle: 100 }, caisse: { region: 'caisse', echelle: 70 },
  tole: { region: 'tole', echelle: 100 }, etagere: { region: 'etagere', echelle: 100 }, colonne: { region: 'colonne', echelle: 100 },
  barriere: { region: 'barriere', echelle: 60 }, pneu: { region: 'pneu', echelle: 40 },
});
// Détails : région de l'atlas du mobilier, échelle ou région ajustée (la région entière, ou une fenêtre donnée, sur la face), teinte (clé de
// data/game/mobilier-epoque.json → couleurs ; « neutre » : la texture seule).
export const MATIERES = Object.freeze({
  munitions: { region: 'munitions', ajuste: true, teinte: 'neutre' }, rations: { region: 'rations', ajuste: true, teinte: 'neutre' },
  bache: { region: 'bache', ajuste: true, teinte: 'neutre' }, sac: { region: 'sac', ajuste: true, teinte: 'neutre' },
  jerrycan: { region: 'jerrycan', ajuste: true, teinte: 'neutre' }, briques: { region: 'briques', echelle: 40, teinte: 'neutre' },
  platre: { region: 'platre', echelle: 50, teinte: 'neutre' }, conserves: { region: 'conserves', echelle: 24, teinte: 'neutre' },
  couverture: { region: 'couverture', ajuste: true, teinte: 'neutre' }, tiroirs: { region: 'tiroirs', ajuste: true, teinte: 'olive' },
  'tiroirs-bois': { region: 'tiroirs', ajuste: true, teinte: 'bois-tiroir' }, dossiers: { region: 'dossiers', ajuste: true, teinte: 'neutre' },
  bureau: { region: 'bureau', ajuste: true, teinte: 'neutre' }, sacsable: { region: 'sacsable', echelle: 112, teinte: 'neutre' },
  pierre: { region: 'pierre', echelle: 60, teinte: 'neutre' }, etabli: { region: 'etabli', ajuste: true, teinte: 'neutre' },
  olive: { region: 'uni', echelle: 10, teinte: 'olive' }, 'olive-sombre': { region: 'uni', echelle: 10, teinte: 'olive-sombre' },
  fer: { region: 'uni', echelle: 10, teinte: 'fer-blanc' }, acier: { region: 'uni', echelle: 10, teinte: 'acier' }, noir: { region: 'uni', echelle: 10, teinte: 'noir' },
  manche: { region: 'uni', echelle: 10, teinte: 'manche' }, carton: { region: 'uni', echelle: 10, teinte: 'carton' }, toile: { region: 'uni', echelle: 10, teinte: 'toile' },
  corde: { region: 'uni', echelle: 10, teinte: 'corde' }, laiton: { region: 'uni', echelle: 10, teinte: 'laiton' }, verre: { region: 'uni', echelle: 10, teinte: 'verre-eteint' },
  brique: { region: 'uni', echelle: 10, teinte: 'brique' }, gravats: { region: 'uni', echelle: 10, teinte: 'gravats' }, gravier: { region: 'uni', echelle: 10, teinte: 'platre-sombre' }, papier: { region: 'uni', echelle: 10, teinte: 'papier' },
});

// --- Choix ---------------------------------------------------------------------------------------------------------------------------------------
// data/game/mobilier-epoque-choix.json : { variantes: { aspect: variante | "actuel" }, pieces: { identifiant: aspect } }. Entrée inconnue ou
// invalide (fichier illisible compris) : la variante par défaut, l'aspect proposé pour la pièce.
export function lireChoix(json) {
  const j = json && typeof json === 'object' && !Array.isArray(json) ? json : {};
  const v = j.variantes && typeof j.variantes === 'object' ? j.variantes : {};
  const variantes = {};
  for (const a of ASPECTS) variantes[a] = v[a] === 'actuel' || VARIANTES[a].includes(v[a]) ? v[a] : DEFAUTS[a];
  const pieces = {};
  const p = j.pieces && typeof j.pieces === 'object' && !Array.isArray(j.pieces) ? j.pieces : {};
  for (const [id, a] of Object.entries(p)) if (typeof id === 'string' && !id.startsWith('_') && ASPECTS.includes(a)) pieces[id] = a;
  return { variantes, pieces };
}

// Aspect de 1942 d'une pièce d'après son aspect du lot 3g (lookOf) et son rectangle (étagère presque carrée : renversée).
export function aspectDuLook(look, rect) {
  if (look === 'etagere') return rect && Math.max(rect.w, rect.h) / Math.max(1e-6, Math.min(rect.w, rect.h)) < 2 ? 'renversee' : 'etagere';
  if (look === 'coffre') return 'caisses';
  return ASPECTS.includes(look) ? look : 'caisses';
}

// --- Rectangles cibles ---------------------------------------------------------------------------------------------------------------------------
const inter = (a, b) => {
  const x0 = Math.max(a.x, b.x);
  const y0 = Math.max(a.y, b.y);
  const x1 = Math.min(a.x + a.w, b.x + b.w);
  const y1 = Math.min(a.y + a.h, b.y + b.h);
  return x1 - x0 > 1e-6 && y1 - y0 > 1e-6 ? { x: x0, y: y0, w: x1 - x0, h: y1 - y0 } : null;
};
const r1 = (v) => Math.round(v * 10) / 10;
// pieces : [{ id, floor, obstacle: { x, y, w, h } (collision), plan: { x, y, w, h } (rectangle du plan) }] → { [id]: { x, y, w, h } }.
// Chaque pièce part de son rectangle du plan (rentré dans sa collision), puis chaque bord avance jusqu'au bord de sa collision, ou jusqu'à la
// pièce voisine du même étage qu'il rencontrerait : la collision est entièrement dessinée, aucune pièce n'en recouvre une autre.
export function ciblesMobilier(pieces) {
  const liste = (Array.isArray(pieces) ? pieces : []).filter((p) => p && typeof p.id === 'string' && p.obstacle && [p.obstacle.x, p.obstacle.y, p.obstacle.w, p.obstacle.h].every(isNum))
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const T = new Map();
  for (const p of liste) T.set(p.id, { ...((p.plan && inter(p.plan, p.obstacle)) || p.obstacle) });
  const autres = (p) => liste.filter((q) => q !== p && q.floor === p.floor).map((q) => T.get(q.id));
  for (let passe = 0; passe < 2; passe += 1) {
    for (const p of liste) {
      const o = p.obstacle;
      let r = T.get(p.id);
      const voisins = autres(p);
      const recouvreY = (q) => Math.min(q.y + q.h, r.y + r.h) - Math.max(q.y, r.y) > 1e-6;
      const recouvreX = (q) => Math.min(q.x + q.w, r.x + r.w) - Math.max(q.x, r.x) > 1e-6;
      // Ouest, est, nord, sud : jusqu'au bord de la collision ou au premier voisin rencontré.
      let x0 = o.x;
      for (const q of voisins) if (recouvreY(q) && q.x + q.w <= r.x + 1e-6) x0 = Math.max(x0, q.x + q.w);
      r = { ...r, w: r.w + (r.x - Math.min(r.x, x0)), x: Math.min(r.x, x0) };
      let x1 = o.x + o.w;
      for (const q of voisins) if (recouvreY(q) && q.x >= r.x + r.w - 1e-6) x1 = Math.min(x1, q.x);
      r = { ...r, w: Math.max(r.w, x1 - r.x) };
      let y0 = o.y;
      for (const q of voisins) if (recouvreX(q) && q.y + q.h <= r.y + 1e-6) y0 = Math.max(y0, q.y + q.h);
      r = { ...r, h: r.h + (r.y - Math.min(r.y, y0)), y: Math.min(r.y, y0) };
      let y1 = o.y + o.h;
      for (const q of voisins) if (recouvreX(q) && q.y >= r.y + r.h - 1e-6) y1 = Math.min(y1, q.y);
      r = { ...r, h: Math.max(r.h, y1 - r.y) };
      T.set(p.id, r);
    }
  }
  const out = {};
  for (const [id, r] of T) out[id] = { x: r1(r.x), y: r1(r.y), w: r1(r.w), h: r1(r.h) };
  return out;
}

// Côté ouvert d'un meuble (vers la pièce) : des deux grands côtés, celui qui a le plus de place devant lui jusqu'au mur le plus proche (murs : rectangles
// alignés) ; presque carré : des quatre côtés. Égalité : le sud (le côté que voit la caméra du jeu).
export function ouvertureDe(rect, murs = []) {
  if (!rect || ![rect.x, rect.y, rect.w, rect.h].every(isNum)) return 's';
  const libre = (cote) => {
    let d = 400;
    for (const m of Array.isArray(murs) ? murs : []) {
      if (!m || ![m.x, m.y, m.w, m.h].every(isNum)) continue;
      const enX = Math.min(m.x + m.w, rect.x + rect.w) - Math.max(m.x, rect.x) > 0;
      const enY = Math.min(m.y + m.h, rect.y + rect.h) - Math.max(m.y, rect.y) > 0;
      if (cote === 'n' && enX && m.y + m.h <= rect.y + 1) d = Math.min(d, rect.y - (m.y + m.h));
      if (cote === 's' && enX && m.y >= rect.y + rect.h - 1) d = Math.min(d, m.y - (rect.y + rect.h));
      if (cote === 'w' && enY && m.x + m.w <= rect.x + 1) d = Math.min(d, rect.x - (m.x + m.w));
      if (cote === 'e' && enY && m.x >= rect.x + rect.w - 1) d = Math.min(d, m.x - (rect.x + rect.w));
    }
    return Math.max(0, d);
  };
  const ratio = Math.max(rect.w, rect.h) / Math.max(1e-6, Math.min(rect.w, rect.h));
  const cotes = ratio < 1.25 ? ['s', 'n', 'e', 'w'] : rect.w >= rect.h ? ['s', 'n'] : ['e', 'w'];
  let best = cotes[0];
  for (const c of cotes) if (libre(c) > libre(best) + 1e-6) best = c;
  return best;
}

// --- Hachage ---------------------------------------------------------------------------------------------------------------------------------------
export function unitHash(text, k = 0) {
  let h = 2166136261 ^ Math.imul(num(k) | 0, 16777619);
  for (const ch of String(text ?? '')) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  h = Math.imul(h ^ (h >>> 15), 2246822519);
  h = Math.imul(h ^ (h >>> 13), 3266489917);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

// --- Géométrie ---------------------------------------------------------------------------------------------------------------------------------------
const DEG = Math.PI / 180;
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const unit = (v) => {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
};
const r3 = (v) => Math.round(v * 1000) / 1000;
const HEXA = [[0, 3, 2, 1], [4, 5, 6, 7], [0, 1, 5, 4], [1, 2, 6, 5], [2, 3, 7, 6], [3, 0, 4, 7]];
const HEXA_SANS_DESSUS = [[0, 3, 2, 1], [0, 1, 5, 4], [1, 2, 6, 5], [2, 3, 7, 6], [3, 0, 4, 7]];

// Cadre local d'un rectangle : u le long du grand côté (0 → L), v dans la profondeur, du dos (0, contre le mur) vers le côté ouvert (D) ; y : hauteur.
export function cadre(rect, ouverture = 's') {
  const { x, y, w, h } = rect;
  const longX = w >= h;
  const o = longX ? (ouverture === 'n' ? 'n' : 's') : (ouverture === 'w' ? 'w' : 'e');
  const L = longX ? w : h;
  const D = longX ? h : w;
  const map = ({
    s: (u, v, hy) => [x + u, hy, y + v],
    n: (u, v, hy) => [x + w - u, hy, y + h - v],
    e: (u, v, hy) => [x + v, hy, y + h - u],
    w: (u, v, hy) => [x + w - v, hy, y + u],
  })[o];
  return { L, D, map, ouverture: o };
}

// Constructeur : pièces convexes (hexaèdres, cylindres) ou plaques, en coordonnées locales (u, y, v), puis placées et triangulées.
function constructeur(c) {
  const pieces = [];
  const P = (u, hy, v) => c.map(u, v, hy);
  const rot = (cu, cv, a) => (u, v) => {
    const ca = Math.cos(a * DEG);
    const sa = Math.sin(a * DEG);
    return [cu + (u - cu) * ca - (v - cv) * sa, cv + (u - cu) * sa + (v - cv) * ca];
  };
  const b = {
    pieces,
    // Boîte [u0, u1] × [y0, y1] × [v0, v1], tournée de `rot` degrés autour de la verticale (centre), dessus incliné (dy : hauteurs ajoutées aux 4
    // coins du dessus, ordre (u0, v0), (u0, v1), (u1, v1), (u1, v0)) ; faces : « tout » ou « cotes » (sans le dessus).
    boite(cible, mat, [u0, u1], [y0, y1], [v0, v1], { rot: a = 0, dy = [0, 0, 0, 0], faces = 'tout', retrait = 0 } = {}) {
      const R = rot((u0 + u1) / 2, (v0 + v1) / 2, a);
      const bas = [[u0, v0], [u0, v1], [u1, v1], [u1, v0]].map(([u, v]) => R(u, v));
      const ru = (u1 - u0) * retrait;
      const rv = (v1 - v0) * retrait;
      const haut = [[u0 + ru, v0 + rv], [u0 + ru, v1 - rv], [u1 - ru, v1 - rv], [u1 - ru, v0 + rv]].map(([u, v]) => R(u, v));
      const pts = [...bas.map(([u, v]) => P(u, y0, v)), ...haut.map(([u, v], i) => P(u, y1 + dy[i], v))];
      // Ordre HEXA : 0..3 bas (u0v0, u0v1, u1v1, u1v0), 4..7 haut ; la face 1 (4, 5, 6, 7) est le dessus.
      pieces.push({ cible, mat, pts: [pts[0], pts[1], pts[2], pts[3], pts[4], pts[5], pts[6], pts[7]], faces: faces === 'cotes' ? HEXA_SANS_DESSUS : HEXA });
      return b;
    },
    // Hexaèdre libre (8 points locaux [u, y, v] : bas u0v0, u0v1, u1v1, u1v0 puis haut dans le même ordre).
    hexa(cible, mat, pts, faces = 'tout') {
      pieces.push({ cible, mat, pts: pts.map(([u, hy, v]) => P(u, hy, v)), faces: faces === 'cotes' ? HEXA_SANS_DESSUS : HEXA });
      return b;
    },
    // Plaque (4 points locaux [u, y, v], dans l'ordre du tour) ; uv : coins de la région (fraction), dans le même ordre ; normale vers le haut, ou
    // vers `vers` (point local [u, y, v] devant la face).
    // uv « auto » (plaques du dessus) : texture droite vue de la caméra (nord en haut), tournée d'un quart de tour si la face est plus longue du
    // nord au sud ; fenetre : partie de la région [u0, v0, u1, v1].
    plaque(cible, mat, pts, { uv = 'auto', vers = null, fenetre = [0, 0, 1, 1] } = {}) {
      const tp = pts.map(([u, hy, v]) => P(u, hy, v));
      pieces.push({ cible, mat, pts: tp, faces: [[0, 1, 2, 3]], plaque: vers ? P(...vers) : 'haut', uv, fenetre });
      return b;
    },
    // Plaque horizontale [u0, u1] × [v0, v1] à la hauteur hy ; texture orientée d'après le monde (fenêtre de la région ; uv « auto »).
    dessus(cible, mat, [u0, u1], hy, [v0, v1], { fenetre = [0, 0, 1, 1] } = {}) {
      return b.plaque(cible, mat, [[u0, hy, v0], [u0, hy, v1], [u1, hy, v1], [u1, hy, v0]], { uv: 'auto', fenetre });
    },
    // Cylindre vertical (centre cu, cv ; rayon r ; y0 → y1 ; `cotes` pans ; dessus incliné : aucun).
    cylindre(cible, mat, cu, cv, y0, y1, r, cotes = 6, phase = 0) {
      const pts = [];
      for (const hy of [y0, y1]) for (let i = 0; i < cotes; i += 1) {
        const a = phase + (i / cotes) * Math.PI * 2;
        pts.push(P(cu + Math.cos(a) * r, hy, cv + Math.sin(a) * r));
      }
      const faces = [];
      for (let i = 0; i < cotes; i += 1) faces.push([i, (i + 1) % cotes, cotes + ((i + 1) % cotes), cotes + i]);
      faces.push([...Array(cotes).keys()].map((i) => cotes + i));
      pieces.push({ cible, mat, pts, faces });
      return b;
    },
    // Barre de section carrée e, d'un point local a [u, y, v] à b.
    barre(cible, mat, a, z, e = 2) {
      const A = P(...a);
      const Z = P(...z);
      const d = sub(Z, A);
      const n = unit(Math.abs(d[1]) > 0.9 * Math.hypot(...d) ? cross(d, [1, 0, 0]) : cross(d, [0, 1, 0]));
      const o = unit(cross(d, n));
      const c4 = (p) => [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([s, t]) => [p[0] + (n[0] * s + o[0] * t) * e / 2, p[1] + (n[1] * s + o[1] * t) * e / 2, p[2] + (n[2] * s + o[2] * t) * e / 2]);
      pieces.push({ cible, mat, pts: [...c4(A), ...c4(Z)], faces: [[0, 1, 5, 4], [1, 2, 6, 5], [2, 3, 7, 6], [3, 0, 4, 7], [4, 5, 6, 7]] });
      return b;
    },
  };
  return b;
}

// Coordonnées de texture d'une face : projection sur le plan le plus proche de la normale, fenêtre de la région décalée par pièce (échelle), ou
// région entière (ajustée). Corps : fractions de la région (le jeu les ramène dans l'atlas-props) ; détails : coordonnées de l'atlas du mobilier.
function uvFace(poly, n, regionCoins, echelle, ajuste, graine) {
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
  const { u0, v0, u1, v1 } = regionCoins;
  if (ajuste) return poly.map((p, i) => [u0 + ((as[i] - a0) / sa) * (u1 - u0), v0 + ((bs[i] - b0) / sb) * (v1 - v0)]);
  const e = Math.max(1, echelle);
  const wu = Math.min(1, sa / e);
  const wv = Math.min(1, sb / e);
  const ou = unitHash(graine, 1) * (1 - wu);
  const ov = unitHash(graine, 2) * (1 - wv);
  return poly.map((p, i) => [u0 + (ou + ((as[i] - a0) / sa) * wu) * (u1 - u0), v0 + (ov + ((bs[i] - b0) / sb) * wv) * (v1 - v0)]);
}

// Triangulation, sommets ramenés dans le rectangle et sous le plafond ; faces orientées vers l'extérieur (centre de la pièce), dessous retirés.
// → { corps: [{ region, p, n, uv }], details: [{ mat, p, n, uv }] } (uv des corps : fractions de leur région ; des détails : atlas du mobilier).
function trianguler(pieces, rect, plafond, graine) {
  const out = { corps: [], details: [] };
  const clampP = (p) => [Math.min(rect.x + rect.w, Math.max(rect.x, p[0])), Math.min(plafond, Math.max(0, p[1])), Math.min(rect.y + rect.h, Math.max(rect.y, p[2]))];
  pieces.forEach((piece, k) => {
    const pts = piece.pts.map(clampP);
    const centre = pts.reduce((s, p) => [s[0] + p[0], s[1] + p[1], s[2] + p[2]], [0, 0, 0]).map((v) => v / pts.length);
    const corps = piece.cible === 'corps';
    const M = corps ? CORPS[piece.mat] ?? CORPS.bois : MATIERES[piece.mat] ?? MATIERES.olive;
    const coins = corps ? { u0: 0, v0: 0, u1: 1, v1: 1 } : regionUv(M.region);
    for (const f of piece.faces) {
      let poly = f.map((i) => pts[i]);
      let n = unit(cross(sub(poly[1], poly[0]), sub(poly[2], poly[0])));
      if (piece.plaque) {
        const vers = piece.plaque === 'haut' ? [0, 1, 0] : sub(piece.plaque, centre);
        if (dot3(n, vers) < 0) {
          poly = [...poly].reverse();
          n = n.map((v) => -v);
        }
      } else {
        const mid = poly.reduce((s, p) => [s[0] + p[0], s[1] + p[1], s[2] + p[2]], [0, 0, 0]).map((v) => v / poly.length);
        if (dot3(n, sub(mid, centre)) < 0) {
          poly = [...poly].reverse();
          n = n.map((v) => -v);
        }
        if (n[1] < -0.7) continue; // dessous : jamais vu par la caméra du jeu
      }
      if (!poly.every((p) => p.every(isNum))) continue;
      const area = Math.hypot(...cross(sub(poly[1], poly[0]), sub(poly[2], poly[0])));
      if (area < 1e-6 && poly.length === 3) continue;
      let uv;
      if (piece.uv === 'auto' && !corps) {
        const xs = poly.map((p) => p[0]);
        const zs = poly.map((p) => p[2]);
        const x0 = Math.min(...xs);
        const z1 = Math.max(...zs);
        const sx = Math.max(1e-6, Math.max(...xs) - x0);
        const sz = Math.max(1e-6, z1 - Math.min(...zs));
        const tourne = sz > sx * 1.15;
        const [f0, g0, f1, g1] = piece.fenetre ?? [0, 0, 1, 1];
        uv = poly.map((p) => {
          const a = (p[0] - x0) / sx;
          const c = (z1 - p[2]) / sz;
          const [ua, vb] = tourne ? [c, 1 - a] : [a, c];
          return [coins.u0 + (f0 + ua * (f1 - f0)) * (coins.u1 - coins.u0), coins.v0 + (g0 + vb * (g1 - g0)) * (coins.v1 - coins.v0)];
        });
      } else if (Array.isArray(piece.uv) && !corps) {
        const ordre = piece.plaque && poly[0] !== pts[f[0]] ? [...piece.uv].reverse() : piece.uv;
        uv = ordre.map(([a, c]) => [coins.u0 + a * (coins.u1 - coins.u0), coins.v0 + c * (coins.v1 - coins.v0)]);
      } else uv = uvFace(poly, n, coins, M.echelle ?? 20, !corps && M.ajuste === true, `${graine}:${k}`);
      for (let i = 1; i + 1 < poly.length; i += 1) {
        const p = [poly[0], poly[i], poly[i + 1]];
        if (Math.hypot(...cross(sub(p[1], p[0]), sub(p[2], p[0]))) < 1e-6) continue;
        const t = { p: p.map((v) => v.map(r3)), n: n.map((v) => Math.round(v * 10000) / 10000), uv: [uv[0], uv[i], uv[i + 1]].map((q) => q.map((v) => Math.round(v * 100000) / 100000)) };
        if (corps) out.corps.push({ region: M.region, ...t });
        else out.details.push({ mat: piece.mat, ...t });
      }
    }
  });
  return out;
}

// --- Modèles -----------------------------------------------------------------------------------------------------------------------------------------
const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

// Une caisse (corps de bois, couvercle au pochoir) : [u0, u1] × [v0, v1], de y0 à y1 ; couvercle « munitions », « rations » ou aucun.
function caisse(B, [u0, u1], [v0, v1], y0, y1, couvercle, { rot = 0 } = {}) {
  B.boite('corps', 'caisse', [u0, u1], [y0, y1], [v0, v1], { rot, faces: couvercle ? 'cotes' : 'tout' });
  if (!couvercle) return;
  const cu = (u0 + u1) / 2;
  const cv = (v0 + v1) / 2;
  const a = rot * DEG;
  const R = (u, v) => [cu + (u - cu) * Math.cos(a) - (v - cv) * Math.sin(a), cv + (u - cu) * Math.sin(a) + (v - cv) * Math.cos(a)];
  B.plaque('details', couvercle, [[u0, v0], [u0, v1], [u1, v1], [u1, v0]].map(([u, v]) => {
    const [pu, pv] = R(u, v);
    return [pu, y1 + 0.15, pv];
  }), { uv: 'auto' });
}

// Sac de toile (rebondi : dessus plus petit) ; jerrycan (corps olive, dessus estampé, poignée).
function sac(B, [u0, u1], [v0, v1], h, rot = 0) {
  B.boite('details', 'toile', [u0, u1], [0, h], [v0, v1], { rot, retrait: 0.2, faces: 'cotes' });
  const cu = (u0 + u1) / 2;
  const cv = (v0 + v1) / 2;
  const du = (u1 - u0) * 0.3;
  const dv = (v1 - v0) * 0.3;
  B.boite('details', 'sac', [cu - du, cu + du], [h - 0.4, h + 0.1], [cv - dv, cv + dv], { rot });
}
function jerrycan(B, [u0, u1], [v0, v1], h) {
  B.boite('details', 'olive', [u0, u1], [0, h], [v0, v1], { faces: 'cotes' });
  B.dessus('details', 'jerrycan', [u0, u1], h + 0.05, [v0, v1]);
}

// Pile de caisses (aspect « caisses ») : A munitions, B ravitaillement (sacs, jerrycan), C dépôt bâché. feu : { u, v } local, la caisse sous le feu
// a son dessus à H.
function pileCaisses(B, L, D, H, id, variante, feu) {
  const nu = Math.max(1, Math.round(L / 42));
  const nv = Math.max(1, Math.round(D / 36));
  const cu = L / nu;
  const cv = D / nv;
  const deux = H >= 30; // deux rangs de haut
  const lid = variante === 'B' ? 'rations' : variante === 'C' ? null : 'munitions';
  const cellules = [];
  for (let i = 0; i < nu; i += 1) for (let j = 0; j < nv; j += 1) cellules.push({ i, j, u0: i * cu, u1: (i + 1) * cu, v0: j * cv, v1: (j + 1) * cv });
  // Cellule du sommet : celle du feu, sinon la plus centrale.
  const centre = feu ?? { u: L / 2, v: D / 2 };
  const haut = cellules.reduce((best, c) => (Math.hypot((c.u0 + c.u1) / 2 - centre.u, (c.v0 + c.v1) / 2 - centre.v) < Math.hypot((best.u0 + best.u1) / 2 - centre.u, (best.v0 + best.v1) / 2 - centre.v) ? c : best), cellules[0]);
  const special = new Set();
  if (variante === 'B' && cellules.length > 1) {
    const autres = cellules.filter((c) => c !== haut);
    special.add(autres[Math.floor(unitHash(id, 40) * autres.length)]);
    if (autres.length > 3) special.add(autres[Math.floor(unitHash(id, 41) * autres.length)]);
  }
  let bache = variante === 'A' && cellules.length > 1 ? cellules.filter((c) => c !== haut)[Math.floor(unitHash(id, 42) * (cellules.length - 1))] : null;
  cellules.forEach((c, k) => {
    const g = 0.8; // jeu entre caisses voisines ; aucun retrait au bord du rectangle
    const a0 = c.i === 0 ? 0 : c.u0 + g / 2;
    const a1 = c.i === nu - 1 ? L : c.u1 - g / 2;
    const b0 = c.j === 0 ? 0 : c.v0 + g / 2;
    const b1 = c.j === nv - 1 ? D : c.v1 - g / 2;
    if (special.has(c)) {
      // Ravitaillement : deux sacs couchés, ou un jerrycan et un sac.
      const h = Math.min(H, 9 + unitHash(id, k + 60) * 4);
      if (unitHash(id, k + 61) > 0.5) {
        jerrycan(B, [a0, lerp(a0, a1, 0.45)], [b0, b1], Math.min(H, 16));
        sac(B, [lerp(a0, a1, 0.5), a1], [b0, b1], h, 6);
      } else {
        sac(B, [a0, a1], [b0, lerp(b0, b1, 0.52)], h, -4);
        sac(B, [a0, a1], [lerp(b0, b1, 0.48), b1], h * 0.9, 5);
      }
      return;
    }
    const estHaut = c === haut;
    const h1 = deux ? (estHaut && !feu ? H * 0.52 : H * (0.48 + unitHash(id, k + 70) * 0.14)) : estHaut ? H : H * (0.72 + unitHash(id, k + 70) * 0.2);
    caisse(B, [a0, a1], [b0, b1], 0, h1, lid);
    if (deux && (estHaut || unitHash(id, k + 80) > 0.45)) {
      // Caisse posée dessus, plus petite, un peu tournée (le sommet : sous le feu, dessus à H).
      const su = (a1 - a0) * (0.62 + unitHash(id, k + 81) * 0.2);
      const sv = (b1 - b0) * (0.62 + unitHash(id, k + 82) * 0.2);
      const pu = estHaut && feu ? clamp(feu.u, a0 + su / 2, a1 - su / 2) : lerp(a0 + su / 2, a1 - su / 2, unitHash(id, k + 83));
      const pv = estHaut && feu ? clamp(feu.v, b0 + sv / 2, b1 - sv / 2) : lerp(b0 + sv / 2, b1 - sv / 2, unitHash(id, k + 84));
      const top = estHaut ? H : Math.min(H, h1 + (H - h1) * (0.75 + unitHash(id, k + 85) * 0.25));
      const rot = estHaut && feu ? 0 : (unitHash(id, k + 86) - 0.5) * 14;
      if (c === bache) {
        // Bâche pliée posée sur la caisse du dessous.
        B.boite('details', 'bache', [pu - su / 2, pu + su / 2], [h1, Math.min(H, h1 + 4)], [pv - sv / 2, pv + sv / 2], { rot, retrait: 0.06 });
        bache = null;
      } else caisse(B, [pu - su / 2, pu + su / 2], [pv - sv / 2, pv + sv / 2], h1, top, lid, { rot });
    }
  });
  if (variante === 'C') {
    // Dépôt bâché : la bâche couvre la pile (un pan sur le dessus, deux pans qui tombent sur les grands côtés), coins des caisses visibles.
    const m = Math.min(L, D) * 0.12;
    const yb = deux ? H * 0.5 + 1 : H * 0.7;
    const top = Math.min(H, Math.max(...[yb + 1, H - 0.3]));
    B.plaque('details', 'bache', [[m, top, m * 1.5], [m, top, D - m * 1.5], [L - m, top, D - m * 1.5], [L - m, top, m * 1.5]], { uv: [[0, 0], [0, 1], [1, 1], [1, 0]] });
    B.plaque('details', 'bache', [[m, top, D - m * 1.5], [m * 0.6, yb * 0.55, D - 0.3], [L - m * 0.6, yb * 0.55, D - 0.3], [L - m, top, D - m * 1.5]], { uv: [[0, 0.7], [0, 1], [1, 1], [1, 0.7]], vers: [L / 2, top, D + 20] });
    B.plaque('details', 'bache', [[m, top, m * 1.5], [m * 0.6, yb * 0.55, 0.3], [L - m * 0.6, yb * 0.55, 0.3], [L - m, top, m * 1.5]], { uv: [[0, 0.3], [0, 0], [1, 0], [1, 0.3]], vers: [L / 2, top, -20] });
    // Cordes en travers.
    for (const f of [0.3, 0.7]) B.barre('details', 'corde', [L * f, top + 0.3, m * 1.4], [L * f, top + 0.3, D - m * 1.4], 1);
  }
}

// Tas de gravats : bosses irrégulières jusqu'aux bords (plus hautes au centre), dessus de briques ou de plâtre ; A poutres cassées et briques,
// B pans de mur de brique à plat et chaise renversée, C plaques de plâtre et lattes.
function tasGravats(B, L, D, H, id, variante) {
  const nu = Math.max(2, Math.round(L / 55));
  const nv = Math.max(1, Math.round(D / 45));
  const cu = L / nu;
  const cv = D / nv;
  const peau = variante === 'C' ? 'platre' : 'briques';
  for (let i = 0; i < nu; i += 1) for (let j = 0; j < nv; j += 1) {
    const k = i * 13 + j;
    const central = 1 - Math.min(1, Math.hypot((i + 0.5) / nu - 0.5, (j + 0.5) / nv - 0.5) * 1.6);
    const bord = i === 0 || j === 0 || i === nu - 1 || j === nv - 1;
    // Blocs qui se chevauchent (débordent de 25 % sur leurs voisins), tailles et retraits tirés : un tas, pas un carrelage.
    const u0 = i === 0 ? 0 : (i - 0.25 * unitHash(id, k)) * cu;
    const u1 = i === nu - 1 ? L : (i + 1 + 0.25 * unitHash(id, k + 1)) * cu;
    const v0 = j === 0 ? 0 : (j - 0.25 * unitHash(id, k + 2)) * cv;
    const v1 = j === nv - 1 ? D : (j + 1 + 0.25 * unitHash(id, k + 3)) * cv;
    const h = Math.min(H * 0.75, (bord ? 3 : 6) + central * H * 0.5 + unitHash(id, k + 4) * 6);
    const dy = [0, 1, 2, 3].map((q) => (unitHash(id, k * 4 + q + 9) - 0.5) * h * 0.8);
    const ret = 0.1 + unitHash(id, k + 5) * 0.18;
    const rot = (unitHash(id, k + 6) - 0.5) * 16;
    B.boite('details', 'gravats', [u0, u1], [0, h], [v0, v1], { retrait: ret, dy, faces: 'cotes', rot });
    const R = (u, v) => {
      const a = rot * DEG;
      const cx = (u0 + u1) / 2;
      const cz = (v0 + v1) / 2;
      return [cx + (u - cx) * Math.cos(a) - (v - cz) * Math.sin(a), cz + (u - cx) * Math.sin(a) + (v - cz) * Math.cos(a)];
    };
    const ru = (u1 - u0) * ret;
    const rv = (v1 - v0) * ret;
    const coins = [[u0 + ru, v0 + rv], [u0 + ru, v1 - rv], [u1 - ru, v1 - rv], [u1 - ru, v0 + rv]];
    B.plaque('details', unitHash(id, k + 7) > 0.75 ? 'platre' : peau, coins.map(([u, v], q) => {
      const [pu, pv] = R(u, v);
      return [pu, h + dy[q] + 0.15, pv];
    }));
    // Éclat posé sur le bloc (un sur deux).
    if (unitHash(id, k + 8) > 0.65) {
      const su = (u1 - u0) * 0.3;
      const sv = (v1 - v0) * 0.3;
      const pu = lerp(u0 + su, u1 - su * 2, unitHash(id, k + 10));
      const pv = lerp(v0 + sv, v1 - sv * 2, unitHash(id, k + 11));
      B.boite('details', unitHash(id, k + 12) > 0.5 ? 'brique' : 'gravats', [pu, pu + su], [h * 0.5, Math.min(H - 1, h + 3)], [pv, pv + sv], { rot: unitHash(id, k + 13) * 90, retrait: 0.15 });
    }
  }
  const long = (k) => L * (0.45 + unitHash(id, k) * 0.35);
  if (variante === 'A' || variante === 'C') {
    // Poutres de charpente cassées, en travers du tas, un bout relevé ; bout éclaté.
    const n = variante === 'A' ? Math.min(3, Math.max(2, Math.round(L / 110))) : 1;
    for (let q = 0; q < n; q += 1) {
      const len = Math.min(long(200 + q), Math.hypot(L, D) * 0.8);
      const a = (unitHash(id, 210 + q) - 0.5) * 50;
      const cu0 = lerp(len / 2 * 0.7, L - len / 2 * 0.7, unitHash(id, 220 + q));
      const cv0 = lerp(D * 0.25, D * 0.75, unitHash(id, 230 + q));
      const y0 = 2 + unitHash(id, 240 + q) * 6;
      const y1 = Math.min(H - 1, y0 + 8 + unitHash(id, 250 + q) * 12);
      const e = 6.5;
      const R = (u, v) => [cu0 + u * Math.cos(a * DEG) - v * Math.sin(a * DEG), cv0 + u * Math.sin(a * DEG) + v * Math.cos(a * DEG)];
      const pts = [];
      for (const [u, hy] of [[-len / 2, y0], [len / 2, y1]]) for (const [v, dh] of [[-e / 2, 0], [e / 2, 0], [e / 2, e], [-e / 2, e]]) {
        const [pu, pv] = R(u, v);
        pts.push([pu, hy + dh, pv]);
      }
      // Ordre hexa : bas (u0v0, u0v1, u1v1, u1v0) puis haut : ici un bout (4 points) puis l'autre.
      B.hexa('corps', 'bois-sombre', [pts[0], pts[1], pts[5], pts[4], pts[3], pts[2], pts[6], pts[7]]);
      const [eu, ev] = R(len / 2 + 5, 0);
      B.barre('corps', 'bois-sombre', [R(len / 2, 0)[0], y1 + e / 2, R(len / 2, 0)[1]], [eu, Math.max(1, y1 - 4), ev], 3.5);
    }
  }
  if (variante === 'A') {
    // Briques éparses.
    for (let q = 0; q < 7; q += 1) {
      const u = lerp(4, L - 10, unitHash(id, 300 + q));
      const v = lerp(4, D - 6, unitHash(id, 310 + q));
      B.boite('details', 'brique', [u, u + 7], [0, 3], [v, v + 3.5], { rot: (unitHash(id, 320 + q) - 0.5) * 120 });
    }
  }
  if (variante === 'B') {
    // Pans de mur de brique couchés sur le tas.
    for (let q = 0; q < 2; q += 1) {
      const w = L * (0.22 + unitHash(id, 400 + q) * 0.12);
      const d = D * (0.35 + unitHash(id, 410 + q) * 0.2);
      const u = lerp(0, L - w, q === 0 ? 0.1 + unitHash(id, 420) * 0.2 : 0.55 + unitHash(id, 421) * 0.3);
      const v = lerp(0, D - d, unitHash(id, 430 + q));
      const y = 4 + unitHash(id, 440 + q) * 6;
      B.boite('corps', 'colonne', [u, u + w], [y, y + 4], [v, v + d], { rot: (unitHash(id, 450 + q) - 0.5) * 30, dy: [0, 3, 5, 1], faces: 'cotes' });
      const R = (pu, pv) => {
        const a = (unitHash(id, 450 + q) - 0.5) * 30 * DEG;
        const cx = u + w / 2;
        const cz = v + d / 2;
        return [cx + (pu - cx) * Math.cos(a) - (pv - cz) * Math.sin(a), cz + (pu - cx) * Math.sin(a) + (pv - cz) * Math.cos(a)];
      };
      const c = [[u, v, 0], [u, v + d, 3], [u + w, v + d, 5], [u + w, v, 1]].map(([pu, pv, dh]) => {
        const [ru, rv] = R(pu, pv);
        return [ru, y + 4 + dh + 0.15, rv];
      });
      B.plaque('details', 'briques', c);
    }
    // Chaise de bois renversée, pieds en l'air.
    const s = Math.min(26, D * 0.5, L * 0.18);
    const u = L * (0.62 + unitHash(id, 460) * 0.2) - s / 2;
    const v = D * 0.5 - s / 2;
    const ys = 6;
    B.boite('corps', 'bois', [u, u + s], [ys, ys + 2.5], [v, v + s], { rot: 12 });
    const R = (pu, pv) => {
      const a = 12 * DEG;
      const cx = u + s / 2;
      const cz = v + s / 2;
      return [cx + (pu - cx) * Math.cos(a) - (pv - cz) * Math.sin(a), cz + (pu - cx) * Math.sin(a) + (pv - cz) * Math.cos(a)];
    };
    for (const [fu, fv] of [[0.12, 0.12], [0.88, 0.12], [0.12, 0.88], [0.88, 0.88]]) {
      const [pu, pv] = R(u + s * fu, v + s * fv);
      B.barre('corps', 'bois-sombre', [pu, ys + 2.5, pv], [pu + (fu - 0.5) * 2, Math.min(H - 1, ys + 2.5 + s * 0.9), pv + (fv - 0.5) * 2], 2.2);
    }
    const [d0u, d0v] = R(u, v + s);
    const [d1u, d1v] = R(u + s, v + s);
    B.boite('details', 'manche', [Math.min(d0u, d1u), Math.max(d0u, d1u)], [ys - 4, ys - 1.5], [Math.min(d0v, d1v), Math.min(d0v, d1v) + 4]);
  }
  if (variante === 'C') {
    // Plaques de plâtre du plafond, inclinées, et lattes.
    for (let q = 0; q < 3; q += 1) {
      const w = L * (0.16 + unitHash(id, 500 + q) * 0.12);
      const d = D * (0.3 + unitHash(id, 510 + q) * 0.25);
      const u = lerp(0, L - w, (q + unitHash(id, 520 + q)) / 3);
      const v = lerp(0, D - d, unitHash(id, 530 + q));
      const y = 5 + unitHash(id, 540 + q) * 8;
      const t = unitHash(id, 550 + q) * 8;
      B.boite('details', 'platre', [u, u + w], [y, y + 1.5], [v, v + d], { dy: [0, t, t, 0], rot: (unitHash(id, 560 + q) - 0.5) * 40 });
    }
    for (let q = 0; q < 4; q += 1) {
      const u = lerp(6, L - 6, unitHash(id, 600 + q));
      const v = lerp(4, D - 4, unitHash(id, 610 + q));
      const a = unitHash(id, 620 + q) * Math.PI;
      const len = 20 + unitHash(id, 630 + q) * 20;
      B.barre('details', 'manche', [u, 9 + q, v], [u + Math.cos(a) * len, 4 + q * 2, v + Math.sin(a) * len], 1.6);
    }
  }
}

// Contenu d'une tablette : conserves, couvertures pliées, boîtes, caisses de munitions, cartons (le long de u, de a à b, profondeur v0 → v1, posé à y).
function rangee(B, a, b, v0, v1, y, hMax, id, k0, genre) {
  let u = a;
  let k = k0;
  while (u < b - 4) {
    const r = unitHash(id, k);
    const w = Math.min(b - u, 10 + r * 12);
    const sorte = genre === 'munitions' ? (r > 0.25 ? 'munitions' : 'conserves') : genre === 'cartons' ? (r > 0.35 ? 'carton' : 'olive') : r < 0.4 ? 'conserves' : r < 0.75 ? 'couverture' : 'rations';
    const h = Math.min(hMax, sorte === 'conserves' ? 7 : sorte === 'couverture' ? 5 + r * 5 : 8 + r * 4);
    const vv0 = v0 + 0.5;
    const vv1 = v1 - (sorte === 'couverture' ? 0.5 : 1 + r * 2);
    if (sorte === 'conserves') {
      B.boite('details', 'fer', [u, u + w], [y, y + h], [vv0, vv1], { faces: 'cotes' });
      B.dessus('details', 'conserves', [u, u + w], y + h + 0.05, [vv0, vv1]);
    } else if (sorte === 'couverture') {
      B.boite('details', 'couverture', [u, u + w], [y, y + h], [vv0, vv1]);
    } else if (sorte === 'munitions' || sorte === 'rations') {
      B.boite('details', 'carton', [u, u + w], [y, y + h], [vv0, vv1], { faces: 'cotes' });
      B.dessus('details', sorte, [u, u + w], y + h + 0.05, [vv0, vv1]);
    } else B.boite('details', sorte, [u, u + w], [y, y + h], [vv0, vv1]);
    u += w + 1 + unitHash(id, k + 1) * 3;
    k += 2;
  }
}

// Étagère debout (côté ouvert vers v = D) : A intendance en bois, B rayonnage de tôle et cartons, C casier à munitions.
function etagereDebout(B, L, D, H, id, variante) {
  const bois = variante !== 'B';
  const montant = bois ? 'bois-sombre' : 'tole';
  const t = bois ? 3 : 2;
  for (const u of [0, L - t]) for (const v of [0, D - t]) B.boite('corps', montant, [u, u + t], [0, H], [v, v + t], { faces: 'cotes' });
  // Trois tablettes ; seule celle du haut, ouverte, se voit de dessus : son contenu est détaillé, celui des autres est une rangée vue de face.
  const niveaux = [2, H * 0.42, H - 15];
  const genre = variante === 'C' ? 'munitions' : variante === 'B' ? 'cartons' : 'intendance';
  niveaux.forEach((y, i) => {
    if (i > 0) B.boite('corps', bois ? 'etagere' : 'tole', [0.5, L - 0.5], [y, y + 2], [0.5, D - 0.5]);
    if (i === niveaux.length - 1) rangee(B, t + 1, L - t - 1, 0.5, D - 0.5, y + 2, 12, id, 100, genre);
    else {
      const h = Math.min(niveaux[i + 1] - y - 4, 14);
      B.boite('details', genre === 'munitions' ? 'olive' : genre === 'cartons' ? 'carton' : 'couverture', [t + 1, L - t - 1], [y + 2, y + 2 + h], [1.5, D - 2.5], { faces: 'cotes' });
    }
  });
}

// Étagère renversée (aspect « renversee » ; dessin sous 43) : A couchée sur le dos (tablettes en échelle, contenu dedans et répandu autour) ;
// B tombée en avant (dos de planches incliné sur son contenu, qui dépasse).
function etagereRenversee(B, L, D, H, id, variante) {
  const hs = Math.min(H, 18);
  const large = D > 70;
  const ws = large ? Math.min(D * 0.42, 52) : D * 0.72;
  const v0 = large ? D * (0.18 + unitHash(id, 1) * 0.12) : (D - ws) / 2;
  const v1 = v0 + ws;
  if (variante === 'B') {
    // Dos de planches : un bord au sol, l'autre posé sur le contenu.
    B.boite('corps', 'etagere', [1, L - 1], [0, 2], [v0, v1], { dy: [0, hs - 2, hs - 2, 0] });
    rangee(B, 2, L - 2, v1 - 0.5, Math.min(D, v1 + 9), 0, 6, id, 300, 'intendance');
  } else {
    // Couchée sur le dos : les deux côtés, les deux bouts, les tablettes en travers ; contenu entre les tablettes.
    B.boite('corps', 'bois-sombre', [0, L], [0, hs], [v0, v0 + 3]);
    B.boite('corps', 'bois-sombre', [0, L], [0, hs], [v1 - 3, v1]);
    B.boite('corps', 'bois-sombre', [0, 3], [0, hs], [v0 + 3, v1 - 3]);
    B.boite('corps', 'bois-sombre', [L - 3, L], [0, hs], [v0 + 3, v1 - 3]);
    B.boite('corps', 'etagere', [3, L - 3], [0, 1.5], [v0 + 3, v1 - 3]);
    const n = Math.max(2, Math.round(L / 32));
    for (let q = 1; q < n; q += 1) B.boite('corps', 'etagere', [(q * L) / n - 1, (q * L) / n + 1], [0, hs - 2], [v0 + 3, v1 - 3]);
    for (let q = 0; q < n; q += 1) if (unitHash(id, 200 + q) > 0.5) rangee(B, (q * L) / n + 2, ((q + 1) * L) / n - 2, v0 + 4, v1 - 4, 1.5, hs - 5, id, 220 + q * 10, 'intendance');
  }
  // Contenu répandu autour (jusqu'aux bords du rectangle).
  const bandes = large ? [[0, v0 - 0.5], [v1 + (variante === 'B' ? 10 : 0.5), D]] : [[0, v0 - 0.5], [v1 + 0.5, D]];
  bandes.forEach(([b0, b1], bi) => {
    if (b1 - b0 < 4) return;
    const n = Math.max(2, Math.round(((L / 16) * (b1 - b0)) / 64));
    for (let q = 0; q < n; q += 1) {
      const r = unitHash(id, 400 + bi * 50 + q);
      const u = lerp(0, L - 14, (q + unitHash(id, 420 + bi * 50 + q) * 0.8) / n);
      const w = 10 + r * 10;
      const d = Math.min(b1 - b0, 8 + r * 10);
      const v = lerp(b0, b1 - d, unitHash(id, 440 + bi * 50 + q));
      const rot = (r - 0.5) * 80;
      if (r < 0.4) {
        B.boite('details', 'fer', [u, u + w * 0.7], [0, 6.5], [v, v + d], { rot, faces: 'cotes' });
        B.dessus('details', 'conserves', [u, u + w * 0.7], 6.55, [v, v + d]);
      } else if (r < 0.7) B.boite('details', 'couverture', [u, u + w], [0, 3], [v, v + d], { rot });
      else {
        B.boite('details', 'carton', [u, u + w * 0.8], [0, 7], [v, v + d * 0.8], { rot, faces: 'cotes' });
        B.dessus('details', 'rations', [u, u + w * 0.8], 7.05, [v, v + d * 0.8]);
      }
    }
    // Conserves aux coins du rectangle (remplissage).
    for (const u of [0, L - 6]) {
      const v = bi === 0 ? 0 : D - 6;
      B.boite('details', 'fer', [u, u + 6], [0, 6.5], [v, v + 6], { faces: 'cotes' });
      B.dessus('details', 'conserves', [u, u + 6], 6.55, [v, v + 6]);
    }
  });
}

// Classeurs (côté ouvert vers v = D) : A tôle olive (corps de tôle, façades à tiroirs olive), B bois ; le tiroir du haut d'un des meubles est ouvert
// (vu de dessus : les dossiers dans le tiroir), papiers sur les autres.
function classeurs(B, L, D, H, id, variante) {
  const n = Math.max(1, Math.round(L / 26));
  const w = L / n;
  const ouvert = Math.floor(unitHash(id, 5) * n);
  const corps = variante === 'B' ? 'bois-sombre' : 'tole';
  const facade = variante === 'B' ? 'tiroirs-bois' : 'tiroirs';
  for (let q = 0; q < n; q += 1) {
    const u0 = q * w + (q === 0 ? 0 : 0.5);
    const u1 = (q + 1) * w - (q === n - 1 ? 0 : 0.5);
    const avant = D - 1.5;
    if (q === ouvert) {
      // Tiroir du haut ouvert : le meuble est plus bas à l'avant, le tiroir sort jusqu'au bord avec ses dossiers.
      const yo = H - Math.min(16, H * 0.24);
      B.boite('corps', corps, [u0, u1], [0, H], [0, D * 0.42]);
      B.boite('corps', corps, [u0, u1], [0, yo], [D * 0.42, avant], { faces: 'tout' });
      B.boite('details', 'olive-sombre', [u0 + 1, u1 - 1], [yo, H - 2], [D * 0.42, D], { faces: 'cotes' });
      B.dessus('details', 'dossiers', [u0 + 1.5, u1 - 1.5], H - 2.5, [D * 0.42 + 0.5, D - 0.5], { fenetre: [0, 0.5, 1, 1] });
      B.plaque('details', facade, [[u0, 0, avant + 0.1], [u0, yo, avant + 0.1], [u1, yo, avant + 0.1], [u1, 0, avant + 0.1]], { uv: [[0, 0], [0, 0.75], [1, 0.75], [1, 0]], vers: [(u0 + u1) / 2, yo / 2, D + 10] });
    } else {
      B.boite('corps', corps, [u0, u1], [0, H], [0, avant]);
      B.plaque('details', facade, [[u0, 0, avant + 0.1], [u0, H, avant + 0.1], [u1, H, avant + 0.1], [u1, 0, avant + 0.1]], { vers: [(u0 + u1) / 2, H / 2, D + 10] });
      if (unitHash(id, 10 + q) > 0.3) B.dessus('details', 'dossiers', [u0 + 1, u1 - 1], H + 0.15, [1, avant - 1], { fenetre: [0, 0, 1, 0.5] });
    }
  }
}

// Bureau (côté ouvert vers v = D, côté de la chaise) : A bureau d'officier (caisson à tiroirs, sous-main, encrier, papiers) ; B table de campagne
// pliante (pieds en X, carte inventée, sacoche).
function bureau(B, L, D, H, id, variante) {
  if (variante === 'B') {
    B.boite('corps', 'bois', [0, L], [H - 2, H], [0, D]);
    for (const u of [3, L - 3]) {
      B.barre('corps', 'bois-sombre', [u, 0.5, 2], [u, H - 2, D - 2], 2);
      B.barre('corps', 'bois-sombre', [u, 0.5, D - 2], [u, H - 2, 2], 2);
    }
    B.dessus('details', 'bureau', [L * 0.12, L * 0.88], H + 0.15, [D * 0.1, D * 0.9], { fenetre: [0.5, 0, 1, 1] });
    B.boite('details', 'toile', [L * 0.7, L * 0.95], [H, H + 5], [D * 0.15, D * 0.5], { rot: 10 });
    return;
  }
  B.boite('corps', 'bois', [0, L], [H - 3, H], [0, D]);
  const cais = L > 50 ? Math.min(L * 0.38, 30) : L * 0.5;
  B.boite('corps', 'bois-sombre', [L - cais, L - 1], [0, H - 3], [1, D - 1]);
  B.plaque('details', 'tiroirs-bois', [[L - cais, 0.5, D - 0.9], [L - cais, H - 3.5, D - 0.9], [L - 1, H - 3.5, D - 0.9], [L - 1, 0.5, D - 0.9]], { uv: [[0, 0], [0, 1], [0.5, 1], [0.5, 0]], vers: [L - cais / 2, H / 2, D + 10] });
  B.boite('corps', 'bois-sombre', [1, L - cais], [6, H - 3], [1, 3], { faces: 'cotes' });
  B.barre('corps', 'bois-sombre', [2, 0, D - 2], [2, H - 3, D - 2], 2.5);
  // Dessus : sous-main, papiers, encrier, porte-plume.
  B.dessus('details', 'bureau', [L * 0.2, L * 0.2 + Math.min(L * 0.5, 34)], H + 0.15, [D * 0.2, D * 0.82], { fenetre: [0, 0, 0.5, 1] });
  B.dessus('details', 'dossiers', [L * 0.06, L * 0.06 + Math.min(L * 0.25, 18)], H + 0.3, [D * 0.1, D * 0.6], { fenetre: [0, 0, 1, 0.5] });
  B.cylindre('details', 'noir', L * 0.8, D * 0.3, H, H + 3, 1.8, 6);
  B.barre('details', 'laiton', [L * 0.74, H + 0.6, D * 0.55], [L * 0.86, H + 0.6, D * 0.62], 0.7);
}

// Tabouret (A, de bois, siège rond, quatre pieds écartés) ou chaise de bois (B, dossier) ; une caisse ou un sac comble le reste du rectangle.
function tabouret(B, L, D, H, id, variante) {
  const s = Math.min(L, D, 40);
  const reste = L - s; // le long du grand côté
  if (variante === 'B') {
    const ys = 26;
    for (const [u, v] of [[2, 2], [s - 2, 2], [2, D - 2], [s - 2, D - 2]]) B.barre('corps', 'bois-sombre', [u, 0, v], [u, ys, v], 2.4);
    B.boite('corps', 'bois', [0.5, s - 0.5], [ys, ys + 2.5], [0.5, D - 0.5]);
    B.barre('corps', 'bois-sombre', [2, ys, 2], [2, Math.max(H, PLANCHER_BLOQUE + 2), 2], 2.4);
    B.barre('corps', 'bois-sombre', [s - 2, ys, 2], [s - 2, Math.max(H, PLANCHER_BLOQUE + 2), 2], 2.4);
    B.boite('corps', 'bois', [1, s - 1], [ys + 10, Math.max(H, PLANCHER_BLOQUE + 2) - 1], [1, 3.5]);
  } else {
    const r = s * 0.34;
    const c = [s / 2, D / 2];
    const ys = Math.max(H, PLANCHER_BLOQUE + 2) - 3;
    for (const [fu, fv] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      B.barre('corps', 'bois-sombre', [c[0] + fu * r * 0.55, ys, c[1] + fv * r * 0.55], [fu < 0 ? 1.5 : s - 1.5, 0, fv < 0 ? 1.5 : D - 1.5], 2.6);
    }
    B.barre('corps', 'bois-sombre', [s * 0.2, ys * 0.35, D * 0.22], [s * 0.8, ys * 0.35, D * 0.22], 1.6);
    B.barre('corps', 'bois-sombre', [s * 0.2, ys * 0.35, D * 0.78], [s * 0.8, ys * 0.35, D * 0.78], 1.6);
    B.cylindre('corps', 'bois', c[0], c[1], ys, ys + 3, r, 8, Math.PI / 8);
  }
  if (reste > 6) {
    if (variante === 'B') sac(B, [s + 1, L], [D * 0.15, D * 0.85], 11, 8);
    else caisse(B, [s + 1, L], [D * 0.12, D * 0.88], 0, 20, 'munitions');
  }
}

// Lampe tempête éteinte (verre sombre : rien de vif) posée à (u, v, y).
function lampeTempete(B, u, v, y) {
  B.cylindre('details', 'olive', u, v, y, y + 2.5, 3.2, 6);
  B.cylindre('details', 'verre', u, v, y + 2.5, y + 10, 2.4, 6);
}

// Comptoir (côté ouvert vers v = D) : A établi (plateau épais, pieds, tablette basse, marteau, scie, clé, étau, lampe tempête) ; B comptoir de
// planches (façade pleine, registre, caisse, jerrycan, lampe tempête).
function comptoir(B, L, D, H, id, variante) {
  const e = 4;
  B.boite('corps', 'bois', [0, L], [H - e, H], [0, D], { faces: 'cotes' });
  B.dessus('details', 'etabli', [0, L], H + 0.05, [0, D]);
  if (variante === 'B') {
    B.boite('corps', 'bois-sombre', [2, L - 2], [0, H - e], [2, D - 3]);
    B.dessus('details', 'dossiers', [L * 0.1, L * 0.1 + Math.min(18, L * 0.3)], H + 0.3, [D * 0.15, D * 0.15 + Math.min(22, D * 0.35)], { fenetre: [0, 0.5, 1, 1] });
    const cu = L * 0.55;
    const cv = D * 0.5;
    caisse(B, [cu - 9, cu + 9], [cv - 6, cv + 6], H, Math.min(HAUTEUR_MAX, H + 10), 'rations');
    lampeTempete(B, L * 0.85, D * 0.75, H);
    return;
  }
  for (const [u, v] of [[0, 0], [L - 5, 0], [0, D - 5], [L - 5, D - 5]]) B.boite('corps', 'bois-sombre', [u, u + 5], [0, H - e], [v, v + 5], { faces: 'cotes' });
  B.boite('corps', 'etagere', [1, L - 1], [9, 11], [1, D - 1]);
  caisse(B, [L * 0.15, L * 0.15 + Math.min(26, L * 0.4)], [D * 0.2, D * 0.8], 11, 26, null);
  // Outils sur le plateau : marteau, scie, clé ; étau à un coin.
  const long = L >= D;
  const A = (a, b) => (long ? [a * L, b * D] : [b * L, a * D]);
  const [m0u, m0v] = A(0.2, 0.3);
  const [m1u, m1v] = A(0.42, 0.36);
  B.barre('details', 'manche', [m0u, H + 0.8, m0v], [m1u, H + 0.8, m1v], 1.4);
  B.boite('details', 'acier', [m1u - 1.5, m1u + 1.5], [H, H + 2], [m1v - 3, m1v + 3]);
  const [s0u, s0v] = A(0.5, 0.62);
  const [s1u, s1v] = A(0.78, 0.7);
  B.plaque('details', 'acier', [[s0u, H + 0.3, s0v], [s0u, H + 0.3, s0v + 5], [s1u, H + 0.3, s1v + 3], [s1u, H + 0.3, s1v]]);
  const [k0u, k0v] = A(0.25, 0.75);
  const [k1u, k1v] = A(0.4, 0.68);
  B.barre('details', 'acier', [k0u, H + 0.6, k0v], [k1u, H + 0.6, k1v], 1.2);
  const [eu, ev] = A(0.92, 0.2);
  B.boite('details', 'acier', [eu - 4, eu + 3], [H, H + 6], [ev - 3, ev + 3]);
  const [lu, lv] = A(0.85, 0.72);
  lampeTempete(B, lu, lv, H);
}

// Muret : A sacs de sable (toile de jute, rangs décalés, sacs du dessus arrondis) ; B muret de pierre écroulé (dessus irrégulier, pierres tombées).
function muret(B, L, D, H, id, variante) {
  if (variante === 'B') {
    const n = Math.max(3, Math.round(L / 60));
    for (let q = 0; q < n; q += 1) {
      const u0 = (q * L) / n;
      const u1 = ((q + 1) * L) / n;
      const h = Math.max(PLANCHER_BLOQUE + 1, H - unitHash(id, q) * 5);
      const dy = [0, 1, 2, 3].map((k) => -unitHash(id, q * 4 + k + 20) * 3);
      B.boite('corps', 'colonne', [u0, u1], [0, h], [0, D], { dy, faces: 'cotes' });
      B.plaque('details', 'pierre', [[u0, h + dy[0] + 0.15, 0], [u0, h + dy[1] + 0.15, D], [u1, h + dy[2] + 0.15, D], [u1, h + dy[3] + 0.15, 0]]);
      B.plaque('details', 'pierre', [[u0, 0, D + 0.1], [u0, h + dy[1], D + 0.1], [u1, h + dy[2], D + 0.1], [u1, 0, D + 0.1]], { uv: [[0, 0], [0, 1], [1, 1], [1, 0]], vers: [(u0 + u1) / 2, h / 2, D + 10] });
      if (unitHash(id, q + 60) > 0.5) B.boite('details', 'gravier', [lerp(u0, u1, 0.3), lerp(u0, u1, 0.3) + 8], [h - 2, h + 2], [D * 0.2, D * 0.7], { rot: 20 });
    }
    return;
  }
  const rangs = 3;
  const hr = H / rangs;
  const sacL = 28;
  for (let r = 0; r < rangs; r += 1) {
    const decal = r % 2 === 1 ? sacL / 2 : 0;
    const coupes = [0];
    for (let u = decal + sacL * 4; u < L - 8; u += sacL * 4) coupes.push(u);
    coupes.push(L);
    const haut = r === rangs - 1;
    for (let q = 0; q + 1 < coupes.length; q += 1) {
      const u0 = coupes[q] + (q === 0 ? 0 : 0.4);
      const u1 = coupes[q + 1] - (q + 2 === coupes.length ? 0 : 0.4);
      // Sacs du dessus arrondis (dessus rentré) ; jute de la région « sacsable » (rangs de sacs dessinés, 28 de long).
      B.boite('details', 'sacsable', [u0, u1], [r * hr, haut ? H : (r + 1) * hr], [haut ? 1 : 0, haut ? D - 1 : D], { retrait: haut ? 0.03 : 0 });
    }
  }
}

const HAUTEURS = { caisses: 40, gravats: 30, etagere: 64, renversee: 18, classeur: 60, bureau: 48, tabouret: 46, comptoir: 54, muret: 48 };

// Dessin de 1942 d'une pièce. spec : { aspect, variante, rect: { x, y, w, h } (rectangle cible), hauteur (dessin du lot 3g), passe (les tirs passent),
// ouverture (n, s, e, w), feu ({ x, y } du jeu ou null), id }. → { corps, details, hauteur, emprise: { x, y, w, h }, compte: { corps, details } }.
export function modeleMeuble(spec) {
  const s = spec && typeof spec === 'object' ? spec : {};
  const rect = s.rect && [s.rect.x, s.rect.y, s.rect.w, s.rect.h].every(isNum) && s.rect.w > 0 && s.rect.h > 0 ? s.rect : null;
  if (!rect) return { corps: [], details: [], hauteur: 0, emprise: null, compte: { corps: 0, details: 0 } };
  const aspect = ASPECTS.includes(s.aspect) ? s.aspect : 'caisses';
  const variante = VARIANTES[aspect].includes(s.variante) ? s.variante : DEFAUTS[aspect];
  const passe = s.passe === true;
  const plafond = passe ? PLAFOND_PASSE : HAUTEUR_MAX;
  const base = num(s.hauteur, HAUTEURS[aspect]);
  const H = clamp(aspect === 'renversee' ? Math.min(base > 8 ? 20 : 18, plafond) : base, passe ? 6 : PLANCHER_BLOQUE, plafond);
  const id = String(s.id ?? '');
  const ouv = ['n', 's', 'e', 'w'].includes(s.ouverture) ? s.ouverture : 's';
  const c = cadre(rect, ouv);
  const B = constructeur(c);
  // Feu : point du jeu → local (u, v).
  let feu = null;
  if (s.feu && isNum(s.feu.x) && isNum(s.feu.y)) {
    const inv = { s: () => [s.feu.x - rect.x, s.feu.y - rect.y], n: () => [rect.x + rect.w - s.feu.x, rect.y + rect.h - s.feu.y], e: () => [rect.y + rect.h - s.feu.y, s.feu.x - rect.x], w: () => [s.feu.y - rect.y, rect.x + rect.w - s.feu.x] }[c.ouverture]();
    feu = { u: inv[0], v: inv[1] };
  }
  const { L, D } = c;
  if (aspect === 'caisses') pileCaisses(B, L, D, H, id, variante, feu);
  else if (aspect === 'gravats') tasGravats(B, L, D, H, id, variante);
  else if (aspect === 'etagere') etagereDebout(B, L, D, H, id, variante);
  else if (aspect === 'renversee') etagereRenversee(B, L, D, H, id, variante);
  else if (aspect === 'classeur') classeurs(B, L, D, H, id, variante);
  else if (aspect === 'bureau') bureau(B, L, D, H, id, variante);
  else if (aspect === 'tabouret') tabouret(B, L, D, H, id, variante);
  else if (aspect === 'comptoir') comptoir(B, L, D, H, id, variante);
  else muret(B, L, D, H, id, variante);
  // Classe de tirs tenue quel que soit l'aspect (aspect forcé par le fichier de choix) : dessin trop haut pour une pièce dont les tirs passent,
  // ou trop bas pour une pièce qui les arrête : hauteurs mises à l'échelle (sous 43, ou juste au-dessus).
  const hautBrut = Math.max(0, ...B.pieces.flatMap((q) => q.pts.map((pt) => pt[1])));
  const f = passe && hautBrut > PLAFOND_PASSE ? PLAFOND_PASSE / hautBrut : !passe && hautBrut > 0 && hautBrut < PLANCHER_BLOQUE ? (PLANCHER_BLOQUE + 0.5) / hautBrut : 1;
  if (f !== 1) for (const q of B.pieces) q.pts = q.pts.map((pt) => [pt[0], pt[1] * f, pt[2]]);
  const tris = trianguler(B.pieces, rect, plafond, id);
  const tout = [...tris.corps, ...tris.details];
  let emprise = null;
  let hauteur = 0;
  if (tout.length) {
    let x0 = Infinity;
    let x1 = -Infinity;
    let z0 = Infinity;
    let z1 = -Infinity;
    for (const t of tout) for (const p of t.p) {
      x0 = Math.min(x0, p[0]);
      x1 = Math.max(x1, p[0]);
      z0 = Math.min(z0, p[2]);
      z1 = Math.max(z1, p[2]);
      hauteur = Math.max(hauteur, p[1]);
    }
    emprise = { x: r3(x0), y: r3(z0), w: r3(x1 - x0), h: r3(z1 - z0) };
  }
  return { aspect, variante, corps: tris.corps, details: tris.details, hauteur: r3(hauteur), emprise, compte: { corps: tris.corps.length, details: tris.details.length } };
}

// Écarts au sol entre une emprise dessinée et son rectangle (unités et part du côté) : { o, e, n, s, max (part) }.
export function ecarts(emprise, rect) {
  if (!emprise || !rect) return { o: rect?.w ?? 0, e: rect?.w ?? 0, n: rect?.h ?? 0, s: rect?.h ?? 0, max: 1 };
  const o = Math.max(0, emprise.x - rect.x);
  const e = Math.max(0, rect.x + rect.w - (emprise.x + emprise.w));
  const n = Math.max(0, emprise.y - rect.y);
  const s = Math.max(0, rect.y + rect.h - (emprise.y + emprise.h));
  return { o: r3(o), e: r3(e), n: r3(n), s: r3(s), max: r3(Math.max(o / rect.w, e / rect.w, n / rect.h, s / rect.h)) };
}

// Dessin de 1942 des pièces d'une section (mobilier.world.json → pieces[id].epoque) : [{ id, floor, ...modeleMeuble }] ; « actuel » : rien.
export function piecesEpoque(pieces) {
  const out = [];
  for (const [id, p] of Object.entries(pieces && typeof pieces === 'object' ? pieces : {})) {
    const e = p?.epoque;
    if (!e || e.variante === 'actuel') continue;
    out.push({ id, floor: p.floor, ...modeleMeuble({ ...e, id }) });
  }
  return out;
}

// Entrées de ciblesMobilier d'après mobilier.world.json (pièces : floor, obstacle, boxes) et les obstacles de chaque étage : rectangle de départ =
// emprise des boîtes du lot 3g (dans la collision). Pièces remplacées (tables du lot 9i : `remplaces`, « étage:id ») exclues.
export function entreesMobilier(pieces, obstacles = {}, remplaces = new Set()) {
  const out = [];
  for (const [id, p] of Object.entries(pieces && typeof pieces === 'object' ? pieces : {})) {
    if (!p || remplaces.has(`${p.floor}:${id}`) || !Array.isArray(p.boxes) || p.boxes.length === 0) continue;
    const o = (obstacles[p.floor] ?? []).find((q) => q.id === p.obstacle);
    if (!o) continue;
    const x0 = Math.min(...p.boxes.map((b) => b.x0));
    const x1 = Math.max(...p.boxes.map((b) => b.x1));
    const z0 = Math.min(...p.boxes.map((b) => b.z0));
    const z1 = Math.max(...p.boxes.map((b) => b.z1));
    out.push({ id, floor: p.floor, look: p.look, obstacle: { x: o.x, y: o.y, w: o.w, h: o.h }, plan: { x: x0, y: z0, w: x1 - x0, h: z1 - z0 }, hauteur: Math.max(...p.boxes.map((b) => b.y1)) });
  }
  return out;
}

// Dessin de 1942 de chaque pièce (spécifications de modeleMeuble), d'après mobilier.world.json et les mondes : rectangle cible, aspect (proposé
// d'après le lot 3g, ou forcé par le fichier de choix), variante retenue (ou « actuel »), hauteur du lot 3g, classe de tirs, côté ouvert, feu posé.
// entrees : { pieces (mobilier.world.json → pieces), obstacles: { rdc, etage }, murs: { rdc, etage } (rectangles), tirs: { rdc: [ids], etage: [ids] },
// feux: [{ floor, piece }], remplaces: Set (« étage:id »), choix (sortie de lireChoix) } → [{ id, floor, obstacle, rect, aspect, aspectPropose, ...spec }].
export function specsMobilier({ pieces, obstacles = {}, murs = {}, tirs = {}, feux = [], remplaces = new Set(), choix = lireChoix(null) } = {}) {
  const entrees = entreesMobilier(pieces, obstacles, remplaces);
  const cibles = ciblesMobilier(entrees);
  return entrees.map((p) => {
    const rect = cibles[p.id];
    const aspectPropose = aspectDuLook(p.look, rect);
    const aspect = choix.pieces[p.id] ?? aspectPropose;
    const obstacle = pieces[p.id].obstacle; // identifiant de l'obstacle (collision : son rectangle)
    const passe = (tirs[p.floor] ?? []).includes(obstacle);
    const fe = (Array.isArray(feux) ? feux : []).find((f) => f && f.piece === p.id && f.floor === p.floor);
    const feu = fe ? { x: r3(p.plan.x + p.plan.w / 2), y: r3(p.plan.y + p.plan.h / 2) } : null;
    return { id: p.id, floor: p.floor, obstacle, collision: p.obstacle, depart: p.plan, rect, aspect, aspectPropose, variante: choix.variantes[aspect], hauteur: r3(p.hauteur), passe, ouverture: ouvertureDe(rect, murs[p.floor]), feu };
  });
}
