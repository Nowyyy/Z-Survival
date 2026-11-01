import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { readFileSync } from 'node:fs';

const LOTS = {
  lots: [
    { name: 'lot-0', sha: 'aaaaaaa', date: '2026-10-26T00:11:53+00:00' },
    { name: 'lot-0b', sha: 'bbbbbbb', date: '2026-10-27T10:00:00+00:00' },
    { name: 'lot-1', sha: 'ccccccc', date: '2026-11-02T10:00:00+00:00', entry: 'jeu.html' },
  ],
};

// Le journal du dernier lot est lu aussi (le menu de main ne connaît pas encore le lot en cours) : ici il est vide par défaut.
const withLots = async (page, body = LOTS, latestLog = { lots: [] }) => {
  await page.route('**/lots/*/data/changelog.json', (route) => route.fulfill({ json: latestLog }));
  await page.route('**/lots.json', (route) => route.fulfill({ json: body }));
};

test('affiche main et le dernier lot ; plus de menu déroulant d\'anciens lots (avant le lot 4 : un menu et un bouton « Ouvrir »)', async ({ page }) => {
  await withLots(page);
  await page.goto('/dev');
  await expect(page).toHaveURL(/\/dev\/$/);
  await expect(page.getByRole('link', { name: /Branche main/ })).toHaveAttribute('href', '../');
  const latest = page.getByRole('link', { name: /Dernier lot : Lot 1/ });
  await expect(latest).toHaveAttribute('href', '../lots/lot-1/jeu.html');
  await expect(page.locator('select, #previous, #picker')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Ouvrir' })).toHaveCount(0);
});

test('un ancien lot s\'ouvre depuis le journal (lien « Ouvrir ce lot »)', async ({ page }) => {
  await withLots(page);
  await page.route('**/lots/lot-0b/', (route) => route.fulfill({ contentType: 'text/html', body: '<title>lot-0b</title>' }));
  await page.goto('/dev/');
  await page.locator('#changelog > summary').click();
  const entry = page.locator('.changelog-entry', { hasText: 'Lot 0b ·' });
  await entry.locator('summary').click();
  await entry.getByRole('link', { name: 'Ouvrir ce lot' }).click();
  await expect(page).toHaveURL(/\/lots\/lot-0b\/$/);
});

test('lots.json sans champ entry (ancien script) : la page d\'aperçu vient de apercu.txt', async ({ page }) => {
  await withLots(page, { lots: [{ name: 'lot-0' }, { name: 'lot-1' }] });
  await page.route('**/lots/lot-1/apercu.txt', (route) => route.fulfill({ contentType: 'text/plain', body: 'jeu.html\ntype: hifi\n' }));
  await page.goto('/dev/');
  await expect(page.getByRole('link', { name: /Dernier lot : Lot 1/ })).toHaveAttribute('href', '../lots/lot-1/jeu.html');
});

test('depuis la copie du menu dans un aperçu, les liens remontent à la racine du site', async ({ page }) => {
  // Simule l'aperçu publié : /lots/lot-1/... sert les fichiers du dépôt (comme le build du lot).
  await page.route('**/lots/lot-1/**', (route) => {
    const path = new URL(route.request().url()).pathname.replace('/lots/lot-1/', '');
    const file = path === '' || path.endsWith('/') ? `${path}index.html` : path;
    const type = file.endsWith('.js') ? 'text/javascript' : file.endsWith('.json') ? 'application/json' : file.endsWith('.css') ? 'text/css' : file.endsWith('.html') ? 'text/html' : 'application/octet-stream';
    return route.fulfill({ contentType: type, body: readFileSync(file) });
  });
  await page.route('**/lots.json', (route) => route.fulfill({ json: { lots: [{ name: 'lot-0' }, { name: 'lot-1' }] } }));
  await page.route('**/lots/lot-1/apercu.txt', (route) => route.fulfill({ contentType: 'text/plain', body: 'jeu.html' }));
  await page.goto('/lots/lot-1/dev/');
  await expect(page.getByRole('link', { name: /Dernier lot : Lot 1/ })).toHaveAttribute('href', '../../../lots/lot-1/jeu.html');
  await expect(page.getByRole('link', { name: /Branche main/ })).toHaveAttribute('href', '../../../');
});

test('le lien main ramène à la page d\'attente', async ({ page }) => {
  await withLots(page);
  await page.goto('/dev/');
  await page.getByRole('link', { name: /Branche main/ }).click();
  await expect(page).toHaveURL(/localhost:4173\/$/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Z-Survival');
});

test('un seul lot : le dernier lot est proposé, sans menu d\'anciens lots', async ({ page }) => {
  await withLots(page, { lots: [LOTS.lots[0]] });
  await page.goto('/dev/');
  await expect(page.getByRole('link', { name: /Dernier lot : Lot 0/ })).toBeVisible();
  await expect(page.locator('#previous')).toHaveCount(0);
});

test('liste indisponible : message clair et lien main toujours là', async ({ page }) => {
  await page.route('**/lots.json', (route) => route.fulfill({ status: 404, body: 'no' }));
  await page.goto('/dev/');
  await expect(page.getByText('La liste des lots est indisponible.')).toBeVisible();
  await expect(page.getByRole('link', { name: /Branche main/ })).toBeVisible();
  await expect(page.locator('#previous')).toHaveCount(0);
});

test('le menu est en français, sans bouton de langue, même avec un navigateur en anglais', async ({ browser, baseURL }) => {
  const context = await browser.newContext({ locale: 'en-US' });
  const page = await context.newPage();
  await withLots(page);
  await page.goto(`${baseURL}/dev/`);
  await expect(page.locator('html')).toHaveAttribute('lang', 'fr');
  await expect(page.getByRole('link', { name: /Branche main/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /English|Switch/ })).toHaveCount(0);
  await expect(page.locator('[data-lang-toggle]')).toHaveCount(0);
  const raw = await page.getByRole('main').innerText();
  expect(raw).not.toMatch(/\bdev\.[a-z]+/);
  await context.close();
});

test('aucune requête externe et console propre', async ({ page, baseURL }) => {
  const external = [];
  const problems = [];
  await withLots(page);
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
    await withLots(page);
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/dev/');
    await expect(page.locator('#app')).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });
}

test('axe : aucune violation', async ({ page }) => {
  await withLots(page);
  await page.goto('/dev/');
  await expect(page.locator('#app')).toBeVisible();
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);
});

test('cibles tactiles d\'au moins 44 px', async ({ page }) => {
  await withLots(page);
  await page.goto('/dev/');
  for (const locator of [page.getByRole('link', { name: /Branche main/ }), page.locator('#changelog > summary')]) {
    const box = await locator.boundingBox();
    expect(box.height).toBeGreaterThanOrEqual(44);
  }
});

test.describe('journal des versions', () => {
  test('liste les lots du plus récent au plus ancien, repliés, avec leurs points une fois ouverts', async ({ page }) => {
    await withLots(page);
    await page.goto('/dev/');
    await expect(page.getByRole('heading', { name: 'Journal des versions' })).toBeVisible();
    await page.locator('#changelog > summary').click();
    const summaries = page.locator('.changelog-entry summary');
    expect(await summaries.count()).toBeGreaterThanOrEqual(9);
    await expect(summaries.first()).toContainText('Lot 3k');
    await expect(summaries.last()).toContainText('Lot 0');
    const first = page.locator('.changelog-entry').first();
    await expect(first.locator('.changelog-points')).toBeHidden();
    await summaries.first().click();
    await expect(first.locator('.changelog-points li').first()).toBeVisible();
    await expect(first).toContainText('interface');
  });

  test('le journal est replié par défaut (page courte), s\'ouvre au toucher et défile quand il est long', async ({ page }) => {
    await withLots(page);
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

  test('les lots publiés ont leur date et un lien pour les ouvrir ; les autres n\'en ont pas', async ({ page }) => {
    await withLots(page);
    await page.goto('/dev/');
    await page.locator('#changelog > summary').click();
    const lot1 = page.locator('.changelog-entry', { hasText: 'Lot 1 · Cœur du jeu' });
    await expect(lot1.locator('.changelog-date')).not.toHaveText('');
    await lot1.locator('summary').click();
    await expect(lot1.getByRole('link', { name: 'Ouvrir ce lot' })).toHaveAttribute('href', '../lots/lot-1/jeu.html');
    const unpublished = page.locator('.changelog-entry', { hasText: 'Lot 4 ·' });
    await unpublished.locator('summary').click();
    await expect(unpublished.getByRole('link', { name: 'Ouvrir ce lot' })).toHaveCount(0);
  });

  test('sans lots.json le journal s\'affiche quand même', async ({ page }) => {
    await page.route('**/lots.json', (route) => route.fulfill({ status: 404, body: 'no' }));
    await page.goto('/dev/');
    await page.locator('#changelog > summary').click();
    await expect(page.locator('.changelog-entry').first()).toBeVisible();
  });

  test('journal indisponible : la section est masquée, le menu reste', async ({ page }) => {
    await withLots(page);
    await page.route('**/data/changelog.json', (route) => route.fulfill({ status: 404, body: 'no' }));
    await page.goto('/dev/');
    await expect(page.locator('#changelog')).toBeHidden();
    await expect(page.getByRole('link', { name: /Branche main/ })).toBeVisible();
  });

  test('axe : aucune violation avec le journal ouvert', async ({ page }) => {
    await withLots(page);
    await page.goto('/dev/');
    await page.locator('#changelog > summary').click();
    await page.locator('.changelog-entry summary').first().click();
    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations).toEqual([]);
  });

  test('aucune cible tactile de moins de 44 px dans le journal', async ({ page }) => {
    await withLots(page);
    await page.goto('/dev/');
    await page.locator('#changelog > summary').click();
    for (const box of await page.locator('.changelog-entry summary').evaluateAll((els) => els.map((e) => e.getBoundingClientRect().height))) expect(box).toBeGreaterThanOrEqual(44);
  });
});

test('le journal affiche le lot en cours lu dans le dernier lot publié, même absent du journal de main', async ({ page }) => {
  const own = JSON.parse(readFileSync('data/changelog.json', 'utf8')).lots;
  const log = { lots: [...own, { name: 'lot-9', titre: 'Lot en cours', points: ['Nouveauté du lot en cours.'] }] };
  await withLots(page, LOTS, log);
  await page.goto('/dev/');
  await expect(page.locator('.changelog-entry summary').first()).toContainText('Lot 9 · Lot en cours');
});
