// Lot 9h — Temps d'arrivée des zombies aux fenêtres (garantie 2 du décor extérieur). Usage : node scripts/perf/arrivees.mjs [--base URL]
// [--out fichier.json hors du dépôt] [--steps 2400] [--seeds 1,2,3] [--wave 3] [--extra '&decor=avant'] [--sans-portes].
// jeu.html?test=1&seed=N&wave=W (667 × 375, onglet caché : seul step(0.05) fait avancer la partie), toutes les portes ouvertes (sauf --sans-portes : toutes les fenêtres du
// rez-de-chaussée actives), joueur immobile au centre, sans visée (aucune entrée) ; pour chaque zombie : temps de jeu entre sa première apparition à l'écran d'état et son premier passage au siège
// (« attente », « arrache » ou « escalade ») ; par fenêtre : nombre, médiane et maximum. Aucune écriture dans le dépôt.
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { chromium } from '@playwright/test';

const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : d; };
let BASE = opt('base', null);
let server = null;
if (!BASE) {
  server = spawn('node', ['scripts/serve.mjs'], { stdio: 'ignore', env: { ...process.env, PORT: '4195' } });
  await new Promise((r) => setTimeout(r, 800));
  BASE = 'http://localhost:4195';
}
const STEPS = Number(opt('steps', '2400'));
const SEEDS = opt('seeds', '1,2,3').split(',').map(Number);
const WAVE = Number(opt('wave', '3'));
const browser = await chromium.launch();
const runs = [];
for (const seed of SEEDS) {
  const context = await browser.newContext({ viewport: { width: 667, height: 375 } });
  const page = await context.newPage();
  await page.addInitScript(() => Object.defineProperty(Document.prototype, 'hidden', { get: () => true, configurable: true }));
  await page.goto(`${BASE}/jeu.html?test=1&seed=${seed}&wave=${WAVE}${opt('extra', '')}`);
  await page.waitForFunction(() => window.__zs, null, { timeout: 180000 });
  const r = await page.evaluate(({ steps, portes }) => {
    const zs = window.__zs;
    if (portes) for (const d of zs.getState().zones?.doors ?? []) zs.setDoor(d.id, true); // toutes les fenêtres du rez-de-chaussée actives
    const seen = new Map();
    const arrived = [];
    for (let i = 0; i < steps; i += 1) {
      zs.step(0.05);
      const s = zs.getState();
      for (const e of s.enemies) {
        if (!seen.has(e.id)) seen.set(e.id, { t: s.time, window: e.window, x: Math.round(e.x), y: Math.round(e.y), done: false });
        const q = seen.get(e.id);
        if (!q.done && ['attente', 'arrache', 'escalade'].includes(e.mode)) {
          q.done = true;
          arrived.push({ id: e.id, window: e.window ?? q.window, from: [q.x, q.y], duree: Math.round((s.time - q.t) * 100) / 100 });
        }
      }
    }
    return { arrived, spawned: seen.size };
  }, { steps: STEPS, portes: !args.includes('--sans-portes') });
  runs.push({ seed, ...r });
  await context.close();
}
await browser.close();
server?.kill();
const parFenetre = {};
for (const run of runs) for (const a of run.arrived) (parFenetre[a.window] ??= []).push(a.duree);
const median = (l) => { const s = [...l].sort((a, b) => a - b); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const resume = Object.fromEntries(Object.entries(parFenetre).sort().map(([w, l]) => [w, { n: l.length, mediane: Math.round(median(l) * 100) / 100, max: Math.max(...l) }]));
for (const [w, v] of Object.entries(resume)) console.log(`${w} : ${v.n} arrivées, médiane ${v.mediane} s, max ${v.max} s`);
console.log(`apparus ${runs.reduce((s, r) => s + r.spawned, 0)}, arrivés ${runs.reduce((s, r) => s + r.arrived.length, 0)}`);
const out = opt('out', null);
if (out) writeFileSync(out, JSON.stringify({ steps: STEPS, wave: WAVE, seeds: SEEDS, resume, runs }, null, 1));
