import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { readFileSync } from 'node:fs';
import { waitReady } from './helpers.js';

// Lot 3g, partie C : ?detail=0|1 (textures fines et décor léger), budgets, décor non solide, visibilité par étage, fuites, CLS.
// 667×375, step() et hooks ; les tests se désactivent seuls si WebGL manque. WebGL logiciel : aucune conclusion de vitesse.
const SIZE = { width: 667, height: 375 };
const BROWSER_NOISE = /GL Driver Message|ReadPixels|GPU stall/;
const load = (path) => JSON.parse(readFileSync(path, 'utf8'));
const decor = load('data/game/maps/rez-de-chaussee/decor-interieur.world.json');
const STATE = (page) => page.evaluate(() => window.__zs.getState());
const U = (px) => px * 5 + 800;
// Références mesurées sur main au lancement du lot (scripts/modele/mesures-rendu.mjs) : [appels, triangles].
const REF = { R1: [200, 14442], R2: [201, 14582], R3: [199, 13898], U1: [207, 14788], U4: [212, 15588], V1: [39, 5552], V2: [47, 5908] };
const SCENES = {
  R1: { url: '&nospawn=1', at: [U(300), U(300)], floor: 'rdc', wave: 10, zombies: 10 },
  R2: { url: '&nospawn=1', at: [U(311), U(335)], floor: 'rdc', wave: 10, zombies: 10 },
  R3: { url: '&nospawn=1&wave=11', at: [U(110), U(120)], floor: 'rdc', wave: 11, zombies: 10 },
  U1: { url: '&nospawn=1&wave=21&floor=1', at: [U(100), U(120)], floor: 'etage', wave: 21, zombies: 10 },
  U4: { url: '&nospawn=1&wave=31&floor=1', at: [U(215), U(290)], floor: 'etage', wave: 31, zombies: 10 },
  V1: { url: '&nospawn=1&wave=31', at: [U(300), U(300)], floor: 'rdc', zombies: 0 },
  V2: { url: '&nospawn=1&wave=31&floor=1', at: [U(100), U(120)], floor: 'etage', zombies: 0 },
};

async function open(page, extra = '', size = SIZE) {
  await page.setViewportSize(size);
  await page.goto(`/jeu.html?test=1&seed=1&vhs=0${extra.includes('nospawn') ? '' : '&nospawn=1'}${extra}`);
  await waitReady(page);
  await page.evaluate(() => { window.requestAnimationFrame = () => 0; });
  await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 150)));
  await page.evaluate(() => window.__zs.step(0.05));
}

const measure = (page, sc) => page.evaluate(({ at, floor, wave, zombies }) => {
  const zs = window.__zs;
  zs.setPlayer(at[0], at[1]);
  zs.setInput({ aim: { angle: Math.PI } });
  const T = ['marcheur', 'petit', 'voute', 'grand'];
  const G = ['lent', 'marche', 'rampe', 'course'];
  for (let i = 0; i < zombies; i += 1) zs.spawnEnemy(at[0] + 40 + (i % 5) * 30, at[1] + (Math.floor(i / 5) - 0.5) * 60, { type: T[i % 4], gait: G[(i + Math.floor(i / 4)) % 4], wave, floor });
  zs.step(0.05);
  zs.sampleScreen(0, 0, 8, 8);
  return zs.getState().render;
}, sc);

test.describe('?detail=0 et ?detail=1', () => {
  for (const [label, extra] of [['jeu, détail', '&nospawn=0'], ['jeu, sans détail', '&nospawn=0&detail=0'], ['visite, détail', '&nospawn=1&wave=31'], ['visite, sans détail', '&nospawn=1&wave=31&detail=0']]) {
    test(`${label} : se charge sans erreur ni requête externe`, async ({ page }) => {
      const problems = [];
      const external = [];
      page.on('console', (m) => ['error', 'warning'].includes(m.type()) && !BROWSER_NOISE.test(m.text()) && problems.push(m.text()));
      page.on('pageerror', (e) => problems.push(e.message));
      page.on('request', (r) => { if (!r.url().startsWith('http://localhost') && !r.url().startsWith('data:') && !r.url().startsWith('blob:')) external.push(r.url()); });
      await open(page, extra);
      const s = await STATE(page);
      expect(s.scene.decor.items.rdc > 0).toBe(!extra.includes('detail=0'));
      expect(problems).toEqual([]);
      expect(external).toEqual([]);
    });
  }

  test('?detail=0 n\'est jamais mémorisé : rechargé sans le paramètre, le détail revient', async ({ page }) => {
    await open(page, '&detail=0');
    expect((await STATE(page)).scene.decor.meshes).toEqual([]);
    await open(page);
    expect((await STATE(page)).scene.decor.meshes.length).toBeGreaterThan(0);
    expect(await page.evaluate(() => [localStorage.length, sessionStorage.length])).toEqual([0, 0]);
  });

  test('la visite reste une visite avec le détail : aucun zombie, aucune porte, aucune manche', async ({ page }) => {
    await open(page, '&nospawn=1&wave=31');
    const r = await page.evaluate(() => { window.__zs.step(60); const s = window.__zs.getState(); return { n: s.enemies.length, doors: s.doorMeshes.meshes, phase: s.waves.phase, spawns: s.spawnLog.length }; });
    expect(r).toEqual({ n: 0, doors: 0, phase: 'inactif', spawns: 0 });
  });
});

test.describe('budgets de rendu avec le détail (≤ référence + 1 500 triangles et + 6 appels)', () => {
  for (const [id, sc] of Object.entries(SCENES)) {
    test(`${id}`, async ({ page }, testInfo) => {
      await open(page, `${sc.url}&shadows=1&detail=0`);
      const off = await measure(page, sc);
      await open(page, `${sc.url}&shadows=1`);
      const on = await measure(page, sc);
      const note = `${id} : detail=0 ${off.calls} appels / ${off.triangles} triangles ; detail=1 ${on.calls} / ${on.triangles} (référence ${REF[id].join(' / ')})`;
      testInfo.annotations.push({ type: 'rendu', description: note });
      console.log(`BUDGET lot 3g-C ${note}`);
      expect(on.triangles).toBeLessThanOrEqual(REF[id][1] + 1500);
      expect(on.calls).toBeLessThanOrEqual(REF[id][0] + 6);
      expect(on.triangles - off.triangles).toBeLessThanOrEqual(1500);
      expect(on.calls - off.calls).toBeLessThanOrEqual(6);
      // Sans le détail : la référence, à la géométrie corrigée de la partie B près (quelques triangles).
      expect(Math.abs(off.triangles - REF[id][1])).toBeLessThanOrEqual(60);
      expect(off.calls).toBe(REF[id][0]);
    });
  }
});

test.describe('textures', () => {
  test('getState().textures : 14 textures au plus, 12 Mo au plus', async ({ page }) => {
    await open(page);
    const t = (await STATE(page)).textures;
    expect(t.count).toBeLessThanOrEqual(14);
    expect(t.bytes).toBeLessThanOrEqual(12 * 1024 * 1024);
  });

  test('?fps=1 : « Textures : X ms » avec le détail au plus 1,8 fois le temps sans le détail (même navigateur, même session)', async ({ page }) => {
    const ms = async (extra) => {
      await page.setViewportSize(SIZE);
      await page.goto(`/jeu.html?fps=1&nospawn=1${extra}`);
      await page.waitForFunction(() => /Textures : [\d.,]+ ms/.test(document.body.innerText), null, { timeout: 120_000 });
      return Number((/Textures : ([\d.,]+) ms/.exec(await page.evaluate(() => document.body.innerText))[1]).replace(',', '.'));
    };
    const off = Math.min(await ms('&detail=0'), await ms('&detail=0'));
    const on = Math.min(await ms(''), await ms(''));
    console.log(`TEXTURES lot 3g-C : sans détail ${off} ms, avec détail ${on} ms`);
    expect(on).toBeLessThanOrEqual(off * 1.8);
  });

  // Sol nu : le joueur au centre, la zone échantillonnée sous lui (aucun meuble, aucun décor léger).
  for (const [id, url, at] of [['grande salle', '', [U(352), U(272)]], ['aile', '&wave=11', [U(110), U(170)]], ['étage', '&wave=31&floor=1', [U(120), U(250)]]]) {
    test(`sol de ${id} : plus de couleurs distinctes avec le détail, luminance moyenne à ±6 %`, async ({ page }, testInfo) => {
      const sample = async (extra) => {
        await open(page, `${url}${extra}`);
        return page.evaluate((p) => {
          const zs = window.__zs;
          zs.setPlayer(p[0], p[1]);
          zs.setInput({ aim: { angle: Math.PI / 2 } });
          zs.step(0.3);
          return zs.sampleScreen(40, 220, 160, 110);
        }, at);
      };
      const off = await sample('&detail=0');
      const on = await sample('');
      testInfo.annotations.push({ type: 'sol', description: `${id} : couleurs ${off.distinctColors} → ${on.distinctColors}, luminance ${off.meanLuminance.toFixed(3)} → ${on.meanLuminance.toFixed(3)}` });
      console.log(`SOL lot 3g-C ${id} : couleurs ${off.distinctColors} → ${on.distinctColors}, luminance ${off.meanLuminance.toFixed(3)} → ${on.meanLuminance.toFixed(3)}`);
      expect(on.distinctColors).toBeGreaterThanOrEqual(12);
      expect(on.distinctColors).toBeGreaterThan(off.distinctColors);
      expect(Math.abs(on.meanLuminance / off.meanLuminance - 1)).toBeLessThanOrEqual(0.06);
    });
  }
});

test.describe('décor léger : non solide, par étage, sans fuite', () => {
  const rug = decor.items.find((d) => d.kind === 'tapis' && d.floor === 'rdc');
  const bags = decor.items.find((d) => d.kind === 'sacs');

  test('le joueur traverse un tapis et un tas de sacs : même trajet qu\'avec ?detail=0', async ({ page }) => {
    const walk = async (extra) => {
      await open(page, extra);
      return page.evaluate(([r, b]) => {
        const zs = window.__zs;
        const out = [];
        for (const it of [r, b]) {
          zs.setPlayer(it.x - 80, it.y + it.h / 2);
          zs.setInput({ move: { x: 1, y: 0 } });
          zs.step(2);
          zs.setInput({});
          const p = zs.getState().player;
          out.push([Math.round(p.x), Math.round(p.y)]);
        }
        return out;
      }, [rug, bags]);
    };
    const on = await walk('');
    expect(on).toEqual(await walk('&detail=0'));
    expect(on[0][0]).toBeGreaterThan(rug.x + rug.w);
  });

  test('un zombie traverse le décor léger et un laser le traverse : mêmes résultats qu\'avec ?detail=0', async ({ page }) => {
    const run = async (extra) => {
      await open(page, extra);
      return page.evaluate((b) => {
        const zs = window.__zs;
        zs.setPlayer(b.x + b.w / 2 + 250, b.y + b.h / 2);
        zs.setChutes(5);
        zs.setInput({ aim: { angle: Math.PI } });
        zs.step(0.05);
        const laser = zs.getState().laserEnd;
        const id = zs.spawnEnemy(b.x - 60, b.y + b.h / 2, { mode: 'dedans' });
        const path = [];
        for (let i = 0; i < 40; i += 1) {
          zs.step(0.05);
          const z = zs.getState().enemies.find((e) => e.id === id);
          if (z) path.push([Math.round(z.x), Math.round(z.y)]);
        }
        return { laser, path };
      }, bags);
    };
    const on = await run('');
    const off = await run('&detail=0');
    expect(on).toEqual(off);
  });

  // Le rez-de-chaussée reste toujours dessiné (état final du lot 3e : le sol opaque de l'étage cache le dessous) ; le décor de l'étage n'est dessiné
  // que quand le joueur y est.
  test('le décor de l\'étage n\'est dessiné que sur l\'étage ; chaque maillage porte son étage (userData.floor) et son groupe', async ({ page }) => {
    await open(page, '&wave=31');
    let d = (await STATE(page)).scene.decor;
    expect(d.meshes.map((m) => [m.floor, m.group])).toEqual([['rdc', 'rdc'], ['etage', 'etage']]);
    expect(d.meshes.map((m) => m.drawn)).toEqual([true, false]);
    await page.evaluate(() => { window.__zs.setFloor(1); window.__zs.step(0.1); });
    d = (await STATE(page)).scene.decor;
    expect(d.meshes.map((m) => m.drawn)).toEqual([true, true]);
    await page.evaluate(() => { window.__zs.setFloor(0); window.__zs.step(0.1); });
    expect((await STATE(page)).scene.decor.meshes.map((m) => m.drawn)).toEqual([true, false]);
  });

  test('budget du décor : 1 500 triangles et 2 maillages (un par étage, tous étages, même hors champ)', async ({ page }) => {
    await open(page, '&wave=31');
    const d = (await STATE(page)).scene.decor;
    expect(d.meshes.length).toBe(2);
    expect(d.meshes.reduce((s, m) => s + m.triangles, 0)).toBeLessThanOrEqual(1500);
    expect(d.meshes.reduce((s, m) => s + m.triangles, 0)).toBe(decor.triangles);
  });

  test('10 allers-retours d\'étage : ni géométrie ni texture de plus', async ({ page }) => {
    await open(page, '&wave=31');
    const count = () => page.evaluate(() => { window.__zs.sampleScreen(0, 0, 4, 4); const r = window.__zs.getState().render; return [r.geometries, r.textures]; });
    await page.evaluate(() => { const zs = window.__zs; zs.setFloor(1); zs.step(0.1); zs.sampleScreen(0, 0, 4, 4); zs.setFloor(0); zs.step(0.1); }); // échauffement : premier affichage de l'étage
    const before = await count();
    for (let i = 0; i < 10; i += 1) await page.evaluate(() => { const zs = window.__zs; zs.setFloor(1); zs.step(0.1); zs.sampleScreen(0, 0, 4, 4); zs.setFloor(0); zs.step(0.1); });
    const after = await count();
    expect(after[0]).toBeLessThanOrEqual(before[0]);
    expect(after[1]).toBeLessThanOrEqual(before[1]);
  });

  test('3 « Rejouer » : ni géométrie ni texture de plus, le décor reste construit une seule fois', async ({ page }) => {
    await open(page);
    const count = () => page.evaluate(() => { window.__zs.sampleScreen(0, 0, 4, 4); const s = window.__zs.getState(); return [s.render.geometries, s.render.textures, s.scene.decor.meshes.length]; });
    await page.locator('#btn-pause').click();
    await page.locator('#btn-restart').click();
    await page.evaluate(() => window.__zs.step(0.1)); // échauffement : premier « Rejouer »
    const before = await count();
    for (let i = 0; i < 3; i += 1) {
      await page.locator('#btn-pause').click();
      await page.locator('#btn-restart').click();
      await page.evaluate(() => window.__zs.step(0.1));
    }
    const after = await count();
    expect(after[0]).toBeLessThanOrEqual(before[0]);
    expect(after[1]).toBeLessThanOrEqual(before[1]);
    expect(after[2]).toBe(before[2]);
  });

  test('axe sans violation avec le détail', async ({ page }) => {
    await open(page);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  });
});

test.describe('CLS avec le détail', () => {
  for (const width of [360, 768, 1440]) {
    test(`jeu.html (décor léger et textures fines) avec les données retardées de 400 ms (${width} px) : CLS au plus 0,1`, async ({ browser, baseURL }, testInfo) => {
      test.skip(testInfo.project.name !== 'bureau', 'une seule fois, sans le pointeur tactile du projet mobile (le portrait fige le jeu)');
      test.setTimeout(150_000);
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
      await page.goto(`${baseURL}/jeu.html?test=1&nospawn=1&wave=31`);
      await page.waitForFunction(() => (window.__zs?.getState()?.time ?? 0) > 0.3, null, { timeout: 140_000 });
      expect(await page.evaluate(() => window.__cls)).toBeLessThanOrEqual(0.1);
      await context.close();
    });
  }
});

test('visite.html : le lien « sans les nouveaux détails » pointe vers &detail=0', async ({ page }) => {
  await page.setViewportSize(SIZE);
  await page.goto('/visite.html');
  await expect(page.locator('#visite-detail0')).toHaveAttribute('href', /^jeu\.html\?nospawn=1&wave=\d+&detail=0$/);
});
