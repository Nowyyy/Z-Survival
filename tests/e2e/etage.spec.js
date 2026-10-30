import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { readFileSync } from 'node:fs';
import { entryDirection } from '../../js/core/stair-walk.js';
import { parseZones, zonesToWorld } from '../../js/core/zones.js';
import { waitReady } from './helpers.js';

// Lot 3e-B : l'étage, les escaliers, le fondu, les zombies sur deux étages, la porte 2. Tout passe par step() (temps de jeu) et les hooks de ?test=1 ; 667×375.
const SIZE = { width: 667, height: 375 };
const BROWSER_NOISE = /GL Driver Message|ReadPixels|GPU stall/;
const BIG = { width: 1440, height: 900 };
const load = (path) => JSON.parse(readFileSync(path, 'utf8'));
const world = load('data/game/maps/rez-de-chaussee/world.json');
const zonesWorld = zonesToWorld(parseZones(load('data/game/maps/rez-de-chaussee/zones.json')), world.transform);
const STAIR = (id) => zonesWorld.stairs.find((s) => s.id === id);
const AILE = STAIR('escalier-aile');
const center = (r) => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 });
const STATE = (page) => page.evaluate(() => window.__zs.getState());

async function open(page, extra = '', size = SIZE, { freeze = true } = {}) {
  await page.setViewportSize(size);
  await page.goto(`/jeu.html?test=1&seed=1&vhs=0${extra}`);
  await waitReady(page);
  if (freeze) await page.evaluate(() => { window.requestAnimationFrame = () => 0; });
  await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 150)));
  await page.evaluate(() => window.__zs.step(0.05));
}

test.describe('étage : départ, visibilité, étiquettes', () => {
  test('?wave=1 : rez-de-chaussée, puce « RDC », aucun maillage de l\'étage dessiné, escaliers fermés, aucune zone marquée', async ({ page }) => {
    await open(page, '&wave=1&nospawn=1');
    const s = await STATE(page);
    expect(s.floor.current).toBe('rdc');
    expect(s.floor.multi).toBe(true);
    expect(s.floor.stairs.map((q) => [q.id, q.usable])).toEqual([['escalier-aile', false], ['escalier-depart', false]]);
    expect(s.scene.visible.etage).toBe(0);
    expect(s.scene.visible.rdc + s.scene.visible.rdcExposed).toBeGreaterThan(5);
    expect(s.scene.visible.exterieur).toBeGreaterThan(3);
    expect(s.scene.slab).toBe(false);
    expect(s.scene.exteriorY).toBe(0);
    expect(s.scene.marks).toEqual([]);
    await expect(page.locator('#hud-floor')).toHaveText('RDC');
    expect(s.enemies).toEqual([]);
  });

  test('?wave=21 : la porte 2 est ouverte, etage-gauche active, l\'escalier de l\'aile utilisable avec sa zone marquée au sol', async ({ page }) => {
    await open(page, '&wave=21&nospawn=1');
    const s = await STATE(page);
    expect(s.floor.current).toBe('rdc');
    expect(s.zones.doors.map((d) => [d.id, d.open, d.planned])).toEqual([['porte-1', true, false], ['porte-2', true, false], ['porte-3', false, false]]);
    expect(s.zones.list.map((z) => [z.id, z.floor, z.open])).toEqual([['depart', 'rdc', true], ['aile', 'rdc', true], ['etage-gauche', 'etage', true], ['etage-droite', 'etage', false]]);
    expect(s.floor.stairs.map((q) => [q.id, q.usable])).toEqual([['escalier-aile', true], ['escalier-depart', false]]);
    expect(s.scene.marks).toEqual([]); // plus de zone jaune au sol (retour du propriétaire)
    expect(s.zones.activeWindows.filter((id) => id.startsWith('U'))).toEqual(['U1', 'U2', 'U3', 'U4']);
    expect(s.zones.activeSpawnPoints.filter((id) => id.startsWith('U'))).toHaveLength(8);
    expect(s.doorMeshes.ids).toEqual(['porte-3']); // le bloc de la porte de l'étage et celui de l'escalier de départ restent
  });

  test('?wave=21&floor=1 : joueur à l\'étage, puce « Étage », rez-de-chaussée invisible, dalle sombre présente, zone marquée à l\'étage', async ({ page }) => {
    await open(page, '&wave=21&floor=1&nospawn=1');
    const s = await STATE(page);
    expect(s.floor.current).toBe('etage');
    expect(s.scene.visible.rdc).toBeGreaterThan(0);
    expect(s.scene.visible.etage).toBeGreaterThan(5);
    expect(s.scene.visible.exterieur).toBeGreaterThan(3);
    expect(s.scene.slab).toBe(true);
    expect(s.scene.exteriorY).toBe(-180); // retour du propriétaire : l'étage est au-dessus, le sol de l'extérieur est abaissé de floorLift
    expect(s.scene.marks).toEqual([]);
    await expect(page.locator('#hud-floor')).toHaveText('Étage');
    const a = AILE.floors.etage.arrival;
    expect(Math.hypot(s.player.x - a.x, s.player.y - a.y)).toBeLessThan(1);
  });

  test('?floor=1 sans escalier ouvert est ignoré, ?floor=0 reste au rez-de-chaussée', async ({ page }) => {
    await open(page, '&wave=5&floor=1&nospawn=1');
    expect((await STATE(page)).floor.current).toBe('rdc');
    await open(page, '&wave=21&floor=0&nospawn=1');
    expect((await STATE(page)).floor.current).toBe('rdc');
  });

  test('?labels=1 : F1 à F8 au rez-de-chaussée, U1 à U7 à l\'étage, jamais les deux', async ({ page }) => {
    await open(page, '&wave=21&labels=1&nospawn=1', BIG);
    await page.evaluate(() => window.__zs.overview(true));
    await page.evaluate(() => window.__zs.step(0.05));
    const down = (await STATE(page)).labels.filter((l) => l.visible).map((l) => l.id);
    expect(down.every((id) => id.startsWith('F'))).toBe(true);
    expect(down.length).toBeGreaterThan(4);
    await page.evaluate(() => window.__zs.setFloor(1));
    await page.evaluate(() => window.__zs.step(0.05));
    const up = (await STATE(page)).labels.filter((l) => l.visible).map((l) => l.id);
    expect(up.every((id) => id.startsWith('U'))).toBe(true);
    expect(up.length).toBeGreaterThan(3);
  });

  test('?map=salle : aucun étage, aucune puce, aucun escalier, comportement du lot 3c', async ({ page }) => {
    await open(page, '&wave=1&nospawn=1&map=salle');
    const s = await STATE(page);
    expect(s.floor.multi).toBe(false);
    expect(s.floor.stairs).toEqual([]);
    expect(s.scene.visible.etage).toBe(0);
    await expect(page.locator('#hud-floor')).toBeHidden();
    expect(await page.evaluate(() => window.__zs.setFloor(1))).toBe(false);
  });
});

// Escalier physique (mise à jour du lot 3e) : on marche dans l'escalier, sa hauteur monte, l'étage logique change à mi-hauteur ; plus de fondu ni de téléportation.
const ENTRY_RDC = entryDirection(AILE.walk.path, 'rdc');
const ENTRY_ETAGE = entryDirection(AILE.walk.path, 'etage');
const LIFT = load('data/game/render.json').floorLift;
const tick = (page, seconds) => page.evaluate((sec) => { for (let i = 0; i < Math.round(sec / 0.05); i += 1) window.__zs.step(0.05); }, seconds);

test.describe('escalier physique', () => {
  test('useStair : marche automatique le long de l\'escalier, hauteur de 0 à floorLift, une seule bascule d\'étage, aucun saut de position, aucun voile', async ({ page }) => {
    await open(page, '&wave=21&nospawn=1');
    const foot = center(AILE.floors.rdc.trigger);
    await page.evaluate((t) => window.__zs.setPlayer(t.x, t.y), foot);
    const r = await page.evaluate(() => {
      const zs = window.__zs;
      const out = { ok: zs.useStair('escalier-aile'), steps: [] };
      let prev = zs.getState().player;
      for (let i = 0; i < 100; i += 1) {
        zs.step(0.05);
        const g = zs.getState();
        out.steps.push({ f: g.floor.current, e: g.floor.elevation, walking: g.floor.walk !== null, jump: Math.hypot(g.player.x - prev.x, g.player.y - prev.y), veil: g.floor.fade.veil, swaps: g.stairLog.filter((l) => l.type === 'playerStairs').length });
        prev = g.player;
        if (g.floor.walk === null) break;
      }
      return out;
    });
    expect(r.ok).toBe(true);
    const e = r.steps.map((q) => q.e);
    expect(e.every((v, i) => i === 0 || v >= e[i - 1])).toBe(true);
    expect(e.at(-1)).toBe(LIFT);
    expect(Math.max(...r.steps.map((q) => q.jump))).toBeLessThan(15); // pas de téléportation : au plus un pas de marche par image
    expect(r.steps.every((q) => q.veil === 0)).toBe(true);
    expect(r.steps.at(-1)).toMatchObject({ f: 'etage', walking: false, swaps: 1 });
    const swapAt = r.steps.find((q) => q.f === 'etage').e;
    expect(swapAt).toBeGreaterThan(LIFT * 0.45);
    expect(swapAt).toBeLessThan(LIFT * 0.65);
    expect(r.steps.length).toBeGreaterThan(20); // la montée dure plus d'une seconde
    const s = await STATE(page);
    const end = center(AILE.floors.etage.trigger);
    expect(Math.hypot(s.player.x - end.x, s.player.y - end.y)).toBeLessThan(15); // la marche finit juste au-delà du bout du chemin
    expect(s.floor.stairs[0].cooldown).toBeGreaterThan(0.2);
  });

  test('un escalier fermé n\'est pas utilisable', async ({ page }) => {
    await open(page, '&wave=20&nospawn=1');
    expect(await page.evaluate(() => window.__zs.useStair('escalier-aile'))).toBe(false);
    expect(await page.evaluate(() => window.__zs.setFloor(1))).toBe(false);
    expect((await STATE(page)).floor.walk).toBeNull();
  });

  test('en marchant : entrer dans la zone en allant vers l\'escalier le monte, sans bouton ; le sens inverse le descend', async ({ page }) => {
    await open(page, '&wave=21&nospawn=1');
    const t = center(AILE.floors.rdc.trigger);
    await page.evaluate(([p, d]) => { window.__zs.setPlayer(p.x, p.y); window.__zs.setInput({ move: d }); window.__zs.step(0.2); }, [t, ENTRY_RDC]);
    expect((await STATE(page)).floor.walk).not.toBeNull();
    await tick(page, 2.5);
    let s = await STATE(page);
    expect(s.floor).toMatchObject({ current: 'etage', walk: null, elevation: LIFT });
    // Descendre : de la zone de l'étage, marcher vers l'escalier.
    await page.evaluate(() => { window.__zs.setInput({}); window.__zs.step(1.2); });
    await page.evaluate((d) => { window.__zs.setInput({ move: d }); }, ENTRY_ETAGE);
    await tick(page, 0.3);
    expect((await STATE(page)).floor.walk).not.toBeNull();
    await tick(page, 2.5);
    s = await STATE(page);
    expect(s.floor).toMatchObject({ current: 'rdc', walk: null, elevation: 0 });
    expect(s.stairLog.filter((l) => l.type === 'playerStairs').map((l) => [l.from, l.to])).toEqual([['rdc', 'etage'], ['etage', 'rdc']]);
    await expect(page.locator('#hud-floor')).toHaveText('RDC');
  });

  test('passer à côté de la zone (marcher sans aller vers l\'escalier) ne le prend pas ; rester dans la zone non plus', async ({ page }) => {
    await open(page, '&wave=21&nospawn=1');
    const t = center(AILE.floors.rdc.trigger);
    await page.evaluate(([p]) => { window.__zs.setPlayer(p.x, p.y); window.__zs.setInput({ move: { x: 1, y: 0 } }); window.__zs.step(0.5); window.__zs.setInput({}); window.__zs.step(2); }, [t]);
    const s = await STATE(page);
    expect(s.floor).toMatchObject({ current: 'rdc', walk: null, elevation: 0 });
    expect(s.stairLog).toEqual([]);
  });

  test('déplacement libre dans l\'escalier : on peut aller de côté (la hauteur ne change pas), s\'arrêter, reculer ; les rambardes bornent la largeur', async ({ page }) => {
    await open(page, '&wave=21&nospawn=1');
    const t = center(AILE.floors.rdc.trigger);
    await page.evaluate(([p, d]) => { window.__zs.setPlayer(p.x, p.y); window.__zs.setInput({ move: d }); }, [t, ENTRY_RDC]);
    await page.evaluate(() => { const zs = window.__zs; while (zs.getState().floor.elevation < 60) zs.step(0.05); zs.setInput({}); zs.step(0.1); });
    const a = await STATE(page);
    expect(a.floor.walk).not.toBeNull();
    // Immobile : rien ne bouge. De côté : x change, pas la hauteur.
    await page.evaluate(() => window.__zs.step(0.5));
    const still = await STATE(page);
    expect(still.player).toMatchObject({ x: a.player.x, y: a.player.y });
    expect(still.floor.elevation).toBe(a.floor.elevation);
    await page.evaluate(() => { window.__zs.setInput({ move: { x: 1, y: 0 } }); window.__zs.step(2); window.__zs.setInput({}); });
    const east = await STATE(page);
    expect(east.player.x).toBeGreaterThan(a.player.x + 5);
    expect(Math.abs(east.floor.elevation - a.floor.elevation)).toBeLessThan(15);
    expect(east.player.x).toBeLessThanOrEqual(t.x + AILE.walk.width / 2); // rambarde
    expect(east.floor.walk).not.toBeNull();
    await page.evaluate(() => { window.__zs.setInput({ move: { x: -1, y: 0 } }); window.__zs.step(4); window.__zs.setInput({}); });
    const west = await STATE(page);
    expect(west.player.x).toBeGreaterThanOrEqual(t.x - AILE.walk.width / 2);
    expect(west.player.x).toBeLessThan(east.player.x);
    // Reculer : la hauteur baisse.
    await page.evaluate(() => { window.__zs.setInput({ move: { x: 0, y: -1 } }); window.__zs.step(0.3); window.__zs.setInput({}); });
    expect((await STATE(page)).floor.elevation).toBeLessThan(a.floor.elevation);
  });

  test('demi-tour avant mi-hauteur : retour au rez-de-chaussée sans changement d\'étage ; après mi-hauteur : on redescend', async ({ page }) => {
    await open(page, '&wave=21&nospawn=1');
    const t = center(AILE.floors.rdc.trigger);
    await page.evaluate(([p, d]) => { window.__zs.setPlayer(p.x, p.y); window.__zs.setInput({ move: d }); window.__zs.step(0.2); }, [t, ENTRY_RDC]);
    await page.evaluate(() => { const zs = window.__zs; while (zs.getState().floor.elevation < 40) zs.step(0.05); zs.setInput({ move: { x: 0, y: -1 } }); });
    await tick(page, 2);
    let s = await STATE(page);
    expect(s.floor).toMatchObject({ current: 'rdc', walk: null, elevation: 0 });
    expect(s.stairLog.filter((l) => l.type === 'playerStairs')).toEqual([]);
    // Seconde tentative : monter au-delà de mi-hauteur puis faire demi-tour.
    await page.evaluate(([p]) => { window.__zs.setInput({}); window.__zs.setPlayer(p.x, p.y - 250); window.__zs.step(1.2); }, [t]); // hors de la zone : l'escalier est de nouveau armé
    await page.evaluate(([p, d]) => { window.__zs.setPlayer(p.x, p.y); window.__zs.setInput({ move: d }); window.__zs.step(0.2); }, [t, ENTRY_RDC]);
    await page.evaluate(() => { const zs = window.__zs; while (zs.getState().floor.elevation < 120) zs.step(0.05); zs.setInput({ move: { x: 0, y: -1 } }); });
    expect((await STATE(page)).floor.current).toBe('etage');
    await tick(page, 3);
    s = await STATE(page);
    expect(s.floor).toMatchObject({ current: 'rdc', walk: null, elevation: 0 });
    expect(s.stairLog.filter((l) => l.type === 'playerStairs').map((l) => [l.from, l.to])).toEqual([['rdc', 'etage'], ['etage', 'rdc']]);
  });

  test('pendant la montée : les deux étages sont dessinés, le rez-de-chaussée complet jusqu\'à mi-hauteur (on peut tirer dans l\'escalier)', async ({ page }) => {
    await open(page, '&wave=21&nospawn=1');
    const r = await page.evaluate(() => {
      const zs = window.__zs;
      const p = zs.getState().player;
      zs.setInput({ aim: { angle: 0 } });
      zs.useStair('escalier-aile');
      zs.step(0.4);
      const g = zs.getState();
      zs.spawnEnemy(g.player.x + 100, g.player.y, { mode: 'libre' });
      let shots = 0;
      for (let i = 0; i < 6; i += 1) { zs.step(0.05); shots += zs.getState().bullets.length; }
      const mid = zs.getState();
      return { shots, laser: mid.laser, walking: mid.floor.walk !== null, vis: mid.scene.visible, start: p };
    });
    expect(r.walking).toBe(true);
    expect(r.vis.etage).toBeGreaterThan(5); // l'étage est dessiné dès que le joueur a pris de la hauteur
    expect(r.vis.rdcShell).toBeGreaterThanOrEqual(2);
    expect(r.vis.rdc + r.vis.rdcExposed).toBeGreaterThan(5);
  });

  test('de l\'étage, on voit le sol du rez-de-chaussée en dessous (coque : sol, murs et rampes) ; tout le rez-de-chaussée reste dessiné (rien ne disparaît) ; une barrière entoure le trou', async ({ page }) => {
    await open(page, '&wave=31&floor=1&nospawn=1');
    const s = await STATE(page);
    expect(s.scene.visible.rdcShell).toBeGreaterThanOrEqual(2); // sol et murs (les marches sont dans le maillage des murs)
    expect(s.scene.visible.rdc).toBeGreaterThan(0);
    expect(s.scene.visible.rdcExposed).toBeGreaterThan(3); // mobilier, fenêtres et portes découverts par le trou ou hors de l'étage
    expect(await page.evaluate(() => window.__zs.getState().scene.fence)).toBeGreaterThan(0);
    expect(s.scene.elevation).toBe(LIFT);
    expect(s.scene.exteriorY).toBe(-LIFT);
  });

  test('protection de 1,0 s après avoir changé d\'étage : un zombie au contact ne blesse pas', async ({ page }) => {
    await open(page, '&wave=21&nospawn=1');
    await page.evaluate(() => { window.__zs.useStair('escalier-aile'); const zs = window.__zs; while (zs.getState().floor.walk !== null) zs.step(0.05); });
    const s = await STATE(page);
    expect(s.floor.current).toBe('etage');
    expect(s.floor.grace).toBeGreaterThan(0.8);
    await page.evaluate(() => {
      const g = window.__zs.getState();
      window.__zs.spawnEnemy(g.player.x - 30, g.player.y, { floor: 'etage', mode: 'libre' });
      window.__zs.step(0.5);
    });
    expect((await STATE(page)).player.health).toBe(s.player.health);
    await page.evaluate(() => window.__zs.step(1.5));
    expect((await STATE(page)).player.health).toBeLessThan(s.player.health);
  });

  test('#floor-fade reste inerte (décoratif, voile à 0) : l\'escalier n\'utilise plus de fondu, il sert au mouvement réduit seulement', async ({ page }) => {
    await open(page, '&wave=21&nospawn=1');
    const fade = page.locator('#floor-fade');
    await expect(fade).toHaveAttribute('aria-hidden', 'true');
    await expect(fade).toHaveCSS('pointer-events', 'none');
    await expect(fade).toHaveCSS('position', 'fixed');
    const order = await page.evaluate(() => [...document.getElementById('game-root').children].map((n) => n.id).filter((id) => ['game-canvas', 'floor-fade', 'vhs', 'hud'].includes(id)));
    expect(order.slice(0, 3)).toEqual(['game-canvas', 'floor-fade', order[2]]);
    await page.evaluate(() => { window.__zs.useStair('escalier-aile'); window.__zs.step(0.5); });
    expect((await STATE(page)).floor.fade.veil).toBe(0);
    await expect(fade).toHaveCSS('opacity', '0');
    const css = await fade.evaluate((el) => { const c = getComputedStyle(el); return [c.filter, c.mixBlendMode, c.backdropFilter, c.backgroundColor]; });
    expect(css.slice(0, 3)).toEqual(['none', 'normal', 'none']);
    const fog = await page.evaluate(() => { const probe = document.createElement('i'); probe.style.color = 'var(--game-fog)'; document.body.append(probe); const c = getComputedStyle(probe).color; probe.remove(); return c; });
    expect(css[3]).toBe(fog);
  });

  test('prefers-reduced-motion : aucune marche dans l\'escalier, échange immédiat, verrou de 0,2 s, aucun voile', async ({ browser }) => {
    const context = await browser.newContext({ reducedMotion: 'reduce', viewport: SIZE });
    const page = await context.newPage();
    await open(page, '&wave=21&nospawn=1');
    const r = await page.evaluate(() => {
      const zs = window.__zs;
      zs.useStair('escalier-aile');
      const out = [];
      for (let i = 0; i < 6; i += 1) {
        zs.step(0.05);
        const g = zs.getState();
        out.push([g.floor.current, g.floor.fade.veil, g.floor.fade.locked, g.floor.walk]);
      }
      return out;
    });
    expect(r[0].slice(0, 3)).toEqual(['etage', 0, true]);
    expect(r.every((q) => q[1] === 0 && q[3] === null)).toBe(true);
    expect(r.slice(0, 3).every((q) => q[2])).toBe(true);
    expect(r[4][2]).toBe(false);
    await context.close();
  });

  test('pause : la montée est figée', async ({ page }) => {
    await open(page, '&wave=21&nospawn=1', SIZE, { freeze: false });
    await page.evaluate(() => { window.__zs.useStair('escalier-aile'); window.__zs.step(0.3); });
    await page.click('#btn-pause');
    const a = await STATE(page);
    await page.waitForTimeout(500);
    const b = await STATE(page);
    expect(b.floor.elevation).toBe(a.floor.elevation);
    expect(b.floor.walk).toEqual(a.floor.walk);
  });

  test('« Rejouer » en pleine montée : retour au rez-de-chaussée, hauteur 0 ; #hud-live annonce « Étage » puis « Rez-de-chaussée »', async ({ page }) => {
    await open(page, '&wave=21&nospawn=1');
    await page.evaluate(() => {
      window.__live = [];
      new MutationObserver(() => window.__live.push(document.getElementById('hud-live').textContent)).observe(document.getElementById('hud-live'), { childList: true, characterData: true, subtree: true });
      window.__zs.useStair('escalier-aile');
      window.__zs.step(3);
    });
    expect((await STATE(page)).floor.current).toBe('etage');
    await page.evaluate(() => { window.__zs.step(1.2); window.__zs.useStair('escalier-aile'); window.__zs.step(3); });
    expect((await STATE(page)).floor.current).toBe('rdc');
    expect(await page.evaluate(() => window.__live)).toEqual(expect.arrayContaining(['Étage', 'Rez-de-chaussée']));
    await page.evaluate(() => { window.__zs.step(1.2); window.__zs.useStair('escalier-aile'); window.__zs.step(0.6); });
    expect((await STATE(page)).floor.walk).not.toBeNull();
    await page.evaluate(() => { document.getElementById('btn-pause').click(); });
    await page.click('#btn-restart');
    const s = await STATE(page);
    expect(s.floor).toMatchObject({ current: 'rdc', walk: null, elevation: 0 });
    expect(s.scene.exteriorY).toBe(0);
  });

  test('mort du joueur en pleine montée : escalier quitté, rez-de-chaussée affiché, hauteur 0', async ({ page }) => {
    await open(page, '&wave=21&nospawn=1');
    await page.evaluate(() => { window.__zs.useStair('escalier-aile'); window.__zs.step(1.2); window.__zs.setChutes(0); window.__zs.downPlayer(); window.__zs.step(0.2); });
    const s = await STATE(page);
    expect(s.dead).toBe(true);
    expect(s.floor).toMatchObject({ current: 'rdc', walk: null, elevation: 0 });
    expect(s.scene.visible.etage).toBe(0);
  });

  test('mort à l\'étage : le rez-de-chaussée est affiché', async ({ page }) => {
    await open(page, '&wave=21&floor=1&nospawn=1');
    await page.evaluate(() => { window.__zs.setChutes(0); window.__zs.downPlayer(); window.__zs.step(0.2); });
    const s = await STATE(page);
    expect(s.dead).toBe(true);
    expect(s.floor.current).toBe('rdc');
    expect(s.scene.visible.etage).toBe(0);
  });
});

test.describe('escalier de départ arrondi, zombies et murs invisibles', () => {
  const DEP = STAIR('escalier-depart');
  const DENTRY = entryDirection(DEP.walk.path, 'rdc');

  test('l\'escalier de départ tourne : sa montée suit un quart de tour et finit à l\'ouest, vers la zone de l\'étage', async ({ page }) => {
    await open(page, '&wave=31&nospawn=1');
    const t = center(DEP.floors.rdc.trigger);
    await page.evaluate(([p, d]) => { window.__zs.setPlayer(p.x, p.y); window.__zs.setInput({ move: d }); window.__zs.step(0.2); }, [t, DENTRY]);
    const r = await page.evaluate(() => {
      const zs = window.__zs;
      const xs = [];
      let n = 0;
      while (zs.getState().floor.walk !== null && n < 400) {
        const g = zs.getState();
        // On suit la courbe comme un joueur : vers le nord, puis vers l'ouest dès que la hauteur dépasse les trois quarts.
        zs.setInput({ move: g.floor.elevation < 140 ? { x: 0, y: -1 } : { x: -1, y: -0.2 } });
        zs.step(0.05);
        xs.push(Math.round(g.player.x));
        n += 1;
      }
      zs.setInput({});
      return { xs, state: zs.getState() };
    });
    expect(r.state.floor.current).toBe('etage');
    const top = center(DEP.floors.etage.trigger);
    expect(Math.hypot(r.state.player.x - top.x, r.state.player.y - top.y)).toBeLessThan(120);
    expect(Math.min(...r.xs)).toBeLessThan(Math.max(...r.xs) - 100); // la montée se termine plus à l'ouest qu'elle ne commence
  });

  test('aucun mur invisible autour de l\'escalier de départ : à l\'étage on marche tout autour (sauf dans la cage de l\'escalier lui-même)', async ({ page }) => {
    await open(page, '&wave=31&floor=1&nospawn=1');
    const cage = DEP.floors.etage.solid;
    // Points de passage autour de la cage : à l'ouest, au sud, à l'est (dans la salle) ; chacun doit être atteignable en marchant depuis le palier.
    const spots = [{ x: cage.x - 120, y: cage.y + cage.h / 2 - 60, from: { x: cage.x - 250, y: cage.y + cage.h / 2 - 60 } }, { x: cage.x + cage.w / 2, y: cage.y + cage.h + 80 }, { x: cage.x - 60, y: cage.y + cage.h + 200 }];
    for (const spot of spots) {
      const r = await page.evaluate(([from, to]) => {
        const zs = window.__zs;
        zs.setPlayer(from.x, from.y);
        for (let i = 0; i < 160; i += 1) {
          const p = zs.getState().player;
          const d = Math.hypot(to.x - p.x, to.y - p.y);
          if (d < 25) return { ok: true, d };
          zs.setInput({ move: { x: (to.x - p.x) / d, y: (to.y - p.y) / d } });
          zs.step(0.05);
        }
        zs.setInput({});
        return { ok: false, d: Math.hypot(to.x - zs.getState().player.x, to.y - zs.getState().player.y) };
      }, [spot.from ?? { x: cage.x - 150, y: cage.y + cage.h + 200 }, spot]);
      expect(r.ok, `${Math.round(spot.x)},${Math.round(spot.y)} : reste à ${Math.round(r.d)}`).toBe(true);
    }
  });

  test('les zombies de l\'étage suivent le joueur qui est dans l\'escalier : ils vont au bout de l\'escalier de son étage et le rejoignent quand il en sort', async ({ page }) => {
    await open(page, '&wave=31&nospawn=1');
    const t = center(DEP.floors.rdc.trigger);
    const r = await page.evaluate(([p, d]) => {
      const zs = window.__zs;
      // Le joueur monte ; des zombies du rez-de-chaussée le poursuivent depuis la salle.
      zs.setPlayer(p.x, p.y + 400);
      for (let i = 0; i < 3; i += 1) zs.spawnEnemy(p.x - 300 + i * 60, p.y + 500, { floor: 'rdc', mode: 'dedans' });
      zs.setPlayer(p.x, p.y);
      zs.setInput({ move: d });
      zs.step(0.2);
      const before = zs.getState().enemies.map((e) => [e.x, e.y]);
      for (let i = 0; i < 6; i += 1) zs.step(0.05); // dans l'escalier
      const during = zs.getState();
      const moved = during.enemies.map((e, i) => Math.hypot(e.x - before[i][0], e.y - before[i][1]));
      return { walking: during.floor.walk !== null, moved };
    }, [t, DENTRY]);
    expect(r.walking).toBe(true);
    expect(Math.max(...r.moved)).toBeGreaterThan(5); // ils avancent vers le pied de l'escalier au lieu de rester bloqués
  });
});

test.describe('trou autour de l\'escalier de départ et zombies du rez-de-chaussée vus d\'en haut', () => {
  const DEP = STAIR('escalier-depart');
  const hole = DEP.floors.etage.solid;

  test('autour de l\'escalier de départ, le sol de l\'étage est un trou (le joueur ne passe ni derrière, ni à côté) : on y voit le rez-de-chaussée', async ({ page }) => {
    await open(page, '&wave=31&floor=1&nospawn=1');
    const r = await page.evaluate(([h]) => {
      const zs = window.__zs;
      const out = [];
      for (const [fx, fy, dx, dy] of [[h.x - 150, h.y + h.h / 2, 1, 0], [h.x + h.w / 2, h.y + h.h + 120, 0, -1], [h.x + h.w / 2, h.y - 5, 0, 1]]) {
        zs.setPlayer(fx, fy);
        zs.setInput({ move: { x: dx, y: dy } });
        zs.step(3);
        zs.setInput({});
        const p = zs.getState().player;
        out.push({ x: p.x, y: p.y, inside: p.x > h.x + 18 && p.x < h.x + h.w - 18 && p.y > h.y + 18 && p.y < h.y + h.h - 18 });
      }
      return out;
    }, [hole]);
    for (const q of r) expect(q.inside, JSON.stringify(q)).toBe(false);
    const s = await STATE(page);
    expect(s.scene.visible.rdcShell).toBeGreaterThanOrEqual(2);
  });

  test('zombies : depuis l\'étage on voit ceux du rez-de-chaussée, floorLift plus bas ; depuis le rez-de-chaussée on ne voit pas ceux de l\'étage', async ({ page }) => {
    await open(page, '&wave=31&floor=1&nospawn=1');
    const r = await page.evaluate(() => {
      const zs = window.__zs;
      const p = zs.getState().player;
      zs.spawnEnemy(p.x + 60, p.y, { floor: 'rdc', mode: 'libre' });
      zs.spawnEnemy(p.x + 60, p.y + 80, { floor: 'etage', mode: 'libre' });
      zs.step(0.1);
      const up = zs.getState().enemies.map((e) => [e.floor, e.visible]);
      zs.setFloor(0);
      zs.step(0.1);
      const down = zs.getState().enemies.map((e) => [e.floor, e.visible]);
      return { up, down };
    });
    expect(r.up).toEqual([['rdc', true], ['etage', true]]);
    expect(r.down).toEqual([['rdc', true], ['etage', false]]);
  });
});

test.describe('déclenchement par le mouvement réel', () => {
  test('l\'escalier fermé (?wave=20) est bloqué par son bloc : on ne peut pas atteindre sa zone', async ({ page }) => {
    await open(page, '&wave=20&nospawn=1');
    const t = center(AILE.floors.rdc.trigger);
    await page.evaluate((p) => window.__zs.setPlayer(p.x, p.y + 140), t);
    await page.evaluate(() => { window.__zs.setInput({ move: { x: 0, y: -1 } }); window.__zs.step(1.5); window.__zs.setInput({}); });
    const s = await STATE(page);
    expect(s.floor.current).toBe('rdc');
    expect(s.floor.fade.locked).toBe(false);
    expect(s.stairLog).toEqual([]);
  });
});

const until = (page, condition, maxSeconds = 40) => page.evaluate(([body, max]) => {
  const zs = window.__zs;
  const test = new Function('s', `return (${body});`);
  const t0 = zs.getState().time;
  for (let i = 0; i < Math.round(max / 0.05); i += 1) {
    const s = zs.getState();
    if (test(s)) return { state: s, elapsed: s.time - t0, time: s.time };
    zs.step(0.05);
  }
  return null;
}, [condition, maxSeconds]);
const A_RDC = AILE.floors.rdc.arrival;
const A_ETAGE = AILE.floors.etage.arrival;

test.describe('zombies sur deux étages', () => {
  test('un zombie du rez-de-chaussée est dessiné depuis l\'étage (plus bas) ; un zombie de l\'étage n\'est jamais dessiné depuis le rez-de-chaussée', async ({ page }) => {
    await open(page, '&wave=21&nospawn=1');
    await page.evaluate(([a, b]) => {
      window.__zs.spawnEnemy(a.x + 60, a.y, { floor: 'rdc', mode: 'dedans' });
      window.__zs.spawnEnemy(b.x + 60, b.y, { floor: 'etage', mode: 'dedans' });
      window.__zs.step(0.05);
    }, [A_RDC, A_ETAGE]);
    let s = await STATE(page);
    expect(s.enemies.map((e) => [e.floor, e.visible])).toEqual([['rdc', true], ['etage', false]]);
    await page.evaluate(() => { window.__zs.setFloor(1); window.__zs.step(0.05); });
    s = await STATE(page);
    expect(s.enemies.map((e) => [e.floor, e.visible])).toEqual([['rdc', true], ['etage', true]]); // depuis l'étage on voit aussi ceux du rez-de-chaussée, plus bas
  });

  test('un zombie de l\'étage atteint l\'escalier, le descend en marchant et en sort au rez-de-chaussée près du point d\'arrivée', async ({ page }) => {
    await open(page, '&wave=21&nospawn=1');
    await page.evaluate((b) => { window.__zs.spawnEnemy(b.x, b.y + 150, { floor: 'etage', mode: 'dedans' }); }, A_ETAGE);
    const done = await until(page, `s.stairLog.some((l) => l.type === 'stairArrive')`, 60);
    expect(done).not.toBeNull();
    const log = done.state.stairLog.filter((l) => l.type !== 'playerStairs');
    const start = log.find((l) => l.type === 'stairStart');
    const arrive = log.find((l) => l.type === 'stairArrive');
    expect(start).toMatchObject({ stair: 'escalier-aile', from: 'etage', to: 'rdc' });
    expect(arrive).toMatchObject({ stair: 'escalier-aile', from: 'etage', to: 'rdc' });
    expect(arrive.time - start.time).toBeGreaterThan(1);
    expect(done.state.enemies[0].floor).toBe('rdc');
    expect(Math.hypot(done.state.enemies[0].x - A_RDC.x, done.state.enemies[0].y - A_RDC.y)).toBeLessThan(250);
  });

  test('un zombie du rez-de-chaussée monte quand le joueur est à l\'étage', async ({ page }) => {
    await open(page, '&wave=21&floor=1&nospawn=1');
    await page.evaluate((a) => { window.__zs.spawnEnemy(a.x, a.y + 120, { floor: 'rdc', mode: 'dedans' }); }, A_RDC);
    const done = await until(page, `s.stairLog.some((l) => l.type === 'stairArrive')`, 60);
    expect(done).not.toBeNull();
    expect(done.state.stairLog.find((l) => l.type === 'stairArrive')).toMatchObject({ from: 'rdc', to: 'etage' });
    expect(done.state.enemies[0].floor).toBe('etage');
  });

  test('escalier de l\'aile : des zombies du rez-de-chaussée, même sous le palier, montent derrière le joueur ; un zombie de l\'étage le suit en bas', async ({ page }) => {
    await open(page, '&wave=31&lvl=10&nospawn=1', SIZE, { freeze: false });
    const r = await page.evaluate((st) => {
      const zs = window.__zs;
      const [p0, p3] = [st.walk.path[0], st.walk.path.at(-1)];
      zs.setPlayer(p0.x + 40, p0.y - 40);
      zs.spawnEnemy(p3.x + 40, p3.y - 60, { floor: 'rdc', mode: 'dedans' });
      zs.spawnEnemy(p0.x + 150, p0.y + 60, { floor: 'rdc', mode: 'dedans' });
      zs.useStair('escalier-aile');
      for (let i = 0; i < 1200 && zs.getState().stairLog.filter((l) => l.type === 'stairArrive').length < 2; i += 1) zs.step(0.05);
      const up = zs.getState().stairLog.filter((l) => l.type === 'stairArrive' && l.to === 'etage').length;
      zs.spawnEnemy(p3.x + 40, p3.y + 40, { floor: 'etage', mode: 'dedans' });
      zs.useStair('escalier-aile');
      for (let i = 0; i < 1200 && zs.getState().stairLog.filter((l) => l.type === 'stairArrive' && l.to === 'rdc').length < 1; i += 1) zs.step(0.05);
      return { up, down: zs.getState().stairLog.filter((l) => l.type === 'stairArrive' && l.to === 'rdc').length };
    }, AILE);
    expect(r.up).toBe(2);
    expect(r.down).toBeGreaterThanOrEqual(1);
  });

  test('on sort de l\'escalier par le haut puis on le reprend en y marchant : aucun mur invisible (pas de verrou de zone)', async ({ page }) => {
    await open(page, '&wave=31&nospawn=1', SIZE, { freeze: false });
    const r = await page.evaluate((st) => {
      const zs = window.__zs;
      const [p0, p3] = [st.walk.path[0], st.walk.path.at(-1)];
      zs.setPlayer(p0.x, p0.y - 50);
      zs.setInput({ move: { x: 0, y: 1 } });
      for (let i = 0; i < 120 && zs.getState().floor.current !== 'etage'; i += 1) zs.step(0.05);
      for (let i = 0; i < 80; i += 1) zs.step(0.05);
      const top = { floor: zs.getState().floor.current, walk: zs.getState().floor.walk, y: zs.getState().player.y, end: p3.y };
      zs.setInput({ move: { x: 0, y: -1 } });
      let back = null;
      for (let i = 0; i < 120; i += 1) { zs.step(0.05); if (back === null && zs.getState().floor.walk !== null) back = i; }
      zs.setInput({ move: { x: 0, y: -1 } });
      for (let i = 0; i < 80; i += 1) zs.step(0.05);
      return { top, back, floor: zs.getState().floor.current };
    }, AILE);
    expect(r.top.floor).toBe('etage');
    expect(r.top.walk).toBeNull();
    expect(r.back).not.toBeNull();
    expect(r.floor).toBe('rdc');
  });

  test('un zombie qui marche dans l\'escalier est libre de ses mouvements : on le touche d\'une balle depuis l\'extérieur, il se déplace sur la rampe', async ({ page }) => {
    await open(page, '&wave=31&lvl=10&nospawn=1', SIZE, { freeze: false });
    const r = await page.evaluate((st) => {
      const zs = window.__zs;
      const [p0, p3] = [st.walk.path[0], st.walk.path.at(-1)];
      zs.setPlayer(p0.x + 60, p0.y - 70); // au rez-de-chaussée, à côté du pied de la rampe
      zs.spawnEnemy(p3.x, p3.y + 15, { floor: 'etage', mode: 'dedans' });
      let seen = null;
      const track = [];
      for (let i = 0; i < 400 && seen === null; i += 1) {
        zs.step(0.05);
        const e = zs.getState().enemies[0];
        if (e && e.mode === 'escalier') track.push({ x: e.x, y: e.y, t: e.stairT });
        if (e && e.mode === 'escalier' && e.stairT < 0.4 && e.floor === 'rdc') seen = e;
      }
      if (seen === null) return { track, hit: null };
      const g = zs.getState();
      const e = g.enemies[0];
      const before = e.hp;
      zs.fire(Math.atan2(e.y - g.player.y, e.x - g.player.x));
      for (let i = 0; i < 6; i += 1) zs.step(0.05);
      const after = zs.getState().enemies[0];
      return { track, hit: after ? before - after.hp : before };
    }, AILE);
    expect(r.track.length).toBeGreaterThan(5);
    expect(Math.hypot(r.track.at(-1).x - r.track[0].x, r.track.at(-1).y - r.track[0].y)).toBeGreaterThan(30);
    expect(r.hit).toBeGreaterThan(0);
  });

  test('aucune limite de zombies à la fois dans un escalier', async ({ page }) => {
    await open(page, '&wave=21&nospawn=1');
    await page.evaluate((b) => {
      for (let i = 0; i < 7; i += 1) window.__zs.spawnEnemy(b.x + (i % 3) * 14, b.y + 40 + i * 12, { floor: 'etage', mode: 'dedans' });
    }, A_ETAGE);
    const r = await page.evaluate(() => {
      const zs = window.__zs;
      let max = 0;
      let seen = 0;
      for (let i = 0; i < 160; i += 1) {
        zs.step(0.05);
        const n = zs.getState().enemies.filter((e) => e.mode === 'escalier').length;
        max = Math.max(max, n);
        if (n > 0) seen += 1;
      }
      return { max, seen, arrived: zs.getState().stairLog.filter((l) => l.type === 'stairArrive').length };
    });
    expect(r.max).toBeGreaterThan(4);
    expect(r.seen).toBeGreaterThan(5);
    expect(r.arrived).toBeGreaterThanOrEqual(2);
  });

  test('un zombie d\'un autre étage ne blesse pas et ne déclenche aucun tir, même à la même position', async ({ page }) => {
    await open(page, '&wave=21&nospawn=1');
    const r = await page.evaluate(() => {
      const zs = window.__zs;
      const p = zs.getState().player;
      zs.spawnEnemy(p.x + 20, p.y, { floor: 'etage', mode: 'libre' });
      zs.setInput({ aim: { angle: 0 } });
      let shots = 0;
      for (let i = 0; i < 80; i += 1) { zs.step(0.05); shots += zs.getState().bullets.length; }
      const s = zs.getState();
      return { hp: s.player.health, start: p.health, shots, zombieHp: s.enemies[0].hp, max: s.enemies[0].maxHp, laser: s.laser };
    });
    expect(r.hp).toBe(r.start);
    expect(r.shots).toBe(0);
    expect(r.zombieHp).toBe(r.max);
    expect(r.laser?.hit ?? null).toBeNull(); // le laser existe mais ne touche pas le zombie de l\'autre étage
  });

  test('une balle porte son étage ; elle disparaît au changement d\'étage ; elle ne touche pas un zombie de l\'autre étage', async ({ page }) => {
    await open(page, '&wave=21&nospawn=1');
    const r = await page.evaluate(() => {
      const zs = window.__zs;
      const p = zs.getState().player;
      zs.spawnEnemy(p.x + 150, p.y, { floor: 'etage', mode: 'libre' });
      zs.fire(0);
      const b = zs.getState().bullets.map((q) => q.floor);
      zs.step(0.4);
      const hp = zs.getState().enemies[0].hp;
      zs.fire(0);
      zs.useStair('escalier-aile');
      zs.step(2.5);
      return { b, hp, max: zs.getState().enemies[0].maxHp, after: zs.getState().bullets.length, floor: zs.getState().floor.current };
    });
    expect(r.b).toEqual(['rdc']);
    expect(r.hp).toBe(r.max);
    expect(r.floor).toBe('etage');
    expect(r.after).toBe(0);
  });

  test('à l\'étage : le tir automatique abat un zombie de l\'étage (50 de vie, deux balles)', async ({ page }) => {
    await open(page, '&wave=21&floor=1&nospawn=1');
    const r = await page.evaluate(() => {
      const zs = window.__zs;
      const p = zs.getState().player;
      zs.setInput({ aim: { angle: 0 } });
      zs.spawnEnemy(p.x + 120, p.y, { floor: 'etage', mode: 'libre' });
      for (let i = 0; i < 60; i += 1) zs.step(0.05);
      return { kills: zs.getState().kills, left: zs.getState().enemies.length };
    });
    expect(r.kills).toBe(1);
    expect(r.left).toBe(0);
  });
});

test.describe('apparitions et manches sur deux étages', () => {
  const run = (page, seconds) => page.evaluate((sec) => {
    const zs = window.__zs;
    let max = 0;
    for (let i = 0; i < Math.round(sec / 0.05); i += 1) { zs.step(0.05); max = Math.max(max, zs.getState().enemies.length); }
    const s = zs.getState();
    return { log: s.spawnLog, max, floors: s.enemies.map((e) => e.floor), wave: s.waves.wave };
  }, seconds);

  test('?wave=21, joueur au rez-de-chaussée : des apparitions aux deux étages, jamais plus de 10 zombies, aucune apparition visible', async ({ page }) => {
    await open(page, '&wave=21');
    const r = await run(page, 60);
    const up = r.log.filter((l) => l.floor === 'etage');
    const down = r.log.filter((l) => l.floor === 'rdc');
    expect(up.length).toBeGreaterThan(0);
    expect(down.length).toBeGreaterThan(0);
    expect(up.every((l) => l.hidden)).toBe(true); // un point d'un autre étage n'est jamais « dans la vue »
    expect(down.every((l) => l.hidden)).toBe(true);
    expect(r.max).toBeLessThanOrEqual(10);
    expect(up.every((l) => /^U[1-7]-/.test(l.id))).toBe(true);
  });

  test('?wave=21&floor=1, joueur à l\'étage : apparitions aux deux étages, celles du rez-de-chaussée sont hors de vue', async ({ page }) => {
    await open(page, '&wave=21&floor=1');
    const r = await run(page, 60);
    expect(r.log.some((l) => l.floor === 'rdc')).toBe(true);
    expect(r.log.some((l) => l.floor === 'etage')).toBe(true);
    expect(r.log.every((l) => l.hidden)).toBe(true);
    expect(r.max).toBeLessThanOrEqual(10);
  });

  test('avant la porte 2 (?wave=20), aucune apparition à l\'étage ; la zone d\'étage s\'active à la manche 21', async ({ page }) => {
    await open(page, '&wave=20');
    const r = await run(page, 40);
    expect(r.log.some((l) => l.floor === 'etage')).toBe(false);
    expect(r.wave).toBe(20);
  });

  test('séquence de la porte 2 : annonce « Un escalier s\'ouvre » à 3,0 s, doorOpen à 3,6 s, enfoncement de 1,2 s, escalier utilisable dès l\'ouverture, manche 21 à 12 s', async ({ page }) => {
    await open(page, '&wave=20');
    await page.evaluate(() => window.__zs.step(3.1));
    const t0 = await page.evaluate(() => { window.__zs.skipWave(); window.__zs.step(0.05); return window.__zs.getState().time; });
    expect((await STATE(page)).waves.doorPending).toEqual({ id: 'porte-2', openAfterWave: 20 });
    const ann = await until(page, `s.events.some((e) => e.type === 'doorAnnounce')`, 6);
    expect(ann).not.toBeNull();
    expect(ann.time - t0).toBeGreaterThan(2.9);
    expect(ann.time - t0).toBeLessThan(3.2);
    expect(ann.state.splash).toMatchObject({ visible: true, kind: 'zone', title: 'Nouvelle zone', subtitle: 'Un escalier s\'ouvre' });
    const opened = await until(page, `s.events.some((e) => e.type === 'doorOpen')`, 6);
    expect(opened.time - t0).toBeGreaterThan(3.4);
    expect(opened.time - t0).toBeLessThan(3.9);
    expect(opened.state.floor.stairs.find((q) => q.id === 'escalier-aile').usable).toBe(true);
    const sunk = await until(page, `s.zones.doors[1].sinkProgress >= 1`, 3);
    expect(sunk.elapsed).toBeGreaterThan(0.9);
    expect(sunk.state.doorMeshes.ids).toEqual(['porte-3']);
    const next = await until(page, `s.waves.wave === 21 && s.waves.phase === 'apparition'`, 12);
    expect(next.time - t0).toBeGreaterThan(11.7);
    expect(next.time - t0).toBeLessThan(12.4);
  });

  test('simulation de 90 s à ?wave=26 en changeant d\'étage : jamais plus de 10 zombies, aucune erreur, tout reste dans les bornes', async ({ page }) => {
    const problems = [];
    page.on('pageerror', (e) => problems.push(e.message));
    await open(page, '&wave=26');
    const r = await page.evaluate(() => {
      const zs = window.__zs;
      let max = 0;
      let bad = 0;
      for (let i = 0; i < 1800; i += 1) {
        if (i % 300 === 100) zs.useStair('escalier-aile');
        zs.step(0.05);
        const s = zs.getState();
        max = Math.max(max, s.enemies.length);
        for (const e of s.enemies) if (!Number.isFinite(e.x) || !Number.isFinite(e.y) || !['rdc', 'etage'].includes(e.floor)) bad += 1;
        if (s.dead) break;
      }
      const s = zs.getState();
      return { max, bad, dead: s.dead, stairs: s.stairLog.length, wave: s.waves.wave };
    });
    expect(r.max).toBeLessThanOrEqual(10);
    expect(r.bad).toBe(0);
    expect(r.stairs).toBeGreaterThan(0);
    expect(problems).toEqual([]);
  });

  test('réparation : près de U2 à l\'étage, une planche manquante est remise ; au rez-de-chaussée, la même fenêtre n\'est pas réparée', async ({ page }) => {
    await open(page, '&wave=21&floor=1&nospawn=1');
    const u2 = await page.evaluate(() => window.__zs.getState().windows.find((w) => w.id === 'U2'));
    expect(u2.floor).toBe('etage');
    const r = await page.evaluate((w) => {
      const zs = window.__zs;
      zs.setPlanks('U2', 1);
      const rp = w.repairSpot;
      zs.setPlayer(rp.x, rp.y);
      for (let i = 0; i < 60; i += 1) zs.step(0.05);
      const up = zs.getState().windows.find((q) => q.id === 'U2').planks;
      zs.setPlanks('U2', 1);
      zs.setFloor(0);
      zs.setPlayer(rp.x, rp.y);
      for (let i = 0; i < 60; i += 1) zs.step(0.05);
      return { up, down: zs.getState().windows.find((q) => q.id === 'U2').planks };
    }, u2);
    expect(r.up).toBeGreaterThan(1);
    expect(r.down).toBe(1);
  });
});

test.describe('sons, budget, interface', () => {
  const audioLog = async (page) => (await STATE(page)).audio.log;

  test('un son d\'un autre étage : gain × 0,5 et un seul passe-bas à 700 Hz ; sur l\'étage du joueur, ni l\'un ni l\'autre', async ({ page }) => {
    await open(page, '&wave=21&nospawn=1', SIZE, { freeze: false });
    await page.mouse.click(40, 40);
    await expect.poll(async () => (await STATE(page)).audio.unlocked).toBe(true);
    const p = (await STATE(page)).player;
    await page.evaluate(([x, y]) => {
      const zs = window.__zs;
      zs.audioEvent({ type: 'zombieHit', x, y, killed: false, zombie: 'marcheur' });
      zs.step(0.3); // délai minimal entre deux sons identiques
      zs.audioEvent({ type: 'zombieHit', x, y, killed: false, zombie: 'marcheur', floor: 'etage' });
      zs.step(0.1);
    }, [p.x + 20, p.y]);
    const log = (await audioLog(page)).filter((e) => e.sound.includes('blessure') || e.sound.includes('zombie'));
    const same = log.find((e) => e.lowpassHz === undefined);
    const other = log.find((e) => e.lowpassHz !== undefined);
    expect(same).toBeTruthy();
    expect(other).toBeTruthy();
    expect(other.lowpassHz).toBe(700);
    expect(other.gain / same.gain).toBeCloseTo(0.5, 1);
  });

  test('le fondu ne produit aucun son ; aucun son n\'est demandé avant le premier geste', async ({ page }) => {
    await open(page, '&wave=21&nospawn=1');
    expect((await STATE(page)).audio.unlocked).toBe(false);
    await page.evaluate(() => { window.__zs.useStair('escalier-aile'); window.__zs.step(1); });
    expect((await STATE(page)).audio.log).toEqual([]);
  });

  test('budget à l\'étage : 10 zombies variés, ombres, planches : 300 appels et 15 000 triangles au plus', async ({ page }, testInfo) => {
    await open(page, '&wave=21&floor=1&shadows=1&nospawn=1');
    const m = await page.evaluate(() => {
      const zs = window.__zs;
      const p = zs.getState().player;
      zs.setInput({ aim: { angle: Math.PI } });
      const T = ['marcheur', 'petit', 'voute', 'grand'];
      const G = ['lent', 'marche', 'rampe', 'course'];
      for (let i = 0; i < 10; i += 1) zs.spawnEnemy(p.x + 40 + (i % 5) * 30, p.y + (Math.floor(i / 5) - 0.5) * 60, { type: T[i % 4], gait: G[(i + Math.floor(i / 4)) % 4], wave: 21, floor: 'etage' });
      zs.step(0.05);
      zs.sampleScreen(0, 0, 8, 8);
      return zs.getState().render;
    });
    console.log(`BUDGET lot 3e, étage : ${m.calls} appels, ${m.triangles} triangles`);
    testInfo.annotations.push({ type: 'rendu', description: `étage : ${m.calls} appels, ${m.triangles} triangles` });
    expect(m.calls).toBeLessThanOrEqual(300);
    expect(m.triangles).toBeLessThanOrEqual(30000);
  });

  test('budget au rez-de-chaussée avec les escaliers de la manche 21 : pas plus de 4 appels ni 12 triangles de plus que les escaliers fermés', async ({ page }) => {
    const measure = async (extra) => {
      await open(page, `${extra}&shadows=1&nospawn=1`);
      return page.evaluate(() => {
        const zs = window.__zs;
        const p = zs.getState().player;
        zs.setInput({ aim: { angle: Math.PI } });
        for (let i = 0; i < 10; i += 1) zs.spawnEnemy(p.x + 70 + (i % 5) * 45, p.y + 20 + Math.floor(i / 5) * 90, { type: ['marcheur', 'petit', 'voute', 'grand'][i % 4], wave: 10 });
        zs.step(0.05);
        zs.sampleScreen(0, 0, 8, 8);
        return zs.getState().render;
      });
    };
    const closed = await measure('&wave=1');
    const opened = await measure('&wave=21');
    console.log(`BUDGET lot 3e, rez-de-chaussée : escaliers fermés ${closed.calls} appels / ${closed.triangles} tri, ouverts ${opened.calls} / ${opened.triangles}`);
    expect(opened.calls - closed.calls).toBeLessThanOrEqual(4);
    expect(opened.triangles - closed.triangles).toBeLessThanOrEqual(12 + 1000); // la zone de l'aile apporte aussi ses zombies : borne large, la limite dure est 15 000
    expect(opened.triangles).toBeLessThanOrEqual(30000);
    expect(opened.calls).toBeLessThanOrEqual(300);
  });

  test('aller-retour répétés : le nombre de géométries et de textures ne croît pas (aucune fuite)', async ({ page }) => {
    await open(page, '&wave=21&nospawn=1');
    const g = async () => page.evaluate(() => { window.__zs.sampleScreen(0, 0, 4, 4); const r = window.__zs.getState().render; return [r.geometries, r.textures]; });
    await page.evaluate(() => { window.__zs.useStair('escalier-aile'); window.__zs.step(1.5); window.__zs.useStair('escalier-aile'); window.__zs.step(1.5); });
    const before = await g();
    await page.evaluate(() => { for (let i = 0; i < 10; i += 1) { window.__zs.useStair('escalier-aile'); window.__zs.step(1.5); } });
    const after = await g();
    expect(after[0]).toBeLessThanOrEqual(before[0]);
    expect(after[1]).toBeLessThanOrEqual(before[1]);
  });

  test('?fps=1 affiche « Étage : X ms » ; sans ?fps=1, rien', async ({ page }) => {
    await open(page, '&wave=21&nospawn=1&fps=1', SIZE, { freeze: false });
    await page.evaluate(() => { window.__zs.useStair('escalier-aile'); });
    await expect(page.locator('#fps-counter')).toContainText(/Étage : \d+(\.\d)? ms/);
    await open(page, '&wave=21&nospawn=1');
    expect(await page.locator('#fps-counter').count()).toBe(0);
  });

  test('HUD : au plus 96 × 300 px avec la puce d\'étage, marges de 16 px, texte de 14 px au moins, sans chevaucher Pause', async ({ page }) => {
    await open(page, '&wave=21&floor=1&nospawn=1');
    const r = await page.evaluate(() => {
      const hud = document.getElementById('hud').getBoundingClientRect();
      const chip = document.getElementById('hud-floor');
      const c = chip.getBoundingClientRect();
      const pause = document.getElementById('btn-pause').getBoundingClientRect();
      return { w: hud.width, h: hud.height, left: hud.left, top: hud.top, chipFont: parseFloat(getComputedStyle(chip).fontSize), chipInside: c.right <= hud.right + 1 && c.bottom <= hud.bottom + 1, overlap: !(hud.right <= pause.left || hud.left >= pause.right || hud.bottom <= pause.top || hud.top >= pause.bottom) };
    });
    expect(r.w).toBeLessThanOrEqual(300);
    expect(r.h).toBeLessThanOrEqual(96);
    expect(r.left).toBeGreaterThanOrEqual(16);
    expect(r.top).toBeGreaterThanOrEqual(16);
    expect(r.chipFont).toBeGreaterThanOrEqual(14);
    expect(r.chipInside).toBe(true);
    expect(r.overlap).toBe(false);
  });

  test('axe : aucune violation à l\'étage', async ({ page }) => {
    await open(page, '&wave=21&floor=1&nospawn=1');
    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations.map((v) => v.id)).toEqual([]);
  });

  test('aucune requête externe, aucun stockage, console propre pendant des allers-retours', async ({ page, baseURL, context }) => {
    const urls = [];
    const problems = [];
    page.on('request', (r) => urls.push(r.url()));
    page.on('console', (m) => ['error', 'warning'].includes(m.type()) && !BROWSER_NOISE.test(m.text()) && problems.push(m.text()));
    page.on('pageerror', (e) => problems.push(e.message));
    await open(page, '&wave=21');
    await page.evaluate(() => { for (let i = 0; i < 4; i += 1) { window.__zs.useStair('escalier-aile'); window.__zs.step(3); } });
    await page.waitForLoadState('networkidle');
    expect(urls.filter((u) => !u.startsWith(baseURL) && !u.startsWith('data:') && !u.startsWith('blob:'))).toEqual([]);
    expect(problems).toEqual([]);
    expect(await page.evaluate(() => [localStorage.length, sessionStorage.length, document.cookie])).toEqual([0, 0, '']);
    expect(await context.cookies()).toEqual([]);
  });

  test('CLS : aucun décalage de mise en page lors du changement d\'étage et de la puce', async ({ page }) => {
    await page.addInitScript(() => {
      window.__cls = 0;
      new PerformanceObserver((list) => { for (const e of list.getEntries()) if (!e.hadRecentInput) window.__cls += e.value; }).observe({ type: 'layout-shift', buffered: true });
    });
    await open(page, '&wave=21&nospawn=1', SIZE, { freeze: false });
    await page.evaluate(() => { window.__zs.useStair('escalier-aile'); });
    await page.waitForTimeout(1200);
    expect(await page.evaluate(() => window.__cls)).toBeLessThanOrEqual(0.1);
  });

  test('pause pendant le passage d\'un zombie dans l\'escalier : il ne bouge plus', async ({ page }) => {
    await open(page, '&wave=21&nospawn=1', SIZE, { freeze: false });
    await page.evaluate((b) => { window.__zs.spawnEnemy(b.x, b.y + 60, { floor: 'etage', mode: 'dedans' }); }, A_ETAGE);
    await expect.poll(async () => (await STATE(page)).enemies.some((e) => e.mode === 'escalier'), { timeout: 20000 }).toBe(true);
    await page.click('#btn-pause');
    const a = await STATE(page);
    await page.waitForTimeout(600);
    const b = await STATE(page);
    expect(b.time).toBe(a.time);
    expect(b.enemies.map((e) => [e.x, e.y, e.stairT])).toEqual(a.enemies.map((e) => [e.x, e.y, e.stairT]));
  });
});
