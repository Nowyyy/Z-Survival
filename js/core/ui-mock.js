// Atelier de l'interface (lot 3k) : état d'interface simulé pour la planche de comparaison. Pur : la configuration (data/game/ui-atelier.json)
// arrive en argument, aucun DOM, réseau, stockage, horloge ni hasard ; les arguments ne sont jamais modifiés ; une entrée hostile donne une valeur
// par défaut et un avertissement, jamais d'exception. Les montants sont mis en forme par les fonctions du jeu (economy.js), jamais recopiées.
import { formatMoney, formatMoneyCompact } from './economy.js';
import { isNum } from './vec.js';

const isObject = (o) => o !== null && typeof o === 'object' && !Array.isArray(o);
const own = (o, k) => isObject(o) && Object.hasOwn(o, k);

// Valeurs de secours si la configuration manque (mêmes bornes que ui-atelier.json).
const FALLBACK = Object.freeze({
  ranges: { hp: [0, 100], maxHp: [1, 220], chutes: [0, 5], money: [0, 9_999_999], wave: [1, 40], remaining: [0, 10], kills: [0, 999], chrono: [0, 35_999], downSeconds: [0, 5], graceSeconds: [0, 2], earned: [0, 9_999_999], bestWave: [0, 40] },
  defaults: { hp: 100, maxHp: 100, chutes: 1, money: 0, wave: 1, reinforced: false, floor: 'rdc', remaining: 5, kills: 0, chrono: 0, save: 'saved', trial: false, down: 'none', downSeconds: 5, paused: false, end: 'none', earned: 0, bestWave: 0, record: false, nextZone: 10, multiFloor: true },
  worst: { hp: 100, maxHp: 220, chutes: 5, money: 9_999_999, wave: 40, reinforced: true, floor: 'etage', remaining: 10, kills: 999, chrono: 35_999, save: 'unavailable', trial: true, earned: 9_999_999, bestWave: 40, record: true, nextZone: 30 },
  saveStatuses: ['saved', 'pending', 'failed', 'readonly', 'locked', 'unavailable', 'memory'],
  floors: ['rdc', 'etage'],
  maxWave: 40,
});
export const DOWN_MODES = Object.freeze(['none', 'down', 'grace']);
export const END_KINDS = Object.freeze(['none', 'death', 'world']);
export const LOW_HP_RATIO = 0.25;

const validRange = (r) => Array.isArray(r) && r.length === 2 && isNum(r[0]) && isNum(r[1]) && r[0] <= r[1];

// Configuration normalisée (nouvel objet) : chaque champ absent ou invalide reprend la valeur de secours.
export function mockConfig(config) {
  const ranges = { ...FALLBACK.ranges };
  if (isObject(config?.ranges)) for (const k of Object.keys(ranges)) if (validRange(config.ranges[k])) ranges[k] = [config.ranges[k][0], config.ranges[k][1]];
  const pick = (k) => (isObject(config?.[k]) ? { ...FALLBACK[k], ...config[k] } : { ...FALLBACK[k] });
  const list = (k) => (Array.isArray(config?.[k]) && config[k].every((s) => typeof s === 'string') && config[k].length > 0 ? [...config[k]] : [...FALLBACK[k]]);
  const states = Array.isArray(config?.states) ? config.states.filter((s) => isObject(s) && typeof s.id === 'string') : [];
  return {
    ranges,
    defaults: pick('defaults'),
    worst: pick('worst'),
    saveStatuses: list('saveStatuses'),
    floors: list('floors'),
    maxWave: isNum(config?.maxWave) && config.maxWave >= 1 ? Math.floor(config.maxWave) : FALLBACK.maxWave,
    states,
  };
}

// Nombre entier borné ; les chaînes numériques sont acceptées (paramètres de la planche) ; sinon null.
function toInt(v) {
  if (isNum(v)) return Math.round(v);
  if (typeof v === 'string' && /^\s*-?\d+(\.\d+)?\s*$/.test(v)) return Math.round(Number(v));
  return null;
}
const toBool = (v) => (typeof v === 'boolean' ? v : v === 'true' || v === '1' || v === 1 ? true : v === 'false' || v === '0' || v === 0 ? false : null);

// « 05:12 » sous une heure, « 2:46:40 » au-delà (secondes entières, bornées à 0) ; entrée invalide : « 00:00 ».
export function formatChrono(seconds) {
  const s = isNum(seconds) && seconds > 0 ? Math.floor(Math.min(seconds, 359_999)) : 0;
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const two = (n) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${two(m)}:${two(sec)}` : `${two(m)}:${two(sec)}`;
}

// État d'interface simulé. params : champs de `defaults` (hp, maxHp, chutes, money, wave, reinforced, floor, remaining, kills, chrono, save, trial,
// down, downSeconds, paused, end, earned, bestWave, record, nextZone, multiFloor) ; tout champ absent prend la valeur par défaut.
export function mockState(params, config) {
  const cfg = mockConfig(config);
  const p = isObject(params) ? params : {};
  const warnings = [];
  const field = (k) => (own(p, k) ? p[k] : cfg.defaults[k]);
  const int = (k, range) => {
    const raw = field(k);
    let v = toInt(raw);
    if (v === null) {
      if (own(p, k)) warnings.push(`${k} invalide`);
      v = toInt(cfg.defaults[k]) ?? range[0];
    }
    const clamped = Math.min(range[1], Math.max(range[0], v));
    if (clamped !== v) warnings.push(`${k} borné`);
    return clamped;
  };
  const bool = (k) => {
    const b = toBool(field(k));
    if (b === null) {
      if (own(p, k)) warnings.push(`${k} invalide`);
      return Boolean(toBool(cfg.defaults[k]));
    }
    return b;
  };
  const choice = (k, list) => {
    const v = field(k);
    if (typeof v === 'string' && list.includes(v)) return v;
    if (own(p, k)) warnings.push(`${k} inconnu`);
    return list.includes(cfg.defaults[k]) ? cfg.defaults[k] : list[0];
  };

  const maxHp = int('maxHp', cfg.ranges.maxHp);
  const hp = int('hp', [cfg.ranges.hp[0], Math.max(cfg.ranges.hp[0], maxHp)]);
  const end = choice('end', END_KINDS);
  const waveRange = [cfg.ranges.wave[0], Math.max(cfg.ranges.wave[0], Math.min(cfg.ranges.wave[1], cfg.maxWave))];
  const wave = end === 'world' ? waveRange[1] : int('wave', waveRange);
  const down = choice('down', DOWN_MODES);
  const downSeconds = int('downSeconds', down === 'grace' ? cfg.ranges.graceSeconds : cfg.ranges.downSeconds);
  const save = choice('save', cfg.saveStatuses);
  const trial = bool('trial') || save === 'readonly';
  const money = int('money', cfg.ranges.money);
  const earned = int('earned', cfg.ranges.earned);
  const chrono = int('chrono', cfg.ranges.chrono);
  const rawZone = field('nextZone');
  const zone = rawZone === null ? null : toInt(rawZone);
  const nextZone = zone !== null && zone >= 1 && zone <= cfg.maxWave ? zone : null;
  if (rawZone !== null && rawZone !== undefined && nextZone === null && own(p, 'nextZone')) warnings.push('nextZone ignoré');
  const hpRatio = maxHp > 0 ? hp / maxHp : 0;

  return {
    hp,
    maxHp,
    hpRatio,
    hpPercent: Math.round(hpRatio * 100),
    lowHp: hpRatio <= LOW_HP_RATIO,
    chutes: int('chutes', cfg.ranges.chutes),
    money,
    moneyText: formatMoney(money),
    moneyCompact: formatMoneyCompact(money),
    wave,
    maxWave: cfg.maxWave,
    reinforced: bool('reinforced'),
    phase: 'combat',
    floor: choice('floor', cfg.floors),
    multiFloor: bool('multiFloor'),
    remaining: int('remaining', cfg.ranges.remaining),
    kills: int('kills', cfg.ranges.kills),
    chrono,
    chronoText: formatChrono(chrono),
    save,
    trial,
    down: { mode: down, seconds: down === 'none' ? 0 : downSeconds },
    paused: bool('paused'),
    end,
    earned,
    earnedText: formatMoney(earned),
    bestWave: int('bestWave', cfg.ranges.bestWave),
    record: bool('record'),
    nextZone,
    warnings,
  };
}

// État le plus large : « Vague 40 / 40 », étage, 5 chutes, 9 999 999, 10 restants, 999 tués (valeurs de `worst`).
export function worstCase(config) {
  const cfg = mockConfig(config);
  return mockState({ ...cfg.defaults, ...cfg.worst }, config);
}

// États nommés : [{ id, params }] (copies) ; « pire-cas » reprend `worst`. Configuration absente : le seul état « pire-cas ».
export function states(config) {
  const cfg = mockConfig(config);
  const list = cfg.states.length > 0 ? cfg.states : [{ id: 'pire-cas', worst: true, params: {} }];
  const seen = new Set();
  const out = [];
  for (const s of list) {
    if (seen.has(s.id)) continue;
    seen.add(s.id);
    const params = s.worst === true ? { ...cfg.worst } : { ...(isObject(s.params) ? s.params : {}) };
    out.push({ id: s.id, params });
  }
  return out;
}

// État simulé d'un état nommé (id inconnu : valeurs par défaut).
export function stateById(id, config) {
  const found = states(config).find((s) => s.id === id);
  return mockState(found ? found.params : {}, config);
}

// Valeurs à parcourir pour vérifier qu'aucune boîte ne bouge (bornes, passages de chiffres, formes courtes « k » et « M »).
export function sweepValues(field, config) {
  const cfg = mockConfig(config);
  const range = cfg.ranges[field];
  if (!range) return [];
  const [lo, hi] = range;
  const marks = [lo, hi, 1, 9, 10, 11, 99, 100, 999, 1000, 9999, 10_000, 99_999, 100_000, 999_999, 1_000_000, 9_999_999];
  return [...new Set(marks.filter((v) => v >= lo && v <= hi))].sort((a, b) => a - b);
}
