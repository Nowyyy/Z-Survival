// Chutes du joueur (lot 3) : à 0 de vie, s'il reste une chute, le joueur tombe, reste à terre quelques secondes (invulnérable, immobile,
// sans tir), repousse les zombies proches, puis se relève avec une partie de sa vie et une courte protection ; sans chute, c'est la mort.
// Pur : temps (dt borné à 0,05 s, 0 en pause) et paramètres (data/game/player-down.json) en argument ; aucun argument n'est modifié,
// aucune exception, aucun hasard.
import { moveWithCollision, validRects } from './collision.js';
import { floorOf } from './floors.js';
import { clampDt, isNum, normalize, num } from './vec.js';

export const DOWN_STATES = ['debout', 'terre', 'mort'];
const isObject = (o) => o !== null && typeof o === 'object' && !Array.isArray(o);
const EPS = 1e-9; // les pas de 0,05 s s'additionnent avec une erreur d'arrondi : 100 pas ne doivent pas en laisser un de plus

// chutes : nombre de chutes disponibles (entier de 0 à 99 ; invalide : 0).
export function createPlayerDown(chutes) {
  const n = isNum(chutes) ? Math.min(99, Math.max(0, Math.floor(chutes))) : 0;
  return { state: 'debout', chutes: n, chutesMax: n, timeLeft: 0, grace: 0, pendingHeal: 0 };
}

const sane = (down) => {
  const d = isObject(down) ? down : {};
  return {
    state: DOWN_STATES.includes(d.state) ? d.state : 'debout',
    chutes: Math.max(0, Math.floor(num(d.chutes))),
    chutesMax: Math.max(0, Math.floor(num(d.chutesMax, num(d.chutes)))),
    timeLeft: Math.max(0, num(d.timeLeft)),
    grace: Math.max(0, num(d.grace)),
    pendingHeal: Math.max(0, num(d.pendingHeal)),
  };
};

// vitals : { hp, maxHp }. Renvoie { down, hp, events, knockback } : events parmi 'fall', 'standup', 'death' ; knockback : null ou
// { radius, distance, reason: 'fall' | 'standup' } (repoussement des zombies à appliquer par le jeu).
export function stepPlayerDown(down, vitals, dt, params) {
  const step = clampDt(dt);
  const d = sane(down);
  const maxHp = Math.max(0, num(vitals?.maxHp));
  let hp = Math.max(0, num(vitals?.hp));
  const events = [];
  let knockback = null;
  const ball = (distance, reason) => ({ radius: Math.max(0, num(params?.knockbackRadius)), distance: Math.max(0, num(distance)), reason });
  if (d.state === 'debout') {
    if (hp <= 0) {
      hp = 0;
      if (d.chutes > 0) {
        d.state = 'terre';
        d.chutes -= 1;
        d.timeLeft = Math.max(0.05, num(params?.downDuration, 5));
        d.grace = 0;
        events.push('fall');
        knockback = ball(params?.fallDistance, 'fall');
      } else {
        d.state = 'mort';
        events.push('death');
      }
    } else d.grace = d.grace - step <= EPS ? 0 : d.grace - step;
  } else if (d.state === 'terre') {
    hp = 0;
    d.timeLeft = Math.max(0, d.timeLeft - step);
    if (d.timeLeft <= EPS) {
      d.timeLeft = 0;
      d.state = 'debout';
      d.grace = Math.max(0, num(params?.graceTime, 2));
      const fraction = Math.min(1, Math.max(0, num(params?.standUpHealFraction, 0.5)));
      hp = Math.min(maxHp, maxHp * fraction + maxHp * d.pendingHeal);
      hp = Math.max(hp, Math.min(maxHp, 1)); // jamais relevé à 0 de vie (vie maximale nulle : 0)
      d.pendingHeal = 0;
      events.push('standup');
      knockback = ball(params?.standUpDistance, 'standup');
    }
  } else hp = 0;
  return { down: d, hp, events, knockback };
}

// Invulnérable à terre et pendant la protection qui suit le relevage ; la mort n'est pas une invulnérabilité (le jeu s'arrête).
export const isInvulnerable = (down) => {
  const d = sane(down);
  return d.state === 'terre' || (d.state === 'debout' && d.grace > 0);
};
export const canMove = (down) => sane(down).state === 'debout';
export const canFire = (down) => sane(down).state === 'debout';
// Soin par zombie tué : jamais à terre ni mort.
export const canHealOnKill = (down) => sane(down).state === 'debout';

// Soin de fin de vague : debout, la vie monte de fraction × vie maximale (sans dépasser) ; à terre, le soin est reporté au relevage
// (pendingHeal) ; mort : rien. Renvoie { hp, down }.
export function applyHeal(hp, maxHp, fraction, down) {
  const d = sane(down);
  const current = Math.max(0, num(hp));
  const max = Math.max(0, num(maxHp));
  const f = Math.max(0, num(fraction));
  if (d.state === 'terre') return { hp: current, down: { ...d, pendingHeal: Math.min(1, d.pendingHeal + f) } };
  if (d.state === 'mort') return { hp: current, down: d };
  return { hp: Math.min(max, current + max * f), down: d };
}

// Repousse les zombies « dedans » ou « libre » situés dans la salle à moins de radius du centre : ils s'éloignent de distance unités au
// plus, en s'arrêtant aux murs, aux meubles et aux fenêtres (même ouvertes). layout : { bounds, furniture, walls, gaps } (rectangles).
// Les zombies hors de la salle ou en approche, attente, arrache, escalade ne bougent pas. Renvoie une nouvelle liste.
// Lot 3e : seuls les zombies du même étage que center (champ floor, rez-de-chaussée par défaut) sont repoussés ; layout est la couche de cet étage.
export function knockbackZombies(zombies, center, params, layout) {
  const cx = num(center?.x);
  const cy = num(center?.y);
  const radius = Math.max(0, num(params?.radius));
  const distance = Math.max(0, num(params?.distance));
  const b = layout?.bounds;
  const solids = [...validRects(layout?.furniture), ...validRects(layout?.walls), ...validRects(layout?.gaps)];
  const bounds = b && [b.minX, b.minY, b.maxX, b.maxY].every(isNum) ? b : null;
  return (Array.isArray(zombies) ? zombies : []).map((z) => {
    if (!isObject(z) || !isNum(z.x) || !isNum(z.y)) return z;
    const mode = z.mode ?? 'libre';
    if (mode !== 'dedans' && mode !== 'libre') return z;
    if (floorOf(z) !== floorOf(center)) return z;
    if (typeof layout?.inside === 'function' ? !layout.inside(z.x, z.y) : bounds && (z.x < bounds.minX || z.x > bounds.maxX || z.y < bounds.minY || z.y > bounds.maxY)) return z;
    const dx = z.x - cx;
    const dy = z.y - cy;
    if (Math.hypot(dx, dy) > radius) return z;
    // Superposé au centre : direction fixe, choisie d'après l'identifiant (déterministe).
    const away = Math.hypot(dx, dy) > 1e-9 ? normalize({ x: dx, y: dy }) : { x: num(z.id) % 2 === 0 ? 1 : -1, y: 0 };
    const moved = moveWithCollision({ x: z.x, y: z.y, r: Math.max(0, num(z.r)) }, { x: away.x * distance, y: away.y * distance }, solids, typeof layout?.inside === 'function' ? undefined : bounds ?? undefined);
    return { ...z, x: moved.x, y: moved.y };
  });
}
