// Outils Node des scripts et des tests du lot 3j (personnages) : lecture des données, jetons de couleur, caméra du jeu, couleurs
// moyennes des régions d'atlas et des sols (js/core/texgen.js), poses de référence. Lecture seule : n'écrit aucun fichier.
import { readFileSync } from 'node:fs';
import { contrast, luminance, mix, parseColor } from '../../js/core/color.js';
import { gameCamera, silhouetteMetrics } from '../../js/core/character-parts.js';
import { buildSpec, createTextureData, meanColor, regionRect } from '../../js/core/texgen.js';
import { fitDistance } from '../../js/core/viewport.js';

export const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'));
export const load = (name) => readJson(`data/game/${name}.json`);
export const tokenCss = readFileSync('css/tokens.css', 'utf8');
export const tokens = Object.fromEntries([...tokenCss.matchAll(/(--[a-z0-9-]+):\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]));
export const lookup = (token) => parseColor(tokens[token]);

export const characters = load('characters-v2');
export const poses = load('poses-v2');
export const skeletons = poses.skeletons;
export const enemies = load('enemies');
export const texturesJson = load('textures');
export const render = load('render');
export const cameraJson = load('camera');
export const slotOf = (id) => characters.slots.find((s) => s.id === id);
export const ZOMBIES = ['marcheur', 'petit', 'voute', 'grand'];

// Rayon de collision par type (enemies.json) ; le joueur : player.json.
const playerJson = load('player');
export const radiusOf = (id) => (id === 'joueur' ? playerJson.radius : enemies.zombie.radius * (enemies.variants[id]?.radiusMul ?? 1));

// Caméra et échelle réelles du jeu à 667 × 375 sur la carte par défaut : distance = fitDistance(zone de jeu, inclinaison, champ) / zoom.
export function gameView(width = 667, height = 375) {
  const world = readJson('data/game/maps/rez-de-chaussee/world.json');
  const play = { width: world.room.width, height: world.room.height };
  const zoom = world.zoom ?? cameraJson.zoom;
  const distance = fitDistance(width / height, play, render.camera.tilt, render.camera.fov, render.camera.margin) / zoom;
  return gameCamera({ fov: render.camera.fov, tilt: render.camera.tilt, distance, width, height });
}

// Couleur moyenne (0 à 255) de chaque région de l'atlas des personnages actuels.
export function atlasRegionMeans(atlasId = 'atlas-persos') {
  const entry = texturesJson.textures.find((t) => t.id === atlasId);
  const spec = buildSpec(entry, lookup);
  const tex = createTextureData(spec);
  const size = tex.width;
  const out = {};
  for (const r of entry.params.regions) {
    const rect = regionRect(size, r);
    const x0 = Math.round(rect.u0 * size);
    const x1 = Math.round(rect.u1 * size);
    const y0 = Math.round(rect.v0 * size);
    const y1 = Math.round(rect.v1 * size);
    const sum = [0, 0, 0];
    let k = 0;
    for (let y = y0; y < y1; y += 1) {
      for (let x = x0; x < x1; x += 1) {
        const i = (y * size + x) * 4;
        sum[0] += tex.data[i];
        sum[1] += tex.data[i + 1];
        sum[2] += tex.data[i + 2];
        k += 1;
      }
    }
    out[r.id] = sum.map((s) => s / Math.max(1, k));
  }
  return out;
}

// Sols du jeu (couleur moyenne de leur texture) : carrelage, herbe, terre, route, trottoir, béton d'escalier (les marches utilisent la
// texture des murs, js/game/world.js).
export const FLOORS = { carrelage: 'sol-salle', herbe: 'herbe', terre: 'sol-exterieur', route: 'route', trottoir: 'trottoir', escalier: 'mur' };
export function floorMeans() {
  return Object.fromEntries(Object.entries(FLOORS).map(([name, id]) => [name, meanColor(createTextureData(buildSpec(texturesJson.textures.find((t) => t.id === id), lookup)))]));
}

// Sol taché : couleur du sol mêlée à la couleur du sang (couverture `cover`, 0,6 par défaut).
export const stained = (floor, blood, cover = 0.6) => mix(floor, blood, cover);

// Couleur (0 à 1) d'une pièce d'un personnage actuel : moyenne de sa région d'atlas.
export function currentColor(slot, means = atlasRegionMeans()) {
  return (part) => (means[slot.current.regions[part.region]] ?? [128, 128, 128]).map((c) => c / 255);
}

// Lot 5e : currentPose et currentMetrics (pose de l'ancien modèle, js/core/pose.js) retirés avec l'ancien modèle.

// --- Variantes v2 (lot 3j-B) ------------------------------------------------------------------------------------------------------------
import { characterStats, checkVariant, boundsOf as kitBounds, fkPose as kitFk } from '../../js/core/character-parts.js';
import { poseAt, rigOf } from '../../js/core/pose-v2.js';
import { partRgb, resolveVariant } from '../../js/core/persos-variants.js';
import { PALETTE_REGION, REGION_KINDS, createPersoTexture, persoSpec, regionFactor } from '../../js/core/texgen-persos.js';

// Facteur moyen de chaque région de l'atlas de détail (tuile propre).
export const textureFactors = (() => {
  const spec = persoSpec({ size: 256, tiles: 2, seed: 1 });
  const tex = createPersoTexture(spec);
  return Object.fromEntries(REGION_KINDS.map((k) => [k, regionFactor(tex, spec, k)]));
})();
export const resolve = (variant, opts = {}) => resolveVariant(variant, { wearTiers: characters.wearTiers, ...opts });
// Couleur vue (0 à 1) d'une pièce v2 : palette × facteur de la région, usure moyenne comprise.
export const v2Color = (res) => (part) => partRgb(part, res, lookup, { averageTears: true }).map((c) => (c * (textureFactors[PALETTE_REGION[part.palette]] ?? 0.9)) / 255);
export const v2Rig = (res) => rigOf(res, skeletons);
export const v2Pose = (res, anim = 'marche', phase = 0.25, params = {}) => poseAt(v2Rig(res), anim, phase, params, poses);
export const SANG = lookup('--sang-frais');
export function floorsWithStains(floors = floorMeans()) {
  const out = { ...floors };
  for (const [k, f] of Object.entries(floors)) out[`${k}-tache`] = stained(f, SANG);
  return out;
}
// Hauteur actuelle d'un type (repos, échelle comprise) et plage permise.
export const currentHeight = (slot) => characterStats(slot.current, { skeletons }).rest.height;
const STANDING = (kind) => (kind === 'player' ? [['repos', 0], ['marche', 0], ['marche', 0.25], ['marche', 0.5], ['tir', 0.3]] : [['attente', 0], ['attente', 0.5], ['marche', 0], ['marche', 0.25], ['marche', 0.5], ['marche', 0.75], ['marcheLente', 0.25], ['course', 0], ['course', 0.25], ['attaque', 0], ['attaque', 0.35], ['attaque', 0.55]]);
export function variantChecks(slot, variant, opts = {}) {
  const res = resolve(variant, opts);
  const rig = v2Rig(res);
  const rich = variant.flags?.outOfBudget === true;
  const b = characters.budget;
  const h = currentHeight(slot);
  return checkVariant(res, {
    skeletons,
    budget: { triangles: rich ? b.richTriangles : b.triangles, calls: b.calls, shadowCalls: b.shadowCalls, shadowTriangles: b.shadowTriangles },
    radius: radiusOf(slot.id),
    heightRange: [b.heightRange[0] * h, b.heightRange[1] * h],
    kind: slot.id === 'petit' ? 'petit' : null,
    poses: STANDING(res.kind).map(([anim, phase]) => ({ id: `${anim} ${phase}`, ...poseAt(rig, anim, phase, {}, poses) })),
  });
}
export function variantMetrics(slot, variant, { anim = 'marche', phase = 0.25, camera = gameView(), floors = floorsWithStains(), ...opts } = {}) {
  const res = resolve(variant, opts);
  const pose = v2Pose(res, anim, phase);
  const sil = silhouetteMetrics(res, pose, camera, { skeletons, color: v2Color(res) });
  const rgb = sil.color.map((c) => c * 255);
  const stats = characterStats(res, { skeletons });
  const reach = kitBounds(kitFk(res, pose, { skeletons }).boxes).reach;
  return { res, stats, sil, area: sil.area, aspect: sil.aspect, rgb, luminance: luminance(rgb), reach, contrasts: Object.fromEntries(Object.entries(floors).map(([k, f]) => [k, contrast(rgb, f)])) };
}

// --- Mesures des animations (lot 3j-B) --------------------------------------------------------------------------------------------------
import { CYCLIC, DEATHS, LOCOMOTION, PLAYER_ANIMS, ZOMBIE_ANIMS, cycleSeconds } from '../../js/core/pose-v2.js';
import { applyAffine, buildPartGeometry, expandParts, jointMatrices } from '../../js/core/character-parts.js';

const gaits = load('gaits');
export const SPEEDS = { marcheLente: gaits.gaits.lent.speed, marche: gaits.gaits.marche.speed, rampe: gaits.gaits.rampe.speed, course: gaits.gaits.course.speed, escalier: gaits.gaits.marche.speed };
export const ANIMS_OF = (kind) => (kind === 'player' ? PLAYER_ANIMS : ZOMBIE_ANIMS);
// Durée d'un cycle (secondes) : marches = foulée / vitesse ; animations au temps : cycleSeconds ; morts 1,2 s, relevage 0,8 s, touché 0,25 s.
export function animDuration(res, anim, params = {}) {
  const rig = v2Rig(res);
  if (res.kind === 'player' && anim === 'marche') return poses.strides.joueur / playerJson.speed;
  if (LOCOMOTION.includes(anim) || anim === 'rampe') return poses.strides[anim] / SPEEDS[anim];
  if (DEATHS.includes(anim)) return poses.durations.mort;
  if (anim === 'relevage') return poses.durations.relevage;
  if (anim === 'touche') return poses.durations.touche;
  if (anim === 'arracher') return windowsJson.tearTime / 4;
  return cycleSeconds(rig, anim, params, poses) ?? 1;
}
const windowsJson = load('windows');
// Échantillons (phase, pose) d'une animation.
export function sampleAnim(res, anim, n = 120, params = {}) {
  const rig = v2Rig(res);
  return Array.from({ length: n + 1 }, (_, i) => ({ phase: i / n, pose: poseAt(rig, anim, i / n, params, poses) }));
}
// Vérifications d'une animation : { range, periodic, maxSpeed (rad/s), belowGround (y min), penetration, slide, flat, deathReach }.
export function animChecks(slot, variant, anim, { n = 120, params = {}, opts = {} } = {}) {
  const res = resolve(variant, opts);
  const rig = v2Rig(res);
  const ranges = Object.fromEntries(rig.joints.map((j) => [j.id, j.range]));
  const samples = sampleAnim(res, anim, n, params);
  const out = { range: [], periodic: null, maxSpeed: 0, belowGround: Infinity, penetration: 0, slide: null, flat: null, deathReach: null };
  for (const { pose } of samples) {
    for (const [id, a] of Object.entries(pose.angles)) {
      const r = ranges[id];
      if (!r) continue;
      ['x', 'y', 'z'].forEach((ax, k) => {
        if (a[k] < r[ax][0] - 1e-9 || a[k] > r[ax][1] + 1e-9) out.range.push(`${id}.${ax}=${a[k].toFixed(3)}`);
      });
    }
  }
  if (CYCLIC.includes(anim)) {
    const a = poseAt(rig, anim, 0, params, poses);
    const b = poseAt(rig, anim, 1, params, poses);
    let d = 0;
    for (const key of ['angles', 'offsets']) for (const id of Object.keys(a[key])) for (let k = 0; k < 3; k += 1) d = Math.max(d, Math.abs(a[key][id][k] - (b[key][id]?.[k] ?? 0)));
    out.periodic = d;
  }
  const dt = animDuration(res, anim, params) / n;
  for (let i = 1; i < samples.length; i += 1) {
    const a = samples[i - 1].pose.angles;
    const b = samples[i].pose.angles;
    for (const id of Object.keys(b)) for (let k = 0; k < 3; k += 1) out.maxSpeed = Math.max(out.maxSpeed, Math.abs(b[id][k] - (a[id]?.[k] ?? 0)) / dt);
  }
  // Sol, pénétration des bras dans le tronc, morts : sur un échantillon de 24 poses (géométrie réelle des pièces).
  const parts = expandParts(res);
  const geos = parts.map((p) => ({ p, g: buildPartGeometry(p) }));
  const chest = parts.find((p) => p.id === 'chest');
  const a = (chest?.dims?.r ?? 5) * (chest?.dims?.sx ?? 1.85) * 0.8;
  const b = (chest?.dims?.r ?? 5) * (chest?.dims?.sz ?? 1) * 0.8;
  for (let i = 0; i <= 24; i += 1) {
    const ph = i / 24;
    const pose = poseAt(rig, anim, ph, params, poses);
    const m = jointMatrices(rig.joints, pose, rig.scale);
    const inv = invertAffine(m.chest);
    let low = Infinity;
    for (const { p, g } of geos) {
      const mm = m[p.joint];
      if (!mm) continue;
      const arm = /^(upper|fore|hand)/.test(p.id);
      for (let k = 0; k < g.positions.length; k += 3) {
        const w = applyAffine(mm, g.positions.slice(k, k + 3));
        low = Math.min(low, w[1]);
        if (arm && inv) {
          const c = applyAffine(inv, w).map((v) => v / rig.scale);
          if (c[1] > 0 && c[1] < 10) {
            const q = Math.hypot(c[0] / a, c[2] / b);
            if (q < 1) out.penetration = Math.max(out.penetration, (1 - q) * Math.min(a, b));
          }
        }
      }
    }
    out.belowGround = Math.min(out.belowGround, low);
  }
  if (LOCOMOTION.includes(anim)) out.slide = footSlide(res, anim, params);
  if (DEATHS.includes(anim)) {
    const end = poseAt(rig, anim, 1, params, poses);
    const bb = kitBounds(kitFk(res, end, { skeletons }).boxes);
    out.flat = bb.max[1] / characterStats(res, { skeletons }).rest.height;
    out.deathReach = bb.reach / (radiusOf(slot.id) * characters.budget.footprint);
  }
  return out;
}
function invertAffine(t) {
  if (!t) return null;
  const [A, B, C, D, E, F, G, H, I] = t.m;
  const det = A * (E * I - F * H) - B * (D * I - F * G) + C * (D * H - E * G);
  if (Math.abs(det) < 1e-12) return null;
  const k = 1 / det;
  const m = [(E * I - F * H) * k, (C * H - B * I) * k, (B * F - C * E) * k, (F * G - D * I) * k, (A * I - C * G) * k, (C * D - A * F) * k, (D * H - E * G) * k, (B * G - A * H) * k, (A * E - B * D) * k];
  const tt = [-(m[0] * t.t[0] + m[1] * t.t[1] + m[2] * t.t[2]), -(m[3] * t.t[0] + m[4] * t.t[1] + m[5] * t.t[2]), -(m[6] * t.t[0] + m[7] * t.t[1] + m[8] * t.t[2])];
  return { m, t: tt };
}
// Glissement du pied d'appui : vitesse au sol du pied en appui rapportée à la vitesse de déplacement (maximum sur l'appui des deux pieds).
export function footSlide(res, anim, params = {}) {
  const rig = v2Rig(res);
  const key = res.kind === 'player' ? 'player' : anim === 'course' ? 'run' : 'walk';
  const st = poses.styles[rig.style];
  const duty = (key === 'player' ? st.player : st[key]).duty;
  const stride = res.kind === 'player' ? poses.strides.joueur : poses.strides[anim];
  const N = 400;
  let max = 0;
  for (const [s, off] of [['L', 0], ['R', 0.5]]) {
    let prev = null;
    for (let i = 0; i <= N; i += 1) {
      const ph = i / N;
      const pf = (ph + off) % 1;
      const m = jointMatrices(rig.joints, poseAt(rig, res.kind === 'player' ? 'marche' : anim, ph, params, poses), rig.scale);
      const z = m[`ankle${s}`].t[2] + ph * stride;
      if (prev !== null && pf > 1.5 / N && pf < duty - 0.5 / N) max = Math.max(max, Math.abs(z - prev) / (stride / N));
      prev = z;
    }
  }
  return max;
}
