// Lot 4c : publication par versions ; lot 5g : nouvelle organisation, sur le site assemblé de test (scripts/site/e2e-site.mjs, http://127.0.0.1:4174/) :
// full/ = racine « en construction » + Recette/ (build courant) + dev/ (le même build, canal dev) + archives fictives v0.2 à v0.5 + v0.1 indisponible ;
// lot 5f : V0.6 publiée (Recette V0.6, versions précédentes V0.5 → V0.1, aucune évolution : les lots du journal sont tous en v0.6) ;
// lot 5p : V0.7 publiée (Recette V0.7, versions précédentes V0.6 → V0.1, aucune évolution : les lots 5j à 5p sont en v0.7, publiée) ;
// bare/ = Recette/ seule (ni dev, ni archive) ; many/ = 13 versions fictives (12 précédentes) ; noms/ (lot 5h) = full/ avec un fichier des noms fictif
// dans le build de dev (NOMS_TEST). Chaque site vit dans un sous-dossier (comme /Z-Survival/).
// Dans la suite rapide (ESSENTIAL de playwright.config.js), à 667×375, 1440×900 et 375×812. Le lot 5g reprend ici les garde-fous de l'ancien dev.spec
// (journal des versions supprimé) : axe, cibles de 44 px, console propre, aucune requête externe, aucun débordement, page en français.
import { test, expect, chromium } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { readFileSync } from 'node:fs';
import { readEvolutions } from '../../scripts/site/site-info.mjs';
import { DESCRIPTION_RECETTE_TEST } from '../../scripts/site/e2e-site.mjs';

const SITE = 'http://127.0.0.1:4174';
const FULL = `${SITE}/full/`;
const BARE = `${SITE}/bare/`;
const MANY = `${SITE}/many/`;
const NOMS = `${SITE}/noms/`;
// Lot 5f : avec V0.6 publiée, le site de test (fait d'après le dépôt par scripts/site/e2e-site.mjs, non modifiable) n'a plus d'évolution. Pour garder
// la vérification de leur rendu, des évolutions FICTIVES (le journal du dépôt rattaché à une version v0.7 non publiée) sont servies à la place de
// la liste vide de site-info.json (le reste du fichier est celui de l'assembleur).
const PUBLIEES = JSON.parse(readFileSync('versions.json', 'utf8')).versions.map((v) => v.id);
const JOURNAL = JSON.parse(readFileSync('data/changelog.json', 'utf8'));
// Lot 5j : évolutions réelles du dépôt (lots d'une version pas encore publiée : lot-5j, v0.7) ; avant le lot 5j : aucune (les tests disaient « aucune évolution »).
const EVOLUTIONS_REELLES = readEvolutions(JOURNAL, PUBLIEES).map((e) => e.id);
// Lot 5p : version fictive v0.8 (avant : v0.7, publiée depuis ce lot : la liste serait vide).
const EVOLUTIONS_FICTIVES = readEvolutions({ ...JOURNAL, lots: JOURNAL.lots.map((l) => (typeof l.version === 'string' ? { ...l, version: 'v0.8' } : l)) }, PUBLIEES);
async function avecEvolutionsFictives(page, base) {
  await page.route(`${base}Recette/site-info.json`, async (route) => {
    const response = await route.fetch();
    route.fulfill({ response, json: { ...(await response.json()), evolutions: EVOLUTIONS_FICTIVES } });
  });
}
const VIEWPORTS = [{ width: 667, height: 375 }, { width: 1440, height: 900 }, { width: 375, height: 812 }];
const VERSION_RECETTE = JSON.parse(readFileSync('versions.json', 'utf8')).versions.find((v) => v.status === 'actuelle');

// Problèmes d'une page : erreurs et avertissements de console, erreurs de page, requêtes en échec ou ≥ 400, requêtes externes.
// Les messages de performance du pilote graphique (« [.WebGL-…] GL Driver Message … GPU stall », rendu logiciel) ne sont pas des erreurs de la page.
const GL_DRIVER = /^\[\.WebGL-[0-9a-fx]+\]GL Driver Message/;
function watch(page) {
  const problems = [];
  const external = [];
  page.on('console', (m) => ['error', 'warning'].includes(m.type()) && !GL_DRIVER.test(m.text()) && problems.push(m.text()));
  page.on('pageerror', (e) => problems.push(e.message));
  page.on('requestfailed', (r) => problems.push(`échec ${r.url()}`));
  page.on('response', (r) => r.status() >= 400 && problems.push(`${r.status()} ${r.url()}`));
  page.on('request', (r) => !r.url().startsWith(SITE) && !r.url().startsWith('data:') && !r.url().startsWith('blob:') && external.push(r.url()));
  return { problems, external };
}

// Page de redirection affichée sans son rafraîchissement automatique (pour la lire et l'analyser avec axe comme une page ordinaire).
async function openWithoutRefresh(page, url) {
  await page.route(url, async (route) => {
    const response = await route.fetch();
    await route.fulfill({ response, body: (await response.text()).replace(/<meta http-equiv="refresh"[^>]*>/, '') });
  });
  await page.goto(url);
}

const overflow = (page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
const linkHeights = (page) => page.locator('a').evaluateAll((els) => els.filter((e) => e.offsetParent).map((e) => [e.textContent.trim(), e.getBoundingClientRect().height]));
const pageScroll = (page) => page.evaluate(() => [document.documentElement.scrollHeight, innerHeight]);

// Lot 5i : accueil retouché (option B), vérifié sur full/Recette/ déjà ouvert, aux quatre tailles (boucle ci-dessous à 667×375, 1440×900 et 375×812 ;
// test à part à 1200×1300). Reprend les 5 assertions du test retiré « Recette/ : étiquette « Recette · Version V0.6 », titre, « Jouer » vers jeu.html »
// (bandeau, titre, avis masqué, « Jouer » visible, href et adresse résolue). Renvoie la région « Toutes les versions ».
async function verifierAccueilRetouche(page, viewport) {
  await expect(page.locator('#version')).toHaveText('Recette');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Z-Survival');
  await expect(page.locator('#site-notice')).toBeHidden();
  const play = page.getByRole('link', { name: 'Jouer - V0.7' }); // lot 5p : avant V0.6
  await expect(play).toHaveText('Jouer - V0.7');
  await expect(play).toBeInViewport();
  await expect(play).toHaveAttribute('href', 'jeu.html');
  expect(await play.evaluate((a) => a.href)).toBe(`${FULL}Recette/jeu.html`);
  const playBox = await play.boundingBox();
  expect(playBox.height).toBeGreaterThanOrEqual(44);
  expect(playBox.x + playBox.width).toBeLessThanOrEqual(viewport.width);

  const versions = page.getByRole('region', { name: 'Toutes les versions' });
  await expect(page.getByRole('heading', { name: 'Toutes les versions', exact: true })).toBeVisible();
  await expect(versions).toHaveAttribute('tabindex', '0');
  await expect(page.getByRole('region', { name: 'Évolutions en cours de développement' })).toHaveAttribute('tabindex', '0');
  const card = versions.locator('#current-card');
  await expect(card.locator('.home-current-badge')).toHaveText('Version actuelle');
  await expect(card.locator('#current-name')).toHaveText('V0.7'); // lot 5p : avant V0.6
  await expect(card.locator('#current-text')).toHaveText(VERSION_RECETTE.title);
  await expect(card.locator('a')).toHaveCount(0);
  expect(await card.evaluate((el) => el.closest('a'))).toBeNull();
  const subtitle = versions.getByRole('heading', { name: 'Versions précédentes', exact: true });
  await expect(subtitle).toHaveText('Versions précédentes');
  await expect(versions.locator('#previous-list .item-label')).toHaveText(['V0.6', 'V0.5', 'V0.4', 'V0.3', 'V0.2', 'V0.1 : indisponible']); // lot 5p : V0.6 ajoutée en tête
  const [cardBox, subtitleBox, listBox] = await Promise.all([card.boundingBox(), subtitle.boundingBox(), versions.locator('#previous-list').boundingBox()]);
  expect(subtitleBox.y).toBeGreaterThanOrEqual(cardBox.y + cardBox.height - 1);
  expect(listBox.y).toBeGreaterThanOrEqual(subtitleBox.y + subtitleBox.height - 1);
  await versions.focus();
  await expect(versions).toBeFocused();
  if (viewport.width >= 640 && viewport.height >= 900) {
    // Pleine hauteur : la page entière ne défile pas (1440×900, 1200×1300).
    const [scroll, inner] = await pageScroll(page);
    expect(scroll).toBeLessThanOrEqual(inner + 1);
  }
  if (viewport.width < 640) {
    // Une colonne : la région des versions est sous celle des évolutions.
    const [evolutionsBox, versionsBox] = await Promise.all([page.locator('#evolutions-region').boundingBox(), versions.boundingBox()]);
    expect(versionsBox.y).toBeGreaterThan(evolutionsBox.y + evolutionsBox.height - 1);
  }
  expect(await overflow(page)).toBeLessThanOrEqual(0);
  return versions;
}

for (const viewport of VIEWPORTS) {
  test.describe(`site publié ${viewport.width}×${viewport.height}`, () => {
    test.use({ viewport });

    test('racine : « Z-Survival est en construction. », aucun lien, en français, axe sans violation, aucune requête externe ni débordement', async ({ page }) => {
      const { problems, external } = watch(page);
      await page.goto(FULL);
      await expect(page.getByRole('heading', { level: 1 })).toHaveText('Z-Survival');
      await expect(page.getByText('Z-Survival est en construction.')).toBeVisible();
      await expect(page.locator('a')).toHaveCount(0);
      await expect(page.locator('html')).toHaveAttribute('lang', 'fr');
      await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex');
      const size = await page.getByText('Z-Survival est en construction.').evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
      expect(size).toBeGreaterThanOrEqual(16);
      expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
      expect(await overflow(page)).toBeLessThanOrEqual(0);
      expect(external).toEqual([]);
      expect(problems).toEqual([]);
    });

    // Le chargement du jeu par next/ est vérifié une fois, hors de cette boucle (« next/ mène à dev/jeu.html »).
    test('lots/ et dev/ mènent à Recette/', async ({ page }) => {
      for (const path of ['lots/', 'dev/']) {
        await page.goto(`${FULL}${path}`);
        await expect(page, path).toHaveURL(`${FULL}Recette/`);
      }
    });

    test('« Dernier build de développement » (hash court et date) mène à dev/jeu.html, qui se charge ; aucun lien « Journal »', async ({ page }) => {
      await page.goto(`${FULL}Recette/`);
      await expect(page.getByRole('heading', { name: 'Développement', exact: true })).toBeVisible();
      const dev = page.getByRole('link', { name: /Dernier build de développement/ });
      await expect(dev).toHaveAttribute('href', '../dev/jeu.html');
      await expect(dev).toContainText('abcdef1 · 2 nov. 2026');
      await expect(page.getByRole('link', { name: /journal/i })).toHaveCount(0);
      await expect(page.locator('main')).not.toContainText(/journal des versions/i);
      expect(await dev.evaluate((a) => a.href)).toBe(`${FULL}dev/jeu.html`);
    });

    // Lot 5f : V0.5 → V0.2 en liens (avant : V0.4 → V0.2) ; site-info.json de full/ sans évolution : « Aucune évolution depuis la version Recette. »
    // (avant : premier titre lu dans site-info.json, vérifié maintenant par le test suivant sur des évolutions fictives).
    // Lot 5i : la région de droite s'appelle « Toutes les versions » (avant : « Versions précédentes ») ; la carte de la version actuelle n'a pas de lien.
    // Lot 5p : V0.7 publiée : « Jouer - V0.7 », V0.6 → V0.2 en liens (avant : V0.6, V0.5 → V0.2) ; évolutions réelles vides : « Aucune évolution depuis la version Recette. »
    // vérifié ici aussi (avant : lots 5j à 5o, v0.7 non publiée).
    test('bandeau « Recette », « Jouer - V0.7 », carte de la version actuelle sans lien puis « Versions précédentes » ; évolutions (gauche) et toutes les versions (droite) : régions focusables nommées ; aucune évolution (V0.6 et V0.7 publiées) : « Aucune évolution depuis la version Recette. » ; V0.6 → V0.2 en liens, V0.1 indisponible non cliquable', async ({ page }) => {
      await page.goto(`${FULL}Recette/`);
      const evolutions = page.getByRole('region', { name: 'Évolutions en cours de développement' });
      const previous = await verifierAccueilRetouche(page, viewport);
      for (const region of [evolutions, previous]) await expect(region).toHaveAttribute('tabindex', '0');
      const info = await (await page.request.get(`${FULL}Recette/site-info.json`)).json();
      // Lot 5j : avant, aucune évolution (liste vide, « Aucune évolution depuis la version Recette. ») ; après, les évolutions réelles (lot-5j, v0.7),
      // jamais un lot de la V0.6 publiée ; le texte « Aucune évolution » reste vérifié sur many/ et sur un site-info.json sans évolution.
      expect(info.evolutions.map((e) => e.id)).toEqual(EVOLUTIONS_REELLES);
      expect(info.evolutions.filter((e) => e.version === 'v0.6')).toEqual([]);
      expect(info.evolutions.filter((e) => e.version === 'v0.7')).toEqual([]); // lot 5p
      // Lot 5q : seuls des lots de la V0.8 non publiée (full/ est assemblé sans fichier des noms : lot-5q, masqué sur la Recette, y figure) ;
      // avant (lot 5p) : EVOLUTIONS_REELLES vide exigé, V0.7 publiée et aucun lot d'une version suivante.
      expect(info.evolutions.filter((e) => e.version !== 'v0.8')).toEqual([]);
      await expect(page.locator('#evolutions-none')).toBeVisible({ visible: EVOLUTIONS_REELLES.length === 0 });
      await expect(page.locator('#evolutions-none')).toHaveText('Aucune évolution depuis la version Recette.'); // lot 5p
      await expect(evolutions.locator('.evolution')).toHaveCount(EVOLUTIONS_REELLES.length);
      const links = previous.locator('a');
      expect(await links.evaluateAll((els) => els.map((e) => e.getAttribute('href')))).toEqual(['../v0.6/jeu.html', '../v0.5/jeu.html', '../v0.4/jeu.html', '../v0.3/jeu.html', '../v0.2/jeu.html']);
      const off = previous.locator('.is-off');
      await expect(off).toHaveCount(1);
      await expect(off).toContainText('V0.1 : indisponible');
      await expect(off).toContainText('Version de test indisponible');
      expect(await off.evaluate((el) => el.tagName)).toBe('P');
      const [left, right] = await Promise.all([evolutions.boundingBox(), previous.boundingBox()]);
      if (viewport.width >= 640) expect(right.x).toBeGreaterThan(left.x + left.width - 1);
      else expect(right.y).toBeGreaterThan(left.y + left.height - 1);
      await links.first().click();
      await expect(page).toHaveURL(`${FULL}v0.6/jeu.html`); // lot 5p : avant v0.5
      await expect(page.locator('#loaded')).toHaveText('module chargé');
    });

    // Lot 5f : rendu des évolutions (avant : sur les vraies évolutions de full/, lots en v0.6 non publiée), sur des évolutions fictives servies à la place.
    test('évolutions fictives (version v0.8 non publiée ; lot 5p : avant v0.7) : titres et textes dans l\'ordre de site-info.json, la plus récente en haut ; « Aucune évolution » masqué', async ({ page }) => {
      expect(EVOLUTIONS_FICTIVES.length).toBeGreaterThan(1);
      await avecEvolutionsFictives(page, FULL);
      await page.goto(`${FULL}Recette/`);
      const evolutions = page.getByRole('region', { name: 'Évolutions en cours de développement' });
      await expect(evolutions.locator('.evolution')).toHaveCount(EVOLUTIONS_FICTIVES.length);
      await expect(evolutions.locator('.evolution-title').first()).toHaveText(EVOLUTIONS_FICTIVES[0].title);
      await expect(evolutions.locator('.evolution-text').first()).toHaveText(EVOLUTIONS_FICTIVES[0].text);
      await expect(evolutions.locator('.evolution-title')).toHaveText(EVOLUTIONS_FICTIVES.map((e) => e.title));
      await expect(page.locator('#evolutions-none')).toBeHidden();
      expect(await overflow(page)).toBeLessThanOrEqual(0);
    });

    test('12 versions précédentes (many/) : la liste défile dans sa zone, la page ne s\'allonge pas ; « Aucune évolution depuis la version Recette. »', async ({ page }) => {
      await page.goto(`${FULL}Recette/`);
      await expect(page.locator('#previous-list li')).toHaveCount(6); // lot 5p : V0.6 → V0.1 (avant : 5) ; lot 5f : V0.5 → V0.1 (avant : 4, V0.4 → V0.1)
      const fullHeight = await page.evaluate(() => document.documentElement.scrollHeight);
      await page.goto(`${MANY}Recette/`);
      await expect(page.locator('#previous-list li')).toHaveCount(12);
      const region = page.getByRole('region', { name: 'Toutes les versions' }); // lot 5i : avant « Versions précédentes »
      const [scroll, client] = await region.evaluate((el) => [el.scrollHeight, el.clientHeight]);
      expect(scroll).toBeGreaterThan(client);
      expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBeLessThanOrEqual(fullHeight);
      expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBeLessThanOrEqual(viewport.height === 375 ? 375 * 1.5 : Math.max(viewport.height, 960));
      await expect(page.locator('#evolutions-none')).toHaveText('Aucune évolution depuis la version Recette.');
      if (viewport.width >= 640 && viewport.height >= 900) { // lot 5i : pleine hauteur, la page entière ne défile pas
        const [pageHeight, inner] = await pageScroll(page);
        expect(pageHeight).toBeLessThanOrEqual(inner + 1);
      }
      await region.focus();
      await expect(region).toBeFocused(); // lot 5i
      await page.keyboard.press('End');
      await expect.poll(() => region.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
    });

    test('Recette/ : axe sans violation (full, bare, many), cibles de 44 px, console propre, aucune requête externe ni stockage, aucun débordement', async ({ page, context }) => {
      const { problems, external } = watch(page);
      for (const url of [`${FULL}Recette/`, `${BARE}Recette/`, `${MANY}Recette/`]) {
        await page.goto(url);
        await page.waitForLoadState('networkidle');
        await expect(page.locator('#app'), url).toBeVisible();
        expect((await new AxeBuilder({ page }).analyze()).violations, url).toEqual([]);
        for (const [label, h] of await linkHeights(page)) expect(h, `${url} ${label}`).toBeGreaterThanOrEqual(44);
        expect(await overflow(page), url).toBeLessThanOrEqual(0);
        expect(await page.evaluate(() => [localStorage.length, sessionStorage.length]), url).toEqual([0, 0]);
        const sizes = await page.locator('#app :is(p, li, a, span, h2)').evaluateAll((els) => els.filter((e) => e.offsetParent && e.textContent.trim()).map((e) => parseFloat(getComputedStyle(e).fontSize)));
        expect(Math.min(...sizes), url).toBeGreaterThanOrEqual(14);
      }
      expect(await context.cookies()).toEqual([]);
      expect(external).toEqual([]);
      expect(problems).toEqual([]);
    });

    test('Recette/ : CLS ≤ 0,1 (polices comprises)', async ({ page }) => {
      await page.addInitScript(() => {
        window.__cls = 0;
        new PerformanceObserver((list) => {
          for (const e of list.getEntries()) if (!e.hadRecentInput) window.__cls += e.value;
        }).observe({ type: 'layout-shift', buffered: true });
      });
      await page.goto(`${FULL}Recette/`);
      await page.waitForLoadState('networkidle');
      await expect(page.locator('#app')).toBeVisible();
      await expect.poll(() => page.evaluate(() => document.fonts.status)).toBe('loaded');
      expect(await page.evaluate(() => window.__cls)).toBeLessThanOrEqual(0.1);
    });

    test('pages de redirection et page « sans build » : lien visible de 44 px, axe sans violation, noindex, aucun débordement', async ({ page }) => {
      for (const [url, name, href] of [[`${FULL}next/`, 'Aller au dernier build de développement', '../dev/jeu.html'], [`${FULL}lots/`, 'Aller à l\'accueil de la Recette', '../Recette/'],
        [`${FULL}dev/`, 'Aller à l\'accueil de la Recette', '../Recette/'], [`${BARE}next/`, 'Aller au dernier build de développement', '../dev/']]) {
        await openWithoutRefresh(page, url);
        await expect(page.getByRole('link', { name }), url).toHaveAttribute('href', href);
        await expect(page.locator('meta[name="robots"]'), url).toHaveAttribute('content', 'noindex');
        for (const [label, h] of await linkHeights(page)) expect(h, `${url} ${label}`).toBeGreaterThanOrEqual(44);
        expect((await new AxeBuilder({ page }).analyze()).violations, url).toEqual([]);
        expect(await overflow(page), url).toBeLessThanOrEqual(0);
        await page.unrouteAll();
      }
      await page.goto(`${BARE}dev/`);
      await expect(page.getByText('Aucun build de développement pour l\'instant')).toBeVisible();
      await expect(page.getByRole('link', { name: 'Revenir à l\'accueil de la Recette' })).toHaveAttribute('href', '../Recette/');
      for (const [label, h] of await linkHeights(page)) expect(h, label).toBeGreaterThanOrEqual(44);
      expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    });
  });
}

// Lot 5i : 1200×1300 (grand écran haut) : accueil retouché, pleine hauteur (régions étirées jusqu'au pied), axe et cibles de 44 px ; many/ : la page ne
// défile pas, la région reste focusable (ses 12 versions précédentes y tiennent : rien à faire défiler).
test.describe('accueil retouché 1200×1300', () => {
  test.use({ viewport: { width: 1200, height: 1300 } });

  test('full/ : bandeau, « Jouer - V0.7 », carte, versions précédentes ; régions des versions et des évolutions à moins de 160 px du bas ; page sans défilement ; axe, 44 px', async ({ page }) => {
    const { problems, external } = watch(page);
    await page.goto(`${FULL}Recette/`);
    await verifierAccueilRetouche(page, { width: 1200, height: 1300 });
    for (const id of ['versions-region', 'evolutions-region']) {
      await expect.poll(() => page.locator(`#${id}`).evaluate((el) => innerHeight - el.getBoundingClientRect().bottom), id).toBeLessThan(160);
    }
    await page.waitForLoadState('networkidle');
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    for (const [label, h] of await linkHeights(page)) expect(h, label).toBeGreaterThanOrEqual(44);
    expect(external).toEqual([]);
    expect(problems).toEqual([]);
  });

  test('many/ : 13 versions, page sans défilement, région « Toutes les versions » focusable', async ({ page }) => {
    await page.goto(`${MANY}Recette/`);
    await expect(page.locator('#previous-list li')).toHaveCount(12);
    await expect(page.locator('#current-name')).toHaveText('V0.13');
    const [pageHeight, inner] = await pageScroll(page);
    expect(pageHeight).toBeLessThanOrEqual(inner + 1);
    const region = page.getByRole('region', { name: 'Toutes les versions' });
    await region.focus();
    await expect(region).toBeFocused();
  });
});

// Lot 5h : fichier des noms appliqué par l'assembleur (site noms/, fichier fictif NOMS_TEST de scripts/site/e2e-site.mjs).
for (const viewport of VIEWPORTS.slice(0, 2)) {
  test.describe(`fichier des noms ${viewport.width}×${viewport.height}`, () => {
    test.use({ viewport });
    // Lot 5f : V0.6 publiée. Le fichier fictif (NOMS_TEST) renomme [v0.5] et [v0.4], devenues des versions précédentes, et les lots 5h et 5g, qui ne
    // sont plus des évolutions. Avant : étiquette « Recette · Version V0.5 (nom de test) », V0.4 en tête des précédentes, évolution 5h renommée,
    // lot 5g absent (4 assertions sur les évolutions). Après : Recette V0.6 non renommée (absente du fichier), V0.5 et V0.4 renommées dans les
    // précédentes, aucune évolution (site-info.json de noms/ : liste vide, lots renommés ou masqués absents) ; le renommage et le masquage d'un lot
    // restent vérifiés par publication.test.js (« le fichier l'emporte… afficher: non retire le lot »).
    // Lot 5i : le fichier fictif donne à la Recette (V0.6) une description de 200 caractères, sans nom : la carte l'affiche en entier, nom V0.6 inchangé.
    // Lot 5p : V0.7 publiée. Le fichier fictif (NOMS_TEST, scripts/site/e2e-site.mjs, non modifiable) décrit toujours [v0.6], devenue une version
    // précédente. Avant : Recette V0.6 avec la description de 200 caractères sur la carte, V0.5 et V0.4 renommées en tête des précédentes, V0.3 en 3e.
    // Après : Recette V0.7 (absente du fichier : nom et titre de versions.json), V0.6 en tête des précédentes avec sa description de 200 caractères
    // en entier (assembleur et rendu), V0.5 et V0.4 renommées ensuite, V0.3 en 4e ; la carte affiche toujours une description de 200 caractères en
    // entier, servie par un site-info.json dont seul recette.title est remplacé (le chemin de l'assembleur est vérifié par publication.test.js,
    // « site-info.json : recette.title = description complète du fichier des noms »). Aucune assertion retirée.
    test('noms/ : Recette V0.7 (nom absent du fichier) ; V0.6 en tête des versions précédentes avec sa description de 200 caractères en entier ; V0.5 et V0.4 renommées ; carte : description de 200 caractères en entier ; aucune évolution (V0.6 et V0.7 publiées) ; console propre, axe sans violation', async ({ page }) => {
      const { problems, external } = watch(page);
      const noms = await (await page.request.get(`${NOMS}Recette/site-info.json`)).json();
      expect(noms.evolutions.map((e) => e.id)).toEqual(EVOLUTIONS_REELLES); // lot 5j : avant, [] ; jamais les lots 5h et 5g (v0.6 publiée) ; lot 5p : [] (v0.7 publiée)
      expect(noms.evolutions.filter((e) => e.version === 'v0.6')).toEqual([]);
      expect(noms.evolutions.filter((e) => e.version === 'v0.7')).toEqual([]);
      expect(noms.precedentes.slice(0, 3).map((p) => [p.id, p.label, p.title])).toEqual([['v0.6', 'V0.6', DESCRIPTION_RECETTE_TEST], ['v0.5', 'V0.5 (nom de test)', 'Description de test de la Recette (fictive)'], ['v0.4', 'Quatrième version (test)', 'Description de test de la V0.4 : fictive']]);
      expect(noms.recette).toMatchObject({ label: 'V0.7', title: VERSION_RECETTE.title });
      await page.goto(`${NOMS}Recette/`);
      await expect(page.locator('#version')).toHaveText('Recette'); // lot 5i : avant « Recette · Version V0.6 »
      await expect(page.locator('#play')).toHaveText('Jouer - V0.7');
      await expect(page.locator('#current-name')).toHaveText('V0.7');
      await expect(page.locator('#current-text')).toHaveText(VERSION_RECETTE.title);
      const evolutions = page.getByRole('region', { name: 'Évolutions en cours de développement' });
      await expect(evolutions.locator('.evolution')).toHaveCount(EVOLUTIONS_REELLES.length); // lot 5j : avant, 0 et « Aucune évolution depuis la version Recette. »
      await expect(page.locator('#evolutions-none')).toBeVisible({ visible: EVOLUTIONS_REELLES.length === 0 });
      const previous = page.getByRole('region', { name: 'Toutes les versions' }).locator('a'); // lot 5i : avant « Versions précédentes »
      await expect(previous.first().locator('.item-label')).toHaveText('V0.6');
      await expect(previous.first().locator('.meta')).toHaveText(DESCRIPTION_RECETTE_TEST);
      await expect(previous.first()).toHaveAttribute('href', '../v0.6/jeu.html');
      await expect(previous.nth(1).locator('.item-label')).toHaveText('V0.5 (nom de test)');
      await expect(previous.nth(1).locator('.meta')).toHaveText('Description de test de la Recette (fictive)');
      await expect(previous.nth(1)).toHaveAttribute('href', '../v0.5/jeu.html');
      await expect(previous.nth(2).locator('.item-label')).toHaveText('Quatrième version (test)');
      await expect(previous.nth(2).locator('.meta')).toHaveText('Description de test de la V0.4 : fictive');
      await expect(previous.nth(2)).toHaveAttribute('href', '../v0.4/jeu.html');
      await expect(previous.nth(3).locator('.item-label')).toHaveText('V0.3');
      await page.waitForLoadState('networkidle');
      expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
      expect(await overflow(page)).toBeLessThanOrEqual(0);
      expect(external).toEqual([]);
      expect(problems).toEqual([]);
      // Lot 5p : carte de la Recette avec une description de 200 caractères (avant : celle de la V0.6 Recette, venue du fichier fictif).
      await page.route(`${NOMS}Recette/site-info.json`, async (route) => {
        const response = await route.fetch();
        const json = await response.json();
        route.fulfill({ response, json: { ...json, recette: { ...json.recette, title: DESCRIPTION_RECETTE_TEST } } });
      });
      await page.goto(`${NOMS}Recette/`);
      await expect(page.locator('#current-name')).toHaveText('V0.7');
      await expect(page.locator('#current-text')).toHaveText(DESCRIPTION_RECETTE_TEST);
      expect(await overflow(page)).toBeLessThanOrEqual(0);
    });
  });
}

// Lot 5h : remplace « adresses absentes : /recette/ (minuscules) … : 404 » du lot 5g. Le statut reste 404 (GitHub Pages et serve.mjs servent 404.html),
// mais la page corrige la casse : la redirection est vérifiée par les tests « /recette/ … finit sur /Recette/ » ci-dessous.
test('adresses absentes : /jeu.html et /versions.json à la racine, lots/lot-*, lots.json, dev/jeu.html sans build : 404 ; /recette/ : 404 + page qui corrige la casse', async ({ request }) => {
  for (const path of ['recette/', 'recette/jeu.html', 'jeu.html', 'versions.json', 'build-info.json', 'icone.png', 'lots/lot-4b/', 'lots/lot-1/jeu.html', 'lots.json', 'Recette/dev/', 'Recette/next/']) {
    expect((await request.get(`${FULL}${path}`)).status(), path).toBe(404);
  }
  expect((await request.get(`${BARE}dev/jeu.html`)).status()).toBe(404);
  for (const path of ['recette/', 'recette/jeu.html']) expect(await (await request.get(`${FULL}${path}`)).text(), path).toContain('function corrigerCasse(chemin)');
  expect(await (await request.get(`${FULL}404.html`)).text()).toContain('<p>Page introuvable.</p>');
});

// Lot 5h : redirection de la casse (404.html à la racine de chaque site de test, comme sur GitHub Pages ; serve.mjs sensible à la casse).
// La réponse 404 du document fautif est attendue (c'est elle qui porte la correction) : elle est retirée des problèmes, rien d'autre.
const sans404 = (problems, url) => problems.filter((p) => p !== `404 ${url}` && !(p.startsWith('Failed to load resource: the server responded with a status of 404')));

test('/recette/ (minuscules) et /RECETTE/ finissent sur /Recette/ avec l\'accueil ; console propre, aucune requête externe', async ({ page }) => {
  const { problems, external } = watch(page);
  for (const path of ['recette/', 'RECETTE/']) {
    await page.goto(`${FULL}${path}`);
    await expect(page, path).toHaveURL(`${FULL}Recette/`);
    await expect(page.locator('#version'), path).toHaveText('Recette'); // lot 5i : avant « Recette · Version V0.6 » (lot 5f : avant V0.5)
    await expect(page.locator('#play'), path).toHaveText('Jouer - V0.7'); // lot 5p : avant V0.6
  }
  await page.waitForLoadState('networkidle');
  expect(external).toEqual([]);
  expect(sans404(sans404(problems, `${FULL}recette/`), `${FULL}RECETTE/`)).toEqual([]);
});

test('/recette/jeu.html?x=1#b finit sur /Recette/jeu.html?x=1#b (requête et fragment conservés), et le jeu se charge', async ({ page }) => {
  const { external } = watch(page);
  await page.goto(`${FULL}recette/jeu.html?x=1#b`);
  await page.waitForURL(`${FULL}Recette/jeu.html?x=1#b`);
  await expect(page).toHaveURL(`${FULL}Recette/jeu.html?x=1#b`);
  // Lot 5f : délai de 30 s, comme « Jouer » et next/ plus bas (écran de préparation, rendu logiciel sous charge) ; avant : 5 s par défaut,
  // dépassés au palier complet (essai/complet-7, tranche 13, après les tests de budget 3D).
  await expect(page.locator('canvas').first()).toBeAttached({ timeout: 30_000 });
  expect(external).toEqual([]);
});

test('/Recette/inconnu : statut 404, « Page introuvable. » (16 px au moins) sans redirection ni boucle, axe sans violation, aucune requête externe', async ({ page }) => {
  const { problems, external } = watch(page);
  const navigations = [];
  page.on('framenavigated', (frame) => frame === page.mainFrame() && navigations.push(frame.url()));
  const url = `${FULL}Recette/inconnu`;
  const response = await page.goto(url);
  expect(response.status()).toBe(404);
  await expect(page.getByText('Page introuvable.')).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('lang', 'fr');
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex');
  expect(await page.getByText('Page introuvable.').evaluate((el) => parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(16);
  await page.waitForLoadState('networkidle');
  await expect(page).toHaveURL(url);
  expect(navigations).toEqual([url]);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  expect(external).toEqual([]);
  expect(sans404(problems, url)).toEqual([]);
});

test('/Recette/ répond 200 ; /dev/jeu.html et /v0.N/ inchangés (200, sans redirection)', async ({ request }) => {
  for (const path of ['Recette/', 'Recette/jeu.html', 'dev/jeu.html', 'v0.2/jeu.html', 'v0.4/jeu.html', 'v0.6/jeu.html']) { // lot 5p : v0.6 ajoutée
    const r = await request.get(`${FULL}${path}`, { maxRedirects: 0 });
    expect(r.status(), path).toBe(200);
    expect(await r.text(), path).not.toContain('corrigerCasse');
  }
  expect(await (await request.get(`${FULL}v0.2/jeu.html`)).text()).toContain('Archive de test (fictive).');
});

// Lot 5f : V0.6 (avant : latest v0.5, V0.5, précédentes V0.4 → V0.1, au moins une évolution) ; après : aucune évolution, V0.5 archive.
// Lot 5p : V0.7 (avant : latest v0.6, V0.6, précédentes V0.5 → V0.1, évolutions lots 5j à 5o) ; après : aucune évolution, V0.6 archive.
test('Recette/ sert versions.json, build-info.json (release) et site-info.json ; dev/ sert build-info.json (dev) ; archives : build-info.json', async ({ request }) => {
  expect((await (await request.get(`${FULL}Recette/versions.json`)).json()).latest).toBe('v0.7');
  expect(await (await request.get(`${FULL}Recette/build-info.json`)).json()).toMatchObject({ channel: 'release', version: 'V0.7', branch: 'main' });
  const info = await (await request.get(`${FULL}Recette/site-info.json`)).json();
  expect(info).toMatchObject({ schema: 1, recette: { label: 'V0.7', entry: 'jeu.html' }, dev: { present: true, sha: 'abcdef1', entry: '../dev/jeu.html' } });
  expect(info.precedentes.map((p) => p.label)).toEqual(['V0.6', 'V0.5', 'V0.4', 'V0.3', 'V0.2', 'V0.1']);
  expect(info.evolutions.map((e) => e.id)).toEqual(EVOLUTIONS_REELLES); // lot 5j : avant, [] (aucun lot d'une version non publiée) ; lot 5p : [] de nouveau
  expect(info.evolutions.filter((e) => e.version !== 'v0.8')).toEqual([]); // lot 5q : seuls des lots de la V0.8 (full/ sans fichier des noms) ; lot 5p : liste vide exigée
  expect(await (await request.get(`${FULL}dev/build-info.json`)).json()).toMatchObject({ channel: 'dev', sha: 'abcdef1' });
  expect(await (await request.get(`${FULL}v0.4/build-info.json`)).json()).toMatchObject({ channel: 'archive', version: 'V0.4' });
  expect(await (await request.get(`${FULL}v0.5/build-info.json`)).json()).toMatchObject({ channel: 'archive', version: 'V0.5' });
  expect(await (await request.get(`${FULL}v0.6/build-info.json`)).json()).toMatchObject({ channel: 'archive', version: 'V0.6' }); // lot 5p
  expect((await (await request.get(`${BARE}Recette/site-info.json`)).json()).dev).toEqual({ present: false, sha: '', date: '', entry: '../dev/jeu.html' });
  expect((await (await request.get(`${MANY}Recette/site-info.json`)).json()).precedentes).toHaveLength(12);
});

test('archives v0.2 à v0.6 : chaque entrée se charge sans ressource manquante, sans requête externe ni stockage', async ({ page, context }) => {
  for (const id of ['v0.6', 'v0.5', 'v0.4', 'v0.3', 'v0.2']) { // lot 5p : v0.6 ajoutée ; lot 5f : v0.5 ajoutée
    const { problems, external } = watch(page);
    await page.goto(`${FULL}${id}/jeu.html`);
    await expect(page.locator('#loaded'), id).toHaveText('module chargé');
    await page.waitForLoadState('networkidle');
    expect(await page.evaluate(() => [localStorage.length, sessionStorage.length]), id).toEqual([0, 0]);
    expect(external, id).toEqual([]);
    expect(problems, id).toEqual([]);
    page.removeAllListeners();
  }
  expect(await context.cookies()).toEqual([]);
});

// Le jeu affiche d'abord son écran de préparation (textures et sons) : jusqu'à 30 s en rendu logiciel sous charge.
test('« Jouer » de Recette/ ouvre Recette/jeu.html, qui se charge sans erreur ni requête externe', async ({ page }) => {
  const { problems, external } = watch(page);
  await page.goto(`${FULL}Recette/`);
  await page.getByRole('link', { name: 'Jouer' }).click();
  await expect(page).toHaveURL(`${FULL}Recette/jeu.html`);
  await expect(page.locator('canvas').first()).toBeAttached({ timeout: 30_000 });
  await page.waitForLoadState('networkidle');
  expect(external).toEqual([]);
  expect(problems).toEqual([]);
});

test('next/ mène à dev/jeu.html, et « Dernier build de développement » aussi : le jeu de dev se charge sans erreur ni requête externe', async ({ page }) => {
  const { problems, external } = watch(page);
  await page.goto(`${FULL}next/`);
  await expect(page).toHaveURL(`${FULL}dev/jeu.html`);
  await expect(page.locator('canvas').first()).toBeAttached({ timeout: 30_000 });
  await page.waitForLoadState('networkidle');
  expect(external).toEqual([]);
  expect(problems).toEqual([]);
  await page.goto(`${FULL}Recette/`);
  await page.getByRole('link', { name: /Dernier build de développement/ }).click();
  await expect(page).toHaveURL(`${FULL}dev/jeu.html`);
});

test('racine : page autonome — une seule requête (le document), icône en ligne, ni feuille de style, ni script, ni image ; titre « Z-Survival · en construction »', async ({ page }) => {
  const requests = [];
  page.on('request', (r) => !r.url().startsWith('data:') && requests.push(r.url()));
  await page.goto(FULL);
  await page.waitForLoadState('networkidle');
  expect(requests).toEqual([FULL]);
  await expect(page).toHaveTitle('Z-Survival · en construction');
  expect(await page.locator('link[rel="icon"]').getAttribute('href')).toMatch(/^data:image\/png;base64,/);
  await expect(page.locator('link[rel="stylesheet"], script, img')).toHaveCount(0);
  const colors = await page.evaluate(() => [getComputedStyle(document.body).color, getComputedStyle(document.body).backgroundColor]);
  expect(colors[0]).not.toBe(colors[1]);
});

test('redirections : rafraîchissement immédiat (0 s) vers une adresse relative, lien visible identique, aucune ressource externe', async ({ request }) => {
  const html = async (path) => (await request.get(`${FULL}${path}`)).text();
  expect(await html('next/')).toContain('<meta http-equiv="refresh" content="0; url=../dev/jeu.html">');
  expect(await html('lots/')).toContain('<meta http-equiv="refresh" content="0; url=../Recette/">');
  expect(await html('dev/')).toContain('<meta http-equiv="refresh" content="0; url=../Recette/">');
  expect(await html('dev/')).not.toContain('js/accueil/main.js');
  expect(await html('')).not.toContain('http-equiv="refresh"');
  for (const path of ['', 'next/', 'lots/', 'dev/']) expect(await html(path), path).not.toMatch(/(?:href|src)="(?:https?:|\/)/);
});

test('bare/ (sans dev ni archive) : dev/ dit « Aucun build de développement pour l\'instant », next/ y mène, versions précédentes indisponibles', async ({ page, request }) => {
  const info = await (await request.get(`${BARE}Recette/site-info.json`)).json();
  expect(info.precedentes.map((p) => p.status)).toEqual(['indisponible', 'indisponible', 'indisponible', 'indisponible', 'indisponible', 'indisponible']); // lot 5p : V0.6 à V0.1 (avant : 5) ; lot 5f : V0.5 à V0.1 (avant : 4)
  expect(info.evolutions).toEqual([]);
  await page.goto(`${BARE}next/`);
  await expect(page).toHaveURL(`${BARE}dev/`);
  await expect(page.getByText('Aucun build de développement pour l\'instant')).toBeVisible();
  for (const id of ['v0.1', 'v0.2', 'v0.3', 'v0.4', 'v0.5', 'v0.6']) expect((await request.get(`${BARE}${id}/jeu.html`)).status(), id).toBe(404); // lot 5p : v0.6 ajoutée
});

test('many/ : 12 versions précédentes publiées (v0.12 à v0.1), chaque archive répond ; Recette V0.13 ; aucune évolution (v0.6 publiée)', async ({ request }) => {
  const info = await (await request.get(`${MANY}Recette/site-info.json`)).json();
  expect(info.recette.label).toBe('V0.13');
  expect(info.precedentes.map((p) => p.entry)).toEqual(Array.from({ length: 12 }, (_, i) => `../v0.${12 - i}/jeu.html`));
  expect(info.evolutions).toEqual([]);
  for (const p of info.precedentes) expect((await request.get(new URL(p.entry, `${MANY}Recette/`).href)).status(), p.id).toBe(200);
});

test('sans build de développement (bare/) : « Aucun build de développement pour l\'instant » en texte non cliquable', async ({ page }) => {
  await page.goto(`${BARE}Recette/`);
  await expect(page.locator('#dev-none')).toHaveText('Aucun build de développement pour l\'instant');
  await expect(page.locator('#dev-none')).toBeVisible();
  await expect(page.getByRole('link', { name: /Dernier build de développement/ })).toBeHidden();
  await expect(page.locator('#evolutions-none')).toBeVisible();
});

test('site-info.json invalide : message sobre, liens statiques (jeu.html, ../dev/jeu.html), listes masquées, console vide ; absent : aucune erreur de page', async ({ page }) => {
  const { problems, external } = watch(page);
  await page.route(`${FULL}Recette/site-info.json`, (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '{ invalide' }));
  await page.goto(`${FULL}Recette/`);
  await expect(page.locator('#site-notice')).toHaveText('Informations du site indisponibles : les liens directs restent utilisables.');
  // Lot 5i : bandeau « Recette » seul (avant : « Recette · version inconnue ») ; sans version connue, le bouton dit « Jouer » ; #versions-section (avant : #previous-section).
  await expect(page.locator('#version')).toHaveText('Recette');
  await expect(page.getByRole('link', { name: 'Jouer', exact: true })).toHaveAttribute('href', 'jeu.html');
  await expect(page.getByRole('link', { name: 'Dernier build de développement' })).toHaveAttribute('href', '../dev/jeu.html');
  await expect(page.locator('#evolutions-section')).toBeHidden();
  await expect(page.locator('#versions-section')).toBeHidden();
  await page.waitForLoadState('networkidle');
  expect(problems).toEqual([]);
  expect(external).toEqual([]);
  // Fichier absent (404) : seule la requête en échec est signalée par le navigateur ; aucune erreur de script.
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.unrouteAll();
  await page.route(`${FULL}Recette/site-info.json`, (route) => route.fulfill({ status: 404, body: '' }));
  await page.goto(`${FULL}Recette/`);
  await expect(page.locator('#site-notice')).toBeVisible();
  expect(errors).toEqual([]);
});

test('clavier : Tab atteint « Jouer », le dernier build, la région des évolutions et celle de toutes les versions, avec un focus visible', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${FULL}Recette/`);
  await expect(page.locator('#app')).toBeVisible();
  const reached = [];
  for (let i = 0; i < 6; i += 1) {
    await page.keyboard.press('Tab');
    reached.push(await page.evaluate(() => [document.activeElement.id, getComputedStyle(document.activeElement).outlineStyle]));
  }
  const ids = reached.map(([id]) => id);
  for (const id of ['play', 'dev-link', 'evolutions-region', 'versions-region']) expect(ids, id).toContain(id); // lot 5i : avant previous-region
  for (const [id, outline] of reached.filter(([id]) => id)) expect(outline, id).not.toBe('none');
});

test('sans JavaScript : message bilingue et liens statiques vers jeu.html et ../dev/jeu.html, de 44 px', async () => {
  const browser = await chromium.launch({ channel: process.env.CI ? 'chrome' : undefined, args: ['--blink-settings=scriptEnabled=false'] });
  const page = await browser.newPage({ locale: 'fr-FR', viewport: { width: 667, height: 375 } });
  await page.goto(`${FULL}Recette/`);
  await expect(page.locator('#app')).toBeHidden();
  // Le moteur de texte de Playwright ignore <noscript> : lecture directe du rendu (innerText) et des liens.
  const text = (await page.evaluate(() => document.body.innerText)).trim();
  expect(text.split('\n').map((l) => l.trim()).filter(Boolean)).toEqual(['Ce jeu a besoin de JavaScript. / This game needs JavaScript.', 'Jouer / Play', 'Dernier build de développement / Latest development build']);
  const links = await page.evaluate(() => [...document.querySelectorAll('a')].filter((a) => a.offsetParent).map((a) => [a.getAttribute('href'), Math.round(a.getBoundingClientRect().height)]));
  expect(links.map(([href]) => href)).toEqual(['jeu.html', '../dev/jeu.html']);
  for (const [href, height] of links) expect(height, href).toBeGreaterThanOrEqual(44);
  await browser.close();
});
