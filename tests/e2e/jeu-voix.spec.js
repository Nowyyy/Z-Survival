import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { buildLayout } from '../../js/core/layout.js';
import { waitReady } from './helpers.js';

// Lot 1d-C : voix de zombies, ambiance, étouffement. Le journal des lectures (?test=1) remplace l'écoute ; 667×375 pour un rendu rapide.
const SIZE = { width: 667, height: 375 };
const URL = (extra = '') => `/jeu.html?test=1&empty=1&nospawn=1&seed=1${extra}`;
const world = JSON.parse(readFileSync('data/game/world.json', 'utf8'));
const decor = JSON.parse(readFileSync('data/game/decor.json', 'utf8'));
const layout = buildLayout(world, decor, {});
const AMBIENT = ['zombie-gemissement', 'zombie-grognement', 'zombie-plainte', 'zombie-souffle'];
const state = (page) => page.evaluate(() => window.__zs.getState());
const audio = async (page) => (await state(page)).audio;
async function open(page, url = URL()) {
  await page.setViewportSize(SIZE);
  await page.goto(url);
  await waitReady(page);
}
async function unlock(page) {
  await page.mouse.click(40, 40);
  await expect.poll(async () => (await audio(page)).unlocked).toBe(true);
}
// Fait vivre une partie de `seconds` secondes avec 8 zombies toujours présents. Chaque seconde, le joueur est replacé au point de la salle
// le plus proche de la meute parmi ceux qui sont à 400 au moins de tout zombie : la meute reste à portée d'audition sans jamais toucher
// le joueur (la partie ne finit pas), et vise à l'opposé de la meute pour ne pas tirer. Renvoie les entrées du journal vues, avec `ready` et `loaded` à ce moment.
function horde(page, seconds) {
  return page.evaluate((total) => {
    const zs = window.__zs;
    const grid = [];
    for (let x = 100; x <= 1500; x += 200) for (let y = 100; y <= 800; y += 175) grid.push([x, y]);
    const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
    const safe = (list) => {
      const scored = grid.map((g) => ({ g, near: Math.min(...list.map((z) => dist(g, z))), mean: list.reduce((s, z) => s + dist(g, z), 0) / list.length }));
      const ok = scored.filter((c) => c.near >= 400);
      return (ok.length ? ok.sort((a, b) => a.mean - b.mean) : scored.sort((a, b) => b.near - a.near))[0].g;
    };
    const seen = [];
    let last = -1;
    for (let i = 0; i < total; i += 1) {
      let s = zs.getState();
      const pack = s.enemies.map((e) => [e.x, e.y]);
      for (let k = s.enemies.length; k < 8; k += 1) {
        const c = [[10, 10], [1590, 10], [10, 890], [1590, 890]].reduce((a, b) => (dist(a, [s.player.x, s.player.y]) > dist(b, [s.player.x, s.player.y]) ? a : b));
        zs.spawnEnemy(c[0] + k * 3, c[1] + k * 3);
      }
      zs.step(1);
      s = zs.getState();
      for (const e of s.audio.log) if (e.gameTime > last) seen.push({ ...e, ready: s.audio.ready, loaded: s.audio.loaded.includes(`${e.sound}-${e.variant + 1}`) });
      last = s.time;
      const spot = safe(s.enemies.length ? s.enemies.map((e) => [e.x, e.y]) : [[800, 450]]);
      zs.setPlayer(spot[0], spot[1]);
      // Le joueur vise à l'opposé de la meute : aucun tir (les sons de tir saturent les voix pendant une simulation accélérée).
      const cx = s.enemies.reduce((a, e) => a + e.x, 0) / Math.max(1, s.enemies.length);
      const cy = s.enemies.reduce((a, e) => a + e.y, 0) / Math.max(1, s.enemies.length);
      zs.setInput({ aim: { angle: Math.atan2(spot[1] - cy, spot[0] - cx) } });
      void pack;
    }
    return { seen, health: zs.getState().player.health, enemies: zs.getState().enemies.length };
  }, seconds);
}

test.describe('voix de zombies', () => {
  test('120 s simulées avec 8 zombies : un nombre de voix cohérent avec les règles (16 à 36 par minute, tolérance ×2)', async ({ page }) => {
    await open(page);
    await unlock(page);
    await expect.poll(async () => (await audio(page)).ready, { timeout: 30_000 }).toBe(true);
    const run = await horde(page, 120);
    expect(run.enemies).toBe(8);
    const voices = run.seen.filter((e) => AMBIENT.includes(e.sound));
    console.info(`voix de zombies sur 120 s simulées : ${voices.length} (${(voices.length / 2).toFixed(1)} par minute)`);
    expect(voices.length / 2).toBeGreaterThanOrEqual(8);
    expect(voices.length / 2).toBeLessThanOrEqual(72);
    for (let i = 1; i < voices.length; i += 1) expect(voices[i].gameTime - voices[i - 1].gameTime).toBeGreaterThanOrEqual(1.2 - 1e-6);
    for (const v of voices) expect(Number.isInteger(v.zombie)).toBe(true);
    const byZombie = new Map();
    for (const v of voices) {
      if (byZombie.has(v.zombie)) expect(v.gameTime - byZombie.get(v.zombie)).toBeGreaterThanOrEqual(6 - 1e-6);
      byZombie.set(v.zombie, v.gameTime);
    }
    expect(new Set(voices.map((v) => v.rate)).size).toBeGreaterThan(1); // hauteur propre à chaque variante
    expect(run.seen.some((e) => e.sound === 'pas-zombie')).toBe(true);
  });

  test('les voix « fond » ne sont jouées qu\'une fois leurs tampons prêts', async ({ page }) => {
    // Calcul de fond ralenti (une image toutes les 250 ms) : la partie démarre bien avant la fin des sons « fond ».
    await page.addInitScript(() => {
      const raf = window.requestAnimationFrame.bind(window);
      window.requestAnimationFrame = (cb) => setTimeout(() => raf(cb), 250);
    });
    await page.setViewportSize(SIZE);
    await page.goto(URL('&dpr=1'));
    await page.waitForFunction(() => (window.__zs?.getState()?.time ?? 0) > 0.05, null, { timeout: 90_000 });
    await unlock(page);
    const early = await audio(page);
    expect(early.ready).toBe(false);
    expect(early.loaded.some((n) => n.startsWith('tir-'))).toBe(true); // les essentiels sont là
    const run = await horde(page, 60);
    for (const e of run.seen) expect(e.loaded, `${e.sound}-${e.variant + 1} joué sans tampon`).toBe(true);
    await expect.poll(async () => (await audio(page)).ready, { timeout: 120_000 }).toBe(true);
    const after = await horde(page, 90);
    expect(after.seen.filter((e) => AMBIENT.includes(e.sound)).length).toBeGreaterThan(0);
  });

  test('un zombie à l\'extérieur derrière un mur est joué étouffé ; le même devant une fenêtre ne l\'est pas', async ({ page }) => {
    await page.setViewportSize(SIZE);
    await page.goto('/jeu.html?test=1&nospawn=1&seed=1');
    await waitReady(page);
    await unlock(page);
    const win = layout.windows.find((w) => w.side === 'nord');
    await page.evaluate(([x, y]) => window.__zs.setPlayer(x, y), [win.x, win.y + 300]);
    const emit = async (x, y) => {
      const before = (await audio(page)).log.length;
      await page.evaluate(([px, py]) => window.__zs.audioEvent({ type: 'zombieHit', x: px, y: py, killed: false, zombie: 'marcheur' }), [x, y]);
      return (await audio(page)).log.slice(before);
    };
    const behind = await emit(win.x + 400, win.y - 250);
    expect(behind.map((e) => e.sound)).toContain('zombie-blessure');
    for (const e of behind) expect(e.lowpass, e.sound).toBe(true);
    await page.evaluate(() => window.__zs.step(0.5)); // laisse passer le délai minimal de la blessure
    const front = await emit(win.x, win.y - 250);
    expect(front.map((e) => e.sound)).toContain('zombie-blessure');
    for (const e of front) expect(e.lowpass, e.sound).toBe(false);
    expect(behind[0].gain).toBeLessThan(front[0].gain);
  });

  test('un cri d\'attaque part au contact, avec la hauteur de la variante', async ({ page }) => {
    await open(page);
    await unlock(page);
    await expect.poll(async () => (await audio(page)).ready, { timeout: 30_000 }).toBe(true);
    const p = (await state(page)).player;
    await page.evaluate(([x, y]) => window.__zs.spawnEnemy(x, y), [p.x + 50, p.y]);
    await page.evaluate(() => window.__zs.step(2.5));
    const log = (await audio(page)).log;
    expect(log.some((e) => e.sound === 'joueur-blesse')).toBe(true);
    const cry = log.find((e) => e.sound === 'zombie-attaque');
    expect(cry).toBeDefined();
    expect(cry.rate).toBeGreaterThanOrEqual(0.8);
    expect(cry.rate).toBeLessThanOrEqual(1.4);
  });
});

test.describe('ambiance', () => {
  test('démarre après le premier geste et s\'arrête en pause', async ({ page }) => {
    await open(page);
    await expect.poll(async () => (await audio(page)).ready, { timeout: 30_000 }).toBe(true);
    expect((await audio(page)).ambience).toBe(false); // rien avant le premier geste
    await unlock(page);
    await expect.poll(async () => (await audio(page)).ambience).toBe(true);
    await page.getByRole('button', { name: 'Pause' }).click();
    await expect.poll(async () => (await audio(page)).ambience).toBe(false);
    await page.getByRole('button', { name: 'Reprendre' }).click();
    await expect.poll(async () => (await audio(page)).ambience).toBe(true);
  });

  test('le bouton « Son » et la touche M la coupent aussi', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'bureau', 'clavier');
    await open(page);
    await expect.poll(async () => (await audio(page)).ready, { timeout: 30_000 }).toBe(true);
    await unlock(page);
    await expect.poll(async () => (await audio(page)).ambience).toBe(true);
    await page.keyboard.press('KeyM');
    await expect.poll(async () => (await audio(page)).ambience).toBe(false);
    await page.keyboard.press('KeyM');
    await expect.poll(async () => (await audio(page)).ambience).toBe(true);
  });
});
