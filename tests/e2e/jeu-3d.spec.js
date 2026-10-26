import { test, expect } from '@playwright/test';
import { projectGround } from '../../js/core/viewport.js';
import { expectedDistance, waitReady } from './helpers.js';

// Rendu 3D du lot 1m : couverture du canvas, HUD en HTML, poses, inclinaisons, salle entière. Petite fenêtre de préférence :
// le rendu logiciel du navigateur de test y est plus rapide. Les tests se désactivent seuls si WebGL manque.
const URL = (extra = '') => `/jeu.html?test=1&nospawn=1&seed=1${extra}`;
const state = (page) => page.evaluate(() => window.__zs.getState());
async function open(page, size, extra = '') {
  await page.setViewportSize(size);
  await page.goto(URL(extra));
  await waitReady(page);
}

test.describe('canvas plein écran', () => {
  test.skip(({ isMobile }) => isMobile, 'mesures de bureau');

  for (const [w, h] of [[667, 375], [1440, 900], [1920, 1080], [2560, 1080]]) {
    test(`le canvas couvre la fenêtre à 1 pixel près à ${w}×${h}, sans défilement`, async ({ page }) => {
      await open(page, { width: w, height: h });
      await expect.poll(() => page.evaluate(() => {
        const r = document.querySelector('#game-canvas canvas').getBoundingClientRect();
        return [Math.abs(r.width - innerWidth) <= 1, Math.abs(r.height - innerHeight) <= 1, r.x, r.y,
          document.documentElement.scrollWidth - document.documentElement.clientWidth, document.documentElement.scrollHeight - document.documentElement.clientHeight];
      })).toEqual([true, true, 0, 0, 0, 0]);
    });
  }

  test('le canvas, la caméra et la visée suivent un redimensionnement', async ({ page }) => {
    await open(page, { width: 667, height: 375 });
    for (const [w, h] of [[900, 600], [1440, 900], [800, 1200]]) {
      await page.setViewportSize({ width: w, height: h });
      await expect.poll(async () => (await state(page)).camera.distance).toBeCloseTo(expectedDistance(w / h, 75), 3);
      const b = await page.evaluate(() => {
        const r = document.querySelector('#game-canvas canvas').getBoundingClientRect();
        return { w: Math.round(r.width), h: Math.round(r.height) };
      });
      expect(b).toEqual({ w, h });
      // La souris sur le joueur, projeté avec la nouvelle caméra : la visée reste juste (point du sol recalculé à chaque image).
      const s = await state(page);
      const p = projectGround(s.player.x + 200 - s.camera.target.x, s.player.y - s.camera.target.y, s.camera.distance, s.camera.tilt, 40, w / h);
      await page.mouse.move(((p.x + 1) / 2) * w, ((1 - p.y) / 2) * h);
      await expect.poll(async () => Math.abs((await state(page)).aim)).toBeLessThan(0.03);
    }
  });

  test('?dpr=1 plafonne la résolution à 1 pixel par pixel CSS', async ({ page }) => {
    await open(page, { width: 667, height: 375 }, '&dpr=1');
    expect(await page.evaluate(() => { const c = document.querySelector('#game-canvas canvas'); return [c.width, c.height]; })).toEqual([667, 375]);
  });
});

test('à ?zoom=1, toute la zone de jeu est visible, sans défilement, dans les fenêtres listées', async ({ page, isMobile }) => {
  test.skip(isMobile, 'mesures de bureau');
  await open(page, { width: 667, height: 375 }, '&zoom=1');
  for (const [w, h] of [[667, 375], [768, 1024], [1440, 900], [1920, 1080], [2560, 1080], [800, 1200], [100, 100]]) {
    await page.setViewportSize({ width: w, height: h });
    await expect.poll(async () => (await state(page)).camera.distance).toBeCloseTo(expectedDistance(w / h, 75, 1), 3);
    const { camera } = await state(page);
    // Zone de jeu : face intérieure des murs (24 de chaque côté), toujours entièrement à l'écran.
    for (const [x, y] of [[24, 24], [1576, 24], [24, 876], [1576, 876]]) {
      const p = projectGround(x - camera.target.x, y - camera.target.y, camera.distance, camera.tilt, 40, w / h);
      expect(Math.abs(p.x), `${w}×${h} coin ${x},${y}`).toBeLessThanOrEqual(1);
      expect(Math.abs(p.y), `${w}×${h} coin ${x},${y}`).toBeLessThanOrEqual(1);
    }
  }
});

test.describe('HUD HTML (E2-2) et marges', () => {
  test.skip(({ isMobile }) => isMobile, 'mesures de bureau');

  for (const [w, h] of [[667, 375], [1440, 900]]) {
    test(`le HUD, le bouton Pause et le texte restent à 16 px au moins des bords (${w}×${h})`, async ({ page }) => {
      await open(page, { width: w, height: h });
      const boxes = await page.evaluate(() => ['#hud', '#btn-pause'].map((sel) => {
        const r = document.querySelector(sel).getBoundingClientRect();
        return { sel, left: r.left, top: r.top, right: innerWidth - r.right, bottom: innerHeight - r.bottom, width: r.width, height: r.height };
      }));
      for (const b of boxes) {
        expect(b.width, b.sel).toBeGreaterThan(0);
        for (const side of ['left', 'top', 'right', 'bottom']) expect(b[side], `${b.sel} ${side}`).toBeGreaterThanOrEqual(16);
      }
      await expect(page.locator('#hud-life')).toHaveText('Vie 100/100');
      await expect(page.locator('#hud-kills')).toHaveText('Zombies tués : 0');
      await expect(page.locator('#hud')).toHaveAttribute('data-block', 'E2-2');
    });
  }

  test('le HUD suit la vie et les zombies tués, et l\'ordre du HTML est l\'ordre à l\'écran', async ({ page }) => {
    await open(page, { width: 667, height: 375 });
    await page.evaluate(() => { window.__zs.setInput({ aim: { angle: 0 } }); window.__zs.spawnEnemy(1100, 450); });
    await expect(page.locator('#hud-kills')).toHaveText('Zombies tués : 1', { timeout: 60_000 });
    const order = await page.evaluate(() => [...document.querySelectorAll('#game-root [data-block]')].map((el) => el.dataset.block));
    expect(order).toEqual(['E2-2', 'E2-5', 'E2-3', 'E2-4']);
    const [hud, pause] = await page.evaluate(() => ['#hud', '#btn-pause'].map((s) => document.querySelector(s).getBoundingClientRect().left));
    expect(hud).toBeLessThan(pause);
  });

  test('les zones de sécurité sont publiées en variables CSS (pixels, zéro sans encoche)', async ({ page }) => {
    await open(page, { width: 667, height: 375 });
    const vars = await page.evaluate(() => ['top', 'right', 'bottom', 'left'].map((s) => document.documentElement.style.getPropertyValue(`--safe-${s}`)));
    expect(vars).toEqual(['0px', '0px', '0px', '0px']);
  });
});

test.describe('personnages et poses', () => {
  test.skip(({ isMobile }) => isMobile, 'clavier');

  test('les angles du joueur changent quand il marche et reviennent à zéro à l\'arrêt', async ({ page }) => {
    await open(page, { width: 667, height: 375 });
    const rest = (await state(page)).pose;
    expect(Math.abs(rest.hipL)).toBeLessThan(1e-6);
    expect(Math.abs(rest.hipR)).toBeLessThan(1e-6);
    await page.keyboard.down('KeyD');
    await expect.poll(async () => {
      const pose = (await state(page)).pose;
      return Math.max(Math.abs(pose.hipL), Math.abs(pose.hipR));
    }, { timeout: 30_000 }).toBeGreaterThan(0.2);
    const walking = (await state(page)).pose;
    // Les angles réellement posés sur les articulations sont ceux de computePose.
    for (const joint of ['hipL', 'hipR', 'kneeL', 'kneeR', 'shoulderL', 'shoulderR', 'elbowL', 'elbowR']) {
      expect(walking[joint], joint).toBeCloseTo(walking.expected[joint], 6);
    }
    await page.keyboard.up('KeyD');
    await expect.poll(async () => Math.max(Math.abs((await state(page)).pose.hipL), Math.abs((await state(page)).pose.hipR)), { timeout: 30_000 }).toBeLessThan(1e-6);
  });

  test('un zombie du jeu est dessiné : le nombre d\'appels de dessin augmente avec lui', async ({ page }) => {
    await open(page, { width: 667, height: 375 });
    const before = (await state(page)).render;
    await page.evaluate(() => window.__zs.spawnEnemy(900, 520));
    await expect.poll(async () => (await state(page)).render.calls).toBeGreaterThan(before.calls);
    expect((await state(page)).render.triangles).toBeGreaterThan(before.triangles);
  });

  test('?shadows=0 retire la passe d\'ombres (moins d\'appels de dessin)', async ({ page }) => {
    await open(page, { width: 667, height: 375 });
    const withShadows = (await state(page)).render.calls;
    await page.goto(URL('&shadows=0'));
    await waitReady(page);
    await expect.poll(async () => (await state(page)).render.calls).toBeLessThan(withShadows);
  });
});

test.describe('inclinaison de la caméra', () => {
  for (const tilt of [60, 75, 90]) {
    test(`?tilt=${tilt} règle l'inclinaison exposée par getState()`, async ({ page, isMobile }) => {
      test.skip(isMobile, 'mesures de bureau');
      await open(page, { width: 667, height: 375 }, `&tilt=${tilt}`);
      const { camera } = await state(page);
      expect(camera.tilt).toBe(tilt);
      expect(camera.distance).toBeCloseTo(expectedDistance(667 / 375, tilt), 3);
      // La caméra est au sud de la cible (z plus grand), plus haute quand l'inclinaison augmente.
      expect(camera.x).toBeCloseTo(camera.target.x, 3);
      expect(camera.y).toBeCloseTo(camera.distance * Math.sin((tilt * Math.PI) / 180), 3);
      expect(camera.z).toBeCloseTo(camera.target.y + camera.distance * Math.cos((tilt * Math.PI) / 180), 3);
    });
  }

  test('une valeur inconnue de ?tilt est ignorée (75°)', async ({ page, isMobile }) => {
    test.skip(isMobile, 'mesures de bureau');
    await open(page, { width: 667, height: 375 }, '&tilt=45');
    expect((await state(page)).camera.tilt).toBe(75);
  });
});

test.describe('caméra qui suit le joueur et ?zoom=', () => {
  test.skip(({ isMobile }) => isMobile, 'mesures de bureau');

  test('par défaut, la caméra est deux fois plus proche que la vue de toute la zone et suit le joueur', async ({ page }) => {
    await open(page, { width: 667, height: 375 });
    const first = (await state(page)).camera;
    expect(first.zoom).toBe(2);
    expect(first.distance).toBeCloseTo(expectedDistance(667 / 375, 75, 1) / 2, 3);
    expect(first.target.x).toBeCloseTo(800, 1);
    await page.evaluate(() => window.__zs.setInput({ move: { x: 1, y: 0 } }));
    await expect.poll(async () => (await state(page)).camera.target.x, { timeout: 30_000 }).toBeGreaterThan(900);
    const { camera, player } = await state(page);
    // La caméra reste derrière le joueur (lissage) mais le suit de près.
    expect(Math.abs(camera.target.x - player.x)).toBeLessThan(120);
    expect(camera.x).toBeCloseTo(camera.target.x, 3);
  });

  test('la caméra ne montre pas plus que la salle et ses abords : elle s\'arrête près du mur', async ({ page }) => {
    test.setTimeout(90_000);
    await open(page, { width: 667, height: 375 });
    await page.evaluate(() => window.__zs.setInput({ move: { x: 1, y: 1 } }));
    await expect.poll(async () => (await state(page)).player.x, { timeout: 80_000 }).toBeGreaterThan(1550);
    await page.waitForTimeout(1500);
    const { camera } = await state(page);
    expect(camera.target.x).toBeLessThan(1600 - 150);
    expect(camera.target.x).toBeGreaterThan(900);
  });

  for (const zoom of [1, 1.25, 1.5, 2, 2.5, 3]) {
    test(`?zoom=${zoom} règle la distance : ajustement ÷ ${zoom}`, async ({ page }) => {
      await open(page, { width: 667, height: 375 }, `&zoom=${zoom}`);
      const { camera } = await state(page);
      expect(camera.zoom).toBe(zoom);
      expect(camera.distance).toBeCloseTo(expectedDistance(667 / 375, 75, zoom), 3);
    });
  }

  test('une valeur inconnue de ?zoom est ignorée (2, valeur par défaut)', async ({ page }) => {
    await open(page, { width: 667, height: 375 }, '&zoom=3.5');
    expect((await state(page)).camera.zoom).toBe(2);
  });
});
