import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { readFileSync } from 'node:fs';
import { waitReady, salle, hudBoxes, screenShare } from './helpers.js';

// Lot 3a-B : interface compacte (HUD E2-2 en puces, E2-11 flèches au bord). Lot 3l : HUD intégré (direction B) en blocs de taille fixe ; les mesures de place
// portent sur les blocs (helpers.js : hudBoxes, screenShare), #hud étant devenu le conteneur des trois colonnes. Tout passe par step() et les hooks de ?test=1 ;
// 667×375 de préférence, 1440×900 pour les marges. Les tests se désactivent seuls si WebGL manque.
const SIZE = { width: 667, height: 375 };
const BIG = { width: 1440, height: 900 };
const STATE = (page) => page.evaluate(() => window.__zs.getState());
const BROWSER_NOISE = /GL Driver Message|ReadPixels|GPU stall/;

async function open(page, extra = '', size = SIZE) {
  await page.setViewportSize(size);
  await page.goto(salle(`/jeu.html?test=1&seed=1${extra.includes('nospawn') ? '' : '&nospawn=1'}&vhs=0${extra}`));
  await waitReady(page);
  await page.evaluate(() => { window.requestAnimationFrame = () => 0; });
  await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 150)));
  await page.evaluate(() => window.__zs.step(0.05));
}

// Un zombie attaque la fenêtre : on avance jusqu'à ce que sa puce « attaquée » apparaisse dans le HUD (l'arrachage est commencé).
const attack = (page, id) => page.evaluate((window_) => {
  const zs = window.__zs;
  zs.spawnAtWindow(window_, 'marcheur');
  for (let i = 0; i < 900; i += 1) {
    zs.step(0.05);
    if (zs.getState().hud.chips.some((c) => c.id === window_ && c.attacked)) break;
  }
}, id);

const rect = (page, sel) => page.evaluate((s) => { const r = document.querySelector(s).getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height }; }, sel);
const apart = (a, b) => a.r <= b.l + 0.5 || b.r <= a.l + 0.5 || a.b <= b.t + 0.5 || b.b <= a.t + 0.5;

test.describe('HUD compact E2-2', () => {
  // Lot 3l : avant, #hud ≤ 96 × 300 px ; après, HUD et Pause ≤ 11 % de l'écran (maquette B : 10,1 %), colonne de gauche ≤ 9,15 em × 96 px, marges de 16 px.
  test('retour du propriétaire : sortie du plein écran par le navigateur (Échap) pendant la partie : la pause s\'ouvre ; déjà en pause : elle reste ouverte (pas de bascule) ; Échap verrouillé en plein écran quand le navigateur le permet', async ({ page }) => {
    await page.addInitScript(() => {
      window.__verrous = [];
      if (navigator.keyboard) {
        navigator.keyboard.lock = (codes) => {
          window.__verrous.push(codes);
          return Promise.resolve();
        };
      }
    });
    await open(page);
    await expect(page.locator('#pause-panel')).toBeHidden();
    // Sortie du plein écran non demandée par le jeu (document.fullscreenElement nul) : pause ouverte.
    await page.evaluate(() => document.dispatchEvent(new Event('fullscreenchange')));
    await expect(page.locator('#pause-panel')).toBeVisible();
    await page.evaluate(() => document.dispatchEvent(new Event('fullscreenchange')));
    await expect(page.locator('#pause-panel')).toBeVisible();
    // Entrée en plein écran simulée : Échap demandé au navigateur (Keyboard Lock), s'il existe.
    await page.evaluate(() => {
      Object.defineProperty(document, 'fullscreenElement', { configurable: true, get: () => document.documentElement });
      document.dispatchEvent(new Event('fullscreenchange'));
    });
    const verrous = await page.evaluate(() => (navigator.keyboard ? window.__verrous : null));
    if (verrous) expect(verrous).toEqual([['Escape']]);
  });

  test('au repos : HUD et Pause sur 11 % de l\'écran au plus, colonne de gauche ≤ 145 × 120 px, marges de 16 px, sans chevaucher Pause (667×375)', async ({ page }) => {
    await open(page);
    const s = await STATE(page);
    expect(s.hud.height).toBeLessThanOrEqual(120); // lot 3l : quatre rangées à gauche en mode essai (?map=salle) : REC, VIE, chutes + étage, MODE ESSAI
    const boxes = await hudBoxes(page);
    expect(screenShare(boxes, SIZE.width, SIZE.height)).toBeLessThanOrEqual(0.11);
    const left = await rect(page, '.hud-tl');
    expect(left.w).toBeLessThanOrEqual(145);
    expect(left.h).toBeLessThanOrEqual(120);
    const hud = await rect(page, '#hud');
    expect(hud.l).toBeGreaterThanOrEqual(16 - 0.5);
    expect(hud.t).toBeGreaterThanOrEqual(16 - 0.5);
    for (const [sel, b] of Object.entries(boxes)) if (sel !== '#btn-pause') expect(apart(b, boxes['#btn-pause']), sel).toBe(true);
  });

  test('pendant une vague avec trois fenêtres en alerte : les blocs du HUD gardent leur place (lot 3l ; avant : #hud ≤ 96 × 300)', async ({ page }) => {
    await open(page, '&nospawn=0');
    await page.evaluate(() => {
      const zs = window.__zs;
      zs.setPlanks('fenetre-nord', 0);
      zs.setPlanks('fenetre-ouest', 0);
      zs.setPlanks('fenetre-est', 0);
      zs.step(3.5);
    });
    const s = await STATE(page);
    expect(s.hud.chips).toHaveLength(3);
    expect(s.hud.height).toBeLessThanOrEqual(120); // lot 3l : avant 96 (quatre rangées en mode essai)
    await expect(page.locator('#hud-wave-text')).toHaveText('01'); // l'ancienne salle n'a pas de fin de monde : pas de « / 40 »
    await expect(page.locator('#hud-remaining')).toBeVisible();
    const before = await hudBoxes(page);
    await page.evaluate(() => { window.__zs.setPlanks('fenetre-nord', 3); window.__zs.step(0.1); });
    expect(await hudBoxes(page)).toEqual(before);
  });

  // Lot 3l (direction B) : avant, « Vague N » en Rubik Wet Paint de 16 à 26 px ; après, libellés en Rubik Dirt (majuscules), valeurs en Barlow, 15,75 px (macro M).
  test('libellés VAGUE, RESTANTS, TUÉS, VIE, REC en Rubik Dirt majuscules ; valeurs en Barlow ; tout à 15,75 px', async ({ page }) => {
    await open(page, '&nospawn=0');
    await page.evaluate(() => window.__zs.step(3.5));
    const f = await page.evaluate(() => {
      const css = (el) => { const c = getComputedStyle(el); return { family: c.fontFamily, size: Number.parseFloat(c.fontSize), transform: c.textTransform }; };
      return { labels: [...document.querySelectorAll('#hud .hud-label')].map(css), values: ['#hud-wave-text', '#hud-kills-text', '#hud-remaining-text', '#hud-life', '#hud-chrono-text'].map((s) => css(document.querySelector(s))) };
    });
    expect(f.labels).toHaveLength(6); // REC, VIE, VAGUE, RESTANTS, DÉBUT, TUÉS
    for (const l of f.labels) expect(l).toMatchObject({ family: expect.stringMatching(/Rubik Dirt/), size: 15.75, transform: 'uppercase' });
    for (const v of f.values) expect(v).toMatchObject({ family: expect.stringMatching(/Barlow/), size: 15.75 });
  });

  test('la barre de vie est un progressbar avec « 100/100 » dedans, des valeurs justes et un libellé', async ({ page }) => {
    await open(page, '&lvl=vie:5');
    const bar = page.locator('#hud-bar');
    await expect(bar).toHaveAttribute('role', 'progressbar');
    await expect(bar).toHaveAttribute('aria-valuemin', '0');
    await expect(bar).toHaveAttribute('aria-valuemax', '160');
    await expect(bar).toHaveAttribute('aria-valuenow', '160');
    await expect(bar).toHaveAttribute('aria-label', 'Vie');
    await expect(bar.locator('#hud-life')).toHaveText('160/160');
    await page.evaluate(() => window.__zs.setChutes(0));
    await page.evaluate(() => window.__zs.downPlayer());
    await page.evaluate(() => window.__zs.step(0.1));
    await expect(bar).toHaveAttribute('aria-valuenow', /^\d+$/);
  });

  test('chutes : une seule silhouette avec un « + » et le nombre de chutes à côté (seul le nombre change), sans le mot « Chutes »', async ({ page }) => {
    for (const [lvl, n] of [['', 1], ['&lvl=chutes:2', 3]]) {
      await open(page, lvl);
      const r = await page.evaluate(() => ({ icons: document.querySelectorAll('#hud-chutes-icons svg').length, text: document.getElementById('hud-chutes').textContent, label: document.getElementById('hud-chutes').getAttribute('aria-label'), pluses: document.querySelectorAll('#hud-chutes-icons .hud-plus').length }));
      expect(r.icons).toBe(1); // avant le lot 4 : n silhouettes
      expect(r.text).toBe(String(n));
      expect(r.pluses).toBe(1);
      expect(r.label).toBe(`Chutes restantes : ${n}`);
    }
    await page.evaluate(() => { window.__zs.downPlayer(); window.__zs.step(0.1); });
    expect(await page.locator('#hud-chutes-icons svg').count()).toBe(1);
    await expect(page.locator('#hud-chutes')).toHaveText('2');
  });

  test('le texte fait 14 px au moins partout (HUD, E2-11) et reste lisible', async ({ page }) => {
    await open(page);
    await attack(page, 'fenetre-nord');
    await page.evaluate(() => { window.__zs.setPlanks('fenetre-ouest', 0); window.__zs.step(0.05); });
    const sizes = await page.evaluate(() => {
      const out = [];
      for (const root of ['#hud', '#btn-pause']) { // lot 3l : #edges retiré (E2-11) ; Pause ajouté
        for (const el of document.querySelectorAll(`${root}, ${root} *`)) {
          if (el.closest('svg') && el.tagName !== 'svg') continue;
          const own = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim() !== '');
          if (own) out.push({ root, text: el.textContent.trim().slice(0, 20), size: Number.parseFloat(getComputedStyle(el).fontSize) });
        }
      }
      return out;
    });
    expect(sizes.length).toBeGreaterThan(1); // lot 3b : avant 3 ; plus de flèches E2-11, donc moins de textes
    for (const s of sizes) expect(s.size, `${s.root} ${s.text}`).toBeGreaterThanOrEqual(14);
  });

  test('aucun filter, mix-blend-mode ni backdrop-filter sur le HUD et E2-11', async ({ page }) => {
    await open(page);
    await page.evaluate(() => { window.__zs.setPlanks('fenetre-nord', 0); window.__zs.step(0.05); });
    const bad = await page.evaluate(() => {
      const out = [];
      for (const root of ['#hud', '#edges']) for (const el of document.querySelectorAll(`${root}, ${root} *`)) {
        const c = getComputedStyle(el);
        if (c.filter !== 'none' || c.mixBlendMode !== 'normal' || (c.backdropFilter && c.backdropFilter !== 'none')) out.push(`${root} ${el.className}`);
      }
      return out;
    });
    expect(bad).toEqual([]);
  });

  test('1440×900 : marges de 16 px, aucun bloc du HUD sur Pause', async ({ page }) => {
    await open(page, '', BIG);
    const hud = await rect(page, '#hud');
    expect(hud.l).toBeGreaterThanOrEqual(15.5);
    expect(hud.t).toBeGreaterThanOrEqual(15.5);
    expect(hud.r).toBeLessThanOrEqual(BIG.width - 15.5);
    const boxes = await hudBoxes(page);
    for (const [sel, b] of Object.entries(boxes)) if (sel !== '#btn-pause') expect(apart(b, boxes['#btn-pause']), sel).toBe(true);
    expect(boxes['#btn-pause'].r).toBeLessThanOrEqual(BIG.width - 16 + 0.5);
  });
});

// Lot 3l (direction B) : avant, un seul rectangle noir (#hud) ; après, un fond par bloc (zone pleine sous chaque texte), aucun sur le conteneur ni les colonnes.
test.describe('HUD en blocs pleins, sans état des fenêtres', () => {
  test('un fond par bloc (.hud-block), aucun sur #hud, les colonnes, les libellés et les valeurs ; aucun contour ; plus de rangée « Fenêtres »', async ({ page }) => {
    await open(page);
    await page.evaluate(() => { window.__zs.setPlanks('fenetre-nord', 0); window.__zs.step(0.05); });
    const r = await page.evaluate(() => {
      const bg = (el) => getComputedStyle(el).backgroundColor;
      return {
        blocks: [...document.querySelectorAll('#hud .hud-block')].filter((e) => !e.hidden).map(bg),
        bare: ['#hud', '.hud-tl', '.hud-tc', '.hud-tr', '#hud-kills-text', '#hud-life'].map((s) => bg(document.querySelector(s))),
        windows: document.querySelectorAll('#hud-windows, .hud-win').length,
        border: getComputedStyle(document.querySelector('#hud-kills')).borderTopWidth,
      };
    });
    expect(r.blocks.length).toBeGreaterThanOrEqual(6);
    for (const c of r.blocks) expect(c).not.toBe('rgba(0, 0, 0, 0)');
    for (const c of r.bare) expect(c).toBe('rgba(0, 0, 0, 0)');
    expect(r.windows).toBe(0);
    expect(r.border).toBe('0px');
  });

  test('un fenêtre ouverte ou attaquée ne change ni la taille ni la place du HUD (rien à décaler)', async ({ page }) => {
    await open(page);
    const box = () => page.evaluate(() => { const b = document.getElementById('hud').getBoundingClientRect(); return [b.left, b.top, b.width, b.height]; });
    const before = await box();
    await page.evaluate(() => { window.__zs.setPlanks('fenetre-nord', 0); window.__zs.step(0.05); });
    await attack(page, 'fenetre-est');
    expect(await box()).toEqual(before);
  });

  test('les fenêtres en alerte restent calculées pour les flèches : triées par urgence (ouverte, puis le moins de planches)', async ({ page }) => {
    await open(page);
    await page.evaluate(() => { const zs = window.__zs; zs.setPlanks('fenetre-ouest', 0); zs.setPlanks('fenetre-est', 1); zs.step(0.05); });
    await attack(page, 'fenetre-est');
    await page.evaluate(() => window.__zs.step(0.05));
    await attack(page, 'fenetre-nord');
    const s = await STATE(page);
    expect(s.hud.chips.map((c) => c.id)).toEqual(['fenetre-ouest', 'fenetre-est', 'fenetre-nord']);
    expect(s.hud.height).toBeLessThanOrEqual(120); // lot 3l : avant 96 × 300 ; #hud est la bande du haut (conteneur des trois colonnes), quatre rangées en mode essai
  });
});

test.describe('réparation bloquée et HUD en vague', () => {
  test('#hud-live annonce la réparation bloquée au plus une fois par fenêtre et par 10 s', async ({ page }) => {
    await open(page);
    await attack(page, 'fenetre-nord');
    const seen = await page.evaluate(() => {
      const zs = window.__zs;
      const live = document.getElementById('hud-live');
      const log = [];
      zs.setPlayer(1800, 900);
      for (let i = 0; i < 480; i += 1) {
        zs.setPlanks('fenetre-nord', 3); // le zombie garde l'emplacement : la réparation reste bloquée pendant 24 s
        zs.step(0.05);
        if (/occupe la fenêtre/.test(live.textContent)) log.push({ time: zs.getState().time, text: live.textContent });
        live.textContent = '';
      }
      return log;
    });
    expect(seen[0].text).toBe('Fenêtre nord : un zombie occupe la fenêtre, réparation impossible');
    expect(seen.length).toBeGreaterThanOrEqual(2);
    for (let i = 1; i < seen.length; i += 1) expect(seen[i].time - seen[i - 1].time).toBeGreaterThanOrEqual(9.9);
    expect(seen.length).toBeLessThanOrEqual(3);
  });

  test('pendant une vague (6 chutes), chaque bloc du HUD tient dans sa boîte fixe, sans toucher Pause (lot 3l ; avant : #hud ≤ 300 px)', async ({ page }) => {
    await open(page, '&nospawn=0&lvl=chutes:5');
    await page.evaluate(() => { const zs = window.__zs; zs.setPlanks('fenetre-nord', 2); zs.setPlayer(1800, 900); zs.step(3.5); });
    const boxes = await hudBoxes(page);
    for (const [sel, b] of Object.entries(boxes)) if (sel !== '#btn-pause') expect(apart(b, boxes['#btn-pause']), sel).toBe(true);
    const fit = await page.evaluate(() => [...document.querySelectorAll('#hud .hud-block')].filter((e) => !e.hidden && e.id !== 'hud-money').map((e) => [e.id, e.scrollWidth, e.clientWidth, e.scrollHeight, e.clientHeight]));
    expect(fit.length).toBeGreaterThanOrEqual(6);
    for (const [id, sw, cw, sh, ch] of fit) {
      expect(sw, id).toBeLessThanOrEqual(cw);
      expect(sh, id).toBeLessThanOrEqual(ch);
    }
    await expect(page.locator('#hud-chutes-text')).toHaveText('6');
  });
});

// E2-11 (flèches au bord de l'écran) retiré à la demande du propriétaire après le lot 3b : aucune flèche, même avec des fenêtres cassées hors écran.
test.describe('E2-11 retiré', () => {
  test('aucune flèche au bord de l\'écran, même avec des fenêtres attaquées ou ouvertes hors écran', async ({ page }) => {
    await open(page);
    await page.evaluate(() => { window.__zs.setPlayer(1800, 1400); window.__zs.step(0.2); });
    await attack(page, 'fenetre-ouest');
    await page.evaluate(() => { window.__zs.setPlanks('fenetre-nord', 0); window.__zs.step(0.2); });
    expect(await page.locator('#edges').count()).toBe(0);
    expect((await STATE(page)).hud.arrows).toEqual([]);
  });
});

test.describe('structure, accessibilité, hygiène', () => {
  test('l\'ordre des blocs dans le HTML : E2-2, E2-8, E2-10, E2-5, E2-3, E2-4', async ({ page }) => {
    await open(page);
    const order = await page.evaluate(() => [...document.querySelectorAll('#game-root [data-block]')].map((e) => e.dataset.block));
    expect(order).toEqual(['E2-2', 'E2-8', 'E2-10', 'E2-5', 'E2-3', 'E2-4']);
  });

  test('aucun focus volé par le HUD', async ({ page }) => {
    await open(page);
    await page.evaluate(() => { window.__zs.setPlayer(1800, 1400); window.__zs.setPlanks('fenetre-ouest', 0); window.__zs.setPlanks('fenetre-nord', 2); window.__zs.step(0.3); });
    const r = await page.evaluate(() => ({
      active: document.activeElement?.tagName,
      focusable: document.querySelectorAll('#hud [tabindex], #hud button, #hud a, #edges [tabindex], #edges button').length,
    }));
    expect(r).toEqual({ active: 'BODY', focusable: 0 });
  });

  test('axe : aucune violation avec le HUD et E2-11 affichés', async ({ page }) => {
    await open(page);
    await page.evaluate(() => { const zs = window.__zs; zs.setPlayer(1800, 900); zs.setPlanks('fenetre-nord', 2); zs.setPlanks('fenetre-ouest', 0); zs.setPlanks('fenetre-est', 1); zs.step(0.5); });
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  });

  test('aucune cible tactile de moins de 44 px (boutons et champs visibles)', async ({ page }) => {
    await open(page);
    await page.evaluate(() => { window.__zs.setPlanks('fenetre-nord', 0); window.__zs.step(0.1); });
    const small = await page.evaluate(() => [...document.querySelectorAll('button, a, input, [role="button"]')].filter((e) => e.getClientRects().length > 0 && getComputedStyle(e).visibility !== 'hidden').map((e) => { const r = e.getBoundingClientRect(); return { id: e.id, w: r.width, h: r.height }; }).filter((b) => b.w < 44 || b.h < 44));
    expect(small).toEqual([]);
  });

  test('aucune requête externe, aucun stockage, console propre (HUD, flèches, réparation bloquée)', async ({ page, baseURL }) => {
    const external = [];
    const problems = [];
    page.on('request', (r) => !r.url().startsWith(baseURL) && !r.url().startsWith('data:') && external.push(r.url()));
    page.on('console', (m) => ['error', 'warning'].includes(m.type()) && !BROWSER_NOISE.test(m.text()) && problems.push(m.text()));
    page.on('pageerror', (e) => problems.push(e.message));
    await open(page);
    await attack(page, 'fenetre-nord');
    await page.evaluate(() => { window.__zs.setPlayer(1800, 1400); window.__zs.step(1); window.__zs.setPlayer(1800, 900); window.__zs.step(2); });
    expect(external).toEqual([]);
    expect(problems).toEqual([]);
    expect(await page.evaluate(() => [localStorage.length, sessionStorage.length, document.cookie])).toEqual([0, 0, '']);
  });
});

test.describe('écran d\'accueil (jeu.html seulement)', () => {
  const html = readFileSync('jeu.html', 'utf8');
  const index = readFileSync('index.html', 'utf8');
  const tokens = readFileSync('css/tokens.css', 'utf8');

  test('jeu.html contient les trois balises « application web » et un theme-color lu de tokens.css ; viewport-fit=cover reste', async () => {
    expect(html).toContain('<meta name="apple-mobile-web-app-capable" content="yes">');
    expect(html).toContain('<meta name="mobile-web-app-capable" content="yes">');
    expect(html).toContain('<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">');
    const theme = /<meta name="theme-color" content="(#[0-9a-fA-F]{6})">/.exec(html)?.[1];
    expect(theme?.toLowerCase()).toBe(/--color-bg:\s*(#[0-9a-fA-F]{6})/.exec(tokens)[1].toLowerCase());
    expect(html).toMatch(/<meta name="viewport" content="[^"]*viewport-fit=cover/);
  });

  test('index.html n\'a aucune de ces balises ; aucun manifeste ni service worker', async () => {
    for (const name of ['apple-mobile-web-app-capable', 'mobile-web-app-capable', 'apple-mobile-web-app-status-bar-style', 'theme-color']) expect(index).not.toContain(`name="${name}"`);
    expect(html).not.toMatch(/rel="manifest"|serviceWorker/);
  });

  test('les marges de sécurité sont respectées : le HUD et Pause s\'appuient sur --safe-* (lot 3l : .hud et .pause-button de game-ui.css ; avant : .hud-left)', async () => {
    const css = readFileSync('css/game-ui.css', 'utf8');
    expect(css).toMatch(/--edge-top: calc\(var\(--game-margin\) \+ var\(--safe-top\)\)/);
    expect(css).toMatch(/\.hud \{[^}]*top: var\(--edge-top\);[^}]*left: var\(--edge-left\);[^}]*right: var\(--edge-right\)/s);
    expect(css).toMatch(/\.pause-button \{[^}]*top: calc\(var\(--edge-top\)[^}]*right: calc\(var\(--edge-right\)/s);
    expect(readFileSync('js/game/game.js', 'utf8')).toMatch(/--safe-/);
  });
});
