// Directeur de vagues : machine à états pure. attente (compte à rebours avant une vague) → apparition (la vague se remplit) → combat (tout est
// apparu, il reste des zombies) → terminee (un instant : soigner le joueur) → attente de la vague suivante. inactif : aucune vague (?nospawn=1).
// Rien n'est lu ni écrit ailleurs : le temps (dt, borné), le nombre de vivants, la vue et les points d'apparition arrivent en argument à chaque
// appel (les niveaux futurs changeront de points sans toucher ce module). Le choix du point reste celui de spawner.js (hors de la vue).
import { createRng } from './rng.js';
import { stepSpawner } from './spawner.js';
import { clampDt, isNum, num } from './vec.js';
import { waveOrder, waveSpec } from './waves.js';

export const PHASES = ['inactif', 'attente', 'apparition', 'combat', 'terminee'];

const mix = (seed, wave) => (Math.imul((Number.isInteger(seed) ? seed : 1) | 0, 0x9e3779b1) ^ Math.imul(wave | 0, 0x85ebca6b)) >>> 0;

// Prépare une vague : sa spécification, son ordre de zombies et son compte à rebours (3 s avant la vague 1, 8 s entre deux vagues).
function prepare(state, wave, waitLeft) {
  const spec = waveSpec(wave, state.params);
  return {
    ...state,
    phase: 'attente',
    wave: spec.wave,
    spec,
    order: waveOrder(spec, mix(state.seed, spec.wave), state.params?.order),
    spawned: 0,
    sinceSpawn: Infinity,
    waitLeft: waitLeft ?? spec.intermission,
  };
}

// params : data/game/waves.json ; options : { seed, wave (1 par défaut), inactive }.
export function createDirector(params, { seed = 1, wave = 1, inactive = false } = {}) {
  const base = { params: params !== null && typeof params === 'object' ? params : {}, seed: Number.isInteger(seed) ? seed : 1, alive: 0, rng: createRng(mix(seed, 7)) };
  const state = prepare({ ...base, phase: 'inactif' }, wave, null);
  return inactive ? { ...state, phase: 'inactif', waitLeft: 0 } : { ...state, waitLeft: Math.max(0, num(base.params.intermission?.first, 3)) };
}

// Saute à la vague n (compte à rebours de départ de 3 s) ; un directeur inactif le reste.
export function startWave(state, n) {
  const s = state ?? createDirector({});
  if (s.phase === 'inactif') return s;
  const first = prepare(s, n, null);
  return { ...first, waitLeft: num(first.params?.intermission?.first, 3) };
}

// Remplace les paramètres (tests rapides) : la vague courante est recalculée, les apparitions déjà faites sont conservées au plus.
export function setParams(state, params) {
  const s = state ?? createDirector({});
  const next = prepare({ ...s, params: params !== null && typeof params === 'object' ? params : {} }, s.wave, s.waitLeft);
  return { ...next, phase: s.phase, spawned: Math.min(s.spawned, next.spec.total), sinceSpawn: s.sinceSpawn };
}

// Vue pour l'interface et les tests : { active, phase, wave, level, total, toSpawn, alive, remaining, maxConcurrent, waitLeft, reinforced,
// healFraction, spawnInterval }.
export function info(state) {
  const s = state ?? createDirector({}, { inactive: true });
  const active = s.phase !== 'inactif';
  const toSpawn = active ? Math.max(0, s.spec.total - s.spawned) : 0;
  const alive = active ? s.alive : 0;
  return {
    active,
    phase: s.phase,
    wave: active ? s.wave : 0,
    level: active ? s.spec.level : 0,
    total: active ? s.spec.total : 0,
    toSpawn,
    alive,
    remaining: toSpawn + alive,
    maxConcurrent: s.spec.maxConcurrent,
    waitLeft: s.phase === 'attente' ? Math.max(0, s.waitLeft) : 0,
    reinforced: s.spec.reinforced,
    healFraction: s.spec.healFraction,
    spawnInterval: s.spec.spawnInterval,
  };
}

// input : { dt, alive (zombies vivants), view (rectangle visible), points (points d'apparition { id, x, y, fenetre? }) }.
// Renvoie { state, requests, events } : au plus une demande { pointId, type, gait, x, y, fenetre? } par appel ; événements
// { type: 'waveStart', wave, level, reinforced } et { type: 'waveEnd', wave, healFraction } (le soin à appliquer au joueur).
export function stepDirector(state, input) {
  const requests = [];
  const events = [];
  let s = state !== null && typeof state === 'object' && state.spec ? state : createDirector({}, { inactive: true });
  const dt = clampDt(input?.dt);
  const alive = isNum(input?.alive) ? Math.max(0, Math.floor(input.alive)) : 0;
  s = { ...s, alive };
  if (s.phase === 'inactif') return { state: s, requests, events };

  if (s.phase === 'terminee') s = prepare(s, s.wave + 1, null);
  if (s.phase === 'attente') {
    const waitLeft = s.waitLeft - dt;
    if (waitLeft > 0) return { state: { ...s, waitLeft }, requests, events };
    s = { ...s, phase: 'apparition', waitLeft: 0 };
    events.push({ type: 'waveStart', wave: s.wave, level: s.spec.level, reinforced: s.spec.reinforced });
  } else s = { ...s, sinceSpawn: s.sinceSpawn + dt };

  let spawnedNow = false;
  if (s.phase === 'apparition') {
    const { spec } = s;
    if (s.spawned < spec.total && alive < spec.maxConcurrent && s.sinceSpawn >= spec.spawnInterval) {
      const view = input?.view ?? null;
      const points = Array.isArray(input?.points) ? input.points : [];
      const def = { spawnInterval: spec.spawnInterval, maxPresent: spec.maxConcurrent, viewMargin: s.params?.spawn?.viewMargin, viewRatio: s.params?.spawn?.viewRatio };
      // Le délai est déjà écoulé : spawner.js choisit seulement le point, hors de la vue (rien n'apparaît si tous les points sont en vue).
      const pick = stepSpawner({ timer: spec.spawnInterval }, 0, alive, def, points, s.rng, view);
      if (pick.spawn) {
        const z = s.order[s.spawned];
        requests.push({ pointId: pick.spawn.id ?? null, x: pick.spawn.x, y: pick.spawn.y, ...(pick.spawn.fenetre === undefined ? {} : { fenetre: pick.spawn.fenetre }), type: z.type, gait: z.gait });
        s = { ...s, rng: pick.rng, spawned: s.spawned + 1, sinceSpawn: 0 };
        spawnedNow = true;
      }
    }
    if (s.spawned >= spec.total) s = { ...s, phase: 'combat' };
  }
  if (s.phase === 'combat' && !spawnedNow && alive === 0) {
    s = { ...s, phase: 'terminee' };
    events.push({ type: 'waveEnd', wave: s.wave, healFraction: s.spec.healFraction });
  }
  return { state: s, requests, events };
}
