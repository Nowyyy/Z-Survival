// Lot 8b : onglet Jouer (E8-3) du menu principal, d'après la maquette Docs/maquettes-v0.8/Main.html (Docs/ref/menu-principal.md).
// Scène de nuit dessinée en code (SVG en ligne, décorative : aria-hidden) : ciel, lune, silhouettes, bâtiment (aile à deux étages, grande salle),
// fenêtres éclairées (lueur qui vacille), barricadées ou noires, porte barricadée, route en pointillés et panneaux 1, 10, 20, 30, 40 (rouges si
// atteints par le record), repère du record, voiture en feu (flammes, halo, fumée), brume, vignette ; zombies : un par la gauche abattu depuis une
// fenêtre de l'étage, un par la droite abattu depuis le rez-de-chaussée avant la voiture, deux rôdeurs au loin. Par-dessus, en texte : bandeau,
// record et portes ouvertes, « Monde précédent » (désactivé), carte du monde suivant (verrouillé), bouton « JOUER » (mode histoire).
// Couleurs : classes de css/menu.css (jetons --menu-* de tokens.css) ; animations CSS « e8-jouer-* », en pause hors de l'écran (data-anim).
// Ordre de profondeur : décor, puis zombies (le plus loin d'abord), puis panneaux de la route (plus près), puis brume et vignette.
import { etatJouer, mondeSuivant } from '../core/menu-etat.js';
import { fmt } from '../game/texts.js';

const SVG = 'http://www.w3.org/2000/svg';

function svgEl(tag, attrs = {}, classe = '') {
  const n = document.createElementNS(SVG, tag);
  if (classe) n.setAttribute('class', classe);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, String(v));
  return n;
}

function el(tag, classes = [], attrs = {}) {
  const n = document.createElement(tag);
  if (classes.length) n.classList.add(...classes);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  return n;
}

function degrade(type, id, attrs, stops) {
  const g = svgEl(type, { id, ...attrs });
  for (const [offset, classe] of stops) g.append(svgEl('stop', { offset }, classe));
  return g;
}

// Route : deux courbes de Bézier ; point sur la route pour une abscisse donnée (repère du record). Lot 8d, retour du propriétaire : elle part du coin
// en bas à gauche et file vers le bouton « JOUER » (en bas à droite) en passant sous le bâtiment, sans le toucher (maquette : jusqu'au pied du bâtiment,
// 560, 288).
const ROUTE = 'M2 368 C150 354 300 343 440 336 C540 331 610 328 668 326';
const SEGMENTS = [[[2, 368], [150, 354], [300, 343], [440, 336]], [[440, 336], [540, 331], [610, 328], [668, 326]]];
const bezier = (p, t) => {
  const u = 1 - t;
  return [0, 1].map((k) => u * u * u * p[0][k] + 3 * u * u * t * p[1][k] + 3 * u * t * t * p[2][k] + t * t * t * p[3][k]);
};
export function pointRoute(x) {
  const seg = x <= SEGMENTS[0][3][0] ? SEGMENTS[0] : SEGMENTS[1];
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 30; i += 1) {
    const mid = (lo + hi) / 2;
    if (bezier(seg, mid)[0] < x) lo = mid;
    else hi = mid;
  }
  return bezier(seg, (lo + hi) / 2);
}
// Panneaux (abscisse du piquet, haut de la planche) : espacés le long de la route, le pied du piquet sur la route (lot 8d ; maquette : 94 à 508).
const PANNEAUX = [94, 218, 342, 466, 590].map((x) => [x, Math.round(pointRoute(x + 2)[1] - 30)]);

// Silhouette de zombie (pieds à l'origine, regard vers la droite) : tête, corps et jambes, bras tendus, œil rouge.
function zombie(x, y, echelle = 1, miroir = false) {
  const g = svgEl('g', { transform: `translate(${x} ${y}) scale(${miroir ? -echelle : echelle} ${echelle})` });
  g.append(
    svgEl('circle', { cx: 0, cy: -38, r: 7 }, 'e8-jouer-zombie'),
    svgEl('path', { d: 'M-8 -30 H8 L10 -4 H4 L2 -14 L-2 -4 H-10Z' }, 'e8-jouer-zombie'),
    svgEl('path', { d: 'M6 -27 L26 -29 L26 -24 L6 -21Z' }, 'e8-jouer-zombie'),
    svgEl('circle', { cx: 3, cy: -39, r: 1.3 }, 'e8-jouer-yeux'),
  );
  return g;
}

function flaque(x, y, classe) {
  const g = svgEl('g', {}, `e8-jouer-sang ${classe}`);
  const inner = svgEl('g', { transform: `translate(${x} ${y})` });
  inner.append(
    svgEl('circle', { cx: 0, cy: 0, r: 9 }, 'e8-jouer-sang-fond'),
    svgEl('circle', { cx: 12, cy: -3, r: 4 }, 'e8-jouer-sang-fond'),
    svgEl('circle', { cx: -13, cy: 2, r: 3.5 }, 'e8-jouer-sang-fond'),
    svgEl('circle', { cx: 6, cy: 7, r: 3 }, 'e8-jouer-sang-fond'),
    svgEl('circle', { cx: -6, cy: -8, r: 2.5 }, 'e8-jouer-sang-clair'),
  );
  g.append(inner);
  return g;
}

// Tir : traînée de balle et éclair jaune à la fenêtre.
function tir(x1, y1, x2, y2, classe) {
  const g = svgEl('g', {}, `e8-jouer-tir ${classe}`);
  g.append(
    svgEl('line', { x1, y1, x2, y2 }, 'e8-jouer-trainee'),
    svgEl('circle', { cx: x1, cy: y1, r: 10 }, 'e8-jouer-eclair'),
    svgEl('circle', { cx: x1, cy: y1, r: 5 }, 'e8-jouer-eclair-coeur'),
  );
  return g;
}

function fenetre(x, y, etat, lueur = null) {
  const out = [];
  if (etat === 'eclairee') {
    out.push(svgEl('circle', { cx: x + 16, cy: y + 16, r: lueur.r }, `e8-jouer-lampe ${lueur.classe}`));
    out.push(svgEl('rect', { x, y, width: 32, height: 34 }, `e8-jouer-fenetre-eclairee ${lueur.vive ? 'e8-jouer-fenetre-vive' : ''}`));
  } else {
    out.push(svgEl('rect', { x, y, width: 32, height: 34 }, 'e8-jouer-fenetre-noire'));
    if (etat === 'barricadee') out.push(svgEl('path', { d: `M${x - 4} ${y + 8} L${x + 36} ${y + 20} M${x - 4} ${y + 26} L${x + 36} ${y + 14}` }, 'e8-jouer-planches'));
  }
  return out;
}

// Scène (vue 932 × 318 : la partie de la maquette visible entre l'en-tête et la barre d'onglets), ancrée en bas, jamais coupée.
export function sceneJouer(etat) {
  const svg = svgEl('svg', { viewBox: '0 50 932 318', preserveAspectRatio: 'xMidYMax meet', 'aria-hidden': 'true', focusable: 'false' }, 'e8-jouer-svg');
  const defs = svgEl('defs');
  defs.append(
    degrade('linearGradient', 'e8-jouer-ciel', { x1: 0, y1: 0, x2: 0, y2: 1 }, [['0', 'e8-jouer-ciel-haut'], ['1', 'e8-jouer-ciel-bas']]),
    degrade('radialGradient', 'e8-jouer-halo', { cx: 0.5, cy: 0.5, r: 0.5 }, [['0', 'e8-jouer-halo-centre'], ['1', 'e8-jouer-halo-bord']]),
    degrade('radialGradient', 'e8-jouer-lampe', { cx: 0.5, cy: 0.5, r: 0.5 }, [['0', 'e8-jouer-lampe-centre'], ['1', 'e8-jouer-lampe-bord']]),
    degrade('radialGradient', 'e8-jouer-feu', { cx: 0.5, cy: 0.5, r: 0.5 }, [['0', 'e8-jouer-feu-centre'], ['1', 'e8-jouer-feu-bord']]),
    degrade('radialGradient', 'e8-jouer-vignette', { cx: 0.5, cy: 0.42, r: 0.78 }, [['0.55', 'e8-jouer-vignette-centre'], ['1', 'e8-jouer-vignette-bord']]),
  );
  svg.append(defs);
  // Ciel, lune, silhouettes lointaines, sol.
  svg.append(
    svgEl('rect', { width: 932, height: 368, fill: 'url(#e8-jouer-ciel)' }),
    svgEl('circle', { cx: 770, cy: 96, r: 78, fill: 'url(#e8-jouer-halo)' }),
    svgEl('circle', { cx: 770, cy: 96, r: 22 }, 'e8-jouer-lune'),
    svgEl('path', { d: 'M0 252 L50 238 L96 248 L150 228 L196 244 L250 236 L250 300 L0 300Z' }, 'e8-jouer-lointain'),
    svgEl('path', { d: 'M700 244 L760 232 L820 240 L880 226 L932 238 L932 300 L700 300Z' }, 'e8-jouer-lointain'),
    svgEl('rect', { x: 0, y: 282, width: 932, height: 86 }, 'e8-jouer-sol'),
  );
  // Bâtiment : aile à deux étages (gauche), grande salle basse (droite), bords de toit plus clairs, séparation d'étage.
  svg.append(
    svgEl('rect', { x: 258, y: 90, width: 210, height: 196 }, 'e8-jouer-aile'),
    svgEl('rect', { x: 468, y: 160, width: 232, height: 126 }, 'e8-jouer-salle'),
    svgEl('rect', { x: 250, y: 82, width: 226, height: 10 }, 'e8-jouer-toit'),
    svgEl('rect', { x: 460, y: 152, width: 248, height: 10 }, 'e8-jouer-toit-salle'),
    svgEl('rect', { x: 258, y: 188, width: 210, height: 4 }, 'e8-jouer-etage'),
  );
  // Fenêtres : étage (éclairée, barricadée, noire), rez-de-chaussée de l'aile (barricadée, éclairée, noire), salle (barricadée, éclairée, barricadée).
  svg.append(
    ...fenetre(280, 112, 'eclairee', { r: 46, classe: 'e8-jouer-lueur-1', vive: true }),
    ...fenetre(336, 112, 'barricadee'),
    ...fenetre(392, 112, 'noire'),
    ...fenetre(280, 214, 'barricadee'),
    ...fenetre(336, 214, 'eclairee', { r: 44, classe: 'e8-jouer-lueur-2' }),
    ...fenetre(392, 214, 'noire'),
    ...fenetre(496, 200, 'barricadee'),
    ...fenetre(556, 200, 'eclairee', { r: 44, classe: 'e8-jouer-lueur-3' }),
    ...fenetre(616, 200, 'barricadee'),
  );
  // Porte barricadée de la salle.
  svg.append(
    svgEl('rect', { x: 662, y: 226, width: 28, height: 60 }, 'e8-jouer-fenetre-noire'),
    svgEl('path', { d: 'M658 240 L694 254 M658 262 L694 248' }, 'e8-jouer-planches'),
  );
  // Route de terre en pointillés.
  svg.append(svgEl('path', { d: ROUTE }, 'e8-jouer-route'), svgEl('path', { d: ROUTE }, 'e8-jouer-route-trait'));
  // Voiture en feu (plus bas) : carcasse, halo orangé qui pulse, flammes qui vacillent, fumée qui monte et s'efface.
  const flammes = svgEl('g', {}, 'e8-jouer-flammes');
  flammes.append(
    svgEl('path', { d: 'M770 268 C772 250 782 252 780 238 C792 250 800 246 798 232 C810 248 812 262 806 268Z' }, 'e8-jouer-flamme'),
    svgEl('path', { d: 'M782 268 C784 258 790 258 792 250 C798 258 800 264 796 268Z' }, 'e8-jouer-flamme-coeur'),
  );
  // Zombies qui approchent : marche (translation), corps (dandinement, recul, il se tasse sur place).
  const approche = (lettre, z) => {
    const marche = svgEl('g', {}, `e8-jouer-anime e8-jouer-zombie-proche e8-jouer-marche-${lettre}`);
    const corps = svgEl('g', {}, `e8-jouer-corps e8-jouer-corps-${lettre}`);
    corps.append(z);
    marche.append(corps);
    return marche;
  };
  // Zombie de droite : plus loin que la voiture (dessiné avant elle) et au-dessus du bouton « JOUER » ; abattu avant d'atteindre la voiture.
  svg.append(
    svgEl('circle', { cx: 790, cy: 262, r: 62, fill: 'url(#e8-jouer-feu)' }, 'e8-jouer-feu'),
    flaque(862, 282, 'e8-jouer-sang-b'),
    approche('b', zombie(950, 280, 0.9, true)),
    svgEl('path', { d: 'M742 286 L752 268 L800 266 L818 280 L838 282 L840 296 L740 296Z' }, 'e8-jouer-voiture'),
    flammes,
    svgEl('ellipse', { cx: 804, cy: 206, rx: 42, ry: 16 }, 'e8-jouer-fumee e8-jouer-fumee-1'),
    svgEl('ellipse', { cx: 826, cy: 176, rx: 30, ry: 12 }, 'e8-jouer-fumee e8-jouer-fumee-2'),
    tir(588, 226, 858, 262, 'e8-jouer-tir-b'),
  );
  // Deux rôdeurs au loin (petits, dans la brume), puis le zombie de gauche (plus près : dessiné après).
  const rodeur = (classe, z) => {
    const g = svgEl('g', {}, `e8-jouer-anime ${classe}`);
    g.append(z);
    return g;
  };
  svg.append(rodeur('e8-jouer-rodeur-g', zombie(-30, 292, 0.7)), rodeur('e8-jouer-rodeur-d', zombie(990, 294, 0.72, true)));
  svg.append(
    flaque(226, 300, 'e8-jouer-sang-a'),
    approche('a', zombie(40, 300)),
    tir(302, 146, 234, 276, 'e8-jouer-tir-a'),
  );
  // Panneaux de bois sur piquet (plus près que les zombies) : rouges, texte blanc, si atteints ; bois, texte clair, sinon. Repère du record.
  const panneaux = svgEl('g', {}, 'e8-jouer-panneaux');
  etat.panneaux.forEach((p, i) => {
    const [x, y] = PANNEAUX[i] ?? PANNEAUX.at(-1);
    const g = svgEl('g', { 'data-manche': p.manche }, `e8-jouer-panneau ${p.atteint ? 'e8-jouer-panneau-atteint' : 'e8-jouer-panneau-bois'}`);
    const texte = svgEl('text', { x: x + 2, y: y + 13 }, 'e8-jouer-panneau-texte');
    texte.textContent = String(p.manche);
    g.append(svgEl('rect', { x, y: y + 12, width: 4, height: 22 }, 'e8-jouer-piquet'), svgEl('rect', { x: x - 14, y, width: 32, height: 18 }, 'e8-jouer-planche'), texte);
    panneaux.append(g);
  });
  svg.append(panneaux);
  if (etat.repere !== null) {
    const i = Math.min(Math.floor(etat.repere), PANNEAUX.length - 1);
    const f = etat.repere - i;
    const x0 = PANNEAUX[i][0] + 2;
    const x1 = (PANNEAUX[i + 1] ?? PANNEAUX[i])[0] + 2;
    const [x, y] = pointRoute(x0 + (x1 - x0) * f);
    const repere = svgEl('g', {}, 'e8-jouer-repere');
    repere.append(svgEl('circle', { cx: x, cy: y, r: 7 }, 'e8-jouer-repere-point'), svgEl('circle', { cx: x, cy: y, r: 13 }, 'e8-jouer-repere-cercle'));
    svg.append(repere);
  }
  // Brume basse, vignette.
  svg.append(
    svgEl('ellipse', { cx: 200, cy: 300, rx: 260, ry: 26 }, 'e8-jouer-brume e8-jouer-brume-1'),
    svgEl('ellipse', { cx: 640, cy: 306, rx: 320, ry: 24 }, 'e8-jouer-brume e8-jouer-brume-2'),
    svgEl('rect', { width: 932, height: 368, fill: 'url(#e8-jouer-vignette)' }),
  );
  return svg;
}

const ICONE = { gauche: 'M15 6l-6 6 6 6', droite: 'M9 6l6 6-6 6', jouer: 'M7 4v16l13-8z' };
function icone(nom, classe) {
  const svg = svgEl('svg', { viewBox: '0 0 24 24', 'aria-hidden': 'true', focusable: 'false' }, classe);
  svg.append(svgEl('path', { d: ICONE[nom] }));
  return svg;
}

// Section de l'onglet : { section, scene (élément animé), bouton (« JOUER ») }. etat : { mondes, monde (jouable), record }, t(clé) : textes.
export function ecranJouer({ t, monde, mondes, record, bandeau }) {
  const e = etatJouer(monde, record);
  const section = el('section', ['e8-ecran', 'e8-jouer'], { id: 'menu-ecran-jouer', 'aria-labelledby': 'menu-titre-jouer' });
  const scene = el('div', ['e8-jouer-scene'], { 'aria-hidden': 'true', 'data-anim': 'off', id: 'menu-jouer-scene' });
  scene.append(sceneJouer(e));
  const nom = monde.nom || fmt(t('game.menu.monde'), { n: monde.numero });
  const titre = bandeau(fmt(t('game.menu.jouer.libelle'), { n: monde.numero }), nom, 'menu-titre-jouer');
  const infos = el('div', ['e8-jouer-infos']);
  const ligneRecord = el('p', ['e8-jouer-record'], { id: 'menu-jouer-record' });
  ligneRecord.textContent = e.record === null ? t('game.menu.jouer.recordAucun') : fmt(t('game.menu.jouer.record'), { n: e.record, max: e.manches });
  const lignePortes = el('p', ['e8-jouer-portes'], { id: 'menu-jouer-portes' });
  lignePortes.textContent = fmt(t('game.menu.jouer.portes'), { n: e.portesOuvertes, max: e.portesTotal });
  infos.append(ligneRecord, lignePortes);
  const precedent = el('button', ['e8-jouer-precedent'], { type: 'button', id: 'menu-monde-precedent', 'aria-label': t('game.menu.jouer.precedent') });
  precedent.disabled = true; // un seul monde jouable
  precedent.append(icone('gauche', 'e8-jouer-fleche'));
  const suivant = mondeSuivant(mondes, monde.id);
  const zones = [scene, titre, infos, precedent];
  if (suivant) {
    // Monde suivant verrouillé : texte (aucune action), souligné du ruban jaune et noir.
    const carte = el('p', ['e8-jouer-suivant'], { id: 'menu-monde-suivant' });
    const textes = el('span', ['e8-jouer-suivant-textes']);
    const n = el('span', ['e8-jouer-suivant-nom']);
    n.textContent = fmt(t('game.menu.monde'), { n: suivant.numero });
    const v = el('span', ['e8-jouer-suivant-etat']);
    v.textContent = t(suivant.jouable ? 'game.menu.jouer.suivantOuvert' : 'game.menu.jouer.verrouille');
    textes.append(n, v);
    carte.append(icone('droite', 'e8-jouer-fleche e8-jouer-fleche-suivant'), textes, el('span', ['e8-jouer-suivant-ruban', 'menu-ruban'], { 'aria-hidden': 'true' }));
    zones.push(carte);
  }
  const bouton = el('button', ['menu-peint', 'e8-jouer-bouton'], { type: 'button', id: 'menu-jouer' });
  const nomBouton = el('span');
  nomBouton.textContent = t('game.menu.jouer.bouton');
  bouton.append(icone('jouer', 'e8-jouer-icone-bouton'), nomBouton);
  section.append(...zones, bouton);
  return { section, scene, bouton, etat: e };
}
