import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { waitReady } from './helpers.js';

// Lot 3i-C : sons nouveaux sur leur événement, boucles d'ambiance (une voix, pause, mort, « Rejouer »), réparation à durée variable,
// limite de voix. Journal des lectures (?test=1), 667×375, temps de jeu (step) ; aucun son écouté.
// Lancement : E2E_FULL=1 npx playwright test tests/e2e/sons-integres-ambiances.spec.js
const SIZE = { width: 667, height: 375 };
const BROWSER_NOISE = /GL Driver Message|ReadPixels|GPU stall/;
const audioCfg = JSON.parse(readFileSync('data/game/audio.json', 'utf8'));
const state = (page) => page.evaluate(() => window.__zs.getState());
const audio = async (page) => (await state(page)).audio;
const step = (page, s) => page.evaluate((x) => window.__zs.step(x), s);
const emit = (page, events) => page.evaluate((e) => window.__zs.audioEvent(e), events);

async function open(page, url) {
  await page.setViewportSize(SIZE);
  await page.goto(url);
  await waitReady(page);
}
async function unlockReady(page) {
  await page.mouse.click(40, 40);
  await expect.poll(async () => (await audio(page)).unlocked).toBe(true);
  await expect.poll(async () => (await audio(page)).ready, { timeout: 60_000 }).toBe(true);
}

test.describe('limite de voix et hygiène', () => {
  test('meute de 10 zombies pendant 12 s de jeu : jamais plus de maxVoices voix ; console propre', async ({ page }) => {
    test.setTimeout(150_000); // rendu logiciel : 10 zombies à l'écran
    const problems = [];
    page.on('console', (m) => ['error', 'warning'].includes(m.type()) && !BROWSER_NOISE.test(m.text()) && problems.push(m.text()));
    page.on('pageerror', (e) => problems.push(e.message));
    await open(page, '/jeu.html?test=1&empty=1&nospawn=1&seed=1');
    await unlockReady(page);
    const p = (await state(page)).player;
    const gaits = ['lent', 'marche', 'course', 'rampe'];
    await page.evaluate(([x, y, g]) => {
      for (let k = 0; k < 10; k += 1) window.__zs.spawnEnemy(x + Math.cos(k) * (250 + 20 * k), y + Math.sin(k) * (250 + 20 * k), { gait: g[k % 4] });
    }, [p.x, p.y, gaits]);
    let max = 0;
    for (let i = 0; i < 24; i += 1) {
      await emit(page, [{ type: 'playerVitals', health: 0.2, state: 'debout' }]);
      await step(page, 0.5);
      max = Math.max(max, (await audio(page)).activeVoices);
    }
    expect(max).toBeLessThanOrEqual(audioCfg.maxVoices);
    const log = (await audio(page)).log;
    expect(log.some((e) => /^pas-zombie|^zombie-rampe/.test(e.sound))).toBe(true);
    expect(problems).toEqual([]);
  });

});
