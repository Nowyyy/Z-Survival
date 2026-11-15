// Courbe de difficulté par vague : fonctions pures, paramétrées par data/game/waves.json (passé en argument, jamais lu ici).
// La vie suit la forme du mode Zombies de Black Ops 3 (montée linéaire, puis ×1,1 par vague), avec un plafond ; le reste est de conception
// propre. Aucune horloge, aucun hasard natif : waveOrder tire d'une graine (rng.js). Valeurs invalides ramenées à 1 (avec warnings).
import { createRng, nextInt } from './rng.js';
import { isNum, num } from './vec.js';

export const TYPES = ['marcheur', 'petit', 'voute', 'grand'];
export const GAITS = ['lent', 'marche', 'rampe', 'course'];
const MAX_EXPONENT_WAVE = 10000; // au-delà, les puissances restent finies ; la vague renvoyée, elle, n'est pas modifiée

// Entier ≥ 1 ou 1 (la vague 2,5, 0, -3, NaN ou « 4 » sont invalides).
const asWave = (n) => (Number.isInteger(n) && n >= 1 ? n : 1);
const pos = (n, fallback) => (isNum(n) && n > 0 ? n : fallback);
const rec = (o) => (o !== null && typeof o === 'object' ? o : {});

// Répartit `total` unités selon des poids (méthode du plus fort reste) : entiers dont la somme vaut exactement `total`.
// Ex æquo : l'ordre des clés. Poids tous nuls : tout à la première clé.
export function apportion(weights, keys, total) {
  const n = Math.max(0, Math.floor(num(total)));
  const w = keys.map((k) => Math.max(0, num(weights?.[k])));
  const sum = w.reduce((a, b) => a + b, 0);
  const out = {};
  if (sum <= 0) {
    keys.forEach((k, i) => { out[k] = i === 0 ? n : 0; });
    return out;
  }
  const quota = w.map((x) => Math.round(((x / sum) * n) * 1e9) / 1e9);
  const floors = quota.map(Math.floor);
  let left = n - floors.reduce((a, b) => a + b, 0);
  const order = quota.map((q, i) => ({ i, r: q - floors[i] })).sort((a, b) => b.r - a.r || a.i - b.i);
  for (let k = 0; left > 0; k = (k + 1) % order.length, left -= 1) floors[order[k].i] += 1;
  keys.forEach((k, i) => { out[k] = floors[i]; });
  return out;
}

// Niveau d'une vague (numérotation continue des vagues, les niveaux n'ont aucun effet de jeu au lot 2) : ceil(n / vagues par niveau).
export function levelOfWave(n, wavesPerLevel) {
  const per = Number.isInteger(wavesPerLevel) && wavesPerLevel >= 1 ? wavesPerLevel : 1;
  return Math.ceil(asWave(n) / per);
}

// Multiplicateur de vie : 1 + pente × (n − 1) jusqu'à la manche d'entrée dans l'exponentielle, puis ×facteur par vague, plafonné.
export function hpMul(n, hp) {
  const w = Math.min(asWave(n), MAX_EXPONENT_WAVE);
  const start = Math.max(2, Math.floor(pos(hp?.hpExpStartRound, 10)));
  const slope = Math.max(0, num(hp?.hpLinearPerRound, 0.5));
  const factor = Math.max(1, num(hp?.hpExpFactor, 1.1));
  const cap = pos(hp?.hpCap, 30);
  const value = w < start ? 1 + slope * (w - 1) : (1 + slope * (start - 2)) * factor ** (w - start + 1);
  return Math.min(cap, value);
}

// Poids (fractions de 1) des quatre allures à la vague n : interpolation linéaire entre points d'ancrage, constants avant le premier
// et après le dernier.
export function gaitWeights(n, anchors) {
  const list = (Array.isArray(anchors) ? anchors : []).filter((a) => a && isNum(a.wave)).sort((a, b) => a.wave - b.wave);
  const w = asWave(n);
  const at = (a) => Object.fromEntries(GAITS.map((g) => [g, Math.max(0, num(a?.[g]))]));
  let raw;
  if (list.length === 0) raw = { lent: 1, marche: 0, rampe: 0, course: 0 };
  else if (w <= list[0].wave) raw = at(list[0]);
  else if (w >= list.at(-1).wave) raw = at(list.at(-1));
  else {
    const hi = list.findIndex((a) => a.wave >= w);
    const a = list[hi - 1];
    const b = list[hi];
    const t = (w - a.wave) / (b.wave - a.wave);
    raw = Object.fromEntries(GAITS.map((g) => [g, num(a[g]) + (num(b[g]) - num(a[g])) * t]));
  }
  const sum = GAITS.reduce((s, g) => s + raw[g], 0);
  return Object.fromEntries(GAITS.map((g) => [g, sum > 0 ? raw[g] / sum : g === 'lent' ? 1 : 0]));
}

// Poids (fractions de 1) des types : un type introduit monte linéairement de 0 vers son plafond en `rampWaves` vagues (sa première
// vague compte pour 1/rampWaves) ; le marcheur prend le reste.
export function typeWeights(n, types) {
  const w = asWave(n);
  const ramp = Math.max(1, pos(types?.rampWaves, 6));
  const weights = { marcheur: 0, petit: 0, voute: 0, grand: 0 };
  let others = 0;
  for (const t of TYPES.slice(1)) {
    const from = Math.max(1, num(types?.[t]?.from, Infinity));
    const cap = Math.min(1, Math.max(0, num(types?.[t]?.cap)));
    weights[t] = w >= from ? cap * Math.min(1, (w - from + 1) / ramp) : 0;
    others += weights[t];
  }
  weights.marcheur = Math.max(0, 1 - others);
  return weights;
}

// Composition entière de la vague : plus fort reste, puis chaque type déjà introduit compte au moins un zombie (si la vague a assez de
// place), pris sur le type le plus nombreux.
function composeTypes(weights, total, types) {
  const counts = apportion(weights, TYPES, total);
  const introduced = TYPES.filter((t) => weights[t] > 0 && (t === 'marcheur' || isNum(types?.[t]?.from)));
  if (total >= introduced.length) {
    for (const t of introduced) {
      if (counts[t] > 0) continue;
      const donor = TYPES.reduce((best, k) => (counts[k] > counts[best] ? k : best), 'marcheur');
      counts[donor] -= 1;
      counts[t] += 1;
    }
  }
  return counts;
}

// Spécification d'une vague. n : entier ≥ 1 (sinon 1, avec un avertissement) ; params : contenu de data/game/waves.json.
export function waveSpec(n, params) {
  const warnings = [];
  const wave = asWave(n);
  if (wave !== n) warnings.push(`vague invalide (${String(n)}) : ramenée à 1`);
  const p = rec(params);
  if (params === null || typeof params !== 'object') warnings.push('paramètres invalides : valeurs de repli');
  const e = Math.min(wave, MAX_EXPONENT_WAVE) - 1;

  const t = rec(p.total);
  const reinforcedEvery = Math.floor(pos(t.reinforcedEvery, 0));
  const reinforced = reinforcedEvery > 0 && wave % reinforcedEvery === 0;
  const raw = (num(t.base, 1) + num(t.linear) * e + num(t.quadratic) * e * e) * (reinforced ? Math.max(1, num(t.reinforcedMul, 1)) : 1);
  const total = Math.max(1, Math.min(Math.floor(pos(t.cap, 150)), Math.round(raw)));

  const c = rec(p.maxConcurrent);
  const maxConcurrent = Math.max(1, Math.min(Math.floor(pos(c.cap, 10)), Math.floor(pos(c.base, 6)) + Math.floor(e / Math.max(1, Math.floor(pos(c.every, 2))))));

  const s = rec(p.spawnInterval);
  const spawnInterval = Math.max(pos(s.min, 0.9), pos(s.base, 2.5) * Math.max(0, num(s.factor, 0.95)) ** e);

  const hpValue = hpMul(wave, rec(p.hp));
  const speedMul = Math.max(1, num(rec(p.speed).factor, 1.02)) ** e;
  const d = rec(p.damage);
  const damageMul = Math.min(pos(d.cap, 3), Math.max(1, num(d.factor, 1.05)) ** e);

  const weights = typeWeights(wave, rec(p.types));
  const gWeights = gaitWeights(wave, p.gaitAnchors);
  const inter = rec(p.intermission);
  return {
    wave,
    level: levelOfWave(wave, p.wavesPerLevel),
    total,
    reinforced,
    maxConcurrent,
    spawnInterval,
    hpMul: hpValue,
    speedMul,
    damageMul,
    typeWeights: weights,
    composition: composeTypes(weights, total, rec(p.types)),
    gaitWeights: gWeights,
    gaitCounts: apportion(gWeights, GAITS, total),
    intermission: wave === 1 ? Math.max(0, num(inter.first, 3)) : Math.max(0, num(inter.between, 8)),
    healFraction: Math.min(1, Math.max(0, num(p.healFraction, 1))),
    warnings,
  };
}

// Mélange d'une liste d'étiquettes dont une (`limited`) ne doit jamais former une série plus longue que maxRun. Les autres sont tirées
// dans un ordre aléatoire ; on choisit l'étiquette limitée avec la probabilité de sa part restante, sauf quand la règle l'impose ou
// l'interdit (le dernier recours, si la règle est impossible à tenir, laisse la série dépasser).
function shuffleLimited(counts, limited, maxRun, rng) {
  let r = rng;
  const pool = [];
  for (const [label, n] of Object.entries(counts)) if (label !== limited) for (let i = 0; i < n; i += 1) pool.push(label);
  for (let i = pool.length - 1; i > 0; i -= 1) {
    const j = nextInt(r, i + 1);
    r = j.rng;
    [pool[i], pool[j.value]] = [pool[j.value], pool[i]];
  }
  let rest = num(counts[limited]);
  const out = [];
  let run = 0;
  while (rest > 0 || pool.length > 0) {
    const canLimited = rest > 0 && run < maxRun;
    const canOther = pool.length > 0 && rest <= maxRun * pool.length;
    let pickLimited;
    if (canLimited && canOther) {
      const d = nextInt(r, rest + pool.length);
      r = d.rng;
      pickLimited = d.value < rest;
    } else if (canLimited) pickLimited = true;
    else if (canOther) pickLimited = false;
    else pickLimited = rest > 0; // règle intenable : on laisse dépasser
    if (pickLimited) {
      out.push(limited);
      rest -= 1;
      run += 1;
    } else {
      out.push(pool.pop());
      run = 0;
    }
  }
  return { list: out, rng: r };
}

// Liste ordonnée des zombies de la vague : [{ type, gait }, …]. Les types et les allures sont mélangés séparément (jamais plus de
// maxGrandRun « grand » ni maxCourseRun « course » d'affilée), puis associés dans l'ordre. Déterministe pour une graine.
export function waveOrder(spec, seed, order = {}) {
  const s = rec(spec);
  const total = Math.max(0, Math.floor(num(s.total)));
  const types = apportion(s.composition, TYPES, total);
  const gaits = apportion(s.gaitCounts, GAITS, total);
  const a = shuffleLimited(types, 'grand', Math.max(1, Math.floor(num(order?.maxGrandRun, 3))), createRng(seed));
  const b = shuffleLimited(gaits, 'course', Math.max(1, Math.floor(num(order?.maxCourseRun, 3))), a.rng);
  return a.list.map((type, i) => ({ type, gait: b.list[i] }));
}
