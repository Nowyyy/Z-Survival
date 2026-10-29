import { describe, it, expect } from 'vitest';
import { cleanPath, entryDirection, heightOf, pathLength, pointAt, startWalk, stepWalk, SWAP_DOWN, SWAP_UP, wantsStairs } from '../../js/core/stair-walk.js';
import { parseZones, zonesToWorld } from '../../js/core/zones.js';
import { deepFreeze, WEIRD } from './helpers/carte.js';
import { world, zonesJson } from './helpers/etage.js';

// Chemin de test : palier d'entrée de 10, rampe de 40 (t de 0 à 1), palier de sortie vers l'ouest.
const PATH = deepFreeze([{ x: 0, y: 0, t: 0 }, { x: 0, y: 10, t: 0 }, { x: 0, y: 50, t: 1 }, { x: -40, y: 57, t: 1 }]);
const run = (walk, dir, seconds, speed = 100, path = PATH) => {
  let w = walk;
  const out = [];
  for (let i = 0; i < Math.round(seconds / 0.05); i += 1) {
    const r = stepWalk(w, path, { dir, speed, dt: 0.05 });
    out.push(r);
    if (r.done) break;
    w = r.walk;
  }
  return out;
};

describe('stair-walk.js : chemin', () => {
  it('cleanPath garde les points valides et refuse le reste', () => {
    expect(cleanPath(PATH)).toHaveLength(4);
    expect(cleanPath([{ x: 0, y: 0, t: 0 }])).toBeNull();
    expect(cleanPath([{ x: 0, y: 0, t: 0 }, { x: 1, y: NaN, t: 1 }])).toBeNull();
    expect(cleanPath('x')).toBeNull();
    expect(cleanPath([{ x: 0, y: 0, t: 2 }, { x: 1, y: 1, t: -1 }])).toEqual([{ x: 0, y: 0, t: 1 }, { x: 1, y: 1, t: 0 }]);
  });

  it('pathLength additionne les tronçons', () => {
    expect(pathLength(PATH)).toBeCloseTo(10 + 40 + Math.hypot(40, 7), 6);
    expect(pathLength(null)).toBe(0);
  });

  it('pointAt : extrémités, milieu de rampe, tangente unitaire, s borné', () => {
    expect(pointAt(PATH, 0)).toMatchObject({ x: 0, y: 0, t: 0 });
    const end = pointAt(PATH, 1);
    expect(end).toMatchObject({ x: -40, y: 57, t: 1 });
    const mid = pointAt(PATH, (10 + 20) / pathLength(PATH));
    expect(mid.x).toBeCloseTo(0, 6);
    expect(mid.y).toBeCloseTo(30, 6);
    expect(mid.t).toBeCloseTo(0.5, 6);
    expect(Math.hypot(mid.tx, mid.ty)).toBeCloseTo(1, 6);
    expect(pointAt(PATH, -3)).toEqual(pointAt(PATH, 0));
    expect(pointAt(PATH, 9)).toEqual(pointAt(PATH, 1));
    expect(pointAt(PATH, NaN)).toEqual(pointAt(PATH, 0));
  });

  it('entryDirection : du bout vers l\'intérieur, selon l\'étage ; null si invalide', () => {
    expect(entryDirection(PATH, 'rdc')).toEqual({ x: 0, y: 1 });
    const up = entryDirection(PATH, 'etage');
    expect(up.x).toBeCloseTo(40 / Math.hypot(40, 7), 6);
    expect(up.y).toBeCloseTo(-7 / Math.hypot(40, 7), 6);
    expect(entryDirection(PATH, 'toit')).toBeNull();
    expect(entryDirection(null, 'rdc')).toBeNull();
  });

  it('wantsStairs : composante vers l\'escalier d\'au moins 0,3', () => {
    expect(wantsStairs({ x: 0, y: 1 }, { x: 0, y: 1 })).toBe(true);
    expect(wantsStairs({ x: 1, y: 0 }, { x: 0, y: 1 })).toBe(false);
    expect(wantsStairs({ x: 0.3, y: 0.31 }, { x: 0, y: 1 })).toBe(true);
    expect(wantsStairs({ x: 0, y: -1 }, { x: 0, y: 1 })).toBe(false);
    expect(wantsStairs(null, { x: 0, y: 1 })).toBe(false);
    expect(wantsStairs({ x: NaN, y: 1 }, { x: 0, y: 1 })).toBe(false);
  });

  it('heightOf : fraction de la hauteur, bornée', () => {
    expect(heightOf(0.5, 180)).toBe(90);
    expect(heightOf(2, 180)).toBe(180);
    expect(heightOf(-1, 180)).toBe(0);
    expect(heightOf(NaN, 180)).toBe(0);
  });
});

describe('stair-walk.js : marche dans l\'escalier', () => {
  it('startWalk : du premier point depuis le rez-de-chaussée, du dernier depuis l\'étage ; refuse les entrées invalides', () => {
    expect(startWalk('a', 'rdc')).toMatchObject({ stair: 'a', s: 0, floor: 'rdc', from: 'rdc', auto: false, sign: 1 });
    expect(startWalk('a', 'etage', true)).toMatchObject({ s: 1, floor: 'etage', from: 'etage', auto: true, sign: -1 });
    expect(startWalk(3, 'rdc')).toBeNull();
    expect(startWalk('a', 'cave')).toBeNull();
  });

  it('mouvement vers l\'escalier : la hauteur monte sans jamais baisser, l\'étage change une seule fois, sortie en haut', () => {
    const steps = run(startWalk('a', 'rdc'), { x: 0, y: 1 }, 6);
    const ts = steps.map((r) => r.point.t);
    expect(ts.every((t, i) => i === 0 || t >= ts[i - 1] - 1e-12)).toBe(true);
    const floors = steps.map((r) => r.floor);
    expect(floors.filter((f, i) => i > 0 && f !== floors[i - 1])).toHaveLength(1);
    const swap = steps.find((r) => r.floor === 'etage');
    expect(swap.point.t).toBeGreaterThanOrEqual(SWAP_UP);
    expect(swap.point.t).toBeLessThan(SWAP_UP + 0.15);
    expect(steps.at(-1)).toMatchObject({ done: 'etage', walk: null, floor: 'etage' });
    expect(steps.at(-1).point).toMatchObject({ x: -40, y: 57, t: 1 });
  });

  it('vitesse : au plus speed × dt par pas, jamais de saut', () => {
    const steps = run(startWalk('a', 'rdc'), { x: 0, y: 1 }, 6, 120);
    let prev = pointAt(PATH, 0);
    for (const r of steps) {
      expect(Math.hypot(r.point.x - prev.x, r.point.y - prev.y)).toBeLessThanOrEqual(120 * 0.05 + 1e-9);
      prev = r.point;
    }
  });

  it('dt est borné à 0,05 s (une image très longue ne saute pas l\'escalier) et vaut 0 en pause', () => {
    const w = startWalk('a', 'rdc');
    const big = stepWalk(w, PATH, { dir: { x: 0, y: 1 }, speed: 100, dt: 5 });
    expect(big.point.y).toBeLessThanOrEqual(5.0001);
    const still = stepWalk(w, PATH, { dir: { x: 0, y: 1 }, speed: 100, dt: 0 });
    expect(still.walk.s).toBe(0);
  });

  it('sans mouvement le joueur reste en place ; un mouvement de côté ne fait pas avancer sur la rampe', () => {
    let w = startWalk('a', 'rdc');
    for (let i = 0; i < 8; i += 1) w = stepWalk(w, PATH, { dir: { x: 0, y: 1 }, speed: 100, dt: 0.05 }).walk; // sur la rampe
    const at = w.s;
    expect(stepWalk(w, PATH, { dir: { x: 0, y: 0 }, speed: 100, dt: 0.05 }).walk.s).toBe(at);
    expect(stepWalk(w, PATH, { dir: { x: 1, y: 0 }, speed: 100, dt: 0.05 }).walk.s).toBeCloseTo(at, 9);
  });

  it('demi-tour avant mi-hauteur : sortie par le bas sans changement d\'étage', () => {
    let w = startWalk('a', 'rdc');
    for (let i = 0; i < 4; i += 1) w = stepWalk(w, PATH, { dir: { x: 0, y: 1 }, speed: 100, dt: 0.05 }).walk;
    expect(pointAt(PATH, w.s).t).toBeLessThan(SWAP_DOWN);
    const back = run(w, { x: 0, y: -1 }, 5);
    expect(back.at(-1)).toMatchObject({ done: 'rdc', floor: 'rdc' });
    expect(back.every((r) => r.floor === 'rdc')).toBe(true);
  });

  it('demi-tour après mi-hauteur : l\'étage logique redevient le rez-de-chaussée sous SWAP_DOWN (hystérésis)', () => {
    let w = startWalk('a', 'rdc');
    let r;
    for (let i = 0; i < 9; i += 1) {
      r = stepWalk(w, PATH, { dir: { x: 0, y: 1 }, speed: 100, dt: 0.05 });
      w = r.walk;
    }
    expect(r.floor).toBe('etage');
    const back = run(w, { x: 0, y: -1 }, 5);
    expect(back.at(-1)).toMatchObject({ done: 'rdc' });
    const turn = back.find((q) => q.floor === 'rdc');
    expect(turn.point.t).toBeLessThan(SWAP_DOWN);
    expect(back.filter((q, i) => i > 0 && q.floor !== back[i - 1].floor)).toHaveLength(1);
  });

  it('hystérésis : rester entre SWAP_DOWN et SWAP_UP ne change pas l\'étage', () => {
    expect(SWAP_DOWN).toBeLessThan(SWAP_UP);
    let w = startWalk('a', 'rdc');
    for (let i = 0; i < 6; i += 1) w = stepWalk(w, PATH, { dir: { x: 0, y: 1 }, speed: 100, dt: 0.05 }).walk;
    const floors = [];
    for (let i = 0; i < 20; i += 1) {
      const dir = i % 2 === 0 ? { x: 0, y: 1 } : { x: 0, y: -1 };
      const r = stepWalk(w, PATH, { dir, speed: 6, dt: 0.05 });
      floors.push(r.floor);
      w = r.walk;
    }
    expect(new Set(floors).size).toBeLessThanOrEqual(2);
    expect(floors.filter((f, i) => i > 0 && f !== floors[i - 1]).length).toBeLessThanOrEqual(1);
  });

  it('depuis l\'étage : on part du dernier point, en descendant la hauteur baisse, sortie en bas au premier point', () => {
    const dir = entryDirection(PATH, 'etage');
    const steps = run(startWalk('a', 'etage'), dir, 8);
    expect(steps[0].floor).toBe('etage');
    const ts = steps.map((r) => r.point.t);
    expect(ts.every((t, i) => i === 0 || t <= ts[i - 1] + 1e-12)).toBe(true);
    expect(steps.at(-1)).toMatchObject({ done: 'rdc', floor: 'rdc' });
    expect(steps.at(-1).point).toMatchObject({ x: 0, y: 0, t: 0 });
  });

  it('palier du haut : tout mouvement qui ne fait pas demi-tour mène vers la sortie ; un demi-tour y rentre', () => {
    const w = { ...startWalk('a', 'rdc'), s: 0.8, floor: 'etage', sign: 1 };
    const out = stepWalk(w, PATH, { dir: { x: -1, y: 0 }, speed: 100, dt: 0.05 });
    expect(out.walk.s).toBeGreaterThan(0.8);
    const south = stepWalk(w, PATH, { dir: { x: 0, y: 1 }, speed: 100, dt: 0.05 });
    expect(south.walk.s).toBeGreaterThan(0.8); // de côté : vers la sortie aussi
    const back = stepWalk(w, PATH, { dir: { x: 1, y: 0 }, speed: 100, dt: 0.05 });
    expect(back.walk.s).toBeLessThan(0.8); // demi-tour : on rentre dans l'escalier
  });

  it('palier du bas : s\'éloigner de l\'escalier en sort sans changer d\'étage', () => {
    const w = { ...startWalk('a', 'rdc'), s: 0.05, sign: 1 };
    const steps = run(w, { x: 0, y: -1 }, 2);
    expect(steps.at(-1)).toMatchObject({ done: 'rdc', floor: 'rdc' });
    const stay = stepWalk(w, PATH, { dir: { x: 0, y: 1 }, speed: 100, dt: 0.05 });
    expect(stay.walk.s).toBeGreaterThan(0.05);
  });

  it('mode auto : suit le chemin sans mouvement, dans le sens de l\'étage de départ', () => {
    const up = run(startWalk('a', 'rdc', true), { x: 0, y: 0 }, 6);
    expect(up.at(-1)).toMatchObject({ done: 'etage' });
    const down = run(startWalk('a', 'etage', true), { x: 0, y: 0 }, 6);
    expect(down.at(-1)).toMatchObject({ done: 'rdc' });
  });

  it('durée de la montée : longueur du chemin ÷ vitesse (à un pas près)', () => {
    const speed = 150;
    const steps = run(startWalk('a', 'rdc'), { x: 0, y: 1 }, 20, speed);
    expect(steps.length * 0.05).toBeGreaterThan(pathLength(PATH) / speed - 0.06);
    expect(steps.length * 0.05).toBeLessThan(pathLength(PATH) / speed + 0.4);
  });

  it('entrées hostiles : chemin absent, état absent, mouvement non numérique : aucune exception, la marche se termine', () => {
    for (const bad of WEIRD) {
      expect(() => stepWalk(bad, PATH, { dir: { x: 0, y: 1 }, speed: 100, dt: 0.05 })).not.toThrow();
      expect(() => stepWalk(startWalk('a', 'rdc'), bad, { dir: bad, speed: bad, dt: bad })).not.toThrow();
    }
    expect(stepWalk(startWalk('a', 'rdc'), null, { dir: { x: 0, y: 1 }, speed: 100, dt: 0.05 }).done).toBe('rdc');
    expect(stepWalk(null, PATH).done).toBe('rdc');
  });

  it('ne modifie pas ses arguments (gelés) et renvoie de nouveaux objets', () => {
    const w = deepFreeze(startWalk('a', 'rdc'));
    const r = stepWalk(w, PATH, { dir: Object.freeze({ x: 0, y: 1 }), speed: 100, dt: 0.05 });
    expect(r.walk).not.toBe(w);
    expect(w.s).toBe(0);
  });

  it('déterministe', () => {
    const a = run(startWalk('a', 'rdc'), { x: 0.3, y: 0.9 }, 4);
    const b = run(startWalk('a', 'rdc'), { x: 0.3, y: 0.9 }, 4);
    expect(a).toEqual(b);
  });
});

describe('zones.json : chemins des escaliers physiques', () => {
  const parsed = parseZones(zonesJson);
  const zones = zonesToWorld(parsed, world.transform);

  it('chaque escalier a un chemin valide : t de 0 à 1, premier point = centre de la zone de déclenchement du rez-de-chaussée, dernier = celui de l\'étage', () => {
    expect(parsed.warnings).toEqual([]);
    for (const st of zones.stairs) {
      expect(st.walk, st.id).not.toBeNull();
      const path = st.walk.path;
      expect(cleanPath(path), st.id).not.toBeNull();
      expect(path[0].t).toBe(0);
      expect(path.at(-1).t).toBe(1);
      const c = (r) => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 });
      const a = c(st.floors.rdc.trigger);
      const b = c(st.floors.etage.trigger);
      expect(Math.hypot(path[0].x - a.x, path[0].y - a.y), st.id).toBeLessThan(1);
      expect(Math.hypot(path.at(-1).x - b.x, path.at(-1).y - b.y), st.id).toBeLessThan(1);
      expect(st.walk.width).toBeGreaterThan(0);
    }
  });

  it('la montée (de t = 0 à t = 1) est rectiligne et fait au moins 100 unités, pente de 1,8 au plus', () => {
    for (const st of zones.stairs) {
      const path = st.walk.path;
      const lo = path.findLastIndex((q, i) => q.t <= 0 && i < path.length - 1);
      const hi = path.findIndex((q) => q.t >= 1);
      expect(hi, st.id).toBeGreaterThan(lo);
      const run2 = Math.hypot(path[hi].x - path[lo].x, path[hi].y - path[lo].y);
      expect(run2, st.id).toBeGreaterThanOrEqual(100);
      expect(180 / run2, st.id).toBeLessThanOrEqual(1.8);
      for (let i = lo; i < hi; i += 1) expect(path[i].t === 0 || path[i + 1].t === 1 || i + 1 === hi).toBe(true);
    }
  });

  it('un chemin invalide est signalé et donne un escalier instantané (walk nul)', () => {
    const bad = { ...zonesJson, stairs: zonesJson.stairs.map((st) => ({ ...st, walk: { path: [[0, 0, 0], [1, 1, 0.5]], width: 10 } })) };
    const p = parseZones(bad);
    expect(p.warnings.some((w) => /walk invalide/.test(w))).toBe(true);
    expect(p.stairs.every((st) => st.walk === null)).toBe(true);
  });

  it('un fichier sans walk (avant la mise à jour) se lit sans avertissement', () => {
    const old = { ...zonesJson, stairs: zonesJson.stairs.map((st) => { const c = { ...st }; delete c.walk; return c; }) };
    const p = parseZones(old);
    expect(p.warnings).toEqual([]);
    expect(p.stairs.every((st) => st.walk === null)).toBe(true);
  });
});
