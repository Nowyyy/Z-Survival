// Lot 9j : atlas du mobilier de 1942 (une texture générée de 256 px, aucune image). Pur : ni Three.js, ni DOM, ni hasard du navigateur, ni horloge.
// Régions de 64 px : couvercles de caisses au pochoir (« CAL .30 », « RATIONS », numéros inventés), bâche, sac de toile, jerrycan, briques, plâtre,
// conserves, couverture pliée, façades de tiroirs, dossiers, sous-main et carte inventée, sacs de sable, pierres, plateau d'établi, blanc (teinté).
// Couleurs : sortie de couleursEpoque (clés de data/game/mobilier-epoque.json, mélanges de jetons --game-* existants) ; absentes : gris neutre.
// Aucun symbole politique, aucune marque, aucun emblème (textes génériques ; « MEDICAL » reste à la caisse médicale du lot 9i).
// Coordonnées d'une région : u vers la droite, v vers le HAUT de l'image vue en jeu (v = 0 : première rangée de données, bas de la texture).
export const ATLAS_TAILLE = 256;
const R = (x, y) => ({ x, y, w: 64, h: 64 });
export const REGIONS = Object.freeze({
  munitions: R(0, 0), rations: R(64, 0), bache: R(128, 0), sac: R(192, 0),
  jerrycan: R(0, 64), briques: R(64, 64), platre: R(128, 64), conserves: R(192, 64),
  couverture: R(0, 128), tiroirs: R(64, 128), dossiers: R(128, 128), bureau: R(192, 128),
  sacsable: R(0, 192), pierre: R(64, 192), etabli: R(128, 192),
  // Retours du propriétaire (décor des murs) : la case du blanc partagée en quatre (32 px) : blanc, affiche, horloge, tableau d'ordres.
  uni: { x: 192, y: 192, w: 32, h: 32 }, affiche: { x: 224, y: 192, w: 32, h: 32 }, horloge: { x: 192, y: 224, w: 32, h: 32 }, ordres: { x: 224, y: 224, w: 32, h: 32 },
});
export function regionUv(id, taille = ATLAS_TAILLE) {
  const r = REGIONS[id] ?? REGIONS.uni;
  return { u0: (r.x + 1) / taille, v0: (r.y + 1) / taille, u1: (r.x + r.w - 1) / taille, v1: (r.y + r.h - 1) / taille };
}
// Textes au pochoir (inventés : calibre générique, ration, numéros de lot).
export const TEXTES = Object.freeze({ munitions: ['CAL .30', 'LOT 4417'], rations: ['RATIONS', 'NO 12'], affiche: ['AVIS'] });
// Police de pochoir 3 × 5 (rangées du haut vers le bas, bits de gauche à droite).
export const GLYPHES = Object.freeze({
  A: [2, 5, 7, 5, 5], C: [7, 4, 4, 4, 7], I: [7, 2, 2, 2, 7], L: [4, 4, 4, 4, 7], N: [5, 7, 7, 7, 5], O: [7, 5, 5, 5, 7], R: [6, 5, 6, 5, 5],
  S: [7, 4, 7, 1, 7], T: [7, 2, 2, 2, 2], V: [5, 5, 5, 5, 2], 0: [7, 5, 5, 5, 7], 1: [2, 6, 2, 2, 7], 2: [7, 1, 7, 4, 7], 3: [7, 1, 3, 1, 7], 4: [5, 5, 7, 1, 1], 7: [7, 1, 2, 2, 2],
  '.': [0, 0, 0, 0, 2], ' ': [0, 0, 0, 0, 0],
});

function hash(x, y, s) {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(s | 0, 1274126177)) | 0;
  h = Math.imul(h ^ (h >>> 15), 2246822519);
  h = Math.imul(h ^ (h >>> 13), 3266489917);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

// Le pixel (u, v) tombe-t-il sur un trait du texte, centré dans la boîte [u0, u1] × [v0, v1] (glyphes de 3 × 5, un blanc entre deux) ?
export function surTexte(u, v, texte, [u0, v0, u1, v1]) {
  const t = String(texte);
  const cols = t.length * 4 - 1;
  const cu = (u - u0) / (u1 - u0);
  const cv = (v1 - v) / (v1 - v0); // 0 en haut de la boîte
  if (cu < 0 || cu >= 1 || cv < 0 || cv >= 1) return false;
  const px = Math.floor(cu * cols);
  const py = Math.floor(cv * 5);
  if (px % 4 === 3) return false;
  const g = GLYPHES[t[Math.floor(px / 4)]] ?? GLYPHES[' '];
  return ((g[py] >> (2 - (px % 4))) & 1) === 1;
}

// Atlas du mobilier (carré de `taille` px, RGBA). → { width, height, data: Uint8ClampedArray, octets }.
export function atlasMobilier({ taille = ATLAS_TAILLE, couleurs = {} } = {}) {
  const N = taille === 128 || taille === 256 || taille === 512 ? taille : ATLAS_TAILLE;
  const k = N / ATLAS_TAILLE;
  const data = new Uint8ClampedArray(N * N * 4);
  const c = (cle, d = [128, 128, 128]) => (Array.isArray(couleurs[cle]) ? couleurs[cle] : d);
  const mix = (a, b, t) => a.map((q, i) => q + (b[i] - q) * t);
  const fois = (a, f) => a.map((q) => q * f);
  const set = (x, y, rgb) => {
    const i = (y * N + x) * 4;
    data[i] = rgb[0];
    data[i + 1] = rgb[1];
    data[i + 2] = rgb[2];
    data[i + 3] = 255;
  };
  const region = (id, f) => {
    const r = REGIONS[id];
    const x0 = Math.round(r.x * k);
    const y0 = Math.round(r.y * k);
    const w = Math.round(r.w * k);
    const h = Math.round(r.h * k);
    for (let y = 0; y < h; y += 1) for (let x = 0; x < w; x += 1) set(x0 + x, y0 + y, f((x + 0.5) / w, (y + 0.5) / h, x, y, w, h));
  };
  const grain = (x, y, s, a = 0.12) => 1 - a / 2 + a * hash(x, y, s);
  // Couvercle de caisse : liteaux (trois planches), traverses aux bouts, poignées de corde, pochoir sur deux lignes.
  const couvercle = (fond, encre, textes, s) => (u, v, x, y) => {
    let col = fois(fond, grain(x >> 1, y, s, 0.18));
    if (Math.abs((v * 3) % 1) < 0.04 || v < 0.03 || v > 0.97) col = fois(fond, 0.62);
    if (u < 0.09 || u > 0.91) col = fois(fond, 0.8 * grain(x, y >> 1, s + 1, 0.1));
    if ((u < 0.05 || u > 0.95) && Math.abs(v - 0.5) < 0.12) col = c('corde');
    if (surTexte(u, v, textes[0], [0.15, 0.5, 0.85, 0.8]) || surTexte(u, v, textes[1], [0.25, 0.2, 0.75, 0.38])) col = fois(encre, grain(x, y, s + 2, 0.15));
    return col;
  };
  region('munitions', couvercle(c('olive'), c('pochoir'), TEXTES.munitions, 1));
  region('rations', couvercle(c('bois-clair'), c('encre'), TEXTES.rations, 3));
  // Bâche de toile olive : plis (ombres en vagues), œillets au bord.
  region('bache', (u, v, x, y) => {
    const pli = 0.5 + 0.5 * Math.sin(u * 17 + Math.sin(v * 6) * 2.4) * Math.cos(v * 5 + u * 3);
    let col = fois(c('toile'), (0.72 + 0.36 * pli) * grain(x, y, 5, 0.08));
    if ((u < 0.06 || u > 0.94 || v < 0.06 || v > 0.94) && Math.hypot(((u * 6) % 1) - 0.5, ((v * 6) % 1) - 0.5) < 0.18) col = c('acier');
    return col;
  });
  // Sac de toile vu de dessus : trame, couture, col noué au centre.
  region('sac', (u, v, x, y) => {
    const d = Math.hypot(u - 0.5, v - 0.5);
    let col = fois(c('jute'), ((x + y) % 2 ? 1.06 : 0.92) * (1.08 - d * 0.6));
    if (Math.abs(u - 0.5) < 0.02 && v < 0.42) col = fois(c('jute'), 0.6);
    if (d < 0.08) col = fois(c('corde'), 0.75);
    else if (d < 0.2 && hash(Math.floor(Math.atan2(v - 0.5, u - 0.5) * 6), 0, 6) > 0.5) col = fois(col, 0.82);
    return col;
  });
  // Jerrycan vu de dessus : tôle olive, croix d'emboutissage, trois poignées, bouchon.
  region('jerrycan', (u, v, x, y) => {
    let col = fois(c('olive'), grain(x, y, 7, 0.08));
    if (u < 0.05 || u > 0.95 || v < 0.05 || v > 0.95) col = fois(c('olive'), 0.6);
    if (v < 0.78 && (Math.abs((u - 0.1) - (v - 0.08) * 1.15) < 0.035 || Math.abs((0.9 - u) - (v - 0.08) * 1.15) < 0.035)) col = fois(c('olive'), 1.25);
    if (v > 0.82 && v < 0.92 && ((u > 0.2 && u < 0.36) || (u > 0.42 && u < 0.58) || (u > 0.64 && u < 0.8))) col = c('olive-sombre');
    if (Math.hypot(u - 0.14, v - 0.86) < 0.07) col = c('acier');
    return col;
  });
  // Briques en appareil, joints de mortier, briques cassées plus sombres.
  region('briques', (u, v, x, y, w, h) => {
    const rh = h / 8;
    const rang = Math.floor(y / rh);
    const bw = w / 4;
    const dx = rang % 2 ? bw / 2 : 0;
    const col0 = Math.floor((x + dx) / bw);
    const joint = y % rh < 1 || (x + dx) % bw < 1;
    if (joint) return fois(c('mortier'), grain(x, y, 8));
    const casse = hash(col0, rang, 9) > 0.82;
    return fois(c('brique'), (casse ? 0.7 : 0.85 + 0.3 * hash(col0, rang, 10)) * grain(x, y, 11, 0.14));
  });
  // Plâtre tombé : fond pâle sali, lattes visibles par endroits, fissures.
  region('platre', (u, v, x, y) => {
    let col = mix(c('platre'), c('platre-sombre'), 0.25 * hash(x >> 3, y >> 3, 12) + 0.1 * hash(x, y, 13));
    if (hash(x >> 4, 0, 14) > 0.55 && (y % 8 < 3)) col = mix(col, c('manche'), 0.55);
    const f = Math.abs(Math.sin(u * 9 + Math.sin(v * 13) * 1.5) * 0.5 + 0.5 - v);
    if (f < 0.015) col = c('platre-sombre');
    return col;
  });
  // Conserves vues de dessus : boîtes rondes serrées, bord serti, dessus de fer-blanc, ombre entre les boîtes.
  region('conserves', (u, v) => {
    const cu = ((u * 4) % 1) - 0.5;
    const cv = ((v * 4) % 1) - 0.5;
    const d = Math.hypot(cu, cv);
    if (d > 0.46) return fois(c('etiquette'), 0.45);
    if (d > 0.4) return fois(c('fer-blanc'), 0.72);
    return fois(c('fer-blanc'), 0.95 + 0.1 * (cu - cv) - (d < 0.08 ? 0.1 : 0));
  });
  // Couverture de laine pliée : olive, bande claire, plis.
  region('couverture', (u, v, x, y) => {
    let col = fois(c('couverture'), grain(x, y, 15, 0.12));
    if (Math.abs(v - 0.62) < 0.05) col = c('couverture-bande');
    if (Math.abs((v * 4) % 1) < 0.05) col = fois(col, 0.7);
    if (u < 0.04 || u > 0.96) col = fois(col, 0.8);
    return col;
  });
  // Façades de tiroirs (niveaux de gris, teintés tôle olive ou bois) : quatre tiroirs, poignée et porte-étiquette.
  region('tiroirs', (u, v, x, y) => {
    const t = (v * 4) % 1;
    let g = 170 + 16 * hash(x, y >> 1, 16);
    if (t < 0.06 || t > 0.95 || u < 0.04 || u > 0.96) g = 70;
    else if (Math.abs(t - 0.45) < 0.07 && Math.abs(u - 0.5) < 0.16) g = 232;
    else if (Math.abs(t - 0.72) < 0.08 && Math.abs(u - 0.5) < 0.1) g = 220;
    return [g, g, g];
  });
  // Dossiers : bas (v < 0,5) chemise cartonnée et feuilles ; haut, onglets des dossiers rangés dans un tiroir.
  region('dossiers', (u, v, x, y) => {
    if (v < 0.5) {
      const vv = v * 2;
      let col = fois(c('carton'), grain(x, y, 17, 0.1));
      if (u > 0.1 && u < 0.78 && vv > 0.25 && vv < 0.92) col = fois(c('papier'), grain(x, y, 18, 0.06));
      if (u > 0.16 && u < 0.7 && vv > 0.35 && vv < 0.85 && y % 3 === 0 && hash(x >> 2, y, 19) > 0.3) col = c('encre');
      if (u > 0.62 && u < 0.92 && vv > 0.05 && vv < 0.55) col = fois(c('carton'), 0.85);
      return col;
    }
    const s = Math.floor(u * 10);
    const onglet = (((v - 0.5) * 2) > 0.8) && hash(s, 0, 20) > 0.4;
    const col = s % 2 ? c('papier') : c('carton');
    return fois(col, (u * 10) % 1 < 0.15 ? 0.55 : onglet ? 1.1 : 0.92);
  });
  // Bureau : gauche, sous-main de cuir vert (coins, liseré) ; droite, carte d'état-major inventée (courbes de niveau, rivière, carroyage).
  region('bureau', (u, v, x, y) => {
    if (u < 0.5) {
      const uu = u * 2;
      let col = fois(c('cuir-vert'), grain(x, y, 21, 0.1));
      if (uu < 0.06 || uu > 0.94 || v < 0.06 || v > 0.94) col = fois(c('cuir-vert'), 0.62);
      if ((uu < 0.16 || uu > 0.84) && (v < 0.16 || v > 0.84)) col = fois(c('manche'), 0.9);
      if (uu > 0.3 && uu < 0.7 && v > 0.3 && v < 0.75) col = (y % 4 === 0 && uu < 0.64) ? c('encre') : c('papier');
      return col;
    }
    const uu = (u - 0.5) * 2;
    let col = fois(c('papier'), grain(x, y, 22, 0.06));
    const relief = Math.sin(uu * 8) * 0.5 + Math.cos(v * 6 + uu * 2) * 0.5;
    if (Math.abs(((relief * 5 + 10) % 1) - 0.5) < 0.06) col = mix(col, c('carte-relief'), 0.7);
    if (Math.abs(v - (0.4 + 0.15 * Math.sin(uu * 5))) < 0.025) col = c('carte-eau');
    if (x % 8 === 0 || y % 8 === 0) col = mix(col, c('encre'), 0.3);
    return col;
  });
  // Sacs de sable (toile de jute) : rangs décalés de sacs rebondis (28 × 14 unités pour une région de 112), coutures, bouts liés.
  region('sacsable', (u, v, x, y, w, h) => {
    const rh = h / 8;
    const rang = Math.floor(y / rh);
    const bw = w / 4;
    const dx = rang % 2 ? bw / 2 : 0;
    const su = ((x + dx) % bw) / bw;
    const sv = (y % rh) / rh;
    const bombe = Math.sin(su * Math.PI) * Math.sin(sv * Math.PI);
    let col = fois(c('jute'), (0.6 + 0.5 * bombe) * ((x + y) % 2 ? 1.04 : 0.94));
    if (su < 0.06 || su > 0.94) col = fois(c('corde'), 0.7);
    return col;
  });
  // Pierres : moellons irréguliers (cellules décalées), joints de mortier.
  region('pierre', (u, v, x, y) => {
    const cy = Math.floor(y / 10);
    const cx = Math.floor((x + (cy % 2 ? 7 : 0) + hash(cy, 0, 23) * 4) / 14);
    const bx = (x + (cy % 2 ? 7 : 0) + hash(cy, 0, 23) * 4) % 14;
    if (y % 10 < 1.2 || bx < 1.2) return fois(c('mortier'), grain(x, y, 24));
    return fois(c('pierre'), (0.8 + 0.35 * hash(cx, cy, 25)) * grain(x, y, 26, 0.12));
  });
  // Plateau d'établi : planches de bois sombre dans la longueur, deux taches, têtes de clous (rien de clair : sous la lampe, le plateau ressortait).
  region('etabli', (u, v, x, y) => {
    let col = fois(c('bois-tiroir'), (0.92 + 0.16 * Math.sin(u * 30 + Math.sin(v * 9) * 2) * 0.5) * grain(x, y >> 2, 27, 0.1));
    if (Math.abs((v * 5) % 1) < 0.05) col = fois(c('bois-tiroir'), 0.5);
    for (const [tu, tv, r] of [[0.3, 0.42, 0.07], [0.72, 0.66, 0.05]]) if (Math.hypot(u - tu, (v - tv) * 1.3) < r) col = fois(col, 0.8);
    if (Math.abs((v * 5) % 1 - 0.5) < 0.04 && Math.abs(((u * 6) % 1) - 0.5) < 0.04) col = c('noir');
    return col;
  });
  region('uni', (u, v, x, y) => {
    const g = 225 + 20 * hash(x, y, 28);
    return [g, g, g];
  });
  // Affiche « AVIS » (texte générique inventé) : papier jauni, bandeau sombre au titre clair, lignes de texte, bord usé.
  region('affiche', (u, v, x, y) => {
    let col = fois(c('papier'), grain(x, y, 29, 0.1));
    if (v > 0.68 && v < 0.94 && u > 0.08 && u < 0.92) col = surTexte(u, v, TEXTES.affiche[0], [0.2, 0.72, 0.8, 0.9]) ? c('papier') : c('encre');
    else if (v > 0.12 && v < 0.6 && u > 0.14 && u < 0.86 && y % 3 === 0 && hash(x >> 1, y, 30) > 0.25) col = c('encre');
    if (u < 0.04 || u > 0.96 || v < 0.04 || v > 0.96) col = fois(col, 0.75);
    return col;
  });
  // Horloge murale arrêtée : cadre de bois, cadran clair, douze traits, aiguilles figées.
  region('horloge', (u, v) => {
    const d = Math.hypot(u - 0.5, v - 0.5);
    if (d > 0.46) return c('manche');
    if (d > 0.42) return fois(c('laiton'), 0.8);
    const a = Math.atan2(v - 0.5, u - 0.5);
    if (d > 0.33 && Math.abs(((a / (Math.PI / 6)) % 1 + 1) % 1 - 0.5) > 0.42) return c('encre');
    if (Math.abs(u - 0.5) < 0.03 && v > 0.5 && v < 0.82) return c('encre');
    if (Math.abs(v - 0.5) < 0.03 && u > 0.5 && u < 0.72) return c('encre');
    return c('papier');
  });
  // Tableau d'ordres : liège sombre, feuilles épinglées (lignes), punaises de laiton.
  region('ordres', (u, v, x, y) => {
    let col = fois(c('carton'), 0.55 * grain(x, y, 31, 0.3));
    for (const [a, b, w, h] of [[0.08, 0.5, 0.36, 0.42], [0.52, 0.55, 0.38, 0.36], [0.2, 0.08, 0.4, 0.36], [0.64, 0.1, 0.28, 0.34]]) {
      if (u > a && u < a + w && v > b && v < b + h) col = (y % 3 === 0 && u > a + 0.04 && u < a + w - 0.04 && v < b + h - 0.08) ? c('encre') : c('papier');
      if (Math.hypot(u - (a + w / 2), v - (b + h - 0.04)) < 0.035) col = c('laiton');
    }
    return col;
  });
  return { width: N, height: N, data, octets: Math.round(N * N * 4 * 4 / 3) };
}
