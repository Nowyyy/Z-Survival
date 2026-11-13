// Lot 8i : synthèse des sons du menu (Docs/ref/sons-menu.md). Pur et déterministe : mêmes entrées, mêmes échantillons ; ni Web Audio, ni DOM,
// ni horloge, ni hasard natif. Construit sur les briques du moteur de l'atelier (js/core/synth2-dsp.js, lu seulement) ; une couche « moteur »
// rend une recette d'une famille du moteur (js/core/synth2.js : caisse enregistreuse, voix…). Recettes : data/menu/sons.json.
// rendreSon(son, variante, graine) -> { samples (Float32Array mono), sampleRate, duree, crete } : somme des couches, traitements (saturation,
// filtres, écho, réverbération courte), retrait du décalage continu, crête ramenée à `crete` dBFS (−3 par défaut, jamais au-dessus de −1),
// fondus aux deux bouts (premier et dernier échantillons nuls).
import { biquad, biquadSweep, clamp, createRandom, curveAt, dbToGain, fadeEdges, hashSeed, noise, num, removeDc, shortReverb, softClip } from '../../core/synth2-dsp.js';
import { render as rendreMoteur } from '../../core/synth2.js';

export const FREQUENCE = 22050;
export const CRETE_DB = -3;
export const CRETE_MAX_DB = -1;
export const DUREE_MAX = 4;
const TAU = Math.PI * 2;
const estObjet = (o) => o !== null && typeof o === 'object' && !Array.isArray(o);
const COULEURS = { blanc: 'white', rose: 'pink', brun: 'brown' };
const FILTRES = { bas: 'lowpass', haut: 'highpass', bande: 'bandpass' };
const midi = (m) => 440 * 2 ** ((m - 69) / 12);

// Enveloppe d'une couche à l'instant t (s depuis son début) : attaque `a` (cosinus surélevé), décroissance exponentielle `d` (absente : tenue),
// fin de couche `dur` en fondu `r` ; `env` : courbe par points [[u, valeur]] sur la durée, à la place.
function enveloppe(c, dur) {
  const a = Math.max(0.0005, num(c.a, 0.002));
  const d = num(c.d, 0);
  const r = Math.max(0.002, num(c.r, 0.01));
  const pts = Array.isArray(c.env) ? c.env : null;
  return (t) => {
    if (t < 0 || t >= dur) return 0;
    let e = pts ? Math.max(0, curveAt(pts, t / dur, 0)) : t < a ? 0.5 - 0.5 * Math.cos((Math.PI * t) / a) : d > 0 ? Math.exp(-(t - a) / d) : 1;
    if (dur - t < r) e *= (dur - t) / r;
    return e;
  };
}

// Onde d'une forme à la phase p (tours) : sinus, triangle, ou somme d'harmoniques bornée sous la moitié de la fréquence d'échantillonnage
// (scie : 1/k ; carré : impairs en 1/k), sans repliement.
function onde(forme, p, f, sr, h) {
  if (forme === 'tri') {
    const u = p - Math.floor(p);
    return u < 0.25 ? 4 * u : u < 0.75 ? 2 - 4 * u : 4 * u - 4;
  }
  if (forme === 'scie' || forme === 'carre') {
    const max = Math.max(1, Math.min(h, Math.floor((sr * 0.45) / Math.max(1, f))));
    let s = 0;
    for (let k = 1; k <= max; k += forme === 'carre' ? 2 : 1) s += Math.sin(TAU * p * k) / k;
    return s * 0.6;
  }
  return Math.sin(TAU * p);
}

// Bornes d'une couche dans le tampon : début `at` (s), durée `dur` (s ; défaut : jusqu'à la fin).
function bornes(c, n, sr) {
  const i0 = Math.min(n, Math.max(0, Math.round(num(c.at, 0) * sr)));
  const len = Math.max(0, Math.min(n - i0, Math.round(num(c.dur, n / sr) * sr)));
  return { i0, len };
}

// Ton : oscillateur f (Hz) glissant vers f2 (constante de temps tg, s), vibrato [Hz, profondeur relative], trémolo [Hz, profondeur],
// second oscillateur désaccordé de `desac` cents, passe-bas `lp` sur la couche.
function coucheTon(c, n, sr) {
  const { i0, len } = bornes(c, n, sr);
  const out = new Float64Array(n);
  const f1 = clamp(num(c.f, 440), 10, sr * 0.45);
  const f2 = clamp(num(c.f2, f1), 10, sr * 0.45);
  const tg = Math.max(0.001, num(c.tg, 0.05));
  const env = enveloppe(c, len / sr);
  const vib = Array.isArray(c.vib) ? c.vib : null;
  const trem = Array.isArray(c.trem) ? c.trem : null;
  const forme = typeof c.forme === 'string' ? c.forme : 'sin';
  const h = clamp(Math.round(num(c.h, 10)), 1, 24);
  const desac = num(c.desac, 0);
  const k2 = 2 ** (desac / 1200);
  let p = 0;
  let q = 0.25;
  for (let i = 0; i < len; i += 1) {
    const t = i / sr;
    let f = f2 + (f1 - f2) * Math.exp(-t / tg);
    if (vib) f *= 1 + num(vib[1]) * Math.sin(TAU * num(vib[0]) * t);
    let s = onde(forme, p, f, sr, h);
    if (desac !== 0) {
      s = 0.5 * (s + onde(forme, q, f * k2, sr, h));
      q += (f * k2) / sr;
    }
    p += f / sr;
    let e = env(t);
    if (trem) e *= 1 - num(trem[1]) * (0.5 + 0.5 * Math.sin(TAU * num(trem[0]) * t));
    out[i0 + i] = s * e;
  }
  return Number.isFinite(c.lp) ? biquad(out, { type: 'lowpass', freq: clamp(c.lp, 40, sr * 0.45), q: 0.707 }, sr) : out;
}

// Bruit filtré : couleur (blanc, rose, brun), filtre (bas, haut, bande) à f (Hz) glissant vers f2, facteur de qualité q, enveloppe, trémolo.
function coucheBruit(c, n, sr, graine) {
  const { i0, len } = bornes(c, n, sr);
  const out = new Float64Array(n);
  if (len < 2) return out;
  let x = noise(len, COULEURS[c.couleur] ?? 'white', graine);
  const type = FILTRES[c.filtre] ?? 'bandpass';
  const f1 = clamp(num(c.f, 1000), 30, sr * 0.45);
  const q = clamp(num(c.q, 0.9), 0.2, 30);
  if (Number.isFinite(c.f2)) x = biquadSweep(x, type, [[0, f1], [num(c.fu, 1), clamp(c.f2, 30, sr * 0.45)]], q, sr);
  else x = biquad(x, { type, freq: f1, q }, sr);
  const env = enveloppe(c, len / sr);
  const trem = Array.isArray(c.trem) ? c.trem : null;
  for (let i = 0; i < len; i += 1) {
    const t = i / sr;
    let e = env(t);
    if (trem) e *= 1 - num(trem[1]) * (0.5 + 0.5 * Math.sin(TAU * num(trem[0]) * t));
    out[i0 + i] = x[i] * e;
  }
  return out;
}

// Modes : partiels amortis [[f, gain, décroissance]] (métal, bois, verre), hauteur × mult, attaque de 1 ms.
function ajouterModes(out, i0, sr, partiels, mult, gain) {
  const n = out.length;
  for (const m of partiels) {
    const f = num(m[0]) * mult;
    if (!(f > 10) || f >= sr * 0.47) continue;
    const g = num(m[1], 1) * gain;
    const k = Math.exp(-1 / (Math.max(0.002, num(m[2], 0.05)) * sr));
    const w = (TAU * f) / sr;
    let a = g;
    for (let i = 0; i0 + i < n; i += 1) {
      out[i0 + i] += a * Math.sin(w * i) * (i < 22 ? i / 22 : 1);
      a *= k;
      if (Math.abs(a) < 1e-6) break;
    }
  }
}
function coucheModes(c, n, sr) {
  const out = new Float64Array(n);
  ajouterModes(out, Math.min(n, Math.max(0, Math.round(num(c.at, 0) * sr))), sr, Array.isArray(c.partiels) ? c.partiels.filter(Array.isArray) : [], num(c.mult, 1), 1);
  return out;
}

// Grains : `n` éclats brefs tirés (graine) entre `de` et `de + sur` secondes (exposant `serre` : > 1 les serre vers le début, < 1 vers la fin) ;
// sorte « ton » : sinus amortis de fréquence tirée dans f [bas, haut] (étincelles, pièces, gouttes) ; sorte « bruit » : éclats de bruit blanc
// passés ensuite dans une bande (gravats, grésillement). d [bas, haut] : décroissance de chaque éclat.
function coucheGrains(c, n, sr, graine) {
  const out = new Float64Array(n);
  const rnd = createRandom(graine);
  const nb = clamp(Math.round(num(c.n, 6)), 1, 200);
  const de = num(c.de, 0);
  const sur = Math.max(0.001, num(c.sur, 0.2));
  const serre = clamp(num(c.serre, 1), 0.2, 5);
  const fr = Array.isArray(c.f) ? c.f : [1000, 4000];
  const dr = Array.isArray(c.d) ? c.d : [0.004, 0.02];
  const bruit = c.sorte === 'bruit';
  for (let k = 0; k < nb; k += 1) {
    const t0 = de + sur * rnd.next() ** serre;
    const amp = 0.4 + 0.6 * rnd.next();
    const d = rnd.range(dr[0], dr[1]);
    const f = num(fr[0]) * (num(fr[1]) / Math.max(1, num(fr[0]))) ** rnd.next();
    const i0 = Math.round(t0 * sr);
    if (i0 >= n) continue;
    const dk = Math.exp(-1 / (Math.max(0.0005, d) * sr));
    let a = amp;
    if (bruit) {
      for (let i = 0; i0 + i < n && a > 1e-4; i += 1) {
        out[i0 + i] += a * rnd.signed();
        a *= dk;
      }
    } else if (f < sr * 0.47) {
      const w = (TAU * f) / sr;
      for (let i = 0; i0 + i < n && a > 1e-4; i += 1) {
        out[i0 + i] += a * Math.sin(w * i);
        a *= dk;
      }
    }
  }
  if (bruit) return biquad(out, { type: 'bandpass', freq: clamp(Math.sqrt(num(fr[0]) * num(fr[1])), 60, sr * 0.45), q: clamp(num(c.q, 0.8), 0.2, 20) }, sr);
  return out;
}

// Notes (signatures de rareté) : liste [[instant, note MIDI, gain, décroissance]] jouée par un timbre :
// cloche (partiels inharmoniques d'une barre : 1 ; 2,76 ; 5,40 ; 8,93), cuivre (scie adoucie, attaque de 40 ms), verre (sinus et partiels
// aigus, attaque de 60 ms, vibrato léger), pince (triangle bref), orgue (scie douce tenue, deux rangs désaccordés), bip (carré bref).
const BARRE = [[1, 1, 1], [2.76, 0.5, 0.6], [5.4, 0.25, 0.4], [8.93, 0.12, 0.25]];
function coucheNotes(c, n, sr) {
  const out = new Float64Array(n);
  const timbre = typeof c.timbre === 'string' ? c.timbre : 'cloche';
  for (const note of Array.isArray(c.liste) ? c.liste.filter(Array.isArray) : []) {
    const at = num(note[0]);
    const f = midi(num(note[1], 69));
    const g = num(note[2], 1);
    const d = Math.max(0.02, num(note[3], 0.3));
    if (timbre === 'cloche') ajouterModes(out, Math.max(0, Math.round(at * sr)), sr, BARRE.map(([r, a, k]) => [f * r, a, d * k]), 1, g);
    else {
      const couche = timbre === 'cuivre' ? { forme: 'scie', h: 12, f, a: 0.04, d, desac: 9, lp: Math.min(sr * 0.4, f * 6) }
        : timbre === 'verre' ? { forme: 'sin', f, a: 0.06, d, vib: [5.5, 0.004] }
          : timbre === 'orgue' ? { forme: 'scie', h: 6, f, a: 0.025, d, desac: 6, lp: Math.min(sr * 0.4, f * 4) }
            : timbre === 'bip' ? { forme: 'carre', h: 7, f, a: 0.003, d, lp: Math.min(sr * 0.4, f * 5) }
              : { forme: 'tri', f, a: 0.003, d };
      const x = coucheTon({ ...couche, at, dur: Math.min(n / sr - at, d * 6 + 0.1) }, n, sr);
      for (let i = 0; i < n; i += 1) out[i] += x[i] * g;
      if (timbre === 'verre') ajouterModes(out, Math.max(0, Math.round(at * sr)), sr, [[f * 2, 0.3, d * 0.5], [f * 3.01, 0.15, d * 0.3]], 1, g);
    }
  }
  return out;
}

// Moteur : recette d'une famille du moteur de l'atelier (kind : register, chime, voice, flesh…), rendue par js/core/synth2.js, placée à `at`.
function coucheMoteur(c, n, sr, graine) {
  const out = new Float64Array(n);
  if (!estObjet(c.recette)) return out;
  const x = rendreMoteur(c.recette, { peakDb: -1, ...(estObjet(c.params) ? c.params : {}) }, graine, sr);
  const i0 = Math.max(0, Math.round(num(c.at, 0) * sr));
  for (let i = 0; i < x.length && i0 + i < n; i += 1) out[i0 + i] = x[i];
  return out;
}

const COUCHES = { ton: coucheTon, bruit: coucheBruit, modes: coucheModes, grains: coucheGrains, notes: coucheNotes, moteur: coucheMoteur };
export const SORTES_COUCHES = Object.freeze(Object.keys(COUCHES));

// Écho : ligne à retard [retard (s), réinjection, part] (queue des signatures, des explosions) ; même longueur que l'entrée.
function echo(x, sr, [retard, reinjection, part]) {
  const d = Math.max(1, Math.round(clamp(num(retard, 0.12), 0.005, 1) * sr));
  const fb = clamp(num(reinjection, 0.3), 0, 0.9);
  const m = clamp(num(part, 0.3), 0, 1);
  const ligne = new Float64Array(d);
  const out = new Float64Array(x.length);
  let k = 0;
  let filtre = 0;
  for (let i = 0; i < x.length; i += 1) {
    const o = ligne[k];
    filtre = o * 0.6 + filtre * 0.4;
    ligne[k] = x[i] + filtre * fb;
    k = (k + 1) % d;
    out[i] = x[i] + m * o;
  }
  return out;
}

// Variante d'un son (objet de data/menu/sons.json) ; null si absente.
export function trouverVariante(son, id) {
  return (Array.isArray(son?.variantes) ? son.variantes : []).find((v) => v?.id === id) ?? null;
}

// Rendu d'une variante. graine : version (entier dès 1). Une variante absente ou vide donne un tampon vide.
export function rendreSon(son, varianteId, graine = 1, sampleRate = FREQUENCE) {
  const sr = Number.isFinite(sampleRate) && sampleRate >= 8000 && sampleRate <= 48000 ? Math.round(sampleRate) : FREQUENCE;
  const v = trouverVariante(son, varianteId);
  const vide = { samples: new Float32Array(0), sampleRate: sr, duree: 0, crete: 0 };
  if (!v || !Array.isArray(v.couches)) return vide;
  const dur = clamp(num(v.dur, 0.2), 0.02, DUREE_MAX);
  const n = Math.max(2, Math.round(dur * sr));
  const base = hashSeed('sons-menu', String(son?.id ?? ''), String(v.id ?? ''), Number.isFinite(graine) ? Math.trunc(graine) : 1);
  let x = new Float64Array(n);
  v.couches.forEach((c, k) => {
    const fn = estObjet(c) ? COUCHES[c.t] : null;
    if (!fn) return;
    const y = fn(c, n, sr, hashSeed(base, k));
    const g = num(c.gain, 1);
    for (let i = 0; i < n; i += 1) x[i] += y[i] * g;
  });
  const post = estObjet(v.post) ? v.post : {};
  if (num(post.sat) > 0) {
    let pk = 0;
    for (let i = 0; i < n; i += 1) pk = Math.max(pk, Math.abs(x[i]));
    if (pk > 1e-12) for (let i = 0; i < n; i += 1) x[i] /= pk;
    x = softClip(x, post.sat);
  }
  if (Number.isFinite(post.hp)) x = biquad(x, { type: 'highpass', freq: clamp(post.hp, 20, sr * 0.4), q: 0.707 }, sr);
  if (Number.isFinite(post.lp)) x = biquad(x, { type: 'lowpass', freq: clamp(post.lp, 100, sr * 0.45), q: 0.707 }, sr);
  if (Array.isArray(post.echo)) x = echo(x, sr, post.echo);
  if (Array.isArray(post.reverb)) x = shortReverb(x, sr, { mix: num(post.reverb[0], 0.2), time: num(post.reverb[1], 0.1), damping: num(post.reverb[2], 0.4) });
  x = removeDc(x, sr, 20);
  x = fadeEdges(x, sr, num(post.debut, 0.001), num(post.fin, 0.012));
  let pk = 0;
  for (let i = 0; i < n; i += 1) pk = Math.max(pk, Math.abs(x[i]));
  if (pk <= 1e-9) return { ...vide, samples: new Float32Array(n), duree: n / sr };
  const cible = dbToGain(clamp(num(v.crete, CRETE_DB), -40, CRETE_MAX_DB) - 0.02); // marge d'arrondi Float32
  const k = cible / pk;
  const samples = new Float32Array(n);
  for (let i = 0; i < n; i += 1) samples[i] = x[i] * k;
  return { samples, sampleRate: sr, duree: n / sr, crete: cible };
}

// Mesures simples d'un tampon (page d'écoute, tests, bilan) : crête et niveau moyen en dBFS, centre de gravité spectral grossier (Hz, par le
// taux de passages par zéro pondéré : sans transformée), octets.
export function mesurerSon(samples, sampleRate = FREQUENCE) {
  const n = samples.length;
  if (n === 0) return { duree: 0, creteDb: -200, moyenDb: -200, aiguHz: 0, octets: 0 };
  let pk = 0;
  let sq = 0;
  let dsq = 0;
  for (let i = 0; i < n; i += 1) {
    const a = samples[i];
    pk = Math.max(pk, Math.abs(a));
    sq += a * a;
    if (i > 0) dsq += (a - samples[i - 1]) ** 2;
  }
  const db = (v) => (v > 1e-10 ? 20 * Math.log10(v) : -200);
  // Fréquence « moyenne » d'après le rapport énergie de la dérivée / énergie : exacte pour un sinus, indicative sinon (spectre grossier).
  const aigu = sq > 1e-12 ? (sampleRate / TAU) * 2 * Math.asin(Math.min(1, Math.sqrt(dsq / sq) / 2)) : 0;
  return { duree: n / sampleRate, creteDb: db(pk), moyenDb: db(Math.sqrt(sq / n)), aiguHz: Math.round(aigu), octets: n * 4 };
}
