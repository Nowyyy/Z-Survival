// Lot 8e : onglet Boutique (E3-1), chances (E3-6), résultats ×1 et ×10 (E3-4, E3-5) du menu principal ; objets obtenus dans l'inventaire du lot 8d,
// utilisables et comptés à « JOUER » (Docs/ref/menu-principal.md). ?test=1&menu=1 ; 932 × 430 (référence), 667 × 375, 1440 × 900, 2000 × 1020,
// téléphone à encoche simulé ; projets bureau et mobile (paysage). Graines des achats fixées en remplaçant crypto.getRandomValues (aucun crochet dans
// le code) ; résultats attendus calculés par les fonctions pures (js/core/caisses.js).
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { readFileSync } from 'node:fs';
import { formatMoney } from '../../js/core/economy.js';
import { chances, lireCaisses, lireCosmetiques, lireOffres, offresDuJour, resume, tirer, tirer10 } from '../../js/core/caisses.js';
import { ajouterObjets, creerEtatEquipement, equiper, lireCatalogue, obtenirPersonnages, statistiquesEffectives } from '../../js/core/equipement.js';

const REF = { width: 932, height: 430 };
const SIZES = [REF, { width: 667, height: 375 }, { width: 1440, height: 900 }, { width: 2000, height: 1020 }];
const BRUIT = /GL Driver Message|GPU stall|swiftshader|WebGL/i; // messages du rendu logiciel de Chromium, sans rapport avec la page
const lire = (f) => JSON.parse(readFileSync(f, 'utf8'));
const PARAMS = lire('data/game/player-stats.json');
const { cat, depart } = lireCatalogue({ raretes: lire('data/menu/raretes.json'), objets: lire('data/menu/objets.json'), personnages: lire('data/menu/personnages.json'), inventaire: lire('data/menu/inventaire-depart.json') });
// Lot 8e, retour du propriétaire : catalogue complété des tenues ; caisses d'équipement, de personnages et de tenues ; offres du jour.
cat.cosmetiques = lireCosmetiques(lire('data/menu/cosmetiques.json'), cat.raretes);
const { caisses } = lireCaisses(lire('data/menu/caisses.json'), cat);
const { regles: REGLES_OFFRES } = lireOffres(lire('data/menu/caisses.json'), cat);
const caisse = (id) => caisses.find((c) => c.id === id);
const nomRarete = (rid) => cat.raretes.find((r) => r.id === rid).nom;
const premiere = (f) => {
  for (let g = 1; g < 100_000; g += 1) if (f(g)) return g;
  throw new Error('aucune graine');
};
// Graines choisies par les fonctions pures : un épique et un légendaire de la caisse d'élite ; des gants (emplacement vide au départ) pour « JOUER ».
const G_EPIQUE = premiere((g) => tirer(caisse('elite'), cat, g).rarete === 'epique');
const G_LEGENDAIRE = premiere((g) => tirer(caisse('elite'), cat, g).rarete === 'legendaire');
const G_GANTS = premiere((g) => cat.objets.get(tirer(caisse('elite'), cat, g).id).type === 'gants');
const PLURIEL = { commun: ['commun', 'communs'], 'peu-commun': ['peu commun', 'peu communs'], rare: ['rare', 'rares'], epique: ['épique', 'épiques'], legendaire: ['légendaire', 'légendaires'] };
function resumeAttendu(objets) {
  const { compte, meilleur } = resume(objets, cat);
  const parties = compte.map((x) => {
    const t = `${x.n} ${PLURIEL[x.rarete][x.n === 1 ? 0 : 1]}`;
    return x.rarete === meilleur.rarete ? `${t} (${cat.objets.get(meilleur.id).nom})` : t;
  });
  return `Obtenu : ${parties.join(', ')}. Tout est rangé dans l'inventaire.`;
}
const ANIMS_E3 = ['e3-flotte', 'e3-lueur', 'e3-rayons', 'e3-tremble', 'e8-coulure', 'e8-goutte'];

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
// Écritures dans le stockage : aucune n'est permise depuis le menu.
async function espionStockage(page) {
  await page.addInitScript(() => {
    window.__ecritures = [];
    const set = Storage.prototype.setItem;
    Storage.prototype.setItem = function (k, v) { window.__ecritures.push(k); return set.call(this, k, v); };
    for (const m of ['removeItem', 'clear']) {
      const f = Storage.prototype[m];
      Storage.prototype[m] = function (...a) { window.__ecritures.push(m); return f.apply(this, a); };
    }
  });
}
// Graines des achats suivants (une par achat) ; les autres usages de crypto.getRandomValues sont inchangés.
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
async function ouvrirMenu(page, size = REF, extra = '') {
  await page.setViewportSize(size);
  // Lot 8f : ?ouverture=0 : ces tests attendent le résultat aussitôt après l'achat (l'ouverture en 3D a ses tests : ouverture.spec.js).
  await page.goto(`/jeu.html?test=1&menu=1&seed=1&ouverture=0${extra}`);
  await expect(page.locator('#menu-jouer')).toBeVisible({ timeout: 60_000 });
  await page.waitForFunction(() => window.__zsMenu?.etat()?.menu !== null && !document.getElementById('e7'));
}
async function ouvrirBoutique(page, size = REF, extra = '') {
  await ouvrirMenu(page, size, extra);
  await page.locator('#menu-onglet-boutique').click();
  await expect(page.locator('#menu-ecran-boutique')).toBeVisible();
  await expect(page.locator('.e3-carte')).toHaveCount(caisses.length); // retour du propriétaire : 3 d'équipement, 1 de personnages, 1 de tenues
}
const etatMenu = (page) => page.evaluate(() => window.__zsMenu.etat().menu);
const etatBoutique = (page) => page.evaluate(() => window.__zsMenu.etat().menu.boutique);
const boite = (page, sel) => page.locator(sel).first().evaluate((n) => {
  const r = n.getBoundingClientRect();
  return { l: r.left, t: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height };
});
const chevauche = (x, y) => x.l < y.r - 0.5 && y.l < x.r - 0.5 && x.t < y.b - 0.5 && y.t < x.b - 0.5;
const animations = (page, sel) => page.locator(sel).evaluate((n) => n.getAnimations({ subtree: true }).filter((a) => a.animationName).map((a) => [a.animationName, a.playState]));
const nomsAnims = async (page, sel) => [...new Set((await animations(page, sel)).map(([n]) => n))].sort();
const etats = async (page, sel) => [...new Set((await animations(page, sel)).map(([, s]) => s).filter((s) => s !== 'finished'))];
const cachee = (page, v) => page.evaluate((h) => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => h }); document.dispatchEvent(new Event('visibilitychange')); }, v);

// Blocs dans l'écran (ou entre des marges), au-dessus de la barre d'onglets, sans superposition.
async function verifierBlocs(page, ids, { marge = 0, nom = '' } = {}) {
  const vp = page.viewportSize();
  // Barre d'onglets masquée (résultats en écran plein) : le bas de l'écran.
  const barre = (await page.locator('.e8-onglets').isVisible()) ? await boite(page, '.e8-onglets') : { t: vp.height };
  const b = {};
  for (const s of ids) b[s] = await boite(page, s);
  for (const s of ids) expect([b[s].l >= marge - 0.5, b[s].t >= 0, b[s].r <= vp.width - marge + 0.5, b[s].b <= barre.t + 0.5], `${nom} ${s}`).toEqual([true, true, true, true]);
  for (let i = 0; i < ids.length; i += 1) for (let j = i + 1; j < ids.length; j += 1) expect(chevauche(b[ids[i]], b[ids[j]]), `${nom} : ${ids[i]} / ${ids[j]}`).toBe(false);
}
// Toutes les commandes visibles de l'écran : 44 × 44 au moins.
async function cibles(page, sel) {
  const petites = await page.locator(`${sel} button`).evaluateAll((ns) => ns.filter((n) => n.offsetParent).map((n) => [n.id || n.textContent, n.getBoundingClientRect().width, n.getBoundingClientRect().height]).filter(([, w, h]) => w < 44 - 0.5 || h < 44 - 0.5));
  expect(petites, sel).toEqual([]);
}

// Contraste : couleur du texte contre le pixel le plus clair derrière lui (texte rendu transparent, capture de sa boîte).
async function contrastes(page, sels) {
  await page.evaluate(() => { for (const a of document.getAnimations()) a.pause(); });
  const couleurs = {};
  for (const s of sels) couleurs[s] = await page.locator(s).first().evaluate((n) => getComputedStyle(n).color);
  const style = await page.addStyleTag({ content: `${sels.join(',')} { color: transparent !important; }` });
  const lum = ([r, g, b]) => [r, g, b].map((c) => { const v = c / 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }).reduce((s, v, i) => s + v * [0.2126, 0.7152, 0.0722][i], 0);
  const out = {};
  for (const s of sels) {
    await page.locator(s).first().scrollIntoViewIfNeeded();
    const r = await boite(page, s);
    const png = await page.screenshot({ clip: { x: r.l + 1, y: r.t + 1, width: Math.max(1, r.w - 2), height: Math.max(1, r.h - 2) } });
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
    out[s] = (a + 0.05) / (z + 0.05);
  }
  await style.evaluate((n) => n.remove());
  return out;
}

// La zone qui défile va jusqu'au bord droit (barre de défilement) ; son contenu (première rubrique) respecte la marge.
const BLOCS_BOUTIQUE = ['#menu-ecran-boutique .menu-bandeau', '#menu-boutique-rubriques', '#menu-boutique-offres .e3-rayon-tete', '#menu-offre-0'];

test.describe('Boutique (E3-1)', () => {
  for (const size of SIZES) {
    test(`${size.width}×${size.height} : bandeau, mention, trois caisses (nom, contenu, prix des données), « Voir les chances » ; rien hors de l'écran ni superposé ; 44 px ; axe ; console propre ; aucune écriture ni requête externe`, async ({ page, baseURL }) => {
      const o = surveiller(page, baseURL);
      await espionStockage(page);
      await ouvrirBoutique(page, size);
      await expect(page.locator('#menu-onglet-boutique')).toHaveAttribute('aria-current', 'page');
      await expect(page.locator('#menu-ecran-boutique .menu-bandeau-libelle')).toHaveText('Ravitaillement');
      await expect(page.getByRole('heading', { name: 'Boutique', level: 2 })).toBeVisible();
      await expect(page.locator('#menu-boutique-note')).toHaveCount(0); // retour du propriétaire : mention en pointillés retirée
      // Rubriques (petit menu de gauche) et leurs sections, dans l'ordre ; contenu qui défile.
      await expect(page.locator('.e3-rubrique')).toHaveText(['Offres du jour', 'Équipement', 'Personnages', 'Cosmétiques']);
      await expect(page.locator('.e3-rayon-titre')).toHaveText(['Offres du jour', 'Équipement', 'Personnages', 'Cosmétiques']);
      await expect(page.locator('.e3-offre')).toHaveCount(6);
      expect(await page.locator('#menu-boutique-defile').evaluate((n) => [getComputedStyle(n).overflowY, n.scrollHeight > n.clientHeight])).toEqual(['auto', true]);
      // Retour du propriétaire : toutes les raretés dans chaque caisse ; la carte donne la part des plus rares (et une barre de répartition décorative).
      const CONTENUS = { ravitaillement: 'Un objet, toutes raretésÉpique ou mieux : 4\u00a0%', militaire: 'Un objet, toutes raretésÉpique ou mieux : 10\u00a0%', elite: 'Un objet, toutes raretésÉpique ou mieux : 45\u00a0%', recrues: 'Un personnage au hasardNouveau personnage : 40\u00a0%', veterans: 'Un personnage au hasardNouveau personnage : 70\u00a0%', legendes: 'Un personnage au hasardNouveau personnage : 92\u00a0%', tenues: 'Une tenue, toutes raretésÉpique ou mieux : 5\u00a0%', mode: 'Une tenue, toutes raretésÉpique ou mieux : 13\u00a0%', couture: 'Une tenue, toutes raretésÉpique ou mieux : 45\u00a0%' };
      for (const c of caisses) {
        const carte = page.locator(`.e3-carte[data-caisse="${c.id}"]`);
        await carte.scrollIntoViewIfNeeded();
        await expect(carte.locator('h4')).toHaveText(c.nom);
        await expect(carte.locator('.e3-carte-contenu')).toHaveText(CONTENUS[c.id]);
        await expect(carte.locator('.e3-ouvrir-prix')).toHaveText([formatMoney(c.prix), formatMoney(c.prix10)]);
        await expect(page.locator(`#menu-caisse-${c.id}-un`)).toHaveAccessibleName(`Ouvrir ×1 · prix : ${formatMoney(c.prix)}`);
        await expect(page.locator(`#menu-caisse-${c.id}-dix`)).toHaveAccessibleName(`Ouvrir ×10 · prix : ${formatMoney(c.prix10)}`);
        for (const b of ['un', 'dix', 'chances']) await expect(page.locator(`#menu-caisse-${c.id}-${b}`)).toHaveAccessibleDescription(c.nom);
        await expect(page.locator(`#menu-caisse-${c.id}-chances`)).toHaveText('Voir les chances');
        // Caisse dessinée : trois « ? » (un grand doublé d'un halo, deux petits), rayons, quatre rivets ; dans sa carte.
        await expect(carte.locator('.e3-caisse .e3-q')).toHaveCount(4);
        await expect(carte.locator('.e3-caisse')).toHaveAttribute('data-modele', c.modele); // un dessin par genre de caisse
        await expect(carte.locator('.e3-repartition-part')).toHaveCount(c.type === 'personnage' ? 0 : 5);
        // Le grand « ? » est au milieu de la face de la caisse (retour du propriétaire : il était trop bas).
        const [q, face] = await carte.locator('.e3-caisse').evaluate((n) => [n.querySelector('.e3-lueur .e3-q:not(.e3-q-halo)'), n.querySelector('.e3-flotte > :not(.e3-poignee):not(.e3-anse)')].map((x) => { const r = x.getBBox(); return { y: r.y, height: r.height }; }));
        expect(Math.abs((q.y + q.height / 2) - (face.y + face.height / 2)), c.id).toBeLessThan(face.height * 0.2);
        const [svg, bloc] = [await boite(page, `.e3-carte[data-caisse="${c.id}"] .e3-caisse`), await boite(page, `.e3-carte[data-caisse="${c.id}"]`)];
        expect([svg.h >= 39, svg.t >= bloc.t, svg.b <= bloc.b]).toEqual([true, true, true]);
      }
      await page.locator('#menu-boutique-defile').evaluate((n) => { n.scrollTop = 0; });
      await verifierBlocs(page, BLOCS_BOUTIQUE, { nom: 'boutique' });
      // Le bas des coulures du bandeau reste au-dessus du menu des rubriques.
      const coulures = await page.locator('#menu-ecran-boutique .menu-coulure').evaluateAll((ns) => Math.max(...ns.map((n) => n.getBoundingClientRect().bottom)));
      expect(coulures).toBeLessThanOrEqual((await boite(page, '#menu-boutique-rubriques')).t + 0.5);
      await cibles(page, '#menu-ecran-boutique');
      expect((await new AxeBuilder({ page }).analyze()).violations.map((v) => v.id)).toEqual([]);
      await expect(page.locator('#menu-solde-texte')).toHaveText('0');
      expect(await page.evaluate(() => window.__ecritures)).toEqual([]);
      expect([o.problemes, o.externes]).toEqual([[], []]);
    });
  }

  test('téléphone à encoche (762 × 351, marges de 50 px) : Boutique, chances et résultats dans la zone sûre, au-dessus de la barre d\'onglets, sans superposition', async ({ page, baseURL }) => {
    const o = surveiller(page, baseURL);
    await graines(page, [G_EPIQUE, 77]);
    await ouvrirMenu(page, { width: 762, height: 351 });
    await page.addStyleTag({ content: '#e8 { --e8-gauche: 50px !important; --e8-droite: 50px !important; }' });
    await page.locator('#menu-onglet-boutique').click();
    await verifierBlocs(page, BLOCS_BOUTIQUE, { marge: 50, nom: 'boutique' });
    await cibles(page, '#menu-ecran-boutique');
    await page.locator('#menu-caisse-militaire-chances').click();
    await verifierBlocs(page, ['#menu-ecran-chances .menu-bandeau', '#menu-ecran-chances-fermer'], { marge: 50, nom: 'chances' });
    await page.keyboard.press('Escape');
    await page.locator('#menu-caisse-elite-un').click();
    await expect(page.locator('#menu-ecran-resultat')).toBeVisible();
    await verifierBlocs(page, ['#menu-ecran-resultat .e3-tete', '#menu-resultat-carte', '#menu-resultat-range', '.e3-actions'], { marge: 50, nom: '×1' });
    await page.locator('#menu-resultat-continuer').click();
    await page.locator('#menu-caisse-ravitaillement-dix').click();
    await expect(page.locator('.e3-case')).toHaveCount(10);
    await verifierBlocs(page, ['#menu-ecran-resultat .e3-tete', '#menu-resultat-grille', '#menu-resultat-resume', '.e3-actions'], { marge: 50, nom: '×10' });
    await cibles(page, '#menu-ecran-resultat');
    expect(o.problemes).toEqual([]);
  });

  test('contraste : 4,5:1 au moins contre le pixel le plus clair derrière chaque texte (932 × 430 et 667 × 375)', async ({ page }) => {
    await graines(page, [G_LEGENDAIRE, 3, G_LEGENDAIRE, 3]);
    for (const size of [REF, { width: 667, height: 375 }]) {
      await ouvrirBoutique(page, size);
      const r = await contrastes(page, ['.e3-rubrique[aria-current] .e3-rubrique-nom', '.e3-rubrique:not([aria-current]) .e3-rubrique-nom', '#menu-boutique-compte', '.e3-offre-nom', '.e3-offre-rarete', '.e3-offre-acheter', '#menu-caisse-militaire-nom', '#menu-caisse-militaire-contenu .e3-carte-resume', '.e3-carte-raretes', '#menu-caisse-elite-un .e3-ouvrir-action', '#menu-caisse-elite-un .e3-ouvrir-prix', '#menu-caisse-elite-dix .e3-ouvrir-prix', '#menu-caisse-elite-chances .e3-lien-nom']);
      for (const [s, v] of Object.entries(r)) expect(v, `${size.width} ${s}`).toBeGreaterThanOrEqual(4.5);
      await page.locator('#menu-caisse-elite-un').click();
      const r1 = await contrastes(page, ['#menu-resultat-nom', '#menu-resultat-rarete', '#menu-resultat-ligne', '#menu-resultat-range', '#menu-resultat-continuer', '#menu-resultat-rouvrir']);
      for (const [s, v] of Object.entries(r1)) expect(v, `${size.width} ${s}`).toBeGreaterThanOrEqual(4.5);
      await page.locator('#menu-resultat-continuer').click();
      await page.locator('#menu-caisse-elite-dix').click();
      const r10 = await contrastes(page, ['.e3-case .e3-case-nom', '.e3-case .e3-case-rarete', '#menu-resultat-resume', '#menu-resultat-meilleur']);
      for (const [s, v] of Object.entries(r10)) expect(v, `${size.width} ${s}`).toBeGreaterThanOrEqual(4.5);
    }
  });

  test('chargée à la demande (démarrage du menu : 31 fichiers JavaScript, roue de chargement et glissement à la souris compris) ; chances et résultats à leur première ouverture ; ni Three.js ni le jeu', async ({ page, baseURL }) => {
    const o = surveiller(page, baseURL);
    await ouvrirMenu(page);
    const BOUTIQUE = /\/js\/menu\/(boutique|chances|resultat|personnage|equipement-etat)\.js$|\/js\/core\/(caisses|equipement)\.js$|\/data\/menu\/(caisses|cosmetiques|objets|raretes|personnages|inventaire-depart)\.json$/;
    expect(o.fichiers.filter((f) => BOUTIQUE.test(f))).toEqual([]);
    // Retours du propriétaire : roue de chargement (js/menu/roue.js) et glissement à la souris (js/glisser.js) dès le démarrage du menu (29 → 31).
    expect(o.fichiers.filter((f) => f.endsWith('.js')).length).toBe(31);
    expect(o.fichiers.filter((f) => /\/(roue|glisser)\.js$/.test(f)).length).toBe(2);
    await page.locator('#menu-onglet-boutique').click();
    await expect(page.locator('#menu-ecran-boutique')).toBeVisible();
    expect(o.fichiers.filter((f) => BOUTIQUE.test(f)).sort()).toEqual(['/data/menu/caisses.json', '/data/menu/cosmetiques.json', '/data/menu/inventaire-depart.json', '/data/menu/objets.json', '/data/menu/personnages.json', '/data/menu/raretes.json', '/js/core/caisses.js', '/js/core/equipement.js', '/js/menu/boutique.js', '/js/menu/equipement-etat.js', '/js/menu/personnage.js']);
    await page.locator('#menu-caisse-elite-chances').click();
    await expect(page.locator('#menu-ecran-chances')).toBeVisible();
    expect(o.fichiers.filter((f) => f.endsWith('/js/menu/chances.js'))).toHaveLength(1);
    await page.keyboard.press('Escape');
    await page.locator('#menu-caisse-elite-un').click();
    await expect(page.locator('#menu-ecran-resultat')).toBeVisible();
    expect(o.fichiers.filter((f) => /\/js\/menu\/(resultat|personnage)\.js$/.test(f)).sort()).toEqual(['/js/menu/personnage.js', '/js/menu/resultat.js']); // personnage.js (icônes) dès l'onglet
    expect(o.fichiers.filter((f) => /\/vendor\/three\/|\/js\/game\/(main|game)\.js$/.test(f))).toEqual([]);
    expect([o.problemes, o.externes]).toEqual([[], []]);
  });

  test('caisses animées (flotte, « ? » qui pulse, rayons, tremblement lent, en décalé) ; immobiles sur un autre onglet ou page cachée, reprises au retour', async ({ page }) => {
    await ouvrirBoutique(page);
    const sel = '#menu-ecran-boutique';
    expect(await nomsAnims(page, sel)).toEqual(ANIMS_E3);
    expect(await etats(page, sel)).toEqual(['running']);
    // Décalage d'une carte à l'autre (0, −1,3 s, −2,6 s), tremblement en 4 s et pulsation en 1,6 s (moins de 3 éclats par seconde).
    const tremble = await page.locator('.e3-carte[data-type="equipement"] .e3-tremble').evaluateAll((ns) => ns.map((n) => [getComputedStyle(n).animationDelay, getComputedStyle(n).animationDuration]));
    expect(tremble).toEqual([['0s', '4s'], ['-1.3s', '4s'], ['-2.6s', '4s']]);
    expect(await page.locator('.e3-caisse').evaluateAll((ns) => new Set(ns.map((n) => n.dataset.modele)).size)).toBe(caisses.length);
    expect(await page.locator('.e3-lueur').first().evaluate((n) => getComputedStyle(n).animationDuration)).toBe('1.6s');
    await page.locator('#menu-onglet-infini').click();
    await expect(page.locator(sel)).toBeHidden();
    await expect(page.locator(sel)).toHaveAttribute('data-anim', 'off');
    expect(await etats(page, sel)).toEqual([]);
    await page.locator('#menu-onglet-boutique').click();
    await expect(page.locator(sel)).toHaveAttribute('data-anim', 'on');
    expect(await etats(page, sel)).toEqual(['running']);
    await cachee(page, true);
    await expect(page.locator(sel)).toHaveAttribute('data-anim', 'off');
    expect(await etats(page, sel)).toEqual(['paused']);
    await cachee(page, false);
    expect(await etats(page, sel)).toEqual(['running']);
  });

  test('prefers-reduced-motion : caisses immobiles, résultats affichés directement (aucune animation)', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await graines(page, [G_LEGENDAIRE, 9]);
    await ouvrirBoutique(page);
    expect(await animations(page, '#menu-ecran-boutique')).toEqual([]);
    await page.locator('#menu-caisse-elite-un').click();
    await expect(page.locator('#menu-resultat-carte')).toBeVisible();
    expect(await animations(page, '#menu-ecran-resultat')).toEqual([]);
    expect(await page.locator('#menu-resultat-carte').evaluate((n) => getComputedStyle(n).opacity)).toBe('1');
    await page.locator('#menu-resultat-continuer').click();
    await page.locator('#menu-caisse-elite-dix').click();
    await expect(page.locator('.e3-case')).toHaveCount(10);
    expect(await animations(page, '#menu-ecran-resultat')).toEqual([]);
  });
});

test.describe('chances (E3-6)', () => {
  test('dialogue accessible : pour cent égaux aux données (texte et barre), objets possibles par rareté, règle ; focus piégé, Échap et voile ferment, focus rendu ; axe', async ({ page }) => {
    await ouvrirBoutique(page);
    for (const c of caisses) {
      const lien = page.locator(`#menu-caisse-${c.id}-chances`);
      await lien.click();
      const dialogue = page.getByRole('dialog');
      await expect(dialogue).toBeVisible();
      await expect(dialogue).toHaveAttribute('aria-modal', 'true');
      await expect(dialogue).toHaveAccessibleName(`${c.nom} Chances`);
      await expect(page.locator('#menu-ecran-chances-fermer')).toBeFocused();
      const attendu = chances(c, cat);
      await expect(page.locator('.e3-chance-nom')).toHaveText(attendu.map((x) => x.nom));
      await expect(page.locator('.e3-chance-pc')).toHaveText(attendu.map((x) => `${x.pourcent.toLocaleString('fr-FR')}\u00a0%`));
      const largeurs = await page.locator('.e3-chance').evaluateAll((ns) => ns.map((n) => n.querySelector('.e3-chance-plein').getBoundingClientRect().width / n.querySelector('.e3-chance-barre').clientWidth));
      largeurs.forEach((l, i) => expect(Math.abs(l - attendu[i].pourcent / 100), `${c.id} barre ${i}`).toBeLessThan(0.02));
      await expect(page.locator('.e3-chances-groupe-objets')).toHaveText(c.type === 'personnage' ? [] : attendu.map((x) => x.objets.map((ob) => ob.nom).join(', ')));
      await expect(page.locator('#menu-ecran-chances-regle')).toContainText('dix tirages indépendants, sans garantie');
      expect((await etatBoutique(page)).chances).toBe(c.id);
      // Focus piégé : croix → zone → croix (Tab), et en arrière.
      await page.keyboard.press('Tab');
      await expect(page.locator('.e3-chances-corps')).toBeFocused();
      await page.keyboard.press('Tab');
      await expect(page.locator('#menu-ecran-chances-fermer')).toBeFocused();
      await page.keyboard.press('Shift+Tab');
      await expect(page.locator('.e3-chances-corps')).toBeFocused();
      if (c.id === 'militaire') expect((await new AxeBuilder({ page }).analyze()).violations.map((v) => v.id)).toEqual([]);
      await page.keyboard.press('Escape');
      await expect(dialogue).toHaveCount(0);
      await expect(lien).toBeFocused();
    }
    // Appui sur le voile (au-dessus de l'en-tête : le panneau couvre la zone de contenu), puis croix.
    await page.locator('#menu-caisse-elite-chances').click();
    await expect(page.locator('#menu-ecran-chances')).toBeVisible();
    await page.mouse.click(REF.width / 2, 10);
    await expect(page.locator('#menu-ecran-chances')).toHaveCount(0);
    await expect(page.locator('#menu-caisse-elite-chances')).toBeFocused();
    await page.locator('#menu-caisse-elite-chances').click();
    await page.locator('#menu-ecran-chances-fermer').click();
    await expect(page.locator('#menu-ecran-chances')).toHaveCount(0);
    await expect(page.locator('#menu-caisse-elite-chances')).toBeFocused();
    expect((await etatMenu(page)).boutique.vue).toBe('caisses');
  });
});

test.describe('achats et résultats (E3-4, E3-5)', () => {
  test('« Ouvrir ×1 » (élite) : objet de la fonction pure, carte (icône, nom, rareté écrite, effet) bordée de sa rareté et halo ; annonce ; « Rouvrir » ; « Continuer » ; objet dans l\'Inventaire, utilisable ; prix jamais prélevé ; aucune écriture', async ({ page, baseURL }) => {
    const o = surveiller(page, baseURL);
    await espionStockage(page);
    await graines(page, [G_EPIQUE, G_LEGENDAIRE]);
    await ouvrirBoutique(page);
    const solde = await page.locator('#menu-solde-texte').textContent();
    await page.locator('#menu-caisse-elite-un').click();
    const sec = page.locator('#menu-ecran-resultat');
    await expect(sec).toBeVisible();
    await expect(page.locator('#menu-ecran-boutique')).toBeHidden();
    await expect(page.locator('.e8-onglets')).toBeHidden(); // retour du propriétaire : écran plein, barre d'onglets masquée
    await expect(page.locator('#e8')).toHaveAttribute('data-ecran', 'resultat');
    await expect(page.locator('#menu-resultat-retour')).toHaveCount(0); // « Continuer » et « Rouvrir » suffisent
    await expect(page.locator('#menu-onglet-boutique')).toHaveAttribute('aria-current', 'page');
    const attendu = tirer(caisse('elite'), cat, G_EPIQUE);
    expect(attendu.rarete).toBe('epique');
    const def = cat.objets.get(attendu.id);
    await expect(sec.locator('.menu-bandeau-libelle')).toHaveText('Boutique');
    await expect(page.locator('#menu-resultat-titre')).toHaveText('Résultat');
    await expect(page.locator('#menu-resultat-nom')).toHaveText(def.nom);
    await expect(page.locator('#menu-resultat-rarete')).toHaveText('Épique');
    await expect(page.locator('#menu-resultat-ligne')).toContainText(' · ');
    await expect(page.locator('#menu-resultat-carte svg')).toHaveCount(1);
    await expect(page.locator('#menu-resultat-carte')).toHaveClass(/e3-brille/);
    await expect(page.locator('.e3-halo')).toBeVisible();
    expect(await page.locator('#menu-resultat-carte').evaluate((n) => getComputedStyle(n).borderTopColor)).toBe(await page.evaluate(() => { const d = document.createElement('div'); d.style.color = 'var(--rarete-epique)'; document.body.append(d); const c = getComputedStyle(d).color; d.remove(); return c; }));
    await expect(page.locator('#menu-resultat-range')).toHaveText('Rangé dans l\'inventaire.');
    await expect(page.locator('#menu-resultat-annonce')).toHaveText(`Obtenu : ${def.nom}, Épique. Rangé dans l'inventaire.`);
    await expect(page.locator('#menu-resultat-annonce')).toHaveAttribute('aria-live', 'polite');
    await expect(page.locator('#menu-resultat-continuer')).toBeFocused();
    await expect(page.locator('#menu-resultat-rouvrir')).toHaveText(`Rouvrir · ${formatMoney(caisse('elite').prix)}`);
    await cibles(page, '#menu-ecran-resultat');
    expect((await new AxeBuilder({ page }).analyze()).violations.map((v) => v.id)).toEqual([]);
    let b = await etatBoutique(page);
    expect([b.vue, b.achats, b.dernier.objets, b.dernier.uids]).toEqual(['resultat', 1, [attendu], ['c1']]);
    // « Rouvrir » : même caisse, ×1 ; un légendaire cette fois.
    await page.locator('#menu-resultat-rouvrir').click();
    const second = tirer(caisse('elite'), cat, G_LEGENDAIRE);
    await expect(page.locator('#menu-resultat-nom')).toHaveText(cat.objets.get(second.id).nom);
    await expect(page.locator('#menu-resultat-rarete')).toHaveText('Légendaire');
    b = await etatBoutique(page);
    expect([b.achats, b.dernier.uids]).toEqual([2, ['c2']]);
    // « Continuer » : retour à la Boutique, focus sur « Ouvrir ×1 » de la caisse d'élite.
    await page.locator('#menu-resultat-continuer').click();
    await expect(page.locator('#menu-ecran-boutique')).toBeVisible();
    await expect(sec).toBeHidden();
    await expect(page.locator('#menu-caisse-elite-un')).toBeFocused();
    // Objets dans l'Inventaire (en tête : rareté la plus haute), puis équipés.
    await page.locator('#menu-onglet-personnage').click();
    await page.locator('#menu-perso-inventaire').click();
    await expect(page.locator('#menu-objet-c2')).toBeVisible();
    await expect(page.locator('#menu-objet-c1')).toBeVisible();
    const perso = (await etatMenu(page)).personnage;
    expect(perso.objets.filter((x) => /^c/.test(x.uid)).map(({ uid, id, rarete, niveau, porte }) => ({ uid, id, rarete, niveau, porte }))).toEqual([
      { uid: 'c1', ...attendu, porte: null }, { uid: 'c2', ...second, porte: null },
    ]);
    expect(perso.objets).toHaveLength(depart.objets.length + 2);
    await page.locator('#menu-objet-c2').click();
    await page.locator('#menu-inventaire-equiper').click();
    await expect(page.locator('#menu-inventaire-annonce')).toContainText('équipé');
    expect(Object.values((await etatMenu(page)).personnage.emplacements).some((x) => x?.uid === 'c2')).toBe(true);
    await expect(page.locator('#menu-solde-texte')).toHaveText(solde); // prix jamais prélevé
    expect((await etatMenu(page)).solde).toBe(0);
    expect(await page.evaluate(() => window.__ecritures)).toEqual([]);
    expect([o.problemes, o.externes]).toEqual([[], []]);
  });

  test('« Ouvrir ×10 » (ravitaillement) : dix cartes dans l\'ordre de la fonction pure, rareté écrite et bordée, halo des épiques et légendaires, résumé exact ; « Rouvrir ×10 » ; « Continuer » et Échap ramènent à la Boutique ; barre d\'onglets masquée pendant le résultat', async ({ page }) => {
    await graines(page, [5, 6, 8]);
    await ouvrirBoutique(page);
    await page.locator('#menu-caisse-ravitaillement-dix').click();
    await expect(page.locator('#menu-ecran-resultat')).toBeVisible();
    await expect(page.locator('#menu-resultat-titre')).toHaveText('Résultat ×10');
    const dix = tirer10(caisse('ravitaillement'), cat, 5);
    const cases = page.locator('.e3-case');
    await expect(cases).toHaveCount(10);
    await expect(page.locator('.e3-case-nom')).toHaveText(dix.map((x) => cat.objets.get(x.id).nom));
    await expect(page.locator('.e3-case-rarete')).toHaveText(dix.map((x) => nomRarete(x.rarete)));
    expect(await cases.evaluateAll((ns) => ns.map((n) => n.dataset.rarete))).toEqual(dix.map((x) => x.rarete));
    expect(await cases.evaluateAll((ns) => ns.map((n) => n.classList.contains('e3-brille')))).toEqual(dix.map((x) => ['epique', 'legendaire'].includes(x.rarete)));
    await expect(page.locator('#menu-resultat-resume')).toHaveText(resumeAttendu(dix));
    await expect(page.locator('#menu-resultat-annonce')).toHaveText(resumeAttendu(dix));
    await expect(page.locator('#menu-resultat-rouvrir')).toHaveText(`Rouvrir ×10 · ${formatMoney(caisse('ravitaillement').prix10)}`);
    // Cinq colonnes, deux rangées (apparition décalée finie).
    await page.evaluate(() => Promise.all(document.getAnimations().filter((a) => a.animationName === 'e3-apparition').map((a) => a.finished)));
    const pos = await cases.evaluateAll((ns) => ns.map((n) => [Math.round(n.getBoundingClientRect().left), Math.round(n.getBoundingClientRect().top)]));
    expect([new Set(pos.map(([x]) => x)).size, new Set(pos.map(([, y]) => y)).size]).toEqual([5, 2]);
    expect((await new AxeBuilder({ page }).analyze()).violations.map((v) => v.id)).toEqual([]);
    // Rouvrir ×10 : dix de plus (graine suivante).
    await page.locator('#menu-resultat-rouvrir').click();
    const dix2 = tirer10(caisse('ravitaillement'), cat, 6);
    await expect(page.locator('.e3-case-nom')).toHaveText(dix2.map((x) => cat.objets.get(x.id).nom));
    await expect(page.locator('#menu-resultat-resume')).toHaveText(resumeAttendu(dix2));
    const b = await etatBoutique(page);
    expect([b.achats, b.dernier.uids]).toEqual([2, Array.from({ length: 10 }, (_, i) => `c${11 + i}`)]);
    // Inventaire en mémoire : 20 objets de plus (fonction pure : mêmes uid).
    const pur = ajouterObjets(ajouterObjets(creerEtatEquipement(cat, depart), cat, dix).etat, cat, dix2).etat;
    await page.locator('#menu-resultat-continuer').click();
    await expect(page.locator('#menu-ecran-boutique')).toBeVisible();
    await expect(page.locator('.e8-onglets')).toBeVisible();
    await expect(page.locator('#menu-caisse-ravitaillement-dix')).toBeFocused();
    // Échap ferme le résultat ; la barre d'onglets n'est jamais visible pendant un résultat.
    await page.locator('#menu-caisse-ravitaillement-dix').click();
    await expect(page.locator('#menu-ecran-resultat')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('#menu-ecran-boutique')).toBeVisible();
    await page.locator('#menu-caisse-ravitaillement-dix').click();
    await expect(page.locator('#menu-ecran-resultat')).toBeVisible();
    await expect(page.locator('.e8-onglets')).toBeHidden();
    await page.keyboard.press('Escape');
    await page.locator('#menu-onglet-personnage').click();
    await expect(page.locator('#menu-ecran-personnage')).toBeVisible();
    const perso = (await etatMenu(page)).personnage;
    expect(perso.objets.filter((x) => /^c/.test(x.uid)).slice(0, 20).map(({ uid, id, rarete, niveau }) => ({ uid, id, rarete, niveau }))).toEqual(pur.objets.filter((x) => /^c/.test(x.uid)).map((x) => ({ ...x })));
    await page.locator('#menu-onglet-boutique').click();
    await expect(page.locator('#menu-ecran-boutique')).toBeVisible();
    await expect(page.locator('#menu-ecran-resultat')).toBeHidden();
    expect((await etatMenu(page)).solde).toBe(0);
  });
});

test.describe('« JOUER » avec un objet obtenu', () => {
  const KEY = 'zs.save.v1';
  const SAVE_STATS = { degats: 2, portee: 1, precision: 0, cadence: 3, vitesse: 9, vie: 1, regen: 0, chutes: 1, reparation: 0 };
  test('gants obtenus (caisse d\'élite) et portés : la partie reçoit les niveaux de la fonction pure ; argent et sauvegarde inchangés, aucun objet écrit', async ({ page }) => {
    test.setTimeout(150_000);
    await page.addInitScript(([k, stats]) => {
      if (sessionStorage.getItem('zs.test.pose')) return;
      sessionStorage.setItem('zs.test.pose', '1');
      localStorage.setItem(k, JSON.stringify({ v: 1, rev: 1, savedAt: 0, money: 500, earned: 500, stats, records: { bestWave: 3, bestKills: 0, runs: 1, worldsCompleted: 0 } }));
    }, [KEY, SAVE_STATS]);
    await espionStockage(page);
    await graines(page, [G_GANTS]);
    await ouvrirBoutique(page, REF, '&store=local');
    await expect(page.locator('#menu-solde-texte')).toHaveText('500');
    const avant = await page.evaluate((k) => localStorage.getItem(k), KEY);
    await page.locator('#menu-caisse-elite-un').click();
    await expect(page.locator('#menu-ecran-resultat')).toBeVisible();
    const gants = tirer(caisse('elite'), cat, G_GANTS);
    await page.locator('#menu-resultat-continuer').click();
    await page.locator('#menu-onglet-personnage').click();
    await page.locator('#menu-perso-gants').click(); // emplacement vide : Inventaire filtré sur les gants
    await page.locator('#menu-objet-c1').click();
    await page.locator('#menu-inventaire-equiper').click();
    await page.keyboard.press('Escape');
    const etat = equiper(ajouterObjets(creerEtatEquipement(cat, depart), cat, [gants]).etat, cat, 'c1', 'gants');
    const attendu = statistiquesEffectives(SAVE_STATS, etat, cat, PARAMS).niveaux;
    expect(attendu).not.toEqual(statistiquesEffectives(SAVE_STATS, creerEtatEquipement(cat, depart), cat, PARAMS).niveaux);
    expect((await etatMenu(page)).personnage.stats).toEqual(attendu);
    await expect(page.locator('#menu-solde-texte')).toHaveText('500');
    expect(await page.evaluate(() => window.__ecritures)).toEqual([]);
    await page.locator('#menu-onglet-jouer').click();
    await page.locator('#menu-jouer').click();
    await page.waitForFunction(() => (window.__zs?.getState()?.time ?? 0) > 0.05, null, { timeout: 90_000 });
    const p = await page.evaluate(() => { const s = window.__zs.getState(); return { source: s.stats.source, niveaux: { ...s.stats.levels, ...s.stats.extraLevels } }; });
    expect([p.source, p.niveaux]).toEqual(['menu', attendu]);
    await page.evaluate(() => window.__zs.flushSave());
    const apres = JSON.parse(await page.evaluate((k) => localStorage.getItem(k), KEY));
    expect([apres.money, apres.stats]).toEqual([500, JSON.parse(avant).stats]);
    expect(Object.keys(apres).sort()).toEqual(Object.keys(JSON.parse(avant)).sort());
    await page.evaluate(() => localStorage.clear());
  });
});

// --- Barre d'onglets (partie D, demande du propriétaire) ------------------------------------------------------------------------------------------
const ONGLETS = ['boutique', 'personnage', 'jouer', 'infini'];
const couleurJeton = (page, jeton) => page.evaluate((j) => { const d = document.createElement('div'); d.style.color = `var(${j})`; document.body.append(d); const c = getComputedStyle(d).color; d.remove(); return c; }, jeton);
const styleOnglet = (page, id) => page.locator(`#menu-onglet-${id}`).evaluate((n) => {
  const g = n.querySelector('.e8-onglet-goutte');
  return { fond: getComputedStyle(n).backgroundColor, texte: getComputedStyle(n).color, ombre: getComputedStyle(n).boxShadow, goutte: g ? getComputedStyle(g).display : null, courant: n.getAttribute('aria-current') };
});

test.describe('barre d\'onglets (lot 8e)', () => {
  for (const [size, encoche] of [[REF, false], [{ width: 667, height: 375 }, false], [{ width: 1440, height: 900 }, false], [{ width: 2000, height: 1020 }, false], [{ width: 762, height: 351 }, true]]) {
    test(`${size.width}×${size.height}${encoche ? ' (encoche simulée)' : ''} : un seul onglet marqué à la fois (aria-current, planche plus claire et relevée, libellé blanc, goutte) ; « Histoire » non rouge au repos ; goutte dans sa planche ; axe`, async ({ page }) => {
      await ouvrirMenu(page, size);
      if (encoche) await page.addStyleTag({ content: '#e8 { --e8-gauche: 50px !important; --e8-droite: 50px !important; }' });
      const [clair, bois, blanc, rouge] = [await couleurJeton(page, '--menu-bois-clair'), await couleurJeton(page, '--menu-bois'), await couleurJeton(page, '--menu-panneau-atteint-texte'), await couleurJeton(page, '--menu-rouge')];
      for (const id of [...ONGLETS, 'jouer']) {
        if (id !== 'jouer' || (await etatMenu(page)).onglet !== 'jouer') await page.locator(`#menu-onglet-${id}`).click();
        await expect(page.locator('.e8-onglets [aria-current]')).toHaveCount(1);
        await expect(page.locator(`#menu-onglet-${id}`)).toHaveAttribute('aria-current', 'page');
        for (const autre of ONGLETS) {
          const s = await styleOnglet(page, autre);
          if (autre === id) expect([s.fond, s.texte, s.goutte, s.ombre.includes('inset')], `${id} affiché`).toEqual([clair, blanc, 'block', true]);
          else expect([s.fond === rouge, s.goutte, s.ombre], `${autre} au repos (${id} affiché)`).toEqual([false, 'none', 'none']);
        }
        const [g, o] = [await boite(page, `#menu-onglet-${id} .e8-onglet-goutte`), await boite(page, `#menu-onglet-${id}`)];
        expect([g.t >= o.t - 0.5, g.b <= o.b + 0.5, g.l >= o.l, g.r <= o.r], id).toEqual([true, true, true, true]);
      }
      // « Histoire » au repos : la même planche que les autres onglets (plus de rouge permanent), colonne plus large et police de titre gardées.
      await page.locator('#menu-onglet-infini').click();
      const [h, b] = [await styleOnglet(page, 'jouer'), await styleOnglet(page, 'boutique')];
      expect([h.fond, h.fond === rouge]).toEqual([b.fond, false]);
      expect([h.fond === bois || h.fond === 'rgba(0, 0, 0, 0)']).toEqual([true]);
      expect((await boite(page, '#menu-onglet-jouer')).w).toBeGreaterThan((await boite(page, '#menu-onglet-boutique')).w);
      expect(await page.locator('#menu-onglet-jouer').evaluate((n) => getComputedStyle(n).fontFamily)).toMatch(/Rubik Wet Paint/);
      // « Prochainement » inchangé : ruban, désactivé, jamais marqué.
      await expect(page.locator('#menu-onglet-event')).toBeDisabled();
      await expect(page.locator('#menu-onglet-event')).toHaveClass(/menu-ruban/);
      await expect(page.locator('#menu-onglet-event .e8-onglet-goutte')).toHaveCount(0);
      // Retours du propriétaire : coulures seulement sur l'onglet touché (traînée et trois coulures, ici Infini), aucune ailleurs ; taches séchées
      // permanentes ; jamais sous un libellé ni une icône.
      await expect(page.locator('.e8-onglets-sang .menu-coulure')).toHaveCount(0);
      await expect(page.locator('#menu-onglet-infini .e8-onglet-bande')).toBeVisible();
      await expect(page.locator('#menu-onglet-infini .e8-onglet-coulure')).toHaveCount(3);
      expect(await page.locator('.e8-onglet-coulure').evaluateAll((ns) => ns.filter((n) => n.getClientRects().length > 0).length)).toBe(3);
      expect(await page.locator('.e8-onglets-tache').count()).toBeGreaterThanOrEqual(4);
      const libelles = await page.locator('.e8-onglet .e8-onglet-nom, .e8-onglet .e8-icone').evaluateAll((ns) => ns.map((n) => { const r = n.getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom }; }));
      const sang = await page.locator('#menu-onglet-infini .e8-onglet-coulure, .e8-onglets-tache').evaluateAll((ns) => ns.map((n) => { const r = n.getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom }; }));
      expect(sang.filter((x) => libelles.some((y) => chevauche(x, y)))).toEqual([]);
      expect((await new AxeBuilder({ page }).include('.e8-onglets').analyze()).violations.map((v) => v.id)).toEqual([]);
    });
  }

  test('animation à la sélection seulement : la goutte coule et l\'icône (ou « Histoire ») rebondit une fois, puis l\'état reste marqué sans animation ; aucune sous prefers-reduced-motion', async ({ page }) => {
    await ouvrirMenu(page);
    const anims = (id) => page.locator(`#menu-onglet-${id}`).evaluate((n) => n.getAnimations({ subtree: true }).filter((a) => a.animationName).map((a) => [a.animationName, a.playState, a.effect.getComputedTiming().iterations]).sort());
    await page.waitForTimeout(1200);
    expect((await anims('jouer')).filter(([, s]) => s === 'running')).toEqual([]);
    await page.locator('#menu-onglet-boutique').click();
    await expect(page.locator('#menu-onglet-boutique')).toHaveAttribute('aria-current', 'page');
    const noms = (a) => [...new Set(a.map(([n, st, it]) => `${n} ${st} ${it}`))].sort();
    expect(noms(await anims('boutique'))).toEqual(['e8-coulure running 1', 'e8-onglet-rebond running 1', 'e8-onglet-verse running 1']); // retour du propriétaire : traînée et coulures versées au clic
    expect(await anims('personnage')).toEqual([]);
    await page.waitForTimeout(1200);
    expect((await anims('boutique')).filter(([, s]) => s !== 'finished')).toEqual([]);
    expect((await styleOnglet(page, 'boutique')).goutte).toBe('block'); // toujours marqué
    await page.locator('#menu-onglet-jouer').click();
    await expect(page.locator('#menu-onglet-jouer')).toHaveAttribute('aria-current', 'page');
    expect(noms(await anims('jouer'))).toEqual(['e8-coulure running 1', 'e8-onglet-rebond running 1', 'e8-onglet-verse running 1']);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.locator('#menu-onglet-infini').click();
    await expect(page.locator('#menu-onglet-infini')).toHaveAttribute('aria-current', 'page');
    expect(await anims('infini')).toEqual([]);
    expect((await styleOnglet(page, 'infini')).goutte).toBe('block');
  });
});

// --- Retours du propriétaire : rubriques, offres du jour, caisses de personnages et de tenues -------------------------------------------------
test.describe('Boutique par rubriques (retour du propriétaire)', () => {
  test.use({ timezoneId: 'Europe/Paris' });

  test('rubriques : chaque bouton mène à sa section (en haut de la zone qui défile) et devient la rubrique courante ; le défilement met la rubrique à jour ; 44 px', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' }); // défilement immédiat
    await ouvrirBoutique(page);
    await expect(page.locator('#menu-boutique-aller-offres')).toHaveAttribute('aria-current', 'true');
    for (const id of ['equipement', 'personnage', 'cosmetique', 'offres']) {
      await page.locator(`#menu-boutique-aller-${id}`).click();
      await expect(page.locator(`#menu-boutique-aller-${id}`)).toHaveAttribute('aria-current', 'true');
      await expect(page.locator('.e3-rubrique[aria-current]')).toHaveCount(1);
      const [sec, zone] = [await boite(page, `#menu-boutique-${id}`), await boite(page, '#menu-boutique-defile')];
      const bas = await page.locator('#menu-boutique-defile').evaluate((n) => n.scrollTop + n.clientHeight >= n.scrollHeight - 2);
      expect(Math.abs(sec.t - zone.t) < 2 || (bas && sec.t >= zone.t), id).toBe(true);
      expect((await etatBoutique(page)).rubrique).toBe(id);
    }
    // Défilement à la main (molette) : la rubrique suit.
    await page.locator('#menu-boutique-defile').evaluate((n) => { n.scrollTop = n.scrollHeight; n.dispatchEvent(new Event('scroll')); });
    await expect(page.locator('#menu-boutique-aller-cosmetique')).toHaveAttribute('aria-current', 'true');
    await cibles(page, '#menu-boutique-rubriques');
  });

  test('offres du jour : six objets de la fonction pure pour la date de l\'appareil, compte à rebours jusqu\'à minuit ; « Acheter » → résultat ×1 sans « Rouvrir », objet dans l\'inventaire, offre « Acheté » ; prix non prélevé ; aucune écriture', async ({ page }) => {
    await espionStockage(page);
    await page.clock.setFixedTime(new Date('2026-11-11T20:00:00Z')); // 21 h à Paris
    await ouvrirBoutique(page);
    const jour = Math.floor(Date.UTC(2026, 10, 11) / 86_400_000);
    const attendu = offresDuJour(REGLES_OFFRES, cat, jour);
    await expect(page.locator('.e3-offre-nom')).toHaveText(attendu.map((o) => cat.objets.get(o.id).nom));
    await expect(page.locator('.e3-offre-rarete')).toHaveText(attendu.map((o) => nomRarete(o.rarete)));
    await expect(page.locator('.e3-offre-acheter')).toHaveText(attendu.map((o) => `Acheter · ${formatMoney(o.prix)}`));
    await expect(page.locator('#menu-boutique-compte')).toHaveText('Nouvelles offres dans 3 h 0 min');
    expect((await etatBoutique(page)).jour).toBe(jour);
    await page.locator('#menu-offre-2-acheter').click();
    await expect(page.locator('#menu-ecran-resultat')).toBeVisible();
    await expect(page.locator('#menu-resultat-nom')).toHaveText(cat.objets.get(attendu[2].id).nom);
    await expect(page.locator('#menu-resultat-rouvrir')).toBeHidden();
    await expect(page.locator('.e8-onglets')).toBeHidden();
    await page.locator('#menu-resultat-continuer').click();
    await expect(page.locator('#menu-offre-2-acheter')).toHaveText('Acheté');
    await expect(page.locator('#menu-offre-2-acheter')).toHaveAttribute('aria-disabled', 'true');
    await expect(page.locator('#menu-offre-2-acheter')).toBeFocused();
    await page.locator('#menu-offre-2-acheter').dispatchEvent('click'); // déjà acheté (aria-disabled) : rien
    await expect(page.locator('#menu-ecran-resultat')).toBeHidden();
    const b = await etatBoutique(page);
    expect([b.achats, b.offres.map((o) => o.achetee)]).toEqual([1, [false, false, true, false, false, false]]);
    await page.locator('#menu-onglet-personnage').click();
    await expect(page.locator('#menu-ecran-personnage')).toBeVisible();
    const perso = (await etatMenu(page)).personnage;
    expect(perso.objets.filter((x) => /^c/.test(x.uid)).map(({ id, rarete, niveau }) => ({ id, rarete, niveau }))).toEqual([{ id: attendu[2].id, rarete: attendu[2].rarete, niveau: 1 }]);
    expect((await etatMenu(page)).solde).toBe(0);
    expect(await page.evaluate(() => window.__ecritures)).toEqual([]);
  });

  test('caisse de recrues ×10 : personnages de la fonction pure (nouveau : débloqué ; déjà obtenu : un niveau de plus), résumé ; débloqués et choisissables dans Personnages', async ({ page }) => {
    await graines(page, [21]);
    await ouvrirBoutique(page);
    await page.locator('#menu-caisse-recrues-dix').click();
    await expect(page.locator('#menu-ecran-resultat')).toBeVisible();
    const tires = tirer10(caisse('recrues'), cat, 21);
    const { issues } = obtenirPersonnages(creerEtatEquipement(cat, depart), cat, tires.map((x) => x.id));
    await expect(page.locator('.e3-case-nom')).toHaveText(tires.map((x) => cat.personnages.find((p) => p.id === x.id).nom));
    await expect(page.locator('.e3-case-rarete')).toHaveText(issues.map((x) => (x.nouveau ? 'Nouveau personnage' : 'Déjà obtenu')));
    expect(await page.locator('.e3-case').evaluateAll((ns) => ns.map((n) => n.dataset.statut))).toEqual(issues.map((x) => (x.nouveau ? 'nouveau' : 'doublon')));
    const nouveaux = issues.filter((x) => x.nouveau);
    await expect(page.locator('#menu-resultat-resume')).toContainText(`${nouveaux.length} nouveau`);
    expect((await etatBoutique(page)).dernier.issues).toEqual(issues);
    expect((await new AxeBuilder({ page }).analyze()).violations.map((v) => v.id)).toEqual([]);
    await page.locator('#menu-resultat-continuer').click();
    await page.locator('#menu-onglet-personnage').click();
    await page.locator('#menu-perso-silhouette').click();
    const id = nouveaux[0].id;
    await page.locator(`#menu-perso-carte-${id}`).click();
    await expect(page.locator('#menu-personnages-choisir')).toHaveAttribute('aria-disabled', 'false');
    await page.locator('#menu-personnages-choisir').click();
    expect((await etatMenu(page)).personnage.choisi).toBe(id);
  });

  test('caisse de tenues ×1 : tenue de la fonction pure, rareté écrite, « nouvelle », rangée dans la collection (pas encore portable) ; compteur de la rubrique', async ({ page }) => {
    await graines(page, [8]);
    await ouvrirBoutique(page);
    await expect(page.locator('#menu-boutique-tenues-note')).toHaveText(`Tenues d'exemple, pas encore portables · obtenues : 0 / ${cat.cosmetiques.length}`);
    await page.locator('#menu-caisse-tenues-un').click();
    const tenue = tirer(caisse('tenues'), cat, 8);
    await expect(page.locator('#menu-resultat-nom')).toHaveText(cat.cosmetiques.find((c) => c.id === tenue.id).nom);
    await expect(page.locator('#menu-resultat-rarete')).toHaveText(nomRarete(tenue.rarete));
    await expect(page.locator('#menu-resultat-ligne')).toHaveText('Tenue · nouvelle');
    await expect(page.locator('#menu-resultat-range')).toHaveText('Rangée dans la collection (pas encore portable).');
    await page.locator('#menu-resultat-continuer').click();
    await expect(page.locator('#menu-boutique-tenues-note')).toContainText('obtenues : 1 /');
    expect((await etatBoutique(page)).collection).toEqual({ [tenue.id]: 1 });
  });
});

// Retour du propriétaire (iPhone : « légère latence au premier toucher d'un onglet ») : dès que le doigt se pose, tous les fichiers de l'écran sont
// demandés en même temps (une seule fois chacun), jamais au démarrage ; l'onglet est marqué avant la fin du chargement.
test('premier toucher d\'un onglet : fichiers et données demandés dès le pointerdown, une fois chacun ; onglet marqué avant l\'écran (chargement ralenti)', async ({ page, baseURL }) => {
  const o = surveiller(page, baseURL);
  await ouvrirMenu(page);
  const avant = o.fichiers.length;
  expect(o.fichiers.filter((f) => /boutique\.js|caisses\.js|cosmetiques\.json/.test(f))).toEqual([]);
  // Écran de la Boutique ralenti (1,5 s) : le marquage de l'onglet ne l'attend pas.
  let lacher;
  await page.route('**/js/menu/boutique.js', async (route) => { await new Promise((r) => { lacher = r; setTimeout(r, 1500); }); await route.continue(); });
  await page.locator('#menu-onglet-boutique').dispatchEvent('pointerdown');
  await expect.poll(() => o.fichiers.filter((f) => /\/data\/menu\/(caisses|cosmetiques|objets)\.json$|\/js\/core\/caisses\.js$/.test(f)).length).toBe(4); // données et dépendances parties sans attendre boutique.js
  await page.locator('#menu-onglet-boutique').click();
  await expect(page.locator('#menu-onglet-boutique')).toHaveAttribute('aria-current', 'page');
  expect(await page.locator('#menu-ecran-boutique').count()).toBe(0); // écran encore en chargement
  await expect(page.locator('#menu-contenu')).toHaveAttribute('aria-busy', 'true');
  lacher?.();
  await expect(page.locator('#menu-ecran-boutique')).toBeVisible();
  await expect(page.locator('#menu-contenu')).not.toHaveAttribute('aria-busy', /.*/);
  const apres = o.fichiers.slice(avant);
  const doublons = apres.filter((f, i) => apres.indexOf(f) !== i);
  expect(doublons).toEqual([]);
  expect(o.problemes).toEqual([]);
});
