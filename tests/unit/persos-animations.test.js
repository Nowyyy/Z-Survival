import { describe, it, expect } from 'vitest';
import { CYCLIC, DEATHS, LOCOMOTION, PLAYER_ANIMS, ZOMBIE_ANIMS, addPose, armIK, blendPoses, cycleSeconds, fromV1, poseAt, rigOf, strikesPerPlank, touche } from '../../js/core/pose-v2.js';
import { computePose } from '../../js/core/pose.js';
import { jointMatrices } from '../../js/core/character-parts.js';
import { ANIMS_OF, animChecks, characters, footSlide, load, poses, resolve, skeletons, v2Rig } from '../../scripts/personnages/lib.mjs';

// Lot 3j-B : toutes les animations de pose-v2.js sur toutes les variantes : plages articulaires, périodicité, continuité, glissement des pieds,
// sol, pénétration des bras dans le tronc, morts à plat.
const MAX_SPEED = 65; // rad/s : borne de continuité (une discontinuité de 1 rad sur un pas d'échantillonnage dépasse 200 rad/s)
const variants = characters.slots.flatMap((s) => s.variants.filter((v) => !v.flags?.test).map((v) => [s.id, v.id, s, v]));
const cases = variants.flatMap(([sid, vid, s, v]) => ANIMS_OF(s.id === 'joueur' ? 'player' : 'zombie').map((a) => [sid, vid, a, s, v]));
const FREE = [...DEATHS, 'terre', 'relevage'];

describe('liste des animations', () => {
  it('zombies : attente, marches, rampe, course, arracher, escalade, attaque, touché, trois morts, escalier', () => {
    expect(ZOMBIE_ANIMS).toEqual(['attente', 'marcheLente', 'marche', 'rampe', 'course', 'arracher', 'escalade', 'attaque', 'touche', 'mortAvant', 'mortArriere', 'effondrement', 'escalier']);
  });
  it('joueur : repos, marche, tir, touché, à terre, relevage, réparation', () => expect(PLAYER_ANIMS).toEqual(['repos', 'marche', 'tir', 'touche', 'terre', 'relevage', 'reparation']));
  it('trois styles (A mesuré, B lourd et saccadé, C amplitudes nettes) et trois macros d\'animation', () => {
    expect(Object.keys(poses.styles)).toEqual(['A', 'B', 'C']);
    expect(Object.keys(poses.macros)).toEqual(['amplitude', 'rythme', 'lourdeur']);
    expect(poses.styles.B.walk.jerk).toBeGreaterThan(0);
    expect(poses.styles.B.walk.crouch).toBeGreaterThan(poses.styles.A.walk.crouch);
  });
  it('foulées des marches identiques à gaits.json ; joueur : 2π / 0,09', () => {
    const g = load('gaits').gaits;
    expect([poses.strides.marcheLente, poses.strides.marche, poses.strides.rampe, poses.strides.course]).toEqual([g.lent.stride, g.marche.stride, g.rampe.stride, g.course.stride]);
    expect(poses.strides.joueur).toBeCloseTo((2 * Math.PI) / 0.09, 3);
  });
});

describe.each(cases)('%s %s : %s', (_sid, _vid, anim, slot, variant) => {
  const c = animChecks(slot, variant, anim, { n: 60 });
  it('angles dans les plages articulaires', () => expect(c.range).toEqual([]));
  it('continuité : vitesse angulaire bornée', () => expect(c.maxSpeed).toBeLessThan(MAX_SPEED));
  if (CYCLIC.includes(anim)) it('périodique : phase 0 = phase 1 à 1e-6', () => expect(c.periodic).toBeLessThan(1e-6));
  if (!FREE.includes(anim)) it('aucune pièce sous le sol (0,5)', () => expect(c.belowGround).toBeGreaterThanOrEqual(-0.5));
  if (anim !== 'touche') it('aucune pénétration des bras dans le tronc au-delà de 1,5', () => expect(c.penetration).toBeLessThanOrEqual(1.5));
  if (LOCOMOTION.includes(anim) || (slot.id === 'joueur' && anim === 'marche')) it('glissement du pied d\'appui ≤ 15 %', () => expect(c.slide).toBeLessThanOrEqual(0.15));
  if (DEATHS.includes(anim)) {
    it('se termine à plat (point le plus haut ≤ 40 % de la hauteur) dans l\'emprise × 1,6', () => {
      expect(c.flat).toBeLessThanOrEqual(0.4);
      expect(c.deathReach).toBeLessThanOrEqual(1.6);
    });
  }
});

describe('marche : symétrie et pieds', () => {
  it.each(variants.filter(([sid]) => sid !== 'joueur'))('%s %s : jambe gauche à la phase p = jambe droite à p + 0,5', (_s, _v, _slot, v) => {
    const rig = v2Rig(resolve(v));
    for (const p of [0, 0.13, 0.4, 0.77]) {
      const a = poseAt(rig, 'marche', p, {}, poses).angles;
      const b = poseAt(rig, 'marche', p + 0.5, {}, poses).angles;
      for (const j of ['hip', 'knee', 'ankle']) {
        expect(a[`${j}L`][0]).toBeCloseTo(b[`${j}R`][0], 6);
        expect(a[`${j}L`][1]).toBeCloseTo(-b[`${j}R`][1], 6);
      }
    }
  });
  it('les marches du joueur et des zombies ont un pied d\'appui à vitesse au sol nulle (moyenne des variantes A)', () => {
    for (const s of characters.slots) expect(footSlide(resolve(s.variants.find((v) => v.id === 'A')), s.id === 'joueur' ? 'marche' : 'marche')).toBeLessThan(0.01);
  });
  it('macros d\'animation aux limites : glissement toujours ≤ 15 % et aucun NaN', () => {
    const v = resolve(characters.slots[1].variants[0]);
    for (const amplitude of [-2, 0, 2]) {
      for (const lourdeur of [-2, 0, 2]) {
        expect(footSlide(v, 'marche', { amplitude, lourdeur })).toBeLessThanOrEqual(0.15);
        const pose = poseAt(v2Rig(v), 'course', 0.3, { amplitude, lourdeur, rythme: 2 }, poses);
        for (const a of Object.values(pose.angles)) for (const x of a) expect(Number.isFinite(x)).toBe(true);
      }
    }
  });
});

describe('fondu, touché, réparation, durées', () => {
  const rig = v2Rig(resolve(characters.slots[1].variants[0]));
  it('blendPoses : bornes exactes et continu (écart borné par le pas de t)', () => {
    const a = poseAt(rig, 'attente', 0.2, {}, poses);
    const b = poseAt(rig, 'course', 0.6, {}, poses);
    expect(blendPoses(a, b, 0).angles.hipL).toEqual(a.angles.hipL);
    expect(blendPoses(a, b, 1).angles.hipL).toEqual(b.angles.hipL);
    let prev = blendPoses(a, b, 0);
    for (let i = 1; i <= 20; i += 1) {
      const cur = blendPoses(a, b, i / 20);
      for (const id of Object.keys(cur.angles)) for (let k = 0; k < 3; k += 1) expect(Math.abs(cur.angles[id][k] - prev.angles[id][k])).toBeLessThan(0.3);
      prev = cur;
    }
    expect(blendPoses(a, b, 2)).toEqual(blendPoses(a, b, 1));
  });
  it('fondu de 0,15 s entre deux poses (données)', () => expect(poses.durations.blend).toBe(0.15));
  it('touché : additif, nul aux deux bouts de ses 0,25 s', () => {
    expect(poses.durations.touche).toBe(0.25);
    for (const p of [0, 1]) for (const a of Object.values(touche(rig, p, {}, poses).angles)) for (const x of a) expect(Math.abs(x)).toBeLessThan(1e-9);
    const base = poseAt(rig, 'attente', 0, {}, poses);
    expect(addPose(base, touche(rig, 0.5, {}, poses)).angles.spine[0]).toBeLessThan(base.angles.spine[0]);
  });
  it.each([0.4, 0.8, 1.2, 1.8])('réparation, %f s par planche : un nombre entier de coups, cycle = durée / coups', (t) => {
    const prig = v2Rig(resolve(characters.slots[0].variants[0]));
    const n = strikesPerPlank(t, poses);
    expect(Number.isInteger(n) && n >= 1).toBe(true);
    expect(cycleSeconds(prig, 'reparation', { repairTime: t }, poses) * n).toBeCloseTo(t, 9);
    const a = poseAt(prig, 'reparation', 0, { repairTime: t }, poses);
    expect(a.scales.tool).toBe(1);
    expect(a.scales.prop).toBe(0);
  });
  it('rythme : accélère les animations au temps, jamais les marches (vitesses de déplacement inchangées)', () => {
    expect(cycleSeconds(rig, 'attente', { rythme: 2 }, poses)).toBeLessThan(cycleSeconds(rig, 'attente', {}, poses));
    expect(cycleSeconds(rig, 'marche', { rythme: 2 }, poses)).toBeNull();
    expect(load('player').speed).toBe(220);
  });
  it('rampe : bassin plus bas et tronc presque horizontal (comme aujourd\'hui)', () => {
    const p = poseAt(rig, 'rampe', 0.3, {}, poses);
    const m = jointMatrices(rig.joints, p, 1);
    const v1 = fromV1(computePose({ state: 'rampe', phase: 0.3 * 2 * Math.PI, amount: 0.7 })).offsets.pelvis[1] + 27; // bassin du rampant actuel
    expect(Math.abs(m.pelvis.t[1] - v1)).toBeLessThan(4);
    expect(p.angles.spine[0] + p.angles.chest[0] + p.angles.pelvis[0]).toBeGreaterThan(1.1);
  });
  it('armIK : la main atteint la cible accessible', () => {
    const t = [-9, -6, 14];
    const [sh, el] = armIK(10, 9, t);
    const joints = [{ id: 's', parent: null, offset: [0, 0, 0] }, { id: 'e', parent: 's', offset: [0, -10, 0] }, { id: 'w', parent: 'e', offset: [0, -9, 0] }];
    const m = jointMatrices(joints, { angles: { s: sh, e: el } }, 1);
    for (let k = 0; k < 3; k += 1) expect(m.w.t[k]).toBeCloseTo(t[k], 6);
  });
  it('entrées hostiles : animation inconnue, phase NaN, gabarit vide : une pose finie, aucune exception', () => {
    for (const [r, a, p] of [[rig, 'danse', 0.3], [rig, 'marche', NaN], [null, 'marche', 0.2], [rigOf(null, null), 'course', Infinity]]) {
      const pose = poseAt(r, a, p, null, poses);
      for (const v of Object.values(pose.angles)) for (const x of v) expect(Number.isFinite(x)).toBe(true);
    }
  });
  it('squelette v2 lu par rigOf : longueurs des segments de la variante (bras longs de B)', () => {
    const b = v2Rig(resolve(characters.slots[1].variants.find((v) => v.id === 'B')));
    expect(b.upper).toBeCloseTo(11.5, 9);
    expect(b.fore).toBeCloseTo(10.5, 9);
    expect(rigOf(characters.slots[1].variants[0], skeletons).thigh).toBe(12);
  });
});
