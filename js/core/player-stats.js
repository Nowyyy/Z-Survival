// Statistiques du joueur : sept statistiques à niveaux entiers de 0 à maxLevel, qui modifient l'arme et le joueur. Pur : les paramètres
// (data/game/player-stats.json) arrivent en argument, rien n'est lu ni stocké ici, les arguments ne sont jamais modifiés, aucune exception.
// Un paramètre absent vaut sa valeur neutre (aucun effet par niveau) : les chiffres vivent dans les données.
import { isNum, num } from './vec.js';

export const STAT_IDS = ['degats', 'portee', 'precision', 'cadence', 'vitesse', 'vie', 'regen'];

const maxLevelOf = (params) => (isNum(params?.maxLevel) && params.maxLevel >= 0 ? Math.floor(params.maxLevel) : 0);
const stat = (params, id) => (params?.stats && typeof params.stats[id] === 'object' && params.stats[id] !== null ? params.stats[id] : {});

// Niveaux normalisés : { levels: { degats, ... } (entiers de 0 à maxLevel), warnings: [texte] }. Absent = 0 sans avertissement ;
// inconnu, non entier ou invalide = 0 (inconnu : ignoré) avec avertissement ; hors bornes : borné avec avertissement.
export function normalizeLevels(levels, params) {
  const max = maxLevelOf(params);
  const warnings = [];
  const source = levels !== null && typeof levels === 'object' && !Array.isArray(levels) ? levels : {};
  for (const key of Object.keys(source)) if (!STAT_IDS.includes(key)) warnings.push(`statistique inconnue : ${key}`);
  const out = {};
  for (const id of STAT_IDS) {
    const value = Object.hasOwn(source, id) ? source[id] : undefined;
    if (value === undefined) {
      out[id] = 0;
    } else if (!Number.isInteger(value)) {
      out[id] = 0;
      warnings.push(`niveau invalide pour ${id}`);
    } else {
      out[id] = Math.min(max, Math.max(0, value));
      if (out[id] !== value) warnings.push(`niveau hors bornes pour ${id}`);
    }
  }
  return { levels: out, warnings };
}

// Valeurs effectives de chaque statistique (multiplicateurs et angles), d'après des niveaux quelconques (normalisés ici).
export function statValues(levels, params) {
  const L = normalizeLevels(levels, params).levels;
  const p = (id) => stat(params, id);
  const ratio = (a, k) => (isNum(a) ? a : k);
  const speedBonus = Math.min(num(p('vitesse').maxBonus), num(p('vitesse').perLevel) * L.vitesse);
  const baseDelayDecay = ratio(p('cadence').decay, 1);
  return {
    levels: L,
    damageMul: 1 + num(p('degats').perLevel) * L.degats,
    rangeMul: 1 + num(p('portee').perLevel) * L.portee,
    bulletMargin: num(p('portee').bulletMargin),
    stillAngle: num(p('precision').baseAngle) * ratio(p('precision').baseDecay, 1) ** L.precision,
    moveAngle: num(p('precision').moveAngle) * ratio(p('precision').moveDecay, 1) ** L.precision,
    minAngle: num(p('precision').minAngle),
    delayMul: baseDelayDecay ** L.cadence,
    minDelay: num(p('cadence').minDelay),
    speedMul: 1 + speedBonus,
    hpBonus: num(p('vie').perLevel) * L.vie,
    regen: num(p('regen').base) + num(p('regen').perLevel) * L.regen,
  };
}

// Arme effective (nouvel objet) : dégâts, délai, portée de tir, longueur du laser, distance maximale de la balle, demi-angles de cône
// (coneStill à l'arrêt, coneMove en plus à pleine vitesse, en degrés).
export function effectiveWeapon(weapon, levels, params) {
  const v = statValues(levels, params);
  const baseDelay = Math.max(0, num(weapon?.fireDelay));
  const fireRange = Math.max(0, num(weapon?.fireRange)) * v.rangeMul;
  return {
    ...(weapon && typeof weapon === 'object' ? weapon : {}),
    damage: Math.max(0, num(weapon?.damage)) * v.damageMul,
    fireDelay: Math.max(Math.min(baseDelay, v.minDelay), baseDelay * v.delayMul),
    fireRange,
    laserRange: Math.max(0, num(weapon?.laserRange)) * v.rangeMul,
    bulletMaxDistance: fireRange + v.bulletMargin,
    coneStill: Math.max(v.minAngle, v.stillAngle),
    coneMove: Math.max(v.minAngle, v.stillAngle + v.moveAngle),
  };
}

// Joueur effectif (nouvel objet) : vie maximale, vitesse, vie rendue par zombie tué.
export function effectivePlayer(player, levels, params) {
  const v = statValues(levels, params);
  return {
    ...(player && typeof player === 'object' ? player : {}),
    maxHealth: Math.max(0, num(player?.health)) + v.hpBonus,
    speed: Math.max(0, num(player?.speed)) * v.speedMul,
    regen: v.regen,
  };
}

const MAX_PARAM_LENGTH = 400;

// Analyse de ?lvl= (chaîne brute, sans accès au DOM) : « degats:3,precision:5 », « all:5 » ou les deux (« all » appliqué d'abord).
// Renvoie { levels (partiels : seulement les statistiques citées), warnings }. Clés inconnues et valeurs non entières ignorées,
// valeurs hors bornes bornées.
export function parseLevelsParam(text, params) {
  const max = maxLevelOf(params);
  const warnings = [];
  const entries = [];
  if (typeof text !== 'string' || text === '') return { levels: {}, warnings };
  let raw = text;
  if (raw.length > MAX_PARAM_LENGTH) {
    warnings.push('paramètre trop long : tronqué');
    raw = raw.slice(0, MAX_PARAM_LENGTH);
  }
  for (const part of raw.split(',')) {
    const piece = part.trim();
    if (piece === '') continue;
    const match = /^([a-z]+):(-?\d+)$/.exec(piece);
    if (!match) {
      warnings.push(`entrée ignorée : ${piece.slice(0, 20).replace(/[^\w:-]/g, '?')}`);
      continue;
    }
    const [, key, digits] = match;
    if (key !== 'all' && !STAT_IDS.includes(key)) {
      warnings.push(`statistique inconnue : ${key}`);
      continue;
    }
    const value = Math.min(max, Math.max(0, Number(digits)));
    if (value !== Number(digits)) warnings.push(`niveau hors bornes pour ${key}`);
    entries.push([key, value]);
  }
  const levels = {};
  for (const [key, value] of entries) if (key === 'all') for (const id of STAT_IDS) levels[id] = value;
  for (const [key, value] of entries) if (key !== 'all') levels[key] = value;
  return { levels, warnings };
}
