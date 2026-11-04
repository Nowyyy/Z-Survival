// Script de comparaison de fluidité (lot 5b). RENDU LOGICIEL : les valeurs absolues ne représentent aucun téléphone ; seules les comparaisons relatives
// (préréglage contre préréglage, avant contre après un levier) ont un sens. Playwright Chromium, aucune dépendance nouvelle ; résultats écrits hors du
// dépôt (dossier temporaire par défaut, --out pour un autre dossier) ; résumé reporté à la main dans Docs/ref/performance.md.
//
// Usage : node scripts/perf/mesurer.mjs [--presets eleve,moyen,faible] [--scenarios R1,R2,U1,U4] [--passes 5] [--frames 600] [--extra '&sang=0']
//         [--base http://localhost:4173 (sinon un serveur local est lancé)] [--ref http://localhost:4180 (même mesure sur une autre version)] [--out dossier]
//         [--sans-perf (sans ?perf=1 : temps par image sans le profileur)] ; préréglage « defaut » : sans ?gfx=.
//
// Pour chaque scénario (10 zombies variés, planches, cône, 667×375, graine fixe) et chaque préréglage (?gfx=), N passes : la boucle d'images du jeu est
// appelée directement (sa fonction frame capturée, temps de jeu 1/60 s par image, 600 images ; chaque image force le calcul du style et de la mise
// en page pour que leur coût soit compté) ; on relève renderer.info, Performance.getMetrics (durées de script, style, mise en page, tâche), le tas JS
// (drapeau de mémoire précise ; croissance et allocations échantillonnées par HeapProfiler, objets ramassés compris), le temps du profileur par étape
// (?perf=1), les pixels rendus. Médiane des passes ; tableau scénario × préréglage en pourcentage de l'Élevé.
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from '@playwright/test';

const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && i + 1 < args.length ? args[i + 1] : fallback;
};
const flag = (name) => args.includes(`--${name}`);
const PRESETS = opt('presets', 'eleve,moyen,faible').split(',').filter(Boolean);
const SCEN = opt('scenarios', 'R1,R2,U1,U4').split(',').filter(Boolean);
const PASSES = Math.max(1, Number(opt('passes', '5')) || 5);
const FRAMES = Math.max(10, Number(opt('frames', '600')) || 600);
const EXTRA = opt('extra', '');
const OUT = opt('out', join(tmpdir(), 'zs-perf'));
const REF = opt('ref', null);
const PERF = !flag('sans-perf');
const HEAP = !flag('sans-tas'); // --sans-tas : sans échantillonnage des allocations (comparaison de temps la plus fine)

// Position du joueur en unités du jeu (pixels du plan × 5 + 800) ; mêmes scénarios que scripts/modele/mesures-rendu.mjs.
const U = (px) => px * 5 + 800;
export const SCENARIOS = [
  { id: 'R1', url: '&nospawn=1', at: [U(300), U(300)], floor: 'rdc', wave: 10 },
  { id: 'R2', url: '&nospawn=1', at: [U(311), U(335)], floor: 'rdc', wave: 10 },
  { id: 'U1', url: '&nospawn=1&wave=21&floor=1', at: [U(100), U(120)], floor: 'etage', wave: 21 },
  { id: 'U4', url: '&nospawn=1&wave=31&floor=1', at: [U(215), U(290)], floor: 'etage', wave: 31 },
];

const median = (v) => {
  const s = v.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  if (!s.length) return null;
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
};

let server = null;
let BASE = opt('base', null);
if (!BASE) {
  server = spawn('node', ['scripts/serve.mjs'], { stdio: 'ignore', env: { ...process.env, PORT: '4191' } });
  await new Promise((r) => setTimeout(r, 800));
  BASE = 'http://localhost:4191';
}

const browser = await chromium.launch({ args: ['--enable-precise-memory-info'] });

// Une passe : renvoie les mesures brutes.
async function run(base, sc, preset) {
  const context = await browser.newContext({ viewport: { width: 667, height: 375 } });
  const page = await context.newPage();
  const gfx = preset && preset !== 'defaut' ? `&gfx=${preset}` : ''; // « defaut » : sans ?gfx= (réglage par défaut de la version mesurée)
  await page.goto(`${base}/jeu.html?test=1&seed=1${PERF ? '&perf=1' : ''}${gfx}${sc.url}${EXTRA}`);
  await page.waitForFunction(() => (window.__zs?.getState()?.time ?? 0) > 0.05, null, { timeout: 180000 });
  // Sons « fond » calculés et zombies préparés d'avance (tâches de fond) : terminés avant la mesure.
  await page.waitForFunction(() => window.__zs.getState().audio.ready === true, null, { timeout: 180000, polling: 500 });
  await page.waitForTimeout(1500);
  await page.evaluate(({ at, floor, wave }) => {
    const zs = window.__zs;
    zs.step(0.05);
    zs.setPlayer(at[0], at[1]);
    zs.setInput({ aim: { angle: Math.PI } });
    const T = ['marcheur', 'petit', 'voute', 'grand'];
    const G = ['lent', 'marche', 'rampe', 'course'];
    for (let i = 0; i < 10; i += 1) zs.spawnEnemy(at[0] + 40 + (i % 5) * 30, at[1] + (Math.floor(i / 5) - 0.5) * 60, { type: T[i % 4], gait: G[(i + Math.floor(i / 4)) % 4], wave, floor });
    zs.step(0.05);
    // La boucle d'images du jeu est capturée : requestAnimationFrame ne la relance plus, le script l'appelle lui-même.
    const real = window.requestAnimationFrame.bind(window);
    window.__realRaf = real;
    window.requestAnimationFrame = (cb) => {
      if (cb.name === 'frame') window.__frame = cb;
      return 0;
    };
  }, sc);
  await page.waitForFunction(() => typeof window.__frame === 'function', null, { timeout: 30000 });
  const cdp = await context.newCDPSession(page);
  await cdp.send('Performance.enable');
  await cdp.send('HeapProfiler.enable');
  await cdp.send('HeapProfiler.collectGarbage');
  const metric = async () => Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map((m) => [m.name, m.value]));
  const m0 = await metric();
  if (HEAP) await cdp.send('HeapProfiler.startSampling', { samplingInterval: 2048, includeObjectsCollectedByMajorGC: true, includeObjectsCollectedByMinorGC: true });
  const loop = await page.evaluate(async (frames) => {
    const work = [];
    const heap0 = performance.memory?.usedJSHeapSize ?? null;
    let t = performance.now();
    const CHUNK = 20;
    for (let i = 0; i < frames; i += 1) {
      t += 1000 / 60;
      const a = performance.now();
      window.__frame(t);
      void document.body.offsetHeight; // style et mise en page de l'image comptés (VHS, HUD)
      work.push(performance.now() - a);
      if (i % CHUNK === CHUNK - 1) await new Promise((r) => setTimeout(r, 0));
    }
    const heap1 = performance.memory?.usedJSHeapSize ?? null;
    const s = window.__zs.getState();
    const canvas = document.querySelector('#game-canvas canvas');
    return { work, heapGrowth: heap0 !== null && heap1 !== null ? heap1 - heap0 : null, render: s.render, perf: s.perf, graphics: s.graphics ?? null, pixels: canvas ? canvas.width * canvas.height : null, enemies: s.enemies.length };
  }, FRAMES);
  const profile = HEAP ? (await cdp.send('HeapProfiler.stopSampling')).profile : { head: { selfSize: 0, children: [] } };
  const m1 = await metric();
  // Allocations échantillonnées : somme des tailles (objets ramassés compris), et principaux sites (fonction, fichier:ligne).
  const sites = new Map();
  let allocated = 0;
  const walk = (node) => {
    const size = node.selfSize ?? 0;
    allocated += size;
    if (size > 0) {
      const f = node.callFrame;
      const key = `${f.functionName || '(anonyme)'} ${String(f.url).replace(/^.*\/(js|vendor)\//, '$1/')}:${f.lineNumber + 1}`;
      sites.set(key, (sites.get(key) ?? 0) + size);
    }
    for (const c of node.children ?? []) walk(c);
  };
  walk(profile.head);
  await context.close();
  const d = (k) => (m1[k] ?? 0) - (m0[k] ?? 0);
  return {
    frameMs: median(loop.work),
    frameMean: loop.work.reduce((a, b) => a + b, 0) / loop.work.length, // moyenne exacte (la médiane est quantifiée à 0,1 ms par performance.now())
    frameP95: loop.work.slice().sort((a, b) => a - b)[Math.floor(loop.work.length * 0.95)],
    taskMs: (d('TaskDuration') * 1000) / FRAMES,
    scriptMs: (d('ScriptDuration') * 1000) / FRAMES,
    styleMs: (d('RecalcStyleDuration') * 1000) / FRAMES,
    layoutMs: (d('LayoutDuration') * 1000) / FRAMES,
    allocKB: HEAP ? allocated / 1024 / FRAMES : null,
    heapGrowthKB: loop.heapGrowth === null ? null : loop.heapGrowth / 1024 / FRAMES,
    calls: loop.render.calls,
    triangles: loop.render.triangles,
    pixels: loop.pixels,
    stages: loop.perf?.stagesMean ?? loop.perf?.stages ?? null, // moyenne par étape (?perf=1)
    graphics: loop.graphics,
    enemies: loop.enemies,
    topSites: [...sites.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([k, v]) => [k, Math.round(v / 1024 / FRAMES * 10) / 10]),
  };
}

const KEYS = ['frameMs', 'frameMean', 'frameP95', 'taskMs', 'scriptMs', 'styleMs', 'layoutMs', 'allocKB', 'heapGrowthKB', 'calls', 'triangles', 'pixels'];
const results = {};
// Passes alternées (référence, puis chaque préréglage, puis de nouveau la référence…) : l'ordre ne favorise aucune version.
const targets = REF ? [['ref', REF, [null]], ['tete', BASE, PRESETS]] : [['tete', BASE, PRESETS]];
const raw = new Map();
for (let p = 0; p < PASSES; p += 1) {
  for (const sc of SCENARIOS.filter((s) => SCEN.includes(s.id))) {
    for (const [label, base, presets] of targets) {
      for (const preset of presets) {
        const key = `${label}/${sc.id}/${preset ?? 'defaut'}`;
        if (!raw.has(key)) raw.set(key, []);
        raw.get(key).push(await run(base, sc, preset));
      }
    }
  }
}
for (const [label, , presets] of targets) {
  for (const sc of SCENARIOS.filter((s) => SCEN.includes(s.id))) {
    for (const preset of presets) {
      const passes = raw.get(`${label}/${sc.id}/${preset ?? 'defaut'}`);
      const med = Object.fromEntries(KEYS.map((k) => [k, median(passes.map((x) => x[k]))]));
      med.stages = passes[0].stages ? Object.fromEntries(Object.keys(passes[0].stages).map((k) => [k, median(passes.map((x) => x.stages?.[k]))])) : null;
      med.topSites = passes[Math.floor(passes.length / 2)].topSites;
      med.graphics = passes[0].graphics?.preset ?? null;
      const key = `${label}/${sc.id}/${preset ?? 'defaut'}`;
      results[key] = med;
      console.log(`${key} : image ${med.frameMs?.toFixed(2)} ms (moyenne ${med.frameMean?.toFixed(3)}, p95 ${med.frameP95?.toFixed(2)}), tâche ${med.taskMs?.toFixed(2)} ms, script ${med.scriptMs?.toFixed(2)}, style ${med.styleMs?.toFixed(3)}, mise en page ${med.layoutMs?.toFixed(3)}, alloc ${med.allocKB?.toFixed(1)} Ko/image, tas +${med.heapGrowthKB?.toFixed(2)} Ko/image, ${med.calls} appels, ${med.triangles} triangles, ${med.pixels} pixels`);
    }
  }
}

// Tableau en pourcentage de l'Élevé (ou de la version de référence avec --ref).
const pct = (a, b) => (Number.isFinite(a) && Number.isFinite(b) && b !== 0 ? `${Math.round((a / b) * 100)} %` : '—');
const rows = [];
for (const sc of SCEN) {
  const base = REF ? results[`ref/${sc}/defaut`] : results[`tete/${sc}/eleve`];
  for (const preset of PRESETS) {
    const r = results[`tete/${sc}/${preset}`];
    if (!r || !base) continue;
    rows.push(`| ${sc} | ${preset} | ${pct(r.triangles, base.triangles)} | ${pct(r.calls, base.calls)} | ${pct(r.pixels, base.pixels)} | ${pct(r.taskMs, base.taskMs)} | ${pct(r.frameMean, base.frameMean)} | ${pct(r.allocKB, base.allocKB)} | ${r.triangles} (marge ${45000 - r.triangles}) | ${r.calls} (marge ${400 - r.calls}) |`);
  }
}
const table = ['| Scénario | Préréglage | Triangles | Appels | Pixels | Tâche | Image | Allocations | Triangles (marge sous 45 000) | Appels (marge sous 400) |', '|---|---|---|---|---|---|---|---|---|---|', ...rows].join('\n');
console.log(`\nRendu logiciel : valeurs relatives seulement (${REF ? 'référence = --ref' : 'référence = eleve'}).\n${table}`);
mkdirSync(OUT, { recursive: true });
const file = join(OUT, `mesures-${Date.now()}.json`);
writeFileSync(file, JSON.stringify({ base: BASE, ref: REF, presets: PRESETS, scenarios: SCEN, passes: PASSES, frames: FRAMES, extra: EXTRA, perf: PERF, results, table }, null, 1));
console.log(`Résultats : ${file}`);
await browser.close();
server?.kill();
