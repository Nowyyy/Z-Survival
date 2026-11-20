// Lot 8g (retours du propriétaire) : avatars du joueur, communs au Profil (js/menu/compte.js) et à l'en-tête du menu (js/menu/menu.js, en haut à
// gauche : portrait et pseudo). Liste des avatars (d'après le personnage du jeu et les zombies ; d'autres viendront), portrait dessiné en code (couleurs
// des personnages : jetons --perso-* posés par css/menu.css) et avatar et pseudo choisis : lot 8h, gardés dans la progression v2 (zs.save.v2,
// brancherProfil, appelé par menu.js) ; sans progression branchée (créateur de test), en mémoire de la page. Aucun accès au document à l'import.
const SVG = 'http://www.w3.org/2000/svg';

// Type neutre, joueur ou zombie, tenue (détails du dessin). « Changer d'avatar » passe au suivant. Retour du propriétaire : image par défaut = un
// personnage tout gris (silhouette sans visage), premier de la liste.
// Lot 9g : soldats de la Seconde Guerre mondiale, comme en partie (mêmes identifiants, gardés dans la sauvegarde) ; aucun insigne ni symbole.
export const AVATARS = Object.freeze([
  Object.freeze({ id: 'anonyme', type: 'neutre', tenue: 'silhouette' }), // par défaut : silhouette grise, sans visage ni tenue
  Object.freeze({ id: 'survivant', type: 'joueur', tenue: 'fantassin' }), // Survivant : casque M1 gris à jugulaire, veste sable, bretelles
  Object.freeze({ id: 'eclaireur', type: 'joueur', tenue: 'radio' }), // parachutiste radio : casque à filet, antenne du poste dorsal, veste verte
  Object.freeze({ id: 'tireur', type: 'joueur', tenue: 'camoufle' }), // Marine : couvre-casque et veste camouflés
  Object.freeze({ id: 'rodeur', type: 'zombie', tenue: 'casque35' }), // zombie soldat casqué (casque modèle 1935), veste gris-vert
  Object.freeze({ id: 'ouvrier', type: 'zombie', tenue: 'sapeur' }), // zombie sapeur : calot, bretelles en Y, pelle à l'épaule
  Object.freeze({ id: 'affame', type: 'zombie', tenue: 'capote' }), // zombie tête nue, capote au col relevé
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

// { avatar, pseudo (null = défaut) } ; poserProfil prévient les abonnés (en-tête, Profil). Lot 8h : progression branchée (brancherProfil), chaque
// changement est écrit (opération « choix » de js/core/progression.js) ; un autre onglet qui écrit met l'en-tête et le Profil à jour.
const memoire = { avatar: AVATARS[0].id, pseudo: null };
const abonnes = new Set();
let progression = null;
export const lireProfil = () => ({ ...memoire });
const prevenir = () => {
  for (const f of abonnes) f(lireProfil());
};
function relire(profil) {
  memoire.avatar = avatarDe(profil?.avatar).id;
  memoire.pseudo = typeof profil?.pseudo === 'string' && profil.pseudo !== '' ? profil.pseudo : null;
}
export function poserProfil({ avatar = memoire.avatar, pseudo = memoire.pseudo } = {}) {
  const avant = lireProfil();
  relire({ avatar, pseudo });
  if (progression) {
    if (memoire.avatar !== avant.avatar) progression.choisir('avatar', memoire.avatar);
    if (memoire.pseudo !== avant.pseudo) progression.choisir('pseudo', memoire.pseudo);
  }
  prevenir();
  return lireProfil();
}
// prog : progression du menu (js/menu/progression-etat.js) : { lire(), choisir(champ, valeur), abonner(f) }.
export function brancherProfil(prog) {
  progression = prog;
  relire(prog.lire()?.save?.profil);
  prog.abonner((save) => {
    const avant = lireProfil();
    relire(save?.profil);
    if (memoire.avatar !== avant.avatar || memoire.pseudo !== avant.pseudo) prevenir();
  });
}
// Lot 9d : menu détruit (« JOUER ») : abonnés (en-tête, Profil) et progression oubliés ; le menu suivant rebranche les siens.
export function oublierProfil() {
  abonnes.clear();
  progression = null;
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
// couleurs par classes (av-peau, av-habit, av-acc, av-sombre, av-yeux, av-sang, av-casque, av-filet, av-camo, av-antenne, av-col), dont css/menu.css
// donne les jetons de chaque avatar. Lot 9g : tenues d'époque.
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
  if (t === 'radio') g.append(svgEl('path', { d: 'M44 46L54 4' }, 'av-antenne'), svgEl('rect', { x: 14, y: 42, width: 36, height: 12, rx: 3 }, 'av-sombre'));
  g.append(svgEl('path', { d: BUSTE }, 'av-habit'), svgEl('rect', { x: 27, y: 37, width: 10, height: 10 }, 'av-peau'));
  // Tenue (buste) : bretelles, harnais, col, camouflage, bretelles en Y et pelle, col de capote ; sang sur les zombies.
  if (t === 'fantassin') g.append(svgEl('path', { d: 'M24 46L26 64M40 46L38 64' }, 'av-trait'));
  if (t === 'radio') g.append(svgEl('path', { d: 'M24 46L30 64M40 46L34 64' }, 'av-trait'), svgEl('rect', { x: 16, y: 52, width: 8, height: 7, rx: 1 }, 'av-acc'), svgEl('rect', { x: 40, y: 52, width: 8, height: 7, rx: 1 }, 'av-acc'));
  if (t === 'camoufle') g.append(svgEl('path', { d: 'M13 58C16 54 20 56 21 60ZM44 50C47 48 51 51 50 55C47 55 45 53 44 50ZM30 56C33 54 36 57 34 60C32 61 30 59 30 56Z' }, 'av-camo'), svgEl('path', { d: 'M24 45L32 52L40 45' }, 'av-trait'));
  if (t === 'casque35') g.append(svgEl('path', { d: 'M24 45L32 51L40 45L39 48L32 54L25 48Z' }, 'av-col'), svgEl('path', { d: 'M14 64L18 58L22 64L27 57L31 64' }, 'av-trait'));
  if (t === 'sapeur') g.append(svgEl('path', { d: 'M23 46L30 64M41 46L34 64M30 58H34' }, 'av-trait'), svgEl('path', { d: 'M47 42L52 64M45 40L50 38L51 44Z' }, 'av-acc'));
  if (t === 'capote') g.append(svgEl('path', { d: 'M20 47L27 40L32 50L37 40L44 47L40 52L32 56L24 52Z' }, 'av-col'), svgEl('circle', { cx: 21, cy: 58, r: 2.4 }, 'av-sang'));
  // Tête.
  tete.append(svgEl('ellipse', { cx: 32, cy: 28, rx: 11.5, ry: 13 }, 'av-peau'));
  if (t === 'fantassin' || t === 'radio' || t === 'camoufle') {
    // Casque M1 (dôme et bord étroit) ; filet (radio), taches de camouflage (Marine) ; jugulaire (fantassin).
    tete.append(svgEl('path', { d: 'M19 26C19 11 45 11 45 26L48 28H16Z' }, 'av-casque'));
    if (t === 'radio') tete.append(svgEl('path', { d: 'M22 20H42M20 25H44M27 13L25 27M32 12V27M37 13L39 27' }, 'av-filet'));
    if (t === 'camoufle') tete.append(svgEl('path', { d: 'M23 19C25 16 28 17 28 20C26 21 24 21 23 19ZM34 15C37 14 39 16 38 18C36 19 34 18 34 15ZM38 23C41 22 43 24 42 26H38Z' }, 'av-camo'));
    if (t === 'fantassin') tete.append(svgEl('path', { d: 'M21 28L24 39M43 28L40 39' }, 'av-trait'));
  }
  if (t === 'casque35') tete.append(svgEl('path', { d: 'M19 25C19 10 45 10 45 25L49 31L43 28H21L15 31Z' }, 'av-casque'));
  if (t === 'sapeur') tete.append(svgEl('path', { d: 'M21 20L24 13H41L44 20Z' }, 'av-casque'), svgEl('path', { d: 'M20 24C20 21 22 20 24 21L23 26ZM44 24C44 21 42 20 40 21L41 26Z' }, 'av-sombre'));
  if (t === 'capote') tete.append(svgEl('path', { d: 'M21 25C21 15 30 13 36 15C41 16 44 20 43 26L40 21L36 23L33 19L29 22L25 20Z' }, 'av-sombre'));
  if (zombie) {
    // Yeux luisants, cernes, bouche entrouverte, sang au menton.
    tete.append(
      svgEl('ellipse', { cx: 27, cy: 29, rx: 3.4, ry: 2.6 }, 'av-sombre'), svgEl('ellipse', { cx: 37, cy: 29, rx: 3.4, ry: 2.6 }, 'av-sombre'),
      svgEl('circle', { cx: 27, cy: 29, r: t === 'capote' ? 2.2 : 1.6 }, 'av-yeux'), svgEl('circle', { cx: 37, cy: 29, r: 1.6 }, 'av-yeux'),
      svgEl('path', { d: 'M26 35.5L28.5 34L30.5 36.5L32.5 34L34.5 36.5L37 35L36 38.5H27Z' }, 'av-sombre'),
      svgEl('path', { d: 'M29 38.5C29 41 30 43 31 43S32 41 32 38.5Z' }, 'av-sang'));
  } else {
    tete.append(svgEl('circle', { cx: 27.5, cy: 30, r: 1.6 }, 'av-sombre'), svgEl('circle', { cx: 36.5, cy: 30, r: 1.6 }, 'av-sombre'));
    tete.append(svgEl('path', { d: 'M28.5 36Q32 38 35.5 36' }, 'av-trait'));
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
