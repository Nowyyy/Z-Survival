// Lot 9k — Aisance critique : survie d'une seule vague selon l'aisance brute d'une arme « fine » (le Colt réglé sans rechargement, cadence 0,1 s,
// dégâts calculés pour l'aisance demandée), joueur automatique du lot 9e, ?wave=V&planks=0 (fenêtres ouvertes), profils nu et equipe.
// Sortie : par vague et profil, pour chaque aisance, graine par graine : M (mort), c (une chute) ou la vie la plus basse en %.
// Usage : node scripts/equilibrage/critique.mjs [--vagues 8,15,25,35] [--a 0.5,0.7,0.9,1.1] [--seeds 1,2,3] [--enemies f.json] [--waves f.json]
import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { chromium } from '@playwright/test';
import { lvlParam, niveauxReference, vague } from './modele.mjs';
const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : d; };
const lire = (f) => JSON.parse(readFileSync(f, 'utf8'));
const WAVES = opt('waves', 'data/game/waves.json'); const ENEMIES = opt('enemies', 'data/game/enemies.json');
const wj = lire(WAVES); const ej = lire(ENEMIES);
const VAGUES = opt('vagues', '8,15,25,35').split(',').map(Number);
const AIS = opt('a', '0.5,0.7,0.9,1.1').split(',').map(Number);
const SEEDS = opt('seeds', '1,2,3').split(',').map(Number);
const PROFILS = opt('profils', 'nu,equipe').split(',');
const PREC = Number(opt('precision', '0.89'));
const niv = niveauxReference(lire('data/menu/objets.json'), lire('data/menu/personnages.json'), lire('data/game/player-stats.json'));
const LVL = { nu: '', equipe: `&lvl=${lvlParam(niv)}` };
const base = lire('data/game/armes-partie.json');
const server = spawn('node', ['scripts/serve.mjs'], { stdio: 'ignore', env: { ...process.env, PORT: '4199' } });
await new Promise((r) => setTimeout(r, 800));
const browser = await chromium.launch();
const taches = [];
for (const v of VAGUES) for (const a of AIS) for (const p of PROFILS) for (const s of SEEDS) taches.push({ v, a, p, s });
const res = [];
async function une(t) {
  const w = vague(t.v, wj, ej);
  const dmg = (t.a * w.demande * 0.1) / PREC;
  const table = structuredClone(base);
  Object.assign(table.armes.m1911, { degats: dmg, cadence: 0.1, chargeur: 100000, rechargement: 1 });
  const ctx = await browser.newContext({ viewport: { width: 667, height: 375 } });
  const page = await ctx.newPage();
  await page.addInitScript(() => Object.defineProperty(Document.prototype, 'hidden', { get: () => true, configurable: true }));
  await page.route('**/data/game/armes-partie.json', (r) => r.fulfill({ contentType: 'application/json', body: JSON.stringify(table) }));
  await page.route('**/data/game/waves.json', (r) => r.fulfill({ contentType: 'application/json', body: JSON.stringify(wj) }));
  await page.route('**/data/game/enemies.json', (r) => r.fulfill({ contentType: 'application/json', body: JSON.stringify(ej) }));
  await page.goto(`http://localhost:4199/jeu.html?test=1&seed=${t.s}&wave=${t.v}&planks=0${LVL[t.p]}`);
  await page.waitForFunction(() => window.__zs, null, { timeout: 180000 });
  const r = await page.evaluate((v) => { const zs = window.__zs; let aim = 0; let minHp = 1e9; let chutes = 0; let last = null;
    for (let i = 0; i < 20000; i++) { if (i % 4 === 0) { const s = zs.getState(); if (s.dead) return { mort: true, t: s.time, chutes: chutes + 1, minHp: 0 };
      if (s.waves.wave > v || (s.waves.phase !== 'combat' && s.waves.phase !== 'apparition' && i > 200)) return { mort: false, t: s.time, chutes, minHp };
      const p = s.player; if (last !== null && p.down.chutes < last) chutes++; last = p.down.chutes; if (p.down.state === 'debout') minHp = Math.min(minHp, p.health / p.maxHp);
      let b = null, bd = 1e9; for (const e of s.enemies) { const d = Math.hypot(e.x - p.x, e.y - p.y); if ((e.floor ?? 'rdc') === (s.floor?.current ?? 'rdc') && e.mode !== 'escalier' && d < bd) { bd = d; b = e; } }
      if (b) aim = Math.atan2(b.y - p.y, b.x - p.x); }
      zs.setInput({ aim: { angle: aim } }); zs.step(0.05); }
    return { mort: false, t: -1, chutes, minHp }; }, t.v);
  await ctx.close();
  return { ...t, ...r };
}
let k = 0;
await Promise.all([0, 1, 2, 3].map(async () => { while (k < taches.length) { const t = taches[k++]; res.push(await une(t)); } }));
await browser.close(); server.kill();
const out = {};
for (const r of res) { const key = `${r.v} ${r.p} ${r.a}`; (out[key] ??= []).push(r.mort ? 'M' : r.chutes ? 'c' : `${Math.round(r.minHp * 100)}`); }
for (const v of VAGUES) for (const p of PROFILS) console.log(`v${v} ${p}: ${AIS.map((a) => `${a}=[${out[`${v} ${p} ${a}`].join(',')}]`).join('  ')}`);
writeFileSync(opt('out', '/dev/null'), JSON.stringify(res));
