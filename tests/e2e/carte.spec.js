import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

// Lot 3b-A : page de contrôle carte.html (SVG de world.json et decor.json). Page technique, noindex.
const BROWSER_NOISE = /GL Driver Message/;
const SIZES = [{ width: 667, height: 375 }, { width: 1440, height: 900 }];

async function open(page, extra = '', size = SIZES[0]) {
  await page.setViewportSize(size);
  await page.goto(`/carte.html${extra}`);
  await expect(page.locator('svg.carte-svg')).toBeVisible({ timeout: 30_000 });
}

test('se charge sans erreur ni requête externe, noindex, 8 étiquettes F1 à F8, le cadre et l\'échelle', async ({ page, baseURL }) => {
  const external = [];
  const problems = [];
  page.on('request', (r) => !r.url().startsWith(baseURL) && !r.url().startsWith('data:') && external.push(r.url()));
  page.on('console', (m) => ['error', 'warning'].includes(m.type()) && !BROWSER_NOISE.test(m.text()) && problems.push(m.text()));
  page.on('pageerror', (e) => problems.push(e.message));
  page.on('response', (r) => r.status() >= 400 && problems.push(`${r.status()} ${r.url()}`));
  await open(page);
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex');
  await expect(page.locator('text.fenetre-etiquette')).toHaveText(['F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8']);
  await expect(page.locator('rect.cadre-trait')).toHaveCount(1);
  await expect(page.locator('line.echelle-trait')).toHaveCount(1);
  await expect(page.locator('rect.pilier')).toHaveCount(11);
  await expect(page.locator('#stats')).toContainText('8 fenêtres');
  await page.waitForLoadState('networkidle');
  expect(external).toEqual([]);
  expect(problems).toEqual([]);
  expect(await page.evaluate(() => [localStorage.length, sessionStorage.length, document.cookie])).toEqual([0, 0, '']);
});

test('sans JavaScript, seul le message noscript est visible', async ({ browser, baseURL }) => {
  const context = await browser.newContext({ javaScriptEnabled: false, baseURL });
  const page = await context.newPage();
  await page.goto('/carte.html');
  await expect(page.locator('.noscript')).toBeVisible();
  await expect(page.locator('#app')).toBeHidden();
  await context.close();
});

for (const size of SIZES) {
  test(`axe : aucune violation, aucune cible de moins de 44 px (${size.width}×${size.height})`, async ({ page }) => {
    await open(page, '', size);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    for (const link of await page.locator('a.carte-link').all()) {
      const box = await link.boundingBox();
      expect(box.height).toBeGreaterThanOrEqual(44);
      expect(box.width).toBeGreaterThanOrEqual(44);
    }
  });
}

test('?map=salle affiche l\'ancienne salle (3 fenêtres, 14 meubles, aucun pilier)', async ({ page }) => {
  await open(page, '?map=salle');
  await expect(page.locator('text.fenetre-etiquette')).toHaveCount(3);
  await expect(page.locator('rect.meuble')).toHaveCount(14);
  await expect(page.locator('rect.pilier')).toHaveCount(0);
  await expect(page.locator('#lien-salle')).toHaveAttribute('aria-current', 'page');
});

test('?map= inconnu retombe sur le rez-de-chaussée', async ({ page }) => {
  await open(page, '?map=nimporte');
  await expect(page.locator('text.fenetre-etiquette')).toHaveCount(8);
});
