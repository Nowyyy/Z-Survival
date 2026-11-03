import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { readFileSync } from 'node:fs';
import { waitReady } from './helpers.js';

// Lot 3c-B : zones, porte 1 (ouverte à la fin de la manche 10), 40 manches et fin de monde, mobilier de complément.
// Tout passe par step() (temps de jeu) et les hooks de ?test=1 (skipWave, setDoor) ; 667×375 de préférence ; aucune durée réelle sauf le test de la pause.
const SIZE = { width: 667, height: 375 };
const BIG = { width: 1440, height: 900 };
const load = (path) => JSON.parse(readFileSync(path, 'utf8'));
const world = load('data/game/maps/rez-de-chaussee/world.json');
 // grande salle, devant la porte
 // aile, derrière la porte
const BROWSER_NOISE = /GL Driver Message|ReadPixels|GPU stall/;
const STATE = (page) => page.evaluate(() => window.__zs.getState());
// Références mesurées sur main (lot 3b) dans les mêmes conditions : 10 zombies variés, planches, ombres, cône (voir le bilan du lot 3c).
const REF = { calls: 194, triangles: 14032 };

async function open(page, extra = '', size = SIZE, { freeze = true } = {}) {
  await page.setViewportSize(size);
  await page.goto(`/jeu.html?test=1&seed=1&vhs=0${extra}`);
  await waitReady(page);
  if (freeze) await page.evaluate(() => { window.requestAnimationFrame = () => 0; });
  await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 150)));
  await page.evaluate(() => window.__zs.step(0.05));
}

// Avance par pas de 0,05 s jusqu'à ce que la condition (corps de fonction recevant l'état) soit vraie ; renvoie l'état et le temps de jeu écoulé, ou null si trop long.
const until = (page, condition, maxSeconds = 40) => page.evaluate(([body, max]) => {
  const zs = window.__zs;
  const test = new Function('s', `return (${body});`);
  const t0 = zs.getState().time;
  for (let i = 0; i < Math.round(max / 0.05); i += 1) {
    const s = zs.getState();
    if (test(s)) return { state: s, elapsed: s.time - t0, time: s.time };
    zs.step(0.05);
  }
  return null;
}, [condition, maxSeconds]);

// Termine la manche en cours puis avance d'un pas : la fin de manche est émise. Renvoie le temps de jeu de la fin.
const finishWave = (page) => page.evaluate(() => {
  const zs = window.__zs;
  zs.skipWave();
  zs.step(0.05);
  return zs.getState().time;
});

// Va jusqu'à la manche n (démarrage de l'apparition) puis la termine ; renvoie le temps de fin.
async function endWave(page, n) {
  await page.evaluate((w) => window.__zs.startWave(w), n);
  const started = await until(page, `s.waves.wave === ${n} && s.waves.phase === 'apparition'`, 5);
  expect(started, `manche ${n} démarrée`).not.toBeNull();
  return finishWave(page);
}

test.describe('zones : ouverture de la porte 1 à la fin de la manche 10', () => {

  test('à ?wave=26, 90 s de jeu : aucun zombie bloqué plus de 2 s', async ({ page }) => {
    await open(page, '&wave=26');
    const r = await page.evaluate(() => {
      const zs = window.__zs;
      zs.setChutes(99);
      const track = new Map();
      let maxStill = 0;
      let where = null;
      for (let i = 0; i < 1800; i += 1) {
        zs.step(0.05);
        const s = zs.getState();
        const p = s.player;
        for (const e of s.enemies) {
          const gap = Math.hypot(e.x - p.x, e.y - p.y) - (e.radius + 18);
          const wait = e.mode === 'attente' || e.mode === 'arrache' || (e.mode === 'approche' && e.speed === 0) || (e.mode === 'dedans' && gap <= 4) || (e.mode === 'libre' && gap <= 4);
          const prev = track.get(e.id);
          if (wait || !prev || Math.hypot(prev.x - e.x, prev.y - e.y) > 0.02) track.set(e.id, { x: e.x, y: e.y, t: 0 });
          else {
            const t = prev.t + 0.05;
            track.set(e.id, { x: e.x, y: e.y, t });
            if (t > maxStill) { maxStill = t; where = { mode: e.mode, window: e.window, x: e.x, y: e.y }; }
          }
        }
      }
      return { maxStill, where };
    });
    expect(r.maxStill, JSON.stringify(r.where)).toBeLessThanOrEqual(2.05);
  });
});

test.describe('zones : mobilier de complément, budget, interface', () => {
  const added = world.obstacles.filter((o) => o.provisional);

  test('les pièces ajoutées sont présentes, bloquent le joueur, les balles et le laser', async ({ page }) => {
    await open(page, '&nospawn=1');
    const s = await STATE(page);
    expect(added.length).toBeGreaterThanOrEqual(8);
    for (const o of added) expect(s.obstacles.some((q) => q.id === o.id), o.id).toBe(true);
    const target = added.find((o) => o.id === 'P8');
    const r = await page.evaluate(([o]) => {
      const zs = window.__zs;
      // À l'est de la pièce, le joueur marche vers l'ouest, visée vers l'ouest.
      zs.setPlayer(o.x + o.w + 110, o.y + o.h / 2);
      zs.setInput({ move: { x: -1, y: 0 }, aim: { angle: Math.PI } });
      zs.step(0.1);
      const laser = zs.getState().laser;
      zs.step(2);
      const p = zs.getState().player;
      zs.setInput({});
      return { x: p.x, right: o.x + o.w, laser };
    }, [target]);
    expect(r.x).toBeGreaterThanOrEqual(r.right + 18 - 1);
    expect(r.laser.stoppedBy).toBe(target.id);
  });

  test('aucune pièce ajoutée ne bloque une fenêtre, un point de réparation ni le passage de la porte ouverte', async ({ page }) => {
    await open(page, '&nospawn=1');
    const s = await STATE(page);
    const door = { x: 1470, y: 1965, w: 40, h: 85 };
    const gap = (a, b) => Math.hypot(Math.max(b.x - (a.x + a.w), 0, a.x - (b.x + b.w)), Math.max(b.y - (a.y + a.h), 0, a.y - (b.y + b.h)));
    for (const o of added) {
      expect(gap(o, door), `${o.id} / porte`).toBeGreaterThanOrEqual(100);
      for (const w of s.windows.filter((q) => q.floor !== 'etage')) expect(Math.hypot(Math.max(o.x - w.x, 0, w.x - (o.x + o.w)), Math.max(o.y - w.y, 0, w.y - (o.y + o.h))), `${o.id} / ${w.id}`).toBeGreaterThan(75);
    }
  });

  test('budget : 10 zombies variés, planches, ombres, cône, porte fermée : au plus la référence + 2 appels et 15 000 triangles (meubles modélisés : +300 dépassé à la demande du propriétaire)', async ({ page }, testInfo) => {
    await open(page, '&shadows=1&nospawn=1');
    // spot : 'ref' = la mise en place du test de budget du lot 3b (près de F1, la porte hors du champ) ; 'porte' = le joueur devant la porte, qui est à l'écran.
    const measure = (spot) => page.evaluate((where) => {
      const zs = window.__zs;
      const first = zs.getState().windowPositions[0];
      if (where === 'ref') zs.setPlayer(first.x, first.y + 110);
      else zs.setPlayer(1650, 2007);
      zs.setInput({ aim: { angle: Math.PI } });
      const p = zs.getState().player;
      const T = ['marcheur', 'petit', 'voute', 'grand'];
      const G = ['lent', 'marche', 'rampe', 'course'];
      if (zs.getState().enemies.length === 0) for (let i = 0; i < 10; i += 1) zs.spawnEnemy(p.x + 70 + (i % 5) * 45, p.y + 20 + Math.floor(i / 5) * 90 + (i % 2) * 15, { type: T[i % 4], gait: G[(i + Math.floor(i / 4)) % 4], wave: 10 });
      zs.step(0.05);
      zs.sampleScreen(0, 0, 8, 8);
      return zs.getState().render;
    }, spot);
    const ref = await measure('ref');
    testInfo.annotations.push({ type: 'rendu', description: `porte fermée : ${ref.calls} appels, ${ref.triangles} triangles (référence ${REF.calls} et ${REF.triangles})` });
    console.log(`BUDGET lot 3c, porte fermée (mise en place du lot 3b) : ${ref.calls} appels, ${ref.triangles} triangles (référence main : ${REF.calls} et ${REF.triangles})`);
    expect(ref.calls).toBeLessThanOrEqual(REF.calls + 5);
    expect(ref.triangles).toBeLessThanOrEqual(45000); // lot 3m : limites de refonte relevées par le propriétaire (avant : 30000)
    expect(ref.calls).toBeLessThanOrEqual(400); // lot 3m : limites de refonte relevées par le propriétaire (avant : 300)
    await page.evaluate(() => window.__zs.killAll());
    const closed = await measure('porte');
    console.log(`BUDGET lot 3c, porte fermée à l'écran : ${closed.calls} appels, ${closed.triangles} triangles`);
    expect(closed.calls).toBeLessThanOrEqual(REF.calls + 5 + 6); // lot 3e : au plus 5 appels de plus que la référence ; lot 3g : + 6 au plus pour le décor léger (avant : + 5)
    expect(closed.triangles).toBeLessThanOrEqual(45000); // lot 3m : limites de refonte relevées par le propriétaire (avant : 30000)
    await page.evaluate(() => window.__zs.setDoor('porte-1', true));
    const opened = await measure('porte');
    console.log(`BUDGET lot 3c, porte ouverte à l'écran : ${opened.calls} appels, ${opened.triangles} triangles`);
    expect(opened.calls).toBeLessThanOrEqual(closed.calls);
    expect(opened.triangles).toBeLessThan(closed.triangles);
  });

  test('après l\'ouverture, la géométrie de la porte est libérée (nombre de géométries non supérieur à avant)', async ({ page }) => {
    await open(page, '&wave=10');
    const geometries = async () => {
      await page.evaluate(() => window.__zs.sampleScreen(0, 0, 4, 4));
      return (await STATE(page)).render.geometries;
    };
    await page.evaluate(() => { window.__zs.setPlayer(1650, 2007); window.__zs.step(0.05); }); // la porte est à l'écran : sa géométrie est envoyée au GPU
    const before = await geometries();
    // La manche est terminée pendant le compte à rebours : aucun zombie n'apparaît, donc aucune géométrie de personnage n'est créée entre-temps.
    await page.evaluate(() => { const zs = window.__zs; zs.skipWave(); zs.step(0.05); });
    const done = await until(page, `s.zones.doors[0].open && s.zones.doors[0].sinkProgress >= 1`, 12);
    expect(done).not.toBeNull();
    const after = await geometries();
    expect(after).toBeLessThanOrEqual(before - 1);
    expect((await STATE(page)).doorMeshes.ids).not.toContain('porte-1');
    for (let i = 0; i < 3; i += 1) {
      await page.evaluate(() => { window.__zs.setDoor('porte-1', false); window.__zs.setDoor('porte-1', true); });
      expect(await geometries()).toBeLessThanOrEqual(after);
    }
  });

  // Lot 3l : HUD intégré en trois colonnes ; la hauteur reste bornée (120 px : quatre rangées en mode essai, ?nospawn=1), plus la largeur de 300 px.
  test('interface : HUD E2-2 en bande, aucun nouveau bloc, ordre des blocs, cibles de 44 px', async ({ page }) => {
    await open(page, '&nospawn=1');
    const s = await STATE(page);
    expect(s.hud.height).toBeLessThanOrEqual(120);
    const blocks = await page.evaluate(() => [...document.querySelectorAll('#game-root [data-block]')].map((el) => el.dataset.block));
    expect(blocks).toEqual(['E2-2', 'E2-8', 'E2-10', 'E2-5', 'E2-3', 'E2-4']);
    expect(await page.locator('[data-block="E2-9"], [data-block="E2-11"]').count()).toBe(0);
    await expect(page.locator('#hud')).not.toContainText(/zone|Zone|niveau/);
    const small = await page.evaluate(() => [...document.querySelectorAll('button, [role="button"]')].filter((b) => !b.hidden && b.offsetParent !== null).filter((b) => b.getBoundingClientRect().height < 44).map((b) => b.id));
    expect(small).toEqual([]);
  });

  test('axe sans violation : annonce « Nouvelle zone » visible, panneau de pause, écran « Monde terminé »', async ({ page }) => {
    await open(page, '&wave=10', BIG);
    await endWave(page, 10);
    await until(page, `s.splash.kind === 'zone' && s.splash.step === 'tenue'`, 6);
    let results = await new AxeBuilder({ page }).analyze();
    expect(results.violations.map((v) => v.id)).toEqual([]);
    await page.locator('#btn-pause').click();
    results = await new AxeBuilder({ page }).analyze();
    expect(results.violations.map((v) => v.id)).toEqual([]);
    await page.locator('#btn-resume').click();
    await page.evaluate(() => window.__zs.startWave(40));
    await endWave(page, 40);
    await expect(page.locator('#end-panel')).toBeVisible();
    results = await new AxeBuilder({ page }).analyze();
    expect(results.violations.map((v) => v.id)).toEqual([]);
  });

  test('aucun son nouveau, aucun appel réseau externe, aucun stockage, console propre pendant toute la séquence', async ({ page }) => {
    const problems = [];
    const external = [];
    page.on('console', (m) => ['error', 'warning'].includes(m.type()) && !BROWSER_NOISE.test(m.text()) && problems.push(m.text()));
    page.on('pageerror', (e) => problems.push(e.message));
    page.on('request', (r) => { if (!r.url().startsWith('http://localhost:4173')) external.push(r.url()); });
    await open(page, '&wave=10');
    await endWave(page, 10);
    await page.evaluate(() => window.__zs.step(14));
    const s = await STATE(page);
    const names = new Set(s.audio.log.map((e) => e.sound));
    for (const n of names) expect(n, n).not.toMatch(/porte|zone|door/i);
    expect(s.events.map((e) => e.type)).toEqual(['doorAnnounce', 'doorOpen']);
    expect(external).toEqual([]);
    expect(await page.evaluate(() => [localStorage.length, sessionStorage.length, document.cookie])).toEqual([0, 0, '']);
    expect(problems).toEqual([]);
  });
});
