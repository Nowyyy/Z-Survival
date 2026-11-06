import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { hudBoxes } from './helpers.js';

// Lot 5b-A : outil de mesure ?perf=1 (panneau, profileur, rapport à copier) et ?cap=N. Ce qu'un joueur voit ou fait : le panneau se charge, il ne
// chevauche pas le HUD, il se lit (14 px, 44 px, axe), le rapport se copie ; par défaut rien de tout cela n'est demandé au réseau. 667 × 375, step().
const SIZE = { width: 667, height: 375 };
const PERF_FILES = ['/js/game/profiler.js', '/js/game/perf-panel.js', '/js/game/frame-cap.js', '/js/core/perf-stats.js'];

async function open(page, query) {
  await page.setViewportSize(SIZE);
  await page.goto(`/jeu.html?test=1&seed=1${query}`);
  await page.waitForFunction(() => (window.__zs?.getState()?.time ?? 0) > 0.05 || document.getElementById('game-error')?.hidden === false, null, { timeout: 90_000 });
  if (await page.locator('#game-error').isVisible()) test.skip(true, 'WebGL indisponible dans cet environnement : test désactivé');
}
const watch = (page, baseURL) => {
  const seen = { files: [], external: [], errors: [] };
  page.on('request', (r) => {
    const url = r.url();
    if (!url.startsWith(baseURL) && !url.startsWith('data:') && !url.startsWith('blob:')) seen.external.push(url);
    else if (url.startsWith(baseURL)) seen.files.push(new URL(url).pathname);
  });
  page.on('pageerror', (e) => seen.errors.push(e.message));
  page.on('console', (m) => (m.type() === 'error' || (m.type() === 'warning' && !/GL Driver|GPU stall|ReadPixels/.test(m.text()))) && seen.errors.push(m.text()));
  return seen;
};
const overlaps = (a, b) => a.l < b.r && a.r > b.l && a.t < b.b && a.b > b.t;

test.describe('outil de mesure (?perf=1)', () => {
  test.skip(({ isMobile }) => isMobile, 'bureau (la fenêtre est réglée par chaque test)');

  test('par défaut : aucun fichier de ?perf ni de ?cap demandé, getState().perf nul, aucun panneau', async ({ page, baseURL }) => {
    const seen = watch(page, baseURL);
    await open(page, '&nospawn=1');
    await page.evaluate(() => window.__zs.step(0.5));
    for (const f of PERF_FILES) expect(seen.files).not.toContain(f);
    expect(await page.evaluate(() => window.__zs.getState().perf)).toBeNull();
    await expect(page.locator('#perf-panel')).toHaveCount(0);
    expect(seen.external).toEqual([]);
  });

  test('?perf=1 : panneau replié puis déplié sans chevaucher le HUD, mesures exposées, rapport au format, 14 px, 44 px, axe, rien stocké, console propre', async ({ page, baseURL }) => {
    const seen = watch(page, baseURL);
    await open(page, '&perf=1&wave=3');
    for (const f of ['/js/game/profiler.js', '/js/game/perf-panel.js', '/js/core/perf-stats.js']) expect(seen.files).toContain(f);
    expect(seen.files).not.toContain('/js/game/frame-cap.js');
    // Quelques images réelles (la boucle du jeu tourne) puis un tir : premier usage.
    await page.waitForFunction(() => (window.__zs.getState().perf?.session.count ?? 0) >= 5, null, { timeout: 60_000 });
    const s = await page.evaluate(() => window.__zs.getState().perf);
    expect(s.session.count).toBeGreaterThanOrEqual(5);
    expect(s.window.median).toBeGreaterThan(0);
    expect(Object.keys(s.stages)).toEqual(['sim', 'poses', 'effets', 'hud', 'monde', 'rendu', 'total']);
    expect(s.renderer.calls).toBeGreaterThan(0);
    expect(s.renderer.programs).toBeGreaterThan(0);
    expect(s.canvas.width).toBeGreaterThan(0);
    expect(s.longTasks).toHaveProperty('supported');
    expect(s.params).toContain('perf=1');
    const toggle = page.locator('#perf-toggle');
    await expect(toggle).toBeVisible();
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await expect(page.locator('#perf-report')).toContainText('Z-Survival — rapport de fluidité v1');
    const report = await page.locator('#perf-report').textContent();
    expect(report.split('\n').map((l) => l.split(' : ')[0])).toEqual(['Z-Survival — rapport de fluidité v1', 'Système', 'Préréglage', '5 s', 'Session', 'Travail/image (moyenne, ms)', 'Rendu', 'Première image', 'Tâches longues', 'Premier usage (image la plus longue dans les 600 ms)', 'Mémoire JS', 'Plafond (essai)']);
    // Lisibilité : texte de 14 px au moins, cibles de 44 px, contraste 4,5:1 (axe), aucun chevauchement avec les blocs du HUD ni le bouton Pause.
    const boxes = await page.evaluate(() => [...document.querySelectorAll('#perf-panel button, #perf-report, #perf-panel p, #perf-body')].filter((e) => e.getClientRects().length).map((e) => {
      const r = e.getBoundingClientRect();
      return { tag: e.tagName, l: r.left, t: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height, fs: parseFloat(getComputedStyle(e).fontSize) };
    }));
    for (const b of boxes) {
      expect(b.fs, b.tag).toBeGreaterThanOrEqual(14);
      if (b.tag === 'BUTTON') expect(Math.min(b.w, b.h), b.tag).toBeGreaterThanOrEqual(44);
      expect(b.l).toBeGreaterThanOrEqual(0);
      expect(b.r).toBeLessThanOrEqual(SIZE.width);
      expect(b.b).toBeLessThanOrEqual(SIZE.height);
    }
    const hud = await hudBoxes(page);
    for (const [sel, h] of Object.entries(hud)) for (const b of boxes) expect(overlaps(b, h), `${b.tag} / ${sel}`).toBe(false);
    expect(await page.evaluate(() => getComputedStyle(document.getElementById('perf-panel')).filter + getComputedStyle(document.getElementById('perf-panel')).backdropFilter)).toBe('nonenone');
    const axe = await new AxeBuilder({ page }).analyze();
    expect(axe.violations.map((v) => `${v.id} : ${v.nodes.length}`)).toEqual([]);
    expect(await page.evaluate(() => [localStorage.length, sessionStorage.length, document.cookie])).toEqual([0, 0, '']);
    expect(seen.external).toEqual([]);
    expect(seen.errors).toEqual([]);
  });

  test('« Copier le rapport » : presse-papiers, sinon texte sélectionné ; « Remettre à zéro » vide les mesures', async ({ page, context, baseURL }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: baseURL });
    await open(page, '&perf=1&nospawn=1');
    await page.waitForFunction(() => (window.__zs.getState().perf?.session.count ?? 0) >= 3, null, { timeout: 60_000 });
    await page.locator('#perf-toggle').click();
    await page.locator('#perf-copy').click();
    await expect(page.locator('#perf-status')).toHaveText('Rapport copié : colle-le dans la conversation.');
    const copied = await page.evaluate(() => navigator.clipboard.readText());
    expect(copied.split('\n')[0]).toBe('Z-Survival — rapport de fluidité v1');
    expect(copied.split('\n')).toHaveLength(12);
    // Repli : le presse-papiers refuse ; le texte du rapport est sélectionné pour une copie à la main.
    await page.evaluate(() => Object.defineProperty(navigator, 'clipboard', { value: { writeText: () => Promise.reject(new Error('refusé')) }, configurable: true }));
    await page.locator('#perf-copy').click();
    await expect(page.locator('#perf-status')).toHaveText('Copie impossible ici : le texte est sélectionné, copie-le à la main.');
    expect(await page.evaluate(() => String(getSelection()).split('\n')[0])).toBe('Z-Survival — rapport de fluidité v1');
    await page.waitForFunction(() => window.__zs.getState().perf.session.count >= 8, null, { timeout: 60_000 });
    const before = await page.evaluate(() => window.__zs.getState().perf.session.count);
    await page.locator('#perf-reset').click();
    await expect(page.locator('#perf-status')).toHaveText('Mesures remises à zéro.');
    expect(await page.evaluate(() => window.__zs.getState().perf.session.count)).toBeLessThan(before);
  });

  test('?cap=60 avec ?perf=1 : plafond chargé et rapporté (expérience, jamais mémorisée) ; ?cap=50 est ignoré', async ({ page, baseURL }) => {
    const seen = watch(page, baseURL);
    await open(page, '&perf=1&cap=60&nospawn=1');
    expect(seen.files).toContain('/js/game/frame-cap.js');
    expect(await page.evaluate(() => window.__zs.getState().perf.cap)).toMatchObject({ value: 60 });
    await open(page, '&perf=1&cap=50&nospawn=1');
    expect(await page.evaluate(() => window.__zs.getState().perf.cap)).toBeNull();
    expect(await page.evaluate(() => [localStorage.length, sessionStorage.length])).toEqual([0, 0]);
  });
});
