// Fenêtres à planches (lot 3) : géométrie des emplacements d'attaque, de la file d'attente et de la réparation, état des planches
// (arrachage par les zombies, réparation par le joueur). Pur : les paramètres (data/game/windows.json) et le temps (dt, borné à 0,05 s)
// arrivent en argument, aucun argument n'est modifié, aucune exception, aucun hasard.
// Les planches ne ferment le passage qu'aux zombies (closedRects) : elles ne bloquent ni le laser, ni les balles, ni la vue.
import { clampDt, isNum, num } from './vec.js';

// Valeurs de repli si windows.json manque ou est invalide (les vraies valeurs vivent dans les données).
const FALLBACK = { planks: 4, tearTime: 2.2, repairTime: 1.8, width: 140, blockDepth: 40 };
const SIDES = {
  nord: { normal: { x: 0, y: -1 }, tangent: { x: 1, y: 0 } },
  sud: { normal: { x: 0, y: 1 }, tangent: { x: 1, y: 0 } },
  ouest: { normal: { x: -1, y: 0 }, tangent: { x: 0, y: 1 } },
  est: { normal: { x: 1, y: 0 }, tangent: { x: 0, y: 1 } },
};

const pos = (n, fallback) => (isNum(n) && n > 0 ? n : fallback);
const at = (c, dir, d) => ({ x: c.x + dir.x * d, y: c.y + dir.y * d });
const isObject = (o) => o !== null && typeof o === 'object' && !Array.isArray(o);

// Nombre maximal de planches par fenêtre (entier d'au moins 1 ; 4 par défaut).
export const maxPlanksOf = (params) => (isNum(params?.planks) && params.planks >= 1 ? Math.floor(params.planks) : FALLBACK.planks);

// Position d'une place de la file (k = 0 : la plus proche du mur), au-delà de geom.queue si besoin.
export function queuePosition(geom, k, params) {
  const index = Math.max(0, Math.floor(num(k)));
  return at(geom.center, geom.normal, num(params?.slotDistance) + num(params?.queueStep) * (index + 1));
}

// win : une fenêtre de world.json { id, side, x, y, size?, gap? } (x, y : centre de l'ouverture dans le mur). Les distances de params se
// mesurent depuis ce centre le long de la normale du mur (unitaire, vers l'extérieur). Renvoie null si la fenêtre est invalide.
// gap : rectangle { x, y, w, h } de l'ouverture dans le mur (fourni par layout.js) ; sinon un rectangle de width × blockDepth au centre.
export function windowGeometry(win, params) {
  if (!isObject(win) || !isNum(win.x) || !isNum(win.y) || !Object.hasOwn(SIDES, win.side)) return null;
  const { normal, tangent } = SIDES[win.side];
  const center = { x: win.x, y: win.y };
  const width = pos(win.size, FALLBACK.width);
  const slotD = num(params?.slotDistance);
  const slotCount = Math.max(1, Math.min(8, Math.floor(num(params?.slots, 2))));
  const slots = [];
  for (let i = 0; i < slotCount; i += 1) {
    const side = slotCount === 1 ? 0 : (i / (slotCount - 1) - 0.5) * 2; // de -1 à 1 : -width/4 et +width/4 pour deux emplacements
    slots.push(at(at(center, tangent, side * (width / 4)), normal, slotD));
  }
  const queueLength = Math.max(0, Math.min(20, Math.floor(num(params?.maxQueue))));
  const queue = [];
  for (let k = 0; k < queueLength; k += 1) queue.push(queuePosition({ center, normal }, k, params));
  const g = win.gap;
  const depth = pos(params?.blockDepth, FALLBACK.blockDepth);
  const gap = isObject(g) && [g.x, g.y, g.w, g.h].every(isNum) && g.w > 0 && g.h > 0
    ? { x: g.x, y: g.y, w: g.w, h: g.h }
    : normal.x === 0
      ? { x: center.x - width / 2, y: center.y - depth / 2, w: width, h: depth }
      : { x: center.x - depth / 2, y: center.y - width / 2, w: depth, h: width };
  return {
    id: typeof win.id === 'string' ? win.id : null,
    side: win.side,
    center,
    normal: { ...normal },
    tangent: { ...tangent },
    width,
    slots,
    queue,
    entryOuter: at(center, normal, slotD),
    entryInner: at(center, normal, -num(params?.innerDistance)),
    repairSpot: at(center, normal, -num(params?.repairDistance)),
    gap,
  };
}

// Géométries de toutes les fenêtres valides, dans l'ordre de la liste.
export const windowGeometries = (list, params) => (Array.isArray(list) ? list : []).map((w) => windowGeometry(w, params)).filter((g) => g !== null && g.id !== null);

// options.planks : nombre initial de planches par fenêtre (entier de 0 au maximum) ; sinon le maximum, avec un avertissement si la valeur est
// invalide (hors bornes, non entière). Renvoie { windows: { id: { planks, maxPlanks, tearProgress, repairProgress } }, warnings }.
export function createWindowsState(geoms, params, options) {
  const max = maxPlanksOf(params);
  const warnings = [];
  let initial = max;
  if (options?.planks !== undefined) {
    if (Number.isInteger(options.planks) && options.planks >= 0 && options.planks <= max) initial = options.planks;
    else warnings.push('nombre de planches invalide : maximum');
  }
  const windows = {};
  for (const g of Array.isArray(geoms) ? geoms : []) {
    if (g && typeof g.id === 'string') windows[g.id] = { planks: initial, maxPlanks: max, tearProgress: 0, repairProgress: 0 };
  }
  return { windows, warnings };
}

const safeState = (state) => (isObject(state?.windows) ? state.windows : {});

// input : { tearing: { id: [{ zombieId, rate }] }, repairing: { id: boolean }, repairTime, repairBlocked: { id: boolean } }.
// Renvoie { state, events } ; events : { type: 'plank-torn' | 'plank-repaired' | 'window-open' | 'window-closed', windowId, planks }.
export function stepWindows(state, input, dt, params) {
  const step = clampDt(dt);
  const tearTime = pos(params?.tearTime, FALLBACK.tearTime);
  const wanted = input?.repairTime;
  const repairTime = Math.max(0.01, isNum(wanted) && wanted > 0 ? wanted : pos(params?.repairTime, FALLBACK.repairTime));
  const tearing = isObject(input?.tearing) ? input.tearing : {};
  const repairing = isObject(input?.repairing) ? input.repairing : {};
  const blocked = isObject(input?.repairBlocked) ? input.repairBlocked : {};
  const events = [];
  const windows = {};
  for (const [id, w] of Object.entries(safeState(state))) {
    const max = isNum(w?.maxPlanks) && w.maxPlanks >= 1 ? Math.floor(w.maxPlanks) : maxPlanksOf(params);
    let planks = Math.min(max, Math.max(0, Math.floor(num(w?.planks))));
    let tear = Math.max(0, num(w?.tearProgress));
    let repair = Math.max(0, num(w?.repairProgress));
    // Réparation : seulement si demandée, non bloquée et s'il manque une planche ; l'arrachage en cours est annulé.
    if (repairing[id] === true && blocked[id] !== true && planks < max) {
      tear = 0;
      repair += step / repairTime;
      while (repair >= 1 && planks < max) {
        repair -= 1;
        planks += 1;
        events.push({ type: 'plank-repaired', windowId: id, planks });
        if (planks === 1) events.push({ type: 'window-closed', windowId: id, planks });
      }
      if (planks >= max) repair = 0;
    }
    // Arrachage : chaque unité de progression fait tomber une planche, le surplus est reporté.
    const crew = Array.isArray(tearing[id]) ? tearing[id] : [];
    let force = 0;
    for (const t of crew) force += Math.max(0, num(t?.rate));
    if (planks > 0 && force > 0) {
      tear += (force * step) / tearTime;
      while (tear >= 1 && planks > 0) {
        tear -= 1;
        planks -= 1;
        events.push({ type: 'plank-torn', windowId: id, planks });
        if (planks === 0) events.push({ type: 'window-open', windowId: id, planks });
      }
    }
    if (planks === 0) tear = 0;
    windows[id] = { planks, maxPlanks: max, tearProgress: tear, repairProgress: planks >= max ? 0 : repair };
  }
  return { state: { ...(isObject(state) ? state : {}), windows }, events };
}

// Vrai si la fenêtre n'a plus de planche (inconnue : faux).
export const isOpen = (state, id) => isObject(safeState(state)[id]) && num(safeState(state)[id].planks) <= 0;

// Rectangles qui ferment les fenêtres à planches, pour les zombies seulement (aucun pour une fenêtre ouverte).
export function closedRects(state, geoms) {
  const out = [];
  for (const g of Array.isArray(geoms) ? geoms : []) {
    const w = safeState(state)[g?.id];
    if (g?.gap && isObject(w) && num(w.planks) > 0) out.push({ id: `planches-${g.id}`, x: g.gap.x, y: g.gap.y, w: g.gap.w, h: g.gap.h });
  }
  return out;
}

// Résumé { id, planks, maxPlanks, open } de chaque fenêtre, dans l'ordre des identifiants.
export function planksSummary(state) {
  return Object.entries(safeState(state)).map(([id, w]) => ({ id, planks: num(w?.planks), maxPlanks: num(w?.maxPlanks), open: num(w?.planks) <= 0 }));
}
