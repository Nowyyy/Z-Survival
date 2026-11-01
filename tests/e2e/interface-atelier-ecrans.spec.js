// Lot 3k-C : écrans hors partie (E1 menu, E3 boutique, E5 réglages, classement), propositions de priorité 2, « Côte à côte ».
// Hors de la suite rapide jusqu'au lot 4b : `E2E_FULL=1 npx playwright test tests/e2e/interface-atelier-ecrans.spec.js`.
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const BROWSER_NOISE = /GL Driver Message|ReadPixels|GPU stall/;
const PAGE = '/atelier-interface.html?test=1';
const SCREENS = ['menu', 'boutique', 'reglages', 'classement'];
const DIRECTIONS = ['A', 'B', 'C'];

test.skip(({ isMobile }) => isMobile, 'page technique mesurée en bureau');

async function open(page, { fond = 'sol', viewport = { width: 1440, height: 900 } } = {}) {
  await page.setViewportSize(viewport);
  await page.goto(`${PAGE}${fond === 'sol' ? '&fond=sol' : ''}`);
  await page.waitForFunction(() => window.__zsUi);
  await page.evaluate(() => window.__zsUi.ready);
}
const set = (page, partial) => page.evaluate((p) => window.__zsUi.set(p), partial);
const measure = (page) => page.evaluate(() => window.__zsUi.measure());

test.describe('les quatre prototypes, trois directions, à chaque taille', () => {
  for (const size of ['667x375', '812x375', '844x390', '1440x900']) {
    test(`${size} : aucun débordement, chevauchement ni écart ; boutons et champs ≥ 44 px`, async ({ page }) => {
      await open(page);
      const failures = [];
      for (const direction of DIRECTIONS) {
        for (const screen of SCREENS) {
          await set(page, { size, direction, screen });
          const r = await measure(page);
          if (r.verdict.outOfTarget.length) failures.push({ direction, screen, out: r.verdict.outOfTarget });
          const small = await page.evaluate(() => [...document.querySelectorAll('#overlay .p-page button, #overlay .p-page a.p-btn, #overlay .p-page select, #overlay .p-page input:not([type="checkbox"])')]
            .filter((el) => el.getClientRects().length).map((el) => {
              const b = el.getBoundingClientRect();
              const k = Number(getComputedStyle(document.getElementById('stage')).transform.split('(')[1]?.split(',')[0] ?? 1) || 1;
              return { ui: el.dataset.ui ?? el.id, h: b.height / k };
            }).filter((x) => x.h < 43.5));
          if (small.length) failures.push({ direction, screen, small });
        }
      }
      expect(failures).toEqual([]);
    });
  }
});

test.describe('boutique, réglages, classement : états distincts et fausses données', () => {
  test('boutique : « Pas assez d\'argent » (cadenas, contour pointillé) et « Niveau maximal » (coche) distincts par le texte et l\'icône', async ({ page }) => {
    await open(page);
    await set(page, { size: '1440x900', direction: 'A', screen: 'boutique' });
    const poor = page.locator('#overlay .p-buy.is-insufficient').first();
    const max = page.locator('#overlay .p-buy.is-max').first();
    await expect(poor).toHaveText("Pas assez d'argent");
    await expect(max).toHaveText('Niveau maximal');
    await expect(poor.locator('path')).toHaveAttribute('d', /^M4\.5 7V5/);
    await expect(max.locator('path')).toHaveAttribute('d', /^m2 8\.5/);
    await expect(poor).toHaveCSS('border-top-style', 'dashed');
    await expect(page.locator('#overlay [data-ui^="amelioration-"]')).toHaveCount(9);
    await page.click('#overlay [data-action="tab:armes"]');
    await expect(page.locator('#overlay [data-ui^="arme-"]')).toHaveCount(3);
    await expect(page.locator('#overlay [data-ui^="arme-"]').first()).toContainText('(fictif)');
  });

  test('réglages : trois niveaux de sang distincts par le texte ; le choix suit le clic ; pseudo trop court signalé', async ({ page }) => {
    await open(page);
    await set(page, { size: '1440x900', direction: 'C', screen: 'reglages' });
    const blood = page.locator('#overlay [data-action^="sang:"]');
    await expect(blood).toHaveText(['Aucun', 'Réduit', 'Complet']);
    await page.click('#overlay [data-action="sang:reduit"]');
    await expect(page.locator('#overlay [data-action="sang:reduit"]')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('#overlay [data-action="sang:1"]')).toHaveAttribute('aria-pressed', 'false');
    await expect(page.locator('#overlay [data-action="pseudo"]')).toBeDisabled();
    await page.check('#overlay [data-action="join"]');
    await page.fill('#overlay [data-action="pseudo"]', 'ab');
    await page.press('#overlay [data-action="pseudo"]', 'Enter');
    await page.locator('#overlay [data-action="pseudo"]').blur();
    await expect(page.locator('#overlay [data-pseudo]')).toHaveText('Trop court : 3 caractères au moins.');
  });

  test('classement : un tableau par monde, ligne du joueur visible (« Toi »), bouton Google fictif sans aucune requête', async ({ page, baseURL }) => {
    const external = [];
    page.on('request', (r) => !r.url().startsWith(baseURL) && !r.url().startsWith('data:') && external.push(r.url()));
    await open(page);
    await set(page, { size: '667x375', direction: 'B', screen: 'classement' });
    await expect(page.locator('#overlay tr.is-me')).toContainText('Toi');
    const inside = await page.evaluate(() => {
      const row = document.querySelector('#overlay tr.is-me').getBoundingClientRect();
      const port = document.querySelector('#overlay .p-scroll').getBoundingClientRect();
      return row.top >= port.top - 1 && row.bottom <= port.bottom + 1;
    });
    expect(inside).toBe(true); // ligne collée en bas de la liste qui défile
    await page.selectOption('#overlay [data-action="world"]', 'monde-2');
    await expect(page.locator('#overlay tbody tr')).toHaveCount(3);
    await page.click('#overlay [data-action="signin"]');
    await expect(page.locator('#overlay [data-ui="participer"]')).toHaveText('Participer');
    expect(external).toEqual([]);
  });

  test('les prix, armes, joueurs et scores sont annoncés comme fictifs sur les quatre écrans et dans les trois directions', async ({ page }) => {
    await open(page);
    for (const direction of DIRECTIONS) {
      for (const screen of SCREENS) {
        await set(page, { size: '1440x900', direction, screen });
        await expect(page.locator('#overlay')).toContainText('Données fictives');
      }
    }
  });

  test('menu « Actuel » = la page d\'attente index.html dans le cadre ; boutique « Actuel » : non disponible', async ({ page }) => {
    await open(page);
    await set(page, { size: '667x375', direction: 'actuel', screen: 'menu' });
    expect(await page.locator('#frame').getAttribute('src')).toBe('index.html');
    await expect(page.frameLocator('#frame').locator('h1')).toHaveText('Z-Survival');
    await set(page, { screen: 'boutique' });
    await expect(page.locator('#status')).toContainText('non disponible dans « Actuel »');
  });
});

test.describe('priorité 2, côte à côte, choix', () => {
  test('les 5 propositions × 2 variantes sur le HUD : aucun écart à 667×375 et 1440×900, pour A, B, C', async ({ page }) => {
    await open(page);
    const ids = (await page.evaluate(() => window.__zsUi.config().priority2)).flatMap((p) => p.variants.map((v) => `${p.id}:${v}`));
    expect(ids.length).toBeLessThanOrEqual(10);
    const failures = [];
    for (const size of ['667x375', '1440x900']) {
      for (const direction of DIRECTIONS) {
        for (const p2 of ids) {
          await set(page, { size, direction, screen: 'hud', stateId: 'pire-cas', p2 });
          const r = await measure(page);
          if (r.verdict.outOfTarget.length) failures.push({ size, direction, p2, out: r.verdict.outOfTarget });
        }
      }
    }
    expect(failures).toEqual([]);
  });

  test('prefers-reduced-motion : aucune impulsion (retour de dégâts B, vie faible B)', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await open(page);
    for (const p2 of ['retour-degats:B', 'vie-faible:B']) {
      await set(page, { size: '667x375', direction: 'A', screen: 'hud', stateId: 'combat', p2 });
      expect((await measure(page)).measure.animations.filter((a) => a.running)).toEqual([]);
    }
  });

  test('« Côte à côte » : Actuel, A, B, C à la même taille et dans le même état, tableau des mesures en texte avec « hors cible » en toutes lettres', async ({ page }) => {
    await open(page);
    await set(page, { size: '844x390', screen: 'hud', stateId: 'combat', direction: 'A' });
    await page.click('#btn-compare');
    await expect(page.locator('#btn-compare')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('#compare figure')).toHaveCount(4);
    await expect(page.locator('#compare-rows tr')).toHaveCount(4);
    const rows = await page.evaluate(() => window.__zsUi.compare());
    expect(rows.map((r) => r.direction)).toEqual(['actuel', 'A', 'B', 'C']);
    const actual = rows[0];
    test.skip(!actual.available, 'WebGL indisponible : « Actuel » non mesurable');
    // Lot 3l : « Actuel » est l'interface intégrée, avec les marges de la maquette (16 px + zone) : plus rien dans l'îlot (avant : « zone-sure », marges du lot 4).
    expect(actual.verdict.outOfTarget.filter((o) => o.rule === 'zone-sure')).toEqual([]);
    for (const r of rows.slice(1)) expect(r.verdict.outOfTarget).toEqual([]);
    const sizes = await page.evaluate(() => [...document.querySelectorAll('#compare .ui3k-stage')].map((s) => `${s.style.width}×${s.style.height}`));
    expect(new Set(sizes)).toEqual(new Set(['844px×390px']));
  });

  test('« Mes choix » : priorité 2 retenue au format priorite2=id:variante ; aucun stockage ; console propre', async ({ page, context }) => {
    const problems = [];
    page.on('console', (m) => ['error', 'warning'].includes(m.type()) && !BROWSER_NOISE.test(m.text()) && problems.push(m.text()));
    page.on('pageerror', (e) => problems.push(String(e)));
    await open(page);
    await set(page, { direction: 'C', screen: 'boutique' });
    await page.click('#btn-keep');
    await set(page, { screen: 'hud', p2: 'retour-degats:B' });
    await page.click('#btn-keep-p2');
    await expect(page.locator('#choices')).toHaveValue('ecran=boutique;direction=C;argent=haut-gauche;texte=M;densite=aeree;fond=plein;contour=aucun\npriorite2=retour-degats:B');
    expect(await page.evaluate(() => [localStorage.length, sessionStorage.length, document.cookie])).toEqual([0, 0, '']);
    expect(await context.cookies()).toEqual([]);
    expect(problems).toEqual([]);
  });

  for (const screen of SCREENS) {
    test(`axe : aucune violation sur ${screen} (667×375, direction B)`, async ({ page }) => {
      await open(page, { viewport: { width: 667, height: 375 } });
      await set(page, { size: '667x375', direction: 'B', screen });
      const results = await new AxeBuilder({ page }).exclude('#frame').analyze();
      expect(results.violations.map((v) => `${v.id} : ${v.nodes.map((n) => n.target.join(' ')).slice(0, 3).join(' | ')}`)).toEqual([]);
    });
  }
});
