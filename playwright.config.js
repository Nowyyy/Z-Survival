import { readFileSync } from 'node:fs';
import { defineConfig, devices } from '@playwright/test';

// En CI, on pilote le Chrome déjà installé sur le runner : aucune installation de navigateur.
const channel = process.env.CI ? 'chrome' : undefined;

// Par défaut (`npm run test:e2e`, aussi en CI) : seulement les tests essentiels, environ 5 minutes. Les fonctionnalités stables (étage et escaliers, zones et portes, fenêtres et
// planches, chutes, statistiques, vagues, sons, textures, rendu 3D, personnages, monde) sont couvertes par Vitest ; leurs tests de bout en bout restent dans tests/e2e/ et se
// lancent à la demande avec `npm run test:e2e:full` (environ 40 minutes). Le projet mobile ne passe que les pages courtes qui dépendent du téléphone.
const FULL = process.env.E2E_FULL === '1';
const files = (names) => (FULL ? undefined : names.map((n) => `**/${n}.spec.js`));
const ESSENTIAL = ['attente', 'carte', 'sons-page', 'sauvegarde', 'argent', 'jeu-interface', 'atelier-retours', 'interface-integree', 'persos-integres', 'publication']; // lot 4c : publication par versions (site assemblé de test ; lot 5g : dev retiré avec le journal, ses garde-fous sont dans publication) ; lot 3g : retours du propriétaire (portes, mur percé, escaliers) ; lot 3l : interface intégrée ; lot 3m : personnages intégrés
const PAGES = ['attente', 'sauvegarde', 'sons-page']; // lot 5g : dev (journal des versions) retiré
// Lot 4e (décision D) : en mode complet, le projet mobile ne joue plus que les garde-fous et les tests P (liste « garde-fous » de
// tests/selection.json : fichiers entiers, ou tests G et P d'autres fichiers par leur motif) ; les tests de règles ne tournent qu'en bureau.
// grep de Playwright : « projet fichier describe titre » (fichier relatif à tests/e2e).
const GARDES = JSON.parse(readFileSync('tests/selection.json', 'utf8'))['garde-fous'].filter((g) => g.fichier.startsWith('tests/e2e/'));
const nomFichier = (f) => f.slice('tests/e2e/'.length).replace(/[.]/g, '\\.');
const MOBILE_GREP = new RegExp(GARDES.map((g) => (g.motif ? `^mobile ${nomFichier(g.fichier)} .*(?:${g.motif})` : `^mobile ${nomFichier(g.fichier)} `)).join('|'), 'i');

export default defineConfig({
  testDir: 'tests/e2e',
  // Rendu logiciel (CI, WebGL sans GPU) : depuis les textures du lot 1c une image y dure parfois plusieurs secondes ; 60 s au lieu de 30 s.
  timeout: 60_000,
  // Lot 4e : tests indépendants (aucun hook partagé, aucun état de module) : répartis un par un entre workers et tranches.
  fullyParallel: true,
  // Lot 4e : en CI, workersCI de tests/budget.json (2) ; en local, la valeur par défaut de Playwright (inchangée).
  workers: process.env.CI ? JSON.parse(readFileSync('tests/budget.json', 'utf8')).workersCI : undefined,
  // En CI (rendu logiciel, runner chargé), un test qui échoue est rejoué une fois : un échec isolé ne fait plus tomber toute la suite.
  retries: process.env.CI ? 1 : 0,
  reporter: 'list',
  use: { baseURL: 'http://localhost:4173', locale: 'fr-FR' },
  webServer: [
    {
      command: 'node scripts/serve.mjs',
      url: 'http://localhost:4173',
      reuseExistingServer: !process.env.CI,
    },
    // Lot 4c : site assemblé de test (lot 5g : racine en construction, Recette/, dev/, redirections, archives fictives) pour tests/e2e/publication.spec.js, port 4174.
    {
      command: 'node scripts/site/e2e-site.mjs',
      url: 'http://127.0.0.1:4174/full/',
      reuseExistingServer: !process.env.CI,
    },
  ],
  projects: [
    { name: 'mobile', testMatch: files(PAGES), testIgnore: ['**/fumee.spec.js'], grep: FULL ? MOBILE_GREP : undefined, use: { ...devices['Pixel 5'], channel, viewport: { width: 375, height: 812 } } },
    { name: 'bureau', testMatch: files(ESSENTIAL), use: { channel, viewport: { width: 1440, height: 900 } } },
  ],
});
