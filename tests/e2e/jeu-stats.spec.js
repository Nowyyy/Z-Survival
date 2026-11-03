import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { waitReady, salle } from './helpers.js';

// Lot 2b : cône de tir, sept statistiques (?lvl=), régénération par kill. Petite fenêtre (rendu logiciel plus rapide) ; le temps de jeu
// n'avance que par step() (requestAnimationFrame neutralisé), les mesures sont donc exactes et ne dépendent pas de la vitesse du rendu.
const SIZE = { width: 667, height: 375 };
const PAGE = (extra = '') => salle(`/jeu.html?test=1&seed=1${extra}`);
const BROWSER_NOISE = /GL Driver Message|ReadPixels|GPU stall/;

async function open(page, extra = '&empty=1&nospawn=1', size = SIZE) {
  await page.setViewportSize(size);
  await page.goto(PAGE(extra));
  await waitReady(page);
  await page.evaluate(() => { window.requestAnimationFrame = () => 0; });
  await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 150)));
  await page.evaluate(() => window.__zs.step(0.05));
}
const state = (page) => page.evaluate(() => window.__zs.getState());
const step = (page, s) => page.evaluate((n) => window.__zs.step(n), s);

// Joueur à (x, y) qui vise l'est ; immobile (rest) ou en marche dans la direction (mx, my).

// Demi-angle du cône après stabilisation (1 s de jeu).

test.describe('cône de tir : tirage des balles', () => {
  // Un zombie à 300 unités, replacé avant chaque tir ; renvoie le journal des tirs et, pour chaque tour, si le zombie a été touché.
  async function volley(page, move, count = 40) {
    await open(page);
    await page.evaluate(() => window.__zs.setSeed(7));
    return page.evaluate(([mv, n]) => {
      const zs = window.__zs;
      const hits = [];
      zs.setPlayer(800, 450);
      for (let i = 0; i < 250 && zs.getState().shots.length < n; i += 1) {
        const dir = mv ? { x: 0, y: i % 2 ? -1 : 1 } : undefined;
        zs.setInput({ aim: { x: 1100, y: 450 }, move: dir });
        zs.killAll();
        const before = zs.getState().shots.length;
        const id = zs.spawnEnemy(1100, 450, { type: 'grand', wave: 10 });
        const max = zs.getState().enemies.find((e) => e.id === id).hp;
        zs.step(0.45);
        const after = zs.getState();
        if (after.shots.length > before) hits.push((after.enemies.find((e) => e.id === id)?.hp ?? 0) < max);
      }
      return { shots: zs.getState().shots, hits };
    }, [move, count]);
  }

  test('même graine, mêmes angles de tir', async ({ browser }) => {
    const run = async () => {
      const context = await browser.newContext({ viewport: SIZE });
      const page = await context.newPage();
      const { shots } = await volley(page, false, 12);
      await context.close();
      return shots.slice(0, 12).map((s) => s.angle);
    };
    expect(await run()).toEqual(await run());
  });
});

test.describe('statistiques : dégâts, cadence, vitesse', () => {
  for (const [lvl, delay] of [[0, 0.4], [10, 0.15]]) {
    test(`cadence : intervalle entre tirs ${delay} s au niveau ${lvl} (±10 %, temps de jeu)`, async ({ page }) => {
      await open(page, `&empty=1&nospawn=1&lvl=cadence:${lvl}`);
      await page.evaluate(() => { window.__zs.setInput({ aim: { angle: 0 } }); window.__zs.setPlayer(800, 450); });
      // Un zombie qui reste sur la ligne : replacé à chaque pas.
      const times = await page.evaluate(() => {
        const zs = window.__zs;
        for (let i = 0; i < 60; i += 1) {
          zs.killAll();
          zs.spawnEnemy(1100, 450, { type: 'grand', wave: 10 });
          zs.step(0.05);
        }
        return zs.getState().shots.map((s) => s.time);
      });
      expect(times.length).toBeGreaterThan(5);
      const gaps = times.slice(1).map((t, i) => t - times[i]);
      const mean = gaps.reduce((a, b) => a + b, 0) / gaps.length;
      expect(Math.abs(mean - delay) / delay).toBeLessThanOrEqual(0.1);
    });
  }

  for (const [lvl, speed] of [[0, 220], [10, 308]]) {
    test(`vitesse : ${speed} au niveau ${lvl} (±3 %, mesurée par step() en terrain dégagé)`, async ({ page }) => {
      await open(page, `&empty=1&nospawn=1&lvl=vitesse:${lvl}`);
      const measured = await page.evaluate(() => {
        const zs = window.__zs;
        zs.setPlayer(200, 450);
        zs.setInput({ aim: { angle: 0 }, move: { x: 1, y: 0 } });
        const x0 = zs.getState().player.x;
        zs.step(1);
        return zs.getState().player.x - x0;
      });
      expect(Math.abs(measured - speed) / speed).toBeLessThanOrEqual(0.03);
    });
  }
});

test.describe('?lvl= et état', () => {

  test('valeurs hostiles : bornées ou ignorées sans erreur, console propre', async ({ page }) => {
    const problems = [];
    page.on('console', (m) => ['error', 'warning'].includes(m.type()) && !BROWSER_NOISE.test(m.text()) && problems.push(m.text()));
    page.on('pageerror', (e) => problems.push(e.message));
    await open(page, '&empty=1&nospawn=1&lvl=degats:99,foo:3,precision:-2,vie:abc,regen:2.5,%3Cscript%3E');
    const s = await state(page);
    expect(s.stats.levels).toEqual({ degats: 10, portee: 0, precision: 0, cadence: 0, vitesse: 0, vie: 0, regen: 0 });
    expect(s.stats.warnings.length).toBeGreaterThan(0);
    await step(page, 1);
    expect(problems).toEqual([]);
  });

  test('aucune requête externe, aucun stockage, aucun cookie, aucune donnée dans les URL, console propre (avec ?lvl=)', async ({ page, baseURL }) => {
    const external = [];
    const urls = [];
    const problems = [];
    page.on('request', (r) => {
      if (!r.url().startsWith(baseURL) && !r.url().startsWith('data:')) external.push(r.url());
      if (r.url().startsWith(baseURL) && r.url().includes('?') && !r.url().includes('/jeu.html')) urls.push(r.url());
    });
    page.on('console', (m) => ['error', 'warning'].includes(m.type()) && !BROWSER_NOISE.test(m.text()) && problems.push(m.text()));
    page.on('pageerror', (e) => problems.push(e.message));
    await open(page, '&empty=1&lvl=all:5&wave=3');
    await step(page, 5);
    expect(external).toEqual([]);
    expect(urls).toEqual([]);
    expect(problems).toEqual([]);
    expect(await page.evaluate(() => [localStorage.length, sessionStorage.length, document.cookie])).toEqual([0, 0, '']);
    expect(await page.context().cookies()).toEqual([]);
    expect(new URL(page.url()).search).toBe('?map=salle&test=1&seed=1&empty=1&lvl=all:5&wave=3'); // lot 3b : avant « ?test=1&seed=1&empty=1&lvl=all:5&wave=3 »
  });

  test('axe sans violation avec ?lvl=all:10 (667×375)', async ({ page }) => {
    await open(page, '&empty=1&lvl=all:10');
    const result = await new AxeBuilder({ page }).analyze();
    expect(result.violations).toEqual([]);
  });
});

test.describe('budget et sons au niveau maximal', () => {
  test('10 zombies variés, cône affiché, ombres actives : au plus 300 appels, 15 000 triangles, +10 triangles sur le lot 2 (14 858)', async ({ page }, testInfo) => {
    await open(page, '&nospawn=1&shadows=1&lvl=all:10');
    const r = await page.evaluate(() => {
      const zs = window.__zs;
      const p = zs.getState().player;
      zs.setInput({ aim: { angle: Math.PI } });
      const T = ['marcheur', 'petit', 'voute', 'grand'];
      const G = ['lent', 'marche', 'rampe', 'course'];
      for (let i = 0; i < 10; i += 1) zs.spawnEnemy(p.x + 70 + (i % 5) * 45, p.y - 90 + Math.floor(i / 5) * 90 + (i % 2) * 15, { type: T[i % 4], gait: G[(i + Math.floor(i / 4)) % 4], wave: 10 });
      zs.step(0.05);
      zs.sampleScreen(0, 0, 8, 8);
      const s = zs.getState();
      return { render: s.render, count: s.enemies.length, cone: s.laser?.cone ?? null };
    });
    testInfo.annotations.push({ type: 'rendu', description: `10 zombies + cône : ${r.render.calls} appels, ${r.render.triangles} triangles` });
    console.log(`BUDGET lot 2b, 10 zombies, cône affiché : ${r.render.calls} appels de dessin, ${r.render.triangles} triangles`);
    expect(r.count).toBe(10);
    expect(r.cone).not.toBeNull();
    expect(r.render.calls).toBeLessThanOrEqual(400); // lot 3m : limites de refonte relevées par le propriétaire (avant : 300)
    expect(r.render.triangles).toBeLessThanOrEqual(45000); // lot 3m : limites de refonte relevées par le propriétaire (avant : 30000)
    expect(r.render.triangles).toBeLessThanOrEqual(45000); // lot 3m : limites de refonte relevées par le propriétaire (avant : 30000) ; lot 3 : +24 triangles de planches (14 858 + 10 au lot 2b, 14 862 + 120 = 14 982 mesurés)
  });

});
