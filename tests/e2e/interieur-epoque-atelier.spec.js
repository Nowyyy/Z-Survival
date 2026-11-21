import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { waitReady } from './helpers.js';

// Lot 9i : atelier de l'intérieur et du menu de 1942 (atelier-interieur.html, page technique, avant le « GO 9i »). Le journal window.__zsInterieur
// (?test=1) donne l'état, les variantes, les mesures, le plan des deux étages et les ouvertures dessinées. Bureau ; projet mobile joué en local.
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
  await page.goto('/atelier-interieur.html?test=1');
  await expect(page.locator('#app')).toBeVisible();
  await page.waitForFunction(() => window.__zsInterieur?.pret === true, null, { timeout: 60000 });
}

test('atelier de l\'intérieur : variantes sous budget, plan des deux étages sans problème, lampe coudée, ouvertures d\'époque libérées, dessins du menu, aucune requête externe, aucune écriture', async ({ page, baseURL }) => {
  test.setTimeout(180_000);
  const suivi = { externes: [], problemes: [] };
  await ouvrir(page, baseURL, suivi);
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex');
  expect(await page.evaluate(() => window.__zsInterieur.webgl)).toBe(true);
  const toutes = await page.evaluate(() => window.__zsInterieur.toutes());
  expect(toutes.length).toBe(26); // 8 objets × 3 variantes + la table de 1942 (retours du propriétaire) × 2
  for (const r of toutes) {
    expect(r.triangles, `${r.type}/${r.variante}`).toBeLessThanOrEqual(r.budget);
    expect(r.hauteur).toBeLessThanOrEqual(70);
    for (const q of r.rects) expect(q.tirs).toBe('passent');
  }
  await expect(page.locator('#planche figure')).toHaveCount(26);
  await expect(page.locator('#table-budget tbody tr')).toHaveCount(26);
  // Un appel par objet (une matière, lueur des ampoules comprise).
  for (const [type, v] of [['radio', 'generateur'], ['ampoules', 'deux'], ['brancard', 'treteaux'], ['caisseMedicale', 'pile']]) {
    expect(await page.evaluate(([a, b]) => window.__zsInterieur.choisir(a, b), [type, v])).toBe(true);
    const m = await page.evaluate(() => window.__zsInterieur.mesures());
    expect(m.jeu.objet.appels).toBe(1);
    await expect(page.locator('#variante-fiche')).toContainText('triangles');
  }
  // Plan : aucun problème (toutes les variantes), aucun chemin coupé, budget du plan sous +2 000 triangles.
  const plan = await page.evaluate(() => window.__zsInterieur.plan());
  expect(plan.problemes).toEqual([]);
  expect(plan.budget.total).toBeLessThanOrEqual(2000);
  for (const l of Object.values(plan.chemins)) for (const c of l) expect(c.coupees).toBe(0);
  await expect(page.locator('#plan-rdc svg .i9-passe').first()).toBeVisible();
  await expect(page.locator('#plan-etage svg .i9-passe').first()).toBeVisible();
  await expect(page.locator('#table-chemins tbody tr')).toHaveCount(14);
  // Lampe coudée : au plus 4 appels et 2 600 triangles par personnage (niveau complet).
  const lampe = (await page.evaluate(() => window.__zsInterieur.mesures())).lampe;
  expect(lampe.apres.calls).toBeLessThanOrEqual(4);
  expect(lampe.apres.triangles).toBeLessThanOrEqual(2600);
  expect(lampe.apres.triangles).toBeGreaterThan(lampe.sans.triangles);
  // Ouvertures : 7 scènes dessinées, sous les limites (150 appels, 60 000 triangles), toutes libérées (0 géométrie, 0 texture).
  await page.waitForFunction(() => window.__zsInterieur.ouvertures().pretes, null, { timeout: 150000 });
  const ouv = (await page.evaluate(() => window.__zsInterieur.ouvertures())).mesures;
  expect(ouv.length).toBe(7);
  for (const m of ouv) {
    expect(m.erreur).toBeUndefined();
    expect(m.pic.appels).toBeLessThanOrEqual(150);
    expect(m.pic.triangles).toBeLessThanOrEqual(60000);
    expect(m.apres).toEqual({ geometries: 0, textures: 0 });
  }
  await expect(page.locator('#ouv-planche canvas')).toHaveCount(25); // 6 cas × 4 instants (dont la douille) + le ×10
  // Caisses du menu (actuelle / époque) et scènes.
  await expect(page.locator('#caisses-planche .i9-caisse-hote svg')).toHaveCount(6);
  await expect(page.locator('#caisses-planche svg[data-epoque] .e3-q')).toHaveCount(12); // halo, grand « ? », deux petits
  // Scènes intégrées au menu (lot 9i-E : onglet Histoire B, chargement C).
  await expect(page.locator('#scenes-planche .i9-scene-hote svg')).toHaveCount(2);
  await expect(page.locator('[data-cas="histoire-B"] .e8-jouer-poteau')).toHaveCount(5);
  await expect(page.locator('[data-cas="chargement-C"] .e7-poteau')).toHaveCount(4);
  // Choix à recopier : les propositions suivent les listes.
  await page.selectOption('#ctl-objet', 'casques');
  await page.selectOption('#ctl-variante', 'renverse');
  expect(JSON.parse(await page.locator('#choix-interieur').textContent()).variantes.casques).toBe('renverse');
  await page.selectOption('#ctl-chargement', 'C');
  expect(JSON.parse(await page.locator('#choix-menu').textContent()).chargement).toBe('C');
  expect(suivi.externes).toEqual([]);
  expect(suivi.problemes).toEqual([]);
  expect(await page.evaluate(() => window.__ecritures)).toBe(0);
});

test('atelier de l\'intérieur : gros plan immobile en mouvement réduit ; accessibilité (axe)', async ({ page, baseURL }) => {
  test.setTimeout(180_000);
  const suivi = { externes: [], problemes: [] };
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await ouvrir(page, baseURL, suivi);
  const a0 = await page.evaluate(() => window.__zsInterieur.yaw());
  await page.waitForTimeout(400);
  expect(await page.evaluate(() => window.__zsInterieur.yaw())).toBe(a0);
  await expect(page.locator('#ctl-rotation')).toBeDisabled();
  await page.waitForFunction(() => window.__zsInterieur.ouvertures().pretes, null, { timeout: 150000 });
  const resultat = await new AxeBuilder({ page }).analyze();
  expect(resultat.violations.map((v) => v.id)).toEqual([]);
  expect(suivi.problemes).toEqual([]);
});

test('menu de débogage de la pause : lien « Atelier de l\'intérieur et du menu de 1942 » vers atelier-interieur.html', async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 667, height: 375 });
  await page.goto('/jeu.html?test=1&seed=1&nospawn=1');
  await waitReady(page);
  await page.locator('#btn-pause').click();
  await page.getByRole('button', { name: 'Débogage', exact: true }).click();
  const lien = page.locator('#debug-atelier-interieur');
  await expect(lien).toHaveAttribute('href', 'atelier-interieur.html');
  await expect(lien).toHaveText('Ouvrir l\'atelier');
  await expect(page.locator('#debug-panel')).toContainText('Atelier de l\'intérieur et du menu de 1942');
  const r = await lien.boundingBox();
  expect(Math.round(r.height)).toBeGreaterThanOrEqual(44);
});
