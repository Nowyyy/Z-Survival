// Captures de contrôle du lot 3g (non versionnées) : 10 points de vue de la visite (sans zombie) à 667 × 375 et 1440 × 900.
// Usage : BASE=http://localhost:4173 node scripts/modele/captures.mjs <dossier de sortie> [paramètres ajoutés, ex. "&detail=0"]
import { mkdirSync } from 'node:fs';
import { chromium } from '@playwright/test';

const BASE = process.env.BASE ?? 'http://localhost:4173';
const OUT = process.argv[2] ?? 'captures';
const EXTRA = process.argv[3] ?? '';
const U = (px) => px * 5 + 800;
const VIEWS = [
  { id: '01-grande-salle', at: [U(300), U(300)] },
  { id: '02-poche', at: [U(80), U(270)] },
  { id: '03-aile', at: [U(110), U(120)] },
  { id: '04-fenetre-sud-F6', at: [U(311), U(338)] },
  { id: '05-fenetre-nord-F4', at: [U(326), U(242)] },
  { id: '06-zoom1-rdc', at: null, url: '&zoom=1' },
  { id: '07-exterieur-route', at: [U(300), U(385)] },
  { id: '08-etage-gauche', at: [U(100), U(120)], url: '&floor=1' },
  { id: '09-etage-droit', at: [U(215), U(290)], url: '&floor=1' },
  { id: '10-zoom1-etage', at: null, url: '&floor=1&zoom=1' },
];
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch();
for (const size of [{ width: 667, height: 375 }, { width: 1440, height: 900 }]) {
  const page = await browser.newPage({ viewport: size });
  for (const v of VIEWS) {
    await page.goto(`${BASE}/jeu.html?test=1&seed=1&vhs=0&nospawn=1&wave=31${v.url ?? ''}${EXTRA}`);
    await page.waitForFunction(() => window.__zs?.getState, null, { timeout: 120000 });
    await page.evaluate(() => { window.requestAnimationFrame = () => 0; });
    await page.evaluate((at) => {
      const zs = window.__zs;
      zs.step(0.05);
      if (at) zs.setPlayer(at[0], at[1]);
      zs.setInput({ aim: { angle: -Math.PI / 4 } });
      zs.step(0.3);
      zs.sampleScreen(0, 0, 4, 4);
    }, v.at);
    await page.screenshot({ path: `${OUT}/${v.id}-${size.width}.png` });
  }
  await page.close();
}
await browser.close();
console.log(`Captures écrites dans ${OUT}/ (${VIEWS.length * 2})`);
