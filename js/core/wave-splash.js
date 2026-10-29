// Animation de changement de vague (E2-8) : état pur. Une animation de début démarre quand le compte à rebours du directeur atteint
// leadTime (3,0 s) et culmine avec l'arrivée des zombies ; une animation de fin démarre à l'état « terminee ». Rien n'est lu ni écrit
// ailleurs : l'état, les informations du directeur (wave-director.js, info()), le temps (dt, en secondes de jeu : figé par la pause) et les
// paramètres (data/game/splash.json) arrivent en argument ; le hasard décoratif vient de rng.js (graine = vague, genre, pas de 1/12 s).
// stepSplash ne modifie jamais ses arguments et ne lève jamais d'exception : une entrée absurde donne une vue invisible.
import { createRng, nextFloat, nextInt } from './rng.js';
import { isNum } from './vec.js';

export const KINDS = Object.freeze(['debut', 'renforcee', 'fin', 'zone']);
export const KEYS = Object.freeze({ debut: 'game.splash.debut', renforcee: 'game.splash.renforcee', fin: 'game.splash.fin', vieRestauree: 'game.splash.vieRestauree', zoneTitle: 'game.splash.zone.title', zoneSubtitle: 'game.splash.zone.subtitle' });
// Lot 3c : « fin » (fin de vague) et « zone » (nouvelle zone) durent un temps fixe (enter + hold + exit) et cèdent la place à une annonce de début.
const FIXED = Object.freeze(['fin', 'zone']);
const isFixed = (kind) => FIXED.includes(kind);
const EPS = 1e-9; // les temps s'additionnent par pas de dt : une frontière atteinte à 1e-16 près compte comme atteinte
const MAX_DT = 5; // un dt énorme (onglet resté en arrière-plan) termine simplement l'animation en cours

const clamp = (n, lo, hi) => Math.min(Math.max(n, lo), hi);
const lerp = (a, b, u) => a + (b - a) * u;
const easeOut = (u) => 1 - (1 - u) * (1 - u);
const isObject = (o) => o !== null && typeof o === 'object' && !Array.isArray(o);
const hash = (...parts) => parts.reduce((h, p) => (Math.imul(h ^ (p | 0), 0x9e3779b1) + 0x7f4a7c15) >>> 0, 0x811c9dc5);

const HIDDEN = Object.freeze({ visible: false, kind: null, title: null, subtitle: null, step: null, t: 0, opacity: 0, scale: 1, shiftX: 0, rgbSplit: 0, tears: Object.freeze([]), flicker: 0, sound: null });

export const createSplash = () => ({ shown: { debut: 0, fin: 0, zone: 0 }, anims: [] });

// Chronologie d'un genre : { enter, holdEnd, exit, total, scaleFrom, zoomHold, exitScale, intensity } ; null si les paramètres sont absurdes.
function timeline(kind, params) {
  const p = kind === 'fin' ? params.fin : kind === 'zone' ? params.zone : params.debut;
  if (!isObject(p) || !isNum(p.enter) || !isNum(p.exit)) return null;
  const holdEnd = isFixed(kind) ? p.enter + (isNum(p.hold) ? p.hold : 0) : (isNum(params.leadTime) ? params.leadTime : 0) + (isNum(p.holdAfter) ? p.holdAfter : 0);
  const enter = Math.max(0, p.enter);
  const exit = Math.max(0, p.exit);
  const end = Math.max(enter, holdEnd);
  return { enter, holdEnd: end, exit, total: end + exit, scaleFrom: isNum(p.scaleFrom) ? p.scaleFrom : 1, zoomHold: isNum(p.zoomHold) ? p.zoomHold : 1, exitScale: isNum(p.exitScale) ? p.exitScale : 1, intensity: clamp(isNum(p.intensity) ? p.intensity : 1, 0, 1) };
}

// Valeurs lisses à l'instant t d'une animation : { step, opacity, scale, strength }.
function envelope(tl, time, climax) {
  const t = time + EPS;
  if (t < tl.enter) {
    const u = tl.enter > 0 ? Math.max(0, time) / tl.enter : 1;
    return { step: 'entree', opacity: easeOut(u), scale: lerp(tl.scaleFrom, 1, easeOut(u)), strength: 1 };
  }
  if (t < tl.holdEnd) {
    const span = tl.holdEnd - tl.enter;
    const u = span > 0 ? clamp((time - tl.enter) / span, 0, 1) : 1;
    return { step: 'tenue', opacity: 1, scale: lerp(1, tl.zoomHold, u), strength: climax ? 1 : -1 };
  }
  const u = tl.exit > 0 ? clamp((time - tl.holdEnd) / tl.exit, 0, 1) : 1;
  return { step: 'sortie', opacity: 1 - u, scale: lerp(tl.zoomHold, tl.exitScale, u), strength: 0.6 };
}

// Vue d'une animation à l'instant anim.t.
function viewOf(anim, params, reduced) {
  const tl = timeline(anim.kind, params);
  if (tl === null) return HIDDEN;
  const t = clamp(anim.t, 0, tl.total);
  const fin = isFixed(anim.kind); // calme comme la fin de vague : pas de déchirure, secousse et scintillement atténués
  const climax = !fin && t + EPS >= params.leadTime && t + EPS < params.leadTime + (isNum(params.debut?.holdAfter) ? params.debut.holdAfter : 0);
  const env = envelope(tl, t, climax);
  const calm = isNum(params.calmLevel) ? params.calmLevel : 0.3;
  let opacity = env.opacity;
  let scale = env.scale;
  if (anim.cut) {
    const u = clamp((t - anim.cut.at) / Math.max(1e-6, params.overlapExit), 0, 1);
    opacity = anim.cut.opacity * (1 - u);
    scale = anim.cut.scale;
  }
  const title = { key: anim.kind === 'zone' ? KEYS.zoneTitle : anim.kind === 'fin' ? KEYS.fin : KEYS.debut, n: anim.wave };
  const subtitle = anim.kind === 'renforcee' ? { key: KEYS.renforcee } : anim.kind === 'zone' ? { key: KEYS.zoneSubtitle } : fin ? { key: KEYS.vieRestauree } : null;
  const base = { visible: true, kind: anim.kind, title, subtitle, step: env.step, t, sound: null };
  if (reduced) return { ...base, opacity: 1, scale: 1, shiftX: 0, rgbSplit: 0, tears: [], flicker: 0 };
  // Nombres décoratifs : un tirage par pas de 1/rate s, reproductible (graine = vague, genre, pas) ; plus faibles en fin de vague.
  const rate = Math.max(1, isNum(params.shake?.rate) ? params.shake.rate : 12);
  const step = Math.floor(t * rate);
  let rng = createRng(hash(isNum(params.seed) ? params.seed : 0, anim.wave, KINDS.indexOf(anim.kind), step));
  const draw = () => {
    const r = nextFloat(rng);
    rng = r.rng;
    return r.value;
  };
  const strength = (env.strength < 0 ? calm : env.strength) * tl.intensity * (anim.cut ? 0 : 1);
  const shiftX = (draw() * 2 - 1) * (isNum(params.shake?.maxPx) ? params.shake.maxPx : 0) * strength;
  const rgbSplit = draw() * (isNum(params.rgbSplit?.maxPx) ? params.rgbSplit.maxPx : 0) * strength;
  const flicker = (draw() * 2 - 1) * (isNum(params.flicker?.max) ? params.flicker.max : 0) * (fin ? 0.5 : 1) * (env.strength < 0 ? calm : 1);
  const tears = [];
  if (!fin && !anim.cut) {
    const maxN = Math.max(0, Math.floor(isNum(params.tears?.max) ? params.tears.max : 0));
    const maxH = isNum(params.tears?.maxHeight) ? params.tears.maxHeight : 0.1;
    const chance = lerp(isNum(params.tears?.calm) ? params.tears.calm : 0.25, isNum(params.tears?.strong) ? params.tears.strong : 0.75, env.strength < 0 ? 0 : env.strength);
    for (let i = 0; i < maxN; i += 1) {
      const take = draw() < chance;
      const h = (0.3 + 0.7 * draw()) * maxH;
      const y = draw() * (1 - h);
      if (take) tears.push({ y, h });
    }
  }
  return { ...base, opacity, scale, shiftX, rgbSplit, tears, flicker };
}

// info : { active, phase, wave, waitLeft, reinforced, playerAlive, doorAnnounce } ; options : { reducedMotion, params }.
// doorAnnounce (lot 3c) : entier positif donné à l'image où le directeur émet doorAnnounce (la manche qui vient de s'achever) ; l'animation « zone » part une
// seule fois par valeur, sans son (aucune entrée « zone » dans sounds).
// Renvoie { state, view } ; view.sound n'est non nul qu'à l'image où une animation démarre.
export function stepSplash(state, info, dt, options) {
  const params = options?.params;
  let s = isObject(state) && Array.isArray(state.anims) && isObject(state.shown) ? state : createSplash();
  if (!isObject(params) || !isNum(params.leadTime)) return { state: s, view: HIDDEN };
  const reduced = options?.reducedMotion === true;
  const step = isNum(dt) && dt > 0 ? Math.min(dt, MAX_DT) : 0;
  const live = isObject(info) && info.active === true && info.playerAlive !== false;
  if (!live) return { state: { shown: { ...s.shown }, anims: [] }, view: HIDDEN };

  let anims = s.anims.map((a) => ({ ...a, t: a.t + step }));
  anims = anims.filter((a) => {
    const tl = timeline(a.kind, params);
    return tl !== null && a.t < (a.cut ? Math.min(tl.total, a.cut.at + params.overlapExit) : tl.total) - EPS;
  });
  const shown = { ...s.shown };
  let sound = null;
  const wave = Number.isInteger(info.wave) && info.wave >= 1 ? info.wave : 0;
  // soundOnly : la fin d'une vague qui se termine sous un début encore visible n'est jamais affichée (le début l'emporte), mais son son part.
  const start = (kind, t0, soundOnly = false) => {
    const spec = params.sounds?.[kind];
    const count = Math.max(1, Math.floor(isNum(spec?.variants) ? spec.variants : 1));
    const picked = nextInt(createRng(hash(isNum(params.seed) ? params.seed : 0, wave, KINDS.indexOf(kind), 999)), count);
    if (typeof spec?.name === 'string') sound = { name: spec.name, variant: picked.value };
    if (!soundOnly) anims = [...anims, { kind, wave, t: t0, cut: null }];
  };
  if (wave > 0 && info.phase === 'attente' && isNum(info.waitLeft) && info.waitLeft <= params.leadTime && shown.debut !== wave) {
    shown.debut = wave;
    // Une animation de fin encore visible sort en overlapExit s ; celle de début l'emporte.
    anims = anims.map((a) => {
      if (!isFixed(a.kind) || a.cut) return a;
      const v = viewOf(a, params, false);
      return { ...a, cut: { at: a.t, opacity: v.opacity, scale: v.scale } };
    });
    start(info.reinforced === true ? 'renforcee' : 'debut', clamp(params.leadTime - info.waitLeft, 0, step));
  } else if (wave > 0 && info.phase === 'terminee' && shown.fin !== wave) {
    shown.fin = wave;
    start('fin', 0, anims.some((a) => !isFixed(a.kind)));
  }
  // Nouvelle zone : une fois par ouverture ; une annonce de début déjà visible l'emporte (elle sort de l'écran sans que « zone » ne s'affiche).
  if (Number.isInteger(info.doorAnnounce) && info.doorAnnounce > 0 && shown.zone !== info.doorAnnounce) {
    shown.zone = info.doorAnnounce;
    if (anims.some((a) => !isFixed(a.kind))) {
      /* début de manche déjà affiché : rien à montrer */
    } else {
      anims = anims.map((a) => {
        if (a.kind !== 'fin' || a.cut) return a;
        const v = viewOf(a, params, false);
        return { ...a, cut: { at: a.t, opacity: v.opacity, scale: v.scale } };
      });
      anims = [...anims, { kind: 'zone', wave: info.doorAnnounce, t: 0, cut: null }];
    }
  }

  // Une seule animation s'affiche : une fin qui sort d'abord, sinon le début, sinon la fin.
  const shownAnim = anims.find((a) => a.cut) ?? anims.find((a) => !isFixed(a.kind)) ?? anims.find((a) => a.kind === 'zone') ?? anims[0];
  const view = shownAnim ? { ...viewOf(shownAnim, params, reduced), sound } : { ...HIDDEN, sound };
  return { state: { shown, anims }, view };
}
