// Lot 9f (Docs/ref/cache.md) : cache des navigateurs, sur le site assemblé de test (scripts/site/e2e-site.mjs, http://127.0.0.1:4174/ ;
// Recette = build à l'empreinte fedcba9, dev = build à l'empreinte abcdef1, comme leurs build-info.json).
// Réécriture complète : chaque requête vers un fichier du jeu porte la version du déploiement, aucun fichier n'est chargé sous deux adresses.
import { test, expect } from '@playwright/test';
import { DEV_SHA, MAIN_SHA } from '../../scripts/site/e2e-site.mjs';

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
