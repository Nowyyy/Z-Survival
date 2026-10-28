import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { readFileSync } from 'node:fs';
import { waitReady } from './helpers.js';

// Lot 3a-B : interface compacte (HUD E2-2 en puces, E2-9 sur une ligne, E2-11 flèches au bord). Tout passe par step() et les hooks de ?test=1 ;
// 667×375 de préférence, 1440×900 pour les marges. Les tests se désactivent seuls si WebGL manque.
const SIZE = { width: 667, height: 375 };
const BIG = { width: 1440, height: 900 };
const STATE = (page) => page.evaluate(() => window.__zs.getState());
const BROWSER_NOISE = /GL Driver Message|ReadPixels|GPU stall/;

async function open(page, extra = '', size = SIZE) {
  await page.setViewportSize(size);
  await page.goto(`/jeu.html?test=1&seed=1${extra.includes('nospawn') ? '' : '&nospawn=1'}&vhs=0${extra}`);
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
  test('au repos : au plus 96 px de haut et 300 px de large, marges de 16 px, sans chevaucher Pause (667×375)', async ({ page }) => {
    await open(page);
    const s = await STATE(page);
    expect(s.hud.height).toBeLessThanOrEqual(96);
    expect(s.hud.width).toBeLessThanOrEqual(300);
    const hud = await rect(page, '#hud');
    const pause = await rect(page, '#btn-pause');
    expect(hud.l).toBeGreaterThanOrEqual(16 - 0.5);
    expect(hud.t).toBeGreaterThanOrEqual(16 - 0.5);
    expect(apart(hud, pause)).toBe(true);
  });

  test('pendant une vague avec trois fenêtres en alerte : toujours 96 × 300 au plus', async ({ page }) => {
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
    expect(s.hud.height).toBeLessThanOrEqual(96);
    expect(s.hud.width).toBeLessThanOrEqual(300);
    await expect(page.locator('#hud-wave')).toHaveText('Vague 1');
    await expect(page.locator('#hud-remaining')).toBeVisible();
  });

  test('« Vague N » garde la police de titre, de 22 à 26 px ; le reste la police de lecture', async ({ page }) => {
    await open(page, '&nospawn=0');
    await page.evaluate(() => window.__zs.step(3.5));
    const f = await page.evaluate(() => {
      const css = (sel) => { const c = getComputedStyle(document.querySelector(sel)); return { family: c.fontFamily, size: Number.parseFloat(c.fontSize) }; };
      return { wave: css('#hud-wave'), kills: css('#hud-kills'), remaining: css('#hud-remaining') };
    });
    expect(f.wave.family).toMatch(/Rubik Wet Paint/);
    expect(f.wave.size).toBeGreaterThanOrEqual(22);
    expect(f.wave.size).toBeLessThanOrEqual(26);
    expect(f.kills.family).toMatch(/Barlow/);
    expect(f.remaining.family).toMatch(/Barlow/);
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

  test('« Chutes » : une silhouette par chute restante et le nombre affiché', async ({ page }) => {
    for (const [lvl, n] of [['', 1], ['&lvl=chutes:2', 3]]) {
      await open(page, lvl);
      const r = await page.evaluate(() => ({ icons: document.querySelectorAll('#hud-chutes-icons svg').length, text: document.getElementById('hud-chutes').textContent, label: document.getElementById('hud-chutes').getAttribute('aria-label') }));
      expect(r.icons).toBe(n);
      expect(r.text).toBe(`Chutes ${n}`);
      expect(r.label).toBe(`Chutes restantes : ${n}`);
    }
    await page.evaluate(() => { window.__zs.downPlayer(); window.__zs.step(0.1); });
    expect(await page.locator('#hud-chutes-icons svg').count()).toBe(2);
    await expect(page.locator('#hud-chutes')).toHaveText('Chutes 2');
  });

  test('le texte fait 14 px au moins partout (HUD, E2-9, E2-11) et reste lisible', async ({ page }) => {
    await open(page);
    await attack(page, 'fenetre-nord');
    await page.evaluate(() => { window.__zs.setPlanks('fenetre-ouest', 0); window.__zs.step(0.05); });
    const sizes = await page.evaluate(() => {
      const out = [];
      for (const root of ['#hud', '#repair', '#edges']) {
        for (const el of document.querySelectorAll(`${root}, ${root} *`)) {
          if (el.closest('svg') && el.tagName !== 'svg') continue;
          const own = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim() !== '');
          if (own) out.push({ root, text: el.textContent.trim().slice(0, 20), size: Number.parseFloat(getComputedStyle(el).fontSize) });
        }
      }
      return out;
    });
    expect(sizes.length).toBeGreaterThan(5);
    for (const s of sizes) expect(s.size, `${s.root} ${s.text}`).toBeGreaterThanOrEqual(14);
  });

  test('aucun filter, mix-blend-mode ni backdrop-filter sur le HUD, E2-9 et E2-11', async ({ page }) => {
    await open(page);
    await page.evaluate(() => { window.__zs.setPlanks('fenetre-nord', 0); window.__zs.step(0.05); });
    const bad = await page.evaluate(() => {
      const out = [];
      for (const root of ['#hud', '#repair', '#edges']) for (const el of document.querySelectorAll(`${root}, ${root} *`)) {
        const c = getComputedStyle(el);
        if (c.filter !== 'none' || c.mixBlendMode !== 'normal' || (c.backdropFilter && c.backdropFilter !== 'none')) out.push(`${root} ${el.className}`);
      }
      return out;
    });
    expect(bad).toEqual([]);
  });

  test('1440×900 : marges de 16 px, HUD sans chevaucher Pause', async ({ page }) => {
    await open(page, '', BIG);
    const hud = await rect(page, '#hud');
    const pause = await rect(page, '#btn-pause');
    expect(hud.l).toBeGreaterThanOrEqual(15.5);
    expect(hud.t).toBeGreaterThanOrEqual(15.5);
    expect(apart(hud, pause)).toBe(true);
  });
});

test.describe('rangée des fenêtres', () => {
  test('tout est fermé et intact : la rangée est masquée, sans hauteur réservée, et son apparition ne décale rien (CLS nul)', async ({ page }) => {
    await open(page);
    await expect(page.locator('#hud-windows')).toBeHidden();
    const before = await page.evaluate(() => {
      window.__shift = 0;
      new PerformanceObserver((list) => { for (const e of list.getEntries()) if (!e.hadRecentInput) window.__shift += e.value; }).observe({ type: 'layout-shift', buffered: true });
      const r = (s) => { const b = document.querySelector(s).getBoundingClientRect(); return [b.left, b.top, b.width, b.height]; };
      return { hud: r('#hud'), pause: r('#btn-pause'), chips: r('.hud-chips'), life: r('.hud-life-row') };
    });
    await page.evaluate(() => { window.__zs.setPlanks('fenetre-nord', 0); window.__zs.step(0.05); });
    await expect(page.locator('#hud-windows')).toBeVisible();
    const after = await page.evaluate(() => {
      const r = (s) => { const b = document.querySelector(s).getBoundingClientRect(); return [b.left, b.top, b.width, b.height]; };
      return { pause: r('#btn-pause'), chips: r('.hud-chips'), life: r('.hud-life-row'), shift: window.__shift };
    });
    expect(after.pause).toEqual(before.pause);
    expect(after.chips).toEqual(before.chips);
    expect(after.life).toEqual(before.life);
    expect(after.shift).toBeLessThanOrEqual(0.001);
  });

  test('une fenêtre attaquée apparaît avec son initiale, ses 4 encoches et « ! » ; elle disparaît quand elle n\'est plus attaquée', async ({ page }) => {
    await open(page);
    await attack(page, 'fenetre-nord');
    const chip = page.locator('.hud-win[data-id="fenetre-nord"]');
    await expect(chip).toBeVisible();
    await expect(chip).toContainText('N');
    await expect(chip).toContainText('!');
    await expect(chip.locator('.hud-win-notch')).toHaveCount(4);
    await expect(chip.locator('.hud-win-notch[data-on="1"]')).toHaveCount((await STATE(page)).windows[0].planks);
    await expect(chip).toHaveAttribute('aria-label', /Fenêtre nord attaquée : \d planches sur 4/);
    await page.evaluate(() => { window.__zs.killAll(); window.__zs.step(0.1); });
    await expect(page.locator('#hud-windows')).toBeHidden();
  });

  test('une fenêtre à 0 planche affiche « ouverte », sans « ! » ; les initiales viennent de fr.json', async ({ page }) => {
    await open(page);
    await page.evaluate(() => { window.__zs.setPlanks('fenetre-est', 0); window.__zs.setPlanks('fenetre-ouest', 0); window.__zs.step(0.05); });
    await expect(page.locator('.hud-win[data-id="fenetre-est"]')).toHaveText('Eouverte');
    await expect(page.locator('.hud-win[data-id="fenetre-ouest"]')).toHaveText('Oouverte');
    await expect(page.locator('.hud-win[data-state="open"]')).toHaveCount(2);
    await expect(page.locator('#hud-windows .hud-win-alert')).toHaveCount(0);
  });

  test('trois fenêtres en alerte : triées par urgence (ouverte, puis le moins de planches), 96 px de haut au plus', async ({ page }) => {
    await open(page);
    await page.evaluate(() => { const zs = window.__zs; zs.setPlanks('fenetre-ouest', 0); zs.setPlanks('fenetre-est', 1); zs.step(0.05); });
    await attack(page, 'fenetre-est');
    await page.evaluate(() => window.__zs.step(0.05));
    await attack(page, 'fenetre-nord');
    const s = await STATE(page);
    expect(s.hud.chips.map((c) => c.id)).toEqual(['fenetre-ouest', 'fenetre-est', 'fenetre-nord']);
    expect(await page.locator('#hud-windows .hud-win').evaluateAll((els) => els.map((e) => e.dataset.id))).toEqual(['fenetre-ouest', 'fenetre-est', 'fenetre-nord']);
    expect(s.hud.height).toBeLessThanOrEqual(96);
    expect(s.hud.width).toBeLessThanOrEqual(300);
  });

  test('quatre fenêtres en alerte : trois puces et « +1 » (rendu réel de hud.js)', async ({ page }) => {
    await open(page);
    const r = await page.evaluate(async () => {
      const { createHud } = await import('/js/game/hud.js');
      const dict = await (await fetch('/data/i18n/fr.json')).json();
      const hud = createHud(dict);
      const chips = ['n', 'o', 'e', 's'].map((k, i) => ({ id: `fenetre-${k}`, label: k.toUpperCase(), planks: i, max: 4, attacked: true, open: i === 0 }));
      hud.update({ health: 100, maxHealth: 100 }, 0, { active: false }, { chutes: 1, chips: { chips: chips.slice(0, 3), more: 1 }, names: {} });
      const box = document.getElementById('hud').getBoundingClientRect();
      return { n: document.querySelectorAll('#hud-windows .hud-win').length, text: [...document.querySelectorAll('#hud-windows .hud-win')].map((e) => e.textContent), height: box.height, width: box.width };
    });
    expect(r.n).toBe(4);
    expect(r.text.at(-1)).toBe('+1');
    expect(r.height).toBeLessThanOrEqual(96);
    expect(r.width).toBeLessThanOrEqual(300);
  });
});

test.describe('E2-9 sur une ligne', () => {
  const near = async (page, planks = 2) => {
    await page.evaluate(([n]) => { const zs = window.__zs; zs.setPlanks('fenetre-nord', n); zs.setPlayer(1800, 900); zs.step(0.5); }, [planks]);
  };

  test('« Fenêtre nord · 2/4 » pendant la réparation : une ligne, 300 px et 44 px au plus, aria-hidden', async ({ page }) => {
    await open(page);
    await near(page);
    const repair = page.locator('#repair');
    await expect(repair).toBeVisible();
    await expect(repair).toHaveAttribute('aria-hidden', 'true');
    await expect(repair).toHaveAttribute('data-block', 'E2-9');
    await expect(page.locator('#repair-label')).toHaveText(/^Fenêtre nord · [234]\/4$/);
    const s = await STATE(page);
    expect(s.hud.e29.lines).toBe(1);
    expect(s.hud.e29.width).toBeLessThanOrEqual(300);
    expect(s.hud.e29.height).toBeLessThanOrEqual(44);
    expect(await page.locator('#repair-sub').count()).toBe(0);
  });

  test('« Fenêtre nord · occupée » avec une croix quand un zombie occupe un emplacement', async ({ page }) => {
    await open(page);
    await attack(page, 'fenetre-nord');
    await page.evaluate(() => { window.__zs.setPlanks('fenetre-nord', 3); window.__zs.setPlayer(1800, 900); window.__zs.step(0.1); });
    await expect(page.locator('#repair-label')).toHaveText('Fenêtre nord · occupée');
    const s = await STATE(page);
    expect(s.hud.e29).toMatchObject({ text: 'Fenêtre nord · occupée', lines: 1, blocked: true });
    await expect(page.locator('#repair .repair-cross')).toBeVisible();
    await expect(page.locator('#repair .repair-ring')).toBeHidden();
  });

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

  test('mouvement réduit : aucune animation d\'apparition sur E2-9', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await open(page);
    await near(page);
    const [name, duration] = await page.evaluate(() => [getComputedStyle(document.getElementById('repair')).animationName, getComputedStyle(document.getElementById('repair')).transitionDuration]);
    expect(name).toBe('none');
    expect(Number.parseFloat(duration)).toBeLessThanOrEqual(0.001);
  });

  test('pendant une vague (HUD à sa largeur maximale, 6 chutes), E2-9 ne chevauche ni le HUD ni Pause et le contenu du HUD tient dans ses 300 px', async ({ page }) => {
    await open(page, '&nospawn=0&lvl=chutes:5');
    await page.evaluate(() => { const zs = window.__zs; zs.setPlanks('fenetre-nord', 2); zs.setPlayer(1800, 900); zs.step(3.5); });
    await expect(page.locator('#repair')).toBeVisible();
    const hud = await rect(page, '#hud');
    const rep = await rect(page, '#repair');
    const pause = await rect(page, '#btn-pause');
    expect(apart(hud, rep)).toBe(true);
    expect(apart(rep, pause)).toBe(true);
    const fit = await page.evaluate(() => [...document.querySelectorAll('#hud .hud-life-row, #hud .hud-chips, #hud .hud-windows')].map((e) => [e.scrollWidth, e.clientWidth]));
    for (const [sw, cw] of fit) expect(sw).toBeLessThanOrEqual(cw);
    expect(hud.w).toBeLessThanOrEqual(300);
  });

  test('E2-9 reste à 16 px des bords et ne touche ni le HUD ni Pause ni E2-10 (667×375)', async ({ page }) => {
    await open(page);
    await near(page);
    await page.evaluate(() => { window.__zs.downPlayer(); window.__zs.step(0.1); });
    const rep = await rect(page, '#repair');
    expect(rep.t).toBeGreaterThanOrEqual(15.5);
    for (const sel of ['#hud', '#btn-pause']) expect(apart(rep, await rect(page, sel)), sel).toBe(true);
    if (await page.locator('#down-title').isVisible()) expect(apart(rep, await rect(page, '#down-title')), '#down-title').toBe(true);
  });
});

test.describe('E2-11 flèches au bord de l\'écran', () => {
  test('aucune flèche sans fenêtre attaquée ni ouverte', async ({ page }) => {
    await open(page);
    expect(await page.locator('#edges .edge-arrow:not([hidden])').count()).toBe(0);
    expect((await STATE(page)).hud.arrows).toEqual([]);
  });

  test('une fenêtre attaquée hors écran : une flèche à 16 px du bord, tournée vers elle, avec son initiale', async ({ page }) => {
    await open(page);
    await page.evaluate(() => { window.__zs.setPlayer(1800, 1400); window.__zs.step(0.2); });
    await attack(page, 'fenetre-ouest');
    const a = await page.evaluate(() => {
      const s = window.__zs.getState();
      const el = document.querySelector('#edges .edge-arrow:not([hidden])');
      const r = el.getBoundingClientRect();
      return { arrows: s.hud.arrows, box: { l: r.left, t: r.top, r: r.right, b: r.bottom }, letter: el.querySelector('.edge-letter').textContent, w: innerWidth, h: innerHeight, win: s.windows.find((w) => w.id === 'fenetre-ouest').screen };
    });
    expect(a.arrows).toHaveLength(1);
    expect(a.letter).toBe('O');
    expect(a.box.l).toBeGreaterThanOrEqual(15);
    expect(a.box.l).toBeLessThanOrEqual(17);
    expect(Math.abs(Math.abs(a.arrows[0].angle) - Math.PI)).toBeLessThan(0.6); // vers la gauche
    expect(a.win.x).toBeLessThan(0); // la fenêtre est bien hors de l'écran
  });

  test('l\'ouest est hors champ puis, quand le joueur s\'en approche, la flèche disparaît', async ({ page }) => {
    await open(page);
    await page.evaluate(() => { window.__zs.setPlayer(1800, 1400); window.__zs.step(0.2); });
    await attack(page, 'fenetre-ouest');
    expect((await STATE(page)).hud.arrows).toHaveLength(1);
    await page.evaluate(() => { window.__zs.setPlayer(900, 1400); window.__zs.step(0.1); window.__zs.sampleScreen(0, 0, 4, 4); });
    expect((await STATE(page)).hud.arrows).toEqual([]);
    expect(await page.locator('#edges .edge-arrow:not([hidden])').count()).toBe(0);
  });

  test('deux flèches au plus, même avec trois fenêtres ouvertes', async ({ page }) => {
    await open(page);
    await page.evaluate(() => { const zs = window.__zs; zs.setPlayer(1800, 1900); for (const id of ['fenetre-nord', 'fenetre-ouest', 'fenetre-est']) zs.setPlanks(id, 0); zs.step(0.2); zs.sampleScreen(0, 0, 4, 4); });
    const s = await STATE(page);
    expect(s.hud.arrows.length).toBeGreaterThan(0);
    expect(s.hud.arrows.length).toBeLessThanOrEqual(2);
    expect(await page.locator('#edges .edge-arrow:not([hidden])').count()).toBe(s.hud.arrows.length);
  });

  test('pas de pulsation sous mouvement réduit ; une pulsation douce sinon', async ({ page }) => {
    await open(page);
    await page.evaluate(() => { window.__zs.setPlayer(1800, 1400); window.__zs.setPlanks('fenetre-ouest', 0); window.__zs.step(0.2); });
    const anim = (p) => p.evaluate(() => getComputedStyle(document.querySelector('#edges .edge-arrow:not([hidden]) .edge-letter')).animationName);
    expect(await anim(page)).toBe('edge-pulse');
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await expect.poll(() => anim(page)).toBe('none');
  });

  test('la flèche ne recouvre ni le HUD, ni Pause, ni E2-9, ni les cadres de repos des sticks', async ({ page }) => {
    await open(page);
    await page.evaluate(() => {
      const root = document.getElementById('game-root');
      root.dispatchEvent(new PointerEvent('pointerdown', { pointerType: 'touch', pointerId: 9, clientX: 80, clientY: 250, bubbles: true }));
      root.dispatchEvent(new PointerEvent('pointerup', { pointerType: 'touch', pointerId: 9, clientX: 80, clientY: 250, bubbles: true }));
      const zs = window.__zs;
      zs.setPlayer(1800, 1500);
      zs.setPlanks('fenetre-nord', 0);
      zs.setPlanks('fenetre-ouest', 0);
      zs.step(0.2);
    });
    await expect(page.locator('#edges .edge-arrow:not([hidden])').first()).toBeVisible();
    const boxes = await page.evaluate(() => {
      const r = (el) => { const b = el.getBoundingClientRect(); return { l: b.left, t: b.top, r: b.right, b: b.bottom }; };
      return {
        arrows: [...document.querySelectorAll('#edges .edge-arrow:not([hidden])')].map(r),
        others: ['#hud', '#btn-pause', '#repair:not([hidden])', '#stick-left:not([hidden]) .stick-base', '#stick-right:not([hidden]) .stick-base'].map((sel) => document.querySelector(sel)).filter(Boolean).map(r),
      };
    });
    for (const a of boxes.arrows) for (const o of boxes.others) expect(apart(a, o), JSON.stringify([a, o])).toBe(true);
  });
});

test.describe('structure, accessibilité, hygiène', () => {
  test('l\'ordre des blocs dans le HTML : E2-2, E2-8, E2-9, E2-10, E2-11, E2-5, E2-3, E2-4', async ({ page }) => {
    await open(page);
    const order = await page.evaluate(() => [...document.querySelectorAll('#game-root > [data-block]')].map((e) => e.dataset.block));
    expect(order).toEqual(['E2-2', 'E2-8', 'E2-9', 'E2-10', 'E2-11', 'E2-5', 'E2-3', 'E2-4']);
  });

  test('E2-11 est aria-hidden et ne reçoit aucun événement ; aucun focus volé par le HUD, E2-9 ou E2-11', async ({ page }) => {
    await open(page);
    await page.evaluate(() => { window.__zs.setPlayer(1800, 1400); window.__zs.setPlanks('fenetre-ouest', 0); window.__zs.setPlanks('fenetre-nord', 2); window.__zs.step(0.3); });
    const r = await page.evaluate(() => ({
      aria: document.getElementById('edges').getAttribute('aria-hidden'),
      events: getComputedStyle(document.getElementById('edges')).pointerEvents,
      active: document.activeElement?.tagName,
      focusable: document.querySelectorAll('#hud [tabindex], #hud button, #hud a, #repair button, #edges [tabindex], #edges button').length,
    }));
    expect(r).toEqual({ aria: 'true', events: 'none', active: 'BODY', focusable: 0 });
  });

  test('axe : aucune violation avec le HUD, des puces de fenêtre, E2-9 et E2-11 affichés', async ({ page }) => {
    await open(page);
    await page.evaluate(() => { const zs = window.__zs; zs.setPlayer(1800, 900); zs.setPlanks('fenetre-nord', 2); zs.setPlanks('fenetre-ouest', 0); zs.setPlanks('fenetre-est', 1); zs.step(0.5); });
    await expect(page.locator('#repair')).toBeVisible();
    await expect(page.locator('#hud-windows')).toBeVisible();
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

  test('les marges de sécurité sont respectées : le HUD, E2-9 et les flèches s\'appuient sur --safe-*', async () => {
    const css = readFileSync('css/game.css', 'utf8');
    expect(css).toMatch(/\.hud \{[^}]*var\(--game-margin\) \+ var\(--safe-top\)[^}]*var\(--game-margin\) \+ var\(--safe-left\)/s);
    expect(css).toMatch(/\.repair \{[^}]*var\(--safe-top\)/s);
    expect(readFileSync('js/game/game.js', 'utf8')).toMatch(/--safe-/);
  });
});
