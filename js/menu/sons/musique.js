// Lot 8i : musique des menus jouée en temps réel (Docs/ref/sons-menu.md). Aucun tampon de musique : la partition pure
// (js/core/musique-menu.js) est jouée par des nœuds Web Audio créés à mesure et libérés à leur fin. Seule mémoire : un tampon de bruit de
// 2 s (souffle, tic). Chaîne : couches → mélange → [écho : ligne à retard réinjectée] → niveau (fondus, baisse) → sortie (gain « musique »).
// - Bourdon continu : deux scies désaccordées et une quinte, dans un passe-bas qui respire d'une mesure à l'autre.
// - Séquenceur : toutes les 250 ms, les mesures qui commencent dans la seconde à venir sont programmées sur l'horloge audio (jamais sur des
//   minuteries note par note) ; à la pause (page cachée, son coupé), les voix s'arrêtent et la mesure en cours est reprise au retour.
// - rendreHorsLigne : la même chaîne dans un OfflineAudioContext (mesure de la continuité au bouclage ; tests).
import { COUCHES_MUSIQUE, dureeMesure, dureeTemps, filtreBourdon, frequenceNote, notesMesure } from '../../core/musique-menu.js';

const AVANCE_S = 1;
const PERIODE_MS = 250;
const BRUIT_S = 2;

// Tampon de bruit blanc déterministe (générateur congruentiel : aucun hasard natif).
function tamponBruit(ctx) {
  const n = Math.round(BRUIT_S * ctx.sampleRate);
  const buf = ctx.createBuffer(1, n, ctx.sampleRate);
  const x = buf.getChannelData(0);
  let s = 0x2545f491;
  for (let i = 0; i < n; i += 1) {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    x[i] = s / 2147483648 - 1;
  }
  return buf;
}

// ctx : AudioContext ou OfflineAudioContext ; sortie : nœud de destination (gain « musique ») ; variante : lireMusique(…).
export function creerMusique({ ctx, sortie, variante, reglages = {}, minuterie = true }) {
  const v = variante;
  const bar = dureeMesure(v);
  const niveau = ctx.createGain();
  niveau.gain.value = 0;
  niveau.connect(sortie);
  const melange = ctx.createGain();
  melange.gain.value = Number.isFinite(reglages.gain) ? reglages.gain : 0.5;
  melange.connect(niveau);
  // Écho : trois quarts de temps, réinjecté à 35 % dans un passe-bas.
  const retard = ctx.createDelay(2);
  retard.delayTime.value = Math.min(1.9, dureeTemps(v) * 0.75);
  const reinjection = ctx.createGain();
  reinjection.gain.value = 0.35;
  const sourdine = ctx.createBiquadFilter();
  sourdine.type = 'lowpass';
  sourdine.frequency.value = 1800;
  const echo = ctx.createGain();
  echo.gain.value = 0.25;
  retard.connect(sourdine).connect(reinjection).connect(retard);
  retard.connect(echo).connect(melange);
  const bus = {};
  for (const c of [...COUCHES_MUSIQUE, 'bourdon']) {
    bus[c] = ctx.createGain();
    bus[c].connect(melange);
    if (c === 'ostinato' || c === 'cloche' || c === 'tic') bus[c].connect(retard);
  }
  const bruit = tamponBruit(ctx);
  const voix = new Set();
  let bourdon = null;
  let filtre = null;
  let mesure = 0; // prochaine mesure à programmer
  let prochain = 0; // instant audio de son début
  let horloge = 0;
  let enMarche = false;
  let libere = false;
  let notes = 0;

  const suivre = (source, noeuds) => {
    voix.add(source);
    source.onended = () => {
      voix.delete(source);
      for (const n of noeuds) n.disconnect();
    };
  };
  const enveloppe = (g, t, pic, attaque, fin) => {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, pic), t + attaque);
    g.gain.exponentialRampToValueAtTime(0.0001, fin);
  };
  function jouerNote(n, t) {
    notes += 1;
    const g = ctx.createGain();
    g.connect(bus[n.couche]);
    const fin = t + n.duree;
    if (n.couche === 'souffle' || n.couche === 'tic') {
      const src = ctx.createBufferSource();
      src.buffer = bruit;
      src.loop = true;
      const f = ctx.createBiquadFilter();
      f.type = n.couche === 'tic' ? 'highpass' : 'bandpass';
      f.frequency.value = n.couche === 'tic' ? 5000 : n.freq;
      f.Q.value = n.couche === 'tic' ? 0.7 : 1.2;
      src.connect(f).connect(g);
      if (n.couche === 'tic') enveloppe(g, t, n.gain, 0.002, fin);
      else {
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(n.gain, t + n.duree * 0.45);
        g.gain.linearRampToValueAtTime(0, fin);
      }
      src.start(t, (notes * 0.137) % BRUIT_S);
      src.stop(fin + 0.02);
      suivre(src, [f, g]);
      return;
    }
    if (n.couche === 'nappe') {
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = Math.min(1400, n.freq * 4);
      f.connect(g);
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(n.gain * 0.5, t + n.duree * 0.4);
      g.gain.linearRampToValueAtTime(0, fin);
      for (const cents of [-7, 7]) {
        const o = ctx.createOscillator();
        o.type = 'sawtooth';
        o.frequency.value = n.freq;
        o.detune.value = cents;
        o.connect(f);
        o.start(t);
        o.stop(fin + 0.02);
        suivre(o, cents > 0 ? [f, g] : []);
      }
      return;
    }
    if (n.couche === 'cloche') {
      enveloppe(g, t, n.gain, 0.003, fin);
      [[1, 1], [2.76, 0.4], [5.4, 0.2]].forEach(([r, a], k) => {
        if (n.freq * r > ctx.sampleRate * 0.45) return;
        const o = ctx.createOscillator();
        o.frequency.value = n.freq * r;
        const p = ctx.createGain();
        p.gain.value = a;
        o.connect(p).connect(g);
        o.start(t);
        o.stop(Math.min(fin, t + n.duree / (1 + k)) + 0.02);
        suivre(o, k === 0 ? [p, g] : [p]);
      });
      return;
    }
    const o = ctx.createOscillator();
    const filtres = [];
    if (n.couche === 'pouls') {
      // Coup grave à chute de hauteur, doublé à l'octave (petits haut-parleurs).
      o.frequency.setValueAtTime(n.freq * 3.2, t);
      o.frequency.exponentialRampToValueAtTime(n.freq, t + 0.05);
      const o2 = ctx.createOscillator();
      o2.type = 'triangle';
      o2.frequency.setValueAtTime(n.freq * 6, t);
      o2.frequency.exponentialRampToValueAtTime(n.freq * 2, t + 0.04);
      const p = ctx.createGain();
      p.gain.value = 0.35;
      o2.connect(p).connect(g);
      o2.start(t);
      o2.stop(fin + 0.02);
      suivre(o2, [p]);
      o.connect(g);
      enveloppe(g, t, n.gain, 0.005, fin);
    } else {
      // Ostinato : triangle pincé, passe-bas qui se referme.
      o.type = 'triangle';
      o.frequency.value = n.freq;
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.setValueAtTime(Math.min(8000, n.freq * 5), t);
      f.frequency.exponentialRampToValueAtTime(Math.max(200, n.freq * 1.3), t + Math.max(0.05, n.d * 2));
      o.connect(f).connect(g);
      enveloppe(g, t, n.gain, 0.004, fin);
      filtres.push(f);
    }
    o.start(t);
    o.stop(fin + 0.02);
    suivre(o, [...filtres, g]);
  }
  function programmerMesure(m, t) {
    for (const n of notesMesure(v, m)) if (t + n.t >= ctx.currentTime - 0.01) jouerNote(n, Math.max(ctx.currentTime, t + n.t));
    if (filtre) filtre.frequency.linearRampToValueAtTime(filtreBourdon(v, m + 1), t + bar);
  }
  function avancer(jusque = ctx.currentTime + AVANCE_S) {
    while (prochain < jusque) {
      programmerMesure(mesure, prochain);
      mesure += 1;
      prochain += bar;
    }
  }
  function lancerBourdon(t) {
    if (bourdon) return;
    filtre = ctx.createBiquadFilter();
    filtre.type = 'lowpass';
    filtre.Q.value = 0.9;
    filtre.frequency.setValueAtTime(filtreBourdon(v, mesure), t);
    const g = ctx.createGain();
    g.gain.value = v.bourdon.gain * 0.5;
    filtre.connect(g).connect(bus.bourdon);
    const f0 = frequenceNote(v.tonique);
    bourdon = [];
    for (const [type, f, cents, a] of [['sawtooth', f0, -6, 1], ['sawtooth', f0, 6, 1], ['triangle', f0 * 1.5, 0, v.bourdon.quinte * 2], ['sine', f0 * 2, 3, 0.4]]) {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.value = f;
      o.detune.value = cents;
      const p = ctx.createGain();
      p.gain.value = a;
      o.connect(p).connect(filtre);
      o.start(t);
      bourdon.push(o, p);
    }
    bourdon.push(g);
  }
  function couper() {
    for (const s of [...voix]) {
      try {
        s.stop?.();
      } catch { /* déjà arrêtée */ }
    }
    voix.clear();
  }
  const rampe = (cible, fondu) => {
    const t = ctx.currentTime;
    niveau.gain.cancelScheduledValues(t);
    niveau.gain.setValueAtTime(niveau.gain.value, t);
    niveau.gain.linearRampToValueAtTime(cible, t + Math.max(0.01, fondu));
  };

  const api = {
    // Départ (ou reprise après une pause) : la mesure en cours repart dans 0,1 s ; le niveau monte en `fondu` s vers `cible`.
    demarrer(cible = 1, fondu = 2.5) {
      if (libere || enMarche) return;
      enMarche = true;
      prochain = ctx.currentTime + 0.1;
      lancerBourdon(prochain);
      avancer();
      if (minuterie) horloge = setInterval(() => avancer(), PERIODE_MS);
      rampe(cible, fondu);
    },
    // Niveau visé (0 à 1 : plein, baissé pendant une ouverture), atteint en `fondu` s.
    niveau(cible, fondu = 0.4) {
      if (!libere) rampe(cible, fondu);
    },
    // Pause : fondu court, puis les voix programmées s'arrêtent ; la mesure commencée sera rejouée à la reprise.
    arreter(fondu = 0.2) {
      if (libere || !enMarche) return;
      enMarche = false;
      clearInterval(horloge);
      rampe(0, fondu);
      mesure = Math.max(0, mesure - 1);
      setTimeout(() => {
        if (!enMarche) couper();
      }, fondu * 1000 + 60);
    },
    // Couche coupée ou rétablie (page d'écoute).
    couche(nom, active) {
      if (bus[nom]) bus[nom].gain.value = active ? 1 : 0;
    },
    // Hors ligne : programme d'un coup les mesures [debut, debut + n[ à partir de l'instant t0.
    programmer(debut, n, t0 = 0) {
      mesure = debut;
      prochain = t0;
      lancerBourdon(t0);
      niveau.gain.setValueAtTime(1, 0);
      avancer(t0 + n * bar - 1e-6);
    },
    etat: () => ({ variante: v.id, enMarche, mesure, voix: voix.size, notes, niveau: niveau.gain.value, octets: bruit.length * 4, libere }),
    // Arrêt définitif : tout est déconnecté (« JOUER » après le fondu, page d'écoute).
    liberer() {
      if (libere) return;
      libere = true;
      enMarche = false;
      clearInterval(horloge);
      couper();
      for (const n of bourdon ?? []) {
        try {
          n.stop?.();
        } catch { /* déjà arrêté */ }
        n.disconnect();
      }
      bourdon = null;
      for (const n of [filtre, ...Object.values(bus), retard, reinjection, sourdine, echo, melange, niveau]) n?.disconnect();
    },
  };
  return api;
}

// Rendu hors ligne de `mesures` mesures à partir de `debut`, précédées de `elan` mesures (les notes tenues y naissent) : Float32Array mono
// des seules mesures demandées. Même chaîne que la lecture en temps réel.
export async function rendreHorsLigne(variante, { debut = 0, mesures = 2, elan = 2, sampleRate = 22050, reglages = {} } = {}) {
  const bar = dureeMesure(variante);
  const avant = Math.min(elan, debut);
  const total = Math.round((avant + mesures) * bar * sampleRate);
  const ctx = new OfflineAudioContext(1, total, sampleRate);
  const m = creerMusique({ ctx, sortie: ctx.destination, variante, reglages, minuterie: false });
  m.programmer(debut - avant, avant + mesures, 0);
  const rendu = await ctx.startRendering();
  return rendu.getChannelData(0).slice(Math.round(avant * bar * sampleRate));
}
