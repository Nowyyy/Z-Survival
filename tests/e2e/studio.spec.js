// Lot 8g : signature du studio et écrans de compte (Docs/ref/menu-principal.md, « Lot 8g ») : introduction E0 (logo animé de No Way Studio, passable,
// mouvement réduit, jamais en partie directe ni au retour d'une partie), logo sur l'écran de chargement E7 et dans le menu à trois barres.
// ?test=1&menu=1 (sans introduction) et &intro=1 (window.__zsMenu.intro()) ; 932 × 430 (référence), 667 × 375, 2000 × 1020, téléphone à encoche
// simulé (marges posées par variables) ; projets bureau et mobile (paysage). Les durées sont lues dans les horodatages de la page, jamais attendues.
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const REF = { width: 932, height: 430 };
const PETIT = { width: 667, height: 375 };
const LARGE = { width: 2000, height: 1020 };
const ENCOCHE = { width: 762, height: 351 };
const BRUIT = /GL Driver Message|GPU stall|swiftshader|WebGL/i; // messages du rendu logiciel de Chromium, sans rapport avec la page
const LOGO = 'assets/studio/no-way-studio-logo-anime.svg';
const FIXE = 'assets/studio/no-way-studio-logo-fixe.svg';

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

// Écritures dans le stockage comptées (localStorage et sessionStorage), et instant d'apparition du menu (#e8) et de l'introduction (#e0).
async function espions(page) {
  await page.addInitScript(() => {
    window.__ecritures = [];
    for (const nom of ['setItem', 'removeItem', 'clear']) {
      const orig = Storage.prototype[nom];
      Storage.prototype[nom] = function (...a) {
        window.__ecritures.push(`${this === window.sessionStorage ? 'session' : 'local'}.${nom}`);
        return orig.apply(this, a);
      };
    }
    window.__vus = {};
    new MutationObserver(() => {
      for (const id of ['e0', 'e8']) if (!window.__vus[id] && document.getElementById(id)) window.__vus[id] = performance.now();
    }).observe(document, { childList: true, subtree: true });
  });
}

const intro = (page) => page.evaluate(() => window.__zsMenu?.intro() ?? null);
const boite = (page, sel) => page.locator(sel).evaluate((n) => {
  const r = n.getBoundingClientRect();
  return { l: r.left, t: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height };
});
const chevauche = (x, y) => x.l < y.r - 0.5 && y.l < x.r - 0.5 && x.t < y.b - 0.5 && y.t < x.b - 0.5;
const imageAffichee = (page, sel) => page.locator(sel).evaluate((n) => n.complete && n.naturalWidth > 0 && n.src.startsWith('blob:'));

async function ouvrirIntro(page, size = REF, extra = '') {
  await page.setViewportSize(size);
  await page.goto(`/jeu.html?test=1&menu=1&intro=1&seed=1${extra}`);
  await page.waitForFunction(() => window.__zsMenu?.intro()?.phase === 'joue');
}
async function ouvrirMenu(page, size = REF) {
  await page.setViewportSize(size);
  await page.goto('/jeu.html?test=1&menu=1&seed=1');
  await expect(page.locator('#menu-jouer')).toBeVisible({ timeout: 60_000 });
  await page.waitForFunction(() => window.__zsMenu?.etat()?.menu !== null && !document.getElementById('e7'));
}

test.describe('introduction du studio (E0)', () => {
  for (const [size, encoche] of [[REF, false], [PETIT, false], [LARGE, false], [ENCOCHE, true]]) {
    test(`tailles ${size.width}×${size.height}${encoche ? ' (encoche simulée)' : ''} : fond noir, logo animé au centre dans l'écran, nom « No Way Studio » annoncé ; « Toucher pour passer » (44 px) au bout d'une seconde ; un appui passe ; axe`, async ({ page, baseURL }) => {
      const o = surveiller(page, baseURL);
      await ouvrirIntro(page, size);
      const e = await intro(page);
      expect([e.logo, e.reduit, e.passe, e.indice]).toEqual([LOGO, false, false, false]);
      await expect(page.locator('#e0-logo')).toHaveAttribute('alt', 'No Way Studio');
      await expect(page.locator('#e0-annonce')).toHaveText('No Way Studio');
      expect(await imageAffichee(page, '#e0-logo')).toBe(true);
      expect(await page.locator('#e0').evaluate((n) => getComputedStyle(n).backgroundColor)).toBe('rgb(0, 0, 0)');
      const b = await boite(page, '#e0-logo');
      expect([b.l >= 0, b.t >= 0, b.r <= size.width + 0.5, b.b <= size.height + 0.5]).toEqual([true, true, true, true]);
      expect(Math.abs((b.l + b.r) / 2 - size.width / 2)).toBeLessThan(1.5);
      expect(Math.abs((b.t + b.b) / 2 - size.height / 2)).toBeLessThan(1.5);
      expect(b.h).toBeLessThanOrEqual(size.height * 0.62 + 1);
      expect(b.w).toBeGreaterThan(Math.min(300, size.width * 0.4));
      await expect(page.locator('#e0-passer')).toHaveCSS('opacity', '0');
      await page.waitForFunction(() => window.__zsMenu.intro().indice);
      await expect(page.locator('#e0-passer')).toHaveText('Toucher pour passer');
      await expect(page.locator('#e0-passer')).toHaveCSS('opacity', '1');
      const p = await boite(page, '#e0-passer');
      expect([p.w >= 44, p.h >= 44, p.b <= size.height + 0.5, p.t >= b.b - 1]).toEqual([true, true, true, true]);
      expect((await new AxeBuilder({ page }).include('#e0').analyze()).violations.map((v) => v.id)).toEqual([]);
      await page.mouse.click(size.width * 0.3, size.height * 0.3);
      await expect(page.locator('#e0')).toHaveCount(0);
      expect((await intro(page)).passe).toBe(true);
      await expect(page.locator('#menu-jouer')).toBeVisible({ timeout: 60_000 });
      expect(await page.evaluate(() => window.__zsMenu.etat().menu.ecran)).toBe(null); // l'appui n'a rien déclenché dessous
      expect([o.problemes, o.externes]).toEqual([[], []]);
    });
  }

  test('durée de l\'animation (3,8 s depuis l\'affichage du logo), menu chargé pendant l\'introduction et ouvert aussitôt après (aucune attente ajoutée) ; puis E7 n\'existe plus ; aucune écriture', async ({ page, baseURL }) => {
    const o = surveiller(page, baseURL);
    await espions(page);
    await ouvrirIntro(page);
    // Le menu est prêt (chargement à 100 %) avant la fin de l'introduction : elle ne rallonge pas le démarrage.
    await page.waitForFunction(() => window.__zsMenu.etat()?.pret === true);
    expect((await intro(page)).phase).toBe('joue');
    expect(await page.evaluate(() => window.__zsMenu.etat().chuteFinie)).toBe(true); // Z posé sous l'introduction
    await page.waitForFunction(() => window.__zsMenu.intro().phase === 'finie', null, { timeout: 15_000 });
    const e = await intro(page);
    expect(e.passe).toBe(false);
    expect(e.fin - e.affiche).toBeGreaterThanOrEqual(3790);
    expect(e.fin - e.affiche).toBeLessThan(4600);
    expect(e.retire - e.fin).toBeLessThan(1000); // fondu de 0,4 s
    await expect(page.locator('#menu-jouer')).toBeVisible();
    const vu = await page.evaluate(() => window.__vus.e8);
    expect(vu - (e.debut + e.fin)).toBeLessThan(800); // menu affiché pendant le fondu
    await expect(page.locator('#e7')).toHaveCount(0);
    expect(await page.evaluate(() => window.__ecritures)).toEqual([]);
    expect(o.fichiers.filter((f) => f.endsWith('/js/menu/intro.js'))).toHaveLength(1);
    expect([o.problemes, o.externes]).toEqual([[], []]);
  });

  test('passée au clavier (une touche) : la touche ne va pas au menu ; Maj seule ne passe pas', async ({ page }) => {
    await ouvrirIntro(page);
    await page.keyboard.press('Shift');
    expect((await intro(page)).phase).toBe('joue');
    await page.keyboard.press('Escape');
    await expect(page.locator('#e0')).toHaveCount(0);
    const e = await intro(page);
    expect([e.passe, e.fin < 3790]).toEqual([true, true]);
    await expect(page.locator('#menu-jouer')).toBeVisible({ timeout: 60_000 });
    expect(await page.evaluate(() => window.__zsMenu.etat().menu.menuOuvert)).toBe(false);
  });

  test('prefers-reduced-motion : logo fixe (copie sans animation) 1 s, sans fondu, puis le menu ; « Toucher pour passer » visible tout de suite', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await ouvrirIntro(page);
    const e = await intro(page);
    expect([e.logo, e.reduit, e.indice]).toEqual([FIXE, true, true]);
    expect(await page.locator('#e0-logo').evaluate((n) => n.getAnimations().length)).toBe(0);
    await page.waitForFunction(() => window.__zsMenu.intro().phase === 'finie', null, { timeout: 10_000 });
    const f = await intro(page);
    expect(f.fin - f.affiche).toBeGreaterThanOrEqual(990);
    expect(f.fin - f.affiche).toBeLessThan(1600);
    expect(f.retire - f.fin).toBeLessThan(50); // retirée sans fondu (les deux horodatages sont lus l'un après l'autre)
    await expect(page.locator('#menu-jouer')).toBeVisible({ timeout: 60_000 });
  });

  test('jamais sans intro=1 sous ?test=1&menu=1, ni en partie directe ; démarrage du menu : 31 fichiers JavaScript (inchangé), 32 avec l\'introduction (intro.js)', async ({ page, baseURL }) => {
    let o = surveiller(page, baseURL);
    await espions(page);
    await ouvrirMenu(page);
    expect(await page.evaluate(() => [window.__vus.e0 ?? null, window.__zsMenu.intro()])).toEqual([null, null]);
    expect(o.fichiers.filter((f) => f.endsWith('.js')).length).toBe(31);
    expect(o.fichiers.filter((f) => f.endsWith('/js/menu/intro.js'))).toEqual([]);
    expect(o.fichiers.filter((f) => f.endsWith('.svg'))).toEqual([`/${FIXE}`]); // seul le logo fixe de l'écran de chargement
    await page.close();
    const p2 = await page.context().newPage();
    o = surveiller(p2, baseURL);
    await espions(p2);
    await p2.setViewportSize(REF);
    await p2.goto('/jeu.html?test=1&menu=1&intro=1&seed=1');
    await p2.locator('#e0').click({ position: { x: 20, y: 20 } });
    await expect(p2.locator('#menu-jouer')).toBeVisible({ timeout: 60_000 });
    expect(o.fichiers.filter((f) => f.endsWith('.js')).length).toBe(32);
    expect(o.fichiers.filter((f) => f.endsWith('.svg')).sort()).toEqual([`/${LOGO}`, `/${FIXE}`]);
    await p2.close();
    const p3 = await page.context().newPage();
    o = surveiller(p3, baseURL);
    await espions(p3);
    await p3.setViewportSize(REF);
    await p3.goto('/jeu.html?test=1&seed=1&intro=1');
    await p3.waitForFunction(() => (window.__zs?.getState()?.time ?? 0) >= 0, null, { timeout: 60_000 });
    expect(await p3.evaluate(() => window.__vus.e0 ?? null)).toBe(null);
    expect(o.fichiers.filter((f) => /\/js\/menu\/intro\.js$|\/assets\/studio\//.test(f))).toEqual([]);
  });

  test('précision du propriétaire : lancement → introduction ; « Quitter » puis retour au menu → pas d\'introduction (repère #retour, retiré aussitôt de l\'adresse) ; nouveau lancement → introduction ; aucune écriture dans le stockage pour cela', async ({ page }) => {
    test.setTimeout(150_000);
    await espions(page);
    await ouvrirIntro(page);
    await page.keyboard.press('Space');
    await expect(page.locator('#menu-jouer')).toBeVisible({ timeout: 60_000 });
    await page.locator('#menu-jouer').click();
    await page.waitForFunction(() => (window.__zs?.getState()?.time ?? 0) > 0.05, null, { timeout: 60_000 });
    const avant = await page.evaluate(() => window.__ecritures.filter((e) => !e.startsWith('local.')));
    await page.locator('#btn-pause').click();
    await page.locator('#btn-quit').click();
    const rechargement = page.waitForEvent('framenavigated', { predicate: (f) => f === page.mainFrame() });
    await page.locator('#btn-quit-ok').click();
    expect((await rechargement).url()).toMatch(/[?&]menu=1.*[?&]intro=1.*#retour$|[?&]intro=1.*[?&]menu=1.*#retour$/);
    await expect(page.locator('#menu-jouer')).toBeVisible({ timeout: 60_000 });
    expect(await page.evaluate(() => [window.__vus.e0 ?? null, window.__zsMenu.intro(), location.hash])).toEqual([null, null, '']);
    expect(await page.evaluate(() => window.__ecritures)).toEqual([]); // compté depuis le rechargement : rien
    expect(avant).toEqual([]); // ni sessionStorage, ni autre chose que la sauvegarde de la partie
    // Fin de partie puis « Revenir au menu principal » : même repère, pas d'introduction.
    await page.locator('#menu-jouer').click();
    await page.waitForFunction(() => (window.__zs?.getState()?.time ?? 0) > 0.05, null, { timeout: 60_000 });
    await page.evaluate(() => { const zs = window.__zs; zs.setChutes(0); zs.downPlayer(); zs.step(0.3); });
    await expect(page.locator('#end-panel')).toBeVisible();
    await Promise.all([page.waitForURL(/#retour$/), page.locator('#btn-menu').click()]);
    await expect(page.locator('#menu-jouer')).toBeVisible({ timeout: 60_000 });
    expect(await page.evaluate(() => [window.__vus.e0 ?? null, location.hash])).toEqual([null, '']);
    // Nouveau lancement (même adresse, sans repère) : introduction.
    await page.goto('/jeu.html?test=1&menu=1&intro=1&seed=1');
    await page.waitForFunction(() => window.__zsMenu?.intro()?.phase === 'joue');
    await expect(page.locator('#e0-logo')).toBeVisible();
  });
});

test.describe('logo du studio : écran de chargement et menu à trois barres', () => {
  for (const [size, encoche] of [[REF, false], [PETIT, false], [LARGE, false], [ENCOCHE, true]]) {
    test(`tailles ${size.width}×${size.height}${encoche ? ' (encoche simulée)' : ''} : E7, logo fixe en bas à gauche (16 px des bords de la zone sûre), sans toucher barre, astuce ni version ; menu à trois barres : logo à côté de la version (à sa droite) ; axe`, async ({ page, baseURL }) => {
      const o = surveiller(page, baseURL);
      if (encoche) await page.addInitScript(() => document.addEventListener('DOMContentLoaded', () => {
        const s = document.createElement('style');
        s.textContent = '#e7 { --e7-sur-g: 50px; --e7-sur-b: 21px; } #e8 { --e8-gauche: 50px !important; --e8-droite: 50px !important; }';
        document.head.append(s);
      }));
      await page.setViewportSize(size);
      await page.goto('/jeu.html?test=1&menu=1&seed=1');
      await expect(page.locator('#e7-studio')).toBeVisible();
      await page.waitForFunction(() => document.getElementById('e7-studio')?.complete && document.getElementById('e7-studio').naturalWidth > 0);
      await expect(page.locator('#e7-studio')).toHaveAttribute('alt', 'No Way Studio');
      const g = encoche ? 50 : 0;
      const bas = encoche ? 21 : 0;
      const l = await boite(page, '#e7-studio');
      expect(Math.abs(l.l - (16 + g))).toBeLessThan(0.6);
      expect(Math.abs(size.height - l.b - (16 + bas))).toBeLessThan(0.6);
      expect(l.h).toBeGreaterThanOrEqual(36);
      for (const sel of ['#e7-barre', '#e7-astuce', '#e7-version', '.e7-etat', '#e7-titre']) {
        if (!(await page.locator(sel).isVisible())) continue;
        expect(chevauche(l, await boite(page, sel)), sel).toBe(false);
      }
      expect(await page.locator('#e7-studio').evaluate((n) => n.getAnimations().length)).toBe(0);
      expect((await new AxeBuilder({ page }).include('#e7').analyze()).violations.map((v) => v.id)).toEqual([]);
      await expect(page.locator('#menu-jouer')).toBeVisible({ timeout: 60_000 });
      await page.locator('#menu-trois-barres').click();
      await expect(page.locator('#menu-studio')).toBeVisible();
      await expect(page.locator('#menu-version')).toBeVisible();
      await page.waitForFunction(() => document.getElementById('menu-studio').complete && document.getElementById('menu-studio').naturalWidth > 0);
      expect(await imageAffichee(page, '#menu-studio')).toBe(true);
      await expect(page.locator('#menu-studio')).toHaveAttribute('alt', 'No Way Studio');
      const s = await boite(page, '#menu-studio');
      const v = await boite(page, '#menu-version');
      const liste = await boite(page, '#menu-liste');
      expect([s.l >= v.r, s.l - v.r <= 12, Math.abs((s.t + s.b) / 2 - (v.t + v.b) / 2) < 3, s.r <= liste.r, s.b <= liste.b, s.t >= (await boite(page, '#menu-deconnexion')).b]).toEqual([true, true, true, true, true, true]);
      expect([liste.r <= size.width + 0.5, liste.b <= size.height + 0.5]).toEqual([true, true]);
      expect((await new AxeBuilder({ page }).include('#menu-liste').analyze()).violations.map((x) => x.id)).toEqual([]);
      expect(o.fichiers.filter((f) => f.endsWith('.svg'))).toEqual([`/${FIXE}`]); // une seule requête : l'image est réutilisée
      expect([o.problemes, o.externes]).toEqual([[], []]);
    });
  }

  test('E7 de la partie (après « JOUER ») : logo en bas à gauche aussi', async ({ page }) => {
    await ouvrirMenu(page);
    await page.locator('#menu-jouer').click();
    await expect(page.locator('#e7.e7-phase-jeu #e7-studio')).toBeVisible();
    const l = await boite(page, '#e7.e7-phase-jeu #e7-studio');
    expect([Math.abs(l.l - 16) < 0.6, Math.abs(REF.height - l.b - 16) < 0.6]).toEqual([true, true]);
  });
});
