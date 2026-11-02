// Sons synthétisés avec Web Audio (aucun fichier). Les paramètres viennent de js/core/sound-params.js.
// Le contexte audio n'est créé qu'après le premier geste du joueur (règle des navigateurs et de confidentialité).
import { soundParams } from '../core/sound-params.js';

export function createAudio() {
  let ctx = null;
  let master = null;
  let noise = null;
  let muted = false;

  function noiseBuffer() {
    if (!noise) {
      noise = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * 0.5), ctx.sampleRate);
      const data = noise.getChannelData(0);
      // Bruit déterministe (le hasard est interdit dans le jeu) : congruence linéaire simple.
      let seed = 12345;
      for (let i = 0; i < data.length; i += 1) {
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
        data[i] = seed / 2147483648 - 1;
      }
    }
    return noise;
  }

  return {
    get muted() {
      return muted;
    },
    get started() {
      return ctx !== null;
    },

    // À appeler depuis un geste du joueur. Sans effet si l'audio n'existe pas ou refuse.
    unlock() {
      if (!ctx) {
        const Context = window.AudioContext ?? window.webkitAudioContext;
        if (!Context) return;
        try {
          ctx = new Context();
          master = ctx.createGain();
          master.gain.value = muted ? 0 : 1;
          master.connect(ctx.destination);
        } catch {
          ctx = null;
          return;
        }
      }
      if (ctx.state === 'suspended') ctx.resume?.().catch(() => {});
    },

    toggleMute() {
      muted = !muted;
      if (master) master.gain.value = muted ? 0 : 1;
      return muted;
    },

    play(name) {
      const p = soundParams(name);
      if (!p || !ctx || muted || ctx.state !== 'running') return;
      const t0 = ctx.currentTime;
      const t1 = t0 + p.duration;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.linearRampToValueAtTime(p.gain, t0 + p.attack);
      gain.gain.exponentialRampToValueAtTime(0.0001, t1);
      let source;
      if (p.type === 'noise') {
        source = ctx.createBufferSource();
        source.buffer = noiseBuffer();
        source.loop = true;
        const filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(p.freqStart * 6, t0);
        filter.frequency.exponentialRampToValueAtTime(p.freqEnd, t1);
        source.connect(filter);
        filter.connect(gain);
      } else {
        source = ctx.createOscillator();
        source.type = p.type;
        source.frequency.setValueAtTime(p.freqStart, t0);
        source.frequency.exponentialRampToValueAtTime(p.freqEnd, t1);
        source.connect(gain);
      }
      gain.connect(master);
      source.start(t0);
      source.stop(t1 + 0.02);
    },
  };
}
