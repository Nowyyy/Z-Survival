// Lot 8j : texte « Porte ouverte à la manche X » un peu sous le centre de l'écran (pour ne pas cacher les zombies autour du joueur), quand le
// joueur approche d'une porte encore fermée (js/core/porte-message.js : porte la plus proche de son étage, distance de
// data/game/reglages-partie.json). Fondu court (aucun sous prefers-reduced-motion : css/game-ui.css), un seul message à la fois, annoncé une fois
// par approche aux lecteurs d'écran (aria-live poli : le texte n'est posé qu'à l'apparition). Lecture seule : rien n'est écrit dans l'état ni
// dans le stockage ; le DOM n'est touché que quand la porte proche change.
import { porteProche, reglagesPorte } from '../core/porte-message.js';
import { fmt } from './texts.js';

export function createPorteMessage(dict, reglages, portes, root = document.getElementById('game-root') ?? document.body) {
  const { distance } = reglagesPorte(reglages);
  const el = document.createElement('p');
  el.id = 'porte-message';
  el.className = 'porte-message';
  el.setAttribute('aria-live', 'polite');
  el.dataset.visible = 'false';
  root.append(el);
  let actuelle = null; // { id, manche } affichée, ou null
  const modele = dict['game.porte.message'] ?? 'game.porte.message';
  return {
    // joueur { x, y }, etage, etat des portes ({ [id]: { open } }), actif (faux à la mort) ; renvoie la porte affichée ou null.
    update(joueur, etage, etat, actif = true) {
      const p = actif ? porteProche(portes, etat, joueur, etage, distance) : null;
      if ((p?.id ?? null) === (actuelle?.id ?? null) && (p?.manche ?? null) === (actuelle?.manche ?? null)) return actuelle;
      actuelle = p ? { id: p.id, manche: p.manche } : null;
      if (actuelle) el.textContent = fmt(modele, { n: actuelle.manche });
      el.dataset.visible = actuelle ? 'true' : 'false';
      if (actuelle) el.dataset.porte = actuelle.id;
      else delete el.dataset.porte;
      return actuelle;
    },
    get element() {
      return el;
    },
  };
}
