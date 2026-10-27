// Lance Lighthouse (mobile) sur le site servi localement. Seuils : index.html 90 / 95 / 95, jeu.html 45 / 95 / 95 (lot 1m : rendu Three.js) ; CLS <= 0,1.
import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync } from 'node:fs';

// LH_ONLY=jeu (liste séparée par des virgules) ne mesure que ces pages ; LH_QUERY='?vhs=0' ajoute une chaîne de requête à jeu.html (lot 2c :
// mesure avec et sans l'effet VHS) ; LH_NAME=<nom> écrit le rapport sous le nom jeu-<nom>.
const only = process.env.LH_ONLY ? process.env.LH_ONLY.split(',') : null;
const PAGES = [
  { name: 'index', path: '', thresholds: { performance: 0.9, accessibility: 0.95, 'best-practices': 0.95 } },
  { name: process.env.LH_NAME ? `jeu-${process.env.LH_NAME}` : 'jeu', path: `jeu.html${process.env.LH_QUERY ?? ''}`, thresholds: { performance: 0.45, accessibility: 0.95, 'best-practices': 0.95 } },
].filter((p) => !only || only.includes(p.name.split('-')[0]));

mkdirSync('lighthouse-report', { recursive: true });
const server = spawn('node', ['scripts/serve.mjs'], { stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 800));
const { chromium } = await import('@playwright/test');
let ok = true;

for (const page of PAGES) {
  const run = spawnSync('npx', ['lighthouse', `http://localhost:4173/${page.path}`, '--form-factor=mobile',
    '--only-categories=performance,accessibility,best-practices', '--output=json', '--output=html', `--output-path=lighthouse-report/${page.name}`,
    '--chrome-flags=--headless=new --no-sandbox', '--quiet'],
  { stdio: 'inherit', env: { ...process.env, CHROME_PATH: chromium.executablePath() } });
  if (run.status !== 0) {
    server.kill();
    process.exit(run.status ?? 1);
  }
  const report = JSON.parse(readFileSync(`lighthouse-report/${page.name}.report.json`, 'utf8'));
  for (const [id, min] of Object.entries(page.thresholds)) {
    const score = report.categories[id].score;
    console.log(`${page.name} ${id}: ${Math.round(score * 100)} (seuil ${min * 100})`);
    if (score < min) ok = false;
  }
  const cls = report.audits['cumulative-layout-shift'].numericValue;
  console.log(`${page.name} CLS: ${cls.toFixed(3)} (max 0.1)`);
  if (cls > 0.1) ok = false;
}
server.kill();
process.exit(ok ? 0 : 1);
