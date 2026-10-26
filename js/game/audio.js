// Lecture des sons : Web Audio, à partir des tampons calculés par js/core/synth.js (aucun fichier audio). Le contexte n'est créé
// qu'après le premier geste du joueur. Chaîne : source -> gain -> balance -> [passe-bas si étouffé] -> compresseur -> gain général -> sortie.
// Les événements du jeu passent par js/core/sound-director.js (demandes de lecture) ; ce fichier les joue, limite les voix et tient le
// journal des lectures (seulement avec ?test=1).
import { admitVoice, createVoiceState } from '../core/audio-mix.js';
import { createDirector, direct, soundTable } from '../core/sound-director.js';

const LOG_MAX = 200;

// config : { audio, materials, sounds } (data/game/audio.json, sound-materials.json, liste de sounds.json) ; test : tient le journal.
export function createAudio({ config, test = false, seed = 1 } = {}) {
  const Context = typeof window === 'undefined' ? undefined : (window.AudioContext ?? window.webkitAudioContext);
  const cfg = { audio: config.audio, materials: config.materials, sounds: soundTable(config.sounds) };
  const pcm = new Map(); // nom -> { sampleRate, samples, loop }
  const buffers = new Map(); // nom -> AudioBuffer
  const log = [];
  const active = new Map(); // identifiant de voix -> { source, nodes }
  let ctx = null;
  let compressor = null;
  let master = null;
  let ambience = null;
  let director = createDirector(seed);
  let voices = createVoiceState();
  let muted = false;
  let volume = config.audio.volume?.default ?? 100;
  let suspended = false;
  let suspendTimer = 0;
  let lastFrame = { time: 0, listener: { x: 0, y: 0 }, walls: [] };
  const stats = { essentialMs: 0, backgroundMs: 0, ready: false, zombieVoices: 0 };

  const masterGain = () => (muted ? 0 : config.audio.masterGain * (volume / 100));
  const toBuffer = (name) => {
    const item = pcm.get(name);
    if (!ctx || !item || buffers.has(name)) return;
    const buffer = ctx.createBuffer(1, item.samples.length, item.sampleRate);
    buffer.copyToChannel(item.samples, 0);
    buffers.set(name, buffer);
  };
  const entry = (r, gameTime, extra = {}) => ({ sound: r.sound, variant: r.variant, gameTime, gain: r.gain, pan: r.pan, lowpass: r.lowpass, rate: r.rate, ...extra });
  const note = (e) => {
    if (!test) return;
    log.push(e);
    if (log.length > LOG_MAX) log.shift();
  };

  function startAmbience() {
    if (!ctx || ambience || suspended) return;
    const buffer = buffers.get('ambiance-1');
    if (!buffer) return;
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(config.audio.categoryGain.ambiance, ctx.currentTime + (config.audio.ambientFade ?? 0.5));
    source.connect(gain);
    gain.connect(compressor);
    source.start();
    ambience = { source, gain };
  }
  function stopAmbience() {
    if (!ambience) return;
    try {
      ambience.source.stop();
      ambience.source.disconnect();
      ambience.gain.disconnect();
    } catch { /* déjà arrêtée */ }
    ambience = null;
  }

  function play(r, gameTime) {
    if (muted) {
      note(entry(r, gameTime, { muted: true }));
      return;
    }
    const buffer = buffers.get(`${r.sound}-${r.variant + 1}`);
    if (!ctx || !buffer || suspended) return;
    // Limite réelle de voix (temps audio) : la moins prioritaire et la plus ancienne cède la place.
    const admit = admitVoice(voices, { sound: r.sound, priority: config.audio.priority?.[r.category] ?? 0, duration: r.duration }, ctx.currentTime + r.delay, { maxVoices: config.audio.maxVoices, minDelay: {} });
    voices = admit.state;
    if (!admit.play) return;
    if (admit.stolen !== null) active.get(admit.stolen)?.source.stop();
    const id = voices.nextId - 1;
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.value = r.rate;
    const gain = ctx.createGain();
    gain.gain.value = r.gain * (config.audio.categoryGain[r.category] ?? 1);
    const nodes = [gain];
    source.connect(gain);
    let tail = gain;
    if (ctx.createStereoPanner) {
      const panner = ctx.createStereoPanner();
      panner.pan.value = r.pan;
      tail.connect(panner);
      tail = panner;
      nodes.push(panner);
    }
    if (r.lowpass) {
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = config.audio.muffle.lowpass;
      tail.connect(filter);
      tail = filter;
      nodes.push(filter);
    }
    tail.connect(compressor);
    source.onended = () => {
      for (const n of nodes) n.disconnect();
      active.delete(id);
    };
    active.set(id, { source });
    source.start(ctx.currentTime + r.delay);
    if (r.category === 'voix') stats.zombieVoices += 1;
    note(entry(r, gameTime));
  }

  const api = {
    get muted() {
      return muted;
    },
    get started() {
      return ctx !== null;
    },
    get supported() {
      return Boolean(Context);
    },
    get volume() {
      return volume;
    },
    stats,

    // À appeler depuis un geste du joueur. Sans effet si l'audio n'existe pas ou refuse : le jeu continue sans son.
    unlock() {
      if (ctx || !Context) return;
      try {
        ctx = new Context();
        compressor = ctx.createDynamicsCompressor();
        const c = config.audio.compressor;
        compressor.threshold.value = c.threshold;
        compressor.knee.value = c.knee;
        compressor.ratio.value = c.ratio;
        compressor.attack.value = c.attack;
        compressor.release.value = c.release;
        master = ctx.createGain();
        master.gain.value = masterGain();
        compressor.connect(master);
        master.connect(ctx.destination);
        for (const name of pcm.keys()) toBuffer(name);
      } catch {
        ctx = null;
        return;
      }
      if (!suspended && ctx.state === 'suspended') ctx.resume?.().catch(() => {});
      startAmbience();
    },

    // Tampons calculés par sound-loader.js : [{ name, sampleRate, samples, loop }] ; convertis tout de suite si le contexte existe.
    addSounds(items) {
      for (const it of items) {
        pcm.set(it.name, { sampleRate: it.sampleRate, samples: it.samples, loop: it.loop });
        toBuffer(it.name);
      }
      if (pcm.has('ambiance-1')) startAmbience();
    },

    toggleMute() {
      muted = !muted;
      if (master) master.gain.value = masterGain();
      return muted;
    },

    // Volume de 0 à 100 (en mémoire seulement : rien n'est stocké).
    setVolume(n) {
      const v = Math.round(Number(n));
      if (!Number.isFinite(v)) return volume;
      volume = Math.min(100, Math.max(0, v));
      if (master) master.gain.value = masterGain();
      return volume;
    },

    // Pause ou onglet caché : le contexte est suspendu (après la fin du son d'interface) et repris ensuite.
    setSuspended(flag) {
      if (flag === suspended) return;
      suspended = flag;
      clearTimeout(suspendTimer);
      if (!ctx) return;
      if (flag) {
        stopAmbience();
        suspendTimer = setTimeout(() => {
          if (suspended) ctx.suspend?.().catch(() => {});
        }, (config.audio.suspendDelay ?? 0.4) * 1000);
      } else {
        ctx.resume?.().catch(() => {});
        startAmbience();
      }
    },

    // Événements du jeu d'une image : frame = { time, listener: { x, y }, walls, paused, events }.
    handle(frame) {
      if (!ctx) return; // aucun son demandé avant le premier geste
      lastFrame = { time: frame.time, listener: frame.listener, walls: frame.walls ?? [] };
      const out = direct(director, frame, cfg);
      director = out.state;
      for (const r of out.requests) play(r, frame.time);
    },

    // Son d'interface (pause, reprise) : type 'pause' ou 'resume'.
    ui(type) {
      api.handle({ ...lastFrame, paused: false, events: [{ type }] });
    },

    // Remise à zéro d'une partie.
    reset(seed2) {
      director = createDirector(seed2);
      lastFrame = { time: 0, listener: lastFrame.listener, walls: lastFrame.walls };
    },

    // Rapport pour ?test=1.
    state() {
      let bytes = 0;
      for (const it of pcm.values()) bytes += it.samples.length * 4;
      return {
        supported: Boolean(Context), unlocked: ctx !== null, started: ctx !== null, muted, volume, suspended, buffers: pcm.size, bytes,
        essentialMs: Math.round(stats.essentialMs), backgroundMs: Math.round(stats.backgroundMs), ready: stats.ready, activeVoices: active.size, ambience: ambience !== null, log: log.map((e) => ({ ...e })),
      };
    },
  };
  return api;
}
