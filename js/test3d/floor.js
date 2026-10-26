// Sol de la salle dessiné au canvas (carrelage et traces) : partagé par la page Three.js et la page pseudo-3D. Sans Three.
import { createRng, nextFloat } from '../core/rng.js';

// canvas : élément ou OffscreenCanvas déjà dimensionné ; tiles : { x, y } nombre de carreaux.
export function drawFloor(canvas, palette, { tiles = { x: 16, y: 9 }, seed = 7 } = {}) {
  const ctx = canvas.getContext('2d');
  const w = canvas.width;
  const h = canvas.height;
  let rng = createRng(seed);
  const rand = () => {
    const r = nextFloat(rng);
    rng = r.rng;
    return r.value;
  };
  const tw = w / tiles.x;
  const th = h / tiles.y;
  ctx.fillStyle = palette.grout;
  ctx.fillRect(0, 0, w, h);
  for (let j = 0; j < tiles.y; j += 1) {
    for (let i = 0; i < tiles.x; i += 1) {
      ctx.fillStyle = (i + j) % 2 === 0 ? palette.floorA : palette.floorB;
      ctx.fillRect(i * tw + 1.5, j * th + 1.5, tw - 3, th - 3);
    }
  }
  // Traces : taches sombres semi-transparentes et fissures.
  ctx.fillStyle = palette.stain;
  for (let n = 0; n < 26; n += 1) {
    ctx.globalAlpha = 0.1 + rand() * 0.25;
    ctx.beginPath();
    ctx.ellipse(rand() * w, rand() * h, 8 + rand() * 40, 5 + rand() * 22, rand() * Math.PI, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.strokeStyle = palette.grout;
  ctx.lineWidth = 1.5;
  ctx.globalAlpha = 0.8;
  for (let n = 0; n < 14; n += 1) {
    let x = rand() * w;
    let y = rand() * h;
    ctx.beginPath();
    ctx.moveTo(x, y);
    for (let k = 0; k < 4; k += 1) {
      x += (rand() - 0.5) * 36;
      y += (rand() - 0.5) * 36;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  return canvas;
}
