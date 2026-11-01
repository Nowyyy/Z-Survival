import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import AxeBuilder from '@axe-core/playwright';
import { resolveAtelier } from '../../js/core/synth2.js';
import { parseChoices } from '../../js/core/atelier-choices.js';

// Lot 3h (itération 2) : vue « sons choisis » (atelier-choix.html). Chaque emplacement ne montre que le choix du propriétaire
// (data/game/sounds-atelier-choix.txt) ; sans choix : les trois propositions ; « aucun » : écarté et listé. Taille 667×375.
const data = resolveAtelier(JSON.parse(readFileSync('data/game/sounds-atelier.json', 'utf8')));
const { choices } = parseChoices(readFileSync('data/game/sounds-atelier-choix.txt', 'utf8'), data.slots);
const slotCard = (page, id) => page.locator(`.slot[data-slot="${id}"]`);

async function open(page) {
  await page.setViewportSize({ width: 667, height: 375 });
  await page.goto('/atelier-choix.html?test=1');
  await expect(page.locator('body')).toHaveAttribute('data-ready', '1', { timeout: 60_000 });
}

test('se charge sans erreur ni requête externe ; titre « Mes sons choisis » ; rien d\'enregistré', async ({ page, baseURL }) => {
  const problems = [];
  const external = [];
  page.on('request', (r) => !r.url().startsWith(baseURL) && !r.url().startsWith('data:') && !r.url().startsWith('blob:') && external.push(r.url()));
  page.on('console', (m) => ['error', 'warning'].includes(m.type()) && !/GL Driver Message/.test(m.text()) && problems.push(m.text()));
  page.on('pageerror', (e) => problems.push(e.message));
  await open(page);
  await expect(page.locator('h1')).toHaveText('Mes sons choisis');
  await expect(page.locator('a[href="atelier-sons.html"]')).toBeVisible();
  expect(external).toEqual([]);
  expect(problems).toEqual([]);
  expect(await page.evaluate(() => [localStorage.length, sessionStorage.length, document.cookie])).toEqual([0, 0, '']);
});

test('un son choisi ne montre que sa variante, réglée et cochée', async ({ page }) => {
  await open(page);
  for (const [id, c] of Object.entries(choices).filter(([, x]) => /^[A-Z]$/.test(x.variant))) {
    const card = slotCard(page, id);
    await expect(card.locator('button[data-variant]'), id).toHaveText([c.variant]);
    await expect(card.locator('input[type="radio"]:checked'), id).toHaveValue(c.variant);
    await expect(card.locator('.slot-choice'), id).toContainText(`Ton choix : ${c.variant}`);
  }
  const attaque = slotCard(page, 'voix-marcheur-attaque');
  await expect(attaque.locator('input[data-macro="hauteur"]')).toHaveValue('-6');
  await expect(attaque.locator('input[data-macro="duree"]')).toHaveValue('0.7');
});

test('le réglage choisi est celui qui joue (attaque du marcheur : C, hauteur −6, durée × 0,7)', async ({ page }) => {
  await open(page);
  await page.getByRole('button', { name: 'Activer le son' }).click();
  await slotCard(page, 'voix-marcheur-attaque').locator('button[data-variant="C"]').click();
  await expect.poll(async () => (await page.evaluate(() => window.__zsSons.log())).length, { timeout: 30_000 }).toBe(1);
  expect((await page.evaluate(() => window.__zsSons.log()))[0]).toMatchObject({ slot: 'voix-marcheur-attaque', variant: 'C', macros: { hauteur: -6, duree: 0.7 } });
});

test('« actuel » : seulement le son du jeu ; « aucun » : écarté et listé ; sans choix : trois propositions', async ({ page }) => {
  await open(page);
  for (const [id, c] of Object.entries(choices)) {
    if (c.variant === 'actuel') {
      await expect(slotCard(page, id).locator('button[data-variant]'), id).toHaveCount(0);
      await expect(slotCard(page, id).locator('button[data-action="current"]'), id).toBeEnabled();
      await expect(slotCard(page, id).locator('input[type="radio"]:checked'), id).toHaveValue('actuel');
    }
    if (c.variant === 'aucun') {
      await expect(slotCard(page, id), id).toHaveCount(0);
      await expect(page.locator('#ecartes-list'), id).toContainText(id);
    }
  }
  // Itération 3 : seule l'escalade reste à choisir.
  const todo = data.slots.filter((s) => !choices[s.id]);
  expect(todo.map((s) => s.id)).toEqual(['escalade']);
  for (const s of todo) {
    await expect(slotCard(page, s.id).locator('button[data-variant]'), s.id).toHaveCount(s.variants.length);
    await expect(slotCard(page, s.id).locator('.slot-choice'), s.id).toHaveText('À choisir : trois propositions.');
  }
});

test('« Mes choix » démarre avec les choix du propriétaire et se complète', async ({ page }) => {
  await open(page);
  const text = await page.evaluate(() => window.__zsSons.choices());
  const back = parseChoices(text, data.slots);
  expect(back.errors).toEqual([]);
  expect(back.choices).toEqual(choices);
  await slotCard(page, 'escalade').getByLabel('B', { exact: true }).check();
  expect((await page.evaluate(() => window.__zsSons.choices())).split('\n')).toContain('escalade=B(hauteur=0,matiere=0,grain=1,duree=1,ampleur=0.3)');
});

test('axe : aucune violation ; cibles d\'au moins 44 px', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'bureau', 'une seule fois');
  await open(page);
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);
  const boxes = await Promise.all((await page.locator('button, input[type="range"], .slot-fav label, .atelier-link').all()).map((b) => b.boundingBox()));
  for (const box of boxes) expect(Math.min(box.width, box.height)).toBeGreaterThanOrEqual(43.5);
});
