// Création d'un zombie à partir de son type, de son allure et de la vague (data/game/enemies.json et gaits.json passés en argument).
// Vitesse = min(base de l'allure × speedMul(vague), plafond de l'allure) × speedMul du type, puis plafonnée à maxSpeed (toujours sous
// la vitesse du joueur). Pur : aucun hasard, aucune horloge.
import { GAITS, TYPES } from './waves.js';
import { isNum, num } from './vec.js';

const FALLBACK_TYPE = 'marcheur';
const FALLBACK_GAIT = 'marche';

export const isType = (t) => TYPES.includes(t);
export const isGait = (g) => GAITS.includes(g);

// Vitesse d'un zombie (unités par seconde) ; combinaisons inconnues : marcheur / marche.
export function enemySpeed(type, gait, speedMul, enemies, gaits) {
  const g = gaits?.gaits?.[isGait(gait) ? gait : FALLBACK_GAIT];
  const v = enemies?.variants?.[isType(type) ? type : FALLBACK_TYPE];
  const base = Math.min(Math.max(0, num(g?.speed)) * Math.max(0, num(speedMul, 1)), Math.max(0, num(g?.cap, Infinity)));
  return Math.min(base * Math.max(0, num(v?.speedMul, 1)), Math.max(0, num(gaits?.maxSpeed, Infinity)));
}

// spec : sortie de waveSpec (hpMul, speedMul, damageMul) ; enemies : enemies.json ; gaits : gaits.json.
// Renvoie { type, gait, hp, maxHp, speed, damage, radius, stride, bounty, tearMul } (tearMul : vitesse d'arrachage des planches, lot 3).
export function createEnemy(type, gait, spec, enemies, gaits) {
  const t = isType(type) ? type : FALLBACK_TYPE;
  const g = isGait(gait) ? gait : FALLBACK_GAIT;
  const base = enemies?.zombie ?? {};
  const v = enemies?.variants?.[t] ?? {};
  const hp = Math.max(1, num(base.health, 1) * Math.max(0, num(spec?.hpMul, 1)) * Math.max(0, num(v.hpMul, 1)));
  return {
    type: t,
    gait: g,
    hp,
    maxHp: hp,
    speed: enemySpeed(t, g, spec?.speedMul, enemies, gaits),
    damage: Math.max(0, num(base.contactDamage)) * Math.max(0, num(spec?.damageMul, 1)) * Math.max(0, num(v.damageMul, 1)),
    radius: Math.max(0, num(base.radius)) * (isNum(v.radiusMul) && v.radiusMul > 0 ? v.radiusMul : 1),
    stride: Math.max(1, num(gaits?.gaits?.[g]?.stride, 52)),
    bounty: Math.max(0, num(v.bounty)),
    tearMul: isNum(v.tearMul) && v.tearMul > 0 ? v.tearMul : 1,
  };
}
