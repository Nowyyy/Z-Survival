import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { readFileSync } from 'node:fs';
import { buildLayout, windowsWithGaps } from '../../js/core/layout.js';
import { windowGeometries } from '../../js/core/windows.js';
import { waitReady } from './helpers.js';

// Lot 3-B : fenêtres à planches, siège par les zombies, réparation automatique, sons de planches. Tout passe par step() (temps de jeu) et les hooks :
// aucune durée n'est attendue en temps réel. Petite fenêtre (667×375) ; les tests se désactivent seuls si WebGL manque.
const SIZE = { width: 667, height: 375 };
const load = (name) => JSON.parse(readFileSync(`data/game/${name}.json`, 'utf8'));
const cfg = load('windows');
const world = load('world');
const layout = buildLayout(world, load('decor'), {});
const geoms = windowGeometries(windowsWithGaps(layout), cfg);
const N = geoms.find((g) => g.id === 'fenetre-nord');
const URL = (extra = '') => `/jeu.html?test=1&seed=1${extra.includes('nospawn') ? '' : '&nospawn=1'}${extra}`;
const state = (page) => page.evaluate(() => window.__zs.getState());
const win = async (page, id = 'fenetre-nord') => (await state(page)).windows.find((w) => w.id === id);
const BROWSER_NOISE = /GL Driver Message|ReadPixels|GPU stall/;

// La boucle de rendu est arrêtée une fois la partie prête : le temps de jeu n'avance que par step() (durées exactes). { live: true } la garde (sons).
async function open(page, extra = '', size = SIZE, { live = false } = {}) {
  await page.setViewportSize(size);
  await page.goto(URL(extra));
  await waitReady(page);
  if (live) return;
  await page.evaluate(() => { window.requestAnimationFrame = () => 0; });
  await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 150)));
  await page.evaluate(() => window.__zs.step(0.05));
}

test.describe('planches au départ', () => {
  test('chaque fenêtre démarre avec 4 planches fermées', async ({ page }) => {
    await open(page);
    const s = await state(page);
    expect(s.windows.map((w) => [w.id, w.planks, w.maxPlanks, w.open])).toEqual([['fenetre-nord', 4, 4, false], ['fenetre-ouest', 4, 4, false], ['fenetre-est', 4, 4, false]]);
  });

  test('?planks=0 donne des fenêtres ouvertes, ?planks=2 en donne 2', async ({ page }) => {
    await open(page, '&planks=0');
    expect((await state(page)).windows.map((w) => [w.planks, w.open])).toEqual([[0, true], [0, true], [0, true]]);
    await open(page, '&planks=2');
    expect((await state(page)).windows.map((w) => w.planks)).toEqual([2, 2, 2]);
  });

  test.describe('?planks= invalide : ignoré (4 planches)', () => {
    for (const bad of ['9', '-1', 'x', '2.5', '']) {
      test(`?planks=${bad}`, async ({ page }) => {
        await open(page, `&planks=${bad}`);
        expect((await state(page)).windows.map((w) => w.planks)).toEqual([4, 4, 4]);
      });
    }
  });

  test('setPlanks règle une fenêtre ; une valeur invalide est refusée', async ({ page }) => {
    await open(page);
    expect(await page.evaluate(() => [window.__zs.setPlanks('fenetre-est', 1), window.__zs.setPlanks('fenetre-est', 7), window.__zs.setPlanks('inconnue', 1)])).toEqual([true, false, false]);
    expect((await win(page, 'fenetre-est')).planks).toBe(1);
  });

  test('?planks= n\'expose rien sans ?test=1 et ne stocke rien', async ({ page }) => {
    await page.setViewportSize(SIZE);
    await page.goto('/jeu.html?seed=1&nospawn=1&planks=2');
    await expect(page.locator('#hud-windows')).toContainText('Fenêtres : N 2 · O 2 · E 2');
    expect(await page.evaluate(() => [typeof window.__zs, localStorage.length, sessionStorage.length, document.cookie])).toEqual(['undefined', 0, 0, '']);
  });
});

test.describe('siège : arrachage, file, escalade', () => {
  test('un zombie créé par spawnAtWindow va à son emplacement, arrache les 4 planches (8,8 s à ±15 %) puis escalade (1,2 s ±15 %) et entre', async ({ page }) => {
    await open(page);
    const r = await page.evaluate((slots) => {
      const zs = window.__zs;
      const id = zs.spawnAtWindow('fenetre-nord', 'marcheur');
      let t = 0;
      let tearStart = null;
      let openAt = null;
      let climbStart = null;
      let enteredAt = null;
      let early = false;
      for (let i = 0; i < 1600 && enteredAt === null; i += 1) {
        zs.step(0.05);
        t += 0.05;
        const s = zs.getState();
        const w = s.windows.find((x) => x.id === 'fenetre-nord');
        const e = s.enemies.find((x) => x.id === id);
        if (tearStart === null && w.tearers === 1 && e.mode === 'arrache' && Math.hypot(e.x - slots[e.slot].x, e.y - slots[e.slot].y) < 5) tearStart = t;
        if (openAt === null && w.planks === 0) openAt = t;
        if (climbStart === null && e.climb && e.climb.t > 0) climbStart = t;
        if (openAt === null && e.y > 824) early = true; // dans la salle avant l'ouverture
        if (e.mode === 'dedans') enteredAt = t;
      }
      return { tearStart, openAt, climbStart, enteredAt, early };
    }, N.slots);
    expect(r.early).toBe(false);
    expect(r.openAt - r.tearStart).toBeGreaterThan(8.8 * 0.85);
    expect(r.openAt - r.tearStart).toBeLessThan(8.8 * 1.15);
    expect(r.enteredAt - r.climbStart).toBeGreaterThan(1.2 * 0.85);
    expect(r.enteredAt - r.climbStart).toBeLessThan(1.2 * 1.15 + 0.1);
  });

  test('deux arracheurs vont environ deux fois plus vite (4,4 s ±20 %)', async ({ page }) => {
    await open(page);
    const r = await page.evaluate((slots) => {
      const zs = window.__zs;
      zs.spawnAtWindow('fenetre-nord', 'marcheur');
      zs.spawnAtWindow('fenetre-nord', 'marcheur');
      let t = 0;
      let both = null;
      let openAt = null;
      for (let i = 0; i < 1200 && openAt === null; i += 1) {
        zs.step(0.05);
        t += 0.05;
        const w = zs.getState().windows.find((x) => x.id === 'fenetre-nord');
        const there = zs.getState().enemies.filter((e) => e.mode === 'arrache' && Math.hypot(e.x - slots[e.slot].x, e.y - slots[e.slot].y) < 5).length;
        if (both === null && there === 2) both = t;
        if (w.planks === 0) openAt = t;
      }
      return { both, openAt };
    }, N.slots);
    expect(r.openAt - r.both).toBeGreaterThan(4.4 * 0.8);
    expect(r.openAt - r.both).toBeLessThan(4.4 * 1.25);
  });

  test('aucun zombie n\'est dans la salle avant l\'ouverture de sa fenêtre (vérifié à chaque pas), trois fenêtres, six zombies', async ({ page }) => {
    await open(page);
    const bad = await page.evaluate(() => {
      const zs = window.__zs;
      for (const id of ['fenetre-nord', 'fenetre-ouest', 'fenetre-est']) {
        zs.spawnAtWindow(id, 'marcheur');
        zs.spawnAtWindow(id, 'voute');
      }
      const opened = new Set();
      const violations = [];
      for (let i = 0; i < 900; i += 1) {
        zs.step(0.05);
        const s = zs.getState();
        for (const w of s.windows) if (w.open) opened.add(w.id);
        for (const e of s.enemies) {
          const inside = e.x > 824 && e.x < 2776 && e.y > 824 && e.y < 1976;
          if (inside && !opened.has(e.window)) violations.push([i, e.id, e.window]);
        }
      }
      return violations.slice(0, 3);
    });
    expect(bad).toEqual([]);
  });

  test('au plus 2 arracheurs, la file reste ordonnée et aucun zombie ne reste bloqué plus de 2 s hors des états d\'attente (6 zombies sur une fenêtre)', async ({ page }) => {
    await open(page);
    const r = await page.evaluate(() => {
      const zs = window.__zs;
      for (let i = 0; i < 6; i += 1) zs.spawnAtWindow('fenetre-ouest', i % 2 ? 'petit' : 'marcheur');
      const still = new Map();
      let maxStill = 0;
      let maxTearers = 0;
      let maxQueue = 0;
      for (let i = 0; i < 1200; i += 1) {
        zs.step(0.05);
        const s = zs.getState();
        const w = s.windows.find((x) => x.id === 'fenetre-ouest');
        maxTearers = Math.max(maxTearers, w.tearers);
        maxQueue = Math.max(maxQueue, w.queue);
        for (const e of s.enemies) {
          const wait = e.mode === 'attente' || e.mode === 'arrache' || e.mode === 'dedans' || (e.mode === 'approche' && e.speed === 0);
          const prev = still.get(e.id);
          const moved = !prev || Math.hypot(prev.x - e.x, prev.y - e.y) > 0.02;
          if (wait || moved) still.set(e.id, { x: e.x, y: e.y, t: 0 });
          else {
            const t = prev.t + 0.05;
            still.set(e.id, { x: e.x, y: e.y, t });
            maxStill = Math.max(maxStill, t);
          }
        }
      }
      return { maxStill, maxTearers, maxQueue };
    });
    expect(r.maxTearers).toBeLessThanOrEqual(2);
    expect(r.maxQueue).toBeGreaterThanOrEqual(1);
    expect(r.maxStill).toBeLessThanOrEqual(2);
  });

  test('un zombie en attente a un rang ; au plus 2 grimpeurs à la fois', async ({ page }) => {
    await open(page, '&planks=0');
    const r = await page.evaluate(() => {
      const zs = window.__zs;
      for (let i = 0; i < 5; i += 1) zs.spawnAtWindow('fenetre-est', 'marcheur');
      let maxClimbers = 0;
      for (let i = 0; i < 400; i += 1) {
        zs.step(0.05);
        maxClimbers = Math.max(maxClimbers, zs.getState().windows.find((x) => x.id === 'fenetre-est').climbers);
      }
      return { maxClimbers, modes: zs.getState().enemies.map((e) => e.mode) };
    });
    expect(r.maxClimbers).toBeLessThanOrEqual(2);
    expect(r.maxClimbers).toBeGreaterThanOrEqual(1);
  });

  test('les zombies de la vague 1 arrivent hors de la vue, vont à leur fenêtre, arrachent, entrent et poursuivent le joueur ; la vague se termine', async ({ page }) => {
    await open(page, '&wave=1&nospawn=0&lvl=all:10'); // niveaux maximaux : le joueur immobile au centre survit à des zombies qui arrivent groupés
    const r = await page.evaluate(() => {
      const zs = window.__zs;
      let entered = 0;
      const seen = new Set();
      let early = 0;
      let ended = false;
      const opened = new Set();
      for (let i = 0; i < 6000 && !ended; i += 1) {
        zs.step(0.05);
        const s = zs.getState();
        for (const w of s.windows) if (w.open) opened.add(w.id);
        for (const e of s.enemies) {
          if (e.entered && !opened.has(e.window)) early += 1;
          if (e.mode === 'dedans') seen.add(e.id);
        }
        // Le joueur n'a pas de visée dans ce test : dès qu'un zombie est entré (et a donc poursuivi le joueur), on le retire.
        if (s.enemies.some((e) => e.mode === 'dedans')) zs.killAll();
        entered = seen.size;
        ended = s.waves.phase === 'terminee' || s.waves.wave > 1;
      }
      const s = zs.getState();
      return { ended, entered, early, hidden: s.spawnLog.every((l) => l.hidden), spawned: s.spawnLog.length, dead: s.dead };
    });
    expect(r.hidden).toBe(true);
    expect(r.spawned).toBeGreaterThan(0);
    expect(r.early).toBe(0);
    expect(r.entered).toBeGreaterThan(0);
    expect(r.ended).toBe(true);
  });
});

test.describe('réparation automatique', () => {
  const spot = { x: N.repairSpot.x, y: N.repairSpot.y };

  test('au niveau 0 : une planche posée en 1,8 s (±15 %), sans aucun bouton', async ({ page }) => {
    await open(page);
    await page.evaluate(([x, y]) => { window.__zs.setPlanks('fenetre-nord', 2); window.__zs.setPlayer(x, y); }, [spot.x, spot.y]);
    const t = await page.evaluate(() => {
      const zs = window.__zs;
      let t = 0;
      while (t < 6 && zs.getState().windows.find((w) => w.id === 'fenetre-nord').planks < 3) {
        zs.step(0.05);
        t += 0.05;
      }
      return t;
    });
    expect(t).toBeGreaterThan(1.8 * 0.85);
    expect(t).toBeLessThan(1.8 * 1.15 + 0.1);
    expect(await page.locator('#hud button').count()).toBe(0);
  });

  test('?lvl=reparation:10 : 0,5 s par planche (±20 %)', async ({ page }) => {
    await open(page, '&lvl=reparation:10');
    expect((await state(page)).stats.values.repairTime).toBeCloseTo(0.5013, 3);
    await page.evaluate(([x, y]) => { window.__zs.setPlanks('fenetre-nord', 2); window.__zs.setPlayer(x, y); }, [spot.x, spot.y]);
    const t = await page.evaluate(() => {
      const zs = window.__zs;
      let t = 0;
      while (t < 3 && zs.getState().windows.find((w) => w.id === 'fenetre-nord').planks < 3) {
        zs.step(0.05);
        t += 0.05;
      }
      return t;
    });
    expect(t).toBeGreaterThan(0.5 * 0.8);
    expect(t).toBeLessThan(0.5 * 1.2 + 0.1);
  });

  test('aucune réparation hors du rayon de réparation', async ({ page }) => {
    await open(page);
    await page.evaluate(() => { window.__zs.setPlanks('fenetre-nord', 2); window.__zs.setPlayer(1800, 1300); window.__zs.step(6); });
    const w = await win(page);
    expect([w.planks, w.repairing]).toEqual([2, false]);
  });

  test('aucune réparation tant qu\'un zombie occupe un emplacement ; reprise après sa mort', async ({ page }) => {
    await open(page);
    await page.evaluate(([x, y]) => { window.__zs.setPlanks('fenetre-nord', 3); window.__zs.setPlayer(x, y); window.__zs.spawnAtWindow('fenetre-nord', 'grand'); }, [spot.x, spot.y]);
    // le zombie arrive : la réparation de la 4e planche peut avoir lieu avant ; on attend l'occupation d'un emplacement
    await page.evaluate(() => { for (let i = 0; i < 600; i += 1) { window.__zs.step(0.05); const w = window.__zs.getState().windows.find((x) => x.id === 'fenetre-nord'); if (w.tearers > 0) break; } });
    let w = await win(page);
    expect(w.tearers).toBeGreaterThan(0);
    expect(w.repairBlocked).toBe(true);
    expect(w.repairing).toBe(false);
    const before = w.planks;
    await page.evaluate(() => window.__zs.step(0.05));
    expect((await win(page)).repairProgress).toBeLessThanOrEqual(w.repairProgress + 1e-9);
    await page.evaluate(() => window.__zs.killAll());
    await page.evaluate(() => window.__zs.step(4));
    w = await win(page);
    expect(w.repairBlocked).toBe(false);
    expect(w.planks).toBe(4);
    expect(before).toBeLessThanOrEqual(4);
  });
});

test.describe('tirs et déplacements', () => {
  test('un zombie derrière une fenêtre fermée est touché : les planches ne bloquent ni laser ni balles', async ({ page }) => {
    await open(page, '&lvl=degats:5');
    const r = await page.evaluate(() => {
      const zs = window.__zs;
      const id = zs.spawnAtWindow('fenetre-nord', 'grand');
      for (let i = 0; i < 400; i += 1) {
        zs.step(0.05);
        const e = zs.getState().enemies.find((x) => x.id === id);
        if (e.mode === 'arrache') break;
      }
      const e0 = zs.getState().enemies.find((x) => x.id === id);
      zs.setPlayer(e0.x, 920);
      zs.setInput({ aim: { angle: -Math.PI / 2 } });
      zs.step(2);
      const e1 = zs.getState().enemies.find((x) => x.id === id);
      return { before: e0.hp, after: e1 ? e1.hp : 0, planks: zs.getState().windows.find((w) => w.id === 'fenetre-nord').planks };
    });
    expect(r.planks).toBeGreaterThan(0);
    expect(r.after).toBeLessThan(r.before);
  });

  for (const planks of [0, 4]) {
    test(`le joueur ne franchit jamais une fenêtre à ${planks} planche(s)`, async ({ page }) => {
      await open(page, `&planks=${planks}`);
      const minY = await page.evaluate(() => {
        const zs = window.__zs;
        zs.setPlayer(1800, 900);
        zs.setInput({ move: { x: 0, y: -1 } });
        let m = Infinity;
        for (let i = 0; i < 60; i += 1) { zs.step(0.05); m = Math.min(m, zs.getState().player.y); }
        return m;
      });
      expect(minY).toBeGreaterThanOrEqual(824);
    });
  }
});

test.describe('interface : ligne Fenêtres, indicateur E2-9, annonces', () => {
  for (const size of [SIZE, { width: 1440, height: 900 }]) {
    test(`la ligne « Fenêtres » est présente, dans les marges de 16 px et sans chevaucher Pause (${size.width}×${size.height})`, async ({ page }) => {
      await open(page, '', size);
      await expect(page.locator('#hud-windows')).toHaveText('Fenêtres : N 4 · O 4 · E 4');
      const r = await page.evaluate(() => {
        const b = (sel) => document.querySelector(sel).getBoundingClientRect();
        return { line: b('#hud-windows'), hud: b('#hud'), pause: b('#btn-pause') };
      });
      expect(r.line.left).toBeGreaterThanOrEqual(16);
      expect(r.line.top).toBeGreaterThanOrEqual(16);
      expect(r.hud.right).toBeLessThanOrEqual(r.pause.left);
      expect(r.hud.bottom).toBeLessThan(size.height - 16);
    });
  }

  test('une fenêtre sans planche est écrite « ouverte » en texte, une fenêtre attaquée est suivie d\'un « ! »', async ({ page }) => {
    await open(page);
    await page.evaluate(() => window.__zs.setPlanks('fenetre-ouest', 0));
    await page.evaluate(() => window.__zs.step(0.05));
    await expect(page.locator('#hud-windows')).toContainText('O ouverte');
    await page.evaluate((slots) => { const zs = window.__zs; zs.spawnAtWindow('fenetre-nord', 'marcheur'); for (let i = 0; i < 400; i += 1) { zs.step(0.05); if (zs.getState().enemies.some((e) => e.mode === 'arrache' && Math.hypot(e.x - slots[e.slot].x, e.y - slots[e.slot].y) < 5)) break; } zs.step(0.1); }, N.slots);
    await expect(page.locator('#hud-windows')).toContainText('N 4 !');
  });

  test('E2-9 apparaît près de la fenêtre pendant la réparation : « Réparation », progression, dans les marges', async ({ page }) => {
    await open(page);
    await page.evaluate(([x, y]) => { window.__zs.setPlanks('fenetre-nord', 2); window.__zs.setPlayer(x, y); window.__zs.step(0.9); }, [N.repairSpot.x, N.repairSpot.y]);
    const repair = page.locator('#repair');
    await expect(repair).toBeVisible();
    await expect(repair).toHaveAttribute('data-block', 'E2-9');
    await expect(repair).toHaveAttribute('aria-hidden', 'true');
    await expect(page.locator('#repair-label')).toHaveText('Réparation');
    await expect.poll(() => repair.evaluate((el) => Number(el.style.getPropertyValue('--repair-progress')))).toBeGreaterThan(0.3);
    const box = await repair.boundingBox();
    expect(box.x).toBeGreaterThanOrEqual(16);
    expect(box.y).toBeGreaterThanOrEqual(16);
    expect(box.x + box.width).toBeLessThanOrEqual(SIZE.width - 16);
    expect(await repair.evaluate((el) => getComputedStyle(el).pointerEvents)).toBe('none');
  });

  test('E2-9 affiche « Fenêtre occupée » quand la réparation est bloquée', async ({ page }) => {
    await open(page);
    await page.evaluate(([x, y]) => {
      const zs = window.__zs;
      zs.spawnAtWindow('fenetre-nord', 'marcheur');
      for (let i = 0; i < 600; i += 1) { zs.step(0.05); if (zs.getState().windows[0].tearers > 0) break; }
      zs.setPlanks('fenetre-nord', 3);
      zs.setPlayer(x, y);
      zs.step(0.1);
    }, [N.repairSpot.x, N.repairSpot.y]);
    await expect(page.locator('#repair-label')).toHaveText('Fenêtre occupée');
  });

  test('E2-9 est masqué loin de la fenêtre et quand toutes les planches sont là', async ({ page }) => {
    await open(page);
    await page.evaluate(() => window.__zs.step(0.1));
    await expect(page.locator('#repair')).toBeHidden();
    await page.evaluate(([x, y]) => { window.__zs.setPlanks('fenetre-nord', 1); window.__zs.setPlayer(x, y + 300); window.__zs.step(0.1); }, [N.repairSpot.x, N.repairSpot.y]);
    await expect(page.locator('#repair')).toBeHidden();
  });

  test('#hud-live annonce « Fenêtre nord ouverte » une fois par fenêtre et par 10 s, jamais le décompte de planches', async ({ page }) => {
    await open(page);
    const texts = await page.evaluate(() => {
      const zs = window.__zs;
      const live = document.getElementById('hud-live');
      const seen = [];
      const watch = () => { if (live.textContent && seen.at(-1) !== live.textContent) seen.push(live.textContent); };
      zs.spawnAtWindow('fenetre-nord', 'grand');
      for (let i = 0; i < 400; i += 1) { zs.step(0.05); watch(); }
      return seen;
    });
    expect(texts).toContain('Fenêtre nord ouverte');
    expect(texts.every((t) => !/planche/i.test(t))).toBe(true);
    expect(texts.filter((t) => t === 'Fenêtre nord ouverte')).toHaveLength(1);
  });

  test('#hud-live annonce « Fenêtre nord réparée » quand les planches sont revenues', async ({ page }) => {
    await open(page);
    await page.evaluate(([x, y]) => { window.__zs.setPlanks('fenetre-nord', 3); window.__zs.setPlayer(x, y); window.__zs.step(2.2); }, [N.repairSpot.x, N.repairSpot.y]);
    await expect(page.locator('#hud-live')).toHaveText('Fenêtre nord réparée');
  });

  test('axe sans violation avec l\'indicateur de réparation et la ligne Fenêtres', async ({ page }) => {
    await open(page);
    await page.evaluate(([x, y]) => { window.__zs.setPlanks('fenetre-nord', 2); window.__zs.setPlayer(x, y); window.__zs.step(0.5); }, [N.repairSpot.x, N.repairSpot.y]);
    await expect(page.locator('#repair')).toBeVisible();
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  });
});

test.describe('sons des planches', () => {
  const gesture = (page) => page.mouse.click(40, 40);
  const log = async (page) => (await state(page)).audio.log;
  async function ready(page, extra = '') {
    await open(page, extra, SIZE, { live: true });
    await gesture(page);
    await expect.poll(async () => (await state(page)).audio.unlocked).toBe(true);
  }

  test('planche-arrachee au journal pour chaque planche tombée, planche-posee pour chaque planche posée', async ({ page }) => {
    await ready(page);
    await page.evaluate(() => { const zs = window.__zs; zs.setPlayer(1800, 1300); zs.spawnAtWindow('fenetre-nord', 'grand'); for (let i = 0; i < 1200 && !zs.getState().windows[0].open; i += 1) zs.step(0.05); zs.killAll(); });
    const torn = (await log(page)).filter((e) => e.sound === 'planche-arrachee');
    expect(torn.length).toBeGreaterThanOrEqual(3);
    expect(torn.every((e) => e.lowpass === false)).toBe(true);
    await page.evaluate(([x, y]) => { window.__zs.killAll(); window.__zs.setPlayer(x, y); window.__zs.step(8); }, [N.repairSpot.x, N.repairSpot.y]);
    expect((await log(page)).filter((e) => e.sound === 'planche-posee').length).toBeGreaterThanOrEqual(3);
  });

  test('délai minimal de 120 ms par fenêtre ; gain plus faible pour une fenêtre lointaine ; pas d\'étouffement', async ({ page }) => {
    await ready(page);
    await page.evaluate(() => window.__zs.setPlayer(1800, 1000));
    await page.evaluate(() => {
      window.__zs.audioEvent([{ type: 'plankTorn', x: 1800, y: 812, windowId: 'fenetre-nord' }]);
      window.__zs.audioEvent([{ type: 'plankTorn', x: 1800, y: 812, windowId: 'fenetre-nord' }]);
    });
    expect((await log(page)).filter((e) => e.sound === 'planche-arrachee')).toHaveLength(1);
    await page.evaluate(() => window.__zs.step(0.5));
    await page.evaluate(() => window.__zs.audioEvent([{ type: 'plankTorn', x: 2788, y: 1400, windowId: 'fenetre-est' }]));
    const sounds = (await log(page)).filter((e) => e.sound === 'planche-arrachee');
    expect(sounds).toHaveLength(2);
    expect(sounds[1].gain).toBeLessThan(sounds[0].gain);
    expect(sounds.every((e) => e.lowpass === false)).toBe(true);
  });
});

test.describe('budget, ?empty=1, hygiène', () => {
  test('budget de dessin : 10 zombies variés dont des arracheurs, planches visibles, ombres actives : au plus 192 appels et 14 892 triangles', async ({ page }, testInfo) => {
    await open(page, '&shadows=1');
    const r = await page.evaluate(() => {
      const zs = window.__zs;
      const p = zs.getState().player;
      zs.setInput({ aim: { angle: Math.PI } });
      const T = ['marcheur', 'petit', 'voute', 'grand'];
      for (let i = 0; i < 4; i += 1) zs.spawnAtWindow('fenetre-nord', T[i]);
      zs.step(16);
      const G = ['lent', 'marche', 'rampe', 'course'];
      for (let i = 0; i < 6; i += 1) zs.spawnEnemy(p.x + 70 + (i % 3) * 45, p.y - 90 + Math.floor(i / 3) * 90, { type: T[i % 4], gait: G[i % 4], wave: 10 });
      zs.step(0.05);
      zs.sampleScreen(0, 0, 8, 8);
      const s = zs.getState();
      return { render: s.render, n: s.enemies.length, modes: s.enemies.map((e) => e.mode) };
    });
    testInfo.annotations.push({ type: 'rendu', description: `${r.n} zombies : ${r.render.calls} appels, ${r.render.triangles} triangles` });
    console.log(`BUDGET lot 3 : ${r.n} zombies, ${r.render.calls} appels de dessin, ${r.render.triangles} triangles`);
    expect(r.render.calls).toBeLessThanOrEqual(192);
    expect(r.render.triangles).toBeLessThanOrEqual(14892);
    expect(r.render.calls).toBeLessThanOrEqual(300);
    expect(r.render.triangles).toBeLessThanOrEqual(15000);
  });

  test('?empty=1 : comportement du lot 2c (zombies libres, aucun siège, aucune fenêtre à planches)', async ({ page }) => {
    await open(page, '&empty=1');
    const r = await page.evaluate(() => {
      const zs = window.__zs;
      const id = zs.spawnEnemy(100, 450);
      zs.step(1);
      const s = zs.getState();
      return { mode: s.enemies.find((e) => e.id === id).mode, planks: s.windows.every((w) => w.planks === undefined), n: s.windows.length };
    });
    expect(r.mode).toBe('libre');
    expect(r.planks).toBe(true);
    await expect(page.locator('#hud-windows')).toBeHidden();
  });

  test('un zombie créé par spawnEnemy est libre (aucun siège), un zombie d\'une vague est en approche', async ({ page }) => {
    await open(page, '&wave=1&nospawn=0');
    const modes = await page.evaluate(() => {
      const zs = window.__zs;
      const id = zs.spawnEnemy(3000, 1000);
      for (let i = 0; i < 200; i += 1) zs.step(0.05);
      const s = zs.getState();
      return { free: s.enemies.find((e) => e.id === id)?.mode, wave: s.enemies.filter((e) => e.id !== id).map((e) => e.mode) };
    });
    expect(modes.free).toBe('libre');
    expect(modes.wave.length).toBeGreaterThan(0);
    expect(modes.wave.every((m) => m !== 'libre')).toBe(true);
  });

  test('aucun appel réseau, aucun stockage, console propre pendant un siège', async ({ page, baseURL }) => {
    const external = [];
    const problems = [];
    page.on('request', (r) => !r.url().startsWith(baseURL) && !r.url().startsWith('data:') && external.push(r.url()));
    page.on('console', (m) => ['error', 'warning'].includes(m.type()) && !BROWSER_NOISE.test(m.text()) && problems.push(m.text()));
    page.on('pageerror', (e) => problems.push(e.message));
    await open(page);
    await page.evaluate(() => { window.__zs.spawnAtWindow('fenetre-est', 'petit'); window.__zs.step(20); });
    expect(external).toEqual([]);
    expect(problems).toEqual([]);
    expect(await page.evaluate(() => [localStorage.length, sessionStorage.length, document.cookie])).toEqual([0, 0, '']);
  });

  test('le champ de flux des fenêtres est mesuré et affiché par ?fps=1 (« Fenêtres : X ms »)', async ({ page }) => {
    await page.setViewportSize(SIZE);
    await page.goto(URL('&fps=1'));
    await waitReady(page);
    await expect(page.locator('#fps-counter')).toContainText(/Fenêtres : \d+(\.\d)? ms/);
  });
});
