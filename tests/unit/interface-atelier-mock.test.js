// Lot 3k-A : état d'interface simulé (js/core/ui-mock.js), pur et déterministe.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { formatMoney, formatMoneyCompact } from '../../js/core/economy.js';
import { DOWN_MODES, END_KINDS, formatChrono, mockConfig, mockState, stateById, states, sweepValues, worstCase } from '../../js/core/ui-mock.js';

const cfg = JSON.parse(readFileSync('data/game/ui-atelier.json', 'utf8'));
const HOSTILE = [undefined, null, NaN, Infinity, -Infinity, '', 'abc', {}, [], () => 1, Symbol('x'), -1, 1e12, true, '  12  ', { __proto__: { hp: 3 } }];

describe('mockState : valeurs par défaut et plages', () => {
  it('sans paramètre : valeurs par défaut de la configuration', () => {
    const s = mockState({}, cfg);
    expect(s).toMatchObject({ hp: 100, maxHp: 100, chutes: 1, money: 0, wave: 1, maxWave: 40, floor: 'rdc', remaining: 5, kills: 0, save: 'saved', trial: false, paused: false, end: 'none' });
    expect(s.down).toEqual({ mode: 'none', seconds: 0 });
    expect(s.warnings).toEqual([]);
  });

  it.each([
    ['hp', -5, 0], ['hp', 500, 100], ['chutes', 9, 5], ['chutes', -2, 0], ['money', -1, 0], ['money', 1e9, 9_999_999],
    ['wave', 0, 1], ['wave', 99, 40], ['remaining', 50, 10], ['kills', 5000, 999], ['chrono', -9, 0], ['chrono', 1e7, 35_999],
  ])('%s = %s est borné à %s avec un avertissement', (k, v, expected) => {
    const s = mockState({ [k]: v }, cfg);
    expect(s[k]).toBe(expected);
    expect(s.warnings.join(' ')).toMatch(k);
  });

  it('la vie ne dépasse jamais la vie maximale ; le ratio et le pourcentage suivent', () => {
    const s = mockState({ hp: 200, maxHp: 136 }, cfg);
    expect(s.hp).toBe(136);
    expect(s.hpRatio).toBe(1);
    expect(mockState({ hp: 34, maxHp: 136 }, cfg).hpPercent).toBe(25);
  });

  it('vie faible à 25 % ou moins', () => {
    expect(mockState({ hp: 25 }, cfg).lowHp).toBe(true);
    expect(mockState({ hp: 26 }, cfg).lowHp).toBe(false);
  });

  it('les montants passent par formatMoney et formatMoneyCompact du jeu (importés, pas recopiés)', () => {
    for (const money of [0, 999, 9999, 12_345, 9_999_999]) {
      const s = mockState({ money }, cfg);
      expect(s.moneyText).toBe(formatMoney(money));
      expect(s.moneyCompact).toBe(formatMoneyCompact(money));
    }
    expect(readFileSync('js/core/ui-mock.js', 'utf8')).toMatch(/from '\.\/economy\.js'/);
    expect(readFileSync('js/core/ui-mock.js', 'utf8')).not.toMatch(/\\u2009|toLocaleString/);
  });

  it.each(cfg.saveStatuses)('état de sauvegarde « %s » accepté', (save) => {
    expect(mockState({ save }, cfg).save).toBe(save);
  });

  it('état de sauvegarde inconnu : « saved » et un avertissement', () => {
    const s = mockState({ save: 'perdu' }, cfg);
    expect(s.save).toBe('saved');
    expect(s.warnings).toContain('save inconnu');
  });

  it('« readonly » implique le mode essai', () => {
    expect(mockState({ save: 'readonly' }, cfg).trial).toBe(true);
  });

  it.each(['rdc', 'etage'])('étage « %s »', (floor) => {
    expect(mockState({ floor }, cfg).floor).toBe(floor);
  });

  it.each(DOWN_MODES)('à terre : mode « %s »', (down) => {
    const s = mockState({ down, downSeconds: 3 }, cfg);
    expect(s.down.mode).toBe(down);
    expect(s.down.seconds).toBe(down === 'none' ? 0 : down === 'grace' ? 2 : 3);
  });

  it.each(END_KINDS)('fin de partie « %s »', (end) => {
    const s = mockState({ end, wave: 12 }, cfg);
    expect(s.end).toBe(end);
    expect(s.wave).toBe(end === 'world' ? 40 : 12);
  });

  it('prochaine zone : manche valide ou null', () => {
    expect(mockState({ nextZone: 20 }, cfg).nextZone).toBe(20);
    expect(mockState({ nextZone: null }, cfg).nextZone).toBeNull();
    expect(mockState({ nextZone: 99 }, cfg).nextZone).toBeNull();
  });

  it('les chaînes numériques et booléennes des curseurs sont acceptées', () => {
    const s = mockState({ hp: '40', reinforced: 'true', trial: '0', wave: '7' }, cfg);
    expect(s).toMatchObject({ hp: 40, reinforced: true, trial: false, wave: 7 });
  });
});

describe('mockState : entrées hostiles', () => {
  it.each(HOSTILE.map((v, i) => [i, v]))('paramètres hostiles n° %i : aucune exception, état complet', (_i, v) => {
    expect(() => mockState(v, cfg)).not.toThrow();
    const s = mockState(v, cfg);
    expect(Number.isFinite(s.hp) && Number.isFinite(s.money) && Number.isFinite(s.wave)).toBe(true);
  });

  it.each(HOSTILE.map((v, i) => [i, v]))('valeur hostile n° %i dans chaque champ : aucune exception', (_i, v) => {
    for (const k of Object.keys(cfg.defaults)) expect(() => mockState({ [k]: v }, cfg)).not.toThrow();
  });

  it('configuration absente ou hostile : valeurs de secours', () => {
    for (const c of [undefined, null, 42, 'x', { ranges: { hp: 'abc' } }, { states: 'x' }]) {
      expect(() => mockState({ hp: 50 }, c)).not.toThrow();
      expect(mockState({ hp: 50 }, c).hp).toBe(50);
    }
  });

  it('ne modifie pas ses arguments (gelés acceptés)', () => {
    const p = Object.freeze({ hp: 20, money: 5 });
    const c = structuredClone(cfg);
    const before = JSON.stringify(c);
    mockState(p, Object.freeze(c));
    expect(JSON.stringify(c)).toBe(before);
  });

  it('déterministe : deux appels identiques donnent le même état', () => {
    expect(mockState({ hp: 33, money: 77 }, cfg)).toEqual(mockState({ hp: 33, money: 77 }, cfg));
  });

  it('ignore les propriétés héritées (prototype)', () => {
    const p = Object.create({ hp: 3 });
    expect(mockState(p, cfg).hp).toBe(100);
  });
});

describe('worstCase et états nommés', () => {
  it('pire cas : « Vague 40 / 40 », étage, 5 chutes, 9 999 999, 10 restants, 999 tués', () => {
    const w = worstCase(cfg);
    expect(w).toMatchObject({ wave: 40, maxWave: 40, floor: 'etage', chutes: 5, money: 9_999_999, remaining: 10, kills: 999, trial: true, reinforced: true });
    expect(w.moneyCompact).toBe(formatMoneyCompact(9_999_999));
    expect(w.chronoText).toBe('9:59:59');
  });

  it('pire cas sans configuration : mêmes bornes de secours', () => {
    expect(worstCase()).toMatchObject({ wave: 40, money: 9_999_999, chutes: 5, kills: 999 });
  });

  it('states() : liste des états nommés, identifiants uniques, copies indépendantes', () => {
    const list = states(cfg);
    expect(list.map((s) => s.id)).toEqual(cfg.states.map((s) => s.id));
    list[0].params.hp = -1;
    expect(states(cfg)[0].params.hp).not.toBe(-1);
  });

  it.each(cfg.states.map((s) => s.id))('état nommé « %s » : sans avertissement', (id) => {
    expect(stateById(id, cfg).warnings).toEqual([]);
  });

  it('états requis présents (HUD, pause, mort, monde terminé, à terre, pire cas, essai)', () => {
    const ids = states(cfg).map((s) => s.id);
    for (const id of ['combat', 'pause', 'mort', 'monde-termine', 'a-terre', 'protege', 'pire-cas', 'essai', 'etage']) expect(ids).toContain(id);
  });

  it('id inconnu : valeurs par défaut ; configuration vide : seul « pire-cas »', () => {
    expect(stateById('inconnu', cfg).hp).toBe(100);
    expect(states({}).map((s) => s.id)).toEqual(['pire-cas']);
  });

  it('mockConfig ne garde que des plages valides', () => {
    const c = mockConfig({ ranges: { hp: [10, 5], money: [0, 10] } });
    expect(c.ranges.hp).toEqual([0, 100]);
    expect(c.ranges.money).toEqual([0, 10]);
  });
});

describe('chrono et valeurs à parcourir', () => {
  it.each([[0, '00:00'], [5, '00:05'], [65, '01:05'], [3599, '59:59'], [3600, '1:00:00'], [35_999, '9:59:59'], [-3, '00:00'], [NaN, '00:00'], ['x', '00:00']])('formatChrono(%s) = %s', (s, text) => {
    expect(formatChrono(s)).toBe(text);
  });

  it('sweepValues : bornes et passages de chiffres, triés, dans la plage', () => {
    const money = sweepValues('money', cfg);
    expect(money[0]).toBe(0);
    expect(money.at(-1)).toBe(9_999_999);
    expect(money).toContain(10_000);
    expect(money).toContain(1_000_000);
    expect(sweepValues('wave', cfg)).toEqual([1, 9, 10, 11, 40]);
    expect(sweepValues('hp', cfg)).toEqual([0, 1, 9, 10, 11, 99, 100]);
    expect(sweepValues('inconnu', cfg)).toEqual([]);
  });
});
