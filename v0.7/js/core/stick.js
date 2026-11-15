// Stick flottant : vecteur de poussée à partir du point de départ du doigt et de sa position courante.
import { isNum, num } from './vec.js';

export const STICK_RADIUS = 56;
export const STICK_DEAD_ZONE = 0.15;

// Renvoie { x, y, magnitude } avec magnitude dans [0, 1] ; zone morte exprimée en fraction du rayon.
export function stickVector(origin, current, radius = STICK_RADIUS, deadZone = STICK_DEAD_ZONE) {
  const r = isNum(radius) && radius > 0 ? radius : STICK_RADIUS;
  const dz = isNum(deadZone) ? Math.min(Math.max(deadZone, 0), 0.95) : STICK_DEAD_ZONE;
  const dx = num(current?.x) - num(origin?.x);
  const dy = num(current?.y) - num(origin?.y);
  const dist = Math.hypot(dx, dy);
  if (!(dist > 0)) return { x: 0, y: 0, magnitude: 0 };
  const raw = Math.min(dist / r, 1);
  if (raw <= dz) return { x: 0, y: 0, magnitude: 0 };
  const magnitude = (raw - dz) / (1 - dz);
  return { x: (dx / dist) * magnitude, y: (dy / dist) * magnitude, magnitude };
}

// Position du pouce dessiné, retenue dans le disque de base.
export function stickKnob(origin, current, radius = STICK_RADIUS) {
  const r = isNum(radius) && radius > 0 ? radius : STICK_RADIUS;
  const dx = num(current?.x) - num(origin?.x);
  const dy = num(current?.y) - num(origin?.y);
  const dist = Math.hypot(dx, dy);
  const k = dist > r ? r / dist : 1;
  return { x: num(origin?.x) + dx * k, y: num(origin?.y) + dy * k };
}
