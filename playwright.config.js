import { defineConfig, devices } from '@playwright/test';

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
    { name: 'mobile', use: { ...devices['Pixel 5'], viewport: { width: 375, height: 812 } } },
    { name: 'bureau', use: { viewport: { width: 1440, height: 900 } } },
  ],
});
