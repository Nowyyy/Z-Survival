// Paramètres des sons synthétisés (Web Audio, aucun fichier). Valeurs provisoires à régler à l'oreille.
// type : forme d'onde ou « noise » ; freq : fréquence de départ puis d'arrivée (Hz) ; durées en secondes ; gain de 0 à 1.
const SOUNDS = Object.freeze({
  shoot: Object.freeze({ type: 'square', freqStart: 520, freqEnd: 110, duration: 0.12, attack: 0.002, gain: 0.18 }),
  hit: Object.freeze({ type: 'sawtooth', freqStart: 220, freqEnd: 90, duration: 0.09, attack: 0.002, gain: 0.2 }),
  kill: Object.freeze({ type: 'noise', freqStart: 400, freqEnd: 60, duration: 0.28, attack: 0.004, gain: 0.25 }),
  hurt: Object.freeze({ type: 'triangle', freqStart: 160, freqEnd: 50, duration: 0.22, attack: 0.003, gain: 0.3 }),
});

export const SOUND_NAMES = Object.freeze(Object.keys(SOUNDS));

// Copie des paramètres d'un son, ou null pour un nom inconnu.
export function soundParams(name) {
  return typeof name === 'string' && Object.hasOwn(SOUNDS, name) ? { ...SOUNDS[name] } : null;
}
