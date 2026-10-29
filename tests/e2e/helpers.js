import { test } from '@playwright/test';
import { fitDistance } from '../../js/core/viewport.js';

// Attend que le jeu tourne (le temps de jeu avance : la mise en page est terminée). Si WebGL manque dans l'environnement,
// le jeu affiche son message d'erreur et le test se désactive proprement.
export async function waitReady(page) {
  await page.waitForFunction(() => (window.__zs?.getState()?.time ?? 0) > 0.05 || document.getElementById('game-error')?.hidden === false, null, { timeout: 60_000 });
  if (await page.locator('#game-error').isVisible()) test.skip(true, 'WebGL indisponible dans cet environnement : test désactivé');
}

// Zone de jeu (face intérieure des murs, 24 de chaque côté) : la caméra la fait tenir avec 2 % de marge ; zoom : valeur de ?zoom=.
export const PLAY = { width: 1552, height: 852 };
export const DEFAULT_ZOOM = 2.5; // rapprochement par défaut (data/game/render.json) ; ?zoom=1 montre toute la zone de jeu
export const expectedDistance = (aspect, tilt = 75, zoom = DEFAULT_ZOOM) => fitDistance(aspect, PLAY, tilt, 40, 0.02) / zoom;

// Lot 3b : la carte par défaut est le rez-de-chaussée ; les tests écrits pour l'ancienne salle (2000 × 1200, 3 fenêtres) ajoutent ?map=salle à leur adresse.
export const salle = (url) => {
  const i = url.indexOf('?');
  return i < 0 ? `${url}?map=salle` : `${url.slice(0, i + 1)}map=salle&${url.slice(i + 1)}`;
};
