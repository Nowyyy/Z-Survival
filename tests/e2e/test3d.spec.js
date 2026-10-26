import { test, expect, chromium } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

// Test 3D jetable : petite fenêtre, car le rendu logiciel du navigateur de test est lent. Les mesures de ces tests ne sont pas des mesures de performance.
const SIZE = { width: 667, height: 375 };
const URL = (extra = '') => `/test3d/index.html?test=1${extra}`;
const BROWSER_NOISE = /GL Driver Message/;
const WEBGL_MESSAGE = 'WebGL indisponible dans cet environnement : test désactivé (voir le bilan du lot 0t).';

const state = (page) => page.evaluate(() => window.__t3d.getState());
// Ouvre la page ; se désactive proprement si WebGL manque.
async function open(page, extra = '') {
  await page.setViewportSize(SIZE);
  await page.goto(URL(extra));
  await page.waitForFunction(() => window.__t3d !== undefined);
  const webgl = await page.evaluate(() => window.__t3d.getState().webgl);
  test.skip(!webgl, WEBGL_MESSAGE);
  await page.waitForFunction(() => window.__t3d.getState().time > 0.05);
}
const openPanel = async (page) => {
  if (await page.locator('#t3d-panel').isHidden()) await page.click('#t3d-toggle');
  await expect(page.locator('#t3d-panel')).toBeVisible();
};
const once = (testInfo) => testInfo.project.name === 'mobile';

test.describe('page Three.js', () => {
  test.skip(({ isMobile }) => isMobile, 'mesures de bureau (667×375)');

  test('se charge sans erreur de console ni requête externe', async ({ page, baseURL }) => {
    const external = [];
    const problems = [];
    page.on('request', (r) => {
      if (!r.url().startsWith(baseURL) && !r.url().startsWith('data:') && !r.url().startsWith('blob:')) external.push(r.url());
    });
    page.on('console', (m) => ['error', 'warning'].includes(m.type()) && !BROWSER_NOISE.test(m.text()) && problems.push(m.text()));
    page.on('pageerror', (e) => problems.push(e.message));
    page.on('requestfailed', (r) => problems.push(`échec ${r.url()}`));
    page.on('response', (r) => r.status() >= 400 && problems.push(`${r.status()} ${r.url()}`));
    await open(page);
    await page.waitForLoadState('networkidle');
    await openPanel(page);
    await page.click('#t3d-shadows');
    await page.click('[data-cam="dessus"]');
    await page.waitForTimeout(500);
    expect(external).toEqual([]);
    expect(problems).toEqual([]);
  });

  test('le canvas couvre la fenêtre, avant et après redimensionnement', async ({ page }) => {
    await open(page);
    const box = () => page.evaluate(() => {
      const r = document.querySelector('#t3d-view canvas').getBoundingClientRect();
      return [r.x, r.y, Math.round(r.width), Math.round(r.height), innerWidth, innerHeight];
    });
    await expect.poll(box).toEqual([0, 0, 667, 375, 667, 375]);
    await page.setViewportSize({ width: 800, height: 450 });
    await expect.poll(box).toEqual([0, 0, 800, 450, 800, 450]);
  });

  test('le banc d\'essai rapide produit un rapport de 6 configurations, toutes valeurs finies', async ({ page }) => {
    test.setTimeout(180_000);
    await open(page, '&bench=quick');
    await openPanel(page);
    await page.click('#t3d-bench');
    await expect.poll(async () => (await state(page)).bench.status, { timeout: 150_000 }).toBe('done');
    const text = await page.locator('#t3d-report').inputValue();
    expect(text).toContain('Three.js : 0.186.1');
    expect(text).toMatch(/Date du test : \d{4}-\d{2}-\d{2}T/);
    expect(text).toContain('Navigateur : ');
    expect(text).toContain('Moteur de rendu : ');
    expect(text).toContain('rapide');
    for (let i = 1; i <= 6; i += 1) expect(text).toContain(`Configuration ${i}/6`);
    expect(text).not.toMatch(/NaN|Infinity|undefined|null/);
    const numbers = [
      ...text.matchAll(/seconde \(moyenne\) : (-?[\d.]+)/g), ...text.matchAll(/médian (-?[\d.]+) ms/g), ...text.matchAll(/95e centile (-?[\d.]+) ms/g),
      ...text.matchAll(/1 % bas : (-?[\d.]+)/g), ...text.matchAll(/plus de 50 ms : (-?\d+)/g), ...text.matchAll(/Appels de dessin \(moyenne\) : (-?\d+)/g), ...text.matchAll(/triangles \(moyenne\) : (-?\d+)/g),
    ].map((m) => Number(m[1]));
    expect(numbers).toHaveLength(6 * 7);
    for (const n of numbers) expect(Number.isFinite(n)).toBe(true);
    await expect(page.locator('#t3d-status')).toContainText('Banc d’essai terminé');
  });

  test('le bouton de copie affiche le rapport même si le presse-papiers est refusé', async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'clipboard', { value: { writeText: () => Promise.reject(new DOMException('refusé', 'NotAllowedError')) }, configurable: true });
    });
    await open(page);
    await openPanel(page);
    await page.click('#t3d-copy');
    await expect(page.locator('#t3d-status')).toContainText('Copie refusée');
    const text = await page.locator('#t3d-report').inputValue();
    expect(text).toContain('Z-Survival — Test 3D jetable');
    expect(text).toContain('Three.js : 0.186.1');
    const selected = await page.evaluate(() => {
      const el = document.getElementById('t3d-report');
      return el.selectionEnd - el.selectionStart === el.value.length && document.activeElement === el;
    });
    expect(selected).toBe(true);
  });

  test('la copie réussie le dit', async ({ page }) => {
    await page.addInitScript(() => {
      window.__copied = null;
      Object.defineProperty(navigator, 'clipboard', { value: { writeText: (t) => { window.__copied = t; return Promise.resolve(); } }, configurable: true });
    });
    await open(page);
    await openPanel(page);
    await page.click('#t3d-copy');
    await expect(page.locator('#t3d-status')).toHaveText('Rapport copié.');
    expect(await page.evaluate(() => window.__copied)).toContain('Z-Survival — Test 3D jetable');
  });

  test('les boutons de réglage changent l\'angle de caméra, les ombres et le nombre de zombies', async ({ page }) => {
    await open(page);
    await openPanel(page);
    for (const [name, angle] of [['dessus', 90], ['60', 60], ['75', 75]]) {
      await page.click(`[data-cam="${name}"]`);
      await expect.poll(async () => (await state(page)).camera.angle).toBe(angle);
      await expect(page.locator(`[data-cam="${name}"]`)).toHaveAttribute('aria-pressed', 'true');
    }
    expect((await state(page)).shadows).toBe(true);
    await page.click('#t3d-shadows');
    await expect.poll(async () => (await state(page)).shadows).toBe(false);
    expect((await state(page)).shadowsActive).toBe(false);
    await expect(page.locator('#t3d-shadows')).toHaveText('Ombres : non');
    await page.click('#t3d-shadows');
    await expect.poll(async () => (await state(page)).shadowsActive).toBe(true);
    for (const n of [20, 8, 5]) {
      await page.click(`[data-zombies="${n}"]`);
      await expect.poll(async () => (await state(page)).zombies).toBe(n);
    }
    await page.click('#t3d-autoplay');
    await expect.poll(async () => (await state(page)).autoplay).toBe(true);
  });

  test('la résolution maximale plafonne le ratio de pixels (écran à ratio 3)', async ({ browser, baseURL }) => {
    const context = await browser.newContext({ viewport: SIZE, deviceScaleFactor: 3, locale: 'fr-FR' });
    const page = await context.newPage();
    await page.goto(baseURL + URL());
    await page.waitForFunction(() => window.__t3d !== undefined);
    test.skip(!(await page.evaluate(() => window.__t3d.getState().webgl)), WEBGL_MESSAGE);
    await page.waitForFunction(() => window.__t3d.getState().time > 0.05);
    await openPanel(page);
    for (const cap of [1, 1.5, 2]) {
      await page.click(`[data-res="${cap}"]`);
      await expect.poll(async () => (await state(page)).pixelRatio).toBe(cap);
      await expect.poll(async () => (await state(page)).canvas.width).toBe(Math.floor(SIZE.width * cap));
      expect((await state(page)).maxPixelRatio).toBe(cap);
    }
    await context.close();
  });

  test('W, A, S, D déplacent le joueur (touches physiques)', async ({ page }) => {
    await open(page, '&nospawn=1');
    const start = await state(page);
    await page.keyboard.down('KeyD');
    await expect.poll(async () => (await state(page)).player.x - start.player.x).toBeGreaterThan(10);
    await page.keyboard.up('KeyD');
    const right = await state(page);
    await page.keyboard.down('KeyS');
    await expect.poll(async () => (await state(page)).player.y - right.player.y).toBeGreaterThan(10);
    await page.keyboard.up('KeyS');
    const down = await state(page);
    await page.keyboard.down('KeyA');
    await expect.poll(async () => down.player.x - (await state(page)).player.x).toBeGreaterThan(10);
    await page.keyboard.up('KeyA');
    const left = await state(page);
    await page.keyboard.down('KeyW');
    await expect.poll(async () => left.player.y - (await state(page)).player.y).toBeGreaterThan(10);
    await page.keyboard.up('KeyW');
  });

  test('axe : aucune violation (panneau fermé puis ouvert)', async ({ page }) => {
    await open(page);
    if (await page.locator('#t3d-panel').isVisible()) await page.click('#t3d-toggle');
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await openPanel(page);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  });

  test('les cibles tactiles du panneau font au moins 44 px', async ({ page }) => {
    await open(page);
    await openPanel(page);
    const small = await page.evaluate(() => [...document.querySelectorAll('#t3d-panel button, #t3d-panel a, #t3d-toggle')]
      .map((el) => el.getBoundingClientRect())
      .filter((r) => r.width < 44 || r.height < 44).length);
    expect(small).toBe(0);
  });
});

test('deux doigts : un stick pour bouger, un stick pour viser (événements tactiles CDP)', async ({ browser, baseURL }, testInfo) => {
  test.skip(!once(testInfo), 'une seule fois');
  const context = await browser.newContext({ viewport: SIZE, hasTouch: true, isMobile: true, locale: 'fr-FR' });
  const page = await context.newPage();
  await page.goto(baseURL + URL('&nospawn=1'));
  await page.waitForFunction(() => window.__t3d !== undefined);
  test.skip(!(await page.evaluate(() => window.__t3d.getState().webgl)), WEBGL_MESSAGE);
  await page.waitForFunction(() => window.__t3d.getState().time > 0.05);
  const cdp = await context.newCDPSession(page);
  const touch = (type, points) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points.map(([x, y, id]) => ({ x, y, id })) });
  const start = await state(page);
  await touch('touchStart', [[150, 250, 1]]);
  await touch('touchStart', [[150, 250, 1], [500, 250, 2]]);
  await touch('touchMove', [[200, 250, 1], [500, 250, 2]]);
  await touch('touchMove', [[200, 250, 1], [540, 210, 2]]);
  await expect(page.locator('#stick-left .stick-base')).toBeVisible();
  await expect(page.locator('#stick-right .stick-base')).toBeVisible();
  await expect.poll(async () => (await state(page)).player.x - start.player.x, { timeout: 30_000 }).toBeGreaterThan(10);
  await expect.poll(async () => (await state(page)).aim).toBeCloseTo(-Math.PI / 4, 1);
  await touch('touchEnd', []);
  const stopped = await state(page);
  await page.waitForTimeout(500);
  const later = await state(page);
  expect(later.aim).toBeCloseTo(stopped.aim, 5);
  expect(later.player.x).toBeCloseTo(stopped.player.x, 0);
  await context.close();
});

test('sans JavaScript, seul le message noscript est visible', async ({ baseURL }, testInfo) => {
  test.skip(!once(testInfo), 'une seule fois');
  const browser = await chromium.launch({ channel: process.env.CI ? 'chrome' : undefined, args: ['--blink-settings=scriptEnabled=false'] });
  const page = await browser.newPage({ locale: 'fr-FR' });
  await page.goto(`${baseURL}/test3d/index.html`);
  await expect(page.locator('#t3d-root')).toBeHidden();
  await expect(page.locator('#t3d-panel')).toBeHidden();
  const text = (await page.evaluate(() => document.body.innerText)).trim();
  expect(text).toBe('Cette page a besoin de JavaScript. / This page needs JavaScript.');
  await browser.close();
});
