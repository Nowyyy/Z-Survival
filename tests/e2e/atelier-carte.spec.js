import { test, expect } from '@playwright/test';
import { waitReady } from './helpers.js';

// Lot 3g, partie B : la carte corrigée d'après le modèle (ecarts-decisions.json) dans le jeu. 667×375, step() et hooks ; les tests se désactivent
// seuls si WebGL manque.
const SIZE = { width: 667, height: 375 };
// Références de rendu mesurées sur main au lancement du lot (scripts/modele/mesures-rendu.mjs) : appels et triangles, 10 zombies, ombres, cône.
const REF = { R1: [200, 14442], R2: [201, 14582], R3: [199, 13898], U1: [207, 14788], U4: [212, 15588] };
const U = (px) => px * 5 + 800;
const SCENES = {
  R1: { url: '&nospawn=1', at: [U(300), U(300)], floor: 'rdc', wave: 10 },
  R2: { url: '&nospawn=1', at: [U(311), U(335)], floor: 'rdc', wave: 10 },
  R3: { url: '&nospawn=1&wave=11', at: [U(110), U(120)], floor: 'rdc', wave: 11 },
  U1: { url: '&nospawn=1&wave=21&floor=1', at: [U(100), U(120)], floor: 'etage', wave: 21 },
  U4: { url: '&nospawn=1&wave=31&floor=1', at: [U(215), U(290)], floor: 'etage', wave: 31 },
};

async function open(page, extra = '') {
  await page.setViewportSize(SIZE);
  await page.goto(`/jeu.html?test=1&seed=1&vhs=0${extra.includes('nospawn') ? '' : '&nospawn=1'}${extra}`);
  await waitReady(page);
  await page.evaluate(() => { window.requestAnimationFrame = () => 0; });
  await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 150)));
  await page.evaluate(() => window.__zs.step(0.05));
}


test.describe('zones jouables sur la nouvelle géométrie', () => {
  for (const [wave, zones] of [[11, ['depart', 'aile']], [21, ['depart', 'aile', 'etage-gauche']], [31, ['depart', 'aile', 'etage-gauche', 'etage-droite']]]) {
    test(`?wave=${wave} : zones actives ${zones.join(', ')} ; les zombies apparaissent hors de la vue et entrent`, async ({ page }) => {
      await open(page, `&nospawn=0&wave=${wave}`);
      const r = await page.evaluate(() => {
        const zs = window.__zs;
        zs.setChutes(5);
        for (let i = 0; i < 40; i += 1) zs.step(0.5);
        const s = zs.getState();
        return { list: s.zones.list, log: s.spawnLog.map((l) => ({ id: l.id, hidden: l.hidden })), modes: s.enemies.map((e) => e.mode) };
      });
      expect(r.log.length).toBeGreaterThan(0);
      for (const l of r.log) expect(l.hidden, l.id).toBe(true);
      const active = (r.list ?? []).filter((z) => z.open).map((z) => z.id);
      for (const z of zones) expect(active, z).toContain(z);
    });
  }

  test('?wave=31 avec zombies : aucun zombie immobile plus de 2 s hors des états d\'attente pendant 90 s de simulation (même mesure que le lot 3b)', async ({ page }) => {
    await open(page, '&nospawn=0&wave=31');
    const r = await page.evaluate(() => {
      const zs = window.__zs;
      zs.setChutes(5);
      const still = new Map();
      let maxStill = 0;
      let where = null;
      let maxAlive = 0;
      for (let i = 0; i < 1800; i += 1) {
        zs.step(0.05);
        const s = zs.getState();
        maxAlive = Math.max(maxAlive, s.enemies.length);
        for (const e of s.enemies) {
          const wait = ['attente', 'arrache'].includes(e.mode);
          const gap = Math.hypot(e.x - s.player.x, e.y - s.player.y);
          const prev = still.get(e.id);
          const moved = !prev || Math.hypot(prev.x - e.x, prev.y - e.y) > 0.02;
          if (wait || moved || gap < 60 || e.mode === 'escalade') still.set(e.id, { x: e.x, y: e.y, t: 0 });
          else {
            const t = prev.t + 0.05;
            still.set(e.id, { x: e.x, y: e.y, t });
            if (t > maxStill) { maxStill = t; where = { id: e.id, mode: e.mode, x: e.x, y: e.y, floor: e.floor }; }
          }
        }
        if (s.dead) break;
      }
      return { maxStill, where, maxAlive };
    });
    expect(r.maxAlive).toBeLessThanOrEqual(10);
    expect(r.maxStill, JSON.stringify(r.where)).toBeLessThanOrEqual(2.05);
  });

});

// Mesurés avec ?detail=0 : le budget de la partie B porte sur la géométrie corrigée ; le décor léger et les textures de la partie C ont leurs
// propres budgets (tests/e2e/atelier-detail.spec.js : + 1 500 triangles et + 6 appels).
test.describe('budgets de rendu après la partie B (≤ référence + 300 triangles, sans le détail de la partie C)', () => {
  for (const [id, sc] of Object.entries(SCENES)) {
    test(`${id} : appels et triangles`, async ({ page }, testInfo) => {
      await open(page, `${sc.url}&shadows=1&detail=0&perso=actuel&sang=0`); // lot 3m : référence mesurée avec l'ancien modèle des personnages
      const r = await page.evaluate(({ at, floor, wave }) => {
        const zs = window.__zs;
        zs.setPlayer(at[0], at[1]);
        zs.setInput({ aim: { angle: Math.PI } });
        const T = ['marcheur', 'petit', 'voute', 'grand'];
        const G = ['lent', 'marche', 'rampe', 'course'];
        for (let i = 0; i < 10; i += 1) zs.spawnEnemy(at[0] + 40 + (i % 5) * 30, at[1] + (Math.floor(i / 5) - 0.5) * 60, { type: T[i % 4], gait: G[(i + Math.floor(i / 4)) % 4], wave, floor });
        zs.step(0.05);
        zs.sampleScreen(0, 0, 8, 8);
        return zs.getState().render;
      }, sc);
      testInfo.annotations.push({ type: 'rendu', description: `${id} : ${r.calls} appels, ${r.triangles} triangles (référence ${REF[id].join(' / ')})` });
      console.log(`BUDGET lot 3g-B ${id} : ${r.calls} appels, ${r.triangles} triangles (référence ${REF[id][0]} / ${REF[id][1]})`);
      expect(r.triangles).toBeLessThanOrEqual(REF[id][1] + 300);
      expect(r.calls).toBeLessThanOrEqual(REF[id][0] + 6);
    });
  }
});
