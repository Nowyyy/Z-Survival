// Lance Lighthouse (mobile) sur le site servi localement ; seuils fixés en partie B.
import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync } from 'node:fs';

mkdirSync('lighthouse-report', { recursive: true });
const server = spawn('node', ['scripts/serve.mjs'], { stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 800));
const { chromium } = await import('@playwright/test');
const run = spawnSync('npx', ['lighthouse', 'http://localhost:4173/', '--form-factor=mobile',
  '--only-categories=performance,accessibility,best-practices', '--output=json', '--output=html', '--output-path=lighthouse-report/report',
  '--chrome-flags=--headless=new --no-sandbox', '--quiet'],
{ stdio: 'inherit', env: { ...process.env, CHROME_PATH: chromium.executablePath() } });
server.kill();
if (run.status !== 0) process.exit(run.status ?? 1);

const THRESHOLDS = { performance: 0.9, accessibility: 0.95, 'best-practices': 0.95 };
const report = JSON.parse(readFileSync('lighthouse-report/report.report.json', 'utf8'));
let ok = true;
for (const [id, min] of Object.entries(THRESHOLDS)) {
  const score = report.categories[id].score;
  console.log(`${id}: ${Math.round(score * 100)} (seuil ${min * 100})`);
  if (score < min) ok = false;
}
const cls = report.audits['cumulative-layout-shift'].numericValue;
console.log(`CLS: ${cls.toFixed(3)} (max 0.1)`);
if (cls > 0.1) ok = false;
process.exit(ok ? 0 : 1);
