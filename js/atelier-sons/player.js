// Lecteur de l'atelier des sons (lot 3h) : Web Audio, créé seulement après un geste. Chaîne : source -> gain (catégorie du jeu) ->
// [passe-bas d'étouffement] -> volume maître (40 % par défaut) -> limiteur (compresseur rapide à fort rapport) -> sortie.
// Même méthode de déblocage que le jeu (js/game/audio.js) : contexte créé au premier geste, reprise retentée à chaque geste.

export function createPlayer({ volume = 40, limiter = {} } = {}) {
  const Context = typeof window === 'undefined' ? undefined : (window.AudioContext ?? window.webkitAudioContext);
  let ctx = null;
  let master = null;
  let comp = null;
  let vol = Math.min(100, Math.max(0, Number(volume) || 0));
  let nextId = 0;
  const active = new Map();
  const listeners = new Set();
  const notify = () => {
    for (const fn of listeners) fn();
  };

  const api = {
    get supported() {
      return Boolean(Context);
    },
    get unlocked() {
      return ctx !== null;
    },
    get running() {
      return ctx !== null && ctx.state === 'running';
    },
    get volume() {
      return vol;
    },
    get time() {
      return ctx ? ctx.currentTime : 0;
    },
    onChange(fn) {
      if (typeof fn === 'function') listeners.add(fn);
    },
    // À appeler depuis un geste. Renvoie vrai si le contexte existe (en marche ou en cours de reprise).
    unlock() {
      if (!Context) return false;
      if (!ctx) {
        try {
          ctx = new Context();
          comp = ctx.createDynamicsCompressor();
          comp.threshold.value = limiter.threshold ?? -6;
          comp.knee.value = limiter.knee ?? 0;
          comp.ratio.value = limiter.ratio ?? 20;
          comp.attack.value = limiter.attack ?? 0.002;
          comp.release.value = limiter.release ?? 0.1;
          master = ctx.createGain();
          master.gain.value = vol / 100;
          master.connect(comp);
          comp.connect(ctx.destination);
          ctx.addEventListener?.('statechange', notify);
        } catch {
          ctx = null;
          return false;
        }
      }
      if (ctx.state !== 'running') ctx.resume?.().then(notify, () => {});
      notify();
      return true;
    },
    setVolume(n) {
      const v = Math.round(Number(n));
      if (!Number.isFinite(v)) return vol;
      vol = Math.min(100, Math.max(0, v));
      if (master) master.gain.value = vol / 100;
      return vol;
    },
    // Joue un tampon mono ; options : gain (linéaire), rate (vitesse de lecture), delay (s), lowpassHz (étouffement). Renvoie l'identifiant de voix ou 0.
    play(samples, sampleRate, { gain = 1, rate = 1, delay = 0, lowpassHz = null } = {}) {
      if (!ctx || !samples || samples.length === 0) return 0;
      const buffer = ctx.createBuffer(1, samples.length, sampleRate);
      buffer.copyToChannel(samples, 0);
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.playbackRate.value = rate;
      const g = ctx.createGain();
      g.gain.value = gain;
      source.connect(g);
      const nodes = [g];
      let tail = g;
      if (Number.isFinite(lowpassHz) && lowpassHz > 0) {
        const f = ctx.createBiquadFilter();
        f.type = 'lowpass';
        f.frequency.value = lowpassHz;
        tail.connect(f);
        tail = f;
        nodes.push(f);
      }
      tail.connect(master);
      nextId += 1;
      const id = nextId;
      source.onended = () => {
        for (const n of nodes) n.disconnect();
        active.delete(id);
      };
      active.set(id, source);
      source.start(ctx.currentTime + Math.max(0, delay));
      return id;
    },
    stopAll() {
      for (const s of active.values()) {
        try {
          s.stop();
        } catch { /* déjà arrêtée */ }
      }
      active.clear();
    },
    get activeVoices() {
      return active.size;
    },
    // Description du graphe réel (pour ?test=1) : nœuds de sortie et réglages du limiteur.
    graph() {
      if (!ctx) return { nodes: [], limiter: null };
      return {
        nodes: ['source', 'gain', master instanceof GainNode ? 'volume' : '?', comp instanceof DynamicsCompressorNode ? 'limiteur' : '?', 'sortie'],
        volume: master.gain.value,
        limiter: { type: comp.constructor.name, threshold: comp.threshold.value, knee: comp.knee.value, ratio: comp.ratio.value, attack: comp.attack.value, release: comp.release.value },
      };
    },
    get state() {
      return ctx ? ctx.state : 'aucun';
    },
  };
  return api;
}
