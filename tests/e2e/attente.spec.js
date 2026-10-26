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

test('la bascule de langue fonctionne avec de vrais clics', async ({ page }) => {
  await page.goto('/');
  const title = page.getByRole('heading', { level: 1 });
  await expect(title).toHaveText('Z-Survival');
  await expect(page.locator('html')).toHaveAttribute('lang', 'fr');

  await page.getByRole('button', { name: 'Switch to English' }).click();
  await expect(title).toHaveText('Z-Survival');
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page).toHaveTitle('Z-Survival');

  await page.getByRole('button', { name: 'Passer en français' }).click();
  await expect(title).toHaveText('Z-Survival');
  await expect(page.locator('html')).toHaveAttribute('lang', 'fr');
});

test('le choix de langue est mémorisé après rechargement', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Switch to English' }).click();
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
});

test('le bouton de langue respecte la cible tactile de 44 px', async ({ page }) => {
  await page.goto('/');
  const box = await page.locator('[data-lang-toggle]').boundingBox();
  expect(box.width).toBeGreaterThanOrEqual(44);
  expect(box.height).toBeGreaterThanOrEqual(44);
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
  await page.getByRole('button', { name: 'Switch to English' }).click();
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

for (const lang of ['fr', 'en']) {
  test(`axe : aucune violation (${lang})`, async ({ page }) => {
    await page.goto('/');
    if (lang === 'en') await page.getByRole('button', { name: 'Switch to English' }).click();
    await expect(page.locator('html')).toHaveAttribute('lang', lang);
    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations).toEqual([]);
  });
}

test('sans JavaScript, seul le message noscript est visible', async ({ baseURL }) => {
  // Le réglage de Blink désactive vraiment les scripts : <noscript> est alors rendu comme dans un vrai navigateur.
  const browser = await chromium.launch({ args: ['--blink-settings=scriptEnabled=false'] });
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
