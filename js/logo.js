// Logo « Z-Survival » (lot 8a, demandes du propriétaire) : Z rouge incliné (~13°), le tiret calé dans sa pliure, trois coulures de sang qui sortent
// de dessous la lettre (le début de chaque coulure est caché par le Z), puis « -Survival ». Partagé par l'écran de chargement du jeu (js/menu/chargement.js,
// animé : chute du Z, coulures qui s'allongent) et l'accueil de la Recette (js/accueil/main.js, sans animation). Styles : css/base.css (« Logo ») ;
// couleurs en jetons (--color-action, --menu-z-contour, --menu-rouge, --menu-coulure-sombre, --menu-coulure-reflet). Aucune couleur ici.
const SVG = 'http://www.w3.org/2000/svg';

function svgEl(tag, attrs) {
  const n = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  return n;
}

// Trois gouttes de longueurs et d'épaisseurs différentes (col qui s'affine, renflement arrondi au bout, bord droit dans l'ombre, reflet humide sur le
// col et sur le renflement) et une goutte qui se détache de la plus longue (écran de chargement seulement). Vue 60 × 60, haut = bas du Z ; le col
// remonte hors de la vue (-60), ce qui permet de faire descendre une goutte depuis le haut sans déformer son renflement.
export const GOUTTES = Object.freeze([
  Object.freeze({ cx: 13, w: 7.5, l: 30, b: 3.6 }),
  Object.freeze({ cx: 31, w: 9.5, l: 46, b: 4.6 }),
  Object.freeze({ cx: 48, w: 6, l: 21, b: 3 }),
]);
const f1 = (n) => Math.round(n * 100) / 100;

export function gouttePath({ cx, w, l, b }) {
  const [g, d, gc, dc] = [cx - w / 2, cx + w / 2, cx - w * 0.32, cx + w * 0.32].map(f1);
  return `M${g} -60L${g} ${f1(l * 0.35)}C${g} ${f1(l * 0.6)} ${gc} ${f1(l * 0.62)} ${gc} ${f1(l - 2 * b)}C${gc} ${f1(l - 1.3 * b)} ${f1(cx - b)} ${f1(l - 1.2 * b)} ${f1(cx - b)} ${f1(l - 0.2 * b)}`
    + `A${b} ${b} 0 1 0 ${f1(cx + b)} ${f1(l - 0.2 * b)}C${f1(cx + b)} ${f1(l - 1.2 * b)} ${dc} ${f1(l - 1.3 * b)} ${dc} ${f1(l - 2 * b)}C${dc} ${f1(l * 0.62)} ${d} ${f1(l * 0.6)} ${d} ${f1(l * 0.35)}L${d} -60Z`;
}

export function couluresSvg() {
  const svg = svgEl('svg', { class: 'logo-coulures-svg', viewBox: '0 0 60 60', 'aria-hidden': 'true', focusable: 'false' });
  GOUTTES.forEach((g, i) => {
    const groupe = svgEl('g', { class: `logo-coulure logo-coulure-${i + 1}` });
    groupe.append(
      svgEl('path', { class: 'logo-coulure-corps', d: gouttePath(g) }),
      svgEl('path', { class: 'logo-coulure-ombre', d: `M${f1(g.cx + g.w * 0.42)} 0L${f1(g.cx + g.w * 0.4)} ${f1(g.l * 0.45)}C${f1(g.cx + g.w * 0.3)} ${f1(g.l * 0.7)} ${f1(g.cx + g.b * 0.95)} ${f1(g.l - g.b)} ${f1(g.cx + g.b * 0.8)} ${f1(g.l + g.b * 0.4)}` }),
      svgEl('path', { class: 'logo-coulure-reflet', d: `M${f1(g.cx - g.w * 0.18)} 2L${f1(g.cx - g.w * 0.16)} ${f1(g.l * 0.5)}` }),
      svgEl('ellipse', { class: 'logo-coulure-brillant', cx: f1(g.cx - g.b * 0.38), cy: f1(g.l - g.b * 0.25), rx: f1(g.b * 0.3), ry: f1(g.b * 0.48) }),
    );
    svg.append(groupe);
  });
  const longue = GOUTTES[1];
  svg.append(svgEl('circle', { class: 'logo-goutte', cx: longue.cx, cy: f1(longue.l + longue.b + 2.4), r: '1.9' }));
  return svg;
}

// Logo fixe dans un titre (accueil) : texte traduit (« Z-Survival ») gardé comme nom accessible ; première lettre en Z incliné avec ses coulures,
// le reste à côté. Le contenu visible est décoratif (aria-hidden) ; tout passe par textContent.
export function poserLogo(titre, texte) {
  const t = String(texte ?? '');
  if (!titre || t.length < 2) return;
  const span = (classe, contenu) => {
    const s = document.createElement('span');
    s.className = classe;
    s.textContent = contenu;
    s.setAttribute('aria-hidden', 'true');
    return s;
  };
  const z = span('logo-z', t.charAt(0));
  const coulures = span('logo-coulures', '');
  coulures.append(couluresSvg());
  z.append(coulures);
  titre.classList.add('logo');
  titre.setAttribute('aria-label', t);
  titre.replaceChildren(z, span('logo-reste', t.slice(1)));
}
