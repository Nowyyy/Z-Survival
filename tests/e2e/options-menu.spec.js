// Lot 8c : page Options du menu principal (E5, composant partagé avec la partie : Docs/ref/menu-principal.md, Docs/ref/options-graphiques.md).
// ?test=1&menu=1 ; 932 × 430 (référence), 667 × 375, 1440 × 900 ; projets bureau et mobile (paysage, Auto = Moyen sur un pointeur grossier).
// Ouverture depuis le menu à trois barres, retour par « ‹ Menu » et par Échap à l'onglet d'origine ; préréglages et passage sur Perso ; notes ;
// section Son ; réglages pris par la partie après « JOUER » ; aucun fichier de Three.js ni du jeu chargé ; zs.device.v1 dans ses seuls champs.
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const REF = { width: 932, height: 430 };
const SIZES = [REF, { width: 667, height: 375 }, { width: 1440, height: 900 }];
const DEVICE = 'zs.device.v1';
const SAVE = 'zs.save.v1';
const BRUIT = /GL Driver Message|GPU stall|swiftshader|WebGL/i; // messages du rendu logiciel de Chromium, sans rapport avec la page
const JEU = /\/vendor\/three\/|\/js\/game\/(main|game|world|lamps|lights)\.js$|\/data\/game\/(textures|sounds|world|lumieres)\.json$|\/maps\//;

function surveiller(page, baseURL) {
  const problemes = [];
  const externes = [];
  const fichiers = [];
  page.on('console', (m) => ['error', 'warning'].includes(m.type()) && !BRUIT.test(m.text()) && problemes.push(m.text()));
  page.on('pageerror', (e) => problemes.push(e.message));
  page.on('request', (r) => {
    const u = r.url();
    if (u.startsWith(baseURL)) fichiers.push(new URL(u).pathname);
    else if (!u.startsWith('data:') && !u.startsWith('blob:')) externes.push(u);
  });
  return { problemes, externes, fichiers };
}

async function ouvrirMenu(page, size = REF, extra = '') {
  await page.setViewportSize(size);
  await page.goto(`/jeu.html?test=1&menu=1&seed=1${extra}`);
  await expect(page.locator('#menu-jouer')).toBeVisible({ timeout: 60_000 });
  await page.waitForFunction(() => window.__zsMenu?.etat()?.menu !== null && !document.getElementById('e7'));
}

async function ouvrirOptions(page) {
  await page.locator('#menu-trois-barres').click();
  await page.locator('#menu-options').click();
  await expect(page.locator('#menu-ecran-options')).toBeVisible();
}

const boite = (page, sel) => page.locator(sel).evaluate((n) => {
  const r = n.getBoundingClientRect();
  return { l: r.left, t: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height };
});
const chevauche = (x, y) => x.l < y.r - 0.5 && y.l < x.r - 0.5 && x.t < y.b - 0.5 && y.t < x.b - 0.5;
const presse = (page, sel) => page.locator(sel).evaluateAll((ns) => ns.filter((n) => n.getAttribute('aria-pressed') === 'true').map((n) => n.dataset.value ?? n.dataset.preset));

test.describe('page Options du menu (E5)', () => {
  for (const size of SIZES) {
    test(`${size.width}×${size.height} : écran plein (en-tête gardé, onglets masqués) ; bandeau, « ‹ Menu », préréglages « Auto · détecté », note ; sections Son, Image, Carte, Personnages, Lumières ; pied ; rien hors de l'écran ni superposé ; 44 px ; axe ; console propre`, async ({ page, baseURL, isMobile }) => {
      const o = surveiller(page, baseURL);
      await ouvrirMenu(page, size);
      await ouvrirOptions(page);
      await expect(page.locator('#e8')).toHaveAttribute('data-ecran', 'options');
      await expect(page.locator('.e8-onglets')).toBeHidden();
      await expect(page.locator('#menu-ecran-jouer')).toBeHidden();
      await expect(page.locator('.e8-entete')).toBeVisible();
      await expect(page.locator('#menu-ecran-options')).toHaveAttribute('data-block', 'E5');
      await expect(page.locator('#options-title')).toHaveText('Options');
      await expect(page.locator('#menu-ecran-options .menu-bandeau-libelle')).toHaveText('Réglages');
      await expect(page.locator('#options-retour')).toHaveAccessibleName('Retour au menu');
      await expect(page.locator('#options-retour')).toHaveText('Menu');
      await expect(page.locator('#options-retour')).toHaveClass(/menu-planche/);
      const detecte = isMobile ? 'Moyen' : 'Élevé';
      await expect(page.locator('#options-preset-auto')).toHaveText(`Auto · ${detecte}`);
      await expect(page.locator('#options-preset-auto')).toHaveAttribute('aria-pressed', 'true');
      for (const p of ['faible', 'moyen', 'eleve', 'perso']) await expect(page.locator(`#options-preset-${p}`)).toHaveAttribute('aria-pressed', 'false');
      await expect(page.locator('#options-presets')).toHaveAttribute('role', 'group');
      await expect(page.locator('#options-presets')).toHaveAccessibleName('Préréglage');
      await expect(page.locator('#options-presets-note')).toHaveText('Modifier un réglage passe sur Perso');
      await expect(page.locator('.e5-section-titre')).toHaveText(['Son', 'Image', 'Carte', 'Personnages', 'Lumières']);
      await expect(page.locator('#options-pied')).toHaveText('↻ = s\'applique au lancement de la prochaine partie (dans une partie, ces réglages sont verrouillés).');
      await expect(page.locator('#options-scroll')).toHaveAttribute('role', 'region');
      // Tout est modifiable depuis le menu : aucun bouton désactivé, aucun cadenas.
      expect(await page.locator('#menu-ecran-options button:disabled').count()).toBe(0);
      expect(await page.locator('.e5-ligne.is-verrou').count()).toBe(0);
      // Disposition : en-tête, bandeau et retour, préréglages, liste, pied : dans l'écran, sans superposition ; la liste défile.
      const parts = { entete: await boite(page, '.e8-entete'), tete: await boite(page, '#menu-ecran-options .e5-tete'), presets: await boite(page, '#menu-ecran-options .e5-presets'), liste: await boite(page, '#options-scroll'), pied: await boite(page, '#options-pied') };
      for (const [k, b] of Object.entries(parts)) {
        expect(b.l, k).toBeGreaterThanOrEqual(-0.5);
        expect(b.t, k).toBeGreaterThanOrEqual(-0.5);
        expect(b.r, k).toBeLessThanOrEqual(size.width + 0.5);
        expect(b.b, k).toBeLessThanOrEqual(size.height + 0.5);
      }
      const noms = Object.keys(parts);
      for (let i = 0; i < noms.length; i += 1) for (let j = i + 1; j < noms.length; j += 1) expect(chevauche(parts[noms[i]], parts[noms[j]]), `${noms[i]} / ${noms[j]}`).toBe(false);
      expect(parts.tete.l).toBeGreaterThanOrEqual(15.5); // bord gauche commun des bandeaux (16 px)
      expect(await page.locator('#options-scroll').evaluate((n) => n.scrollHeight > n.clientHeight)).toBe(true);
      // Préréglages entiers dans l'écran ; boutons de valeur côte à côte, à droite de leur nom, dans la liste.
      for (const b of await page.locator('.e5-preset').all()) {
        const r = await b.boundingBox();
        expect(r.x + r.width).toBeLessThanOrEqual(size.width + 0.5);
      }
      const liste = parts.liste;
      for (const row of await page.locator('#options-scroll .e5-ligne').all()) {
        await row.scrollIntoViewIfNeeded();
        const g = await row.locator('.e5-gauche').boundingBox();
        const v = await row.locator('.e5-valeurs').boundingBox();
        expect(v.x, await row.getAttribute('data-option')).toBeGreaterThanOrEqual(g.x + g.width - 0.5);
        expect(v.x + v.width).toBeLessThanOrEqual(liste.r + 0.5);
      }
      // Cibles de 44 px au moins (préréglages, valeurs, retour, curseur du volume).
      for (const sel of ['#options-retour', '.e5-preset', '.e5-valeur', '#options-volume']) {
        for (const n of await page.locator(sel).all()) {
          const r = await n.boundingBox();
          expect(Math.round(r.height), sel).toBeGreaterThanOrEqual(44);
          expect(Math.round(r.width), sel).toBeGreaterThanOrEqual(44);
        }
      }
      for (const n of await page.locator('.e5-valeur').all()) expect(Math.round((await n.boundingBox()).width)).toBeGreaterThanOrEqual(Math.min(76, Math.round(76 * Math.min(size.width / 932, size.height / 430))) - 1);
      await page.locator('#options-scroll').evaluate((n) => { n.scrollTop = 0; });
      const axe = await new AxeBuilder({ page }).include('#e8').analyze();
      expect(axe.violations.map((v) => `${v.id} : ${v.nodes.map((n) => n.target).join(', ')}`)).toEqual([]);
      expect(o.problemes).toEqual([]);
      expect(o.externes).toEqual([]);
    });
  }

  test('retour par « ‹ Menu » et par Échap à l\'onglet d\'où l\'on venait (Jouer, Infini) ; focus rendu au bouton à trois barres ; scènes en pause pendant les Options', async ({ page }) => {
    await ouvrirMenu(page);
    await ouvrirOptions(page);
    await expect(page.locator('#menu-jouer-scene')).toHaveAttribute('data-anim', 'off');
    await page.locator('#options-retour').click();
    await expect(page.locator('#menu-ecran-options')).toBeHidden();
    await expect(page.locator('#menu-ecran-jouer')).toBeVisible();
    await expect(page.locator('.e8-onglets')).toBeVisible();
    await expect(page.locator('#menu-trois-barres')).toBeFocused();
    await expect(page.locator('#menu-jouer-scene')).toHaveAttribute('data-anim', 'on');
    await page.locator('#menu-onglet-infini').click();
    await expect(page.locator('#menu-ecran-infini')).toBeVisible();
    await ouvrirOptions(page);
    await expect(page.locator('#menu-ecran-infini')).toBeHidden();
    await page.keyboard.press('Escape');
    await expect(page.locator('#menu-ecran-options')).toBeHidden();
    await expect(page.locator('#menu-ecran-infini')).toBeVisible();
    await expect(page.locator('#menu-onglet-infini')).toHaveAttribute('aria-current', 'page');
    expect((await page.evaluate(() => window.__zsMenu.etat())).menu.ecran).toBeNull();
    await expect(page.locator('#pause-panel')).toBeHidden(); // Échap n'ouvre jamais la pause pendant le menu
    expect(await page.evaluate(() => typeof window.__zs)).toBe('undefined'); // aucune partie pendant le menu
  });

  test('préréglage choisi puis réglage modifié → Perso ; notes « ↻ au lancement de la partie » (réglages au lancement, lus dans les données) et « Appliqué tout de suite »', async ({ page }) => {
    await ouvrirMenu(page);
    await ouvrirOptions(page);
    const groupes = await page.locator('#options-scroll .e5-ligne').evaluateAll((ns) => ns.map((n) => [n.dataset.option, n.dataset.group, n.querySelector('.e5-note').textContent]));
    const graphics = await page.evaluate(() => fetch('data/game/graphics.json').then((r) => r.json()));
    const load = graphics.options.filter((x) => x.group === 'load').map((x) => x.id);
    expect(groupes.filter(([, g]) => g === 'load').map(([id]) => id)).toEqual(load);
    for (const [id, g, note] of groupes) expect(note, id).toBe(g === 'load' ? '↻ au lancement de la partie' : 'Appliqué tout de suite');
    // Chaque groupe de valeurs est un groupe nommé, décrit par sa note.
    await expect(page.locator('.e5-ligne[data-option="anticrenelage"]')).toHaveAttribute('role', 'group');
    await expect(page.locator('.e5-ligne[data-option="anticrenelage"]')).toHaveAccessibleName('Anticrénelage');
    await expect(page.locator('.e5-ligne[data-option="anticrenelage"]')).toHaveAccessibleDescription('↻ au lancement de la partie');
    await page.locator('#options-preset-faible').click();
    await expect(page.locator('#options-preset-faible')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('#options-preset-auto')).toHaveAttribute('aria-pressed', 'false');
    expect(await presse(page, '.e5-ligne[data-option="resolution"] .e5-valeur')).toEqual(['basse']);
    expect(await presse(page, '.e5-ligne[data-option="textures"] .e5-valeur')).toEqual(['simples']);
    await page.locator('.e5-ligne[data-option="textures"] .e5-valeur[data-value="fines"]').click(); // réglage au lancement : modifiable dans le menu
    await expect(page.locator('#options-preset-perso')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('#options-preset-faible')).toHaveAttribute('aria-pressed', 'false');
    expect(await presse(page, '.e5-ligne[data-option="textures"] .e5-valeur')).toEqual(['fines']);
    expect(await presse(page, '.e5-ligne[data-option="resolution"] .e5-valeur')).toEqual(['basse']); // les autres valeurs gardées
    // Choix jamais porté par la couleur seule : souligné.
    expect(await page.locator('#options-preset-perso').evaluate((n) => getComputedStyle(n).textDecorationLine)).toContain('underline');
  });

  test('section Son : son coupé puis activé, volume par pas de 10 (texte et valeur lue) ; repris par la partie après « JOUER »', async ({ page }) => {
    test.setTimeout(150_000);
    await ouvrirMenu(page);
    await ouvrirOptions(page);
    await expect(page.locator('.e5-ligne[data-option="son"]')).toHaveAccessibleName('Son');
    await expect(page.locator('#options-son-active')).toHaveAttribute('aria-pressed', 'true');
    await page.locator('#options-son-coupe').click();
    await expect(page.locator('#options-son-coupe')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('#options-son-active')).toHaveAttribute('aria-pressed', 'false');
    await page.locator('#options-son-active').click();
    await expect(page.locator('#options-son-active')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('#options-volume')).toHaveAccessibleName('Volume');
    await expect(page.locator('#options-volume')).toHaveAttribute('aria-valuetext', '100 %');
    await expect(page.locator('#options-volume-valeur')).toHaveText('100 %');
    await page.locator('#options-volume').focus();
    for (let i = 0; i < 3; i += 1) await page.keyboard.press('ArrowLeft');
    await expect(page.locator('#options-volume')).toHaveValue('70');
    await expect(page.locator('#options-volume')).toHaveAttribute('aria-valuetext', '70 %');
    await expect(page.locator('#options-volume-valeur')).toHaveText('70 %');
    await page.locator('#options-son-coupe').click();
    await page.locator('#options-retour').click();
    await page.locator('#menu-jouer').click();
    await page.waitForFunction(() => (window.__zs?.getState()?.time ?? 0) > 0.05, null, { timeout: 120_000 });
    expect((await page.evaluate(() => window.__zs.getState().audio))).toMatchObject({ muted: true, volume: 70 });
  });

  test('aucun fichier de Three.js ni du jeu chargé en ouvrant Options ; après « JOUER », la partie utilise le préréglage et le réglage au lancement choisis (?store=local) ; zs.device.v1 dans ses seuls champs, zs.save.v1 intact', async ({ page, baseURL }) => {
    test.setTimeout(150_000);
    const o = surveiller(page, baseURL);
    await page.addInitScript(() => {
      window.__ecritures = [];
      const set = Storage.prototype.setItem;
      Storage.prototype.setItem = function (k, v) { window.__ecritures.push(k); return set.call(this, k, v); };
    });
    await ouvrirMenu(page, REF, '&store=local');
    const avant = await page.evaluate((k) => localStorage.getItem(k), SAVE);
    const depart = o.fichiers.length;
    await ouvrirOptions(page);
    await page.waitForTimeout(500);
    const ouverture = o.fichiers.slice(depart);
    expect(ouverture.filter((f) => JEU.test(f))).toEqual([]);
    expect(ouverture.filter((f) => f.endsWith('.js'))).toEqual(['/js/game/options-menu.js', '/js/game/graphics-apply.js']);
    expect(ouverture.filter((f) => !f.endsWith('.js'))).toEqual(['/data/game/graphics.json', '/data/game/audio.json']);
    expect(await page.evaluate(() => window.__ecritures)).toEqual([]); // ouvrir n'écrit rien
    await page.locator('#options-preset-moyen').click();
    await page.locator('.e5-ligne[data-option="anticrenelage"] .e5-valeur[data-value="oui"]').click();
    const ecrit = await page.evaluate((k) => JSON.parse(localStorage.getItem(k)), DEVICE);
    expect(Object.keys(ecrit).sort()).toEqual(['custom', 'graphics', 'v']);
    expect(ecrit).toMatchObject({ v: 2, graphics: 'perso', custom: { anticrenelage: 'oui', resolution: 'moyenne', textures: 'fines', personnages: 'simples' } });
    expect([...new Set(await page.evaluate(() => window.__ecritures))]).toEqual([DEVICE]);
    expect(await page.evaluate((k) => localStorage.getItem(k), SAVE)).toBe(avant);
    await page.locator('#options-retour').click();
    await page.locator('#menu-jouer').click();
    await page.waitForFunction(() => (window.__zs?.getState()?.time ?? 0) > 0.05, null, { timeout: 120_000 });
    const g = await page.evaluate(() => window.__zs.getState().graphics);
    expect(g).toMatchObject({ choice: 'perso', running: { anticrenelage: 'oui', resolution: 'moyenne', personnages: 'simples' }, load: { anticrenelage: true }, pending: [] });
    expect(o.problemes).toEqual([]);
    expect(o.externes).toEqual([]);
  });
});
