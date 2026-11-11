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
const ANIMS_E9 = ['e8-coulure', 'e8-goutte', 'e9-bandana', 'e9-ombre', 'e9-projecteur', 'e9-respire', 'e9-tete', 'e9-viser']; // retour du propriétaire : coulures du bandeau commun (e8-coulure, e8-goutte)

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
// États des animations ; « finished » (allongement des coulures du bandeau, joué une fois à l'affichage) n'est pas compté.
const etats = async (page, sel) => [...new Set((await animations(page, sel)).map(([, s]) => s).filter((s) => s !== 'finished'))];

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
    // Boîte resserrée d'un pixel : le fond derrière le texte, sans le bord antialiasé de la boîte (densité 2,75 du projet mobile).
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
      await expect(page.locator('#menu-perso-essai')).toHaveCount(0); // retour du propriétaire : mention « Essai » retirée
      // Statistiques effectives : celles de la fonction pure.
      await expect(page.locator('#menu-perso-stats-liste')).toHaveAccessibleName('Statistiques effectives');
      await expect(page.locator('#menu-perso-stats-liste li')).toHaveText([`Dégâts : ${ATTENDU.degats}`, `Vie : ${ATTENDU.vie}`, `Cadence : ${ATTENDU.cadence}`, `Vitesse : ${ATTENDU.vitesse}`, `Portée : ${ATTENDU.portee}`, `Précision : ${ATTENDU.precision}`]);
      expect([ATTENDU.degats, ATTENDU.vie, ATTENDU.vitesse]).toEqual([3, 5, 2]); // 3,6 ; 1,4 + 4 ; 2,25 : arrondis à la fin
      expect((await etatPerso(page)).stats).toEqual(ATTENDU);
      await expect(page.locator('#menu-perso-inventaire')).toHaveText('Inventaire');
      await expect(page.locator('#menu-perso-fusion')).toHaveText('Fusion');
      // Disposition : tout dans la fenêtre, dans la zone de contenu ; aucun bloc superposé ; 44 px.
      const ids = ['.e8-entete', '#menu-ecran-personnage .menu-bandeau', '#menu-perso-silhouette', '#menu-perso-gauche', '#menu-perso-droite', '#menu-perso-capacite', '.e8-onglets'];
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
      const debord = await page.locator('#menu-ecran-personnage').evaluate((sec) => [...sec.querySelectorAll('button, .e9-stat')].filter((n) => n.scrollWidth > n.clientWidth + 1 && !n.classList.contains('e9-perso-bouton')).map((n) => n.id || n.className));
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
      const sels = ['.e9-etiquette', '#menu-perso-stats-liste', '.e9-capacite-nom', '.e9-capacite-titre', '.e9-capacite-effet', '.e9-capacite-niveau',
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

// --- Sous-menus (partie D) ----------------------------------------------------------------------------------------------------------------
const BAS = { inventaire: ['.e9-pagination', '#menu-inventaire-detail'], fusion: ['#menu-fusion-atelier', '#menu-fusion-compatibles'], personnages: ['#menu-personnages-grille', '#menu-personnages-fiche'] };
const etatSous = (page, nom) => page.evaluate((n) => window.__zsMenu.etat().menu.personnage.sous[n], nom);

test.describe('sous-menus Inventaire, Fusion, Personnages (E9-2 à E9-4)', () => {
  for (const size of SIZES) {
    test(`${size.width}×${size.height} : trois écrans pleins (onglets masqués, en-tête gardé), bandeau et « ‹ Équipement » ; rien hors de l'écran ni superposé ; 44 px ; axe ; console propre`, async ({ page, baseURL }) => {
      const o = surveiller(page, baseURL);
      await espionStockage(page);
      await ouvrirPersonnage(page, size);
      const ecrans = [
        ['#menu-perso-inventaire', 'inventaire', 'Inventaire', ['#menu-inventaire-filtres', '#menu-inventaire-grille', '.e9-pagination', '#menu-inventaire-detail']],
        ['#menu-perso-fusion', 'fusion', 'Fusion', ['#menu-fusion-regle', '#menu-fusion-atelier', '#menu-fusion-compatibles']],
        ['#menu-perso-silhouette', 'personnages', 'Personnages', ['#menu-personnages-grille', '#menu-personnages-fiche']],
      ];
      for (const [ouvreur, nom, titre, blocs] of ecrans) {
        await page.locator(ouvreur).click();
        const sec = `#menu-ecran-${nom}`;
        await expect(page.locator(sec)).toBeVisible();
        // Retour du propriétaire : la barre d'onglets reste visible dans les sous-menus (avant : écran plein, barre masquée) ; Personnage reste l'onglet actif.
        await expect(page.locator('.e8-onglets')).toBeVisible();
        await expect(page.locator('#menu-onglet-personnage')).toHaveAttribute('aria-current', 'page');
        await expect(page.locator('#menu-ecran-personnage')).toBeHidden();
        await expect(page.locator('#e8')).toHaveAttribute('data-ecran', nom);
        await expect(page.locator(`${sec} .menu-bandeau-libelle`)).toHaveText('Équipement');
        await expect(page.getByRole('heading', { name: titre, exact: true })).toBeVisible();
        await expect(page.locator(`#menu-${nom}-retour`)).toHaveAccessibleName('Retour à l\'équipement');
        await expect(page.locator(`#menu-${nom}-retour`)).toHaveText('Retour'); // retour du propriétaire (avant : « Équipement »)
        const ids = ['.e8-entete', `${sec} .e9-tete`, ...blocs, '.e8-onglets'];
        const b = {};
        for (const s of ids) b[s] = await boite(page, s);
        for (const s of ids) expect([b[s].l >= 0, b[s].t >= 0, b[s].r <= size.width + 0.5, b[s].b <= size.height + 0.5], `${nom} ${s}`).toEqual([true, true, true, true]);
        for (let i = 0; i < ids.length; i += 1) for (let j = i + 1; j < ids.length; j += 1) expect(chevauche(b[ids[i]], b[ids[j]]), `${nom} : ${ids[i]} / ${ids[j]}`).toBe(false);
        for (const r of await page.locator(`${sec} button`).evaluateAll((ns) => ns.filter((n) => n.offsetParent).map((n) => [n.id || n.className, n.getBoundingClientRect().toJSON()]))) expect([r[1].width >= 44, r[1].height >= 44], `${nom} ${r[0]}`).toEqual([true, true]);
        // Retour du propriétaire (« espace vide en bas ») : panneau de droite et dernier bloc de gauche descendent jusqu'à la barre d'onglets.
        for (const s of BAS[nom]) expect(b['.e8-onglets'].t - b[s].b, `${nom} ${s} : écart avec la barre d'onglets`).toBeLessThan(20);
        // Rien de coupé : panneaux et grilles sans défilement à ces tailles (inventaire de départ), sauf la grille des objets compatibles, qui défile
        // quand tous les fusionnables sont listés (aucun objet placé) ; ses cases restent atteignables au clavier.
        const coupe = await page.locator(sec).evaluate((n) => [...n.querySelectorAll('.e9-panneau, .e9-grille')].filter((x) => x.id !== 'menu-fusion-grille' && x.scrollHeight > x.clientHeight + 1).map((x) => x.id || x.className));
        expect(coupe, nom).toEqual([]);
        if (nom === 'fusion') expect(await page.locator('#menu-fusion-grille').evaluate((n) => getComputedStyle(n).overflowY)).toBe('auto');
        const axe = await new AxeBuilder({ page }).include('#e8').analyze();
        expect(axe.violations.map((v) => `${nom} ${v.id} : ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([]);
        await page.keyboard.press('Escape'); // retour à l'écran Personnage
        await expect(page.locator(sec)).toBeHidden();
        await expect(page.locator('#menu-ecran-personnage')).toBeVisible();
        await expect(page.locator('.e8-onglets')).toBeVisible();
        await expect(page.locator(ouvreur)).toBeFocused();
      }
      expect(await page.evaluate(() => window.__ecritures)).toEqual([]);
      expect(o.problemes).toEqual([]);
      expect(o.externes).toEqual([]);
    });
  }

  test('Inventaire : filtre venu d\'un emplacement, filtres, pagination, objet choisi, Équiper puis Retirer, Améliorer jusqu\'au maximum (prix affiché, argent non prélevé), « Fusionner cet objet »', async ({ page, baseURL }) => {
    const o = surveiller(page, baseURL);
    await espionStockage(page);
    await ouvrirPersonnage(page);
    // Emplacement Gants (vide) → Inventaire filtré sur les gants (filtre ajouté, pressé).
    await page.locator('#menu-perso-gants').click();
    await expect(page.locator('#menu-ecran-inventaire')).toBeVisible();
    let s = await etatSous(page, 'inventaire');
    expect([s.filtre, s.filtres, s.visibles]).toEqual(['gants', ['tout', 'arme', 'tenue', 'accessoire', 'gants'], ['o11', 'o10']]);
    await expect(page.locator('#menu-inventaire-filtre-gants')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('#menu-inventaire-filtre-tout')).toHaveAttribute('aria-pressed', 'false');
    await expect(page.locator('#menu-inventaire-grille')).toHaveAccessibleName('Objets possédés');
    await expect(page.locator('#menu-objet-o11')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('#menu-inventaire-nom')).toHaveText('Gants');
    await expect(page.locator('#menu-inventaire-ligne')).toHaveText('Gants · Rare · niv. 2');
    await expect(page.locator('#menu-inventaire-effet')).toHaveText('Cadence +3,3');
    await expect(page.locator('#menu-inventaire-exemplaires')).toHaveText('Exemplaires identiques : 1 sur 3 pour une fusion');
    // Équiper : l'emplacement Gants est rempli, annonce ; puis Retirer.
    await page.locator('#menu-inventaire-equiper').click();
    await expect(page.locator('#menu-inventaire-annonce')).toHaveText('Gants équipé.');
    await expect(page.locator('#menu-inventaire-equiper')).toHaveText('Retirer');
    await expect(page.locator('#menu-objet-o11 .e9-case-niveau')).toHaveText('niv. 2 · Porté');
    expect((await etatPerso(page)).emplacements.gants.uid).toBe('o11');
    expect((await etatPerso(page)).stats.cadence).toBe(ATTENDU.cadence + 3);
    await page.locator('#menu-inventaire-equiper').click();
    await expect(page.locator('#menu-inventaire-annonce')).toHaveText('Gants retiré.');
    expect((await etatPerso(page)).emplacements.gants).toBeNull();
    await page.locator('#menu-inventaire-equiper').click();
    // Filtres de base : Armes, Tout (16 objets, 2 pages de 12, triés par rareté décroissante).
    await page.locator('#menu-inventaire-filtre-arme').click();
    s = await etatSous(page, 'inventaire');
    expect([s.filtre, s.visibles]).toEqual(['arme', ['o16', 'o1']]);
    await page.locator('#menu-inventaire-filtre-tout').click();
    s = await etatSous(page, 'inventaire');
    expect([s.page, s.pages, s.visibles.length, s.visibles[0]]).toEqual([1, 2, 16, 'o16']);
    await expect(page.locator('#menu-inventaire-grille li')).toHaveCount(12);
    await expect(page.locator('#menu-inventaire-page')).toHaveText('Page 1 / 2 · trié par rareté');
    await expect(page.locator('#menu-inventaire-avant')).toHaveAttribute('aria-disabled', 'true');
    await page.locator('#menu-inventaire-apres').click();
    await expect(page.locator('#menu-inventaire-page')).toHaveText('Page 2 / 2 · trié par rareté');
    await expect(page.locator('#menu-inventaire-grille li')).toHaveCount(4);
    await expect(page.locator('#menu-inventaire-apres')).toHaveAttribute('aria-disabled', 'true');
    await page.locator('#menu-inventaire-apres').click({ force: true }); // désactivé : rien
    await expect(page.locator('#menu-inventaire-page')).toHaveText('Page 2 / 2 · trié par rareté');
    await page.locator('#menu-inventaire-avant').click();
    // Améliorer un Gilet commun (niv. 1, maximum 5) jusqu'au maximum : prix affiché, solde inchangé, puis désactivé avec sa raison.
    await page.locator('#menu-objet-o5').click();
    await expect(page.locator('#menu-inventaire-ameliorer')).toHaveText('Améliorer · 40');
    for (let n = 2; n <= 5; n += 1) {
      await page.locator('#menu-inventaire-ameliorer').click();
      await expect(page.locator('#menu-inventaire-annonce')).toHaveText(`Gilet amélioré : niveau ${n}.`);
    }
    await expect(page.locator('#menu-inventaire-ameliorer')).toHaveText('Niveau maximal');
    await expect(page.locator('#menu-inventaire-ameliorer')).toHaveAttribute('aria-disabled', 'true');
    await expect(page.locator('#menu-inventaire-ameliorer')).toHaveAccessibleDescription('Niveau maximal atteint (5).');
    await page.locator('#menu-inventaire-ameliorer').click({ force: true });
    expect((await etatPerso(page)).objets.find((x) => x.uid === 'o5').niveau).toBe(5);
    await expect(page.locator('#menu-solde-texte')).toHaveText('0'); // argent jamais prélevé
    // Légendaire : « Fusionner cet objet » désactivé (raison écrite).
    await page.locator('#menu-objet-o16').click();
    await expect(page.locator('#menu-inventaire-fusionner')).toHaveAttribute('aria-disabled', 'true');
    await expect(page.locator('#menu-inventaire-fusionner')).toHaveAccessibleDescription('Rareté maximale : cet objet ne se fusionne plus.');
    await page.locator('#menu-inventaire-fusionner').click({ force: true });
    await expect(page.locator('#menu-ecran-inventaire')).toBeVisible();
    // « Fusionner cet objet » : Fusion s'ouvre avec l'objet placé.
    await page.locator('#menu-objet-o5').click();
    await page.locator('#menu-inventaire-fusionner').click();
    await expect(page.locator('#menu-ecran-fusion')).toBeVisible();
    expect((await etatSous(page, 'fusion')).places).toEqual(['o5', null, null]);
    expect(await page.evaluate(() => window.__ecritures)).toEqual([]);
    expect(o.problemes).toEqual([]);
  });

  test('Fusion : placer trois objets (compatibles filtrés), manque, Remplir automatiquement, Fusionner (résultat annoncé, inventaire et équipement mis à jour) ; légendaire non fusionnable ; coût affiché non prélevé', async ({ page, baseURL }) => {
    const o = surveiller(page, baseURL);
    await espionStockage(page);
    await ouvrirPersonnage(page);
    await page.locator('#menu-perso-fusion').click();
    await expect(page.locator('#menu-fusion-regle')).toHaveText('3 objets identiques de même rareté donnent 1 objet de la rareté supérieure.');
    await expect(page.locator('#menu-fusion-message')).toHaveText('Place trois objets identiques de même rareté.');
    await expect(page.locator('#menu-fusion-rarete')).toHaveText('Tous les objets fusionnables');
    await expect(page.locator('#menu-fusion-objet-o16')).toHaveCount(0); // légendaire absent des compatibles
    await expect(page.locator('#menu-fusion-fusionner')).toHaveAttribute('aria-disabled', 'true');
    // Un Gilet commun placé : compatibles = Gilets communs ; « Il manque 2 … ».
    await page.locator('#menu-fusion-objet-o5').click();
    await expect(page.locator('#menu-fusion-rarete')).toHaveText('Rareté : Commun');
    expect(await page.locator('#menu-fusion-grille button').evaluateAll((ns) => ns.map((n) => n.dataset.uid).sort())).toEqual(['o2', 'o5', 'o6']);
    await expect(page.locator('#menu-fusion-objet-o5')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('#menu-fusion-objet-o5 .e9-case-niveau')).toHaveText('Placé');
    await expect(page.locator('#menu-fusion-message')).toHaveText('Il manque 2 exemplaires de Gilet commun. Coût : 100');
    await expect(page.locator('#menu-fusion-resultat')).toHaveAttribute('data-rarete', 'peu-commun');
    await expect(page.locator('#menu-fusion-resultat')).toContainText('Peu commun');
    await page.locator('#menu-fusion-objet-o6').click();
    await expect(page.locator('#menu-fusion-message')).toHaveText('Il manque 1 Gilet commun. Coût : 100');
    await expect(page.locator('#menu-fusion-fusionner')).toHaveAccessibleDescription('Il manque 1 Gilet commun. Coût : 100');
    await page.locator('#menu-fusion-fusionner').click({ force: true }); // désactivé : rien
    expect((await etatSous(page, 'fusion')).places).toEqual(['o5', 'o6', null]);
    // Retirer un objet placé, puis Remplir automatiquement (le Gilet porté en dernier recours).
    await page.locator('#menu-fusion-place-2').click();
    expect((await etatSous(page, 'fusion')).places).toEqual(['o5', null, null]);
    await page.locator('#menu-fusion-auto').click();
    expect((await etatSous(page, 'fusion')).places).toEqual(['o5', 'o6', 'o2']);
    await expect(page.locator('#menu-fusion-message')).toHaveText('Fusion possible. Coût : 100');
    await expect(page.locator('#menu-fusion-resultat')).toHaveClass(/is-pret/);
    expect(await nomsAnims(page, '#menu-ecran-fusion')).toEqual(['e8-coulure', 'e8-goutte', 'e9-etincelle', 'e9-filigrane', 'e9-lueur']);
    await page.locator('#menu-fusion-fusionner').click();
    await expect(page.locator('#menu-fusion-annonce')).toHaveText('Fusion réussie : Gilet Peu commun, niveau 3 (porté).');
    const e = await etatPerso(page);
    expect(e.objets.length).toBe(14);
    expect(e.objets.filter((x) => ['o2', 'o5', 'o6'].includes(x.uid))).toEqual([]);
    expect(e.emplacements.tenue).toEqual({ uid: 'f1', id: 'gilet', rarete: 'peu-commun', niveau: 3, niveauMax: 10 });
    expect((await etatSous(page, 'fusion')).places).toEqual([null, null, null]);
    await expect(page.locator('#menu-solde-texte')).toHaveText('0');
    // Retour à l'écran Personnage : la tenue portée est le Gilet peu commun.
    await page.locator('#menu-fusion-retour').click();
    await expect(page.locator('#menu-perso-tenue .e9-emplacement-ligne')).toHaveText('Tenue · Peu commun');
    await expect(page.locator('#menu-perso-tenue .e9-emplacement-nom')).toHaveText('Gilet · niv. 3');
    expect(await page.evaluate(() => window.__ecritures)).toEqual([]);
    expect(o.problemes).toEqual([]);
  });

  test('Personnages : choisir le deuxième (écran Personnage et statistiques mis à jour), verrouillé ni choisissable ni améliorable, améliorer (prix affiché, argent non prélevé) ; animations e9-* en pause hors de l\'écran', async ({ page, baseURL }) => {
    const o = surveiller(page, baseURL);
    await espionStockage(page);
    await ouvrirPersonnage(page);
    await page.locator('#menu-perso-capacite').click();
    await expect(page.locator('#menu-ecran-personnages')).toBeVisible();
    await expect(page.locator('#menu-personnages-grille')).toHaveAccessibleName('Liste des personnages');
    await expect(page.locator('#menu-personnages-grille .e9-case-niveau')).toHaveText(['Choisi · niv. 1', 'niv. 1', 'Verrouillé', 'Verrouillé', 'Verrouillé', 'Verrouillé']);
    await expect(page.locator('#menu-perso-carte-personnage-3 .e9-cadenas')).toHaveCount(1);
    await expect(page.locator('#menu-personnages-choisir')).toHaveText('Choisi');
    await expect(page.locator('#menu-personnages-choisir')).toHaveAttribute('aria-disabled', 'true');
    await expect(page.locator('#menu-personnages-niveau')).toHaveText('Niveau 1 · prochain niveau : 2');
    await expect(page.locator('#menu-personnages-barre')).toHaveAttribute('aria-valuenow', '1');
    expect(await nomsAnims(page, '#menu-ecran-personnages')).toEqual(['e8-coulure', 'e8-goutte', 'e9-bandana', 'e9-filigrane', 'e9-respire', 'e9-tete', 'e9-viser']);
    expect(await etats(page, '#menu-ecran-personnages')).toEqual(['running']);
    // Verrouillé : sélectionnable pour sa fiche, ni choisissable ni améliorable.
    await page.locator('#menu-perso-carte-personnage-3').click();
    await expect(page.locator('#menu-perso-carte-personnage-3')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('#menu-personnages-choisir')).toHaveAttribute('aria-disabled', 'true');
    await expect(page.locator('#menu-personnages-ameliorer')).toHaveAttribute('aria-disabled', 'true');
    await expect(page.locator('#menu-personnages-choisir')).toHaveAccessibleDescription('Personnage verrouillé : ni choisissable ni améliorable.');
    await page.locator('#menu-personnages-choisir').click({ force: true });
    await page.locator('#menu-personnages-ameliorer').click({ force: true });
    expect(await etatSous(page, 'personnages')).toMatchObject({ selection: 'personnage-3', choisi: false, verrouille: true, niveau: 1 });
    expect((await etatPerso(page)).choisi).toBe('survivant');
    // Le deuxième : choisir, puis améliorer deux fois (300 affiché, solde inchangé).
    await page.locator('#menu-perso-carte-personnage-2').click();
    await expect(page.locator('#menu-personnages-stats-titre')).toHaveText('Statistiques s\'il est choisi');
    await expect(page.locator('#menu-personnages-stats li').nth(3)).toHaveText(`Vitesse : ${ATTENDU.vitesse + 1}`);
    await page.locator('#menu-personnages-choisir').click();
    await expect(page.locator('#menu-personnages-annonce')).toHaveText('[Personnage 2] choisi.');
    await expect(page.locator('#menu-personnages-choisir')).toHaveText('Choisi');
    await expect(page.locator('#menu-personnages-stats-titre')).toHaveText('Statistiques effectives');
    await expect(page.locator('#menu-personnages-ameliorer')).toHaveText('Améliorer · 300');
    await page.locator('#menu-personnages-ameliorer').click();
    await page.locator('#menu-personnages-ameliorer').click();
    await expect(page.locator('#menu-personnages-annonce')).toHaveText('[Personnage 2] amélioré : niveau 3.');
    await expect(page.locator('#menu-personnages-niveau')).toHaveText('Niveau 3 · prochain niveau : 4');
    await expect(page.locator('#menu-solde-texte')).toHaveText('0');
    // Écran Personnage : nom, niveau, capacité et statistiques du personnage choisi (vitesse 2,25 + 1 + 0,5 × 2 = 4,25 → 4).
    await page.locator('#menu-personnages-retour').click();
    await expect(page.locator('.e9-capacite-nom')).toHaveText('[Personnage 2]');
    await expect(page.locator('.e9-capacite-niveau')).toHaveText('niv. 3');
    await expect(page.locator('.e9-capacite-titre')).toHaveText('Capacité : Pas léger (exemple)');
    await expect(page.locator('#menu-perso-stats-liste li').nth(3)).toHaveText('Vitesse : 4');
    expect(await etats(page, '#menu-ecran-personnage')).toEqual(['running']);
    expect(await etats(page, '#menu-ecran-personnages')).toEqual([]); // sous-menu masqué : aucune animation
    expect(await page.evaluate(() => window.__ecritures)).toEqual([]);
    expect(o.problemes).toEqual([]);
  });
});

// --- « JOUER » : niveaux effectifs transmis à la partie (option de démarrage), rien d'écrit -----------------------------------------------
const KEY = 'zs.save.v1';
const SAVE_STATS = { degats: 2, portee: 1, precision: 0, cadence: 3, vitesse: 9, vie: 1, regen: 0, chutes: 1, reparation: 0 };
async function poserSauvegarde(page) {
  await page.addInitScript(([k, stats]) => {
    if (sessionStorage.getItem('zs.test.pose')) return;
    sessionStorage.setItem('zs.test.pose', '1');
    localStorage.setItem(k, JSON.stringify({ v: 1, rev: 1, savedAt: 0, money: 500, earned: 500, stats, records: { bestWave: 3, bestKills: 0, runs: 1, worldsCompleted: 0 } }));
  }, [KEY, SAVE_STATS]);
}
const niveauxPartie = (page) => page.evaluate(() => { const s = window.__zs.getState(); return { source: s.stats.source, niveaux: { ...s.stats.levels, ...s.stats.extraLevels } }; });
async function retirerTout(page) {
  for (const e of ['arme', 'tenue', 'bottes', 'accessoire1']) {
    await page.locator(`#menu-perso-${e}`).click();
    await page.locator('#menu-inventaire-equiper').click(); // l'objet porté de cet emplacement est choisi : « Retirer »
    await expect(page.locator('#menu-inventaire-annonce')).toContainText('retiré');
    await page.keyboard.press('Escape');
  }
  expect(Object.values((await etatPerso(page)).emplacements)).toEqual([null, null, null, null, null, null]);
}
async function jouer(page) {
  await page.locator('#menu-onglet-jouer').click();
  await page.locator('#menu-jouer').click();
  await page.waitForFunction(() => (window.__zs?.getState()?.time ?? 0) > 0.05, null, { timeout: 90_000 });
}

test.describe('« JOUER » : niveaux de la partie', () => {
  test('avec l\'équipement modifié et le deuxième personnage : la partie reçoit exactement les niveaux de la fonction pure (bornés), source « menu » ; argent et sauvegarde inchangés, aucun objet ni niveau écrit', async ({ page }) => {
    test.setTimeout(150_000);
    await poserSauvegarde(page);
    await espionStockage(page);
    await ouvrirPersonnage(page, REF, '&store=local');
    const avant = await page.evaluate((k) => localStorage.getItem(k), KEY);
    await page.locator('#menu-perso-gants').click();
    await page.locator('#menu-inventaire-equiper').click(); // Gants rares (cadence 3,3)
    await page.keyboard.press('Escape');
    await page.locator('#menu-perso-silhouette').click();
    await page.locator('#menu-perso-carte-personnage-2').click();
    await page.locator('#menu-personnages-choisir').click(); // vitesse +1
    await page.keyboard.press('Escape');
    // Fonction pure, mêmes gestes : base = niveaux de la sauvegarde.
    const { equiper, choisirPersonnage } = await import('../../js/core/equipement.js');
    let etat = creerEtatEquipement(cat, depart);
    etat = choisirPersonnage(equiper(etat, cat, 'o11', 'gants'), cat, 'personnage-2');
    const attendu = statistiquesEffectives(SAVE_STATS, etat, cat, PARAMS).niveaux;
    expect(attendu).toEqual({ degats: 5, portee: 1, precision: 0, cadence: 6, vitesse: 10, vie: 6, regen: 0, chutes: 1, reparation: 0 }); // vitesse 9 + 2,25 + 1 → 10 (maximum)
    expect((await etatPerso(page)).stats).toEqual(attendu);
    expect(await page.evaluate(() => window.__ecritures)).toEqual([]);
    await jouer(page);
    const p = await niveauxPartie(page);
    expect(p.source).toBe('menu');
    expect(p.niveaux).toEqual(attendu);
    const s = await page.evaluate(() => { const st = window.__zs.getState(); return [st.mode, st.save.kind, st.save.readOnly]; });
    expect(s).toEqual(['histoire', 'local', false]);
    // Rien de nouveau dans la sauvegarde : mêmes niveaux, même argent, aucun champ d'objet ni de personnage.
    await page.evaluate(() => window.__zs.flushSave());
    const apres = JSON.parse(await page.evaluate((k) => localStorage.getItem(k), KEY));
    expect(apres.stats).toEqual(JSON.parse(avant).stats);
    expect(apres.money).toBe(500);
    expect(Object.keys(apres).sort()).toEqual(Object.keys(JSON.parse(avant)).sort());
    expect(await page.evaluate(() => Object.keys(localStorage).sort())).toEqual([KEY]);
    await page.evaluate(() => localStorage.clear());
  });

  test('sans objet porté et avec le Survivant : niveaux identiques à ceux de la sauvegarde (?store=local)', async ({ page }) => {
    test.setTimeout(150_000);
    await poserSauvegarde(page);
    await ouvrirPersonnage(page, REF, '&store=local');
    await retirerTout(page);
    expect((await etatPerso(page)).stats).toEqual(SAVE_STATS);
    await jouer(page);
    const p = await niveauxPartie(page);
    expect([p.source, p.niveaux]).toEqual(['menu', SAVE_STATS]);
    await page.evaluate(() => localStorage.clear());
  });

  test('sans objet porté et avec le Survivant : même logique pas à pas qu\'une partie directe de même graine (300 pas ; la source seule diffère)', async ({ browser }) => {
    test.setTimeout(200_000);
    async function partie(viaMenu) {
      const context = await browser.newContext({ viewport: { width: 667, height: 375 } });
      const page = await context.newPage();
      // Onglet « caché » : la boucle d'images ne tourne pas, seul step() fait avancer la partie (méthode de trace-logique.mjs).
      await page.addInitScript(() => Object.defineProperty(Document.prototype, 'hidden', { get: () => true, configurable: true }));
      if (viaMenu) {
        await ouvrirPersonnage(page, { width: 667, height: 375 });
        await retirerTout(page);
        await page.locator('#menu-onglet-jouer').click();
        await page.locator('#menu-jouer').click();
      } else {
        await page.goto('/jeu.html?test=1&seed=1'); // même graine que le menu (ouvrirMenu)
      }
      await page.waitForFunction(() => window.__zs, null, { timeout: 90_000 });
      const r = await page.evaluate(() => {
        const zs = window.__zs;
        const cles = ['time', 'dead', 'worldOver', 'player', 'economy', 'kills', 'waves', 'floor', 'aim', 'shots', 'enemies', 'bullets', 'windows', 'debris', 'laser', 'laserEnd', 'camera', 'stairLog', 'events', 'spawnLog', 'pose', 'stats'];
        const logique = () => { const s = zs.getState(); return JSON.stringify(cles.map((k) => (k === 'stats' ? { ...s.stats, source: '' } : s[k]))); };
        const pas = [];
        for (let i = 0; i < 300; i += 1) {
          zs.setInput({ aim: { angle: (i * 0.05) % (Math.PI * 2) } });
          zs.step(0.05);
          pas.push(logique());
        }
        return { pas, source: zs.getState().stats.source };
      });
      await context.close();
      return r;
    }
    const menu = await partie(true);
    const directe = await partie(false);
    expect([menu.source, directe.source]).toEqual(['menu', 'default']);
    const ecart = menu.pas.findIndex((p, i) => p !== directe.pas[i]);
    expect(ecart, `premier écart au pas ${ecart}`).toBe(-1);
  });
});

// Retour du propriétaire après la fusion : sur un téléphone à encoche en paysage, la zone sûre élargit les marges latérales (--e8-gauche, --e8-droite :
// environ 50 px au lieu de 16) ; la partie gauche des sous-menus passait sous le panneau de droite. Encoche simulée : marges de 50 px, 762 × 351.
test.describe('téléphone à encoche (762 × 351, marges latérales de 50 px)', () => {
  test('écran Personnage et trois sous-menus : rien hors de l\'écran ni superposé, rien sous la barre d\'onglets ; mots entiers dans les cases', async ({ page, baseURL }) => {
    const o = surveiller(page, baseURL);
    const size = { width: 762, height: 351 };
    await ouvrirMenu(page, size);
    await page.addStyleTag({ content: '#e8 { --e8-gauche: 50px !important; --e8-droite: 50px !important; }' });
    await page.locator('#menu-onglet-personnage').click();
    await expect(page.locator('#menu-ecran-personnage')).toBeVisible();
    const verifier = async (nom, ids, bas) => {
      const b = {};
      for (const s of ids) b[s] = await boite(page, s);
      for (const s of ids) expect([b[s].l >= 50 - 0.5, b[s].t >= 0, b[s].r <= size.width - 50 + 0.5, b[s].b <= bas + 0.5], `${nom} ${s}`).toEqual([true, true, true, true]);
      for (let i = 0; i < ids.length; i += 1) for (let j = i + 1; j < ids.length; j += 1) expect(chevauche(b[ids[i]], b[ids[j]]), `${nom} : ${ids[i]} / ${ids[j]}`).toBe(false);
    };
    const onglets = await boite(page, '.e8-onglets');
    await verifier('personnage', ['#menu-ecran-personnage .menu-bandeau', '#menu-perso-silhouette', '#menu-perso-gauche', '#menu-perso-droite', '#menu-perso-capacite'], onglets.t);
    for (const [ouvreur, nom, blocs] of [
      ['#menu-perso-inventaire', 'inventaire', ['#menu-inventaire-filtres', '#menu-inventaire-grille', '.e9-pagination', '#menu-inventaire-detail']],
      ['#menu-perso-fusion', 'fusion', ['#menu-fusion-regle', '#menu-fusion-atelier', '#menu-fusion-compatibles']],
      ['#menu-perso-silhouette', 'personnages', ['#menu-personnages-grille', '#menu-personnages-fiche']],
    ]) {
      await page.locator(ouvreur).click();
      await expect(page.locator(`#menu-ecran-${nom}`)).toBeVisible();
      const barre = await boite(page, '.e8-onglets');
      await verifier(nom, [`#menu-ecran-${nom} .e9-tete`, ...blocs], barre.t);
      for (const sel of BAS[nom]) expect(barre.t - (await boite(page, sel)).b, `${nom} ${sel} : écart avec la barre d'onglets`).toBeLessThan(20);
      // Aucun nom d'objet coupé au milieu d'un mot (un seul mot par nom dans les données : une seule ligne).
      const coupes = await page.locator(`#menu-ecran-${nom} .e9-case-nom`).evaluateAll((ns) => ns.filter((n) => n.offsetParent && n.getClientRects().length && n.getBoundingClientRect().height > parseFloat(getComputedStyle(n).lineHeight) * 1.5 && !/\s/.test(n.textContent)).map((n) => n.textContent));
      expect(coupes, nom).toEqual([]);
      await page.keyboard.press('Escape');
    }
    expect(o.problemes).toEqual([]);
  });
});

// Retour du propriétaire après la fusion : les coulures du bandeau débordaient sur le bloc suivant (emplacement Arme, règle de la Fusion, filtres)
// sur téléphone, où le bandeau garde ses tailles de texte minimales. Le bas des coulures doit rester au-dessus du bloc qui suit le bandeau.
test.describe('coulures du bandeau au-dessus du bloc suivant', () => {
  for (const [size, encoche] of [[REF, false], [{ width: 667, height: 375 }, false], [{ width: 1440, height: 900 }, false], [{ width: 762, height: 351 }, true]]) {
    test(`${size.width}×${size.height}${encoche ? ' (encoche simulée)' : ''} : Jouer, Infini, Personnage, Inventaire, Fusion, Personnages`, async ({ page }) => {
      await ouvrirMenu(page, size);
      if (encoche) await page.addStyleTag({ content: '#e8 { --e8-gauche: 50px !important; --e8-droite: 50px !important; }' });
      const bas = (sec) => page.locator(`${sec} .menu-bandeau-coulures > *`).evaluateAll((ns) => Math.max(...ns.map((n) => n.getBoundingClientRect().bottom)));
      // Retour du propriétaire (PC) : les coulures mordaient sur « Choisis ta carte » (Infini).
      expect(await bas('#menu-ecran-jouer'), 'Jouer').toBeLessThanOrEqual((await boite(page, '.e8-jouer-infos')).t + 0.5);
      await page.locator('#menu-onglet-infini').click();
      await expect(page.locator('#menu-ecran-infini')).toBeVisible();
      expect(await bas('#menu-ecran-infini'), 'Infini').toBeLessThanOrEqual((await boite(page, '#menu-infini-choix')).t + 0.5);
      await page.locator('#menu-onglet-personnage').click();
      await expect(page.locator('#menu-ecran-personnage')).toBeVisible();
      expect(await bas('#menu-ecran-personnage'), 'Personnage').toBeLessThanOrEqual((await boite(page, '#menu-perso-gauche')).t + 0.5);
      for (const [ouvreur, nom, suivant] of [['#menu-perso-inventaire', 'inventaire', '#menu-inventaire-filtres'], ['#menu-perso-fusion', 'fusion', '#menu-fusion-regle'], ['#menu-perso-silhouette', 'personnages', '#menu-personnages-grille']]) {
        await page.locator(ouvreur).click();
        await expect(page.locator(`#menu-ecran-${nom}`)).toBeVisible();
        expect(await bas(`#menu-ecran-${nom}`), nom).toBeLessThanOrEqual((await boite(page, suivant)).t + 0.5);
        await page.keyboard.press('Escape');
      }
    });
  }
});

// Retours du propriétaire : coulures du bandeau « comme celles du chargement » (gouttes du logo, js/logo.js), sur tous les bandeaux du menu, qui
// recoulent à chaque ouverture d'un onglet ou d'un écran.
test.describe('coulures des bandeaux du menu', () => {
  test('trois gouttes dessinées comme celles du logo (renflement, ombre, reflet), du rouge du bandeau, sur chaque onglet et écran', async ({ page }) => {
    await ouvrirMenu(page);
    for (const [ouvreur, sec] of [[null, '#menu-ecran-jouer'], ['#menu-onglet-infini', '#menu-ecran-infini'], ['#menu-onglet-personnage', '#menu-ecran-personnage'], ['#menu-perso-inventaire', '#menu-ecran-inventaire'], ['#menu-onglet-boutique', '#menu-ecran-boutique']]) {
      if (ouvreur === '#menu-onglet-boutique') await page.keyboard.press('Escape');
      if (ouvreur) await page.locator(ouvreur).click();
      await expect(page.locator(sec)).toBeVisible();
      await expect(page.locator(`${sec} .menu-coulure`), sec).toHaveCount(3);
      for (const c of ['menu-coulure-corps', 'menu-coulure-ombre', 'menu-coulure-reflet']) await expect(page.locator(`${sec} .${c}`), `${sec} ${c}`).toHaveCount(3);
      await expect(page.locator(`${sec} .menu-goutte`)).toHaveCount(1);
      expect(await page.locator(`${sec} .menu-coulure-corps`).first().getAttribute('d')).toMatch(/A[\d.]+ [\d.]+ 0 1 0/); // renflement arrondi (gouttePath)
      const [corps, fond] = await page.evaluate((s) => [getComputedStyle(document.querySelector(`${s} .menu-coulure-corps`)).fill, getComputedStyle(document.querySelector(`${s} .menu-bandeau`)).backgroundColor], sec);
      expect(corps, sec).toBe(fond);
    }
  });

  test('les gouttes recoulent à chaque ouverture d\'un onglet ; en pause quand la page est cachée ; immobiles sous prefers-reduced-motion', async ({ page }) => {
    await ouvrirMenu(page);
    // Temps écoulé de l'allongement des coulures du bandeau d'un écran (ms) ; null s'il n'y en a pas.
    const temps = (sec) => page.locator(`${sec} .menu-bandeau-coulures`).evaluate((n) => {
      const a = n.getAnimations({ subtree: true }).filter((x) => x.animationName === 'e8-coulure');
      return a.length ? Math.max(...a.map((x) => x.currentTime)) : null;
    });
    await page.waitForTimeout(1600);
    expect(await temps('#menu-ecran-jouer')).toBeGreaterThan(1200);
    for (const [onglet, sec] of [['infini', '#menu-ecran-infini'], ['personnage', '#menu-ecran-personnage'], ['jouer', '#menu-ecran-jouer'], ['infini', '#menu-ecran-infini']]) {
      await page.locator(`#menu-onglet-${onglet}`).click();
      await expect(page.locator(sec)).toBeVisible();
      expect(await temps(sec), `${onglet} : les gouttes repartent du haut`).toBeLessThan(600);
      await page.waitForTimeout(1300);
    }
    await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); document.dispatchEvent(new Event('visibilitychange')); });
    await expect(page.locator('#e8')).toHaveClass(/e8-pause/);
    expect(await page.locator('#menu-ecran-infini .menu-goutte').evaluate((n) => n.getAnimations().map((a) => a.playState))).toEqual(['paused']);
    await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => false }); document.dispatchEvent(new Event('visibilitychange')); });
    await expect(page.locator('#e8')).not.toHaveClass(/e8-pause/);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    expect((await animations(page, '#e8')).filter(([n]) => n === 'e8-coulure' || n === 'e8-goutte')).toEqual([]);
    const t = await page.locator('#menu-ecran-infini .menu-coulure-flux').first().evaluate((n) => getComputedStyle(n).transform);
    expect(['none', 'matrix(1, 0, 0, 1, 0, 0)']).toContain(t); // longueur finale
  });
});

// Retours du propriétaire sur PC (2000 × 1020) : trop de vide (l'unité plafonnait à 1,3 : elle va jusqu'à 2,4), inventaire sur deux pages alors que tout
// tenait (rangées selon la hauteur libre), coulures absentes de l'Inventaire (ses animations restaient en pause).
test('PC 2000 × 1020 : écrans à la largeur de la fenêtre, inventaire sur une page, coulures allongées sur chaque écran', async ({ page }) => {
  const size = { width: 2000, height: 1020 };
  await ouvrirPersonnage(page, size);
  const droite = await boite(page, '#menu-perso-droite');
  expect(size.width - droite.r).toBeLessThan(40); // colonne de droite contre le bord droit, à l'échelle de la fenêtre
  expect(droite.w).toBeGreaterThan(400); // 220 de la maquette × une unité d'environ 2,1
  // Gouttes allongées (fin de l'animation e8-coulure) sur chaque écran, Inventaire compris.
  const allongees = async (sec) => {
    await page.waitForTimeout(1500);
    return page.locator(`${sec} .menu-coulure-flux`).evaluateAll((ns) => ns.map((n) => new DOMMatrix(getComputedStyle(n).transform).f));
  };
  expect(await allongees('#menu-ecran-personnage')).toEqual([0, 0, 0]);
  await page.locator('#menu-perso-inventaire').click();
  expect(await allongees('#menu-ecran-inventaire')).toEqual([0, 0, 0]);
  const s = await etatSous(page, 'inventaire');
  expect([s.pages, s.visibles.length, s.parPage >= 18]).toEqual([1, 16, true]);
  await expect(page.locator('#menu-inventaire-grille li')).toHaveCount(16);
  await expect(page.locator('#menu-inventaire-page')).toHaveText('Page 1 / 1 · trié par rareté');
  const grille = await boite(page, '#menu-inventaire-grille');
  const pied = await boite(page, '.e9-pagination');
  expect(pied.t).toBeGreaterThanOrEqual(grille.b - 0.5);
  for (const [o, sec] of [['#menu-perso-fusion', '#menu-ecran-fusion'], ['#menu-perso-silhouette', '#menu-ecran-personnages']]) {
    await page.keyboard.press('Escape');
    await page.locator(o).click();
    expect(await allongees(sec), sec).toEqual([0, 0, 0]);
  }
});

// Retours du propriétaire (PC) : personnage centré verticalement ; filigrane de l'écran dans chaque sous-menu (à la place des filets des maquettes).
test('PC 2000 × 1060 : personnage, cône, sol et capacité centrés verticalement ; filigrane de chaque sous-menu entre les deux blocs, derrière le contenu', async ({ page }) => {
  const size = { width: 2000, height: 1060 };
  await ouvrirPersonnage(page, size);
  const contenu = await boite(page, '#menu-contenu');
  const perso = await boite(page, '#menu-perso-silhouette');
  const cap = await boite(page, '#menu-perso-capacite');
  // Bloc personnage + capacité au milieu de la zone de contenu (à 4 % près de sa hauteur) ; avant le retour, collé en haut.
  const milieu = (perso.t + cap.b) / 2;
  expect(Math.abs(milieu - (contenu.t + contenu.b) / 2)).toBeLessThan(contenu.h * 0.04);
  const sol = await boite(page, '.e9-sol');
  expect(sol.t).toBeGreaterThan(perso.t);
  expect(sol.t).toBeLessThan(perso.b); // le personnage se tient sur le sol
  for (const [o, sec, g, d] of [['#menu-perso-inventaire', 'inventaire', '#menu-inventaire-grille', '#menu-inventaire-detail'], ['#menu-perso-fusion', 'fusion', '#menu-fusion-atelier', '#menu-fusion-compatibles'], ['#menu-perso-silhouette', 'personnages', '#menu-personnages-grille', '#menu-personnages-fiche']]) {
    await page.locator(o).click();
    const f = page.locator(`#menu-ecran-${sec} .e9-filigrane`);
    await expect(f).toHaveCount(1);
    await expect(f).toHaveAttribute('aria-hidden', 'true');
    expect(await f.evaluate((n) => getComputedStyle(n).zIndex)).toBe('-1');
    const b = await boite(page, `#menu-ecran-${sec} .e9-filigrane`);
    const [bg, bd] = [await boite(page, g), await boite(page, d)];
    const c = (b.l + b.r) / 2;
    expect([c > bg.r - 0.5, c < bd.l + 0.5], sec).toEqual([true, true]); // centré entre la colonne de gauche et le panneau
    await page.keyboard.press('Escape');
  }
});

// Retours du propriétaire : barre d'onglets dans les sous-menus (un onglet touché les referme) ; « Touche-le pour changer » au-dessus de la lampe ;
// menu à trois barres plus étroit et détaché (bord, ombre, icônes).
test('un onglet touché referme le sous-menu du Personnage ; l\'onglet Personnage revient à l\'écran Personnage', async ({ page }) => {
  await ouvrirPersonnage(page);
  await page.locator('#menu-perso-fusion').click();
  await expect(page.locator('#menu-ecran-fusion')).toBeVisible();
  await page.locator('#menu-onglet-infini').click();
  await expect(page.locator('#menu-ecran-infini')).toBeVisible();
  await expect(page.locator('#menu-ecran-fusion')).toBeHidden();
  expect((await page.evaluate(() => window.__zsMenu.etat().menu)).ecran).toBeNull();
  await page.locator('#menu-onglet-personnage').click();
  await expect(page.locator('#menu-ecran-personnage')).toBeVisible();
  await page.locator('#menu-perso-inventaire').click();
  await page.locator('#menu-onglet-personnage').click();
  await expect(page.locator('#menu-ecran-inventaire')).toBeHidden();
  await expect(page.locator('#menu-ecran-personnage')).toBeVisible();
  await expect(page.locator('.e8-onglets button')).toHaveText(['Boutique', 'Personnage', 'Histoire', 'Infini', 'Prochainement']);
});

test('PC 2000 × 1060 : « Touche-le pour changer » centré au-dessus de la lampe ; menu à trois barres de 300 px au plus, bordé, ombré, avec icônes', async ({ page }) => {
  await ouvrirPersonnage(page, { width: 2000, height: 1060 });
  const etiquette = await boite(page, '.e9-etiquette');
  const lampe = await boite(page, '.e9-lampe');
  expect(etiquette.b).toBeLessThanOrEqual(lampe.t + 0.5);
  // Retour du propriétaire : centrée dans la zone grise (du haut de l'écran Personnage au haut de la lampe).
  const ecran = await boite(page, '#menu-ecran-personnage');
  expect(Math.abs((etiquette.t + etiquette.b) / 2 - (ecran.t + lampe.t) / 2)).toBeLessThanOrEqual(2);
  await expect(page.locator('#menu-perso-silhouette')).toHaveAccessibleName('Touche-le pour changer de personnage ou l\'améliorer');
  await page.locator('#menu-trois-barres').click();
  const liste = await boite(page, '#menu-liste');
  expect(liste.w).toBeLessThanOrEqual(300.5);
  const style = await page.locator('#menu-liste').evaluate((n) => { const c = getComputedStyle(n); return [c.borderTopWidth, c.borderTopLeftRadius, c.boxShadow !== 'none', c.backgroundColor !== getComputedStyle(document.querySelector('#menu-ecran-personnage')).backgroundColor]; });
  expect(style).toEqual(['2px', '6px', true, true]);
  await expect(page.locator('#menu-liste .e8-icone-entree')).toHaveCount(4);
  // Retour du propriétaire : logo de Discord (forme pleine) à la place de la bulle.
  expect(await page.locator('#menu-discord .e8-icone-entree').evaluate((n) => [n.getAttribute('viewBox'), n.classList.contains('e8-icone-logo'), getComputedStyle(n).fill !== 'none'])).toEqual(['0 0 24 24', true, true]);
});

// Retours du propriétaire : route de l'onglet Histoire sous le bâtiment, vers le bouton « JOUER » ; tête du personnage qui pivote au cou.
test('route de l\'onglet Histoire : ne touche pas le bâtiment (bord haut sous son pied), finit vers le bouton « JOUER » ; tête et bras pivotent au cou et à l\'épaule', async ({ page }) => {
  await ouvrirMenu(page);
  const r = await page.locator('#menu-jouer-scene .e8-jouer-route').evaluate((p) => {
    const n = p.getTotalLength();
    const demi = parseFloat(getComputedStyle(p).strokeWidth) / 2;
    let hautSousBatiment = Infinity;
    for (let i = 0; i <= 200; i += 1) {
      const q = p.getPointAtLength((n * i) / 200);
      if (q.x >= 258 && q.x <= 700) hautSousBatiment = Math.min(hautSousBatiment, q.y - demi);
    }
    const fin = p.getPointAtLength(n);
    return { hautSousBatiment, fin: [fin.x, fin.y] };
  });
  expect(r.hautSousBatiment).toBeGreaterThan(286); // pied du bâtiment (aile et salle) : y 286 de la maquette
  expect(r.fin[0]).toBeGreaterThan(640); // vers le bouton « JOUER » (x 674 de la maquette)
  expect(r.fin[1]).toBeGreaterThan(300);
  await page.locator('#menu-onglet-personnage').click();
  await expect(page.locator('#menu-perso-silhouette .e9-sil-tete')).toHaveCount(1);
  const origines = await page.evaluate(() => ['.e9-sil-tete', '.e9-sil-viser'].map((s) => { const c = getComputedStyle(document.querySelector(`#menu-perso-silhouette ${s}`)); return [c.transformBox, c.transformOrigin]; }));
  expect(origines).toEqual([['view-box', '90px 72px'], ['view-box', '122px 86px']]);
});
