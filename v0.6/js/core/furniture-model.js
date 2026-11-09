// Modèles de meubles (lot 3c, retour du propriétaire) : une table, une chaise ou une armoire se dessinent avec quelques boîtes, au lieu d'un seul cube.
// Pur : n'utilise que le rectangle { x, y, w, h, hauteur, kind } reçu, renvoie de nouveaux objets, ne lève aucune exception. Les collisions, les balles et le laser
// gardent le rectangle d'origine : seul le dessin change. Une boîte : { x0, x1, y0, y1, z0, z1, region, faces } (y = hauteur, z = y du jeu ; faces : « tout » ou
// « cotes »). `body` : boîtes qui projettent une ombre ; `detail` : pieds, dossiers et socles, sans ombre portée (budget de dessin).
import { isNum, num } from './vec.js';

export const KINDS = Object.freeze(['chaise', 'armoire', 'boite']);
const CHAIR_AREA = 6500; // seul un petit meuble seul (aire au plus, une seule cellule) devient une chaise ; les autres restent des blocs
const LONG_RATIO = 2.5; // un « long cube » (rapport des côtés au moins) devient une rangée d'armoires
const CELL = 80;
const MODULE = 170; // une armoire par tranche de 170 de long (4 au plus)

// Rectangle du plan d'un meuble : celui d'origine si f est déjà une boîte de collision ajustée (f.plan).
const planOf = (f) => (f && f.plan ? f.plan : f);
const valid = (r) => r && isNum(r.x) && isNum(r.y) && isNum(r.w) && isNum(r.h) && r.w > 0 && r.h > 0;

// Genre du modèle d'un meuble : armoire pour étagère et armoire (et les longs cubes), chaise pour un petit meuble seul (caisse, table ou comptoir), sinon bloc (tables
// et grands meubles restent des blocs, comme piliers, escaliers et colonnes).
export function modelKind(f) {
  const r = planOf(f);
  if (!valid(r)) return 'boite';
  const kind = f.kind;
  if (kind === 'pilier' || kind === 'escalier' || kind === 'colonne') return 'boite';
  if (kind === 'etagere' || kind === 'armoire') return 'armoire';
  if (r.w * r.h <= CHAIR_AREA && Math.round(r.w / CELL) <= 1 && Math.round(r.h / CELL) <= 1) return 'chaise';
  if (Math.max(r.w, r.h) / Math.min(r.w, r.h) >= LONG_RATIO) return 'armoire';
  return 'boite';
}

const chairSize = (r) => Math.max(6, Math.min(40, Math.min(r.w, r.h) - 8));

// Boîte de collision d'un meuble : une chaise ne bloque que son assise (centrée dans son rectangle) ; tout autre meuble garde son rectangle. Le rectangle d'origine
// est conservé dans `plan` pour le dessin. Renvoie un nouvel objet.
export function furnitureHitbox(f) {
  if (modelKind(f) !== 'chaise' || f.plan) return { ...f };
  const s = chairSize(f);
  return { ...f, x: f.x + (f.w - s) / 2, y: f.y + (f.h - s) / 2, w: s, h: s, plan: { x: f.x, y: f.y, w: f.w, h: f.h } };
}

// Côté du rectangle r le plus proche d'un mur ('n' nord, 's' sud, 'w' ouest, 'e' est) ; 'n' sans mur. walls : rectangles { x, y, w, h }.
export function wallSide(r, walls) {
  let best = 'n';
  let bestGap = Infinity;
  for (const w of Array.isArray(walls) ? walls : []) {
    if (!valid(w)) continue;
    const overlapX = Math.min(r.x + r.w, w.x + w.w) - Math.max(r.x, w.x) > 0;
    const overlapY = Math.min(r.y + r.h, w.y + w.h) - Math.max(r.y, w.y) > 0;
    const cand = [];
    if (overlapX) cand.push(['n', r.y - (w.y + w.h)], ['s', w.y - (r.y + r.h)]);
    if (overlapY) cand.push(['w', r.x - (w.x + w.w)], ['e', w.x - (r.x + r.w)]);
    for (const [side, gap] of cand) if (gap >= -1e-6 && gap < bestGap) { bestGap = gap; best = side; }
  }
  return best;
}

const box = (x0, x1, y0, y1, z0, z1, region, faces = 'tout') => ({ x0, x1, y0, y1, z0, z1, region, faces });

// Pièces d'un meuble : { kind, body: [boîtes], detail: [boîtes] }. Toutes les boîtes restent dans le rectangle du plan du meuble et sous sa hauteur (chaise : 48 au plus).
// walls (facultatif) : murs, pour tourner une chaise dossier contre le mur le plus proche.
export function furnitureParts(f, regionOf = {}, walls = []) {
  const kind = modelKind(f);
  const r = planOf(f);
  const H = Math.max(1, num(f?.hauteur, 45));
  const main = (regionOf !== null && typeof regionOf === 'object' ? regionOf[f?.kind] : undefined) ?? 'bois';
  const dark = f?.kind === 'comptoir' ? main : 'bois-sombre';
  if (!valid(r)) return { kind: 'boite', body: [], detail: [] };
  const { x, y, w, h } = r;
  if (kind === 'boite') return { kind, body: [box(x, x + w, 0, H, y, y + h, main)], detail: [] };
  if (kind === 'chaise') {
    const s = chairSize(r);
    const x0 = x + (w - s) / 2;
    const z0 = y + (h - s) / 2;
    const seatY = Math.min(H * 0.6, 26);
    const back = Math.min(4, s / 4);
    const side = wallSide({ x, y, w, h }, walls);
    // dossier du côté du mur : la chaise tourne le dos au mur
    const bk = { n: [x0, x0 + s, z0, z0 + back], s: [x0, x0 + s, z0 + s - back, z0 + s], w: [x0, x0 + back, z0, z0 + s], e: [x0 + s - back, x0 + s, z0, z0 + s] }[side];
    return {
      kind,
      body: [],
      detail: [
        box(x0, x0 + s, seatY - 4, seatY, z0, z0 + s, main),
        box(bk[0], bk[1], seatY, seatY + 22, bk[2], bk[3], dark),
        box(x0 + s * 0.2, x0 + s * 0.8, 0, seatY - 4, z0 + s * 0.2, z0 + s * 0.8, dark, 'cotes'),
      ],
    };
  }
  // armoire : une rangée de modules le long du plus grand côté, sur un socle
  const alongX = w >= h;
  const length = alongX ? w : h;
  const n = Math.max(1, Math.min(4, Math.round(length / MODULE)));
  const gap = n > 1 ? 2 : 0;
  const step = (length - gap * (n - 1)) / n;
  const plinth = 0; // pas de socle séparé (budget de triangles)
  const body = [];
  for (let i = 0; i < n; i += 1) {
    const a = i * (step + gap);
    body.push(alongX ? box(x + a, x + a + step, plinth, H, y, y + h, main) : box(x, x + w, plinth, H, y + a, y + a + step, main));
  }
  return { kind, body, detail: [] };
}
