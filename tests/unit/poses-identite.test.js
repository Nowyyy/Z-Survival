import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import * as NC from '../../js/core/character-parts.js';
import * as OC from './helpers/oracle/character-parts.oracle.js';
import * as NP from '../../js/core/pose-v2.js';
import * as OP from './helpers/oracle/pose-v2.oracle.js';
import { RIGS, casAdd, casBlend, casEuler, casJointMatrices, casPoseAt, poses, samplePoses } from './helpers/cas-poses.js';
import { deepFreeze } from './helpers/monde.js';

// Lot 5d-C : preuve d'identité des poses réécrites sans allocation (js/core/character-parts.js et js/core/pose-v2.js) contre les oracles figés
// (copies verbatim d'origin/dev d18023c, tests/unit/helpers/oracle/). Les 5 personnages, toutes leurs variantes (A, B, C, riche…) et les trois
// styles, toutes les animations, phases tirées et limites (tests/unit/helpers/cas-poses.js) : chaque nombre des matrices et des angles comparé
// par Object.is, forme comprise (mêmes clés, dans le même ordre), exceptions comprises ; arguments gelés ; variantes Into rappelées avec les
// mêmes tampons sans rien garder de l'appel précédent, dans deux ordres.

function diff(a, b, path = '') {
  if (Object.is(a, b)) return null;
  if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') return `${path || '(valeur)'} : ${String(a)} / ${String(b)}`;
  if (Array.isArray(a) !== Array.isArray(b) || Object.getPrototypeOf(a) !== Object.getPrototypeOf(b)) return `${path} (type)`;
  const ka = Object.keys(a);
  const kb = Object.keys(b);
  if (ka.length !== kb.length || ka.some((k, i) => k !== kb[i])) return `${path} (clés ${ka.join(',')} / ${kb.join(',')})`;
  if (Array.isArray(a)) {
    for (let i = 0; i < a.length; i += 1) {
      if ((i in a) !== (i in b)) return `${path}[${i}] (trou)`;
    }
  }
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
function compare(cases, fn, ref) {
  const bad = [];
  cases.forEach((args, i) => {
    const a = call(ref, args);
    const b = call(fn, args);
    const d = a.ok !== b.ok ? `exception ${a.ok ? b.e : a.e}` : a.ok ? diff(a.v, b.v) : a.e === b.e ? null : `message ${a.e} / ${b.e}`;
    if (d && bad.length < 5) bad.push(`cas ${i} : ${d}`);
  });
  return bad;
}

const EULER = deepFreeze(casEuler());
const JM = deepFreeze(casJointMatrices());

describe('character-parts.js réécrit : matrices identiques à l\'oracle (Object.is)', () => {
  it(`eulerMatrix : ${EULER.length} cas (ordres XYZ et YXZ, angles invalides)`, () => expect(compare(EULER, NC.eulerMatrix, OC.eulerMatrix)).toEqual([]));
  it(`jointMatrices : ${JM.length} cas (toutes les articulations, poses de l'oracle, échelles, décalages)`, () => expect(compare(JM, NC.jointMatrices, OC.jointMatrices)).toEqual([]));
  it('eulerMatrixInto : un seul tableau pour tous les cas, dans les deux ordres', () => {
    const o1 = new Array(9).fill(7);
    const o2 = new Array(9).fill(-1);
    expect(compare(EULER, (...a) => NC.eulerMatrixInto(o1, ...a).slice(), OC.eulerMatrix)).toEqual([]);
    expect(compare([...EULER].reverse(), (...a) => NC.eulerMatrixInto(o2, ...a).slice(), OC.eulerMatrix)).toEqual([]);
  });
  it('jointMatricesInto : un tampon par squelette, rappelé pour toutes les poses, dans les deux ordres', () => {
    const outs = new Map();
    const copy = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, { m: v.m.slice(), t: v.t.slice() }]));
    const into = (joints, ...rest) => {
      if (!outs.has(joints)) outs.set(joints, {});
      const o = outs.get(joints);
      const r = NC.jointMatricesInto(o, joints, ...rest);
      if (r !== o) throw new Error('le résultat doit être out');
      return copy(o);
    };
    const ok = JM.filter((c) => Array.isArray(c[0]) && c[0].length);
    expect(compare(ok, into, OC.jointMatrices)).toEqual([]);
    outs.clear();
    expect(compare([...ok].reverse(), into, OC.jointMatrices)).toEqual([]);
  });
});

const POSE_CASES = deepFreeze(casPoseAt());
const BLEND = deepFreeze(casBlend());
const ADD = deepFreeze(casAdd());
const SAMPLES = deepFreeze(samplePoses(300, 71));

// Pose « Into » ramenée à son contenu : articulations présentes (valeur définie), clés triées (l'ordre des clés d'une pose réutilisée suit
// sa première utilisation ; seul le contenu compte pour character-v2.js et pour les autres variantes Into).
const present = (g) => Object.fromEntries(Object.keys(g ?? {}).filter((k) => g[k] !== undefined).sort().map((k) => [k, Array.isArray(g[k]) ? g[k].slice() : g[k]]));
const content = (p) => (p && typeof p === 'object' ? { angles: present(p.angles), offsets: present(p.offsets), scales: present(p.scales) } : p);

describe('pose-v2.js réécrit : poses identiques à l\'oracle (Object.is, forme comprise)', () => {
  it(`poseAt : ${POSE_CASES.length} cas (${RIGS.length} variantes des 5 personnages × toutes les animations, phases et paramètres)`, () => expect(compare(POSE_CASES, NP.poseAt, OP.poseAt)).toEqual([]));
  it(`blendPoses : ${BLEND.length} cas`, () => expect(compare(BLEND, NP.blendPoses, OP.blendPoses)).toEqual([]));
  it(`addPose : ${ADD.length} cas`, () => expect(compare(ADD, NP.addPose, OP.addPose)).toEqual([]));
  it('touche, groundLift, cycleSeconds, armIK, strikesPerPlank : tous les rigs', () => {
    const phases = [0, 0.3, 0.5, 1, -1, NaN];
    const anims = [...OP.ZOMBIE_ANIMS, ...OP.PLAYER_ANIMS, 'inconnue'];
    const bad = [
      ...compare(RIGS.flatMap((r) => phases.map((p) => [r.rig, p, { amplitude: 1 }, poses])), NP.touche, OP.touche),
      ...compare(SAMPLES.map((s) => [s.rig, s.pose, poses]), NP.groundLift, OP.groundLift),
      ...compare([[RIGS[0].rig, { offsets: {} }, {}], [RIGS[0].rig, {}, { contacts: [{ joint: 'nul' }] }]], NP.groundLift, OP.groundLift),
      ...compare(RIGS.flatMap((r) => anims.map((a) => [r.rig, a, { rythme: 1, repairTime: 0.9 }, poses])), NP.cycleSeconds, OP.cycleSeconds),
      ...compare(RIGS.flatMap((r) => anims.map((a) => [r.rig, a, {}, {}])), NP.cycleSeconds, OP.cycleSeconds),
      ...compare([[10, 9, [1, -2, 14]], [10, 9, [0, 0, 0]], [3, 3, [100, 0, 0]], [10, 9, [-1, 5, -3]]], NP.armIK, OP.armIK),
      ...compare([[1.8, poses], [0.2, poses], [undefined, {}], [NaN, poses]], NP.strikesPerPlank, OP.strikesPerPlank),
    ];
    expect(bad).toEqual([]);
  });
  it('mêmes exports que l\'oracle, plus les variantes Into et leurs tampons', () => {
    expect(Object.keys(NP).filter((k) => !(k in OP)).sort()).toEqual(['addPoseInto', 'blendPosesInto', 'copyPoseInto', 'createPose', 'createPoseWork', 'poseAtInto', 'toucheInto']);
    expect(Object.keys(OP).filter((k) => !(k in NP))).toEqual([]);
    expect(Object.keys(NC).filter((k) => !(k in OC)).sort()).toEqual(['eulerMatrixInto', 'jointMatricesInto', 'jointMatricesOverInto']);
    expect(Object.keys(OC).filter((k) => !(k in NC))).toEqual([]);
  });
});

describe('poses Into : un tampon et un espace de travail pour tous les cas, rien de gardé d\'un appel à l\'autre, deux ordres', () => {
  const run = (cases, make) => {
    const bad = [];
    cases.forEach((args, i) => {
      const a = call(OP.poseAt, args);
      const b = call(make, args);
      const d = a.ok !== b.ok ? 'exception' : a.ok ? diff(content(a.v), b.v) : null;
      if (d && bad.length < 5) bad.push(`cas ${i} : ${d}`);
    });
    return bad;
  };
  it('poseAtInto (dans l\'ordre, puis à l\'envers)', () => {
    for (const list of [POSE_CASES, [...POSE_CASES].reverse()]) {
      const out = NP.createPose();
      const work = NP.createPoseWork();
      expect(run(list, (...args) => {
        const r = NP.poseAtInto(out, work, ...args);
        if (r !== out) throw new Error('le résultat doit être out');
        return content(r);
      })).toEqual([]);
    }
  });
  it('blendPosesInto, addPoseInto, toucheInto, copyPoseInto', () => {
    const out = NP.createPose();
    const bad = [];
    const check = (cases, fn, ref) => cases.forEach((args, i) => {
      const a = call(ref, args);
      const b = call((...x) => content(fn(...x)), args);
      const d = a.ok !== b.ok ? 'exception' : a.ok ? diff(content(a.v), b.v) : null;
      if (d && bad.length < 5) bad.push(`${ref.name} ${i} : ${d}`);
    });
    // Entrées : poses de l'oracle (sans valeur undefined, où les deux conventions coïncident).
    check(BLEND.slice(4), (a, b, t) => NP.blendPosesInto(out, a, b, t), OP.blendPoses);
    check(ADD.slice(3), (a, b, w) => NP.addPoseInto(out, a, b, w), OP.addPose);
    check(RIGS.map((r, i) => [r.rig, i / RIGS.length, { amplitude: 0.5 }, poses]), (...x) => NP.toucheInto(out, ...x), OP.touche);
    check(SAMPLES.map((s) => [s.pose]), (p) => NP.copyPoseInto(out, p), function copie(p) { return p; }); // copie exacte (fondu depuis la pose précédente)
    expect(bad).toEqual([]);
  });
  it('chaîne du jeu (character-v2.js) : pose, fondu depuis la précédente, touché ajouté, avec des tampons réutilisés', () => {
    const rnd = (() => {
      let s = 7;
      return () => ((s = (s * 16807) % 2147483647) / 2147483647);
    })();
    const bufs = { cur: NP.createPose(), prev: NP.createPose(), blend: NP.createPose(), hurt: NP.createPose(), add: NP.createPose(), work: NP.createPoseWork() };
    let prevOracle = null;
    const bad = [];
    for (let i = 0; i < 3000; i += 1) {
      const r = RIGS[Math.floor(rnd() * RIGS.length)].rig;
      const anims = r.kind === 'player' ? OP.PLAYER_ANIMS : OP.ZOMBIE_ANIMS;
      const anim = anims[Math.floor(rnd() * anims.length)];
      const phase = rnd() * 2;
      const params = rnd() < 0.5 ? {} : { amplitude: 1, twist: rnd() - 0.5, recoil: rnd() };
      const t = rnd();
      const hurt = rnd() < 0.3 ? rnd() : null;
      let o = OP.poseAt(r, anim, phase, params, poses);
      let n = NP.poseAtInto(bufs.cur, bufs.work, r, anim, phase, params, poses);
      if (prevOracle && t < 0.6) {
        o = OP.blendPoses(prevOracle, o, t);
        n = NP.blendPosesInto(bufs.blend, bufs.prev, n, t);
      }
      if (hurt !== null) {
        o = OP.addPose(o, OP.touche(r, hurt, {}, poses), 1);
        n = NP.addPoseInto(bufs.add, n, NP.toucheInto(bufs.hurt, r, hurt, {}, poses), 1);
      }
      const d = diff(content(o), content(n));
      if (d && bad.length < 5) bad.push(`pas ${i} : ${d}`);
      prevOracle = o;
      NP.copyPoseInto(bufs.prev, n);
    }
    expect(bad).toEqual([]);
  });
});

describe('pureté et absence d\'allocation des poses', () => {
  for (const f of ['pose-v2', 'character-parts']) {
    const src = readFileSync(`js/core/${f}.js`, 'utf8');
    it(`${f}.js : aucun état modifiable au premier niveau, aucune horloge, aucun hasard, aucun DOM`, () => {
      expect(src.match(/^(let|var) /gm)).toBeNull();
      expect(src).not.toMatch(/Math\.random|Date\.now|performance\.|document\.|window\.|localStorage/);
    });
  }
  it('corps des fonctions chaudes sans map/filter/reduce/forEach/slice/concat/entries, décomposition, littéral ni fermeture', () => {
    const src = readFileSync('js/core/pose-v2.js', 'utf8') + readFileSync('js/core/character-parts.js', 'utf8');
    const names = ['setA', 'setO', 'clearPose', 'legTo', 'armTo', 'applyPosture', 'zombieArms', 'locomote', 'playerArms', 'stand', 'blendGroup', 'blendOne', 'blendTo', 'keyedTo', 'lowOf', 'liftTo', 'attente', 'rampe', 'arracher', 'escalade', 'vaultPose', 'enjamber', 'attaque', 'toucheTo', 'mort', 'repos', 'terre', 'reparation', 'kneelPose', 'poseTo', 'addTo', 'copyGroup', 'copyPoseInto', 'eulerTo', 'earlier', 'matricesTo'];
    for (const name of names) {
      const start = src.indexOf(`function ${name}(`);
      expect(start, name).toBeGreaterThan(-1);
      // Repli d'un rig invalide (rigOf({}, {}), comme l'ancien code) : seule allocation tolérée hors des tampons.
      const body = src.slice(src.indexOf('{', start) + 1, src.indexOf('\n}\n', start)).replace('rigOf({}, {})', 'rigOf()');
      expect(body, name).not.toMatch(/\.(map|filter|reduce|forEach|slice|concat|entries|keys|find)\(/);
      expect(body, name).not.toMatch(/\.\.\.|=>|function\b|`/);
      expect(body, name).not.toMatch(/(const|let) \{|(const|let) \[/);
      // Littéraux autorisés seulement à la création paresseuse d'un tableau ou d'une entrée réutilisés (une fois par tampon).
      const literals = (body.match(/[=(,:?]\s*[[{]/g) ?? []).length;
      const lazy = (body.match(/= \[0, 0, 0\];|= \{ m: new Array\(9\), t: new Array\(3\) \};|pose\.angles\[id\] = \[x, y, z\];|pose\.offsets\[id\] = \[x, y, z\];|work\.mats = \{\};/g) ?? []).length;
      expect(literals, name).toBe(lazy);
    }
  });
});
