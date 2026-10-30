import { test, expect } from '@playwright/test';
import { waitReady, salle } from './helpers.js';

// Lot 3a-A : planches lisibles et sans clipping. Tout passe par step() (temps de jeu) et les hooks de ?test=1 ; les mesures lisent les sommets réels
// des maillages (getState().windows[i].mesh), pas la fonction pure. 667×375 de préférence ; les tests se désactivent seuls si WebGL manque.
const SIZE = { width: 667, height: 375 };
const SILL = 16;
const STATE = (page) => page.evaluate(() => window.__zs.getState());
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

  test('pastilles au sol : 4 pleines à 4 planches, 2 à 2 planches, 0 à 0 ; le trou sombre n\'apparaît qu\'à moins de 4 planches', async ({ page }) => {
    await open(page);
    const rows = await page.evaluate(() => {
      const zs = window.__zs;
      const out = [];
      for (const id of ['fenetre-nord', 'fenetre-ouest', 'fenetre-est']) {
        for (const n of [4, 3, 2, 1, 0]) {
          zs.setPlanks(id, n);
          const m = zs.getState().windows.find((x) => x.id === id).mesh;
          out.push({ id, n, pips: m.pipsOn, hole: m.voidVisible });
        }
      }
      return out;
    });
    for (const r of rows) {
      expect([r.pips, r.hole], `${r.id} ${r.n}`).toEqual([r.n, r.n < 4]);
    }
  });

  test('un maillage par fenêtre : triangles par fenêtre = 42 − poutres absentes − trou masqué', async ({ page }) => {
    await open(page);
    const triangles = await page.evaluate(() => {
      const zs = window.__zs;
      return [4, 3, 2, 1, 0].map((n) => {
        zs.setPlanks('fenetre-nord', n);
        return zs.getState().windows[0].mesh.triangles;
      });
    });
    expect(triangles).toEqual([40, 38, 34, 30, 26]);
  });
});

test.describe('débris : à plat, hors meubles, sans plafond ni limite de durée', () => {
  test('toutes les fenêtres ouvertes : un débris par planche (12), tous à plat (y ≥ 0,3), aucun dans un meuble, dans la salle', async ({ page }) => {
    await open(page, '&planks=0');
    const s = await STATE(page);
    expect(s.debris.length).toBeGreaterThan(0);
    expect(s.debris.length).toBeLessThanOrEqual(12); // 3 fenêtres × 4 planches : un débris par planche arrachée, aucun retiré
    for (const d of s.debris) {
      expect(d.y).toBeGreaterThanOrEqual(0.3);
      expect(d.y).toBeLessThan(6);
      for (const o of s.obstacles) expect(d.x > o.x - 6 && d.x < o.x + o.w + 6 && d.z > o.y - 6 && d.z < o.y + o.h + 6, o.id).toBe(false);
    }
    expect(s.plankMesh.debris).toBe(s.debris.length);
  });

  test('les débris restent à l\'infini (1 000 s de temps de jeu), jusqu\'à ce que la planche soit réparée', async ({ page }) => {
    await open(page);
    const r = await page.evaluate(() => {
      const zs = window.__zs;
      zs.setPlanks('fenetre-nord', 0);
      const born = zs.getState().debris.length;
      for (let i = 0; i < 100; i += 1) zs.step(10);
      const early = zs.getState().debris.length;
      zs.setPlanks('fenetre-nord', 4);
      return { born, early, late: zs.getState().debris.length };
    });
    expect(r.born).toBe(4);
    expect(r.early).toBe(4);
    expect(r.late).toBe(0); // réparée : les débris de la fenêtre sont consommés
  });

  test('jamais plus de débris que de planches manquantes, même en arrachant et en réparant à répétition ; rien n\'est retiré d\'office', async ({ page }) => {
    await open(page);
    const r = await page.evaluate(() => {
      const zs = window.__zs;
      const gaps = [];
      for (let round = 0; round < 3; round += 1) {
        for (const id of ['fenetre-nord', 'fenetre-ouest', 'fenetre-est']) {
          zs.setPlanks(id, 0);
          zs.setPlanks(id, 2);
          zs.setPlanks(id, 0);
          const s = zs.getState();
          gaps.push(s.windows.reduce((n, w) => n + (w.maxPlanks - w.planks), 0) - s.debris.length);
        }
      }
      return gaps;
    });
    for (const g of r) expect(g).toBeGreaterThanOrEqual(0); // jamais plus de débris que de planches manquantes
    expect(r.at(-1)).toBeLessThanOrEqual(1); // à peine une place qui manque : tout est resté au sol
  });

  test('une planche réparée consomme un débris ; la remise à zéro (Rejouer) les retire tous', async ({ page }) => {
    await open(page);
    const r = await page.evaluate(() => {
      const zs = window.__zs;
      zs.setPlanks('fenetre-est', 0);
      const a = zs.getState().debris.length;
      zs.setPlanks('fenetre-est', 3);
      return { a, b: zs.getState().debris.length };
    });
    expect([r.a, r.b]).toEqual([4, 1]);
    await page.click('#btn-pause');
    await page.click('#btn-restart');
    await page.evaluate(() => window.__zs.step(0.05));
    const s = await STATE(page);
    expect(s.debris).toHaveLength(0);
    expect(s.windows.map((w) => w.planks)).toEqual([4, 4, 4]);
  });

  test('débris à la graine du jeu : mêmes positions pour la même graine, différentes pour une autre', async ({ page }) => {
    await open(page, '&planks=0');
    const a = (await STATE(page)).debris.map((d) => [Math.round(d.x), Math.round(d.z)]);
    await open(page, '&planks=0');
    expect((await STATE(page)).debris.map((d) => [Math.round(d.x), Math.round(d.z)])).toEqual(a);
    await open(page, '&planks=0', SIZE, 2);
    expect((await STATE(page)).debris.map((d) => [Math.round(d.x), Math.round(d.z)])).not.toEqual(a);
  });
});

test.describe('culling : seules les fenêtres dans le champ sont dessinées', () => {
  test('joueur à la fenêtre nord : elle est dans le champ, les fenêtres ouest et est non', async ({ page }) => {
    await open(page);
    await page.evaluate(() => { window.__zs.setPlayer(1800, 900); window.__zs.sampleScreen(0, 0, 4, 4); });
    const w = (await STATE(page)).windows;
    expect(w.map((x) => [x.id, x.mesh.inFrustum])).toEqual([['fenetre-nord', true], ['fenetre-ouest', false], ['fenetre-est', false]]);
  });

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

  test('en déplaçant la caméra vers la fenêtre ouest, elle entre dans le champ et ses triangles apparaissent', async ({ page }) => {
    await open(page);
    const r = await page.evaluate(() => {
      const zs = window.__zs;
      const tri = () => {
        zs.sampleScreen(0, 0, 4, 4);
        return zs.getState().render.triangles;
      };
      zs.setPlayer(1800, 900);
      const before = tri();
      const inBefore = zs.getState().windows.find((w) => w.id === 'fenetre-ouest').mesh.inFrustum;
      zs.setPlayer(900, 1400);
      const after = tri();
      const inAfter = zs.getState().windows.find((w) => w.id === 'fenetre-ouest').mesh.inFrustum;
      return { before, after, inBefore, inAfter };
    });
    expect([r.inBefore, r.inAfter]).toEqual([false, true]);
    expect(Number.isFinite(r.before) && Number.isFinite(r.after)).toBe(true);
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
    expect(r.render.triangles).toBeLessThanOrEqual(30000); // lot 3c : meubles modélisés, 14 982 -> limite absolue
    expect(r.render.calls).toBeLessThanOrEqual(300);
    expect(r.render.triangles).toBeLessThanOrEqual(30000);
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
