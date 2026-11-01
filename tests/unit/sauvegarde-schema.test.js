import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  ERROR_CODES, MIGRATIONS, RECORD_KEYS, SCHEMA_VERSION, STAT_KEYS, commitDelta, crc32, decodeSave, defaultSave, describeSave, encodeSave, fromBase64Url, migrate,
  parseMoneyParam, readOnlyMode, sanitize, statMaxLevels, toBase64Url,
} from '../../js/core/save.js';
import { createRng, nextInt } from '../../js/core/rng.js';

const load = (name) => JSON.parse(readFileSync(`data/game/${name}.json`, 'utf8'));
const params = { save: load('save'), economy: load('economy'), stats: load('player-stats') };
const MAX_MONEY = params.economy.maxMoney;
const LEVEL_MAX = statMaxLevels(params);
const deepFreeze = (o) => {
  if (o && typeof o === 'object') {
    Object.freeze(o);
    for (const v of Object.values(o)) deepFreeze(v);
  }
  return o;
};
const valid = () => ({ v: 1, rev: 3, savedAt: 1_700_000_000_000, money: 1234, earned: 5678, stats: { degats: 2, portee: 0, precision: 5, cadence: 1, vitesse: 0, vie: 3, regen: 0, chutes: 1, reparation: 4 }, records: { bestWave: 12, bestKills: 80, runs: 5, worldsCompleted: 1 } });
const SCHEMA_KEYS = ['earned', 'money', 'records', 'rev', 'savedAt', 'stats', 'v'];

describe('defaultSave', () => {
  it('a exactement les clés du schéma v1, toutes à zéro', () => {
    const s = defaultSave();
    expect(Object.keys(s).sort()).toEqual(SCHEMA_KEYS);
    expect(s.v).toBe(1);
    expect(s.money).toBe(0);
    expect(Object.keys(s.stats).sort()).toEqual([...STAT_KEYS].sort());
    expect(Object.values(s.stats).every((v) => v === 0)).toBe(true);
    expect(Object.keys(s.records).sort()).toEqual([...RECORD_KEYS].sort());
  });

  it('renvoie un nouvel objet à chaque appel', () => {
    const a = defaultSave();
    a.money = 5;
    a.stats.degats = 3;
    expect(defaultSave().money).toBe(0);
    expect(defaultSave().stats.degats).toBe(0);
  });

  it('la version de schéma correspond à save.json', () => {
    expect(SCHEMA_VERSION).toBe(params.save.schemaVersion);
    expect(STAT_KEYS).toHaveLength(9);
  });
});

describe('sanitize', () => {
  it('laisse une sauvegarde valide intacte, sans avertissement, dans de nouveaux objets', () => {
    const input = valid();
    const { save, warnings } = sanitize(input, params);
    expect(save).toEqual(input);
    expect(warnings).toEqual([]);
    expect(save).not.toBe(input);
    expect(save.stats).not.toBe(input.stats);
    expect(save.records).not.toBe(input.records);
  });

  it('accepte un objet gelé sans le modifier', () => {
    const input = deepFreeze(valid());
    expect(sanitize(input, params).save).toEqual(valid());
  });

  it.each(STAT_KEYS)('niveau de %s au-dessus du maximum : borné avec avertissement', (id) => {
    const input = valid();
    input.stats[id] = LEVEL_MAX[id] + 7;
    const { save, warnings } = sanitize(input, params);
    expect(save.stats[id]).toBe(LEVEL_MAX[id]);
    expect(warnings.some((w) => w.includes(id))).toBe(true);
  });

  it('les niveaux maximaux viennent de player-stats.json (dix pour sept statistiques, cinq pour chutes, dix pour reparation)', () => {
    expect(LEVEL_MAX).toEqual({ degats: 10, portee: 10, precision: 10, cadence: 10, vitesse: 10, vie: 10, regen: 10, chutes: 5, reparation: 10 });
  });

  it.each([[-5, 0], [1e308, MAX_MONEY], [MAX_MONEY + 1, MAX_MONEY], [MAX_MONEY, MAX_MONEY]])('solde %j devient %i', (money, out) => {
    expect(sanitize({ ...valid(), money }, params).save.money).toBe(out);
  });

  it('les flottants sont ramenés à leur partie entière avec un avertissement', () => {
    const { save, warnings } = sanitize({ ...valid(), money: 12.9, earned: 5.5 }, params);
    expect(save.money).toBe(12);
    expect(save.earned).toBe(5);
    expect(warnings.length).toBeGreaterThanOrEqual(2);
  });

  it('les nombres écrits en texte sont convertis avec un avertissement', () => {
    const { save, warnings } = sanitize({ ...valid(), money: '250', stats: { ...valid().stats, degats: ' 4 ' } }, params);
    expect(save.money).toBe(250);
    expect(save.stats.degats).toBe(4);
    expect(warnings.length).toBeGreaterThanOrEqual(2);
  });

  it.each(['abc', '1e3', '-5', '5.5', '', null, true, [], {}, NaN, Infinity, -Infinity])('valeur %j pour le solde : 0 (avertissement sauf pour une absence)', (money) => {
    expect(sanitize({ ...valid(), money }, params).save.money).toBe(0);
  });

  it('les clés absentes valent leur défaut sans avertissement', () => {
    const { save, warnings } = sanitize({ v: 1 }, params);
    expect(save).toEqual(defaultSave());
    expect(warnings).toEqual([]);
  });

  it('les clés inconnues sont ignorées avec un avertissement, à la racine, dans stats et dans records', () => {
    const input = { ...valid(), argent: 5, stats: { ...valid().stats, force: 9 }, records: { ...valid().records, score: 1 } };
    const { save, warnings } = sanitize(input, params);
    expect(Object.keys(save).sort()).toEqual(SCHEMA_KEYS);
    expect(save.stats.force).toBeUndefined();
    expect(save.records.score).toBeUndefined();
    expect(warnings.length).toBeGreaterThanOrEqual(3);
  });

  it('__proto__, constructor et prototype ne sont jamais lus ni recopiés ; Object.prototype reste intact', () => {
    const before = Object.getOwnPropertyNames(Object.prototype).sort();
    const hostile = JSON.parse('{"v":1,"money":5,"__proto__":{"polluted":true,"money":999},"constructor":{"prototype":{"polluted":true}},"prototype":{"x":1},"stats":{"__proto__":{"polluted":true},"degats":1,"constructor":9},"records":{"__proto__":{"polluted":true},"runs":2}}');
    const { save } = sanitize(hostile, params);
    expect(save.money).toBe(5);
    expect(save.stats.degats).toBe(1);
    expect(save.records.runs).toBe(2);
    expect({}.polluted).toBeUndefined();
    expect(Object.getOwnPropertyNames(Object.prototype).sort()).toEqual(before);
    expect(Object.hasOwn(save, 'constructor')).toBe(false);
    expect(Object.hasOwn(save, 'prototype')).toBe(false);
    expect(Object.getPrototypeOf(save)).toBe(Object.prototype);
  });

  it('une sauvegarde dont la clé money est héritée (pas propre) est ignorée', () => {
    const inherited = Object.create({ money: 777 });
    expect(sanitize(inherited, params).save.money).toBe(0);
  });

  it.each([[null], [undefined], [5], ['texte'], [[]], [[1, 2]], [true]])('racine non objet %j : sauvegarde par défaut avec avertissement', (raw) => {
    const { save, warnings } = sanitize(raw, params);
    expect(save).toEqual(defaultSave());
    expect(warnings).toHaveLength(1);
  });

  it('stats ou records qui ne sont pas des objets : défauts avec avertissement', () => {
    const { save, warnings } = sanitize({ v: 1, stats: [1, 2], records: 'x' }, params);
    expect(save.stats).toEqual(defaultSave().stats);
    expect(save.records).toEqual(defaultSave().records);
    expect(warnings.length).toBeGreaterThanOrEqual(2);
  });

  it('un très gros objet (100 000 clés) est traité sans exception et sans recopier les clés inconnues', () => {
    const big = { v: 1, money: 10 };
    for (let i = 0; i < 100_000; i += 1) big[`k${i}`] = i;
    const { save, warnings } = sanitize(big, params);
    expect(save.money).toBe(10);
    expect(Object.keys(save)).toHaveLength(7);
    expect(warnings.length).toBeLessThanOrEqual(20);
  });

  it('les avertissements sont bornés à 20 et ne recopient pas le texte hostile en entier', () => {
    const input = { v: 1 };
    for (let i = 0; i < 50; i += 1) input[`<script>${'x'.repeat(100)}${i}`] = 1;
    const { warnings } = sanitize(input, params);
    expect(warnings.length).toBeLessThanOrEqual(20);
    expect(warnings.every((w) => w.length < 80)).toBe(true);
  });

  it('est idempotent', () => {
    const once = sanitize({ ...valid(), money: '12', stats: { degats: 99 } }, params).save;
    expect(sanitize(once, params).save).toEqual(once);
  });

  it('sans paramètres, tout est borné à 0 sans exception', () => {
    const { save } = sanitize(valid(), null);
    expect(save.money).toBe(0);
    expect(Object.values(save.stats).every((v) => v === 0)).toBe(true);
  });

  it('les records et rev sont bornés à un entier sûr', () => {
    const { save } = sanitize({ v: 1, rev: 1e300, records: { bestWave: 1e300 } }, params);
    expect(save.rev).toBe(Number.MAX_SAFE_INTEGER);
    expect(save.records.bestWave).toBe(Number.MAX_SAFE_INTEGER);
  });
});

describe('migrate', () => {
  const synthetic = { 0: (old) => ({ v: 1, money: old.coins, stats: { degats: old.levels?.damage ?? 0 } }) };

  it('une sauvegarde v1 passe sans migration', () => {
    const r = migrate(valid(), params);
    expect(r.ok).toBe(true);
    expect(r.from).toBe(1);
    expect(r.save).toEqual(valid());
  });

  it('il n\'y a aucune migration réelle à ce jour (la version 1 est la première)', () => {
    expect(MIGRATIONS).toEqual({});
  });

  it('version 0 synthétique : { coins, levels } devient une v1 valide', () => {
    const r = migrate({ v: 0, coins: 42, levels: { damage: 3 } }, params, synthetic);
    expect(r.ok).toBe(true);
    expect(r.from).toBe(0);
    expect(r.save.v).toBe(1);
    expect(r.save.money).toBe(42);
    expect(r.save.stats.degats).toBe(3);
  });

  it('la sauvegarde migrée est nettoyée (bornes appliquées)', () => {
    const r = migrate({ v: 0, coins: 1e12, levels: { damage: 99 } }, params, synthetic);
    expect(r.save.money).toBe(MAX_MONEY);
    expect(r.save.stats.degats).toBe(10);
    expect(r.warnings.length).toBeGreaterThan(0);
  });

  it('chaîne de plusieurs migrations (0 → 1 → 2)', () => {
    const chain = { 0: () => ({ v: 1, money: 5 }), 1: (s) => ({ ...s, v: 2, earned: 9 }) };
    const r = migrate({ v: 0 }, params, chain, 2);
    expect(r.ok).toBe(true);
    expect(r.save.money).toBe(5);
    expect(r.save.earned).toBe(9);
  });

  it('une version supérieure est refusée (future-version), jamais migrée', () => {
    expect(migrate({ v: 2 }, params)).toEqual({ ok: false, error: 'future-version' });
    expect(migrate({ v: 99, money: 5 }, params)).toEqual({ ok: false, error: 'future-version' });
  });

  it.each([[{ v: 1.5 }], [{ v: -1 }], [{ v: '1' }], [{ v: null }], [{ v: NaN }], [{}], [{ money: 5 }]])('version invalide %j : bad-schema', (raw) => {
    expect(migrate(raw, params)).toEqual({ ok: false, error: 'bad-schema' });
  });

  it.each([[null], [5], ['x'], [[]], [undefined]])('entrée non objet %j : bad-schema', (raw) => {
    expect(migrate(raw, params)).toEqual({ ok: false, error: 'bad-schema' });
  });

  it('version sans migration disponible : bad-schema', () => {
    expect(migrate({ v: 0 }, params)).toEqual({ ok: false, error: 'bad-schema' });
  });

  it('une migration qui ne fait pas avancer la version, qui lève ou qui saute trop loin est refusée', () => {
    expect(migrate({ v: 0 }, params, { 0: (s) => s }).error).toBe('bad-schema');
    expect(migrate({ v: 0 }, params, { 0: () => { throw new Error('x'); } }).error).toBe('bad-schema');
    expect(migrate({ v: 0 }, params, { 0: () => ({ v: 5 }) }).error).toBe('bad-schema');
    expect(migrate({ v: 0 }, params, { 0: () => null }).error).toBe('bad-schema');
  });

  it('ne modifie pas l\'entrée gelée', () => {
    expect(migrate(deepFreeze({ v: 0, coins: 3 }), params, synthetic).save.money).toBe(3);
  });
});

describe('commitDelta', () => {
  it('applique une différence : rev + 1, savedAt, solde, total gagné, records', () => {
    const next = commitDelta(valid(), { money: 100, earned: 100, runs: 1, worlds: 1, bestWave: 20, bestKills: 90 }, 1_800_000_000_000, params);
    expect(next.rev).toBe(4);
    expect(next.savedAt).toBe(1_800_000_000_000);
    expect(next.money).toBe(1334);
    expect(next.earned).toBe(5778);
    expect(next.records).toEqual({ bestWave: 20, bestKills: 90, runs: 6, worldsCompleted: 2 });
    expect(next.stats).toEqual(valid().stats);
  });

  it('ne modifie pas la sauvegarde d\'origine (même gelée) et renvoie de nouveaux objets', () => {
    const input = deepFreeze(valid());
    const next = commitDelta(input, { money: 5 }, 10, params);
    expect(next).not.toBe(input);
    expect(next.stats).not.toBe(input.stats);
    expect(next.records).not.toBe(input.records);
    expect(input.money).toBe(1234);
  });

  it('les records prennent le maximum, jamais une valeur plus basse', () => {
    const next = commitDelta(valid(), { bestWave: 3, bestKills: 10 }, 1, params);
    expect(next.records.bestWave).toBe(12);
    expect(next.records.bestKills).toBe(80);
  });

  it('le solde ne dépasse jamais maxMoney et ne devient jamais négatif', () => {
    expect(commitDelta({ ...valid(), money: MAX_MONEY - 5 }, { money: 1000 }, 1, params).money).toBe(MAX_MONEY);
    expect(commitDelta(valid(), { money: -999_999 }, 1, params).money).toBe(0);
  });

  it('rev croît de 1 à chaque différence, même vide', () => {
    let s = defaultSave();
    for (let i = 1; i <= 10; i += 1) {
      s = commitDelta(s, {}, i, params);
      expect(s.rev).toBe(i);
    }
  });

  it.each([null, undefined, 5, 'x', [], { money: 'abc' }, { money: NaN }, { money: Infinity }, { money: 1.5 }, { earned: -5 }, { runs: -1 }, { worlds: 'x' }, { bestWave: -3 }, { bestKills: NaN }, { __proto__: { money: 99 } }])('différence hostile %j : ignorée, sans exception', (delta) => {
    const next = commitDelta(valid(), delta, 5, params);
    expect(next.money).toBe(1234);
    expect(next.earned).toBe(5678);
    expect(next.records).toEqual(valid().records);
    expect(next.rev).toBe(4);
  });

  it('un instant invalide garde le dernier savedAt', () => {
    expect(commitDelta(valid(), { money: 1 }, NaN, params).savedAt).toBe(valid().savedAt);
    expect(commitDelta(valid(), { money: 1 }, -5, params).savedAt).toBe(valid().savedAt);
  });

  it('nettoie une sauvegarde de départ invalide avant d\'appliquer la différence', () => {
    const next = commitDelta({ v: 1, money: 'x', stats: { degats: 99 } }, { money: 5 }, 1, params);
    expect(next.money).toBe(5);
    expect(next.stats.degats).toBe(10);
  });

  it('composer deux différences revient à appliquer leur somme (solde, total gagné, parties, mondes)', () => {
    let rng = createRng(2024);
    const pick = (max) => {
      const r = nextInt(rng, max);
      rng = r.rng;
      return r.value;
    };
    for (let i = 0; i < 200; i += 1) {
      const base = { ...valid(), money: pick(100_000), earned: pick(1_000_000) };
      const a = { money: pick(5000), earned: pick(5000), runs: pick(3), worlds: pick(2) };
      const b = { money: pick(5000), earned: pick(5000), runs: pick(3), worlds: pick(2) };
      const sum = { money: a.money + b.money, earned: a.earned + b.earned, runs: a.runs + b.runs, worlds: a.worlds + b.worlds };
      const two = commitDelta(commitDelta(base, a, 1, params), b, 2, params);
      const one = commitDelta(base, sum, 2, params);
      expect(two.money).toBe(one.money);
      expect(two.earned).toBe(one.earned);
      expect(two.records.runs).toBe(one.records.runs);
      expect(two.records.worldsCompleted).toBe(one.records.worldsCompleted);
    }
  });

  it('pour les records, deux différences donnent le maximum des deux', () => {
    let rng = createRng(77);
    for (let i = 0; i < 100; i += 1) {
      const r1 = nextInt(rng, 100);
      const r2 = nextInt(r1.rng, 100);
      rng = r2.rng;
      const out = commitDelta(commitDelta(defaultSave(), { bestWave: r1.value }, 1, params), { bestWave: r2.value }, 2, params);
      expect(out.records.bestWave).toBe(Math.max(r1.value, r2.value));
    }
  });

  it('l\'ordre des deux différences ne change pas le résultat', () => {
    const a = { money: 50, earned: 50, bestWave: 4, runs: 1 };
    const b = { money: 70, earned: 70, bestWave: 9, bestKills: 33 };
    const ab = commitDelta(commitDelta(valid(), a, 1, params), b, 2, params);
    const ba = commitDelta(commitDelta(valid(), b, 1, params), a, 2, params);
    expect({ ...ab, rev: 0, savedAt: 0 }).toEqual({ ...ba, rev: 0, savedAt: 0 });
  });
});

describe('codec ZS1', () => {
  const code = encodeSave(valid(), params);
  const [prefix, body, checksum] = code.split('.');
  const rebuild = (b, c = null) => `${prefix}.${b}.${c ?? crc32(b).toString(16).padStart(8, '0')}`;

  it('a la forme ZS1.<base64url>.<8 chiffres hexadécimaux>', () => {
    expect(code).toMatch(/^ZS1\.[A-Za-z0-9_-]+\.[0-9a-f]{8}$/);
    expect(code.length).toBeLessThanOrEqual(params.save.maxCodeLength);
  });

  it('crc32 : vecteur de référence « 123456789 » = cbf43926', () => {
    expect(crc32('123456789').toString(16)).toBe('cbf43926');
    expect(crc32('')).toBe(0);
  });

  it('base64url : aller-retour sur toutes les longueurs de 0 à 40 octets', () => {
    for (let n = 0; n <= 40; n += 1) {
      const bytes = Uint8Array.from({ length: n }, (_, i) => (i * 37 + 11) & 255);
      expect(fromBase64Url(toBase64Url(bytes))).toEqual(bytes);
    }
    expect(fromBase64Url('A')).toBeNull();
    expect(fromBase64Url('ab+/')).toBeNull();
    expect(fromBase64Url('ab==')).toBeNull();
  });

  it('le corps est le JSON compact encodé en base64url (UTF-8) sans remplissage', () => {
    expect(body).not.toContain('=');
    const json = new TextDecoder().decode(fromBase64Url(body));
    expect(json.startsWith('{"v":1,"rev":3,')).toBe(true);
    expect(json).not.toContain(' ');
  });

  it('aller-retour exact sur 2 000 sauvegardes générées par une graine fixe', () => {
    let rng = createRng(31337);
    const draw = (max) => {
      const r = nextInt(rng, max);
      rng = r.rng;
      return r.value;
    };
    for (let i = 0; i < 2000; i += 1) {
      const save = {
        v: 1, rev: draw(1_000_000), savedAt: draw(2_000_000_000_000), money: draw(MAX_MONEY + 1), earned: draw(1_000_000_000),
        stats: Object.fromEntries(STAT_KEYS.map((id) => [id, draw(LEVEL_MAX[id] + 1)])),
        records: { bestWave: draw(500), bestKills: draw(100_000), runs: draw(5000), worldsCompleted: draw(50) },
      };
      const decoded = decodeSave(encodeSave(save, params), params);
      expect(decoded.ok).toBe(true);
      expect(decoded.save).toEqual(save);
      expect(decoded.warnings).toEqual([]);
    }
  });

  it('le code est déterministe', () => {
    expect(encodeSave(valid(), params)).toBe(encodeSave(valid(), params));
  });

  it('encodeSave nettoie : une sauvegarde hostile donne un code valide du schéma exact', () => {
    const hostile = { ...valid(), money: 1e30, extra: 'x', stats: { ...valid().stats, force: 9 } };
    const decoded = decodeSave(encodeSave(hostile, params), params);
    expect(decoded.ok).toBe(true);
    expect(decoded.save.money).toBe(MAX_MONEY);
    expect(Object.keys(decoded.save).sort()).toEqual(SCHEMA_KEYS);
  });

  it('la sauvegarde la plus grande possible tient dans maxCodeLength', () => {
    const max = {
      v: 1, rev: Number.MAX_SAFE_INTEGER, savedAt: Number.MAX_SAFE_INTEGER, money: MAX_MONEY, earned: Number.MAX_SAFE_INTEGER,
      stats: LEVEL_MAX, records: { bestWave: Number.MAX_SAFE_INTEGER, bestKills: Number.MAX_SAFE_INTEGER, runs: Number.MAX_SAFE_INTEGER, worldsCompleted: Number.MAX_SAFE_INTEGER },
    };
    const text = encodeSave(max, params);
    expect(text.length).toBeLessThanOrEqual(params.save.maxCodeLength);
    expect(decodeSave(text, params).save).toEqual(max);
  });

  it('refuse toute substitution d\'un seul caractère, à toutes les positions (préfixe, corps, somme de contrôle)', () => {
    const alphabet = `ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_.=+/"' ${String.fromCharCode(0xa0)}${String.fromCharCode(0x200b)}`;
    let tried = 0;
    for (let i = 0; i < code.length; i += 1) {
      for (const c of alphabet) {
        if (c === code[i]) continue;
        const changed = code.slice(0, i) + c + code.slice(i + 1);
        tried += 1;
        const r = decodeSave(changed, params);
        // Une substitution par une espace est une suppression (les espaces sont tolérées) : le code raccourci doit alors lui aussi être refusé.
        expect(r.ok, `position ${i} → « ${c} »`).toBe(false);
      }
    }
    expect(tried).toBeGreaterThan(code.length * 60);
  });

  it('refuse la suppression ou l\'insertion d\'un caractère du corps', () => {
    for (let i = 0; i < body.length; i += 7) {
      expect(decodeSave(rebuild(body.slice(0, i) + body.slice(i + 1), checksum), params).ok).toBe(false);
      expect(decodeSave(rebuild(body.slice(0, i) + 'A' + body.slice(i), checksum), params).ok).toBe(false);
    }
  });

  it.each([5, 20, 60, 120, 200, 250])('code tronqué à %i caractères : refusé', (n) => {
    expect(decodeSave(code.slice(0, n), params).ok).toBe(false);
  });

  it('code tronqué d\'un caractère à la fin : refusé', () => {
    expect(decodeSave(code.slice(0, -1), params).ok).toBe(false);
  });

  it.each(['A', '0', '.', 'ZS1', '=='])('texte ajouté à la fin (« %s ») : refusé', (extra) => {
    expect(decodeSave(code + extra, params).ok).toBe(false);
  });

  it('codes d\'erreur : vide', () => {
    for (const t of ['', '   ', '\n\n', null, undefined]) expect(decodeSave(t, params)).toEqual({ ok: false, error: 'empty' });
  });

  it('codes d\'erreur : trop long (plus de maxCodeLength caractères)', () => {
    const limit = params.save.maxCodeLength;
    expect(decodeSave(`ZS1.${'A'.repeat(limit - 3)}`, params)).toEqual({ ok: false, error: 'too-long' });
    expect(decodeSave('A'.repeat(limit + 1), params)).toEqual({ ok: false, error: 'too-long' });
    expect(decodeSave('A'.repeat(1_000_000), params)).toEqual({ ok: false, error: 'too-long' });
    expect(decodeSave('A'.repeat(limit), params).error).toBe('bad-prefix');
  });

  it.each(['zs1', 'ZS2', 'ZS', 'XYZ', 'ZS1x', '"ZS1', 'ZS1_'])('préfixe « %s » : bad-prefix', (p) => {
    expect(decodeSave(`${p}.${body}.${checksum}`, params)).toEqual({ ok: false, error: 'bad-prefix' });
  });

  it('guillemets autour du code : refusé', () => {
    expect(decodeSave(`"${code}"`, params).ok).toBe(false);
    expect(decodeSave(`'${code}'`, params).ok).toBe(false);
  });

  it.each([['ZS1', 'bad-format'], ['ZS1.', 'bad-format'], ['ZS1.abc', 'bad-format'], ['ZS1..', 'bad-format'], ['ZS1.abc.', 'bad-format'], ['ZS1.abc.def.ghi', 'bad-format'], ['ZS1.abc.1234567', 'bad-format'], ['ZS1.abc.1234567G', 'bad-format'], ['ZS1.abc.ABCDEF12', 'bad-format']])('séparateurs ou somme mal formés « %s » : %s', (text, error) => {
    expect(decodeSave(text, params)).toEqual({ ok: false, error });
  });

  it('base64 invalide : caractères interdits ou longueur impossible', () => {
    expect(decodeSave('ZS1.@@@@.00000000', params)).toEqual({ ok: false, error: 'bad-base64' });
    expect(decodeSave('ZS1.ab+/.00000000', params)).toEqual({ ok: false, error: 'bad-base64' });
    expect(decodeSave('ZS1.abcde.00000000', params)).toEqual({ ok: false, error: 'bad-base64' });
    expect(decodeSave(rebuild('A'), params)).toEqual({ ok: false, error: 'bad-base64' });
  });

  it('somme de contrôle fausse : bad-checksum', () => {
    expect(decodeSave(`ZS1.${body}.00000000`, params)).toEqual({ ok: false, error: 'bad-checksum' });
    expect(decodeSave(`ZS1.${body}.${checksum.replace(/./, (c) => (c === '0' ? '1' : '0'))}`, params)).toEqual({ ok: false, error: 'bad-checksum' });
  });

  it('JSON invalide : bad-json (y compris des octets qui ne sont pas de l\'UTF-8)', () => {
    const enc = (text) => rebuild(toBase64Url(new TextEncoder().encode(text)));
    expect(decodeSave(enc('{bad'), params)).toEqual({ ok: false, error: 'bad-json' });
    expect(decodeSave(enc(''), params)).toEqual({ ok: false, error: 'bad-format' });
    expect(decodeSave(rebuild(toBase64Url(Uint8Array.from([0xff, 0xfe, 0xfd]))), params)).toEqual({ ok: false, error: 'bad-json' });
  });

  it('schéma invalide : bad-schema (JSON valide qui n\'est pas une sauvegarde)', () => {
    const enc = (value) => rebuild(toBase64Url(new TextEncoder().encode(JSON.stringify(value))));
    for (const v of [5, 'x', null, [1], {}, { money: 5 }, { v: 'a' }, { v: 1.5 }]) expect(decodeSave(enc(v), params)).toEqual({ ok: false, error: 'bad-schema' });
  });

  it('version future : future-version (jamais importée)', () => {
    const enc = (value) => rebuild(toBase64Url(new TextEncoder().encode(JSON.stringify(value))));
    expect(decodeSave(enc({ v: 2, money: 5 }), params)).toEqual({ ok: false, error: 'future-version' });
  });

  it('un code valide mais hors bornes est accepté avec des avertissements (valeurs bornées)', () => {
    const enc = (value) => rebuild(toBase64Url(new TextEncoder().encode(JSON.stringify(value))));
    const r = decodeSave(enc({ v: 1, money: 1e12, stats: { degats: 99 } }), params);
    expect(r.ok).toBe(true);
    expect(r.save.money).toBe(MAX_MONEY);
    expect(r.save.stats.degats).toBe(10);
    expect(r.warnings.length).toBeGreaterThan(0);
  });

  it.each([
    ['espaces avant et après', (c) => `   ${c}   `],
    ['retours à la ligne tous les 40 caractères', (c) => c.replace(/(.{40})/g, '$1\n')],
    ['retours chariot et tabulations', (c) => c.replace(/(.{25})/g, '$1\r\n\t')],
    ['espace insécable', (c) => c.replace(/(.{30})/g, `$1${String.fromCharCode(0xa0)}`)],
    ['espace fine insécable', (c) => c.replace(/(.{30})/g, `$1${String.fromCharCode(0x202f)}`)],
    ['espace de largeur nulle', (c) => c.replace(/(.{20})/g, `$1${String.fromCharCode(0x200b)}`)],
    ['marque de largeur nulle et BOM', (c) => `${String.fromCharCode(0xfeff)}${c.replace(/(.{20})/g, `$1${String.fromCharCode(0x200d)}`)}${String.fromCharCode(0x2060)}`],
    ['trait d\'union conditionnel', (c) => c.replace(/(.{15})/g, `$1${String.fromCharCode(0xad)}`)],
    ['séparateur de ligne Unicode', (c) => `${c.slice(0, 50)}${String.fromCharCode(0x2028)}${c.slice(50)}`],
  ])('tolère : %s', (_name, mutate) => {
    const r = decodeSave(mutate(code), params);
    expect(r.ok).toBe(true);
    expect(r.save).toEqual(valid());
  });

  it('ne lève jamais, quelle que soit l\'entrée', () => {
    for (const bad of [{}, [], 42, true, Symbol.iterator.toString(), '\u0000'.repeat(10), 'ZS1.\ud800.1']) expect(() => decodeSave(bad, params)).not.toThrow();
    expect(decodeSave({}, params).ok).toBe(false);
  });

  it('sans paramètres : refuse tout (aucune longueur permise)', () => {
    expect(decodeSave(code, null).ok).toBe(false);
  });

  it('les codes d\'erreur sont exactement les neuf attendus', () => {
    expect(ERROR_CODES).toEqual(['empty', 'too-long', 'bad-prefix', 'bad-format', 'bad-base64', 'bad-checksum', 'bad-json', 'bad-schema', 'future-version']);
  });
});

describe('describeSave', () => {
  it('résume le solde, le total gagné, la somme des niveaux et les records', () => {
    expect(describeSave(valid())).toEqual({ money: 1234, earned: 5678, levelsSum: 16, records: { bestWave: 12, bestKills: 80, runs: 5, worldsCompleted: 1 } });
  });

  it('la sauvegarde par défaut donne des zéros', () => {
    expect(describeSave(defaultSave())).toEqual({ money: 0, earned: 0, levelsSum: 0, records: { bestWave: 0, bestKills: 0, runs: 0, worldsCompleted: 0 } });
  });

  it.each([null, undefined, 5, 'x', [], { money: 'x', stats: 3, records: null }])('entrée hostile %j : zéros, sans exception', (bad) => {
    expect(describeSave(bad).money).toBe(0);
    expect(describeSave(bad).levelsSum).toBe(0);
  });

  it('ne modifie pas son argument', () => {
    expect(describeSave(deepFreeze(valid())).money).toBe(1234);
  });
});

describe('readOnlyMode', () => {
  it.each(params.save.readOnlyParams)('?%s=… met la sauvegarde en lecture seule', (name) => {
    expect(readOnlyMode(`?${name}=3`, params)).toEqual({ readOnly: true, reasons: [name] });
    expect(readOnlyMode(`${name}=3`, params)).toEqual({ readOnly: true, reasons: [name] });
  });

  it('?test=1 seul ne met pas en lecture seule', () => {
    expect(readOnlyMode('?test=1', params)).toEqual({ readOnly: false, reasons: [] });
  });

  it('les paramètres d\'affichage et de diagnostic ne la déclenchent pas', () => {
    expect(readOnlyMode('?tilt=60&vhs=0&labels=1&fps=1&zoom=1&dpr=1&shadows=0&seed=4&store=local&test=1', params).readOnly).toBe(false);
  });

  it('plusieurs paramètres : toutes les raisons, dans l\'ordre de la liste', () => {
    expect(readOnlyMode('?floor=1&wave=5&test=1&lvl=all:5', params)).toEqual({ readOnly: true, reasons: ['wave', 'lvl', 'floor'] });
  });

  it.each(['?wave=', '?wave', '?wave=%20', '?lvl=&map=', '', '?', 'wave', '?WAVE=5', '?waves=5', '?xwave=5'])('valeur vide ou nom différent « %s » : pas de lecture seule', (search) => {
    expect(readOnlyMode(search, params).readOnly).toBe(false);
  });

  it('une valeur invalide (?wave=abc) déclenche quand même la lecture seule (jamais d\'écriture par prudence)', () => {
    expect(readOnlyMode('?wave=abc', params).readOnly).toBe(true);
  });

  it('chaîne énorme ou caractères hostiles : pas d\'exception', () => {
    expect(readOnlyMode(`?${'a=b&'.repeat(200_000)}wave=2`, params).readOnly).toBe(true);
    for (const bad of ['?%E0%A4%A', '?%ZZ=1', '?\u0000=1', '?wave=%00', '?&&&==&', '?__proto__=1&wave=1', '?constructor=1']) expect(() => readOnlyMode(bad, params)).not.toThrow();
  });

  it.each([null, undefined, 5, {}, []])('entrée %j : pas de lecture seule, sans exception', (bad) => {
    expect(readOnlyMode(bad, params)).toEqual({ readOnly: false, reasons: [] });
  });

  it('sans paramètres de données : pas de lecture seule', () => {
    expect(readOnlyMode('?wave=5', null)).toEqual({ readOnly: false, reasons: [] });
  });
});

describe('parseMoneyParam', () => {
  it.each([['?money=0', 0], ['?money=500', 500], ['money=500', 500], ['?money=9999999', 9_999_999], ['?money=007', 7], ['?a=1&money=42&b=2', 42]])('%s → %j', (search, n) => {
    expect(parseMoneyParam(search, params)).toBe(n);
  });

  it.each(['?money=10000000', '?money=1.5', '?money=-5', '?money=abc', '?money=', '?money', '?money=1e3', '?money=+5', '?money=0x10', '?money=%205', '?money=99999999999999999', '', '?wave=5', '?money=5%2C0'])('« %s » → null', (search) => {
    expect(parseMoneyParam(search, params)).toBeNull();
  });

  it.each([null, undefined, 5, {}])('entrée %j → null', (bad) => {
    expect(parseMoneyParam(bad, params)).toBeNull();
  });

  it('chaîne énorme ou hostile : null sans exception', () => {
    expect(parseMoneyParam(`?money=${'9'.repeat(1_000_000)}`, params)).toBeNull();
    expect(parseMoneyParam('?money=%E0%A4%A', params)).toBeNull();
  });
});
