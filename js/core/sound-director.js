// Direction sonore : transforme les événements du jeu en demandes de lecture { sound, category, variant, gain, pan, delay, lowpass, rate,
// duration }. Pur : le temps de jeu, la position de l'écouteur (le joueur) et les données arrivent en argument ; le hasard vient de
// rng.js. Règles : le son d'un tir part avec la balle, la blessure d'un zombie à l'impact seulement (c'est là que les dégâts arrivent) ;
// la douille tombe 0,25 à 0,4 s après un tir si la cadence est inférieure à 3 tirs par seconde ; rien ne sonne pendant la pause.
import { admitVoice, createVoiceState, distanceGain, isMuffled, panFor, pickVariant } from './audio-mix.js';
import { createRng, nextFloat } from './rng.js';
import { isNum, num } from './vec.js';

// Table { id: { category, variants, duration } } d'après data/game/sounds.json.
export function soundTable(sounds) {
  const table = {};
  for (const s of Array.isArray(sounds) ? sounds : []) {
    if (s && typeof s.id === 'string') table[s.id] = { category: s.category, variants: Math.max(1, Math.floor(num(s.variants, 1))), duration: Math.max(0.01, num(s.duration, 0.5)) };
  }
  return table;
}

export const createDirector = (seed = 1) => ({ rng: createRng(seed), lastShot: -Infinity, last: {}, voices: createVoiceState() });

// frame : { time, paused, listener: { x, y }, walls, events: [...] }. cfg : { audio, materials, sounds: soundTable(...) }.
// Événements : { type: 'shot' | 'zombieHit' | 'obstacleHit' | 'playerHurt' | 'playerDeath' | 'playerStep' | 'pause' | 'resume', x, y, ... }.
// Retourne { state, requests } sans modifier ses arguments.
export function direct(state, frame, cfg) {
  const table = cfg?.sounds;
  const audio = cfg?.audio;
  const events = Array.isArray(frame?.events) ? frame.events : [];
  let s = { ...(state ?? createDirector()), last: { ...(state?.last ?? {}) } };
  if (!table || !audio || events.length === 0) return { state: s, requests: [] };
  const time = num(frame?.time);
  const listener = { x: num(frame?.listener?.x), y: num(frame?.listener?.y) };
  const walls = Array.isArray(frame?.walls) ? frame.walls : [];
  const paused = frame?.paused === true;
  const requests = [];

  // Ajoute une demande si le son existe, est audible et si la limite de voix et le délai minimal le permettent.
  const add = (sound, { x = null, y = null, volume = 1, rate = 1, delay = 0, pan = null, spatial = true } = {}) => {
    const info = table[sound];
    if (!info) return;
    let gain = num(volume, 1);
    let lowpass = false;
    let balance = pan ?? 0;
    if (spatial && isNum(x) && isNum(y)) {
      gain *= distanceGain(Math.hypot(x - listener.x, y - listener.y), audio.referenceDistance, audio.maxDistance);
      balance = panFor(x - listener.x, audio.pan?.range, audio.pan?.max);
      if (isMuffled({ x, y }, listener, walls)) {
        lowpass = true;
        gain *= num(audio.muffle?.gain, 0.6);
      }
    }
    if (gain < 0.01) return;
    const pick = pickVariant(info.variants, s.last[sound], s.rng);
    const speed = Math.max(0.25, num(rate, 1));
    const admit = admitVoice(s.voices, { sound, priority: num(audio.priority?.[info.category]), duration: info.duration / speed }, time + delay, { maxVoices: audio.maxVoices, minDelay: audio.minDelay });
    s = { ...s, voices: admit.state };
    if (!admit.play) return;
    s = { ...s, rng: pick.rng, last: { ...s.last, [sound]: pick.variant } };
    requests.push({ sound, category: info.category, variant: pick.variant, gain, pan: balance, delay, lowpass, rate: speed, duration: info.duration / speed });
  };

  for (const e of events) {
    const type = e?.type;
    if (type === 'pause') add('ui-pause', { spatial: false });
    else if (type === 'resume') add('ui-reprise', { spatial: false });
    else if (paused) continue;
    else if (type === 'shot') {
      const gap = time - s.lastShot;
      s = { ...s, lastShot: time };
      add('tir', { x: e.x, y: e.y });
      if (1 / Math.max(gap, 1e-6) < num(audio.casing?.maxFireRate, 3)) {
        const r = nextFloat(s.rng);
        s = { ...s, rng: r.rng };
        const lo = num(audio.casing?.minDelay, 0.25);
        add('douille', { x: e.x, y: e.y, delay: lo + r.value * (num(audio.casing?.maxDelay, 0.4) - lo) });
      }
    } else if (type === 'zombieHit') {
      add('impact-zombie', { x: e.x, y: e.y });
      add(e.killed === true ? 'zombie-mort' : 'zombie-blessure', { x: e.x, y: e.y, rate: audio.zombieRate?.[e.zombie] ?? 1 });
    } else if (type === 'obstacleHit') {
      const material = e.material ?? materialFor(e.kind, e.obstacleId, cfg?.materials);
      const sound = cfg?.materials?.sounds?.[material];
      if (sound) add(sound, { x: e.x, y: e.y });
    } else if (type === 'playerHurt') add('joueur-blesse', { spatial: false });
    else if (type === 'playerDeath') add('joueur-mort', { spatial: false });
    else if (type === 'playerStep') add('pas', { volume: num(e.volume, 1), pan: e.foot === 'droit' ? 0.15 : e.foot === 'gauche' ? -0.15 : 0, spatial: false });
  }
  return { state: s, requests };
}

// Matière sonore d'un obstacle : selon son type (kind), ou « mur » (identifiant mur-…), ou la matière par défaut.
export function materialFor(kind, obstacleId, materials) {
  if (typeof kind === 'string' && Object.hasOwn(materials?.kinds ?? {}, kind)) return materials.kinds[kind];
  if (typeof obstacleId === 'string' && obstacleId.startsWith('mur-')) return materials?.wallMaterial;
  return materials?.default;
}
