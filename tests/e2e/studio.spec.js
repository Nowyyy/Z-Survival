// Lot 8g : signature du studio et écrans de compte (Docs/ref/menu-principal.md, « Lot 8g ») : introduction E0 (logo animé de No Way Studio, passable,
// mouvement réduit, jamais en partie directe ni au retour d'une partie), logo sur l'écran de chargement E7 et dans le menu à trois barres.
// ?test=1&menu=1 (sans introduction) et &intro=1 (window.__zsMenu.intro()) ; 932 × 430 (référence), 667 × 375, 2000 × 1020, téléphone à encoche
// simulé (marges posées par variables) ; projets bureau et mobile (paysage). Les durées sont lues dans les horodatages de la page, jamais attendues.
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { readFileSync } from 'node:fs';
import { decodeSave, defaultSave, encodeSave } from '../../js/core/save.js';

const REF = { width: 932, height: 430 };
const PETIT = { width: 667, height: 375 };
const LARGE = { width: 2000, height: 1020 };
const ENCOCHE = { width: 762, height: 351 };
const BRUIT = /GL Driver Message|GPU stall|swiftshader|WebGL/i; // messages du rendu logiciel de Chromium, sans rapport avec la page
const LOGO = 'assets/studio/no-way-studio-logo-anime.svg';
const FIXE = 'assets/studio/no-way-studio-logo-fixe.svg';
const SON = 'assets/studio/no-way-studio-logo-son.mp3';

function surveiller(page, baseURL) {
  const problemes = [];
  const externes = [];
  const fichiers = [];
  page.on('console', (m) => ['error', 'warning'].includes(m.type()) && !BRUIT.test(m.text()) && problemes.push(m.text()));
  page.on('pageerror', (e) => problemes.push(e.message));
  page.on('request', (r) => {
    const u = r.url();
    if (u.startsWith(baseURL)) fichiers.push(new URL(u).pathname);
    else if (!u.startsWith('data:')) externes.push(u); // lot 8g : le logo s'affiche par une adresse data:, sans requête
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
      for (const id of ['e0', 'e7', 'e8']) if (!window.__vus[id] && document.getElementById(id)) window.__vus[id] = performance.now();
    }).observe(document, { childList: true, subtree: true });
    // Fichiers demandés pendant que le logo se joue (de son affichage au début du fondu).
    window.__fichiersIntro = [];
    new PerformanceObserver((l) => {
      const i = window.__zsMenu?.intro?.();
      if (!i || i.phase !== 'joue') return;
      for (const e of l.getEntries()) window.__fichiersIntro.push(new URL(e.name).pathname);
    }).observe({ type: 'resource' });
  });
}

const intro = (page) => page.evaluate(() => window.__zsMenu?.intro() ?? null);
const boite = (page, sel) => page.locator(sel).evaluate((n) => {
  const r = n.getBoundingClientRect();
  return { l: r.left, t: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height };
});
const chevauche = (x, y) => x.l < y.r - 0.5 && y.l < x.r - 0.5 && x.t < y.b - 0.5 && y.t < x.b - 0.5;
const imageAffichee = (page, sel) => page.locator(sel).evaluate((n) => n.complete && n.naturalWidth > 0 && n.src.startsWith('data:image/svg+xml'));

// Retour du propriétaire (son du logo) : l'introduction attend un premier geste (« Toucher pour commencer ») ; un toucher la démarre (logo et son).
async function ouvrirIntro(page, size = REF, extra = '') {
  await page.setViewportSize(size);
  await page.goto(`/jeu.html?test=1&menu=1&intro=1&seed=1${extra}`);
  await page.waitForFunction(() => ['geste', 'joue'].includes(window.__zsMenu?.intro()?.phase));
  if ((await page.evaluate(() => window.__zsMenu.intro().phase)) === 'geste') await page.mouse.click(size.width / 2, size.height / 3);
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
      expect([e.logo, e.reduit, e.passe, e.indice, e.son]).toEqual([LOGO, false, false, false, 'joue']);
      expect(Math.abs(e.sonDebut - e.affiche)).toBeLessThan(100); // son et animation partent ensemble
      await expect(page.locator('#e0-logo')).toHaveAttribute('alt', 'No Way Studio');
      await expect(page.locator('#e0-annonce')).toHaveText('No Way Studio');
      expect(await imageAffichee(page, '#e0-logo')).toBe(true);
      expect(await page.locator('#e0').evaluate((n) => getComputedStyle(n).backgroundColor)).toBe('rgb(0, 0, 0)');
      const b = await boite(page, '#e0-logo');
      expect([b.l >= 0, b.t >= 0, b.r <= size.width + 0.5, b.b <= size.height + 0.5]).toEqual([true, true, true, true]);
      expect(Math.abs((b.l + b.r) / 2 - size.width / 2)).toBeLessThan(1.5);
      expect(Math.abs((b.t + b.b) / 2 - size.height / 2)).toBeLessThan(1.5);
      expect(b.h).toBeLessThanOrEqual(size.height * 0.62 + 1);
      expect(b.h).toBeGreaterThan(Math.min(size.height * 0.6, 720 * 628 / 824 - 1)); // 62 % de la hauteur (ou 720 px de large) : nouveau logo, moins large
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

  test('retour du propriétaire : durée du son (6,5 s depuis l\'affichage du logo ; avant : 3,8 s) ; rien du menu ne se charge pendant le logo ; à sa fin, l\'écran de chargement complet (chute du Z, barre jusqu\'à 100 %), puis le menu ; aucune écriture', async ({ page, baseURL }) => {
    test.setTimeout(90_000);
    const o = surveiller(page, baseURL);
    await espions(page);
    await ouvrirIntro(page);
    expect(await page.evaluate(() => [window.__zsMenu.etat(), document.getElementById('e7')])).toEqual([null, null]);
    await page.waitForFunction(() => window.__zsMenu.intro().phase !== 'joue', null, { timeout: 15_000 });
    const e = await intro(page);
    expect(e.passe).toBe(false);
    expect(e.fin - e.affiche).toBeGreaterThanOrEqual(6490); // durée du son (avant le son : 3,8 s)
    expect(e.fin - e.affiche).toBeLessThan(7300);
    expect(e.son).toBe('eteint');
    // Pendant le logo : ni écran de chargement, ni module du menu, ni ses données.
    const pendant = (await page.evaluate(() => window.__fichiersIntro)) ?? [];
    expect(pendant.filter((f) => /\/js\/menu\/(chargement|menu|jouer)\.js$|\/data\/menu\/|\/data\/game\//.test(f))).toEqual([]);
    // À la fin du logo : l'écran de chargement apparaît (sous le fondu), chute du Z jouée, puis le menu.
    await expect(page.locator('#menu-jouer')).toBeVisible({ timeout: 60_000 });
    const vus = await page.evaluate(() => window.__vus);
    expect(vus.e7 - (e.debut + e.fin)).toBeGreaterThanOrEqual(-5);
    expect(vus.e7 - (e.debut + e.fin)).toBeLessThan(1500);
    expect(vus.e8 - vus.e7).toBeGreaterThan(2000); // la chute du Z (2,8 s) se joue avant le menu
    const ch = await page.evaluate(() => window.__zsMenu.etat());
    expect([ch.phase, ch.chuteFinie, ch.journal.at(-1)]).toEqual(['menu', true, 100]);
    await expect(page.locator('#e0')).toHaveCount(0);
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
    expect([e.passe, e.fin - e.affiche < 6490, e.son]).toEqual([true, true, 'eteint']); // son éteint en fondu
    await expect(page.locator('#menu-jouer')).toBeVisible({ timeout: 60_000 });
    expect(await page.evaluate(() => window.__zsMenu.etat().menu.menuOuvert)).toBe(false);
  });

  test('prefers-reduced-motion : logo fixe (copie sans animation) 1 s, sans fondu, puis le menu ; « Toucher pour passer » visible tout de suite', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await ouvrirIntro(page);
    const e = await intro(page);
    expect([e.logo, e.reduit, e.indice, e.son, e.geste]).toEqual([FIXE, true, true, 'aucun', null]); // ni attente du geste, ni son
    expect(await page.locator('#e0-logo').evaluate((n) => n.getAnimations().length)).toBe(0);
    await page.waitForFunction(() => window.__zsMenu.intro().phase === 'finie', null, { timeout: 10_000 });
    const f = await intro(page);
    expect(f.fin - f.affiche).toBeGreaterThanOrEqual(990);
    expect(f.fin - f.affiche).toBeLessThan(1600);
    expect(f.retire - f.fin).toBeLessThan(50); // retirée sans fondu (les deux horodatages sont lus l'un après l'autre)
    await expect(page.locator('#menu-jouer')).toBeVisible({ timeout: 60_000 });
  });

  test('retour du propriétaire (son du logo) : attente du premier geste (« Toucher pour commencer » au milieu, sans logo, aucun contexte audio ni son avant) ; sans geste pendant 4 s, le logo se joue sans son ; au clavier, une touche démarre logo et son', async ({ page, baseURL }) => {
    const o = surveiller(page, baseURL);
    await page.addInitScript(() => {
      window.__contextes = 0;
      const AC = window.AudioContext;
      window.AudioContext = class extends AC {
        constructor(...a) {
          super(...a);
          window.__contextes += 1;
        }
      };
    });
    await page.setViewportSize(REF);
    await page.goto('/jeu.html?test=1&menu=1&intro=1&seed=1');
    await page.waitForFunction(() => window.__zsMenu?.intro()?.phase === 'geste');
    await expect(page.locator('#e0-commencer')).toHaveText('Toucher pour commencer');
    const c = await boite(page, '#e0-commencer');
    expect([c.w >= 44, c.h >= 44, c.b <= REF.height + 0.5]).toEqual([true, true, true]);
    // Retour du propriétaire : écran d'attente sans logo, texte au milieu de l'écran.
    await expect(page.locator('#e0-logo')).toBeHidden();
    expect((await intro(page)).logo).toBe(null);
    expect([Math.abs((c.l + c.r) / 2 - REF.width / 2) < 1.5, Math.abs((c.t + c.b) / 2 - REF.height / 2) < 1.5]).toEqual([true, true]);
    expect(await page.evaluate(() => window.__contextes)).toBe(0); // aucun contexte audio avant un geste
    expect((await new AxeBuilder({ page }).include('#e0').analyze()).violations.map((v) => v.id)).toEqual([]);
    // Sans geste : départ sans son au bout de 4 s.
    await page.waitForFunction(() => window.__zsMenu.intro().phase === 'joue', null, { timeout: 10_000 });
    const e = await intro(page);
    expect([e.son, e.geste, e.logo]).toEqual(['muet', null, LOGO]);
    expect(e.affiche).toBeGreaterThanOrEqual(3990);
    expect(await page.evaluate(() => window.__contextes)).toBe(0);
    await expect(page.locator('#e0-commencer')).toBeHidden();
    // Nouveau lancement : une touche (Entrée) démarre le logo et le son.
    await page.goto('/jeu.html?test=1&menu=1&intro=1&seed=1');
    await page.waitForFunction(() => window.__zsMenu?.intro()?.phase === 'geste');
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => window.__zsMenu.intro().son === 'joue');
    const f = await intro(page);
    expect([f.phase, f.logo, f.passe]).toEqual(['joue', LOGO, false]); // la touche a démarré, sans passer
    expect(Math.abs(f.sonDebut - f.affiche)).toBeLessThan(100);
    expect(await page.evaluate(() => window.__contextes)).toBe(1);
    expect(o.fichiers.filter((x) => x.endsWith('.mp3'))).toEqual([`/${SON}`, `/${SON}`]); // une fois par chargement de page
    expect([o.problemes, o.externes]).toEqual([[], []]);
  });

  test('jamais sans intro=1 sous ?test=1&menu=1, ni en partie directe ; démarrage du menu : 32 fichiers JavaScript (31 + avatar.js de l\'en-tête), 33 avec l\'introduction (intro.js)', async ({ page, baseURL }) => {
    let o = surveiller(page, baseURL);
    await espions(page);
    await ouvrirMenu(page);
    expect(await page.evaluate(() => [window.__vus.e0 ?? null, window.__zsMenu.intro()])).toEqual([null, null]);
    expect(o.fichiers.filter((f) => f.endsWith('.js')).length).toBe(32);
    // Retour du propriétaire : en mode menu, l'écran de préparation de la partie (barre) n'est jamais visible.
    expect(await page.evaluate(() => [document.documentElement.classList.contains('zs-attente'), getComputedStyle(document.getElementById('loading')).visibility])).toEqual([true, 'hidden']);
    expect(o.fichiers.filter((f) => f.endsWith('/js/menu/intro.js'))).toEqual([]);
    expect(o.fichiers.filter((f) => f.endsWith('.svg'))).toEqual([`/${FIXE}`]); // seul le logo fixe de l'écran de chargement
    await page.close();
    const p2 = await page.context().newPage();
    o = surveiller(p2, baseURL);
    await espions(p2);
    await p2.setViewportSize(REF);
    await p2.goto('/jeu.html?test=1&menu=1&intro=1&seed=1');
    await p2.locator('#e0').click({ position: { x: 20, y: 20 } }); // démarre (geste)
    await p2.waitForFunction(() => window.__zsMenu.intro().phase === 'joue');
    await p2.locator('#e0').click({ position: { x: 20, y: 20 } }); // passe
    await expect(p2.locator('#menu-jouer')).toBeVisible({ timeout: 60_000 });
    expect(o.fichiers.filter((f) => f.endsWith('.mp3'))).toEqual([`/${SON}`]);
    expect(o.fichiers.filter((f) => f.endsWith('.js')).length).toBe(33);
    expect(o.fichiers.filter((f) => f.endsWith('.svg')).sort()).toEqual([`/${LOGO}`, `/${FIXE}`]);
    await p2.close();
    const p3 = await page.context().newPage();
    o = surveiller(p3, baseURL);
    await espions(p3);
    await p3.setViewportSize(REF);
    await p3.goto('/jeu.html?test=1&seed=1&intro=1');
    await p3.waitForFunction(() => (window.__zs?.getState()?.time ?? 0) >= 0, null, { timeout: 60_000 });
    expect(await p3.evaluate(() => window.__vus.e0 ?? null)).toBe(null);
    expect(await p3.evaluate(() => document.documentElement.classList.contains('zs-attente'))).toBe(false); // partie directe : écran de préparation montré
    expect(o.fichiers.filter((f) => /\/js\/menu\/intro\.js$|\/assets\/studio\//.test(f))).toEqual([]); // ni logo ni son en partie directe
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
    await page.waitForFunction(() => window.__zsMenu?.intro()?.phase === 'geste');
    await expect(page.locator('#e0-commencer')).toBeVisible();
  });
});

test.describe('logo du studio : écran de chargement et menu à trois barres', () => {
  for (const [size, encoche] of [[REF, false], [PETIT, false], [LARGE, false], [ENCOCHE, true]]) {
    test(`tailles ${size.width}×${size.height}${encoche ? ' (encoche simulée)' : ''} : E7, logo fixe en bas à gauche (16 px des bords de la zone sûre), sans toucher barre, astuce ni version ; menu à trois barres sans logo (retour du propriétaire) ; axe`, async ({ page, baseURL }) => {
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
      // Retour du propriétaire : plus de logo du studio dans le menu à trois barres (avant : à droite de la version).
      await expect(page.locator('#menu-version')).toBeVisible();
      expect(await page.locator('#menu-liste img').count()).toBe(0);
      await page.locator('#menu-version').scrollIntoViewIfNeeded(); // écran bas (encoche) : la liste défile
      const v = await boite(page, '#menu-version');
      const liste = await boite(page, '#menu-liste');
      expect([v.b <= liste.b + 0.5, v.t >= (await boite(page, '#menu-google')).b]).toEqual([true, true]);
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

async function ouvrirCredits(page, size = REF) {
  await ouvrirMenu(page, size);
  await page.locator('#menu-trois-barres').click();
  await page.locator('#menu-credits').click();
  await expect(page.locator('#menu-ecran-credits')).toBeVisible();
  await page.waitForFunction(() => { const n = document.getElementById('menu-credits-logo'); return n.complete && n.naturalWidth > 0; });
}

test.describe('Crédits (E11)', () => {
  for (const [size, encoche] of [[REF, false], [PETIT, false], [LARGE, false], [ENCOCHE, true]]) {
    test(`tailles ${size.width}×${size.height}${encoche ? ' (encoche simulée)' : ''} : entrée entre Information et Discord ; bandeau « No Way Studio » / « Crédits », logo, « Un jeu de No Way Studio », sections, cinq licences ; écran plein, sans la barre d'onglets (retour du propriétaire) ; dans l'écran, sans superposition ; 44 px ; axe`, async ({ page, baseURL }) => {
      const o = surveiller(page, baseURL);
      await ouvrirMenu(page, size);
      if (encoche) await page.addStyleTag({ content: '#e8 { --e8-gauche: 50px !important; --e8-droite: 50px !important; }' });
      expect(o.fichiers.filter((f) => /credits|licences/.test(f))).toEqual([]); // rien au démarrage
      await page.locator('#menu-trois-barres').click();
      const [info, credits, discord] = [await boite(page, '#menu-information'), await boite(page, '#menu-credits'), await boite(page, '#menu-discord')];
      expect([credits.t >= info.b - 0.5, discord.t >= credits.b - 0.5, credits.h >= 44]).toEqual([true, true, true]);
      await page.locator('#menu-credits').click();
      await expect(page.locator('#menu-ecran-credits')).toBeVisible();
      await page.waitForFunction(() => { const n = document.getElementById('menu-credits-logo'); return n.complete && n.naturalWidth > 0; });
      await expect(page.locator('#menu-ecran-credits .menu-bandeau-libelle')).toHaveText('No Way Studio');
      await expect(page.locator('#menu-titre-credits')).toHaveText('Crédits');
      await expect(page.locator('#menu-credits-logo')).toHaveAttribute('alt', 'No Way Studio');
      // Retour du propriétaire : logos en petit, Noven Studio à côté de No Way Studio.
      await page.waitForFunction(() => { const n = document.getElementById('menu-credits-noven'); return n.complete && n.naturalWidth === 480; });
      await expect(page.locator('#menu-credits-noven')).toHaveAttribute('alt', 'Noven Studio');
      const [lnw, lnv] = [await boite(page, '#menu-credits-logo'), await boite(page, '#menu-credits-noven')];
      expect([lnv.l >= lnw.r - 0.5, Math.abs((lnw.t + lnw.b) / 2 - (lnv.t + lnv.b) / 2) < 2, lnw.h <= 150.5, lnv.h <= 150.5, lnw.h >= 59.5]).toEqual([true, true, true, true, true]);
      await expect(page.locator('#menu-credits-signature')).toHaveText('Un jeu de No Way Studio');
      await expect(page.locator('.e11-section-titre')).toHaveText(['Création', 'Remerciements', 'Outils et licences']);
      await expect(page.locator('.e11-nom')).toHaveText(['Nowy']);
      await expect(page.locator('.e11-provisoire')).toHaveText(['À compléter']);
      await expect(page.locator('.e11-deplier-nom')).toHaveText(['Three.js', 'Barlow', 'Rubik Wet Paint', 'Rubik Dirt', 'Logo de Discord']);
      await expect(page.locator('.e11-deplier[aria-expanded="false"]')).toHaveCount(5);
      await expect(page.locator('#menu-credits-retour')).toBeFocused();
      // Retour du propriétaire : écran plein, sans la barre d'onglets (avant : barre gardée) ; l'écran de l'onglet est caché.
      await expect(page.locator('.e8-onglets')).toBeHidden();
      await expect(page.locator('#menu-ecran-jouer')).toBeHidden();
      const marge = encoche ? 50 : 15.5;
      const blocs = ['#menu-ecran-credits .menu-bandeau', '#menu-credits-retour', '#menu-credits-equipe', '#menu-credits-licences'];
      const b = Object.fromEntries(await Promise.all(blocs.map(async (s) => [s, await boite(page, s)])));
      for (const [s, r] of Object.entries(b)) expect([r.l >= marge - 0.5, r.r <= size.width - marge + 0.5, r.b <= size.height + 0.5, r.t >= 0], s).toEqual([true, true, true, true]);
      // Les colonnes descendent plus bas que la barre d'onglets qu'elles remplacent.
      expect(b['#menu-credits-licences'].b).toBeGreaterThan(size.height - Math.max(50, 62 * Math.min(size.width / 932, size.height / 430)));
      expect(chevauche(b['#menu-credits-equipe'], b['#menu-credits-licences'])).toBe(false);
      expect(b['#menu-credits-equipe'].t).toBeGreaterThanOrEqual(b['#menu-ecran-credits .menu-bandeau'].b - 0.5);
      for (const s of ['#menu-credits-retour', ...['three', 'barlow', 'rubik-wet-paint', 'rubik-dirt', 'discord'].map((id) => `#menu-licence-${id}`)]) {
        if (!(await page.locator(s).isVisible())) continue;
        const r = await boite(page, s);
        expect([r.w >= 44, r.h >= 44], s).toEqual([true, true]);
      }
      expect((await new AxeBuilder({ page }).analyze()).violations.map((v) => v.id)).toEqual([]);
      // « ‹ Retour » : l'onglet revient, focus sur le bouton à trois barres.
      await page.locator('#menu-credits-retour').click();
      await expect(page.locator('#menu-ecran-credits')).toBeHidden();
      await expect(page.locator('#menu-ecran-jouer')).toBeVisible();
      await expect(page.locator('#menu-trois-barres')).toBeFocused();
      expect(o.fichiers.filter((f) => /credits|licences/.test(f)).sort()).toEqual(['/data/menu/credits.json', '/data/menu/licences.json', '/js/menu/credits-donnees.js', '/js/menu/credits.js']);
      expect([o.problemes, o.externes]).toEqual([[], []]);
    });
  }

  test('licences dépliables : aria-expanded, texte lu dans les données (avis et licence entière), zone qui défile (molette et glissement à la souris) ; repliées de nouveau ; Échap ferme l\'écran ; « Connexion » de l\'en-tête le remplace (par le Profil)', async ({ page }) => {
    await ouvrirCredits(page);
    const bouton = page.locator('#menu-licence-three');
    const zone = page.locator('#menu-licence-three-texte');
    await expect(zone).toBeHidden();
    await bouton.click();
    await expect(bouton).toHaveAttribute('aria-expanded', 'true');
    await expect(zone).toBeVisible();
    await expect(zone.locator('.e11-avis')).toHaveText('Copyright © 2010-2026 three.js authors');
    await expect(zone.locator('.e11-texte')).toContainText('Permission is hereby granted, free of charge');
    await expect(zone.locator('.e11-texte')).toContainText('THE SOFTWARE IS PROVIDED "AS IS"');
    expect(await zone.evaluate((n) => n.scrollHeight > n.clientHeight + 10)).toBe(true);
    const r = await boite(page, '#menu-licence-three-texte');
    await page.mouse.move(r.l + r.w / 2, r.t + r.h / 2);
    await page.mouse.wheel(0, 120);
    await expect.poll(() => zone.evaluate((n) => n.scrollTop)).toBeGreaterThan(0);
    await zone.evaluate((n) => { n.scrollTop = 0; });
    // Glissement à la souris (js/glisser.js) : le contenu suit la souris (départ dans la partie visible de la zone, que la colonne peut couper).
    const col = await boite(page, '#menu-credits-licences');
    const [haut, bas] = [Math.max(r.t, col.t), Math.min(r.b, col.b)];
    await page.mouse.move(r.l + r.w / 2, bas - 8);
    await page.mouse.down();
    for (let k = 1; k <= 8; k += 1) await page.mouse.move(r.l + r.w / 2, bas - 8 - k * ((bas - haut - 16) / 8));
    await page.mouse.up();
    await expect.poll(() => zone.evaluate((n) => n.scrollTop)).toBeGreaterThan(20);
    expect((await page.evaluate(() => window.__zsMenu.etat().menu)).onglet).toBe('jouer'); // le geste n'a rien touché dessous
    await page.locator('#menu-licence-barlow').scrollIntoViewIfNeeded();
    await page.locator('#menu-licence-barlow').click();
    await expect(page.locator('#menu-licence-barlow-texte .e11-texte')).toContainText('SIL OPEN FONT LICENSE Version 1.1');
    expect((await page.evaluate(() => window.__zsMenu.etat().menu.credits)).ouvertes).toEqual(['three', 'barlow']);
    await bouton.click();
    await expect(bouton).toHaveAttribute('aria-expanded', 'false');
    await expect(zone).toBeHidden();
    // La colonne des licences défile elle aussi quand elle déborde.
    const colonne = page.locator('#menu-credits-licences');
    expect(await colonne.evaluate((n) => getComputedStyle(n).overflowY)).toBe('auto');
    await page.keyboard.press('Escape');
    await expect(page.locator('#menu-ecran-credits')).toBeHidden();
    await expect(page.locator('#menu-ecran-jouer')).toBeVisible();
    await page.locator('#menu-trois-barres').click();
    await page.locator('#menu-credits').click();
    await expect(page.locator('#menu-ecran-credits')).toBeVisible();
    await expect(page.locator('.e8-onglets')).toBeHidden(); // écran plein : aucun onglet à toucher
    await page.locator('#menu-profil').click();
    await expect(page.locator('#menu-ecran-credits')).toBeHidden();
    await expect(page.locator('#menu-ecran-profil')).toBeVisible();
    expect((await page.evaluate(() => window.__zsMenu.etat().menu)).ecran).toBe('profil');
  });

  test('retour du propriétaire : logo fixe (la même image que l\'écran de chargement), identique à chaque ouverture et sans animation ; aucune écriture dans le stockage', async ({ page }) => {
    await espions(page);
    await ouvrirCredits(page);
    const premier = await page.locator('#menu-credits-logo').getAttribute('src');
    expect((await page.evaluate(() => window.__zsMenu.etat().menu.credits)).logo).toBe(FIXE);
    expect(await page.locator('#menu-credits-logo').evaluate((n) => n.getAnimations().length)).toBe(0);
    await page.locator('#menu-credits-retour').click();
    await page.locator('#menu-trois-barres').click();
    await page.locator('#menu-credits').click();
    await expect(page.locator('#menu-ecran-credits')).toBeVisible();
    expect(await page.locator('#menu-credits-logo').getAttribute('src')).toBe(premier);
    expect(await page.locator('#e7-studio').count()).toBe(0); // (l'écran de chargement est fermé ; même fichier : FIXE)
    expect(await page.evaluate(() => window.__ecritures)).toEqual([]);
  });
});

const lireJson = (f) => JSON.parse(readFileSync(f, 'utf8'));
const PARAMS_SAVE = { save: lireJson('data/game/save.json'), economy: lireJson('data/game/economy.json'), stats: lireJson('data/game/player-stats.json') };
const KEY = 'zs.save.v1';
const NNBSP = String.fromCharCode(0x202f);
const SAUVEGARDE = { ...defaultSave(), rev: 3, savedAt: 1_700_000_000_000, money: 1500, earned: 4321, stats: { ...defaultSave().stats, vie: 2, degats: 1 }, records: { bestWave: 17, bestKills: 88, runs: 6, worldsCompleted: 0 } };

// Sauvegarde posée dans le vrai stockage (même origine), puis menu sous ?store=local ; écritures comptées depuis l'ouverture du menu.
async function menuAvecSauvegarde(page, size = REF, save = SAUVEGARDE) {
  await page.setViewportSize(size);
  await page.goto('/sauvegarde.html?store=memory');
  await page.evaluate(([k, v]) => { localStorage.clear(); localStorage.setItem(k, v); }, [KEY, JSON.stringify(save)]);
  await espions(page);
  await page.goto('/jeu.html?test=1&menu=1&seed=1&store=local');
  await expect(page.locator('#menu-jouer')).toBeVisible({ timeout: 60_000 });
  await page.waitForFunction(() => window.__zsMenu?.etat()?.menu !== null && !document.getElementById('e7'));
}
// Retour du propriétaire : « Connexion » ouvre directement le Profil (plus d'écran Connexion).
async function ouvrirProfil(page) {
  await page.locator('#menu-profil').click();
  await expect(page.locator('#menu-ecran-profil')).toBeVisible();
}

test.describe('Connexion et Profil (E10)', () => {
  // Retour du propriétaire : en haut à gauche, la photo de profil (portrait de l'avatar) et le pseudo du joueur à la place de « Profil ».
  for (const size of [REF, PETIT, LARGE, ENCOCHE]) {
    test(`tailles ${size.width}×${size.height} : en-tête = portrait de l'avatar et pseudo (« Survivant » par défaut), nom accessible « Profil : … » ; dans l'en-tête, 44 px, sans chevauchement du solde ; axe`, async ({ page, baseURL }) => {
      const o = surveiller(page, baseURL);
      await ouvrirMenu(page, size);
      const bouton = page.locator('#menu-profil');
      await expect(bouton).toHaveAccessibleName('Profil : Survivant');
      await expect(page.locator('#menu-entete-pseudo')).toHaveText('Survivant');
      await expect(page.locator('#menu-entete-avatar')).toHaveClass(/e10-avatar-anonyme/); // personnage tout gris par défaut
      expect(await page.locator('#menu-entete-avatar svg').evaluate((s) => [...s.querySelectorAll('path, ellipse, circle, rect')].map((n) => getComputedStyle(n).fill))).toEqual(['rgb(143, 143, 143)', 'rgb(179, 179, 179)']);
      await expect(page.locator('#menu-entete-avatar')).toHaveAttribute('aria-hidden', 'true');
      expect(await page.locator('#menu-entete-avatar svg .av-peau').count()).toBeGreaterThan(0);
      expect(await bouton.textContent()).toBe('Survivant'); // plus le mot « Profil » affiché
      const b = await boite(page, '#menu-profil');
      const a = await boite(page, '#menu-entete-avatar');
      const e = await boite(page, '.e8-entete');
      const s = await boite(page, '#menu-solde');
      expect([b.w >= 44, b.h >= 44, a.w >= 32, Math.abs(a.w - a.h) < 0.5]).toEqual([true, true, true, true]);
      expect([a.l >= b.l - 0.5, a.r <= b.r + 0.5, b.t >= e.t - 0.5, b.b <= e.b + 0.5, b.r <= s.l + 0.5]).toEqual([true, true, true, true, true]);
      expect((await new AxeBuilder({ page }).include('.e8-entete').analyze()).violations.map((v) => v.id)).toEqual([]);
      expect([o.problemes, o.externes]).toEqual([[], []]);
    });
  }

  for (const [size, encoche] of [[REF, false], [PETIT, false], [LARGE, false], [ENCOCHE, true]]) {
    test(`tailles ${size.width}×${size.height}${encoche ? ' (encoche simulée)' : ''} : « Connexion » → Profil (carte, six statistiques, Sauvegarde ; Google « bientôt ») ; écran plein ; dans l'écran, sans superposition ; 44 px ; axe`, async ({ page, baseURL }) => {
      const o = surveiller(page, baseURL);
      await ouvrirMenu(page, size);
      if (encoche) await page.addStyleTag({ content: '#e8 { --e8-gauche: 50px !important; --e8-droite: 50px !important; }' });
      expect(o.fichiers.filter((f) => /compte|profil-etat|sauvegarde\/logic/.test(f))).toEqual([]); // rien au démarrage
      // Retour du propriétaire : « Connexion » ouvre directement le Profil ; « Se connecter avec Google · bientôt » sur le Profil (raison lue) et dans
      // le menu à trois barres ; plus d'écran Connexion.
      await page.locator('#menu-profil').click();
      await expect(page.locator('#menu-ecran-profil')).toBeVisible();
      expect(await page.locator('#menu-ecran-connexion').count()).toBe(0);
      await expect(page.locator('.e8-onglets')).toBeHidden(); // écran plein
      await expect(page.locator('#menu-ecran-profil-retour')).toBeFocused();
      await expect(page.locator('#menu-profil-google')).toHaveText('Se connecter avec Google · bientôt');
      await expect(page.locator('#menu-profil-google')).toHaveAccessibleDescription(/connexion avec Google arrive/);
      await expect(page.locator('#menu-ecran-profil .menu-bandeau-libelle')).toHaveText('Joueur');
      await expect(page.locator('#menu-ecran-profil-titre')).toHaveText('Profil');
      await expect(page.locator('#menu-profil-pseudo')).toHaveText('Survivant');
      await expect(page.locator('#menu-profil-compte')).toHaveText('Compte : non connecté');
      await expect(page.locator('#menu-profil-google')).toHaveAttribute('aria-disabled', 'true');
      await expect(page.locator('.e10-stat-nom')).toHaveText(['Meilleure manche', 'Zombies tués', 'Parties histoire', 'Parties infini', 'Temps de jeu', 'Argent gagné']); // sans record infini
      await expect(page.locator('#menu-profil-exporter')).toHaveText('Exporter mon code');
      await expect(page.locator('#menu-profil-importer')).toHaveText('Importer un code');
      const marge = encoche ? 50 : 15.5;
      const blocs = ['#menu-ecran-profil .menu-bandeau', '#menu-ecran-profil-retour', '#menu-profil-carte', '#menu-profil-stats', '#menu-profil-sauvegarde'];
      const b = Object.fromEntries(await Promise.all(blocs.map(async (s) => [s, await boite(page, s)])));
      for (const [s, r] of Object.entries(b)) expect([r.l >= marge - 0.5, r.r <= size.width - marge + 0.5, r.b <= size.height + 0.5, r.t >= 0], s).toEqual([true, true, true, true]);
      expect([chevauche(b['#menu-profil-carte'], b['#menu-profil-stats']), chevauche(b['#menu-profil-carte'], b['#menu-profil-sauvegarde']), chevauche(b['#menu-profil-stats'], b['#menu-profil-sauvegarde'])]).toEqual([false, false, false]);
      // Disposition de la maquette : carte à gauche ; statistiques en 3 × 2 au-dessus du cadre Sauvegarde, à droite.
      expect([b['#menu-profil-carte'].r <= b['#menu-profil-stats'].l, b['#menu-profil-stats'].b <= b['#menu-profil-sauvegarde'].t + 0.5]).toEqual([true, true]);
      const cartes = await page.locator('.e10-stat').evaluateAll((ns) => ns.map((n) => Math.round(n.getBoundingClientRect().top)));
      expect(new Set(cartes).size).toBe(2);
      for (const s of ['#menu-ecran-profil-retour', '#menu-profil-changer', '#menu-profil-pseudo-modifier', '#menu-profil-google', '#menu-profil-exporter', '#menu-profil-importer']) {
        await page.locator(s).scrollIntoViewIfNeeded();
        const r = await boite(page, s);
        expect([r.w >= 44, r.h >= 44], s).toEqual([true, true]);
      }
      expect((await new AxeBuilder({ page }).analyze()).violations.map((v) => v.id)).toEqual([]);
      await page.keyboard.press('Escape');
      await expect(page.locator('#menu-ecran-profil')).toBeHidden();
      await expect(page.locator('#menu-ecran-jouer')).toBeVisible();
      await expect(page.locator('.e8-onglets')).toBeVisible();
      await expect(page.locator('#menu-profil')).toBeFocused();
      expect(o.fichiers.filter((f) => /compte|profil-etat|sauvegarde\/logic/.test(f)).sort()).toEqual(['/js/menu/compte.js', '/js/menu/profil-etat.js', '/js/sauvegarde/logic.js']);
      expect([o.problemes, o.externes]).toEqual([[], []]);
    });
  }

  test('avatar et pseudo changés en mémoire (aucune écriture) ; pseudo : erreurs lues (trop court, trop long, caractère invisible), espaces nettoyés, Échap annule ; statistiques égales à la sauvegarde (?store=local) ; rechargement : valeurs par défaut', async ({ page }) => {
    await menuAvecSauvegarde(page);
    await ouvrirProfil(page);
    await expect(page.locator('.e10-stat-valeur')).toHaveText([`17 / 40`, /^—/, /^—/, /^—/, /^—/, `4${NNBSP}321`]);
    expect((await page.evaluate(() => window.__zsMenu.etat().menu.compte)).stats).toEqual([['meilleureManche', '17'], ['tues', ''], ['partiesHistoire', ''], ['partiesInfini', ''], ['temps', ''], ['argent', '4321']]);
    // Retour du propriétaire : avatars d'après le personnage du jeu et les zombies.
    await expect(page.locator('#menu-profil-avatar')).toHaveAttribute('aria-label', 'Avatar 1 sur 7 : Anonyme'); // personnage tout gris par défaut
    const noms = [];
    for (let i = 0; i < 7; i += 1) {
      await page.locator('#menu-profil-changer').click();
      noms.push(await page.locator('#menu-profil-avatar').getAttribute('aria-label'));
    }
    expect(noms).toEqual(['Avatar 2 sur 7 : Survivant', 'Avatar 3 sur 7 : Éclaireur', 'Avatar 4 sur 7 : Tireur', 'Avatar 5 sur 7 : Zombie rôdeur', 'Avatar 6 sur 7 : Zombie de chantier', 'Avatar 7 sur 7 : Zombie affamé', 'Avatar 1 sur 7 : Anonyme']);
    await page.locator('#menu-profil-changer').click();
    await page.locator('#menu-profil-changer').click();
    await expect(page.locator('#menu-profil-annonce')).toHaveText('Avatar 3 sur 7 : Éclaireur');
    expect(await page.locator('#menu-profil-avatar .av-lampe').count()).toBe(1); // lampe frontale du joueur B
    expect(await page.locator('#menu-profil-avatar .av-peau').first().evaluate((n) => getComputedStyle(n).fill)).toBe('rgb(232, 201, 168)'); // --perso-peau-joueur
    await page.locator('#menu-profil-pseudo-modifier').click();
    const champ = page.locator('#menu-profil-pseudo-champ');
    await expect(champ).toBeFocused();
    await expect(page.getByLabel('Pseudo', { exact: true })).toBeVisible();
    for (const [saisie, message] of [['a', 'Trop court : 2 caractères au moins.'], ['x'.repeat(21), 'Trop long : 20 caractères au plus.'], ['ab​cd', 'Caractère interdit : retour à la ligne, tabulation ou caractère invisible.']]) {
      await champ.fill(saisie);
      await page.locator('#menu-profil-pseudo-valider').click();
      await expect(page.locator('#menu-profil-pseudo-erreur')).toHaveText(message);
      await expect(champ).toHaveAttribute('aria-invalid', 'true');
      await expect(champ).toHaveAccessibleDescription(new RegExp(`De 2 à 20 caractères\\. ${message.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`));
    }
    await page.keyboard.press('Escape');
    await expect(page.locator('#menu-profil-pseudo')).toHaveText('Survivant');
    await expect(page.locator('#menu-ecran-profil')).toBeVisible(); // Échap a seulement annulé l'édition
    await page.locator('#menu-profil-pseudo-modifier').click();
    await champ.fill('  Le   Chef  ');
    await champ.press('Enter');
    await expect(page.locator('#menu-profil-pseudo')).toHaveText('Le Chef');
    await expect(page.locator('#menu-profil-annonce')).toHaveText('Pseudo changé : Le Chef.');
    expect((await page.evaluate(() => window.__zsMenu.etat().menu.compte))).toMatchObject({ avatar: 'eclaireur', pseudo: 'Le Chef', depot: 'local' });
    // Retour du propriétaire : l'en-tête suit aussitôt (portrait et pseudo du Profil).
    await expect(page.locator('#menu-entete-pseudo')).toHaveText('Le Chef');
    await expect(page.locator('#menu-profil')).toHaveAttribute('aria-label', 'Profil : Le Chef');
    await expect(page.locator('#menu-entete-avatar')).toHaveClass(/e10-avatar-eclaireur/);
    expect(await page.locator('#menu-entete-avatar .av-lampe').count()).toBe(1);
    // Gardés en mémoire en quittant et en revenant ; aucune écriture.
    await page.locator('#menu-ecran-profil-retour').click();
    await page.locator('#menu-profil').click();
    await expect(page.locator('#menu-profil-pseudo')).toHaveText('Le Chef');
    expect(await page.evaluate(() => window.__ecritures)).toEqual([]);
    expect(JSON.parse(await page.evaluate((k) => localStorage.getItem(k), KEY))).toEqual(SAUVEGARDE);
    await page.reload();
    await expect(page.locator('#menu-jouer')).toBeVisible({ timeout: 60_000 });
    await ouvrirProfil(page);
    await expect(page.locator('#menu-profil-pseudo')).toHaveText('Survivant');
    await expect(page.locator('#menu-profil-avatar')).toHaveAttribute('aria-label', 'Avatar 1 sur 7 : Anonyme');
  });

  test('« Exporter mon code » : code ZS1 valide (relu par decodeSave = la sauvegarde) ; « Importer un code » : code abîmé refusé (message, aucune écriture), code valide vérifié (aperçu), confirmation exigée, puis importé : seule écriture, puis menu rechargé sans introduction, solde à jour', async ({ page, context }) => {
    test.setTimeout(120_000);
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await menuAvecSauvegarde(page);
    await ouvrirProfil(page);
    await page.locator('#menu-profil-exporter').click();
    await expect(page.getByRole('dialog', { name: 'Exporter mon code' })).toBeVisible();
    const code = await page.locator('#menu-export-code').inputValue();
    expect(code).toMatch(/^ZS1\./);
    const relu = decodeSave(code, PARAMS_SAVE);
    expect(relu.ok).toBe(true);
    expect(relu.save).toEqual(SAUVEGARDE);
    await expect(page.locator('#menu-export-longueur')).toHaveText(`${code.length} caractères`);
    await page.locator('#menu-export-copier').click();
    await expect(page.locator('#menu-export-message')).toHaveText(/^(Code copié\.|Copie automatique impossible.*)$/);
    expect((await new AxeBuilder({ page }).analyze()).violations.map((v) => v.id)).toEqual([]);
    await page.keyboard.press('Escape');
    await expect(page.locator('#menu-export')).toHaveCount(0);
    await expect(page.locator('#menu-profil-exporter')).toBeFocused();
    await expect(page.locator('#menu-ecran-profil')).toBeVisible();
    // Import : code abîmé.
    await page.locator('#menu-profil-importer').click();
    const champ = page.locator('#menu-import-code');
    await expect(champ).toBeFocused();
    const autre = { ...defaultSave(), money: 777, earned: 9000, records: { bestWave: 25, bestKills: 120, runs: 11, worldsCompleted: 0 } };
    const valide = encodeSave(autre, PARAMS_SAVE);
    await champ.fill(`${valide.slice(0, -3)}${valide.endsWith('000') ? '111' : '000'}`);
    await page.locator('#menu-import-verifier').click();
    await expect(page.locator('#menu-import-erreur')).toHaveText('Le code est abîmé : la somme de contrôle ne correspond pas. Copie-le de nouveau en entier.');
    await expect(champ).toHaveAttribute('aria-invalid', 'true');
    await expect(page.locator('#menu-import-apercu')).toBeHidden();
    // Code valide : aperçu, remplacement seulement après la case cochée.
    await champ.fill(valide);
    await page.locator('#menu-import-verifier').click();
    await expect(page.locator('#menu-import-erreur')).toHaveText('');
    await expect(page.locator('#menu-import-apercu')).toBeVisible();
    await expect(page.locator('#menu-import-message')).toHaveText('Code valide : vérifie l\'aperçu avant de remplacer ta sauvegarde.');
    await expect(page.locator('#menu-import-table tr[data-changed="true"] th')).toContainText(['Solde', 'Total gagné', 'Meilleure manche']);
    await expect(page.locator('#menu-import-remplacer')).toBeDisabled();
    expect((await new AxeBuilder({ page }).analyze()).violations.map((v) => v.id)).toEqual([]);
    expect(await page.evaluate(() => window.__ecritures)).toEqual([]);
    await page.locator('#menu-import-ack').check();
    await expect(page.locator('#menu-import-remplacer')).toBeEnabled();
    await page.locator('#menu-import-remplacer').click();
    await expect(page.locator('#menu-import-message')).toHaveText('Sauvegarde importée. Le menu va se recharger pour la prendre en compte.');
    expect(await page.evaluate(() => window.__ecritures)).toEqual(['local.setItem']); // la seule écriture, celle de l'import existant
    const ecrite = JSON.parse(await page.evaluate((k) => localStorage.getItem(k), KEY));
    expect([ecrite.money, ecrite.earned, ecrite.records.bestWave, ecrite.records.runs]).toEqual([777, 9000, 25, 11]);
    await expect(page.locator('.e10-stat-valeur').first()).toHaveText('25 / 40');
    await expect(page.locator('#menu-import-recharger')).toBeFocused();
    const rechargement = page.waitForEvent('framenavigated', { predicate: (f) => f === page.mainFrame() });
    await page.locator('#menu-import-recharger').click();
    expect((await rechargement).url()).toMatch(/[?&]store=local.*#retour$/);
    await expect(page.locator('#menu-jouer')).toBeVisible({ timeout: 60_000 });
    await expect(page.locator('#menu-solde-texte')).toHaveText('777');
    expect(await page.evaluate(() => [window.__vus.e0 ?? null, location.hash])).toEqual([null, '']);
  });

  test('sous ?test=1 sans store=local : dépôt en mémoire, « En mémoire (mode test) » ; l\'import n\'écrit rien dans le vrai stockage', async ({ page }) => {
    await espions(page);
    await ouvrirMenu(page);
    await ouvrirProfil(page);
    await expect(page.locator('#menu-profil-sauvegarde .e10-sous')).toHaveText('En mémoire (mode test)');
    await page.locator('#menu-profil-importer').click();
    await page.locator('#menu-import-code').fill(encodeSave({ ...defaultSave(), money: 50 }, PARAMS_SAVE));
    await page.locator('#menu-import-verifier').click();
    await page.locator('#menu-import-ack').check();
    await page.locator('#menu-import-remplacer').click();
    await expect(page.locator('#menu-import-message')).toContainText('Sauvegarde importée.');
    expect(await page.evaluate(() => [window.__ecritures, localStorage.length])).toEqual([[], 0]);
  });
});
