import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import AxeBuilder from '@axe-core/playwright';
import { buildLayout } from '../../js/core/layout.js';
import { waitReady } from './helpers.js';

// Lot 1d : les sons se vérifient par le journal des lectures (?test=1), jamais à l'écoute ; 667×375 pour un rendu logiciel plus rapide.
const SIZE = { width: 667, height: 375 };
const URL = (extra = '') => `/jeu.html?test=1&empty=1&nospawn=1&seed=1${extra}`;
const BROWSER_NOISE = /GL Driver Message/;
const world = JSON.parse(readFileSync('data/game/world.json', 'utf8'));
const decor = JSON.parse(readFileSync('data/game/decor.json', 'utf8'));
const layout = buildLayout(world, decor, {});
const state = (page) => page.evaluate(() => window.__zs.getState());
const audio = async (page) => (await state(page)).audio;
const logOf = async (page) => (await audio(page)).log;
const step = (page, seconds) => page.evaluate((s) => window.__zs.step(s), seconds);
const gesture = (page) => page.mouse.click(40, 40); // premier geste du joueur : déverrouille l'audio

async function open(page, extra = '', size = SIZE) {
  await page.setViewportSize(size);
  await page.goto(URL(extra));
  await waitReady(page);
}
async function unlock(page) {
  await gesture(page);
  await expect.poll(async () => (await audio(page)).unlocked).toBe(true);
}

test.describe('sons : démarrage et journal', () => {
  test('aucun son n\'est demandé avant le premier geste ; l\'audio est déverrouillé ensuite', async ({ page }) => {
    await open(page);
    expect((await audio(page)).supported).toBe(true);
    expect((await audio(page)).unlocked).toBe(false);
    await page.evaluate(() => window.__zs.fire(0));
    await step(page, 1);
    expect(await logOf(page)).toEqual([]);
    await unlock(page);
    expect((await audio(page)).muted).toBe(false);
    await page.evaluate(() => window.__zs.fire(0));
    await step(page, 0.1);
    expect((await logOf(page)).some((e) => e.sound === 'tir')).toBe(true);
  });

  test('le son d\'un tir part avec la balle ; la blessure du zombie n\'est demandée qu\'à l\'impact (temps de jeu)', async ({ page }) => {
    await open(page);
    await unlock(page);
    await page.evaluate(() => window.__zs.setInput({ aim: { angle: 0 } }));
    const p = (await state(page)).player;
    const t0 = (await state(page)).time;
    await page.evaluate(([x, y]) => window.__zs.spawnEnemy(x, y), [p.x + 500, p.y]);
    await step(page, 0.1);
    let log = await logOf(page);
    const shot = log.find((e) => e.sound === 'tir');
    expect(shot).toBeDefined();
    expect(log.some((e) => e.sound === 'zombie-blessure' || e.sound === 'impact-zombie')).toBe(false); // la balle vole encore
    expect(shot.gameTime - t0).toBeLessThan(0.3);
    await step(page, 1);
    log = await logOf(page);
    const hurt = log.find((e) => e.sound === 'zombie-blessure');
    expect(hurt).toBeDefined();
    // 500 unités à 1 100 u/s : l'impact arrive au moins 0,3 s de jeu après le départ.
    expect(hurt.gameTime - shot.gameTime).toBeGreaterThan(0.3);
    expect(log.find((e) => e.sound === 'impact-zombie').gameTime).toBe(hurt.gameTime);
    expect(log.filter((e) => e.sound === 'douille').length).toBeGreaterThan(0); // pistolet lent : une douille par tir
  });

  test('une balle sur le bois, l\'étagère, la pierre et la voiture donne la bonne matière', async ({ page }) => {
    await page.setViewportSize(SIZE);
    await page.goto('/jeu.html?test=1&nospawn=1&seed=1'); // monde complet : meubles et décor
    await waitReady(page);
    await unlock(page);
    const room = world.room;
    const spot = (o) => [[o.x - 60, o.y + o.h / 2, 0], [o.x + o.w + 60, o.y + o.h / 2, Math.PI], [o.x + o.w / 2, o.y - 60, Math.PI / 2], [o.x + o.w / 2, o.y + o.h + 60, -Math.PI / 2]]
      .find(([x, y]) => x > room.x + 30 && x < room.x + room.width - 30 && y > room.y + 30 && y < room.y + room.height - 30);
    const furniture = (kind) => world.obstacles.find((o) => o.kind === kind && spot(o));
    const car = layout.decor.solids.find((o) => o.kind === 'voiture');
    const targets = [['table', 'impact-bois', furniture('table')], ['etagere', 'impact-metal', furniture('etagere')], ['colonne', 'impact-pierre', furniture('colonne')], ['voiture', 'impact-voiture', car]];
    for (const [kind, sound, o] of targets) {
      expect(o, kind).toBeDefined();
      const [x, y, angle] = o.kind === 'voiture' ? [o.x - 60, o.y + o.h / 2, 0] : spot(o);
      const before = (await logOf(page)).length;
      await page.evaluate(([px, py, a]) => {
        window.__zs.setPlayer(px, py);
        window.__zs.fire(a);
      }, [x, y, angle]);
      await step(page, 0.3);
      const added = (await logOf(page)).slice(before).map((e) => e.sound);
      expect(added, kind).toContain(sound);
    }
  });

  test('M et le bouton « Son » coupent : plus aucune lecture effective, le journal les marque', async ({ page }) => {
    await open(page);
    await unlock(page);
    await page.keyboard.press('KeyM');
    await expect.poll(async () => (await audio(page)).muted).toBe(true);
    await page.evaluate(() => window.__zs.fire(0));
    await step(page, 0.1);
    let log = await logOf(page);
    expect(log.length).toBeGreaterThan(0);
    expect(log.every((e) => e.muted === true)).toBe(true);
    expect((await audio(page)).activeVoices).toBe(0);
    await page.getByRole('button', { name: 'Pause' }).click();
    await page.getByRole('button', { name: 'Son : coupé' }).click();
    await expect.poll(async () => (await audio(page)).muted).toBe(false);
    await page.getByRole('button', { name: 'Reprendre' }).click();
    await expect(page.locator('#pause-panel')).toBeHidden();
    await page.getByRole('button', { name: 'Pause' }).click();
    await page.getByRole('button', { name: 'Son : activé' }).click();
    await expect.poll(async () => (await audio(page)).muted).toBe(true);
    log = await logOf(page);
    expect(log.length).toBeGreaterThan(0);
  });
});

test.describe('sons : volume, pause, voix', () => {
  test('le curseur « Volume » se règle au clavier et change le volume', async ({ page }) => {
    await open(page);
    await page.getByRole('button', { name: 'Pause' }).click();
    const slider = page.getByRole('slider', { name: 'Volume' });
    await expect(slider).toBeVisible();
    expect((await audio(page)).volume).toBe(100);
    await slider.focus();
    await page.keyboard.press('ArrowLeft');
    await expect.poll(async () => (await audio(page)).volume).toBe(90);
    await page.keyboard.press('End');
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('ArrowLeft');
    await expect.poll(async () => (await audio(page)).volume).toBe(80);
    await expect(slider).toHaveAttribute('aria-valuetext', '80 %');
    await expect(page.locator('#volume-value')).toHaveText('80 %');
  });

  test('le curseur « Volume » se règle aussi au doigt', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile', 'écran tactile');
    await page.setViewportSize(SIZE);
    await page.goto(URL());
    await waitReady(page);
    await page.getByRole('button', { name: 'Pause' }).click();
    const slider = page.locator('#volume');
    const box = await slider.boundingBox();
    expect(box.height).toBeGreaterThanOrEqual(43.5);
    await page.touchscreen.tap(box.x + box.width * 0.5, box.y + box.height / 2);
    await expect.poll(async () => (await audio(page)).volume).toBeLessThan(70);
    await expect.poll(async () => (await audio(page)).volume).toBeGreaterThan(30);
  });

  test('la pause suspend le son : aucune entrée tant qu\'elle dure, reprise ensuite', async ({ page }) => {
    await open(page);
    await unlock(page);
    await page.getByRole('button', { name: 'Pause' }).click();
    await expect.poll(async () => (await audio(page)).suspended).toBe(true);
    const before = (await logOf(page)).length;
    await page.evaluate(() => window.__zs.fire(0));
    await step(page, 1);
    expect((await logOf(page)).length).toBe(before);
    await page.getByRole('button', { name: 'Reprendre' }).click();
    await expect.poll(async () => (await audio(page)).suspended).toBe(false);
    await page.evaluate(() => window.__zs.fire(0));
    await step(page, 0.1);
    expect((await logOf(page)).length).toBeGreaterThan(before);
  });

  test('au plus 16 voix actives pendant une rafale', async ({ page }) => {
    await open(page);
    await unlock(page);
    let max = 0;
    for (let i = 0; i < 12; i += 1) {
      await page.evaluate(() => {
        for (let k = 0; k < 6; k += 1) window.__zs.fire(k * 0.05);
        window.__zs.step(0.3);
      });
      max = Math.max(max, (await audio(page)).activeVoices);
    }
    expect(max).toBeLessThanOrEqual(16);
  });

  test('le journal est borné à 200 entrées', async ({ page }) => {
    await open(page);
    await unlock(page);
    for (let i = 0; i < 80; i += 1) await page.evaluate(() => {
      window.__zs.fire(0);
      window.__zs.step(0.5);
    });
    expect((await logOf(page)).length).toBeLessThanOrEqual(200);
  });
});

test.describe('sons : chargement, confidentialité, robustesse', () => {
  test('l\'écran de préparation couvre textures et sons, puis disparaît ; les tampons essentiels sont prêts', async ({ page }) => {
    await page.setViewportSize(SIZE);
    await page.goto(URL(), { waitUntil: 'commit' });
    await expect(page.locator('#loading-text')).toContainText('décor et des sons');
    await waitReady(page);
    await expect(page.locator('#loading')).toBeHidden();
    const a = await audio(page);
    expect(a.buffers).toBeGreaterThanOrEqual(34);
    expect(a.essentialMs).toBeGreaterThan(0);
    expect(a.bytes).toBeGreaterThan(1_000_000);
  });

  test('aucune requête réseau pour un son, console propre, rien dans localStorage, sessionStorage ni cookies', async ({ page, baseURL, context }) => {
    const urls = [];
    const problems = [];
    page.on('request', (r) => urls.push(r.url()));
    page.on('console', (m) => ['error', 'warning'].includes(m.type()) && !BROWSER_NOISE.test(m.text()) && problems.push(m.text()));
    page.on('pageerror', (e) => problems.push(e.message));
    await open(page);
    await unlock(page);
    await page.evaluate(() => {
      window.__zs.fire(0);
      window.__zs.step(1);
    });
    await page.getByRole('button', { name: 'Pause' }).click();
    await page.waitForLoadState('networkidle');
    expect(urls.filter((u) => !u.startsWith(baseURL) && !u.startsWith('data:') && !u.startsWith('blob:'))).toEqual([]);
    expect(urls.filter((u) => /\.(wav|mp3|ogg|m4a|flac|webm|aac)(\?|$)/i.test(u))).toEqual([]);
    expect(problems).toEqual([]);
    expect(await page.evaluate(() => [localStorage.length, sessionStorage.length, document.cookie])).toEqual([0, 0, '']);
    expect(await context.cookies()).toEqual([]);
  });

  test('si AudioContext est absent, le jeu fonctionne sans erreur et le panneau n\'offre ni son ni volume', async ({ page }) => {
    const problems = [];
    page.on('pageerror', (e) => problems.push(e.message));
    page.on('console', (m) => m.type() === 'error' && !BROWSER_NOISE.test(m.text()) && problems.push(m.text()));
    await page.addInitScript(() => {
      delete window.AudioContext;
      delete window.webkitAudioContext;
    });
    await open(page);
    await gesture(page);
    expect((await audio(page)).supported).toBe(false);
    await page.evaluate(() => window.__zs.fire(0));
    await step(page, 1);
    expect((await audio(page)).unlocked).toBe(false);
    await page.getByRole('button', { name: 'Pause' }).click();
    await expect(page.locator('#btn-sound')).toBeHidden();
    await expect(page.locator('#volume-row')).toBeHidden();
    expect(problems).toEqual([]);
  });

  test('si AudioContext refuse de se créer, le jeu continue sans erreur', async ({ page }) => {
    const problems = [];
    page.on('pageerror', (e) => problems.push(e.message));
    await page.addInitScript(() => {
      window.AudioContext = function Refuse() {
        throw new Error('refusé');
      };
      delete window.webkitAudioContext;
    });
    await open(page);
    await gesture(page);
    await page.evaluate(() => window.__zs.fire(0));
    await step(page, 1);
    expect((await audio(page)).unlocked).toBe(false);
    expect((await state(page)).time).toBeGreaterThan(0.9);
    expect(problems).toEqual([]);
  });

  test('?fps=1 affiche la ligne « Sons : »', async ({ page }) => {
    await open(page, '&fps=1');
    await expect(page.locator('#fps-counter')).toContainText('Sons :');
    await expect(page.locator('#fps-counter')).toContainText('(essentiels)');
    await expect(page.locator('#fps-counter')).toContainText('voix :');
  });

  for (const size of [SIZE, { width: 1440, height: 900 }]) {
    test(`axe : aucune violation sur le panneau de pause avec le curseur (${size.width}×${size.height})`, async ({ page }) => {
      await open(page, size.width > 1000 ? '&dpr=1' : '', size);
      await page.getByRole('button', { name: 'Pause' }).click();
      await expect(page.locator('#volume')).toBeVisible();
      for (const box of await Promise.all((await page.locator('#pause-panel button:not([hidden]), #volume').all()).map((b) => b.boundingBox()))) {
        expect(box.height).toBeGreaterThanOrEqual(43.5);
        expect(box.y + box.height).toBeLessThanOrEqual(size.height);
      }
      const results = await new AxeBuilder({ page }).analyze();
      expect(results.violations).toEqual([]);
    });
  }
});

test('téléphone : une invitation à activer le son s\'affiche tant que l\'audio n\'est pas lancé, puis disparaît au toucher', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile', 'écran tactile');
  await open(page);
  const hint = page.getByRole('button', { name: 'Touche ici pour activer le son' });
  await expect(hint).toBeVisible({ timeout: 10_000 });
  const box = await hint.boundingBox();
  expect(box.height).toBeGreaterThanOrEqual(43.5);
  await hint.click();
  await expect.poll(async () => (await audio(page)).unlocked).toBe(true);
  await expect(hint).toBeHidden();
});
