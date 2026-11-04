// Accrocs au premier usage et temps de chargement (lot 5b-C, levier de précompilation). RENDU LOGICIEL : comparaison relative seulement.
// Usage : node scripts/perf/premier-usage.mjs --ref http://localhost:4180 --base http://localhost:4173 [--passes 5]
// Par passe et par version : temps jusqu'au jeu prêt (navigation → première image de jeu) ; puis, la boucle d'images capturée (comme mesurer.mjs),
// médiane de 30 images ordinaires, image la plus longue des 5 qui suivent le premier sang (un zombie touché) et première image à l'étage.
import { chromium } from '@playwright/test';

const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && i + 1 < args.length ? args[i + 1] : fallback;
};
const REF = opt('ref', 'http://localhost:4180');
const BASE = opt('base', 'http://localhost:4173');
const PASSES = Math.max(1, Number(opt('passes', '5')) || 5);
const median = (v) => {
  const s = v.filter(Number.isFinite).sort((a, b) => a - b);
  return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : null;
};

const browser = await chromium.launch();
async function run(base) {
  const page = await browser.newPage({ viewport: { width: 667, height: 375 } });
  const t0 = Date.now();
  await page.goto(`${base}/jeu.html?test=1&seed=1&nospawn=1&wave=21`);
  await page.waitForFunction(() => (window.__zs?.getState()?.time ?? 0) > 0.05, null, { timeout: 180000, polling: 50 });
  const readyMs = Date.now() - t0;
  await page.evaluate(() => {
    window.requestAnimationFrame = (cb) => {
      if (cb.name === 'frame') window.__frame = cb;
      return 0;
    };
  });
  await page.waitForFunction(() => typeof window.__frame === 'function', null, { timeout: 30000 });
  const r = await page.evaluate(() => {
    const zs = window.__zs;
    let t = performance.now();
    const one = () => {
      t += 1000 / 60;
      const a = performance.now();
      window.__frame(t);
      return performance.now() - a;
    };
    const p = zs.getState().player;
    const warm = [];
    for (let i = 0; i < 30; i += 1) warm.push(one());
    zs.setInput({ aim: { angle: 0 } });
    const id = zs.spawnEnemy(p.x + 160, p.y, { type: 'grand', gait: 'lent' });
    let hit = -1;
    const after = [];
    for (let i = 0; i < 240 && after.length < 5; i += 1) {
      const d = one();
      const e = zs.getState().enemies.find((x) => x.id === id);
      if (hit < 0 && (!e || e.health < e.maxHp)) hit = i;
      if (hit >= 0) after.push(d);
    }
    zs.setInput({});
    zs.setFloor(1);
    const floor = one();
    return { warm: warm.sort((a, b) => a - b)[15], blood: after.length ? Math.max(...after) : null, floor, hit };
  });
  await page.close();
  return { readyMs, ...r };
}
const out = { ref: [], tete: [] };
for (let p = 0; p < PASSES; p += 1) {
  out.ref.push(await run(REF));
  out.tete.push(await run(BASE));
}
const row = (k) => ['readyMs', 'warm', 'blood', 'floor'].map((m) => median(out[k].map((x) => x[m])));
const [a, b] = [row('ref'), row('tete')];
console.log('| Version | Prêt (ms) | Image ordinaire (ms) | Max après le premier sang (ms) | Première image à l\'étage (ms) |');
console.log('|---|---|---|---|---|');
console.log(`| référence | ${a.map((x) => x?.toFixed(1)).join(' | ')} |`);
console.log(`| tête | ${b.map((x) => x?.toFixed(1)).join(' | ')} |`);
console.log(`| rapport | ${b.map((x, i) => (a[i] ? `${Math.round((x / a[i]) * 100)} %` : '—')).join(' | ')} |`);
console.log(JSON.stringify(out));
await browser.close();
