// Lot 3k-B : atelier de l'interface (atelier-interface.html) : directions A, B, C, « Actuel », planche, mesures, « Mes choix ».
// Hors de la suite rapide (npm run test:e2e) jusqu'au lot 4b : `npx playwright test tests/e2e/interface-atelier.spec.js` ou `npm run test:e2e:full`.
// Les mesures passent par window.__zsUi (?test=1) ; ?fond=sol remplace le vrai jeu par le sol généré (rendu logiciel lent), sauf dans les tests du cadre.
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const BROWSER_NOISE = /GL Driver Message|ReadPixels|GPU stall/;
const PAGE = '/atelier-interface.html?test=1';
const SIZES = ['667x375', '844x390', '1440x900'];
const DIRECTIONS = ['A', 'B', 'C'];
const CASES = [['hud', 'combat'], ['hud', 'pire-cas'], ['hud', 'essai'], ['pause', 'pause'], ['fin-mort', 'mort'], ['fin-monde', 'monde-termine'], ['a-terre', 'a-terre'], ['a-terre', 'protege'], ['sticks', 'debut']];

test.skip(({ isMobile }) => isMobile, 'page technique mesurée en bureau');

async function open(page, { fond = 'sol', viewport = { width: 1440, height: 900 } } = {}) {
  await page.setViewportSize(viewport);
  await page.goto(`${PAGE}${fond === 'sol' ? '&fond=sol' : ''}`);
  await page.waitForFunction(() => window.__zsUi);
  await page.evaluate(() => window.__zsUi.ready);
}
const set = (page, partial) => page.evaluate((p) => window.__zsUi.set(p), partial);
const measure = (page) => page.evaluate(() => window.__zsUi.measure());

test.describe('chargement et hygiène', () => {
  test('se charge sans erreur ni requête externe ; noindex, lang="fr", textes en français', async ({ page, baseURL }) => {
    const problems = [];
    const external = [];
    page.on('console', (m) => ['error', 'warning'].includes(m.type()) && !BROWSER_NOISE.test(m.text()) && problems.push(m.text()));
    page.on('pageerror', (e) => problems.push(String(e)));
    page.on('request', (r) => !r.url().startsWith(baseURL) && !r.url().startsWith('data:') && external.push(r.url()));
    await open(page, { fond: 'jeu' });
    await expect(page.locator('#app')).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('lang', 'fr');
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex');
    await expect(page.locator('h1')).toHaveText("Atelier de l'interface");
    await expect.poll(() => page.evaluate(() => window.__zsUi.getState().frame.status), { timeout: 60_000 }).toMatch(/ready|error/);
    expect(problems).toEqual([]);
    expect(external).toEqual([]);
  });

  test('sans JavaScript : seul le message noscript est visible', async ({ browser }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();
    await page.goto(PAGE);
    await expect(page.locator('.ui3k-noscript')).toBeVisible();
    await expect(page.locator('#app')).toBeHidden();
    await context.close();
  });

  test('sans ?test=1 : window.__zsUi n\'existe pas', async ({ page }) => {
    await page.goto('/atelier-interface.html?fond=sol');
    await expect(page.locator('#app')).toBeVisible();
    expect(await page.evaluate(() => typeof window.__zsUi)).toBe('undefined');
  });

  test('rien dans localStorage, sessionStorage ni les cookies (page et cadre du jeu), même après des choix', async ({ page, context }) => {
    await open(page, { fond: 'jeu' });
    await set(page, { direction: 'actuel', screen: 'hud', stateId: 'combat' });
    await page.evaluate(() => window.__zsUi.keepChoice());
    const storage = await page.evaluate(() => {
      const f = document.getElementById('frame').contentWindow;
      return [localStorage.length, sessionStorage.length, f.localStorage.length, f.sessionStorage.length, document.cookie];
    });
    expect(storage).toEqual([0, 0, 0, 0, '']);
    expect(await context.cookies()).toEqual([]);
  });
});

test.describe('directions A, B, C : règles de lisibilité à chaque taille et dans chaque état', () => {
  for (const size of SIZES) {
    for (const direction of DIRECTIONS) {
      test(`${direction} à ${size} : aucun écart (chevauchements, Pause, pouces, zone sûre, 14 px, 44 px, 4,5:1, débordement)`, async ({ page }) => {
        await open(page);
        const failures = [];
        for (const [screen, stateId] of CASES) {
          await set(page, { size, direction, screen, stateId });
          const r = await measure(page);
          expect(r.available).toBe(true);
          if (r.verdict.outOfTarget.length) failures.push({ screen, stateId, out: r.verdict.outOfTarget });
          expect(r.verdict.minTextPx).toBeGreaterThanOrEqual(14);
          if (r.verdict.minTargetPx !== null) expect(r.verdict.minTargetPx).toBeGreaterThanOrEqual(44);
        }
        expect(failures).toEqual([]);
      });
    }
  }
});

test.describe('stabilité : aucune boîte ne bouge quand la vie, l\'argent, la vague, les chutes, les restants, les tués et le chrono changent', () => {
  for (const direction of DIRECTIONS) {
    test(`${direction} : 0 px aux trois tailles (HUD et à terre)`, async ({ page }) => {
      await open(page);
      for (const size of SIZES) {
        for (const screen of ['hud', 'a-terre']) {
          await set(page, { size, direction, screen, stateId: 'pire-cas' });
          const s = await page.evaluate(() => window.__zsUi.stability());
          expect(s, `${size} ${screen}`).toEqual({ max: 0, moved: [] });
        }
      }
    });
  }
});

test.describe('mouvement et clignotement', () => {
  test('B : le point REC clignote une fois par seconde (au plus 2), les autres directions n\'animent rien', async ({ page }) => {
    await open(page);
    await set(page, { size: '667x375', direction: 'B', screen: 'hud', stateId: 'combat' });
    await expect(page.locator('#overlay .p-rec')).toHaveCSS('animation-duration', '1s');
    const anims = (await measure(page)).measure.animations;
    expect(anims.length).toBe(1);
    expect(anims[0].perSecond).toBeLessThanOrEqual(2);
    for (const direction of ['A', 'C']) {
      await set(page, { direction });
      expect((await measure(page)).measure.animations).toEqual([]);
    }
  });

  test('prefers-reduced-motion : aucune animation, point REC fixe', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await open(page);
    for (const direction of DIRECTIONS) {
      await set(page, { size: '667x375', direction, screen: 'hud', stateId: 'combat' });
      const r = await measure(page);
      expect(r.measure.animations.filter((a) => a.running)).toEqual([]);
      expect(r.verdict.outOfTarget.filter((o) => o.rule === 'mouvement-reduit')).toEqual([]);
    }
    await set(page, { direction: 'B' });
    await expect(page.locator('#overlay .p-rec')).toHaveCSS('animation-name', 'none');
  });
});

test.describe('macros, texte système et pire cas', () => {
  test('texte L (macro) : aucun débordement ni écart à 1440×900 ; à 667×375 tout écart est rapporté avec une raison (outOfTarget)', async ({ page }) => {
    await open(page);
    for (const direction of DIRECTIONS) {
      const macros = { [direction]: { texte: 'L', densite: 'compacte', fond: 'plein', argent: 'haut-droite', contour: 'fin' } };
      await set(page, { size: '1440x900', direction, screen: 'hud', stateId: 'pire-cas', macros });
      expect((await measure(page)).verdict.outOfTarget).toEqual([]);
      await set(page, { size: '667x375' });
      const r = await measure(page);
      for (const o of r.verdict.outOfTarget) expect(o.reason.length).toBeGreaterThan(5);
      expect(r.verdict.outOfTarget.filter((o) => o.rule === 'debordement')).toEqual([]);
    }
  });

  test('échelle du texte système 200 % : les écarts sont rapportés (jamais masqués) et nuls à 1440×900 pour A et B', async ({ page }) => {
    await open(page);
    await set(page, { size: '667x375', direction: 'A', screen: 'hud', stateId: 'pire-cas', textScale: 200 });
    const small = await measure(page);
    expect(small.verdict.minTextPx).toBeGreaterThanOrEqual(28);
    expect(small.verdict.outOfTarget.length).toBeGreaterThan(0);
    for (const direction of ['A', 'B']) {
      await set(page, { size: '1440x900', direction });
      expect((await measure(page)).verdict.outOfTarget).toEqual([]);
    }
  });

  test('fond « transparent » sans contour : le contraste est recalculé et l\'argent jaune est rapporté hors cible', async ({ page }) => {
    await open(page);
    await set(page, { size: '1440x900', direction: 'A', screen: 'hud', stateId: 'combat', macros: { A: { texte: 'M', densite: 'compacte', fond: 'transparent', argent: 'haut-droite', contour: 'aucun' } } });
    const r = await measure(page);
    expect(r.verdict.outOfTarget.some((o) => o.rule === 'contraste' && o.element === 'argent')).toBe(true);
    await set(page, { macros: { A: { texte: 'M', densite: 'compacte', fond: 'transparent', argent: 'haut-droite', contour: 'fin' } } });
    expect((await measure(page)).verdict.outOfTarget).toEqual([]);
  });

  test('position de l\'argent : haut gauche, haut droite, sous la vague, sans chevauchement', async ({ page }) => {
    await open(page);
    for (const argent of ['haut-gauche', 'haut-droite', 'sous-vague']) {
      await set(page, { size: '667x375', direction: 'A', screen: 'hud', stateId: 'pire-cas', macros: { A: { texte: 'M', densite: 'compacte', fond: 'leger', argent, contour: 'fin' } } });
      const r = await measure(page);
      expect(r.verdict.outOfTarget).toEqual([]);
      const money = r.measure.elements.find((e) => e.name === 'argent').box;
      if (argent === 'haut-gauche') expect(money.left).toBeLessThan(333);
      if (argent === 'haut-droite') expect(money.left).toBeGreaterThan(333);
      if (argent === 'sous-vague') expect(money.left + money.width / 2).toBeCloseTo(333.5, -1);
    }
  });

  test('A occupe moins de l\'écran que l\'actuel (8,5 % à 667×375, mesuré au lot 3k-A)', async ({ page }) => {
    await open(page);
    for (const stateId of ['combat', 'pire-cas']) {
      await set(page, { size: '667x375', direction: 'A', screen: 'hud', stateId });
      expect((await measure(page)).verdict.coverage).toBeLessThan(0.085);
    }
  });
});

test.describe('le vrai jeu dans le cadre (même origine)', () => {
  test('« Actuel » charge jeu.html de même origine avec son interface ; A, B, C masquent l\'interface du jeu de l\'extérieur', async ({ page, baseURL }) => {
    await open(page, { fond: 'jeu' });
    await set(page, { size: '667x375', direction: 'actuel', screen: 'hud', stateId: 'debut' });
    const st = await page.evaluate(() => window.__zsUi.getState().frame);
    test.skip(st.status === 'error', 'WebGL indisponible : le sol généré remplace le jeu (message affiché)');
    const src = await page.locator('#frame').getAttribute('src');
    expect(new URL(src, baseURL).origin).toBe(new URL(baseURL).origin);
    expect(src).toMatch(/^jeu\.html\?test=1/);
    const frame = page.frameLocator('#frame');
    await expect(frame.locator('#hud')).toBeVisible();
    const actual = await measure(page);
    expect(actual.available).toBe(true);
    expect(actual.measure.elements.map((e) => e.name)).toEqual(expect.arrayContaining(['hud', 'argent', 'vague', 'pause']));
    for (const direction of DIRECTIONS) {
      await set(page, { direction });
      await expect(frame.locator('#hud')).toBeHidden();
      await expect(frame.locator('#btn-pause')).toBeHidden();
      await expect(page.locator('#overlay [data-ui="vie"]')).toBeVisible();
    }
    expect(await page.locator('#frame').getAttribute('src')).toBe('jeu.html?test=1&nospawn=1&seed=1');
  });

  test('« Actuel » : pause et fin pilotées par les hooks ; un écran absent du jeu est signalé « non disponible »', async ({ page }) => {
    await open(page, { fond: 'jeu' });
    await set(page, { size: '667x375', direction: 'actuel', screen: 'pause', stateId: 'pause' });
    test.skip((await page.evaluate(() => window.__zsUi.getState().frame.status)) === 'error', 'WebGL indisponible');
    await expect(page.frameLocator('#frame').locator('#pause-panel')).toBeVisible();
    await set(page, { screen: 'fin-mort', stateId: 'mort' });
    await expect(page.frameLocator('#frame').locator('#end-title')).toHaveText('Tu es mort');
    await set(page, { screen: 'reglages' }); // écran hors partie absent du jeu (le menu « actuel » est index.html depuis la partie C)
    await expect(page.locator('#status')).toContainText('non disponible dans « Actuel »');
  });

  test('aucune modification du document du jeu hors du cadre : la page n\'a ni #hud ni canvas, le jeu n\'a que des feuilles de style injectées', async ({ page }) => {
    await open(page, { fond: 'jeu' });
    await set(page, { size: '667x375', direction: 'B', screen: 'hud', stateId: 'combat' });
    test.skip((await page.evaluate(() => window.__zsUi.getState().frame.status)) === 'error', 'WebGL indisponible');
    expect(await page.locator('#hud, canvas').count()).toBe(0);
    const injected = await page.evaluate(() => [...document.getElementById('frame').contentDocument.querySelectorAll('style[id^="ui3k-"]')].map((s) => s.id));
    expect(injected).toEqual(['ui3k-hide']);
  });
});

test.describe('page : accessibilité, cibles, CLS, simulateurs, Mes choix', () => {
  for (const viewport of [{ width: 667, height: 375 }, { width: 1440, height: 900 }]) {
    test(`axe : aucune violation (${viewport.width}×${viewport.height})`, async ({ page }) => {
      await open(page, { viewport });
      const results = await new AxeBuilder({ page }).exclude('#frame').analyze();
      expect(results.violations.map((v) => `${v.id} : ${v.nodes.length}`)).toEqual([]);
    });
  }

  test('cibles de la page d\'au moins 44 px (boutons, listes, champs)', async ({ page }) => {
    await open(page, { viewport: { width: 667, height: 375 } });
    const small = await page.evaluate(() => [...document.querySelectorAll('#app button, #app select, #app input[type="number"], #app input[type="range"]')]
      .filter((el) => !el.closest('#overlay')).map((el) => ({ id: el.id || el.textContent, h: el.getBoundingClientRect().height })).filter((x) => x.h < 43.5));
    expect(small).toEqual([]);
  });

  for (const width of [360, 768, 1440]) {
    test(`CLS ≤ 0,1 à ${width} px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 });
      await page.addInitScript(() => {
        window.__cls = 0;
        new PerformanceObserver((l) => {
          for (const e of l.getEntries()) if (!e.hadRecentInput) window.__cls += e.value;
        }).observe({ type: 'layout-shift', buffered: true });
      });
      await page.goto(`${PAGE}&fond=sol`);
      await page.waitForFunction(() => window.__zsUi);
      await page.evaluate(() => window.__zsUi.ready);
      await page.waitForTimeout(500);
      expect(await page.evaluate(() => window.__cls)).toBeLessThanOrEqual(0.1);
    });
  }

  test('simulateurs : daltonisme appliqué au cadre d\'aperçu seulement ; zone de sécurité simulée et dimensions réelles affichées', async ({ page }) => {
    await open(page);
    await set(page, { size: '844x390', direction: 'C', screen: 'hud', stateId: 'combat', cvd: 'deuteranopie', guide: true });
    await expect(page.locator('#viewport')).toHaveAttribute('data-cvd', 'deuteranopie');
    await expect(page.locator('#viewport')).toHaveCSS('filter', /url/);
    await expect(page.locator('#overlay')).toHaveCSS('filter', 'none');
    await expect(page.locator('#app')).toHaveCSS('filter', 'none');
    await expect(page.locator('#dims')).toContainText('844 × 390');
    await expect(page.locator('#dims')).toContainText('0, 47, 21, 47');
    await expect(page.locator('#guide')).toBeVisible();
    const r = await measure(page);
    expect(r.verdict.outOfTarget).toEqual([]);
    const life = r.measure.elements.find((e) => e.name === 'vie').box;
    expect(life.left).toBeGreaterThanOrEqual(47 + 16 - 0.5);
  });

  test('Mes choix : une ligne par écran au format demandé, copiable (presse-papiers ou sélection), rien n\'est enregistré', async ({ page }) => {
    await open(page);
    await set(page, { direction: 'B', screen: 'hud', stateId: 'combat' });
    await page.click('#btn-keep');
    await set(page, { direction: 'A', screen: 'pause' });
    await page.click('#btn-keep');
    await expect(page.locator('#choices')).toHaveValue('ecran=hud;direction=B;argent=haut-droite;texte=M;densite=compacte;fond=leger;contour=aucun\necran=pause;direction=A;argent=haut-droite;texte=M;densite=compacte;fond=transparent;contour=fin');
    await page.click('#btn-copy');
    await expect(page.locator('#choices-status')).not.toHaveText('');
    const parsed = await page.evaluate(() => window.__zsUi.parseChoices(window.__zsUi.choicesText()));
    expect(parsed.warnings).toEqual([]);
    expect(parsed.choices.screens.hud.direction).toBe('B');
    await page.reload();
    await page.waitForFunction(() => window.__zsUi);
    await expect(page.locator('#choices')).toHaveValue('');
  });
});
