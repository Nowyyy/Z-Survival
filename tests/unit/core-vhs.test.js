import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { OFF, trackingEvents, vhsFrame } from '../../js/core/vhs.js';
import { deepFreeze, WEIRD } from './helpers/monde.js';

const P = JSON.parse(readFileSync('data/game/vhs.json', 'utf8'));
// Plafonds de la spécification du lot 2c (écrits ici en dur : le test contrôle les données, pas l'inverse).
const LIMITS = { scan: 0.14, grain: 0.09, edge: 0.1, vignette: 0.35, track: 0.12, flicker: 0.03 };
const OPTS = { enabled: true, reducedMotion: false, intensity: 1, params: P };
const SEED = 77;
const times = Array.from({ length: 4000 }, (_, i) => i * 0.0173);

describe('vhs.json : plafonds d\'opacité', () => {
  it('chaque opacité des données respecte le plafond de la spécification', () => {
    for (const name of ['scan', 'grain', 'edge', 'vignette', 'track']) {
      expect(P.opacity[name], name).toBeGreaterThan(0);
      expect(P.opacity[name], name).toBeLessThanOrEqual(LIMITS[name]);
      expect(P.opacity[name], name).toBeLessThanOrEqual(P.caps[name]);
    }
  });

  it('chaque plafond des données ne dépasse pas la spécification (balayage 0,14 ; grain 0,09 ; bords 0,10 ; vignette 0,35 ; suivi 0,12 ; scintillement 3 %)', () => {
    for (const [name, limit] of Object.entries(LIMITS)) expect(P.caps[name], name).toBeLessThanOrEqual(limit);
  });

  it('activé par défaut, intensité 1, réglages marqués provisoires', () => {
    expect(P.enabled).toBe(true);
    expect(P.intensity).toBe(1);
    expect(P._provisoire).toMatch(/provisoire/);
  });

  it('même avec des opacités au-dessus des plafonds dans les données, la sortie est plafonnée', () => {
    const wild = { ...P, opacity: { scan: 1, grain: 1, edge: 1, vignette: 1, track: 1 } };
    for (const t of times.slice(0, 600)) {
      const f = vhsFrame(t, SEED, { ...OPTS, params: wild });
      expect(f.scanOpacity).toBeLessThanOrEqual(LIMITS.scan);
      expect(f.grain.opacity).toBeLessThanOrEqual(LIMITS.grain);
      expect(f.edgeOpacity).toBeLessThanOrEqual(LIMITS.edge);
      expect(f.vignetteOpacity).toBeLessThanOrEqual(LIMITS.vignette);
      expect(f.track.opacity).toBeLessThanOrEqual(LIMITS.track);
    }
  });
});

describe('vhs : valeurs de l\'effet', () => {
  it('actif : on vrai et opacités des couches égales aux données (intensité 1)', () => {
    const f = vhsFrame(1, SEED, OPTS);
    expect(f.on).toBe(true);
    expect([f.scanOpacity, f.edgeOpacity, f.vignetteOpacity, f.grain.opacity]).toEqual([P.opacity.scan, P.opacity.edge, P.opacity.vignette, P.opacity.grain]);
  });

  it('plafonds respectés à chaque instant d\'une longue simulation', () => {
    for (const t of times) {
      const f = vhsFrame(t, SEED, OPTS);
      expect(f.scanOpacity).toBeLessThanOrEqual(LIMITS.scan);
      expect(f.edgeOpacity).toBeLessThanOrEqual(LIMITS.edge);
      expect(f.vignetteOpacity).toBeLessThanOrEqual(LIMITS.vignette);
      expect(f.grain.opacity).toBeLessThanOrEqual(LIMITS.grain);
      expect(f.track.opacity).toBeLessThanOrEqual(LIMITS.track);
      expect(Math.abs(f.flicker)).toBeLessThanOrEqual(LIMITS.flicker + 1e-12);
    }
  });

  it('scintillement : jamais au-delà de ±3 % et pas plus de 8 changements par seconde', () => {
    let changes = 0;
    let last = vhsFrame(0, SEED, OPTS).flicker;
    for (let i = 1; i <= 1000; i += 1) {
      const f = vhsFrame(i / 1000, SEED, OPTS).flicker; // 1 s au pas de 1 ms
      expect(Math.abs(f)).toBeLessThanOrEqual(0.03 + 1e-12);
      if (f !== last) changes += 1;
      last = f;
    }
    expect(changes).toBeLessThanOrEqual(8);
    expect(changes).toBeGreaterThanOrEqual(6);
  });

  it('le scintillement n\'est pas constant', () => {
    const set = new Set(times.slice(0, 400).map((t) => vhsFrame(t, SEED, OPTS).flicker));
    expect(set.size).toBeGreaterThan(20);
  });

  it('grain : la position saute au pas de 10 par seconde (une valeur par pas de 0,1 s)', () => {
    let jumps = 0;
    let last = vhsFrame(0, SEED, OPTS).grain;
    for (let i = 1; i <= 1000; i += 1) {
      const g = vhsFrame(i / 1000, SEED, OPTS).grain;
      expect(g.step).toBe(Math.floor((i / 1000) * 10 + 1e-9) === g.step ? g.step : Math.floor((i / 1000) * 10));
      if (g.step !== last.step) {
        jumps += 1;
        expect([g.x, g.y]).not.toEqual([last.x, last.y]);
      } else expect([g.x, g.y]).toEqual([last.x, last.y]);
      last = g;
    }
    expect(jumps).toBe(10);
  });

  it('grain : x et y sont des entiers de [0, taille de la tuile[', () => {
    for (const t of times.slice(0, 800)) {
      const { x, y } = vhsFrame(t, SEED, OPTS).grain;
      expect(Number.isInteger(x) && x >= 0 && x < P.grain.size).toBe(true);
      expect(Number.isInteger(y) && y >= 0 && y < P.grain.size).toBe(true);
    }
  });

  it('déterminisme : mêmes entrées, même résultat ; une autre graine, d\'autres positions de grain', () => {
    expect(vhsFrame(12.34, SEED, OPTS)).toEqual(vhsFrame(12.34, SEED, OPTS));
    const a = times.slice(0, 200).map((t) => vhsFrame(t, 1, OPTS).grain);
    const b = times.slice(0, 200).map((t) => vhsFrame(t, 2, OPTS).grain);
    expect(JSON.stringify(a)).not.toBe(JSON.stringify(b));
  });

  it('la graine absente ou invalide retombe sur celle des données', () => {
    expect(vhsFrame(3, undefined, OPTS)).toEqual(vhsFrame(3, P.seed, OPTS));
    expect(vhsFrame(3, 'x', OPTS)).toEqual(vhsFrame(3, P.seed, OPTS));
  });
});

describe('vhs : bande de suivi', () => {
  const events = trackingEvents(SEED, 0, 3600, P);

  it('un passage toutes les 6 à 14 s (intervalle entre départs)', () => {
    expect(events.length).toBeGreaterThan(3600 / 14 - 2);
    expect(events.length).toBeLessThan(3600 / 6 + 1);
    expect(events[0].start).toBeGreaterThanOrEqual(6);
    for (let i = 1; i < events.length; i += 1) {
      const gap = events[i].start - events[i - 1].start;
      expect(gap).toBeGreaterThanOrEqual(6 - 1e-9);
      expect(gap).toBeLessThanOrEqual(14 + 1e-9);
    }
  });

  it('durée de 0,15 à 0,4 s ; fin = début + durée', () => {
    for (const e of events) {
      expect(e.duration).toBeGreaterThanOrEqual(0.15 - 1e-12);
      expect(e.duration).toBeLessThanOrEqual(0.4 + 1e-12);
      expect(e.end).toBeCloseTo(e.start + e.duration, 9);
    }
  });

  it('quelques passages par minute (4 à 10)', () => {
    const inMinute = events.filter((e) => e.start >= 60 && e.start < 120).length;
    expect(inMinute).toBeGreaterThanOrEqual(4);
    expect(inMinute).toBeLessThanOrEqual(10);
  });

  it('déterministe par graine, différent selon la graine, indépendant de la fenêtre demandée', () => {
    expect(trackingEvents(SEED, 0, 600, P)).toEqual(trackingEvents(SEED, 0, 600, P));
    expect(trackingEvents(1, 0, 600, P)).not.toEqual(trackingEvents(2, 0, 600, P));
    const part = trackingEvents(SEED, 100, 200, P);
    expect(part.length).toBeGreaterThan(5);
    for (const e of part) expect(events.find((x) => x.index === e.index)).toEqual(e);
  });

  it('la fenêtre [from, to] ne renvoie que les passages qui la touchent', () => {
    for (const e of trackingEvents(SEED, 500, 560, P)) {
      expect(e.end).toBeGreaterThanOrEqual(500);
      expect(e.start).toBeLessThanOrEqual(560);
    }
    expect(trackingEvents(SEED, 5, 4, P)).toEqual([]);
    expect(trackingEvents(SEED, -10, -1, P)).toEqual([]);
  });

  it('la bande traverse l\'écran de haut en bas : y croît de 0 à 1 pendant un passage, hors de [0, 1] jamais', () => {
    const e = events[3];
    const ys = [];
    for (let k = 0; k < 40; k += 1) {
      const f = vhsFrame(e.start + (e.duration * k) / 40, SEED, OPTS);
      expect(f.track.active, `k=${k}`).toBe(true);
      expect(f.track.y).toBeGreaterThanOrEqual(0);
      expect(f.track.y).toBeLessThanOrEqual(1);
      ys.push(f.track.y);
    }
    for (let k = 1; k < ys.length; k += 1) expect(ys[k]).toBeGreaterThan(ys[k - 1]);
  });

  it('hors passage : bande inactive, opacité 0 ; pendant : opacité positive plafonnée à 0,12', () => {
    const e = events[5];
    expect(vhsFrame(e.start - 0.5, SEED, OPTS).track).toMatchObject({ active: false, opacity: 0 });
    expect(vhsFrame(e.end + 0.5, SEED, OPTS).track.active).toBe(false);
    const mid = vhsFrame(e.start + e.duration / 2, SEED, OPTS).track;
    expect(mid.opacity).toBeGreaterThan(0);
    expect(mid.opacity).toBeLessThanOrEqual(0.12);
    expect(Math.abs(mid.shiftPx)).toBeLessThanOrEqual(P.track.shiftPx + 1e-9);
  });

  it('sur une heure, la bande est active pendant moins de 5 % du temps', () => {
    let active = 0;
    for (let t = 0; t < 3600; t += 0.05) if (vhsFrame(t, SEED, OPTS).track.active) active += 1;
    expect(active * 0.05).toBeLessThan(3600 * 0.05);
  });
});

describe('vhs : coupures et intensité', () => {
  const isOff = (f) => f.on === false && f.scanOpacity === 0 && f.edgeOpacity === 0 && f.vignetteOpacity === 0 && f.grain.opacity === 0 && f.flicker === 0 && f.track.active === false && f.track.opacity === 0;

  it('mouvement réduit : tout à 0, aucune couche', () => {
    for (const t of [0, 1, 17.3, 1e5]) expect(isOff(vhsFrame(t, SEED, { ...OPTS, reducedMotion: true })), String(t)).toBe(true);
  });

  it('enabled faux : rien', () => {
    for (const t of [0, 1, 17.3]) expect(isOff(vhsFrame(t, SEED, { ...OPTS, enabled: false }))).toBe(true);
  });

  it('intensité 0 : toutes les opacités à 0, scintillement nul (l\'effet reste « on »)', () => {
    for (const t of times.slice(0, 300)) {
      const f = vhsFrame(t, SEED, { ...OPTS, intensity: 0 });
      expect([f.scanOpacity, f.edgeOpacity, f.vignetteOpacity, f.grain.opacity, f.track.opacity, f.flicker]).toEqual([0, 0, 0, 0, 0, 0]);
    }
  });

  it('intensité 0,5 : opacités à la moitié de celles de l\'intensité 1', () => {
    const full = vhsFrame(5, SEED, OPTS);
    const half = vhsFrame(5, SEED, { ...OPTS, intensity: 0.5 });
    expect(half.scanOpacity).toBeCloseTo(full.scanOpacity / 2, 12);
    expect(half.edgeOpacity).toBeCloseTo(full.edgeOpacity / 2, 12);
    expect(half.vignetteOpacity).toBeCloseTo(full.vignetteOpacity / 2, 12);
    expect(half.grain.opacity).toBeCloseTo(full.grain.opacity / 2, 12);
  });

  it('intensité hors bornes : ramenée dans [0, 1]', () => {
    const full = vhsFrame(5, SEED, OPTS);
    expect(vhsFrame(5, SEED, { ...OPTS, intensity: 7 })).toEqual(full);
    expect(vhsFrame(5, SEED, { ...OPTS, intensity: -3 }).scanOpacity).toBe(0);
  });

  it('intensité absente : celle des données', () => {
    const { intensity, ...rest } = OPTS;
    expect(intensity).toBe(1);
    expect(vhsFrame(5, SEED, { ...rest, params: { ...P, intensity: 0.5 } }).scanOpacity).toBeCloseTo(P.opacity.scan / 2, 12);
  });

  it('sans paramètres : effet éteint', () => {
    for (const w of WEIRD) expect(isOff(vhsFrame(1, SEED, { enabled: true, params: w }))).toBe(true);
    expect(vhsFrame(1, SEED, undefined)).toBe(OFF);
  });
});

describe('vhs : entrées hostiles et immutabilité', () => {
  it('temps, graine et options absurdes : jamais d\'exception, toujours un objet complet', () => {
    for (const w of WEIRD) {
      expect(() => vhsFrame(w, SEED, OPTS), `t ${String(w)}`).not.toThrow();
      expect(() => vhsFrame(1, w, OPTS), `graine ${String(w)}`).not.toThrow();
      expect(() => vhsFrame(1, SEED, w), `options ${String(w)}`).not.toThrow();
      expect(() => trackingEvents(w, w, w, w), `suivi ${String(w)}`).not.toThrow();
      expect(() => trackingEvents(SEED, 0, 100, w)).not.toThrow();
    }
    const f = vhsFrame(NaN, SEED, OPTS);
    expect(Object.keys(f).sort()).toEqual(['edgeOpacity', 'flicker', 'grain', 'on', 'scanOpacity', 'track', 'vignetteOpacity']);
    expect(Object.keys(f.track).sort()).toEqual(['active', 'height', 'opacity', 'shiftPx', 'y']);
    expect(Object.keys(f.grain).sort()).toEqual(['opacity', 'step', 'x', 'y']);
  });

  it('réglages absurdes (champs manquants ou invalides) : pas d\'exception, valeurs finies', () => {
    for (const w of WEIRD) {
      for (const key of ['opacity', 'caps', 'grain', 'flicker', 'track', 'seed', 'scanPeriod']) {
        const f = vhsFrame(8, SEED, { ...OPTS, params: { ...P, [key]: w } });
        for (const v of [f.scanOpacity, f.edgeOpacity, f.vignetteOpacity, f.grain.opacity, f.flicker, f.track.y]) expect(Number.isFinite(v), `${key}=${String(w)}`).toBe(true);
      }
    }
  });

  it('arguments gelés : acceptés, jamais modifiés', () => {
    const options = deepFreeze({ enabled: true, reducedMotion: false, intensity: 0.8, params: JSON.parse(JSON.stringify(P)) });
    const before = JSON.stringify(options);
    expect(() => vhsFrame(33, SEED, options)).not.toThrow();
    expect(() => trackingEvents(SEED, 0, 100, options.params)).not.toThrow();
    expect(JSON.stringify(options)).toBe(before);
  });

  it('OFF est gelé : les valeurs partagées ne peuvent pas être modifiées', () => {
    expect(Object.isFrozen(OFF)).toBe(true);
    expect(Object.isFrozen(OFF.track)).toBe(true);
    expect(Object.isFrozen(OFF.grain)).toBe(true);
  });

  it('un temps négatif ou très grand donne des valeurs normales', () => {
    expect(vhsFrame(-5, SEED, OPTS)).toEqual(vhsFrame(0, SEED, OPTS));
    const f = vhsFrame(1e6, SEED, OPTS);
    expect(f.on).toBe(true);
    expect(f.scanOpacity).toBeLessThanOrEqual(LIMITS.scan);
  });
});
