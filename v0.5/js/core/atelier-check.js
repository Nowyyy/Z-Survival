// Contrôle des cibles de l'atelier des sons (lot 3h), pur : mesures d'un tampon (audio-analysis.js) comparées à la cible de son
// emplacement (data/game/sounds-atelier.json). Aucun dépassement n'est caché : chaque critère est rendu avec sa valeur et ses bornes.
// Niveau relatif au tir (dB) = niveau court du tampon + gain de la catégorie du jeu (gainDb) − niveau court du tir (levelRef.dbfs).
import { describe, earlyBand, onsets } from './audio-analysis.js';
import { isNum } from './vec.js';

const isObj = (o) => o !== null && typeof o === 'object' && !Array.isArray(o);
const range = (r) => Array.isArray(r) && r.length === 2 && isNum(r[0]) && isNum(r[1]);
export const DEFAULT_LEVEL_TOLERANCE = 3;

// Mesures d'un tampon pour un emplacement : describe() + niveau relatif au tir, attaque en ms, pointe métallique, nombre de coups.
export function measureSound(samples, sampleRate, slot = null, levelRef = null) {
  const voice = slot?.group === 'voix' || isObj(slot?.target) && range(slot.target.f0);
  const d = describe(samples, sampleRate, voice ? { minHz: 40, maxHz: 400 } : {});
  const refDb = isNum(levelRef?.dbfs) ? levelRef.dbfs : 0;
  const gain = isNum(slot?.gainDb) ? slot.gainDb : 0;
  const tip = earlyBand(samples, sampleRate, 2000, 5000, 0.04);
  return { ...d, attackMs: d.attack * 1000, levelRel: d.levelDb + gain - refDb, tipEarly: tip.early, tipShare: tip.share, hits: onsets(samples, sampleRate, { threshold: 0.3, minGap: 0.15 }).length };
}

// Critères d'une cible : [{ key, value, min, max, ok }] (min ou max null : borne absente) ; ok global.
export function checkTargets(m, target, tolerance = DEFAULT_LEVEL_TOLERANCE) {
  const items = [];
  if (!isObj(m) || !isObj(target)) return { ok: true, items };
  const add = (key, value, min, max) => {
    const v = isNum(value) ? value : NaN;
    const ok = Number.isFinite(v) && (min === null || v >= min) && (max === null || v <= max);
    items.push({ key, value: Number.isFinite(v) ? v : null, min, max, ok });
  };
  if (range(target.duration)) add('duration', m.duration, target.duration[0], target.duration[1]);
  if (range(target.centroid)) add('centroid', m.centroid, target.centroid[0], target.centroid[1]);
  if (range(target.peakHz)) add('peakHz', m.peakHz, target.peakHz[0], target.peakHz[1]);
  if (range(target.f0)) add('f0', m.f0, target.f0[0], target.f0[1]);
  if (isNum(target.hf4k)) add('hf4k', m.hf4k, null, target.hf4k);
  if (range(target.hnr)) add('hnr', m.hnr, target.hnr[0], target.hnr[1]);
  if (range(target.attackMs)) add('attackMs', m.attackMs, target.attackMs[0], target.attackMs[1]);
  if (isNum(target.level)) {
    const tol = isNum(target.levelTol) ? target.levelTol : (isNum(tolerance) ? tolerance : DEFAULT_LEVEL_TOLERANCE);
    add('level', m.levelRel, target.level - tol, target.level + tol);
  }
  if (range(target.tipBand)) {
    add('tipEarly', m.tipEarly, 0.8, null);
    add('tipShare', m.tipShare, 0.03, null);
  }
  if (range(target.hits)) add('hits', m.hits, target.hits[0], target.hits[1]);
  add('peakDb', m.peakDb, null, -3 + 1e-6);
  return { ok: items.every((i) => i.ok), items };
}
