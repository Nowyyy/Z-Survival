// Sol de la salle dessiné au canvas : aplat de la couleur du sol et quadrillage léger (un trait tous les `step` unités).
// canvas : élément déjà dimensionné ; room : { width, height } en unités ; pixelsPerUnit : résolution de la texture.
export function drawFloor(canvas, palette, room, { step = 100, pixelsPerUnit = 1 } = {}) {
  const ctx = canvas.getContext('2d');
  const w = canvas.width;
  const h = canvas.height;
  ctx.fillStyle = palette.floor;
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = palette.ground;
  ctx.globalAlpha = 0.55;
  ctx.lineWidth = Math.max(1, pixelsPerUnit * 1.5);
  ctx.beginPath();
  for (let x = step; x < room.width; x += step) {
    ctx.moveTo(x * pixelsPerUnit, 0);
    ctx.lineTo(x * pixelsPerUnit, h);
  }
  for (let y = step; y < room.height; y += step) {
    ctx.moveTo(0, y * pixelsPerUnit);
    ctx.lineTo(w, y * pixelsPerUnit);
  }
  ctx.stroke();
  ctx.globalAlpha = 1;
  return canvas;
}
