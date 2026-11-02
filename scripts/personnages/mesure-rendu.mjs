// Mesure du rendu en jeu (lot 3j) : appels de dessin et triangles (renderer.info, passe d'ombre comprise) avec 10 zombies variés, planches,
// ombres et cône, dans quatre scénarios (R1 grande salle, R2 près d'une fenêtre, U1 étage de gauche, U4 étage de droite), plus la liste des
// fichiers JavaScript demandés au chargement par défaut. N'écrit rien : imprime sur la sortie standard.
// Usage : node scripts/personnages/mesure-rendu.mjs ["&perso=B&sang=1"]
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';

const EXTRA = process.argv[2] ?? '';
const PORT = 4190;
const BASE = `http://localhost:${PORT}`;
const T = ['marcheur', 'petit', 'voute', 'grand'];
const G = ['lent', 'marche', 'rampe', 'course'];
export const SCENARIOS = [
  { id: 'R1', url: '/jeu.html?test=1&seed=1&nospawn=1&shadows=1', player: [2575, 2250], floor: 'rdc', wave: 10 },
  { id: 'R2', url: '/jeu.html?test=1&seed=1&nospawn=1&shadows=1&map=salle', player: [1800, 900], floor: 'rdc', wave: 10, aim: Math.PI },
  { id: 'U1', url: '/jeu.html?test=1&seed=1&nospawn=1&shadows=1&wave=21&floor=1', player: [1195, 1700], floor: 'etage', wave: 21 },
  { id: 'U4', url: '/jeu.html?test=1&seed=1&nospawn=1&shadows=1&wave=31&floor=1', player: [1990, 2245], floor: 'etage', wave: 31 },
];

const server = spawn(process.execPath, ['scripts/serve.mjs'], { env: { ...process.env, PORT: String(PORT) }, stdio: 'ignore' });
const browser = await chromium.launch();
try {
  await new Promise((r) => setTimeout(r, 600));
  const page = await browser.newPage({ viewport: { width: 667, height: 375 } });
  const out = [];
  for (const sc of SCENARIOS) {
    await page.goto(`${BASE}${sc.url}${EXTRA}`);
    await page.waitForFunction(() => (window.__zs?.getState()?.time ?? 0) > 0.05 || document.getElementById('game-error')?.hidden === false, null, { timeout: 90_000 });
    const r = await page.evaluate(([s, types, gaits]) => {
      const zs = window.__zs;
      zs.setPlayer(s.player[0], s.player[1]);
      zs.setInput({ aim: { angle: s.aim ?? 0 } });
      const p = zs.getState().player;
      for (let i = 0; i < 10; i += 1) zs.spawnEnemy(p.x + 70 + (i % 5) * 45, p.y - 90 + Math.floor(i / 5) * 90 + (i % 2) * 15, { type: types[i % 4], gait: gaits[(i + Math.floor(i / 4)) % 4], wave: s.wave, floor: s.floor });
      zs.step(0.05);
      zs.sampleScreen(0, 0, 8, 8);
      const st = zs.getState();
      return { calls: st.render.calls, triangles: st.render.triangles, zombies: st.enemies.length, floor: st.floor.current, persos: st.persos ?? null };
    }, [sc, T, G]);
    out.push({ id: sc.id, ...r });
  }
  const scripts = [];
  const net = await browser.newPage({ viewport: { width: 667, height: 375 } });
  net.on('request', (q) => { if (/\.m?js(\?|$)/.test(q.url())) scripts.push(new URL(q.url()).pathname); });
  await net.goto(`${BASE}/jeu.html${EXTRA ? `?${EXTRA.replace(/^&/, '')}` : ''}`);
  await net.waitForTimeout(4000);
  console.log(JSON.stringify({ extra: EXTRA, scenarios: out, scripts: [...new Set(scripts)].sort() }, null, 1));
} finally {
  await browser.close();
  server.kill();
}
