// Générateurs du lot 3h : une famille de sons (« kind ») = une fonction pure (recette, contexte) -> Float64Array de ctx.n échantillons.
// Le contexte porte la fréquence d'échantillonnage, le hasard à graine et les facteurs des macros : pitch (hauteur), bright (matière :
// brillance des filtres), grain (bruit, rugosité), tm (échelle des temps : durée). La normalisation, la réverbération courte, le retrait
// du décalage continu et les fondus sont faits ensuite par synth2.js (render). Valeurs des recettes : data/game/sounds-atelier.json.
// Principes acoustiques (aucun son existant n'est copié) : pas = impact talon + pointe, modes du sol, frottement, coupure raide des aigus ;
// voix = source glottale de Rosenberg + banc de formants ; bois = synthèse modale (résonateurs) excitée par des éclats de bruit ;
// marteau = corps de bois grave + pointe métallique brève ; frottements = bruit filtré modulé par un collé-glissé irrégulier.
import { clamp, createRandom, curveAt, envAD, envCurve, formantBank, glottalSource, hashSeed, highpass1, lowpass1, lowpassSteep, biquad, biquadSweep, mixLayers, noise, num, resonate } from './synth2-dsp.js';
import { isNum } from './vec.js';

const TAU = Math.PI * 2;
const isObj = (o) => o !== null && typeof o === 'object' && !Array.isArray(o);
const modesOf = (list, k = 1) => (Array.isArray(list) ? list : []).filter((m) => isObj(m) && isNum(m.f)).map((m) => ({ f: m.f * k, gain: num(m.gain, 1), decay: num(m.decay, 0.05) }));
const at = (ctx, t) => Math.round(num(t) * ctx.tm * ctx.sr);

// Excitation d'un choc : impulsion de contact en demi-sinus de `dur` s (force toujours positive : spectre plat jusqu'à ~1/dur puis
// décroissant, le même d'une graine à l'autre), plus un peu de bruit décroissant (texture, part `noisy`), passe-bas à `lp` Hz.
// impulse : un seul échantillon (pointe métallique d'un clou : spectre plat).
function burst(ctx, { dur = 0.003, lp = 4000, gain = 1, seed = 1, impulse = false, noisy = 0.3 } = {}) {
  const contact = Math.max(1, Math.round(num(dur, 0.003) * ctx.sr));
  const n = Math.max(2, contact * 4);
  const x = noise(n, 'white', seed);
  const tau = Math.max(1, contact);
  const k = clamp(num(noisy, 0.3), 0, 1);
  for (let i = 0; i < n; i += 1) x[i] *= k * Math.exp(-i / tau) * 0.5;
  if (impulse) x[0] += 1;
  else for (let i = 0; i < contact; i += 1) x[i] += Math.sin((Math.PI * (i + 0.5)) / contact) * (2 / contact) * 2;
  for (let i = 0; i < n; i += 1) x[i] *= num(gain, 1);
  return lowpass1(x, clamp(num(lp, 4000) * ctx.bright, 100, ctx.sr * 0.45), ctx.sr);
}

// Impulsions de collé-glissé (frottement) : instants irréguliers dont la cadence suit `rate` (Hz, nombre ou points [[u, Hz]]), sur n
// échantillons ; amplitude tirée entre 1 − irregular et 1.
function stickSlip(n, ctx, rate, { jitter = 0.2, irregular = 0.5, seed = 1, pitch = 1 } = {}) {
  const out = new Float64Array(n);
  const rnd = createRandom(seed);
  let t = 0;
  while (t < n) {
    const u = n > 1 ? t / (n - 1) : 0;
    const hz = Math.max(1, (Array.isArray(rate) ? curveAt(rate, u, 50) : num(rate, 50)) * pitch);
    const i = Math.floor(t);
    out[i] = 1 - clamp(num(irregular, 0.5), 0, 1) * rnd.next();
    t += (ctx.sr / hz) * (1 + clamp(num(jitter, 0.2), 0, 0.9) * rnd.signed());
  }
  return out;
}

// Enveloppe d'une suite de bosses (montée `rise`, décroissance `fall`, s) aux impulsions de `pulses`.
function bumps(pulses, ctx, rise = 0.005, fall = 0.04) {
  const n = pulses.length;
  const out = new Float64Array(n);
  const r = Math.max(1, rise * ctx.sr);
  const f = Math.max(1, fall * ctx.sr);
  let level = 0;
  let goal = 0;
  for (let i = 0; i < n; i += 1) {
    if (pulses[i] > 0) goal = Math.max(goal, pulses[i]);
    if (level < goal) {
      level += goal / r;
      if (level >= goal) goal = 0;
    } else {
      goal = 0;
      level *= Math.exp(-1 / f);
    }
    out[i] = level;
  }
  return out;
}

// Coup sourd : sinus à chute de hauteur (f × (drop + (1 − drop)·e^(−t/15 ms))), attaque en cosinus, décroissance exponentielle.
function thump(ctx, { f = 100, decay = 0.03, attack = 0.006, drop = 0.7, gain = 1 } = {}, len = null) {
  const n = len ?? Math.max(2, Math.round((num(attack, 0.006) + 6 * num(decay, 0.03)) * ctx.sr));
  const env = envAD(n, ctx.sr, num(attack, 0.006), num(decay, 0.03));
  const out = new Float64Array(n);
  const base = num(f, 100) * ctx.pitch * ctx.vary;
  const d = clamp(num(drop, 0.7), 0.2, 1);
  let ph = 0;
  for (let i = 0; i < n; i += 1) {
    const hz = base * (d + (1 - d) * Math.exp(-i / (0.015 * ctx.sr)));
    ph += hz / ctx.sr;
    out[i] = Math.sin(TAU * ph) * env[i] * num(gain, 1);
  }
  return out;
}

// Bruit filtré en bande : couleur, centre f (× matière), Q, enveloppe AD, durée.
function band(ctx, { dur = 0.05, f = 800, q = 0.8, attack = 0.005, decay = 0.02, gain = 1, color = 'pink', seed = 1 } = {}) {
  const n = Math.max(2, Math.round(num(dur, 0.05) * ctx.tm * ctx.sr));
  const x = biquad(noise(n, color, seed), { type: 'bandpass', freq: clamp(num(f, 800) * ctx.bright, 40, ctx.sr * 0.45), q: num(q, 0.8) }, ctx.sr);
  const env = envAD(n, ctx.sr, num(attack, 0.005), num(decay, 0.02) * ctx.tm);
  for (let i = 0; i < n; i += 1) x[i] *= env[i] * num(gain, 1);
  return x;
}

// ---------- pas ----------

// Un pas : talon (coup sourd + modes du sol excités par un éclat), claquement médium bref, pointe du pied (même chose, plus faible),
// frottement de la semelle, gravillons (extérieur : grains brefs), puis coupure raide des aigus (aucun pic au-dessus de 4 kHz).
function stepAt(ctx, r, n, seedBase) {
  const layers = [];
  const heel = isObj(r.heel) ? r.heel : {};
  const modes = modesOf(r.modes, ctx.pitch * ctx.vary);
  // Un appui (talon ou pointe) : coup sourd, modes du sol, claquement ; le tout monte en `heel.attack` (semelle qui s'écrase : 5 à
  // 25 ms d'attaque mesurée).
  const strike = (offset, g, s) => {
    const len = Math.round(0.14 * ctx.sr);
    const parts = [{ buf: thump(ctx, { ...heel, attack: 0.001, gain: num(heel.gain, 1) * g }) }];
    if (modes.length > 0) {
      const ex = burst(ctx, { dur: num(heel.burst, 0.002), lp: num(heel.burstLp, 1500), gain: g, seed: s });
      const pad = new Float64Array(len);
      pad.set(ex.subarray(0, Math.min(ex.length, pad.length)));
      parts.push({ buf: resonate(pad, ctx.sr, modes), gain: num(r.modeGain, 0.6) });
    }
    if (isObj(r.click)) parts.push({ buf: band(ctx, { ...r.click, dur: 0.03, attack: 0.001, gain: num(r.click.gain, 0.3) * g, color: 'white', seed: s + 3 }) });
    const x = mixLayers(len, parts);
    const ramp = Math.max(1, Math.round(num(heel.attack, 0.006) * ctx.sr));
    for (let i = 0; i < Math.min(ramp, len); i += 1) x[i] *= 0.5 - 0.5 * Math.cos((Math.PI * i) / ramp);
    layers.push({ buf: x, offset });
  };
  strike(0, 1, seedBase + 1);
  if (isObj(r.toe)) strike(at(ctx, r.toe.at ?? 0.07), num(r.toe.gain, 0.4), seedBase + 11);
  if (isObj(r.scuff)) layers.push({ buf: band(ctx, { ...r.scuff, gain: num(r.scuff.gain, 0.15) * ctx.grain, seed: seedBase + 21 }), offset: at(ctx, r.scuff.at ?? 0.02) });
  if (isObj(r.grit) && num(r.grit.gain) > 0) {
    const g = r.grit;
    const gn = Math.max(2, Math.round(num(g.dur, 0.06) * ctx.tm * ctx.sr));
    const pulses = stickSlip(gn, ctx, num(g.rate, 300), { jitter: 0.8, irregular: 0.9, seed: seedBase + 31 });
    const env = bumps(pulses, ctx, 0.0004, num(g.grainDecay, 0.0015));
    const x = biquad(noise(gn, 'white', seedBase + 32), { type: 'bandpass', freq: clamp(num(g.f, 1500) * ctx.bright, 200, 3800), q: num(g.q, 1.2) }, ctx.sr);
    const fade = envAD(gn, ctx.sr, 0.004, num(g.dur, 0.06) * ctx.tm * 0.5);
    for (let i = 0; i < gn; i += 1) x[i] *= env[i] * fade[i] * num(g.gain) * ctx.grain;
    layers.push({ buf: x, offset: at(ctx, g.at ?? 0.005) });
  }
  return mixLayers(n, layers);
}

function kindStep(r, ctx) {
  const x = stepAt(ctx, r, ctx.n, ctx.seed);
  return highpass1(lowpassSteep(x, clamp(num(r.lp, 3000) * ctx.bright, 300, 3800), ctx.sr), num(r.hp, 35), ctx.sr);
}

// Corps traîné (rampant) : bruit brun et rose dans une bande glissante, modulé par un collé-glissé irrégulier (raclements), tissu
// (bande médium à modulation lente), main posée au début (coup sourd).
function kindDrag(r, ctx) {
  const n = ctx.n;
  const fr = isObj(r.friction) ? r.friction : {};
  const pulses = stickSlip(n, ctx, fr.rate ?? 9, { jitter: num(fr.jitter, 0.35), irregular: num(fr.irregular, 0.5), seed: ctx.seed + 1 });
  const env = bumps(pulses, ctx, num(fr.rise, 0.02), num(fr.fall, 0.06));
  const b = noise(n, 'brown', ctx.seed + 2);
  const p = noise(n, 'pink', ctx.seed + 3);
  const src = new Float64Array(n);
  for (let i = 0; i < n; i += 1) src[i] = b[i] + 0.5 * p[i];
  const fpts = Array.isArray(fr.f) ? [[0, fr.f[0] * ctx.bright], [1, num(fr.f[1], fr.f[0]) * ctx.bright]] : num(fr.f, 450) * ctx.bright;
  const body = biquadSweep(src, 'bandpass', fpts, num(fr.q, 0.9), ctx.sr);
  const shape = envCurve(n, r.env ?? [[0, 0], [0.08, 1], [0.75, 0.8], [1, 0]]);
  const layers = [];
  for (let i = 0; i < n; i += 1) body[i] *= (0.25 + 0.75 * env[i]) * shape[i] * num(fr.gain, 1);
  layers.push({ buf: body });
  if (isObj(r.cloth)) {
    const c = r.cloth;
    const x = biquad(noise(n, 'pink', ctx.seed + 4), { type: 'bandpass', freq: num(c.f, 1600) * ctx.bright, q: num(c.q, 1) }, ctx.sr);
    for (let i = 0; i < n; i += 1) x[i] *= (0.5 + 0.5 * Math.sin((TAU * num(c.am, 3.5) * i) / ctx.sr)) * shape[i] * num(c.gain, 0.2) * ctx.grain;
    layers.push({ buf: x });
  }
  if (isObj(r.knock)) layers.push({ buf: thump(ctx, r.knock), offset: at(ctx, r.knock.at ?? 0.02) });
  return highpass1(lowpassSteep(mixLayers(n, layers), clamp(num(r.lp, 2500) * ctx.bright, 300, 3800), ctx.sr), num(r.hp, 30), ctx.sr);
}

// ---------- voix ----------

// Voix : source glottale (Rosenberg) à hauteur contournée, jitter, shimmer, sous-harmonique, rugosité, dérive ; souffle d'aspiration
// pulsé par le débit glottique (part de bruit : rapport harmonique-bruit) ; voix doublée légèrement désaccordée (facultatif) ; banc
// de formants à glissement ; pente spectrale (passe-bas du premier ordre) ; sifflement (bande aiguë) ; râle (impulsions de bruit) ;
// prise d'air inspirée (bruit dans les formants) ; enveloppe par points ; saturation douce.
export function voiceCore(r, ctx, n, seed) {
  const f0 = num(r.f0, 100) * ctx.pitch * ctx.vary;
  const rough = isObj(r.rough) ? { rate: num(r.rough.rate, 35), depth: clamp(num(r.rough.depth, 0.3) * ctx.grain, 0, 1) } : null;
  const g = glottalSource(n, ctx.sr, { f0, contour: r.contour, jitter: num(r.jitter, 0.03), shimmer: num(r.shimmer, 0.08), oq: r.oq, sq: r.sq, sub: clamp(num(r.sub), 0, 1), wander: num(r.wander, 0.02), rough, seed: seed + 1 });
  const asp = noise(n, 'white', seed + 2);
  const breath = num(r.breath, 0.2) * ctx.grain;
  const pulse = clamp(num(r.breathPulse, 0.6), 0, 1);
  const src = new Float64Array(n);
  for (let i = 0; i < n; i += 1) src[i] = num(r.voiced, 1) * g.signal[i] + breath * asp[i] * (1 - pulse + pulse * g.flow[i]);
  if (isObj(r.double)) {
    const d = r.double;
    const g2 = glottalSource(n, ctx.sr, { f0: f0 * (1 + num(d.detune, 0.012)), contour: r.contour, jitter: num(r.jitter, 0.03), shimmer: num(r.shimmer, 0.08), oq: r.oq, sq: r.sq, sub: clamp(num(r.sub), 0, 1), wander: num(r.wander, 0.02), rough, seed: seed + 5 });
    const off = Math.round(num(d.delay, 0.012) * ctx.sr);
    for (let i = off; i < n; i += 1) src[i] += num(d.gain, 0.6) * g2.signal[i - off];
  }
  const fb = formantBank(src, ctx.sr, { vowels: r.vowels ?? ['a'], scale: num(r.formantScale, 1) * ctx.pitch ** 0.35, bw: num(r.bw, 1), drift: num(r.drift, 0.03), driftRate: num(r.driftRate, 0.5), seed: seed + 3 });
  let x = lowpass1(fb, clamp(num(r.tilt, 2500) * ctx.bright, 200, ctx.sr * 0.45), ctx.sr);
  x = highpass1(x, num(r.hp, 70), ctx.sr);
  // Présence (variante « sèche ») : bosse de médium, en dB.
  if (isObj(r.presence)) x = biquad(x, { type: 'peak', freq: num(r.presence.f, 1000) * ctx.bright, q: num(r.presence.q, 0.8), gain: num(r.presence.gain, 4) }, ctx.sr);
  // Gain de rattrapage : la pente et les formants affaiblissent beaucoup le signal ; on revient à une crête unité avant les ajouts.
  let pk = 0;
  for (let i = 0; i < n; i += 1) pk = Math.max(pk, Math.abs(x[i]));
  if (pk > 1e-9) for (let i = 0; i < n; i += 1) x[i] /= pk;
  const env = envCurve(n, r.env ?? [[0, 0], [0.1, 1], [0.7, 0.85], [1, 0]]);
  if (isObj(r.hiss) && num(r.hiss.gain) > 0) {
    const h = biquad(noise(n, 'white', seed + 7), { type: 'bandpass', freq: clamp(num(r.hiss.f, 3000) * ctx.bright, 500, ctx.sr * 0.4), q: num(r.hiss.q, 1.5) }, ctx.sr);
    const hp = envCurve(n, r.hiss.env ?? [[0, 1], [1, 1]]);
    for (let i = 0; i < n; i += 1) x[i] += h[i] * num(r.hiss.gain) * ctx.grain * hp[i] * (0.4 + 0.6 * g.flow[i]);
  }
  if (isObj(r.rattle) && num(r.rattle.gain) > 0) {
    const ra = r.rattle;
    const p = stickSlip(n, ctx, num(ra.rate, 18), { jitter: 0.3, irregular: 0.6, seed: seed + 9 });
    const e = bumps(p, ctx, 0.003, 0.02);
    const nz = biquad(noise(n, 'pink', seed + 10), { type: 'bandpass', freq: num(ra.f, 900) * ctx.bright, q: 0.9 }, ctx.sr);
    const from = Math.round(clamp(num(ra.from, 0.5), 0, 1) * n);
    for (let i = from; i < n; i += 1) x[i] += nz[i] * e[i] * num(ra.gain) * ctx.grain;
  }
  for (let i = 0; i < n; i += 1) x[i] *= env[i];
  if (isObj(r.ingressive) && num(r.ingressive.gain) > 0) {
    const ig = r.ingressive;
    const m = Math.min(Math.round(n * clamp(num(ig.maxShare, 0.2), 0.05, 1)), Math.round(num(ig.dur, 0.3) * ctx.tm * ctx.sr)); // au plus 20 % du son
    const ns = lowpass1(formantBank(noise(m, 'white', seed + 11), ctx.sr, { vowels: ig.vowels ?? ['h', 'u'], scale: num(r.formantScale, 1), bw: 1.6, mode: 'parallel' }), clamp(num(r.tilt, 2500) * ctx.bright, 200, ctx.sr * 0.45), ctx.sr);
    const ie = envCurve(m, [[0, 0], [0.3, 1], [0.85, 0.7], [1, 0]]);
    let ipk = 0;
    for (let i = 0; i < m; i += 1) ipk = Math.max(ipk, Math.abs(ns[i]));
    for (let i = 0; i < m; i += 1) x[i] += (ns[i] / Math.max(ipk, 1e-9)) * ie[i] * num(ig.gain) * ctx.grain;
  }
  const drive = num(r.drive, 0);
  if (drive > 0) {
    const k = Math.tanh(drive);
    for (let i = 0; i < n; i += 1) x[i] = Math.tanh(drive * x[i]) / k;
  }
  return x;
}

function kindVoice(r, ctx) {
  return voiceCore(r, ctx, ctx.n, ctx.seed);
}

// ---------- bois ----------

// Impact sur le bois : éclat d'excitation -> résonateurs (modes du bois, décroissances de 40 à 120 ms).
function woodHit(ctx, modes, { gain = 1, dur = 0.002, lp = 3000, seed = 1, len = 0.25, decayScale = 1, impulse = false } = {}) {
  const n = Math.max(4, Math.round(len * ctx.sr));
  const pad = new Float64Array(n);
  const ex = burst(ctx, { dur, lp, gain, seed, impulse });
  pad.set(ex.subarray(0, Math.min(ex.length, n)));
  return resonate(pad, ctx.sr, modes, { decayScale });
}

// Éclat de fibres : bruit bref passe-bande (aigu modéré).
function splinter(ctx, { f = 2200, q = 1.2, dur = 0.015, gain = 0.3, seed = 1 } = {}) {
  return band(ctx, { dur: dur * 4, f, q, attack: 0.0005, decay: dur, gain: gain * ctx.grain, color: 'white', seed });
}

// Planche arrachée : crissement du clou (collé-glissé qui accélère, excitant des modes métal-bois), craquements (micro-éclats puis
// craquement principal dans les modes du bois), éclat de fibres, planche libérée qui cogne.
function kindTear(r, ctx) {
  const n = ctx.n;
  const rnd = createRandom(ctx.seed + 5);
  const modes = modesOf(r.modes, ctx.pitch * ctx.vary);
  const layers = [];
  if (isObj(r.squeal) && num(r.squeal.gain) > 0) {
    const s = r.squeal;
    const sn = Math.max(4, Math.round(num(s.dur, 0.2) * ctx.tm * ctx.sr));
    const p = stickSlip(sn, ctx, Array.isArray(s.rate) ? [[0, s.rate[0]], [1, num(s.rate[1], s.rate[0])]] : num(s.rate, 200), { jitter: num(s.jitter, 0.15), irregular: 0.4, seed: ctx.seed + 7, pitch: ctx.pitch });
    const sq = resonate(p, ctx.sr, modesOf(s.modes, ctx.pitch * ctx.vary * ctx.bright ** 0.5));
    const env = envCurve(sn, s.env ?? [[0, 0], [0.2, 1], [0.8, 0.8], [1, 0]]);
    for (let i = 0; i < sn; i += 1) sq[i] *= env[i] * num(s.gain);
    layers.push({ buf: sq, offset: at(ctx, s.start ?? 0.02) });
  }
  const c = isObj(r.cracks) ? r.cracks : {};
  const count = clamp(Math.round(num(c.count, 3)), 0, 12);
  const crackAt = num(c.at, 0.22);
  for (let k = 0; k < count; k += 1) {
    const main = k === count - 1;
    const t = crackAt - (main ? 0 : rnd.next() * num(c.spread, 0.05));
    const g = main ? num(c.gain, 1) : num(c.gain, 1) * (0.2 + 0.3 * rnd.next());
    layers.push({ buf: woodHit(ctx, modes, { gain: g, dur: main ? 0.003 : 0.001, lp: num(c.lp, 3500), seed: ctx.seed + 20 + k, len: 0.3 }), offset: at(ctx, t) });
    if (main && isObj(r.splinter)) layers.push({ buf: splinter(ctx, { ...r.splinter, seed: ctx.seed + 40 }), offset: at(ctx, t) });
  }
  if (isObj(r.release) && num(r.release.gain) > 0) {
    const rel = r.release;
    layers.push({ buf: woodHit(ctx, modesOf(r.modes, ctx.pitch * ctx.vary * num(rel.pitch, 0.85)), { gain: num(rel.gain), dur: 0.004, lp: 1500, seed: ctx.seed + 50, len: 0.25 }), offset: at(ctx, rel.at ?? 0.32) });
    if (isObj(r.thump)) layers.push({ buf: thump(ctx, r.thump), offset: at(ctx, rel.at ?? 0.32) });
  }
  return highpass1(lowpassSteep(mixLayers(n, layers), clamp(num(r.lp, 5000) * ctx.bright, 500, ctx.sr * 0.45), ctx.sr), 50, ctx.sr);
}

// Craquement d'une planche qui cède : collé-glissé lent puis rapide (cadence par points, Hz) excitant des modes de bois moyennement
// amortis (grincement), puis cassure finale.
function kindCreak(r, ctx) {
  const n = ctx.n;
  const cr = isObj(r.creak) ? r.creak : {};
  const cn = Math.min(n, Math.max(4, Math.round(num(cr.dur, 0.5) * ctx.tm * ctx.sr)));
  const p = stickSlip(cn, ctx, cr.rate ?? [[0, 30], [0.5, 70], [1, 110]], { jitter: num(cr.jitter, 0.25), irregular: num(cr.irregular, 0.5), seed: ctx.seed + 1, pitch: ctx.pitch ** 0.5 });
  const ex = lowpass1(p, 2500 * ctx.bright, ctx.sr);
  const x = resonate(ex, ctx.sr, modesOf(cr.modes ?? r.modes, ctx.pitch * ctx.vary));
  const env = envCurve(cn, cr.env ?? [[0, 0], [0.15, 0.6], [0.8, 1], [1, 0.3]]);
  for (let i = 0; i < cn; i += 1) x[i] *= env[i] * num(cr.gain, 1);
  const layers = [{ buf: x, offset: at(ctx, cr.at ?? 0) }];
  if (isObj(r.crack) && num(r.crack.gain) > 0) {
    const k = r.crack;
    layers.push({ buf: woodHit(ctx, modesOf(k.modes ?? r.modes, ctx.pitch * ctx.vary), { gain: num(k.gain), dur: 0.003, lp: 3500, seed: ctx.seed + 9, len: 0.3 }), offset: at(ctx, k.at ?? 0.55) });
    if (isObj(r.splinter)) layers.push({ buf: splinter(ctx, { ...r.splinter, seed: ctx.seed + 10 }), offset: at(ctx, k.at ?? 0.55) });
  }
  return highpass1(lowpassSteep(mixLayers(n, layers), clamp(num(r.lp, 4500) * ctx.bright, 500, ctx.sr * 0.45), ctx.sr), 60, ctx.sr);
}

// Chute d'une planche : rebonds de plus en plus rapprochés et faibles (coefficient de restitution), deux bouts qui touchent au premier
// choc, modes de flexion d'une poutre libre (rapports 1 ; 2,76 ; 5,40 ; 8,93), claque du sol (bruit grave), glissement final.
function kindFall(r, ctx) {
  const n = ctx.n;
  const rnd = createRandom(ctx.seed + 3);
  const modes = modesOf(r.modes, ctx.pitch * ctx.vary);
  const b = isObj(r.bounces) ? r.bounces : {};
  const layers = [];
  let t = num(b.first, 0.01);
  let gap = num(b.interval, 0.13);
  let g = 1;
  const count = clamp(Math.round(num(b.count, 4)), 1, 8);
  for (let k = 0; k < count; k += 1) {
    const s = ctx.seed + 10 * k;
    layers.push({ buf: woodHit(ctx, modes, { gain: g, dur: 0.002, lp: num(b.lp, 3000), seed: s, len: 0.3 }), offset: at(ctx, t) });
    if (k === 0 && num(b.secondEnd) > 0) layers.push({ buf: woodHit(ctx, modesOf(r.modes, ctx.pitch * ctx.vary * 1.06), { gain: g * 0.7, dur: 0.002, lp: 2500, seed: s + 1, len: 0.3 }), offset: at(ctx, t + num(b.secondEnd)) });
    if (isObj(r.slap)) layers.push({ buf: thump(ctx, { ...r.slap, gain: num(r.slap.gain, 0.5) * g }), offset: at(ctx, t) });
    t += gap * (1 + 0.1 * rnd.signed());
    gap *= clamp(num(b.restitution, 0.55), 0.2, 0.9);
    g *= clamp(num(b.restitution, 0.55), 0.2, 0.9) * (0.9 + 0.2 * rnd.next());
  }
  if (isObj(r.slide) && num(r.slide.gain) > 0) layers.push({ buf: band(ctx, { ...r.slide, gain: num(r.slide.gain) * ctx.grain, seed: ctx.seed + 99 }), offset: at(ctx, t) });
  return highpass1(lowpassSteep(mixLayers(n, layers), clamp(num(r.lp, 4000) * ctx.bright, 500, ctx.sr * 0.45), ctx.sr), 40, ctx.sr);
}

// ---------- marteau ----------

// Un coup de marteau sur un clou : corps (modes graves de la planche et du cadre, 100 à 600 Hz), pointe métallique (partiels de 2 à
// 5 kHz, décroissance de 8 à 25 ms : moins de 40 ms audibles), claquement bref. dry : coup final, plus sec (décroissances divisées).
export function hammerHit(ctx, h, { strength = 1, dry = false, ring = 1, seed = 1 } = {}) {
  const len = Math.max(8, Math.round(num(h.len, 0.2) * ctx.sr));
  const decayScale = dry ? num(h.dryDecay, 0.55) : 1;
  const body = isObj(h.body) ? h.body : {};
  const nail = isObj(h.nail) ? h.nail : {};
  const out = woodHit(ctx, modesOf(body.modes, ctx.pitch * ctx.vary * (dry ? num(h.dryPitch, 1.08) : 1)), { gain: num(body.gain, 1) * strength, dur: num(body.burst, 0.0015), lp: num(body.lp, 2500), seed, len: len / ctx.sr, decayScale });
  if (num(nail.gain) > 0) {
    const nm = modesOf(nail.partials, ctx.pitch ** 0.5 * ring * ctx.bright ** 0.3).map((m) => ({ ...m, decay: m.decay * decayScale }));
    const ping = woodHit(ctx, nm, { gain: num(nail.gain) * strength, dur: 0.0004, lp: 7000, seed: seed + 1, len: len / ctx.sr, impulse: true });
    for (let i = 0; i < len; i += 1) out[i] += ping[i];
  }
  if (isObj(h.click) && num(h.click.gain) > 0) {
    const c = band(ctx, { ...h.click, dur: 0.02, attack: 0.0003, gain: num(h.click.gain) * strength, color: 'white', seed: seed + 2 });
    for (let i = 0; i < Math.min(len, c.length); i += 1) out[i] += c[i];
  }
  return out;
}

function kindHammer(r, ctx) {
  const x = mixLayers(ctx.n, [{ buf: hammerHit(ctx, r.hit ?? r, { strength: 1, seed: ctx.seed + 1 }), offset: at(ctx, 0.002) }]);
  return highpass1(lowpassSteep(x, clamp(num(r.lp, 6000) * ctx.bright, 800, ctx.sr * 0.45), ctx.sr), 60, ctx.sr);
}

// Séquence de réparation (pure) : 2 à 5 coups selon la durée (round(1 + durée / 0,42), borné), précédés d'une amorce de raclement ;
// espacements de base égaux, écarts tirés à ±15 % au plus (moyenne nulle : le dernier coup tombe à `durée − queue`), dernier coup sec.
// Renvoie { duration, count, scrape: { t, dur }, hits: [{ t, strength, dry }], spacings, end }.
export function repairSequence(duration, seed = 1, { scrape = 0.12, tail = 0.12, jitter = 0.15, minHits = 2, maxHits = 5 } = {}) {
  const d = clamp(num(duration, 1.8), 0.2, 6);
  const lo = clamp(Math.round(num(minHits, 2)), 1, 8);
  const hi = clamp(Math.round(num(maxHits, 5)), lo, 12);
  const count = clamp(Math.round(1 + d / 0.42), lo, hi);
  const rnd = createRandom(hashSeed('reparation', isNum(seed) ? seed : 1));
  const sc = Math.min(num(scrape, 0.12), d * 0.2);
  const first = sc * 0.8;
  const last = d - Math.min(num(tail, 0.12), d * 0.25);
  const base = count > 1 ? (last - first) / (count - 1) : 0;
  const j = clamp(num(jitter, 0.15), 0, 0.45);
  let devs = Array.from({ length: Math.max(0, count - 1) }, () => rnd.signed() * j);
  if (devs.length > 0) {
    const mean = devs.reduce((s, v) => s + v, 0) / devs.length;
    devs = devs.map((v) => v - mean);
    const max = devs.reduce((m, v) => Math.max(m, Math.abs(v)), 0);
    if (max > j && max > 0) devs = devs.map((v) => (v * j) / max);
    if (devs.length > 1 && max < j * 0.2) devs = devs.map((_, k) => (k % 2 === 0 ? 0.3 : -0.3) * j * (devs.length % 2 === 1 && k === devs.length - 1 ? 0 : 1));
  }
  const spacings = devs.map((v) => base * (1 + v));
  const hits = [];
  let t = first;
  for (let k = 0; k < count; k += 1) {
    const dry = k === count - 1;
    const strength = dry ? 1.1 : (k === 0 ? 0.65 : 0.85 + 0.15 * rnd.next());
    hits.push({ t, strength, dry });
    if (k < spacings.length) t += spacings[k];
  }
  return { duration: d, count, scrape: { t: 0, dur: sc }, hits, spacings, end: hits.length > 0 ? hits[hits.length - 1].t + Math.min(num(tail, 0.12), d * 0.25) : d };
}

// Réparation : amorce de raclement (planche posée contre le cadre), puis les coups de repairSequence ; le clou monte un peu à chaque coup.
function kindRepair(r, ctx) {
  const seq = repairSequence(ctx.dur, ctx.seed, isObj(r.sequence) ? r.sequence : {});
  const layers = [];
  if (isObj(r.scrape) && num(r.scrape.gain) > 0) {
    const s = r.scrape;
    const sn = Math.max(4, Math.round(Math.max(0.03, seq.scrape.dur) * ctx.sr));
    const p = stickSlip(sn, ctx, num(s.rate, 14), { jitter: 0.3, irregular: 0.5, seed: ctx.seed + 3 });
    const env = bumps(p, ctx, 0.006, 0.03);
    const x = biquad(noise(sn, 'pink', ctx.seed + 4), { type: 'bandpass', freq: num(s.f, 1000) * ctx.bright, q: num(s.q, 0.9) }, ctx.sr);
    const fade = envCurve(sn, [[0, 0], [0.2, 1], [0.8, 0.8], [1, 0]]);
    for (let i = 0; i < sn; i += 1) x[i] *= (0.3 + 0.7 * env[i]) * fade[i] * num(s.gain) * ctx.grain;
    layers.push({ buf: x, offset: 0 });
  }
  const hit = isObj(r.hit) ? r.hit : {};
  seq.hits.forEach((h, k) => {
    layers.push({ buf: hammerHit(ctx, hit, { strength: h.strength, dry: h.dry, ring: 1 + num(r.ringRise, 0.03) * k, seed: ctx.seed + 10 + 7 * k }), offset: Math.round(h.t * ctx.sr) });
  });
  return highpass1(lowpassSteep(mixLayers(ctx.n, layers), clamp(num(r.lp, 6000) * ctx.bright, 800, ctx.sr * 0.45), ctx.sr), 60, ctx.sr);
}

// ---------- escalade, joueur ----------

// Sous-voix (grognement d'effort, cri) placée dans une recette composée.
function subVoice(ctx, v, seed) {
  const n = Math.max(8, Math.round(num(v.dur, 0.4) * ctx.tm * ctx.sr));
  return voiceCore(v, ctx, n, seed);
}

// Tissu frotté : bruit rose en bande médium, modulation lente (gestes), enveloppe par points.
function cloth(ctx, c, seed) {
  const n = Math.max(8, Math.round(num(c.dur, 0.8) * ctx.tm * ctx.sr));
  const x = biquad(noise(n, 'pink', seed), { type: 'bandpass', freq: num(c.f, 1500) * ctx.bright, q: num(c.q, 0.8) }, ctx.sr);
  const env = envCurve(n, c.env ?? [[0, 0], [0.2, 1], [0.8, 0.8], [1, 0]]);
  const p = stickSlip(n, ctx, num(c.am, 4), { jitter: 0.4, irregular: 0.6, seed: seed + 1 });
  const e2 = bumps(p, ctx, 0.04, 0.12);
  for (let i = 0; i < n; i += 1) x[i] *= env[i] * (0.35 + 0.65 * e2[i]) * num(c.gain, 0.4) * ctx.grain;
  return x;
}

// Escalade d'une fenêtre : mains sur l'appui (coups de bois), tissu frotté, grincement du bois sous le poids, grognement d'effort,
// réception au sol (coup sourd).
function kindClimb(r, ctx) {
  const layers = [];
  const modes = modesOf(r.modes, ctx.pitch * ctx.vary);
  (Array.isArray(r.grabs) ? r.grabs : []).forEach((g, k) => {
    if (isObj(g)) layers.push({ buf: woodHit(ctx, modes, { gain: num(g.gain, 0.6), dur: 0.004, lp: 1800, seed: ctx.seed + k, len: 0.25 }), offset: at(ctx, g.at) });
  });
  if (isObj(r.cloth)) layers.push({ buf: cloth(ctx, r.cloth, ctx.seed + 20), offset: at(ctx, r.cloth.at ?? 0.05) });
  if (isObj(r.creak)) {
    const c = r.creak;
    const cn = Math.max(8, Math.round(num(c.dur, 0.5) * ctx.tm * ctx.sr));
    const p = stickSlip(cn, ctx, c.rate ?? [[0, 25], [1, 60]], { jitter: 0.3, irregular: 0.5, seed: ctx.seed + 30, pitch: ctx.pitch ** 0.5 });
    const x = resonate(lowpass1(p, 2000, ctx.sr), ctx.sr, modesOf(c.modes ?? r.modes, ctx.pitch * ctx.vary));
    const env = envCurve(cn, [[0, 0], [0.3, 1], [0.8, 0.7], [1, 0]]);
    for (let i = 0; i < cn; i += 1) x[i] *= env[i] * num(c.gain, 0.3);
    layers.push({ buf: x, offset: at(ctx, c.at ?? 0.4) });
  }
  if (isObj(r.grunt)) layers.push({ buf: subVoice(ctx, r.grunt, ctx.seed + 40), gain: num(r.grunt.gain, 0.5), offset: at(ctx, r.grunt.at ?? 0.5) });
  if (isObj(r.land)) layers.push({ buf: thump(ctx, r.land), offset: at(ctx, r.land.at ?? 1.2) });
  return highpass1(lowpassSteep(mixLayers(ctx.n, layers), clamp(num(r.lp, 3500) * ctx.bright, 400, 3800), ctx.sr), 35, ctx.sr);
}

// Joueur à terre : grognement de douleur, puis cycles de souffle (inspiration : bruit dans des formants ouverts ; expiration : voix
// très soufflée, presque sans voix).
function kindBreath(r, ctx) {
  const layers = [];
  if (isObj(r.grunt)) layers.push({ buf: subVoice(ctx, r.grunt, ctx.seed + 1), gain: num(r.grunt.gain, 1), offset: at(ctx, r.grunt.at ?? 0) });
  (Array.isArray(r.cycles) ? r.cycles : []).forEach((c, k) => {
    if (!isObj(c)) return;
    if (isObj(c.inhale)) {
      const m = Math.max(8, Math.round(num(c.inhale.dur, 0.3) * ctx.tm * ctx.sr));
      const x = formantBank(noise(m, 'white', ctx.seed + 10 + k), ctx.sr, { vowels: c.inhale.vowels ?? ['h', 'i'], bw: 1.8, mode: 'parallel' });
      const env = envCurve(m, [[0, 0], [0.5, 1], [0.85, 0.6], [1, 0]]);
      let pk = 0;
      for (let i = 0; i < m; i += 1) pk = Math.max(pk, Math.abs(x[i]));
      for (let i = 0; i < m; i += 1) x[i] = (x[i] / Math.max(pk, 1e-9)) * env[i] * num(c.inhale.gain, 0.35) * ctx.grain;
      layers.push({ buf: x, offset: at(ctx, c.inhale.at) });
    }
    if (isObj(c.exhale)) layers.push({ buf: subVoice(ctx, c.exhale, ctx.seed + 30 + k), gain: num(c.exhale.gain, 0.5), offset: at(ctx, c.exhale.at) });
  });
  return highpass1(lowpassSteep(mixLayers(ctx.n, layers), clamp(num(r.lp, 3800) * ctx.bright, 400, 3900), ctx.sr), 60, ctx.sr);
}

// Relevage : froissement de vêtements, grognement d'effort montant, pied posé.
function kindGetup(r, ctx) {
  const layers = [];
  if (isObj(r.rustle)) layers.push({ buf: cloth(ctx, r.rustle, ctx.seed + 1), offset: at(ctx, r.rustle.at ?? 0) });
  if (isObj(r.grunt)) layers.push({ buf: subVoice(ctx, r.grunt, ctx.seed + 2), gain: num(r.grunt.gain, 0.7), offset: at(ctx, r.grunt.at ?? 0.25) });
  if (isObj(r.step)) {
    const sn = Math.round(0.25 * ctx.sr);
    layers.push({ buf: stepAt(ctx, r.step, sn, ctx.seed + 50), gain: num(r.step.gain, 0.8), offset: at(ctx, r.step.at ?? 0.55) });
  }
  return highpass1(lowpassSteep(mixLayers(ctx.n, layers), clamp(num(r.lp, 3500) * ctx.bright, 400, 3900), ctx.sr), 40, ctx.sr);
}

export const KINDS = Object.freeze({ step: kindStep, drag: kindDrag, voice: kindVoice, tear: kindTear, creak: kindCreak, fall: kindFall, hammer: kindHammer, repair: kindRepair, climb: kindClimb, breath: kindBreath, getup: kindGetup });
