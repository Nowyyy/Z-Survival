// Lot 9f (Docs/ref/cache.md) : bandeau discret « Nouvelle version disponible » et bouton « Recharger », montré au retour au menu (lot 9d, sans
// rechargement) quand build-info.json, lu sans cache, annonce une version plus récente que celle de la page (demarrage.js). Jamais de
// rechargement imposé : seul le bouton recharge (recharger(), fourni par demarrage.js). Chargé seulement quand il sert ; textes de fr.json
// (game.menu.majDispo.*), posés par textContent ; styles .maj-bandeau de css/menu.css (jetons existants).
import { loadDict } from '../game/texts.js';
import { translate } from '../i18n.js';

// Renvoie une promesse de { element, retirer() } ; le bandeau est ajouté à la page une fois ses textes posés (aucune boîte vide).
export function afficherBandeauVersion({ recharger = () => {}, doc = globalThis.document } = {}) {
  return loadDict().catch(() => ({})).then((dict) => {
    const boite = doc.createElement('div');
    boite.className = 'maj-bandeau';
    boite.id = 'maj-bandeau';
    const texte = doc.createElement('p');
    texte.className = 'maj-bandeau-texte';
    texte.setAttribute('role', 'status');
    texte.textContent = translate(dict, 'game.menu.majDispo.texte');
    const bouton = doc.createElement('button');
    bouton.type = 'button';
    bouton.className = 'maj-bandeau-bouton';
    bouton.id = 'maj-bandeau-recharger';
    bouton.textContent = translate(dict, 'game.menu.majDispo.recharger');
    bouton.addEventListener('click', () => recharger());
    boite.append(texte, bouton);
    doc.body.append(boite);
    return { element: boite, retirer: () => boite.remove() };
  });
}
