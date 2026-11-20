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
    await page.goto('/jeu.html?test=1&seed=2&nospawn=1&map=salle&lum=off&vhs=0&sang=0'); // sans sang : les appels ne comptent que les armes (partie L)
    await waitReady(page);
    const r = await page.evaluate(async (ids) => {
      const zs = window.__zs;
      const out = [];
      const image = () => new Promise((ok) => requestAnimationFrame(() => requestAnimationFrame(ok)));
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
        // Appels : sang, douilles et chargeurs disparus (5 s), recharges finies, puis une image fraîche (partie L : mesure déterministe).
        zs.setInput({ aim: { angle: Math.PI } });
        for (let i = 0; i < 100; i += 1) zs.step(0.05);
        await image();
        out.push({ id, tue, kills: s.kills - kills, tirs: s.shots.length - avant, premier: s.shots.slice(avant, avant + 10).map((x) => x.time), armes: s.armes, calls: zs.getState().render.calls });
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
    // Une arme en main = un appel : le même nombre d'appels pour chaque arme (même scène, même pose) ; partie L : le Kar98k en a un de plus,
    // son verrou animé (maillage enfant de l'arme).
    expect(new Set(r.map((x) => x.calls - (x.id === 'kar98k' ? 1 : 0))).size, JSON.stringify(r.map((x) => [x.id, x.calls]))).toBe(1);
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
      for (let i = 0; i < 110; i += 1) { // partie M : 0,3 s de délai après le rechargement
        zs.setInput({ aim: { angle: 0 } });
        zs.step(0.05);
        const a = zs.getState().armes;
        out.push({ t: zs.getState().time, c: a.emplacements[0].chargeur, r: a.enRecharge, tirs: zs.getState().shots.length, attente: a.attente });
      }
      return out;
    });
    const debut = r.findIndex((x) => x.r);
    expect(r[debut - 1].c).toBe(0);
    expect(r[debut - 1].tirs).toBe(7);
    const fin = r.findIndex((x, i) => i > debut && !x.r);
    expect(r[fin].t - r[debut].t).toBeCloseTo(1.4, 1);
    expect(r[fin].c).toBe(7); // chargeur plein
    expect(r.slice(debut, fin).every((x) => x.tirs === 7)).toBe(true); // pas de tir pendant le rechargement
    // Partie M : un léger délai (0,3 s) après la fin du rechargement avant le premier tir.
    const premier = r.findIndex((x, i) => i > fin && x.tirs > 7);
    expect(premier).toBeGreaterThan(fin);
    expect(r[premier].t - r[fin].t).toBeGreaterThanOrEqual(0.3 - 1e-6);
    expect(r[fin].attente).toBeGreaterThan(0);
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
  test('Colt permanent + un emplacement acheté ; molette, touche E, 1 et 2 ; ranger au rythme de l\'arme rangée, sortir au rythme de la nouvelle ; rechargement interrompu repris à la sortie suivante', async ({ page }) => {
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
    // Touche E : vers le Colt ; ranger le Garand (0,30 s, son rythme) puis sortir le Colt (0,19 s, le sien), sans tir (retour du propriétaire).
    await page.mouse.move(400, 300);
    await page.keyboard.press('KeyE');
    await page.evaluate(() => window.__zs.step(0.05));
    a = (await S(page)).armes;
    expect(a.actif).toBe('m1911');
    expect(a.sortie.ranger).toBeCloseTo(0.3, 9);
    expect(a.sortie.total).toBeCloseTo(0.49, 9);
    expect(a.peutTirer).toBe(false);
    await page.evaluate(() => { for (let i = 0; i < 10; i += 1) window.__zs.step(0.05); });
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
    await expect.poll(() => page.evaluate(() => {
      window.__zs.step(0.05);
      return window.__zs.getState().armes.actif;
    })).toBe('garand');
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
    // Retour du propriétaire (iPhone) : munitions et boutons ne se chevauchent jamais, même avec la zone de sécurité de l'iPhone en paysage
    // (≈ 59 px à droite, 21 px en bas, publiée par js/game/safe-area.js en --safe-right / --safe-bottom).
    for (const [droite, bas] of [[0, 0], [59, 21]]) {
      const boites = await page.evaluate(([d, b]) => {
        const st = document.documentElement.style;
        st.setProperty('--safe-right', `${d}px`);
        st.setProperty('--safe-bottom', `${b}px`);
        const r = (sel) => document.querySelector(sel).getBoundingClientRect();
        return { munitions: r('#hud-ammo'), changer: r('#btn-changer'), recharger: r('#btn-recharger') };
      }, [droite, bas]);
      for (const nom of ['changer', 'recharger']) {
        const m = boites.munitions;
        const k = boites[nom];
        const chevauche = m.left < k.right && m.right > k.left && m.top < k.bottom && m.bottom > k.top;
        expect(chevauche, `${nom}, zone de sécurité ${droite} / ${bas} px`).toBe(false);
        expect(m.right, `${nom}, zone de sécurité ${droite} px`).toBeLessThanOrEqual(k.left);
      }
    }
    await page.evaluate(() => {
      document.documentElement.style.removeProperty('--safe-right');
      document.documentElement.style.removeProperty('--safe-bottom');
    });
    await changer.tap();
    await page.evaluate(() => window.__zs.step(0.05));
    expect((await S(page)).armes.actif).toBe('m1911');
    await expect(changer).toHaveAttribute('aria-label', /Thompson/);
    const r = await new AxeBuilder({ page }).include('#armes-boutons').include('#hud-ammo').analyze();
    expect(r.violations.map((v) => v.id)).toEqual([]);
    expect(await page.evaluate(() => window.__ecritures.length)).toBe(0);
  });
});

// Retours du propriétaire après le lot 9e : les balles partent du bout du canon ; chaque étape du rechargement a son son, la pièce lâchée tombe
// au sol puis disparaît ; fusil à pompe et Kar98k se rechargent balle par balle (« ching » du Kar98k) ; verrou et pompe manœuvrés après le
// tir ; clip du Garand éjecté au dernier tir (« ping »).
test.describe('retours du propriétaire après le lot 9e', () => {
  test('balles du bout du canon dessiné (les huit armes, deux directions)', async ({ page }) => {
    await page.goto('/jeu.html?test=1&seed=2&nospawn=1&map=salle&lum=off&vhs=0');
    await waitReady(page);
    const r = await page.evaluate((ids) => {
      const zs = window.__zs;
      const out = [];
      for (const id of ids) {
        if (id !== 'm1911') zs.donnerArme(id);
        for (const angle of [0.7, -2.2]) {
          zs.setInput({ aim: { angle } });
          for (let i = 0; i < 30; i += 1) zs.step(0.05);
          const c = zs.getState().armes.canon;
          const n = zs.getState().bullets.length;
          zs.fire(angle);
          const b = zs.getState().bullets[n];
          out.push({ id, ecart: Math.hypot(c.logique.x - c.rendu.x, c.logique.y - c.rendu.y), balle: Math.hypot(b.x - c.logique.x, b.y - c.logique.y) });
          zs.killAll();
          for (let i = 0; i < 20; i += 1) zs.step(0.05);
        }
      }
      return out;
    }, UTILES);
    for (const x of r) {
      expect(x.ecart, x.id).toBeLessThan(1);
      expect(x.balle, x.id).toBeLessThan(0.01);
    }
  });

  test('rechargement par étapes : sons, chargeur qui tombe et disparaît ; douilles éjectées ; Kar98k balle par balle, verrou après le tir ; Garand : ping au dernier tir', async ({ page }) => {
    test.setTimeout(90_000);
    const w = watch(page);
    await page.addInitScript(espion);
    await page.goto('/jeu.html?test=1&seed=2&nospawn=1&map=salle&lum=off&vhs=0');
    await waitReady(page);
    await page.mouse.click(300, 200); // premier geste : le son démarre
    const r = await page.evaluate(() => {
      const zs = window.__zs;
      const sons = (from) => zs.getState().audio.log.filter((e) => e.gameTime >= from).map((e) => e.sound);
      const out = {};
      // Colt : sept tirs, rechargement automatique : chargeur retiré (il tombe), remis, glissière (chargeur vide).
      zs.setWaveParams({ hp: { hpLinearPerRound: 1000, hpExpStartRound: 1000, hpExpFactor: 1, hpCap: 1e9 }, damage: { factor: 1, cap: 0.0001 } });
      let p = zs.getState().player;
      zs.spawnEnemy(p.x + 150, p.y, { type: 'marcheur', gait: 'lent', wave: 3 });
      let t0 = zs.getState().time;
      for (let i = 0; i < 80 && zs.getState().armes.emplacements[0].chargeur > 0; i += 1) {
        zs.setInput({ aim: { angle: 0 } });
        zs.step(0.05);
      }
      out.coltDouilles = zs.getState().armes.douilles;
      zs.killAll();
      for (let i = 0; i < 12; i += 1) zs.step(0.05);
      out.coltPieces = zs.getState().armes.pieces;
      for (let i = 0; i < 30; i += 1) zs.step(0.05);
      out.coltSons = sons(t0);
      for (let i = 0; i < 100; i += 1) zs.step(0.05); // plus de 4 s au sol
      out.coltApres = zs.getState().armes.pieces;
      // Kar98k : un tir, verrou manœuvré (son) ; rechargement balle par balle.
      zs.donnerArme('kar98k');
      for (let i = 0; i < 30; i += 1) zs.step(0.05);
      p = zs.getState().player;
      zs.spawnEnemy(p.x + 150, p.y, { type: 'marcheur', gait: 'lent', wave: 3 });
      t0 = zs.getState().time;
      let vu = null;
      for (let i = 0; i < 40 && zs.getState().armes.emplacements[1].chargeur === 5; i += 1) {
        zs.setInput({ aim: { angle: 0 } });
        zs.step(0.05);
      }
      out.karDouillesTir = zs.getState().armes.douilles.ejectees;
      zs.killAll();
      for (let i = 0; i < 6; i += 1) {
        zs.step(0.05);
        vu = vu ?? zs.getState().armes.manoeuvre;
      }
      out.manoeuvre = vu;
      out.karDouillesVerrou = zs.getState().armes.douilles.ejectees;
      for (let i = 0; i < 20; i += 1) zs.step(0.05);
      zs.recharger();
      const charges = [];
      for (let i = 0; i < 45; i += 1) { // partie J : plus lent (0,95 + 0,5 + 0,45 s pour une cartouche)
        zs.step(0.05);
        charges.push(zs.getState().armes.emplacements[1].chargeur);
      }
      out.karCharges = [...new Set(charges)];
      out.karSons = sons(t0);
      // Garand : huit tirs, le dernier éjecte le clip (ping, il tombe).
      zs.donnerArme('garand');
      for (let i = 0; i < 30; i += 1) zs.step(0.05);
      p = zs.getState().player;
      zs.spawnEnemy(p.x + 150, p.y, { type: 'marcheur', gait: 'lent', wave: 3 });
      t0 = zs.getState().time;
      const lachees = zs.getState().armes.pieces.lachees;
      for (let i = 0; i < 80 && zs.getState().armes.emplacements[1].chargeur > 0; i += 1) {
        zs.setInput({ aim: { angle: 0 } });
        zs.step(0.05);
      }
      zs.killAll();
      zs.step(0.05);
      out.garandSons = sons(t0);
      out.garandLachees = zs.getState().armes.pieces.lachees - lachees;
      out.appels = zs.getState().render.calls;
      return out;
    });
    expect(r.coltDouilles.ejectees).toBe(7); // une douille par tir (retour du propriétaire : petites particules jaunes)
    expect(r.coltDouilles.visibles).toBeGreaterThan(0);
    expect(r.karDouillesVerrou - r.karDouillesTir).toBe(1); // Kar98k : la douille sort quand on tire le verrou, pas au coup de feu
    expect(r.coltPieces.auSol).toBe(1);
    for (const n of ['arme-chargeur-sort', 'arme-chargeur-entre', 'arme-glissiere-tiree', 'arme-tombe']) expect(r.coltSons, n).toContain(n); // partie J : glissière tirée
    expect(r.coltApres.auSol).toBe(0);
    expect(r.manoeuvre?.id).toBe('kar98k');
    expect(r.karCharges).toEqual([4, 5]); // une cartouche à la fois (un seul tir : une seule à remettre)
    for (const n of ['tir-kar98k-a', 'arme-verrou', 'arme-verrou-ouvre', 'arme-cartouche', 'arme-verrou-ferme']) expect(r.karSons, n).toContain(n);
    expect(r.karSons).not.toContain('arme-verrou-ching'); // partie I : plus de « ching »
    expect(r.garandSons).toContain('arme-ping');
    expect(r.garandLachees).toBe(1);
    expect(w.problems).toEqual([]);
    expect(await page.evaluate(() => window.__ecritures.length)).toBe(0);
  });
});

// Retours du propriétaire, partie I : la main va chercher le chargeur dans la poche (il est dans la main jusqu'à l'arme), l'arme est sans
// chargeur pendant ce temps et penchée ; pompe du Winchester entendue entre chaque tir et à la fin du rechargement ; « ping » du Garand
// seulement au dernier tir.
test.describe('rechargement animé (partie I)', () => {
  test('Thompson : chargeur retiré, main à la poche, chargeur neuf dans la main, claqué ; Winchester : pompe à chaque tir et à la fin ; Garand : pas de ping en milieu de clip', async ({ page }) => {
    test.setTimeout(90_000);
    const w = watch(page);
    await page.addInitScript(espion);
    await page.goto('/jeu.html?test=1&seed=2&nospawn=1&map=salle&lum=off&vhs=0');
    await waitReady(page);
    await page.mouse.click(300, 200); // premier geste : le son démarre
    const r = await page.evaluate(() => {
      const zs = window.__zs;
      const sons = (from) => zs.getState().audio.log.filter((e) => e.gameTime >= from).map((e) => e.sound);
      zs.setWaveParams({ hp: { hpLinearPerRound: 1000, hpExpStartRound: 1000, hpExpFactor: 1, hpCap: 1e9 }, damage: { factor: 1, cap: 0.0001 } });
      const tirer = (n, slot) => {
        const p = zs.getState().player;
        zs.spawnEnemy(p.x + 150, p.y, { type: 'marcheur', gait: 'lent', wave: 3 });
        const depart = zs.getState().armes.emplacements[slot].chargeur;
        for (let i = 0; i < 200 && depart - zs.getState().armes.emplacements[slot].chargeur < n; i += 1) {
          zs.setInput({ aim: { angle: 0 } });
          zs.step(0.05);
        }
        zs.killAll();
      };
      const out = {};
      // Thompson : rechargement à la main (chargeur pas vide).
      zs.donnerArme('thompson');
      for (let i = 0; i < 30; i += 1) zs.step(0.05);
      tirer(3, 1);
      for (let i = 0; i < 4; i += 1) zs.step(0.05);
      zs.recharger();
      const vus = [];
      for (let i = 0; i < 50; i += 1) {
        zs.step(0.05);
        vus.push(zs.getState().armes.geste);
      }
      out.cibles = [...new Set(vus.map((g) => g?.cible).filter(Boolean))];
      out.objet = vus.some((g) => g?.objet === 'chargeur-thompson');
      out.sans = vus.some((g) => g?.sansChargeur);
      out.penche = Math.max(...vus.map((g) => Math.abs(g?.cant ?? 0)));
      out.apres = zs.getState().armes.geste;
      // Winchester : trois tirs (une pompe chacun), puis rechargement (pompe à la fin).
      zs.donnerArme('winchester1897');
      for (let i = 0; i < 30; i += 1) zs.step(0.05);
      let t0 = zs.getState().time;
      tirer(3, 1);
      for (let i = 0; i < 20; i += 1) zs.step(0.05);
      out.pompesTir = sons(t0).filter((x) => x === 'arme-pompe').length;
      t0 = zs.getState().time;
      zs.recharger();
      for (let i = 0; i < 40; i += 1) zs.step(0.05);
      out.pompesFin = sons(t0).filter((x) => x === 'arme-pompe').length;
      // Garand : rechargé en milieu de clip, pas de ping.
      zs.donnerArme('garand');
      for (let i = 0; i < 30; i += 1) zs.step(0.05);
      tirer(2, 1);
      t0 = zs.getState().time;
      zs.recharger();
      for (let i = 0; i < 45; i += 1) zs.step(0.05);
      out.garandMilieu = sons(t0);
      return out;
    });
    for (const c of ['chargeur', 'poche', 'prise']) expect(r.cibles, c).toContain(c);
    expect(r.objet).toBe(true);
    expect(r.sans).toBe(true);
    expect(r.penche).toBeGreaterThan(0.2);
    expect(r.apres.objet).toBeNull();
    expect(r.apres.sansChargeur).toBe(false);
    expect(r.pompesTir).toBe(3);
    expect(r.pompesFin).toBe(1);
    expect(r.garandMilieu).not.toContain('arme-ping');
    expect(r.garandMilieu).toContain('arme-chargeur-entre');
    expect(w.problems).toEqual([]);
    expect(await page.evaluate(() => window.__ecritures.length)).toBe(0);
  });
});

// Retour du propriétaire, partie J : pas chassé (regarder en haut et marcher vers la gauche : le corps et les jambes restent tournés vers la
// visée, les jambes s'écartent sur le côté).
test('pas chassé : visée en haut, marche à gauche : le joueur reste tourné vers la visée (à 0,3 rad près), la marche est sur le côté', async ({ page }) => {
  await page.goto('/jeu.html?test=1&seed=2&nospawn=1&map=salle&lum=off&vhs=0');
  await waitReady(page);
  const r = await page.evaluate(() => {
    const zs = window.__zs;
    const out = [];
    for (const [mx, my, aim] of [[-1, 0, -Math.PI / 2], [1, 0, -Math.PI / 2], [0, -1, -Math.PI / 2], [0, 1, -Math.PI / 2]]) {
      for (let i = 0; i < 20; i += 1) {
        zs.setInput({ move: { x: mx, y: my }, aim: { angle: aim } });
        zs.step(0.05);
      }
      const p = zs.getState().anim;
      out.push({ ecart: Math.abs(Math.atan2(Math.sin(p.facing - aim), Math.cos(p.facing - aim))), avant: p.pas.avant, lateral: p.pas.lateral });
    }
    zs.setInput({ move: { x: 0, y: 0 } });
    return out;
  });
  // À gauche et à droite : pas chassé (tourné vers la visée, marche surtout sur le côté) ; vers le haut : il marche ; vers le bas : il recule.
  for (const x of r.slice(0, 2)) {
    expect(x.ecart).toBeLessThan(0.35);
    expect(Math.abs(x.lateral)).toBeGreaterThan(0.9);
  }
  expect(r[0].lateral * r[1].lateral).toBeLessThan(0); // côtés opposés
  expect(r[2].avant).toBeGreaterThan(0.9);
  expect(r[3].ecart).toBeLessThan(0.35); // recule en regardant devant lui
});

