// Caméra : le plus grand zoom qui fait tenir toute la salle dans la fenêtre, plafonné.
import { isNum } from './vec.js';

export const MIN_ZOOM = 0.4;
export const MAX_ZOOM = 2;

// Renvoie { zoom, centerX, centerY, fits } ; fits est faux si le plafond bas empêche de voir toute la salle.
export function computeViewport(win, room, limits = {}) {
  const w = isNum(win?.width) && win.width > 0 ? win.width : 1;
  const h = isNum(win?.height) && win.height > 0 ? win.height : 1;
  const rw = isNum(room?.width) && room.width > 0 ? room.width : 1;
  const rh = isNum(room?.height) && room.height > 0 ? room.height : 1;
  const min = isNum(limits.min) ? limits.min : MIN_ZOOM;
  const max = isNum(limits.max) ? limits.max : MAX_ZOOM;
  const ideal = Math.min(w / rw, h / rh);
  const zoom = Math.min(Math.max(ideal, min), max);
  return { zoom, centerX: rw / 2, centerY: rh / 2, fits: rw * zoom <= w + 1e-9 && rh * zoom <= h + 1e-9 };
}
