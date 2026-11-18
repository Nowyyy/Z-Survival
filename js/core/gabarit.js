// Lot 9e — gabarits du corps long (décision du propriétaire) : pur, sans Three.js, DOM, horloge ni hasard ; arguments jamais modifiés.
// 1) Corps long des personnages (data/game/characters-v2.json → corps : écartement des épaules, allongement des bras et avant-bras) : épaules du
//    squelette ramenées à ±epaules × (épaule du type / 11,5), os des bras plus longs pour la cinématique inverse (la pièce et ses enfants sont mis
//    à l'échelle par le personnage, mains ramenées à 1, comme l'atelier des armes du lot 9c).
// 2) Zone touchée d'un zombie couché (rampant) : une capsule dans l'axe de son corps (vers le joueur, comme son dessin ; dans un escalier : son sens
//    de marche), rayon du zombie inchangé, segment de −arriere à +avant devant son centre (valeurs de son type, enemies.json → rampant, mesurées
//    sur le corps long couché, mains écartées comprises) : elle couvre tout le corps couché. Elle sert aux balles, au laser et aux coups ; les
//    collisions (place au sol) gardent le cercle. Aucune hauteur : les balles touchent comme avant.
import { isNum, num } from './vec.js';

export const EPAULE_REFERENCE = 11.5; // écartement des épaules du squelette v2 (poses-v2.json), celui du corps « d'avant »
const obj = (v) => (v !== null && typeof v === 'object' && !Array.isArray(v) ? v : {});

// Corps valide ({ epaules, bras }) ou null (absent ou invalide : corps d'avant).
export function lireCorps(corps) {
  const c = obj(corps);
  if (!isNum(c.epaules) || c.epaules <= 0 || !isNum(c.bras) || c.bras <= 0) return null;
  return { epaules: c.epaules, bras: c.bras };
}

// Variante (characters-v2.json, résolue) au corps long : nouvelles articulations des épaules (repère du torse) ; les autres champs sont partagés.
export function varianteCorps(variant, corps) {
  const c = lireCorps(corps);
  if (!c || !variant || typeof variant !== 'object') return variant;
  const joints = { ...obj(variant.joints) };
  for (const id of ['shoulderL', 'shoulderR']) {
    const base = Array.isArray(joints[id]) ? joints[id] : [id === 'shoulderL' ? EPAULE_REFERENCE : -EPAULE_REFERENCE, 8, 0];
    const k = Math.abs(num(base[0], EPAULE_REFERENCE)) / EPAULE_REFERENCE;
    joints[id] = [Math.sign(num(base[0], id === 'shoulderL' ? 1 : -1)) * c.epaules * k, num(base[1], 8), num(base[2])];
  }
  return { ...variant, joints };
}

// Squelette d'animation (rigOf de pose-v2.js) au corps long : bras et avant-bras plus longs (cinématique inverse des mains du joueur).
export function rigCorps(rig, corps) {
  const c = lireCorps(corps);
  if (!c || !rig || typeof rig !== 'object') return rig;
  return { ...rig, upper: num(rig.upper, 10) * c.bras, fore: num(rig.fore, 9) * c.bras };
}

// Échelles d'os du corps long (multipliées par celles de la pose) : épaules × bras, poignets ÷ bras (la main garde sa taille).
export function echellesCorps(corps) {
  const c = lireCorps(corps);
  if (!c) return {};
  return { shoulderL: c.bras, shoulderR: c.bras, wristL: 1 / c.bras, wristR: 1 / c.bras };
}

// Le zombie est-il couché (dessiné en « rampe ») ? Rampant hors de l'arrachage et du passage de la fenêtre (character-v2.js : mêmes cas).
export const estCouche = (e) => e?.gait === 'rampe' && e.mode !== 'arrache' && !(e.mode === 'escalade' && num(e.climb?.t) > 0);

// Zone touchée d'un zombie : le même objet (cercle) ou une copie avec la capsule { ax, ay, bx, by } (rayon : e.r).
// player : { x, y } ; rampant : enemies.json → rampant ({ type: { arriere, avant } }, unités du jeu ; type absent : celles du marcheur).
export function zoneZombie(e, player, rampant) {
  const table = obj(rampant);
  const p = obj(table[e?.type] ?? table.marcheur);
  if (!e || !estCouche(e) || !isNum(p.arriere) || !isNum(p.avant)) return e;
  const marche = e.mode === 'escalier' && (num(e.fx) !== 0 || num(e.fy) !== 0);
  const dx = marche ? num(e.fx) : num(player?.x) - num(e.x);
  const dy = marche ? num(e.fy) : num(player?.y) - num(e.y);
  const d = Math.hypot(dx, dy);
  const ux = d > 1e-9 ? dx / d : 1;
  const uy = d > 1e-9 ? dy / d : 0;
  const back = Math.max(0, p.arriere);
  const front = Math.max(0, p.avant);
  return { ...e, ax: num(e.x) - ux * back, ay: num(e.y) - uy * back, bx: num(e.x) + ux * front, by: num(e.y) + uy * front };
}

export const aCapsule = (z) => isNum(z?.ax) && isNum(z?.ay) && isNum(z?.bx) && isNum(z?.by);

// Distance d'un point au segment [a, b].
export function distanceSegment(px, py, ax, ay, bx, by) {
  const sx = bx - ax;
  const sy = by - ay;
  const l2 = sx * sx + sy * sy;
  const t = l2 > 0 ? Math.min(1, Math.max(0, ((px - ax) * sx + (py - ay) * sy) / l2)) : 0;
  return Math.hypot(px - (ax + sx * t), py - (ay + sy * t));
}

// Distance d'un point à la zone (centre du cercle, ou segment de la capsule), sans retirer le rayon.
export const distanceZone = (z, x, y) => (aCapsule(z) ? distanceSegment(x, y, z.ax, z.ay, z.bx, z.by) : Math.hypot(num(x) - num(z?.x), num(y) - num(z?.y)));

// Plus petit t ≥ 0 (≤ tMax) où le point x0 + t·s entre dans le cercle (cx, cy, rad) ; null sinon. Départ dedans : 0.
function entreeCercle(x0, y0, sx, sy, cx, cy, rad, tMax) {
  const fx = x0 - cx;
  const fy = y0 - cy;
  const c = fx * fx + fy * fy - rad * rad;
  if (c <= 0) return 0;
  const a = sx * sx + sy * sy;
  if (!(a > 0)) return null;
  const b = fx * sx + fy * sy;
  const disc = b * b - a * c;
  if (disc < -1e-9 * (b * b + a * Math.abs(c))) return null;
  const t = (-b - Math.sqrt(Math.max(0, disc))) / a;
  return t >= 0 && t <= tMax ? t : null;
}

// Plus petit t dans [0, tMax] où le point x0 + t·s entre dans la capsule (segment a–b, rayon rad) ; null sinon. Exact : deux bouts ronds et le corps
// (bande de demi-largeur rad, projection dans [0, longueur]).
export function entreeCapsule(x0, y0, sx, sy, z, rad, tMax = 1) {
  const ex = z.bx - z.ax;
  const ey = z.by - z.ay;
  const len = Math.hypot(ex, ey);
  let best = null;
  const keep = (t) => {
    if (t !== null && t >= 0 && t <= tMax && (best === null || t < best)) best = t;
  };
  keep(entreeCercle(x0, y0, sx, sy, z.ax, z.ay, rad, tMax));
  keep(entreeCercle(x0, y0, sx, sy, z.bx, z.by, rad, tMax));
  if (len > 1e-9) {
    const ux = ex / len;
    const uy = ey / len;
    // Distance signée à l'axe (d0 + t·dd) et projection (u0 + t·du), toutes deux linéaires en t.
    const d0 = (x0 - z.ax) * -uy + (y0 - z.ay) * ux;
    const dd = sx * -uy + sy * ux;
    const u0 = (x0 - z.ax) * ux + (y0 - z.ay) * uy;
    const du = sx * ux + sy * uy;
    let lo = 0;
    let hi = tMax;
    const bande = (v0, dv, min, max) => {
      if (Math.abs(dv) < 1e-12) {
        if (v0 < min || v0 > max) hi = -1;
        return;
      }
      const t1 = (min - v0) / dv;
      const t2 = (max - v0) / dv;
      lo = Math.max(lo, Math.min(t1, t2));
      hi = Math.min(hi, Math.max(t1, t2));
    };
    bande(d0, dd, -rad, rad);
    bande(u0, du, 0, len);
    if (lo <= hi) keep(lo);
  }
  return best;
}
