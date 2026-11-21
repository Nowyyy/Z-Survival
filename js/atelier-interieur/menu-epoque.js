// Lot 9i : dessins d'époque du menu pour l'atelier (atelier-interieur.html). Après le « GO 9i » : caisses de la Boutique (js/menu/boutique.js,
// caisseSvg avec epoque : caisse de munitions en bois, cantine, valise de cuir, sans texte), scènes intégrées (jouer.js, chargement.js). La partie et
// le menu ne chargent pas ce module.
import { caisseSvg } from '../menu/boutique.js';


export const FORMES_MENU = Object.freeze({ militaire: 'munitions', veterans: 'cantine', tenues: 'valise' });

// Caisse d'époque : le dessin intégré au menu après le « GO 9i » (js/menu/boutique.js, caisseSvg avec epoque).
export const caisseSvgEpoque = (modele = 'militaire') => caisseSvg(modele, { epoque: true });
export { caisseSvg };

// Scènes du menu : intégrées après le « GO 9i » (choix du propriétaire : onglet Histoire « B », chargement « C ») dans js/menu/jouer.js et
// js/menu/chargement.js ; l'atelier les montre telles que le menu les dessine.
export const VARIANTES_HISTOIRE = Object.freeze(['A', 'B']);
export const VARIANTES_CHARGEMENT = Object.freeze(['A', 'B', 'C']);
