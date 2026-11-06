// Lot 4f-A — Décomposition du temps de chargement de jeu.html?test=1 selon des paramètres existants (aucune modification du jeu).
//
// Usage : node scripts/tests/chargement.mjs [--passes 5] [--projet bureau|mobile] [--combos defaut,vhs0,...] [--json <sortie>]
// Pour chaque combinaison : <passes> chargements, chacun dans un contexte neuf (comme un test Playwright, cache vide), un à la fois.
// Mesures (performance.now() de la page, origine = début de la navigation) :
//   hook : window.__zs défini ; pret : premier pas de simulation (getState().time > 0,05 : critère de waitReady, tests/e2e/helpers.js) ;
//   goto : durée de page.goto côté Playwright (événement load) ; total : début de goto → pret, côté Playwright.
// Résultat : médiane, minimum, maximum et écart interquartile par combinaison, gain par rapport à « defaut ».
// Serveur : celui de scripts/serve.mjs sur le port 4173 (démarré ici s'il ne répond pas).
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium, devices } from 'playwright';

const ROOT = resolve(import.meta.dirname, '..', '..');
const args = process.argv.slice(2);
const val = (n, d) => {
  const i = args.indexOf(n);
  return i < 0 ? d : args[i + 1];
};
const BASE = 'http://localhost:4173';
export const COMBOS = {
  defaut: '',
  vhs0: '&vhs=0',
  shadows0: '&shadows=0',
  dpr1: '&dpr=1',
  sang0: '&sang=0',
  detail0: '&detail=0',
  fps1: '&fps=1',
  nospawn1: '&nospawn=1',
  empty1: '&empty=1',
  rendu: '&vhs=0&shadows=0&dpr=1', // rendu seulement : ni la logique, ni le sang, ni le décor
  rapide: '&vhs=0&shadows=0&dpr=1&sang=0&nospawn=1',
  rapideDetail0: '&vhs=0&shadows=0&dpr=1&sang=0&nospawn=1&detail=0',
};
const passes = Number(val('--passes', 5));
const projet = val('--projet', 'bureau');
const noms = (val('--combos') ?? Object.keys(COMBOS).join(',')).split(',');

const repond = async () => {
  try {
    return (await fetch(`${BASE}/jeu.html`)).ok;
  } catch {
    return false;
  }
};
let serveur = null;
if (!(await repond())) {
  serveur = spawn('node', ['scripts/serve.mjs'], { cwd: ROOT, stdio: 'ignore' });
  for (let i = 0; i < 100 && !(await repond()); i += 1) await new Promise((r) => setTimeout(r, 100));
}
const q = (l, p) => {
  const s = [...l].sort((a, b) => a - b);
  const x = (s.length - 1) * p;
  return Math.round(s[Math.floor(x)] + (s[Math.ceil(x)] - s[Math.floor(x)]) * (x - Math.floor(x)));
};
const stats = (l) => ({ mediane: q(l, 0.5), min: Math.min(...l), max: Math.max(...l), eiq: q(l, 0.75) - q(l, 0.25) });

const browser = await chromium.launch();
// Paysage 667×375 dans les deux cas, comme les tests (en portrait, le jeu ne démarre pas la partie).
const usage = projet === 'mobile' ? { ...devices['Pixel 5'], viewport: { width: 667, height: 375 } } : { viewport: { width: 667, height: 375 } };
const resultats = {};
for (const nom of noms) {
  const mesures = [];
  for (let i = 0; i < passes; i += 1) {
    const context = await browser.newContext({ ...usage, locale: 'fr-FR' });
    const page = await context.newPage();
    await page.addInitScript(() => {
      const m = { hook: null, pret: null };
      window.__chargement = m;
      const id = setInterval(() => {
        if (m.hook === null && window.__zs) m.hook = performance.now();
        if (m.hook !== null && (window.__zs.getState()?.time ?? 0) > 0.05) {
          m.pret = performance.now();
          clearInterval(id);
        }
      }, 5);
    });
    const t0 = Date.now();
    await page.goto(`${BASE}/jeu.html?test=1&seed=1${COMBOS[nom]}`);
    const goto = Date.now() - t0;
    await page.waitForFunction(() => window.__chargement?.pret !== null, null, { timeout: 60_000, polling: 10 });
    const total = Date.now() - t0;
    const m = await page.evaluate(() => window.__chargement);
    mesures.push({ hook: Math.round(m.hook), pret: Math.round(m.pret), goto, total });
    await context.close();
  }
  resultats[nom] = { parametres: COMBOS[nom], passes: mesures, hook: stats(mesures.map((m) => m.hook)), pret: stats(mesures.map((m) => m.pret)), total: stats(mesures.map((m) => m.total)) };
  const r = resultats[nom];
  console.log(`${projet} ${nom.padEnd(14)} hook ${r.hook.mediane} ms · prêt ${r.pret.mediane} ms (min ${r.pret.min}, max ${r.pret.max}, EIQ ${r.pret.eiq}) · total ${r.total.mediane} ms`);
}
await browser.close();
if (serveur) serveur.kill();
const ref = resultats.defaut?.total.mediane;
if (ref) for (const r of Object.values(resultats)) r.gainMs = ref - r.total.mediane;
if (val('--json')) writeFileSync(val('--json'), `${JSON.stringify({ projet, passes, date: new Date().toISOString(), resultats }, null, 1)}\n`);
