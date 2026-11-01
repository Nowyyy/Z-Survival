import { defineConfig, devices } from '@playwright/test';

// En CI, on pilote le Chrome déjà installé sur le runner : aucune installation de navigateur.
const channel = process.env.CI ? 'chrome' : undefined;

// Par défaut (`npm run test:e2e`, aussi en CI) : seulement les tests essentiels, environ 5 minutes. Les fonctionnalités stables (étage et escaliers, zones et portes, fenêtres et
// planches, chutes, statistiques, vagues, sons, textures, rendu 3D, personnages, monde) sont couvertes par Vitest ; leurs tests de bout en bout restent dans tests/e2e/ et se
// lancent à la demande avec `npm run test:e2e:full` (environ 40 minutes). Le projet mobile ne passe que les pages courtes qui dépendent du téléphone.
const FULL = process.env.E2E_FULL === '1';
const files = (names) => (FULL ? undefined : names.map((n) => `**/${n}.spec.js`));
const ESSENTIAL = ['attente', 'dev', 'carte', 'sons-page', 'sauvegarde', 'argent', 'jeu-interface'];
const PAGES = ['attente', 'dev', 'sauvegarde', 'sons-page'];

export default defineConfig({
  testDir: 'tests/e2e',
  // Rendu logiciel (CI, WebGL sans GPU) : depuis les textures du lot 1c une image y dure parfois plusieurs secondes ; 60 s au lieu de 30 s.
  timeout: 60_000,
  fullyParallel: true,
  // En CI (rendu logiciel, runner chargé), un test qui échoue est rejoué une fois : un échec isolé ne fait plus tomber toute la suite.
  retries: process.env.CI ? 1 : 0,
  reporter: 'list',
  use: { baseURL: 'http://localhost:4173', locale: 'fr-FR' },
  webServer: {
    command: 'node scripts/serve.mjs',
    url: 'http://localhost:4173',
    reuseExistingServer: !process.env.CI,
  },
  projects: [
    { name: 'mobile', testMatch: files(PAGES), use: { ...devices['Pixel 5'], channel, viewport: { width: 375, height: 812 } } },
    { name: 'bureau', testMatch: files(ESSENTIAL), use: { channel, viewport: { width: 1440, height: 900 } } },
  ],
});
