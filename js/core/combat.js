// Combat : cadence de tir (un tir crée une balle), dégâts appliqués depuis les impacts seulement, mort, contact.
import { clampDt, isNum, num } from './vec.js';

export const createWeaponState = () => ({ cooldown: 0 });

// Fait avancer le délai entre tirs. Renvoie { state, fire }. Le reste de temps est reporté : cadence exacte.
export function stepWeapon(state, dt, wantsFire, weapon, activeBullets = 0) {
  const delay = Math.max(0, num(weapon?.fireDelay));
  const maxBullets = isNum(weapon?.maxBullets) ? weapon.maxBullets : Infinity;
  let cooldown = num(state?.cooldown) - clampDt(dt);
  if (!wantsFire || num(activeBullets) >= maxBullets) return { state: { cooldown: Math.max(0, cooldown) }, fire: false };
  if (cooldown > 0) return { state: { cooldown }, fire: false };
  cooldown += delay;
  return { state: { cooldown: Math.max(0, cooldown) }, fire: true };
}

// Point de départ de la balle et du laser, retenu dans la zone libre.
export function muzzlePoint(player, angle, offset, bounds) {
  const x = num(player?.x) + Math.cos(num(angle)) * num(offset);
  const y = num(player?.y) + Math.sin(num(angle)) * num(offset);
  return {
    x: Math.min(Math.max(x, num(bounds?.minX, -Infinity)), num(bounds?.maxX, Infinity)),
    y: Math.min(Math.max(y, num(bounds?.minY, -Infinity)), num(bounds?.maxY, Infinity)),
  };
}

// Applique les dégâts des impacts (et d'eux seuls). Renvoie { enemies (vivants), killed, hits }.
export function applyImpacts(enemies, impacts) {
  const damage = new Map();
  for (const impact of Array.isArray(impacts) ? impacts : []) {
    if (impact == null || !isNum(impact.damage) || impact.damage <= 0) continue;
    damage.set(impact.enemyId, (damage.get(impact.enemyId) ?? 0) + impact.damage);
  }
  const survivors = [];
  const killed = [];
  const hits = [];
  for (const enemy of Array.isArray(enemies) ? enemies : []) {
    if (!enemy) continue;
    const taken = damage.get(enemy.id) ?? 0;
    if (taken <= 0) {
      survivors.push({ ...enemy });
      continue;
    }
    const health = Math.max(0, num(enemy.health) - taken);
    hits.push({ enemyId: enemy.id, health });
    if (health <= 0) killed.push({ id: enemy.id, x: enemy.x, y: enemy.y });
    else survivors.push({ ...enemy, health, flash: 1 });
  }
  return { enemies: survivors, killed, hits };
}

// Vie affichée : entière, jamais négative.
export const displayHealth = (health) => Math.max(0, Math.ceil(num(health)));

// Vie après un zombie tué : + regen points, jamais au-delà du maximum, jamais de soin si le joueur n'est pas vivant (alive faux ou vie ≤ 0).
export function healOnKill(hp, maxHp, regen, alive) {
  const current = num(hp);
  const max = Math.max(0, num(maxHp));
  if (alive !== true || !(current > 0)) return Math.max(0, current);
  return Math.min(max, current + Math.max(0, num(regen)));
}

// Dégâts au contact, avec délai par ennemi (enemy.hitCooldown). Renvoie { player, enemies, damage }.
// invulnerable (lot 3, faux par défaut) : le joueur à terre ou protégé ne subit aucun dégât ; les délais des ennemis ne sont pas relancés.
export function stepContact(player, enemies, dt, def, invulnerable = false) {
  const step = clampDt(dt);
  const delay = Math.max(0, num(def?.contactDelay));
  const power = Math.max(0, num(def?.contactDamage));
  let damage = 0;
  const next = (Array.isArray(enemies) ? enemies : []).map((enemy) => {
    let cooldown = Math.max(0, num(enemy?.hitCooldown) - step);
    const hit = isNum(enemy?.damage) ? Math.max(0, enemy.damage) : power; // lot 2 : dégâts du type et de la vague
    const touching = Math.hypot(num(enemy?.x) - num(player?.x), num(enemy?.y) - num(player?.y)) <= num(player?.r) + num(enemy?.r) + 1;
    if (invulnerable !== true && touching && cooldown <= 0 && num(player?.health) > damage) {
      damage += hit;
      cooldown = delay;
    }
    return { ...enemy, hitCooldown: cooldown };
  });
  const health = Math.max(0, num(player?.health) - damage);
  return { player: { ...player, health }, enemies: next, damage: num(player?.health) - health };
}
