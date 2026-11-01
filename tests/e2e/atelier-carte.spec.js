import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { waitReady } from './helpers.js';

// Lot 3g, partie B : la carte corrigée d'après le modèle (ecarts-decisions.json) dans le jeu. 667×375, step() et hooks ; les tests se désactivent
// seuls si WebGL manque.
const SIZE = { width: 667, height: 375 };
const load = (path) => JSON.parse(readFileSync(path, 'utf8'));
const world = load('data/game/maps/rez-de-chaussee/world.json');
const etageWorld = load('data/game/maps/rez-de-chaussee/etage.world.json');
const STATE = (page) => page.evaluate(() => window.__zs.getState());
const obstacle = (id) => world.obstacles.find((o) => o.id === id);
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

const push = (page, at, move, seconds = 2.5) => page.evaluate(([p, m, s]) => {
  const zs = window.__zs;
  zs.setPlayer(p[0], p[1]);
  zs.setInput({ move: m });
  zs.step(s);
  zs.setInput({});
  return zs.getState().player;
}, [at, move, seconds]);

test.describe('carte corrigée : collisions', () => {
  test('le joueur est bloqué par la rangée d\'étagères du modèle de l\'aile (P1+P2+R-G39)', async ({ page }) => {
    await open(page, '&wave=11');
    const b = obstacle('P1+P2+R-G39');
    expect(b).toBeTruthy();
    const p = await push(page, [b.x + b.w + 60, b.y + b.h / 2], { x: -1, y: 0 });
    expect(p.x).toBeGreaterThanOrEqual(b.x + b.w + 17);
  });

  test('le joueur est bloqué par l\'étagère du modèle P4 (mur sud de la poche)', async ({ page }) => {
    await open(page, '&wave=11');
    const b = obstacle('P4');
    expect(b).toMatchObject({ kind: 'etagere' });
    const p = await push(page, [b.x + b.w / 2, b.y - 60], { x: 0, y: 1 });
    expect(p.y).toBeLessThanOrEqual(b.y - 17);
  });

  test('le joueur est bloqué par le bloc P3+R-G37 (étagère du modèle contre le mur ouest de la poche)', async ({ page }) => {
    await open(page, '&wave=11');
    const b = obstacle('P3+R-G37');
    expect(b).toBeTruthy();
    const p = await push(page, [b.x + b.w + 60, b.y + b.h / 2], { x: -1, y: 0 });
    expect(p.x).toBeGreaterThanOrEqual(b.x + b.w + 17);
  });

  test('un zombie contourne le bloc P1+P2+R-G39 pour rejoindre le joueur', async ({ page }) => {
    await open(page, '&wave=11');
    const b = obstacle('P1+P2+R-G39');
    const r = await page.evaluate(([bx, by, bw, bh]) => {
      const zs = window.__zs;
      zs.setPlayer(bx + bw + 120, by + bh + 80);
      zs.setChutes(5);
      const id = zs.spawnEnemy(bx + bw + 120, by - 120, { mode: 'dedans' });
      let best = Infinity;
      for (let i = 0; i < 400; i += 1) {
        zs.step(0.05);
        const s = zs.getState();
        const z = s.enemies.find((e) => e.id === id);
        if (!z) break;
        best = Math.min(best, Math.hypot(z.x - s.player.x, z.y - s.player.y));
      }
      return best;
    }, [b.x, b.y, b.w, b.h]);
    expect(r).toBeLessThan(80);
  });
});

test.describe('fenêtre déplacée (U5) : siège et réparation', () => {
  test('U5 (x corrigé d\'après le modèle) : un zombie va à l\'emplacement, arrache les 4 planches, entre', async ({ page }) => {
    await open(page, '&wave=31&floor=1');
    const u5 = etageWorld.windows.find((w) => w.id === 'U5');
    expect(u5.x).toBe(U(217));
    const r = await page.evaluate(() => {
      const zs = window.__zs;
      zs.setChutes(5);
      const zid = zs.spawnAtWindow('U5', 'marcheur');
      let torn = false;
      let entered = false;
      for (let i = 0; i < 1800 && !entered; i += 1) {
        zs.step(0.05);
        const s = zs.getState();
        if (s.windows.find((q) => q.id === 'U5').planks === 0) torn = true;
        entered = s.enemies.find((e) => e.id === zid)?.mode === 'dedans';
      }
      return { torn, entered };
    });
    expect(r).toEqual({ torn: true, entered: true });
  });

  test('U5 : réparée depuis son point de réparation', async ({ page }) => {
    await open(page, '&wave=31&floor=1');
    const r = await page.evaluate(() => {
      const zs = window.__zs;
      zs.setPlanks('U5', 0);
      const w = zs.getState().windows.find((q) => q.id === 'U5');
      zs.setPlayer(w.repairSpot.x, w.repairSpot.y);
      zs.step(6);
      return zs.getState().windows.find((q) => q.id === 'U5').planks;
    });
    expect(r).toBeGreaterThanOrEqual(2);
  });
});

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

  test('?map=salle inchangé : 3 fenêtres, 14 meubles', async ({ page }) => {
    await open(page, '&map=salle');
    const s = await STATE(page);
    expect(s.map.id).toBe('salle');
    expect(s.windows.length).toBe(3);
    expect(s.obstacles.length).toBe(14);
  });
});

test.describe('budgets de rendu après la partie B (≤ référence + 300 triangles)', () => {
  for (const [id, sc] of Object.entries(SCENES)) {
    test(`${id} : appels et triangles`, async ({ page }, testInfo) => {
      await open(page, `${sc.url}&shadows=1`);
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
