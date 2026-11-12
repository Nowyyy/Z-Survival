// Lot 8g : écran d'introduction E0 (Docs/ref/menu-principal.md, « Lot 8g ») : au vrai lancement en mode menu, fond noir et logo animé de No Way Studio
// au centre (assets/studio/, fourni par le propriétaire : seule image importée du jeu), pendant la durée de son animation, puis fondu vers l'écran
// de chargement E7, construit dessous, qui a chargé le menu pendant ce temps. Chargé par demarrage.js seulement quand l'introduction se joue
// (introAuDemarrage, js/core/graphics.js : jamais en partie directe, ni au retour d'une partie, ni sous ?test=1 sans ?intro=1).
// - Un appui (n'importe où) ou une touche passe l'introduction ; « Toucher pour passer » (bouton, 44 px) apparaît au bout d'une seconde.
// - prefers-reduced-motion : copie fixe du logo (son état final) pendant 1 s, sans fondu.
// - Annoncée aux lecteurs d'écran (« No Way Studio » : nom de l'image et zone d'annonce). Animations « e0-* » (css/menu.css).
import { loadDict } from '../game/texts.js';
import { adresseStudio } from './chargement.js';

export const LOGO_ANIME = 'assets/studio/no-way-studio-logo-anime.svg';
export const LOGO_FIXE = 'assets/studio/no-way-studio-logo-fixe.svg';
export const DUREE_MS = 3800; // animation du logo : 3,71 s (fin de la bascule de la plaque), plus un court temps posé
export const REDUIT_MS = 1000; // mouvement réduit : logo fixe pendant 1 s
export const INDICE_MS = 1000; // « Toucher pour passer » au bout d'une seconde
export const FONDU_MS = 400;
const FILET_MS = 7000; // logo qui ne se charge pas (fichier absent, réseau lent) : l'introduction ne bloque jamais plus longtemps
const MODIFICATEURS = ['ShiftLeft', 'ShiftRight', 'ControlLeft', 'ControlRight', 'AltLeft', 'AltRight', 'MetaLeft', 'MetaRight'];

function el(tag, classes, attrs = {}) {
  const n = document.createElement(tag);
  n.className = classes;
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  return n;
}

// Joue l'introduction. Renvoie { fin (promesse : début du fondu, ou fin immédiate), passer(), etat() }.
export function jouerIntro({ root = document.body, reduit = matchMedia('(prefers-reduced-motion: reduce)').matches } = {}) {
  const t0 = performance.now();
  const temps = { affiche: null, fin: null, retire: null };
  let phase = 'attente'; // attente (logo en chargement) → joue → sortie (fondu) → finie
  let passe = false;
  let resoudre = null;
  const fin = new Promise((r) => {
    resoudre = r;
  });
  const minuteries = [];
  const plus = (fn, ms) => minuteries.push(setTimeout(fn, ms));

  const box = el('div', 'e0', { id: 'e0', 'data-block': 'E0' });
  if (reduit) box.classList.add('e0-reduit');
  const logo = el('img', 'e0-logo', { id: 'e0-logo', alt: '', width: '792', height: '556', decoding: 'async' });
  const indice = el('button', 'e0-passer', { type: 'button', id: 'e0-passer' });
  const annonce = el('p', 'sr-only', { id: 'e0-annonce', 'aria-live': 'polite' });
  box.append(logo, indice, annonce);
  root.append(box);

  loadDict().then((d) => {
    const nom = d['game.menu.studio.nom'] ?? '';
    logo.alt = nom;
    indice.textContent = d['game.menu.intro.passer'] ?? '';
    annonce.textContent = nom; // annoncé une fois la zone en place
  }).catch(() => {});

  function terminer() {
    if (phase === 'sortie' || phase === 'finie') return;
    for (const m of minuteries.splice(0)) clearTimeout(m);
    document.removeEventListener('keydown', touche, true);
    box.removeEventListener('pointerdown', appui);
    phase = 'sortie';
    temps.fin = performance.now() - t0;
    resoudre();
    const retirer = () => {
      if (phase === 'finie') return;
      phase = 'finie';
      temps.retire = performance.now() - t0;
      box.remove();
    };
    if (reduit) retirer();
    else {
      box.classList.add('e0-sortie');
      box.addEventListener('animationend', (e) => {
        if (e.target === box) retirer();
      });
      setTimeout(retirer, FONDU_MS + 200);
    }
  }
  function passer() {
    if (phase === 'sortie' || phase === 'finie') return;
    passe = true;
    terminer();
  }
  const appui = (e) => {
    e.preventDefault(); // l'appui ne traverse pas vers l'écran de chargement ni le menu
    passer();
  };
  const touche = (e) => {
    if (MODIFICATEURS.includes(e.code)) return;
    e.preventDefault();
    e.stopPropagation();
    passer();
  };
  box.addEventListener('pointerdown', appui);
  indice.addEventListener('click', passer);
  document.addEventListener('keydown', touche, true);

  // Le compte à rebours part quand le logo est affiché (son animation commence à ce moment-là) ; logo illisible : fin aussitôt.
  const affiche = () => {
    if (phase !== 'attente') return;
    phase = 'joue';
    temps.affiche = performance.now() - t0;
    box.classList.add('e0-joue');
    plus(terminer, reduit ? REDUIT_MS : DUREE_MS);
    if (!reduit) plus(() => box.classList.add('e0-indice'), INDICE_MS);
  };
  if (reduit) box.classList.add('e0-indice');
  logo.addEventListener('load', affiche, { once: true });
  logo.addEventListener('error', terminer, { once: true });
  plus(terminer, FILET_MS);
  const fichier = reduit ? LOGO_FIXE : LOGO_ANIME;
  adresseStudio(fichier).then((a) => {
    logo.src = a;
  }, terminer);

  return {
    fin,
    passer,
    etat: () => ({ phase, passe, reduit, logo: fichier, indice: box.classList.contains('e0-indice'), visible: box.isConnected, debut: t0, ...temps }),
  };
}
