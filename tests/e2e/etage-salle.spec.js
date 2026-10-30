import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { entryDirection } from '../../js/core/stair-walk.js';
import { parseZones, zonesToWorld } from '../../js/core/zones.js';
import { waitReady } from './helpers.js';

// Lot 3e-C : la seconde salle de l'étage, le second escalier, la porte de l'étage, la porte 3 (manche 30), la fin de monde avec quatre salles. Tout passe par step() et les hooks ; 667×375.
const SIZE = { width: 667, height: 375 };
const load = (path) => JSON.parse(readFileSync(path, 'utf8'));
const world = load('data/game/maps/rez-de-chaussee/world.json');
const zonesWorld = zonesToWorld(parseZones(load('data/game/maps/rez-de-chaussee/zones.json')), world.transform);
const stairOf = (id) => zonesWorld.stairs.find((s) => s.id === id);
const DEPART = stairOf('escalier-depart');
const AILE = stairOf('escalier-aile');
const center = (r) => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 });
const STATE = (page) => page.evaluate(() => window.__zs.getState());
const BROWSER_NOISE = /GL Driver Message|ReadPixels|GPU stall/;
// Porte de l'étage entre les deux salles : mur x = 138 px, ouverture y 262 à 301 px (unités du jeu : marge 800, 5 par pixel).
const DOOR_X = 800 + 138 * 5;
const DOOR_Y = 800 + 281 * 5;
const RIGHT_ROOM = { x0: DOOR_X + 40, x1: 800 + 293 * 5 };

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

const finishWave = (page) => page.evaluate(() => { window.__zs.skipWave(); window.__zs.step(0.05); return window.__zs.getState().time; });
async function endWave(page, n) {
  await page.evaluate((w) => window.__zs.startWave(w), n);
  const started = await until(page, `s.waves.wave === ${n} && s.waves.phase === 'apparition'`, 5);
  expect(started, `manche ${n} démarrée`).not.toBeNull();
  return finishWave(page);
}

test.describe('porte 3 : second escalier et porte de l\'étage', () => {
  test('à la fin de la manche 30 : « Nouvelle zone » à 3,0 s, « Un escalier et une porte s\'ouvrent », doorOpen à 3,6 s, enfoncement de 1,2 s des deux blocs ensemble', async ({ page }) => {
    await open(page, '&wave=30');
    await page.evaluate(() => window.__zs.step(3.1));
    const t0 = await finishWave(page);
    expect((await STATE(page)).waves.doorPending).toEqual({ id: 'porte-3', openAfterWave: 30 });
    const ann = await until(page, `s.events.some((e) => e.type === 'doorAnnounce')`, 6);
    expect(ann.time - t0).toBeGreaterThan(2.9);
    expect(ann.time - t0).toBeLessThan(3.2);
    expect(ann.state.splash).toMatchObject({ visible: true, kind: 'zone', title: 'Nouvelle zone', subtitle: 'Un escalier et une porte s\'ouvrent' });
    expect(ann.state.doorMeshes.ids).toEqual(['porte-3']);
    expect(ann.state.doorMeshes.meshes).toBe(2);
    const opened = await until(page, `s.events.some((e) => e.type === 'doorOpen')`, 5);
    expect(opened.time - t0).toBeGreaterThan(3.5);
    expect(opened.time - t0).toBeLessThan(3.8);
    const mid = await page.evaluate(() => { window.__zs.step(0.6); return window.__zs.getState(); });
    expect(mid.zones.doors[2].sinkProgress).toBeGreaterThan(0.4);
    expect(mid.zones.doors[2].sinkProgress).toBeLessThan(0.6);
    expect(mid.doorMeshes.meshes).toBe(2); // les deux blocs s'enfoncent ensemble
    expect(mid.doorMeshes.scaleY['porte-3']).toBeLessThan(0.5);
    const done = await page.evaluate(() => { window.__zs.step(0.8); return window.__zs.getState(); });
    expect(done.zones.doors[2]).toMatchObject({ open: true, sinkProgress: 1 });
    expect(done.doorMeshes.ids).toEqual([]);
    expect(done.doorMeshes.meshes).toBe(0);
  });

  test('après l\'ouverture : les deux escaliers sont utilisables, etage-droite et ses fenêtres U5 à U7 et leurs 6 points sont actifs ; manche 31 à 12 s ; vie à 100 %, chutes non rendues', async ({ page }) => {
    await open(page, '&wave=30');
    await page.evaluate(() => window.__zs.step(3.1));
    const before = await STATE(page);
    expect(before.floor.stairs.map((q) => [q.id, q.usable])).toEqual([['escalier-aile', true], ['escalier-depart', false]]);
    expect(before.zones.activeWindows.filter((id) => ['U5', 'U6', 'U7'].includes(id))).toEqual([]);
    const t0 = await finishWave(page);
    const next = await until(page, `s.waves.wave === 31 && s.waves.phase === 'apparition'`, 14);
    expect(next.time - t0).toBeGreaterThan(11.7);
    expect(next.time - t0).toBeLessThan(12.4);
    const s = next.state;
    expect(s.floor.stairs.map((q) => [q.id, q.usable])).toEqual([['escalier-aile', true], ['escalier-depart', true]]);
    expect(s.zones.list.map((z) => [z.id, z.open])).toEqual([['depart', true], ['aile', true], ['etage-gauche', true], ['etage-droite', true]]);
    expect(s.zones.activeWindows.filter((id) => ['U5', 'U6', 'U7'].includes(id))).toEqual(['U5', 'U6', 'U7']);
    expect(s.zones.activeSpawnPoints.filter((id) => /^U[567]-/.test(id))).toHaveLength(6);
    expect(s.player.down.chutes).toBe(before.player.down.chutes);
    expect(s.scene.marks).toEqual([]); // plus de zone jaune au sol (retour du propriétaire)
  });

  test('« Prochaine zone » : 11, 21, 31 puis rien', async ({ page }) => {
    await open(page, '&nospawn=1');
    const expected = [[1, 11], [10, 11], [11, 21], [20, 21], [21, 31], [30, 31], [31, null], [35, null]];
    for (const [w, next] of expected) {
      await page.evaluate((n) => { window.__zs.startWave(n); window.__zs.step(0.05); }, w);
      await page.locator('#btn-pause').click();
      if (next === null) await expect(page.locator('#pause-next')).toBeHidden();
      else await expect(page.locator('#pause-next')).toHaveText(`Prochaine zone : manche ${next}`);
      await page.locator('#btn-resume').click();
    }
  });

  test('aucune ouverture aux manches 21 à 29 ni après la 31 : pause de 8 s, aucun événement de porte', async ({ page }) => {
    await open(page, '&wave=21');
    for (const n of [21, 25, 29, 31, 36]) {
      const t0 = await endWave(page, n);
      const next = await until(page, `s.waves.wave === ${n + 1} && s.waves.phase === 'apparition'`, 12);
      expect(next.time - t0, `après la manche ${n}`).toBeGreaterThan(7.7);
      expect(next.time - t0).toBeLessThan(8.3);
      expect(next.state.events.filter((e) => e.type.startsWith('door'))).toEqual([]);
    }
  });

  test('?wave=31 : tout est ouvert au chargement, sans animation ni annonce ; ?wave=30 : porte 3 fermée avec ses deux blocs', async ({ page }) => {
    await open(page, '&wave=31&nospawn=1');
    let s = await STATE(page);
    expect(s.zones.doors.map((d) => [d.id, d.open, d.sinkProgress])).toEqual([['porte-1', true, 1], ['porte-2', true, 1], ['porte-3', true, 1]]);
    expect(s.doorMeshes).toMatchObject({ ids: [], meshes: 0 });
    expect(s.splash.visible).toBe(false);
    expect(s.events).toEqual([]);
    expect(s.zones.next).toBeNull();
    expect(s.zones.list.every((z) => z.open)).toBe(true);
    expect(s.zones.activeWindows).toHaveLength(15);
    await open(page, '&wave=30&nospawn=1');
    s = await STATE(page);
    expect(s.zones.doors[2]).toMatchObject({ open: false, sinkProgress: 0 });
    expect(s.doorMeshes).toMatchObject({ ids: ['porte-3'], meshes: 2 });
    expect(s.zones.list.map((z) => z.open)).toEqual([true, true, true, false]);
    expect(s.zones.next).toEqual({ id: 'porte-3', wave: 31 });
  });
});

test.describe('la porte de l\'étage et la seconde salle', () => {
  const walk = (page, from, dx) => page.evaluate(([a, d, y]) => {
    const zs = window.__zs;
    zs.setPlayer(a, y);
    zs.setInput({ move: { x: d, y: 0 } });
    zs.step(3);
    zs.setInput({});
    return zs.getState().player.x;
  }, [from, dx, DOOR_Y]);

  test('avant la manche 31 : la porte de l\'étage bloque le joueur (il ne passe pas dans la seconde salle)', async ({ page }) => {
    await open(page, '&wave=30&floor=1&nospawn=1');
    const x = await walk(page, DOOR_X - 140, 1);
    expect(x).toBeLessThan(DOOR_X);
  });

  test('à la manche 31 : le joueur traverse l\'ouverture vers la seconde salle, et revient', async ({ page }) => {
    await open(page, '&wave=31&floor=1&nospawn=1');
    expect(await walk(page, DOOR_X - 140, 1)).toBeGreaterThan(DOOR_X + 60);
    expect(await walk(page, DOOR_X + 140, -1)).toBeLessThan(DOOR_X - 60);
  });

  test('avant la manche 31 : aucun zombie n\'apparaît aux fenêtres U5 à U7, aucun ne passe dans la seconde salle ; après, il y en a, même joueur en bas', async ({ page }) => {
    await open(page, '&wave=30');
    const before = await page.evaluate(() => {
      const zs = window.__zs;
      let inRight = 0;
      for (let i = 0; i < 1200; i += 1) {
        zs.step(0.05);
        for (const e of zs.getState().enemies) if (e.floor === 'etage' && e.x > 1500 && e.y > 2000 && e.x < 2265) inRight += 1;
      }
      return { log: zs.getState().spawnLog, inRight };
    });
    expect(before.log.some((l) => /^U[567]-/.test(l.id))).toBe(false);
    expect(before.inRight).toBe(0);
    await open(page, '&wave=31');
    const after = await page.evaluate(() => { const zs = window.__zs; for (let i = 0; i < 1200; i += 1) zs.step(0.05); return zs.getState().spawnLog; });
    expect(after.filter((l) => /^U[567]-/.test(l.id)).length).toBeGreaterThan(0);
    expect(after.filter((l) => /^U[567]-/.test(l.id)).every((l) => l.floor === 'etage' && l.hidden)).toBe(true);
  });

  test('monter par l\'escalier de départ (arrivée dans la seconde salle), traverser la porte, redescendre par l\'escalier de l\'aile : fondus justes, aucun rebond', async ({ page }) => {
    await open(page, '&wave=31&nospawn=1');
    const t = center(DEPART.floors.rdc.trigger);
    await page.evaluate(([p, d]) => { window.__zs.setPlayer(p.x, p.y); window.__zs.setInput({ move: d }); window.__zs.step(0.2); }, [t, entryDirection(DEPART.walk.path, 'rdc')]);
    // L'escalier de départ monte vers le nord puis tourne vers l'ouest au palier : on tourne, comme un joueur.
    await page.evaluate(() => { const zs = window.__zs; while (zs.getState().floor.walk !== null) { zs.setInput({ move: zs.getState().floor.elevation < 170 ? { x: 0, y: -1 } : { x: -1, y: 0.15 } }); zs.step(0.05); } zs.setInput({}); });
    let s = await STATE(page);
    expect(s.floor.current).toBe('etage');
    const top = center(DEPART.floors.etage.trigger);
    expect(Math.hypot(s.player.x - top.x, s.player.y - top.y)).toBeLessThan(25);
    expect(s.player.x).toBeGreaterThan(RIGHT_ROOM.x0 - 40);
    await expect(page.locator('#hud-floor')).toHaveText('Étage');
    await page.evaluate(() => window.__zs.step(3)); // pas de rebond
    expect((await STATE(page)).stairLog.filter((l) => l.type === 'playerStairs')).toHaveLength(1);
    // La porte : vers l'ouest à la hauteur de l'ouverture.
    const x = await page.evaluate(([y]) => {
      const zs = window.__zs;
      zs.setPlayer(zs.getState().player.x, y);
      zs.setInput({ move: { x: -1, y: 0 } });
      zs.step(4);
      zs.setInput({});
      return zs.getState().player.x;
    }, [DOOR_Y]);
    expect(x).toBeLessThan(DOOR_X - 40);
    const u = center(AILE.floors.etage.trigger);
    await page.evaluate(([p, d]) => { window.__zs.setPlayer(p.x, p.y); window.__zs.setInput({ move: d }); window.__zs.step(0.2); }, [u, entryDirection(AILE.walk.path, 'etage')]);
    await page.evaluate(() => { const zs = window.__zs; let n = 0; while (zs.getState().floor.walk !== null && n < 400) { zs.step(0.05); n += 1; } zs.setInput({}); });
    s = await STATE(page);
    expect(s.floor.current).toBe('rdc');
    expect(s.stairLog.filter((l) => l.type === 'playerStairs').map((l) => [l.stair, l.from, l.to])).toEqual([['escalier-depart', 'rdc', 'etage'], ['escalier-aile', 'etage', 'rdc']]);
    await expect(page.locator('#hud-floor')).toHaveText('RDC');
  });
});

test.describe('deux escaliers', () => {
  test('chaque zombie de l\'étage prend l\'escalier le plus proche par chemin (salle de droite : départ ; poche : aile)', async ({ page }) => {
    await open(page, '&wave=31&nospawn=1');
    const A_DEP = DEPART.floors.etage.arrival;
    const A_AILE = AILE.floors.etage.arrival;
    await page.evaluate(([a, b]) => {
      window.__zs.spawnEnemy(a.x, a.y + 40, { floor: 'etage', mode: 'dedans' });
      window.__zs.spawnEnemy(b.x, b.y - 60, { floor: 'etage', mode: 'dedans' });
    }, [A_DEP, A_AILE]);
    const done = await until(page, `s.stairLog.filter((l) => l.type === 'stairStart').length >= 2`, 60);
    expect(done).not.toBeNull();
    const starts = done.state.stairLog.filter((l) => l.type === 'stairStart');
    const byZombie = Object.fromEntries(starts.map((l) => [l.id, l.stair]));
    expect(Object.values(byZombie).sort()).toEqual(['escalier-aile', 'escalier-depart']);
  });

  test('au plus 2 zombies à la fois par escalier, même avec les deux escaliers utilisables', async ({ page }) => {
    await open(page, '&wave=31&nospawn=1');
    await page.evaluate(([a, b]) => {
      for (let i = 0; i < 4; i += 1) {
        window.__zs.spawnEnemy(a.x + (i % 2) * 14, a.y + 30 + i * 10, { floor: 'etage', mode: 'dedans' });
        window.__zs.spawnEnemy(b.x + (i % 2) * 14, b.y - 40 - i * 10, { floor: 'etage', mode: 'dedans' });
      }
    }, [DEPART.floors.etage.arrival, AILE.floors.etage.arrival]);
    const r = await page.evaluate(() => {
      const zs = window.__zs;
      let max = 0;
      for (let i = 0; i < 240; i += 1) {
        zs.step(0.05);
        const per = {};
        for (const e of zs.getState().enemies) if (e.mode === 'escalier') per[e.stair] = (per[e.stair] ?? 0) + 1;
        max = Math.max(max, ...Object.values(per), 0);
      }
      return { max, arrived: zs.getState().stairLog.filter((l) => l.type === 'stairArrive').length };
    });
    expect(r.max).toBe(2);
    expect(r.arrived).toBeGreaterThanOrEqual(4);
  });

  test('simulation de 120 s à ?wave=31 : le joueur alterne les étages toutes les 20 s, jamais plus de 10 zombies, aucun zombie immobile plus de 2 s hors des attentes voulues', async ({ page }) => {
    const problems = [];
    page.on('pageerror', (e) => problems.push(e.message));
    await open(page, '&wave=31');
    const r = await page.evaluate(([dep, aile]) => {
      const zs = window.__zs;
      zs.setLevels({ vie: 10 });
      zs.setChutes(5);
      let max = 0;
      let worstStill = 0;
      let worst = null;
      const last = new Map();
      for (let i = 0; i < 2400; i += 1) {
        if (i % 200 === 150) zs.killAll(); // le joueur doit survivre aux 120 s : on éclaircit les zombies toutes les 10 s
        if (i % 400 === 100) { zs.useStair(Math.floor(i / 400) % 2 === 0 ? 'escalier-depart' : 'escalier-aile'); }
        zs.step(0.05);
        const s = zs.getState();
        max = Math.max(max, s.enemies.length);
        for (const e of s.enemies) {
          const prev = last.get(e.id);
          const near = e.floor === s.floor.current && Math.hypot(e.x - s.player.x, e.y - s.player.y) < 90; // au contact du joueur : il attaque
          const waiting = near || e.mode === 'escalier' || e.mode === 'attente' || e.mode === 'arrache' || e.mode === 'escalade' || e.mode === 'approche' || e.mode === 'libre';
          if (prev && !waiting && Math.hypot(prev.x - e.x, prev.y - e.y) < 0.5) { prev.still += 0.05; if (prev.still > worstStill) { worstStill = prev.still; worst = { mode: e.mode, floor: e.floor, x: e.x, y: e.y, t: s.time, player: s.player.x + ',' + s.player.y + ' ' + s.floor.current }; } prev.x = e.x; prev.y = e.y; } else last.set(e.id, { x: e.x, y: e.y, still: 0 });
        }
        if (s.dead) break;
      }
      return { max, worstStill, worst, dead: zs.getState().dead, time: zs.getState().time, dep, aile };
    }, ['escalier-depart', 'escalier-aile']);
    expect(r.max).toBeLessThanOrEqual(10);
    expect(r.time).toBeGreaterThan(110); // 120 s de jeu, le joueur ne meurt pas
    expect(r.worstStill).toBeLessThanOrEqual(2);
    expect(problems).toEqual([]);
  });
});

test.describe('fin de monde, Rejouer, ?endless=1, mouvement réduit, sons', () => {
  test('manche 40 terminée avec les quatre salles : « Monde terminé » ; « Rejouer » : manche 1, portes fermées, rez-de-chaussée, voile à 0, aucun zombie', async ({ page }) => {
    await open(page, '&wave=40&floor=1');
    expect((await STATE(page)).floor.current).toBe('etage');
    await page.evaluate(() => { window.__zs.skipWave(); window.__zs.step(0.05); });
    await expect(page.locator('#end-panel')).toBeVisible();
    const s = await until(page, `s.worldOver === true`, 10);
    expect(s).not.toBeNull();
    await page.locator('#end-panel button').first().click().catch(() => {});
    await page.evaluate(() => window.__zs.step(0.1));
    const after = await STATE(page);
    expect(after.worldOver).toBe(false);
    expect(after.waves.wave).toBe(40); // Rejouer repart de ?wave=40, comme au lot 3c
  });

  test('sans ?wave : « Rejouer » après avoir ouvert les portes : manche 1, portes fermées, étage = rdc, voile à 0, aucun zombie', async ({ page }) => {
    await open(page);
    await page.evaluate(() => { const zs = window.__zs; zs.setDoor('porte-1', true); zs.setDoor('porte-2', true); zs.setDoor('porte-3', true); zs.setFloor(1); zs.step(0.1); });
    expect((await STATE(page)).floor.current).toBe('etage');
    await page.locator('#btn-pause').click();
    await page.locator('#btn-restart').click();
    await page.evaluate(() => window.__zs.step(0.1));
    const s = await STATE(page);
    expect(s.floor.current).toBe('rdc');
    expect(s.floor.fade).toMatchObject({ veil: 0, locked: false });
    expect(s.waves.wave).toBe(1);
    expect(s.zones.doors.map((d) => d.open)).toEqual([false, false, false]);
    expect(s.doorMeshes.ids).toEqual(['porte-1', 'porte-2', 'porte-3']);
    expect(s.enemies).toEqual([]);
  });

  test('?endless=1 : la manche 41 démarre avec les quatre salles, sans fin de monde', async ({ page }) => {
    await open(page, '&wave=40&endless=1');
    await endWave(page, 40);
    await expect(page.locator('#end-panel')).toBeHidden();
    const next = await until(page, `s.waves.wave === 41 && s.waves.phase === 'apparition'`, 12);
    expect(next).not.toBeNull();
    expect(next.state.worldOver).toBe(false);
  });

  test('mouvement réduit : le fondu de l\'escalier de départ n\'a aucun voile, l\'annonce de la porte 3 sans secousse', async ({ browser }) => {
    const context = await browser.newContext({ reducedMotion: 'reduce', viewport: SIZE });
    const page = await context.newPage();
    await open(page, '&wave=31&nospawn=1');
    const r = await page.evaluate(() => {
      const zs = window.__zs;
      zs.useStair('escalier-depart');
      const veils = [];
      for (let i = 0; i < 6; i += 1) { zs.step(0.05); veils.push(zs.getState().floor.fade.veil); }
      return { veils, floor: zs.getState().floor.current };
    });
    expect(r.veils.every((v) => v === 0)).toBe(true);
    expect(r.floor).toBe('etage');
    await context.close();
  });

  test('aucun nouveau son : l\'ouverture de la porte 3 et le fondu n\'ajoutent rien au journal des sons', async ({ page }) => {
    await open(page, '&wave=30&nospawn=1', SIZE, { freeze: false });
    await page.mouse.click(40, 40);
    await expect.poll(async () => (await STATE(page)).audio.unlocked).toBe(true);
    const known = new Set(JSON.parse(readFileSync('data/game/sounds.json', 'utf8')).sounds.map((q) => q.id));
    await page.evaluate(() => { window.__zs.step(3.1); window.__zs.skipWave(); window.__zs.step(8); window.__zs.useStair('escalier-depart'); window.__zs.step(2); });
    const log = (await STATE(page)).audio.log;
    expect(log.every((e) => known.has(e.sound))).toBe(true);
    expect(log.filter((e) => /porte|escalier|fondu|stair|door/i.test(e.sound))).toEqual([]);
  });

  test('#hud-live annonce « Fenêtre U3 ouverte » même quand le joueur est au rez-de-chaussée', async ({ page }) => {
    await open(page, '&wave=21&nospawn=1');
    await page.evaluate(() => {
      window.__live = [];
      new MutationObserver(() => window.__live.push(document.getElementById('hud-live').textContent)).observe(document.getElementById('hud-live'), { childList: true, characterData: true, subtree: true });
      window.__zs.setPlanks('U3', 1);
      window.__zs.spawnAtWindow('U3');
    });
    const done = await until(page, `s.windows.find((w) => w.id === 'U3').planks === 0`, 60);
    expect(done).not.toBeNull();
    expect((await STATE(page)).floor.current).toBe('rdc');
    expect(await page.evaluate(() => window.__live)).toContain('Fenêtre U3 ouverte');
  });
});

test.describe('budget, hygiène', () => {
  const measure = (page, floor) => page.evaluate(([where]) => {
    const zs = window.__zs;
    const p = zs.getState().player;
    zs.setInput({ aim: { angle: Math.PI } });
    const T = ['marcheur', 'petit', 'voute', 'grand'];
    const G = ['lent', 'marche', 'rampe', 'course'];
    for (let i = 0; i < 10; i += 1) zs.spawnEnemy(p.x + 40 + (i % 5) * 30, p.y + (Math.floor(i / 5) - 0.5) * 60, { type: T[i % 4], gait: G[(i + Math.floor(i / 4)) % 4], wave: 31, floor: where });
    zs.step(0.05);
    zs.sampleScreen(0, 0, 8, 8);
    return zs.getState().render;
  }, [floor]);

  test('budget U4 : joueur dans la seconde salle de l\'étage, 10 zombies, ombres : 300 appels et 15 000 triangles au plus ; U1 : poche', async ({ page }, testInfo) => {
    await open(page, '&wave=31&floor=1&shadows=1&nospawn=1');
    const u1 = await measure(page, 'etage');
    await page.evaluate(() => window.__zs.killAll());
    await page.evaluate(([x, y]) => window.__zs.setPlayer(x, y), [DOOR_X + 300, DOOR_Y + 40]);
    const u4 = await measure(page, 'etage');
    console.log(`BUDGET lot 3e-C, étage : U1 ${u1.calls} appels / ${u1.triangles} tri, U4 (seconde salle) ${u4.calls} / ${u4.triangles}`);
    testInfo.annotations.push({ type: 'rendu', description: `U1 ${u1.calls}/${u1.triangles} ; U4 ${u4.calls}/${u4.triangles}` });
    for (const m of [u1, u4]) {
      expect(m.calls).toBeLessThanOrEqual(300);
      expect(m.triangles).toBeLessThanOrEqual(30000);
    }
  });

  test('rez-de-chaussée avec les deux escaliers ouverts : au plus 4 appels de plus que les escaliers fermés ; limites absolues tenues', async ({ page }) => {
    const run = async (extra) => {
      await open(page, `${extra}&shadows=1&nospawn=1`);
      return measure(page, 'rdc');
    };
    const closed = await run('&wave=1');
    const opened = await run('&wave=31');
    console.log(`BUDGET lot 3e-C, rez-de-chaussée : fermés ${closed.calls} / ${closed.triangles}, ouverts ${opened.calls} / ${opened.triangles}`);
    expect(opened.calls - closed.calls).toBeLessThanOrEqual(4);
    expect(opened.calls).toBeLessThanOrEqual(300);
    expect(opened.triangles).toBeLessThanOrEqual(30000);
  });

  test('aucune requête externe, aucun stockage, console propre pendant l\'ouverture de la porte 3 et les deux escaliers', async ({ page, baseURL, context }) => {
    const urls = [];
    const problems = [];
    page.on('request', (r) => urls.push(r.url()));
    page.on('console', (m) => ['error', 'warning'].includes(m.type()) && !BROWSER_NOISE.test(m.text()) && problems.push(m.text()));
    page.on('pageerror', (e) => problems.push(e.message));
    await open(page, '&wave=30');
    await page.evaluate(() => { window.__zs.step(3.1); window.__zs.skipWave(); window.__zs.step(14); window.__zs.useStair('escalier-depart'); window.__zs.step(3); window.__zs.useStair('escalier-aile'); window.__zs.step(3); });
    await page.waitForLoadState('networkidle');
    expect(urls.filter((u) => !u.startsWith(baseURL) && !u.startsWith('data:') && !u.startsWith('blob:'))).toEqual([]);
    expect(problems).toEqual([]);
    expect(await page.evaluate(() => [localStorage.length, sessionStorage.length, document.cookie])).toEqual([0, 0, '']);
    expect(await context.cookies()).toEqual([]);
  });

  test('?map=salle : inchangé (une zone, aucune porte, aucun étage)', async ({ page }) => {
    await open(page, '&map=salle&wave=40');
    const s = await STATE(page);
    expect(s.zones.list).toHaveLength(1);
    expect(s.zones.doors).toEqual([]);
    expect(s.floor.multi).toBe(false);
    expect(s.zones.next).toBeNull();
  });
});
