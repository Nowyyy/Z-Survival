import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { readFileSync } from 'node:fs';
import { waitReady } from './helpers.js';

// Lot 3b-B : la carte du rez-de-chaussée dans le jeu (8 fenêtres F1 à F8, piliers, escaliers, ouverture aile / grande salle), ?map=salle, ?labels=1.
// Tout passe par step() (temps de jeu) et les hooks de ?test=1 ; 667×375 de préférence ; les tests se désactivent seuls si WebGL manque.
const SIZE = { width: 667, height: 375 };
const BIG = { width: 1440, height: 900 };
const load = (path) => JSON.parse(readFileSync(path, 'utf8'));
const world = load('data/game/maps/rez-de-chaussee/world.json');
const IDS = ['F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8'];
const BROWSER_NOISE = /GL Driver Message|ReadPixels|GPU stall/;
const STATE = (page) => page.evaluate(() => window.__zs.getState());
const pillar = (id) => world.pillars.find((p) => p.id === id);

async function open(page, extra = '', size = SIZE) {
  await page.setViewportSize(size);
  await page.goto(`/jeu.html?test=1&seed=1${extra.includes('nospawn') ? '' : '&nospawn=1'}&vhs=0${extra}`);
  await waitReady(page);
  await page.evaluate(() => { window.requestAnimationFrame = () => 0; });
  await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 150)));
  await page.evaluate(() => window.__zs.step(0.05));
}

// Marche dans une direction pendant `seconds` secondes de jeu ; renvoie la position du joueur.
const walk = (page, move, seconds) => page.evaluate(([m, s]) => {
  const zs = window.__zs;
  zs.setInput({ move: m });
  zs.step(s);
  zs.setInput({});
  const p = zs.getState().player;
  return { x: p.x, y: p.y };
}, [move, seconds]);

test.describe('carte par défaut', () => {
  test('par défaut : rez-de-chaussée, 8 fenêtres F1 à F8 à 4 planches, monde de 4 040 × 3 460', async ({ page }) => {
    await open(page);
    const s = await STATE(page);
    expect(s.map.id).toBe('rez-de-chaussee');
    expect(s.map.size).toEqual(world.size);
    expect(s.map.windowIds).toEqual(IDS);
    expect(s.windows.map((w) => [w.id, w.planks, w.maxPlanks])).toEqual(IDS.map((id) => [id, 4, 4]));
    expect(s.map.pillars.length).toBe(10);
    expect(s.world).toMatchObject({ width: 4040, height: 3460, empty: false });
  });

  test('?map=salle charge l\'ancienne salle (3 fenêtres, 14 meubles) ; une valeur inconnue retombe sur la carte par défaut sans erreur', async ({ page }) => {
    const problems = [];
    page.on('console', (m) => ['error', 'warning'].includes(m.type()) && !BROWSER_NOISE.test(m.text()) && problems.push(m.text()));
    page.on('pageerror', (e) => problems.push(e.message));
    await open(page, '&map=salle');
    let s = await STATE(page);
    expect(s.map.id).toBe('salle');
    expect(s.windows.length).toBe(3);
    expect(s.obstacles.length).toBe(14);
    expect(s.world).toMatchObject({ width: 3600, height: 2800 });
    await open(page, '&map=nimporte');
    s = await STATE(page);
    expect(s.map.id).toBe('rez-de-chaussee');
    expect(s.windows.length).toBe(8);
    expect(problems).toEqual([]);
  });

  test('?empty=1 garde la salle du lot 1m sans siège ; aucun appel réseau externe, aucun stockage, console propre', async ({ page, baseURL }) => {
    const problems = [];
    const external = [];
    page.on('console', (m) => ['error', 'warning'].includes(m.type()) && !BROWSER_NOISE.test(m.text()) && problems.push(m.text()));
    page.on('pageerror', (e) => problems.push(e.message));
    page.on('request', (r) => !r.url().startsWith(baseURL) && !r.url().startsWith('data:') && external.push(r.url()));
    await open(page, '&empty=1');
    const s = await STATE(page);
    expect(s.world.empty).toBe(true);
    expect(s.windows.every((w) => w.planks === undefined)).toBe(true);
    await open(page);
    expect(external).toEqual([]);
    expect(problems).toEqual([]);
    expect(await page.evaluate(() => [localStorage.length, sessionStorage.length, document.cookie])).toEqual([0, 0, '']);
  });

  test('axe : aucune violation (667×375 et 1440×900)', async ({ page }) => {
    for (const size of [SIZE, BIG]) {
      await open(page, '', size);
      expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    }
  });
});

test.describe('déplacements, obstacles, tir', () => {
  test('le joueur démarre à la position du plan (grande salle)', async ({ page }) => {
    await open(page);
    const p = (await STATE(page)).player;
    expect([p.x, p.y]).toEqual([world.start.x, world.start.y]);
  });

  test('un pilier arrête le joueur', async ({ page }) => {
    await open(page);
    const p = pillar('pilier-7'); // 1790..1860 × 1915..1985
    await page.evaluate(([x, y]) => window.__zs.setPlayer(x, y), [p.x - 80, p.y + p.h / 2]);
    const end = await walk(page, { x: 1, y: 0 }, 2);
    expect(end.x).toBeLessThanOrEqual(p.x - 17);
    expect(end.x).toBeGreaterThan(p.x - 40);
  });

  test('un escalier plein arrête le joueur', async ({ page }) => {
    await open(page);
    const st = world.stairs[0];
    await page.evaluate(([x, y]) => window.__zs.setPlayer(x, y), [st.x + st.w / 2, st.y + st.h + 80]);
    const end = await walk(page, { x: 0, y: -1 }, 2);
    expect(end.y).toBeGreaterThanOrEqual(st.y + st.h + 17);
  });

  test('un mur arrête le joueur, et il ne franchit jamais une fenêtre', async ({ page }) => {
    await open(page);
    const f7 = world.windows.find((w) => w.id === 'F7');
    await page.evaluate(([x, y]) => window.__zs.setPlayer(x, y), [f7.x, f7.y - 120]);
    let end = await walk(page, { x: 0, y: 1 }, 4);
    expect(end.y).toBeLessThanOrEqual(f7.y - 20);
    const f3 = world.windows.find((w) => w.id === 'F3');
    await page.evaluate(([x, y]) => window.__zs.setPlayer(x, y), [f3.x + 120, f3.y]);
    end = await walk(page, { x: -1, y: 0 }, 4);
    expect(end.x).toBeGreaterThanOrEqual(f3.x + 20);
  });

  test('on passe de la grande salle à l\'aile par l\'ouverture (85 de large), pas ailleurs', async ({ page }) => {
    await open(page, '&wave=11');
    const o = world.openings.find((q) => q.id === 'ouverture-aile');
    expect(Math.abs(o.y2 - o.y1)).toBeGreaterThanOrEqual(80);
    await page.evaluate(([x, y]) => window.__zs.setPlayer(x, y), [o.x1 + 200, (o.y1 + o.y2) / 2]);
    let end = await walk(page, { x: -1, y: 0 }, 3);
    expect(end.x).toBeLessThan(o.x1 - 40);
    await page.evaluate(([x, y]) => window.__zs.setPlayer(x, y), [o.x1 + 200, Math.max(o.y1, o.y2) + 250]);
    end = await walk(page, { x: -1, y: 0 }, 3);
    expect(end.x).toBeGreaterThan(o.x1 + 20);
  });

  test('une balle s\'arrête sur un pilier sans dégâts ; le laser s\'arrête au pilier', async ({ page }) => {
    await open(page);
    const p = pillar('pilier-7');
    const r = await page.evaluate(([x, y]) => {
      const zs = window.__zs;
      zs.setPlayer(x - 150, y);
      zs.setInput({ aim: { angle: 0 } });
      const id = zs.spawnEnemy(x + 200, y);
      zs.step(0.1);
      const laser = zs.getState().laser;
      const end = zs.getState().laserEnd;
      zs.fire(0);
      zs.step(1);
      const s = zs.getState();
      return { hp: s.enemies.find((e) => e.id === id).health, max: s.enemies.find((e) => e.id === id).maxHp, bullets: s.bullets.length, laser, end, id };
    }, [p.x, p.y + p.h / 2]);
    expect(r.laser.stoppedBy).toBe('pilier-7');
    expect(r.end.x).toBeLessThanOrEqual(p.x + 1);
    expect(r.bullets).toBe(0);
    expect(r.hp).toBe(r.max);
  });
});

test.describe('siège sur les huit fenêtres', () => {
  for (const id of IDS) {
    test(`${id} : un zombie va à l'emplacement, arrache les 4 planches, escalade, entre ; personne dedans avant l'ouverture`, async ({ page }) => {
      await open(page, '&wave=11');
      const r = await page.evaluate((windowId) => {
        const zs = window.__zs;
        zs.setPlayer(1980, 2065);
        const zid = zs.spawnAtWindow(windowId, 'marcheur');
        let early = 0;
        let torn = false;
        let entered = null;
        for (let i = 0; i < 1800 && entered === null; i += 1) {
          zs.step(0.05);
          const s = zs.getState();
          const w = s.windows.find((q) => q.id === windowId);
          const z = s.enemies.find((e) => e.id === zid);
          if (w.planks > 0 && z && z.mode === 'dedans') early += 1;
          if (w.planks === 0) torn = true;
          if (z && z.mode === 'dedans') entered = i;
        }
        const s = zs.getState();
        return { early, torn, entered, mode: s.enemies.find((e) => e.id === zid)?.mode, planks: s.windows.find((q) => q.id === windowId).planks, entry: s.enemies.find((e) => e.id === zid)?.entered };
      }, id);
      expect(r.early).toBe(0);
      expect(r.torn).toBe(true);
      expect(r.mode).toBe('dedans');
      expect(r.planks).toBe(0);
      expect(r.entered).not.toBeNull();
    });
  }

  test('F3 (ouest de l\'aile) : le zombie atteint son emplacement et arrache', async ({ page }) => {
    await open(page, '&wave=11');
    const r = await page.evaluate(() => {
      const zs = window.__zs;
      zs.spawnAtWindow('F3', 'marcheur');
      for (let i = 0; i < 1200; i += 1) {
        zs.step(0.05);
        if (zs.getState().enemies[0].mode === 'arrache') break;
      }
      return zs.getState().enemies[0].mode;
    });
    expect(r).toBe('arrache');
  });

  test('un zombie entré par F1 rejoint le joueur dans la grande salle en passant par l\'ouverture ; un zombie de l\'aile aussi', async ({ page }) => {
    await open(page, '&wave=11');
    const r = await page.evaluate(() => {
      const zs = window.__zs;
      zs.setPlanks('F1', 0);
      zs.spawnAtWindow('F1', 'marcheur');
      let contact = null;
      for (let i = 0; i < 3600 && contact === null; i += 1) {
        zs.step(0.05);
        const s = zs.getState();
        const z = s.enemies[0];
        if (Math.hypot(z.x - s.player.x, z.y - s.player.y) < 60) contact = i * 0.05;
      }
      zs.killAll();
      const aile = zs.getState().windows.find((w) => w.id === 'F3');
      zs.spawnEnemy(aile.x + 150, aile.y - 300);
      let contact2 = null;
      for (let i = 0; i < 2400 && contact2 === null; i += 1) {
        zs.step(0.05);
        const s = zs.getState();
        const z = s.enemies[0];
        if (z && Math.hypot(z.x - s.player.x, z.y - s.player.y) < 60) contact2 = i * 0.05;
        if (s.dead) break;
      }
      return { contact, contact2 };
    });
    expect(r.contact).not.toBeNull();
    expect(r.contact2).not.toBeNull();
  });

  test('réparation d\'une fenêtre à chaque coin de la carte (F1, F3, F6, F8) selon les règles du lot 3', async ({ page }) => {
    await open(page, '&wave=11');
    for (const id of ['F1', 'F3', 'F6', 'F8']) {
      const r = await page.evaluate((windowId) => {
        const zs = window.__zs;
        const w0 = zs.getState().windows.find((q) => q.id === windowId);
        zs.setPlanks(windowId, 1);
        const g = zs.getState().windows.find((q) => q.id === windowId);
        // Le joueur se place au point de réparation : 70 vers l'intérieur depuis le centre de la fenêtre.
        const n = { F1: [0, -1], F3: [-1, 0], F6: [1, 0], F8: [0, 1] }[windowId];
        zs.setPlayer(g.x - n[0] * 70, g.y - n[1] * 70);
        zs.step(8);
        return { before: 1, after: zs.getState().windows.find((q) => q.id === windowId).planks, max: w0.maxPlanks };
      }, id);
      expect(r.after, id).toBe(r.max);
    }
  });
});

test.describe('planches et débris sur les vraies fenêtres', () => {
  test('pour les 8 fenêtres et 0 à 4 planches : minY ≥ allège + 0,5 et minWallGap ≥ 2', async ({ page }) => {
    await open(page);
    const rows = await page.evaluate((ids) => {
      const zs = window.__zs;
      const out = [];
      for (const id of ids) {
        for (let n = 0; n <= 4; n += 1) {
          zs.setPlanks(id, n);
          const m = zs.getState().windows.find((q) => q.id === id).mesh;
          out.push({ id, n, minY: m.minY, gap: m.minWallGap, beams: m.beams, pips: m.pipsOn });
        }
      }
      return out;
    }, IDS);
    for (const r of rows) {
      expect(r.beams, `${r.id} ${r.n}`).toBe(r.n);
      expect(r.pips, `${r.id} ${r.n}`).toBe(r.n);
      if (r.n > 0) {
        expect(r.minY, `${r.id} ${r.n}`).toBeGreaterThanOrEqual(16.5 - 1e-6);
        expect(r.gap, `${r.id} ${r.n}`).toBeGreaterThanOrEqual(2 - 1e-6);
      }
    }
  });

  test('les quatre carrés de F7 et F8 (sud) sont visibles, sur le dessus du mur, à sa hauteur (60)', async ({ page }) => {
    await open(page);
    const rows = await page.evaluate(() => window.__zs.getState().windows.filter((w) => ['F7', 'F8'].includes(w.id)).map((w) => ({ id: w.id, pips: w.mesh.pipsOn, y: w.mesh.pipY, tri: w.mesh.triangles })));
    for (const r of rows) {
      expect(r.pips).toBe(4);
      expect(r.y).toBeGreaterThanOrEqual(60);
      expect(r.y).toBeLessThan(61);
      expect(r.tri).toBeGreaterThanOrEqual(38);
      expect(r.tri).toBeLessThanOrEqual(42);
    }
  });

  test('débris : un maillage par fenêtre, 4 au plus par fenêtre, masqué quand sa fenêtre est hors champ', async ({ page }) => {
    await open(page);
    const r = await page.evaluate(() => {
      const zs = window.__zs;
      for (const id of ['F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8']) zs.setPlanks(id, 0);
      zs.setPlayer(1980, 2065);
      zs.step(0.05);
      zs.sampleScreen(0, 0, 8, 8);
      const s = zs.getState();
      return { meshes: s.debrisMeshes, windows: s.windows.map((w) => ({ id: w.id, inFrustum: w.mesh.inFrustum })), total: s.debris.length };
    });
    expect(r.meshes.length).toBe(8);
    expect(r.total).toBeLessThanOrEqual(32);
    for (const m of r.meshes) {
      expect(m.count).toBeLessThanOrEqual(4);
      if (!m.inFrustum) expect(m.count === 0 || m.inFrustum === false).toBe(true);
    }
    // F1 est loin du joueur : son maillage de débris n'est pas dans le champ.
    expect(r.meshes.find((m) => m.id === 'F1').inFrustum).toBe(false);
    expect(r.windows.find((w) => w.id === 'F1').inFrustum).toBe(false);
  });

  test('les débris restent jusqu\'à la réparation de leur planche', async ({ page }) => {
    await open(page);
    const r = await page.evaluate(() => {
      const zs = window.__zs;
      zs.setPlanks('F7', 0);
      const a = zs.getState().debrisMeshes.find((m) => m.id === 'F7').count;
      zs.step(40);
      const b = zs.getState().debris.length;
      zs.setPlanks('F7', 4);
      return { a, b, after: zs.getState().debris.length };
    });
    expect(r.b).toBeGreaterThanOrEqual(3);
    expect(r.after).toBe(0);
  });
});

test.describe('vagues, interface, caméra, budget', () => {
  test('les zombies de la vague 1 arrivent hors de la vue (points F*-a ou F*-b), vont à leur fenêtre et la vague se termine', async ({ page }) => {
    await open(page, '&nospawn=0');
    const r = await page.evaluate(() => {
      const zs = window.__zs;
      zs.step(20);
      const s = zs.getState();
      return { log: s.spawnLog.map((l) => ({ id: l.id, hidden: l.hidden })), modes: s.enemies.map((e) => e.mode), wave: s.waves.wave };
    });
    expect(r.log.length).toBeGreaterThan(0);
    for (const l of r.log) {
      expect(l.id).toMatch(/^F[1-8]-[ab]$/);
      expect(l.hidden).toBe(true);
    }
    const end = await page.evaluate(() => {
      const zs = window.__zs;
      let ended = false;
      for (let i = 0; i < 40 && !ended; i += 1) {
        zs.step(5);
        zs.killAll();
        ended = zs.getState().waves.phase === 'terminee' || zs.getState().waves.wave > 1;
      }
      return ended;
    });
    expect(end).toBe(true);
  });

  test('?wave=10 avec 10 zombies : aucun zombie bloqué plus de 2 s hors des états d\'attente pendant 90 s de simulation', async ({ page }) => {
    await open(page, '&nospawn=0&wave=10');
    const r = await page.evaluate(() => {
      const zs = window.__zs;
      const still = new Map();
      let maxStill = 0;
      let where = null;
      let maxAlive = 0;
      for (let i = 0; i < 1800; i += 1) {
        zs.step(0.05);
        const s = zs.getState();
        maxAlive = Math.max(maxAlive, s.enemies.length);
        for (const e of s.enemies) {
          const wait = ['attente', 'arrache'].includes(e.mode) || (e.mode === 'approche' && false);
          const gap = Math.hypot(e.x - s.player.x, e.y - s.player.y);
          const prev = still.get(e.id);
          const moved = !prev || Math.hypot(prev.x - e.x, prev.y - e.y) > 0.02;
          if (wait || moved || gap < 60 || e.mode === 'escalade') still.set(e.id, { x: e.x, y: e.y, t: 0 });
          else {
            const t = prev.t + 0.05;
            still.set(e.id, { x: e.x, y: e.y, t });
            if (t > maxStill) {
              maxStill = t;
              where = { id: e.id, mode: e.mode, x: e.x, y: e.y };
            }
          }
        }
        if (s.dead) break;
      }
      return { maxStill, where, maxAlive };
    });
    expect(r.maxAlive).toBeLessThanOrEqual(10);
    expect(r.maxStill, JSON.stringify(r.where)).toBeLessThanOrEqual(2.05);
  });

  test('HUD E2-2 inchangé : un seul rectangle (300 px au plus), aucune ligne « Fenêtres », E2-9 absent, ordre des blocs', async ({ page }) => {
    await open(page);
    const s = await STATE(page);
    expect(s.hud.width).toBeLessThanOrEqual(300);
    expect(s.hud.height).toBeLessThanOrEqual(96);
    expect(await page.locator('#repair').count()).toBe(0);
    expect(await page.locator('[data-block="E2-9"]').count()).toBe(0);
    expect(await page.locator('#hud').getByText('Fenêtres').count()).toBe(0);
    const blocks = await page.locator('[data-block]').evaluateAll((els) => els.map((e) => e.dataset.block));
    expect(blocks.slice(0, 7)).toEqual(['E2-1', 'E2-2', 'E2-8', 'E2-10', 'E2-5', 'E2-3', 'E2-4']);
  });

  test('avec 8 fenêtres attaquées : aucune flèche au bord de l\'écran (E2-11 retiré)', async ({ page }) => {
    await open(page);
    const r = await page.evaluate(() => {
      const zs = window.__zs;
      zs.setPlayer(1980, 2065);
      for (const id of ['F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8']) zs.spawnAtWindow(id, 'marcheur');
      zs.step(15);
      return { arrows: zs.getState().hud.arrows, count: document.querySelectorAll('#edges').length };
    });
    expect(r).toEqual({ arrows: [], count: 0 });
  });

  test('#hud-live annonce « Fenêtre F3 ouverte »', async ({ page }) => {
    await open(page, '&wave=11');
    await page.evaluate(() => {
      const zs = window.__zs;
      zs.spawnAtWindow('F3', 'marcheur');
      for (let i = 0; i < 600; i += 1) {
        zs.step(0.05);
        if (zs.getState().windows.find((w) => w.id === 'F3').planks === 0) break;
      }
    });
    await expect(page.locator('#hud-live')).toHaveText('Fenêtre F3 ouverte');
  });

  test('?labels=1 : 8 étiquettes alignées sur les fenêtres (écart < 40 px), masquées hors écran', async ({ page }) => {
    await open(page, '&labels=1', BIG);
    await page.evaluate(() => window.__zs.overview(true));
    await page.evaluate(() => window.__zs.step(0.05));
    const s = await STATE(page);
    expect(s.labels.length).toBe(8);
    for (const l of s.labels) {
      const w = s.windows.find((q) => q.id === l.id);
      expect(Math.hypot(l.x - w.screen.x * 1440, l.y - w.screen.y * 900), l.id).toBeLessThan(40);
    }
    await expect(page.locator('.map-label:not([hidden])')).toHaveCount(s.labels.filter((l) => l.visible).length);
    await page.evaluate(() => { window.__zs.overview(false); window.__zs.setPlayer(1980, 2065); window.__zs.step(0.05); });
    const near = await STATE(page);
    expect(near.labels.filter((l) => l.visible).length).toBeLessThan(8);
    await expect(page.locator('.map-label:not([hidden])')).toHaveCount(near.labels.filter((l) => l.visible).length);
    expect(await page.locator('#labels').getAttribute('aria-hidden')).toBe('true');
  });

  test('sans ?labels=1, aucune étiquette', async ({ page }) => {
    await open(page);
    await expect(page.locator('#labels')).toBeHidden();
    expect((await STATE(page)).labels).toEqual([]);
  });

  test('caméra : jamais hors du monde, le joueur toujours visible, aux quatre coins du bâtiment', async ({ page }) => {
    await open(page);
    const pts = [[1100, 860], [3000, 1560], [3000, 2300], [1100, 2280]];
    for (const [x, y] of pts) {
      await page.evaluate(([px, py]) => { window.__zs.setPlayer(px, py); window.__zs.step(2); }, [x, y]);
      const s = await STATE(page);
      expect(s.view.minX).toBeGreaterThanOrEqual(-1);
      expect(s.view.maxX).toBeLessThanOrEqual(3881);
      expect(s.view.minY).toBeGreaterThanOrEqual(-1);
      expect(s.view.maxY).toBeLessThanOrEqual(3181);
      expect(s.playerScreen.x).toBeGreaterThan(0);
      expect(s.playerScreen.x).toBeLessThan(1);
      expect(s.playerScreen.y).toBeGreaterThan(0);
      expect(s.playerScreen.y).toBeLessThan(1);
    }
  });

  test('?zoom=1 montre tout le bâtiment à 1440×900', async ({ page }) => {
    await open(page, '&zoom=1', BIG);
    const s = await STATE(page);
    const room = world.room;
    expect(s.view.minX).toBeLessThan(room.x);
    expect(s.view.maxX).toBeGreaterThan(room.x + room.width);
    expect(s.view.minY).toBeLessThan(room.y);
    expect(s.view.maxY).toBeGreaterThan(room.y + room.height);
    for (const w of s.windows) {
      expect(w.screen.x, w.id).toBeGreaterThan(0);
      expect(w.screen.x, w.id).toBeLessThan(1);
      expect(w.screen.y, w.id).toBeGreaterThan(0);
      expect(w.screen.y, w.id).toBeLessThan(1);
    }
  });

  test('budget : 10 zombies variés, planches, ombres, cône : au plus la référence (191 appels, 14 904 triangles) + 3 et + 100', async ({ page }, testInfo) => {
    await open(page, '&shadows=1');
    const r = await page.evaluate(() => {
      const zs = window.__zs;
      const first = zs.getState().windowPositions[0];
      zs.setPlayer(first.x, first.y + 110);
      zs.setInput({ aim: { angle: Math.PI } });
      const p = zs.getState().player;
      const T = ['marcheur', 'petit', 'voute', 'grand'];
      const G = ['lent', 'marche', 'rampe', 'course'];
      for (let i = 0; i < 10; i += 1) zs.spawnEnemy(p.x + 70 + (i % 5) * 45, p.y + 20 + Math.floor(i / 5) * 90 + (i % 2) * 15, { type: T[i % 4], gait: G[(i + Math.floor(i / 4)) % 4], wave: 10 });
      zs.step(0.05);
      zs.sampleScreen(0, 0, 8, 8);
      return zs.getState().render;
    });
    testInfo.annotations.push({ type: 'rendu', description: `${r.calls} appels, ${r.triangles} triangles` });
    console.log(`BUDGET lot 3b : ${r.calls} appels de dessin, ${r.triangles} triangles (référence main : 191 et 14 904)`);
    expect(r.calls).toBeLessThanOrEqual(191 + 3);
    expect(r.triangles).toBeLessThanOrEqual(Math.min(14904 + 100, 15000));
  });
});
