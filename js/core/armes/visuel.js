// Lot 9c — Visuel 2D de profil d'une arme (future table des armes et interface) : SVG généré en code depuis les mêmes pièces que le
// modèle 3D (js/core/armes/modeles.js), vues de côté (profil droit, bouche à droite), dans le style peint du menu (aplats, trait sombre,
// reflet clair, veines du bois). Pur : renvoie une chaîne, aucun DOM, aucun Three.js ; couleurs par classes (css/armes.css, var(--arm-*)).
import { trianglesPiece } from './geometrie.js';
import { piecesArme, varianteDe, MATIERES_DEFAUT } from './armes.js';

export const LARGEUR = 400;
export const HAUTEUR = 120;
const MARGE = 8;
const r1 = (v) => Math.round(v * 10) / 10;

// Enveloppe convexe (chaîne monotone) de points [x, y].
function enveloppe(points) {
  const p = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (p.length < 3) return p;
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const bas = [];
  for (const q of p) {
    while (bas.length >= 2 && cross(bas[bas.length - 2], bas[bas.length - 1], q) <= 0) bas.pop();
    bas.push(q);
  }
  const haut = [];
  for (const q of [...p].reverse()) {
    while (haut.length >= 2 && cross(haut[haut.length - 2], haut[haut.length - 1], q) <= 0) haut.pop();
    haut.push(q);
  }
  return [...bas.slice(0, -1), ...haut.slice(0, -1)];
}

// Contour de côté d'une pièce en (z, y) : polygone exact d'un profil non tourné, sinon enveloppe des sommets projetés.
function contour(piece) {
  const rot = piece.rot ?? [0, 0, 0];
  if (piece.forme === 'profil' && !rot[0] && !rot[1] && !rot[2]) {
    const [, py, pz] = piece.pos ?? [0, 0, 0];
    return piece.pts.map(([z, y]) => [z + pz, y + py]);
  }
  return enveloppe(trianglesPiece(piece).flatMap((t) => t.p.map((q) => [q[2], q[1]])));
}

// SVG de profil : { svg, octets }. options : { id (préfixe des identifiants internes), titre (texte accessible) }.
export function visuelArme(donnees, arme, variante, { id = 'arme', titre = '' } = {}) {
  const v = variante ?? varianteDe(arme);
  const mat = v?.matieres ?? MATIERES_DEFAUT;
  const pieces = piecesArme(arme, v, 'caisse', { epaisseur: donnees.echelle?.epaisseur ?? 1, seuil: donnees.echelle?.seuilEpaisseur ?? 60 });
  // Du plus loin au plus près : le profil droit est vu depuis −x, donc les x les plus grands d'abord.
  const formes = pieces.map((p) => ({ p, c: contour(p), x: (p.pos?.[0] ?? 0) })).filter((f) => f.c.length >= 3).sort((a, b) => b.x - a.x);
  let zmin = Infinity;
  let zmax = -Infinity;
  let ymin = Infinity;
  let ymax = -Infinity;
  for (const f of formes) for (const [z, y] of f.c) { zmin = Math.min(zmin, z); zmax = Math.max(zmax, z); ymin = Math.min(ymin, y); ymax = Math.max(ymax, y); }
  const k = Math.min((LARGEUR - 2 * MARGE) / Math.max(1, zmax - zmin), (HAUTEUR - 2 * MARGE) / Math.max(1, ymax - ymin));
  const ox = (LARGEUR - (zmax - zmin) * k) / 2;
  const oy = (HAUTEUR - (ymax - ymin) * k) / 2;
  const X = (z) => r1(ox + (z - zmin) * k);
  const Y = (y) => r1(HAUTEUR - oy - (y - ymin) * k);
  const chemins = [];
  const defs = [];
  formes.forEach((f, i) => {
    const tuile = mat[f.p.mat] ?? MATIERES_DEFAUT[f.p.mat] ?? 'bruni';
    const d = `M${f.c.map(([z, y]) => `${X(z)} ${Y(y)}`).join('L')}Z`;
    chemins.push(`<path class="arm-t-${tuile}" d="${d}"/>`);
    // Veines du bois : quelques traits le long de la pièce, coupés à sa forme.
    if (['noyer', 'hetre'].includes(tuile)) {
      const ys = f.c.map((q) => q[1]);
      const [a, b] = [Math.min(...ys), Math.max(...ys)];
      const zs = f.c.map((q) => q[0]);
      const [za, zb] = [X(Math.min(...zs)), X(Math.max(...zs))];
      defs.push(`<clipPath id="${id}-c${i}"><path d="${d}"/></clipPath>`);
      const traits = [0.3, 0.55, 0.78].map((t) => `M${za} ${Y(a + (b - a) * t)}Q${r1((za + zb) / 2)} ${Y(a + (b - a) * (t + 0.08))} ${zb} ${Y(a + (b - a) * (t - 0.04))}`).join('');
      chemins.push(`<path class="arm-veine" clip-path="url(#${id}-c${i})" d="${traits}"/>`);
    }
    // Reflet peint : l'arête haute de la pièce.
    const haut = [...f.c].sort((p, q) => q[1] - p[1]).slice(0, 2).sort((p, q) => p[0] - q[0]);
    if (haut.length === 2 && Math.abs(X(haut[1][0]) - X(haut[0][0])) > 6) chemins.push(`<path class="arm-reflet" d="M${X(haut[0][0])} ${r1(Y(haut[0][1]) + 1.4)}L${X(haut[1][0])} ${r1(Y(haut[1][1]) + 1.4)}"/>`);
  });
  const t = String(titre).replace(/[<>&"]/g, '');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" class="arm-svg" viewBox="0 0 ${LARGEUR} ${HAUTEUR}" role="img" aria-labelledby="${id}-t"><title id="${id}-t">${t}</title>${defs.length ? `<defs>${defs.join('')}</defs>` : ''}<g class="arm-trait">${chemins.join('')}</g></svg>`;
  return { svg, octets: new TextEncoder().encode(svg).length };
}
