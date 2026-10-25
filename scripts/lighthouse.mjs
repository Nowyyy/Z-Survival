// Lance Lighthouse (mobile) sur le site servi localement ; seuils fixés en partie B.
import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';

mkdirSync('lighthouse-report', { recursive: true });
const server = spawn('node', ['scripts/serve.mjs'], { stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 800));
const { chromium } = await import('@playwright/test');
const run = spawnSync('npx', ['lighthouse', 'http://localhost:4173/', '--form-factor=mobile',
  '--output=json', '--output=html', '--output-path=lighthouse-report/report',
  '--chrome-flags=--headless=new --no-sandbox', '--quiet'],
{ stdio: 'inherit', env: { ...process.env, CHROME_PATH: chromium.executablePath() } });
server.kill();
process.exit(run.status ?? 1);
