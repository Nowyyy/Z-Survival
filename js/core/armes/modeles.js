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
// Retour du propriétaire après le lot 9e : pièces du chargeur (chargeur: vrai), reprises telles quelles pour le chargeur qui tombe au sol en
// partie (maillageChargeur de js/core/armes/armes.js) ; seulChargeur : pièce cachée dans l'arme (corps du chargeur dans la poignée du Colt,
// clip du Garand dans le boîtier), jamais dessinée sur l'arme, seulement dans le chargeur lâché.
const ch = (p) => ({ ...p, chargeur: true });
const cache = (p) => ({ ...p, chargeur: true, seulChargeur: true });
// Partie L : pièces du verrou (Kar98k : culasse, levier, boule), dessinées à part pour être animées (levier relevé, culasse tirée).
const vr = (p) => ({ ...p, verrou: true });

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
    ch(boite(22, 6, 30, [0, -54, -42], 'metal2', { rot: [-16, 0, 0] })), // fond de chargeur
    cache(boite(20, 104, 28, [0, -4, -28], 'metal', { rot: [-16, 0, 0] })), // corps du chargeur (dans la poignée)
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
    vr(tube(10, 60, [0, yb + 2, -85], 'metal2', { seg: 6 })), // culasse et chien (arrière)
    vr(boite(9, 7, 58, [-33, yb - 16, -52], 'metal2', { rot: [0, -75, 35] })), // levier de culasse coudé (droite)
    vr(tube(8, 14, [-58, yb - 33, -45], 'metal2', { seg: 6, axe: 'x' })), // boule du levier
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
    ], 'cuir', { groupe: 'bretelle' }));
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
  if (o.chargeur === 'camembert') p.push(ch(tube(82, 42, [0, yb - 106, 72], 'metal', { seg: 12, axe: 'x' }))); // chargeur camembert (50)
  else p.push(ch(boite(22, 150, 40, [0, yb - 98, 72], 'metal', { rot: [4, 0, 0] }))); // chargeur droit (20)
  return p;
}

// Boîte de section e × e tendue entre deux points a et b (bipieds, bretelles, tuyaux).
export function barre(a, b, e, mat, extra = {}) {
  const d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const L = Math.hypot(d[0], d[1], d[2]) || 1;
  const rot = [(-Math.asin(d[1] / L) * 180) / Math.PI, (Math.atan2(d[0], d[2]) * 180) / Math.PI, 0];
  return { forme: 'boite', w: e, h: e, l: L, pos: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2], rot, mat, ...extra };
}

// Bipied déplié : deux jambes écartées vers l'avant depuis un collier (z, y), patins au bout ; replié : jambes le long du canon.
function bipied(z, y, longueur, ecart, deplie, mat = 'metal2') {
  if (!deplie) return [-1, 1].map((s) => barre([s * 12, y - 6, z], [s * 14, y - 10, z - longueur], 8, mat));
  return [-1, 1].flatMap((s) => {
    const pied = [s * ecart, y - longueur * 0.9, z + longueur * 0.25];
    return [barre([s * 10, y - 4, z], pied, 9, mat), boite(16, 5, 26, [pied[0], pied[1] - 2, pied[2]], mat)];
  });
}

// --- Winchester M1897 « trench gun » (1 003 mm ; avec baïonnette M1917 : longueurAvecAccessoire) -------------------------------------
function winchester1897(d, o) {
  const L = num(d.longueur, 1003);
  const zC = -370;
  const zB = zC + L;
  const yb = 36;
  const p = [
    loft([{ z: zC, w: 40, h: 124, y: -40 }, { z: zC + 150, w: 36, h: 80, y: -20 }, { z: -70, w: 28, h: 42, y: 0 }, { z: -18, w: 32, h: 48, y: 6 }], 'bois', { seg: 8 }), // crosse droite
    boite(42, 124, 7, [0, -40, zC - 3], 'metal'), // plaque de couche
    boite(30, 62, 200, [0, yb - 12, 82], 'metal'), // boîtier
    boite(8, 14, 12, [0, yb + 22, -12], 'metal2', { rot: [-30, 0, 0] }), // chien apparent
    tube(10.5, zB - 182, [0, yb, (182 + zB) / 2], 'metal', { seg: 6 }), // canon
    tube(10, 380, [0, yb - 22, 372], 'metal', { seg: 6 }), // tube magasin
    loft([{ z: 250, w: 36, h: 34, y: yb - 22 }, { z: 268, w: 40, h: 38, y: yb - 22 }, { z: 410, w: 40, h: 38, y: yb - 22 }, { z: 425, w: 36, h: 34, y: yb - 22 }], 'bois', { seg: 8 }), // garde-main à pompe
    tube(17, 300, [0, yb + 3, 445], 'perfore', { seg: 8, bouts: 'aucun' }), // cache-canon perforé
    boite(22, 14, 40, [0, yb - 14, zB - 18], 'metal2'), // tenon de baïonnette
    tube(3, 5, [0, yb + 12, zB - 8], 'laiton', { seg: 4, axe: 'y' }), // guidon (perle)
    pontet(-2, -62, yb - 42, 24, 5, 10),
    boite(5, 14, 4, [0, yb - 50, -30], 'metal2'),
    boite(2, 22, 70, [-15.5, yb - 6, 70], 'noir'), // fenêtre d'éjection (droite)
  ];
  if (o.baionnette) {
    const lame = 432;
    p.push(boite(5, 24, lame, [0, yb - 14, zB - 40 + lame / 2], 'metal', { rot: [0, 0, 0] }), boite(10, 34, 8, [0, yb - 12, zB - 36], 'metal2'));
  }
  return p;
}

// --- M1 Garand (1 107 mm) -----------------------------------------------------------------------------------------------------------------
function garand(d, o) {
  const L = num(d.longueur, 1107);
  const zC = -400;
  const zB = zC + L - 14; // guidon et oreilles dépassent de la bouche
  const yb = 30;
  const p = [
    loft([
      { z: zC, w: 42, h: 125, y: -40 }, { z: zC + 160, w: 38, h: 86, y: -22 }, { z: -80, w: 30, h: 46, y: -3 }, { z: -20, w: 36, h: 62, y: 2 },
      { z: 150, w: 38, h: 54, y: 10 }, { z: 420, w: 34, h: 36, y: 16 }, { z: zB - 230, w: 32, h: 34, y: 16 },
    ], 'bois', { seg: 8 }), // crosse et fût d'une pièce
    loft([{ z: 120, w: 26, h: 14, y: yb + 9 }, { z: 255, w: 24, h: 13, y: yb + 9 }], 'bois'), // garde-main arrière
    loft([{ z: 300, w: 26, h: 14, y: yb + 8 }, { z: zB - 150, w: 24, h: 12, y: yb + 7 }], 'bois'), // garde-main avant
    boite(44, 125, 8, [0, -40, zC - 4], 'metal'), // plaque de couche
    boite(30, 38, 230, [0, yb - 2, 65], 'metal'), // boîtier
    boite(40, 16, 22, [0, yb + 22, -42], 'metal2'), // hausse à œilleton et ses molettes
    boite(10, 10, 60, [-19, yb - 4, 150], 'metal2'), // levier d'armement (droite)
    tube(9, zB - 180, [0, yb, (180 + zB) / 2], 'metal', { seg: 6, r2: 8 }), // canon
    tube(12, 90, [0, yb - 6, zB - 55], 'metal', { seg: 6 }), // cylindre à gaz
    tube(18, 22, [0, yb + 2, zB - 200], 'metal', { seg: 8, bouts: 'aucun' }), // grenadière
    ...[-1, 1].map((s) => boite(3, 14, 16, [s * 6, yb + 16, zB - 20], 'metal')), // oreilles du guidon protégé
    boite(3, 12, 8, [0, yb + 14, zB - 20], 'metal2'), // guidon
    pontet(10, -66, -18, 28, 6, 12),
    boite(5, 14, 4, [0, -28, -30], 'metal2'),
    cache(boite(24, 12, 58, [0, yb + 4, 60], 'metal2')), // clip en-bloc de 8 (dans le boîtier ; éjecté au dernier tir)
  ];
  if (o.bretelle) {
    p.push(loft([
      { z: zC + 150, w: 24, h: 3, y: -84, x: 23 }, { z: zC + 360, w: 24, h: 3, y: -104, x: 25 }, { z: 220, w: 24, h: 3, y: -100, x: 25 }, { z: zB - 220, w: 24, h: 3, y: -10, x: 22 },
    ], 'cuir', { groupe: 'bretelle' }));
  }
  return p;
}

// --- StG 44 (940 mm) ----------------------------------------------------------------------------------------------------------------------
function stg44(d) {
  const L = num(d.longueur, 940);
  const zC = -330;
  const zB = zC + L;
  const yb = 32;
  return [
    loft([{ z: zC, w: 38, h: 118, y: -36 }, { z: zC + 130, w: 32, h: 76, y: -10 }, { z: -112, w: 28, h: 46, y: 12 }], 'bois', { seg: 8 }), // crosse en bois
    boite(40, 118, 7, [0, -36, zC - 3], 'metal'), // plaque de couche
    loft([{ z: -112, w: 26, h: 50, y: yb - 6 }, { z: 0, w: 30, h: 56, y: yb - 6 }, { z: 232, w: 30, h: 52, y: yb - 6 }], 'metal'), // boîtier en tôle emboutie
    tube(13, 240, [0, yb + 14, 352], 'metal', { seg: 6 }), // tube à gaz au-dessus du canon
    loft([{ z: 232, w: 28, h: 36, y: yb - 2 }, { z: 340, w: 26, h: 32, y: yb - 2 }], 'metal'), // garde-main embouti
    tube(9, zB - 232, [0, yb, (232 + zB) / 2], 'metal', { seg: 6 }), // canon
    tube(11, 30, [0, yb, zB - 15], 'metal2', { seg: 6 }), // bague de bouche
    boite(10, 18, 16, [0, yb + 24, zB - 130], 'metal'), // guidon et son capot
    boite(14, 10, 40, [0, yb + 24, 130], 'metal'), // hausse à planchette
    profil([[-6, 2], [-30, -88], [-70, -92], [-60, 2]], 30, 0, 'poignee'), // poignée-pistolet
    ch(profil([[40, 0], [110, 0], [119, -48], [136, -96], [157, -148], [182, -196], [124, -210], [104, -160], [83, -104], [63, -52]], 26, 0, 'metal', { pos: [0, yb - 30, 0] })), // chargeur courbe (30)
    pontet(18, -26, -4, 22, 5, 9),
    boite(5, 12, 4, [0, -12, 0], 'metal2'),
    boite(22, 8, 12, [20, yb + 8, 150], 'metal2'), // levier d'armement (gauche)
  ];
}

// --- BAR M1918 (1 214 mm) -----------------------------------------------------------------------------------------------------------------
function bar(d, o) {
  const L = num(d.longueur, 1214);
  const zC = -430;
  const zB = zC + L - 12; // cache-flamme et pieds du bipied dépassent un peu
  const yb = 34;
  const p = [
    loft([{ z: zC, w: 42, h: 130, y: -42 }, { z: zC + 170, w: 38, h: 86, y: -22 }, { z: -90, w: 30, h: 46, y: -2 }, { z: -38, w: 32, h: 54, y: 4 }], 'bois', { seg: 8 }), // crosse
    boite(44, 130, 8, [0, -42, zC - 4], 'metal'), // plaque de couche
    boite(36, 72, 330, [0, yb - 14, 127], 'metal'), // boîtier massif
    ch(boite(30, 120, 72, [0, yb - 108, 150], 'metal', { rot: [-2, 0, 0] })), // chargeur droit (20) sous le boîtier
    loft([{ z: 292, w: 40, h: 44, y: yb - 14 }, { z: 520, w: 38, h: 40, y: yb - 14 }], 'bois', { seg: 8 }), // garde-main
    tube(10, 210, [0, yb - 22, 620], 'metal', { seg: 6 }), // cylindre à gaz
    tube(10, zB - 292, [0, yb, (292 + zB) / 2], 'metal', { seg: 6 }), // canon
    tube(13, 60, [0, yb, zB - 30], 'metal2', { seg: 6 }), // cache-flamme
    boite(12, 16, 30, [0, yb + 30, 0], 'metal2'), // hausse
    boite(4, 14, 8, [0, yb + 14, zB - 70], 'metal'), // guidon
    boite(24, 10, 16, [22, yb - 10, 210], 'metal2'), // levier d'armement (gauche)
    pontet(-14, -76, yb - 50, 26, 6, 12),
    boite(5, 14, 4, [0, yb - 58, -40], 'metal2'),
  ];
  if (o.bipied) p.push(tube(14, 30, [0, yb, zB - 90], 'metal2', { seg: 6, bouts: 'aucun' }), ...bipied(zB - 90, yb, 330, 120, true));
  return p;
}

// Bande de cartouches qui pend : segments plats (largeur = longueur d'une cartouche, le long de z) entre des points du plan x-y.
function bande(points, z, largeur = 80, epaisseur = 12, mat = 'laiton') {
  const p = [];
  for (let i = 0; i < points.length - 1; i += 1) {
    const [a, b] = [points[i], points[i + 1]];
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    p.push(boite(Math.hypot(dx, dy) + 4, epaisseur, largeur, [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, z], mat, { rot: [0, 0, (Math.atan2(dy, dx) * 180) / Math.PI] }));
  }
  return p;
}

// --- MG42 (1 220 mm) ----------------------------------------------------------------------------------------------------------------------
function mg42(d, o) {
  const L = num(d.longueur, 1220);
  const zC = -430;
  const zB = zC + L - 6;
  const yb = 40;
  const p = [
    loft([{ z: zC, w: 40, h: 120, y: -40 }, { z: zC + 130, w: 36, h: 80, y: -18 }, { z: -150, w: 32, h: 50, y: 12 }], 'poignee', { seg: 8 }), // crosse (bakélite)
    boite(42, 120, 8, [0, -40, zC - 4], 'metal'), // plaque de couche
    boite(40, 60, 320, [0, yb - 6, 10], 'metal'), // boîtier
    boite(44, 16, 190, [0, yb + 31, 70], 'metal2'), // couvercle d'alimentation
    loft([{ z: 170, w: 48, h: 52, y: yb + 2 }, { z: zB - 150, w: 42, h: 46, y: yb + 2 }], 'perfore'), // manchon perforé
    tube(20, 70, [0, yb + 2, zB - 115], 'metal', { r2: 14, seg: 8 }), // renforçateur de bouche
    tube(8, 80, [0, yb + 2, zB - 40], 'metal', { seg: 6 }), // bout du canon
    boite(6, 26, 8, [0, yb + 38, zB - 175], 'metal2'), // guidon repliable
    boite(14, 16, 40, [0, yb + 32, 175], 'metal2'), // hausse
    boite(12, 40, 60, [-26, yb - 2, 200], 'metal2'), // levier de changement de canon (droite)
    boite(18, 12, 26, [-26, yb - 10, -60], 'metal2'), // levier d'armement (droite)
    profil([[-8, -18], [-30, -112], [-72, -116], [-60, -18]], 32, 0, 'poignee'), // poignée-pistolet
    pontet(16, -32, -16, 24, 5, 10),
    boite(5, 14, 4, [0, -26, -6], 'metal2'),
    tube(26, 30, [0, yb + 2, zB - 180], 'metal2', { seg: 8, bouts: 'aucun' }), // collier du bipied
    ...bipied(zB - 180, yb - 8, 320, 130, true),
    boite(30, 30, 90, [28, yb + 14, 40], 'metal2'), // plateau d'alimentation (gauche)
  ];
  if (o.alimentation === 'tambour') {
    p.push(ch(tube(58, 96, [74, yb - 40, 40], 'metal', { seg: 10 })), ...bande([[38, yb + 14], [60, yb + 4], [72, yb - 2]], 40).map(ch));
  } else {
    const n = o.alimentation === 'longue' ? 13 : 8;
    const pts = [[40, yb + 16]];
    for (let i = 1; i <= n; i += 1) pts.push([40 + 60 * Math.min(1, i / 3) + 6 * i, yb + 16 - 34 * i + 3 * Math.max(0, i - 4) ** 1.2]);
    p.push(...bande(pts, 40).map(ch)); // la bande vide tombe au rechargement
  }
  return p;
}

// --- Panzerschreck RPzB 54 (1 640 mm) ---------------------------------------------------------------------------------------------------
function panzerschreck(d) {
  const L = num(d.longueur, 1640);
  const zA = -600; // arrière du tube
  const zB = zA + L;
  const r = 47;
  const yt = 70; // axe du tube au-dessus de la poignée
  return [
    tube(r, L, [0, yt, (zA + zB) / 2], 'peinture', { seg: 10, bouts: 'aucun' }), // tube
    tube(41, 6, [0, yt, zA + 3], 'noir', { seg: 10, bouts: 'arriere' }), // fond de l'âme (arrière)
    tube(41, 6, [0, yt, zB - 3], 'noir', { seg: 10, bouts: 'avant' }), // fond de l'âme (avant)
    tube(54, 36, [0, yt, zA + 18], 'metal2', { seg: 10, bouts: 'aucun' }), // anneau arrière (garde)
    tube(51, 26, [0, yt, zB - 13], 'peinture', { seg: 10, bouts: 'aucun' }), // bourrelet avant
    boite(360, 460, 5, [70, yt + 40, 140], 'peinture2'), // bouclier
    boite(70, 60, 7, [100, yt + 150, 140], 'noir'), // fenêtre de visée du bouclier
    ...[-1, 1].map((sx) => boite(14, 20, 50, [sx * 46, yt + 20, 150], 'metal2')), // pattes du bouclier
    boite(46, 80, 40, [72, yt + 40, 220], 'metal2'), // guidon (cadre, gauche)
    boite(30, 40, 30, [62, yt + 34, -150], 'metal2'), // hausse (gauche)
    profil([[22, -r + yt + 4], [8, -50], [-30, -54], [-20, -r + yt + 4]], 34, 0, 'poignee'), // poignée de tir
    pontet(40, 0, 12, 22, 5, 10),
    boite(5, 14, 4, [0, 2, 22], 'metal2'),
    boite(30, 60, 70, [0, yt - r - 26, 420], 'metal2'), // poignée avant
    boite(40, 70, 120, [0, yt - r - 30, -420], 'metal2'), // épaulière
    boite(10, 10, 560, [-r - 3, yt - 10, -260], 'metal2'), // boîtier du câble de mise à feu (droite)
  ];
}

// --- Lance-flammes M2 : lance (≈ 1 050 mm, approximation) et réservoirs portés sur le dos (groupe « dos ») -----------------------------
// ctx.dos : décalage du groupe « dos » dans la pose demandée (le tuyau va de la lance aux réservoirs, quelle que soit la pose).
function m2lanceflammes(d, o, ctx = {}) {
  const L = num(d.longueur, 1050);
  const zA = -230;
  const zB = zA + L;
  const yb = 40;
  const dos = Array.isArray(ctx.dos) ? ctx.dos : [0, 0, -600];
  const H = num(d.reservoir, 630);
  const R = num(d.diametreReservoir, 155) / 2;
  const Rp = num(d.diametreBouteille, 125) / 2;
  const reservoirs = [
    ...[-1, 1].flatMap((s) => [
      tube(R, H, [s * 100, 0, 0], 'peinture', { seg: 10, axe: 'y', groupe: 'dos' }), // réservoir de carburant
      tube(22, 30, [s * 100, H / 2 + 15, 0], 'metal2', { seg: 6, axe: 'y', groupe: 'dos' }), // bouchon de remplissage
    ]),
    tube(Rp, H * 0.75, [0, -H * 0.06, -70], 'peinture2', { seg: 10, axe: 'y', groupe: 'dos' }), // bouteille de pression, entre les deux, en retrait
    tube(18, 26, [0, H * 0.32 + 13, -70], 'metal2', { seg: 6, axe: 'y', groupe: 'dos' }), // robinet de la bouteille
    boite(120, 40, 60, [0, H / 2 - 30, -20], 'metal2', { groupe: 'dos' }), // détendeur
    boite(340, H * 0.86, 18, [0, 0, R + 12], 'toile', { groupe: 'dos' }), // portage contre le dos
    ...[-1, 1].map((s) => barre([s * 90, H * 0.4, R + 20], [s * 96, H * 0.33, R + 240], 26, 'toile', { groupe: 'dos' })), // bretelles
  ].map((p) => ({ ...p, groupe: 'dos' }));
  // Tuyau : du bas du réservoir droit à l'arrière de la lance, en une courbe qui pend (segments de caoutchouc).
  const depart = [dos[0] - 100, dos[1] - H / 2 - 10, dos[2]];
  const arrivee = [0, yb - 40, zA - 30];
  const n = 6;
  const pts = [];
  for (let i = 0; i <= n; i += 1) {
    const t = i / n;
    pts.push([depart[0] + (arrivee[0] - depart[0]) * t - 60 * Math.sin(Math.PI * t), depart[1] + (arrivee[1] - depart[1]) * t - 180 * Math.sin(Math.PI * t), depart[2] + (arrivee[2] - depart[2]) * t]);
  }
  const tuyau = pts.slice(1).map((b, i) => barre(pts[i], b, 30, 'caoutchouc', { groupe: 'tuyau' }));
  const lance = [
    tube(17, zB - 100 - (zA + 60), [0, yb, (zA + 60 + zB - 100) / 2], 'metal', { seg: 8 }), // tube de la lance
    tube(30, 110, [0, yb - 4, zA + 55], 'metal2', { seg: 8 }), // valve arrière
    tube(22, 110, [0, yb, zB - 55], 'metal2', { r2: 16, seg: 8 }), // buse
    tube(21, 150, [0, yb - 40, zB - 160], 'metal', { seg: 8 }), // allumeur (sous la buse)
    profil([[20, yb - 26], [4, -78], [-34, -82], [-24, yb - 26]], 32, 0, 'poignee'), // poignée arrière (valve)
    profil([[520, yb - 16], [508, -64], [476, -68], [484, yb - 16]], 32, 0, 'poignee'), // poignée avant (allumage)
    pontet(38, 0, yb - 34, 22, 5, 10),
    boite(5, 14, 4, [0, yb - 44, 20], 'metal2'),
  ];
  return [...lance, ...tuyau, ...reservoirs];
}

export const MODELES = Object.freeze({ m1911, kar98k, thompson, winchester1897, garand, stg44, bar, mg42, panzerschreck, m2lanceflammes });
