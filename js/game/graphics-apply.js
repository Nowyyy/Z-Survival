// Préréglages graphiques en jeu (lot 5b ; options au lot 5j). Les réglages « load » (variante des personnages, anticrénelage, textures fines, décor
// léger) sont appliqués au chargement (main.js, persos-loader.js, game.js) ; les réglages « live » (rapport de pixels, ombres, effet VHS, brume, feux et
// fumées, sang et cadavres) le sont ici : au démarrage (Élevé : aucun changement), en Auto quand il faut baisser d'un cran entre deux manches (temps
// d'image médian sur les 10 dernières secondes de jeu actif au-delà de 22 ms) et, depuis le lot 5j, à chaque changement de l'écran Options (préréglage
// ou option seule : passage à Perso). Une option « load » changée est enregistrée et attend le rechargement (pending) ; rien ne recharge sans le
// bouton « Recharger maintenant ». Un paramètre explicite de l'adresse n'est jamais remplacé. Aucune logique du jeu n'est touchée.
import { autoDecision, choosePreset, effectiveOptions, irregularShare, medianOf, optionsAuLancement, optionsState, optionVerrouillee, pendingReload, presetDetecte, setOption, valeursEnAttente } from '../core/graphics.js';

const SAMPLES = 1200; // intervalles gardés (jeu actif)

// boot : sortie de graphicsBoot() ; vhs : couche VHS ; announce(text) : #hud-live ; reload() : rechargement réel (absent sous ?test=1 : simulé).
// Lot 8c : contexte « partie » (les réglages appliqués au lancement sont verrouillés, setOption les refuse) ou « menu » (tout est modifiable) ;
// null (écran de la pause d'avant le lot 8c, jusqu'à sa partie C) : rien n'est verrouillé.
export function createGraphicsController(boot, { vhs = null, announce = () => {}, reload = null, dict = {}, contexte = null } = {}) {
  const verrouillee = (id) => contexte !== null && optionVerrouillee(boot.cfg, id, contexte);
  const { cfg, store, resolved } = boot;
  const explicit = boot.explicit ?? {};
  const device = boot.device ?? {};
  // Lot 5j : état de l'écran Options ; ?gfx= dans l'adresse : verrouillé (rien n'est modifiable ni écrit).
  let st = optionsState({ choice: resolved.choice, custom: boot.stored?.custom ?? null, url: explicit, device, locked: resolved.origin === 'parametre' }, cfg);
  let eff = boot.effective ?? effectiveOptions(st.choice, st.custom, explicit, device, cfg);
  const running = { ...eff.vector }; // valeurs du chargement : les options « load » du jeu en cours
  let settings = boot.settings;
  let applied = { sang: settings.live.sang, cadavres: settings.live.cadavres };
  let origin = resolved.origin;
  let lastWrite = null;
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
    // Sang et cadavres : seulement s'ils changent (setBlood efface les taches et cadavres en cours).
    if (!keep('sang') && hot && (applied.sang !== live.sang || applied.cadavres !== live.cadavres)) {
      pv?.setBlood?.(live.sang, live.cadavres);
      applied = { sang: live.sang, cadavres: live.cadavres };
    }
    // Lot 5k : lampes à huile et lumières (préchargées par graphics-boot.js si le chargement les demandait ; sinon importées ici, à chaud).
    world.setLamps?.(live.lampes, live.lumieres, { renderer, preload: boot.lamps ?? null, shadows: live.ombresLampes });
    if (!keep('dprMax') && params.maxRatio !== live.dprMax) {
      params.maxRatio = live.dprMax;
      if (hot) refs.resize();
    }
  }

  const label = (id) => dict[`game.gfx.${id}`] ?? id;
  // Vecteur effectif recalculé ; les réglages « load » restent ceux du chargement.
  function recompute() {
    eff = effectiveOptions(st.choice, st.custom, explicit, device, cfg, st.current);
    settings = { ...eff.settings, load: boot.settings.load };
  }
  // Lot 5j : nouvel état choisi dans l'écran Options : écrit (préréglage et Perso), puis options « live » appliquées à chaud.
  function commit(next) {
    if (next === st) return { ok: false, status: st.locked ? 'adresse' : 'refuse', pending: pendingReload(eff, running, cfg) };
    const wasAuto = st.choice === 'auto';
    st = next;
    origin = 'options';
    if (st.choice === 'auto' && !wasAuto) {
      head = 0;
      size = 0;
      activeMs = 0;
      lastT = null;
    }
    recompute();
    applyLive(settings.live, { hot: true });
    lastWrite = store.write(st.choice, st.custom);
    return { ok: true, status: lastWrite.status, saved: lastWrite.ok && lastWrite.persisted, pending: pendingReload(eff, running, cfg) };
  }

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
      if (st.choice !== 'auto') return;
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
      const d = autoDecision(stats, eff.preset, cfg.auto);
      lastDecision = { ...d, medianMs: stats.medianMs, longShare: stats.longShare, activeSeconds: stats.activeSeconds, at: t };
      if (d.changed) {
        st = { ...st, current: d.preset };
        recompute(); // les réglages « load » restent ceux du chargement
        applyLive(settings.live, { hot: true });
        downgraded = d.preset;
        announce((dict['game.gfx.lowered'] ?? '{preset}').replace('{preset}', label(d.preset)));
        head = 0;
        size = 0;
        activeMs = 0;
      }
      return lastDecision;
    },
    // Lot 5j (écran Options) : un préréglage (Auto, Faible, Moyen, Élevé, Perso) ou une option seule (passage à Perso). Renvoie { ok, status, saved, pending }.
    choosePreset: (name) => commit(choosePreset(st, name, cfg)),
    setOption: (id, value) => (verrouillee(id) ? { ok: false, status: 'verrouille-partie', pending: pendingReload(eff, running, cfg) } : commit(setOption(st, id, value, cfg))),
    // Ancien choix de la ligne « Graphismes » (lot 5b) : un préréglage, sans rechargement automatique.
    choose: (choice) => commit(choosePreset(st, choice, cfg)),
    // « Recharger maintenant » (après confirmation dans l'écran Options) : rechargement réel, simulé sous ?test=1 (reloadRequested).
    reloadNow() {
      reloadRequested = st.choice;
      if (reload) reload();
      return reloadRequested;
    },
    // Données de l'écran Options : sections, options (identifiants, groupes, valeurs, clés de texte) et état.
    options: () => ({ sections: [...cfg.sections], sectionTexts: { ...cfg.sectionTexts }, options: cfg.options, state: api.state() }),
    label: () => (st.choice === 'auto' ? `auto (${eff.preset})` : st.choice),
    state() {
      return {
        choice: st.choice, preset: eff.preset, initial: resolved.preset, origin, device: resolved.device, auto: st.choice === 'auto',
        downgraded: st.choice === 'auto' && st.current ? downgraded : null, lastDecision, live: { ...settings.live, feux: { ...settings.live.feux } }, load: { ...settings.load }, overridden: [...settings.overridden],
        storage: store.state(), reloadRequested, world: refs?.world.graphicsStats?.() ?? null, lune: refs?.world.moonState?.() ?? [], antialias: refs ? refs.renderer.getContextAttributes?.()?.antialias ?? null : null,
        pixelRatio: refs ? refs.renderer.getPixelRatio() : null, shadows: refs ? refs.renderer.shadowMap.enabled : null, vhs: vhs ? vhs.mode : null,
        // Lot 5j : vecteur effectif, origine de chaque valeur, valeurs du chargement, options en attente de rechargement, Perso enregistré.
        vector: { ...eff.vector }, origins: { ...eff.origins }, imposed: [...eff.imposed], running: { ...running }, pending: pendingReload(eff, running, cfg),
        custom: st.custom ? { ...st.custom } : null, locked: st.locked, write: lastWrite,
        // Lot 8c : contexte de l'écran, préréglage détecté d'Auto (« Auto · Moyen »), réglages verrouillés, valeurs en attente du prochain chargement.
        contexte, detected: presetDetecte(eff), lockedOptions: optionsAuLancement(cfg).filter(verrouillee), waiting: valeursEnAttente(eff, running, cfg),
      };
    },
  };
  return api;
}
