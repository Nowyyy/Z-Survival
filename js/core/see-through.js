// Lot 3g (retours du propriétaire) : mur « percé » autour du joueur caché. Un point d'un mur (ou d'un meuble, d'une porte) entre la caméra et le joueur, dans un cône
// autour de la ligne de visée (rayon `radius` à la hauteur du joueur, plus étroit vers la caméra : un disque de taille constante à l'écran), est tramé : une moitié des
// pixels (une sur quatre au bord) n'est pas dessinée. Aucun matériau transparent, aucun tri, aucun post-traitement ; le shader (js/game/see-through.js) fait le même calcul.
// Pur : aucune dépendance au rendu.
import { isNum, num } from './vec.js';

export const DEFAULTS = Object.freeze({ radius: 46, chest: 26, edge: 0.7, minY: 1, far: 0.98 });

// Réglages lus dans render.json (seeThrough) ; null ou { on: false } : désactivé.
export function seeThroughSettings(cfg) {
  if (cfg === null || typeof cfg !== 'object' || cfg.on === false) return null;
  const pos = (v, d) => (isNum(v) && v > 0 ? v : d);
  return { radius: pos(cfg.radius, DEFAULTS.radius), chest: pos(cfg.chest, DEFAULTS.chest), edge: Math.min(0.95, pos(cfg.edge, DEFAULTS.edge)), minY: num(cfg.minY, DEFAULTS.minY), far: Math.min(0.999, pos(cfg.far, DEFAULTS.far)) };
}

// Part de pixels retirés au point p (x, y, z de la scène) : 0 (dessiné), 0,25 (bord du cône) ou 0,5 (cœur), pour une caméra et un joueur (x, y, z de la scène).
export function seeThroughLevel(p, camera, player, s = DEFAULTS) {
  if (![p, camera, player].every((v) => v && isNum(v.x) && isNum(v.y) && isNum(v.z))) return 0;
  const d = { x: player.x - camera.x, y: player.y - camera.y, z: player.z - camera.z };
  const l2 = Math.max(d.x * d.x + d.y * d.y + d.z * d.z, 1);
  const t = ((p.x - camera.x) * d.x + (p.y - camera.y) * d.y + (p.z - camera.z) * d.z) / l2;
  if (!(t > 0 && t < s.far) || !(p.y > s.minY)) return 0;
  const r = Math.hypot(p.x - (camera.x + d.x * t), p.y - (camera.y + d.y * t), p.z - (camera.z + d.z * t));
  const R = s.radius * t;
  if (r >= R) return 0;
  return r < R * s.edge ? 0.5 : 0.25;
}
