// Outils Node des scripts et des tests du lot 3j (personnages) : lecture des données, jetons de couleur, caméra du jeu, couleurs
// moyennes des régions d'atlas et des sols (js/core/texgen.js), poses de référence. Lecture seule : n'écrit aucun fichier.
import { readFileSync } from 'node:fs';
import { contrast, luminance, mix, parseColor } from '../../js/core/color.js';
import { gameCamera, silhouetteMetrics } from '../../js/core/character-parts.js';
import { buildSpec, createTextureData, meanColor, regionRect } from '../../js/core/texgen.js';
import { fitDistance } from '../../js/core/viewport.js';
import { computePose } from '../../js/core/pose.js';
import { fromV1 } from '../../js/core/pose-v2.js';

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

// Pose actuelle du jeu (computePose) d'un personnage actuel, traduite en angles du squelette v1.
export function currentPose(slot, input) {
  const c = slot.current;
  const state = input?.state ?? (c.kind === 'player' ? 'arret' : 'zombie');
  return fromV1(computePose({ seed: 1, time: 0.4, amount: c.kind === 'player' ? 0 : 0.7, ...input, state }), { lean: c.lean, headTilt: c.headTilt, armLift: c.armLift });
}

// Silhouette et contrastes d'un personnage actuel dans une pose du jeu.
export function currentMetrics(slot, input, { camera = gameView(), means = atlasRegionMeans(), floors = floorMeans() } = {}) {
  const sil = silhouetteMetrics(slot.current, currentPose(slot, input), camera, { skeletons, color: currentColor(slot, means) });
  const rgb = sil.color.map((c) => c * 255);
  return { ...sil, rgb, luminance: luminance(rgb), contrasts: Object.fromEntries(Object.entries(floors).map(([k, f]) => [k, contrast(rgb, f)])) };
}
