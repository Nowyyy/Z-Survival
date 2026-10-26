import { defineConfig, devices } from '@playwright/test';

// En CI, on pilote le Chrome déjà installé sur le runner : aucune installation de navigateur.
const channel = process.env.CI ? 'chrome' : undefined;

export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: true,
  reporter: 'list',
  use: { baseURL: 'http://localhost:4173', locale: 'fr-FR' },
  webServer: {
    command: 'node scripts/serve.mjs',
    url: 'http://localhost:4173',
    reuseExistingServer: !process.env.CI,
  },
  projects: [
    { name: 'mobile', use: { ...devices['Pixel 5'], channel, viewport: { width: 375, height: 812 } } },
    { name: 'bureau', use: { channel, viewport: { width: 1440, height: 900 } } },
  ],
});
