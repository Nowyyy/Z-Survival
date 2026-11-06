import { test, expect } from '@playwright/test';
import { waitReady } from './helpers.js';

// Rendu 3D du lot 1m : couverture du canvas, HUD en HTML, poses, inclinaisons, salle entière. Petite fenêtre de préférence :
// le rendu logiciel du navigateur de test y est plus rapide. Les tests se désactivent seuls si WebGL manque.
const URL = (extra = '') => `/jeu.html?test=1&empty=1&nospawn=1&seed=1${extra}`;
async function open(page, size, extra = '') {
  await page.setViewportSize(size);
  await page.goto(URL(extra));
  await waitReady(page);
}

test.describe('HUD HTML (E2-2) et marges', () => {
  test.skip(({ isMobile }) => isMobile, 'mesures de bureau');

  for (const [w, h] of [[667, 375], [1440, 900]]) {
    test(`le HUD, le bouton Pause et le texte restent à 16 px au moins des bords (${w}×${h})`, async ({ page }) => {
      await open(page, { width: w, height: h });
      const boxes = await page.evaluate(() => ['#hud', '#btn-pause'].map((sel) => {
        const r = document.querySelector(sel).getBoundingClientRect();
        return { sel, left: r.left, top: r.top, right: innerWidth - r.right, bottom: innerHeight - r.bottom, width: r.width, height: r.height };
      }));
      for (const b of boxes) {
        expect(b.width, b.sel).toBeGreaterThan(0);
        for (const side of ['left', 'top', 'right', 'bottom']) expect(b[side], `${b.sel} ${side}`).toBeGreaterThanOrEqual(16);
      }
      await expect(page.locator('#hud-life')).toHaveText('100/100');
      await expect(page.locator('#hud-kills-text')).toHaveText('0'); // lot 3l : « TUÉS 0 » (avant : « 0 tués »)
      await expect(page.locator('#hud')).toHaveAttribute('data-block', 'E2-2');
    });
  }

  test('les zones de sécurité sont publiées en variables CSS (pixels, zéro sans encoche)', async ({ page }) => {
    await open(page, { width: 667, height: 375 });
    const vars = await page.evaluate(() => ['top', 'right', 'bottom', 'left'].map((s) => document.documentElement.style.getPropertyValue(`--safe-${s}`)));
    expect(vars).toEqual(['0px', '0px', '0px', '0px']);
  });
});

