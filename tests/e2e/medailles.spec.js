import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { readFileSync } from 'node:fs';
import { defaultProgression, serialiser, soldeMedailles } from '../../js/core/progression.js';
import { waitReady } from './helpers.js';

// Lot 8k (Docs/ref/economie.md) : médailles en partie (porte ouverte, paliers, premier monde, partie du jour), écrites AU GAIN dans zs.save.v2 ;
// affichages (fin de manche, pause, E2-7, en-tête du menu). 667 × 375, step() et les hooks de ?test=1 (aucune durée réelle attendue) ; &store=local :
// vrai localStorage (les adresses de gain n'ont aucun paramètre d'essai, sinon la sauvegarde est en lecture seule).
const load = (name) => JSON.parse(readFileSync(`data/game/${name}.json`, 'utf8'));
const params = { save: load('save'), economy: load('economy'), stats: load('player-stats') };
const KEY = params.save.v2.storageKey;
const SIZE = { width: 667, height: 375 };
const LOCAL = '/jeu.html?test=1&store=local&seed=1';
const state = (page) => page.evaluate(() => window.__zs.getState());
const step = (page, seconds) => page.evaluate((s) => window.__zs.step(s), seconds);
const storedJson = async (page) => JSON.parse(await page.evaluate((k) => localStorage.getItem(k), KEY) ?? 'null');
const externes = (page, baseURL) => {
  const liste = [];
  page.on('request', (r) => {
    const u = r.url();
    if (!u.startsWith(baseURL) && !u.startsWith('data:') && !u.startsWith('blob:')) liste.push(u);
  });
  return liste;
};

async function open(page, url = LOCAL) {
  await page.setViewportSize(SIZE);
  await page.goto(url);
  await waitReady(page);
  await page.evaluate(() => { window.requestAnimationFrame = () => 0; });
  await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 150)));
  await page.evaluate(() => { window.__zs.step(0.05); });
}
// Manche n démarrée, terminée par le hook, puis pas de jeu jusqu'à l'ouverture de la porte 1 (après la manche 10) ; renvoie l'état.
async function jusquAPorte(page) {
  await page.evaluate(() => window.__zs.startWave(10));
  await step(page, 3.2);
  await page.evaluate(() => window.__zs.skipWave());
  for (let i = 0; i < 80; i += 1) {
    await step(page, 0.25);
    const s = await state(page);
    if (s.zones.doors.some((d) => d.open)) return s;
  }
  return state(page);
}

test.describe('médailles en partie (lot 8k)', () => {
  test('porte ouverte : +10 médailles écrites AUSSITÔT (avant la fin de la manche suivante), affichées sous la monnaie bleue, gardées après la fermeture de l\'onglet ; aucune requête externe', async ({ page, context, baseURL }) => {
    test.setTimeout(150_000);
    const ext = externes(page, baseURL);
    await page.addInitScript(() => {
      window.__ecritures = [];
      const set = Storage.prototype.setItem;
      // Garantie 9 : durée de chaque écriture du stockage (la seule chose que le gain de médailles ajoute à une image).
      Storage.prototype.setItem = function (k, v) { const t0 = performance.now(); const r = set.call(this, k, v); window.__ecritures.push({ k, ms: performance.now() - t0 }); return r; };
    });
    await open(page);
    const s = await jusquAPorte(page);
    expect(s.zones.doors.filter((d) => d.open).length).toBe(1);
    const m = s.save.medailles;
    expect(m.run.portes).toBe(10);
    const ecrit = await storedJson(page);
    // Écrit aussitôt : le solde écrit contient déjà la porte (et les paliers 5 et 10, premier franchissement : partie C).
    expect(soldeMedailles(ecrit)).toBe(m.run.total);
    expect(m.run.total).toBe(10 + 2 * params.economy.medaillePalier);
    expect(m.solde).toBe(m.run.total);
    // Affichage en partie : médaille puis « solde (+gain) », dans un bloc à part, sous celui de la monnaie bleue (jamais par-dessus).
    const bloc = page.locator('#hud-medailles-manche');
    await expect(bloc).toBeVisible();
    // Paliers 5 et 10 (fin de la manche 10) puis la porte, à moins de 4 s de jeu : les deux gains s'additionnent dans le même bloc.
    await expect(bloc).toContainText(`${m.solde} (+${m.run.total})`);
    await expect(bloc.locator('svg.hud-medaille')).toHaveCount(1);
    const bleu = page.locator('#hud-bleu-manche');
    if (await bleu.isVisible()) {
      const [a, b] = await Promise.all([bleu.boundingBox(), bloc.boundingBox()]);
      expect(b.y).toBeGreaterThanOrEqual(a.y + a.height - 0.5);
    }
    // Garantie 9 : chaque écriture du stockage sous 50 ms (émulation, valeur relative : la mesure réelle est au bilan).
    const durees = await page.evaluate(() => window.__ecritures.filter((e) => e.k === 'zs.save.v2').map((e) => e.ms));
    expect(durees.length).toBeGreaterThan(0);
    expect(Math.max(...durees)).toBeLessThan(50);
    // Onglet fermé : la porte est gardée (rien n'attendait d'être écrit).
    await page.close();
    const autre = await context.newPage();
    await autre.goto('/sauvegarde.html');
    const relu = await storedJson(autre);
    expect(soldeMedailles(relu)).toBe(m.run.total);
    expect(relu.paliers.histoire.batiment).toBe(10);
    expect(ext).toEqual([]);
  });

  test('pause : solde bleu puis solde de médailles (icône puis montant, « Médailles : » pour les lecteurs d\'écran) ; E2-7 : médailles gagnées, sources, solde ; axe', async ({ page }) => {
    test.setTimeout(150_000);
    await open(page);
    await jusquAPorte(page);
    await page.locator('#btn-pause').click();
    const pause = page.locator('#pause-balance');
    await expect(pause).toBeVisible();
    const total = (await state(page)).save.medailles.solde;
    await expect(page.locator('#pause-medailles-text')).toHaveText(String(total));
    await expect(pause.locator('.pause-medailles .sr-only')).toHaveText('Médailles :');
    await expect(pause.locator('.pause-medailles svg.hud-medaille')).toHaveCount(1);
    await page.locator('#btn-resume').click();
    await page.evaluate(() => { window.__zs.killAll(); window.__zs.setChutes(0); window.__zs.downPlayer(); });
    await step(page, 0.3);
    await expect(page.locator('#end-panel')).toBeVisible();
    await expect(page.locator('#end-medailles')).toHaveText(`Médailles gagnées : ${total + params.economy.medailleJour}`);
    await expect(page.locator('#end-medailles-sources')).toHaveText(`portes 10 · paliers 100 · partie du jour ${params.economy.medailleJour}`);
    await expect(page.locator('#end-medailles-solde')).toHaveText(`Médailles : ${total + params.economy.medailleJour}`);
    expect(soldeMedailles(await storedJson(page))).toBe(total + params.economy.medailleJour);
    const axe = await new AxeBuilder({ page }).include('#end-panel').analyze();
    expect(axe.violations).toEqual([]);
    // Dans l'écran à 667 × 375, sans chevauchement des lignes de la colonne de gauche.
    const boites = await page.locator('#end-panel .facts-col:first-child > p:not([hidden])').evaluateAll((ns) => ns.map((n) => n.getBoundingClientRect().toJSON()));
    for (let i = 1; i < boites.length; i += 1) expect(boites[i].top).toBeGreaterThanOrEqual(boites[i - 1].bottom - 0.5);
    for (const b of boites) expect(b.bottom).toBeLessThanOrEqual(SIZE.height);
  });

  test('mode essai (?wave=11) : la porte affiche ses médailles, rien n\'est écrit', async ({ page }) => {
    test.setTimeout(120_000);
    await page.addInitScript(() => {
      window.__ecritures = [];
      const set = Storage.prototype.setItem;
      Storage.prototype.setItem = function (k, v) { window.__ecritures.push(k); return set.call(this, k, v); };
    });
    await open(page, '/jeu.html?test=1&store=local&seed=1&wave=10');
    await step(page, 3.2);
    await page.evaluate(() => window.__zs.skipWave());
    for (let i = 0; i < 80 && !(await state(page)).zones.doors.some((d) => d.open); i += 1) await step(page, 0.25);
    expect((await state(page)).save.medailles.run.portes).toBe(10);
    expect(await page.evaluate(() => window.__ecritures.filter((k) => k === 'zs.save.v2'))).toEqual([]);
  });
});

test.describe('en-tête du menu (lot 8k)', () => {
  for (const [nom, size] of [['932 × 430', { width: 932, height: 430 }], ['667 × 375', SIZE]]) {
    test(`${nom} : solde bleu puis solde de médailles (« Monnaie bleue : N », « Médailles : N »), dans l'en-tête, sans chevauchement ; axe`, async ({ page }) => {
      test.setTimeout(120_000);
      const save = serialiser({ ...defaultProgression(), bleu: { gagne: 1234, depense: 0 }, medailles: { gagne: 2050, depense: 600, jour: 0 } });
      await page.addInitScript(([k, v]) => {
        if (!sessionStorage.getItem('zs.test.pose')) {
          sessionStorage.setItem('zs.test.pose', '1');
          localStorage.setItem(k, v);
        }
      }, [KEY, JSON.stringify(save)]);
      await page.setViewportSize(size);
      await page.goto('/jeu.html?test=1&menu=1&seed=1&store=local');
      await expect(page.locator('#menu-jouer')).toBeVisible({ timeout: 60_000 });
      await page.waitForFunction(() => window.__zsMenu?.etat()?.menu !== null && !document.getElementById('e7'));
      const nbsp = String.fromCharCode(0x202f);
      await expect(page.locator('#menu-solde-texte')).toHaveText(`1${nbsp}234`);
      await expect(page.locator('#menu-medailles-texte')).toHaveText(`1${nbsp}450`);
      await expect(page.locator('#menu-medailles')).toContainText(`Médailles : 1${nbsp}450`);
      await expect(page.locator('#menu-medailles svg')).toHaveCount(1);
      const b = await page.evaluate(() => Object.fromEntries(['#menu-solde', '#menu-medailles', '#menu-plein-ecran', '#menu-trois-barres', '.menu-bandeau'].map((s) => [s, document.querySelector(s)?.getBoundingClientRect().toJSON() ?? null])));
      expect(b['#menu-solde'].right).toBeLessThanOrEqual(b['#menu-medailles'].left + 0.5);
      expect(b['#menu-medailles'].right).toBeLessThanOrEqual((b['#menu-plein-ecran']?.width ? b['#menu-plein-ecran'] : b['#menu-trois-barres']).left + 0.5);
      expect(b['#menu-medailles'].right).toBeLessThanOrEqual(size.width);
      const axe = await new AxeBuilder({ page }).include('#menu-medailles').analyze();
      expect(axe.violations).toEqual([]);
    });
  }
});
