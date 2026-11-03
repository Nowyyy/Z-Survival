import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

// Lot 3g, partie A : pages techniques visite.html et ecarts.html (jetons du site, noindex, noscript, axe, cibles de 44 px, aucune requête externe).
const SIZE = { width: 667, height: 375 };
const BROWSER_NOISE = /GL Driver Message|ReadPixels|GPU stall/;

// Ouvre une page en relevant les erreurs de console et les requêtes vers une autre origine.
async function watch(page, path, size = SIZE) {
  const problems = [];
  const external = [];
  page.on('console', (m) => ['error', 'warning'].includes(m.type()) && !BROWSER_NOISE.test(m.text()) && problems.push(m.text()));
  page.on('pageerror', (e) => problems.push(e.message));
  page.on('request', (r) => { if (!r.url().startsWith('http://localhost') && !r.url().startsWith('data:')) external.push(r.url()); });
  await page.setViewportSize(size);
  await page.goto(path);
  await expect(page.locator('#app')).toBeVisible();
  return { problems, external };
}

const smallTargets = (page) => page.evaluate(() => [...document.querySelectorAll('a, button')].filter((el) => el.offsetParent !== null).map((el) => ({ id: el.id || el.textContent, r: el.getBoundingClientRect() })).filter(({ r }) => r.width < 44 || r.height < 44).map(({ id }) => id));

test.describe('visite.html', () => {

  test('noindex, lang fr, titre depuis fr.json, aucune cible de moins de 44 px, axe sans violation', async ({ page }) => {
    await watch(page, '/visite.html');
    await expect(page.locator('html')).toHaveAttribute('lang', 'fr');
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex');
    await expect(page).toHaveTitle(/visite libre/);
    expect(await smallTargets(page)).toEqual([]);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  });

  test('1440 px : axe sans violation, cibles de 44 px', async ({ page }) => {
    await watch(page, '/visite.html', { width: 1440, height: 900 });
    expect(await smallTargets(page)).toEqual([]);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  });

});

test.describe('ecarts.html', () => {
  test('se charge : identifiants du mobilier et des fenêtres, relevé en pointillés, cadres des écarts, objets sans équivalent', async ({ page }) => {
    const w = await watch(page, '/ecarts.html', { width: 1440, height: 900 });
    const svg = page.locator('#figure svg');
    await expect(svg).toBeVisible();
    for (const id of ['F1', 'F8', 'P13']) await expect(svg.locator('text', { hasText: new RegExp(`^${id}$`) }).first()).toBeAttached();
    expect(await svg.locator('.releve').count()).toBeGreaterThan(50);
    expect(await svg.locator('.ecart').count()).toBeGreaterThan(0);
    expect(await svg.locator('.objet-sans').count()).toBeGreaterThan(0);
    await expect(svg.locator('.etiquette-ecart').first()).toContainText('> 60');
    await expect(page.locator('#stats')).toContainText('Rez-de-chaussée');
    expect(w.problems).toEqual([]);
    expect(w.external).toEqual([]);
  });

  test('axe sans violation (rez-de-chaussée et étage), noindex, lang fr', async ({ page }) => {
    await watch(page, '/ecarts.html');
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex');
    await expect(page.locator('html')).toHaveAttribute('lang', 'fr');
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await page.goto('/ecarts.html?floor=1');
    await expect(page.locator('body')).toHaveAttribute('data-floor', 'etage');
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  });

});
