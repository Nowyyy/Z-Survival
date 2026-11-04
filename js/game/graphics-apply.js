// Préréglages graphiques en jeu (lot 5b). Les réglages « load » (variante des personnages, anticrénelage, textures fines, décor léger) sont appliqués au
// chargement (main.js, persos-loader.js, game.js) ; les réglages « live » (rapport de pixels, ombres, effet VHS, brume, feux et fumées, sang et cadavres)
// le sont ici : au démarrage (Élevé : aucun changement) et, en Auto, quand il faut baisser d'un cran entre deux manches (temps d'image médian sur les
// 10 dernières secondes de jeu actif au-delà de 22 ms). Un paramètre explicite de l'adresse n'est jamais remplacé. Aucune logique du jeu n'est touchée.
import { autoDecision, irregularShare, medianOf, settingsFor } from '../core/graphics.js';

const SAMPLES = 1200; // intervalles gardés (jeu actif)

// boot : sortie de graphicsBoot() ; vhs : couche VHS ; announce(text) : #hud-live ; reload() : rechargement réel (absent sous ?test=1 : simulé).
export function createGraphicsController(boot, { vhs = null, announce = () => {}, reload = null, dict = {} } = {}) {
  const { cfg, store, resolved } = boot;
  const explicit = boot.explicit ?? {};
  let current = resolved.preset;
  let settings = boot.settings;
  let refs = null;
  const at = new Float64Array(SAMPLES);
  const dt = new Float32Array(SAMPLES);
  let head = 0;
  let size = 0;
  let lastT = null;
  let activeMs = 0;
  let lastPhase = null;
  let lastDecision = null;
  let downgraded = null;
  let reloadRequested = null;

  // Réglages « live » sur le rendu (les clés données par l'adresse restent celles de l'adresse).
  function applyLive(live, { hot = false } = {}) {
    if (!refs) return;
    const { renderer, world, pv, params } = refs;
    const keep = (k) => settings.overridden.includes(k);
    if (!keep('ombres')) {
      if (renderer.shadowMap.enabled !== live.ombres) {
        renderer.shadowMap.enabled = live.ombres;
        params.shadows = live.ombres;
      }
    }
    world.setShadowMap?.(renderer.shadowMap.enabled, live.ombreTaille);
    world.setFires?.(live.feux);
    world.setMist?.(live.brouillard);
    if (!keep('vhs') && vhs && vhs.mode !== live.vhs && hot) vhs.setMode(live.vhs);
    if (!keep('sang') && hot) pv?.setBlood?.(live.sang, live.cadavres);
    if (!keep('dprMax') && params.maxRatio !== live.dprMax) {
      params.maxRatio = live.dprMax;
      if (hot) refs.resize();
    }
  }

  const label = (id) => dict[`game.gfx.${id}`] ?? id;

  const api = {
    get antialias() {
      return settings.load.anticrenelage;
    },
    // Branché par game.js après la création du monde et des personnages : les réglages « live » du préréglage de départ (Élevé : rien ne change).
    attach({ renderer, world, pv = null, resize = () => {}, params }) {
      refs = { renderer, world, pv, resize, params };
      applyLive(settings.live);
    },
    // À chaque image (game.js) : intervalles de jeu actif ; décision d'Auto à l'entrée d'une attente entre deux manches.
    frame(t, active, phase) {
      if (resolved.choice !== 'auto') return;
      if (lastT !== null && active && phase !== 'attente') {
        const d = t - lastT;
        if (d > 0 && d < 1000) {
          at[head] = t;
          dt[head] = d;
          head = (head + 1) % SAMPLES;
          size = Math.min(SAMPLES, size + 1);
          activeMs += d;
        }
      }
      lastT = t;
      if (phase === 'attente' && lastPhase !== null && lastPhase !== 'attente' && lastPhase !== 'inactif') api.decide(t);
      lastPhase = phase;
    },
    // Décision d'Auto (entre deux manches) sur les fenetreSecondes dernières secondes de jeu actif.
    decide(t = lastT ?? 0) {
      const windowMs = cfg.auto.fenetreSecondes * 1000;
      const values = [];
      let covered = 0;
      for (let i = 0; i < size; i += 1) {
        const k = (head - 1 - i + SAMPLES) % SAMPLES;
        if (covered >= windowMs) break;
        values.push(dt[k]);
        covered += dt[k];
      }
      const stats = { medianMs: medianOf(values), longShare: irregularShare(values, cfg.auto.irregulier.facteur), activeSeconds: Math.min(activeMs, covered) / 1000, betweenWaves: true };
      const d = autoDecision(stats, current, cfg.auto);
      lastDecision = { ...d, medianMs: stats.medianMs, longShare: stats.longShare, activeSeconds: stats.activeSeconds, at: t };
      if (d.changed) {
        current = d.preset;
        settings = settingsFor(cfg, current, explicit);
        settings = { ...settings, load: boot.settings.load }; // les réglages « load » restent ceux du chargement
        applyLive(settings.live, { hot: true });
        downgraded = current;
        announce((dict['game.gfx.lowered'] ?? '{preset}').replace('{preset}', label(current)));
        head = 0;
        size = 0;
        activeMs = 0;
      }
      return lastDecision;
    },
    // Choix dans la pause (après confirmation) : préférence de l'appareil écrite, puis rechargement (simulé sous ?test=1).
    choose(choice) {
      const result = store.write(choice);
      // Stockage indisponible : le choix serait perdu au rechargement ; on ne recharge pas, la pause le dit.
      if (!result.ok || result.status === 'indisponible') return { ...result, ok: false, status: result.ok ? 'indisponible' : result.status };
      reloadRequested = choice;
      if (reload) reload();
      return result;
    },
    label: () => (resolved.choice === 'auto' ? `auto (${current})` : current),
    state() {
      return {
        choice: resolved.choice, preset: current, initial: resolved.preset, origin: resolved.origin, device: resolved.device, auto: resolved.choice === 'auto',
        downgraded, lastDecision, live: { ...settings.live, feux: { ...settings.live.feux } }, load: { ...settings.load }, overridden: [...settings.overridden],
        storage: store.state(), reloadRequested, world: refs?.world.graphicsStats?.() ?? null, antialias: refs ? refs.renderer.getContextAttributes?.()?.antialias ?? null : null,
        pixelRatio: refs ? refs.renderer.getPixelRatio() : null, shadows: refs ? refs.renderer.shadowMap.enabled : null, vhs: vhs ? vhs.mode : null,
      };
    },
  };
  return api;
}
