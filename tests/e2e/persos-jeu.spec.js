import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { readFileSync } from 'node:fs';
import { buildLayout, windowsWithGaps } from '../../js/core/layout.js';
import { windowGeometries } from '../../js/core/windows.js';
import { salle, waitReady } from './helpers.js';

// Lot 3j-D : essai en jeu derrière ?perso= et ?sang= (667 × 375, step() et hooks de ?test=1). Le jeu par défaut est inchangé.
// Lancer : E2E_FULL=1 npx playwright test tests/e2e/persos-jeu.spec.js
const SIZE = { width: 667, height: 375 };
const load = (p) => JSON.parse(readFileSync(p, 'utf8'));
const T = ['marcheur', 'petit', 'voute', 'grand'];
const G = ['lent', 'marche', 'rampe', 'course'];

async function open(page, query, size = SIZE) {
  await page.setViewportSize(size);
  await page.goto(`/jeu.html?test=1&seed=1${query}`);
  await page.waitForFunction(() => (window.__zs?.getState()?.time ?? 0) > 0.05 || document.getElementById('game-error')?.hidden === false, null, { timeout: 90_000 });
  if (await page.locator('#game-error').isVisible()) test.skip(true, 'WebGL indisponible dans cet environnement : test désactivé');
}
// 10 zombies variés devant le joueur (même placement que les mesures de budget du jeu).
const spawnTen = (page, wave = 10, floor = 'rdc', aim = 0) => page.evaluate(([w, f, a, types, gaits]) => {
  const zs = window.__zs;
  const p = zs.getState().player;
  zs.setInput({ aim: { angle: a } });
  for (let i = 0; i < 10; i += 1) zs.spawnEnemy(p.x + 70 + (i % 5) * 45, p.y - 90 + Math.floor(i / 5) * 90 + (i % 2) * 15, { type: types[i % 4], gait: gaits[(i + Math.floor(i / 4)) % 4], wave: w, floor: f });
}, [wave, floor, aim, T, G]);
const measure = (page) => page.evaluate(() => {
  window.__zs.step(0.05);
  window.__zs.sampleScreen(0, 0, 8, 8);
  return window.__zs.getState().render;
});
// Résumé logique d'une partie : positions, vies, tués, vague, argent (aucun champ visuel).
const logic = (page) => page.evaluate(() => {
  const s = window.__zs.getState();
  return { player: [s.player.x, s.player.y, s.player.health], enemies: s.enemies.map((e) => [e.id, e.type, e.gait, e.x, e.y, e.health, e.mode]), kills: s.kills, wave: s.waves.wave, phase: s.waves.phase, money: s.economy?.balance ?? null, time: s.time };
});
// Jeu figé : la page se croit cachée dès le chargement, la boucle d'images ne démarre jamais ; seul step() fait avancer la partie (aucune
// image réelle ne glisse entre deux appels du test : comparaison exacte).
async function openFrozen(page, query) {
  await page.setViewportSize(SIZE);
  await page.addInitScript(() => Object.defineProperty(Document.prototype, 'hidden', { get: () => true, configurable: true }));
  await page.goto(`/jeu.html?test=1${query}`);
  await page.waitForFunction(() => window.__zs || document.getElementById('game-error')?.hidden === false, null, { timeout: 90_000 });
  if (await page.locator('#game-error').isVisible()) test.skip(true, 'WebGL indisponible dans cet environnement : test désactivé');
}
const sixHundredSteps = (page) => page.evaluate(() => {
  const zs = window.__zs;
  zs.setInput({ aim: { angle: 0.4 }, move: { x: 0.3, y: -0.2 } });
  for (let i = 0; i < 600; i += 1) zs.step(0.05);
  zs.setInput({});
});

test.describe('essai en jeu des personnages v2 et du sang', () => {
  test.skip(({ isMobile }) => isMobile, 'bureau (la fenêtre est réglée par chaque test)');

  test.describe('par défaut (choix du propriétaire : variantes « riche », sang complet)', () => {
    test('sans ?test=1, aucun crochet n\'est exposé, même avec ?perso=B&sang=1', async ({ page }) => {
      await page.setViewportSize(SIZE);
      await page.goto('/jeu.html?perso=B&sang=1');
      await page.waitForTimeout(2500);
      expect(await page.evaluate(() => [typeof window.__zs, typeof window.__zsPersos])).toEqual(['undefined', 'undefined']);
    });
  });

  for (const q of ['', '&perso=A', '&perso=B', '&perso=C', '&perso=riche&sang=0', '&perso=actuel&sang=reduit', '&perso=actuel&sang=1', '&perso=B&sang=reduit']) {
    test(`invariance : « ${q || 'par défaut'} » donne le même état logique que le jeu d'avant le lot (?perso=actuel&sang=0, graine 5, 600 pas)`, async ({ page }) => {
      await openFrozen(page, '&seed=5&wave=3&perso=actuel&sang=0');
      await sixHundredSteps(page);
      const base = await logic(page);
      await openFrozen(page, `&seed=5&wave=3${q}`);
      await sixHundredSteps(page);
      expect(await logic(page)).toEqual(base);
      expect(base.enemies.length + base.kills).toBeGreaterThan(0);
    });
  }

  for (const [id, query, player, floor, wave, aim] of [['R1', '', [2575, 2250], 'rdc', 10, 0], ['R2', '&map=salle', [1800, 900], 'rdc', 10, Math.PI], ['U1', '&wave=21&floor=1', [1195, 1700], 'etage', 21, 0], ['U4', '&wave=31&floor=1', [1990, 2245], 'etage', 31, 0]]) {
    test(`budget ${id} par défaut (« riche », sang complet), ombres et cône : au plus 45 000 triangles et 400 appels`, async ({ page }, testInfo) => {
      await open(page, `&nospawn=1&shadows=1${query}`);
      await page.evaluate(([x, y]) => window.__zs.setPlayer(x, y), player);
      await spawnTen(page, wave, floor, aim);
      const r = await measure(page);
      testInfo.annotations.push({ type: 'rendu', description: `${id} : ${r.calls} appels, ${r.triangles} triangles` });
      console.log(`BUDGET 3j ${id} défaut (riche, sang complet) : ${r.calls} appels, ${r.triangles} triangles`);
      expect(r.calls).toBeLessThanOrEqual(400);
      expect(r.triangles).toBeLessThanOrEqual(45_000);
    });
  }

  test('aucune fuite de géométrie ni de texture après 10 allers-retours d\'étage et 3 « Rejouer »', async ({ page }) => {
    await open(page, '&perso=B&sang=1&nospawn=1&wave=21');
    const round = () => page.evaluate(() => {
      const zs = window.__zs;
      const p = zs.getState().player;
      zs.setLevels({ degats: 10 });
      zs.setInput({ aim: { angle: 0 } });
      for (let i = 0; i < 6; i += 1) zs.spawnEnemy(p.x + 100 + i * 30, p.y - 50 + i * 10, { type: ['marcheur', 'petit', 'voute', 'grand'][i % 4], gait: 'marche', wave: 1 });
      zs.step(3);
      for (let k = 0; k < 10; k += 1) {
        zs.setFloor(1);
        zs.step(0.1);
        zs.setFloor(0);
        zs.step(0.1);
      }
      zs.killAll();
      zs.step(9);
      zs.sampleScreen(0, 0, 4, 4);
      const s = zs.getState().render;
      return [s.geometries, s.textures];
    });
    const first = await round();
    let last = first;
    for (let k = 0; k < 3; k += 1) {
      await page.locator('#btn-pause').click();
      await page.locator('#btn-restart').click();
      last = await round();
    }
    expect(last[0]).toBeLessThanOrEqual(first[0] + 4);
    expect(last[1]).toBeLessThanOrEqual(first[1] + 2);
  });

  test('console propre (hors messages du pilote GL) avec ?perso=B&sang=1', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => (m.type() === 'error' || (m.type() === 'warning' && !/GL Driver|GPU stall|ReadPixels/.test(m.text()))) && errors.push(m.text()));
    await open(page, '&perso=B&sang=1&nospawn=1');
    await spawnTen(page);
    await page.evaluate(() => window.__zs.step(5));
    expect(errors).toEqual([]);
  });

  test('axe : aucune violation avec ?perso=B&sang=1', async ({ page }) => {
    await open(page, '&perso=B&sang=1&nospawn=1');
    await spawnTen(page);
    await page.evaluate(() => window.__zs.step(1));
    const r = await new AxeBuilder({ page }).analyze();
    expect(r.violations.map((v) => `${v.id} : ${v.nodes.length}`)).toEqual([]);
  });
});

// Retour du propriétaire après la livraison : « il ne faut pas pouvoir construire et tirer en même temps ». Le tir passe avant : viser un
// zombie interrompt la réparation (la planche garde sa progression), qui reprend sans cible. Salle de test, boucle d'images arrêtée.
test.describe('tir ou réparation, jamais les deux', () => {
  const N = windowGeometries(windowsWithGaps(buildLayout(load('data/game/world.json'), load('data/game/decor.json'), {})), load('data/game/windows.json')).find((g) => g.id === 'fenetre-nord');
  for (const perso of ['riche', 'actuel']) {
    test(`viser un zombie arrête la réparation, elle reprend sans cible (${perso})`, async ({ page }) => {
      await page.setViewportSize(SIZE);
      await page.goto(salle(`/jeu.html?test=1&seed=1&nospawn=1&perso=${perso}`));
      await waitReady(page);
      await page.evaluate(() => { window.requestAnimationFrame = () => 0; });
      await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 150)));
      const r = await page.evaluate(([x, y]) => {
        const zs = window.__zs;
        const w = () => zs.getState().windows.find((v) => v.id === 'fenetre-nord');
        zs.step(0.05);
        zs.setPlanks('fenetre-nord', 1);
        zs.setPlayer(x, y);
        zs.setInput({ aim: { angle: Math.PI / 2 } }); // vers le sud, dans la salle
        zs.step(0.5);
        const free = { repairing: w().repairing, progress: w().repairProgress };
        zs.spawnEnemy(x, y + 220, { type: 'grand', gait: 'lent', wave: 30 });
        zs.step(0.1);
        const start = { progress: w().repairProgress, kills: zs.getState().kills };
        let repairing = false;
        let shots = 0;
        for (let i = 0; i < 12; i += 1) {
          zs.step(0.05);
          repairing ||= w().repairing;
          shots = Math.max(shots, zs.getState().bullets?.length ?? 0);
        }
        const during = { progress: w().repairProgress, enemies: zs.getState().enemies.length };
        zs.killAll();
        zs.step(0.6);
        return { free, start, during, repairing, shots, after: { repairing: w().repairing, progress: w().repairProgress, planks: w().planks } };
      }, [N.repairSpot.x, N.repairSpot.y]);
      expect(r.free.repairing).toBe(true);
      expect(r.free.progress).toBeGreaterThan(0);
      expect(r.during.enemies).toBe(1); // le zombie (vie de la manche 30) est toujours visé
      expect(r.shots).toBeGreaterThan(0); // le joueur tire
      expect(r.repairing).toBe(false);
      expect(r.during.progress).toBeCloseTo(r.start.progress, 6); // la planche garde sa progression, sans avancer
      expect(r.after.repairing).toBe(true);
      expect(r.after.progress + r.after.planks).toBeGreaterThan(r.during.progress + 1);
    });
  }

  // Pixels couleur laser (--game-laser #ff8c7c et son halo) comptés sur l'image rendue : jamais pendant la réparation, présents sinon.
  test('aucun laser pendant la réparation ; il revient dès qu\'elle s\'arrête', async ({ page }) => {
    await page.setViewportSize(SIZE);
    await page.goto(salle('/jeu.html?test=1&seed=1&nospawn=1&vhs=0'));
    await waitReady(page);
    await page.evaluate(() => { window.requestAnimationFrame = () => 0; });
    await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 150)));
    const r = await page.evaluate(([x, y]) => {
      const zs = window.__zs;
      const laserPixels = () => {
        zs.sampleScreen(0, 0, 4, 4); // rendu de l'image ; lue tout de suite, dans la même tâche
        const src = document.querySelector('#game-canvas canvas');
        const c = document.createElement('canvas');
        c.width = src.width;
        c.height = src.height;
        const g = c.getContext('2d');
        g.drawImage(src, 0, 0);
        const d = g.getImageData(0, 0, c.width, c.height).data;
        let n = 0;
        for (let i = 0; i < d.length; i += 4) if (d[i] > 180 && d[i] - d[i + 1] > 60 && d[i] - d[i + 2] > 70 && d[i + 1] > 70) n += 1;
        return n;
      };
      const repairing = () => zs.getState().windows.find((v) => v.id === 'fenetre-nord').repairing;
      zs.step(0.05);
      zs.setPlanks('fenetre-nord', 1);
      zs.setPlayer(x, y);
      zs.setInput({ aim: { angle: Math.PI / 2 } });
      zs.step(0.3);
      const during = { repairing: repairing(), pixels: laserPixels(), logic: zs.getState().laser !== null };
      zs.setPlanks('fenetre-nord', 4); // fenêtre complète : plus de réparation
      zs.step(0.1);
      const after = { repairing: repairing(), pixels: laserPixels() };
      return { during, after };
    }, [N.repairSpot.x, N.repairSpot.y]);
    expect(r.during.repairing).toBe(true);
    expect(r.during.logic).toBe(true); // la visée continue (un zombie visé arrêterait la réparation)
    expect(r.during.pixels).toBe(0);
    expect(r.after.repairing).toBe(false);
    expect(r.after.pixels).toBeGreaterThan(30);
  });
});
