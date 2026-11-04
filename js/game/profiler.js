// Profileur de ?perf=1 (lot 5b), importé seulement avec ce paramètre (par défaut, game.js n'a pas de profileur : ses appels « P?.… » ne font rien).
// Il mesure, autour des étapes de la boucle d'images (simulation, poses, effets, HUD, monde, rendu), le temps de travail par image avec
// performance.now(), garde les intervalles entre images (horodatages de requestAnimationFrame) sur 5 s glissantes et sur la session, compte les
// tâches longues et relève les accrocs au premier usage (premier tir, premier sang, premier feu visible, premier type de zombie, première manche,
// première pause). Il ne lit l'état du jeu que pour ces premiers usages et n'écrit jamais rien dedans ; aucun réseau, aucun stockage.
import { createFrameLog, createHistogram, firstUseHitches, frameSummary, percentile, refreshRate, summarizeUA } from '../core/perf-stats.js';

export const STAGES = ['sim', 'poses', 'effets', 'hud', 'monde', 'rendu'];
const WINDOW_MS = 5000;
const HITCH_MS = 600;
const STAGE_CAP = 600;

export function createProfiler({ now = () => performance.now(), search = '', ua = '', observe = globalThis.PerformanceObserver } = {}) {
  const log = createFrameLog(2400);
  const session = createHistogram(0.25, 250);
  const stageLog = Object.fromEntries([...STAGES, 'total'].map((k) => [k, new Float32Array(STAGE_CAP)]));
  let stageHead = 0;
  let stageSize = 0;
  const cur = Object.fromEntries(STAGES.map((k) => [k, 0]));
  let lastT = null;
  let t0 = 0;
  let markAt = 0;
  let inFrame = false;
  let interval = 0;
  let renderer = null;
  let info = { calls: 0, triangles: 0, programs: 0, geometries: 0, textures: 0 };
  const firsts = new Map(); // nom -> horodatage (ms, même horloge que requestAnimationFrame)
  const frames = []; // { at, duration } des images qui suivent un premier usage (600 ms), pour les accrocs
  let lastNow = 0;
  const longTasks = { supported: false, count: 0, max: 0, total: 0 };
  try {
    if (observe && Array.isArray(observe.supportedEntryTypes) && observe.supportedEntryTypes.includes('longtask')) {
      longTasks.supported = true;
      new observe((l) => {
        for (const e of l.getEntries()) {
          longTasks.count += 1;
          longTasks.total += e.duration;
          longTasks.max = Math.max(longTasks.max, e.duration);
        }
      }).observe({ type: 'longtask', buffered: true });
    }
  } catch {
    longTasks.supported = false;
  }

  const event = (name, at = lastNow) => {
    if (!firsts.has(name)) firsts.set(name, at);
  };
  const recentFirst = (t, d) => {
    for (const at of firsts.values()) if (t >= at && t - d <= at + HITCH_MS) return true;
    return false;
  };

  const api = {
    // Début d'une image : t = horodatage de requestAnimationFrame. En pause, l'image n'est pas comptée (la première pause est un premier usage).
    begin(t, paused = false) {
      if (typeof t !== 'number' || !Number.isFinite(t)) return;
      interval = lastT === null ? 0 : t - lastT;
      lastT = t;
      lastNow = t;
      if (paused) {
        event('pause', t);
        inFrame = false;
        return;
      }
      inFrame = true;
      t0 = now();
      markAt = t0;
      for (const k of STAGES) cur[k] = 0;
    },
    // Fin d'une étape (nom de STAGES) : temps écoulé depuis la marque précédente.
    mark(name) {
      if (!inFrame || !(name in cur)) return;
      const n = now();
      cur[name] += n - markAt;
      markAt = n;
    },
    // Fin de l'image : temps de travail, compteurs du rendu, premiers usages lus dans l'état simulé (sans rien y écrire).
    end(sim) {
      if (!inFrame) return;
      inFrame = false;
      const total = now() - t0;
      if (interval > 0) {
        log.push(lastT, interval, total);
        session.add(interval);
        if (recentFirst(lastT, interval)) frames.push({ at: lastT, duration: interval });
      }
      for (const k of STAGES) stageLog[k][stageHead] = cur[k];
      stageLog.total[stageHead] = total;
      stageHead = (stageHead + 1) % STAGE_CAP;
      stageSize = Math.min(STAGE_CAP, stageSize + 1);
      if (renderer) {
        const r = renderer.info;
        info = { calls: r.render.calls, triangles: r.render.triangles, programs: r.programs?.length ?? 0, geometries: r.memory.geometries, textures: r.memory.textures };
      }
      if (sim && typeof sim === 'object') {
        if (Array.isArray(sim.bullets) && sim.bullets.length > 0) event('tir');
        if (sim.kills > 0 || (Array.isArray(sim.enemies) && sim.enemies.some((e) => e.health < e.maxHealth))) event('sang');
        if (Array.isArray(sim.enemies)) for (const e of sim.enemies) if (typeof e.type === 'string') event(`zombie-${e.type}`);
        const phase = sim.waves?.phase;
        if (typeof phase === 'string' && phase !== 'attente' && phase !== 'inactif') event('manche');
      }
    },
    // Branche le rendu (renderer.info) et repère le premier feu dessiné (rappel après le rendu des flammes et fumées, sans effet sur l'image).
    attach({ renderer: r = null, scene = null } = {}) {
      renderer = r;
      scene?.traverse?.((o) => {
        if ((o.name === 'flammes' || o.name === 'fumee') && o.parent?.name?.startsWith('feu-')) {
          const before = o.onAfterRender;
          o.onAfterRender = (...args) => {
            event('feu');
            before?.apply(o, args);
          };
        }
      });
    },
    event,
    // Remise à zéro des mesures d'images (5 s, session, étapes) ; les premiers usages restent (ils n'arrivent qu'une fois).
    reset() {
      log.clear();
      session.clear();
      stageHead = 0;
      stageSize = 0;
      lastT = null;
    },
    state(extra = {}) {
      const recent = log.since(lastNow, WINDOW_MS);
      const stages = {};
      for (const k of [...STAGES, 'total']) stages[k] = percentile(Array.from(stageLog[k].subarray(0, stageSize)), 50);
      const mem = globalThis.performance?.memory?.usedJSHeapSize;
      const hitches = firstUseHitches([...firsts.entries()].map(([name, at]) => ({ name, at })), frames, HITCH_MS);
      return {
        window: frameSummary(recent.interval),
        session: session.summary(),
        refresh: refreshRate(recent.interval),
        stages,
        renderer: { ...info },
        longTasks: { ...longTasks },
        hitches,
        heapMB: typeof mem === 'number' ? mem / 1048576 : null,
        canvas: renderer ? { width: renderer.domElement.width, height: renderer.domElement.height } : { width: 0, height: 0 },
        dpr: renderer ? renderer.getPixelRatio() : null,
        system: summarizeUA(ua),
        params: search,
        frames: log.size,
        ...extra,
      };
    },
  };
  return api;
}
