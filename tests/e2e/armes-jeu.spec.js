// Lot 9e — Armes en main dans la partie (décisions du propriétaire : huit armes utilisables, chacune avec ses statistiques, le fusil à pompe tire
// plusieurs plombs, la vitesse du joueur dépend de l'arme en main ; le débogage donne une arme, remplit les munitions, rend les munitions
// illimitées ; une arme en main = un appel de dessin ; rien n'est écrit dans le stockage). ?test=1 : step() et le journal, jamais une durée réelle.
import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { waitReady } from './helpers.js';

const table = JSON.parse(readFileSync('data/game/armes-partie.json', 'utf8'));
const UTILES = Object.entries(table.armes).filter(([, e]) => e.active !== false).map(([id]) => id);
const S = (page) => page.evaluate(() => window.__zs.getState());

function watch(page) {
  const problems = [];
  const external = [];
  page.on('pageerror', (e) => problems.push(e.message));
  page.on('console', (m) => m.type() === 'error' && !/GL Driver Message/.test(m.text()) && problems.push(m.text()));
  page.on('request', (r) => {
    const u = r.url();
    if (!u.startsWith('http://localhost:4173/') && !u.startsWith('data:') && !u.startsWith('blob:')) external.push(u);
  });
  return { problems, external };
}

// Espion du stockage : aucune écriture (setItem, removeItem, clear).
const espion = () => {
  window.__ecritures = [];
  for (const f of ['setItem', 'removeItem', 'clear']) {
    const orig = Storage.prototype[f];
    Storage.prototype[f] = function patched(...a) {
      window.__ecritures.push(f);
      return orig.apply(this, a);
    };
  }
};

test.describe('armes en main', () => {
  test('les huit armes : chacune tire, tue un zombie, ralentit le joueur selon sa valeur ; le fusil à pompe tire 8 plombs ; même nombre d\'appels pour chaque arme', async ({ page }) => {
    test.setTimeout(120_000);
    const w = watch(page);
    await page.addInitScript(espion);
    await page.goto('/jeu.html?test=1&seed=2&nospawn=1&map=salle&lum=off&vhs=0');
    await waitReady(page);
    const r = await page.evaluate((ids) => {
      const zs = window.__zs;
      const out = [];
      for (const id of ids) {
        zs.killAll();
        zs.donnerArme(id);
        for (let i = 0; i < 30; i += 1) zs.step(0.05); // sortie de l'arme
        const p = zs.getState().player;
        const avant = zs.getState().shots.length;
        const kills = zs.getState().kills;
        const e = zs.spawnEnemy(p.x + 150, p.y, { type: 'marcheur', gait: 'lent', wave: 1 });
        let tue = false;
        for (let i = 0; i < 200 && !tue; i += 1) {
          zs.setInput({ aim: { angle: 0 } });
          zs.step(0.05);
          tue = !zs.getState().enemies.some((z) => z.id === e);
        }
        const s = zs.getState();
        out.push({ id, tue, kills: s.kills - kills, tirs: s.shots.length - avant, premier: s.shots.slice(avant, avant + 10).map((x) => x.time), armes: s.armes, calls: s.render.calls });
      }
      return out;
    }, UTILES);
    for (const x of r) {
      const e = table.armes[x.id];
      expect(x.armes.actif, x.id).toBe(x.id);
      expect(x.armes.montree, x.id).toBe(x.id);
      expect(x.armes.rendu, x.id).toEqual({ id: x.id, visible: true });
      expect(x.tue, x.id).toBe(true);
      expect(x.kills, x.id).toBe(1);
      expect(x.armes.vitesse, x.id).toBeCloseTo(220 * e.vitesse, 9);
      expect([x.armes.damage, x.armes.fireDelay, x.armes.fireRange, x.armes.plombs], x.id).toEqual([e.degats, e.cadence, e.portee, e.plombs]);
      expect(x.armes.bouche, x.id).toBeGreaterThan(26);
      expect(x.armes.triangles, x.id).toBeGreaterThan(200);
      expect(x.armes.triangles, x.id).toBeLessThanOrEqual(x.id === 'mg42' ? 700 : 400); // budgets du lot 9c (data/armes/armes.json : 400, lourde 700)
    }
    // Fusil à pompe : 8 plombs partis au même instant.
    const pompe = r.find((x) => x.id === 'winchester1897');
    expect(pompe.tirs % 8).toBe(0);
    expect(new Set(pompe.premier.slice(0, 8)).size).toBe(1);
    // Une arme en main = un appel : le même nombre d'appels pour chaque arme (même scène, même pose).
    expect(new Set(r.map((x) => x.calls)).size).toBe(1);
    expect(await page.evaluate(() => window.__ecritures.length)).toBe(0);
    expect(w.problems).toEqual([]);
    expect(w.external).toEqual([]);
  });

  test('arme en main = un appel de dessin de plus que le pistolet d\'avant (même scène, ?corps=avant)', async ({ page }) => {
    const calls = async (extra) => {
      await page.goto(`/jeu.html?test=1&seed=2&nospawn=1&map=salle&lum=off&vhs=0${extra}`);
      await waitReady(page);
      return page.evaluate(() => {
        window.__zs.setInput({ aim: { angle: 0.5 } });
        window.__zs.step(0.05);
        window.__zs.sampleScreen(0, 0, 2, 2);
        return window.__zs.getState().render.calls;
      });
    };
    const avant = await calls('&corps=avant');
    const apres = await calls('');
    expect(apres - avant).toBe(1);
  });

  test('débogage : « Donner une arme » (les huit, pas les armes spéciales), effet immédiat, rien n\'est écrit', async ({ page }) => {
    const w = watch(page);
    await page.addInitScript(espion);
    await page.goto('/jeu.html?test=1&seed=2&nospawn=1&map=salle&lum=off&vhs=0');
    await waitReady(page);
    await page.locator('#btn-pause').click();
    await page.getByRole('button', { name: 'Débogage', exact: true }).click();
    await expect(page.locator('#debug-panel')).toBeVisible();
    const boutons = page.locator('#debug-scroll [data-debug="donner-arme"] button');
    await expect(boutons).toHaveCount(8);
    expect(await boutons.evaluateAll((b) => b.map((x) => x.dataset.value))).toEqual(UTILES);
    await expect(page.locator('#debug-arme-panzerschreck')).toHaveCount(0);
    await page.locator('#debug-arme-mg42').click();
    await expect(page.locator('#debug-arme-mg42')).toHaveAttribute('aria-pressed', 'true');
    expect((await S(page)).armes.actif).toBe('mg42');
    expect(await page.evaluate(() => window.__ecritures.length)).toBe(0);
    expect(w.problems).toEqual([]);
  });
});

test.describe('chargeurs et rechargement (partie D)', () => {
  test('Colt : 7 / ∞ au HUD, rechargement automatique après 7 tirs (1,4 s, pas de tir pendant), jamais à sec ; touche R : rechargement à la main', async ({ page }) => {
    const w = watch(page);
    await page.addInitScript(espion);
    await page.goto('/jeu.html?test=1&seed=2&nospawn=1&map=salle&lum=off&vhs=0');
    await waitReady(page);
    await expect(page.locator('#hud-ammo-text')).toHaveText('7 / ∞');
    await expect(page.locator('#hud-ammo')).toBeVisible();
    const r = await page.evaluate(() => {
      const zs = window.__zs;
      const p = zs.getState().player;
      zs.setWaveParams({ hp: { hpLinearPerRound: 1000, hpExpStartRound: 1000, hpExpFactor: 1, hpCap: 1e9 }, damage: { factor: 1, cap: 0.0001 } }); // zombie qui ne tombe pas et ne blesse pas
      zs.spawnEnemy(p.x + 150, p.y, { type: 'marcheur', gait: 'lent', wave: 3 }); // manche 3 : vie × 2 001 (setWaveParams)
      const out = [];
      for (let i = 0; i < 80; i += 1) {
        zs.setInput({ aim: { angle: 0 } });
        zs.step(0.05);
        const a = zs.getState().armes;
        out.push({ t: zs.getState().time, c: a.emplacements[0].chargeur, r: a.enRecharge, tirs: zs.getState().shots.length });
      }
      return out;
    });
    const debut = r.findIndex((x) => x.r);
    expect(r[debut - 1].c).toBe(0);
    expect(r[debut - 1].tirs).toBe(7);
    const fin = r.findIndex((x, i) => i > debut && !x.r);
    expect(r[fin].t - r[debut].t).toBeCloseTo(1.4, 1);
    expect(r[fin].c + (r[fin].tirs - 7)).toBe(7); // chargeur plein (un tir peut partir au pas même où le rechargement finit)
    expect(r.slice(debut, fin).every((x) => x.tirs === 7)).toBe(true); // pas de tir pendant le rechargement
    await expect(page.locator('#hud-ammo-text')).not.toHaveText('');
    // Touche R (event.code, même lettre en AZERTY et QWERTY) : rechargement à la main d'un chargeur entamé.
    await page.evaluate(() => window.__zs.killAll());
    const c = (await S(page)).armes.emplacements[0].chargeur;
    expect(c).toBeLessThan(7);
    await page.keyboard.press('KeyR');
    await page.evaluate(() => window.__zs.step(0.05));
    expect((await S(page)).armes.enRecharge).toBe(true);
    await expect(page.locator('#hud-ammo-state')).toHaveText('Recharge');
    expect(await page.evaluate(() => window.__ecritures.length)).toBe(0);
    expect(w.problems).toEqual([]);
  });

  test('arme à sec : plus de tir, « À sec » au HUD ; « Remplir les munitions » et « Munitions illimitées » (débogage) ; ?munitions=illimitees : jamais de rechargement', async ({ page }) => {
    await page.addInitScript(espion);
    await page.goto('/jeu.html?test=1&seed=2&nospawn=1&map=salle&lum=off&vhs=0');
    await waitReady(page);
    const r = await page.evaluate(() => {
      const zs = window.__zs;
      zs.donnerArme('kar98k');
      for (let i = 0; i < 20; i += 1) zs.step(0.05);
      zs.setWaveParams({ hp: { hpLinearPerRound: 1000, hpExpStartRound: 1000, hpExpFactor: 1, hpCap: 1e9 }, damage: { factor: 1, cap: 0.0001 } }); // zombie qui ne tombe pas et ne blesse pas
      const p = zs.getState().player;
      zs.spawnEnemy(p.x + 150, p.y, { type: 'marcheur', gait: 'lent', wave: 3 }); // manche 3 : vie × 2 001 (setWaveParams), le zombie ne tombe pas
      for (let i = 0; i < 1600 && !zs.getState().armes.aSec; i += 1) {
        zs.setInput({ aim: { angle: 0 } });
        zs.step(0.05);
      }
      const a = zs.getState();
      const tirs = a.shots.length;
      for (let i = 0; i < 40; i += 1) {
        zs.setInput({ aim: { angle: 0 } });
        zs.step(0.05);
      }
      return { sec: a.armes.aSec, texte: a.armes.texte, tirs, apres: zs.getState().shots.length };
    });
    expect(r.sec).toBe(true);
    expect(r.texte).toBe('0 / 0');
    expect(r.tirs).toBe(35); // 5 dans le chargeur + 30 en réserve
    expect(r.apres).toBe(r.tirs);
    await expect(page.locator('#hud-ammo-state')).toHaveText('À sec');
    await page.evaluate(() => {
      window.__zs.killAll(); // plus de cible : la boucle d'images réelle ne tire plus
      window.__zs.remplirMunitions();
    });
    expect((await S(page)).armes.texte).toBe('5 / 30');
    await page.evaluate(() => window.__zs.munitionsIllimitees(true));
    const ill = await page.evaluate(() => {
      const zs = window.__zs;
      for (let i = 0; i < 200; i += 1) {
        zs.setInput({ aim: { angle: 0 } });
        zs.step(0.05);
      }
      return zs.getState().armes;
    });
    expect([ill.illimite, ill.enRecharge, ill.emplacements[1].chargeur]).toEqual([true, false, 5]);
    await page.goto('/jeu.html?test=1&seed=2&nospawn=1&map=salle&lum=off&vhs=0&munitions=illimitees');
    await waitReady(page);
    expect((await S(page)).armes.illimite).toBe(true);
    expect(await page.evaluate(() => window.__ecritures.length)).toBe(0);
  });
});

test.describe('emplacements et changement d\'arme (partie E)', () => {
  test('Colt permanent + un emplacement acheté ; molette, touche E, 1 et 2 ; sortie animée de la durée de l\'arme ; rechargement interrompu repris à la sortie suivante', async ({ page }) => {
    await page.addInitScript(espion);
    await page.goto('/jeu.html?test=1&seed=2&nospawn=1&map=salle&lum=off&vhs=0');
    await waitReady(page);
    await page.evaluate(() => {
      window.__zs.donnerArme('bar');
      for (let i = 0; i < 30; i += 1) window.__zs.step(0.05);
    });
    let a = (await S(page)).armes;
    expect(a.emplacements.map((e) => e.id)).toEqual(['m1911', 'bar']);
    expect(a.emplacementsMax).toBe(2);
    // Une troisième arme remplace l'arme achetée tenue, jamais le Colt.
    await page.evaluate(() => {
      window.__zs.donnerArme('garand');
      for (let i = 0; i < 30; i += 1) window.__zs.step(0.05);
    });
    a = (await S(page)).armes;
    expect(a.emplacements.map((e) => e.id)).toEqual(['m1911', 'garand']);
    // Touche E : vers le Colt ; sortie du Colt (0,38 s) sans tir.
    await page.mouse.move(400, 300);
    await page.keyboard.press('KeyE');
    await page.evaluate(() => window.__zs.step(0.05));
    a = (await S(page)).armes;
    expect(a.actif).toBe('m1911');
    expect(a.sortie.total).toBeCloseTo(0.38, 9);
    expect(a.peutTirer).toBe(false);
    await page.evaluate(() => { for (let i = 0; i < 8; i += 1) window.__zs.step(0.05); });
    expect((await S(page)).armes.sortie).toBeNull();
    // 2 : l'arme achetée ; 1 : le Colt ; molette : l'autre.
    await page.keyboard.press('Digit2');
    await page.evaluate(() => { for (let i = 0; i < 14; i += 1) window.__zs.step(0.05); });
    expect((await S(page)).armes.actif).toBe('garand');
    await page.keyboard.press('Digit1');
    await page.evaluate(() => window.__zs.step(0.05));
    expect((await S(page)).armes.actif).toBe('m1911');
    await page.evaluate(() => { for (let i = 0; i < 10; i += 1) window.__zs.step(0.05); });
    await page.mouse.wheel(0, 120);
    await page.evaluate(() => window.__zs.step(0.05));
    expect((await S(page)).armes.actif).toBe('garand');
    // Rechargement interrompu par un changement, gardé, repris à la sortie suivante.
    const reprise = await page.evaluate(() => {
      const zs = window.__zs;
      for (let i = 0; i < 14; i += 1) zs.step(0.05);
      zs.setWaveParams({ hp: { hpLinearPerRound: 1000, hpExpStartRound: 1000, hpExpFactor: 1, hpCap: 1e9 }, damage: { factor: 1, cap: 0.0001 } }); // zombie qui ne tombe pas et ne blesse pas
      const p = zs.getState().player;
      zs.spawnEnemy(p.x + 150, p.y, { type: 'marcheur', gait: 'lent', wave: 3 }); // manche 3 : vie × 2 001 (setWaveParams), le zombie ne tombe pas
      for (let i = 0; i < 30; i += 1) {
        zs.setInput({ aim: { angle: 0 } });
        zs.step(0.05);
      }
      zs.killAll();
      zs.recharger();
      for (let i = 0; i < 10; i += 1) zs.step(0.05);
      const avant = zs.getState().armes.emplacements[1].recharge;
      zs.changerArme();
      for (let i = 0; i < 10; i += 1) zs.step(0.05);
      const garde = zs.getState().armes.emplacements[1].recharge;
      zs.changerArme();
      for (let i = 0; i < 14; i += 1) zs.step(0.05);
      return { avant, garde, enRecharge: zs.getState().armes.enRecharge };
    });
    expect(reprise.avant).toBeGreaterThan(0.4);
    expect(reprise.garde).toBeCloseTo(reprise.avant, 9);
    expect(reprise.enRecharge).toBe(true);
    expect(await page.evaluate(() => window.__ecritures.length)).toBe(0);
  });
});

test.describe('bouton de changement sur téléphone (partie E)', () => {
  test.use({ hasTouch: true, isMobile: true, viewport: { width: 812, height: 375 } });
  test('boutons « Changer » (visuel 2D de l\'autre arme) et « Recharger » près du stick droit : 44 px au moins, dans l\'écran, actifs au doigt ; axe sans violation', async ({ page }) => {
    const { default: AxeBuilder } = await import('@axe-core/playwright');
    await page.addInitScript(espion);
    await page.goto('/jeu.html?test=1&seed=2&nospawn=1&map=salle&lum=off&vhs=0');
    await waitReady(page);
    // Passage au toucher : un doigt posé puis levé sur la zone de jeu.
    await page.touchscreen.tap(200, 300);
    await expect(page.locator('#game-root')).toHaveAttribute('data-input', 'touch');
    await expect(page.locator('#btn-recharger')).toBeVisible();
    await expect(page.locator('#btn-changer')).toBeHidden(); // une seule arme : rien à changer
    await page.evaluate(() => {
      window.__zs.donnerArme('thompson');
      for (let i = 0; i < 20; i += 1) window.__zs.step(0.05);
    });
    const changer = page.locator('#btn-changer');
    await expect(changer).toBeVisible();
    await expect(changer).toHaveAttribute('aria-label', /Colt M1911/);
    await expect(changer.locator('svg.arm-svg')).toHaveCount(1);
    for (const id of ['#btn-changer', '#btn-recharger']) {
      const b = await page.locator(id).boundingBox();
      expect(b.width, id).toBeGreaterThanOrEqual(44);
      expect(b.height, id).toBeGreaterThanOrEqual(44);
      expect(b.x + b.width, id).toBeLessThanOrEqual(812);
      expect(b.y + b.height, id).toBeLessThanOrEqual(375);
    }
    await changer.tap();
    await page.evaluate(() => window.__zs.step(0.05));
    expect((await S(page)).armes.actif).toBe('m1911');
    await expect(changer).toHaveAttribute('aria-label', /Thompson/);
    const r = await new AxeBuilder({ page }).include('#armes-boutons').include('#hud-ammo').analyze();
    expect(r.violations.map((v) => v.id)).toEqual([]);
    expect(await page.evaluate(() => window.__ecritures.length)).toBe(0);
  });
});
