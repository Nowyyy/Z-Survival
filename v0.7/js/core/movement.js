// Déplacement d'un cercle dans la salle : diagonale normalisée, blocage par les murs, glissement le long des obstacles (meubles).
import { moveWithCollision } from './collision.js';
import { clampDt, isNum, length, normalize, num, toVec } from './vec.js';

// Zone libre de déplacement : l'intérieur des murs. room : { x, y, width, height, wall } (x et y valent 0 par défaut : salle du lot 1m).
// Renvoie { minX, minY, maxX, maxY }.
export function innerBounds(room) {
  const wall = isNum(room?.wall) && room.wall > 0 ? room.wall : 0;
  const x = num(room?.x);
  const y = num(room?.y);
  const width = isNum(room?.width) ? room.width : 0;
  const height = isNum(room?.height) ? room.height : 0;
  return { minX: x + wall, minY: y + wall, maxX: x + Math.max(wall, width - wall), maxY: y + Math.max(wall, height - wall) };
}

// Position suivante d'un cercle { x, y, r } poussé dans la direction dir à la vitesse speed. obstacles : rectangles pleins (aucun par défaut).
export function moveCircle(circle, dir, speed, dt, room, obstacles = []) {
  const r = isNum(circle?.r) && circle.r > 0 ? circle.r : 0;
  const b = innerBounds(room);
  // Un stick incliné à moitié avance à moitié vitesse ; au-delà de 1 (diagonale au clavier), on normalise.
  const d = length(dir) > 1 ? normalize(dir) : toVec(dir);
  const step = clampDt(dt) * Math.max(0, num(speed));
  return moveWithCollision({ x: num(circle?.x), y: num(circle?.y), r }, { x: d.x * step, y: d.y * step }, obstacles, b);
}
