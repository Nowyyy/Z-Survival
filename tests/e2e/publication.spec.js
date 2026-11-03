// Lot 4c : publication par versions, sur le site assemblé de test (scripts/site/e2e-site.mjs, http://127.0.0.1:4174/) :
// full/ = racine + next/ + archives fictives v0.2 à v0.4 + v0.1 indisponible ; bare/ = racine seule. Chaque site vit dans un sous-dossier (comme /Z-Survival/).
// Dans la suite rapide (ESSENTIAL de playwright.config.js), à 667×375 puis 1440×900.
import { test, expect, chromium } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const SITE = 'http://127.0.0.1:4174';
const FULL = `${SITE}/full/`;
const BARE = `${SITE}/bare/`;

// Problèmes d'une page : erreurs et avertissements de console, erreurs de page, requêtes en échec ou ≥ 400, requêtes externes.
function watch(page) {
  const problems = [];
  const external = [];
  page.on('console', (m) => ['error', 'warning'].includes(m.type()) && problems.push(m.text()));
  page.on('pageerror', (e) => problems.push(e.message));
  page.on('requestfailed', (r) => problems.push(`échec ${r.url()}`));
  page.on('response', (r) => r.status() >= 400 && problems.push(`${r.status()} ${r.url()}`));
  page.on('request', (r) => !r.url().startsWith(SITE) && !r.url().startsWith('data:') && !r.url().startsWith('blob:') && external.push(r.url()));
  return { problems, external };
}

for (const viewport of [{ width: 667, height: 375 }, { width: 1440, height: 900 }]) {
  test.describe(`site publié ${viewport.width}×${viewport.height}`, () => {
    test.use({ viewport });

    test('la racine (main) affiche « Recette · Version V0.5 » et « Jouer » mène à jeu.html, qui se charge', async ({ page }) => {
      await page.goto(FULL);
      await expect(page.locator('#version')).toHaveText('Recette · Version V0.5');
      await expect(page.getByRole('heading', { level: 1 })).toHaveText('Z-Survival');
      const play = page.getByRole('link', { name: 'Jouer' });
      await expect(play).toHaveAttribute('href', 'jeu.html');
      await play.click();
      await expect(page).toHaveURL(`${FULL}jeu.html`);
      // Le jeu affiche d'abord son écran de préparation (textures et sons) : jusqu'à 30 s en rendu logiciel sous charge (suite complète).
      await expect(page.locator('canvas').first()).toBeAttached({ timeout: 30_000 });
    });

    test('section « Développement » : dernier build (hash court et date) vers next/, journal vers dev/', async ({ page }) => {
      await page.goto(FULL);
      await expect(page.getByRole('heading', { name: 'Développement' })).toBeVisible();
      const next = page.getByRole('link', { name: /Dernier build de développement/ });
      await expect(next).toHaveAttribute('href', 'next/');
      await expect(next).toContainText('abcdef1 · 2 nov. 2026');
      await expect(page.getByRole('link', { name: 'Journal des versions' })).toHaveAttribute('href', 'dev/');
      await expect(page.locator('#dev-banner')).toBeHidden();
    });

    test('next/ : bandeau du build de développement, section « Développement » masquée, versions précédentes à la racine', async ({ page }) => {
      const { problems } = watch(page);
      await page.goto(`${FULL}next/`);
      await expect(page.locator('#version')).toHaveText('Développement · Version V0.5');
      await expect(page.locator('#dev-banner')).toHaveText('Build de développement — abcdef1 — 2 nov. 2026');
      await expect(page.locator('#dev-section')).toBeHidden();
      await expect(page.getByRole('link', { name: /^V0\.4/ })).toHaveAttribute('href', '../v0.4/jeu.html');
      await expect(page.getByRole('link', { name: 'Jouer' })).toHaveAttribute('href', 'jeu.html');
      await page.waitForLoadState('networkidle');
      expect(problems).toEqual([]);
    });

    test('sans build de développement : « Aucun build de développement pour l\'instant » (accueil et next/)', async ({ page }) => {
      await page.goto(BARE);
      await expect(page.locator('#next-none')).toHaveText('Aucun build de développement pour l\'instant');
      await expect(page.locator('#next-link')).toBeHidden();
      await page.goto(`${BARE}next/`);
      await expect(page.getByText('Aucun build de développement pour l\'instant')).toBeVisible();
      await expect(page.getByRole('link', { name: 'Revenir à l\'accueil' })).toHaveAttribute('href', '../');
    });

    test('versions précédentes : V0.4 à V0.2 cliquables, chaque entrée se charge sans erreur de ressource', async ({ page }) => {
      await page.goto(FULL);
      const links = page.locator('#previous-list a');
      await expect(links).toHaveCount(3);
      expect(await links.evaluateAll((els) => els.map((e) => e.getAttribute('href')))).toEqual(['v0.4/jeu.html', 'v0.3/jeu.html', 'v0.2/jeu.html']);
      for (const id of ['v0.4', 'v0.3', 'v0.2']) {
        const { problems } = watch(page);
        await page.goto(FULL);
        await page.locator(`#previous-list a[href="${id}/jeu.html"]`).click();
        await expect(page).toHaveURL(`${FULL}${id}/jeu.html`);
        await expect(page.locator('#loaded')).toHaveText('module chargé');
        expect(problems, id).toEqual([]);
      }
    });

    test('une version indisponible n\'est pas cliquable et donne sa raison', async ({ page }) => {
      await page.goto(FULL);
      const off = page.locator('#previous-list .is-off');
      await expect(off).toHaveCount(1);
      await expect(off).toContainText('V0.1 : indisponible');
      await expect(off).toContainText('Version de test indisponible');
      await expect(page.locator('#previous-list a[href*="v0.1"]')).toHaveCount(0);
      expect(await off.evaluate((el) => el.tagName)).toBe('P');
    });

    test('lots/ renvoie vers la racine ; aucun lots/lot-* n\'est servi', async ({ page, request }) => {
      await page.goto(`${FULL}lots/`);
      await expect(page.getByText('Les aperçus par lot ont été retirés.')).toBeVisible();
      await page.getByRole('link', { name: 'Revenir à l\'accueil' }).click();
      await expect(page).toHaveURL(FULL);
      for (const path of ['lots/lot-4b/', 'lots/lot-4b/jeu.html', 'lots/lot-1/', 'lots.json']) expect((await request.get(`${FULL}${path}`)).status(), path).toBe(404);
    });

    test('dev/ : journal replié par version (V0.5 → V0.1), sans identifiant de lot, avec « Ouvrir cette version »', async ({ page }) => {
      await page.goto(`${FULL}dev/`);
      await expect(page.locator('#changelog')).not.toHaveAttribute('open', '');
      await page.locator('#changelog > summary').click();
      const summaries = page.locator('.changelog-entry summary');
      await expect(summaries).toHaveCount(5);
      expect((await summaries.allTextContents()).map((t) => t.split(' · ')[0])).toEqual(['V0.5', 'V0.4', 'V0.3', 'V0.2', 'V0.1']);
      await expect(page.locator('main')).not.toContainText(/\blot-\d|\bLot \d/);
      const open = (label) => page.locator('.changelog-entry', { hasText: `${label} ·` }).getByRole('link', { name: 'Ouvrir cette version' });
      for (const s of await summaries.all()) await s.click();
      await expect(open('V0.5')).toHaveAttribute('href', '../');
      await expect(open('V0.4')).toHaveAttribute('href', '../v0.4/jeu.html');
      await expect(open('V0.1')).toHaveCount(0);
      await open('V0.3').click();
      await expect(page).toHaveURL(`${FULL}v0.3/jeu.html`);
    });

    test('axe : aucune violation (racine, next/, dev/ ouvert, lots/, bare/)', async ({ page }) => {
      for (const url of [FULL, `${FULL}next/`, `${FULL}lots/`, BARE]) {
        await page.goto(url);
        await page.waitForLoadState('networkidle');
        expect((await new AxeBuilder({ page }).analyze()).violations, url).toEqual([]);
      }
      await page.goto(`${FULL}dev/`);
      await page.locator('#changelog > summary').click();
      await page.locator('.changelog-entry summary').first().click();
      expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    });

    test('cibles tactiles d\'au moins 44 px sur l\'accueil', async ({ page }) => {
      await page.goto(FULL);
      // L'accueil s'affiche après ses données (le module attend versions.json au-delà de l'événement load) : attendre la liste complète.
      await expect(page.locator('#previous-list a')).toHaveCount(3);
      const heights = await page.locator('#app a').evaluateAll((els) => els.filter((e) => e.offsetParent).map((e) => [e.textContent.trim(), e.getBoundingClientRect().height]));
      expect(heights.length).toBeGreaterThanOrEqual(6);
      for (const [name, h] of heights) expect(h, name).toBeGreaterThanOrEqual(44);
    });

    test('aucune requête externe, aucun stockage, console propre (racine, next/, dev/, lots/, archive)', async ({ page, context }) => {
      const { problems, external } = watch(page);
      for (const url of [FULL, `${FULL}next/`, `${FULL}dev/`, `${FULL}lots/`, `${FULL}v0.2/jeu.html`, BARE]) {
        await page.goto(url);
        await page.waitForLoadState('networkidle');
        expect(await page.evaluate(() => [localStorage.length, sessionStorage.length]), url).toEqual([0, 0]);
      }
      expect(await context.cookies()).toEqual([]);
      expect(external).toEqual([]);
      expect(problems).toEqual([]);
    });

    test('CLS ≤ 0,1 et aucun débordement horizontal sur l\'accueil', async ({ page }) => {
      await page.addInitScript(() => {
        window.__cls = 0;
        new PerformanceObserver((list) => {
          for (const e of list.getEntries()) if (!e.hadRecentInput) window.__cls += e.value;
        }).observe({ type: 'layout-shift', buffered: true });
      });
      await page.goto(FULL);
      await page.waitForLoadState('networkidle');
      await expect(page.locator('#app')).toBeVisible();
      await expect.poll(() => page.evaluate(() => document.fonts.status)).toBe('loaded');
      expect(await page.evaluate(() => window.__cls)).toBeLessThanOrEqual(0.1);
      expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
    });

    test('versions.json et build-info.json sont servis (même origine) ; la racine est la version « release »', async ({ request }) => {
      const versions = await (await request.get(`${FULL}versions.json`)).json();
      expect(versions.latest).toBe('v0.5');
      expect((await (await request.get(`${FULL}build-info.json`)).json())).toMatchObject({ channel: 'release', version: 'V0.5', branch: 'main' });
      expect((await (await request.get(`${FULL}next/build-info.json`)).json())).toMatchObject({ channel: 'dev', sha: 'abcdef1' });
      expect((await (await request.get(`${FULL}v0.4/build-info.json`)).json())).toMatchObject({ channel: 'archive', version: 'V0.4' });
    });
  });
}

// Lot 4g : vraie icône (« Z ») des pages de renvoi, servie en icone.png à la racine du site et référencée en ../icone.png (lots/, next/ sans build).
test('icône des pages de renvoi : lots/ et next/ sans build → ../icone.png (200, PNG de la racine) ; aucune 404, aucune requête externe', async ({ page, request }) => {
  const { problems, external } = watch(page);
  const rootIcon = await request.get(`${BARE}icone.png`);
  expect(rootIcon.status()).toBe(200);
  expect(rootIcon.headers()['content-type']).toBe('image/png');
  const png = await rootIcon.body();
  expect(png.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
  expect((await (await request.get(`${FULL}icone.png`)).body()).equals(png)).toBe(true);
  for (const url of [`${FULL}lots/`, `${BARE}lots/`, `${BARE}next/`]) {
    await page.goto(url);
    await page.waitForLoadState('networkidle');
    const href = await page.locator('link[rel="icon"]').getAttribute('href');
    expect(href, url).toBe('../icone.png');
    const icon = await request.get(new URL(href, page.url()).href);
    expect(icon.status(), url).toBe(200);
    expect((await icon.body()).equals(png), url).toBe(true);
  }
  expect(external).toEqual([]);
  expect(problems).toEqual([]);
});

test('sans JavaScript : message bilingue et liens statiques vers le jeu, next/ et dev/', async () => {
  const browser = await chromium.launch({ channel: process.env.CI ? 'chrome' : undefined, args: ['--blink-settings=scriptEnabled=false'] });
  const page = await browser.newPage({ locale: 'fr-FR', viewport: { width: 667, height: 375 } });
  await page.goto(FULL);
  await expect(page.locator('#app')).toBeHidden();
  // Le moteur de texte de Playwright ignore <noscript> : lecture directe du rendu (innerText) et des liens.
  const text = (await page.evaluate(() => document.body.innerText)).trim();
  expect(text.split('\n').map((l) => l.trim()).filter(Boolean)).toEqual(['Ce jeu a besoin de JavaScript. / This game needs JavaScript.', 'Jouer / Play', 'Dernier build de développement / Latest development build', 'Journal des versions / Version history']);
  const links = await page.evaluate(() => [...document.querySelectorAll('a')].filter((a) => a.offsetParent).map((a) => [a.textContent.trim(), a.getAttribute('href'), Math.round(a.getBoundingClientRect().height)]));
  expect(links.map(([name, href]) => [name, href])).toEqual([['Jouer / Play', 'jeu.html'], ['Dernier build de développement / Latest development build', 'next/'], ['Journal des versions / Version history', 'dev/']]);
  for (const [name, , height] of links) expect(height, name).toBeGreaterThanOrEqual(44);
  await page.goto(`${FULL}dev/`);
  await expect(page).toHaveURL(`${FULL}dev/`);
  await browser.close();
});
