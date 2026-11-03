// Lot 3k-B : atelier de l'interface (atelier-interface.html) : directions A, B, C, « Actuel », planche, mesures, « Mes choix ».
// Hors de la suite rapide (npm run test:e2e) jusqu'au lot 4b : `npx playwright test tests/e2e/interface-atelier.spec.js` ou `npm run test:e2e:full`.
// Les mesures passent par window.__zsUi (?test=1) ; ?fond=sol remplace le vrai jeu par le sol généré (rendu logiciel lent), sauf dans les tests du cadre.
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const BROWSER_NOISE = /GL Driver Message|ReadPixels|GPU stall/;
const PAGE = '/atelier-interface.html?test=1';

test.skip(({ isMobile }) => isMobile, 'page technique mesurée en bureau');

async function open(page, { fond = 'sol', viewport = { width: 1440, height: 900 } } = {}) {
  await page.setViewportSize(viewport);
  await page.goto(`${PAGE}${fond === 'sol' ? '&fond=sol' : ''}`);
  await page.waitForFunction(() => window.__zsUi);
  await page.evaluate(() => window.__zsUi.ready);
}
const set = (page, partial) => page.evaluate((p) => window.__zsUi.set(p), partial);
const measure = (page) => page.evaluate(() => window.__zsUi.measure());

test.describe('chargement et hygiène', () => {
  test('se charge sans erreur ni requête externe ; noindex, lang="fr", textes en français', async ({ page, baseURL }) => {
    const problems = [];
    const external = [];
    page.on('console', (m) => ['error', 'warning'].includes(m.type()) && !BROWSER_NOISE.test(m.text()) && problems.push(m.text()));
    page.on('pageerror', (e) => problems.push(String(e)));
    page.on('request', (r) => !r.url().startsWith(baseURL) && !r.url().startsWith('data:') && external.push(r.url()));
    await open(page, { fond: 'jeu' });
    await expect(page.locator('#app')).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('lang', 'fr');
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex');
    await expect(page.locator('h1')).toHaveText("Atelier de l'interface");
    await expect.poll(() => page.evaluate(() => window.__zsUi.getState().frame.status), { timeout: 60_000 }).toMatch(/ready|error/);
    expect(problems).toEqual([]);
    expect(external).toEqual([]);
  });

});

test.describe('page : accessibilité, cibles, CLS, simulateurs, Mes choix', () => {
  for (const viewport of [{ width: 667, height: 375 }, { width: 1440, height: 900 }]) {
    test(`axe : aucune violation (${viewport.width}×${viewport.height})`, async ({ page }) => {
      await open(page, { viewport });
      const results = await new AxeBuilder({ page }).exclude('#frame').analyze();
      expect(results.violations.map((v) => `${v.id} : ${v.nodes.length}`)).toEqual([]);
    });
  }

  test('cibles de la page d\'au moins 44 px (boutons, listes, champs)', async ({ page }) => {
    await open(page, { viewport: { width: 667, height: 375 } });
    const small = await page.evaluate(() => [...document.querySelectorAll('#app button, #app select, #app input[type="number"], #app input[type="range"]')]
      .filter((el) => !el.closest('#overlay')).map((el) => ({ id: el.id || el.textContent, h: el.getBoundingClientRect().height })).filter((x) => x.h < 43.5));
    expect(small).toEqual([]);
  });

  for (const width of [360, 768, 1440]) {
    test(`CLS ≤ 0,1 à ${width} px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 });
      await page.addInitScript(() => {
        window.__cls = 0;
        new PerformanceObserver((l) => {
          for (const e of l.getEntries()) if (!e.hadRecentInput) window.__cls += e.value;
        }).observe({ type: 'layout-shift', buffered: true });
      });
      await page.goto(`${PAGE}&fond=sol`);
      await page.waitForFunction(() => window.__zsUi);
      await page.evaluate(() => window.__zsUi.ready);
      await page.waitForTimeout(500);
      expect(await page.evaluate(() => window.__cls)).toBeLessThanOrEqual(0.1);
    });
  }

  test('simulateurs : daltonisme appliqué au cadre d\'aperçu seulement ; zone de sécurité simulée et dimensions réelles affichées', async ({ page }) => {
    await open(page);
    await set(page, { size: '844x390', direction: 'C', screen: 'hud', stateId: 'combat', cvd: 'deuteranopie', guide: true });
    await expect(page.locator('#viewport')).toHaveAttribute('data-cvd', 'deuteranopie');
    await expect(page.locator('#viewport')).toHaveCSS('filter', /url/);
    await expect(page.locator('#overlay')).toHaveCSS('filter', 'none');
    await expect(page.locator('#app')).toHaveCSS('filter', 'none');
    await expect(page.locator('#dims')).toContainText('844 × 390');
    await expect(page.locator('#dims')).toContainText('0, 47, 21, 47');
    await expect(page.locator('#guide')).toBeVisible();
    const r = await measure(page);
    expect(r.verdict.outOfTarget).toEqual([]);
    const life = r.measure.elements.find((e) => e.name === 'vie').box;
    expect(life.left).toBeGreaterThanOrEqual(47 + 16 - 0.5);
  });

  test('Mes choix : une ligne par écran au format demandé, copiable (presse-papiers ou sélection), rien n\'est enregistré', async ({ page }) => {
    await open(page);
    await set(page, { direction: 'B', screen: 'hud', stateId: 'combat' });
    await page.click('#btn-keep');
    await set(page, { direction: 'A', screen: 'pause' });
    await page.click('#btn-keep');
    await expect(page.locator('#choices')).toHaveValue('ecran=hud;direction=B;argent=sous-vague;texte=M;densite=compacte;fond=leger;contour=aucun\necran=pause;direction=A;argent=haut-droite;texte=M;densite=compacte;fond=transparent;contour=fin');
    await page.click('#btn-copy');
    await expect(page.locator('#choices-status')).not.toHaveText('');
    const parsed = await page.evaluate(() => window.__zsUi.parseChoices(window.__zsUi.choicesText()));
    expect(parsed.warnings).toEqual([]);
    expect(parsed.choices.screens.hud.direction).toBe('B');
    await page.reload();
    await page.waitForFunction(() => window.__zsUi);
    await expect(page.locator('#choices')).toHaveValue('');
  });
});
