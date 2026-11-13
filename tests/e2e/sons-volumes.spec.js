// Lot 8i-E : volumes du jeu et de la musique (Options du menu E5 et de la partie E2-12, même composant ; Docs/ref/sons-menu.md).
// ?test=1&menu=1 ; l'état des gains (window.__zsMenu.sons().gains, window.__zs.getState().audio) remplace l'écoute. Réglages du menu appliqués
// tout de suite aux sons du menu et à la partie après « JOUER » ; « Son coupé » coupe tout ; curseurs au clavier ; 932 × 430, 667 × 375 et
// téléphone à encoche simulé ; axe ; rien n'est écrit. Projets bureau et mobile (paysage ; mobile : les tests « tailles »).
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const REF = { width: 932, height: 430 };
const PETIT = { width: 667, height: 375 };
const ENCOCHE = { width: 762, height: 351 };
const BRUIT = /GL Driver Message|GPU stall|swiftshader|WebGL/i;
const sons = (page) => page.evaluate(() => window.__zsMenu.sons());
const audioPartie = (page) => page.evaluate(() => window.__zs.getState().audio);

async function ouvrirMenu(page, size = REF, encoche = false) {
  if (encoche) await page.addInitScript(() => document.addEventListener('DOMContentLoaded', () => {
    const s = document.createElement('style');
    s.textContent = '#e8 { --e8-gauche: 50px !important; --e8-droite: 50px !important; }';
    document.head.append(s);
  }));
  await page.addInitScript(() => {
    window.__ecritures = [];
    for (const m of ['setItem', 'removeItem', 'clear']) {
      const natif = Storage.prototype[m];
      Storage.prototype[m] = function ecrire(...args) {
        window.__ecritures.push(m);
        return natif.apply(this, args);
      };
    }
  });
  await page.setViewportSize(size);
  await page.goto('/jeu.html?test=1&menu=1&seed=1&ouverture=0');
  await expect(page.locator('#menu-jouer')).toBeVisible({ timeout: 60_000 });
  await page.waitForFunction(() => window.__zsMenu?.etat()?.menu !== null && !document.getElementById('e7'));
}
async function ouvrirOptions(page) {
  await page.locator('#menu-trois-barres').click();
  await page.locator('#menu-options').click();
  await expect(page.locator('#menu-ecran-options')).toBeVisible();
}
const fleches = async (page, sel, touche, n) => {
  await page.locator(sel).focus();
  for (let i = 0; i < n; i += 1) await page.keyboard.press(touche);
};

test.describe('volumes du jeu et de la musique', () => {
  for (const [size, encoche] of [[REF, false], [PETIT, false], [ENCOCHE, true]]) {
    test(`tailles ${size.width}×${size.height}${encoche ? ' (encoche simulée)' : ''} : section Son = Son, Volume du jeu, Volume de la musique ; curseurs nommés, dans l'écran, 44 px ; axe`, async ({ page }) => {
      await ouvrirMenu(page, size, encoche);
      await ouvrirOptions(page);
      const lignes = page.locator('.e5-section[data-section="son"] .e5-ligne');
      await expect(lignes).toHaveCount(3);
      expect(await lignes.evaluateAll((ns) => ns.map((n) => n.dataset.option))).toEqual(['son', 'son-niveau', 'son-musique']);
      await expect(page.locator('#options-volume')).toHaveAccessibleName('Volume du jeu');
      await expect(page.locator('#options-volume-musique')).toHaveAccessibleName('Volume de la musique');
      for (const sel of ['#options-volume', '#options-volume-musique']) {
        await expect(page.locator(sel)).toHaveAttribute('min', '0');
        await expect(page.locator(sel)).toHaveAttribute('max', '100');
        await expect(page.locator(sel)).toHaveAttribute('step', '10');
        await expect(page.locator(sel)).toHaveAttribute('aria-valuetext', '100 %');
        await page.locator(sel).scrollIntoViewIfNeeded();
        const r = await page.locator(sel).boundingBox();
        expect(Math.round(r.height), sel).toBeGreaterThanOrEqual(44);
        expect(Math.round(r.width), sel).toBeGreaterThanOrEqual(44);
        const marge = encoche ? 50 : 0;
        expect(r.x, sel).toBeGreaterThanOrEqual(marge - 0.5);
        expect(r.x + r.width, sel).toBeLessThanOrEqual(size.width - marge + 0.5);
      }
      await expect(page.locator('#options-volume-valeur')).toHaveText('100 %');
      await expect(page.locator('#options-volume-musique-valeur')).toHaveText('100 %');
      // Chaque ligne : nom à gauche, valeurs à droite, sans chevauchement entre lignes.
      const boites = await lignes.evaluateAll((ns) => ns.map((n) => {
        const r = n.getBoundingClientRect();
        return { t: r.top, b: r.bottom };
      }));
      for (let i = 1; i < boites.length; i += 1) expect(boites[i].t).toBeGreaterThanOrEqual(boites[i - 1].b - 0.5);
      await page.locator('#options-scroll').evaluate((n) => { n.scrollTop = 0; });
      const axe = await new AxeBuilder({ page }).include('#e8').analyze();
      expect(axe.violations.map((v) => `${v.id} : ${v.nodes.map((n) => n.target).join(', ')}`)).toEqual([]);
    });
  }

  test('menu : curseurs au clavier, appliqués tout de suite aux sons du menu (effets et musique séparés) ; « Son coupé » coupe tout (musique arrêtée, clic refusé), « Activé » rétablit ; rien n\'est écrit', async ({ page, baseURL }) => {
    const problemes = [];
    const externes = [];
    page.on('console', (m) => ['error', 'warning'].includes(m.type()) && !BRUIT.test(m.text()) && problemes.push(m.text()));
    page.on('pageerror', (e) => problemes.push(e.message));
    page.on('request', (r) => !r.url().startsWith(baseURL) && !r.url().startsWith('data:') && !r.url().startsWith('blob:') && externes.push(r.url()));
    await ouvrirMenu(page);
    await ouvrirOptions(page); // premier geste : moteur des sons et musique
    await page.waitForFunction(() => window.__zsMenu.sons().musique.lecteur?.enMarche === true && window.__zsMenu.sons().pretes.includes('clic'), null, { timeout: 60_000 });
    expect((await sons(page)).gains).toEqual({ effets: 1, musique: 1 });
    // Volume du jeu au clavier : 100 → 70 ; la musique ne bouge pas.
    await fleches(page, '#options-volume', 'ArrowLeft', 3);
    await expect(page.locator('#options-volume')).toHaveValue('70');
    await expect(page.locator('#options-volume')).toHaveAttribute('aria-valuetext', '70 %');
    await expect(page.locator('#options-volume-valeur')).toHaveText('70 %');
    let s = await sons(page);
    expect(s.gains.effets).toBeCloseTo(0.7, 6);
    expect(s.gains.musique).toBe(1);
    expect(s.volumes).toEqual({ coupe: false, jeu: 70, musique: 100 });
    // Volume de la musique au clavier : 100 → 40, puis Début (0) et Fin (100) ; les effets ne bougent pas.
    await fleches(page, '#options-volume-musique', 'ArrowLeft', 6);
    await expect(page.locator('#options-volume-musique-valeur')).toHaveText('40 %');
    s = await sons(page);
    expect(s.gains.musique).toBeCloseTo(0.4, 6);
    expect(s.gains.effets).toBeCloseTo(0.7, 6);
    await page.keyboard.press('Home');
    expect((await sons(page)).gains.musique).toBe(0);
    await expect(page.locator('#options-volume-musique')).toHaveAttribute('aria-valuetext', '0 %');
    await page.keyboard.press('End');
    await page.keyboard.press('ArrowLeft');
    expect((await sons(page)).gains.musique).toBeCloseTo(0.9, 6);
    await fleches(page, '#options-volume-musique', 'ArrowLeft', 5);
    expect((await sons(page)).gains.musique).toBeCloseTo(0.4, 6);
    // « Son coupé » : tout à zéro, musique arrêtée, plus aucun son joué ; l'état reste lisible (bouton pressé, texte).
    await page.locator('#options-son-coupe').click();
    await expect(page.locator('#options-son-coupe')).toHaveAttribute('aria-pressed', 'true');
    await page.waitForFunction(() => window.__zsMenu.sons().musique.mode === 'arret');
    s = await sons(page);
    expect(s.gains).toEqual({ effets: 0, musique: 0 });
    expect(await page.evaluate(() => window.__ecritures)).toEqual([]); // son et volumes : en mémoire, rien n'est écrit
    const n = s.journal.length;
    await page.locator('#options-preset-moyen').click(); // (le préréglage, lui, écrit zs.device.v1 comme avant)
    await page.waitForTimeout(100);
    s = await sons(page);
    expect(s.journal.slice(n).filter((e) => e.son).map((e) => [e.son, e.joue, e.raison])).toEqual([['clic', false, 'coupe']]);
    // « Activé » : gains et musique rétablis aux valeurs réglées.
    await page.locator('#options-son-active').click();
    await page.waitForFunction(() => window.__zsMenu.sons().musique.mode === 'joue');
    s = await sons(page);
    expect(s.gains.effets).toBeCloseTo(0.7, 6);
    expect(s.gains.musique).toBeCloseTo(0.4, 6);
    expect(await page.evaluate(() => window.__ecritures.filter((m) => m !== 'setItem'))).toEqual([]);
    expect(problemes).toEqual([]);
    expect(externes).toEqual([]);
  });

  test('réglages du menu appliqués à la partie après « JOUER » : volume du jeu et volume de la musique séparés ; en partie, les deux curseurs et « Son coupé » règlent les gains', async ({ page }) => {
    test.setTimeout(180_000);
    await ouvrirMenu(page);
    await ouvrirOptions(page);
    await fleches(page, '#options-volume', 'ArrowLeft', 3); // jeu : 70
    await fleches(page, '#options-volume-musique', 'ArrowLeft', 6); // musique : 40
    await page.locator('#options-retour').click();
    await page.locator('#menu-jouer').click();
    await page.waitForFunction(() => (window.__zs?.getState()?.time ?? 0) > 0.05, null, { timeout: 120_000 });
    let a = await audioPartie(page);
    expect(a).toMatchObject({ muted: false, volume: 70, musicVolume: 40 });
    // Gains généraux de la partie : gain de data/game/audio.json (0,8) × volume.
    expect(a.gains.effets).toBeCloseTo(0.8 * 0.7, 6);
    expect(a.gains.musique).toBeCloseTo(0.8 * 0.4, 6);
    // En partie : Options de la pause, mêmes curseurs.
    await page.locator('#btn-pause').dispatchEvent('click');
    await page.locator('#btn-options').click();
    await expect(page.locator('#options-panel')).toBeVisible();
    await expect(page.locator('#options-volume')).toHaveValue('70');
    await expect(page.locator('#options-volume-musique')).toHaveValue('40');
    await expect(page.locator('#options-volume-musique')).toHaveAccessibleName('Volume de la musique');
    await fleches(page, '#options-volume-musique', 'ArrowRight', 2);
    a = await audioPartie(page);
    expect(a).toMatchObject({ volume: 70, musicVolume: 60 });
    expect(a.gains.musique).toBeCloseTo(0.8 * 0.6, 6);
    expect(a.gains.effets).toBeCloseTo(0.8 * 0.7, 6);
    await fleches(page, '#options-volume', 'ArrowRight', 1);
    expect((await audioPartie(page)).volume).toBe(80);
    expect((await audioPartie(page)).musicVolume).toBe(60);
    await page.locator('#options-son-coupe').click();
    a = await audioPartie(page);
    expect(a.muted).toBe(true);
    expect(a.gains).toEqual({ effets: 0, musique: 0 });
    await page.locator('#options-son-active').click();
    a = await audioPartie(page);
    expect(a.gains.effets).toBeCloseTo(0.8 * 0.8, 6);
    expect(a.gains.musique).toBeCloseTo(0.8 * 0.6, 6);
    const axe = await new AxeBuilder({ page }).include('#options-panel').analyze();
    expect(axe.violations.map((v) => `${v.id} : ${v.nodes.map((n) => n.target).join(', ')}`)).toEqual([]);
  });

  test('« Son coupé » dans le menu, puis « JOUER » : la partie démarre coupée (effets et musique à zéro)', async ({ page }) => {
    test.setTimeout(180_000);
    await ouvrirMenu(page);
    await ouvrirOptions(page);
    await page.locator('#options-son-coupe').click();
    await page.locator('#options-retour').click();
    await page.locator('#menu-jouer').click();
    await page.waitForFunction(() => (window.__zs?.getState()?.time ?? 0) > 0.05, null, { timeout: 120_000 });
    const a = await audioPartie(page);
    expect(a.muted).toBe(true);
    expect(a.gains).toEqual({ effets: 0, musique: 0 });
  });
});
