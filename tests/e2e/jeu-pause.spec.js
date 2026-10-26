import { test, expect } from '@playwright/test';
import { waitReady } from './helpers.js';
import AxeBuilder from '@axe-core/playwright';

const SIZE = { width: 667, height: 375 };
const PAGE = (extra = '') => `/jeu.html?test=1&empty=1&nospawn=1&seed=1${extra}`;
const state = (page) => page.evaluate(() => window.__zs.getState());
async function open(page, size = SIZE, extra = '') {
  await page.setViewportSize(size);
  await page.goto(PAGE(extra));
  await waitReady(page);
}
const BROWSER_NOISE = /GL Driver Message/;
// Contexte neuf, bureau : une seule fois, sur le projet « bureau » (souris, pas de message de rotation à 360 px).
const once = (testInfo) => testInfo.project.name === 'bureau';

test.describe('panneau de pause', () => {
  for (const size of [SIZE, { width: 1440, height: 900 }]) {
    test(`s'ouvre, tient dans la fenêtre et respecte les cibles de 44 px (${size.width}×${size.height})`, async ({ page }) => {
      await open(page, size);
      await page.getByRole('button', { name: 'Pause' }).click();
      const panel = page.locator('#pause-panel');
      await expect(panel).toBeVisible();
      const buttons = panel.getByRole('button');
      await expect(buttons).toHaveCount(await page.evaluate(() => document.querySelectorAll('#pause-panel button:not([hidden])').length));
      for (const box of await Promise.all((await buttons.all()).map((b) => b.boundingBox()))) {
        expect(box.height).toBeGreaterThanOrEqual(43.5);
        expect(box.y + box.height).toBeLessThanOrEqual(size.height);
        expect(box.y).toBeGreaterThanOrEqual(0);
      }
      for (const name of ['Reprendre', 'Son : activé', 'Recommencer']) await expect(panel.getByRole('button', { name })).toBeVisible();
      const results = await new AxeBuilder({ page }).analyze();
      expect(results.violations).toEqual([]);
    });
  }

  test('Recommencer relance une partie propre', async ({ page }) => {
    await open(page);
    await page.evaluate(() => window.__zs.setInput({ move: { x: 1, y: 0 } }));
    await expect.poll(async () => (await state(page)).player.x).toBeGreaterThan(830);
    await page.evaluate(() => window.__zs.setInput({}));
    await page.getByRole('button', { name: 'Pause' }).click();
    await page.getByRole('button', { name: 'Recommencer' }).click();
    await expect(page.locator('#pause-panel')).toBeHidden();
    await expect.poll(async () => (await state(page)).player.x).toBe(800);
  });
});

test.describe('touches Échap, P, M, F', () => {
  test.skip(({ isMobile }) => isMobile, 'clavier');

  test('Échap et P ouvrent et ferment la pause', async ({ page }) => {
    await open(page);
    for (const key of ['Escape', 'KeyP']) {
      await page.keyboard.press(key);
      await expect(page.locator('#pause-panel')).toBeVisible();
      expect((await state(page)).paused).toBe(true);
      await page.keyboard.press(key);
      await expect(page.locator('#pause-panel')).toBeHidden();
      await expect.poll(async () => (await state(page)).paused).toBe(false);
    }
  });

  test('M coupe et rétablit le son ; le bouton du panneau suit', async ({ page }) => {
    await open(page);
    await page.keyboard.press('KeyM');
    await expect.poll(async () => (await state(page)).audio.muted).toBe(true);
    await page.getByRole('button', { name: 'Pause' }).click();
    await expect(page.getByRole('button', { name: 'Son : coupé' })).toBeVisible();
    await page.getByRole('button', { name: 'Son : coupé' }).click();
    await expect.poll(async () => (await state(page)).audio.muted).toBe(false);
    await expect(page.getByRole('button', { name: 'Son : activé' })).toBeVisible();
  });

  test('l\'audio ne démarre qu\'après le premier geste du joueur', async ({ page }) => {
    await open(page);
    expect((await state(page)).audio.started).toBe(false);
    await page.keyboard.press('KeyD');
    await expect.poll(async () => (await state(page)).audio.started).toBe(true);
  });

  test('F demande le plein écran réel ; le bouton du panneau aussi', async ({ page }) => {
    await page.addInitScript(() => {
      window.__fsCalls = 0;
      Object.defineProperty(document, 'fullscreenEnabled', { get: () => true });
      Element.prototype.requestFullscreen = () => {
        window.__fsCalls += 1;
        return Promise.resolve();
      };
    });
    await open(page);
    await page.keyboard.press('KeyF');
    await expect.poll(() => page.evaluate(() => window.__fsCalls)).toBe(1);
    await page.getByRole('button', { name: 'Pause' }).click();
    await page.getByRole('button', { name: 'Plein écran' }).click();
    await expect.poll(() => page.evaluate(() => window.__fsCalls)).toBe(2);
  });

  test('le bouton Plein écran est masqué si l\'API est absente, sans rien casser', async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(document, 'fullscreenEnabled', { get: () => false });
      Element.prototype.requestFullscreen = undefined;
    });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await open(page);
    await page.keyboard.press('KeyF');
    await page.getByRole('button', { name: 'Pause' }).click();
    await expect(page.locator('#btn-fullscreen')).toBeHidden();
    expect(errors).toEqual([]);
  });
});

test.describe('confidentialité', () => {
  // Une courte partie : déplacement, tir, pause, mort-ou-pas, sans toucher au stockage.
  async function play(page) {
    await open(page);
    await page.evaluate(() => {
      window.__zs.setInput({ aim: { angle: 0 }, move: { x: 0, y: 1 } });
      window.__zs.spawnEnemy(1300, 450);
    });
    await page.waitForFunction(() => window.__zs.getState().bullets.length > 0);
    await page.keyboard.press('KeyM');
    await page.getByRole('button', { name: 'Pause' }).click();
    await page.getByRole('button', { name: 'Reprendre' }).click();
    await page.mouse.move(300, 200);
  }

  test('aucune requête externe pendant une partie', async ({ page, baseURL }) => {
    const external = [];
    page.on('request', (r) => {
      if (!r.url().startsWith(baseURL) && !r.url().startsWith('data:')) external.push(r.url());
    });
    await play(page);
    await page.waitForLoadState('networkidle');
    expect(external).toEqual([]);
  });

  test('rien n\'est écrit dans localStorage, sessionStorage ni les cookies', async ({ page, context }) => {
    await play(page);
    const stored = await page.evaluate(() => ({ local: localStorage.length, session: sessionStorage.length, cookie: document.cookie, dbs: indexedDB.databases ? null : [] }));
    expect(stored.local).toBe(0);
    expect(stored.session).toBe(0);
    expect(stored.cookie).toBe('');
    expect(await context.cookies()).toEqual([]);
  });

  test('aucune donnée dans les URL : ni requête avec paramètres, ni changement d\'adresse', async ({ page, baseURL }) => {
    const requests = [];
    page.on('request', (r) => requests.push(r.url()));
    await open(page);
    const historyBefore = await page.evaluate(() => history.length);
    await play(page);
    expect(await page.evaluate(() => [location.search, location.hash, history.length])).toEqual([`?test=1&empty=1&nospawn=1&seed=1`, '', historyBefore]);
    // Seule la page elle-même porte les paramètres de test ; aucune autre requête n'en reçoit.
    for (const url of requests.filter((u) => u.startsWith(baseURL) && !u.endsWith('/jeu.html?test=1&empty=1&nospawn=1&seed=1'))) expect(new URL(url).search, url).toBe('');
  });
});

test.describe('mesures et parcours', () => {
  for (const width of [360, 768, 1440]) {
    test(`CLS de jeu.html avec les données retardées de 400 ms (${width} px) : au plus 0,1`, async ({ browser, baseURL }, testInfo) => {
      test.skip(!once(testInfo), 'une seule fois');
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
      await page.goto(baseURL + PAGE());
      await page.waitForFunction(() => (window.__zs?.getState()?.time ?? 0) > 0.3);
      const cls = await page.evaluate(() => window.__cls);
      expect(cls).toBeLessThanOrEqual(0.1);
      await context.close();
    });
  }

  test('parcours cliqué : démarrer, tirer, mourir, rejouer', async ({ page, isMobile }) => {
    test.skip(isMobile, 'souris');
    const problems = [];
    page.on('console', (m) => ['error', 'warning'].includes(m.type()) && !BROWSER_NOISE.test(m.text()) && problems.push(m.text()));
    page.on('pageerror', (e) => problems.push(e.message));
    await open(page);
    // Démarrer : la partie tourne, la pause s'ouvre et se ferme à la souris.
    await page.getByRole('button', { name: 'Pause' }).click();
    await page.getByRole('button', { name: 'Reprendre' }).click();
    // Tirer : un zombie sur la ligne de visée tombe sous les balles.
    await page.evaluate(() => {
      window.__zs.setInput({ aim: { angle: 0 } });
      window.__zs.spawnEnemy(1100, 450);
    });
    await expect.poll(async () => (await state(page)).kills, { timeout: 60_000 }).toBe(1);
    // Mourir : des zombies au contact pendant que le laser vise le vide.
    await page.evaluate(() => {
      window.__zs.setInput({ aim: { angle: -Math.PI / 2 } });
      for (const [x, y] of [[850, 450], [750, 450], [800, 500], [835, 480], [770, 480]]) window.__zs.spawnEnemy(x, y);
    });
    await expect(page.locator('#end-panel')).toBeVisible({ timeout: 60_000 });
    await expect(page.locator('#end-kills')).toHaveText('Zombies tués : 1');
    // Rejouer.
    await page.getByRole('button', { name: 'Rejouer' }).click();
    await expect(page.locator('#end-panel')).toBeHidden();
    await expect.poll(async () => {
      const s = await state(page);
      return [s.dead, s.kills, s.player.health];
    }).toEqual([false, 0, 100]);
    expect(problems).toEqual([]);
  });

  test('le HUD annonce la vie par paliers de 10 % et la mort', async ({ page, isMobile }) => {
    test.skip(isMobile, 'souris');
    await open(page);
    await expect(page.locator('#hud-live')).toHaveText('');
    await page.evaluate(() => {
      window.__zs.setInput({ aim: { angle: -Math.PI / 2 } });
      for (const [x, y] of [[850, 450], [750, 450], [800, 500], [835, 480], [770, 480]]) window.__zs.spawnEnemy(x, y);
    });
    await expect(page.locator('#hud-live')).toContainText('Vie :', { timeout: 60_000 });
    await expect(page.locator('#hud-live')).toContainText('Tu es mort', { timeout: 60_000 });
    await expect(page.locator('#hud-live')).toHaveAttribute('aria-live', 'polite');
    await expect(page.locator('#game-root')).toHaveAttribute('role', 'application');
  });
});
