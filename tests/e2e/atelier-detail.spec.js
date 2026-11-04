import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { readFileSync } from 'node:fs';
import { waitReady } from './helpers.js';

// Lot 3g, partie C : ?detail=0|1 (textures fines et décor léger), budgets, décor non solide, visibilité par étage, fuites, CLS.
// 667×375, step() et hooks ; les tests se désactivent seuls si WebGL manque. WebGL logiciel : aucune conclusion de vitesse.
const SIZE = { width: 667, height: 375 };
const load = (path) => JSON.parse(readFileSync(path, 'utf8'));
const decor = load('data/game/maps/rez-de-chaussee/decor-interieur.world.json');
// Retours du propriétaire (après C) : mobilier redessiné d'après le modèle, dans le maillage des meubles (aucun appel ajouté) ; ses triangles comptent deux fois
// (passe d'ombre). Budget du détail : décor léger 1 500 + 2 × triangles du mobilier ; 30 000 au plus (budget de l'étage).
const MOBILIER = 2 * load('data/game/maps/rez-de-chaussee/mobilier.world.json').triangles;
// Lot 5a : triangles des épaves (hélicoptère écrasé et voiture calcinée, maillage du décor de l'atlas, dessinés aussi avec ?detail=0 : ils sont solides), ajoutés aux références.
const EPAVES = (load('data/game/maps/rez-de-chaussee/decor.json').wrecks?.helicopter?.triangles ?? 0) + 158 + (JSON.parse(readFileSync('data/game/maps/rez-de-chaussee/decor.json', 'utf8')).wrecks?.helicopter?.scarTriangles ?? 0); // lot 5a-F : + le cratère et la traînée (sol de terre) // + la voiture calcinée posée à part (3 boîtes de 10 triangles, 4 roues de 32), dans le même maillage
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

// Retours du propriétaire (quatrième passe) : avec le mobilier d'après le modèle, les portes, le feu, l'extérieur plus vivant et le brouillard, le budget du détail
// n'est plus « référence + 1 500 » (décor léger seul) mais les plafonds du projet : 30 000 triangles (budget de l'étage) et 240 appels (objectif) ; le détail ajoute
// au plus 12 appels (décor léger, feux) ; sans le détail, la référence à quelques triangles près (+ 2 appels : nappes de brume ; ± 1 : fenêtres F7 et pastilles).
test.describe('budgets de rendu avec le détail (30 000 triangles et 240 appels au plus ; + 12 appels au plus avec le détail)', () => {
  for (const [id, sc] of Object.entries(SCENES)) {
    test(`${id}`, async ({ page }, testInfo) => {
      await open(page, `${sc.url}&shadows=1&detail=0&perso=actuel&sang=0`); // lot 3m : référence mesurée avec l'ancien modèle des personnages
      const off = await measure(page, sc);
      await open(page, `${sc.url}&shadows=1&perso=actuel&sang=0`); // lot 3m : même modèle que la mesure sans le détail
      const on = await measure(page, sc);
      const note = `${id} : detail=0 ${off.calls} appels / ${off.triangles} triangles ; detail=1 ${on.calls} / ${on.triangles} (référence ${REF[id].join(' / ')})`;
      testInfo.annotations.push({ type: 'rendu', description: note });
      console.log(`BUDGET lot 3g-C ${note}`);
      expect(on.triangles).toBeLessThanOrEqual(30000);
      expect(on.calls).toBeLessThanOrEqual(240);
      expect(on.calls - off.calls).toBeLessThanOrEqual(12);
      expect(on.triangles - off.triangles).toBeLessThanOrEqual(1500 + MOBILIER + 4000);
      expect(Math.abs(off.triangles - EPAVES - REF[id][1])).toBeLessThanOrEqual(80); // lot 5a : + les triangles des épaves
      expect(off.calls).toBeLessThanOrEqual(REF[id][0] + 3);
      expect(off.calls).toBeGreaterThanOrEqual(REF[id][0] - 1);
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

  test('?fps=1 : « Textures : X ms » avec le détail au plus 1,8 fois le temps sans le détail (même navigateur, même session) @instable', async ({ page }) => {
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
  // Grande salle : point déplacé (retours du propriétaire) : l'ancien (352, 272) touche le feu de P9 (lueur et fumée).
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
    // Retours du propriétaire : les grilles (20 triangles chacune au catalogue) sont dessinées avec les murs (vrais barreaux), pas dans le maillage du décor léger.
    expect(d.meshes.reduce((s, m) => s + m.triangles, 0)).toBe(decor.triangles - 20 * decor.items.filter((it) => it.kind === 'grille').length);
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

