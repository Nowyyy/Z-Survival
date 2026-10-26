import { test, expect } from '@playwright/test';
import { projectGround } from '../../js/core/viewport.js';
import { waitReady } from './helpers.js';

// Petite fenêtre : le rendu logiciel du navigateur de test est alors plus rapide. Le temps de jeu, lui, est mesuré par le jeu.
const SIZE = { width: 667, height: 375 };
const URL = (extra = '') => `/jeu.html?test=1&nospawn=1&seed=1${extra}`;

async function open(page, extra = '') {
  await page.setViewportSize(SIZE);
  await page.goto(URL(extra));
  await waitReady(page);
}
const state = (page) => page.evaluate(() => window.__zs.getState());
const aimRight = (page) => page.evaluate(() => window.__zs.setInput({ aim: { angle: 0 } }));
const spawn = (page, x, y) => page.evaluate(([a, b]) => window.__zs.spawnEnemy(a, b), [x, y]);

// Les tests qui créent leur propre contexte ne tournent qu'une fois.
const once = (_fixtures, testInfo) => testInfo.project.name === 'mobile';

test.describe('tir automatique', () => {
  test('un zombie sur la ligne de visée déclenche un tir ; le laser seul ne blesse pas ; les dégâts arrivent à l\'impact', async ({ page }) => {
    await open(page);
    await aimRight(page);
    await spawn(page, 1400, 450);
    // Premier instant où une balle existe : le zombie est intact.
    const seen = await page.evaluate(() => new Promise((resolve) => {
      const tick = () => {
        const s = window.__zs.getState();
        if (s.bullets.length) resolve(s);
        else requestAnimationFrame(tick);
      };
      tick();
    }));
    expect(seen.bullets).toHaveLength(1);
    expect(seen.enemies[0].health).toBe(50);
    await expect.poll(async () => (await state(page)).enemies[0]?.health ?? 0, { timeout: 30_000 }).toBeLessThan(50);
  });

  test('le délai entre le tir et l\'impact vaut distance ÷ vitesse de balle, à 15 % près', async ({ page }) => {
    await open(page);
    await aimRight(page);
    await spawn(page, 1500, 450);
    const m = await page.evaluate(() => new Promise((resolve) => {
      let first = null;
      const tick = () => {
        const s = window.__zs.getState();
        if (!first && s.bullets.length) first = { t: s.time, bx: s.bullets[0].x, zx: s.enemies[0].x };
        else if (first && s.enemies[0].health < 50) return resolve({ first, t: s.time });
        requestAnimationFrame(tick);
      };
      tick();
    }));
    // Le zombie avance vers le joueur à 70 u/s pendant que la balle va à 1100 u/s ; rayons : 20 + 4.
    const expected = (m.first.zx - 24 - m.first.bx) / (1100 + 70);
    const measured = m.t - m.first.t;
    expect(Math.abs(measured - expected) / expected).toBeLessThan(0.15);
  });

  test('le zombie meurt après le nombre de balles attendu (50 de vie, 25 de dégâts : deux)', async ({ page }) => {
    await open(page);
    await aimRight(page);
    await spawn(page, 1100, 450);
    const result = await page.evaluate(() => new Promise((resolve) => {
      const ids = new Set();
      const tick = () => {
        const s = window.__zs.getState();
        s.bullets.forEach((b) => ids.add(b.id));
        if (s.kills === 1) resolve({ bullets: ids.size, enemies: s.enemies.length });
        else requestAnimationFrame(tick);
      };
      tick();
    }));
    expect(result).toEqual({ bullets: 2, enemies: 0 });
  });

  test('aucun tir quand le laser ne touche personne', async ({ page }) => {
    await open(page);
    await aimRight(page);
    await spawn(page, 800, 150);
    const maxBullets = await page.evaluate(() => new Promise((resolve) => {
      let max = 0;
      const tick = () => {
        const s = window.__zs.getState();
        max = Math.max(max, s.bullets.length);
        if (s.time > 1.5) resolve(max);
        else requestAnimationFrame(tick);
      };
      tick();
    }));
    expect(maxBullets).toBe(0);
    expect((await state(page)).enemies[0].health).toBe(50);
  });

  test('jamais plus de 30 balles actives', async ({ page }) => {
    await open(page);
    await aimRight(page);
    for (const y of [430, 440, 450, 460, 470]) await spawn(page, 1500, y);
    const max = await page.evaluate(() => new Promise((resolve) => {
      let top = 0;
      const tick = () => {
        const s = window.__zs.getState();
        top = Math.max(top, s.bullets.length);
        if (s.time > 3) resolve(top);
        else requestAnimationFrame(tick);
      };
      tick();
    }));
    expect(max).toBeGreaterThan(0);
    expect(max).toBeLessThanOrEqual(30);
  });
});

test.describe('mort, pause', () => {
  test('le joueur meurt au contact, le panneau de fin apparaît, Rejouer relance une partie propre', async ({ page }) => {
    await open(page);
    await page.evaluate(() => window.__zs.setInput({ aim: { angle: -Math.PI / 2 } }));
    for (const [x, y] of [[850, 450], [750, 450], [800, 500], [835, 480], [770, 480]]) await spawn(page, x, y);
    await expect(page.locator('#end-panel')).toBeVisible({ timeout: 60_000 });
    await expect(page.locator('#end-panel')).toContainText('Tu es mort');
    await expect(page.locator('#end-kills')).toHaveText('Zombies tués : 0');
    expect((await state(page)).dead).toBe(true);
    await page.getByRole('button', { name: 'Rejouer' }).click();
    await expect(page.locator('#end-panel')).toBeHidden();
    await expect.poll(async () => {
      const s = await state(page);
      return [s.dead, s.player.health, s.kills, s.enemies.length, s.bullets.length];
    }).toEqual([false, 100, 0, 0, 0]);
  });

  test('la pause fige la partie, balles comprises', async ({ page }) => {
    await open(page);
    await aimRight(page);
    await spawn(page, 1500, 450);
    await page.waitForFunction(() => window.__zs.getState().bullets.length > 0);
    await page.getByRole('button', { name: 'Pause' }).click();
    await expect(page.locator('#pause-panel')).toBeVisible();
    const before = await state(page);
    expect(before.paused).toBe(true);
    await page.waitForTimeout(800);
    const after = await state(page);
    expect(after.time).toBe(before.time);
    expect(after.bullets).toEqual(before.bullets);
    expect(after.enemies).toEqual(before.enemies);
    await page.getByRole('button', { name: 'Reprendre' }).click();
    await expect.poll(async () => (await state(page)).time).toBeGreaterThan(before.time);
  });
});

test.describe('visée', () => {
  for (const [w, h] of [[667, 375], [1440, 900]]) {
    test(`le laser suit la souris (${w}×${h})`, async ({ page, isMobile }) => {
      test.skip(isMobile, 'souris');
      await page.setViewportSize({ width: w, height: h });
      await page.goto(URL());
      await waitReady(page);
      const { player, camera } = await state(page);
      // Points du sol choisis autour du joueur, projetés à l'écran avec la géométrie pure de viewport.js.
      for (const [gx, gy] of [[200, -100], [-150, 80], [0, 150], [-250, -10]]) {
        const p = projectGround(player.x + gx - 800, player.y + gy - 450, camera.distance, camera.tilt, 40, w / h);
        await page.mouse.move(((p.x + 1) / 2) * w, ((1 - p.y) / 2) * h);
        await expect.poll(async () => {
          const aim = (await state(page)).aim;
          const want = Math.atan2(gy, gx);
          return Math.abs(Math.atan2(Math.sin(aim - want), Math.cos(aim - want)));
        }).toBeLessThan(0.03);
      }
    });
  }

  test('la zone de jeu désactive défilement, zoom et menu contextuel', async ({ page }) => {
    await open(page);
    await expect(page.locator('#game-root')).toHaveCSS('touch-action', 'none');
    await expect(page.locator('#game-root')).toHaveCSS('overscroll-behavior', 'none');
    const prevented = await page.evaluate(() => {
      const e = new MouseEvent('contextmenu', { cancelable: true, bubbles: true });
      document.getElementById('game-root').dispatchEvent(e);
      return e.defaultPrevented;
    });
    expect(prevented).toBe(true);
  });
});

test('deux doigts : un stick pour bouger, un stick pour viser (événements tactiles CDP)', async ({ browser, baseURL }, testInfo) => {
  test.skip(!once(null, testInfo), 'une seule fois');
  const context = await browser.newContext({ viewport: SIZE, hasTouch: true, isMobile: true, locale: 'fr-FR' });
  const page = await context.newPage();
  await page.goto(baseURL + URL());
  await waitReady(page);
  const cdp = await context.newCDPSession(page);
  const touch = (type, points) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points.map(([x, y, id]) => ({ x, y, id })) });
  const start = await state(page);
  // Doigt 1 à gauche (déplacement), doigt 2 à droite (visée), en même temps.
  await touch('touchStart', [[150, 250, 1]]);
  await touch('touchStart', [[150, 250, 1], [500, 250, 2]]);
  await touch('touchMove', [[200, 250, 1], [500, 250, 2]]);
  await touch('touchMove', [[200, 250, 1], [540, 210, 2]]);
  await expect(page.locator('#stick-left .stick-base')).toBeVisible();
  await expect(page.locator('#stick-right .stick-base')).toBeVisible();
  await expect.poll(async () => (await state(page)).player.x - start.player.x, { timeout: 30_000 }).toBeGreaterThan(10);
  await expect.poll(async () => (await state(page)).aim).toBeCloseTo(-Math.PI / 4, 1);
  // Au relâchement, la visée garde sa dernière direction et le joueur s'arrête.
  await touch('touchEnd', []);
  const stopped = await state(page);
  await page.waitForTimeout(500);
  const later = await state(page);
  expect(later.aim).toBeCloseTo(stopped.aim, 5);
  expect(later.player.x).toBeCloseTo(stopped.player.x, 0);
  await context.close();
});
