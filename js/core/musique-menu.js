// Lot 8i : partition de la musique des menus (Docs/ref/sons-menu.md). Pur : ni Web Audio, ni DOM, ni horloge, ni hasard natif.
// La musique n'est pas un tampon : c'est un séquenceur. Ce module donne, pour une mesure (indice absolu depuis le départ), les notes de chaque
// couche (pouls, ostinato, nappe, cloche, souffle, tic) et le niveau des couches ; js/menu/sons/musique.js les joue avec des nœuds Web Audio.
// - Sections (data/menu/sons.json, musique.variantes[].sections) : chacune dure `mesures` mesures et donne le niveau (0 à 1) de chaque couche ;
//   pendant sa première mesure, les niveaux glissent de ceux de la section précédente aux siens (les couches entrent et sortent sans à-coup).
// - Boucle : après la dernière section vient la première ; le glissement vaut aussi à ce passage, et le bourdon ne s'arrête jamais : aucune
//   jointure. D'un tour à l'autre (cycle), les motifs de l'ostinato et du pouls, les accords et les cloches changent (graine) : pas de lassitude.
// - rendreMusique : rendu de référence hors ligne, simplifié (sinus et enveloppes), pour mesurer la continuité au bouclage (tests).
import { createRandom, hashSeed } from './synth2-dsp.js';

export const COUCHES_MUSIQUE = Object.freeze(['pouls', 'ostinato', 'nappe', 'cloche', 'souffle', 'tic']);
const estObjet = (o) => o !== null && typeof o === 'object' && !Array.isArray(o);
const fini = (n) => typeof n === 'number' && Number.isFinite(n);
const borne = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
export const frequenceNote = (midi) => 440 * 2 ** ((midi - 69) / 12);

// Variante de la musique normalisée (valeurs bornées, couches et sections complètes), ou null si elle est inutilisable.
export function lireMusique(v) {
  if (!estObjet(v) || !Array.isArray(v.sections) || v.sections.length === 0 || !estObjet(v.couches)) return null;
  const bpm = fini(v.bpm) ? borne(v.bpm, 30, 200) : 80;
  const temps = Number.isInteger(v.temps) ? borne(v.temps, 2, 8) : 4;
  const sections = v.sections.filter(estObjet).map((s) => {
    const niveaux = {};
    for (const c of COUCHES_MUSIQUE) niveaux[c] = fini(s.niveaux?.[c]) ? borne(s.niveaux[c], 0, 1) : 0;
    return Object.freeze({ mesures: Number.isInteger(s.mesures) ? borne(s.mesures, 1, 64) : 4, niveaux: Object.freeze(niveaux) });
  });
  if (sections.length === 0) return null;
  const c = v.couches;
  const liste = (l, defaut) => (Array.isArray(l) && l.length ? l : defaut);
  const b = estObjet(v.bourdon) ? v.bourdon : {};
  const lp = Array.isArray(b.lp) && fini(b.lp[0]) && fini(b.lp[1]) ? [borne(b.lp[0], 60, 2000), borne(b.lp[1], 60, 4000)] : [170, 420];
  return Object.freeze({
    id: typeof v.id === 'string' ? v.id : '', nom: typeof v.nom === 'string' ? v.nom : '', bpm, temps,
    tonique: fini(v.tonique) ? borne(Math.round(v.tonique), 24, 60) : 38, graine: fini(v.graine) ? Math.trunc(v.graine) : 1,
    bourdon: Object.freeze({ gain: fini(b.gain) ? borne(b.gain, 0, 1) : 0.5, quinte: fini(b.quinte) ? borne(b.quinte, 0, 1) : 0.2, lp: Object.freeze(lp) }),
    couches: Object.freeze({
      pouls: Object.freeze({ gain: borne(c.pouls?.gain ?? 0.8, 0, 1), f: borne(c.pouls?.f ?? 58, 30, 200), motifs: liste(c.pouls?.motifs, [[[0, 1]]]) }),
      ostinato: Object.freeze({ gain: borne(c.ostinato?.gain ?? 0.3, 0, 1), pas: borne(c.ostinato?.pas ?? 0.5, 0.25, 4), octave: c.ostinato?.octave ?? 24, d: borne(c.ostinato?.d ?? 0.2, 0.03, 2), motifs: liste(c.ostinato?.motifs, [[0, 3, 7, 3]]) }),
      nappe: Object.freeze({ gain: borne(c.nappe?.gain ?? 0.2, 0, 1), octave: c.nappe?.octave ?? 24, mesures: borne(Math.round(c.nappe?.mesures ?? 2), 1, 8), accords: liste(c.nappe?.accords, [[0, 3, 7]]) }),
      cloche: Object.freeze({ gain: borne(c.cloche?.gain ?? 0.2, 0, 1), octave: c.cloche?.octave ?? 36, proba: borne(c.cloche?.proba ?? 0.3, 0, 1), d: borne(c.cloche?.d ?? 2, 0.2, 6), notes: liste(c.cloche?.notes, [0, 7]) }),
      souffle: Object.freeze({ gain: borne(c.souffle?.gain ?? 0.15, 0, 1), mesures: borne(Math.round(c.souffle?.mesures ?? 2), 1, 8), f: Array.isArray(c.souffle?.f) ? c.souffle.f : [300, 1000] }),
      tic: Object.freeze({ gain: borne(c.tic?.gain ?? 0.06, 0, 1), pas: borne(c.tic?.pas ?? 1, 0.25, 4), proba: borne(c.tic?.proba ?? 0.5, 0, 1) }),
    }),
    sections: Object.freeze(sections),
  });
}

export const dureeTemps = (v) => 60 / v.bpm;
export const dureeMesure = (v) => (v.temps * 60) / v.bpm;
export const mesuresCycle = (v) => v.sections.reduce((n, s) => n + s.mesures, 0);
export const dureeCycle = (v) => mesuresCycle(v) * dureeMesure(v);

// Place d'une mesure : { cycle, index (section), rang (mesure dans la section), section, precedente (section d'avant, en boucle) }.
export function sectionDe(v, mesure) {
  const total = mesuresCycle(v);
  const m = Math.max(0, Math.floor(mesure));
  const cycle = Math.floor(m / total);
  let reste = m - cycle * total;
  for (let i = 0; i < v.sections.length; i += 1) {
    if (reste < v.sections[i].mesures) return { cycle, index: i, rang: reste, section: v.sections[i], precedente: v.sections[(i - 1 + v.sections.length) % v.sections.length] };
    reste -= v.sections[i].mesures;
  }
  return { cycle, index: 0, rang: 0, section: v.sections[0], precedente: v.sections.at(-1) };
}

// Niveau des couches à la position u (0 à 1) d'une mesure : première mesure d'une section : de la section précédente vers celle-ci.
export function niveaux(v, mesure, u = 0) {
  const p = sectionDe(v, mesure);
  const out = {};
  const k = p.rang === 0 ? borne(u, 0, 1) : 1;
  for (const c of COUCHES_MUSIQUE) out[c] = p.precedente.niveaux[c] + (p.section.niveaux[c] - p.precedente.niveaux[c]) * k;
  return out;
}

// Ouverture du filtre du bourdon (Hz) au début d'une mesure : respiration lente, périodique sur le cycle (même valeur au bouclage).
export function filtreBourdon(v, mesure) {
  const total = mesuresCycle(v);
  const x = 0.5 - 0.5 * Math.cos((2 * Math.PI * 3 * (mesure % total)) / total);
  return v.bourdon.lp[0] + (v.bourdon.lp[1] - v.bourdon.lp[0]) * x;
}

// Notes d'une mesure : [{ couche, t (s depuis le début de la mesure), duree (s), freq (Hz), gain, d (décroissance, s) }], triées par instant.
// Déterministe : dépend de la variante, de la mesure et de la graine seulement.
export function notesMesure(v, mesure) {
  const p = sectionDe(v, mesure);
  const spb = dureeTemps(v);
  const bar = dureeMesure(v);
  const out = [];
  const niveauA = (c, t) => {
    const n = niveaux(v, mesure, t / bar);
    return n[c];
  };
  const tirage = (...cle) => createRandom(hashSeed('musique', v.graine, ...cle));
  // tn : instant où le niveau de la couche est lu (notes longues : le milieu de la mesure, pour entrer avec leur section).
  const pousser = (couche, t, duree, freq, gain, d = 0, tn = t) => {
    const g = gain * v.couches[couche].gain * niveauA(couche, tn);
    if (g > 0.001 && freq > 0) out.push({ couche, t, duree, freq, gain: g, d });
  };
  // Pouls : motif choisi par cycle et par section (battement de cœur lent : coup, contrecoup).
  const P = v.couches.pouls;
  const motifP = P.motifs[Math.floor(tirage('pouls', p.cycle, p.index).next() * P.motifs.length) % P.motifs.length];
  for (const coup of Array.isArray(motifP) ? motifP : []) if (Array.isArray(coup) && coup[0] < v.temps) pousser('pouls', coup[0] * spb, 0.3, P.f, coup[1] ?? 1, 0.1);
  // Ostinato : motif (degrés en demi-tons au-dessus de la tonique, null : silence) choisi par cycle et par section, temps forts accentués.
  const O = v.couches.ostinato;
  const motifO = O.motifs[Math.floor(tirage('ostinato', p.cycle, p.index).next() * O.motifs.length) % O.motifs.length];
  const pasO = Math.round(v.temps / O.pas);
  for (let k = 0; k < pasO; k += 1) {
    const deg = motifO[k % motifO.length];
    if (!fini(deg)) continue;
    pousser('ostinato', k * O.pas * spb, O.d * 4, frequenceNote(v.tonique + O.octave + deg), Number.isInteger(k * O.pas) ? 1 : 0.7, O.d);
  }
  // Nappe : un accord tenu toutes les `mesures` mesures (dissonances : seconde mineure, triton), tiré par cycle, section et rang.
  const N = v.couches.nappe;
  if (p.rang % N.mesures === 0) {
    const accord = N.accords[Math.floor(tirage('nappe', p.cycle, p.index, p.rang).next() * N.accords.length) % N.accords.length];
    for (const deg of Array.isArray(accord) ? accord : []) if (fini(deg)) pousser('nappe', 0, N.mesures * bar * 1.1, frequenceNote(v.tonique + N.octave + deg), 1 / Math.sqrt(accord.length), 0, bar * 0.5);
  }
  // Cloche : rare, sur un demi-temps tiré.
  const C = v.couches.cloche;
  const rc = tirage('cloche', p.cycle, mesure);
  if (rc.next() < C.proba) {
    const quand = Math.floor(rc.next() * v.temps * 2) * 0.5 * spb;
    const deg = C.notes[Math.floor(rc.next() * C.notes.length) % C.notes.length];
    pousser('cloche', quand, C.d * 3, frequenceNote(v.tonique + C.octave + (fini(deg) ? deg : 0)), 0.6 + 0.4 * rc.next(), C.d);
  }
  // Souffle : bruit filtré qui enfle et retombe, toutes les `mesures` mesures.
  const S = v.couches.souffle;
  if (p.rang % S.mesures === 0) {
    const rs = tirage('souffle', p.cycle, mesure);
    pousser('souffle', 0, S.mesures * bar, S.f[0] * (S.f[1] / S.f[0]) ** rs.next(), 1, 0, bar * 0.5);
  }
  // Tic : battue métallique discrète, tirée pas à pas.
  const T = v.couches.tic;
  const rt = tirage('tic', p.cycle, mesure);
  for (let k = 0; k * T.pas < v.temps; k += 1) if (rt.next() < T.proba) pousser('tic', k * T.pas * spb, 0.05, 6000, 0.6 + 0.4 * rt.next(), 0.012);
  return out.sort((a, b) => a.t - b.t);
}

// Rendu de référence hors ligne (mono) de `mesures` mesures à partir de `debut` : bourdon (fondamentale et quinte, niveau lié au filtre) et
// notes en sinus à enveloppes simples (pouls à chute de hauteur, pincé, nappe en fondu, cloche, souffle et tic en bruit à graine). Les notes
// commencées avant `debut` et qui sonnent encore sont comprises (comme dans le séquenceur). Sert aux mesures de continuité, pas à l'écoute.
export function rendreMusique(v, debut, mesures, sampleRate = 11025) {
  const sr = sampleRate;
  const bar = dureeMesure(v);
  const n = Math.round(mesures * bar * sr);
  const out = new Float32Array(n);
  const t0 = debut * bar;
  const f0 = frequenceNote(v.tonique);
  for (let i = 0; i < n; i += 1) {
    const t = t0 + i / sr;
    const m = Math.floor(t / bar);
    const u = t / bar - m;
    const lp = filtreBourdon(v, m) + (filtreBourdon(v, m + 1) - filtreBourdon(v, m)) * u;
    const ouverture = 0.6 + 0.4 * ((lp - v.bourdon.lp[0]) / Math.max(1, v.bourdon.lp[1] - v.bourdon.lp[0]));
    out[i] = v.bourdon.gain * ouverture * (Math.sin(2 * Math.PI * f0 * t) + v.bourdon.quinte * Math.sin(2 * Math.PI * f0 * 1.5 * t)) * 0.5;
  }
  const avant = Math.ceil(8 / bar) + 2;
  for (let m = Math.max(0, debut - avant); m < debut + mesures; m += 1) {
    for (const note of notesMesure(v, m)) {
      const depart = m * bar + note.t - t0;
      const i0 = Math.round(depart * sr);
      const len = Math.round(note.duree * sr);
      const bruit = note.couche === 'souffle' || note.couche === 'tic' ? createRandom(hashSeed('rendu', m, note.t)) : null;
      for (let i = Math.max(0, -i0); i < len && i0 + i < n; i += 1) {
        const t = i / sr;
        const u = t / note.duree;
        let s;
        let e;
        if (note.couche === 'nappe' || note.couche === 'souffle') e = Math.sin(Math.PI * u) ** 2;
        else e = Math.min(1, t / 0.004) * Math.exp(-t / Math.max(0.005, note.d)) * (1 - u);
        if (bruit) s = bruit.signed() * 0.5;
        else if (note.couche === 'pouls') s = Math.sin(2 * Math.PI * note.freq * (t + 0.03 * (1 - Math.exp(-t / 0.015))));
        else s = Math.sin(2 * Math.PI * note.freq * t);
        out[i0 + i] += s * e * note.gain;
      }
    }
  }
  return out;
}
