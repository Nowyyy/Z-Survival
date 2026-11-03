import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { waitReady } from './helpers.js';
import { findPath, loadMap, makeGrid, zonePoint } from './visite-chemins.js';
import { visitWave } from '../../js/core/visite.js';

// Lot 3g, partie A : visite libre = jeu.html?nospawn=1&wave=N_VISITE (aucun paramètre ajouté au jeu). Tout passe par step() et les hooks
// de ?test=1 ; 667×375 ; les chemins à pied sont calculés côté Node (tests/e2e/visite-chemins.js) d'après les données de la carte.
const SIZE = { width: 667, height: 375 };
const N = visitWave(JSON.parse(readFileSync('data/game/maps/rez-de-chaussee/zones.json', 'utf8')));
const MAP = loadMap();
const STATE = (page) => page.evaluate(() => window.__zs.getState());
const trigRects = (floor) => MAP.zones.stairs.map((s) => s.floors[floor]?.trigger).filter(Boolean);
const GRID = { rdc: makeGrid(MAP, 'rdc', 21, trigRects('rdc')), etage: makeGrid(MAP, 'etage', 21, trigRects('etage')) };
const zone = (id) => MAP.zones.zones.find((z) => z.id === id);

async function open(page, extra = '') {
  await page.setViewportSize(SIZE);
  await page.goto(`/jeu.html?test=1&seed=1&vhs=0&nospawn=1&wave=${N}${extra}`);
  await waitReady(page);
  await page.evaluate(() => { window.requestAnimationFrame = () => 0; });
  await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 150)));
  await page.evaluate(() => window.__zs.step(0.05));
}

// Suit des points (unités) avec setInput, par pas de 0,05 s ; s'arrête si le joueur n'avance plus pendant 3 s. Renvoie l'état final.
const follow = (page, pts, limit = 90) => page.evaluate(([list, max]) => {
  const zs = window.__zs;
  let i = 0;
  let t = 0;
  let best = Infinity;
  let since = 0;
  while (i < list.length && t < max) {
    const p = zs.getState().player;
    const q = list[i];
    const d = Math.hypot(q.x - p.x, q.y - p.y);
    if (d < 14) { i += 1; best = Infinity; since = 0; continue; }
    if (d < best - 1) { best = d; since = 0; } else since += 0.05;
    if (since > 3) break;
    zs.setInput({ move: { x: (q.x - p.x) / d, y: (q.y - p.y) / d } });
    zs.step(0.05);
    t += 0.05;
  }
  zs.setInput({});
  zs.step(0.05);
  const s = zs.getState();
  return { reached: i >= list.length, x: s.player.x, y: s.player.y, t, floor: s.floor.current, walk: s.floor.walk };
}, [pts, limit]);

// Marche jusqu'à un point de l'étage courant par un chemin calculé.
async function walkTo(page, floor, target) {
  const s = await STATE(page);
  const path = findPath(GRID[floor], s.player, target);
  expect(path, `chemin vers ${target.x}, ${target.y}`).not.toBeNull();
  const r = await follow(page, path);
  expect(r.reached, `atteint ${target.x}, ${target.y} (arrêt en ${Math.round(r.x)}, ${Math.round(r.y)})`).toBe(true);
  return r;
}

// Prend un escalier à pied : marche jusqu'à l'abord de la zone de déclenchement, entre en allant vers l'escalier, suit walk.path jusqu'au bout.
async function takeStairs(page, id, from) {
  const st = MAP.zones.stairs.find((s) => s.id === id);
  const path = from === 'rdc' ? st.walk.path : [...st.walk.path].reverse();
  const dir = { x: path[1].x - path[0].x, y: path[1].y - path[0].y };
  const len = Math.hypot(dir.x, dir.y);
  const d = { x: dir.x / len, y: dir.y / len };
  const trig = st.floors[from].trigger;
  const c = { x: trig.x + trig.w / 2, y: trig.y + trig.h / 2 };
  // Jusqu'au centre de la zone de déclenchement, par une grille où seule cette zone est traversable (on peut y entrer en chemin : c'est le but).
  const grid = makeGrid(MAP, from, 21, MAP.zones.stairs.filter((q) => q.id !== id).map((q) => q.floors[from]?.trigger).filter(Boolean));
  const s0 = await STATE(page);
  const route = findPath(grid, s0.player, c);
  expect(route, `chemin vers l'escalier ${id}`).not.toBeNull();
  await follow(page, route);
  return page.evaluate(([pts, dd, tr]) => {
    const zs = window.__zs;
    let t = 0;
    const inside = (p) => p.x >= tr.x && p.x <= tr.x + tr.w && p.y >= tr.y && p.y <= tr.y + tr.h;
    // Vers le centre de la zone de déclenchement (on peut arriver de côté), puis vers l'escalier.
    while (zs.getState().floor.walk === null && !inside(zs.getState().player) && t < 4) {
      const p = zs.getState().player;
      const m = Math.hypot(tr.x + tr.w / 2 - p.x, tr.y + tr.h / 2 - p.y) || 1;
      zs.setInput({ move: { x: (tr.x + tr.w / 2 - p.x) / m, y: (tr.y + tr.h / 2 - p.y) / m } });
      zs.step(0.05);
      t += 0.05;
    }
    while (zs.getState().floor.walk === null && t < 8) { zs.setInput({ move: dd }); zs.step(0.05); t += 0.05; }
    const entered = zs.getState().floor.walk !== null;
    let i = 1;
    while (zs.getState().floor.walk !== null && t < 20) {
      const p = zs.getState().player;
      const q = pts[Math.min(i, pts.length - 1)];
      const dist = Math.hypot(q.x - p.x, q.y - p.y);
      if (dist < 10 && i < pts.length - 1) { i += 1; continue; }
      const last = i >= pts.length - 1 && dist < 10;
      const mv = last ? { x: pts.at(-1).x - pts.at(-2).x, y: pts.at(-1).y - pts.at(-2).y } : { x: q.x - p.x, y: q.y - p.y };
      const m = Math.hypot(mv.x, mv.y) || 1;
      zs.setInput({ move: { x: mv.x / m, y: mv.y / m } });
      zs.step(0.05);
      t += 0.05;
    }
    // Quelques pas de plus dans le sens de la sortie : le joueur quitte la zone de déclenchement d'arrivée.
    const out = { x: pts.at(-1).x - pts.at(-2).x, y: pts.at(-1).y - pts.at(-2).y };
    const ol = Math.hypot(out.x, out.y) || 1;
    zs.setInput({ move: { x: out.x / ol, y: out.y / ol } });
    zs.step(0.6);
    zs.setInput({});
    zs.step(0.1);
    const s = zs.getState();
    return { entered, floor: s.floor.current, walk: s.floor.walk, elevation: s.floor.elevation };
  }, [path, d, trig]);
}

test.describe('visite libre : définition', () => {

  test('aucune sauvegarde : rien n\'est écrit dans le stockage du navigateur', async ({ page }) => {
    await open(page);
    await page.evaluate(() => window.__zs.step(30));
    expect(await page.evaluate(() => [localStorage.length, sessionStorage.length])).toEqual([0, 0]);
  });

});

test.describe('visite libre : à pied', () => {
  test('rez-de-chaussée : le joueur atteint un point de chaque zone (départ, aile) et revient au départ', async ({ page }) => {
    test.setTimeout(180_000);
    await open(page);
    const start = (await STATE(page)).player;
    for (const id of ['depart', 'aile']) {
      const p = zonePoint(MAP, GRID.rdc, zone(id));
      expect(p, id).not.toBeNull();
      await walkTo(page, 'rdc', p);
    }
    const back = await walkTo(page, 'rdc', start);
    expect(Math.hypot(back.x - start.x, back.y - start.y)).toBeLessThan(20);
    expect(back.floor).toBe('rdc');
  });

  test('étage : monte par l\'escalier de l\'aile, atteint etage-gauche et etage-droite, redescend par l\'escalier de départ', async ({ page }) => {
    test.setTimeout(240_000);
    await open(page);
    const up = await takeStairs(page, 'escalier-aile', 'rdc');
    expect(up).toMatchObject({ entered: true, floor: 'etage', walk: null });
    for (const id of ['etage-gauche', 'etage-droite']) await walkTo(page, 'etage', zonePoint(MAP, GRID.etage, zone(id)));
    const down = await takeStairs(page, 'escalier-depart', 'etage');
    expect(down).toMatchObject({ entered: true, floor: 'rdc', walk: null, elevation: 0 });
  });

  test('étage : monte par l\'escalier de départ et redescend par celui de l\'aile', async ({ page }) => {
    test.setTimeout(240_000);
    await open(page);
    const up = await takeStairs(page, 'escalier-depart', 'rdc');
    expect(up).toMatchObject({ entered: true, floor: 'etage', walk: null });
    const down = await takeStairs(page, 'escalier-aile', 'etage');
    expect(down).toMatchObject({ entered: true, floor: 'rdc', walk: null, elevation: 0 });
    expect((await STATE(page)).enemies).toEqual([]);
  });

  test('le joueur est bloqué par un mur (nord de la grande salle) et par une fenêtre (F6, sud)', async ({ page }) => {
    await open(page);
    const f4 = MAP.layouts.rdc.windows.find((w) => w.id === 'F4');
    const f6 = MAP.layouts.rdc.windows.find((w) => w.id === 'F6');
    // Mur : à 150 à l'est de F4, vers le nord.
    await walkTo(page, 'rdc', { x: f4.x + 150, y: f4.y + 120 });
    const wall = await page.evaluate(() => { const zs = window.__zs; zs.setInput({ move: { x: 0, y: -1 } }); zs.step(3); zs.setInput({}); return zs.getState().player; });
    expect(wall.y).toBeGreaterThan(f4.y + 15);
    // Fenêtre : face à F6, vers le sud (dehors).
    await walkTo(page, 'rdc', { x: f6.x, y: f6.y - 120 });
    const win = await page.evaluate(() => { const zs = window.__zs; zs.setInput({ move: { x: 0, y: 1 } }); zs.step(3); zs.setInput({}); return zs.getState().player; });
    expect(win.y).toBeLessThan(f6.y - 15);
  });
});
