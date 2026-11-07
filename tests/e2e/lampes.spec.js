import { test, expect } from '@playwright/test';

// Lot 5k : lampes à huile et lumières dynamiques (options « Lampes et lumières » et « Lumières simultanées » de l'écran Options, ?lum=).
// Ce que prouve ce fichier : avec « off », le rendu est celui d'origin/dev (appels, triangles, programmes de shaders) et aucun fichier de plus
// n'est chargé ; « decor » ajoute 2 appels au plus et 1 500 triangles au plus ; la logique du jeu (getState()) est la même dans chaque mode ;
// l'option se change à chaud dans l'écran Options (passage à Perso) ; ?lum= l'impose (ligne grisée). 667 × 375, step() seulement.
const SIZE = { width: 667, height: 375 };
const NOISE = /GL Driver|GPU stall|ReadPixels/;
const U = (px) => px * 5 + 800;
// Références relevées sur origin/dev 080a7fe (avant le lot 5k ; scripts/perf/budget-instant.mjs, mêmes gestes, ?perf=1 pour renderer.info.programs).
const ORIGINE = {
  eleve: { R1: [62, 38479, 18], U1: [67, 39635, 18] },
  moyen: { R1: [60, 23867, 18], U1: [65, 25023, 18] },
  faible: { R1: [42, 19253, 16], U1: [46, 19619, 16] },
};
const SCENES = {
  R1: { url: '&nospawn=1', at: [U(300), U(300)], floor: 'rdc', wave: 10 },
  U1: { url: '&nospawn=1&wave=21&floor=1', at: [U(100), U(120)], floor: 'etage', wave: 21 },
};

async function open(page, query, { hidden = false } = {}) {
  await page.setViewportSize(SIZE);
  if (hidden) await page.addInitScript(() => Object.defineProperty(Document.prototype, 'hidden', { get: () => true, configurable: true }));
  await page.goto(`/jeu.html?test=1&seed=1${query}`);
  await page.waitForFunction(() => window.__zs || document.getElementById('game-error')?.hidden === false, null, { timeout: 90_000 });
  if (await page.locator('#game-error').isVisible()) test.skip(true, 'WebGL indisponible dans cet environnement : test désactivé');
  if (!hidden) {
    await page.evaluate(() => { window.requestAnimationFrame = () => 0; });
    await page.evaluate(() => new Promise((r) => setTimeout(r, 120)));
  }
}
const S = (page) => page.evaluate(() => window.__zs.getState());
const watch = (page) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => (m.type() === 'error' || (m.type() === 'warning' && !NOISE.test(m.text()))) && errors.push(m.text()));
  return errors;
};
// Budget à l'instant de l'apparition de 10 zombies variés (gestes de scripts/perf/budget-instant.mjs).
const budget = (page, sc) => page.evaluate(({ at, floor, wave }) => {
  const zs = window.__zs;
  zs.step(0.05);
  zs.setPlayer(at[0], at[1]);
  zs.setInput({ aim: { angle: Math.PI } });
  const T = ['marcheur', 'petit', 'voute', 'grand'];
  const G = ['lent', 'marche', 'rampe', 'course'];
  for (let i = 0; i < 10; i += 1) zs.spawnEnemy(at[0] + 40 + (i % 5) * 30, at[1] + (Math.floor(i / 5) - 0.5) * 60, { type: T[i % 4], gait: G[(i + Math.floor(i / 4)) % 4], wave, floor });
  zs.step(0.05);
  zs.sampleScreen(0, 0, 8, 8);
  const s = zs.getState();
  return { calls: s.render.calls, triangles: s.render.triangles, programs: s.perf?.renderer?.programs ?? null, lamps: s.graphics.world.lamps };
}, sc);
// Résumé logique (aucun champ visuel) : positions, vies, tués, vague, argent, étage, balles, temps.
const logic = (page) => page.evaluate(() => {
  const s = window.__zs.getState();
  return { player: [s.player.x, s.player.y, s.player.health], enemies: s.enemies.map((e) => [e.id, e.x, e.y, e.health, e.mode, e.floor]), kills: s.kills, wave: s.waves.wave, phase: s.waves.phase, money: s.economy?.balance ?? null, floor: s.floor, bullets: s.bullets.map((b) => [b.x, b.y]), time: s.time };
});

test.describe('lampes à huile', () => {
  test.skip(({ isMobile }) => isMobile, 'bureau (la fenêtre est réglée par chaque test)');

  test('« off » ≡ origin/dev : appels, triangles et programmes de shaders identiques (R1, U1 × Faible, Moyen, Élevé) ; « decor » : +2 appels au plus, +1 500 triangles au plus', async ({ page }) => {
    test.setTimeout(240_000);
    const errors = watch(page);
    for (const gfx of ['eleve', 'moyen', 'faible']) {
      for (const [id, sc] of Object.entries(SCENES)) {
        await open(page, `&perf=1&gfx=${gfx}&lum=off${sc.url}`);
        const off = await budget(page, sc);
        expect([off.calls, off.triangles, off.programs], `${gfx} ${id} off`).toEqual(ORIGINE[gfx][id]);
        expect(off.lamps).toMatchObject({ mode: 'off', meshes: [], lamps: 0 }); // rien de créé ni de chargé
        await open(page, `&perf=1&gfx=${gfx}&lum=decor${sc.url}`);
        const decor = await budget(page, sc);
        expect(decor.lamps).toMatchObject({ mode: 'decor', ready: true, lamps: 16, error: null });
        expect(decor.calls - off.calls, `${gfx} ${id} appels`).toBeGreaterThanOrEqual(0);
        expect(decor.calls - off.calls, `${gfx} ${id} appels`).toBeLessThanOrEqual(2);
        expect(decor.triangles - off.triangles, `${gfx} ${id} triangles`).toBeGreaterThan(0);
        expect(decor.triangles - off.triangles, `${gfx} ${id} triangles`).toBeLessThanOrEqual(1500);
        expect(decor.lamps.meshes.map((m) => m.floor)).toEqual(['rdc', 'etage']);
        expect(decor.lamps.meshes.filter((m) => m.drawn).map((m) => m.floor)).toEqual(sc.floor === 'rdc' ? ['rdc'] : ['rdc', 'etage']);
      }
    }
    expect(errors).toEqual([]);
  });

  test('logique inchangée : même graine, mêmes gestes, 600 pas près des lampes : getState() logique identique avec « off », « decor » et « eclairage »', async ({ page }) => {
    test.setTimeout(240_000);
    const runs = {};
    for (const lum of ['off', 'decor', 'eclairage']) {
      await open(page, `&wave=3&gfx=eleve&lum=${lum}`, { hidden: true });
      await page.evaluate(() => {
        const zs = window.__zs;
        zs.setInput({ aim: { angle: 0.4 }, move: { x: -0.3, y: -0.4 } }); // vers le pilier et la lampe de l'entrée de la grande salle
        for (let i = 0; i < 300; i += 1) zs.step(0.05);
        zs.setInput({ aim: { angle: 2.2 }, move: { x: 0.4, y: 0.1 } });
        for (let i = 0; i < 300; i += 1) zs.step(0.05);
        zs.setInput({});
      });
      runs[lum] = await logic(page);
      expect((await S(page)).graphics.world.lamps.mode).toBe(lum);
    }
    expect(runs.off.time).toBeGreaterThan(29);
    expect(runs.off.enemies.length + runs.off.kills).toBeGreaterThan(0); // des zombies sont apparus : la comparaison a du contenu
    expect(runs.decor).toEqual(runs.off);
    expect(runs.eclairage).toEqual(runs.off);
  });

  test('fichiers : « off » n\'en charge aucun de plus (113 JavaScript) ; « decor » demande lamps.js et lampes.world.json, jamais lights.js ni lumieres.json', async ({ page, baseURL }) => {
    const files = [];
    page.on('request', (r) => r.url().startsWith(baseURL) && files.push(new URL(r.url()).pathname));
    await open(page, '&nospawn=1&lum=off');
    expect(new Set(files.filter((f) => f.endsWith('.js'))).size).toBe(113);
    for (const f of ['/js/game/lamps.js', '/js/core/lamps.js', '/js/game/lights.js', '/data/game/lumieres.json']) expect(files).not.toContain(f);
    expect(files.some((f) => f.includes('lampes'))).toBe(false);
    files.length = 0;
    await open(page, '&nospawn=1&lum=decor');
    for (const f of ['/js/game/lamps.js', '/js/core/lamps.js', '/data/game/maps/rez-de-chaussee/lampes.world.json']) expect(files).toContain(f);
    for (const f of ['/js/game/lights.js', '/data/game/lumieres.json']) expect(files).not.toContain(f);
  });

  test('écran Options : section Lumières, « Décor » à chaud depuis « off » (passage à Perso, module importé une fois, préchauffage), ?lum= grise la ligne', async ({ page, baseURL }) => {
    const errors = watch(page);
    const files = [];
    page.on('request', (r) => r.url().startsWith(baseURL) && files.push(new URL(r.url()).pathname));
    // Préférence Faible enregistrée (zs.device.v1) : lampes « off » au chargement, aucun module des lampes demandé.
    await page.goto('/data/game/graphics.json');
    await page.evaluate(() => localStorage.setItem('zs.device.v1', JSON.stringify({ v: 2, graphics: 'faible', custom: null })));
    await open(page, '&nospawn=1&store=local');
    expect(files).not.toContain('/js/game/lamps.js');
    await page.evaluate(() => window.__zs.step(0.05));
    await page.locator('#btn-pause').click();
    await page.locator('#btn-options').click();
    await expect(page.locator('#options-panel')).toBeVisible();
    await expect(page.locator('[data-option="lampes"] [data-value="off"]')).toHaveAttribute('aria-pressed', 'true');
    expect((await S(page)).graphics.world.lamps.mode).toBe('off');
    // « Décor » à la main : Perso, module importé à chaud, lampes créées et précompilées une fois.
    await page.locator('[data-option="lampes"] [data-value="decor"]').click();
    await page.waitForFunction(() => window.__zs.getState().graphics.world.lamps.ready && window.__zs.getState().graphics.world.lamps.mode === 'decor');
    const g = (await S(page)).graphics;
    expect(g.choice).toBe('perso');
    expect(g.vector.lampes).toBe('decor');
    expect(g.world.lamps).toMatchObject({ mode: 'decor', lamps: 16, error: null });
    expect(g.world.lamps.meshes).toHaveLength(2);
    expect(files.filter((f) => f === '/js/game/lamps.js')).toHaveLength(1);
    expect(g.world.lamps.compiles).toBeLessThanOrEqual(1); // préchauffage au changement (une fois, si une image a déjà été dessinée)
    // Retour à « Aucune » : maillages cachés, rien de rechargé.
    await page.locator('[data-option="lampes"] [data-value="off"]').click();
    await page.waitForFunction(() => window.__zs.getState().graphics.world.lamps.mode === 'off');
    expect((await S(page)).graphics.world.lamps.meshes.every((m) => !m.visible)).toBe(true);
    expect(errors).toEqual([]);
    // ?lum= impose l'option : ligne grisée « imposé par l'adresse », jamais enregistrée dans Perso.
    await open(page, '&nospawn=1&lum=decor');
    await page.locator('#btn-pause').click();
    await page.locator('#btn-options').click();
    await expect(page.locator('[data-option="lampes"] [data-value="decor"]')).toBeDisabled();
    await expect(page.locator('[data-option="lampes"]')).toContainText('imposé par l\'adresse');
    expect((await S(page)).graphics.imposed).toEqual(['lampes']);
  });
});
