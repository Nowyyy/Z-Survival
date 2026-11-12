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
  const files = readdirSync('css').filter((f) => f.endsWith('.css') && f !== 'tokens.css' && f !== 'ouvertures.css');
  expect(files.length).toBeGreaterThan(0);
  for (const f of files) expect(readFileSync(`css/${f}`, 'utf8'), f).not.toMatch(COLOR);
  // Lot 8f (prompt du lot) : feuille des jetons de l'ouverture en 3D, chargée avec elle : une couleur n'y apparaît que dans une déclaration --ouv-*.
  const ouv = readFileSync('css/ouvertures.css', 'utf8').split('\n').filter((l) => COLOR.test(l));
  expect(ouv.length).toBeGreaterThan(0);
  for (const l of ouv) expect(l, l).toMatch(/^\s*--ouv-[a-z0-9-]+:\s*(#[0-9a-f]{6}|rgb\(\d+ \d+ \d+ \/ \d+%\));$/);
  expect(readFileSync('index.html', 'utf8')).not.toMatch(/style="[^"]*#|style="[^"]*rgb/);
});

test('la page est en français, sans bouton de langue, même avec un navigateur en anglais', async ({ browser, baseURL }) => {
  const context = await browser.newContext({ locale: 'en-US' });
  const page = await context.newPage();
  await page.goto(baseURL);
  await expect(page.locator('html')).toHaveAttribute('lang', 'fr');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Z-Survival');
  // Lot 4c : l'accueil remplace la page d'attente (avant : « En construction. Reviens bientôt ! »). Lot 5g : servi depuis le dépôt, il lit site-info.json
  // « source » (avant : build-info.json « source », « Recette · Version V0.5 ») : étiquette « arbre source », liens statiques, aucune liste.
  // Lot 5i : le bandeau dit « Recette » seulement (avant : « Recette · arbre source ») ; sans version connue, le bouton dit « Jouer » seul.
  await expect(page.locator('#version')).toHaveText('Recette');
  await expect(page.locator('#site-notice')).toHaveText('Arbre source du dépôt : la version, les évolutions et les versions précédentes s\'affichent dans le site assemblé.');
  await expect(page.getByRole('link', { name: 'Jouer', exact: true })).toHaveAttribute('href', 'jeu.html');
  await expect(page.getByRole('link', { name: 'Dernier build de développement' })).toHaveAttribute('href', '../dev/jeu.html');
  // Lot 5i : #versions-section (« Toutes les versions », avant : #previous-section).
  await expect(page.locator('#evolutions-section, #versions-section')).toHaveCount(2);
  await expect(page.locator('#evolutions-section')).toBeHidden();
  await expect(page.locator('#versions-section')).toBeHidden();
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

// Lot 4c : le <noscript> porte aussi des liens statiques (lot 5g : jeu.html et ../dev/jeu.html ; avant : jeu.html, next/ et dev/).
test('sans JavaScript, seuls le message noscript et ses liens sont visibles', async ({ baseURL }) => {
  // Le réglage de Blink désactive vraiment les scripts : <noscript> est alors rendu comme dans un vrai navigateur.
  const browser = await chromium.launch({ channel: process.env.CI ? 'chrome' : undefined, args: ['--blink-settings=scriptEnabled=false'] });
  const page = await browser.newPage({ locale: 'fr-FR' });
  await page.goto(baseURL);
  await expect(page.locator('#app')).toBeHidden();
  const text = (await page.evaluate(() => document.body.innerText)).trim();
  // Lot 5g : plus de lien « Journal des versions / Version history » (journal supprimé).
  expect(text.split('\n').map((l) => l.trim()).filter(Boolean)).toEqual(['Ce jeu a besoin de JavaScript. / This game needs JavaScript.', 'Jouer / Play', 'Dernier build de développement / Latest development build']);
  await browser.close();
});

// Lot 4c : la barre animée de la page d'attente est retirée ; l'accueil n'a aucune animation, et la règle de base.css coupe toute animation en mouvement réduit.
test('prefers-reduced-motion : aucune animation sur l\'accueil', async ({ browser, baseURL }) => {
  const context = await browser.newContext({ reducedMotion: 'reduce', locale: 'fr-FR' });
  const page = await context.newPage();
  await page.goto(baseURL);
  await expect(page.locator('#app')).toBeVisible();
  // En mouvement réduit, une animation éventuelle dure 0,01 ms : il n'en reste aucune en cours (lue par expect.poll, jamais juste après une action).
  await expect.poll(() => page.evaluate(() => document.getAnimations().filter((a) => a.playState === 'running').length)).toBe(0);
  await expect(page.getByRole('link', { name: 'Jouer' })).toHaveCSS('transition-duration', /^(0s|1e-05s)$/);
  await context.close();
});
