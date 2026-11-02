import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

// Lot 3j-C : sections « Sang » et « Mini-arène » de atelier-personnages.html (667 × 375, hooks de ?test=1, temps simulé).
// Lancer : E2E_FULL=1 npx playwright test tests/e2e/persos-sang.spec.js
const SIZE = { width: 667, height: 375 };
const S = (page) => page.evaluate(() => window.__zsPersos.getState());
const set = (page, id, value) => page.evaluate(([i, v]) => window.__zsPersos.set(i, v), [id, value]);
const arena = (page) => page.evaluate(() => window.__zsPersos.arena.state());

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

  test('les sections sang et mini-arène sont présentes, sans erreur ni requête externe', async ({ page, baseURL }) => {
    const errors = [];
    const external = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => (m.type() === 'error' || (m.type() === 'warning' && !/GL Driver|GPU stall|ReadPixels/.test(m.text()))) && errors.push(m.text()));
    page.on('request', (r) => !r.url().startsWith(baseURL) && !r.url().startsWith('data:') && external.push(r.url()));
    await open(page);
    await expect(page.locator('#ctl-sang option')).toHaveText(['0 : aucun', 'Réduit', 'Complet']);
    for (const id of ['#btn-hit', '#btn-kill', '#btn-burst', '#btn-arena-restart', '#btn-arena-next', '#ctl-arena-speed', '#canvas-arena']) await expect(page.locator(id)).toBeVisible();
    await page.evaluate(() => window.__zsPersos.arena.run(3));
    expect(errors).toEqual([]);
    expect(external).toEqual([]);
  });

  test('niveau 0 : aucune particule, aucune tache, aucun cadavre, aucune instance', async ({ page }) => {
    await open(page);
    await set(page, 'ctl-sang', '0'); // le niveau par défaut est désormais « complet »
    await page.click('#btn-hit');
    await page.click('#btn-kill');
    await page.evaluate(() => window.__zsPersos.step(0.3));
    expect(await page.evaluate(() => window.__zsPersos.blood())).toMatchObject({ particles: 0, decals: 0, corpses: 0, drawnParticles: 0, drawnDecals: 0, calls: 0 });
    expect((await S(page)).mainVisible).toBe(true);
  });

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

  test('tir mortel : cadavre visuel, puis il disparaît après sa durée (complet : 1,2 + 6 + 0,8 s) et le personnage revient', async ({ page }) => {
    await open(page);
    await set(page, 'ctl-sang', '1');
    await page.click('#btn-kill');
    await page.evaluate(() => window.__zsPersos.step(0.1));
    let s = await S(page);
    expect(s.blood.corpses).toBe(1);
    expect(s.mainVisible).toBe(false);
    await page.evaluate(() => window.__zsPersos.step(8.2));
    s = await S(page);
    expect(s.blood.corpses).toBe(0);
    expect(s.mainVisible).toBe(true);
  });

  test('réduit : cadavre de 2 s seulement ; corps sans taches (palier de blessure 0)', async ({ page }) => {
    await open(page);
    await set(page, 'ctl-sang', 'reduit');
    await page.click('#btn-hit');
    await page.click('#btn-hit');
    expect((await S(page)).main.wound).toBe(0);
    await page.click('#btn-kill');
    await page.evaluate(() => window.__zsPersos.step(3.9));
    expect((await S(page)).blood.corpses).toBe(1);
    await page.evaluate(() => window.__zsPersos.step(0.2));
    expect((await S(page)).blood.corpses).toBe(0);
  });

  test('complet : les taches sur le corps suivent la vie (paliers 1, 2, 3)', async ({ page }) => {
    await open(page);
    await set(page, 'ctl-sang', '1');
    const tiers = [];
    for (let i = 0; i < 3; i += 1) {
      await page.click('#btn-hit');
      tiers.push((await S(page)).main.wound);
    }
    expect(tiers).toEqual([1, 2, 3]);
  });

  test('joueur touché : 4 particules au plus, aucune tache', async ({ page }) => {
    await open(page);
    await set(page, 'ctl-sang', '1');
    await set(page, 'ctl-perso', 'joueur');
    await page.click('#btn-hit');
    const b = await page.evaluate(() => window.__zsPersos.blood());
    expect(b.particles).toBeLessThanOrEqual(4);
    expect(b.particles).toBeGreaterThan(0);
    expect(b.decals).toBe(0);
  });

  test('mini-arène : 10 zombies, tous tués, cadavres au plus 6 puis disparus', async ({ page }) => {
    await open(page);
    await set(page, 'ctl-sang', '1');
    let a = await arena(page);
    expect(a.zombies).toHaveLength(10);
    let maxCorpses = 0;
    for (let i = 0; i < 30 && !a.done; i += 1) {
      await page.evaluate(() => window.__zsPersos.arena.run(1));
      a = await arena(page);
      maxCorpses = Math.max(maxCorpses, a.blood.corpses);
    }
    expect(a.done).toBe(true);
    expect(a.kills).toBe(10);
    expect(a.alive).toBe(0);
    expect(a.meshes).toBe(0);
    expect(maxCorpses).toBeLessThanOrEqual(6);
    expect(maxCorpses).toBeGreaterThan(0);
    await page.evaluate(() => window.__zsPersos.arena.run(9));
    expect((await arena(page)).blood.corpses).toBe(0);
  });

  test('mini-arène déterministe : même graine, même état ; graine suivante : autre départ', async ({ page }) => {
    await open(page);
    await page.evaluate(() => window.__zsPersos.arena.run(5));
    const a = await arena(page);
    await page.click('#btn-arena-restart');
    await page.evaluate(() => window.__zsPersos.arena.run(5));
    const b = await arena(page);
    expect(b.zombies).toEqual(a.zombies);
    expect([b.kills, b.shots, b.time]).toEqual([a.kills, a.shots, a.time]);
    await page.click('#btn-arena-next');
    const c = await arena(page);
    expect(c.seed).toBe(a.seed + 1);
    expect(c.zombies.map((z) => z.x)).not.toEqual(a.zombies.map((z) => z.x));
  });

  test('vitesse ×2 : mêmes résultats logiques qu\'à ×1 pour le même temps d\'arène', async ({ page }) => {
    await open(page);
    await page.evaluate(() => window.__zsPersos.arena.step(6));
    const one = await arena(page);
    await page.click('#btn-arena-restart');
    await set(page, 'ctl-arena-speed', '2');
    await page.evaluate(() => window.__zsPersos.arena.step(3));
    const two = await arena(page);
    expect(two.time).toBeCloseTo(one.time, 6);
    expect(two.zombies).toEqual(one.zombies);
    expect(two.kills).toBe(one.kills);
  });

  test('mini-arène avec « Actuel » : personnages du jeu, sang et compteurs à jour', async ({ page }) => {
    await open(page);
    await set(page, 'ctl-variante', 'actuel');
    await set(page, 'ctl-sang', 'reduit');
    await page.evaluate(() => window.__zsPersos.arena.run(8));
    const a = await arena(page);
    expect(a.kills).toBeGreaterThan(0);
    expect(a.blood.decals).toBeGreaterThan(0);
    await expect(page.locator('#arena-stats')).toContainText(`tués ${a.kills}`);
  });

  test('« Mes choix » porte le niveau de sang ; rien n\'est stocké', async ({ page, context }) => {
    await open(page);
    await set(page, 'ctl-sang', 'reduit');
    await page.click('#btn-pick');
    expect((await page.locator('#choices-text').inputValue()).split('\n').at(-1)).toBe('sang=reduit');
    await page.click('#btn-kill');
    await page.evaluate(() => window.__zsPersos.arena.run(4));
    expect(await page.evaluate(() => [localStorage.length, sessionStorage.length])).toEqual([0, 0]);
    expect(await context.cookies()).toEqual([]);
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
