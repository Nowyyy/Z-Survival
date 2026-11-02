// Variantes des personnages du lot 3j : application des macros (taille, carrure, usure, teinte, posture), choix de la tenue (par graine,
// jamais deux fois la même à la suite), palier d'usure selon la manche, couleur d'une pièce, et format texte de « Mes choix ».
// Pur : aucune horloge, aucun hasard hors de la graine (rng.js), aucun DOM ; arguments jamais modifiés, aucune exception.
import { mix, shade } from './color.js';
import { createRng, nextInt } from './rng.js';
import { isNum } from './vec.js';

const num = (v, d = 0) => (isNum(v) ? v : d);
const obj = (v) => (v !== null && typeof v === 'object' && !Array.isArray(v) ? v : {});
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
export const MACRO_IDS = ['taille', 'carrure', 'usure', 'teinte', 'posture'];
export const ANIM_MACROS = ['amplitude', 'rythme', 'lourdeur'];

// Valeur d'un curseur bornée à [min, max] de sa définition, entière ; absente : son défaut.
export function macroValue(def, value) {
  const d = obj(def);
  const lo = num(d.min, -2);
  const hi = num(d.max, 2);
  return clamp(Math.round(num(value, num(d.default, 0))), lo, hi);
}

// Palier d'usure (0 à 3) d'une manche : premier palier dont max ≥ manche (wearByWave : [{ max, tier }]) ; au-delà, le dernier.
export function wearTier(wave, wearByWave) {
  const list = Array.isArray(wearByWave) ? wearByWave : [];
  const w = Math.max(1, Math.floor(num(wave, 1)));
  const found = list.find((x) => w <= num(x?.max, Infinity));
  return clamp(Math.floor(num((found ?? list.at(-1))?.tier, 0)), 0, 3);
}

// Tenue tirée de la graine parmi `count`, différente de `last` (indice de la précédente, ou null). Renvoie { index, rng }.
export function pickOutfit(rng, count, last = null) {
  const n = Math.max(1, Math.floor(num(count, 1)));
  if (n === 1) return { index: 0, rng: rng ?? createRng(1) };
  const prev = Number.isInteger(last) && last >= 0 && last < n ? last : null;
  const r = nextInt(rng ?? createRng(1), prev === null ? n : n - 1);
  const index = prev === null || r.value < prev ? r.value : r.value + 1;
  return { index, rng: r.rng };
}

// Variante concrète : macros appliquées, tenue et palier d'usure choisis. options : { macros: { taille, ... }, outfit (indice),
// wear (palier 0 à 3), wearTiers (data : paliers { dirt, tears }) }.
export function resolveVariant(variant, options = {}) {
  const v = obj(variant);
  const o = obj(options);
  const defs = obj(v.macros);
  const m = Object.fromEntries(MACRO_IDS.map((id) => [id, macroValue(defs[id], obj(o.macros)[id])]));
  const step = (id) => num(obj(defs[id]).step, 0);
  const outfits = Array.isArray(v.outfits) ? v.outfits : [];
  const outfit = outfits.length ? clamp(Math.floor(num(o.outfit, 0)), 0, outfits.length - 1) : 0;
  const widen = 1 + m.carrure * step('carrure');
  const parts = (Array.isArray(v.parts) ? v.parts : [])
    .filter((p) => !Array.isArray(p.outfits) || p.outfits.includes(outfit))
    .map((p) => (p.widen === false || p.kind === 'quad' ? p : { ...p, dims: widenDims(p, widen), offset: Array.isArray(p.offset) ? [p.offset[0] * (p.widenOffset === false ? 1 : widen), p.offset[1], p.offset[2]] : p.offset }));
  const joints = { ...obj(v.joints) };
  for (const id of ['shoulderL', 'shoulderR', 'hipL', 'hipR']) {
    const base = joints[id] ?? obj(v.baseJoints)[id];
    if (Array.isArray(base)) joints[id] = [base[0] * widen, base[1], base[2]];
  }
  const posture = { ...obj(v.posture) };
  const pk = m.posture * step('posture');
  const sp = Array.isArray(posture.spine) ? posture.spine : [0, 0, 0];
  posture.spine = [sp[0] + pk, sp[1], sp[2]];
  const tiers = Array.isArray(o.wearTiers) ? o.wearTiers : [];
  const tier = clamp(Math.floor(num(o.wear, 0)) + m.usure, 0, 3);
  const palette = { ...obj(v.palette), ...obj(outfits[outfit]?.palette) };
  return {
    ...v,
    scale: num(v.scale, 1) * (1 + m.taille * step('taille')),
    parts,
    joints,
    posture,
    palette,
    outfit,
    macroValues: m,
    tint: m.teinte * step('teinte'),
    wear: { tier, ...obj(tiers[tier]) },
  };
}

function widenDims(p, k) {
  const d = obj(p.dims);
  if (p.kind === 'box' || p.kind === 'wedge') return { ...d, w: num(d.w, 1) * k };
  if (p.kind === 'sphere') return { ...d, rx: num(d.rx, 1) * k };
  if (p.kind === 'capsule' || p.kind === 'taper') return { ...d, sx: num(d.sx, 1) * k };
  return d;
}

// Couleur (0 à 255) d'une pièce : jeton de sa clé de palette (lookup : jeton -> [r, g, b]), teinte (éclaircit ou assombrit), salissure de
// l'usure (mélange avec la crasse) ; tears : part de déchirures (mélange moyen, pour les mesures).
export function partRgb(part, resolved, lookup, { averageTears = false } = {}) {
  const r = obj(resolved);
  const token = obj(r.palette)[part?.palette];
  const base = (typeof lookup === 'function' ? lookup(token) : null) ?? [128, 128, 128];
  const tinted = shade(base, num(r.tint));
  const w = obj(r.wear);
  const crasse = (typeof lookup === 'function' ? lookup(obj(r.palette).crasse) : null) ?? tinted;
  let c = mix(tinted, crasse, part?.skin ? num(w.dirt) * 0.5 : num(w.dirt));
  if (averageTears && part?.cloth) {
    const torn = (typeof lookup === 'function' ? lookup(obj(r.palette).dechirure) : null) ?? c;
    c = mix(c, torn, num(w.tears));
  }
  return c;
}

// « Mes choix » : une ligne par personnage, `cle=valeur` séparés par « ; », plus une ligne `sang=…`. Entrées hostiles : ignorées.
const KEY = /^[a-z]{1,16}$/;
const VALUE = /^[A-Za-z0-9+\-_.]{1,24}$/;
export function formatChoices(list, extra = {}) {
  const lines = [];
  for (const item of Array.isArray(list) ? list : []) {
    const pairs = Object.entries(obj(item)).filter(([k, v]) => KEY.test(k) && VALUE.test(String(v))).map(([k, v]) => `${k}=${fmtValue(v)}`);
    if (pairs.length) lines.push(pairs.join(';'));
  }
  for (const [k, v] of Object.entries(obj(extra))) if (KEY.test(k) && VALUE.test(String(v))) lines.push(`${k}=${fmtValue(v)}`);
  return lines.join('\n');
}
const fmtValue = (v) => (isNum(v) && v > 0 ? `+${v}` : String(v));

export function parseChoices(text) {
  const out = { persos: [], extra: {} };
  if (typeof text !== 'string') return out;
  for (const raw of text.slice(0, 4000).split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const entry = {};
    for (const pair of line.split(';')) {
      const [k, v, ...rest] = pair.split('=');
      if (rest.length || !KEY.test(k ?? '') || !VALUE.test(v ?? '')) continue;
      entry[k] = /^[+-]?\d+$/.test(v) ? Number(v) : v;
    }
    if (entry.perso !== undefined) out.persos.push(entry);
    else Object.assign(out.extra, entry);
  }
  return out;
}
