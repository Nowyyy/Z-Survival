// Lot 8e : onglet Boutique (E3-1), chances (E3-6), résultats ×1 et ×10 (E3-4, E3-5) du menu principal ; objets obtenus dans l'inventaire du lot 8d,
// utilisables et comptés à « JOUER » (Docs/ref/menu-principal.md). ?test=1&menu=1 ; 932 × 430 (référence), 667 × 375, 1440 × 900, 2000 × 1020,
// téléphone à encoche simulé ; projets bureau et mobile (paysage). Graines des achats fixées en remplaçant crypto.getRandomValues (aucun crochet dans
// le code) ; résultats attendus calculés par les fonctions pures (js/core/caisses.js).
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { readFileSync } from 'node:fs';
import { formatMoney } from '../../js/core/economy.js';
import { chances, lireCaisses, resume, tirer, tirer10 } from '../../js/core/caisses.js';
import { ajouterObjets, creerEtatEquipement, equiper, lireCatalogue, statistiquesEffectives } from '../../js/core/equipement.js';

const REF = { width: 932, height: 430 };
const SIZES = [REF, { width: 667, height: 375 }, { width: 1440, height: 900 }, { width: 2000, height: 1020 }];
const BRUIT = /GL Driver Message|GPU stall|swiftshader|WebGL/i; // messages du rendu logiciel de Chromium, sans rapport avec la page
const lire = (f) => JSON.parse(readFileSync(f, 'utf8'));
const PARAMS = lire('data/game/player-stats.json');
const { cat, depart } = lireCatalogue({ raretes: lire('data/menu/raretes.json'), objets: lire('data/menu/objets.json'), personnages: lire('data/menu/personnages.json'), inventaire: lire('data/menu/inventaire-depart.json') });
const { caisses } = lireCaisses(lire('data/menu/caisses.json'), cat);
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
  await page.goto(`/jeu.html?test=1&menu=1&seed=1${extra}`);
  await expect(page.locator('#menu-jouer')).toBeVisible({ timeout: 60_000 });
  await page.waitForFunction(() => window.__zsMenu?.etat()?.menu !== null && !document.getElementById('e7'));
}
async function ouvrirBoutique(page, size = REF, extra = '') {
  await ouvrirMenu(page, size, extra);
  await page.locator('#menu-onglet-boutique').click();
  await expect(page.locator('#menu-ecran-boutique')).toBeVisible();
  await expect(page.locator('.e3-carte')).toHaveCount(3);
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
  const barre = await boite(page, '.e8-onglets');
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

const BLOCS_BOUTIQUE = ['#menu-ecran-boutique .menu-bandeau', '#menu-boutique-note', ...caisses.map((c) => `.e3-carte[data-caisse="${c.id}"]`)];

test.describe('Boutique (E3-1)', () => {
  for (const size of SIZES) {
    test(`${size.width}×${size.height} : bandeau, mention, trois caisses (nom, contenu, prix des données), « Voir les chances » ; rien hors de l'écran ni superposé ; 44 px ; axe ; console propre ; aucune écriture ni requête externe`, async ({ page, baseURL }) => {
      const o = surveiller(page, baseURL);
      await espionStockage(page);
      await ouvrirBoutique(page, size);
      await expect(page.locator('#menu-onglet-boutique')).toHaveAttribute('aria-current', 'page');
      await expect(page.locator('#menu-ecran-boutique .menu-bandeau-libelle')).toHaveText('Ravitaillement');
      await expect(page.getByRole('heading', { name: 'Boutique', level: 2 })).toBeVisible();
      await expect(page.locator('#menu-boutique-note')).toHaveText('Payé uniquement avec l\'argent gagné en jeu. Chances d\'obtention affichées pour chaque caisse.');
      const CONTENUS = { ravitaillement: 'Un objet commun à rareCommun · Peu commun · Rare', militaire: 'Un objet peu commun à épiquePeu commun · Rare · Épique', elite: 'Un objet épique ou légendaireÉpique · Légendaire' };
      for (const c of caisses) {
        const carte = page.locator(`.e3-carte[data-caisse="${c.id}"]`);
        await expect(carte.locator('h3')).toHaveText(c.nom);
        await expect(carte.locator('.e3-carte-contenu')).toHaveText(CONTENUS[c.id]);
        await expect(carte.locator('.e3-ouvrir-prix')).toHaveText([formatMoney(c.prix), formatMoney(c.prix10)]);
        await expect(page.locator(`#menu-caisse-${c.id}-un`)).toHaveAccessibleName(`Ouvrir ×1 · prix : ${formatMoney(c.prix)}`);
        await expect(page.locator(`#menu-caisse-${c.id}-dix`)).toHaveAccessibleName(`Ouvrir ×10 · prix : ${formatMoney(c.prix10)}`);
        for (const b of ['un', 'dix', 'chances']) await expect(page.locator(`#menu-caisse-${c.id}-${b}`)).toHaveAccessibleDescription(c.nom);
        await expect(page.locator(`#menu-caisse-${c.id}-chances`)).toHaveText('Voir les chances');
        // Caisse dessinée : trois « ? » (un grand doublé d'un halo, deux petits), rayons, quatre rivets ; dans sa carte.
        await expect(carte.locator('.e3-caisse .e3-q')).toHaveCount(4);
        await expect(carte.locator('.e3-rivet')).toHaveCount(4);
        const [svg, bloc] = [await boite(page, `.e3-carte[data-caisse="${c.id}"] .e3-caisse`), await boite(page, `.e3-carte[data-caisse="${c.id}"]`)];
        expect([svg.h >= 39, svg.t >= bloc.t, svg.b <= bloc.b]).toEqual([true, true, true]);
      }
      await verifierBlocs(page, BLOCS_BOUTIQUE, { nom: 'boutique' });
      // Le bas des coulures du bandeau reste au-dessus des cartes.
      const coulures = await page.locator('#menu-ecran-boutique .menu-coulure').evaluateAll((ns) => Math.max(...ns.map((n) => n.getBoundingClientRect().bottom)));
      expect(coulures).toBeLessThanOrEqual((await boite(page, '.e3-cartes')).t + 0.5);
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
      const r = await contrastes(page, ['#menu-boutique-note', '#menu-caisse-militaire-nom', '#menu-caisse-militaire-contenu', '.e3-carte-raretes', '#menu-caisse-elite-un .e3-ouvrir-action', '#menu-caisse-elite-un .e3-ouvrir-prix', '#menu-caisse-elite-dix .e3-ouvrir-prix', '#menu-caisse-elite-chances']);
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

  test('chargée à la demande (démarrage du menu inchangé : 29 fichiers JavaScript) ; chances et résultats à leur première ouverture ; ni Three.js ni le jeu', async ({ page, baseURL }) => {
    const o = surveiller(page, baseURL);
    await ouvrirMenu(page);
    const BOUTIQUE = /\/js\/menu\/(boutique|chances|resultat|personnage|equipement-etat)\.js$|\/js\/core\/(caisses|equipement)\.js$|\/data\/menu\/(caisses|objets|raretes|personnages|inventaire-depart)\.json$/;
    expect(o.fichiers.filter((f) => BOUTIQUE.test(f))).toEqual([]);
    expect(o.fichiers.filter((f) => f.endsWith('.js')).length).toBe(29);
    await page.locator('#menu-onglet-boutique').click();
    await expect(page.locator('#menu-ecran-boutique')).toBeVisible();
    expect(o.fichiers.filter((f) => BOUTIQUE.test(f)).sort()).toEqual(['/data/menu/caisses.json', '/data/menu/inventaire-depart.json', '/data/menu/objets.json', '/data/menu/personnages.json', '/data/menu/raretes.json', '/js/core/caisses.js', '/js/core/equipement.js', '/js/menu/boutique.js', '/js/menu/equipement-etat.js']);
    await page.locator('#menu-caisse-elite-chances').click();
    await expect(page.locator('#menu-ecran-chances')).toBeVisible();
    expect(o.fichiers.filter((f) => f.endsWith('/js/menu/chances.js'))).toHaveLength(1);
    await page.keyboard.press('Escape');
    await page.locator('#menu-caisse-elite-un').click();
    await expect(page.locator('#menu-ecran-resultat')).toBeVisible();
    expect(o.fichiers.filter((f) => /\/js\/menu\/(resultat|personnage)\.js$/.test(f)).sort()).toEqual(['/js/menu/personnage.js', '/js/menu/resultat.js']);
    expect(o.fichiers.filter((f) => /\/vendor\/three\/|\/js\/game\/(main|game)\.js$/.test(f))).toEqual([]);
    expect([o.problemes, o.externes]).toEqual([[], []]);
  });

  test('caisses animées (flotte, « ? » qui pulse, rayons, tremblement lent, en décalé) ; immobiles sur un autre onglet ou page cachée, reprises au retour', async ({ page }) => {
    await ouvrirBoutique(page);
    const sel = '#menu-ecran-boutique';
    expect(await nomsAnims(page, sel)).toEqual(ANIMS_E3);
    expect(await etats(page, sel)).toEqual(['running']);
    // Décalage d'une carte à l'autre (0, −1,3 s, −2,6 s), tremblement en 4 s et pulsation en 1,6 s (moins de 3 éclats par seconde).
    const tremble = await page.locator('.e3-tremble').evaluateAll((ns) => ns.map((n) => [getComputedStyle(n).animationDelay, getComputedStyle(n).animationDuration]));
    expect(tremble).toEqual([['0s', '4s'], ['-1.3s', '4s'], ['-2.6s', '4s']]);
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
      await expect(page.locator('.e3-chances-groupe-objets')).toHaveText(attendu.map((x) => x.objets.map((ob) => ob.nom).join(', ')));
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
    await expect(page.locator('.e8-onglets')).toBeVisible(); // barre d'onglets gardée
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

  test('« Ouvrir ×10 » (ravitaillement) : dix cartes dans l\'ordre de la fonction pure, rareté écrite et bordée, halo des épiques et légendaires, résumé exact ; « Rouvrir ×10 » ; « Retour », Échap et un onglet touché ramènent à la Boutique', async ({ page }) => {
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
    await page.locator('#menu-resultat-retour').click();
    await expect(page.locator('#menu-ecran-boutique')).toBeVisible();
    await expect(page.locator('#menu-caisse-ravitaillement-dix')).toBeFocused();
    // Échap ferme le résultat ; un onglet touché aussi.
    await page.locator('#menu-caisse-ravitaillement-dix').click();
    await expect(page.locator('#menu-ecran-resultat')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('#menu-ecran-boutique')).toBeVisible();
    await page.locator('#menu-caisse-ravitaillement-dix').click();
    await expect(page.locator('#menu-ecran-resultat')).toBeVisible();
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
