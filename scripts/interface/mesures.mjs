// Atelier de l'interface (lot 3k) : mesure l'interface ACTUELLE du jeu (jeu.html, ?test=1) aux 7 tailles de data/game/ui-atelier.json, pour chaque
// écran et état atteignable par les hooks existants (js/atelier-interface/actuel.js). Imprime un tableau sur la sortie standard (--json : le relevé
// complet en JSON) ; n'écrit aucun fichier. Zones de sécurité : valeurs injectées dans la sonde du jeu (padding de .safe-probe), voir actuel.js.
// Usage : node scripts/interface/mesures.mjs [--json] [--sizes=667x375,1440x900] [--screens=hud,pause]
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { chromium } from '@playwright/test';
import { mockState, states } from '../../js/core/ui-mock.js';
import { backgroundsFrom, evaluate, tokensFromCss, compareBoxes } from '../../js/core/ui-measure.js';

const cfg = JSON.parse(readFileSync('data/game/ui-atelier.json', 'utf8'));
const tokens = tokensFromCss(readFileSync('css/tokens.css', 'utf8'));
const backgrounds = backgroundsFrom(tokens, cfg.worstBackgrounds);
const arg = (name) => process.argv.find((a) => a.startsWith(`--${name}=`))?.split('=')[1]?.split(',');
const asJson = process.argv.includes('--json');
const sizes = cfg.sizes.filter((s) => !arg('sizes') || arg('sizes').includes(s.id));
const PORT = 4173;
const BASE = `http://localhost:${PORT}/`;

// Écrans et états : le HUD dans chaque état nommé atteignable, puis les écrans pilotés par les hooks.
const named = Object.fromEntries(states(cfg).map((s) => [s.id, mockState(s.params, cfg)]));
const CASES = [
  ...['debut', 'combat', 'vie-faible', 'renforcee', 'etage', 'essai', 'pire-cas'].map((id) => ({ screen: 'hud', state: id })),
  { screen: 'pause', state: 'pause' }, { screen: 'fin-mort', state: 'mort' }, { screen: 'fin-monde', state: 'monde-termine' },
  { screen: 'a-terre', state: 'a-terre' }, { screen: 'a-terre', state: 'protege' }, { screen: 'sticks', state: 'combat' },
].filter((c) => !arg('screens') || arg('screens').includes(c.screen));

async function serverUp() {
  try {
    return (await fetch(BASE)).ok;
  } catch {
    return false;
  }
}

let server = null;
if (!(await serverUp())) {
  server = spawn('node', ['scripts/serve.mjs'], { stdio: 'ignore' });
  for (let i = 0; i < 50 && !(await serverUp()); i += 1) await new Promise((r) => setTimeout(r, 100));
}
const browser = await chromium.launch();

async function measureCase(size, c) {
  const context = await browser.newContext({ viewport: { width: size.width, height: size.height }, locale: 'fr-FR' });
  const page = await context.newPage();
  const state = named[c.state];
  const { actuelUrl } = await import('../../js/atelier-interface/actuel.js');
  await page.goto(BASE + actuelUrl(state, { vhs: false }));
  await page.waitForFunction(() => (window.__zs?.getState()?.time ?? 0) > 0.05 || document.getElementById('game-error')?.hidden === false, null, { timeout: 60_000 });
  if (await page.locator('#game-error').isVisible()) {
    await context.close();
    return { size: size.id, ...c, error: 'WebGL indisponible' };
  }
  const raw = await page.evaluate(async ({ screen, state, safe, size: sz }) => {
    const a = await import('./js/atelier-interface/actuel.js');
    const m = await import('./js/atelier-interface/measure-dom.js');
    const vars = a.injectSafeArea(document, safe);
    const drive = a.driveActuel(window, screen, state);
    await new Promise((r) => setTimeout(r, 80));
    const modal = screen === 'pause' || screen.startsWith('fin');
    const measure = m.collect(document, { root: document.body, viewport: { width: sz.width, height: sz.height }, safe, modal, hudNames: a.ACTUEL_HUD_NAMES, items: a.actuelItems(screen) });
    return { measure, drive, vars, dom: m.domCount(document.getElementById('game-root')) };
  }, { screen: c.screen, state, safe: size.safe, size });
  await context.close();
  const verdict = evaluate(raw.measure, backgrounds, cfg.rules);
  return { size: size.id, ...c, drive: raw.drive, safeVars: raw.vars, dom: raw.dom, verdict, elements: raw.measure.elements.map((e) => ({ name: e.name, box: Object.fromEntries(Object.entries(e.box).map(([k, v]) => [k, Math.round(v * 10) / 10])), texts: e.texts.map((t) => ({ text: t.text, px: t.px })) })) };
}

// Stabilité : boîtes de #hud, #hud-money, #hud-wave, #btn-pause quand l'argent, la vague et la vie parcourent leur plage.
async function stability(size) {
  const context = await browser.newContext({ viewport: { width: size.width, height: size.height } });
  const page = await context.newPage();
  await page.goto(`${BASE}jeu.html?test=1&seed=1&vhs=0`);
  await page.waitForFunction(() => (window.__zs?.getState()?.time ?? 0) > 0.05, null, { timeout: 60_000 });
  const result = await page.evaluate(async () => {
    const m = await import('./js/atelier-interface/measure-dom.js');
    window.requestAnimationFrame = () => 0;
    const zs = window.__zs;
    const items = ['hud', 'hud-money', 'hud-wave', 'btn-pause'].map((id) => ({ name: id, selector: `#${id}` }));
    zs.step(3.3);
    const snaps = [m.boxesOf(document, items)];
    for (const money of [9, 99, 999, 9999, 99_999, 999_999, 9_000_000]) {
      zs.giveMoney(money);
      zs.step(1.5);
      snaps.push(m.boxesOf(document, items));
    }
    for (const w of [9, 10, 40]) {
      zs.startWave(w);
      zs.step(3.3);
      snaps.push(m.boxesOf(document, items));
    }
    zs.setChutes(5);
    zs.step(0.1);
    snaps.push(m.boxesOf(document, items));
    return snaps;
  });
  await context.close();
  let max = 0;
  const moved = new Set();
  for (const s of result.slice(1)) {
    const d = compareBoxes(result[0], s, 0.5);
    max = Math.max(max, d.max);
    for (const mv of d.moved) moved.add(mv.name);
  }
  return { size: size.id, maxDelta: max, moved: [...moved] };
}

// CLS au chargement avec les données retardées de 400 ms.
async function cls(size) {
  const context = await browser.newContext({ viewport: { width: size.width, height: size.height } });
  const page = await context.newPage();
  await page.route(/\/data\/.*\.json$/, async (route) => {
    await new Promise((r) => setTimeout(r, 400));
    await route.continue();
  });
  await page.addInitScript(() => {
    window.__cls = 0;
    new PerformanceObserver((l) => {
      for (const e of l.getEntries()) if (!e.hadRecentInput) window.__cls += e.value;
    }).observe({ type: 'layout-shift', buffered: true });
  });
  await page.goto(`${BASE}jeu.html?test=1&seed=1&vhs=0`);
  await page.waitForFunction(() => (window.__zs?.getState()?.time ?? 0) > 0.5, null, { timeout: 90_000 });
  const value = await page.evaluate(() => window.__cls);
  await context.close();
  return { size: size.id, cls: Math.round(value * 10_000) / 10_000 };
}

const results = [];
const queue = sizes.flatMap((size) => CASES.map((c) => ({ size, c })));
const workers = Array.from({ length: 3 }, async () => {
  while (queue.length) {
    const { size, c } = queue.shift();
    results.push(await measureCase(size, c));
  }
});
await Promise.all(workers);
const stab = [];
const clsRows = [];
for (const size of sizes) {
  stab.push(await stability(size));
  clsRows.push(await cls(size));
}
await browser.close();
server?.kill();

const order = (r) => sizes.findIndex((s) => s.id === r.size) * 100 + CASES.findIndex((c) => c.screen === r.screen && c.state === r.state);
results.sort((a, b) => order(a) - order(b));
if (asJson) {
  console.log(JSON.stringify({ results, stability: stab, cls: clsRows }, null, 2));
} else {
  console.log('taille      | écran     | état        | part HUD | texte min | cible min | contraste min | hors cible (règles)                 | notes');
  for (const r of results) {
    if (r.error) {
      console.log(`${r.size.padEnd(11)} | ${r.screen.padEnd(9)} | ${r.state.padEnd(11)} | ${r.error}`);
      continue;
    }
    const v = r.verdict;
    const rules = [...new Set(v.outOfTarget.map((o) => o.rule))];
    console.log(`${r.size.padEnd(11)} | ${r.screen.padEnd(9)} | ${r.state.padEnd(11)} | ${(v.coverage * 100).toFixed(1).padStart(6)} % | ${String(v.minTextPx).padStart(9)} | ${String(v.minTargetPx).padStart(9)} | ${String(v.minContrast).padStart(13)} | ${`${v.outOfTarget.length} (${rules.join(', ')})`.padEnd(35)} | ${r.drive.notes.join(' ; ')}`);
  }
  console.log('\nBoîtes (HUD, état « combat ») :');
  for (const r of results.filter((x) => x.screen === 'hud' && x.state === 'combat' && !x.error)) {
    console.log(`${r.size} : ${r.elements.map((e) => `${e.name} ${e.box.left},${e.box.top} ${e.box.width}×${e.box.height}`).join(' ; ')}`);
  }
  console.log('\nBoîtes (autres écrans) :');
  for (const r of results.filter((x) => x.screen !== 'hud' && !x.error)) {
    const keep = r.elements.filter((e) => !['hud', 'argent', 'vague', 'pause', 'gain'].includes(e.name));
    console.log(`${r.size} ${r.screen}/${r.state} : ${keep.map((e) => `${e.name} ${e.box.left},${e.box.top} ${e.box.width}×${e.box.height}`).join(' ; ')}`);
  }
  console.log('\nHors cible (détail, premier état de chaque taille) :');
  for (const r of results.filter((x) => !x.error)) {
    for (const o of r.verdict.outOfTarget) console.log(`${r.size} ${r.screen}/${r.state} : ${o.rule} ${o.element} = ${o.measure ?? '—'} (cible ${o.limit}) : ${o.reason}`);
  }
  console.log('\nStabilité (argent 0 → 9 999 999, vague 1 → 40, 5 chutes) :');
  for (const s of stab) console.log(`${s.size} : déplacement max ${s.maxDelta} px${s.moved.length ? ` (${s.moved.join(', ')})` : ''}`);
  console.log('\nCLS (données retardées de 400 ms) :');
  for (const c of clsRows) console.log(`${c.size} : ${c.cls}`);
}
