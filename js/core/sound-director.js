// Direction sonore : transforme les événements du jeu en demandes de lecture { sound, category, variant, gain, pan, delay, lowpass, rate,
// duration }. Pur : le temps de jeu, la position de l'écouteur (le joueur) et les données arrivent en argument ; le hasard vient de
// rng.js. Règles : le son d'un tir part avec la balle, la blessure d'un zombie à l'impact seulement (c'est là que les dégâts arrivent) ;
// la douille tombe 0,25 à 0,4 s après un tir si la cadence est inférieure à 3 tirs par seconde ; rien ne sonne pendant la pause.
import { admitGap, admitVoice, createVoiceState, distanceGain, isMuffled, panFor, pickVariant } from './audio-mix.js';
import { createFootsteps, stepFootsteps } from './footsteps.js';
import { createRng, nextFloat } from './rng.js';
import { createVoicePlanner, planVoice } from './zombie-voice.js';
import { isFloorId } from './floors.js';
import { isNum, num } from './vec.js';

// Table { id: { category, variants, duration } } d'après data/game/sounds.json. Lot 3i : un son de l'atelier peut porter fixedRate (voix
// par type de zombie, lue à la hauteur 1, sans zombieRate), trigger ('repairStart' : la réparation sonne au début de la pose) et gainDb.
export function soundTable(sounds) {
  const table = {};
  for (const s of Array.isArray(sounds) ? sounds : []) {
    if (s && typeof s.id === 'string') {
      table[s.id] = {
        category: s.category, variants: Math.max(1, Math.floor(num(s.variants, 1))), duration: Math.max(0.01, num(s.duration, 0.5)),
        ...(s.fixedRate === true ? { fixedRate: true } : {}), ...(typeof s.trigger === 'string' ? { trigger: s.trigger } : {}), ...(isNum(s.gainDb) && s.gainDb !== 0 ? { gainDb: s.gainDb } : {}),
      };
    }
  }
  return table;
}

// Voix d'un type de zombie (lot 3i) : l'identifiant propre au type (« zombie-mort-petit ») s'il existe, lu à la hauteur 1 ; sinon le son commun,
// à la hauteur 1 s'il est marqué fixedRate, à la hauteur du type (audio.json, zombieRate) sinon (pack d'avant le lot 3i).
export function voiceFor(table, sound, kind, rates) {
  const own = typeof kind === 'string' ? `${sound}-${kind}` : null;
  if (own && table?.[own]) return { sound: own, rate: 1 };
  if (table?.[sound]?.fixedRate) return { sound, rate: 1 };
  return { sound, rate: num(rates?.[kind], 1) || 1 };
}

export const createDirector = (seed = 1) => ({ rng: createRng(seed), lastShot: -Infinity, last: {}, voices: createVoiceState(), planner: createVoicePlanner(seed + 101), zsteps: {}, windowLast: {} });

// Lot 3e : frame.floor est l'étage de l'écouteur ; un événement (champ floor) ou un zombie (champ floor) d'un AUTRE étage est entendu étouffé : gain × audio.floorGain
// et un seul filtre passe-bas à audio.floorLowpass Hz (jamais plus d'un filtre : l'étouffement par les murs, qui ne vaut que sur l'étage de l'écouteur, n'y est pas ajouté).
// frame : { time, paused, floor?, listener: { x, y }, walls, events: [...], zombies: [{ id, x, y, variant, floor? }] }. cfg : { audio, materials, voice, sounds: soundTable(...) }.
// Événements : { type: 'shot' | 'zombieHit' | 'zombieAttack' | 'obstacleHit' | 'playerHurt' | 'playerDeath' | 'playerStep' | 'pause' | 'resume'
// | 'waveSplash' (sound, variant) | 'waveEnd' (variant) | 'plankTorn' | 'plankRepaired' (x, y, windowId) | 'playerDown' | 'playerUp', x, y, ... }.
// | 'plankRepairStart' (x, y, windowId, duration, progress) | 'plankRepairStop' (windowId).
// Retourne { state, requests, stops } sans modifier ses arguments ; stops : [{ sound, key }] voix à arrêter (réparation interrompue).
export function direct(state, frame, cfg) {
  const table = cfg?.sounds;
  const audio = cfg?.audio;
  const events = Array.isArray(frame?.events) ? frame.events : [];
  const zombies = Array.isArray(frame?.zombies) ? frame.zombies.filter((z) => z && isNum(z.x) && isNum(z.y)) : [];
  let s = { ...(state ?? createDirector()), last: { ...(state?.last ?? {}) }, windowLast: { ...(state?.windowLast ?? {}) } };
  if (!table || !audio || (events.length === 0 && zombies.length === 0)) return { state: s, requests: [], stops: [] };
  const time = num(frame?.time);
  const listener = { x: num(frame?.listener?.x), y: num(frame?.listener?.y) };
  const walls = Array.isArray(frame?.walls) ? frame.walls : [];
  const paused = frame?.paused === true;
  const listenerFloor = isFloorId(frame?.floor) ? frame.floor : 'rdc';
  const elsewhere = (f) => isFloorId(f) && f !== listenerFloor;
  const requests = [];
  const stops = [];

  // Ajoute une demande si le son existe, est audible et si la limite de voix et le délai minimal le permettent.
  const add = (sound, { x = null, y = null, volume = 1, rate = 1, delay = 0, pan = null, spatial = true, zombie = null, variant: wanted = null, through = false, floor = null, durationSec = null, offset = 0, key = null } = {}) => {
    const info = table[sound];
    if (!info) return;
    let gain = num(volume, 1) * (isNum(info.gainDb) ? 10 ** (info.gainDb / 20) : 1);
    let lowpass = false;
    let lowpassHz = null;
    let balance = pan ?? 0;
    if (spatial && isNum(x) && isNum(y)) {
      gain *= distanceGain(Math.hypot(x - listener.x, y - listener.y), audio.referenceDistance, audio.maxDistance);
      balance = panFor(x - listener.x, audio.pan?.range, audio.pan?.max);
      if (elsewhere(floor)) {
        // Autre étage : étouffé par le plancher, un seul filtre.
        lowpass = true;
        lowpassHz = num(audio.floorLowpass, 700);
        gain *= num(audio.floorGain, 0.5);
      } else if (!through && isMuffled({ x, y }, listener, walls)) {
        // through : son venant d'une fenêtre (lot 3), qui laisse passer le son : jamais étouffé.
        lowpass = true;
        gain *= num(audio.muffle?.gain, 0.6);
      }
    }
    if (gain < 0.01) return;
    // Variante demandée (animation de vague : champ sound.variant) ; jamais la même deux fois d'affilée : sinon la suivante.
    const hinted = Number.isInteger(wanted) && wanted >= 0 && wanted < info.variants;
    const pick = hinted ? { variant: wanted === s.last[sound] && info.variants > 1 ? (wanted + 1) % info.variants : wanted, rng: s.rng } : pickVariant(info.variants, s.last[sound], s.rng);
    const speed = Math.max(0.25, num(rate, 1));
    // Durée imposée (réparation, lot 3i) : le tampon est calculé à cette durée ; offset : reprise d'une pose déjà entamée.
    const length = isNum(durationSec) && durationSec > 0 ? durationSec : info.duration;
    const skip = Math.min(Math.max(0, num(offset)), length * 0.95);
    const admit = admitVoice(s.voices, { sound, category: info.category, priority: num(audio.priority?.[info.category]), duration: (length - skip) / speed }, time + delay, { maxVoices: audio.maxVoices, minDelay: audio.minDelay });
    s = { ...s, voices: admit.state };
    if (!admit.play) return;
    s = { ...s, rng: pick.rng, last: { ...s.last, [sound]: pick.variant } };
    requests.push({ sound, category: info.category, variant: pick.variant, gain, pan: balance, delay, lowpass, ...(lowpassHz === null ? {} : { lowpassHz }), rate: speed, duration: (length - skip) / speed, ...(zombie === null ? {} : { zombie }), ...(isNum(durationSec) && durationSec > 0 ? { durationSec } : {}), ...(skip > 0 ? { offset: skip } : {}), ...(key === null ? {} : { key }) });
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
      add('impact-zombie', { x: e.x, y: e.y, floor: e.floor });
      const v = voiceFor(table, e.killed === true ? 'zombie-mort' : 'zombie-blessure', e.zombie, audio.zombieRate);
      add(v.sound, { x: e.x, y: e.y, rate: v.rate, floor: e.floor });
    } else if (type === 'zombieAttack') {
      // Cri d'attaque au contact : compte dans la limite de voix de zombie (la blessure et la mort, causées par le joueur, n'y sont pas soumises).
      const v = voiceFor(table, 'zombie-attaque', e.zombie, audio.zombieRate);
      if (zombieVoicesActive(s, time) < num(cfg?.voice?.maxSimultaneous, 2)) add(v.sound, { x: e.x, y: e.y, rate: v.rate, floor: e.floor });
    } else if (type === 'obstacleHit') {
      const material = e.material ?? materialFor(e.kind, e.obstacleId, cfg?.materials);
      const sound = cfg?.materials?.sounds?.[material];
      if (sound) add(sound, { x: e.x, y: e.y });
    } else if (type === 'waveSplash') {
      // Mélodie d'annonce : une demande par animation (le choix est fait par js/core/wave-splash.js) ; seuls deux sons sont permis.
      if (e.sound === 'vague-annonce' || e.sound === 'vague-renforcee') add(e.sound, { spatial: false, variant: e.variant });
    } else if (type === 'waveEnd') add('vague-fin', { spatial: false, variant: e.variant });
    else if (type === 'plankTorn' || type === 'plankRepaired' || type === 'plankRepairStart') {
      // Planches (lot 3) : au plus un son toutes les 120 ms par fenêtre ; le son vient de la fenêtre et traverse l'ouverture sans s'étouffer.
      // Lot 3i : la réparation de l'atelier (trigger 'repairStart') sonne au début de la pose (plankRepairStart), à la durée de pose, et
      // plus à la planche posée ; le pack d'avant garde son son à la planche posée.
      const atStart = table['planche-posee']?.trigger === 'repairStart';
      if (type === 'plankRepaired' && atStart) continue;
      if (type === 'plankRepairStart' && !atStart) continue;
      const gate = admitGap(s.windowLast, `${e.windowId ?? 'fenetre'}`, time, num(audio.windowGap, 0.12));
      if (gate.ok) {
        const before = requests.length;
        const repair = type === 'plankRepairStart' ? { durationSec: num(e.duration, table['planche-posee'].duration), offset: num(e.progress) * num(e.duration, table['planche-posee'].duration), key: `${e.windowId ?? 'fenetre'}` } : {};
        add(type === 'plankTorn' ? 'planche-arrachee' : 'planche-posee', { x: e.x, y: e.y, through: true, floor: e.floor, ...repair });
        // Seul un son réellement demandé occupe le créneau de la fenêtre.
        if (requests.length > before) s = { ...s, windowLast: gate.last };
      }
    } else if (type === 'plankRepairStop') {
      // Pose interrompue (joueur parti, réparation bloquée) : la réparation de cette fenêtre s'arrête.
      if (table['planche-posee']?.trigger === 'repairStart') stops.push({ sound: 'planche-posee', key: `${e.windowId ?? 'fenetre'}` });
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
    if (plan.voice) {
      const v = voiceFor(table, plan.voice.sound, plan.voice.variant, audio.zombieRate);
      add(v.sound, { x: plan.voice.x, y: plan.voice.y, rate: v.rate, zombie: plan.voice.id, floor: zombies.find((z) => z.id === plan.voice.id)?.floor });
    }
    walkZombies(zombies);
  }
  return { state: s, requests, stops };

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
      if (r.step && loud.has(z.id)) add('pas-zombie', { x: z.x, y: z.y, volume: num(zs.volume, 0.6) * r.step.volume, floor: z.floor });
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
