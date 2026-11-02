// Panneaux HTML : pause (E2-6), fin provisoire (E2-7), message de rotation, région vocale, plein écran.
import { fmt } from './texts.js';

const PORTRAIT_PHONE = '(orientation: portrait) and (pointer: coarse) and (max-width: 600px)';

export function createUi(dict, handlers) {
  const $ = (id) => document.getElementById(id);
  const els = {
    pausePanel: $('pause-panel'), endPanel: $('end-panel'), live: $('hud-live'), rotate: $('rotate'),
    pauseBtn: $('btn-pause'), resume: $('btn-resume'), fullscreen: $('btn-fullscreen'), sound: $('btn-sound'),
    restart: $('btn-restart'), replay: $('btn-replay'), endKills: $('end-kills'),
    volumeRow: $('volume-row'), volume: $('volume'), volumeValue: $('volume-value'),
  };
  const rotateQuery = matchMedia(PORTRAIT_PHONE);
  const canFullscreen = Boolean(document.fullscreenEnabled && document.documentElement.requestFullscreen);
  let hasAudio = false;

  const ui = {
    isPaused: () => !els.pausePanel.hidden || rotateQuery.matches || document.hidden,
    isEnded: () => !els.endPanel.hidden,

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
      if (els.pausePanel.hidden) ui.openPause();
      else ui.closePause();
    },

    showEnd(kills) {
      els.pausePanel.hidden = true;
      els.endKills.textContent = fmt(dict['game.end.kills'], { n: kills });
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

    // Libellé du bouton Son et valeur du curseur de volume selon l'état courant ; masqués sans moteur audio utilisable.
    syncSound(audio) {
      hasAudio = Boolean(audio?.supported);
      els.sound.hidden = !hasAudio;
      els.volumeRow.hidden = !hasAudio;
      if (!hasAudio) return;
      els.sound.textContent = dict[audio.muted ? 'game.sound.off' : 'game.sound.on'];
      els.volume.value = String(audio.volume);
      const text = fmt(dict['game.volume.value'], { n: audio.volume });
      els.volumeValue.textContent = text;
      els.volume.setAttribute('aria-valuetext', text);
    },
  };

  els.fullscreen.hidden = !canFullscreen;
  els.pauseBtn.addEventListener('click', () => ui.openPause());
  els.resume.addEventListener('click', () => ui.closePause());
  els.fullscreen.addEventListener('click', () => ui.toggleFullscreen());
  els.sound.addEventListener('click', () => {
    if (hasAudio) handlers.onToggleSound();
  });
  els.volume.addEventListener('input', () => {
    if (hasAudio) handlers.onVolume?.(Number(els.volume.value));
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
