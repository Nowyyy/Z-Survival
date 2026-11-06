// Lot 4c : publication par versions ; lot 5g : nouvelle organisation, sur le site assemblé de test (scripts/site/e2e-site.mjs, http://127.0.0.1:4174/) :
// full/ = racine « en construction » + Recette/ (build courant) + dev/ (le même build, canal dev) + archives fictives v0.2 à v0.4 + v0.1 indisponible ;
// bare/ = Recette/ seule (ni dev, ni archive) ; many/ = 13 versions fictives (12 précédentes). Chaque site vit dans un sous-dossier (comme /Z-Survival/).
// Dans la suite rapide (ESSENTIAL de playwright.config.js), à 667×375, 1440×900 et 375×812. Le lot 5g reprend ici les garde-fous de l'ancien dev.spec
// (journal des versions supprimé) : axe, cibles de 44 px, console propre, aucune requête externe, aucun débordement, page en français.
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const SITE = 'http://127.0.0.1:4174';
const FULL = `${SITE}/full/`;
const BARE = `${SITE}/bare/`;
const MANY = `${SITE}/many/`;
const VIEWPORTS = [{ width: 667, height: 375 }, { width: 1440, height: 900 }, { width: 375, height: 812 }];

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

    test('next/ mène à dev/jeu.html (qui se charge), lots/ et dev/ à Recette/ ; aucune erreur, aucune requête externe', async ({ page }) => {
      const { problems, external } = watch(page);
      await page.goto(`${FULL}next/`);
      await expect(page).toHaveURL(`${FULL}dev/jeu.html`);
      // Le jeu affiche d'abord son écran de préparation (textures et sons) : jusqu'à 30 s en rendu logiciel sous charge.
      await expect(page.locator('canvas').first()).toBeAttached({ timeout: 30_000 });
      await page.waitForLoadState('networkidle');
      expect(external).toEqual([]);
      expect(problems).toEqual([]);
      for (const path of ['lots/', 'dev/']) {
        await page.goto(`${FULL}${path}`);
        await expect(page, path).toHaveURL(`${FULL}Recette/`);
      }
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

test('adresses absentes : /recette/ (minuscules), /jeu.html et /versions.json à la racine, lots/lot-*, lots.json, dev/jeu.html sans build : 404', async ({ request }) => {
  for (const path of ['recette/', 'recette/jeu.html', 'jeu.html', 'versions.json', 'build-info.json', 'icone.png', 'lots/lot-4b/', 'lots/lot-1/jeu.html', 'lots.json', 'Recette/dev/', 'Recette/next/']) {
    expect((await request.get(`${FULL}${path}`)).status(), path).toBe(404);
  }
  expect((await request.get(`${BARE}dev/jeu.html`)).status()).toBe(404);
});

test('Recette/ sert versions.json, build-info.json (release) et site-info.json ; dev/ sert build-info.json (dev) ; archives : build-info.json', async ({ request }) => {
  expect((await (await request.get(`${FULL}Recette/versions.json`)).json()).latest).toBe('v0.5');
  expect(await (await request.get(`${FULL}Recette/build-info.json`)).json()).toMatchObject({ channel: 'release', version: 'V0.5', branch: 'main' });
  const info = await (await request.get(`${FULL}Recette/site-info.json`)).json();
  expect(info).toMatchObject({ schema: 1, recette: { label: 'V0.5', entry: 'jeu.html' }, dev: { present: true, sha: 'abcdef1', entry: '../dev/jeu.html' } });
  expect(info.precedentes.map((p) => p.label)).toEqual(['V0.4', 'V0.3', 'V0.2', 'V0.1']);
  expect(info.evolutions.length).toBeGreaterThan(0);
  expect(await (await request.get(`${FULL}dev/build-info.json`)).json()).toMatchObject({ channel: 'dev', sha: 'abcdef1' });
  expect(await (await request.get(`${FULL}v0.4/build-info.json`)).json()).toMatchObject({ channel: 'archive', version: 'V0.4' });
  expect((await (await request.get(`${BARE}Recette/site-info.json`)).json()).dev).toEqual({ present: false, sha: '', date: '', entry: '../dev/jeu.html' });
  expect((await (await request.get(`${MANY}Recette/site-info.json`)).json()).precedentes).toHaveLength(12);
});

test('archives v0.2 à v0.4 : chaque entrée se charge sans ressource manquante, sans requête externe ni stockage', async ({ page, context }) => {
  for (const id of ['v0.4', 'v0.3', 'v0.2']) {
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

test('Recette/jeu.html (« Jouer ») se charge sans erreur ni requête externe', async ({ page }) => {
  const { problems, external } = watch(page);
  await page.goto(`${FULL}Recette/jeu.html`);
  await expect(page.locator('canvas').first()).toBeAttached({ timeout: 30_000 });
  await page.waitForLoadState('networkidle');
  expect(external).toEqual([]);
  expect(problems).toEqual([]);
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
  expect(info.precedentes.map((p) => p.status)).toEqual(['indisponible', 'indisponible', 'indisponible', 'indisponible']);
  expect(info.evolutions).toEqual([]);
  await page.goto(`${BARE}next/`);
  await expect(page).toHaveURL(`${BARE}dev/`);
  await expect(page.getByText('Aucun build de développement pour l\'instant')).toBeVisible();
  for (const id of ['v0.1', 'v0.2', 'v0.3', 'v0.4']) expect((await request.get(`${BARE}${id}/jeu.html`)).status(), id).toBe(404);
});

test('many/ : 12 versions précédentes publiées (v0.12 à v0.1), chaque archive répond ; Recette V0.13 ; aucune évolution (v0.6 publiée)', async ({ request }) => {
  const info = await (await request.get(`${MANY}Recette/site-info.json`)).json();
  expect(info.recette.label).toBe('V0.13');
  expect(info.precedentes.map((p) => p.entry)).toEqual(Array.from({ length: 12 }, (_, i) => `../v0.${12 - i}/jeu.html`));
  expect(info.evolutions).toEqual([]);
  for (const p of info.precedentes) expect((await request.get(new URL(p.entry, `${MANY}Recette/`).href)).status(), p.id).toBe(200);
});
