// Lot 9a (monnaies interverties, Docs/ref/economie.md) : la fin de manche montre désormais la MÉDAILLE (bronze) avec le solde du champ « bleu »
// (gagné aux manches : « médailles » à l'écran) ; les gains des portes, milliers, paliers, premier monde et jour (champ « medailles », « diamants » à
// l'écran) montrent la GEMME bleue. Seuls l'icône et la couleur des deux blocs changent de place ; montants, durée et positions inchangés.
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
  el.classList.add('hud-manche-medaille'); // lot 9a : couleur des médailles (css/game-ui.css)
  el.setAttribute('aria-hidden', 'true');
  el.hidden = true;
  // Retour du propriétaire : seulement le logo de la monnaie, puis les montants. Lot 9a : la médaille (avant : la gemme bleue).
  const texte = document.createElement('span');
  el.append(iconeMedaille(), texte);
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

// Lot 8k : médailles gagnées en partie (porte ouverte, millier de zombies, palier, monde, partie du jour), affichées COMME la fin de manche :
// médaille (dessinée en code, couleur des médailles) puis « solde (+gain) » pendant la même durée de jeu, dans un bloc à part juste sous celui de la
// monnaie bleue (les deux s'empilent sans se chevaucher s'ils arrivent ensemble) ; deux gains rapprochés s'additionnent. Aucune animation (donc
// rien à couper en mouvement réduit) ; décoratif pour les lecteurs d'écran (le solde est dans la pause et l'écran de fin). Lecture seule.
export const MEDAILLE_D = Object.freeze(['M5.4 1.6 8 6.4l2.6-4.8', 'M8 6.4a3.9 3.9 0 1 0 0 7.8 3.9 3.9 0 0 0 0-7.8Z', 'M8 8.7v3.2']);
// Lot 9a : gemme bleue (diamants), même dessin que l'en-tête du menu et la pause (jeu.html).
export const GEMME_D = Object.freeze(['M8 1.6 14 6.4 8 14.4 2 6.4Z', 'M2 6.4h12M5.6 6.4 8 14.4l2.4-8']);
function icone(chemins, classe) {
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('class', classe);
  svg.setAttribute('viewBox', '0 0 16 16');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  for (const d of chemins) {
    const p = document.createElementNS(NS, 'path');
    p.setAttribute('d', d);
    svg.append(p);
  }
  return svg;
}
export const iconeMedaille = (classe = 'hud-icon hud-medaille') => icone(MEDAILLE_D, classe);
export const iconeGemme = (classe = 'hud-icon hud-gem') => icone(GEMME_D, classe);

export function createMedaillesManche(dict, reglages, apres) {
  const { duree } = reglagesBleuManche(reglages);
  const el = document.createElement('p');
  el.id = 'hud-medailles-manche';
  el.className = 'hud-block hud-bleu-manche hud-medailles-manche'; // lot 9a : couleur des diamants (css/game-ui.css)
  el.setAttribute('aria-hidden', 'true');
  el.hidden = true;
  const texte = document.createElement('span');
  el.append(iconeGemme(), texte); // lot 9a : gemme bleue (avant : médaille)
  apres?.after(el);
  const modele = dict['game.hud.bleuManche'] ?? 'game.hud.bleuManche';
  let vu = 0; // numéro du dernier gain affiché (js/game/bank.js, gainMedailles)
  let cumul = 0;
  let jusqua = -Infinity;
  return {
    // À chaque image : gain { n, gain } de la banque, solde de médailles, temps de jeu ; actif faux (mort, fin) : masqué.
    update(now, gain, solde, actif = true) {
      if (gain && gain.n !== vu) {
        vu = gain.n;
        cumul = now < jusqua ? cumul + gain.gain : gain.gain;
        if (actif) {
          texte.textContent = texteBleuManche(modele, solde, cumul);
          el.hidden = false;
          jusqua = now + duree;
        }
      }
      if (!el.hidden && (!actif || now >= jusqua)) el.hidden = true;
    },
    get element() {
      return el;
    },
  };
}
