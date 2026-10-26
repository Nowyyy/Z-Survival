// Sol de la salle en géométrie : une dalle de la couleur du sol et un quadrillage léger (un trait tous les `step` unités), sous forme
// d'éléments { x, y, z, sx, sy, sz, color } pour la fusion de world.js (aucune texture : un appel de dessin de moins).
// room : { x, y, width, height } ; color : couleur du sol, lineColor : couleur des traits (THREE.Color). Le dessus de la dalle est à y = 0.
export function floorItems(room, color, lineColor, { step = 100, line = 1.5 } = {}) {
  const items = [{ x: room.x + room.width / 2, y: -0.5, z: room.y + room.height / 2, sx: room.width, sy: 1, sz: room.height, color }];
  for (let x = step; x < room.width; x += step) items.push({ x: room.x + x, y: 0.05, z: room.y + room.height / 2, sx: line, sy: 0.1, sz: room.height, color: lineColor });
  for (let y = step; y < room.height; y += step) items.push({ x: room.x + room.width / 2, y: 0.05, z: room.y + y, sx: room.width, sy: 0.1, sz: line, color: lineColor });
  return items;
}
