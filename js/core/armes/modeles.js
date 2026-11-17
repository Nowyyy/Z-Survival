// Lot 9c — Modèles des armes : une fonction pure par arme, (dimensions en mm, options de la variante) → liste de pièces
// (js/core/armes/geometrie.js). Repère : origine à la main droite (poignée), z vers la bouche, y vers le haut, x à gauche de l'arme
// (la droite du tireur est −x : levier de culasse, fenêtre d'éjection). Pièces du groupe « dos » (réservoirs du lance-flammes) : placées
// à part (js/core/armes/armes.js). Rôles de matière : metal, metal2, bois, poignee, cuir, toile, laiton, peinture, peinture2, perfore,
// caoutchouc, noir.

const num = (v, d) => (Number.isFinite(v) ? v : d);

// Raccourcis de pièces.
export const boite = (w, h, l, pos, mat, extra = {}) => ({ forme: 'boite', w, h, l, pos, mat, ...extra });
export const tube = (r, l, pos, mat, extra = {}) => ({ forme: 'tube', r, l, pos, mat, seg: 8, ...extra });
export const profil = (pts, e, x, mat, extra = {}) => ({ forme: 'profil', pts, e, pos: [x, 0, 0], mat, ...extra });
export const loft = (sections, mat, extra = {}) => ({ forme: 'loft', sections, mat, seg: 4, ...extra });

// Pontet en U (côté), ouvert en haut : (z0 avant, z1 arrière, y0 haut, profondeur, épaisseur du trait).
function pontet(zAvant, zArriere, yHaut, prof, trait, e, x = 0, mat = 'metal') {
  const yb = yHaut - prof;
  return profil([
    [zAvant, yHaut], [zAvant - 2, yb + 6], [zAvant - 8, yb], [zArriere + 4, yb], [zArriere, yb + 8], [zArriere, yHaut],
    [zArriere + trait, yHaut], [zArriere + trait, yb + 8 + trait * 0.4], [zArriere + 4 + trait * 0.6, yb + trait], [zAvant - 8, yb + trait], [zAvant - 2 - trait, yb + 6 + trait * 0.4], [zAvant - trait, yHaut],
  ], e, x, mat);
}

// --- Colt M1911 (216 mm) --------------------------------------------------------------------------------------------------------------
function m1911(d) {
  const L = num(d.longueur, 216);
  const zA = -54; // arrière de la glissière (chien et queue de castor : 8 de plus vers l'arrière)
  const zB = zA + L - 14; // bouche
  const yb = 44; // axe du canon au-dessus de la main
  return [
    boite(23, 28, zB - zA, [0, yb + 6, (zA + zB) / 2], 'metal'), // glissière
    boite(21, 16, 150, [0, yb - 14, zA + 85], 'metal'), // carcasse
    tube(7.5, 55, [0, yb - 8, zB - 32], 'metal', { seg: 6 }), // cache du ressort de rappel
    tube(8.5, 7, [0, yb - 2, zB - 2], 'metal2', { seg: 6 }), // bague du canon
    profil([[-2, 34], [-26, -50], [-60, -54], [-63, -46], [-48, 26], [-66, 34], [-50, 40]], 22, 0, 'metal'), // carcasse de la poignée et queue de castor
    profil([[-8, 22], [-28, -40], [-55, -44], [-46, 20]], 30, 0, 'poignee'), // plaquettes de crosse
    boite(22, 6, 30, [0, -54, -42], 'metal2', { rot: [-16, 0, 0] }), // fond de chargeur
    pontet(28, -6, yb - 22, 22, 4, 9),
    boite(5, 12, 4, [0, yb - 28, 2], 'metal2', { rot: [10, 0, 0] }), // détente
    boite(8, 13, 7, [0, yb + 12, zA - 3], 'metal2', { rot: [-25, 0, 0] }), // chien
    boite(5, 4, 6, [0, yb + 22, zB - 10], 'metal'), // guidon
    boite(14, 5, 6, [0, yb + 22, zA + 8], 'metal'), // hausse
    boite(1.5, 11, 46, [-11.8, yb + 8, zA + 120], 'noir'), // fenêtre d'éjection (droite)
    boite(4, 5, 22, [12.5, yb - 6, zA + 22], 'metal2'), // sûreté (gauche)
    boite(3.5, 5, 18, [12, yb - 12, zA + 92], 'metal2'), // arrêtoir de culasse (gauche)
  ];
}

// --- Mauser Kar98k (1 110 mm) ---------------------------------------------------------------------------------------------------------
function kar98k(d, o) {
  const L = num(d.longueur, 1110);
  const zC = -420; // talon de crosse
  const zB = zC + L; // bouche
  const yb = 30; // axe du canon
  const fut = zB - 140; // fin du fût (embouchoir)
  const p = [
    loft([
      { z: zC, w: 42, h: 128, y: -42 }, { z: zC + 170, w: 38, h: 84, y: -20 }, { z: -95, w: 28, h: 44, y: -2 },
      { z: -20, w: 34, h: 62, y: 2 }, { z: 160, w: 36, h: 48, y: 12 }, { z: fut, w: 30, h: 30, y: 18 },
    ], 'bois', { seg: 8 }), // crosse et fût
    loft([{ z: 250, w: 26, h: 12, y: yb + 10 }, { z: fut - 90, w: 22, h: 10, y: yb + 9 }], 'bois', { bouts: 'deux' }), // garde-main supérieur
    boite(44, 128, 8, [0, -42, zC - 3], 'metal'), // plaque de couche
    tube(15, 190, [0, yb, 40], 'metal', { seg: 8 }), // boîtier
    tube(8, zB - 135 - 20, [0, yb, (135 + zB + 20) / 2 - 20], 'metal', { r2: 7, seg: 6 }), // canon
    tube(10, 60, [0, yb + 2, -85], 'metal2', { seg: 6 }), // culasse et chien (arrière)
    boite(9, 7, 58, [-33, yb - 16, -52], 'metal2', { rot: [0, -75, 35] }), // levier de culasse coudé (droite)
    tube(8, 14, [-58, yb - 33, -45], 'metal2', { seg: 6, axe: 'x' }), // boule du levier
    boite(20, 6, 92, [0, -18, 40], 'metal'), // plaque de magasin
    pontet(-6, -66, -18, 26, 5, 10),
    boite(5, 14, 4, [0, -28, -40], 'metal2'), // détente
    tube(19, 18, [0, yb - 2, fut - 230], 'metal', { seg: 8, bouts: 'aucun' }), // grenadière
    tube(18, 50, [0, yb - 3, fut + 15], 'metal', { seg: 8 }), // embouchoir
    boite(8, 15, 12, [0, yb + 12, zB - 18], 'metal'), // guidon et son tunnel
    boite(20, 9, 70, [0, yb + 15, 175], 'metal'), // hausse à gradins
    boite(6, 8, 22, [0, yb - 14, fut + 40], 'metal2'), // tenon de baïonnette
  ];
  if (o.bretelle) {
    p.push(loft([
      { z: zC + 140, w: 22, h: 3, y: -82, x: 22 }, { z: zC + 330, w: 22, h: 3, y: -98, x: 24 }, { z: 160, w: 22, h: 3, y: -96, x: 24 }, { z: fut - 220, w: 22, h: 3, y: -12, x: 22 },
    ], 'cuir'));
  }
  return p;
}

// --- Thompson M1928 (852 mm) ----------------------------------------------------------------------------------------------------------
function thompson(d, o) {
  const L = num(d.longueur, 852);
  const zC = -390;
  const zB = zC + L;
  const yb = 42;
  const p = [
    loft([{ z: zC, w: 40, h: 125, y: -40 }, { z: zC + 140, w: 36, h: 82, y: -16 }, { z: -128, w: 30, h: 50, y: 12 }], 'bois', { seg: 8 }), // crosse
    boite(42, 125, 7, [0, -40, zC - 3], 'metal'), // plaque de couche
    boite(34, 40, 270, [0, yb - 6, 10], 'metal'), // boîtier
    tube(16, 240, [0, yb + 8, 10], 'metal', { seg: 8 }), // dessus arrondi du boîtier
    tube(15, 160, [0, yb + 2, 220], 'metal', { seg: 8, bouts: 'avant' }), // canon à ailettes
    tube(9, zB - 300 - 50, [0, yb + 2, (300 + zB - 50) / 2], 'metal', { seg: 6 }), // canon
    tube(13, 55, [0, yb + 2, zB - 27], 'metal', { seg: 6 }), // compensateur Cutts
    profil([[-30, 20], [-48, -82], [-86, -86], [-80, 20]], 30, 0, 'bois'), // poignée-pistolet
    profil([[268, yb - 18], [255, -78], [228, -82], [232, yb - 18]], 30, 0, 'bois'), // poignée avant verticale
    pontet(-2, -40, 18, 24, 5, 9),
    boite(5, 12, 4, [0, 8, -20], 'metal2'),
    boite(10, 10, 20, [0, yb + 28, -90], 'metal'), // hausse Lyman
    boite(4, 9, 6, [0, yb + 18, zB - 60], 'metal'), // guidon
    tube(5, 16, [0, yb + 26, 60], 'metal2', { seg: 6, axe: 'y' }), // bouton d'armement
    boite(4, 8, 26, [18, yb - 10, -60], 'metal2'), // sélecteurs (gauche)
  ];
  if (o.chargeur === 'camembert') p.push(tube(82, 42, [0, yb - 106, 72], 'metal', { seg: 12, axe: 'x' })); // chargeur camembert (50)
  else p.push(boite(22, 150, 40, [0, yb - 98, 72], 'metal', { rot: [4, 0, 0] })); // chargeur droit (20)
  return p;
}

export const MODELES = Object.freeze({ m1911, kar98k, thompson });
