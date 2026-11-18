// Lot 9e — Simulation de blocage (garantie 2). Usage : node scripts/perf/blocage.mjs [--base URL] [--out fichier.json] [--steps 7200] [--extra '&corps=avant'] : deux étages, toutes les portes ouvertes, fenêtres ouvertes, zombies quasi immortels, joueur
// déplacé de point de réparation en point de réparation (deux étages) toutes les 20 s ; un zombie « coincé » avance de moins de 5 en 5 s sans être
// occupé (siège, escalier), ni à moins de 80 du joueur, ni serré contre un autre zombie.
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { chromium } from '@playwright/test';
const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : d; };
let BASE = opt('base', null); let server = null;
if (!BASE) { server = spawn('node', ['scripts/serve.mjs'], { stdio: 'ignore', env: { ...process.env, PORT: '4194' } }); await new Promise((r) => setTimeout(r, 800)); BASE = 'http://localhost:4194'; }
const STEPS = Number(opt('steps', '7200'));
const browser = await chromium.launch();
const out = [];
for (const seed of [1, 2]) {
  const context = await browser.newContext({ viewport: { width: 667, height: 375 } });
  const page = await context.newPage();
  await page.addInitScript(() => Object.defineProperty(Document.prototype, 'hidden', { get: () => true, configurable: true }));
  await page.goto(`${BASE}/jeu.html?test=1&seed=${seed}&wave=12&planks=0${opt('extra', '')}`);
  await page.waitForFunction(() => window.__zs, null, { timeout: 180000 });
  const r = await page.evaluate(({ steps }) => {
    const zs = window.__zs;
    zs.setWaveParams({ hp: { hpLinearPerRound: 1000, hpExpStartRound: 1000, hpExpFactor: 1, hpCap: 1e9 } });
    const st0 = zs.getState();
    for (const d of st0.zones?.doors ?? []) zs.setDoor(d.id, true);
    zs.setChutes(99);
    zs.skipWave();
    const spots = (zs.getState().windows ?? []).map((w) => ({ x: w.repairSpot.x, y: w.repairSpot.y, floor: w.floor }));
    const track = new Map(); const stuck = new Map(); let maxAlive = 0; let k = 0; let floors = new Set();
    for (let i = 0; i < steps; i += 1) {
      if (i % 400 === 0 && spots.length) {
        const sp = spots[k++ % spots.length];
        const cur = zs.getState().floor?.current ?? 'rdc';
        if (sp.floor !== cur) zs.setFloor(sp.floor === 'etage' ? 1 : 0);
        zs.setPlayer(sp.x, sp.y);
      }
      if (i % 4 === 0) {
        const s = zs.getState(); const p = s.player; const t = s.time; const pf = s.floor?.current ?? 'rdc';
        maxAlive = Math.max(maxAlive, s.enemies.length);
        for (const e of s.enemies) {
          floors.add(e.floor);
          const near = e.floor === pf && Math.hypot(e.x - p.x, e.y - p.y) < 80;
          const crowd = s.enemies.some((o) => o.id !== e.id && o.floor === e.floor && Math.hypot(o.x - e.x, o.y - e.y) < e.radius + o.radius + 3);
          const busy = ['arrache', 'file', 'escalade', 'escalier'].includes(e.mode) || near || crowd;
          const q = track.get(e.id);
          if (!q || busy || Math.hypot(e.x - q.x, e.y - q.y) > 5) track.set(e.id, { x: e.x, y: e.y, t });
          else if (t - q.t > 5 && !stuck.has(e.id)) stuck.set(e.id, { x: Math.round(e.x), y: Math.round(e.y), floor: e.floor, mode: e.mode, t: Math.round(t) });
        }
      }
      zs.setInput({ aim: { angle: (i * 0.05) % 6.283 } });
      zs.step(0.05);
    }
    return { doors: (zs.getState().zones?.doors ?? []).filter((d) => d.open).length, spots: spots.length, maxAlive, floors: [...floors], stuck: [...stuck.values()] };
  }, { steps: STEPS });
  console.log(seed, JSON.stringify(r));
  out.push({ seed, ...r });
  await context.close();
}
await browser.close(); server?.kill();
writeFileSync(opt('out', 'blocage.json'), JSON.stringify(out, null, 1));
