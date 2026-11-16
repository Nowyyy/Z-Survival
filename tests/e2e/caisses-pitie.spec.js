import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { readFileSync } from 'node:fs';
import { lireCaisses, lireCosmetiques, lirePitie, tirerPitie } from '../../js/core/caisses.js';
import { lireCatalogue } from '../../js/core/equipement.js';
import { CLE_V2, poserProgression, progressionDemo } from './helpers.js';

// Lot 8k (Docs/ref/economie.md) : une caisse par rubrique (Équipement, Personnages, Cosmétiques), 100 médailles (×10 : 1 000), pitié par rubrique
// affichée dans « Voir les chances » et gardée dans zs.save.v2 ; garantie déclenchée (compteurs préparés dans la progression) ; ouvertures 3D de
// chaque rubrique ; « Il manque N médailles ». Graines des achats fixées en remplaçant crypto.getRandomValues ; résultats attendus = tirerPitie.
const lire = (f) => JSON.parse(readFileSync(f, 'utf8'));
const { cat } = lireCatalogue({ raretes: lire('data/menu/raretes.json'), objets: lire('data/menu/objets.json'), personnages: lire('data/menu/personnages.json') });
cat.cosmetiques = lireCosmetiques(lire('data/menu/cosmetiques.json'), cat.raretes);
const { caisses } = lireCaisses(lire('data/menu/caisses.json'), cat);
const { regles } = lirePitie(lire('data/menu/caisses.json'), cat);
const caisse = (id) => caisses.find((c) => c.id === id);
const REF = { width: 932, height: 430 };
const NNBSP = String.fromCharCode(0x202f);
const stocke = (page) => page.evaluate((k) => JSON.parse(localStorage.getItem(k)), CLE_V2);
const etatBoutique = (page) => page.evaluate(() => window.__zsMenu.etat().menu.boutique);

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
async function ouvrirBoutique(page, { size = REF, ouverture = '0' } = {}) {
  await page.setViewportSize(size);
  await page.goto(`/jeu.html?test=1&menu=1&seed=1&store=local${ouverture === null ? '' : `&ouverture=${ouverture}`}`);
  await expect(page.locator('#menu-jouer')).toBeVisible({ timeout: 60_000 });
  await page.waitForFunction(() => window.__zsMenu?.etat()?.menu !== null && !document.getElementById('e7'));
  await page.locator('#menu-onglet-boutique').click();
  await expect(page.locator('#menu-ecran-boutique')).toBeVisible();
}
function externes(page, baseURL) {
  const liste = [];
  page.on('request', (r) => {
    const u = r.url();
    if (!u.startsWith(baseURL) && !u.startsWith('data:') && !u.startsWith('blob:')) liste.push(u);
  });
  return liste;
}
async function compteurs(page, id) {
  await page.locator(`#menu-caisse-${id}-chances`).click();
  await expect(page.locator('.e3-chances-compteur')).toHaveCount(1); // retour du propriétaire : légendaire seulement
  const texte = await page.locator('.e3-chances-compteur').allTextContents();
  await page.locator('#menu-ecran-chances-fermer').click();
  return texte;
}

test.describe('caisses uniques et pitié (lot 8k)', () => {
  test('×1 puis ×10 (équipement) : 100 puis 1 000 médailles prélevés avec les objets et les compteurs (une écriture par achat) ; « Voir les chances » suit les compteurs, gardés après rechargement ; bleue intacte ; aucune requête externe', async ({ page, baseURL }) => {
    test.setTimeout(120_000);
    const ext = externes(page, baseURL);
    await poserProgression(page, progressionDemo({ medailles: 1500 }));
    await graines(page, [11, 12]);
    await ouvrirBoutique(page);
    const c = caisse('equipement');
    expect(await compteurs(page, 'equipement')).toEqual(['Légendaire garanti dans 70 tirages au plus']);
    const un = tirerPitie(c, cat, regles, { e: 0, l: 0 }, 11, 1);
    await page.locator('#menu-caisse-equipement-un').click();
    await expect(page.locator('#menu-ecran-resultat')).toBeVisible();
    expect((await etatBoutique(page)).dernier.objets).toEqual(un.objets);
    await page.locator('#menu-resultat-continuer').click();
    const dix = tirerPitie(c, cat, regles, un.compteurs, 12, 10);
    await page.locator('#menu-caisse-equipement-dix').click();
    await expect(page.locator('#menu-ecran-resultat')).toBeVisible();
    const b = await etatBoutique(page);
    expect(b.dernier.objets).toEqual(dix.objets);
    expect(b.dernier.compteurs).toEqual({ r: 'equipement', de: un.compteurs, a: dix.compteurs });
    await page.locator('#menu-resultat-continuer').click();
    const s = await stocke(page);
    expect([s.medailles, s.bleu, s.pitie.equipement, s.pitie.personnage]).toEqual([{ gagne: 1500, depense: 1100, jour: 0 }, { gagne: 100_000, depense: 0 }, dix.compteurs, { e: 0, l: 0 }]);
    await expect(page.locator('#menu-medailles-texte')).toHaveText('400');
    const attendu = [`Légendaire garanti dans ${70 - dix.compteurs.l} tirages au plus`];
    expect(await compteurs(page, 'equipement')).toEqual(attendu);
    expect(await compteurs(page, 'personnages')).toEqual(['Légendaire garanti dans 70 tirages au plus']); // compteur propre à chaque rubrique
    await page.reload();
    await expect(page.locator('#menu-jouer')).toBeVisible({ timeout: 60_000 });
    await page.waitForFunction(() => window.__zsMenu?.etat()?.menu !== null && !document.getElementById('e7'));
    await page.locator('#menu-onglet-boutique').click();
    expect(await compteurs(page, 'equipement')).toEqual(attendu);
    expect((await etatBoutique(page)).pitie.compteurs.equipement).toEqual(dix.compteurs);
    expect(ext).toEqual([]);
  });

  test('aperçu à droite de chaque caisse (retour du propriétaire) : pitié de la rubrique (compteurs, barres, chance du prochain tirage) et légendaires possibles ; mis à jour après un achat ; à côté de la caisse, sans chevauchement ; axe', async ({ page }) => {
    test.setTimeout(120_000);
    await poserProgression(page, progressionDemo({ medailles: 500, extra: { pitie: { equipement: { e: 7, l: 52 }, personnage: { e: 0, l: 0 }, cosmetique: { e: 0, l: 0 } } } }));
    await graines(page, [31]);
    await ouvrirBoutique(page);
    const ap = page.locator('#menu-caisse-equipement-apercu');
    await expect(ap).toBeVisible();
    await expect(ap.locator('.e3-apercu-titre')).toHaveText(['Ta pitié dans cette caisse', 'Légendaires possibles']);
    // Retour du propriétaire : seulement la pitié du légendaire (rien sur la garantie épique, compteur épique de 7 non affiché).
    await expect(ap.locator('.e3-apercu-compte')).toHaveText(['52 / 70']);
    await expect(ap.locator('.e3-apercu-texte')).toHaveText(['Légendaire garanti dans 18 tirages au plus']);
    await expect(ap.locator('.e3-apercu-pitie')).not.toContainText('Épique');
    await expect(ap.locator('.e3-apercu-chance')).toHaveText('Prochain tirage : 16 % de chance de légendaire (en hausse).');
    const legs = cat.objets.size;
    await expect(ap.locator('.e3-apercu-element')).toHaveCount(Math.min(6, legs));
    if (legs > 6) await expect(ap.locator('.e3-apercu-autres')).toHaveText(`et ${legs - 6} autres`);
    // Retour du propriétaire : une seule jauge, celle du légendaire (52 / 70) ; « épique ou mieux » sans jauge.
    await expect(ap.locator('.e3-apercu-barre')).toHaveCount(1);
    await expect(ap.locator('[data-pitie="haute"]')).toHaveCount(0);
    const largeur = await ap.locator('[data-pitie="top"] .e3-apercu-plein').evaluate((n) => n.getBoundingClientRect().width / n.parentElement.clientWidth);
    expect(Math.abs(largeur - 52 / 70)).toBeLessThan(0.03);
    const perso = page.locator('#menu-caisse-personnages-apercu');
    await expect(perso.locator('.e3-apercu-element')).toHaveText(cat.personnages.filter((p) => p.rarete === 'legendaire').map((p) => p.nom));
    await expect(perso.locator('.e3-apercu-chance')).toHaveText('Prochain tirage : 1 % de chance de légendaire (en hausse dès le 51e).');
    await expect(page.locator('#menu-caisse-cosmetiques-apercu .e3-apercu-element')).toHaveText(cat.cosmetiques.filter((x) => x.rarete === 'legendaire').map((x) => x.nom));
    // À côté de la caisse (même rangée à 932 × 430), sans chevauchement, dans l'écran.
    const [carte, boite] = await Promise.all([page.locator('.e3-carte[data-caisse="equipement"]').boundingBox(), ap.boundingBox()]);
    expect(boite.x).toBeGreaterThanOrEqual(carte.x + carte.width - 0.5);
    expect(Math.abs(boite.y - carte.y)).toBeLessThan(1);
    expect(boite.x + boite.width).toBeLessThanOrEqual(REF.width);
    // Après un achat ×1, l'aperçu suit les nouveaux compteurs.
    const un = tirerPitie(caisse('equipement'), cat, regles, { e: 7, l: 52 }, 31, 1);
    await page.locator('#menu-caisse-equipement-un').click();
    await expect(page.locator('#menu-ecran-resultat')).toBeVisible();
    await page.locator('#menu-resultat-continuer').click();
    await expect(ap.locator('.e3-apercu-compte')).toHaveText([`${un.compteurs.l} / 70`]);
    await expect.poll(async () => (await new AxeBuilder({ page }).include('#menu-boutique-equipement').analyze()).violations.map((v) => v.id), { timeout: 10_000 }).toEqual([]);
  });

  test('garantie déclenchée : compteurs préparés (9 sans épique, 69 sans légendaire) → légendaire au premier tirage ; (9, 0) → épique ou mieux ; compteurs remis à 0', async ({ page }) => {
    test.setTimeout(120_000);
    await poserProgression(page, progressionDemo({ medailles: 500, extra: { pitie: { equipement: { e: 9, l: 69 }, personnage: { e: 9, l: 3 }, cosmetique: { e: 2, l: 2 } } } }));
    await graines(page, [1, 2]);
    await ouvrirBoutique(page);
    expect(await compteurs(page, 'equipement')).toEqual(['Légendaire garanti au prochain tirage']);
    await page.locator('#menu-caisse-equipement-un').click();
    await expect(page.locator('#menu-ecran-resultat')).toBeVisible();
    expect((await etatBoutique(page)).dernier.objets[0].rarete).toBe('legendaire');
    await expect(page.locator('#menu-resultat-rarete')).toHaveText('Légendaire');
    await page.locator('#menu-resultat-continuer').click();
    await page.locator('#menu-caisse-personnages-un').click();
    await expect(page.locator('#menu-ecran-resultat')).toBeVisible();
    const perso = (await etatBoutique(page)).dernier.objets[0];
    expect(['epique', 'legendaire']).toContain(perso.rarete);
    expect(perso).toEqual(tirerPitie(caisse('personnages'), cat, regles, { e: 9, l: 3 }, 2, 1).objets[0]);
    await page.locator('#menu-resultat-continuer').click();
    const s = await stocke(page);
    expect([s.pitie.equipement, s.pitie.personnage.e, s.medailles.depense]).toEqual([{ e: 0, l: 0 }, 0, 200]);
  });

  // Lot 9a : titre gardé (motif du palier et mesures de durée) ; « médailles » y désigne la monnaie des caisses, appelée « diamants » depuis ce lot.
  test('« Il manque N médailles » grisé, raison lue ; rien prélevé ni écrit ; prix en médailles, nom accessible inchangé ; axe ; 44 px', async ({ page }) => {
    test.setTimeout(120_000);
    await poserProgression(page, progressionDemo({ medailles: 40 }));
    await page.addInitScript(() => {
      window.__ecritures = [];
      const set = Storage.prototype.setItem;
      Storage.prototype.setItem = function (k, v) { window.__ecritures.push(k); return set.call(this, k, v); };
    });
    await ouvrirBoutique(page);
    for (const c of caisses) {
      const un = page.locator(`#menu-caisse-${c.id}-un`);
      await un.scrollIntoViewIfNeeded();
      await expect(un).toHaveAttribute('aria-disabled', 'true');
      await expect(un.locator('.e3-ouvrir-prix')).toHaveText('Il manque 60 diamants'); // lot 9a : les caisses se paient en diamants (champ « medailles »)
      await expect(page.locator(`#menu-caisse-${c.id}-dix .e3-ouvrir-prix`)).toHaveText(`Il manque 960 diamants`);
      await expect(page.locator(`#menu-caisse-${c.id}-raison`)).toHaveText(`Diamants insuffisants : prix 100 / 1${NNBSP}000, solde 40.`);
      await expect(un.locator('svg.e3-ouvrir-gemme')).toHaveCount(1); // lot 9a : gemme (avant : médaille, .e3-ouvrir-medaille)
      await un.dispatchEvent('click'); // bouton grisé (aria-disabled) : le toucher ne fait rien
      for (const s of [`#menu-caisse-${c.id}-un`, `#menu-caisse-${c.id}-dix`, `#menu-caisse-${c.id}-chances`]) {
        const r = await page.locator(s).boundingBox();
        expect([r.width >= 44, r.height >= 44], s).toEqual([true, true]);
      }
    }
    await expect(page.locator('#menu-ecran-resultat')).toHaveCount(0);
    expect(await page.evaluate(() => window.__ecritures.filter((k) => k === 'zs.save.v2'))).toEqual([]);
    expect((await stocke(page)).medailles).toEqual({ gagne: 40, depense: 0, jour: 0 });
    expect((await new AxeBuilder({ page }).include('#menu-ecran-boutique').analyze()).violations.map((v) => v.id)).toEqual([]);
    await page.locator('#menu-caisse-equipement-chances').click();
    await expect(page.locator('.e3-chances-compteur')).toHaveCount(1);
    // Le dialogue entre en fondu : l'analyse est reprise jusqu'à la fin du fondu (contraste mesuré sur l'état final).
    await expect.poll(async () => (await new AxeBuilder({ page }).include('#menu-ecran-chances').analyze()).violations.map((v) => v.id), { timeout: 10_000 }).toEqual([]);
  });

  test('ouverture 3D de chaque rubrique (dessins militaire, vétérans, tenues) : la scène part, la carte = tirage, « Passer » ; tout libéré', async ({ page }) => {
    test.setTimeout(180_000);
    await poserProgression(page, progressionDemo({ medailles: 1000 }));
    await graines(page, [21, 22, 23]);
    await ouvrirBoutique(page, { ouverture: 'pas' });
    expect(caisses.map((c) => c.modele)).toEqual(['militaire', 'veterans', 'tenues']);
    const de = { e: 0, l: 0 };
    for (const [i, c] of caisses.entries()) {
      await page.locator(`#menu-boutique-aller-${c.type}`).click();
      await page.locator(`#menu-caisse-${c.id}-un`).click();
      await expect(page.locator('#menu-ecran-ouverture')).toBeVisible({ timeout: 60_000 });
      await page.waitForFunction(() => window.__zsOuverture?.etat()?.actif === true);
      const e = await page.evaluate(() => window.__zsOuverture.etat());
      const attendu = tirerPitie(c, cat, regles, de, 21 + i, 1).objets[0];
      expect([e.quantite, e.cartes.map((x) => x.objet)]).toEqual([1, [attendu.id]]);
      expect((await etatBoutique(page)).dernier.caisse).toBe(c.id);
      await expect(page.locator('#menu-ecran-ouverture canvas')).toHaveCount(1);
      await page.keyboard.press('Escape');
      await expect(page.locator('#menu-ecran-resultat')).toBeVisible();
      await page.locator('#menu-resultat-continuer').click();
      await expect(page.locator('#menu-ecran-ouverture')).toHaveCount(0);
      expect(await page.locator('canvas').count()).toBe(0);
    }
    expect((await stocke(page)).medailles.depense).toBe(300);
  });
});
