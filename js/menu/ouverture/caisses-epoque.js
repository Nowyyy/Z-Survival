// Lot 9i (atelier, avant le « GO 9i ») : caisses d'époque des ouvertures en 3D, mêmes dimensions et mêmes places des « ? » que caisseGeo
// (js/menu/ouverture/modeles.js) : Équipement (modele militaire) → caisse de munitions américaine en bois (planches, tasseaux, poignées de corde,
// pochoir jaune inventé) ; Personnages (veterans) → cantine de soldat en bois peint à ferrures (nom inventé peint sur le couvercle) ; Cosmétiques
// (tenues) → valise de cuir des années 40 (sangles, boucles, coins renforcés, poignée). Textures sur canevas aux jetons --ouv-* ; aucune image,
// aucune marque, aucun symbole. Chargé à la demande (import dynamique), jamais au démarrage du menu.
import * as THREE from 'three';
import { CAISSE, fusion, piece } from './modeles.js';

export const FORMES_EPOQUE = Object.freeze({ militaire: 'munitions', veterans: 'cantine', tenues: 'valise' });
// Textes peints (inventés, génériques : aucune unité réelle, aucune marque).
export const TEXTES_EPOQUE = Object.freeze({ munitions: ['CAL .30', 'BALL M2'], couvercleMunitions: 'LOT 42-B', cantine: 'PVT  R. MARCEAU' });
// Jetons : corps (texture), garniture (couleur unie).
export const JETONS_EPOQUE = Object.freeze({
  munitions: { corps: '--ouv-munitions', garniture: '--ouv-corde' },
  cantine: { corps: '--ouv-cantine', garniture: '--ouv-ferrure' },
  valise: { corps: '--ouv-cuir', garniture: '--ouv-sangle-cuir' },
});

const boite = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const HAUT = new THREE.Vector3(0, 1, 0);
function entre(a, b, r, n = 6) {
  const va = new THREE.Vector3(...a);
  const d = new THREE.Vector3(...b).sub(va);
  const e = new THREE.Euler().setFromQuaternion(new THREE.Quaternion().setFromUnitVectors(HAUT, d.clone().normalize()));
  return piece(new THREE.CylinderGeometry(r, r, d.length(), n), va.addScaledVector(d, 0.5).toArray(), [e.x, e.y, e.z]);
}

// Même forme de sortie que caisseGeo : { forme, corps: { principal, garniture }, couvercle: { principal, garniture }, interieur, q, haut }.
export function caisseGeoEpoque(modele) {
  const forme = FORMES_EPOQUE[modele] ?? 'munitions';
  const { w, d, h, couvercle: hc } = CAISSE;
  const corps = [];
  const garniture = [];
  const cp = [];
  const cg = [];
  if (forme === 'munitions') {
    corps.push(piece(boite(w - 4, h, d - 4), [0, h / 2, 0]));
    // Tasseaux verticaux aux deux bouts (bois, même texture) et poignées de corde en boucle.
    for (const sx of [-1, 1]) {
      corps.push(piece(boite(4, h, d - 2), [sx * (w / 2 - 1), h / 2, 0]));
      garniture.push(entre([sx * (w / 2 + 1), h * 0.62, -14], [sx * (w / 2 + 6), h * 0.5, -6], 1.4));
      garniture.push(entre([sx * (w / 2 + 6), h * 0.5, -6], [sx * (w / 2 + 6), h * 0.5, 6], 1.4));
      garniture.push(entre([sx * (w / 2 + 6), h * 0.5, 6], [sx * (w / 2 + 1), h * 0.62, 14], 1.4));
    }
    cp.push(piece(boite(w, hc, d), [0, hc / 2, 0]));
    for (const x of [-w * 0.3, w * 0.3]) cp.push(piece(boite(8, 3, d), [x, hc + 1.5, 0]));
    // Agrafes de fil de fer (couleur de la corde : discrètes).
    for (const sx of [-1, 1]) cg.push(piece(boite(4, 6, 2), [sx * w * 0.36, hc - 2, d / 2 + 1]));
  } else if (forme === 'cantine') {
    corps.push(piece(boite(w - 4, h, d - 4), [0, h / 2, 0]));
    // Cornières aux huit coins, poignées latérales, moraillon.
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) garniture.push(piece(boite(10, 10, 10), [sx * (w / 2 - 5), 5, sz * (d / 2 - 5)]));
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) garniture.push(piece(boite(10, 8, 10), [sx * (w / 2 - 5), h - 4, sz * (d / 2 - 5)]));
    for (const sx of [-1, 1]) {
      garniture.push(piece(boite(3, 10, 22), [sx * (w / 2), h * 0.62, 0]));
      garniture.push(entre([sx * (w / 2 + 3), h * 0.66, -9], [sx * (w / 2 + 3), h * 0.66, 9], 1.2));
    }
    garniture.push(piece(boite(12, 14, 2), [0, h - 7, d / 2 - 1]));
    cp.push(piece(boite(w, hc, d), [0, hc / 2, 0]));
    for (const z of [-d / 2 + 2, d / 2 - 2]) cg.push(piece(boite(w + 1, hc + 1, 3), [0, hc / 2, z]));
    for (const x of [-w / 2 + 2, w / 2 - 2]) cg.push(piece(boite(3, hc + 1, d + 1), [x, hc / 2, 0]));
  } else {
    // Valise de cuir : corps, coins renforcés, deux sangles avec boucles, poignée sur le couvercle.
    corps.push(piece(boite(w - 4, h, d - 8), [0, h / 2, 0]));
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) corps.push(piece(boite(9, 9, 9), [sx * (w / 2 - 5), 4.5, sz * (d / 2 - 7)]));
    for (const x of [-w * 0.24, w * 0.24]) {
      garniture.push(piece(boite(8, h + 1, d - 6), [x, h / 2, 0]));
      garniture.push(piece(boite(12, 9, 2), [x, h * 0.62, d / 2 - 2.6]));
    }
    cp.push(piece(boite(w - 2, hc, d - 6), [0, hc / 2, 0]));
    cg.push(piece(new THREE.TorusGeometry(10, 2.2, 6, 10, Math.PI), [0, hc, 0]));
    for (const x of [-w * 0.24, w * 0.24]) cg.push(piece(boite(8, hc + 1, d - 4), [x, hc / 2, 0]));
  }
  const top = h;
  const interieur = fusion([piece(new THREE.PlaneGeometry(w * 0.86, d * 0.8), [0, top + 0.6, 0], [-Math.PI / 2, 0, 0])]);
  const zf = (forme === 'valise' ? d / 2 - 4 : d / 2 - 2) + 0.9;
  const q = fusion([
    piece(new THREE.PlaneGeometry(34, 34), [0, top * 0.52, zf]),
    piece(new THREE.PlaneGeometry(15, 15), [-w * 0.33, top * 0.4, zf]),
    piece(new THREE.PlaneGeometry(15, 15), [w * 0.33, top * 0.4, zf]),
    piece(new THREE.PlaneGeometry(18, 18), [w / 2 - 2 + 0.9 + (forme === 'munitions' ? 1 : 0), top * 0.5, 0], [0, Math.PI / 2, 0]),
  ]);
  return { forme, corps: { principal: fusion(corps), garniture: fusion(garniture) }, couvercle: { principal: fusion(cp), garniture: fusion(cg) }, interieur, q, haut: top };
}

const toile = (w, h) => {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')];
};
// Bruit déterministe (hachage) : jamais le hasard du navigateur.
const h01 = (k, j) => {
  const x = Math.sin(k * 12.9898 + j * 78.233) * 43758.5453;
  return x - Math.floor(x);
};

// Textures d'une forme : { corps, couvercle (CanvasTexture), liberer() }. Les faces des boîtes reçoivent la texture entière (étirée) : les textes sont
// dessinés resserrés d'après le rapport de la face avant (150 × 62) ou du dessus (150 × 80).
export function texturesEpoque(forme, couleur, anisotropie = 1) {
  const textures = [];
  const garder = (c) => {
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = anisotropie;
    t.needsUpdate = true;
    textures.push(t);
    return t;
  };
  const planches = (ctx, base, clair, sombre, n, graine) => {
    const H = 256 / n;
    for (let p = 0; p < n; p += 1) {
      ctx.fillStyle = couleur(p % 2 ? base : clair);
      ctx.fillRect(0, p * H, 256, H);
      ctx.strokeStyle = couleur(sombre);
      for (let v = 0; v < 10; v += 1) {
        ctx.globalAlpha = 0.15 + h01(graine + p, v) * 0.25;
        ctx.lineWidth = 0.6 + h01(v, graine + p) * 1.2;
        const y0 = p * H + h01(p * 7 + v, graine) * H;
        ctx.beginPath();
        ctx.moveTo(0, y0);
        ctx.bezierCurveTo(80, y0 + (h01(v, p) - 0.5) * 6, 170, y0 + (h01(p, v) - 0.5) * 6, 256, y0 + (h01(v + 3, p) - 0.5) * 5);
        ctx.stroke();
      }
      ctx.globalAlpha = 0.9;
      ctx.fillStyle = couleur(sombre);
      ctx.fillRect(0, p * H, 256, 2);
    }
    ctx.globalAlpha = 1;
  };
  const texte = (ctx, lignes, y0, pas, taille, jeton, resserre) => {
    ctx.save();
    ctx.fillStyle = couleur(jeton);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `700 ${taille}px Barlow, sans-serif`;
    ctx.scale(resserre, 1);
    lignes.forEach((l, i) => ctx.fillText(l, 128 / resserre, y0 + i * pas));
    ctx.restore();
  };
  const [c1, x1] = toile(256, 256);
  const [c2, x2] = toile(256, 256);
  if (forme === 'munitions') {
    planches(x1, '--ouv-munitions', '--ouv-munitions-clair', '--ouv-munitions-sombre', 3, 11);
    // Pochoir jaune dans le bas de la face (le grand « ? » occupe le milieu) ; lettres un peu usées.
    texte(x1, TEXTES_EPOQUE.munitions, 206, 34, 34, '--ouv-pochoir', 1 / 2.4);
    for (let i = 0; i < 260; i += 1) {
      x1.fillStyle = couleur('--ouv-munitions');
      x1.globalAlpha = 0.5;
      x1.fillRect(h01(i, 1) * 256, 180 + h01(i, 2) * 60, 2, 2);
    }
    x1.globalAlpha = 1;
    planches(x2, '--ouv-munitions', '--ouv-munitions-clair', '--ouv-munitions-sombre', 4, 13);
    texte(x2, [TEXTES_EPOQUE.couvercleMunitions], 128, 0, 30, '--ouv-pochoir', 1 / 1.9);
  } else if (forme === 'cantine') {
    planches(x1, '--ouv-cantine', '--ouv-cantine-clair', '--ouv-cantine-sombre', 4, 17);
    planches(x2, '--ouv-cantine', '--ouv-cantine-clair', '--ouv-cantine-sombre', 4, 19);
    // Nom peint à la main sur le couvercle (blanc cassé), un peu de travers.
    x2.save();
    x2.translate(128, 128);
    x2.rotate(-0.03);
    x2.translate(-128, -128);
    texte(x2, [TEXTES_EPOQUE.cantine], 128, 0, 34, '--ouv-nom', 1 / 1.9);
    x2.restore();
  } else {
    for (const [ctx, g] of [[x1, 23], [x2, 29]]) {
      ctx.fillStyle = couleur('--ouv-cuir');
      ctx.fillRect(0, 0, 256, 256);
      for (let i = 0; i < 1800; i += 1) {
        ctx.globalAlpha = 0.08 + h01(i, g) * 0.12;
        ctx.fillStyle = couleur(h01(g, i) < 0.5 ? '--ouv-cuir-clair' : '--ouv-cuir-sombre');
        const s = 1 + h01(i + 1, g) * 3;
        ctx.fillRect(h01(i, g + 1) * 256, h01(i, g + 2) * 256, s, s);
      }
      // Couture le long du bord.
      ctx.globalAlpha = 0.8;
      ctx.strokeStyle = couleur('--ouv-cuir-clair');
      ctx.setLineDash([5, 4]);
      ctx.lineWidth = 2;
      ctx.strokeRect(10, 10, 236, 236);
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;
    }
  }
  const corps = garder(c1);
  const couvercle = garder(c2);
  return { corps, couvercle, liberer: () => textures.forEach((t) => t.dispose()), nombre: () => textures.length };
}
