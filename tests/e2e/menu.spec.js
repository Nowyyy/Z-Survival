// Lot 8a : écran de chargement (E7) et menu principal (E8) de jeu.html, démarrage et retour au menu (Docs/ref/menu-principal.md).
// ?test=1&menu=1 (window.__zsMenu, window.__zs) et, sans paramètre, le canal source ; 932 × 430 (référence), 667 × 375, 1440 × 900.
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { CHAMPS_STOCKES } from '../../js/core/progression.js';
import { nomsDuCode } from './helpers.js';
import { RETOUR_SANS_RECHARGEMENT } from '../../js/core/menu-etat.js'; // lot 9d : option à l'essai (les tests la suivent)

const REF = { width: 932, height: 430 };
const KEY = 'zs.save.v2'; // lot 8h : progression v2
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

// Lot 9d : retour au menu (« Quitter », « Revenir au menu principal ») : sans rechargement (même adresse, aucune navigation, le menu revient) ;
// option démontée (RETOUR_SANS_RECHARGEMENT = false, js/core/menu-etat.js) : rechargement vers menu=1, comme avant le lot 9d.
async function retourSansRechargement(page, bouton) {
  if (!RETOUR_SANS_RECHARGEMENT) {
    await Promise.all([page.waitForURL(/[?&]menu=1/), page.locator(bouton).click()]);
    await expect(page.locator('#menu-jouer')).toBeVisible({ timeout: 60_000 });
    return;
  }
  const url = page.url();
  let navigations = 0;
  const compter = (f) => {
    if (f === page.mainFrame()) navigations += 1;
  };
  page.on('framenavigated', compter);
  await page.locator(bouton).click();
  await expect(page.locator('#menu-jouer')).toBeVisible({ timeout: 60_000 });
  page.off('framenavigated', compter);
  expect([navigations, page.url()]).toEqual([0, url]);
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

});

test.describe('menu principal (E8)', () => {
  // Lot 8l : les tests « en-tête, onglets et Jouer à leur place » (3 tailles) et « prefers-reduced-motion : le Z est posé » sont fusionnés dans
  // menu-onglets.spec.js (même chargement que ses tests « onglet Jouer » aux mêmes tailles et « prefers-reduced-motion : scène fixe »).

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

  test('trois barres : ouverture sous le bouton, cinq entrées (lot 8g : Crédits, Google ; sans Déconnexion hors connexion), Échap et appui ailleurs ; point jaune présent puis absent après Information ; Discord grisé (« bientôt ») et aucune requête ; Déconnexion grisée ; axe', async ({ page, baseURL }) => {
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
    await expect(liste.locator('.e8-entree')).toHaveText([/^Options$/, /^Information/, /^Crédits$/, /^Discord\s*bientôt$/, /^Se connecter avec Google\s*bientôt$/]); // lot 8g : Déconnexion seulement une fois connecté (avant : grisée, « non connecté ») // lot 8g : Crédits entre Information et Discord ; Google (bientôt) avant Déconnexion
    await expect(page.locator('#menu-point-info')).toBeVisible();
    await expect(page.locator('#menu-discord')).toBeDisabled();
    await expect(page.locator('#menu-deconnexion')).toHaveCount(0);
    await expect(page.locator('#menu-google')).toBeDisabled();
    for (const s of ['#menu-options', '#menu-information', '#menu-credits', '#menu-discord', '#menu-google']) expect((await boite(page, s)).h, s).toBeGreaterThanOrEqual(44);
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

  // Lot 8h : nouveautés lues gardées dans la progression v2 (zs.save.v2, champ lues) : une écriture la première fois, le point jaune ne revient pas.
  test('?store=local : Information ouverte une fois → nouveautés lues gardées (une écriture) ; rechargement : point jaune absent, rouvrir n\'écrit rien', async ({ page }) => {
    await page.addInitScript(() => {
      if (!sessionStorage.getItem('zs.test.lues')) {
        sessionStorage.setItem('zs.test.lues', '1');
        localStorage.clear();
      }
      window.__ecritures = [];
      const set = Storage.prototype.setItem;
      Storage.prototype.setItem = function (k, v) { if (this === window.localStorage) window.__ecritures.push(k); return set.call(this, k, v); };
    });
    await ouvrirMenu(page, REF, '&store=local');
    await expect(page.locator('.e8-point-barres')).toBeVisible();
    const information = async () => {
      await page.locator('#menu-trois-barres').click();
      await page.locator('#menu-information').click();
      await expect(page.getByRole('dialog', { name: 'Information' })).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(page.getByRole('dialog', { name: 'Information' })).toBeHidden();
    };
    await information();
    await expect.poll(() => page.evaluate(() => window.__ecritures)).toEqual(['zs.save.v2']);
    const ids = await page.evaluate(() => fetch('data/menu/infos.json').then((r) => r.json()).then((d) => d.infos.map((x) => x.id)));
    expect((await page.evaluate(() => JSON.parse(localStorage.getItem('zs.save.v2')))).lues).toEqual(ids);
    await page.reload();
    await expect(page.locator('#menu-jouer')).toBeVisible({ timeout: 60_000 });
    await page.waitForFunction(() => window.__zsMenu?.etat()?.menu !== null && !document.getElementById('e7'));
    await expect(page.locator('.e8-point-barres')).toBeHidden();
    expect((await etatMenu(page)).menu.nonLue).toBe(false);
    await information();
    expect(await page.evaluate(() => window.__ecritures)).toEqual([]);
    await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
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

  test('Information (lot 8g, retour du propriétaire) : chaque nouveauté dans un cadre sur toute la largeur, haut comme son contenu ; cadres empilés ; la liste défile quand ils dépassent (molette), l\'écran non', async ({ page }) => {
    const infos = { infos: Array.from({ length: 6 }, (_, i) => ({ id: `n${i}`, date: `2026-11-1${i}`, titre: `Nouveauté ${i + 1}`, texte: i % 2 ? ['Une ligne', 'Deux lignes'] : 'Une seule ligne' })) };
    await page.route('**/data/menu/infos.json', (r) => r.fulfill({ contentType: 'application/json', body: JSON.stringify(infos) }));
    for (const size of [{ width: 932, height: 430 }, { width: 667, height: 375 }]) {
      await ouvrirMenu(page, size);
      await page.locator('#menu-trois-barres').click();
      await page.locator('#menu-information').click();
      const cadres = page.locator('#menu-infos .e8-info');
      await expect(cadres).toHaveCount(6);
      const zone = await boite(page, '#menu-ecran-information .e8-panneau-corps');
      const panneau = await page.locator('#menu-ecran-information .e8-panneau').evaluate((n) => {
        const r = n.getBoundingClientRect();
        const st = getComputedStyle(n);
        return { l: r.left + parseFloat(st.paddingLeft), r: r.right - parseFloat(st.paddingRight) };
      });
      expect([Math.abs(zone.l - panneau.l) < 1, Math.abs(zone.r - panneau.r) < 1]).toEqual([true, true]); // toute la largeur (plus de limite de 70 caractères)
      const b = await cadres.evaluateAll((ns) => ns.map((n) => {
        const r = n.getBoundingClientRect();
        const st = getComputedStyle(n);
        return { l: r.left, r: r.right, t: r.top, b: r.bottom, h: r.height, bord: st.borderTopWidth, contenu: n.scrollHeight <= n.clientHeight + 1 };
      }));
      for (const [i, c] of b.entries()) {
        expect([c.l - zone.l < 1, zone.r - c.r < 12, c.bord, c.contenu], `cadre ${i}`).toEqual([true, true, '2px', true]); // largeur de la zone (barre de défilement mise à part), bordé, rien de coupé
        if (i > 0) expect(c.t, `cadre ${i}`).toBeGreaterThanOrEqual(b[i - 1].b); // empilés, sans chevauchement
      }
      expect(b[1].h).toBeGreaterThan(b[0].h); // haut comme son contenu (deux lignes contre une)
      const titre = await boite(page, '#menu-infos .e8-info:first-child .e8-info-titre');
      const date = await boite(page, '#menu-infos .e8-info:first-child .e8-info-date');
      expect([date.l >= titre.r, Math.abs(date.t - titre.t) < 8]).toEqual([true, true]); // date à droite du titre
      const defile = await page.locator('#menu-ecran-information .e8-panneau-corps').evaluate((n) => ({ deborde: n.scrollHeight > n.clientHeight + 1, overflow: getComputedStyle(n).overflowY }));
      expect(defile).toEqual({ deborde: true, overflow: 'auto' });
      await page.mouse.move((zone.l + zone.r) / 2, (zone.t + zone.b) / 2);
      await page.mouse.wheel(0, 300);
      await expect.poll(() => page.locator('#menu-ecran-information .e8-panneau-corps').evaluate((n) => n.scrollTop)).toBeGreaterThan(0);
      expect(await page.evaluate(() => [document.scrollingElement.scrollTop, window.scrollY])).toEqual([0, 0]);
      expect((await new AxeBuilder({ page }).include('#menu-ecran-information').analyze()).violations.map((v) => v.id)).toEqual([]);
    }
  });

  test('Connexion : le Profil (lot 8g ; avant : écran provisoire « Connexion : bientôt »), fermé par « ‹ Menu » ; Options : la page Options du menu (E5, lot 8c) hors partie, fermée par « ‹ Menu » et Échap', async ({ page }) => {
    await ouvrirMenu(page);
    await page.locator('#menu-profil').click();
    const connexion = page.locator('#menu-ecran-profil'); // lot 8g, retour du propriétaire : « Connexion » ouvre le Profil
    await expect(connexion).toBeVisible();
    await page.locator('#menu-ecran-profil-retour').click();
    await expect(connexion).toBeHidden();
    await expect(page.locator('#menu-profil')).toBeFocused();
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
  test('solde des médailles de l\'en-tête = progression (?store=local, lot 8h) ; « JOUER » lance la partie (manche 1) ; « Quitter » confirmé ramène au menu, les médailles et la jaune de la partie perdues (la mort garde les médailles) ; seule écriture du menu : les nouveautés lues (lot 8h)', async ({ page }) => {
    test.setTimeout(150_000);
    await page.setViewportSize(REF);
    // Sauvegarde de départ (chemin normal du jeu : gain puis écriture), puis visite du menu : clés et contenu identiques avant et après.
    await page.goto('/jeu.html?test=1&store=local&seed=1');
    await page.waitForFunction(() => (window.__zs?.getState()?.time ?? 0) > 0.05, null, { timeout: 60_000 });
    // Lot 8h : progression v2 de départ posée telle quelle (1 234 médailles), puis visite du menu.
    await page.evaluate(([k, texte]) => localStorage.setItem(k, texte), [KEY, JSON.stringify({ v: 2, rev: 1, savedAt: 1, [CHAMPS_STOCKES.medailles]: { gagne: 1234, depense: 0 } })]); // lot 9b : champ stocké
    const avant = await page.evaluate(() => Object.fromEntries(Object.keys(localStorage).map((k) => [k, localStorage.getItem(k)])));
    await page.addInitScript(() => {
      window.__ecritures = [];
      const set = Storage.prototype.setItem;
      Storage.prototype.setItem = function (k, v) { window.__ecritures.push(k); return set.call(this, k, v); };
    });
    await ouvrirMenu(page, REF, '&store=local');
    await expect(page.locator('#menu-solde-texte')).toHaveText(`1${String.fromCharCode(0x202f)}234`);
    await expect(page.locator('#menu-solde')).toContainText('Médailles : 1'); // lot 9a : appelées « Diamants » en V0.8
    await page.locator('#menu-onglet-infini').click();
    await page.locator('#menu-trois-barres').click();
    await page.locator('#menu-information').click();
    await expect(page.getByRole('dialog', { name: 'Information' })).toBeVisible();
    await page.keyboard.press('Escape');
    await page.locator('#menu-onglet-jouer').click();
    const apres = await page.evaluate(() => [window.__ecritures, Object.fromEntries(Object.keys(localStorage).map((k) => [k, localStorage.getItem(k)])), sessionStorage.length]);
    // Lot 8h : seule écriture de la visite, les nouveautés lues (Information) ; le solde des médailles et les autres clés sont inchangés.
    expect([apres[0], Object.keys(apres[1]).sort(), apres[2]]).toEqual([[KEY], Object.keys(avant).sort(), 0]);
    for (const k of Object.keys(avant)) if (k !== KEY) expect(apres[1][k], k).toBe(avant[k]);
    const lu = nomsDuCode(JSON.parse(apres[1][KEY]));
    expect([lu.medailles, lu.lues.length > 0, lu.rev]).toEqual([{ gagne: 1234, depense: 0 }, true, 2]);
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
    // Quitter : manche 1 terminée (20 médailles) et 50 jaunes, confirmation (Annuler d'abord), puis retour au menu ; tout ce que la partie a rapporté est perdu (lot 9a).
    await page.evaluate(() => { const zs = window.__zs; zs.giveMoney(50); zs.step(3.2); zs.skipWave(); zs.step(0.2); });
    await page.locator('#btn-pause').click();
    await page.locator('#btn-quit').click();
    await expect(page.locator('#quit-confirm-text')).toHaveText('Quitter la partie ? Les médailles, les diamants et les Zollars gagnés pendant cette partie seront perdus.'); // lot 9a
    await expect(page.locator('#btn-quit-cancel')).toBeFocused();
    // Retour du propriétaire : la question ne touche plus les boutons (avant : 0 px d'écart).
    const ecart = await page.evaluate(() => document.getElementById('btn-quit-ok').getBoundingClientRect().top - document.getElementById('quit-confirm-text').getBoundingClientRect().bottom);
    expect(ecart).toBeGreaterThanOrEqual(8);
    await page.locator('#btn-quit-cancel').click();
    await expect(page.locator('#btn-resume')).toBeVisible();
    await page.locator('#btn-quit').click();
    await retourSansRechargement(page, '#btn-quit-ok'); // lot 9d : sans rechargement (avant : rechargement vers menu=1)
    // Retour du propriétaire après le lot 9a : « Quitter » fait perdre les médailles de la partie (avant : 1 254, gardée comme à la mort).
    await expect(page.locator('#menu-solde-texte')).toHaveText(`1${String.fromCharCode(0x202f)}234`);
    const quitte = nomsDuCode(await page.evaluate((k) => JSON.parse(localStorage.getItem(k)), KEY));
    expect(quitte.medailles.gagne - quitte.medailles.depense).toBe(1234);
    expect(JSON.stringify(quitte)).not.toMatch(/money/);
    // Même gain, mort puis « Revenir au menu principal » : même solde, même chemin (bank.runEnd).
    await page.locator('#menu-jouer').click();
    await page.waitForFunction(() => (window.__zs?.getState()?.time ?? 0) > 0.05, null, { timeout: 60_000 });
    await page.evaluate(() => { const zs = window.__zs; zs.giveMoney(50); zs.step(3.2); zs.skipWave(); zs.step(0.2); zs.setChutes(0); zs.downPlayer(); zs.step(0.3); });
    await expect(page.locator('#end-panel')).toBeVisible();
    await retourSansRechargement(page, '#btn-menu'); // lot 9d : sans rechargement ; soldes relus
    await expect(page.locator('#menu-solde-texte')).toHaveText(`1${String.fromCharCode(0x202f)}254`); // la mort, elle, garde les médailles de la partie (+20)
    const mort = nomsDuCode(await page.evaluate((k) => JSON.parse(localStorage.getItem(k)), KEY));
    expect(mort.medailles.gagne - quitte.medailles.gagne).toBe(20);
    await page.evaluate(() => localStorage.clear());
  });

  // Lot 9d : le retour au menu ne recharge plus la page : le plein écran reste, sans rappel. Le rappel et le repère #plein-ecran ne servent plus
  // qu'au filet de sécurité (libération en échec, forcée ici par __zsCycle.echec()) : leur comportement d'avant est vérifié par ce chemin.
  test('retour du propriétaire : partie en plein écran puis « Quitter » : pas de rechargement, le plein écran reste, aucun rappel ; filet de sécurité (libération en échec) : rechargement avec #plein-ecran, rappel et plein écran repris au premier toucher ; sans plein écran, ni rappel ni repère', async ({ page }) => {
    test.setTimeout(180_000);
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
    if (RETOUR_SANS_RECHARGEMENT) {
      await page.locator('#btn-pause').click();
      await page.locator('#btn-quit').click();
      await retourSansRechargement(page, '#btn-quit-ok'); // lot 9d : le plein écran reste
      await expect(page.locator('#menu-rappel-plein')).toHaveCount(0);
      expect(await page.evaluate(() => [Boolean(document.fullscreenElement), window.__zsMenu.etat().menu.pleinEcran.actif, window.__demandes, location.hash])).toEqual([true, true, 0, '']);
      await page.locator('#menu-jouer').click();
      await page.waitForFunction(() => (window.__zs?.getState()?.time ?? 0) > 0.05, null, { timeout: 60_000 });
    }
    // Filet de sécurité (ou option démontée) : la libération échoue, le retour se fait par rechargement comme avant le lot 9d.
    await page.evaluate(() => window.__zsCycle.echec());
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
    // Partie hors plein écran, filet de sécurité : retour au menu par rechargement, sans repère ni rappel (#retour retiré aussitôt).
    await page.locator('#menu-jouer').click();
    await page.waitForFunction(() => (window.__zs?.getState()?.time ?? 0) > 0.05, null, { timeout: 60_000 });
    await page.evaluate(() => window.__zsCycle.echec());
    await page.locator('#btn-pause').click();
    await page.locator('#btn-quit').click();
    const second = page.waitForEvent('framenavigated', { predicate: (f) => f === page.mainFrame() });
    await page.locator('#btn-quit-ok').click();
    expect((await second).url()).toMatch(/[?&]menu=1.*#retour$/);
    await expect(page.locator('#menu-jouer')).toBeVisible({ timeout: 60_000 });
    expect(new URL(page.url()).hash).toBe('');
    await expect(page.locator('#menu-rappel-plein')).toHaveCount(0);
  });

  test('sans paramètre (canal source) : écran de chargement puis menu, sans crochet de test ; « JOUER » montre la partie', async ({ page, baseURL }) => {
    const o = surveiller(page, baseURL);
    await page.setViewportSize(REF);
    await page.goto('/jeu.html');
    // Lot 8g : sans paramètre, l'introduction du studio passe d'abord (attente du geste 4 s au plus, puis logo 6,5 s) : écran de chargement ensuite.
    await expect(page.locator('#e7-titre')).toBeVisible({ timeout: 30_000 });
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
