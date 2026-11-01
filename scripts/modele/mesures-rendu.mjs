// Mesures de rendu du lot 3g (appels de dessin et triangles) dans les scénarios de référence R1, R2, R3, U1, U4, V1, V2.
// Usage : BASE=http://localhost:4173 node scripts/modele/mesures-rendu.mjs [paramètres d'URL ajoutés, ex. "&detail=0"]
// Serveur attendu à BASE (node scripts/serve.mjs). 10 zombies variés près du joueur (sauf V : visite sans zombie), ombres actives, cône
// affiché (visée fixe), 667 × 375, étapes de jeu par step() (jamais une durée réelle). WebGL logiciel : aucune conclusion de vitesse.
import { chromium } from '@playwright/test';

const BASE = process.env.BASE ?? 'http://localhost:4173';
const EXTRA = process.argv[2] ?? '';
// Position du joueur en unités du jeu (pixels du plan × 5 + 800).
const U = (px) => px * 5 + 800;
export const SCENARIOS = [
  { id: 'R1', url: '&nospawn=1', at: [U(300), U(300)], floor: 'rdc', wave: 10, note: 'centre de la grande salle' },
  { id: 'R2', url: '&nospawn=1', at: [U(311), U(335)], floor: 'rdc', wave: 10, note: 'près de la fenêtre F6 (sud)' },
  { id: 'R3', url: '&nospawn=1&wave=11', at: [U(110), U(120)], floor: 'rdc', wave: 11, note: 'aile (porte 1 ouverte)' },
  { id: 'U1', url: '&nospawn=1&wave=21&floor=1', at: [U(100), U(120)], floor: 'etage', wave: 21, note: 'centre de etage-gauche' },
  { id: 'U4', url: '&nospawn=1&wave=31&floor=1', at: [U(215), U(290)], floor: 'etage', wave: 31, note: 'etage-droite' },
  { id: 'V1', url: '&nospawn=1&wave=31', at: [U(300), U(300)], floor: 'rdc', zombies: 0, note: 'visite, grande salle' },
  { id: 'V2', url: '&nospawn=1&wave=31&floor=1', at: [U(100), U(120)], floor: 'etage', zombies: 0, note: 'visite, étage gauche' },
];

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 667, height: 375 } });
const rows = [];
for (const sc of SCENARIOS) {
  await page.goto(`${BASE}/jeu.html?test=1&seed=1&vhs=0&shadows=1${sc.url}${EXTRA}`);
  await page.waitForFunction(() => window.__zs?.getState, null, { timeout: 120000 });
  await page.evaluate(() => { window.requestAnimationFrame = () => 0; });
  await page.evaluate(() => new Promise((r) => setTimeout(r, 150)));
  const r = await page.evaluate(({ at, floor, wave, zombies }) => {
    const zs = window.__zs;
    zs.step(0.05);
    zs.setPlayer(at[0], at[1]);
    zs.setInput({ aim: { angle: Math.PI } });
    const T = ['marcheur', 'petit', 'voute', 'grand'];
    const G = ['lent', 'marche', 'rampe', 'course'];
    const n = zombies ?? 10;
    for (let i = 0; i < n; i += 1) zs.spawnEnemy(at[0] + 40 + (i % 5) * 30, at[1] + (Math.floor(i / 5) - 0.5) * 60, { type: T[i % 4], gait: G[(i + Math.floor(i / 4)) % 4], wave, floor });
    zs.step(0.05);
    zs.sampleScreen(0, 0, 8, 8);
    const s = zs.getState();
    return { calls: s.render.calls, triangles: s.render.triangles, enemies: s.enemies.length, floor: s.floor.current, textures: s.textures };
  }, sc);
  rows.push({ id: sc.id, note: sc.note, ...r });
  console.log(`${sc.id} (${sc.note}) : ${r.calls} appels, ${r.triangles} triangles, ${r.enemies} zombies, étage ${r.floor}`);
}
console.log(JSON.stringify({ extra: EXTRA, rows: rows.map((x) => ({ ...x, textures: undefined })), textures: rows[0]?.textures }));
await browser.close();
