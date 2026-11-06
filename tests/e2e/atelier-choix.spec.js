import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

// Lot 3h (itération 2) : vue « sons choisis » (atelier-choix.html). Chaque emplacement ne montre que le choix du propriétaire
// (data/game/sounds-atelier-choix.txt) ; sans choix : les trois propositions ; « aucun » : écarté et listé. Taille 667×375.

async function open(page) {
  await page.setViewportSize({ width: 667, height: 375 });
  await page.goto('/atelier-choix.html?test=1');
  await expect(page.locator('body')).toHaveAttribute('data-ready', '1', { timeout: 60_000 });
}

test('se charge sans erreur ni requête externe ; titre « Mes sons choisis » ; rien d\'enregistré', async ({ page, baseURL }) => {
  const problems = [];
  const external = [];
  page.on('request', (r) => !r.url().startsWith(baseURL) && !r.url().startsWith('data:') && !r.url().startsWith('blob:') && external.push(r.url()));
  page.on('console', (m) => ['error', 'warning'].includes(m.type()) && !/GL Driver Message/.test(m.text()) && problems.push(m.text()));
  page.on('pageerror', (e) => problems.push(e.message));
  await open(page);
  await expect(page.locator('h1')).toHaveText('Mes sons choisis');
  await expect(page.locator('a[href="atelier-sons.html"]')).toBeVisible();
  expect(external).toEqual([]);
  expect(problems).toEqual([]);
  expect(await page.evaluate(() => [localStorage.length, sessionStorage.length, document.cookie])).toEqual([0, 0, '']);
});

test('axe : aucune violation ; cibles d\'au moins 44 px', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'bureau', 'une seule fois');
  await open(page);
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);
  const boxes = await Promise.all((await page.locator('button, input[type="range"], .slot-fav label, .atelier-link').all()).map((b) => b.boundingBox()));
  for (const box of boxes) expect(Math.min(box.width, box.height)).toBeGreaterThanOrEqual(43.5);
});
