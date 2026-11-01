// Lot 3g (retours du propriétaire) : mur « percé » autour du joueur caché. Seulement quand le joueur est caché à la caméra (hiddenFrom : rayons de la caméra vers sa
// tête, sa poitrine, ses pieds et ses côtés, contre les boîtes des murs, piliers, meubles et portes), un point d'un mur (ou d'un meuble, d'une porte) entre la caméra et
// le joueur, dans un cône autour de la ligne de visée (rayon `radius` à la hauteur du joueur, plus étroit vers la caméra : un disque de taille constante à l'écran) et
// plus près de la caméra que le joueur à l'horizontale (`ahead` unités au moins : un mur derrière lui n'est jamais tramé), est tramé : une moitié des pixels (une sur
// quatre au bord) n'est pas dessinée. Aucun matériau transparent, aucun tri, aucun post-traitement ; le shader (js/game/see-through.js) fait le même calcul.
// Pur : aucune dépendance au rendu.
import { isNum, num } from './vec.js';

export const DEFAULTS = Object.freeze({ radius: 80, chest: 26, edge: 0.7, minY: 1, far: 0.98, ahead: 12, head: 46, feet: 6, side: 14 });

// Réglages lus dans render.json (seeThrough) ; null ou { on: false } : désactivé.
export function seeThroughSettings(cfg) {
  if (cfg === null || typeof cfg !== 'object' || cfg.on === false) return null;
  const pos = (v, d) => (isNum(v) && v > 0 ? v : d);
  return {
    radius: pos(cfg.radius, DEFAULTS.radius), chest: pos(cfg.chest, DEFAULTS.chest), edge: Math.min(0.95, pos(cfg.edge, DEFAULTS.edge)), minY: num(cfg.minY, DEFAULTS.minY),
    far: Math.min(0.999, pos(cfg.far, DEFAULTS.far)), ahead: pos(cfg.ahead, DEFAULTS.ahead), head: pos(cfg.head, DEFAULTS.head), feet: pos(cfg.feet, DEFAULTS.feet), side: pos(cfg.side, DEFAULTS.side),
  };
}

const okPoint = (v) => v && isNum(v.x) && isNum(v.y) && isNum(v.z);

// Part de pixels retirés au point p (x, y, z de la scène) : 0 (dessiné), 0,25 (bord du cône) ou 0,5 (cœur), pour une caméra et un joueur (x, y, z de la scène),
// le joueur étant caché.
export function seeThroughLevel(p, camera, player, s = DEFAULTS) {
  if (![p, camera, player].every(okPoint)) return 0;
  const d = { x: player.x - camera.x, y: player.y - camera.y, z: player.z - camera.z };
  const l2 = Math.max(d.x * d.x + d.y * d.y + d.z * d.z, 1);
  const t = ((p.x - camera.x) * d.x + (p.y - camera.y) * d.y + (p.z - camera.z) * d.z) / l2;
  if (!(t > 0 && t < s.far) || !(p.y > s.minY)) return 0;
  // À l'horizontale, plus près de la caméra que le joueur d'au moins `ahead`.
  const hl = Math.max(Math.hypot(d.x, d.z), 1);
  const along = ((p.x - camera.x) * d.x + (p.z - camera.z) * d.z) / hl;
  if (!(along < hl - s.ahead)) return 0;
  const r = Math.hypot(p.x - (camera.x + d.x * t), p.y - (camera.y + d.y * t), p.z - (camera.z + d.z * t));
  const R = s.radius * t;
  if (r >= R) return 0;
  return r < R * s.edge ? 0.5 : 0.25;
}

// Vrai si le segment a → b traverse la boîte { x0, x1, y0, y1, z0, z1 } (méthode des tranches), en dehors de ses deux bouts.
export function segmentHitsBox(a, b, box) {
  let t0 = 1e-4;
  let t1 = 1 - 1e-4;
  for (const [k0, k1, c] of [['x0', 'x1', 'x'], ['y0', 'y1', 'y'], ['z0', 'z1', 'z']]) {
    const d = b[c] - a[c];
    if (Math.abs(d) < 1e-12) {
      if (a[c] < box[k0] || a[c] > box[k1]) return false;
      continue;
    }
    let u = (box[k0] - a[c]) / d;
    let v = (box[k1] - a[c]) / d;
    if (u > v) [u, v] = [v, u];
    t0 = Math.max(t0, u);
    t1 = Math.min(t1, v);
    if (t0 > t1) return false;
  }
  return true;
}

// Points du joueur visés par les rayons : tête, poitrine, pieds, et la poitrine de chaque côté (perpendiculaire à la visée).
export function playerTargets(camera, player, s = DEFAULTS) {
  if (!okPoint(camera) || !okPoint(player)) return [];
  const dx = player.x - camera.x;
  const dz = player.z - camera.z;
  const l = Math.hypot(dx, dz) || 1;
  const side = { x: -dz / l, z: dx / l };
  const at = (y, k = 0) => ({ x: player.x + side.x * k, y: player.y + y, z: player.z + side.z * k });
  return [at(s.head), at(s.chest), at(s.feet), at(s.chest, s.side), at(s.chest, -s.side)];
}

// Le joueur est-il caché (au moins un rayon de la caméra vers lui coupé par une boîte) ? `offset(box)` : décalage vertical de la boîte (étage, élévation).
export function hiddenFrom(camera, player, boxes, s = DEFAULTS, offset = () => 0) {
  const targets = playerTargets(camera, player, s);
  if (targets.length === 0 || !Array.isArray(boxes)) return false;
  const minX = Math.min(camera.x, player.x) - s.side;
  const maxX = Math.max(camera.x, player.x) + s.side;
  const minZ = Math.min(camera.z, player.z) - s.side;
  const maxZ = Math.max(camera.z, player.z) + s.side;
  for (const box of boxes) {
    if (!box || box.x1 < minX || box.x0 > maxX || box.z1 < minZ || box.z0 > maxZ) continue;
    const dy = num(offset(box));
    const b = dy === 0 ? box : { ...box, y0: box.y0 + dy, y1: box.y1 + dy };
    if (targets.some((t) => segmentHitsBox(camera, t, b))) return true;
  }
  return false;
}
