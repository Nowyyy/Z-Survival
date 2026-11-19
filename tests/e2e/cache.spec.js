// Lot 9f (Docs/ref/cache.md) : cache des navigateurs, sur le site assemblé de test (scripts/site/e2e-site.mjs, http://127.0.0.1:4174/ ;
// Recette = build à l'empreinte fedcba9, dev = build à l'empreinte abcdef1, comme leurs build-info.json).
// Réécriture complète : chaque requête vers un fichier du jeu porte la version du déploiement, aucun fichier n'est chargé sous deux adresses.
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { createServer } from 'node:http';
import { CACHE_SHAS, DEV_SHA, MAIN_SHA } from '../../scripts/site/e2e-site.mjs';

const SITE = 'http://127.0.0.1:4174';
const TAILLE = { width: 932, height: 430 };

test.skip(({ isMobile }) => isMobile, 'bureau : site construit (l\'accueil au téléphone : publication.spec.js)');

// Requêtes de la page vers le dossier publié (dossier : 'full/Recette/'), hors navigations (pages .html, dossiers).
function suivre(page, dossier) {
  const fichiers = [];
  const externes = [];
  page.on('request', (r) => {
    const url = new URL(r.url());
    if (url.protocol === 'data:' || url.protocol === 'blob:') return;
    if (url.origin !== SITE) {
      externes.push(r.url());
      return;
    }
    if (!url.pathname.startsWith(`/${dossier}`) || url.pathname.endsWith('/') || url.pathname.endsWith('.html')) return;
    fichiers.push({ chemin: url.pathname.slice(dossier.length + 1), v: url.searchParams.getAll('v') });
  });
  return { fichiers, externes };
}

function verifier({ fichiers, externes }, version) {
  expect(fichiers.length).toBeGreaterThan(20);
  const sans = fichiers.filter((f) => f.v.length !== 1 || f.v[0] !== version).map((f) => `${f.chemin} v=${f.v.join(',')}`);
  expect(sans, 'requêtes sans la version du déploiement').toEqual([]);
  const versions = new Map();
  for (const f of fichiers) versions.set(f.chemin, new Set([...(versions.get(f.chemin) ?? []), f.v.join(',')]));
  expect([...versions].filter(([, v]) => v.size > 1).map(([c]) => c), 'fichier chargé sous deux adresses').toEqual([]);
  expect(externes).toEqual([]);
}

test('Recette : accueil, menu, « JOUER » et partie : chaque fichier porte ?v=<version du déploiement>, une seule adresse par fichier', async ({ page }) => {
  await page.setViewportSize(TAILLE);
  const suivi = suivre(page, 'full/Recette/');
  await page.goto(`${SITE}/full/Recette/`);
  await expect(page.locator('#play')).toHaveText(/Jouer/);
  await page.goto(`${SITE}/full/Recette/jeu.html?test=1&menu=1&seed=1`);
  await page.locator('#menu-jouer').click({ timeout: 60_000 });
  await page.waitForFunction(() => (window.__zs?.getState()?.time ?? 0) > 0.05, null, { timeout: 60_000 });
  await page.goto(`${SITE}/full/Recette/jeu.html?test=1&seed=1&nospawn=1`);
  await page.waitForFunction(() => (window.__zs?.getState()?.time ?? 0) > 0.05, null, { timeout: 60_000 });
  verifier(suivi, MAIN_SHA.slice(0, 7));
  expect(suivi.fichiers.map((f) => f.chemin)).toEqual(expect.arrayContaining(['vendor/three/three.module.js', 'vendor/three/three.core.js', 'js/menu/demarrage.js', 'css/menu.css', 'data/i18n/fr.json', 'fonts/barlow-latin-400-normal.woff2']));
});

test('dev : menu et onglets préchargés : chaque fichier porte la version de dev', async ({ page }) => {
  await page.setViewportSize(TAILLE);
  const suivi = suivre(page, 'full/dev/');
  await page.goto(`${SITE}/full/dev/jeu.html?test=1&menu=1&seed=1`);
  await expect(page.locator('#menu-jouer')).toBeVisible({ timeout: 60_000 });
  await page.waitForFunction(() => window.__zsMenu?.etat()?.menu !== null && !document.getElementById('e7'));
  for (const onglet of ['boutique', 'infini']) {
    const bouton = page.locator(`#menu-onglet-${onglet}`);
    if (await bouton.count()) {
      await bouton.dispatchEvent('pointerdown');
      await bouton.click();
    }
  }
  await page.waitForLoadState('networkidle');
  verifier(suivi, DEV_SHA.slice(0, 7));
  expect(suivi.fichiers.map((f) => f.chemin)).toEqual(expect.arrayContaining(['js/menu/boutique.js', 'data/menu/caisses.json']));
});

// --- Scénario réel de cache ----------------------------------------------------------------------------------------------------------------
// Mandataire « GitHub Pages » : /Z-Survival/… sert le déploiement courant (cache-a = version N, cache-b = version N+1 du site de test) avec
// Cache-Control: max-age=600, en ignorant la chaîne de requête comme le CDN de Pages ; chaque requête reçue est notée (journal).
const N = CACHE_SHAS.a.slice(0, 7);
const N1 = CACHE_SHAS.b.slice(0, 7);
const mandataire = { deploiement: 'a', journal: [], shaForce: null, port: 0, serveur: null };
test.beforeAll(async () => {
  mandataire.serveur = createServer(async (req, res) => {
    const url = new URL(req.url, 'http://mandataire');
    mandataire.journal.push(`${url.pathname}${url.search}`);
    if (!url.pathname.startsWith('/Z-Survival/')) {
      res.writeHead(404).end();
      return;
    }
    const amont = await fetch(`${SITE}/cache-${mandataire.deploiement}/${url.pathname.slice('/Z-Survival/'.length)}`);
    let corps = Buffer.from(await amont.arrayBuffer());
    if (mandataire.shaForce && url.pathname.endsWith('/build-info.json')) corps = Buffer.from(JSON.stringify({ ...JSON.parse(corps), sha: mandataire.shaForce }));
    res.writeHead(amont.status, { 'content-type': amont.headers.get('content-type') ?? 'application/octet-stream', 'cache-control': 'max-age=600' });
    res.end(corps);
  });
  await new Promise((ok) => mandataire.serveur.listen(0, '127.0.0.1', ok));
  mandataire.port = mandataire.serveur.address().port;
});
test.afterAll(() => mandataire.serveur?.close());
test.beforeEach(() => {
  mandataire.deploiement = 'a';
  mandataire.shaForce = null;
});

const P = () => `http://127.0.0.1:${mandataire.port}/Z-Survival/`;
const versionDe = (page) => page.evaluate(() => document.querySelector('meta[name="zs-version"]')?.content ?? null);
const recus = (motif) => mandataire.journal.filter((l) => motif.test(l)).length;
// Requêtes externes de la page (hors data: et blob:).
function versionsDemandees(page) {
  const externes = [];
  page.on('request', (r) => {
    const url = new URL(r.url());
    if (url.protocol !== 'data:' && url.protocol !== 'blob:' && url.origin !== `http://127.0.0.1:${mandataire.port}`) externes.push(r.url());
  });
  return { externes };
}
// Chargements de document du cadre principal (le retrait des paramètres par history.replaceState n'en est pas un).
function compterNavigations(page) {
  const n = { v: 0 };
  page.on('request', (r) => {
    if (r.isNavigationRequest() && r.frame() === page.mainFrame()) n.v += 1;
  });
  return n;
}
// Fichiers du jeu chargés par le document courant (minutage des ressources : cache compris), « chemin v=<version> ».
const ressources = (page) => page.evaluate(() => performance.getEntriesByType('resource').map((e) => new URL(e.name))
  .filter((u) => u.protocol.startsWith('http') && !u.pathname.endsWith('/') && !u.pathname.endsWith('.html'))
  .map((u) => `${u.pathname.split('/').slice(3).join('/')} v=${u.searchParams.get('v')}`));
const stockageVide = async (page, context) => {
  expect(await page.evaluate(async () => [localStorage.length, sessionStorage.length, document.cookie, (await indexedDB.databases()).length])).toEqual([0, 0, '', 0]);
  expect(await context.cookies()).toEqual([]);
};

test.describe.serial('scénario réel de cache (mandataire max-age=600, déploiement N puis N+1)', () => {
  test('lien de l\'accueil après un déploiement : toute la version N+1 (page, modules, données, styles), sans rechargement ; même chose pour « Dernier build de développement »', async ({ browser }) => {
    const context = await browser.newContext({ viewport: TAILLE });
    const page = await context.newPage();
    await page.goto(`${P()}Recette/`);
    await expect(page.locator('#play')).toHaveText(/Jouer/);
    await page.locator('#play').click();
    await page.waitForURL(/\/Recette\/jeu\.html$/); // r retiré de l'adresse par jeu.html
    expect(await versionDe(page)).toBe(N);
    await page.waitForLoadState('networkidle');
    mandataire.deploiement = 'b'; // déploiement N+1
    const accueils = recus(/^\/Z-Survival\/Recette\/$/);
    await page.goto(`${P()}Recette/`);
    expect(recus(/^\/Z-Survival\/Recette\/$/), 'accueil N servi par le cache du navigateur (scénario réel)').toBe(accueils);
    const suivi = versionsDemandees(page);
    const nav = compterNavigations(page);
    await page.locator('#play').click();
    await page.waitForURL(/\/Recette\/jeu\.html$/);
    expect(await versionDe(page)).toBe(N1);
    expect(recus(/^\/Z-Survival\/Recette\/jeu\.html\?r=\d+$/)).toBe(2); // page relue à chaque clic
    await page.waitForLoadState('networkidle');
    expect(nav.v, 'aucun rechargement de version').toBe(1);
    expect(await page.evaluate(() => document.documentElement.getAttribute('data-zs-rv'))).toBe(null);
    const apres = await ressources(page);
    expect(apres.length).toBeGreaterThan(10);
    expect(apres.filter((l) => !l.endsWith(` v=${N1}`)), 'fichiers de la version N chargés par la page N+1').toEqual([]);
    expect(apres.some((l) => l.startsWith('css/'))).toBe(true);
    expect(apres.some((l) => l.startsWith('data/'))).toBe(true);
    // « Dernier build de développement » (version inconnue à la construction de main) : relu lui aussi.
    await page.goto(`${P()}Recette/`);
    await page.locator('#dev-link').click();
    await page.waitForURL(/\/dev\/jeu\.html$/);
    expect(await versionDe(page)).toBe(N1);
    expect(recus(/^\/Z-Survival\/dev\/jeu\.html\?r=\d+$/)).toBe(1);
    expect(suivi.externes).toEqual([]);
    await stockageVide(page, context);
    await context.close();
  });

  test('ancienne jeu.html ouverte depuis le cache : vérification, un seul rechargement (rv=1), puis N+1 ; aucune écriture, aucune requête externe', async ({ browser }) => {
    const context = await browser.newContext({ viewport: TAILLE });
    const page = await context.newPage();
    await page.goto(`${P()}Recette/jeu.html`);
    expect(await versionDe(page)).toBe(N);
    await page.waitForLoadState('networkidle');
    mandataire.deploiement = 'b';
    const pages = recus(/^\/Z-Survival\/Recette\/jeu\.html$/);
    const suivi = versionsDemandees(page);
    const nav = compterNavigations(page);
    await page.goto(`${P()}Recette/jeu.html`);
    await page.waitForFunction((v) => document.querySelector('meta[name="zs-version"]')?.content === v, N1, { timeout: 30_000 });
    expect(recus(/^\/Z-Survival\/Recette\/jeu\.html$/), 'page N servie par le cache du navigateur').toBe(pages);
    expect(recus(/^\/Z-Survival\/Recette\/jeu\.html\?rv=1&r=\d+$/)).toBe(1);
    expect(page.url()).toBe(`${P()}Recette/jeu.html`);
    expect(await page.evaluate(() => document.documentElement.getAttribute('data-zs-rv'))).toBe('1');
    await page.waitForLoadState('networkidle');
    expect(nav.v, 'page en cache, puis un seul rechargement').toBe(2);
    const n1 = await ressources(page);
    expect(n1.length).toBeGreaterThan(10);
    expect(n1.filter((l) => !l.endsWith(` v=${N1}`)), 'après le rechargement : version N+1 seulement').toEqual([]);
    expect(suivi.externes).toEqual([]);
    await stockageVide(page, context);
    await context.close();
  });

  test('aucune boucle : build-info.json annonce toujours une autre version (CDN en retard) : un seul rechargement, puis la page reste', async ({ browser }) => {
    const context = await browser.newContext({ viewport: TAILLE });
    const page = await context.newPage();
    mandataire.deploiement = 'b';
    mandataire.shaForce = 'fffffff';
    const nav = compterNavigations(page);
    await page.goto(`${P()}Recette/jeu.html?test=1&menu=1&seed=1`);
    await expect(page.locator('#menu-jouer')).toBeVisible({ timeout: 60_000 });
    await page.waitForLoadState('networkidle');
    expect(nav.v).toBe(2);
    expect(recus(/build-info\.json\?r=\d+&v=2222222$/)).toBeGreaterThanOrEqual(2);
    expect(page.url()).toBe(`${P()}Recette/jeu.html?test=1&menu=1&seed=1`);
    await stockageVide(page, context);
    await context.close();
  });

  test('retour au menu après un déploiement : bandeau « Nouvelle version disponible », jamais de rechargement imposé ; « Recharger » : version N+1', async ({ browser }) => {
    const context = await browser.newContext({ viewport: TAILLE });
    const page = await context.newPage();
    const nav = compterNavigations(page);
    await page.goto(`${P()}Recette/jeu.html?test=1&menu=1&seed=1`);
    await page.locator('#menu-jouer').click({ timeout: 60_000 });
    await page.waitForFunction(() => (window.__zs?.getState()?.time ?? 0) > 0.05, null, { timeout: 60_000 });
    await expect(page.locator('#maj-bandeau')).toHaveCount(0);
    mandataire.deploiement = 'b';
    await page.locator('#btn-pause').click();
    await page.locator('#btn-quit').click();
    await page.locator('#btn-quit-ok').click();
    await expect(page.locator('#menu-jouer')).toBeVisible({ timeout: 60_000 });
    await expect(page.locator('#maj-bandeau .maj-bandeau-texte')).toHaveText('Nouvelle version disponible');
    await expect(page.locator('#maj-bandeau-recharger')).toHaveText('Recharger');
    const boite = await page.locator('#maj-bandeau-recharger').boundingBox();
    expect(Math.min(boite.width, boite.height)).toBeGreaterThanOrEqual(44);
    expect((await new AxeBuilder({ page }).include('#maj-bandeau').analyze()).violations).toEqual([]);
    expect(nav.v, 'aucun rechargement imposé').toBe(1);
    expect(await versionDe(page)).toBe(N);
    const rechargements = /^\/Z-Survival\/Recette\/jeu\.html\?test=1&menu=1&seed=1&rv=1&r=\d+$/;
    const avant = recus(rechargements);
    await page.locator('#maj-bandeau-recharger').click();
    await page.waitForFunction((v) => document.querySelector('meta[name="zs-version"]')?.content === v, N1, { timeout: 30_000 });
    expect(recus(rechargements) - avant).toBe(1);
    await expect(page.locator('#menu-jouer')).toBeVisible({ timeout: 60_000 });
    expect(page.url()).toBe(`${P()}Recette/jeu.html?test=1&menu=1&seed=1`); // rv, r et #retour retirés
    await expect(page.locator('#maj-bandeau')).toHaveCount(0);
    await context.close();
  });
});

test('adresses : partie directe et paramètres de test inchangés avec v, r, rv, retirés de l\'adresse (site construit et source)', async ({ page, baseURL }) => {
  await page.setViewportSize(TAILLE);
  for (const base of [`${SITE}/full/dev/`, `${baseURL}/`]) {
    await page.goto(`${base}jeu.html?test=1&seed=1&wave=3&v=abc1234&r=1700000000000&rv=1`);
    await page.waitForFunction(() => (window.__zs?.getState()?.time ?? 0) > 0.05, null, { timeout: 60_000 });
    expect(page.url()).toBe(`${base}jeu.html?test=1&seed=1&wave=3`);
    expect(await page.evaluate(() => window.__zs.getState().waves.wave)).toBe(3);
    await page.goto(`${base}jeu.html?test=1&menu=1&seed=1&r=5&v=x`);
    await expect(page.locator('#menu-jouer')).toBeVisible({ timeout: 60_000 });
    expect(page.url()).toBe(`${base}jeu.html?test=1&menu=1&seed=1`);
    expect(await page.evaluate(() => window.__zsMenu.etat().phase)).toBe('menu');
  }
});
