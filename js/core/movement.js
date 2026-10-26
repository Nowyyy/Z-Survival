// Déplacement d'un cercle dans la salle : diagonale normalisée, blocage par les murs.
import { clampDt, isNum, length, normalize, num, toVec } from './vec.js';

// Zone libre de déplacement : l'intérieur des murs. Renvoie { minX, minY, maxX, maxY }.
export function innerBounds(room) {
  const wall = isNum(room?.wall) && room.wall > 0 ? room.wall : 0;
  const width = isNum(room?.width) ? room.width : 0;
  const height = isNum(room?.height) ? room.height : 0;
  return { minX: wall, minY: wall, maxX: Math.max(wall, width - wall), maxY: Math.max(wall, height - wall) };
}

// Position suivante d'un cercle { x, y, r } poussé dans la direction dir à la vitesse speed.
export function moveCircle(circle, dir, speed, dt, room) {
  const r = isNum(circle?.r) && circle.r > 0 ? circle.r : 0;
  const b = innerBounds(room);
  // Un stick incliné à moitié avance à moitié vitesse ; au-delà de 1 (diagonale au clavier), on normalise.
  const d = length(dir) > 1 ? normalize(dir) : toVec(dir);
  const step = clampDt(dt) * Math.max(0, num(speed));
  const x = Math.min(Math.max(num(circle?.x) + d.x * step, b.minX + r), Math.max(b.minX + r, b.maxX - r));
  const y = Math.min(Math.max(num(circle?.y) + d.y * step, b.minY + r), Math.max(b.minY + r, b.maxY - r));
  return { x, y };
}
