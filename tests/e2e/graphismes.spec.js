import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { readFileSync } from 'node:fs';
import { backgroundsFrom, evaluate, tokensFromCss } from '../../js/core/ui-measure.js';
import { parseGraphics } from '../../js/core/graphics.js';

// Lot 5b-B : préréglages graphiques (Faible, Moyen, Élevé, Auto). Ce qu'un joueur voit ou fait : la partie est la même à chaque préréglage
// (getState() logique identique après 600 pas), chaque préréglage applique ses réglages, l'interface et les planches restent lisibles, la ligne
// « Graphismes » de la pause demande confirmation, écrit zs.device.v1 et recharge (simulé sous ?test=1) ; ?gfx= n'écrit rien. 667 × 375, step().
// Lot 5j : la ligne « Graphismes » et la bascule « Effet VHS » quittent la pause pour l'écran Options (E2-12, js/game/options-menu.js importé à la première
// ouverture) : préréglages Auto, Faible, Moyen, Élevé, Perso ; une option modifiée passe à Perso ; « live » à chaud, « load » en attente avec la barre
// « Recharger maintenant » ; zs.device.v1 schéma 2 ; invariance de la logique pour 12 vecteurs tirés d'une graine.
const SIZE = { width: 667, height: 375 };
const PRESETS = ['faible', 'moyen', 'eleve', 'auto'];
const DEVICE = 'zs.device.v1';
const SAVE = 'zs.save.v1';
const NOISE = /GL Driver|GPU stall|ReadPixels/;
const cfg = JSON.parse(readFileSync('data/game/ui-atelier.json', 'utf8'));
const backgrounds = backgroundsFrom(tokensFromCss(readFileSync('css/tokens.css', 'utf8')), cfg.worstBackgrounds);
const GFX = parseGraphics(JSON.parse(readFileSync('data/game/graphics.json', 'utf8')));
const VECTORS = GFX.vectors;
// Lot 5j : Pause → Options (écran construit et importé au premier clic).
async function openOptions(page) {
  await page.locator('#btn-pause').click();
  await page.locator('#btn-options').click();
  await expect(page.locator('#options-panel')).toBeVisible();
}
const opt = (page, id, value) => page.locator(`[data-option="${id}"] [data-value="${value}"]`);
const preset = (page, id) => page.locator(`#options-preset-${id}`);
// Générateur pseudo-aléatoire à graine (LCG) : tirage reproductible des vecteurs d'options (aucun Math.random).
function lcg(seed) {
  let x = seed >>> 0;
  return () => {
    x = (Math.imul(x, 1664525) + 1013904223) >>> 0;
    return x / 2 ** 32;
  };
}

async function open(page, query, { freeze = true, hidden = false } = {}) {
  await page.setViewportSize(SIZE);
  // Invariance : la boucle d'images ne démarre jamais (onglet « caché ») : seul step() fait avancer la partie, quel que soit le temps réel.
  if (hidden) await page.addInitScript(() => Object.defineProperty(Document.prototype, 'hidden', { get: () => true, configurable: true }));
  await page.goto(`/jeu.html?test=1&seed=1${query}`);
  if (hidden) await page.waitForFunction(() => window.__zs || document.getElementById('game-error')?.hidden === false, null, { timeout: 90_000 });
  else await page.waitForFunction(() => (window.__zs?.getState()?.time ?? 0) > 0.05 || document.getElementById('game-error')?.hidden === false, null, { timeout: 90_000 });
  if (await page.locator('#game-error').isVisible()) test.skip(true, 'WebGL indisponible dans cet environnement : test désactivé');
  if (freeze && !hidden) {
    await page.evaluate(() => { window.requestAnimationFrame = () => 0; });
    await page.evaluate(() => new Promise((r) => setTimeout(r, 120)));
  }
}
const S = (page) => page.evaluate(() => window.__zs.getState());
const watch = (page) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => (m.type() === 'error' || (m.type() === 'warning' && !NOISE.test(m.text()))) && errors.push(m.text()));
  return errors;
};
// Résumé logique : positions, vies, tués, vague, argent, étage (aucun champ visuel).
const logic = (page) => page.evaluate(() => {
  const s = window.__zs.getState();
  return { player: [s.player.x, s.player.y, s.player.health, s.player.down.state], enemies: s.enemies.map((e) => [e.id, e.type, e.gait, e.x, e.y, e.health, e.mode, e.floor]), kills: s.kills, wave: s.waves.wave, phase: s.waves.phase, money: s.economy?.balance ?? null, floor: s.floor.current, bullets: s.bullets.length, time: s.time };
});
// Accès de test de l'atelier de l'interface : relevé du DOM et verdicts purs (contraste 4,5:1, 14 px, 44 px, chevauchements, marges).
async function measure(page, screen) {
  const raw = await page.evaluate(async ({ sc, sz }) => {
    const a = await import('./js/atelier-interface/actuel.js');
    const m = await import('./js/atelier-interface/measure-dom.js');
    return m.collect(document, { root: document.body, viewport: sz, safe: { top: 0, right: 0, bottom: 0, left: 0 }, modal: sc === 'pause', hudNames: a.ACTUEL_HUD_NAMES, items: a.actuelItems(sc) });
  }, { sc: screen, sz: SIZE });
  return evaluate(raw, backgrounds, cfg.rules);
}

test.describe('préréglages graphiques', () => {
  test.skip(({ isMobile }) => isMobile, 'bureau (la fenêtre est réglée par chaque test)');

  test('invariance : même graine, mêmes actions, 600 pas : getState() logique identique aux quatre préréglages', async ({ page }) => {
    test.setTimeout(240_000);
    const runs = {};
    for (const gfx of PRESETS) {
      await open(page, `&wave=3&gfx=${gfx}`, { hidden: true });
      await page.evaluate(() => {
        const zs = window.__zs;
        zs.setInput({ aim: { angle: 0.4 }, move: { x: 0.3, y: -0.2 } });
        for (let i = 0; i < 300; i += 1) zs.step(0.05);
        zs.setInput({ aim: { angle: 2.2 } });
        for (let i = 0; i < 300; i += 1) zs.step(0.05);
        zs.setInput({});
      });
      runs[gfx] = await logic(page);
      expect((await S(page)).graphics.choice).toBe(gfx);
    }
    expect(runs.eleve.time).toBeGreaterThan(29);
    expect(runs.eleve.enemies.length + runs.eleve.kills).toBeGreaterThan(0); // des zombies sont apparus : la comparaison a du contenu
    for (const gfx of ['faible', 'moyen', 'auto']) expect(runs[gfx], gfx).toEqual(runs.eleve);
  });

  test('chaque préréglage applique ses réglages (rapport de pixels sur un écran ×2, ombres, VHS, brume, feux, personnages, sang)', async ({ browser }) => {
    test.setTimeout(240_000);
    const context = await browser.newContext({ viewport: SIZE, deviceScaleFactor: 2 });
    const page = await context.newPage();
    const expected = {
      faible: { pixelRatio: 1, shadows: false, vhs: 'off', mists: [false, false, false], perso: 'A', sang: 'reduit', antialias: false },
      moyen: { pixelRatio: 1.5, shadows: true, vhs: 'statique', mists: [true, false, false], perso: 'A', sang: 'reduit', antialias: false },
      eleve: { pixelRatio: 2, shadows: true, vhs: 'anime', mists: [true, true, true], perso: 'choix', sang: '1', antialias: true },
    };
    for (const [gfx, e] of Object.entries(expected)) {
      await page.goto(`/jeu.html?test=1&seed=1&nospawn=1&gfx=${gfx}`);
      await page.waitForFunction(() => (window.__zs?.getState()?.time ?? 0) > 0.05, null, { timeout: 90_000 });
      const s = await S(page);
      expect(s.graphics).toMatchObject({ choice: gfx, preset: gfx, origin: 'parametre', auto: false, pixelRatio: e.pixelRatio, shadows: e.shadows, vhs: e.vhs, overridden: [] });
      if (s.graphics.antialias !== null) expect(s.graphics.antialias).toBe(e.antialias);
      expect(s.graphics.world.mists).toEqual(e.mists);
      // Lot 5k-G : en éclairage dynamique (Élevé), la lune ne projette plus d'ombre (ce sont les lampes qui en projettent) ; la carte d'ombres reste active.
      expect(s.graphics.world.castShadow).toBe(e.shadows && s.graphics.live.lampes !== 'eclairage');
      if (s.graphics.live.lampes === 'eclairage') expect(s.graphics.world.lamps.lights.castShadow.filter(Boolean)).toHaveLength(s.graphics.live.ombresLampes);
      expect(s.graphics.world.shadowMap).toBe(gfx === 'eleve' ? 1024 : 512);
      expect(s.vhs.mode).toBe(e.vhs);
      expect(s.persos).toMatchObject({ perso: e.perso, sang: e.sang });
      const fires = s.graphics.world.fires;
      const car = fires.find((f) => f.kind === 'voiture');
      const heli = fires.find((f) => f.kind === 'helico');
      const decor = fires.filter((f) => f.kind === 'decor');
      expect(car.spots).toBe(gfx === 'faible' ? 1 : 2);
      expect(heli.visible).toBe(gfx !== 'faible');
      expect(heli.smoke).toBe(gfx === 'moyen' ? 32 : 64);
      for (const f of decor) expect([f.flames, f.glow]).toEqual(gfx === 'faible' ? [32, false] : [64, true]);
    }
    // Un paramètre explicite l'emporte sur le préréglage, sans rien mémoriser.
    await page.goto('/jeu.html?test=1&seed=1&nospawn=1&gfx=faible&shadows=1&vhs=1&dpr=2&perso=riche');
    await page.waitForFunction(() => (window.__zs?.getState()?.time ?? 0) > 0.05, null, { timeout: 90_000 });
    const s = await S(page);
    expect(s.graphics).toMatchObject({ preset: 'faible', pixelRatio: 2, shadows: true, vhs: 'anime' });
    expect(s.graphics.overridden).toEqual(expect.arrayContaining(['ombres', 'vhs', 'dprMax', 'personnages']));
    expect(s.persos.perso).toBe('riche');
    await context.close();
  });

  for (const gfx of ['faible', 'moyen']) {
    test(`lisibilité sous ?gfx=${gfx} : HUD et pause (contraste 4,5:1, 14 px, 44 px, chevauchements) ; planches plus claires que le meuble voisin`, async ({ page }) => {
      test.setTimeout(120_000);
      await open(page, `&gfx=${gfx}&wave=21&floor=1`);
      await page.evaluate(() => window.__zs.step(3.3));
      const hud = await measure(page, 'hud');
      expect(hud.outOfTarget).toEqual([]);
      expect(hud.minContrast).toBeGreaterThanOrEqual(4.5);
      await page.locator('#btn-pause').click();
      const pause = await measure(page, 'pause');
      expect(pause.outOfTarget).toEqual([]);
      // Planches (même mesure que jeu-planches.spec.js, ancienne salle) : au moins 25 % plus claires que le meuble le plus proche.
      await page.goto(`/jeu.html?test=1&seed=1&nospawn=1&map=salle&gfx=${gfx}`);
      await page.waitForFunction(() => (window.__zs?.getState()?.time ?? 0) > 0.05, null, { timeout: 90_000 });
      await page.evaluate(() => { window.requestAnimationFrame = () => 0; });
      const r = await page.evaluate(() => {
        const zs = window.__zs;
        zs.step(0.05);
        zs.setPlayer(1800, 900);
        zs.sampleScreen(0, 0, 4, 4);
        const st = zs.getState();
        const nord = st.windows.find((w) => w.id === 'fenetre-nord');
        const onScreen = (o) => o.screen.x > 0.08 && o.screen.x < 0.92 && o.screen.y > 0.1 && o.screen.y < 0.9;
        const near = st.obstacles.filter(onScreen).sort((a, b) => Math.hypot(a.x + a.w / 2 - nord.x, a.y + a.h / 2 - nord.y) - Math.hypot(b.x + b.w / 2 - nord.x, b.y + b.h / 2 - nord.y))[0];
        if (!near) return null;
        const px = (p) => [p.x * innerWidth, p.y * innerHeight];
        const [wx, wy] = px(nord.screen);
        const [ox, oy] = px(near.screen);
        return { planks: zs.sampleScreen(wx - 20, wy - 3, 40, 6).meanLuminance, furniture: zs.sampleScreen(ox - 8, oy - 8, 16, 16).meanLuminance };
      });
      test.skip(r === null, 'meuble hors de l\'écran');
      expect(r.planks).toBeGreaterThanOrEqual(r.furniture * 1.25);
    });
  }

  // Lot 5j : remplace « pause : ligne « Graphismes » (44 px, choix marqué), confirmation, zs.device.v1 écrit, rechargement demandé ; Annuler n'écrit rien ; axe ».
  test('Options : préréglages appliquant leur vecteur, option « live » → Perso à chaud, option « load » en attente (barre, aucun rechargement), Perso restauré, zs.device.v1 v2 ; axe', async ({ page }) => {
    test.setTimeout(120_000);
    const errors = watch(page);
    await open(page, '&nospawn=1&store=local');
    await page.evaluate(() => localStorage.clear());
    await page.evaluate(() => { window.__marker = 1; }); // disparaît si la page se recharge
    await openOptions(page);
    await expect(page.locator('#options-panel')).toHaveAttribute('data-block', 'E2-12');
    await expect(page.locator('#options-panel')).toHaveAttribute('role', 'dialog');
    await expect(page.locator('#options-current')).toHaveText('Auto (Élevé)');
    await expect(preset(page, 'auto')).toHaveAttribute('aria-pressed', 'true');
    await expect(preset(page, 'auto')).toBeFocused();
    expect(await page.locator('.options-choice').allTextContents()).toEqual(['Auto', 'Faible', 'Moyen', 'Élevé', 'Perso']);
    expect((await S(page)).graphics).toMatchObject({ choice: 'auto', preset: 'eleve', vector: VECTORS.eleve, pending: [] });
    await expect(page.locator('#options-reload')).toBeHidden();
    // Chaque préréglage applique son vecteur : options « live » tout de suite (brume, rapport de pixels…), « load » en attente.
    for (const p of ['faible', 'moyen', 'eleve']) {
      await preset(page, p).click();
      const g = (await S(page)).graphics;
      expect(g).toMatchObject({ choice: p, preset: p, vector: VECTORS[p], reloadRequested: null });
      expect(g.live).toEqual(GFX.presets[p].live);
      expect(g.world.mists).toEqual({ faible: [false, false, false], moyen: [true, false, false], eleve: [true, true, true] }[p]);
      expect(g.vhs).toBe(GFX.presets[p].live.vhs);
      expect(g.pending).toEqual({ faible: ['anticrenelage', 'carte', 'textures', 'personnages'], moyen: ['anticrenelage', 'personnages'], eleve: [] }[p]);
      await expect(preset(page, p)).toHaveAttribute('aria-pressed', 'true');
      for (const o of GFX.options) await expect(opt(page, o.id, VECTORS[p][o.id])).toHaveAttribute('aria-pressed', 'true');
      await expect(page.locator('#options-reload')).toBeVisible({ visible: p !== 'eleve' });
      expect(JSON.parse(await page.evaluate((k) => localStorage.getItem(k), DEVICE))).toEqual({ v: 2, graphics: p, custom: null });
    }
    // Lot 5j-D : « Feux et fumées » (une seule option) : Complets depuis Moyen → la fumée de l'hélicoptère entière, à chaud ; puis retour à Moyens.
    await preset(page, 'moyen').click();
    await expect(page.locator('[data-option="feux"] .options-label > span').first()).toHaveText('Feux et fumées');
    await opt(page, 'feux', 'complets').click();
    expect((await S(page)).graphics.world.fires.find((f) => f.kind === 'helico').smoke).toBe(64);
    await opt(page, 'feux', 'moyens').click();
    expect((await S(page)).graphics.world.fires.find((f) => f.kind === 'helico').smoke).toBe(32);
    // Depuis Moyen, une option « live » : Perso tout de suite, effet appliqué sans rechargement, les autres options inchangées.
    await preset(page, 'moyen').click();
    await opt(page, 'brume', 'complete').click();
    let g = (await S(page)).graphics;
    expect(g).toMatchObject({ choice: 'perso', vector: { ...VECTORS.moyen, brume: 'complete' }, origins: { brume: 'perso' } });
    expect(g.world.mists).toEqual([true, true, true]);
    await expect(preset(page, 'perso')).toHaveAttribute('aria-pressed', 'true');
    await expect(opt(page, 'brume', 'complete')).toHaveAttribute('aria-pressed', 'true');
    // Une option « load » : enregistrée, marquée « au rechargement », barre visible, aucun rechargement.
    // Lot 5j-D (retour du propriétaire) : la marque remplace « recharge » dans la ligne du libellé : aucune ligne ne bouge (avant : une ligne de note ajoutée).
    await expect(page.locator('[data-option="textures"] .options-mark')).toHaveText('recharge');
    const rowsAt = () => page.evaluate(() => [...document.querySelectorAll('.options-row')].map((r) => [r.offsetTop, r.offsetHeight]));
    const before = await rowsAt();
    await opt(page, 'textures', 'simples').click();
    expect(await rowsAt()).toEqual(before);
    g = (await S(page)).graphics;
    expect(g.pending).toEqual(['anticrenelage', 'textures', 'personnages']);
    await expect(page.locator('[data-option="textures"] .options-mark')).toHaveText('au rechargement');
    await expect(page.locator('[data-option="textures"] .options-mark')).toHaveAttribute('data-state', 'pending');
    await expect(page.locator('[data-option="carte"] .options-mark')).toHaveText('recharge');
    await expect(page.locator('[data-option="brume"] .options-mark')).toBeHidden(); // option « live » : aucune marque
    await expect(page.locator('.options-note')).toHaveCount(0);
    await expect(page.locator('#options-reload')).toBeVisible();
    const mine = { ...VECTORS.moyen, brume: 'complete', textures: 'simples' };
    expect(JSON.parse(await page.evaluate((k) => localStorage.getItem(k), DEVICE))).toEqual({ v: 2, graphics: 'perso', custom: mine });
    // Retour à un préréglage puis à Perso : la configuration est restaurée.
    await preset(page, 'eleve').click();
    expect((await S(page)).graphics.vector).toEqual(VECTORS.eleve);
    await preset(page, 'perso').click();
    expect((await S(page)).graphics).toMatchObject({ choice: 'perso', vector: mine, custom: mine });
    // « Recharger maintenant » : confirmation « Cette partie sera perdue » ; Annuler ne recharge pas ; Recharger le demande (simulé sous ?test=1).
    await page.locator('#options-reload-now').click();
    await expect(page.locator('#options-confirm-text')).toHaveText('Recharger la page ? Cette partie sera perdue.');
    await expect(page.locator('#options-confirm-cancel')).toBeFocused();
    const axe = await new AxeBuilder({ page }).analyze();
    expect(axe.violations.map((v) => `${v.id} : ${v.nodes.length}`)).toEqual([]);
    await page.locator('#options-confirm-cancel').click();
    await expect(page.locator('#options-confirm')).toBeHidden();
    expect((await S(page)).graphics.reloadRequested).toBeNull();
    await page.locator('#options-reload-now').click();
    await page.locator('#options-confirm-ok').click();
    expect((await S(page)).graphics.reloadRequested).toBe('perso');
    expect(await page.evaluate(() => window.__marker)).toBe(1); // jamais de rechargement réel sous ?test=1
    const keys = await page.evaluate(() => Object.keys(localStorage).sort());
    expect(keys.filter((k) => ![SAVE, DEVICE].includes(k))).toEqual([]);
    expect(errors).toEqual([]);
  });

  // Lot 5j : remplace « préférence mémorisée lue au chargement ; ?gfx= l'emporte et n'écrit rien ; illisible : auto, jamais écrasée ; ?test=1 sans store=local : mémoire ».
  test('préférence (Perso compris) retrouvée après rechargement ; schéma 1 migré ; ?gfx= l\'emporte, n\'écrit rien, tout grisé ; illisible : jamais écrasée ; ?test=1 sans store=local : mémoire', async ({ page }) => {
    test.setTimeout(120_000);
    await page.addInitScript(([k]) => {
      if (!sessionStorage.getItem('__seeded')) {
        localStorage.setItem(k, JSON.stringify({ v: 1, graphics: 'faible' }));
        sessionStorage.setItem('__seeded', '1');
      }
    }, [DEVICE]);
    await open(page, '&nospawn=1&store=local', { freeze: false });
    expect((await S(page)).graphics).toMatchObject({ choice: 'faible', preset: 'faible', origin: 'memorise', storage: { status: 'ok', migrated: true } });
    expect(JSON.parse(await page.evaluate((k) => localStorage.getItem(k), DEVICE))).toEqual({ v: 1, graphics: 'faible' }); // rien d'écrit à la lecture
    await openOptions(page);
    await opt(page, 'ombres', 'hautes').click();
    const mine = { ...VECTORS.faible, ombres: 'hautes' };
    expect(JSON.parse(await page.evaluate((k) => localStorage.getItem(k), DEVICE))).toEqual({ v: 2, graphics: 'perso', custom: mine });
    await page.reload();
    await page.waitForFunction(() => (window.__zs?.getState()?.time ?? 0) > 0.05, null, { timeout: 90_000 });
    expect((await S(page)).graphics).toMatchObject({ choice: 'perso', preset: 'perso', origin: 'memorise', vector: mine, custom: mine, pending: [], shadows: true });
    expect(Object.values((await S(page)).graphics.origins).every((o) => o === 'perso')).toBe(true);
    // ?gfx=moyen : l'emporte, n'écrit rien ; l'écran Options est verrouillé (tout grisé, mention).
    await open(page, '&nospawn=1&store=local&gfx=moyen');
    expect((await S(page)).graphics).toMatchObject({ choice: 'moyen', origin: 'parametre', locked: true });
    await openOptions(page);
    await expect(page.locator('#options-current')).toHaveText('Moyen (adresse)');
    for (const p of ['auto', 'faible', 'moyen', 'eleve', 'perso']) await expect(preset(page, p)).toBeDisabled();
    await expect(opt(page, 'brume', 'complete')).toBeDisabled();
    await expect(page.locator('#options-status')).toHaveText('Préréglage imposé par l\'adresse (?gfx=) : rien n\'est modifiable ni enregistré.');
    expect(JSON.parse(await page.evaluate((k) => localStorage.getItem(k), DEVICE))).toEqual({ v: 2, graphics: 'perso', custom: mine });
    // ?gfx=perso : le Perso enregistré.
    await open(page, '&nospawn=1&store=local&gfx=perso');
    expect((await S(page)).graphics).toMatchObject({ choice: 'perso', vector: mine, locked: true });
    // Illisible : Auto, jamais écrasée ; le réglage vaut pour la page (message).
    await page.evaluate((k) => localStorage.setItem(k, '{illisible'), DEVICE);
    await open(page, '&nospawn=1&store=local');
    expect((await S(page)).graphics).toMatchObject({ choice: 'auto', storage: { status: 'corrompu' } });
    await openOptions(page);
    await preset(page, 'faible').click();
    await expect(page.locator('#options-status')).toHaveText('Préférence illisible sur cet appareil : elle n\'est pas remplacée.');
    expect(await page.evaluate((k) => localStorage.getItem(k), DEVICE)).toBe('{illisible');
    expect((await S(page)).graphics).toMatchObject({ choice: 'faible', reloadRequested: null });
    // ?test=1 sans ?store=local : préférence en mémoire, rien dans le stockage.
    await page.evaluate(() => localStorage.clear());
    await open(page, '&nospawn=1');
    await openOptions(page);
    await opt(page, 'sang', 'reduit').click();
    expect((await S(page)).graphics).toMatchObject({ choice: 'perso', storage: { mode: 'memory' }, reloadRequested: null });
    expect(await page.evaluate(() => localStorage.length)).toBe(0);
  });

  test('option imposée par l\'adresse : grisée, « imposé par l\'adresse », non modifiable ; les autres restent libres', async ({ page }) => {
    await open(page, '&nospawn=1&shadows=0&dpr=1.25');
    await openOptions(page);
    const g = (await S(page)).graphics;
    expect(g.imposed.sort()).toEqual(['ombres', 'resolution']);
    expect(g.vector).toMatchObject({ ombres: 'aucune', resolution: null });
    await expect(opt(page, 'ombres', 'hautes')).toBeDisabled();
    await expect(opt(page, 'resolution', 'haute')).toBeDisabled();
    await expect(page.locator('[data-option="ombres"] .options-mark')).toHaveText('imposé par l\'adresse'); // lot 5j-D : marque (avant : note .options-note)
    await expect(page.locator('[data-option="resolution"] .options-mark')).toHaveText('imposé par l\'adresse (valeur hors liste)');
    await expect(opt(page, 'ombres', 'aucune')).toHaveAttribute('aria-pressed', 'true');
    await opt(page, 'brume', 'simple').click();
    expect((await S(page)).graphics).toMatchObject({ choice: 'perso', vector: { brume: 'simple', ombres: 'aucune' }, custom: { ombres: 'hautes' }, shadows: false });
  });

  // Lot 5j : 667 × 375 (téléphone en paysage), 375 × 812 et 1440 × 900 : panneau dans la fenêtre, en-tête visible, région qui défile, 44 px, 14 px, focus piégé,
  // Échap et la croix (lot 5j-E, à la place de « Retour ») reviennent à la pause avec le focus sur « Options » ; l'icône du son est en haut à droite de la pause (lot 5j-F).
  for (const size of [SIZE, { width: 375, height: 812 }, { width: 1440, height: 900 }]) {
    test(`Options à ${size.width}×${size.height} : tout atteignable (défilement interne, en-tête fixe), 44 px, 14 px, clavier, Échap et croix de fermeture`, async ({ page }) => {
      test.setTimeout(120_000);
      await open(page, '&nospawn=1');
      await page.setViewportSize(size);
      await openOptions(page);
      const box = (sel) => page.locator(sel).evaluate((e) => { const r = e.getBoundingClientRect(); return { t: r.top, b: r.bottom, l: r.left, r: r.right }; });
      const panel = await box('.panel-options');
      expect(panel.t).toBeGreaterThanOrEqual(0);
      expect(panel.b).toBeLessThanOrEqual(size.height);
      expect(panel.l).toBeGreaterThanOrEqual(0);
      expect(panel.r).toBeLessThanOrEqual(size.width);
      expect(await page.evaluate(() => [document.documentElement.scrollWidth > innerWidth, document.documentElement.scrollHeight > innerHeight])).toEqual([false, false]);
      const region = page.locator('#options-scroll');
      await expect(region).toHaveAttribute('role', 'region');
      await expect(region).toHaveAttribute('aria-label', 'Réglages graphiques');
      await expect(region).toHaveAttribute('tabindex', '0');
      const head = await box('.options-head');
      // Chaque valeur de chaque option : amenée dans la région, entièrement visible dedans, l'en-tête n'a pas bougé ; 44 px.
      const rows = await page.locator('.options-value').count();
      expect(rows).toBe(GFX.options.reduce((n, o) => n + o.valeurs.length, 0));
      const reach = await page.evaluate(() => {
        const reg = document.getElementById('options-scroll');
        const r = reg.getBoundingClientRect();
        return [...reg.querySelectorAll('.options-value')].map((b) => {
          b.scrollIntoView({ block: 'nearest' });
          const q = b.getBoundingClientRect();
          return { ok: q.top >= r.top - 0.5 && q.bottom <= r.bottom + 0.5, h: q.height, w: q.width };
        });
      });
      for (const x of reach) {
        expect(x.ok).toBe(true);
        expect(Math.min(x.h, x.w)).toBeGreaterThanOrEqual(44);
      }
      expect(await box('.options-head')).toEqual(head);
      if (size.height <= 400) expect(await region.evaluate((e) => e.scrollHeight > e.clientHeight)).toBe(true);
      // Toutes les cibles du panneau : 44 px ; tout le texte visible : 14 px au moins.
      const m = await page.evaluate(() => {
        const p = document.getElementById('options-panel');
        const buttons = [...p.querySelectorAll('button')].filter((b) => b.getClientRects().length).map((b) => { const r = b.getBoundingClientRect(); return Math.min(r.width, r.height); });
        const fonts = [...p.querySelectorAll('*')].filter((e) => e.getClientRects().length && [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())).map((e) => parseFloat(getComputedStyle(e).fontSize));
        return { buttons, fonts, filters: [...p.querySelectorAll('*')].map((e) => [getComputedStyle(e).filter, getComputedStyle(e).backdropFilter || 'none']).filter(([f, b]) => f !== 'none' || b !== 'none').length };
      });
      for (const b of m.buttons) expect(b).toBeGreaterThanOrEqual(44);
      expect(Math.min(...m.fonts)).toBeGreaterThanOrEqual(14);
      expect(m.filters).toBe(0);
      // Clavier : Tab tourne dans le panneau (dernier → premier), Maj+Tab aussi (premier → dernier).
      await page.locator('#options-close').focus();
      const seen = new Set();
      for (let i = 0; i < 40; i += 1) {
        await page.keyboard.press('Tab');
        seen.add(await page.evaluate(() => (document.activeElement.closest('#options-panel') ? document.activeElement.id || document.activeElement.dataset.value || document.activeElement.className : 'DEHORS')));
      }
      expect(seen.has('DEHORS')).toBe(false);
      await preset(page, 'auto').focus();
      await page.keyboard.press('Shift+Tab');
      await page.keyboard.press('Shift+Tab');
      expect(await page.evaluate(() => Boolean(document.activeElement.closest('#options-panel')))).toBe(true);
      // Échap : retour à la pause, focus sur « Options » ; la partie reste en pause pendant l'écran Options.
      expect((await S(page)).paused).toBe(true);
      await page.keyboard.press('Escape');
      await expect(page.locator('#options-panel')).toBeHidden();
      await expect(page.locator('#pause-panel')).toBeVisible();
      await expect(page.locator('#btn-options')).toBeFocused();
      await page.locator('#btn-options').click();
      // Croix des Options : en haut à droite du panneau, carré de 44 px, nom accessible.
      const close = page.getByRole('button', { name: 'Fermer les options' });
      const [cb, pb] = [await box('#options-close'), await box('.panel-options')];
      expect(Math.round(cb.r - cb.l)).toBe(44);
      expect(Math.round(cb.b - cb.t)).toBe(44);
      expect(pb.r - cb.r).toBeLessThan(40);
      expect(cb.t - pb.t).toBeLessThan(40);
      await close.click();
      await expect(page.locator('#pause-panel')).toBeVisible();
      await expect(page.locator('#btn-options')).toBeFocused();
      // Lot 5j-F : plus de croix dans la pause (avant, lot 5j-E : « Fermer la pause ») ; l'icône du son est en haut à droite, à droite du solde.
      await expect(page.getByRole('button', { name: 'Fermer la pause' })).toHaveCount(0);
      const [xb, bb, pp] = [await box('#btn-sound'), await box('#pause-balance'), await box('#pause-panel .panel')];
      if (size.width > 480) expect(xb.l).toBeGreaterThan(bb.r); // à droite du solde ; écran étroit (lot 5j-G) : le solde passe sous la ligne du titre
      else expect(bb.t).toBeGreaterThanOrEqual(xb.b - 0.5);
      expect(pp.r - xb.r).toBeLessThan(40);
      expect(xb.t - pp.t).toBeLessThan(40); // en haut à droite du panneau
      expect(Math.round(xb.b - xb.t)).toBe(44);
      await page.locator('#btn-resume').click();
      await expect(page.locator('#pause-panel')).toBeHidden();
      expect((await S(page)).paused).toBe(false);
      await page.locator('#btn-pause').click();
      await page.locator('#btn-resume').click();
      await expect(page.locator('#pause-panel')).toBeHidden();
      expect((await S(page)).paused).toBe(false);
    });
  }

  test('invariance : 12 vecteurs d\'options tirés d\'une graine (Perso enregistré), 600 pas : getState() logique identique', async ({ page }) => {
    test.setTimeout(300_000);
    const rand = lcg(5);
    const vectors = Array.from({ length: 12 }, () => Object.fromEntries(GFX.options.map((o) => [o.id, o.valeurs[Math.floor(rand() * o.valeurs.length)].id])));
    expect(new Set(vectors.map((v) => JSON.stringify(v))).size).toBe(12);
    await page.goto('/data/game/graphics.json'); // même origine : le stockage est prêt avant le premier chargement du jeu
    const runs = [];
    for (const v of vectors) {
      await page.evaluate(([k, custom]) => localStorage.setItem(k, JSON.stringify({ v: 2, graphics: 'perso', custom })), [DEVICE, v]);
      await open(page, '&wave=3&store=local', { hidden: true });
      expect((await S(page)).graphics).toMatchObject({ choice: 'perso', vector: v });
      await page.evaluate(() => {
        const zs = window.__zs;
        zs.setInput({ aim: { angle: 0.4 }, move: { x: 0.3, y: -0.2 } });
        for (let i = 0; i < 300; i += 1) zs.step(0.05);
        zs.setInput({ aim: { angle: 2.2 } });
        for (let i = 0; i < 300; i += 1) zs.step(0.05);
        zs.setInput({});
      });
      runs.push(await logic(page));
    }
    expect(runs[0].time).toBeGreaterThan(29);
    expect(runs[0].enemies.length + runs[0].kills).toBeGreaterThan(0);
    for (let i = 1; i < runs.length; i += 1) expect(runs[i], `vecteur ${i}`).toEqual(runs[0]);
  });

  test('Auto : baisse d\'un cran entre deux manches (annoncée une fois dans #hud-live et dans la pause), jamais en pleine manche, jamais sous Faible, jamais de remontée', async ({ browser }) => {
    const context = await browser.newContext({ viewport: SIZE, deviceScaleFactor: 2 });
    const page = await context.newPage();
    await open(page, '&nospawn=1&gfx=auto');
    const slow = (n, ms) => Array.from({ length: n }, () => ({ ms, phase: 'combat' }));
    const feed = (series) => page.evaluate((s) => window.__zs.feedGraphics(s), series);
    // Manche lente (30 ms pendant 12 s) mais sans attente : rien ne change.
    let g = await feed(slow(400, 30));
    expect(g).toMatchObject({ preset: 'eleve', downgraded: null });
    // Fin de manche : Élevé → Moyen, réglages « live » appliqués, « load » inchangés ; annonce.
    g = await feed([{ ms: 30, phase: 'attente' }]);
    expect(g).toMatchObject({ choice: 'auto', preset: 'moyen', downgraded: 'moyen', pixelRatio: 1.5, vhs: 'statique', lastDecision: { reason: 'baisse' } });
    expect(g.world.mists).toEqual([true, false, false]);
    expect(g.world.shadowMap).toBe(512);
    expect(g.load.personnages).toBe('choix');
    await expect(page.locator('#hud-live')).toHaveText('Graphismes baissés à Moyen entre deux manches.');
    const s = await S(page);
    expect(s.persos.sang).toBe('reduit');
    // Manche fluide : aucune remontée.
    g = await feed([...slow(900, 12), { ms: 12, phase: 'attente' }]);
    expect(g.preset).toBe('moyen');
    expect(g.lastDecision.reason).toBe('fluide');
    // Deux manches lentes : Moyen → Faible, puis le plancher.
    g = await feed([...slow(400, 40), { ms: 40, phase: 'attente' }]);
    expect(g).toMatchObject({ preset: 'faible', pixelRatio: 1, shadows: false, vhs: 'off' });
    g = await feed([...slow(400, 60), { ms: 60, phase: 'attente' }]);
    expect(g).toMatchObject({ preset: 'faible', lastDecision: { reason: 'plancher' } });
    await openOptions(page); // lot 5j : avant, #gfx-current et #gfx-auto de la pause ; après, l'écran Options
    await expect(page.locator('#options-current')).toHaveText('Auto (Faible, baissé)');
    await expect(preset(page, 'auto')).toHaveAttribute('aria-pressed', 'true');
    await expect(opt(page, 'brume', 'simple')).toHaveAttribute('aria-pressed', 'true'); // vecteur de Faible pour les options « live »
    await expect(opt(page, 'personnages', 'riches')).toHaveAttribute('aria-pressed', 'true'); // « load » : celles du chargement (Élevé)
    await expect(page.locator('#options-reload')).toBeHidden();
    await context.close();
  });

  test('par défaut (lampes « off ») : modules des préréglages chargés, aucun module de ?perf ni l\'écran Options (importé à la première ouverture, une fois) ; aucune requête externe ; CLS ≤ 0,1', async ({ page, baseURL }) => {
    const files = [];
    const external = [];
    page.on('request', (r) => {
      if (!r.url().startsWith(baseURL) && !r.url().startsWith('data:') && !r.url().startsWith('blob:')) external.push(r.url());
      else if (r.url().startsWith(baseURL)) files.push(new URL(r.url()).pathname);
    });
    await page.addInitScript(() => {
      window.__cls = 0;
      new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) window.__cls += e.value; }).observe({ type: 'layout-shift', buffered: true });
    });
    // Lot 5k : sur un ordinateur, Auto choisit l'Élevé, dont l'éclairage charge les modules des lampes et des lumières (tests/e2e/lampes.spec.js) ;
    // avec les lampes « off » (?lum=off, rien d'autre ne change), le compte d'avant le lot 5k.
    await open(page, '&nospawn=1&lum=off', { freeze: false });
    for (const f of ['/data/game/graphics.json', '/js/core/graphics.js', '/js/game/graphics-boot.js', '/js/game/graphics-apply.js', '/js/save/device-settings.js']) expect(files).toContain(f);
    for (const f of ['/js/game/profiler.js', '/js/game/perf-panel.js', '/js/game/frame-cap.js', '/js/core/perf-stats.js']) expect(files).not.toContain(f);
    expect(new Set(files.filter((f) => f.endsWith('.js'))).size).toBe(114); // 109 avant le lot 5b + 4 modules des préréglages (lot 5j : inchangé ; lot 5k : lampes « off », inchangé) ; lot 8a : + js/menu/demarrage.js (choix du démarrage)
    for (const f of ['/js/game/lamps.js', '/js/core/lamps.js', '/js/game/lights.js']) expect(files).not.toContain(f); // lot 5k
    expect(files).not.toContain('/js/game/options-menu.js'); // lot 5j : rien de chargé tant que l'écran reste fermé
    expect(external).toEqual([]);
    expect(await page.evaluate(() => window.__cls)).toBeLessThanOrEqual(0.1);
    await openOptions(page);
    await page.locator('#options-close').click();
    await page.locator('#btn-options').click();
    expect(files.filter((f) => f === '/js/game/options-menu.js')).toHaveLength(1);
    expect(new Set(files.filter((f) => f.endsWith('.js'))).size).toBe(115); // lot 8a : 114 + options-menu.js (avant : 113 + 1)
    expect(external).toEqual([]);
  });
});
