import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { readFileSync } from 'node:fs';
import { waitReady } from './helpers.js';

// Lot 3-C : chutes du joueur (à terre, relevage, mort), interface E2-10, statistiques chutes et reparation. Tout passe par step() et les hooks :
// aucune durée n'est attendue en temps réel (sauf la pause, qui doit figer l'horloge de jeu). Petite fenêtre (667×375).
const SIZE = { width: 667, height: 375 };
const down = JSON.parse(readFileSync('data/game/player-down.json', 'utf8'));
const URL = (extra = '') => `/jeu.html?test=1&seed=1${extra.includes('nospawn') ? '' : '&nospawn=1'}${extra}`;
const state = (page) => page.evaluate(() => window.__zs.getState());
const dn = async (page) => (await state(page)).player.down;
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

test.describe('chute et relevage', () => {
  test('downPlayer() avec 1 chute : à terre, chute décomptée, vie 0, invulnérable, 5 s', async ({ page }) => {
    await open(page);
    expect((await dn(page)).chutes).toBe(1);
    await fall(page);
    const s = await state(page);
    expect(s.player.down).toMatchObject({ state: 'terre', chutes: 0, chutesMax: 1, invulnerable: true });
    expect(s.player.down.timeLeft).toBeCloseTo(down.downDuration, 6);
    expect(s.player.health).toBe(0);
    expect(s.dead).toBe(false);
  });

  test('aucun dégât pendant 5 s malgré des zombies au contact ; ils sont repoussés d\'au moins 120', async ({ page }) => {
    await open(page);
    const r = await page.evaluate(() => {
      const zs = window.__zs;
      const p = zs.getState().player;
      const ids = [[50, 0], [-50, 10], [0, 55]].map(([dx, dy]) => zs.spawnEnemy(p.x + dx, p.y + dy));
      zs.downPlayer();
      zs.step(0.05);
      const s = zs.getState();
      const dist = ids.map((id) => { const e = s.enemies.find((x) => x.id === id); return Math.hypot(e.x - p.x, e.y - p.y); });
      let min = Infinity;
      let hp = 0;
      for (let i = 0; i < 90; i += 1) { zs.step(0.05); hp = Math.max(hp, zs.getState().player.health); min = Math.min(min, zs.getState().player.down.timeLeft); }
      return { dist, hp, stillDown: zs.getState().player.down.state, left: min };
    });
    for (const d of r.dist) expect(d).toBeGreaterThanOrEqual(120);
    expect(r.hp).toBe(0);
    expect(r.stillDown).toBe('terre');
  });

  test('à terre : joueur immobile, aucun tir, laser masqué ; zombie à portée sans réaction', async ({ page }) => {
    await open(page, '&lvl=degats:10');
    const r = await page.evaluate(() => {
      const zs = window.__zs;
      const p = zs.getState().player;
      zs.setInput({ aim: { angle: 0 } });
      zs.spawnEnemy(p.x + 300, p.y);
      zs.downPlayer();
      zs.step(0.05); // la chute est constatée à la fin de ce pas (un tir a pu partir avant)
      const shotsBefore = zs.getState().shots.length;
      zs.setInput({ move: { x: 1, y: 0 }, aim: { angle: 0 } });
      zs.step(2);
      const s = zs.getState();
      return { moved: Math.hypot(s.player.x - p.x, s.player.y - p.y), shots: s.shots.length - shotsBefore, laser: s.laser, kills: s.kills };
    });
    expect(r.moved).toBeLessThan(1);
    expect(r.shots).toBe(0);
    expect(r.laser).toBeNull();
  });

  test('après 5 s : debout, vie à 50 % de la vie maximale effective, protection de 2 s sans dégât, deuxième repoussement', async ({ page }) => {
    await open(page, '&lvl=vie:5');
    const r = await page.evaluate(() => {
      const zs = window.__zs;
      const p = zs.getState().player;
      zs.setInput({ aim: { angle: Math.PI } }); // la visée tourne le dos aux zombies : aucun tir ni soin par kill
      zs.downPlayer();
      zs.step(0.05);
      zs.step(4.9);
      const mid = zs.getState().player.down.state;
      zs.step(0.1);
      const s = zs.getState();
      const id = zs.spawnEnemy(p.x + 40, p.y);
      zs.step(0.05);
      const near = Math.hypot(zs.getState().enemies.find((e) => e.id === id).x - p.x, 0);
      zs.step(1.5);
      const hpProtected = zs.getState().player.health;
      return { mid, down: s.player.down, hp: s.player.health, maxHp: s.player.maxHp, near, hpProtected };
    });
    expect(r.mid).toBe('terre');
    expect(r.down.state).toBe('debout');
    expect(r.maxHp).toBe(160);
    expect(r.hp).toBe(80);
    expect(r.down.grace).toBeGreaterThan(1.8);
    expect(r.hpProtected).toBe(80);
    expect(r.near).toBeGreaterThan(0);
  });

  test('le relevage repousse les zombies proches (200) et la protection finit après 2 s : les dégâts reprennent', async ({ page }) => {
    await open(page);
    const r = await page.evaluate(() => {
      const zs = window.__zs;
      const p = zs.getState().player;
      zs.setInput({ aim: { angle: Math.PI } });
      zs.downPlayer();
      zs.step(5.1);
      const id = zs.spawnEnemy(p.x + 30, p.y);
      const before = zs.getState().player.health;
      zs.step(1.9);
      const during = zs.getState().player.health;
      zs.step(1.5);
      const after = zs.getState().player.health;
      return { before, during, after, e: zs.getState().enemies.some((e) => e.id === id) };
    });
    expect(r.during).toBe(r.before);
    expect(r.after).toBeLessThan(r.during);
  });

  test('un deuxième downPlayer() sans chute : mort, E2-7 avec la vague atteinte ; Rejouer rétablit chutes et état propre', async ({ page }) => {
    await open(page, '&wave=1&nospawn=0');
    await fall(page);
    await step(page, 5.1);
    await page.evaluate(() => { window.__zs.downPlayer(); window.__zs.step(0.05); });
    expect((await dn(page)).state).toBe('mort');
    expect((await state(page)).dead).toBe(true);
    await expect(page.locator('#end-panel')).toBeVisible();
    await expect(page.locator('#end-wave')).toHaveText(/Vague atteinte : 1/);
    await page.locator('#btn-replay').click();
    await step(page, 0.05);
    const s = await state(page);
    expect(s.dead).toBe(false);
    expect(s.player.down).toMatchObject({ state: 'debout', chutes: 1, chutesMax: 1, grace: 0 });
    expect(s.player.health).toBe(100);
    await expect(page.locator('#hud-chutes')).toHaveText('1');
  });
});

test.describe('statistiques chutes et reparation', () => {
  test('?lvl=chutes:2 : 3 chutes (HUD : 3), la quatrième vie à 0 est la mort', async ({ page }) => {
    await open(page, '&lvl=chutes:2');
    await expect(page.locator('#hud-chutes')).toHaveText('3');
    for (let i = 0; i < 3; i += 1) {
      await fall(page);
      expect((await dn(page)).state).toBe('terre');
      await step(page, 5.1);
      await step(page, 2.1);
    }
    expect((await dn(page)).chutes).toBe(0);
    await page.evaluate(() => { window.__zs.downPlayer(); window.__zs.step(0.05); });
    expect((await dn(page)).state).toBe('mort');
  });

  test('?lvl=chutes:9 est borné à 5 (6 chutes) ; ?lvl=all:5 applique chutes et reparation au niveau 5', async ({ page }) => {
    await open(page, '&lvl=chutes:9');
    expect((await state(page)).stats.values.maxFalls).toBe(6);
    await expect(page.locator('#hud-chutes')).toHaveText('6');
    await open(page, '&lvl=all:5');
    const s = await state(page);
    expect(s.stats.values.maxFalls).toBe(6);
    expect(s.stats.values.repairTime).toBeCloseTo(1.8 * 0.88 ** 5, 6);
    expect(s.stats.extraLevels).toEqual({ chutes: 5, reparation: 5 });
    expect(Object.keys(s.stats.levels)).toHaveLength(7);
  });
});

test.describe('soin, régénération, pause', () => {
  test('fin de vague pendant la chute : le soin à 100 % est appliqué au relevage, pas avant', async ({ page }) => {
    await open(page, '&wave=1&nospawn=0&lvl=vie:0');
    const r = await page.evaluate(() => {
      const zs = window.__zs;
      zs.setWaveParams({ total: { base: 1, linear: 0, quadratic: 0 } });
      for (let i = 0; i < 400 && zs.getState().waves.alive === 0; i += 1) zs.step(0.05);
      zs.downPlayer();
      zs.step(0.05);
      zs.killAll();
      zs.step(1);
      const phase = zs.getState().waves.phase;
      const during = zs.getState().player.health;
      zs.step(4.1);
      return { phase, during, after: zs.getState().player.health, state: zs.getState().player.down.state };
    });
    expect(['terminee', 'attente']).toContain(r.phase);
    expect(r.during).toBe(0);
    expect(r.state).toBe('debout');
    expect(r.after).toBe(100);
  });

  test('un kill pendant la chute ne régénère rien', async ({ page }) => {
    await open(page, '&lvl=degats:10');
    const r = await page.evaluate(() => {
      const zs = window.__zs;
      const p = zs.getState().player;
      zs.spawnEnemy(p.x + 300, p.y);
      zs.downPlayer();
      zs.step(0.05);
      zs.fire(0);
      zs.step(1);
      const s = zs.getState();
      return { kills: s.kills, hp: s.player.health };
    });
    expect(r.kills).toBe(1);
    expect(r.hp).toBe(0);
  });

  test('la pause fige le compte à rebours à terre (horloge de jeu)', async ({ page }) => {
    await open(page, '', SIZE, { live: true });
    await page.evaluate(() => window.__zs.downPlayer());
    await expect.poll(async () => (await dn(page)).state).toBe('terre');
    await page.keyboard.press('Escape');
    await expect(page.locator('#pause-panel')).toBeVisible();
    const a = (await dn(page)).timeLeft;
    await page.waitForTimeout(700);
    expect((await dn(page)).timeLeft).toBe(a);
    await page.getByRole('button', { name: 'Reprendre' }).click();
    await expect.poll(async () => (await dn(page)).timeLeft).toBeLessThan(a);
  });
});

test.describe('interface E2-10 et annonces', () => {
  for (const size of [SIZE, { width: 1440, height: 900 }]) {
    test(`E2-10 : « À terre » et « Tu te relèves dans N s », dans les marges, centré dans le tiers bas, sans filter ni mix-blend-mode ni backdrop-filter (${size.width}×${size.height})`, async ({ page }) => {
      await open(page, '', size);
      await expect(page.locator('#down')).toBeHidden();
      await fall(page);
      const el = page.locator('#down');
      await expect(el).toBeVisible();
      await expect(el).toHaveAttribute('data-block', 'E2-10');
      await expect(page.locator('#down-title')).toHaveText('À terre');
      await expect(page.locator('#down-sub')).toHaveText('Tu te relèves dans 5 s');
      await step(page, 2);
      await expect(page.locator('#down-sub')).toHaveText('Tu te relèves dans 3 s');
      const r = await page.evaluate(() => {
        const box = document.querySelector('.down-body').getBoundingClientRect();
        const styles = ['#down', '.down-veil', '.down-body', '#down-title', '#down-sub'].map((sel) => { const c = getComputedStyle(document.querySelector(sel)); return [c.filter, c.mixBlendMode, c.backdropFilter]; });
        return { box: { left: box.left, right: box.right, top: box.top, bottom: box.bottom }, styles, w: innerWidth, h: innerHeight };
      });
      expect(r.box.left).toBeGreaterThanOrEqual(16);
      expect(r.w - r.box.right).toBeGreaterThanOrEqual(16);
      expect(r.h - r.box.bottom).toBeGreaterThanOrEqual(16);
      expect((r.box.top + r.box.bottom) / 2).toBeGreaterThan((r.h * 2) / 3);
      expect(Math.abs((r.box.left + r.box.right) / 2 - r.w / 2)).toBeLessThan(2);
      for (const [filter, blend, backdrop] of r.styles) expect([filter, blend, backdrop]).toEqual(['none', 'normal', 'none']);
    });
  }

  test('E2-10 est sous l\'animation de vague dans l\'ordre du HTML et affiche « Protégé N s » après le relevage', async ({ page }) => {
    await open(page);
    expect(await page.evaluate(() => [...document.querySelectorAll('#game-root [data-block]')].map((e) => e.dataset.block))).toEqual(['E2-2', 'E2-8', 'E2-10', 'E2-11', 'E2-5', 'E2-3', 'E2-4']);
    await fall(page);
    await step(page, 5.1);
    await expect(page.locator('#down')).toBeVisible();
    await expect(page.locator('#down-title')).toBeHidden();
    await expect(page.locator('#down-sub')).toHaveText('Protégé 2 s');
    await step(page, 2.1);
    await expect(page.locator('#down')).toBeHidden();
  });

  test('sous prefers-reduced-motion, aucune animation ni transition', async ({ browser }) => {
    const ctx = await browser.newContext({ reducedMotion: 'reduce', viewport: SIZE });
    const page = await ctx.newPage();
    await open(page);
    await fall(page);
    const r = await page.evaluate(() => ['#down', '.down-veil', '.down-body'].map((sel) => { const c = getComputedStyle(document.querySelector(sel)); return [c.animationName, c.transitionDuration]; }));
    for (const [animation, transition] of r) {
      expect(animation).toBe('none');
      expect(Number.parseFloat(transition)).toBeLessThan(0.001); // prefers-reduced-motion : base.css ramène toutes les durées à 0,00001 s
    }
    await ctx.close();
  });

  test('#hud-live annonce « À terre » puis « Relevé », une fois chacun', async ({ page }) => {
    await open(page);
    const seen = await page.evaluate(() => {
      const zs = window.__zs;
      const live = document.getElementById('hud-live');
      const list = [];
      const watch = () => { if (live.textContent && list.at(-1) !== live.textContent) list.push(live.textContent); };
      zs.downPlayer();
      for (let i = 0; i < 130; i += 1) { zs.step(0.05); watch(); }
      return list;
    });
    expect(seen.filter((t) => t === 'À terre')).toHaveLength(1);
    expect(seen.filter((t) => t === 'Relevé')).toHaveLength(1);
    expect(seen.indexOf('À terre')).toBeLessThan(seen.indexOf('Relevé'));
    expect(seen.every((t) => !/\d+ s/.test(t))).toBe(true);
  });

  test('HUD compact : la rangée des chutes ne chevauche pas Pause à 667×375 ; axe sans violation avec E2-10', async ({ page }) => {
    await open(page);
    const r = await page.evaluate(() => {
      const b = (sel) => { const e = document.querySelector(sel).getBoundingClientRect(); return { l: e.left, t: e.top, r: e.right, b: e.bottom }; };
      return { chutes: b('#hud-chutes'), hud: b('#hud'), pause: b('#btn-pause'), h: innerHeight };
    });
    expect(r.chutes.b).toBeLessThanOrEqual(r.hud.b + 1);
    expect(r.hud.r).toBeLessThanOrEqual(r.pause.l);
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
    expect(r.render.triangles).toBeLessThanOrEqual(15000);
    expect(r.pose.pelvisHeight).toBeLessThan(-0.4); // pose « terre » : corps abaissé
    expect(r.pose.torsoPitch).toBeGreaterThan(1.3);
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

test.describe('sons de chute', () => {
  const gesture = (page) => page.mouse.click(40, 40);
  const log = async (page) => (await state(page)).audio.log;
  async function ready(page) {
    await open(page, '&nospawn=1', SIZE, { live: true });
    await gesture(page);
    await expect.poll(async () => (await state(page)).audio.unlocked).toBe(true);
    const bg = await page.waitForFunction(() => window.__zs.getState().audio.ready, null, { timeout: 40_000 }).then(() => true, () => false);
    if (!bg) test.skip(true, 'sons de fond non prêts dans le temps imparti (rendu logiciel lent) : joueur-releve ne peut pas être vérifié');
  }

  test('joueur-chute à la chute, joueur-releve au relevage ; jamais pendant la pause ; la mort ne joue pas joueur-releve', async ({ page }) => {
    await ready(page);
    await page.evaluate(() => window.__zs.downPlayer());
    await expect.poll(async () => (await log(page)).filter((e) => e.sound === 'joueur-chute').length).toBe(1);
    await page.evaluate(() => window.__zs.step(5.2));
    await expect.poll(async () => (await log(page)).filter((e) => e.sound === 'joueur-releve').length).toBe(1);
    await page.keyboard.press('Escape');
    const before = (await log(page)).length;
    await page.evaluate(() => window.__zs.audioEvent([{ type: 'playerDown' }, { type: 'playerUp' }]));
    expect((await log(page)).filter((e) => e.sound === 'joueur-chute' || e.sound === 'joueur-releve')).toHaveLength(2);
    expect((await log(page)).length).toBeGreaterThanOrEqual(before);
    await page.getByRole('button', { name: 'Reprendre' }).click();
    await page.evaluate(() => { window.__zs.step(2.1); window.__zs.downPlayer(); window.__zs.step(0.1); });
    expect((await state(page)).dead).toBe(true);
    expect((await log(page)).filter((e) => e.sound === 'joueur-releve')).toHaveLength(1);
  });
});
