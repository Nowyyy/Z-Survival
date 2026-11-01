import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { readFileSync } from 'node:fs';
import { visitWave } from '../../js/core/visite.js';

// Lot 3g, partie A : pages techniques visite.html et ecarts.html (jetons du site, noindex, noscript, axe, cibles de 44 px, aucune requête externe).
const SIZE = { width: 667, height: 375 };
const N = visitWave(JSON.parse(readFileSync('data/game/maps/rez-de-chaussee/zones.json', 'utf8')));
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
  test(`liens construits depuis zones.json : manche ${N}, nospawn, zoom, étiquettes, étage, écarts`, async ({ page }) => {
    const w = await watch(page, '/visite.html');
    await expect(page.locator('#visite-rdc')).toHaveAttribute('href', `jeu.html?nospawn=1&wave=${N}`);
    await expect(page.locator('#visite-rdc-zoom')).toHaveAttribute('href', `jeu.html?nospawn=1&wave=${N}&zoom=1`);
    await expect(page.locator('#visite-labels')).toHaveAttribute('href', `jeu.html?nospawn=1&wave=${N}&labels=1`);
    await expect(page.locator('#visite-etage')).toHaveAttribute('href', `jeu.html?nospawn=1&wave=${N}&floor=1`);
    await expect(page.locator('#visite-etage-zoom')).toHaveAttribute('href', `jeu.html?nospawn=1&wave=${N}&floor=1&zoom=1`);
    await expect(page.locator('#visite-ecarts')).toHaveAttribute('href', 'ecarts.html');
    await expect(page.locator('#intro')).toContainText(String(N));
    await expect(page.locator('body')).toHaveAttribute('data-wave', String(N));
    expect(w.problems).toEqual([]);
    expect(w.external).toEqual([]);
  });

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

  test('sans JavaScript : le <noscript> donne les liens de la visite (manche 31 de la base)', async ({ browser }) => {
    const ctx = await browser.newContext({ javaScriptEnabled: false, viewport: SIZE });
    const page = await ctx.newPage();
    await page.goto('/visite.html');
    await expect(page.locator('noscript a').first()).toBeVisible();
    await expect(page.locator('noscript a').first()).toHaveAttribute('href', 'jeu.html?nospawn=1&wave=31');
    expect(await page.locator('noscript a').count()).toBeGreaterThanOrEqual(3);
    await ctx.close();
  });

  test('zones.json illisible : liens par défaut et message', async ({ page }) => {
    await page.route('**/zones.json', (route) => route.fulfill({ status: 404, body: '' }));
    await page.setViewportSize(SIZE);
    await page.goto('/visite.html');
    await expect(page.locator('#visite-rdc')).toHaveAttribute('href', 'jeu.html?nospawn=1&wave=31');
    await expect(page.locator('#etat')).not.toBeEmpty();
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

  test('sélecteur d\'étage : boutons de 44 px, aria-pressed, l\'étage se dessine', async ({ page }) => {
    await watch(page, '/ecarts.html');
    await expect(page.locator('#bouton-rdc')).toHaveAttribute('aria-pressed', 'true');
    await page.locator('#bouton-etage').click();
    await expect(page.locator('#bouton-etage')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('#bouton-rdc')).toHaveAttribute('aria-pressed', 'false');
    await expect(page.locator('body')).toHaveAttribute('data-floor', 'etage');
    await expect(page.locator('#figure svg text', { hasText: /^U1$/ }).first()).toBeAttached();
    expect(await smallTargets(page)).toEqual([]);
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

  test('sans JavaScript : message <noscript> et lien vers la visite', async ({ browser }) => {
    const ctx = await browser.newContext({ javaScriptEnabled: false, viewport: SIZE });
    const page = await ctx.newPage();
    await page.goto('/ecarts.html');
    await expect(page.locator('noscript p')).toContainText('JavaScript');
    await expect(page.locator('noscript a')).toHaveAttribute('href', 'visite.html');
    await ctx.close();
  });

  test('aucun défilement horizontal à 375 px', async ({ page }) => {
    await watch(page, '/ecarts.html', { width: 375, height: 667 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  });
});
