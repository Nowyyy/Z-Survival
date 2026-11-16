import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { readFileSync } from 'node:fs';
import { buildLayouts } from '../../js/core/layout.js';
import { parseZones, zonesToWorld } from '../../js/core/zones.js';
import { distanceToRect } from '../../js/core/collision.js';
import { waitReady } from './helpers.js';

// Lot 9a (Docs/ref/debut-v09.md) : message des portes à deux cases ; rotor de queue de l'hélicoptère (temps de jeu, figé en pause, immobile sous
// mouvement réduit) ; sol « en bois » de la capture du propriétaire : sacs de sable du décor léger, non solides par conception. ?test=1, step() et
// positions de test (setPlayer) ; aucune durée réelle attendue.
const json = (p) => JSON.parse(readFileSync(p, 'utf8'));
const D = 'data/game/maps/rez-de-chaussee/';
const world = json(`${D}world.json`);
const LAYOUTS = buildLayouts({ rdc: { world, decor: json(`${D}decor.json`) }, etage: { world: json(`${D}etage.world.json`) }, zones: zonesToWorld(parseZones(json(`${D}zones.json`)), world.transform) });
const bloc = (id) => LAYOUTS.doors.find((d) => d.id === id).blocks.rdc[0].rect;
const DISTANCE = json('data/game/reglages-partie.json').porte.distance;
const VITESSE = json('data/game/reglages-partie.json').helicoptere.rotorDegParSeconde;
const SACS = json(`${D}decor-interieur.world.json`).items.find((i) => i.id === 'sacs-1');
const state = (page) => page.evaluate(() => window.__zs.getState());
const images = (page, n = 4) => page.evaluate((k) => new Promise((r) => {
  let i = 0;
  const f = () => (++i >= k ? r() : requestAnimationFrame(f));
  requestAnimationFrame(f);
}), n);

async function open(page, url) {
  await page.setViewportSize({ width: 667, height: 375 });
  await page.goto(url);
  await waitReady(page);
}

test.describe('portes, hélicoptère et sol de la capture (lot 9a)', () => {
  test('message « Porte ouverte à la manche 11 » jusqu\'à deux cases (120) du bloc de la porte 1, jamais au-delà', async ({ page }) => {
    await open(page, '/jeu.html?test=1&seed=1&nospawn=1');
    expect(DISTANCE).toBe(120);
    const r = bloc('porte-1');
    const vus = [];
    for (const d of [30, 90, 115, 119, 125, 140, 200]) {
      await page.evaluate(([x, y]) => window.__zs.setPlayer(x, y), [r.x - d, r.y + r.h / 2]);
      await images(page);
      const p = (await state(page)).player;
      const reel = distanceToRect(p.x, p.y, r);
      const visible = (await page.locator('#porte-message').getAttribute('data-visible')) === 'true';
      vus.push([d, Math.round(reel), visible]);
      expect(visible, `à ${reel.toFixed(1)} du bloc`).toBe(reel <= DISTANCE);
    }
    // Au moins une position à deux cases ou presque (message) et une juste au-delà (rien).
    expect(vus.some(([, reel, v]) => v && reel >= 110)).toBe(true);
    expect(vus.some(([, reel, v]) => !v && reel > DISTANCE && reel <= 130)).toBe(true);
    await expect(page.locator('#porte-message')).toHaveAttribute('data-visible', 'false');
  });

  test('rotor de queue : figé en pause (images réelles, aucun pas de jeu), tourne en temps de jeu (step) ; aucune collision ajoutée', async ({ page }) => {
    await open(page, '/jeu.html?test=1&seed=1&nospawn=1');
    // Pause : la boucle d'images continue (images réelles), le temps de jeu non ; le rotor non plus.
    await page.locator('#btn-pause').click();
    await expect(page.locator('#pause-panel')).toBeVisible();
    const r0 = (await state(page)).scene.wrecks.rotor;
    expect(r0).toMatchObject({ degParSeconde: VITESSE, triangles: 24 });
    await images(page, 20);
    const r1 = (await state(page)).scene.wrecks.rotor;
    expect([r1.t, r1.angle]).toEqual([r0.t, r0.angle]);
    // Temps de jeu : une seconde de pas de jeu = VITESSE degrés de plus (modulo un tour).
    await page.evaluate(() => window.__zs.step(1));
    const r2 = (await state(page)).scene.wrecks.rotor;
    expect(r2.t - r1.t).toBeCloseTo(1, 5);
    expect(r2.angle).toBeCloseTo((((r2.t * VITESSE) % 360) * Math.PI) / 180, 6);
    expect(r2.angle).not.toBe(r1.angle);
    // Décor seulement : les rectangles de collision de l'hélicoptère sont ceux de decor.json (trois), rien de plus.
    const heli = json(`${D}decor.json`).wrecks.helicopter;
    expect((await state(page)).scene.wrecks.helicopter.rects).toEqual(heli.rects.map((x) => x.id));
  });

  test('mouvement réduit : rotor immobile (angle 0) même quand le temps de jeu avance', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await open(page, '/jeu.html?test=1&seed=1&nospawn=1');
    await page.evaluate(() => { window.requestAnimationFrame = () => 0; window.__zs.step(2); });
    const r = (await state(page)).scene.wrecks.rotor;
    expect(r.angle).toBe(0);
    expect(r.t).toBe(0);
  });

  test('sol de la capture : sacs de sable (décor léger) non solides par conception : le joueur posé dessus y reste ; même image avec et sans « mur percé »', async ({ page }) => {
    expect(SACS).toMatchObject({ kind: 'sacs', floor: 'rdc' });
    const centre = [SACS.x + SACS.w / 2, SACS.y + SACS.h / 2];
    const mesure = async (extra) => {
      await open(page, `/jeu.html?test=1&seed=1&nospawn=1&vhs=0${extra}`);
      await page.evaluate(() => { window.requestAnimationFrame = () => 0; });
      await page.evaluate(([x, y]) => { window.__zs.setPlayer(x, y); window.__zs.step(0.5); }, centre);
      const s = await state(page);
      return { p: [s.player.x, s.player.y], img: await page.evaluate(() => window.__zs.sampleScreen(233, 120, 200, 135)) };
    };
    const avec = await mesure('');
    expect(avec.p[0]).toBeCloseTo(centre[0], 3); // aucune collision ne le repousse
    expect(avec.p[1]).toBeCloseTo(centre[1], 3);
    const sans = await mesure('&percee=0');
    expect(sans.p).toEqual(avec.p);
    expect(Math.abs(sans.img.meanLuminance - avec.img.meanLuminance)).toBeLessThan(0.01);
  });
});

// Lot 9a : onglet Infini : carte jouable seulement quand son monde a été terminé en entier (progression v2, champ « mondes »). Bureau et mobile
// (garde-fou du palier complet : motif « Infini »).
test.describe('Infini après le monde terminé (lot 9a)', () => {
  test('Infini verrouillé sans monde terminé (cadenas, raison, « Jouer » désactivé et nommé, aucune écriture) ; débloqué par l\'outil de débogage, sans aucun gain ; axe ; 44 px', async ({ page }) => {
    test.setTimeout(150_000);
    await page.addInitScript(() => {
      if (sessionStorage.getItem('zs.test.infini')) return;
      sessionStorage.setItem('zs.test.infini', '1');
      localStorage.clear();
      localStorage.setItem('zs.save.v2', JSON.stringify({ v: 2, rev: 1, savedAt: 1, bleu: { gagne: 300, depense: 0 }, medailles: { gagne: 120, depense: 0, jour: 0 }, records: { histoire: { batiment: 17 }, infini: {} } }));
      window.__ecritures = [];
      const set = Storage.prototype.setItem;
      Storage.prototype.setItem = function (k, v) { window.__ecritures.push(k); return set.call(this, k, v); };
    });
    await page.setViewportSize({ width: 667, height: 375 }); // paysage (le projet mobile part en portrait)
    await page.goto('/jeu.html?test=1&menu=1&seed=1&store=local');
    await expect(page.locator('#menu-jouer')).toBeVisible({ timeout: 60_000 });
    await page.waitForFunction(() => window.__zsMenu?.etat()?.menu !== null && !document.getElementById('e7'));
    await page.locator('#menu-onglet-infini').click();
    await expect(page.locator('#menu-ecran-infini')).toBeVisible();
    const carte = page.locator('#menu-carte-batiment');
    await expect(carte).toHaveAttribute('aria-disabled', 'true');
    await expect(carte).toHaveClass(/e8-infini-carte-verrouillee/);
    await expect(carte.locator('.e8-infini-cadenas')).toHaveCount(1);
    await expect(carte.locator('.e8-infini-mini-ruban')).toHaveCount(1);
    await expect(carte.locator('.e8-infini-carte-detail')).toHaveText('Termine le monde 1 pour débloquer l\'Infini');
    await expect(carte.locator('.e8-infini-carte-libelle')).toHaveText('Monde 1 · Verrouillée');
    const jouer = page.locator('#menu-infini-jouer');
    await expect(jouer).toHaveAttribute('aria-disabled', 'true');
    await expect(jouer).toHaveAccessibleName('Jouer · verrouillé : Termine le monde 1 pour débloquer l\'Infini');
    await jouer.click({ force: true }); // désactivé (aria-disabled) : rien
    await page.waitForTimeout(300);
    await expect(page.locator('#menu-ecran-infini')).toBeVisible(); // aucune partie lancée
    expect(await page.evaluate(() => window.__ecritures.filter((k) => k === 'zs.save.v2'))).toEqual([]); // visite : aucune écriture
    for (const sel of ['#menu-infini-jouer', '#menu-carte-batiment']) {
      const r = await page.locator(sel).boundingBox();
      expect([r.width >= 44, r.height >= 44], sel).toEqual([true, true]);
    }
    expect((await new AxeBuilder({ page }).include('#menu-ecran-infini').analyze()).violations.map((v) => v.id)).toEqual([]);
    // Outil de débogage : « Marquer le monde 1 terminé » (confirmation, écriture réelle, aucun gain) ; la carte se débloque aussitôt.
    await page.locator('#menu-debogage-ouvrir').click();
    await page.locator('#menu-debogage-monde').click();
    await expect(page.locator('#menu-debogage-question')).toHaveText('Confirmer : Marquer le monde 1 terminé ?');
    await page.locator('#menu-debogage-oui').click();
    await expect(page.locator('#menu-debogage-message')).toHaveText('C\'est fait.');
    await page.keyboard.press('Escape');
    const lu = JSON.parse(await page.evaluate(() => localStorage.getItem('zs.save.v2')));
    expect([lu.mondes, lu.bleu, lu.medailles, lu.mondesFinis ?? [], lu.records.histoire]).toEqual([['batiment'], { gagne: 300, depense: 0 }, { gagne: 120, depense: 0, jour: 0 }, [], { batiment: 17 }]);
    await expect(carte).not.toHaveAttribute('aria-disabled', 'true');
    await expect(carte.locator('.e8-infini-cadenas')).toHaveCount(0);
    await expect(carte.locator('.e8-infini-carte-detail')).toHaveText('Record : —');
    await expect(carte.locator('.e8-infini-carte-libelle')).toHaveText('Monde 1 · Choisie');
    await expect(jouer).not.toHaveAttribute('aria-disabled', 'true');
    await expect(jouer).toHaveAccessibleName('Jouer');
    expect((await new AxeBuilder({ page }).include('#menu-ecran-infini').analyze()).violations.map((v) => v.id)).toEqual([]);
    // Jouable : « Jouer » lance le mode infini sur le monde 1.
    await jouer.click();
    await expect(page.locator('#game-root')).toBeVisible({ timeout: 60_000 });
    await page.waitForFunction(() => (window.__zs?.getState()?.time ?? 0) > 0.05, null, { timeout: 60_000 });
  });
});
