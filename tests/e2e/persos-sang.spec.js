import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

// Lot 3j-C : sections « Sang » et « Mini-arène » de atelier-personnages.html (667 × 375, hooks de ?test=1, temps simulé).
// Lancer : E2E_FULL=1 npx playwright test tests/e2e/persos-sang.spec.js
const SIZE = { width: 667, height: 375 };
const S = (page) => page.evaluate(() => window.__zsPersos.getState());
const set = (page, id, value) => page.evaluate(([i, v]) => window.__zsPersos.set(i, v), [id, value]);

async function open(page) {
  await page.setViewportSize(SIZE);
  await page.goto('/atelier-personnages.html?test=1');
  await page.waitForFunction(() => window.__zsPersos?.getState().ready, null, { timeout: 90_000 });
  if (!(await S(page)).webgl) test.skip(true, 'WebGL indisponible dans cet environnement : test de rendu désactivé');
}
// 60 s simulées : un tir non mortel toutes les 0,5 s, un tir mortel toutes les 4 s ; renvoie les maxima observés.
const sixtySeconds = (page) => page.evaluate(() => {
  const zs = window.__zsPersos;
  const max = { particles: 0, decals: 0, corpses: 0, calls: 0, triangles: 0 };
  for (let i = 0; i < 120; i += 1) {
    if (i % 8 === 0) document.getElementById('btn-kill').click();
    else document.getElementById('btn-hit').click();
    zs.step(0.5);
    const b = zs.blood();
    for (const k of Object.keys(max)) max[k] = Math.max(max[k], b[k]);
  }
  return max;
});

test.describe('sang et mini-arène', () => {
  test.skip(({ isMobile }) => isMobile, 'bureau (la fenêtre est réglée par chaque test)');

  for (const [level, maxP, maxD] of [['reduit', 96, 12], ['1', 256, 48]]) {
    test(`niveau ${level} : 60 s de tirs, compteurs dans leurs plafonds, sang ≤ 3 appels et ≤ 1 200 triangles`, async ({ page }) => {
      await open(page);
      await set(page, 'ctl-sang', level);
      const max = await sixtySeconds(page);
      expect(max.particles).toBeLessThanOrEqual(maxP);
      expect(max.decals).toBeLessThanOrEqual(maxD);
      expect(max.decals).toBeGreaterThan(0);
      expect(max.corpses).toBeLessThanOrEqual(6);
      expect(max.calls).toBeLessThanOrEqual(3);
      expect(max.triangles).toBeLessThanOrEqual(1200);
    });
  }

  test('budget mesuré par renderer.info : le sang ajoute au plus 3 appels à la vue', async ({ page }) => {
    await open(page);
    await set(page, 'ctl-vue', 'dessus');
    const before = (await S(page)).render.main.calls;
    await set(page, 'ctl-sang', '1');
    await page.click('#btn-hit');
    await page.click('#btn-hit');
    await page.evaluate(() => window.__zsPersos.step(0.1));
    const after = (await S(page)).render.main.calls;
    expect((await S(page)).blood.calls).toBe(2);
    expect(after - before).toBeLessThanOrEqual(3);
    expect(after - before).toBeGreaterThan(0);
  });

  test('axe : aucune violation avec le sang et l\'arène en marche', async ({ page }) => {
    await open(page);
    await set(page, 'ctl-sang', '1');
    await page.click('#btn-hit');
    await page.evaluate(() => window.__zsPersos.arena.run(2));
    await page.mouse.move(1, 1); // l'état survolé des boutons (.button:hover de base.css, commun au site) n'est pas l'objet de ce test
    const r = await new AxeBuilder({ page }).analyze();
    expect(r.violations.map((v) => `${v.id} : ${v.nodes.length}`)).toEqual([]);
  });
});
