// Angle de visée : depuis un pointeur (souris) ou un stick ; la dernière direction est conservée.
import { isNum, num } from './vec.js';

export const createAim = (angle = 0) => ({ angle: isNum(angle) ? angle : 0 });

// Pointeur de la souris, en coordonnées du monde. Pointeur sur le joueur : angle inchangé.
export function aimFromPoint(prev, from, to) {
  const dx = num(to?.x) - num(from?.x);
  const dy = num(to?.y) - num(from?.y);
  if (Math.hypot(dx, dy) < 1e-6) return createAim(prev?.angle);
  return createAim(Math.atan2(dy, dx));
}

// Stick droit : au repos (vecteur nul), la visée garde sa dernière direction.
export function aimFromStick(prev, stick) {
  const x = num(stick?.x);
  const y = num(stick?.y);
  if (Math.hypot(x, y) < 1e-6) return createAim(prev?.angle);
  return createAim(Math.atan2(y, x));
}
