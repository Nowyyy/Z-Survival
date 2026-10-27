import { describe, it, expect } from 'vitest';
import { createDirector, info, setParams, startWave, stepDirector } from '../../js/core/wave-director.js';
import { waveSpec } from '../../js/core/waves.js';
import { isHidden } from '../../js/core/spawner.js';
import { params, points, simulate } from './helpers/sim-vagues.js';

const fresh = (opts) => createDirector(params, { seed: 1, ...opts });
const step = (d, input) => stepDirector(d, { dt: 0.05, alive: 0, view: null, points, ...input });
const run = (d, seconds, input = {}) => {
  let s = d;
  const requests = [];
  const events = [];
  for (let i = 0; i < Math.round(seconds / 0.05); i += 1) {
    const out = step(s, input);
    s = out.state;
    requests.push(...out.requests);
    events.push(...out.events);
  }
  return { s, requests, events };
};

describe('wave-director : machine à états', () => {
  it('démarre en attente de la vague 1, 3 s avant', () => {
    const i = info(fresh());
    expect([i.phase, i.wave, i.level, i.total, i.waitLeft, i.active]).toEqual(['attente', 1, 1, 5, 3, true]);
  });

  it('le compte à rebours diminue avec le temps de jeu', () => {
    const s = run(fresh(), 1).s;
    expect(info(s).waitLeft).toBeCloseTo(2, 6);
    expect(info(s).phase).toBe('attente');
  });

  it('dt à 0 (pause) : le compte à rebours ne bouge pas, aucune apparition', () => {
    const out = run(fresh(), 5, { dt: 0 });
    expect(info(out.s).waitLeft).toBe(3);
    expect(out.requests).toEqual([]);
  });

  it('à la fin du compte à rebours : apparition, événement waveStart, première demande aussitôt', () => {
    const out = run(fresh(), 3.1);
    expect(info(out.s).phase).toBe('apparition');
    expect(out.events).toEqual([{ type: 'waveStart', wave: 1, level: 1, reinforced: false }]);
    expect(out.requests).toHaveLength(1);
  });

  it('passe en combat quand tout est apparu, puis en terminee quand tout est mort', () => {
    const r = simulate({ seconds: 60, life: 2, stopWhen: (d) => info(d).phase === 'terminee' });
    expect(r.ends).toHaveLength(1);
    expect(r.ends[0]).toMatchObject({ type: 'waveEnd', wave: 1, healFraction: 1 });
  });

  it('terminee dure un appel, puis attente de la vague 2 (8 s)', () => {
    const r = simulate({ seconds: 60, life: 2, stopWhen: (d) => info(d).phase === 'terminee' });
    expect(info(r.director).phase).toBe('terminee');
    const out = step(r.director, {});
    expect(info(out.state)).toMatchObject({ phase: 'attente', wave: 2 });
    expect(info(out.state).waitLeft).toBeCloseTo(8 - 0.05, 9);
  });

  it('le soin demandé est celui de waves.json', () => {
    const r = simulate({ seconds: 60, life: 2, stopWhen: (d) => info(d).phase === 'terminee' });
    expect(r.ends[0].healFraction).toBe(params.healFraction);
  });

  it('inactif : aucune apparition, aucun événement, phase inchangée', () => {
    const d = fresh({ inactive: true });
    const out = run(d, 30, { alive: 0 });
    expect(out.requests).toEqual([]);
    expect(out.events).toEqual([]);
    expect(info(out.s)).toMatchObject({ active: false, phase: 'inactif', wave: 0, remaining: 0 });
    expect(info(startWave(d, 5)).phase).toBe('inactif');
  });

  it('?wave=N : démarre à la vague N (attente de 3 s), niveau et total de cette vague', () => {
    const d = fresh({ wave: 12 });
    expect(info(d)).toMatchObject({ phase: 'attente', wave: 12, level: 3, total: waveSpec(12, params).total, waitLeft: 3 });
  });

  it('startWave saute à la vague demandée', () => {
    const d = startWave(run(fresh(), 10).s, 30);
    expect(info(d)).toMatchObject({ phase: 'attente', wave: 30, toSpawn: waveSpec(30, params).total, waitLeft: 3 });
  });

  it('startWave : vague invalide ramenée à 1', () => {
    expect(info(startWave(fresh(), -4)).wave).toBe(1);
    expect(info(startWave(fresh(), NaN)).wave).toBe(1);
  });

  it('redémarrer = nouveau directeur : vague 1, attente de 3 s, plus rien d\'apparu', () => {
    const d = fresh();
    expect(info(d)).toMatchObject({ wave: 1, toSpawn: 5, alive: 0, waitLeft: 3 });
  });

  it('restants = à faire apparaître + vivants', () => {
    const out = run(fresh(), 3.1, { alive: 0 });
    const i = info(step(out.s, { alive: 3 }).state);
    expect(i.remaining).toBe(i.toSpawn + 3);
  });
});

describe('wave-director : apparitions', () => {
  it('exactement `total` apparitions par vague, de la bonne composition', () => {
    for (const wave of [1, 2, 5, 9, 15]) {
      const r = simulate({ director: fresh({ wave }), seconds: 400, life: 3, stopWhen: (d) => info(d).wave === wave + 1 });
      const own = r.spawns.filter((s) => s.wave === wave);
      expect(own, `vague ${wave}`).toHaveLength(waveSpec(wave, params).total);
    }
  });

  it('les types et allures demandés viennent de la liste ordonnée de la vague (composition respectée)', () => {
    const wave = 8;
    const spec = waveSpec(wave, params);
    const r = simulate({ director: fresh({ wave }), seconds: 400, life: 3, stopWhen: (d) => info(d).wave === wave + 1 });
    const own = r.spawns.filter((s) => s.wave === wave);
    for (const t of Object.keys(spec.composition)) expect(own.filter((s) => s.type === t).length).toBe(spec.composition[t]);
    for (const g of Object.keys(spec.gaitCounts)) expect(own.filter((s) => s.gait === g).length).toBe(spec.gaitCounts[g]);
  });

  it('jamais deux apparitions à moins de spawnInterval', () => {
    for (const wave of [1, 6, 14, 30]) {
      const r = simulate({ director: fresh({ wave }), seconds: 300, life: 1, stopWhen: (d) => info(d).wave === wave + 1 });
      const own = r.spawns.filter((s) => s.wave === wave);
      const gap = waveSpec(wave, params).spawnInterval;
      for (let i = 1; i < own.length; i += 1) expect(own[i].time - own[i - 1].time, `${wave}#${i}`).toBeGreaterThanOrEqual(gap - 1e-9);
    }
  });

  it('la première apparition de la vague a lieu à la fin de l\'attente', () => {
    const r = simulate({ seconds: 10, life: 100 });
    expect(r.spawns[0].time).toBeCloseTo(3.05, 6);
  });

  it('jamais plus de maxConcurrent vivants (zombies qui ne meurent pas)', () => {
    for (const wave of [1, 4, 9, 20]) {
      const r = simulate({ director: fresh({ wave }), seconds: 200, life: 1e9 });
      expect(r.alive).toBeLessThanOrEqual(waveSpec(wave, params).maxConcurrent);
      expect(r.alive).toBe(Math.min(waveSpec(wave, params).maxConcurrent, waveSpec(wave, params).total));
    }
  });

  it('avec des vivants au maximum, aucune demande', () => {
    const d = run(fresh(), 3.1).s;
    const out = step(d, { alive: 6 });
    expect(out.requests).toEqual([]);
  });

  it('l\'apparition attend quand tous les points sont en vue, puis reprend', () => {
    const everything = { minX: -1e5, minY: -1e5, maxX: 1e5, maxY: 1e5 };
    let d = run(fresh(), 3.1, { view: everything }).s;
    expect(info(d).toSpawn).toBe(5);
    const waiting = run(d, 10, { view: everything });
    expect(waiting.requests).toEqual([]);
    d = waiting.s;
    const out = step(d, { view: null });
    expect(out.requests).toHaveLength(1);
  });

  it('chaque apparition est hors de la vue (agrandie)', () => {
    const view = { minX: 1000, minY: 0, maxX: 2600, maxY: 1000 };
    const r = simulate({ director: fresh({ wave: 3 }), seconds: 200, life: 2, view, stopWhen: (d) => info(d).wave === 4 });
    expect(r.spawns.length).toBeGreaterThan(0);
    for (const s of r.spawns) expect(isHidden(s, view, params.spawn.viewMargin, params.spawn.viewRatio)).toBe(true);
  });

  it('les points d\'apparition sont ceux passés en argument', () => {
    const only = [{ id: 'a', x: 10, y: 20, fenetre: 'f' }];
    const r = simulate({ seconds: 30, life: 100, pts: only });
    expect(r.spawns.length).toBeGreaterThan(0);
    for (const s of r.spawns) expect([s.pointId, s.x, s.y]).toEqual(['a', 10, 20]);
    const other = simulate({ seconds: 30, life: 100, pts: [{ id: 'b', x: 1, y: 2 }] });
    for (const s of other.spawns) expect(s.pointId).toBe('b');
  });

  it('sans point d\'apparition, la vague attend sans erreur', () => {
    const r = simulate({ seconds: 20, life: 3, pts: [] });
    expect(r.spawns).toEqual([]);
    expect(info(r.director).phase).toBe('apparition');
  });

  it('la demande porte l\'identifiant du point, sa fenêtre, le type et l\'allure', () => {
    const out = run(fresh(), 3.1);
    expect(out.requests[0]).toMatchObject({ pointId: expect.any(String), x: expect.any(Number), y: expect.any(Number), type: 'marcheur' });
    expect(['lent', 'marche']).toContain(out.requests[0].gait);
  });

  it('au plus une demande par appel, même avec un très grand dt', () => {
    const out = stepDirector(fresh(), { dt: 1e9, alive: 0, points });
    expect(out.requests.length).toBeLessThanOrEqual(1);
  });
});

describe('wave-director : fin de vague', () => {
  it('la vague ne se termine pas tant que tout n\'est pas apparu', () => {
    const r = simulate({ seconds: 8, life: 0.01 });
    expect(r.ends).toEqual([]);
  });

  it('la vague ne se termine pas tant qu\'il reste un vivant', () => {
    const d = fresh();
    const r = simulate({ director: d, seconds: 120, life: 1e9 });
    expect(r.ends).toEqual([]);
    expect(info(r.director).phase).toBe('combat');
  });

  it('un seul événement waveEnd par vague, avec un seul appel en phase terminee', () => {
    const r = simulate({ seconds: 200, life: 4 });
    const waves = r.ends.map((e) => e.wave);
    expect(new Set(waves).size).toBe(waves.length);
    expect(waves[0]).toBe(1);
  });

  it('un zombie qui meurt à l\'instant même du dernier spawn ne termine pas la vague trop tôt', () => {
    const d = { ...fresh({ wave: 1 }) };
    let s = run(d, 3.1).s;
    s = { ...s, spawned: s.spec.total - 1, sinceSpawn: 10, phase: 'apparition' };
    const out = step(s, { alive: 0 });
    expect(out.requests).toHaveLength(1);
    expect(out.events.find((e) => e.type === 'waveEnd')).toBeUndefined();
  });
});

describe('wave-director : simulations longues', () => {
  const long = simulate({ seconds: 6000, life: 6, stopWhen: (d) => info(d).wave === 41 });

  it('40 vagues se terminent toutes, sans blocage', () => {
    expect(info(long.director).wave).toBe(41);
    expect(long.ends.map((e) => e.wave)).toEqual(Array.from({ length: 40 }, (_, i) => i + 1));
  });

  it('la durée de chaque vague est bornée', () => {
    const starts = long.starts.map((e) => e.time);
    const ends = long.ends.map((e) => e.time);
    ends.forEach((end, i) => {
      const spec = waveSpec(i + 1, params);
      const bound = (spec.total + spec.maxConcurrent) * Math.max(spec.spawnInterval, 6) + 10;
      expect(end - starts[i], `vague ${i + 1}`).toBeGreaterThan(0);
      expect(end - starts[i], `vague ${i + 1}`).toBeLessThanOrEqual(bound);
    });
  });

  it('jamais plus de maxConcurrent vivants pendant les 40 vagues', () => {
    for (const [wave, max] of Object.entries(long.maxAliveByWave)) expect(max).toBeLessThanOrEqual(waveSpec(Number(wave), params).maxConcurrent);
  });

  it('exactement `total` apparitions pour chacune des 40 vagues', () => {
    for (let n = 1; n <= 40; n += 1) expect(long.spawns.filter((s) => s.wave === n), `vague ${n}`).toHaveLength(waveSpec(n, params).total);
  });

  it('entre deux vagues, l\'attente dure 8 s de temps de jeu', () => {
    for (let i = 1; i < 40; i += 1) expect(long.starts[i].time - long.ends[i - 1].time).toBeGreaterThanOrEqual(8 - 1e-6);
  });

  it('déterminisme par graine : mêmes demandes, autre graine = autre ordre', () => {
    const a = simulate({ director: fresh({ wave: 10 }), seconds: 100, life: 5 });
    const b = simulate({ director: fresh({ wave: 10 }), seconds: 100, life: 5 });
    const c = simulate({ director: createDirector(params, { seed: 99, wave: 10 }), seconds: 100, life: 5 });
    expect(a.spawns).toEqual(b.spawns);
    expect(c.spawns.map((s) => s.type + s.gait + s.pointId)).not.toEqual(a.spawns.map((s) => s.type + s.gait + s.pointId));
  });
});

describe('wave-director : paramètres, arguments gelés, entrées hostiles', () => {
  it('setParams recalcule la vague courante (test rapide) sans perdre la progression', () => {
    const faster = { ...params, total: { ...params.total, base: 2, linear: 0, quadratic: 0 } };
    const s = setParams(run(fresh(), 3.1).s, faster);
    expect(info(s).total).toBe(2);
    expect(info(s).toSpawn).toBeLessThanOrEqual(2);
  });

  it('ne modifie pas l\'état ni l\'entrée (arguments gelés)', () => {
    const d = fresh();
    const frozen = Object.freeze({ ...d });
    const input = Object.freeze({ dt: 0.05, alive: 1, view: Object.freeze({ minX: 0, minY: 0, maxX: 1, maxY: 1 }), points: Object.freeze(points.map((p) => Object.freeze({ ...p }))) });
    const before = JSON.stringify(frozen);
    expect(() => stepDirector(frozen, input)).not.toThrow();
    expect(JSON.stringify(frozen)).toBe(before);
  });

  it.each([null, undefined, 'x', 42, [], {}, NaN])('état hostile %s : sans exception, inactif', (state) => {
    const out = stepDirector(state, { dt: 0.05, alive: 0, points });
    expect(out.requests).toEqual([]);
    expect(info(out.state).active).toBe(false);
  });

  it.each([null, undefined, 'x', 42, [], {}, NaN])('entrée hostile %s : sans exception', (input) => {
    expect(() => stepDirector(fresh(), input)).not.toThrow();
    expect(() => info(stepDirector(fresh(), input).state)).not.toThrow();
  });

  it.each([-1, -1e9, NaN, Infinity, 'x', null, 1e9])('dt %s : sans exception, état cohérent', (dt) => {
    const out = stepDirector(fresh(), { dt, alive: 0, points });
    expect(out.requests.length).toBeLessThanOrEqual(1);
    expect(info(out.state).waitLeft).toBeGreaterThanOrEqual(0);
  });

  it.each([NaN, -3, 'x', null, 2.7, Infinity])('nombre de vivants %s : sans exception', (alive) => {
    expect(() => stepDirector(fresh(), { dt: 0.05, alive, points })).not.toThrow();
  });

  it('points et vue hostiles : sans exception', () => {
    expect(() => stepDirector(fresh(), { dt: 5, alive: 0, points: 'x', view: 'y' })).not.toThrow();
    expect(() => stepDirector(fresh(), { dt: 5, alive: 0, points: [null, 3, {}], view: { minX: NaN } })).not.toThrow();
  });

  it('paramètres hostiles à la création : sans exception', () => {
    for (const p of [null, undefined, 'x', 3, [], {}]) expect(() => stepDirector(createDirector(p, { seed: NaN, wave: 'a' }), { dt: 1, alive: 0, points })).not.toThrow();
  });
});
