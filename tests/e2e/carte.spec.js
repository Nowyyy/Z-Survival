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

test('se charge sans erreur ni requête externe, noindex, 7 étiquettes F1 à F8 (F7 retirée au lot 3g), le cadre et l\'échelle', async ({ page, baseURL }) => {
  const external = [];
  const problems = [];
  page.on('request', (r) => !r.url().startsWith(baseURL) && !r.url().startsWith('data:') && external.push(r.url()));
  page.on('console', (m) => ['error', 'warning'].includes(m.type()) && !BROWSER_NOISE.test(m.text()) && problems.push(m.text()));
  page.on('pageerror', (e) => problems.push(e.message));
  page.on('response', (r) => r.status() >= 400 && problems.push(`${r.status()} ${r.url()}`));
  await open(page);
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex');
  await expect(page.locator('text.fenetre-etiquette')).toHaveText(['F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F8']);
  await expect(page.locator('rect.cadre-trait')).toHaveCount(1);
  await expect(page.locator('line.echelle-trait')).toHaveCount(1);
  await expect(page.locator('rect.pilier')).toHaveCount(10);
  await expect(page.locator('#stats')).toContainText('7 fenêtres');
  await page.waitForLoadState('networkidle');
  expect(external).toEqual([]);
  expect(problems).toEqual([]);
  expect(await page.evaluate(() => [localStorage.length, sessionStorage.length, document.cookie])).toEqual([0, 0, '']);
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

// Lot 3e-C : sélecteur d'étage (?floor=0 ou 1, deux boutons de 44 px), zones de déclenchement, arrivées et blocs de portes.
test.describe('sélecteur d\'étage', () => {

  for (const size of SIZES) {
    test(`axe : aucune violation sur l'étage, aucune cible de moins de 44 px (${size.width}×${size.height})`, async ({ page }) => {
      await open(page, '?floor=1', size);
      expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
      for (const link of await page.locator('a.carte-link').all()) {
        const box = await link.boundingBox();
        expect(box.height).toBeGreaterThanOrEqual(44);
        expect(box.width).toBeGreaterThanOrEqual(44);
      }
    });
  }

});
