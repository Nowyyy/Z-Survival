import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { waitReady } from './helpers.js';

// Lot 9h : atelier du décor extérieur d'époque (atelier-decor.html, page technique, avant le « GO 9h »). Le journal window.__zsDecor (?test=1) donne
// l'état, toutes les variantes (triangles, budgets), les mesures des vues et le plan de placement. Bureau ; projet mobile joué en local.
const BRUIT = /GL Driver Message|willReadFrequently|GPU stall/;

async function ouvrir(page, baseURL, suivi) {
  page.on('request', (r) => !r.url().startsWith(baseURL) && !r.url().startsWith('data:') && !r.url().startsWith('blob:') && suivi.externes.push(r.url()));
  page.on('console', (m) => ['error', 'warning'].includes(m.type()) && !BRUIT.test(m.text()) && suivi.problemes.push(m.text()));
  page.on('pageerror', (e) => suivi.problemes.push(e.message));
  page.on('response', (r) => r.status() >= 400 && suivi.problemes.push(`${r.status()} ${r.url()}`));
  await page.addInitScript(() => {
    window.__ecritures = 0;
    for (const m of ['setItem', 'removeItem', 'clear']) {
      const natif = Storage.prototype[m];
      Storage.prototype[m] = function ecrire(...args) {
        window.__ecritures += 1;
        return natif.apply(this, args);
      };
    }
  });
  await page.goto('/atelier-decor.html?test=1');
  await expect(page.locator('#app')).toBeVisible();
  await page.waitForFunction(() => window.__zsDecor?.pret === true, null, { timeout: 60000 });
}

test('atelier du décor : toutes les variantes sous budget, vues du jeu (un appel par objet), plan sans problème ni chemin coupé, aucune requête externe, aucune écriture', async ({ page, baseURL }) => {
  test.setTimeout(120_000);
  const suivi = { externes: [], problemes: [] };
  await ouvrir(page, baseURL, suivi);
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex');
  expect(await page.evaluate(() => window.__zsDecor.webgl)).toBe(true);
  const toutes = await page.evaluate(() => window.__zsDecor.toutes());
  expect(toutes.length).toBeGreaterThanOrEqual(36); // 13 objets × 2 ou 3 variantes
  for (const r of toutes) expect(r.triangles, `${r.type}/${r.variante}`).toBeLessThanOrEqual(r.budget);
  await expect(page.locator('#planche figure')).toHaveCount(toutes.length);
  await expect(page.locator('#table-budget tbody tr')).toHaveCount(toutes.length);
  // Chaque objet dans la vue du jeu : un maillage d'atlas (deux avec le sol des trous d'obus ou du cratère de l'avion).
  for (const [type, v] of [['vehicule', 'kubel'], ['avion', 'p47'], ['trouObus', 'double'], ['artillerie', 'obusier']]) {
    expect(await page.evaluate(([a, b]) => window.__zsDecor.choisir(a, b), [type, v])).toBe(true);
    const m = await page.evaluate(() => window.__zsDecor.mesures());
    expect(m.jeu.objet.appels).toBeLessThanOrEqual(2);
    expect(m.jeu.calls).toBeGreaterThan(0);
    await expect(page.locator('#variante-fiche')).toContainText('triangles');
  }
  // Plan : aucun problème, tous les chemins des zombies intacts ; tableau des objets et des chemins remplis ; carte en SVG avec objets et chemins.
  const plan = await page.evaluate(() => window.__zsDecor.plan());
  expect(plan.problemes).toEqual([]);
  expect(plan.chemins.length).toBe(14);
  for (const c of plan.chemins) {
    expect(c.coupe).toBe(false);
    expect(c.apres).toBeLessThanOrEqual(c.avant * 1.05);
  }
  await expect(page.locator('#plan-figure svg .objets-epoque rect').first()).toBeVisible();
  await expect(page.locator('#plan-figure svg .ch-apres')).toHaveCount(14);
  await expect(page.locator('#table-chemins tbody tr')).toHaveCount(14);
  await expect(page.locator('#plan-resume')).toContainText('0 coupé(s)');
  // Choix à recopier : la proposition suit les listes.
  await page.selectOption('#ctl-objet', 'avion');
  await page.selectOption('#ctl-variante', 'p40');
  expect(JSON.parse(await page.locator('#choix-json').textContent()).variantes.avion).toBe('p40');
  expect(suivi.externes).toEqual([]);
  expect(suivi.problemes).toEqual([]);
  expect(await page.evaluate(() => window.__ecritures)).toBe(0);
});

test('atelier du décor : gros plan immobile en mouvement réduit ; accessibilité (axe)', async ({ page, baseURL }) => {
  test.setTimeout(90_000);
  const suivi = { externes: [], problemes: [] };
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await ouvrir(page, baseURL, suivi);
  const a0 = await page.evaluate(() => window.__zsDecor.yaw());
  await page.waitForTimeout(400);
  expect(await page.evaluate(() => window.__zsDecor.yaw())).toBe(a0);
  await expect(page.locator('#ctl-rotation')).toBeDisabled();
  const resultat = await new AxeBuilder({ page }).analyze();
  expect(resultat.violations.map((v) => v.id)).toEqual([]);
  expect(suivi.problemes).toEqual([]);
});

test('atelier du décor : sans mouvement réduit, le gros plan tourne', async ({ page, baseURL }) => {
  const suivi = { externes: [], problemes: [] };
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await ouvrir(page, baseURL, suivi);
  const a0 = await page.evaluate(() => window.__zsDecor.yaw());
  await expect.poll(() => page.evaluate(() => window.__zsDecor.yaw()), { timeout: 5000 }).not.toBe(a0);
});

test('menu de débogage de la pause : lien « Atelier du décor extérieur » vers atelier-decor.html', async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 667, height: 375 });
  await page.goto('/jeu.html?test=1&seed=1&nospawn=1');
  await waitReady(page);
  await page.locator('#btn-pause').click();
  await page.getByRole('button', { name: 'Débogage', exact: true }).click();
  const lien = page.locator('#debug-atelier-decor');
  await expect(lien).toHaveAttribute('href', 'atelier-decor.html');
  await expect(lien).toHaveText('Ouvrir l\'atelier');
  await expect(page.locator('#debug-panel')).toContainText('Atelier du décor extérieur');
  const r = await lien.boundingBox();
  expect(Math.round(r.height)).toBeGreaterThanOrEqual(44);
});
