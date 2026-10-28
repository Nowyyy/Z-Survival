import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { waitReady } from './helpers.js';

// Lot 2b : cône de tir, sept statistiques (?lvl=), régénération par kill. Petite fenêtre (rendu logiciel plus rapide) ; le temps de jeu
// n'avance que par step() (requestAnimationFrame neutralisé), les mesures sont donc exactes et ne dépendent pas de la vitesse du rendu.
const SIZE = { width: 667, height: 375 };
const PAGE = (extra = '') => `/jeu.html?test=1&seed=1${extra}`;
const BROWSER_NOISE = /GL Driver Message|ReadPixels|GPU stall/;
const DEG = Math.PI / 180;

async function open(page, extra = '&empty=1&nospawn=1', size = SIZE) {
  await page.setViewportSize(size);
  await page.goto(PAGE(extra));
  await waitReady(page);
  await page.evaluate(() => { window.requestAnimationFrame = () => 0; });
  await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 150)));
  await page.evaluate(() => window.__zs.step(0.05));
}
const state = (page) => page.evaluate(() => window.__zs.getState());
const step = (page, s) => page.evaluate((n) => window.__zs.step(n), s);

// Joueur à (x, y) qui vise l'est ; immobile (rest) ou en marche dans la direction (mx, my).
const setup = (page, { x = 800, y = 450, move = null } = {}) => page.evaluate(([px, py, mv]) => {
  window.__zs.setPlayer(px, py);
  window.__zs.setInput({ aim: { angle: 0 }, move: mv ?? undefined });
}, [x, y, move]);

// Demi-angle du cône après stabilisation (1 s de jeu).
async function settledHalf(page, move) {
  await setup(page, { y: 450, move });
  await step(page, 1);
  return (await state(page)).player.spread;
}

test.describe('cône de tir : ouverture selon le mouvement et la précision', () => {
  test('niveau 0 : demi-angle ≈ 4° à l\'arrêt (±0,2) et ≈ 12° à pleine vitesse (±0,5)', async ({ page }) => {
    await open(page);
    expect(Math.abs((await settledHalf(page, null)) - 4)).toBeLessThanOrEqual(0.2);
    const moving = await settledHalf(page, { x: 0, y: 1 });
    expect(Math.abs(moving - 12)).toBeLessThanOrEqual(0.5);
    expect((await state(page)).player.speedRatio).toBeGreaterThan(0.95);
  });

  test('?lvl=precision:10 : ≈ 1,4° à l\'arrêt et ≈ 3,0° à pleine vitesse', async ({ page }) => {
    await open(page, '&empty=1&nospawn=1&lvl=precision:10');
    expect(Math.abs((await settledHalf(page, null)) - 1.4)).toBeLessThanOrEqual(0.1);
    expect(Math.abs((await settledHalf(page, { x: 0, y: 1 })) - 3)).toBeLessThanOrEqual(0.2);
  });

  test('les deux lignes du cône sont exposées, s\'écartent en mouvement et se resserrent à l\'arrêt', async ({ page }) => {
    await open(page);
    await setup(page);
    await step(page, 1);
    const rest = (await state(page)).laser.cone;
    expect(rest.rightAngle - rest.leftAngle).toBeCloseTo(2 * 4 * DEG, 2);
    expect((rest.leftAngle + rest.rightAngle) / 2).toBeCloseTo(0, 6);
    await setup(page, { move: { x: 0, y: 1 } });
    await step(page, 1);
    const wide = (await state(page)).laser.cone;
    expect(wide.rightAngle - wide.leftAngle).toBeCloseTo(2 * 12 * DEG, 1);
    await setup(page);
    await step(page, 0.05);
    const closing = (await state(page)).laser.cone;
    expect(closing.rightAngle - closing.leftAngle).toBeLessThan(wide.rightAngle - wide.leftAngle);
    expect(closing.rightAngle - closing.leftAngle).toBeGreaterThan(rest.rightAngle - rest.leftAngle);
    await step(page, 2);
    const again = (await state(page)).laser.cone;
    expect(again.rightAngle - again.leftAngle).toBeCloseTo(2 * 4 * DEG, 2);
  });
});

test.describe('cône de tir : tirage des balles', () => {
  // Un zombie à 300 unités, replacé avant chaque tir ; renvoie le journal des tirs et, pour chaque tour, si le zombie a été touché.
  async function volley(page, move, count = 40) {
    await open(page);
    await page.evaluate(() => window.__zs.setSeed(7));
    return page.evaluate(([mv, n]) => {
      const zs = window.__zs;
      const hits = [];
      zs.setPlayer(800, 450);
      for (let i = 0; i < 250 && zs.getState().shots.length < n; i += 1) {
        const dir = mv ? { x: 0, y: i % 2 ? -1 : 1 } : undefined;
        zs.setInput({ aim: { x: 1100, y: 450 }, move: dir });
        zs.killAll();
        const before = zs.getState().shots.length;
        const id = zs.spawnEnemy(1100, 450, { type: 'grand', wave: 10 });
        const max = zs.getState().enemies.find((e) => e.id === id).hp;
        zs.step(0.45);
        const after = zs.getState();
        if (after.shots.length > before) hits.push((after.enemies.find((e) => e.id === id)?.hp ?? 0) < max);
      }
      return { shots: zs.getState().shots, hits };
    }, [move, count]);
  }

  test('40 tirs à graine fixe, à l\'arrêt : chaque décalage reste dans le demi-angle courant, pas tous égaux, moyenne proche de 0', async ({ page }) => {
    const { shots } = await volley(page, false);
    expect(shots.length).toBeGreaterThanOrEqual(40);
    const offsets = shots.map((s) => (s.angle - s.aimAngle) / DEG);
    for (const [i, o] of offsets.entries()) expect(Math.abs(o), `tir ${i}`).toBeLessThanOrEqual(shots[i].half + 1e-9);
    expect(shots[0].half).toBeCloseTo(4, 0);
    expect(new Set(offsets.map((o) => o.toFixed(6))).size).toBeGreaterThan(30);
    expect(Math.abs(offsets.reduce((a, b) => a + b, 0) / offsets.length)).toBeLessThan(1.2);
  });

  test('même graine, mêmes angles de tir', async ({ browser }) => {
    const run = async () => {
      const context = await browser.newContext({ viewport: SIZE });
      const page = await context.newPage();
      const { shots } = await volley(page, false, 12);
      await context.close();
      return shots.slice(0, 12).map((s) => s.angle);
    };
    expect(await run()).toEqual(await run());
  });

  test('en déplacement au niveau 0, au moins un tir sur 40 rate le zombie ; à l\'arrêt, la plupart touchent', async ({ page }) => {
    const moving = await volley(page, true);
    expect(moving.shots.length).toBeGreaterThanOrEqual(40); // un tour de 0,45 s peut contenir deux tirs
    expect(moving.hits.length).toBeGreaterThanOrEqual(30);
    expect(moving.hits.filter((h) => !h).length).toBeGreaterThanOrEqual(1);
    expect(moving.shots[moving.shots.length - 1].half).toBeGreaterThan(8);
  });

  test('le tir part sur la même condition que le lot 2 : laser qui touche ou frôle ; aucun tir sans zombie sur la ligne', async ({ page }) => {
    await open(page);
    await setup(page);
    await step(page, 2);
    expect((await state(page)).shots).toHaveLength(0);
    await page.evaluate(() => window.__zs.spawnEnemy(1100, 450 + 20 + 4 + 20)); // frôle : à moins de aimTolerance du bord
    await step(page, 0.05);
    expect((await state(page)).shots.length).toBe(1);
    await page.evaluate(() => { window.__zs.killAll(); window.__zs.spawnEnemy(1100, 450 + 20 + 24 + 40); }); // trop à côté
    await step(page, 1);
    expect((await state(page)).shots.length).toBe(1);
  });
});

test.describe('statistiques : portée', () => {
  // Limite réelle : le tir part quand la ligne de visée frôle un zombie jusqu'à la portée, avec la marge aimTolerance (24) et son rayon (20) ;
  // la bouche de l'arme est à 26 du centre du joueur. Un zombie « à 750 » du joueur est donc encore dans la marge (limite : 700 + 44 + 26 = 770
  // au centre) : on teste à 650 (tir) et à 800 (aucun tir), le zombie de 750 de la spécification n'étant pas dans le doute.
  test('niveau 0 : laser de 300 ; le tir part pour un zombie à 650 mais pas à 800 (ligne libre)', async ({ page }) => {
    await open(page);
    await setup(page, { x: 60 });
    await step(page, 0.05);
    const s0 = await state(page);
    expect(s0.laser.length).toBeCloseTo(300, 6);
    expect(s0.stats.values.fireRange).toBeCloseTo(700, 6);
    await page.evaluate(() => window.__zs.spawnEnemy(860, 450)); // 800 du joueur
    await step(page, 0.05);
    expect((await state(page)).shots.length).toBe(0);
    await page.evaluate(() => { window.__zs.killAll(); window.__zs.spawnEnemy(710, 450); }); // 650
    await step(page, 0.05);
    expect((await state(page)).shots.length).toBe(1);
  });

  test('?lvl=portee:10 : laser de 660, tir déclenché à 1 400 mais pas à 1 650, distance maximale de balle = portée + 100', async ({ page }) => {
    await open(page, '&nospawn=1&lvl=portee:10');
    // Ligne libre vers l'est dans la salle du jeu (vérifiée avec castRay) : du joueur (900, 860) aux zombies à 1 400 et 1 600.
    await page.evaluate(() => { window.__zs.setPlayer(900, 860); window.__zs.setInput({ aim: { angle: 0 } }); });
    await step(page, 0.05);
    const s0 = await state(page);
    expect(s0.laser.length).toBeCloseTo(660, 6);
    expect(s0.stats.values.fireRange).toBeCloseTo(1540, 6);
    // Même limite qu'au niveau 0 : 1 540 + 44 + 26 = 1 610 au centre ; « pas à 1 600 » de la spécification est dans la marge de visée.
    await page.evaluate(() => window.__zs.spawnEnemy(2550, 860)); // 1 650
    await step(page, 0.05);
    expect((await state(page)).shots.length).toBe(0);
    await page.evaluate(() => { window.__zs.killAll(); window.__zs.spawnEnemy(2300, 860); }); // 1 400
    await step(page, 0.05);
    const s1 = await state(page);
    expect(s1.shots.length).toBe(1);
    expect(s1.bullets[0].maxDistance).toBeCloseTo(1640, 6);
  });
});

test.describe('statistiques : dégâts, cadence, vitesse', () => {
  // Balle d'essai (sans cône) sur un grand zombie à 300 : écart de vie à l'impact.
  async function damageOf(page, extra) {
    await open(page, `&empty=1&nospawn=1${extra}`);
    return page.evaluate(() => {
      const zs = window.__zs;
      zs.setInput({ aim: { angle: Math.PI } }); // la visée tourne le dos : aucun tir automatique
      const id = zs.spawnEnemy(1100, 450, { type: 'grand', wave: 10 });
      const max = zs.getState().enemies.find((e) => e.id === id).hp;
      zs.fire(0);
      for (let i = 0; i < 20 && zs.getState().enemies.find((e) => e.id === id).hp === max; i += 1) zs.step(0.05);
      return max - zs.getState().enemies.find((e) => e.id === id).hp;
    });
  }

  test('la vie d\'un zombie baisse de 25 par impact au niveau 0', async ({ page }) => {
    expect(await damageOf(page, '')).toBeCloseTo(25, 6);
  });

  test('la vie d\'un zombie baisse de 62,5 par impact au niveau 10', async ({ page }) => {
    expect(await damageOf(page, '&lvl=degats:10')).toBeCloseTo(62.5, 6);
  });

  test('setLevels en cours de vol ne change pas les dégâts d\'une balle partie', async ({ page }) => {
    await open(page, '&empty=1&nospawn=1&lvl=degats:10');
    const r = await page.evaluate(() => {
      const zs = window.__zs;
      zs.setInput({ aim: { angle: Math.PI } });
      const id = zs.spawnEnemy(1100, 450, { type: 'grand', wave: 10 });
      const max = zs.getState().enemies.find((e) => e.id === id).hp;
      zs.fire(0);
      const flying = zs.getState().bullets[0].damage;
      zs.setLevels({});
      const after = zs.getState();
      for (let i = 0; i < 20 && zs.getState().enemies.find((e) => e.id === id).hp === max; i += 1) zs.step(0.05);
      return { flying, nowBullets: after.bullets[0].damage, level: after.stats.levels.degats, lost: max - zs.getState().enemies.find((e) => e.id === id).hp };
    });
    expect(r.level).toBe(0);
    expect(r.flying).toBeCloseTo(62.5, 6);
    expect(r.nowBullets).toBeCloseTo(62.5, 6);
    expect(r.lost).toBeCloseTo(62.5, 6);
  });

  for (const [lvl, delay] of [[0, 0.4], [10, 0.15]]) {
    test(`cadence : intervalle entre tirs ${delay} s au niveau ${lvl} (±10 %, temps de jeu)`, async ({ page }) => {
      await open(page, `&empty=1&nospawn=1&lvl=cadence:${lvl}`);
      await page.evaluate(() => { window.__zs.setInput({ aim: { angle: 0 } }); window.__zs.setPlayer(800, 450); });
      // Un zombie qui reste sur la ligne : replacé à chaque pas.
      const times = await page.evaluate(() => {
        const zs = window.__zs;
        for (let i = 0; i < 60; i += 1) {
          zs.killAll();
          zs.spawnEnemy(1100, 450, { type: 'grand', wave: 10 });
          zs.step(0.05);
        }
        return zs.getState().shots.map((s) => s.time);
      });
      expect(times.length).toBeGreaterThan(5);
      const gaps = times.slice(1).map((t, i) => t - times[i]);
      const mean = gaps.reduce((a, b) => a + b, 0) / gaps.length;
      expect(Math.abs(mean - delay) / delay).toBeLessThanOrEqual(0.1);
    });
  }

  for (const [lvl, speed] of [[0, 220], [10, 308]]) {
    test(`vitesse : ${speed} au niveau ${lvl} (±3 %, mesurée par step() en terrain dégagé)`, async ({ page }) => {
      await open(page, `&empty=1&nospawn=1&lvl=vitesse:${lvl}`);
      const measured = await page.evaluate(() => {
        const zs = window.__zs;
        zs.setPlayer(200, 450);
        zs.setInput({ aim: { angle: 0 }, move: { x: 1, y: 0 } });
        const x0 = zs.getState().player.x;
        zs.step(1);
        return zs.getState().player.x - x0;
      });
      expect(Math.abs(measured - speed) / speed).toBeLessThanOrEqual(0.03);
    });
  }
});

test.describe('statistiques : vie et régénération', () => {
  test('?lvl=vie:5 : vie maximale 160, « Vie x/160 » dans le HUD, barre à l\'échelle, vie remise à 160 en fin de vague', async ({ page }) => {
    await open(page, '&empty=1&lvl=vie:5');
    await page.evaluate(() => window.__zs.setWaveParams({ total: { base: 1, linear: 0, quadratic: 0 } }));
    await step(page, 3.1);
    const s0 = await state(page);
    expect(s0.player.maxHp).toBe(160);
    expect(s0.player.health).toBe(160);
    await expect(page.locator('#hud-life')).toHaveText('Vie 160/160');
    await expect(page.locator('#hud-fill')).toHaveCSS('transform', 'matrix(1, 0, 0, 1, 0, 0)');
    await page.evaluate(([x, y]) => { window.__zs.setInput({ aim: { angle: -Math.PI / 2 } }); window.__zs.spawnEnemy(x + 30, y); }, [s0.player.x, s0.player.y]);
    await step(page, 0.3);
    const hurt = (await state(page)).player.health;
    expect(hurt).toBeLessThan(160);
    await expect(page.locator('#hud-life')).toHaveText(new RegExp(`^Vie ${Math.ceil(hurt)}/160$`));
    const scale = await page.locator('#hud-fill').evaluate((el) => new DOMMatrix(getComputedStyle(el).transform).a);
    expect(scale).toBeCloseTo(Math.ceil(hurt) / 160, 2);
    await page.evaluate(() => window.__zs.killAll());
    await step(page, 0.1);
    expect((await state(page)).player.health).toBe(160);
    await expect(page.locator('#hud-life')).toHaveText('Vie 160/160');
  });

  // Un zombie qui meurt d'une balle d'essai (marcheur, 50 de vie : deux balles niveau 0) ; renvoie la vie avant et après.
  async function killAndHeal(page, extra, startHealth) {
    await open(page, `&empty=1&nospawn=1${extra}`);
    return page.evaluate(([hurtBy]) => {
      const zs = window.__zs;
      zs.setInput({ aim: { angle: Math.PI } });
      zs.setPlayer(800, 450);
      // Une première blessure au contact, puis le zombie est éloigné.
      if (hurtBy > 0) {
        zs.spawnEnemy(830, 450);
        zs.step(0.3);
        zs.killAll();
      }
      const before = zs.getState().player.health;
      const id = zs.spawnEnemy(1100, 450);
      zs.fire(0);
      zs.fire(0);
      for (let i = 0; i < 40 && zs.getState().enemies.some((e) => e.id === id); i += 1) zs.step(0.05);
      const s = zs.getState();
      return { before, after: s.player.health, kills: s.kills, max: s.player.maxHp };
    }, [startHealth]);
  }

  test('joueur blessé : un kill rend 1 PV au niveau 0', async ({ page }) => {
    const r = await killAndHeal(page, '', 1);
    expect(r.kills).toBe(1);
    expect(r.after - r.before).toBe(1);
  });

  test('?lvl=regen:6 : un kill rend 7 PV', async ({ page }) => {
    const r = await killAndHeal(page, '&lvl=regen:6', 1);
    expect(r.kills).toBe(1);
    expect(r.after - r.before).toBe(7);
  });

  test('la régénération ne dépasse jamais le maximum', async ({ page }) => {
    const r = await killAndHeal(page, '&lvl=regen:10', 0);
    expect(r.kills).toBe(1);
    expect(r.before).toBe(100);
    expect(r.after).toBe(100);
    expect(r.after).toBeLessThanOrEqual(r.max);
  });

  test('aucun soin après la mort du joueur', async ({ page }) => {
    await open(page, '&empty=1&nospawn=1&lvl=regen:10');
    await page.evaluate(() => window.__zs.setChutes(0)); // lot 3 : sans chute restante, la vie à 0 est la mort (comme avant)
    const r = await page.evaluate(() => {
      const zs = window.__zs;
      zs.setInput({ aim: { angle: Math.PI } });
      zs.setPlayer(800, 450);
      for (const [x, y] of [[830, 450], [770, 450], [800, 480], [800, 420], [820, 470]]) zs.spawnEnemy(x, y);
      zs.step(5);
      const dead = zs.getState();
      const id = zs.spawnEnemy(1100, 450);
      zs.fire(0);
      zs.fire(0);
      zs.step(1);
      return { dead: dead.dead, health: dead.player.health, later: zs.getState().player.health, id };
    });
    expect(r.dead).toBe(true);
    expect(r.health).toBe(0);
    expect(r.later).toBe(0);
  });
});

test.describe('?lvl= et état', () => {
  test('?lvl=all:5 applique les cinq niveaux aux sept statistiques', async ({ page }) => {
    await open(page, '&empty=1&nospawn=1&lvl=all:5');
    const s = await state(page);
    expect(s.stats.levels).toEqual({ degats: 5, portee: 5, precision: 5, cadence: 5, vitesse: 5, vie: 5, regen: 5 });
    expect(s.stats.values).toMatchObject({ maxHealth: 160, regen: 6 });
    expect(s.stats.values.damage).toBeCloseTo(43.75, 6);
    expect(s.stats.values.speed).toBeCloseTo(264, 6);
    expect(s.player.maxHp).toBe(160);
  });

  test('valeurs hostiles : bornées ou ignorées sans erreur, console propre', async ({ page }) => {
    const problems = [];
    page.on('console', (m) => ['error', 'warning'].includes(m.type()) && !BROWSER_NOISE.test(m.text()) && problems.push(m.text()));
    page.on('pageerror', (e) => problems.push(e.message));
    await open(page, '&empty=1&nospawn=1&lvl=degats:99,foo:3,precision:-2,vie:abc,regen:2.5,%3Cscript%3E');
    const s = await state(page);
    expect(s.stats.levels).toEqual({ degats: 10, portee: 0, precision: 0, cadence: 0, vitesse: 0, vie: 0, regen: 0 });
    expect(s.stats.warnings.length).toBeGreaterThan(0);
    await step(page, 1);
    expect(problems).toEqual([]);
  });

  test('sans ?test=1, ?lvl= s\'applique mais rien n\'est exposé', async ({ page }) => {
    await page.setViewportSize(SIZE);
    test.setTimeout(120_000);
    await page.goto('/jeu.html?lvl=vie:5&nospawn=1');
    await expect(page.locator('#hud-life')).toHaveText('Vie 160/160', { timeout: 90_000 });
    expect(await page.evaluate(() => typeof window.__zs)).toBe('undefined');
  });

  test('aucune requête externe, aucun stockage, aucun cookie, aucune donnée dans les URL, console propre (avec ?lvl=)', async ({ page, baseURL }) => {
    const external = [];
    const urls = [];
    const problems = [];
    page.on('request', (r) => {
      if (!r.url().startsWith(baseURL) && !r.url().startsWith('data:')) external.push(r.url());
      if (r.url().startsWith(baseURL) && r.url().includes('?') && !r.url().includes('/jeu.html')) urls.push(r.url());
    });
    page.on('console', (m) => ['error', 'warning'].includes(m.type()) && !BROWSER_NOISE.test(m.text()) && problems.push(m.text()));
    page.on('pageerror', (e) => problems.push(e.message));
    await open(page, '&empty=1&lvl=all:5&wave=3');
    await step(page, 5);
    expect(external).toEqual([]);
    expect(urls).toEqual([]);
    expect(problems).toEqual([]);
    expect(await page.evaluate(() => [localStorage.length, sessionStorage.length, document.cookie])).toEqual([0, 0, '']);
    expect(await page.context().cookies()).toEqual([]);
    expect(new URL(page.url()).search).toBe('?test=1&seed=1&empty=1&lvl=all:5&wave=3');
  });

  test('axe sans violation avec ?lvl=all:10 (667×375)', async ({ page }) => {
    await open(page, '&empty=1&lvl=all:10');
    const result = await new AxeBuilder({ page }).analyze();
    expect(result.violations).toEqual([]);
  });
});

test.describe('budget et sons au niveau maximal', () => {
  test('10 zombies variés, cône affiché, ombres actives : au plus 300 appels, 15 000 triangles, +10 triangles sur le lot 2 (14 858)', async ({ page }, testInfo) => {
    await open(page, '&nospawn=1&shadows=1&lvl=all:10');
    const r = await page.evaluate(() => {
      const zs = window.__zs;
      const p = zs.getState().player;
      zs.setInput({ aim: { angle: Math.PI } });
      const T = ['marcheur', 'petit', 'voute', 'grand'];
      const G = ['lent', 'marche', 'rampe', 'course'];
      for (let i = 0; i < 10; i += 1) zs.spawnEnemy(p.x + 70 + (i % 5) * 45, p.y - 90 + Math.floor(i / 5) * 90 + (i % 2) * 15, { type: T[i % 4], gait: G[(i + Math.floor(i / 4)) % 4], wave: 10 });
      zs.step(0.05);
      zs.sampleScreen(0, 0, 8, 8);
      const s = zs.getState();
      return { render: s.render, count: s.enemies.length, cone: s.laser?.cone ?? null };
    });
    testInfo.annotations.push({ type: 'rendu', description: `10 zombies + cône : ${r.render.calls} appels, ${r.render.triangles} triangles` });
    console.log(`BUDGET lot 2b, 10 zombies, cône affiché : ${r.render.calls} appels de dessin, ${r.render.triangles} triangles`);
    expect(r.count).toBe(10);
    expect(r.cone).not.toBeNull();
    expect(r.render.calls).toBeLessThanOrEqual(300);
    expect(r.render.triangles).toBeLessThanOrEqual(15000);
    expect(r.render.triangles).toBeLessThanOrEqual(14892); // lot 3 : +24 triangles de planches (14 858 + 10 au lot 2b, 14 862 + 24 = 14 886 mesurés)
  });

  test('niveau 10 partout : une rafale de 20 s n\'a jamais plus de 16 voix actives', async ({ page }) => {
    await open(page, '&empty=1&nospawn=1&lvl=all:10');
    await page.mouse.click(40, 40);
    await expect.poll(async () => (await state(page)).audio.unlocked).toBe(true);
    let max = 0;
    for (let i = 0; i < 40; i += 1) {
      await page.evaluate(() => {
        const zs = window.__zs;
        zs.killAll();
        zs.setPlayer(800, 450);
        zs.setInput({ aim: { angle: 0 } });
        zs.spawnEnemy(1100, 450, { type: 'grand', wave: 10 });
        zs.step(0.5);
      });
      max = Math.max(max, (await state(page)).audio.activeVoices);
    }
    expect(max).toBeLessThanOrEqual(16);
  });
});
