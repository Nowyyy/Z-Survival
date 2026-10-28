import { describe, it, expect } from 'vitest';
import { ALL_STAT_IDS, EXTRA_STAT_IDS, STAT_IDS, effectivePlayer, effectiveWeapon, normalizeLevels, parseLevelsParam, statValues } from '../../js/core/player-stats.js';
import { deepFreeze, load, WEIRD } from './helpers/monde.js';

const params = load('player-stats');
const player = load('player');
const pistol = load('weapons').pistol;
const P = (levels) => effectivePlayer(player, levels, params);

describe('player-stats.js (lot 3) : statistique chutes', () => {
  it('deux statistiques de plus, hors des sept d\'origine', () => {
    expect(EXTRA_STAT_IDS).toEqual(['chutes', 'reparation']);
    expect(ALL_STAT_IDS).toEqual([...STAT_IDS, 'chutes', 'reparation']);
    expect(STAT_IDS).toHaveLength(7);
  });

  it.each([[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 6]])('niveau %s : %s chute(s)', (l, v) => {
    expect(P({ chutes: l }).maxFalls).toBe(v);
  });

  it('plafond du niveau 5 : 6 chutes, les niveaux au-delà sont bornés avec avertissement', () => {
    const n = normalizeLevels({ chutes: 9 }, params);
    expect(n.levels.chutes).toBe(5);
    expect(n.warnings).toHaveLength(1);
    expect(P({ chutes: 9 }).maxFalls).toBe(6);
  });

  it('sans niveau donné, 1 chute de base', () => {
    expect(P({}).maxFalls).toBe(1);
    expect(statValues({}, params).falls).toBe(1);
  });
});

describe('player-stats.js (lot 3) : statistique reparation', () => {
  it.each([[0, 1.8], [1, 1.584], [2, 1.8 * 0.88 ** 2], [5, 1.8 * 0.88 ** 5], [10, 1.8 * 0.88 ** 10]])('niveau %s : %s s par planche', (l, v) => {
    expect(P({ reparation: l }).repairTime).toBeCloseTo(v, 9);
  });

  it('niveau 10 : environ 0,5 s ; plancher à 0,4 s même avec une décroissance plus forte', () => {
    expect(P({ reparation: 10 }).repairTime).toBeCloseTo(0.5, 2);
    const hard = { ...params, extra: { ...params.extra, reparation: { ...params.extra.reparation, decay: 0.5 } } };
    expect(effectivePlayer(player, { reparation: 10 }, hard).repairTime).toBe(0.4);
  });

  it('temps de réparation strictement décroissant avec le niveau', () => {
    const t = Array.from({ length: 11 }, (_, l) => P({ reparation: l }).repairTime);
    expect(t.every((x, i) => i === 0 || x < t[i - 1])).toBe(true);
  });
});

describe('player-stats.js (lot 3) : maxLevel par statistique et ?lvl=', () => {
  it('maxLevel propre à chaque statistique extra : 5 pour chutes, 10 pour reparation', () => {
    expect(params.extra.chutes.maxLevel).toBe(5);
    expect(params.extra.reparation.maxLevel).toBe(10);
    expect(normalizeLevels({ reparation: 11 }, params).levels.reparation).toBe(10);
  });

  it('les niveaux extra n\'apparaissent que s\'ils sont donnés : les sept d\'origine restent seuls par défaut', () => {
    expect(Object.keys(normalizeLevels({}, params).levels)).toEqual(STAT_IDS);
    expect(Object.keys(normalizeLevels({ chutes: 2 }, params).levels)).toEqual([...STAT_IDS, 'chutes']);
  });

  it('?lvl=chutes:2,reparation:5', () => {
    const r = parseLevelsParam('chutes:2,reparation:5', params);
    expect(r.extra).toEqual({ chutes: 2, reparation: 5 });
    expect(r.levels).toEqual({});
    expect(r.warnings).toEqual([]);
  });

  it('all:5 : cinq niveaux aux sept statistiques, chutes et reparation au niveau 5', () => {
    const r = parseLevelsParam('all:5', params);
    expect(Object.keys(r.levels)).toEqual(STAT_IDS);
    expect(r.extra).toEqual({ chutes: 5, reparation: 5 });
  });

  it('all:10 : borné par statistique (chutes à 5), sans avertissement', () => {
    const r = parseLevelsParam('all:10', params);
    expect(r.extra).toEqual({ chutes: 5, reparation: 10 });
    expect(r.levels.degats).toBe(10);
    expect(r.warnings).toEqual([]);
  });

  it('chutes:9 explicite : borné à 5 avec avertissement ; une statistique citée surcharge all', () => {
    const r = parseLevelsParam('chutes:9,all:2,reparation:7', params);
    expect(r.extra).toEqual({ chutes: 5, reparation: 7 });
    expect(r.warnings).toEqual(['niveau hors bornes pour chutes']);
  });


});

describe('player-stats.js (lot 3) : le reste est inchangé', () => {
  it('les statistiques d\'origine ne touchent pas chutes et reparation, et inversement', () => {
    expect(P({ vie: 5 })).toMatchObject({ maxFalls: 1, repairTime: 1.8 });
    const a = effectiveWeapon(pistol, { chutes: 5, reparation: 10 }, params);
    expect(a).toEqual(effectiveWeapon(pistol, {}, params));
    expect(P({ chutes: 5, reparation: 10 })).toMatchObject({ maxHealth: 100, speed: 220, regen: 1 });
  });

  it('entrées hostiles et arguments gelés', () => {
    for (const a of WEIRD) {
      for (const b of WEIRD) {
        expect(() => effectivePlayer(a, b, b)).not.toThrow();
        expect(() => parseLevelsParam(a, b)).not.toThrow();
        const eff = effectivePlayer(a, { chutes: 3, reparation: 4 }, b);
        expect(Number.isFinite(eff.maxFalls) && Number.isFinite(eff.repairTime)).toBe(true);
      }
    }
    const frozen = deepFreeze(JSON.parse(JSON.stringify(params)));
    expect(() => effectivePlayer(player, { chutes: 2 }, frozen)).not.toThrow();
    expect(frozen.extra.chutes.maxLevel).toBe(5);
  });
});
