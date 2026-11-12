// Lot 8e : onglet Boutique (E3-1, maquette Docs/maquettes-v0.8/Caisses.html ; Docs/ref/menu-principal.md), chargé à la demande au premier affichage
// de l'onglet, avec data/menu/caisses.json, data/menu/cosmetiques.json, js/core/caisses.js et l'équipement du lot 8d (equipement-etat.js).
// Retours du propriétaire : écran qui défile, par rubriques (petit menu à gauche pour y aller vite) : offres du jour (six objets, renouvelés à minuit,
// heure de l'appareil), caisses d'équipement, caisses de personnages, cosmétiques (tenues d'exemple, pas encore portables). Caisse mystère dessinée en
// SVG (bois, planches, coins rivetés, couvercle, grand « ? » lumineux et deux petits de la teinte de la caisse, rayons ; animations e3-* : flotte,
// « ? » qui pulse, tremblement bref toutes les 4 s, en décalé ; en pause hors de l'écran et page cachée, coupées sous prefers-reduced-motion).
// Achat : tirage à graine (crypto.getRandomValues), éléments ajoutés à l'état en mémoire (inventaire, personnages, collection de tenues), puis
// afficherOuverture(resultat) → écran de résultat (E3-4, E3-5 : js/menu/resultat.js). Le prix est affiché, jamais prélevé ; rien n'est écrit.
// Lot 8f : afficherOuverture passe d'abord par l'ouverture animée en 3D (js/menu/ouverture/ouverture.js, chargée au premier achat d'une caisse,
// préchargée au toucher de « Ouvrir »), sauf offre du jour, mouvement réduit, WebGL indisponible ou ?ouverture=0 en test : résultat direct.
import { creerRoue } from './roue.js';
import { formatMoney } from '../core/economy.js';
import { TIRAGES_X10, ajouterCosmetiques, lireCaisses, lireCosmetiques, lireOffres, offresDuJour, partHaute, prixAchat, tirer, tirer10 } from '../core/caisses.js';
import { ajouterObjets, estDebloque, obtenirPersonnages } from '../core/equipement.js';
import { fmt } from '../game/texts.js';
import { el } from './menu.js';
import { chargerEquipement } from './equipement-etat.js';
import { icone24 } from './personnage.js';
import { acces } from '../core/graphics.js';
import { pageCanal, pageSearch } from '../game/graphics-boot.js';

const SVG = 'http://www.w3.org/2000/svg';
const json = (path) => fetch(path).then((r) => (r.ok ? r.json() : null)).catch(() => null);
const forme = (tag, attrs, classe) => {
  const n = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, String(v));
  if (classe) n.setAttribute('class', classe);
  return n;
};
const groupe = (classe, ...enfants) => {
  const g = forme('g', {}, classe);
  g.append(...enfants);
  return g;
};
const point = (x, y, classe, texte) => {
  const n = forme('text', { x, y, 'text-anchor': 'middle' }, classe);
  n.textContent = texte;
  return n;
};

// Décalage des animations d'une carte à l'autre (maquette : 0, −1,3 s, −2,6 s).
export const DECALAGES = Object.freeze([0, -1.3, -2.6]);
// Rubriques de la Boutique, dans l'ordre de l'écran (petit menu de gauche).
export const RUBRIQUES = Object.freeze(['offres', 'equipement', 'personnage', 'cosmetique']);
const RUBRIQUE_TEXTES = { offres: 'game.menu.boutique.rubrique.offres', equipement: 'game.menu.boutique.rubrique.equipement', personnage: 'game.menu.boutique.rubrique.personnage', cosmetique: 'game.menu.boutique.rubrique.cosmetique' };

// Caisse mystère (maquette : 150 × 96, rayons au-dessus jusqu'à −10) ; décorative. Couleurs en jetons (css/menu.css), teinte : --e3-teinte.
// Retour du propriétaire : un dessin par genre de caisse (modele de data/menu/caisses.json) : bois (ravitaillement : planches, coins rivetés), militaire
// (caisse à munitions en métal : nervures, loquets, poignées), elite (coffre bombé cerclé de la teinte, coins et serrure), recrues (malle et plaques
// d'identité ; aussi veterans, legendes), tenues (valise à sangles et coins protégés ; aussi mode, couture) ; grand « ? » lumineux au milieu de la
// face (remonté, puis réduit : retours du propriétaire), deux petits.
const RIVETS = [[18, 44], [132, 44], [18, 84], [132, 84]];
const DESSINS = {
  bois: () => [
    forme('rect', { x: 10, y: 34, width: 130, height: 58 }, 'e3-bois'),
    forme('path', { d: 'M10 52 H140 M10 72 H140' }, 'e3-joint'),
    forme('rect', { x: 6, y: 24, width: 138, height: 14 }, 'e3-couvercle'),
    forme('rect', { x: 8, y: 36, width: 134, height: 3 }, 'e3-bande'),
    ...RIVETS.map(([cx, cy]) => forme('circle', { cx, cy, r: 2 }, 'e3-rivet')),
  ],
  militaire: () => [
    forme('path', { d: 'M12 54 h-6 v16 h6 M138 54 h6 v16 h-6' }, 'e3-poignee'),
    forme('rect', { x: 12, y: 36, width: 126, height: 56, rx: 3 }, 'e3-metal'),
    forme('path', { d: 'M28 40 V88 M122 40 V88' }, 'e3-metal-arete'),
    forme('rect', { x: 12, y: 82, width: 126, height: 5 }, 'e3-bande'),
    forme('path', { d: 'M58 26 V19 H92 V26' }, 'e3-poignee'),
    forme('rect', { x: 8, y: 25, width: 134, height: 13, rx: 2 }, 'e3-metal-couvercle'),
    forme('rect', { x: 20, y: 33, width: 11, height: 11, rx: 1 }, 'e3-loquet'),
    forme('rect', { x: 119, y: 33, width: 11, height: 11, rx: 1 }, 'e3-loquet'),
  ],
  elite: () => [
    forme('rect', { x: 14, y: 44, width: 122, height: 48 }, 'e3-coffre'),
    forme('path', { d: 'M10 46 Q10 21 75 19 Q140 21 140 46 Z' }, 'e3-coffre-couvercle'),
    forme('path', { d: 'M40 21 V92 M110 21 V92 M10 46 H140' }, 'e3-cercle'),
    forme('path', { d: 'M14 92 V80 H26 V92 Z M136 92 V80 H124 V92 Z' }, 'e3-coin-or'),
    forme('rect', { x: 68, y: 39, width: 14, height: 13, rx: 2 }, 'e3-coin-or'),
  ],
  malle: () => [
    forme('rect', { x: 12, y: 36, width: 126, height: 56, rx: 2 }, 'e3-malle'),
    forme('path', { d: 'M12 50 H138 M12 82 H138' }, 'e3-malle-bande'),
    forme('rect', { x: 8, y: 26, width: 134, height: 12, rx: 2 }, 'e3-malle-couvercle'),
    forme('rect', { x: 10, y: 37, width: 130, height: 3 }, 'e3-bande'),
    forme('path', { d: 'M121 30 Q127 44 120 54 M125 30 Q133 46 129 58' }, 'e3-chaine'),
    forme('rect', { x: 114, y: 52, width: 11, height: 16, rx: 4, transform: 'rotate(-12 119 60)' }, 'e3-plaque'),
    forme('rect', { x: 124, y: 56, width: 11, height: 16, rx: 4, transform: 'rotate(10 129 64)' }, 'e3-plaque'),
  ],
  valise: () => [
    forme('path', { d: 'M58 34 V25 Q75 18 92 25 V34' }, 'e3-anse'),
    forme('rect', { x: 12, y: 34, width: 126, height: 58, rx: 9 }, 'e3-valise'),
    forme('rect', { x: 12, y: 62, width: 126, height: 4 }, 'e3-bande'),
    forme('rect', { x: 38, y: 34, width: 9, height: 58 }, 'e3-sangle'),
    forme('rect', { x: 103, y: 34, width: 9, height: 58 }, 'e3-sangle'),
    forme('rect', { x: 36, y: 70, width: 13, height: 9, rx: 1 }, 'e3-boucle'),
    forme('rect', { x: 101, y: 70, width: 13, height: 9, rx: 1 }, 'e3-boucle'),
    forme('path', { d: 'M12 46 V43 Q12 34 21 34 H24 M138 46 V43 Q138 34 129 34 H126 M12 80 V83 Q12 92 21 92 H24 M138 80 V83 Q138 92 129 92 H126' }, 'e3-coin-valise'),
  ],
};
// Places des « ? » par dessin : grand (y de la ligne de base), petits (x, x, y).
const POINTS = { bois: [70, 34, 116, 62], militaire: [70, 44, 106, 64], elite: [75, 26, 124, 72], malle: [70, 36, 98, 64], valise: [72, 25, 125, 58] };
// Retour du propriétaire : trois caisses de personnages et trois de tenues ; même forme (malle, valise) dans d'autres couleurs (css/menu.css).
const FORMES = { bois: 'bois', militaire: 'militaire', elite: 'elite', recrues: 'malle', veterans: 'malle', legendes: 'malle', tenues: 'valise', mode: 'valise', couture: 'valise' };
export function caisseSvg(modele = 'bois') {
  const m = FORMES[modele] ? modele : 'bois';
  const f = FORMES[m];
  const [y, x1, x2, y2] = POINTS[f];
  const svg = forme('svg', { viewBox: '0 -10 150 106', 'aria-hidden': 'true', focusable: 'false', preserveAspectRatio: 'xMidYMax meet', 'data-modele': m }, `e3-caisse e3-caisse-${m}`);
  svg.append(
    groupe('e3-rayons', forme('path', { d: 'M40 30 L20 -6 L55 -6 Z M75 30 L66 -10 L84 -10 Z M110 30 L95 -6 L130 -6 Z' })),
    groupe('e3-tremble', groupe('e3-flotte',
      ...DESSINS[f](),
      // Grand « ? » lumineux : un halo de la teinte (trait large et transparent, sans filtre) sous le « ? » clair ; il pulse (e3-lueur).
      groupe('e3-lueur', point(75, y, 'e3-q e3-q-halo', '?'), point(75, y, 'e3-q', '?')),
      point(x1, y2, 'e3-q e3-q-petit', '?'),
      point(x2, y2, 'e3-q e3-q-petit', '?'))));
  return svg;
}

// Fond de l'écran (maquette : filets, une fissure, taches de sang sombres), décoratif.
function fond() {
  const svg = forme('svg', { viewBox: '0 0 932 368', 'aria-hidden': 'true', focusable: 'false', preserveAspectRatio: 'xMaxYMin slice' }, 'e3-fond');
  svg.append(
    forme('path', { d: 'M0 120 H932 M0 240 H932 M310 0 V120 M620 120 V240 M150 240 V368 M780 0 V120' }, 'e3-filet'),
    forme('path', { d: 'M700 40 L720 70 L712 96 L730 120' }, 'e3-fissure'),
    ...[[860, 70, 16], [884, 96, 6], [838, 98, 4], [872, 44, 3]].map(([cx, cy, r]) => forme('circle', { cx, cy, r }, 'e3-tache')));
  return svg;
}

// Teinte d'une caisse ou rareté d'un objet : jeton de tokens.css validé par js/core/caisses.js ou equipement.js (jamais une couleur écrite ici).
export function poserJeton(n, variable, jeton) {
  if (typeof jeton === 'string' && /^--(menu|rarete)-[a-z0-9-]+$/.test(jeton)) n.style.setProperty(variable, `var(${jeton})`);
}

const graineAchat = () => crypto.getRandomValues(new Uint32Array(1))[0];
// Lot 8f : ouverture animée voulue (sans charger son module) : ni mouvement réduit, ni ?ouverture=0 sous ?test=1 pris en compte.
function ouvertureVoulue() {
  if (globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return false;
  const q = new URLSearchParams(pageSearch());
  return !(acces(pageCanal(), q).test && q.get('ouverture') === '0');
}
let moduleOuverture = null;
const chargerOuverture = () => (moduleOuverture ??= import('./ouverture/ouverture.js').catch(() => {
  moduleOuverture = null;
  return null;
}));
// Préchargement au toucher de « Ouvrir » : module, Three.js, scène, données et feuille de l'ouverture (jamais au démarrage du menu).
const prechargerOuverture = () => {
  if (ouvertureVoulue()) chargerOuverture().then((m) => m?.precharger().catch(() => {}));
};
const pourcentTexte = (n) => (Number.isFinite(n) ? n.toLocaleString('fr-FR', { maximumFractionDigits: 2 }) : '');
// Numéro du jour local (offres du jour : renouvelées à minuit, heure de l'appareil) et temps restant jusqu'à minuit.
export const jourLocal = (d) => Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86_400_000);
export const avantMinuit = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).getTime() - d.getTime();

// contexte : { t, bandeau, root (#menu-contenu : section du résultat), rootDialogue (#e8 : dialogue des chances), surVue() (menu.js resynchronise),
// maintenant() (date de l'appareil ; les tests la fixent par l'horloge du navigateur) }.
// Retour du propriétaire (latence au premier toucher sur iPhone) : données demandées dès que le doigt se pose sur l'onglet (menu.js, precharger).
let chargement = null;
export const precharger = () => (chargement ??= Promise.all([chargerEquipement(), json('data/menu/caisses.json'), json('data/menu/cosmetiques.json')]));

export async function ecranBoutique({ t, bandeau, root, rootDialogue, surVue = () => {}, maintenant = () => new Date() }) {
  const [eq, donnees, cosm] = await precharger();
  const cat = { ...eq.cat, cosmetiques: lireCosmetiques(cosm, eq.cat.raretes) };
  const { caisses } = lireCaisses(donnees, cat);
  const { regles } = lireOffres(donnees, cat);
  const nomRarete = (rid) => cat.raretes.find((r) => r.id === rid)?.nom ?? '';
  const jetonRarete = (rid) => cat.raretes.find((r) => r.id === rid)?.jeton;
  let collection = Object.freeze({}); // tenues obtenues (mémoire de la page jusqu'au lot 8h)

  const section = el('section', ['e8-ecran', 'e3', 'e3-boutique'], { id: 'menu-ecran-boutique', 'aria-labelledby': 'menu-titre-boutique', 'data-block': 'E3-1', 'data-anim': 'off' });
  // Petit menu des rubriques, sous le bandeau, à gauche ; le contenu défile à droite.
  const nav = el('nav', ['e3-rubriques'], { id: 'menu-boutique-rubriques', 'aria-label': t('game.menu.boutique.rubriques') });
  const navListe = el('ul');
  nav.append(navListe);
  const defile = el('div', ['e3-defile'], { id: 'menu-boutique-defile', tabindex: '0', role: 'region', 'aria-label': t('game.menu.boutique.contenu') });
  const rayons = new Map(); // rubrique → { section, bouton }
  const boutons = new Map(); // id de caisse → { un, dix, chances }

  function rayon(id, extra = []) {
    const s = el('section', ['e3-rayon'], { id: `menu-boutique-${id}`, 'aria-labelledby': `menu-boutique-${id}-titre`, 'data-rubrique': id });
    const tete = el('div', ['e3-rayon-tete']);
    const h = el('h3', ['e3-rayon-titre'], { id: `menu-boutique-${id}-titre` });
    h.textContent = t(RUBRIQUE_TEXTES[id]);
    tete.append(h, ...extra);
    s.append(tete);
    const b = el('button', ['e3-rubrique'], { type: 'button', id: `menu-boutique-aller-${id}`, 'aria-controls': `menu-boutique-${id}` });
    b.append(Object.assign(el('span', ['e3-rubrique-nom']), { textContent: t(RUBRIQUE_TEXTES[id]) }));
    b.addEventListener('click', () => aller(id));
    const li = el('li');
    li.append(b);
    navListe.append(li);
    rayons.set(id, { section: s, bouton: b });
    defile.append(s);
    return s;
  }

  // --- Offres du jour ----------------------------------------------------------------------------------------------------------------------------
  const compte = el('p', ['e3-compte'], { id: 'menu-boutique-compte' });
  const offresListe = el('ul', ['e3-offres'], { id: 'menu-boutique-offres-liste', 'aria-labelledby': 'menu-boutique-offres-titre' });
  rayon('offres', [compte]).append(offresListe);
  let jour = null;
  let offres = [];
  const achetees = new Set();
  function rendreOffres() {
    const d = maintenant();
    const j = jourLocal(d);
    if (j !== jour) {
      jour = j;
      offres = offresDuJour(regles, cat, j);
      achetees.clear();
      offresListe.replaceChildren(...offres.map((o, i) => {
        const def = cat.objets.get(o.id);
        const li = el('li', ['e3-offre'], { 'data-rarete': o.rarete, 'data-objet': o.id, id: `menu-offre-${i}` });
        poserJeton(li, '--e3-rarete', jetonRarete(o.rarete));
        const ico = el('span', ['e3-offre-icone']);
        ico.append(icone24(def?.type ?? 'accessoire', 'e9-icone e3-offre-svg'));
        const nom = el('span', ['e3-offre-nom'], { id: `menu-offre-${i}-nom` });
        nom.textContent = def?.nom ?? o.id;
        const rar = el('span', ['e3-offre-rarete']);
        rar.textContent = nomRarete(o.rarete);
        const b = el('button', ['e3-action', 'e3-rouge', 'e3-offre-acheter'], { type: 'button', id: `menu-offre-${i}-acheter`, 'aria-describedby': `menu-offre-${i}-nom` });
        b.textContent = fmt(t('game.menu.boutique.offre.acheter'), { prix: formatMoney(o.prix) });
        b.addEventListener('click', () => acheterOffre(i, b));
        li.append(ico, nom, rar, b);
        return li;
      }));
    }
    const ms = avantMinuit(d);
    compte.textContent = fmt(t('game.menu.boutique.offres.compte'), { h: Math.floor(ms / 3_600_000), m: Math.floor((ms % 3_600_000) / 60_000) });
  }
  function acheterOffre(i, bouton) {
    const o = offres[i];
    if (!o || achetees.has(o.cle)) return;
    const objet = { id: o.id, rarete: o.rarete, niveau: 1 };
    const { etat, uids } = ajouterObjets(eq.etat(), cat, [objet]);
    if (uids.length !== 1) return;
    eq.poser(etat);
    achetees.add(o.cle);
    bouton.textContent = t('game.menu.boutique.offre.achetee');
    bouton.setAttribute('aria-disabled', 'true');
    bouton.closest('li')?.classList.add('is-achetee');
    achats += 1;
    retourFocus = bouton;
    afficherOuverture({ type: 'offre', caisse: null, quantite: 1, objets: [objet], uids, prix: o.prix, graine: null });
  }

  // --- Caisses --------------------------------------------------------------------------------------------------------------------------------
  function contenuCaisse(c) {
    const contenu = el('p', ['e3-carte-contenu'], { id: `menu-caisse-${c.id}-contenu` });
    const resume = el('span', ['e3-carte-resume']);
    const raretes = el('span', ['e3-carte-raretes']);
    if (c.type === 'personnage') {
      // Retour du propriétaire (trois caisses de personnages) : ce qui change d'une caisse à l'autre, c'est la chance d'un personnage nouveau
      // (encore verrouillé) ; recalculée après chaque achat (un personnage obtenu ne compte plus).
      resume.textContent = t('game.menu.boutique.contenu.personnage');
      const rendre = () => {
        const etat = eq.etat();
        const n = c.chances.filter((x) => !estDebloque(etat, cat.personnages.find((p) => p.id === x.personnage))).reduce((s2, x) => s2 + x.pourcent, 0);
        raretes.textContent = n > 0 ? fmt(t('game.menu.boutique.contenu.nouveau'), { n: pourcentTexte(Math.round(n * 100) / 100) }) : t('game.menu.boutique.contenu.nouveau.aucun');
      };
      rendre();
      eq.abonner(rendre);
      contenu.append(resume, raretes);
      return contenu;
    }
    // Retour du propriétaire : toutes les raretés dans chaque caisse ; ce qui change, c'est la part des plus rares (« Épique ou mieux : 4 % »),
    // et la barre de répartition (décorative : les pour cent exacts sont dans « Voir les chances »).
    resume.textContent = fmt(t('game.menu.boutique.contenu.toutes'), { quoi: t(c.type === 'cosmetique' ? 'game.menu.boutique.quoi.tenue' : 'game.menu.boutique.quoi.objet') });
    const h = partHaute(c, cat);
    raretes.textContent = fmt(t('game.menu.boutique.contenu.haute'), { rarete: nomRarete(h.rarete), n: pourcentTexte(h.pourcent) });
    const barre = el('span', ['e3-repartition'], { 'aria-hidden': 'true' });
    for (const x of c.chances) {
      const seg = el('span', ['e3-repartition-part'], { 'data-rarete': x.rarete });
      poserJeton(seg, '--e3-rarete', jetonRarete(x.rarete));
      seg.style.flexGrow = String(x.pourcent);
      barre.append(seg);
    }
    contenu.append(resume, barre, raretes);
    return contenu;
  }
  function carteCaisse(c, i) {
    const li = el('li', ['e3-carte'], { 'data-caisse': c.id, 'data-type': c.type, 'aria-labelledby': `menu-caisse-${c.id}-nom` });
    poserJeton(li, '--e3-teinte', c.teinte);
    li.style.setProperty('--e3-decalage', `${DECALAGES[i % DECALAGES.length]}s`);
    const nom = el('h4', ['e3-carte-nom'], { id: `menu-caisse-${c.id}-nom` });
    nom.textContent = c.nom;
    const actions = el('div', ['e3-carte-actions']);
    const bouton = (quantite, classes, cle) => {
      const prix = formatMoney(prixAchat(c, quantite));
      // Nom accessible = texte visible (« Ouvrir ×1 · prix : 150 ») ; la caisse en description (son nom, titre de la carte).
      const n = el('button', ['e3-ouvrir', ...classes], { type: 'button', id: `menu-caisse-${c.id}-${quantite === 1 ? 'un' : 'dix'}`, 'aria-describedby': `menu-caisse-${c.id}-nom` });
      const action = el('span', ['e3-ouvrir-action']);
      action.textContent = t(cle);
      const sep = el('span', ['sr-only']);
      sep.textContent = t('game.menu.boutique.prix.sep');
      const p = el('span', ['e3-ouvrir-prix']);
      p.textContent = prix;
      n.append(action, sep, p);
      n.addEventListener('click', () => acheter(c, quantite, n));
      n.addEventListener('pointerdown', prechargerOuverture, { passive: true }); // lot 8f
      return n;
    };
    const un = bouton(1, ['e3-rouge'], 'game.menu.boutique.ouvrir1');
    const dix = bouton(TIRAGES_X10, ['e3-planche'], 'game.menu.boutique.ouvrir10');
    actions.append(un, dix);
    // « Voir les chances » (retour du propriétaire : bouton stylisé) : pastille sombre bordée de la teinte, icône de pourcentage, libellé.
    const lien = el('button', ['e3-lien'], { type: 'button', id: `menu-caisse-${c.id}-chances`, 'aria-haspopup': 'dialog', 'aria-describedby': `menu-caisse-${c.id}-nom` });
    const pc = forme('svg', { viewBox: '0 0 16 16', 'aria-hidden': 'true', focusable: 'false' }, 'e3-lien-icone');
    pc.append(forme('path', { d: 'M3.5 12.5l9-9' }), forme('circle', { cx: 4.5, cy: 4.5, r: 2 }), forme('circle', { cx: 11.5, cy: 11.5, r: 2 }));
    lien.append(pc, Object.assign(el('span', ['e3-lien-nom']), { textContent: t('game.menu.boutique.chances') }));
    lien.addEventListener('click', () => ouvrirChances(c, lien));
    li.append(el('span', ['e3-carte-bande'], { 'aria-hidden': 'true' }), caisseSvg(c.modele), nom, contenuCaisse(c), actions, lien);
    boutons.set(c.id, { un, dix, chances: lien });
    return li;
  }
  const noteTenues = el('p', ['e3-rayon-note'], { id: 'menu-boutique-tenues-note' });
  for (const type of ['equipement', 'personnage', 'cosmetique']) {
    const liste = el('ul', ['e3-cartes'], { id: `menu-boutique-${type}-caisses`, 'aria-labelledby': `menu-boutique-${type}-titre` });
    caisses.filter((c) => c.type === type).forEach((c, i) => liste.append(carteCaisse(c, i)));
    rayon(type, type === 'cosmetique' ? [noteTenues] : []).append(liste);
  }
  const rendreNoteTenues = () => {
    noteTenues.textContent = fmt(t('game.menu.boutique.tenues.note'), { n: Object.keys(collection).length, total: cat.cosmetiques.length });
  };
  rendreNoteTenues();
  section.append(fond(), bandeau(t('game.menu.boutique.libelle'), t('game.menu.boutique.titre'), 'menu-titre-boutique'), nav, defile);

  // --- Rubriques : aller à une rubrique, rubrique courante selon le défilement ----------------------------------------------------------------
  let courante = RUBRIQUES[0];
  function marquer(id) {
    courante = id;
    for (const [k, { bouton }] of rayons) {
      if (k === id) bouton.setAttribute('aria-current', 'true');
      else bouton.removeAttribute('aria-current');
    }
  }
  function aller(id) {
    const r = rayons.get(id);
    if (!r) return;
    const doux = !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    defile.scrollTo({ top: r.section.offsetTop, behavior: doux ? 'smooth' : 'auto' }); // la zone qui défile est le parent positionné des sections
    marquer(id);
  }
  defile.addEventListener('scroll', () => {
    const haut = defile.scrollTop + 8;
    let id = RUBRIQUES[0];
    for (const [k, { section: s }] of rayons) if (s.offsetTop <= haut) id = k;
    if (defile.scrollTop + defile.clientHeight >= defile.scrollHeight - 2) id = RUBRIQUES.at(-1);
    if (id !== courante) marquer(id);
  }, { passive: true });
  marquer(RUBRIQUES[0]);

  // --- Achat, ouverture, résultat --------------------------------------------------------------------------------------------------------------
  let vue = 'caisses'; // 'caisses', 'ouverture' (lot 8f) ou 'resultat'
  let resultat = null; // écran de résultat (js/menu/resultat.js, créé au premier achat)
  let dernier = null; // dernier résultat affiché
  let retourFocus = null;
  let visible = false;
  let actif = false;
  let chancesOuvertes = null; // dialogue des chances : { fermer() }
  let achats = 0;
  let minuterie = null;
  let ouverture = null; // lot 8f : ouverture en 3D en cours ({ section, liberer(), focus() })
  let preparation = false; // lot 8f : chargement de l'ouverture (Three.js, scène) en cours
  let gel = null; // lot 8f : menu figé pendant le chargement et l'ouverture ({ roue(), fin() })

  // Lot 8f (retour du propriétaire) : « Ouvrir » touché pendant le chargement de l'ouverture : les commandes de l'écran sont figées (inert : ni
  // toucher ni clavier) et une petite roue tourne au centre (styles en ligne et jetons : css/ouvertures.css n'est peut-être pas encore chargée) ;
  // la roue part quand l'ouverture est prête, le menu reste figé derrière elle jusqu'à sa fin.
  function geler() {
    const figes = [...rootDialogue.children].filter((n) => !n.inert);
    for (const n of figes) n.inert = true;
    const roue = creerRoue(rootDialogue, { fixe: true, id: 'menu-ouverture-chargement', texte: t('game.menu.ouverture.chargement') });
    return {
      roue() {
        roue.retirer();
      },
      fin() {
        this.roue();
        for (const n of figes) n.inert = false;
      },
    };
  }

  // Tirage (graine du navigateur), éléments ajoutés à l'état en mémoire, puis l'ouverture. Prix jamais prélevé.
  function acheter(caisse, quantite, depuis) {
    if (preparation) return; // lot 8f : ouverture en cours de chargement (un seul achat à la fois)
    const graine = graineAchat();
    const objets = quantite === TIRAGES_X10 ? tirer10(caisse, cat, graine) : [tirer(caisse, cat, graine)].filter(Boolean);
    if (!objets || objets.length !== quantite) return;
    const r = { type: caisse.type, caisse, quantite, objets, uids: [], graine };
    if (caisse.type === 'personnage') {
      const { etat, issues } = obtenirPersonnages(eq.etat(), cat, objets.map((o) => o.id));
      if (issues.length !== quantite) return;
      eq.poser(etat);
      r.issues = issues;
    } else if (caisse.type === 'cosmetique') {
      const a = ajouterCosmetiques(collection, cat, objets.map((o) => o.id));
      if (a.nouveaux.length !== quantite) return;
      collection = a.collection;
      r.nouveaux = a.nouveaux;
      r.collection = { ...collection };
      rendreNoteTenues();
    } else {
      const { etat, uids } = ajouterObjets(eq.etat(), cat, objets);
      if (uids.length !== quantite) return;
      eq.poser(etat);
      r.uids = uids;
    }
    achats += 1;
    if (vue === 'caisses') retourFocus = depuis;
    afficherOuverture(r);
  }

  // Seule fonction appelée après un achat. Lot 8e : écran de résultat (plein écran : barre d'onglets masquée, retour du propriétaire). Lot 8f :
  // l'ouverture animée en 3D (E3-2, E3-3) s'intercale avant (caisses seulement) ; elle reçoit les cartes de l'écran de résultat (mêmes textes, même
  // ordre que le tirage) ; « Passer », Échap et la fin d'un ×10 mènent à ce même écran ; « Continuer » (×1) revient aux caisses, « Rouvrir » rachète.
  async function afficherOuverture(r) {
    dernier = r;
    // Retour du propriétaire (« après la roue, tout l'écran était figé ») : le menu est figé et les achats bloqués dès le toucher, avant toute
    // attente (avant : seulement après le chargement de l'écran de résultat, si bien qu'un second toucher lançait une seconde ouverture en
    // parallèle) ; la roue part et le menu est rendu actif quoi qu'il arrive (erreur comprise).
    const anime = Boolean(r.caisse) && ouvertureVoulue();
    if (anime) {
      preparation = true;
      gel ??= geler();
    }
    let o = null;
    try {
      await preparerResultat();
      if (anime) {
        const m = await chargerOuverture();
        resultat.afficher(r); // cartes et annonce lues dans l'écran de résultat (encore caché)
        o = m ? await m.lancerOuverture({
          r, cat, t, parent: rootDialogue, cartes: cartesDe(r), annonce: resultat.section.querySelector('#menu-resultat-annonce')?.textContent ?? '',
          rappels: {
            fin: () => finOuverture() && montrerResultat(r),
            continuer: () => finOuverture() && retourCaisses(),
            rouvrir: () => finOuverture() && acheter(r.caisse, r.quantite, null),
          },
        }) : null;
      }
    } catch {
      o = null;
    } finally {
      preparation = false;
      gel?.roue();
    }
    if (o && dernier === r) {
      ouverture = o;
      vue = 'ouverture';
      surVue();
      o.focus();
      return;
    }
    o?.liberer();
    degeler();
    if (resultat) montrerResultat(r);
  }
  function degeler() {
    gel?.fin();
    gel = null;
  }

  // Lot 8f : cartes de l'ouverture = cartes de l'écran de résultat du lot 8e (nom, rareté écrite, détail, jeton de la bordure, halo), dans l'ordre.
  function cartesDe(r) {
    const jeton = (n) => /var\((--[a-z0-9-]+)\)/.exec(n?.style.getPropertyValue('--e3-rarete') ?? '')?.[1] ?? null;
    const s = resultat.section;
    if (r.quantite === TIRAGES_X10) {
      return [...s.querySelectorAll('#menu-resultat-grille > li')].map((li) => ({ objet: li.dataset.objet, nom: li.querySelector('.e3-case-nom')?.textContent ?? '', ligne2: li.querySelector('.e3-case-rarete')?.textContent ?? '', ligne3: '', jeton: jeton(li), halo: li.classList.contains('e3-brille') }));
    }
    const carte = s.querySelector('#menu-resultat-carte');
    return [{ objet: carte?.dataset.objet, nom: s.querySelector('#menu-resultat-nom')?.textContent ?? '', ligne2: s.querySelector('#menu-resultat-rarete')?.textContent ?? '', ligne3: s.querySelector('#menu-resultat-ligne')?.textContent ?? '', jeton: jeton(carte), halo: Boolean(carte?.classList.contains('e3-brille')) }];
  }

  // Lot 8f : fin de l'ouverture (tout est libéré : un seul rendu WebGL à la fois). Renvoie vrai si une ouverture était en cours.
  function finOuverture() {
    if (!ouverture) return false;
    const o = ouverture;
    ouverture = null;
    o.liberer();
    degeler();
    return true;
  }
  function retourCaisses() {
    vue = 'caisses';
    surVue();
    (retourFocus?.isConnected ? retourFocus : boutons.values().next().value?.un)?.focus();
    retourFocus = null;
  }

  async function preparerResultat() {
    if (!resultat) {
      const m = await import('./resultat.js');
      resultat ??= m.creerResultat({
        t, bandeau, cat,
        continuer: () => fermerResultat(true),
        rouvrir: () => dernier?.caisse && acheter(dernier.caisse, dernier.quantite, null),
      });
      resultat.section.hidden = true;
      root.append(resultat.section);
    }
  }

  function montrerResultat(r) {
    dernier = r;
    vue = 'resultat';
    resultat.afficher(r);
    surVue();
    resultat.focus();
  }

  function fermerResultat(focus = false) {
    if (vue !== 'resultat') return false;
    vue = 'caisses';
    surVue();
    if (focus) (retourFocus?.isConnected ? retourFocus : boutons.values().next().value?.un)?.focus();
    retourFocus = null;
    return true;
  }

  async function ouvrirChances(caisse, depuis) {
    if (chancesOuvertes) return;
    const m = await import('./chances.js');
    chancesOuvertes = m.ouvrirChances({
      t, bandeau, cat, caisse, root: rootDialogue,
      fermer: () => {
        chancesOuvertes?.element.remove();
        chancesOuvertes = null;
        if (depuis.isConnected) depuis.focus();
      },
    });
  }

  function appliquer() {
    // Lot 8f : la Boutique n'est plus affichée (autre onglet, écran plein du menu) : l'ouverture s'arrête et tout est libéré.
    if (!visible && ouverture) {
      finOuverture();
      vue = 'resultat';
    }
    section.hidden = !visible || vue !== 'caisses';
    if (resultat) resultat.section.hidden = !visible || vue !== 'resultat';
    const enCours = actif && vue === 'caisses';
    section.dataset.anim = enCours ? 'on' : 'off';
    resultat?.animer(actif && vue === 'resultat');
    // Compte à rebours des offres (et changement de jour) : relu toutes les 20 s, seulement quand la Boutique est affichée et la page visible.
    if (enCours && !minuterie) {
      rendreOffres();
      minuterie = setInterval(rendreOffres, 20_000);
    } else if (!enCours && minuterie) {
      clearInterval(minuterie);
      minuterie = null;
    }
  }
  rendreOffres();

  return {
    section,
    // menu.js : onglet Boutique affiché (sans écran plein ni sous-menu) ; la vue (caisses ou résultat) est tenue ici.
    synchroniser(v) {
      visible = v;
      if (!v) chancesOuvertes?.fermer();
      appliquer();
    },
    // Résultat affiché : écran plein (barre d'onglets masquée par menu.js).
    pleinEcran: () => vue === 'resultat' || vue === 'ouverture',
    // Animations : en cours seulement quand l'onglet est affiché et la page visible.
    animer(a) {
      actif = a;
      appliquer();
    },
    // Un onglet touché (barre visible seulement sur les caisses) : retour aux caisses.
    fermerResultat: () => fermerResultat(false),
    // Échap : dialogue des chances, puis écran de résultat (true : traité).
    echap() {
      // Lot 8f : Échap pendant l'ouverture = « Passer » (résultat).
      if (vue === 'ouverture' && ouverture) {
        if (finOuverture()) montrerResultat(dernier);
        return true;
      }
      if (chancesOuvertes) {
        chancesOuvertes.fermer();
        return true;
      }
      return fermerResultat(true);
    },
    etat: () => ({
      vue,
      rubrique: courante,
      caisses: caisses.map((c) => ({ id: c.id, type: c.type, nom: c.nom, prix: c.prix, prix10: c.prix10, chances: c.chances.map((x) => ({ ...x })) })),
      offres: offres.map((o) => ({ ...o, achetee: achetees.has(o.cle) })),
      jour,
      collection: { ...collection },
      chances: chancesOuvertes ? chancesOuvertes.caisse : null,
      achats,
      dernier: dernier ? { type: dernier.type, caisse: dernier.caisse?.id ?? null, quantite: dernier.quantite, graine: dernier.graine, objets: dernier.objets.map((o) => ({ ...o })), uids: [...dernier.uids], issues: dernier.issues?.map((x) => ({ ...x })) ?? null, nouveaux: dernier.nouveaux ? [...dernier.nouveaux] : null } : null,
      resultat: resultat?.etat() ?? null,
      ouverture: ouverture ? ouverture.etat() : null,
    }),
  };
}

