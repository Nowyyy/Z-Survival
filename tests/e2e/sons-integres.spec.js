import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import AxeBuilder from '@axe-core/playwright';
import { waitReady } from './helpers.js';
import { renderSound } from '../../js/core/synth.js';
import { isAtelier } from '../../js/core/sound-choice.js';
import { renderChoice } from '../../js/core/sound-render.js';
import { resolveAtelier } from '../../js/core/synth2.js';

// Lot 3i-B : sons de l'atelier à la place des anciens. Vérifiés par le journal des lectures (?test=1) et l'empreinte des tampons, jamais à
// l'écoute ; 667×375, temps de jeu (step) et injection d'événements (audioEvent). Lancement : E2E_FULL=1 npx playwright test tests/e2e/sons-integres.spec.js
const SIZE = { width: 667, height: 375 };
const BROWSER_NOISE = /GL Driver Message/;
const { sounds } = JSON.parse(readFileSync('data/game/sounds.json', 'utf8'));
const slots = new Map(resolveAtelier(JSON.parse(readFileSync('data/game/sounds-atelier.json', 'utf8'))).slots.map((s) => [s.id, s]));
const byId = new Map(sounds.map((s) => [s.id, s]));
const URL = (extra = '') => `/jeu.html?test=1&empty=1&nospawn=1&seed=1${extra}`;
const audio = (page) => page.evaluate(() => window.__zs.getState().audio);
const step = (page, s) => page.evaluate((x) => window.__zs.step(x), s);
const emit = (page, events) => page.evaluate((e) => window.__zs.audioEvent(e), events);
const fp = (samples) => {
  let sum = 0;
  for (let i = 0; i < samples.length; i += 1) sum += samples[i] * ((i % 7) + 1);
  return sum.toFixed(6);
};

async function open(page, extra = '') {
  await page.setViewportSize(SIZE);
  await page.goto(URL(extra));
  await waitReady(page);
}
async function unlockReady(page) {
  await page.mouse.click(40, 40);
  await expect.poll(async () => (await audio(page)).unlocked).toBe(true);
  await expect.poll(async () => (await audio(page)).ready, { timeout: 60_000 }).toBe(true);
}
// Position du joueur : les sons sont émis tout près (gain plein).
const near = async (page) => {
  const p = (await page.evaluate(() => window.__zs.getState())).player;
  return { x: p.x + 20, y: p.y };
};

test.describe('sons intégrés : chargement', () => {
  test('par défaut : aucun fichier du pack ancien, aucune donnée ni module de l\'atelier ; seuls les modules du moteur synth2 s\'ajoutent', async ({ page, baseURL }) => {
    const urls = [];
    page.on('request', (r) => urls.push(r.url().replace(baseURL, '').replace(/^\//, '').replace(/\?.*$/, '')));
    await open(page);
    await unlockReady(page);
    await page.waitForLoadState('networkidle');
    expect(urls.filter((u) => /sounds-legacy|sound-legacy|sounds-atelier|sound-atelier\.js|atelier-sons|atelier-choix|sounds-choix/.test(u))).toEqual([]);
    const sound = [...new Set(urls.filter((u) => /sound|synth|audio/.test(u)))].sort(); // le calculateur charge aussi ses modules
    expect(sound).toEqual(['data/game/audio.json', 'data/game/sound-materials.json', 'data/game/sounds.json', 'js/core/audio-analysis.js', 'js/core/audio-mix.js', 'js/core/sound-choice.js', 'js/core/sound-director.js', 'js/core/synth.js', 'js/core/synth2-dsp.js', 'js/core/synth2-sources.js', 'js/core/synth2.js', 'js/game/audio.js', 'js/game/sound-loader.js', 'js/game/sound-worker.js'].sort());
    expect((await audio(page)).mode).toBe('choix');
  });

  test('aucun son avant le geste du joueur (ni lecture, ni calcul au premier usage)', async ({ page }) => {
    await open(page);
    const p = await near(page);
    await emit(page, [{ type: 'playerStep', foot: 'gauche', volume: 1 }, { type: 'plankRepairStart', ...p, windowId: 'F', duration: 1.2, progress: 0 }]);
    await step(page, 0.5);
    const a = await audio(page);
    expect(a.unlocked).toBe(false);
    expect(a.log).toEqual([]);
    expect(a.pack.lazy).toBe(0);
  });

  test('tous les tampons de l\'atelier sont prêts et identiques au rendu de Node (empreinte), au même moment qu\'avant', async ({ page }) => {
    await open(page);
    await unlockReady(page);
    const a = await audio(page);
    for (const s of sounds.filter(isAtelier)) {
      for (let k = 1; k <= s.preload; k += 1) expect(a.sums[`${s.id}-${k}`], `${s.id}-${k}`).toBe(fp(renderChoice(s, { seed: k }).samples));
    }
    expect(a.pack.bytes).toBeGreaterThan(0);
    expect(a.pack.decodedBytes).toBe(a.pack.bytes);
  });
});

test.describe('sons intégrés : lecture sous les identifiants du jeu', () => {
  test('pas du joueur, planche arrachée, voix par type : le son et le tampon attendus @lent', async ({ page }) => {
    await open(page);
    await unlockReady(page);
    const p = await near(page);
    const cases = [
      [[{ type: 'playerStep', foot: 'gauche', volume: 1 }], 'pas'],
      [[{ type: 'plankTorn', ...p, windowId: 'F1' }], 'planche-arrachee'],
      [[{ type: 'zombieHit', ...p, killed: false, zombie: 'petit' }], 'zombie-blessure-petit'],
      [[{ type: 'zombieHit', ...p, killed: true, zombie: 'grand' }], 'zombie-mort-grand'],
      [[{ type: 'zombieHit', ...p, killed: true, zombie: 'marcheur' }], 'zombie-mort'],
      [[{ type: 'zombieAttack', ...p, zombie: 'voute' }], 'zombie-attaque-voute'],
    ];
    for (const [events, sound] of cases) {
      const before = (await audio(page)).log.length;
      await emit(page, events);
      await step(page, 0.4);
      const added = (await audio(page)).log.slice(before);
      const e = added.find((x) => x.sound === sound);
      expect(e, sound).toBeDefined();
      expect(e.buffer).toBe(`${sound}-${e.variant + 1}`);
      if (e.sound.startsWith('zombie-')) expect(e.rate).toBe(1);
    }
  });

  test('versions non préchargées : calculées au premier usage puis gardées ; en attendant, une version prête @lent', async ({ page }) => {
    await open(page);
    await unlockReady(page);
    for (let i = 0; i < 12; i += 1) {
      await emit(page, [{ type: 'playerStep', foot: i % 2 ? 'droit' : 'gauche', volume: 1 }]);
      await step(page, 0.2);
    }
    await expect.poll(async () => (await audio(page)).loaded.filter((n) => /^pas-\d$/.test(n)).length).toBe(byId.get('pas').variants);
    const a = await audio(page);
    expect(a.pack.lazy).toBeGreaterThanOrEqual(byId.get('pas').variants - byId.get('pas').preload);
    for (let k = 1; k <= byId.get('pas').variants; k += 1) expect(a.sums[`pas-${k}`]).toBe(fp(renderChoice(byId.get('pas'), { seed: k }).samples));
    // Toutes les versions prêtes : plus aucun repli, jamais deux fois la même version d'affilée.
    const before = a.log.length;
    for (let i = 0; i < 10; i += 1) {
      await emit(page, [{ type: 'playerStep', foot: i % 2 ? 'droit' : 'gauche', volume: 1 }]);
      await step(page, 0.2);
    }
    const steps = (await audio(page)).log.slice(before).filter((e) => e.sound === 'pas');
    expect(steps.length).toBeGreaterThanOrEqual(8);
    for (let i = 0; i < steps.length; i += 1) {
      expect(steps[i].asked).toBeUndefined();
      if (i > 0) expect(steps[i].variant).not.toBe(steps[i - 1].variant);
    }
  });

  test('réparation : au début de la pose, tampon à la durée de pose (calculé au premier usage), arrêt si interrompue @lent', async ({ page }) => {
    await open(page);
    await unlockReady(page);
    const p = await near(page);
    await emit(page, [{ type: 'plankRepairStart', ...p, windowId: 'F2', duration: 1.8, progress: 0 }]);
    await step(page, 0.2);
    let log = (await audio(page)).log;
    expect(log.find((e) => e.sound === 'planche-posee')?.buffer).toMatch(/^planche-posee-\d$/);
    await step(page, 2);
    await emit(page, [{ type: 'plankRepairStart', ...p, windowId: 'F3', duration: 0.8, progress: 0 }]);
    await expect.poll(async () => (await audio(page)).log.some((e) => /^planche-posee@80-\d$/.test(e.buffer ?? ''))).toBe(true);
    await step(page, 0.2);
    await emit(page, [{ type: 'plankRepairStop', windowId: 'F3' }]);
    log = (await audio(page)).log;
    expect(log.some((e) => e.stop === true && e.key === 'F3')).toBe(true);
    expect((await audio(page)).pack.lazy).toBeGreaterThanOrEqual(1);
  });

  test('vraie réparation en jeu : son au début de la pose de la planche (et non à la planche posée) @lent', async ({ page }) => {
    await page.setViewportSize(SIZE);
    await page.goto('/jeu.html?test=1&map=salle&nospawn=1&seed=1&planks=2');
    await waitReady(page);
    await unlockReady(page);
    const w = (await page.evaluate(() => window.__zs.getState())).windows.find((x) => x.planks < x.maxPlanks);
    test.skip(!w, 'aucune fenêtre à réparer');
    await page.evaluate(([x, y]) => window.__zs.setPlayer(x, y), [w.repairSpot.x, w.repairSpot.y]);
    await step(page, 0.2);
    const log = (await audio(page)).log;
    const start = log.find((e) => e.sound === 'planche-posee');
    expect(start).toBeDefined();
    const s = await page.evaluate(() => window.__zs.getState());
    expect(s.windows.find((x) => x.id === w.id).planks).toBe(w.planks); // aucune planche n'est encore posée
  });

  test('autre étage : la réparation et les voix sont étouffées (passe-bas 700 Hz)', async ({ page }) => {
    await open(page);
    await unlockReady(page);
    const p = await near(page);
    await emit(page, [{ type: 'plankTorn', ...p, windowId: 'F9', floor: 'etage' }, { type: 'zombieHit', ...p, killed: true, zombie: 'petit', floor: 'etage' }]);
    await step(page, 0.2);
    const log = (await audio(page)).log.filter((e) => e.sound === 'planche-arrachee' || e.sound === 'zombie-mort-petit');
    expect(log).toHaveLength(2);
    for (const e of log) expect(e).toMatchObject({ lowpass: true, lowpassHz: 700 });
  });

  test('mélodie et coups de feu : tampons inchangés (empreinte du rendu de synth.js)', async ({ page }) => {
    await open(page);
    await unlockReady(page);
    const a = await audio(page);
    for (const id of ['tir', 'douille', 'vague-annonce', 'impact-bois']) { // lot 5a : impact-zombie est devenu l'impact sur la chair de l'atelier
      const r = byId.get(id);
      expect(isAtelier(r)).toBe(false);
      expect(a.sums[`${id}-1`], id).toBe(fp(renderSound(r, 0).samples));
    }
    await page.evaluate(() => window.__zs.fire(0));
    await step(page, 0.1);
    expect((await audio(page)).log.some((e) => e.sound === 'tir' && e.buffer === `tir-${e.variant + 1}`)).toBe(true);
  });
});

test.describe('sons intégrés : ?sons=', () => {

  test('?sons=B : la variante B de l\'atelier (réglages par défaut) pour les sons intégrés', async ({ page }) => {
    await open(page, '&sons=B');
    await unlockReady(page);
    const a = await audio(page);
    expect(a.mode).toBe('B');
    const pas = byId.get('pas');
    expect(a.sums['pas-1']).toBe(fp(renderChoice(pas, { seed: 1, mode: 'B', slots }).samples));
    expect(a.sums['pas-1']).not.toBe(fp(renderChoice(pas, { seed: 1 }).samples));
  });

  test('?sons=A et une valeur inconnue : A, puis le défaut sans erreur', async ({ page }) => {
    const problems = [];
    page.on('pageerror', (e) => problems.push(e.message));
    await open(page, '&sons=A');
    expect((await audio(page)).mode).toBe('A');
    await open(page, '&sons=%3Cimg%3E');
    expect((await audio(page)).mode).toBe('choix');
    expect(problems).toEqual([]);
  });

  test('?sons= ne déclenche pas le mode essai et n\'écrit rien de nouveau', async ({ page }) => {
    await page.setViewportSize(SIZE);
    await page.goto('/jeu.html?test=1&store=local&seed=1&sons=ancien');
    await waitReady(page);
    const s = (await page.evaluate(() => window.__zs.getState())).save;
    expect(s).toMatchObject({ readOnly: false, reasons: [] });
    const keys = await page.evaluate(() => Object.keys(localStorage).filter((k) => k !== 'zs.save.v1'));
    expect(keys).toEqual([]);
    expect(await page.evaluate(() => sessionStorage.length)).toBe(0);
  });
});

test.describe('sons intégrés : page d\'écoute et hygiène', () => {
  test('sons.html liste les sons intégrés (dont les voix par type) et affiche le poids et la mémoire estimée, sans plafond', async ({ page }) => {
    await page.setViewportSize(SIZE);
    await page.goto('/sons.html?test=1');
    await expect(page.locator('#list .sound')).toHaveCount(sounds.length, { timeout: 60_000 });
    await expect(page.locator('.sound[data-sound="zombie-mort-petit"]')).toHaveAttribute('data-atelier', 'voix-petit-mort');
    await expect(page.locator('.sound[data-sound="pas"] .sound-origin')).toContainText('pas-joueur-dur');
    await expect(page.locator('#pack')).toContainText('mémoire estimée');
    await expect(page.locator('#pack')).not.toContainText(/(?<![\d.,])8 ?Mo/); // lot 5a : un poids comme « 15.78 Mo » ne compte pas (chiffre avant le 8)
    await expect(page.locator('.sound[data-sound="impact-zombie"]')).toHaveAttribute('data-atelier', 'impact-chair'); // lot 5a
    await expect(page.locator('.sound[data-sound="impact-zombie"] .sound-meta').first()).toContainText('pic');
    await expect(page.locator('a[href="atelier-sons.html"]')).toBeVisible();
    const total = sounds.reduce((n, s) => n + s.variants, 0);
    await expect(page.locator('button.variant')).toHaveCount(total);
  });

  test('console propre et axe sans violation (jeu en pause, 667×375) avec les sons intégrés', async ({ page }) => {
    const problems = [];
    page.on('console', (m) => ['error', 'warning'].includes(m.type()) && !BROWSER_NOISE.test(m.text()) && problems.push(m.text()));
    page.on('pageerror', (e) => problems.push(e.message));
    await open(page);
    await unlockReady(page);
    const p = await near(page);
    await emit(page, [{ type: 'zombieAttack', ...p, zombie: 'grand' }, { type: 'plankRepairStart', ...p, windowId: 'F', duration: 1, progress: 0 }]);
    await step(page, 0.5);
    await page.getByRole('button', { name: 'Pause' }).click();
    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations.map((v) => v.id)).toEqual([]);
    expect(problems).toEqual([]);
  });
});

// Lot 5a-B : l'impact d'une balle sur un zombie (ancien « cling ») est l'impact sur la chair de l'atelier (emplacement impact-chair, A par défaut),
// sous le même identifiant ; une balle sur un mur garde l'ancien impact ; ?sons=ancien rejoue l'ancien son ; ?sons=B la variante B.
test.describe('impact sur la chair (lot 5a)', () => {
  const legacy = new Map(JSON.parse(readFileSync('data/game/sounds-legacy.json', 'utf8')).sounds.map((r) => [r.id, r]));
  const shootAt = (page, angle, zombie) => page.evaluate(([a, z]) => {
    const zs = window.__zs;
    const p = zs.getState().player;
    const id = z ? zs.spawnEnemy(p.x + 160, p.y) : null;
    zs.setInput({ aim: { angle: a } });
    zs.fire(a);
    for (let i = 0; i < 20; i += 1) zs.step(0.05);
    const s = zs.getState();
    return { id, hp: id ? s.enemies.find((e) => e.id === id)?.health ?? 0 : null, log: s.audio.log };
  }, [angle, zombie]);

  test('une balle sur un zombie joue impact-zombie avec le tampon de l\'impact sur la chair (A) ; une balle sur un mur, l\'ancien impact de pierre', async ({ page }) => {
    await open(page);
    await unlockReady(page);
    const entry = byId.get('impact-zombie');
    expect(isAtelier(entry)).toBe(true);
    expect(entry.atelier.slot.id).toBe('impact-chair');
    const a = await audio(page);
    expect(a.sums['impact-zombie-1']).toBe(fp(renderChoice(entry, { seed: 1 }).samples));
    const hit = await shootAt(page, 0, true);
    const e = hit.log.find((x) => x.sound === 'impact-zombie');
    expect(e).toBeDefined();
    expect(e.buffer).toBe(`impact-zombie-${e.variant + 1}`);
    expect(hit.log.some((x) => x.sound === 'impact-pierre')).toBe(false);
    expect(a.sums['impact-pierre-1']).toBe(fp(renderSound(byId.get('impact-pierre'), 0).samples));
    // Mur : un pilier de la carte par défaut (?empty=1 n'a aucun obstacle de tir), comme tests/e2e/carte-jeu.spec.js.
    const pillar = JSON.parse(readFileSync('data/game/maps/rez-de-chaussee/world.json', 'utf8')).pillars.find((q) => q.id === 'pilier-7');
    await page.goto('/jeu.html?test=1&nospawn=1&seed=1');
    await waitReady(page);
    await unlockReady(page);
    await page.evaluate(([x, y]) => window.__zs.setPlayer(x, y), [pillar.x - 150, pillar.y + pillar.h / 2]);
    const wall = await shootAt(page, 0, false);
    const w = wall.log.find((x) => x.sound.startsWith('impact-'));
    expect(w.sound).toBe('impact-pierre');
    expect(w.buffer).toBe(`impact-pierre-${w.variant + 1}`);
    expect(wall.log.some((x) => x.sound === 'impact-zombie')).toBe(false);
  });

  test('?sons=ancien : la balle sur un zombie rejoue l\'ancien impact (recette de synth.js) ; ?sons=B : la variante B', async ({ page }) => {
    await open(page, '&sons=ancien');
    await unlockReady(page);
    expect((await audio(page)).sums['impact-zombie-1']).toBe(fp(renderSound(legacy.get('impact-zombie'), 0).samples));
    const hit = await shootAt(page, 0, true);
    expect(hit.log.some((x) => x.sound === 'impact-zombie')).toBe(true);
    await open(page, '&sons=B');
    await unlockReady(page);
    const entry = byId.get('impact-zombie');
    expect((await audio(page)).sums['impact-zombie-1']).toBe(fp(renderChoice(entry, { seed: 1, mode: 'B', slots }).samples));
    expect((await audio(page)).sums['impact-zombie-1']).not.toBe(fp(renderChoice(entry, { seed: 1 }).samples));
  });
});
