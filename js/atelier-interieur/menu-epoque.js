// Lot 9i (atelier, avant le « GO 9i ») : propositions d'époque pour le menu, dessinées en code (SVG, décoratif : aria-hidden) à côté de l'actuel.
// - Caisses de la Boutique : caisse de munitions américaine en bois (Équipement), cantine de soldat à ferrures (Personnages), valise de cuir des
//   années 40 (Cosmétiques). Même cadre que caisseSvg (js/menu/boutique.js : vue 150 × 106, rayons, « ? » lumineux, petits « ? », animations e3-*),
//   seuls les dessins changent ; couleurs : jetons --menu-* existants (classes de css/menu.css et css/atelier-interieur.css).
// - Onglet Histoire : sceneJouer (js/menu/jouer.js) reprise, puis voiture → Jeep en flammes, zombies en civil → zombies soldats (casque, capote),
//   pointillés centraux → ornières ; B : poteaux télégraphiques et barbelés en plus.
// - Écran de chargement : decorNuit (js/menu/chargement.js) reprise ; B : poteaux et barbelés ; C : plus une Jeep abandonnée et des sacs de sable.
// Texte inventé (« R. MARCEAU », cantine ; caisse d'équipement sans texte, retour du propriétaire) ; aucune marque, aucun symbole. À l'intégration (après « GO 9i »), ces dessins rejoignent
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
const groupe = (classe, ...enfants) => {
  const g = forme('g', {}, classe);
  g.append(...enfants);
  return g;
};
const point = (x, y, classe, texte, attrs = {}) => {
  const n = forme('text', { x, y, 'text-anchor': 'middle', ...attrs }, classe);
  n.textContent = texte;
  return n;
};

export const TEXTES_MENU = Object.freeze({ cantine: 'R. MARCEAU' }); // retour du propriétaire : aucun texte sur la caisse d'équipement
export const FORMES_MENU = Object.freeze({ militaire: 'munitions', veterans: 'cantine', tenues: 'valise' });

const DESSINS = {
  munitions: () => [
    // Poignées de corde en boucle aux deux bouts.
    forme('path', { d: 'M12 50 C2 52 2 70 12 72 M138 50 C148 52 148 70 138 72' }, 'i9-corde'),
    forme('rect', { x: 12, y: 36, width: 126, height: 56, rx: 1 }, 'i9-bois'),
    forme('path', { d: 'M12 55 H138 M12 74 H138' }, 'i9-bois-joint'),
    forme('rect', { x: 12, y: 36, width: 9, height: 56 }, 'i9-bois-tasseau'),
    forme('rect', { x: 129, y: 36, width: 9, height: 56 }, 'i9-bois-tasseau'),
    forme('rect', { x: 12, y: 82, width: 126, height: 5 }, 'e3-bande'),
    forme('rect', { x: 8, y: 25, width: 134, height: 13, rx: 1 }, 'i9-bois-couvercle'),
    forme('path', { d: 'M8 31.5 H142' }, 'i9-bois-joint'),
    forme('rect', { x: 38, y: 24, width: 8, height: 15 }, 'i9-bois-tasseau'),
    forme('rect', { x: 104, y: 24, width: 8, height: 15 }, 'i9-bois-tasseau'),
  ],
  cantine: () => [
    forme('rect', { x: 12, y: 36, width: 126, height: 56, rx: 2 }, 'i9-cantine'),
    forme('path', { d: 'M12 50 H138 M12 64 H138 M12 78 H138' }, 'i9-cantine-joint'),
    forme('rect', { x: 10, y: 37, width: 130, height: 3 }, 'e3-bande'),
    // Cornières, poignées latérales, moraillon.
    forme('path', { d: 'M12 82 V92 H22 M138 82 V92 H128 M12 46 V36 H22 M138 46 V36 H128' }, 'i9-ferrure'),
    forme('path', { d: 'M6 58 h6 M6 58 v8 h6 M144 58 h-6 M144 58 v8 h-6' }, 'i9-ferrure-fine'),
    forme('rect', { x: 71, y: 37, width: 8, height: 5, rx: 1 }, 'e3-loquet'),
    forme('rect', { x: 8, y: 26, width: 134, height: 12, rx: 2 }, 'i9-cantine-couvercle'),
    point(75, 35, 'i9-nom', TEXTES_MENU.cantine),
  ],
  valise: () => [
    forme('path', { d: 'M60 34 V26 Q75 20 90 26 V34' }, 'e3-anse'),
    forme('rect', { x: 12, y: 34, width: 126, height: 58, rx: 12 }, 'e3-valise'),
    forme('rect', { x: 17, y: 39, width: 116, height: 48, rx: 9 }, 'i9-couture'),
    forme('rect', { x: 12, y: 60, width: 126, height: 3 }, 'e3-bande'),
    // Coins de cuir plus sombre, deux sangles à boucle, serrures.
    forme('path', { d: 'M12 50 V46 Q12 34 24 34 H28 V40 H22 Q18 40 18 46 V50Z M138 50 V46 Q138 34 126 34 H122 V40 H128 Q132 40 132 46 V50Z M12 76 V80 Q12 92 24 92 H28 V86 H22 Q18 86 18 80 V76Z M138 76 V80 Q138 92 126 92 H122 V86 H128 Q132 86 132 80 V76Z' }, 'i9-coin-cuir'),
    forme('rect', { x: 38, y: 34, width: 9, height: 58 }, 'e3-sangle'),
    forme('rect', { x: 103, y: 34, width: 9, height: 58 }, 'e3-sangle'),
    forme('rect', { x: 36, y: 68, width: 13, height: 10, rx: 1 }, 'e3-boucle'),
    forme('rect', { x: 101, y: 68, width: 13, height: 10, rx: 1 }, 'e3-boucle'),
    forme('rect', { x: 60, y: 31, width: 6, height: 5, rx: 1 }, 'e3-loquet'),
    forme('rect', { x: 84, y: 31, width: 6, height: 5, rx: 1 }, 'e3-loquet'),
  ],
};
// Places des « ? » (comme caisseSvg) : grand (y de la ligne de base), petits (x, x, y).
const POINTS = { munitions: [70, 44, 106, 64], cantine: [70, 36, 112, 66], valise: [72, 25, 125, 58] };

// Caisse d'époque (même nœud que caisseSvg : classes e3-caisse, e3-rayons, e3-tremble, e3-flotte, e3-lueur, e3-q).
export function caisseSvgEpoque(modele = 'militaire') {
  const m = FORMES_MENU[modele] ? modele : 'militaire';
  const f = FORMES_MENU[m];
  const [y, x1, x2, y2] = POINTS[f];
  const svg = forme('svg', { viewBox: '0 -10 150 106', 'aria-hidden': 'true', focusable: 'false', preserveAspectRatio: 'xMidYMax meet', 'data-modele': m, 'data-epoque': f }, `e3-caisse e3-caisse-${m}`);
  svg.append(
    groupe('e3-rayons', forme('path', { d: 'M40 30 L20 -6 L55 -6 Z M75 30 L66 -10 L84 -10 Z M110 30 L95 -6 L130 -6 Z' })),
    groupe('e3-tremble', groupe('e3-flotte',
      ...DESSINS[f](),
      groupe('e3-lueur', point(75, y, 'e3-q e3-q-halo', '?'), point(75, y, 'e3-q', '?')),
      point(x1, y2, 'e3-q e3-q-petit', '?'),
      point(x2, y2, 'e3-q e3-q-petit', '?'))));
  return svg;
}
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
