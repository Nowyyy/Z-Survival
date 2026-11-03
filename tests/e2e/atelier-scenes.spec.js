import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

// Lot 3h-C : scènes de 30 s et propositions de l'atelier des sons. Avec ?test=1, l'horloge d'une scène avance par
// window.__zsSons.stepScene(s) : 30 s de jeu simulé, aucune attente réelle. Taille de référence 667×375.
const SIZE = { width: 667, height: 375 };
const logOf = (page) => page.evaluate(() => window.__zsSons.log());

async function open(page) {
  await page.setViewportSize(SIZE);
  await page.goto('/atelier-sons.html?test=1');
  await expect(page.locator('body')).toHaveAttribute('data-ready', '1', { timeout: 60_000 });
  await page.getByRole('button', { name: 'Activer le son' }).click();
}
// Lance une scène, attend sa préparation, puis avance l'horloge de test seconde par seconde jusqu'à la fin.
async function runScene(page, id, seconds = 31) {
  await page.locator(`button[data-scene="${id}"]`).click();
  await expect.poll(() => page.evaluate(() => window.__zsSons.scene().ready), { timeout: 60_000 }).toBe(true);
  for (let k = 0; k < seconds; k += 1) await page.evaluate(() => window.__zsSons.stepScene(1));
  return (await logOf(page)).filter((e) => e.scene === id);
}

test('axe : aucune violation avec les propositions et les scènes (667×375)', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'bureau', 'une seule fois');
  await open(page);
  await runScene(page, 'couloir', 3);
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);
  const boxes = await Promise.all((await page.locator('#scenes button, #groupe-propositions button, #groupe-propositions .slot-fav label').all()).map((b) => b.boundingBox()));
  for (const box of boxes) expect(Math.min(box.width, box.height)).toBeGreaterThanOrEqual(43.5);
});
