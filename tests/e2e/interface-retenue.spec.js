// Interface retenue (après le lot 3k) : seulement les choix du propriétaire (HUD, pause, fins, à terre en B ; sticks en A).
// Hors de la suite rapide : `E2E_FULL=1 npx playwright test tests/e2e/interface-retenue.spec.js`.
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test.skip(({ isMobile }) => isMobile, 'page technique mesurée en bureau');
const BROWSER_NOISE = /GL Driver Message|ReadPixels|GPU stall/;

async function open(page, viewport = { width: 1440, height: 900 }) {
  await page.setViewportSize(viewport);
  await page.goto('/interface-retenue.html?test=1&fond=sol');
  await page.waitForFunction(() => window.__zsUi);
  await page.evaluate(() => window.__zsUi.ready);
}

test('seuls les six écrans retenus sont proposés, avec leur direction ; aucune autre direction ni écran hors partie', async ({ page }) => {
  await open(page);
  const options = await page.locator('#f-screen option').allTextContents();
  expect(options).toEqual(['HUD (B « caméscope »)', 'Pause (B « caméscope »)', 'Fin : mort (B « caméscope »)', 'Fin : monde terminé (B « caméscope »)', 'À terre (B « caméscope »)', 'Sticks (A « sobre »)', "Tous les écrans d'un coup"]);
  expect(await page.locator('link[href*="proto-c"], #directions, #f-texte, #btn-compare').count()).toBe(0); // ni direction C, ni choix de direction, ni macros, ni côte à côte
});

test('les six écrans d\'un coup, aux tailles de téléphone et d\'ordinateur : aucun écart, aucune erreur de console', async ({ page }) => {
  const problems = [];
  page.on('console', (m) => ['error', 'warning'].includes(m.type()) && !BROWSER_NOISE.test(m.text()) && problems.push(m.text()));
  await open(page);
  for (const size of ['667x375', '844x390', '1440x900']) {
    for (const stateId of ['combat', 'pire-cas', 'a-terre']) {
      await page.evaluate((p) => window.__zsUi.set(p), { size, screen: 'tous', stateId });
      const rows = await page.evaluate(() => window.__zsUi.rows());
      expect(rows).toHaveLength(6);
      expect(rows.flatMap((r) => r.verdict.outOfTarget.map((o) => `${size} ${stateId} ${r.screen} ${o.rule} ${o.element}`))).toEqual([]);
    }
  }
  await expect(page.locator('#all figure')).toHaveCount(6);
  expect(problems).toEqual([]);
});

test('sticks : style A (anneau fin, pastille ronde) sous le HUD B ; aucune boîte ne bouge quand les valeurs changent', async ({ page }) => {
  await open(page);
  await page.evaluate(() => window.__zsUi.set({ size: '667x375', screen: 'sticks', stateId: 'debut' }));
  await expect(page.locator('#overlay')).toHaveClass(/ui3k-dir-b/);
  await expect(page.locator('#overlay .ui3k-dir-a .p-stick-knob').first()).toHaveCSS('border-radius', '50%');
  await expect(page.locator('#overlay .ui3k-dir-a .p-stick-base').first()).toHaveCSS('border-top-width', '2px');
  expect(await page.evaluate(() => window.__zsUi.stability())).toEqual({ max: 0, moved: [] });
});

test('axe sans violation, rien d\'enregistré', async ({ page, context }) => {
  await open(page, { width: 667, height: 375 });
  const results = await new AxeBuilder({ page }).exclude('#frame').exclude('#all iframe').analyze();
  expect(results.violations.map((v) => v.id)).toEqual([]);
  expect(await page.evaluate(() => [localStorage.length, sessionStorage.length, document.cookie])).toEqual([0, 0, '']);
  expect(await context.cookies()).toEqual([]);
});
