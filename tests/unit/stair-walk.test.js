import { describe, it, expect } from 'vitest';
import { cleanPath, entryDirection, heightOf, pathLength, pointAt, project, startWalk, stepWalk, SWAP_DOWN, SWAP_UP, wantsStairs } from '../../js/core/stair-walk.js';
import { parseZones, zonesToWorld } from '../../js/core/zones.js';
import { deepFreeze, WEIRD } from './helpers/carte.js';
import { world, zonesJson } from './helpers/etage.js';

// Chemin de test : palier d'entrée de 10, rampe de 40 (t de 0 à 1), palier de sortie vers l'ouest ; largeur 60, rayon du joueur 10 (jeu latéral de 20).
const PATH = deepFreeze([{ x: 0, y: 0, t: 0 }, { x: 0, y: 10, t: 0 }, { x: 0, y: 50, t: 1 }, { x: -40, y: 57, t: 1 }]);
const OPTS = { speed: 100, width: 60, radius: 10 };
// Marche de `seconds` secondes depuis pos ; dir peut être une fonction (étape, position, résultat précédent) pour tourner.
const run = (walk, pos, dir, seconds, opts = OPTS, path = PATH) => {
  let w = walk;
  let p = pos;
  const out = [];
  for (let i = 0; i < Math.round(seconds / 0.05); i += 1) {
    const d = typeof dir === 'function' ? dir(i, p, out.at(-1)) : dir;
    const r = stepWalk(w, path, { ...opts, pos: p, dir: d, dt: 0.05 });
    out.push(r);
    if (r.done) break;
    w = r.walk;
    p = r.pos;
  }
  return out;
};
// Direction qui suit le chemin (montée) : vers le sud sur la rampe, puis vers la sortie.
const climb = (i, p) => (p.y < 52 ? { x: 0, y: 1 } : { x: -1, y: 0.2 });

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

describe('stair-walk.js : projection', () => {
  it('project : point le plus proche, distance, dépassement des bouts', () => {
    const on = project(PATH, { x: 20, y: 30 });
    expect(on).toMatchObject({ x: 0, y: 30, dist: 20, beforeStart: 0, pastEnd: 0 });
    expect(on.t).toBeCloseTo(0.5, 6);
    expect(project(PATH, { x: 0, y: -15 })).toMatchObject({ x: 0, y: 0, beforeStart: 15, t: 0 });
    const end = project(PATH, { x: -60, y: 60 });
    expect(end.pastEnd).toBeGreaterThan(15);
    expect(end.t).toBe(1);
    expect(project(null, { x: 0, y: 0 }).dist).toBe(Infinity);
    expect(project(PATH, null).dist).toBe(Infinity);
  });

  it('s croît le long du chemin', () => {
    const a = project(PATH, { x: 0, y: 5 }).s;
    const b = project(PATH, { x: 0, y: 40 }).s;
    const c = project(PATH, { x: -20, y: 54 }).s;
    expect(a).toBeLessThan(b);
    expect(b).toBeLessThan(c);
  });
});

describe('stair-walk.js : marche libre dans l\'escalier', () => {
  it('startWalk : étage de départ, désarmé ; refuse les entrées invalides', () => {
    expect(startWalk('a', 'rdc')).toEqual({ stair: 'a', floor: 'rdc', from: 'rdc', auto: false, armed: false });
    expect(startWalk('a', 'etage', true)).toMatchObject({ from: 'etage', floor: 'etage', auto: true });
    expect(startWalk(3, 'rdc')).toBeNull();
    expect(startWalk('a', 'cave')).toBeNull();
  });

  it('on monte en marchant : la hauteur ne baisse jamais, l\'étage logique change une seule fois à mi-hauteur, sortie par le dernier bout', () => {
    const steps = run(startWalk('a', 'rdc'), { x: 0, y: -5 }, climb, 8);
    const ts = steps.map((r) => r.point.t);
    expect(ts.every((t, i) => i === 0 || t >= ts[i - 1] - 1e-12)).toBe(true);
    const floors = steps.map((r) => r.floor);
    expect(floors.filter((f, i) => i > 0 && f !== floors[i - 1])).toHaveLength(1);
    const swap = steps.find((r) => r.floor === 'etage');
    expect(swap.point.t).toBeGreaterThanOrEqual(SWAP_UP);
    expect(swap.point.t).toBeLessThan(SWAP_UP + 0.12);
    expect(steps.at(-1)).toMatchObject({ done: 'etage', walk: null, floor: 'etage' });
  });

  it('aucun saut : au plus speed × dt par pas, sauf le premier pas qui ramène dans le tube', () => {
    const steps = run(startWalk('a', 'rdc'), { x: 0, y: -5 }, climb, 8);
    let prev = { x: 0, y: -5 };
    for (const r of steps) {
      expect(Math.hypot(r.pos.x - prev.x, r.pos.y - prev.y)).toBeLessThanOrEqual(100 * 0.05 + 1e-9);
      prev = r.pos;
    }
  });

  it('déplacement libre : on peut marcher de côté dans la largeur sans changer de hauteur, puis les rambardes arrêtent', () => {
    let w = startWalk('a', 'rdc');
    let pos = { x: 0, y: 5 };
    for (let i = 0; i < 4; i += 1) {
      const r = stepWalk(w, PATH, { ...OPTS, pos, dir: { x: 0, y: 1 }, dt: 0.05 });
      w = r.walk;
      pos = r.pos;
    }
    const before = project(PATH, pos);
    expect(before.t).toBeGreaterThan(0);
    const side = run(w, pos, { x: 1, y: 0 }, 1);
    const last = side.at(-1);
    expect(last.pos.y).toBeCloseTo(pos.y, 6); // la hauteur ne dépend que de la position le long du chemin
    expect(last.point.t).toBeCloseTo(before.t, 6);
    expect(last.pos.x).toBeGreaterThan(5);
    expect(last.pos.x).toBeLessThanOrEqual(20 + 1e-9); // rambarde : largeur / 2 - rayon
    expect(last.done).toBeNull();
    const left = run(w, pos, { x: -1, y: 0 }, 1).at(-1);
    expect(left.pos.x).toBeGreaterThanOrEqual(-20 - 1e-9);
  });

  it('on peut s\'arrêter, reculer et repartir en pleine rampe', () => {
    const up = run(startWalk('a', 'rdc'), { x: 0, y: 5 }, { x: 0, y: 1 }, 0.5);
    const mid = up.at(-1);
    const still = run(mid.walk, mid.pos, { x: 0, y: 0 }, 1).at(-1);
    expect(still.pos).toEqual(mid.pos);
    expect(still.point.t).toBe(mid.point.t);
    const back = run(mid.walk, mid.pos, { x: 0, y: -1 }, 0.3).at(-1);
    expect(back.point.t).toBeLessThan(mid.point.t);
    expect(back.done).toBeNull();
  });

  it('demi-tour avant mi-hauteur : sortie par le bas sans changement d\'étage', () => {
    const w = run(startWalk('a', 'rdc'), { x: 0, y: -5 }, { x: 0, y: 1 }, 0.25).at(-1);
    expect(w.point.t).toBeLessThan(SWAP_DOWN);
    expect(w.point.t).toBeGreaterThan(0);
    const back = run(w.walk, w.pos, { x: 0, y: -1 }, 4);
    expect(back.at(-1)).toMatchObject({ done: 'rdc', floor: 'rdc' });
    expect(back.every((r) => r.floor === 'rdc')).toBe(true);
  });

  it('demi-tour après mi-hauteur : l\'étage logique redevient le rez-de-chaussée sous SWAP_DOWN (hystérésis), une seule bascule de retour', () => {
    const up = run(startWalk('a', 'rdc'), { x: 0, y: -5 }, { x: 0, y: 1 }, 1.0);
    const top = up.at(-1);
    expect(top.floor).toBe('etage');
    expect(top.done).toBeNull();
    const back = run(top.walk, top.pos, { x: 0, y: -1 }, 5);
    expect(back.at(-1)).toMatchObject({ done: 'rdc' });
    const turn = back.find((q) => q.floor === 'rdc');
    expect(turn.point.t).toBeLessThan(SWAP_DOWN);
    expect(back.filter((q, i) => i > 0 && q.floor !== back[i - 1].floor)).toHaveLength(1);
  });

  it('hystérésis : osciller entre SWAP_DOWN et SWAP_UP ne change pas l\'étage plus d\'une fois', () => {
    expect(SWAP_DOWN).toBeLessThan(SWAP_UP);
    let w = startWalk('a', 'rdc');
    let pos = { x: 0, y: 5 };
    for (let i = 0; i < 6; i += 1) {
      const r = stepWalk(w, PATH, { ...OPTS, pos, dir: { x: 0, y: 1 }, dt: 0.05 });
      w = r.walk;
      pos = r.pos;
    }
    const floors = [];
    for (let i = 0; i < 24; i += 1) {
      const r = stepWalk(w, PATH, { ...OPTS, pos, dir: { x: 0, y: i % 2 === 0 ? 1 : -1 }, speed: 6, dt: 0.05 });
      floors.push(r.floor);
      w = r.walk;
      pos = r.pos;
    }
    expect(floors.filter((f, i) => i > 0 && f !== floors[i - 1]).length).toBeLessThanOrEqual(1);
  });

  it('virage au palier du haut : il faut tourner vers la sortie ; continuer tout droit reste dans l\'escalier (rambarde)', () => {
    const up = run(startWalk('a', 'rdc'), { x: 0, y: -5 }, { x: 0, y: 1 }, 3);
    const stuck = up.at(-1);
    expect(stuck.done).toBeNull();
    expect(stuck.point.t).toBe(1);
    const out = run(stuck.walk, stuck.pos, { x: -1, y: 0.15 }, 3);
    expect(out.at(-1)).toMatchObject({ done: 'etage' });
  });

  it('on n\'est pas « sorti » avant d\'avoir rejoint le chemin : partir de derrière le premier bout, on entre', () => {
    const steps = run(startWalk('a', 'rdc'), { x: 0, y: -30 }, { x: 0, y: 1 }, 2);
    expect(steps.every((r) => r.done === null)).toBe(true);
    expect(steps.at(-1).point.t).toBeGreaterThan(0);
  });

  it('depuis l\'étage : on part du dernier bout, la hauteur baisse en descendant, sortie par le premier bout', () => {
    const dir = (i, p) => (p.y > 12 ? { x: 0.1, y: -1 } : { x: 0, y: -1 });
    const steps = run(startWalk('a', 'etage'), { x: -38, y: 56.5 }, (i, p, r) => (p.x < -2 && p.y > 50 ? { x: 1, y: -0.2 } : dir(i, p, r)), 10);
    expect(steps[0].floor).toBe('etage');
    expect(steps.at(-1)).toMatchObject({ done: 'rdc', floor: 'rdc' });
    const ts = steps.map((r) => r.point.t);
    expect(Math.max(...ts)).toBe(1);
    expect(ts.at(-1)).toBe(0);
  });

  it('mode auto : suit le chemin sans mouvement, dans le sens de l\'étage de départ', () => {
    const up = run(startWalk('a', 'rdc', true), { x: 0, y: 0 }, { x: 0, y: 0 }, 8);
    expect(up.at(-1)).toMatchObject({ done: 'etage' });
    const down = run(startWalk('a', 'etage', true), { x: -40, y: 57 }, { x: 0, y: 0 }, 8);
    expect(down.at(-1)).toMatchObject({ done: 'rdc' });
  });

  it('dt est borné à 0,05 s (une image très longue ne saute pas l\'escalier), 0 en pause', () => {
    const w = startWalk('a', 'rdc');
    const big = stepWalk(w, PATH, { ...OPTS, pos: { x: 0, y: 0 }, dir: { x: 0, y: 1 }, dt: 5 });
    expect(big.pos.y).toBeLessThanOrEqual(5.0001);
    const still = stepWalk(w, PATH, { ...OPTS, pos: { x: 0, y: 0 }, dir: { x: 0, y: 1 }, dt: 0 });
    expect(still.pos).toEqual({ x: 0, y: 0 });
    expect(still.done).toBeNull();
  });

  it('un mouvement plus long que 1 est ramené à 1 (pas de course en diagonale)', () => {
    const r = stepWalk(startWalk('a', 'rdc'), PATH, { ...OPTS, pos: { x: 0, y: 0 }, dir: { x: 5, y: 5 }, dt: 0.05 });
    expect(Math.hypot(r.pos.x, r.pos.y)).toBeLessThanOrEqual(5 + 1e-9);
  });

  it('entrées hostiles : chemin absent, état absent, position ou mouvement non numériques : aucune exception, la marche se termine', () => {
    for (const bad of WEIRD) {
      expect(() => stepWalk(bad, PATH, { ...OPTS, pos: { x: 0, y: 0 }, dir: { x: 0, y: 1 }, dt: 0.05 })).not.toThrow();
      expect(() => stepWalk(startWalk('a', 'rdc'), bad, { pos: bad, dir: bad, speed: bad, dt: bad, width: bad, radius: bad })).not.toThrow();
    }
    expect(stepWalk(startWalk('a', 'rdc'), null, { pos: { x: 0, y: 0 } }).done).toBe('rdc');
    expect(stepWalk(null, PATH).done).toBe('rdc');
  });

  it('ne modifie pas ses arguments (gelés) et renvoie de nouveaux objets', () => {
    const w = deepFreeze(startWalk('a', 'rdc'));
    const pos = Object.freeze({ x: 0, y: 0 });
    const r = stepWalk(w, PATH, { ...OPTS, pos, dir: Object.freeze({ x: 0, y: 1 }), dt: 0.05 });
    expect(r.walk).not.toBe(w);
    expect(r.pos).not.toBe(pos);
  });

  it('déterministe', () => {
    const a = run(startWalk('a', 'rdc'), { x: 3, y: -5 }, climb, 5);
    const b = run(startWalk('a', 'rdc'), { x: 3, y: -5 }, climb, 5);
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

  it('la montée (de t = 0 à t = 1) fait au moins 100 unités de long, pente de 1,8 au plus, t croissant ; l\'escalier de départ est arrondi (quart de tour)', () => {
    for (const st of zones.stairs) {
      const path = st.walk.path;
      const lo = path.findLastIndex((q, i) => q.t <= 0 && i < path.length - 1);
      const hi = path.findIndex((q) => q.t >= 1);
      expect(hi, st.id).toBeGreaterThan(lo);
      let run2 = 0;
      for (let i = lo; i < hi; i += 1) {
        run2 += Math.hypot(path[i + 1].x - path[i].x, path[i + 1].y - path[i].y);
        expect(path[i + 1].t, st.id).toBeGreaterThanOrEqual(path[i].t);
      }
      expect(run2, st.id).toBeGreaterThanOrEqual(100);
      expect(180 / run2, st.id).toBeLessThanOrEqual(1.8);
      if (st.id === 'escalier-depart') {
        const dirs = [];
        for (let i = lo; i < hi; i += 1) dirs.push(Math.atan2(path[i + 1].y - path[i].y, path[i + 1].x - path[i].x));
        expect(Math.abs(dirs.at(-1) - dirs[0])).toBeGreaterThan(Math.PI / 3); // la montée tourne d'au moins 60 degrés
        expect(hi - lo).toBeGreaterThanOrEqual(4); // plusieurs tronçons : une courbe
      }
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
