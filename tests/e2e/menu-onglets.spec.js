// Lot 8b : onglets Jouer (scène animée, record, portes, panneaux, monde suivant) et Infini (cartes, classement d'exemple, mode infini réel) du
// menu principal (Docs/ref/menu-principal.md). ?test=1&menu=1 ; 932 × 430 (référence), 667 × 375, 1440 × 900 ; projets bureau et mobile (paysage).
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const REF = { width: 932, height: 430 };
const SIZES = [REF, { width: 667, height: 375 }, { width: 1440, height: 900 }];
const KEY = 'zs.save.v2'; // lot 8h : progression v2 (zs.save.v1 n'est plus lue)
const BRUIT = /GL Driver Message|GPU stall|swiftshader|WebGL/i; // messages du rendu logiciel de Chromium, sans rapport avec la page

function surveiller(page, baseURL) {
  const problemes = [];
  const externes = [];
  page.on('console', (m) => ['error', 'warning'].includes(m.type()) && !BRUIT.test(m.text()) && problemes.push(m.text()));
  page.on('pageerror', (e) => problemes.push(e.message));
  page.on('request', (r) => {
    const u = r.url();
    if (!u.startsWith(baseURL) && !u.startsWith('data:') && !u.startsWith('blob:')) externes.push(u);
  });
  return { problemes, externes };
}

// Sauvegarde de test (schéma de zs.save.v1 : seul records.bestWave compte ici), posée avant le chargement ; ?store=local la fait lire.
async function poserRecord(page, bestWave) {
  await page.addInitScript(([k, n]) => {
    if (sessionStorage.getItem('zs.test.pose')) return; // une seule fois : les rechargements gardent ce que le jeu a écrit
    sessionStorage.setItem('zs.test.pose', '1');
    localStorage.setItem(k, JSON.stringify({ v: 2, rev: 1, savedAt: 0, records: { histoire: { batiment: n }, infini: {} }, profil: { partiesHistoire: 1 } })); // lot 8h : record de l'histoire du bâtiment
  }, [KEY, bestWave]);
}

async function ouvrirMenu(page, size = REF, extra = '') {
  await page.setViewportSize(size);
  await page.goto(`/jeu.html?test=1&menu=1&seed=1${extra}`);
  await expect(page.locator('#menu-jouer')).toBeVisible({ timeout: 60_000 });
  await page.waitForFunction(() => window.__zsMenu?.etat()?.menu !== null && !document.getElementById('e7'));
}

const boite = (page, sel) => page.locator(sel).evaluate((n) => {
  const r = n.getBoundingClientRect();
  return { l: r.left, t: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height };
});
const chevauche = (x, y) => x.l < y.r - 0.5 && y.l < x.r - 0.5 && x.t < y.b - 0.5 && y.t < x.b - 0.5;
// Animations CSS d'un élément et de ses descendants : [nom, état].
const animations = (page, sel) => page.locator(sel).evaluate((n) => n.getAnimations({ subtree: true }).filter((a) => a.animationName).map((a) => [a.animationName, a.playState]));
const panneaux = (page) => page.locator('.e8-jouer-panneau').evaluateAll((ns) => ns.map((n) => [n.textContent, n.classList.contains('e8-jouer-panneau-atteint') ? 'rouge' : 'bois']));

test.describe('onglet Jouer (E8-3)', () => {
  for (const size of SIZES) {
    test(`${size.width}×${size.height} : scène décorative ; bandeau, record, portes ; monde précédent désactivé ; monde 2 verrouillé ; rien hors de l'écran ni superposé ; 44 px ; axe`, async ({ page }) => {
      await ouvrirMenu(page, size);
      const scene = page.locator('#menu-ecran-jouer .e8-jouer-scene');
      await expect(scene).toHaveAttribute('aria-hidden', 'true');
      await expect(scene.locator('svg')).toHaveCount(1);
      await expect(page.locator('#menu-ecran-jouer .menu-bandeau-libelle')).toHaveText('Monde 1 · histoire');
      await expect(page.locator('#menu-titre-jouer')).toHaveText('Night of the Undead');
      await expect(page.locator('#menu-jouer-record')).toHaveText('Record : —');
      await expect(page.locator('#menu-jouer-portes')).toHaveText('Portes ouvertes : 0 / 3');
      await expect(page.locator('#menu-monde-precedent')).toBeDisabled();
      await expect(page.locator('#menu-monde-precedent')).toHaveAccessibleName('Monde précédent');
      await expect(page.locator('#menu-monde-suivant')).toHaveText('Monde 2Verrouillé');
      await expect(page.locator('#menu-monde-suivant .menu-ruban')).toHaveCount(1);
      await expect(page.locator('#menu-jouer')).toHaveText('JOUER');
      expect(await panneaux(page)).toEqual([['1', 'bois'], ['10', 'bois'], ['20', 'bois'], ['30', 'bois'], ['40', 'bois']]);
      await expect(page.locator('.e8-jouer-repere')).toHaveCount(0);
      // Scène : tout l'espace entre l'en-tête et la barre d'onglets, sans rien couper (la scène entière reste dans l'écran).
      const contenu = await boite(page, '#menu-contenu');
      const svg = await boite(page, '#menu-ecran-jouer .e8-jouer-svg');
      expect([Math.abs(svg.l - contenu.l) < 1, Math.abs(svg.r - contenu.r) < 1, Math.abs(svg.b - contenu.b) < 1]).toEqual([true, true, true]);
      const ids = ['.e8-entete', '#menu-ecran-jouer .menu-bandeau', '.e8-jouer-infos', '#menu-monde-precedent', '#menu-monde-suivant', '#menu-jouer', '.e8-onglets'];
      const b = Object.fromEntries(await Promise.all(ids.map(async (s) => [s, await boite(page, s)])));
      for (const [s, r] of Object.entries(b)) expect([r.l >= 0, r.t >= 0, r.r <= size.width + 0.5, r.b <= size.height + 0.5], s).toEqual([true, true, true, true]);
      const liste = Object.entries(b);
      for (let i = 0; i < liste.length; i += 1) for (let j = i + 1; j < liste.length; j += 1) expect(chevauche(liste[i][1], liste[j][1]), `${liste[i][0]} / ${liste[j][0]}`).toBe(false);
      for (const s of ['#menu-monde-precedent', '#menu-jouer']) expect([b[s].w >= 44, b[s].h >= 44], s).toEqual([true, true]);
      // Ruban du monde suivant juste sous sa carte, dans l'écran.
      const ruban = await boite(page, '#menu-monde-suivant .menu-ruban');
      expect([ruban.t >= b['#menu-monde-suivant'].b - 3, ruban.r <= size.width]).toEqual([true, true]);
      expect((await new AxeBuilder({ page }).analyze()).violations.map((v) => v.id)).toEqual([]);
    });
  }

  test('retour du propriétaire : roue de chargement (grosse, visible, texte) pendant le chargement lent d\'un onglet, retirée ensuite ; glissement à la souris dans la Boutique (défile, sans clic sur le bouton de départ) et dans la rangée de l\'Infini', async ({ page }) => {
    await page.route('**/js/menu/boutique.js', async (r) => {
      await new Promise((ok) => setTimeout(ok, 700));
      await r.continue();
    });
    await ouvrirMenu(page, { width: 667, height: 375 }, '&ouverture=0');
    await page.locator('#menu-onglet-boutique').click();
    const roue = page.locator('#e8 > .menu-roue');
    await expect(roue).toBeVisible();
    await expect(roue).toHaveAttribute('role', 'status');
    await expect(roue).toContainText('Chargement…');
    const anneau = await page.locator('.menu-roue-anneau').evaluate((n) => n.getBoundingClientRect().width);
    expect(anneau).toBeGreaterThanOrEqual(70); // avant : 44
    await expect(page.locator('#menu-ecran-boutique')).toBeVisible();
    await expect(page.locator('.menu-roue')).toHaveCount(0);
    // Glissement vertical dans la Boutique, départ sur un bouton d'achat : la liste défile, l'achat n'est pas déclenché.
    const zone = await page.evaluate(() => {
      const n = [...document.querySelectorAll('#menu-ecran-boutique, #menu-ecran-boutique *')].find((x) => ['auto', 'scroll'].includes(getComputedStyle(x).overflowY) && x.scrollHeight > x.clientHeight + 1);
      if (!n) return null;
      n.dataset.testZone = '1';
      return { haut: n.scrollTop };
    });
    expect(zone).not.toBeNull();
    // Point de départ : un bouton d'achat visible dans la zone (offre du jour).
    const depart = await page.evaluate(() => {
      const z = document.querySelector('[data-test-zone]').getBoundingClientRect();
      const bt = [...document.querySelectorAll('[data-test-zone] button')].map((n) => n.getBoundingClientRect()).find((r) => r.top + r.height / 2 > z.top && r.top + r.height / 2 < Math.min(z.bottom, innerHeight));
      return { x: bt.left + bt.width / 2, y: bt.top + bt.height / 2 };
    });
    await page.mouse.move(depart.x, depart.y);
    await page.mouse.down();
    for (let k = 1; k <= 8; k += 1) await page.mouse.move(depart.x, depart.y - k * 15);
    await page.mouse.up();
    await page.waitForTimeout(600);
    expect(await page.locator('[data-test-zone]').evaluate((n) => n.scrollTop)).toBeGreaterThan(zone.haut + 60);
    const b = await page.evaluate(() => window.__zsMenu.etat().menu.boutique);
    expect([b.dernier, b.resultat, b.ouverture]).toEqual([null, null, null]); // aucun achat : le clic qui suit le glissement est annulé
    // Rangée des cartes de l'Infini : glissement horizontal quand elle déborde.
    await page.locator('#menu-onglet-infini').click();
    const rangee = page.locator('.e8-infini-rangee');
    await expect(rangee).toBeVisible();
    const deborde = await rangee.evaluate((n) => n.scrollWidth > n.clientWidth + 1);
    if (deborde) {
      const r = await rangee.boundingBox();
      await page.mouse.move(r.x + r.width * 0.8, r.y + r.height / 2);
      await page.mouse.down();
      for (let k = 1; k <= 8; k += 1) await page.mouse.move(r.x + r.width * 0.8 - k * 25, r.y + r.height / 2);
      await page.mouse.up();
      await page.waitForTimeout(800);
      expect(await rangee.evaluate((n) => n.scrollLeft)).toBeGreaterThan(20);
      expect(await rangee.evaluate((n) => n.style.scrollSnapType)).toBe(''); // aimantation rendue
    }
    expect(await page.evaluate(() => window.__zsMenu.etat().menu.onglet)).toBe('infini');
  });

  test('contraste du texte posé sur la scène : 4,5:1 au moins contre le pixel le plus clair derrière lui (932 × 430)', async ({ page }) => {
    await ouvrirMenu(page);
    await page.evaluate(() => { for (const a of document.getAnimations()) a.pause(); });
    const sels = ['#menu-jouer-record', '#menu-jouer-portes', '.e8-jouer-suivant-nom', '.e8-jouer-suivant-etat'];
    const couleurs = {};
    for (const s of sels) couleurs[s] = await page.locator(s).evaluate((n) => getComputedStyle(n).color);
    // Fond sans le texte : textes masqués, capture de leur boîte.
    await page.addStyleTag({ content: `${sels.join(',')} { visibility: hidden !important; }` });
    const lum = ([r, g, b]) => [r, g, b].map((c) => { const v = c / 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }).reduce((s, v, i) => s + v * [0.2126, 0.7152, 0.0722][i], 0);
    for (const s of sels) {
      const r = await boite(page, s);
      const png = await page.screenshot({ clip: { x: r.l, y: r.t, width: Math.max(1, r.w), height: Math.max(1, r.h) } });
      const clair = await page.evaluate(async (b64) => {
        const img = new Image();
        img.src = `data:image/png;base64,${b64}`;
        await img.decode();
        const c = new OffscreenCanvas(img.width, img.height);
        const ctx = c.getContext('2d');
        ctx.drawImage(img, 0, 0);
        const d = ctx.getImageData(0, 0, img.width, img.height).data;
        let best = [0, 0, 0];
        let bl = -1;
        for (let i = 0; i < d.length; i += 4) {
          const l = 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
          if (l > bl) { bl = l; best = [d[i], d[i + 1], d[i + 2]]; }
        }
        return best;
      }, png.toString('base64'));
      const texte = couleurs[s].match(/\d+/g).slice(0, 3).map(Number);
      const [a, z] = [lum(texte), lum(clair)].sort((x, y) => y - x);
      expect((a + 0.05) / (z + 0.05), `${s} ${couleurs[s]} sur ${clair}`).toBeGreaterThanOrEqual(4.5);
    }
  });

  test('record de la sauvegarde (?store=local, lecture seule) : panneaux rouges ou bois, portes ouvertes, repère ; aucune écriture', async ({ page }) => {
    for (const [record, texte, portes, rouges] of [[9, 'Record : manche 9 / 40', 0, 1], [25, 'Record : manche 25 / 40', 2, 3], [40, 'Record : manche 40 / 40', 3, 5]]) {
      const p = await page.context().newPage();
      await poserRecord(p, record);
      await p.addInitScript(() => {
        window.__ecritures = [];
        const set = Storage.prototype.setItem;
        Storage.prototype.setItem = function (k, v) { if (k !== 'zs.test.pose') window.__ecritures.push(k); return set.call(this, k, v); };
      });
      await ouvrirMenu(p, REF, '&store=local');
      const avant = await p.evaluate((k) => localStorage.getItem(k), KEY);
      await expect(p.locator('#menu-jouer-record')).toHaveText(texte);
      await expect(p.locator('#menu-jouer-portes')).toHaveText(`Portes ouvertes : ${portes} / 3`);
      const attendu = ['1', '10', '20', '30', '40'].map((n, i) => [n, i < rouges ? 'rouge' : 'bois']);
      expect(await panneaux(p), String(record)).toEqual(attendu);
      await expect(p.locator('.e8-jouer-repere')).toHaveCount(1);
      // Couleurs : panneau atteint rouge (texte blanc), sinon bois (texte clair) ; jetons de tokens.css.
      const fond = await p.locator('.e8-jouer-panneau').first().evaluate((n) => [getComputedStyle(n.querySelector('.e8-jouer-planche')).fill, getComputedStyle(n.querySelector('text')).fill]);
      expect(fond).toEqual(['rgb(143, 16, 16)', 'rgb(255, 255, 255)']);
      expect(await p.evaluate((k) => [window.__ecritures, localStorage.getItem(k)], KEY)).toEqual([[], avant]);
      expect((await p.evaluate(() => window.__zsMenu.etat().menu)).record).toBe(record);
      await p.close();
    }
  });

  test('animations de la scène en cours, puis en pause quand on change d\'onglet ou que la page est cachée ; reprise au retour', async ({ page }) => {
    await ouvrirMenu(page);
    const scene = '#menu-jouer-scene';
    await expect(page.locator(scene)).toHaveAttribute('data-anim', 'on');
    const enCours = await animations(page, scene);
    expect(enCours.length).toBeGreaterThanOrEqual(15);
    expect(enCours.every(([n, s]) => n.startsWith('e8-jouer-') && s === 'running')).toBe(true);
    expect(new Set(enCours.map(([n]) => n))).toEqual(new Set(['e8-jouer-lueur', 'e8-jouer-flamme', 'e8-jouer-fumee', 'e8-jouer-rodeur-g', 'e8-jouer-rodeur-d', 'e8-jouer-marche-a', 'e8-jouer-meurt-a', 'e8-jouer-tir-a', 'e8-jouer-sang-a', 'e8-jouer-marche-b', 'e8-jouer-meurt-b', 'e8-jouer-tir-b', 'e8-jouer-sang-b']));
    // Autre onglet : la scène n'est plus affichée et ses animations ne tournent plus.
    await page.locator('#menu-onglet-boutique').click();
    await expect(page.locator(scene)).toHaveAttribute('data-anim', 'off');
    expect((await animations(page, scene)).filter(([, s]) => s === 'running')).toEqual([]);
    await page.locator('#menu-onglet-jouer').click();
    await expect(page.locator(scene)).toHaveAttribute('data-anim', 'on');
    expect((await animations(page, scene)).every(([, s]) => s === 'running')).toBe(true);
    // Page cachée (visibilitychange) : en pause ; visible : reprise.
    const cacher = (hidden) => page.evaluate((h) => {
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => h });
      document.dispatchEvent(new Event('visibilitychange'));
    }, hidden);
    await cacher(true);
    await expect(page.locator(scene)).toHaveAttribute('data-anim', 'off');
    const caches = await animations(page, scene);
    expect([caches.length > 0, caches.every(([, s]) => s === 'paused')]).toEqual([true, true]);
    await cacher(false);
    await expect(page.locator(scene)).toHaveAttribute('data-anim', 'on');
    expect((await animations(page, scene)).every(([, s]) => s === 'running')).toBe(true);
  });

  test('prefers-reduced-motion : scène fixe (aucune animation), zombies absents, flammes et lueurs présentes', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await ouvrirMenu(page);
    expect(await animations(page, '#menu-jouer-scene')).toEqual([]);
    expect(await page.locator('.e8-jouer-zombie-proche, .e8-jouer-rodeur-g, .e8-jouer-rodeur-d').evaluateAll((ns) => ns.map((n) => getComputedStyle(n).display))).toEqual(['none', 'none', 'none', 'none']);
    expect(await page.locator('.e8-jouer-flammes, .e8-jouer-lampe').evaluateAll((ns) => ns.map((n) => getComputedStyle(n).opacity))).toEqual(['1', '1', '1', '1']);
    expect(await page.locator('.e8-jouer-tir, .e8-jouer-sang').evaluateAll((ns) => ns.map((n) => getComputedStyle(n).opacity))).toEqual(['0', '0', '0', '0']);
  });

  test('« JOUER » lance la partie en mode histoire, manche 1, sauvegarde normale ; console propre, aucune requête externe', async ({ page, baseURL }) => {
    test.setTimeout(120_000);
    const o = surveiller(page, baseURL);
    await ouvrirMenu(page);
    await page.locator('#menu-jouer').click();
    await expect(page.locator('#game-root')).toBeVisible({ timeout: 60_000 });
    await page.waitForFunction(() => (window.__zs?.getState()?.time ?? 0) > 0.05, null, { timeout: 60_000 });
    const s = await page.evaluate(() => { const st = window.__zs.getState(); return { mode: st.mode, vague: st.waves.wave, readOnly: st.save.readOnly, depot: st.save.kind }; });
    expect(s).toEqual({ mode: 'histoire', vague: 1, readOnly: false, depot: 'memory' });
    await expect(page.locator('#hud')).toContainText('/ 40'); // fin du monde à la manche 40 (mode histoire)
    expect(o.problemes).toEqual([]);
    expect(o.externes).toEqual([]);
  });
});

async function ouvrirInfini(page, size = REF, extra = '') {
  await ouvrirMenu(page, size, extra);
  await page.locator('#menu-onglet-infini').click();
  await expect(page.locator('#menu-infini-jouer')).toBeVisible();
}
const libelles = (page) => page.locator('.e8-infini-carte-libelle').allTextContents();
// Champs logiques de getState() (ceux de scripts/perf/trace-logique.mjs : aucun champ de rendu, de son, de mesure, d'horloge réelle ni de sauvegarde).
const LOGIQUE = ['time', 'dead', 'worldOver', 'player', 'economy', 'kills', 'waves', 'floor', 'aim', 'shots', 'enemies', 'bullets', 'windows', 'debris', 'laser', 'laserEnd', 'camera', 'stairLog', 'events', 'spawnLog', 'pose', 'stats'];

test.describe('onglet Infini (E8-4) et mode infini', () => {
  for (const size of SIZES) {
    test(`${size.width}×${size.height} : bandeau, cartes (choisie, verrouillées), classement d'exemple et « Toi », « Jouer » ; rien hors de l'écran ni superposé ; 44 px ; axe`, async ({ page }) => {
      await ouvrirInfini(page, size);
      await expect(page.locator('#menu-infini-scene')).toHaveAttribute('aria-hidden', 'true');
      await expect(page.locator('#menu-ecran-infini .menu-bandeau-libelle')).toHaveText('Vagues sans fin');
      await expect(page.locator('#menu-titre-infini')).toHaveText('Mode infini');
      await expect(page.locator('#menu-infini-choix')).toHaveText('Choisis ta carte · 1 / 6 mondes, fais glisser');
      await expect(page.locator('#menu-infini-cartes')).toHaveAccessibleName('Cartes');
      await expect(page.locator('#menu-infini-cartes > li > button')).toHaveCount(6);
      expect(await libelles(page)).toEqual(['Monde 1 · Choisie', ...[2, 3, 4, 5, 6].map((n) => `Monde ${n} · Verrouillée`)]);
      const premiere = page.locator('#menu-carte-batiment');
      await expect(premiere).toHaveAttribute('aria-pressed', 'true');
      await expect(premiere).toContainText('Night of the Undead');
      await expect(premiere).toContainText('Record : —');
      expect(await premiere.evaluate((n) => [getComputedStyle(n).borderTopColor, getComputedStyle(n).borderTopWidth])).toEqual(['rgb(216, 20, 20)', '3px']);
      for (const n of [2, 3, 4, 5, 6]) {
        const c = page.locator(`#menu-carte-monde-${n}`);
        await expect(c).toHaveAttribute('aria-disabled', 'true');
        await expect(c).not.toHaveAttribute('aria-pressed', /.*/);
        await expect(c).toHaveAccessibleName(`Monde ${n} · Verrouillée [à venir] Termine le monde ${n - 1}`);
        expect(await c.evaluate((x) => getComputedStyle(x).borderTopColor)).toBe('rgb(58, 52, 52)');
      }
      await expect(page.locator('#menu-classement-titre')).toHaveText('Classement');
      await expect(page.locator('#menu-classement-carte')).toHaveText('Night of the Undead · exemple, arrive avec le compte');
      await expect(page.locator('#menu-classement-lignes > li')).toHaveText(['1[pseudo]Manche 58', '2[pseudo]Manche 51', '3[pseudo]Manche 47', '4[pseudo]Manche 44', '5[pseudo]Manche 42']);
      await expect(page.locator('#menu-classement-toi')).toHaveText('ToiRang —Manche —');
      await expect(page.locator('#menu-cartes-suivantes')).toHaveAccessibleName('Cartes suivantes');
      await expect(page.locator('#menu-infini-jouer')).toHaveText('Jouer');
      // La carte suivante dépasse du bord : la rangée défile.
      expect(await page.locator('#menu-infini-cartes').evaluate((n) => n.scrollWidth > n.clientWidth + 20)).toBe(true);
      const ids = ['.e8-entete', '#menu-ecran-infini .menu-bandeau', '#menu-infini-choix', '#menu-infini-cartes', '#menu-infini-jouer', '#menu-classement', '.e8-onglets'];
      const b = Object.fromEntries(await Promise.all(ids.map(async (s) => [s, await boite(page, s)])));
      for (const [s, r] of Object.entries(b)) expect([r.l >= 0, r.t >= 0, r.r <= size.width + 0.5, r.b <= size.height + 0.5], s).toEqual([true, true, true, true]);
      const liste = Object.entries(b);
      for (let i = 0; i < liste.length; i += 1) for (let j = i + 1; j < liste.length; j += 1) expect(chevauche(liste[i][1], liste[j][1]), `${liste[i][0]} / ${liste[j][0]}`).toBe(false);
      const fleche = await boite(page, '#menu-cartes-suivantes');
      expect([fleche.w >= 44, fleche.h >= 44, b['#menu-infini-jouer'].h >= 44, chevauche(fleche, b['#menu-classement'])]).toEqual([true, true, true, false]);
      const carte = await boite(page, '#menu-carte-batiment');
      expect([carte.w >= 44, carte.h >= 44]).toEqual([true, true]);
      expect((await new AxeBuilder({ page }).analyze()).violations.map((v) => v.id)).toEqual([]);
    });
  }

  test('rangée : défile à la molette et par la flèche ; carte verrouillée non sélectionnable ; carte choisie gardée (mémoire) ; Infini chargé à la demande', async ({ page, baseURL }) => {
    const fichiers = [];
    page.on('request', (r) => r.url().startsWith(baseURL) && fichiers.push(new URL(r.url()).pathname));
    await ouvrirMenu(page);
    expect(fichiers.filter((f) => /infini\.js$|classement\.json$/.test(f))).toEqual([]); // ni l'écran Infini ni le classement au démarrage
    expect(fichiers.filter((f) => /\/js\/menu\/jouer\.js$|\/data\/menu\/mondes\.json$/.test(f))).toHaveLength(2); // l'onglet Jouer, oui
    await page.locator('#menu-onglet-infini').click();
    await expect(page.locator('#menu-infini-jouer')).toBeVisible();
    expect(fichiers.filter((f) => /infini\.js$|classement\.json$/.test(f))).toEqual(['/js/menu/infini.js', '/data/menu/classement.json']);
    const rangee = page.locator('#menu-infini-cartes');
    const gauche = () => rangee.evaluate((n) => n.scrollLeft);
    expect(await gauche()).toBe(0);
    await rangee.hover();
    await page.mouse.wheel(0, 300);
    await expect.poll(gauche).toBeGreaterThan(100);
    await rangee.evaluate((n) => n.scrollTo({ left: 0 }));
    await expect.poll(gauche).toBe(0);
    await page.locator('#menu-cartes-suivantes').click();
    await expect.poll(gauche).toBeGreaterThan(100);
    await page.locator('#menu-carte-monde-3').click({ force: true }); // aria-disabled : Playwright ne clique pas sans force
    expect(await libelles(page)).toEqual(['Monde 1 · Choisie', ...[2, 3, 4, 5, 6].map((n) => `Monde ${n} · Verrouillée`)]);
    await expect(page.locator('#menu-carte-batiment')).toHaveAttribute('aria-pressed', 'true');
    expect((await page.evaluate(() => window.__zsMenu.etat().menu)).infini).toEqual({ choisi: 'batiment' });
    // Retour à Jouer puis à Infini : même écran, même choix.
    await page.locator('#menu-onglet-jouer').click();
    await page.locator('#menu-onglet-infini').click();
    await expect(page.locator('#menu-ecran-infini')).toHaveCount(1);
    await expect(page.locator('#menu-carte-batiment')).toHaveAttribute('aria-pressed', 'true');
  });

  test('rangée : défile au doigt (geste tactile)', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'geste tactile : projet mobile');
    await ouvrirInfini(page, { width: 667, height: 375 });
    const r = await boite(page, '#menu-infini-cartes');
    // Doigt posé sur une carte, glissé vers la gauche en 12 étapes, puis levé (événements tactiles du navigateur, comme sur un téléphone).
    const cdp = await page.context().newCDPSession(page);
    const y = Math.round(r.t + r.h / 2);
    const x0 = Math.round(r.l + r.w * 0.8);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: x0, y }] });
    for (let k = 1; k <= 12; k += 1) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x0 - k * 22, y }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await expect.poll(() => page.locator('#menu-infini-cartes').evaluate((n) => n.scrollLeft)).toBeGreaterThan(100);
  });

  test('animations du décor (e8-infini-*) en cours sur l\'onglet, en pause ailleurs ; aucune sous prefers-reduced-motion', async ({ page }) => {
    await ouvrirInfini(page);
    await expect(page.locator('#menu-infini-scene')).toHaveAttribute('data-anim', 'on');
    await expect(page.locator('#menu-jouer-scene')).toHaveAttribute('data-anim', 'off');
    const a = await animations(page, '#menu-infini-scene');
    expect([...new Set(a.map(([n]) => n))].sort()).toEqual(['e8-infini-halo', 'e8-infini-horde']);
    expect(a.every(([, s]) => s === 'running')).toBe(true);
    await page.locator('#menu-onglet-jouer').click();
    await expect(page.locator('#menu-infini-scene')).toHaveAttribute('data-anim', 'off');
    expect((await animations(page, '#menu-infini-scene')).filter(([, s]) => s === 'running')).toEqual([]);
    const p = await page.context().newPage();
    await p.emulateMedia({ reducedMotion: 'reduce' });
    await ouvrirInfini(p);
    expect(await animations(p, '#e8')).toEqual([]);
    await p.close();
  });

  test('« Jouer » : partie en mode infini (getState), sans lecture seule ; au-delà de la manche 40, aucune fin de monde ; console propre', async ({ page, baseURL }) => {
    test.setTimeout(150_000);
    const o = surveiller(page, baseURL);
    await ouvrirInfini(page);
    await page.locator('#menu-infini-jouer').click();
    await expect(page.locator('#game-root')).toBeVisible({ timeout: 60_000 });
    await page.waitForFunction(() => (window.__zs?.getState()?.time ?? 0) > 0.05, null, { timeout: 60_000 });
    expect(await page.evaluate(() => { const s = window.__zs.getState(); return [s.mode, s.save.readOnly, s.save.status, s.waves.wave]; })).toEqual(['infini', false, 'memory', 1]);
    await expect(page.locator('#hud')).not.toContainText('/ 40');
    await expect(page.locator('#hud-trial')).toBeHidden(); // pas de « Mode essai » (adresse sans paramètre d'essai)
    expect(page.url()).not.toMatch(/endless|wave=/);
    const fin = await page.evaluate(() => {
      const zs = window.__zs;
      zs.startWave(40);
      for (let i = 0; i < 4000 && zs.getState().waves.wave < 41 && !zs.getState().worldOver; i += 1) {
        zs.skipWave();
        zs.step(0.05);
      }
      const s = zs.getState();
      return [s.waves.wave, s.worldOver, s.waves.worldEnd];
    });
    expect(fin).toEqual([41, false, false]);
    expect(o.problemes).toEqual([]);
    expect(o.externes).toEqual([]);
  });

  // Lot 8d : « JOUER » transmet les niveaux effectifs de l'équipement de départ (option de démarrage, source « menu ») ; la partie directe reçoit les
  // mêmes niveaux par ?lvl= (source « url ») : même logique pas à pas, la source seule diffère (vérifiée à part, retirée de l'empreinte).
  test('même logique que ?endless=1 à graine égale et niveaux égaux (manches 40 à 42, pas à pas) ; ?endless=1 en lecture seule, le mode infini non', async ({ browser }) => {
    test.setTimeout(240_000);
    async function partie(url, viaMenu) {
      const context = await browser.newContext({ viewport: { width: 667, height: 375 } });
      const page = await context.newPage();
      // Onglet « caché » : la boucle d'images ne tourne pas, seul step() fait avancer la partie (méthode de trace-logique.mjs).
      await page.addInitScript(() => Object.defineProperty(Document.prototype, 'hidden', { get: () => true, configurable: true }));
      await page.goto(url);
      if (viaMenu) {
        await expect(page.locator('#menu-jouer')).toBeVisible({ timeout: 60_000 });
        await page.locator('#menu-onglet-infini').click();
        await page.locator('#menu-infini-jouer').click();
      }
      await page.waitForFunction(() => window.__zs, null, { timeout: 90_000 });
      const r = await page.evaluate((keys) => {
        const zs = window.__zs;
        const depart = zs.getState().stats;
        const logique = () => { const s = zs.getState(); return JSON.stringify(keys.map((k) => (k === 'stats' ? { ...s.stats, source: '' } : s[k]))); };
        const premier = logique();
        zs.setLevels({ degats: 10, cadence: 10 });
        zs.startWave(40);
        const pas = [];
        for (let i = 0; i < 700; i += 1) {
          zs.setInput({ aim: { angle: (i * 0.037) % (Math.PI * 2) } });
          if (i % 60 === 59) zs.skipWave();
          zs.step(0.05);
          pas.push(logique());
        }
        const s = zs.getState();
        return { pas, premier, source: depart.source, niveaux: { ...depart.levels, ...depart.extraLevels }, mode: s.mode, readOnly: s.save.readOnly, vague: s.waves.wave, fin: s.worldOver };
      }, LOGIQUE);
      await context.close();
      return r;
    }
    const infini = await partie('/jeu.html?test=1&menu=1&seed=5', true);
    const lvl = Object.entries(infini.niveaux).map(([k, v]) => `${k}:${v}`).join(',');
    const endless = await partie(`/jeu.html?test=1&seed=5&endless=1&lvl=${lvl}`, false);
    expect([endless.mode, endless.readOnly, infini.mode, infini.readOnly]).toEqual(['histoire', true, 'infini', false]);
    expect([infini.source, endless.source]).toEqual(['menu', 'url']);
    expect(Object.values(infini.niveaux).some((n) => n > 0)).toBe(true); // bonus de l'équipement de départ reçus
    expect(endless.niveaux).toEqual(infini.niveaux);
    expect(infini.premier).toBe(endless.premier); // état de départ identique (vie maximale comprise), avant setLevels
    expect(infini.vague).toBeGreaterThan(41);
    expect([infini.fin, endless.fin]).toEqual([false, false]);
    expect(infini.pas.length).toBe(700);
    const ecart = infini.pas.findIndex((p, i) => p !== endless.pas[i]);
    expect(ecart, `premier écart au pas ${ecart}`).toBe(-1);
  });

  test('?store=local : visite du menu sans écriture ; en mode infini (lot 8h), la bleue des manches est écrite, la jaune jamais, le record de l\'infini est séparé de celui de l\'histoire', async ({ page }) => {
    test.setTimeout(150_000);
    await poserRecord(page, 12);
    await page.addInitScript(() => {
      window.__ecritures = [];
      const set = Storage.prototype.setItem;
      Storage.prototype.setItem = function (k, v) { if (k !== 'zs.test.pose') window.__ecritures.push(k); return set.call(this, k, v); };
    });
    await ouvrirInfini(page, REF, '&store=local');
    const avant = await page.evaluate((k) => localStorage.getItem(k), KEY);
    await page.locator('#menu-carte-monde-2').click({ force: true });
    await page.locator('#menu-cartes-suivantes').click();
    await page.locator('#menu-onglet-jouer').click();
    await page.locator('#menu-onglet-infini').click();
    expect(await page.evaluate((k) => [window.__ecritures, localStorage.getItem(k), sessionStorage.length], KEY)).toEqual([[], avant, 1]);
    await page.locator('#menu-infini-jouer').click();
    await page.waitForFunction(() => (window.__zs?.getState()?.time ?? 0) > 0.05, null, { timeout: 60_000 });
    expect(await page.evaluate(() => { const s = window.__zs.getState(); return [s.mode, s.save.kind, s.save.readOnly]; })).toEqual(['infini', 'local', false]);
    const apres = await page.evaluate((k) => {
      const zs = window.__zs;
      zs.giveMoney(77);
      zs.startWave(15);
      for (let i = 0; i < 400 && zs.getState().waves.wave < 16; i += 1) { zs.skipWave(); zs.step(0.05); }
      zs.flushSave();
      return { s: JSON.parse(localStorage.getItem(k)), vague: zs.getState().waves.wave };
    }, KEY);
    expect(apres.vague).toBe(16);
    expect(apres.s.bleu.gagne).toBe(60); // bonus bleu de la manche 15, renforcée : (10 + 2 × 15) × 1,5 ; la jaune (77) n'est jamais écrite
    expect(apres.s.records).toEqual({ histoire: { batiment: 12 }, infini: { 'monde-2': 16 } }); // record de l'infini de la carte jouée, celui de l'histoire reste
    expect(apres.s.profil.partiesInfini).toBe(1);
    expect(apres.s.rev).toBeGreaterThan(1); // écrit dans zs.save.v2 (révision suivante)
    await page.evaluate(() => localStorage.clear());
  });
});
