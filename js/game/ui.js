// Plein écran réel (API Fullscreen) et message « tourne ton téléphone ».
const PORTRAIT_PHONE = '(orientation: portrait) and (pointer: coarse) and (max-width: 600px)';

export function createUi({ onRotateChange = () => {} } = {}) {
  const rotateQuery = matchMedia(PORTRAIT_PHONE);
  const canFullscreen = Boolean(document.fullscreenEnabled && document.documentElement.requestFullscreen);
  rotateQuery.addEventListener('change', onRotateChange);

  return {
    // Jeu figé : téléphone en portrait ou onglet caché.
    isPaused: () => rotateQuery.matches || document.hidden,
    canFullscreen,
    toggleFullscreen() {
      if (!canFullscreen) return;
      if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
      else document.documentElement.requestFullscreen({ navigationUI: 'hide' }).catch(() => {});
    },
  };
}
