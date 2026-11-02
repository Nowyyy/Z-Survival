// Accès pour les tests : exposé seulement avec ?test=1. Ne stocke ni n'envoie rien.
import { createRng } from '../core/rng.js';

export function installTestHook(ctx, getScene) {
  window.__zs = {
    getState: () => getScene().snapshot(),
    setSeed: (n) => {
      getScene().sim.rng = createRng(n);
    },
    spawnEnemy: (x, y) => getScene().addEnemy(x, y).id,
    setInput: ({ move, aim } = {}) => {
      ctx.override.move = move ?? undefined;
      ctx.override.aim = aim ?? undefined;
    },
  };
}
