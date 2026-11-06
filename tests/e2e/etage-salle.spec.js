import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { parseZones, zonesToWorld } from '../../js/core/zones.js';
import { waitReady } from './helpers.js';

// Lot 3e-C : la seconde salle de l'étage, le second escalier, la porte de l'étage, la porte 3 (manche 30), la fin de monde avec quatre salles. Tout passe par step() et les hooks ; 667×375.
const SIZE = { width: 667, height: 375 };
const load = (path) => JSON.parse(readFileSync(path, 'utf8'));
const world = load('data/game/maps/rez-de-chaussee/world.json');
const zonesWorld = zonesToWorld(parseZones(load('data/game/maps/rez-de-chaussee/zones.json')), world.transform);
const stairOf = (id) => zonesWorld.stairs.find((s) => s.id === id);
const DEPART = stairOf('escalier-depart');
const AILE = stairOf('escalier-aile');
const STATE = (page) => page.evaluate(() => window.__zs.getState());
const BROWSER_NOISE = /GL Driver Message|ReadPixels|GPU stall/;
// Porte de l'étage entre les deux salles : mur x = 138 px, ouverture y 262 à 301 px (unités du jeu : marge 800, 5 par pixel).
const DOOR_X = 800 + 138 * 5;
const DOOR_Y = 800 + 281 * 5;

async function open(page, extra = '', size = SIZE, { freeze = true } = {}) {
  await page.setViewportSize(size);
  await page.goto(`/jeu.html?test=1&seed=1&vhs=0${extra}`);
  await waitReady(page);
  if (freeze) await page.evaluate(() => { window.requestAnimationFrame = () => 0; });
  await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 150)));
  await page.evaluate(() => window.__zs.step(0.05));
}



test.describe('deux escaliers', () => {

  test('aucune limite de zombies dans un escalier, même avec les deux escaliers utilisables', async ({ page }) => {
    await open(page, '&wave=31&nospawn=1');
    await page.evaluate(([a, b]) => {
      for (let i = 0; i < 6; i += 1) {
        window.__zs.spawnEnemy(a.x + (i % 2) * 14, a.y + 30 + i * 10, { floor: 'etage', mode: 'dedans' });
        window.__zs.spawnEnemy(b.x + (i % 2) * 14, b.y - 40 - i * 10, { floor: 'etage', mode: 'dedans' });
      }
    }, [DEPART.floors.etage.arrival, AILE.floors.etage.arrival]);
    const r = await page.evaluate(() => {
      const zs = window.__zs;
      let max = 0;
      for (let i = 0; i < 240; i += 1) {
        zs.step(0.05);
        const per = {};
        for (const e of zs.getState().enemies) if (e.mode === 'escalier') per[e.stair] = (per[e.stair] ?? 0) + 1;
        max = Math.max(max, ...Object.values(per), 0);
      }
      return { max, arrived: zs.getState().stairLog.filter((l) => l.type === 'stairArrive').length };
    });
    expect(r.max).toBeGreaterThan(4);
    expect(r.arrived).toBeGreaterThanOrEqual(4);
  });

  test('simulation de 120 s à ?wave=31 : le joueur alterne les étages toutes les 20 s, jamais plus de 10 zombies, aucun zombie immobile plus de 2 s hors des attentes voulues', async ({ page }) => {
    const problems = [];
    page.on('pageerror', (e) => problems.push(e.message));
    await open(page, '&wave=31');
    const r = await page.evaluate(([dep, aile]) => {
      const zs = window.__zs;
      zs.setLevels({ vie: 10 });
      zs.setChutes(5);
      let max = 0;
      let worstStill = 0;
      let worst = null;
      const last = new Map();
      for (let i = 0; i < 2400; i += 1) {
        if (i % 200 === 150) zs.killAll(); // le joueur doit survivre aux 120 s : on éclaircit les zombies toutes les 10 s
        if (i % 400 === 100) { zs.useStair(Math.floor(i / 400) % 2 === 0 ? 'escalier-depart' : 'escalier-aile'); }
        zs.step(0.05);
        const s = zs.getState();
        max = Math.max(max, s.enemies.length);
        for (const e of s.enemies) {
          const prev = last.get(e.id);
          const near = e.floor === s.floor.current && Math.hypot(e.x - s.player.x, e.y - s.player.y) < 90; // au contact du joueur : il attaque
          const waiting = near || e.mode === 'escalier' || e.mode === 'attente' || e.mode === 'arrache' || e.mode === 'escalade' || e.mode === 'approche' || e.mode === 'libre';
          if (prev && !waiting && Math.hypot(prev.x - e.x, prev.y - e.y) < 0.5) { prev.still += 0.05; if (prev.still > worstStill) { worstStill = prev.still; worst = { mode: e.mode, floor: e.floor, x: e.x, y: e.y, t: s.time, player: s.player.x + ',' + s.player.y + ' ' + s.floor.current }; } prev.x = e.x; prev.y = e.y; } else last.set(e.id, { x: e.x, y: e.y, still: 0 });
        }
        if (s.dead) break;
      }
      return { max, worstStill, worst, dead: zs.getState().dead, time: zs.getState().time, dep, aile };
    }, ['escalier-depart', 'escalier-aile']);
    expect(r.max).toBeLessThanOrEqual(10);
    expect(r.time).toBeGreaterThan(110); // 120 s de jeu, le joueur ne meurt pas
    expect(r.worstStill).toBeLessThanOrEqual(2);
    expect(problems).toEqual([]);
  });
});

test.describe('budget, hygiène', () => {
  const measure = (page, floor) => page.evaluate(([where]) => {
    const zs = window.__zs;
    const p = zs.getState().player;
    zs.setInput({ aim: { angle: Math.PI } });
    const T = ['marcheur', 'petit', 'voute', 'grand'];
    const G = ['lent', 'marche', 'rampe', 'course'];
    for (let i = 0; i < 10; i += 1) zs.spawnEnemy(p.x + 40 + (i % 5) * 30, p.y + (Math.floor(i / 5) - 0.5) * 60, { type: T[i % 4], gait: G[(i + Math.floor(i / 4)) % 4], wave: 31, floor: where });
    zs.step(0.05);
    zs.sampleScreen(0, 0, 8, 8);
    return zs.getState().render;
  }, [floor]);

  test('budget U4 : joueur dans la seconde salle de l\'étage, 10 zombies, ombres : 300 appels et 15 000 triangles au plus ; U1 : poche', async ({ page }, testInfo) => {
    await open(page, '&wave=31&floor=1&shadows=1&nospawn=1');
    const u1 = await measure(page, 'etage');
    await page.evaluate(() => window.__zs.killAll());
    await page.evaluate(([x, y]) => window.__zs.setPlayer(x, y), [DOOR_X + 300, DOOR_Y + 40]);
    const u4 = await measure(page, 'etage');
    console.log(`BUDGET lot 3e-C, étage : U1 ${u1.calls} appels / ${u1.triangles} tri, U4 (seconde salle) ${u4.calls} / ${u4.triangles}`);
    testInfo.annotations.push({ type: 'rendu', description: `U1 ${u1.calls}/${u1.triangles} ; U4 ${u4.calls}/${u4.triangles}` });
    for (const m of [u1, u4]) {
      expect(m.calls).toBeLessThanOrEqual(400); // lot 3m : limites de refonte relevées par le propriétaire (avant : 300)
      expect(m.triangles).toBeLessThanOrEqual(45000); // lot 3m : limites de refonte relevées par le propriétaire (avant : 30000)
    }
  });

  test('rez-de-chaussée avec les deux escaliers ouverts : au plus 4 appels de plus que les escaliers fermés ; limites absolues tenues', async ({ page }) => {
    const run = async (extra) => {
      await open(page, `${extra}&shadows=1&nospawn=1`);
      return measure(page, 'rdc');
    };
    const closed = await run('&wave=1');
    const opened = await run('&wave=31');
    console.log(`BUDGET lot 3e-C, rez-de-chaussée : fermés ${closed.calls} / ${closed.triangles}, ouverts ${opened.calls} / ${opened.triangles}`);
    expect(opened.calls - closed.calls).toBeLessThanOrEqual(4);
    expect(opened.calls).toBeLessThanOrEqual(400); // lot 3m : limites de refonte relevées par le propriétaire (avant : 300)
    expect(opened.triangles).toBeLessThanOrEqual(45000); // lot 3m : limites de refonte relevées par le propriétaire (avant : 30000)
  });

  test('aucune requête externe, aucun stockage, console propre pendant l\'ouverture de la porte 3 et les deux escaliers', async ({ page, baseURL, context }) => {
    const urls = [];
    const problems = [];
    page.on('request', (r) => urls.push(r.url()));
    page.on('console', (m) => ['error', 'warning'].includes(m.type()) && !BROWSER_NOISE.test(m.text()) && problems.push(m.text()));
    page.on('pageerror', (e) => problems.push(e.message));
    await open(page, '&wave=30');
    await page.evaluate(() => { window.__zs.step(3.1); window.__zs.skipWave(); window.__zs.step(14); window.__zs.useStair('escalier-depart'); window.__zs.step(3); window.__zs.useStair('escalier-aile'); window.__zs.step(3); });
    await page.waitForLoadState('networkidle');
    expect(urls.filter((u) => !u.startsWith(baseURL) && !u.startsWith('data:') && !u.startsWith('blob:'))).toEqual([]);
    expect(problems).toEqual([]);
    expect(await page.evaluate(() => [localStorage.length, sessionStorage.length, document.cookie])).toEqual([0, 0, '']);
    expect(await context.cookies()).toEqual([]);
  });

  test('?map=salle : inchangé (une zone, aucune porte, aucun étage)', async ({ page }) => {
    await open(page, '&map=salle&wave=40');
    const s = await STATE(page);
    expect(s.zones.list).toHaveLength(1);
    expect(s.zones.doors).toEqual([]);
    expect(s.floor.multi).toBe(false);
    expect(s.zones.next).toBeNull();
  });
});
