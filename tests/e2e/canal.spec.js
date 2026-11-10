// Lot 5l-B : paramètres d'adresse par canal, sur le site assemblé de test (scripts/site/e2e-site.mjs, http://127.0.0.1:4174/) : full/dev/ (canal dev),
// full/Recette/ (release), canaux/v0.5/ (archive : build courant archivé), canaux/prod/ (prod, balise réécrite comme le fera un assembleur de production) ;
// et le dépôt (http://localhost:4173, canal source). Sans ?test=1, pas de window.__zs : l'effet se lit dans ce que voit le joueur (écran Options, image
// du canvas, HUD, panneau de mesure, fichiers demandés). 667×375, rapport de pixels 2. Docs/ref/debug.md.
import { test, expect } from '@playwright/test';
import { waitReady } from './helpers.js';

const SITE = 'http://127.0.0.1:4174';
const URLS = { dev: `${SITE}/full/dev/jeu.html`, release: `${SITE}/full/Recette/jeu.html`, archive: `${SITE}/canaux/v0.5/jeu.html`, prod: `${SITE}/canaux/prod/jeu.html` };
const GL_DRIVER = /^\[\.WebGL-[0-9a-fx]+\]GL Driver Message/;
// Paramètres du groupe G (doublons d'Options) et du groupe T (outils) essayés ensemble.
const G = 'shadows=0&vhs=0&dpr=1&detail=0&perso=A';

test.use({ viewport: { width: 667, height: 375 }, deviceScaleFactor: 2 });

// Problèmes de la page (console, erreurs, requêtes en échec ou ≥ 400), requêtes externes et chemins demandés.
function watch(page, origin) {
  const problems = [];
  const external = [];
  const files = [];
  page.on('console', (m) => ['error', 'warning'].includes(m.type()) && !GL_DRIVER.test(m.text()) && problems.push(m.text()));
  page.on('pageerror', (e) => problems.push(e.message));
  page.on('requestfailed', (r) => problems.push(`échec ${r.url()}`));
  page.on('response', (r) => r.status() >= 400 && problems.push(`${r.status()} ${r.url()}`));
  page.on('request', (r) => {
    const url = r.url();
    if (url.startsWith(origin)) files.push(new URL(url).pathname);
    else if (!url.startsWith('data:') && !url.startsWith('blob:')) external.push(url);
  });
  return { problems, external, files };
}

// Jeu chargé sans hook de test : écran de préparation retiré, partie affichée, première image du HUD écrite.
async function waitGame(page) {
  await expect(page.locator('#game-root')).toBeVisible({ timeout: 60_000 });
  await expect(page.locator('#hud-chrono-text')).not.toHaveText('', { timeout: 30_000 });
}

// Ce que voit le joueur : canal de la balise, hook, rapport de pixels du canvas, HUD (manche, badge « Mode essai »), panneau de mesure,
// écran Options (marques « imposé par l'adresse », verrou de ?gfx=, valeur des ombres).
async function observe(page) {
  const base = await page.evaluate(() => {
    const canvas = document.querySelector('#game-canvas canvas');
    return {
      canal: document.querySelector('meta[name="zs-canal"]')?.getAttribute('content') ?? null,
      hook: typeof window.__zs,
      ratio: canvas ? Math.round((canvas.width / canvas.clientWidth) * 100) / 100 : null,
      waveIdle: document.getElementById('hud-wave').dataset.idle,
      waveText: document.getElementById('hud-wave-text').textContent,
      trial: !document.getElementById('hud-trial').hidden,
      perf: Boolean(document.getElementById('perf-panel')),
    };
  });
  await page.locator('#btn-pause').click();
  base.debug = await page.locator('#btn-debug').isVisible(); // lot 5l-C : icône « Débogage » de la pause
  await page.locator('#btn-options').click();
  await expect(page.locator('#options-panel')).toBeVisible();
  const options = await page.evaluate(() => ({
    imposed: [...document.querySelectorAll('.e5-note[data-etat="impose"]')].map((m) => m.id.replace('options-note-', '')), // lot 8c : note de la ligne (avant : .options-mark)
    locked: document.getElementById('options-status').textContent,
    ombres: document.querySelector('.e5-ligne[data-option="ombres"] .e5-valeur[aria-pressed="true"]')?.dataset.value ?? null,
  }));
  return { ...base, ...options };
}

for (const canal of ['dev', 'release']) {
  test(`canal ${canal} sans ?test=1 : groupe G (${G}) sans effet ; ?nospawn=1 ou ?wave=5 et ?perf=1 fonctionnent ; console propre, aucune requête externe`, async ({ page }) => {
    test.setTimeout(120_000);
    const outils = canal === 'dev' ? 'nospawn=1&perf=1' : 'wave=5&perf=1';
    const { problems, external, files } = watch(page, SITE);
    await page.goto(`${URLS[canal]}?${G}&${outils}&v=7`);
    await waitGame(page);
    const s = await observe(page);
    expect(s.canal).toBe(canal);
    expect(s.hook).toBe('undefined');
    expect(s.debug).toBe(true);
    // Groupe G sans effet : rapport de pixels du préréglage (Élevé d'Auto : 2), aucune option imposée, ombres du préréglage, détail chargé.
    expect(s.ratio).toBe(2);
    expect(s.imposed).toEqual([]);
    expect(s.ombres).toBe('hautes');
    expect(files).toEqual(expect.arrayContaining([`/full/${canal === 'dev' ? 'dev' : 'Recette'}/data/game/maps/rez-de-chaussee/mobilier.world.json`]));
    // Groupe T : outils actifs, mode essai (sauvegarde en lecture seule) déclenché par nospawn ou wave.
    expect(s.perf).toBe(true);
    expect(files.some((f) => f.endsWith('/js/game/profiler.js'))).toBe(true);
    expect(s.trial).toBe(true);
    if (canal === 'dev') expect(s.waveIdle).toBe('true');
    else expect([s.waveIdle, s.waveText.split('/')[0].trim()]).toEqual(['false', '05']);
    expect(external).toEqual([]);
    expect(problems).toEqual([]);
  });
}

test('canal dev avec ?test=1 : window.__zs, groupe G pris en compte (getState().graphics), outils aussi', async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto(`${URLS.dev}?test=1&seed=1&nospawn=1&${G}`);
  await waitReady(page);
  const g = await page.evaluate(() => window.__zs.getState().graphics);
  expect(g.overridden).toEqual(expect.arrayContaining(['ombres', 'vhs', 'dprMax', 'personnages']));
  expect([g.pixelRatio, g.shadows, g.storage.status]).toEqual([1, false, 'memoire']);
  expect(await page.evaluate(() => window.__zs.getState().waves?.active ?? null)).toBe(false);
});

for (const canal of ['archive', 'prod']) {
  test(`canal ${canal} : ?test=1 ignoré (aucun window.__zs), groupes G et T sans effet, aucun badge ni panneau de mesure, aucune icône de débogage ; console propre`, async ({ page }) => {
    test.setTimeout(120_000);
    const { problems, external, files } = watch(page, SITE);
    await page.goto(`${URLS[canal]}?test=1&seed=3&nospawn=1&wave=5&perf=1&gfx=faible&${G}&v=2`);
    await page.locator('#menu-jouer').click({ timeout: 60_000 }); // lot 8a : paramètres refusés, adresse vide pour le jeu : le menu s'ouvre
    await waitGame(page);
    const s = await observe(page);
    expect(s.canal).toBe(canal);
    expect(s.hook).toBe('undefined');
    expect(s.ratio).toBe(2);
    expect([s.imposed, s.locked, s.ombres]).toEqual([[], '', 'hautes']);
    expect([s.perf, s.trial, s.waveIdle, s.debug]).toEqual([false, false, 'false', false]);
    expect(files.some((f) => f.endsWith('/js/game/debug-menu.js'))).toBe(false);
    expect(s.waveText.split('/')[0].trim()).toBe('01');
    expect(files.some((f) => f.endsWith('/js/game/profiler.js') || f.endsWith('/js/game/frame-cap.js'))).toBe(false);
    expect(external).toEqual([]);
    expect(problems).toEqual([]);
  });
}

test('canal source (dépôt) sans ?test=1 : tout fonctionne comme avant (?shadows=0 imposé par l\'adresse, ?dpr=1, ?nospawn=1)', async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto('/jeu.html?shadows=0&dpr=1&nospawn=1');
  await waitGame(page);
  const s = await observe(page);
  expect(s.canal).toBe('source');
  expect(s.ratio).toBe(1);
  expect(s.imposed).toEqual(expect.arrayContaining(['ombres', 'resolution']));
  expect(s.ombres).toBe('aucune');
  expect([s.waveIdle, s.trial]).toEqual(['true', true]);
});
