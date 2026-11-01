import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { contrast, luminance } from '../../js/core/color.js';
import { LEVELS, bloodBudget, burst, capParticles, corpseSink, corpsesAdd, corpsesStep, decalAlpha, decalAtlas, decalsAdd, decalsStep, impactDecals, levelOf, settings, stepParticles, woundTier } from '../../js/core/blood.js';
import { createBloodFx } from '../../js/game/blood-fx.js';
import { ZOMBIES, characters, floorMeans, gameView, load, lookup, radiusOf, slotOf, variantMetrics } from '../../scripts/personnages/lib.mjs';

// Lot 3j-C : sang (particules, taches, blessures, cadavres) : niveaux, plafonds, déterminisme, budget, lisibilité, contenu.
const cfg = load('blood');
const DIR = { x: 1, y: 0.2 };
const run = (level, events, seconds, dt = 1 / 60) => {
  const parent = new THREE.Group();
  const fx = createBloodFx({ parent, cfg, level, lookup, seed: 5 });
  let t = 0;
  for (const e of events) fx[e.type](e);
  while (t < seconds) {
    fx.update(dt);
    t += dt;
  }
  fx.sync('rdc');
  return { fx, parent };
};

describe('niveaux et réglages (blood.json)', () => {
  it('trois niveaux : 0, réduit, complet ; valeurs inconnues : 0', () => {
    expect(LEVELS).toEqual(['0', 'reduit', '1']);
    expect([levelOf('1'), levelOf('complet'), levelOf('reduit'), levelOf('réduit'), levelOf('2'), levelOf(null), levelOf('<x>'), levelOf(1)]).toEqual(['1', '1', 'reduit', 'reduit', '0', '0', '0', '1']);
  });
  it.each([['0', 0, 0, 0, 0, 0], ['reduit', 3, 8, 96, 12, 8], ['1', 8, 20, 256, 48, 20]])('niveau %s : %i particules par tir, %i par mort, %i vivantes au plus, %i taches de %i s au plus', (l, hit, kill, maxP, maxD, life) => {
    const s = settings(cfg, l);
    expect([s.hit, s.kill, s.maxParticles, s.maxDecals, s.decalLife]).toEqual([hit, kill, maxP, maxD, life]);
  });
  it('complet : fondu des 5 dernières secondes, taches sur les corps, cadavres de 6 s ; réduit : corps sans taches, cadavres de 2 s, teinte plus sombre', () => {
    const c = settings(cfg, '1');
    const r = settings(cfg, 'reduit');
    expect([c.fade, c.bodyStains, c.corpseLife]).toEqual([5, true, 6]);
    expect([r.bodyStains, r.corpseLife, r.tint]).toEqual([false, 2, '--sang-reduit']);
    expect(luminance(lookup(r.tint))).toBeLessThan(luminance(lookup(c.tint)));
  });
  it('joueur touché : au plus 4 particules (réduit et complet), aucune au niveau 0', () => {
    expect(settings(cfg, '1').player).toBeLessThanOrEqual(4);
    expect(settings(cfg, 'reduit').player).toBeLessThanOrEqual(4);
    expect(burst(1, 'player', DIR, '0', cfg)).toEqual([]);
  });
  it('au plus 6 cadavres simultanés, données provisoires marquées', () => {
    expect(cfg.corpses.max).toBe(6);
    for (const l of LEVELS) expect(settings(cfg, l).corpses).toBeLessThanOrEqual(6);
    expect(cfg._provisoire.length).toBeGreaterThan(40);
  });
});

describe('burst : particules déterministes', () => {
  it('même graine, mêmes particules ; graine différente, autres particules', () => {
    expect(burst(42, 'hit', DIR, '1', cfg, { x: 3, y: 4 })).toEqual(burst(42, 'hit', DIR, '1', cfg, { x: 3, y: 4 }));
    expect(burst(43, 'hit', DIR, '1', cfg)).not.toEqual(burst(42, 'hit', DIR, '1', cfg));
  });
  it.each([['hit', '1', 8], ['kill', '1', 20], ['hit', 'reduit', 3], ['kill', 'reduit', 8], ['player', '1', 4], ['hit', '0', 0], ['kill', '0', 0]])('%s au niveau %s : %i particules', (kind, level, n) => expect(burst(7, kind, DIR, level, cfg)).toHaveLength(n));
  it('direction : les particules d\'un tir partent dans le sens de la balle (cône)', () => {
    for (const p of burst(9, 'hit', { x: 1, y: 0 }, '1', cfg)) expect(p.vx).toBeGreaterThan(0);
    for (const p of burst(9, 'hit', { x: 0, y: -1 }, '1', cfg)) expect(p.vy).toBeLessThan(0);
  });
  it('tailles, durées et vitesses dans les bornes de blood.json ; départ au-dessus du sol', () => {
    for (const p of [...burst(1, 'kill', DIR, '1', cfg), ...burst(2, 'hit', DIR, '1', cfg)]) {
      expect(p.size).toBeGreaterThanOrEqual(cfg.particles.size[0]);
      expect(p.size).toBeLessThanOrEqual(cfg.particles.size[1]);
      expect(p.life).toBeLessThanOrEqual(cfg.particles.life[1]);
      expect(p.z).toBeGreaterThan(0);
      expect(Math.hypot(p.vx, p.vy)).toBeLessThanOrEqual(cfg.particles.speed[1] + 1e-9);
    }
  });
  it('direction nulle ou entrées hostiles : aucune exception, nombres finis', () => {
    for (const p of burst(NaN, 'hit', null, '1', null)) for (const v of [p.x, p.vx, p.vz, p.size]) expect(Number.isFinite(v)).toBe(true);
    expect(burst(1, 'inconnu', DIR, '1', cfg)).toHaveLength(8);
  });
});

describe('stepParticles et taches', () => {
  it('gravité : la hauteur finit par baisser, la vitesse verticale diminue', () => {
    const [p] = burst(3, 'hit', DIR, '1', cfg);
    const a = stepParticles([p], 0.02, cfg).particles[0];
    expect(a.vz).toBeLessThan(p.vz);
    let list = [p];
    let landed = [];
    for (let i = 0; i < 200 && list.length; i += 1) {
      const r = stepParticles(list, 1 / 60, cfg);
      list = r.particles;
      landed = landed.concat(r.landed);
    }
    expect(list).toEqual([]);
  });
  it('une particule qui touche le sol devient une goutte (conversion en tache) ; durée de vie respectée', () => {
    const p = { x: 0, y: 0, z: 0.5, vx: 0, vy: 0, vz: -100, life: 5, age: 0, size: 1, shade: 0.5, floor: 'rdc' };
    expect(stepParticles([p], 0.05, cfg).landed).toHaveLength(1);
    const q = { ...p, z: 100, vz: 0, life: 0.01 };
    expect(stepParticles([q], 0.05, cfg)).toEqual({ particles: [], landed: [] });
  });
  it('les arguments ne sont pas modifiés', () => {
    const list = Object.freeze(burst(1, 'hit', DIR, '1', cfg).map((p) => Object.freeze(p)));
    expect(() => stepParticles(list, 0.1, cfg)).not.toThrow();
  });
  it('plafond des particules : les plus anciennes partent', () => {
    expect(capParticles([1, 2, 3, 4], 2)).toEqual([3, 4]);
    expect(capParticles(null, 2)).toEqual([]);
  });
  it('taches immuables (gelées) ; plafond par niveau ; éviction de la plus ancienne', () => {
    let d = Object.freeze([]);
    for (let i = 0; i < 20; i += 1) d = decalsAdd(d, [{ x: i, y: 0, size: 3 }], 'reduit', cfg, i);
    expect(Object.isFrozen(d)).toBe(true);
    expect(Object.isFrozen(d[0])).toBe(true);
    expect(d).toHaveLength(12);
    expect(d[0].x).toBe(8);
    expect(decalsAdd(d, [{ x: 99 }], '0', cfg, 0)).toEqual([]);
  });
  it.each([['reduit', 8], ['1', 20]])('niveau %s : taches retirées après %i s', (l, life) => {
    const d = decalsAdd([], [{ x: 0, y: 0, size: 3 }], l, cfg, 0);
    expect(decalsStep(d, life - 0.01, l, cfg)).toHaveLength(1);
    expect(decalsStep(d, life, l, cfg)).toHaveLength(0);
  });
  it('fondu : opacité 1, puis linéaire pendant les 5 dernières secondes (complet)', () => {
    const [d] = decalsAdd([], [{ x: 0, y: 0 }], '1', cfg, 0);
    expect(decalAlpha(d, 10, '1', cfg)).toBe(1);
    expect(decalAlpha(d, 17.5, '1', cfg)).toBeCloseTo(0.5, 9);
    expect(decalAlpha(d, 20, '1', cfg)).toBe(0);
    expect(decalAlpha(null, 1, '1', cfg)).toBe(1);
  });
  it('formes de taches : 4, tirées par graine', () => {
    let d = [];
    for (let i = 0; i < 40; i += 1) d = decalsAdd(d, [{ x: i }], '1', cfg, 0, i);
    expect(new Set(d.map((x) => x.shape)).size).toBe(4);
  });
  it.each(ZOMBIES)('aucune tache plus grande que 1,2 × l\'emprise (%s)', (z) => {
    const limit = cfg.decals.maxFootprint * 1.3 * radiusOf(z);
    expect(cfg.decals.killSize[1]).toBeLessThanOrEqual(limit);
    for (let s = 1; s < 30; s += 1) for (const d of impactDecals(s, 'kill', { x: 0, y: 0 }, DIR, cfg)) expect(d.size).toBeLessThanOrEqual(limit);
  });
  it('atlas des taches : 4 formes générées, alpha seul, déterministe', () => {
    const a = decalAtlas(128, 31);
    expect(a.size).toBe(128);
    expect(decalAtlas(128, 31).data).toEqual(a.data);
    const opaque = (qx, qy) => {
      let n = 0;
      for (let y = qy * 64; y < qy * 64 + 64; y += 1) for (let x = qx * 64; x < qx * 64 + 64; x += 1) if (a.data[(y * 128 + x) * 4 + 3] > 0) n += 1;
      return n;
    };
    const counts = [opaque(0, 0), opaque(1, 0), opaque(0, 1), opaque(1, 1)];
    for (const c of counts) expect(c).toBeGreaterThan(200);
    expect(new Set(counts).size).toBeGreaterThan(1);
  });
});

describe('blessures et cadavres', () => {
  it.each([[1, 0], [0.76, 0], [0.75, 1], [0.51, 1], [0.5, 2], [0.26, 2], [0.25, 3], [0, 3], [-1, 3], [NaN, 0], [2, 0]])('woundTier(%f) = %i (bornes 0,75, 0,5, 0,25)', (f, t) => expect(woundTier(f, cfg.wounds)).toBe(t));
  it('cadavres : au plus 6, le plus ancien évincé ; niveau 0 : aucun', () => {
    let c = [];
    for (let i = 0; i < 9; i += 1) c = corpsesAdd(c, { id: i, born: i }, '1', cfg);
    expect(c.map((x) => x.id)).toEqual([3, 4, 5, 6, 7, 8]);
    expect(corpsesAdd([], { id: 1, born: 0 }, '0', cfg)).toEqual([]);
  });
  it.each([['reduit', 2], ['1', 6]])('niveau %s : cadavre de %i s après sa chute de 1,2 s, puis enfoncement de 0,8 s', (l, life) => {
    const c = corpsesAdd([], { id: 1, born: 0 }, l, cfg);
    expect(corpseSink(c[0], 1.2 + life - 0.01, l, cfg)).toBe(0);
    expect(corpseSink(c[0], 1.2 + life + 0.4, l, cfg)).toBeCloseTo(0.5, 9);
    expect(corpsesStep(c, 1.2 + life + 0.79, l, cfg)).toHaveLength(1);
    expect(corpsesStep(c, 1.2 + life + 0.8, l, cfg)).toHaveLength(0);
  });
  it('les cadavres n\'ont aucun champ de jeu (ni vie, ni rayon, ni dégâts) : ils ne sont ni ciblés ni solides', () => {
    const [c] = corpsesAdd([], { id: 1, x: 3, y: 4, floor: 'rdc', type: 'grand', born: 0 }, '1', cfg);
    for (const k of ['hp', 'health', 'r', 'radius', 'damage', 'speed', 'mode']) expect(c[k]).toBeUndefined();
  });
});

describe('budget de rendu du sang', () => {
  it.each(LEVELS)('niveau %s : ≤ 3 appels et ≤ 1 200 triangles à pleine charge (calculé)', (l) => {
    const b = bloodBudget(cfg, l);
    expect(b.calls).toBeLessThanOrEqual(cfg.budget.calls);
    expect(b.triangles).toBeLessThanOrEqual(cfg.budget.triangles);
  });
  it('pleine charge mesurée (complet) : 256 particules et 48 taches = 2 maillages, 608 triangles', () => {
    const events = Array.from({ length: 40 }, (_, i) => ({ type: 'kill', x: i * 10, y: 0, dir: DIR }));
    const { fx, parent } = run('1', events, 0.05);
    const st = fx.stats();
    expect(st.particles).toBeLessThanOrEqual(256);
    expect(st.decals).toBeLessThanOrEqual(48);
    expect(st.calls).toBeLessThanOrEqual(2);
    expect(st.triangles).toBeLessThanOrEqual(1200);
    expect(parent.children.filter((o) => o.isInstancedMesh)).toHaveLength(2);
  });
  it('niveau 0 : aucune particule, aucune tache, aucun cadavre, aucune instance dessinée', () => {
    const { fx } = run('0', [{ type: 'hit', x: 0, y: 0 }, { type: 'kill', x: 0, y: 0 }, { type: 'playerHit', x: 0, y: 0 }], 2);
    expect(fx.stats()).toMatchObject({ particles: 0, decals: 0, corpses: 0, drawnParticles: 0, drawnDecals: 0, calls: 0, triangles: 0 });
  });
  it.each([['reduit', 96, 12], ['1', 256, 48]])('niveau %s : 60 s de tirs et de morts, compteurs dans leurs plafonds', (l, maxP, maxD) => {
    const parent = new THREE.Group();
    const fx = createBloodFx({ parent, cfg, level: l, lookup, seed: 2 });
    let maxSeenP = 0;
    let maxSeenD = 0;
    for (let i = 0; i < 3600; i += 1) {
      if (i % 20 === 0) fx.hit({ x: i % 300, y: 0, dir: DIR });
      if (i % 90 === 0) fx.kill({ x: i % 200, y: 50, dir: DIR });
      fx.update(1 / 60);
      const st = fx.stats();
      maxSeenP = Math.max(maxSeenP, st.particles);
      maxSeenD = Math.max(maxSeenD, st.decals);
      expect(st.corpses).toBeLessThanOrEqual(6);
    }
    expect(maxSeenP).toBeLessThanOrEqual(maxP);
    expect(maxSeenD).toBeLessThanOrEqual(maxD);
    expect(maxSeenD).toBeGreaterThan(0);
  });
  it('les taches et les particules suivent l\'étage : à l\'étage cachées quand le joueur est au rez-de-chaussée', () => {
    const parent = new THREE.Group();
    const fx = createBloodFx({ parent, cfg, level: '1', lookup, seed: 1, lift: (f) => (f === 'etage' ? 180 : 0) });
    fx.kill({ x: 0, y: 0, floor: 'etage', dir: DIR });
    fx.update(0.01);
    fx.sync('rdc');
    expect(fx.stats().drawnDecals).toBe(0);
    fx.sync('etage');
    expect(fx.stats().drawnDecals).toBeGreaterThan(0);
  });
});

describe('lisibilité sur le sol taché', () => {
  const blood = lookup('--sang-frais');
  const floors = floorMeans();
  it.each(characters.slots.flatMap((s) => ['A', 'B', 'C'].map((l) => [s.id, l])))('%s %s : contraste ≥ 3:1 sur chaque sol couvert de sang à 100 %, 60 % et 30 %', (sid, l) => {
    const m = variantMetrics(slotOf(sid), slotOf(sid).variants.find((v) => v.id === l), { camera: gameView(), floors });
    for (const f of Object.values(floors)) for (const k of [1, 0.6, 0.3]) {
      const mixed = f.map((c, i) => c + (blood[i] - c) * k);
      expect(contrast(m.rgb, mixed)).toBeGreaterThanOrEqual(3);
    }
  });
  it('le sang n\'est jamais la seule information : aucune donnée de jeu n\'est lue dans le module de sang', async () => {
    const { readFileSync } = await import('node:fs');
    const game = readFileSync('js/game/game.js', 'utf8');
    expect(game).not.toMatch(/blood\.(stats|snapshot)\(\)\.[a-z]+\s*[<>=]/);
  });
});
