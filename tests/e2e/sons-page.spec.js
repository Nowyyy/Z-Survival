import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import AxeBuilder from '@axe-core/playwright';

// Lot 1d-C : page d'écoute technique sons.html. Le journal (?test=1) remplace l'écoute.
const { sounds } = JSON.parse(readFileSync('data/game/sounds.json', 'utf8'));
const TOTAL = sounds.reduce((n, s) => n + s.variants, 0);
const BROWSER_NOISE = /GL Driver Message/;
const SIZES = [{ width: 667, height: 375 }, { width: 1440, height: 900 }];
async function open(page, size = SIZES[0], extra = '?test=1') {
  await page.setViewportSize(size);
  await page.goto(`/sons.html${extra}`);
  await expect(page.locator('#list .sound')).toHaveCount(sounds.length, { timeout: 60_000 });
}

test('se charge sans erreur ni requête externe, noindex, un bouton par variante', async ({ page, baseURL }) => {
  const external = [];
  const problems = [];
  page.on('request', (r) => !r.url().startsWith(baseURL) && !r.url().startsWith('data:') && external.push(r.url()));
  page.on('console', (m) => ['error', 'warning'].includes(m.type()) && !BROWSER_NOISE.test(m.text()) && problems.push(m.text()));
  page.on('pageerror', (e) => problems.push(e.message));
  page.on('response', (r) => r.status() >= 400 && problems.push(`${r.status()} ${r.url()}`));
  await open(page);
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex');
  await expect(page.locator('button.variant')).toHaveCount(TOTAL);
  await expect(page.locator('#status')).toContainText('sons prêts');
  await expect(page.locator('canvas.sound-wave')).toHaveCount(sounds.length);
  await page.waitForLoadState('networkidle');
  expect(external).toEqual([]);
  expect(problems).toEqual([]);
  expect(await page.evaluate(() => [localStorage.length, sessionStorage.length, document.cookie])).toEqual([0, 0, '']);
});

for (const size of SIZES) {
  test(`axe : aucune violation, cibles d'au moins 44 px (${size.width}×${size.height})`, async ({ page }) => {
    await open(page, size);
    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations).toEqual([]);
    const targets = page.locator('button, input[type="range"]');
    const boxes = await Promise.all((await targets.all()).map((b) => b.boundingBox()));
    expect(boxes.length).toBeGreaterThan(TOTAL);
    for (const box of boxes) {
      expect(box.height).toBeGreaterThanOrEqual(43.5);
      expect(box.width).toBeGreaterThanOrEqual(43.5);
    }
  });
}

