// Modèles de meubles (lot 3c, retour du propriétaire) : une table, une chaise ou une armoire se dessinent avec quelques boîtes, au lieu d'un seul cube.
// Pur : n'utilise que le rectangle { x, y, w, h, hauteur, kind } reçu, renvoie de nouveaux objets, ne lève aucune exception. Les collisions, les balles et le laser
// gardent le rectangle d'origine : seul le dessin change. Une boîte : { x0, x1, y0, y1, z0, z1, region, faces } (y = hauteur, z = y du jeu ; faces : « tout » ou
// « cotes »). `body` : boîtes qui projettent une ombre ; `detail` : pieds, dossiers et socles, sans ombre portée (budget de dessin).
import { isNum, num } from './vec.js';

export const KINDS = Object.freeze(['table', 'chaise', 'armoire', 'boite']);
const CHAIR_AREA = 6500; // un meuble « petit carré » (aire au plus) devient une ou plusieurs chaises
const LONG_RATIO = 2.5; // un « long cube » (rapport des côtés au moins) devient une rangée d'armoires
const CELL = 80; // une chaise par cellule de 80 de côté
const MODULE = 120; // une armoire par tranche de 120 de long (4 au plus)

// Genre du modèle d'un meuble : armoire pour étagère et armoire (et les longs cubes), chaise pour les petits carrés et les caisses, table pour les grands, sinon boîte.
export function modelKind(f) {
  if (!f || !isNum(f.x) || !isNum(f.y) || !isNum(f.w) || !isNum(f.h) || f.w <= 0 || f.h <= 0) return 'boite';
  const kind = f.kind;
  if (kind === 'pilier' || kind === 'escalier' || kind === 'colonne') return 'boite';
  if (kind === 'etagere' || kind === 'armoire') return 'armoire';
  if (kind === 'caisse' || f.w * f.h <= CHAIR_AREA) return 'chaise';
  if (Math.max(f.w, f.h) / Math.min(f.w, f.h) >= LONG_RATIO) return 'armoire';
  return 'table';
}

const box = (x0, x1, y0, y1, z0, z1, region, faces = 'tout') => ({ x0, x1, y0, y1, z0, z1, region, faces });

// Pièces d'un meuble : { kind, body: [boîtes], detail: [boîtes] }. Toutes les boîtes restent dans le rectangle du meuble et sous sa hauteur.
export function furnitureParts(f, regionOf = {}) {
  const kind = modelKind(f);
  const H = Math.max(1, num(f?.hauteur, 45));
  const main = (regionOf !== null && typeof regionOf === 'object' ? regionOf[f?.kind] : undefined) ?? 'bois';
  const dark = f?.kind === 'comptoir' ? main : 'bois-sombre';
  if (kind === 'boite') return { kind, body: isNum(f?.x) && f.w > 0 && f.h > 0 ? [box(f.x, f.x + f.w, 0, H, f.y, f.y + f.h, main)] : [], detail: [] };
  const { x, y, w, h } = f;
  if (kind === 'table') {
    const top = Math.min(8, H * 0.2);
    const leg = Math.min(8, w / 4, h / 4);
    const inset = Math.min(3, leg / 2);
    const legs = [[x + inset, y + inset], [x + w - inset - leg, y + inset], [x + inset, y + h - inset - leg], [x + w - inset - leg, y + h - inset - leg]];
    return { kind, body: [box(x, x + w, H - top, H, y, y + h, main)], detail: legs.map(([lx, lz]) => box(lx, lx + leg, 0, H - top, lz, lz + leg, dark, 'cotes')) };
  }
  if (kind === 'chaise') {
    const nx = Math.max(1, Math.round(w / CELL));
    const nz = Math.max(1, Math.round(h / CELL));
    const cw = w / nx;
    const ch = h / nz;
    const s = Math.max(6, Math.min(40, Math.min(cw, ch) - 8));
    const seatY = Math.min(H * 0.6, 26);
    const detail = [];
    for (let i = 0; i < nx; i += 1) {
      for (let j = 0; j < nz; j += 1) {
        const cx = x + (i + 0.5) * cw;
        const cz = y + (j + 0.5) * ch;
        const x0 = cx - s / 2;
        const z0 = cz - s / 2;
        const back = Math.min(4, s / 4);
        detail.push(
          box(x0, x0 + s, seatY - 4, seatY, z0, z0 + s, main),
          box(x0, x0 + s, seatY, seatY + 22, z0, z0 + back, dark),
          box(x0 + s * 0.2, x0 + s * 0.8, 0, seatY - 4, z0 + s * 0.2, z0 + s * 0.8, dark, 'cotes'),
        );
      }
    }
    return { kind, body: [], detail };
  }
  // armoire : une rangée de modules le long du plus grand côté, sur un socle
  const alongX = w >= h;
  const length = alongX ? w : h;
  const n = Math.max(1, Math.min(4, Math.round(length / MODULE)));
  const gap = n > 1 ? 2 : 0;
  const step = (length - gap * (n - 1)) / n;
  const plinth = Math.min(4, H / 4);
  const body = [];
  for (let i = 0; i < n; i += 1) {
    const a = i * (step + gap);
    body.push(alongX ? box(x + a, x + a + step, plinth, H, y, y + h, main) : box(x, x + w, plinth, H, y + a, y + a + step, main));
  }
  const foot = alongX ? box(x + 2, x + w - 2, 0, plinth, y + 2, y + h - 2, dark, 'cotes') : box(x + 2, x + w - 2, 0, plinth, y + 2, y + h - 2, dark, 'cotes');
  return { kind, body, detail: [foot] };
}
