// Lot 8f : modèles de l'ouverture en 3D, tout en code (boîtes, cylindres, formes extrudées ; aucun modèle importé) : géométries fusionnées par
// matière (un appel de dessin par matière), créées une fois par ouverture et libérées avec elle. Repère : x à droite, y en haut, z vers la caméra
// (la scène est devant, z négatif) ; unités de la scène (une caisse fait 110 de large).
import * as THREE from 'three';

const M = new THREE.Matrix4();
const Q = new THREE.Quaternion();
const E = new THREE.Euler();
const V = new THREE.Vector3();
const S = new THREE.Vector3();

// Une pièce : géométrie et pose (position, rotation en radians, échelle).
export const piece = (geo, p = [0, 0, 0], r = [0, 0, 0], s = [1, 1, 1]) => ({ geo, p, r, s });

// Fusionne des pièces (non indexées : positions, normales, uv) en une géométrie ; les géométries sources sont libérées.
export function fusion(pieces) {
  const pos = [];
  const nor = [];
  const uv = [];
  const nm = new THREE.Matrix3();
  for (const { geo, p, r, s } of pieces) {
    const g = geo.index ? geo.toNonIndexed() : geo;
    M.compose(V.set(...p), Q.setFromEuler(E.set(r[0], r[1], r[2])), S.set(...s));
    g.applyMatrix4(M);
    nm.getNormalMatrix(M);
    pos.push(g.attributes.position.array);
    nor.push(g.attributes.normal.array);
    uv.push(g.attributes.uv ? g.attributes.uv.array : new Float32Array((g.attributes.position.count) * 2));
    if (g !== geo) g.dispose();
    geo.dispose();
  }
  const cat = (arrs) => {
    const n = arrs.reduce((s, a) => s + a.length, 0);
    const out = new Float32Array(n);
    let o = 0;
    for (const a of arrs) {
      out.set(a, o);
      o += a.length;
    }
    return out;
  };
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(cat(pos), 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(cat(nor), 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(cat(uv), 2));
  geo.computeBoundingSphere();
  return geo;
}

const boite = (w, h, d) => new THREE.BoxGeometry(w, h, d);
// Cylindre (rayons r1 en a, r2 en b) posé entre deux points.
const HAUT = new THREE.Vector3(0, 1, 0);
function entre(a, b, r1, r2, n = 10) {
  const va = new THREE.Vector3(...a);
  const d = new THREE.Vector3(...b).sub(va);
  const e = new THREE.Euler().setFromQuaternion(new THREE.Quaternion().setFromUnitVectors(HAUT, d.clone().normalize()));
  return piece(new THREE.CylinderGeometry(r2, r1, d.length(), n), va.addScaledVector(d, 0.5).toArray(), [e.x, e.y, e.z]);
}
const cyl = (r1, r2, h, n = 12) => new THREE.CylinderGeometry(r1, r2, h, n);

// --- Caisses ------------------------------------------------------------------------------------------------------------------------------
// Dimensions communes : largeur 150 (retour du propriétaire : « carrées dans l'animation, rectangulaires dans le menu » ; avant 110), profondeur 80,
// corps 62 de haut, couvercle 12 ; origine au centre du bas.
export const CAISSE = Object.freeze({ w: 150, d: 80, h: 62, couvercle: 12 });
// Forme d'un modèle (genres du lot 8e : data/menu/caisses.json → modele).
export const FORMES = Object.freeze({ bois: 'bois', militaire: 'militaire', elite: 'elite', recrues: 'malle', veterans: 'malle', legendes: 'malle', tenues: 'valise', mode: 'valise', couture: 'valise' });

// { corps: { principal, garniture }, couvercle: { principal, garniture }, interieur, q (quatre « ? »), y : hauteur du haut du corps }.
export function caisseGeo(modele) {
  const forme = FORMES[modele] ?? 'bois';
  const { w, d, h, couvercle: hc } = CAISSE;
  const corps = [];
  const garniture = [];
  const cp = [];
  const cg = [];
  if (forme === 'bois') {
    corps.push(piece(boite(w, h, d), [0, h / 2, 0]));
    // Coins rivetés et lattes verticales.
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) garniture.push(piece(boite(9, h + 1, 9), [sx * (w / 2 - 3.5), h / 2, sz * (d / 2 - 3.5)]));
    for (const sz of [-1, 1]) garniture.push(piece(boite(w - 10, 4, 1.5), [0, h * 0.5, sz * (d / 2 + 0.5)]));
    cp.push(piece(boite(w + 4, hc, d + 4), [0, hc / 2, 0]));
    cg.push(piece(boite(w + 5, 3, d + 5), [0, 1.5, 0]));
  } else if (forme === 'militaire') {
    corps.push(piece(boite(w - 4, h, d - 4), [0, h / 2, 0]));
    // Nervures, poignées, loquets.
    for (const x of [-w * 0.3, w * 0.3]) garniture.push(piece(boite(5, h - 4, d - 1), [x, h / 2, 0]));
    for (const sx of [-1, 1]) garniture.push(piece(boite(4, 4, 30), [sx * (w / 2), h * 0.62, 0]));
    for (const sx of [-1, 1]) garniture.push(piece(boite(10, 10, 3), [sx * w * 0.36, h - 4, d / 2 - 1]));
    cp.push(piece(boite(w, hc, d), [0, hc / 2, 0]));
    cg.push(piece(boite(40, 3, 6), [0, hc + 1.5, 0]));
  } else if (forme === 'elite') {
    corps.push(piece(boite(w - 6, h - 8, d - 6), [0, (h - 8) / 2, 0]));
    // Coffre bombé : couvercle en demi-cylindre, cerclé de la teinte.
    const r = (d - 2) / 2;
    cp.push(piece(new THREE.CylinderGeometry(r, r, w - 2, 20, 1, false, 0, Math.PI), [0, 0, 0], [0, 0, Math.PI / 2], [0.55, 1, 1]));
    for (const x of [-w * 0.28, w * 0.28]) {
      garniture.push(piece(boite(7, h - 7, d - 3), [x, (h - 8) / 2, 0]));
      cg.push(piece(new THREE.CylinderGeometry(r + 1.2, r + 1.2, 7, 20, 1, false, 0, Math.PI), [x, 0, 0], [0, 0, Math.PI / 2], [0.58, 1, 1.03]));
    }
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) garniture.push(piece(boite(12, 12, 12), [sx * (w / 2 - 8), 6, sz * (d / 2 - 6)]));
    garniture.push(piece(boite(13, 14, 3), [0, h - 14, d / 2 - 2]));
  } else if (forme === 'malle') {
    corps.push(piece(boite(w - 4, h, d - 4), [0, h / 2, 0]));
    for (const y of [h * 0.22, h * 0.78]) garniture.push(piece(boite(w - 2, 4, d - 2), [0, y, 0]));
    // Plaques d'identité accrochées sur le côté.
    garniture.push(piece(boite(9, 13, 1.5), [w * 0.32, h * 0.5, d / 2 - 0.5], [0, 0, -0.2]));
    garniture.push(piece(boite(9, 13, 1.5), [w * 0.4, h * 0.45, d / 2 - 0.2], [0, 0, 0.18]));
    cp.push(piece(boite(w, hc, d), [0, hc / 2, 0]));
    cg.push(piece(boite(w + 1, 3, d + 1), [0, 1, 0]));
  } else {
    // Valise de cuir à sangles, coins protégés.
    corps.push(piece(boite(w - 4, h, d - 8), [0, h / 2, 0]));
    for (const x of [-w * 0.24, w * 0.24]) garniture.push(piece(boite(8, h + 1, d - 6), [x, h / 2, 0]));
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) garniture.push(piece(boite(8, 8, 8), [sx * (w / 2 - 5), 4, sz * (d / 2 - 7)]));
    cp.push(piece(boite(w - 2, hc, d - 6), [0, hc / 2, 0]));
    cg.push(piece(new THREE.TorusGeometry(10, 2, 6, 12, Math.PI), [0, hc, 0]));
    for (const x of [-w * 0.24, w * 0.24]) cg.push(piece(boite(8, hc + 1, d - 4), [x, hc / 2, 0]));
  }
  const top = forme === 'elite' ? h - 8 : h;
  // Intérieur sombre (vu quand le couvercle est parti).
  const interieur = fusion([piece(new THREE.PlaneGeometry(w * 0.86, d * 0.8), [0, top + 0.6, 0], [-Math.PI / 2, 0, 0])]);
  // Quatre « ? » : un grand au milieu de la face, deux petits, un sur le côté droit.
  const zf = (forme === 'bois' ? d / 2 : forme === 'elite' ? d / 2 - 3 : forme === 'valise' ? d / 2 - 4 : d / 2 - 2) + 0.9;
  const q = fusion([
    piece(new THREE.PlaneGeometry(34, 34), [0, top * 0.52, zf]),
    piece(new THREE.PlaneGeometry(15, 15), [-w * 0.33, top * 0.4, zf]),
    piece(new THREE.PlaneGeometry(15, 15), [w * 0.33, top * 0.4, zf]),
    piece(new THREE.PlaneGeometry(18, 18), [(forme === 'bois' ? w / 2 : w / 2 - 2) + 0.9, top * 0.5, 0], [0, Math.PI / 2, 0]),
  ]);
  return {
    forme,
    corps: { principal: fusion(corps), garniture: fusion(garniture) },
    couvercle: { principal: fusion(cp), garniture: fusion(cg) },
    interieur,
    q,
    haut: top,
  };
}

// --- Fusil d'assaut et mains (première personne) -------------------------------------------------------------------------------------------
// Repère du fusil : le canon vers −z, origine au boîtier ; unités ≈ 1 cm. Par matière : arme (métal), polymère (garde-main, chargeur, poignée,
// crosse), gant, manche, lentille, point rouge. Bout du canon : BOUT.
export const BOUT = Object.freeze([0, 0.6, -50]);
export function fusilGeo() {
  const arme = [];
  const poly = [];
  const gant = [];
  const manche = [];
  // Boîtier, canon, cache-flamme, rail à encoches.
  arme.push(piece(boite(4.4, 5.6, 20), [0, 0, 0]));
  arme.push(piece(cyl(0.75, 0.75, 16), [0, 0.6, -38], [Math.PI / 2, 0, 0]));
  arme.push(piece(cyl(1.15, 1.05, 4.5, 10), [0, 0.6, -47.5], [Math.PI / 2, 0, 0]));
  arme.push(piece(boite(2.4, 0.9, 34), [0, 3.4, -9]));
  for (let k = 0; k < 15; k += 1) arme.push(piece(boite(2.8, 0.7, 0.9), [0, 3.95, -24 + k * 2.2]));
  // Retour du propriétaire (« des textures sur l'arme, la lunette… ») : lunette de visée à la place du viseur point rouge : deux montures sur
  // le rail, tube, objectif évasé à l'avant, oculaire à l'arrière, tourelles de réglage (dessus et côté), bagues.
  const L = { y: 6.6, z: -4 }; // axe du tube
  for (const z of [-8, 0]) {
    arme.push(piece(boite(2.4, 2.2, 1.6), [0, 4.9, z]));
    arme.push(piece(cyl(1.5, 1.5, 1.3, 16), [0, L.y, z], [Math.PI / 2, 0, 0]));
  }
  arme.push(piece(cyl(1.25, 1.25, 12, 16), [0, L.y, L.z], [Math.PI / 2, 0, 0]));
  arme.push(piece(cyl(1.25, 1.95, 3.5, 16), [0, L.y, -11.75], [Math.PI / 2, 0, 0]));
  arme.push(piece(cyl(2.05, 2.05, 0.8, 16), [0, L.y, -13.9], [Math.PI / 2, 0, 0]));
  arme.push(piece(cyl(1.7, 1.25, 3.5, 16), [0, L.y, 3.75], [Math.PI / 2, 0, 0]));
  arme.push(piece(cyl(1.8, 1.8, 0.8, 16), [0, L.y, 5.9], [Math.PI / 2, 0, 0]));
  arme.push(piece(cyl(0.75, 0.75, 1.7, 10), [0, L.y + 1.9, L.z]));
  arme.push(piece(cyl(0.75, 0.75, 1.7, 10), [1.9, L.y, L.z], [0, 0, Math.PI / 2]));
  // Garde-main à fentes (polymère, fentes en métal sombre par-dessus).
  poly.push(piece(boite(4.2, 4.6, 20), [0, 0.4, -20]));
  for (let k = 0; k < 4; k += 1) for (const sx of [-1, 1]) arme.push(piece(boite(0.4, 1.2, 3.2), [sx * 2.15, 0.6, -27 + k * 4.6]));
  // Chargeur courbe, poignée pistolet, crosse.
  poly.push(piece(boite(2.8, 8.5, 4.4), [0, -6.6, -3.5], [-0.22, 0, 0]));
  poly.push(piece(boite(2.8, 2.8, 4.4), [0, -11.4, -5.3], [-0.42, 0, 0]));
  poly.push(piece(boite(3, 7, 3.4), [0, -5.6, 7.2], [0.38, 0, 0]));
  poly.push(piece(boite(3.6, 5, 14), [0, -0.8, 16]));
  arme.push(piece(boite(1.2, 2.2, 3.4), [0, -3.4, 3.4]));
  // Main gauche sous le garde-main : paume dessous, quatre doigts repliés sur le flanc gauche (côté visible), pouce dessus à droite, poignet.
  gant.push(piece(boite(5.2, 2.6, 7.6), [-0.6, -3.3, -22], [0, 0, 0.18]));
  for (let k = 0; k < 4; k += 1) gant.push(entre([-2.7, -3, -25.2 + k * 1.85], [-2.5, 0.9 - k * 0.25, -25 + k * 1.85], 0.95, 0.8, 8));
  gant.push(entre([1.8, -1.6, -18.8], [2.3, 1.8, -23.5], 1.05, 0.85, 8));
  gant.push(piece(boite(5, 4.2, 4.4), [-1.4, -4.6, -18.2], [0.25, 0, 0.2]));
  // Main droite sur la poignée : poing autour de la poignée, index le long du pontet, pouce sur le flanc gauche.
  gant.push(piece(boite(4.6, 6.4, 5), [0.1, -6, 8.4], [0.38, 0, 0]));
  gant.push(entre([-2.4, -2.9, 5.6], [-2.2, -2.7, 1.4], 0.9, 0.78, 8));
  gant.push(entre([-2.5, -4, 9.8], [-2.4, -1.5, 6.2], 0.95, 0.8, 8));
  gant.push(piece(boite(4.8, 4.4, 4.6), [0.6, -9.2, 11.2], [0.5, 0, 0]));
  // Manches de la veste, du poignet vers le bas de l'écran (hors champ).
  manche.push(entre([-2.2, -5.4, -17], [-13, -22, -1], 3.1, 4.4, 12));
  manche.push(entre([0.8, -10.4, 12.6], [6.5, -25, 27], 3.3, 4.6, 12));
  return {
    arme: fusion(arme),
    polymere: fusion(poly),
    gant: fusion(gant),
    manche: fusion(manche),
    // Verres de la lunette : oculaire (vers le tireur) et objectif (vers l'avant) ; point rouge du réticule sur l'oculaire.
    lentille: fusion([piece(new THREE.CircleGeometry(1.5, 16), [0, 6.6, 6.32]), piece(new THREE.CircleGeometry(1.85, 16), [0, 6.6, -14.32], [0, Math.PI, 0])]),
    point: fusion([piece(new THREE.CircleGeometry(0.16, 8), [0, 6.6, 6.34])]),
  };
}

// --- Décor du hangar ------------------------------------------------------------------------------------------------------------------------
// Tapis roulant le long de x (centre z = TAPIS.z), bande en haut à TAPIS.y ; rouleaux instanciés à part.
export const TAPIS = Object.freeze({ z: -300, y: 52, largeur: 112, longueur: 1800, rouleaux: 30, pas: 60 });
export function tapisGeo() {
  const { largeur: L, longueur: lg, y } = TAPIS;
  const chassis = fusion([
    piece(boite(lg, 10, 6), [0, y - 6, L / 2 + 3]),
    piece(boite(lg, 10, 6), [0, y - 6, -L / 2 - 3]),
    ...Array.from({ length: 12 }, (_, k) => piece(boite(5, y - 8, 5), [-lg / 2 + 75 + k * 150, (y - 8) / 2, L / 2 - 2])),
    ...Array.from({ length: 12 }, (_, k) => piece(boite(5, y - 8, 5), [-lg / 2 + 75 + k * 150, (y - 8) / 2, -L / 2 + 2])),
    piece(boite(lg, 3, L), [0, y - 9, 0]),
  ]);
  const bande = fusion([piece(new THREE.PlaneGeometry(lg, L), [0, y, 0], [-Math.PI / 2, 0, 0])]);
  return { chassis, bande, rouleau: cyl(3.4, 3.4, L - 4, 10) };
}

// Piles de caisses sur les côtés du hangar (bois) : boîtes fusionnées.
export function pilesGeo() {
  const p = [];
  const pile = (x, z, etages, r = 0) => {
    for (let e = 0; e < etages; e += 1) {
      const w = 90 + ((e * 37 + x) % 3) * 10;
      p.push(piece(boite(w, 70, 80), [x + (e % 2 ? 8 : -6), 35 + e * 70, z], [0, r + (e % 2 ? 0.12 : -0.05), 0]));
    }
  };
  pile(-470, -470, 3, 0.1);
  pile(-370, -520, 2, -0.2);
  pile(-560, -330, 2);
  pile(460, -480, 2, -0.15);
  pile(560, -400, 3, 0.2);
  pile(380, -560, 1);
  return fusion(p);
}

// Lampe suspendue (câble, abat-jour conique) et cône de lumière visible.
export function lampeGeo() {
  return {
    lampe: fusion([
      piece(cyl(0.6, 0.6, 200, 6), [0, 100, 0]),
      piece(new THREE.CylinderGeometry(6, 26, 18, 16, 1, true), [0, -9, 0]),
      piece(cyl(5, 5, 6, 10), [0, 1, 0]),
    ]),
    cone: new THREE.CylinderGeometry(16, 200, 300, 24, 1, true),
    ampoule: new THREE.SphereGeometry(5, 10, 8),
  };
}
