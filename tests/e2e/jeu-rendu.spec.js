import { test, expect } from '@playwright/test';
import { waitReady } from './helpers.js';

// Rendu et enveloppe du jeu en 3D (lot 1m, partie B). Petite fenêtre : le rendu logiciel y est plus rapide.
const SIZE = { width: 667, height: 375 };
const URL = (extra = '') => `/jeu.html?test=1&nospawn=1&seed=1${extra}`;
const state = (page) => page.evaluate(() => window.__zs.getState());
async function open(page, extra = '', size = SIZE) {
  await page.setViewportSize(size);
  await page.goto(URL(extra));
  await waitReady(page);
}
// Nombre de pixels d'une capture proches d'une couleur (tolérance par canal), décodés dans la page.
async function countPixels(page, [r, g, b], tolerance = 40) {
  const shot = (await page.screenshot()).toString('base64');
  return page.evaluate(async ([data, target, tol]) => {
    const img = new Image();
    img.src = `data:image/png;base64,${data}`;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = img.width;
    c.height = img.height;
    const ctx = c.getContext('2d');
    ctx.drawImage(img, 0, 0);
    const px = ctx.getImageData(0, 0, c.width, c.height).data;
    let n = 0;
    for (let i = 0; i < px.length; i += 4) if (Math.abs(px[i] - target[0]) <= tol && Math.abs(px[i + 1] - target[1]) <= tol && Math.abs(px[i + 2] - target[2]) <= tol) n += 1;
    return n;
  }, [shot, [r, g, b], tolerance]);
}
const LASER = [0xff, 0x4a, 0x3d];
const BULLET = [0xff, 0xe8, 0xa3];

test.describe('rendu visible', () => {
  test.skip(({ isMobile }) => isMobile, 'bureau');

  test('le laser rouge est dessiné dans le canvas', async ({ page }) => {
    await open(page);
    await page.evaluate(() => window.__zs.setInput({ aim: { angle: 0 } }));
    await expect.poll(() => countPixels(page, LASER, 30), { timeout: 30_000 }).toBeGreaterThan(30);
  });

  test('une balle en vol est visible (partie figée en plein vol, panneau de pause masqué)', async ({ page }) => {
    await open(page);
    // Quelques pixels proches de cette couleur existent déjà (lissage, personnage) : on compare avant et pendant le vol.
    const before = await countPixels(page, BULLET, 12);
    await page.evaluate(() => { window.__zs.setInput({ aim: { angle: 0 } }); window.__zs.spawnEnemy(1500, 450); });
    await page.waitForFunction(() => window.__zs.getState().bullets.length > 0);
    await page.keyboard.press('KeyP');
    await page.addStyleTag({ content: '#pause-panel { display: none !important; }' });
    expect((await state(page)).bullets.length).toBeGreaterThan(0);
    await expect.poll(() => countPixels(page, BULLET, 12), { timeout: 30_000 }).toBeGreaterThan(before + 8);
  });

  test('un zombie tué disparaît de la scène : le nombre d\'appels de dessin redevient celui d\'avant', async ({ page }) => {
    await open(page);
    const base = (await state(page)).render.calls;
    await page.evaluate(() => { window.__zs.setInput({ aim: { angle: 0 } }); window.__zs.spawnEnemy(1100, 450); });
    await expect.poll(async () => (await state(page)).render.calls).toBeGreaterThan(base);
    await expect.poll(async () => (await state(page)).kills, { timeout: 60_000 }).toBe(1);
    await expect.poll(async () => (await state(page)).render.calls, { timeout: 30_000 }).toBeLessThanOrEqual(base + 4);
  });
});

test.describe('enveloppe', () => {
  test.skip(({ isMobile }) => isMobile, 'bureau');

  test('sans ?test=1, rien n\'est exposé (window.__zs absent)', async ({ page }) => {
    await page.setViewportSize(SIZE);
    await page.goto('/jeu.html?nospawn=1');
    await expect(page.locator('#hud-life')).toHaveText('Vie 100/100');
    expect(await page.evaluate(() => typeof window.__zs)).toBe('undefined');
  });

  test('Three.js est servi en local : aucune requête hors du site, modules de vendor/three/ chargés', async ({ page, baseURL }) => {
    const urls = [];
    page.on('request', (r) => urls.push(r.url()));
    await open(page);
    expect(urls.every((u) => u.startsWith(baseURL) || u.startsWith('data:'))).toBe(true);
    for (const f of ['three.module.js', 'three.core.js']) expect(urls.some((u) => u.endsWith(`/vendor/three/${f}`)), f).toBe(true);
  });

  test('le compteur ?fps=1 apparaît ; sans ce paramètre il n\'existe pas', async ({ page }) => {
    await open(page);
    await expect(page.locator('#fps-counter')).toHaveCount(0);
    await page.goto(URL('&fps=1'));
    await waitReady(page);
    await expect(page.locator('#fps-counter')).toContainText('Images/s');
  });

  test('aucune boucle de rendu quand l\'onglet est caché, reprise au retour', async ({ page }) => {
    await page.addInitScript(() => {
      window.__frames = 0;
      const raf = window.requestAnimationFrame.bind(window);
      window.requestAnimationFrame = (cb) => raf((t) => { window.__frames += 1; cb(t); });
    });
    await open(page);
    const hide = (value) => page.evaluate((hidden) => {
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden });
      document.dispatchEvent(new Event('visibilitychange'));
    }, value);
    await hide(true);
    await page.waitForTimeout(300);
    const frozen = await page.evaluate(() => window.__frames);
    await page.waitForTimeout(700);
    expect(await page.evaluate(() => window.__frames)).toBe(frozen);
    await hide(false);
    await expect.poll(() => page.evaluate(() => window.__frames)).toBeGreaterThan(frozen);
  });

  test('prefers-reduced-motion : la partie tourne, la balle reste visible dans l\'état', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await open(page);
    await page.evaluate(() => { window.__zs.setInput({ aim: { angle: 0 } }); window.__zs.spawnEnemy(1400, 450); });
    await page.waitForFunction(() => window.__zs.getState().bullets.length > 0);
    await expect.poll(async () => (await state(page)).enemies[0]?.health ?? 0, { timeout: 30_000 }).toBeLessThan(50);
  });
});

test.describe('panneaux et marges', () => {
  test.skip(({ isMobile }) => isMobile, 'bureau');

  for (const [id, trigger] of [['#pause-panel', 'pause'], ['#end-panel', 'fin']]) {
    test(`le panneau ${id} reste à 16 px au moins des bords à 667×375`, async ({ page }) => {
      await open(page);
      if (trigger === 'pause') await page.keyboard.press('KeyP');
      else {
        await page.evaluate(() => { window.__zs.setInput({ aim: { angle: -Math.PI / 2 } }); for (const [x, y] of [[850, 450], [750, 450], [800, 500], [835, 480], [770, 480]]) window.__zs.spawnEnemy(x, y); });
      }
      await expect(page.locator(`${id} .panel`)).toBeVisible({ timeout: 60_000 });
      const box = await page.locator(`${id} .panel`).boundingBox();
      expect(box.x).toBeGreaterThanOrEqual(16);
      expect(box.y).toBeGreaterThanOrEqual(16);
      expect(SIZE.width - (box.x + box.width)).toBeGreaterThanOrEqual(16);
      expect(SIZE.height - (box.y + box.height)).toBeGreaterThanOrEqual(16);
    });
  }
});

test('sticks tactiles : cachés à la souris, visibles au repos après un premier toucher (CDP)', async ({ browser, baseURL }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile', 'une seule fois');
  const context = await browser.newContext({ viewport: SIZE, hasTouch: true, isMobile: true, locale: 'fr-FR' });
  const page = await context.newPage();
  await page.goto(baseURL + URL());
  await waitReady(page);
  await expect(page.locator('#stick-left .stick-base')).toBeHidden();
  const cdp = await context.newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 120, y: 250, id: 1 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await expect(page.locator('#stick-left .stick-base')).toBeVisible();
  await expect(page.locator('#stick-right .stick-base')).toBeVisible();
  await expect(page.locator('#game-root')).toHaveAttribute('data-input', 'touch');
  await context.close();
});
