import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { clampMoney, createLedger, earningsTable, formatMoney, formatMoneyCompact, killMoney, killMoneyInfo, ledgerAdd, ledgerPending, ledgerTake, makeEconomy, waveBonus, worldBonus } from '../../js/core/economy.js';
import { emptyGainView, moneyGainView, pruneGains } from '../../js/core/money-gain.js';
import { waveSpec, TYPES } from '../../js/core/waves.js';

const load = (name) => JSON.parse(readFileSync(`data/game/${name}.json`, 'utf8'));
const economyJson = load('economy');
const enemies = load('enemies');
const wavesJson = load('waves');
const params = makeEconomy(economyJson, enemies);
const THIN = String.fromCharCode(0x202f);
const NBSP = String.fromCharCode(0xa0);
const deepFreeze = (o) => {
  if (o && typeof o === 'object') {
    Object.freeze(o);
    for (const v of Object.values(o)) deepFreeze(v);
  }
  return o;
};

describe('makeEconomy', () => {
  it('reprend economy.json et la prime de chaque type de enemies.json', () => {
    expect(params.bounty).toEqual({ marcheur: 5, petit: 6, voute: 8, grand: 12 });
    expect(params.waveBonusBase).toBe(10);
    expect(params.maxMoney).toBe(9_999_999);
  });

  it('ne modifie pas ses arguments et renvoie un nouvel objet', () => {
    const e = deepFreeze(structuredClone(economyJson));
    const n = deepFreeze(structuredClone(enemies));
    const out = makeEconomy(e, n);
    expect(out).not.toBe(e);
    expect(out.bounty).toEqual(params.bounty);
  });

  it.each([null, undefined, 3, 'x', []])('entrée hostile %j : objet sans prime, sans exception', (bad) => {
    expect(makeEconomy(bad, bad)).toEqual({ bounty: {} });
  });
});

describe('killMoney : round(prime × min(plafond, 1 + 0,04 × (manche − 1)))', () => {
  const WAVES = [1, 2, 11, 26, 40, 51, 200];
  const EXPECTED = {
    marcheur: [5, 5, 7, 10, 13, 15, 15],
    petit: [6, 6, 8, 12, 15, 18, 18],
    voute: [8, 8, 11, 16, 20, 24, 24],
    grand: [12, 12, 17, 24, 31, 36, 36],
  };
  const cases = Object.entries(EXPECTED).flatMap(([type, list]) => WAVES.map((wave, i) => [type, wave, list[i]]));
  it.each(cases)('%s à la manche %i rapporte %i', (type, wave, amount) => {
    expect(killMoney(type, wave, params)).toBe(amount);
  });

  it('manche 1 : la prime brute (5, 6, 8, 12)', () => {
    expect(TYPES.map((t) => killMoney(t, 1, params))).toEqual([5, 6, 8, 12]);
  });

  it('manche 11 : prime × 1,4', () => {
    for (const t of TYPES) expect(killMoney(t, 11, params)).toBe(Math.round(enemies.variants[t].bounty * 1.4));
  });

  it('plafond × 3 atteint à la manche 51 et jamais dépassé', () => {
    for (const t of TYPES) {
      expect(killMoney(t, 51, params)).toBe(enemies.variants[t].bounty * 3);
      expect(killMoney(t, 10_000, params)).toBe(enemies.variants[t].bounty * 3);
    }
  });

  it('type inconnu : 0 avec un avertissement', () => {
    const r = killMoneyInfo('licorne', 5, params);
    expect(r.amount).toBe(0);
    expect(r.warnings).toHaveLength(1);
    expect(killMoney('licorne', 5, params)).toBe(0);
  });

  it.each(['__proto__', 'constructor', 'toString', '', null, undefined, 4, {}])('type hostile %j : 0', (type) => {
    expect(killMoney(type, 3, params)).toBe(0);
  });

  it.each([0, -3, NaN, Infinity, 'x', null, undefined, 1.9])('manche invalide %j : traitée comme la manche 1', (wave) => {
    expect(killMoney('marcheur', wave, params)).toBe(5);
  });

  it('est un entier ≥ 0, croissant avec la manche, pour toutes les manches de 1 à 300', () => {
    for (const t of TYPES) {
      let previous = 0;
      for (let w = 1; w <= 300; w += 1) {
        const v = killMoney(t, w, params);
        expect(Number.isInteger(v)).toBe(true);
        expect(v).toBeGreaterThanOrEqual(previous);
        previous = v;
      }
    }
  });

  it('paramètres absents ou hostiles : 0, sans exception', () => {
    for (const bad of [null, undefined, {}, 5, 'x']) expect(killMoney('marcheur', 3, bad)).toBe(0);
  });

  it('accepte des paramètres gelés et est déterministe', () => {
    const frozen = deepFreeze(structuredClone(params));
    expect(killMoney('grand', 26, frozen)).toBe(killMoney('grand', 26, params));
    expect(killMoney('grand', 26, params)).toBe(killMoney('grand', 26, params));
  });
});

describe('waveBonus : round((10 + 2 × manche) × (renforcée ? 1,5 : 1))', () => {
  it.each([[1, false, 12], [2, false, 14], [5, false, 20], [5, true, 30], [10, true, 45], [20, true, 75], [40, true, 135], [41, false, 92]])('manche %i renforcée %s : %i', (wave, reinforced, amount) => {
    expect(waveBonus(wave, reinforced, params)).toBe(amount);
  });

  it('une manche renforcée rapporte plus que la même manche normale', () => {
    for (let w = 1; w <= 60; w += 1) expect(waveBonus(w, true, params)).toBeGreaterThan(waveBonus(w, false, params));
  });

  it('croît avec la manche', () => {
    let previous = 0;
    for (let w = 1; w <= 100; w += 1) {
      const v = waveBonus(w, false, params);
      expect(v).toBeGreaterThan(previous);
      previous = v;
    }
  });

  it.each([NaN, -1, 0, 'x', null])('manche invalide %j : comme la manche 1', (wave) => {
    expect(waveBonus(wave, false, params)).toBe(12);
  });

  it('renforcée n\'est vraie que pour true ; paramètres hostiles : 0', () => {
    expect(waveBonus(5, 'oui', params)).toBe(20);
    expect(waveBonus(5, false, null)).toBe(0);
    expect(waveBonus(5, true, {})).toBe(0);
  });

  it('le bonus de fin de monde vaut 500', () => {
    expect(worldBonus(params)).toBe(500);
    expect(worldBonus(null)).toBe(0);
  });
});

describe('earningsTable', () => {
  const table = earningsTable(wavesJson, economyJson, enemies, 40);

  it('a 40 lignes, de la manche 1 à la manche 40', () => {
    expect(table).toHaveLength(40);
    expect(table.map((r) => r.wave)).toEqual(Array.from({ length: 40 }, (_, i) => i + 1));
  });

  it('chaque ligne est cohérente avec waveSpec : somme des compositions × killMoney', () => {
    for (const row of table) {
      const spec = waveSpec(row.wave, wavesJson);
      const kills = TYPES.reduce((sum, t) => sum + spec.composition[t] * killMoney(t, row.wave, params), 0);
      expect(row.killGain).toBe(kills);
      expect(row.zombies).toBe(spec.total);
      expect(row.reinforced).toBe(spec.reinforced);
      expect(row.bonus).toBe(waveBonus(row.wave, spec.reinforced, params));
      expect(row.gain).toBe(row.killGain + row.bonus);
    }
  });

  it('le cumul est la somme des gains', () => {
    let sum = 0;
    for (const row of table) {
      sum += row.gain;
      expect(row.cumulative).toBe(sum);
    }
  });

  it('le gain par manche croît entre manches non renforcées', () => {
    const normal = table.filter((r) => !r.reinforced);
    for (let i = 1; i < normal.length; i += 1) expect(normal[i].gain).toBeGreaterThanOrEqual(normal[i - 1].gain);
  });

  it('tout est entier et ≥ 0', () => {
    for (const row of table) for (const k of ['killGain', 'bonus', 'gain', 'cumulative', 'zombies']) {
      expect(Number.isInteger(row[k]), k).toBe(true);
      expect(row[k]).toBeGreaterThanOrEqual(0);
    }
  });

  it('valeurs de référence : manche 1 = 25 + 12, manche 5 = 101 + 30, manche 40 = 2 646 + 135', () => {
    expect([table[0].killGain, table[0].bonus, table[0].gain]).toEqual([25, 12, 37]);
    expect([table[4].killGain, table[4].bonus]).toEqual([101, 30]);
    expect([table[39].killGain, table[39].bonus]).toEqual([2646, 135]);
  });

  it('maxWave borne le tableau (jamais plus de 40) ; accepte des paramètres déjà assemblés', () => {
    expect(earningsTable(wavesJson, economyJson, enemies, 5)).toHaveLength(5);
    expect(earningsTable(wavesJson, economyJson, enemies, 999)).toHaveLength(40);
    expect(earningsTable(wavesJson, params, null, 3)).toHaveLength(3);
    expect(earningsTable(wavesJson, economyJson, enemies, -4)).toEqual([]);
  });

  it('entrées hostiles : pas d\'exception', () => {
    expect(() => earningsTable(null, null, null, 3)).not.toThrow();
    expect(() => earningsTable('x', 5, [], NaN)).not.toThrow();
  });

  it('ne modifie pas ses arguments gelés et est déterministe', () => {
    const out = earningsTable(deepFreeze(structuredClone(wavesJson)), deepFreeze(structuredClone(economyJson)), deepFreeze(structuredClone(enemies)), 40);
    expect(out).toEqual(table);
  });
});

describe('journal des gains', () => {
  it('démarre vide', () => {
    expect(createLedger()).toEqual({ pending: 0, earnedRun: 0, killsRun: 0, byKind: { kill: 0, wave: 0, world: 0, test: 0 } });
  });

  it('cumule les gains par type et compte les kills', () => {
    let l = createLedger();
    l = ledgerAdd(l, { kind: 'kill', amount: 5 }, params);
    l = ledgerAdd(l, { kind: 'kill', amount: 6 }, params);
    l = ledgerAdd(l, { kind: 'wave', amount: 12 }, params);
    l = ledgerAdd(l, { kind: 'world', amount: 500 }, params);
    l = ledgerAdd(l, { kind: 'test', amount: 7 }, params);
    expect(l.pending).toBe(530);
    expect(l.earnedRun).toBe(530);
    expect(l.killsRun).toBe(2);
    expect(l.byKind).toEqual({ kill: 11, wave: 12, world: 500, test: 7 });
    expect(ledgerPending(l)).toBe(530);
  });

  it('ledgerTake remet le montant en attente à zéro et rend la différence', () => {
    const l = ledgerAdd(ledgerAdd(createLedger(), { kind: 'kill', amount: 5 }, params), { kind: 'wave', amount: 12 }, params);
    const taken = ledgerTake(l);
    expect(taken.delta).toEqual({ money: 17, earned: 17 });
    expect(taken.ledger.pending).toBe(0);
    expect(taken.ledger.earnedRun).toBe(17);
    expect(taken.ledger.killsRun).toBe(1);
    expect(l.pending).toBe(17); // l'ancien journal reste intact : repris tel quel si l'écriture échoue
    expect(ledgerTake(taken.ledger).delta).toEqual({ money: 0, earned: 0 });
  });

  it('un commit échoué ne perd ni ne double rien : on reprend l\'ancien journal', () => {
    let l = ledgerAdd(createLedger(), { kind: 'kill', amount: 5 }, params);
    const first = ledgerTake(l); // écriture échouée : on garde l
    l = ledgerAdd(l, { kind: 'kill', amount: 6 }, params);
    const second = ledgerTake(l);
    expect(first.delta.money).toBe(5);
    expect(second.delta.money).toBe(11);
  });

  it.each([-1, 1.5, NaN, Infinity, '5', null, undefined, 10_000_000, {}])('montant invalide %j ignoré', (amount) => {
    const l = ledgerAdd(createLedger(), { kind: 'kill', amount }, params);
    expect(l).toEqual(createLedger());
  });

  it.each(['autre', '', null, 5, '__proto__'])('type invalide %j ignoré', (kind) => {
    expect(ledgerAdd(createLedger(), { kind, amount: 5 }, params)).toEqual(createLedger());
  });

  it.each([null, undefined, 5, 'x', []])('entrée hostile %j ignorée', (entry) => {
    expect(ledgerAdd(createLedger(), entry, params)).toEqual(createLedger());
  });

  it('le montant en attente ne dépasse jamais maxMoney', () => {
    let l = createLedger();
    for (let i = 0; i < 5; i += 1) l = ledgerAdd(l, { kind: 'test', amount: 9_000_000 }, params);
    expect(l.pending).toBe(9_999_999);
    expect(l.earnedRun).toBe(9_999_999);
  });

  it('les arguments gelés ne sont pas modifiés ; chaque appel renvoie un nouvel objet', () => {
    const l = deepFreeze(createLedger());
    const out = ledgerAdd(l, { kind: 'kill', amount: 5 }, params);
    expect(out).not.toBe(l);
    expect(l.pending).toBe(0);
    expect(ledgerAdd(l, { kind: 'bad', amount: 5 }, params)).not.toBe(l);
    expect(ledgerTake(deepFreeze(out)).delta.money).toBe(5);
  });

  it('un journal hostile est ramené à un journal valide', () => {
    expect(ledgerPending(null)).toBe(0);
    expect(ledgerPending({ pending: -5 })).toBe(0);
    expect(ledgerTake('x').delta).toEqual({ money: 0, earned: 0 });
    expect(ledgerAdd({ pending: 'x', byKind: 4 }, { kind: 'kill', amount: 2 }, params).pending).toBe(2);
  });

  it('sans paramètres, plafond 0 : rien n\'est ajouté', () => {
    expect(ledgerAdd(createLedger(), { kind: 'kill', amount: 5 }, null).pending).toBe(0);
  });
});

describe('clampMoney', () => {
  it.each([[0, 0], [5, 5], [5.9, 5], [-4, 0], [NaN, 0], [Infinity, 0], ['7', 0], [10_000_000, 9_999_999], [9_999_999, 9_999_999]])('%j devient %i', (n, out) => {
    expect(clampMoney(n, params)).toBe(out);
  });
});

describe('formatMoney et formatMoneyCompact', () => {
  it.each([[0, '0'], [999, '999'], [9999, `9${THIN}999`], [12345, `12${THIN}345`], [1_234_567, `1${THIN}234${THIN}567`], [9_999_999, `9${THIN}999${THIN}999`], [5.9, '5']])('formatMoney(%j)', (n, text) => {
    expect(formatMoney(n)).toBe(text);
  });

  it.each([-1, -999999, NaN, Infinity, 'abc', null, undefined, {}])('formatMoney(%j) = 0', (n) => {
    expect(formatMoney(n)).toBe('0');
  });

  it.each([[0, '0'], [999, '999'], [9999, `9${THIN}999`], [10_000, `10${NBSP}k`], [12_345, `12,3${NBSP}k`], [99_999, `99,9${NBSP}k`], [100_000, `100${NBSP}k`], [999_999, `999,9${NBSP}k`],
    [1_000_000, `1${NBSP}M`], [1_234_567, `1,2${NBSP}M`], [9_999_999, `9,9${NBSP}M`]])('formatMoneyCompact(%j)', (n, text) => {
    expect(formatMoneyCompact(n)).toBe(text);
  });

  it.each([-5, NaN, 'x', null])('formatMoneyCompact(%j) = 0', (n) => {
    expect(formatMoneyCompact(n)).toBe('0');
  });

  it('la forme courte tronque au lieu d\'arrondir vers le haut (99 999 ne devient pas « 100 k »)', () => {
    expect(formatMoneyCompact(99_999)).not.toContain('100');
  });

  it('la forme courte est toujours plus courte que 9 caractères pour tout solde permis', () => {
    for (const n of [0, 9, 99, 999, 9999, 10_000, 123_456, 9_999_999]) expect(formatMoneyCompact(n).length).toBeLessThanOrEqual(8);
  });
});

describe('moneyGainView : « +N » du HUD', () => {
  const p = { gainWindowMs: 1200, gainThrottleMs: 250 };

  it('sans gain : invisible', () => {
    const v = moneyGainView([], 1000, p);
    expect(v.visible).toBe(false);
    expect(v.text).toBe('');
    expect(emptyGainView().visible).toBe(false);
  });

  it('agrège les gains des 1,2 s dernières en un seul texte', () => {
    const events = [{ at: 100, amount: 5 }, { at: 400, amount: 6 }, { at: 900, amount: 8 }];
    const v = moneyGainView(events, 1000, p);
    expect(v.visible).toBe(true);
    expect(v.amount).toBe(19);
    expect(v.text).toBe('+19');
  });

  it('un gain sorti de la fenêtre n\'est plus compté', () => {
    const events = [{ at: 0, amount: 5 }, { at: 1000, amount: 6 }];
    expect(moneyGainView(events, 1300, p).amount).toBe(6);
    expect(moneyGainView(events, 1199, p).amount).toBe(11);
  });

  it('s\'efface après 1,2 s sans nouveau gain', () => {
    const events = [{ at: 0, amount: 5 }];
    expect(moneyGainView(events, 1199, p).visible).toBe(true);
    expect(moneyGainView(events, 1200, p).visible).toBe(false);
  });

  it('limite les mises à jour à une toutes les 250 ms', () => {
    const first = moneyGainView([{ at: 0, amount: 5 }], 0, p);
    const events = [{ at: 0, amount: 5 }, { at: 100, amount: 6 }];
    const held = moneyGainView(events, 100, p, first);
    expect(held.text).toBe('+5');
    const updated = moneyGainView(events, 250, p, first);
    expect(updated.text).toBe('+11');
    expect(updated.shownAt).toBe(250);
  });

  it('sans vue précédente, aucune limitation', () => {
    expect(moneyGainView([{ at: 0, amount: 5 }, { at: 10, amount: 6 }], 10, p).text).toBe('+11');
  });

  it('mouvement réduit : mêmes textes, mais animate faux', () => {
    const events = [{ at: 0, amount: 5 }];
    expect(moneyGainView(events, 10, p, null, { reducedMotion: true }).animate).toBe(false);
    expect(moneyGainView(events, 10, p, null, { reducedMotion: false }).animate).toBe(true);
    expect(moneyGainView(events, 10, p).animate).toBe(true);
    expect(moneyGainView([], 10, p, null, { reducedMotion: true }).animate).toBe(false);
  });

  it('au plus 3 changements de texte par seconde (limitation de 250 ms : 4 au plus, 1 par 250 ms)', () => {
    let view = emptyGainView();
    const events = [];
    let changes = 0;
    let last = '';
    for (let now = 0; now < 2000; now += 10) {
      events.push({ at: now, amount: 1 });
      view = moneyGainView(events, now, p, view);
      if (view.text !== last) changes += 1;
      last = view.text;
    }
    expect(changes).toBeLessThanOrEqual(Math.ceil(2000 / p.gainThrottleMs) + 1);
  });

  it('pruneGains oublie les événements hors fenêtre, invalides ou dans le futur', () => {
    const events = [{ at: 0, amount: 5 }, { at: 900, amount: 6 }, { at: 5000, amount: 7 }, { at: 950, amount: -2 }, { at: 'x', amount: 2 }, null, { at: 950, amount: 1.5 }];
    expect(pruneGains(events, 1300, p)).toEqual([{ at: 900, amount: 6 }]);
  });

  it.each([null, undefined, 'x', 5, {}])('événements hostiles %j : invisible, sans exception', (events) => {
    expect(moneyGainView(events, 1000, p).visible).toBe(false);
  });

  it.each([null, undefined, NaN, 'x'])('instant hostile %j : invisible', (now) => {
    expect(moneyGainView([{ at: 0, amount: 5 }], now, p).visible).toBe(false);
  });

  it('paramètres absents : invisible (fenêtre nulle)', () => {
    expect(moneyGainView([{ at: 0, amount: 5 }], 0, null).visible).toBe(false);
  });

  it('ne modifie pas ses arguments gelés et est déterministe', () => {
    const events = deepFreeze([{ at: 0, amount: 5 }, { at: 10, amount: 6 }]);
    const a = moneyGainView(events, 20, deepFreeze({ ...p }));
    const b = moneyGainView(events, 20, p);
    expect(a).toEqual(b);
  });
});
