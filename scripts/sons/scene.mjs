// Scène simulée du lot 3i, hors ligne dans Node, avec la logique du directeur de sons (js/core/sound-director.js) et le mixage du jeu
// (gain de la demande × gain de catégorie × gain général d'audio.json, passe-bas d'étouffement, compresseur modélisé d'après audio.json).
// Sert à comparer le pack intégré (?sons=choix) au pack d'avant (?sons=ancien) sur la MÊME suite d'événements : niveau moyen, crête mixée,
// voix simultanées. Mesure seule : aucun son n'est écouté. Usage : node scripts/sons/scene.mjs [--secondes=60]
import { readFileSync } from 'node:fs';
import { renderSound, variantCount } from '../../js/core/synth.js';
import { createDirector, direct, soundTable } from '../../js/core/sound-director.js';
import { bufferName, isAtelier, packStats, renderChoice, seedCount } from '../../js/core/sound-choice.js';
import { createRng, nextFloat } from '../../js/core/rng.js';

const read = (f) => JSON.parse(readFileSync(f, 'utf8'));
export const OUT_RATE = 44100;
export const KINDS = ['marcheur', 'petit', 'voute', 'grand'];
export const RINGS = [180, 260, 340, 450, 560, 700, 850, 1000];

// Recettes d'un mode : 'choix' (sounds.json tel quel) ou 'ancien' (recettes remplacées remises, sons nouveaux retirés).
export function recipesFor(mode, sounds = read('data/game/sounds.json').sounds, legacy = read('data/game/sounds-legacy.json').sounds) {
  if (mode !== 'ancien') return sounds;
  const old = new Map(legacy.map((r) => [r.id, r]));
  const out = [];
  for (const r of sounds) {
    if (!isAtelier(r)) out.push(r);
    else if (old.has(r.id)) out.push(old.get(r.id));
  }
  return out;
}

// Tous les tampons d'un ensemble de recettes : Map nom -> { samples, sampleRate }, avec le temps de calcul (ms).
export function renderPack(recipes, { now = () => performance.now() } = {}) {
  const pack = new Map();
  const t0 = now();
  for (const r of recipes) {
    const n = isAtelier(r) ? seedCount(r) : variantCount(r);
    for (let v = 0; v < n; v += 1) {
      const res = isAtelier(r) ? renderChoice(r, { seed: v + 1 }) : renderSound(r, v);
      pack.set(`${r.id}-${v + 1}`, { samples: res.samples, sampleRate: res.sampleRate });
    }
  }
  return { pack, ms: now() - t0, ...packStats([...pack.values()]) };
}

// Suite d'images de la scène (déterministe) : joueur qui marche, 8 zombies autour (un par type, tour à tour), rafales de tirs et impacts,
// cris d'attaque, planches arrachées et réparées. Renvoie [{ time, listener, walls, paused, events, zombies }].
export function sceneFrames({ seconds = 60, dt = 1 / 30, seed = 3, zombies = 8, repairTime = 1.8 } = {}) {
  let rng = createRng(seed);
  const rnd = () => {
    const r = nextFloat(rng);
    rng = r.rng;
    return r.value;
  };
  const frames = [];
  const listener = { x: 1000, y: 1000 };
  let nextStep = 0;
  let foot = 'gauche';
  let nextBurst = 1;
  let burstLeft = 0;
  let nextShot = 0;
  const hits = [];
  let nextAttack = 3;
  let nextTear = 2;
  let repairStart = 4;
  let kill = 0;
  let pendingRepair = null;
  for (let i = 0; i * dt <= seconds; i += 1) {
    const time = i * dt;
    const events = [];
    // Joueur : 150 unités/s, un pas toutes les 0,33 s.
    listener.x = 1000 + 120 * Math.sin(time * 0.5);
    if (time >= nextStep) {
      events.push({ type: 'playerStep', foot, volume: 0.8 + 0.2 * rnd() });
      foot = foot === 'gauche' ? 'droit' : 'gauche';
      nextStep = time + 0.33;
    }
    const zs = Array.from({ length: zombies }, (_, k) => {
      const a = (k / zombies) * Math.PI * 2 + time * 0.08;
      const d = RINGS[k % RINGS.length] - Math.min(RINGS[k % RINGS.length] - 120, time * 4);
      return { id: k + 1, x: 1000 + Math.cos(a) * d, y: 1000 + Math.sin(a) * d, variant: KINDS[k % KINDS.length], gait: 'marche', stride: 52, floor: 'rdc' };
    });
    // Rafales : 8 tirs à 0,3 s d'écart toutes les 6 s ; chaque balle touche le zombie visé 0,15 s plus tard (un sur quatre meurt).
    if (time >= nextBurst) {
      burstLeft = 8;
      nextBurst = time + 6;
      nextShot = time;
    }
    if (burstLeft > 0 && time >= nextShot) {
      events.push({ type: 'shot', x: listener.x + 26, y: listener.y });
      const target = zs[Math.floor(rnd() * zs.length)];
      hits.push({ at: time + 0.15, target });
      burstLeft -= 1;
      nextShot = time + 0.3;
    }
    while (hits.length > 0 && hits[0].at <= time) {
      const h = hits.shift();
      kill += 1;
      events.push({ type: 'zombieHit', x: h.target.x, y: h.target.y, killed: kill % 4 === 0, zombie: h.target.variant, floor: 'rdc' });
    }
    if (time >= nextAttack) {
      const z = zs[0];
      events.push({ type: 'zombieAttack', x: listener.x + 30, y: listener.y, zombie: z.variant });
      nextAttack = time + 5;
    }
    if (time >= nextTear) {
      events.push({ type: 'plankTorn', x: 1300, y: 1000, windowId: 'F1', floor: 'rdc' });
      nextTear = time + 2.2;
    }
    if (time >= repairStart) {
      // Pose : début (son de l'atelier), puis planche posée après repairTime (son d'avant) ; une pose toutes les 7 s.
      events.push({ type: 'plankRepairStart', x: 800, y: 1000, windowId: 'F2', floor: 'rdc', duration: repairTime, progress: 0 });
      repairStart = time + 7;
      pendingRepair = time + repairTime;
    }
    if (pendingRepair !== null && time >= pendingRepair) {
      events.push({ type: 'plankRepaired', x: 800, y: 1000, windowId: 'F2', floor: 'rdc' });
      pendingRepair = null;
    }
    frames.push({ time, listener: { ...listener }, walls: [], paused: false, floor: 'rdc', events, zombies: zs });
  }
  return frames;
}

// Compresseur du jeu modélisé (DynamicsCompressor de Web Audio, approché) : détection de crête, seuil et genou en dB, rapport, attaque et
// relâchement exponentiels ; sans gain de rattrapage. Approximation documentée : sert à vérifier l'absence d'écrêtage, pas à juger le timbre.
export function compress(x, rate, c) {
  const out = new Float32Array(x.length);
  const aA = Math.exp(-1 / Math.max(1, c.attack * rate));
  const aR = Math.exp(-1 / Math.max(1, c.release * rate));
  let env = 0;
  for (let i = 0; i < x.length; i += 1) {
    const level = Math.abs(x[i]);
    env = level > env ? aA * env + (1 - aA) * level : aR * env + (1 - aR) * level;
    const db = 20 * Math.log10(Math.max(env, 1e-9));
    const over = db - c.threshold;
    let reduce = 0;
    if (over > c.knee / 2) reduce = over * (1 - 1 / c.ratio);
    else if (over > -c.knee / 2) reduce = ((over + c.knee / 2) ** 2 / (2 * c.knee)) * (1 - 1 / c.ratio);
    out[i] = x[i] * 10 ** (-reduce / 20);
  }
  return out;
}

// Mixage hors ligne des demandes : Map nom -> tampon, demandes datées. Retourne le mélange (avant et après le compresseur) et les voix.
export function mixScene(frames, recipes, pack, audio, voice, { materials = { sounds: {} } } = {}) {
  const cfg = { audio, voice, materials, sounds: soundTable(recipes) };
  const byId = new Map(recipes.map((r) => [r.id, r]));
  const seconds = frames[frames.length - 1].time + 3;
  const mix = new Float32Array(Math.ceil(seconds * OUT_RATE));
  let state = createDirector(1);
  const spans = [];
  const extra = new Map();
  for (const frame of frames) {
    const out = direct(state, frame, cfg);
    state = out.state;
    for (const r of out.requests) {
      const recipe = byId.get(r.sound);
      const name = bufferName(r.sound, r.variant + 1, r.durationSec ?? null, recipe);
      let buf = pack.get(name);
      if (!buf && isAtelier(recipe)) {
        if (!extra.has(name)) extra.set(name, renderChoice(recipe, { seed: r.variant + 1, durationSec: r.durationSec ?? null }));
        buf = extra.get(name);
      }
      if (!buf) continue;
      const gain = r.gain * (audio.categoryGain[r.category] ?? 1) * audio.masterGain;
      const start = Math.round((frame.time + r.delay) * OUT_RATE);
      const step = (buf.sampleRate / OUT_RATE) * r.rate;
      const skip = (r.offset ?? 0) * buf.sampleRate;
      // Passe-bas d'étouffement à un pôle (le jeu : biquad passe-bas) : approximation.
      const lpHz = r.lowpass ? (r.lowpassHz ?? audio.muffle.lowpass) : 0;
      const a = lpHz > 0 ? Math.exp((-2 * Math.PI * lpHz) / OUT_RATE) : 0;
      let lp = 0;
      let k = 0;
      for (let pos = skip; pos < buf.samples.length - 1 && start + k < mix.length; pos += step, k += 1) {
        const i0 = Math.floor(pos);
        let v = buf.samples[i0] + (buf.samples[i0 + 1] - buf.samples[i0]) * (pos - i0);
        if (a > 0) {
          lp = a * lp + (1 - a) * v;
          v = lp;
        }
        mix[start + k] += v * gain;
      }
      spans.push({ start: frame.time + r.delay, end: frame.time + r.delay + k / OUT_RATE, category: r.category, sound: r.sound });
    }
  }
  // Ambiance (boucle à gain de catégorie, jouée à côté du directeur) : même dans les deux packs.
  const amb = pack.get('ambiance-1');
  if (amb) {
    const g = audio.categoryGain.ambiance * audio.masterGain;
    const step = amb.sampleRate / OUT_RATE;
    for (let i = 0, pos = 0; i < mix.length; i += 1, pos += step) mix[i] += amb.samples[Math.floor(pos) % amb.samples.length] * g;
  }
  const comp = compress(mix, OUT_RATE, audio.compressor);
  const voices = simultaneous(spans, seconds);
  return { mix, comp, spans, voices, seconds };
}

// Voix simultanées (toutes catégories, et voix de zombies seules) échantillonnées tous les 10 ms : moyenne et maximum.
export function simultaneous(spans, seconds, step = 0.01) {
  let all = 0;
  let zombie = 0;
  let maxAll = 0;
  let maxZombie = 0;
  let n = 0;
  for (let t = 0; t < seconds; t += step) {
    const live = spans.filter((s) => s.start <= t && s.end > t);
    const z = live.filter((s) => s.category === 'voix').length;
    all += live.length;
    zombie += z;
    maxAll = Math.max(maxAll, live.length);
    maxZombie = Math.max(maxZombie, z);
    n += 1;
  }
  return { meanAll: all / n, maxAll, meanZombie: zombie / n, maxZombie, perMinuteZombie: (spans.filter((s) => s.category === 'voix').length / seconds) * 60 };
}

export const rmsDb = (x) => {
  let e = 0;
  for (let i = 0; i < x.length; i += 1) e += x[i] * x[i];
  return 10 * Math.log10(Math.max(e / Math.max(1, x.length), 1e-20));
};
export const peakOf = (x) => x.reduce((m, v) => Math.max(m, Math.abs(v)), 0);

// Les deux packs sur la même scène.
export function compareScenes({ seconds = 60, zombies = 8 } = {}) {
  const audio = read('data/game/audio.json');
  const voice = read('data/game/zombie-voice.json');
  const frames = sceneFrames({ seconds, zombies });
  const res = {};
  for (const mode of ['ancien', 'choix']) {
    const recipes = recipesFor(mode);
    const { pack, ms, bytes, decodedBytes, buffers } = renderPack(recipes);
    const m = mixScene(frames, recipes, pack, audio, voice);
    res[mode] = { levelDb: rmsDb(m.mix), peak: peakOf(m.mix), peakComp: peakOf(m.comp), voices: m.voices, renderMs: ms, bytes, decodedBytes, buffers };
  }
  return res;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const seconds = Number(process.argv.find((a) => a.startsWith('--secondes='))?.split('=')[1] ?? 60);
  const r = compareScenes({ seconds });
  for (const [mode, v] of Object.entries(r)) {
    console.log(`${mode} : niveau moyen ${v.levelDb.toFixed(2)} dB, crête avant compresseur ${v.peak.toFixed(3)}, après ${v.peakComp.toFixed(3)} ; voix simultanées : moyenne ${v.voices.meanAll.toFixed(2)} (max ${v.voices.maxAll}), zombies ${v.voices.meanZombie.toFixed(2)} (max ${v.voices.maxZombie}, ${v.voices.perMinuteZombie.toFixed(1)} par minute) ; pack ${v.buffers} tampons, ${v.bytes} octets, mémoire décodée ${v.decodedBytes} octets, calcul ${v.renderMs.toFixed(0)} ms`);
  }
  console.log(`Écart de niveau (choix − ancien) : ${(r.choix.levelDb - r.ancien.levelDb).toFixed(2)} dB`);
}
