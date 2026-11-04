// Appels et triangles à l'instant de l'apparition de 10 zombies variés (mêmes scénarios et mêmes gestes que scripts/modele/mesures-rendu.mjs), par
// préréglage, SANS forcer ?shadows= ni ?vhs= (le préréglage décide), avec un rapport de pixels d'écran choisi (--dpr 2 : téléphone) : pixels du canvas.
// Usage : node scripts/perf/budget-instant.mjs --base http://localhost:4173 [--presets eleve,moyen,faible] [--dpr 2]. Rendu logiciel : comptes exacts,
// temps non représentatifs (aucun temps relevé ici).
import { chromium } from '@playwright/test';

const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && i + 1 < args.length ? args[i + 1] : fallback;
};
const BASE = opt('base', 'http://localhost:4173');
const PRESETS = opt('presets', 'eleve,moyen,faible').split(',').filter(Boolean);
const DPR = Number(opt('dpr', '2')) || 2;
const U = (px) => px * 5 + 800;
const SCENARIOS = [
  { id: 'R1', url: '&nospawn=1', at: [U(300), U(300)], floor: 'rdc', wave: 10 },
  { id: 'R2', url: '&nospawn=1', at: [U(311), U(335)], floor: 'rdc', wave: 10 },
  { id: 'U1', url: '&nospawn=1&wave=21&floor=1', at: [U(100), U(120)], floor: 'etage', wave: 21 },
  { id: 'U4', url: '&nospawn=1&wave=31&floor=1', at: [U(215), U(290)], floor: 'etage', wave: 31 },
];
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 667, height: 375 }, deviceScaleFactor: DPR });
const page = await context.newPage();
const rows = [];
for (const preset of PRESETS) {
  for (const sc of SCENARIOS) {
    await page.goto(`${BASE}/jeu.html?test=1&seed=1&gfx=${preset}${sc.url}`);
    await page.waitForFunction(() => window.__zs?.getState, null, { timeout: 120000 });
    await page.evaluate(() => { window.requestAnimationFrame = () => 0; });
    await page.evaluate(() => new Promise((r) => setTimeout(r, 150)));
    const r = await page.evaluate(({ at, floor, wave }) => {
      const zs = window.__zs;
      zs.step(0.05);
      zs.setPlayer(at[0], at[1]);
      zs.setInput({ aim: { angle: Math.PI } });
      const T = ['marcheur', 'petit', 'voute', 'grand'];
      const G = ['lent', 'marche', 'rampe', 'course'];
      for (let i = 0; i < 10; i += 1) zs.spawnEnemy(at[0] + 40 + (i % 5) * 30, at[1] + (Math.floor(i / 5) - 0.5) * 60, { type: T[i % 4], gait: G[(i + Math.floor(i / 4)) % 4], wave, floor });
      zs.step(0.05);
      zs.sampleScreen(0, 0, 8, 8);
      const s = zs.getState();
      const c = document.querySelector('#game-canvas canvas');
      return { calls: s.render.calls, triangles: s.render.triangles, pixels: c.width * c.height, ratio: s.graphics?.pixelRatio ?? null, shadows: s.graphics?.shadows ?? null };
    }, sc);
    rows.push({ preset, id: sc.id, ...r });
    console.log(`${preset} ${sc.id} : ${r.calls} appels, ${r.triangles} triangles (marge ${45000 - r.triangles} sous 45 000, ${400 - r.calls} sous 400), ${r.pixels} pixels (rapport ${r.ratio}), ombres ${r.shadows}`);
  }
}
const ref = (id) => rows.find((x) => x.preset === 'eleve' && x.id === id);
for (const x of rows) if (ref(x.id)) console.log(`${x.preset} ${x.id} : triangles ${Math.round((x.triangles / ref(x.id).triangles) * 100)} %, appels ${Math.round((x.calls / ref(x.id).calls) * 100)} %, pixels ${Math.round((x.pixels / ref(x.id).pixels) * 100)} % de l'Élevé`);
await browser.close();
