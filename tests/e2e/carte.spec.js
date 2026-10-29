import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

// Lot 3b-A : page de contrôle carte.html (SVG de world.json et decor.json). Page technique, noindex.
const BROWSER_NOISE = /GL Driver Message/;
const SIZES = [{ width: 667, height: 375 }, { width: 1440, height: 900 }];

async function open(page, extra = '', size = SIZES[0]) {
  await page.setViewportSize(size);
  await page.goto(`/carte.html${extra}`);
  await expect(page.locator('svg.carte-svg')).toBeVisible({ timeout: 30_000 });
}

test('se charge sans erreur ni requête externe, noindex, 8 étiquettes F1 à F8, le cadre et l\'échelle', async ({ page, baseURL }) => {
  const external = [];
  const problems = [];
  page.on('request', (r) => !r.url().startsWith(baseURL) && !r.url().startsWith('data:') && external.push(r.url()));
  page.on('console', (m) => ['error', 'warning'].includes(m.type()) && !BROWSER_NOISE.test(m.text()) && problems.push(m.text()));
  page.on('pageerror', (e) => problems.push(e.message));
  page.on('response', (r) => r.status() >= 400 && problems.push(`${r.status()} ${r.url()}`));
  await open(page);
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex');
  await expect(page.locator('text.fenetre-etiquette')).toHaveText(['F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8']);
  await expect(page.locator('rect.cadre-trait')).toHaveCount(1);
  await expect(page.locator('line.echelle-trait')).toHaveCount(1);
  await expect(page.locator('rect.pilier')).toHaveCount(10);
  await expect(page.locator('#stats')).toContainText('8 fenêtres');
  await page.waitForLoadState('networkidle');
  expect(external).toEqual([]);
  expect(problems).toEqual([]);
  expect(await page.evaluate(() => [localStorage.length, sessionStorage.length, document.cookie])).toEqual([0, 0, '']);
});

test('sans JavaScript, seul le message noscript est visible', async ({ browser, baseURL }) => {
  const context = await browser.newContext({ javaScriptEnabled: false, baseURL });
  const page = await context.newPage();
  await page.goto('/carte.html');
  await expect(page.locator('.noscript')).toBeVisible();
  await expect(page.locator('#app')).toBeHidden();
  await context.close();
});

for (const size of SIZES) {
  test(`axe : aucune violation, aucune cible de moins de 44 px (${size.width}×${size.height})`, async ({ page }) => {
    await open(page, '', size);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    for (const link of await page.locator('a.carte-link').all()) {
      const box = await link.boundingBox();
      expect(box.height).toBeGreaterThanOrEqual(44);
      expect(box.width).toBeGreaterThanOrEqual(44);
    }
  });
}

test('?map=salle affiche l\'ancienne salle (3 fenêtres, 14 meubles, aucun pilier)', async ({ page }) => {
  await open(page, '?map=salle');
  await expect(page.locator('text.fenetre-etiquette')).toHaveCount(3);
  await expect(page.locator('rect.meuble')).toHaveCount(14);
  await expect(page.locator('rect.pilier')).toHaveCount(0);
  await expect(page.locator('#lien-salle')).toHaveAttribute('aria-current', 'page');
});

test('?map= inconnu retombe sur le rez-de-chaussée', async ({ page }) => {
  await open(page, '?map=nimporte');
  await expect(page.locator('text.fenetre-etiquette')).toHaveCount(8);
});

// Lot 3e-C : sélecteur d'étage (?floor=0 ou 1, deux boutons de 44 px), zones de déclenchement, arrivées et blocs de portes.
test.describe('sélecteur d\'étage', () => {
  test('par défaut et ?floor=0 : le rez-de-chaussée (F1 à F8), ses deux zones de déclenchement et leurs arrivées ; le bouton courant est marqué', async ({ page }) => {
    for (const q of ['', '?floor=0']) {
      await open(page, q);
      await expect(page.locator('text.fenetre-etiquette')).toHaveText(['F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8']);
      await expect(page.locator('rect.declencheur')).toHaveCount(2);
      await expect(page.locator('circle.arrivee')).toHaveCount(2);
      await expect(page.locator('#lien-etage-rdc')).toHaveAttribute('aria-current', 'page');
      await expect(page.locator('#lien-etage')).not.toHaveAttribute('aria-current', 'page');
    }
  });

  test('?floor=1 : l\'étage (U1 à U7, 6 piliers, 7 fenêtres), ses zones de déclenchement, ses arrivées, le bloc de la porte de l\'étage', async ({ page }) => {
    await open(page, '?floor=1');
    await expect(page.locator('text.fenetre-etiquette')).toHaveText(['U1', 'U2', 'U3', 'U4', 'U5', 'U6', 'U7']);
    await expect(page.locator('rect.pilier')).toHaveCount(6);
    await expect(page.locator('#stats')).toContainText('7 fenêtres');
    await expect(page.locator('#stats')).toContainText('Étage');
    await expect(page.locator('rect.declencheur')).toHaveCount(2);
    await expect(page.locator('circle.arrivee')).toHaveCount(2);
    await expect(page.locator('rect.bloc-porte')).toHaveCount(1);
    await expect(page.locator('circle.apparition')).toHaveCount(14);
    await expect(page.locator('#lien-etage')).toHaveAttribute('aria-current', 'page');
    await expect(page.locator('#lien-rez')).not.toHaveAttribute('aria-current', 'page');
  });

  test('le rez-de-chaussée dessine les blocs des portes 2 et 3 (escaliers fermés)', async ({ page }) => {
    await open(page, '');
    await expect(page.locator('rect.bloc-porte')).toHaveCount(2);
  });

  test('les deux boutons d\'étage ont 44 px au moins et mènent à ?floor=0 et ?floor=1 ; le lien du jeu suit l\'étage', async ({ page }) => {
    await open(page, '?floor=1');
    for (const id of ['lien-etage-rdc', 'lien-etage']) {
      const box = await page.locator(`#${id}`).boundingBox();
      expect(box.height).toBeGreaterThanOrEqual(44);
      expect(box.width).toBeGreaterThanOrEqual(44);
    }
    await expect(page.locator('#lien-etage-rdc')).toHaveAttribute('href', 'carte.html?floor=0');
    await expect(page.locator('#lien-etage')).toHaveAttribute('href', 'carte.html?floor=1');
    await expect(page.locator('#lien-jeu')).toHaveAttribute('href', 'jeu.html?wave=31&labels=1&zoom=1&floor=1');
    await page.locator('#lien-etage-rdc').click();
    await expect(page.locator('text.fenetre-etiquette')).toHaveCount(8);
  });

  for (const size of SIZES) {
    test(`axe : aucune violation sur l'étage, aucune cible de moins de 44 px (${size.width}×${size.height})`, async ({ page }) => {
      await open(page, '?floor=1', size);
      expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
      for (const link of await page.locator('a.carte-link').all()) {
        const box = await link.boundingBox();
        expect(box.height).toBeGreaterThanOrEqual(44);
        expect(box.width).toBeGreaterThanOrEqual(44);
      }
    });
  }

  test('?map=salle masque le sélecteur et ignore ?floor=1', async ({ page }) => {
    await open(page, '?map=salle&floor=1');
    await expect(page.locator('text.fenetre-etiquette')).toHaveCount(3);
    await expect(page.locator('#lien-etage')).toBeHidden();
    await expect(page.locator('#lien-etage-rdc')).toBeHidden();
    await expect(page.locator('rect.declencheur')).toHaveCount(0);
  });

  test('?floor=1 : aucune requête externe, aucune erreur, aucun stockage', async ({ page, baseURL }) => {
    const external = [];
    const problems = [];
    page.on('request', (r) => !r.url().startsWith(baseURL) && !r.url().startsWith('data:') && external.push(r.url()));
    page.on('console', (m) => ['error', 'warning'].includes(m.type()) && !BROWSER_NOISE.test(m.text()) && problems.push(m.text()));
    page.on('pageerror', (e) => problems.push(e.message));
    await open(page, '?floor=1');
    await page.waitForLoadState('networkidle');
    expect(external).toEqual([]);
    expect(problems).toEqual([]);
    expect(await page.evaluate(() => [localStorage.length, sessionStorage.length, document.cookie])).toEqual([0, 0, '']);
  });
});
