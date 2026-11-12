// Lot 8f : ouvertures de caisses en 3D (E3-2, E3-3 ; Docs/ref/menu-principal.md). ?test=1&menu=1 ; ouverture « pas à pas » (?ouverture=pas : le
// temps n'avance que par window.__zsOuverture.avancer) ; 932 × 430, 667 × 375, 2000 × 1020, téléphone à encoche simulé ; projets bureau et mobile
// (paysage). Graines des achats fixées en remplaçant crypto.getRandomValues ; résultats attendus par les fonctions pures (js/core/caisses.js,
// js/core/ouverture.js). Rendu logiciel : les mesures de fluidité ne sont pas jugées ici ; le budget de dessin l'est (renderer.info).
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { readFileSync } from 'node:fs';
import { lireCaisses, tirer, tirer10 } from '../../js/core/caisses.js';
import { lireCatalogue } from '../../js/core/equipement.js';
import { chronologie, lireOuvertures, rareteEffets } from '../../js/core/ouverture.js';

const REF = { width: 932, height: 430 };
const BRUIT = /GL Driver Message|GPU stall|swiftshader|WebGL/i; // messages du rendu logiciel de Chromium, sans rapport avec la page
const BUDGET = { appels: 150, triangles: 60_000 };
const lire = (f) => JSON.parse(readFileSync(f, 'utf8'));
const { cat } = lireCatalogue({ raretes: lire('data/menu/raretes.json'), objets: lire('data/menu/objets.json'), personnages: lire('data/menu/personnages.json'), inventaire: lire('data/menu/inventaire-depart.json') });
const { caisses } = lireCaisses(lire('data/menu/caisses.json'), cat);
const caisse = (id) => caisses.find((c) => c.id === id);
const { reglages: R } = lireOuvertures(lire('data/menu/ouvertures.json'), cat.raretes.map((r) => r.id));
const premiere = (f) => {
  for (let g = 1; g < 200_000; g += 1) if (f(g)) return g;
  throw new Error('aucune graine');
};
const G_RARE = premiere((g) => tirer(caisse('elite'), cat, g).rarete === 'rare');
const G_EPIQUE = premiere((g) => tirer(caisse('elite'), cat, g).rarete === 'epique');
const G_LEGENDAIRE = premiere((g) => tirer(caisse('elite'), cat, g).rarete === 'legendaire');
// ×10 avec un seul légendaire, un épique et un rare (pire cas du budget : légendaire en ×10).
const G_DIX = premiere((g) => {
  const t = tirer10(caisse('elite'), cat, g).map((o) => o.rarete);
  return t.filter((r) => r === 'legendaire').length === 1 && t.includes('epique') && t.includes('rare');
});
const chronoDe = (objets, graine) => chronologie(R, objets.map((o) => rareteEffets({ type: 'equipement', objets }, objets.indexOf(o), cat.raretes)), { graine });

function surveiller(page, baseURL) {
  const problemes = [];
  const externes = [];
  const fichiers = [];
  page.on('console', (m) => ['error', 'warning'].includes(m.type()) && !BRUIT.test(m.text()) && problemes.push(m.text()));
  page.on('pageerror', (e) => problemes.push(e.message));
  page.on('request', (r) => {
    const u = r.url();
    if (!u.startsWith(baseURL) && !u.startsWith('data:') && !u.startsWith('blob:')) externes.push(u);
    else if (u.startsWith(baseURL)) fichiers.push(new URL(u).pathname);
  });
  return { problemes, externes, fichiers };
}
// Écritures dans le stockage (aucune permise) et contextes WebGL créés par la page (tous perdus après l'ouverture).
async function espions(page, { sansWebgl = false } = {}) {
  await page.addInitScript((sans) => {
    window.__ecritures = [];
    const set = Storage.prototype.setItem;
    Storage.prototype.setItem = function (k, v) { window.__ecritures.push(k); return set.call(this, k, v); };
    window.__contextes = [];
    const orig = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type, ...a) {
      if (sans && /webgl/i.test(type)) return null; // WebGL indisponible (simulé)
      const c = orig.call(this, type, ...a);
      if (c && /webgl/i.test(type) && !window.__contextes.includes(c)) window.__contextes.push(c);
      return c;
    };
  }, sansWebgl);
}
const contextesVivants = (page) => page.evaluate(() => window.__contextes.filter((c) => !c.isContextLost()).length);
async function graines(page, liste) {
  await page.addInitScript((l) => {
    const file = [...l];
    const orig = crypto.getRandomValues.bind(crypto);
    crypto.getRandomValues = (a) => {
      if (a instanceof Uint32Array && a.length === 1 && file.length) {
        a[0] = file.shift();
        return a;
      }
      return orig(a);
    };
  }, liste);
}
async function ouvrirBoutique(page, size = REF, mode = 'pas') {
  await page.setViewportSize(size);
  await page.goto(`/jeu.html?test=1&menu=1&seed=1${mode ? `&ouverture=${mode}` : ''}`);
  await expect(page.locator('#menu-jouer')).toBeVisible({ timeout: 60_000 });
  await page.waitForFunction(() => window.__zsMenu?.etat()?.menu !== null && !document.getElementById('e7'));
  await page.locator('#menu-onglet-boutique').click();
  await expect(page.locator('#menu-ecran-boutique')).toBeVisible();
}
const ouv = (page) => page.evaluate(() => window.__zsOuverture?.etat() ?? null);
const avancer = (page, s) => page.evaluate((d) => window.__zsOuverture.avancer(d), s);
// Va au temps t (secondes depuis le début de l'ouverture).
const aller = async (page, t) => {
  const e = await ouv(page);
  return avancer(page, t - e.temps);
};
async function attendreOuverture(page) {
  await expect(page.locator('#menu-ecran-ouverture')).toBeVisible({ timeout: 30_000 });
  await page.waitForFunction(() => window.__zsOuverture?.etat()?.actif === true);
}
const boite = (page, sel) => page.locator(sel).first().evaluate((n) => {
  const r = n.getBoundingClientRect();
  return { l: r.left, t: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height };
});
const chevauche = (x, y) => x.l < y.r - 0.5 && y.l < x.r - 0.5 && x.t < y.b - 0.5 && y.t < x.b - 0.5;
const etatBoutique = (page) => page.evaluate(() => window.__zsMenu.etat().menu.boutique);
// Pixels du canevas (capture) : écart-type de la luminance (la scène n'est pas unie).
async function ecartType(page) {
  const png = await page.locator('#menu-ecran-ouverture canvas').screenshot();
  return page.evaluate(async (b64) => {
    const img = new Image();
    img.src = `data:image/png;base64,${b64}`;
    await img.decode();
    const c = new OffscreenCanvas(img.width, img.height);
    const ctx = c.getContext('2d');
    ctx.drawImage(img, 0, 0);
    const d = ctx.getImageData(0, 0, img.width, img.height).data;
    let s = 0;
    let s2 = 0;
    const n = d.length / 4;
    for (let i = 0; i < d.length; i += 4) {
      const l = 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
      s += l;
      s2 += l * l;
    }
    return Math.sqrt(s2 / n - (s / n) ** 2);
  }, png.toString('base64'));
}

test.describe('ouverture ×1 (E3-2)', () => {
  test('achat ×1 : Three.js chargé au toucher de « Ouvrir » (jamais avant), scène 3D, carte = tirage, puis « Continuer » ; tout libéré, aucun contexte restant, mémoire à zéro ; budget ; aucune écriture, aucune requête externe, console propre', async ({ page, baseURL }, info) => {
    test.setTimeout(120_000);
    const o = surveiller(page, baseURL);
    await espions(page);
    await graines(page, [G_RARE]);
    await ouvrirBoutique(page);
    // Démarrage du menu et onglet Boutique : ni Three.js, ni l'ouverture.
    const avant = [...o.fichiers];
    expect(avant.filter((f) => /vendor\/three|js\/menu\/ouverture\/|ouvertures\.(css|json)|characters-v2/.test(f))).toEqual([]);
    await page.locator('#menu-caisse-elite-un').dispatchEvent('pointerdown');
    await expect.poll(() => o.fichiers.some((f) => f.endsWith('vendor/three/three.module.js'))).toBe(true);
    await page.locator('#menu-caisse-elite-un').click();
    await attendreOuverture(page);
    const attendu = tirer(caisse('elite'), cat, G_RARE);
    const e0 = await ouv(page);
    expect([e0.quantite, e0.cartes.map((c) => c.objet), e0.raretes]).toEqual([1, [attendu.id], ['rare']]);
    expect(e0.cartes[0].nom).toBe(cat.objets.get(attendu.id).nom);
    // Écran plein (barre d'onglets masquée), scène décorative, « Passer » au clavier (focus).
    await expect(page.locator('.e8-onglets')).toBeHidden();
    await expect(page.locator('#menu-ecran-ouverture canvas')).toHaveAttribute('aria-hidden', 'true');
    await expect(page.locator('#menu-ouverture-passer')).toBeFocused();
    expect((await etatBoutique(page)).vue).toBe('ouverture');
    // Chronologie : la carte n'apparaît qu'après le couvercle ; « Continuer » et « Rouvrir » à la fin ; résultat annoncé.
    const c = e0.chronologie[0];
    await aller(page, c.tir + 0.05);
    expect((await ouv(page)).instant.active).toBe(0);
    await expect(page.locator('#menu-ouverture-actions')).toBeHidden();
    await page.screenshot({ path: info.outputPath('x1-tir.png') });
    await aller(page, c.objet[1] + 0.05);
    await page.screenshot({ path: info.outputPath('x1-objet.png') });
    expect(await ecartType(page)).toBeGreaterThan(6);
    await aller(page, e0.fin + 0.1);
    await expect(page.locator('#menu-ouverture-actions')).toBeVisible();
    await expect(page.locator('#menu-ouverture-continuer')).toBeFocused();
    await expect(page.locator('#menu-ouverture-annonce')).toContainText(cat.objets.get(attendu.id).nom);
    const fin = await ouv(page);
    expect(fin.rendu.pic.appels).toBeLessThanOrEqual(BUDGET.appels);
    expect(fin.rendu.pic.triangles).toBeLessThanOrEqual(BUDGET.triangles);
    expect(fin.rendu.pixels).toBeLessThanOrEqual(2);
    expect(await contextesVivants(page)).toBe(1);
    await page.locator('#menu-ouverture-continuer').click();
    // Retour aux caisses, focus rendu au bouton d'achat ; tout est libéré.
    await expect(page.locator('#menu-ecran-boutique')).toBeVisible();
    await expect(page.locator('#menu-caisse-elite-un')).toBeFocused();
    await expect(page.locator('#menu-ecran-ouverture')).toHaveCount(0);
    const lib = (await ouv(page)).liberation;
    expect(lib).toEqual({ geometries: 0, textures: 0, contextePerdu: true });
    expect(await contextesVivants(page)).toBe(0);
    expect(await page.locator('canvas').count()).toBe(0);
    // L'objet est dans l'inventaire en mémoire (ajouté par le tirage, comme au lot 8e) ; prix jamais prélevés ; rien n'est écrit.
    expect((await etatBoutique(page)).dernier.objets).toEqual([attendu]);
    await expect(page.locator('#menu-solde-texte')).toHaveText('0');
    expect(await page.evaluate(() => window.__ecritures)).toEqual([]);
    expect([o.problemes, o.externes]).toEqual([[], []]);
  });

  test('« Passer » à tout moment et Échap : résultat identique au tirage, focus sur « Continuer » ; « Rouvrir » : une seule ouverture à la fois ; puis « JOUER » : la partie démarre', async ({ page, baseURL }) => {
    test.setTimeout(150_000);
    const o = surveiller(page, baseURL);
    await espions(page);
    await graines(page, [G_EPIQUE, G_RARE, G_LEGENDAIRE, G_RARE]);
    await ouvrirBoutique(page);
    const attendus = [G_EPIQUE, G_RARE, G_LEGENDAIRE, G_RARE].map((g) => tirer(caisse('elite'), cat, g));
    // 0. Retour du propriétaire : pendant le chargement de l'ouverture (Three.js ralenti ici), roue qui tourne et commandes figées (inert).
    await page.route('**/vendor/three/three.module.js', async (route) => {
      await new Promise((res) => setTimeout(res, 1500));
      await route.continue();
    });
    // Retour du propriétaire (écran figé après la roue) : écran de résultat lent au premier achat, second toucher aussitôt : un seul achat, une
    // seule ouverture, menu figé dès le premier toucher puis rendu actif.
    await page.route('**/js/menu/resultat.js', async (route) => {
      await new Promise((res) => setTimeout(res, 800));
      await route.continue();
    });
    // 1. « Passer » pendant l'arrivée.
    await page.locator('#menu-caisse-elite-un').click();
    await page.locator('#menu-caisse-militaire-un').dispatchEvent('click');
    await expect(page.locator('#menu-ouverture-chargement')).toBeVisible();
    await expect(page.locator('#menu-ouverture-chargement')).toHaveAttribute('role', 'status');
    expect(await page.locator('#menu-caisse-militaire-un').evaluate((n) => Boolean(n.closest('[inert]')))).toBe(true);
    await attendreOuverture(page);
    await expect(page.locator('#menu-ouverture-chargement')).toHaveCount(0);
    expect((await etatBoutique(page)).achats).toBe(1);
    expect(await page.locator('#menu-ecran-ouverture').count()).toBe(1);
    expect(await contextesVivants(page)).toBe(1);
    await avancer(page, 1);
    await page.locator('#menu-ouverture-passer').click();
    await expect(page.locator('#menu-ecran-resultat')).toBeVisible();
    await expect(page.locator('#menu-resultat-continuer')).toBeFocused();
    expect(await page.locator('#menu-resultat-continuer').evaluate((n) => Boolean(n.closest('[inert]')))).toBe(false);
    expect(await page.locator('#e8 [inert]').count()).toBe(0);
    let r = (await etatBoutique(page)).resultat;
    expect(r.cartes.map((x) => [x.objet, x.rarete])).toEqual([[attendus[0].id, attendus[0].rarete]]);
    expect(await contextesVivants(page)).toBe(0);
    // 2. « Rouvrir » depuis le résultat, Échap pendant la carte.
    await page.locator('#menu-resultat-rouvrir').click();
    await attendreOuverture(page);
    const e = await ouv(page);
    await aller(page, e.chronologie[0].objet[0] + 0.2);
    await page.keyboard.press('Escape');
    await expect(page.locator('#menu-ecran-resultat')).toBeVisible();
    r = (await etatBoutique(page)).resultat;
    expect(r.cartes.map((x) => x.objet)).toEqual([attendus[1].id]);
    expect(await contextesVivants(page)).toBe(0);
    // 3. Fin de l'ouverture ×1, « Rouvrir » de la scène : nouvelle ouverture, un seul canevas.
    await page.locator('#menu-resultat-rouvrir').click();
    await attendreOuverture(page);
    await aller(page, (await ouv(page)).fin + 0.1);
    await page.locator('#menu-ouverture-rouvrir').click();
    await attendreOuverture(page);
    expect(await page.locator('canvas').count()).toBe(1);
    expect(await contextesVivants(page)).toBe(1);
    expect((await ouv(page)).cartes.map((x) => x.objet)).toEqual([attendus[3].id]);
    await page.locator('#menu-ouverture-passer').click();
    await expect(page.locator('#menu-ecran-resultat')).toBeVisible();
    expect(await contextesVivants(page)).toBe(0);
    // Inventaire en mémoire : les quatre objets, dans l'ordre des achats ; rien n'est écrit.
    expect(await page.evaluate(() => window.__ecritures)).toEqual([]);
    // 4. « JOUER » : la partie démarre normalement (un seul contexte WebGL : celui du jeu).
    await page.locator('#menu-resultat-continuer').click();
    await page.locator('#menu-onglet-jouer').click();
    await page.locator('#menu-jouer').click();
    await page.waitForFunction(() => (window.__zs?.getState()?.time ?? 0) > 0.05, null, { timeout: 90_000 });
    expect(await contextesVivants(page)).toBe(1);
    expect([o.problemes, o.externes]).toEqual([[], []]);
  });

  test('mouvement réduit : résultat direct, rien de l\'ouverture chargé ; WebGL indisponible (simulé) : résultat direct, sans erreur', async ({ page, baseURL, browser }) => {
    test.setTimeout(120_000);
    const o = surveiller(page, baseURL);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await graines(page, [G_EPIQUE]);
    await ouvrirBoutique(page, REF, null);
    await page.locator('#menu-caisse-elite-un').dispatchEvent('pointerdown');
    await page.locator('#menu-caisse-elite-un').click();
    await expect(page.locator('#menu-ecran-resultat')).toBeVisible();
    expect((await etatBoutique(page)).resultat.cartes.map((x) => x.objet)).toEqual([tirer(caisse('elite'), cat, G_EPIQUE).id]);
    expect(o.fichiers.filter((f) => /vendor\/three|js\/menu\/ouverture\/|ouvertures\./.test(f))).toEqual([]);
    expect(o.problemes).toEqual([]);
    // WebGL indisponible : nouvel onglet, getContext('webgl2') renvoie null.
    const page2 = await browser.newPage();
    const o2 = surveiller(page2, baseURL);
    await espions(page2, { sansWebgl: true });
    await graines(page2, [G_RARE]);
    await ouvrirBoutique(page2, REF, null);
    await page2.locator('#menu-caisse-elite-un').click();
    await expect(page2.locator('#menu-ecran-resultat')).toBeVisible({ timeout: 30_000 });
    expect((await page2.evaluate(() => window.__zsMenu.etat().menu.boutique.resultat.cartes.map((x) => x.objet)))).toEqual([tirer(caisse('elite'), cat, G_RARE).id]);
    await expect(page2.locator('#menu-ecran-ouverture')).toHaveCount(0);
    expect([o2.problemes, o2.externes]).toEqual([[], []]);
    await page2.close();
  });

  test('légendaire ×1 : explosion, projection environ 0,7 s après, zombie écrasé (assombrissement), glissade avec traînées, carte dorée révélée, réapparition ; budget ; captures', async ({ page, baseURL }, info) => {
    test.setTimeout(120_000);
    const o = surveiller(page, baseURL);
    await espions(page);
    await graines(page, [G_LEGENDAIRE]);
    await ouvrirBoutique(page);
    await page.locator('#menu-caisse-elite-un').click();
    await attendreOuverture(page);
    const e = await ouv(page);
    const attendu = tirer(caisse('elite'), cat, G_LEGENDAIRE);
    const ch = chronoDe([attendu], G_LEGENDAIRE);
    expect(e.raretes).toEqual(['legendaire']);
    const P = e.chronologie[0].projection;
    expect(P).toEqual(JSON.parse(JSON.stringify(ch.caisses[0].projection)));
    expect(['gauche', 'droite']).toContain(P.cote);
    const instants = { tir: e.chronologie[0].tir + 0.04, explosion: e.chronologie[0].tir + 0.35, colle: P.impact + 0.3, glissade: P.decolle + 0.5, retour: P.apparition + 0.5 };
    for (const [nom, t] of Object.entries(instants)) {
      await aller(page, t);
      await page.screenshot({ path: info.outputPath(`legendaire-${nom}.png`) });
      const s = (await ouv(page)).instant;
      if (nom === 'colle') expect(s.sombre).toBeGreaterThan(0.5);
      if (nom === 'retour') expect(s.sombre).toBe(0);
    }
    await aller(page, e.fin + 0.1);
    await expect(page.locator('#menu-ouverture-actions')).toBeVisible();
    const fin = await ouv(page);
    expect(fin.rendu.pic.appels).toBeLessThanOrEqual(BUDGET.appels);
    expect(fin.rendu.pic.triangles).toBeLessThanOrEqual(BUDGET.triangles);
    info.annotations.push({ type: 'budget ×1 légendaire', description: JSON.stringify(fin.rendu.pic) });
    await page.locator('#menu-ouverture-passer').click();
    await expect(page.locator('#menu-ecran-resultat')).toBeVisible();
    expect((await ouv(page)).liberation).toEqual({ geometries: 0, textures: 0, contextePerdu: true });
    expect(await contextesVivants(page)).toBe(0);
    expect([o.problemes, o.externes]).toEqual([[], []]);
  });

  test('tailles (667 × 375, 2000 × 1020, encoche simulée) : « Passer », « Continuer » et « Rouvrir » dans la zone sûre, 44 px, sans superposition ; axe', async ({ page, baseURL }) => {
    test.setTimeout(120_000);
    const o = surveiller(page, baseURL);
    await graines(page, [G_RARE]);
    await ouvrirBoutique(page, { width: 667, height: 375 });
    await page.locator('#menu-caisse-elite-un').click();
    await attendreOuverture(page);
    await aller(page, (await ouv(page)).fin + 0.1);
    for (const [size, marge] of [[{ width: 667, height: 375 }, 16], [{ width: 2000, height: 1020 }, 16], [{ width: 762, height: 351 }, 50]]) {
      await page.setViewportSize(size);
      if (marge === 50) await page.addStyleTag({ content: '#menu-ecran-ouverture { --ouv-marge-d: 50px !important; }' });
      await avancer(page, 0.05);
      const b = { passer: await boite(page, '#menu-ouverture-passer'), continuer: await boite(page, '#menu-ouverture-continuer'), rouvrir: await boite(page, '#menu-ouverture-rouvrir'), canvas: await boite(page, '#menu-ecran-ouverture canvas') };
      const nom = `${size.width}×${size.height}`;
      expect([b.canvas.w, b.canvas.h], nom).toEqual([size.width, size.height]);
      for (const k of ['passer', 'continuer', 'rouvrir']) {
        expect([b[k].r <= size.width - marge + 0.5, b[k].t >= 15.5, b[k].b <= size.height, b[k].w >= 43.5, b[k].h >= 43.5], `${nom} ${k}`).toEqual([true, true, true, true, true]);
      }
      expect([chevauche(b.passer, b.continuer), chevauche(b.passer, b.rouvrir), chevauche(b.continuer, b.rouvrir)], nom).toEqual([false, false, false]);
    }
    expect((await new AxeBuilder({ page }).analyze()).violations.map((v) => v.id)).toEqual([]);
    expect([o.problemes, o.externes]).toEqual([[], []]);
  });
});

test.describe('ouverture ×10 (E3-3)', () => {
  test('dix caisses dans l\'ordre du tirage, cases remplies dans l\'ordre à l\'arrivée de chaque carte, caisse dorée plus longue ; fin : résultat ×10 identique ; budget pire cas (×10 avec un légendaire) ; tout libéré', async ({ page, baseURL }, info) => {
    test.setTimeout(150_000);
    const o = surveiller(page, baseURL);
    await espions(page);
    await graines(page, [G_DIX]);
    await ouvrirBoutique(page);
    await page.locator('#menu-caisse-elite-dix').click();
    await attendreOuverture(page);
    const attendus = tirer10(caisse('elite'), cat, G_DIX);
    const e = await ouv(page);
    expect(e.quantite).toBe(10);
    expect(e.cartes.map((c) => c.objet)).toEqual(attendus.map((x) => x.id));
    expect(e.raretes).toEqual(attendus.map((x) => x.rarete));
    const ch = chronoDe(attendus, G_DIX);
    expect(e.chronologie.map((c) => c.case)).toEqual(ch.caisses.map((c) => c.case));
    for (const c of e.chronologie) expect(c.fin - c.debut, c.rarete).toBeCloseTo(c.rarete === 'legendaire' ? R.legendaire.duree : R.x10.periode, 6);
    await expect(page.locator('#menu-ouverture-cases > li')).toHaveCount(10);
    // Cases : vides avant l'arrivée de chaque carte, remplies (bord de la rareté) dans l'ordre.
    for (const [i, c] of e.chronologie.entries()) {
      await aller(page, c.case - 0.05);
      expect((await ouv(page)).cases).toEqual([...Array(i).keys()]);
      if (i === 0) await page.screenshot({ path: info.outputPath('x10-carte.png') });
      await aller(page, c.case + 0.02);
      expect((await ouv(page)).cases).toEqual([...Array(i + 1).keys()]);
      await expect(page.locator(`#menu-ouverture-cases > li[data-rang="${i}"]`)).toHaveAttribute('data-rempli', 'true');
      if (c.projection) {
        await aller(page, c.projection.impact + 0.3);
        await page.screenshot({ path: info.outputPath('x10-projection.png') });
      }
    }
    const pic = (await ouv(page)).rendu.pic;
    info.annotations.push({ type: 'budget ×10 avec un légendaire', description: JSON.stringify(pic) });
    expect(pic.appels).toBeLessThanOrEqual(BUDGET.appels);
    expect(pic.triangles).toBeLessThanOrEqual(BUDGET.triangles);
    // Fin de l'ouverture ×10 : le résultat ×10, identique au tirage, focus sur « Continuer ».
    await aller(page, e.fin + 0.05);
    await expect(page.locator('#menu-ecran-resultat')).toBeVisible();
    await expect(page.locator('#menu-resultat-continuer')).toBeFocused();
    const r = (await etatBoutique(page)).resultat;
    expect([r.quantite, r.cartes.map((x) => [x.objet, x.rarete])]).toEqual([10, attendus.map((x) => [x.id, x.rarete])]);
    expect((await ouv(page)).liberation).toEqual({ geometries: 0, textures: 0, contextePerdu: true });
    expect(await contextesVivants(page)).toBe(0);
    expect(await page.evaluate(() => window.__ecritures)).toEqual([]);
    expect([o.problemes, o.externes]).toEqual([[], []]);
  });

  test('« Passer » au milieu d\'un ×10 : résultat ×10 identique, libéré ; mouvement réduit : résultat ×10 direct ; tailles : rangée de cases et « Passer » dans l\'écran, sans superposition, 44 px ; axe', async ({ page, baseURL }) => {
    test.setTimeout(150_000);
    const o = surveiller(page, baseURL);
    await espions(page);
    await graines(page, [G_DIX, G_DIX]);
    await ouvrirBoutique(page, { width: 667, height: 375 });
    await page.locator('#menu-caisse-ravitaillement-dix').click();
    await attendreOuverture(page);
    const attendus = tirer10(caisse('ravitaillement'), cat, G_DIX);
    const e = await ouv(page);
    // Retour du propriétaire : toucher l'écran passe la caisse en cours (sa carte va dans sa case, la suivante arrive).
    await aller(page, e.chronologie[3].tir + 0.1);
    expect((await ouv(page)).cases).toEqual([0, 1, 2]);
    await page.locator('#menu-ecran-ouverture canvas').click({ position: { x: 200, y: 200 } });
    const apres = await ouv(page);
    expect([apres.sauts, apres.temps, apres.cases]).toEqual([1, e.chronologie[3].fin, [0, 1, 2, 3]]);
    await aller(page, e.chronologie[4].case + 0.1);
    expect((await ouv(page)).cases).toEqual([0, 1, 2, 3, 4]);
    for (const [size, marge] of [[{ width: 667, height: 375 }, 16], [{ width: 2000, height: 1020 }, 16], [{ width: 932, height: 430 }, 16], [{ width: 762, height: 351 }, 50]]) {
      await page.setViewportSize(size);
      if (marge === 50) await page.addStyleTag({ content: '#menu-ecran-ouverture { --ouv-marge-d: 50px !important; }' });
      await avancer(page, 0.01);
      const nom = `${size.width}×${size.height}`;
      const p = await boite(page, '#menu-ouverture-passer');
      const rangee = await boite(page, '#menu-ouverture-cases');
      expect([rangee.l >= marge - 0.5, rangee.r <= size.width - marge + 0.5, rangee.t >= 15.5, p.r <= size.width - marge + 0.5, p.w >= 43.5, p.h >= 43.5], nom).toEqual([true, true, true, true, true, true]);
      expect(chevauche(p, rangee), nom).toBe(false);
    }
    expect((await new AxeBuilder({ page }).analyze()).violations.map((v) => v.id)).toEqual([]);
    // Pas de réticule (retour du propriétaire).
    await expect(page.locator('#menu-ecran-ouverture .e3-ouv-reticule')).toHaveCount(0);
    await page.locator('#menu-ouverture-passer').click();
    await expect(page.locator('#menu-ecran-resultat')).toBeVisible();
    let r = (await etatBoutique(page)).resultat;
    expect(r.cartes.map((x) => x.objet)).toEqual(attendus.map((x) => x.id));
    expect(await contextesVivants(page)).toBe(0);
    await expect(page.locator('#menu-ecran-ouverture')).toHaveCount(0);
    // Mouvement réduit : rachat ×10, résultat direct.
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.locator('#menu-resultat-rouvrir').click();
    await expect(page.locator('#menu-ecran-resultat')).toBeVisible();
    await expect(page.locator('#menu-ecran-ouverture')).toHaveCount(0);
    r = (await etatBoutique(page)).resultat;
    expect(r.cartes.map((x) => x.objet)).toEqual(attendus.map((x) => x.id));
    expect(await page.evaluate(() => window.__ecritures)).toEqual([]);
    expect([o.problemes, o.externes]).toEqual([[], []]);
  });
});
