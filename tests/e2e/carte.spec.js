import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { readFileSync } from 'node:fs';
import { waitReady } from './helpers.js';

// Lot 3b-A : page de contrôle carte.html (SVG de world.json et decor.json). Page technique, noindex.
const BROWSER_NOISE = /GL Driver Message/;
const SIZES = [{ width: 667, height: 375 }, { width: 1440, height: 900 }];

async function open(page, extra = '', size = SIZES[0]) {
  await page.setViewportSize(size);
  await page.goto(`/carte.html${extra}`);
  await expect(page.locator('svg.carte-svg')).toBeVisible({ timeout: 30_000 });
}

test('se charge sans erreur ni requête externe, noindex, 7 étiquettes F1 à F8 (F7 retirée au lot 3g), le cadre et l\'échelle', async ({ page, baseURL }) => {
  const external = [];
  const problems = [];
  page.on('request', (r) => !r.url().startsWith(baseURL) && !r.url().startsWith('data:') && external.push(r.url()));
  page.on('console', (m) => ['error', 'warning'].includes(m.type()) && !BROWSER_NOISE.test(m.text()) && problems.push(m.text()));
  page.on('pageerror', (e) => problems.push(e.message));
  page.on('response', (r) => r.status() >= 400 && problems.push(`${r.status()} ${r.url()}`));
  await open(page);
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex');
  await expect(page.locator('text.fenetre-etiquette')).toHaveText(['F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F8']);
  await expect(page.locator('rect.cadre-trait')).toHaveCount(1);
  await expect(page.locator('line.echelle-trait')).toHaveCount(1);
  await expect(page.locator('rect.pilier')).toHaveCount(10);
  await expect(page.locator('#stats')).toContainText('7 fenêtres');
  await page.waitForLoadState('networkidle');
  expect(external).toEqual([]);
  expect(problems).toEqual([]);
  expect(await page.evaluate(() => [localStorage.length, sessionStorage.length, document.cookie])).toEqual([0, 0, '']);
});

for (const size of SIZES) {
  test(`axe : aucune violation, aucune cible de moins de 44 px (${size.width}×${size.height})`, async ({ page }) => {
    await open(page, '', size);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    for (const link of await page.locator('a.carte-link').all()) {
      const box = await link.boundingBox();
      expect(box.height).toBeGreaterThanOrEqual(44);
      expect(box.width).toBeGreaterThanOrEqual(44);
    }
  });
}

// Lot 3e-C : sélecteur d'étage (?floor=0 ou 1, deux boutons de 44 px), zones de déclenchement, arrivées et blocs de portes.
test.describe('sélecteur d\'étage', () => {

  for (const size of SIZES) {
    test(`axe : aucune violation sur l'étage, aucune cible de moins de 44 px (${size.width}×${size.height})`, async ({ page }) => {
      await open(page, '?floor=1', size);
      expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
      for (const link of await page.locator('a.carte-link').all()) {
        const box = await link.boundingBox();
        expect(box.height).toBeGreaterThanOrEqual(44);
        expect(box.width).toBeGreaterThanOrEqual(44);
      }
    });
  }

});

// Lot 5a : épaves du décor extérieur (voiture en flammes, hélicoptère écrasé), sur carte.html et dans le jeu (?test=1, step(), jamais une durée réelle).
test.describe('épaves (lot 5a)', () => {
  const decor = JSON.parse(readFileSync('data/game/maps/rez-de-chaussee/decor.json', 'utf8'));
  const heli = decor.wrecks.helicopter;
  const fuselage = heli.rects[0];
  const openGame = async (page, extra = '') => {
    await page.setViewportSize(SIZES[0]);
    await page.goto(`/jeu.html?test=1&seed=1&nospawn=1&vhs=0${extra}`);
    await waitReady(page);
    await page.evaluate(() => { window.requestAnimationFrame = () => 0; });
    await page.evaluate(() => window.__zs.step(0.05));
  };

  test('carte.html montre les épaves : 3 rectangles de l\'hélicoptère, son emprise, la voiture en flammes, l\'angle du L parmi 4 sommets rentrants', async ({ page }) => {
    await open(page);
    await expect(page.locator('rect.epave-helicoptere')).toHaveCount(heli.rects.length);
    await expect(page.locator('rect.epave-emprise')).toHaveCount(1);
    await expect(page.locator('rect.epave-voiture')).toHaveAttribute('data-id', decor.wrecks.burningCar.id);
    await expect(page.locator('circle.coin-l')).toHaveAttribute('data-id', `coin-${heli.corner.x}-${heli.corner.y}`);
    await expect(page.locator('circle.coin-rentrant')).toHaveCount(3);
  });

  test('dans le jeu : hélicoptère dessiné (700 triangles au plus) et solide, voiture en flammes dont le feu groupé avance avec le temps de jeu', async ({ page }) => {
    await openGame(page);
    const r = await page.evaluate(() => {
      const zs = window.__zs;
      const a = zs.getState().scene.wrecks;
      zs.step(1);
      const b = zs.getState().scene.wrecks;
      return { a, b };
    });
    expect(r.a.helicopter.triangles).toBe(heli.triangles);
    expect(r.a.helicopter.triangles).toBeLessThanOrEqual(700);
    expect(r.a.helicopter.rects).toEqual(heli.rects.map((q) => q.id));
    expect(r.a.burningCar.id).toBe(decor.wrecks.burningCar.id);
    expect(r.a.fires).toHaveLength(1);
    expect(r.a.fires[0]).toMatchObject({ spots: 2, glow: false, flames: 64, smoke: 64 });
    expect(r.b.fires[0].time).toBeGreaterThan(r.a.fires[0].time + 0.9);
    expect(r.a.exteriorVisible).toBe(true);
  });

  test('une balle tirée vers l\'hélicoptère s\'arrête sur lui sans dégâts ; le laser s\'y arrête aussi', async ({ page }) => {
    await openGame(page);
    const x = fuselage.x + fuselage.w / 2;
    const r = await page.evaluate(([px, py, zy]) => {
      const zs = window.__zs;
      zs.setPlayer(px, py);
      zs.setInput({ aim: { angle: Math.PI / 2 } });
      const id = zs.spawnEnemy(px, zy);
      zs.step(0.1);
      const laser = zs.getState().laser;
      zs.fire(Math.PI / 2);
      zs.step(1);
      const s = zs.getState();
      const e = s.enemies.find((q) => q.id === id);
      return { hp: e.health, max: e.maxHp, bullets: s.bullets.length, laser, sounds: s.audio.log.map((l) => l.sound) };
    }, [x, fuselage.y - 120, fuselage.y + fuselage.h + 28]); // retour du propriétaire : l'hélicoptère est contre le mur sud, on tire depuis le nord ; le zombie est derrière, contre le mur
    expect(r.laser.stoppedBy).toMatch(/^helicoptere-/);
    expect(r.bullets).toBe(0);
    expect(r.hp).toBe(r.max);
  });

  test('?detail=0 : l\'hélicoptère reste dessiné (il est solide), sans le feu ; 10 allers-retours d\'étage sans fuite de géométrie', async ({ page }) => {
    await openGame(page, '&detail=0');
    const off = await page.evaluate(() => window.__zs.getState().scene.wrecks);
    expect(off.helicopter.triangles).toBe(heli.triangles);
    expect(off.fires).toEqual([]);
    await openGame(page, '&wave=31');
    const r = await page.evaluate(() => {
      const zs = window.__zs;
      // Un premier aller-retour envoie l'étage au processeur graphique (comme tests/e2e/etage.spec.js), puis on compte.
      zs.setFloor(1);
      zs.step(0.05);
      zs.sampleScreen(0, 0, 4, 4);
      zs.setFloor(0);
      zs.step(0.05);
      zs.sampleScreen(0, 0, 4, 4);
      const before = zs.getState().render.geometries;
      for (let i = 0; i < 10; i += 1) {
        zs.setFloor(1);
        zs.step(0.05);
        zs.sampleScreen(0, 0, 4, 4);
        zs.setFloor(0);
        zs.step(0.05);
        zs.sampleScreen(0, 0, 4, 4);
      }
      const s = zs.getState();
      return { before, after: s.render.geometries, wrecks: s.scene.wrecks, floor: s.floor.current };
    });
    expect(r.after).toBeLessThanOrEqual(r.before);
    expect(r.wrecks.helicopter.triangles).toBe(heli.triangles);
    expect(r.wrecks.fires).toHaveLength(1);
  });
});
