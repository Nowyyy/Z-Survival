// Apparition des zombies : toutes les N secondes, à un point de la liste (ouvertures de fenêtre au lot 1m, points du décor depuis le
// lot 1b), jamais plus de maxPresent. Avec une vue, seuls les points hors de la vue (agrandie) sont choisis : rien n'apparaît à l'écran.
import { floorOf, isFloorId } from './floors.js';
import { nextInt } from './rng.js';
import { clampDt, isNum, num } from './vec.js';

export const createSpawner = () => ({ timer: 0 });

// Rectangle visible { minX, minY, maxX, maxY } agrandi de margin unités de chaque côté, puis de ratio (0,25 = 25 %) sur chaque dimension.
// Renvoie un nouveau rectangle, ou null si la vue est invalide.
export function inflateView(view, margin = 0, ratio = 0) {
  if (!view || ![view.minX, view.minY, view.maxX, view.maxY].every(isNum)) return null;
  const m = Math.max(0, num(margin));
  const k = 1 + Math.max(0, num(ratio));
  const cx = (view.minX + view.maxX) / 2;
  const cy = (view.minY + view.maxY) / 2;
  const hw = ((Math.abs(view.maxX - view.minX) / 2 + m) * k);
  const hh = ((Math.abs(view.maxY - view.minY) / 2 + m) * k);
  return { minX: cx - hw, minY: cy - hh, maxX: cx + hw, maxY: cy + hh };
}

// Vrai si le point est hors de la vue agrandie. Sans vue valide : toujours vrai (vue illimitée, comportement du lot 1m).
export function isHidden(point, view, margin = 0, ratio = 0) {
  const v = inflateView(view, margin, ratio);
  if (v === null) return true;
  const x = num(point?.x);
  const y = num(point?.y);
  return x < v.minX || x > v.maxX || y < v.minY || y > v.maxY;
}

// Renvoie { state, spawn: { x, y, id?, fenetre? } | null, rng }. Le délai ne court que tant qu'il reste de la place ; si tous les
// points sont en vue, le zombie attend (le délai reste écoulé) et apparaît dès qu'un point sort de la vue. view : rectangle visible
// (facultatif) ; def.viewMargin et def.viewRatio règlent son agrandissement.
// Lot 3e : playerFloor (étage du joueur) : la vue n'est celle que de cet étage ; un point d'un autre étage (champ floor) est toujours « hors de la vue ». Sans playerFloor,
// comportement d'avant ; un point sans champ floor est au rez-de-chaussée.
export function stepSpawner(state, dt, present, def, windows, rng, view = null, playerFloor = null) {
  const interval = isNum(def?.spawnInterval) && def.spawnInterval > 0 ? def.spawnInterval : Infinity;
  const max = isNum(def?.maxPresent) ? def.maxPresent : 0;
  const spots = Array.isArray(windows) ? windows.filter((w) => isNum(w?.x) && isNum(w?.y)) : [];
  if (num(present) >= max || spots.length === 0) return { state: { timer: 0 }, spawn: null, rng };
  const timer = num(state?.timer) + clampDt(dt);
  if (timer < interval) return { state: { timer }, spawn: null, rng };
  const otherFloor = (p) => isFloorId(playerFloor) && floorOf(p) !== playerFloor;
  const usable = view ? spots.filter((p) => otherFloor(p) || isHidden(p, view, def?.viewMargin, def?.viewRatio)) : spots;
  if (usable.length === 0) return { state: { timer: interval }, spawn: null, rng };
  const { value, rng: next } = nextInt(rng, usable.length);
  const p = usable[value];
  const spawn = { x: p.x, y: p.y };
  if (p.id !== undefined) spawn.id = p.id;
  if (p.fenetre !== undefined) spawn.fenetre = p.fenetre;
  if (p.floor !== undefined) spawn.floor = floorOf(p);
  return { state: { timer: timer - interval }, spawn, rng: next };
}
