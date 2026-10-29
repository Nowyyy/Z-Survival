import { test, expect } from '@playwright/test';
import { projectGround } from '../../js/core/viewport.js';
import { waitReady, salle } from './helpers.js';

// Monde du lot 1b : salle de 2000 × 1200 avec meubles, décor extérieur, zombies qui arrivent de dehors. Petite fenêtre (667×375) et
// state.step() (simulation avancée sans attendre le rendu) de préférence. Les tests se désactivent seuls si WebGL manque.
const SIZE = { width: 667, height: 375 };
const PAGE = (extra = '') => salle(`/jeu.html?test=1&seed=1${extra}`);
const state = (page) => page.evaluate(() => window.__zs.getState());
async function open(page, extra = '&nospawn=1', size = SIZE) {
  await page.setViewportSize(size);
  await page.goto(PAGE(extra));
  await waitReady(page);
}
const step = (page, seconds) => page.evaluate((s) => window.__zs.step(s), seconds);
const place = (page, x, y) => page.evaluate(([a, b]) => window.__zs.setPlayer(a, b), [x, y]);
const move = (page, x, y) => page.evaluate(([a, b]) => window.__zs.setInput({ move: { x: a, y: b }, aim: { angle: 0 } }), [x, y]);

// Limites de déplacement du joueur : face intérieure des murs (24) de la salle (800, 800, 2000 × 1200), moins son rayon (18).
const INNER = { minX: 824, minY: 824, maxX: 2776, maxY: 1976 };

test.describe('monde du lot 1b', () => {
  test.skip(({ isMobile }) => isMobile, 'bureau (la fenêtre est réglée par chaque test)');

  test('la caméra suit le joueur et reste dans le monde, même à ?zoom=1 aux bords', async ({ page }) => {
    await open(page);
    await move(page, 1, 0);
    await step(page, 2);
    let s = await state(page);
    expect(s.player.x).toBeGreaterThan(2000);
    expect(Math.abs(s.camera.target.x - s.player.x)).toBeLessThan(150);
    await page.goto(PAGE('&nospawn=1&zoom=1'));
    await waitReady(page);
    await move(page, 1, -1);
    await step(page, 12);
    s = await state(page);
    expect(s.player.x).toBeGreaterThan(2700);
    expect(s.player.y).toBeLessThan(1000);
    expect(s.view.maxX).toBeLessThanOrEqual(s.world.width + 1e-6);
    expect(s.view.minY).toBeGreaterThanOrEqual(-1e-6);
    expect(s.view.minX).toBeGreaterThanOrEqual(-1e-6);
    expect(s.view.maxY).toBeLessThanOrEqual(s.world.height + 1e-6);
  });

  test('le joueur reste visible à l\'écran (0,05 à 0,95) pendant qu\'il traverse la salle en diagonale', async ({ page }) => {
    await open(page);
    for (const dir of [[1, 1], [-1, 1], [-1, -1], [1, -1]]) {
      await move(page, ...dir);
      for (let i = 0; i < 6; i += 1) {
        await step(page, 0.5);
        const { playerScreen } = await state(page);
        expect(playerScreen.x).toBeGreaterThan(0.05);
        expect(playerScreen.x).toBeLessThan(0.95);
        expect(playerScreen.y).toBeGreaterThan(0.05);
        expect(playerScreen.y).toBeLessThan(0.95);
      }
    }
  });

  test('le joueur ne sort pas de la salle, y compris en poussant contre chacune des trois fenêtres', async ({ page }) => {
    await open(page);
    const cases = [
      { name: 'fenetre-nord', at: [1860, 1000], dir: [0, -1] },
      { name: 'fenetre-ouest', at: [1000, 1400], dir: [-1, 0] },
      { name: 'fenetre-est', at: [2600, 1400], dir: [1, 0] },
    ];
    for (const c of cases) {
      await place(page, ...c.at);
      await move(page, ...c.dir);
      await step(page, 8);
      const { player } = await state(page);
      expect(player.x, c.name).toBeGreaterThanOrEqual(INNER.minX + 18 - 1e-6);
      expect(player.x, c.name).toBeLessThanOrEqual(INNER.maxX - 18 + 1e-6);
      expect(player.y, c.name).toBeGreaterThanOrEqual(INNER.minY + 18 - 1e-6);
      expect(player.y, c.name).toBeLessThanOrEqual(INNER.maxY - 18 + 1e-6);
      // Il est bien arrivé contre le mur de la fenêtre (la barrière invisible l'arrête, il ne glisse pas dehors).
      const edge = c.dir[0] === 0 ? Math.abs(player.y - (INNER.minY + 18)) : Math.abs(player.x - (c.dir[0] < 0 ? INNER.minX + 18 : INNER.maxX - 18));
      expect(edge, c.name).toBeLessThan(1);
    }
  });

  test('un meuble bloque le joueur (table-3 : x de 2400 à 2500)', async ({ page }) => {
    await open(page);
    await place(page, 2300, 1400);
    await move(page, 1, 0);
    await step(page, 4);
    const { player } = await state(page);
    expect(player.x).toBeCloseTo(2400 - 18, 3);
    await move(page, 1, 0.5); // en poussant en biais, il glisse le long de la face
    await step(page, 0.3);
    const after = await state(page);
    expect(after.player.x).toBeCloseTo(2400 - 18, 3);
    expect(after.player.y).toBeGreaterThan(player.y + 20);
  });

  test('une balle qui touche un meuble disparaît sans aucun dégât', async ({ page }) => {
    await open(page);
    await place(page, 2300, 1400);
    await page.evaluate(() => window.__zs.spawnEnemy(2600, 1400)); // derrière table-3 (x de 2400 à 2500)
    await page.evaluate(() => window.__zs.fire(0));
    expect((await state(page)).bullets).toHaveLength(1);
    await step(page, 0.3);
    const s = await state(page);
    expect(s.bullets).toHaveLength(0);
    expect(s.enemies[0].health).toBe(50);
    expect(s.kills).toBe(0);
  });

  test('le laser s\'arrête au meuble et aucun tir ne part sur un zombie caché derrière', async ({ page }) => {
    await open(page);
    await place(page, 2300, 1400);
    await page.evaluate(() => { window.__zs.setInput({ aim: { angle: 0 } }); window.__zs.spawnEnemy(2750, 1400); });
    await step(page, 0.1);
    let s = await state(page);
    expect(s.laser.stoppedBy).toBe('table-3');
    expect(s.laserEnd.x).toBeCloseTo(2400, 3);
    expect(s.laser.hit).toBeNull();
    // Pendant 1,5 s, le zombie contourne la table : aucune balle ne part tant qu'il est caché.
    const fired = await page.evaluate(() => {
      let bullets = 0;
      for (let i = 0; i < 30; i += 1) {
        window.__zs.step(0.05);
        const st = window.__zs.getState();
        const hidden = st.laser.hit === null;
        if (hidden) bullets += st.bullets.length;
      }
      return bullets;
    });
    expect(fired).toBe(0);
    s = await state(page);
    expect(s.enemies[0].health).toBe(50);
  });

  test('les zombies apparaissent hors de la vue : journal des apparitions et vérification image par image', async ({ page }) => {
    await open(page, '');
    // Lot 2 : le lanceur continu (8 zombies, un toutes les 2,5 s) est remplacé par les vagues ; la vague 5 (16 zombies, 8 à la fois,
    // un toutes les 2,04 s) donne assez d'apparitions pour la vérification (avant : démarrage direct sans startWave).
    await page.evaluate(() => window.__zs.startWave(5));
    const seen = await page.evaluate(() => {
      const known = new Set();
      const bad = [];
      for (let i = 0; i < 1000; i += 1) {
        window.__zs.step(0.05);
        const st = window.__zs.getState();
        for (const e of st.enemies) {
          if (known.has(e.id)) continue;
          known.add(e.id);
          const v = st.view;
          if (e.x >= v.minX && e.x <= v.maxX && e.y >= v.minY && e.y <= v.maxY) bad.push(e.id);
        }
      }
      return { bad, known: known.size };
    });
    expect(seen.known).toBeGreaterThanOrEqual(8);
    expect(seen.bad).toEqual([]);
    const { spawnLog, spawnPoints } = await state(page);
    expect(spawnLog.length).toBeGreaterThanOrEqual(8);
    for (const l of spawnLog) {
      expect(l.hidden).toBe(true);
      expect(spawnPoints.map((p) => p.id)).toContain(l.id);
    }
    // L'intervalle de la vague 5 (2,04 s) entre deux apparitions au moins (graine fixe) ; avant : 2,5 s (lanceur continu).
    for (let i = 1; i < spawnLog.length; i += 1) expect(spawnLog[i].time - spawnLog[i - 1].time).toBeGreaterThanOrEqual(2.0);
  });

  test('en vue d\'ensemble, tous les points sont en vue : rien n\'apparaît', async ({ page }) => {
    await open(page, '');
    await page.evaluate(() => window.__zs.overview(true));
    await step(page, 20);
    const s = await state(page);
    expect(s.spawnLog).toEqual([]);
    expect(s.enemies).toEqual([]);
    expect(s.view.minX).toBeLessThanOrEqual(0);
    expect(s.view.maxX).toBeGreaterThanOrEqual(s.world.width);
    expect(s.camera.target).toEqual({ x: 1800, y: 1400 });
    await page.evaluate(() => window.__zs.overview(false));
    await step(page, 6);
    expect((await state(page)).spawnLog.length).toBeGreaterThan(0);
  });

  test('un zombie entre par une fenêtre et atteint le joueur (graine fixe)', async ({ page }) => {
    await open(page, '');
    await expect.poll(async () => {
      await step(page, 5);
      const s = await state(page);
      return s.player.health < 100 && s.enemies.some((e) => e.entered !== null);
    }, { timeout: 60_000 }).toBe(true);
    const s = await state(page);
    const doors = s.windows.map((w) => w.id);
    for (const e of s.enemies) {
      if (e.entered !== null) expect(doors).toContain(e.entered);
      // Un zombie dans la salle y est entré par une fenêtre ; les autres sont encore dehors.
      const inside = e.x > 824 && e.x < 2776 && e.y > 824 && e.y < 1976;
      if (inside) expect(e.entered, `zombie ${e.id}`).not.toBeNull();
    }
  });

  test('un zombie caché derrière un meuble le contourne et atteint le joueur', async ({ page }) => {
    await open(page);
    await place(page, 2300, 1400);
    await page.evaluate(() => window.__zs.spawnEnemy(2650, 1400));
    await step(page, 20);
    const s = await state(page);
    expect(Math.hypot(s.enemies[0].x - s.player.x, s.enemies[0].y - s.player.y)).toBeLessThan(60);
  });

  test('aucun zombie n\'est bloqué plus de 2 s contre un meuble (huit zombies, 60 s)', async ({ page }) => {
    await open(page, '&planks=0'); // lot 3 : fenêtres ouvertes (sans elles, les zombies attendent à leur fenêtre, ce qui n'est pas un blocage contre un meuble)
    await page.evaluate(() => window.__zs.setChutes(0)); // lot 3 : sans chute, le joueur meurt comme avant et la boucle s'arrête (à terre, la file d'attente derrière lui dure et n'est pas un blocage)
    const stuck = await page.evaluate(() => {
      const problems = [];
      const anchors = new Map();
      let t = 0;
      for (let i = 0; i < 1200; i += 1) {
        window.__zs.step(0.05);
        t += 0.05;
        if (i % 40 !== 39) continue; // toutes les 2 s
        const st = window.__zs.getState();
        for (const e of st.enemies) {
          const a = anchors.get(e.id);
          const near = Math.hypot(e.x - st.player.x, e.y - st.player.y) < 120; // file d'attente autour du joueur
          if (a && !near && !a.near && Math.hypot(e.x - a.x, e.y - a.y) < 5) problems.push({ id: e.id, t: Math.round(t), x: Math.round(e.x), y: Math.round(e.y) });
          anchors.set(e.id, { x: e.x, y: e.y, near });
        }
        if (st.dead) break;
      }
      return problems;
    });
    expect(stuck).toEqual([]);
  });

  test('la visée à la souris reste juste pendant que la caméra se déplace (vrais mouvements de souris)', async ({ page }) => {
    await open(page);
    await page.mouse.move(500, 120);
    await page.mouse.move(520, 130);
    await page.waitForFunction(() => window.__zs.getState().time > 0.4);
    const t0 = (await state(page)).time;
    await page.keyboard.down('KeyD');
    await page.waitForFunction((t) => window.__zs.getState().time > t + 0.9, t0); // 0,9 s de temps de jeu, pas de temps réel (machine chargée)
    const moving = await state(page);
    await page.keyboard.up('KeyD');
    const early = moving.camera.target.x;
    expect(early).toBeGreaterThan(1850);
    // Le rayon visé part du joueur selon l'angle de visée : il doit passer par le point d'écran de la souris (520, 130).
    const gap = (s) => {
      let best = Infinity;
      for (let d = 20; d <= 900; d += 5) {
        const p = projectGround(s.player.x + Math.cos(s.aim) * d - s.camera.target.x, s.player.y + Math.sin(s.aim) * d - s.camera.target.y, s.camera.distance, s.camera.tilt, 40, SIZE.width / SIZE.height);
        if (!p) continue;
        best = Math.min(best, Math.hypot(((p.x + 1) / 2) * SIZE.width - 520, ((1 - p.y) / 2) * SIZE.height - 130));
      }
      return best;
    };
    expect(gap(moving)).toBeLessThan(25);
    // Si la visée restait figée dans le monde, la caméra ayant bougé de plus de 100 unités, l'écart serait bien plus grand.
    await page.waitForTimeout(600);
    expect(gap(await state(page))).toBeLessThan(25);
  });

  test('le HUD, le bouton Pause et les panneaux restent à 16 px des bords dans le monde du lot 1b', async ({ page }) => {
    await open(page);
    for (const sel of ['#hud', '#btn-pause']) {
      const box = await page.locator(sel).boundingBox();
      expect(box.x, sel).toBeGreaterThanOrEqual(16);
      expect(box.y, sel).toBeGreaterThanOrEqual(16);
      expect(SIZE.width - (box.x + box.width), sel).toBeGreaterThanOrEqual(16);
    }
  });

  test('au plus 300 appels de dessin avec 8 zombies et les ombres actives ; triangles rapportés', async ({ page }, testInfo) => {
    await open(page);
    // Huit zombies au sud et à l'est du joueur ; la visée est au nord : pas de tir, pas de balle ni de flash dans la mesure.
    await page.evaluate(() => {
      window.__zs.setInput({ aim: { angle: -Math.PI / 2 } });
      for (let i = 0; i < 8; i += 1) window.__zs.spawnEnemy(1800 + (i % 4) * 60 - 90, 1480 + Math.floor(i / 4) * 80);
    });
    await expect.poll(async () => (await state(page)).render.calls, { timeout: 30_000 }).toBeGreaterThan(40);
    const { render, enemies } = await state(page);
    expect(enemies).toHaveLength(8);
    expect(render.calls).toBeLessThanOrEqual(300); // chaque personnage coûte 32 appels (16 pièces, passe d'ombres comprise) : 9 × 32 = 288
    testInfo.annotations.push({ type: 'rendu', description: `${render.calls} appels de dessin, ${render.triangles} triangles (8 zombies, ombres actives, 667×375)` });
  });

  test('aucune requête externe, aucun stockage, aucune donnée dans les URL (monde du lot 1b)', async ({ page, baseURL }) => {
    const requests = [];
    page.on('request', (r) => requests.push(r.url()));
    await open(page, '');
    await step(page, 5);
    const outside = requests.filter((u) => !u.startsWith(baseURL) && !u.startsWith('data:'));
    expect(outside).toEqual([]);
    for (const url of requests.filter((u) => u.startsWith(baseURL) && !u.includes('/jeu.html?'))) expect(new globalThis.URL(url).search, url).toBe('');
    expect(await page.evaluate(() => [localStorage.length, sessionStorage.length, document.cookie])).toEqual([0, 0, '']);
    expect(await page.evaluate(() => [location.search, location.hash])).toEqual(['?map=salle&test=1&seed=1', '']); // lot 3b : avant « ?test=1&seed=1 »
  });

  test('sans ?test=1, ni window.__zs ni ?empty=1 ne sont actifs', async ({ page }) => {
    await page.setViewportSize(SIZE);
    await page.goto('/jeu.html?seed=1&empty=1&nospawn=1');
    await page.waitForSelector('#game-canvas canvas, #game-error:not([hidden])', { timeout: 60_000 });
    expect(await page.evaluate(() => typeof window.__zs)).toBe('undefined');
  });
});

test('test tactile (CDP) : le stick gauche déplace le joueur, la caméra le suit et il reste à l\'écran', async ({ browser, baseURL }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile', 'une seule fois');
  const context = await browser.newContext({ viewport: SIZE, hasTouch: true, isMobile: true, locale: 'fr-FR' });
  const page = await context.newPage();
  await page.goto(baseURL + PAGE('&nospawn=1'));
  await waitReady(page);
  const before = await state(page);
  const cdp = await context.newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 100, y: 280, id: 1 }] });
  for (let i = 1; i <= 6; i += 1) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 100 + i * 14, y: 280, id: 1 }] });
  // Lot 1c : attente par sondage et non plus 1,2 s fixes (avant : waitForTimeout(1200) puis lecture) : en rendu logiciel (CI) le jeu n'affiche
  // que quelques images par seconde et le déplacement n'avait pas encore atteint 100 unités. Mêmes seuils.
  await expect.poll(async () => (await state(page)).player.x, { timeout: 30_000 }).toBeGreaterThan(before.player.x + 100);
  await expect.poll(async () => (await state(page)).camera.target.x, { timeout: 30_000 }).toBeGreaterThan(before.camera.target.x + 60);
  const during = await state(page);
  expect(during.playerScreen.x).toBeGreaterThan(0.05);
  expect(during.playerScreen.x).toBeLessThan(0.95);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await context.close();
});

for (const width of [360, 768, 1440]) {
  test(`CLS du monde du lot 1b avec les données retardées de 400 ms (${width} px) : au plus 0,1`, async ({ browser, baseURL }, testInfo) => {
    test.skip(testInfo.project.name !== 'bureau', 'une seule fois');
    const context = await browser.newContext({ viewport: { width, height: width === 360 ? 640 : 800 } });
    const page = await context.newPage();
    await page.route('**/data/**', async (route) => {
      await new Promise((r) => setTimeout(r, 400));
      await route.continue();
    });
    await page.addInitScript(() => {
      window.__cls = 0;
      new PerformanceObserver((list) => {
        for (const e of list.getEntries()) if (!e.hadRecentInput) window.__cls += e.value;
      }).observe({ type: 'layout-shift', buffered: true });
    });
    await page.goto(baseURL + PAGE('&nospawn=1'));
    await page.waitForFunction(() => (window.__zs?.getState()?.time ?? 0) > 0.3);
    const cls = await page.evaluate(() => window.__cls);
    testInfo.annotations.push({ type: 'cls', description: `${width} px : ${cls.toFixed(4)}` });
    expect(cls).toBeLessThanOrEqual(0.1);
    await context.close();
  });
}

test.describe('marge de visée et tir par les fenêtres', () => {
  test.skip(({ isMobile }) => isMobile, 'bureau');

  test('une visée légèrement à côté déclenche le tir, mais la balle peut rater ; trop à côté : pas de tir', async ({ page }) => {
    await open(page);
    const run = async (offset) => {
      await place(page, 1800, 1400);
      await page.evaluate(([off]) => { window.__zs.setInput({ aim: { angle: Math.atan2(off, 400) } }); window.__zs.spawnEnemy(2200, 1400); }, [offset]);
      return page.evaluate(() => {
        let shots = 0;
        let last = 0;
        for (let i = 0; i < 20; i += 1) {
          window.__zs.step(0.05);
          const n = window.__zs.getState().bullets.length;
          if (n > last) shots += n - last;
          last = n;
        }
        const e = window.__zs.getState().enemies;
        return { shots, health: e[e.length - 1].health, laserHit: window.__zs.getState().laser?.hit ?? null };
      });
    };
    const near = await run(30); // 30 à côté du centre : dans la marge (20 + 24), hors du zombie (20 + 4)
    expect(near.shots).toBeGreaterThan(0);
    // Lot 2b : la balle part dans un cône autour de la visée et peut donc toucher ce zombie frôlé (avant : toujours ratée, vie = 50). Le laser,
    // lui, ne le touche pas : le tir vient bien de la marge de visée.
    expect(near.laserHit).toBeNull();
    expect(near.health).toBeLessThanOrEqual(50);
    await page.goto(PAGE('&nospawn=1'));
    await waitReady(page);
    const far = await run(80);
    expect(far.shots).toBe(0);
  });

  test('on tire à travers une fenêtre : un zombie dehors, dans l\'axe, est touché ; hors de l\'axe de l\'ouverture, le mur arrête', async ({ page }) => {
    await open(page);
    await place(page, 900, 1400);
    await page.evaluate(() => { window.__zs.setInput({ aim: { angle: Math.PI } }); window.__zs.spawnEnemy(500, 1400); });
    await step(page, 0.4);
    const s = await state(page);
    expect(s.laser.stoppedBy).toBeNull();
    await expect.poll(async () => { await step(page, 0.2); const st = await state(page); return st.enemies.length === 0 ? 'mort' : st.enemies[0].health; }, { timeout: 20_000 }).not.toBe(50);
    await place(page, 900, 1000);
    await page.evaluate(() => { window.__zs.setInput({ aim: { angle: Math.PI } }); window.__zs.spawnEnemy(500, 1000); });
    await step(page, 0.1);
    expect((await state(page)).laser.stoppedBy).toMatch(/^mur-ouest/);
  });
});
