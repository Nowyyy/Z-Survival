// Flèches au bord de l'écran (lot 3a, E2-11) : où poser, sur le bord d'un rectangle réduit de `margin`, la flèche qui montre un point hors de l'écran.
// Pur : aucun argument n'est modifié, aucune exception. Les coordonnées sont des pixels CSS (0 en haut à gauche) ; l'angle est celui de la direction de la
// flèche (0 = vers la droite, π / 2 = vers le bas), dans le sens d'écran.
import { isNum } from './vec.js';

const HIDDEN = Object.freeze({ visible: false, x: 0, y: 0, angle: 0 });

// point : { x, y, behind? } position d'écran normalisée (0 à 1 dans l'écran, peut en sortir ; behind : vrai si le point est derrière la caméra, la direction
// est alors inversée) ; view : { width, height } en pixels ; margin : distance au bord en pixels (16).
// Renvoie { visible, x, y, angle } : visible est faux quand le point est à l'écran (rectangle réduit de margin, bord compris) ou que l'entrée est invalide ;
// sinon (x, y) est le point du bord du rectangle réduit situé sur la demi-droite qui part du centre vers le point.
export function edgeIndicator(point, view, margin) {
  const width = view?.width;
  const height = view?.height;
  if (!isNum(point?.x) || !isNum(point?.y) || !isNum(width) || !isNum(height) || width <= 0 || height <= 0) return { ...HIDDEN };
  const behind = point.behind === true;
  const px = point.x * width;
  const py = point.y * height;
  if (!Number.isFinite(px) || !Number.isFinite(py)) return { ...HIDDEN };
  const m = Math.min(isNum(margin) && margin > 0 ? margin : 0, width / 2, height / 2);
  if (!behind && px >= m && px <= width - m && py >= m && py <= height - m) return { visible: false, x: px, y: py, angle: Math.atan2(py - height / 2, px - width / 2) };
  const cx = width / 2;
  const cy = height / 2;
  let dx = px - cx;
  let dy = py - cy;
  if (behind) {
    dx = -dx;
    dy = -dy;
  }
  if (dx === 0 && dy === 0) dy = 1; // pile au centre et derrière la caméra : vers le bas
  const tx = dx === 0 ? Infinity : (cx - m) / Math.abs(dx);
  const ty = dy === 0 ? Infinity : (cy - m) / Math.abs(dy);
  const t = Math.min(tx, ty);
  return { visible: true, x: cx + dx * t, y: cy + dy * t, angle: Math.atan2(dy, dx) };
}
