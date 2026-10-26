import { test } from '@playwright/test';

// Attend que le jeu tourne (le temps de jeu avance : la mise en page est terminée). Si WebGL manque dans l'environnement,
// le jeu affiche son message d'erreur et le test se désactive proprement.
export async function waitReady(page) {
  await page.waitForFunction(() => (window.__zs?.getState()?.time ?? 0) > 0.05 || document.getElementById('game-error')?.hidden === false, null, { timeout: 60_000 });
  if (await page.locator('#game-error').isVisible()) test.skip(true, 'WebGL indisponible dans cet environnement : test désactivé');
}
