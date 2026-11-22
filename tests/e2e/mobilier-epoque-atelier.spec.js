import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { waitReady } from './helpers.js';

// Lot 9j : atelier du mobilier de 1942 (atelier-mobilier.html, page technique, avant le « GO 9j »). Le journal window.__zsMobilier (?test=1) donne
// l'état, les pièces (rectangles, aspects), les mesures des vues, le budget et la proposition du fichier de choix. Bureau ; projet mobile joué en local.
const BRUIT = /GL Driver Message|willReadFrequently|GPU stall/;
const ASPECTS = { caisses: 3, gravats: 3, etagere: 3, renversee: 2, classeur: 2, bureau: 2, tabouret: 2, comptoir: 2, muret: 2 };

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
  await page.goto('/atelier-mobilier.html?test=1');
  await expect(page.locator('#app')).toBeVisible();
  await page.waitForFunction(() => window.__zsMobilier?.pret === true, null, { timeout: 90000 });
}

test('atelier du mobilier : chaque aspect (actuel et variantes) en vue du jeu, dessins dans leur rectangle, plan des deux étages, budget, choix, aucune requête externe, aucune écriture', async ({ page, baseURL }) => {
  test.setTimeout(240_000);
  const suivi = { externes: [], problemes: [] };
  await ouvrir(page, baseURL, suivi);
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex');
  expect(await page.evaluate(() => window.__zsMobilier.webgl)).toBe(true);
  const pieces = await page.evaluate(() => window.__zsMobilier.pieces());
  expect(pieces).toHaveLength(39);
  // Une section par aspect : l'actuel puis ses variantes, chacune dessinée (pixels non vides) avec sa légende.
  for (const [a, n] of Object.entries(ASPECTS)) {
    await expect(page.locator(`#vues-${a} figure`)).toHaveCount(n + 1);
    await expect(page.locator(`#vues-${a} figure`).first()).toContainText('lot 3g');
    const m = (await page.evaluate(() => window.__zsMobilier.mesures()))[a];
    for (const [v, r] of Object.entries(m)) {
      expect(r.triangles, `${a}/${v}`).toBeGreaterThan(0);
      if (v !== 'actuel') expect(r.ecarts.max, `${a}/${v}`).toBeLessThanOrEqual(0.1);
    }
  }
  // Retours du propriétaire : éboulis des escaliers fermés (actuel, A, B, C), chaque dessin moins coûteux que l'éboulis du lot 3g.
  await expect(page.locator('#vues-escaliers figure')).toHaveCount(4);
  const esc = (await page.evaluate(() => window.__zsMobilier.mesures())).escaliers;
  for (const v of ['A', 'B', 'C']) expect(esc[v].corps, v).toBeLessThan(esc.actuel.corps);
  // Retours du propriétaire : décor des murs (12 objets, plan des deux étages).
  await expect(page.locator('#vues-murs figure')).toHaveCount(12);
  const mt = (await page.evaluate(() => window.__zsMobilier.mesures())).mursTotal;
  expect(mt.objets).toBeGreaterThanOrEqual(10);
  expect(mt.triangles).toBeLessThanOrEqual(600);
  await expect(page.locator('#murs-plan-rdc svg .m9-piece').first()).toBeVisible();
  // M22 (étagère renversée) et le tas P6 (gravats) sont les pièces montrées par défaut.
  expect(await page.locator('#ctl-piece-renversee').inputValue()).toBe('M22');
  expect(await page.locator('#ctl-piece-gravats').inputValue()).toBe('P6');
  // Sous la lune aussi ; une autre pièce de l'aspect (Q3, à l'étage).
  const lune = await page.evaluate(() => window.__zsMobilier.montrer('renversee', 'Q3', 'lune'));
  expect(lune.A.piece).toBe('Q3');
  // Plan : les deux étages, une pièce par rectangle, feux posés sur P9 et Q2.
  await expect(page.locator('#plan-rdc svg .m9-piece')).toHaveCount(32);
  await expect(page.locator('#plan-etage svg .m9-piece')).toHaveCount(7);
  await expect(page.locator('#plan-rdc svg .m9-feu')).toHaveCount(1);
  await expect(page.locator('#plan-etage svg .m9-feu')).toHaveCount(1);
  await expect(page.locator('#table-pieces tbody tr')).toHaveCount(39);
  // Budget de la sélection : au plus +450 triangles sur les deux étages (plafond absolu de 45 000 au moment du lot, 60 000 depuis ses retours : pire cas du sang à 44 451 sur origin/dev).
  const b = await page.evaluate(() => window.__zsMobilier.budget());
  expect(b.rdc0 + b.etage0).toBe(3052);
  expect(b.delta).toBeLessThanOrEqual(450);
  // Choix : une variante change la proposition ; un aspect forcé (M22 → caisses) apparaît dans « pieces ».
  await page.locator('#ctl-choix-caisses').selectOption('C');
  await page.locator('#table-pieces select[data-piece="M22"]').selectOption('caisses');
  const c = await page.evaluate(() => window.__zsMobilier.choix());
  expect(c.variantes.caisses).toBe('C');
  expect(c.pieces).toEqual({ M22: 'caisses' });
  expect(c.escaliers).toBe('A'); // retours du propriétaire : éboulis fin retenu (avant : C)
  await expect(page.locator('#choix-fichier')).toContainText('"M22": "caisses"');
  // Gros plan et grande vue (1920 × 1080).
  const g = await page.evaluate(() => window.__zsMobilier.grosPlan('comptoir', 'A', 1.2));
  expect(g.triangles).toBeGreaterThan(0);
  await expect(page.locator('#gp-fiche')).toContainText('M33');
  // Revue du contenu : textes peints listés.
  await expect(page.locator('#contenu-liste')).toContainText('CAL .30');
  expect(suivi.externes).toEqual([]);
  expect(await page.evaluate(() => window.__ecritures)).toBe(0);
  const resultat = await new AxeBuilder({ page }).analyze();
  expect(resultat.violations.map((v) => v.id)).toEqual([]);
  expect(suivi.problemes).toEqual([]);
});

test('menu de débogage de la pause : lien « Atelier du mobilier de 1942 » vers atelier-mobilier.html', async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 667, height: 375 });
  await page.goto('/jeu.html?test=1&seed=1&nospawn=1');
  await waitReady(page);
  await page.locator('#btn-pause').click();
  await page.getByRole('button', { name: 'Débogage', exact: true }).click();
  const lien = page.locator('#debug-atelier-mobilier');
  await expect(lien).toHaveAttribute('href', 'atelier-mobilier.html');
  await expect(lien).toHaveText('Ouvrir l\'atelier');
  await expect(page.locator('#debug-panel')).toContainText('Atelier du mobilier de 1942');
  const r = await lien.boundingBox();
  expect(Math.round(r.height)).toBeGreaterThanOrEqual(44);
});
