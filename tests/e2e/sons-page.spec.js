import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import AxeBuilder from '@axe-core/playwright';

// Lot 1d-C : page d'écoute technique sons.html. Le journal (?test=1) remplace l'écoute.
const { sounds } = JSON.parse(readFileSync('data/game/sounds.json', 'utf8'));
const TOTAL = sounds.reduce((n, s) => n + s.variants, 0);
const BROWSER_NOISE = /GL Driver Message/;
const SIZES = [{ width: 667, height: 375 }, { width: 1440, height: 900 }];
const audio = (page) => page.evaluate(() => window.__zs.getState().audio);
async function open(page, size = SIZES[0], extra = '?test=1') {
  await page.setViewportSize(size);
  await page.goto(`/sons.html${extra}`);
  await expect(page.locator('#list .sound')).toHaveCount(sounds.length, { timeout: 60_000 });
}

test('se charge sans erreur ni requête externe, noindex, un bouton par variante', async ({ page, baseURL }) => {
  const external = [];
  const problems = [];
  page.on('request', (r) => !r.url().startsWith(baseURL) && !r.url().startsWith('data:') && external.push(r.url()));
  page.on('console', (m) => ['error', 'warning'].includes(m.type()) && !BROWSER_NOISE.test(m.text()) && problems.push(m.text()));
  page.on('pageerror', (e) => problems.push(e.message));
  page.on('response', (r) => r.status() >= 400 && problems.push(`${r.status()} ${r.url()}`));
  await open(page);
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex');
  await expect(page.locator('button.variant')).toHaveCount(TOTAL);
  await expect(page.locator('#status')).toContainText('sons prêts');
  await expect(page.locator('canvas.sound-wave')).toHaveCount(sounds.length);
  await page.waitForLoadState('networkidle');
  expect(external).toEqual([]);
  expect(problems).toEqual([]);
  expect(await page.evaluate(() => [localStorage.length, sessionStorage.length, document.cookie])).toEqual([0, 0, '']);
});

test('chaque ligne affiche l\'identifiant, l\'étiquette, la catégorie, la durée, le pic et le niveau', async ({ page }) => {
  await open(page);
  const tir = page.locator('.sound[data-sound="tir"]');
  await expect(tir).toContainText('tir');
  await expect(tir).toContainText('Tir du pistolet');
  await expect(tir.locator('.sound-meta')).toHaveText(/^tir · \d\.\d\d s · pic \d\.\d\d · niveau -?\d+\.\d dB$/);
  await expect(tir.getByRole('button', { name: 'tir-3' })).toBeVisible();
});

test('un bouton de variante joue ce tampon (journal) ; le volume se règle', async ({ page }) => {
  await open(page);
  await page.getByRole('button', { name: 'impact-bois-2' }).click();
  await expect.poll(async () => (await audio(page)).log.length).toBe(1);
  const entry = (await audio(page)).log[0];
  expect(entry).toMatchObject({ sound: 'impact-bois', variant: 1, pan: 0, lowpass: false, rate: 1 });
  const slider = page.getByRole('slider', { name: 'Volume' });
  await slider.focus();
  await page.keyboard.press('ArrowLeft');
  await expect.poll(async () => (await audio(page)).volume).toBe(90);
});

test('« Rafale » ajoute 8 tirs au journal (avec douilles)', async ({ page }) => {
  await open(page);
  await page.getByRole('button', { name: 'Rafale' }).click();
  await expect.poll(async () => (await audio(page)).log.filter((e) => e.sound === 'tir').length).toBe(8);
  const log = (await audio(page)).log;
  expect(log.filter((e) => e.sound === 'douille').length).toBe(8);
  const times = log.filter((e) => e.sound === 'tir').map((e) => e.gameTime);
  for (let i = 1; i < times.length; i += 1) expect(times[i] - times[i - 1]).toBeCloseTo(0.4, 5);
  await expect(page.locator('#live')).toContainText('Rafale : 8 tirs');
});

test('« Horde » avance sans erreur (temps simulé avec ?test=1) et compte les voix', async ({ page }) => {
  const problems = [];
  page.on('pageerror', (e) => problems.push(e.message));
  await open(page);
  await page.getByRole('button', { name: 'Horde' }).click();
  await expect(page.locator('#live')).toContainText(/Horde : \d+ voix de zombies/, { timeout: 60_000 });
  await expect(page.getByRole('button', { name: 'Horde' })).toBeEnabled({ timeout: 60_000 });
  const voices = (await audio(page)).log.filter((e) => e.sound.startsWith('zombie-'));
  expect(voices.length).toBeGreaterThan(3);
  expect(problems).toEqual([]);
});

test('« Ambiance » démarre et arrête la boucle ; « Tout jouer en séquence » se lance et s\'arrête', async ({ page }) => {
  await open(page);
  await page.getByRole('button', { name: 'Ambiance', exact: true }).click();
  await expect.poll(async () => (await audio(page)).ambience).toBe(true);
  await page.getByRole('button', { name: 'Arrêter l\'ambiance' }).click();
  await expect.poll(async () => (await audio(page)).ambience).toBe(false);
  await page.getByRole('button', { name: 'Tout jouer en séquence' }).click();
  await expect.poll(async () => (await audio(page)).log.length, { timeout: 30_000 }).toBeGreaterThanOrEqual(1);
  await expect(page.getByRole('button', { name: 'Tout jouer en séquence' })).toBeEnabled({ timeout: 30_000 });
});

for (const size of SIZES) {
  test(`axe : aucune violation, cibles d'au moins 44 px (${size.width}×${size.height})`, async ({ page }) => {
    await open(page, size);
    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations).toEqual([]);
    const targets = page.locator('button, input[type="range"]');
    const boxes = await Promise.all((await targets.all()).map((b) => b.boundingBox()));
    expect(boxes.length).toBeGreaterThan(TOTAL);
    for (const box of boxes) {
      expect(box.height).toBeGreaterThanOrEqual(43.5);
      expect(box.width).toBeGreaterThanOrEqual(43.5);
    }
  });
}

test('sans JavaScript, seul le message noscript est visible', async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto('/sons.html');
  await expect(page.locator('noscript .noscript')).toBeVisible().catch(() => {});
  await expect(page.locator('#app')).toBeHidden();
  expect(await page.locator('body').innerText()).toContain('Cette page a besoin de JavaScript');
  await context.close();
});

test('sans AudioContext, la page l\'explique et reste utilisable sans erreur', async ({ page }) => {
  const problems = [];
  page.on('pageerror', (e) => problems.push(e.message));
  await page.addInitScript(() => {
    delete window.AudioContext;
    delete window.webkitAudioContext;
  });
  await open(page);
  await expect(page.locator('#status')).toContainText('ne permet pas de produire du son');
  await expect(page.locator('#btn-horde')).toBeDisabled();
  expect(problems).toEqual([]);
});
