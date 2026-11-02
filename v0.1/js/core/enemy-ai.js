// Zombies : poursuite en ligne droite et séparation simple.
import { clampDt, isNum, normalize, num } from './vec.js';

// enemies : [{ id, x, y, r, ... }]. Renvoie une nouvelle liste ; un zombie sur le joueur reste en place.
export function stepEnemies(enemies, player, dt, def) {
  const list = Array.isArray(enemies) ? enemies : [];
  const step = clampDt(dt);
  const speed = Math.max(0, num(def?.speed));
  const px = num(player?.x);
  const py = num(player?.y);
  const pr = isNum(player?.r) ? player.r : 0;
  return list.map((enemy, i) => {
    const x = num(enemy?.x);
    const y = num(enemy?.y);
    const r = Math.max(0, num(enemy?.r));
    const toPlayer = normalize({ x: px - x, y: py - y });
    const gap = Math.hypot(px - x, py - y) - (pr + r);
    // Au contact du joueur, on s'arrête : le zombie le frappe sans le traverser.
    let vx = gap > 0 ? toPlayer.x : 0;
    let vy = gap > 0 ? toPlayer.y : 0;
    let pushX = 0;
    let pushY = 0;
    list.forEach((other, j) => {
      if (i === j || !other) return;
      const dx = x - num(other.x);
      const dy = y - num(other.y);
      const overlap = r + Math.max(0, num(other.r)) - Math.hypot(dx, dy);
      if (overlap <= 0) return;
      // Deux zombies exactement superposés se séparent selon leur ordre, de façon déterministe.
      const away = Math.hypot(dx, dy) > 0 ? normalize({ x: dx, y: dy }) : { x: i < j ? -1 : 1, y: 0 };
      pushX += away.x * overlap;
      pushY += away.y * overlap;
    });
    const push = normalize({ x: pushX, y: pushY });
    vx += push.x * Math.min(1, Math.hypot(pushX, pushY) / Math.max(1, r));
    vy += push.y * Math.min(1, Math.hypot(pushX, pushY) / Math.max(1, r));
    const v = Math.hypot(vx, vy) > 1 ? normalize({ x: vx, y: vy }) : { x: vx, y: vy };
    return { ...enemy, x: x + v.x * speed * step, y: y + v.y * speed * step };
  });
}
