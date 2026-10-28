import { describe, it, expect } from 'vitest';
import { closedRects, createWindowsState, isOpen, maxPlanksOf, planksSummary, queuePosition, stepWindows, windowGeometries, windowGeometry } from '../../js/core/windows.js';
import { windowsWithGaps } from '../../js/core/layout.js';
import { deepFreeze, layout, load, WEIRD } from './helpers/monde.js';

const cfg = load('windows');
const enemies = load('enemies');
const geoms = windowGeometries(windowsWithGaps(layout), cfg);
const north = geoms.find((g) => g.id === 'fenetre-nord');
const fresh = (planks) => createWindowsState(geoms, cfg, planks === undefined ? undefined : { planks });
const run = (state, input, seconds, dt = 0.05) => {
  let s = state;
  const events = [];
  for (let i = 0; i < Math.round(seconds / dt); i += 1) {
    const out = stepWindows(s, input, dt, cfg);
    s = out.state;
    events.push(...out.events);
  }
  return { state: s, events };
};
const tearing = (id, ...rates) => ({ tearing: { [id]: rates.map((rate, i) => ({ zombieId: i + 1, rate })) } });

describe('windows.js : géométrie (trois fenêtres de world.json)', () => {
  it('une géométrie par fenêtre, dans l\'ordre de world.json', () => {
    expect(geoms.map((g) => g.id)).toEqual(['fenetre-nord', 'fenetre-ouest', 'fenetre-est']);
  });

  it.each(geoms.map((g) => [g.id, g]))('%s : normale unitaire, emplacements symétriques à ±largeur/4 et à slotDistance du mur', (_id, g) => {
    expect(Math.hypot(g.normal.x, g.normal.y)).toBeCloseTo(1, 12);
    expect(g.slots).toHaveLength(2);
    const along = (p) => (p.x - g.center.x) * g.tangent.x + (p.y - g.center.y) * g.tangent.y;
    const out = (p) => (p.x - g.center.x) * g.normal.x + (p.y - g.center.y) * g.normal.y;
    expect(along(g.slots[0])).toBeCloseTo(-g.width / 4, 9);
    expect(along(g.slots[1])).toBeCloseTo(g.width / 4, 9);
    for (const s of g.slots) expect(out(s)).toBeCloseTo(cfg.slotDistance, 9);
  });

  it.each(geoms.map((g) => [g.id, g]))('%s : file alignée derrière les emplacements, un pas de queueStep entre deux places', (_id, g) => {
    expect(g.queue).toHaveLength(cfg.maxQueue);
    g.queue.forEach((p, k) => {
      const d = (p.x - g.center.x) * g.normal.x + (p.y - g.center.y) * g.normal.y;
      const side = (p.x - g.center.x) * g.tangent.x + (p.y - g.center.y) * g.tangent.y;
      expect(d).toBeCloseTo(cfg.slotDistance + cfg.queueStep * (k + 1), 9);
      expect(side).toBeCloseTo(0, 9);
    });
  });

  it.each(geoms.map((g) => [g.id, g]))('%s : entryOuter dehors, entryInner et repairSpot dans la salle à innerDistance et repairDistance du mur', (_id, g) => {
    const d = (p) => (p.x - g.center.x) * g.normal.x + (p.y - g.center.y) * g.normal.y;
    expect(d(g.entryOuter)).toBeCloseTo(cfg.slotDistance, 9);
    expect(d(g.entryInner)).toBeCloseTo(-cfg.innerDistance, 9);
    expect(d(g.repairSpot)).toBeCloseTo(-cfg.repairDistance, 9);
    const b = layout.bounds;
    for (const p of [g.entryInner, g.repairSpot]) {
      expect(p.x).toBeGreaterThan(b.minX);
      expect(p.x).toBeLessThan(b.maxX);
      expect(p.y).toBeGreaterThan(b.minY);
      expect(p.y).toBeLessThan(b.maxY);
    }
  });

  it('les normales regardent vers l\'extérieur de la salle (nord, ouest, est)', () => {
    const n = (id) => geoms.find((g) => g.id === id).normal;
    expect(n('fenetre-nord')).toEqual({ x: 0, y: -1 });
    expect(n('fenetre-ouest')).toEqual({ x: -1, y: 0 });
    expect(n('fenetre-est')).toEqual({ x: 1, y: 0 });
  });

  it('les quatre orientations sont gérées (sud comprise) ; côté inconnu ou fenêtre invalide : null', () => {
    expect(windowGeometry({ id: 'a', side: 'sud', x: 100, y: 200, size: 140 }, cfg).normal).toEqual({ x: 0, y: 1 });
    expect(windowGeometry({ id: 'a', side: 'haut', x: 100, y: 200 }, cfg)).toBeNull();
    expect(windowGeometry({ id: 'a', side: 'nord', x: NaN, y: 200 }, cfg)).toBeNull();
    expect(windowGeometry(null, cfg)).toBeNull();
  });

  it('l\'ouverture (gap) recouvre toute l\'épaisseur du mur et la largeur de la fenêtre', () => {
    expect(north.gap).toEqual({ x: 1730, y: 784, w: 140, h: 40 });
    const west = geoms.find((g) => g.id === 'fenetre-ouest');
    expect(west.gap).toEqual({ x: 784, y: 1330, w: 40, h: 140 });
  });

  it('queuePosition prolonge la file au-delà des places prévues', () => {
    const p = queuePosition(north, 8, cfg);
    expect(p.y).toBeCloseTo(north.center.y - (cfg.slotDistance + cfg.queueStep * 9), 9);
  });
});

describe('windows.js : état initial', () => {
  it('quatre planches par fenêtre par défaut, aucune progression', () => {
    expect(fresh().windows['fenetre-nord']).toEqual({ planks: 4, maxPlanks: 4, tearProgress: 0, repairProgress: 0 });
    expect(maxPlanksOf(cfg)).toBe(4);
  });

  it.each([0, 1, 2, 3, 4])('options.planks = %s', (n) => {
    const s = fresh(n);
    expect(planksSummary(s).map((w) => w.planks)).toEqual([n, n, n]);
    expect(s.warnings).toEqual([]);
  });

  it.each([[-1], [5], [2.5], ['2'], [NaN], [null]])('options.planks invalide %j : maximum avec avertissement', (n) => {
    const s = fresh(n);
    expect(planksSummary(s).map((w) => w.planks)).toEqual([4, 4, 4]);
    expect(s.warnings.length).toBe(1);
  });
});

describe('windows.js : arrachage', () => {
  it('un arracheur de rythme 1 fait tomber une planche en tearTime (2,2 s)', () => {
    const r = run(fresh(), tearing('fenetre-nord', 1), 2.2 - 0.05);
    expect(r.state.windows['fenetre-nord'].planks).toBe(4);
    const after = run(r.state, tearing('fenetre-nord', 1), 0.1);
    expect(after.state.windows['fenetre-nord'].planks).toBe(3);
    expect(after.events.filter((e) => e.type === 'plank-torn')).toHaveLength(1);
  });

  it('deux arracheurs vont deux fois plus vite', () => {
    const one = run(fresh(), tearing('fenetre-nord', 1), 4.45);
    const two = run(fresh(), tearing('fenetre-nord', 1, 1), 4.45);
    expect(one.state.windows['fenetre-nord'].planks).toBe(2);
    expect(two.state.windows['fenetre-nord'].planks).toBe(0);
  });

  it('le surplus est reporté : un pas énorme (borné à 0,05 s) ne perd pas de progression', () => {
    let s = fresh();
    s = stepWindows(s, tearing('fenetre-nord', 1), 0.05, cfg).state;
    const progress = s.windows['fenetre-nord'].tearProgress;
    expect(progress).toBeCloseTo(0.05 / cfg.tearTime, 12);
    const big = stepWindows(s, tearing('fenetre-nord', 100), 0.05, cfg);
    expect(big.state.windows['fenetre-nord'].planks).toBe(4 - Math.floor(progress + (100 * 0.05) / cfg.tearTime));
  });

  it('jamais sous 0 planche, progression remise à 0 quand la fenêtre est ouverte', () => {
    const r = run(fresh(1), tearing('fenetre-nord', 1, 1, 1), 5);
    const w = r.state.windows['fenetre-nord'];
    expect(w.planks).toBe(0);
    expect(w.tearProgress).toBe(0);
    expect(r.events.filter((e) => e.type === 'plank-torn')).toHaveLength(1);
  });

  it('les autres fenêtres ne sont pas touchées', () => {
    const r = run(fresh(), tearing('fenetre-nord', 1), 5);
    expect(r.state.windows['fenetre-ouest'].planks).toBe(4);
    expect(r.state.windows['fenetre-est'].planks).toBe(4);
  });

  it.each([['marcheur', 1], ['petit', 0.7], ['voute', 1.2], ['grand', 1.6]])('tearMul du type %s : %s', (type, mul) => {
    expect(enemies.variants[type].tearMul).toBe(mul);
    const t = run(fresh(), tearing('fenetre-nord', mul), cfg.tearTime / mul + 0.1);
    expect(t.state.windows['fenetre-nord'].planks).toBe(3);
    const early = run(fresh(), tearing('fenetre-nord', mul), cfg.tearTime / mul - 0.15);
    expect(early.state.windows['fenetre-nord'].planks).toBe(4);
  });

  it('un rythme négatif, nul ou invalide n\'arrache rien', () => {
    for (const rate of [-3, 0, NaN, Infinity, 'x', null]) {
      const r = run(fresh(), tearing('fenetre-nord', rate), 3);
      expect(r.state.windows['fenetre-nord'].planks, String(rate)).toBe(4);
    }
  });

  it('événements : plank-torn à chaque planche, window-open quand elles passent à 0, avec le nombre restant', () => {
    const r = run(fresh(2), tearing('fenetre-nord', 1, 1), 5);
    expect(r.events).toEqual([
      { type: 'plank-torn', windowId: 'fenetre-nord', planks: 1 },
      { type: 'plank-torn', windowId: 'fenetre-nord', planks: 0 },
      { type: 'window-open', windowId: 'fenetre-nord', planks: 0 },
    ]);
  });
});

describe('windows.js : réparation', () => {
  const fix = (id) => ({ repairing: { [id]: true } });

  it('une planche en 1,8 s au niveau 0, window-closed quand on remonte de 0 à 1', () => {
    const r = run(fresh(0), fix('fenetre-nord'), 1.8 + 0.05);
    expect(r.state.windows['fenetre-nord'].planks).toBe(1);
    expect(r.events.map((e) => e.type)).toEqual(['plank-repaired', 'window-closed']);
    expect(run(fresh(0), fix('fenetre-nord'), 1.7).state.windows['fenetre-nord'].planks).toBe(0);
  });

  it('temps de réparation du niveau 10 : 0,5 s', () => {
    const input = { ...fix('fenetre-nord'), repairTime: 0.5 };
    expect(run(fresh(0), input, 0.5 + 0.05).state.windows['fenetre-nord'].planks).toBe(1);
    expect(run(fresh(0), input, 0.4).state.windows['fenetre-nord'].planks).toBe(0);
  });

  it('jamais au-dessus du maximum', () => {
    const r = run(fresh(3), fix('fenetre-nord'), 10);
    expect(r.state.windows['fenetre-nord'].planks).toBe(4);
    expect(r.state.windows['fenetre-nord'].repairProgress).toBe(0);
    expect(r.events.filter((e) => e.type === 'plank-repaired')).toHaveLength(1);
  });

  it('bloquée tant que repairBlocked est vrai, reprise ensuite', () => {
    const blocked = run(fresh(2), { ...fix('fenetre-nord'), repairBlocked: { 'fenetre-nord': true } }, 5);
    expect(blocked.state.windows['fenetre-nord'].planks).toBe(2);
    expect(run(blocked.state, fix('fenetre-nord'), 1.9).state.windows['fenetre-nord'].planks).toBe(3);
  });

  it('sans demande de réparation, rien ne bouge', () => {
    expect(run(fresh(2), { repairing: { 'fenetre-nord': false } }, 5).state.windows['fenetre-nord'].planks).toBe(2);
  });

  it('la progression d\'arrachage est remise à 0 au début d\'une réparation', () => {
    let s = run(fresh(3), tearing('fenetre-nord', 1), 1).state;
    expect(s.windows['fenetre-nord'].tearProgress).toBeGreaterThan(0.4);
    s = stepWindows(s, fix('fenetre-nord'), 0.05, cfg).state;
    expect(s.windows['fenetre-nord'].tearProgress).toBe(0);
  });

  it('la progression de la planche en cours est conservée quand la réparation s\'arrête', () => {
    let s = run(fresh(2), fix('fenetre-nord'), 0.9).state;
    const kept = s.windows['fenetre-nord'].repairProgress;
    expect(kept).toBeCloseTo(0.5, 6);
    s = run(s, {}, 3).state;
    expect(s.windows['fenetre-nord'].repairProgress).toBe(kept);
  });

  it('plusieurs planches de suite : quatre planches en 7,2 s', () => {
    const r = run(fresh(0), fix('fenetre-est'), 7.2 + 0.1);
    expect(r.state.windows['fenetre-est'].planks).toBe(4);
    expect(r.events.filter((e) => e.type === 'plank-repaired')).toHaveLength(4);
    expect(r.events.filter((e) => e.type === 'window-closed')).toHaveLength(1);
  });
});

describe('windows.js : closedRects, isOpen, planksSummary', () => {
  it('closedRects : une ouverture par fenêtre à planches, aucune pour une fenêtre ouverte', () => {
    expect(closedRects(fresh(), geoms)).toHaveLength(3);
    expect(closedRects(fresh(0), geoms)).toEqual([]);
    const mixed = createWindowsState(geoms, cfg, { planks: 1 });
    mixed.windows['fenetre-est'].planks = 0;
    expect(closedRects(mixed, geoms).map((r) => r.id)).toEqual(['planches-fenetre-nord', 'planches-fenetre-ouest']);
  });

  it('les rectangles de planches sont ceux des ouvertures des murs', () => {
    expect(closedRects(fresh(), geoms)[0]).toMatchObject({ x: 1730, y: 784, w: 140, h: 40 });
  });

  it('isOpen : vrai à 0 planche, faux sinon ou si la fenêtre est inconnue', () => {
    expect(isOpen(fresh(0), 'fenetre-nord')).toBe(true);
    expect(isOpen(fresh(1), 'fenetre-nord')).toBe(false);
    expect(isOpen(fresh(0), 'inconnue')).toBe(false);
  });

  it('planksSummary liste chaque fenêtre', () => {
    expect(planksSummary(fresh(2))).toEqual(['fenetre-nord', 'fenetre-ouest', 'fenetre-est'].map((id) => ({ id, planks: 2, maxPlanks: 4, open: false })));
  });
});

describe('windows.js : dt, déterminisme, arguments gelés, entrées hostiles', () => {
  it('dt à 0, négatif ou invalide : aucun changement ; dt énorme : borné à 0,05 s', () => {
    for (const dt of [0, -1, NaN, 'x', null, undefined]) {
      expect(stepWindows(fresh(), tearing('fenetre-nord', 5), dt, cfg).state).toEqual(fresh());
    }
    const huge = stepWindows(fresh(), tearing('fenetre-nord', 1), 1e9, cfg).state;
    expect(huge.windows['fenetre-nord'].tearProgress).toBeCloseTo(0.05 / cfg.tearTime, 12);
  });

  it('mêmes entrées, mêmes sorties', () => {
    const a = run(fresh(), tearing('fenetre-nord', 1, 1.6), 9);
    const b = run(fresh(), tearing('fenetre-nord', 1, 1.6), 9);
    expect(a).toEqual(b);
  });

  it('arguments gelés acceptés et non modifiés', () => {
    const state = deepFreeze(fresh(2));
    const input = deepFreeze({ tearing: { 'fenetre-nord': [{ zombieId: 1, rate: 1 }] }, repairing: { 'fenetre-ouest': true }, repairBlocked: {} });
    const frozenCfg = deepFreeze({ ...cfg });
    const frozenGeoms = deepFreeze(JSON.parse(JSON.stringify(geoms)));
    const before = JSON.stringify([state, input, frozenGeoms]);
    expect(() => stepWindows(state, input, 0.05, frozenCfg)).not.toThrow();
    expect(() => closedRects(state, frozenGeoms)).not.toThrow();
    expect(() => planksSummary(state)).not.toThrow();
    expect(JSON.stringify([state, input, frozenGeoms])).toBe(before);
  });

  it('entrées hostiles : aucune exception, états finis', () => {
    for (const a of WEIRD) {
      for (const b of WEIRD) {
        expect(() => stepWindows(a, b, a, b)).not.toThrow();
        expect(() => closedRects(a, b)).not.toThrow();
        expect(() => isOpen(a, b)).not.toThrow();
        expect(() => planksSummary(a)).not.toThrow();
        expect(() => createWindowsState(a, b, a)).not.toThrow();
        expect(() => windowGeometry(a, b)).not.toThrow();
        expect(() => windowGeometries(a, b)).not.toThrow();
      }
    }
    const out = stepWindows(fresh(2), { tearing: { 'fenetre-nord': [null, 'x', { rate: NaN }, { rate: -5 }] }, repairing: 'oui', repairBlocked: [] }, 0.05, null);
    for (const w of Object.values(out.state.windows)) for (const v of Object.values(w)) expect(Number.isFinite(v)).toBe(true);
  });

  it('propriété : sur 300 pas pseudo-aléatoires, les planches restent entre 0 et le maximum et les événements sont cohérents', () => {
    let seed = 7;
    const rnd = () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed / 4294967296;
    };
    let s = fresh();
    let planks = 4;
    for (let i = 0; i < 300; i += 1) {
      const id = geoms[0].id;
      const input = { tearing: { [id]: rnd() < 0.5 ? [{ zombieId: 1, rate: rnd() * 2 }] : [] }, repairing: { [id]: rnd() < 0.5 }, repairBlocked: { [id]: rnd() < 0.2 }, repairTime: 0.3 + rnd() };
      const out = stepWindows(s, input, rnd() * 0.06, cfg);
      s = out.state;
      for (const e of out.events) {
        if (e.type === 'plank-torn') planks -= 1;
        if (e.type === 'plank-repaired') planks += 1;
        expect(e.planks).toBeGreaterThanOrEqual(0);
      }
      expect(s.windows[id].planks).toBe(planks);
      expect(planks).toBeGreaterThanOrEqual(0);
      expect(planks).toBeLessThanOrEqual(4);
    }
  });
});
