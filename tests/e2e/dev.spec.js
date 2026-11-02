import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { readFileSync } from 'node:fs';

// Lot 4c : les aperçus par lot (lots.json, /lots/lot-N/) sont retirés ; les liens du journal viennent de versions.json (racine du site).
// Avant le lot 4c : lots.json (dernier lot, nom affiché, entry, copie du menu dans un aperçu), lien « Ouvrir ce lot ».
const VERSIONS = JSON.parse(readFileSync('versions.json', 'utf8'));

const withVersions = async (page, body = VERSIONS) => {
  await page.route('**/versions.json', (route) => (body ? route.fulfill({ json: body }) : route.fulfill({ status: 404, body: 'no' })));
};

test('le lien « Accueil (version actuelle) » ramène à la racine ; plus de lien « Dernier lot » ni de menu d\'anciens lots', async ({ page }) => {
  await withVersions(page);
  await page.goto('/dev');
  await expect(page).toHaveURL(/\/dev\/$/);
  await expect(page.getByRole('link', { name: /Accueil \(version actuelle\)/ })).toHaveAttribute('href', '../');
  await expect(page.locator('#latest, select, #previous, #picker')).toHaveCount(0);
  await expect(page.getByRole('link', { name: /Dernier lot/ })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Ouvrir' })).toHaveCount(0);
});

test('une version s\'ouvre depuis le journal (lien « Ouvrir cette version » vers son dossier et sa page d\'entrée)', async ({ page }) => {
  await withVersions(page);
  await page.route('**/v0.1/jeu.html', (route) => route.fulfill({ contentType: 'text/html', body: '<title>v0.1</title>' }));
  await page.goto('/dev/');
  await page.locator('#changelog > summary').click();
  await expect(page.locator('.changelog-entry', { hasText: 'Lot 0b ·' })).toHaveCount(0);
  const entry = page.locator('.changelog-entry', { hasText: 'V0.1 ·' });
  await entry.locator('summary').click();
  await entry.getByRole('link', { name: 'Ouvrir cette version' }).click();
  await expect(page).toHaveURL(/\/v0\.1\/jeu\.html$/);
});

test('depuis le journal du build de développement (next/dev/), les liens remontent à la racine du site', async ({ page }) => {
  // Simule next/ : il sert les fichiers du dépôt, avec un build-info.json « dev ».
  await page.route('**/next/**', (route) => {
    const path = new URL(route.request().url()).pathname.replace('/next/', '');
    if (path === 'build-info.json') return route.fulfill({ json: { channel: 'dev', version: 'V0.5', branch: 'dev', sha: 'abcdef1', date: '2026-11-02T12:00:00Z' } });
    const file = path === '' || path.endsWith('/') ? `${path}index.html` : path;
    const type = file.endsWith('.js') ? 'text/javascript' : file.endsWith('.json') ? 'application/json' : file.endsWith('.css') ? 'text/css' : file.endsWith('.html') ? 'text/html' : 'application/octet-stream';
    return route.fulfill({ contentType: type, body: readFileSync(file) });
  });
  await page.goto('/next/dev/');
  await expect(page.getByRole('link', { name: /Accueil \(version actuelle\)/ })).toHaveAttribute('href', '../../');
  await page.locator('#changelog > summary').click();
  const entry = page.locator('.changelog-entry', { hasText: 'V0.4 ·' });
  await entry.locator('summary').click();
  await expect(entry.getByRole('link', { name: 'Ouvrir cette version' })).toHaveAttribute('href', '../../v0.4/jeu.html');
});

test('le lien Accueil ramène à l\'accueil', async ({ page }) => {
  await withVersions(page);
  await page.goto('/dev/');
  await page.getByRole('link', { name: /Accueil \(version actuelle\)/ }).click();
  await expect(page).toHaveURL(/localhost:4173\/$/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Z-Survival');
});

test('versions.json indisponible : le journal reste, sans lien « Ouvrir cette version » ; le lien Accueil est toujours là', async ({ page }) => {
  await withVersions(page, null);
  await page.goto('/dev/');
  await expect(page.getByRole('link', { name: /Accueil \(version actuelle\)/ })).toBeVisible();
  await page.locator('#changelog > summary').click();
  await page.locator('.changelog-entry summary').first().click();
  await expect(page.getByRole('link', { name: 'Ouvrir cette version' })).toHaveCount(0);
});

test('le menu est en français, sans bouton de langue, même avec un navigateur en anglais', async ({ browser, baseURL }) => {
  const context = await browser.newContext({ locale: 'en-US' });
  const page = await context.newPage();
  await withVersions(page);
  await page.goto(`${baseURL}/dev/`);
  await expect(page.locator('html')).toHaveAttribute('lang', 'fr');
  await expect(page.getByRole('link', { name: /Accueil \(version actuelle\)/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /English|Switch/ })).toHaveCount(0);
  await expect(page.locator('[data-lang-toggle]')).toHaveCount(0);
  const raw = await page.getByRole('main').innerText();
  expect(raw).not.toMatch(/\bdev\.[a-z]+/);
  await context.close();
});

test('aucune requête externe et console propre', async ({ page, baseURL }) => {
  const external = [];
  const problems = [];
  await withVersions(page);
  page.on('request', (r) => {
    if (!r.url().startsWith(baseURL) && !r.url().startsWith('data:')) external.push(r.url());
  });
  page.on('console', (m) => ['error', 'warning'].includes(m.type()) && problems.push(m.text()));
  page.on('pageerror', (e) => problems.push(e.message));
  await page.goto('/dev/');
  await page.waitForLoadState('networkidle');
  expect(external).toEqual([]);
  expect(problems).toEqual([]);
});

for (const width of [375, 768, 1440]) {
  test(`pas de débordement horizontal à ${width} px`, async ({ page }) => {
    await withVersions(page);
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/dev/');
    await expect(page.locator('#app')).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });
}

test('axe : aucune violation', async ({ page }) => {
  await withVersions(page);
  await page.goto('/dev/');
  await expect(page.locator('#app')).toBeVisible();
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);
});

test('cibles tactiles d\'au moins 44 px', async ({ page }) => {
  await withVersions(page);
  await page.goto('/dev/');
  for (const locator of [page.getByRole('link', { name: /Accueil \(version actuelle\)/ }), page.locator('#changelog > summary')]) {
    const box = await locator.boundingBox();
    expect(box.height).toBeGreaterThanOrEqual(44);
  }
});

test.describe('journal des versions', () => {
  // Lot 4b (demande du propriétaire) : seules les versions majeures de la liste « versions » du journal, de la plus récente (V0.5, en cours, en haut) à V0.1.
  test('liste les versions majeures de V0.5 (en haut) à V0.1, repliées, avec leurs points une fois ouvertes ; aucun autre lot', async ({ page }) => {
    await withVersions(page);
    await page.goto('/dev/');
    await expect(page.getByRole('heading', { name: 'Journal des versions' })).toBeVisible();
    await page.locator('#changelog > summary').click();
    const summaries = page.locator('.changelog-entry summary');
    await expect(summaries).toHaveCount(5);
    const texts = await summaries.allTextContents();
    expect(texts.map((x) => x.split(' · ')[0])).toEqual(['V0.5', 'V0.4', 'V0.3', 'V0.2', 'V0.1']);
    expect(texts[0]).toContain('Intégration des refontes (en cours)');
    expect(texts[4]).toContain('Cœur du jeu');
    for (const x of texts) expect(x).not.toMatch(/^Lot /);
    const first = page.locator('.changelog-entry').first();
    await expect(first.locator('.changelog-points')).toBeHidden();
    await summaries.first().click();
    await expect(first.locator('.changelog-points li').first()).toBeVisible();
    await expect(first).toContainText('Atelier de la carte');
  });

  test('le journal est replié par défaut (page courte), s\'ouvre au toucher et défile quand il est long', async ({ page }) => {
    await withVersions(page);
    await page.goto('/dev/');
    const section = page.locator('#changelog');
    await expect(section).not.toHaveAttribute('open', '');
    await expect(page.locator('.changelog-entry').first()).toBeHidden();
    const closedHeight = await page.evaluate(() => document.documentElement.scrollHeight);
    await section.locator('> summary').click();
    await expect(section).toHaveAttribute('open', '');
    await expect(page.locator('.changelog-entry').first()).toBeVisible();
    const list = page.locator('#changelog-list');
    expect(await list.evaluate((el) => getComputedStyle(el).overflowY)).toBe('auto');
    expect(await list.evaluate((el) => el.getBoundingClientRect().height <= innerHeight * 0.61)).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBeGreaterThan(closedHeight - 1);
    // Ouvert, le journal n'agrandit pas la page au-delà de l'écran : la liste défile à l'intérieur.
    expect(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight + 1)).toBe(true);
    await section.locator('> summary').click();
    await expect(section).not.toHaveAttribute('open', '');
  });

  // Lot 4c : date et lien viennent de versions.json ; actuelle → racine, archive → v0.N/<entrée>, indisponible → aucun lien (avant : lots.json, « Ouvrir ce lot »).
  test('les versions publiées ont leur date et un lien pour les ouvrir ; une version indisponible n\'en a pas', async ({ page }) => {
    const versions = structuredClone(VERSIONS);
    versions.versions[1].status = 'indisponible';
    versions.versions[1].note = 'Essai.';
    await withVersions(page, versions);
    await page.goto('/dev/');
    await page.locator('#changelog > summary').click();
    const v1 = page.locator('.changelog-entry', { hasText: 'V0.1 · Cœur du jeu' });
    await expect(v1.locator('.changelog-date')).toHaveText('26 oct. 2026');
    await v1.locator('summary').click();
    await expect(v1.getByRole('link', { name: 'Ouvrir cette version' })).toHaveAttribute('href', '../v0.1/jeu.html');
    const current = page.locator('.changelog-entry', { hasText: 'V0.5 ·' });
    await current.locator('summary').click();
    await expect(current.getByRole('link', { name: 'Ouvrir cette version' })).toHaveAttribute('href', '../');
    const off = page.locator('.changelog-entry', { hasText: 'V0.2 ·' });
    await off.locator('summary').click();
    await expect(off.getByRole('link', { name: 'Ouvrir cette version' })).toHaveCount(0);
    await expect(page.locator('#changelog')).not.toContainText(/\blot-\d/);
  });

  test('sans versions.json le journal s\'affiche quand même', async ({ page }) => {
    await withVersions(page, null);
    await page.goto('/dev/');
    await page.locator('#changelog > summary').click();
    await expect(page.locator('.changelog-entry').first()).toBeVisible();
  });

  test('journal indisponible : la section est masquée, le menu reste', async ({ page }) => {
    await withVersions(page);
    await page.route('**/data/changelog.json', (route) => route.fulfill({ status: 404, body: 'no' }));
    await page.goto('/dev/');
    await expect(page.locator('#changelog')).toBeHidden();
    await expect(page.getByRole('link', { name: /Accueil \(version actuelle\)/ })).toBeVisible();
  });

  test('axe : aucune violation avec le journal ouvert', async ({ page }) => {
    await withVersions(page);
    await page.goto('/dev/');
    await page.locator('#changelog > summary').click();
    await page.locator('.changelog-entry summary').first().click();
    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations).toEqual([]);
  });

  test('aucune cible tactile de moins de 44 px dans le journal', async ({ page }) => {
    await withVersions(page);
    await page.goto('/dev/');
    await page.locator('#changelog > summary').click();
    for (const box of await page.locator('.changelog-entry summary').evaluateAll((els) => els.map((e) => e.getBoundingClientRect().height))) expect(box).toBeGreaterThanOrEqual(44);
  });
});
