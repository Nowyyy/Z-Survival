import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import AxeBuilder from '@axe-core/playwright';

// Lot 8i-B : page d'écoute des sons du menu (atelier-sons-menu.html, page technique). Le journal window.__zsSonsMenu (?test=1) remplace
// l'écoute : aucun test n'attend la durée réelle d'un son. Taille de référence 667×375.
const catalogue = JSON.parse(readFileSync('data/menu/sons.json', 'utf8'));
const BRUIT = /GL Driver Message/;
const etat = (page) => page.evaluate(() => window.__zsSonsMenu.etat());
const journal = (page) => page.evaluate(() => window.__zsSonsMenu.journal());

// tout : tous les sons et la musique (?tout=1) ; sinon la vue par défaut, les seuls sons encore à choisir.
async function ouvrir(page, tout = true) {
  await page.setViewportSize({ width: 667, height: 375 });
  await page.goto(`/atelier-sons-menu.html?test=1${tout ? '&tout=1' : ''}`);
  await expect(page.locator('#app')).toBeVisible();
}

test('page d\'écoute : chaque son et ses variantes, aucun son avant un geste, console propre, aucune requête externe, rien d\'enregistré', async ({ page, baseURL }) => {
  const externes = [];
  const problemes = [];
  page.on('request', (r) => !r.url().startsWith(baseURL) && !r.url().startsWith('data:') && externes.push(r.url()));
  page.on('console', (m) => ['error', 'warning'].includes(m.type()) && !BRUIT.test(m.text()) && problemes.push(m.text()));
  page.on('pageerror', (e) => problemes.push(e.message));
  page.on('response', (r) => r.status() >= 400 && problemes.push(`${r.status()} ${r.url()}`));
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
  await ouvrir(page);
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex');
  await expect(page.locator('.slot')).toHaveCount(catalogue.sons.length);
  for (const s of catalogue.sons) await expect(page.locator(`#son-${s.id} .atelier-play`)).toHaveCount(s.variantes.length);
  // Variante par défaut cochée (fichier de choix vide ou valide), aucun contexte audio avant un geste.
  for (const s of catalogue.sons.slice(0, 5)) await expect(page.locator(`#son-${s.id} input:checked`)).toHaveCount(1);
  expect((await etat(page)).debloque).toBe(false);
  expect(await journal(page)).toEqual([]);
  // Écoute d'une variante : une lecture au journal, mesures affichées (durée, crête sous −1 dBFS).
  await page.locator('#son-clic [data-variante="B"]').click();
  const j = await journal(page);
  expect(j.length).toBe(1);
  expect(j[0]).toMatchObject({ son: 'clic', variante: 'B', origine: 'bouton' });
  await expect(page.locator('#son-clic .slot-measures')).toContainText('crête −'.replace('−', '-'));
  const m = await page.evaluate(() => window.__zsSonsMenu.mesures('clic', 'B'));
  expect(m.creteDb).toBeLessThanOrEqual(-1);
  expect((await etat(page)).debloque).toBe(true);
  expect(externes).toEqual([]);
  expect(problemes).toEqual([]);
  expect(await page.evaluate(() => window.__ecritures)).toBe(0);
});

test('page d\'écoute : démonstration sur la chronologie réelle, musique (lecture, couches, arrêt), texte de sons-choix.json à copier', async ({ page }) => {
  await ouvrir(page);
  // Démonstration : ouverture ×1 légendaire, sons dans l'ordre de la chronologie, signature de la rareté.
  await page.locator('[data-rarete="legendaire"]').click();
  const demo = (await etat(page)).demo;
  expect(demo.rarete).toBe('legendaire');
  const noms = demo.sons.map((s) => s.son);
  for (const attendu of ['ouv-pas', 'ouv-tapis', 'ouv-tir', 'ouv-impact', 'ouv-couvercle', 'ouv-lumiere', 'ouv-explosion', 'ouv-souffle', 'ouv-ecrasement', 'ouv-exclamation', 'ouv-zombie-tombe']) expect(noms).toContain(attendu);
  // Retours du propriétaire : ni voix de zombie ni sang qui coule.
  expect(noms.filter((x) => x === 'ouv-sang' || /^ouv-zombie-(sursaut|saut|cri)$/.test(x))).toEqual([]);
  expect(demo.sons.map((s) => s.t)).toEqual([...demo.sons.map((s) => s.t)].sort((a, b) => a - b));
  expect((await journal(page)).filter((e) => e.origine === 'demo').length).toBe(demo.sons.length);
  await page.locator('[data-rarete="commun"]').click();
  const commun = (await etat(page)).demo.sons.map((s) => s.son);
  expect(commun).toContain('ouv-tir');
  expect(commun.filter((x) => x.startsWith('rarete-'))).toEqual([]); // retour du propriétaire : plus de signature de rareté
  // Musique : lecture, une couche coupée, arrêt.
  await page.locator('#music-play').click();
  await expect.poll(async () => (await etat(page)).musique?.enMarche).toBe(true);
  expect((await etat(page)).musique.octets).toBeLessThanOrEqual(3 * 1024 * 1024);
  await page.locator('#couche-pouls').uncheck();
  await page.locator('#music-stop').click();
  await expect.poll(async () => (await etat(page)).musique).toBeNull();
  // Choix : la variante cochée passe dans le texte à copier, qui est le fichier complet.
  await page.locator('#garder-clic-C').check();
  await page.locator('#garder-musique-B').check();
  const texte = JSON.parse(await page.locator('#choices-text').inputValue());
  expect(texte.choix.clic).toBe('C');
  expect(texte.choix.musique).toBe('B');
  expect(Object.keys(texte.choix)).toEqual([...catalogue.sons.map((s) => s.id), 'musique']);
  await page.locator('#btn-stop').click();
  expect((await etat(page)).actives).toBe(0);
});

test('page d\'écoute : accessibilité (axe sans violation, cibles de 44 px, commandes nommées)', async ({ page }) => {
  await ouvrir(page);
  const resultat = await new AxeBuilder({ page }).analyze();
  expect(resultat.violations.map((v) => v.id)).toEqual([]);
  const petites = await page.evaluate(() => [...document.querySelectorAll('button, .slot-fav label, a.atelier-link, input[type="range"]')].filter((n) => n.offsetParent !== null).map((n) => {
    const b = n.getBoundingClientRect();
    return { id: n.id || n.textContent.trim().slice(0, 20), w: Math.round(b.width), h: Math.round(b.height) };
  }).filter((b) => b.w < 44 || b.h < 44));
  expect(petites).toEqual([]);
  const sansNom = await page.evaluate(() => [...document.querySelectorAll('button')].filter((b) => !(b.getAttribute('aria-label') || b.textContent).trim()).length);
  expect(sansNom).toBe(0);
});

test('page d\'écoute, plus aucun son à choisir (retours du propriétaire : tout est choisi) : tous les sons et la musique sont montrés, sans lien de vue réduite', async ({ page }) => {
  await ouvrir(page, false);
  expect(catalogue.sons.filter((s) => s.aChoisir)).toEqual([]);
  expect((await etat(page)).vue).toBe('tout');
  await expect(page.locator('.slot')).toHaveCount(catalogue.sons.length);
  await expect(page.locator('#music')).toBeVisible();
  await expect(page.locator('#lien-vue')).toBeHidden();
  // Le point d'exclamation : variante retenue par le propriétaire cochée ; le texte à copier est le fichier tel quel.
  const fichier = JSON.parse(readFileSync('data/menu/sons-choix.json', 'utf8')).choix;
  await expect(page.locator(`#garder-ouv-exclamation-${fichier['ouv-exclamation']}`)).toBeChecked();
  expect(JSON.parse(await page.locator('#choices-text').inputValue()).choix).toEqual(fichier);
});
