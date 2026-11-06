// Économie du jeu (lot 4) : argent gagné par zombie tué, par manche terminée et à la fin du monde. Pur : les paramètres (data/game/economy.json et
// les primes de data/game/enemies.json) arrivent en argument, rien n'est lu ni stocké ici, les arguments ne sont jamais modifiés (gelés acceptés),
// aucune exception, aucun hasard. Le jeu ne calcule jamais d'argent ailleurs que dans ce fichier.
// `params` = makeEconomy(economy.json, enemies.json) : les champs de economy.json plus `bounty` { type: prime }.
import { isNum, num } from './vec.js';
import { waveSpec, TYPES } from './waves.js';

const isObject = (o) => o !== null && typeof o === 'object' && !Array.isArray(o);
const MAX_WAVE = 1_000_000; // au-delà, le multiplicateur est plafonné depuis longtemps ; borne seulement les calculs

// Paramètres d'économie : economy.json + prime de chaque type (enemies.json, variants[type].bounty). Nouvel objet.
export function makeEconomy(economy, enemies) {
  const bounty = {};
  const variants = isObject(enemies?.variants) ? enemies.variants : {};
  for (const type of Object.keys(variants)) if (isObject(variants[type]) && isNum(variants[type].bounty)) bounty[type] = variants[type].bounty;
  return { ...(isObject(economy) ? economy : {}), bounty };
}

const wholeWave = (wave) => (isNum(wave) && wave >= 1 ? Math.min(MAX_WAVE, Math.floor(wave)) : 1);
const maxMoneyOf = (params) => (isNum(params?.maxMoney) && params.maxMoney >= 0 ? Math.floor(params.maxMoney) : 0);

// Entier de 0 à maxMoney (tout le reste donne 0).
export function clampMoney(n, params) {
  if (!isNum(n)) return 0;
  return Math.min(maxMoneyOf(params), Math.max(0, Math.floor(n)));
}

// Multiplicateur de gain d'un zombie à la manche donnée : 1 + killWaveGrowth × (manche − 1), plafonné à killGrowthCap.
export function killMultiplier(wave, params) {
  const growth = Math.max(0, num(params?.killWaveGrowth));
  const cap = Math.max(1, num(params?.killGrowthCap, 1));
  return Math.min(cap, 1 + growth * (wholeWave(wave) - 1));
}

// Gain d'un zombie tué : { amount, warnings }. Type inconnu = 0 avec un avertissement.
export function killMoneyInfo(type, wave, params) {
  const warnings = [];
  const bounty = isObject(params?.bounty) && typeof type === 'string' && Object.hasOwn(params.bounty, type) ? params.bounty[type] : undefined;
  if (!isNum(bounty) || bounty < 0) {
    warnings.push(`type de zombie inconnu : ${String(type).slice(0, 20).replace(/[^\w-]/g, '?')}`);
    return { amount: 0, warnings };
  }
  return { amount: Math.max(0, Math.round(bounty * killMultiplier(wave, params))), warnings };
}

// round(prime × min(plafond, 1 + croissance × (manche − 1))) : entier ≥ 0.
export const killMoney = (type, wave, params) => killMoneyInfo(type, wave, params).amount;

// Bonus de fin de manche : round((base + parManche × manche) × (renforcée ? multiplicateur : 1)) : entier ≥ 0.
export function waveBonus(wave, reinforced, params) {
  const base = Math.max(0, num(params?.waveBonusBase)) + Math.max(0, num(params?.waveBonusPerWave)) * wholeWave(wave);
  return Math.max(0, Math.round(base * (reinforced === true ? Math.max(1, num(params?.reinforcedBonusMul, 1)) : 1)));
}

// Argent d'une planche posée (réparation d'une fenêtre) : montant fixe.
export const repairMoney = (params) => Math.max(0, Math.round(num(params?.repairMoney)));

// Bonus de fin de monde (une fois par partie).
export const worldBonus = (params) => Math.max(0, Math.round(num(params?.worldBonus)));

// Tableau des gains par manche (1 à maxWave, 40 au plus) : composition de waveSpec, gain si tous les zombies sont tués, bonus, total, cumul.
// Lignes : { wave, zombies, reinforced, composition, killGain, bonus, gain, cumulative }.
export function earningsTable(wavesParams, economyParams, enemiesParams, maxWave = 40) {
  const params = isObject(economyParams) && isObject(economyParams.bounty) ? economyParams : makeEconomy(economyParams, enemiesParams);
  const last = Math.max(0, Math.min(40, isNum(maxWave) ? Math.floor(maxWave) : 40));
  const rows = [];
  let cumulative = 0;
  for (let wave = 1; wave <= last; wave += 1) {
    const spec = waveSpec(wave, wavesParams);
    let killGain = 0;
    for (const type of TYPES) killGain += num(spec.composition?.[type]) * killMoney(type, wave, params);
    const bonus = waveBonus(wave, spec.reinforced, params);
    cumulative += killGain + bonus;
    rows.push({ wave, zombies: spec.total, reinforced: spec.reinforced, composition: { ...spec.composition }, killGain, bonus, gain: killGain + bonus, cumulative });
  }
  return rows;
}

// ---------------------------------------------------------------------------------------------------------------------------------------------
// Journal des gains (immuable) : { pending (à enregistrer), earnedRun (cette partie), killsRun, byKind { kill, wave, world, repair, test } }.
export const LEDGER_KINDS = ['kill', 'wave', 'world', 'repair', 'test'];
const SAFE = Number.MAX_SAFE_INTEGER;

export function createLedger() {
  return { pending: 0, earnedRun: 0, killsRun: 0, byKind: { kill: 0, wave: 0, world: 0, repair: 0, test: 0 } };
}

const asLedger = (l) => {
  if (!isObject(l)) return createLedger();
  const by = isObject(l.byKind) ? l.byKind : {};
  return {
    pending: Math.max(0, Math.floor(num(l.pending))),
    earnedRun: Math.max(0, Math.floor(num(l.earnedRun))),
    killsRun: Math.max(0, Math.floor(num(l.killsRun))),
    byKind: Object.fromEntries(LEDGER_KINDS.map((k) => [k, Math.max(0, Math.floor(num(by[k])))])),
  };
};

// Ajoute un gain. Type inconnu, montant négatif, non entier ou supérieur à maxMoney : ignoré (le journal revient tel quel, copié).
// Le montant en attente ne dépasse jamais maxMoney.
export function ledgerAdd(ledger, entry, params) {
  const l = asLedger(ledger);
  if (!isObject(entry) || !LEDGER_KINDS.includes(entry.kind)) return l;
  const amount = entry.amount;
  if (!Number.isInteger(amount) || amount < 0 || amount > maxMoneyOf(params)) return l;
  const pending = Math.min(maxMoneyOf(params), l.pending + amount);
  const taken = pending - l.pending;
  return {
    pending,
    earnedRun: Math.min(SAFE, l.earnedRun + taken),
    killsRun: entry.kind === 'kill' ? Math.min(SAFE, l.killsRun + 1) : l.killsRun,
    byKind: { ...l.byKind, [entry.kind]: Math.min(SAFE, l.byKind[entry.kind] + taken) },
  };
}

// Prend le montant en attente : { delta: { money, earned }, ledger } ; le montant en attente du nouveau journal est 0 (les totaux de la partie restent).
// L'ancien journal n'est pas modifié : on le garde tant que l'écriture n'a pas réussi.
export function ledgerTake(ledger) {
  const l = asLedger(ledger);
  return { delta: { money: l.pending, earned: l.pending }, ledger: { ...l, pending: 0 } };
}

// Montant en attente. Un commit échoué ne vide rien : le jeu ne remplace son journal par celui de ledgerTake qu'après un commit réussi.
export const ledgerPending = (ledger) => asLedger(ledger).pending;

// ---------------------------------------------------------------------------------------------------------------------------------------------
// Affichage des montants. Espace fine insécable (U+202F) comme séparateur de milliers ; l'espace de « 12,3 k » est insécable (U+00A0).
const THIN = '\u202f';
const NBSP = '\u00a0';
const whole = (n) => (isNum(n) ? Math.max(0, Math.floor(n)) : 0);

// « 12 345 » : entier ≥ 0 (négatif, NaN ou texte donnent 0).
export function formatMoney(n) {
  return String(whole(n)).replace(/\B(?=(\d{3})+(?!\d))/g, THIN);
}

// Forme courte pour le HUD : « 9 999 » jusqu'à 9 999, « 12,3 k » dès 10 000, « 1,2 M » dès 1 000 000 (décimale tronquée, jamais arrondie vers le haut).
export function formatMoneyCompact(n) {
  const v = whole(n);
  if (v < 10_000) return formatMoney(v);
  const unit = v >= 1_000_000 ? [1_000_000, 'M'] : [1_000, 'k'];
  const tenths = Math.floor(v / (unit[0] / 10));
  const text = tenths % 10 === 0 ? String(tenths / 10) : `${Math.floor(tenths / 10)},${tenths % 10}`;
  return `${text}${NBSP}${unit[1]}`;
}
