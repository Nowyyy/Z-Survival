import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { solde, soldeMedailles } from '../../js/core/progression.js';
import { CLE_V2, poserProgression, progressionDemo, waitReady } from './helpers.js';

// Lot 9a (Docs/ref/economie.md, section 0) : médailles et diamants intervertis À L'ÉCRAN (champs gardés : « bleu » = médailles, « medailles » =
// diamants), Zollars, « Quitter » sans crédit. 667 × 375, step() et hooks de ?test=1 (aucune durée réelle attendue) ; &store=local : vrai stockage.
const SIZE = { width: 667, height: 375 };
const LOCAL = '/jeu.html?test=1&store=local&seed=1';
const NNBSP = String.fromCharCode(0x202f);
const fmt = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, NNBSP);
const tokens = readFileSync('css/tokens.css', 'utf8');
const hex = (nom) => tokens.match(new RegExp(`${nom}:\\s*(#[0-9a-f]{6})`, 'i'))[1];
const rgb = (h) => `rgb(${parseInt(h.slice(1, 3), 16)}, ${parseInt(h.slice(3, 5), 16)}, ${parseInt(h.slice(5, 7), 16)})`;
const BRONZE = rgb(hex('--color-money-medaille'));
const BLEU = rgb(hex('--color-money-blue'));
const state = (page) => page.evaluate(() => window.__zs.getState());
const step = (page, s) => page.evaluate((x) => window.__zs.step(x), s);
const stored = async (page) => JSON.parse(await page.evaluate((k) => localStorage.getItem(k), CLE_V2) ?? 'null');
const couleur = (loc) => loc.evaluate((n) => getComputedStyle(n).color);
const departV08 = () => progressionDemo({ bleu: 1234, medailles: 567, extra: { bleu: { gagne: 1234, depense: 200 }, medailles: { gagne: 567, depense: 100, jour: 0 } } });

async function open(page, url = LOCAL) {
  await page.setViewportSize(SIZE);
  await page.goto(url);
  await waitReady(page);
  await page.evaluate(() => { window.requestAnimationFrame = () => 0; });
  await page.evaluate(() => new Promise((r) => setTimeout(r, 150)));
  await step(page, 0.05);
}
async function finirManche(page) {
  await step(page, 3.2);
  await page.evaluate(() => window.__zs.skipWave());
  await step(page, 0.3);
}
async function ouvrirMenu(page, extra = '') {
  await page.setViewportSize(SIZE);
  await page.goto(`/jeu.html?test=1&menu=1&seed=1&ouverture=0&store=local${extra}`);
  await expect(page.locator('#menu-jouer')).toBeVisible({ timeout: 60_000 });
  await page.waitForFunction(() => window.__zsMenu?.etat()?.menu !== null && !document.getElementById('e7'));
}

test.describe('monnaies interverties et Zollars (lot 9a)', () => {
  test('en partie : fin de manche = médaille (bronze), porte et paliers = gemme (bleu) ; pause : médailles puis diamants ; HUD « Zollars » ; « Quitter » après deux manches : soldes inchangés ; en-tête du menu', async ({ page }) => {
    test.setTimeout(180_000);
    await poserProgression(page, departV08());
    await open(page);
    expect(await page.locator('#hud-money').getAttribute('aria-label')).toBe('Zollars : 0');
    await finirManche(page);
    const fin1 = page.locator('#hud-bleu-manche');
    await expect(fin1).toBeVisible();
    await expect(fin1).toHaveText(`${fmt(1054)} (+20)`);
    await expect(fin1.locator('svg.hud-medaille')).toHaveCount(1);
    await expect(fin1.locator('svg.hud-gem')).toHaveCount(0);
    expect(await couleur(fin1)).toBe(BRONZE);
    await expect(page.locator('#hud-gain-bleu svg.hud-medaille')).toHaveCount(1); // « +N » de fin de manche : médaille
    expect(await couleur(page.locator('#hud-gain-bleu'))).toBe(BRONZE);
    // Deuxième manche, puis pause : médaille « Médailles : » (champ bleu) puis gemme « Diamants : » (champ medailles).
    await step(page, 4.5);
    await finirManche(page);
    await page.locator('#btn-pause').click();
    const pause = page.locator('#pause-balance');
    await expect(pause.locator('svg').first()).toHaveClass(/hud-medaille/);
    await expect(pause.locator('.sr-only').first()).toHaveText('Médailles :');
    await expect(page.locator('#pause-balance-text')).toHaveText(fmt(1074));
    expect(await couleur(pause)).toBe(BRONZE);
    const diam = page.locator('.pause-medailles');
    await expect(diam.locator('svg.hud-gem')).toHaveCount(1);
    await expect(diam.locator('.sr-only')).toHaveText('Diamants :');
    await expect(page.locator('#pause-medailles-text')).toHaveText('467');
    expect(await couleur(diam)).toBe(BLEU);
    // « Quitter » : confirmation (Zollars perdus), rien de plus que les deux manches déjà écrites.
    const avant = await stored(page);
    expect([solde(avant), soldeMedailles(avant), avant.medailles.jour]).toEqual([1074, 467, 0]);
    await page.locator('#btn-quit').click();
    await expect(page.locator('#quit-confirm-text')).toHaveText('Quitter la partie ? Les médailles et les diamants gagnés sont gardés ; les Zollars de cette partie seront perdus.');
    await Promise.all([page.waitForURL(/[?&]menu=1/), page.locator('#btn-quit-ok').click()]);
    await expect(page.locator('#menu-jouer')).toBeVisible({ timeout: 60_000 });
    const apres = await stored(page);
    expect([solde(apres), soldeMedailles(apres), apres.medailles, apres.bleu]).toEqual([1074, 467, avant.medailles, avant.bleu]);
    // En-tête du menu : médaille et « Médailles : » (champ bleu), puis gemme et « Diamants : » (champ medailles).
    await expect(page.locator('#menu-solde svg.e8-medaille')).toHaveCount(1);
    await expect(page.locator('#menu-solde')).toContainText(`Médailles : ${fmt(1074)}`);
    await expect(page.locator('#menu-medailles svg.e8-gemme')).toHaveCount(1);
    await expect(page.locator('#menu-medailles')).toContainText('Diamants : 467');
    expect([await couleur(page.locator('#menu-solde')), await couleur(page.locator('#menu-medailles'))]).toEqual([BRONZE, BLEU]);
  });

  test('porte ouverte : gemme bleue et « solde (+gain) » des diamants ; écran de fin : « Solde médailles » (médaille) puis « Solde diamants » (gemme), chacun avec son gain', async ({ page }) => {
    test.setTimeout(180_000);
    await open(page);
    await page.evaluate(() => window.__zs.startWave(10));
    await finirManche(page);
    for (let i = 0; i < 80 && !(await state(page)).zones.doors.some((d) => d.open); i += 1) await step(page, 0.25);
    const s = await state(page);
    expect(s.zones.doors.filter((d) => d.open).length).toBe(1);
    const bloc = page.locator('#hud-medailles-manche');
    await expect(bloc).toBeVisible();
    await expect(bloc.locator('svg.hud-gem')).toHaveCount(1);
    await expect(bloc.locator('svg.hud-medaille')).toHaveCount(0);
    expect(await couleur(bloc)).toBe(BLEU);
    await expect(bloc).toContainText(`(+${s.save.medailles.run.total})`);
    // Mort : écran de fin.
    await page.evaluate(() => { const zs = window.__zs; zs.setChutes(0); zs.downPlayer(); zs.step(0.3); });
    await expect(page.locator('#end-panel')).toBeVisible();
    const fin = await state(page);
    await expect(page.locator('#end-balance-text')).toHaveText(`Solde médailles : ${fmt(fin.save.bleu.solde)}`);
    await expect(page.locator('#end-balance svg.hud-medaille')).toHaveCount(1);
    await expect(page.locator('#end-bleu-text')).toHaveText(`+${fmt(fin.save.bleu.run)}`);
    await expect(page.locator('#end-medailles-solde')).toBeVisible();
    await expect(page.locator('#end-medailles-solde-text')).toHaveText(`Solde diamants : ${fmt(fin.save.medailles.solde)}`);
    await expect(page.locator('#end-medailles-solde svg.hud-gem')).toHaveCount(1);
    await expect(page.locator('#end-medailles-text')).toHaveText(`+${fmt(fin.save.medailles.run.total)}`);
    expect([await couleur(page.locator('#end-balance')), await couleur(page.locator('#end-medailles-solde'))]).toEqual([BRONZE, BLEU]);
  });

  test('Boutique en diamants (gemme, « Il manque N diamants », nom accessible), Inventaire et Fusion en médailles (« Il manque N médailles »)', async ({ page }) => {
    test.setTimeout(120_000);
    await poserProgression(page, progressionDemo({ bleu: 10, medailles: 40 }));
    await ouvrirMenu(page);
    await page.locator('#menu-onglet-boutique').click();
    await expect(page.locator('#menu-ecran-boutique')).toBeVisible();
    const un = page.locator('.e3-carte').first().locator('.e3-ouvrir').first();
    await expect(un.locator('svg.e3-ouvrir-gemme')).toHaveCount(1);
    await expect(un.locator('.e3-ouvrir-prix')).toHaveText('Il manque 60 diamants');
    await expect(un).toHaveAccessibleName('Ouvrir ×1 · prix en diamants : Il manque 60 diamants');
    await expect(un).toHaveAccessibleDescription(/Diamants insuffisants : prix 100 \/ 1.000, solde 40\./);
    await page.locator('#menu-onglet-personnage').click();
    await page.locator('#menu-perso-inventaire').click();
    await page.locator('#menu-objet-o5').click();
    await expect(page.locator('#menu-inventaire-ameliorer')).toHaveText('Il manque 30 médailles');
    await expect(page.locator('#menu-inventaire-ameliorer')).toHaveAccessibleDescription('Médailles insuffisantes : prix 40, solde 10.');
    await ouvrirMenu(page); // la progression reste celle posée (le menu n'a rien écrit)
    await page.locator('#menu-onglet-personnage').click();
    await page.locator('#menu-perso-fusion').click();
    await page.locator('#menu-fusion-objet-o5').click();
    await page.locator('#menu-fusion-auto').click();
    await expect(page.locator('#menu-fusion-message')).toHaveText('Fusion possible, mais il manque 90 médailles. Coût : 100');
    await expect(page.locator('#menu-fusion-fusionner')).toHaveText('Il manque 90 médailles');
  });
});

// Garantie 6 : Recette (V0.8, `git archive origin/main`) et dev (arbre de travail) sur la MÊME origine, avec zs.save.v2 partagée : la V0.8 garde ses
// anciens noms (le champ « bleu » y est « Diamants ») et ne peut ni défaire ni faire perdre quoi que ce soit ; chaque côté ajoute ses gains.
test.describe('Recette V0.8 et dev sur la même origine (garantie 6)', () => {
  test.skip(({ isMobile }) => isMobile, 'bureau seulement (deux versions du jeu chargées)');
  let server = null;
  let dir = null;
  const PORT = 4192;
  const BASE = `http://127.0.0.1:${PORT}`;
  test.beforeAll(async () => {
    const { execSync } = await import('node:child_process');
    const { mkdtempSync, mkdirSync, symlinkSync } = await import('node:fs');
    const { tmpdir } = await import('node:os');
    const { join } = await import('node:path');
    try {
      execSync('git rev-parse --verify --quiet origin/main', { stdio: 'ignore' });
      if (!JSON.parse(execSync('git show origin/main:versions.json', { encoding: 'utf8' })).latest.startsWith('v0.8')) return;
    } catch {
      return;
    }
    dir = mkdtempSync(join(tmpdir(), 'zs-9a-'));
    mkdirSync(join(dir, 'Recette'));
    execSync(`git archive origin/main | tar -x -C "${join(dir, 'Recette')}"`, { stdio: 'ignore', shell: '/bin/bash' });
    symlinkSync(process.cwd(), join(dir, 'dev'), 'dir');
    const { startServer } = await import('../../scripts/site/serve.mjs');
    server = await startServer({ root: dir, port: PORT, base: '/', quiet: true });
  });
  test.afterAll(async () => {
    server?.close();
    if (dir) (await import('node:fs')).rmSync(dir, { recursive: true, force: true });
  });
  const menu = async (page, version) => {
    await page.goto(`${BASE}/${version}/jeu.html?test=1&menu=1&seed=1&ouverture=0&store=local`);
    await expect(page.locator('#menu-jouer')).toBeVisible({ timeout: 60_000 });
    return [await page.locator('#menu-solde .sr-only').textContent(), await page.locator('#menu-medailles .sr-only').textContent()];
  };
  const manche = async (page, version) => {
    await page.goto(`${BASE}/${version}/jeu.html?test=1&store=local&seed=1`);
    await waitReady(page);
    await page.evaluate(() => { const zs = window.__zs; window.requestAnimationFrame = () => 0; zs.step(3.2); zs.skipWave(); zs.step(0.3); zs.flushSave(); });
  };

  test('V0.8 → dev → V0.8 → dev : mêmes champs, noms d\'écran propres à chaque version, aucun solde perdu, aucune interversion défaite', async ({ page }) => {
    test.skip(server === null, 'origin/main absent ou pas en V0.8 : versions côte à côte impossibles');
    test.setTimeout(240_000);
    await page.setViewportSize(SIZE);
    await page.goto(`${BASE}/dev/sauvegarde.html`);
    await page.evaluate(([k, v]) => localStorage.setItem(k, v), [CLE_V2, JSON.stringify(departV08())]);
    // 1. Recette V0.8 : ses anciens noms (champ bleu = « Diamants », champ medailles = « Médailles ») ; une manche : +20 au champ bleu.
    expect(await menu(page, 'Recette')).toEqual([`Diamants : ${fmt(1034)}`, 'Médailles : 467']);
    await manche(page, 'Recette');
    let s = await stored(page);
    expect([solde(s), soldeMedailles(s)]).toEqual([1054, 467]);
    // 2. dev (V0.9) : mêmes valeurs, noms intervertis (champ bleu = « Médailles », champ medailles = « Diamants ») ; une manche : +20 médailles.
    expect(await menu(page, 'dev')).toEqual([`Médailles : ${fmt(1054)}`, 'Diamants : 467']);
    await manche(page, 'dev');
    s = await stored(page);
    expect([solde(s), soldeMedailles(s)]).toEqual([1074, 467]);
    // 3. La Recette relit et réécrit : rien de perdu, rien d'échangé.
    expect(await menu(page, 'Recette')).toEqual([`Diamants : ${fmt(1074)}`, 'Médailles : 467']);
    await manche(page, 'Recette');
    s = await stored(page);
    expect([solde(s), soldeMedailles(s), s.medailles.gagne, s.medailles.depense]).toEqual([1094, 467, 567, 100]);
    // 4. dev : tout est là, une seule interversion (à l'écran).
    expect(await menu(page, 'dev')).toEqual([`Médailles : ${fmt(1094)}`, 'Diamants : 467']);
  });
});
