// Caméra en perspective inclinée : géométrie pure (angles en degrés, distances en unités du jeu).
// Repère : x vers l'est, y = hauteur, z vers le sud (le jeu 2D (x, y) devient (x, 0, y)). La caméra est au sud de la cible,
// regarde vers le nord ; tilt = angle de la vue au-dessus de l'horizon (90 = strictement vertical).
import { isNum } from './vec.js';

export const DEFAULT_TILT = 75;
export const DEFAULT_FOV = 40;
export const DEFAULT_MARGIN = 0.05;
export const TILTS = [60, 75, 90];
const MIN_TILT = 30;
const rad = (deg) => (deg * Math.PI) / 180;

const pos = (n, fallback) => (isNum(n) && n > 0 ? n : fallback);
const clean = (aspect, tilt, fov) => ({
  aspect: pos(aspect, 1),
  tilt: Math.min(Math.max(isNum(tilt) ? tilt : DEFAULT_TILT, MIN_TILT), 90),
  fov: Math.min(Math.max(isNum(fov) ? fov : DEFAULT_FOV, 5), 120),
});

// Rapprochement par rapport à la vue qui fait tenir toute la zone de jeu (1) : ?zoom= accepte 1, 1,25, 1,5, 2, 2,5 ou 3 ;
// toute autre valeur donne la valeur par défaut (fallback).
export const ZOOMS = [1, 1.25, 1.5, 2, 2.5, 3];
export function parseZoom(value, fallback = 1) {
  const n = typeof value === 'string' && /^\d(\.\d{1,2})?$/.test(value) ? Number(value) : null;
  return ZOOMS.includes(n) ? n : fallback;
}

// Point visé par la caméra qui suit un joueur : le point demandé, ramené pour que la vue (view : sortie de groundView) ne dépasse pas
// la salle de plus de slack unités ; si la vue est plus grande que la salle, elle reste centrée. Renvoie { x, y }.
export function clampCamera(point, room, view, slack = 0) {
  const w = pos(room?.width, 1);
  const h = pos(room?.height, 1);
  const s = isNum(slack) && slack >= 0 ? slack : 0;
  const fit = (value, lo, hi, middle) => (lo > hi ? middle : Math.min(Math.max(value, lo), hi));
  const half = pos(view?.width, 0) / 2;
  const north = isNum(view?.north) && view.north >= 0 ? view.north : 0;
  const south = isNum(view?.south) && view.south >= 0 ? view.south : 0;
  return {
    x: fit(isNum(point?.x) ? point.x : w / 2, half - s, w - half + s, w / 2),
    y: fit(isNum(point?.y) ? point.y : h / 2, north - s, h - south + s, h / 2),
  };
}

// Inclinaison demandée par ?tilt= : 60, 75 ou 90 ; toute autre valeur donne l'inclinaison par défaut.
export function parseTilt(value, fallback = DEFAULT_TILT) {
  const n = typeof value === 'string' && /^\d{2}$/.test(value) ? Number(value) : null;
  return TILTS.includes(n) ? n : fallback;
}

// Rectangle visible au sol autour du point visé, en approximation rectangulaire : la largeur est celle du champ à la
// hauteur du point visé (le vrai contour est un trapèze, plus étroit côté caméra) ; north et south sont les profondeurs
// exactes, sur la colonne centrale, au nord et au sud du point visé. Renvoie { width, height, north, south }.
export function groundView(aspect, distance, tilt, fov) {
  const c = clean(aspect, tilt, fov);
  const d = pos(distance, 1);
  const t = Math.tan(rad(c.fov) / 2);
  const a = rad(c.tilt);
  const north = Math.sin(a) - t * Math.cos(a) > 1e-6 ? (d * t) / (Math.sin(a) - t * Math.cos(a)) : Infinity;
  const south = (d * t) / (Math.sin(a) + t * Math.cos(a));
  return { width: 2 * d * t * c.aspect, height: north + south, north, south };
}

// Distance caméra-cible qui fait tenir toute la salle (rectangle room.width × room.height centré sur la cible) dans la
// fenêtre, plus une marge (5 % par défaut, comptée sur chaque dimension de la salle). Calcul exact sur les quatre coins.
export function fitDistance(aspect, room, tilt, fov, margin = DEFAULT_MARGIN) {
  const c = clean(aspect, tilt, fov);
  const k = 1 + (isNum(margin) && margin >= 0 ? margin : DEFAULT_MARGIN);
  const w = (pos(room?.width, 1) * k) / 2;
  const h = (pos(room?.height, 1) * k) / 2;
  const t = Math.tan(rad(c.fov) / 2);
  const a = rad(c.tilt);
  // Coin sud (le plus proche) : ses abscisses et ordonnées d'écran fixent la distance.
  const byWidth = w / (t * c.aspect) + h * Math.cos(a);
  const byHeight = (h * Math.sin(a)) / t + h * Math.cos(a);
  return Math.max(byWidth, byHeight);
}

// Position de la caméra { x, y, z } (y = hauteur) pour une cible { x, y } du plan de jeu.
export function cameraPosition(target, distance, tilt) {
  const a = rad(clean(1, tilt, DEFAULT_FOV).tilt);
  const d = pos(distance, 1);
  return { x: isNum(target?.x) ? target.x : 0, y: d * Math.sin(a), z: (isNum(target?.y) ? target.y : 0) + d * Math.cos(a) };
}

// Point de l'écran (x, y dans [-1, 1], y vers le haut) correspondant à un point du sol (dx, dz) relatif à la cible.
// Sert aux tests et à la vérification que la salle est visible ; renvoie null si le point est derrière la caméra.
export function projectGround(dx, dz, distance, tilt, fov, aspect) {
  const c = clean(aspect, tilt, fov);
  const t = Math.tan(rad(c.fov) / 2);
  const a = rad(c.tilt);
  const depth = pos(distance, 1) - dz * Math.cos(a);
  if (!(depth > 0)) return null;
  return { x: dx / (depth * t * c.aspect), y: (-dz * Math.sin(a)) / (depth * t) };
}
