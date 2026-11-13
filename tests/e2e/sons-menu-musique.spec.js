import { test, expect } from '@playwright/test';

// Lot 8i-C : musique des menus (js/menu/sons/, Docs/ref/sons-menu.md). L'état window.__zsMenu.sons() (?test=1&menu=1) remplace l'écoute :
// aucune musique avant un geste ; démarrage après l'introduction et l'écran de chargement, ou au premier geste ; fondu à « JOUER » ; arrêt page
// cachée ; mémoire dans la borne ; continuité de la boucle mesurée sur le rendu hors ligne de la vraie chaîne (OfflineAudioContext).
const REF = { width: 932, height: 430 };
const BRUIT = /GL Driver Message|WebGL|GroupMarkerNotSet/;
const sons = (page) => page.evaluate(() => window.__zsMenu.sons());
const cachee = (page, v) => page.evaluate((h) => {
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => h });
  document.dispatchEvent(new Event('visibilitychange'));
}, v);

async function ouvrirMenu(page, extra = '') {
  await page.setViewportSize(REF);
  await page.goto(`/jeu.html?test=1&menu=1&seed=1&ouverture=0${extra}`);
  await expect(page.locator('#menu-jouer')).toBeVisible({ timeout: 60_000 });
  await page.waitForFunction(() => window.__zsMenu?.etat()?.menu !== null && !document.getElementById('e7'));
}
const enMusique = (page) => page.waitForFunction(() => window.__zsMenu.sons().musique.lecteur?.enMarche === true, null, { timeout: 30_000 });

test.describe('musique des menus', () => {
  test('aucune musique ni contexte audio avant un geste ; démarrage au premier geste ; mémoire dans la borne ; console propre, aucune requête externe, aucune écriture', async ({ page, baseURL }) => {
    const externes = [];
    const problemes = [];
    const fichiers = [];
    page.on('request', (r) => {
      if (!r.url().startsWith(baseURL) && !r.url().startsWith('data:') && !r.url().startsWith('blob:')) externes.push(r.url());
      else if (r.url().startsWith(baseURL)) fichiers.push(new URL(r.url()).pathname);
    });
    page.on('console', (m) => ['error', 'warning'].includes(m.type()) && !BRUIT.test(m.text()) && problemes.push(m.text()));
    page.on('pageerror', (e) => problemes.push(e.message));
    await page.addInitScript(() => {
      window.__ecritures = 0;
      window.__contextes = 0;
      for (const m of ['setItem', 'removeItem', 'clear']) {
        const natif = Storage.prototype[m];
        Storage.prototype[m] = function ecrire(...args) {
          window.__ecritures += 1;
          return natif.apply(this, args);
        };
      }
      const Natif = window.AudioContext;
      window.AudioContext = class extends Natif {
        constructor(...args) {
          super(...args);
          window.__contextes += 1;
        }
      };
    });
    await ouvrirMenu(page);
    // Menu affiché, aucun geste : en attente, aucun contexte, aucun fichier du moteur ni de la musique.
    let s = await sons(page);
    expect(s.musique.mode).toBe('attente');
    expect(s.contexte).toBe('aucun');
    expect(s.charge).toBe(false);
    expect(await page.evaluate(() => window.__contextes)).toBe(0);
    expect(fichiers.filter((f) => /\/sons\/(moteur|musique|calcul|synthese)\.js$|musique-menu\.js$|sons\.json$/.test(f))).toEqual([]);
    expect(fichiers.filter((f) => f.endsWith('/js/menu/sons/sons.js')).length).toBe(1);
    // Premier geste : contexte créé, moteur chargé, musique en marche.
    await page.locator('#e8').click({ position: { x: 5, y: 200 } });
    await enMusique(page);
    s = await sons(page);
    expect(s.musique.mode).toBe('joue');
    expect(s.contexte).toBe('running');
    expect(s.journal.filter((e) => e.musique).map((e) => e.musique)).toEqual(['joue']);
    expect(await page.evaluate(() => window.__contextes)).toBe(1);
    // Mémoire : un seul tampon (bruit de 2 s) pour la musique ; aucun long tampon.
    expect(s.musique.lecteur.octets).toBeLessThanOrEqual(512 * 1024);
    expect(s.musique.lecteur.variante).toBe(s.choix.musique);
    // Le séquenceur programme des notes sur l'horloge audio.
    await page.waitForFunction(() => window.__zsMenu.sons().musique.lecteur.notes > 5);
    expect(externes).toEqual([]);
    expect(problemes).toEqual([]);
    expect(await page.evaluate(() => window.__ecritures)).toBe(0);
  });

  test('page cachée : la musique s\'arrête ; au retour, elle reprend', async ({ page }) => {
    await ouvrirMenu(page);
    await page.locator('#e8').click({ position: { x: 5, y: 200 } });
    await enMusique(page);
    await cachee(page, true);
    await page.waitForFunction(() => window.__zsMenu.sons().musique.lecteur.enMarche === false);
    expect((await sons(page)).musique.mode).toBe('arret');
    await page.waitForFunction(() => window.__zsMenu.sons().contexte === 'suspended');
    await cachee(page, false);
    await enMusique(page);
    const s = await sons(page);
    expect(s.musique.mode).toBe('joue');
    expect(s.contexte).toBe('running');
    expect(s.journal.filter((e) => e.musique).map((e) => e.musique)).toEqual(['joue', 'arret', 'joue']);
  });

  test('« JOUER » : fondu de sortie, la musique ne revient pas', async ({ page }) => {
    await ouvrirMenu(page);
    await page.locator('#e8').click({ position: { x: 5, y: 200 } });
    await enMusique(page);
    await page.locator('#menu-jouer').click();
    await page.waitForFunction(() => window.__zsMenu.sons().musique.mode === 'fondu');
    // Le lecteur est libéré après le fondu (réglage fonduJouer).
    await page.waitForFunction(() => window.__zsMenu.sons().musique.lecteur === null, null, { timeout: 15_000 });
    await cachee(page, true);
    await cachee(page, false);
    expect((await sons(page)).musique.mode).toBe('fondu');
  });

  test('introduction : le geste « Toucher pour commencer » ouvre l\'audio, la musique attend la fin de l\'écran de chargement puis démarre sans autre geste', async ({ page }) => {
    await page.setViewportSize(REF);
    await page.addInitScript(() => {
      window.__contextes = 0;
      const Natif = window.AudioContext;
      window.AudioContext = class extends Natif {
        constructor(...args) {
          super(...args);
          window.__contextes += 1;
        }
      };
    });
    await page.goto('/jeu.html?test=1&menu=1&seed=1&intro=1&ouverture=0');
    await page.locator('#e0-commencer').click();
    await page.waitForFunction(() => window.__zsMenu.intro()?.phase === 'joue');
    // Pendant le logo : rien du menu, aucune musique.
    expect(await page.evaluate(() => typeof window.__zsMenu.sons)).toBe('undefined');
    await page.locator('#e0').click({ position: { x: 20, y: 20 } }); // « Toucher pour passer »
    // Écran de chargement : toujours pas de musique.
    await page.waitForFunction(() => typeof window.__zsMenu.sons === 'function');
    const pendant = await sons(page);
    expect(pendant.faits.geste).toBe(true);
    expect(pendant.musique.lecteur).toBeNull();
    await expect(page.locator('#menu-jouer')).toBeVisible({ timeout: 60_000 });
    await enMusique(page);
    const s = await sons(page);
    expect(s.musique.mode).toBe('joue');
    // Un seul contexte audio : celui de l'introduction, réutilisé.
    expect(await page.evaluate(() => window.__contextes)).toBe(1);
  });

  test('boucle sans coupure : rendu hors ligne de la vraie chaîne, aucun saut de niveau à la jointure plus grand qu\'aux autres changements de section', async ({ page }) => {
    await ouvrirMenu(page);
    const r = await page.evaluate(async () => {
      const { rendreHorsLigne } = await import('/js/menu/sons/musique.js');
      const { lireMusique, mesuresCycle, dureeMesure } = await import('/js/core/musique-menu.js');
      const d = await (await fetch('data/menu/sons.json')).json();
      const SR = 11025;
      const v = lireMusique(d.musique.variantes.find((x) => x.id === d.musique.defaut));
      const total = mesuresCycle(v);
      const centre = Math.round(2 * dureeMesure(v) * SR);
      const saut = (x) => {
        const n = Math.round(0.05 * SR);
        const h = Math.round(0.025 * SR);
        const f = [];
        for (let i = 0; i + n <= x.length; i += h) {
          let e = 0;
          for (let k = i; k < i + n; k += 1) e += x[k] * x[k];
          f.push(10 * Math.log10(e / n + 1e-9));
        }
        const k = Math.round(centre / h);
        let max = 0;
        let min = Infinity;
        for (let i = k - 4; i <= k + 4; i += 1) {
          max = Math.max(max, Math.abs(f[i] - f[i - 1]));
          min = Math.min(min, f[i]);
        }
        return { max, min };
      };
      const jointure = saut(await rendreHorsLigne(v, { debut: total - 2, mesures: 4, sampleRate: SR, reglages: d.musique }));
      const autres = [];
      let m = 0;
      for (const s of v.sections.slice(0, -1)) {
        m += s.mesures;
        autres.push(saut(await rendreHorsLigne(v, { debut: m - 2, mesures: 4, sampleRate: SR, reglages: d.musique })).max);
      }
      return { jointure, autres };
    });
    expect(r.jointure.max, JSON.stringify(r)).toBeLessThanOrEqual(Math.max(...r.autres) * 1.25 + 1);
    expect(r.jointure.min).toBeGreaterThan(-60); // jamais de silence : le bourdon tient
  });
});
