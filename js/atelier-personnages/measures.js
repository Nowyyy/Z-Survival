// Mesures de l'atelier des personnages (lot 3j), sans DOM ni Three.js : mêmes calculs que scripts/personnages/lib.mjs, mais avec des
// données passées en argument (la page les charge par fetch, les tests par lecture de fichier).
import { boundsOf, characterStats, checkVariant, distinctness, fkPose, gameCamera, silhouetteMetrics } from '../core/character-parts.js';
import { contrast, luminance, mix } from '../core/color.js';
import { computePose } from '../core/pose.js';
import { fromV1, poseAt, rigOf } from '../core/pose-v2.js';
import { partRgb, resolveVariant } from '../core/persos-variants.js';
import { PALETTE_REGION } from '../core/texgen-persos.js';
import { fitDistance } from '../core/viewport.js';

export const ZOMBIE_SLOTS = ['marcheur', 'petit', 'voute', 'grand'];
const STANDING = (kind) => (kind === 'player' ? [['repos', 0], ['marche', 0], ['marche', 0.25], ['marche', 0.5], ['tir', 0.3]] : [['attente', 0], ['attente', 0.5], ['marche', 0], ['marche', 0.25], ['marche', 0.5], ['marche', 0.75], ['marcheLente', 0.25], ['course', 0], ['course', 0.25], ['attaque', 0], ['attaque', 0.35], ['attaque', 0.55]]);

// Caméra du jeu à 667 × 375 (carte par défaut) : world : world.json de la carte, render : render.json, camera : camera.json.
export function gameView(world, render, camera, width = 667, height = 375) {
  const zoom = world?.zoom ?? camera?.zoom ?? 2.5;
  const distance = fitDistance(width / height, { width: world.room.width, height: world.room.height }, render.camera.tilt, render.camera.fov, render.camera.margin) / zoom;
  return gameCamera({ fov: render.camera.fov, tilt: render.camera.tilt, distance, width, height });
}

// ctx : { characters, poses, enemies, player, lookup, floors ({ nom: [r, g, b] }), blood ([r, g, b]), atlasMeans ({ région: [r, g, b] }),
// factors (slot) -> { type de région: facteur }, camera }.
export function createMeasures(ctx) {
  const { characters, poses, lookup } = ctx;
  const skeletons = poses.skeletons;
  const slotOf = (id) => characters.slots.find((s) => s.id === id);
  const radiusOf = (id) => (id === 'joueur' ? ctx.player.radius : ctx.enemies.zombie.radius * (ctx.enemies.variants[id]?.radiusMul ?? 1));
  const floors = { ...ctx.floors };
  for (const [k, f] of Object.entries(ctx.floors)) floors[`${k}-tache`] = mix(f, ctx.blood, 0.6);
  const currentHeight = (slot) => characterStats(slot.current, { skeletons }).rest.height;
  const resolve = (v, o = {}) => resolveVariant(v, { wearTiers: characters.wearTiers, ...o });

  function v2(slotId, variantId, { outfit = 0, wear = 0, macros = {}, anim = 'marche', phase = 0.25, animMacros = {} } = {}) {
    const slot = slotOf(slotId);
    const variant = slot.variants.find((v) => v.id === variantId);
    const res = resolve(variant, { outfit, wear: slot.id === 'joueur' ? 0 : wear, macros });
    const rig = rigOf(res, skeletons);
    const stats = characterStats(res, { skeletons });
    const h = currentHeight(slot);
    const b = characters.budget;
    const rich = variant.flags?.outOfBudget === true;
    const violations = checkVariant(res, {
      skeletons,
      budget: { triangles: rich ? b.richTriangles : b.triangles, calls: b.calls, shadowCalls: b.shadowCalls, shadowTriangles: b.shadowTriangles },
      radius: radiusOf(slot.id),
      heightRange: [b.heightRange[0] * h, b.heightRange[1] * h],
      kind: slot.id === 'petit' ? 'petit' : null,
      poses: STANDING(res.kind).map(([a, p]) => ({ id: `${a} ${p}`, ...poseAt(rig, a, p, animMacros, poses) })),
    });
    const factors = ctx.factors(slot.id);
    const color = (part) => partRgb(part, res, lookup, { averageTears: true }).map((c) => (c * (factors[PALETTE_REGION[part.palette]] ?? 0.9)) / 255);
    const sil = silhouetteMetrics(res, poseAt(rig, 'marche', 0.25, animMacros, poses), ctx.camera, { skeletons, color });
    const reach = Math.max(...STANDING(res.kind).map(([a, p]) => boundsOf(fkPose(res, poseAt(rig, a, p, animMacros, poses), { skeletons }).boxes).reach));
    return finish(slot, { stats, violations, sil, reach, height: stats.rest.height, budget: rich ? b.richTriangles : b.triangles, architecture: 'rigid', anim, phase });
  }

  function current(slotId) {
    const slot = slotOf(slotId);
    const c = slot.current;
    const stats = characterStats(c, { architecture: 'articulated', skeletons });
    const walk = c.kind === 'player' ? { state: 'marche', amount: 1, phase: 1.2 } : { state: 'zombie', phase: 1.2, amount: 0.7 };
    const pose = fromV1(computePose({ seed: 1, time: 0.4, ...walk }), { lean: c.lean, headTilt: c.headTilt, armLift: c.armLift });
    const color = (part) => (ctx.atlasMeans[c.regions[part.region]] ?? [128, 128, 128]).map((x) => x / 255);
    const sil = silhouetteMetrics(c, pose, ctx.camera, { skeletons, color });
    const reach = boundsOf(fkPose(c, pose, { skeletons }).boxes).reach;
    const violations = reach > 1.3 * radiusOf(slot.id) ? [{ code: 'emprise', detail: `marche : ${reach.toFixed(2)} > ${(1.3 * radiusOf(slot.id)).toFixed(2)}` }] : [];
    return finish(slot, { stats, violations, sil, reach, height: stats.rest.height, budget: 700, architecture: 'articulated' });
  }

  function finish(slot, m) {
    const rgb = m.sil.color.map((x) => x * 255);
    const contrasts = Object.fromEntries(Object.entries(floors).map(([k, f]) => [k, contrast(rgb, f)]));
    const [minFloor, min] = Object.entries(contrasts).sort((a, b) => a[1] - b[1])[0];
    const h = currentHeight(slot);
    const violations = [...m.violations];
    if (min < 3) violations.push({ code: 'contraste', detail: `${min.toFixed(2)}:1 sur ${minFloor}` });
    return {
      slot: slot.id,
      ...m,
      calls: m.architecture === 'rigid' ? m.stats.calls + m.stats.shadowCalls : m.stats.pieces + m.stats.casters,
      rgb,
      luminance: luminance(rgb),
      contrasts,
      minContrast: min,
      minFloor,
      radius: radiusOf(slot.id),
      heightRange: [characters.budget.heightRange[0] * h, characters.budget.heightRange[1] * h],
      violations,
    };
  }

  // Écart minimal de silhouette avec les autres types de zombies de la même intention (Actuel : leurs versions actuelles).
  function gap(slotId, variantId, mine) {
    if (!ZOMBIE_SLOTS.includes(slotId)) return null;
    const others = ZOMBIE_SLOTS.filter((z) => z !== slotId).map((z) => (variantId === 'actuel' ? current(z) : v2(z, variantId)));
    return Math.min(...others.map((o) => distinctness(mine.sil, o.sil).max));
  }

  return { v2, current, gap, floors, radiusOf, slotOf };
}
