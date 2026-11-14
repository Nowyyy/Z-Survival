// Lot 8c : page Options du menu principal (E5, composant partagé avec la partie : Docs/ref/menu-principal.md, Docs/ref/options-graphiques.md).
// ?test=1&menu=1 ; 932 × 430 (référence), 667 × 375, 1440 × 900 ; projets bureau et mobile (paysage, Auto = Moyen sur un pointeur grossier).
// Ouverture depuis le menu à trois barres, retour par « ‹ Menu » et par Échap à l'onglet d'origine ; préréglages et passage sur Perso ; notes ;
// section Son ; réglages pris par la partie après « JOUER » ; aucun fichier de Three.js ni du jeu chargé ; zs.device.v1 dans ses seuls champs.
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const REF = { width: 932, height: 430 };
const SIZES = [REF, { width: 667, height: 375 }, { width: 1440, height: 900 }];
const DEVICE = 'zs.device.v1';
const SAVE = 'zs.save.v2'; // lot 8h : progression v2 (les Options ne l'écrivent jamais)
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
    await expect(page.locator('#options-volume')).toHaveAccessibleName('Volume du jeu'); // lot 8i : « Volume » devient « Volume du jeu » (et « Volume de la musique » à côté)
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

  test('aucun fichier de Three.js ni du jeu chargé en ouvrant Options ; après « JOUER », la partie utilise le préréglage et le réglage au lancement choisis (?store=local) ; zs.device.v1 dans ses seuls champs, zs.save.v2 intact (lot 8h)', async ({ page, baseURL }) => {
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
    // Lot 8i : le premier geste (ici, l'ouverture du menu à trois barres) charge aussi le moteur des sons du menu (js/menu/sons/, ses fonctions
    // pures, sa synthèse dans le calculateur d'arrière-plan, data/menu/sons.json et sons-choix.json) : compté à part, ni Three.js ni le jeu.
    const SONS = /^\/js\/menu\/sons\/|^\/js\/core\/(sons-menu|musique-menu|synth2|synth2-dsp|synth2-sources|audio-analysis|vec)\.js$|^\/data\/menu\/sons(-choix)?\.json$/;
    const tout = o.fichiers.slice(depart);
    expect(tout.filter((f) => JEU.test(f))).toEqual([]);
    expect(tout.filter((f) => SONS.test(f) && /three|\/js\/game\//.test(f))).toEqual([]);
    const ouverture = tout.filter((f) => !SONS.test(f));
    expect(ouverture.filter((f) => f.endsWith('.js'))).toEqual(['/js/game/options-menu.js', '/js/game/graphics-apply.js']);
    // Lot 8d (retour du propriétaire) : le journal est lu à la première ouverture du menu à trois barres (version sous « Déconnexion »).
    expect(ouverture.filter((f) => !f.endsWith('.js')).sort()).toEqual(['/data/changelog.json', '/data/game/audio.json', '/data/game/graphics.json']);
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

// Lot 8c, partie C : Options en partie (E2-12), même composant (contexte « partie ») : réglages appliqués au lancement verrouillés, préréglages
// modifiables (options « tout de suite » appliquées, valeurs « au lancement » enregistrées pour le prochain chargement, sans ligne « En cours · au retour au
// menu » : retirée à la demande du propriétaire après le lot), barre « Recharger maintenant » retirée.
async function partieDirecte(page, size = REF, extra = '') {
  await page.setViewportSize(size);
  await page.goto(`/jeu.html?test=1&seed=1&nospawn=1${extra}`);
  await page.waitForFunction(() => (window.__zs?.getState()?.time ?? 0) > 0.05, null, { timeout: 90_000 });
}
async function optionsPartie(page) {
  await page.locator('#btn-pause').dispatchEvent('click');
  await page.locator('#btn-options').dispatchEvent('click');
  await expect(page.locator('#options-panel')).toBeVisible();
}
const graphismes = (page) => page.evaluate(() => window.__zs.getState().graphics);
// Contraste texte / fond d'un élément (couleurs calculées, fond opaque de l'élément).
const contraste = (n) => {
  const rgb = (c) => c.match(/[\d.]+/g).slice(0, 3).map(Number);
  const lum = (c) => {
    const [r, g, b] = rgb(c).map((v) => v / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const cs = getComputedStyle(n);
  const [a, b] = [lum(cs.color), lum(cs.backgroundColor)].sort((x, y) => y - x);
  return (a + 0.05) / (b + 0.05);
};

test.describe('Options en partie (E2-12)', () => {
  for (const size of [REF, { width: 667, height: 375 }]) {
    test(`${size.width}×${size.height} : « ‹ Pause » et titre ; mêmes sections que le menu (Son en tête) ; réglages au lancement grisés, cadenas, « Modifiable depuis le menu principal », non activables, raison lue ; préréglages modifiables ; aucune barre « Recharger maintenant » ; 44 px ; axe ; console propre`, async ({ page, baseURL, isMobile }) => {
      const o = surveiller(page, baseURL);
      await partieDirecte(page, size);
      await optionsPartie(page);
      await expect(page.locator('#options-panel')).toHaveAttribute('data-contexte', 'partie');
      await expect(page.locator('#options-panel')).toHaveAccessibleName('Options');
      await expect(page.locator('#options-retour')).toHaveText('Pause');
      await expect(page.locator('#options-retour')).toHaveAccessibleName('Retour à la pause');
      await expect(page.locator('#options-title')).toHaveText('Options');
      await expect(page.locator('.e5-section-titre')).toHaveText(['Son', 'Image', 'Carte', 'Personnages', 'Lumières']);
      await expect(page.locator('#options-preset-auto')).toHaveText(`Auto · ${isMobile ? 'Moyen' : 'Élevé'}`);
      await expect(page.locator('#options-pied')).toHaveCount(0); // le pied n'existe que dans le menu
      await expect(page.locator('#options-reload, #options-reload-now, #options-confirm')).toHaveCount(0);
      const graphics = await page.evaluate(() => fetch('data/game/graphics.json').then((r) => r.json()));
      const load = graphics.options.filter((x) => x.group === 'load').map((x) => x.id);
      for (const p of ['auto', 'faible', 'moyen', 'eleve', 'perso']) await expect(page.locator(`#options-preset-${p}`)).toBeEnabled();
      for (const x of graphics.options) {
        const row = page.locator(`.e5-ligne[data-option="${x.id}"]`);
        if (load.includes(x.id)) {
          await expect(row).toHaveClass(/is-verrou/);
          await expect(row.locator('.e5-cadenas')).toBeVisible();
          await expect(row).toHaveAccessibleDescription('Modifiable depuis le menu principal');
          for (const b of await row.locator('.e5-valeur').all()) {
            await expect(b).toBeDisabled();
            await expect(b).toHaveAccessibleDescription('Modifiable depuis le menu principal');
          }
          // Couleur jamais seule : nom grisé ET cadenas ET texte ; texte désactivé lisible (4,5:1 au moins, choisi ou non ; axe ignore les boutons désactivés).
          for (const b of await row.locator('.e5-valeur').all()) expect(await b.evaluate(contraste), x.id).toBeGreaterThanOrEqual(4.5);
        } else {
          await expect(row).not.toHaveClass(/is-verrou/);
          for (const b of await row.locator('.e5-valeur').all()) await expect(b).toBeEnabled();
        }
      }
      // Un clic sur une valeur verrouillée (forcé) ne change rien.
      const avant = await graphismes(page);
      await page.locator('.e5-ligne[data-option="textures"] .e5-valeur:not([aria-pressed="true"])').dispatchEvent('click');
      expect((await graphismes(page)).vector).toEqual(avant.vector);
      for (const sel of ['#options-retour', '.e5-preset', '.e5-valeur', '#options-volume']) {
        for (const n of await page.locator(sel).all()) {
          await n.scrollIntoViewIfNeeded();
          const r = await n.boundingBox();
          expect(Math.round(Math.min(r.height, r.width)), sel).toBeGreaterThanOrEqual(44);
        }
      }
      const panneau = await boite(page, '.e5-panneau');
      expect([panneau.l >= -0.5, panneau.t >= -0.5, panneau.r <= size.width + 0.5, panneau.b <= size.height + 0.5]).toEqual([true, true, true, true]);
      await page.locator('#options-scroll').evaluate((n) => { n.scrollTop = 0; });
      const axe = await new AxeBuilder({ page }).include('#options-panel').analyze();
      expect(axe.violations.map((v) => `${v.id} : ${v.nodes.map((n) => n.target).join(', ')}`)).toEqual([]);
      // Échap : retour à la pause.
      await page.keyboard.press('Escape');
      await expect(page.locator('#options-panel')).toBeHidden();
      await expect(page.locator('#pause-panel')).toBeVisible();
      expect(o.problemes).toEqual([]);
      expect(o.externes).toEqual([]);
    });
  }

  test('préréglage choisi en partie : options « tout de suite » appliquées (rendu), réglages verrouillés en cours inchangés, ligne « En cours · au retour au menu » ; Perso par une option « tout de suite » ; son synchronisé avec l\'icône de la pause', async ({ page, isMobile }) => {
    await partieDirecte(page);
    await optionsPartie(page);
    // Valeurs attendues lues dans les données : Auto vaut Élevé sur un ordinateur, Moyen sur un pointeur grossier (projet mobile).
    const graphics = await page.evaluate(() => fetch('data/game/graphics.json').then((r) => r.json()));
    const initial = graphics.presets[isMobile ? 'moyen' : 'eleve'];
    const enAttente = (cible) => graphics.options.filter((x) => x.group === 'load' && cible[x.id] !== initial[x.id]).map((x) => ({ id: x.id, enCours: initial[x.id], retour: cible[x.id] }));
    const g0 = await graphismes(page);
    await page.locator('#options-preset-faible').click();
    const g1 = await graphismes(page);
    expect(g1).toMatchObject({ choice: 'faible', preset: 'faible', live: { dprMax: 1, ombres: false, vhs: 'off', brouillard: 'simple' }, shadows: false });
    expect(g1.world.mists).toEqual([false, false, false]);
    expect(g1.load).toEqual(g0.load); // réglages du chargement : inchangés pendant la partie
    expect(g1.running).toEqual(g0.running);
    expect(g1.waiting).toEqual(enAttente(graphics.presets.faible));
    expect(g1.waiting.map((w) => w.id)).toEqual(expect.arrayContaining(['carte', 'textures']));
    // Retour du propriétaire (après le lot) : avant, une ligne « En cours : X · au retour au menu : Y » et un bord en tirets sur la valeur du retour ;
    // après, rien de tel : la ligne verrouillée garde sa seule note, la valeur en cours reste marquée.
    await expect(page.locator('.e5-attente, [id^="options-attente-"]')).toHaveCount(0);
    await expect(page.locator('#options-panel')).not.toContainText('au retour au menu');
    await expect(page.locator('.e5-ligne[data-option="textures"]')).toHaveAccessibleDescription('Modifiable depuis le menu principal');
    await expect(page.locator('.e5-ligne[data-option="textures"] [data-value="fines"]')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('.e5-ligne[data-option="textures"] [data-value="simples"]')).not.toHaveClass(/is-attente/);
    if (!isMobile) await expect(page.locator('.e5-ligne[data-option="anticrenelage"] [data-value="oui"]')).toHaveAttribute('aria-pressed', 'true');
    // Option « tout de suite » modifiée : Perso, appliquée à chaud ; les valeurs « au lancement » de Faible restent en attente.
    await page.locator('.e5-ligne[data-option="brume"] [data-value="complete"]').click();
    const g2 = await graphismes(page);
    expect(g2).toMatchObject({ choice: 'perso', live: { brouillard: 'complet' } });
    expect(g2.waiting).toEqual(enAttente(graphics.presets.faible));
    await expect(page.locator('#options-preset-perso')).toHaveAttribute('aria-pressed', 'true');
    // Retour au préréglage du chargement : plus rien en attente.
    await page.locator(`#options-preset-${isMobile ? 'moyen' : 'eleve'}`).click();
    expect((await graphismes(page)).waiting).toEqual([]);
    await expect(page.locator('#options-panel')).not.toContainText('au retour au menu');
    // Son : Coupé dans les Options → icône de la pause barrée ; l'icône remet le son → Options à jour.
    await page.locator('#options-son-coupe').click();
    expect((await page.evaluate(() => window.__zs.getState().audio)).muted).toBe(true);
    await page.locator('#options-volume').focus();
    await page.keyboard.press('ArrowLeft');
    expect((await page.evaluate(() => window.__zs.getState().audio)).volume).toBe(90);
    await page.locator('#options-retour').click();
    await expect(page.locator('#btn-sound')).toHaveAttribute('data-muted', 'true');
    await page.locator('#btn-sound').click();
    await page.locator('#btn-options').click();
    await expect(page.locator('#options-son-active')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('#options-volume-valeur')).toHaveText('90 %');
  });

  test('« Rejouer » ne recharge pas (valeurs toujours en attente) ; après « Quitter » puis « JOUER », les valeurs choisies en partie sont en vigueur (?store=local)', async ({ page, isMobile }) => {
    test.setTimeout(180_000);
    await page.addInitScript(() => {
      if (sessionStorage.getItem('zs.test.vide')) return;
      sessionStorage.setItem('zs.test.vide', '1');
      localStorage.clear();
    });
    await ouvrirMenu(page, REF, '&store=local');
    await page.locator('#menu-jouer').click();
    await page.waitForFunction(() => (window.__zs?.getState()?.time ?? 0) > 0.05, null, { timeout: 120_000 });
    expect((await graphismes(page)).load).toMatchObject({ texturesFines: true, decor: 'complet' });
    await optionsPartie(page);
    await page.locator('#options-preset-faible').click();
    expect((await graphismes(page)).load).toMatchObject({ texturesFines: true, decor: 'complet' }); // en cours : inchangés
    await page.locator('#options-retour').click();
    // « Rejouer » (fin de partie) : game.restart(), sans rechargement : les réglages au lancement restent ceux du chargement, toujours en attente.
    await page.evaluate(() => { window.__marque = 1; });
    await page.locator('#btn-resume').click();
    await page.evaluate(() => { const zs = window.__zs; zs.setChutes(0); zs.downPlayer(); zs.step(0.3); });
    await expect(page.locator('#end-panel')).toBeVisible();
    await page.locator('#btn-replay').click();
    await expect(page.locator('#end-panel')).toBeHidden();
    expect(await page.evaluate(() => window.__marque)).toBe(1);
    const rejoue = await graphismes(page);
    expect(rejoue).toMatchObject({ choice: 'faible', load: { texturesFines: true, decor: 'complet' } });
    expect(rejoue.waiting.map((w) => w.id)).toEqual(isMobile ? ['carte', 'textures'] : ['anticrenelage', 'carte', 'textures', 'personnages']); // depuis Moyen (mobile) ou Élevé
    await page.locator('#btn-pause').click();
    await page.locator('#btn-quit').click();
    await Promise.all([page.waitForURL(/[?&]menu=1/), page.locator('#btn-quit-ok').click()]);
    await expect(page.locator('#menu-jouer')).toBeVisible({ timeout: 60_000 });
    await page.locator('#menu-jouer').click();
    await page.waitForFunction(() => (window.__zs?.getState()?.time ?? 0) > 0.05, null, { timeout: 120_000 });
    const g = await graphismes(page);
    expect(g).toMatchObject({ choice: 'faible', preset: 'faible', load: { texturesFines: false, decor: 'reduit', anticrenelage: false, personnages: 'A' }, pending: [], waiting: [] });
    expect(JSON.parse(await page.evaluate(() => localStorage.getItem('zs.device.v1')))).toEqual({ v: 2, graphics: 'faible', custom: null });
  });
});
