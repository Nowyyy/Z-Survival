// Balles : avancée par pas de temps, impact calculé sur le segment parcouru (jamais de traversée), un impact au plus par balle.
import { firstOnSegment } from './collision.js';
import { clampDt, fromAngle, isNum, num } from './vec.js';

const TRAIL_LENGTH = 3;

// weapon : { damage, bulletSpeed, bulletRadius, bulletMaxDistance } (arme effective : les dégâts sont figés ici). angle : direction réelle de la
// balle (dans le cône) ; aimAngle : axe de visée au départ (par défaut l'angle). Renvoie une nouvelle balle.
export function createBullet(origin, angle, weapon, id = 0, aimAngle = angle) {
  const dir = fromAngle(angle);
  return {
    id,
    x: num(origin?.x),
    y: num(origin?.y),
    angle: num(angle),
    aimAngle: num(aimAngle),
    dirX: dir.x,
    dirY: dir.y,
    speed: Math.max(0, num(weapon?.bulletSpeed)),
    radius: Math.max(0, num(weapon?.bulletRadius)),
    damage: Math.max(0, num(weapon?.damage)),
    maxDistance: Math.max(0, num(weapon?.bulletMaxDistance)),
    traveled: 0,
    trail: [],
  };
}

// Plus petit t dans [0, 1] où le segment p0 -> p0 + s touche le cercle (c, rad) ; null sinon. Tangent = touché.
function segmentCircle(x0, y0, sx, sy, c, rad) {
  const fx = x0 - num(c?.x);
  const fy = y0 - num(c?.y);
  const cc = fx * fx + fy * fy - rad * rad;
  if (cc <= 0) return 0;
  const a = sx * sx + sy * sy;
  if (!(a > 0)) return null;
  const b = fx * sx + fy * sy;
  const disc = b * b - a * cc;
  // Tolérance relative : une tangence exacte ne doit pas être perdue par l'arrondi.
  if (disc < -1e-9 * (b * b + a * Math.abs(cc))) return null;
  const t = (-b - Math.sqrt(Math.max(0, disc))) / a;
  return t >= 0 && t <= 1 ? t : null;
}

// Premier t dans [0, 1] où le segment sort de la zone libre ; null s'il reste dedans.
function segmentExit(x0, y0, sx, sy, b) {
  if (x0 < b.minX || x0 > b.maxX || y0 < b.minY || y0 > b.maxY) return 0;
  let t = Infinity;
  if (sx > 0) t = Math.min(t, (b.maxX - x0) / sx);
  else if (sx < 0) t = Math.min(t, (b.minX - x0) / sx);
  if (sy > 0) t = Math.min(t, (b.maxY - y0) / sy);
  else if (sy < 0) t = Math.min(t, (b.minY - y0) / sy);
  return t <= 1 ? Math.max(0, t) : null;
}

// Fait avancer toutes les balles de dt. enemies : [{ id, x, y, r }] ; bounds : zone libre { minX, minY, maxX, maxY } ;
// obstacles : rectangles pleins (aucun par défaut) : une balle qui en touche un disparaît sans dégâts (reason 'obstacle', obstacleId).
// Renvoie { bullets (celles qui volent encore), impacts [{ bulletId, enemyId, x, y, damage }], gone [{ bulletId, x, y, reason }] }.
export function stepBullets(bullets, enemies, dt, bounds, obstacles = []) {
  const list = Array.isArray(bullets) ? bullets : [];
  const targets = (Array.isArray(enemies) ? enemies : []).filter((e) => e && isNum(e.x) && isNum(e.y));
  const step = clampDt(dt);
  const b = {
    minX: num(bounds?.minX, -Infinity),
    minY: num(bounds?.minY, -Infinity),
    maxX: num(bounds?.maxX, Infinity),
    maxY: num(bounds?.maxY, Infinity),
  };
  const out = { bullets: [], impacts: [], gone: [] };
  for (const raw of list) {
    if (!raw || !isNum(raw.x) || !isNum(raw.y)) continue;
    const bullet = { ...raw, trail: Array.isArray(raw.trail) ? raw.trail.slice(0, TRAIL_LENGTH) : [] };
    const room = Math.max(0, num(bullet.maxDistance) - num(bullet.traveled));
    const dist = Math.min(num(bullet.speed) * step, room);
    if (!(dist > 0)) {
      if (step > 0 && room <= 0) out.gone.push({ bulletId: bullet.id, x: bullet.x, y: bullet.y, reason: 'range' });
      else out.bullets.push(bullet);
      continue;
    }
    const sx = num(bullet.dirX) * dist;
    const sy = num(bullet.dirY) * dist;
    const radius = Math.max(0, num(bullet.radius));
    let best = null;
    for (const enemy of targets) {
      const t = segmentCircle(bullet.x, bullet.y, sx, sy, enemy, Math.max(0, num(enemy?.r)) + radius);
      if (t !== null && (best === null || t < best.t)) best = { t, enemy };
    }
    const wallT = segmentExit(bullet.x, bullet.y, sx, sy, b);
    // Un obstacle plein arrête la balle avant tout ennemi situé derrière lui, et ne cause aucun dégât.
    const block = firstOnSegment(bullet.x, bullet.y, bullet.x + sx, bullet.y + sy, obstacles);
    if (block && (best === null || block.t <= best.t) && (wallT === null || block.t <= wallT)) {
      out.gone.push({ bulletId: bullet.id, x: bullet.x + sx * block.t, y: bullet.y + sy * block.t, reason: 'obstacle', obstacleId: block.obstacle.id });
      continue;
    }
    if (best && (wallT === null || best.t <= wallT)) {
      const x = bullet.x + sx * best.t;
      const y = bullet.y + sy * best.t;
      out.impacts.push({ bulletId: bullet.id, enemyId: best.enemy.id, x, y, damage: num(bullet.damage) });
      continue;
    }
    if (wallT !== null) {
      out.gone.push({ bulletId: bullet.id, x: bullet.x + sx * wallT, y: bullet.y + sy * wallT, reason: 'wall' });
      continue;
    }
    const traveled = num(bullet.traveled) + dist;
    const moved = { ...bullet, x: bullet.x + sx, y: bullet.y + sy, traveled, trail: [{ x: bullet.x, y: bullet.y }, ...bullet.trail].slice(0, TRAIL_LENGTH) };
    if (traveled >= num(bullet.maxDistance)) out.gone.push({ bulletId: bullet.id, x: moved.x, y: moved.y, reason: 'range' });
    else out.bullets.push(moved);
  }
  return out;
}
