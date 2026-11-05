import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import * as N from '../../js/core/collision.js';
import * as O from './helpers/oracle/collision.oracle.js';
import { casClearSegment, casFirstOnSegment, casMove, casRects, casSegmentRect } from './helpers/cas-collision.js';
import { deepFreeze } from './helpers/monde.js';

// Lot 5d-B : preuve d'identité de js/core/collision.js réécrit sans allocation contre l'oracle figé (copie verbatim d'origin/dev d18023c,
// tests/unit/helpers/oracle/collision.oracle.js). Pour chaque fonction : des milliers de cas tirés d'une graine (cas limites et vraies cartes,
// tests/unit/helpers/cas-collision.js), comparés champ par champ par Object.is (forme du résultat comprise : mêmes clés, dans le même ordre),
// exceptions comprises ; arguments gelés (aucune écriture) ; deux ordres d'appel ; variantes Into rappelées avec le même `out` sans rien garder
// de l'appel précédent ; aucun état dans le module.

// Premier écart entre deux valeurs (chemin), ou null. Object.is distingue -0 et 0 et accepte NaN.
function diff(a, b, path = '') {
  if (Object.is(a, b)) return null;
  if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') return path || '(valeur)';
  if (Array.isArray(a) !== Array.isArray(b) || Object.getPrototypeOf(a) !== Object.getPrototypeOf(b)) return `${path} (type)`;
  const ka = Object.keys(a);
  const kb = Object.keys(b);
  if (ka.join('|') !== kb.join('|')) return `${path} (clés ${ka.join(',')} / ${kb.join(',')})`;
  for (const k of ka) {
    const d = diff(a[k], b[k], `${path}.${k}`);
    if (d) return d;
  }
  return null;
}
const call = (fn, args) => {
  try {
    return { ok: true, v: fn(...args) };
  } catch (e) {
    return { ok: false, e: `${e?.name}: ${e?.message}` };
  }
};
// Compare fn (nouveau) et ref (oracle) sur tous les cas ; renvoie les premiers écarts lisibles.
function compare(cases, fn, ref, extra = null) {
  const bad = [];
  cases.forEach((args, i) => {
    const a = call(ref, args);
    const b = call(fn, args);
    const d = a.ok !== b.ok ? 'exception' : a.ok ? diff(a.v, b.v) ?? extra?.(a.v, b.v, args) ?? null : a.e === b.e ? null : 'message';
    if (d && bad.length < 5) bad.push(`cas ${i} : ${d}`);
  });
  return bad;
}
const frozen = (cases) => deepFreeze(cases);
const sameObstacle = (a, b) => (a && b && a.obstacle !== b.obstacle ? 'obstacle (identité)' : null);

const SEG = frozen(casSegmentRect());
const FIRST = frozen(casFirstOnSegment());
const CLEAR = frozen(casClearSegment());
const MOVE = frozen(casMove());
const RECTS = frozen(casRects());

describe('collision.js réécrit : résultats identiques à l\'oracle (Object.is)', () => {
  it(`segmentRect : ${SEG.length} cas`, () => expect(compare(SEG, N.segmentRect, O.segmentRect)).toEqual([]));
  it(`firstOnSegment : ${FIRST.length} cas (obstacle renvoyé : même objet)`, () => expect(compare(FIRST, N.firstOnSegment, O.firstOnSegment, sameObstacle)).toEqual([]));
  it(`clearSegment : ${CLEAR.length} cas`, () => expect(compare(CLEAR, N.clearSegment, O.clearSegment)).toEqual([]));
  it(`moveWithCollision : ${MOVE.length} cas (glissement, sous-pas, poussée hors d'un obstacle, bornes)`, () => expect(compare(MOVE, N.moveWithCollision, O.moveWithCollision)).toEqual([]));
  it(`petites fonctions (isRect, validRects, inflateRect, distanceToRect, circleOverlapsRect, rectGap) : ${RECTS.length} cas chacune`, () => {
    const bad = [
      ...compare(RECTS.map((c) => [c.a]), N.isRect, O.isRect),
      ...compare(RECTS.map((c) => [c.list]), N.validRects, O.validRects),
      ...compare(RECTS.map((c) => [c.a, c.m]), N.inflateRect, O.inflateRect),
      ...compare(RECTS.map((c) => [c.x, c.y, c.a]), N.distanceToRect, O.distanceToRect),
      ...compare(RECTS.map((c) => [c.c, c.a]), N.circleOverlapsRect, O.circleOverlapsRect),
      ...compare(RECTS.map((c) => [c.a, c.b]), N.rectGap, O.rectGap),
    ];
    expect(bad).toEqual([]);
  });
  it('mêmes exports que l\'oracle, plus les seules variantes Into', () => {
    expect(Object.keys(N).filter((k) => !(k in O))).toEqual(['firstOnSegmentInto', 'moveWithCollisionInto']);
    expect(Object.keys(O).filter((k) => !(k in N))).toEqual([]);
  });
});

describe('variantes Into : tampon de l\'appelant, rien de gardé d\'un appel à l\'autre, ordre d\'appel sans effet', () => {
  const intoFirst = (out) => (args) => {
    const r = N.firstOnSegmentInto(out, ...args);
    if (r !== null && r !== out) throw new Error('le résultat doit être out');
    if (r === null && (out.t !== null || out.obstacle !== null)) throw new Error('out non remis à null');
    return r === null ? null : { t: out.t, obstacle: out.obstacle };
  };
  const intoMove = (out) => (args) => {
    const r = N.moveWithCollisionInto(out, ...args);
    if (r !== out) throw new Error('le résultat doit être out');
    return { x: out.x, y: out.y };
  };
  it('firstOnSegmentInto : un seul out pour tous les cas, dans l\'ordre puis à l\'envers', () => {
    const fwd = intoFirst({ t: 0, obstacle: null });
    const back = intoFirst({ t: 99, obstacle: { id: 'reste' } });
    expect(compare(FIRST, (...a) => fwd(a), O.firstOnSegment, sameObstacle)).toEqual([]);
    expect(compare([...FIRST].reverse(), (...a) => back(a), O.firstOnSegment, sameObstacle)).toEqual([]);
  });
  it('moveWithCollisionInto : un seul out pour tous les cas, dans l\'ordre puis à l\'envers, et out = circle', () => {
    const fwd = intoMove({ x: 0, y: 0 });
    const back = intoMove({ x: 123, y: -4 });
    expect(compare(MOVE, (...a) => fwd(a), O.moveWithCollision)).toEqual([]);
    expect(compare([...MOVE].reverse(), (...a) => back(a), O.moveWithCollision)).toEqual([]);
    // L'appelant peut écrire le résultat dans le cercle lui-même : toutes les lectures précèdent les écritures.
    const bad = [];
    MOVE.slice(0, 500).forEach((args, i) => {
      if (!args[0] || typeof args[0] !== 'object') return;
      const c = { ...args[0] };
      const ref = call(O.moveWithCollision, args);
      const got = call(() => N.moveWithCollisionInto(c, c, args[1], args[2], args[3]), []);
      if (ref.ok && (!got.ok || !Object.is(ref.v.x, c.x) || !Object.is(ref.v.y, c.y)) && bad.length < 3) bad.push(i);
    });
    expect(bad).toEqual([]);
  });
  it('appels sans out : objets neufs à chaque appel, arguments intacts', () => {
    const list = [{ x: 0, y: 0, w: 10, h: 10 }];
    const a = N.firstOnSegment(-5, 5, 20, 5, list);
    const b = N.firstOnSegment(-5, 5, 20, 5, list);
    expect(a).not.toBe(b);
    expect(a).toEqual({ t: 0.2, obstacle: list[0] });
    const c = { x: 5, y: 5, r: 3 };
    const m1 = N.moveWithCollision(c, { x: 1, y: 0 }, list);
    expect(m1).not.toBe(N.moveWithCollision(c, { x: 1, y: 0 }, list));
    expect(c).toEqual({ x: 5, y: 5, r: 3 });
  });
});

describe('pureté et absence d\'allocation de collision.js', () => {
  const src = readFileSync('js/core/collision.js', 'utf8');
  it('aucun état dans le module : ni let ni var au premier niveau, aucune constante objet, tableau ou instance', () => {
    expect(src.match(/^(let|var) /gm)).toBeNull();
    expect(src.match(/^(export )?const \w+ = (\{|\[|new )/gm)).toBeNull();
  });
  it('aucune horloge, aucun hasard, aucun DOM, aucun stockage', () => {
    expect(src).not.toMatch(/Math\.random|Date\.now|performance\.|document|window|localStorage|sessionStorage/);
  });
  it('corps des fonctions chaudes sans littéral d\'objet ou de tableau, sans map/filter/reduce/forEach/slice/concat, sans décomposition ni fermeture', () => {
    const bodies = ['clipSegment', 'segmentRect', 'firstIndex', 'firstOnSegmentInto', 'clearSegment', 'countValid', 'slide', 'pushOutInto', 'moveWithCollisionInto'].map((name) => {
      const start = src.indexOf(`function ${name}(`);
      expect(start, name).toBeGreaterThan(-1);
      const end = src.indexOf('\n}\n', start);
      return [name, src.slice(src.indexOf('{', start) + 1, end)];
    });
    for (const [name, body] of bodies) {
      expect(body, name).not.toMatch(/\.(map|filter|reduce|forEach|slice|concat|some|every)\(/);
      expect(body, name).not.toMatch(/\.\.\.|=>|function\b|`/);
      expect(body, name).not.toMatch(/[=(,:?]\s*\[/); // littéral de tableau
      expect(body, name).not.toMatch(/[=(,:?]\s*\{/); // littéral d'objet
      expect(body, name).not.toMatch(/(const|let) \{|(const|let) \[/); // décomposition
    }
  });
});
