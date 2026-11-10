import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { readFileSync } from 'node:fs';
import { backgroundsFrom, evaluate, tokensFromCss } from '../../js/core/ui-measure.js';

// Lot 5k : lampes à huile et lumières dynamiques (options « Lumière des lampes » et « Lumières simultanées » de l'écran Options, ?lum=). Lot 5k-F
// (décision du propriétaire) : les lampes sont toujours sur la carte ; ?lum=off (rendu d'avant les lampes) n'existe que sous ?test=1, pour comparer.
// Ce que prouve ce fichier : avec « off », le rendu est celui d'origin/dev (appels, triangles, programmes de shaders) et aucun fichier de plus
// n'est chargé ; « decor » ajoute 2 appels au plus et 1 500 triangles au plus ; la logique du jeu (getState()) est la même dans chaque mode ;
// l'option se change à chaud dans l'écran Options (passage à Perso) ; ?lum= l'impose (ligne grisée). 667 × 375, step() seulement.
const SIZE = { width: 667, height: 375 };
const NOISE = /GL Driver|GPU stall|ReadPixels/;
const U = (px) => px * 5 + 800;
const uiCfg = JSON.parse(readFileSync('data/game/ui-atelier.json', 'utf8'));
const backgrounds = backgroundsFrom(tokensFromCss(readFileSync('css/tokens.css', 'utf8')), uiCfg.worstBackgrounds);
// Accès de test de l'atelier de l'interface (comme graphismes.spec.js) : contraste 4,5:1, 14 px, 44 px, chevauchements.
async function measure(page, screen) {
  const raw = await page.evaluate(async ({ sc, sz }) => {
    const a = await import('./js/atelier-interface/actuel.js');
    const m = await import('./js/atelier-interface/measure-dom.js');
    return m.collect(document, { root: document.body, viewport: sz, safe: { top: 0, right: 0, bottom: 0, left: 0 }, modal: sc === 'pause', hudNames: a.ACTUEL_HUD_NAMES, items: a.actuelItems(sc) });
  }, { sc: screen, sz: SIZE });
  return evaluate(raw, backgrounds, uiCfg.rules);
}
// Luminance (Rec. 709, valeurs sRGB de 0 à 255) de chaque pixel de la zone (x, y, w, h en pixels CSS) après une image dessinée.
const pixels = (page, x, y, w, h) => page.evaluate(({ x, y, w, h }) => {
  window.__zs.sampleScreen(0, 0, 4, 4);
  const src = document.querySelector('#game-canvas canvas');
  const k = src.width / innerWidth;
  const c = document.createElement('canvas');
  c.width = Math.round(w * k);
  c.height = Math.round(h * k);
  const g = c.getContext('2d', { willReadFrequently: true });
  g.drawImage(src, Math.round(x * k), Math.round(y * k), c.width, c.height, 0, 0, c.width, c.height);
  const d = g.getImageData(0, 0, c.width, c.height).data;
  const out = [];
  for (let i = 0; i < d.length; i += 4) out.push(0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]);
  return out;
}, { x, y, w, h });
// Références relevées sur origin/dev 080a7fe (avant le lot 5k ; scripts/perf/budget-instant.mjs, mêmes gestes, ?perf=1 pour renderer.info.programs).
// Lot 5k-J (retour du propriétaire) : U1 a 12 triangles de moins qu'origin/dev (garde-corps retiré contre le mur ouest de l'étage, fenceParts).
const ORIGINE = {
  eleve: { R1: [62, 38479, 18], U1: [67, 39623, 18] },
  moyen: { R1: [60, 23867, 18], U1: [65, 25011, 18] },
  faible: { R1: [42, 19253, 16], U1: [46, 19607, 16] },
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
  return { player: [s.player.x, s.player.y, s.player.health], enemies: s.enemies.map((e) => [e.id, e.x, e.y, e.health, e.mode, e.floor]), kills: s.kills, wave: s.waves.wave, phase: s.waves.phase, money: s.economy?.balance ?? null, floor: s.floor, bullets: s.bullets.map((b) => [b.x, b.y]), time: s.time, windows: s.windows.map((w) => [w.id, w.planks, w.repairProgress, w.tearers, w.climbers]) }; // lot 5k-C3 : planches
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
        expect(decor.triangles - off.triangles, `${gfx} ${id} triangles`).toBeGreaterThanOrEqual(0);
        expect(decor.triangles - off.triangles, `${gfx} ${id} triangles`).toBeLessThanOrEqual(1500);
        expect(decor.lamps.meshes.map((m) => m.floor)).toEqual(['rdc', 'etage']);
        // Seules les lampes dans le champ sont dessinées : triangles ajoutés = ceux des lampes visibles ; un appel par étage qui en montre une.
        const drawn = decor.lamps.meshes.filter((m) => m.drawn);
        expect(drawn.length, `${gfx} ${id}`).toBe(decor.calls - off.calls);
        expect(decor.triangles - off.triangles).toBe(drawn.reduce((n, m) => n + m.drawnTriangles, 0));
        expect(drawn.flatMap((m) => m.shown).length, `${gfx} ${id} lampes dans le champ`).toBeGreaterThan(0);
        if (sc.floor === 'rdc') expect(drawn.map((m) => m.floor)).toEqual(['rdc']);
      }
    }
    expect(errors).toEqual([]);
  });

  test('logique inchangée : même graine, mêmes gestes, 600 pas près des lampes, planches changées (lot 5k-C3) : getState() logique identique avec « off », « decor » et « eclairage »', async ({ page }) => {
    test.setTimeout(240_000);
    const runs = {};
    for (const lum of ['off', 'decor', 'eclairage']) {
      await open(page, `&wave=3&gfx=eleve&lum=${lum}`, { hidden: true });
      await page.evaluate(() => {
        const zs = window.__zs;
        zs.setInput({ aim: { angle: 0.4 }, move: { x: -0.3, y: -0.4 } }); // vers le pilier et la lampe de l'entrée de la grande salle
        for (let i = 0; i < 300; i += 1) {
          if (i === 100) zs.setPlanks('F8', 1); // lot 5k-C3 : la lune suit les planches (lecture seule)
          if (i === 200) zs.setPlanks('F6', 0);
          zs.step(0.05);
        }
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

  test('fichiers : « off » n\'en charge aucun de plus (114 JavaScript, lot 8a : + js/menu/demarrage.js) ; « decor » demande lamps.js et lampes.world.json, jamais lights.js ni lumieres.json', async ({ page, baseURL }) => {
    const files = [];
    page.on('request', (r) => r.url().startsWith(baseURL) && files.push(new URL(r.url()).pathname));
    await open(page, '&nospawn=1&lum=off');
    expect(new Set(files.filter((f) => f.endsWith('.js'))).size).toBe(114);
    for (const f of ['/js/game/lamps.js', '/js/core/lamps.js', '/js/game/lights.js', '/data/game/lumieres.json']) expect(files).not.toContain(f);
    expect(files.some((f) => f.includes('lampes'))).toBe(false);
    files.length = 0;
    await open(page, '&nospawn=1&lum=decor');
    for (const f of ['/js/game/lamps.js', '/js/core/lamps.js', '/data/game/maps/rez-de-chaussee/lampes.world.json']) expect(files).toContain(f);
    for (const f of ['/js/game/lights.js', '/data/game/lumieres.json']) expect(files).not.toContain(f);
    // « eclairage » (?lum= ou, sur un ordinateur, Auto = Élevé) : lights.js et lumieres.json en plus, une fois chacun.
    for (const q of ['&nospawn=1&lum=eclairage', '&nospawn=1']) {
      files.length = 0;
      await open(page, q);
      for (const f of ['/js/game/lamps.js', '/js/game/lights.js', '/data/game/lumieres.json', '/data/game/maps/rez-de-chaussee/lampes.world.json']) expect(files.filter((x) => x === f), `${q} ${f}`).toHaveLength(1);
      expect((await S(page)).graphics.world.lamps).toMatchObject({ mode: 'eclairage', ready: true, lights: { count: 4 } });
    }
  });

  test('éclairage : nombre de lumières et programmes de shaders constants pendant 600 pas (d\'une salle à l\'autre, montée à l\'étage) ; lumières de l\'étage affiché seulement ; sans ombre', async ({ page }) => {
    test.setTimeout(180_000);
    const errors = watch(page);
    await open(page, '&perf=1&gfx=eleve&lum=eclairage&nospawn=1&wave=31&floor=1');
    const read = () => page.evaluate(() => {
      const s = window.__zs.getState();
      return { programs: s.perf.renderer.programs, lights: s.graphics.world.lamps.lights, floor: s.floor };
    });
    await page.evaluate(() => { window.__zs.step(0.05); window.__zs.sampleScreen(0, 0, 4, 4); });
    const first = await read();
    expect(first.lights.count).toBe(4);
    const seen = [];
    for (const [x, y] of [[U(300), U(300)], [U(200), U(260)], [U(100), U(150)], [U(90), U(300)]]) {
      const r = await page.evaluate(([px, py]) => {
        const zs = window.__zs;
        zs.setPlayer(px, py);
        const out = [];
        for (let i = 0; i < 150; i += 1) {
          zs.step(0.05);
          if (i % 30 === 29) {
            zs.sampleScreen(0, 0, 4, 4);
            const s = zs.getState();
            out.push({ programs: s.perf.renderer.programs, count: s.graphics.world.lamps.lights.count, ids: s.graphics.world.lamps.lights.slots.map((q) => q.id), floor: s.floor?.player ?? s.floor });
          }
        }
        return out;
      }, [x, y]);
      seen.push(...r);
    }
    expect(seen.length).toBe(20);
    for (const r of seen) {
      expect(r.programs).toBe(first.programs); // aucune recompilation en partie
      expect(r.count).toBe(4);
    }
    const doc = JSON.parse(readFileSync('data/game/maps/rez-de-chaussee/lampes.world.json', 'utf8'));
    // Lot 5k-G : les feux sont aussi des sources (intérieurs : lampes.world.json → feux ; extérieurs : identifiants « feu:… », toujours permis).
    const floorOf = Object.fromEntries([...doc.lampes, ...doc.feux].map((l) => [l.id, l.floor]));
    const shown = (await S(page)).floor;
    const ids = seen.flatMap((r) => r.ids).filter(Boolean);
    expect(ids.length).toBeGreaterThan(0);
    // Toutes les lampes éclairées sont de l'étage affiché (ici l'étage : la partie démarre à l'étage, le joueur y reste).
    expect(JSON.stringify(shown)).toMatch(/etage/);
    for (const id of ids) expect(id.startsWith('feu:') ? 'exterieur' : floorOf[id], id).toMatch(/^(etage|exterieur)$/);
    expect(errors).toEqual([]);
  });

  test('étage superposé : une lampe de l\'étage près du trou de l\'escalier n\'éclaire pas le rez-de-chaussée vu par le trou (pixels identiques avec et sans les lampes), mais éclaire l\'étage', async ({ page }) => {
    test.setTimeout(120_000);
    // Joueur au-dessus du trou de l'escalier de départ (étage) : le centre de l'écran montre le rez-de-chaussée par le trou ; lampe-u7 est à
    // moins de 230 unités. Mêmes images avec ?lampgain=0 (lampes éteintes, base réduite identique) : seule la lumière des lampes change.
    const hole = { x: 2147, y: 2100 };
    const shots = {};
    for (const gain of ['1', '0']) {
      await open(page, `&gfx=eleve&lum=eclairage&nospawn=1&wave=31&floor=1&vhs=0&lampgain=${gain}`);
      await page.evaluate(({ x, y }) => {
        const zs = window.__zs;
        zs.step(0.05);
        zs.setPlayer(x, y);
        for (let i = 0; i < 40; i += 1) zs.step(0.05);
      }, hole);
      const s = await S(page);
      shots[gain] = { state: s.graphics.world.lamps.lights, hole: await pixels(page, SIZE.width / 2 + 25, SIZE.height / 2 - 40, 40, 30), frame: await pixels(page, 0, 0, SIZE.width, SIZE.height) };
    }
    const on = shots['1'].state;
    const u7 = on.slots.findIndex((q) => q.id === 'lampe-u7');
    expect(u7).toBeGreaterThanOrEqual(0);
    expect(on.intensities[u7]).toBeGreaterThan(0);
    expect(shots['0'].state.intensities.every((i) => i === 0)).toBe(true);
    expect(shots['1'].hole).toEqual(shots['0'].hole); // le rez-de-chaussée vu par le trou : pas un pixel de différence
    const brighter = shots['1'].frame.filter((v, i) => v > shots['0'].frame[i] + 4).length;
    expect(brighter).toBeGreaterThan(500); // les lampes éclairent bien l'étage
  });

  test('changement à chaud (groupe « live ») : 4 → 6 lumières, Décor, retour à Éclairage ; programmes préchauffés au changement ; lumière de base rendue ; console propre ; axe ; HUD lisible sur les zones sombres', async ({ page, baseURL }) => {
    test.setTimeout(120_000);
    const errors = watch(page);
    const files = [];
    page.on('request', (r) => r.url().startsWith(baseURL) && files.push(new URL(r.url()).pathname));
    await open(page, '&nospawn=1&wave=21&floor=1');
    await page.evaluate(() => window.__zs.step(3.3));
    const hud = await measure(page, 'hud');
    expect(hud.outOfTarget).toEqual([]);
    expect(hud.minContrast).toBeGreaterThanOrEqual(4.5);
    let g = (await S(page)).graphics;
    expect(g.vector).toMatchObject({ lampes: 'eclairage', lumieres: '4' }); // Auto sur un ordinateur : Élevé
    const base = g.world.lamps.lights.base;
    expect(g.world.lamps.lights.ambient).toBeLessThan(base.ambient);
    await page.locator('#btn-pause').click();
    await page.locator('#btn-options').click();
    await expect(page.locator('#options-panel')).toBeVisible();
    const compiles = g.world.lamps.compiles;
    await page.locator('[data-option="lumieres"] [data-value="6"]').click();
    await page.waitForFunction(() => window.__zs.getState().graphics.world.lamps.lights?.count === 6);
    g = (await S(page)).graphics;
    expect(g.choice).toBe('perso');
    expect(g.world.lamps.compiles).toBe(compiles + 1); // préchauffage (renderer.compile) au changement
    await page.locator('[data-option="lampes"] [data-value="decor"]').click();
    await page.waitForFunction(() => window.__zs.getState().graphics.world.lamps.mode === 'decor');
    g = (await S(page)).graphics;
    expect(g.world.lamps.lights).toBeNull();
    await page.locator('[data-option="lampes"] [data-value="eclairage"]').click();
    await page.waitForFunction(() => window.__zs.getState().graphics.world.lamps.lights?.count === 6);
    g = (await S(page)).graphics;
    expect(g.world.lamps.lights.base).toEqual(base); // intensités d'origine retrouvées entre-temps, réduites de nouveau
    expect(files.filter((f) => f === '/js/game/lights.js')).toHaveLength(1);
    const axe = await new AxeBuilder({ page }).include('#options-panel').analyze();
    expect(axe.violations).toEqual([]);
    expect(errors).toEqual([]);
  });

  test('prefers-reduced-motion : lumière constante (aucun vacillement)', async ({ browser }) => {
    const context = await browser.newContext({ viewport: SIZE, reducedMotion: 'reduce' });
    const page = await context.newPage();
    await open(page, '&nospawn=1&lum=eclairage');
    const series = await page.evaluate(() => {
      const zs = window.__zs;
      for (let i = 0; i < 40; i += 1) zs.step(0.05); // fondu d'entrée terminé
      const out = [];
      for (let i = 0; i < 60; i += 1) {
        zs.step(0.05);
        out.push(zs.getState().graphics.world.lamps.lights.intensities.join(','));
      }
      return { out, reduced: zs.getState().graphics.world.lamps.lights.reduced };
    });
    expect(series.reduced).toBe(true);
    expect(new Set(series.out).size).toBe(1);
    // Lot 5k-H : au rez-de-chaussée, étage caché : portée libre (lampes 240, feux 280, lumieres.json) ; rayons de lune par les fenêtres ouest et sud.
    const l = await page.evaluate(() => window.__zs.getState().graphics.world.lamps.lights);
    const cfg = JSON.parse(readFileSync('data/game/lumieres.json', 'utf8'));
    l.slots.forEach((q, i) => {
      if (q.id !== null) expect(l.distances[i], q.id).toBe(q.id.startsWith('feu') ? cfg.feux.distance : cfg.distance);
    });
    expect(l.moon).toEqual([['rdc', 96], ['etage', 96]]); // quatre fenêtres par étage, 24 triangles chacune (rayon doux en grille, lot 5k-I)
    await context.close();
  });

  test('écran Options (lot 5k-F) : lampes toujours présentes à Faible ; « Dynamique » à chaud (passage à Perso, lights.js importé une fois, préchauffage), « Coupée » rend la lumière de base, les lampes restent ; ?lum= grise la ligne', async ({ page, baseURL }) => {
    const errors = watch(page);
    const files = [];
    page.on('request', (r) => r.url().startsWith(baseURL) && files.push(new URL(r.url()).pathname));
    // Préférence Faible enregistrée (zs.device.v1) : lampes sur la carte dès le chargement, sans lumière dynamique (lights.js jamais demandé).
    // Écrite avant le premier chargement du jeu (script d'initialisation, une seule fois par onglet) : aucune autre page visitée, donc aucune
    // requête parasite (le Chrome de la CI demandait /favicon.ico pour la page de graphics.json, 404 relevé après la remise à zéro des erreurs).
    await page.addInitScript(() => {
      if (sessionStorage.getItem('lampes-init')) return;
      localStorage.setItem('zs.device.v1', JSON.stringify({ v: 2, graphics: 'faible', custom: null }));
      sessionStorage.setItem('lampes-init', '1');
    });
    await open(page, '&nospawn=1&store=local');
    for (const f of ['/js/game/lamps.js', '/js/core/lamps.js', '/data/game/maps/rez-de-chaussee/lampes.world.json']) expect(files).toContain(f);
    for (const f of ['/js/game/lights.js', '/data/game/lumieres.json']) expect(files).not.toContain(f);
    await page.evaluate(() => window.__zs.step(0.05));
    let g = (await S(page)).graphics;
    expect(g.world.lamps).toMatchObject({ mode: 'decor', lamps: 16, lights: null, error: null });
    expect(g.world.lamps.meshes).toHaveLength(2);
    expect(g.world.lamps.meshes.every((m) => m.on)).toBe(true);
    await page.locator('#btn-pause').click();
    await page.locator('#btn-options').click();
    await expect(page.locator('#options-panel')).toBeVisible();
    await expect(page.locator('[data-option="lampes"] [data-value="off"]')).toHaveCount(0); // plus de valeur « sans lampes » dans l'écran
    await expect(page.locator('[data-option="lampes"] [data-value="decor"]')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('[data-option="lampes"] [data-value="decor"]')).toHaveText('Coupée');
    // « Dynamique » à la main : Perso, module des lumières importé à chaud, 2 lumières (Faible), précompilées une fois.
    const compiles = g.world.lamps.compiles;
    await page.locator('[data-option="lampes"] [data-value="eclairage"]').click();
    await page.waitForFunction(() => window.__zs.getState().graphics.world.lamps.ready && window.__zs.getState().graphics.world.lamps.lights?.count === 2);
    g = (await S(page)).graphics;
    expect(g.choice).toBe('perso');
    expect(g.vector.lampes).toBe('eclairage');
    expect(g.world.lamps.mode).toBe('eclairage');
    expect(files.filter((f) => f === '/js/game/lights.js')).toHaveLength(1);
    expect(g.world.lamps.compiles).toBe(compiles + 1); // préchauffage au changement
    const base = g.world.lamps.lights.base;
    // « Coupée » : lumières retirées, lumière de base rendue, les lampes restent visibles.
    await page.locator('[data-option="lampes"] [data-value="decor"]').click();
    await page.waitForFunction(() => window.__zs.getState().graphics.world.lamps.mode === 'decor');
    g = (await S(page)).graphics;
    expect(g.world.lamps.lights).toBeNull();
    expect(g.world.lamps.meshes.every((m) => m.on)).toBe(true);
    expect(base).toEqual({ ambient: 2.3, sun: 3.5 }); // intensités de render.json (rendues à la sortie de l'éclairage)
    expect(errors).toEqual([]);
    // ?lum= impose l'option : ligne grisée « imposé par l'adresse », jamais enregistrée dans Perso.
    await open(page, '&nospawn=1&lum=eclairage');
    await page.locator('#btn-pause').click();
    await page.locator('#btn-options').click();
    await expect(page.locator('[data-option="lampes"] [data-value="eclairage"]')).toBeDisabled();
    await expect(page.locator('[data-option="lampes"]')).toContainText('imposé par l\'adresse');
    expect((await S(page)).graphics.imposed).toEqual(['lampes']);
  });

  // Lot 5k-C3 (complément du propriétaire) : la lumière de lune de chaque fenêtre baisse avec ses planches posées (niveauLune), avec un fondu en
  // temps de jeu ; lecture seule de l'état des fenêtres (le même que celui du dessin des planches). Mouvement réduit : lampes constantes, seules
  // les planches changent l'image. Point de mesure : centre de la tache, prolongé vers l'intérieur depuis la fenêtre (hors du dessus des planches).
  const LUNE = JSON.parse(readFileSync('data/game/lumieres.json', 'utf8')).lune.planches;
  const moonAt = (page, win) => page.evaluate(({ win, W, H }) => {
    const zs = window.__zs;
    const s = zs.getState();
    const q = s.moonPatches.find((m) => m.fenetre === win);
    const w = s.windows.find((m) => m.id === win);
    const cx = (2 * q.screen.x - w.screen.x) * W;
    const cy = (2 * q.screen.y - w.screen.y) * H;
    const at = (x, y) => zs.sampleScreen(Math.round(x - 3), Math.round(y - 3), 6, 6);
    const patch = at(cx, cy);
    return { niveau: zs.getState().graphics.lune.find((m) => m.fenetre === win).niveau, patch: patch.meanLuminance, max: patch.maxChannel, voisin: Math.max(at(cx - 70, cy).meanLuminance, at(cx + 70, cy).meanLuminance) };
  }, { win, W: SIZE.width, H: SIZE.height });
  const nearPatch = (page, win) => page.evaluate((win) => {
    const zs = window.__zs;
    const q = zs.getState().moonPatches.find((m) => m.fenetre === win);
    zs.setPlayer(q.x, q.y - 150);
    zs.step(1);
  }, win);

  test('lune selon les planches (5k-C3) : 4, 2 et 0 planches → niveau minimum, intermédiaire, 1 ; luminance de la tache dans le même ordre, à 4 planches ≥ +5 % du sol voisin ; aucun canal au-dessus de 235 ; fondu sans saut ; console propre ; axe', async ({ browser }) => {
    const context = await browser.newContext({ viewport: SIZE, reducedMotion: 'reduce' });
    const page = await context.newPage();
    const errors = watch(page);
    await open(page, '&nospawn=1&wave=10&gfx=eleve&lum=eclairage');
    await nearPatch(page, 'F8');
    const levels = {};
    for (const n of [4, 2, 0]) {
      await page.evaluate((n) => { window.__zs.setPlanks('F8', n); window.__zs.step(1); }, n);
      levels[n] = await moonAt(page, 'F8');
    }
    expect(levels[4].niveau).toBeCloseTo(LUNE.minimum, 4);
    expect(levels[2].niveau).toBeCloseTo(LUNE.minimum + (1 - LUNE.minimum) * 0.5, 4);
    expect(levels[0].niveau).toBe(1);
    expect(levels[0].patch).toBeGreaterThan(levels[2].patch);
    expect(levels[2].patch).toBeGreaterThan(levels[4].patch);
    expect(levels[4].patch).toBeGreaterThanOrEqual(levels[4].voisin * 1.05); // cible fixée par le propriétaire (+5 %)
    expect(levels[0].max).toBeLessThanOrEqual(235);
    // Fondu de 0 à 4 planches : trois captures ordonnées, niveaux et luminances strictement décroissants ; la cible est atteinte à `fondu`.
    const fade = [];
    await page.evaluate(() => window.__zs.setPlanks('F8', 4));
    for (const t of [0.1, 0.15, 0.15]) {
      await page.evaluate((t) => window.__zs.step(t), t);
      fade.push(await moonAt(page, 'F8'));
    }
    for (let i = 1; i < fade.length; i += 1) {
      expect(fade[i].niveau).toBeLessThan(fade[i - 1].niveau);
      expect(fade[i].patch).toBeLessThan(fade[i - 1].patch);
    }
    expect(fade[0].niveau).toBeLessThan(1);
    expect(fade.at(-1).niveau).toBeGreaterThan(LUNE.minimum);
    await page.evaluate(() => window.__zs.step(1));
    expect((await moonAt(page, 'F8')).niveau).toBeCloseTo(LUNE.minimum, 4);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    expect(errors).toEqual([]);
    await context.close();
  });

  test('lune selon les planches (5k-C3) : fenêtres indépendantes, un étage ne touche pas l\'autre, zones fermées au minimum ; pause : rien ne change ; la lune de l\'étage affiché seulement', async ({ page }) => {
    const errors = watch(page);
    await open(page, '&nospawn=1&wave=31&gfx=eleve&lum=eclairage');
    const r = await page.evaluate(() => {
      const zs = window.__zs;
      const lune = () => Object.fromEntries(zs.getState().graphics.lune.map((m) => [m.fenetre, m.niveau]));
      const drawn = () => zs.getState().graphics.world.lamps.lights.moonDrawn;
      zs.step(0.05);
      const out = { rdc0: lune(), drawnRdc: drawn(), planks0: zs.getState().windows.map((w) => [w.id, w.planks]) };
      zs.setPlanks('F6', 1);
      zs.step(1);
      out.rdc1 = lune();
      zs.setFloor(1);
      zs.step(0.05);
      out.etage0 = lune();
      out.drawnEtage = drawn();
      zs.setPlanks('U1', 0);
      zs.step(1);
      out.etage1 = lune();
      zs.setFloor(0);
      zs.step(0.05);
      out.rdc2 = lune();
      return out;
    });
    const min = LUNE.minimum;
    const startLevel = Object.fromEntries(r.planks0.filter(([id]) => id.startsWith('F')).map(([id, n]) => [id, Math.round((min + (1 - min) * (1 - n / 4)) * 10000) / 10000]));
    expect(r.rdc0).toEqual(startLevel);
    expect(Object.keys(r.etage0).sort()).toEqual(['U1', 'U2', 'U3', 'U4', 'U5', 'U6', 'U7']);
    expect(r.rdc1.F6).toBeCloseTo(min + (1 - min) * 0.75, 4); // une planche sur quatre
    for (const id of Object.keys(r.rdc0)) if (id !== 'F6') expect(r.rdc1[id], id).toBe(r.rdc0[id]); // F6 seule a changé
    expect(r.etage1.U1).toBe(1);
    for (const id of Object.keys(r.etage0)) if (id !== 'U1') expect(r.etage1[id], id).toBe(r.etage0[id]);
    expect(r.rdc2).toEqual(r.rdc1); // l'étage n'a rien changé au rez-de-chaussée
    expect(r.drawnRdc).toEqual(['rdc']);
    expect(r.drawnEtage).toEqual(['etage']);
    // Zones fermées (manche 10 : l'aile) : fenêtres à toutes leurs planches dans le jeu, donc au niveau minimum.
    await open(page, '&nospawn=1&wave=10&gfx=eleve&lum=eclairage');
    const closed = await page.evaluate(() => {
      const zs = window.__zs;
      zs.step(0.05);
      const s = zs.getState();
      return s.windows.filter((w) => w.floor === 'rdc' && !w.active).map((w) => [w.id, w.planks, w.maxPlanks, s.graphics.lune.find((m) => m.fenetre === w.id).niveau]);
    });
    expect(closed.length).toBeGreaterThan(0);
    for (const [id, n, max, lv] of closed) {
      expect(n, id).toBe(max);
      expect(lv, id).toBeCloseTo(min, 4);
    }
    // Pause (dt nul) : une planche arrachée pendant la pause ne change rien tant que le temps de jeu n'avance pas.
    await page.locator('#btn-pause').click();
    const paused = await page.evaluate(() => {
      const zs = window.__zs;
      const before = zs.getState().graphics.lune.find((m) => m.fenetre === 'F8').niveau;
      zs.setPlanks('F8', 0);
      zs.sampleScreen(0, 0, 4, 4);
      zs.sampleScreen(0, 0, 4, 4);
      return { before, after: zs.getState().graphics.lune.find((m) => m.fenetre === 'F8').niveau, paused: zs.getState().paused };
    });
    expect(paused.paused).toBe(true);
    expect(paused.after).toBe(paused.before);
    expect(errors).toEqual([]);
  });

  // Pleine lumière (0 planche) : au plus la moitié de la lumière d'une lampe, en lumière linéaire : apport de la tache sur le sol voisin contre
  // apport de la lampe au point de sol le plus éclairé de la vue (le même point avec ?lampgain=0, mesure de test).
  test('lune selon les planches (5k-C3) : pleine lumière au plus la moitié de celle d\'une lampe (lumière linéaire), tache visible', async ({ browser }) => {
    test.setTimeout(120_000);
    const lin = (v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
    const runs = {};
    for (const gain of ['1', '0']) {
      const context = await browser.newContext({ viewport: SIZE, reducedMotion: 'reduce' });
      const page = await context.newPage();
      await open(page, `&nospawn=1&wave=10&gfx=eleve&lum=eclairage&lampgain=${gain}`);
      await nearPatch(page, 'F8');
      await page.evaluate(() => { window.__zs.setPlanks('F8', 0); window.__zs.step(1); });
      const moon = await moonAt(page, 'F8');
      // Quart droit de la vue (une seule image) : moyennes de blocs de 8 × 8 pixels du canevas.
      const [x0, y0, w, h] = [Math.round(SIZE.width * 0.55), Math.round(SIZE.height * 0.15), Math.round(SIZE.width * 0.4), Math.round(SIZE.height * 0.6)];
      const lum = await pixels(page, x0, y0, w, h);
      const cols = Math.round(Math.sqrt((lum.length * w) / h)); // largeur lue en pixels du canevas (w × rapport de pixels)
      const rows = Math.floor(lum.length / cols);
      const grid = [];
      for (let by = 0; by + 8 <= rows; by += 8) {
        for (let bx = 0; bx + 8 <= cols; bx += 8) {
          let sum = 0;
          for (let j = 0; j < 8; j += 1) for (let i = 0; i < 8; i += 1) sum += lum[(by + j) * cols + bx + i];
          grid.push([bx, by, sum / 64 / 255]);
        }
      }
      runs[gain] = { moon, grid };
      await context.close();
    }
    const best = runs['1'].grid.reduce((m, q) => (q[2] > m[2] ? q : m));
    const dark = runs['0'].grid.find((q) => q[0] === best[0] && q[1] === best[1]);
    const lamp = lin(best[2]) - lin(dark[2]);
    const moon = lin(runs['0'].moon.patch) - lin(runs['0'].moon.voisin);
    expect(lamp).toBeGreaterThan(0.05); // une lampe éclaire bien la vue
    expect(moon).toBeGreaterThan(0); // tache visible
    expect(moon).toBeLessThanOrEqual(lamp * 0.5);
  });

  test('lune selon les planches (5k-C3) : « off » et « decor » n\'exposent aucun niveau ; « eclairage » ne crée aucun programme de plus quand les planches changent', async ({ page }) => {
    for (const lum of ['off', 'decor']) {
      await open(page, `&nospawn=1&wave=10&lum=${lum}`);
      const s = await page.evaluate(() => { window.__zs.step(0.05); window.__zs.setPlanks('F8', 0); window.__zs.step(1); return window.__zs.getState(); });
      expect(s.graphics.lune, lum).toEqual([]);
      expect(s.moonPatches, lum).toEqual([]);
    }
    await open(page, '&nospawn=1&wave=10&gfx=eleve&lum=eclairage&perf=1');
    const progs = await page.evaluate(() => {
      const zs = window.__zs;
      zs.step(0.05);
      zs.sampleScreen(0, 0, 4, 4);
      const a = zs.getState().perf.renderer.programs;
      for (const n of [0, 2, 4, 1, 3]) { zs.setPlanks('F8', n); zs.step(0.2); zs.sampleScreen(0, 0, 4, 4); }
      return [a, zs.getState().perf.renderer.programs];
    });
    expect(progs[1]).toBe(progs[0]);
  });
});

