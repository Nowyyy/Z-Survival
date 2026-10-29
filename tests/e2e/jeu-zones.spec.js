import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { readFileSync } from 'node:fs';
import { pointInPolygon } from '../../js/core/shape.js';
import { parseZones, zonesToWorld } from '../../js/core/zones.js';
import { waitReady } from './helpers.js';

// Lot 3c-B : zones, porte 1 (ouverte à la fin de la manche 10), 40 manches et fin de monde, mobilier de complément.
// Tout passe par step() (temps de jeu) et les hooks de ?test=1 (skipWave, setDoor) ; 667×375 de préférence ; aucune durée réelle sauf le test de la pause.
const SIZE = { width: 667, height: 375 };
const BIG = { width: 1440, height: 900 };
const load = (path) => JSON.parse(readFileSync(path, 'utf8'));
const world = load('data/game/maps/rez-de-chaussee/world.json');
const zonesWorld = zonesToWorld(parseZones(load('data/game/maps/rez-de-chaussee/zones.json')), world.transform);
const AILE = zonesWorld.zones.find((z) => z.id === 'aile').region;
const EAST = { x: 1570, y: 2007 }; // grande salle, devant la porte
const WEST = { x: 1400, y: 2007 }; // aile, derrière la porte
const BROWSER_NOISE = /GL Driver Message|ReadPixels|GPU stall/;
const STATE = (page) => page.evaluate(() => window.__zs.getState());
const HALL = ['F4', 'F5', 'F6', 'F7', 'F8'];
const WING = ['F1', 'F2', 'F3'];
// Références mesurées sur main (lot 3b) dans les mêmes conditions : 10 zombies variés, planches, ombres, cône (voir le bilan du lot 3c).
const REF = { calls: 194, triangles: 14032 };

async function open(page, extra = '', size = SIZE, { freeze = true } = {}) {
  await page.setViewportSize(size);
  await page.goto(`/jeu.html?test=1&seed=1&vhs=0${extra}`);
  await waitReady(page);
  if (freeze) await page.evaluate(() => { window.requestAnimationFrame = () => 0; });
  await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 150)));
  await page.evaluate(() => window.__zs.step(0.05));
}

// Avance par pas de 0,05 s jusqu'à ce que la condition (corps de fonction recevant l'état) soit vraie ; renvoie l'état et le temps de jeu écoulé, ou null si trop long.
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

// Termine la manche en cours puis avance d'un pas : la fin de manche est émise. Renvoie le temps de jeu de la fin.
const finishWave = (page) => page.evaluate(() => {
  const zs = window.__zs;
  zs.skipWave();
  zs.step(0.05);
  return zs.getState().time;
});

// Va jusqu'à la manche n (démarrage de l'apparition) puis la termine ; renvoie le temps de fin.
async function endWave(page, n) {
  await page.evaluate((w) => window.__zs.startWave(w), n);
  const started = await until(page, `s.waves.wave === ${n} && s.waves.phase === 'apparition'`, 5);
  expect(started, `manche ${n} démarrée`).not.toBeNull();
  return finishWave(page);
}

test.describe('zones : départ, porte fermée', () => {
  test('au départ : « depart » ouverte, « aile » fermée ; F4 à F8 actives, F1 à F3 inactives ; 10 points d\'apparition actifs', async ({ page }) => {
    await open(page);
    const s = await STATE(page);
    expect(s.zones.list.map((z) => [z.id, z.open])).toEqual([['depart', true], ['aile', false], ['etage-gauche', false], ['etage-droite', false]]); // lot 3e : deux zones d'étage
    expect(s.zones.list[0].windows).toEqual(HALL);
    expect(s.zones.list[1].windows).toEqual(WING);
    expect(s.zones.activeWindows).toEqual(HALL);
    expect(s.zones.activeSpawnPoints).toHaveLength(10);
    expect(s.zones.activeSpawnPoints.every((id) => HALL.some((w) => id.startsWith(`${w}-`)))).toBe(true);
    expect(s.zones.list[1].spawnPoints).toHaveLength(6);
    expect(s.windows.filter((w) => w.active).map((w) => w.id)).toEqual(HALL);
    expect(s.windows.filter((w) => w.floor !== 'etage').map((w) => [w.id, w.zone])).toEqual([...WING.map((id) => [id, 'aile']), ...HALL.map((id) => [id, 'depart'])]);
    expect(s.zones.next).toEqual({ id: 'porte-1', wave: 11 });
    expect(s.zones.doors.map((d) => [d.id, d.open, d.planned])).toEqual([['porte-1', false, false], ['porte-2', false, false], ['porte-3', false, false]]);
  });

  test('la porte est visible (un maillage de 12 triangles au plus) et solide : le joueur ne passe pas dans l\'aile', async ({ page }) => {
    await open(page);
    const before = await STATE(page);
    expect(before.doorMeshes.ids).toContain('porte-1'); // lot 3e : les blocs des portes 2 et 3 sont aussi dessinés
    expect(before.doorMeshes.triangles).toBeLessThanOrEqual(12 * before.doorMeshes.meshes);
    expect(before.doorMeshes.scaleY['porte-1']).toBe(1);
    const p = await page.evaluate(([x, y]) => {
      const zs = window.__zs;
      zs.setPlayer(x, y);
      zs.setInput({ move: { x: -1, y: 0 } });
      zs.step(4);
      zs.setInput({});
      return zs.getState().player;
    }, [EAST.x, EAST.y]);
    expect(p.x).toBeGreaterThan(1514);
    expect(pointInPolygon(p.x, p.y, AILE)).toBe(false);
  });

  test('les 8 fenêtres ont leurs 4 planches visibles, y compris celles de la zone fermée', async ({ page }) => {
    await open(page);
    const s = await STATE(page);
    expect(s.windows.filter((w) => w.floor !== 'etage').map((w) => w.planks)).toEqual(Array(8).fill(4));
    expect(s.plankMesh.nailed).toBe(32 + 28); // F1 à F8 et U1 à U7 (lot 3e)
    await open(page, '&planks=2');
    expect((await STATE(page)).windows.filter((w) => w.floor !== 'etage').map((w) => w.planks)).toEqual(Array(8).fill(2));
  });

  test('aucun zombie dans l\'aile pendant 60 s de jeu simulé à la manche 5, ni aucune planche de F1 à F3 arrachée', async ({ page }) => {
    await open(page, '&wave=5');
    const r = await page.evaluate(([aile]) => {
      const zs = window.__zs;
      zs.setChutes(99);
      let inside = 0;
      let maxAlive = 0;
      for (let i = 0; i < 1200; i += 1) {
        zs.step(0.05);
        const s = zs.getState();
        maxAlive = Math.max(maxAlive, s.enemies.length);
        for (const e of s.enemies) {
          let c = false;
          for (let a = 0, b = aile.length - 1; a < aile.length; b = a, a += 1) {
            const [xa, ya] = aile[a];
            const [xb, yb] = aile[b];
            if ((ya > e.y) !== (yb > e.y) && e.x < ((xb - xa) * (e.y - ya)) / (yb - ya) + xa) c = !c;
          }
          if (c) inside += 1;
        }
      }
      return { inside, maxAlive, planks: zs.getState().windows.filter((w) => ['F1', 'F2', 'F3'].includes(w.id)).map((w) => w.planks) };
    }, [AILE]);
    expect(r.maxAlive).toBeGreaterThan(0);
    expect(r.inside).toBe(0);
    expect(r.planks).toEqual([4, 4, 4]);
  });

  test('manche 1 : tous les zombies arrivent par F4 à F8 ; aucun point de l\'aile avant la manche 11', async ({ page }) => {
    await open(page);
    const r = await page.evaluate(() => {
      const zs = window.__zs;
      zs.setChutes(99);
      zs.step(150);
      const s = zs.getState();
      return { log: s.spawnLog.map((l) => l.id), planks: s.windows.map((w) => w.planks), wave: s.waves.wave };
    });
    expect(r.log.length).toBeGreaterThanOrEqual(5);
    for (const id of r.log) expect(HALL.some((w) => id.startsWith(`${w}-`)), id).toBe(true);
    expect(r.planks.slice(0, 3)).toEqual([4, 4, 4]);
  });

  test('une balle et le laser s\'arrêtent sur la porte fermée, sans dégâts sur le zombie derrière', async ({ page }) => {
    await open(page, '&nospawn=1');
    const r = await page.evaluate(([east, west]) => {
      const zs = window.__zs;
      zs.setPlayer(east.x, east.y);
      const id = zs.spawnEnemy(west.x - 40, west.y);
      zs.setInput({ aim: { angle: Math.PI } });
      zs.step(0.1);
      const mid = zs.getState();
      zs.fire(Math.PI);
      zs.step(1.5);
      const end = zs.getState();
      const z = end.enemies.find((e) => e.id === id);
      return { laser: mid.laser, health: z.health, maxHp: z.maxHp, shots: end.shots.length, bullets: end.bullets.length };
    }, [EAST, WEST]);
    expect(r.laser.stoppedBy).toBe('porte-1');
    expect(r.laser.hit).toBeNull();
    expect(r.health).toBe(r.maxHp);
    expect(r.bullets).toBe(0);
    await page.evaluate(() => window.__zs.setInput({}));
  });

  test('un zombie déjà dans l\'aile reste à l\'abri de la porte fermée : il ne reçoit aucun tir et ne rejoint pas le joueur', async ({ page }) => {
    await open(page, '&nospawn=1');
    const r = await page.evaluate(([east, west]) => {
      const zs = window.__zs;
      zs.setPlayer(east.x, east.y);
      zs.spawnEnemy(west.x, west.y);
      zs.setInput({ aim: { angle: Math.PI } });
      zs.step(6);
      const s = zs.getState();
      return { x: s.enemies[0].x, kills: s.kills, hp: s.enemies[0].hp, maxHp: s.enemies[0].maxHp, playerHp: s.player.health, max: s.player.maxHp };
    }, [EAST, WEST]);
    expect(r.x).toBeLessThan(1466);
    expect(r.kills).toBe(0);
    expect(r.hp).toBe(r.maxHp);
    expect(r.playerHp).toBe(r.max);
    await page.evaluate(() => window.__zs.setInput({}));
  });
});

test.describe('zones : ouverture de la porte 1 à la fin de la manche 10', () => {
  test('séquence : « Vague 10 terminée », « Nouvelle zone » à 3,0 s, doorOpen à 3,6 s, enfoncement de 1,2 s, manche 11 à 12 s', async ({ page }) => {
    await open(page, '&wave=10');
    // La vie est réduite avant la fin de la manche : un zombie au contact, retiré par skipWave.
    await page.evaluate(() => {
      const zs = window.__zs;
      zs.step(3.1);
      const p = zs.getState().player;
      zs.spawnEnemy(p.x + 30, p.y);
      zs.step(1.5);
      zs.setPlanks('F5', 1);
    });
    const hurt = await STATE(page);
    expect(hurt.player.health).toBeLessThan(hurt.player.maxHp);
    const chutes = hurt.player.down.chutes;
    const t0 = await finishWave(page);
    let s = await STATE(page);
    expect(s.splash).toMatchObject({ visible: true, kind: 'fin' });
    expect(s.splash.title).toBe('Vague 10 terminée');
    expect(s.player.health).toBe(s.player.maxHp);
    expect(s.zones.doors[0].open).toBe(false);
    expect(s.waves.doorPending).toEqual({ id: 'porte-1', openAfterWave: 10 }); // fin de la manche 10 : la porte 1 est celle qui s'ouvre
    const announce = await until(page, `s.events.some((e) => e.type === 'doorAnnounce')`, 5);
    expect(announce.time - t0).toBeGreaterThan(2.9);
    expect(announce.time - t0).toBeLessThan(3.2);
    s = announce.state;
    expect(s.splash).toMatchObject({ visible: true, kind: 'zone', title: 'Nouvelle zone', subtitle: 'Une porte s\'ouvre' });
    expect(s.zones.doors[0].open).toBe(false);
    const opened = await until(page, `s.events.some((e) => e.type === 'doorOpen')`, 5);
    expect(opened.time - t0).toBeGreaterThan(3.5);
    expect(opened.time - t0).toBeLessThan(3.8);
    const tOpen = opened.state.events.find((e) => e.type === 'doorOpen').time;
    const tAnnounce = opened.state.events.find((e) => e.type === 'doorAnnounce').time;
    expect(tOpen - tAnnounce).toBeGreaterThan(0.5);
    expect(tOpen - tAnnounce).toBeLessThan(0.7);
    // Enfoncement : de 0 à 1 en 1,2 s, puis la porte disparaît.
    expect(opened.state.zones.doors[0].sinkProgress).toBeLessThan(0.1);
    const mid = await page.evaluate(() => { window.__zs.step(0.6); return window.__zs.getState(); });
    expect(mid.zones.doors[0].sinkProgress).toBeGreaterThan(0.4);
    expect(mid.zones.doors[0].sinkProgress).toBeLessThan(0.6);
    expect(mid.doorMeshes.scaleY['porte-1']).toBeLessThan(0.5);
    expect(mid.doorMeshes.scaleY['porte-1']).toBeGreaterThan(0.001);
    const done = await page.evaluate(() => { window.__zs.step(0.8); return window.__zs.getState(); });
    expect(done.zones.doors[0]).toMatchObject({ open: true, sinkProgress: 1 });
    expect(done.doorMeshes.ids).not.toContain('porte-1');
    // Rien d'autre ne change : chutes non rendues, planches non remises à neuf, débris conservés.
    expect(done.player.down.chutes).toBe(chutes);
    expect(done.windows.find((w) => w.id === 'F5').planks).toBe(1);
    expect(done.plankMesh.debris).toBeGreaterThan(0);
    // 8 fenêtres, 16 points actifs, et la manche 11 démarre 12 s après la fin de la manche 10 avec son annonce de début de 3,0 s.
    expect(done.zones.activeWindows).toHaveLength(8);
    expect(done.zones.activeSpawnPoints).toHaveLength(16);
    const debut = await until(page, `s.splash.kind === 'debut' && s.splash.visible`, 12);
    expect(debut.state.splash.title).toBe('Vague 11');
    expect(debut.time - t0).toBeGreaterThan(8.8);
    expect(debut.time - t0).toBeLessThan(9.3);
    const wave = await until(page, `s.waves.wave === 11 && s.waves.phase === 'apparition'`, 12);
    expect(wave.time - t0).toBeGreaterThan(11.7);
    expect(wave.time - t0).toBeLessThan(12.3);
  });

  test('« Nouvelle zone » est centrée, dans les marges, et #hud-live l\'annonce une fois', async ({ page }) => {
    await open(page, '&wave=10', SIZE);
    await page.evaluate(() => {
      window.__live = [];
      new MutationObserver(() => window.__live.push(document.getElementById('hud-live').textContent)).observe(document.getElementById('hud-live'), { childList: true, characterData: true, subtree: true });
    });
    await endWave(page, 10);
    await until(page, `s.splash.kind === 'zone' && s.splash.step === 'tenue'`, 6);
    const box = await page.evaluate(() => {
      const b = document.querySelector('#wave-announce .wave-announce-body').getBoundingClientRect();
      return { left: b.left, right: b.right, top: b.top, bottom: b.bottom, width: window.innerWidth, height: window.innerHeight };
    });
    expect(box.left).toBeGreaterThanOrEqual(16);
    expect(box.right).toBeLessThanOrEqual(box.width - 16);
    expect(box.top).toBeGreaterThanOrEqual(0);
    expect(box.bottom).toBeLessThanOrEqual(box.height);
    expect(Math.abs((box.left + box.right) / 2 - box.width / 2)).toBeLessThan(4);
    await page.evaluate(() => window.__zs.step(12));
    const live = await page.evaluate(() => window.__live);
    expect(live.filter((t) => /Nouvelle zone/.test(t))).toHaveLength(1);
  });

  test('après l\'ouverture, le joueur passe dans l\'aile par l\'ouverture (85 de large)', async ({ page }) => {
    await open(page, '&nospawn=1');
    const p = await page.evaluate(([x, y]) => {
      const zs = window.__zs;
      zs.setDoor('porte-1', true);
      zs.setPlayer(x, y);
      zs.setInput({ move: { x: -1, y: 0 } });
      zs.step(3);
      zs.setInput({});
      return zs.getState().player;
    }, [EAST.x, EAST.y]);
    expect(pointInPolygon(p.x, p.y, AILE)).toBe(true);
    expect(p.x).toBeLessThan(1440);
  });

  test('manche 11 : les zombies apparaissent aussi aux fenêtres de l\'aile, les attaquent et entrent', async ({ page }) => {
    await open(page, '&wave=11');
    const r = await page.evaluate(() => {
      const zs = window.__zs;
      zs.setChutes(99);
      let entered = new Set();
      let torn = 0;
      for (let i = 0; i < 2400; i += 1) {
        zs.step(0.05);
        const s = zs.getState();
        for (const e of s.enemies) if (['F1', 'F2', 'F3'].includes(e.entered)) entered.add(e.id);
        torn = Math.max(torn, ...s.windows.filter((w) => ['F1', 'F2', 'F3'].includes(w.id)).map((w) => 4 - w.planks));
      }
      const s = zs.getState();
      return { log: s.spawnLog.map((l) => l.id), entered: entered.size, torn, wave: s.waves.wave };
    });
    expect(r.log.some((id) => /^F[123]-/.test(id))).toBe(true);
    expect(r.log.some((id) => /^F[4-8]-/.test(id))).toBe(true);
    expect(r.torn).toBeGreaterThanOrEqual(1);
    expect(r.entered).toBeGreaterThanOrEqual(1);
  });

  test('à ?wave=26, 90 s de jeu : aucun zombie bloqué plus de 2 s', async ({ page }) => {
    await open(page, '&wave=26');
    const r = await page.evaluate(() => {
      const zs = window.__zs;
      zs.setChutes(99);
      const track = new Map();
      let maxStill = 0;
      let where = null;
      for (let i = 0; i < 1800; i += 1) {
        zs.step(0.05);
        const s = zs.getState();
        const p = s.player;
        for (const e of s.enemies) {
          const gap = Math.hypot(e.x - p.x, e.y - p.y) - (e.radius + 18);
          const wait = e.mode === 'attente' || e.mode === 'arrache' || (e.mode === 'approche' && e.speed === 0) || (e.mode === 'dedans' && gap <= 4) || (e.mode === 'libre' && gap <= 4);
          const prev = track.get(e.id);
          if (wait || !prev || Math.hypot(prev.x - e.x, prev.y - e.y) > 0.02) track.set(e.id, { x: e.x, y: e.y, t: 0 });
          else {
            const t = prev.t + 0.05;
            track.set(e.id, { x: e.x, y: e.y, t });
            if (t > maxStill) { maxStill = t; where = { mode: e.mode, window: e.window, x: e.x, y: e.y }; }
          }
        }
      }
      return { maxStill, where };
    });
    expect(r.maxStill, JSON.stringify(r.where)).toBeLessThanOrEqual(2.05);
  });
});

test.describe('zones : ?wave=N, fin de monde, Rejouer, ancienne salle', () => {
  test('?wave=11 : porte ouverte au chargement, sans animation ni annonce, maillage non construit ; ?wave=10 : fermée', async ({ page }) => {
    await open(page, '&wave=11&nospawn=1');
    let s = await STATE(page);
    expect(s.zones.doors[0]).toMatchObject({ open: true, sinkProgress: 1 });
    expect(s.doorMeshes.ids).not.toContain('porte-1');
    expect(s.splash.visible).toBe(false);
    expect(s.events).toEqual([]);
    expect(s.zones.list.map((z) => z.open)).toEqual([true, true, false, false]);
    expect(s.zones.activeWindows).toHaveLength(8);
    expect(s.zones.next).toEqual({ id: 'porte-2', wave: 21 });
    await open(page, '&wave=10&nospawn=1');
    s = await STATE(page);
    expect(s.zones.doors[0].open).toBe(false);
    expect(s.doorMeshes.ids).toContain('porte-1');
    expect(s.zones.next).toEqual({ id: 'porte-1', wave: 11 });
  });

  test('?wave=40 puis skipWave() : « Monde terminé », « Vague atteinte : 40 », plus aucun zombie ; #hud-live l\'annonce une fois', async ({ page }) => {
    await open(page, '&wave=40');
    await page.evaluate(() => {
      window.__live = [];
      new MutationObserver(() => window.__live.push(document.getElementById('hud-live').textContent)).observe(document.getElementById('hud-live'), { childList: true, characterData: true, subtree: true });
    });
    await endWave(page, 40);
    await expect(page.locator('#end-panel')).toBeVisible();
    await expect(page.locator('#end-title')).toHaveText('Monde terminé');
    await expect(page.locator('#end-wave')).toHaveText('Vague atteinte : 40');
    await expect(page.locator('#end-panel')).toHaveAttribute('data-block', 'E2-7');
    const s = await STATE(page);
    expect(s.worldOver).toBe(true);
    expect(s.waves).toMatchObject({ phase: 'monde-termine', worldEnd: true, alive: 0, toSpawn: 0 });
    await page.evaluate(() => window.__zs.step(60));
    const after = await STATE(page);
    expect(after.enemies).toEqual([]);
    expect(after.waves.wave).toBe(40);
    const live = await page.evaluate(() => window.__live);
    expect(live.filter((t) => /Monde terminé/.test(t))).toHaveLength(1);
  });

  test('« Rejouer » après la fin du monde : repart de ?wave=N, plus de fin de monde, état propre ; sans ?wave, manche 1 et porte fermée', async ({ page }) => {
    await open(page, '&wave=40');
    await endWave(page, 40);
    await page.locator('#btn-replay').click();
    await expect(page.locator('#end-panel')).toBeHidden();
    await page.evaluate(() => window.__zs.step(0.1));
    let s = await STATE(page);
    expect(s.waves).toMatchObject({ wave: 40, worldEnd: false });
    expect(s.worldOver).toBe(false);
    expect(s.zones.doors[0]).toMatchObject({ open: true, sinkProgress: 1 });
    expect(s.events).toEqual([]);
    expect(s.windows.filter((w) => w.floor !== 'etage').map((w) => w.planks)).toEqual(Array(8).fill(4));
    expect(s.kills).toBe(0);
    // Sans ?wave : la porte ouverte pendant la partie est refermée par Rejouer, et la manche 1 revient.
    await open(page, '&nospawn=1');
    await page.evaluate(() => { window.__zs.startWave(12); window.__zs.setDoor('porte-1', true); });
    expect((await STATE(page)).zones.doors[0].open).toBe(true);
    await page.locator('#btn-pause').click();
    await page.locator('#btn-restart').click();
    await page.evaluate(() => window.__zs.step(0.1));
    s = await STATE(page);
    expect(s.zones.doors[0]).toMatchObject({ open: false, sinkProgress: 0 });
    expect(s.doorMeshes.ids).toContain('porte-1');
    expect(s.zones.list.map((z) => z.open)).toEqual([true, false, false, false]);
  });

  test('?endless=1 : la manche 41 démarre, sans fin de monde', async ({ page }) => {
    await open(page, '&wave=40&endless=1');
    await endWave(page, 40);
    await expect(page.locator('#end-panel')).toBeHidden();
    const next = await until(page, `s.waves.wave === 41 && s.waves.phase === 'apparition'`, 12);
    expect(next).not.toBeNull();
    expect((await STATE(page)).worldOver).toBe(false);
  });

  test('?endless=1 ne mémorise rien et n\'expose rien sans ?test=1', async ({ page }) => {
    await page.setViewportSize(SIZE);
    await page.goto('/jeu.html?endless=1&vhs=0');
    await page.waitForFunction(() => document.getElementById('game-root')?.hidden === false || document.getElementById('game-error')?.hidden === false, null, { timeout: 60_000 });
    expect(await page.evaluate(() => typeof window.__zs)).toBe('undefined');
    expect(await page.evaluate(() => [localStorage.length, sessionStorage.length, document.cookie])).toEqual([0, 0, '']);
  });

  test('aucune transition après la manche 31 (les portes 1 à 3 sont ouvertes) : pause de 8 s', async ({ page }) => {
    await open(page, '&wave=31');
    for (const n of [31]) { // les manches 20 et 30 ouvrent les portes 2 et 3 (lot 3e)
      const t0 = await endWave(page, n);
      const next = await until(page, `s.waves.wave === ${n + 1} && s.waves.phase === 'apparition'`, 12);
      expect(next.time - t0, `après la manche ${n}`).toBeGreaterThan(7.7);
      expect(next.time - t0).toBeLessThan(8.3);
    }
    const s = await STATE(page);
    expect(s.events).toEqual([]);
    expect(s.zones.doors.every((d) => d.open)).toBe(true);
    expect(s.doorMeshes.ids).toEqual([]);
  });

  test('?map=salle : une seule zone, aucune porte, aucune fin de monde, pause de 8 s, pas de ligne « Prochaine zone »', async ({ page }) => {
    await open(page, '&map=salle&wave=9');
    let s = await STATE(page);
    expect(s.zones.list).toHaveLength(1);
    expect(s.zones.doors).toEqual([]);
    expect(s.zones.next).toBeNull();
    expect(s.doorMeshes.ids).toEqual([]);
    const t0 = await endWave(page, 10);
    const next = await until(page, `s.waves.wave === 11 && s.waves.phase === 'apparition'`, 12);
    expect(next.time - t0).toBeGreaterThan(7.7);
    expect(next.time - t0).toBeLessThan(8.3);
    s = await STATE(page);
    expect(s.events).toEqual([]);
    await endWave(page, 40);
    await page.evaluate(() => window.__zs.step(1));
    s = await STATE(page);
    expect(s.worldOver).toBe(false);
    expect(s.waves.worldEnd).toBe(false);
    await page.locator('#btn-pause').click();
    await expect(page.locator('#pause-next')).toBeHidden();
  });
});

test.describe('zones : panneau de pause, mouvement réduit, interruptions', () => {
  test('pause : « Prochaine zone : manche 11 » aux manches 1 à 10, masquée dès la manche 11 ; le panneau tient à 667×375', async ({ page }) => {
    await open(page, '&nospawn=1');
    for (const n of [1, 5, 10]) {
      await page.evaluate((w) => { window.__zs.startWave(w); window.__zs.step(0.05); }, n);
      await page.locator('#btn-pause').click();
      await expect(page.locator('#pause-next')).toHaveText('Prochaine zone : manche 11');
      const fit = await page.evaluate(() => {
        const r = document.querySelector('#pause-panel .panel').getBoundingClientRect();
        return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, w: innerWidth, h: innerHeight, small: [...document.querySelectorAll('#pause-panel button')].filter((b) => !b.hidden && b.getBoundingClientRect().height < 44).length };
      });
      expect(fit.top).toBeGreaterThanOrEqual(0);
      expect(fit.bottom).toBeLessThanOrEqual(fit.h);
      expect(fit.left).toBeGreaterThanOrEqual(0);
      expect(fit.right).toBeLessThanOrEqual(fit.w);
      expect(fit.small).toBe(0);
      await page.locator('#btn-resume').click();
    }
    await page.evaluate(() => { window.__zs.startWave(11); window.__zs.step(0.05); });
    await page.locator('#btn-pause').click();
    await expect(page.locator('#pause-next')).toHaveText('Prochaine zone : manche 21'); // lot 3e : la porte 2 suit
    await page.locator('#btn-resume').click();
    await page.evaluate(() => { window.__zs.startWave(21); window.__zs.step(0.05); });
    await page.locator('#btn-pause').click();
    await expect(page.locator('#pause-next')).toHaveText('Prochaine zone : manche 31'); // puis la porte 3
    await page.locator('#btn-resume').click();
    await page.evaluate(() => { window.__zs.startWave(31); window.__zs.step(0.05); });
    await page.locator('#btn-pause').click();
    await expect(page.locator('#pause-next')).toBeHidden();
  });

  test('mouvement réduit : la porte disparaît sans mouvement, l\'annonce n\'a ni secousse ni échelle', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await open(page, '&wave=10');
    await endWave(page, 10);
    const shown = await until(page, `s.splash.kind === 'zone' && s.splash.visible`, 6);
    expect(shown.state.splash).toMatchObject({ opacity: 1, scale: 1, shiftX: 0, rgbSplit: 0, flicker: 0 });
    expect(shown.state.splash.tears).toEqual([]);
    const opened = await until(page, `s.events.some((e) => e.type === 'doorOpen')`, 6);
    expect(opened.state.doorMeshes.ids).not.toContain('porte-1');
    expect(opened.state.zones.doors[0]).toMatchObject({ open: true, sinkProgress: 1 });
  });

  test('la pause fige l\'enfoncement et le compte à rebours (temps de jeu)', async ({ page }) => {
    await open(page, '&wave=10', SIZE, { freeze: false });
    await page.evaluate(() => {
      const zs = window.__zs;
      zs.step(3.1);
      zs.skipWave();
      zs.step(0.05);
    });
    await until(page, `s.events.some((e) => e.type === 'doorOpen')`, 6);
    await page.evaluate(() => window.__zs.step(0.3));
    await page.locator('#btn-pause').click();
    await page.waitForTimeout(150);
    const a = await STATE(page);
    await page.waitForTimeout(800);
    const b = await STATE(page);
    expect(b.paused).toBe(true);
    expect(b.zones.doors[0].sinkProgress).toBe(a.zones.doors[0].sinkProgress);
    expect(b.waves.waitLeft).toBe(a.waves.waitLeft);
    expect(b.time).toBe(a.time);
    expect(a.zones.doors[0].sinkProgress).toBeGreaterThan(0);
    expect(a.zones.doors[0].sinkProgress).toBeLessThan(1);
  });

  test('mort pendant la transition : écran de mort, puis « Rejouer » repart de l\'état initial (porte fermée)', async ({ page }) => {
    await open(page, '&wave=10');
    await endWave(page, 10);
    await until(page, `s.events.some((e) => e.type === 'doorAnnounce')`, 6);
    await page.evaluate(() => { const zs = window.__zs; zs.setChutes(0); zs.downPlayer(); zs.step(0.2); });
    await expect(page.locator('#end-panel')).toBeVisible();
    await expect(page.locator('#end-title')).toHaveText('Tu es mort');
    await page.locator('#btn-replay').click();
    await page.evaluate(() => window.__zs.step(0.1));
    const s = await STATE(page);
    expect(s.dead).toBe(false);
    expect(s.waves.wave).toBe(10); // Rejouer repart de ?wave=10 : la porte est fermée
    expect(s.zones.doors[0]).toMatchObject({ open: false, sinkProgress: 0 });
    expect(s.doorMeshes.ids).toContain('porte-1');
    expect(s.events).toEqual([]);
    expect(s.splash.kind === 'zone').toBe(false);
  });

  test('setDoor ouvre et ferme la porte d\'un coup (collisions, maillage, zones) et ignore une porte inconnue', async ({ page }) => {
    await open(page, '&nospawn=1');
    const r = await page.evaluate(() => {
      const zs = window.__zs;
      const a = zs.setDoor('porte-1', true);
      const open = zs.getState();
      const b = zs.setDoor('porte-1', false);
      const closed = zs.getState();
      return { a, b, unknown: zs.setDoor('nope', true), open: [open.zones.doors[0].open, open.doorMeshes.ids.filter((id) => id === 'porte-1'), open.zones.activeWindows.filter((id) => id.startsWith('F')).length], closed: [closed.zones.doors[0].open, closed.doorMeshes.ids.filter((id) => id === 'porte-1'), closed.zones.activeWindows.filter((id) => id.startsWith('F')).length] };
    });
    expect(r.a).toBe(true);
    expect(r.b).toBe(true);
    expect(r.unknown).toBe(false);
    expect(r.open).toEqual([true, [], 8]);
    expect(r.closed).toEqual([false, ['porte-1'], 5]);
  });
});

test.describe('zones : mobilier de complément, budget, interface', () => {
  const added = world.obstacles.filter((o) => o.provisional);

  test('les pièces ajoutées sont présentes, bloquent le joueur, les balles et le laser', async ({ page }) => {
    await open(page, '&nospawn=1');
    const s = await STATE(page);
    expect(added.length).toBeGreaterThanOrEqual(8);
    for (const o of added) expect(s.obstacles.some((q) => q.id === o.id), o.id).toBe(true);
    const target = added.find((o) => o.id === 'P8');
    const r = await page.evaluate(([o]) => {
      const zs = window.__zs;
      // À l'est de la pièce, le joueur marche vers l'ouest, visée vers l'ouest.
      zs.setPlayer(o.x + o.w + 110, o.y + o.h / 2);
      zs.setInput({ move: { x: -1, y: 0 }, aim: { angle: Math.PI } });
      zs.step(0.1);
      const laser = zs.getState().laser;
      zs.step(2);
      const p = zs.getState().player;
      zs.setInput({});
      return { x: p.x, right: o.x + o.w, laser };
    }, [target]);
    expect(r.x).toBeGreaterThanOrEqual(r.right + 18 - 1);
    expect(r.laser.stoppedBy).toBe(target.id);
  });

  test('aucune pièce ajoutée ne bloque une fenêtre, un point de réparation ni le passage de la porte ouverte', async ({ page }) => {
    await open(page, '&nospawn=1');
    const s = await STATE(page);
    const door = { x: 1470, y: 1965, w: 40, h: 85 };
    const gap = (a, b) => Math.hypot(Math.max(b.x - (a.x + a.w), 0, a.x - (b.x + b.w)), Math.max(b.y - (a.y + a.h), 0, a.y - (b.y + b.h)));
    for (const o of added) {
      expect(gap(o, door), `${o.id} / porte`).toBeGreaterThanOrEqual(100);
      for (const w of s.windows.filter((q) => q.floor !== 'etage')) expect(Math.hypot(Math.max(o.x - w.x, 0, w.x - (o.x + o.w)), Math.max(o.y - w.y, 0, w.y - (o.y + o.h))), `${o.id} / ${w.id}`).toBeGreaterThan(75);
    }
  });

  test('budget : 10 zombies variés, planches, ombres, cône, porte fermée : au plus la référence + 2 appels et 15 000 triangles (meubles modélisés : +300 dépassé à la demande du propriétaire)', async ({ page }, testInfo) => {
    await open(page, '&shadows=1&nospawn=1');
    // spot : 'ref' = la mise en place du test de budget du lot 3b (près de F1, la porte hors du champ) ; 'porte' = le joueur devant la porte, qui est à l'écran.
    const measure = (spot) => page.evaluate((where) => {
      const zs = window.__zs;
      const first = zs.getState().windowPositions[0];
      if (where === 'ref') zs.setPlayer(first.x, first.y + 110);
      else zs.setPlayer(1650, 2007);
      zs.setInput({ aim: { angle: Math.PI } });
      const p = zs.getState().player;
      const T = ['marcheur', 'petit', 'voute', 'grand'];
      const G = ['lent', 'marche', 'rampe', 'course'];
      if (zs.getState().enemies.length === 0) for (let i = 0; i < 10; i += 1) zs.spawnEnemy(p.x + 70 + (i % 5) * 45, p.y + 20 + Math.floor(i / 5) * 90 + (i % 2) * 15, { type: T[i % 4], gait: G[(i + Math.floor(i / 4)) % 4], wave: 10 });
      zs.step(0.05);
      zs.sampleScreen(0, 0, 8, 8);
      return zs.getState().render;
    }, spot);
    const ref = await measure('ref');
    testInfo.annotations.push({ type: 'rendu', description: `porte fermée : ${ref.calls} appels, ${ref.triangles} triangles (référence ${REF.calls} et ${REF.triangles})` });
    console.log(`BUDGET lot 3c, porte fermée (mise en place du lot 3b) : ${ref.calls} appels, ${ref.triangles} triangles (référence main : ${REF.calls} et ${REF.triangles})`);
    expect(ref.calls).toBeLessThanOrEqual(REF.calls + 2);
    expect(ref.triangles).toBeLessThanOrEqual(15000);
    expect(ref.calls).toBeLessThanOrEqual(300);
    await page.evaluate(() => window.__zs.killAll());
    const closed = await measure('porte');
    console.log(`BUDGET lot 3c, porte fermée à l'écran : ${closed.calls} appels, ${closed.triangles} triangles`);
    expect(closed.calls).toBeLessThanOrEqual(REF.calls + 4); // lot 3e : au plus 4 appels de plus que la référence
    expect(closed.triangles).toBeLessThanOrEqual(15000);
    await page.evaluate(() => window.__zs.setDoor('porte-1', true));
    const opened = await measure('porte');
    console.log(`BUDGET lot 3c, porte ouverte à l'écran : ${opened.calls} appels, ${opened.triangles} triangles`);
    expect(opened.calls).toBeLessThanOrEqual(closed.calls);
    expect(opened.triangles).toBeLessThan(closed.triangles);
  });

  test('après l\'ouverture, la géométrie de la porte est libérée (nombre de géométries non supérieur à avant)', async ({ page }) => {
    await open(page, '&wave=10');
    const geometries = async () => {
      await page.evaluate(() => window.__zs.sampleScreen(0, 0, 4, 4));
      return (await STATE(page)).render.geometries;
    };
    await page.evaluate(() => { window.__zs.setPlayer(1650, 2007); window.__zs.step(0.05); }); // la porte est à l'écran : sa géométrie est envoyée au GPU
    const before = await geometries();
    // La manche est terminée pendant le compte à rebours : aucun zombie n'apparaît, donc aucune géométrie de personnage n'est créée entre-temps.
    await page.evaluate(() => { const zs = window.__zs; zs.skipWave(); zs.step(0.05); });
    const done = await until(page, `s.zones.doors[0].open && s.zones.doors[0].sinkProgress >= 1`, 12);
    expect(done).not.toBeNull();
    const after = await geometries();
    expect(after).toBeLessThanOrEqual(before - 1);
    expect((await STATE(page)).doorMeshes.ids).not.toContain('porte-1');
    for (let i = 0; i < 3; i += 1) {
      await page.evaluate(() => { window.__zs.setDoor('porte-1', false); window.__zs.setDoor('porte-1', true); });
      expect(await geometries()).toBeLessThanOrEqual(after);
    }
  });

  test('interface : HUD E2-2 inchangé, aucun nouveau bloc, ordre des blocs, cibles de 44 px', async ({ page }) => {
    await open(page, '&nospawn=1');
    const s = await STATE(page);
    expect(s.hud.width).toBeLessThanOrEqual(300);
    expect(s.hud.height).toBeLessThanOrEqual(96);
    const blocks = await page.evaluate(() => [...document.querySelectorAll('#game-root [data-block]')].map((el) => el.dataset.block));
    expect(blocks).toEqual(['E2-2', 'E2-8', 'E2-10', 'E2-5', 'E2-3', 'E2-4']);
    expect(await page.locator('[data-block="E2-9"], [data-block="E2-11"]').count()).toBe(0);
    await expect(page.locator('#hud')).not.toContainText(/zone|Zone|niveau/);
    const small = await page.evaluate(() => [...document.querySelectorAll('button, [role="button"]')].filter((b) => !b.hidden && b.offsetParent !== null).filter((b) => b.getBoundingClientRect().height < 44).map((b) => b.id));
    expect(small).toEqual([]);
  });

  test('axe sans violation : annonce « Nouvelle zone » visible, panneau de pause, écran « Monde terminé »', async ({ page }) => {
    await open(page, '&wave=10', BIG);
    await endWave(page, 10);
    await until(page, `s.splash.kind === 'zone' && s.splash.step === 'tenue'`, 6);
    let results = await new AxeBuilder({ page }).analyze();
    expect(results.violations.map((v) => v.id)).toEqual([]);
    await page.locator('#btn-pause').click();
    results = await new AxeBuilder({ page }).analyze();
    expect(results.violations.map((v) => v.id)).toEqual([]);
    await page.locator('#btn-resume').click();
    await page.evaluate(() => window.__zs.startWave(40));
    await endWave(page, 40);
    await expect(page.locator('#end-panel')).toBeVisible();
    results = await new AxeBuilder({ page }).analyze();
    expect(results.violations.map((v) => v.id)).toEqual([]);
  });

  test('aucun son nouveau, aucun appel réseau externe, aucun stockage, console propre pendant toute la séquence', async ({ page }) => {
    const problems = [];
    const external = [];
    page.on('console', (m) => ['error', 'warning'].includes(m.type()) && !BROWSER_NOISE.test(m.text()) && problems.push(m.text()));
    page.on('pageerror', (e) => problems.push(e.message));
    page.on('request', (r) => { if (!r.url().startsWith('http://localhost:4173')) external.push(r.url()); });
    await open(page, '&wave=10');
    await endWave(page, 10);
    await page.evaluate(() => window.__zs.step(14));
    const s = await STATE(page);
    const names = new Set(s.audio.log.map((e) => e.sound));
    for (const n of names) expect(n, n).not.toMatch(/porte|zone|door/i);
    expect(s.events.map((e) => e.type)).toEqual(['doorAnnounce', 'doorOpen']);
    expect(external).toEqual([]);
    expect(await page.evaluate(() => [localStorage.length, sessionStorage.length, document.cookie])).toEqual([0, 0, '']);
    expect(problems).toEqual([]);
  });
});
