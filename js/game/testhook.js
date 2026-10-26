// Accès pour les tests : exposé seulement avec ?test=1. Ne stocke ni n'envoie rien.
export function installTestHook(getScene) {
  window.__zs = {
    getState: () => getScene().snapshot(),
  };
}
