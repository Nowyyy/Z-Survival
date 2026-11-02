// Emplacements résolus de l'atelier des sons (data/game/sounds-atelier.json) : chargés seulement avec ?sons=A|B|C, par import dynamique
// depuis sound-loader.js, pour jouer une même variante partout avec les réglages par défaut de l'atelier.
import { resolveAtelier } from '../core/synth2.js';

let promise = null;
export function loadAtelierSlots() {
  promise ??= fetch('data/game/sounds-atelier.json').then((r) => {
    if (!r.ok) throw new Error(`sounds-atelier.json : ${r.status}`);
    return r.json();
  }).then((d) => new Map(resolveAtelier(d).slots.map((s) => [s.id, s])));
  return promise;
}
