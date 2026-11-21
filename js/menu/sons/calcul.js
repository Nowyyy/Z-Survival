// Lot 8i : calculateur d'arrière-plan des sons du menu : un rendu de js/menu/sons/synthese.js ne se découpe pas en tranches ; ici il ne fige
// jamais le menu ni une ouverture. Message { id, son (objet de data/menu/sons.json), variante, version } -> { id, ok, samples, sampleRate, ms }
// (tampon transféré, sans copie).
import { besoinJeu, rendreSon } from './synthese.js';

// Lot 9i : moteur de la partie (js/core/synth.js) chargé seulement pour un son qui le demande (tir du Garand des ouvertures).
let jeu = null;
self.onmessage = async (event) => {
  const msg = event.data ?? {};
  try {
    const outils = besoinJeu(msg.son, msg.variante) ? { rendreJeu: (await (jeu ??= import('../../core/synth.js'))).renderSound } : {};
    const t0 = performance.now();
    const r = rendreSon(msg.son, msg.variante, msg.version ?? 1, undefined, outils);
    self.postMessage({ id: msg.id, ok: true, samples: r.samples, sampleRate: r.sampleRate, ms: performance.now() - t0 }, [r.samples.buffer]);
  } catch (error) {
    self.postMessage({ id: msg.id, ok: false, error: String(error?.message ?? error) });
  }
};
