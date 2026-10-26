// Caméra qui suit le joueur : lissage exponentiel indépendant du nombre d'images par seconde, zone morte facultative, cible bornée
// pour que le rectangle visible au sol reste dans le monde. Pur : la vue (view) vient de groundView() de viewport.js.
import { fitDistance } from './viewport.js';
import { isNum, num } from './vec.js';

const pos = (n) => (isNum(n) && n > 0 ? n : 0);
const norm = (b) => ({ minX: num(b?.minX), minY: num(b?.minY), maxX: Math.max(num(b?.minX), num(b?.maxX)), maxY: Math.max(num(b?.minY), num(b?.maxY)) });

// Cible ramenée pour que la vue ne dépasse pas bounds { minX, minY, maxX, maxY } ; sur un axe où la vue est plus grande que le monde,
// la cible est au centre. view : { width, north, south } (groundView : demi-largeur = width / 2). Renvoie { x, y }.
export function boundTarget(point, bounds, view) {
  const b = norm(bounds);
  const half = pos(view?.width) / 2;
  const north = typeof view?.north === 'number' && view.north >= 0 ? view.north : 0; // Infinity : la vue ne tient pas, on centre
  const south = typeof view?.south === 'number' && view.south >= 0 ? view.south : 0;
  const fit = (value, lo, hi, middle) => (lo > hi ? middle : Math.min(Math.max(value, lo), hi));
  return {
    x: fit(num(point?.x, (b.minX + b.maxX) / 2), b.minX + half, b.maxX - half, (b.minX + b.maxX) / 2),
    y: fit(num(point?.y, (b.minY + b.maxY) / 2), b.minY + north, b.maxY - south, (b.minY + b.maxY) / 2),
  };
}

// Début de partie : la caméra est d'un coup sur le joueur (borné). opts : { bounds, view }.
export const snapCamera = (goal, opts) => boundTarget(goal, opts?.bounds, opts?.view);

// Un pas de dt secondes vers goal (le joueur). opts : { smoothing (s, 0,12), deadZone (fraction de la demi-vue, 0), bounds, view }.
// dt nul, négatif ou invalide : la caméra ne bouge pas (elle est seulement ramenée dans les bornes) ; dt énorme : elle arrive.
export function stepCamera(state, goal, dt, opts) {
  const cam = { x: num(state?.x), y: num(state?.y) };
  const tau = isNum(opts?.smoothing) && opts.smoothing >= 0 ? opts.smoothing : 0.12;
  const k = isNum(dt) && dt > 0 ? (tau > 0 ? 1 - Math.exp(-dt / tau) : 1) : 0;
  const zone = Math.min(1, Math.max(0, num(opts?.deadZone)));
  const halfW = pos(opts?.view?.width) / 2;
  const halfH = (pos(opts?.view?.north) + pos(opts?.view?.south)) / 2;
  const want = { x: num(goal?.x, cam.x), y: num(goal?.y, cam.y) };
  // Dans la zone morte la caméra ne bouge pas ; au-delà, elle ne vise que l'excédent.
  const out = (delta, dead) => (Math.abs(delta) <= dead ? 0 : delta - Math.sign(delta) * dead);
  const aim = boundTarget({ x: cam.x + out(want.x - cam.x, zone * halfW), y: cam.y + out(want.y - cam.y, zone * (Number.isFinite(halfH) ? halfH : 0)) }, opts?.bounds, opts?.view);
  return boundTarget({ x: cam.x + (aim.x - cam.x) * k, y: cam.y + (aim.y - cam.y) * k }, opts?.bounds, opts?.view);
}

// Vue d'ensemble pour les tests : la cible au centre du monde et la distance qui le fait tenir en entier. Renvoie { target, distance }.
export function overview(bounds, aspect, tilt, fov, margin = 0.02) {
  const b = norm(bounds);
  const size = { width: Math.max(1, b.maxX - b.minX), height: Math.max(1, b.maxY - b.minY) };
  return { target: { x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2 }, distance: fitDistance(aspect, size, tilt, fov, margin) };
}
