// Sauvegarde du joueur (lot 4) : schéma v1, nettoyage, migrations, différences, code d'export ZS1.<base64url>.<crc32>. Pur : aucun stockage ni horloge
// (le temps est passé en argument), aucune exception, les arguments ne sont jamais modifiés, des objets neufs à chaque appel.
// `params` = { save: save.json, economy: economy.json, stats: player-stats.json } ; un paramètre absent donne la valeur la plus stricte (maximum 0).
import { isNum } from './vec.js';
import { ALL_STAT_IDS, normalizeLevels } from './player-stats.js';

export const SCHEMA_VERSION = 1;
export const STAT_KEYS = ALL_STAT_IDS; // les neuf statistiques : sept d'origine + chutes + reparation
export const RECORD_KEYS = ['bestWave', 'bestKills', 'runs', 'worldsCompleted'];
export const ERROR_CODES = ['empty', 'too-long', 'bad-prefix', 'bad-format', 'bad-base64', 'bad-checksum', 'bad-json', 'bad-schema', 'future-version'];

const SAFE = Number.MAX_SAFE_INTEGER;
const MAX_WARNINGS = 20;
const isObject = (o) => o !== null && typeof o === 'object' && !Array.isArray(o);
const own = (o, k) => isObject(o) && Object.hasOwn(o, k);
const label = (k) => String(k).slice(0, 24).replace(/[^\w-]/g, '?');

export const maxMoneyOf = (params) => (isNum(params?.economy?.maxMoney) && params.economy.maxMoney >= 0 ? Math.floor(params.economy.maxMoney) : 0);

// Niveau maximal de chaque statistique, lu de player-stats.js (maxLevel commun ou propre aux statistiques extra).
export function statMaxLevels(params) {
  const probe = Object.fromEntries(STAT_KEYS.map((id) => [id, SAFE]));
  return normalizeLevels(probe, params?.stats).levels;
}

export function defaultSave() {
  return {
    v: SCHEMA_VERSION,
    rev: 0,
    savedAt: 0,
    money: 0,
    earned: 0,
    stats: Object.fromEntries(STAT_KEYS.map((id) => [id, 0])),
    records: { bestWave: 0, bestKills: 0, runs: 0, worldsCompleted: 0 },
  };
}

// Entier de 0 à max d'une valeur quelconque : nombre fini (partie entière), chaîne de chiffres (avec avertissement) ; le reste vaut le repli.
function toBoundedInt(value, max, name, warnings, fallback = 0) {
  let n;
  if (typeof value === 'number' && Number.isFinite(value)) {
    n = value;
    if (!Number.isInteger(value)) warn(warnings, `${name} : entier attendu`);
  } else if (typeof value === 'string' && /^\s*\d{1,16}\s*$/.test(value)) {
    n = Number(value.trim());
    warn(warnings, `${name} : nombre écrit en texte`);
  } else {
    if (value !== undefined) warn(warnings, `${name} : valeur invalide`);
    return fallback;
  }
  const whole = Math.floor(n);
  const bounded = Math.min(max, Math.max(0, whole));
  if (bounded !== whole) warn(warnings, `${name} : hors bornes`);
  return bounded;
}

function warn(warnings, text) {
  if (warnings.length < MAX_WARNINGS) warnings.push(text);
}

function unknownKeys(source, allowed, where, warnings) {
  if (!isObject(source)) return;
  let count = 0;
  for (const key of Object.keys(source)) {
    if (allowed.includes(key)) continue;
    count += 1;
    if (count <= 3) warn(warnings, `clé inconnue (${where}) : ${label(key)}`);
  }
}

// Réécrit n'importe quoi en sauvegarde v1 valide : liste blanche de clés, nombres bornés, nouveaux objets. { save, warnings }.
// Les clés « __proto__ », « constructor » et « prototype » ne sont jamais lues comme des données.
export function sanitize(raw, params) {
  const warnings = [];
  if (!isObject(raw)) {
    warn(warnings, 'racine invalide : sauvegarde par défaut');
    return { save: defaultSave(), warnings };
  }
  const maxMoney = maxMoneyOf(params);
  const levelMax = statMaxLevels(params);
  unknownKeys(raw, ['v', 'rev', 'savedAt', 'money', 'earned', 'stats', 'records'], 'racine', warnings);
  const save = defaultSave();
  save.rev = toBoundedInt(own(raw, 'rev') ? raw.rev : undefined, SAFE, 'rev', warnings);
  save.savedAt = toBoundedInt(own(raw, 'savedAt') ? raw.savedAt : undefined, SAFE, 'savedAt', warnings);
  save.money = toBoundedInt(own(raw, 'money') ? raw.money : undefined, maxMoney, 'money', warnings);
  save.earned = toBoundedInt(own(raw, 'earned') ? raw.earned : undefined, SAFE, 'earned', warnings);
  const stats = own(raw, 'stats') ? raw.stats : undefined;
  if (stats !== undefined && !isObject(stats)) warn(warnings, 'stats : objet attendu');
  unknownKeys(stats, STAT_KEYS, 'stats', warnings);
  for (const id of STAT_KEYS) save.stats[id] = toBoundedInt(own(stats, id) ? stats[id] : undefined, levelMax[id], `stats.${id}`, warnings);
  const records = own(raw, 'records') ? raw.records : undefined;
  if (records !== undefined && !isObject(records)) warn(warnings, 'records : objet attendu');
  unknownKeys(records, RECORD_KEYS, 'records', warnings);
  for (const key of RECORD_KEYS) save.records[key] = toBoundedInt(own(records, key) ? records[key] : undefined, SAFE, `records.${key}`, warnings);
  return { save, warnings };
}

// ---------------------------------------------------------------------------------------------------------------------------------------------
// Migrations : MIGRATIONS[v] transforme une sauvegarde de version v en version v + 1 (objet brut → objet brut). Aucune migration réelle à ce jour
// (la version 1 est la première) ; les tests en fournissent une version 0 synthétique (`{ coins, levels }` → v1) par l'argument `chain`.
export const MIGRATIONS = {};

// { ok: true, save, from, warnings } ou { ok: false, error } (error : 'bad-schema' ou 'future-version').
export function migrate(raw, params, chain = MIGRATIONS, current = SCHEMA_VERSION) {
  if (!isObject(raw)) return { ok: false, error: 'bad-schema' };
  const first = own(raw, 'v') ? raw.v : undefined;
  if (!Number.isInteger(first) || first < 0) return { ok: false, error: 'bad-schema' };
  if (first > current) return { ok: false, error: 'future-version' };
  let version = first;
  let data = raw;
  while (version < current) {
    const step = own(chain, version) ? chain[version] : undefined;
    if (typeof step !== 'function') return { ok: false, error: 'bad-schema' };
    try {
      data = step(data);
    } catch {
      return { ok: false, error: 'bad-schema' };
    }
    const next = own(data, 'v') ? data.v : undefined;
    if (!isObject(data) || !Number.isInteger(next) || next <= version) return { ok: false, error: 'bad-schema' };
    version = next;
    if (version > current) return { ok: false, error: 'bad-schema' };
  }
  const clean = sanitize(data, params);
  return { ok: true, save: clean.save, from: first, warnings: clean.warnings };
}

// ---------------------------------------------------------------------------------------------------------------------------------------------
// Différences. delta : { money (entier, négatif accepté pour un futur achat, solde jamais sous 0), earned (≥ 0), runs (≥ 0), worlds (≥ 0), bestWave, bestKills }.
// Tous les champs sont facultatifs ; une valeur invalide est ignorée. Renvoie une NOUVELLE sauvegarde : rev + 1, savedAt = now, records au maximum.
const intOr0 = (n) => (isNum(n) && Number.isInteger(n) ? n : 0);

export function commitDelta(save, delta, now, params) {
  const base = sanitize(save, params).save;
  const d = isObject(delta) ? delta : {};
  const moneyDelta = own(d, 'money') ? intOr0(d.money) : 0;
  const earnedDelta = own(d, 'earned') ? Math.max(0, intOr0(d.earned)) : 0;
  const runs = own(d, 'runs') ? Math.max(0, intOr0(d.runs)) : 0;
  const worlds = own(d, 'worlds') ? Math.max(0, intOr0(d.worlds)) : 0;
  const bestWave = own(d, 'bestWave') ? Math.max(0, intOr0(d.bestWave)) : 0;
  const bestKills = own(d, 'bestKills') ? Math.max(0, intOr0(d.bestKills)) : 0;
  return {
    ...base,
    rev: Math.min(SAFE, base.rev + 1),
    savedAt: isNum(now) && now >= 0 ? Math.min(SAFE, Math.floor(now)) : base.savedAt,
    money: Math.min(maxMoneyOf(params), Math.max(0, base.money + moneyDelta)),
    earned: Math.min(SAFE, base.earned + earnedDelta),
    stats: { ...base.stats },
    records: {
      bestWave: Math.min(SAFE, Math.max(base.records.bestWave, bestWave)),
      bestKills: Math.min(SAFE, Math.max(base.records.bestKills, bestKills)),
      runs: Math.min(SAFE, base.records.runs + runs),
      worldsCompleted: Math.min(SAFE, base.records.worldsCompleted + worlds),
    },
  };
}

// ---------------------------------------------------------------------------------------------------------------------------------------------
// Code d'export : ZS1.<base64url de l'UTF-8 du JSON compact>.<CRC32 de la partie base64url, 8 chiffres hexadécimaux en minuscules>.
// Le CRC32 porte sur le texte base64url (et non sur le JSON) : changer un seul caractère du corps change toujours la somme, même un caractère
// dont les bits de poids faible ne servent pas au décodage.
let crcTable = null;
export function crc32(text) {
  if (crcTable === null) {
    crcTable = new Uint32Array(256);
    for (let n = 0; n < 256; n += 1) {
      let c = n;
      for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      crcTable[n] = c >>> 0;
    }
  }
  let crc = 0xffffffff;
  const bytes = new TextEncoder().encode(String(text));
  for (const b of bytes) crc = crcTable[(crc ^ b) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

const hex8 = (n) => n.toString(16).padStart(8, '0');
const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

export function toBase64Url(bytes) {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i];
    const b = i + 1 < bytes.length ? bytes[i + 1] : 0;
    const c = i + 2 < bytes.length ? bytes[i + 2] : 0;
    out += B64[a >> 2] + B64[((a & 3) << 4) | (b >> 4)];
    if (i + 1 < bytes.length) out += B64[((b & 15) << 2) | (c >> 6)];
    if (i + 2 < bytes.length) out += B64[c & 63];
  }
  return out;
}

// Octets d'un texte base64url (sans remplissage) ; null si un caractère est interdit ou la longueur impossible.
export function fromBase64Url(text) {
  if (typeof text !== 'string' || text.length % 4 === 1 || !/^[A-Za-z0-9_-]*$/.test(text)) return null;
  const bytes = [];
  for (let i = 0; i < text.length; i += 4) {
    const v = [0, 1, 2, 3].map((k) => (i + k < text.length ? B64.indexOf(text[i + k]) : 0));
    bytes.push((v[0] << 2) | (v[1] >> 4));
    if (i + 2 < text.length) bytes.push(((v[1] & 15) << 4) | (v[2] >> 2));
    if (i + 3 < text.length) bytes.push(((v[2] & 3) << 6) | v[3]);
  }
  return Uint8Array.from(bytes);
}

const prefixOf = (params) => (typeof params?.save?.exportPrefix === 'string' && params.save.exportPrefix !== '' ? params.save.exportPrefix : 'ZS1');
const maxCodeOf = (params) => (isNum(params?.save?.maxCodeLength) && params.save.maxCodeLength > 0 ? Math.floor(params.save.maxCodeLength) : 0);

// Code d'une sauvegarde (nettoyée d'abord : seules les clés du schéma sont écrites, dans un ordre fixe).
export function encodeSave(save, params) {
  const clean = sanitize(save, params).save;
  const ordered = {
    v: clean.v, rev: clean.rev, savedAt: clean.savedAt, money: clean.money, earned: clean.earned,
    stats: Object.fromEntries(STAT_KEYS.map((id) => [id, clean.stats[id]])),
    records: Object.fromEntries(RECORD_KEYS.map((k) => [k, clean.records[k]])),
  };
  const body = toBase64Url(new TextEncoder().encode(JSON.stringify(ordered)));
  return `${prefixOf(params)}.${body}.${hex8(crc32(body))}`;
}

// Espaces, retours à la ligne, espaces insécables et caractères de largeur nulle (les messages et le presse-papiers d'iOS en ajoutent).
const INVISIBLE = /[\s\u00ad\u200b-\u200f\u2028-\u202e\u2060-\u2064\u2066-\u2069\ufeff]/g;
const HARD_LIMIT_FACTOR = 16;

// { ok: true, save, warnings } ou { ok: false, error } (error : un des ERROR_CODES). Ne lève jamais.
export function decodeSave(text, params) {
  try {
    if (text === undefined || text === null) return { ok: false, error: 'empty' };
    if (typeof text !== 'string') return { ok: false, error: 'bad-format' };
    const limit = maxCodeOf(params);
    if (text.length > Math.max(limit, 1) * HARD_LIMIT_FACTOR) return { ok: false, error: 'too-long' };
    const code = text.replace(INVISIBLE, '');
    if (code === '') return { ok: false, error: 'empty' };
    if (code.length > limit) return { ok: false, error: 'too-long' };
    const parts = code.split('.');
    if (parts[0] !== prefixOf(params)) return { ok: false, error: 'bad-prefix' };
    if (parts.length !== 3 || parts[1] === '' || parts[2] === '') return { ok: false, error: 'bad-format' };
    if (!/^[0-9a-f]{8}$/.test(parts[2])) return { ok: false, error: 'bad-format' };
    const bytes = fromBase64Url(parts[1]);
    if (bytes === null) return { ok: false, error: 'bad-base64' };
    if (hex8(crc32(parts[1])) !== parts[2]) return { ok: false, error: 'bad-checksum' };
    let json;
    try {
      json = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    } catch {
      return { ok: false, error: 'bad-json' };
    }
    let raw;
    try {
      raw = JSON.parse(json);
    } catch {
      return { ok: false, error: 'bad-json' };
    }
    const result = migrate(raw, params);
    return result.ok ? { ok: true, save: result.save, warnings: result.warnings } : { ok: false, error: result.error };
  } catch {
    return { ok: false, error: 'bad-format' };
  }
}

// Aperçu d'un import : { money, earned, levelsSum, records }.
export function describeSave(save) {
  const int = (n) => (isNum(n) ? Math.max(0, Math.floor(n)) : 0);
  const stats = isObject(save?.stats) ? save.stats : {};
  const rec = isObject(save?.records) ? save.records : {};
  return {
    money: int(save?.money),
    earned: int(save?.earned),
    levelsSum: STAT_KEYS.reduce((sum, id) => sum + int(stats[id]), 0),
    records: Object.fromEntries(RECORD_KEYS.map((k) => [k, int(rec[k])])),
  };
}

// ---------------------------------------------------------------------------------------------------------------------------------------------
// Mode essai. search : chaîne de requête, avec ou sans « ? ».
function queryOf(search) {
  if (typeof search !== 'string') return new URLSearchParams('');
  return new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
}

// { readOnly, reasons } : les paramètres de readOnlyParams présents avec une valeur non vide (dans l'ordre de la liste).
export function readOnlyMode(search, params) {
  try {
    const query = queryOf(search);
    const list = Array.isArray(params?.save?.readOnlyParams) ? params.save.readOnlyParams.filter((k) => typeof k === 'string') : [];
    const reasons = list.filter((name) => {
      const value = query.get(name);
      return typeof value === 'string' && value.trim() !== '';
    });
    return { readOnly: reasons.length > 0, reasons };
  } catch {
    return { readOnly: false, reasons: [] };
  }
}

// ?money=N : entier de 0 à maxMoney, sinon null.
export function parseMoneyParam(search, params) {
  try {
    const value = queryOf(search).get('money');
    if (typeof value !== 'string' || !/^\d{1,16}$/.test(value)) return null;
    const n = Number(value);
    return n <= maxMoneyOf(params) ? n : null;
  } catch {
    return null;
  }
}
