import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { waitReady } from './helpers.js';

// Lot 3g, retours du propriétaire (deuxième passe) : mur percé autour du joueur caché, vraies portes et éboulis, ouvertures grillagées, pastilles incrustées.
// 667×375, step() et hooks ; les tests se désactivent seuls si WebGL manque. WebGL logiciel : aucune conclusion de vitesse ni d'esthétique.
const SIZE = { width: 667, height: 375 };
const BROWSER_NOISE = /GL Driver Message|ReadPixels|GPU stall/;
const load = (path) => JSON.parse(readFileSync(path, 'utf8'));
const world = load('data/game/maps/rez-de-chaussee/world.json');
const U = (px) => px * 5 + 800;
const STATE = (page) => page.evaluate(() => window.__zs.getState());

async function open(page, extra = '') {
  await page.setViewportSize(SIZE);
  await page.goto(`/jeu.html?test=1&seed=1&vhs=0&nospawn=1${extra}`);
  await waitReady(page);
  await page.evaluate(() => { window.requestAnimationFrame = () => 0; });
  await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 150)));
  await page.evaluate(() => window.__zs.step(0.05));
}

// Joueur juste au nord du mur sud (face intérieure en y = 2540) : le mur, monté jusqu'au plafond, le cache à la caméra (au sud, tournée vers le nord).
const behindWall = (page) => page.evaluate(() => {
  const zs = window.__zs;
  zs.setPlayer(2300, 2520);
  zs.step(0.05);
  const ps = zs.getState().playerScreen;
  return zs.sampleScreen(ps.x * innerWidth - 6, ps.y * innerHeight - 6, 12, 12);
});

test.describe('mur percé autour du joueur caché', () => {
  test('derrière le mur sud : caché (une seule teinte) avec ?percee=0, visible à travers la trame sinon', async ({ page }) => {
    await open(page, '&percee=0');
    const off = await behindWall(page);
    await open(page);
    const on = await behindWall(page);
    console.log(`MUR PERCÉ : sans ${off.distinctColors} teintes, avec ${on.distinctColors} teintes`);
    expect(off.distinctColors).toBeLessThanOrEqual(3);
    expect(on.distinctColors).toBeGreaterThanOrEqual(10);
  });

  test('le joueur à découvert : le mur percé ne change rien (même image avec et sans)', async ({ page }) => {
    const sample = () => page.evaluate(() => {
      const zs = window.__zs;
      zs.setPlayer(2300, 2300);
      zs.step(0.05);
      const ps = zs.getState().playerScreen;
      return zs.sampleScreen(ps.x * innerWidth - 20, ps.y * innerHeight - 20, 40, 40);
    });
    await open(page, '&percee=0');
    const off = await sample();
    await open(page);
    const on = await sample();
    expect(on.distinctColors).toBe(off.distinctColors);
    expect(Math.abs(on.meanLuminance - off.meanLuminance)).toBeLessThan(0.002);
  });

  // Troisième passe : le joueur devant un mur (au nord du mur sud, assez loin pour être vu) : rien n'est tramé.
  test('le joueur devant un mur, visible : même image avec et sans ?percee @instable', async ({ page }) => {
    const sample = () => page.evaluate(() => {
      const zs = window.__zs;
      zs.setPlayer(2300, 2470);
      zs.step(0.05);
      const ps = zs.getState().playerScreen;
      return zs.sampleScreen(ps.x * innerWidth - 30, ps.y * innerHeight - 30, 60, 60);
    });
    await open(page, '&percee=0');
    const off = await sample();
    await open(page);
    const on = await sample();
    expect(on.distinctColors).toBe(off.distinctColors);
    expect(Math.abs(on.meanLuminance - off.meanLuminance)).toBeLessThan(0.002);
  });

  test('aucun matériau transparent ajouté ; le mur percé ne change pas le nombre d\'appels', async ({ page }) => {
    await open(page, '&percee=0');
    const off = (await STATE(page)).render;
    await open(page);
    const on = (await STATE(page)).render;
    expect(on.calls).toBe(off.calls);
    expect(on.triangles).toBe(off.triangles);
  });
});

test.describe('sortie d\'escalier par le côté en haut (troisième passe)', () => {
  test('arrêté sur le palier du haut de l\'escalier de l\'aile, le joueur sort vers l\'est (aucun mur invisible)', async ({ page }) => {
    await open(page, '&wave=31');
    const r = await page.evaluate(([sx, sy, stop]) => {
      const zs = window.__zs;
      zs.setPlayer(sx, sy);
      zs.step(0.05);
      zs.setInput({ move: { x: 0, y: 1 } });
      for (let n = 0; n < 400; n += 1) {
        zs.step(0.05);
        const s = zs.getState();
        if (s.floor.walk && s.player.y >= stop) break;
      }
      const a = zs.getState();
      zs.setInput({ move: { x: 1, y: 0 } });
      for (let i = 0; i < 30; i += 1) zs.step(0.05);
      zs.setInput({});
      const b = zs.getState();
      return { a: [a.player.x, a.player.y, a.floor.current, Boolean(a.floor.walk)], b: [b.player.x, b.floor.current, Boolean(b.floor.walk)] };
    }, [U(38), U(235), U(303)]);
    expect(r.a.slice(2)).toEqual(['etage', true]);
    expect(r.b[1]).toBe('etage');
    expect(r.b[2]).toBe(false);
    expect(r.b[0]).toBeGreaterThan(r.a[0] + 150);
  });
});

test.describe('portes, éboulis et grilles', () => {
  test('portes fermées : vraie porte (porte-1), éboulis sur les escaliers (portes 2 et 3) ; ?detail=0 : les anciens blocs (10 triangles)', async ({ page }) => {
    const problems = [];
    page.on('console', (m) => ['error', 'warning'].includes(m.type()) && !BROWSER_NOISE.test(m.text()) && problems.push(m.text()));
    page.on('pageerror', (e) => problems.push(e.message));
    await open(page);
    const s = await STATE(page);
    expect(s.doorMeshes.ids.sort()).toEqual(['porte-1', 'porte-2', 'porte-3']);
    expect(s.doorMeshes.triangles).toBeGreaterThan(10 * s.doorMeshes.meshes * 5);
    await open(page, '&detail=0');
    const d0 = await STATE(page);
    expect(d0.doorMeshes.triangles).toBeLessThanOrEqual(12 * d0.doorMeshes.meshes);
    expect(problems).toEqual([]);
  });

  test('une porte ouverte (setDoor) est retirée avec tous ses blocs ; les autres restent', async ({ page }) => {
    await open(page);
    const r = await page.evaluate(() => {
      const zs = window.__zs;
      zs.setDoor('porte-1', true);
      zs.setDoor('porte-2', true);
      zs.step(0.05);
      return zs.getState().doorMeshes.ids;
    });
    expect(r).toEqual(['porte-3']);
  });

  test('ouvertures grillagées : le mur est ouvert là où le modèle n\'en a pas, mais reste solide pour le joueur', async ({ page }) => {
    await open(page);
    const p = await page.evaluate(([x, y]) => {
      const zs = window.__zs;
      zs.setPlayer(x, y);
      zs.setInput({ move: { x: 0, y: 1 } });
      zs.step(3);
      zs.setInput({});
      return zs.getState().player;
    }, [U(186), U(335)]);
    expect(p.y).toBeLessThanOrEqual(2540);
    expect(world.windows.map((w) => w.id)).not.toContain('F7');
  });
});
