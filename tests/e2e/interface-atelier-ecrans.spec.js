// Lot 3k-C : écrans hors partie (E1 menu, E3 boutique, E5 réglages, classement), propositions de priorité 2, « Côte à côte ».
// Hors de la suite rapide jusqu'au lot 4b : `E2E_FULL=1 npx playwright test tests/e2e/interface-atelier-ecrans.spec.js`.
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const BROWSER_NOISE = /GL Driver Message|ReadPixels|GPU stall/;
const PAGE = '/atelier-interface.html?test=1';
const SCREENS = ['menu', 'boutique', 'reglages', 'classement'];
const DIRECTIONS = ['A', 'B', 'C'];

test.skip(({ isMobile }) => isMobile, 'page technique mesurée en bureau');

async function open(page, { fond = 'sol', viewport = { width: 1440, height: 900 } } = {}) {
  await page.setViewportSize(viewport);
  await page.goto(`${PAGE}${fond === 'sol' ? '&fond=sol' : ''}`);
  await page.waitForFunction(() => window.__zsUi);
  await page.evaluate(() => window.__zsUi.ready);
}
const set = (page, partial) => page.evaluate((p) => window.__zsUi.set(p), partial);
const measure = (page) => page.evaluate(() => window.__zsUi.measure());

test.describe('priorité 2, côte à côte, choix', () => {
  test('les 5 propositions × 2 variantes sur le HUD : aucun écart à 667×375 et 1440×900, pour A, B, C', async ({ page }) => {
    await open(page);
    const ids = (await page.evaluate(() => window.__zsUi.config().priority2)).flatMap((p) => p.variants.map((v) => `${p.id}:${v}`));
    expect(ids.length).toBeLessThanOrEqual(10);
    const failures = [];
    for (const size of ['667x375', '1440x900']) {
      for (const direction of DIRECTIONS) {
        for (const p2 of ids) {
          await set(page, { size, direction, screen: 'hud', stateId: 'pire-cas', p2 });
          const r = await measure(page);
          if (r.verdict.outOfTarget.length) failures.push({ size, direction, p2, out: r.verdict.outOfTarget });
        }
      }
    }
    expect(failures).toEqual([]);
  });

  test('prefers-reduced-motion : aucune impulsion (retour de dégâts B, vie faible B)', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await open(page);
    for (const p2 of ['retour-degats:B', 'vie-faible:B']) {
      await set(page, { size: '667x375', direction: 'A', screen: 'hud', stateId: 'combat', p2 });
      expect((await measure(page)).measure.animations.filter((a) => a.running)).toEqual([]);
    }
  });

  test('« Côte à côte » : Actuel, A, B, C à la même taille et dans le même état, tableau des mesures en texte avec « hors cible » en toutes lettres @instable', async ({ page }) => {
    await open(page);
    await set(page, { size: '844x390', screen: 'hud', stateId: 'combat', direction: 'A' });
    await page.click('#btn-compare');
    await expect(page.locator('#btn-compare')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('#compare figure')).toHaveCount(4);
    // Lot 4f-A : le tableau n'est rempli qu'après le chargement des quatre vues (quatre jeux dans des iframes, en même temps) :
    // plus de 5 s (délai par défaut d'expect) dès que deux workers tournent ; 45 s, sous le délai du test (60 s).
    await expect(page.locator('#compare-rows tr')).toHaveCount(4, { timeout: 45000 });
    const rows = await page.evaluate(() => window.__zsUi.compare());
    expect(rows.map((r) => r.direction)).toEqual(['actuel', 'A', 'B', 'C']);
    const actual = rows[0];
    test.skip(!actual.available, 'WebGL indisponible : « Actuel » non mesurable');
    // Lot 3l : « Actuel » est l'interface intégrée ; à la demande du propriétaire, elle reste à 16 px des bords sans la zone de sécurité : l'îlot simulé (47 px) la
    // couvre, ce que l'atelier signale (« zone-sure ») comme pour l'interface du lot 4.
    expect(actual.verdict.outOfTarget.some((o) => o.rule === 'zone-sure')).toBe(true);
    for (const r of rows.slice(1)) expect(r.verdict.outOfTarget).toEqual([]);
    const sizes = await page.evaluate(() => [...document.querySelectorAll('#compare .ui3k-stage')].map((s) => `${s.style.width}×${s.style.height}`));
    expect(new Set(sizes)).toEqual(new Set(['844px×390px']));
  });

  test('« Mes choix » : priorité 2 retenue au format priorite2=id:variante ; aucun stockage ; console propre', async ({ page, context }) => {
    const problems = [];
    page.on('console', (m) => ['error', 'warning'].includes(m.type()) && !BROWSER_NOISE.test(m.text()) && problems.push(m.text()));
    page.on('pageerror', (e) => problems.push(String(e)));
    await open(page);
    await set(page, { direction: 'C', screen: 'boutique' });
    await page.click('#btn-keep');
    await set(page, { screen: 'hud', p2: 'retour-degats:B' });
    await page.click('#btn-keep-p2');
    await expect(page.locator('#choices')).toHaveValue('ecran=boutique;direction=C;argent=haut-gauche;texte=M;densite=aeree;fond=plein;contour=aucun\npriorite2=retour-degats:B');
    expect(await page.evaluate(() => [localStorage.length, sessionStorage.length, document.cookie])).toEqual([0, 0, '']);
    expect(await context.cookies()).toEqual([]);
    expect(problems).toEqual([]);
  });

  for (const screen of SCREENS) {
    test(`axe : aucune violation sur ${screen} (667×375, direction B)`, async ({ page }) => {
      await open(page, { viewport: { width: 667, height: 375 } });
      await set(page, { size: '667x375', direction: 'B', screen });
      const results = await new AxeBuilder({ page }).exclude('#frame').analyze();
      expect(results.violations.map((v) => `${v.id} : ${v.nodes.map((n) => n.target.join(' ')).slice(0, 3).join(' | ')}`)).toEqual([]);
    });
  }
});
