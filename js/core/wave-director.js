// Directeur de vagues : machine à états pure. attente (compte à rebours avant une vague) → apparition (la vague se remplit) → combat (tout est
// apparu, il reste des zombies) → terminee (un instant : soigner le joueur) → attente de la vague suivante. inactif : aucune vague (?nospawn=1).
// Rien n'est lu ni écrit ailleurs : le temps (dt, borné), le nombre de vivants, la vue et les points d'apparition arrivent en argument à chaque
// appel (les niveaux futurs changeront de points sans toucher ce module). Le choix du point reste celui de spawner.js (hors de la vue).
import { createRng } from './rng.js';
import { stepSpawner } from './spawner.js';
import { clampDt, isNum, num } from './vec.js';
import { waveOrder, waveSpec } from './waves.js';

export const PHASES = ['inactif', 'attente', 'apparition', 'combat', 'terminee', 'monde-termine'];

// Lot 3c : durée de la pause qui précède l'ouverture d'une porte et instants de ses événements (secondes depuis la fin de la manche), valeurs de repli
// de data/game/waves.json (doorIntermission, doorSplashAt, doorOpenAt).
const DOOR_DEFAULTS = { intermission: 12, announceAt: 3, openAt: 3.6 };

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

// Portes actives (non planned) { id, openAfterWave } : les entrées invalides sont ignorées.
function cleanDoors(doors) {
  const seen = new Set();
  const out = [];
  for (const d of Array.isArray(doors) ? doors : []) {
    if (d === null || typeof d !== 'object' || typeof d.id !== 'string' || d.planned === true || seen.has(d.id)) continue;
    if (!Number.isInteger(d.openAfterWave) || d.openAfterWave < 1) continue;
    seen.add(d.id);
    out.push({ id: d.id, openAfterWave: d.openAfterWave });
  }
  return out;
}

// Durées de la pause de porte (secondes) d'après les paramètres, ramenées à des valeurs cohérentes (annonce <= ouverture <= pause).
function doorTimes(params) {
  const pos = (n, fallback) => (isNum(n) && n >= 0 ? n : fallback);
  const intermission = Math.max(0.1, pos(params?.doorIntermission, DOOR_DEFAULTS.intermission));
  const openAt = Math.min(pos(params?.doorOpenAt, DOOR_DEFAULTS.openAt), intermission);
  const announceAt = Math.min(pos(params?.doorSplashAt, DOOR_DEFAULTS.announceAt), openAt);
  return { intermission, announceAt, openAt };
}

// Porte qui s'ouvre à la fin de la manche courante (openAfterWave = manche courante, pas encore ouverte), ou null.
const pendingDoor = (s) => (Array.isArray(s.doors) ? s.doors.find((d) => d.openAfterWave === s.wave && !s.opened.includes(d.id)) ?? null : null);

// params : data/game/waves.json ; options : { seed, wave (1 par défaut), inactive, doors (portes actives { id, openAfterWave }, lot 3c), wavesPerWorld
// (fin de monde : entier, absent = jamais), endless (les manches continuent après la fin du monde) }. Les portes dont openAfterWave < wave sont déjà ouvertes.
export function createDirector(params, options) {
  const { seed = 1, wave = 1, inactive = false, doors = [], wavesPerWorld = null, endless = false } = options !== null && typeof options === 'object' ? options : {};
  const list = cleanDoors(doors);
  const w = Number.isInteger(wave) && wave >= 1 ? wave : 1;
  const base = {
    params: params !== null && typeof params === 'object' ? params : {},
    seed: Number.isInteger(seed) ? seed : 1,
    alive: 0,
    rng: createRng(mix(seed, 7)),
    doors: list,
    opened: list.filter((d) => d.openAfterWave < w).map((d) => d.id),
    door: null,
    wavesPerWorld: Number.isInteger(wavesPerWorld) && wavesPerWorld >= 1 ? wavesPerWorld : null,
    endless: endless === true,
  };
  const state = prepare({ ...base, phase: 'inactif' }, wave, null);
  return inactive ? { ...state, phase: 'inactif', waitLeft: 0 } : { ...state, waitLeft: Math.max(0, num(base.params.intermission?.first, 3)) };
}

// Saute à la vague n (compte à rebours de départ de 3 s) ; un directeur inactif le reste. Les portes se ferment ou s'ouvrent comme au départ de la
// manche n (openAfterWave < n : ouvertes), une transition de porte en cours est abandonnée.
export function startWave(state, n) {
  const s = state ?? createDirector({});
  if (s.phase === 'inactif') return s;
  const w = Number.isInteger(n) && n >= 1 ? n : 1;
  const first = prepare({ ...s, door: null, opened: (s.doors ?? []).filter((d) => d.openAfterWave < w).map((d) => d.id) }, n, null);
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
  const s = state !== null && typeof state === 'object' && state.spec ? state : createDirector({}, { inactive: true });
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
    doorPending: active ? pendingDoor(s) : null,
    openDoors: Array.isArray(s.opened) ? [...s.opened] : [],
    worldEnd: s.phase === 'monde-termine',
  };
}

// input : { dt, alive (zombies vivants), view (rectangle visible), points (points d'apparition { id, x, y, fenetre? }), siege (faux : zombies libres) }.
// Renvoie { state, requests, events } : au plus une demande { pointId, type, gait, x, y, fenetre?, window, mode } par appel (lot 3 : window = fenêtre
// du point d'apparition ou null, mode = « approche », ou « libre » si le siège est désactivé) ; événements
// { type: 'waveStart', wave, level, reinforced } et { type: 'waveEnd', wave, healFraction } (le soin à appliquer au joueur).
export function stepDirector(state, input) {
  const requests = [];
  const events = [];
  let s = state !== null && typeof state === 'object' && state.spec ? state : createDirector({}, { inactive: true });
  const dt = clampDt(input?.dt);
  const alive = isNum(input?.alive) ? Math.max(0, Math.floor(input.alive)) : 0;
  s = { ...s, alive };
  if (s.phase === 'inactif' || s.phase === 'monde-termine') return { state: s, requests, events };

  if (s.phase === 'terminee') {
    // Lot 3c : la manche qui précède l'ouverture d'une porte est suivie d'une pause plus longue (doorIntermission) qui porte l'annonce et l'ouverture.
    const door = pendingDoor(s);
    const times = doorTimes(s.params);
    s = prepare(s, s.wave + 1, door ? times.intermission : null);
    s = { ...s, door: door ? { id: door.id, total: times.intermission, announceAt: times.announceAt, openAt: times.openAt, announced: false, opened: false } : null };
  }
  if (s.phase === 'attente') {
    const waitLeft = s.waitLeft - dt;
    if (s.door) {
      // Temps écoulé depuis la fin de la manche précédente ; si la pause s'achève avant, les événements en retard partent quand même, dans l'ordre.
      const elapsed = waitLeft > 0 ? s.door.total - waitLeft : Infinity;
      let door = s.door;
      if (!door.announced && elapsed >= door.announceAt) {
        door = { ...door, announced: true };
        events.push({ type: 'doorAnnounce', door: door.id, wave: s.wave - 1 });
      }
      if (!door.opened && elapsed >= door.openAt) {
        door = { ...door, opened: true };
        s = { ...s, opened: [...s.opened, door.id] };
        events.push({ type: 'doorOpen', door: door.id, wave: s.wave - 1 });
      }
      s = { ...s, door: waitLeft > 0 ? door : null };
    }
    if (waitLeft > 0) return { state: { ...s, waitLeft }, requests, events };
    s = { ...s, phase: 'apparition', waitLeft: 0, door: null };
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
        requests.push({ pointId: pick.spawn.id ?? null, x: pick.spawn.x, y: pick.spawn.y, ...(pick.spawn.fenetre === undefined ? {} : { fenetre: pick.spawn.fenetre }), type: z.type, gait: z.gait, window: pick.spawn.fenetre ?? null, mode: input?.siege === false ? 'libre' : 'approche' });
        s = { ...s, rng: pick.rng, spawned: s.spawned + 1, sinceSpawn: 0 };
        spawnedNow = true;
      }
    }
    if (s.spawned >= spec.total) s = { ...s, phase: 'combat' };
  }
  if (s.phase === 'combat' && !spawnedNow && alive === 0) {
    // Lot 3c : la dernière manche du monde (wavesPerWorld) termine la partie, sauf avec endless ; ni annonce de fin ni nouvelle manche.
    const ends = s.wavesPerWorld !== null && s.endless !== true && s.wave >= s.wavesPerWorld;
    s = { ...s, phase: ends ? 'monde-termine' : 'terminee' };
    events.push({ type: 'waveEnd', wave: s.wave, healFraction: s.spec.healFraction });
    if (ends) events.push({ type: 'worldEnd', wave: s.wave });
  }
  return { state: s, requests, events };
}
