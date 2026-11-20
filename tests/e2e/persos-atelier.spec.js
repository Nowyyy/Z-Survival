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

  // Lot 9g (partie B) : section « Époque » (variantes d'époque à comparer avant « GO 9g »), même page.
  test('époque : se charge sans erreur, budgets ≤ +10 % et 3 appels, vues aux tailles du jeu, texte du fichier de choix', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await open(page);
    const E = (fn, a) => page.evaluate(fn, a);
    const st = await E(() => window.__zsPersos.epoque.getState());
    expect(st.ready).toBe(true);
    expect(st.budgets).toHaveLength(12);
    for (const row of st.budgets) for (const l of ['A', 'B', 'C']) {
      expect(row.variantes[l].ecart, `${row.perso} ${row.niveau} ${l}`).toBeLessThanOrEqual(10);
      expect(row.variantes[l].appels).toBe(3);
    }
    expect(st.groupes.jeu.map((g) => g.id)).toEqual(['riche', 'epoque-A', 'epoque-B', 'epoque-C']);
    expect(st.groupes.horde).toHaveLength(21);
    expect(new Set(st.groupes.horde.slice(0, 20).map((g) => g.slot))).toEqual(new Set(['marcheur', 'petit', 'voute', 'grand']));
    expect(new Set(st.groupes.horde.slice(0, 20).map((g) => `${g.slot}:${g.outfit}`)).size).toBeGreaterThanOrEqual(12);
    // Retour du propriétaire : horde du fichier de choix = zombies A et B mélangés (C gardé pour la carte 3).
    expect(new Set(st.groupes.horde.slice(0, 20).map((g) => g.id))).toEqual(new Set(['epoque-A', 'epoque-B']));
    expect(JSON.parse(st.texte).choix).toEqual(st.choix);
    await E(() => window.__zsPersos.epoque.set('ep-perso', 'personnage-2'));
    expect((await E(() => window.__zsPersos.epoque.getState())).groupes.jeu.map((g) => g.id)).toEqual(['riche', 'para-A', 'para-B', 'para-C', 'epoque-A']);
    for (const [id, v] of [['ep-perso', 'personnage-2'], ['ep-lettre', 'B'], ['ep-arme', 'garand'], ['ep-niveau', 'simple'], ['ep-lumiere', 'lune'], ['ep-perso', 'petit'], ['ep-anim', 'rampe']]) await E(([i, x]) => window.__zsPersos.epoque.set(i, x), [id, v]);
    await E(() => window.__zsPersos.epoque.step(0.5));
    const s2 = await E(() => window.__zsPersos.epoque.getState());
    expect(s2.groupes.tenues).toHaveLength(6);
    expect(s2.groupes.jeu.map((g) => g.id)).toEqual(['A', 'epoque-A-simple', 'epoque-B-simple', 'epoque-C-simple']);
    if (s2.webgl) {
      expect(s2.vues.jeu).toMatchObject({ width: 667, height: 375 });
      expect(s2.vues.hd).toMatchObject({ width: 1920, height: 1080 });
      expect(s2.vues.gros.calls).toBeLessThanOrEqual(4);
    }
    expect(JSON.parse(st.texte).choix.grand).toEqual(['epoque-A', 'epoque-B']);
    await E(() => window.__zsPersos.epoque.set('ep-choix-grand', 'epoque-C'));
    expect(JSON.parse((await E(() => window.__zsPersos.epoque.getState())).texte).choix.grand).toBe('epoque-C');
    await E(() => window.__zsPersos.epoque.set('ep-choix-grand', 'epoque-A,epoque-B,epoque-C'));
    expect(JSON.parse((await E(() => window.__zsPersos.epoque.getState())).texte).choix.grand).toEqual(['epoque-A', 'epoque-B', 'epoque-C']);
    expect(await E(() => [localStorage.length, sessionStorage.length])).toEqual([0, 0]);
    expect(errors).toEqual([]);
  });

  // Lot 9g (retour du propriétaire) : Mesures, Curseurs et Mini-arène retirés ; réglages de la vue principale toujours visibles au défilement.
  test('réglages toujours visibles au défilement ; sections Mesures, Curseurs et Mini-arène retirées', async ({ page }) => {
    for (const width of [360, 1440]) {
      await open(page, { width, height: 800 });
      expect(await page.locator('#section-mesures, #section-curseurs, #section-arene, #canvas-arena, #macros').count()).toBe(0);
      for (const id of ['section-sang', 'section-mes-choix']) {
        await page.locator(`#${id}`).scrollIntoViewIfNeeded();
        await page.evaluate((i) => document.getElementById(i).scrollIntoView({ block: 'end' }), id);
        const box = await page.locator('#persos-reglages').boundingBox();
        expect(box.y, `${width} px, ${id}`).toBeGreaterThanOrEqual(-1);
        expect(box.y, `${width} px, ${id}`).toBeLessThanOrEqual(1);
        expect(box.height).toBeLessThan(160);
        await expect(page.locator('#ctl-perso')).toBeInViewport();
      }
    }
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
