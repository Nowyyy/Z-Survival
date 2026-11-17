import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { readFileSync } from 'node:fs';
import { buildLayouts } from '../../js/core/layout.js';
import { parseZones, zonesToWorld } from '../../js/core/zones.js';
import { distanceToRect } from '../../js/core/collision.js';
import { sacsBoxes } from '../../js/core/decor-interieur.js';
import { CHAMPS_STOCKES } from '../../js/core/progression.js';
import { nomsDuCode, waitReady } from './helpers.js';

// Lot 9a (Docs/ref/debut-v09.md) : message des portes à deux cases ; rotor de queue de l'hélicoptère (temps de jeu, figé en pause, immobile sous
// mouvement réduit) ; sol « en bois » de la capture du propriétaire : sacs de sable, solides et en toile de jute depuis le lot 9a-I. ?test=1, step() et
// positions de test (setPlayer) ; aucune durée réelle attendue.
const json = (p) => JSON.parse(readFileSync(p, 'utf8'));
const D = 'data/game/maps/rez-de-chaussee/';
const world = json(`${D}world.json`);
const LAYOUTS = buildLayouts({ rdc: { world, decor: json(`${D}decor.json`) }, etage: { world: json(`${D}etage.world.json`) }, zones: zonesToWorld(parseZones(json(`${D}zones.json`)), world.transform) });
const bloc = (id) => LAYOUTS.doors.find((d) => d.id === id).blocks.rdc[0].rect;
const DISTANCE = json('data/game/reglages-partie.json').porte.distance;
const VITESSE = json('data/game/reglages-partie.json').helicoptere.rotorDegParSeconde;
const SACS = world.obstacles.filter((o) => o.kind === 'sacs'); // lot 9a-I : obstacles de world.json (décor solide)
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

  // Lot 9a-I (décision du propriétaire) : les sacs de sable sont solides et en toile de jute, à tous les réglages graphiques (avant : décor léger,
  // traversable, absent en Faible).
  test('sacs de sable solides : le joueur s\'arrête contre eux et passe entre eux et le mur nord, même trajet en Élevé, en Faible et sans détail ; dessinés en toile de jute à chaque réglage', async ({ page }) => {
    expect(SACS.map((o) => o.id)).toEqual(['sacs-1', 'sacs-2']);
    const s1 = SACS[0];
    const essai = async (extra) => {
      await open(page, `/jeu.html?test=1&seed=1&nospawn=1&vhs=0${extra}`);
      await page.evaluate(() => { window.requestAnimationFrame = () => 0; });
      const p = await page.evaluate((o) => {
        const zs = window.__zs;
        zs.setPlayer(o.x + o.w / 2, o.y + o.h + 80); // au sud des sacs, puis vers le nord (vers le mur, à travers les sacs s'ils ne bloquaient pas)
        zs.setInput({ move: { x: 0, y: -1 } });
        zs.step(2);
        zs.setInput({});
        const pl = zs.getState().player;
        const devant = [Math.round(pl.x * 100) / 100, Math.round(pl.y * 100) / 100];
        // Retour du propriétaire : passage de 50 entre les sacs et le mur nord : le joueur le traverse d'ouest en est.
        zs.setPlayer(o.x - 40, o.y - 25);
        zs.setInput({ move: { x: 1, y: 0 } });
        zs.step(1.2);
        zs.setInput({});
        const q = zs.getState().player;
        return { devant, derriere: [Math.round(q.x * 100) / 100, Math.round(q.y * 100) / 100] };
      }, s1);
      const sacs = (await state(page)).scene.sacs;
      return { p, sacs };
    };
    const eleve = await essai('&gfx=eleve');
    expect(eleve.p.devant[1]).toBeGreaterThan(s1.y + s1.h); // arrêté au bord sud des sacs
    expect(eleve.p.devant[1]).toBeLessThan(s1.y + s1.h + 40);
    expect(eleve.p.derriere[0]).toBeGreaterThan(SACS[1].x + SACS[1].w / 2); // passé derrière les sacs (au moins au milieu du second tas)
    expect(eleve.p.derriere[1]).toBeLessThan(s1.y); // toujours entre les sacs et le mur
    for (const extra of ['&gfx=faible', '&detail=0']) {
      const r = await essai(extra);
      expect(r.p, extra).toEqual(eleve.p); // la collision ne dépend pas des réglages graphiques
      expect(r.sacs.length, extra).toBeGreaterThan(0);
    }
    expect(eleve.sacs.length).toBeGreaterThan(0);
    expect(eleve.sacs.every((m) => m.texture && m.floor === 'rdc')).toBe(true);
    expect(eleve.sacs.some((m) => m.drawn)).toBe(true);
    expect(eleve.sacs.reduce((n, m) => n + m.triangles, 0)).toBe(SACS.reduce((n, o) => n + 10 * sacsBoxes(o, { alongX: true }).length, 0)); // 10 triangles par boîte (sans dessous) ; sacs le long du mur nord
  });
});

// Retour du propriétaire après le lot 9a : téléphone tourné plusieurs fois ou passage par une autre appli : les commandes ne répondaient plus. Un
// doigt posé quand la page part en arrière-plan ne reçoit jamais son « pointerup » : son stick restait pris et ignorait les touchers suivants.
test.describe('rotation et arrière-plan (retour après le lot 9a)', () => {
  const toucher = (page, type, id, x, y) => page.evaluate(([t, i, cx, cy]) => {
    document.getElementById('game-root').dispatchEvent(new PointerEvent(t, { pointerType: 'touch', pointerId: i, clientX: cx, clientY: cy, bubbles: true, cancelable: true, isPrimary: true }));
  }, [type, id, x, y]);
  const stick = (page) => page.locator('#stick-left').evaluate((n) => ({ idle: n.classList.contains('is-idle'), t: n.style.transform }));
  test('stick relâché quand la page passe en arrière-plan ; après trois rotations, les sticks au repos suivent la taille et « Pause » répond à sa place', async ({ page }) => {
    await open(page, '/jeu.html?test=1&seed=1&nospawn=1');
    // Un doigt pose le stick gauche, puis la page passe en arrière-plan sans « pointerup ».
    await toucher(page, 'pointerdown', 7, 100, 250);
    expect(await stick(page)).toEqual({ idle: false, t: 'translate(100px, 250px)' });
    await page.evaluate(() => {
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
      document.dispatchEvent(new Event('visibilitychange'));
      delete document.hidden;
      document.dispatchEvent(new Event('visibilitychange'));
    });
    // Au retour, un nouveau doigt reprend le stick (avant : ignoré tant que l'ancien doigt n'était pas relâché).
    await toucher(page, 'pointerdown', 9, 150, 260);
    expect(await stick(page)).toEqual({ idle: false, t: 'translate(150px, 260px)' });
    await toucher(page, 'pointerup', 9, 150, 260);
    // La page cachée a mis la partie en pause (comportement d'avant) : « Reprendre » répond.
    await expect(page.locator('#pause-panel')).toBeVisible();
    await page.locator('#btn-resume').click();
    await expect(page.locator('#pause-panel')).toBeHidden();
    // Trois allers-retours portrait / paysage.
    for (let i = 0; i < 3; i += 1) {
      await page.setViewportSize({ width: 375, height: 667 });
      await page.evaluate(() => window.dispatchEvent(new Event('orientationchange')));
      await page.setViewportSize({ width: 667, height: 375 });
      await page.evaluate(() => window.dispatchEvent(new Event('orientationchange')));
    }
    await images(page, 6);
    const r = await page.evaluate(() => {
      const b = document.getElementById('btn-pause').getBoundingClientRect();
      const cible = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2);
      return { scroll: [window.scrollX, window.scrollY], pause: cible?.closest('#btn-pause') !== null, largeur: window.innerWidth };
    });
    expect(r).toEqual({ scroll: [0, 0], pause: true, largeur: 667 });
    // Sticks au repos (dernier type d'entrée : tactile) replacés à la taille du moment : 16 % de la largeur, 68 % de la hauteur.
    const repos = await stick(page);
    expect(repos.idle).toBe(true);
    expect(repos.t.match(/-?[\d.]+/g).map(Number).map((v) => Math.round(v * 100) / 100)).toEqual([Math.round(667 * 0.16 * 100) / 100, Math.round(375 * 0.68 * 100) / 100]);
    await page.locator('#btn-pause').click();
    await expect(page.locator('#pause-panel')).toBeVisible();
  });
});

// Lot 9a : onglet Infini : carte jouable seulement quand son monde a été terminé en entier (progression v2, champ « mondes »). Bureau et mobile
// (garde-fou du palier complet : motif « Infini »).
test.describe('Infini après le monde terminé (lot 9a)', () => {
  test('Infini verrouillé sans monde terminé (cadenas, raison, « Jouer » désactivé et nommé, aucune écriture) ; débloqué par l\'outil de débogage, sans aucun gain ; axe ; 44 px', async ({ page }) => {
    test.setTimeout(150_000);
    // Lot 9b : progression posée telle que le stockage la garde (champs stockés de la table CHAMPS_STOCKES).
    const depart = { v: 2, rev: 1, savedAt: 1, [CHAMPS_STOCKES.medailles]: { gagne: 300, depense: 0 }, [CHAMPS_STOCKES.diamants]: { gagne: 120, depense: 0, jour: 0 }, records: { histoire: { batiment: 17 }, infini: {} } };
    await page.addInitScript((texte) => {
      if (sessionStorage.getItem('zs.test.infini')) return;
      sessionStorage.setItem('zs.test.infini', '1');
      localStorage.clear();
      localStorage.setItem('zs.save.v2', texte);
      window.__ecritures = [];
      const set = Storage.prototype.setItem;
      Storage.prototype.setItem = function (k, v) { window.__ecritures.push(k); return set.call(this, k, v); };
    }, JSON.stringify(depart));
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
    await expect(carte.locator('.e8-infini-carte-detail')).toHaveText('Termine le monde 1 pour débloquer'); // retour du propriétaire après le lot 9a (avant : « … pour débloquer l'Infini »)
    await expect(carte.locator('.e8-infini-carte-libelle')).toHaveText('Monde 1 · Verrouillée');
    const jouer = page.locator('#menu-infini-jouer');
    await expect(jouer).toHaveAttribute('aria-disabled', 'true');
    await expect(jouer).toHaveAccessibleName('Jouer · verrouillé : Termine le monde 1 pour débloquer');
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
    const lu = nomsDuCode(JSON.parse(await page.evaluate(() => localStorage.getItem('zs.save.v2'))));
    expect([lu.mondes, lu.medailles, lu.diamants, lu.mondesFinis ?? [], lu.records.histoire]).toEqual([['batiment'], { gagne: 300, depense: 0 }, { gagne: 120, depense: 0, jour: 0 }, [], { batiment: 17 }]);
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
