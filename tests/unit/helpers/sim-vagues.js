// Simulation pure d'un directeur de vagues avec un modèle de mort simple : chaque zombie vit un temps fixe après son apparition.
import { readFileSync } from 'node:fs';
import { createDirector, info, stepDirector } from '../../../js/core/wave-director.js';

export const params = JSON.parse(readFileSync('data/game/waves.json', 'utf8'));
export const points = JSON.parse(readFileSync('data/game/decor.json', 'utf8')).spawnPoints;
export const VIEW = { minX: 1500, minY: 500, maxX: 2100, maxY: 900 }; // un rectangle loin des points d'apparition du nord

// Fait avancer le directeur de `seconds` secondes par pas de dt. Renvoie { director, spawns: [{ time, wave, type, gait, pointId }], ends, starts, time }.
export function simulate({ director, seconds, dt = 0.05, life = 5, view = null, pts = points, killAfterSpawn = true, aliveOverride = null, stopWhen = null } = {}) {
  let d = director ?? createDirector(params, { seed: 1 });
  const zombies = [];
  const spawns = [];
  const ends = [];
  const starts = [];
  const maxAliveByWave = {};
  let time = 0;
  for (let i = 0; i < Math.round(seconds / dt); i += 1) {
    time += dt;
    for (let k = zombies.length - 1; k >= 0; k -= 1) if (killAfterSpawn && time - zombies[k].at >= life) zombies.splice(k, 1);
    const alive = aliveOverride ?? zombies.length;
    const out = stepDirector(d, { dt, alive, view, points: pts });
    d = out.state;
    for (const r of out.requests) {
      zombies.push({ at: time, ...r });
      spawns.push({ time, wave: info(d).wave, type: r.type, gait: r.gait, pointId: r.pointId, x: r.x, y: r.y });
    }
    for (const e of out.events) (e.type === 'waveEnd' ? ends : starts).push({ ...e, time });
    const w = info(d).wave;
    maxAliveByWave[w] = Math.max(maxAliveByWave[w] ?? 0, zombies.length);
    if (stopWhen?.(d, time)) break;
  }
  return { director: d, spawns, ends, starts, time, alive: zombies.length, maxAliveByWave };
}
