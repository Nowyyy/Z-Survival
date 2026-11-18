// Lot 9e — Mesures de difficulté (garantie 2) : joueur automatique déterministe (immobile au départ, vise le zombie le plus proche de son étage ;
// tir automatique du jeu ; ne répare pas), ?test=1 (sauvegarde en mémoire), step(0.05) seulement. Par manche : temps du premier impact à la mort
// (médiane), dégâts reçus, planches arrachées (fenêtres actives) ; zombies « coincés » (moins de 5 parcourus en 5 s, ni occupés, ni près du joueur).
// Usage : node scripts/perf/difficulte.mjs [--base http://localhost:4180] [--out fichier.json hors du dépôt] [--max 12000] [--extra '&lvl=all:10']
//         [--runs '[{"nom":"m11","query":"&wave=11","seeds":[1,2],"steps":2400,"arme":"kar98k"}]'] (arme : donnée par le débogage avant les pas).
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { chromium } from '@playwright/test';
const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : d; };
let BASE = opt('base', null); let server = null;
if (!BASE) { server = spawn('node', ['scripts/serve.mjs'], { stdio: 'ignore', env: { ...process.env, PORT: '4193' } }); await new Promise((r) => setTimeout(r, 800)); BASE = 'http://localhost:4193'; }
const MAX = Number(opt('max', '12000'));
const runs = JSON.parse(opt('runs', JSON.stringify([
  { nom: 'partie', query: '&wave=1', seeds: [1, 2, 3], steps: MAX },
  { nom: 'm11', query: '&wave=11', seeds: [1, 2], steps: 2400 },
  { nom: 'm21', query: '&wave=21', seeds: [1, 2], steps: 2400 },
  { nom: 'm31', query: '&wave=31', seeds: [1, 2], steps: 2400 },
])));
const extra = opt('extra', '');
const browser = await chromium.launch();
const results = [];
for (const run of runs) for (const seed of run.seeds) {
  const context = await browser.newContext({ viewport: { width: 667, height: 375 } });
  const page = await context.newPage();
  await page.addInitScript(() => Object.defineProperty(Document.prototype, 'hidden', { get: () => true, configurable: true }));
  await page.goto(`${BASE}/jeu.html?test=1&seed=${seed}${run.query}${extra}`);
  await page.waitForFunction(() => window.__zs, null, { timeout: 180000 });
  const r = await page.evaluate(async ({ steps, arme }) => {
    const zs = window.__zs;
    if (arme) { zs.donnerArme(arme); for (let i = 0; i < 30; i += 1) zs.step(0.05); }
    const firstHit = new Map(); const seen = new Map(); const byWave = {};
    const track = new Map(); // id -> { x, y, t }
    const stuck = new Set();
    let lastHp = zs.getState().player.health; let lastPlanks = null;
    const W = (w) => (byWave[w] ??= { ttk: [], dmg: 0, torn: 0, kills: 0 });
    let aim = 0;
    for (let i = 0; i < steps; i += 1) {
      if (i % 4 === 0) {
        const s = zs.getState();
        const t = s.time;
        const wave = s.waves.wave;
        if (s.dead || s.worldOver) break;
        const p = s.player; const pf = s.floor?.current ?? 'rdc';
        let best = null; let bd = Infinity;
        const alive = new Set();
        for (const e of s.enemies) {
          alive.add(e.id);
          if (!seen.has(e.id)) seen.set(e.id, { t, wave });
          if (e.hp < e.maxHp && !firstHit.has(e.id)) firstHit.set(e.id, t);
          const d = Math.hypot(e.x - p.x, e.y - p.y);
          if ((e.floor ?? 'rdc') === pf && e.mode !== 'escalier' && d < bd) { bd = d; best = e; }
          const k = track.get(e.id);
          const busy = ['arrache', 'file', 'escalade', 'escalier', 'approche'].includes(e.mode) || d < 70;
          if (!k || busy || Math.hypot(e.x - k.x, e.y - k.y) > 5) track.set(e.id, { x: e.x, y: e.y, t });
          else if (t - k.t > 5) stuck.add(e.id);
        }
        for (const [id, f] of firstHit) if (!alive.has(id)) { const sw = seen.get(id); W(sw.wave).ttk.push(t - f); W(sw.wave).kills += 1; firstHit.delete(id); }
        if (best) aim = Math.atan2(best.y - p.y, best.x - p.x);
        if (p.health < lastHp) W(wave).dmg += lastHp - p.health;
        lastHp = p.health;
        const planks = (s.windows ?? []).reduce((a, w) => a + (w.active && Number.isFinite(w.planks) ? w.planks : 0), 0);
        if (lastPlanks !== null && planks < lastPlanks && lastPlanks - planks <= 2) W(wave).torn += lastPlanks - planks;
        lastPlanks = planks;
      }
      zs.setInput({ aim: { angle: aim } });
      zs.step(0.05);
    }
    const s = zs.getState();
    const med = (a) => { if (!a.length) return null; const b = [...a].sort((x, y) => x - y); return +b[Math.floor(b.length / 2)].toFixed(2); };
    return { time: +s.time.toFixed(1), dead: s.dead, wave: s.waves.wave, kills: s.kills, stuck: stuck.size, byWave: Object.fromEntries(Object.entries(byWave).map(([w, v]) => [w, { ttkMed: med(v.ttk), n: v.ttk.length, dmg: Math.round(v.dmg), torn: v.torn }])) };
  }, { steps: run.steps, arme: run.arme ?? null });
  results.push({ run: run.nom, arme: run.arme ?? null, seed, ...r });
  console.log(run.nom, seed, JSON.stringify(r));
  await context.close();
}
await browser.close();
server?.kill();
writeFileSync(opt('out', 'difficulte.json'), JSON.stringify(results, null, 1));
