// Retour du propriétaire après le lot 8j : à la fin de chaque manche, sous le compteur de vague (colonne centrale du HUD), la gemme bleue puis « solde
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

// Texte du bloc (après la gemme) : modèle « {solde} (+{gain}) » de data/i18n/fr.json.
export const texteBleuManche = (modele, solde, gain) => fmt(modele, { solde: formatMoney(solde), gain: formatMoney(gain) });

export function createBleuManche(dict, reglages, apres = document.getElementById('hud-wave')) {
  const { duree } = reglagesBleuManche(reglages);
  const el = document.createElement('p');
  el.id = 'hud-bleu-manche';
  el.className = 'hud-block hud-bleu-manche';
  el.setAttribute('aria-hidden', 'true');
  el.hidden = true;
  // Retour du propriétaire : seulement le logo de la monnaie bleue (la gemme de l'en-tête du menu et du « +N » bleu), puis les montants.
  const NS = 'http://www.w3.org/2000/svg';
  const gemme = document.createElementNS(NS, 'svg');
  gemme.setAttribute('class', 'hud-icon hud-gem');
  gemme.setAttribute('viewBox', '0 0 16 16');
  gemme.setAttribute('aria-hidden', 'true');
  gemme.setAttribute('focusable', 'false');
  for (const d of ['M8 1.6 14 6.4 8 14.4 2 6.4Z', 'M2 6.4h12M5.6 6.4 8 14.4l2.4-8']) {
    const p = document.createElementNS(NS, 'path');
    p.setAttribute('d', d);
    gemme.append(p);
  }
  const texte = document.createElement('span');
  el.append(gemme, texte);
  apres?.after(el);
  const modele = dict['game.hud.bleuManche'] ?? 'game.hud.bleuManche';
  let jusqua = -Infinity;
  return {
    // Fin de manche : solde bleu (gain compris) et gain de la manche ; now : temps de jeu.
    montrer(solde, gain, now) {
      texte.textContent = texteBleuManche(modele, solde, gain);
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
