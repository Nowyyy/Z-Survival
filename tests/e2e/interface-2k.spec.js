// Lot 8j-B : interface de la partie à l'échelle des grands écrans (--ui-k, js/game/ui-echelle.js) et volumes au pour cent (js/game/options-menu.js).
// (1) Jusqu'à 1080 px de haut : --ui-k vaut 1 et chaque écran (HUD, pause, Options en partie, fin E2-7) est identique au pixel à celui qu'on obtient en
// réinjectant les règles d'avant le lot (tailles fixes de tokens.css et game.css, unité --u du menu) : même page, même machine. La comparaison avec
// origin/dev elle-même est faite hors CI (captures du bilan, Docs/ref/correctifs-8j.md). (2) En 2560 × 1440, 3840 × 2160 et 2560 × 1080 : facteur,
// tailles mesurées (à 2 % près), cibles ≥ 44 px × facteur, rien hors de l'écran ni de chevauché ; axe. (3) Curseurs : clavier (±1, ±10, 0, 100),
// valeur écrite, entier gardé dans zs.device.v1 et relu, ancien multiple de 10 accepté, valeur invalide = défaut, clic d'essai limité.
// Canevas 3D masqué et onglet « caché » (la partie n'avance que par step()) ; ?vhs=0 ; le point « REC » figé.
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { apart } from './helpers.js';

const PETITES = [[932, 430], [667, 375], [1366, 768], [1920, 1080]];
const GRANDES = [[2560, 1440, 4 / 3], [3840, 2160, 2], [2560, 1080, 1]];
const FIGE = '#game-canvas{visibility:hidden!important} *{caret-color:transparent!important} #hud-rec{animation:none!important}';
// Règles d'avant le lot 8j (tokens.css, lot 3l ; game.css ; menu.css), réinjectées pour la comparaison au pixel.
const AVANT = `:root{--hud-fs:calc(14px * var(--hud-text-scale));--hud-gap:4px;--hud-radius:6px;--hud-target:44px;--hud-pause-size:max(44px, calc(2 * var(--hud-row) + var(--hud-gap)));--game-margin:16px}
.sound-hint{min-width:var(--touch-target);min-height:var(--touch-target);padding:var(--space-2) var(--space-5);font-size:inherit}
.e5{--u:clamp(0.7px, min(calc(100vw / 932), calc(100vh / 430)), 2.4px)}
.panel-wrap.e5-voile > .e5-panneau{--menu-cible:var(--touch-target, 44px)}`;
// Lot 8j (demande du propriétaire en cours de lot) : écrans Options plus denses sur PC ; unité plafonnée à max(1,25 px, 100vh / 864). Sous ce
// plafond (téléphones), rien ne change : la comparaison au pixel des Options ne vaut que là.
const TELEPHONES = ['932,430', '667,375'];
const uOptions = (w, h) => Math.min(Math.min(2.4, Math.max(0.7, Math.min(w / 932, h / 430))), Math.max(1.25, h / 864));
// Lignes de réglage entièrement visibles dans la liste qui défile.
const lignesVisibles = (page) => page.evaluate(() => {
  const liste = document.getElementById('options-scroll').getBoundingClientRect();
  return [...document.querySelectorAll('#options-scroll .e5-ligne')].filter((l) => {
    const r = l.getBoundingClientRect();
    return r.height > 0 && r.top >= liste.top - 0.5 && r.bottom <= liste.bottom + 0.5;
  }).length;
});

async function ouvrirPartie(page, [width, height]) {
  await page.addInitScript(() => Object.defineProperty(Document.prototype, 'hidden', { get: () => true, configurable: true }));
  await page.setViewportSize({ width, height });
  await page.goto('/jeu.html?test=1&seed=1&vhs=0&wave=3&nospawn=1');
  await page.waitForFunction(() => window.__zs || document.getElementById('game-error')?.hidden === false, null, { timeout: 120_000 });
  if (await page.locator('#game-error').isVisible()) test.skip(true, 'WebGL indisponible');
  await page.addStyleTag({ content: FIGE });
  await page.evaluate(async () => {
    window.__zs.step(1);
    await document.fonts.ready;
  });
  // Écran tactile : le rappel du son (#sound-hint) s'affiche 1,5 s après le chargement ; il est attendu pour entrer dans les comparaisons.
  if (await page.evaluate(() => matchMedia('(pointer: coarse)').matches)) await expect(page.locator('#sound-hint')).toBeVisible({ timeout: 10_000 });
}
const taille = async (page, [width, height]) => {
  await page.setViewportSize({ width, height });
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))).catch(() => {}));
  await page.evaluate(() => window.__zs.step(0.05));
};
const facteur = (page) => page.evaluate(() => Number(getComputedStyle(document.documentElement).getPropertyValue('--ui-k')));
// Capture avec les règles du lot, puis avec les règles d'avant : renvoie les deux tampons.
// Hors HUD, le rappel du son (écran tactile) se masque au gré d'une minuterie de 2 s quand la partie est en pause : il est caché sur ces captures.
// Lot 8l : avant chaque capture, mise en page forcée puis deux images (rendu stabilisé) ; sans cela, en mobile (densité 2,75) à 1920 × 1080, l'icône
// du son de la pause différait de quelques pixels après l'injection des règles d'avant, à géométrie identique (course de rendu, pas une règle
// différente : vérifié en relisant les boîtes, et un vrai changement de 3 px des cibles reste détecté).
const stabiliser = (page) => page.evaluate(() => new Promise((r) => {
  document.body.getBoundingClientRect();
  requestAnimationFrame(() => requestAnimationFrame(r));
}).catch(() => {}));
async function avantApres(page, sansRappel = false) {
  const cache = sansRappel ? await page.addStyleTag({ content: '#sound-hint{visibility:hidden!important}' }) : null;
  await stabiliser(page);
  const apres = await page.screenshot();
  const style = await page.addStyleTag({ content: AVANT });
  await stabiliser(page);
  const avant = await page.screenshot();
  await style.evaluate((n) => n.remove());
  await cache?.evaluate((n) => n.remove());
  return { apres, avant };
}
const boites = (page, sel) => page.evaluate((s) => [...document.querySelectorAll(s)].filter((e) => e.getClientRects().length > 0).map((e) => {
  const r = e.getBoundingClientRect();
  return { l: r.left, t: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height, fs: Number.parseFloat(getComputedStyle(e).fontSize) };
}), sel);
const dedans = (b, w, h) => b.l >= -0.5 && b.t >= -0.5 && b.r <= w + 0.5 && b.b <= h + 0.5;
const ouvrirPause = async (page) => {
  await page.locator('#btn-pause').dispatchEvent('click');
  await expect(page.locator('#pause-panel')).toBeVisible();
};
const ouvrirOptionsPartie = async (page) => {
  await page.locator('#btn-options').dispatchEvent('click');
  await expect(page.locator('#options-panel')).toBeVisible({ timeout: 20_000 });
  await page.evaluate(() => document.fonts.ready);
};
const fermerTout = async (page) => {
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await expect(page.locator('#pause-panel')).toBeHidden();
};
const mourir = async (page) => {
  await page.evaluate(() => {
    window.__zs.setChutes(0);
    window.__zs.downPlayer();
    window.__zs.step(1);
  });
  await expect(page.locator('#end-panel')).toBeVisible({ timeout: 20_000 });
};

test.describe('interface de la partie à l\'échelle de l\'écran (lot 8j)', () => {
  test('jusqu\'à 1080 px de haut (932 × 430, 667 × 375, 1366 × 768, 1920 × 1080) : facteur 1, HUD, pause et fin identiques au pixel aux règles d\'avant (Options : sur téléphone)', async ({ page }) => {
    test.setTimeout(180_000);
    await ouvrirPartie(page, PETITES[0]);
    for (const s of PETITES) {
      await taille(page, s);
      expect(await facteur(page), `${s}`).toBe(1);
      const hud = await avantApres(page);
      expect(hud.apres.equals(hud.avant), `HUD ${s}`).toBe(true);
      await ouvrirPause(page);
      const pause = await avantApres(page, true);
      expect(pause.apres.equals(pause.avant), `pause ${s}`).toBe(true);
      await ouvrirOptionsPartie(page);
      if (TELEPHONES.includes(`${s}`)) {
        const options = await avantApres(page, true);
        expect(options.apres.equals(options.avant), `Options ${s}`).toBe(true);
      }
      await fermerTout(page);
    }
    await mourir(page);
    for (const s of PETITES) {
      await taille(page, s);
      const fin = await avantApres(page, true);
      expect(fin.apres.equals(fin.avant), `fin ${s}`).toBe(true);
    }
  });

  test('2560 × 1440, 3840 × 2160, 2560 × 1080 : facteur hauteur / 1080 (plafond 2), tailles à 2 % près, cibles ≥ 44 px × facteur, rien hors de l\'écran ni chevauché ; axe', async ({ page }) => {
    test.setTimeout(180_000);
    await ouvrirPartie(page, GRANDES[0]);
    for (const [w, h, k] of GRANDES) {
      await taille(page, [w, h]);
      const nom = `${w}×${h}`;
      expect(await facteur(page), nom).toBeCloseTo(k, 4);
      // HUD : police de base 15,75 px × k, blocs dans l'écran et jamais sous Pause, Pause ≥ 44 px × k.
      const [hud] = await boites(page, '#hud');
      expect(Math.abs(hud.fs / (15.75 * k) - 1), nom).toBeLessThan(0.02);
      const [pause] = await boites(page, '#btn-pause');
      expect(pause.w, nom).toBeGreaterThanOrEqual(44 * k - 0.5);
      expect(pause.h, nom).toBeGreaterThanOrEqual(44 * k - 0.5);
      const blocs = await boites(page, '#hud .hud-block');
      expect(blocs.length).toBeGreaterThan(3);
      for (const b of blocs) {
        expect(dedans(b, w, h), nom).toBe(true);
        expect(apart(b, pause), nom).toBe(true);
      }
      // Pause : panneau dans l'écran, boutons et icônes ≥ 44 px × k, sans chevauchement.
      await ouvrirPause(page);
      const [panneau] = await boites(page, '#pause-panel .panel');
      expect(dedans(panneau, w, h), nom).toBe(true);
      expect(Math.abs(panneau.fs / (15.75 * k) - 1), nom).toBeLessThan(0.02);
      const boutons = await boites(page, '#pause-panel .button');
      for (const b of boutons) expect(Math.min(b.w, b.h), nom).toBeGreaterThanOrEqual(44 * k - 0.5);
      for (let i = 0; i < boutons.length; i += 1) for (let j = i + 1; j < boutons.length; j += 1) expect(apart(boutons[i], boutons[j]), nom).toBe(true);
      if (w === 2560 && h === 1440) {
        const axe = await new AxeBuilder({ page }).include('#pause-panel').analyze();
        expect(axe.violations.map((v) => v.id)).toEqual([]);
      }
      // Options en partie : panneau dans l'écran, aucune ligne plus large que la liste, cibles ≥ 44 px × k, nom d'un réglage à l'unité des Options (plafond de densité, × hauteur / 1080).
      await ouvrirOptionsPartie(page);
      const [opt] = await boites(page, '#options-panel .e5-panneau');
      expect(dedans(opt, w, h), nom).toBe(true);
      expect(await page.locator('#options-scroll').evaluate((n) => n.scrollWidth <= n.clientWidth + 1), nom).toBe(true);
      for (const b of await boites(page, '#options-panel .e5-bouton, #options-panel .e5-curseur')) expect(b.h, nom).toBeGreaterThanOrEqual(44 * k - 0.5);
      const [nomReglage] = await boites(page, '#options-label-son');
      expect(Math.abs(nomReglage.fs / Math.max(14, 15 * uOptions(w, h)) - 1), nom).toBeLessThan(0.02);
      if (w === 2560 && h === 1440) {
        const axe = await new AxeBuilder({ page }).include('#options-panel').analyze();
        expect(axe.violations.map((v) => v.id)).toEqual([]);
      }
      await fermerTout(page);
    }
    // Fin de partie (E2-7) aux trois tailles.
    await mourir(page);
    for (const [w, h, k] of GRANDES) {
      await taille(page, [w, h]);
      const nom = `fin ${w}×${h}`;
      const [box] = await boites(page, '#end-box');
      expect(dedans(box, w, h), nom).toBe(true);
      expect(Math.abs(box.fs / (15.75 * k) - 1), nom).toBeLessThan(0.02);
      const boutons = await boites(page, '#end-panel .button');
      expect(boutons.length).toBe(2);
      for (const b of boutons) expect(b.h, nom).toBeGreaterThanOrEqual(44 * k - 0.5);
      expect(apart(boutons[0], boutons[1]), nom).toBe(true);
    }
  });

  test('Options sur PC plus denses (demande du propriétaire) : en 1366 × 768 et 1920 × 1080, plus de réglages visibles qu\'avec l\'unité d\'avant, dans la partie et dans le menu ; cibles ≥ 44 px', async ({ page }) => {
    test.setTimeout(150_000);
    const compter = async () => {
      const apres = await lignesVisibles(page);
      const style = await page.addStyleTag({ content: AVANT });
      const avant = await lignesVisibles(page);
      await style.evaluate((n) => n.remove());
      return { apres, avant };
    };
    await ouvrirPartie(page, [1920, 1080]);
    for (const [w, h, min] of [[1920, 1080, 10], [1366, 768, 6]]) {
      await taille(page, [w, h]);
      await ouvrirPause(page);
      await ouvrirOptionsPartie(page);
      const n = await compter();
      expect(n.apres, `partie ${w}×${h}`).toBeGreaterThanOrEqual(min);
      expect(n.apres, `partie ${w}×${h}`).toBeGreaterThan(n.avant);
      for (const b of await boites(page, '#options-panel .e5-bouton, #options-panel .e5-curseur')) expect(b.h).toBeGreaterThanOrEqual(43.5);
      await fermerTout(page);
    }
    // Menu principal : page Options (même composant).
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.goto('/jeu.html?test=1&menu=1&seed=1&ouverture=0');
    await expect(page.locator('#menu-jouer')).toBeVisible({ timeout: 60_000 });
    await page.waitForFunction(() => window.__zsMenu?.etat()?.menu !== null && !document.getElementById('e7'));
    await page.locator('#menu-trois-barres').click();
    await page.locator('#menu-options').click();
    await expect(page.locator('#menu-ecran-options')).toBeVisible();
    const n = await compter();
    expect(n.apres, 'menu 1920×1080').toBeGreaterThanOrEqual(10);
    expect(n.apres, 'menu 1920×1080').toBeGreaterThan(n.avant);
  });
});

test.describe('volumes au pour cent (lot 8j)', () => {
  test('pause : clavier ±1, ±10, Début, Fin ; valeur écrite ; ?store=local : entier gardé dans zs.device.v1 et relu ; ancien multiple de 10 accepté ; valeur invalide = défaut', async ({ page }) => {
    test.setTimeout(180_000);
    await page.addInitScript(() => {
      const pose = sessionStorage.getItem('zs.test.vol');
      if (pose === null) return;
      sessionStorage.removeItem('zs.test.vol');
      localStorage.setItem('zs.device.v1', pose);
    });
    const poser = (valeur) => page.evaluate((v) => sessionStorage.setItem('zs.test.vol', v), JSON.stringify(valeur));
    const appareil = () => page.evaluate(() => JSON.parse(localStorage.getItem('zs.device.v1')));
    const partie = async () => {
      await page.goto('/jeu.html?test=1&seed=1&store=local&nospawn=1');
      await page.waitForFunction(() => (window.__zs?.getState()?.time ?? 0) > 0.05, null, { timeout: 120_000 });
      await ouvrirPause(page);
      await ouvrirOptionsPartie(page);
    };
    await page.setViewportSize({ width: 932, height: 430 });
    await page.goto('/jeu.html?test=1&seed=1&store=local&nospawn=1');
    await poser({ v: 2, graphics: 'moyen', custom: null, son: { coupe: false, jeu: 40, musique: 100 } }); // ancien multiple de 10
    await partie();
    const vol = page.locator('#options-volume');
    await expect(vol).toHaveValue('40');
    await expect(vol).toHaveAttribute('step', '1');
    await vol.focus();
    const touche = async (code, attendu) => {
      await page.keyboard.press(code);
      await expect(vol).toHaveValue(String(attendu));
      await expect(vol).toHaveAttribute('aria-valuetext', `${attendu} %`);
      await expect(page.locator('#options-volume-valeur')).toHaveText(`${attendu} %`);
      expect((await page.evaluate(() => window.__zs.getState().audio)).volume).toBe(attendu);
    };
    await touche('ArrowRight', 41);
    await touche('ArrowUp', 42);
    await touche('ArrowLeft', 41);
    await touche('ArrowDown', 40);
    await touche('PageUp', 50);
    await touche('PageDown', 40);
    await touche('Home', 0);
    await touche('ArrowLeft', 0);
    await touche('End', 100);
    await touche('PageUp', 100);
    await touche('PageDown', 90);
    for (let i = 0; i < 3; i += 1) await page.keyboard.press('PageDown');
    for (let i = 0; i < 7; i += 1) await page.keyboard.press('ArrowRight');
    await expect(vol).toHaveValue('67');
    const lu = await appareil();
    expect(lu.son.jeu).toBe(67);
    expect(Number.isInteger(lu.son.jeu)).toBe(true);
    expect(lu.graphics).toBe('moyen');
    // Rechargement : l'entier est relu par la partie et le curseur.
    await partie();
    await expect(vol).toHaveValue('67');
    expect((await page.evaluate(() => window.__zs.getState().audio)).volume).toBe(67);
    // Valeurs invalides : défaut (100).
    for (const mauvais of [37.5, 150, -1, '37']) {
      await poser({ v: 2, graphics: 'moyen', custom: null, son: { coupe: false, jeu: mauvais, musique: 100 } });
      await partie();
      await expect(vol, `${mauvais}`).toHaveValue('100');
      expect((await page.evaluate(() => window.__zs.getState().audio)).volume).toBe(100);
    }
  });

  test('menu : glisser le curseur « Volume du jeu » ne joue pas un clic à chaque pour cent (au plus un toutes les 150 ms, puis un au relâchement) ; la valeur suit chaque pour cent', async ({ page }) => {
    test.setTimeout(150_000);
    await page.setViewportSize({ width: 932, height: 430 });
    await page.goto('/jeu.html?test=1&menu=1&seed=1&ouverture=0');
    await expect(page.locator('#menu-jouer')).toBeVisible({ timeout: 60_000 });
    await page.waitForFunction(() => window.__zsMenu?.etat()?.menu !== null && !document.getElementById('e7'));
    await page.locator('#menu-trois-barres').click();
    await page.locator('#menu-options').click();
    await expect(page.locator('#menu-ecran-options')).toBeVisible();
    await page.waitForFunction(() => window.__zsMenu.sons().pretes.includes('clic'), null, { timeout: 60_000 });
    const clics = () => page.evaluate(() => window.__zsMenu.sons().journal.filter((e) => e.son === 'clic' && e.origine === 'clic').length);
    // Glissement d'un coup : 60 pas de 1 % sans attente.
    let avant = await clics();
    const texte = await page.evaluate(() => {
      const c = document.getElementById('options-volume');
      const vus = [];
      for (let v = 99; v >= 40; v -= 1) {
        c.value = String(v);
        c.dispatchEvent(new Event('input', { bubbles: true }));
        vus.push(document.getElementById('options-volume-valeur').textContent);
      }
      return vus;
    });
    expect(texte[0]).toBe('99 %');
    expect(texte.at(-1)).toBe('40 %');
    expect(await clics() - avant).toBe(1); // le premier pour cent seulement
    await page.locator('#options-volume').dispatchEvent('change');
    expect(await clics() - avant).toBe(2); // et un au relâchement
    expect((await page.evaluate(() => window.__zsMenu.sons().volumes)).jeu).toBe(40);
    // Glissement lent : un pas toutes les 30 ms pendant ~0,9 s : au plus un clic par tranche de 150 ms (plus celui du relâchement).
    avant = await clics();
    const duree = await page.evaluate(async () => {
      const c = document.getElementById('options-volume');
      const t0 = performance.now();
      for (let v = 41; v <= 70; v += 1) {
        c.value = String(v);
        c.dispatchEvent(new Event('input', { bubbles: true }));
        await new Promise((r) => setTimeout(r, 30));
      }
      c.dispatchEvent(new Event('change', { bubbles: true }));
      return performance.now() - t0;
    });
    const n = await clics() - avant;
    expect(n).toBeGreaterThanOrEqual(2);
    expect(n).toBeLessThanOrEqual(Math.ceil(duree / 150) + 1);
    expect(n).toBeLessThan(30);
    expect((await page.evaluate(() => window.__zsMenu.sons().volumes)).jeu).toBe(70);
  });
});
