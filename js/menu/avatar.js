// Lot 8g (retours du propriétaire) : avatars du joueur, communs au Profil (js/menu/compte.js) et à l'en-tête du menu (js/menu/menu.js, en haut à
// gauche : portrait et pseudo). Liste des avatars (d'après le personnage du jeu et les zombies ; d'autres viendront), portrait dessiné en code (couleurs
// des personnages : jetons --perso-* posés par css/menu.css) et mémoire de la page (avatar et pseudo choisis) : rien n'est écrit jusqu'au lot 8h, le
// retour au menu les remet par défaut. Aucun accès au document à l'import (Vitest lit la liste et la mémoire).
const SVG = 'http://www.w3.org/2000/svg';

// Type neutre, joueur ou zombie, tenue (détails du dessin). « Changer d'avatar » passe au suivant. Retour du propriétaire : image par défaut = un
// personnage tout gris (silhouette sans visage), premier de la liste.
export const AVATARS = Object.freeze([
  Object.freeze({ id: 'anonyme', type: 'neutre', tenue: 'silhouette' }), // par défaut : silhouette grise, sans visage ni tenue
  Object.freeze({ id: 'survivant', type: 'joueur', tenue: 'bandana' }), // joueur A : veste tactique sable, bandana rouge
  Object.freeze({ id: 'eclaireur', type: 'joueur', tenue: 'capuche' }), // joueur B : sweat à capuche gris, lampe frontale
  Object.freeze({ id: 'tireur', type: 'joueur', tenue: 'veste' }), // joueur C : veste turquoise
  Object.freeze({ id: 'rodeur', type: 'zombie', tenue: 'chemise' }), // zombie à la peau cendre, chemise déchirée
  Object.freeze({ id: 'ouvrier', type: 'zombie', tenue: 'chantier' }), // zombie de chantier : casque jaune, gilet orange
  Object.freeze({ id: 'affame', type: 'zombie', tenue: 'sweat' }), // zombie à la peau jaunie, sweat gris
]);
export function avatarSuivant(id) {
  const i = AVATARS.findIndex((a) => a.id === id);
  return AVATARS[(i + 1) % AVATARS.length];
}
export const avatarDe = (id) => AVATARS.find((a) => a.id === id) ?? AVATARS[0];
export const NOMS_AVATARS = Object.freeze({
  anonyme: 'game.menu.profil.avatar.anonyme', survivant: 'game.menu.profil.avatar.survivant', eclaireur: 'game.menu.profil.avatar.eclaireur', tireur: 'game.menu.profil.avatar.tireur',
  rodeur: 'game.menu.profil.avatar.rodeur', ouvrier: 'game.menu.profil.avatar.ouvrier', affame: 'game.menu.profil.avatar.affame',
});

// Mémoire de la page : { avatar, pseudo (null = défaut) } ; poserProfil prévient les abonnés (en-tête, Profil).
const memoire = { avatar: AVATARS[0].id, pseudo: null };
const abonnes = new Set();
export const lireProfil = () => ({ ...memoire });
export function poserProfil({ avatar = memoire.avatar, pseudo = memoire.pseudo } = {}) {
  memoire.avatar = avatarDe(avatar).id;
  memoire.pseudo = typeof pseudo === 'string' && pseudo !== '' ? pseudo : null;
  for (const f of abonnes) f(lireProfil());
  return lireProfil();
}
export function suivreProfil(f) {
  abonnes.add(f);
  return () => abonnes.delete(f);
}

function svgEl(tag, attrs = {}, classe = null) {
  const n = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, String(v));
  if (classe) n.setAttribute('class', classe);
  return n;
}

// Portraits d'avatar (64 × 64, retour du propriétaire : d'après le personnage du jeu et les zombies) : buste, cou, tête, puis détails de la tenue ;
// couleurs par classes (av-peau, av-habit, av-acc, av-sombre, av-yeux, av-sang, av-lampe), dont css/menu.css donne les jetons de chaque avatar.
const BUSTE = 'M6 64C6 50 17 44 32 44s26 6 26 20Z';
export function portrait(avatar) {
  const g = svgEl('g');
  const zombie = avatar.type === 'zombie';
  const tete = svgEl('g', zombie ? { transform: 'rotate(-7 32 30)' } : {});
  const t = avatar.tenue;
  if (t === 'silhouette') {
    // Avatar par défaut : buste et tête gris, sans aucun détail.
    g.append(svgEl('path', { d: BUSTE }, 'av-habit'), svgEl('ellipse', { cx: 32, cy: 27, rx: 12, ry: 13.5 }, 'av-peau'));
    return g;
  }
  if (t === 'capuche') g.append(svgEl('path', { d: 'M17 33C16 13 48 13 47 33L49 47H15Z' }, 'av-habit'));
  g.append(svgEl('path', { d: BUSTE }, 'av-habit'), svgEl('rect', { x: 27, y: 37, width: 10, height: 10 }, 'av-peau'));
  // Tenue (buste).
  if (t === 'bandana' || t === 'veste') g.append(svgEl('path', { d: 'M24 46L28 64M40 46L36 64' }, 'av-trait'));
  if (t === 'veste') g.append(svgEl('path', { d: 'M24 45L32 54L40 45' }, 'av-col'));
  if (t === 'chemise') g.append(svgEl('path', { d: 'M24 45L32 52L40 45M14 64L18 58L22 64L27 57L31 64' }, 'av-trait'));
  if (t === 'chantier') g.append(svgEl('path', { d: 'M15 50L23 46L27 64H17ZM49 50L41 46L37 64H47Z' }, 'av-acc'));
  if (t === 'sweat') g.append(svgEl('path', { d: 'M44 64L46 56L49 60L51 54' }, 'av-trait'), svgEl('circle', { cx: 21, cy: 56, r: 2.4 }, 'av-sang'));
  // Tête.
  tete.append(svgEl('ellipse', { cx: 32, cy: 28, rx: 11.5, ry: 13 }, 'av-peau'));
  if (t === 'bandana' || t === 'veste') tete.append(svgEl('path', { d: 'M20.5 27C19 13 45 13 43.5 27C40 19 24 19 20.5 27Z' }, 'av-sombre'));
  if (t === 'capuche') tete.append(svgEl('rect', { x: 23, y: 15.5, width: 18, height: 3, rx: 1.5 }, 'av-sombre'), svgEl('circle', { cx: 32, cy: 17, r: 3 }, 'av-lampe'));
  if (t === 'chantier') tete.append(svgEl('path', { d: 'M19 24C19 11 45 11 45 24Z' }, 'av-acc2'), svgEl('rect', { x: 16, y: 22, width: 32, height: 3.5, rx: 1.5 }, 'av-acc2'));
  if (t === 'chemise' || t === 'sweat') tete.append(svgEl('path', { d: 'M21 25C21 15 30 13 36 15C41 16 44 20 43 26L40 21L36 23L33 19L29 22L25 20Z' }, 'av-sombre'));
  if (zombie) {
    // Yeux luisants, cernes, bouche entrouverte, sang au menton.
    tete.append(
      svgEl('ellipse', { cx: 27, cy: 29, rx: 3.4, ry: 2.6 }, 'av-sombre'), svgEl('ellipse', { cx: 37, cy: 29, rx: 3.4, ry: 2.6 }, 'av-sombre'),
      svgEl('circle', { cx: 27, cy: 29, r: t === 'sweat' ? 2.2 : 1.6 }, 'av-yeux'), svgEl('circle', { cx: 37, cy: 29, r: 1.6 }, 'av-yeux'),
      svgEl('path', { d: 'M26 35.5L28.5 34L30.5 36.5L32.5 34L34.5 36.5L37 35L36 38.5H27Z' }, 'av-sombre'),
      svgEl('path', { d: 'M29 38.5C29 41 30 43 31 43S32 41 32 38.5Z' }, 'av-sang'));
  } else {
    tete.append(svgEl('circle', { cx: 27.5, cy: 28, r: 1.6 }, 'av-sombre'), svgEl('circle', { cx: 36.5, cy: 28, r: 1.6 }, 'av-sombre'));
    if (t === 'bandana') tete.append(svgEl('rect', { x: 20.5, y: 32, width: 23, height: 6.5, rx: 1 }, 'av-acc'), svgEl('path', { d: 'M43 33L50 35L44 38Z' }, 'av-acc'));
    else tete.append(svgEl('path', { d: 'M28.5 35Q32 37 35.5 35' }, 'av-trait'));
  }
  g.append(tete);
  return g;
}

// Portrait complet (<svg> 64 × 64, décoratif) d'un avatar, dans un cercle mis en forme par css/menu.css (classe e10-avatar-<id>).
export function svgPortrait(id, classe = 'e10-avatar-svg') {
  const svg = svgEl('svg', { viewBox: '0 0 64 64', 'aria-hidden': 'true', focusable: 'false' }, classe);
  svg.append(portrait(avatarDe(id)));
  return svg;
}
