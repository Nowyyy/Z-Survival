// Lot 9e — Armes en main dans la partie (décisions du propriétaire : huit armes utilisables, chacune avec ses statistiques, le fusil à pompe tire
// plusieurs plombs, la vitesse du joueur dépend de l'arme en main ; le débogage donne une arme, remplit les munitions, rend les munitions
// illimitées ; une arme en main = un appel de dessin ; rien n'est écrit dans le stockage). ?test=1 : step() et le journal, jamais une durée réelle.
import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { waitReady } from './helpers.js';

const table = JSON.parse(readFileSync('data/game/armes-partie.json', 'utf8'));
const UTILES = Object.entries(table.armes).filter(([, e]) => e.active !== false).map(([id]) => id);
const S = (page) => page.evaluate(() => window.__zs.getState());

function watch(page) {
  const problems = [];
  const external = [];
  page.on('pageerror', (e) => problems.push(e.message));
  page.on('console', (m) => m.type() === 'error' && !/GL Driver Message/.test(m.text()) && problems.push(m.text()));
  page.on('request', (r) => {
    const u = r.url();
    if (!u.startsWith('http://localhost:4173/') && !u.startsWith('data:') && !u.startsWith('blob:')) external.push(u);
  });
  return { problems, external };
}

// Espion du stockage : aucune écriture (setItem, removeItem, clear).
const espion = () => {
  window.__ecritures = [];
  for (const f of ['setItem', 'removeItem', 'clear']) {
    const orig = Storage.prototype[f];
    Storage.prototype[f] = function patched(...a) {
      window.__ecritures.push(f);
      return orig.apply(this, a);
    };
  }
};

test.describe('armes en main', () => {
  test('les huit armes : chacune tire, tue un zombie, ralentit le joueur selon sa valeur ; le fusil à pompe tire 8 plombs ; même nombre d\'appels pour chaque arme', async ({ page }) => {
    test.setTimeout(120_000);
    const w = watch(page);
    await page.addInitScript(espion);
    await page.goto('/jeu.html?test=1&seed=2&nospawn=1&map=salle&lum=off&vhs=0');
    await waitReady(page);
    const r = await page.evaluate((ids) => {
      const zs = window.__zs;
      const out = [];
      for (const id of ids) {
        zs.killAll();
        zs.donnerArme(id);
        for (let i = 0; i < 30; i += 1) zs.step(0.05); // sortie de l'arme
        const p = zs.getState().player;
        const avant = zs.getState().shots.length;
        const kills = zs.getState().kills;
        const e = zs.spawnEnemy(p.x + 150, p.y, { type: 'marcheur', gait: 'lent', wave: 1 });
        let tue = false;
        for (let i = 0; i < 200 && !tue; i += 1) {
          zs.setInput({ aim: { angle: 0 } });
          zs.step(0.05);
          tue = !zs.getState().enemies.some((z) => z.id === e);
        }
        const s = zs.getState();
        out.push({ id, tue, kills: s.kills - kills, tirs: s.shots.length - avant, premier: s.shots.slice(avant, avant + 10).map((x) => x.time), armes: s.armes, calls: s.render.calls });
      }
      return out;
    }, UTILES);
    for (const x of r) {
      const e = table.armes[x.id];
      expect(x.armes.actif, x.id).toBe(x.id);
      expect(x.armes.montree, x.id).toBe(x.id);
      expect(x.armes.rendu, x.id).toEqual({ id: x.id, visible: true });
      expect(x.tue, x.id).toBe(true);
      expect(x.kills, x.id).toBe(1);
      expect(x.armes.vitesse, x.id).toBeCloseTo(220 * e.vitesse, 9);
      expect([x.armes.damage, x.armes.fireDelay, x.armes.fireRange, x.armes.plombs], x.id).toEqual([e.degats, e.cadence, e.portee, e.plombs]);
      expect(x.armes.bouche, x.id).toBeGreaterThan(26);
      expect(x.armes.triangles, x.id).toBeGreaterThan(200);
      expect(x.armes.triangles, x.id).toBeLessThanOrEqual(x.id === 'mg42' ? 700 : 400); // budgets du lot 9c (data/armes/armes.json : 400, lourde 700)
    }
    // Fusil à pompe : 8 plombs partis au même instant.
    const pompe = r.find((x) => x.id === 'winchester1897');
    expect(pompe.tirs % 8).toBe(0);
    expect(new Set(pompe.premier.slice(0, 8)).size).toBe(1);
    // Une arme en main = un appel : le même nombre d'appels pour chaque arme (même scène, même pose).
    expect(new Set(r.map((x) => x.calls)).size).toBe(1);
    expect(await page.evaluate(() => window.__ecritures.length)).toBe(0);
    expect(w.problems).toEqual([]);
    expect(w.external).toEqual([]);
  });

  test('arme en main = un appel de dessin de plus que le pistolet d\'avant (même scène, ?corps=avant)', async ({ page }) => {
    const calls = async (extra) => {
      await page.goto(`/jeu.html?test=1&seed=2&nospawn=1&map=salle&lum=off&vhs=0${extra}`);
      await waitReady(page);
      return page.evaluate(() => {
        window.__zs.setInput({ aim: { angle: 0.5 } });
        window.__zs.step(0.05);
        window.__zs.sampleScreen(0, 0, 2, 2);
        return window.__zs.getState().render.calls;
      });
    };
    const avant = await calls('&corps=avant');
    const apres = await calls('');
    expect(apres - avant).toBe(1);
  });

  test('débogage : « Donner une arme » (les huit, pas les armes spéciales), effet immédiat, rien n\'est écrit', async ({ page }) => {
    const w = watch(page);
    await page.addInitScript(espion);
    await page.goto('/jeu.html?test=1&seed=2&nospawn=1&map=salle&lum=off&vhs=0');
    await waitReady(page);
    await page.locator('#btn-pause').click();
    await page.getByRole('button', { name: 'Débogage', exact: true }).click();
    await expect(page.locator('#debug-panel')).toBeVisible();
    const boutons = page.locator('#debug-scroll [data-debug="donner-arme"] button');
    await expect(boutons).toHaveCount(8);
    expect(await boutons.evaluateAll((b) => b.map((x) => x.dataset.value))).toEqual(UTILES);
    await expect(page.locator('#debug-arme-panzerschreck')).toHaveCount(0);
    await page.locator('#debug-arme-mg42').click();
    await expect(page.locator('#debug-arme-mg42')).toHaveAttribute('aria-pressed', 'true');
    expect((await S(page)).armes.actif).toBe('mg42');
    expect(await page.evaluate(() => window.__ecritures.length)).toBe(0);
    expect(w.problems).toEqual([]);
  });
});
