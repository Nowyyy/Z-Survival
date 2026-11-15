// Mur de brouillard (lot 3b) : opacité de la brume en chaque point du sol d'après la distance au bâtiment. Nulle dans le bâtiment et jusqu'à `near`
// unités de lui, elle monte jusqu'à 1 à `far` unités : on voit l'extérieur près des murs, mais pas au-delà ; les zombies surgissent de la brume.
// Pur : n'utilise que ses arguments, renvoie de nouveaux objets, ne lève aucune exception sur des entrées inattendues.
import { validRects } from './collision.js';
import { isNum, num } from './vec.js';

const smooth = (t) => t * t * (3 - 2 * t);

// Distance d'un point à un rectangle (0 dedans).
const dist = (x, y, r) => Math.hypot(Math.max(r.x - x, 0, x - (r.x + r.w)), Math.max(r.y - y, 0, y - (r.y + r.h)));

// Opacité (0 à 1) à la distance d du bâtiment.
export function fogOpacity(d, near, far) {
  const a = num(near);
  const b = Math.max(a + 1, num(far, a + 1));
  if (!isNum(d)) return 1;
  return smooth(Math.min(1, Math.max(0, (d - a) / (b - a))));
}

// Grille d'opacité sur le rectangle { x, y, w, h } (cellules de `cell` unités, centres des cellules) : { cols, rows, cell, area, data (Uint8Array, 0 à 255) }.
// footprint : rectangles du bâtiment (layout.floor). Sans bâtiment valide, tout est opaque.
export function fogGrid(footprint, area, near, far, cell = 40) {
  const rects = validRects(footprint);
  const c = isNum(cell) && cell > 0 ? cell : 40;
  const w = Math.max(c, num(area?.w, c));
  const h = Math.max(c, num(area?.h, c));
  const cols = Math.min(512, Math.ceil(w / c));
  const rows = Math.min(512, Math.ceil(h / c));
  const data = new Uint8Array(cols * rows);
  for (let j = 0; j < rows; j += 1) {
    for (let i = 0; i < cols; i += 1) {
      const x = num(area?.x) + ((i + 0.5) * w) / cols;
      const y = num(area?.y) + ((j + 0.5) * h) / rows;
      const d = rects.length === 0 ? Infinity : Math.min(...rects.map((r) => dist(x, y, r)));
      data[j * cols + i] = Math.round(fogOpacity(d, near, far) * 255);
    }
  }
  return { cols, rows, cell: c, area: { x: num(area?.x), y: num(area?.y), w, h }, data };
}
