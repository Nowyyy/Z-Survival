// Lecture des sons : Web Audio, à partir des tampons calculés par js/core/synth.js (aucun fichier audio). Le contexte n'est créé
// qu'après le premier geste du joueur. Chaîne : source -> gain -> balance -> [passe-bas si étouffé] -> compresseur -> gain général -> sortie.
// Les événements du jeu passent par js/core/sound-director.js (demandes de lecture) ; ce fichier les joue, limite les voix et tient le
// journal des lectures (seulement avec ?test=1).
import { dropCategory } from '../core/audio-mix.js';
import { createDirector, direct, soundTable } from '../core/sound-director.js';
import { bufferName, isAtelier, packStats } from '../core/sound-choice.js';
import { loadLegacy, renderAtelier, soundMode } from './sound-loader.js';

const LOG_MAX = 200;

// config : { audio, materials, voice, sounds } (data/game/audio.json, sound-materials.json, zombie-voice.json, liste de sounds.json) ; test : tient le journal.
// autoAmbience : l'ambiance démarre toute seule (le jeu) ou seulement à la demande (page d'écoute).
// Lot 3i : mode des sons (?sons=choix|ancien|A|B|C, défaut choix) ; avec ?sons=ancien, la table des sons est celle d'avant le lot (recettes
// remplacées chargées par import dynamique, sons nouveaux absents). Versions (graines) d'un son de l'atelier non encore calculées : calculées au
// premier usage, gardées ensuite (cache sans éviction) ; en attendant, une version déjà prête du même son est jouée.
export function createAudio({ config, test = false, seed = 1, autoAmbience = true, mode = soundMode() } = {}) {
  const Context = typeof window === 'undefined' ? undefined : (window.AudioContext ?? window.webkitAudioContext);
  const recipes = new Map((Array.isArray(config.sounds) ? config.sounds : []).map((r) => [r.id, r]));
  const legacyMode = mode === 'ancien';
  const cfg = { audio: config.audio, materials: config.materials, voice: config.voice, sounds: soundTable(legacyMode ? config.sounds.filter((r) => !isAtelier(r)) : config.sounds) };
  if (legacyMode) {
    loadLegacy().then((list) => {
      for (const r of list) recipes.set(r.id, r);
      cfg.sounds = soundTable([...config.sounds.filter((r) => !isAtelier(r)), ...list]);
    }).catch(() => {});
  }
  // ?test=1 : empreinte de chaque tampon (somme pondérée des échantillons), comparée en test au rendu de Node.
  const sums = new Map();
  const fingerprint = (name, samples) => {
    if (!test) return;
    let sum = 0;
    for (let i = 0; i < samples.length; i += 1) sum += samples[i] * ((i % 7) + 1);
    sums.set(name, sum.toFixed(6));
  };
  const lazy = new Map(); // nom de tampon -> promesse de calcul au premier usage (cache sans éviction)
  const lazyStats = { count: 0, ms: 0 };
  const pcm = new Map(); // nom -> { sampleRate, samples, loop }
  const buffers = new Map(); // nom -> AudioBuffer
  const log = [];
  const active = new Map(); // identifiant de voix -> { source, nodes }
  let ctx = null;
  let compressor = null;
  let master = null;
  let ambience = null;
  let director = createDirector(seed);
  let muted = false;
  let volume = config.audio.volume?.default ?? 100;
  let suspended = false;
  let suspendTimer = 0;
  let nextVoice = 0;
  let lastFrame = { time: 0, listener: { x: 0, y: 0 }, walls: [] };
  const lastPlayed = new Map(); // son -> dernière version jouée (repli sans répétition)
  const waiting = new Map(); // réparation en attente de son tampon : clé (fenêtre) -> { stopped }
  let onState = () => {};
  const stats = { essentialMs: 0, backgroundMs: 0, ready: false, zombieVoices: 0 };

  const masterGain = () => (muted ? 0 : config.audio.masterGain * (volume / 100));
  const toBuffer = (name) => {
    const item = pcm.get(name);
    if (!ctx || !item || buffers.has(name)) return;
    const buffer = ctx.createBuffer(1, item.samples.length, item.sampleRate);
    buffer.copyToChannel(item.samples, 0);
    buffers.set(name, buffer);
  };
  const entry = (r, gameTime, extra = {}) => ({ sound: r.sound, variant: r.variant, gameTime, gain: r.gain, pan: r.pan, lowpass: r.lowpass, rate: r.rate, ...(r.lowpassHz === undefined ? {} : { lowpassHz: r.lowpassHz }), ...(r.zombie === undefined ? {} : { zombie: r.zombie }), ...extra });
  const note = (e) => {
    if (!test) return;
    log.push(e);
    if (log.length > LOG_MAX) log.shift();
  };

  function startAmbience() {
    if (!ctx || ambience || suspended || muted) return;
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
      return false;
    }
    const recipe = recipes.get(r.sound);
    let name = bufferName(r.sound, r.variant + 1, r.durationSec ?? null, legacyMode ? null : recipe);
    let buffer = buffers.get(name);
    let playedVariant = r.variant;
    if (!buffer && ctx && !suspended && !legacyMode && isAtelier(recipe)) {
      // Version pas encore calculée : une version prête du même son (à la même durée pour la réparation) la remplace cette fois-ci, autre
      // que la précédente si possible ; la version demandée (`asked` au journal) est calculée en arrière-plan pour la prochaine fois.
      const ready = [];
      for (let k = 1; k <= (cfg.sounds[r.sound]?.variants ?? 1); k += 1) if (buffers.has(bufferName(r.sound, k, r.durationSec ?? null, recipe))) ready.push(k - 1);
      const pick = ready.find((v) => v !== lastPlayed.get(r.sound)) ?? ready[0];
      // Réparation sans aucune version prête à cette durée : jouée dès que son tampon arrive, en phase avec la pose (ensure).
      ensure(name, recipe, r, pick === undefined && r.durationSec !== undefined);
      if (pick === undefined) return false;
      name = bufferName(r.sound, pick + 1, r.durationSec ?? null, recipe);
      buffer = buffers.get(name);
      playedVariant = pick;
    }
    return start(r, gameTime, buffer, playedVariant, name);
  }

  // Calcul au premier usage d'un tampon de l'atelier (version non préchargée, réparation à une autre durée) ; une réparation demandée est
  // lancée à sa réception, décalée du temps écoulé pour rester en phase avec la pose (sauf si elle a été arrêtée entre-temps).
  function ensure(name, recipe, r, startWhenReady = false) {
    const asked = ctx ? ctx.currentTime : 0;
    if (!lazy.has(name)) {
      const m = /-(\d+)$/.exec(name);
      lazy.set(name, renderAtelier(recipe, { version: m ? Number(m[1]) : 1, durationSec: r.durationSec ?? null, mode }).then((res) => {
        lazyStats.count += 1;
        lazyStats.ms += res.ms;
        pcm.set(name, { sampleRate: res.sampleRate, samples: res.samples, loop: false });
        fingerprint(name, res.samples);
        toBuffer(name);
        return name;
      }).catch(() => null));
    }
    if (!startWhenReady) return;
    const token = { stopped: false };
    waiting.set(r.key ?? name, token);
    lazy.get(name).then((done) => {
      if (!done || token.stopped || waiting.get(r.key ?? name) !== token) return;
      waiting.delete(r.key ?? name);
      const late = ctx ? Math.max(0, ctx.currentTime - asked) : 0;
      start({ ...r, offset: (r.offset ?? 0) + late }, r.gameTime ?? 0, buffers.get(name), r.variant, name);
    });
  }

  function start(r, gameTime, buffer, playedVariant, name) {
    if (!ctx || !buffer || suspended) return false;
    // Limite réelle de voix : au plus maxVoices sources en train de jouer ; la moins prioritaire (la plus ancienne à priorité égale) cède la
    // place, sauf si elle est plus prioritaire que la nouvelle voix.
    const priority = config.audio.priority?.[r.category] ?? 0;
    if (active.size >= (config.audio.maxVoices ?? 16)) {
      let victim = null;
      for (const [vid, v] of active) if (victim === null || v.priority < victim.priority || (v.priority === victim.priority && v.start < victim.start)) victim = { ...v, id: vid };
      if (victim.priority > priority) return false;
      try {
        victim.source.stop();
      } catch { /* déjà arrêtée */ }
      active.delete(victim.id);
    }
    nextVoice += 1;
    const id = nextVoice;
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
      filter.frequency.value = r.lowpassHz ?? config.audio.muffle.lowpass;
      tail.connect(filter);
      tail = filter;
      nodes.push(filter);
    }
    tail.connect(compressor);
    source.onended = () => {
      for (const n of nodes) n.disconnect();
      active.delete(id);
    };
    active.set(id, { source, gain, category: r.category, priority, start: nextVoice, fading: false, sound: r.sound, key: r.key ?? null });
    const offset = Math.min(Math.max(0, r.offset ?? 0), Math.max(0, buffer.duration - 0.01));
    source.start(ctx.currentTime + r.delay, offset);
    if (r.category === 'voix') stats.zombieVoices += 1;
    lastPlayed.set(r.sound, playedVariant);
    note(entry({ ...r, variant: playedVariant }, gameTime, { buffer: name, ...(playedVariant === r.variant ? {} : { asked: r.variant }), ...(offset > 0 ? { offset } : {}) }));
    return true;
  }

  // Arrêt de voix précises (réparation interrompue) : demande en attente annulée, voix jouées coupées après un fondu de 30 ms.
  function stopVoices(list) {
    for (const st of list) {
      const w = waiting.get(st.key);
      if (w) {
        w.stopped = true;
        waiting.delete(st.key);
      }
      if (!ctx) continue;
      const t = ctx.currentTime;
      for (const v of active.values()) {
        if (v.sound !== st.sound || v.key !== st.key || v.fading) continue;
        v.fading = true;
        try {
          v.gain.gain.setValueAtTime(v.gain.gain.value, t);
          v.gain.gain.linearRampToValueAtTime(0, t + 0.03);
          v.source.stop(t + 0.05);
        } catch { /* déjà arrêtée */ }
      }
      note({ sound: st.sound, stop: true, key: st.key, gameTime: lastFrame.time });
    }
  }

  // Arrêt en fondu des voix d'une catégorie (mélodie d'annonce à la mort et à « Rejouer ») : le gain tombe à 0 en `fade` s, puis la source
  // s'arrête et la voix disparaît du compte. La direction sonore oublie aussi ces voix (la limite de 16 voix se libère).
  function fadeCategory(category, fade = 0.3) {
    director = { ...director, voices: dropCategory(director.voices, category) };
    if (!ctx) return;
    const t = ctx.currentTime;
    for (const v of active.values()) {
      if (v.category !== category || v.fading) continue;
      v.fading = true;
      try {
        v.gain.gain.cancelScheduledValues(t);
        v.gain.gain.setValueAtTime(v.gain.gain.value, t);
        v.gain.gain.linearRampToValueAtTime(0, t + fade);
        v.source.stop(t + fade + 0.02);
      } catch { /* déjà arrêtée */ }
    }
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
    // Vrai quand le son peut sortir (contexte en marche) ; onChange(rappel) est appelé quand cela change.
    get running() {
      return ctx !== null && ctx.state === 'running';
    },
    // Vrai en pause ou onglet caché : le contexte est suspendu exprès, ce n'est pas un blocage du navigateur.
    get suspended() {
      return suspended;
    },
    set onChange(fn) {
      onState = typeof fn === 'function' ? fn : () => {};
    },
    get volume() {
      return volume;
    },
    stats,

    // À appeler depuis un geste du joueur. Sans effet si l'audio n'existe pas ou refuse : le jeu continue sans son.
    unlock() {
      if (ctx) {
        // Contexte créé par un geste que le navigateur n'a pas accepté (pointerdown à la souris) : chaque nouveau geste retente la reprise.
        if (!suspended && ctx.state !== 'running') ctx.resume?.().catch(() => {});
        return;
      }
      if (!Context) return;
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
        ctx.addEventListener?.('statechange', () => onState());
      } catch {
        ctx = null;
        return;
      }
      if (!suspended && ctx.state === 'suspended') ctx.resume?.().catch(() => {});
      if (autoAmbience) startAmbience();
    },

    // Tampons calculés par sound-loader.js : [{ name, sampleRate, samples, loop }] ; convertis tout de suite si le contexte existe.
    addSounds(items) {
      for (const it of items) {
        pcm.set(it.name, { sampleRate: it.sampleRate, samples: it.samples, loop: it.loop });
        fingerprint(it.name, it.samples);
        toBuffer(it.name);
      }
      if (autoAmbience && pcm.has('ambiance-1')) startAmbience();
    },

    toggleMute() {
      muted = !muted;
      if (master) master.gain.value = masterGain();
      if (muted) stopAmbience();
      else if (autoAmbience) startAmbience();
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
        if (autoAmbience) startAmbience();
      }
    },

    // Événements du jeu d'une image : frame = { time, listener: { x, y }, walls, paused, events }.
    handle(frame) {
      if (!ctx) return { requests: [], played: [] }; // aucun son demandé avant le premier geste
      lastFrame = { time: frame.time, listener: frame.listener, walls: frame.walls ?? [], floor: frame.floor };
      const out = direct(director, frame, cfg);
      director = out.state;
      if (out.stops?.length) stopVoices(out.stops);
      const played = out.requests.filter((r) => play({ ...r, gameTime: frame.time }, frame.time));
      return { requests: out.requests, played };
    },

    // Page d'écoute : joue un tampon précis (nom du son, variante dès 0) à plein gain, au centre. Renvoie sa durée en s, ou 0.
    preview(sound, variant = 0) {
      const info = cfg.sounds[sound];
      if (!ctx || !info) return 0;
      const r = { sound, category: info.category, variant, gain: 1, pan: 0, delay: 0, lowpass: false, rate: 1, duration: info.duration };
      return play(r, 0) ? info.duration : 0;
    },

    // Page d'écoute : lance ou arrête la boucle d'ambiance.
    ambience(on) {
      if (on) startAmbience();
      else stopAmbience();
      return ambience !== null;
    },

    // Son d'interface (pause, reprise) : type 'pause' ou 'resume'.
    ui(type) {
      api.handle({ ...lastFrame, paused: false, events: [{ type }] });
    },

    // Mort du joueur : la mélodie d'annonce s'arrête en fondu (0,3 s).
    stopAnnounce(fade = 0.3) {
      fadeCategory('annonce', fade);
    },

    // Remise à zéro d'une partie (la mélodie d'annonce en cours s'arrête en fondu).
    reset(seed2) {
      fadeCategory('annonce');
      director = createDirector(seed2);
      lastFrame = { time: 0, listener: lastFrame.listener, walls: lastFrame.walls };
    },

    // Poids du pack calculé (octets des tampons) et mémoire estimée une fois décodé (mono : 4 octets par échantillon), sans plafond.
    pack() {
      return { mode, ...packStats([...pcm.values()]), lazy: lazyStats.count, lazyMs: Math.round(lazyStats.ms) };
    },

    // Rapport pour ?test=1.
    state() {
      let bytes = 0;
      for (const it of pcm.values()) bytes += it.samples.length * 4;
      return {
        supported: Boolean(Context), unlocked: ctx !== null, contextState: ctx ? ctx.state : 'aucun', started: ctx !== null, muted, volume, suspended, buffers: pcm.size, loaded: [...pcm.keys()], bytes, mode, pack: api.pack(),
        essentialMs: Math.round(stats.essentialMs), backgroundMs: Math.round(stats.backgroundMs), ready: stats.ready, activeVoices: active.size, annonceActive: [...active.values()].filter((v) => v.category === 'annonce').length, sums: Object.fromEntries(sums), ambience: ambience !== null, log: log.map((e) => ({ ...e })),
      };
    },
  };
  return api;
}
