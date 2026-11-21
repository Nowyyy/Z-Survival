import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

// Lot 9i : menu de 1942 (choix du propriétaire) : onglet Histoire « B » (Jeep en flammes, zombies soldats casqués, ornières, poteaux télégraphiques et
// barbelés), écran de chargement « C » (poteaux, fils, barbelés, Jeep abandonnée, sacs de sable), caisses de la Boutique de 1942 sans texte (caisse de
// munitions en bois, cantine, valise de cuir) ; « ? », rayons et animations inchangés ; aucun fichier de plus au démarrage du menu.
const REF = { width: 932, height: 430 };

test('menu de 1942 : chargement C, onglet Histoire B, caisses de la Boutique sans texte ; axe ; aucune requête externe', async ({ page, baseURL }) => {
  test.setTimeout(120_000);
  const externes = [];
  const erreurs = [];
  page.on('request', (r) => !r.url().startsWith(baseURL) && !r.url().startsWith('data:') && !r.url().startsWith('blob:') && externes.push(r.url()));
  page.on('pageerror', (e) => erreurs.push(e.message));
  await page.setViewportSize(REF);
  await page.goto('/jeu.html?test=1&menu=1&seed=1&ouverture=0');
  // Écran de chargement : silhouettes de 1942 dans le décor de nuit.
  await expect(page.locator('#e7 .e7-poteau')).toHaveCount(4, { timeout: 60_000 });
  await expect(page.locator('#e7 .e7-piquet').first()).toBeAttached();
  await expect(page.locator('#menu-jouer')).toBeVisible({ timeout: 60_000 });
  await page.waitForFunction(() => window.__zsMenu?.etat()?.menu !== null && !document.getElementById('e7'));
  // Onglet Histoire : plus de pointillés centraux ni de voiture moderne ; deux ornières, cinq poteaux, deux rangées de barbelés, zombies casqués.
  const scene = page.locator('#menu-jouer-scene');
  await expect(scene.locator('.e8-jouer-route-trait')).toHaveCount(0);
  await expect(scene.locator('.e8-jouer-orniere')).toHaveCount(2);
  await expect(scene.locator('.e8-jouer-poteau')).toHaveCount(5);
  await expect(scene.locator('.e8-jouer-barbeles')).toHaveCount(2);
  expect(await scene.locator('g[transform] > path.e8-jouer-zombie').count()).toBeGreaterThanOrEqual(12); // casque, capote, bras de chaque zombie
  // Boutique : trois caisses de 1942, aucun texte hors des « ? ».
  await page.locator('#menu-onglet-boutique').click();
  await expect(page.locator('#menu-ecran-boutique')).toBeVisible();
  const modeles = await page.locator('.e3-carte svg.e3-caisse').evaluateAll((ns) => ns.map((n) => n.dataset.epoque ?? null));
  expect(new Set(modeles)).toEqual(new Set(['munitions', 'cantine', 'valise']));
  const textes = await page.locator('.e3-carte svg.e3-caisse text').allTextContents();
  expect(textes.every((x) => x === '?')).toBe(true);
  const resultat = await new AxeBuilder({ page }).analyze();
  expect(resultat.violations.map((v) => v.id)).toEqual([]);
  expect(externes).toEqual([]);
  expect(erreurs).toEqual([]);
});
