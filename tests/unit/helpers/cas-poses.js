// Lot 5d — Générateur de cas des poses (js/core/pose-v2.js, js/core/character-parts.js), graine fixe : les 5 personnages (joueur et 4 zombies),
// toutes leurs variantes (A, B, C, riche…) et les trois styles d'animation, toutes les animations, phases tirées et limites (0, 1, voisines,
// négatives, NaN, Infinity), paramètres d'animation (macros, foulée, torsion, recul, réparation, appui), toutes les articulations.
// Les rigs sont construits une fois avec l'oracle ; les mêmes objets sont passés à l'oracle et au code réécrit. Aucun Math.random.
import { readFileSync } from 'node:fs';
import { resolveVariant } from '../../../js/core/persos-variants.js';
import { PLAYER_ANIMS, ZOMBIE_ANIMS, poseAt, rigOf } from './oracle/pose-v2.oracle.js';
import { SPECIAL, stream } from './cas-collision.js';

const load = (name) => JSON.parse(readFileSync(`data/game/${name}.json`, 'utf8'));
export const characters = load('characters-v2');
export const poses = load('poses-v2');
export const skeletons = poses.skeletons;

const pick = (rnd, list) => list[Math.floor(rnd() * list.length)];
export const PHASES = [0, -0, 1, 1e-9, 1 - 1e-9, 0.5, 0.25, 0.999999, -0.25, -1, 2.5, 7.3, 1e-300, 1e9, NaN, Infinity, -Infinity];

// Variantes concrètes : chaque emplacement × chaque variante × styles A, B, C × quelques tenues et paliers d'usure.
function buildRigs() {
  const out = [];
  for (const slot of characters.slots) {
    for (const v of slot.variants) {
      for (const style of [null, 'A', 'B', 'C']) {
        const base = style ? { ...v, style } : v;
        const outfits = Math.max(1, (v.outfits ?? []).length);
        for (const outfit of [0, outfits - 1]) {
          const res = resolveVariant(base, { wearTiers: characters.wearTiers, outfit, wear: outfit % 4 });
          out.push({ id: `${slot.id}/${v.id}/${style ?? '-'}/${outfit}`, slot: slot.id, rig: rigOf(res, skeletons), variant: res });
        }
      }
    }
  }
  return out;
}
export const RIGS = buildRigs();

// Paramètres d'animation tirés (macros −2 à 2, foulée, torsion, recul, temps de réparation, appui) ou vides.
export function randomParams(rnd) {
  const u = rnd();
  if (u < 0.3) return {};
  if (u < 0.35) return pick(rnd, [null, undefined, 'x', { amplitude: NaN }, { stride: -5 }, { recoil: 3 }, { repairTime: 0.1 }]);
  const p = {};
  for (const k of ['amplitude', 'rythme', 'lourdeur']) if (rnd() < 0.6) p[k] = Math.round((rnd() * 4 - 2) * 4) / 4;
  if (rnd() < 0.3) p.stride = 20 + rnd() * 80;
  if (rnd() < 0.4) p.twist = rnd() * 2 - 1;
  if (rnd() < 0.4) p.recoil = rnd() < 0.2 ? pick(rnd, [0, 1]) : rnd();
  if (rnd() < 0.3) p.repairTime = 0.3 + rnd() * 1.8;
  if (rnd() < 0.3) p.sill = 10 + rnd() * 10;
  return p;
}

// poseAt : chaque rig × chaque animation (et une inconnue) × phases limites, puis phases et paramètres tirés.
export function casPoseAt(perRig = 40, seed = 61) {
  const rnd = stream(seed);
  const out = [];
  for (const r of RIGS) {
    const anims = [...(r.rig.kind === 'player' ? PLAYER_ANIMS : ZOMBIE_ANIMS), 'inconnue'];
    for (const a of anims) for (const ph of [0, 1, 0.5, 1 - 1e-9, -0.25, NaN]) out.push([r.rig, a, ph, {}, poses]);
    for (let i = 0; i < perRig; i += 1) out.push([r.rig, pick(rnd, anims), rnd() < 0.15 ? pick(rnd, PHASES) : rnd() * 3 - 1, randomParams(rnd), poses]);
  }
  out.push([null, 'marche', 0.3, {}, poses], [undefined, undefined, undefined, undefined, undefined], [RIGS[0].rig, 'marche', 0.3, {}, {}], [RIGS[0].rig, 'marche', 0.3, {}, null]);
  return out;
}

// Poses produites par l'oracle (entrées de blendPoses, addPose, jointMatrices, groundLift).
export function samplePoses(n = 400, seed = 62) {
  const rnd = stream(seed);
  const out = [];
  for (let i = 0; i < n; i += 1) {
    const r = pick(rnd, RIGS);
    const anims = r.rig.kind === 'player' ? PLAYER_ANIMS : ZOMBIE_ANIMS;
    out.push({ rig: r.rig, pose: poseAt(r.rig, pick(rnd, anims), rnd(), randomParams(rnd), poses) });
  }
  return out;
}

export function casBlend(n = 1500, seed = 63) {
  const rnd = stream(seed);
  const ps = samplePoses(200, seed + 1);
  const out = [[{}, {}, 0.5], [null, undefined, NaN], [ps[0].pose, {}, 0.3], [{ angles: { a: [1] }, scales: { a: 'x' } }, { offsets: { b: [1, 2, 3] } }, 0.7]];
  while (out.length < n) out.push([pick(rnd, ps).pose, pick(rnd, ps).pose, rnd() < 0.2 ? pick(rnd, [...SPECIAL, 0.5 - 1e-12, 0.5]) : rnd()]);
  return out;
}

export function casAdd(n = 1000, seed = 64) {
  const rnd = stream(seed);
  const ps = samplePoses(200, seed + 1);
  const out = [[{}, {}, 1], [null, null, undefined], [ps[0].pose, ps[1].pose, NaN]];
  while (out.length < n) out.push([pick(rnd, ps).pose, pick(rnd, ps).pose, rnd() < 0.2 ? pick(rnd, SPECIAL) : rnd() * 2 - 0.5]);
  return out;
}

// jointMatrices : articulations de chaque rig, poses de l'oracle, échelles et décalages tirés, échelle globale (dont invalides).
export function casJointMatrices(n = 1500, seed = 65) {
  const rnd = stream(seed);
  const ps = samplePoses(300, seed + 1);
  const out = [[RIGS[0].rig.joints, {}, 1], [RIGS[0].rig.joints, undefined, undefined], [RIGS[0].rig.joints, null, NaN], [[], {}, 1]];
  while (out.length < n) {
    const { rig, pose } = pick(rnd, ps);
    const u = rnd();
    let p = pose;
    if (u < 0.2) {
      const id = pick(rnd, rig.joints).id;
      p = { ...pose, scales: { ...(pose.scales ?? {}), [id]: pick(rnd, [0, -1, 2, NaN, 0.5]) }, offsets: { ...(pose.offsets ?? {}), [id]: pick(rnd, [[1, 2, 3], [1], 'x', [NaN, 0, 0]]) } };
    }
    out.push([rig.joints, p, rnd() < 0.2 ? pick(rnd, [...SPECIAL, 1.3, 0.85]) : 1]);
  }
  return out;
}

export function casEuler(n = 3000, seed = 66) {
  const rnd = stream(seed);
  const out = [[[0, 0, 0]], [[1, 2, 3], 'YXZ'], [undefined, 'XYZ'], [null, 'ZYX'], [[1, 2], 'YXZ'], [[1, NaN, 3]], ['abc'], [[1, 2, 3, 4], 'YXZ']];
  while (out.length < n) {
    const a = [0, 1, 2].map(() => (rnd() < 0.05 ? pick(rnd, SPECIAL) : rnd() * 8 - 4));
    out.push([a, pick(rnd, ['XYZ', 'YXZ', 'YXZ', undefined])]);
  }
  return out;
}
