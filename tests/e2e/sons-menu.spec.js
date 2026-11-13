// Lot 8i-D : sons du menu et des ouvertures (js/menu/sons/, Docs/ref/sons-menu.md). ?test=1&menu=1 ; le journal des lectures
// (window.__zsMenu.sons().journal) remplace l'écoute : chaque action déclenche son son, une seule fois ; pas de clic au défilement ; toucher rapide
// sans accumulation ; chute du Z aux instants de l'animation ; ouvertures « pas à pas » (?ouverture=pas) : ordre des sons = ordre des événements
// de la chronologie pure, signature de la rareté obtenue, « Passer » coupe, tout est libéré ; aucune écriture, aucune requête externe, console
// propre. Projets bureau et mobile (paysage ; mobile : les tests « clic » et « achat »).
import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { lireCaisses, tirer, tirer10 } from '../../js/core/caisses.js';
import { lireCatalogue } from '../../js/core/equipement.js';
import { chronologie, lireOuvertures, rareteEffets } from '../../js/core/ouverture.js';
import { sonsOuverture } from '../../js/core/sons-menu.js';

const REF = { width: 932, height: 430 };
const BRUIT = /GL Driver Message|GPU stall|swiftshader|WebGL/i;
const MO = 1024 * 1024;
const lire = (f) => JSON.parse(readFileSync(f, 'utf8'));
const { cat } = lireCatalogue({ raretes: lire('data/menu/raretes.json'), objets: lire('data/menu/objets.json'), personnages: lire('data/menu/personnages.json'), inventaire: lire('data/menu/inventaire-depart.json') });
const { caisses } = lireCaisses(lire('data/menu/caisses.json'), cat);
const caisse = (id) => caisses.find((c) => c.id === id);
const { reglages: R } = lireOuvertures(lire('data/menu/ouvertures.json'), cat.raretes.map((r) => r.id));
const catalogueSons = lire('data/menu/sons.json');
const premiere = (f) => {
  for (let g = 1; g < 200_000; g += 1) if (f(g)) return g;
  throw new Error('aucune graine');
};
const G_RARE = premiere((g) => tirer(caisse('elite'), cat, g).rarete === 'rare');
const G_DIX = premiere((g) => {
  const t = tirer10(caisse('elite'), cat, g).map((o) => o.rarete);
  return t.filter((r) => r === 'legendaire').length === 1 && t.includes('epique') && t.includes('rare');
});
const chronoDe = (objets, graine) => chronologie(R, objets.map((o) => rareteEffets({ type: 'equipement', objets }, objets.indexOf(o), cat.raretes)), { graine });

function surveiller(page, baseURL) {
  const problemes = [];
  const externes = [];
  page.on('console', (m) => ['error', 'warning'].includes(m.type()) && !BRUIT.test(m.text()) && problemes.push(m.text()));
  page.on('pageerror', (e) => problemes.push(e.message));
  page.on('request', (r) => !r.url().startsWith(baseURL) && !r.url().startsWith('data:') && !r.url().startsWith('blob:') && externes.push(r.url()));
  return { problemes, externes };
}
async function espions(page, graines = []) {
  await page.addInitScript((l) => {
    window.__ecritures = [];
    for (const m of ['setItem', 'removeItem', 'clear']) {
      const natif = Storage.prototype[m];
      Storage.prototype[m] = function ecrire(...args) {
        window.__ecritures.push(m);
        return natif.apply(this, args);
      };
    }
    const file = [...l];
    const orig = crypto.getRandomValues.bind(crypto);
    crypto.getRandomValues = (a) => {
      if (a instanceof Uint32Array && a.length === 1 && file.length) {
        a[0] = file.shift();
        return a;
      }
      return orig(a);
    };
  }, graines);
}
const sons = (page) => page.evaluate(() => window.__zsMenu.sons());
// Lectures demandées depuis l'indice `depuis` du journal : « nom » (jouée) ou « nom:raison » (refusée).
const lectures = async (page, depuis = 0) => (await sons(page)).journal.slice(depuis).filter((e) => e.son).map((e) => (e.joue ? e.son : `${e.son}:${e.raison}`));
const taille = async (page) => (await sons(page)).journal.length;
async function ouvrirMenu(page, extra = '&ouverture=0', size = REF) {
  await page.setViewportSize(size);
  await page.goto(`/jeu.html?test=1&menu=1&seed=1${extra}`);
  await expect(page.locator('#menu-jouer')).toBeVisible({ timeout: 60_000 });
  await page.waitForFunction(() => window.__zsMenu?.etat()?.menu !== null && !document.getElementById('e7'));
}
// Premier geste (hors de toute commande), puis attente des tampons du menu (calculés en arrière-plan).
async function sonsPrets(page) {
  await page.locator('#e8').click({ position: { x: 5, y: 200 } });
  await page.waitForFunction(() => window.__zsMenu.sons().pretes.includes('chute-rebond'), null, { timeout: 60_000 });
}
const avancer = (page, s) => page.evaluate((d) => window.__zsOuverture.avancer(d), s);
async function attendreOuverture(page) {
  await expect(page.locator('#menu-ecran-ouverture')).toBeVisible({ timeout: 60_000 });
  await page.waitForFunction(() => window.__zsOuverture?.etat()?.actif === true);
}

test.describe('sons du menu', () => {
  test('clic : aucun son avant un geste ; chaque commande déclenche le clic une seule fois ; pas de clic au défilement ni sur une commande désactivée ; toucher rapide sans accumulation ; tampons du menu ≤ 3 Mo', async ({ page, baseURL }) => {
    const o = surveiller(page, baseURL);
    await espions(page);
    await ouvrirMenu(page);
    // Avant tout geste : rien n'est chargé, rien n'est joué.
    expect((await sons(page)).charge).toBe(false);
    await sonsPrets(page);
    const s0 = await sons(page);
    expect(s0.pretes.sort()).toEqual(catalogueSons.sons.filter((s) => s.groupe !== 'ouverture').map((s) => s.id).sort());
    expect(Object.values(s0.octets).reduce((a, b) => a + b, 0)).toBeLessThanOrEqual(3 * MO);
    expect(s0.calculateur).toBe('arriere-plan');
    // Le premier geste (hors commande) n'a joué aucun clic.
    expect(await lectures(page)).toEqual([]);
    // Onglets, trois barres, entrée du menu : un clic chacun.
    let n = await taille(page);
    for (const sel of ['#menu-onglet-personnage', '#menu-onglet-boutique', '#menu-onglet-jouer', '#menu-trois-barres']) {
      await page.locator(sel).click();
      await page.waitForTimeout(320); // au-delà de la fenêtre du volume dégressif : plein niveau à chaque fois
      expect(await lectures(page, n), sel).toEqual(['clic']);
      n = await taille(page);
    }
    const dernier = (await sons(page)).journal.at(-1);
    expect(dernier).toMatchObject({ son: 'clic', joue: true, origine: 'clic', variante: s0.choix.clic });
    expect(dernier.gain).toBeCloseTo(catalogueSons.sons.find((x) => x.id === 'clic').gain, 6);
    await page.keyboard.press('Escape');
    // Défilement : aucun son.
    await page.locator('#menu-onglet-boutique').click();
    await expect(page.locator('#menu-ecran-boutique')).toBeVisible();
    n = await taille(page);
    await page.mouse.move(400, 250);
    await page.mouse.wheel(0, 300);
    await page.mouse.wheel(0, -300);
    await page.waitForTimeout(150);
    expect(await lectures(page, n)).toEqual([]);
    // Toucher rapide : six clics dans le même instant, un seul joué (les autres refusés : écart minimal).
    await page.waitForTimeout(320);
    n = await taille(page);
    await page.evaluate(() => {
      const b = document.getElementById('menu-onglet-boutique');
      for (let i = 0; i < 6; i += 1) b.click();
    });
    const rapides = await lectures(page, n);
    expect(rapides.filter((x) => x === 'clic').length).toBe(1);
    expect(rapides.filter((x) => x === 'clic:ecart').length).toBe(5);
    // Commande désactivée (aria-disabled) : aucun son.
    await page.locator('#menu-onglet-personnage').click();
    await page.locator('#menu-perso-capacite').click();
    await expect(page.locator('#menu-personnages-choisir')).toHaveAttribute('aria-disabled', 'true');
    await page.waitForTimeout(320);
    n = await taille(page);
    await page.locator('#menu-personnages-choisir').click({ force: true });
    expect(await lectures(page, n)).toEqual([]);
    expect(o.externes).toEqual([]);
    expect(o.problemes).toEqual([]);
    expect(await page.evaluate(() => window.__ecritures)).toEqual([]);
  });

  test('achat : une offre du jour et une caisse déclenchent le son d\'achat une fois (sans clic en plus)', async ({ page, baseURL }) => {
    const o = surveiller(page, baseURL);
    await espions(page);
    await ouvrirMenu(page);
    await sonsPrets(page);
    await page.locator('#menu-onglet-boutique').click();
    await expect(page.locator('#menu-ecran-boutique')).toBeVisible();
    let n = await taille(page);
    await page.locator('#menu-offre-0-acheter').click();
    await expect(page.locator('#menu-resultat-continuer')).toBeVisible();
    expect(await lectures(page, n)).toEqual(['achat']);
    await page.locator('#menu-resultat-continuer').click();
    await page.waitForTimeout(320);
    n = await taille(page);
    await page.locator('#menu-caisse-elite-un').click();
    await expect(page.locator('#menu-resultat-continuer')).toBeVisible();
    expect(await lectures(page, n)).toEqual(['achat']);
    expect(o.externes).toEqual([]);
    expect(o.problemes).toEqual([]);
    expect(await page.evaluate(() => window.__ecritures)).toEqual([]);
  });

  test('Personnage : équiper, retirer, améliorer, fusionner (montée puis signature de la rareté obtenue), choisir un personnage, valider un avatar', async ({ page, baseURL }) => {
    const o = surveiller(page, baseURL);
    await espions(page);
    await ouvrirMenu(page);
    await sonsPrets(page);
    await page.locator('#menu-onglet-personnage').click();
    await expect(page.locator('#menu-ecran-personnage')).toBeVisible();
    await page.locator('#menu-perso-gants').click();
    await expect(page.locator('#menu-ecran-inventaire')).toBeVisible();
    let n = await taille(page);
    await page.locator('#menu-inventaire-equiper').click();
    expect(await lectures(page, n)).toEqual(['equiper']);
    n = await taille(page);
    await page.locator('#menu-inventaire-equiper').click();
    expect(await lectures(page, n)).toEqual(['retirer']);
    n = await taille(page);
    await page.locator('#menu-inventaire-ameliorer').click();
    expect(await lectures(page, n)).toEqual(['ameliorer']);
    // Fusion : trois Gilets communs → Peu commun : montée, puis signature « peu commun » programmée après elle.
    await page.keyboard.press('Escape');
    await page.locator('#menu-perso-fusion').click();
    await page.locator('#menu-fusion-objet-o5').click();
    await page.locator('#menu-fusion-auto').click();
    n = await taille(page);
    await page.locator('#menu-fusion-fusionner').click();
    await expect(page.locator('#menu-fusion-annonce')).toContainText('Fusion réussie');
    expect(await lectures(page, n)).toEqual(['fusion']); // retour du propriétaire : plus de signature de rareté après la montée
    // Personnage choisi.
    await page.keyboard.press('Escape');
    await page.locator('#menu-perso-capacite').click();
    await page.locator('#menu-perso-carte-personnage-2').click();
    n = await taille(page);
    await page.locator('#menu-personnages-choisir').click();
    expect(await lectures(page, n)).toEqual(['choisir']);
    n = await taille(page);
    await page.locator('#menu-personnages-ameliorer').click();
    expect(await lectures(page, n)).toEqual(['ameliorer']);
    // Avatar validé.
    await page.keyboard.press('Escape');
    await page.locator('#menu-profil').click();
    await expect(page.locator('#menu-ecran-profil')).toBeVisible();
    await page.locator('#menu-profil-changer').click();
    await page.locator('#menu-profil-choix-eclaireur').click();
    n = await taille(page);
    await page.locator('#menu-profil-choix-valider').click();
    expect(await lectures(page, n)).toEqual(['choisir']);
    expect(o.externes).toEqual([]);
    expect(o.problemes).toEqual([]);
    expect(await page.evaluate(() => window.__ecritures)).toEqual([]);
  });

  test('chute du Z : sans geste, aucun son ; après un geste, à « JOUER », impact, tiret et rebond sont programmés aux instants de l\'animation', async ({ page }) => {
    await espions(page);
    await ouvrirMenu(page);
    // Chargement du menu sans geste (retour d'une partie, tests) : la chute n'a demandé aucun son.
    expect((await sons(page)).charge).toBe(false);
    await sonsPrets(page);
    const n = await taille(page);
    await page.locator('#menu-jouer').click();
    await page.waitForFunction((k) => window.__zsMenu.sons().journal.slice(k).filter((e) => e.origine === 'chute').length === 3, n, { timeout: 15_000 });
    const chute = (await sons(page)).journal.slice(n).filter((e) => e.origine === 'chute');
    expect(chute.map((e) => e.son)).toEqual(['chute-impact', 'chute-tiret', 'chute-rebond']);
    expect(chute.every((e) => e.joue)).toBe(true);
    expect(chute[1].t - chute[0].t).toBeCloseTo(0.02, 2);
    expect(chute[2].t - chute[0].t).toBeCloseTo(0.36, 2);
    expect((await sons(page)).musique.mode).toBe('fondu');
  });
});

test.describe('sons des ouvertures de caisses', () => {
  test('ouverture ×1 : sons calculés au toucher de « Ouvrir », ordre des sons = ordre des événements de la chronologie, signature de la rareté obtenue, musique baissée ; après « Continuer » : tampons libérés, plus aucun nœud actif, musique remontée', async ({ page, baseURL }) => {
    test.setTimeout(120_000);
    const o = surveiller(page, baseURL);
    await espions(page, [G_RARE]);
    await ouvrirMenu(page, '&ouverture=pas');
    await sonsPrets(page);
    await page.locator('#menu-onglet-boutique').click();
    await expect(page.locator('#menu-ecran-boutique')).toBeVisible();
    expect((await sons(page)).octets.ouverture).toBeUndefined(); // rien de l'ouverture avant « Ouvrir »
    await page.locator('#menu-caisse-elite-un').dispatchEvent('pointerdown');
    await page.locator('#menu-caisse-elite-un').click();
    await attendreOuverture(page);
    let s = await sons(page);
    expect(s.octets.ouverture).toBeGreaterThan(0);
    expect(s.octets.ouverture).toBeLessThanOrEqual(4 * MO);
    expect(s.musique.mode).toBe('baisse');
    const n = s.journal.length;
    const attendu = sonsOuverture(chronoDe([tirer(caisse('elite'), cat, G_RARE)], G_RARE), R);
    // Pas à pas jusqu'à la fin : les sons partent dans l'ordre de la chronologie, chacun une fois.
    const fin = (await page.evaluate(() => window.__zsOuverture.etat().fin));
    for (let t = 0; t < fin + 0.2; t += 0.2) await avancer(page, 0.2);
    s = await sons(page);
    const joues = s.journal.slice(n).filter((e) => e.origine === 'ouverture');
    expect(joues.every((e) => e.joue)).toBe(true);
    expect(joues.map((e) => e.son)).toEqual(attendu.map((e) => e.son));
    expect(joues.filter((e) => e.son.startsWith('rarete-'))).toEqual([]); // retour du propriétaire : plus de signature de rareté
    expect(joues.filter((e) => e.son === 'ouv-exclamation').length).toBe(1); // rare : « ! »
    expect(s.suiviMaxMs).toBeLessThan(50); // le suivi des sons n'allonge jamais une image
    await page.locator('#menu-ouverture-continuer').click();
    await expect(page.locator('#menu-ecran-ouverture')).toHaveCount(0);
    s = await sons(page);
    expect(s.octets.ouverture).toBeUndefined();
    expect(s.actifs.ouverture).toBeUndefined();
    expect(s.pretes.filter((x) => x.startsWith('ouv-'))).toEqual([]);
    expect(s.musique.mode).toBe('joue');
    expect(o.externes).toEqual([]);
    expect(o.problemes).toEqual([]);
    expect(await page.evaluate(() => window.__ecritures)).toEqual([]);
  });

  test('ouverture ×10 avec un légendaire : sons de chaque caisse dans l\'ordre de la chronologie, explosion du légendaire ; « Passer » arrête les sons en cours, plus aucun nœud audio de l\'ouverture actif, tampons libérés', async ({ page, baseURL }) => {
    test.setTimeout(120_000);
    const o = surveiller(page, baseURL);
    await espions(page, [G_DIX]);
    await ouvrirMenu(page, '&ouverture=pas');
    await sonsPrets(page);
    await page.locator('#menu-onglet-boutique').click();
    await expect(page.locator('#menu-ecran-boutique')).toBeVisible();
    await page.locator('#menu-caisse-elite-dix').dispatchEvent('pointerdown');
    await page.locator('#menu-caisse-elite-dix').click();
    await attendreOuverture(page);
    const objets = tirer10(caisse('elite'), cat, G_DIX);
    const chrono = chronoDe(objets, G_DIX);
    const attendu = sonsOuverture(chrono, R);
    const rangLeg = chrono.caisses.findIndex((c) => c.legendaire);
    const n = (await sons(page)).journal.length;
    // Jusqu'à l'explosion du légendaire, qui vient de partir (1,8 s) : des sons de l'ouverture sont en cours quel que soit le temps réel écoulé
    // (retours du propriétaire : plus de sang ni de signature de rareté, les sons longs d'avant).
    const arret = chrono.caisses[rangLeg].explosion[0] + 0.12;
    for (let t = 0; t < arret; t += 0.25) await avancer(page, Math.min(0.25, arret - t));
    let s = await sons(page);
    const joues = s.journal.slice(n).filter((e) => e.origine === 'ouverture');
    expect(joues.every((e) => e.joue)).toBe(true);
    expect(joues.map((e) => e.son)).toEqual(attendu.filter((e) => e.t <= arret).map((e) => e.son));
    expect(joues.filter((e) => e.son.startsWith('rarete-'))).toEqual([]);
    expect(joues.filter((e) => e.son === 'ouv-lumiere').length).toBe(rangLeg + 1); // une montée de lumière par caisse ouverte
    for (const nom of ['ouv-explosion', 'ouv-souffle', 'ouv-exclamation']) expect(joues.map((e) => e.son)).toContain(nom);
    expect(s.actifs.ouverture ?? 0).toBeGreaterThan(0); // des sons de l'ouverture sont en cours
    // « Passer » : son propre, puis tout est coupé et libéré.
    const m = s.journal.length;
    await page.locator('#menu-ouverture-passer').click();
    await expect(page.locator('#menu-ecran-ouverture')).toHaveCount(0);
    s = await sons(page);
    expect(s.journal.slice(m).filter((e) => e.son).map((e) => e.son)).toEqual(['ouv-passer']);
    expect(s.actifs.ouverture).toBeUndefined();
    expect(s.octets.ouverture).toBeUndefined();
    expect(s.musique.mode).toBe('joue');
    expect(o.externes).toEqual([]);
    expect(o.problemes).toEqual([]);
    expect(await page.evaluate(() => window.__ecritures)).toEqual([]);
  });

  test('ouverture accélérée (temps réel ×6) : le suivi des sons ne prend jamais 50 ms dans une image ; toucher l\'écran passe la caisse et coupe ses sons', async ({ page }) => {
    test.setTimeout(120_000);
    await espions(page, [G_RARE]);
    await ouvrirMenu(page, '&ouverture=rapide');
    await sonsPrets(page);
    await page.locator('#menu-onglet-boutique').click();
    await expect(page.locator('#menu-ecran-boutique')).toBeVisible();
    await page.locator('#menu-caisse-elite-un').click();
    await attendreOuverture(page);
    const n = (await sons(page)).journal.length;
    // Toucher l'écran pendant l'arrivée : saut à la première caisse, noté au journal, sons en cours coupés.
    await page.locator('#menu-ecran-ouverture canvas').click({ position: { x: 300, y: 200 } });
    await page.waitForFunction(() => window.__zsOuverture.etat().instant?.boutons >= 1, null, { timeout: 60_000 });
    const s = await sons(page);
    const suite = s.journal.slice(n);
    expect(suite.some((e) => e.ouverture === 'saut')).toBe(true);
    expect(suite.filter((e) => e.son === 'ouv-passer' && e.joue).length).toBe(1);
    expect(suite.filter((e) => e.son === 'ouv-lumiere' && e.joue).length).toBe(1);
    expect(suite.filter((e) => String(e.son).startsWith('rarete-'))).toEqual([]);
    expect(s.suiviMaxMs).toBeLessThan(50);
  });
});
