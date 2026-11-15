// Formats du HUD intégré (lot 3l, direction B « caméscope ») : fonctions pures, sans DOM, horloge ni hasard. Le temps affiché par le chrono « REC » est le
// temps de jeu (getState().time : somme des pas de simulation, figée en pause, remise à zéro à chaque partie), jamais l'horloge réelle.

const count = (n) => (Number.isFinite(n) && n > 0 ? Math.floor(n) : 0);

// Nombre sur deux chiffres au moins (« 07 », « 40 », « 123 ») : vague et restants. Entrée invalide ou négative : « 00 ».
export function pad2(n) {
  return String(count(n)).padStart(2, '0');
}

// Tués : sans zéros devant (« 57 », retour du propriétaire) ; entrée invalide ou négative : « 0 ».
export function killsText(n) {
  return String(count(n));
}

// Chrono : « mm:ss » sous une heure, « h:mm:ss » au-delà ; secondes entières (tronquées). Entrée invalide ou négative : « 00:00 ».
export function formatChrono(seconds) {
  const total = count(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = String(m).padStart(2, '0');
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

// Valeur de la vague : { n: « 07 », max } quand le monde a un nombre de manches (et que la vague ne le dépasse pas), sinon { n: « 07 », max: null }.
export function waveParts(wave, maxWave) {
  const max = Number.isInteger(maxWave) && maxWave > 0 && count(wave) <= maxWave ? maxWave : null;
  return { n: pad2(wave), max };
}

// État à terre (E2-10) pour la vue : mode « terre » (compte à rebours de downDuration s), « grace » (protection de graceTime s) ou null ; secondes
// affichées (arrondies au supérieur) et remplissage de la barre (secondes affichées / durée, entre 0 et 1).
export function downView(down, dead, options) {
  const params = options !== null && typeof options === 'object' ? options : {};
  const duration = Number.isFinite(params.downDuration) && params.downDuration > 0 ? params.downDuration : 5;
  const graceTime = Number.isFinite(params.graceTime) && params.graceTime > 0 ? params.graceTime : 2;
  const grounded = down?.state === 'terre';
  const guarded = !grounded && down?.state === 'debout' && Number(down?.grace) > 0 && !dead;
  if (!grounded && !guarded) return { mode: null, seconds: 0, ratio: 0 };
  const left = grounded ? Number(down.timeLeft) : Number(down.grace);
  const seconds = Number.isFinite(left) && left > 0 ? Math.ceil(left - 1e-6) : 0;
  const ratio = Math.min(1, Math.max(0, seconds / (grounded ? duration : graceTime)));
  return { mode: grounded ? 'terre' : 'grace', seconds, ratio };
}
