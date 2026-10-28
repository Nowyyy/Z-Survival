// Direction sonore : transforme les événements du jeu en demandes de lecture { sound, category, variant, gain, pan, delay, lowpass, rate,
// duration }. Pur : le temps de jeu, la position de l'écouteur (le joueur) et les données arrivent en argument ; le hasard vient de
// rng.js. Règles : le son d'un tir part avec la balle, la blessure d'un zombie à l'impact seulement (c'est là que les dégâts arrivent) ;
// la douille tombe 0,25 à 0,4 s après un tir si la cadence est inférieure à 3 tirs par seconde ; rien ne sonne pendant la pause.
import { admitGap, admitVoice, createVoiceState, distanceGain, isMuffled, panFor, pickVariant } from './audio-mix.js';
import { createFootsteps, stepFootsteps } from './footsteps.js';
import { createRng, nextFloat } from './rng.js';
import { createVoicePlanner, planVoice } from './zombie-voice.js';
import { isNum, num } from './vec.js';

// Table { id: { category, variants, duration } } d'après data/game/sounds.json.
export function soundTable(sounds) {
  const table = {};
  for (const s of Array.isArray(sounds) ? sounds : []) {
    if (s && typeof s.id === 'string') table[s.id] = { category: s.category, variants: Math.max(1, Math.floor(num(s.variants, 1))), duration: Math.max(0.01, num(s.duration, 0.5)) };
  }
  return table;
}

export const createDirector = (seed = 1) => ({ rng: createRng(seed), lastShot: -Infinity, last: {}, voices: createVoiceState(), planner: createVoicePlanner(seed + 101), zsteps: {}, windowLast: {} });

// frame : { time, paused, listener: { x, y }, walls, events: [...], zombies: [{ id, x, y, variant }] }. cfg : { audio, materials, voice, sounds: soundTable(...) }.
// Événements : { type: 'shot' | 'zombieHit' | 'zombieAttack' | 'obstacleHit' | 'playerHurt' | 'playerDeath' | 'playerStep' | 'pause' | 'resume'
// | 'waveSplash' (sound, variant) | 'waveEnd' (variant) | 'plankTorn' | 'plankRepaired' (x, y, windowId) | 'playerDown' | 'playerUp', x, y, ... }.
// Retourne { state, requests } sans modifier ses arguments.
export function direct(state, frame, cfg) {
  const table = cfg?.sounds;
  const audio = cfg?.audio;
  const events = Array.isArray(frame?.events) ? frame.events : [];
  const zombies = Array.isArray(frame?.zombies) ? frame.zombies.filter((z) => z && isNum(z.x) && isNum(z.y)) : [];
  let s = { ...(state ?? createDirector()), last: { ...(state?.last ?? {}) }, windowLast: { ...(state?.windowLast ?? {}) } };
  if (!table || !audio || (events.length === 0 && zombies.length === 0)) return { state: s, requests: [] };
  const time = num(frame?.time);
  const listener = { x: num(frame?.listener?.x), y: num(frame?.listener?.y) };
  const walls = Array.isArray(frame?.walls) ? frame.walls : [];
  const paused = frame?.paused === true;
  const requests = [];

  // Ajoute une demande si le son existe, est audible et si la limite de voix et le délai minimal le permettent.
  const add = (sound, { x = null, y = null, volume = 1, rate = 1, delay = 0, pan = null, spatial = true, zombie = null, variant: wanted = null, through = false } = {}) => {
    const info = table[sound];
    if (!info) return;
    let gain = num(volume, 1);
    let lowpass = false;
    let balance = pan ?? 0;
    if (spatial && isNum(x) && isNum(y)) {
      gain *= distanceGain(Math.hypot(x - listener.x, y - listener.y), audio.referenceDistance, audio.maxDistance);
      balance = panFor(x - listener.x, audio.pan?.range, audio.pan?.max);
      // through : son venant d'une fenêtre (lot 3), qui laisse passer le son : jamais étouffé.
      if (!through && isMuffled({ x, y }, listener, walls)) {
        lowpass = true;
        gain *= num(audio.muffle?.gain, 0.6);
      }
    }
    if (gain < 0.01) return;
    // Variante demandée (animation de vague : champ sound.variant) ; jamais la même deux fois d'affilée : sinon la suivante.
    const hinted = Number.isInteger(wanted) && wanted >= 0 && wanted < info.variants;
    const pick = hinted ? { variant: wanted === s.last[sound] && info.variants > 1 ? (wanted + 1) % info.variants : wanted, rng: s.rng } : pickVariant(info.variants, s.last[sound], s.rng);
    const speed = Math.max(0.25, num(rate, 1));
    const admit = admitVoice(s.voices, { sound, category: info.category, priority: num(audio.priority?.[info.category]), duration: info.duration / speed }, time + delay, { maxVoices: audio.maxVoices, minDelay: audio.minDelay });
    s = { ...s, voices: admit.state };
    if (!admit.play) return;
    s = { ...s, rng: pick.rng, last: { ...s.last, [sound]: pick.variant } };
    requests.push({ sound, category: info.category, variant: pick.variant, gain, pan: balance, delay, lowpass, rate: speed, duration: info.duration / speed, ...(zombie === null ? {} : { zombie }) });
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
    } else if (type === 'zombieAttack') {
      // Cri d'attaque au contact : compte dans la limite de voix de zombie (la blessure et la mort, causées par le joueur, n'y sont pas soumises).
      if (zombieVoicesActive(s, time) < num(cfg?.voice?.maxSimultaneous, 2)) add('zombie-attaque', { x: e.x, y: e.y, rate: audio.zombieRate?.[e.zombie] ?? 1 });
    } else if (type === 'obstacleHit') {
      const material = e.material ?? materialFor(e.kind, e.obstacleId, cfg?.materials);
      const sound = cfg?.materials?.sounds?.[material];
      if (sound) add(sound, { x: e.x, y: e.y });
    } else if (type === 'waveSplash') {
      // Mélodie d'annonce : une demande par animation (le choix est fait par js/core/wave-splash.js) ; seuls deux sons sont permis.
      if (e.sound === 'vague-annonce' || e.sound === 'vague-renforcee') add(e.sound, { spatial: false, variant: e.variant });
    } else if (type === 'waveEnd') add('vague-fin', { spatial: false, variant: e.variant });
    else if (type === 'plankTorn' || type === 'plankRepaired') {
      // Planches (lot 3) : au plus un son toutes les 120 ms par fenêtre ; le son vient de la fenêtre et traverse l'ouverture sans s'étouffer.
      const gate = admitGap(s.windowLast, `${e.windowId ?? 'fenetre'}`, time, num(audio.windowGap, 0.12));
      if (gate.ok) {
        const before = requests.length;
        add(type === 'plankTorn' ? 'planche-arrachee' : 'planche-posee', { x: e.x, y: e.y, through: true });
        // Seul un son réellement demandé occupe le créneau de la fenêtre.
        if (requests.length > before) s = { ...s, windowLast: gate.last };
      }
    } else if (type === 'playerDown') add('joueur-chute', { spatial: false });
    else if (type === 'playerUp') add('joueur-releve', { spatial: false });
    else if (type === 'playerHurt') add('joueur-blesse', { spatial: false });
    else if (type === 'playerDeath') add('joueur-mort', { spatial: false });
    else if (type === 'playerStep') add('pas', { volume: num(e.volume, 1), pan: e.foot === 'droit' ? 0.15 : e.foot === 'gauche' ? -0.15 : 0, spatial: false });
  }
  if (!paused && zombies.length > 0) {
    // Voix occasionnelles (js/core/zombie-voice.js) et pas traînants des zombies les plus proches.
    const plan = planVoice(s.planner, { time, player: listener, zombies, busy: zombieVoicesActive(s, time) }, { voice: cfg?.voice, sounds: table, rates: audio.zombieRate });
    s = { ...s, planner: plan.state };
    if (plan.voice) add(plan.voice.sound, { x: plan.voice.x, y: plan.voice.y, rate: audio.zombieRate?.[plan.voice.variant] ?? 1, zombie: plan.voice.id });
    walkZombies(zombies);
  }
  return { state: s, requests };

  // Phase de marche de chaque zombie (distance parcourue × stride) ; seuls les `count` plus proches, à moins de `range`, font du bruit.
  function walkZombies(list) {
    const zs = audio.zombieSteps;
    if (!zs) return;
    const ranked = list.map((z) => ({ z, d: Math.hypot(z.x - listener.x, z.y - listener.y) })).sort((a, b) => a.d - b.d);
    const silent = new Set(Array.isArray(zs.silentGaits) ? zs.silentGaits : []); // allures sans bruit de pas (la rampe : corps au sol)
    const loud = new Set(ranked.filter((r) => r.d < num(zs.range, 450) && !silent.has(r.z.gait)).slice(0, num(zs.count, 3)).map((r) => r.z.id));
    const next = {};
    for (const { z } of ranked) {
      const before = s.zsteps?.[z.id];
      const moved = before ? Math.hypot(z.x - before.x, z.y - before.y) : 0;
      const perUnit = isNum(z.stride) && z.stride > 0 ? (Math.PI * 2) / z.stride : num(zs.stride, 0.09); // foulée de l'allure, sinon valeur commune
      const phase = (before?.phase ?? 0) + moved * perUnit;
      const dtz = before ? Math.max(1e-6, time - before.time) : 1;
      const r = stepFootsteps(before?.steps ?? createFootsteps(), before?.phase ?? 0, phase, moved / dtz, time, zs.maxSpeed, { minSpeed: zs.minSpeed, minInterval: zs.minInterval, minVolume: 0.5 });
      next[z.id] = { x: z.x, y: z.y, phase, time, steps: r.state };
      if (r.step && loud.has(z.id)) add('pas-zombie', { x: z.x, y: z.y, volume: num(zs.volume, 0.6) * r.step.volume });
    }
    s = { ...s, zsteps: next };
  }
}

// Nombre de voix de zombie (catégorie « voix ») en cours à l'instant t.
function zombieVoicesActive(state, t) {
  return (state?.voices?.voices ?? []).filter((v) => v.category === 'voix' && v.end > t).length;
}

// Matière sonore d'un obstacle : selon son type (kind), ou « mur » (identifiant mur-…), ou la matière par défaut.
export function materialFor(kind, obstacleId, materials) {
  if (typeof kind === 'string' && Object.hasOwn(materials?.kinds ?? {}, kind)) return materials.kinds[kind];
  if (typeof obstacleId === 'string' && obstacleId.startsWith('mur-')) return materials?.wallMaterial;
  return materials?.default;
}
