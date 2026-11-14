// Lot 8j-D : tirer à travers les grilles de part et d'autre de la fenêtre du bas (F8 : grille-F8 à gauche, grille-F7 à droite ; exemple du
// propriétaire) et par-dessus les meubles bas ; ?test=1&tirtraverse=0 : liste vide, comportement d'avant (le mur arrête laser et balles).
// Onglet « caché » : la partie n'avance que par step() (temps de jeu, jamais de durée réelle). Joueur à l'intérieur, zombie dehors, visée au sud.
import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';

const TIRS = JSON.parse(readFileSync('data/game/maps/rez-de-chaussee/tirs.world.json', 'utf8'));
const WORLD = JSON.parse(readFileSync('data/game/maps/rez-de-chaussee/world.json', 'utf8'));

async function ouvrir(page, extra = '') {
  await page.addInitScript(() => Object.defineProperty(Document.prototype, 'hidden', { get: () => true, configurable: true }));
  await page.setViewportSize({ width: 667, height: 375 });
  await page.goto(`/jeu.html?test=1&seed=1&nospawn=1${extra}`);
  await page.waitForFunction(() => window.__zs || document.getElementById('game-error')?.hidden === false, null, { timeout: 120_000 });
  if (await page.locator('#game-error').isVisible()) test.skip(true, 'WebGL indisponible');
}
// Joueur en (x, yJ), zombie immobile visé plein sud en (x, yZ) ; avance de `secondes` par pas de 0,1 s ; renvoie l'état final et le premier laser.
const tirer = (page, x, yJ, yZ, secondes = 3) => page.evaluate(([px, pj, pz, s]) => {
  const zs = window.__zs;
  zs.setPlayer(px, pj);
  zs.setInput({ move: { x: 0, y: 0 }, aim: { angle: Math.PI / 2 } });
  zs.spawnEnemy(px, pz);
  zs.setWaveParams?.({});
  zs.step(0.1);
  const premier = zs.getState().laser;
  for (let t = 0; t < s; t += 0.1) zs.step(0.1);
  const st = zs.getState();
  return { laser: premier, kills: st.kills, shots: st.shots.length };
}, [x, yJ, yZ, secondes]);

test.describe('tirs à travers les grilles et par-dessus les meubles bas (lot 8j)', () => {
  for (const g of TIRS.rdc.grilles) {
    test(`${g.id} (fenêtre du bas F8) : le laser traverse la grille et le zombie de l'autre côté est touché puis tué`, async ({ page }) => {
      await ouvrir(page);
      const x = (g.a.x + g.b.x) / 2;
      const r = await tirer(page, x, g.a.y - 90, g.a.y + 120);
      expect(r.laser.stoppedBy).toBeNull();
      expect(r.laser.hit).not.toBeNull();
      expect(r.shots).toBeGreaterThan(0);
      expect(r.kills).toBe(1);
    });
  }

  test('?tirtraverse=0 (liste vide, essai) : comme avant le lot, le mur de la grille arrête le laser, aucun tir ne part, le zombie reste en vie', async ({ page }) => {
    await ouvrir(page, '&tirtraverse=0');
    const g = TIRS.rdc.grilles.find((q) => q.id === 'grille-F7');
    const x = (g.a.x + g.b.x) / 2;
    const r = await tirer(page, x, g.a.y - 90, g.a.y + 120);
    expect(r.laser.stoppedBy).toMatch(/^mur-/);
    expect(r.laser.hit).toBeNull();
    expect(r.shots).toBe(0);
    expect(r.kills).toBe(0);
  });

  test('par-dessus une table basse (M10, 40 de haut) : zombie derrière touché ; le joueur, lui, ne la traverse pas', async ({ page }) => {
    await ouvrir(page);
    const t = WORLD.obstacles.find((o) => o.id === 'M10');
    const x = t.x + t.w / 2;
    const r = await tirer(page, x, t.y - 60, t.y + t.h + 70);
    expect(r.laser.stoppedBy).toBeNull();
    expect(r.kills).toBe(1);
    // Le joueur marche vers le sud depuis le nord de la table : il s'arrête contre elle (collisions inchangées).
    const y = await page.evaluate(([px, py]) => {
      const zs = window.__zs;
      zs.killAll();
      zs.setPlayer(px, py);
      zs.setInput({ move: { x: 0, y: 1 }, aim: { angle: Math.PI / 2 } });
      for (let i = 0; i < 20; i += 1) zs.step(0.1);
      zs.setInput({});
      return zs.getState().player.y;
    }, [x, t.y - 60]);
    expect(y).toBeLessThan(t.y); // libre, il aurait avancé de 440 (2 s à 220) ; il reste au nord du bord de la table
  });
});
