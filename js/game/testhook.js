// Accès pour les tests : exposé seulement avec ?test=1. Ne stocke ni n'envoie rien.
import { createRng } from '../core/rng.js';

export function installTestHook(ctx, game) {
  window.__zs = {
    getState: () => game.snapshot(),
    setSeed: (n) => {
      game.sim.rng = createRng(n);
    },
    spawnEnemy: (x, y) => game.addEnemy(x, y).id,
    // Avance la simulation de `seconds` secondes de jeu (pas de 0,05 s), sans attendre le rendu.
    step: (seconds) => game.advance(seconds),
    // Place le joueur (et la caméra) d'un coup.
    setPlayer: (x, y) => game.placePlayer(x, y),
    // Tire une balle dans la direction `angle` depuis la bouche de l'arme, sans passer par la visée (balle d'essai).
    fire: (angle) => game.fireBullet(angle),
    // Règle la caméra pour montrer tout le monde (captures) ; overview(false) rend la caméra au joueur.
    overview: (on = true) => game.overview(on),
    setInput: ({ move, aim } = {}) => {
      ctx.override.move = move ?? undefined;
      ctx.override.aim = aim ?? undefined;
    },
  };
}
