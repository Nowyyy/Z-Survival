// Lot 8d : écran Personnage (E9-1) et sous-menus Inventaire, Fusion, Personnages (E9-2 à E9-4) du menu principal ; niveaux effectifs transmis à la
// partie par « JOUER » (Docs/ref/menu-principal.md). ?test=1&menu=1 ; 932 × 430 (référence), 667 × 375, 1440 × 900 ; projets bureau et mobile (paysage).
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { readFileSync } from 'node:fs';
import { creerEtatEquipement, lireCatalogue, statistiquesEffectives } from '../../js/core/equipement.js';

const REF = { width: 932, height: 430 };
const SIZES = [REF, { width: 667, height: 375 }, { width: 1440, height: 900 }];
const BRUIT = /GL Driver Message|GPU stall|swiftshader|WebGL/i; // messages du rendu logiciel de Chromium, sans rapport avec la page
const lire = (f) => JSON.parse(readFileSync(f, 'utf8'));
const PARAMS = lire('data/game/player-stats.json');
const DONNEES = { raretes: lire('data/menu/raretes.json'), objets: lire('data/menu/objets.json'), personnages: lire('data/menu/personnages.json'), inventaire: lire('data/menu/inventaire-depart.json') };
const { cat, depart } = lireCatalogue(DONNEES);
// Fonction pure (js/core/equipement.js) : niveaux attendus avec l'équipement de départ ; ?test=1 : sauvegarde en mémoire, vide (base : zéros).
const ATTENDU = statistiquesEffectives(null, creerEtatEquipement(cat, depart), cat, PARAMS).niveaux;
const ANIMS_E9 = ['e9-bandana', 'e9-ombre', 'e9-projecteur', 'e9-respire', 'e9-tete', 'e9-viser'];

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

// Écritures dans le stockage (sauf la marque de test) : aucune n'est permise depuis le menu.
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

async function ouvrirMenu(page, size = REF, extra = '') {
  await page.setViewportSize(size);
  await page.goto(`/jeu.html?test=1&menu=1&seed=1${extra}`);
  await expect(page.locator('#menu-jouer')).toBeVisible({ timeout: 60_000 });
  await page.waitForFunction(() => window.__zsMenu?.etat()?.menu !== null && !document.getElementById('e7'));
}
async function ouvrirPersonnage(page, size = REF, extra = '') {
  await ouvrirMenu(page, size, extra);
  await page.locator('#menu-onglet-personnage').click();
  await expect(page.locator('#menu-ecran-personnage')).toBeVisible();
}
const etatPerso = (page) => page.evaluate(() => window.__zsMenu.etat().menu.personnage);

const boite = (page, sel) => page.locator(sel).first().evaluate((n) => {
  const r = n.getBoundingClientRect();
  return { l: r.left, t: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height };
});
const chevauche = (x, y) => x.l < y.r - 0.5 && y.l < x.r - 0.5 && x.t < y.b - 0.5 && y.t < x.b - 0.5;
const animations = (page, sel) => page.locator(sel).evaluate((n) => n.getAnimations({ subtree: true }).filter((a) => a.animationName).map((a) => [a.animationName, a.playState]));
const nomsAnims = async (page, sel) => [...new Set((await animations(page, sel)).map(([n]) => n))].sort();
const etats = async (page, sel) => [...new Set((await animations(page, sel)).map(([, s]) => s))];

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
    out[s] = { ratio: (a + 0.05) / (z + 0.05), couleur: couleurs[s], fond: clair };
  }
  await style.evaluate((n) => n.remove());
  return out;
}

const EMPLACEMENTS_DEPART = [
  ['arme', 'Arme · Rare', 'Pistolet · niv. 3', 'rare'],
  ['tenue', 'Tenue · Commun', 'Gilet · niv. 3', 'commun'],
  ['gants', 'Gants · Vide', 'Aucun objet', null],
  ['bottes', 'Bottes · Peu commun', 'Bottes · niv. 2', 'peu-commun'],
  ['accessoire1', 'Accessoire · Épique', 'Amulette · niv. 1', 'epique'],
  ['accessoire2', 'Accessoire · Vide', 'Aucun objet', null],
];

test.describe('écran Personnage (E9-1)', () => {
  for (const size of SIZES) {
    test(`${size.width}×${size.height} : bandeau, six emplacements de l'équipement de départ (rareté écrite), capacité, statistiques effectives = fonction pure, Inventaire et Fusion ; rien hors de l'écran ni superposé ; 44 px ; axe ; console propre ; aucune écriture`, async ({ page, baseURL }) => {
      const o = surveiller(page, baseURL);
      await espionStockage(page);
      await ouvrirPersonnage(page, size);
      await expect(page.locator('#menu-onglet-personnage')).toHaveAttribute('aria-current', 'page');
      await expect(page.locator('#menu-ecran-personnage .menu-bandeau-libelle')).toHaveText('Personnage');
      await expect(page.getByRole('heading', { name: 'Équipement' })).toBeVisible();
      for (const [e, ligne, nom, rarete] of EMPLACEMENTS_DEPART) {
        const b = page.locator(`#menu-perso-${e}`);
        await expect(b.locator('.e9-emplacement-ligne'), e).toHaveText(ligne);
        await expect(b.locator('.e9-emplacement-nom'), e).toHaveText(nom);
        if (rarete) await expect(b).toHaveAttribute('data-rarete', rarete);
        else await expect(b).not.toHaveAttribute('data-rarete', /.*/);
        await expect(b).toHaveAccessibleName(`${ligne} ${nom} : ouvrir l'inventaire`);
      }
      // Bordure de la couleur de la rareté (jeton --rarete-*), neutre si vide.
      const bords = await page.locator('.e9-emplacement').evaluateAll((ns) => ns.map((n) => getComputedStyle(n).borderTopColor));
      expect(new Set(bords).size).toBe(5);
      await expect(page.locator('#menu-perso-gauche > ul')).toHaveAccessibleName('Arme, tenue et gants');
      await expect(page.locator('#menu-perso-droite > ul')).toHaveAccessibleName('Bottes et accessoires');
      // Capacité du Survivant (à définir, sans effet) ; personnage et étiquette.
      await expect(page.locator('.e9-capacite-nom')).toHaveText('Survivant');
      await expect(page.locator('.e9-capacite-niveau')).toHaveText('niv. 1');
      await expect(page.locator('.e9-capacite-titre')).toHaveText('Capacité : [à définir]');
      await expect(page.locator('.e9-capacite-effet')).toHaveText('[À définir : aucun effet]');
      await expect(page.locator('#menu-perso-silhouette')).toHaveAccessibleName('Touche-le pour changer de personnage ou l\'améliorer');
      await expect(page.locator('#menu-perso-silhouette .e9-silhouette')).toHaveCount(1);
      await expect(page.locator('#menu-perso-essai')).toHaveText('Essai : rien n\'est encore gardé');
      // Statistiques effectives : celles de la fonction pure.
      await expect(page.locator('#menu-perso-stats-liste')).toHaveAccessibleName('Statistiques effectives');
      await expect(page.locator('#menu-perso-stats-liste li')).toHaveText([`Dégâts : ${ATTENDU.degats}`, `Vie : ${ATTENDU.vie}`, `Cadence : ${ATTENDU.cadence}`, `Vitesse : ${ATTENDU.vitesse}`, `Portée : ${ATTENDU.portee}`, `Précision : ${ATTENDU.precision}`]);
      expect([ATTENDU.degats, ATTENDU.vie, ATTENDU.vitesse]).toEqual([3, 5, 2]); // 3,6 ; 1,4 + 4 ; 2,25 : arrondis à la fin
      expect((await etatPerso(page)).stats).toEqual(ATTENDU);
      await expect(page.locator('#menu-perso-inventaire')).toHaveText('Inventaire');
      await expect(page.locator('#menu-perso-fusion')).toHaveText('Fusion');
      // Disposition : tout dans la fenêtre, dans la zone de contenu ; aucun bloc superposé ; 44 px.
      const ids = ['.e8-entete', '#menu-ecran-personnage .menu-bandeau', '#menu-perso-essai', '#menu-perso-silhouette', '#menu-perso-gauche', '#menu-perso-droite', '#menu-perso-capacite', '.e8-onglets'];
      const b = {};
      for (const s of ids) b[s] = await boite(page, s);
      const contenu = await boite(page, '#menu-contenu');
      for (const s of ids) expect([b[s].l >= 0, b[s].t >= 0, b[s].r <= size.width + 0.5, b[s].b <= size.height + 0.5], s).toEqual([true, true, true, true]);
      for (const s of ids.slice(1, -1)) expect([b[s].t >= contenu.t - 0.5, b[s].b <= contenu.b + 0.5], s).toEqual([true, true]);
      for (let i = 0; i < ids.length; i += 1) for (let j = i + 1; j < ids.length; j += 1) expect(chevauche(b[ids[i]], b[ids[j]]), `${ids[i]} / ${ids[j]}`).toBe(false);
      for (const s of ['.e9-emplacement', '.e9-action', '#menu-perso-capacite', '#menu-perso-silhouette']) {
        for (const r of await page.locator(s).evaluateAll((ns) => ns.map((n) => n.getBoundingClientRect().toJSON()))) expect([r.width >= 44, r.height >= 44], s).toEqual([true, true]);
      }
      // Aucun texte coupé ni débordant de sa boîte.
      const debord = await page.locator('#menu-ecran-personnage').evaluate((sec) => [...sec.querySelectorAll('button, .e9-stat, .e9-essai')].filter((n) => n.scrollWidth > n.clientWidth + 1 && !n.classList.contains('e9-perso-bouton')).map((n) => n.id || n.className));
      expect(debord).toEqual([]);
      const axe = await new AxeBuilder({ page }).include('#e8').analyze();
      expect(axe.violations.map((v) => `${v.id} : ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([]);
      expect(await page.evaluate(() => window.__ecritures)).toEqual([]);
      expect(o.problemes).toEqual([]);
      expect(o.externes).toEqual([]);
    });
  }

  test('contraste : 4,5:1 au moins contre le pixel le plus clair derrière chaque texte (932 × 430 et 667 × 375)', async ({ page }) => {
    for (const size of SIZES.slice(0, 2)) {
      await ouvrirPersonnage(page, size);
      const sels = ['.e9-etiquette', '#menu-perso-essai', '#menu-perso-stats-liste', '.e9-capacite-nom', '.e9-capacite-titre', '.e9-capacite-effet', '.e9-capacite-niveau',
        '#menu-perso-arme .e9-emplacement-ligne', '#menu-perso-arme .e9-emplacement-nom', '#menu-perso-gants .e9-emplacement-ligne', '#menu-perso-gants .e9-emplacement-nom', '#menu-perso-inventaire span', '#menu-perso-fusion span'];
      const c = await contrastes(page, sels);
      for (const s of sels) expect(c[s].ratio, `${size.width} ${s} ${c[s].couleur} sur ${c[s].fond}`).toBeGreaterThanOrEqual(4.5);
    }
  });

  test('chargé à la demande (ni au démarrage du menu ni avant l\'onglet) ; animations e9-* en cours, en pause sur un autre onglet ou page cachée, reprises au retour', async ({ page, baseURL }) => {
    const o = surveiller(page, baseURL);
    await ouvrirMenu(page);
    const PERSO = /\/js\/menu\/(personnage|equipement-etat|inventaire|fusion|personnages)\.js$|\/js\/core\/equipement\.js$|\/data\/menu\/(objets|raretes|personnages|inventaire-depart)\.json$/;
    expect(o.fichiers.filter((f) => PERSO.test(f))).toEqual([]);
    expect(o.fichiers.filter((f) => f.endsWith('.js')).length).toBe(29); // démarrage du menu inchangé
    await page.locator('#menu-onglet-personnage').click();
    await expect(page.locator('#menu-ecran-personnage')).toBeVisible();
    expect(o.fichiers.filter((f) => PERSO.test(f)).sort()).toEqual(['/data/menu/inventaire-depart.json', '/data/menu/objets.json', '/data/menu/personnages.json', '/data/menu/raretes.json', '/js/core/equipement.js', '/js/menu/equipement-etat.js', '/js/menu/personnage.js']);
    expect(o.fichiers.filter((f) => /\/vendor\/three\/|\/js\/game\/(main|game)\.js$/.test(f))).toEqual([]);
    const sel = '#menu-ecran-personnage';
    expect(await nomsAnims(page, sel)).toEqual(ANIMS_E9);
    expect(await etats(page, sel)).toEqual(['running']);
    await page.locator('#menu-onglet-infini').click();
    await expect(page.locator(sel)).toBeHidden();
    await expect(page.locator('#menu-ecran-personnage .e9-scene')).toHaveAttribute('data-anim', 'off');
    expect(await etats(page, sel)).toEqual([]); // écran masqué (display: none) : aucune animation ne tourne
    await page.locator('#menu-onglet-personnage').click();
    expect(await etats(page, sel)).toEqual(['running']);
    await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); document.dispatchEvent(new Event('visibilitychange')); });
    await expect(page.locator('#menu-ecran-personnage .e9-scene')).toHaveAttribute('data-anim', 'off');
    expect(await etats(page, sel)).toEqual(['paused']);
    await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => false }); document.dispatchEvent(new Event('visibilitychange')); });
    expect(await etats(page, sel)).toEqual(['running']);
    expect(o.problemes).toEqual([]);
  });

  test('prefers-reduced-motion : personnage immobile (aucune animation)', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await ouvrirPersonnage(page);
    expect(await animations(page, '#menu-ecran-personnage')).toEqual([]);
    await expect(page.locator('#menu-perso-silhouette .e9-silhouette')).toBeVisible();
  });
});
