// Zombies : poursuite en ligne droite, séparation simple ; avec un monde (obstacles, champ de flux) ils contournent les meubles.
import { moveWithCollision } from './collision.js';
import { flowDirection, lineOfSight } from './nav.js';
import { clampDt, isNum, normalize, num } from './vec.js';

// enemies : [{ id, x, y, r, speed?, ... }]. Renvoie une nouvelle liste ; un zombie sur le joueur reste en place.
// world (facultatif ; sans lui, comportement du lot 1m) : { obstacles (rectangles pleins), bounds (limites du monde), grid et flow
// (nav.js), nav : { lookahead, stuckDistance, stuckTime, pushTime } }. Poursuite directe si la ligne de vue est libre, sinon direction
// du champ de flux ; un zombie qui avance de moins de stuckDistance en stuckTime secondes est poussé vers le champ de flux pendant
// pushTime secondes (champs enemy.stuckT, ax, ay et push, ajoutés seulement avec un monde).
// Lot 3 : un zombie dont le mode est approche, attente, arrache ou escalade (siege.js) exécute l'intention décidée (target, hold, climb) :
// il suit le champ de sa fenêtre (world.windows.fields[window] : { grid, flow }), va à sa place puis s'y arrête, reste à son emplacement
// ou traverse l'ouverture en ligne droite sans collision de fenêtre. Les modes dedans, libre et absent gardent le comportement du lot 2c.
// Lot 3e : un zombie « escalier » (stair-zombies.js) ne bouge pas ici ; avec world.offFloor (le joueur est à l'autre étage), un zombie « dedans » ignore le joueur et
// suit world.portalFlow (nav.js, buildPortalField : champ de flux vers l'escalier utilisable le plus proche par chemin) ; sans escalier utilisable il reste en place.
const SIEGE_MOVE = new Set(['approche', 'attente', 'arrache', 'escalade']);

export function stepEnemies(enemies, player, dt, def, world = null) {
  const list = Array.isArray(enemies) ? enemies : [];
  const step = clampDt(dt);
  const defaultSpeed = Math.max(0, num(def?.speed));
  const px = num(player?.x);
  const py = num(player?.y);
  const pr = isNum(player?.r) ? player.r : 0;
  return list.map((enemy, i) => {
    if (enemy?.mode === 'escalier') return { ...enemy };
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
    const mode = world && SIEGE_MOVE.has(enemy?.mode) ? enemy.mode : null;
    const climbing = mode === 'escalade' && enemy.climb && num(enemy.climb.t) > 0;
    if (climbing) {
      // Traversée de l'ouverture : trajet rectiligne de from à to, sans aucune collision.
      const t = Math.min(1, Math.max(0, num(enemy.climb.t)));
      const px2 = num(enemy.climb.from?.x) + (num(enemy.climb.to?.x) - num(enemy.climb.from?.x)) * t;
      const py2 = num(enemy.climb.from?.y) + (num(enemy.climb.to?.y) - num(enemy.climb.from?.y)) * t;
      return { ...enemy, stuckT: 0, ax: px2, ay: py2, push: 0, x: px2, y: py2 };
    }
    if (mode) {
      // Intention du siège : aller vers la cible (champ de la fenêtre pour l'approche), s'y arrêter, ou ne pas bouger (hold, arrache en place).
      const target = enemy.target && isNum(enemy.target.x) && isNum(enemy.target.y) ? enemy.target : null;
      const field = mode === 'approche' ? world.windows?.fields?.[enemy.window] : null;
      let dx = 0;
      let dy = 0;
      let far = 0;
      if (target) {
        dx = target.x - x;
        dy = target.y - y;
        far = Math.hypot(dx, dy);
      }
      vx = 0;
      vy = 0;
      if (mode === 'approche' && enemy.hold === true) {
        // arrêté loin du mur : file pleine
      } else if (target && far > num(world.windows?.arrive, 3)) {
        const direct = lineOfSight({ x, y }, target, world.obstacles, r + 2);
        if (field?.flow && field.grid && (!direct || far > num(world.windows?.directRange, 120))) {
          const way = flowDirection(field.grid, field.flow, { x, y }, world.nav?.lookahead);
          if (way.x !== 0 || way.y !== 0) {
            vx = way.x;
            vy = way.y;
          } else {
            vx = dx / far;
            vy = dy / far;
          }
        } else {
          vx = dx / far;
          vy = dy / far;
        }
      }
      // Arrivée : on se pose exactement sur la cible (pas de tremblement devant la fenêtre).
      if (target && far > 0 && far <= speed * step && mode !== 'approche') {
        return { ...enemy, stuckT: 0, ax: target.x, ay: target.y, push: 0, x: target.x, y: target.y };
      }
      track = { stuckT: 0, ax: x, ay: y, push: 0 };
    } else if (world && world.offFloor === true) {
      vx = 0;
      vy = 0;
      if (world.portalFlow && world.grid) {
        const way = flowDirection(world.grid, world.portalFlow, { x, y }, world.nav?.lookahead);
        vx = way.x;
        vy = way.y;
        // Dans la zone de déclenchement (cellules sources du champ), le champ ne dit plus rien : on va droit au centre de l'escalier le plus proche.
        if (vx === 0 && vy === 0) {
          let best = null;
          for (const t of Array.isArray(world.portalTargets) ? world.portalTargets : []) {
            const d = Math.hypot(num(t?.x) - x, num(t?.y) - y);
            if (isNum(t?.x) && isNum(t?.y) && d > 1 && (best === null || d < best.d)) best = { d, dx: t.x - x, dy: t.y - y };
          }
          if (best) {
            vx = best.dx / best.d;
            vy = best.dy / best.d;
          }
        }
      }
      track = { stuckT: 0, ax: x, ay: y, push: 0 };
    } else if (world) {
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
      if (i === j || !other || other.mode === 'escalier' || mode === 'arrache' || (mode === 'approche' && enemy.hold === true)) return;
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
