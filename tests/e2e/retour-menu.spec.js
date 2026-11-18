// Lot 9d : retour au menu sans rechargement (Docs/ref/retour-menu.md). Une partie libérée ne laisse rien : contexte WebGL, rappels d'image,
// minuteries, calculateur, canal entre onglets, écouteurs de window / document / body, mémoire Three.js ; le tas reste borné.
import { test, expect } from '@playwright/test';
import { nomsDuCode, poserProgression, progressionDemo, waitReady } from './helpers.js';
import { RETOUR_SANS_RECHARGEMENT } from '../../js/core/menu-etat.js'; // lot 9d : option à l'essai

const DEMONTEE = 'retour sans rechargement démonté (RETOUR_SANS_RECHARGEMENT = false, js/core/menu-etat.js)';

// Compteurs injectés avant tout script : contextes WebGL vivants (références faibles), setInterval actifs, rappels d'image en attente,
// calculateurs, canaux entre onglets.
function instrumenter() {
  const ctxs = [];
  const get = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (type, ...a) {
    const c = get.call(this, type, ...a);
    if (c && /webgl/.test(type) && !ctxs.some((w) => w.deref() === c)) ctxs.push(new WeakRef(c));
    return c;
  };
  const intervals = new Set();
  const si = window.setInterval.bind(window);
  const ci = window.clearInterval.bind(window);
  window.setInterval = (...a) => {
    const id = si(...a);
    intervals.add(id);
    return id;
  };
  window.clearInterval = (id) => {
    intervals.delete(id);
    return ci(id);
  };
  const rafs = new Set();
  const raf = window.requestAnimationFrame.bind(window);
  const caf = window.cancelAnimationFrame.bind(window);
  window.requestAnimationFrame = (f) => {
    const id = raf((t) => {
      rafs.delete(id);
      f(t);
    });
    rafs.add(id);
    return id;
  };
  window.cancelAnimationFrame = (id) => {
    rafs.delete(id);
    return caf(id);
  };
  const workers = new Set();
  const W = window.Worker;
  window.Worker = class extends W {
    constructor(...a) {
      super(...a);
      workers.add(this);
    }
    terminate() {
      workers.delete(this);
      return super.terminate();
    }
  };
  const canaux = new Set();
  const B = window.BroadcastChannel;
  window.BroadcastChannel = class extends B {
    constructor(...a) {
      super(...a);
      canaux.add(this);
    }
    close() {
      canaux.delete(this);
      return super.close();
    }
  };
  window.__ressources = () => ({
    webgl: ctxs.filter((w) => w.deref() && !w.deref().isContextLost()).length,
    intervals: intervals.size, raf: rafs.size, workers: workers.size, canaux: canaux.size, canvas: document.querySelectorAll('canvas').length,
  });
}

// Écouteurs posés sur window, document et body (protocole de débogage de Chrome) et tas après ramasse-miettes (Mo).
async function sonde(page) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Performance.enable');
  return async () => {
    await cdp.send('HeapProfiler.collectGarbage');
    const ecouteurs = {};
    for (const expr of ['window', 'document', 'document.body']) {
      const { result } = await cdp.send('Runtime.evaluate', { expression: expr });
      ecouteurs[expr] = (await cdp.send('DOMDebugger.getEventListeners', { objectId: result.objectId })).listeners.length;
    }
    const m = Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map((x) => [x.name, x.value]));
    return { ...(await page.evaluate(() => window.__ressources())), ecouteurs, tasMo: m.JSHeapUsedSize / 1048576, zs: await page.evaluate(() => typeof window.__zs) };
  };
}

const enJeu = (page) => page.waitForFunction(() => (window.__zs?.getState()?.time ?? 0) > 0.05, null, { timeout: 120_000 });
// Navigations de la page principale (le retour au menu n'en fait aucune ; le filet de sécurité, une).
function navigations(page) {
  const n = { v: 0 };
  page.on('framenavigated', (f) => {
    if (f === page.mainFrame()) n.v += 1;
  });
  return n;
}

test.describe('lot 9d : libération de la partie', () => {
  test('partie directe : trois cycles partie → libération → nouvelle partie dans la même page (libération appelée directement, window.__zsCycle) : rien ne reste, mémoire Three.js à 0 @lent', async ({ page }) => {
    test.setTimeout(240_000);
    const erreurs = [];
    page.on('pageerror', (e) => erreurs.push(String(e)));
    page.on('console', (m) => m.type() === 'error' && erreurs.push(m.text()));
    await page.setViewportSize({ width: 932, height: 430 });
    await page.addInitScript(instrumenter);
    await page.goto('/jeu.html?test=1&seed=1');
    await waitReady(page);
    const mesurer = await sonde(page);
    let reference = null;
    for (let i = 0; i < 3; i += 1) {
      if (i > 0) {
        await page.evaluate(() => window.__zsCycle.demarrer());
        await waitReady(page);
      }
      await page.evaluate(() => window.__zs.step(1));
      const jeu = await page.evaluate(() => window.__ressources());
      expect([jeu.webgl, jeu.canvas], `cycle ${i + 1} : un seul contexte WebGL vivant pendant la partie`).toEqual([1, 1]);
      const rapport = await page.evaluate(() => window.__zsCycle.liberer());
      expect(rapport, `cycle ${i + 1}`).toEqual({ memoire: { geometries: 0, textures: 0 }, contextePerdu: true, erreurs: [] });
      const apres = await mesurer();
      expect({ webgl: apres.webgl, intervals: apres.intervals, raf: apres.raf, workers: apres.workers, canaux: apres.canaux, canvas: apres.canvas, zs: apres.zs }, `cycle ${i + 1}`)
        .toEqual({ webgl: 0, intervals: 0, raf: 0, workers: 0, canaux: 0, canvas: 0, zs: 'undefined' });
      reference ??= apres.ecouteurs;
      expect(apres.ecouteurs, `cycle ${i + 1} : écouteurs revenus à ceux de la page sans partie`).toEqual(reference);
    }
    // La page sans partie garde seulement ses propres écouteurs (jeu.html) et ceux de l'outil de test.
    expect(reference.document).toBe(0);
    expect(reference['document.body']).toBe(0);
    expect(erreurs).toEqual([]);
  });

  // Palier standard : deux cycles (« Quitter », puis la mort ; budget de durée) ; palier complet (@lent) : les dix cycles de la garantie.
  for (const [N, nom] of [[2, 'deux'], [10, 'dix']]) test(`${nom} cycles « JOUER » → partie → « Quitter » ou mort puis « Revenir au menu principal » (en alternance), sans rechargement : un seul contexte WebGL en partie, aucun au menu, rien ne reste, tas borné ; filet de sécurité écrit dans la console${N === 10 ? ' @lent' : ''}`, async ({ page }) => {
    test.skip(!RETOUR_SANS_RECHARGEMENT, DEMONTEE);
    test.setTimeout(300_000);
    const erreurs = [];
    page.on('pageerror', (e) => erreurs.push(String(e)));
    page.on('console', (m) => m.type() === 'error' && erreurs.push(m.text()));
    await page.setViewportSize({ width: 932, height: 430 });
    await page.addInitScript(instrumenter);
    const nav = navigations(page);
    await page.goto('/jeu.html?test=1&menu=1&seed=1');
    await expect(page.locator('#menu-jouer')).toBeVisible({ timeout: 60_000 });
    const mesurer = await sonde(page);
    let reference = null;
    let tas1 = null;
    for (let i = 0; i < N; i += 1) {
      await page.locator('#menu-jouer').click();
      await enJeu(page);
      const jeu = await page.evaluate(() => window.__ressources());
      expect([jeu.webgl, jeu.canvas], `cycle ${i + 1} : un seul contexte WebGL vivant pendant la partie`).toEqual([1, 1]);
      expect(await page.locator('#e8').count(), `cycle ${i + 1} : menu détruit pendant la partie`).toBe(0);
      if (i % 2 === 0) {
        await page.locator('#btn-pause').click();
        await page.locator('#btn-quit').click();
        await page.locator('#btn-quit-ok').click();
      } else {
        await page.evaluate(() => { const zs = window.__zs; zs.setChutes(0); zs.downPlayer(); zs.step(0.3); });
        await expect(page.locator('#end-panel')).toBeVisible();
        await page.locator('#btn-menu').click();
      }
      await expect(page.locator('#menu-jouer')).toBeVisible({ timeout: 60_000 });
      expect(await page.evaluate(() => window.__zsCycle.derniereLiberation()), `cycle ${i + 1}`).toEqual({ memoire: { geometries: 0, textures: 0 }, contextePerdu: true, erreurs: [] });
      const apres = await mesurer();
      expect({ webgl: apres.webgl, canvas: apres.canvas, zs: apres.zs, menu: await page.evaluate(() => window.__zsMenu.etat().phase), menus: await page.locator('#e8').count() }, `cycle ${i + 1}`).toEqual({ webgl: 0, canvas: 0, zs: 'undefined', menu: 'menu', menus: 1 });
      // Au menu, après le premier retour : sons du menu (un contexte, son calculateur, sa minuterie) ; ensuite, plus rien ne s'ajoute.
      const etat = { intervals: apres.intervals, raf: apres.raf, workers: apres.workers, canaux: apres.canaux, ecouteurs: apres.ecouteurs };
      reference ??= etat;
      expect(etat, `cycle ${i + 1} : revenu à l'état du menu`).toEqual(reference);
      tas1 ??= apres.tasMo;
      if (i === N - 1) expect(apres.tasMo - tas1, `croissance du tas entre le 1er et le ${N}e retour (Mo)`).toBeLessThan(4);
    }
    expect([reference.canaux, reference.workers <= 1, reference.raf]).toEqual([0, true, 0]);
    expect(nav.v).toBe(1); // le chargement de la page seulement
    expect(erreurs).toEqual([]);
    // Filet de sécurité : libération forcée en échec → le cas est écrit dans la console, puis retour par rechargement (#retour).
    await page.locator('#menu-jouer').click();
    await enJeu(page);
    await page.evaluate(() => window.__zsCycle.echec());
    await page.locator('#btn-pause').click();
    await page.locator('#btn-quit').click();
    const rechargement = page.waitForEvent('framenavigated', { predicate: (f) => f === page.mainFrame() });
    await page.locator('#btn-quit-ok').click();
    expect((await rechargement).url()).toMatch(/[?&]menu=1.*#retour$/);
    await expect(page.locator('#menu-jouer')).toBeVisible({ timeout: 60_000 });
    expect(erreurs.length).toBe(1);
    expect(erreurs[0]).toContain('Retour au menu : libération incomplète, retour par rechargement (filet de sécurité).');
  });

  test('deuxième partie = première : « JOUER », « Quitter », « JOUER » (même graine) : mêmes empreintes logiques pas à pas, mêmes réglages, mêmes appels et triangles', async ({ page }) => {
    test.skip(!RETOUR_SANS_RECHARGEMENT, DEMONTEE);
    test.setTimeout(180_000);
    // Onglet « caché » : la boucle d'images ne tourne pas, seule step() fait avancer la partie (même méthode que scripts/perf/trace-logique.mjs).
    await page.addInitScript(() => Object.defineProperty(Document.prototype, 'hidden', { get: () => true, configurable: true }));
    await page.setViewportSize({ width: 932, height: 430 });
    await page.goto('/jeu.html?test=1&menu=1&seed=1');
    await expect(page.locator('#menu-jouer')).toBeVisible({ timeout: 60_000 });
    const jouer = async () => {
      await page.locator('#menu-jouer').click();
      await page.waitForFunction(() => window.__zs?.getState(), null, { timeout: 120_000 });
      return page.evaluate(async () => {
        const zs = window.__zs;
        const empreintes = [];
        const texte = (st) => JSON.stringify([st.time, st.player, st.kills, st.waves.wave, st.waves.phase, st.waves.alive, st.enemies.map((e) => [e.id, e.x, e.y, e.health, e.mode, e.window]), st.bullets.map((b) => [b.x, b.y, b.angle]), st.economy, st.aim, st.camera]);
        for (let i = 0; i < 300; i += 1) {
          zs.setInput({ move: { x: Math.cos(i / 40), y: Math.sin(i / 55) }, aim: { angle: i / 30 } });
          zs.step(0.05);
          const octets = new TextEncoder().encode(texte(zs.getState()));
          empreintes.push(Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', octets)).slice(0, 8), (b) => b.toString(16).padStart(2, '0')).join(''));
        }
        zs.sampleScreen(0, 0, 8, 8);
        const st = zs.getState();
        return { empreintes, graphics: st.graphics, rendu: { calls: st.render.calls, triangles: st.render.triangles }, tues: st.kills, zombies: st.enemies.length };
      });
    };
    const premiere = await jouer();
    expect(premiere.zombies + premiere.tues).toBeGreaterThan(0); // la manche a vraiment commencé
    await page.locator('#btn-pause').click();
    await page.locator('#btn-quit').click();
    await page.locator('#btn-quit-ok').click();
    await expect(page.locator('#menu-jouer')).toBeVisible({ timeout: 60_000 });
    const seconde = await jouer();
    const ecart = seconde.empreintes.findIndex((e, i) => e !== premiere.empreintes[i]);
    expect(ecart, 'premier pas différent').toBe(-1);
    expect([seconde.graphics, seconde.rendu]).toEqual([premiere.graphics, premiere.rendu]);
  });

  test('plein écran conservé après « Quitter » et après la mort (sans rechargement de la page) ; menu neuf (écran de chargement, onglet Jouer, comme au lancement) ; musique des menus relancée ; soldes et record relus ; après l\'Infini, « JOUER » en mode histoire', async ({ page }) => {
    test.skip(!RETOUR_SANS_RECHARGEMENT, DEMONTEE);
    test.setTimeout(180_000);
    await poserProgression(page, progressionDemo({ medailles: 1000, diamants: 0, extra: { mondes: ['batiment'] } }));
    await page.setViewportSize({ width: 932, height: 430 });
    const nav = navigations(page);
    await page.goto('/jeu.html?test=1&menu=1&seed=1&ouverture=0&store=local');
    await expect(page.locator('#menu-jouer')).toBeVisible({ timeout: 60_000 });
    await page.locator('#menu-plein-ecran').click();
    await page.waitForFunction(() => Boolean(document.fullscreenElement));
    // Onglet Infini (monde 1 terminé) : « Jouer » lance l'infini ; « Quitter » : menu neuf (écran de chargement, puis onglet Jouer), toujours en
    // plein écran ; le menu d'avant (onglet Infini) a été détruit à « Jouer ».
    await page.locator('#menu-onglet-infini').click();
    await expect(page.locator('#menu-ecran-infini')).toBeVisible();
    await page.locator('#menu-infini-jouer').click();
    await enJeu(page);
    expect(await page.evaluate(() => [window.__zs.getState().mode, Boolean(document.fullscreenElement)])).toEqual(['infini', true]);
    await page.locator('#btn-pause').click();
    await page.locator('#btn-quit').click();
    await page.locator('#btn-quit-ok').click();
    await expect(page.locator('#e7')).toBeVisible();
    await expect(page.locator('#menu-jouer')).toBeVisible({ timeout: 60_000 });
    expect([await page.locator('#e8').count(), await page.locator('#menu-ecran-infini').count()]).toEqual([1, 0]);
    const lire = () => page.evaluate(() => {
      const e = window.__zsMenu.etat();
      const s = window.__zsMenu.sons();
      return { plein: Boolean(document.fullscreenElement), onglet: e.menu.onglet, solde: e.menu.solde, record: e.menu.record, musique: s.musique.mode, contexte: s.contexte, partie: s.faits.partie };
    });
    await expect.poll(async () => (await lire()).musique, { timeout: 20_000 }).toBe('joue');
    expect(await lire()).toMatchObject({ plein: true, onglet: 'jouer', solde: 1000, musique: 'joue', contexte: 'running', partie: false });
    // « JOUER » : mode histoire (l'option infini de la partie précédente ne reste pas) ; manche 1 finie (+20 médailles), mort, retour.
    await page.locator('#menu-jouer').click();
    await enJeu(page);
    expect(await page.evaluate(() => window.__zs.getState().mode)).toBe('histoire');
    await page.evaluate(() => { const zs = window.__zs; zs.step(3.2); zs.skipWave(); zs.step(0.2); zs.setChutes(0); zs.downPlayer(); zs.step(0.3); });
    await expect(page.locator('#end-panel')).toBeVisible();
    await page.locator('#btn-menu').click();
    await expect(page.locator('#menu-jouer')).toBeVisible({ timeout: 60_000 });
    await expect.poll(async () => (await lire()).musique, { timeout: 20_000 }).toBe('joue');
    const apres = await lire();
    const lu = nomsDuCode(JSON.parse(await page.evaluate(() => localStorage.getItem('zs.save.v2'))));
    expect(apres).toMatchObject({ plein: true, onglet: 'jouer', solde: lu.medailles.gagne - lu.medailles.depense, record: lu.records.histoire.batiment });
    expect(apres.solde).toBe(1020);
    await expect(page.locator('#menu-solde-texte')).toHaveText(`1${String.fromCharCode(0x202f)}020`);
    expect(nav.v).toBe(1);
  });

  // Option démontable (demande du propriétaire) : rechargement exactement comme avant le lot 9d, choisi pour la page par __zsCycle.rechargement()
  // (ou pour tout le jeu par RETOUR_SANS_RECHARGEMENT = false) : aucun message dans la console (ce n'est pas un échec), repère #retour.
  test('option démontée : « Quitter » revient au menu par rechargement comme avant le lot 9d (#retour, retiré aussitôt), sans message dans la console', async ({ page }) => {
    test.setTimeout(120_000);
    const erreurs = [];
    page.on('console', (m) => m.type() === 'error' && erreurs.push(m.text()));
    await page.setViewportSize({ width: 932, height: 430 });
    await page.goto('/jeu.html?test=1&menu=1&seed=1');
    await expect(page.locator('#menu-jouer')).toBeVisible({ timeout: 60_000 });
    await page.locator('#menu-jouer').click();
    await enJeu(page);
    await page.evaluate(() => window.__zsCycle.rechargement());
    await page.locator('#btn-pause').click();
    await page.locator('#btn-quit').click();
    const rechargement = page.waitForEvent('framenavigated', { predicate: (f) => f === page.mainFrame() });
    await page.locator('#btn-quit-ok').click();
    expect((await rechargement).url()).toMatch(/[?&]menu=1.*#retour$/);
    await expect(page.locator('#menu-jouer')).toBeVisible({ timeout: 60_000 });
    expect([new URL(page.url()).hash, erreurs]).toEqual(['', []]);
  });

  // Demande du propriétaire : les données de la partie arrivent bien dans le menu neuf (vrai stockage, ?store=local) ; vaut aussi avec l'option
  // démontée (rechargement) : le menu affiché après le retour est comparé à la sauvegarde écrite par la partie.
  test('données de la partie dans le menu neuf : médailles et diamants de l\'en-tête, record de l\'onglet Jouer, statistiques du Profil ; monde terminé : Infini débloqué', async ({ page }) => {
    test.setTimeout(240_000);
    await poserProgression(page, progressionDemo({ medailles: 1000, diamants: 0 }));
    await page.setViewportSize({ width: 932, height: 430 });
    await page.goto('/jeu.html?test=1&menu=1&seed=1&ouverture=0&store=local');
    await expect(page.locator('#menu-jouer')).toBeVisible({ timeout: 60_000 });
    const sauvegarde = async () => nomsDuCode(JSON.parse(await page.evaluate(() => localStorage.getItem('zs.save.v2'))));
    const menuPret = async () => {
      await expect(page.locator('#menu-jouer')).toBeVisible({ timeout: 60_000 });
      await page.waitForFunction(() => !document.getElementById('e7') && window.__zsMenu?.etat()?.menu);
    };
    // Partie 1 : un zombie abattu, manche 1 finie (+20 médailles), mort, « Revenir au menu principal ».
    await page.locator('#menu-jouer').click();
    await enJeu(page);
    await page.evaluate(() => {
      const zs = window.__zs;
      const p = zs.getState().player;
      zs.spawnEnemy(p.x + 120, p.y);
      zs.setInput({ aim: { angle: 0 } });
      zs.step(3);
      zs.step(3.2); zs.skipWave(); zs.step(0.2);
    });
    expect(await page.evaluate(() => window.__zs.getState().kills)).toBeGreaterThan(0);
    await page.evaluate(() => { const zs = window.__zs; zs.setChutes(0); zs.downPlayer(); zs.step(0.3); });
    await expect(page.locator('#end-panel')).toBeVisible();
    await page.locator('#btn-menu').click();
    await menuPret();
    let lu = await sauvegarde();
    const soldeDe = (c) => c.gagne - c.depense;
    let menu = await page.evaluate(() => window.__zsMenu.etat().menu);
    expect([menu.solde, menu.diamants, menu.record]).toEqual([soldeDe(lu.medailles), soldeDe(lu.diamants), lu.records.histoire.batiment]);
    expect(soldeDe(lu.medailles)).toBe(1020);
    await expect(page.locator('#menu-jouer-record')).toContainText(String(lu.records.histoire.batiment));
    await page.locator('#menu-profil').click();
    await page.waitForFunction(() => window.__zsMenu.etat().menu.compte?.stats?.length > 0);
    const stats = Object.fromEntries(await page.evaluate(() => window.__zsMenu.etat().menu.compte.stats));
    expect([stats.partiesHistoire, stats.tues, stats.meilleureManche]).toEqual([String(lu.profil.partiesHistoire), String(lu.profil.tues), String(lu.records.histoire.batiment)]);
    expect([lu.profil.partiesHistoire, lu.profil.tues > 0]).toEqual([1, true]);
    await page.keyboard.press('Escape');
    // Partie 2 : monde terminé (manche 40) : prime et diamants du monde écrits, Infini débloqué dans le menu neuf.
    await page.locator('#menu-jouer').click();
    await enJeu(page);
    await page.evaluate(() => { const zs = window.__zs; zs.startWave(40); zs.step(3.2); zs.skipWave(); zs.step(0.3); });
    await expect(page.locator('#end-panel')).toBeVisible();
    await page.locator('#btn-menu').click();
    await menuPret();
    lu = await sauvegarde();
    menu = await page.evaluate(() => window.__zsMenu.etat().menu);
    expect(lu.mondes).toContain('batiment');
    expect([menu.solde, menu.diamants]).toEqual([soldeDe(lu.medailles), soldeDe(lu.diamants)]);
    expect(soldeDe(lu.diamants)).toBeGreaterThan(0);
    await page.locator('#menu-onglet-infini').click();
    await expect(page.locator('#menu-carte-batiment')).not.toHaveAttribute('aria-disabled', 'true');
    await expect(page.locator('#menu-infini-jouer')).not.toHaveAttribute('aria-disabled', 'true');
  });
});
