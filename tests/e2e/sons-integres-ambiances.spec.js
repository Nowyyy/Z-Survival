import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { waitReady, salle } from './helpers.js';

// Lot 3i-C : sons nouveaux sur leur événement, boucles d'ambiance (une voix, pause, mort, « Rejouer »), réparation à durée variable,
// limite de voix. Journal des lectures (?test=1), 667×375, temps de jeu (step) ; aucun son écouté.
// Lancement : E2E_FULL=1 npx playwright test tests/e2e/sons-integres-ambiances.spec.js
const SIZE = { width: 667, height: 375 };
const BROWSER_NOISE = /GL Driver Message|ReadPixels|GPU stall/;
const { sounds } = JSON.parse(readFileSync('data/game/sounds.json', 'utf8'));
const audioCfg = JSON.parse(readFileSync('data/game/audio.json', 'utf8'));
const byId = new Map(sounds.map((s) => [s.id, s]));
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
const near = async (page) => {
  const p = (await state(page)).player;
  return { x: p.x + 20, y: p.y };
};
const added = async (page, events, seconds = 0.3) => {
  const before = (await audio(page)).log.length;
  await emit(page, events);
  await step(page, seconds);
  return (await audio(page)).log.slice(before).filter((e) => !e.loop);
};

test.describe('sons nouveaux sur leur événement', () => {
  test('chaque son nouveau se joue sur son événement, sous son identifiant, avec son tampon', async ({ page }) => {
    await open(page, '/jeu.html?test=1&empty=1&nospawn=1&seed=1');
    await unlockReady(page);
    const p = await near(page);
    const cases = [
      [[{ type: 'playerStep', foot: 'gauche', volume: 1, surface: 'exterieur' }], 'pas-exterieur'],
      [[{ type: 'playerStep', foot: 'droit', volume: 1, surface: 'escalier' }], 'pas-escalier'],
      [[{ type: 'windowOpen', ...p, windowId: 'F' }], 'planche-craquement'],
      [[{ type: 'zombieClimb', ...p, windowId: 'F' }], 'zombie-escalade'],
      [[{ type: 'doorSink', ...p, door: 'porte-1' }], 'porte-enfoncee'],
      [[{ type: 'playerVitals', health: 0.2, state: 'debout' }], 'joueur-coeur'],
      [[{ type: 'waveEnd', variant: 0 }], 'ambiance-lointains'],
    ];
    for (const [events, sound] of cases) {
      await added(page, events, 0.4);
      // Sons de priorité 2 : calculés au premier usage, joués dès que le tampon arrive (temps réel du calculateur).
      await expect.poll(async () => (await audio(page)).log.some((x) => x.sound === sound), { message: sound }).toBe(true);
      const e = (await audio(page)).log.find((x) => x.sound === sound);
      expect(e.buffer).toMatch(new RegExp(`^${sound}-\\d$`));
    }
  });

  test('et pas ailleurs : pas d\'intérieur, vie haute, planche arrachée sans fenêtre ouverte, fin de manche du pack d\'avant', async ({ page }) => {
    await open(page, '/jeu.html?test=1&empty=1&nospawn=1&seed=1');
    await unlockReady(page);
    const p = await near(page);
    const log = await added(page, [{ type: 'playerStep', foot: 'gauche', volume: 1, surface: 'dur' }, { type: 'playerVitals', health: 0.9, state: 'debout' }, { type: 'plankTorn', ...p, windowId: 'G' }], 0.4);
    const ids = log.map((e) => e.sound);
    expect(ids).toContain('pas');
    expect(ids).toContain('planche-arrachee');
    for (const id of ['pas-exterieur', 'pas-escalier', 'joueur-coeur', 'planche-craquement']) expect(ids).not.toContain(id);
  });

  test('en jeu : la dernière planche arrachée fait craquer la fenêtre (une seule fois)', async ({ page }) => {
    await open(page, salle('/jeu.html?test=1&nospawn=1&seed=1'));
    await unlockReady(page);
    await page.evaluate(() => window.__zs.setPlanks('fenetre-nord', 1));
    const id = await page.evaluate(() => window.__zs.spawnAtWindow('fenetre-nord'));
    expect(id).toBeTruthy();
    await expect.poll(async () => {
      await step(page, 0.5);
      return (await state(page)).windows.find((w) => w.id === 'fenetre-nord').planks;
    }, { timeout: 60_000 }).toBe(0);
    await step(page, 0.2);
    const log = (await audio(page)).log;
    expect(log.filter((e) => e.sound === 'planche-craquement')).toHaveLength(1);
    expect(log.some((e) => e.sound === 'planche-arrachee')).toBe(true);
  });
});

test.describe('boucles d\'ambiance', () => {
  test('vent et feu : une seule voix chacune, aucune avant le geste, coupées à la pause puis reprises', async ({ page }) => {
    await open(page, '/jeu.html?test=1&nospawn=1&seed=1');
    await step(page, 0.5);
    expect((await audio(page)).loops).toEqual([]);
    await unlockReady(page);
    await step(page, 0.5);
    let a = await audio(page);
    expect(a.fires).toBeGreaterThan(0);
    expect(a.loops.sort()).toEqual(['ambiance-feu', 'ambiance-vent']);
    await step(page, 2);
    a = await audio(page);
    expect(a.loops.sort()).toEqual(['ambiance-feu', 'ambiance-vent']);
    expect(a.log.filter((e) => e.loop && e.start).length).toBe(2);
    await page.getByRole('button', { name: 'Pause' }).click();
    await expect.poll(async () => (await audio(page)).loops).toEqual([]);
    await page.getByRole('button', { name: 'Reprendre' }).click();
    await step(page, 0.3);
    await expect.poll(async () => (await audio(page)).loops.length).toBe(2);
  });

  test('mort : boucles et battement de cœur arrêtés (et le restent) ; « Rejouer » les relance', async ({ page }) => {
    await open(page, '/jeu.html?test=1&nospawn=1&seed=1');
    await unlockReady(page);
    await emit(page, [{ type: 'playerVitals', health: 0.1, state: 'debout' }]);
    await step(page, 0.5);
    expect((await audio(page)).loops.length).toBe(2);
    await page.evaluate(() => { window.__zs.setChutes(0); window.__zs.downPlayer(); });
    await step(page, 0.3);
    await expect(page.locator('#end-panel')).toBeVisible();
    await step(page, 1);
    const a = await audio(page);
    expect(a.loops).toEqual([]);
    expect(a.log.some((e) => e.stop && e.sound === 'joueur-coeur')).toBe(true);
    await page.locator('#btn-replay').click();
    await step(page, 0.5);
    await expect.poll(async () => (await audio(page)).loops.length).toBe(2);
  });

  test('?sons=ancien : aucune boucle nouvelle, aucun son nouveau', async ({ page }) => {
    await open(page, '/jeu.html?test=1&nospawn=1&seed=1&sons=ancien');
    await unlockReady(page);
    const p = await near(page);
    const log = await added(page, [{ type: 'playerStep', foot: 'gauche', volume: 1, surface: 'exterieur' }, { type: 'windowOpen', ...p }, { type: 'playerVitals', health: 0.1, state: 'debout' }, { type: 'waveEnd', variant: 0 }], 0.5);
    expect(log.map((e) => e.sound).sort()).toEqual(['pas', 'vague-fin']);
    expect((await audio(page)).loops).toEqual([]);
  });
});

test.describe('réparation à durée variable', () => {
  test('0,4 / 0,8 / 1,2 / 1,8 s : un tampon par durée, calculé au premier usage, joué en phase avec la pose', async ({ page }) => {
    await open(page, '/jeu.html?test=1&empty=1&nospawn=1&seed=1');
    await unlockReady(page);
    const p = await near(page);
    const expected = { 0.4: /^planche-posee@40-\d$/, 0.8: /^planche-posee@80-\d$/, 1.2: /^planche-posee@120-\d$/, 1.8: /^planche-posee-\d$/ };
    let i = 0;
    for (const [d, re] of Object.entries(expected)) {
      i += 1;
      await emit(page, [{ type: 'plankRepairStart', ...p, windowId: `R${i}`, duration: Number(d), progress: 0 }]);
      await expect.poll(async () => (await audio(page)).log.some((e) => e.key === `R${i}` && re.test(e.buffer ?? ''))).toBe(true);
      await step(page, 2);
    }
  });

  test('en jeu avec ?lvl=reparation:6 : son au début de la pose, à la durée de pose du niveau (0,84 s)', async ({ page }) => {
    await open(page, salle('/jeu.html?test=1&nospawn=1&seed=1&lvl=reparation:6'));
    await unlockReady(page);
    const s = await state(page);
    const d = s.stats.values.repairTime;
    expect(d).toBeCloseTo(1.8 * 0.88 ** 6, 3);
    const w = s.windows.find((x) => x.id === 'fenetre-nord');
    await page.evaluate(([x, y]) => { window.__zs.setPlanks('fenetre-nord', 2); window.__zs.setPlayer(x, y); }, [w.repairSpot.x, w.repairSpot.y]);
    await step(page, 0.1);
    await expect.poll(async () => (await audio(page)).log.find((e) => e.sound === 'planche-posee')?.buffer ?? '').toMatch(new RegExp(`^planche-posee@${Math.round(d * 100)}-\\d$`));
    expect((await state(page)).windows.find((x) => x.id === 'fenetre-nord').planks).toBe(2);
  });
});

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

  test('sons nouveaux : priorité 1 calculée au chargement (une version), priorité 2 au premier usage puis gardée', async ({ page }) => {
    await open(page, '/jeu.html?test=1&empty=1&nospawn=1&seed=1');
    await unlockReady(page);
    let a = await audio(page);
    for (const id of ['pas-exterieur', 'pas-escalier', 'zombie-rampe', 'planche-craquement', 'zombie-escalade']) expect(a.loaded, id).toContain(`${id}-1`);
    expect(byId.get('porte-enfoncee').preload).toBe(0);
    const p = await near(page);
    await emit(page, [{ type: 'doorSink', ...p, door: 'porte-1' }]);
    await expect.poll(async () => (await audio(page)).log.some((e) => e.sound === 'porte-enfoncee')).toBe(true);
    a = await audio(page);
    expect(a.loaded).toContain('porte-enfoncee-1');
    expect(a.loaded).toContain('ambiance-vent-1'); // boucle lancée par la partie : calculée à son premier usage
    expect(a.pack.lazy).toBeGreaterThanOrEqual(2);
  });
});
