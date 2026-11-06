import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import AxeBuilder from '@axe-core/playwright';

// Lot 3h-B : page d'écoute atelier-sons.html. Le journal window.__zsSons (?test=1) remplace l'écoute : aucun test n'attend la durée
// réelle d'un son. Taille de référence 667×375.
const atelier = JSON.parse(readFileSync('data/game/sounds-atelier.json', 'utf8'));
const P1 = atelier.slots.filter((s) => s.priority === 1);
const SIZE = { width: 667, height: 375 };
const BROWSER_NOISE = /GL Driver Message/;
const logOf = (page) => page.evaluate(() => window.__zsSons.log());
const stateOf = (page) => page.evaluate(() => window.__zsSons.state());

async function open(page, query = '?test=1', size = SIZE) {
  await page.setViewportSize(size);
  await page.goto(`/atelier-sons.html${query}`);
  await expect(page.locator('body')).toHaveAttribute('data-ready', '1', { timeout: 60_000 });
}
const slotCard = (page, id) => page.locator(`.slot[data-slot="${id}"]`);
async function unlock(page) {
  await page.getByRole('button', { name: 'Activer le son' }).click();
  await expect.poll(async () => (await stateOf(page)).unlocked).toBe(true);
}
async function playVariant(page, slot, variant) {
  const before = (await logOf(page)).length;
  await slotCard(page, slot).locator(`button[data-variant="${variant}"]`).click();
  await expect.poll(async () => (await logOf(page)).length, { timeout: 30_000 }).toBe(before + 1);
  return (await logOf(page)).at(-1);
}

test('se charge sans erreur ni requête externe, noindex, console propre, rien d\'enregistré', async ({ page, baseURL }) => {
  const external = [];
  const problems = [];
  page.on('request', (r) => !r.url().startsWith(baseURL) && !r.url().startsWith('data:') && !r.url().startsWith('blob:') && external.push(r.url()));
  page.on('console', (m) => ['error', 'warning'].includes(m.type()) && !BROWSER_NOISE.test(m.text()) && problems.push(m.text()));
  page.on('pageerror', (e) => problems.push(e.message));
  page.on('response', (r) => r.status() >= 400 && problems.push(`${r.status()} ${r.url()}`));
  await open(page);
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex');
  await expect(page.locator('html')).toHaveAttribute('lang', 'fr');
  await expect(page.locator('#status')).toContainText('emplacements');
  await unlock(page);
  await playVariant(page, 'pas-joueur-dur', 'A');
  await page.waitForLoadState('networkidle');
  expect(external).toEqual([]);
  expect(problems).toEqual([]);
  expect(await page.evaluate(() => [localStorage.length, sessionStorage.length, document.cookie])).toEqual([0, 0, '']);
});

for (const size of [SIZE, { width: 1440, height: 900 }]) {
  test(`axe : aucune violation ; cibles d'au moins 44 px (${size.width}×${size.height})`, async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'bureau', 'une seule fois par taille');
    await open(page, '?test=1', size);
    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations).toEqual([]);
    const targets = page.locator('button, input[type="range"], .slot-fav label, .atelier-nav-list a, .atelier-link');
    const boxes = await Promise.all((await targets.all()).map((b) => b.boundingBox()));
    expect(boxes.length).toBeGreaterThan(P1.length * 10);
    for (const box of boxes) {
      expect(box.height).toBeGreaterThanOrEqual(43.5);
      expect(box.width).toBeGreaterThanOrEqual(43.5);
    }
  });
}

for (const width of [360, 768, 1440]) {
  test(`CLS au plus 0,1 avec les données retardées de 400 ms (${width} px)`, async ({ browser, baseURL }, testInfo) => {
    test.skip(testInfo.project.name !== 'bureau', 'une seule fois');
    const context = await browser.newContext({ viewport: { width, height: width === 360 ? 640 : 800 } });
    const page = await context.newPage();
    await page.route('**/data/**', async (route) => {
      await new Promise((r) => setTimeout(r, 400));
      await route.continue();
    });
    await page.addInitScript(() => {
      window.__cls = 0;
      new PerformanceObserver((list) => {
        for (const e of list.getEntries()) if (!e.hadRecentInput) window.__cls += e.value;
      }).observe({ type: 'layout-shift', buffered: true });
    });
    await page.goto(`${baseURL}/atelier-sons.html?test=1`);
    await expect(page.locator('body')).toHaveAttribute('data-ready', '1', { timeout: 60_000 });
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const cls = await page.evaluate(() => window.__cls);
    testInfo.annotations.push({ type: 'cls', description: `${width} px : ${cls.toFixed(4)}` });
    expect(cls).toBeLessThanOrEqual(0.1);
    await context.close();
  });
}

// Lot 5a-B : l'impact sur la chair (emplacement impact-chair) dans la page, avec ses mesures. Lot 5e : « Actuel » (l'ancien impact, pack d'avant) est
// retiré avec ce pack : ses 3 assertions (lecture, « cling » mesuré, message) partent avec lui.
test('impact-chair : trois variantes dans la cible, sans partiel résonant au-dessus de 2 kHz', async ({ page }) => {
  await open(page);
  await unlock(page);
  await expect(slotCard(page, 'impact-chair').locator('button[data-variant]')).toHaveCount(3);
  for (const v of ['A', 'B', 'C']) {
    const e = await playVariant(page, 'impact-chair', v);
    expect(e.measures.ringMs, v).toBeLessThanOrEqual(30);
    expect(e.measures.duration, v).toBeLessThanOrEqual(0.22);
  }
});
