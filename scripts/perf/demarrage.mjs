// Démarrage d'une partie (lot 5b-G) : temps jusqu'à l'écran de préparation retiré et image la plus longue des 4 premières secondes de jeu (boucle
// d'images réelle, ?perf=1), pour comparer deux versions. RENDU LOGICIEL : comparaison relative seulement.
// Usage : node scripts/perf/demarrage.mjs --ref http://localhost:4180 --base http://localhost:4173 [--passes 5] [--extra '&gfx=moyen']
import { chromium } from '@playwright/test';

const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && i + 1 < args.length ? args[i + 1] : fallback;
};
const REF = opt('ref', 'http://localhost:4180');
const BASE = opt('base', 'http://localhost:4173');
const PASSES = Math.max(1, Number(opt('passes', '5')) || 5);
const EXTRA = opt('extra', '');
const median = (v) => {
  const s = v.filter(Number.isFinite).sort((a, b) => a - b);
  return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : null;
};
const browser = await chromium.launch();
async function run(base) {
  const page = await browser.newPage({ viewport: { width: 667, height: 375 } });
  const t0 = Date.now();
  await page.goto(`${base}/jeu.html?test=1&seed=1&perf=1${EXTRA}`);
  await page.waitForFunction(() => document.getElementById('loading')?.hidden === true && window.__zs, null, { timeout: 180000, polling: 20 });
  const readyMs = Date.now() - t0;
  await page.waitForTimeout(4000);
  const p = await page.evaluate(() => window.__zs.getState().perf);
  await page.close();
  return { readyMs, max: p.session.max, p99: p.session.p99, first: p.hitches.find((h) => h.name === 'feu')?.max ?? null };
}
const out = { ref: [], tete: [] };
for (let i = 0; i < PASSES; i += 1) {
  out.ref.push(await run(REF));
  out.tete.push(await run(BASE));
}
const row = (k) => ['readyMs', 'max', 'p99', 'first'].map((m) => median(out[k].map((x) => x[m])));
const [a, b] = [row('ref'), row('tete')];
console.log('| Version | Écran de préparation retiré (ms) | Image la plus longue, 4 s (ms) | p99 (ms) | Premier feu (ms) |');
console.log('|---|---|---|---|---|');
console.log(`| référence | ${a.map((x) => x?.toFixed(0)).join(' | ')} |`);
console.log(`| tête | ${b.map((x) => x?.toFixed(0)).join(' | ')} |`);
console.log(`| rapport | ${b.map((x, i) => (a[i] ? `${Math.round((x / a[i]) * 100)} %` : '—')).join(' | ')} |`);
console.log(JSON.stringify(out));
await browser.close();
