// Panneaux HTML : pause (E2-6), fin provisoire (E2-7), message de rotation, région vocale, plein écran. Lot 3l : direction B de l'atelier (icônes du titre de fin,
// pièce devant les montants, étoile du record, « Revenir au menu principal » et « Quitter » sans action tant que le menu n'existe pas).
import { formatMoney } from '../core/economy.js';
import { fmt, MONEY_TEXTS, SAVE_TEXTS, VHS_TEXTS } from './texts.js';

const PORTRAIT_PHONE = '(orientation: portrait) and (pointer: coarse) and (max-width: 600px)';

export function createUi(dict, handlers) {
  const $ = (id) => document.getElementById(id);
  const els = {
    pausePanel: $('pause-panel'), endPanel: $('end-panel'), live: $('hud-live'), rotate: $('rotate'),
    pauseBtn: $('btn-pause'), resume: $('btn-resume'), fullscreen: $('btn-fullscreen'), sound: $('btn-sound'),
    vhs: $('btn-vhs'), restart: $('btn-restart'), replay: $('btn-replay'), endKills: $('end-kills'), endWave: $('end-wave'),
    endBox: $('end-box'), endTitle: $('end-title-text'), pauseBalance: $('pause-balance-text'), endEarned: $('end-earned'), endEarnedText: $('end-earned-text'), endBonus: $('end-bonus'), endBonusText: $('end-bonus-text'),
    endBalance: $('end-balance'), endBest: $('end-best'), endRecord: $('end-record'), endRecordText: $('end-record-text'), endSave: $('end-save'),
    gfxCurrent: $('gfx-current'), gfxChoices: [...document.querySelectorAll('#gfx-row .gfx-choice')], gfxConfirm: $('gfx-confirm'), gfxConfirmText: $('gfx-confirm-text'),
    gfxOk: $('gfx-confirm-ok'), gfxCancel: $('gfx-confirm-cancel'),
  };
  // Lot 5b : clés des textes de la ligne « Graphismes » (fr.json).
  const GFX = { auto: 'game.gfx.auto', faible: 'game.gfx.faible', moyen: 'game.gfx.moyen', eleve: 'game.gfx.eleve' };
  const GFX_ERRORS = { verrouille: 'game.gfx.error.verrouille', echec: 'game.gfx.error.echec', indisponible: 'game.gfx.error.indisponible' };
  let gfxPending = null;
  let gfxOpener = null;
  const rotateQuery = matchMedia(PORTRAIT_PHONE);
  const canFullscreen = Boolean(document.fullscreenEnabled && document.documentElement.requestFullscreen);
  let hasAudio = false;

  const ui = {
    isPaused: () => !els.pausePanel.hidden || rotateQuery.matches || document.hidden,
    isEnded: () => !els.endPanel.hidden,

    // Lot 3l (retour du propriétaire) : « Prochaine zone » n'est plus affichée dans la pause ; game.js l'appelle toujours, sans effet.
    setNextZone() {},

    setLive(text) {
      els.live.textContent = text;
    },

    openPause() {
      if (ui.isEnded()) return;
      els.pausePanel.hidden = false;
      els.resume.focus();
      handlers.onPausePanel?.(true);
      handlers.onPauseChange?.(ui.isPaused());
    },

    closePause() {
      els.pausePanel.hidden = true;
      els.pauseBtn.blur();
      document.activeElement?.blur?.();
      handlers.onPausePanel?.(false);
      handlers.onPauseChange?.(ui.isPaused());
    },

    togglePause() {
      if (gfxPending !== null) {
        ui.closeGraphicsConfirm();
        return;
      }
      if (els.pausePanel.hidden) ui.openPause();
      else ui.closePause();
    },

    // wave : vague en cours à la mort (0 ou absente quand les vagues sont coupées par ?nospawn=1 : la ligne est masquée). variant « world » (lot 3c) :
    // « Monde terminé » à la place de « Tu es mort » (la variante de mort est inchangée).
    // Lot 4 : « Solde » (summary : { balance, status }, de js/game/bank.js). Lot 3l (retour du propriétaire) : à côté de « PAUSE » ; l'état de la sauvegarde
    // n'est plus dans la pause (il reste sur l'écran de fin quand il pose problème : illisible, indisponible, échec, mode essai).
    setPauseInfo(summary) {
      els.pauseBalance.textContent = fmt(dict[MONEY_TEXTS.pauseBalance], { n: formatMoney(summary?.balance) });
    },

    // info (lot 4, de bank.runEnd) : { earned, world, balance, best, record, status } ; absent : les lignes d'argent restent vides.
    showEnd(kills, wave = 0, variant = 'death', info = null) {
      els.pausePanel.hidden = true;
      els.endTitle.textContent = dict[variant === 'world' ? 'game.end.world' : 'game.end.title'];
      els.endBox.dataset.variant = variant === 'world' ? 'world' : 'death'; // icône du titre : coche ou crâne (décoratives)
      els.endKills.textContent = fmt(dict['game.end.kills'], { n: kills });
      els.endWave.textContent = wave > 0 ? fmt(dict['game.wave.reached'], { n: wave }) : '';
      els.endWave.hidden = !(wave > 0);
      const money = info !== null && info !== undefined;
      els.endEarned.hidden = !money;
      els.endBalance.hidden = !money;
      els.endBest.hidden = !money;
      if (money) {
        els.endEarnedText.textContent = fmt(dict[MONEY_TEXTS.earned], { n: formatMoney(info.earned) });
        els.endBalance.textContent = fmt(dict[MONEY_TEXTS.balance], { n: formatMoney(info.balance) });
        els.endBest.textContent = fmt(dict[MONEY_TEXTS.best], { n: info.best });
      }
      const world = money && variant === 'world';
      els.endBonus.hidden = !world;
      if (world) els.endBonusText.textContent = fmt(dict[MONEY_TEXTS.worldBonus], { n: formatMoney(info.world) });
      els.endRecord.hidden = !(money && info.record === true);
      els.endRecordText.textContent = dict[MONEY_TEXTS.record];
      // Ligne d'état seulement quand l'argent n'est pas écrit : mode essai (texte propre à l'écran de fin), sauvegarde illisible, indisponible, échec.
      const status = money ? info.status : 'saved';
      const note = status === 'readonly' ? MONEY_TEXTS.trial : status === 'locked' || status === 'unavailable' || status === 'failed' ? SAVE_TEXTS[status] : null;
      els.endSave.hidden = note === null;
      els.endSave.textContent = note === null ? '' : dict[note];
      els.endPanel.hidden = false;
      els.replay.focus();
    },

    hideEnd() {
      els.endPanel.hidden = true;
      document.activeElement?.blur?.();
    },

    toggleFullscreen() {
      if (!canFullscreen) return;
      if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
      else document.documentElement.requestFullscreen({ navigationUI: 'hide' }).catch(() => {});
    },

    // Libellé du bouton Son selon l'état courant ; masqué sans moteur audio utilisable. Lot 3l (retour du propriétaire) : plus de curseur de volume.
    syncSound(audio) {
      hasAudio = Boolean(audio?.supported);
      els.sound.hidden = !hasAudio;
      if (!hasAudio) return;
      els.sound.textContent = dict[audio.muted ? 'game.sound.off' : 'game.sound.on'];
    },
  };

  // Lot 5b : ligne « Graphismes » de la pause : choix de l'appareil (aria-pressed) et préréglage actif (« Auto (Moyen) », « Auto (Moyen, baissé) »).
  ui.syncGraphics = (state) => {
    if (!state || !els.gfxCurrent) return;
    const name = (id) => dict[GFX[id]] ?? id;
    const key = state.auto ? (state.downgraded ? 'game.gfx.current.lowered' : 'game.gfx.current.auto') : state.origin === 'parametre' ? 'game.gfx.current.url' : null;
    els.gfxCurrent.textContent = key ? fmt(dict[key], { preset: name(state.preset) }) : name(state.preset);
    for (const b of els.gfxChoices) b.setAttribute('aria-pressed', String(b.dataset.gfx === state.choice));
  };
  ui.closeGraphicsConfirm = () => {
    gfxPending = null;
    els.gfxConfirm.hidden = true;
    els.gfxOk.hidden = false;
    gfxOpener?.focus();
  };
  for (const b of els.gfxChoices) {
    b.addEventListener('click', () => {
      gfxPending = b.dataset.gfx;
      gfxOpener = b;
      els.gfxConfirmText.textContent = fmt(dict['game.gfx.confirm.text'], { choice: dict[GFX[gfxPending]] ?? gfxPending });
      els.gfxOk.hidden = false;
      els.gfxConfirm.hidden = false;
      els.gfxCancel.focus();
    });
  }
  els.gfxCancel?.addEventListener('click', () => ui.closeGraphicsConfirm());
  els.gfxOk?.addEventListener('click', () => {
    if (gfxPending === null) return;
    const result = handlers.onGraphicsChoice?.(gfxPending);
    const error = result && !result.ok ? GFX_ERRORS[result.status] ?? null : null;
    if (error) {
      els.gfxConfirmText.textContent = dict[error];
      els.gfxOk.hidden = true;
      els.gfxCancel.focus();
      return;
    }
    ui.closeGraphicsConfirm();
  });

  ui.syncVhs = (vhs) => {
    const reduced = Boolean(vhs?.reducedMotion);
    const enabled = Boolean(vhs?.enabled) && !reduced;
    els.vhs.disabled = reduced;
    els.vhs.setAttribute('aria-pressed', String(enabled));
    els.vhs.textContent = dict[reduced ? VHS_TEXTS.reduced : enabled ? VHS_TEXTS.on : VHS_TEXTS.off];
  };
  els.vhs.addEventListener('click', () => handlers.onToggleVhs?.());
  els.fullscreen.hidden = !canFullscreen;
  els.pauseBtn.addEventListener('click', () => ui.openPause());
  els.resume.addEventListener('click', () => ui.closePause());
  els.fullscreen.addEventListener('click', () => ui.toggleFullscreen());
  els.sound.addEventListener('click', () => {
    if (hasAudio) handlers.onToggleSound();
  });
  els.restart.addEventListener('click', () => {
    ui.closePause();
    handlers.onRestart();
  });
  els.replay.addEventListener('click', () => {
    ui.hideEnd();
    handlers.onRestart();
  });
  // Onglet caché : la partie est figée et le panneau de pause s'ouvre pour le retour.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) ui.openPause();
    handlers.onPauseChange?.(ui.isPaused());
  });
  rotateQuery.addEventListener('change', () => {
    handlers.onRotateChange?.();
    handlers.onPauseChange?.(ui.isPaused());
  });

  return ui;
}
