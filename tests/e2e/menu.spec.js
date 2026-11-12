// Lot 8a : écran de chargement (E7) et menu principal (E8) de jeu.html, démarrage et retour au menu (Docs/ref/menu-principal.md).
// ?test=1&menu=1 (window.__zsMenu, window.__zs) et, sans paramètre, le canal source ; 932 × 430 (référence), 667 × 375, 1440 × 900.
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const REF = { width: 932, height: 430 };
const SIZES = [REF, { width: 667, height: 375 }, { width: 1440, height: 900 }];
const KEY = 'zs.save.v1';
const BRUIT = /GL Driver Message|GPU stall|swiftshader|WebGL/i; // messages du rendu logiciel de Chromium, sans rapport avec la page

test.skip(({ isMobile }) => isMobile, 'bureau (tailles réglées par chaque test)');

function surveiller(page, baseURL) {
  const problemes = [];
  const externes = [];
  page.on('console', (m) => ['error', 'warning'].includes(m.type()) && !BRUIT.test(m.text()) && problemes.push(m.text()));
  page.on('pageerror', (e) => problemes.push(e.message));
  page.on('request', (r) => {
    const u = r.url();
    if (!u.startsWith(baseURL) && !u.startsWith('data:') && !u.startsWith('blob:')) externes.push(u);
  });
  return { problemes, externes };
}

async function ouvrirMenu(page, size = REF, extra = '') {
  await page.setViewportSize(size);
  await page.goto(`/jeu.html?test=1&menu=1&seed=1${extra}`);
  await expect(page.locator('#menu-jouer')).toBeVisible({ timeout: 60_000 });
  await page.waitForFunction(() => window.__zsMenu?.etat()?.menu !== null && !document.getElementById('e7'));
}

const etatMenu = (page) => page.evaluate(() => window.__zsMenu.etat());
const boite = (page, sel) => page.locator(sel).evaluate((n) => {
  const r = n.getBoundingClientRect();
  return { l: r.left, t: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height };
});

test.describe('écran de chargement (E7)', () => {
  test('titre « Z-Survival », progression réelle monotone jusqu\'à 100, astuce, version ; chute du Z jouée une fois ; puis le menu, sans rien du jeu (ni main.js, ni Three.js) ; console propre', async ({ page, baseURL }) => {
    const o = surveiller(page, baseURL);
    const fichiers = [];
    page.on('request', (r) => r.url().startsWith(baseURL) && fichiers.push(new URL(r.url()).pathname));
    await page.setViewportSize(REF);
    await page.goto('/jeu.html?test=1&menu=1&seed=1');
    await page.locator('#e7').waitFor({ state: 'attached' });
    // Retour du propriétaire : la chute part dès l'apparition de l'écran, sans attendre la progression (ni la police).
    expect(await page.evaluate(() => {
      const chute = document.getElementById('e7-z').getAnimations().find((x) => x.animationName === 'e7-chute');
      return [document.getElementById('e7').classList.contains('e7-joue'), Boolean(chute) && chute.currentTime < 1000];
    })).toEqual([true, true]);
    await expect(page.locator('#e7-titre')).toHaveText('Z-Survival');
    await expect(page.locator('#e7-titre')).toHaveAccessibleName('Z-Survival');
    await expect(page.locator('#e7-barre')).toHaveAttribute('role', 'progressbar');
    await expect(page.locator('#e7-astuce')).toContainText('Astuce');
    await expect(page.locator('#e7-version')).toHaveText('Arbre source');
    await expect(page.locator('#e7')).toHaveClass(/e7-joue/);
    const noms = await page.locator('#e7-z').evaluate((n) => n.getAnimations().map((a) => [a.animationName, a.effect.getTiming().iterations]));
    expect(noms).toEqual([['e7-chute', 1]]);
    await expect(page.locator('#menu-jouer')).toBeVisible({ timeout: 60_000 });
    const e = await etatMenu(page);
    expect(e.journal[0]).toBe(0);
    expect(e.journal.at(-1)).toBe(100);
    expect(e.journal.every((n, i) => i === 0 || n > e.journal[i - 1])).toBe(true);
    expect(e.journal.filter((n) => n >= 100)).toEqual([100]);
    expect([e.phase, e.pret, e.chuteFinie, e.visible]).toEqual(['menu', true, true, false]);
    expect(await page.evaluate(() => typeof window.__zs)).toBe('undefined'); // la partie n'est créée qu'à « JOUER »
    expect(fichiers.filter((f) => /\/js\/game\/main\.js$|\/vendor\/three\/|\/data\/game\/(textures|sounds|world)\.json$|\/maps\//.test(f))).toEqual([]); // seul le menu s'est chargé
    expect(o.problemes).toEqual([]);
    expect(o.externes).toEqual([]);
  });

  test('prefers-reduced-motion : le Z est posé (aucune animation dans l\'écran de chargement), puis le menu', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.setViewportSize(REF);
    await page.goto('/jeu.html?test=1&menu=1&seed=1');
    await expect(page.locator('#e7')).toHaveClass(/e7-pose/);
    // Animations CSS seulement (la feuille de base réduit toute transition à 0,01 ms sous mouvement réduit : ce n'est pas une animation de l'écran).
    expect(await page.locator('#e7').evaluate((n) => n.getAnimations({ subtree: true }).filter((a) => a.animationName).length)).toBe(0);
    await expect(page.locator('#menu-jouer')).toBeVisible({ timeout: 60_000 });
    expect(await page.locator('#e8').evaluate((n) => n.getAnimations({ subtree: true }).filter((a) => a.animationName).length)).toBe(0);
  });
});

test.describe('menu principal (E8)', () => {
  for (const size of SIZES) {
    test(`${size.width}×${size.height} : en-tête, onglets et Jouer à leur place ; trois barres dans le bandeau ; rien hors de l'écran ni superposé ; cibles de 44 px ; axe`, async ({ page }) => {
      await ouvrirMenu(page, size);
      const ids = ['#menu-connexion', '#menu-solde', '#menu-plein-ecran', '#menu-trois-barres', '.menu-bandeau', '#menu-jouer', ...['boutique', 'personnage', 'jouer', 'infini', 'event'].map((o) => `#menu-onglet-${o}`)];
      const b = Object.fromEntries(await Promise.all(ids.map(async (s) => [s, await boite(page, s)])));
      for (const [s, r] of Object.entries(b)) expect([r.l >= 0, r.t >= 0, r.r <= size.width + 0.5, r.b <= size.height + 0.5], s).toEqual([true, true, true, true]);
      const entete = await boite(page, '.e8-entete');
      const barres = b['#menu-trois-barres'];
      expect([barres.t >= entete.t, barres.b <= entete.b, barres.r <= entete.r]).toEqual([true, true, true]);
      expect(barres.r).toBeLessThanOrEqual(size.width - 15.5); // marge de 16 px
      expect(b['#menu-connexion'].l).toBeGreaterThanOrEqual(15.5);
      // Ordre et emplacement : Connexion à gauche, solde, plein écran (retour du propriétaire après le lot 8c) puis trois barres à droite ; Jouer au centre ;
      // bandeau sous l'en-tête, à gauche.
      expect(b['#menu-solde'].r).toBeLessThanOrEqual(barres.l);
      expect([b['#menu-solde'].r <= b['#menu-plein-ecran'].l, b['#menu-plein-ecran'].r <= barres.l]).toEqual([true, true]);
      expect([b['#menu-plein-ecran'].t >= entete.t, b['#menu-plein-ecran'].b <= entete.b]).toEqual([true, true]);
      expect(Math.abs((b['#menu-onglet-jouer'].l + b['#menu-onglet-jouer'].r) / 2 - size.width / 2)).toBeLessThan(2);
      expect(b['#menu-onglet-jouer'].w).toBeGreaterThan(b['#menu-onglet-boutique'].w);
      expect([b['.menu-bandeau'].t >= entete.b, b['.menu-bandeau'].l >= 15.5]).toEqual([true, true]);
      const chevauche = (x, y) => x.l < y.r - 0.5 && y.l < x.r - 0.5 && x.t < y.b - 0.5 && y.t < x.b - 0.5;
      const liste = Object.entries(b);
      for (let i = 0; i < liste.length; i += 1) for (let j = i + 1; j < liste.length; j += 1) expect(chevauche(liste[i][1], liste[j][1]), `${liste[i][0]} / ${liste[j][0]}`).toBe(false);
      for (const s of ids.filter((x) => x !== '#menu-solde' && x !== '.menu-bandeau')) expect([b[s].w >= 44, b[s].h >= 44], s).toEqual([true, true]);
      expect((await new AxeBuilder({ page }).analyze()).violations.map((v) => v.id)).toEqual([]);
    });
  }

  test('onglets : Jouer actif au départ (aria-current et goutte), changement d\'onglet, Boutique (lot 8e ; avant : « Bientôt ») ; Event verrouillé (cadenas et « Prochainement », « Prochainement : contenu verrouillé », non activable)', async ({ page }) => {
    await ouvrirMenu(page);
    await expect(page.locator('#menu-onglet-jouer')).toHaveAttribute('aria-current', 'page');
    await expect(page.locator('.e8-onglets [aria-current]')).toHaveCount(1);
    await expect(page.locator('.e8-onglets button')).toHaveText(['Boutique', 'Personnage', 'Histoire', 'Infini', 'Prochainement']); // lot 8d, retour du propriétaire (avant : « JOUER », cadenas seul)
    // Lot 8e (demande du propriétaire ; avant : trait rouge ::after) : onglet affiché marqué par sa goutte de sang (forme), visible sur lui seul.
    const trait = (sel) => page.locator(`${sel} .e8-onglet-goutte`).evaluate((n) => getComputedStyle(n).display);
    expect(await trait('#menu-onglet-jouer')).toBe('block');
    await page.locator('#menu-onglet-boutique').click();
    await expect(page.locator('#menu-onglet-boutique')).toHaveAttribute('aria-current', 'page');
    await expect(page.locator('#menu-onglet-jouer')).not.toHaveAttribute('aria-current', /.*/);
    expect([await trait('#menu-onglet-boutique'), await trait('#menu-onglet-jouer')]).toEqual(['block', 'none']);
    await expect(page.getByRole('heading', { name: 'Boutique' })).toBeVisible();
    await expect(page.locator('#menu-ecran-boutique .menu-bandeau-libelle')).toHaveText('Ravitaillement'); // lot 8e (avant : « Bientôt »)
    await expect(page.locator('#menu-jouer')).toBeHidden();
    const event = page.locator('#menu-onglet-event');
    await expect(event).toBeDisabled();
    await expect(event).toHaveAccessibleName('Prochainement : contenu verrouillé'); // lot 8d (avant : « Contenu verrouillé »)
    await expect(event.locator('svg')).toHaveCount(1);
    await event.click({ force: true });
    expect((await etatMenu(page)).menu.onglet).toBe('boutique');
    await page.locator('#menu-onglet-jouer').click();
    await expect(page.locator('#menu-jouer')).toBeVisible();
  });

  test('trois barres : ouverture sous le bouton, quatre entrées, Échap et appui ailleurs ; point jaune présent puis absent après Information ; Discord grisé (« bientôt ») et aucune requête ; Déconnexion grisée ; axe', async ({ page, baseURL }) => {
    const o = surveiller(page, baseURL);
    await ouvrirMenu(page);
    const barres = page.locator('#menu-trois-barres');
    await expect(page.locator('.e8-point-barres')).toBeVisible();
    await expect(barres).toHaveAccessibleName('Menu (nouveauté non lue)');
    await barres.click();
    await expect(barres).toHaveAttribute('aria-expanded', 'true');
    const liste = page.locator('#menu-liste');
    await expect(liste).toBeVisible();
    expect((await boite(page, '#menu-liste')).t).toBeGreaterThanOrEqual((await boite(page, '#menu-trois-barres')).b - 0.5);
    await expect(liste.locator('.e8-entree')).toHaveText([/^Options$/, /^Information/, /^Discord\s*bientôt$/, /^Déconnexion\s*non connecté$/]);
    await expect(page.locator('#menu-point-info')).toBeVisible();
    await expect(page.locator('#menu-discord')).toBeDisabled();
    await expect(page.locator('#menu-deconnexion')).toBeDisabled();
    for (const s of ['#menu-options', '#menu-information', '#menu-discord', '#menu-deconnexion']) expect((await boite(page, s)).h, s).toBeGreaterThanOrEqual(44);
    expect((await new AxeBuilder({ page }).analyze()).violations.map((v) => v.id)).toEqual([]);
    await page.keyboard.press('Escape');
    await expect(liste).toBeHidden();
    await expect(barres).toBeFocused();
    await barres.click();
    await page.mouse.click(400, 200);
    await expect(liste).toBeHidden();
    await barres.click();
    await page.locator('#menu-information').click();
    const info = page.getByRole('dialog', { name: 'Information' });
    await expect(info).toBeVisible();
    await expect(info).toContainText('Nouveau menu principal');
    await page.locator('.e8-panneau').evaluate((n) => Promise.all(n.getAnimations().map((a) => a.finished))); // apparition finie
    const [bi, bj] = [await boite(page, '#menu-ecran-information .menu-bandeau'), await boite(page, '#menu-ecran-jouer .menu-bandeau')];
    expect([Math.round(bi.l), Math.round(bi.t)]).toEqual([Math.round(bj.l), Math.round(bj.t)]); // même place que le bandeau de l'onglet
    expect((await new AxeBuilder({ page }).analyze()).violations.map((v) => v.id)).toEqual([]);
    await page.keyboard.press('Escape');
    await expect(info).toBeHidden();
    await expect(page.locator('.e8-point-barres')).toBeHidden();
    await expect(barres).toHaveAccessibleName('Menu');
    await barres.click();
    await expect(page.locator('#menu-point-info')).toBeHidden();
    expect((await etatMenu(page)).menu).toMatchObject({ nonLue: false, discord: false, ecran: null });
    expect(o.externes).toEqual([]);
    expect(o.problemes).toEqual([]);
  });

  test('Information : sauts de ligne du texte des nouveautés (« \\n » dans la chaîne, ou liste de lignes), en texte brut', async ({ page }) => {
    const infos = { infos: [
      { id: 'a', date: '2026-11-10', titre: 'Chaîne', texte: 'Ligne 1\nLigne 2\n\nLigne 4 <b>brut</b>' },
      { id: 'b', date: '2026-11-10', titre: 'Liste', texte: ['Un', '', 'Trois'] },
    ] };
    await page.route('**/data/menu/infos.json', (r) => r.fulfill({ contentType: 'application/json', body: JSON.stringify(infos) }));
    await ouvrirMenu(page);
    await page.locator('#menu-trois-barres').click();
    await page.locator('#menu-information').click();
    const textes = page.locator('.e8-info-texte');
    await expect(textes).toHaveCount(2);
    expect(await textes.evaluateAll((els) => els.map((e) => [getComputedStyle(e).whiteSpace, e.innerText, e.children.length]))).toEqual([
      ['pre-line', 'Ligne 1\nLigne 2\n\nLigne 4 <b>brut</b>', 0],
      ['pre-line', 'Un\n\nTrois', 0],
    ]);
    const h = await textes.first().evaluate((e) => e.getBoundingClientRect().height / parseFloat(getComputedStyle(e).lineHeight || '20'));
    expect(h).toBeGreaterThanOrEqual(3.5); // quatre lignes affichées (dont une vide)
  });

  test('Connexion : écran provisoire « Connexion : bientôt » ; Options : la page Options du menu (E5, lot 8c) hors partie, fermée par « ‹ Menu » et Échap', async ({ page }) => {
    await ouvrirMenu(page);
    await page.locator('#menu-connexion').click();
    const connexion = page.getByRole('dialog', { name: 'Connexion : bientôt' });
    await expect(connexion).toBeVisible();
    await page.locator('#menu-ecran-connexion-fermer').click();
    await expect(connexion).toBeHidden();
    await expect(page.locator('#menu-connexion')).toBeFocused();
    await page.locator('#menu-trois-barres').click();
    await page.locator('#menu-options').click();
    await expect(page.locator('#menu-ecran-options')).toBeVisible();
    await expect(page.locator('#pause-panel')).toBeHidden();
    await page.locator('#options-retour').click();
    await expect(page.locator('#menu-ecran-options')).toBeHidden();
    await page.locator('#menu-trois-barres').click();
    await page.locator('#menu-options').click();
    await expect(page.locator('#menu-ecran-options')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('#menu-ecran-options')).toBeHidden();
    await expect(page.locator('#pause-panel')).toBeHidden(); // Échap n'ouvre jamais la pause pendant le menu
    expect(await page.evaluate(() => typeof window.__zs)).toBe('undefined'); // aucune partie pendant le menu
  });
});

// Retour du propriétaire après le lot 8c : bouton plein écran dans l'en-tête du menu, comme l'icône de la pause (lot 5j-G).
test.describe('plein écran du menu', () => {
  test('icône de 44 px dans l\'en-tête (« Plein écran ») ; bascule en plein écran puis en sort (« Quitter le plein écran », icône inversée) ; la partie lancée par « JOUER » reste en plein écran (icône de la pause à jour)', async ({ page }) => {
    test.setTimeout(120_000);
    await ouvrirMenu(page);
    const bouton = page.locator('#menu-plein-ecran');
    await expect(bouton).toBeVisible();
    await expect(bouton).toHaveAccessibleName('Plein écran');
    await expect(bouton).toHaveAttribute('data-active', 'false');
    const r = await boite(page, '#menu-plein-ecran');
    expect([Math.round(r.w) >= 44, Math.round(r.h) >= 44]).toEqual([true, true]);
    const icones = () => bouton.evaluate((n) => [...n.querySelectorAll('path')].filter((p) => getComputedStyle(p).display !== 'none').map((p) => p.getAttribute('class')));
    expect(await icones()).toEqual(['e8-fs-entrer']);
    await bouton.click();
    await page.waitForFunction(() => Boolean(document.fullscreenElement));
    await expect(bouton).toHaveAttribute('data-active', 'true');
    await expect(bouton).toHaveAccessibleName('Quitter le plein écran');
    expect(await icones()).toEqual(['e8-fs-sortir']);
    expect((await etatMenu(page)).menu.pleinEcran).toEqual({ disponible: true, actif: true });
    await bouton.click();
    await page.waitForFunction(() => !document.fullscreenElement);
    await expect(bouton).toHaveAccessibleName('Plein écran');
    // Plein écran puis « JOUER » : sans rechargement, la partie reste en plein écran ; l'icône de la pause le montre.
    await bouton.click();
    await page.waitForFunction(() => Boolean(document.fullscreenElement));
    await page.locator('#menu-jouer').click();
    await page.waitForFunction(() => (window.__zs?.getState()?.time ?? 0) > 0.05, null, { timeout: 90_000 });
    expect(await page.evaluate(() => Boolean(document.fullscreenElement))).toBe(true);
    await page.locator('#btn-pause').click();
    await expect(page.locator('#btn-fullscreen')).toHaveAttribute('data-active', 'true');
    await expect(page.locator('#btn-fullscreen')).toHaveAccessibleName('Quitter le plein écran');
  });

  test('sans l\'API plein écran (ex. iPhone) : bouton absent, comme dans la pause ; les trois barres restent à leur place', async ({ page }) => {
    await page.addInitScript(() => Object.defineProperty(Document.prototype, 'fullscreenEnabled', { get: () => false, configurable: true }));
    await ouvrirMenu(page);
    await expect(page.locator('#menu-plein-ecran')).toBeHidden();
    expect((await etatMenu(page)).menu.pleinEcran).toEqual({ disponible: false, actif: false });
    expect((await boite(page, '#menu-trois-barres')).r).toBeLessThanOrEqual(REF.width - 15.5);
  });
});

test.describe('partie et retour au menu', () => {
  test('solde de l\'en-tête = sauvegarde (?store=local) ; « JOUER » lance la partie (manche 1) ; « Quitter » confirmé ramène au menu, l\'argent conservé comme à la mort ; aucune écriture nouvelle du menu', async ({ page }) => {
    test.setTimeout(150_000);
    await page.setViewportSize(REF);
    // Sauvegarde de départ (chemin normal du jeu : gain puis écriture), puis visite du menu : clés et contenu identiques avant et après.
    await page.goto('/jeu.html?test=1&store=local&seed=1');
    await page.waitForFunction(() => (window.__zs?.getState()?.time ?? 0) > 0.05, null, { timeout: 60_000 });
    await page.evaluate(() => { window.__zs.giveMoney(1234); window.__zs.flushSave(); });
    const avant = await page.evaluate(() => Object.fromEntries(Object.keys(localStorage).map((k) => [k, localStorage.getItem(k)])));
    expect(JSON.parse(avant[KEY]).money).toBe(1234);
    await page.addInitScript(() => {
      window.__ecritures = [];
      const set = Storage.prototype.setItem;
      Storage.prototype.setItem = function (k, v) { window.__ecritures.push(k); return set.call(this, k, v); };
    });
    await ouvrirMenu(page, REF, '&store=local');
    await expect(page.locator('#menu-solde-texte')).toHaveText(`1${String.fromCharCode(0x202f)}234`);
    await expect(page.locator('#menu-solde')).toContainText('Solde : 1');
    await page.locator('#menu-onglet-infini').click();
    await page.locator('#menu-trois-barres').click();
    await page.locator('#menu-information').click();
    await expect(page.getByRole('dialog', { name: 'Information' })).toBeVisible();
    await page.keyboard.press('Escape');
    await page.locator('#menu-onglet-jouer').click();
    const apres = await page.evaluate(() => [window.__ecritures, Object.fromEntries(Object.keys(localStorage).map((k) => [k, localStorage.getItem(k)])), sessionStorage.length]);
    expect(apres).toEqual([[], avant, 0]);
    // JOUER : la partie démarre sans rechargement, manche 1.
    const url = page.url();
    await page.locator('#menu-jouer').click();
    await expect(page.locator('#game-root')).toBeVisible({ timeout: 60_000 });
    await expect(page.locator('#e8')).toHaveCount(0);
    await page.waitForFunction(() => (window.__zs?.getState()?.time ?? 0) > 0.05);
    expect(page.url()).toBe(url);
    const jeu = await etatMenu(page); // écran de chargement de la partie : progression jusqu'à 100, puis retiré
    expect([jeu.phase, jeu.journal.at(-1), jeu.visible, jeu.journal.every((n, i) => i === 0 || n > jeu.journal[i - 1])]).toEqual(['jeu', 100, false, true]);
    expect(await page.evaluate(() => window.__zs.getState().waves.wave)).toBe(1);
    // Quitter : gain de la partie, confirmation (Annuler d'abord), puis retour au menu ; le solde de la sauvegarde contient le gain.
    await page.evaluate(() => window.__zs.giveMoney(50));
    await page.locator('#btn-pause').click();
    await page.locator('#btn-quit').click();
    await expect(page.locator('#quit-confirm-text')).toHaveText('Quitter la partie ? L\'argent gagné est conservé.');
    await expect(page.locator('#btn-quit-cancel')).toBeFocused();
    // Retour du propriétaire : la question ne touche plus les boutons (avant : 0 px d'écart).
    const ecart = await page.evaluate(() => document.getElementById('btn-quit-ok').getBoundingClientRect().top - document.getElementById('quit-confirm-text').getBoundingClientRect().bottom);
    expect(ecart).toBeGreaterThanOrEqual(8);
    await page.locator('#btn-quit-cancel').click();
    await expect(page.locator('#btn-resume')).toBeVisible();
    await page.locator('#btn-quit').click();
    await Promise.all([page.waitForURL(/[?&]menu=1/), page.locator('#btn-quit-ok').click()]);
    await expect(page.locator('#menu-jouer')).toBeVisible({ timeout: 60_000 });
    await expect(page.locator('#menu-solde-texte')).toHaveText(`1${String.fromCharCode(0x202f)}284`);
    const quitte = await page.evaluate((k) => JSON.parse(localStorage.getItem(k)), KEY);
    expect(quitte.money).toBe(1284);
    // Même gain, mort puis « Revenir au menu principal » : même solde, même chemin (bank.runEnd).
    await page.locator('#menu-jouer').click();
    await page.waitForFunction(() => (window.__zs?.getState()?.time ?? 0) > 0.05, null, { timeout: 60_000 });
    await page.evaluate(() => { const zs = window.__zs; zs.giveMoney(50); zs.setChutes(0); zs.downPlayer(); zs.step(0.3); });
    await expect(page.locator('#end-panel')).toBeVisible();
    await Promise.all([page.waitForURL(/[?&]menu=1/), page.locator('#btn-menu').click()]);
    await expect(page.locator('#menu-jouer')).toBeVisible({ timeout: 60_000 });
    await expect(page.locator('#menu-solde-texte')).toHaveText(`1${String.fromCharCode(0x202f)}334`);
    const mort = await page.evaluate((k) => JSON.parse(localStorage.getItem(k)), KEY);
    expect(mort.money - quitte.money).toBe(quitte.money - 1234);
    await page.evaluate(() => localStorage.clear());
  });

  test('retour du propriétaire : partie en plein écran puis « Revenir au menu principal » : le menu affiche un rappel et reprend le plein écran au premier toucher ; sans plein écran, ni rappel ni repère', async ({ page }) => {
    test.setTimeout(120_000);
    // Plein écran simulé (le navigateur de test n'en a pas) : demandes comptées.
    await page.addInitScript(() => {
      window.__demandes = 0;
      Element.prototype.requestFullscreen = function () {
        window.__demandes += 1;
        return Promise.resolve();
      };
    });
    await page.setViewportSize({ width: 932, height: 430 });
    await page.goto('/jeu.html?test=1&menu=1&seed=1');
    await expect(page.locator('#menu-jouer')).toBeVisible({ timeout: 60_000 });
    await expect(page.locator('#menu-rappel-plein')).toHaveCount(0);
    await page.locator('#menu-jouer').click();
    await page.waitForFunction(() => (window.__zs?.getState()?.time ?? 0) > 0.05, null, { timeout: 60_000 });
    await page.evaluate(() => Object.defineProperty(document, 'fullscreenElement', { configurable: true, get: () => document.documentElement }));
    await page.locator('#btn-pause').click();
    await page.locator('#btn-quit').click();
    const rechargement = page.waitForEvent('framenavigated', { predicate: (f) => f === page.mainFrame() });
    await page.locator('#btn-quit-ok').click();
    expect((await rechargement).url()).toMatch(/[?&]menu=1.*#plein-ecran$/); // repère posé avant le rechargement
    await expect(page.locator('#menu-jouer')).toBeVisible({ timeout: 60_000 });
    await expect(page.locator('#menu-rappel-plein')).toHaveText('Touchez l\'écran pour revenir en plein écran');
    expect(new URL(page.url()).hash).toBe(''); // repère retiré de l'adresse
    expect(await page.evaluate(() => window.__demandes)).toBe(0);
    await page.mouse.click(466, 300);
    await expect(page.locator('#menu-rappel-plein')).toHaveCount(0);
    expect(await page.evaluate(() => window.__demandes)).toBe(1);
    // Partie hors plein écran : retour au menu sans repère ni rappel.
    await page.locator('#menu-jouer').click();
    await page.waitForFunction(() => (window.__zs?.getState()?.time ?? 0) > 0.05, null, { timeout: 60_000 });
    await page.locator('#btn-pause').click();
    await page.locator('#btn-quit').click();
    await Promise.all([page.waitForURL(/[?&]menu=1/), page.locator('#btn-quit-ok').click()]);
    await expect(page.locator('#menu-jouer')).toBeVisible({ timeout: 60_000 });
    expect(new URL(page.url()).hash).toBe('');
    await expect(page.locator('#menu-rappel-plein')).toHaveCount(0);
  });

  test('sans paramètre (canal source) : écran de chargement puis menu, sans crochet de test ; « JOUER » montre la partie', async ({ page, baseURL }) => {
    const o = surveiller(page, baseURL);
    await page.setViewportSize(REF);
    await page.goto('/jeu.html');
    await expect(page.locator('#e7-titre')).toBeVisible();
    await expect(page.locator('#menu-jouer')).toBeVisible({ timeout: 60_000 });
    expect(await page.evaluate(() => [typeof window.__zs, typeof window.__zsMenu])).toEqual(['undefined', 'undefined']);
    await expect(page.locator('#game-root')).toBeHidden();
    await page.locator('#menu-jouer').click();
    // Lot 8a (retours du propriétaire) : le jeu ne se charge qu'à « JOUER », sous l'écran de chargement ; la chute du Z s'y rejoue, et la partie
    // n'est créée qu'après la chute (elle ne tourne jamais cachée).
    await expect(page.locator('#e7.e7-phase-jeu.e7-joue')).toBeVisible();
    expect(await page.evaluate(() => ({ animee: document.getElementById('e7-z').getAnimations().map((x) => x.animationName), partie: typeof window.__zs }))).toEqual({ animee: ['e7-chute'], partie: 'undefined' });
    await expect(page.locator('#e7-texte')).toHaveText('Chargement de la partie…');
    await expect(page.locator('#game-root')).toBeVisible({ timeout: 60_000 });
    await expect(page.locator('#e7')).toHaveCount(0, { timeout: 60_000 });
    await expect(page.locator('#hud-chrono-text')).not.toHaveText('', { timeout: 30_000 });
    expect(o.externes).toEqual([]);
    expect(o.problemes).toEqual([]);
  });
});
