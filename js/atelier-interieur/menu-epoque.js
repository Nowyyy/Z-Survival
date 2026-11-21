// Lot 9i (atelier, avant le « GO 9i ») : propositions d'époque pour le menu, dessinées en code (SVG, décoratif : aria-hidden) à côté de l'actuel.
// - Caisses de la Boutique : caisse de munitions américaine en bois (Équipement), cantine de soldat à ferrures (Personnages), valise de cuir des
//   années 40 (Cosmétiques). Même cadre que caisseSvg (js/menu/boutique.js : vue 150 × 106, rayons, « ? » lumineux, petits « ? », animations e3-*),
//   seuls les dessins changent ; couleurs : jetons --menu-* existants (classes de css/menu.css et css/atelier-interieur.css).
// - Onglet Histoire : sceneJouer (js/menu/jouer.js) reprise, puis voiture → Jeep en flammes, zombies en civil → zombies soldats (casque, capote),
//   pointillés centraux → ornières ; B : poteaux télégraphiques et barbelés en plus.
// - Écran de chargement : decorNuit (js/menu/chargement.js) reprise ; B : poteaux et barbelés ; C : plus une Jeep abandonnée et des sacs de sable.
// Aucun texte sur les caisses (retours du propriétaire) ; aucune marque, aucun symbole. À l'intégration (après « GO 9i »), ces dessins rejoignent
// boutique.js, jouer.js et chargement.js ; la partie et le menu ne chargent pas ce module.
import { caisseSvg } from '../menu/boutique.js';
import { sceneJouer } from '../menu/jouer.js';
import { decorNuit } from '../menu/chargement.js';

const SVG = 'http://www.w3.org/2000/svg';
const forme = (tag, attrs = {}, classe = '') => {
  const n = document.createElementNS(SVG, tag);
  if (classe) n.setAttribute('class', classe);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, String(v));
  return n;
};

export const FORMES_MENU = Object.freeze({ militaire: 'munitions', veterans: 'cantine', tenues: 'valise' });

// Caisse d'époque : le dessin intégré au menu après le « GO 9i » (js/menu/boutique.js, caisseSvg avec epoque).
export const caisseSvgEpoque = (modele = 'militaire') => caisseSvg(modele, { epoque: true });
export { caisseSvg };

// --- Onglet Histoire -------------------------------------------------------------------------------------------------------------------------------
// Zombie soldat (pieds à l'origine, regard vers la droite, mêmes proportions que zombie() de jouer.js) : casque à bord, capote longue évasée, bras
// tendus, œil rouge.
function soldat(g) {
  g.replaceChildren(
    forme('circle', { cx: 0, cy: -38, r: 6.5 }, 'e8-jouer-zombie'),
    // Casque M1 : calotte ronde posée sur la tête, bord court tout autour.
    forme('path', { d: 'M-7.5 -39 Q-7.5 -48.5 0.5 -48.5 Q8.5 -48.5 8.5 -39 L10 -38 H-9Z' }, 'e8-jouer-zombie'),
    // Capote jusqu'aux genoux (évasée des deux côtés), puis jambes en marche comme le zombie d'origine (pieds sur la même ligne).
    forme('path', { d: 'M-8 -30 H8 L10.5 -13 H8.6 L10 -4 H4 L2 -11 L-2 -4 H-9.4 L-8.6 -13 H-10.5Z' }, 'e8-jouer-zombie'),
    forme('path', { d: 'M6 -27 L26 -29 L26 -24 L6 -21Z' }, 'e8-jouer-zombie'),
    forme('circle', { cx: 3, cy: -38.5, r: 1.3 }, 'e8-jouer-yeux'),
  );
}
// Jeep en flammes (même place que la voiture : 740-840 × 266-296) : capot plat, pare-brise rabattu, roue de secours, roues découpées.
const JEEP = 'M744 296 L744 282 L752 280 L768 279 L770 270 L773 270 L776 279 L812 279 L818 274 L822 274 L824 279 L834 280 L838 284 L838 296 L830 296 A8 8 0 0 0 814 296 L768 296 A8 8 0 0 0 752 296Z';
function poteaux(svg, ligne, classe = '') {
  const g = forme('g', {}, `i9-ligne ${classe}`);
  const pts = ligne.map(([x, y, h]) => ({ x, y, h }));
  for (const p of pts) g.append(forme('path', { d: `M${p.x} ${p.y} V${p.y - p.h} M${p.x - 9} ${p.y - p.h + 4} H${p.x + 9}` }, 'i9-poteau'));
  for (let i = 0; i + 1 < pts.length; i += 1) {
    const a = pts[i];
    const b = pts[i + 1];
    for (const dx of [-8, 8]) g.append(forme('path', { d: `M${a.x + dx} ${a.y - a.h + 4} Q${(a.x + b.x) / 2 + dx} ${(a.y - a.h + b.y - b.h) / 2 + 14} ${b.x + dx} ${b.y - b.h + 4}` }, 'i9-fil'));
  }
  svg.append(g);
  return g;
}
function barbeles(x0, x1, y, pas = 26) {
  const g = forme('g', {}, 'i9-barbeles');
  for (let x = x0; x <= x1; x += pas) g.append(forme('path', { d: `M${x} ${y} V${y - 14}` }, 'i9-piquet'));
  for (const dy of [-5, -11]) g.append(forme('path', { d: `M${x0} ${y + dy} L${x1} ${y + dy - 2}` }, 'i9-fil-barbele'));
  return g;
}

export const VARIANTES_HISTOIRE = Object.freeze(['A', 'B']);
export function sceneJouerEpoque(etat, variante = 'A') {
  const svg = sceneJouer(etat);
  svg.dataset.epoque = variante;
  // Voiture → Jeep (mêmes flammes, halo et fumée, même place).
  const voiture = svg.querySelector('.e8-jouer-voiture');
  voiture?.setAttribute('d', JEEP);
  if (voiture) {
    voiture.after(forme('circle', { cx: 842, cy: 285, r: 6 }, 'e8-jouer-voiture'), forme('path', { d: 'M770 279 L782 270 L786 270 L774 279Z' }, 'e8-jouer-voiture'));
  }
  // Zombies en civil → zombies soldats (mêmes groupes animés, mêmes places).
  for (const g of svg.querySelectorAll('g[transform]')) if (g.querySelector(':scope > circle.e8-jouer-zombie')) soldat(g);
  // Pointillés centraux (marquage moderne) → deux ornières de terre.
  const trait = svg.querySelector('.e8-jouer-route-trait');
  if (trait) {
    const d = trait.getAttribute('d');
    trait.replaceWith(forme('path', { d, transform: 'translate(0 -4)' }, 'i9-orniere'), forme('path', { d, transform: 'translate(0 4)' }, 'i9-orniere'));
  }
  if (variante === 'B') {
    const route = svg.querySelector('.e8-jouer-route');
    const ref = route ?? svg.lastChild;
    const lignes = forme('g', {}, 'i9-decor-b');
    poteaux(lignes, [[24, 300, 120], [132, 296, 112], [226, 292, 104]], 'i9-histoire');
    poteaux(lignes, [[716, 290, 104], [884, 290, 116]], 'i9-histoire');
    lignes.append(barbeles(18, 236, 318), barbeles(706, 920, 312));
    ref.before(lignes);
  }
  return svg;
}

// --- Écran de chargement ---------------------------------------------------------------------------------------------------------------------------
export const VARIANTES_CHARGEMENT = Object.freeze(['A', 'B', 'C']);
export function decorNuitEpoque(variante = 'A') {
  const svg = decorNuit();
  svg.dataset.epoque = variante;
  if (variante === 'B' || variante === 'C') {
    const g = forme('g', {}, 'i9-decor-chargement');
    // Silhouettes posées sur le sol du décor (bord bas des toits à 372, à gauche et à droite du bâtiment), lisibles contre le ciel.
    poteaux(g, [[34, 372, 66], [160, 372, 62], [790, 372, 62], [918, 372, 66]], 'i9-chargement');
    g.append(barbeles(0, 104, 372, 26), barbeles(770, 932, 372, 27));
    if (variante === 'C') {
      g.append(
        forme('path', { d: 'M110 372 L110 358 L118 356 L134 355 L137 346 L140 346 L143 355 L176 355 L182 349 L186 349 L188 355 L198 356 L202 360 L202 372Z' }, 'menu-batiment'),
        ...[[790, 372], [812, 372], [834, 372], [801, 362], [823, 362]].map(([x, y]) => forme('ellipse', { cx: x, cy: y - 5, rx: 12, ry: 6 }, 'menu-batiment')),
      );
    }
    svg.append(g);
  }
  return svg;
}
