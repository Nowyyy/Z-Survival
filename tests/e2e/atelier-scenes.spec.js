import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import AxeBuilder from '@axe-core/playwright';
import { createScene } from '../../js/core/scenes-sons.js';

// Lot 3h-C : scènes de 30 s et propositions de l'atelier des sons. Avec ?test=1, l'horloge d'une scène avance par
// window.__zsSons.stepScene(s) : 30 s de jeu simulé, aucune attente réelle. Taille de référence 667×375.
const atelier = JSON.parse(readFileSync('data/game/sounds-atelier.json', 'utf8'));
const P2 = atelier.slots.filter((s) => s.priority === 2);
const SIZE = { width: 667, height: 375 };
const logOf = (page) => page.evaluate(() => window.__zsSons.log());

async function open(page) {
  await page.setViewportSize(SIZE);
  await page.goto('/atelier-sons.html?test=1');
  await expect(page.locator('body')).toHaveAttribute('data-ready', '1', { timeout: 60_000 });
  await page.getByRole('button', { name: 'Activer le son' }).click();
}
// Lance une scène, attend sa préparation, puis avance l'horloge de test seconde par seconde jusqu'à la fin.
async function runScene(page, id, seconds = 31) {
  await page.locator(`button[data-scene="${id}"]`).click();
  await expect.poll(() => page.evaluate(() => window.__zsSons.scene().ready), { timeout: 60_000 }).toBe(true);
  for (let k = 0; k < seconds; k += 1) await page.evaluate(() => window.__zsSons.stepScene(1));
  return (await logOf(page)).filter((e) => e.scene === id);
}

for (const id of ['couloir', 'siege', 'reparation', 'meute']) {
  test(`scène « ${id} » : se lance, dure 30 s de jeu simulé, joue ses événements dans l'ordre et selon la graine, s'arrête à la fin`, async ({ page }) => {
    await open(page);
    const expected = createScene(id, 1, { repairDuration: 1.8 }).events;
    const entries = await runScene(page, id);
    const start = entries.find((e) => e.kind === 'scene-start');
    const events = entries.filter((e) => e.kind === 'scene-event');
    const end = entries.find((e) => e.kind === 'scene-end');
    expect(start).toMatchObject({ seed: 1, events: expected.length });
    expect(events.map((e) => [e.t, e.sonId, e.seed])).toEqual(expected.map((e) => [e.t, e.sonId, e.graine]));
    for (let i = 1; i < events.length; i += 1) expect(events[i].t).toBeGreaterThanOrEqual(events[i - 1].t);
    expect(events.every((e) => e.played && e.t < 30 && e.at <= 30)).toBe(true);
    expect(end).toMatchObject({ events: expected.length, elapsed: 30 });
    expect(await page.evaluate(() => window.__zsSons.scene().running)).toBe(false);
    await expect(page.locator('#scene-status')).toContainText('terminée');
  });
}

test('une scène rejouée donne les mêmes événements (déterministe)', async ({ page }) => {
  await open(page);
  const first = (await runScene(page, 'couloir')).filter((e) => e.kind === 'scene-event').map((e) => [e.t, e.sonId, e.seed, e.variant, e.gain]);
  const before = (await logOf(page)).length;
  await runScene(page, 'couloir');
  const second = (await logOf(page)).slice(before).filter((e) => e.kind === 'scene-event').map((e) => [e.t, e.sonId, e.seed, e.variant, e.gain]);
  expect(second).toEqual(first);
});

test('un changement de choix modifie la scène suivante (favori B pour les pas sur sol dur)', async ({ page }) => {
  await open(page);
  const before = (await runScene(page, 'couloir')).filter((e) => e.kind === 'scene-event' && e.sonId === 'pas-joueur-dur');
  expect(new Set(before.map((e) => e.variant))).toEqual(new Set(['A']));
  await page.locator('.slot[data-slot="pas-joueur-dur"]').getByLabel('B', { exact: true }).check();
  const n = (await logOf(page)).length;
  await runScene(page, 'couloir');
  const after = (await logOf(page)).slice(n).filter((e) => e.kind === 'scene-event' && e.sonId === 'pas-joueur-dur');
  expect(after.length).toBe(before.length);
  expect(new Set(after.map((e) => e.variant))).toEqual(new Set(['B']));
});

test('la scène « Réparation » suit la durée de réparation choisie (curseur de la variante favorite)', async ({ page }) => {
  await open(page);
  await page.locator('.slot[data-slot="reparation"]').getByLabel('A', { exact: true }).check();
  await page.locator('.slot[data-slot="reparation"] input[data-macro="duree"]').evaluate((input) => {
    input.value = '0.8';
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  const entries = await runScene(page, 'reparation');
  expect(entries.find((e) => e.kind === 'scene-start').repairDuration).toBe(0.8);
  const expected = createScene('reparation', 1, { repairDuration: 0.8 }).events;
  expect(entries.filter((e) => e.kind === 'scene-event').length).toBe(expected.length);
});

test('« Tout arrêter » coupe la scène en cours : plus aucun événement ensuite', async ({ page }) => {
  await open(page);
  await page.locator('button[data-scene="meute"]').click();
  await expect.poll(() => page.evaluate(() => window.__zsSons.scene().ready), { timeout: 60_000 }).toBe(true);
  for (let k = 0; k < 5; k += 1) await page.evaluate(() => window.__zsSons.stepScene(1));
  await page.getByRole('button', { name: 'Tout arrêter' }).click();
  const n = (await logOf(page)).length;
  expect(await page.evaluate(() => window.__zsSons.scene().running)).toBe(false);
  for (let k = 0; k < 10; k += 1) await page.evaluate(() => window.__zsSons.stepScene(1));
  expect((await logOf(page)).length).toBe(n);
  await expect.poll(() => page.evaluate(() => window.__zsSons.state().activeVoices)).toBe(0);
});

test('meute : les sons de l\'autre étage sont étouffés par le plancher (700 Hz, gain réduit)', async ({ page }) => {
  await open(page);
  const events = (await runScene(page, 'meute')).filter((e) => e.kind === 'scene-event');
  const below = events.filter((e) => e.etage === 'rdc' && e.t >= 6);
  expect(below.length).toBeGreaterThan(5);
  expect(below.every((e) => e.lowpassHz === 700)).toBe(true);
  const same = events.filter((e) => e.etage === 'etage');
  expect(same.every((e) => e.lowpassHz === null)).toBe(true);
});

test('siège : un coup de feu (recette du jeu) et des planches à la distance de la fenêtre', async ({ page }) => {
  await open(page);
  const events = (await runScene(page, 'siege')).filter((e) => e.kind === 'scene-event');
  const shot = events.filter((e) => e.sonId === 'ref:tir');
  expect(shot.length).toBe(1);
  expect(shot[0]).toMatchObject({ distance: 0, gain: 1, variant: null });
  const tears = events.filter((e) => e.sonId === 'planche-arrachage');
  expect(tears.length).toBe(4);
  expect(tears.every((e) => e.gain < 1 && e.gain > 0.3)).toBe(true);
});

test('les propositions sont listées avec leurs variantes A et B, sans son actuel', async ({ page }) => {
  await open(page);
  await expect(page.locator('#groupe-propositions .slot')).toHaveCount(P2.length);
  for (const s of P2) {
    const card = page.locator(`.slot[data-slot="${s.id}"]`);
    await expect(card.locator('button[data-variant]')).toHaveCount(2);
    await expect(card.locator('button[data-action="current"]')).toBeDisabled();
  }
  await expect(page.locator('.atelier-nav-list a[href="#scenes"]')).toBeVisible();
});

test('une proposition se joue et se mesure (vent en boucle de 10 s)', async ({ page }) => {
  await open(page);
  await page.locator('.slot[data-slot="ambiance-vent"] button[data-variant="B"]').click();
  await expect.poll(async () => (await logOf(page)).length, { timeout: 30_000 }).toBe(1);
  expect((await logOf(page))[0]).toMatchObject({ kind: 'variant', slot: 'ambiance-vent', variant: 'B', ok: true, played: true });
  expect((await logOf(page))[0].measures.duration).toBeCloseTo(10, 3);
});

test('après les scènes : rien d\'enregistré, console propre', async ({ page }) => {
  const problems = [];
  page.on('console', (m) => ['error', 'warning'].includes(m.type()) && !/GL Driver Message/.test(m.text()) && problems.push(m.text()));
  page.on('pageerror', (e) => problems.push(e.message));
  await open(page);
  await runScene(page, 'siege');
  await runScene(page, 'reparation');
  expect(await page.evaluate(() => [localStorage.length, sessionStorage.length, document.cookie])).toEqual([0, 0, '']);
  expect(problems).toEqual([]);
});

test('axe : aucune violation avec les propositions et les scènes (667×375)', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'bureau', 'une seule fois');
  await open(page);
  await runScene(page, 'couloir', 3);
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);
  const boxes = await Promise.all((await page.locator('#scenes button, #groupe-propositions button, #groupe-propositions .slot-fav label').all()).map((b) => b.boundingBox()));
  for (const box of boxes) expect(Math.min(box.width, box.height)).toBeGreaterThanOrEqual(43.5);
});
