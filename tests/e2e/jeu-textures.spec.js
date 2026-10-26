import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { waitReady } from './helpers.js';

// Lot 1c-B : textures générées en code, écran de préparation, décor texturé. 667×375 et step() de préférence ; les tests se
// désactivent seuls si WebGL manque. En WebGL logiciel, aucune conclusion de performance.
const SIZE = { width: 667, height: 375 };
const PAGE = (extra = '') => `/jeu.html?test=1&seed=1&nospawn=1${extra}`;
const { textures } = JSON.parse(readFileSync('data/game/textures.json', 'utf8'));
const NOISE = /ReadPixels|GL Driver/;
const state = (page) => page.evaluate(() => window.__zs.getState());
const sample = (page, x, y, w, h) => page.evaluate((a) => window.__zs.sampleScreen(...a), [x, y, w, h]);

async function open(page, extra = '', size = SIZE) {
  await page.setViewportSize(size);
  await page.goto(PAGE(extra));
  await waitReady(page);
}

// Retarde data/game/textures.json (le démarrage attend les données) pour voir l'écran de préparation.
const delayData = (page, ms) => page.route('**/data/game/textures.json', async (route) => {
  await new Promise((resolve) => setTimeout(resolve, ms));
  await route.continue();
});

test.describe('textures du lot 1c-B', () => {
  test.skip(({ isMobile }) => isMobile, 'bureau (la fenêtre est réglée par chaque test)');

  test('l\'écran de préparation apparaît, puis disparaît, et la partie démarre ensuite', async ({ page }) => {
    await delayData(page, 600);
    await page.setViewportSize(SIZE);
    await page.goto(PAGE());
    const loading = page.locator('#loading');
    await expect(loading).toBeVisible();
    await expect(loading).toHaveAttribute('role', 'status');
    await expect(loading).toHaveAttribute('aria-live', 'polite');
    await expect(page.locator('#loading-text')).not.toHaveText('');
    expect(await page.evaluate(() => window.__zs)).toBeUndefined(); // la partie n'existe pas encore
    await waitReady(page);
    await expect(loading).toBeHidden();
    await expect(page.locator('#game-root')).toBeVisible();
    expect((await state(page)).time).toBeGreaterThan(0);
  });

  test('l\'écran de préparation couvre toute la fenêtre (position fixe)', async ({ page }) => {
    await delayData(page, 600);
    await page.setViewportSize(SIZE);
    await page.goto(PAGE());
    await expect(page.locator('#loading')).toHaveCSS('position', 'fixed');
    const box = await page.locator('#loading').boundingBox();
    expect([box.x, box.y, box.width, box.height]).toEqual([0, 0, SIZE.width, SIZE.height]);
  });

  test('textures.ready est vrai ; nombre et mémoire conformes à data/game/textures.json', async ({ page }) => {
    await open(page);
    const s = await state(page);
    expect(s.textures.ready).toBe(true);
    expect(s.textures.count).toBe(textures.length);
    expect(s.textures.count).toBeLessThanOrEqual(14);
    const bytes = Math.round(textures.reduce((sum, t) => sum + (t.size * t.size * 16) / 3, 0));
    expect(s.textures.bytes).toBe(bytes);
    expect(s.textures.bytes).toBeLessThanOrEqual(20 * 1024 * 1024);
    expect(s.textures.readyMs).toBeGreaterThan(0);
  });

  test('le sol de la salle n\'est plus uni : au moins 12 couleurs distinctes', async ({ page }) => {
    await open(page);
    const { distinctColors, meanLuminance } = await sample(page, 20, 210, 160, 90);
    expect(distinctColors).toBeGreaterThanOrEqual(12);
    expect(meanLuminance).toBeGreaterThan(0.03);
  });

  test('la route et l\'herbe ne sont pas unies non plus (vue d\'ensemble)', async ({ page }) => {
    await open(page, '', { width: 1440, height: 900 });
    await page.evaluate(() => window.__zs.overview(true));
    const road = await sample(page, 300, 135, 400, 40);
    const grass = await sample(page, 300, 760, 400, 90);
    expect(road.distinctColors).toBeGreaterThanOrEqual(12);
    expect(grass.distinctColors).toBeGreaterThanOrEqual(12);
  });

  test('aucune requête externe ni image, console propre', async ({ page }) => {
    const requests = [];
    const messages = [];
    page.on('request', (r) => requests.push(r.url()));
    page.on('console', (m) => messages.push(`${m.type()}: ${m.text()}`));
    page.on('pageerror', (e) => messages.push(`pageerror: ${e.message}`));
    await open(page);
    await page.waitForTimeout(300);
    expect(requests.filter((u) => !u.startsWith('http://localhost:4173/'))).toEqual([]);
    expect(requests.filter((u) => /\.(png|jpe?g|gif|webp|avif|svg|ktx2?|basis)(\?|$)/i.test(u))).toEqual([]);
    expect(messages.filter((m) => !NOISE.test(m))).toEqual([]);
  });

  for (const width of [360, 768, 1440]) {
    test(`CLS ≤ 0,1 avec des données retardées de 400 ms à ${width} px`, async ({ page }) => {
      await page.addInitScript(() => {
        window.__cls = 0;
        new PerformanceObserver((list) => {
          for (const e of list.getEntries()) if (!e.hadRecentInput) window.__cls += e.value;
        }).observe({ type: 'layout-shift', buffered: true });
      });
      await delayData(page, 400);
      await page.setViewportSize({ width, height: Math.round(width * 0.5625) });
      await page.goto(PAGE());
      await page.waitForFunction(() => document.getElementById('loading')?.hidden === true || document.getElementById('game-error')?.hidden === false, null, { timeout: 60_000 });
      await page.waitForTimeout(500);
      expect(await page.evaluate(() => window.__cls)).toBeLessThanOrEqual(0.1);
    });
  }

  test('?empty=1 fonctionne avec les textures', async ({ page }) => {
    await open(page, '&empty=1');
    const s = await state(page);
    expect(s.textures.ready).toBe(true);
    expect(s.world.empty).toBe(true);
    // Zone plus large que pour la salle meublée : sans meuble, ce coin du sol sombre est lisse sur 160×90 px (11 couleurs à 16 niveaux).
    expect((await sample(page, 20, 200, 300, 150)).distinctColors).toBeGreaterThanOrEqual(12);
  });

  test('garanties de confidentialité inchangées : ni stockage ni cookie', async ({ page, context }) => {
    await open(page);
    expect(await page.evaluate(() => [localStorage.length, sessionStorage.length, document.cookie])).toEqual([0, 0, '']);
    expect(await context.cookies()).toEqual([]);
  });

  test('?fps=1 affiche les durées des textures et du champ de flux', async ({ page }) => {
    await open(page, '&fps=1');
    await expect(page.locator('#fps-counter')).toContainText('Images/s');
    await expect(page.locator('#fps-counter')).toContainText(/Textures : \d+ ms ; flux : [\d.]+ ms \(max [\d.]+\)/);
  });

  test('sans ?fps=1, aucune mesure n\'est affichée', async ({ page }) => {
    await open(page);
    await expect(page.locator('#fps-counter')).toHaveCount(0);
  });

  test('sans ?test=1, ni sampleScreen ni textures ne sont exposés', async ({ page }) => {
    await page.setViewportSize(SIZE);
    await page.goto('/jeu.html');
    await page.waitForFunction(() => document.getElementById('loading')?.hidden === true || document.getElementById('game-error')?.hidden === false, null, { timeout: 60_000 });
    expect(await page.evaluate(() => typeof window.__zs)).toBe('undefined');
  });

  test('budget de dessin : au plus 300 appels et 15 000 triangles avec 8 zombies et les ombres actives', async ({ page }) => {
    await open(page, '', { width: 1440, height: 900 });
    await page.evaluate(() => window.__zs.overview(false));
    await page.evaluate(() => {
      const s = window.__zs.getState();
      for (let i = 0; i < 8; i += 1) window.__zs.spawnEnemy(s.player.x + 120 + 40 * (i % 4), s.player.y - 120 + 90 * Math.floor(i / 4));
    });
    await page.evaluate(() => window.__zs.sampleScreen(0, 0, 8, 8)); // force un rendu à jour
    const s = await state(page);
    expect(s.enemies.length).toBe(8);
    console.log(`appels de dessin : ${s.render.calls}, triangles : ${s.render.triangles}`);
    expect(s.render.calls).toBeLessThanOrEqual(300);
    expect(s.render.triangles).toBeLessThanOrEqual(15_000);
  });
});
