// Panneaux HTML : pause (E2-6), fin provisoire (E2-7), message de rotation, région vocale, plein écran.
import { fmt } from './scene.js';

const PORTRAIT_PHONE = '(orientation: portrait) and (pointer: coarse) and (max-width: 600px)';

export function createUi(dict, handlers) {
  const $ = (id) => document.getElementById(id);
  const els = {
    pausePanel: $('pause-panel'), endPanel: $('end-panel'), live: $('hud-live'), rotate: $('rotate'),
    pauseBtn: $('btn-pause'), resume: $('btn-resume'), fullscreen: $('btn-fullscreen'), sound: $('btn-sound'),
    restart: $('btn-restart'), replay: $('btn-replay'), endKills: $('end-kills'),
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
    },

    closePause() {
      els.pausePanel.hidden = true;
      els.pauseBtn.blur();
      document.activeElement?.blur?.();
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

    // Libellé du bouton Son selon l'état courant ; masqué tant qu'il n'y a pas de moteur audio.
    syncSound(audio) {
      hasAudio = Boolean(audio);
      els.sound.hidden = !hasAudio;
      if (hasAudio) els.sound.textContent = dict[audio.muted ? 'game.sound.off' : 'game.sound.on'];
    },
  };

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
  });
  rotateQuery.addEventListener('change', () => handlers.onRotateChange?.());

  return ui;
}
