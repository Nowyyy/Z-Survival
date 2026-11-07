// Lot 3l : interface de l'atelier intégrée au jeu (HUD, pause, fins, à terre : direction B ; sticks : direction A). Mesures faites dans jeu.html avec les outils de
// l'atelier (js/atelier-interface/measure-dom.js dans la page, verdicts purs de js/core/ui-measure.js) aux 7 tailles de data/game/ui-atelier.json, dans tous les
// états atteignables par les hooks de ?test=1 (step() seulement, aucune durée réelle). Dans la suite rapide (playwright.config.js, liste ESSENTIAL).
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { readFileSync } from 'node:fs';
import { backgroundsFrom, compareBoxes, evaluate, tokensFromCss } from '../../js/core/ui-measure.js';
import { waitReady, hudBoxes, apart } from './helpers.js';

const cfg = JSON.parse(readFileSync('data/game/ui-atelier.json', 'utf8'));
const backgrounds = backgroundsFrom(tokensFromCss(readFileSync('css/tokens.css', 'utf8')), cfg.worstBackgrounds);
const BROWSER_NOISE = /GL Driver Message|ReadPixels|GPU stall/;
const SIZE = { width: 667, height: 375 };
const SIZES = cfg.sizes.map((s) => ({ id: s.id, width: s.width, height: s.height }));
const state = (page) => page.evaluate(() => window.__zs.getState());
const step = (page, s) => page.evaluate((v) => window.__zs.step(v), s);

test.skip(({ isMobile }) => isMobile, 'mesures de bureau aux tailles de l\'atelier');

async function open(page, extra = '', size = SIZE) {
  await page.setViewportSize(size);
  await page.goto(`/jeu.html?test=1&seed=1&vhs=0${extra}`);
  await waitReady(page);
  await page.evaluate(() => { window.requestAnimationFrame = () => 0; });
  await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 120)));
  await step(page, 0.05);
}

// Relevé de l'écran courant avec les éléments de l'atelier (actuel.js : noms des blocs de B) ; verdict pur (zone sûre sans encoche dans Chromium).
async function measure(page, screen, size, { overflow = false } = {}) {
  const raw = await page.evaluate(async ({ screen: sc, size: sz, overflow: of }) => {
    const a = await import('./js/atelier-interface/actuel.js');
    const m = await import('./js/atelier-interface/measure-dom.js');
    const modal = sc === 'pause' || sc.startsWith('fin');
    const items = a.actuelItems(sc).map((it) => ({ ...it, checkOverflow: of && it.role === 'hud' }));
    return m.collect(document, { root: document.body, viewport: { width: sz.width, height: sz.height }, safe: { top: 0, right: 0, bottom: 0, left: 0 }, modal, hudNames: a.ACTUEL_HUD_NAMES, items });
  }, { screen, size, overflow });
  return { raw, verdict: evaluate(raw, backgrounds, cfg.rules) };
}
const names = (m) => m.raw.elements.map((e) => e.name);
const outOf = (m) => m.verdict.outOfTarget.map((o) => `${o.rule} ${o.element} ${o.measure ?? ''} ${o.reason}`);

// Pire cas du HUD (texte le plus long de chaque bloc) : écrit directement dans les valeurs, que hud.js ne réécrit que si la donnée change.
const WORST = { 'hud-kills-text': '9999', 'hud-chrono-text': '9:59:59', 'hud-life': '220/220', 'hud-remaining-text': '10', 'hud-wave-text': '40 / 40' };
const writeWorst = (page) => page.evaluate((w) => { for (const [id, text] of Object.entries(w)) document.getElementById(id).textContent = text; }, WORST);

test.describe('les 7 tailles de l\'atelier : HUD, pire cas, à terre, protégé, pause, mort, monde terminé', () => {
  for (const size of SIZES) {
    test(`${size.id} : aucun hors cible (chevauchement, marges, pouces, texte ≥ 14 px, cibles ≥ 44 px, contraste ≥ 4,5:1, débordement)`, async ({ page }) => {
      test.setTimeout(120_000);
      await open(page, '&wave=21&floor=1', size); // étage et mode essai : le cas le plus chargé de la colonne de gauche
      await step(page, 3.3);
      const hud = await measure(page, 'hud', size);
      expect(names(hud)).toEqual(expect.arrayContaining(['chrono', 'vie', 'chutes', 'etage', 'essai', 'vague', 'argent', 'restants', 'tues', 'pause']));
      expect(outOf(hud)).toEqual([]);
      expect(hud.verdict.minTextPx).toBeGreaterThanOrEqual(14);
      expect(hud.verdict.minTargetPx).toBeGreaterThanOrEqual(44);
      expect(hud.verdict.minContrast).toBeGreaterThanOrEqual(4.5);
      // Pire cas : 9 999 999, 5 chutes, « 40 / 40 », renforcée, 9 999 tués, chrono de plus d'une heure : rien ne déborde de sa boîte.
      // Le « +N » de 9 999 999 (hook de test) est attendu effacé : un gain réel tient dans la largeur de Pause (test « +N » plus bas, et « +635 » de la fin de monde).
      await page.evaluate(() => { const zs = window.__zs; zs.giveMoney(9_999_999); zs.setChutes(5); zs.step(2.1); });
      await writeWorst(page);
      await page.evaluate(() => { document.getElementById('hud-reinforced').textContent = 'Renforcée'; });
      const worst = await measure(page, 'hud', size, { overflow: true });
      expect(outOf(worst)).toEqual([]);
      // À terre (compte à rebours sous l'argent), puis protégé : au-dessus de la mi-hauteur, sans chevauchement.
      await page.evaluate(() => { const zs = window.__zs; zs.setChutes(1); zs.downPlayer(); zs.step(1.2); });
      const down = await measure(page, 'a-terre', size, { overflow: true });
      expect(names(down)).toContain('a-terre');
      expect(outOf(down)).toEqual([]);
      const box = down.raw.elements.find((e) => e.name === 'a-terre').box;
      expect(box.top + box.height).toBeLessThan(size.height / 2);
      await step(page, 4.2);
      const grace = await measure(page, 'a-terre', size);
      expect(outOf(grace)).toEqual([]);
      // Pause (modale) : cibles, textes, contrastes ; le panneau tient dans l'écran sans défiler.
      await page.locator('#btn-pause').click();
      const pause = await measure(page, 'pause', size);
      expect(outOf(pause)).toEqual([]);
      expect(await page.evaluate(() => { const p = document.querySelector('#pause-panel .panel'); return p.scrollHeight <= p.clientHeight + 1; })).toBe(true);
      await page.locator('#btn-resume').click();
      // Mort, puis monde terminé (après « Rejouer ») : lignes, deux boutons de 44 px, rien hors de l'écran.
      await page.evaluate(() => { const zs = window.__zs; zs.setChutes(0); zs.downPlayer(); zs.step(0.3); });
      await expect(page.locator('#end-panel')).toBeVisible();
      const death = await measure(page, 'fin-mort', size);
      expect(outOf(death)).toEqual([]);
      expect(death.raw.elements.filter((e) => e.name.startsWith('bouton'))).toHaveLength(2);
      await page.locator('#btn-replay').click();
      await page.evaluate(() => { const zs = window.__zs; zs.startWave(40); zs.step(3.2); zs.skipWave(); zs.step(0.3); });
      await expect(page.locator('#end-title')).toHaveText('Monde terminé');
      const world = await measure(page, 'fin-monde', size);
      expect(outOf(world)).toEqual([]);
      expect(await page.evaluate(() => { const p = document.querySelector('#end-panel .panel'); return p.scrollHeight <= p.clientHeight + 1; })).toBe(true);
    });
  }
});

test.describe('stabilité : aucune boîte ne bouge quand les valeurs parcourent leur plage (0 px)', () => {
  for (const size of [SIZE, { width: 844, height: 390 }, { width: 1440, height: 900 }]) {
    test(`vie, argent, vague, chutes, restants, tués, chrono, étage et « renforcée » (${size.width}×${size.height})`, async ({ page }) => {
      await open(page, '&wave=21&floor=1', size);
      await step(page, 3.3);
      const first = await hudBoxes(page);
      const keys = Object.keys(first);
      const same = async (label) => {
        const now = Object.fromEntries(Object.entries(await hudBoxes(page)).filter(([k]) => keys.includes(k)));
        expect(compareBoxes(Object.fromEntries(Object.entries(first).map(([k, b]) => [k, { left: b.l, top: b.t, width: b.w, height: b.h }])), Object.fromEntries(Object.entries(now).map(([k, b]) => [k, { left: b.l, top: b.t, width: b.w, height: b.h }]))), label).toEqual({ max: 0, moved: [] });
      };
      for (const money of [7, 93, 900, 8_100, 90_000, 900_000, 9_000_000]) {
        await page.evaluate((m) => { window.__zs.giveMoney(m); window.__zs.step(2.1); }, money); // le « +N » est retombé
        await same(`argent +${money}`);
      }
      for (const n of [0, 1, 5]) {
        await page.evaluate((c) => { window.__zs.setChutes(c); window.__zs.step(0.05); }, n);
        await same(`chutes ${n}`);
      }
      for (const lvl of [0, 10]) {
        await page.evaluate((v) => { window.__zs.setLevels({ vie: v }); window.__zs.step(0.05); }, lvl);
        await same(`vie niveau ${lvl}`);
      }
      for (const [id, values] of Object.entries({ 'hud-life': ['1/100', '64/100', '220/220'], 'hud-kills-text': ['0', '57', '999', '9999'], 'hud-chrono-text': ['00:00', '59:59', '1:00:00', '9:59:59'], 'hud-remaining-text': ['00', '05', '10'], 'hud-wave-text': ['01 / 40', '40 / 40'], 'hud-floor-text': ['RDC', 'Étage'], 'hud-reinforced': ['', 'Renforcée'] })) {
        for (const v of values) {
          await page.evaluate(([i, t]) => { document.getElementById(i).textContent = t; }, [id, v]);
          await same(`${id} = ${v}`);
        }
      }
    });
  }

  test('le chrono suit le temps de jeu (step), pas l\'horloge réelle ; figé en pause ; remis à zéro par « Rejouer »', async ({ page }) => {
    await open(page, '&nospawn=1'); // visite libre : aucun zombie ne tue le joueur pendant la minute simulée
    await expect(page.locator('#hud-chrono-text')).toHaveText('00:00');
    await step(page, 65.2);
    await expect(page.locator('#hud-chrono-text')).toHaveText('01:05');
    await page.evaluate(() => new Promise((r) => setTimeout(r, 1200)));
    await expect(page.locator('#hud-chrono-text')).toHaveText('01:05');
    await page.locator('#btn-pause').click();
    const t = (await state(page)).time;
    await page.evaluate(() => new Promise((r) => setTimeout(r, 300)));
    expect((await state(page)).time).toBe(t);
    await page.locator('#btn-restart').click();
    await step(page, 0.05);
    await expect(page.locator('#hud-chrono-text')).toHaveText('00:00');
  });
});

test.describe('animations et mouvement réduit', () => {
  // Lot 4e (regroupement) : trois tests ouvraient la même page (adresse et fenêtre par défaut) : un seul chargement, une étape par ancien test,
  // mêmes assertions ; ordre : lecture des animations, puis manche et killAll, puis joueur à terre.
  test('page par défaut : un seul clignotement (REC), mots entiers du HUD, aucun filter ni mélange sur l\'interface', async ({ page }) => {
    await open(page);
    await test.step('un seul clignotement : le point REC, 1 par seconde (au plus 2), en steps (aucune transition)', async () => {
      const anims = await page.evaluate(async () => {
        const m = await import('./js/atelier-interface/measure-dom.js');
        return m.animationsUnder(document.getElementById('hud'));
      });
      expect(anims).toHaveLength(1);
      expect(anims[0]).toMatchObject({ name: 'hud-rec', running: true });
      expect(anims[0].perSecond).toBeLessThanOrEqual(2);
      expect(anims[0].perSecond).toBe(1);
      await expect(page.locator('#hud-rec')).toHaveCSS('animation-timing-function', 'steps(1)');
    });
    await test.step('mots entiers (VAGUE, RESTANTS, TUÉS, VIE, REC) ; tués sans zéros devant ; vague et restants sur deux chiffres', async () => {
      await step(page, 3.3);
      const words = await page.evaluate(() => [...document.querySelectorAll('#hud .hud-label')].filter((e) => e.getClientRects().length).map((e) => e.innerText));
      expect(words).toEqual(['REC', 'VIE', 'VAGUE', 'RESTANTS', 'TUÉS']);
      await page.evaluate(() => { window.__zs.killAll(); window.__zs.step(0.1); });
      const kills = (await state(page)).kills;
      await expect(page.locator('#hud-kills-text')).toHaveText(String(kills));
      await expect(page.locator('#hud-wave-text')).toHaveText(/^\d{2} \/ 40$/);
    });
    await test.step('aucun filter, mix-blend-mode ni backdrop-filter sur l\'interface (HUD, Pause, à terre, panneaux, sticks)', async () => {
      await page.evaluate(() => { const zs = window.__zs; zs.downPlayer(); zs.step(0.2); });
      const bad = await page.evaluate(() => [...document.querySelectorAll('#hud, #hud *, #btn-pause, #down, #down *, #pause-panel, #pause-panel *, #end-panel, #end-panel *, .stick, .stick *')]
        .filter((el) => { const c = getComputedStyle(el); return c.filter !== 'none' || c.mixBlendMode !== 'normal' || (c.backdropFilter && c.backdropFilter !== 'none'); }).map((el) => el.id || el.className));
      expect(bad).toEqual([]);
    });
  });

  test('sous prefers-reduced-motion : aucune animation dans le HUD, l\'état à terre, la pause et les sticks ; le point REC est fixe', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await open(page);
    await page.evaluate(() => { const zs = window.__zs; zs.step(3.3); zs.downPlayer(); zs.step(0.5); });
    // L'annonce de vague (E2-8, hors du lot, inchangée) n'est pas comptée : seulement l'interface intégrée.
    const running = await page.evaluate(() => document.getAnimations().filter((a) => a.playState === 'running' && a.effect?.target?.closest?.('#hud, #btn-pause, #down, #pause-panel, #end-panel, .stick')).map((a) => a.effect.target.id || a.effect.target.className));
    expect(running).toEqual([]);
    await expect(page.locator('#hud-rec')).toHaveCSS('animation-name', 'none');
    await expect(page.locator('#hud-rec')).toHaveCSS('opacity', '1');
  });

});

test.describe('états du jeu', () => {
  test('?map=salle : ni puce d\'étage ni « / 40 » (pas de fin de monde) ; vague sur deux chiffres', async ({ page }) => {
    await open(page, '&map=salle');
    await step(page, 3.3);
    await expect(page.locator('#hud-floor')).toBeHidden();
    await expect(page.locator('#hud-wave-text')).toHaveText('01');
    await expect(page.locator('#hud-wave')).not.toContainText('/');
  });

  test('visite libre (?nospawn=1) : aucun élément de manche (vague invisible, ni restants ni compte à rebours), aucune boîte déplacée', async ({ page }) => {
    await open(page, '&nospawn=1');
    const before = await hudBoxes(page);
    await step(page, 10);
    await expect(page.locator('#hud-wave')).toBeHidden();
    await expect(page.locator('#hud-remaining')).toBeHidden();
    await expect(page.locator('#hud-next')).toBeHidden();
    await expect(page.locator('#hud-money')).toBeVisible();
    await expect(page.locator('#hud-trial')).toBeVisible();
    expect(await hudBoxes(page)).toEqual(before);
  });

  test('attente puis manche : « DÉBUT 3 s » puis « RESTANTS 05 » dans la même boîte, sans déplacement', async ({ page }) => {
    await open(page, '&map=salle');
    await expect(page.locator('#hud-next')).toHaveText('Début 3 s');
    const slot = await page.locator('#hud-next').boundingBox();
    await step(page, 3.3);
    await expect(page.locator('#hud-next')).toBeHidden();
    await expect(page.locator('#hud-remaining-text')).toHaveText(/^\d{2}$/);
    expect(await page.locator('#hud-remaining').boundingBox()).toEqual(slot);
  });

  test('?wave=150 (au-delà du monde) : « VAGUE 150 » sans « / 40 », dans sa boîte', async ({ page }) => {
    await open(page, '&wave=150');
    await expect(page.locator('#hud-wave-text')).toHaveText('150');
    expect(await page.locator('#hud-wave').evaluate((e) => e.scrollWidth <= e.clientWidth)).toBe(true);
  });

  test('vague renforcée (5) : « RENFORCÉE » sous « VAGUE 05 / 40 », même boîte', async ({ page }) => {
    await open(page);
    const box = await page.locator('#hud-wave').boundingBox();
    await page.evaluate(() => { window.__zs.startWave(5); window.__zs.step(3.3); });
    await expect(page.locator('#hud-wave-text')).toHaveText('05 / 40');
    await expect(page.locator('#hud-reinforced')).toHaveText('Renforcée');
    await expect(page.locator('#hud-reinforced')).toHaveCSS('text-transform', 'uppercase');
    expect(await page.locator('#hud-wave').boundingBox()).toEqual(box);
  });

  test('mode essai : « MODE ESSAI » à gauche sous chutes et étage ; absent hors mode essai', async ({ page }) => {
    await open(page);
    await expect(page.locator('#hud-trial')).toBeHidden();
    await open(page, '&wave=21&floor=1');
    await expect(page.locator('#hud-trial')).toBeVisible();
    const [chutes, trial] = await Promise.all(['#hud-chutes', '#hud-trial'].map((s) => page.locator(s).boundingBox()));
    expect(trial.y).toBeGreaterThan(chutes.y + chutes.height);
    expect(trial.x).toBeCloseTo(chutes.x, 0);
  });

  test('?labels=1 et ?zoom=1 : le HUD garde les mêmes boîtes', async ({ page }) => {
    await open(page, '&nospawn=1');
    const ref = await hudBoxes(page);
    for (const extra of ['&nospawn=1&labels=1', '&nospawn=1&zoom=1']) {
      await open(page, extra);
      expect(await hudBoxes(page), extra).toEqual(ref);
    }
  });

  // Retour du propriétaire : l'argent est à droite sous les tués et le « +N » sous le bouton Pause (avant : à gauche de l'argent, au centre).
  test('« +N » : sous le bouton Pause, sur la ligne de l\'argent, sans chevaucher l\'argent ni Pause, décoratif', async ({ page }) => {
    await open(page, '&map=salle');
    await page.evaluate(() => { window.__zs.giveMoney(635); window.__zs.step(0.1); }); // le plus gros gain réel observé : fin de monde (500 + manche)
    await expect(page.locator('#hud-gain')).toHaveText('+635');
    const b = await hudBoxes(page);
    expect(b['#hud-gain'].t).toBeGreaterThanOrEqual(b['#btn-pause'].b - 0.5);
    expect(Math.abs(b['#hud-gain'].l - b['#btn-pause'].l)).toBeLessThan(0.5);
    expect(Math.abs(b['#hud-gain'].t - b['#hud-money'].t)).toBeLessThan(0.5);
    for (const sel of ['#hud-money', '#btn-pause', '#hud-kills']) expect(apart(b['#hud-gain'], b[sel]), sel).toBe(true);
    expect(b['#hud-gain'].r).toBeLessThanOrEqual(SIZE.width - 16 + 0.5); // dans la marge de 16 px
    await expect(page.locator('#hud-gain')).toHaveAttribute('aria-hidden', 'true');
  });

  test('sticks (direction A) : base de 112 px à anneau fin, pastille ronde de 44 px ; au repos à 50 % ; hors du HUD', async ({ page }) => {
    await open(page);
    await page.evaluate(() => {
      const root = document.getElementById('game-root');
      const tap = (type, id, x, y) => root.dispatchEvent(new PointerEvent(type, { pointerType: 'touch', pointerId: id, clientX: x, clientY: y, bubbles: true, isPrimary: id === 11 }));
      tap('pointerdown', 12, innerWidth * 0.8, innerHeight * 0.7);
      tap('pointerup', 12, innerWidth * 0.8, innerHeight * 0.7);
      tap('pointerdown', 11, innerWidth * 0.18, innerHeight * 0.7);
      tap('pointermove', 11, innerWidth * 0.18 + 30, innerHeight * 0.7 - 20);
      window.__zs.step(0.05);
    });
    const r = await page.evaluate(() => {
      const css = (sel) => getComputedStyle(document.querySelector(sel));
      const box = (sel) => document.querySelector(sel).getBoundingClientRect();
      return { base: [box('#stick-left .stick-base').width, css('#stick-left .stick-base').borderTopWidth], knob: [box('#stick-left .stick-knob').width, css('#stick-left .stick-knob').borderRadius], idle: css('#stick-right').opacity, active: css('#stick-left').opacity, top: box('#stick-left .stick-base').top, hud: box('.hud-tl').bottom };
    });
    expect(r.base).toEqual([112, '2px']);
    expect(r.knob).toEqual([44, '50%']);
    expect(r.idle).toBe('0.5');
    expect(r.active).toBe('1');
    expect(r.top).toBeGreaterThan(r.hud);
  });

  test('« Revenir au menu principal » : bouton de 44 px sans action (aucune navigation, l\'écran de fin reste) ; plus de lien vers la sauvegarde', async ({ page }) => {
    await open(page);
    await page.evaluate(() => { const zs = window.__zs; zs.setChutes(0); zs.downPlayer(); zs.step(0.3); });
    await expect(page.locator('#end-panel')).toBeVisible();
    await expect(page.locator('#end-panel a')).toHaveCount(0);
    const url = page.url();
    await page.locator('#btn-menu').click();
    expect(page.url()).toBe(url);
    await expect(page.locator('#end-panel')).toBeVisible();
    expect((await page.locator('#btn-menu').boundingBox()).height).toBeGreaterThanOrEqual(44);
    await expect(page.locator('#end-title')).toHaveText('Tu es mort');
    await expect(page.locator('#end-box .end-icon-death')).toBeVisible();
    await expect(page.locator('#end-box .end-icon-world')).toBeHidden();
  });

  // Retours du propriétaire : solde à côté de « PAUSE » ; Reprendre, Recommencer, Quitter (désactivé) à gauche ; Son, Options (lot 5j, avant : Effet VHS ; sous Son), Plein écran
  // à droite ; ni prochaine zone, ni état de la sauvegarde, ni volume ; depuis le lot 5j, plus de ligne « Graphismes » (#gfx-row) : elle est dans l'écran Options.
  test('pause : solde à côté de « PAUSE » ; Reprendre, Recommencer, Quitter (désactivé) | Son, Options, Plein écran ; focus sur Reprendre ; rien d\'autre', async ({ page }) => {
    await open(page);
    await page.locator('#btn-pause').click();
    await expect(page.locator('#btn-resume')).toBeFocused();
    const r = await page.evaluate(() => {
      const b = (id) => { const e = document.getElementById(id); if (!e || !e.getClientRects().length) return null; const q = e.getBoundingClientRect(); return { l: q.left, t: q.top, r: q.right, b: q.bottom }; };
      return { title: b('pause-title'), balance: b('pause-balance'), resume: b('btn-resume'), restart: b('btn-restart'), quit: b('btn-quit'), sound: b('btn-sound'), vhs: b('btn-options'), inputs: document.querySelectorAll('#pause-panel input').length, lines: document.querySelectorAll('#pause-panel p').length };
    });
    expect(r.balance.l).toBeGreaterThan(r.title.r);
    expect(r.balance.t).toBeLessThan(r.title.b);
    for (const [a, b] of [['resume', 'restart'], ['restart', 'quit']]) {
      expect(Math.abs(r[a].l - r[b].l)).toBeLessThan(0.5);
      expect(r[b].t).toBeGreaterThan(r[a].b);
    }
    expect(Math.abs(r.sound.l - r.vhs.l)).toBeLessThan(0.5);
    expect(r.vhs.t).toBeGreaterThan(r.sound.b);
    expect(Math.abs(r.vhs.t - r.restart.t)).toBeLessThan(0.5);
    expect(r.sound.l).toBeGreaterThan(r.resume.r);
    expect([r.inputs, r.lines]).toEqual([0, 1]); // lignes : le solde seul (lot 5b à 5i : aussi la tête de la ligne « Graphismes », retirée au lot 5j)
    expect(await page.locator('#pause-panel p').nth(0).getAttribute('id')).toBe('pause-balance');
    await expect(page.locator('#btn-options')).toHaveText('Options');
    await expect(page.locator('#btn-quit')).toBeDisabled();
    await expect(page.locator('#btn-quit')).toHaveText('Quitter');
    await page.keyboard.press('Tab');
    await expect(page.locator('#btn-sound')).toBeFocused();
  });

  test('?wave=40&fin=monde : écran de victoire « Monde terminé » tout de suite (bonus de fin de monde, mode essai), aucune écriture ; ignoré hors mode essai', async ({ page }) => {
    await page.setViewportSize(SIZE);
    await page.goto('/jeu.html?wave=40&fin=monde&vhs=0');
    await expect(page.locator('#end-panel')).toBeVisible({ timeout: 60_000 });
    await expect(page.locator('#end-title')).toHaveText('Monde terminé');
    await expect(page.locator('#end-bonus')).toBeVisible();
    await expect(page.locator('#end-save')).toHaveText('Mode essai : cet argent n\'est pas enregistré');
    expect(await page.evaluate(() => localStorage.length)).toBe(0);
    await page.goto('/jeu.html?test=1&fin=monde&vhs=0'); // ?test=1 seul : sauvegarde en mémoire, pas en lecture seule
    await waitReady(page);
    await expect(page.locator('#end-panel')).toBeHidden();
  });

  test('fin : vague, « Nouveau record », meilleure manche à gauche ; tués, argent gagné, solde à droite ; plus de note « provisoire »', async ({ page }) => {
    await page.setViewportSize(SIZE);
    await page.goto('/jeu.html?test=1&store=local&seed=1&vhs=0');
    await waitReady(page);
    await page.evaluate(() => { window.requestAnimationFrame = () => 0; const zs = window.__zs; zs.step(3.3); zs.skipWave(); zs.step(0.3); zs.setChutes(0); zs.downPlayer(); zs.step(0.3); });
    await expect(page.locator('#end-record')).toBeVisible();
    const col = (ids) => page.evaluate((list) => list.map((id) => { const q = document.getElementById(id).getBoundingClientRect(); return [q.left, q.top]; }), ids);
    const left = await col(['end-wave', 'end-record', 'end-best']);
    const right = await col(['end-kills', 'end-earned', 'end-balance']);
    for (const c of [left, right]) for (let i = 1; i < c.length; i += 1) { expect(Math.abs(c[i][0] - c[0][0])).toBeLessThan(0.5); expect(c[i][1]).toBeGreaterThan(c[i - 1][1]); }
    expect(right[0][0]).toBeGreaterThan(left[0][0] + 100);
    expect(Math.abs(left[1][1] - right[1][1])).toBeLessThan(0.5); // record sur la ligne d'« Argent gagné »
    await expect(page.locator('#end-panel')).not.toContainText('provisoire');
  });
});

test.describe('annonces, réseau, stockage, accessibilité, CLS', () => {
  test('#hud-live annonce la fin de manche, le record et « Nouvelle zone » ; jamais le chrono ni les restants', async ({ page }) => {
    await open(page, '&wave=10');
    // Le texte est relevé après chaque pas (un MutationObserver ne verrait que le dernier texte d'une boucle synchrone).
    const log = await page.evaluate(() => {
      const zs = window.__zs;
      const live = document.getElementById('hud-live');
      const seen = [];
      const watch = () => { if (live.textContent && seen.at(-1) !== live.textContent) seen.push(live.textContent); };
      zs.step(3.3);
      watch();
      zs.skipWave();
      for (let i = 0; i < 80; i += 1) { zs.step(0.1); watch(); }
      zs.setChutes(0);
      zs.downPlayer();
      zs.step(0.3);
      watch();
      return seen;
    });
    expect(log.some((t) => t.startsWith('Manche 10 terminée'))).toBe(true);
    expect(log.some((t) => t.startsWith('Nouvelle zone'))).toBe(true);
    expect(log.some((t) => /Tu es mort/.test(t))).toBe(true);
    expect(log.filter((t) => /\d\d:\d\d|Restants|Rec\b/i.test(t))).toEqual([]);
  });

  test('« Nouveau record » annoncé par #hud-live et affiché sur l\'écran de fin (étoile, jaune)', async ({ page }) => {
    await page.setViewportSize(SIZE);
    await page.goto('/jeu.html?test=1&store=local&seed=1&vhs=0');
    await waitReady(page);
    await page.evaluate(() => { window.requestAnimationFrame = () => 0; });
    await page.evaluate(() => {
      window.__live = [];
      new MutationObserver(() => window.__live.push(document.getElementById('hud-live').textContent)).observe(document.getElementById('hud-live'), { childList: true, characterData: true, subtree: true });
      const zs = window.__zs;
      zs.step(3.3);
      zs.skipWave();
      zs.step(0.3);
      zs.setChutes(0);
      zs.downPlayer();
      zs.step(0.3);
    });
    expect((await page.evaluate(() => window.__live)).some((t) => t.includes('Nouveau record : manche 1'))).toBe(true);
    await expect(page.locator('#end-record')).toHaveText('Nouveau record');
    await expect(page.locator('#end-record svg')).toHaveAttribute('aria-hidden', 'true');
    await expect(page.locator('#end-record')).toHaveCSS('color', 'rgb(255, 214, 10)');
  });

  test('aucune requête externe, aucun stockage nouveau (?test=1 : rien dans localStorage), console propre (HUD, à terre, pause, fin)', async ({ page, baseURL }) => {
    const external = [];
    const problems = [];
    page.on('request', (r) => !r.url().startsWith(baseURL) && !r.url().startsWith('data:') && external.push(r.url()));
    page.on('console', (m) => ['error', 'warning'].includes(m.type()) && !BROWSER_NOISE.test(m.text()) && problems.push(m.text()));
    page.on('pageerror', (e) => problems.push(e.message));
    await open(page);
    await page.evaluate(() => { const zs = window.__zs; zs.giveMoney(50); zs.step(3.3); zs.downPlayer(); zs.step(6); });
    await page.locator('#btn-pause').click();
    await page.locator('#btn-resume').click();
    await page.evaluate(() => { const zs = window.__zs; zs.setChutes(0); zs.downPlayer(); zs.step(0.3); });
    await page.locator('#btn-menu').click();
    expect(external).toEqual([]);
    expect(problems).toEqual([]);
    expect(await page.evaluate(() => [localStorage.length, sessionStorage.length, document.cookie])).toEqual([0, 0, '']);
  });

  for (const size of [SIZE, { width: 1440, height: 900 }]) {
    test(`axe : aucune violation (HUD, à terre, pause, fin) à ${size.width}×${size.height}`, async ({ page }) => {
      await open(page, '&wave=21&floor=1', size);
      const check = async (label) => {
        const r = await new AxeBuilder({ page }).analyze();
        expect(r.violations.map((v) => `${label} ${v.id}: ${v.nodes.map((n) => n.target).join(' ')}`)).toEqual([]);
      };
      await page.evaluate(() => { const zs = window.__zs; zs.step(3.3); zs.downPlayer(); zs.step(0.5); });
      await check('à terre');
      await page.locator('#btn-pause').click();
      await check('pause');
      await page.locator('#btn-resume').click();
      await page.evaluate(() => { const zs = window.__zs; zs.setChutes(0); zs.step(5); zs.downPlayer(); zs.step(0.3); });
      await expect(page.locator('#end-panel')).toBeVisible();
      await check('fin');
    });
  }

  for (const [width, height] of [[360, 640], [768, 1024], [1440, 900]]) {
    test(`CLS avec les données retardées de 400 ms (${width} px) : au plus 0,1`, async ({ browser, baseURL }, testInfo) => {
      const context = await browser.newContext({ viewport: { width, height } });
      const page = await context.newPage();
      await page.route('**/data/**', async (route) => {
        await new Promise((r) => setTimeout(r, 400));
        await route.continue();
      });
      await page.addInitScript(() => {
        window.__cls = 0;
        new PerformanceObserver((list) => { for (const e of list.getEntries()) if (!e.hadRecentInput) window.__cls += e.value; }).observe({ type: 'layout-shift', buffered: true });
      });
      await page.goto(`${baseURL}/jeu.html?test=1&seed=1`);
      await page.waitForFunction(() => (window.__zs?.getState()?.time ?? 0) > 0.3, null, { timeout: 90_000 });
      const cls = await page.evaluate(() => window.__cls);
      testInfo.annotations.push({ type: 'cls', description: `${width} px : ${cls.toFixed(4)}` });
      expect(cls).toBeLessThanOrEqual(0.1);
      await context.close();
    });
  }

  test('getState() garde ses champs (time, hud, save, waves, player…) ; time = temps de jeu exposé au chrono', async ({ page }) => {
    await open(page, '&nospawn=1');
    const s = await state(page);
    for (const k of ['time', 'hud', 'save', 'waves', 'player', 'kills', 'paused']) expect(s, k).toHaveProperty(k);
    expect(s.hud).toEqual(expect.objectContaining({ height: expect.any(Number), width: expect.any(Number), chips: expect.any(Array), arrows: [] }));
    await step(page, 61);
    await expect(page.locator('#hud-chrono-text')).toHaveText('01:01');
  });

  // Retour du propriétaire sur iPhone : l'interface reste à 16 px des bords quelle que soit la zone de sécurité donnée par Safari (avant : 16 px + zone).
  test('zones de sécurité simulées (îlot 47 px) : le HUD et Pause restent à 16 px des bords gauche et droit, le haut à 16 px + zone', async ({ page }) => {
    await open(page, '', { width: 844, height: 390 });
    const r = await page.evaluate(async () => {
      const a = await import('./js/atelier-interface/actuel.js');
      a.injectSafeArea(document, { top: 0, right: 47, bottom: 21, left: 47 });
      await new Promise((res) => setTimeout(res, 50));
      const b = (sel) => document.querySelector(sel).getBoundingClientRect();
      return { hud: b('#hud').left, chrono: b('#hud-chrono').left, pause: innerWidth - b('#btn-pause').right, top: b('#hud').top };
    });
    expect(r.hud).toBeCloseTo(16, 1);
    expect(r.top).toBeCloseTo(16, 1);
    expect(r.pause).toBeCloseTo(16 + 15.75 * 0.35, 1);
  });
});

// Lot 3l-C : retours du propriétaire mesurés dans le jeu, priorité 2 absente (aucune proposition retenue), compatibilité avec les refontes de lot-4b, atelier.
test.describe('retours du propriétaire, mesurés (lot 3l-C)', () => {
  for (const size of [SIZE, { width: 844, height: 390 }, { width: 1440, height: 900 }]) {
    test(`REC, VIE et chutes + étage finissent au même bord droit ; restants et tués dans la hauteur de Pause ; argent sous les tués (${size.width}×${size.height})`, async ({ page }) => {
      await open(page, '&wave=21&floor=1', size);
      await step(page, 3.3);
      const b = await hudBoxes(page);
      expect(Math.abs(b['#hud-chrono'].r - b['#hud-bar'].r)).toBeLessThan(0.5);
      expect(Math.abs(b['#hud-chrono'].r - b['#hud-floor'].r)).toBeLessThan(0.5);
      expect(Math.abs(b['#hud-chutes'].t - b['#hud-floor'].t)).toBeLessThan(0.5);
      expect(b['#hud-remaining'].t).toBeGreaterThanOrEqual(b['#btn-pause'].t - 0.5);
      expect(b['#hud-kills'].b).toBeLessThanOrEqual(b['#btn-pause'].b + 0.5);
      expect(b['#hud-remaining'].b).toBeLessThanOrEqual(b['#hud-kills'].t);
      expect(b['#hud-money'].t).toBeGreaterThanOrEqual(b['#hud-kills'].b);
      expect(Math.abs(b['#hud-money'].r - b['#hud-kills'].r)).toBeLessThan(0.5); // retour du propriétaire : argent à droite sous les tués
      expect(b['#hud-trial'].t).toBeGreaterThan(b['#hud-chutes'].b);
    });
  }

  test('à terre : texte juste sous la vague (4 px), barre rouge qui se vide avec les secondes ; protégé : bouclier et barre sur 2 s', async ({ page }) => {
    await open(page);
    await page.evaluate(() => { const zs = window.__zs; zs.step(3.3); zs.downPlayer(); zs.step(0.1); });
    const b = await hudBoxes(page);
    expect(b['#down-body'].t - b['#hud-wave'].b).toBeCloseTo(4, 0); // l'argent est parti à droite (retour du propriétaire)
    const fill = () => page.locator('#down-fill').evaluate((el) => new DOMMatrix(getComputedStyle(el).transform).a);
    expect(await fill()).toBeCloseTo(1, 3);
    await step(page, 2);
    expect(await fill()).toBeCloseTo(3 / 5, 3);
    await step(page, 3.2);
    await expect(page.locator('#down-title')).toHaveText('Protégé 2 s');
    expect(await fill()).toBeCloseTo(1, 3);
    await expect(page.locator('#down-fill')).toHaveCSS('background-color', 'rgb(216, 20, 20)');
  });
});

test.describe('priorité 2 non retenue : rien ne s\'affiche en plus (lot 3l-C)', () => {
  test('coups reçus, vie faible, début de partie : le HUD ne change que par ses valeurs (aucun élément, classe ni animation de plus)', async ({ page }) => {
    await open(page, '&map=salle');
    // Interface intégrée seulement (l'annonce de vague E2-8, hors du lot, apparaît et s'efface d'elle-même).
    const UI = '#hud, #btn-pause, #down, #pause-panel, #end-panel, .stick';
    const snapshot = () => page.evaluate((sel) => {
      const nodes = [...document.querySelectorAll(sel)].flatMap((root) => [root, ...root.querySelectorAll('*')]);
      return { count: nodes.length, classes: nodes.map((e) => e.getAttribute('class') ?? '').join('|'), anims: document.getAnimations().filter((x) => nodes.includes(x.effect?.target)).length };
    }, UI);
    const start = await snapshot();
    await page.evaluate(() => {
      const zs = window.__zs;
      zs.step(3.3);
      const p = zs.getState().player;
      zs.setInput({ aim: { angle: Math.PI } });
      zs.spawnEnemy(p.x + 34, p.y, { type: 'marcheur' });
      for (let i = 0; i < 400 && zs.getState().player.health > 15; i += 1) zs.step(0.05);
      zs.killAll();
      zs.step(0.05);
    });
    expect((await state(page)).player.health).toBeLessThan(100);
    const after = await snapshot();
    expect(after.count).toBe(start.count);
    expect(after.classes).toBe(start.classes);
    expect(after.anims).toBe(start.anims);
  });
});

test.describe('compatibilité avec les refontes de lot-4b (lot 3l-C)', () => {
  test('lot 3g, visite libre (?nospawn=1) : ni compte à rebours ni annonce de manche pendant 12 s', async ({ page }) => {
    await open(page, '&nospawn=1');
    for (let i = 0; i < 6; i += 1) {
      await step(page, 2);
      const s = await state(page);
      expect(s.splash.visible).toBe(false);
      await expect(page.locator('#hud-next')).toBeHidden();
      await expect(page.locator('#hud-wave')).toBeHidden();
    }
  });

  test('lot 3i, sons : sans AudioContext, le HUD a les mêmes boîtes et les mêmes textes (aucune interface ne dépend d\'un son)', async ({ page, context }) => {
    await open(page, '&map=salle');
    await step(page, 3.3);
    const ref = await hudBoxes(page);
    const text = await page.locator('#hud').innerText();
    const other = await context.newPage();
    await other.addInitScript(() => { delete window.AudioContext; delete window.webkitAudioContext; });
    await open(other, '&map=salle');
    await step(other, 3.3);
    expect(await hudBoxes(other)).toEqual(ref);
    expect((await other.locator('#hud').innerText()).replace(/\d\d:\d\d/, '')).toBe(text.replace(/\d\d:\d\d/, ''));
  });

  test('lot 3j (sang, personnages v2) : absent de lot-4b au moment du lot 3l ; ?sang=1 ne change pas le HUD (paramètre ignoré)', async ({ page }) => {
    await open(page, '&map=salle');
    const ref = await hudBoxes(page);
    await open(page, '&map=salle&sang=1&perso=B');
    expect(await hudBoxes(page)).toEqual(ref);
  });

  test('atelier : « Actuel » charge le jeu intégré et en mesure les blocs de B ; A, B, C masquent toujours l\'interface du jeu', async ({ page }) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/atelier-interface.html?test=1');
    await page.waitForFunction(() => window.__zsUi);
    await page.evaluate(() => window.__zsUi.ready);
    await page.evaluate(() => window.__zsUi.set({ size: '667x375', direction: 'actuel', screen: 'hud', stateId: 'combat' }));
    test.skip((await page.evaluate(() => window.__zsUi.getState().frame?.status)) === 'error', 'WebGL indisponible');
    const frame = page.frameLocator('#frame');
    await expect(frame.locator('#hud-chrono')).toBeVisible({ timeout: 60_000 });
    const m = await page.evaluate(() => window.__zsUi.measure());
    expect(m.measure.elements.map((e) => e.name)).toEqual(expect.arrayContaining(['chrono', 'vie', 'argent', 'vague', 'tues', 'pause']));
    await page.evaluate(() => window.__zsUi.set({ direction: 'B' }));
    await expect(frame.locator('#hud')).toBeHidden();
    await expect(frame.locator('#btn-pause')).toBeHidden();
  });
});
