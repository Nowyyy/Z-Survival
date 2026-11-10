// Lot 8b : onglets Jouer (scène animée, record, portes, panneaux, monde suivant) et Infini (cartes, classement d'exemple, mode infini réel) du
// menu principal (Docs/ref/menu-principal.md). ?test=1&menu=1 ; 932 × 430 (référence), 667 × 375, 1440 × 900 ; projets bureau et mobile (paysage).
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const REF = { width: 932, height: 430 };
const SIZES = [REF, { width: 667, height: 375 }, { width: 1440, height: 900 }];
const KEY = 'zs.save.v1';
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
    localStorage.setItem(k, JSON.stringify({ v: 1, rev: 1, savedAt: 0, money: 0, earned: 0, records: { bestWave: n, bestKills: 0, runs: 1, worldsCompleted: 0 } }));
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
      await expect(page.locator('#menu-titre-jouer')).toHaveText('Le bâtiment');
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
