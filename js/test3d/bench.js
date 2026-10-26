// Banc d'essai : enchaîne les configurations, mesure les durées d'image (la première seconde est ignorée), sans DOM ni horloge.
import { summarize } from './stats.js';

// data : contenu de bench.json. quick : chaque configuration dure quickDuration (tests).
export function createBench(data, { quick = false } = {}) {
  const configs = Array.isArray(data?.configs) ? data.configs : [];
  const duration = quick ? data.quickDuration : data.duration;
  const warmup = quick ? data.quickWarmup : data.warmup;
  let status = 'idle'; // idle | running | done | interrupted
  let index = 0;
  let elapsed = 0;
  let frames = [];
  let calls = 0;
  let triangles = 0;
  let results = [];

  const begin = (i) => {
    index = i;
    elapsed = 0;
    frames = [];
    calls = 0;
    triangles = 0;
  };

  return {
    get status() {
      return status;
    },
    get index() {
      return index;
    },
    get total() {
      return configs.length;
    },
    get results() {
      return results.slice();
    },
    get duration() {
      return duration;
    },
    // Renvoie la première configuration à appliquer, ou null s'il n'y en a pas.
    start() {
      results = [];
      if (configs.length === 0) {
        status = 'done';
        return null;
      }
      status = 'running';
      begin(0);
      return configs[0];
    },
    // Une image rendue : ms = durée de l'image, info = { calls, triangles, pixelRatio, width, height } (appels et triangles : moyenne des images mesurées).
    // Renvoie { next, done } : next = configuration à appliquer ensuite (ou null).
    tick(ms, info) {
      if (status !== 'running' || !(ms > 0)) return { next: null, done: status !== 'running' };
      elapsed += ms / 1000;
      if (elapsed > warmup) {
        frames.push(ms);
        calls += info?.calls ?? 0;
        triangles += info?.triangles ?? 0;
      }
      if (elapsed < duration) return { next: null, done: false };
      results.push({ config: configs[index], ...summarize(frames), calls: Math.round(calls / Math.max(1, frames.length)), triangles: Math.round(triangles / Math.max(1, frames.length)), pixelRatio: info?.pixelRatio ?? 0, width: info?.width ?? 0, height: info?.height ?? 0 });
      if (index + 1 >= configs.length) {
        status = 'done';
        return { next: null, done: true };
      }
      begin(index + 1);
      return { next: configs[index], done: false };
    },
    interrupt() {
      if (status === 'running') status = 'interrupted';
    },
  };
}
