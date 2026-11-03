// Interface retenue (après le lot 3k) : seulement les choix du propriétaire (HUD, pause, fins, à terre en B ; sticks en A).
// Hors de la suite rapide : `E2E_FULL=1 npx playwright test tests/e2e/interface-retenue.spec.js`.
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test.skip(({ isMobile }) => isMobile, 'page technique mesurée en bureau');

async function open(page, viewport = { width: 1440, height: 900 }) {
  await page.setViewportSize(viewport);
  await page.goto('/interface-retenue.html?test=1&fond=sol');
  await page.waitForFunction(() => window.__zsUi);
  await page.evaluate(() => window.__zsUi.ready);
}

test('axe sans violation, rien d\'enregistré', async ({ page, context }) => {
  await open(page, { width: 667, height: 375 });
  const results = await new AxeBuilder({ page }).exclude('#frame').exclude('#all iframe').analyze();
  expect(results.violations.map((v) => v.id)).toEqual([]);
  expect(await page.evaluate(() => [localStorage.length, sessionStorage.length, document.cookie])).toEqual([0, 0, '']);
  expect(await context.cookies()).toEqual([]);
});
