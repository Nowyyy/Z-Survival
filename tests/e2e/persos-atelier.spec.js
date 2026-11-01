import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { characterStats } from '../../js/core/character-parts.js';
import { resolve, skeletons, slotOf } from '../../scripts/personnages/lib.mjs';

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
const needWebgl = async (page) => {
  if (!(await S(page)).webgl) test.skip(true, 'WebGL indisponible dans cet environnement : test de rendu désactivé');
};

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

  test('liste les 5 personnages et les variantes Actuel, A, B, C (et riche)', async ({ page }) => {
    await open(page);
    await expect(page.locator('#ctl-perso option')).toHaveText(['Joueur', 'Marcheur', 'Petit', 'Voûté', 'Grand']);
    await expect(page.locator('#ctl-variante option')).toHaveText(['Actuel', 'A', 'B', 'C', 'Riche (hors budget)']);
  });

  for (const [slot, variant] of [['marcheur', 'A'], ['joueur', 'B'], ['grand', 'C'], ['petit', 'riche']]) {
    test(`mesures affichées = characterStats (${slot} ${variant})`, async ({ page }) => {
      await open(page);
      await set(page, 'ctl-perso', slot);
      await set(page, 'ctl-variante', variant);
      const s = await S(page);
      const st = characterStats(resolve(slotOf(slot).variants.find((v) => v.id === variant)), { skeletons });
      expect(s.measures.triangles).toBe(st.triangles);
      expect(s.measures.pieces).toBe(st.pieces);
      expect(s.measures.calls).toBe(st.calls + st.shadowCalls);
      await expect(page.locator('#measures')).toContainText(`Triangles : ${st.triangles}`);
    });
  }

  test('« Actuel » : pièces articulées du jeu (12 pièces, 680 triangles pour le joueur)', async ({ page }) => {
    await open(page);
    await set(page, 'ctl-perso', 'joueur');
    await set(page, 'ctl-variante', 'actuel');
    const s = await S(page);
    expect([s.measures.architecture, s.measures.pieces, s.measures.triangles]).toEqual(['articulated', 12, 680]);
    expect(s.main.v1).toBe(true);
  });

  test('changer animation, sol, vue, tenue et manche met à jour l\'état et les mesures', async ({ page }) => {
    await open(page);
    await needWebgl(page);
    await set(page, 'ctl-anim', 'rampe');
    await set(page, 'ctl-sol', 'escalier');
    await set(page, 'ctl-vue', 'dessus');
    await set(page, 'ctl-tenue', '3');
    await set(page, 'ctl-manche', '35');
    await page.evaluate(() => window.__zsPersos.step(0.4));
    const s = await S(page);
    expect([s.anim, s.sol, s.vue, s.tenue, s.manche, s.wear]).toEqual(['rampe', 'escalier', 'dessus', 3, 35, 3]);
    expect(s.main.anim).toBe('rampe');
    expect(s.main.outfit).toBe(3);
    expect(s.main.wear).toBe(3);
    await expect(page.locator('#measures')).toContainText('Contraste avec le sol choisi');
  });

  test('curseurs macro : la taille change la hauteur mesurée ; amplitude et lourdeur sans erreur', async ({ page }) => {
    await open(page);
    const before = await page.locator('#measures').textContent();
    await set(page, 'macro-taille', '2');
    await set(page, 'macro-lourdeur', '-2');
    await set(page, 'macro-amplitude', '2');
    const s = await S(page);
    expect([s.macros.taille, s.macros.lourdeur, s.macros.amplitude]).toEqual([2, -2, 2]);
    expect(await page.locator('#measures').textContent()).not.toBe(before);
    await expect(page.locator('#macros input[type=range]')).toHaveCount(8);
  });

  test('la variante change le personnage de la vue principale', async ({ page }) => {
    await open(page);
    await set(page, 'ctl-variante', 'B');
    expect((await S(page)).main.choice).toBe('B');
    await set(page, 'ctl-variante', 'C');
    expect((await S(page)).main.choice).toBe('C');
  });

  test('vue du jeu : caméra et échelle réelles du jeu (distance et unités par pixel de jeu.html à 667 × 375)', async ({ page }) => {
    await open(page);
    await needWebgl(page);
    const s = await S(page);
    expect(s.camera.distance).toBeCloseTo(s.camera.gameDistance, 6);
    expect(s.camera.tilt).toBe(75);
    expect(s.camera.unitsPerPixel).toBeCloseTo(s.camera.gameUnitsPerPixel, 6);
    await page.goto('/jeu.html?test=1&seed=1&nospawn=1');
    await page.waitForFunction(() => (window.__zs?.getState()?.time ?? 0) > 0.05 || document.getElementById('game-error')?.hidden === false, null, { timeout: 90_000 });
    if (await page.locator('#game-error').isVisible()) test.skip(true, 'WebGL indisponible');
    const game = await page.evaluate(() => window.__zs.getState().camera);
    expect(game.distance).toBeCloseTo(s.camera.gameDistance, 3);
    expect(game.tilt).toBe(75);
  });

  test('comparaison : Actuel, A, B, C à trois échelles (jeu, ×2, ×4) en synchronie', async ({ page }) => {
    await open(page);
    await needWebgl(page);
    const s = await S(page);
    expect(s.grid.columns).toEqual(['actuel', 'A', 'B', 'C']);
    expect(s.grid.scales).toEqual([1, 2, 4]);
    expect(s.grid.cells).toHaveLength(12);
    const upp = (k) => s.grid.cells.find((c) => c.scale === k).unitsPerPixel;
    expect(upp(1)).toBeCloseTo(s.camera.gameUnitsPerPixel, 6);
    expect(upp(2)).toBeCloseTo(upp(1) / 2, 6);
    expect(upp(4)).toBeCloseTo(upp(1) / 4, 6);
    expect(s.render.grid.calls).toBeGreaterThan(12);
  });

  test('« Mes choix » : une ligne par personnage choisi, au bon format, plus sang=', async ({ page }) => {
    await open(page);
    await set(page, 'ctl-variante', 'B');
    await set(page, 'macro-carrure', '-2');
    await page.click('#btn-pick');
    await set(page, 'ctl-perso', 'joueur');
    await set(page, 'ctl-variante', 'C');
    await page.click('#btn-pick');
    const text = await page.locator('#choices-text').inputValue();
    const lines = text.split('\n');
    expect(lines[0]).toMatch(/^perso=marcheur;variante=B;taille=0;carrure=-2;usure=0;teinte=0;posture=0;tenue=\+1;style=B;amplitude=0;rythme=0;lourdeur=0$/);
    expect(lines[1]).toMatch(/^perso=joueur;variante=C;/);
    expect(lines.at(-1)).toBe('sang=0');
  });

  test('rien dans localStorage, sessionStorage ni les cookies', async ({ page, context }) => {
    await open(page);
    await set(page, 'ctl-variante', 'B');
    await page.click('#btn-pick');
    expect(await page.evaluate(() => [localStorage.length, sessionStorage.length])).toEqual([0, 0]);
    expect(await context.cookies()).toEqual([]);
  });

  test('sans JavaScript : un message <noscript>', async ({ browser, baseURL }) => {
    const ctx = await browser.newContext({ javaScriptEnabled: false, baseURL });
    const page = await ctx.newPage();
    await page.goto('/atelier-personnages.html');
    await expect(page.locator('noscript')).toHaveCount(1);
    expect(await page.content()).toContain('Cette page a besoin de JavaScript.');
    await ctx.close();
  });

  test('sans ?test=1, aucun crochet n\'est exposé', async ({ page }) => {
    await page.setViewportSize(SIZE);
    await page.goto('/atelier-personnages.html');
    await expect(page.locator('#status')).toHaveText('Prêt.', { timeout: 90_000 });
    expect(await page.evaluate(() => typeof window.__zsPersos)).toBe('undefined');
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
