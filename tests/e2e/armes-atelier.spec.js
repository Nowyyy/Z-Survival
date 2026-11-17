import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import AxeBuilder from '@axe-core/playwright';
import { waitReady } from './helpers.js';

// Lot 9c : atelier des armes (atelier-armes.html, page technique à retirer au lot 13). Le journal window.__zsArmes (?test=1) donne l'état,
// la construction de toutes les variantes (triangles, appels mesurés) et les mesures à l'écran. Bureau et mobile (projet mobile en local).
const donnees = JSON.parse(readFileSync('data/armes/armes.json', 'utf8'));
const BRUIT = /GL Driver Message|willReadFrequently|GPU stall/;
const nbVariantes = donnees.armes.reduce((s, a) => s + a.variantes.length, 0);

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
  await page.goto('/atelier-armes.html?test=1');
  await expect(page.locator('#app')).toBeVisible();
  await page.waitForFunction(() => window.__zsArmes?.pret === true, null, { timeout: 45000 });
}

test('atelier des armes : toutes les armes et variantes se construisent (budgets, un appel), vues, comparaison, planche, aucune requête externe, aucune écriture', async ({ page, baseURL }) => {
  const suivi = { externes: [], problemes: [] };
  await ouvrir(page, baseURL, suivi);
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex');
  expect(await page.evaluate(() => window.__zsArmes.webgl)).toBe(true);
  // Toutes les variantes : triangles réels sous le budget, un seul appel de dessin chacune.
  const lignes = await page.evaluate(() => window.__zsArmes.toutes());
  expect(lignes.length).toBe(nbVariantes);
  for (const l of lignes) {
    expect(l.triangles, `${l.arme} ${l.variante}`).toBeLessThanOrEqual(l.budget);
    expect(l.appels, `${l.arme} ${l.variante}`).toBe(1);
    expect(l.longueur).toBeGreaterThan(5);
  }
  await expect(page.locator('#budget-lignes tr')).toHaveCount(nbVariantes);
  // Chaque arme et chaque variante dans les réglages : vues redessinées, comparaison de toutes les variantes, mesures à l'écran.
  for (const a of donnees.armes) {
    await page.selectOption('#ctl-arme', a.id);
    await expect(page.locator('#ctl-variante option')).toHaveCount(a.variantes.length);
    for (const v of a.variantes) {
      await page.selectOption('#ctl-variante', v.id);
      expect((await page.evaluate(() => window.__zsArmes.etat())).variante).toBe(v.id);
    }
    await expect(page.locator('#comparaison-legende')).toContainText(a.nom);
    for (const v of a.variantes) await expect(page.locator('#comparaison-legende')).toContainText(v.nom);
    const m = await page.evaluate(() => window.__zsArmes.mesures());
    expect(m['667x375'].perso.w).toBeGreaterThan(10);
    expect(m['1920x1080'].perso.w).toBeGreaterThan(m['667x375'].perso.w * 2);
    expect(m['667x375'].arme.w + m['667x375'].arme.h).toBeGreaterThan(2);
    expect(m.caisse.max).toBeLessThan(43);
  }
  // Caisse : deux variantes, craie allumée puis éteinte (le texte d'achat suit).
  await expect(page.locator('#etiquette')).toBeVisible();
  await expect(page.locator('#etiquette')).toContainText('Zollars');
  await page.locator('#btn-craie').click();
  await expect(page.locator('#btn-craie')).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('#etiquette')).toBeHidden();
  await page.selectOption('#ctl-caisse', 'ratelier');
  await expect(page.locator('#caisse-mesures')).toContainText('Râtelier');
  for (const l of ['lampe', 'lune', 'jeu']) await page.selectOption('#ctl-lumiere', l);
  await page.selectOption('#ctl-pistolet', 'visible');
  await expect(page.locator('#planche-legende')).toContainText(donnees.armes.at(-1).nom);
  // Visuels du menu : un SVG par arme (sans Three.js), quelques Ko chacun, et celui de l'arme choisie.
  await expect(page.locator('#visuels-tous figure svg')).toHaveCount(donnees.armes.length);
  await expect(page.locator('#visuel svg')).toHaveCount(1);
  for (const octets of Object.values(await page.evaluate(() => window.__zsArmes.visuels()))) expect(octets).toBeLessThanOrEqual(8000);
  // Choix : texte proposé à recopier, mis à jour par « Retenir cette variante » ; rien n'est écrit.
  await page.selectOption('#ctl-arme', donnees.armes[1].id);
  await page.selectOption('#ctl-variante', donnees.armes[1].variantes[1].id);
  await page.locator('#btn-retenir').click();
  const choix = await page.evaluate(() => window.__zsArmes.choix());
  expect(choix.proposition.variantes[donnees.armes[1].id]).toBe(donnees.armes[1].variantes[1].id);
  expect(suivi.externes).toEqual([]);
  expect(suivi.problemes).toEqual([]);
  expect(await page.evaluate(() => window.__ecritures)).toBe(0);
});

test('atelier des armes : gros plan qui tourne, immobile en mouvement réduit ; accessibilité (axe)', async ({ page, baseURL }) => {
  const suivi = { externes: [], problemes: [] };
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await ouvrir(page, baseURL, suivi);
  const a0 = await page.evaluate(() => window.__zsArmes.angle());
  await page.waitForTimeout(400);
  expect(await page.evaluate(() => window.__zsArmes.angle())).toBe(a0);
  await expect(page.locator('#btn-rotation')).toBeDisabled();
  await expect(page.locator('#btn-rotation')).toHaveAttribute('aria-pressed', 'false');
  // Au doigt ou à la souris : l'arme tourne.
  await page.locator('#vue-gros-plan .armes-scene').scrollIntoViewIfNeeded();
  const boite = await page.locator('#vue-gros-plan .armes-scene').boundingBox();
  await page.mouse.move(boite.x + 50, boite.y + 50);
  await page.mouse.down();
  await page.mouse.move(boite.x + 150, boite.y + 60, { steps: 4 });
  await page.mouse.up();
  expect(await page.evaluate(() => window.__zsArmes.angle())).not.toBe(a0);
  const resultat = await new AxeBuilder({ page }).analyze();
  expect(resultat.violations.map((v) => v.id)).toEqual([]);
  expect(suivi.problemes).toEqual([]);
});

test('atelier des armes : sans mouvement réduit, la rotation automatique avance', async ({ page, baseURL }) => {
  const suivi = { externes: [], problemes: [] };
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await ouvrir(page, baseURL, suivi);
  const a0 = await page.evaluate(() => window.__zsArmes.angle());
  await expect.poll(() => page.evaluate(() => window.__zsArmes.angle()), { timeout: 5000 }).not.toBe(a0);
  await expect(page.locator('#btn-rotation')).toHaveAttribute('aria-pressed', 'true');
});

test('menu de débogage de la pause : lien « Atelier des armes » vers atelier-armes.html', async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 667, height: 375 }); // paysage (en portrait, la partie demande de tourner l'écran)
  await page.goto('/jeu.html?test=1&seed=1&nospawn=1');
  await waitReady(page);
  await page.locator('#btn-pause').click();
  await page.getByRole('button', { name: 'Débogage', exact: true }).click();
  const lien = page.locator('#debug-atelier-armes');
  await expect(lien).toHaveAttribute('href', 'atelier-armes.html');
  await expect(lien).toHaveText('Ouvrir l\'atelier');
  await expect(page.locator('#debug-panel')).toContainText('Atelier des armes');
  const r = await lien.boundingBox();
  expect(Math.round(r.height)).toBeGreaterThanOrEqual(44);
});
