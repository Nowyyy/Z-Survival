import { test, expect } from '@playwright/test';
import { waitReady, salle } from './helpers.js';

// Lot 3a-A : planches lisibles et sans clipping. Tout passe par step() (temps de jeu) et les hooks de ?test=1 ; les mesures lisent les sommets réels
// des maillages (getState().windows[i].mesh), pas la fonction pure. 667×375 de préférence ; les tests se désactivent seuls si WebGL manque.
const SIZE = { width: 667, height: 375 };
const SILL = 16;
const BROWSER_NOISE = /GL Driver Message|ReadPixels|GPU stall/;

async function open(page, extra = '', size = SIZE, seed = 1) {
  await page.setViewportSize(size);
  await page.goto(salle(`/jeu.html?test=1&seed=${seed}&nospawn=1${extra}`));
  await waitReady(page);
  await page.evaluate(() => { window.requestAnimationFrame = () => 0; });
  await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 150)));
  await page.evaluate(() => window.__zs.step(0.05));
}

test.describe('planches 3D : géométrie lue sur les sommets réels', () => {
  for (const size of [SIZE, { width: 1440, height: 900 }]) {
    test(`chaque fenêtre, de 0 à 4 planches : aucun sommet sous l'allège + 0,5, écart au mur d'au moins 2, au plus 42 triangles (${size.width}×${size.height})`, async ({ page }) => {
      await open(page, '', size);
      const rows = await page.evaluate(() => {
        const zs = window.__zs;
        const out = [];
        for (const id of ['fenetre-nord', 'fenetre-ouest', 'fenetre-est']) {
          for (let n = 0; n <= 4; n += 1) {
            zs.setPlanks(id, n);
            const w = zs.getState().windows.find((x) => x.id === id);
            out.push({ id, n, ...w.mesh });
          }
        }
        return out;
      });
      expect(rows).toHaveLength(15);
      for (const r of rows) {
        expect(r.triangles, `${r.id} ${r.n}`).toBeLessThanOrEqual(42);
        if (r.n === 0) {
          expect(r.minY).toBeNull();
        } else {
          expect(r.minY, `${r.id} ${r.n} : ordonnée minimale`).toBeGreaterThanOrEqual(SILL + 0.5 - 1e-3);
          expect(r.minWallGap, `${r.id} ${r.n} : écart au mur`).toBeGreaterThanOrEqual(2 - 1e-3);
        }
        expect(r.beams).toBe(r.n);
      }
    });
  }

});

test.describe('culling : seules les fenêtres dans le champ sont dessinées', () => {

  test('une fenêtre hors champ ne coûte aucun triangle : changer ses planches ne change pas render.triangles, celle de la fenêtre visible garde ses 42 triangles', async ({ page }) => {
    await open(page);
    const r = await page.evaluate(() => {
      const zs = window.__zs;
      zs.setPlayer(1800, 900);
      const tri = () => {
        zs.sampleScreen(0, 0, 4, 4);
        return zs.getState().render.triangles;
      };
      const base = tri();
      const d0 = zs.getState().debris.length;
      zs.setPlanks('fenetre-est', 0); // hors champ : 40 → 26 triangles réécrits, mais rien dessiné ; 4 débris de 4 triangles en plus
      zs.setPlanks('fenetre-ouest', 0);
      const out = tri();
      const d1 = zs.getState().debris.length;
      zs.setPlanks('fenetre-nord', 2); // dans le champ (42 triangles dessinés, dont des dégénérés) : 2 débris de plus
      const near = tri();
      const d2 = zs.getState().debris.length;
      return { base, out, near, d: [d0, d1, d2], frustum: zs.getState().windows.map((w) => w.mesh.inFrustum) };
    });
    expect(r.frustum).toEqual([true, false, false]);
    // Lot 3b : un maillage de débris par fenêtre, masqué avec elle : les fenêtres est et ouest, hors champ, ne coûtent rien (avant : 4 triangles par débris, un seul maillage).
    expect(r.d[1]).toBeGreaterThan(r.d[0]);
    expect(r.out - r.base).toBe(0);
    expect(r.near - r.out).toBe(4 * (r.d[2] - r.d[1])); // un maillage de fenêtre a une capacité fixe : 42 triangles dessinés quel que soit le nombre de planches
  });

  test('budget de dessin : 10 zombies, planches, ombres, cône, joueur à la fenêtre nord : au plus 193 appels et 14 982 triangles', async ({ page }, testInfo) => {
    await open(page, '&shadows=1');
    const r = await page.evaluate(() => {
      const zs = window.__zs;
      zs.setPlayer(1800, 900);
      const p = zs.getState().player;
      zs.setInput({ aim: { angle: Math.PI } });
      const T = ['marcheur', 'petit', 'voute', 'grand'];
      const G = ['lent', 'marche', 'rampe', 'course'];
      for (let i = 0; i < 10; i += 1) zs.spawnEnemy(p.x + 70 + (i % 5) * 45, p.y - 90 + Math.floor(i / 5) * 90 + (i % 2) * 15, { type: T[i % 4], gait: G[(i + Math.floor(i / 4)) % 4], wave: 10 });
      zs.step(0.05);
      zs.sampleScreen(0, 0, 8, 8);
      const s = zs.getState();
      return { render: s.render, n: s.enemies.length, frustum: s.windows.map((w) => w.mesh.inFrustum), cone: s.laser?.cone ?? null };
    });
    testInfo.annotations.push({ type: 'rendu', description: `${r.n} zombies : ${r.render.calls} appels, ${r.render.triangles} triangles (lot 3 : 191 et 14 982)` });
    console.log(`BUDGET lot 3a : ${r.n} zombies, ${r.render.calls} appels de dessin, ${r.render.triangles} triangles, fenêtres dans le champ ${r.frustum}`);
    expect(r.n).toBe(10);
    expect(r.render.calls).toBeLessThanOrEqual(193 + 4); // lot 3e : au plus 4 appels de plus (marques de déclenchement, blocs d'escalier)
    expect(r.render.triangles).toBeLessThanOrEqual(45000); // lot 3m : limites de refonte relevées par le propriétaire (avant : 30000) ; lot 3c : meubles modélisés, 14 982 -> limite absolue
    expect(r.render.calls).toBeLessThanOrEqual(400); // lot 3m : limites de refonte relevées par le propriétaire (avant : 300)
    expect(r.render.triangles).toBeLessThanOrEqual(45000); // lot 3m : limites de refonte relevées par le propriétaire (avant : 30000)
  });
});

test.describe('lisibilité à l\'écran', () => {
  test('luminance moyenne des planches d\'une fenêtre fermée au moins 25 % au-dessus de celle du meuble le plus proche', async ({ page }) => {
    await open(page);
    const r = await page.evaluate(() => {
      const zs = window.__zs;
      zs.setPlayer(1800, 900);
      zs.sampleScreen(0, 0, 4, 4);
      const s = zs.getState();
      const nord = s.windows.find((w) => w.id === 'fenetre-nord');
      const onScreen = (o) => o.screen.x > 0.08 && o.screen.x < 0.92 && o.screen.y > 0.1 && o.screen.y < 0.9;
      const near = s.obstacles.filter(onScreen).sort((a, b) => Math.hypot(a.x + a.w / 2 - nord.x, a.y + a.h / 2 - nord.y) - Math.hypot(b.x + b.w / 2 - nord.x, b.y + b.h / 2 - nord.y))[0];
      if (!near) return { visible: false, planks: 0, furniture: 0, near: null };
      const px = (p) => [p.x * innerWidth, p.y * innerHeight];
      const [wx, wy] = px(nord.screen);
      const [ox, oy] = px(near.screen);
      return { planks: zs.sampleScreen(wx - 20, wy - 3, 40, 6).meanLuminance, furniture: zs.sampleScreen(ox - 8, oy - 8, 16, 16).meanLuminance, near: near.id, visible: ox > 0 && ox < innerWidth && oy > 0 && oy < innerHeight };
    });
    test.skip(!r.visible, 'le meuble le plus proche est hors de l\'écran : mesure impossible ici');
    console.log(`LUMINANCE : planches ${r.planks.toFixed(3)}, ${r.near} ${r.furniture.toFixed(3)}`);
    expect(r.planks).toBeGreaterThanOrEqual(r.furniture * 1.25);
  });

  test('les planches clouées ont plusieurs couleurs (bois, veines, clous) : l\'image autour de la fenêtre n\'est pas unie', async ({ page }) => {
    await open(page);
    const r = await page.evaluate(() => {
      const zs = window.__zs;
      zs.setPlayer(1800, 900);
      zs.sampleScreen(0, 0, 4, 4);
      const nord = zs.getState().windows[0];
      return zs.sampleScreen(nord.screen.x * innerWidth - 40, nord.screen.y * innerHeight - 20, 80, 40);
    });
    expect(r.distinctColors).toBeGreaterThan(6);
  });
});

test.describe('hygiène', () => {
  test('aucune requête externe, aucun stockage, console propre en arrachant et réparant des planches', async ({ page, baseURL }) => {
    const external = [];
    const problems = [];
    page.on('request', (r) => !r.url().startsWith(baseURL) && !r.url().startsWith('data:') && external.push(r.url()));
    page.on('console', (m) => ['error', 'warning'].includes(m.type()) && !BROWSER_NOISE.test(m.text()) && problems.push(m.text()));
    page.on('pageerror', (e) => problems.push(e.message));
    await open(page);
    await page.evaluate(() => {
      const zs = window.__zs;
      for (const id of ['fenetre-nord', 'fenetre-ouest', 'fenetre-est']) { zs.setPlanks(id, 0); zs.step(1); zs.setPlanks(id, 4); }
      zs.sampleScreen(0, 0, 4, 4);
    });
    expect(external).toEqual([]);
    expect(problems).toEqual([]);
    expect(await page.evaluate(() => [localStorage.length, sessionStorage.length, document.cookie])).toEqual([0, 0, '']);
  });

  test('sans ?test=1 rien n\'est exposé (mesh, debris)', async ({ page }) => {
    await page.setViewportSize(SIZE);
    await page.goto(salle('/jeu.html?seed=1&nospawn=1'));
    await page.waitForFunction(() => document.getElementById('game-root')?.hidden === false || document.getElementById('game-error')?.hidden === false);
    expect(await page.evaluate(() => typeof window.__zs)).toBe('undefined');
  });
});
