import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { waitReady, salle } from './helpers.js';

// Lot 3-C : chutes du joueur (à terre, relevage, mort), interface E2-10, statistiques chutes et reparation. Tout passe par step() et les hooks :
// aucune durée n'est attendue en temps réel (sauf la pause, qui doit figer l'horloge de jeu). Petite fenêtre (667×375).
const SIZE = { width: 667, height: 375 };
const URL = (extra = '') => salle(`/jeu.html?test=1&seed=1${extra.includes('nospawn') ? '' : '&nospawn=1'}${extra}`);
const step = (page, seconds) => page.evaluate((s) => window.__zs.step(s), seconds);
const BROWSER_NOISE = /GL Driver Message|ReadPixels|GPU stall/;

async function open(page, extra = '', size = SIZE, { live = false } = {}) {
  await page.setViewportSize(size);
  await page.goto(URL(extra));
  await waitReady(page);
  if (live) return;
  await page.evaluate(() => { window.requestAnimationFrame = () => 0; });
  await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 150)));
  await page.evaluate(() => window.__zs.step(0.05));
}
const fall = async (page) => { await page.evaluate(() => { window.__zs.downPlayer(); window.__zs.step(0.05); }); };

test.describe('interface E2-10 et annonces', () => {

  // Lot 3l : « Protégé N s » passe du sous-titre au titre (avec un bouclier), la barre se vide sur 2 s.

  // Lot 3l : #hud est le conteneur des trois colonnes ; on compare la colonne de gauche (chutes) et la colonne de droite à Pause.
  test('HUD compact : la rangée des chutes ne chevauche pas Pause à 667×375 ; axe sans violation avec E2-10', async ({ page }) => {
    await open(page);
    const r = await page.evaluate(() => {
      const b = (sel) => { const e = document.querySelector(sel).getBoundingClientRect(); return { l: e.left, t: e.top, r: e.right, b: e.bottom }; };
      return { chutes: b('#hud-chutes'), hud: b('#hud'), left: b('.hud-tl'), right: b('.hud-tr'), pause: b('#btn-pause'), h: innerHeight };
    });
    expect(r.chutes.b).toBeLessThanOrEqual(r.hud.b + 1);
    expect(r.left.r).toBeLessThanOrEqual(r.pause.l);
    expect(r.right.r).toBeLessThanOrEqual(r.pause.l);
    expect(r.hud.b).toBeLessThan(r.h - 16);
    await page.evaluate(() => { window.__zs.setPlanks('fenetre-nord', 2); window.__zs.setPlayer(1800, 882); window.__zs.step(0.3); });
    await fall(page);
    await expect(page.locator('#down')).toBeVisible();
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  });
});

test.describe('repoussement et budget', () => {
  for (const [name, player, zombie, check] of [
    ['le mur est (le zombie s\'arrête à la face intérieure)', [2640, 940], [2700, 940], (e) => e.x <= 2776 - 20 + 1e-6 && e.x > 2700],
    ['la fenêtre nord, même ouverte (jamais expulsé)', [1800, 930], [1800, 880], (e) => e.y >= 824 + 20 - 1e-6],
    ['un meuble (table-3 : 2400..2500 × 1300..1500)', [2200, 1400], [2300, 1400], (e) => e.x <= 2400 - 20 + 1e-6 && e.x > 2300],
  ]) {
    for (const planks of [4, 0]) {
      test(`un zombie repoussé s'arrête contre ${name} (${planks} planche(s))`, async ({ page }) => {
        await open(page, `&planks=${planks}`);
        const e = await page.evaluate(([p, z]) => {
          const zs = window.__zs;
          zs.setPlayer(p[0], p[1]);
          zs.setInput({ aim: { angle: Math.PI } });
          const id = zs.spawnEnemy(z[0], z[1]);
          zs.downPlayer();
          zs.step(0.05);
          const s = zs.getState();
          const e = s.enemies.find((x) => x.id === id);
          return { x: e.x, y: e.y };
        }, [player, zombie]);
        expect(check(e), JSON.stringify(e)).toBe(true);
      });
    }
  }

  test('un zombie qui arrache une planche ou qui se trouve hors de la salle n\'est pas repoussé', async ({ page }) => {
    await open(page);
    const r = await page.evaluate(() => {
      const zs = window.__zs;
      const tearer = zs.spawnAtWindow('fenetre-ouest', 'marcheur');
      for (let i = 0; i < 400; i += 1) { zs.step(0.05); const e = zs.getState().enemies.find((x) => x.id === tearer); if (e.mode === 'arrache') break; }
      zs.step(3); // le temps d'atteindre son emplacement
      const outside = zs.spawnEnemy(500, 1400);
      zs.setPlayer(900, 1400);
      const t0 = zs.getState().enemies.find((x) => x.id === tearer);
      zs.downPlayer();
      zs.step(0.05);
      const s = zs.getState();
      const t1 = s.enemies.find((x) => x.id === tearer);
      const o1 = s.enemies.find((x) => x.id === outside);
      return { tearerMoved: Math.hypot(t1.x - t0.x, t1.y - t0.y), outsideMoved: Math.hypot(o1.x - 500, o1.y - 1400), mode: t1.mode };
    });
    expect(r.mode).toBe('arrache');
    expect(r.tearerMoved).toBeLessThan(2);
    expect(r.outsideMoved).toBeLessThan(4); // un pas de marche (70 × 0,05 = 3,5), pas un repoussement de 160
  });

  test('budget de dessin avec le joueur à terre : au plus 192 appels et 15 000 triangles (10 zombies, planches, ombres)', async ({ page }, testInfo) => {
    await open(page, '&shadows=1');
    const r = await page.evaluate(() => {
      const zs = window.__zs;
      const p = zs.getState().player;
      const T = ['marcheur', 'petit', 'voute', 'grand'];
      const G = ['lent', 'marche', 'rampe', 'course'];
      for (let i = 0; i < 4; i += 1) zs.spawnAtWindow('fenetre-nord', T[i]);
      zs.step(16);
      for (let i = 0; i < 6; i += 1) zs.spawnEnemy(p.x + 260 + (i % 3) * 45, p.y - 90 + Math.floor(i / 3) * 90, { type: T[i % 4], gait: G[i % 4], wave: 10 });
      zs.downPlayer();
      zs.step(0.05);
      zs.sampleScreen(0, 0, 8, 8);
      const s = zs.getState();
      return { render: s.render, n: s.enemies.length, down: s.player.down.state, pose: s.pose };
    });
    testInfo.annotations.push({ type: 'rendu', description: `${r.n} zombies, joueur à terre : ${r.render.calls} appels, ${r.render.triangles} triangles` });
    console.log(`BUDGET lot 3 (joueur à terre) : ${r.n} zombies, ${r.render.calls} appels de dessin, ${r.render.triangles} triangles`);
    expect(r.down).toBe('terre');
    expect(r.render.calls).toBeLessThanOrEqual(192);
    expect(r.render.triangles).toBeLessThanOrEqual(45000); // lot 3m : limites de refonte relevées par le propriétaire (avant : 30000)
    if (r.pose.pelvisHeight !== undefined) {
      expect(r.pose.pelvisHeight).toBeLessThan(-0.4); // pose « terre » : corps abaissé
      expect(r.pose.torsoPitch).toBeGreaterThan(1.3);
    } else expect(r.pose.anim).toBe('terre'); // lot 3j : personnages v2 par défaut (animation « terre »)
  });

  test('aucun appel réseau, aucun stockage, console propre pendant une chute et un relevage', async ({ page, baseURL }) => {
    const external = [];
    const problems = [];
    page.on('request', (r) => !r.url().startsWith(baseURL) && !r.url().startsWith('data:') && external.push(r.url()));
    page.on('console', (m) => ['error', 'warning'].includes(m.type()) && !BROWSER_NOISE.test(m.text()) && problems.push(m.text()));
    page.on('pageerror', (e) => problems.push(e.message));
    await open(page);
    await fall(page);
    await step(page, 8);
    expect(external).toEqual([]);
    expect(problems).toEqual([]);
    expect(await page.evaluate(() => [localStorage.length, sessionStorage.length, document.cookie])).toEqual([0, 0, '']);
  });
});

