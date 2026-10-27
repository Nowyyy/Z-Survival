import { describe, it, expect } from 'vitest';
import { effectivePlayer, effectiveWeapon, normalizeLevels, parseLevelsParam, STAT_IDS, statValues } from '../../js/core/player-stats.js';
import { deepFreeze, load, WEIRD } from './helpers/monde.js';

const params = load('player-stats');
const pistol = load('weapons').pistol;
const player = load('player');
const W = (levels) => effectiveWeapon(pistol, levels, params);
const P = (levels) => effectivePlayer(player, levels, params);
const all = (n) => Object.fromEntries(STAT_IDS.map((id) => [id, n]));

describe('player-stats.js : valeurs de la table, aux niveaux 0, 1, 5 et 10', () => {
  it('sept statistiques, niveaux de 0 à 10', () => {
    expect(STAT_IDS).toEqual(['degats', 'portee', 'precision', 'cadence', 'vitesse', 'vie', 'regen']);
    expect(params.maxLevel).toBe(10);
  });

  it.each([[0, 25], [1, 28.75], [5, 43.75], [10, 62.5]])('dégâts au niveau %s : %s', (l, v) => {
    expect(W({ degats: l }).damage).toBeCloseTo(v, 9);
  });

  it.each([[0, 700, 300], [1, 784, 336], [5, 1120, 480], [10, 1540, 660]])('portée au niveau %s : tir %s, laser %s, balle = tir + 100', (l, fire, laser) => {
    const w = W({ portee: l });
    expect(w.fireRange).toBeCloseTo(fire, 9);
    expect(w.laserRange).toBeCloseTo(laser, 9);
    expect(w.bulletMaxDistance).toBeCloseTo(fire + 100, 9);
  });

  it.each([[0, 4, 12], [1, 3.6, 10.4], [5, 4 * 0.9 ** 5, 4 * 0.9 ** 5 + 8 * 0.85 ** 5], [10, 1.3947, 2.9695]])('précision au niveau %s : demi-angle à l\'arrêt %s, à pleine vitesse %s', (l, still, move) => {
    const w = W({ precision: l });
    expect(w.coneStill).toBeCloseTo(still, 3);
    expect(w.coneMove).toBeCloseTo(move, 3);
  });

  it.each([[0, 0.4], [1, 0.36], [5, 0.4 * 0.9 ** 5], [10, 0.15]])('cadence au niveau %s : délai %s', (l, v) => {
    expect(W({ cadence: l }).fireDelay).toBeCloseTo(v, 9);
  });

  it.each([[0, 220], [1, 228.8], [5, 264], [10, 308]])('vitesse au niveau %s : %s', (l, v) => {
    expect(P({ vitesse: l }).speed).toBeCloseTo(v, 9);
  });

  it.each([[0, 100], [1, 112], [5, 160], [10, 220]])('vie maximale au niveau %s : %s', (l, v) => {
    expect(P({ vie: l }).maxHealth).toBe(v);
  });

  it.each([[0, 1], [1, 2], [5, 6], [10, 11]])('régénération au niveau %s : %s PV par kill', (l, v) => {
    expect(P({ regen: l }).regen).toBe(v);
  });

  it('niveau 0 partout : arme et joueur de base (sauf cône et marge de balle)', () => {
    const w = W({});
    expect(w).toMatchObject({ damage: 25, fireDelay: 0.4, fireRange: 700, laserRange: 300, bulletMaxDistance: 800, aimTolerance: 24, bulletSpeed: 1100 });
    expect(P({})).toMatchObject({ maxHealth: 100, speed: 220, regen: 1, radius: 18 });
  });

  it('chaque statistique n\'agit que sur ses propres valeurs', () => {
    const base = { w: W({}), p: P({}) };
    expect(W({ degats: 7 })).toEqual({ ...base.w, damage: W({ degats: 7 }).damage });
    expect(P({ vie: 7 })).toEqual({ ...base.p, maxHealth: P({ vie: 7 }).maxHealth });
    expect(W({ vie: 9, regen: 9, vitesse: 9 })).toEqual(base.w);
  });
});

describe('player-stats.js : bornes et normalisation', () => {
  it.each([[-1], [-50], [11], [99], [1000]])('niveau %s : borné à [0, 10] avec avertissement', (v) => {
    const r = normalizeLevels({ degats: v }, params);
    expect(r.levels.degats).toBe(v < 0 ? 0 : 10);
    expect(r.warnings.length).toBeGreaterThan(0);
  });

  it.each([[3.5], ['5'], [NaN], [Infinity], [null], [{}], [true]])('niveau invalide %s : 0 avec avertissement', (v) => {
    const r = normalizeLevels({ precision: v }, params);
    expect(r.levels.precision).toBe(0);
    expect(r.warnings.length).toBeGreaterThan(0);
  });

  it('niveau absent : 0 sans avertissement ; statistique inconnue : ignorée avec avertissement', () => {
    expect(normalizeLevels({}, params)).toEqual({ levels: all(0), warnings: [] });
    const r = normalizeLevels({ foo: 3, degats: 2 }, params);
    expect(r.levels).toEqual({ ...all(0), degats: 2 });
    expect(r.warnings).toHaveLength(1);
    expect(r.levels.foo).toBeUndefined();
  });

  it('les niveaux valides sont gardés tels quels', () => {
    expect(normalizeLevels(all(10), params)).toEqual({ levels: all(10), warnings: [] });
    expect(normalizeLevels({ vie: 4, regen: 6 }, params).levels).toMatchObject({ vie: 4, regen: 6, degats: 0 });
  });
});

describe('player-stats.js : monotonie, planchers et plafonds', () => {
  const series = (fn) => Array.from({ length: 11 }, (_, l) => fn(l));
  const increasing = (xs) => xs.every((x, i) => i === 0 || x > xs[i - 1]);
  const decreasing = (xs) => xs.every((x, i) => i === 0 || x < xs[i - 1]);

  it('dégâts, portée, vie et régénération strictement croissants', () => {
    expect(increasing(series((l) => W({ degats: l }).damage))).toBe(true);
    expect(increasing(series((l) => W({ portee: l }).fireRange))).toBe(true);
    expect(increasing(series((l) => W({ portee: l }).laserRange))).toBe(true);
    expect(increasing(series((l) => P({ vie: l }).maxHealth))).toBe(true);
    expect(increasing(series((l) => P({ regen: l }).regen))).toBe(true);
  });

  it('vitesse croissante jusqu\'au plafond de +40 %', () => {
    const v = series((l) => P({ vitesse: l }).speed);
    expect(v.every((x, i) => i === 0 || x >= v[i - 1])).toBe(true);
    expect(Math.max(...v)).toBeLessThanOrEqual(220 * 1.4 + 1e-9);
    expect(P({ vitesse: 10 }).speed).toBeCloseTo(308, 9);
  });

  it('plafond de vitesse : avec un pas plus grand, le bonus ne dépasse jamais +40 %', () => {
    const p = { ...params, stats: { ...params.stats, vitesse: { perLevel: 0.1, maxBonus: 0.4 } } };
    expect(effectivePlayer(player, { vitesse: 10 }, p).speed).toBeCloseTo(308, 9);
  });

  it('délai et demi-angles strictement décroissants (délai : jusqu\'au plancher)', () => {
    expect(decreasing(series((l) => W({ precision: l }).coneStill))).toBe(true);
    expect(decreasing(series((l) => W({ precision: l }).coneMove))).toBe(true);
    const d = series((l) => W({ cadence: l }).fireDelay);
    expect(d.every((x, i) => i === 0 || x <= d[i - 1])).toBe(true);
  });

  it('plancher du délai : jamais sous 0,15 s, même avec un très grand niveau', () => {
    for (const l of [9, 10, 11, 99]) expect(W({ cadence: l }).fireDelay).toBeGreaterThanOrEqual(0.15);
    expect(W({ cadence: 10 }).fireDelay).toBe(0.15);
  });

  it('plancher du demi-angle : 0,5° au moins', () => {
    const p = { ...params, stats: { ...params.stats, precision: { ...params.stats.precision, baseAngle: 0.1, moveAngle: 0.1 } } };
    const w = effectiveWeapon(pistol, all(10), p);
    expect(w.coneStill).toBe(0.5);
    expect(w.coneMove).toBe(0.5);
    expect(statValues(all(10), p).minAngle).toBe(0.5);
  });

  it('un délai de base déjà sous le plancher n\'est pas relevé au niveau 0', () => {
    expect(effectiveWeapon({ fireDelay: 0.1 }, {}, params).fireDelay).toBe(0.1);
  });

  it('niveaux maximaux : valeurs de la spécification', () => {
    const w = W(all(10));
    for (const [k, v] of Object.entries({ damage: 62.5, fireDelay: 0.15, fireRange: 1540, laserRange: 660, bulletMaxDistance: 1640 })) expect(w[k], k).toBeCloseTo(v, 9);
    expect(P(all(10))).toMatchObject({ maxHealth: 220, speed: 308, regen: 11 });
  });
});

describe('player-stats.js : ?lvl= (parseLevelsParam)', () => {
  const parse = (t) => parseLevelsParam(t, params);

  it('une statistique, plusieurs statistiques', () => {
    expect(parse('degats:3').levels).toEqual({ degats: 3 });
    expect(parse('degats:3,precision:5').levels).toEqual({ degats: 3, precision: 5 });
    expect(parse('degats:3,precision:5').warnings).toEqual([]);
  });

  it('all:5 applique cinq niveaux aux sept statistiques', () => {
    expect(parse('all:5').levels).toEqual(all(5));
  });

  it('all est appliqué d\'abord, quel que soit son rang, puis chaque statistique surcharge', () => {
    expect(parse('all:5,degats:1').levels).toEqual({ ...all(5), degats: 1 });
    expect(parse('degats:1,all:5').levels).toEqual({ ...all(5), degats: 1 });
  });

  it('clés inconnues et valeurs non entières ignorées avec avertissement', () => {
    const r = parse('foo:3,degats:2.5,vie:abc,regen:4');
    expect(r.levels).toEqual({ regen: 4 });
    expect(r.warnings).toHaveLength(3);
  });

  it('valeurs hors bornes bornées', () => {
    const r = parse('degats:99,precision:-2');
    expect(r.levels).toEqual({ degats: 10, precision: 0 });
    expect(r.warnings).toHaveLength(2);
  });

  it.each([[''], [undefined], [null], [42], [{}], [','], [',,,']])('entrée vide ou invalide %j : aucun niveau, aucune exception', (v) => {
    expect(parse(v).levels).toEqual({});
  });

  it('chaîne très longue : tronquée, sans exception', () => {
    const r = parse(`${'degats:1,'.repeat(5000)}vie:9`);
    expect(r.levels.degats).toBe(1);
    expect(r.levels.vie).toBeUndefined();
    expect(r.warnings.join(' ')).toMatch(/tronqué/);
  });

  it('injection de caractères : rien n\'est exécuté ni conservé, avertissements assainis', () => {
    const r = parse('<script>alert(1)</script>:5,__proto__:3,constructor:2,degats:1;vie:2,"degats":3');
    expect(r.levels).toEqual({});
    expect(Object.keys(r.levels)).toEqual([]);
    for (const w of r.warnings) expect(w).not.toMatch(/[<>"';]/);
    expect(({}).polluted).toBeUndefined();
  });

  it('espaces tolérés, casse stricte', () => {
    expect(parse(' degats:3 , vie:2 ').levels).toEqual({ degats: 3, vie: 2 });
    expect(parse('DEGATS:3').levels).toEqual({});
  });
});

describe('player-stats.js : déterminisme, arguments gelés, entrées hostiles', () => {
  it('mêmes entrées, mêmes sorties', () => {
    expect(W(all(4))).toEqual(W(all(4)));
    expect(statValues(all(4), params)).toEqual(statValues(all(4), params));
    expect(P(all(4))).toEqual(P(all(4)));
  });

  it('arguments gelés acceptés et non modifiés', () => {
    const levels = deepFreeze({ degats: 3, vie: 12 });
    const frozen = deepFreeze(JSON.parse(JSON.stringify({ pistol, player, params })));
    const before = JSON.stringify(frozen);
    expect(() => effectiveWeapon(frozen.pistol, levels, frozen.params)).not.toThrow();
    expect(() => effectivePlayer(frozen.player, levels, frozen.params)).not.toThrow();
    expect(() => normalizeLevels(levels, frozen.params)).not.toThrow();
    expect(JSON.stringify(frozen)).toBe(before);
    expect(levels).toEqual({ degats: 3, vie: 12 });
  });

  it('les fonctions renvoient de nouveaux objets', () => {
    const w = W({});
    expect(w).not.toBe(pistol);
    expect(w).not.toBe(W({}));
    expect(pistol.damage).toBe(25);
  });

  it('entrées hostiles : aucune exception, valeurs finies', () => {
    for (const a of WEIRD) {
      for (const b of WEIRD) {
        expect(() => effectiveWeapon(a, b, a)).not.toThrow();
        expect(() => effectivePlayer(a, b, b)).not.toThrow();
        expect(() => statValues(a, b)).not.toThrow();
        expect(() => normalizeLevels(a, b)).not.toThrow();
        expect(() => parseLevelsParam(a, b)).not.toThrow();
        for (const v of Object.values(effectivePlayer(a, b, b)).filter((x) => typeof x === 'number')) expect(Number.isFinite(v)).toBe(true);
        for (const v of Object.values(effectiveWeapon(a, b, b)).filter((x) => typeof x === 'number')) expect(Number.isFinite(v)).toBe(true);
      }
    }
  });

  it('sans paramètres : aucun effet par niveau (valeurs neutres)', () => {
    expect(effectiveWeapon(pistol, all(10), null)).toMatchObject({ damage: 25, fireDelay: 0.4, fireRange: 700 });
    expect(effectivePlayer(player, all(10), undefined)).toMatchObject({ maxHealth: 100, speed: 220 });
  });

  it('tableau ou chaîne à la place des niveaux : tout à 0', () => {
    expect(normalizeLevels([5, 5], params).levels).toEqual(all(0));
    expect(normalizeLevels('all:5', params).levels).toEqual(all(0));
  });
});
