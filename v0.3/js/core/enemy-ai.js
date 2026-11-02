// Zombies : poursuite en ligne droite, séparation simple ; avec un monde (obstacles, champ de flux) ils contournent les meubles.
import { moveWithCollision } from './collision.js';
import { flowDirection, lineOfSight } from './nav.js';
import { clampDt, isNum, normalize, num } from './vec.js';

// enemies : [{ id, x, y, r, speed?, ... }]. Renvoie une nouvelle liste ; un zombie sur le joueur reste en place.
// world (facultatif ; sans lui, comportement du lot 1m) : { obstacles (rectangles pleins), bounds (limites du monde), grid et flow
// (nav.js), nav : { lookahead, stuckDistance, stuckTime, pushTime } }. Poursuite directe si la ligne de vue est libre, sinon direction
// du champ de flux ; un zombie qui avance de moins de stuckDistance en stuckTime secondes est poussé vers le champ de flux pendant
// pushTime secondes (champs enemy.stuckT, ax, ay et push, ajoutés seulement avec un monde).
export function stepEnemies(enemies, player, dt, def, world = null) {
  const list = Array.isArray(enemies) ? enemies : [];
  const step = clampDt(dt);
  const defaultSpeed = Math.max(0, num(def?.speed));
  const px = num(player?.x);
  const py = num(player?.y);
  const pr = isNum(player?.r) ? player.r : 0;
  return list.map((enemy, i) => {
    // Lot 2 : chaque zombie porte sa vitesse (type, allure, vague) ; sans elle, la vitesse commune du lot 1.
    const speed = isNum(enemy?.speed) ? Math.max(0, enemy.speed) : defaultSpeed;
    const x = num(enemy?.x);
    const y = num(enemy?.y);
    const r = Math.max(0, num(enemy?.r));
    const toPlayer = normalize({ x: px - x, y: py - y });
    const gap = Math.hypot(px - x, py - y) - (pr + r);
    // Au contact du joueur, on s'arrête : le zombie le frappe sans le traverser.
    let vx = gap > 0 ? toPlayer.x : 0;
    let vy = gap > 0 ? toPlayer.y : 0;
    let track = null;
    if (world) {
      const cfg = world.nav ?? {};
      const stuckTime = isNum(cfg.stuckTime) && cfg.stuckTime > 0 ? cfg.stuckTime : 2;
      let push = Math.max(0, num(enemy?.push) - step);
      let stuckT = num(enemy?.stuckT) + step;
      let ax = isNum(enemy?.ax) ? enemy.ax : x;
      let ay = isNum(enemy?.ay) ? enemy.ay : y;
      if (gap > 0) {
        if (stuckT >= stuckTime) {
          if (Math.hypot(x - ax, y - ay) < num(cfg.stuckDistance, 5)) push = num(cfg.pushTime, 1);
          ax = x;
          ay = y;
          stuckT = 0;
        }
        const direct = lineOfSight({ x, y }, { x: px, y: py }, world.obstacles, r + 2);
        if ((!direct || push > 0) && world.grid && world.flow) {
          const way = flowDirection(world.grid, world.flow, { x, y }, cfg.lookahead);
          if (way.x !== 0 || way.y !== 0) {
            vx = way.x;
            vy = way.y;
          }
        }
      } else {
        ax = x;
        ay = y;
        stuckT = 0;
      }
      track = { stuckT, ax, ay, push };
    }
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
    if (!world) return { ...enemy, x: x + v.x * speed * step, y: y + v.y * speed * step };
    const moved = moveWithCollision({ x, y, r }, { x: v.x * speed * step, y: v.y * speed * step }, world.obstacles, world.bounds);
    return { ...enemy, ...track, x: moved.x, y: moved.y };
  });
}
