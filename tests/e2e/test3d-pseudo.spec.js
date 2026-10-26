import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

// Page pseudo-3D (Canvas 2D) et compteur d'images par seconde de jeu.html?fps=1. Mesures non représentatives d'un téléphone.
const SIZE = { width: 667, height: 375 };
const PSEUDO = (extra = '') => `/test3d/pseudo.html?test=1${extra}`;
const BROWSER_NOISE = /GL Driver Message/;

const state = (page) => page.evaluate(() => window.__t3dPseudo.getState());
async function open(page, extra = '') {
  await page.setViewportSize(SIZE);
  await page.goto(PSEUDO(extra));
  await page.waitForFunction(() => window.__t3dPseudo?.getState()?.time > 0.05);
}
const openPanel = async (page) => {
  if (await page.locator('#t3d-panel').isHidden()) await page.click('#t3d-toggle');
  await expect(page.locator('#t3d-panel')).toBeVisible();
};

test.describe('page pseudo-3D', () => {
  test.skip(({ isMobile }) => isMobile, 'mesures de bureau (667×375)');

  test('se charge sans erreur de console ni requête externe', async ({ page, baseURL }) => {
    const external = [];
    const problems = [];
    page.on('request', (r) => {
      if (!r.url().startsWith(baseURL) && !r.url().startsWith('data:')) external.push(r.url());
    });
    page.on('console', (m) => ['error', 'warning'].includes(m.type()) && !BROWSER_NOISE.test(m.text()) && problems.push(m.text()));
    page.on('pageerror', (e) => problems.push(e.message));
    page.on('requestfailed', (r) => problems.push(`échec ${r.url()}`));
    page.on('response', (r) => r.status() >= 400 && problems.push(`${r.status()} ${r.url()}`));
    await open(page);
    await page.waitForLoadState('networkidle');
    expect(external).toEqual([]);
    expect(problems).toEqual([]);
  });

  test('le canvas couvre la fenêtre, avant et après redimensionnement', async ({ page }) => {
    await open(page);
    const box = () => page.evaluate(() => {
      const r = document.getElementById('t3d-canvas').getBoundingClientRect();
      return [r.x, r.y, Math.round(r.width), Math.round(r.height), innerWidth, innerHeight];
    });
    await expect.poll(box).toEqual([0, 0, 667, 375, 667, 375]);
    await page.setViewportSize({ width: 900, height: 500 });
    await expect.poll(box).toEqual([0, 0, 900, 500, 900, 500]);
    await expect.poll(async () => (await state(page)).canvas.width).toBe(900);
  });

  test('la mesure rapide produit des valeurs finies, ajoutées au rapport à chaque mesure', async ({ page }) => {
    await open(page, '&bench=quick');
    await openPanel(page);
    await page.click('#t3d-measure');
    await expect.poll(async () => (await state(page)).measure.results, { timeout: 30_000 }).toBe(1);
    await page.click('#t3d-measure');
    await expect.poll(async () => (await state(page)).measure.results, { timeout: 30_000 }).toBe(2);
    const text = await page.locator('#t3d-report').inputValue();
    expect(text).toContain('pseudo-3D');
    expect(text).toMatch(/Date du test : \d{4}-\d{2}-\d{2}T/);
    expect(text).toContain('Mesure 1/2');
    expect(text).toContain('Mesure 2/2');
    expect(text).not.toMatch(/NaN|Infinity|undefined|null/);
    const numbers = [...text.matchAll(/seconde \(moyenne\) : (-?[\d.]+)/g), ...text.matchAll(/médian (-?[\d.]+) ms/g), ...text.matchAll(/95e centile (-?[\d.]+) ms/g), ...text.matchAll(/1 % bas : (-?[\d.]+)/g)].map((m) => Number(m[1]));
    expect(numbers).toHaveLength(2 * 4);
    for (const n of numbers) expect(Number.isFinite(n) && n > 0).toBe(true);
  });

  test('la mesure complète dure 6 s (libellé du bouton)', async ({ page }) => {
    await open(page);
    await openPanel(page);
    await expect(page.locator('#t3d-measure')).toHaveText('Mesurer 6 s');
  });

  test('les deux pages de test se renvoient l\'une à l\'autre et vers le compteur du jeu', async ({ page }) => {
    await open(page);
    await openPanel(page);
    await expect(page.locator('#t3d-panel a[href="index.html"]')).toHaveText('Comparer');
    await expect(page.locator('#t3d-panel a[href="../jeu.html?fps=1"]')).toBeVisible();
    await page.goto('/test3d/index.html?test=1');
    await page.waitForFunction(() => window.__t3d !== undefined);
    await page.click('#t3d-toggle').catch(() => {});
    await expect(page.locator('#t3d-panel a[href="pseudo.html"]')).toHaveCount(1);
    await expect(page.locator('#t3d-panel a[href="../jeu.html?fps=1"]')).toHaveCount(1);
  });

  test('les deux pages chargent la même pose.js', async ({ page }) => {
    const urls = [];
    page.on('request', (r) => urls.push(new URL(r.url()).pathname));
    await open(page);
    expect(urls.filter((u) => u.endsWith('/js/test3d/pose.js'))).toHaveLength(1);
    await page.goto('/test3d/index.html?test=1');
    await page.waitForFunction(() => window.__t3d !== undefined);
    await page.waitForLoadState('networkidle');
    expect(urls.filter((u) => u.endsWith('/js/test3d/pose.js'))).toHaveLength(2);
  });

  test('axe : aucune violation', async ({ page }) => {
    await open(page);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await openPanel(page);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  });
});

test.describe('compteur ?fps=1 sur jeu.html', () => {
  test.skip(({ isMobile }) => isMobile, 'mesures de bureau (667×375)');

  test('sans le paramètre : aucun élément ajouté, aucune requête vers fps.js', async ({ page }) => {
    const urls = [];
    page.on('request', (r) => urls.push(r.url()));
    await page.setViewportSize(SIZE);
    await page.goto('/jeu.html?test=1&seed=1');
    await page.waitForFunction(() => (window.__zs?.getState()?.time ?? 0) > 0.05);
    await expect(page.locator('#fps-counter')).toHaveCount(0);
    expect(urls.filter((u) => u.includes('fps'))).toEqual([]);
  });

  test('avec le paramètre : l\'élément existe et affiche un nombre', async ({ page }) => {
    await page.setViewportSize(SIZE);
    await page.goto('/jeu.html?test=1&seed=1&fps=1');
    await page.waitForFunction(() => (window.__zs?.getState()?.time ?? 0) > 0.05);
    await expect(page.locator('#fps-counter')).toHaveCount(1);
    await expect(page.locator('#fps-counter')).toHaveText(/^Images\/s : \d+$/);
    await expect.poll(async () => Number((await page.locator('#fps-counter').textContent()).replace(/\D+/g, ''))).toBeGreaterThan(0);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  });
});
