// Retour du propriétaire après le lot 8j : à la fin de chaque manche, sous le compteur de vague (colonne centrale du HUD), « Monnaie bleue : solde
// (+gain) » pendant quelques secondes de jeu (data/game/reglages-partie.json → bleuManche.duree ; figé en pause comme le temps de jeu). Bloc du HUD
// créé une fois (même aspect que les autres, couleur de la monnaie bleue) ; décoratif pour les lecteurs d'écran (aria-hidden) : l'annonce de fin
// de manche dit déjà le bonus. Lecture seule : le solde et le gain viennent de la banque (js/game/bank.js), rien n'est écrit.
import { formatMoney } from '../core/economy.js';
import { fmt } from './texts.js';

export const BLEU_MANCHE_DEFAUT = Object.freeze({ duree: 4 });

// Durée lue dans les réglages (secondes de jeu, 1 à 15) ; invalide : 4.
export function reglagesBleuManche(json) {
  const d = json?.duree;
  return { duree: typeof d === 'number' && Number.isFinite(d) && d >= 1 && d <= 15 ? d : BLEU_MANCHE_DEFAUT.duree };
}

// Texte du bloc : modèle « … {solde} … {gain} … » de data/i18n/fr.json.
export const texteBleuManche = (modele, solde, gain) => fmt(modele, { solde: formatMoney(solde), gain: formatMoney(gain) });

export function createBleuManche(dict, reglages, apres = document.getElementById('hud-wave')) {
  const { duree } = reglagesBleuManche(reglages);
  const el = document.createElement('p');
  el.id = 'hud-bleu-manche';
  el.className = 'hud-block hud-bleu-manche';
  el.setAttribute('aria-hidden', 'true');
  el.hidden = true;
  apres?.after(el);
  const modele = dict['game.hud.bleuManche'] ?? 'game.hud.bleuManche';
  let jusqua = -Infinity;
  return {
    // Fin de manche : solde bleu (gain compris) et gain de la manche ; now : temps de jeu.
    montrer(solde, gain, now) {
      el.textContent = texteBleuManche(modele, solde, gain);
      el.hidden = false;
      jusqua = now + duree;
    },
    // À chaque image : masqué après la durée, à la mort ou à la fin de la partie (actif faux).
    update(now, actif = true) {
      if (!el.hidden && (!actif || now >= jusqua)) el.hidden = true;
    },
    get element() {
      return el;
    },
  };
}
