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
  const base = paletteColor(token, lookup) ?? [128, 128, 128];
  const tinted = shade(base, num(r.tint));
  const w = obj(r.wear);
  const crasse = paletteColor(obj(r.palette).crasse, lookup) ?? tinted;
  let c = mix(tinted, crasse, part?.skin ? num(w.dirt) * 0.5 : num(w.dirt));
  if (averageTears && part?.cloth) {
    const torn = paletteColor(obj(r.palette).dechirure, lookup) ?? c;
    c = mix(c, torn, num(w.tears));
  }
  return c;
}

// Lot 9g : couleur (0 à 255) d'une entrée de palette : jeton (« --perso-… ») lu par lookup, ou couleur dérivée de deux jetons existants
// { jeton, vers (jeton, facultatif), part (0 à 1 : part de `vers`), ombre (-1 à 1 : assombrit ou éclaircit) } : aucune couleur en dur,
// aucun jeton nouveau. Entrée invalide ou jeton inconnu : null.
const TOKEN = /^--[a-z0-9-]{1,40}$/;
export function paletteColor(entry, lookup) {
  if (typeof lookup !== 'function') return null;
  if (typeof entry === 'string') return lookup(entry) ?? null;
  const e = obj(entry);
  if (!TOKEN.test(e.jeton ?? '')) return null;
  const a = lookup(e.jeton);
  if (!a) return null;
  const b = TOKEN.test(e.vers ?? '') ? lookup(e.vers) : null;
  const m = b ? mix(a, b, clamp(num(e.part), 0, 1)) : a;
  return shade(m, clamp(num(e.ombre), -1, 1));
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

// --- Lot 9g : variantes d'époque (apparence seulement) ----------------------------------------------------------------------------------
// Une variante d'époque = variante d'origine du type (riche : niveau « complet » ; A : niveau « simple ») dont on garde tout ce qui règle le
// gabarit et l'animation (squelette, joints, scale, posture, style, sole, contacts, shadow, anchors, macros), plus une recette de
// data/game/persos-epoque.json : palette (jetons ou couleurs nommées dérivées de jetons), pièces de base modifiées ou retirées, tenues
// (palette et groupes de pièces portées, pièces de base retirées ou modifiées pour une tenue). Pur : arguments jamais modifiés.
export const NIVEAUX_EPOQUE = ['complet', 'simple'];
export const SUFFIXE_SIMPLE = '-simple';
const GARDES = ['kind', 'skeleton', 'style', 'scale', 'sole', 'joints', 'posture', 'contacts', 'shadow', 'anchors', 'macros'];
// Pièce de référence (variante riche du marcheur) de chaque ancrage : les pièces portées suivent la taille de la pièce du type.
const SUIT = {
  head: { part: 'head', ref: { rx: 4.6, ry: 5, rz: 4.8 }, k: (d, r) => [d.rx / r.rx, d.ry / r.ry, d.rz / r.rz] },
  chest: { part: 'chest', ref: { sx: 1.85, sz: 1 }, k: (d, r) => [num(d.sx, 1) / r.sx, 1, num(d.sz, 1) / r.sz] },
  belly: { part: 'belly', ref: { sx: 1.55, sz: 0.92 }, k: (d, r) => [num(d.sx, 1) / r.sx, 1, num(d.sz, 1) / r.sz] },
  thigh: { part: 'thighL', ref: { r: 3.3 }, k: (d, r) => [d.r / r.r, 1, d.r / r.r] },
  shin: { part: 'shinL', ref: { r: 2.7 }, k: (d, r) => [d.r / r.r, 1, d.r / r.r] },
  upper: { part: 'upperL', ref: { r: 2.5 }, k: (d, r) => [d.r / r.r, 1, d.r / r.r] },
  fore: { part: 'foreL', ref: { r: 2.1 }, k: (d, r) => [d.r / r.r, 1, d.r / r.r] },
};
const r3 = (v) => Math.round(v * 1000) / 1000;
function scaleDims(kind, d, [kx, ky, kz]) {
  const o = { ...d };
  const m = (key, k) => { if (isNum(o[key])) o[key] = r3(o[key] * k); };
  if (kind === 'box' || kind === 'wedge') { m('w', kx); m('h', ky); m('d', kz); }
  else if (kind === 'sphere') { m('rx', kx); m('ry', ky); m('rz', kz); }
  else if (kind === 'taper') { m('r0', kx); m('r1', kx); m('h', ky); if (isNum(o.sz) || kz !== kx) o.sz = r3(num(o.sz, 1) * (kz / kx)); }
  else if (kind === 'capsule') { m('r', kx); m('h', ky); if (isNum(o.sz) || kz !== kx) o.sz = r3(num(o.sz, 1) * (kz / kx)); }
  else if (kind === 'quad') { m('w', kx); m('h', ky); }
  return o;
}
// Tessellation du niveau simple (celle des variantes A).
function simplerDims(kind, d) {
  const o = { ...d };
  if (kind === 'capsule') { o.radial = Math.min(num(o.radial, 8), 6); o.caps = 1; }
  if (kind === 'sphere') { o.w = Math.min(num(o.w, 8), 6); o.h = Math.min(num(o.h, 6), 4); }
  if (kind === 'taper') o.sides = Math.min(num(o.sides, 6), 6);
  return o;
}
const merge = (part, modif) => {
  const m = obj(modif);
  return { ...part, ...m, dims: { ...obj(part.dims), ...obj(m.dims) } };
};
// Entrée de palette d'une recette : nom de couleur dérivée (couleurs) ou jeton.
const colorOf = (couleurs, v) => (typeof v === 'string' && !v.startsWith('--') && couleurs[v] ? { ...couleurs[v] } : v);

// slot : emplacement de characters-v2.json ; recette : une entrée de persos-epoque.json → variantes ; data : { couleurs, pieces } ;
// niveau : 'complet' | 'simple'. Renvoie la variante (id de la recette ; niveau simple : id + SUFFIXE_SIMPLE), ou null.
export function buildEpochVariant(slot, recette, data, niveau = 'complet') {
  const s = obj(slot);
  const r = obj(recette);
  const d = obj(data);
  const variants = Array.isArray(s.variants) ? s.variants : [];
  const simple = niveau === 'simple';
  const base = variants.find((v) => v.id === (simple ? 'A' : 'riche')) ?? variants.find((v) => v.id === 'A');
  if (!base || typeof r.id !== 'string') return null;
  const couleurs = obj(d.couleurs);
  const pieces = obj(d.pieces);
  const tenues = Array.isArray(r.tenues) && r.tenues.length ? r.tenues : [{ id: 'unique', label: 'unique' }];
  const all = tenues.map((_, i) => i);
  const baseOf = Object.fromEntries((base.parts ?? []).map((p) => [p.id, p]));
  const lvl = (p) => (simple ? { ...p, dims: simplerDims(p.kind, obj(p.dims)) } : p);
  const out = [];
  // retireSimple : pièces d'origine retirées au niveau simple seulement (cou caché, lambeaux) pour tenir le budget de la variante A.
  const retire = new Set([...(Array.isArray(obj(r.base).retire) ? r.base.retire : []), ...(simple && Array.isArray(obj(r.base).retireSimple) ? r.base.retireSimple : [])]);
  const modifs = obj(obj(r.base).modifs);
  for (const p of base.parts ?? []) {
    if (retire.has(p.id)) continue;
    let part = modifs[p.id] ? merge(p, modifs[p.id]) : p;
    if (simple && modifs[p.id]?.dims) part = lvl(part);
    // Tenues qui retirent ou modifient cette pièce : copies par groupe de tenues.
    const groups = new Map();
    const gone = [];
    tenues.forEach((t, i) => {
      if (Array.isArray(t.retire) && t.retire.includes(p.id)) gone.push(i);
      else if (obj(t.modifs)[p.id]) {
        const key = JSON.stringify(t.modifs[p.id]);
        groups.set(key, [...(groups.get(key) ?? []), i]);
      }
    });
    const special = new Set([...gone, ...[...groups.values()].flat()]);
    const keep = all.filter((i) => !special.has(i) && (!Array.isArray(p.outfits) || p.outfits.includes(i)));
    if (keep.length) out.push(keep.length === all.length && !Array.isArray(p.outfits) ? part : { ...part, outfits: keep });
    for (const [key, idx] of groups) out.push({ ...(simple ? lvl(merge(part, JSON.parse(key))) : merge(part, JSON.parse(key))), outfits: idx });
  }
  // Pièces portées : groupes nommés, ancrés sur une pièce du type (taille suivie), tenues qui les portent.
  const use = new Map();
  const porte = (name, i) => use.set(name, [...(use.get(name) ?? []), i]);
  (Array.isArray(r.pieces) ? r.pieces : []).forEach((n) => all.forEach((i) => porte(n, i)));
  tenues.forEach((t, i) => (Array.isArray(t.pieces) ? t.pieces : []).forEach((n) => porte(n, i)));
  for (const [name, idx] of use) {
    const g = obj(pieces[name]);
    const sv = SUIT[g.suit];
    const ref = sv ? baseOf[sv.part] : null;
    const k = sv && ref ? sv.k(obj(ref.dims), sv.ref) : [1, 1, 1];
    const pick = [...new Set(idx)].sort((a, b) => a - b);
    for (const raw of Array.isArray(g.parts) ? g.parts : []) {
      if (simple && raw.simple === false) continue;
      const p = Object.fromEntries(Object.entries(raw).filter(([key]) => key !== 'simple'));
      const dims = scaleDims(p.kind, obj(p.dims), k);
      const offset = Array.isArray(p.offset) ? p.offset.map((v, j) => r3(v * k[j])) : [0, 0, 0];
      const part = { rotation: [0, 0, 0], ...p, id: `${p.id}`, dims: simple ? simplerDims(p.kind, dims) : dims, offset, widen: p.widen ?? false };
      out.push(pick.length === all.length ? part : { ...part, outfits: pick });
    }
  }
  const palette = { ...obj(base.palette), ...Object.fromEntries(Object.entries(obj(r.palette)).map(([key, v]) => [key, colorOf(couleurs, v)])) };
  const outfits = tenues.map((t) => ({ id: String(t.id), label: String(t.label ?? t.id), palette: Object.fromEntries(Object.entries(obj(t.palette)).map(([key, v]) => [key, colorOf(couleurs, v)])) }));
  const kept = Object.fromEntries(GARDES.filter((key) => base[key] !== undefined).map((key) => [key, base[key]]));
  return {
    id: simple ? `${r.id}${SUFFIXE_SIMPLE}` : r.id,
    label: `${String(r.label ?? r.id)}${simple ? ' (simple)' : ''}`,
    intent: String(r.intent ?? ''),
    ...kept,
    parts: out,
    palette,
    outfits,
    epoque: true,
    niveau: simple ? 'simple' : 'complet',
    base: base.id,
    flags: simple ? { epoque: true } : { outOfBudget: true, epoque: true },
  };
}

// Emplacements avec leurs variantes d'époque ajoutées (les deux niveaux) : characters-v2.json → slots, persos-epoque.json. Arguments intacts.
export function slotsWithEpoch(slots, epoque) {
  const e = obj(epoque);
  const list = Array.isArray(e.variantes) ? e.variantes : [];
  return (Array.isArray(slots) ? slots : []).map((s) => {
    const extra = list.filter((r) => r?.slot === s.id).flatMap((r) => NIVEAUX_EPOQUE.map((n) => buildEpochVariant(s, r, e, n))).filter(Boolean);
    return extra.length ? { ...s, variants: [...s.variants, ...extra] } : s;
  });
}

// Fichier de choix (data/game/persos-epoque-choix.json) : { choix: { cle: id | [ids] } } ; cle : personnage du menu (survivant, personnage-2)
// ou type de zombie ; slotOf(cle) : emplacement (joueur pour les personnages). Liste (retour du propriétaire, lot 9g : zombies A et B
// mélangés) : ids valides gardés dans l'ordre, sans doublon ; liste réduite à un id : cet id. Id inconnu, liste vide, absent ou fichier
// invalide : défaut (premier id d'époque de l'emplacement pour la clé, sinon null). Renvoie { cle: id | [ids] }.
export function lireChoixEpoque(json, epoque, cles, slotOf = (c) => c) {
  const choix = obj(obj(json).choix);
  const list = Array.isArray(obj(epoque).variantes) ? epoque.variantes : [];
  return Object.fromEntries((Array.isArray(cles) ? cles : []).map((cle) => {
    const ids = list.filter((r) => r?.slot === slotOf(cle) && (!Array.isArray(r.pour) || r.pour.includes(cle))).map((r) => r.id);
    const v = choix[cle];
    const pick = (Array.isArray(v) ? v : [v]).filter((x, i, a) => typeof x === 'string' && ids.includes(x) && a.indexOf(x) === i);
    if (pick.length === 0) return [cle, ids[0] ?? null];
    return [cle, Array.isArray(v) && pick.length > 1 ? pick : pick[0]];
  }));
}

// Lot 9g (partie C) : mélange de variantes d'époque d'un même emplacement (zombies A et B) en une seule variante dont les tenues sont celles
// de chaque variante à la suite (palette de la variante comprise dans chaque tenue) : le kit tire une tenue à chaque apparition parmi toutes,
// jamais deux fois la même à la suite ; une seule texture et une seule fusion par tenue. Les variantes doivent partager leur variante d'origine
// (même niveau) : sinon, la première seule. Pièces identiques regroupées (tenues réunies).
export const SEPARATEUR_MELANGE = '+';
export function melangeEpoque(variants, id = null) {
  const list = (Array.isArray(variants) ? variants : []).filter((v) => v && Array.isArray(v.parts));
  if (list.length === 0) return null;
  const same = list.filter((v) => v.base === list[0].base && v.niveau === list[0].niveau);
  if (same.length === 1) return same[0];
  const parts = [];
  const index = new Map();
  const outfits = [];
  let offset = 0;
  for (const v of same) {
    const n = Math.max(1, v.outfits.length);
    const all = Array.from({ length: n }, (_, i) => i);
    for (const p of v.parts) {
      const { outfits: own, ...rest } = p;
      const key = JSON.stringify(rest);
      const idx = (Array.isArray(own) ? own : all).map((i) => i + offset);
      if (index.has(key)) index.get(key).outfits.push(...idx);
      else {
        const entry = { ...rest, outfits: idx };
        index.set(key, entry);
        parts.push(entry);
      }
    }
    v.outfits.forEach((o) => outfits.push({ id: `${v.id}:${o.id}`, label: `${v.label} — ${o.label}`, palette: { ...obj(v.palette), ...obj(o.palette) } }));
    offset += n;
  }
  const total = outfits.length;
  const cleaned = parts.map((p) => (p.outfits.length === total ? Object.fromEntries(Object.entries(p).filter(([k]) => k !== 'outfits')) : p));
  return { ...same[0], id: id ?? same.map((v) => v.id).join(SEPARATEUR_MELANGE), label: same.map((v) => v.label).join(' + '), intent: same.map((v) => v.intent).join(' / '), parts: cleaned, palette: { ...obj(same[0].palette) }, outfits, melange: same.map((v) => v.id) };
}

// Lot 9g (partie C) : variantes d'époque retenues pour la partie. table : data/game/persos-choix.json (variante « epoque » : celle de
// data/game/persos-epoque-choix.json) ; perso : ?perso= effectif (« choix » : niveau complet ; « A » : préréglages Moyen et Faible, niveau simple ;
// B, C, riche : variante actuelle pour comparer, rien n'est changé) ; slots : variantes lues dans la table ou l'adresse ; personnage : personnage
// joué (menu, sauvegarde ; inconnu : survivant). Renvoie { slots (emplacement → id de variante), characters (emplacements avec les variantes
// d'époque et les mélanges), tenuesJoueur ([id] ou null) }. Données absentes ou invalides : les variantes actuelles, sans exception.
export const PERSONNAGES_EPOQUE = ['survivant', 'personnage-2'];
export function resoudreEpoque({ characters, epoque, choixJson, table, perso, slots, personnage } = {}) {
  const c = obj(characters);
  const sl = { ...obj(slots) };
  const persos = obj(obj(table).persos);
  const level = perso === 'choix' ? 'complet' : perso === 'A' ? 'simple' : null;
  const wanted = Object.keys(sl).filter((s) => obj(persos[s]).variante === 'epoque');
  if (!epoque || !Array.isArray(c.slots) || wanted.length === 0) return { slots: Object.fromEntries(Object.entries(sl).map(([k, v]) => [k, v === 'epoque' ? 'A' : v])), characters: c, tenuesJoueur: null };
  const qui = PERSONNAGES_EPOQUE.includes(personnage) ? personnage : 'survivant';
  const keyOf = (s) => (s === 'joueur' ? qui : s);
  const choix = lireChoixEpoque(choixJson, epoque, wanted.map(keyOf), (k) => (PERSONNAGES_EPOQUE.includes(k) ? 'joueur' : k));
  const merged = slotsWithEpoch(c.slots, epoque);
  const suffix = level === 'simple' ? SUFFIXE_SIMPLE : '';
  const out = merged.map((s) => {
    if (!wanted.includes(s.id) || level === null) return s;
    const ids = [choix[keyOf(s.id)]].flat().filter(Boolean).map((x) => `${x}${suffix}`);
    if (ids.length < 2) return s;
    const mix = melangeEpoque(ids.map((x) => s.variants.find((v) => v.id === x)));
    return mix ? { ...s, variants: [...s.variants, mix] } : s;
  });
  for (const s of Object.keys(sl)) {
    if (sl[s] === 'epoque') sl[s] = 'A';
    if (!wanted.includes(s) || level === null) continue;
    const ids = [choix[keyOf(s)]].flat().filter(Boolean).map((x) => `${x}${suffix}`);
    if (ids.length) sl[s] = ids.length > 1 ? ids.join(SEPARATEUR_MELANGE) : ids[0];
  }
  const tenue = obj(obj(choixJson).tenues)[qui];
  return { slots: sl, characters: { ...c, slots: out }, tenuesJoueur: level !== null && wanted.includes('joueur') && typeof tenue === 'string' ? [tenue] : null };
}
