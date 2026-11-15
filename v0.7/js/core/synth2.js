// Moteur de synthèse du lot 3h (atelier des sons), pur et déterministe : mêmes entrées, mêmes échantillons. Aucun Web Audio, aucune
// horloge, aucun hasard natif. N'importe rien de js/core/synth.js (le moteur du jeu reste intact).
//
// render(recette, paramètres, graine, fréquence) -> Float32Array mono : générateur de la famille (synth2-sources.js), réverbération
// courte (« ampleur »), retrait du décalage continu, normalisation (niveau court cible et crête plafonnée à −3 dBFS), fondus aux deux
// bouts (premier et dernier échantillon nuls), jamais de NaN ni de valeur au-delà de ±0,98, longueur = durée × fréquence (arrondie).
// renderVariant(emplacement, variante, macros, graine) : applique les macros (hauteur, matière, grain, durée, ampleur) de la variante.
// resolveAtelier(données) : fusionne les préréglages (champ use) et les facteurs (champ scale) en recettes complètes.
import { arr, clamp, createRandom, dbToGain, fadeEdges, hashSeed, loopCrossfade, num, removeDc, shortReverb, softClip, toFloat32 } from './synth2-dsp.js';
import { KINDS, repairSequence } from './synth2-sources.js';
import { shortLevel } from './audio-analysis.js';
import { isNum } from './vec.js';

export { repairSequence };

// Format du jeu : nombres flottants 32 bits, mono, 4 octets par échantillon (js/game/sound-loader.js) ; 22 050 Hz est la fréquence des
// sons du jeu à refaire (voix, pas de zombie, planches, chute), 44 100 Hz celle du tir, des impacts et des pas du joueur actuels.
export const FORMAT = Object.freeze({ sampleRate: 22050, channels: 1, type: 'Float32', bytesPerSample: 4 });
export const MAX_SECONDS = 15;
export const CEILING = 0.98;
export const PEAK_DB = -3;
export const MACRO_IDS = Object.freeze(['hauteur', 'matiere', 'grain', 'duree', 'ampleur']);
export const DEFAULT_MACROS = Object.freeze({
  hauteur: Object.freeze({ min: -6, max: 6, default: 0, unit: 'demi-ton' }),
  matiere: Object.freeze({ min: -1, max: 1, default: 0, unit: 'octave' }),
  grain: Object.freeze({ min: 0, max: 2, default: 1, unit: 'x' }),
  duree: Object.freeze({ min: 0.6, max: 1.6, default: 1, unit: 'x' }),
  ampleur: Object.freeze({ min: 0, max: 0.6, default: 0.15, unit: 'mix' }),
});

const isObj = (o) => o !== null && typeof o === 'object' && !Array.isArray(o);
const rateOf = (sr) => (isNum(sr) && sr >= 8000 && sr <= 96000 ? Math.round(sr) : FORMAT.sampleRate);

// Bornes d'une macro d'une variante (données), sinon celles par défaut ; min ≤ défaut ≤ max garantis.
export function macroSpec(variant, id) {
  const base = DEFAULT_MACROS[id] ?? { min: 0, max: 1, default: 0, unit: 'x' };
  const own = isObj(variant?.macros?.[id]) ? variant.macros[id] : {};
  const min = num(own.min, base.min);
  const max = Math.max(min, num(own.max, base.max));
  return { min, max, default: clamp(num(own.default, base.default), min, max), unit: typeof own.unit === 'string' ? own.unit : base.unit };
}

// Valeurs des macros : celles demandées, bornées ; une valeur absente ou non finie prend la valeur par défaut. Nouvel objet.
export function macroValues(variant, macros = {}) {
  const out = {};
  for (const id of MACRO_IDS) {
    const s = macroSpec(variant, id);
    const v = isObj(macros) ? macros[id] : undefined;
    out[id] = isNum(v) ? clamp(v, s.min, s.max) : s.default;
  }
  return out;
}

// Facteurs du rendu d'après les macros : hauteur en demi-tons -> pitch = 2^(h/12) ; matière en octaves -> bright = 2^m ; grain (facteur
// du bruit et de la rugosité) ; durée (facteur, ou secondes si l'unité est « s ») ; ampleur (part de réverbération courte).
export function macroParams(variant, macros = {}) {
  const v = macroValues(variant, macros);
  const seconds = macroSpec(variant, 'duree').unit === 's';
  return { pitch: 2 ** (v.hauteur / 12), bright: 2 ** v.matiere, grain: v.grain, room: v.ampleur, ...(seconds ? { durSec: v.duree } : { durMul: v.duree }) };
}

// Durée (s) d'une recette avec ses paramètres.
export function renderDuration(recipe, params = {}) {
  const base = clamp(num(recipe?.dur, 0.5), 0.02, MAX_SECONDS);
  if (isNum(params?.durSec)) return clamp(params.durSec, 0.02, MAX_SECONDS);
  return clamp(base * clamp(num(params?.durMul, 1), 0.1, 10), 0.02, MAX_SECONDS);
}

// Retrait de la moyenne par une fenêtre de Hann (les bouts restent nuls).
function zeroMean(x) {
  const n = x.length;
  if (n < 3) return x;
  let s = 0;
  let w = 0;
  for (let i = 0; i < n; i += 1) {
    s += x[i];
    w += 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (n - 1));
  }
  const c = s / w;
  for (let i = 0; i < n; i += 1) x[i] -= c * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (n - 1)));
  return x;
}

// Point de bouclage : indice k (rotation) qui minimise le saut |x[k] − x[k − 1]| (tampon circulaire), parmi ceux dont l'énergie des
// `w` échantillons de chaque côté est équilibrée à ±5 % ; à défaut, le meilleur équilibre. Nouveau tableau.
export function rotateToSeam(buf, w) {
  const x = arr(buf);
  const n = x.length;
  if (n < 8) return x;
  const win = Math.max(1, Math.min(Math.floor(n / 4), Math.round(num(w, 1))));
  const sq = new Float64Array(2 * n + 1);
  for (let i = 0; i < 2 * n; i += 1) sq[i + 1] = sq[i] + x[i % n] * x[i % n];
  // énergie des win échantillons qui précèdent k (circulaire) et des win qui le suivent (k inclus)
  const before = (k) => sq[k + n] - sq[k + n - win];
  const after = (k) => sq[k + n + win] - sq[k + n];
  let best = 0;
  let bestStep = Infinity;
  let fallback = 0;
  let fallbackGap = Infinity;
  for (let k = 0; k < n; k += 1) {
    const b = before(k);
    const a = after(k);
    const gap = Math.abs(Math.sqrt(b) - Math.sqrt(a)) / Math.max(1e-12, Math.sqrt(Math.max(a, b)));
    const step = Math.abs(x[k] - x[(k - 1 + n) % n]);
    if (gap <= 0.05 && step < bestStep) {
      bestStep = step;
      best = k;
    }
    if (gap < fallbackGap) {
      fallbackGap = gap;
      fallback = k;
    }
  }
  const k = bestStep < Infinity ? best : fallback;
  const out = new Float64Array(n);
  for (let i = 0; i < n; i += 1) out[i] = x[(i + k) % n];
  return out;
}

// Rendu d'une recette. params : { pitch, bright, grain, room, durMul | durSec, levelDb (niveau court cible, dBFS), peakDb (plafond, −3) }.
export function render(recipe, params = {}, seed = 1, sampleRate = FORMAT.sampleRate) {
  const sr = rateOf(sampleRate);
  const r = isObj(recipe) ? recipe : {};
  const p = isObj(params) ? params : {};
  const dur = renderDuration(r, p);
  const n = Math.max(1, Math.round(dur * sr));
  const kind = typeof r.kind === 'string' && Object.hasOwn(KINDS, r.kind) ? KINDS[r.kind] : null;
  if (!kind) return new Float32Array(n);
  const loop = r.loop === true;
  const overlap = loop ? Math.min(Math.floor(n / 2), Math.round(clamp(num(r.loopOverlap, 0.5), 0.05, 4) * sr)) : 0;
  const s = isNum(seed) ? Math.trunc(seed) : 1;
  const rnd = createRandom(hashSeed('version', s, r.kind));
  const ctx = {
    n: n + overlap, sr, seed: hashSeed('graine', s, r.kind) & 0xffffff, rnd,
    pitch: clamp(num(p.pitch, 1), 0.25, 4), bright: clamp(num(p.bright, 1), 0.25, 4), grain: clamp(num(p.grain, 1), 0, 3),
    tm: isNum(p.durSec) ? 1 : dur / clamp(num(r.dur, 0.5), 0.02, MAX_SECONDS), dur, vary: 1 + clamp(num(r.vary, 0.04), 0, 0.2) * rnd.signed(),
  };
  let x = arr(kind(r, ctx));
  if (x.length !== ctx.n) {
    const y = new Float64Array(ctx.n);
    y.set(x.subarray(0, Math.min(x.length, ctx.n)));
    x = y;
  }
  const post = isObj(r.post) ? r.post : {};
  const room = clamp(num(p.room, num(r.room, 0)), 0, 1);
  if (room > 0) x = shortReverb(x, sr, { time: num(post.roomTime, 0.08), mix: room, damping: num(post.roomDamping, 0.45) });
  if (num(post.drive) > 0) {
    let pk = 0;
    for (let i = 0; i < x.length; i += 1) pk = Math.max(pk, Math.abs(x[i]));
    if (pk > 1e-12) for (let i = 0; i < x.length; i += 1) x[i] /= pk;
    x = softClip(x, num(post.drive));
  }
  x = removeDc(x, sr, 20);
  if (loop) x = loopCrossfade(x, n, overlap);
  let pk = 0;
  for (let i = 0; i < x.length; i += 1) pk = Math.max(pk, Math.abs(x[i]));
  if (pk <= 1e-12) return new Float32Array(n);
  const cap = Math.min(0.97, dbToGain(clamp(num(p.peakDb, num(post.peakDb, PEAK_DB)), -60, -0.2) - 0.02)); // marge d'arrondi Float32
  let k = cap / pk;
  const levelDb = isNum(p.levelDb) ? p.levelDb : post.levelDb;
  if (isNum(levelDb)) {
    const lvl = shortLevel(x, sr);
    if (lvl > 1e-12) k = Math.min(k, dbToGain(clamp(levelDb, -80, 0)) / lvl);
  }
  for (let i = 0; i < x.length; i += 1) x[i] *= k;
  if (loop) {
    // Boucle : pas de fondu (la jonction fin -> début est continue par le fondu enchaîné) ; moyenne retirée uniformément ; puis le
    // point de bouclage est déplacé (rotation du tampon circulaire) là où le saut entre échantillons voisins est le plus petit et
    // où l'énergie des 50 ms de chaque côté est équilibrée.
    let m = 0;
    for (let i = 0; i < x.length; i += 1) m += x[i];
    m /= x.length;
    for (let i = 0; i < x.length; i += 1) x[i] -= m;
    x = rotateToSeam(x, Math.round(0.05 * sr));
  } else {
    x = fadeEdges(x, sr, num(post.fadeIn, 0.001), num(post.fadeOut, 0.012));
    x = zeroMean(x);
  }
  return toFloat32(x, CEILING);
}

// Variante d'un emplacement (objet, ou identifiant « A », « B »…) ; null si absente.
export function findVariant(slot, variant) {
  const list = Array.isArray(slot?.variants) ? slot.variants : [];
  if (isObj(variant)) return variant;
  return list.find((v) => v?.id === variant) ?? null;
}

// Rendu d'une variante d'un emplacement résolu (resolveAtelier) avec ses macros et une graine (version). Renvoie
// { samples, sampleRate, duration, slot, variant, seed, macros, params, bytes } ; une variante inconnue donne un tampon vide.
export function renderVariant(slot, variant, macros = {}, seed = 1) {
  const v = findVariant(slot, variant);
  const sr = rateOf(slot?.sampleRate);
  const values = macroValues(v, macros);
  if (!v || !isObj(v.recipe)) return { samples: new Float32Array(0), sampleRate: sr, duration: 0, slot: slot?.id ?? '', variant: typeof variant === 'string' ? variant : '', seed, macros: values, params: {}, bytes: 0 };
  const params = { ...macroParams(v, values), ...(isNum(slot?.bufferLevelDb) ? { levelDb: slot.bufferLevelDb } : {}) };
  const samples = render(v.recipe, params, hashSeed(slot?.id ?? '', v.id ?? '', isNum(seed) ? Math.trunc(seed) : 1), sr);
  return { samples, sampleRate: sr, duration: samples.length / sr, slot: slot?.id ?? '', variant: v.id ?? '', seed, macros: values, params, bytes: samples.length * FORMAT.bytesPerSample };
}

// ---------- résolution des données ----------

// Fusion profonde : objets fusionnés récursivement, tableaux et valeurs remplacés ; nouveaux objets.
export function deepMerge(a, b) {
  if (!isObj(a)) return isObj(b) ? deepMerge({}, b) : (Array.isArray(b) ? b.map((v) => (isObj(v) ? deepMerge({}, v) : v)) : b);
  const out = { ...a };
  if (!isObj(b)) return out;
  for (const [k, v] of Object.entries(b)) out[k] = isObj(v) && isObj(out[k]) ? deepMerge(out[k], v) : (isObj(v) ? deepMerge({}, v) : (Array.isArray(v) ? v.map((x) => (isObj(x) ? deepMerge({}, x) : x)) : v));
  return out;
}

const getPath = (o, path) => String(path).split('.').reduce((acc, k) => (isObj(acc) ? acc[k] : undefined), o);
function setScaled(o, path, k) {
  const keys = String(path).split('.');
  let cur = o;
  for (let i = 0; i < keys.length - 1; i += 1) {
    if (!isObj(cur[keys[i]])) return;
    cur[keys[i]] = { ...cur[keys[i]] };
    cur = cur[keys[i]];
  }
  const last = keys[keys.length - 1];
  if (isNum(cur[last])) cur[last] *= k;
}

// Recette complète : préréglages de `use` (chemins dans presets, dans l'ordre), puis les champs propres ; les facteurs `scale`
// ({ chemin: facteur }) de toute la chaîne se multiplient et s'appliquent à la fin. Les préréglages peuvent eux-mêmes utiliser `use`.
export function resolveRecipe(recipe, presets = {}, depth = 0) {
  if (!isObj(recipe)) return {};
  let merged = {};
  const scales = [];
  for (const path of Array.isArray(recipe.use) ? recipe.use : []) {
    const pre = getPath(presets, path);
    if (!isObj(pre) || depth > 6) continue;
    const r = resolveRecipe({ ...pre, scale: undefined }, presets, depth + 1);
    merged = deepMerge(merged, r);
    if (isObj(pre.scale)) scales.push(pre.scale);
  }
  const rest = { ...recipe };
  delete rest.use;
  delete rest.scale;
  const own = recipe.scale;
  merged = deepMerge(merged, rest);
  if (isObj(own)) scales.push(own);
  for (const sc of scales) for (const [path, k] of Object.entries(sc)) if (isNum(k)) setScaled(merged, path, k);
  delete merged.scale;
  delete merged.use;
  // Sous-recettes (par exemple le coup de marteau d'une réparation, le pas d'un relevage) : leur propre `use` est résolu aussi.
  for (const [k, v] of Object.entries(merged)) {
    if (isObj(v) && Array.isArray(v.use) && depth < 6) merged[k] = resolveRecipe(v, presets, depth + 1);
    // Couches (parts d'une recette composée) : chaque élément peut aussi utiliser des préréglages.
    else if (Array.isArray(v) && depth < 6) merged[k] = v.map((x) => (isObj(x) && Array.isArray(x.use) ? resolveRecipe(x, presets, depth + 1) : x));
  }
  return merged;
}

// Données de l'atelier résolues : chaque variante porte sa recette complète, chaque emplacement sa cible et le niveau court de ses
// tampons (dBFS) = niveau de référence (tir) + niveau cible relatif − gain de la catégorie du jeu (gainDb). Nouveaux objets.
export function resolveAtelier(data) {
  const d = isObj(data) ? data : {};
  const sr = rateOf(d.sampleRate);
  const presets = isObj(d.presets) ? d.presets : {};
  const refDb = num(d.levelRef?.dbfs, -4.5);
  const slots = (Array.isArray(d.slots) ? d.slots : []).filter((s) => isObj(s) && typeof s.id === 'string').map((s) => {
    const target = isObj(d.targets?.[s.id]) ? d.targets[s.id] : null;
    const bufferLevelDb = target && isNum(target.level) ? refDb + target.level - num(s.gainDb) : undefined;
    return {
      ...s,
      sampleRate: sr,
      target,
      ...(bufferLevelDb === undefined ? {} : { bufferLevelDb }),
      variants: (Array.isArray(s.variants) ? s.variants : []).filter(isObj).map((v) => ({ ...v, recipe: resolveRecipe(v.recipe, presets) })),
    };
  });
  return { sampleRate: sr, levelRef: d.levelRef ?? null, slots, references: Array.isArray(d.references) ? d.references : [], scenes: Array.isArray(d.scenes) ? d.scenes : [] };
}

// ---------- versions sans répétition ----------

export const VERSIONS = 5;

// Version suivante (1 à count) jamais égale à la précédente (« round-robin » à mémoire) : state = { rng, last: { clé: version } }.
// Renvoie { state, version } sans modifier l'argument.
export function nextVersion(state, key, count = VERSIONS) {
  const n = isNum(count) && count >= 1 ? Math.floor(count) : VERSIONS;
  const s = isObj(state) ? state : {};
  const last = isObj(s.last) ? { ...s.last } : {};
  const k = typeof key === 'string' ? key : String(key);
  let seed = isNum(s.rng) ? s.rng >>> 0 : 1;
  seed = (Math.imul(seed ^ (seed >>> 15), 0x2c1b3c6d) + 0x6d2b79f5) >>> 0;
  const draw = createRandom(seed).next();
  const prev = last[k];
  let version;
  if (n === 1) version = 1;
  else if (isNum(prev) && prev >= 1 && prev <= n) {
    const r = Math.min(n - 2, Math.floor(draw * (n - 1)));
    version = r + 1 >= prev ? r + 2 : r + 1;
  } else version = Math.min(n, Math.floor(draw * n) + 1);
  last[k] = version;
  return { state: { rng: seed, last }, version };
}
