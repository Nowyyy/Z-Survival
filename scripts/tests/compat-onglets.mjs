#!/usr/bin/env node
// Lot 5o : compatibilité de la sauvegarde partagée entre versions (même origine, même clé zs.save.v1). Le site est assemblé en local
// (scripts/site/local.mjs --main HEAD --dev HEAD --archive origin/archive --assembleur dev, dans un dossier temporaire), servi sous /Z-Survival/,
// puis trois onglets d'un même navigateur (canal « chrome » comme en CI, ou ONGLETS_CANAL=chromium) écrivent CHACUN À LEUR TOUR dans la même
// sauvegarde : /Recette/jeu.html et /dev/jeu.html (code de ce lot : deux onglets, donc identifiant d'écriture `w`) et /v0.5/jeu.html (ancien code).
// À chaque pas : la valeur stockée est relue et comparée à l'attendu (argent, gagné, records, rev) ; aucune donnée perdue ni corrompue dans les
// deux sens (l'ancien lit ce qu'écrit le nouveau, `w` compris ; le nouveau lit ce qu'écrit l'ancien). Jamais lancé par la CI.
//   node scripts/tests/compat-onglets.mjs [--archive v0.5] [--sans-assemblage <dossier déjà assemblé>]
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { chromium } from '@playwright/test';

const ROOT = resolve(new URL('../../', import.meta.url).pathname);
const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
const archive = opt('archive', 'v0.5');
const KEY = 'zs.save.v1';
const PORT = 4186;
const BASE = `http://localhost:${PORT}/Z-Survival/`;

const tmp = mkdtempSync(join(tmpdir(), 'zs-compat-'));
let site = opt('sans-assemblage', null);
let server = null;
let browser = null;
let code = 0;
try {
  if (!site) {
    site = join(tmp, 'site');
    const r = spawnSync('node', ['scripts/site/local.mjs', '--main', 'HEAD', '--dev', 'HEAD', '--archive', 'origin/archive', '--assembleur', 'dev', '--out', site], { cwd: ROOT, stdio: 'inherit' });
    if (r.status !== 0) throw new Error('assemblage en échec');
  }
  server = spawn('node', ['scripts/site/serve.mjs', '--root', site, '--port', String(PORT), '--base', '/Z-Survival/'], { cwd: ROOT, stdio: 'ignore' });
  await new Promise((r) => setTimeout(r, 800));
  browser = await chromium.launch(process.env.ONGLETS_CANAL === 'chromium' ? {} : { channel: 'chrome' });
  const context = await browser.newContext({ viewport: { width: 667, height: 375 } });
  const problems = [];
  const open = async (path) => {
    const page = await context.newPage();
    page.on('pageerror', (e) => problems.push(`${path} : ${e.message}`));
    await page.goto(`${BASE}${path}?test=1&store=local&seed=1`);
    await page.waitForFunction(() => (window.__zs?.getState()?.time ?? 0) > 0.05, null, { timeout: 90_000 });
    await page.evaluate(() => { window.requestAnimationFrame = () => 0; });
    return page;
  };
  const stored = (page) => page.evaluate((k) => JSON.parse(localStorage.getItem(k)), KEY);
  const gain = async (page, n) => {
    await page.evaluate((m) => window.__zs.giveMoney(m), n);
    return page.evaluate(() => window.__zs.flushSave());
  };
  const recette = await open('Recette/jeu.html');
  const devTab = await open('dev/jeu.html');
  const old = await open(`${archive}/jeu.html`);
  await new Promise((r) => setTimeout(r, 500)); // annonces entre les deux onglets du nouveau code
  const steps = [];
  let expected = { money: 0, earned: 0, rev: 0 };
  const check = async (label, writer, n) => {
    const r = await gain(writer, n);
    expected = { money: expected.money + n, earned: expected.earned + n, rev: expected.rev + 1 };
    // La valeur écrite doit être visible de tous les onglets (le stockage peut avoir quelques millisecondes de retard).
    const views = [];
    for (const p of [recette, devTab, old]) {
      let s = null;
      for (let k = 0; k < 50; k += 1) {
        s = await stored(p);
        if (s?.rev === expected.rev) break;
        await new Promise((res) => setTimeout(res, 20));
      }
      views.push(s);
    }
    const s = views[0];
    const ok = r.ok === true && views.every((v) => v?.money === expected.money && v?.earned === expected.earned && v?.rev === expected.rev && v?.v === 1 && typeof v?.stats === 'object' && typeof v?.records === 'object');
    steps.push({ pas: label, ecrit: r.ok, money: s?.money, earned: s?.earned, rev: s?.rev, w: s?.w ?? null, cles: Object.keys(s ?? {}).join(','), ok });
    if (!ok) code = 1;
  };
  await check('nouveau (Recette) +10', recette, 10);
  await check(`ancien (${archive}) +5 après le nouveau`, old, 5);
  await check('nouveau (dev) +7 après l\'ancien', devTab, 7);
  await check(`ancien (${archive}) +3 après le nouveau (avec w)`, old, 3);
  await check('nouveau (Recette) +1', recette, 1);
  // Le solde affiché par chaque onglet suit la sauvegarde (signal storage) : relu dans getState().save.
  await new Promise((r) => setTimeout(r, 300));
  const balances = [];
  for (const p of [recette, devTab, old]) balances.push(await p.evaluate(() => window.__zs.getState().save.balance));
  for (const s of steps) console.log(JSON.stringify(s));
  console.log(JSON.stringify({ soldes: { recette: balances[0], dev: balances[1], [archive]: balances[2] }, attendu: expected.money, erreurs: problems }));
  if (balances.some((b) => b !== expected.money) || problems.length) code = 1;
  console.log(`compat-onglets : ${steps.filter((s) => s.ok).length}/${steps.length} pas conformes, soldes ${balances.join(' / ')} pour ${expected.money} attendu ; ${code ? 'ÉCHEC' : 'aucune donnée perdue ni corrompue'}`);
} catch (error) {
  console.error(error);
  code = 1;
} finally {
  await browser?.close();
  server?.kill();
  rmSync(tmp, { recursive: true, force: true });
}
process.exit(code);
