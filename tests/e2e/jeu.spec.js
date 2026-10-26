import { test, expect, chromium } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { expectedDistance, waitReady } from './helpers.js';

const URL = '/jeu.html?test=1&seed=1';
// Message du pilote graphique à la création du premier contexte WebGL du navigateur : du bruit du navigateur, pas du jeu.
const BROWSER_NOISE = /GL Driver Message/;

const state = (page) => page.evaluate(() => window.__zs.getState());
const ready = waitReady;
const canvasBox = (page) => page.evaluate(() => {
  const r = document.querySelector('#game-canvas canvas').getBoundingClientRect();
  return { x: r.x, y: r.y, width: r.width, height: r.height, innerWidth, innerHeight };
});
const near = (a, b) => Math.abs(a - b) <= 1;

test.describe('plein écran', () => {
  test.skip(({ isMobile }) => isMobile, 'mesures de bureau');

  for (const [w, h] of [[1440, 900], [1920, 1080], [2560, 1080], [667, 375]]) {
    test(`le canvas couvre la fenêtre à ${w}×${h}`, async ({ page }) => {
      await page.setViewportSize({ width: w, height: h });
      await page.goto(URL);
      await ready(page);
      await expect.poll(async () => {
        const b = await canvasBox(page);
        return near(b.width, w) && near(b.height, h) && b.x === 0 && b.y === 0;
      }).toBe(true);
    });
  }

  test('le canvas suit un redimensionnement de la fenêtre', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(URL);
    await ready(page);
    for (const [w, h] of [[1000, 700], [2560, 1080], [800, 1200]]) {
      await page.setViewportSize({ width: w, height: h });
      await expect.poll(async () => {
        const b = await canvasBox(page);
        return near(b.width, w) && near(b.height, h);
      }).toBe(true);
    }
  });

  test('aucune barre de défilement, avant et après redimensionnement', async ({ page }) => {
    await page.goto(URL);
    await ready(page);
    for (const [w, h] of [[1440, 900], [900, 1300]]) {
      await page.setViewportSize({ width: w, height: h });
      await expect.poll(() => page.evaluate(() => [
        document.documentElement.scrollWidth - document.documentElement.clientWidth,
        document.documentElement.scrollHeight - document.documentElement.clientHeight,
        document.body.scrollWidth - innerWidth,
      ])).toEqual([0, 0, 0]);
    }
  });

  test('la distance de la caméra suit fitDistance de viewport.js', async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.goto(URL);
    await ready(page);
    expect((await state(page)).camera.distance).toBeCloseTo(expectedDistance(1920 / 1080, 75), 3);
    await page.setViewportSize({ width: 1440, height: 900 });
    await expect.poll(async () => (await state(page)).camera.distance).toBeCloseTo(expectedDistance(1440 / 900, 75), 3);
  });

  test('la résolution interne est plafonnée à 2 sur un écran haute densité', async ({ browser, baseURL }) => {
    const context = await browser.newContext({ viewport: { width: 800, height: 450 }, deviceScaleFactor: 3 });
    const page = await context.newPage();
    await page.goto(baseURL + URL);
    await ready(page);
    const size = await page.evaluate(() => {
      const c = document.querySelector('#game-canvas canvas');
      return { w: c.width, h: c.height };
    });
    expect(size).toEqual({ w: 1600, h: 900 });
    await context.close();
  });
});

test.describe('déplacement', () => {
  test.skip(({ isMobile }) => isMobile, 'clavier');

  test('W, A, S, D déplacent le joueur (touches physiques)', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(URL);
    await ready(page);
    const start = (await state(page)).player;
    for (const [code, axis, sign] of [['KeyD', 'x', 1], ['KeyA', 'x', -1], ['KeyS', 'y', 1], ['KeyW', 'y', -1]]) {
      const before = (await state(page)).player[axis];
      await page.keyboard.down(code);
      await expect.poll(async () => ((await state(page)).player[axis] - before) * sign).toBeGreaterThan(8);
      await page.keyboard.up(code);
    }
    expect(start.x).toBe(800);
  });

  test('les flèches fonctionnent aussi', async ({ page }) => {
    await page.goto(URL);
    await ready(page);
    const before = (await state(page)).player.x;
    await page.keyboard.down('ArrowRight');
    await expect.poll(async () => (await state(page)).player.x - before).toBeGreaterThan(8);
    await page.keyboard.up('ArrowRight');
  });

  test('les touches sont lues par event.code, quelle que soit la disposition du clavier', async ({ page }) => {
    await page.goto(URL);
    await ready(page);
    const before = (await state(page)).player.x;
    // Clavier AZERTY : la touche physique de « A » QWERTY produit la lettre « q » mais le code « KeyA ».
    await page.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyA', key: 'q' })));
    await expect.poll(async () => before - (await state(page)).player.x).toBeGreaterThan(8);
    await page.evaluate(() => window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyA', key: 'q' })));
  });

  test('le joueur reste dans la salle', async ({ page }) => {
    // Petite fenêtre et délai large : le temps de jeu avance plus lentement que le temps réel quand le rendu est lent (CI).
    test.setTimeout(90_000);
    await page.setViewportSize({ width: 667, height: 375 });
    await page.goto(URL);
    await ready(page);
    const wall = 24 + 18;
    await page.keyboard.down('KeyA');
    await page.keyboard.down('KeyW');
    await expect.poll(async () => {
      const p = (await state(page)).player;
      return p.x <= wall + 0.01 && p.y <= wall + 0.01;
    }, { timeout: 80_000 }).toBe(true);
    // Quelques instants de plus contre les murs : jamais au-delà.
    await page.waitForTimeout(500);
    const p = (await state(page)).player;
    expect(p.x).toBeGreaterThanOrEqual(wall - 0.01);
    expect(p.y).toBeGreaterThanOrEqual(wall - 0.01);
    await page.keyboard.up('KeyA');
    await page.keyboard.up('KeyW');
  });
});

// Téléphone en portrait : le message de rotation remplace le jeu ; on teste donc en paysage.
const landscape = (page, isMobile) => page.setViewportSize(isMobile ? { width: 667, height: 375 } : { width: 1440, height: 900 });

test('aucune requête externe et console propre', async ({ page, baseURL, isMobile }) => {
  await landscape(page, isMobile);
  const external = [];
  const problems = [];
  page.on('request', (r) => {
    if (!r.url().startsWith(baseURL) && !r.url().startsWith('data:')) external.push(r.url());
  });
  page.on('console', (m) => ['error', 'warning'].includes(m.type()) && !BROWSER_NOISE.test(m.text()) && problems.push(m.text()));
  page.on('pageerror', (e) => problems.push(e.message));
  page.on('requestfailed', (r) => problems.push(`échec ${r.url()}`));
  page.on('response', (r) => r.status() >= 400 && problems.push(`${r.status()} ${r.url()}`));
  await page.goto(URL);
  await ready(page);
  await page.waitForLoadState('networkidle');
  expect(external).toEqual([]);
  expect(problems).toEqual([]);
});

test('axe : aucune violation', async ({ page, isMobile }) => {
  await landscape(page, isMobile);
  await page.goto(URL);
  await ready(page);
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);
});

test('sans JavaScript, seul le message noscript est visible', async ({ baseURL }) => {
  const browser = await chromium.launch({ channel: process.env.CI ? 'chrome' : undefined, args: ['--blink-settings=scriptEnabled=false'] });
  const page = await browser.newPage({ locale: 'fr-FR' });
  await page.goto(`${baseURL}/jeu.html`);
  await expect(page.locator('#game-root')).toBeHidden();
  const text = (await page.evaluate(() => document.body.innerText)).trim();
  expect(text).toBe('Ce jeu a besoin de JavaScript. / This game needs JavaScript.');
  await browser.close();
});

test.describe('téléphone', () => {
  test('le message « Tourne ton téléphone » remplace le jeu en portrait', async ({ browser, baseURL }) => {
    const context = await browser.newContext({ viewport: { width: 375, height: 667 }, hasTouch: true, isMobile: true, locale: 'fr-FR' });
    const page = await context.newPage();
    await page.goto(baseURL + URL);
    await expect(page.locator('#rotate')).toBeVisible();
    await expect(page.locator('#rotate')).toContainText('Tourne ton téléphone');
    await expect(page.locator('#game-root')).toBeHidden();
    await expect.poll(() => page.evaluate(() => window.__zs.getState()?.paused)).toBe(true);
    await context.close();
  });

  test('axe : aucune violation avec le message de rotation', async ({ browser, baseURL }) => {
    const context = await browser.newContext({ viewport: { width: 375, height: 667 }, hasTouch: true, isMobile: true, locale: 'fr-FR' });
    const page = await context.newPage();
    await page.goto(baseURL + URL);
    await expect(page.locator('#rotate')).toBeVisible();
    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations).toEqual([]);
    await context.close();
  });

  test('le message est absent en paysage (667×375)', async ({ browser, baseURL }) => {
    const context = await browser.newContext({ viewport: { width: 667, height: 375 }, hasTouch: true, isMobile: true, locale: 'fr-FR' });
    const page = await context.newPage();
    await page.goto(baseURL + URL);
    await expect(page.locator('#rotate')).toBeHidden();
    await expect(page.locator('#game-root')).toBeVisible();
    await ready(page);
    await context.close();
  });
});
