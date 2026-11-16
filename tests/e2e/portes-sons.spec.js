// Lot 8j-C : message « Porte ouverte à la manche X » (js/game/porte-message.js, js/core/porte-message.js) et sons des zombies (environ un coup
// sur quatre : js/core/sons-coups.js, appliqué par js/game/audio.js). ?test=1, positions de test (setPlayer), portes de zones.json ; journal et
// compte des sons de l'audio (getState().audio : coups vus, gardés, morts ; log des lectures). Aucune écriture dans le stockage.
import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { buildLayouts } from '../../js/core/layout.js';
import { parseZones, zonesToWorld } from '../../js/core/zones.js';
import { waitReady } from './helpers.js';

const json = (p) => JSON.parse(readFileSync(p, 'utf8'));
const D = 'data/game/maps/rez-de-chaussee/';
const world = json(`${D}world.json`);
const LAYOUTS = buildLayouts({ rdc: { world, decor: json(`${D}decor.json`) }, etage: { world: json(`${D}etage.world.json`) }, zones: zonesToWorld(parseZones(json(`${D}zones.json`)), world.transform) });
const bloc = (id) => LAYOUTS.doors.find((d) => d.id === id).blocks.rdc[0].rect;
const DISTANCE = json('data/game/reglages-partie.json').porte.distance;
const msg = (page) => page.locator('#porte-message');
const ecritures = async (page) => page.addInitScript(() => {
  window.__ecritures = [];
  for (const m of ['setItem', 'removeItem', 'clear']) {
    const natif = Storage.prototype[m];
    Storage.prototype[m] = function ecrire(...args) {
      window.__ecritures.push(m);
      return natif.apply(this, args);
    };
  }
});
// Laisse passer quelques images (la mise à jour du message suit le rendu).
const images = (page, n = 4) => page.evaluate((k) => new Promise((r) => {
  let i = 0;
  const f = () => (++i >= k ? r() : requestAnimationFrame(f));
  requestAnimationFrame(f);
}), n);

test.describe('message à l\'approche d\'une porte fermée (lot 8j)', () => {
  test('près de la porte 1 fermée : « Porte ouverte à la manche 11 » sous le centre, taille du HUD, aria-live poli ; masqué en s\'éloignant ; jamais après l\'ouverture ; aucune écriture', async ({ page }) => {
    await ecritures(page);
    await page.setViewportSize({ width: 932, height: 430 });
    await page.goto('/jeu.html?test=1&seed=1&nospawn=1');
    await waitReady(page);
    const r = bloc('porte-1');
    await expect(msg(page)).toHaveAttribute('data-visible', 'false');
    await expect(msg(page)).toHaveAttribute('aria-live', 'polite');
    await page.evaluate(([x, y]) => window.__zs.setPlayer(x, y), [r.x - (DISTANCE - 40), r.y + r.h / 2]);
    await expect(msg(page)).toHaveAttribute('data-visible', 'true');
    await expect(msg(page)).toHaveText('Porte ouverte à la manche 11');
    await expect(msg(page)).toHaveAttribute('data-porte', 'porte-1');
    await expect(msg(page)).toBeVisible();
    const vue = await msg(page).evaluate((n) => {
      const b = n.getBoundingClientRect();
      return { cx: b.left + b.width / 2, top: b.top, fs: getComputedStyle(n).fontSize, hud: getComputedStyle(document.getElementById('hud')).fontSize, transition: getComputedStyle(n).transitionDuration };
    });
    expect(Math.abs(vue.cx - 932 / 2)).toBeLessThan(2);
    expect(vue.top).toBeGreaterThan(430 / 2); // un peu sous le centre : le joueur et les zombies autour restent visibles
    expect(vue.fs).toBe(vue.hud);
    expect(vue.transition).toMatch(/0\.25s/);
    // S'éloigner : masqué (fondu), puis plus rien.
    await page.evaluate(([x, y]) => window.__zs.setPlayer(x, y), [r.x + r.w / 2, r.y - (DISTANCE + 400)]); // au nord : loin de toute porte
    await expect(msg(page)).toHaveAttribute('data-visible', 'false');
    await expect(msg(page)).toBeHidden();
    // Revenir : annoncé de nouveau (une fois par approche).
    await page.evaluate(([x, y]) => window.__zs.setPlayer(x, y), [r.x - 40, r.y + r.h / 2]);
    await expect(msg(page)).toHaveAttribute('data-visible', 'true');
    // Porte ouverte : plus jamais de message près d'elle.
    expect(await page.evaluate(() => window.__zs.setDoor('porte-1', true))).toBe(true);
    await expect(msg(page)).toHaveAttribute('data-visible', 'false');
    for (const dx of [60, 0, -30]) {
      await page.evaluate(([x, y]) => window.__zs.setPlayer(x, y), [r.x - dx, r.y + r.h / 2]);
      await images(page);
      await expect(msg(page)).toHaveAttribute('data-visible', 'false');
    }
    expect(await page.evaluate(() => window.__ecritures)).toEqual([]);
  });

  test('?wave=11 : porte 1 ouverte au chargement, aucun message près d\'elle ; porte 2 encore fermée : « manche 21 » ; mouvement réduit : sans fondu', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.setViewportSize({ width: 932, height: 430 });
    await page.goto('/jeu.html?test=1&seed=1&nospawn=1&wave=11');
    await waitReady(page);
    const r1 = bloc('porte-1');
    await page.evaluate(([x, y]) => window.__zs.setPlayer(x, y), [r1.x - 60, r1.y + r1.h / 2]);
    await images(page);
    await expect(msg(page)).toHaveAttribute('data-visible', 'false');
    const r2 = bloc('porte-2');
    await page.evaluate(([x, y]) => window.__zs.setPlayer(x, y), [r2.x + r2.w / 2, r2.y - 40]);
    await expect(msg(page)).toHaveText('Porte ouverte à la manche 21');
    await expect(msg(page)).toHaveAttribute('data-visible', 'true');
    // Aucune transition propre (règle de game-ui.css) ; la règle commune de base.css ramène toute durée à 0,01 ms au plus.
    const durees = (await msg(page).evaluate((n) => getComputedStyle(n).transitionDuration)).split(',').map((d) => Number.parseFloat(d));
    for (const d of durees) expect(d).toBeLessThanOrEqual(0.00001);
  });
});

test.describe('fin de manche : solde bleu et gain sous la vague (retour du propriétaire après le lot 8j)', () => {
  test('gemme bleue puis « solde (+gain) » sous le compteur de vague à la fin d\'une manche, pendant 4 s de jeu, puis masqué ; montants lus dans la banque', async ({ page }) => {
    await page.addInitScript(() => Object.defineProperty(Document.prototype, 'hidden', { get: () => true, configurable: true }));
    await page.setViewportSize({ width: 932, height: 430 });
    await page.goto('/jeu.html?test=1&seed=1&wave=3');
    await page.waitForFunction(() => window.__zs, null, { timeout: 120_000 });
    const bloc = page.locator('#hud-bleu-manche');
    await expect(bloc).toBeHidden();
    const avant = await page.evaluate(() => window.__zs.getState().save.bleu.solde);
    const etat = await page.evaluate(() => {
      const zs = window.__zs;
      zs.step(4); // la manche démarre (compte à rebours)
      zs.skipWave();
      for (let i = 0; i < 10 && document.getElementById('hud-bleu-manche').hidden; i += 1) zs.step(0.1);
      return zs.getState().save.bleu;
    });
    await expect(bloc).toBeVisible();
    const gain = etat.solde - avant;
    expect(gain).toBeGreaterThan(0);
    await expect(bloc).toHaveText(`${etat.solde.toLocaleString('fr-FR').replace(/\u202f|\u00a0/g, ' ')} (+${gain})`);
    expect(await bloc.evaluate((n) => n.firstElementChild.classList.contains('hud-medaille'))).toBe(true); // seulement le logo de la monnaie (retour du propriétaire) ; lot 9a : la médaille (avant : gemme)
    const boites = await page.evaluate(() => [document.getElementById('hud-wave'), document.getElementById('hud-bleu-manche')].map((n) => {
      const r = n.getBoundingClientRect();
      return { cx: r.left + r.width / 2, t: r.top, b: r.bottom, color: getComputedStyle(n).color };
    }));
    expect(boites[1].t).toBeGreaterThanOrEqual(boites[0].b - 0.5); // sous la vague
    expect(Math.abs(boites[1].cx - boites[0].cx)).toBeLessThan(2); // même colonne, centré
    expect(await bloc.getAttribute('aria-hidden')).toBe('true');
    await page.evaluate(() => window.__zs.step(4.2));
    await expect(bloc).toBeHidden();
  });
});

test.describe('sons des zombies (lot 8j)', () => {
  const audio = (page) => page.evaluate(() => window.__zs.getState().audio);
  const debloquer = async (page) => {
    await page.mouse.click(40, 200);
    await expect.poll(async () => (await audio(page)).unlocked, { timeout: 20_000 }).toBe(true);
  };

  test('coups reçus et portés ≈ un sur quatre (300 coups : 0,25 ± 4 σ), morts toutes transmises ; ?coups=1 (essai) : tous', async ({ page }) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width: 932, height: 430 });
    await page.goto('/jeu.html?test=1&empty=1&nospawn=1&seed=1');
    await waitReady(page);
    await debloquer(page);
    const p = (await page.evaluate(() => window.__zs.getState().player));
    await page.evaluate(([x, y]) => {
      const zs = window.__zs;
      for (let i = 0; i < 300; i += 1) {
        const type = ['zombieHit', 'zombieAttack', 'plankTorn'][i % 3];
        zs.audioEvent({ type, x: x + 30, y, killed: false, zombie: 'marcheur', windowId: `F${i % 5}` });
        if (i % 8 === 0) zs.audioEvent({ type: 'zombieHit', x: x + 30, y, killed: true, zombie: 'marcheur' });
      }
    }, [p.x, p.y]);
    const c = (await audio(page)).coups;
    expect(c.probabilite).toBe(0.25);
    expect(c.coups).toBe(300);
    expect(c.morts).toBe(38);
    const sigma = Math.sqrt((0.25 * 0.75) / 300);
    expect(Math.abs(c.gardes / 300 - 0.25)).toBeLessThan(4 * sigma);
    // Essai ?coups=1 : chaque coup passe (les tests de sons d'avant le lot s'en servent).
    await page.goto('/jeu.html?test=1&empty=1&nospawn=1&seed=1&coups=1');
    await waitReady(page);
    await debloquer(page);
    await page.evaluate(() => {
      for (let i = 0; i < 30; i += 1) window.__zs.audioEvent({ type: 'zombieAttack', x: 0, y: 0, zombie: 'marcheur' });
    });
    expect((await audio(page)).coups).toMatchObject({ coups: 30, gardes: 30, probabilite: 1 });
  });

  test('pendant une vague réelle (manche 5, tirs automatiques) : chaque zombie tué donne une mort transmise aux sons ; les coups non mortels sont tirés à part (moins de sons que de coups)', async ({ page }) => {
    test.setTimeout(180_000);
    await page.addInitScript(() => Object.defineProperty(Document.prototype, 'hidden', { get: () => true, configurable: true }));
    await page.setViewportSize({ width: 667, height: 375 });
    await page.goto('/jeu.html?test=1&seed=1&wave=5');
    await page.waitForFunction(() => window.__zs, null, { timeout: 120_000 });
    await debloquer(page);
    let s = await page.evaluate(() => window.__zs.getState());
    for (let i = 0; i < 40 && s.kills < 3; i += 1) {
      s = await page.evaluate(() => {
        window.__zs.step(2);
        return window.__zs.getState();
      });
    }
    expect(s.kills).toBeGreaterThan(0);
    const c = s.audio.coups;
    expect(c.morts).toBe(s.kills);
    expect(c.coups).toBeGreaterThan(c.gardes);
    expect(c.gardes).toBeGreaterThanOrEqual(0);
  });
});
