import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

// Lot 3j-B : page atelier-personnages.html (667 × 375 par défaut, hooks de ?test=1). Si WebGL manque, la page affiche un message et
// les tests de rendu se désactivent proprement. Lancer : E2E_FULL=1 npx playwright test tests/e2e/persos-atelier.spec.js
const SIZE = { width: 667, height: 375 };
const URL = '/atelier-personnages.html?test=1';
const S = (page) => page.evaluate(() => window.__zsPersos.getState());
const set = (page, id, value) => page.evaluate(([i, v]) => window.__zsPersos.set(i, v), [id, value]);

async function open(page, size = SIZE, url = URL) {
  await page.setViewportSize(size);
  await page.goto(url);
  await page.waitForFunction(() => window.__zsPersos?.getState().ready, null, { timeout: 90_000 });
  return S(page);
}

test.describe('atelier des personnages', () => {
  test.skip(({ isMobile }) => isMobile, 'bureau (la fenêtre est réglée par chaque test)');

  test('se charge sans erreur, sans requête externe ni avertissement de console (hors pilote GL)', async ({ page, baseURL }) => {
    const errors = [];
    const external = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => (m.type() === 'error' || (m.type() === 'warning' && !/GL Driver|GPU stall|ReadPixels/.test(m.text()))) && errors.push(m.text()));
    page.on('request', (r) => !r.url().startsWith(baseURL) && !r.url().startsWith('data:') && external.push(r.url()));
    await open(page);
    await page.evaluate(() => window.__zsPersos.step(0.5));
    expect(errors).toEqual([]);
    expect(external).toEqual([]);
    await expect(page.locator('#status')).toHaveText('Prêt.');
  });

  test('rien dans localStorage, sessionStorage ni les cookies', async ({ page, context }) => {
    await open(page);
    await set(page, 'ctl-variante', 'B');
    await page.click('#btn-pick');
    expect(await page.evaluate(() => [localStorage.length, sessionStorage.length])).toEqual([0, 0]);
    expect(await context.cookies()).toEqual([]);
  });

  test('axe : aucune violation', async ({ page }) => {
    await open(page);
    const r = await new AxeBuilder({ page }).analyze();
    expect(r.violations.map((v) => `${v.id} : ${v.nodes.length}`)).toEqual([]);
  });

  test('cibles tactiles d\'au moins 44 px (boutons, listes, curseurs, liens)', async ({ page }) => {
    await open(page);
    const small = await page.evaluate(() => [...document.querySelectorAll('button, select, input[type=range], .persos-link')].filter((e) => {
      const r = e.getBoundingClientRect();
      return r.height < 44 || r.width < 44;
    }).map((e) => e.id || e.className));
    expect(small).toEqual([]);
  });

  for (const width of [360, 768, 1440]) {
    test(`CLS au plus 0,1 à ${width} px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 });
      await page.addInitScript(() => {
        window.__cls = 0;
        new PerformanceObserver((list) => { for (const e of list.getEntries()) if (!e.hadRecentInput) window.__cls += e.value; }).observe({ type: 'layout-shift', buffered: true });
      });
      await page.goto(URL);
      await page.waitForFunction(() => window.__zsPersos?.getState().ready, null, { timeout: 90_000 });
      expect(await page.evaluate(() => window.__cls)).toBeLessThanOrEqual(0.1);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    });
  }
});
