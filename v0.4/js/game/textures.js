// Textures du jeu : génération en code (js/core/texgen.js) par tranches de lignes, sans bloquer l'écran, puis textures Three.js.
// Aucune image n'est chargée : tout est calculé. Chaque texture est copiée une seule fois dans une DataTexture (needsUpdate unique).
import * as THREE from 'three';
import { buildSpec, fillRows, regionRect, textureSize } from '../core/texgen.js';

export const SLICE_MS = 8; // durée maximale de calcul par image
const ROWS_PER_STEP = 8;
const MAX_ANISOTROPY = 4;

// Reprend à l'image suivante ; si le navigateur n'en donne pas (onglet en arrière-plan, économie d'énergie), un minuteur prend le relais
// pour que le calcul avance quand même.
const FALLBACK_MS = 100;
const nextFrame = () => new Promise((resolve) => {
  let done = false;
  const go = () => {
    if (done) return;
    done = true;
    resolve();
  };
  requestAnimationFrame(go);
  setTimeout(go, FALLBACK_MS);
});

// entries : data/game/textures.json (textures) ; lookup : jeton -> [r, g, b]. onProgress(0..1) est appelé après chaque tranche.
// Renvoie { items: [{ entry, width, height, data }], count, bytes (mémoire GPU estimée, mipmaps compris), ms }.
export async function generateTextureData(entries, { lookup, onProgress = () => {}, now = () => performance.now(), wait = nextFrame, sliceMs = SLICE_MS }) {
  const start = now();
  const jobs = entries.map((entry) => {
    const spec = buildSpec(entry, lookup);
    const { width, height } = textureSize(spec);
    return { entry, spec, width, height, data: new Uint8ClampedArray(width * height * 4), row: 0 };
  });
  const total = jobs.reduce((sum, job) => sum + job.height, 0) || 1;
  let done = 0;
  let frameStart = now();
  for (const job of jobs) {
    while (job.row < job.height) {
      const to = Math.min(job.height, job.row + ROWS_PER_STEP);
      fillRows(job.spec, job.data, job.row, to);
      done += to - job.row;
      job.row = to;
      onProgress(done / total);
      if (now() - frameStart >= sliceMs) {
        await wait();
        frameStart = now();
      }
    }
  }
  const items = jobs.map(({ entry, width, height, data }) => ({ entry, width, height, data }));
  const bytes = items.reduce((sum, t) => sum + (t.width * t.height * 4 * 4) / 3, 0);
  return { items, count: items.length, bytes: Math.round(bytes), ms: now() - start };
}

// Textures Three.js : sRGB, mipmaps, anisotropie au plus 4, répétition pour les textures répétées (repeat > 0), jamais pour les atlas.
export function createThreeTextures(generated, renderer) {
  const maxAniso = Math.min(MAX_ANISOTROPY, renderer?.capabilities?.getMaxAnisotropy?.() ?? 1);
  const textures = new Map();
  const info = new Map();
  for (const { entry, width, height, data } of generated.items) {
    const texture = new THREE.DataTexture(new Uint8Array(data.buffer), width, height, THREE.RGBAFormat);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.generateMipmaps = true;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.anisotropy = maxAniso;
    const wrap = entry.repeat > 0 ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
    texture.wrapS = wrap;
    texture.wrapT = wrap;
    texture.needsUpdate = true;
    textures.set(entry.id, texture);
    info.set(entry.id, { repeat: entry.repeat, size: width, params: entry.params ?? {}, regions: new Map((entry.params?.regions ?? []).map((r) => [r.id, r])) });
  }
  return {
    texture: (id) => textures.get(id),
    repeat: (id) => info.get(id)?.repeat ?? 1,
    // Côté et paramètres d'une texture (disposition de la texture « planche »).
    size: (id) => info.get(id)?.size ?? 1,
    params: (id) => info.get(id)?.params ?? {},
    // Rectangle UV d'une région d'atlas, rentré d'un demi-texel, et unités du monde couvertes par la région entière (scale).
    region(atlasId, regionId) {
      const atlas = info.get(atlasId);
      const r = atlas?.regions.get(regionId);
      if (!r) return null;
      const rect = regionRect(atlas.size, r);
      const half = 0.5 / atlas.size;
      return { u0: rect.u0 + half, v0: rect.v0 + half, u1: rect.u1 - half, v1: rect.v1 - half, scale: r.scale ?? 100 };
    },
    dispose() {
      for (const t of textures.values()) t.dispose();
    },
  };
}
