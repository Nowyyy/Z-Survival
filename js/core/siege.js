// Siège des fenêtres (lot 3) : modes des zombies, emplacements d'attaque, file d'attente, escalade, auto-correction. Pur : ne déplace
// personne, il décide des modes et des intentions (target, hold, climb) ; enemy-ai.js les exécute. Les positions, le temps (dt borné),
// les planches (windows.js) et les paramètres (data/game/windows.json) arrivent en argument ; aucun argument n'est modifié, aucune
// exception, aucun hasard (égalités départagées par l'ordre d'arrivée puis l'identifiant).
//
// Modes : approche (vers la fenêtre visée), attente (dans la file), arrache (à un emplacement, arrache les planches), escalade (traverse
// l'ouverture), dedans (comportement normal), libre (aucun siège : lot 2c). Tout l'état du siège est porté par les zombies eux-mêmes :
// un zombie tué libère donc sa place, son rang et son escalade aussitôt.
import { clampDt, isNum, num } from './vec.js';
import { queuePosition } from './windows.js';

export const MODES = ['approche', 'attente', 'arrache', 'escalade', 'dedans', 'libre'];
const SIEGE = new Set(['approche', 'attente', 'arrache', 'escalade', 'dedans']);

const dist = (a, b) => Math.hypot(num(a?.x) - num(b?.x), num(a?.y) - num(b?.y));
const byArrival = (a, b) => (num(a.ord, Infinity) - num(b.ord, Infinity)) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
const copyClimb = (c) => (c ? { from: { ...c.from }, to: { ...c.to }, t: c.t } : null);
const isObject = (o) => o !== null && typeof o === 'object' && !Array.isArray(o);

// Distance, depuis entryOuter, à laquelle un zombie rejoint la file à la place k (au bout de la file).
const joinDistance = (k, p) => Math.max(num(p.approachRadius, 140), num(p.queueStep) * (k + 1) + num(p.joinMargin, 40));

// zombies : [{ id, x, y, mode, window, tearMul?, slot?, qi?, ord?, climb?, outsideT?, walkT? }] ; windowsState : sortie de windows.js ;
// geoms : windowGeometry de chaque fenêtre ; params : windows.json plus { bounds } (limites de la salle, pour l'auto-correction).
// Renvoie { zombies (nouveaux objets, même ordre, avec mode, slot, qi, ord, climb, target, hold), tearing, repairBlocked, events }.
// events : { type: 'climb' | 'enter' | 'stranded', windowId, id }.
export function stepSiege(zombies, windowsState, geoms, dt, params) {
  const step = clampDt(dt);
  const p = isObject(params) ? params : {};
  const list = Array.isArray(zombies) ? zombies : [];
  const geomList = (Array.isArray(geoms) ? geoms : []).filter((g) => g && typeof g.id === 'string' && g.center && g.entryOuter && g.entryInner && Array.isArray(g.slots));
  const byId = new Map(geomList.map((g) => [g.id, g]));
  const states = isObject(windowsState?.windows) ? windowsState.windows : {};
  const events = [];
  const tearing = {};
  const repairBlocked = {};

  // Copies de travail ; les zombies hors siège (libre, sans mode, fenêtre inconnue) sont recopiés tels quels.
  const out = list.map((z) => {
    if (!isObject(z)) return z;
    const c = { ...z };
    if (c.climb) c.climb = copyClimb(c.climb);
    return c;
  });
  const active = out.filter((z) => isObject(z) && SIEGE.has(z.mode) && isNum(z.x) && isNum(z.y));

  // Auto-correction : un zombie « dedans » resté plus de strandedTime hors de la salle repasse en approche vers la fenêtre la plus proche.
  const b = p.bounds;
  const hasInside = typeof p.inside === 'function'; // carte à murs (lot 3b) : l'intérieur n'est pas un rectangle
  if ((hasInside || (b && [b.minX, b.minY, b.maxX, b.maxY].every(isNum))) && geomList.length > 0) {
    for (const z of active) {
      if (z.mode !== 'dedans') continue;
      const outside = hasInside ? !p.inside(z.x, z.y) : z.x < b.minX || z.x > b.maxX || z.y < b.minY || z.y > b.maxY;
      z.outsideT = outside ? num(z.outsideT) + step : 0;
      if (outside && z.outsideT > num(p.strandedTime, 3)) {
        let best = geomList[0];
        for (const g of geomList) if (dist(z, g.center) < dist(z, best.center)) best = g;
        z.mode = 'approche';
        z.window = best.id;
        z.slot = null;
        z.qi = null;
        z.ord = undefined;
        z.climb = null;
        z.outsideT = 0;
        z.walkT = 0;
        events.push({ type: 'stranded', windowId: best.id, id: z.id });
      }
    }
  }

  for (const g of geomList) {
    const win = states[g.id];
    const open = isObject(win) && num(win.planks) <= 0;
    const mine = active.filter((z) => z.window === g.id && z.mode !== 'dedans' && z.mode !== 'libre');
    let nextOrd = 1 + mine.reduce((m, z) => Math.max(m, num(z.ord)), 0);
    const arrive = (z) => {
      z.ord = nextOrd;
      nextOrd += 1;
    };

    // 1. Grimpeurs : avancent vers le bord extérieur, puis traversent en climbTime secondes, puis passent « dedans ».
    for (const z of mine.filter((m) => m.mode === 'escalade')) {
      const climb = z.climb ?? (z.climb = { from: { ...g.entryOuter }, to: { ...g.entryInner }, t: 0 });
      if (climb.t <= 0) {
        z.walkT = num(z.walkT) + step;
        const atGate = dist(z, climb.from) <= num(p.gateTolerance, 14);
        if (!atGate && z.walkT > num(p.walkLimit, 3)) climb.from = { x: z.x, y: z.y }; // bloqué : l'escalade part d'où il est
        if (atGate || z.walkT > num(p.walkLimit, 3)) climb.t = Math.max(climb.t, 1e-9);
      }
      if (climb.t > 0) {
        climb.t += step / Math.max(0.05, num(p.climbTime, 1.2));
        if (climb.t >= 1) {
          z.mode = 'dedans';
          z.climb = null;
          z.slot = null;
          z.qi = null;
          z.walkT = 0;
          events.push({ type: 'enter', windowId: g.id, id: z.id });
        }
      }
    }
    const climbing = () => mine.filter((m) => m.mode === 'escalade').length;
    const maxClimbers = Math.max(0, Math.floor(num(p.maxClimbers, 2)));
    const startClimb = (z) => {
      z.mode = 'escalade';
      z.slot = null;
      z.qi = null;
      z.walkT = 0;
      z.climb = { from: { ...g.entryOuter }, to: { ...g.entryInner }, t: 0 };
      events.push({ type: 'climb', windowId: g.id, id: z.id });
    };
    const freeSlot = (z) => {
      const taken = new Set(mine.filter((m) => m.mode === 'arrache').map((m) => m.slot));
      let best = -1;
      let bestD = Infinity;
      g.slots.forEach((s, i) => {
        if (taken.has(i)) return;
        const d = dist(z, s);
        if (d < bestD) {
          bestD = d;
          best = i;
        }
      });
      return best;
    };
    const takeSlot = (z, i) => {
      z.mode = 'arrache';
      z.slot = i;
      z.qi = null;
      z.climb = null;
    };
    const queueMembers = () => mine.filter((m) => m.mode === 'attente').sort(byArrival);

    if (open) {
      // 2a. Fenêtre ouverte : arracheurs et file se disputent l'escalade dans l'ordre d'arrivée ; les autres arracheurs rejoignent la file.
      const rivals = mine.filter((m) => m.mode === 'arrache' || m.mode === 'attente').sort(byArrival);
      for (const z of rivals) {
        if (climbing() < maxClimbers) startClimb(z);
        else if (z.mode === 'arrache') {
          z.mode = 'attente';
          z.slot = null;
        }
      }
    } else {
      // 2b. Fenêtre fermée : la file avance vers les emplacements libres.
      for (const z of queueMembers()) {
        const i = freeSlot(z);
        if (i < 0) break;
        takeSlot(z, i);
      }
    }

    // 3. Arrivants : emplacement, escalade ou file d'attente ; sinon ils s'arrêtent loin du mur si la file est pleine.
    const arrivals = mine.filter((m) => m.mode === 'approche').sort((a, c) => dist(a, g.entryOuter) - dist(c, g.entryOuter) || (a.id < c.id ? -1 : 1));
    for (const z of arrivals) {
      const d = dist(z, g.entryOuter);
      z.hold = false;
      if (open) {
        if (climbing() < maxClimbers && d <= num(p.approachRadius, 140)) {
          arrive(z);
          startClimb(z);
          continue;
        }
      } else {
        const i = freeSlot(z);
        if (i >= 0 && d <= num(p.approachRadius, 140) && queueMembers().length === 0) {
          arrive(z);
          takeSlot(z, i);
          continue;
        }
      }
      const slotsFull = open ? climbing() >= maxClimbers : freeSlot(z) < 0 || queueMembers().length > 0;
      if (!slotsFull) continue;
      const n = queueMembers().length;
      if (n >= Math.max(0, Math.floor(num(p.maxQueue, 6)))) {
        z.hold = dist(z, g.center) <= num(p.holdDistance, 400);
      } else if (d <= joinDistance(n, p)) {
        arrive(z);
        z.mode = 'attente';
        z.slot = null;
      }
    }

    // 4. Rangs de la file (dans l'ordre d'arrivée) et intentions.
    queueMembers().forEach((z, k) => {
      z.qi = k;
    });
    const crew = mine.filter((m) => m.mode === 'arrache').sort(byArrival);
    const list2 = [];
    for (const z of crew.slice(0, Math.max(0, Math.floor(num(p.activeTearers, 2))))) {
      if (dist(z, g.slots[z.slot] ?? g.center) <= num(p.slotTolerance, 26)) list2.push({ zombieId: z.id, rate: Math.max(0, num(z.tearMul, 1)) });
    }
    tearing[g.id] = list2;
    repairBlocked[g.id] = mine.some((m) => m.mode === 'arrache' || m.mode === 'escalade');
  }

  for (const z of active) {
    const g = byId.get(z.window);
    z.hold = z.mode === 'approche' ? z.hold === true : false;
    if (!g) {
      z.target = null;
      continue;
    }
    if (z.mode === 'approche') z.target = { ...g.entryOuter };
    else if (z.mode === 'attente') z.target = Number.isInteger(z.qi) && z.qi >= 0 && g.queue[z.qi] ? { ...g.queue[z.qi] } : queuePosition(g, num(z.qi), p);
    else if (z.mode === 'arrache') z.target = { ...(g.slots[z.slot] ?? g.entryOuter) };
    else if (z.mode === 'escalade') z.target = z.climb && z.climb.t <= 0 ? { ...z.climb.from } : null;
    else z.target = null;
  }
  return { zombies: out, tearing, repairBlocked, events };
}

// Résumé d'une fenêtre pour les tests et l'interface : { tearers, climbers, queue } (nombres de zombies par mode).
export function occupancy(zombies, windowId) {
  const mine = (Array.isArray(zombies) ? zombies : []).filter((z) => isObject(z) && z.window === windowId);
  return {
    tearers: mine.filter((z) => z.mode === 'arrache').length,
    climbers: mine.filter((z) => z.mode === 'escalade').length,
    queue: mine.filter((z) => z.mode === 'attente').length,
  };
}
