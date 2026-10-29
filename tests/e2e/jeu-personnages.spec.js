import { test, expect } from '@playwright/test';
import { waitReady, salle } from './helpers.js';

// Lot 1c-C : personnages finaux, quatre variantes de zombies, budget de dessin, lisibilité. 667×375 de préférence ; les tests se
// désactivent seuls si WebGL manque. En WebGL logiciel, aucune conclusion de performance.
const SIZE = { width: 667, height: 375 };
const PAGE = (extra = '') => salle(`/jeu.html?test=1&seed=1&nospawn=1${extra}`);
const state = (page) => page.evaluate(() => window.__zs.getState());

async function open(page, extra = '', size = SIZE) {
  await page.setViewportSize(size);
  await page.goto(PAGE(extra));
  await waitReady(page);
}

// Huit zombies autour du joueur, hors de sa ligne de visée (visée au nord, pas de tir).
const spawnEight = (page) => page.evaluate(() => {
  const s = window.__zs.getState();
  window.__zs.setInput({ aim: { angle: -Math.PI / 2 } });
  for (let i = 0; i < 8; i += 1) window.__zs.spawnEnemy(s.player.x + 90 + 45 * (i % 4), s.player.y + 40 + 70 * Math.floor(i / 4));
});

// Luminance moyenne d'une fenêtre de 16×16 px centrée sur (x, y) en pixels CSS.
const lum = (page, x, y) => page.evaluate(([a, b]) => window.__zs.sampleScreen(a - 8, b - 8, 16, 16).meanLuminance, [x, y]);

test.describe('personnages du lot 1c-C', () => {
  test.skip(({ isMobile }) => isMobile, 'bureau (la fenêtre est réglée par chaque test)');

  test('huit zombies, ombres actives : au plus 300 appels de dessin (objectif 240) et 15 000 triangles', async ({ page }, testInfo) => {
    await open(page);
    await spawnEight(page);
    await page.evaluate(() => window.__zs.sampleScreen(0, 0, 4, 4)); // image à jour
    const s = await state(page);
    expect(s.enemies).toHaveLength(8);
    testInfo.annotations.push({ type: 'rendu', description: `${s.render.calls} appels de dessin, ${s.render.triangles} triangles (8 zombies, ombres actives)` });
    console.log(`lot 1c-C : ${s.render.calls} appels de dessin (objectif 240), ${s.render.triangles} triangles`);
    expect(s.render.calls).toBeLessThanOrEqual(300);
    expect(s.render.calls).toBeLessThanOrEqual(240);
    expect(s.render.triangles).toBeLessThanOrEqual(15_000);
  });

  test('les zombies d\'une partie utilisent au moins 3 variantes différentes', async ({ page }) => {
    await open(page);
    await spawnEight(page);
    const variants = (await state(page)).enemies.map((e) => e.variant);
    expect(new Set(variants).size).toBeGreaterThanOrEqual(3);
    for (const v of variants) {
      expect(Number.isInteger(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(4);
    }
  });

  test('un bloc de quatre identifiants consécutifs montre les quatre variantes ; la variante d\'un zombie ne change pas', async ({ page }) => {
    await open(page);
    await page.evaluate(() => Array.from({ length: 7 }, (_, i) => window.__zs.spawnEnemy(1500 + i * 80, 1500)));
    const before = (await state(page)).enemies.map((e) => [e.id, e.variant]);
    expect(new Set(before.filter(([id]) => id >= 4 && id <= 7).map(([, v]) => v)).size).toBe(4);
    await page.evaluate(() => window.__zs.step(1));
    const after = (await state(page)).enemies.map((e) => [e.id, e.variant]);
    expect(after).toEqual(before);
  });

  test('les poses du joueur s\'appliquent : angles non nuls en marche, nuls à l\'arrêt', async ({ page }) => {
    await open(page);
    await page.evaluate(() => window.__zs.setInput({ move: { x: 1, y: 0 }, aim: { angle: 0 } }));
    await page.evaluate(() => window.__zs.step(0.6));
    const walking = await state(page);
    expect(Math.abs(walking.pose.hipL) + Math.abs(walking.pose.hipR)).toBeGreaterThan(0.1);
    for (const k of ['hipL', 'hipR', 'kneeL', 'kneeR', 'shoulderL', 'shoulderR']) expect(walking.pose[k]).toBeCloseTo(walking.pose.expected[k], 3);
    await page.evaluate(() => window.__zs.setInput({ move: { x: 0, y: 0 }, aim: { angle: 0 } }));
    await page.evaluate(() => window.__zs.step(1.5));
    const idle = await state(page);
    expect(Math.abs(idle.pose.hipL)).toBeLessThan(0.02);
    expect(Math.abs(idle.pose.hipR)).toBeLessThan(0.02);
  });

  test('les poses des zombies s\'appliquent : bras tendus, hanches qui balancent en marche', async ({ page }) => {
    await open(page);
    await page.evaluate(() => window.__zs.spawnEnemy(1800, 1500));
    await page.evaluate(() => window.__zs.step(1));
    const z = (await state(page)).enemies[0];
    expect(z.pose).not.toBeNull();
    expect(z.pose.shoulderL).toBeGreaterThan(1.0);
    expect(z.pose.shoulderR).toBeGreaterThan(1.0);
    expect(Math.abs(z.pose.hipL) + Math.abs(z.pose.hipR)).toBeGreaterThan(0.01);
  });

  for (const [name, extra] of [['zoom par défaut', ''], ['?zoom=1.5', '&zoom=1.5']]) {
    test(`le joueur est visible et distinct du sol à 667×375 (${name})`, async ({ page }) => {
      await open(page, extra);
      await page.evaluate(() => window.__zs.setInput({ aim: { angle: -Math.PI / 2 } }));
      await page.evaluate(() => window.__zs.sampleScreen(0, 0, 4, 4));
      const { playerScreen } = await state(page);
      const x = playerScreen.x * SIZE.width;
      const y = playerScreen.y * SIZE.height - 10; // le torse, un peu au-dessus des pieds
      const onPlayer = await lum(page, x, y);
      const onFloor = await lum(page, x + 90, y);
      expect(Math.abs(onPlayer - onFloor) / Math.max(onFloor, 0.01)).toBeGreaterThanOrEqual(0.1);
    });

    test(`un zombie est visible et distinct du sol à 667×375 (${name})`, async ({ page }) => {
      await open(page, extra);
      await page.evaluate(() => window.__zs.setInput({ aim: { angle: -Math.PI / 2 } }));
      await page.evaluate(() => {
        const s = window.__zs.getState();
        window.__zs.spawnEnemy(s.player.x + 100, s.player.y + 60);
      });
      await page.evaluate(() => window.__zs.sampleScreen(0, 0, 4, 4));
      const z = (await state(page)).enemies[0];
      const x = z.screen.x * SIZE.width;
      const y = z.screen.y * SIZE.height - 10;
      const onZombie = await lum(page, x, y);
      const onFloor = await lum(page, x + 70, y);
      expect(Math.abs(onZombie - onFloor) / Math.max(onFloor, 0.01)).toBeGreaterThanOrEqual(0.1);
    });
  }

  test('le tir, le laser et la balle fonctionnent avec les nouveaux personnages', async ({ page }) => {
    await open(page);
    await page.evaluate(() => {
      const s = window.__zs.getState();
      window.__zs.setInput({ aim: { angle: 0 } });
      window.__zs.spawnEnemy(s.player.x + 200, s.player.y);
    });
    await page.evaluate(() => window.__zs.step(3));
    const s = await state(page);
    expect(s.kills + s.enemies.filter((e) => e.health < 50).length).toBeGreaterThan(0);
  });

  test('zoom 3, 2560×1080 : le rendu reste dans le budget de dessin avec 8 zombies', async ({ page }) => {
    await open(page, '&zoom=3', { width: 2560, height: 1080 });
    await spawnEight(page);
    await page.evaluate(() => window.__zs.sampleScreen(0, 0, 4, 4));
    const s = await state(page);
    expect(s.render.calls).toBeLessThanOrEqual(300);
    expect(s.render.triangles).toBeLessThanOrEqual(15_000);
  });
});
