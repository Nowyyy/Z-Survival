// Voix occasionnelles des zombies : un planificateur décide, à chaque image, si l'un d'eux parle. Pur : le temps, les positions et
// les règles (data/game/zombie-voice.json) arrivent en argument ; le hasard vient de rng.js. Règles : une voix toutes les 1,8 s au plus,
// un même zombie au plus toutes les 9 s, 2 voix de zombie simultanées au plus, aucun zombie hors de la portée d'audition ; les proches
// parlent plus souvent, mais les lointains restent audibles (étouffés par la direction sonore).
import { createRng, nextFloat } from './rng.js';
import { isNum, num } from './vec.js';

export const createVoicePlanner = (seed = 1) => ({ rng: createRng(seed), time: null, lastGlobal: -Infinity, byZombie: {}, active: [] });

// frame : { time, player: { x, y }, zombies: [{ id, x, y, variant }], busy } (busy : voix de zombie déjà en cours ailleurs).
// cfg : { voice: zombie-voice.json, sounds: table de sound-director.js, rates: hauteur de lecture par variante }.
// Retourne { state, voice } : voice = null ou { id, sound, x, y, variant, distance, duration }. Ne modifie pas ses arguments.
export function planVoice(state, frame, cfg) {
  const v = cfg?.voice ?? {};
  const time = num(frame?.time);
  const prev = isNum(state?.time) ? state.time : time;
  const s = {
    rng: state?.rng ?? createRng(1),
    time,
    lastGlobal: isNum(state?.lastGlobal) ? state.lastGlobal : -Infinity,
    byZombie: { ...(state?.byZombie ?? {}) },
    active: (Array.isArray(state?.active) ? state.active : []).filter((end) => isNum(end) && end > time),
  };
  const none = { state: s, voice: null };
  const dt = Math.min(Math.max(0, time - prev), num(v.maxDt, 0.25));
  const zombies = Array.isArray(frame?.zombies) ? frame.zombies : [];
  if (dt <= 0 || zombies.length === 0) return none;
  if (Math.max(s.active.length, num(frame?.busy)) >= num(v.maxSimultaneous, 2)) return none;
  if (time - s.lastGlobal < num(v.minGlobalInterval, 1.8)) return none;

  const range = num(v.hearingRange, 1100);
  const near = num(v.nearRange, 300);
  const candidates = [];
  for (const z of zombies) {
    if (!z || !isNum(z.x) || !isNum(z.y)) continue;
    const distance = Math.hypot(z.x - num(frame?.player?.x), z.y - num(frame?.player?.y));
    if (distance > range) continue;
    if (Object.hasOwn(s.byZombie, z.id) && time - s.byZombie[z.id] < num(v.minZombieInterval, 9)) continue;
    candidates.push({ z, distance, weight: num(v.ratePerZombie, 0.03) * (distance < near ? num(v.nearFactor, 1.4) : num(v.farFactor, 0.7)) });
  }
  if (candidates.length === 0) return none;

  const hazard = candidates.reduce((sum, c) => sum + c.weight, 0) * dt;
  const roll = nextFloat(s.rng);
  s.rng = roll.rng;
  if (roll.value >= 1 - Math.exp(-hazard)) return none;

  // Qui parle : tirage pondéré par la proximité ; quoi : tirage pondéré par le type (les très proches grognent plus souvent).
  const pick = nextFloat(s.rng);
  s.rng = pick.rng;
  const total = candidates.reduce((sum, c) => sum + c.weight, 0);
  let acc = 0;
  let chosen = candidates[candidates.length - 1];
  for (const c of candidates) {
    acc += c.weight / total;
    if (pick.value < acc) {
      chosen = c;
      break;
    }
  }
  const kind = nextFloat(s.rng);
  s.rng = kind.rng;
  const types = Object.entries(v.types ?? {}).filter(([name, w]) => isNum(w) && w > 0 && cfg?.sounds?.[`zombie-${name}`]);
  if (types.length === 0) return none;
  const close = chosen.distance < num(v.closeRange, 150);
  const weights = types.map(([name, w]) => w * (close ? num(v.closeBoost?.[name], 1) : 1));
  const sum = weights.reduce((a, b) => a + b, 0);
  let cut = kind.value * sum;
  let index = 0;
  while (index < weights.length - 1 && cut >= weights[index]) {
    cut -= weights[index];
    index += 1;
  }
  const sound = `zombie-${types[index][0]}`;
  const duration = (cfg.sounds[sound].duration ?? 1) / Math.max(0.25, num(cfg?.rates?.[chosen.z.variant], 1));
  s.lastGlobal = time;
  s.byZombie[chosen.z.id] = time;
  s.active = [...s.active, time + duration];
  return { state: s, voice: { id: chosen.z.id, sound, x: chosen.z.x, y: chosen.z.y, variant: chosen.z.variant, distance: chosen.distance, duration } };
}
