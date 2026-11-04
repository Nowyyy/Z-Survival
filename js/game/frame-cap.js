// ?cap=N (lot 5b) : EXPÉRIENCE de plafond d'images par seconde, jamais par défaut ni mémorisée ; importé seulement avec ce paramètre. La fréquence de
// l'écran est d'abord estimée sur 30 images (médiane des intervalles de requestAnimationFrame) ; ensuite une image sur `every` est dessinée, every
// étant l'entier le plus proche de fréquence / plafond. Avertissement : si le plafond ne divise pas la fréquence (60 sur un écran de 90 Hz), les
// trames deviennent irrégulières (aligned: false, affiché dans le panneau de ?perf=1). La simulation reçoit le vrai temps écoulé : rien ne change au jeu.
import { capPlan, parseCap, refreshRate } from '../core/perf-stats.js';

const CALIBRATION = 30;

export function createFrameGate(cap) {
  const samples = [];
  let last = null;
  let hz = null;
  let plan = { every: 1, fps: null, aligned: true, active: false };
  let count = 0;
  const gate = (now) => {
    if (hz === null) {
      if (last !== null) samples.push(now - last);
      last = now;
      if (samples.length >= CALIBRATION) {
        hz = refreshRate(samples);
        plan = capPlan(hz, cap);
      }
      return true;
    }
    count += 1;
    return count % plan.every === 0;
  };
  gate.state = () => ({ value: cap, hz, every: plan.every, fps: plan.fps, aligned: plan.aligned, active: plan.active, calibrating: hz === null });
  return gate;
}

// ?cap= lu dans l'adresse : 30, 45 ou 60 donnent un plafond ; 0, absent ou autre valeur : aucun (null).
export function gateFromParam(value) {
  const cap = parseCap(value);
  return cap ? createFrameGate(cap) : null;
}
