import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { readFileSync } from 'node:fs';
import { trackingEvents } from '../../js/core/vhs.js';
import { waitReady } from './helpers.js';

// Lot 2c : animation de vague (E2-8), mélodie d'annonce et effet VHS. Tout passe par step() (temps de jeu), l'horloge d'effet réglée par
// setVhsClock() et le journal des sons : aucune animation ni mélodie n'est attendue en temps réel. 667×375 par défaut ; les tests se
// désactivent seuls si WebGL manque.
const SIZE = { width: 667, height: 375 };
const vhsParams = JSON.parse(readFileSync('data/game/vhs.json', 'utf8'));
const URL = (extra = '') => `/jeu.html?test=1&seed=1${extra}`;
const state = (page) => page.evaluate(() => window.__zs.getState());
const splash = async (page) => (await state(page)).splash;
const audio = async (page) => (await state(page)).audio;
const step = (page, seconds) => page.evaluate((s) => window.__zs.step(s), seconds);
const BROWSER_NOISE = /GL Driver Message|ReadPixels|GPU stall/;
const FRAME = '#wave-announce';

// Par défaut, la boucle de rendu est arrêtée une fois la partie prête (requestAnimationFrame neutralisé) : le temps de jeu n'avance que par
// step(). { live: true } garde la boucle réelle (pause, mort, horloge d'effet réelle).
async function open(page, extra = '', size = SIZE, { live = false } = {}) {
  await page.setViewportSize(size);
  await page.goto(URL(extra));
  await waitReady(page);
  if (live) return;
  await page.evaluate(() => { window.requestAnimationFrame = () => 0; });
  await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 150)));
}
async function unlock(page) {
  await page.mouse.click(40, 40); // premier geste du joueur
  await expect.poll(async () => (await audio(page)).unlocked).toBe(true);
}
// Attend les sons de fond (vague-renforcee, vague-fin) : calculés pendant la partie, par tranches de 4 ms par image.
const backgroundReady = (page) => expect.poll(async () => (await audio(page)).ready, { timeout: 45_000 }).toBe(true);
const wave = (page, n) => page.evaluate((w) => window.__zs.startWave(w), n);
// Rectangle (en pixels CSS) du titre et du sous-titre visibles de l'animation.
const box = (page) => page.evaluate(() => {
  const rects = ['wave-announce-title', 'wave-announce-sub'].map((id) => document.getElementById(id)).filter((el) => !el.hidden).map((el) => el.getBoundingClientRect());
  const left = Math.min(...rects.map((r) => r.left));
  const right = Math.max(...rects.map((r) => r.right));
  const top = Math.min(...rects.map((r) => r.top));
  const bottom = Math.max(...rects.map((r) => r.bottom));
  return { left, right, top, bottom, cx: (left + right) / 2, cy: (top + bottom) / 2, w: window.innerWidth, h: window.innerHeight };
});

test.describe('animation de vague : contenu, chronologie, position', () => {
  test('démarre quand le compte à rebours atteint 3,0 s : texte « Vague N », kind début', async ({ page }) => {
    await open(page);
    await wave(page, 3);
    expect((await splash(page)).visible).toBe(false);
    await step(page, 0.05);
    const s = await splash(page);
    expect(s).toMatchObject({ visible: true, kind: 'debut', step: 'entree', title: 'Vague 3', subtitle: null, wave: 3 });
    await expect(page.locator('#wave-announce-title')).toHaveText('Vague 3');
    await expect(page.locator('#wave-announce-sub')).toBeHidden();
    expect((await state(page)).waves.waitLeft).toBeCloseTo(2.95, 6);
  });

  test('vague 2 (pause de 8 s) : invisible tant que le compte à rebours dépasse 3,0 s, visible dès qu\'il l\'atteint', async ({ page }) => {
    await open(page);
    await page.evaluate(() => window.__zs.setWaveParams({ total: { base: 1, linear: 0, quadratic: 0 } }));
    await step(page, 4.2); // le début (3,8 s) est terminé
    await page.evaluate(() => window.__zs.killAll());
    await step(page, 0.1); // fin de la vague 1 : la fin s'affiche, la vague 2 attend 8 s
    await step(page, 2.9);
    const r = await page.evaluate(() => {
      const zs = window.__zs;
      const out = { before: null, at: null };
      for (let i = 0; i < 200; i += 1) {
        const s = zs.getState();
        if (s.waves.waitLeft <= 3.0 + 1e-9 && s.waves.phase === 'attente') {
          out.at = { waitLeft: s.waves.waitLeft, kind: s.splash.kind, wave: s.splash.wave, step: s.splash.step };
          break;
        }
        out.before = { waitLeft: s.waves.waitLeft, kind: s.splash.kind };
        zs.step(0.05);
      }
      return out;
    });
    expect(r.before.waitLeft).toBeGreaterThan(3);
    expect(r.at.waitLeft).toBeLessThanOrEqual(3 + 1e-9);
    expect(r.at.waitLeft).toBeGreaterThan(2.9);
    // Le pas qui franchit 3,0 s démarre l'animation du début : visible juste après.
    await step(page, 0.05);
    expect(await splash(page)).toMatchObject({ visible: true, kind: 'debut', wave: 2 });
  });

  test('vague renforcée (5) : même titre, sous-titre « Vague renforcée »', async ({ page }) => {
    await open(page);
    await wave(page, 5);
    await step(page, 0.2);
    expect(await splash(page)).toMatchObject({ visible: true, kind: 'renforcee', title: 'Vague 5', subtitle: 'Vague renforcée' });
    await expect(page.locator('#wave-announce-title')).toHaveText('Vague 5');
    await expect(page.locator('#wave-announce-sub')).toHaveText('Vague renforcée');
    await expect(page.locator(FRAME)).toHaveAttribute('data-block', 'E2-8');
  });

  test('fin de vague après killAll() : « Vague N terminée » et « Vie restaurée »', async ({ page }) => {
    await open(page);
    await page.evaluate(() => window.__zs.setWaveParams({ total: { base: 1, linear: 0, quadratic: 0 } }));
    await step(page, 4.2); // le début (3,8 s) est terminé : sinon il l'emporterait sur la fin
    await page.evaluate(() => window.__zs.killAll());
    await step(page, 0.1);
    expect(await splash(page)).toMatchObject({ visible: true, kind: 'fin', title: 'Vague 1 terminée', subtitle: 'Vie restaurée', wave: 1 });
    await expect(page.locator('#wave-announce-title')).toHaveText('Vague 1 terminée');
    await expect(page.locator('#wave-announce-sub')).toHaveText('Vie restaurée');
    await expect(page.locator(FRAME)).toHaveClass(/is-fin/);
  });

  test('durée de visibilité du début : 3,8 s de temps de jeu (75 pas de 0,05 s après le départ, plus l\'image de départ)', async ({ page }) => {
    await open(page);
    await wave(page, 4);
    const n = await page.evaluate(() => {
      let count = 0;
      for (let i = 0; i < 120; i += 1) {
        window.__zs.step(0.05);
        if (window.__zs.getState().splash.visible) count += 1;
      }
      return count;
    });
    expect((n * 0.05 + 0.05)).toBeGreaterThanOrEqual(3.75);
    expect((n * 0.05 + 0.05)).toBeLessThanOrEqual(3.85);
  });

  test('chronologie : entrée, tenue puis sortie ; culmine à l\'arrivée des zombies (3,0 s)', async ({ page }) => {
    await open(page);
    await wave(page, 2);
    const at = async (seconds) => {
      await step(page, seconds);
      return splash(page);
    };
    expect((await at(0.1)).step).toBe('entree');
    expect((await at(0.5)).step).toBe('tenue');
    const arrival = await at(2.45); // t = 3,05 s : les zombies viennent d'apparaître
    expect(arrival.step).toBe('tenue');
    expect((await state(page)).waves.phase).toBe('apparition');
    expect((await at(0.4)).step).toBe('sortie');
    expect((await at(0.5)).visible).toBe(false);
  });

  test('aucun texte d\'annonce en haut de l\'écran : l\'animation est au centre (667×375)', async ({ page }) => {
    await open(page);
    await wave(page, 12);
    await step(page, 1);
    const b = await box(page);
    expect(Math.abs(b.cx - b.w / 2)).toBeLessThanOrEqual(0.02 * b.w);
    expect(Math.abs(b.cy - b.h / 2)).toBeLessThanOrEqual(0.02 * b.h);
    expect(b.top).toBeGreaterThan(0.2 * b.h);
  });

  for (const size of [{ width: 667, height: 375 }, { width: 375, height: 667 }, { width: 1440, height: 900 }]) {
    test(`centrée à 2 % près du centre de la fenêtre et dans les marges de 16 px (${size.width}×${size.height})`, async ({ page }, testInfo) => {
      if (size.width < size.height && testInfo.project.name === 'mobile') {
        // Téléphone en portrait : le message de rotation passe avant le jeu (la partie est figée), sans erreur ni animation visible.
        const problems = [];
        page.on('console', (m) => ['error', 'warning'].includes(m.type()) && !BROWSER_NOISE.test(m.text()) && problems.push(m.text()));
        page.on('pageerror', (e) => problems.push(e.message));
        await page.setViewportSize(size);
        await page.goto(URL());
        await expect(page.locator('#rotate')).toBeVisible();
        await expect(page.locator('#game-root')).toBeHidden();
        await expect(page.locator(FRAME)).toBeHidden();
        expect(problems).toEqual([]);
        return;
      }
      await open(page, size.width > 1000 ? '&dpr=1' : '', size);
      for (const n of [5, 12, 188]) {
        await wave(page, n);
        await step(page, 0.05); // début de l'entrée : échelle la plus grande (1,18)
        const b = await box(page);
        expect(Math.abs(b.cx - b.w / 2), `vague ${n}`).toBeLessThanOrEqual(0.02 * b.w);
        expect(Math.abs(b.cy - b.h / 2), `vague ${n}`).toBeLessThanOrEqual(0.02 * b.h);
        expect(b.left, `vague ${n}`).toBeGreaterThanOrEqual(16);
        expect(b.right, `vague ${n}`).toBeLessThanOrEqual(b.w - 16);
        expect(b.top, `vague ${n}`).toBeGreaterThanOrEqual(16);
        expect(b.bottom, `vague ${n}`).toBeLessThanOrEqual(b.h - 16);
      }
      // Fin de vague avec un grand numéro : le texte le plus long.
      await page.evaluate(() => { window.__zs.startWave(188); window.__zs.setWaveParams({ total: { base: 1, linear: 0, quadratic: 0 } }); window.__zs.step(4.2); window.__zs.killAll(); window.__zs.step(0.1); });
      expect((await splash(page)).title).toBe('Vague 188 terminée');
      const b = await box(page);
      expect(b.left).toBeGreaterThanOrEqual(16);
      expect(b.right).toBeLessThanOrEqual(b.w - 16);
    });
  }

  test('aria-hidden, sans focus ni cible tactile, au-dessus du canvas, de l\'effet VHS et du HUD ; #hud-live inchangé', async ({ page }) => {
    await open(page);
    await step(page, 0.2);
    const info = await page.evaluate(() => {
      const el = document.getElementById('wave-announce');
      const order = (a, b) => Boolean(document.getElementById(a).compareDocumentPosition(document.getElementById(b)) & Node.DOCUMENT_POSITION_FOLLOWING);
      return {
        aria: el.getAttribute('aria-hidden'), pointer: getComputedStyle(el).pointerEvents, tab: el.tabIndex, buttons: el.querySelectorAll('button, a, input').length,
        active: document.activeElement?.id ?? document.activeElement?.tagName, position: getComputedStyle(el).position,
        canvasBeforeVhs: order('game-canvas', 'vhs'), vhsBeforeHud: order('vhs', 'hud'), hudBeforeSplash: order('hud', 'wave-announce'),
        blocks: [...document.querySelectorAll('[data-block]')].map((b) => b.dataset.block),
      };
    });
    expect(info).toMatchObject({ aria: 'true', pointer: 'none', tab: -1, buttons: 0, position: 'fixed', canvasBeforeVhs: true, vhsBeforeHud: true, hudBeforeSplash: true });
    expect(info.active).not.toBe('wave-announce');
    expect(info.blocks).toEqual(['E2-1', 'E2-2', 'E2-8', 'E2-5', 'E2-3', 'E2-4', 'E2-6', 'E2-7']);
    await step(page, 3); // l'annonce vocale suit le début de la vague (apparitions), comme au lot 2 : elle n'a pas changé
    await expect(page.locator('#hud-live')).toHaveText('Vague 1.');
  });

  test('l\'animation ne vole pas les touches : le joueur se déplace pendant l\'annonce', async ({ page }) => {
    await open(page);
    await step(page, 0.2);
    await page.keyboard.down('KeyD');
    await step(page, 0.3);
    await page.keyboard.up('KeyD');
    expect((await state(page)).player.x).toBeGreaterThan(800);
  });

  test('?nospawn=1 : aucune animation', async ({ page }) => {
    await open(page, '&nospawn=1');
    await step(page, 10);
    expect(await splash(page)).toMatchObject({ visible: false, kind: null });
    await expect(page.locator(FRAME)).not.toHaveClass(/is-visible/);
  });
});

test.describe('animation de vague : sons', () => {
  test('la mélodie est demandée une seule fois par animation (journal, temps de jeu) ; la vague renforcée a la sienne', async ({ page }) => {
    await open(page);
    await unlock(page);
    await wave(page, 1);
    const t0 = (await state(page)).time;
    await step(page, 3.9);
    let log = (await audio(page)).log.filter((e) => e.sound.startsWith('vague-'));
    expect(log.map((e) => e.sound)).toEqual(['vague-annonce']);
    expect(log[0].gameTime - t0).toBeLessThan(0.2); // part avec le début de l'animation
    await step(page, 1);
    expect((await audio(page)).log.filter((e) => e.sound.startsWith('vague-')).map((e) => e.sound)).toEqual(['vague-annonce']);
    await backgroundReady(page);
    await wave(page, 5);
    await step(page, 3.9);
    log = (await audio(page)).log.filter((e) => e.sound.startsWith('vague-'));
    expect(log.map((e) => e.sound)).toEqual(['vague-annonce', 'vague-renforcee']);
  });

  test('vague-fin à la fin de la vague, une seule fois', async ({ page }) => {
    await open(page);
    await unlock(page);
    await backgroundReady(page);
    await page.evaluate(() => window.__zs.setWaveParams({ total: { base: 1, linear: 0, quadratic: 0 } }));
    await step(page, 4.2);
    await page.evaluate(() => window.__zs.killAll());
    await step(page, 0.1);
    await step(page, 3);
    const log = (await audio(page)).log.filter((e) => e.sound === 'vague-fin');
    expect(log).toHaveLength(1);
    expect(log[0].variant).toBeGreaterThanOrEqual(0);
    expect(log[0].variant).toBeLessThan(2);
  });

  test('audio non débloqué : animation visible, aucune demande de son et aucune lecture retardée ensuite', async ({ page }) => {
    await open(page);
    expect((await audio(page)).unlocked).toBe(false);
    await wave(page, 1);
    await step(page, 0.5);
    expect((await splash(page)).visible).toBe(true);
    await step(page, 4);
    expect((await audio(page)).log.filter((e) => e.sound.startsWith('vague-'))).toEqual([]);
    await unlock(page);
    await step(page, 0.5);
    expect((await audio(page)).log.filter((e) => e.sound.startsWith('vague-'))).toEqual([]);
  });

  test('M (touche) coupe tout : animation visible, aucune lecture effective ; le bouton « Son » aussi', async ({ page }) => {
    await open(page);
    await unlock(page);
    await page.keyboard.press('KeyM');
    expect((await audio(page)).muted).toBe(true);
    await wave(page, 1);
    await step(page, 0.5);
    expect((await splash(page)).visible).toBe(true);
    let log = (await audio(page)).log.filter((e) => e.sound === 'vague-annonce');
    expect(log.length).toBe(1);
    expect(log[0].muted).toBe(true);
    expect((await audio(page)).annonceActive).toBe(0);
    await page.keyboard.press('KeyM');
    await page.getByRole('button', { name: 'Pause' }).click();
    await page.getByRole('button', { name: /Son : activé/ }).click();
    expect((await audio(page)).muted).toBe(true);
    await page.getByRole('button', { name: 'Reprendre' }).click();
    await wave(page, 2);
    await step(page, 0.5);
    log = (await audio(page)).log.filter((e) => e.sound === 'vague-annonce');
    expect(log.every((e) => e.muted === true)).toBe(true);
    expect((await splash(page)).visible).toBe(true);
  });

  test('une mélodie jouée est comptée (annonceActive) puis arrêtée en fondu à la mort', async ({ page }) => {
    await open(page, '', SIZE, { live: true });
    await unlock(page);
    await page.evaluate(() => window.__zs.startWave(1));
    await page.evaluate(() => window.__zs.step(0.2));
    await expect.poll(async () => (await audio(page)).annonceActive).toBeGreaterThan(0);
    // Mort : un zombie au contact, vie à 0.
    const p = (await state(page)).player;
    await page.evaluate(([x, y]) => { for (let i = 0; i < 6; i += 1) window.__zs.spawnEnemy(x + 20 + i, y); }, [p.x, p.y]);
    await page.evaluate(() => window.__zs.step(40));
    expect((await state(page)).dead).toBe(true);
    expect(await splash(page)).toMatchObject({ visible: false });
    await expect(page.locator(FRAME)).not.toHaveClass(/is-visible/);
    await expect.poll(async () => (await audio(page)).annonceActive, { timeout: 5000 }).toBe(0);
  });

  test('« Rejouer » : état propre, nouvelle animation pour la vague 1', async ({ page }) => {
    await open(page, '', SIZE, { live: true });
    await unlock(page);
    await page.evaluate(() => window.__zs.step(0.2));
    const p = (await state(page)).player;
    await page.evaluate(([x, y]) => { for (let i = 0; i < 6; i += 1) window.__zs.spawnEnemy(x + 20 + i, y); }, [p.x, p.y]);
    await page.evaluate(() => window.__zs.step(40));
    await expect(page.locator('#end-panel')).toBeVisible();
    await page.getByRole('button', { name: 'Rejouer' }).click();
    await expect(page.locator('#end-panel')).toBeHidden();
    await expect.poll(async () => (await audio(page)).annonceActive).toBe(0);
    const s = await state(page);
    expect(s.dead).toBe(false);
    expect(s.waves).toMatchObject({ phase: 'attente', wave: 1 });
    await page.evaluate(() => window.__zs.step(0.1));
    expect(await splash(page)).toMatchObject({ visible: true, kind: 'debut', wave: 1 });
  });

  test('pause : animation figée (mêmes valeurs après plusieurs images) et contexte audio suspendu', async ({ page }) => {
    await open(page, '', SIZE, { live: true });
    await unlock(page);
    await page.evaluate(() => window.__zs.startWave(1));
    await page.evaluate(() => window.__zs.step(0.3));
    await page.getByRole('button', { name: 'Pause' }).click();
    const before = await splash(page);
    expect(before.visible).toBe(true);
    await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 700)));
    const after = await splash(page);
    expect(after).toEqual(before);
    await expect.poll(async () => (await audio(page)).contextState).toBe('suspended');
    await page.getByRole('button', { name: 'Reprendre' }).click();
    await expect.poll(async () => (await splash(page)).t).toBeGreaterThan(before.t);
  });
});

test.describe('animation de vague et effet VHS : mouvement réduit', () => {
  test.beforeEach(async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
  });

  test('animation sans aucun mouvement : variables de secousse, de décalage et d\'échelle neutres, opacité 0 ou 1, mêmes durées', async ({ page }) => {
    await open(page);
    await wave(page, 5);
    let visible = 0;
    for (let i = 0; i < 80; i += 1) {
      await step(page, 0.05);
      const s = await splash(page);
      const vars = await page.locator(FRAME).evaluate((el) => ['--splash-opacity', '--splash-scale', '--splash-shift', '--splash-split', '--splash-flicker', '--splash-tear1-h', '--splash-tear2-h'].map((n) => el.style.getPropertyValue(n)));
      if (s.visible) {
        visible += 1;
        expect(vars).toEqual(['1', '1', '0', '0', '0', '0', '0']);
        expect(s.subtitle).toBe('Vague renforcée');
      } else expect(vars.slice(0, 1)).toEqual(['0']);
    }
    expect(visible * 0.05).toBeGreaterThanOrEqual(3.7);
    expect(visible * 0.05).toBeLessThanOrEqual(3.8);
  });

  test('#vhs absent, effet désactivé, interrupteur désactivé avec son libellé', async ({ page }) => {
    await open(page);
    expect(await page.locator('#vhs').count()).toBe(0);
    expect((await state(page)).vhs).toMatchObject({ enabled: true, on: false, layers: 0, reducedMotion: true });
    await page.getByRole('button', { name: 'Pause' }).click();
    const toggle = page.locator('#btn-vhs');
    await expect(toggle).toBeDisabled();
    await expect(toggle).toHaveText('Effet VHS : désactivé (mouvement réduit)');
  });

  test('?vhs=1 ne force pas l\'effet sous mouvement réduit', async ({ page }) => {
    await open(page, '&vhs=1');
    expect(await page.locator('#vhs').count()).toBe(0);
    expect((await state(page)).vhs.on).toBe(false);
  });
});

test.describe('effet VHS', () => {
  test('présent par défaut, exactement trois couches, décoratif', async ({ page }) => {
    await open(page);
    expect((await state(page)).vhs).toMatchObject({ enabled: true, on: true, layers: 3, reducedMotion: false });
    const info = await page.evaluate(() => {
      const el = document.getElementById('vhs');
      return { aria: el.getAttribute('aria-hidden'), pointer: getComputedStyle(el).pointerEvents, classes: [...el.children].map((c) => c.className), block: el.hasAttribute('data-block'), tab: el.tabIndex, pointerLayers: [...el.children].map((c) => getComputedStyle(c).pointerEvents) };
    });
    expect(info).toEqual({ aria: 'true', pointer: 'none', classes: ['vhs-static', 'vhs-grain', 'vhs-track'], block: false, tab: -1, pointerLayers: ['none', 'none', 'none'] });
  });

  test('ordre d\'empilement : au-dessus du canvas, sous le HUD, les boutons et l\'animation de vague ; jamais de mode de fusion, de filtre', async ({ page }) => {
    await open(page);
    const info = await page.evaluate(() => {
      const all = [document.getElementById('vhs'), ...document.getElementById('vhs').querySelectorAll('*')];
      const order = (a, b) => Boolean(document.getElementById(a).compareDocumentPosition(document.getElementById(b)) & Node.DOCUMENT_POSITION_FOLLOWING);
      const css = all.map((el) => { const s = getComputedStyle(el); return [s.mixBlendMode, s.filter, s.backdropFilter || 'none']; });
      return { canvasFirst: order('game-canvas', 'vhs'), hud: order('vhs', 'hud'), splash: order('vhs', 'wave-announce'), pause: order('vhs', 'btn-pause'), css };
    });
    expect(info).toMatchObject({ canvasFirst: true, hud: true, splash: true, pause: true });
    for (const [blend, filter, backdrop] of info.css) expect([blend, filter, backdrop]).toEqual(['normal', 'none', 'none']);
  });

  test('les couches ne bloquent ni le tactile ni la souris : un clic au centre atteint le jeu', async ({ page }) => {
    await open(page);
    const hit = await page.evaluate(() => document.elementFromPoint(window.innerWidth / 2, window.innerHeight / 2)?.closest('#vhs') !== null);
    expect(hit).toBe(false);
  });

  test('?vhs=0 supprime l\'effet ; ?vhs=1 le garde ; une autre valeur est ignorée', async ({ page }) => {
    await open(page, '&vhs=0');
    expect(await page.locator('#vhs').count()).toBe(0);
    expect((await state(page)).vhs).toMatchObject({ enabled: false, on: false, layers: 0 });
    await open(page, '&vhs=1');
    expect((await state(page)).vhs).toMatchObject({ enabled: true, on: true, layers: 3 });
    await open(page, '&vhs=oui');
    expect((await state(page)).vhs).toMatchObject({ enabled: true, on: true, layers: 3 });
  });

  test('l\'interrupteur de la pause active et coupe l\'effet (aria-pressed, libellé, 44 px)', async ({ page }) => {
    await open(page);
    await page.getByRole('button', { name: 'Pause' }).click();
    const toggle = page.locator('#btn-vhs');
    await expect(toggle).toHaveAttribute('aria-pressed', 'true');
    await expect(toggle).toHaveText('Effet VHS : activé');
    const b = await toggle.boundingBox();
    expect(b.height).toBeGreaterThanOrEqual(43.5);
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-pressed', 'false');
    await expect(toggle).toHaveText('Effet VHS : coupé');
    expect(await page.locator('#vhs').count()).toBe(0);
    expect((await state(page)).vhs).toMatchObject({ enabled: false, on: false, layers: 0 });
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-pressed', 'true');
    expect(await page.locator('#vhs').count()).toBe(1);
    expect((await state(page)).vhs).toMatchObject({ enabled: true, on: true, layers: 3 });
    await page.keyboard.press('Space'); // accessible au clavier : le bouton garde le focus et se bascule
    await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  });

  test('avec ?vhs=0 l\'interrupteur remet l\'effet', async ({ page }) => {
    await open(page, '&vhs=0');
    await page.getByRole('button', { name: 'Pause' }).click();
    await expect(page.locator('#btn-vhs')).toHaveAttribute('aria-pressed', 'false');
    await page.locator('#btn-vhs').click();
    expect((await state(page)).vhs).toMatchObject({ enabled: true, on: true, layers: 3 });
  });

  test('le grain saute au pas de 10 par seconde (horloge d\'effet réglée) et change de position', async ({ page }) => {
    await open(page);
    const grain = async (t) => {
      await page.evaluate((x) => window.__zs.setVhsClock(x), t);
      return (await state(page)).vhs.grain;
    };
    const a = await grain(0.05);
    const a2 = await grain(0.09);
    const b = await grain(0.15);
    const c = await grain(0.25);
    expect([a.step, a2.step, b.step, c.step]).toEqual([0, 0, 1, 2]);
    expect([a2.x, a2.y]).toEqual([a.x, a.y]);
    expect([b.x, b.y]).not.toEqual([a.x, a.y]);
    expect(JSON.stringify(c)).not.toBe(JSON.stringify(b));
    for (const g of [a, b, c]) {
      expect(g.x).toBeGreaterThanOrEqual(0);
      expect(g.x).toBeLessThan(128);
    }
    await expect(page.locator('#vhs')).toHaveCSS('--vhs-gx', String(c.x));
  });

  test('avec l\'horloge réelle, le grain change de position (expect.poll)', async ({ page }) => {
    await open(page, '', SIZE, { live: true });
    await page.evaluate(() => window.__zs.setVhsClock(null));
    const first = (await state(page)).vhs.grain.step;
    await expect.poll(async () => (await state(page)).vhs.grain.step, { timeout: 30_000 }).toBeGreaterThan(first + 3);
  });

  test('la bande de suivi traverse l\'écran dans une simulation accélérée de l\'horloge d\'effet', async ({ page }) => {
    await open(page);
    const events = trackingEvents(vhsParams.seed, 0, 120, vhsParams);
    expect(events.length).toBeGreaterThan(5);
    const e = events[2];
    const at = async (t) => {
      await page.evaluate((x) => window.__zs.setVhsClock(x), t);
      return (await state(page)).vhs.track;
    };
    expect(await at(e.start - 1)).toMatchObject({ active: false, opacity: 0 });
    const start = await at(e.start + 0.02 * e.duration);
    const mid = await at(e.start + 0.5 * e.duration);
    const end = await at(e.start + 0.98 * e.duration);
    expect([start.active, mid.active, end.active]).toEqual([true, true, true]);
    expect(start.y).toBeLessThan(mid.y);
    expect(mid.y).toBeLessThan(end.y);
    expect(mid.opacity).toBeGreaterThan(0);
    expect(mid.opacity).toBeLessThanOrEqual(0.12);
    expect(await at(e.end + 0.5)).toMatchObject({ active: false });
    await at(e.start + 0.5 * e.duration);
    await expect(page.locator('.vhs-track')).toHaveCSS('--vhs-track-opacity', String(Math.round(mid.opacity * 1e4) / 1e4));
  });

  test('plafonds d\'opacité lus dans le DOM : balayage 0,14, grain 0,09, bords 0,10, vignette 0,35, suivi 0,12', async ({ page }) => {
    await open(page);
    await page.evaluate(() => window.__zs.setVhsClock(7.3));
    const v = await page.locator('#vhs').evaluate((el) => Object.fromEntries(['--vhs-scan', '--vhs-grain-opacity', '--vhs-edge', '--vhs-vignette', '--vhs-track-opacity'].map((n) => [n, Number(el.style.getPropertyValue(n))])));
    expect(v['--vhs-scan']).toBeLessThanOrEqual(0.14);
    expect(v['--vhs-grain-opacity']).toBeLessThanOrEqual(0.09);
    expect(v['--vhs-edge']).toBeLessThanOrEqual(0.1);
    expect(v['--vhs-vignette']).toBeLessThanOrEqual(0.35);
    expect(v['--vhs-track-opacity']).toBeLessThanOrEqual(0.12);
    expect(v['--vhs-scan']).toBeGreaterThan(0);
  });

  test('le grain vient d\'une adresse data: générée par le code ; aucune requête réseau, aucun stockage', async ({ page, baseURL }) => {
    const external = [];
    page.on('request', (r) => !r.url().startsWith(baseURL) && !r.url().startsWith('data:') && external.push(r.url()));
    await open(page);
    const url = await page.locator('#vhs').evaluate((el) => el.style.getPropertyValue('--vhs-grain-url'));
    expect(url).toMatch(/^url\("data:image\/png;base64,/);
    expect(url.length).toBeLessThan(110 * 1024); // 80 ko d'octets bruts au plus, en base64
    await page.getByRole('button', { name: 'Pause' }).click();
    await page.locator('#btn-vhs').click();
    await page.locator('#btn-vhs').click();
    expect(external).toEqual([]);
    expect(await page.evaluate(() => [localStorage.length, sessionStorage.length, document.cookie])).toEqual([0, 0, '']);
    expect(await page.context().cookies()).toEqual([]);
  });

  test('l\'effet continue pendant la pause (horloge d\'effet réelle), contrairement à l\'animation de vague', async ({ page }) => {
    await open(page, '', SIZE, { live: true });
    await page.evaluate(() => window.__zs.setVhsClock(null));
    await page.getByRole('button', { name: 'Pause' }).click();
    const t0 = (await state(page)).vhs.time;
    await expect.poll(async () => (await state(page)).vhs.time, { timeout: 30_000 }).toBeGreaterThan(t0 + 0.2);
  });
});

test.describe('panneau de pause avec l\'interrupteur, accessibilité, budget, console', () => {
  for (const size of [SIZE, { width: 1440, height: 900 }]) {
    test(`tient dans la fenêtre, sans débordement de la page, cibles de 44 px, axe sans violation (${size.width}×${size.height})`, async ({ page }) => {
      await open(page, size.width > 1000 ? '&dpr=1' : '', size);
      await step(page, 0.3); // animation visible et effet actif derrière le panneau
      await page.getByRole('button', { name: 'Pause' }).click();
      const panel = page.locator('#pause-panel .panel');
      await expect(panel).toBeVisible();
      const fit = await page.evaluate(() => {
        const p = document.querySelector('#pause-panel .panel').getBoundingClientRect();
        const el = document.querySelector('#pause-panel .panel');
        return { top: p.top, bottom: p.bottom, left: p.left, right: p.right, w: window.innerWidth, h: window.innerHeight, scrollable: el.scrollHeight > el.clientHeight + 1, pageScrollX: document.documentElement.scrollWidth > window.innerWidth, pageScrollY: document.documentElement.scrollHeight > window.innerHeight };
      });
      expect(fit.top).toBeGreaterThanOrEqual(0);
      expect(fit.bottom).toBeLessThanOrEqual(fit.h);
      expect(fit.left).toBeGreaterThanOrEqual(0);
      expect(fit.right).toBeLessThanOrEqual(fit.w);
      expect(fit.scrollable).toBe(false);
      expect(fit.pageScrollX).toBe(false);
      expect(fit.pageScrollY).toBe(false);
      const sizes = await page.evaluate(() => [...document.querySelectorAll('#pause-panel button:not([hidden]), #pause-panel input:not([hidden])')].map((el) => { const r = el.getBoundingClientRect(); return { id: el.id, h: r.height, w: r.width }; }));
      expect(sizes.length).toBeGreaterThanOrEqual(5);
      for (const s of sizes) expect(s.h, s.id).toBeGreaterThanOrEqual(43.5);
      expect(sizes.map((s) => s.id)).toContain('btn-vhs');
      expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    });
  }

  test('axe sans violation avec l\'animation de vague et l\'effet VHS actifs', async ({ page }) => {
    await open(page);
    await wave(page, 5);
    await step(page, 1);
    expect((await splash(page)).visible).toBe(true);
    expect((await state(page)).vhs.on).toBe(true);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  });

  test('budget de dessin identique au lot 2b avec l\'animation et l\'effet : 190 appels, 14 862 triangles (10 zombies)', async ({ page }, testInfo) => {
    await open(page, '&nospawn=1&shadows=1');
    const r = await page.evaluate(() => {
      const zs = window.__zs;
      const p = zs.getState().player;
      zs.setInput({ aim: { angle: Math.PI } });
      const T = ['marcheur', 'petit', 'voute', 'grand'];
      const G = ['lent', 'marche', 'rampe', 'course'];
      for (let i = 0; i < 10; i += 1) zs.spawnEnemy(p.x + 70 + (i % 5) * 45, p.y - 90 + Math.floor(i / 5) * 90 + (i % 2) * 15, { type: T[i % 4], gait: G[(i + Math.floor(i / 4)) % 4], wave: 10 });
      zs.step(0.05);
      zs.sampleScreen(0, 0, 8, 8);
      const s = zs.getState();
      return { render: s.render, vhs: s.vhs.on };
    });
    testInfo.annotations.push({ type: 'rendu', description: `10 zombies : ${r.render.calls} appels, ${r.render.triangles} triangles` });
    console.log(`BUDGET 10 zombies (lot 2c) : ${r.render.calls} appels de dessin, ${r.render.triangles} triangles`);
    expect(r.vhs).toBe(true);
    expect(r.render.calls).toBe(190);
    expect(r.render.triangles).toBe(14862);
  });

  test('console propre et aucune requête externe pendant une vague avec animation, mélodie, effet et interrupteur', async ({ page, baseURL }) => {
    const external = [];
    const problems = [];
    page.on('request', (r) => !r.url().startsWith(baseURL) && !r.url().startsWith('data:') && external.push(r.url()));
    page.on('console', (m) => ['error', 'warning'].includes(m.type()) && !BROWSER_NOISE.test(m.text()) && problems.push(m.text()));
    page.on('pageerror', (e) => problems.push(e.message));
    await open(page);
    await unlock(page);
    await step(page, 4);
    await page.evaluate(() => window.__zs.killAll());
    await step(page, 3);
    await page.getByRole('button', { name: 'Pause' }).click();
    await page.locator('#btn-vhs').click();
    await page.locator('#btn-vhs').click();
    await page.getByRole('button', { name: 'Reprendre' }).click();
    expect(external).toEqual([]);
    expect(problems).toEqual([]);
  });
});
