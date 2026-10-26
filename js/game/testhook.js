// Accès pour les tests : exposé seulement avec ?test=1. Ne stocke ni n'envoie rien.
import { createRng } from '../core/rng.js';

export function installTestHook(ctx, game) {
  window.__zs = {
    getState: () => game.snapshot(),
    setSeed: (n) => {
      game.sim.rng = createRng(n);
    },
    spawnEnemy: (x, y) => game.addEnemy(x, y).id,
    setInput: ({ move, aim } = {}) => {
      ctx.override.move = move ?? undefined;
      ctx.override.aim = aim ?? undefined;
    },
  };
}
