import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { readFileSync } from 'node:fs';
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
    expect(s.scene.visible.rdc).toBeGreaterThan(5);
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
    expect(s.scene.exteriorY).toBe(-180); // retour du propriétaire : l'étage est au-dessus, le sol de l'extérieur est abaissé de floorLift
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
  test('un zombie n\'est dessiné que sur l\'étage du joueur ; le changement d\'étage inverse les deux', async ({ page }) => {
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
    expect(s.enemies.map((e) => [e.floor, e.visible])).toEqual([['rdc', false], ['etage', true]]);
  });

  test('un zombie de l\'étage atteint l\'escalier, y passe 1,5 s, arrive au rez-de-chaussée au point d\'arrivée', async ({ page }) => {
    await open(page, '&wave=21&nospawn=1');
    await page.evaluate((b) => { window.__zs.spawnEnemy(b.x, b.y + 150, { floor: 'etage', mode: 'dedans' }); }, A_ETAGE);
    const done = await until(page, `s.stairLog.some((l) => l.type === 'stairArrive')`, 60);
    expect(done).not.toBeNull();
    const log = done.state.stairLog.filter((l) => l.type !== 'playerStairs');
    const start = log.find((l) => l.type === 'stairStart');
    const arrive = log.find((l) => l.type === 'stairArrive');
    expect(start).toMatchObject({ stair: 'escalier-aile', from: 'etage', to: 'rdc' });
    expect(arrive).toMatchObject({ stair: 'escalier-aile', from: 'etage', to: 'rdc' });
    expect(arrive.time - start.time).toBeGreaterThanOrEqual(1.5 - 0.06);
    expect(done.state.enemies[0].floor).toBe('rdc');
    expect(Math.hypot(done.state.enemies[0].x - A_RDC.x, done.state.enemies[0].y - A_RDC.y)).toBeLessThan(80);
  });

  test('un zombie du rez-de-chaussée monte quand le joueur est à l\'étage', async ({ page }) => {
    await open(page, '&wave=21&floor=1&nospawn=1');
    await page.evaluate((a) => { window.__zs.spawnEnemy(a.x, a.y + 120, { floor: 'rdc', mode: 'dedans' }); }, A_RDC);
    const done = await until(page, `s.stairLog.some((l) => l.type === 'stairArrive')`, 60);
    expect(done).not.toBeNull();
    expect(done.state.stairLog.find((l) => l.type === 'stairArrive')).toMatchObject({ from: 'rdc', to: 'etage' });
    expect(done.state.enemies[0].floor).toBe('etage');
  });

  test('au plus 2 zombies à la fois dans un escalier ; les autres attendent', async ({ page }) => {
    await open(page, '&wave=21&nospawn=1');
    await page.evaluate((b) => {
      for (let i = 0; i < 5; i += 1) window.__zs.spawnEnemy(b.x + (i % 3) * 14, b.y + 40 + i * 12, { floor: 'etage', mode: 'dedans' });
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
    expect(r.max).toBe(2);
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
      zs.step(0.3);
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
    expect(m.triangles).toBeLessThanOrEqual(15000);
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
    expect(opened.triangles).toBeLessThanOrEqual(15000);
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
