// Lot 5l-C : menu de débogage de la pause (icône « Débogage » à côté du son, à sa gauche, panneau E2-13 de js/game/debug-menu.js, import dynamique au premier clic).
// Sites : le dépôt (http://localhost:4173, canal source) et le site assemblé de test (http://127.0.0.1:4174/full/dev/, canal dev ; scripts/site/e2e-site.mjs).
// 667×375 (défilement interne, en-tête visible), 1440×900 et 375×812 ; step() et hooks sous ?test=1. Sans icône sur les canaux refusés : canal.spec.js.
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { waitReady } from './helpers.js';

const DEV = 'http://127.0.0.1:4174/full/dev/jeu.html';
const GL_DRIVER = /^\[\.WebGL-[0-9a-fx]+\]GL Driver Message/;
const S = (page) => page.evaluate(() => window.__zs.getState());

function watch(page) {
  const problems = [];
  const external = [];
  const files = [];
  page.on('console', (m) => ['error', 'warning'].includes(m.type()) && !GL_DRIVER.test(m.text()) && problems.push(m.text()));
  page.on('pageerror', (e) => problems.push(e.message));
  page.on('response', (r) => r.status() >= 400 && problems.push(`${r.status()} ${r.url()}`));
  page.on('request', (r) => {
    const url = r.url();
    if (url.startsWith('http://localhost:4173/') || url.startsWith('http://127.0.0.1:4174/')) files.push(new URL(url).pathname);
    else if (!url.startsWith('data:') && !url.startsWith('blob:')) external.push(url);
  });
  return { problems, external, files };
}

async function waitGame(page) {
  await expect(page.locator('#game-root')).toBeVisible({ timeout: 60_000 });
  await expect(page.locator('#hud-chrono-text')).not.toHaveText('', { timeout: 30_000 });
}

async function openDebug(page) {
  await page.locator('#btn-pause').click();
  await page.getByRole('button', { name: 'Débogage', exact: true }).click();
  await expect(page.locator('#debug-panel')).toBeVisible();
}

// Saisie dans un champ numérique, validée par Tab (événement change).
async function type(page, id, value) {
  await page.locator(id).fill(value);
  await page.locator(id).press('Tab');
}

// Contrôles du panneau trop petits (moins de 44 px de haut ; icônes et −/+ moins de 44 px de large) et textes de moins de 14 px.
const sizes = (page) => page.evaluate(() => {
  const panel = document.getElementById('debug-panel');
  const small = [...panel.querySelectorAll('button, input')].filter((n) => n.getClientRects().length).map((n) => [n.id || n.textContent, n.getBoundingClientRect()])
    .filter(([, r]) => r.height < 43.5 || r.width < 43.5).map(([id]) => id);
  const tiny = [...panel.querySelectorAll('p, span, h2, h3, button, input')].filter((n) => n.getClientRects().length && parseFloat(getComputedStyle(n).fontSize) < 14).map((n) => n.id || n.className);
  return { small, tiny };
});

test.describe('667×375 (canal source)', () => {
  test.use({ viewport: { width: 667, height: 375 } });

  test('icône à côté du son, à sa gauche (44 × 44, « Débogage »), panneau ouvert au premier clic (debug-menu.js demandé alors, une fois) ; défilement interne, en-tête visible ; 44 px, 14 px ; axe ; Échap et focus ; clavier', async ({ page }) => {
    test.setTimeout(120_000);
    const { problems, external, files } = watch(page);
    await page.goto('/jeu.html?test=1&seed=1&nospawn=1');
    await waitReady(page);
    await page.locator('#btn-pause').click();
    const boxes = await page.evaluate(() => Object.fromEntries(['btn-sound', 'btn-debug'].map((id) => [id, document.getElementById(id).getBoundingClientRect().toJSON()])));
    const [sound, debug] = [boxes['btn-sound'], boxes['btn-debug']];
    expect([Math.round(debug.width), Math.round(debug.height)]).toEqual([44, 44]);
    expect(Math.abs(debug.top - sound.top)).toBeLessThanOrEqual(1);
    expect(sound.left - debug.right).toBeGreaterThanOrEqual(0); // juste à gauche du son, qui reste en haut à droite
    expect(sound.left - debug.right).toBeLessThanOrEqual(16);
    expect(files).not.toContain('/js/game/debug-menu.js');
    await page.getByRole('button', { name: 'Débogage', exact: true }).click();
    await expect(page.locator('#debug-panel')).toBeVisible();
    await expect(page.locator('#debug-panel')).toHaveAttribute('data-block', 'E2-13');
    await expect(page.locator('#pause-panel')).toBeHidden();
    expect(files.filter((f) => f === '/js/game/debug-menu.js')).toHaveLength(1);
    await expect(page.locator('#debug-close')).toBeFocused();
    // Retours du propriétaire (lot 5l-E) : Mesure en premier, visible dès l'ouverture ; encadré du mode essai sur la ligne du titre « Partie ».
    expect(await page.evaluate(() => [...document.querySelectorAll('#debug-scroll h3')].map((h) => h.textContent))).toEqual(['Mesure', 'Partie']);
    for (const id of ['#debug-perf-true', '#debug-cap-60']) await expect(page.locator(id), id).toBeInViewport({ ratio: 1 });
    const line = await page.evaluate(() => {
      const r = (id) => document.getElementById(id).getBoundingClientRect();
      const [h, n] = [r('debug-section-partie'), r('debug-note')];
      return { sameLine: n.top < h.bottom && n.bottom > h.top, right: n.left >= h.right };
    });
    expect(line).toEqual({ sameLine: true, right: true });
    // Défilement interne : la région défile, l'en-tête et le pied restent dans la fenêtre ; la dernière ligne est atteignable.
    const scroll = page.locator('#debug-scroll');
    await expect(scroll).toHaveAttribute('role', 'region');
    await expect(scroll).toHaveAttribute('aria-label', 'Réglages de débogage');
    expect(await scroll.evaluate((n) => n.scrollHeight > n.clientHeight + 40)).toBe(true);
    await scroll.evaluate((n) => { n.scrollTop = n.scrollHeight; });
    for (const id of ['#debug-title', '#debug-close', '#debug-fin-true', '#debug-apply', '#debug-normal']) await expect(page.locator(id), id).toBeInViewport({ ratio: 1 });
    const page2 = await page.evaluate(() => [document.documentElement.scrollWidth - innerWidth, document.documentElement.scrollHeight - innerHeight]);
    expect(page2).toEqual([0, 0]);
    expect(await sizes(page)).toEqual({ small: [], tiny: [] });
    const axe = await new AxeBuilder({ page }).include('#debug-panel').analyze();
    expect(axe.violations.map((v) => v.id)).toEqual([]);
    // Clavier : focus piégé (Maj+Tab depuis la croix va au dernier contrôle), Échap ferme et rend le focus à l'icône.
    await scroll.evaluate((n) => { n.scrollTop = 0; });
    await page.locator('#debug-close').focus();
    await page.keyboard.press('Shift+Tab');
    await expect(page.locator('#debug-normal')).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(page.locator('#debug-close')).toBeFocused();
    // Dans un champ, P et M ne commandent pas la partie (pause, son).
    await page.locator('#debug-wave').focus();
    await page.keyboard.press('KeyP');
    await page.keyboard.press('KeyM');
    await expect(page.locator('#debug-panel')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('#debug-panel')).toBeHidden();
    await expect(page.locator('#pause-panel')).toBeVisible();
    await expect(page.locator('#btn-debug')).toBeFocused();
    // Réouverture : le module n'est pas redemandé ; la croix ferme aussi.
    await page.locator('#btn-debug').click();
    await page.locator('#debug-close').click();
    await expect(page.locator('#btn-debug')).toBeFocused();
    expect(files.filter((f) => f === '/js/game/debug-menu.js')).toHaveLength(1);
    expect(external).toEqual([]);
    expect(problems).toEqual([]);
  });

  test('manche 12, argent 500, « Tous au niveau 3 », sans zombies → « Appliquer et recharger » (confirmation) : adresse, manche, argent, niveaux, aucun zombie, mode essai ; « Revenir au jeu normal » retire les paramètres', async ({ page }) => {
    test.setTimeout(150_000);
    await page.goto('/jeu.html?test=1&seed=1&v=3&gfx=eleve');
    await waitReady(page);
    await openDebug(page);
    await type(page, '#debug-wave', '12');
    await type(page, '#debug-money', '500');
    for (let i = 0; i < 3; i += 1) await page.locator('#debug-all-plus').click();
    await expect(page.locator('#debug-stat-chutes')).toHaveValue('3');
    await page.locator('#debug-nospawn-true').click();
    await expect(page.locator('#debug-nospawn-true')).toHaveAttribute('aria-pressed', 'true');
    const target = 'jeu.html?test=1&seed=1&v=3&gfx=eleve&wave=12&money=500&lvl=all:3&nospawn=1';
    await expect(page.locator('#debug-url')).toHaveText(`Adresse : ${target}`);
    await page.locator('#debug-apply').click();
    await expect(page.locator('#debug-confirm-text')).toHaveText('Recharger la page ? Cette partie sera perdue.');
    await expect(page.locator('#debug-confirm-cancel')).toBeFocused();
    // Annuler ne recharge pas ; Échap ferme d'abord la confirmation.
    await page.locator('#debug-confirm-cancel').click();
    await expect(page.locator('#debug-confirm')).toBeHidden();
    await page.locator('#debug-apply').click();
    await page.keyboard.press('Escape');
    await expect(page.locator('#debug-confirm')).toBeHidden();
    await expect(page.locator('#debug-panel')).toBeVisible();
    await page.locator('#debug-apply').click();
    await Promise.all([page.waitForURL(`**/${target}`), page.locator('#debug-confirm-ok').click()]);
    expect(page.url()).toBe(`http://localhost:4173/${target}`);
    await waitReady(page);
    await page.evaluate(() => window.__zs.step(5));
    const s = await S(page);
    // Sans zombies : directeur inactif (getState().waves.wave vaut alors 0) ; la manche 12 se lit dans ses multiplicateurs (comparés au jeu normal plus bas).
    expect([s.waves.active, s.waves.phase]).toEqual([false, 'inactif']);
    expect(s.enemies).toEqual([]);
    expect(s.save).toMatchObject({ readOnly: true, status: 'readonly', balance: 500 });
    expect(s.save.reasons).toEqual(expect.arrayContaining(['wave', 'money', 'lvl', 'nospawn']));
    expect(s.stats.levels).toEqual({ degats: 3, portee: 3, precision: 3, cadence: 3, vitesse: 3, vie: 3, regen: 3 });
    expect(s.stats.extraLevels).toEqual({ chutes: 3, reparation: 3 });
    await expect(page.locator('#hud-trial')).toBeVisible();
    // Préremplissage depuis l'adresse, puis retour au jeu normal (paramètres non gérés conservés).
    await openDebug(page);
    await expect(page.locator('#debug-wave')).toHaveValue('12');
    await expect(page.locator('#debug-money')).toHaveValue('500');
    await expect(page.locator('#debug-all')).toHaveValue('3');
    await page.locator('#debug-normal').click();
    await Promise.all([page.waitForURL('**/jeu.html?test=1&seed=1&v=3&gfx=eleve'), page.locator('#debug-confirm-ok').click()]);
    await waitReady(page);
    const n = await S(page);
    expect([n.save.readOnly, n.waves.active, n.waves.wave]).toEqual([false, true, 1]);
    expect(s.waves.hpMul).toBeGreaterThan(n.waves.hpMul); // manche 12 > manche 1
    await expect(page.locator('#hud-trial')).toBeHidden();
  });

  test('Mesure : panneau de mesure et plafond 30 appliqués après rechargement (perf et cap hors du mode essai)', async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto('/jeu.html?test=1&seed=1');
    await waitReady(page);
    await openDebug(page);
    await page.locator('#debug-perf-true').click();
    await page.locator('#debug-cap-30').click();
    await page.locator('#debug-apply').click();
    await Promise.all([page.waitForURL('**/jeu.html?test=1&seed=1&perf=1&cap=30'), page.locator('#debug-confirm-ok').click()]);
    await waitReady(page);
    await expect(page.locator('#perf-panel')).toBeVisible();
    const s = await S(page);
    expect(s.perf.cap).toMatchObject({ value: 30 });
    expect([s.save.readOnly, s.save.reasons]).toEqual([false, []]);
  });
});

for (const viewport of [{ width: 1440, height: 900 }, { width: 375, height: 812 }]) {
  test(`${viewport.width}×${viewport.height}, canal dev (site assemblé, sans ?test=1) : icône visible, panneau atteignable en entier, manche 12 sans zombies appliquée ; console propre`, async ({ page }) => {
    test.setTimeout(120_000);
    await page.setViewportSize(viewport);
    const { problems, external } = watch(page);
    await page.goto(`${DEV}?v=4`);
    await page.locator('#menu-jouer').click({ timeout: 60_000 }); // lot 8a : sans paramètre de Partie, le jeu s'ouvre sur le menu
    await waitGame(page);
    await openDebug(page);
    await page.locator('#debug-scroll').evaluate((n) => { n.scrollTop = n.scrollHeight; });
    for (const id of ['#debug-title', '#debug-fin-true', '#debug-apply']) await expect(page.locator(id), id).toBeInViewport({ ratio: 1 });
    expect(await sizes(page)).toEqual({ small: [], tiny: [] });
    await page.locator('#debug-scroll').evaluate((n) => { n.scrollTop = 0; });
    await type(page, '#debug-wave', '12');
    await page.locator('#debug-nospawn-true').click();
    await page.locator('#debug-apply').click();
    await Promise.all([page.waitForURL(`${DEV}?v=4&wave=12&nospawn=1`), page.locator('#debug-confirm-ok').click()]);
    await waitGame(page);
    await expect(page.locator('#hud-trial')).toBeVisible();
    await expect(page.locator('#hud-wave')).toHaveAttribute('data-idle', 'true');
    expect(external).toEqual([]);
    expect(problems).toEqual([]);
  });
}
