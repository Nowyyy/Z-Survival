// Contrôle du rendu (lot 5b-C) : six vues fixes (graine 1, step() seulement, 667 × 375), luminance moyenne et couleurs distinctes de l'écran entier
// (sampleScreen), pour comparer deux versions (--ref : référence ; --base : tête) ou deux préréglages (--gfx). Rendu logiciel : comparaison seulement.
// Usage : node scripts/perf/vues.mjs --ref http://localhost:4180 --base http://localhost:4173 [--gfx eleve] [--extra '&vhs=0']
// Critère du lot : luminance à moins de 3 % de la référence, aucune vue ne perd plus de 5 % de ses couleurs distinctes.
import { chromium } from '@playwright/test';

const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && i + 1 < args.length ? args[i + 1] : fallback;
};
const REF = opt('ref', 'http://localhost:4180');
const BASE = opt('base', 'http://localhost:4173');
const GFX = opt('gfx', null);
const EXTRA = opt('extra', '');
const U = (px) => px * 5 + 800;
const VIEWS = [
  { id: 'R1', url: '&nospawn=1', at: [U(300), U(300)], zombies: true },
  { id: 'R2', url: '&nospawn=1', at: [U(311), U(335)], zombies: true },
  { id: 'U1', url: '&nospawn=1&wave=21&floor=1', at: [U(100), U(120)], zombies: true, floor: 'etage', wave: 21 },
  { id: 'U4', url: '&nospawn=1&wave=31&floor=1', at: [U(215), U(290)], zombies: true, floor: 'etage', wave: 31 },
  { id: 'voiture', url: '&nospawn=1&wave=31', at: [3345 - 160, 2420 - 40], zombies: false },
  { id: 'helico', url: '&nospawn=1&wave=31', at: [1650 + 40, 1705 + 160], zombies: false },
];

const browser = await chromium.launch();
async function shoot(base, v, gfx) {
  const page = await browser.newPage({ viewport: { width: 667, height: 375 } });
  await page.addInitScript(() => Object.defineProperty(Document.prototype, 'hidden', { get: () => true, configurable: true }));
  await page.goto(`${base}/jeu.html?test=1&seed=1&vhs=0${gfx ? `&gfx=${gfx}` : ''}${v.url}${EXTRA}`);
  await page.waitForFunction(() => window.__zs, null, { timeout: 180000 });
  const r = await page.evaluate(({ at, zombies, floor, wave }) => {
    const zs = window.__zs;
    zs.step(0.05);
    zs.setPlayer(at[0], at[1]);
    zs.setInput({ aim: { angle: Math.PI } });
    const T = ['marcheur', 'petit', 'voute', 'grand'];
    if (zombies) for (let i = 0; i < 10; i += 1) zs.spawnEnemy(at[0] + 40 + (i % 5) * 30, at[1] + (Math.floor(i / 5) - 0.5) * 60, { type: T[i % 4], wave: wave ?? 10, floor: floor ?? 'rdc' });
    for (let i = 0; i < 20; i += 1) zs.step(0.05);
    return zs.sampleScreen(0, 0, innerWidth, innerHeight);
  }, v);
  await page.close();
  return r;
}
const rows = [];
let ok = true;
for (const v of VIEWS) {
  const a = await shoot(REF, v, null);
  const b = await shoot(BASE, v, GFX);
  const dl = (b.meanLuminance - a.meanLuminance) / Math.max(1e-6, a.meanLuminance);
  const dc = (b.distinctColors - a.distinctColors) / Math.max(1, a.distinctColors);
  const pass = Math.abs(dl) < 0.03 && dc > -0.05;
  ok &&= pass;
  rows.push(`| ${v.id} | ${a.meanLuminance.toFixed(4)} | ${b.meanLuminance.toFixed(4)} | ${(dl * 100).toFixed(2)} % | ${a.distinctColors} | ${b.distinctColors} | ${(dc * 100).toFixed(1)} % | ${pass ? 'oui' : 'NON'} |`);
}
console.log(['| Vue | Luminance réf. | Luminance | Écart | Couleurs réf. | Couleurs | Écart | Tenu |', '|---|---|---|---|---|---|---|---|', ...rows].join('\n'));
console.log(ok ? 'Critère tenu (luminance < 3 %, couleurs > −5 %).' : 'Critère NON tenu.');
await browser.close();
process.exit(ok ? 0 : 1);
