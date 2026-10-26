import { test, expect, chromium } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { readdirSync, readFileSync } from 'node:fs';

const WIDTHS = [375, 768, 1440];

test('les jetons de design sont présents', async ({ page }) => {
  await page.goto('/');
  const values = await page.evaluate(() => {
    const cs = getComputedStyle(document.documentElement);
    return ['--color-bg', '--color-text', '--color-action', '--space-4', '--touch-target'].map((n) => cs.getPropertyValue(n).trim());
  });
  for (const v of values) expect(v).not.toBe('');
});

test('aucune couleur en dur hors tokens.css', async () => {
  const COLOR = /#[0-9a-fA-F]{3,8}\b|\b(?:rgb|rgba|hsl|hsla|hwb|oklch|oklab)\(/;
  const files = readdirSync('css').filter((f) => f.endsWith('.css') && f !== 'tokens.css');
  expect(files.length).toBeGreaterThan(0);
  for (const f of files) expect(readFileSync(`css/${f}`, 'utf8'), f).not.toMatch(COLOR);
  expect(readFileSync('index.html', 'utf8')).not.toMatch(/style="[^"]*#|style="[^"]*rgb/);
});

test('la page est en français, sans bouton de langue, même avec un navigateur en anglais', async ({ browser, baseURL }) => {
  const context = await browser.newContext({ locale: 'en-US' });
  const page = await context.newPage();
  await page.goto(baseURL);
  await expect(page.locator('html')).toHaveAttribute('lang', 'fr');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Z-Survival');
  await expect(page.getByText('En construction. Reviens bientôt !')).toBeVisible();
  await expect(page.locator('[data-lang-toggle]')).toHaveCount(0);
  await expect(page.getByRole('button')).toHaveCount(0);
  await context.close();
});

test('aucune requête externe et console propre', async ({ page, baseURL }) => {
  const external = [];
  const problems = [];
  page.on('request', (r) => {
    if (!r.url().startsWith(baseURL) && !r.url().startsWith('data:')) external.push(r.url());
  });
  page.on('console', (m) => ['error', 'warning'].includes(m.type()) && problems.push(m.text()));
  page.on('pageerror', (e) => problems.push(e.message));
  page.on('requestfailed', (r) => problems.push(`échec ${r.url()}`));
  page.on('response', (r) => r.status() >= 400 && problems.push(`${r.status()} ${r.url()}`));
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  expect(external).toEqual([]);
  expect(problems).toEqual([]);
});

for (const width of WIDTHS) {
  test(`pas de débordement horizontal à ${width} px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/');
    await expect(page.locator('#app')).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });
}

test('axe : aucune violation', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#app')).toBeVisible();
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);
});

test('sans JavaScript, seul le message noscript est visible', async ({ baseURL }) => {
  // Le réglage de Blink désactive vraiment les scripts : <noscript> est alors rendu comme dans un vrai navigateur.
  const browser = await chromium.launch({ channel: process.env.CI ? 'chrome' : undefined, args: ['--blink-settings=scriptEnabled=false'] });
  const page = await browser.newPage({ locale: 'fr-FR' });
  await page.goto(baseURL);
  await expect(page.locator('#app')).toBeHidden();
  const text = (await page.evaluate(() => document.body.innerText)).trim();
  expect(text).toBe('Ce jeu a besoin de JavaScript. / This game needs JavaScript.');
  await browser.close();
});

test('prefers-reduced-motion coupe l\'animation', async ({ browser, baseURL }) => {
  const context = await browser.newContext({ reducedMotion: 'reduce', locale: 'fr-FR' });
  const page = await context.newPage();
  await page.goto(baseURL);
  const duration = await page.evaluate(() => getComputedStyle(document.querySelector('.bar'), '::after').animationDuration);
  expect(parseFloat(duration)).toBeLessThan(0.001);
  await context.close();
});
