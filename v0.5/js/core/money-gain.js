// « +N » du HUD (lot 4) : agrège les gains des gainWindowMs dernières millisecondes en un seul texte, mis à jour au plus toutes les gainThrottleMs, qui
// s'efface ensuite. Pur : le temps (millisecondes d'horloge de jeu ou d'affichage) arrive en argument, les arguments ne sont jamais modifiés.
// events : [{ at (ms), amount (entier > 0) }]. Renvoie { visible, amount, text, shownAt, animate }. previous : la vue précédente (pour la limitation).
import { isNum } from './vec.js';
import { formatMoney } from './economy.js';

const isObject = (o) => o !== null && typeof o === 'object' && !Array.isArray(o);
const windowMs = (params) => (isNum(params?.gainWindowMs) && params.gainWindowMs > 0 ? params.gainWindowMs : 0);
const throttleMs = (params) => (isNum(params?.gainThrottleMs) && params.gainThrottleMs > 0 ? params.gainThrottleMs : 0);

export const emptyGainView = () => ({ visible: false, amount: 0, text: '', shownAt: -Infinity, animate: false });

// Événements encore dans la fenêtre (les autres sont oubliés) : nouveau tableau.
export function pruneGains(events, now, params) {
  if (!Array.isArray(events) || !isNum(now)) return [];
  const w = windowMs(params);
  return events.filter((e) => isObject(e) && isNum(e.at) && Number.isInteger(e.amount) && e.amount > 0 && e.at <= now && now - e.at < w);
}

// Somme des gains de la fenêtre. reducedMotion : le texte apparaît et disparaît sans animation (animate faux).
export function moneyGainView(events, now, params, previous = null, options = {}) {
  const animate = options?.reducedMotion !== true;
  const prev = isObject(previous) && isNum(previous.shownAt) ? previous : null;
  // Limitation : tant que la dernière mise à jour date de moins de gainThrottleMs, on garde le texte affiché (la fenêtre peut tout de même l'effacer).
  const live = pruneGains(events, now, params);
  const amount = live.reduce((sum, e) => sum + e.amount, 0);
  if (amount === 0) return { visible: false, amount: 0, text: '', shownAt: prev?.visible ? prev.shownAt : -Infinity, animate };
  if (prev && prev.visible && isNum(now) && now - prev.shownAt < throttleMs(params) && now >= prev.shownAt) return { ...prev, animate };
  return { visible: true, amount, text: `+${formatMoney(amount)}`, shownAt: now, animate };
}
