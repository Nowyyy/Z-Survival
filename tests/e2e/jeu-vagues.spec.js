import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { readFileSync } from 'node:fs';
import { waveSpec, GAITS, TYPES } from '../../js/core/waves.js';
import { waitReady } from './helpers.js';

// Lot 2 : vagues numérotées, allures et types de zombies. Tout passe par step() (temps de jeu), killAll() et les hooks : aucune vague n'est
// attendue en temps réel. Petite fenêtre (667×375) ; les tests se désactivent seuls si WebGL manque.
const SIZE = { width: 667, height: 375 };
const load = (name) => JSON.parse(readFileSync(`data/game/${name}.json`, 'utf8'));
const params = load('waves');
const enemies = load('enemies');
const gaits = load('gaits');
const variants = load('zombie-variants').zombie.variants.map((v) => v.id);
const audioCfg = load('audio');
const URL = (extra = '') => `/jeu.html?test=1&seed=1${extra}`;
const state = (page) => page.evaluate(() => window.__zs.getState());
const step = (page, seconds) => page.evaluate((s) => window.__zs.step(s), seconds);
const BROWSER_NOISE = /GL Driver Message|ReadPixels|GPU stall/;

// Par défaut, la boucle de rendu est arrêtée une fois la partie prête (requestAnimationFrame neutralisé) : le temps de jeu n'avance alors que
// par step(), ce qui rend les durées exactes (la vague redémarre à son compte à rebours plein). { live: true } garde la boucle réelle
// (pause, son : le chargement des sons de fond a besoin des images).
async function open(page, extra = '', size = SIZE, { live = false } = {}) {
  await page.setViewportSize(size);
  await page.goto(URL(extra));
  await waitReady(page);
  if (live) return;
  await page.evaluate(() => { window.requestAnimationFrame = () => 0; });
  await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 150))); // laisse passer l'image déjà demandée
  await page.evaluate(() => {
    const w = window.__zs.getState().waves;
    if (w.active) window.__zs.startWave(w.wave);
    window.__zs.step(0.05);
  });
}

// Joue la vague en cours en tuant chaque zombie dès qu'il apparaît ; renvoie les entrées du journal des apparitions de cette vague.
function playWave(page, seconds = 400) {
  return page.evaluate((limit) => {
    const zs = window.__zs;
    const first = zs.getState().spawnLog.length;
    const wave = zs.getState().waves.wave;
    for (let t = 0; t < limit; t += 0.5) {
      zs.step(0.5);
      zs.killAll();
      const w = zs.getState().waves;
      if (w.wave !== wave) break;
    }
    return { log: zs.getState().spawnLog.slice(first), wave: zs.getState().waves };
  }, seconds);
}

test.describe('vagues du lot 2', () => {
  test.skip(({ isMobile }) => isMobile, 'bureau (la fenêtre est réglée par chaque test)');

  test('la vague 1 démarre après 3 s de temps de jeu, avec 5 marcheurs lents ou normaux, hors de la vue, par les fenêtres', async ({ page }) => {
    await open(page);
    let s = await state(page);
    expect(s.waves).toMatchObject({ active: true, phase: 'attente', wave: 1, total: 5, toSpawn: 5, alive: 0 });
    expect(s.waves.waitLeft).toBeGreaterThan(2.8);
    await step(page, 2.8);
    s = await state(page);
    expect(s.waves.phase).toBe('attente');
    expect(s.enemies).toEqual([]);
    await step(page, 0.3);
    s = await state(page);
    expect(s.waves.phase).toBe('apparition');
    expect(s.enemies).toHaveLength(1);
    await page.evaluate(() => window.__zs.setPlayer(1800, 1000));
    // Le joueur se tient derrière la fenêtre nord : on observe l'entrée des zombies, en les empêchant de nuire.
    const seen = await page.evaluate(() => {
      const zs = window.__zs;
      const types = new Set();
      const entries = [];
      for (let i = 0; i < 400; i += 1) {
        zs.step(0.1);
        const st = zs.getState();
        for (const e of st.enemies) {
          types.add(`${e.type}/${e.gait}`);
          if (e.entered) entries.push({ id: e.id, from: e.from, entered: e.entered });
        }
        zs.setInput({ aim: { angle: 0 } });
        if (st.waves.toSpawn === 0 && entries.length > 0) break;
      }
      return { types: [...types], entries, log: zs.getState().spawnLog, points: zs.getState().spawnPoints };
    });
    expect(seen.log).toHaveLength(5);
    for (const l of seen.log) {
      expect(l.hidden).toBe(true);
      expect(l.type).toBe('marcheur');
      expect(['lent', 'marche']).toContain(l.gait);
      expect(seen.points.map((p) => p.id)).toContain(l.id);
    }
    expect(seen.entries.length).toBeGreaterThan(0);
    for (const e of seen.entries) expect(e.entered).toBe(seen.points.find((p) => p.id === e.from).fenetre);
  });

  test('killAll() termine la vague : « Vague 1 terminée », vie remise au maximum, vague 2 après 8 s', async ({ page }) => {
    await open(page);
    await page.evaluate(() => window.__zs.setWaveParams({ total: { base: 1, linear: 0, quadratic: 0 } }));
    await step(page, 3.1);
    expect((await state(page)).waves.toSpawn).toBe(0);
    await step(page, 0.7); // lot 2c : l'animation de début (3,8 s) doit être finie, sinon elle l'emporte sur celle de fin
    // Un zombie de test au contact fait perdre de la vie ; la vague a toujours son zombie du directeur.
    const p = (await state(page)).player;
    await page.evaluate(([x, y]) => window.__zs.spawnEnemy(x, y), [p.x + 30, p.y]);
    await step(page, 0.3);
    const hurt = (await state(page)).player.health;
    expect(hurt).toBeLessThan(100);
    expect(await page.evaluate(() => window.__zs.killAll())).toBeGreaterThanOrEqual(2);
    await step(page, 0.1);
    const s = await state(page);
    expect(s.player.health).toBe(100);
    expect(s.kills).toBe(0);
    expect(s.waves).toMatchObject({ phase: 'attente', wave: 2, alive: 0 });
    expect(s.splash).toMatchObject({ visible: true, kind: 'fin', wave: 1 }); // lot 2c : l'annonce est l'animation centrale (avant : waves.announce)
    await expect(page.locator('#wave-announce')).toHaveClass(/is-visible/);
    await expect(page.locator('#wave-announce-title')).toHaveText('Vague 1 terminée');
    await expect(page.locator('#hud-live')).toHaveText('Vague 1 terminée.');
    await step(page, 7.7);
    expect((await state(page)).waves.phase).toBe('attente');
    await step(page, 0.4);
    const next = (await state(page)).waves;
    expect(next.wave).toBe(2);
    expect(['apparition', 'combat']).toContain(next.phase); // la vague 2 n'a qu'un zombie (setWaveParams) : tout est apparu aussitôt
    expect((await state(page)).spawnLog).toHaveLength(2);
  });

  test('jamais plus de maxConcurrent zombies à la fois, vérifié à chaque pas pendant une vague de 20', async ({ page }) => {
    await open(page);
    const r = await page.evaluate(() => {
      const zs = window.__zs;
      zs.setWaveParams({ total: { base: 20, linear: 0, quadratic: 0 }, spawnInterval: { base: 0.9, factor: 1, min: 0.5 } });
      zs.setPlayer(1800, 1000);
      let max = 0;
      let limit = 0;
      for (let i = 0; i < 260; i += 1) {
        zs.step(0.05);
        const st = zs.getState();
        max = Math.max(max, st.enemies.length);
        limit = st.waves.maxConcurrent;
        if (st.enemies.length > st.waves.maxConcurrent) return { over: st.enemies.length, limit };
        if (st.dead) break;
      }
      return { max, limit, toSpawn: zs.getState().waves.toSpawn, total: zs.getState().waves.total };
    });
    expect(r.over).toBeUndefined();
    expect(r.total).toBe(20);
    expect(r.max).toBe(r.limit);
    expect(r.toSpawn).toBeGreaterThan(0);
  });

  const MIX = [
    { wave: 1, has: [], hasNot: ['petit', 'voute', 'grand'], gaits: { not: ['rampe', 'course'] } },
    { wave: 3, has: ['petit'], hasNot: ['voute', 'grand'], gaits: { not: ['course'] } },
    { wave: 4, has: ['petit'], hasNot: ['voute', 'grand'], gaits: { has: ['rampe'], not: ['course'] } },
    { wave: 7, has: ['petit', 'voute', 'grand'], hasNot: [], gaits: { has: ['rampe'] } },
    { wave: 8, has: ['petit', 'voute', 'grand'], hasNot: [], gaits: { has: ['rampe', 'course'] } },
  ];
  for (const m of MIX) {
    test(`?wave=${m.wave} : types et allures de la vague, multiplicateurs de waves.json`, async ({ page }) => {
      await open(page, `&wave=${m.wave}&nospawn=0`);
      const spec = waveSpec(m.wave, params);
      const start = await state(page);
      expect(start.waves).toMatchObject({ wave: m.wave, level: spec.level, total: spec.total, maxConcurrent: spec.maxConcurrent, hpMul: spec.hpMul, speedMul: spec.speedMul, damageMul: spec.damageMul });
      const { log } = await playWave(page);
      expect(log).toHaveLength(spec.total);
      const types = new Set(log.map((l) => l.type));
      const used = new Set(log.map((l) => l.gait));
      for (const t of m.has) expect(types.has(t), `${t} présent`).toBe(true);
      for (const t of m.hasNot) expect(types.has(t), `${t} absent`).toBe(false);
      for (const g of m.gaits.has ?? []) expect(used.has(g), `${g} présent`).toBe(true);
      for (const g of m.gaits.not ?? []) expect(used.has(g), `${g} absent`).toBe(false);
      for (const t of TYPES) expect(log.filter((l) => l.type === t).length).toBe(spec.composition[t]);
      for (const g of GAITS) expect(log.filter((l) => l.gait === g).length).toBe(spec.gaitCounts[g]);
    });
  }

  test('?wave=30 : vie au plafond ×30, vitesse et dégâts de la vague, aucun zombie à plus de 190', async ({ page }) => {
    await open(page, '&wave=30&nospawn=0');
    const spec = waveSpec(30, params);
    expect((await state(page)).waves).toMatchObject({ wave: 30, hpMul: 30, speedMul: spec.speedMul, damageMul: 3 });
    await step(page, 3.2);
    const made = await page.evaluate(() => {
      const zs = window.__zs;
      const p = zs.getState().player;
      for (const type of ['marcheur', 'petit', 'voute', 'grand']) for (const gait of ['lent', 'marche', 'rampe', 'course']) zs.spawnEnemy(p.x + 700, p.y + 600, { type, gait });
      return zs.getState().enemies;
    });
    expect(made).toHaveLength(17);
    for (const e of made) {
      expect(e.speed).toBeLessThanOrEqual(190);
      expect(e.speed).toBeLessThan(220);
      expect(e.hp).toBeCloseTo(enemies.zombie.health * 30 * enemies.variants[e.type].hpMul, 6);
      expect(e.damage).toBeCloseTo(enemies.zombie.contactDamage * 3 * enemies.variants[e.type].damageMul, 6);
    }
  });

  test('?wave=40 : aucun zombie ne dépasse 190, même un petit en course', async ({ page }) => {
    await open(page, '&wave=40&nospawn=0');
    const fastest = await page.evaluate(() => {
      const zs = window.__zs;
      const p = zs.getState().player;
      let max = 0;
      for (const type of ['marcheur', 'petit', 'voute', 'grand']) for (const gait of ['lent', 'marche', 'rampe', 'course']) {
        zs.spawnEnemy(p.x + 900, p.y + 600, { type, gait });
      }
      for (const e of zs.getState().enemies) max = Math.max(max, e.speed);
      return max;
    });
    expect(fastest).toBeLessThanOrEqual(190);
    expect(fastest).toBe(190);
  });

  test('en terrain dégagé, chaque allure avance à sa vitesse à 5 % près (mesuré avec step)', async ({ page }) => {
    await open(page, '&empty=1&nospawn=1');
    const r = await page.evaluate(() => {
      const zs = window.__zs;
      zs.setPlayer(800, 450);
      zs.setInput({ aim: { angle: -Math.PI / 2 } });
      const spots = { lent: [120, 120], marche: [1480, 120], rampe: [120, 780], course: [1480, 780] };
      const ids = {};
      for (const [gait, [x, y]] of Object.entries(spots)) ids[gait] = zs.spawnEnemy(x, y, { type: 'marcheur', gait, wave: 1 });
      const before = Object.fromEntries(zs.getState().enemies.map((e) => [e.gait, { x: e.x, y: e.y }]));
      zs.step(1);
      return zs.getState().enemies.map((e) => ({ gait: e.gait, speed: e.speed, moved: Math.hypot(e.x - before[e.gait].x, e.y - before[e.gait].y) }));
    });
    expect(r).toHaveLength(4);
    for (const e of r) {
      expect(e.speed).toBeCloseTo(gaits.gaits[e.gait].speed, 6);
      expect(Math.abs(e.moved - e.speed) / e.speed, e.gait).toBeLessThan(0.05);
    }
  });

  test('la rampe baisse le bassin et couche le tronc ; la phase de marche avance avec distance / foulée', async ({ page }) => {
    await open(page, '&empty=1&nospawn=1');
    const r = await page.evaluate(() => {
      const zs = window.__zs;
      zs.setPlayer(800, 450);
      zs.setInput({ aim: { angle: -Math.PI / 2 } });
      for (const [gait, x, y] of [['marche', 100, 120], ['rampe', 100, 780], ['lent', 1500, 120], ['course', 1500, 780]]) zs.spawnEnemy(x, y, { type: 'marcheur', gait, wave: 1 });
      zs.step(0.05);
      const a = Object.fromEntries(zs.getState().enemies.map((e) => [e.gait, e]));
      zs.step(1);
      const b = Object.fromEntries(zs.getState().enemies.map((e) => [e.gait, e]));
      return { a, b };
    });
    expect(r.b.rampe.pose.pelvisY).toBeLessThan(r.b.marche.pose.pelvisY - 10);
    expect(r.b.rampe.pose.pelvisHeight).toBeLessThan(r.b.marche.pose.pelvisHeight);
    expect(r.b.rampe.pose.torsoPitch).toBeGreaterThan(1);
    expect(r.b.marche.pose.torsoPitch).toBe(0);
    for (const gait of GAITS) {
      const distance = Math.hypot(r.b[gait].x - r.a[gait].x, r.b[gait].y - r.a[gait].y);
      const phase = r.b[gait].phase - r.a[gait].phase;
      expect(phase, gait).toBeGreaterThan(0);
      expect(phase / distance, gait).toBeCloseTo((2 * Math.PI) / gaits.gaits[gait].stride, 2);
    }
  });

  test('le rendu utilise la variante visuelle du type ; sans type, celle de variantFor', async ({ page }) => {
    await open(page, '&empty=1&nospawn=1');
    const list = await page.evaluate(() => {
      const zs = window.__zs;
      zs.setPlayer(800, 450);
      zs.setInput({ aim: { angle: -Math.PI / 2 } });
      for (const type of ['marcheur', 'petit', 'voute', 'grand']) zs.spawnEnemy(100, 100, { type, gait: 'lent' });
      zs.spawnEnemy(1500, 800);
      return zs.getState().enemies.map((e) => ({ type: e.type, variant: e.variant, gait: e.gait }));
    });
    for (const e of list.slice(0, 4)) expect(variants[e.variant], e.type).toBe(e.type);
    expect(list[4]).toMatchObject({ type: 'marcheur', gait: 'marche' });
    expect(variants).toContain(variants[list[4].variant]);
  });

  test('la hauteur de la voix suit le type (journal des sons)', async ({ page }) => {
    await open(page, '&empty=1&nospawn=1', SIZE, { live: true });
    await page.mouse.click(40, 40);
    await expect.poll(async () => (await state(page)).audio.unlocked).toBe(true);
    await expect.poll(async () => (await state(page)).audio.ready, { timeout: 30_000 }).toBe(true);
    const settle = () => expect.poll(async () => (await state(page)).audio.activeVoices, { timeout: 20_000 }).toBe(0);
    for (const type of ['petit', 'grand']) {
      await settle();
      const rates = await page.evaluate(([t]) => {
        const zs = window.__zs;
        zs.killAll();
        zs.setPlayer(800, 450);
        zs.setInput({ aim: { angle: -Math.PI / 2 } });
        const from = zs.getState().time;
        zs.spawnEnemy(830, 450, { type: t, gait: 'marche', wave: 1 });
        zs.step(1.5);
        const cries = zs.getState().audio.log.filter((e) => e.sound === 'zombie-attaque' && e.gameTime >= from).map((e) => e.rate);
        zs.killAll();
        return cries;
      }, [type]);
      expect(rates.length, type).toBeGreaterThan(0);
      expect(rates[0]).toBeCloseTo(audioCfg.zombieRate[type], 6);
    }
  });

  test('aucun pas de zombie pour l\'allure rampe ; la marche, elle, en fait', async ({ page }) => {
    await open(page, '&empty=1&nospawn=1', SIZE, { live: true });
    await page.mouse.click(40, 40);
    await expect.poll(async () => (await state(page)).audio.unlocked).toBe(true);
    await expect.poll(async () => (await state(page)).audio.ready, { timeout: 30_000 }).toBe(true);
    // Tout se passe dans un seul appel (zombies posés, 4 s simulées, lecture du journal, zombies retirés) : la boucle réelle ne peut pas
    // laisser le joueur mourir entre deux appels.
    const count = (gait) => page.evaluate((g) => {
      const zs = window.__zs;
      zs.killAll();
      zs.setPlayer(800, 450);
      zs.setInput({ aim: { angle: -Math.PI / 2 } });
      const from = zs.getState().time;
      for (let i = 0; i < 3; i += 1) zs.spawnEnemy(1100 + i * 30, 450 + i * 30, { type: 'marcheur', gait: g, wave: 1 });
      zs.step(4);
      const n = zs.getState().audio.log.filter((e) => e.sound === 'pas-zombie' && e.gameTime >= from).length;
      zs.killAll();
      return n;
    }, gait);
    // Les voix réelles encore en cours saturent la limite de 16 sources (les pas, moins prioritaires, seraient refusés) : on attend qu'elles finissent.
    const settle = () => expect.poll(async () => (await state(page)).audio.activeVoices, { timeout: 20_000 }).toBe(0);
    await settle();
    expect(await count('marche')).toBeGreaterThan(0);
    await settle();
    expect(await count('rampe')).toBe(0);
  });

  test('la pause fige le compte à rebours et les apparitions ; la reprise les relance', async ({ page }) => {
    await open(page, '', SIZE, { live: true });
    await page.evaluate(() => window.__zs.setWaveParams({ total: { base: 50, linear: 0, quadratic: 0 }, maxConcurrent: { base: 10, every: 100, cap: 10 }, spawnInterval: { base: 0.5, factor: 1, min: 0.5 } }));
    const wait0 = (await state(page)).waves.waitLeft;
    await page.getByRole('button', { name: 'Pause' }).click();
    await expect(page.locator('#pause-panel')).toBeVisible();
    const frozen = (await state(page)).waves.waitLeft;
    await page.waitForTimeout(600);
    expect((await state(page)).waves.waitLeft).toBe(frozen);
    expect(frozen).toBeLessThanOrEqual(wait0);
    await page.getByRole('button', { name: 'Reprendre' }).click();
    await expect.poll(async () => (await state(page)).waves.waitLeft).toBeLessThan(frozen);
    await step(page, 3.2);
    await page.getByRole('button', { name: 'Pause' }).click();
    const spawned = (await state(page)).waves.toSpawn;
    await page.waitForTimeout(600);
    expect((await state(page)).waves.toSpawn).toBe(spawned);
    await page.getByRole('button', { name: 'Reprendre' }).click();
    await expect.poll(async () => (await state(page)).waves.toSpawn, { timeout: 15_000 }).toBeLessThan(spawned);
  });

  test('la mort affiche « Vague atteinte : N » ; Rejouer repart à la vague 1', async ({ page }) => {
    await open(page);
    await page.evaluate(() => window.__zs.setChutes(0)); // lot 3 : sans chute restante, la vie à 0 est la mort (comme avant)
    await page.evaluate(() => window.__zs.startWave(4));
    await step(page, 3.2);
    expect((await state(page)).waves.wave).toBe(4);
    await page.evaluate(() => {
      const zs = window.__zs;
      const p = zs.getState().player;
      for (let i = 0; i < 14; i += 1) zs.spawnEnemy(p.x + 25 + (i % 5) * 6, p.y + (i - 7) * 4);
      zs.setInput({ aim: { angle: Math.PI } });
      zs.step(3);
    });
    expect((await state(page)).dead).toBe(true);
    await expect(page.locator('#end-panel')).toBeVisible();
    await expect(page.locator('#end-wave')).toHaveText('Vague atteinte : 4');
    await page.getByRole('button', { name: 'Rejouer' }).click();
    await expect(page.locator('#end-panel')).toBeHidden();
    const s = await state(page);
    expect(s.waves).toMatchObject({ wave: 1, phase: 'attente', alive: 0, toSpawn: 5 });
    expect(s.dead).toBe(false);
  });

  test('avec ?wave=N, Rejouer repart à la vague N', async ({ page }) => {
    await open(page, '&wave=3');
    await page.evaluate(() => window.__zs.setChutes(0)); // lot 3 : sans chute restante, la vie à 0 est la mort (comme avant)
    await step(page, 3.2);
    await page.evaluate(() => {
      const zs = window.__zs;
      const p = zs.getState().player;
      for (let i = 0; i < 14; i += 1) zs.spawnEnemy(p.x + 25 + (i % 5) * 6, p.y + (i - 7) * 4);
      zs.step(3);
    });
    await expect(page.locator('#end-wave')).toHaveText('Vague atteinte : 3');
    await page.getByRole('button', { name: 'Rejouer' }).click();
    expect((await state(page)).waves.wave).toBe(3);
  });

  test('?nospawn=1 : aucun zombie, aucun état de vague actif, aucun texte de vague', async ({ page }) => {
    await open(page, '&nospawn=1');
    await step(page, 30);
    const s = await state(page);
    expect(s.enemies).toEqual([]);
    expect(s.waves).toMatchObject({ active: false, phase: 'inactif', wave: 0, remaining: 0 });
    expect(s.splash).toMatchObject({ visible: false, kind: null });
    expect(s.spawnLog).toEqual([]);
    for (const id of ['hud-wave', 'hud-remaining', 'hud-next']) await expect(page.locator(`#${id}`)).toBeHidden();
    await page.evaluate(() => window.__zs.startWave(5));
    expect((await state(page)).waves.active).toBe(false);
  });

  test('?wave=N invalide est ignoré', async ({ page }) => {
    for (const bad of ['0', '201', 'abc', '-3', '2.5']) {
      await open(page, `&wave=${bad}`);
      expect((await state(page)).waves.wave, bad).toBe(1);
    }
    await open(page, '&wave=200');
    expect((await state(page)).waves.wave).toBe(200);
  });

  test('HUD : « Prochaine vague dans N s », puis « Vague N » et « Restants », avec 16 px de marge', async ({ page }) => {
    await open(page);
    await expect(page.locator('#hud-next')).toHaveText('Prochaine vague dans 3 s');
    await expect(page.locator('#hud-wave')).toHaveText('Vague 1'); // permanent, même pendant l'attente
    await expect(page.locator('#hud-remaining')).toBeHidden();
    await expect(page.locator('#hud-wave')).toHaveCSS('font-family', /Rubik Wet Paint/);
    await step(page, 3.2);
    await expect(page.locator('#hud-wave')).toHaveText('Vague 1');
    await expect(page.locator('#hud-remaining')).toHaveText('Restants : 5 / 5');
    await expect(page.locator('#hud-next')).toBeHidden();
    const box = await page.locator('#hud').boundingBox();
    expect(box.x).toBeGreaterThanOrEqual(15.5);
    expect(box.y).toBeGreaterThanOrEqual(15.5);
    await page.evaluate(() => window.__zs.killAll());
    await step(page, 0.05);
    await expect(page.locator('#hud-remaining')).toHaveText('Restants : 4 / 5');
  });

  test('#hud-live annonce la vague, jamais le compte à rebours ni les restants', async ({ page }) => {
    await open(page);
    const seen = [];
    await page.exposeFunction('noteLive', (t) => seen.push(t));
    await page.evaluate(() => new MutationObserver(() => window.noteLive(document.getElementById('hud-live').textContent)).observe(document.getElementById('hud-live'), { childList: true, characterData: true, subtree: true }));
    await step(page, 3.2);
    await expect(page.locator('#hud-live')).toHaveText('Vague 1.');
    await page.evaluate(() => { window.__zs.setWaveParams({ total: { base: 1, linear: 0, quadratic: 0 } }); window.__zs.killAll(); window.__zs.step(0.3); });
    await expect(page.locator('#hud-live')).toHaveText('Vague 1 terminée.');
    await step(page, 5);
    for (const t of seen) expect(t).not.toMatch(/Prochaine|Restants|\ds\b/);
    expect(seen.some((t) => /Vague 1/.test(t))).toBe(true);
  });

  test('annonce E2-8 : « Vague N », « Vague renforcée » aux multiples de 5, visible 3,8 s (animation centrale du lot 2c)', async ({ page }) => {
    await open(page);
    await step(page, 3.1);
    await expect(page.locator('#wave-announce')).toHaveClass(/is-visible/);
    await expect(page.locator('#wave-announce-title')).toHaveText('Vague 1');
    await expect(page.locator('#wave-announce-sub')).toBeHidden();
    await step(page, 0.8); // avant : 2,6 s, annonce de 2,5 s ; maintenant 3,8 s au total (début 3,0 s avant les apparitions)
    expect((await state(page)).splash.visible).toBe(false);
    await expect(page.locator('#wave-announce')).not.toHaveClass(/is-visible/);
    await page.evaluate(() => window.__zs.startWave(5));
    await step(page, 3.1);
    await expect(page.locator('#wave-announce-title')).toHaveText('Vague 5');
    await expect(page.locator('#wave-announce-sub')).toHaveText('Vague renforcée');
    await expect(page.locator('#wave-announce')).toHaveAttribute('data-block', 'E2-8');
  });

  test('l\'annonce ne prend pas le focus, ne bloque pas les touches et n\'a pas de cible tactile', async ({ page }) => {
    await open(page);
    await step(page, 3.1);
    const info = await page.evaluate(() => {
      const el = document.getElementById('wave-announce');
      return { active: document.activeElement?.id ?? document.activeElement?.tagName, focusable: el.tabIndex, pointer: getComputedStyle(el).pointerEvents, buttons: el.querySelectorAll('button, a, input').length };
    });
    expect(info.pointer).toBe('none');
    expect(info.focusable).toBe(-1);
    expect(info.buttons).toBe(0);
    expect(info.active).not.toBe('wave-announce');
    await page.keyboard.down('KeyD');
    await step(page, 0.3);
    await page.keyboard.up('KeyD');
    expect((await state(page)).player.x).toBeGreaterThan(800);
    const pause = await page.locator('#btn-pause').boundingBox();
    expect(pause.height).toBeGreaterThanOrEqual(43.5);
    expect(pause.width).toBeGreaterThanOrEqual(43.5);
  });

  test('sous prefers-reduced-motion, l\'annonce n\'a aucune animation', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await open(page);
    await step(page, 3.1);
    await expect(page.locator('#wave-announce')).toHaveClass(/is-visible/);
    // Le mouvement réduit coupe la transition (base.css ramène aussi les durées à presque rien) : au plus 1 ms, aucune animation.
    const style = await page.locator('#wave-announce').evaluate((el) => ({ duration: parseFloat(getComputedStyle(el).transitionDuration), animation: getComputedStyle(el).animationName }));
    expect(style.duration).toBeLessThanOrEqual(0.001);
    expect(style.animation).toBe('none');
  });

  for (const size of [SIZE, { width: 1440, height: 900 }]) {
    test(`axe : aucune violation avec HUD de vague et annonce (${size.width}×${size.height})`, async ({ page }) => {
      await open(page, size.width > 1000 ? '&dpr=1' : '', size);
      await step(page, 3.1);
      await expect(page.locator('#wave-announce')).toHaveClass(/is-visible/);
      const results = await new AxeBuilder({ page }).analyze();
      expect(results.violations).toEqual([]);
    });
  }

  test('budget de dessin : 10 zombies des quatre types et des quatre allures, ombres actives', async ({ page }, testInfo) => {
    await open(page, '&nospawn=1&shadows=1');
    const r = await page.evaluate(() => {
      const zs = window.__zs;
      const p = zs.getState().player;
      zs.setInput({ aim: { angle: Math.PI } });
      const T = ['marcheur', 'petit', 'voute', 'grand'];
      const G = ['lent', 'marche', 'rampe', 'course'];
      for (let i = 0; i < 10; i += 1) zs.spawnEnemy(p.x + 70 + (i % 5) * 45, p.y - 90 + Math.floor(i / 5) * 90 + (i % 2) * 15, { type: T[i % 4], gait: G[(i + Math.floor(i / 4)) % 4], wave: 10 });
      zs.step(0.05);
      zs.sampleScreen(0, 0, 8, 8);
      const s = zs.getState();
      return { render: s.render, types: [...new Set(s.enemies.map((e) => e.type))], gaits: [...new Set(s.enemies.map((e) => e.gait))], count: s.enemies.length };
    });
    testInfo.annotations.push({ type: 'rendu', description: `10 zombies : ${r.render.calls} appels, ${r.render.triangles} triangles` });
    console.log(`BUDGET 10 zombies : ${r.render.calls} appels de dessin, ${r.render.triangles} triangles`);
    expect(r.count).toBe(10);
    expect(r.types.sort()).toEqual([...TYPES].sort());
    expect(r.gaits.sort()).toEqual([...GAITS].sort());
    expect(r.render.calls).toBeLessThanOrEqual(300);
    expect(r.render.triangles).toBeLessThanOrEqual(15000);
  });

  test('aucune requête externe, aucun stockage, aucun cookie, console propre pendant une vague', async ({ page, baseURL }) => {
    const external = [];
    const problems = [];
    page.on('request', (r) => !r.url().startsWith(baseURL) && !r.url().startsWith('data:') && external.push(r.url()));
    page.on('console', (m) => ['error', 'warning'].includes(m.type()) && !BROWSER_NOISE.test(m.text()) && problems.push(m.text()));
    page.on('pageerror', (e) => problems.push(e.message));
    await open(page);
    await step(page, 8);
    await page.evaluate(() => window.__zs.killAll());
    await step(page, 1);
    expect(external).toEqual([]);
    expect(problems).toEqual([]);
    expect(await page.evaluate(() => [localStorage.length, sessionStorage.length, document.cookie])).toEqual([0, 0, '']);
    expect(await page.context().cookies()).toEqual([]);
  });

  test('startWave(n) saute à la vague n et retire les zombies ; setWaveParams est temporaire jusqu\'à Rejouer', async ({ page }) => {
    await open(page);
    await step(page, 3.2);
    expect((await state(page)).enemies.length).toBeGreaterThan(0);
    await page.evaluate(() => window.__zs.startWave(12));
    let s = await state(page);
    expect(s.enemies).toEqual([]);
    expect(s.waves).toMatchObject({ wave: 12, phase: 'attente', level: 3, total: waveSpec(12, params).total });
    await page.evaluate(() => window.__zs.setWaveParams({ total: { base: 2, linear: 0, quadratic: 0 } }));
    expect((await state(page)).waves.total).toBe(2);
    await page.evaluate(() => window.__zs.startWave(1));
    await page.evaluate(() => { window.__zs.setPlayer(1800, 1000); window.__zs.step(1); });
    await page.evaluate(() => window.__zs.setInput({}));
    s = await state(page);
    expect(s.waves.total).toBe(2);
  });
});
