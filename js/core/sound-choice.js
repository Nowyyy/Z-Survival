// Sons de l'atelier intégrés au jeu (lot 3i), pur : mode de ?sons=, recette de rendu d'une entrée « atelier » de data/game/sounds.json,
// nom des tampons (graines, durée de réparation), poids et mémoire estimée du pack. Aucun Web Audio, DOM, réseau, stockage ni horloge.
// Rendu : js/core/sound-render.js (renderVariant de synth2.js : Float32 mono, 22 050 Hz, crête ≤ −3 dBFS) ; version k = graine k (1 à seeds).
// Ce module n'importe pas synth2.js : le fil principal du jeu ne charge pas le moteur de l'atelier (seul le calculateur d'arrière-plan le fait).
import { isNum } from './vec.js';

export const SOUND_MODES = Object.freeze(['choix', 'ancien', 'A', 'B', 'C']);
export const DEFAULT_MODE = 'choix';
export const ATELIER_ENGINE = 'atelier';

const isObj = (o) => o !== null && typeof o === 'object' && !Array.isArray(o);

// Mode lu dans la chaîne de requête (« ?sons=B » ou objet URLSearchParams) : une valeur inconnue, vide, multiple ou hostile donne le
// défaut, sans erreur. Jamais mémorisé.
export function parseSoundMode(search) {
  let value;
  try {
    const params = typeof search === 'string' ? new URLSearchParams(search) : search;
    const all = typeof params?.getAll === 'function' ? params.getAll('sons') : [];
    value = all.length === 1 ? all[0] : null;
  } catch {
    value = null;
  }
  return typeof value === 'string' && SOUND_MODES.includes(value) ? value : DEFAULT_MODE;
}

export const isAtelier = (recipe) => isObj(recipe) && recipe.engine === ATELIER_ENGINE && isObj(recipe.atelier) && isObj(recipe.atelier.slot);

// Nombre de versions d'une entrée atelier (graines), au moins 1.
export const seedCount = (recipe) => Math.max(1, Math.floor(isNum(recipe?.variants) ? recipe.variants : 1));

// Durée de réparation arrondie au centième de seconde (clé du cache des tampons à durée variable).
export const roundDuration = (sec) => Math.round(Math.max(0, isNum(sec) ? sec : 0) * 100) / 100;

// Une entrée dont la macro « durée » est en secondes peut être rendue à une autre durée (réparation : 0,4 à 1,8 s). Bornes de la variante
// retenue (mêmes règles que macroSpec de synth2.js : min, max ≥ min, unité).
export function durationRange(recipe) {
  if (!isAtelier(recipe)) return null;
  const variant = recipe.atelier.slot.variants?.find((v) => v?.id === recipe.atelier.variant);
  const own = variant?.macros?.duree;
  if (!isObj(own) || own.unit !== 's') return null;
  const min = isNum(own.min) ? own.min : 0.6;
  return { min, max: Math.max(min, isNum(own.max) ? own.max : 1.6) };
}

// Nom du tampon : « id-k » (k dès 1) ; à une durée différente de celle de l'entrée (réparation), « id@cs-k » (cs : centièmes de seconde).
export function bufferName(id, version, durationSec = null, recipe = null) {
  const k = Math.max(1, Math.floor(isNum(version) ? version : 1));
  if (!isNum(durationSec) || !recipe) return `${id}-${k}`;
  const range = durationRange(recipe);
  if (!range) return `${id}-${k}`;
  const d = roundDuration(Math.min(range.max, Math.max(range.min, durationSec)));
  if (Math.abs(d - roundDuration(recipe.duration)) < 0.005) return `${id}-${k}`;
  return `${id}@${Math.round(d * 100)}-${k}`;
}

// Spécification de rendu d'une entrée atelier : { slot, variant, macros, seed } pour renderVariant.
// mode : 'choix' (variante et réglages retenus) ou 'A' | 'B' | 'C' (cette variante avec les réglages par défaut de l'atelier, d'après les
// emplacements résolus `slots` ; un emplacement sans cette variante garde le choix) ; durationSec : durée imposée (macro en secondes).
export function renderSpec(recipe, { mode = DEFAULT_MODE, slots = null, seed = 1, durationSec = null } = {}) {
  if (!isAtelier(recipe)) return null;
  const a = recipe.atelier;
  let slot = a.slot;
  let variant = a.variant;
  let macros = { ...(isObj(a.macros) ? a.macros : {}) };
  if (mode === 'A' || mode === 'B' || mode === 'C') {
    const full = slots instanceof Map ? slots.get(slot.id) : (Array.isArray(slots) ? slots.find((s) => s?.id === slot.id) : null);
    if (full && full.variants?.some((v) => v?.id === mode)) {
      slot = full;
      variant = mode;
      macros = {};
    }
  }
  if (isNum(durationSec)) {
    const range = durationRange(recipe);
    if (range) macros = { ...macros, duree: roundDuration(Math.min(range.max, Math.max(range.min, durationSec))) };
  }
  return { slot, variant, macros, seed: Math.max(1, Math.floor(isNum(seed) ? seed : 1)) };
}

// Poids et mémoire d'un ensemble de tampons [{ samples, channels? }] : octets des tampons calculés (Float32, 4 octets par échantillon)
// et mémoire estimée une fois décodés en tampons audio du navigateur (échantillons × 4 octets × canaux ; le jeu est mono). Aucun plafond : mesure seule.
export function packStats(items) {
  let buffers = 0;
  let samples = 0;
  let bytes = 0;
  let decoded = 0;
  for (const it of Array.isArray(items) ? items : []) {
    const n = it?.samples?.length ?? 0;
    const channels = isNum(it?.channels) && it.channels >= 1 ? Math.floor(it.channels) : 1;
    buffers += 1;
    samples += n;
    bytes += n * 4;
    decoded += n * 4 * channels;
  }
  return { buffers, samples, bytes, decodedBytes: decoded };
}

// Table des choix (data/game/sounds-choix.json) contrôlée contre l'atelier résolu : liste des problèmes (vide si tout va bien).
export function checkChoices(table, slots) {
  const problems = [];
  const byId = slots instanceof Map ? slots : new Map((Array.isArray(slots) ? slots : []).map((s) => [s.id, s]));
  const seen = new Set();
  for (const c of Array.isArray(table?.choix) ? table.choix : []) {
    if (seen.has(c?.id)) problems.push(`${c?.id} : en double`);
    seen.add(c?.id);
    const slot = byId.get(c?.slot);
    if (!slot) problems.push(`${c?.id} : emplacement ${c?.slot} absent de l'atelier`);
    else if (!slot.variants?.some((v) => v?.id === c.variant)) problems.push(`${c.id} : variante ${c.variant} absente de ${c.slot}`);
    if (!isNum(c?.seeds) || c.seeds < 1 || Math.floor(c.seeds) !== c.seeds) problems.push(`${c?.id} : nombre de graines invalide`);
  }
  return problems;
}
