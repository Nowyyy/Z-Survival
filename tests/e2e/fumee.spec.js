import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { waitReady } from './helpers.js';

// Lot 4e — Fumée (npm run test:fumee) : 10 tests (12 avant le lot 5g), projet bureau seulement, 3 minutes au plus. Le jeu démarre en 667×375 sans erreur,
// canvas et HUD visibles, une manche simulée par step(), sauvegarde en mémoire, aucune requête hors du site ; accueil et
// sauvegarde.html se chargent sans violation d'axe ; le site construit (scripts/build.mjs, serveur de test du port 4174) répond.
const SIZE = { width: 667, height: 375 };
const NOISE = /GL Driver Message|ReadPixels|GPU stall/;
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1']);

test.skip(({ isMobile }) => isMobile, 'fumée : projet bureau seulement');

// Ouvre une page en relevant les erreurs de console et les requêtes hors du site.
async function ouvrir(page, url) {
  const erreurs = [];
  const externes = [];
  page.on('console', (m) => { if (m.type() === 'error' && !NOISE.test(m.text())) erreurs.push(m.text()); });
  page.on('pageerror', (e) => erreurs.push(String(e)));
  page.on('request', (r) => { const u = new URL(r.url()); if (/^https?:$/.test(u.protocol) && !LOCAL_HOSTS.has(u.hostname)) externes.push(r.url()); });
  await page.setViewportSize(SIZE);
  await page.goto(url);
  return { erreurs, externes };
}
const etat = (page) => page.evaluate(() => window.__zs.getState());

test.describe('fumée : le jeu', () => {
  test('jeu.html démarre en 667×375 : canvas plein écran, aucune erreur de console, aucune requête externe', async ({ page }) => {
    const o = await ouvrir(page, '/jeu.html?test=1&seed=1');
    await waitReady(page);
    const box = await page.locator('canvas').first().boundingBox();
    expect(box.width).toBeGreaterThanOrEqual(SIZE.width - 1);
    expect(box.height).toBeGreaterThanOrEqual(SIZE.height - 1);
    await page.evaluate(() => window.__zs.step(1));
    expect(o.erreurs).toEqual([]);
    expect(o.externes).toEqual([]);
  });

  test('le HUD est affiché : vie, manche, tués, bouton Pause', async ({ page }) => {
    await ouvrir(page, '/jeu.html?test=1&seed=1');
    await waitReady(page);
    for (const sel of ['#hud-bar', '#hud-wave', '#hud-kills']) await expect(page.locator(sel)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Pause' })).toBeVisible();
  });

  test('une manche simulée par step() : la manche suivante commence, l\'état reste cohérent', async ({ page }) => {
    await ouvrir(page, '/jeu.html?test=1&seed=1');
    await waitReady(page);
    const avant = (await etat(page)).waves.wave;
    await page.evaluate(() => window.__zs.step(3));
    await page.evaluate(() => window.__zs.skipWave());
    for (let i = 0; i < 12 && (await etat(page)).waves.wave === avant; i++) await page.evaluate(() => window.__zs.step(1));
    const s = await etat(page);
    expect(s.waves.wave).toBe(avant + 1);
    expect(s.player.health).toBeGreaterThan(0);
  });

  test('sauvegarde en mémoire (?test=1) : flushSave écrit sans toucher au vrai stockage', async ({ page }) => {
    await ouvrir(page, '/jeu.html?test=1&seed=1');
    await waitReady(page);
    await page.evaluate(() => window.__zs.step(1));
    await page.evaluate(() => window.__zs.flushSave());
    const s = await etat(page);
    expect(s.save.mode ?? s.save).toBeTruthy();
    expect(await page.evaluate(() => Object.keys(localStorage).length)).toBe(0);
  });

  test('pause et reprise au clavier (Échap) sans erreur', async ({ page }) => {
    const o = await ouvrir(page, '/jeu.html?test=1&seed=1');
    await waitReady(page);
    await page.keyboard.press('Escape');
    await expect(page.locator('#pause-panel')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('#pause-panel')).toBeHidden();
    expect(o.erreurs).toEqual([]);
  });

  test('axe : jeu.html sans violation', async ({ page }) => {
    await ouvrir(page, '/jeu.html?test=1&seed=1');
    await waitReady(page);
    const r = await new AxeBuilder({ page }).analyze();
    expect(r.violations.map((v) => v.id)).toEqual([]);
  });
});

test.describe('fumée : les pages publiées', () => {
  // Lot 5g : /dev/ (journal des versions) supprimé ; les pages du site assemblé (racine, Recette/, dev/, redirections) sont dans publication.spec.js.
  for (const [nom, url] of [['index.html', '/index.html'], ['sauvegarde.html', '/sauvegarde.html?test=1']]) {
    test(`${nom} se charge sans erreur ni requête externe`, async ({ page }) => {
      const o = await ouvrir(page, url);
      await expect(page.locator('main, body').first()).toBeVisible();
      await page.waitForLoadState('networkidle');
      expect(o.erreurs).toEqual([]);
      expect(o.externes).toEqual([]);
    });
    test(`axe : ${nom} sans violation`, async ({ page }) => {
      await ouvrir(page, url);
      await page.waitForLoadState('networkidle');
      const r = await new AxeBuilder({ page }).analyze();
      expect(r.violations.map((v) => v.id)).toEqual([]);
    });
  }

  // Lot 5g : accueil, jeu et données sous Recette/ (avant : à la racine du site) ; la racine est la page « en construction ».
  test('le site construit répond : racine, accueil, jeu, build-info.json et site-info.json (scripts/build.mjs, site de test)', async ({ request }) => {
    for (const p of ['full/', 'full/Recette/', 'full/Recette/jeu.html', 'full/Recette/build-info.json', 'full/Recette/site-info.json', 'full/dev/jeu.html']) {
      const r = await request.get(`http://127.0.0.1:4174/${p}`);
      expect(r.status(), p).toBe(200);
    }
  });
});
