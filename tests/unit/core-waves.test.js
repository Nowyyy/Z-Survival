import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { GAITS, TYPES, apportion, gaitWeights, hpMul, levelOfWave, typeWeights, waveOrder, waveSpec } from '../../js/core/waves.js';

const params = JSON.parse(readFileSync('data/game/waves.json', 'utf8'));
const spec = (n) => waveSpec(n, params);
const sum = (o) => Object.values(o).reduce((a, b) => a + b, 0);
const range = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i);

describe('waves.js : total de zombies', () => {
  it.each([[1, 5], [2, 7], [3, 8], [4, 10]])('vague %i (sans renfort) : %i zombies', (n, total) => {
    expect(spec(n).total).toBe(total);
  });

  it('la vague 5 est renforcée : le total avant arrondi est multiplié par 1,3', () => {
    expect(spec(5).reinforced).toBe(true);
    expect(spec(5).total).toBe(Math.round((5 + 1.6 * 4 + 0.05 * 16) * 1.3));
  });

  it.each([1, 2, 3, 4, 6, 7, 8, 9, 11, 14])('la vague %i n\'est pas renforcée', (n) => {
    expect(spec(n).reinforced).toBe(false);
  });

  it.each([5, 10, 15, 20, 40, 100])('la vague %i est renforcée', (n) => {
    expect(spec(n).reinforced).toBe(true);
  });

  it('le total est plafonné à 150, renfort compris', () => {
    for (const n of [40, 45, 60, 100, 200, 1000]) expect(spec(n).total).toBeLessThanOrEqual(150);
    expect(spec(40).total).toBe(150);
    expect(spec(200).total).toBe(150);
  });

  it('le total entre vagues non renforcées ne diminue jamais', () => {
    const plain = range(1, 200).filter((n) => !spec(n).reinforced).map((n) => spec(n).total);
    for (let i = 1; i < plain.length; i += 1) expect(plain[i]).toBeGreaterThanOrEqual(plain[i - 1]);
  });

  it('une vague renforcée est plus grande que la précédente', () => {
    for (const n of [5, 10, 15, 20, 25]) expect(spec(n).total).toBeGreaterThan(spec(n - 1).total);
  });
});

describe('waves.js : vie (forme de Black Ops 3)', () => {
  it('n=1 : ×1 ; n=9 : ×5 ; n=10 : ×5,5', () => {
    expect(spec(1).hpMul).toBe(1);
    expect(spec(9).hpMul).toBeCloseTo(5, 10);
    expect(spec(10).hpMul).toBeCloseTo(5.5, 10);
  });

  it('n=20 : 5 × 1,1^11', () => {
    expect(spec(20).hpMul).toBeCloseTo(5 * 1.1 ** 11, 9);
  });

  it('pente de 0,5 par vague jusqu\'à la vague 9', () => {
    for (const n of range(2, 9)) expect(spec(n).hpMul - spec(n - 1).hpMul).toBeCloseTo(0.5, 10);
  });

  it('rapport de 1,1 entre vagues consécutives au-delà de la vague 9 (jusqu\'au plafond)', () => {
    for (const n of range(10, 27)) expect(spec(n).hpMul / spec(n - 1).hpMul).toBeCloseTo(1.1, 10);
  });

  it('plafond ×30 atteint exactement à la vague 28, constant ensuite', () => {
    expect(spec(27).hpMul).toBeLessThan(30);
    expect(spec(28).hpMul).toBe(30);
    for (const n of range(28, 300)) expect(spec(n).hpMul).toBe(30);
  });

  it('hpMul(n, hp) accepte les paramètres seuls', () => {
    expect(hpMul(9, params.hp)).toBeCloseTo(5, 10);
    expect(hpMul(1000000, params.hp)).toBe(30);
  });
});

describe('waves.js : vitesse, dégâts, simultanés, intervalle', () => {
  it('vitesse ×1,02^(n−1)', () => {
    for (const n of [1, 2, 10, 30, 100]) expect(spec(n).speedMul).toBeCloseTo(1.02 ** (n - 1), 9);
  });

  it('dégâts ×1,05^(n−1) plafonnés à ×3', () => {
    expect(spec(2).damageMul).toBeCloseTo(1.05, 10);
    expect(spec(10).damageMul).toBeCloseTo(1.05 ** 9, 10);
    for (const n of range(25, 200)) expect(spec(n).damageMul).toBe(3);
  });

  it('simultanés : 6 à la vague 1, 10 dès la vague 9, jamais plus de 10', () => {
    expect(spec(1).maxConcurrent).toBe(6);
    expect(spec(2).maxConcurrent).toBe(6);
    expect(spec(3).maxConcurrent).toBe(7);
    expect(spec(8).maxConcurrent).toBe(9);
    expect(spec(9).maxConcurrent).toBe(10);
    for (const n of range(9, 300)) expect(spec(n).maxConcurrent).toBe(10);
  });

  it('intervalle d\'apparition : 2,5 × 0,95^(n−1), au moins 0,9', () => {
    expect(spec(1).spawnInterval).toBe(2.5);
    expect(spec(2).spawnInterval).toBeCloseTo(2.375, 10);
    for (const n of range(1, 200)) expect(spec(n).spawnInterval).toBeGreaterThanOrEqual(0.9);
    expect(spec(100).spawnInterval).toBe(0.9);
  });

  it('pause : 3 s avant la vague 1, 8 s ensuite, soin de 100 %', () => {
    expect(spec(1).intermission).toBe(3);
    expect(spec(2).intermission).toBe(8);
    expect(spec(30).intermission).toBe(8);
    expect(spec(7).healFraction).toBe(1);
  });
});

describe('waves.js : types et allures', () => {
  it.each([[1, 'petit'], [2, 'petit'], [1, 'voute'], [4, 'voute'], [1, 'grand'], [6, 'grand']])('vague %i : aucun %s', (n, type) => {
    expect(spec(n).composition[type]).toBe(0);
  });

  it.each([[3, 'petit'], [5, 'voute'], [7, 'grand']])('vague %i : au moins un %s (introduit)', (n, type) => {
    expect(spec(n).composition[type]).toBeGreaterThanOrEqual(1);
  });

  it('les poids de types sont normalisés (somme 1) et plafonnés', () => {
    for (const n of range(1, 100)) {
      const w = typeWeights(n, params.types);
      expect(sum(w)).toBeCloseTo(1, 10);
      expect(w.petit).toBeLessThanOrEqual(0.3 + 1e-12);
      expect(w.voute).toBeLessThanOrEqual(0.2 + 1e-12);
      expect(w.grand).toBeLessThanOrEqual(0.15 + 1e-12);
    }
  });

  it('un type introduit monte linéairement vers son plafond en 6 vagues', () => {
    expect(typeWeights(3, params.types).petit).toBeCloseTo(0.3 / 6, 10);
    expect(typeWeights(8, params.types).petit).toBeCloseTo(0.3, 10);
    expect(typeWeights(20, params.types).petit).toBeCloseTo(0.3, 10);
    expect(typeWeights(12, params.types).voute).toBeCloseTo(0.2, 10);
    expect(typeWeights(12, params.types).grand).toBeCloseTo(0.15 * 6 / 6, 10);
  });

  it('les poids d\'allures valent les points d\'ancrage', () => {
    for (const a of params.gaitAnchors) {
      const w = gaitWeights(a.wave, params.gaitAnchors);
      for (const g of GAITS) expect(w[g] * 100, `${a.wave} ${g}`).toBeCloseTo(a[g], 9);
    }
  });

  it('les poids d\'allures sont interpolés entre les points d\'ancrage et constants après la vague 20', () => {
    const w = gaitWeights(6, params.gaitAnchors);
    expect(w.lent * 100).toBeCloseTo(30, 9);
    expect(w.course * 100).toBeCloseTo(7.5, 9);
    expect(gaitWeights(60, params.gaitAnchors)).toEqual(gaitWeights(20, params.gaitAnchors));
  });

  it('les poids d\'allures totalisent 1 à chaque vague', () => {
    for (const n of range(1, 100)) expect(sum(gaitWeights(n, params.gaitAnchors))).toBeCloseTo(1, 10);
  });

  it('vague 1 : lent et marche seulement', () => {
    expect(spec(1).gaitCounts.rampe + spec(1).gaitCounts.course).toBe(0);
  });

  it('la rampe apparaît dès la vague 4 et la course dès la vague 8', () => {
    expect(spec(4).gaitCounts.rampe).toBeGreaterThanOrEqual(1);
    expect(spec(8).gaitCounts.course).toBeGreaterThanOrEqual(1);
    expect(spec(4).gaitCounts.course).toBe(0);
  });
});

describe('waves.js : composition et décomptes entiers', () => {
  it('compositions et décomptes : entiers dont la somme vaut le total (vagues 1 à 200)', () => {
    for (const n of range(1, 200)) {
      const s = spec(n);
      for (const o of [s.composition, s.gaitCounts]) {
        expect(Object.values(o).every((v) => Number.isInteger(v) && v >= 0)).toBe(true);
        expect(sum(o)).toBe(s.total);
      }
      expect(Object.keys(s.composition)).toEqual(TYPES);
      expect(Object.keys(s.gaitCounts)).toEqual(GAITS);
    }
  });

  it('apportion : plus fort reste, déterministe, ex æquo selon l\'ordre', () => {
    expect(apportion({ a: 1, b: 1, c: 1 }, ['a', 'b', 'c'], 10)).toEqual({ a: 4, b: 3, c: 3 });
    expect(apportion({ a: 0.5, b: 0.5 }, ['a', 'b'], 3)).toEqual({ a: 2, b: 1 });
    expect(apportion({}, ['a', 'b'], 4)).toEqual({ a: 4, b: 0 });
    expect(apportion({ a: 1 }, ['a'], 0)).toEqual({ a: 0 });
  });

  it('la spécification est déterministe', () => {
    expect(spec(17)).toEqual(spec(17));
  });
});

describe('waves.js : monotonie', () => {
  const all = range(1, 200).map(spec);
  const nondecreasing = (key) => all.every((s, i) => i === 0 || s[key] >= all[i - 1][key]);
  it.each(['hpMul', 'speedMul', 'damageMul', 'maxConcurrent'])('%s ne diminue jamais', (key) => {
    expect(nondecreasing(key)).toBe(true);
  });

  it('l\'intervalle d\'apparition ne grandit jamais', () => {
    expect(all.every((s, i) => i === 0 || s.spawnInterval <= all[i - 1].spawnInterval)).toBe(true);
  });
});

describe('waves.js : waveOrder', () => {
  const longestRun = (list, key, value) => {
    let best = 0;
    let run = 0;
    for (const z of list) {
      run = z[key] === value ? run + 1 : 0;
      best = Math.max(best, run);
    }
    return best;
  };

  it('est déterministe pour une graine et dépend de la graine', () => {
    expect(waveOrder(spec(20), 42)).toEqual(waveOrder(spec(20), 42));
    expect(waveOrder(spec(20), 42)).not.toEqual(waveOrder(spec(20), 43));
  });

  it('respecte les décomptes de la spécification', () => {
    for (const n of [1, 5, 12, 40]) {
      const order = waveOrder(spec(n), 9);
      expect(order).toHaveLength(spec(n).total);
      for (const t of TYPES) expect(order.filter((z) => z.type === t).length).toBe(spec(n).composition[t]);
      for (const g of GAITS) expect(order.filter((z) => z.gait === g).length).toBe(spec(n).gaitCounts[g]);
    }
  });

  it('jamais plus de 3 « grand » ni 3 « course » d\'affilée (vagues 1 à 200, plusieurs graines)', () => {
    for (const n of range(1, 200)) {
      for (const seed of [1, 7, 12345]) {
        const order = waveOrder(spec(n), seed);
        expect(longestRun(order, 'type', 'grand'), `${n}/${seed}`).toBeLessThanOrEqual(3);
        expect(longestRun(order, 'gait', 'course'), `${n}/${seed}`).toBeLessThanOrEqual(3);
      }
    }
  });

  it('tient la règle même quand tout est « grand » ou « course » en nombre extrême', () => {
    const forced = { total: 12, composition: { marcheur: 3, petit: 0, voute: 0, grand: 9 }, gaitCounts: { lent: 3, marche: 0, rampe: 0, course: 9 } };
    for (const seed of range(1, 30)) {
      const order = waveOrder(forced, seed);
      expect(longestRun(order, 'type', 'grand')).toBeLessThanOrEqual(3);
      expect(longestRun(order, 'gait', 'course')).toBeLessThanOrEqual(3);
    }
  });

  it('ne modifie pas une spécification gelée', () => {
    const frozen = Object.freeze({ ...spec(8), composition: Object.freeze({ ...spec(8).composition }), gaitCounts: Object.freeze({ ...spec(8).gaitCounts }) });
    expect(() => waveOrder(frozen, 3)).not.toThrow();
  });

  it.each([null, undefined, 'x', 3, {}, [], NaN])('entrée hostile %s : liste vide ou valide, sans exception', (input) => {
    expect(() => waveOrder(input, input)).not.toThrow();
    expect(Array.isArray(waveOrder(input, 1))).toBe(true);
  });
});

describe('waves.js : levelOfWave', () => {
  it.each([[1, 5, 1], [5, 5, 1], [6, 5, 2], [10, 5, 2], [11, 5, 3], [200, 5, 40], [7, 1, 7]])('vague %i, %i par niveau : niveau %i', (n, per, level) => {
    expect(levelOfWave(n, per)).toBe(level);
  });

  it.each([[0, 5], [-3, 5], [NaN, 5], ['4', 5], [2.5, 5], [null, 5], [3, 0], [3, NaN], [3, undefined]])('valeurs invalides (%s, %s) : ramenées à 1, niveau fini', (n, per) => {
    const level = levelOfWave(n, per);
    expect(Number.isInteger(level) && level >= 1).toBe(true);
  });
});

describe('waves.js : robustesse', () => {
  it('vagues 1 à 200 : aucune exception ni valeur non finie', () => {
    for (const n of range(1, 200)) {
      const s = spec(n);
      for (const v of [s.total, s.maxConcurrent, s.spawnInterval, s.hpMul, s.speedMul, s.damageMul, s.level, s.intermission, s.healFraction, ...Object.values(s.composition), ...Object.values(s.gaitWeights)]) expect(Number.isFinite(v)).toBe(true);
    }
  });

  it.each([0, -1, NaN, Infinity, 2.5, '3', null, undefined, {}, []])('vague invalide %s : ramenée à 1 avec un avertissement', (n) => {
    const s = spec(n);
    expect(s.wave).toBe(1);
    expect(s.total).toBe(5);
    expect(s.warnings.length).toBeGreaterThan(0);
  });

  it('vagues énormes (10^9, MAX_SAFE_INTEGER) : valeurs finies', () => {
    for (const n of [1e9, Number.MAX_SAFE_INTEGER]) {
      const s = spec(n);
      expect(Number.isFinite(s.speedMul) && Number.isFinite(s.hpMul) && Number.isFinite(s.damageMul)).toBe(true);
    }
  });

  it.each([null, undefined, 'x', 42, [], {}, NaN])('paramètres hostiles %s : valeurs de repli, sans exception', (p) => {
    const s = waveSpec(5, p);
    expect(Number.isFinite(s.total)).toBe(true);
    expect(sum(s.composition)).toBe(s.total);
  });

  it('ne modifie pas des paramètres gelés', () => {
    const frozen = JSON.parse(JSON.stringify(params));
    const deep = (o) => { Object.values(o).forEach((v) => v && typeof v === 'object' && deep(v)); Object.freeze(o); };
    deep(frozen);
    expect(() => waveSpec(30, frozen)).not.toThrow();
    expect(frozen).toEqual(params);
  });

  it('propriétés sur une grille de vagues : somme exacte, simultanés ≤ 10, total ≤ 150', () => {
    for (let n = 1; n <= 200; n += 3) {
      const s = spec(n);
      expect(s.total).toBeGreaterThanOrEqual(1);
      expect(s.total).toBeLessThanOrEqual(150);
      expect(s.maxConcurrent).toBeLessThanOrEqual(10);
      expect(s.level).toBe(Math.ceil(n / 5));
    }
  });
});
