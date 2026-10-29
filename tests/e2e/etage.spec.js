import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { readFileSync } from 'node:fs';
import { parseZones, zonesToWorld } from '../../js/core/zones.js';
import { salle, waitReady } from './helpers.js';

// Lot 3e-B : l'étage, les escaliers, le fondu, les zombies sur deux étages, la porte 2. Tout passe par step() (temps de jeu) et les hooks de ?test=1 ; 667×375.
const SIZE = { width: 667, height: 375 };
const BIG = { width: 1440, height: 900 };
const load = (path) => JSON.parse(readFileSync(path, 'utf8'));
const world = load('data/game/maps/rez-de-chaussee/world.json');
const zonesWorld = zonesToWorld(parseZones(load('data/game/maps/rez-de-chaussee/zones.json')), world.transform);
const STAIR = (id) => zonesWorld.stairs.find((s) => s.id === id);
const AILE = STAIR('escalier-aile');
const center = (r) => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 });
const STATE = (page) => page.evaluate(() => window.__zs.getState());
const BROWSER_NOISE = /GL Driver Message|ReadPixels|GPU stall/;

async function open(page, extra = '', size = SIZE, { freeze = true } = {}) {
  await page.setViewportSize(size);
  await page.goto(`/jeu.html?test=1&seed=1&vhs=0${extra}`);
  await waitReady(page);
  if (freeze) await page.evaluate(() => { window.requestAnimationFrame = () => 0; });
  await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 150)));
  await page.evaluate(() => window.__zs.step(0.05));
}

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

const finishWave = (page) => page.evaluate(() => {
  window.__zs.skipWave();
  window.__zs.step(0.05);
  return window.__zs.getState().time;
});

test.describe('étage : départ, visibilité, étiquettes', () => {
  test('?wave=1 : rez-de-chaussée, puce « RDC », aucun maillage de l\'étage dessiné, escaliers fermés, aucune zone marquée', async ({ page }) => {
    await open(page, '&wave=1&nospawn=1');
    const s = await STATE(page);
    expect(s.floor.current).toBe('rdc');
    expect(s.floor.multi).toBe(true);
    expect(s.floor.stairs.map((q) => [q.id, q.usable])).toEqual([['escalier-aile', false], ['escalier-depart', false]]);
    expect(s.scene.visible.etage).toBe(0);
    expect(s.scene.visible.rdc).toBeGreaterThan(5);
    expect(s.scene.visible.exterieur).toBeGreaterThan(3);
    expect(s.scene.slab).toBe(false);
    expect(s.scene.marks).toEqual([]);
    await expect(page.locator('#hud-floor')).toHaveText('RDC');
    expect(s.enemies).toEqual([]);
  });

  test('?wave=21 : la porte 2 est ouverte, etage-gauche active, l\'escalier de l\'aile utilisable avec sa zone marquée au sol', async ({ page }) => {
    await open(page, '&wave=21&nospawn=1');
    const s = await STATE(page);
    expect(s.floor.current).toBe('rdc');
    expect(s.zones.doors.map((d) => [d.id, d.open, d.planned])).toEqual([['porte-1', true, false], ['porte-2', true, false], ['porte-3', false, true]]);
    expect(s.zones.list.map((z) => [z.id, z.floor, z.open])).toEqual([['depart', 'rdc', true], ['aile', 'rdc', true], ['etage-gauche', 'etage', true], ['etage-droite', 'etage', false]]);
    expect(s.floor.stairs.map((q) => [q.id, q.usable])).toEqual([['escalier-aile', true], ['escalier-depart', false]]);
    expect(s.scene.marks).toEqual(['escalier-aile:rdc']);
    expect(s.zones.activeWindows.filter((id) => id.startsWith('U'))).toEqual(['U1', 'U2', 'U3', 'U4']);
    expect(s.zones.activeSpawnPoints.filter((id) => id.startsWith('U'))).toHaveLength(8);
    expect(s.doorMeshes.ids).toEqual(['porte-3']); // le bloc de la porte de l'étage et celui de l'escalier de départ restent
  });

  test('?wave=21&floor=1 : joueur à l\'étage, puce « Étage », rez-de-chaussée invisible, dalle sombre présente, zone marquée à l\'étage', async ({ page }) => {
    await open(page, '&wave=21&floor=1&nospawn=1');
    const s = await STATE(page);
    expect(s.floor.current).toBe('etage');
    expect(s.scene.visible.rdc).toBe(0);
    expect(s.scene.visible.etage).toBeGreaterThan(5);
    expect(s.scene.visible.exterieur).toBeGreaterThan(3);
    expect(s.scene.slab).toBe(true);
    expect(s.scene.marks).toEqual(['escalier-aile:etage']);
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

test.describe('fondu entre étages', () => {
  test('useStair : verrou, voile de 0 à 1 en 0,25 s, échange une seule fois, voile de 1 à 0 en 0,25 s, joueur à l\'arrivée', async ({ page }) => {
    await open(page, '&wave=21&nospawn=1');
    const r = await page.evaluate(() => {
      const zs = window.__zs;
      const out = [];
      out.push(zs.useStair('escalier-aile'));
      for (let i = 0; i < 12; i += 1) {
        zs.step(0.05);
        const g = zs.getState();
        out.push([g.floor.current, Math.round(g.floor.fade.veil * 100) / 100, g.floor.fade.locked, g.stairLog.filter((l) => l.type === 'playerStairs').length]);
      }
      return out;
    });
    expect(r[0]).toBe(true);
    expect(r.slice(1, 5).map((q) => q[1])).toEqual([0.2, 0.4, 0.6, 0.8]);
    expect(r[5]).toEqual(['etage', 1, true, 1]);
    expect(r.slice(6, 10).map((q) => q[1])).toEqual([0.8, 0.6, 0.4, 0.2]);
    expect(r[10]).toEqual(['etage', 0, false, 1]);
    expect(r.slice(1, 5).every((q) => q[0] === 'rdc' && q[2])).toBe(true);
    const s = await STATE(page);
    const a = AILE.floors.etage.arrival;
    expect(Math.hypot(s.player.x - a.x, s.player.y - a.y)).toBeLessThan(1);
    expect(s.floor.stairs[0].cooldown).toBeGreaterThan(0.2);
  });

  test('un escalier fermé n\'est pas déclenchable', async ({ page }) => {
    await open(page, '&wave=20&nospawn=1');
    expect(await page.evaluate(() => window.__zs.useStair('escalier-aile'))).toBe(false);
    expect(await page.evaluate(() => window.__zs.setFloor(1))).toBe(false);
    expect((await STATE(page)).floor.fade.locked).toBe(false);
  });

  test('pendant les 0,5 s : joueur immobile, aucun tir, invulnérable malgré un zombie au contact ; puis 1,0 s de protection', async ({ page }) => {
    await open(page, '&wave=21&nospawn=1');
    const r = await page.evaluate(() => {
      const zs = window.__zs;
      const s0 = zs.getState();
      zs.setInput({ move: { x: 1, y: 0 } });
      zs.spawnEnemy(s0.player.x + 30, s0.player.y, { mode: 'dedans' });
      zs.useStair('escalier-aile');
      const during = [];
      for (let i = 0; i < 4; i += 1) {
        zs.step(0.05);
        const g = zs.getState();
        during.push({ x: g.player.x, hp: g.player.health, shots: g.shots.length, laser: g.laser });
      }
      return { start: s0.player, during };
    });
    for (const d of r.during) {
      expect(d.x).toBeCloseTo(r.start.x, 3);
      expect(d.hp).toBe(r.start.health);
      expect(d.shots).toBe(0);
      expect(d.laser).toBeNull();
    }
  });

  test('protection de 1,0 s après l\'arrivée (en plus du verrou) : un zombie au contact ne blesse pas', async ({ page }) => {
    await open(page, '&wave=21&nospawn=1');
    await page.evaluate(() => { window.__zs.useStair('escalier-aile'); window.__zs.step(0.3); });
    const s = await STATE(page);
    expect(s.floor.current).toBe('etage');
    expect(s.floor.grace).toBeGreaterThan(0.5);
    await page.evaluate(() => {
      const g = window.__zs.getState();
      window.__zs.spawnEnemy(g.player.x - 30, g.player.y, { floor: 'etage', mode: 'libre' });
      window.__zs.step(0.5);
    });
    expect((await STATE(page)).player.health).toBe(s.player.health);
    await page.evaluate(() => window.__zs.step(1.5));
    expect((await STATE(page)).player.health).toBeLessThan(s.player.health);
  });

  test('#floor-fade : décoratif, sans événement, opacité égale au voile, entre le canvas et #vhs, sans filtre ni mélange', async ({ page }) => {
    await open(page, '&wave=21&nospawn=1');
    const fade = page.locator('#floor-fade');
    await expect(fade).toHaveAttribute('aria-hidden', 'true');
    await expect(fade).toHaveCSS('pointer-events', 'none');
    await expect(fade).toHaveCSS('position', 'fixed');
    const order = await page.evaluate(() => [...document.getElementById('game-root').children].map((n) => n.id).filter((id) => ['game-canvas', 'floor-fade', 'vhs', 'hud'].includes(id)));
    expect(order.slice(0, 3)).toEqual(['game-canvas', 'floor-fade', order[2]]);
    await page.evaluate(() => { window.__zs.useStair('escalier-aile'); window.__zs.step(0.1); });
    const veil = (await STATE(page)).floor.fade.veil;
    expect(veil).toBeGreaterThan(0);
    await expect(fade).toHaveCSS('opacity', String(veil));
    const css = await fade.evaluate((el) => { const c = getComputedStyle(el); return [c.filter, c.mixBlendMode, c.backdropFilter, c.backgroundColor]; });
    expect(css.slice(0, 3)).toEqual(['none', 'normal', 'none']);
    const fog = await page.evaluate(() => { const probe = document.createElement('i'); probe.style.color = 'var(--game-fog)'; document.body.append(probe); const c = getComputedStyle(probe).color; probe.remove(); return c; });
    expect(css[3]).toBe(fog);
  });

  test('prefers-reduced-motion : aucun voile, échange immédiat, verrou de 0,2 s', async ({ browser }) => {
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
        out.push([g.floor.current, g.floor.fade.veil, g.floor.fade.locked]);
      }
      return out;
    });
    expect(r[0]).toEqual(['etage', 0, true]);
    expect(r.every((q) => q[1] === 0)).toBe(true);
    expect(r.slice(0, 3).every((q) => q[2])).toBe(true);
    expect(r[4][2]).toBe(false);
    await context.close();
  });

  test('pause : le fondu est figé', async ({ page }) => {
    await open(page, '&wave=21&nospawn=1', SIZE, { freeze: false });
    await page.evaluate(() => window.__zs.useStair('escalier-aile'));
    await page.click('#btn-pause');
    const a = await STATE(page);
    await page.waitForTimeout(500);
    const b = await STATE(page);
    expect(b.floor.fade.veil).toBe(a.floor.fade.veil);
    expect(b.floor.current).toBe(a.floor.current);
  });

  test('« Rejouer » annule le fondu et ramène au rez-de-chaussée, voile à 0 ; #hud-live annonce « Étage » puis « Rez-de-chaussée »', async ({ page }) => {
    await open(page, '&wave=21&nospawn=1');
    await page.evaluate(() => {
      window.__live = [];
      new MutationObserver(() => window.__live.push(document.getElementById('hud-live').textContent)).observe(document.getElementById('hud-live'), { childList: true, characterData: true, subtree: true });
      window.__zs.useStair('escalier-aile');
      window.__zs.step(0.6);
    });
    expect((await STATE(page)).floor.current).toBe('etage');
    await page.evaluate(() => { window.__zs.useStair('escalier-aile'); window.__zs.step(0.2); });
    await page.evaluate(() => window.__zs.step(0.6));
    expect((await STATE(page)).floor.current).toBe('rdc');
    expect(await page.evaluate(() => window.__live)).toEqual(expect.arrayContaining(['Étage', 'Rez-de-chaussée']));
    await page.evaluate(() => { window.__zs.useStair('escalier-aile'); window.__zs.step(0.1); });
    await page.evaluate(() => { document.getElementById('btn-pause').click(); });
    await page.click('#btn-restart');
    const s = await STATE(page);
    expect(s.floor.current).toBe('rdc');
    expect(s.floor.fade).toMatchObject({ veil: 0, locked: false });
    await expect(page.locator('#floor-fade')).toHaveCSS('opacity', '0');
  });

  test('mort du joueur : le fondu est annulé, le rez-de-chaussée est affiché', async ({ page }) => {
    await open(page, '&wave=21&floor=1&nospawn=1');
    await page.evaluate(() => { window.__zs.setChutes(0); window.__zs.downPlayer(); window.__zs.step(0.2); });
    const s = await STATE(page);
    expect(s.dead).toBe(true);
    expect(s.floor.current).toBe('rdc');
    expect(s.floor.fade.veil).toBe(0);
    expect(s.scene.visible.etage).toBe(0);
  });
});

test.describe('déclenchement par le mouvement réel', () => {
  test('un joueur déplacé dans la zone de déclenchement change d\'étage ; pas de rebond tant qu\'il y reste ; nouveau déclenchement après en être sorti', async ({ page }) => {
    await open(page, '&wave=21&nospawn=1');
    const t = center(AILE.floors.rdc.trigger);
    await page.evaluate((p) => window.__zs.setPlayer(p.x, p.y), { x: t.x, y: t.y + 120 });
    await page.evaluate(() => window.__zs.step(0.2));
    expect((await STATE(page)).floor.current).toBe('rdc');
    await page.evaluate((p) => window.__zs.setPlayer(p.x, p.y), t);
    await page.evaluate(() => window.__zs.step(0.7));
    let s = await STATE(page);
    expect(s.floor.current).toBe('etage');
    expect(s.stairLog.filter((l) => l.type === 'playerStairs')).toHaveLength(1);
    // Pas de rebond : l'arrivée est hors de la zone, le joueur y reste.
    await page.evaluate(() => window.__zs.step(3));
    expect((await STATE(page)).stairLog.filter((l) => l.type === 'playerStairs')).toHaveLength(1);
    // Retour : marcher dans la zone de l'étage.
    const u = center(AILE.floors.etage.trigger);
    await page.evaluate((p) => window.__zs.setPlayer(p.x, p.y), u);
    await page.evaluate(() => window.__zs.step(0.7));
    s = await STATE(page);
    expect(s.floor.current).toBe('rdc');
    expect(s.stairLog.filter((l) => l.type === 'playerStairs')).toHaveLength(2);
  });

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
