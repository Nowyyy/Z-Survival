// Lot 5o : configuration Playwright des preuves « deux onglets » (scripts/tests/preuve-onglets.mjs). Même configuration que playwright.config.js, mais le
// navigateur est celui de la CI (canal « chrome ») même hors CI, et seul le projet bureau est gardé. Jamais lancée par la CI.
import base from '../../playwright.config.js';

const bureau = base.projects.find((p) => p.name === 'bureau');
export default {
  ...base,
  testDir: '../../tests/e2e',
  retries: 0,
  // Seul le serveur du jeu (le site assemblé de publication.spec.js est inutile ici), lancé depuis la racine de cette copie du dépôt.
  webServer: [{ ...base.webServer[0], cwd: new URL('../../', import.meta.url).pathname }],
  projects: [{ ...bureau, testMatch: ['**/argent.spec.js'], use: { ...bureau.use, channel: process.env.ONGLETS_CANAL ?? 'chrome' } }],
};
