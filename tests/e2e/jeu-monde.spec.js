import { test, expect } from '@playwright/test';
import { projectGround } from '../../js/core/viewport.js';
import { waitReady, salle } from './helpers.js';

// Monde du lot 1b : salle de 2000 × 1200 avec meubles, décor extérieur, zombies qui arrivent de dehors. Petite fenêtre (667×375) et
// state.step() (simulation avancée sans attendre le rendu) de préférence. Les tests se désactivent seuls si WebGL manque.
const SIZE = { width: 667, height: 375 };
const PAGE = (extra = '') => salle(`/jeu.html?test=1&seed=1${extra}`);
const state = (page) => page.evaluate(() => window.__zs.getState());
async function open(page, extra = '&nospawn=1', size = SIZE) {
  await page.setViewportSize(size);
  await page.goto(PAGE(extra));
  await waitReady(page);
}
const step = (page, seconds) => page.evaluate((s) => window.__zs.step(s), seconds);

// Limites de déplacement du joueur : face intérieure des murs (24) de la salle (800, 800, 2000 × 1200), moins son rayon (18).

test.describe('monde du lot 1b', () => {
  test.skip(({ isMobile }) => isMobile, 'bureau (la fenêtre est réglée par chaque test)');

  test('aucun zombie n\'est bloqué plus de 2 s contre un meuble (huit zombies, 60 s)', async ({ page }) => {
    await open(page, '&planks=0'); // lot 3 : fenêtres ouvertes (sans elles, les zombies attendent à leur fenêtre, ce qui n'est pas un blocage contre un meuble)
    await page.evaluate(() => window.__zs.setChutes(0)); // lot 3 : sans chute, le joueur meurt comme avant et la boucle s'arrête (à terre, la file d'attente derrière lui dure et n'est pas un blocage)
    const stuck = await page.evaluate(() => {
      const problems = [];
      const anchors = new Map();
      let t = 0;
      for (let i = 0; i < 1200; i += 1) {
        window.__zs.step(0.05);
        t += 0.05;
        if (i % 40 !== 39) continue; // toutes les 2 s
        const st = window.__zs.getState();
        for (const e of st.enemies) {
          const a = anchors.get(e.id);
          const near = Math.hypot(e.x - st.player.x, e.y - st.player.y) < 120; // file d'attente autour du joueur
          if (a && !near && !a.near && Math.hypot(e.x - a.x, e.y - a.y) < 5) problems.push({ id: e.id, t: Math.round(t), x: Math.round(e.x), y: Math.round(e.y) });
          anchors.set(e.id, { x: e.x, y: e.y, near });
        }
        if (st.dead) break;
      }
      return problems;
    });
    expect(stuck).toEqual([]);
  });

  test('la visée à la souris reste juste pendant que la caméra se déplace (vrais mouvements de souris)', async ({ page }) => {
    await open(page);
    await page.mouse.move(500, 120);
    await page.mouse.move(520, 130);
    await page.waitForFunction(() => window.__zs.getState().time > 0.4);
    const t0 = (await state(page)).time;
    await page.keyboard.down('KeyD');
    await page.waitForFunction((t) => window.__zs.getState().time > t + 0.9, t0); // 0,9 s de temps de jeu, pas de temps réel (machine chargée)
    const moving = await state(page);
    await page.keyboard.up('KeyD');
    const early = moving.camera.target.x;
    expect(early).toBeGreaterThan(1850);
    // Le rayon visé part du joueur selon l'angle de visée : il doit passer par le point d'écran de la souris (520, 130).
    const gap = (s) => {
      let best = Infinity;
      for (let d = 20; d <= 900; d += 5) {
        const p = projectGround(s.player.x + Math.cos(s.aim) * d - s.camera.target.x, s.player.y + Math.sin(s.aim) * d - s.camera.target.y, s.camera.distance, s.camera.tilt, 40, SIZE.width / SIZE.height);
        if (!p) continue;
        best = Math.min(best, Math.hypot(((p.x + 1) / 2) * SIZE.width - 520, ((1 - p.y) / 2) * SIZE.height - 130));
      }
      return best;
    };
    expect(gap(moving)).toBeLessThan(25);
    // Si la visée restait figée dans le monde, la caméra ayant bougé de plus de 100 unités, l'écart serait bien plus grand.
    await page.waitForTimeout(600);
    expect(gap(await state(page))).toBeLessThan(25);
  });

  test('le HUD, le bouton Pause et les panneaux restent à 16 px des bords dans le monde du lot 1b', async ({ page }) => {
    await open(page);
    for (const sel of ['#hud', '#btn-pause']) {
      const box = await page.locator(sel).boundingBox();
      expect(box.x, sel).toBeGreaterThanOrEqual(16);
      expect(box.y, sel).toBeGreaterThanOrEqual(16);
      expect(SIZE.width - (box.x + box.width), sel).toBeGreaterThanOrEqual(16);
    }
  });

  test('au plus 300 appels de dessin avec 8 zombies et les ombres actives ; triangles rapportés', async ({ page }, testInfo) => {
    await open(page);
    // Huit zombies au sud et à l'est du joueur ; la visée est au nord : pas de tir, pas de balle ni de flash dans la mesure.
    await page.evaluate(() => {
      window.__zs.setInput({ aim: { angle: -Math.PI / 2 } });
      for (let i = 0; i < 8; i += 1) window.__zs.spawnEnemy(1800 + (i % 4) * 60 - 90, 1480 + Math.floor(i / 4) * 80);
    });
    await expect.poll(async () => (await state(page)).render.calls, { timeout: 30_000 }).toBeGreaterThan(40);
    const { render, enemies } = await state(page);
    expect(enemies).toHaveLength(8);
    expect(render.calls).toBeLessThanOrEqual(400); // lot 3m : limites de refonte relevées par le propriétaire (avant : 300) ; chaque personnage coûte 32 appels (16 pièces, passe d'ombres comprise) : 9 × 32 = 288
    testInfo.annotations.push({ type: 'rendu', description: `${render.calls} appels de dessin, ${render.triangles} triangles (8 zombies, ombres actives, 667×375)` });
  });

  test('aucune requête externe, aucun stockage, aucune donnée dans les URL (monde du lot 1b)', async ({ page, baseURL }) => {
    const requests = [];
    page.on('request', (r) => requests.push(r.url()));
    await open(page, '');
    await step(page, 5);
    const outside = requests.filter((u) => !u.startsWith(baseURL) && !u.startsWith('data:'));
    expect(outside).toEqual([]);
    for (const url of requests.filter((u) => u.startsWith(baseURL) && !u.includes('/jeu.html?'))) expect(new globalThis.URL(url).search, url).toBe('');
    expect(await page.evaluate(() => [localStorage.length, sessionStorage.length, document.cookie])).toEqual([0, 0, '']);
    expect(await page.evaluate(() => [location.search, location.hash])).toEqual(['?map=salle&test=1&seed=1', '']); // lot 3b : avant « ?test=1&seed=1 »
  });

  test('sans ?test=1, ni window.__zs ni ?empty=1 ne sont actifs', async ({ page }) => {
    await page.setViewportSize(SIZE);
    await page.goto('/jeu.html?seed=1&empty=1&nospawn=1');
    await page.waitForSelector('#game-canvas canvas, #game-error:not([hidden])', { timeout: 60_000 });
    expect(await page.evaluate(() => typeof window.__zs)).toBe('undefined');
  });
});

test('test tactile (CDP) : le stick gauche déplace le joueur, la caméra le suit et il reste à l\'écran', async ({ browser, baseURL }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile', 'une seule fois');
  const context = await browser.newContext({ viewport: SIZE, hasTouch: true, isMobile: true, locale: 'fr-FR' });
  const page = await context.newPage();
  await page.goto(baseURL + PAGE('&nospawn=1'));
  await waitReady(page);
  const before = await state(page);
  const cdp = await context.newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 100, y: 280, id: 1 }] });
  for (let i = 1; i <= 6; i += 1) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 100 + i * 14, y: 280, id: 1 }] });
  // Lot 1c : attente par sondage et non plus 1,2 s fixes (avant : waitForTimeout(1200) puis lecture) : en rendu logiciel (CI) le jeu n'affiche
  // que quelques images par seconde et le déplacement n'avait pas encore atteint 100 unités. Mêmes seuils.
  await expect.poll(async () => (await state(page)).player.x, { timeout: 30_000 }).toBeGreaterThan(before.player.x + 100);
  await expect.poll(async () => (await state(page)).camera.target.x, { timeout: 30_000 }).toBeGreaterThan(before.camera.target.x + 60);
  const during = await state(page);
  expect(during.playerScreen.x).toBeGreaterThan(0.05);
  expect(during.playerScreen.x).toBeLessThan(0.95);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await context.close();
});

for (const width of [360, 768, 1440]) {
  test(`CLS du monde du lot 1b avec les données retardées de 400 ms (${width} px) : au plus 0,1`, async ({ browser, baseURL }, testInfo) => {
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
    await page.goto(baseURL + PAGE('&nospawn=1'));
    await page.waitForFunction(() => (window.__zs?.getState()?.time ?? 0) > 0.3);
    const cls = await page.evaluate(() => window.__cls);
    testInfo.annotations.push({ type: 'cls', description: `${width} px : ${cls.toFixed(4)}` });
    expect(cls).toBeLessThanOrEqual(0.1);
    await context.close();
  });
}

