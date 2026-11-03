import { test, expect } from '@playwright/test';
import { waitReady } from './helpers.js';

// Lot 3g, retours du propriétaire (deuxième passe) : mur percé autour du joueur caché, vraies portes et éboulis, ouvertures grillagées, pastilles incrustées.
// 667×375, step() et hooks ; les tests se désactivent seuls si WebGL manque. WebGL logiciel : aucune conclusion de vitesse ni d'esthétique.
const SIZE = { width: 667, height: 375 };
const U = (px) => px * 5 + 800;
const STATE = (page) => page.evaluate(() => window.__zs.getState());

async function open(page, extra = '') {
  await page.setViewportSize(SIZE);
  await page.goto(`/jeu.html?test=1&seed=1&vhs=0&nospawn=1${extra}`);
  await waitReady(page);
  await page.evaluate(() => { window.requestAnimationFrame = () => 0; });
  await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 150)));
  await page.evaluate(() => window.__zs.step(0.05));
}

// Joueur juste au nord du mur sud (face intérieure en y = 2540) : le mur, monté jusqu'au plafond, le cache à la caméra (au sud, tournée vers le nord).

test.describe('mur percé autour du joueur caché', () => {

  // Troisième passe : le joueur devant un mur (au nord du mur sud, assez loin pour être vu) : rien n'est tramé.

  test('aucun matériau transparent ajouté ; le mur percé ne change pas le nombre d\'appels', async ({ page }) => {
    await open(page, '&percee=0');
    const off = (await STATE(page)).render;
    await open(page);
    const on = (await STATE(page)).render;
    expect(on.calls).toBe(off.calls);
    expect(on.triangles).toBe(off.triangles);
  });
});

test.describe('sortie d\'escalier par le côté en haut (troisième passe)', () => {
  test('arrêté sur le palier du haut de l\'escalier de l\'aile, le joueur sort vers l\'est (aucun mur invisible)', async ({ page }) => {
    await open(page, '&wave=31');
    const r = await page.evaluate(([sx, sy, stop]) => {
      const zs = window.__zs;
      zs.setPlayer(sx, sy);
      zs.step(0.05);
      zs.setInput({ move: { x: 0, y: 1 } });
      for (let n = 0; n < 400; n += 1) {
        zs.step(0.05);
        const s = zs.getState();
        if (s.floor.walk && s.player.y >= stop) break;
      }
      const a = zs.getState();
      zs.setInput({ move: { x: 1, y: 0 } });
      for (let i = 0; i < 30; i += 1) zs.step(0.05);
      zs.setInput({});
      const b = zs.getState();
      return { a: [a.player.x, a.player.y, a.floor.current, Boolean(a.floor.walk)], b: [b.player.x, b.floor.current, Boolean(b.floor.walk)] };
    }, [U(38), U(235), U(303)]);
    expect(r.a.slice(2)).toEqual(['etage', true]);
    expect(r.b[1]).toBe('etage');
    expect(r.b[2]).toBe(false);
    expect(r.b[0]).toBeGreaterThan(r.a[0] + 150);
  });
});

