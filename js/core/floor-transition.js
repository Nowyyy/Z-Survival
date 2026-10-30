// Fondu entre étages (lot 3e) : machine à états pure. idle -> out (le voile monte de 0 à 1 en fadeOut s) -> swap (instantané : l'étage change, une seule fois)
// -> in (le voile redescend de 1 à 0 en fadeIn s) -> idle. Pendant la transition le joueur est verrouillé (immobile, sans tir, invulnérable). Sous
// prefers-reduced-motion : aucun voile, échange immédiat, verrou de fadeLockReduced s. Pur : le temps (dt, borné à 0,05 s ; 0 en pause) et les durées arrivent en
// argument, aucun argument n'est modifié (gelés acceptés), aucune exception, aucune horloge, déterministe.
import { DEFAULT_FLOOR, isFloorId } from './floors.js';
import { clampDt, isNum, num } from './vec.js';

export const PHASES = Object.freeze(['idle', 'out', 'in', 'lock']);
const EPS = 1e-9;
const isObject = (o) => o !== null && typeof o === 'object' && !Array.isArray(o);

const durations = (options) => ({
  fadeOut: isNum(options?.fadeOut) && options.fadeOut > 0 ? options.fadeOut : 0.25,
  fadeIn: isNum(options?.fadeIn) && options.fadeIn > 0 ? options.fadeIn : 0.25,
  lock: isNum(options?.fadeLockReduced) && options.fadeLockReduced >= 0 ? options.fadeLockReduced : 0.2,
});

export const createTransition = () => ({ phase: 'idle', t: 0, from: DEFAULT_FLOOR, to: DEFAULT_FLOOR, stair: null, swapped: false, reduced: false });

const sane = (s) => ({
  phase: isObject(s) && PHASES.includes(s.phase) ? s.phase : 'idle',
  t: Math.max(0, num(s?.t)),
  from: isFloorId(s?.from) ? s.from : DEFAULT_FLOOR,
  to: isFloorId(s?.to) ? s.to : DEFAULT_FLOOR,
  stair: typeof s?.stair === 'string' ? s.stair : null,
  swapped: s?.swapped === true,
  reduced: s?.reduced === true,
});

// Vue au repos.
const REST = Object.freeze({ veil: 0, locked: false, swap: false, phase: 'idle', t: 0, from: DEFAULT_FLOOR, to: DEFAULT_FLOOR, stair: null });

const view = (s, veil, swap) => ({ veil, locked: s.phase !== 'idle', swap, phase: s.phase, t: s.t, from: s.from, to: s.to, stair: s.stair });

// Une transition en cours n'est jamais remplacée (le joueur est verrouillé) ; départ et arrivée identiques ou inconnus : rien ne démarre.
// options.reduced : mouvement réduit (aucun voile, échange à la première image).
export function startTransition(state, fromFloor, toFloor, stair, options) {
  const s = sane(state);
  if (s.phase !== 'idle') return s;
  if (!isFloorId(fromFloor) || !isFloorId(toFloor) || fromFloor === toFloor) return s;
  const reduced = options?.reduced === true;
  return { phase: reduced ? 'lock' : 'out', t: 0, from: fromFloor, to: toFloor, stair: typeof stair === 'string' ? stair : null, swapped: false, reduced };
}

// Avance la transition. Renvoie { state, view: { veil, locked, swap, phase, t, from, to, stair } } ; swap est vrai exactement une fois par transition, à l'image où
// le voile atteint 1 (c'est là que le jeu change l'étage du joueur et le replace). dt à 0 : vue figée (la pause).
export function stepTransition(state, dt, options) {
  let s = sane(state);
  const d = durations(options);
  if (s.phase === 'idle') return { state: s, view: { ...REST } };
  const step = clampDt(dt);
  let swap = false;
  if (s.phase === 'lock') {
    // Mouvement réduit : échange à la première image, puis simple verrou.
    if (!s.swapped) {
      swap = true;
      s = { ...s, swapped: true };
    }
    s = { ...s, t: s.t + step };
    if (s.t + EPS >= d.lock) {
      s = { ...createTransition() };
      return { state: s, view: { ...REST, swap } };
    }
    return { state: s, view: view(s, 0, swap) };
  }
  if (s.phase === 'out') {
    const t = s.t + step;
    if (t + EPS >= d.fadeOut) {
      // Le voile est plein : échange, puis le surplus de temps sert à redescendre.
      swap = true;
      s = { ...s, phase: 'in', t: Math.max(0, t - d.fadeOut), swapped: true };
      if (s.t + EPS >= d.fadeIn) return { state: createTransition(), view: { ...REST, swap } };
      return { state: s, view: view(s, 1, swap) };
    }
    s = { ...s, t };
    return { state: s, view: view(s, Math.min(1, s.t / d.fadeOut), false) };
  }
  // in
  const t = s.t + step;
  if (t + EPS >= d.fadeIn) return { state: createTransition(), view: { ...REST } };
  s = { ...s, t };
  return { state: s, view: view(s, Math.max(0, 1 - s.t / d.fadeIn), false) };
}

// Interrompt la transition (mort, Rejouer) : retour au repos immédiat, sans échange.
export const cancelTransition = () => createTransition();

// Vue d'une transition sans l'avancer (pause, lecture).
export function transitionView(state, options) {
  const s = sane(state);
  const d = durations(options);
  if (s.phase === 'idle') return { ...REST };
  if (s.phase === 'out') return view(s, Math.min(1, s.t / d.fadeOut), false);
  if (s.phase === 'in') return view(s, Math.max(0, 1 - s.t / d.fadeIn), false);
  return view(s, 0, false);
}

// Durée totale de la transition en secondes.
export const transitionDuration = (options) => {
  const d = durations(options);
  return options?.reduced === true ? d.lock : d.fadeOut + d.fadeIn;
};
